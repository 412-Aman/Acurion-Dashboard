"""Acurion website bridge: connects the Acurion website to the models on this computer, through Firebase.

The website never talks to this computer directly. Investigators press Start or upload a dataset on
https://acurion.vercel.app (from any laptop); the website writes that to Firebase; this bridge reads it,
drives the local services and writes their answers back:

  K7 demo desk   http://127.0.0.1:8002  (tools/k7_demo.py serve)   Start / Pause, progress, newest alerts
  Batch web API  http://127.0.0.1:8000  (api.py + the job worker)   scores uploaded CSV files

Firebase paths (the website reads them; its rules let only this bridge write the host's answers):

  hostDesk/status        what K7 and the upload service are doing, refreshed every second
  hostDesk/command       Start or Pause, written by a reviewer or admin on the website
  hostDesk/lastCommand   the bridge's answer to the last command
  uploadJobs/{id}        an uploaded dataset: the website creates it, the bridge reports progress and results
  uploadFiles/{id}/cNNN  the uploaded file, gzip-compressed and base64-encoded in chunks; deleted once analysed
  alerts, transactions, networkReviews   an upload's results (keys start with "up-"; K7's start with "k7-")

An upload is never scored unseen. The bridge first asks the batch API how the file's columns map to Acurion's
fields (POST /api/columns), writes that to uploadJobs/{id}/host/columns and sets the status to "columns". The
uploader confirms or corrects the mapping on the website (uploadJobs/{id}/mapping, status back to "queued"),
and only then is the file sent to POST /api/v1/jobs with that mapping.

Run it on the computer that runs K7 and the batch API, with the same Firebase key K7 uses:

  set ACURION_FIREBASE_URL=https://acurion-2bd21-default-rtdb.firebaseio.com
  set ACURION_FIREBASE_CREDENTIALS=C:\\keys\\acurion-firebase.json
  set ACURION_API_KEY=...            (the batch API's key; not needed in development mode)
  python acurion_bridge.py

Needs Python 3.9+ and firebase-admin (already in Acurion's environment). Nothing else.
"""

from __future__ import annotations

import argparse
import base64
import csv
import gzip
import hashlib
import json
import logging
import os
import re
import shutil
import signal
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

VERSION = "1.1.0"
LOG = logging.getLogger("acurion.bridge")
SERVER_TIME = {".sv": "timestamp"}

COMMAND_MAX_AGE_S = 60          # a Start or Pause older than this is never carried out
HEARTBEAT_S = 5                 # status is rewritten at least this often, so the website knows the host is alive
UPLOAD_ABANDONED_S = 30 * 60    # an upload still "uploading" after this long is cleared
COLUMNS_WAIT_S = 24 * 3600      # an upload whose columns are not confirmed within this long is cleared
RECEIVED_STUCK_S = 10 * 60      # a job left "received" this long (the bridge was stopped mid-way) is taken again
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
PROFILE_ROWS = 200              # rows read for each column's kind and sample values in the column review
MAX_PROFILE_COLUMNS = 80

# Acurion's fields, as the batch API names them (acurion/schema.py CANONICAL_FIELDS). The mapping the uploader
# confirms may only name these.
FIELDS = ("transaction_id", "sender", "receiver", "amount", "timestamp", "time_of_day", "amount_received",
          "payment_currency", "receiving_currency", "payment_format", "sender_bank", "receiver_bank", "label")
FIELD_LABELS = {"sender": "sender", "receiver": "receiver", "amount": "amount", "timestamp": "date and time"}

# How much of an upload's result is copied to Firebase. The website reads the last 2,000 records of each
# list (ordered by key), so one upload stays well inside that.
MAX_ALERTS = 150
MAX_MEDIUM_ALERTS = 50          # medium-risk transfers are leads to review; the queue keeps the strongest
MAX_NETWORKS = 15
MAX_EDGES_PER_NETWORK = 40
MAX_TRANSACTIONS = 600

UPLOAD_MODEL = "Acurion core model (acurion-risk-core)"

# Currency names as the batch API reports them -> the three-letter codes the website shows.
CURRENCY = {"US DOLLAR": "USD", "EURO": "EUR", "UK POUND": "GBP", "RUBLE": "RUB", "YUAN": "CNY", "YEN": "JPY",
            "RUPEE": "INR", "SWISS FRANC": "CHF", "AUSTRALIAN DOLLAR": "AUD", "CANADIAN DOLLAR": "CAD",
            "SAUDI RIYAL": "SAR", "SHEKEL": "ILS", "MEXICAN PESO": "MXN", "BRAZIL REAL": "BRL", "BITCOIN": "BTC",
            "UAE DIRHAM": "AED", "SINGAPORE DOLLAR": "SGD", "HONG KONG DOLLAR": "HKD"}

