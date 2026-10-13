import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import LiveNotificationFeed, { type LiveNotification } from '@/components/ui/live-notification-feed';
import { getAlerts, subscribeToUpdates } from '../lib/dataService.js';
function Notifications() {
  const [items,setItems]=useState<LiveNotification[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let mounted=true;
    const map=(alert:any):LiveNotification=>({id:alert.id,kind:'message',app:'Acurion · Alert monitoring',title:`${alert.severity.toUpperCase()} · ${alert.suspiciousAccount}`,from:'Monitoring engine',text:alert.reason || `Transaction ${alert.transactionId} has a risk score of ${Math.round(alert.riskScore*100)}/100 and requires analyst review.`,time:new Date(alert.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),accent:'#c4c4c4',read:false,actions:[{label:'Review alert',done:'Opened'}]});
    getAlerts().then(alerts=>{if(mounted){setItems(alerts.sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)).slice(-12).map(map));setLoading(false);}}).catch(()=>{if(mounted){setError('The alert feed could not be loaded.');setLoading(false);}});
    const unsubscribe=subscribeToUpdates('alerts',(update:{type:string;item:any})=>{if(mounted && update.type==='new_alert')setItems(prev=>[...prev.filter(p=>p.id!==update.item.id),map(update.item)].slice(-20));});
    return()=>{mounted=false;unsubscribe();};
  },[]);
  const open=(id:string)=>{location.href=`alerts.html?alert=${encodeURIComponent(id)}`;};
  if(loading)return <div className="feed-loading">Loading alert activity…</div>;
  if(error)return <div role="alert" className="feed-loading">{error}</div>;
  return <><LiveNotificationFeed title="Alert activity" items={items} autoplay={false} loop={false} height="min(460px,65dvh)" onOpen={open} onAction={id=>open(id)} onDismiss={id=>setItems(prev=>prev.filter(item=>item.id!==id))}/><p className="helper feed-footnote">Feed dismissals do not resolve or delete AML alerts.</p></>;
}
export function mountNotifications(element:HTMLElement){const root=createRoot(element);root.render(<Notifications/>);return()=>root.unmount();}
