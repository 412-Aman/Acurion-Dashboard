"""Tests for host/acurion_bridge.py with an in-memory Firebase and fake local services (no network, no key)."""

import base64
import gzip
import hashlib
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import acurion_bridge as bridge_module  # noqa: E402
from acurion_bridge import (MAX_ALERTS, MAX_EDGES_PER_NETWORK, MAX_MEDIUM_ALERTS, MAX_NETWORKS, MAX_TRANSACTIONS, Bridge,  # noqa: E402
                            LocalService, convert_result)

FIXTURE = Path(__file__).parent / "fixtures" / "analyze_result_hi_small_day.json"
SERVER_NOW = 1_800_000_000_000


class FakeDB:
    """The Realtime Database as a nested dict, with server timestamps and multi-path updates."""

    def __init__(self, clock):
        self.tree, self.clock, self.writes = {}, clock, []

    def _resolve(self, value):
        if value == {".sv": "timestamp"}:
            return self.clock()
        if isinstance(value, dict):
            return {k: self._resolve(v) for k, v in value.items() if v is not None}
        return value

    def _parts(self, path):
        return [p for p in path.strip("/").split("/") if p]

    def get(self, path):
        node = self.tree
        for part in self._parts(path):
            if not isinstance(node, dict) or part not in node:
                return None
            node = node[part]
        return json.loads(json.dumps(node))

    def set(self, path, value):
        self.writes.append(("set", path))
        parts = self._parts(path)
        node = self.tree
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        if value is None:
            node.pop(parts[-1], None)
        else:
            node[parts[-1]] = self._resolve(value)

    def update(self, path, values):
        self.writes.append(("update", path))
        for key, value in values.items():
            self.set(f"{path.strip('/')}/{key}" if path.strip("/") else key, value)

    def delete(self, path):
        self.set(path, None)

    def recent_jobs(self, limit=25):
        jobs = self.get("uploadJobs") or {}
        return dict(sorted(jobs.items(), key=lambda kv: kv[1].get("createdAt", 0))[-limit:])


class Clock:
    def __init__(self, start=SERVER_NOW):
        self.value = start

    def __call__(self):
        return self.value


class FakeService(BaseHTTPRequestHandler):
    """The K7 desk and the batch API in one tiny server; behaviour is set on the server object."""

    def log_message(self, *args):
        pass

    def _send(self, code, body):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        s = self.server
        if self.path == "/demo/status":
            return self._send(200, s.desk_status)
        if self.path == "/api/health":
            return self._send(200, {"status": "ok"})
        if self.path == f"/api/v1/jobs/{s.job_id}":
            s.polls += 1
            done = s.polls >= 2
            return self._send(200, {"job_id": s.job_id, "status": s.final_status if done else "running",
                                    "progress": {"done": 3 if done else 1, "total": 3,
                                                 "note": "Finished" if done else "Analysing 482,089 transactions"},
                                    "error": s.final_error if done else None})
        if self.path == f"/api/v1/jobs/{s.job_id}/result":
            return self._send(200, s.result)
        self._send(404, {"detail": "not found"})

    def do_POST(self):
        s = self.server
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        if self.path in ("/demo/start", "/demo/stop"):
            s.desk_calls.append(self.path)
            s.desk_status = {**s.desk_status, "state": "running" if self.path.endswith("start") else "paused"}
            return self._send(200, s.desk_status)
        if self.path == "/api/columns":
            s.columns_requests.append(body)
            if s.columns_answer is None:
                return self._send(404, {"detail": "Not Found"})
            if b'name="mapping"' in body and b"Nowhere" in body:
                return self._send(422, {"detail": "Mapping refers to unknown column 'Nowhere'"})
            answer = dict(s.columns_answer)
            if b'name="mapping"' in body:   # like the real API: the uploader's choices fill the missing fields
                mapping = json.loads(body.decode().split('name="mapping"\r\n\r\n')[1].split("\r\n--")[0])
                answer["missing_required"] = [f for f in answer["missing_required"] if not mapping.get(f)]
            return self._send(200, answer)
        if self.path == "/api/v1/jobs":
            s.uploaded = body
            s.upload_headers = dict(self.headers)
            return self._send(202, {"job_id": s.job_id, "status": "queued"})
        self._send(404, {"detail": "not found"})