DESK_FIELDS = ("state", "problem", "sent", "total", "rate", "speed", "alerts", "watch", "answer_ms", "payment_time",
               "model", "dataset", "copying_to", "copy_problem")
RECENT_FIELDS = ("alertId", "accountId", "riskScore", "severity", "timestamp", "reason")


# ---------------------------------------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------------------------------------

def now_ms() -> int:
    return int(time.time() * 1000)


def given(record: dict) -> dict:
    """Firebase drops null values; leave them out so the stored record equals what was written."""
    return {key: value for key, value in record.items() if value is not None and value != "" and value != []}


def currency_code(name: Any) -> Optional[str]:
    text = str(name or "").strip().upper()
    return CURRENCY.get(text) or (text if len(text) == 3 and text.isalpha() else None)


def safe_key(text: str) -> str:
    """A Firebase key part: no . $ # [ ] / (an upload ID is a Firebase push key, which never has them)."""
    return re.sub(r"[.$#\[\]/]", "_", str(text))


def short_reason(text: str, limit: int = 300) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def clean_mapping(value: Any) -> dict:
    """The uploader's confirmed mapping: {field: column name, or "" for "not in this file"}, only known fields,
    plus date_order ("day_first" or "month_first") when the date column could be read both ways."""
    if not isinstance(value, dict):
        return {}
    mapping = {field: str(column)[:200] for field, column in value.items() if field in FIELDS and isinstance(column, str)}
    if value.get("date_order") in ("day_first", "month_first"):
        mapping["date_order"] = value["date_order"]
    return mapping


# ---------------------------------------------------------------------------------------------------------
# Column review: what each column looks like, from the file's first rows
# ---------------------------------------------------------------------------------------------------------

_DATE = re.compile(r"^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](\d{4}|\d{2}))([ T].*)?$")
_DMY = re.compile(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?=$|[ T])")
_TIME = re.compile(r"^\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*([AaPp]\.?[Mm]\.?)?$")


def date_order(values: list) -> Optional[str]:
    """For dates written 03/09/2026: "day_first" or "month_first" when some value settles it, "ambiguous" when
    none does (the review then asks), None for other date forms."""
    parts = [m.groups()[:2] for m in (_DMY.match(v) for v in values) if m]
    if not parts:
        return None
    if any(int(first) > 12 for first, _ in parts):
        return "day_first"
    if any(int(second) > 12 for _, second in parts):
        return "month_first"
    return "ambiguous"


def is_number(text: str) -> bool:
    cleaned = re.sub(r"[\s,£$€¥₹()]", "", text)
    if cleaned in ("", "-", "+", "."):
        return False
    try:
        float(cleaned)
        return True
    except ValueError:
        return False


def column_kind(values: list) -> tuple[str, float]:
    """("number" | "date" | "time" | "text" | "empty", share of distinct values) for one column's sample."""
    values = [v for v in values if v]
    if not values:
        return "empty", 0.0
    share = lambda test: sum(1 for v in values if test(v)) / len(values)  # noqa: E731
    distinct = len(set(values)) / len(values)
    if share(is_number) >= 0.9:
        return "number", distinct
    if share(lambda v: bool(_DATE.match(v))) >= 0.9:
        return "date", distinct
    if share(lambda v: bool(_TIME.match(v))) >= 0.9:
        return "time", distinct
    return "text", distinct


def profile_columns(path: Path, names: list, rows: int = PROFILE_ROWS) -> list:
    """For each column the batch API found: its name, kind, distinct share and up to three sample values.

    `names` are the API's column names (duplicates renamed as pandas does, e.g. "Account.1"); the file's own
    header lines up with them by position, or by name when the counts differ.
    """
    with open(path, "r", encoding="utf-8-sig", errors="replace", newline="") as handle:
        first = handle.readline()
        delimiter = max(",;\t|", key=first.count)
        handle.seek(0)
        reader = csv.reader(handle, delimiter=delimiter)
        header = [cell.strip() for cell in next(reader, [])]
        table = []
        for record in reader:
            if len(table) >= rows:
                break
            if any(cell.strip() for cell in record):
                table.append([cell.strip() for cell in record])
    profiles = []
    for index, name in enumerate(names[:MAX_PROFILE_COLUMNS]):
        position = index if len(header) == len(names) else next((i for i, h in enumerate(header) if h == name), None)
        values = [row[position] for row in table if position is not None and position < len(row)]
        kind, distinct = column_kind(values)
        samples: list = []
        for value in values:
            if value and value[:40] not in samples:
                samples.append(value[:40])
            if len(samples) == 3:
                break
        profile = {"name": name, "kind": kind, "distinct": round(distinct, 2), "samples": samples}
        if kind == "date":
            profile["dateOrder"] = date_order(values)
        profiles.append(given(profile))
    return profiles


# ---------------------------------------------------------------------------------------------------------
# Firebase access (one small interface, so the tests can use an in-memory database)
# ---------------------------------------------------------------------------------------------------------

