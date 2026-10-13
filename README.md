# Acurion - AML intelligence prototype

Vite + vanilla JS + Tailwind + Firebase + Cytoscape. A monochrome transaction dashboard and a new compliance operations sandbox.

## Run

```sh
npm install
npm run dev
```

Default mode retains the existing Firebase sign-in and transaction feeds. For an offline demo without credentials:

```sh
VITE_DEMO_MODE=true npm run dev
```

Open `/compliance.html` for KYC profiles, dynamic rule scores, PEP relationships, sanctions/counterparty review, media evidence, transaction monitoring, investigations/STR drafts and retention policy. This workspace always uses fictional data in browser storage, including when legacy pages use Firebase. Do not enter real customer data or upload real documents.

```sh
npm run build
npm test
```

## Pages

- `compliance.html`: connected compliance sandbox
- `index.html`: transaction/alert overview
- `alerts.html`: existing model alerts and explanations
- `transactions.html`: existing transaction feed
- `graph.html`: account relationships
- `reports.html`: existing audit feed and summary exports
- `login.html`: Firebase login

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

The app now also supports React 19 / TypeScript islands and a shadcn-compatible component folder. The redesigned navigation uses a workspace rail and contextual panel. Header notifications use Live Notification Feed; the login and overview use Gateway Flow; **Records → Working drafts** includes HoldButton and Shredder with recoverable disposal.

See [component integration notes](docs/COMPONENT_INTEGRATION.md) for exact source provenance, dependencies, setup and validation.
