import { defaultPolicy } from '../lib/amlEngine.js';
export function seedCompliance() {
  const now = new Date();
  const ago = days => new Date(now.getTime() - days * 86400000).toISOString();
  return {
    schemaVersion: 1, policy: { ...defaultPolicy },
    customers: [
      { id: 'CUST-1001', name: 'Layla Haddad', type: 'Individual', country: 'AE', currency: 'AED', monthlyIncome: 18000, expectedMonthly: 35000, threshold: 50000, pep: 'none', relatedTo: '', kyc: 'verified', sourceOfFunds: 'Employment income', identifier: 'PASS-AE-4471-LH', dob: '1988-05-02', createdAt: ago(120), reviewedAt: ago(60) },
      { id: 'CUST-1002', name: 'Karim Nassar', type: 'Individual', country: 'AE', currency: 'AED', monthlyIncome: 45000, expectedMonthly: 100000, threshold: 50000, pep: 'foreign', relatedTo: '', kyc: 'enhanced_review', sourceOfFunds: 'Public office salary', identifier: 'PASS-LB-2290-KN', dob: '1970-01-14', createdAt: ago(90), reviewedAt: ago(45) },
      { id: 'CUST-1003', name: 'Qasr Meridian Trading LLC', type: 'Company', country: 'AE', currency: 'AED', monthlyIncome: 200000, expectedMonthly: 500000, threshold: 150000, pep: 'associate', relatedTo: 'CUST-1002', kyc: 'pending', sourceOfFunds: 'General trading revenue', identifier: 'LIC-DXB-883104', createdAt: ago(10), reviewedAt: ago(10) },
    ],
    counterparties: [{ id: 'CP-2001', name: 'Tarsis Maritime Holdings', identifier: 'REG-PA-559021', country: 'PA' }, { id: 'CP-2002', name: 'Dunecrest Building Supplies FZE', identifier: 'LIC-SHJ-120447', country: 'AE' }],
    transactions: [70000, 82000, 65000, 1400, 180000].map((amount, i) => ({ id: `CW-TX-${1001 + i}`, fromAccount: i === 4 ? 'CUST-1003' : 'CUST-1001', toAccount: i === 2 ? 'CP-2001' : 'CP-2002', country: i === 2 ? 'PA' : 'AE', currency: 'AED', amount, channel: i === 3 ? 'Card payment' : 'Wire transfer', timestamp: ago(5 - i) })),
    watchlist: [{ id: 'WL-0001', name: 'Tarsis Maritime Holdings', aliases: ['Tarsis Marine Co'], kind: 'sanction', identifier: 'REG-PA-559021', source: 'Internal sanctions watchlist', sourceUrl: '', listedAt: ago(20) }],
    findings: [], assessments: [], cases: [], documents: [], audit: [], riskHistory: [], runs: [],
  };
}
