# Acurion project review and implementation boundaries

Reviewed 12 October 2026. No paid service, subscription, account or cloud deployment was created.

## Existing architecture

Acurion is a Vite multi-page application using vanilla JavaScript, Tailwind v4, anime.js and Cytoscape. Pages are overview, alerts, transactions, graph, reports and Firebase login. Shared layout lives in `src/components/layout.js`; styles in `src/styles/main.css`. Firebase Auth, Realtime Database and Firestore are initialized in `src/lib/firebase.js`. The Firebase client configuration is embedded in the existing source; these public client values are not server credentials. Access must be protected by backend authorization rules, which are absent from this checkout.

`src/lib/dataService.js` reads transaction datasets (IBM AML, PaySim and IEEE CIS), normalizes them for the UI and subscribes to alerts. It does not implement Kafka/Flink ingestion, train models, enforce payment decisions or manage customers. Some labels and metrics previously implied these capabilities; the transaction subtitle and overview metric cards now describe loaded records instead. The retained demo datasets and graph include synthetic SHAP/GNN explanations. Fraud dataset labels are not legal determinations of money laundering.

No server, Firebase rules, payment gateway, scheduled ingestion, database migration, tests, jurisdiction policy engine or production evidence store was supplied. Existing Firebase was not modified remotely. The new compliance workspace is deliberately identified as a browser sandbox and does not intermingle fictional profiles with live bank transactions.

## Implemented software

| Requested feature | Working implementation | Production work remaining |
| --- | --- | --- |
| KYC / onboarding | Individual/company profiles, funds, income, expected activity, identity references, manual KYC status, review dates | Identity verification integration, beneficial ownership verification, officer approval, durable backend |
| Dynamic customer risk | Explainable deterministic policy points, recalculation on profile/rule/screening/activity changes, timestamped history | Policy calibration and compliance approval, scheduled lifecycle reviews; not ML training |
| PEP and connections | Foreign/domestic/international PEP, family/associate flags, related-customer reference, ◆ indicator, high risk floor | Reliable public-office/PEP sources, relationship verification, EDD and senior management controls |
| Counterparty / sanctions screening | Customer and counterparty name/alias matching, supporting identifier comparison, match queue, false-positive/confirmed dispositions, list imports | Scheduled authoritative list updates, transliteration, sanctions-measure/ownership resolution, current applicable UAE and other lists, payment enforcement |
| Black/grey/white categories | Confirmed sanctions restriction, review flag, analyst-recorded internal approval | Approval expiry and dual approval on server; internal approval never overrides sanctions or monitoring |
| Adverse media | Dated source URL, allegation assessment, minor/major categories, human identity review | Automated search ingestion, source licensing and coverage, multilingual disambiguation; no global social-media/public-record crawler is claimed |
| Income / thresholds / bulk transactions | Currency-matched comparisons, rolling outgoing volume, repeated large transfer detection, configured country review policy | Real profiles mapped to live transaction IDs, verified FX rates, deduplication and reliable transaction timestamps |
| Supporting documents | Sandbox PDF/image/text upload, SHA-256 metadata, review action, download | Encrypted object storage, malware scanning, RBAC, signed access, backup/restore and evidence custody |
| Internal reporting / STR / SAR | Create investigation from transaction, owner, grounds, narrative, case workflow, JSON draft package, record reference from an external filing | Reporting officer authorization, FIU/goAML registration, jurisdiction-specific validated XML, receipt reconciliation. No filing is performed by this application |
| FATF alignment | Visible mapping to R1, R10, R11, R12, R6/7 and R20 | A governance/control framework and jurisdictional legal assessment; software does not certify FATF compliance |
| Retention / records | Configurable years, jurisdiction overrides, latest recorded closure/relationship/inspection/judgment-based eligibility and legal holds, sandbox activity export | Verified record-type-specific triggers and source events, append-only audit, server retention enforcement, secure archive and controlled disposal |
| Professional UI | Neutral charcoal/white/grey across all pages, charts and graph; textual severity and different badge borders, responsive compliance panels | Institutional brand/accessibility review |

The sandbox is stored in localStorage under `acurion.compliance.sandbox.v1`. It is neither encrypted nor immutable. Browser storage can be cleared, edited or exhaust its quota. Do not put real PII, KYC documents or regulated records into it. JSON workspace exports contain all sandbox evidence, including uploaded document content. Case draft exports include document hashes/metadata rather than file bodies.

The rule engine is reusable pure JavaScript (`src/lib/amlEngine.js`). It uses only transactions at or before each evaluated transaction time, within the configured window and currency. Cross-currency comparisons flag for review until a verified conversion exists. An unmatched name does not prove innocence, and a name match never auto-confirms identity. Potential hits flag; a manually confirmed sanctions hit yields only a **simulated** block. The production decision must interpret the actual designation measures and applicable law.

## Free data and software strategy

