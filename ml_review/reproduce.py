"""Reproduce supplied checkpoints without training, tuning or Firebase writes."""
from pathlib import Path
import json,sys
import numpy as np
import pandas as pd
import torch
from torch import nn
import duckdb
import xgboost as xgb
from acurion_pipeline.temporal import TemporalEncoder,NUMERIC
from acurion_pipeline.metrics import binary_metrics
ROOT=Path(__file__).resolve().parent;S=ROOT/'source';R=ROOT/'results'
torch.set_num_threads(2)
sys.path.insert(0,str(S))
from acurion_pipeline.legacy_model import MixedPaymentGNN,collate

saved_encoder=torch.load(S/'models/gnn_directed_v3.pt',map_location='cpu',weights_only=True)
encoder=TemporalEncoder(saved_encoder['categories'])
assert encoder.vocab==TemporalEncoder.recover(S/'ml_data/HI-Small_features.parquet').vocab
contract=encoder.save(R/'temporal_encoder.json',S/'models/xgb_temporal_v3.json')
print('ENCODER',encoder.width,encoder.vocab,flush=True)
con=duckdb.connect();con.execute("SET memory_limit='2GB'");con.execute('SET threads=2')
frame=con.execute("SELECT * FROM read_parquet(?) WHERE TRY_CAST(event_timestamp AS TIMESTAMP)>=TIMESTAMP '2022-09-09' AND TRY_CAST(event_timestamp AS TIMESTAMP)<TIMESTAMP '2022-09-10' ORDER BY TRY_CAST(event_timestamp AS TIMESTAMP),source_row",[str(S/'ml_data/HI-Small_features.parquet')]).df()
model=xgb.Booster();model.load_model(S/'models/xgb_temporal_v3.json');model.set_param({'nthread':2})
scores=model.inplace_predict(encoder.transform(frame))
seeds=pd.read_csv(S/'network_results/xgb_network_seeds_2022-09-09.csv')
lookup=dict(zip(frame.source_row.astype(int),scores.tolist()))
errors=np.array([abs(lookup[int(r.source_row)]-r.xgb_score) for r in seeds.itertuples()])
threshold=json.loads((S/'models/gnn_v3_report.json').read_text())['threshold_on_validation']
# Frozen validation empirical rank is an alert-policy score, NOT a probability.
with np.load(S/'models/gnn_v3_calibration.npz',allow_pickle=False) as calibration:reference=calibration['validation_xgb_sorted']
rank_scores=np.searchsorted(reference,scores,side='right')/len(reference)
seed_threshold=threshold
seed_flags=rank_scores>=seed_threshold
selected=set(frame.loc[seed_flags,'source_row'].astype(int));original=set(seeds.source_row.astype(int))
xresult={'date':'2022-09-09','quality':encoder.quality(frame),'archived_seed_score_max_abs_error':float(errors.max()),'seed_threshold':seed_threshold,'selected_ids_equal':selected==original,'missing_seed_ids':len(original-selected),'additional_seed_ids':len(selected-original),'metrics':binary_metrics(frame.is_laundering,rank_scores,seed_threshold),'raw_score_average_precision':binary_metrics(frame.is_laundering,scores,.5)['average_precision']}
frame.assign(score=scores,policy_rank=rank_scores).to_parquet(R/'xgb_day_predictions.parquet',index=False)
(R/'xgb_reproduction.json').write_text(json.dumps(xresult,indent=2));print('XGB',json.dumps(xresult),flush=True)

cache=torch.load(S/'network_results/evaluation_only/independent_9day_graph_cache.pt',map_location='cpu',weights_only=True)
ids=sorted({int(i) for group in cache['members'] for i in group});wanted=pd.DataFrame({'source_row':ids});con.register('wanted',wanted)
truth=con.execute('SELECT p.source_row,p.is_laundering FROM read_parquet(?) p JOIN wanted USING(source_row)',[str(S/'ml_data/HI-Small_features.parquet')]).df()
truth_map=dict(zip(truth.source_row.astype(int),truth.is_laundering.astype(int)));con.close()
y=np.array([int(any(truth_map[int(r)] for r in group)) for group in cache['members']])
outside=np.array([int(s) not in original for s in cache['seed_ids']]);results={};predictions=pd.DataFrame({'seed_id':cache['seed_ids'],'label':y,'outside_xgb':outside})
for name in ['gnn_aml_network_v4.pt','gnn_aml_network_v5_hi_medium_provisional.pt','gnn_aml_network_v5_early_provisional.pt']:
 checkpoint=torch.load(S/'models'/name,map_location='cpu',weights_only=True);m=MixedPaymentGNN();m.head[-1]=nn.Linear(m.head[-1].in_features,2);m.load_state_dict(checkpoint['state_dict'],strict=True);m.eval();prob=[]
 with torch.inference_mode():
  for i in range(0,len(y),32):prob.extend(torch.sigmoid(m(collate(cache['graphs'][i:i+32])))[:,0].tolist())
 prob=np.array(prob);t=float(checkpoint.get('network_aml_threshold',checkpoint.get('thresholds',{}).get('network_aml')))
 result=binary_metrics(y[outside],prob[outside],t)
 result['visible_unflagged_positive_transfers']=len({int(r) for f,ok,group in zip(prob>=t,outside,cache['members']) if f and ok for r in group if truth_map[int(r)]==1 and int(r) not in original})
 results[name]=result;predictions[name]=prob;print(name,json.dumps(result),flush=True)
(R/'gnn_reproduction.json').write_text(json.dumps(results,indent=2));predictions.to_csv(R/'gnn_independent_predictions.csv',index=False)
