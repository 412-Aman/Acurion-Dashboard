"""Offline capstone inference. Never uploads, trains, or uses labels for discovery."""
from pathlib import Path
import os,sys
# On macOS use the OpenMP runtime already supplied by local PyTorch.
if sys.platform=='darwin' and not os.environ.get('ACURION_OMP_READY'):
 lib=Path(sys.prefix)/'lib/python3.12/site-packages/torch/lib'
 if lib.exists():
  os.environ['DYLD_LIBRARY_PATH']=str(lib)+':'+os.environ.get('DYLD_LIBRARY_PATH','')
  os.environ['ACURION_OMP_READY']='1';os.execv(sys.executable,[sys.executable,*sys.argv])
import argparse,json,hashlib,tempfile
from datetime import timedelta
from datetime import datetime,timezone
import duckdb,numpy as np,pandas as pd,torch,xgboost as xgb
from torch import nn
from acurion_pipeline.temporal import TemporalEncoder,NUMERIC,CATEGORICAL
from acurion_pipeline.discovery import History,FIELDS,encode_graph,POLICY,stable_id
from acurion_pipeline.legacy_model import MixedPaymentGNN,collate
from acurion_pipeline.export import transaction,transaction_alert,network_record
from acurion_pipeline.metrics import binary_metrics
from acurion_pipeline.explain import tree_explanations
ROOT=Path(__file__).resolve().parent