class FirebaseDB:
    """The Realtime Database through firebase-admin, with the service-account key in ACURION_FIREBASE_CREDENTIALS."""

    def __init__(self, url: str, credentials: str):
        import firebase_admin
        from firebase_admin import credentials as fb_credentials, db

        if not url or not credentials:
            raise SystemExit("Set ACURION_FIREBASE_URL and ACURION_FIREBASE_CREDENTIALS (the service-account key file).")
        if not Path(credentials).is_file():
            raise SystemExit(f"The Firebase key file was not found: {credentials}")
        app = firebase_admin.initialize_app(fb_credentials.Certificate(credentials), {"databaseURL": url},
                                            name=f"acurion-bridge-{uuid.uuid4().hex[:6]}")
        self._db, self._app = db, app

    def _ref(self, path: str):
        return self._db.reference("/" + path.strip("/"), app=self._app)

    def get(self, path: str):
        return self._ref(path).get()

    def set(self, path: str, value) -> None:
        self._ref(path).set(value)

    def update(self, path: str, values: dict) -> None:
        self._ref(path).update(values)

    def delete(self, path: str) -> None:
        self._ref(path).delete()

    def recent_jobs(self, limit: int = 25) -> dict:
        return self._ref("uploadJobs").order_by_child("createdAt").limit_to_last(limit).get() or {}


# ---------------------------------------------------------------------------------------------------------
# HTTP to the local services
# ---------------------------------------------------------------------------------------------------------

class LocalService:
    def __init__(self, base: str, api_key: Optional[str] = None, timeout: float = 5.0):
        self.base, self.api_key, self.timeout = base.rstrip("/"), api_key, timeout

    def _headers(self, extra: Optional[dict] = None) -> dict:
        headers = {"Accept": "application/json", "User-Agent": f"acurion-bridge/{VERSION}"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        headers.update(extra or {})
        return headers

    def call(self, method: str, path: str, body=None, headers: Optional[dict] = None, timeout: Optional[float] = None):
        request = urllib.request.Request(self.base + path, data=body, method=method, headers=self._headers(headers))
        try:
            with urllib.request.urlopen(request, timeout=timeout or self.timeout) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                answer = json.loads(raw) if raw else None
            except ValueError:
                answer = {"detail": raw.decode("utf-8", "replace")[:300]}
            return error.code, answer

    def get(self, path: str, timeout: Optional[float] = None):
        return self.call("GET", path, timeout=timeout)

    def post(self, path: str, timeout: Optional[float] = None):
        return self.call("POST", path, body=b"", timeout=timeout)

    def upload(self, path: str, fields: dict, file_path: Path, file_name: str, timeout: float = 600):
        """multipart/form-data with the fields first (the batch API checks them before reading the file)."""
        boundary = "acurion" + uuid.uuid4().hex
        body = tempfile.NamedTemporaryFile(delete=False, suffix=".multipart")
        try:
            with body:
                for name, value in fields.items():
                    body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
                safe_name = re.sub(r'["\r\n]', "_", file_name)
                body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
                           f"Content-Type: text/csv\r\n\r\n".encode())
                with open(file_path, "rb") as source:
                    shutil.copyfileobj(source, body, 1024 * 1024)
                body.write(f"\r\n--{boundary}--\r\n".encode())
            size = os.path.getsize(body.name)
            with open(body.name, "rb") as stream:
                request = urllib.request.Request(self.base + path, data=stream, method="POST", headers=self._headers({
                    "Content-Type": f"multipart/form-data; boundary={boundary}", "Content-Length": str(size)}))
                try:
                    with urllib.request.urlopen(request, timeout=timeout) as response:
                        return response.status, json.loads(response.read() or b"null")
                except urllib.error.HTTPError as error:
                    raw = error.read()
                    try:
                        return error.code, json.loads(raw) if raw else None
                    except ValueError:
                        return error.code, {"detail": raw.decode("utf-8", "replace")[:300]}
        finally:
            os.unlink(body.name)


def detail_of(answer) -> str:
    """The readable sentence of a batch API or desk answer."""
    if isinstance(answer, dict):
        error = answer.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        detail = answer.get("detail")
        if isinstance(detail, str):
            return detail
        if isinstance(detail, list) and detail:
            return "; ".join(str(item.get("msg", item)) if isinstance(item, dict) else str(item) for item in detail)
    return "The service gave no reason."


# ---------------------------------------------------------------------------------------------------------
# An upload's result -> the website's records
# ---------------------------------------------------------------------------------------------------------

