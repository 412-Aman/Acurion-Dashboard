# Report alignment and application workflow

The supplied Acurion handbook describes an investigation platform, with an end-to-end event, alert, evidence, review and report flow. This implementation fills the software gaps in the browser prototype. It does not implement the handbook's model experiments or claim that its proposed infrastructure already exists.

## Navigation

All primary destinations remain visible in one sidebar. The narrow rail offers direct shortcuts; it no longer changes which destinations are visible.

| Group | Pages | Purpose |
| --- | --- | --- |
| Workspace | Overview | Priority alerts and next steps |
| Investigate | Alerts, Cases, Transactions, Account network | Follow one item through review and evidence |
| Due diligence | Customers & KYC, Screening | Customer lifecycle, PEP/sanctions/media review |
| Manage | Reports & audit, Rules & simulation, Policies & retention, System status | Exports, testing, policy and connection checks |

Case drawers split Review & report from Evidence & activity. External filing and retention dates sit in an expandable section. Reports open on case reports; audit and working drafts have their own tabs. The supplied HoldButton, Shredder, Live Notification Feed and Gateway Flow remain available. The main pages and source files contain no em dashes.

## Implemented gaps

| Handbook requirement | Implementation | Limit |
| --- | --- | --- |
| Repeatable input | Canonical synthetic JSON import; deterministic velocity and near-threshold scenarios | Browser input, not Kafka |
| Validation and failures | Required IDs, positive finite amount, ISO timestamp/timezone, currency, explicit synthetic flag; rejected IDs and reasons retained | No sensitive raw rejected payloads stored |
| Duplicate handling | Repeated identical events skipped; conflicting event IDs rejected | Local data, no distributed ingestion |
| Behavioral features | Unique event count, incoming/outgoing amounts, maximum outgoing amount, distinct counterparties over event-time window | Per currency; no invented FX rates |
| Configurable rules | Income, amount, bulk/volume plus velocity and near-threshold patterns; pattern toggles; policy snapshot and window retained | Deterministic policy points, not trained probabilities |
| Alert lifecycle | Open, Assigned, Under review, Escalated, Closed; investigator, note, disposition and audit | Demo reviews persist in browser; Firebase atomic write adapter is prepared but not verified against a new project |
| Risk prioritization | Active review items first, then severity and event time | Rule points never added to model scores |
| Source traceability | Exact alert-to-transaction/account links, source fields, supplied versions, missing-data labels | Bounded loaded sample, not all historical records |
| Directed graph | Separate edges per transfer; dates/amounts/IDs; relationship and date/currency/amount filters; 1–3-hop neighborhoods, 100-account bound | Loaded sample, no Neo4j service |
| Layering review | Directed path with nondecreasing timestamps, at most 6 transfers and bounded search | Observed path is a lead, not a laundering finding |
| Shared relationships | Only supplied links with provenance in live data; explicitly synthetic links in demo | No guessed device/IP/location identity links |
| Evidence custody in prototype | Neighborhood/path capture, source IDs, filters, timestamps, case activity | Browser storage is editable, not immutable |
| Case report | Actual case draft with referenced transactions, captured alert, graph evidence, notes, source mode, policy and activity | JSON draft, not submitted STR/SAR or validated goAML XML |
| Connection health | Explicit signed-in state, per-source success/empty/error, last successful read, retry and bounded read counts | No unimplemented stream/model/API status advertised as healthy |

KYC, risk history, PEP relationships, manual screening dispositions, media sources, document metadata, legal holds and retention controls remain in the browser sandbox. Approval does not bypass sanctions review.

## Removed or simplified

- Changing sidebar categories that concealed destinations and duplicated shortcuts.
- Repeated compliance tabs and generic counters on every settings/investigation page.
- A generic audit-count summary presented as regulatory report generation.
- Silent live-to-demo graph and trend fallbacks.
- Fabricated GNN explanations, model confidence, scores derived from dataset ground-truth labels, calendar dates derived from relative dataset time, fallback USD currency, and identities derived from payer email domains.
- Random demo record regeneration between pages, fabricated automatic incoming alerts, and unused graph-layout plugin registration.
- Unused analytics initialization. Authentication and data reads do not depend on analytics.

## Firebase diagnosis and deferred setup

On 13 October 2026, the configured Realtime Database endpoint for `acurion-2bd21` responded to an unsigned, shallow transaction lookup with HTTP 401 and `Permission denied`. This confirms that the endpoint responds and denies that unsigned read; it does not establish whether records are present or whether a permitted application user can read them. The Google account available in the Firebase console was denied project access. No authorized application session or project administration access was available to verify its actual data or security rules.

The original frontend started protected reads while Firebase restored authentication, did not surface read failures, and labelled the workspace as Firebase-connected without a verified read. Those frontend problems are addressed by awaiting restored authentication, timeouts, visible failures, retries, and verified source diagnostics. Configuration is now replaceable using the environment example. Partial new-project configuration produces an explicit setup error.

The user chose to defer creating a new Firebase project. No new project, paid service, database import, remote rule, user/role grant or deployment was performed. Use the explicit Explore demo workspace action in login while setup is pending. Demo mode does not read or write remote transaction data. All compliance cases remain prototype records in browser storage.

See [Firebase setup](FIREBASE_SETUP.md) and [Data contracts](DATA_CONTRACTS.md) for the remaining integration.

## Work left with the ML teammate

Training and comparison of Isolation Forest, Random Forest, XGBoost, SVM, GCN, GraphSAGE and GAT; dataset/preprocessing audits and leakage-safe splits; feature encoders; inference artifacts; score calibration; SHAP/GNNExplainer generation; drift checks; measured precision, recall, PR-AUC, confusion matrices, latency and throughput. The browser shows actual supplied explanations when available. No model has been trained or evaluated in this change.

## Remaining software infrastructure

The new Firebase project and authorized data producer must be connected later. Server RBAC, immutable audit/evidence, institution isolation, concurrent case updates, encrypted evidence storage, server-side validation, durable retention and backups remain backend work. Kafka/Flink/Neo4j/PostgreSQL/FastAPI are proposed architecture components, not deployed services. Automated sanctions/media feeds and real FIU filing remain external integrations. No production readiness or regulatory certification is claimed.

## Validation

Automated tests cover normalization without fabricated data; canonical/legacy schema handling; required analyst review fields; event validation, label exclusion, duplicates/conflicts; event-time/currency isolation; rule toggles; priority ordering; directed chronological paths; neighborhood bounds; graph filtering; evidence persistence/report bodies; and read timeout/permission messages, alongside the existing AML and draft recovery tests.

Browser verification covers explicit demo entry, unsigned connection state, generated rule alerts, duplicate scenario replay, saved review/audit, alert escalation, case narrative, graph capture/path, report download, source-labelled audit, transaction deep links, working drafts, notifications and mobile navigation. The new Firebase project's authenticated reads/writes remain untested because setup is deferred.