IBM_COLUMNS = ["Timestamp", "From Bank", "Account", "To Bank", "Account.1", "Amount Paid"]
COLUMNS_ANSWER = {"file_name": "day.csv", "rows": 40000, "rows_estimated": False, "preview_rows": 1000, "max_rows": 5000000,
                  "columns": IBM_COLUMNS, "dataset_type": "ibm_aml",
                  "suggested_mapping": {"sender": "From Bank + Account", "receiver": "To Bank + Account.1", "amount": "Amount Paid",
                                        "timestamp": "Timestamp", "sender_bank": "From Bank", "receiver_bank": "To Bank"},
                  "fixed_fields": ["amount", "receiver", "sender", "timestamp"], "alternatives": {}, "missing_required": [],
                  "fields": ["transaction_id", "sender", "receiver", "amount", "timestamp"], "preview": [], "warnings": []}
BANK_ANSWER = {"file_name": "bank.csv", "rows": 3, "rows_estimated": False, "columns": ["Ref", "Acct Holder", "Counterparty", "Amt", "Booked"],
               "dataset_type": "generic", "suggested_mapping": {"transaction_id": "Ref", "amount": "Amt"}, "fixed_fields": [],
               "alternatives": {}, "missing_required": ["sender", "receiver", "timestamp"], "warnings": []}


@pytest.fixture
def service():
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeService)
    server.desk_status = {"state": "ready", "sent": 0, "total": 213995, "alerts": 0, "watch": 0, "speed": None,
                          "model": "Acurion K7 (real-time laundering model, rt/core)", "dataset": "HI-Large",
                          "recent": [{"alertId": "al_x", "accountId": "1:A", "riskScore": 0.97, "severity": "high",
                                      "timestamp": "2022-10-26T23:05:00Z", "reason": "K7's alert list: x",
                                      "extra": "dropped"}]}
    server.desk_calls, server.job_id, server.polls = [], "job123", 0
    server.final_status, server.final_error = "succeeded", None
    server.result = json.loads(FIXTURE.read_text())
    server.uploaded, server.upload_headers = None, {}
    server.columns_answer, server.columns_requests = COLUMNS_ANSWER, []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()


def make_bridge(service, tmp_path, clock=None, desk=True, api=True):
    clock = clock or Clock()
    db = FakeDB(clock)
    base = f"http://127.0.0.1:{service.server_address[1]}"
    b = Bridge(db, LocalService(base) if desk else None, LocalService(base, "secret-key") if api else None,
               work_dir=tmp_path, clock=clock)
    return b, db, clock


# -- status -------------------------------------------------------------------------------------------------

def test_status_is_published_with_server_time_and_only_known_fields(service, tmp_path):
    b, db, _ = make_bridge(service, tmp_path)
    b.publish_status(force=True)
    status = db.get("hostDesk/status")
    assert status["updatedAt"] == SERVER_NOW
    assert status["k7"]["state"] == "ready" and status["k7"]["total"] == 213995
    assert "speed" not in status["k7"]                       # nulls are left out, as Firebase would
    assert status["k7"]["recent"][0] == {"alertId": "al_x", "accountId": "1:A", "riskScore": 0.97,
                                         "severity": "high", "timestamp": "2022-10-26T23:05:00Z",
                                         "reason": "K7's alert list: x"}
    assert status["uploads"]["state"] == "ready"


def test_unchanged_status_is_not_rewritten_until_the_heartbeat(service, tmp_path, monkeypatch):
    b, db, _ = make_bridge(service, tmp_path)
    b.publish_status(force=True)
    count = len(db.writes)
    b.publish_status()
    assert len(db.writes) == count
    monkeypatch.setattr(b, "last_write", time.monotonic() - bridge_module.HEARTBEAT_S - 1)
    b.publish_status()
    assert len(db.writes) == count + 1


def test_a_desk_that_is_not_running_is_reported_offline(tmp_path):
    db = FakeDB(Clock())
    b = Bridge(db, LocalService("http://127.0.0.1:9"), None, work_dir=tmp_path)
    b.publish_status(force=True)
    status = db.get("hostDesk/status")
    assert status["k7"]["state"] == "offline" and "not running" in status["k7"]["problem"]
    assert status["uploads"]["state"] == "offline"


# -- commands -----------------------------------------------------------------------------------------------

