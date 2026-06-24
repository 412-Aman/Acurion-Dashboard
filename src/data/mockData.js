// Mock data shaped to mirror the planned Firebase Realtime Database structure:
// /alerts/{alertId}, /transactions/{txId}, /aiResults/{resultId}, /graphData, /users, /auditLogs/{logId}

const accounts = [
  'ACC-10234', 'ACC-10235', 'ACC-10236', 'ACC-10237', 'ACC-10238',
  'ACC-20451', 'ACC-20452', 'ACC-20453', 'ACC-30119', 'ACC-30120',
  'ACC-30121', 'ACC-40087', 'ACC-40088', 'ACC-50012', 'ACC-50013',
];

const severities = ['low', 'medium', 'high', 'critical'];
const decisions = ['pass', 'flag', 'block'];

function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pad(n, len = 5) { return String(n).padStart(len, '0'); }

function genTimestamp(offsetMin) {
  return new Date(Date.now() - offsetMin * 60000).toISOString();
}

export const transactions = Array.from({ length: 48 }).map((_, i) => {
  const risk = rand(0, 1);
  const decision = risk > 0.8 ? 'block' : risk > 0.55 ? 'flag' : 'pass';
  return {
    id: `TXN-${pad(100000 + i)}`,
    timestamp: genTimestamp(i * 7),
    fromAccount: pick(accounts),
    toAccount: pick(accounts),
    amount: Math.round(rand(50, 95000) * 100) / 100,
    currency: 'AED',
    riskScore: Math.round(risk * 100) / 100,
    decision,
    channel: pick(['Wire Transfer', 'Card Payment', 'Mobile App', 'ATM', 'SWIFT']),
  };
});

export const alerts = transactions
  .filter((t) => t.decision !== 'pass')
  .map((t, i) => {
    const severity = t.riskScore > 0.9 ? 'critical' : t.riskScore > 0.8 ? 'high' : t.riskScore > 0.65 ? 'medium' : 'low';
    return {
      id: `ALT-${pad(5000 + i)}`,
      transactionId: t.id,
      timestamp: t.timestamp,
      riskScore: t.riskScore,
      decision: t.decision,
      severity,
      suspiciousAccount: t.fromAccount,
      status: pick(['open', 'open', 'investigating', 'resolved']),
      shapExplanation: {
        topFeatures: [
          { feature: 'transaction_velocity_5min', impact: +Math.round(rand(0.1, 0.4) * 100) / 100 },
          { feature: 'amount_zscore', impact: +Math.round(rand(0.05, 0.3) * 100) / 100 },
          { feature: 'shared_device_count', impact: +Math.round(rand(0.05, 0.25) * 100) / 100 },
          { feature: 'account_age_days', impact: -Math.round(rand(0.02, 0.15) * 100) / 100 },
        ],
      },
      gnnExplanation: {
        summary: 'Account is structurally connected to a high-density cluster exhibiting layered transfer patterns consistent with smurfing.',
        clusterId: `CLU-${pad(200 + (i % 6), 3)}`,
        confidence: Math.round(rand(0.7, 0.98) * 100) / 100,
      },
    };
  });

// Graph data: nodes = accounts, edges = transactions + shared device/IP relationships
function buildGraphData() {
  const nodes = accounts.map((acc, i) => {
    const relatedAlert = alerts.find((a) => a.suspiciousAccount === acc);
    let risk = 'low';
    if (relatedAlert) risk = relatedAlert.severity;
    return {
      data: {
        id: acc,
        label: acc,
        risk,
        cluster: relatedAlert ? relatedAlert.gnnExplanation.clusterId : null,
      },
    };
  });

  const edgeSet = new Map();
  transactions.forEach((t) => {
    if (t.fromAccount === t.toAccount) return;
    const key = `${t.fromAccount}->${t.toAccount}`;
    if (!edgeSet.has(key)) {
      edgeSet.set(key, {
        data: {
          id: key,
          source: t.fromAccount,
          target: t.toAccount,
          type: 'transaction',
          weight: 1,
          flagged: t.decision !== 'pass',
        },
      });
    } else {
      edgeSet.get(key).data.weight += 1;
    }
  });

  // Add a few synthetic shared-device / shared-IP edges to demonstrate multi-layer graph
  const extraEdges = [
    { source: 'ACC-10234', target: 'ACC-20451', type: 'shared_device' },
    { source: 'ACC-10235', target: 'ACC-20452', type: 'shared_ip' },
    { source: 'ACC-30119', target: 'ACC-30120', type: 'shared_device' },
    { source: 'ACC-30120', target: 'ACC-30121', type: 'shared_ip' },
    { source: 'ACC-40087', target: 'ACC-50012', type: 'shared_ip' },
  ];
  extraEdges.forEach((e, i) => {
    edgeSet.set(`extra-${i}`, { data: { id: `extra-${i}`, ...e, weight: 1, flagged: true } });
  });

  return { nodes, edges: Array.from(edgeSet.values()) };
}

export const graphData = buildGraphData();

export const auditLogs = alerts.map((a, i) => ({
  id: `LOG-${pad(9000 + i)}`,
  timestamp: a.timestamp,
  alertId: a.id,
  transactionId: a.transactionId,
  action: a.decision === 'block' ? 'Transaction blocked pending review' : 'Transaction flagged for analyst review',
  actor: 'system:decision-engine',
  decision: a.decision,
}));

export const overviewStats = {
  totalTransactions24h: transactions.length,
  totalAlerts: alerts.length,
  openAlerts: alerts.filter((a) => a.status === 'open').length,
  blockedTransactions: transactions.filter((t) => t.decision === 'block').length,
  flaggedTransactions: transactions.filter((t) => t.decision === 'flag').length,
  avgRiskScore: Math.round((transactions.reduce((s, t) => s + t.riskScore, 0) / transactions.length) * 100) / 100,
  detectionRate: 0.94,
  systemThroughputTps: 8240,
};

// Severity breakdown for charts
export const severityBreakdown = severities.map((s) => ({
  severity: s,
  count: alerts.filter((a) => a.severity === s).length,
}));

// Risk score timeline (mocked hourly for last 24h)
export const riskTimeline = Array.from({ length: 24 }).map((_, i) => ({
  hour: i,
  avgRisk: Math.round(rand(0.2, 0.75) * 100) / 100,
  alertCount: Math.floor(rand(0, 8)),
}));
