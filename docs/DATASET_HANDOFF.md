# Data requirements for Acurion

## What the current alert tells us

The supplied example references `IEEE_CIS`, says the transaction was marked as fraud, and contains a recorded score of 95/100. Its alert time, rule points, model version, policy version, rule references and four separate model signals are unavailable in the exported record as Acurion currently reads it. This does not establish whether those fields exist elsewhere in the original files or pipeline.

Acurion does not calculate a 95 score from `isFraud`. Ask the producer where that score came from, its scale, whether it is a model output or a demonstration heuristic, and the model/version if applicable. A fraud ground-truth label is not a prediction or evidence of money laundering. Do not feed `isFraud` or `isLaundering` into inference features.

IEEE-CIS is an online transaction fraud benchmark. Its transaction and identity files join on `TransactionID`, and not every transaction has an identity record. `TransactionDT` is relative to an undisclosed reference time, not a calendar timestamp. It cannot supply verified customer identity, a real calendar date or bank transfer counterparties just by renaming columns.

Source: [IEEE-CIS dataset description](https://www.kaggle.com/c/ieee-fraud-detection/data).

## Automatic mapping now supported

Mapping uses a documented allowlist, with canonical names taking precedence. Unknown columns are not guessed. It happens when reading Firebase and does not rewrite the source records or import a CSV into Firebase.

| Source columns | Acurion field | Important limit |
| --- | --- | --- |
| `TransactionID`, `transaction_id`, `event_id` | Transaction ID | Existing exported IDs and alert references must agree exactly; no automatic prefix rewriting |
| `TransactionAmt`, `amount` | Amount | No currency inferred |
| `TransactionDT`, `transactionTime` | Dataset-relative seconds | Not a calendar date |
| `P_emaildomain`, `R_emaildomain` | Email domains | Not sender/receiver identities |
| `ProductCD` | Source channel/product code | Code retains its original meaning |
| `nameOrig`, `sender_account_id`, `senderAccount` | Sender ID | Pseudonymous IDs must be stable across records |
| `nameDest`, `receiver_account_id`, `receiverAccount` | Receiver ID | No customer name inferred |
| `step` | Dataset-relative hours | No arbitrary epoch added |
| `Amount Paid`, `amount_paid`, `amountPaid` | Paid amount | Preserve its payment currency |
| `Payment Currency`, `payment_currency` | Payment currency | Known currency names map to ISO codes |
| `Amount Received`, `Receiving Currency` | Received amount/currency fallback | Export both paid and received values; do not mix sides |
| `Timestamp`, `event_timestamp`, `timestamp` | Calendar event time | Export an ISO 8601 timezone explicitly for new sources |
| `model_version`, `policy_version`, `rule_score`, `rule_ids` | Evaluation metadata | Must actually exist in the producer output |
| `anomaly_score`, `supervised_score`, `gnn_score`, `graph_risk_score` | Separate signals | Each needs documented meaning and scale |

The precise alias list is `src/lib/columnMapping.js`. Ambiguous duplicate columns such as bank exports with two `Account` headers must be explicitly renamed upstream to `fromAccount` and `toAccount`. The importer must preserve leading zeroes, dataset namespaces and bank context so unrelated accounts do not collide. An unknown source needs a reviewed mapping after inspecting its headers/data dictionary, not a fuzzy match.

Use **System status → Dataset field coverage** for actual missing counts and mapped source columns in the loaded Firebase sample. Failed reads are reported separately from missing fields. A blank optional model output does not imply a bad dataset. These counts describe up to the configured read limit per source, not the whole database.

## Send this checklist to the dataset/import person

### Essential transaction data

- Stable, unique transaction ID shared by transactions, alerts and explanations.
- Stable sender and receiver account IDs, with customer/account joins and bank context if IDs are bank-local. Store IDs as strings.
- Amount and original ISO currency. If there are two transfer sides, preserve each amount with its own currency. Currency conversion requires an explicit rate, source and time.
- Actual transaction time with timezone, or an explicitly documented relative time unit if no real date exists. Do not fabricate a start date.
- Transaction type/channel, status and bank/country/jurisdiction fields where the source supports them. A bank ID is not automatically a country code.
- Dataset name/version, synthetic versus real status, column dictionary, units, missing-value conventions and permission/license for the intended use.
- Training labels kept separately from predictions, with their definition and provenance: fraud, simulated laundering pattern and legally confirmed laundering are different targets.
- Sufficient dated history per account to support the intended monitoring windows. A random sample of disconnected rows cannot establish complete account behavior.

### Customer/KYC enrichment, usually separate from transaction datasets

- Customer/account mapping, identity verification state, customer type, residency and incorporation jurisdiction.
- Declared income and its period/currency, expected turnover and transaction profile, source of funds, occupation/business activity and next review date.
- Beneficial owners and verified customer relationships when relevant.
- PEP, sanctions and adverse-media findings with source, source URL/reference, publication/list version, screening time, identity-match evidence and analyst disposition.

Do not invent these from anonymized card fields, email domains or a fraud label. Only collect authorized data needed for the project. These are enrichment requirements for the requested features, not mandatory columns in every benchmark CSV.

## Send this checklist to the model/pipeline person

These outputs are not solved by buying or downloading a more complete raw dataset:

- `riskScore` plus explicit `riskScoreScale` (`0-1` or `0-100`), score meaning and origin. A score is not automatically a calibrated probability.
- `modelVersion`, model/artifact identity, feature schema/version, `evaluatedAt` and feature window boundaries.
- Optional separate `anomalyScore`, `supervisedScore`, `gnnScore` and `graphRiskScore`, with documented scales. Supply only models actually run. They are not summed in the UI.
- Actual `shapExplanation` and/or `gnnExplanation` when those methods are implemented. They must reference the same prediction, feature schema and transaction.
- Evaluation evidence, calibration where claimed, leakage-safe splits, measured false positives and drift monitoring. Training/evaluation/explanation generation remain the model team's work.

## Send this checklist to the rule/alert producer

- Stable `alertId`, exact `transactionId`, alert creation `timestamp`, `reason`, severity and recorded recommendation.
- For a rule-generated alert: `ruleScore`, `policyVersion`, `ruleIds`, `evaluatedAt`, feature window, evidence transaction IDs and the actual rule assessment.
- Distinguish event time, alert creation time, evaluation time and ingestion time. Do not use one to conceal a missing other.
- Do not derive live scores or payment decisions directly from a dataset target label. Dataset-driven examples must identify themselves as demonstrations.

A model-only alert can legitimately lack rule results. A rule-only alert can legitimately lack a model version and GNN/SHAP outputs. Alert creation time and provenance should still be supplied by the alert producer.
