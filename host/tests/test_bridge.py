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
        if self.path == "/api/v1/jobs":
            s.uploaded = body
            s.upload_headers = dict(self.headers)
            return self._send(202, {"job_id": s.job_id, "status": "queued"})
        self._send(404, {"detail": "not found"})


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


def test_an_upload_is_rebuilt_byte_for_byte_scored_and_its_results_written(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    raw = ("Timestamp,From Bank,Account,To Bank,Account,Amount Paid\n" + "2022/09/06 00:00,1,A,2,B,10.5\n" * 40000).encode()
    job_id = queue_upload(db, clock, raw, chunk=4096)
    found = b.next_upload()
    assert found and found[0] == job_id
    b.process_upload(*found)
    assert service.uploaded is not None and raw in service.uploaded         # the exact file reached the API
    assert {k.lower(): v for k, v in service.upload_headers.items()}.get("x-api-key") == "secret-key"
    body = service.uploaded.decode("utf-8", "replace")
    assert body.index('name="kind"') < body.index('name="file"')           # fields before the file
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
    error = db.get(f"uploadJobs/{job_id}/host/error")
    assert error == {"code": "invalid_input", "message": "The file has no Timestamp column."}


def test_abandoned_and_cancelled_uploads_are_cleared(service, tmp_path):
    b, db, clock = make_bridge(service, tmp_path)
    stale = queue_upload(db, clock, b"a\n1\n", job_id="-Ostale")
    db.set(f"uploadJobs/{stale}/status", "uploading")
    db.set(f"uploadJobs/{stale}/createdAt", clock() - 31 * 60_000)
    cancelled = queue_upload(db, clock, b"a\n1\n", job_id="-Ocancelled")
    db.set(f"uploadJobs/{cancelled}/status", "cancelled")
    assert b.next_upload() is None
    assert db.get(f"uploadJobs/{stale}/status") == "failed"
    assert db.get(f"uploadFiles/{stale}") is None and db.get(f"uploadFiles/{cancelled}") is None


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
