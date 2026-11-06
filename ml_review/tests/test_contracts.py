import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
import torch
from acurion_pipeline.discovery import History,encode_graph,FIELDS,stable_id
from acurion_pipeline.temporal import TemporalEncoder,NUMERIC
from acurion_pipeline.metrics import binary_metrics,choose_threshold
from acurion_pipeline.export import transaction,transaction_alert,network_record

ROOT=Path(__file__).resolve().parents[1]

def rows():
 # An earlier connected transfer, a same-time transfer, and a future transfer.
 return pd.DataFrame([[1,'2022-09-09 09:00','01','A','2','B',10.,10.,'US Dollar','US Dollar','ACH'],[2,'2022-09-09 10:00','2','B','3','C',12.,12.,'US Dollar','US Dollar','Wire'],[3,'2022-09-09 10:00','4','D','2','B',99.,99.,'US Dollar','US Dollar','Cheque'],[4,'2022-09-09 11:00','3','C','5','E',19.,19.,'US Dollar','US Dollar','Cash']],columns=FIELDS)

def test_history_excludes_future_and_tied_rows(tmp_path):
 h=History(str(tmp_path/'h.sqlite'));h.add(rows());h.index()
 built=h.build(2)
 assert [r[0] for r in built]==[1,2]
 g=encode_graph(list(reversed(built)),2)
 assert g['edge'].shape==(2,14)
 assert g['edge'][:,-1].tolist()==[0.,1.]
 assert g['edge'][0,6].item()==1. # ACH
 assert g['edge'][1,11].item()==1. # Wire
 assert g['src'][0].item()==0 and g['dst'][0].item()==1
 h.close()

def test_discovery_is_independent_of_labels_and_row_order(tmp_path):
 found=[]
 for i,label in enumerate([0,1]):
  f=rows().sample(frac=1,random_state=i);f['is_laundering']=label;f['xgb_score']=label
  h=History(str(tmp_path/f'{i}.sqlite'));h.add(f);h.index();found.append(h.choose('2022-09-09'));h.close()
 assert found[0]==found[1]
 assert 2 in found[0] and 3 in found[0]

def test_duplicate_ids_rejected_across_batches(tmp_path):
 import sqlite3
 h=History(str(tmp_path/'h'));h.add(rows())
 with pytest.raises(sqlite3.IntegrityError):h.add(rows().head(1))
 h.close()

def test_namespaces_do_not_collide():
 assert stable_id('A',1)!=stable_id('B',1)
 assert stable_id('A',0)!=stable_id('A',1)

def test_encoder_frozen_contract_and_unknown_categories(tmp_path):
 assets=ROOT/'source/models/xgb_temporal_v3.json'
 if not assets.exists():pytest.skip('Optional archive model unavailable')
 encoder=TemporalEncoder.load(ROOT/'contracts/temporal_encoder.json',assets)
 frame=pd.DataFrame([{**{c:0. for c in NUMERIC},'payment_currency':'US Dollar','receiving_currency':'Euro','payment_format':'ACH'}])
 encoded=encoder.transform(frame)
 assert encoded.shape==(1,76) and encoded[0,39+12]==1 and encoded[0,39+15+4]==1
 frame.payment_format='UNKNOWN_NEW';assert encoder.quality(frame)['unknown_categories']['payment_format']==1
 assert encoder.transform(frame)[0,-7:].sum()==0
 changed=tmp_path/'bad.json';changed.write_text(assets.read_text()+' ')
 with pytest.raises(ValueError,match='checksum'):TemporalEncoder.load(ROOT/'contracts/temporal_encoder.json',changed)

@pytest.mark.parametrize('labels',[[0,0],[1,1]])
def test_calibration_refuses_one_class(labels):
 with pytest.raises(ValueError,match='both classes'):choose_threshold(labels,[.1,.8])

def test_metrics_counts_workload_and_threshold():
 m=binary_metrics([1,1,0,0],[.9,.1,.8,.1],.5)
 assert (m['tp'],m['fp'],m['fn'],m['tn'])==(1,1,1,1)
 assert m['false_alerts_per_true_alert']==1
 assert choose_threshold([1,1,0,0],[.9,.1,.8,.1],0)>.8

def test_exports_never_turn_network_members_into_individual_verdicts(tmp_path):
 h=History(str(tmp_path/'h'));h.add(rows());h.index();net=h.build(2)
 r=rows().iloc[1].to_dict();r['is_laundering']=1
 tx=transaction(r,'fixture','UTC',.7,.999,False)
 n=network_record(net,2,'fixture','UTC',.99,.4,['structural'],'v5')
 a=transaction_alert(tx,.999,'2026-01-01T00:00:00+00:00')
 assert tx['decision']=='unassessed' and n['decision']=='review'
 for obj in [tx,n,a]:
  text=json.dumps(obj)
  assert 'is_laundering' not in text and 'datasetLabel' not in text
 assert a['ruleScore'] is None and a['ruleIds']==[]
 h.close()

def test_single_edge_graph_is_not_called_normal(tmp_path):
 h=History(str(tmp_path/'h'));h.add(rows().head(1));h.index()
 assert encode_graph(h.build(1),1) is None
 h.close()

@pytest.mark.parametrize('y,s,t',[([1.5,0],[.7,.2],.5),([1,0],[.7,.2],float('nan')),([[1],[0]],[.7,.2],.5),([1,0],[.7],.5)])
def test_metrics_reject_invalid_evaluation(y,s,t):
 with pytest.raises(ValueError):binary_metrics(y,s,t)
