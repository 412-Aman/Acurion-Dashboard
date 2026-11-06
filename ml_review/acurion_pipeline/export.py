"""Dashboard contracts: no labels, invented explanations or automatic blocking."""
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
import pandas as pd
from .discovery import stable_id,account
CURRENCIES={'US Dollar':'USD','Euro':'EUR','UK Pound':'GBP','Yen':'JPY','Yuan':'CNY','Rupee':'INR','Ruble':'RUB','Brazil Real':'BRL','Mexican Peso':'MXN','Shekel':'ILS','Swiss Franc':'CHF','Saudi Riyal':'SAR','Canadian Dollar':'CAD','Australian Dollar':'AUD','Bitcoin':'BTC'}

def event_time(value,zone):
 t=pd.Timestamp(value)
 if t.tzinfo is not None:raise ValueError('Expected original wall-clock input')
 # Raises on ambiguous/nonexistent local times rather than guessing during DST.
 return t.tz_localize(ZoneInfo(zone),ambiguous='raise',nonexistent='raise').tz_convert('UTC').isoformat()

def transaction(r,dataset,zone,score,rank,flag):
 return {'transactionId':stable_id(dataset,r['source_row']),'sourceRow':int(r['source_row']),'timestamp':event_time(r['event_timestamp'],zone),'fromAccount':account(r['sender_bank'],r['sender_account']),'toAccount':account(r['receiver_bank'],r['receiver_account']),'fromBank':str(r['sender_bank']),'toBank':str(r['receiver_bank']),'amountPaid':float(r['amount_paid']),'amountReceived':float(r['amount_received']),'paymentCurrency':CURRENCIES.get(str(r['payment_currency']),str(r['payment_currency'])),'receivingCurrency':CURRENCIES.get(str(r['receiving_currency']),str(r['receiving_currency'])),'paymentFormat':str(r['payment_format']),'sourceDataset':dataset,'riskScore':float(score),'riskScoreScale':'0-1','scoreMeaning':'Uncalibrated model score, not probability of laundering','policyRank':float(rank),'decision':'flag' if flag else 'unassessed','modelVersion':'xgb_temporal_v3','policyVersion':'archived-validation-rank-v1'}

def transaction_alert(tx,threshold,evaluated_at):
 return {'alertId':'A_'+tx['transactionId'],'transactionId':tx['transactionId'],'accountId':tx['fromAccount'],'timestamp':tx['timestamp'],'evaluatedAt':evaluated_at,'status':'open','decision':'flag','severity':'unknown','riskScore':tx['riskScore'],'riskScoreScale':'0-1','supervisedScore':tx['riskScore'],'supervisedScoreScale':'0-1','sourceDataset':tx['sourceDataset'],'modelVersion':tx['modelVersion'],'policyVersion':tx['policyVersion'],'scoreMeaning':tx['scoreMeaning'],'threshold':threshold,'thresholdScale':'empirical validation percentile','reason':'Transaction model crossed the frozen validation-rank review threshold. This is a review recommendation.','featureWindow':{'type':'strictly prior history; same-timestamp transactions excluded'},'ruleIds':[],'ruleScore':None,'evidenceTransactionIds':[tx['transactionId']]}

def network_record(rows,seed_id,dataset,zone,score,threshold,origins,model_name):
 nodes=sorted({r[2] for r in rows}|{r[3] for r in rows})
 import networkx as nx
 graph=nx.DiGraph();graph.add_edges_from((r[2],r[3]) for r in rows)
 observations={'accounts':len(nodes),'transfers':len(rows),'maxDistinctIncomingAccounts':max(dict(graph.in_degree()).values()),'maxDistinctOutgoingAccounts':max(dict(graph.out_degree()).values()),'containsDirectedCycle':not nx.is_directed_acyclic_graph(graph),'cycleNote':'A directed cycle does not establish chronological flow or laundering'}
 return {'networkId':'N_'+stable_id(dataset,seed_id),'seedTransactionId':stable_id(dataset,seed_id),'scope':'network','observations':observations,'score':float(score),'scoreMeaning':'Uncalibrated network score, not an individual transfer verdict','threshold':float(threshold),'modelVersion':model_name,'policyVersion':'structural-top-daily-v1-lookback9-hops4-edges48-neighbors14-cap3','candidateOrigins':origins,'decision':'review' if score>=threshold else 'unassessed','reason':f'Connected historical context containing {len(rows)} transfers and {len(nodes)} accounts. Connectivity does not prove an ordered money trail.','nodes':[{'id':n,'label':n} for n in nodes],'edges':[{'transactionId':stable_id(dataset,r[0]),'from':r[2],'to':r[3],'timestamp':event_time(r[1],zone),'amountPaid':r[4],'amountReceived':r[5],'sameCurrency':bool(r[6]),'crossBank':bool(r[7]),'paymentFormat':r[8]} for r in rows]}
