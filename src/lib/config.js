// Explicit offline demo mode. Existing Firebase behaviour is retained by default.
let sessionDemo = false;
try { sessionDemo = sessionStorage.getItem('acurion:demo') === 'true'; } catch {}
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true' || sessionDemo;
const env = import.meta.env;
export const READ_LIMIT = Math.min(2000, Math.max(25, Number(env.VITE_FIREBASE_READ_LIMIT) || 500));
export const DATA_PATHS = {
  alerts: env.VITE_FIREBASE_ALERTS_PATH || 'alerts',
  transactions: env.VITE_FIREBASE_TRANSACTIONS_PATH || 'transactions',
  accounts: env.VITE_FIREBASE_ACCOUNTS_PATH || 'accounts',
  graph: env.VITE_FIREBASE_GRAPH_PATH || 'graphData',
  audit: env.VITE_FIREBASE_AUDIT_PATH || 'auditLogs',
};
