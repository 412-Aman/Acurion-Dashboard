import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, GripVertical, LayoutDashboard, Bell, BriefcaseBusiness, ArrowLeftRight, Network, Users, ScanSearch, FileText, SlidersHorizontal, ShieldCheck, Activity, RotateCcw } from 'lucide-react';
import Sortable from '@/components/ui/sortable';
import { NAV_ITEMS } from '../lib/navigation.js';
import { orderedDestinations, WORKSPACE_ORDER_KEY } from '../lib/workspaceMap.js';

type Destination=typeof NAV_ITEMS[number];
const icons:Record<string,typeof LayoutDashboard>={overview:LayoutDashboard,alerts:Bell,cases:BriefcaseBusiness,transactions:ArrowLeftRight,graph:Network,customers:Users,screening:ScanSearch,reports:FileText,controls:SlidersHorizontal,shield:ShieldCheck};
function WorkspaceMap({activeHref}:{activeHref:string}){
  const [items,setItems]=useState<Destination[]>(()=>{try{return orderedDestinations(NAV_ITEMS,JSON.parse(localStorage.getItem(WORKSPACE_ORDER_KEY)||'null'));}catch{return [...NAV_ITEMS];}});
  const [current,setCurrent]=useState(activeHref),[message,setMessage]=useState('Your order is saved on this browser.');
  useEffect(()=>{const update=(event:Event)=>setCurrent((event as CustomEvent<string>).detail);document.addEventListener('acurion:map-location',update);return()=>document.removeEventListener('acurion:map-location',update);},[]);
  const persist=(next:Destination[])=>{try{localStorage.setItem(WORKSPACE_ORDER_KEY,JSON.stringify(next.map(item=>item.href)));setMessage('Workspace order saved on this browser.');}catch{setMessage('Reordered for this visit. Browser storage is unavailable, so the order could not be saved.');}};
  return <>
    <div className="map-intro"><div><span className="section-kicker">YOUR WORKSPACE / ALL DESTINATIONS</span><h2 id="workspace-map-title" tabIndex={-1}>Where will you take the investigation?</h2><p>Choose a destination. Arrange the map around the way you work.</p></div><span className="map-count">{String(items.length).padStart(2,'0')}<small>DESTINATIONS</small></span></div>
    <div className="map-legend"><span><i/> Current location</span><button type="button" className="text-button" data-tooltip="Restores the original destination order on this browser. No records or account settings are changed." onClick={()=>{setItems([...NAV_ITEMS]);persist([...NAV_ITEMS]);}}><RotateCcw size={13}/> Reset layout</button></div>
    <Sortable<Destination> items={items} onItemsChange={setItems} itemKey={item=>item.href} itemLabel={item=>item.label} label="Workspace destinations" layout="grid" onReorder={persist} className="destination-grid">
      {(item,handle,{index})=>{const Icon=icons[item.icon]||Activity;return <div className={`destination-card ${current===item.href?'current':''}`}>
        <a href={item.href} data-nav-href={item.href} aria-current={current===item.href?'page':undefined} className="destination-link"><span className="destination-eyebrow"><span>{String(index+1).padStart(2,'0')} / {item.group}</span><ArrowUpRight size={15}/></span><span className="destination-name"><Icon size={20} strokeWidth={1.5}/><strong>{item.label}</strong></span><span className="destination-detail">{item.detail}</span><span className="destination-mode">{item.view?'Browser sandbox':item.href==='system.html'?'Connection & access':'Workspace records'}{current===item.href?' · You are here':''}</span></a>
        <button type="button" className="destination-grip" {...handle} data-tooltip={`Reorder ${item.label}. Drag this handle, or press Space, use arrow keys, then press Space to save. Escape cancels.`}><GripVertical size={16}/></button>
      </div>;}}
    </Sortable>
    <div className="map-footer"><p role="status" aria-live="polite">{message}</p><span>Drag a handle to arrange · <kbd>esc</kbd> to close</span></div>
  </>;
}
export function mountWorkspaceMap(element:HTMLElement,activeHref:string){const root=createRoot(element);root.render(<WorkspaceMap activeHref={activeHref}/>);return()=>root.unmount();}
