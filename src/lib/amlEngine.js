// Deterministic, explainable policy rules. No model training or inferred guilt.
export const POLICY_VERSION = 'rules-1.0';
export const defaultPolicy = { incomeMultiple: 3, bulkCount: 3, windowDays: 30, retentionYears: 5, reviewDays: 365, screeningDays: 30, highRiskCountries: [] };
export function normalizeName(name) {
  return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function screenEntity(entity, records) {
  const name = normalizeName(entity.name);
  if (!name) return [];
  return records.flatMap(record => {
    const names = [record.name, ...(record.aliases || [])].map(normalizeName);
    const exact = names.includes(name);
    const tokens = new Set(name.split(' '));
    const candidate = names.some(n => {
      const other = n.split(' ');
      return tokens.size >= 2 && other.length >= 2 && other.filter(t => tokens.has(t)).length / Math.max(tokens.size, other.length) >= 0.75;
    });
    if (!exact && !candidate) return [];
    const corroborated = Boolean((entity.identifier && record.identifier && entity.identifier === record.identifier) || (entity.dob && record.dob && entity.dob === record.dob));
    return [{ ...record, match: exact ? 'Exact name' : 'Similar name', corroborated, disposition: 'pending' }];
  });
}
export function assessTransaction(tx, customer, history, policy = defaultPolicy, screening = []) {
  const reasons = [];
  let points = 0;
  const add = (code, message, weight) => { reasons.push({ code, message, points: weight }); points += weight; };
  let decision = 'pass';
  if (!customer) add('PROFILE_MISSING', 'Customer profile missing; review required', 25);
  else {
    const sameCurrency = tx.currency === customer.currency;
    if (!sameCurrency) add('FX_REQUIRED', 'Profile comparison requires a verified exchange rate', 15);
    if (sameCurrency && tx.amount > customer.threshold) add('THRESHOLD', 'Amount exceeds customer transaction threshold', 25);
    if (sameCurrency && customer.monthlyIncome > 0 && tx.amount > customer.monthlyIncome * policy.incomeMultiple) add('INCOME', `Amount exceeds ${policy.incomeMultiple}× declared monthly income`, 25);
    if (customer.pep !== 'none') add('PEP', 'PEP or related person: enhanced due diligence', 25);
    const end = Date.parse(tx.timestamp);
    const start = end - policy.windowDays * 86400000;
    const comparable = history.filter(t => t.fromAccount === tx.fromAccount && t.currency === customer.currency && Number.isFinite(Date.parse(t.timestamp)) && Date.parse(t.timestamp) >= start && Date.parse(t.timestamp) <= end);
    if (sameCurrency && tx.amount >= customer.threshold && comparable.filter(t => t.amount >= customer.threshold).length >= policy.bulkCount) add('BULK', `${policy.bulkCount}+ large transfers in ${policy.windowDays} days`, 25);
    if (sameCurrency && customer.expectedMonthly > 0 && comparable.reduce((n, t) => n + t.amount, 0) > customer.expectedMonthly * policy.incomeMultiple) add('TURNOVER', 'Rolling outgoing volume exceeds expected activity', 20);
    if (customer.kyc !== 'verified') add('KYC', 'KYC pending or enhanced review required', 20);
  }
  if (policy.highRiskCountries.includes(tx.country)) add('JURISDICTION', 'Destination on institution-managed enhanced review list', 20);
  for (const hit of screening) {
    if (hit.disposition === 'false_positive') continue;
    if (hit.kind === 'sanction' && hit.disposition === 'confirmed') {
      add('SANCTION_CONFIRMED', 'Confirmed sanctions match; simulated block', 100); decision = 'block';
    } else if (hit.kind === 'adverse_media' && hit.disposition === 'confirmed') add('MEDIA', `${hit.severity || 'Unclassified'} adverse-media finding reviewed by analyst`, 25);
    else if (hit.kind === 'pep' && hit.disposition === 'confirmed') add('PEP_MATCH', 'Confirmed counterparty PEP; enhanced due diligence', 25);
    else if (hit.disposition === 'pending') add('SCREENING_PENDING', 'Potential screening match requires identity review', 20);
  }
  if (decision !== 'block' && reasons.length) decision = 'flag';
  return { transactionId: tx.id, customerId: customer?.id || null, score: Math.min(100, points), decision, reasons, policyVersion: POLICY_VERSION };
}
export function customerRisk(customer, assessments = [], findings = []) {
  const factors = [];
  if (customer.pep !== 'none') factors.push({ reason: 'PEP / family / close associate', points: 60 });
  if (customer.kyc !== 'verified') factors.push({ reason: 'Incomplete due diligence', points: 20 });
  const relevant = findings.filter(h => h.entityId === customer.id && h.disposition !== 'false_positive');
  if (relevant.some(h => h.kind === 'sanction' && h.disposition === 'confirmed')) factors.push({ reason: 'Confirmed sanctions designation', points: 100 });
  if (relevant.some(h => h.kind === 'pep' && h.disposition === 'confirmed') && customer.pep === 'none') factors.push({ reason: 'Confirmed PEP screening', points: 60 });
  if (relevant.some(h => h.kind === 'adverse_media' && h.disposition === 'confirmed')) factors.push({ reason: 'Reviewed adverse media', points: 25 });
  if (relevant.some(h => h.disposition === 'pending')) factors.push({ reason: 'Unresolved screening', points: 20 });
  const activity = assessments.filter(a => a.customerId === customer.id && a.decision !== 'pass');
  if (activity.length) factors.push({ reason: `${activity.length} unusual transaction(s)`, points: Math.min(40, activity.length * 10) });
  const score = Math.min(100, factors.reduce((n, f) => n + f.points, 0));
  return { score, level: score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low', factors };
}
export function retentionUntil(record, years) {
  if (record.legalHold) return null;
  if (record.status && record.status !== 'closed') return null;
  const anchors = ['closedAt', 'completedAt', 'relationshipEndedAt', 'inspectionCompletedAt', 'investigationCompletedAt', 'finalJudgmentAt'].map(key => Date.parse(record[key])).filter(Number.isFinite);
  if (!anchors.length) return null; // Open relationships/cases do not start a disposal clock.
  const date = new Date(Math.max(...anchors));
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString();
}
export function validateCase(report) {
  return ['customerId', 'owner', 'narrative', 'grounds', 'jurisdiction'].filter(key => !String(report[key] || '').trim()).map(key => `${key} is required`).concat(report.transactionIds?.length ? [] : ['At least one transaction is required']);
}
