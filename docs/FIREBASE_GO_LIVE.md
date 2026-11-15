# Going live on Firebase

This runbook connects the signed-in workspace on https://acurion.vercel.app to project `acurion-2bd21`, so that:

- Acurion K7's live alerts appear for every investigator;
- the Start button and dataset uploads reach the Acurion host;
- reviews, cases and the audit trail save for the whole team.

It takes about 15 minutes and needs **Owner or Editor access to the Firebase project**.

Nothing here changes the demo workspace. "Explore demo workspace" keeps working throughout.

The host computer (K7, upload scoring and the bridge) is set up separately with [HOST_SETUP.md](HOST_SETUP.md).

## Who can do what

There is no approval list any more. **Every account that signs in and verifies its email is an investigator (analyst).** Roles add or remove rights on top:

| Role | Set by | Can |
| --- | --- | --- |
| analyst (default) | nothing to do | Read every alert, transaction and network. Review alerts. Write case notes. Upload datasets |
| reviewer | `firebase/set_role.py` | Everything an analyst can, plus close alerts, file and close cases, create the team case vault, **start and pause K7** |
| admin | `firebase/set_role.py` | Same as reviewer |
| viewer | `firebase/set_role.py` | Read only |

Sign-up is open (Google, GitHub or email). The data is IBM's simulated bank data and the case workspace is end-to-end encrypted, so open sign-up is acceptable for this project. See [SECURITY.md](SECURITY.md).

## 1. Publish the database rules

1. Firebase console › **Realtime Database** › **Rules**.
2. Replace everything with the contents of [`firebase/database.rules.json`](../firebase/database.rules.json).
3. Click **Publish**.

What the rules do:

| Path | Read | Write from the website |
| --- | --- | --- |
| `alerts`, `transactions`, `networkReviews`, `accounts`, `graphData` | Verified users | Only the review fields of an alert (`status`, `owner`, `disposition`, `analystNote`, `reviewedAt`, `reviewedBy`). Only a reviewer or admin can set **Closed** |
| `auditLogs/{id}` | Verified users | Append only, signed with the writer's own user ID |
| `hostDesk/status`, `hostDesk/lastCommand` | Verified users | Never (the host bridge writes them) |
| `hostDesk/command` | Verified users | Reviewer or admin: `start` or `stop`, stamped with server time |
| `uploadJobs/{id}` | Verified users | Created once by its uploader; afterwards the uploader can only move it to `queued` or `cancelled`, and answer the column review (`mapping`, while the status is `columns`). Everything else is fixed, and `host/*` is written only by the bridge |
| `uploadFiles/{id}/cNNN` | Nobody | The uploader, once per chunk, while the job is `uploading` (at most 700 KB per chunk, 300 chunks) |
| `caseWorkspaces/{team}` | Analysts and up | Encrypted payload only; the version must rise by exactly 1. The vault is created once by a reviewer or admin |
| `roles/{uid}` | That user only | Never (set with `set_role.py`) |

The K7 host and the bridge use the service-account key, which bypasses these rules. That is why they can write alerts.

### Check the rules in the Rules Playground

In **Rules** › **Rules Playground**, simulate as an authenticated user with `email_verified: true`:

| Simulate | Expected |
| --- | --- |
| Read `/alerts` | Allowed |
| Set `/alerts/x/status` to `"investigating"` (the alert must exist) | Allowed |
| Set `/hostDesk/command` to `{"id":"t1","action":"start","by":"<that uid>","at":{".sv":"timestamp"}}` | **Denied** (not a reviewer) |
| The same command, after `set_role.py ... --role reviewer` for that UID | Allowed |
| Read `/uploadFiles` | Denied |
| The same read, simulated with `email_verified: false` | Denied |
| Set `/uploadJobs/<a job whose by is that uid and status is columns>/mapping/sender` to `"Acct Holder"` | Allowed |
| The same, as a different uid, or set `/uploadJobs/<that job>/fileName` | **Denied** |

**Republish the rules whenever `firebase/database.rules.json` changes in the repository.** The 16 Nov version adds the column review (`mapping`, status `columns`); without it, confirming a review on the website is denied.

## 2. Create an admin key (keep it private)

1. Firebase console › **Project settings** › **Service accounts** › **Generate new private key**.
2. Save the file **outside this repository**, for example `~/keys/acurion-admin.json`.
3. Never commit it, email it, or paste it into a `VITE_` variable.

The host computer needs a key too (K7 and the bridge use it). Make a second key for it, or share this one through a password manager, never in chat.

## 3. Give presenters the reviewer role

Each person signs up on the site and verifies their email. Their **Account ID** is on **System status**. For each presenter:

```bash
pip install firebase-admin
python3 firebase/set_role.py --key ~/keys/acurion-admin.json --uid <ACCOUNT_ID> --role reviewer
```

`--role admin` is for the project owner, `--role viewer` makes someone read-only, and `--role analyst` removes a role.

The **first reviewer or admin** to open Cases sets the team passphrase. Share it in person or through a password manager.

## 4. Optional: clear the old records

The database may still hold records from earlier model runs (keys such as `A_TX_…` and `TX_…`), and possibly an `ApprovedUsers` list. The website no longer needs them.

1. **Data** › the three-dot menu at the root › **Export JSON**. Keep the file as a backup.
2. Delete `mlRuns`, `ApprovedUsers` / `approvedUsers`, and, if you want only K7 and upload results in the queue, the old `alerts`, `transactions` and `networkReviews` records. Do not delete `auditLogs`, `caseWorkspaces` or `roles`.

The website reads the last 2,000 records of each list, ordered by key. K7's keys start with `k7-` and uploads' with `up-`, so they always sort after the old upper-case keys. Old records are therefore never the reason K7's alerts go missing.

## 5. Vercel settings

Vercel › Project › Settings › Environment Variables:

| Name | Value |
| --- | --- |
| `VITE_FIREBASE_READ_LIMIT` | `2000` (also the default now) |
| `VITE_GOAML_ENTITY_ID` | your goAML reporting entity ID (optional; fills `rentity_id`) |

Redeploy after saving. No other variable is needed: the website never holds a host address or a backend key.

## 6. Check it

1. Sign in with a verified account and open **System status** › **Check connection**. Every source should read **ready**.
2. Once the host is running ([HOST_SETUP.md](HOST_SETUP.md)), Platform services shows **Detection model: Acurion K7** as Ready, and a black K7 capsule appears in the header.
3. As a reviewer, open the capsule and press **Start**. Progress moves within a few seconds, and the first alert arrives within about a minute.
4. Open an alert, save a review, and confirm it appears under **Reports › Audit activity**.

## If something fails

| Message | Fix |
| --- | --- |
| "Your account cannot access these records" | The email is not verified, or the rules from step 1 are not published. |
| "Review was not saved" | The rules are not published, or the account is set to `viewer`. |
| The K7 capsule never appears | The host bridge is not running, or it uses a different Firebase project. Check `hostDesk/status/updatedAt` in **Data**: it should change every few seconds. |
| "A reviewer or admin starts K7" | Give that person the reviewer role (step 3), then reload. |
| "The Acurion host did not answer within 12 seconds" | The bridge stopped on the host. Restart `Start website bridge.bat`. |
| Cases says the team workspace needs an analyst role | The account is set to `viewer`. Remove the role with `--role analyst`. |
