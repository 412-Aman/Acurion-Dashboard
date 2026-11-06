# Acurion: reproducible ML review

Start with the audit facts in [`reports/`](reports/). They record the checked artifacts, reproduced metrics and known limits. This folder adds a bounded offline inference workflow; it does not change the deployed app, retrain models or upload to Firebase.

## Existing local results

- `results/final_demo/review.html`: interactive, self-contained investigation preview.
- `results/final_demo/manifest.json`: hashes, source identity, frozen thresholds and coverage.
- `results/final_demo/transaction_scores.parquet`: every target-day transaction prediction.
- `results/final_demo/alerts.json`: XGBoost transaction alerts with actual tree contributions.
- `results/final_demo/networks.json`: all scored network contexts and observed structural statistics.
- `results/final_demo/network_reviews.json`: separate GNN review queue. These are network predictions, not individual-transfer verdicts.
- `results/final_demo/graphData.json`: transaction edges in the website's existing graph contract.
- `results/final_demo/evaluation_only.json`: retrospective labeled evaluation. Never upload this as prediction evidence.
- `reports/`: small, shareable audit facts, inventories and checkpoint metadata. No model weights or raw data.

`transactions.json` intentionally exports alert/context records plus a small target-day sample, rather than all 654,467 transactions. It includes 23,779 records for this run. The website currently reads a bounded sample, so importing a large file would not guarantee that every alert's transaction appears in its current page sample. A backend pagination and lookup strategy is still needed.

The preview runs locally and does not require Firebase, a login, an external script, or a paid API. Open its HTML file in a browser. Its scores reflect saved experimental models, not an improved/newly trained model.

## Recreate the environment

Use Python **3.12**, not the system Python 3.9. The verified local environment is `.venv312` using Python 3.12.14. Pinned package versions are in `requirements.txt`.

```bash
python3.12 -m venv ml_review/.venv312
ml_review/.venv312/bin/python -m pip install -r ml_review/requirements.txt
ml_review/.venv312/bin/python ml_review/extract_archive.py "$HOME/Desktop/acurion_milestone.zip"
```

The extractor excludes credentials, Windows environments and incomplete partitions. It refuses an archive path traversal and does not overwrite an existing mismatched-size file. Existing same-size files are preserved; use a new extraction directory or remove only your own copied inputs if an integrity mismatch is suspected. The inference runner verifies model/encoder/reference hashes. Raw input hashes are recorded in the run manifest.

Use `--include-li-large` only if you want the additional 7.35 GB standardized file for inspection. It is not needed for the capstone run. The archive stays unchanged. Allow enough disk space for the runtime, 576 MB HI-Small input, graph data and generated outputs. No credential belongs in this repo or the browser.

On this Mac XGBoost needs an OpenMP library. `run_pipeline.py` locates the runtime already bundled with the local PyTorch environment and restarts itself with that library path. For direct reproduction scripts, use:

```bash
export DYLD_LIBRARY_PATH="$PWD/ml_review/.venv312/lib/python3.12/site-packages/torch/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
export OMP_NUM_THREADS=2
```

No Homebrew/system library was installed. On another platform use its supported XGBoost/PyTorch wheels and OpenMP installation. No CUDA/GPU is needed for these bounded saved-checkpoint runs.

## Reproduce the archived metrics

```bash
ml_review/.venv312/bin/python ml_review/inspect_artifacts.py
ml_review/.venv312/bin/python ml_review/reproduce.py
```

`reproduce.py` reads the frozen checkpoint and calibration reference, reconstructs the saved training category vocabulary for parity checking, scores the benchmark day, and compares the actual 297 seed IDs. It also evaluates all three network checkpoints on the same saved independent graph cache. Labels are used for the reconstruction of the original training-only vocabulary and for evaluation, not as inference features.

`diagnose.py` produces format/currency/history breakdowns and early/late development-validation diagnostics. It expects the optional extracted LI-Large file for its footer report. It does not retrain or optimize thresholds.

## One command for the combined demonstration

Choose a **new output directory** each time. Existing results are never overwritten.

```bash
ml_review/.venv312/bin/python ml_review/run_pipeline.py \
  --input ml_review/source/ml_data/HI-Small_features.parquet \
  --dataset-id IBM-HI-Small \
  --day 2022-09-09 \
  --source-timezone UTC \
  --source-row-convention one-based \
  --output ml_review/results/my_demo \
  --evaluate
ml_review/.venv312/bin/python ml_review/make_preview.py ml_review/results/my_demo
node ml_review/verify_dashboard.mjs ml_review/results/my_demo
```

`UTC` above is an explicit interpretation of the dataset's otherwise naive timestamps for display. It is not evidence that the original synthetic dataset supplied a timezone. The model still uses its original wall-clock features. For a real source, use its documented timezone. Ambiguous/nonexistent local DST timestamps are rejected.

The fixed defaults are 400 structural seeds per target day, nine days of history, four hops, 14 recent neighbors per visited account, 48 transfers per graph, and three selected seeds per sender/receiver in the structural branch. The branch ranks daily candidates after the target day finishes. It does not claim real-time discovery. XGBoost seeds are added without the structural cap, with their origin recorded.

The runner currently supports a **single compatible dataset per run** with globally unique integer source rows. Dataset IDs namespace transaction identifiers; account keys remain bank/account identifiers inside that source. Do not merge unrelated dataset exports without namespacing account identities and verifying that the same account ID really means the same customer.

