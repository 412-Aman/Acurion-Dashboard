import { defaultPolicy } from '../lib/amlEngine.js';
export function seedCompliance() {
  const now = new Date();
  const ago = days => new Date(now.getTime() - days * 86400000).toISOString();
  return {
    schemaVersion: 1, policy: { ...defaultPolicy },
    customers: [
      { id: 'DEMO-001', name: 'Demo Customer One', type: 'Individual', country: 'AE', currency: 'AED', monthlyIncome: 18000, expectedMonthly: 35000, threshold: 50000, pep: 'none', relatedTo: '', kyc: 'verified', sourceOfFunds: 'Employment', identifier: 'DEMO-ID-001', dob: '1988-05-02', createdAt: ago(120), reviewedAt: ago(60) },
      { id: 'DEMO-002', name: 'Demo Public Official', type: 'Individual', country: 'AE', currency: 'AED', monthlyIncome: 45000, expectedMonthly: 100000, threshold: 50000, pep: 'foreign', relatedTo: '', kyc: 'enhanced_review', sourceOfFunds: 'Public office salary', identifier: 'DEMO-ID-002', dob: '1970-01-01', createdAt: ago(90), reviewedAt: ago(45) },
      { id: 'DEMO-003', name: 'Demo Trading Company', type: 'Company', country: 'AE', currency: 'AED', monthlyIncome: 200000, expectedMonthly: 500000, threshold: 150000, pep: 'associate', relatedTo: 'DEMO-002', kyc: 'pending', sourceOfFunds: 'Trading revenue', identifier: 'DEMO-LIC-003', createdAt: ago(10), reviewedAt: ago(10) },
    ],
    counterparties: [{ id: 'DEMO-CP-001', name: 'Demo Designated Entity', identifier: 'DEMO-DESIGNATED-001', country: 'ZZ' }, { id: 'DEMO-CP-002', name: 'Demo Supplier', identifier: 'DEMO-SUPPLIER-002', country: 'AE' }],
    transactions: [70000, 82000, 65000, 1400, 180000].map((amount, i) => ({ id: `DEMO-TX-${i + 1}`, fromAccount: i === 4 ? 'DEMO-003' : 'DEMO-001', toAccount: i === 2 ? 'DEMO-CP-001' : 'DEMO-CP-002', country: i === 2 ? 'ZZ' : 'AE', currency: 'AED', amount, timestamp: ago(5 - i) })),
    watchlist: [{ id: 'DEMO-LIST-001', name: 'Demo Designated Entity', aliases: ['Demo Designated Co'], kind: 'sanction', identifier: 'DEMO-DESIGNATED-001', source: 'Synthetic training list', sourceUrl: '', listedAt: ago(20) }],
    findings: [], assessments: [], cases: [], documents: [], audit: [], riskHistory: [], runs: [],
  };
}
