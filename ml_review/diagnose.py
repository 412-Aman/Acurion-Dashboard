"""Frozen-policy diagnostics. Does not tune on the evaluation day."""
from pathlib import Path
import json,sys
import pandas as pd
import numpy as np
import torch
from torch import nn
import pyarrow.parquet as pq
from acurion_pipeline.metrics import binary_metrics
R=Path(__file__).resolve().parent; S=R/'source'; O=R/'results'
sys.path.insert(0,str(S))
from acurion_pipeline.legacy_model import MixedPaymentGNN,collate
torch.set_num_threads(2)
f=pd.read_parquet(O/'xgb_day_predictions.parquet'); flag=f.policy_rank>=json.loads((O/'xgb_reproduction.json').read_text())['seed_threshold']
f=f.assign(predicted=flag)
def breakdown(col):
 out=[]
 for value,g in f.groupby(col,dropna=False,observed=True):
  y=g.is_laundering.astype(bool);p=g.predicted
  out.append({'group':str(value),'rows':len(g),'positives':int(y.sum()),'tp':int((y&p).sum()),'fn':int((y&~p).sum()),'fp':int((~y&p).sum()),'recall':float((y&p).sum()/y.sum()) if y.sum() else None})
 return out
f['sender_history_bucket']=pd.cut(f.sender_lifetime_sent_count,[-1,0,5,50,float('inf')],labels=['no prior sent','1-5','6-50','over 50'])
result={'xgb_by_format':breakdown('payment_format'),'xgb_by_currency':breakdown('payment_currency'),'xgb_by_sender_history':breakdown('sender_history_bucket')}
p=S/'ml_data/LI-Large_standardized_full.parquet'; meta=pq.ParquetFile(p)
result['li_large']={'bytes':p.stat().st_size,'rows':meta.metadata.num_rows,'row_groups':meta.metadata.num_row_groups,'columns':meta.schema_arrow.names,'validation':'Parquet footer inspected; entire file extracted with ZIP CRC verification, not a complete row-level quality scan.'}
result['validation_by_period']={}
data=torch.load(S/'gnn_data/LI-Small_v5_label_blind.pt',map_location='cpu',weights_only=True)
graphs=data['graphs']; print('graph keys',graphs[0].keys(),flush=True)
for name in ['gnn_aml_network_v5_hi_medium_provisional.pt','gnn_aml_network_v5_early_provisional.pt']:
 c=torch.load(S/'models'/name,map_location='cpu',weights_only=True);m=MixedPaymentGNN();m.head[-1]=nn.Linear(m.head[-1].in_features,2);m.load_state_dict(c['state_dict']);m.eval();scores=[]
 with torch.inference_mode():
  for i in range(0,len(graphs),32):scores.extend(torch.sigmoid(m(collate(graphs[i:i+32])))[:,0].tolist())
 t=float(c.get('network_aml_threshold',c.get('thresholds',{}).get('network_aml')));out={}
 for period in ['early','late','all']:
  idx=[i for i,g in enumerate(graphs) if period=='all' or ('early' if pd.to_datetime(g['seed_timestamp'],unit='s')<pd.Timestamp('2022-09-11') else 'late')==period]
  if idx:out[period]=binary_metrics([graphs[i]['label'] for i in idx],np.array(scores)[idx],t)
 result['validation_by_period'][name]=out
(O/'diagnostics.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2),flush=True)
