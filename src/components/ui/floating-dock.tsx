"use client";
import { cn } from '@/lib/utils';
import { IconLayoutNavbarCollapse } from '@tabler/icons-react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion, type MotionValue } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type DockItem = {
  title:string;
  icon:ReactNode;
  href?:string;
  detail?:string;
  active?:boolean;
  onSelect?:()=>void;
};
type DockProps={items:DockItem[];mobileItems?:DockItem[];desktopClassName?:string;mobileClassName?:string};

/** Adapted from the supplied FloatingDock: proximity springs, real routes and labelled mobile navigation. */
export function FloatingDock({items,mobileItems=items,desktopClassName,mobileClassName}:DockProps){
  return <><FloatingDockDesktop items={items} className={desktopClassName}/><FloatingDockMobile items={mobileItems} className={mobileClassName}/></>;
}
function FloatingDockDesktop({items,className}:{items:DockItem[];className?:string}){
  const mouseX=useMotionValue(Infinity);
  const reduced=useReducedMotion();
  return <motion.nav aria-label="Primary workspace navigation" className={cn('floating-dock-desktop',className)} onPointerMove={event=>{if(event.pointerType==='mouse'&&!reduced)mouseX.set(event.clientX);}} onPointerLeave={()=>mouseX.set(Infinity)}>
    {items.map(item=><IconContainer key={item.title} mouseX={mouseX} item={item}/>)}
  </motion.nav>;
}
function IconContainer({mouseX,item}:{mouseX:MotionValue<number>;item:DockItem}){
  const ref=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
  const [focused,setFocused]=useState(false);
  const distance=useTransform(mouseX,value=>{const bounds=ref.current?.getBoundingClientRect()??{x:0,width:0};return value-bounds.x-bounds.width/2;});
  const sizeTarget=useTransform(distance,[-100,0,100],[36,52,36]);
  const iconTarget=useTransform(distance,[-100,0,100],[18,24,18]);
  const size=useSpring(sizeTarget,{mass:.1,stiffness:160,damping:15});
  const iconSize=useSpring(iconTarget,{mass:.1,stiffness:160,damping:15});
  const props={className:`dock-link ${item.active?'is-current':''}`,'aria-label':item.title,'aria-current':item.active?'page' as const:undefined,'aria-description':item.detail,onFocus:()=>setFocused(true),onBlur:()=>setFocused(false)};
  const body=<motion.div ref={ref} className="dock-orb" style={{width:reduced?36:focused?44:size,height:reduced?36:focused?44:size}}>
    <motion.span className="dock-icon" aria-hidden="true" style={{width:reduced?18:iconSize,height:reduced?18:iconSize}}>{item.icon}</motion.span>
    <span className="dock-current-dot" aria-hidden="true"/>
    <span className="dock-label" aria-hidden="true">{item.title}</span>
  </motion.div>;
  return item.href?<a {...props} href={item.href}>{body}</a>:<button {...props} type="button" onClick={item.onSelect} aria-haspopup="dialog">{body}</button>;
}
function FloatingDockMobile({items,className}:{items:DockItem[];className?:string}){
  const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const titleId=useId(),panelId=useId(),reduced=useReducedMotion();
  const current=items.find(item=>item.active);
  useEffect(()=>{
    const closeForView=()=>{dialog.current?.close();setOpen(false);};
    const desktop=matchMedia('(min-width:768px)');
    const resize=()=>{if(desktop.matches)closeForView();};
    document.addEventListener('acurion:workspace-view',closeForView);
    desktop.addEventListener('change',resize);
    return()=>{document.removeEventListener('acurion:workspace-view',closeForView);desktop.removeEventListener('change',resize);};
  },[]);
  const close=()=>{dialog.current?.close();setOpen(false);trigger.current?.focus();};
  const show=()=>{dialog.current?.showModal();setOpen(true);};
  return <div className={cn('floating-dock-mobile',className)}>
    <button ref={trigger} type="button" className="dock-mobile-trigger" onClick={show} aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId}><IconLayoutNavbarCollapse size={20} aria-hidden="true"/><span><small>NAVIGATE</small>{current?.title||'Workspace'}</span><span className="dock-mobile-plus" aria-hidden="true">+</span></button>
    <dialog ref={dialog} id={panelId} className="dock-mobile-dialog" aria-labelledby={titleId} onClose={()=>setOpen(false)} onClick={event=>{if(event.target===dialog.current)close();}}>
      <motion.div className="dock-mobile-sheet" initial={false} animate={{opacity:open?1:0,y:open?0:14}} transition={{duration:reduced?0:.22,ease:[.22,1,.36,1]}}>
        <div className="dock-sheet-heading"><div><span className="section-kicker">ACURION / WORKSPACE</span><h2 id={titleId}>Choose your next step</h2></div><button type="button" className="icon-button" aria-label="Close navigation" onClick={close}>×</button></div>
        <nav aria-label="All workspace destinations" className="dock-mobile-grid">{items.map(item=>{
          const content=<><span className="dock-sheet-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span>{item.active&&<span className="dock-sheet-current">Here</span>}</>;
          return item.href?<a href={item.href} key={item.title} aria-current={item.active?'page':undefined} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)close();}}>{content}</a>:<button key={item.title} type="button" onClick={()=>{close();item.onSelect?.();}}>{content}</button>;
        })}</nav>
        <p className="dock-sheet-footer">All tools stay connected to the same workspace.</p>
      </motion.div>
    </dialog>
  </div>;
}
export default FloatingDock;
