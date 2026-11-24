// Report exports: a signed JSON package, goAML-structured XML for the FIU portal, and a
// printable report. Signatures use the workspace's ECDSA P-256 key (src/lib/vault.js).
import { canonicalJSON } from './sha256.js';
import { buildCaseReport } from './caseWorkflow.js';
import { sha256File, signText, verifySignedText } from './vault.js';
import { verifyChain } from './auditChain.js';

const xml = value => String(value ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
const isoDate = value => (value ? new Date(value) : new Date()).toISOString().replace(/\.\d{3}Z$/, '');
function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function goAmlXml(report, { entityId = import.meta.env?.VITE_GOAML_ENTITY_ID || '', reportingPerson = '' } = {}) {
  const record = report.report, customer = report.customer;
  const tx = report.transactions.map(t => `    <transaction>
      <transactionnumber>${xml(t.id)}</transactionnumber>
      <transaction_location>${xml(t.country || record.jurisdiction)}</transaction_location>
      <date_transaction>${xml(isoDate(t.timestamp))}</date_transaction>
      <transmode_code>${xml(t.channel || 'Transfer')}</transmode_code>
      <amount_local>${xml(Number(t.amount ?? 0).toFixed(2))}</amount_local>
      <t_from_my_client>
        <from_funds_code>K</from_funds_code>
        <from_account><account>${xml(t.fromAccount)}</account><currency_code>${xml(t.currency)}</currency_code></from_account>
        <from_country>${xml(record.jurisdiction)}</from_country>
      </t_from_my_client>
      <t_to>
        <to_funds_code>K</to_funds_code>
        <to_account><account>${xml(t.toAccount)}</account><currency_code>${xml(t.currency)}</currency_code></to_account>
        <to_country>${xml(t.country || record.jurisdiction)}</to_country>
      </t_to>
    </transaction>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<report>
  <rentity_id>${xml(entityId)}</rentity_id>
  <submission_code>E</submission_code>
  <report_code>${xml(record.reportType)}</report_code>
  <entity_reference>${xml(record.id)}</entity_reference>
  <submission_date>${xml(isoDate())}</submission_date>
  <currency_code_local>AED</currency_code_local>
  <reporting_person><first_name>${xml(reportingPerson || record.owner)}</first_name></reporting_person>
  <location><country_code>${xml(record.jurisdiction)}</country_code></location>
  <reason>${xml(record.grounds)}</reason>
  <action>${xml(record.narrative)}</action>
  <report_party>${customer ? `<person_my_client><last_name>${xml(customer.name)}</last_name><id_number>${xml(customer.identifier)}</id_number><nationality1>${xml(customer.country)}</nationality1></person_my_client>` : ''}</report_party>
  <transactions>
${tx}
  </transactions>
</report>
`;
}

export async function exportReportPackage(state, record, scope) {
  const report = buildCaseReport(state, record);
  report.goAml = goAmlXml(report);
  report.auditIntegrity = verifyChain(state.audit);
  const canonical = canonicalJSON(report);
  const signature = await signText(scope, canonical);
  const pack = { schema: 'acurion-signed-report-v1', report, integrity: { sha256: await sha256File(canonical), ...signature, signedAt: new Date().toISOString() } };
  save(`${record.id}-report.json`, JSON.stringify(pack, null, 2), 'application/json');
  return pack.integrity;
}

export function exportGoAml(state, record) {
  const report = buildCaseReport(state, record);
  save(`${record.id}-goaml.xml`, goAmlXml(report), 'application/xml');
}

export async function verifyReportFile(text) {
  let pack;
  try { pack = JSON.parse(text); } catch { return { ok: false, reason: 'This file is not a JSON report package.' }; }
  if (pack?.schema !== 'acurion-signed-report-v1' || !pack.integrity?.signature) return { ok: false, reason: 'This file is not a signed Acurion report package.' };
  const canonical = canonicalJSON(pack.report);
  const hashOk = (await sha256File(canonical)) === pack.integrity.sha256;
  const signatureOk = await verifySignedText(canonical, pack.integrity).catch(() => false);
  return { ok: hashOk && signatureOk, hashOk, signatureOk, caseId: pack.report?.report?.id, signedAt: pack.integrity.signedAt, fingerprint: pack.integrity.sha256, reason: hashOk && signatureOk ? 'Signature and fingerprint match. The report has not been changed since it was signed.' : 'The report content does not match its signature. It was changed after signing.' };
}

export function printReport(state, record) {
  const report = buildCaseReport(state, record), r = report.report, c = report.customer;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const rows = report.transactions.map(t => `<tr><td>${esc(t.id)}</td><td>${esc(t.fromAccount)} → ${esc(t.toAccount)}</td><td style="text-align:right">${esc(Number(t.amount ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 }))} ${esc(t.currency)}</td><td>${esc((t.timestamp || '').replace('T', ' ').slice(0, 16))} UTC</td></tr>`).join('');
  const win = window.open('', '_blank');
  if (!win) throw new Error('Allow pop-ups for this site to open the printable report.');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.id)} ${esc(r.reportType)}</title><style>body{font:13px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#172638;margin:40px;max-width:820px}h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#555;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:28px}.meta{color:#666}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e3e3e3;padding:6px 4px;text-align:left;vertical-align:top}dl{display:grid;grid-template-columns:180px 1fr;gap:4px 16px}dt{color:#666}.mark{display:inline-block;width:10px;height:10px;background:#168c83;border-radius:50%;margin-right:8px}@media print{body{margin:16mm}}</style></head><body><p class="meta"><span class="mark"></span>ACURION · ${esc(r.reportType)} report</p><h1>${esc(r.id)}</h1><p class="meta">Generated ${esc(new Date().toISOString().replace('T', ' ').slice(0, 16))} UTC · Investigator ${esc(r.owner)} · Jurisdiction ${esc(r.jurisdiction)} · Status ${esc(r.status.replaceAll('_', ' '))}</p><h2>Subject</h2><dl><dt>Name</dt><dd>${esc(c?.name || r.customerId)}</dd><dt>Customer ID</dt><dd>${esc(r.customerId)}</dd><dt>Identifier</dt><dd>${esc(c?.identifier || '–')}</dd><dt>Country</dt><dd>${esc(c?.country || '–')}</dd></dl><h2>Grounds for suspicion</h2><p>${esc(r.grounds)}</p><h2>Narrative</h2><p>${esc(r.narrative).replaceAll('\n', '<br>')}</p><h2>Transactions</h2><table><thead><tr><th>ID</th><th>From → to</th><th style="text-align:right">Amount</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table><h2>Evidence</h2><p>${report.graphEvidence.length} graph capture(s) · ${report.documents.length} supporting document(s) · ${report.audit.length} audit event(s)${report.sourceAlert ? ` · source alert ${esc(report.sourceAlert.id)}` : ''}</p></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}