def convert_result(job_id: str, job: dict, result: dict, *, finished_at: str) -> tuple[dict, dict]:
    """The records to write for one analysed upload, as {path: value}, and the job's summary.

    Alerts: the high-risk transactions, then the strongest MAX_MEDIUM_ALERTS medium ones, at most MAX_ALERTS.
    Networks: the riskiest MAX_NETWORKS, each with at most MAX_EDGES_PER_NETWORK transfers.
    Transactions: every transfer an alert or a network refers to, at most MAX_TRANSACTIONS.
    """
    jid = safe_key(job_id).lstrip("-") or "upload"
    file_name = str(job.get("fileName") or result.get("run", {}).get("file_name") or "upload.csv")
    source = f"Upload · {file_name}"
    tag = jid[-6:]
    paths: dict[str, Any] = {}

    flagged = [t for t in result.get("transactions") or [] if t.get("risk_level") in ("high", "medium")]
    flagged.sort(key=lambda t: ({"high": 0, "medium": 1}[t["risk_level"]], -(t.get("risk_score") or 0)))
    networks = sorted(result.get("networks") or [], key=lambda n: -(n.get("risk_score") or 0))[:MAX_NETWORKS]
    network_keys = {n["network_id"]: f"up-{jid}-{safe_key(n['network_id'])}" for n in networks}

    # Transactions: alerts' own transfers first, then the networks' riskiest transfers.
    tx_keys: dict[str, str] = {}
    tx_records: dict[str, dict] = {}

    def add_transaction(tx_id: str, record: dict) -> Optional[str]:
        if tx_id in tx_keys:
            return tx_keys[tx_id]
        if len(tx_keys) >= MAX_TRANSACTIONS:
            return None
        key = f"up-{jid}-t{len(tx_keys):04d}"
        tx_keys[tx_id] = key
        tx_records[key] = record
        return key

    def decision(level: Optional[str], score) -> Optional[str]:
        if level in ("high", "medium"):
            return "flag"
        return "pass" if score is not None else None

    highs = [t for t in flagged if t["risk_level"] == "high"]
    alerts = (highs + [t for t in flagged if t["risk_level"] == "medium"][:MAX_MEDIUM_ALERTS])[:MAX_ALERTS]
    for t in alerts:
        add_transaction(t["transaction_id"], given({
            "transactionId": t["transaction_id"], "timestamp": t.get("time"), "fromAccount": t.get("sender"),
            "toAccount": t.get("receiver"), "amount": t.get("amount"), "currency": currency_code(t.get("currency")),
            "riskScore": round(float(t["risk_score"]), 4) if t.get("risk_score") is not None else None,
            "riskScoreScale": "0-1", "decision": decision(t.get("risk_level"), t.get("risk_score")),
            "modelVersion": UPLOAD_MODEL, "sourceDataset": source, "uploadId": job_id,
        }))

    network_records = {}
    for n in networks:
        edges = sorted(n.get("edges") or [], key=lambda e: (bool(e.get("context")), -(e.get("risk_score") or 0)))
        member_ids = []
        for e in edges[:MAX_EDGES_PER_NETWORK]:
            original = next((t for t in flagged if t["transaction_id"] == e["transaction_id"]), None)
            if original is not None:
                amount, currency = original.get("amount"), currency_code(original.get("currency"))
            else:  # a network transfer outside the flagged list: its amount in US dollars is what the result has
                amount, currency = e.get("amount_usd"), "USD" if e.get("amount_usd") is not None else None
            key = add_transaction(e["transaction_id"], given({
                "transactionId": e["transaction_id"], "timestamp": e.get("time"), "fromAccount": e.get("source"),
                "toAccount": e.get("target"), "amount": amount, "currency": currency,
                "riskScore": round(float(e["risk_score"]), 4) if e.get("risk_score") is not None else None,
                "riskScoreScale": "0-1", "decision": decision(e.get("risk_level"), e.get("risk_score")),
                "modelVersion": UPLOAD_MODEL, "sourceDataset": source, "uploadId": job_id,
            }))
            if key is not None:
                member_ids.append(e["transaction_id"])
        roles = {node["id"]: node.get("role") for node in n.get("nodes") or [] if node.get("id")}
        network_records[network_keys[n["network_id"]]] = given({
            "networkId": network_keys[n["network_id"]], "label": n["network_id"], "uploadId": job_id,
            "fileName": file_name, "pattern": n.get("primary_pattern"), "patterns": n.get("patterns") or [],
            "description": n.get("description"), "risk": round(float(n.get("risk_score") or 0), 4),
            "accounts": list(roles), "roles": [{"account": a, "role": r} for a, r in roles.items() if r],
            "transfers": n.get("transactions"), "highRiskTransfers": n.get("high_risk_transactions"),
            "transactionIds": member_ids, "totalAmountUsd": round(float(n["total_amount"]), 2) if n.get("total_amount") is not None else None,
            "start": n.get("start"), "end": n.get("end"), "sourceDataset": source, "modelVersion": UPLOAD_MODEL,
        })

    alert_records = {}
    for index, t in enumerate(alerts):
        reasons = [short_reason(r) for r in t.get("reasons") or [] if r][:5]
        network_key = network_keys.get(t.get("network_id"))
        alert_records[f"up-{jid}-a{index:04d}"] = given({
            "alertId": f"UP-{tag}-{index + 1:03d}", "transactionId": t["transaction_id"], "accountId": t.get("sender"),
            "riskScore": round(float(t["risk_score"]), 4), "riskScoreScale": "0-1", "decision": "flag",
            "severity": t["risk_level"], "status": "open", "timestamp": t.get("time"), "evaluatedAt": finished_at,
            "reason": "; ".join(reasons) or "The model gave no single reason for this score.",
            "reasons": reasons, "sourceDataset": source, "modelVersion": UPLOAD_MODEL, "uploadId": job_id,
            "networkId": network_key, "featureWindow": "the uploaded file's own history",
        })

    for key, record in alert_records.items():
        paths[f"alerts/{key}"] = record
    for key, record in tx_records.items():
        paths[f"transactions/{key}"] = record
    for key, record in network_records.items():
        paths[f"networkReviews/{key}"] = record

    summary_in = result.get("summary") or {}
    model = result.get("model") or {}
    dataset = result.get("dataset") or {}
    trust = model.get("trust") or {}
    evaluation = result.get("evaluation") or {}
    high = evaluation.get("high_risk") or {}
    summary = given({
        "transactions": summary_in.get("transactions"), "accounts": summary_in.get("accounts"),
        "highRisk": summary_in.get("high_risk_transactions"), "mediumRisk": summary_in.get("medium_risk_transactions"),
        "highRiskAccounts": summary_in.get("high_risk_accounts"), "networks": summary_in.get("networks"),
        "networkPatterns": [{"pattern": k, "count": v} for k, v in (summary_in.get("network_patterns") or {}).items()],
        "alertsWritten": len(alert_records), "networksWritten": len(network_records),
        "transactionsWritten": len(tx_records), "model": UPLOAD_MODEL, "modelVariant": model.get("variant"),
        "trainedOn": model.get("trained_on"), "trust": trust.get("level"),
        "trustReasons": [short_reason(r) for r in trust.get("reasons") or []][:4],
        "warnings": [short_reason(w, 400) for w in (model.get("warnings") or []) + (dataset.get("warnings") or [])][:6],
        "datasetType": dataset.get("dataset_type"), "start": dataset.get("start"), "end": dataset.get("end"),
        "evaluation": given({
            "labelColumn": evaluation.get("label_column"), "positives": high.get("positives"),
            "precision": high.get("precision"), "recall": high.get("recall"),
            "averagePrecision": high.get("average_precision"),
        }) if high else None,
    })
    return paths, summary


