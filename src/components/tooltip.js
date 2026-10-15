// One delegated tooltip for static markup and React islands, including modal dialogs.
let installed=false;
export function installTooltips() {
  if(installed)return;installed=true;
  const tip=document.createElement('div');
  tip.id='workspace-tooltip';tip.className='workspace-tooltip';tip.setAttribute('role','tooltip');
  tip.setAttribute('popover','manual');tip.hidden=true;document.body.append(tip);
  let trigger,timer,closing,dismissed;
  const target=node=>node instanceof Element?node.closest('[data-tooltip]'):null;
  const position=()=>{
    if(!trigger?.isConnected){hide();return;}
    const rect=trigger.getBoundingClientRect(),box=tip.getBoundingClientRect(),gap=10;
    const top=rect.top-box.height-gap;
    tip.style.left=`${Math.max(10,Math.min(innerWidth-box.width-10,rect.left+rect.width/2-box.width/2))}px`;
    tip.style.top=`${Math.max(10,Math.min(innerHeight-box.height-10,top>=10?top:rect.bottom+gap))}px`;
  };
  function hide(){
    clearTimeout(timer);clearTimeout(closing);
    if(trigger){const ids=(trigger.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==tip.id);if(ids.length)trigger.setAttribute('aria-describedby',ids.join(' '));else trigger.removeAttribute('aria-describedby');}
    if(tip.matches(':popover-open'))tip.hidePopover();tip.hidden=true;trigger=undefined;
  }
  function show(node,immediate=false){
    if(node===dismissed||node===trigger)return;
    hide();trigger=node;
    timer=setTimeout(()=>{
      if(!trigger?.isConnected){hide();return;}
      tip.textContent=trigger.dataset.tooltip;tip.hidden=false;
      // A popover shares the top layer with dialogs, avoiding clipped hints.
      if(typeof tip.showPopover==='function')tip.showPopover();
      const ids=new Set((trigger.getAttribute('aria-describedby')||'').split(' ').filter(Boolean));ids.add(tip.id);trigger.setAttribute('aria-describedby',[...ids].join(' '));
      position();
    },immediate?0:400);
  }
  const leave=()=>{closing=setTimeout(()=>{if(document.activeElement!==trigger&&!tip.matches(':hover'))hide();},140);};
  document.addEventListener('pointerover',event=>{if(tip.contains(event.target)){clearTimeout(closing);return;}const node=target(event.target);if(node){clearTimeout(closing);show(node);}});
  document.addEventListener('pointerout',event=>{const node=target(event.target);if(node&&!node.contains(event.relatedTarget)){dismissed=undefined;leave();}});
  tip.addEventListener('pointerleave',leave);
  document.addEventListener('focusin',event=>{dismissed=undefined;const node=target(event.target);if(node?.matches(':focus-visible'))show(node,true);else hide();});
  document.addEventListener('focusout',event=>{if(target(event.target))hide();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&trigger){dismissed=trigger;hide();}});
  document.addEventListener('pointerdown',event=>{if(!tip.contains(event.target))hide();});
  document.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
  window.addEventListener('pagehide',hide);
}
