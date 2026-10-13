import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import GatewayFlow from '@/components/ui/gateway-flow';
function Ambient({compact=false}:{compact?:boolean}) {
  const [reduced,setReduced]=useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  if(reduced) return <div className="flow-still" aria-hidden="true"/>;
  return <GatewayFlow mode="dark" speed={compact ? .35 : .5} density={compact ? .35 : .55} size={.7} opacity={.8} saturation={0} className="gateway-flow"/>;
}
export function mountGatewayFlow(element:HTMLElement,compact=false){const root=createRoot(element);root.render(<Ambient compact={compact}/>);return()=>root.unmount();}
