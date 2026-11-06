"""Label-free, disk-indexed historical discovery with explicit coverage limits."""
from collections import Counter
from dataclasses import dataclass
from datetime import timedelta
from heapq import heappop, heappush
import math,sqlite3,json,hashlib
import pandas as pd
import torch
from .legacy_model import graph_from_transactions

FIELDS=['source_row','event_timestamp','sender_bank','sender_account','receiver_bank','receiver_account','amount_paid','amount_received','payment_currency','receiving_currency','payment_format']
FORMATS=['ACH','CHEQUE','CREDIT CARD','CASH','BITCOIN','WIRE','OTHER']
POLICY='structural-top-daily-v1-lookback9-hops4-edges48-neighbors14-cap3'

def account(bank,number):
 bank=str(bank).strip().lstrip('0') or '0';number=str(number).strip().upper()
 if not number or ':' in bank or ':' in number:raise ValueError('Account/bank identifier is empty or contains a reserved colon')
 return bank+':'+number

def stable_id(dataset,source_row):
 if not dataset.strip():raise ValueError('Supply a stable dataset ID')
 return 'TX_'+hashlib.sha256(json.dumps([dataset,str(source_row)],separators=(',',':')).encode()).hexdigest()[:24]

@dataclass(frozen=True)
class Protocol:
 lookback_days:int=9
 max_hops:int=4
 max_edges:int=48
 neighbors:int=14
 per_account_cap:int=3
 def __post_init__(self):
  if (self.lookback_days,self.max_hops,self.max_edges,self.neighbors,self.per_account_cap)!=(9,4,48,14,3):
   raise ValueError('Existing checkpoint contract requires the frozen 9/4/48/14/3 protocol')