# ---------------------------------------------------------------------------------------------------------
# The bridge
# ---------------------------------------------------------------------------------------------------------

class Bridge:
    def __init__(self, db, desk: Optional[LocalService], api: Optional[LocalService], *,
                 work_dir: Optional[Path] = None, clock: Callable[[], int] = now_ms):
        self.db, self.desk, self.api, self.clock = db, desk, api, clock
        self.work_dir = Path(work_dir or tempfile.gettempdir()) / "acurion-bridge"
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.stopping = threading.Event()
        self.last_command_id: Optional[str] = None
        self.first_command_poll = True
        self.last_payload: Optional[str] = None
        self.last_write = 0.0
        self.offset_ms = 0                 # server time - this computer's time
        self.uploads_state = {"state": "offline"}
        self.api_checked = 0.0
        self.busy_job: Optional[str] = None

    # -- status -----------------------------------------------------------------------------------------

    def desk_status(self) -> dict:
        if self.desk is None:
            return {"state": "offline", "problem": "K7 is not set up on this host."}
        try:
            code, answer = self.desk.get("/demo/status", timeout=3)
        except (OSError, ValueError) as error:
            return {"state": "offline", "problem": "The K7 desk is not running on the host.", "detail": type(error).__name__}
        if code != 200 or not isinstance(answer, dict):
            return {"state": "offline", "problem": f"The K7 desk answered {code}: {detail_of(answer)}"}
        status = given({key: answer.get(key) for key in DESK_FIELDS})
        status["recent"] = [given({key: item.get(key) for key in RECENT_FIELDS})
                            for item in (answer.get("recent") or [])[:20] if isinstance(item, dict)]
        return status

    def uploads_status(self) -> dict:
        if self.api is None:
            return {"state": "offline", "problem": "Upload scoring is not set up on this host."}
        if time.monotonic() - self.api_checked > 10:
            self.api_checked = time.monotonic()
            try:
                code, answer = self.api.get("/api/health", timeout=3)
                ok = code == 200 and isinstance(answer, dict) and answer.get("status") == "ok"
                self.uploads_state = {"state": "ready"} if ok else {
                    "state": "offline", "problem": f"The batch API answered {code}: {detail_of(answer)}"}
            except (OSError, ValueError):
                self.uploads_state = {"state": "offline", "problem": "The batch API is not running on the host."}
        state = dict(self.uploads_state)
        if state["state"] == "ready" and self.busy_job:
            state["state"] = "busy"
        return state

    def publish_status(self, force: bool = False) -> None:
        payload = {"k7": self.desk_status(), "uploads": self.uploads_status(), "bridge": VERSION}
        text = json.dumps(payload, sort_keys=True)
        if not force and text == self.last_payload and time.monotonic() - self.last_write < HEARTBEAT_S:
            return
        self.db.set("hostDesk/status", {**payload, "updatedAt": SERVER_TIME})
        self.last_payload, self.last_write = text, time.monotonic()

    def measure_clock(self) -> None:
        """Server time - local time, from the status just written (commands carry server times)."""
        written = self.db.get("hostDesk/status/updatedAt")
        if isinstance(written, (int, float)):
            self.offset_ms = int(written) - self.clock()

    # -- commands ---------------------------------------------------------------------------------------

    def poll_command(self) -> None:
        command = self.db.get("hostDesk/command")
        if not isinstance(command, dict) or not command.get("id"):
            self.first_command_poll = False
            return
        if command["id"] == self.last_command_id:
            return
        self.last_command_id = command["id"]
        if self.first_command_poll:
            # Written before this bridge started: never carry it out now.
            self.first_command_poll = False
            LOG.info("Ignoring the command left from before the bridge started (%s).", command.get("action"))
            return
        action = command.get("action")
        age_s = (self.clock() + self.offset_ms - int(command.get("at") or 0)) / 1000
        answer = {"id": command["id"], "action": action, "by": command.get("by"), "at": command.get("at"),
                  "handledAt": SERVER_TIME}
        if action not in ("start", "stop"):
            answer.update(ok=False, message="Unknown command.")
        elif age_s > COMMAND_MAX_AGE_S:
            answer.update(ok=False, message="Ignored: it was sent more than a minute ago.")
        elif self.desk is None:
            answer.update(ok=False, message="K7 is not set up on this host.")
        else:
            try:
                code, reply = self.desk.post(f"/demo/{action}", timeout=5)
                ok = code == 200 and isinstance(reply, dict)
                answer.update(ok=ok, state=(reply or {}).get("state") if ok else None,
                              message=("K7 is running." if action == "start" else "K7 is paused.") if ok
                              else f"The K7 desk answered {code}: {detail_of(reply)}")
            except (OSError, ValueError):
                answer.update(ok=False, message="The K7 desk is not running on the host.")
        LOG.info("Command %s from %s: %s", action, command.get("by"), answer.get("message"))
        self.db.set("hostDesk/lastCommand", given(answer))
        self.publish_status(force=True)

    # -- uploads ----------------------------------------------------------------------------------------

    def next_upload(self) -> Optional[tuple[str, dict]]:
        jobs = self.db.recent_jobs() or {}
        now = self.clock() + self.offset_ms
        waiting = []
        for job_id, job in jobs.items():
            if not isinstance(job, dict):
                continue
            status, host = job.get("status"), job.get("host") or {}
            if status == "uploading" and now - int(job.get("createdAt") or now) > UPLOAD_ABANDONED_S * 1000:
                self.fail_upload(job_id, "abandoned", "The upload did not finish, so it was cleared. Upload the file again.")
            elif status == "columns" and now - int((host.get("columns") or {}).get("askedAt") or now) > COLUMNS_WAIT_S * 1000:
                self.fail_upload(job_id, "unconfirmed", "The columns were not confirmed within a day, so the upload was cleared. Upload the file again.")
            elif status == "cancelled" and not host.get("cleared"):
                self.db.delete(f"uploadFiles/{job_id}")
                self.db.update(f"uploadJobs/{job_id}", {"host/cleared": True})
            elif status == "queued" or (status == "received" and now - int(host.get("receivedAt") or now) > RECEIVED_STUCK_S * 1000):
                waiting.append((int(job.get("createdAt") or 0), job_id, job))
        if not waiting:
            return None
        _, job_id, job = min(waiting)
        return job_id, job

    def fail_upload(self, job_id: str, code: str, message: str) -> None:
        LOG.info("Upload %s failed (%s): %s", job_id, code, message)
        self.db.update(f"uploadJobs/{job_id}", {"status": "failed", "host/error": {"code": code, "message": message},
                                               "host/finishedAt": SERVER_TIME, "host/cleared": True})
        self.db.delete(f"uploadFiles/{job_id}")

    def receive_file(self, job_id: str, job: dict) -> Path:
        chunks, packed = int(job.get("chunks") or 0), []
        for index in range(chunks):
            part = self.db.get(f"uploadFiles/{job_id}/c{index:03d}")
            if not isinstance(part, str):
                raise UploadProblem("incomplete", "The upload arrived incomplete. Upload the file again.")
            packed.append(base64.b64decode(part))
        data = b"".join(packed)
        if job.get("packedBytes") and len(data) != int(job["packedBytes"]):
            raise UploadProblem("incomplete", "The upload arrived incomplete. Upload the file again.")
        try:
            raw = gzip.decompress(data)
        except (OSError, EOFError):
            raise UploadProblem("unreadable", "The uploaded file could not be unpacked. Upload it again.")
        if len(raw) != int(job.get("bytes") or -1) or len(raw) > MAX_UPLOAD_BYTES:
            raise UploadProblem("incomplete", "The upload's size does not match the file. Upload it again.")
        if job.get("sha256") and hashlib.sha256(raw).hexdigest() != job["sha256"]:
            raise UploadProblem("checksum", "The upload was changed on the way (checksum mismatch). Upload it again.")
        folder = self.work_dir / safe_key(job_id).lstrip("-")
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / "upload.csv"
        path.write_bytes(raw)
        return path

    def read_columns(self, path: Path, job: dict, mapping: dict) -> dict:
        """How the batch API maps the file's columns to Acurion's fields, with the uploader's choices applied."""
        fields = {"mapping": json.dumps(mapping)} if mapping else {}
        code, answer = self.api.upload("/api/columns", fields, path, str(job.get("fileName")), timeout=180)
        if code == 404:
            raise UploadProblem("no_columns_api", "The batch API on the host has no /api/columns. Update Acurion on the host.")
        if code != 200 or not isinstance(answer, dict):
            raise UploadProblem("refused", detail_of(answer))
        names = [str(c) for c in answer.get("columns") or []]
        suggested = {f: c for f, c in (answer.get("suggested_mapping") or {}).items() if f in FIELDS and isinstance(c, str) and c}
        return given({
            "datasetType": answer.get("dataset_type") or "generic", "rows": answer.get("rows"),
            "rowsEstimated": bool(answer.get("rows_estimated")), "columns": profile_columns(path, names),
            "suggested": suggested, "fixed": [f for f in answer.get("fixed_fields") or [] if f in FIELDS],
            "missing": [f for f in answer.get("missing_required") or [] if f in FIELDS],
            "alternatives": {f: list(c) for f, c in (answer.get("alternatives") or {}).items() if f in FIELDS and c},
            "warnings": [short_reason(w, 400) for w in answer.get("warnings") or []][:4],
        })

    def ask_columns(self, job_id: str, review: dict, confirmed: bool) -> None:
        """Hand the file back to the uploader: the website shows the review and writes the confirmed mapping."""
        missing = [FIELD_LABELS.get(f, f) for f in review.get("missing") or []]
        message = f"Still needed: {', '.join(missing)}. Choose a column for each." if confirmed and missing else None
        LOG.info("Upload %s: waiting for the uploader to confirm the columns%s", job_id,
                 f" (missing {', '.join(missing)})" if missing else "")
        self.db.update(f"uploadJobs/{job_id}", {"status": "columns", "host/columns": given({**review, "askedAt": SERVER_TIME, "message": message}),
                                               "host/progress": {"note": "Waiting for the uploader to confirm the columns"}})

    def process_upload(self, job_id: str, job: dict) -> None:
        self.busy_job = job_id
        folder = None
        try:
            if self.api is None:
                raise UploadProblem("unavailable", "Upload scoring is not set up on this host.")
            self.db.update(f"uploadJobs/{job_id}", {"status": "received", "host/receivedAt": SERVER_TIME,
                                                   "host/progress": {"note": "Received by the Acurion host"}})
            path = self.receive_file(job_id, job)
            folder = path.parent
            # The review: the first time through, the uploader is always asked. Once asked (host/columns exists),
            # a job queued again carries the confirmed mapping; if a required field is still unmatched, ask again.
            confirmed = bool((job.get("host") or {}).get("columns"))
            mapping = clean_mapping(job.get("mapping")) if confirmed else {}
            order = mapping.pop("date_order", None)
            review = self.read_columns(path, job, mapping)
            if not confirmed or review.get("missing"):
                self.ask_columns(job_id, review, confirmed)
                return
            self.db.delete(f"uploadFiles/{job_id}")
            self.db.update(f"uploadJobs/{job_id}", {"host/cleared": True})
            fields = {"kind": "analyze", "model_set": "default", "source_timezone": "UTC"}
            if mapping:
                fields["mapping"] = json.dumps(mapping)
            if order:
                fields["day_first"] = "true" if order == "day_first" else "false"
            code, answer = self.api.upload("/api/v1/jobs", fields, path, str(job.get("fileName")))
            path.unlink(missing_ok=True)
            if code not in (200, 201, 202) or not isinstance(answer, dict) or not answer.get("job_id"):
                raise UploadProblem("refused", detail_of(answer))
            host_job = answer["job_id"]
            self.db.update(f"uploadJobs/{job_id}", {"status": "analysing", "host/jobId": host_job,
                                                   "host/progress": {"note": "Waiting to be analysed"}})
            last_note = None
            while not self.stopping.is_set():
                code, state = self.api.get(f"/api/v1/jobs/{host_job}", timeout=10)
                if code != 200 or not isinstance(state, dict):
                    raise UploadProblem("lost", f"The batch API lost the job ({code}): {detail_of(state)}")
                progress = given({k: (state.get("progress") or {}).get(k) for k in ("done", "total", "note")})
                if progress and progress != last_note:
                    self.db.update(f"uploadJobs/{job_id}", {"host/progress": progress})
                    last_note = progress
                if state.get("status") == "succeeded":
                    break
                if state.get("status") in ("failed", "cancelled"):
                    raise UploadProblem((state.get("error") or {}).get("code") or state["status"], detail_of(state))
                self.stopping.wait(2)
            if self.stopping.is_set():
                return
            code, result = self.api.get(f"/api/v1/jobs/{host_job}/result", timeout=60)
            if code != 200 or not isinstance(result, dict):
                raise UploadProblem("no_result", f"The result could not be read ({code}): {detail_of(result)}")
            finished = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            paths, summary = convert_result(job_id, job, result, finished_at=finished)
            paths[f"uploadJobs/{job_id}/status"] = "succeeded"
            paths[f"uploadJobs/{job_id}/host/summary"] = summary
            paths[f"uploadJobs/{job_id}/host/finishedAt"] = SERVER_TIME
            paths[f"uploadJobs/{job_id}/host/progress"] = {"note": "Finished"}
            self.db.update("", paths)
            LOG.info("Upload %s analysed: %s alerts, %s networks.", job_id, summary.get("alertsWritten"),
                     summary.get("networksWritten"))
        except UploadProblem as problem:
            self.fail_upload(job_id, problem.code, problem.message)
        except Exception as error:  # never stop the bridge for one upload
            LOG.exception("Upload %s failed", job_id)
            self.fail_upload(job_id, "internal", f"The host could not analyse this file ({type(error).__name__}).")
        finally:
            self.busy_job = None
            if folder is not None:
                shutil.rmtree(folder, ignore_errors=True)

    # -- loops --------------------------------------------------------------------------------------------

    def desk_loop(self) -> None:
        self.publish_status(force=True)
        self.measure_clock()
        while not self.stopping.wait(1):
            try:
                self.publish_status()
                self.poll_command()
            except Exception:  # a network blip: try again next second
                LOG.exception("Status or command round failed")

    def upload_loop(self) -> None:
        while not self.stopping.wait(2):
            try:
                found = self.next_upload()
                if found:
                    self.process_upload(*found)
            except Exception:
                LOG.exception("Upload round failed")

    def run(self) -> None:
        threads = [threading.Thread(target=self.desk_loop, name="desk", daemon=True)]
        if self.api is not None:
            threads.append(threading.Thread(target=self.upload_loop, name="uploads", daemon=True))
        for thread in threads:
            thread.start()
        try:
            while any(t.is_alive() for t in threads) and not self.stopping.is_set():
                time.sleep(0.5)
        finally:
            self.stopping.set()
            try:
                self.db.set("hostDesk/status", {"k7": {"state": "offline", "problem": "The bridge was stopped on the host."},
                                                "uploads": {"state": "offline"}, "bridge": VERSION,
                                                "stopped": True, "updatedAt": SERVER_TIME})
            except Exception:
                pass


