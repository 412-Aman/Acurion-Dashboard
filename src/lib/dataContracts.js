import { mapColumns } from './columnMapping.js';
// Preserve unavailable fields. Dataset labels never supply model scores.
const string = value => value == null ? '' : String(value);
export const finiteNumber = value => !['number','string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export function score(value,scale) { const n = finiteNumber(value); if(n==null||n<0||n>100)return null; if(scale==='0-100')return n/100;if(scale==='0-1')return n<=1?n:null;return n>1?n/100:n; }
export function isoTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value?.toDate === 'function') value = value.toDate();
  else if (typeof value === 'object' && typeof value.seconds === 'number') value = value.seconds * 1000 + (value.nanoseconds || 0) / 1000000;
  const normalized = typeof value === 'string' ? value.replace(/^(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3').replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/, '$1T$2:00Z') : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
const outcome = value => ['pass','flag','block'].includes(string(value).toLowerCase()) ? string(value).toLowerCase() : 'unassessed';
export function normalizeAlert(key, data) {
  const mapped=mapColumns(data,'alerts');data={...data,...mapped.values};
  const riskScore = data.riskScore!=null ? score(data.riskScore,data.riskScoreScale) : score(data.supervisedScore,data.supervisedScoreScale || data.riskScoreScale);
  const severity = string(data.severity).toLowerCase();
  return {
    id: string(data.alertId || data.alert_id || data.id || key), firebaseKey: key,
    transactionId: string(data.transactionId || data.event_id || data.transaction_id),
    suspiciousAccount: string(data.accountId || data.account || data.sender_account_id || data.fromAccount || data.from_account) || 'Not supplied',
    fieldSources:mapped.fieldSources,
    riskScore, decision: outcome(data.decision || data.recommended_outcome),
    severity: ['critical','high','medium','low'].includes(severity) ? severity : riskScore == null ? 'unknown' : riskScore >= .9 ? 'critical' : riskScore >= .75 ? 'high' : riskScore >= .55 ? 'medium' : 'low',
    status: string(data.status || 'open').toLowerCase(),
    timestamp: isoTimestamp(data.timestamp || data.createdAt || data.created_at),
    reason: string(data.reason || data.rationale), sourceDataset: string(data.sourceDataset || data.source),
    owner: string(data.owner || data.assignedAnalyst || data.assigned_analyst), disposition: string(data.disposition),
    analystNote: string(data.analystNote), policyVersion: string(data.policyVersion || data.policy_version),
    modelVersion: string(data.modelVersion || data.model_version), ruleIds: data.ruleIds || data.rule_ids || [],
    evaluatedAt: isoTimestamp(data.evaluatedAt || data.evaluated_at), featureWindow:data.featureWindow || null,
    ruleScore:finiteNumber(data.ruleScore), evidenceTransactionIds:Array.isArray(data.evidenceTransactionIds)?data.evidenceTransactionIds:[],
    ruleAssessment:data.ruleAssessment || null,
    shapExplanation: data.shapExplanation || null,
    reasons: Array.isArray(data.reasons) ? data.reasons.map(string).filter(Boolean) : [], uploadId: string(data.uploadId), networkId: string(data.networkId),
    signals: { anomaly: finiteNumber(data.anomalyScore), supervised: score(data.supervisedScore,data.supervisedScoreScale), gnn: score(data.gnnScore,data.gnnScoreScale), graph: finiteNumber(data.graphRiskScore) },
  };
}
export function normalizeTransaction(key, data) {
  const mapped=mapColumns(data,'transactions');data={...data,...mapped.values};
  const CURRENCY_ISO = { 'US Dollar':'USD', Euro:'EUR', 'British Pound':'GBP', 'UAE Dirham':'AED', 'Saudi Riyal':'SAR', 'Swiss Franc':'CHF', 'Australian Dollar':'AUD', 'Canadian Dollar':'CAD', 'Chinese Yuan':'CNY', 'Japanese Yen':'JPY', 'Indian Rupee':'INR', 'Russian Ruble':'RUB', 'Singapore Dollar':'SGD', 'Hong Kong Dollar':'HKD' };
  const paid=finiteNumber(data.amountPaid),received=finiteNumber(data.amountReceived);
  const currencyName = paid!=null ? data.paymentCurrency || data.currency : received!=null ? data.receivingCurrency || data.currency : data.currency || data.paymentCurrency || data.receivingCurrency;
  const currency = CURRENCY_ISO[currencyName] || (/^[A-Z]{3}$/.test(currencyName || '') ? currencyName : null);
  const amount = paid ?? received ?? finiteNumber(data.amount);
  const timestamp = isoTimestamp(data.timestamp || data.created_at || data.date || data.createdAt);
  const fromAccount = string(data.fromAccount || data.senderAccount || data.sender_account_id);
  const toAccount = string(data.toAccount || data.receiverAccount || data.receiver_account_id);
  const dataQuality = [];
  if (!fromAccount || !toAccount) dataQuality.push('Account identifiers not supplied');
  if (amount == null || amount < 0) dataQuality.push('Amount missing or invalid');
  if (!currency) dataQuality.push('Currency not supplied');
  if (!timestamp) dataQuality.push('Event timestamp not supplied or invalid');
  return { id:string(data.transactionId || data.event_id || data.id || key), firebaseKey:key, timestamp, fieldSources:mapped.fieldSources,
    fromAccount:fromAccount || 'Not supplied', toAccount:toAccount || 'Not supplied', amount, currency,
    riskScore:score(data.riskScore ?? data.fraudScore,data.riskScoreScale), decision:outcome(data.decision),
    channel:string(data.paymentFormat || data.transactionType || data.transaction_type || data.channel || [data.cardType,data.cardCategory].filter(Boolean).join(' / ')) || 'Not supplied',
    sourceDataset:string(data.sourceDataset || data.source), fromBank:string(data.fromBank), toBank:string(data.toBank),
    payerEmailDomain:string(data.payerEmailDomain), receiverEmailDomain:string(data.receiverEmailDomain),
    datasetLabel:data.label ?? data.isLaundering ?? data.isFraud ?? null, relativeTime:data.step != null ? `Dataset hour ${data.step}` : data.transactionTime != null ? `Dataset second ${data.transactionTime}` : null,
    modelVersion:string(data.modelVersion), policyVersion:string(data.policyVersion), ruleIds:Array.isArray(data.ruleIds)?data.ruleIds:[], ruleScore:finiteNumber(data.ruleScore), dataQuality };
}
export function normalizeAuditLog(key, data) {
  return { id:string(data.id || data.logId || key), timestamp:isoTimestamp(data.timestamp || data.createdAt || data.at),
    alertId:string(data.alertId || data.alert_id), transactionId:string(data.transactionId || data.tx_id),
    action:string(data.action || data.description) || 'Recorded event', actor:string(data.actor || data.createdBy) || 'Not supplied',
    decision:outcome(data.decision), detail:string(data.detail || data.note) };
}
export function validateReview(review) {
  const errors = [];
  if (!['open','assigned','investigating','escalated','closed'].includes(review.status)) errors.push('Choose a decision.');
  if (!String(review.note || '').trim() || review.note.trim().length < 10) errors.push('Write a note of at least 10 characters.');
  if (review.status !== 'open' && !String(review.owner || '').trim()) errors.push('Add the investigator’s name.');
  if (review.status === 'closed' && !['no_further_action','escalated_to_case'].includes(review.disposition)) errors.push('Choose an outcome before closing the alert.');
  return errors;
}
// The alert fields one review writes. "Review ongoing" has no disposition: it is sent as null (Firebase
// removes the field, and its rules never validate null), and a missing disposition reads back as ''.
export function reviewPatch(review, actor, timestamp) {
  return { status:review.status, owner:String(review.owner||'').trim(), disposition:review.disposition||null,
    analystNote:String(review.note||'').trim(), reviewedAt:timestamp, reviewedBy:actor };
}
export function compareAlertPriority(a,b) {
  const closed = record => ['closed','resolved'].includes(record.status) ? 1 : 0;
  const rank = {critical:4,high:3,medium:2,low:1,unknown:0};
  return closed(a)-closed(b) || (rank[b.severity]||0)-(rank[a.severity]||0)
    || (Date.parse(b.timestamp)||0)-(Date.parse(a.timestamp)||0);
}
// Where a writer keeps an alert's payments: K7 under the alert's own key ("k7-h0000123-0", "-1", …), an upload
// under its job ("up-<job>-t0000", …). A key-range read finds such a payment outside the loaded sample, with no
// database index needed.
export function transactionKeyRange(alertKey) {
  const key=String(alertKey||'');
  if(/^k7-[^/]+$/.test(key))return [`${key}-`,`${key}-\uf8ff`];
  const upload=key.match(/^(up-.+)-a\d+$/);
  return upload?[`${upload[1]}-t`,`${upload[1]}-t\uf8ff`]:null;
}