Default resource guards reject more than one million target-day rows or ten million indexed history rows. `--max-day-rows`, `--max-history-rows` and `--candidates` can be changed explicitly, but this changes cost/coverage. Record such changes as a new protocol before evaluation. Existing GNN graph-encoding bounds cannot be changed silently. The account counters and target-day frame use RAM, while the history lookup uses a temporary SQLite file on disk. This is not an out-of-core implementation of all lifetime features for LI-Large.

The runner can select V4, Full V5 or Early V5 using `--gnn` with the exact checkpoint filename. It verifies known hashes and uses the selected checkpoint's threshold without retuning it on the evaluation labels.

## Fresh raw CSV input

The preserved adapter can standardize different families, but the existing temporal model requires the complete IBM-style historical feature contract. Raw CSV support here intentionally requires matching account metadata and the full paid/received amounts, currencies, banks and timestamps.

```bash
ml_review/.venv312/bin/python ml_review/prepare_upload.py \
  --input /absolute/path/Fresh_Trans.csv \
  --accounts /absolute/path/Fresh_accounts.csv \
  --dataset-id Fresh-IBM \
  --output ml_review/results/fresh_prepared
ml_review/.venv312/bin/python ml_review/run_pipeline.py \
  --input ml_review/results/fresh_prepared/features.parquet \
  --dataset-id Fresh-IBM \
  --day 2022-09-09 \
  --source-timezone UTC \
  --source-row-convention one-based \
  --output ml_review/results/fresh_inference
```

Replace the date, timezone and paths with the actual source details. Do not restrict the raw input to the target day if earlier history exists. Supply the needed history from before the first scored event. Full-history generation defaults to an explicit one-million-row input guard because its per-account state is not bounded by the CSV batch size. Raising this guard alone is not a solution for 176 million rows.

Raw IBM transaction columns: `Timestamp`, `From Bank`, `Account`, `To Bank`, `Account.1`, `Amount Paid`, `Amount Received`, `Payment Currency`, `Receiving Currency`, `Payment Format`; an `Is Laundering` column is for optional offline evaluation only. Matching account metadata columns: `Bank ID`, `Account Number`, `Entity ID`. Existing IBM history code requires its minute-resolution naive timestamp format. It fails rather than inventing absent information. A generic PaySim conversion does not provide all these inputs and needs a separately trained compatible model.

For a reproducible plumbing test:

```bash
ml_review/.venv312/bin/python ml_review/tests/make_fixture.py
ml_review/.venv312/bin/python ml_review/prepare_upload.py \
  --input ml_review/results/fresh_fixture/synthetic_transactions.csv \
  --accounts ml_review/results/fresh_fixture/synthetic_accounts.csv \
  --dataset-id SYNTHETIC-FIXTURE \
  --output ml_review/results/fixture_prepared_new
```

This fixture contains 240 explicitly synthetic transfers and 12 synthetic account mappings. Its labels do not establish model accuracy. Pass its generated features to the same inference command to test the complete fresh-file route.

## Verification

```bash
ml_review/.venv312/bin/python -m pytest -q -c ml_review/pytest.ini ml_review/tests
node ml_review/verify_dashboard.mjs ml_review/results/final_demo
```

The tests check actual time cutoffs, same-time exclusion, seed/format alignment, label-blind candidate selection, duplicate IDs across batches, dataset identity separation, frozen encoder/checksum handling, unknown-category detection, metric validity, one-class calibration rejection, skipped graphs and scope-safe exports.

For the original tests run from their original folder:

```bash
cd ml_review/source
../.venv312/bin/python -m pytest -q test_aml_engine.py test_data_pipeline.py
```

Baseline result: **24 pass, 2 fail**. One test expects an old missing-fields message although the adapter now rejects earlier for missing identity; another expects amount strings although the adapter deliberately converts them to numbers. The preserved source tests were not silently rewritten. Running those tests from the website root adds a relative-fixture-path failure, so use the documented working directory.

## Website/backend handoff

The current website reads `/transactions`, `/alerts`, optional `/graphData/edges`, account enrichment and audit records according to its configured rules. Exported transaction alerts and graph edges follow those field conventions. The new `network_reviews.json` is a separate backend/UI integration contract; the existing site does not consume that queue yet.

Do not replace the Firebase root with this whole output folder. Do not put a service-account key in the website. A reviewed backend importer should validate records, preserve dataset namespaces, check duplicate IDs, record who imported which run and where, and atomically publish the chosen run. Network alerts need their own case-grouping/queue UI. Investigation actions need server-authorized audit writes; this offline run does not fabricate investigator actions.

Raw scores, validation percentiles and rule points are distinct. The current normalizer preserves supplied SHAP details but does not retain every new provenance field in its display model. The new preview exposes the score/policy distinction; the production alert view should expose the new metadata before presenting these outputs as live operational results.

## What remains unresolved

Obtain the actual temporal training source and original account/raw files, generate realistic shared-protocol training and calibration graphs, run matched-condition ablations, and reserve a genuinely untouched final test source. The existing benchmark has been used repeatedly. New architecture experiments, full LI-Large feature generation, deployment and production reliability remain future work. See the audit report for the exact evidence and recommended order.
