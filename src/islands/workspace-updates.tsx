import { createRoot } from 'react-dom/client';
import ChangelogTimeline, { type ChangelogEntry } from '@/components/ui/changelog-timeline';

// Product notes describe shipped functionality, never customer or audit events.
const entries: ChangelogEntry[] = [
  {id:'access-guidance',date:'2026-10-15',category:'improved',title:'Clear steps when access is blocked',summary:'Verification, expired sessions, read permissions and review writes now have separate messages. Each explains what you or your administrator need to do.'},
  {id:'workspace-map',date:'2026-10-15',category:'new',title:'A workspace map that fits your workflow',summary:'Open every destination from the header. Reorder the map using a drag handle or your keyboard. Your arrangement is stored on this browser.'},
  {id:'audit-source',date:'2026-10-15',category:'fixed',title:'Audit checks use Realtime Database',summary:'Audit activity reads the same database as transactions and alerts. The optional legacy Firestore source is disabled unless explicitly configured.'},
  {id:'verified-session',date:'2026-10-15',category:'fixed',title:'System status recognises your session',summary:'Signed-in analysts see their account and data connection details. An empty source is distinguished from a failed read.'},
];
export function mountWorkspaceUpdates(element:HTMLElement){
  const root=createRoot(element);
  root.render(<ChangelogTimeline title="Workspace updates" entries={entries} visibleEntries={4} expandOnHover={false} className="workspace-updates" />);
  return ()=>root.unmount();
}
