import { seedCompliance } from '../data/complianceData.js';
const KEY = 'acurion.compliance.sandbox.v1';
export function loadWorkspace() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return seedCompliance();
  const state = JSON.parse(raw);
  if (state.schemaVersion !== 1 || !Array.isArray(state.customers) || !Array.isArray(state.audit)) throw new Error('Unsupported workspace data. Export or clear sandbox storage before continuing.');
  return state;
}
export function saveWorkspace(state, action, detail = '') {
  const next = structuredClone(state);
  next.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: 'sandbox:analyst', action, detail });
  localStorage.setItem(KEY, JSON.stringify(next)); // Throws on quota/storage failure; never silently claims success.
  return next;
}
export function downloadJSON(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
