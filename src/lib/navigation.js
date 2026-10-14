export const NAV_ITEMS = [
  {href:'index.html',label:'Overview',icon:'overview',group:'Workspace',detail:'Your review queue and next steps'},
  {href:'alerts.html',label:'Alerts',icon:'alerts',group:'Investigate',detail:'Prioritise and record a review'},
  {href:'compliance.html?view=cases',label:'Cases',icon:'cases',group:'Investigate',view:'cases',detail:'Evidence, notes and STR / SAR drafts'},
  {href:'transactions.html',label:'Transactions',icon:'transactions',group:'Investigate',detail:'Find the source event'},
  {href:'graph.html',label:'Account network',icon:'graph',group:'Investigate',detail:'Follow accounts and transaction paths'},
  {href:'compliance.html?view=customers',label:'Customers & KYC',icon:'customers',group:'Due diligence',view:'customers',detail:'Customer profiles and review dates'},
  {href:'compliance.html?view=screening',label:'Screening',icon:'screening',group:'Due diligence',view:'screening',detail:'Sanctions, PEPs and media evidence'},
  {href:'reports.html',label:'Reports & audit',icon:'reports',group:'Manage',detail:'Case exports, activity and working notes'},
  {href:'compliance.html?view=monitoring',label:'Rules & simulation',icon:'controls',group:'Manage',view:'monitoring',detail:'Test explainable monitoring scenarios'},
  {href:'compliance.html?view=controls',label:'Policies & retention',icon:'shield',group:'Manage',view:'controls',detail:'Risk policy and record retention'},
  {href:'system.html',label:'System status',icon:'controls',group:'Manage',detail:'Data connection and available services'},
];
export function activeNavigation(page,view) { return NAV_ITEMS.find(item=>item.view? page==='compliance.html' && item.view===view:item.href===page) || NAV_ITEMS[0]; }
