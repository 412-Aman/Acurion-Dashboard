# Running the Acurion host (K7, uploads and the website bridge)

This is for whoever runs K7 for the team. The website lets investigators:

- press **Start** on Acurion K7, from any laptop and any browser;
- watch its progress and alerts arrive live;
- **upload a CSV dataset** and get it scored by the core model.

The models never run in the browser. They run on one host computer: yours. A small **website bridge** connects that computer to the website through Firebase.

```
Any browser ── Firebase (hostDesk, uploadJobs, uploadFiles) ── website bridge ── K7 demo desk   127.0.0.1:8002
                         alerts, transactions, networkReviews ◄─┘            └─ batch web API  127.0.0.1:8000 (+ job worker)
```

The browser never calls `127.0.0.1`. So:

- the website needs no `--site`;
- no browser asks for local-network permission;
- Safari works too;
- the batch API's key never leaves your computer.

## Answers to "READ ME FIRST - connect the website"

1. **The Start button.** It is built. It does not call `http://127.0.0.1:8002` from the page. The page writes a command to Firebase, the bridge forwards it as `POST /demo/start` or `/demo/stop`, and it publishes `GET /demo/status` back about once a second. Your desk is used exactly as documented.
2. **The approval list.** It is gone, so `ApprovedUsers` and `approvedUsers` no longer matter. Every signed-in account with a verified email can read the real database. Your teammate publishes the new rules with [FIREBASE_GO_LIVE.md](FIREBASE_GO_LIVE.md).
3. **Review buttons.** They save. The new rules allow the review fields (status, owner, outcome and note) for every verified investigator. Only reviewers and admins can close alerts, and only they can start or pause K7.
4. **Record keys.** The older records' keys start with upper-case letters (`A_TX_…`, `TX_…`), which sort before `k7-`. The site now reads the last 2,000 keys of each list by default, so K7's records are never cut off. Upload results use keys starting with `up-`, which also sort after the older ones.

Your alert format needed no changes. The site reads `riskScore` (0 to 1), `severity`, `reason` and `shapExplanation.topFeatures` (`feature`, `impact`), and draws the reasons as K7's contribution bars.

## What runs on the host

| # | What | Command | Port |
| --- | --- | --- | --- |
| 1 | K7 and its demo desk, publishing to Firebase | your start files, with the flags below | 8001 (real-time API), 8002 (desk) |
| 2 | Batch web API (scores uploads) | `python -m uvicorn api:app --host 127.0.0.1 --port 8000` | 8000 |
| 3 | Job worker (runs the upload jobs) | `python -m acurion.jobs worker` | none |
| 4 | Website bridge | `Start website bridge.bat` | none |

**Watch the 8001 clash.** `Start Acurion.bat` (the launcher) also starts a real-time API on 8001. If K7's demo already uses 8001, start the batch API and the worker with the two commands above instead of the launcher. Alternatively, give `k7_demo.py serve` another `--port`.

### 1. K7 publishing to Firebase

Add these flags to the `tools/k7_demo.py serve` line in your start file:

```
--publish firebase --alerts-path alerts --transactions-path transactions
```

`--site` is not needed, because the bridge calls the desk from the same computer.

K7 reads the database URL and key from these variables. The bridge uses the same two:

```
set ACURION_FIREBASE_URL=https://acurion-2bd21-default-rtdb.firebaseio.com
set ACURION_FIREBASE_CREDENTIALS=C:\keys\acurion-firebase.json
```

The key comes from your teammate (step 2 of [FIREBASE_GO_LIVE.md](FIREBASE_GO_LIVE.md)). Keep it outside every repository.

### 2 and 3. Upload scoring

Run both from the Acurion folder with Acurion's Python environment.

- **Development mode** (`set ACURION_ENV=development`): no key is needed, and the API answers only this computer, which is all the bridge needs.
- **Production mode:** set `ACURION_API_KEY` for the API, the worker and the bridge (the same value).

Uploads use `kind=analyze` and `model_set=default`, which is the core model.

### 4. The bridge

1. Copy `host/acurion_bridge.py` and `host/Start website bridge.bat` from the website repository into the Acurion folder, next to `api.py`.
2. Double-click `Start website bridge.bat`. It finds Acurion's environment the way `Start Acurion.bat` does, and asks for the key file if `ACURION_FIREBASE_CREDENTIALS` is not set.

It needs only Python and `firebase-admin`, which are already in the environment. Leave its window open. It prints one line per command and per upload.

Options:

- `--no-uploads`: K7 only.
- `--no-desk`: uploads only.
- `--desk URL` / `--api URL`: other ports.

## What the bridge does

- **Status, about once a second.** It reads the desk's status and the batch API's health, and writes them to `hostDesk/status` with the server time. The website treats the host as offline after 15 seconds without an update.
- **Commands.** It reads `hostDesk/command`, which only reviewers and admins can write, and calls `POST /demo/start` or `/demo/stop` once. It answers in `hostDesk/lastCommand`.
  - It never carries out a command older than one minute, or one that was waiting when the bridge started. A Start left in the database overnight therefore never starts the recording.
- **Uploads, oldest first, one at a time.**
  1. It rebuilds the file from its chunks.
  2. It checks the size and SHA-256.
  3. It deletes the chunks from Firebase.
  4. It sends the file to `POST /api/v1/jobs` and follows the job's progress.
- **Results.** It writes the analysis to Firebase:
  - up to 150 alerts: every high-risk transfer, then the 50 strongest medium-risk ones;
  - their transfers;
  - the 15 riskiest networks, with up to 40 transfers each;
  - a summary: counts, trust level, warnings, and precision and recall when the file has a label column.

  Failures carry the API's own sentence, for example "The file has no Timestamp column."
- **Clean-up.** Uploads that never finish are cleared after 30 minutes. Cancelled uploads have their chunks removed.

Measured on a Mac with the real API: one day of HI-Small (482,089 transfers, 43 MB) was uploaded in 22 chunks and analysed. 49 high-risk transfers and 29 networks came back in about 15 seconds after it arrived.

## Before the presentation

The recording holds about 30 minutes of payments and cannot be rewound. Only reviewers and admins can press Start, so nobody uses it up by accident. Rehearse with a fresh store, then rebuild it before the real run.

**Rehearsal checklist:**

1. Start K7 and wait for `ready` (1 to 6 minutes). Then start the batch API, the worker and the bridge.
2. On another laptop, sign up with a new account and verify the email. The account sees the alerts but has no Start button.
3. Sign in as a reviewer, in Chrome and in Safari:
   - The K7 capsule in the header shows **Ready**.
   - Open it and press **Start**. Progress moves within a few seconds.
   - The first alert opens the capsule as a notification within about a minute.
   - Open the alert: K7's reasons are drawn as bars.
4. Upload a CSV with **Upload dataset**:
   - The dialog moves from Sent, to Received, to Analysing, to Results.
   - **Open N alerts** shows only that file's alerts.
   - **View networks** shows its networks.
5. Press **Pause**, then stop the bridge. Within 15 seconds the capsule disappears and System status shows the host as offline.
