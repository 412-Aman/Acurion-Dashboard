# Acurion - AML intelligence prototype

Vite + vanilla JS + Tailwind + Firebase + Cytoscape. A monochrome AML investigation prototype with transaction views, case evidence and a browser compliance sandbox.

## Run

```sh
npm install
npm run dev
```

Firebase replacement is deferred. Open `login.html` and choose **Explore demo workspace** to review fictional records without credentials. Default live mode still requires an authorized Firebase account. For an intentionally offline development build:

```sh
VITE_DEMO_MODE=true npm run dev
```

Open `/compliance.html` for KYC profiles, dynamic rule scores, PEP relationships, sanctions/counterparty review, media evidence, transaction monitoring, investigations/STR drafts and retention policy. This workspace always uses fictional data in browser storage, including when legacy pages use Firebase. Do not enter real customer data or upload real documents.

```sh
npm run build
npm test
```

## Pages

- `compliance.html`: browser compliance sandbox
- `index.html`: transaction/alert overview
- `alerts.html`: source/rule alert queue and saved analyst reviews
- `transactions.html`: source transactions and account lookup
- `graph.html`: directed paths, bounded neighborhoods and evidence capture
- `reports.html`: case draft exports, audit activity and working drafts
- `login.html`: email/provider sign-in or explicit demo entry
- `signup.html`: account registration
- `forgot-password.html`: password recovery
- `verify-email.html`: email verification and resend
- `auth-action.html`: reset-password and verification email links
- `system.html`: verified source checks and connection setup

The existing Firebase data service supports IBM AML, PaySim and IEEE CIS schemas. The reusable deterministic AML rules are in `src/lib/amlEngine.js`; sandbox storage is in `src/lib/complianceStore.js`. No model training was changed, no paid services were added, and no real payment block or regulatory filing is performed.

Read [the project review](docs/PROJECT_REVIEW.md) for the architecture, feature-by-feature production gaps, source research, cost constraints and ML teammate handoff. The sandbox is not secure institutional record storage and its activity log is not immutable.

## Sanctions list import

See `docs/watchlist-example.json` for normalized fields. Import JSON through Screening, then run screening and review candidate identities. A no-match outcome does not certify a customer as clean.

Download official UN XML from the [UN consolidated list page](https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list), then convert it without extra packages:

```sh
python3 scripts/convert-un-list.py /absolute/path/consolidated.xml /absolute/path/un-list.json
```

Automatic feed updates, live news ingestion, secure server storage and goAML submission still need server/institution integrations described in the review.

## Integrated React components

The app now also supports React 19 / TypeScript islands and a shadcn-compatible component folder. The navigation keeps all main pages visible in stable Investigate, Due diligence and Manage groups, with direct rail shortcuts and breadcrumbs. Header notifications use Live Notification Feed; the login and overview use Gateway Flow; **Reports & audit → Working drafts** includes HoldButton and Shredder with recoverable disposal.

See [component integration notes](docs/COMPONENT_INTEGRATION.md) for exact source provenance, dependencies, setup and validation.

## Report-aligned investigation flow

1. **Rules & simulation:** run a deterministic velocity or near-threshold scenario, or import canonical synthetic events. Duplicate IDs are skipped; conflicts/invalid events retain validation errors.
2. **Alerts:** open the generated rule alert, inspect its transaction/account links, assign an investigator and record a review note.
3. **Cases:** create a demo case from the alert; save narrative and grounds. Review fields and evidence have separate tabs.
4. **Account network:** inspect bounded neighborhoods or trace a directed dated path; attach the observed evidence to the case.
5. **Reports & audit:** export the case draft and inspect source-labelled activity. JSON reports are prototype review packages, not regulatory submissions.

[Report alignment](docs/REPORT_ALIGNMENT.md) maps the supplied handbook to implemented features and remaining work. [Firebase setup](docs/FIREBASE_SETUP.md) documents the deferred replacement. [Data contracts](docs/DATA_CONTRACTS.md) defines event, alert, graph and model handoff fields.

**System status** shows actual data-read outcomes and last successes. The app awaits restored authentication, bounds data reads, surfaces permission/timeout errors, and never replaces missing live records with demo graphs or trends. `.env.example` lists the new project configuration and source path variables. No new Firebase project, access grant or paid service was created.

Model training, calibration, evaluation and SHAP/GNN explanation generation remain with the ML teammate. Secure case persistence/RBAC and Kafka/Flink/Neo4j/API integration remain backend work.

## Authentication and motion

The auth pages share the dashboard's monochrome layout. Google, GitHub and Apple buttons use Firebase provider sign-in; registration, recovery and email verification use Firebase Auth. These operations remain disabled until the deferred replacement project is configured. [Authentication and motion setup](docs/AUTH_AND_MOTION.md) lists the required settings, provider prerequisites and validation limits.

Buttons have eased hover, press and focus states. Page changes fade smoothly, local views remain responsive during animation, and the sidebar selection glides between destinations. Rapid clicks select the latest destination. Reduced-motion preferences are respected.
