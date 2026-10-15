# Firebase connection setup

The existing `acurion-2bd21` endpoint denies unsigned reads. Console access was unavailable, and the user deferred replacing it. The frontend corrections cannot grant permission to a project or prove that it contains data.

## Run the prototype now

Start `npm run dev`, open login, and choose **Explore demo workspace**. This is an explicit session-only switch to fictional data. Exit demo from the account menu to return to sign-in. `VITE_DEMO_MODE=true` remains available for an intentionally offline development build.

## Connect a project later

1. Use the existing project's web app or create a replacement, and enable Email/Password authentication. Client sign-in and registration are enabled by default. For older environments, set `VITE_AUTH_ENABLED=true` and `VITE_AUTH_SIGNUP_ENABLED=true`; disable registration only for administrator-provisioned accounts. Account creation does not grant institution roles or data permissions. Follow [auth setup](AUTH_AND_MOTION.md) for providers and email actions.
2. Copy `.env.example` to `.env.local` and fill the new project ID, API key, auth domain, exact Realtime Database URL and app ID together. Restart Vite after changing environment values. Local environment files are ignored by Git.
3. Create/import data into the paths specified by `VITE_FIREBASE_*_PATH`. Transactions, alerts and audit events are separate resources. A model pipeline writing only transactions does not create alerts automatically in live mode.
4. Restrict read/write access to authorized users and roles using server-enforced Firebase rules. Do not set public read or write just to make records appear. Web client configuration is public identification; Admin/service-account secrets must never be put in VITE variables.
5. Sign in and open **System status**. `ready` means a source read succeeded; `empty` means a permitted read found no records; `error` identifies a failed read. Permission errors do not mean an empty dataset. Check source paths if reads are empty.
6. Verify review writes against the project's approved rules before using them. The adapter updates permitted review fields and appends an RTDB audit event in one atomic update. Rules must independently prevent unauthorized actors from editing records or rewriting audit entries; client validation is not access control.

The frontend reads at most 500 records per configured RTDB source by default (adjustable from 25 to 2,000), ordered by Firebase key. This is a bounded sample, not full historical pagination or guaranteed chronological recency. Audit uses RTDB by default. Historical Firestore audit can be explicitly included with `VITE_FIREBASE_LEGACY_FIRESTORE_AUDIT=true`; only that opt-in mode reads both sources and reports their independent outcomes. The graph preserves a transaction-derived view even if optional account/graph enrichment cannot be read.

## Missing records after sign-in

System status shows the signed-in account's UID, the Realtime Database URL and exact paths. Have the project administrator confirm that the records are in Realtime Database, not only Cloud Firestore, and that this specific user is permitted to read the configured paths. Do not open database access to all newly registered accounts as a shortcut. The RTDB SDK may reject `get()` with a plain `Error("Permission denied")` without an error code; the adapter now classifies that as `database/permission-denied` instead of discarding it as `data/read-failed`. Timeouts, network failures and missing indexes remain separate diagnostics. A Firestore audit timeout does not establish whether RTDB transactions exist or are readable.

## Read-only audit access for the current prototype

The team's published rules currently permit reads of transactions and alerts only. For the administrator to add audit viewing, use [the read-only rules example](../firebase/database.rules.readonly.example.json). Replace `REPLACE_WITH_YOUR_FIREBASE_UID` with the approved analyst's **Account ID** from System status, then review and publish it under **Realtime Database → Rules** in the existing project. The example preserves the existing transaction/alert rules and grants audit reads only to that chosen UID. It has not been published automatically. The existing broad transaction/alert reads are appropriate only to the team's current prototype access decision; institutional data needs approved-user access throughout.

After publishing, refresh the app and check the audit source. `ready` means audit records were read; `empty` means the authorized path has no records. The rules keep all client writes disabled, so analyst review saving and new audit-event creation remain unavailable until an approved write policy is implemented. Do not fabricate historical audit entries to remove an empty state. This example does not provide immutable institutional audit storage.

## References

- [Realtime Database web reads and writes](https://firebase.google.com/docs/database/web/read-and-write)
- [Realtime Database rules and authentication](https://firebase.google.com/docs/database/security/rules-conditions)
- [REST authentication](https://firebase.google.com/docs/database/rest/auth)

No Firebase project, billing plan, remote data or access rules were changed by this task.
