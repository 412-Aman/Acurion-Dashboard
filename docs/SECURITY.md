# Security controls

## Encrypted case workspace

Customer profiles, screening findings, cases, uploaded documents and alert reviews are stored as
one encrypted record (`src/lib/complianceStore.js`, `src/lib/vault.js`).

- **Cipher:** AES-256-GCM with a fresh random 96-bit IV for every save. Any change to the ciphertext makes decryption fail.
- **Key:** derived from the workspace passphrase with PBKDF2-SHA-256, 310,000 iterations and a random 128-bit salt. The passphrase is never stored or sent.
- **Key handling:** the derived key is a non-extractable WebCrypto key, cached in IndexedDB for at most 8 hours so pages don't ask again. It is deleted on **Lock workspace**, on sign-out and after 15 minutes without activity.
- **Where data lives:** the demo workspace is stored encrypted on the device. The live workspace is stored encrypted at `caseWorkspaces/{team}` in Firebase, so Firebase and Google only ever hold ciphertext. Any earlier plaintext copy is deleted once encrypted.
- **No silent fallback:** if the workspace can't be opened, it stays in memory and saving is switched off with a visible message. It never falls back to unencrypted storage.

## Tamper-evident audit trail

Every workspace change appends an event whose hash covers its content and the previous event's
hash (`src/lib/auditChain.js`, SHA-256 in `src/lib/sha256.js`). **Reports › Audit activity ›
Verify integrity** walks the chain and names the first edited, deleted or reordered event.
Live alert reviews are also written to `auditLogs`, where the database rules make entries
append-only.

## Signed report exports

**Export signed** (`src/lib/reportExport.js`) produces a JSON package containing the report,
goAML-structured XML, the audit-chain status, a SHA-256 fingerprint and an ECDSA P-256 signature.
The signing key is generated in the browser and its private half never leaves IndexedDB.
**Verify a report file** on Reports checks both the fingerprint and the signature, so any edit
after export is detected.

## Access control

Firebase rules (`firebase/database.rules.json`) require a signed-in account with a verified email
for every read. Every verified account is an investigator (analyst): it reviews alerts, edits
cases and uploads datasets. `roles/{uid}` adds rights (reviewer and admin also close alerts, file
cases, set the team passphrase and start or pause Acurion K7) or removes them (viewer is read-only).
Roles are set only with the service-account key (`firebase/set_role.py`), never from the browser.
The interface shows your role in the account menu and disables actions your role can't perform.

Sign-up is open, so anyone who verifies an email can read the workspace. That is a deliberate choice
for this project: the records are IBM's simulated bank data, and case contents are end-to-end
encrypted. For real customer data, restore an approval list or restrict sign-up to the
institution's domain in the rules.

## Acurion host and dataset uploads

The models run on one host computer, never in the browser, and the browser never connects to it.
Commands and files pass through Firebase, where the rules check them; the host bridge
(`host/acurion_bridge.py`) uses the service-account key on the host.

- **Start / Pause:** only reviewers and admins can write `hostDesk/command`, and only `start` or
  `stop` stamped with server time. The bridge carries out a command once, never one older than a
  minute, and never one written before it started.
- **Uploads:** a CSV up to 100 MB is gzip-compressed and fingerprinted (SHA-256) in the browser and
  written as base64 chunks to `uploadFiles/{id}`. No browser can read those chunks back. Only the
  uploader can write them, once each, while the upload is open. The bridge checks the size and the
  fingerprint, asks the batch API (on `127.0.0.1`, with the API key, which never leaves the host)
  how the columns map, and writes that review to the job. Nothing is scored until the uploader
  confirms the mapping; only the uploader can write `uploadJobs/{id}/mapping`, only field names
  from Acurion's schema, only while the job waits in status `columns`. The chunks stay until the
  file is submitted, then they and the host's unpacked copy are removed. The review's sample
  values (three per column) are visible to every signed-in investigator, like the results.
- **Abuse limits:** 300 chunks of at most 700 KB per upload. The host takes one upload at a time,
  clears uploads that never finish after 30 minutes and reviews not confirmed within a day. A
  determined signed-in user could still fill the database's free quota with repeated uploads;
  restrict sign-up if that matters.

## Browser hardening

`vercel.json` sends these headers on every page:

- **Content-Security-Policy:** scripts only from this site, Google sign-in and Firebase, plus five SHA-256-pinned inline scripts for the background animation. No `unsafe-inline` scripts or `eval`. No framing (`frame-ancestors 'none'`). No plugins.
- **Other headers:** HSTS (2 years, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a strict referrer policy, and a Permissions-Policy that denies camera, microphone, location and payment.
- **Testing locally:** `vite preview` serves the same headers.

If the background animation (`src/components/ui/gateway-flow.tsx`) is edited, its script hashes
change. Run `npm run build && npx vite preview`, open the sign-in page and the overview, and copy
the `sha256-…` values Chrome reports in the console into `vercel.json`.

## Screen sharing

**Account menu › Mask personal data** blurs customer names, account IDs and the signed-in email
across the app, for presenting or screen sharing.

## Known limits

- A workspace passphrase can't be recovered. In the demo, **Reset demo workspace** starts again.
- Case data is encrypted as one team record, so database rules can check who writes and the version number, but not individual case fields. Role checks for case actions are enforced in the interface.
- The Firebase web API key in `src/lib/firebase.js` identifies the project and is public by design. Access is controlled by the rules above.