class UploadProblem(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--desk", default="http://127.0.0.1:8002", help="the K7 demo desk (tools/k7_demo.py serve)")
    parser.add_argument("--api", default="http://127.0.0.1:8000", help="the batch web API that scores uploads")
    parser.add_argument("--no-desk", action="store_true", help="do not offer K7 Start/Pause")
    parser.add_argument("--no-uploads", action="store_true", help="do not take dataset uploads")
    parser.add_argument("--work-dir", default=None, help="where uploads are unpacked briefly (default: the temp folder)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db = FirebaseDB(os.environ.get("ACURION_FIREBASE_URL", ""), os.environ.get("ACURION_FIREBASE_CREDENTIALS", ""))
    desk = None if args.no_desk else LocalService(args.desk)
    api = None if args.no_uploads else LocalService(args.api, os.environ.get("ACURION_API_KEY") or None)
    bridge = Bridge(db, desk, api, work_dir=Path(args.work_dir) if args.work_dir else None)
    signal.signal(signal.SIGINT, lambda *_: bridge.stopping.set())
    print(f"Acurion website bridge {VERSION}: K7 desk {'off' if desk is None else args.desk}, "
          f"uploads {'off' if api is None else args.api}. Press Ctrl+C to stop.", flush=True)
    bridge.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
