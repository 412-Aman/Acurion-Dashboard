const transactionFields=[
  ['id','Transaction ID','Dataset / importer'],['fromAccount','Sender account ID','Dataset'],['toAccount','Receiver account ID','Dataset'],
  ['amount','Amount','Dataset'],['currency','Currency','Dataset'],['timestamp','Calendar event time','Dataset'],['sourceDataset','Dataset source','Importer'],
  ['riskScore','Recorded score','Scoring pipeline'],['modelVersion','Model version','Model pipeline'],['ruleScore','Deterministic rule points','Rule engine'],['policyVersion','Policy version','Rule engine'],
];
const alertFields=[
  ['id','Alert ID','Alert producer'],['transactionId','Transaction reference','Alert producer'],['timestamp','Alert creation time','Alert producer'],['reason','Reason','Alert producer'],
  ['sourceDataset','Source dataset','Importer'],['riskScore','Recorded score','Scoring pipeline'],['modelVersion','Model version','Model pipeline'],
  ['ruleScore','Rule points','Rule engine'],['policyVersion','Policy version','Rule engine'],['ruleIds','Rule references','Rule engine'],
  ['evaluatedAt','Evaluation time','Scoring pipeline'],['featureWindow','Feature time window','Scoring pipeline'],
  ['signals.anomaly','Anomaly signal','Model pipeline'],['signals.supervised','Supervised signal','Model pipeline'],['signals.gnn','GNN signal','Model pipeline'],['signals.graph','Graph signal','Model pipeline'],
  ['shapExplanation','SHAP explanation','Model pipeline'],['gnnExplanation','GNN explanation','Model pipeline'],
];
const sourceKey={id:'transactionId',amount:'amount',currency:'paymentCurrency','signals.anomaly':'anomalyScore','signals.supervised':'supervisedScore','signals.gnn':'gnnScore','signals.graph':'graphRiskScore'};
function supplied(value){return value!=null&&value!==''&&value!=='Not supplied'&&(!Array.isArray(value)||value.length>0)&&(!(typeof value==='object'&&!Array.isArray(value))||Object.keys(value).length>0);}
export function fieldCoverage(records,kind){
  return (kind==='alerts'?alertFields:transactionFields).map(([field,label,owner])=>{
    const available=records.filter(record=>supplied(field.split('.').reduce((value,key)=>value?.[key],record)));
    const canonical=field==='id'&&kind==='alerts'?'alertId':sourceKey[field]||field;
    const aliases=canonical==='amount'?['amountPaid','amountReceived','amount']:canonical==='paymentCurrency'?['paymentCurrency','receivingCurrency','currency']:[canonical];
    const columns=[...new Set(available.flatMap(record=>aliases.map(key=>record.fieldSources?.[key]).filter(Boolean)))].sort();
    return {field,label,owner,present:available.length,missing:records.length-available.length,total:records.length,columns};
  });
}