def run(a):
 if a.output.exists():raise FileExistsError('Choose a new output directory; existing evidence is never overwritten')
 if a.candidates<1 or a.max_day_rows<1 or a.max_history_rows<1:raise ValueError('Resource limits must be positive')
 torch.set_num_threads(2)
 model_path=a.assets/'models/xgb_temporal_v3.json'
 encoder=TemporalEncoder.load(a.encoder,model_path)
 gnn_path=a.assets/'models'/a.gnn
 known=json.loads((ROOT/'contracts/artifacts.json').read_text())
 for artifact in [gnn_path,a.assets/'models/gnn_v3_calibration.npz',a.assets/'models/gnn_v3_report.json']:
  if file_hash(artifact)!=known[artifact.name]['sha256']:raise ValueError('Archived artifact checksum mismatch: '+artifact.name)
 checkpoint=torch.load(gnn_path,map_location='cpu',weights_only=True)
 threshold=float(checkpoint.get('network_aml_threshold',checkpoint.get('thresholds',{}).get('network_aml')))
 if not 0<=threshold<=1:raise ValueError('Missing or invalid checkpoint threshold')
 day=pd.Timestamp(a.day)
 if day!=day.normalize():raise ValueError('day must be a calendar date')
 lower=day-timedelta(days=9);end=day+timedelta(days=1)
 con=duckdb.connect();con.execute("SET memory_limit='2GB'");con.execute('SET threads=2')
 # Projection excludes labels at every inference stage.
 columns=list(dict.fromkeys(FIELDS+NUMERIC+CATEGORICAL))
 available={r[0] for r in con.execute('DESCRIBE SELECT * FROM read_parquet(?)',[str(a.input)]).fetchall()}
 missing=set(columns)-available
 if missing:raise ValueError('Not compatible with temporal v3. Build complete historical features first. Missing: '+', '.join(sorted(missing)))
 bounds=[str(a.input),lower.to_pydatetime(),end.to_pydatetime()]
 condition='TRY_CAST(event_timestamp AS TIMESTAMP)>=? AND TRY_CAST(event_timestamp AS TIMESTAMP)<?'
 count=con.execute('SELECT count(*) FROM read_parquet(?) WHERE '+condition,bounds).fetchone()[0]
 if count>a.max_history_rows:raise ValueError(f'History has {count:,} rows; exceeds explicit max-history-rows guard')
 bad=con.execute('SELECT count(*) FROM read_parquet(?) WHERE TRY_CAST(event_timestamp AS TIMESTAMP) IS NULL',[str(a.input)]).fetchone()[0]
 if bad:raise ValueError(f'{bad} invalid timestamps; refusing to silently skip')
 nday=con.execute('SELECT count(*) FROM read_parquet(?) WHERE '+condition,[str(a.input),day.to_pydatetime(),end.to_pydatetime()]).fetchone()[0]
 if not nday or nday>a.max_day_rows:raise ValueError(f'Target day contains {nday:,} rows; require 1..max-day-rows')
 duplicates=con.execute('SELECT source_row FROM read_parquet(?) GROUP BY source_row HAVING count(*)>1 LIMIT 1',[str(a.input)]).fetchone()
 if duplicates:raise ValueError('Duplicate source_row. Use one source namespace and preserve its original row-index convention')
 projection=','.join('"'+c+'"' for c in columns)
 frame=con.execute('SELECT '+projection+' FROM read_parquet(?) WHERE '+condition+' ORDER BY TRY_CAST(event_timestamp AS TIMESTAMP),source_row',[str(a.input),day.to_pydatetime(),end.to_pydatetime()]).df()
 quality=encoder.quality(frame)
 if quality['nonfinite_numeric_cells'] or quality['negative_recent_volume_cells'] or any(quality['unknown_categories'].values()):raise ValueError('Input quality incompatible with frozen encoding: '+json.dumps(quality))
 for c in ['sender_metadata_found','receiver_metadata_found']:
  if not frame[c].isin([0,1]).all():raise ValueError('Invalid metadata-found flag')
 model=xgb.Booster();model.load_model(model_path);model.set_param({'nthread':2})
 scores=model.inplace_predict(encoder.transform(frame))
 with np.load(a.assets/'models/gnn_v3_calibration.npz',allow_pickle=False) as z:reference=z['validation_xgb_sorted']
 if not len(reference) or not np.isfinite(reference).all() or np.any(np.diff(reference)<0):raise ValueError('Invalid frozen validation rank reference')
 xt=float(json.loads((a.assets/'models/gnn_v3_report.json').read_text())['threshold_on_validation'])
 ranks=np.searchsorted(reference,scores,side='right')/len(reference);flags=ranks>=xt
 xids=frame.loc[flags,'source_row'].astype(int).tolist()
 explanations=tree_explanations(model,encoder,frame.loc[flags])
 print(f'Transactions scored: {len(frame):,}; XGBoost review alerts: {len(xids)}',flush=True)
 networks=[];skipped=[];members=set();predicted_graphs=[];seed_members=[];seeds=[]
 with tempfile.TemporaryDirectory(prefix='acurion-history-') as tmp:
  history=History(str(Path(tmp)/'history.sqlite'))
  try:
   cursor=con.execute('SELECT '+','.join('"'+c+'"' for c in FIELDS)+' FROM read_parquet(?) WHERE '+condition,bounds)
   while True:
    batch=cursor.fetchmany(20000)
    if not batch:break
    history.add(pd.DataFrame(batch,columns=FIELDS))
   history.index();structural=history.choose(day,a.candidates)
   origins={i:['structural'] for i in structural}
   for i in xids:origins.setdefault(i,[]).append('xgboost')
   for i in origins:
    rows=history.build(i);g=encode_graph(rows,i)
    if g is None:skipped.append({'seedSourceRow':i,'origins':origins[i],'reason':'Fewer than two connected historical transfers'});continue
    predicted_graphs.append(g);seed_members.append(rows);seeds.append(i);members.update(r[0] for r in rows)
   gm=MixedPaymentGNN();gm.head[-1]=nn.Linear(gm.head[-1].in_features,2);gm.load_state_dict(checkpoint['state_dict'],strict=True);gm.eval();prob=[]
   with torch.inference_mode():
    for i in range(0,len(seeds),32):prob.extend(torch.sigmoid(gm(collate(predicted_graphs[i:i+32])))[:,0].tolist())
   for sid,rows,p in zip(seeds,seed_members,prob):networks.append(network_record(rows,sid,a.dataset_id,a.source_timezone,p,threshold,origins[sid],a.gnn))
  finally:history.close()
 # Retain alerts, graph context and a small target-day sample for the review export.
 wanted=pd.DataFrame({'source_row':sorted(members|set(xids)|set(frame.head(100).source_row.astype(int)))})
 con.register('wanted',wanted)
 detail=con.execute('SELECT '+','.join('p."'+c+'"' for c in FIELDS)+' FROM read_parquet(?) p JOIN wanted USING(source_row)',[str(a.input)]).df()
 day_scores={int(r): (float(s),float(rank),bool(f)) for r,s,rank,f in zip(frame.source_row,scores,ranks,flags)}
 txs=[];alerts=[];now=datetime.now(timezone.utc).isoformat()
 for r in detail.to_dict('records'):
  sid=int(r['source_row']);values=day_scores.get(sid)
  # Historical context is not individually inferred by this target-day run.
  tx=transaction(r,a.dataset_id,a.source_timezone,*(values or (0.,0.,False)))
  if values is None:
   tx.update(riskScore=None,policyRank=None,decision='unassessed',modelVersion='',scoreMeaning='Historical context; individual transaction not scored in this run')
  txs.append(tx)
  if values and values[2]:
   alert=transaction_alert(tx,xt,now);alert['shapExplanation']=explanations[sid];alerts.append(alert)
 gnn_alerts=[n for n in networks if n['decision']=='review']
 # A distinct queue prevents network suspicion from becoming a transfer verdict.
 coverage={'targetTransactions':len(frame),'historyRowsIndexed':int(count),'transactionAlerts':len(alerts),'structuralSeeds':len(structural),'unionSeeds':len(origins),'networksScored':len(networks),'networksSkipped':len(skipped),'networkReviewAlerts':len(gnn_alerts),'networkAlertsOutsideXgbSeeds':sum('xgboost' not in n['candidateOrigins'] for n in gnn_alerts),'exportedTransactions':len(txs),'discoveryTiming':'Daily batch after target-day end; not a real-time discovery claim','exportScope':'Alert/context records plus first 100 target-day rows; all target-day scores saved separately','candidateBudget':a.candidates}
 tx_by_id={t['transactionId']:t for t in txs};edges={}
 for n in networks:
  for e in n['edges']:
   tx=tx_by_id[e['transactionId']]
   edges[e['transactionId']]={'transactionId':e['transactionId'],'source':e['from'],'target':e['to'],'type':'transaction','amount':e['amountPaid'],'currency':tx['paymentCurrency'],'timestamp':e['timestamp'],'sourceDataset':a.dataset_id,'flagged':tx['decision']=='flag','networkReviewIds':[x['networkId'] for x in gnn_alerts if any(y['transactionId']==e['transactionId'] for y in x['edges'])]}
 manifest={'schema':'acurion-offline-inference-v1','datasetId':a.dataset_id,'sourceRowConvention':a.source_row_convention,'sourceTimezone':a.source_timezone,'timezoneNote':'Caller-supplied interpretation for display; model used original wall-clock hours','day':str(day.date()),'evaluatedAt':now,'policyVersion':POLICY,'input':str(a.input.resolve()),'inputSha256':file_hash(a.input),'xgbSha256':file_hash(model_path),'gnnSha256':file_hash(gnn_path),'encoderSha256':file_hash(a.encoder),'rankReferenceSha256':file_hash(a.assets/'models/gnn_v3_calibration.npz'),'quality':quality,'coverage':coverage,'limitations':['Experimental models; scores are not calibrated laundering probabilities','Previously examined benchmark day is not a new holdout','Candidate budget limits discovery; unselected networks are unassessed','Historical graph connectivity is not proof of a time-ordered money trail']}
 a.output.mkdir(parents=True)
 def write(name,obj):(a.output/name).write_text(json.dumps(obj,indent=2,allow_nan=False))
 write('manifest.json',manifest);write('transactions.json',{t['transactionId']:t for t in txs});write('alerts.json',{t['alertId']:t for t in alerts});write('networks.json',networks);write('network_reviews.json',gnn_alerts);write('graphData.json',{'edges':edges});write('skipped_networks.json',skipped)
 pd.DataFrame({'source_row':frame.source_row,'rawScore':scores,'policyRank':ranks,'flag':flags}).to_parquet(a.output/'transaction_scores.parquet',index=False)
 if a.evaluate:
  # Ground truth is joined only AFTER both inference branches and exports are finished.
  truth=con.execute('SELECT source_row,is_laundering FROM read_parquet(?)',[str(a.input)]).df()
  if not truth.is_laundering.isin([0,1]).all():raise ValueError('Evaluation requires binary ground truth')
  truth=dict(zip(truth.source_row.astype(int),truth.is_laundering.astype(int)))
  y=[truth[int(i)] for i in frame.source_row];evaluation={'status':'Retrospective diagnostic, not untouched final evaluation','transactions':binary_metrics(y,ranks,xt)}
  if networks:
   labels=[int(any(truth[int(r[0])] for r in rows)) for rows in seed_members]
   evaluation['networks_union']=binary_metrics(labels,prob,threshold)
   independent=[j for j,n in enumerate(networks) if 'xgboost' not in n['candidateOrigins']]
   if independent:evaluation['networks_outside_xgb']=binary_metrics(np.array(labels)[independent],np.array(prob)[independent],threshold)
  write('evaluation_only.json',evaluation)
 con.close();print(json.dumps(coverage,indent=2),flush=True)
 return manifest

def file_hash(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
 return h.hexdigest()

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--input',type=Path,required=True);p.add_argument('--dataset-id',required=True);p.add_argument('--day',required=True);p.add_argument('--source-timezone',required=True,help='Explicit dataset wall-clock timezone assumption, e.g. UTC');p.add_argument('--source-row-convention',required=True,choices=['zero-based','one-based','provided-integer-id']);p.add_argument('--output',type=Path,required=True)
 p.add_argument('--assets',type=Path,default=ROOT/'source');p.add_argument('--encoder',type=Path,default=ROOT/'contracts/temporal_encoder.json');p.add_argument('--gnn',choices=['gnn_aml_network_v4.pt','gnn_aml_network_v5_hi_medium_provisional.pt','gnn_aml_network_v5_early_provisional.pt'],default='gnn_aml_network_v5_hi_medium_provisional.pt');p.add_argument('--candidates',type=int,default=400);p.add_argument('--max-day-rows',type=int,default=1000000);p.add_argument('--max-history-rows',type=int,default=10000000);p.add_argument('--evaluate',action='store_true')
 run(p.parse_args())