- **UN sanctions:** [official consolidated list](https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list) offers XML, HTML and PDF. Download XML from that page; run `python3 scripts/convert-un-list.py /absolute/path/consolidated.xml /absolute/path/un-list.json`; import the JSON in Screening. The converter does not download or refresh data. It retains reference, source and snapshot provenance; confirm the sanctions measures separately.
- **OFAC:** [Sanctions List Service](https://ofac.treasury.gov/sanctions-list-service) provides official downloadable lists. Add a format adapter to the documented normalized list schema; applicability depends on the institution and transaction jurisdiction. This is a researched source option, not an implemented automatic connector.
- **News:** [GDELT data](https://gdeltproject.org/data.html) is free and open. Use a server adapter for news discovery, then store URL, timestamp and analyst finding. GDELT is not a verified background-check database, and it does not establish complete global coverage. No live GDELT ingestion is implemented yet.
- **PEPs:** combine customer declaration, beneficial owner/relationship checks and verified government/parliament/public-office sources. No authoritative, complete global PEP source has been connected. Do not assume a commercial dataset or aggregated dataset is free for institutional use.
- **Commercial products:** [LSEG World-Check One](https://www.lseg.com/en/risk-intelligence/screening-solutions/world-check-kyc-screening/one-kyc-verification) advertises a free trial. A trial is not a lasting free plan. No World-Check, Firco or Dow Jones account/API has been configured or purchased. These were references in the brief, not project dependencies.
- **Firebase:** [Spark and Blaze plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) distinguish no-cost Spark from usage-billed Blaze. Do not upgrade billing under this brief. Check the [current pricing](https://firebase.google.com/pricing) for each needed product; file storage and server scheduling must not be assumed available on Spark. Existing client SDK dependencies were sufficient for this local implementation.

No service promises to scan every outlet, every social platform and all public records globally. Coverage, access rights and false positives must be recorded and assessed.

## Regulation research

The [FATF Recommendations](https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html) are international standards implemented through national law, not a live software API. Policy versioning, explanation history and a control map support review but do not constitute compliance.

[FATF PEP guidance](https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Peps-r12-r22.html) covers PEPs, families and close associates and explicitly describes the measures as preventive. PEP status does not mean criminal activity, and a purchased database alone is insufficient for compliance.

[CBUAE suspicious reporting guidance](https://rulebook.centralbank.ae/en/rulebook/guidance-licensed-financial-institutions-suspicious-transaction-reporting) describes FIU/goAML reporting and investigation records. A downloaded JSON narrative is not a filed STR/SAR or a goAML-valid XML report. Actual submission requires the authorized institution's process.

[CBUAE record-keeping rules](https://rulebook.centralbank.ae/en/entiresection/43) describe at least five years and, where relevant, the latest of relationship termination/account closure, occasional transaction completion, supervisory inspection, investigation or final court judgment. The sandbox allows later relationship, inspection and judgment dates to extend a closed case's retention clock; the institution must verify the full set of applicable triggers and record-type policies before regulatory use. Jurisdiction override examples in the UI are formatting examples, not verified local-law defaults.

## ML teammate handoff

Leave these with the model team: training/validation of the GNN and anomaly models; SHAP generation; labelled AML/fraud dataset selection and leakage checks; precision/recall and false-positive evaluation; multilingual NLP entity linking, transliteration and media classification if learned rather than rule-based; model calibration/drift detection. No training or model changes were made here.

The software team owns onboarding/forms, screening feeds and review queues, deterministic rules, audit/case workflows, document custody, UI, auth/roles, exports, persistence and FIU adapters. Thresholds and income rules do not require ML.

A model result should supply `transactionId`, `modelVersion`, `riskScore` (documented scale), `reasons`, `explanation`, `evaluatedAt` and `dataQuality`. Keep the model score separately from deterministic customer/rule scores, and route conflicts to policy/analyst review. Do not invent accuracy/throughput figures from loaded record counts.

## Required next production implementation

1. Select operating jurisdictions, reporting entity, record types and responsible compliance officer; approve screening scope, EDD and risk policy.
2. Add authenticated server APIs and role controls (analyst/investigator/officer/admin). Map real customer/counterparty identifiers to existing transaction feed IDs; never derive a customer identity from a transaction ID or email domain alone.
3. Persist customers, screening runs, source revisions, dispositions, cases, evidence, risk history and append-only audit events with institution isolation. Enforce validations and authorizations on the server; hashes alone are not tamper prevention.
4. Add idempotent scheduled feed ingestion with snapshot age, provenance and failure alerts. Fail pending/unknown rather than silently clear transactions when screening data is absent or stale. Implement FX normalization and real transaction enforcement integration.
5. Add secure evidence storage, per-record/jurisdiction retention triggers, legal hold precedence, backup/restore and authorized disposal. No paid product can be provisioned without a revised budget instruction.
6. Validate the FIU report schema and complete authorized portal/API filing; retain receipt and submission audit. Separate reporter and reviewer before permitting production filing.

## Verification

`npm run build` succeeds. `node --test tests/*.test.js` covers thresholds/income, repeated bulk time window and currency isolation, sanctions identity review, PEP/media review, absent profiles, name aliases, score evolution, legal holds, retention anchors and required report fields. Local browser QA covers screening → confirmed synthetic match → simulated block → investigation creation and saved narrative, plus profile/risk changes, policy controls and page reload persistence. Existing Firebase credentials/production policies and bank integrations were not exercised.
