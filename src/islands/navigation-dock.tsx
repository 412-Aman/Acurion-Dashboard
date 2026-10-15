import { createRoot } from 'react-dom/client';
import { useEffect,useState } from 'react';
import { LayoutDashboard,Bell,BriefcaseBusiness,ArrowLeftRight,Network,Users,ScanSearch,FileText,SlidersHorizontal,ShieldCheck,Activity,Grid2X2 } from 'lucide-react';
import FloatingDock,{type DockItem} from '@/components/ui/floating-dock';
import { NAV_ITEMS } from '../lib/navigation.js';
const icons:Record<string,typeof LayoutDashboard>={overview:LayoutDashboard,alerts:Bell,cases:BriefcaseBusiness,transactions:ArrowLeftRight,graph:Network,customers:Users,screening:ScanSearch,reports:FileText,controls:SlidersHorizontal,shield:ShieldCheck};
const primary=new Set(['Overview','Alerts','Transactions','Account network','Customers & KYC','Reports & audit']);
function NavigationDock({activeHref,onOpenTools}:{activeHref:string;onOpenTools:()=>void}){
  const [current,setCurrent]=useState(activeHref);
  useEffect(()=>{const update=(event:Event)=>setCurrent((event as CustomEvent<string>).detail);document.addEventListener('acurion:map-location',update);return()=>document.removeEventListener('acurion:map-location',update);},[]);
  const all:DockItem[]=NAV_ITEMS.map(item=>{const Icon=icons[item.icon]||Activity;return {title:item.label,href:item.href,detail:item.detail,icon:<Icon strokeWidth={1.6}/>,active:item.href===current};});
  const hidden=all.find(item=>item.active&&!primary.has(item.title));
  const items=[...all.filter(item=>primary.has(item.title)),{title:'All tools',icon:<Grid2X2 strokeWidth={1.6}/>,detail:hidden?`Current: ${hidden.title}. Open all destinations and arrange your workspace.`:'Open all destinations and arrange your workspace. Shortcut: M.',onSelect:onOpenTools,active:Boolean(hidden)}];
  return <FloatingDock items={items} mobileItems={all}/>;
}
export function mountNavigationDock(element:HTMLElement,activeHref:string,onOpenTools:()=>void){const root=createRoot(element);root.render(<NavigationDock activeHref={activeHref} onOpenTools={onOpenTools}/>);return()=>root.unmount();}
