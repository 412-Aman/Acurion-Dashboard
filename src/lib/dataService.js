// Data Service Layer
// ------------------
// Single point of contact between the UI and the data source.
// USE_FIREBASE = true  → live Firebase (RTDB + Firestore)
// USE_FIREBASE = false → local mock data (offline / unit-test friendly)

import { ref, get, onChildAdded, off } from 'firebase/database';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, fs } from './firebase.js';

import {
  transactions   as mockTransactions,
  alerts         as mockAlerts,
  graphData      as mockGraphData,
  auditLogs      as mockAuditLogs,
  overviewStats  as mockOverviewStats,
  severityBreakdown as mockSeverityBreakdown,
  riskTimeline   as mockRiskTimeline,
} from '../data/mockData.js';

import { DEMO_MODE } from './config.js';
export const USE_FIREBASE = !DEMO_MODE;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** RTDB stores keyed objects; this normalises them to plain arrays. */
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
}

/** Fetch a Realtime Database path and return its value (null if missing). */
async function rtdbGet(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
}

/** Simulate network latency in mock mode. */
function delay(ms = 250) {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── Field Normalizers ───────────────────────────────────────────────────────
// The Firebase data uses different field names and value formats from what the
// UI components expect. These normalizers translate on read so no page file
// needs to know about Firebase's schema.

/**
 * Maps a raw Firebase alert record to the shape expected by the UI.
 * Firebase fields (confirmed):
 *   alertId, decision ("FLAG"/"BLOCK"), reason, riskScore (0-100 int),
 *   severity ("HIGH"/"MEDIUM"/etc.), sourceDataset, transactionId
 */
function normalizeAlert(firebaseKey, data) {
  // riskScore arrives as 0–100 integer; normalise to 0–1 float for all UI logic
  const rawScore = typeof data.riskScore === 'number' ? data.riskScore : 0;
  const riskScore = rawScore > 1 ? rawScore / 100 : rawScore;

  const decision = (data.decision || 'flag').toLowerCase();

  // Derive severity from riskScore so we get a natural distribution
  // (Firebase stores all IEEE-CIS alerts as "HIGH" regardless of score variation)
  const severity = riskScore >= 0.90 ? 'critical'
    : riskScore >= 0.75 ? 'high'
    : riskScore >= 0.55 ? 'medium'
    : 'low';

  return {
    // Core identity
    id:               data.alertId  || firebaseKey,
    transactionId:    data.transactionId || firebaseKey,

    // Risk info
    riskScore,
    decision,
    severity,

    // Account — alerts don't store this directly; use transactionId as stand-in
    suspiciousAccount: data.accountId || data.account || data.from_account
                       || data.transactionId || firebaseKey,

    // Status — not stored in Firebase; default to open
    status: (data.status || 'open').toLowerCase(),

    // Timestamp — not stored; fall back to epoch so formatDateTime shows something
    timestamp: data.timestamp || data.createdAt || data.date || new Date().toISOString(),

    // Extra fields present in Firebase (used in detail panel)
    reason:        data.reason        || '',
    sourceDataset: data.sourceDataset || '',

    // SHAP / GNN may not exist — provide safe defaults so detail panel renders
    shapExplanation: data.shapExplanation || { topFeatures: [] },
    gnnExplanation: data.gnnExplanation || {
      summary:    data.reason || 'Transaction flagged by AI detection model.',
      clusterId:  data.sourceDataset || 'N/A',
      confidence: riskScore,
    },
  };
}

/**
 * Maps a raw Firebase transaction to the shape expected by the UI.
 * Handles 3 confirmed schemas automatically by detecting sourceDataset:
 *
 *  IBM_AML  — fromAccount, toAccount, amountPaid, paymentFormat, paymentCurrency,
 *              isLaundering, timestamp ("YYYY/MM/DD HH:mm")
 *
 *  PaySim   — senderAccount, receiverAccount, amount, transactionType,
 *              isFraud, isFlaggedFraud, step (hour offset from base date)
 *
 *  IEEE_CIS — payerEmailDomain, receiverEmailDomain, amount, cardType,
 *              cardCategory, isFraud, status ("FRAUD"/"NORMAL"),
 *              transactionTime (seconds since midnight)
 */
function normalizeTransaction(firebaseKey, data) {
  const source = (data.sourceDataset || firebaseKey).toUpperCase();
  const isIBM     = source.includes('IBM') || source.includes('AML');
  const isPaySim  = source.includes('PAYSIM') || firebaseKey.startsWith('PAYSIM');
  const isIEEE    = source.includes('IEEE') || firebaseKey.startsWith('IEEE');

  // ── Fraud flag (unified across all schemas) ──────────────────────────────
  const isFraud = data.isFraud === 1        || data.isFraud === true
    || data.isFlaggedFraud === 1             || data.isFlaggedFraud === true
    || data.isLaundering   === 1             || data.isLaundering   === true;

  // ── Risk score ────────────────────────────────────────────────────────────
  const rawScore = typeof data.riskScore  === 'number' ? data.riskScore
                 : typeof data.fraudScore === 'number' ? data.fraudScore
                 : isFraud ? 90 : 10;
  const riskScore = rawScore > 1 ? rawScore / 100 : rawScore;

  // ── Decision ──────────────────────────────────────────────────────────────
  const rawStatus = (data.status || '').toUpperCase();
  const rawDecision = data.decision
    || (rawStatus === 'FRAUD' || rawStatus === 'SUSPICIOUS' ? 'FLAG'
      : rawStatus === 'BLOCKED' ? 'BLOCK'
      : isFraud ? 'FLAG'
      : 'PASS');
  const decision = rawDecision.toLowerCase();

  // ── From / To accounts ────────────────────────────────────────────────────
  let fromAccount, toAccount;
  if (isPaySim) {
    fromAccount = data.senderAccount   || data.fromAccount || 'N/A';
    toAccount   = data.receiverAccount || data.toAccount   || 'N/A';
  } else if (isIEEE) {
    fromAccount = data.payerEmailDomain
      ? `Payer (${data.payerEmailDomain})` : 'N/A';
    toAccount   = data.receiverEmailDomain && data.receiverEmailDomain !== 'N/A'
      ? `Receiver (${data.receiverEmailDomain})` : 'N/A';
  } else {
    // IBM_AML default
    fromAccount = data.fromAccount || 'N/A';
    toAccount   = data.toAccount   || 'N/A';
  }

  // ── Amount ────────────────────────────────────────────────────────────────
  const amount = typeof data.amountPaid     === 'number' ? data.amountPaid
               : typeof data.amountReceived === 'number' ? data.amountReceived
               : typeof data.amount         === 'number' ? data.amount
               : parseFloat(data.amount || 0) || 0;

  // ── Currency (IBM has full names; others have none) ───────────────────────
  const CURRENCY_ISO = {
    'US Dollar': 'USD', 'Euro': 'EUR', 'British Pound': 'GBP',
    'UAE Dirham': 'AED', 'Saudi Riyal': 'SAR', 'Swiss Franc': 'CHF',
    'Australian Dollar': 'AUD', 'Canadian Dollar': 'CAD',
    'Chinese Yuan': 'CNY', 'Japanese Yen': 'JPY',
    'Indian Rupee': 'INR', 'Russian Ruble': 'RUB',
    'Singapore Dollar': 'SGD', 'Hong Kong Dollar': 'HKD',
  };
  const currency = CURRENCY_ISO[data.paymentCurrency]
    || CURRENCY_ISO[data.receivingCurrency]
    || data.currency || 'USD';

  // ── Channel ───────────────────────────────────────────────────────────────
  let channel;
  if (isIEEE) {
    channel = [data.cardType, data.cardCategory].filter(Boolean).join(' / ') || 'Card';
  } else {
    channel = data.paymentFormat || data.transactionType || data.channel || 'Transfer';
  }

  // ── Timestamp ────────────────────────────────────────────────────────────
  let timestamp;
  if (data.timestamp && /\d{4}[\/\-]/.test(String(data.timestamp))) {
    // IBM_AML: "2022/09/01 00:20"
    const d = new Date(String(data.timestamp).replace(/\//g, '-'));
    timestamp = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } else if (isPaySim && data.step != null) {
    // PaySim: step = hour number; anchor to 2023-01-01
    const base = new Date('2023-01-01T00:00:00Z');
    base.setHours(base.getHours() + parseInt(data.step, 10));
    timestamp = base.toISOString();
  } else if (isIEEE && data.transactionTime != null) {
    // IEEE: transactionTime = seconds since midnight; anchor to 2023-01-01
    const base = new Date('2023-01-01T00:00:00Z');
    base.setSeconds(base.getSeconds() + parseInt(String(data.transactionTime), 10));
    timestamp = base.toISOString();
  } else {
    timestamp = data.date || data.createdAt || new Date().toISOString();
  }

  return {
    id:            data.transactionId || firebaseKey,
    timestamp,
    fromAccount,
    toAccount,
    amount,
    currency,
    riskScore,
    decision,
    channel,
    sourceDataset: data.sourceDataset || '',
    isFraud,
    // IBM-specific extras (safe to ignore in other schemas)
    fromBank:  data.fromBank  || '',
    toBank:    data.toBank    || '',
  };
}


/**
 * Maps a raw Firebase audit log record to the shape expected by the UI.
 */
function normalizeAuditLog(firebaseKey, data) {
  return {
    id:            data.id || data.logId || firebaseKey,
    timestamp:     data.timestamp || data.createdAt || data.date || new Date().toISOString(),
    alertId:       data.alertId   || data.alert_id  || '',
    transactionId: data.transactionId || data.tx_id || '',
    action:        data.action    || data.description || 'Decision recorded',
    actor:         data.actor     || data.createdBy  || 'system:decision-engine',
    decision:      (data.decision || 'flag').toLowerCase(),
  };
}

// ─── Overview Stats ─────────────────────────────────────────────────────────

export async function getOverviewStats() {
  if (USE_FIREBASE) {
    const val = await rtdbGet('overviewStats');
    if (val) return val;

    // Compute on-the-fly if no dedicated node exists
    const [alerts, txs] = await Promise.all([getAlerts(), getTransactions()]);
    return {
      totalTransactions24h:  txs.length,
      totalAlerts:           alerts.length,
      openAlerts:            alerts.filter((a) => a.status === 'open').length,
      blockedTransactions:   txs.filter((t) => t.decision === 'block').length,
      flaggedTransactions:   txs.filter((t) => t.decision === 'flag').length,
      avgRiskScore:          txs.length
        ? Math.round((txs.reduce((s, t) => s + t.riskScore, 0) / txs.length) * 100) / 100
        : 0,
      detectionRate:         null,
      systemThroughputTps:   null,
    };
  }
  await delay();
  return { ...mockOverviewStats,
    totalTransactions24h: mockTransactions.length,
    totalAlerts: mockAlerts.length,
    openAlerts: mockAlerts.filter(a => a.status === 'open').length,
    blockedTransactions: mockTransactions.filter(t => t.decision === 'block').length,
    flaggedTransactions: mockTransactions.filter(t => t.decision === 'flag').length,
  };
}

// ─── Severity Breakdown ──────────────────────────────────────────────────────

export async function getSeverityBreakdown() {
  if (USE_FIREBASE) {
    const val = await rtdbGet('severityBreakdown');
    if (val) return toArray(val);

    const alerts = await getAlerts();
    return ['low', 'medium', 'high', 'critical'].map((s) => ({
      severity: s,
      count: alerts.filter((a) => a.severity === s).length,
    }));
  }
  await delay();
  return mockSeverityBreakdown;
}

// ─── Risk Timeline ───────────────────────────────────────────────────────────

export async function getRiskTimeline() {
  if (USE_FIREBASE) {
    const val = await rtdbGet('riskTimeline');
    if (val) return toArray(val);
    return mockRiskTimeline;
  }
  await delay();
  return mockRiskTimeline;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

/**
 * Firebase path: /alerts
 * Each child is keyed ALERT_IEEE_TX_XXXXXXX with the fields shown in the schema.
 */
export async function getAlerts() {
  if (USE_FIREBASE) {
    const val = await rtdbGet('alerts');
    if (!val) return [];
    // val is an object keyed by Firebase key; normalise each entry
    return Object.entries(val).map(([key, data]) => normalizeAlert(key, data));
  }
  await delay();
  return mockAlerts;
}

export async function getAlertById(id) {
  if (USE_FIREBASE) {
    const alerts = await getAlerts();
    return alerts.find((a) => a.id === id) || null;
  }
  await delay(100);
  return mockAlerts.find((a) => a.id === id) || null;
}

// ─── Transactions ────────────────────────────────────────────────────────────

/**
 * Firebase path: /transactions
 * Each child is keyed IBM_AML_TX_X etc.
 */
export async function getTransactions() {
  if (USE_FIREBASE) {
    const val = await rtdbGet('transactions');
    if (!val) return [];
    return Object.entries(val).map(([key, data]) => normalizeTransaction(key, data));
  }
  await delay();
  return mockTransactions;
}

// ─── Graph Data ──────────────────────────────────────────────────────────────

/**
 * Builds a Cytoscape-ready graph from:
 *   /accounts          → nodes  (accountId, bankName, entityName, sourceDataset)
 *   /graphData/edges   → edges  (IBM_AML_TX + PAYSIM_TX, both use source + target)
 *
 * Node risk levels are set low by default; the graph page cross-references
 * alerts to colour high-risk nodes after this call returns.
 */
export async function getGraphData() {
  if (USE_FIREBASE) {
    const [accountsVal, graphVal] = await Promise.all([
      rtdbGet('accounts'),
      rtdbGet('graphData'),
    ]);

    const seenNodes = new Set();
    const nodes = [];
    const edges = [];

    // ── Nodes from /accounts ─────────────────────────────────────────────
    if (accountsVal) {
      Object.entries(accountsVal).forEach(([key, data]) => {
        const id = data.accountId || key;
        if (seenNodes.has(id)) return;
        seenNodes.add(id);
        nodes.push({
          data: {
            id,
            label: id,
            risk: 'low',
            cluster: data.bankId || null,
            bankName:   data.bankName   || '',
            entityName: data.entityName || '',
            sourceDataset: data.sourceDataset || 'IBM_AML',
          },
        });
      });
    }

    // ── Edges from /graphData/edges ──────────────────────────────────────
    // Both IBM_AML_TX and PAYSIM_TX schemas use `source` and `target` fields.
    if (graphVal && graphVal.edges) {
      Object.entries(graphVal.edges).forEach(([key, data]) => {
        const source = data.source || '';
        const target = data.target || '';
        if (!source || !target || source === target) return;

        // Add synthetic nodes for endpoints not in /accounts (e.g. PaySim C.../M... IDs)
        [source, target].forEach((id) => {
          if (!seenNodes.has(id)) {
            seenNodes.add(id);
            nodes.push({
              data: {
                id,
                label: id,
                risk: 'low',
                cluster: null,
                bankName: '',
                entityName: '',
                sourceDataset: (data.sourceDataset || ''),
              },
            });
          }
        });

        edges.push({
          data: {
            id:              data.edgeId || key,
            source,
            target,
            type:            'transaction',
            weight:          1,
            flagged:         false,
            amount:          data.amount || 0,
            transactionType: data.transactionType || '',
            sourceDataset:   data.sourceDataset   || '',
          },
        });
      });
    }

    // ── PaySim fraud edges (flagged = true) ──────────────────────────────
    if (graphVal && graphVal.paysimFraudEdges) {
      Object.entries(graphVal.paysimFraudEdges).forEach(([key, data]) => {
        const source = data.source || data.from || data.senderAccount || '';
        const target = data.target || data.to   || data.receiverAccount || '';
        if (!source || !target || source === target) return;

        [source, target].forEach((id) => {
          if (!seenNodes.has(id)) {
            seenNodes.add(id);
            nodes.push({
              data: { id, label: id, risk: 'high', cluster: null, bankName: '', entityName: '', sourceDataset: 'PaySim' },
            });
          }
        });

        edges.push({
          data: {
            id:     data.edgeId || key,
            source,
            target,
            type:   'suspicious',
            weight: 1,
            flagged: true,
            sourceDataset: 'PaySim',
          },
        });
      });
    }

    // If we got nothing at all, fall through to mock
    if (nodes.length === 0 && edges.length === 0) return mockGraphData;

    return { nodes, edges };
  }
  await delay();
  return mockGraphData;
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────

/**
 * Primary:  Firestore collection "auditLogs"
 * Fallback: RTDB path /auditLogs
 */
export async function getAuditLogs() {
  if (USE_FIREBASE) {
    try {
      const q    = query(collection(fs, 'auditLogs'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((doc) => normalizeAuditLog(doc.id, doc.data()));
      }
    } catch (err) {
      console.warn('[dataService] Firestore auditLogs failed, trying RTDB:', err.message);
    }
    const val = await rtdbGet('auditLogs');
    if (!val) return [];
    return Object.entries(val).map(([key, data]) => normalizeAuditLog(key, data));
  }
  await delay();
  return mockAuditLogs;
}

// ─── Real-time Subscription ──────────────────────────────────────────────────

/**
 * Subscribe to live additions on a Firebase RTDB resource.
 * The first 2 s of child_added events are suppressed (initial data load).
 */
export function subscribeToUpdates(resource, callback) {
  if (USE_FIREBASE) {
    const r = ref(db, resource);
    let ready = false;
    const warmup = setTimeout(() => { ready = true; }, 2000);

    const handler = onChildAdded(r, (snap) => {
      if (!ready) return;
      if (resource === 'alerts') {
        const normalized = normalizeAlert(snap.key, snap.val());
        callback({ type: 'new_alert', item: normalized });
      }
    });

    return () => {
      clearTimeout(warmup);
      off(r, 'child_added', handler);
    };
  }

  // ── Mock simulation ──
  let cancelled = false;
  const interval = setInterval(() => {
    if (cancelled) return;
    if (resource === 'alerts') {
      const base = mockAlerts[Math.floor(Math.random() * mockAlerts.length)];
      callback({
        type: 'new_alert',
        item: {
          ...base,
          id: `ALT-LIVE-${Date.now().toString().slice(-5)}`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }, 15000);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}
