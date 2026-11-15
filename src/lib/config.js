// Explicit offline demo mode. Existing Firebase behaviour is retained by default.
const DEMO_KEY = 'acurion:demo';
let storedDemo = false;
try { storedDemo = sessionStorage.getItem(DEMO_KEY) === 'true' || localStorage.getItem(DEMO_KEY) === 'true'; } catch {}
export const ENV_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
export const DEMO_MODE = ENV_DEMO || storedDemo;
// Short source label shown beside record counts.
export const SOURCE_LABEL = DEMO_MODE ? 'Demo workspace · sample customers and rule alerts' : 'Live workspace data';
// The demo flag is kept in localStorage too, so records opened in a new tab stay in the demo.
export function enterDemo() { sessionStorage.setItem(DEMO_KEY, 'true'); localStorage.setItem(DEMO_KEY, 'true'); }
export function exitDemo() { try { sessionStorage.removeItem(DEMO_KEY); localStorage.removeItem(DEMO_KEY); } catch {} }
const env = import.meta.env;
// Team identifier for the shared case workspace in Firebase.
export const TEAM_ID = (import.meta.env.VITE_TEAM_ID || 'default').replace(/[^A-Za-z0-9_-]/g, '');
export const READ_LIMIT = Math.min(2000, Math.max(25, Number(env.VITE_FIREBASE_READ_LIMIT) || 2000));
export const LEGACY_FIRESTORE_AUDIT = env.VITE_FIREBASE_LEGACY_FIRESTORE_AUDIT === 'true';
export const DATA_PATHS = {
  alerts: env.VITE_FIREBASE_ALERTS_PATH || 'alerts',
  transactions: env.VITE_FIREBASE_TRANSACTIONS_PATH || 'transactions',
  accounts: env.VITE_FIREBASE_ACCOUNTS_PATH || 'accounts',
  graph: env.VITE_FIREBASE_GRAPH_PATH || 'graphData',
  audit: env.VITE_FIREBASE_AUDIT_PATH || 'auditLogs',
  networkReviews: env.VITE_FIREBASE_NETWORK_REVIEWS_PATH || 'networkReviews',
  cases: env.VITE_FIREBASE_CASES_PATH || 'caseWorkspaces',
  // Shared with the host bridge (host/acurion_bridge.py); these names are fixed.
  hostDesk: 'hostDesk',
  uploadJobs: 'uploadJobs',
  uploadFiles: 'uploadFiles',
};
// Development only: simulates the K7 host and an upload so the live controls can be reviewed without Firebase.
export const HOST_PREVIEW = import.meta.env.DEV && env.VITE_HOST_PREVIEW === 'true';
