# Firebase connection setup

The existing `acurion-2bd21` endpoint denies unsigned reads. Console access was unavailable, and the user deferred replacing it. The frontend corrections cannot grant permission to a project or prove that it contains data.

## Run the prototype now

Start `npm run dev`, open login, and choose **Explore demo workspace**. This is an explicit session-only switch to fictional data. Exit demo from the account menu to return to sign-in. `VITE_DEMO_MODE=true` remains available for an intentionally offline development build.

## Connect a project later

1. Create the project's web app; enable Email/Password authentication. Enable client sign-in with `VITE_AUTH_ENABLED=true`. Registration is optional and requires `VITE_AUTH_SIGNUP_ENABLED=true`; keep it disabled for administrator-provisioned accounts. Account creation does not grant institution roles or data permissions. Follow [auth setup](AUTH_AND_MOTION.md) for providers and email actions.
2. Copy `.env.example` to `.env.local` and fill the new project ID, API key, auth domain, exact Realtime Database URL and app ID together. Restart Vite after changing environment values. Local environment files are ignored by Git.
3. Create/import data into the paths specified by `VITE_FIREBASE_*_PATH`. Transactions, alerts and audit events are separate resources. A model pipeline writing only transactions does not create alerts automatically in live mode.
4. Restrict read/write access to authorized users and roles using server-enforced Firebase rules. Do not set public read or write just to make records appear. Web client configuration is public identification; Admin/service-account secrets must never be put in VITE variables.
5. Sign in and open **System status**. `ready` means a source read succeeded; `empty` means a permitted read found no records; `error` identifies a failed read. Permission errors do not mean an empty dataset. Check source paths if reads are empty.
6. Verify review writes against the project's approved rules before using them. The adapter updates permitted review fields and appends an RTDB audit event in one atomic update. Rules must independently prevent unauthorized actors from editing records or rewriting audit entries; client validation is not access control.

The frontend reads at most 500 records per configured RTDB source by default (adjustable from 25 to 2,000), ordered by Firebase key. This is a bounded sample, not full historical pagination or guaranteed chronological recency. Audit combines accessible Firestore and RTDB entries and identifies independent source failures. The graph preserves a transaction-derived view even if optional account/graph enrichment cannot be read.

## References

- [Realtime Database web reads and writes](https://firebase.google.com/docs/database/web/read-and-write)
- [Realtime Database rules and authentication](https://firebase.google.com/docs/database/security/rules-conditions)
- [REST authentication](https://firebase.google.com/docs/database/rest/auth)

No Firebase project, billing plan, remote data or access rules were changed by this task.
