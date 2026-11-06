"""Temporal XGBoost encoding recovered by static inspection of the supplied cache.

The 39 numeric fields and ordered categorical vocabularies are a model contract.
The contract must be fitted only from the original sampled training period, saved,
and subsequently loaded. It must never be refitted on evaluation/uploaded data.
"""
from dataclasses import dataclass
from pathlib import Path
import hashlib,json
import numpy as np
import pandas as pd

NUMERIC=[
 'amount_paid','amount_received','log_amount_paid','log_amount_received','hour_of_day','day_of_week','cross_bank','same_account','same_entity','sender_metadata_found','receiver_metadata_found',
 'sender_lifetime_sent_count','sender_lifetime_received_count','receiver_lifetime_sent_count','receiver_lifetime_received_count','sender_lifetime_unique_receivers','sender_lifetime_unique_senders','receiver_lifetime_unique_senders','receiver_lifetime_unique_receivers','sender_has_paid_receiver_before',
 'sender_lifetime_sent_volume_same_currency','sender_lifetime_avg_sent_same_currency','sender_lifetime_std_sent_same_currency','sender_amount_deviation','receiver_lifetime_received_volume_same_currency','receiver_lifetime_avg_received_same_currency','receiver_lifetime_std_received_same_currency','receiver_amount_deviation','sender_history_age_days','receiver_history_age_days','sender_seconds_since_last_sent','receiver_seconds_since_last_received','sender_sent_count_24h','receiver_received_count_24h','sender_sent_volume_same_currency_24h','receiver_received_volume_same_currency_24h','sender_recent_in_count_same_currency_24h','sender_recent_in_volume_same_currency_24h','sender_outgoing_to_recent_incoming_ratio']
CATEGORICAL=['payment_currency','receiving_currency','payment_format']
@dataclass
class TemporalEncoder:
 vocab:dict
 def __post_init__(self):
  if list(self.vocab)!=CATEGORICAL:raise ValueError('Categorical order does not match the temporal model')
  if any(len(v)!=len(set(v)) for v in self.vocab.values()):raise ValueError('Duplicate vocabulary entry')
 @property
 def width(self):return len(NUMERIC)+sum(len(v) for v in self.vocab.values())
 @classmethod
 def recover(cls,parquet):
  import duckdb
  con=duckdb.connect();con.execute("SET memory_limit='2GB'");con.execute('SET threads=2')
  # Exactly the date range, label-aware TRAINING subsample and sorting seen in cached source.
  df=con.execute('''SELECT payment_currency,receiving_currency,payment_format FROM read_parquet(?)
    WHERE TRY_CAST(event_timestamp AS TIMESTAMP)>=TIMESTAMP '2022-09-01'
      AND TRY_CAST(event_timestamp AS TIMESTAMP)<TIMESTAMP '2022-09-07'
      AND is_laundering IN (0,1) AND (is_laundering=1 OR hash(source_row)%100<8)''',[str(parquet)]).df();con.close()
  return cls({c:sorted(df[c].fillna('UNKNOWN').astype(str).unique().tolist()) for c in CATEGORICAL})
 def transform(self,df):
  missing=set(NUMERIC+CATEGORICAL)-set(df.columns)
  if missing:raise ValueError(f'Missing temporal inputs: {sorted(missing)}')
  raw=df[NUMERIC].to_numpy(dtype=np.float64,copy=True)
  # Legacy encoding preserved for checkpoint parity, not endorsed as missing-data policy.
  np.nan_to_num(raw,copy=False,nan=0,posinf=0,neginf=0)
  raw=np.clip(raw,-1e14,1e14).astype(np.float32)
  parts=[raw]
  for col,vocab in self.vocab.items():
   codes=pd.Categorical(df[col].fillna('UNKNOWN').astype(str),categories=vocab).codes
   onehot=np.zeros((len(df),len(vocab)),dtype=np.float32);valid=codes>=0
   onehot[np.where(valid)[0],codes[valid]]=1.;parts.append(onehot)
  return np.concatenate(parts,axis=1)
 def quality(self,df):
  raw=df[NUMERIC].to_numpy(dtype=np.float64)
  return {'rows':len(df),'nonfinite_numeric_cells':int((~np.isfinite(raw)).sum()),'negative_recent_volume_cells':int((df[[c for c in NUMERIC if 'volume' in c and '24h' in c]].to_numpy(dtype=float)<-0.01).sum()),'unknown_categories':{c:int((~df[c].fillna('UNKNOWN').astype(str).isin(v)).sum()) for c,v in self.vocab.items()}}
 def save(self,path,model):
  obj={'schema':'acurion-temporal-v3-encoding-1','numeric':NUMERIC,'categorical':CATEGORICAL,'vocab':self.vocab,'width':self.width,'model_sha256':hashlib.sha256(Path(model).read_bytes()).hexdigest(),'recovery':'Static Python 3.14 cache inspection plus original Sep 1-6 training vocabulary; verify against archived predictions before use.'}
  Path(path).write_text(json.dumps(obj,indent=2));return obj
 @classmethod
 def load(cls,path,model):
  obj=json.loads(Path(path).read_text())
  if obj.get('numeric')!=NUMERIC or obj.get('categorical')!=CATEGORICAL:raise ValueError('Feature order mismatch')
  if obj.get('model_sha256')!=hashlib.sha256(Path(model).read_bytes()).hexdigest():raise ValueError('Model/encoder checksum mismatch')
  instance=cls(obj['vocab'])
  if instance.width!=obj.get('width') or instance.width!=76:raise ValueError('Feature dimension mismatch')
  return instance