class History:
 def __init__(self,path):
  self.db=sqlite3.connect(path)
  self.db.execute('PRAGMA cache_size=-64000')
  self.db.execute('CREATE TABLE tx(rid INTEGER PRIMARY KEY,ts TEXT,sender TEXT,receiver TEXT,paid REAL,received REAL,same_curr INTEGER,crossbank INTEGER,fmt TEXT)')
 def add(self,frame):
  rows=[]
  for r in frame[FIELDS].itertuples(index=False,name=None):
   if any(pd.isna(x) for x in r):raise ValueError('Missing network input')
   rid,ts,sb,sa,rb,ra,paid,received,pc,rc,fmt=r
   if float(rid)!=int(rid):raise ValueError('source_row must be an integer')
   ts=pd.Timestamp(ts)
   if ts.tzinfo is not None:raise ValueError('Model input must use original dataset wall-clock times; supply timezone separately for export')
   s=account(sb,sa);d=account(rb,ra);paid=float(paid);received=float(received)
   if not all(math.isfinite(v) and v>=0 for v in [paid,received]):raise ValueError('Invalid amount')
   rows.append((int(rid),ts.isoformat(),s,d,paid,received,int(str(pc).strip().upper()==str(rc).strip().upper()),int(s.split(':')[0]!=d.split(':')[0]),str(fmt).strip().upper()))
  self.db.executemany('INSERT INTO tx VALUES (?,?,?,?,?,?,?,?,?)',rows)
 def index(self):
  self.db.execute('CREATE INDEX tx_sender ON tx(sender,ts,rid)');self.db.execute('CREATE INDEX tx_receiver ON tx(receiver,ts,rid)');self.db.execute('CREATE INDEX tx_time ON tx(ts,rid)');self.db.commit()
 def choose(self,day,limit=400):
  if limit<=0:raise ValueError('Candidate limit must be positive')
  start=pd.Timestamp(day);end=start+timedelta(days=1)
  sent=Counter();received=Counter();pending=[];previous=None
  # Sort on disk, not an unbounded in-memory candidate list.
  self.db.execute('CREATE TEMP TABLE candidates(score REAL,seq INTEGER,rid INTEGER,sender TEXT,receiver TEXT)')
  buffer=[];seq=0
  for rid,ts,s,d in self.db.execute('SELECT rid,ts,sender,receiver FROM tx WHERE ts>=? AND ts<? ORDER BY ts,rid',(start.isoformat(),end.isoformat())):
   if previous is not None and previous!=ts:
    for ps,pd_ in pending:sent[ps]+=1;received[pd_]+=1
    pending=[]
   score=float(__import__('numpy').float32(2*(received[s]>0)+2*(sent[d]>0)+math.log1p(min(received[s],20))+math.log1p(min(sent[d],20))+.15*math.log1p(min(sent[s],20))+.15*math.log1p(min(received[d],20))))
   buffer.append((score,seq,rid,s,d));pending.append((s,d));previous=ts;seq+=1
   if len(buffer)>=20000:self.db.executemany('INSERT INTO candidates VALUES (?,?,?,?,?)',buffer);buffer=[]
  self.db.executemany('INSERT INTO candidates VALUES (?,?,?,?,?)',buffer)
  selected=[];senders=Counter();receivers=Counter()
  for score,rid,s,d in self.db.execute('SELECT score,rid,sender,receiver FROM candidates WHERE score>0 ORDER BY score DESC,seq'):
   if senders[s]>=3 or receivers[d]>=3:continue
   selected.append(int(rid));senders[s]+=1;receivers[d]+=1
   if len(selected)>=limit:break
  self.db.execute('DROP TABLE candidates')
  return selected
 def build(self,seed_id,protocol=Protocol()):
  seed=self.db.execute('SELECT * FROM tx WHERE rid=?',(int(seed_id),)).fetchone()
  if seed is None:raise ValueError('Seed not found')
  cutoff=seed[1];lower=(pd.Timestamp(cutoff)-timedelta(days=protocol.lookback_days)).isoformat()
  reached=set();offered=set();included={seed_id};queue=[];records={seed_id:seed}
  def visit(acc,hop):
   if acc in reached or hop>protocol.max_hops:return
   reached.add(acc);near={}
   for col in ['sender','receiver']:
    for r in self.db.execute(f'SELECT * FROM tx WHERE {col}=? AND ts>=? AND ts<? ORDER BY ts DESC,rid DESC LIMIT ?',(acc,lower,cutoff,protocol.neighbors)):near[r[0]]=r
   for r in sorted(near.values(),key=lambda r:(r[1],r[0]),reverse=True)[:protocol.neighbors]:
    if r[0] in offered or r[0] in included:continue
    offered.add(r[0]);records[r[0]]=r
    heappush(queue,(hop,-pd.Timestamp(r[1]).value,r[0]))
  visit(seed[2],1);visit(seed[3],1)
  while queue and len(included)<protocol.max_edges:
   hop,_,rid=heappop(queue)
   if rid in included:continue
   r=records[rid];included.add(rid);visit(r[2],hop+1);visit(r[3],hop+1)
  return sorted([records[i] for i in included],key=lambda r:(r[1],r[0]))
 def close(self):self.db.close()

def encode_graph(rows,seed_id):
 # Sort once, then derive base features and format/seed markers from exactly that order.
 rows=sorted(rows,key=lambda r:(r[1],r[0]))
 if len(rows)>48:raise ValueError('Graph edge limit exceeded')
 if sum(r[0]==seed_id for r in rows)!=1:raise ValueError('Graph requires exactly one seed')
 graph=graph_from_transactions([(pd.Timestamp(r[1]),*r[2:8]) for r in rows])
 if graph is None:return None
 extra=torch.zeros((len(rows),8),dtype=torch.float32)
 for i,r in enumerate(rows):extra[i,FORMATS.index(r[8]) if r[8] in FORMATS else 6]=1;extra[i,-1]=float(r[0]==seed_id)
 graph['edge']=torch.cat([graph['edge'],extra],dim=1)
 return graph