def test_a_command_from_before_the_bridge_started_is_never_carried_out(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    db.set("hostDesk/command", {"id": "old", "action": "start", "by": "u1", "at": clock()})
    b.poll_command()
    assert service.desk_calls == []
    assert db.get("hostDesk/lastCommand") is None


def test_start_and_pause_are_forwarded_once_and_answered(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    b.poll_command()                                         # nothing there yet: later commands count
    db.set("hostDesk/command", {"id": "c1", "action": "start", "by": "u1", "at": clock()})
    b.poll_command()
    b.poll_command()                                         # the same command again is not repeated
    assert service.desk_calls == ["/demo/start"]
    answer = db.get("hostDesk/lastCommand")
    assert answer["id"] == "c1" and answer["ok"] is True and answer["state"] == "running"
    assert answer["handledAt"] == SERVER_NOW
    db.set("hostDesk/command", {"id": "c2", "action": "stop", "by": "u1", "at": clock()})
    b.poll_command()
    assert service.desk_calls == ["/demo/start", "/demo/stop"]
    assert db.get("hostDesk/status/k7/state") == "paused"


def test_a_command_older_than_a_minute_is_refused(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    b.poll_command()
    db.set("hostDesk/command", {"id": "late", "action": "start", "by": "u1", "at": clock() - 61_000})
    b.poll_command()
    assert service.desk_calls == []
    answer = db.get("hostDesk/lastCommand")
    assert answer["ok"] is False and "more than a minute" in answer["message"]


def test_command_age_uses_the_server_clock_offset(service, tmp_path):
    clock = Clock()
    b, db, _ = make_bridge(service, tmp_path, clock=clock)
    b.publish_status(force=True)
    clock.value += 5 * 60_000                               # this computer's clock is five minutes fast...
    db.clock = lambda: SERVER_NOW                            # ...compared with the server's
    b.measure_clock()
    b.poll_command()
    db.set("hostDesk/command", {"id": "c1", "action": "start", "by": "u1", "at": SERVER_NOW})
    b.poll_command()
    assert service.desk_calls == ["/demo/start"]


# -- uploads ------------------------------------------------------------------------------------------------

def queue_upload(db, clock, raw: bytes, job_id="-OUpload0000000000001", chunk=512 * 1024):
    packed = gzip.compress(raw)
    text = base64.b64encode(packed).decode()
    parts = [text[i:i + chunk] for i in range(0, len(text), chunk)] or [""]
    db.set(f"uploadJobs/{job_id}", {"by": "u1", "byName": "Analyst", "fileName": "day.csv", "bytes": len(raw),
                                    "packedBytes": len(packed), "chunks": len(parts), "status": "queued",
                                    "createdAt": clock(), "sha256": hashlib.sha256(raw).hexdigest()})
    for index, part in enumerate(parts):
        db.set(f"uploadFiles/{job_id}/c{index:03d}", part)
    return job_id


def confirm(db, job_id, mapping=None):
    """What the website writes when the uploader confirms the review."""
    db.update(f"uploadJobs/{job_id}", {"status": "queued", **({"mapping": mapping} if mapping else {})})


def test_an_upload_is_first_handed_back_for_its_columns_and_only_then_scored(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    raw = ("Timestamp,From Bank,Account,To Bank,Account,Amount Paid\n" + "2022/09/06 00:00,1,A,2,B,10.5\n" * 40000).encode()
    job_id = queue_upload(db, clock, raw, chunk=4096)
    found = b.next_upload()
    assert found and found[0] == job_id
    b.process_upload(*found)
    job = db.get(f"uploadJobs/{job_id}")
    assert job["status"] == "columns" and service.uploaded is None            # nothing scored yet
    assert db.get(f"uploadFiles/{job_id}") is not None                        # the file waits with the review
    assert len(service.columns_requests) == 1 and raw in service.columns_requests[0]
    review = job["host"]["columns"]
    assert review["datasetType"] == "ibm_aml" and review["fixed"] == ["amount", "receiver", "sender", "timestamp"]
    assert review["suggested"]["sender"] == "From Bank + Account" and review["rows"] == 40000
    assert [c["name"] for c in review["columns"]] == IBM_COLUMNS            # pandas names, lined up by position
    assert review["columns"][0] == {"name": "Timestamp", "kind": "date", "distinct": 0.01, "samples": ["2022/09/06 00:00"]}
    assert review["columns"][2]["samples"] == ["A"] and review["columns"][5]["kind"] == "number"
    assert review["askedAt"] == SERVER_NOW and "missing" not in review
    assert b.next_upload() is None                                            # it waits for the uploader
    confirm(db, job_id)
    b.process_upload(*b.next_upload())
    assert service.uploaded is not None and raw in service.uploaded         # the exact file reached the API
    assert {k.lower(): v for k, v in service.upload_headers.items()}.get("x-api-key") == "secret-key"
    body = service.uploaded.decode("utf-8", "replace")
    assert body.index('name="kind"') < body.index('name="file"')           # fields before the file
    assert 'name="mapping"' not in body                                      # a fixed layout sends no mapping
    job = db.get(f"uploadJobs/{job_id}")
    assert job["status"] == "succeeded"
    assert db.get(f"uploadFiles/{job_id}") is None                          # chunks are removed
    summary = job["host"]["summary"]
    assert summary["transactions"] == 482089 and summary["highRisk"] == 49
    assert summary["alertsWritten"] > 0 and summary["trust"] == "good"
    assert summary["evaluation"]["precision"] == pytest.approx(0.9388)
    alerts = db.get("alerts")
    assert len(alerts) == summary["alertsWritten"]
    assert all(key.startswith("up-OUpload") for key in alerts)
    assert not list(tmp_path.glob("acurion-bridge/*/upload.csv"))           # the unpacked file is removed


def test_a_changed_upload_is_refused_by_its_checksum(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    job_id = queue_upload(db, clock, b"a,b\n1,2\n")
    db.set(f"uploadJobs/{job_id}/sha256", "0" * 64)
    b.process_upload(*b.next_upload())
    job = db.get(f"uploadJobs/{job_id}")
    assert job["status"] == "failed" and job["host"]["error"]["code"] == "checksum"
    assert service.uploaded is None


def test_a_missing_chunk_fails_the_upload_with_a_readable_message(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    job_id = queue_upload(db, clock, b"x" * 50000, chunk=100)
    db.delete(f"uploadFiles/{job_id}/c001")
    b.process_upload(*b.next_upload())
    job = db.get(f"uploadJobs/{job_id}")
    assert job["status"] == "failed" and "incomplete" in job["host"]["error"]["message"]


def test_the_batch_api_failure_message_reaches_the_investigator(service, tmp_path):
    service.final_status = "failed"
    service.final_error = {"code": "invalid_input", "message": "The file has no Timestamp column."}
    b, db, clock = make_bridge(service, tmp_path)
    job_id = queue_upload(db, clock, b"a,b\n1,2\n")
    b.process_upload(*b.next_upload())
    confirm(db, job_id)
    b.process_upload(*b.next_upload())
    error = db.get(f"uploadJobs/{job_id}/host/error")
    assert error == {"code": "invalid_input", "message": "The file has no Timestamp column."}


BANK = b"Ref,Acct Holder,Counterparty,Amt,Booked\nP-1,ACC-1,ACC-9,1250.00,03/09/2026 10:15\nP-2,ACC-2,ACC-1,80.50,03/09/2026 10:16\nP-3,ACC-1,ACC-7,9.99,04/09/2026 09:00\n"


def test_a_bank_export_is_scored_with_the_columns_the_uploader_confirmed(service, tmp_path):
    service.columns_answer = BANK_ANSWER
    b, db, clock = make_bridge(service, tmp_path)
    job_id = queue_upload(db, clock, BANK)
    b.process_upload(*b.next_upload())
    review = db.get(f"uploadJobs/{job_id}/host/columns")
    assert review["missing"] == ["sender", "receiver", "timestamp"] and review["suggested"] == {"transaction_id": "Ref", "amount": "Amt"}
    assert [(c["kind"], c["distinct"]) for c in review["columns"]] == [("text", 1.0), ("text", 0.67), ("text", 1.0), ("number", 1.0), ("date", 1.0)]
    assert review["columns"][1]["samples"] == ["ACC-1", "ACC-2"]
    # The uploader's answer: columns for the missing fields, "" for a match they reject, an unknown field ignored.
    assert review["columns"][4]["dateOrder"] == "ambiguous" and "dateOrder" not in review["columns"][0]
    confirm(db, job_id, {"sender": "Acct Holder", "receiver": "Counterparty", "timestamp": "Booked", "transaction_id": "", "bogus": "x", "amount": 7,
                         "date_order": "month_first"})
    b.process_upload(*b.next_upload())
    assert db.get(f"uploadJobs/{job_id}/status") == "succeeded"
    sent = json.loads(service.columns_requests[1].decode().split('name="mapping"\r\n\r\n')[1].split("\r\n--")[0])
    assert sent == {"sender": "Acct Holder", "receiver": "Counterparty", "timestamp": "Booked", "transaction_id": ""}
    body = service.uploaded.decode("utf-8", "replace")
    assert 'name="mapping"' in body and body.index('name="mapping"') < body.index('name="file"')
    assert json.loads(body.split('name="mapping"\r\n\r\n')[1].split("\r\n--")[0]) == sent
    assert 'name="day_first"\r\n\r\nfalse' in body                         # the date order, as the API takes it


def test_a_confirmation_that_still_leaves_a_required_field_unmatched_is_asked_again(service, tmp_path):
    service.columns_answer = BANK_ANSWER
    b, db, clock = make_bridge(service, tmp_path)
    job_id = queue_upload(db, clock, BANK)
    b.process_upload(*b.next_upload())
    confirm(db, job_id, {"sender": "Acct Holder"})
    b.process_upload(*b.next_upload())
    job = db.get(f"uploadJobs/{job_id}")
    assert job["status"] == "columns" and service.uploaded is None
    assert job["host"]["columns"]["message"] == "Still needed: receiver, date and time. Choose a column for each."
    assert job["host"]["columns"]["missing"] == ["receiver", "timestamp"]
    assert db.get(f"uploadFiles/{job_id}") is not None
    # A column name the API does not know fails with the API's own sentence.
    confirm(db, job_id, {"sender": "Nowhere", "receiver": "Counterparty", "timestamp": "Booked"})
    b.process_upload(*b.next_upload())
    job = db.get(f"uploadJobs/{job_id}")
    assert job["status"] == "failed" and job["host"]["error"]["message"] == "Mapping refers to unknown column 'Nowhere'"
    assert db.get(f"uploadFiles/{job_id}") is None


def test_a_host_without_the_columns_api_says_so(service, tmp_path):
    service.columns_answer = None
    b, db, clock = make_bridge(service, tmp_path)
    job_id = queue_upload(db, clock, BANK)
    b.process_upload(*b.next_upload())
    error = db.get(f"uploadJobs/{job_id}/host/error")
    assert error["code"] == "no_columns_api" and "Update Acurion on the host" in error["message"]


def test_column_profiles_read_kinds_samples_and_odd_files(tmp_path):
    path = tmp_path / "odd.csv"
    path.write_bytes("﻿When;Who;Amount (EUR);Note\n2026-09-03T10:15:00Z;Ann;€1.250,00;\n2026-09-03T10:16:00Z;Bob;\"€ 80,50\";late\n;;;\n".encode())
    profiles = bridge_module.profile_columns(path, ["When", "Who", "Amount (EUR)", "Note"])
    assert [p["kind"] for p in profiles] == ["date", "text", "number", "text"]
    assert profiles[0]["samples"] == ["2026-09-03T10:15:00Z", "2026-09-03T10:16:00Z"] and profiles[3]["samples"] == ["late"]
    assert profiles[1]["distinct"] == 1.0
    # Names that do not line up by count are matched by name; unknown ones are empty.
    profiles = bridge_module.profile_columns(path, ["Who", "Missing"])
    assert profiles[0]["samples"] == ["Ann", "Bob"] and profiles[1] == {"name": "Missing", "kind": "empty", "distinct": 0.0}  # no empty lists (Firebase drops them)
    assert bridge_module.column_kind(["10:15", "10:16:30", "9:05 pm"]) == ("time", 1.0)
    assert bridge_module.date_order(["03/09/2026 10:15", "14/09/2026"]) == "day_first"
    assert bridge_module.date_order(["03/09/2026", "09/14/26"]) == "month_first"
    assert bridge_module.date_order(["03/09/2026", "04/09/2026"]) == "ambiguous" and bridge_module.date_order(["2026-09-03"]) is None
    assert bridge_module.clean_mapping({"sender": "A", "date_order": "month_first"}) == {"sender": "A", "date_order": "month_first"}
    assert bridge_module.clean_mapping({"date_order": "sideways"}) == {}
    assert bridge_module.clean_mapping({"sender": "A", "nope": "B", "amount": 3, "label": ""}) == {"sender": "A", "label": ""}
    assert bridge_module.clean_mapping("junk") == {}


def test_abandoned_unconfirmed_stuck_and_cancelled_uploads_are_cleared_or_taken_again(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    stale = queue_upload(db, clock, b"a\n1\n", job_id="-Ostale")
    db.set(f"uploadJobs/{stale}/status", "uploading")
    db.set(f"uploadJobs/{stale}/createdAt", clock() - 31 * 60_000)
    cancelled = queue_upload(db, clock, b"a\n1\n", job_id="-Ocancelled")
    db.set(f"uploadJobs/{cancelled}/status", "cancelled")
    unconfirmed = queue_upload(db, clock, b"a\n1\n", job_id="-Ounconfirmed")
    db.set(f"uploadJobs/{unconfirmed}/status", "columns")
    db.set(f"uploadJobs/{unconfirmed}/host/columns/askedAt", clock() - 25 * 3600_000)
    waiting = queue_upload(db, clock, b"a\n1\n", job_id="-Owaiting")
    db.set(f"uploadJobs/{waiting}/status", "columns")
    db.set(f"uploadJobs/{waiting}/host/columns/askedAt", clock() - 3600_000)
    assert b.next_upload() is None
    assert db.get(f"uploadJobs/{stale}/status") == "failed"
    assert db.get(f"uploadJobs/{unconfirmed}/status") == "failed" and "not confirmed within a day" in db.get(f"uploadJobs/{unconfirmed}/host/error/message")
    assert db.get(f"uploadJobs/{waiting}/status") == "columns" and db.get(f"uploadFiles/{waiting}") is not None
    assert db.get(f"uploadFiles/{stale}") is None and db.get(f"uploadFiles/{cancelled}") is None and db.get(f"uploadFiles/{unconfirmed}") is None
    # A job left "received" when the bridge was stopped is taken again after ten minutes.
    stuck = queue_upload(db, clock, b"a\n1\n", job_id="-Ostuck")
    db.set(f"uploadJobs/{stuck}/status", "received")
    db.set(f"uploadJobs/{stuck}/host/receivedAt", clock() - 11 * 60_000)
    assert b.next_upload()[0] == stuck


def test_uploads_are_taken_oldest_first(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    queue_upload(db, clock, b"a\n1\n", job_id="-Onewer")
    clock.value -= 1000
    queue_upload(db, clock, b"a\n1\n", job_id="-Oolder")
    assert b.next_upload()[0] == "-Oolder"


# -- the result's conversion --------------------------------------------------------------------------------

def test_conversion_follows_the_website_contract_and_its_caps():
    result = json.loads(FIXTURE.read_text())
    job = {"fileName": "day.csv"}
    paths, summary = convert_result("-OAbCdEfGh123456", job, result, finished_at="2026-11-15T12:00:00Z")
    alerts = {k: v for k, v in paths.items() if k.startswith("alerts/")}
    txs = {k: v for k, v in paths.items() if k.startswith("transactions/")}
    nets = {k: v for k, v in paths.items() if k.startswith("networkReviews/")}
    assert 0 < len(alerts) <= MAX_ALERTS and len(txs) <= MAX_TRANSACTIONS and len(nets) <= MAX_NETWORKS
    keys = sorted(alerts)
    assert keys[0] == "alerts/up-OAbCdEfGh123456-a0000"                     # time-ordered upload, then order
    first = alerts[keys[0]]
    assert first["severity"] == "high" and first["decision"] == "flag" and first["status"] == "open"
    assert first["riskScoreScale"] == "0-1" and 0 <= first["riskScore"] <= 1
    assert first["alertId"] == "UP-123456-001"
    assert first["sourceDataset"] == "Upload · day.csv" and first["uploadId"] == "-OAbCdEfGh123456"
    assert first["reasons"] and first["reason"] == "; ".join(first["reasons"])
    severities = [alerts[k]["severity"] for k in keys]
    assert severities.count("medium") <= MAX_MEDIUM_ALERTS and severities.count("high") == 49
    assert severities == sorted(severities, key=lambda s: {"high": 0, "medium": 1}[s])   # high first
    tx_ids = {v["transactionId"] for v in txs.values()}
    assert all(a["transactionId"] in tx_ids for a in alerts.values())
    for net in nets.values():
        assert len(net["transactionIds"]) <= MAX_EDGES_PER_NETWORK
        assert set(net["transactionIds"]) <= tx_ids                          # every drawn transfer exists
        assert net["pattern"] and net["description"] and 0 <= net["risk"] <= 1
    for tx in txs.values():
        assert tx.get("currency") is None or len(tx["currency"]) == 3
        assert set(tx) >= {"transactionId", "fromAccount", "toAccount", "timestamp"}
    linked = [a for a in alerts.values() if a.get("networkId")]
    assert linked and all(f"networkReviews/{a['networkId']}" in paths for a in linked)
    assert summary["alertsWritten"] == len(alerts) and summary["model"].startswith("Acurion core model")
    assert all(json.dumps(v) for v in paths.values())                         # plain JSON, no NaN or objects
    assert not any(k for k in paths if any(c in k.split("/", 1)[1] for c in ".$#[]"))
