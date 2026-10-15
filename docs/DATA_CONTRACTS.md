# Application data contracts

The report's APIs and infrastructure remain proposed. These are the browser adapter contracts and handoff details, not deployed REST endpoints.

## Canonical synthetic event input

Rules & simulation imports an array of at most 1,000 events from a JSON file up to 1 MB. Only an explicit `synthetic: true` is accepted by this prototype.

```json
[
  {
    "event_id": "SIM-EXAMPLE-1",
    "timestamp": "2026-10-01T12:00:00Z",
    "sender_account_id": "DEMO-001",
    "receiver_account_id": "DEMO-CP-002",
    "amount": 44000,
    "currency": "AED",
    "transaction_type": "Transfer",
    "country": "AE",
    "synthetic": true
  }
]
```

IDs, amount, currency and a valid ISO timestamp with a timezone are required. Exact event duplicates are skipped, equivalent timestamp offsets match, and conflicts for an existing ID are rejected. Accepted transaction records exclude labels, arbitrary device/IP data and unknown fields. Rejection records retain only event ID and errors. This is not a Kafka dead-letter service.

## Live transaction source

The adapter reads keyed objects from `/transactions` by default. Known raw and snake_case columns are mapped using `src/lib/columnMapping.js`; the adapter records the selected source column names. System status includes field availability counts for the loaded sample. See [the dataset handoff](DATASET_HANDOFF.md) for the mapping table and requirements separated by dataset, model and rule ownership. Canonical field names above are supported along with existing IBM `amountPaid/paymentCurrency/fromAccount/toAccount` and PaySim `senderAccount/receiverAccount` fields. Missing account keys, currencies, timestamps and scores remain unavailable. IEEE payer email domains are descriptive fields, not account identities. PaySim steps/IEEE relative times remain dataset-relative.

## Live alert source

A keyed alert should contain `alertId`, `transactionId`, `accountId`, `timestamp`, `severity`, `decision`, `status`, `reason` and `sourceDataset`. Optional metadata includes `modelVersion`, `policyVersion`, `ruleIds`, `evaluatedAt`, `featureWindow`, `evidenceTransactionIds`, `ruleScore`, `ruleAssessment`, `shapExplanation` and `gnnExplanation`.

`riskScore` supports 0–1 or 0–100 for compatibility; set `riskScoreScale` to `0-1` or `0-100` in a new producer to remove ambiguity, especially for a value of 1. Do not use a mixed or ambiguous scale in a new producer. Optional `anomalyScore`, `supervisedScore`, `gnnScore` and `graphRiskScore` remain separate signals; they are not summed. Ground-truth labels do not supply scores or decisions. Recommendations are PASS, FLAG or BLOCK; a BLOCK in this app is a recorded/simulated recommendation, not payment enforcement.

Analyst review fields are `owner`, `status`, `disposition`, `analystNote`, `reviewedAt`, `reviewedBy`. Closing requires an assigned investigator, meaningful rationale and a disposition. Updating review fields does not modify the model recommendation or score. Demo reviews are browser-local; the live adapter awaits Firebase write authorization and never falls back to a silent local save.

## Graph

Each transfer needs its own stable edge ID, sender, receiver, source transaction reference, original amount/currency and timestamp. Optional graph edges are read from `/graphData/edges`; shared relationships from `/graphData/relationships` require a `type` of `shared_device`, `shared_ip` or `shared_location` and explicit `provenance`. No shared link is inferred from missing fields. Community IDs are structural labels, not criminal findings.

Neighborhoods allow up to 3 hops and 100 nodes. Transaction paths use transfer direction and nondecreasing event times, no more than 6 hops and a bounded search. If no path is found, the UI says so; it does not imply no path exists outside the loaded sample.

## Case report

`case-report-1` contains the case, source mode, referenced/captured transactions, captured source alert, current rule assessments, graph captures with original edge IDs and filters, policy, case activity and a separate analyst conclusion. Uploaded documents contribute metadata and hashes, not their bodies. A report is a fictional prototype review package; it is not regulatory submission XML.

## Model teammate handoff

Supply stable transaction/account IDs, the prediction unit, source dataset/version, model/version, feature schema and ordering, evaluated-at time, feature-window boundaries, documented score scale, quality flags, and actual SHAP/GNN explanation payloads. Keep inference features free of target labels and future events. Training, calibration, evaluation and explanation generation stay with the model team.
