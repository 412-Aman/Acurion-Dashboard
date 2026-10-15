// Explicit aliases only. Unknown columns never become guessed identities, dates or scores.
const shared={
  timestamp:['timestamp','eventTimestamp','event_timestamp','Timestamp','created_at','date','createdAt'],
  sourceDataset:['sourceDataset','source_dataset','source'],
  riskScore:['riskScore','risk_score'],riskScoreScale:['riskScoreScale','risk_score_scale'],
  modelVersion:['modelVersion','model_version'],policyVersion:['policyVersion','policy_version'],
  ruleScore:['ruleScore','rule_score'],ruleIds:['ruleIds','rule_ids'],
  evaluatedAt:['evaluatedAt','evaluated_at'],featureWindow:['featureWindow','feature_window'],
  anomalyScore:['anomalyScore','anomaly_score','signals.anomaly'],supervisedScore:['supervisedScore','supervised_score','signals.supervised'],
  gnnScore:['gnnScore','gnn_score','signals.gnn'],graphRiskScore:['graphRiskScore','graph_risk_score','signals.graph'],
  supervisedScoreScale:['supervisedScoreScale','supervised_score_scale'],gnnScoreScale:['gnnScoreScale','gnn_score_scale'],
  shapExplanation:['shapExplanation','shap_explanation'],gnnExplanation:['gnnExplanation','gnn_explanation'],
};
export const COLUMN_ALIASES={
  transactions:{...shared,
    transactionId:['transactionId','transaction_id','event_id','TransactionID','id'],
    fromAccount:['fromAccount','from_account','senderAccount','sender_account_id','nameOrig'],
    toAccount:['toAccount','to_account','receiverAccount','receiver_account_id','nameDest'],
    amountPaid:['amountPaid','amount_paid','Amount Paid'],amountReceived:['amountReceived','amount_received','Amount Received'],
    amount:['amount','TransactionAmt'],currency:['currency'],paymentCurrency:['paymentCurrency','payment_currency','Payment Currency'],receivingCurrency:['receivingCurrency','receiving_currency','Receiving Currency'],
    paymentFormat:['paymentFormat','payment_format','Payment Format','transactionType','transaction_type','channel','type','ProductCD'],
    fromBank:['fromBank','from_bank','From Bank'],toBank:['toBank','to_bank','To Bank'],
    payerEmailDomain:['payerEmailDomain','P_emaildomain'],receiverEmailDomain:['receiverEmailDomain','R_emaildomain'],
    transactionTime:['transactionTime','TransactionDT'],label:['label','isLaundering','is_laundering','Is Laundering','isFraud'],
  },
  alerts:{...shared,
    alertId:['alertId','alert_id','id'],transactionId:['transactionId','transaction_id','event_id','TransactionID'],
    accountId:['accountId','account_id','account','sender_account_id','fromAccount','from_account'],
    timestamp:['timestamp','alertTimestamp','alert_timestamp','createdAt','created_at'],
    decision:['decision','recommended_outcome'],reason:['reason','rationale'],
  },
};
export function mapColumns(data,kind){
  const values={},fieldSources={};
  const read=key=>Object.hasOwn(data,key)?data[key]:key.split('.').reduce((value,part)=>value?.[part],data);
  for(const[target,aliases]of Object.entries(COLUMN_ALIASES[kind])){
    const key=aliases.find(key=>read(key)!=null&&read(key)!=='');
    if(key!==undefined){values[target]=read(key);fieldSources[target]=key;}
  }
  return {values,fieldSources};
}
