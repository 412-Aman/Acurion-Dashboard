// Shared styled controls. Native selects only back form values; no native picker is exposed.
let installed=false,sequence=0;
export function installCustomSelects(){
  if(installed)return;installed=true;
  const controls=new Map();let current;
  const close=()=>{if(current){current.close();current=undefined;}};
  function enhance(source){
    if(controls.has(source)||source.multiple)return;
    const suggestions=source instanceof HTMLInputElement;
    const data=suggestions?document.getElementById(source.getAttribute('list')):source;
    if(!data)return;
    const label=source.getAttribute('aria-label')||source.labels?.[0]?.textContent.split('\n')[0].trim().replace(/\s+/g,' ').split(source.options?.[0]?.textContent||'\0')[0].trim()||source.name||'Choose an option';
    const wrapper=document.createElement('span');wrapper.className='custom-select';source.before(wrapper);wrapper.append(source);
    const trigger=suggestions?source:document.createElement('button');
    if(!suggestions){source.hidden=true;source.tabIndex=-1;source.setAttribute('aria-hidden','true');trigger.type='button';trigger.className='input custom-select-trigger';wrapper.append(trigger);}
    else{source.removeAttribute('list');source.autocomplete='off';}
    trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    if(suggestions)trigger.setAttribute('aria-autocomplete','list');
    const list=document.createElement('div');list.className='custom-select-menu';list.id=`acurion-select-${++sequence}`;list.setAttribute('role','listbox');list.setAttribute('aria-label',label);list.setAttribute('popover','manual');list.hidden=true;wrapper.append(list);trigger.setAttribute('aria-controls',list.id);
    let opened=false,active=-1,visible=[],search='',timer,signature='';
    const options=()=>Array.from(data.options).filter(o=>!o.hidden&&(!suggestions||!source.value||o.value.toLowerCase().includes(source.value.toLowerCase())));
    const mark=()=>{Array.from(list.children).forEach((node,i)=>node.classList.toggle('is-active',i===active));if(active>=0){trigger.setAttribute('aria-activedescendant',`${list.id}-${active}`);list.children[active]?.scrollIntoView({block:'nearest'});}else trigger.removeAttribute('aria-activedescendant');};
    const sync=()=>{
      const nextSignature=Array.from(data.options).map(o=>`${o.value}:${o.label}:${o.disabled}:${o.hidden}`).join('|');
      if(nextSignature!==signature){signature=nextSignature;if(opened){render();position();}}
      if(!suggestions){const selected=source.selectedOptions[0];const text=selected?.label||'No options available';if(trigger.firstChild?.textContent!==text||trigger.childNodes.length!==2){trigger.replaceChildren(document.createTextNode(text));const arrow=document.createElement('span');arrow.className='custom-select-chevron';arrow.setAttribute('aria-hidden','true');arrow.textContent='⌄';trigger.append(arrow);}const disabled=source.disabled||!source.options.length;if(trigger.disabled!==disabled)trigger.disabled=disabled;trigger.setAttribute('aria-label',`${label}: ${text}`);}
    };
    const render=()=>{visible=options();list.replaceChildren(...visible.map((option,i)=>{const item=document.createElement('div');item.id=`${list.id}-${i}`;item.className='custom-select-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.value===source.value));item.setAttribute('aria-disabled',String(option.disabled));item.textContent=option.label||option.value;item.addEventListener('pointerdown',e=>e.preventDefault());item.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();choose(i);});return item;}));if(!visible.length){const empty=document.createElement('p');empty.className='helper custom-select-empty';empty.textContent='No matching options';list.append(empty);}active=visible.findIndex(o=>o.value===source.value&&!o.disabled);mark();};
    const position=()=>{const r=trigger.getBoundingClientRect(),height=Math.min(288,list.scrollHeight,window.innerHeight-24),below=window.innerHeight-r.bottom-12,up=below<height&&r.top>below;list.style.width=`${Math.min(Math.max(r.width,200),window.innerWidth-24)}px`;list.style.left=`${Math.max(12,Math.min(r.left,window.innerWidth-parseFloat(list.style.width)-12))}px`;list.style.maxHeight=`${Math.max(80,Math.min(288,up?r.top-16:below))}px`;list.style.top=up?'auto':`${r.bottom+6}px`;list.style.bottom=up?`${window.innerHeight-r.top+6}px`:'auto';};
    const hide=()=>{if(!opened)return;opened=false;clearTimeout(timer);if(list.matches(':popover-open'))list.hidePopover();list.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');};
    const open=()=>{if(trigger.disabled)return;close();opened=true;current={close:hide,wrapper,list};render();list.hidden=false;list.showPopover();position();trigger.setAttribute('aria-expanded','true');};
    function choose(index){const option=visible[index];if(!option||option.disabled)return;source.value=option.value;source.dispatchEvent(new Event('input',{bubbles:true}));source.dispatchEvent(new Event('change',{bubbles:true}));hide();sync();trigger.focus();}
    trigger.addEventListener('click',()=>{if(suggestions){if(!opened)open();}else opened?hide():open();});
    trigger.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&opened){event.preventDefault();event.stopPropagation();hide();return;}
      if(event.key==='Tab'){hide();return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&(!suggestions||opened||event.key.startsWith('Arrow'))){event.preventDefault();if(!opened)open();const direction=event.key==='ArrowUp'?-1:1;let next=event.key==='Home'?0:event.key==='End'?visible.length-1:active+direction;while(next>=0&&next<visible.length&&visible[next].disabled)next+=direction;if(next>=0&&next<visible.length)active=next;mark();return;}
      if(event.key==='Enter'||(!suggestions&&event.key===' ')){event.preventDefault();opened?choose(active):open();return;}
      if(!suggestions&&event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();if(!opened)open();search+=event.key.toLowerCase();clearTimeout(timer);timer=setTimeout(()=>search='',650);const next=visible.findIndex(o=>!o.disabled&&o.label.toLowerCase().startsWith(search));if(next>=0){active=next;mark();}}
    });
    if(suggestions)source.addEventListener('input',()=>{if(!opened)open();else{render();position();}});
    source.addEventListener('change',sync);source.addEventListener('invalid',e=>{e.preventDefault();trigger.focus();trigger.setAttribute('aria-invalid','true');});
    controls.set(source,{sync,data,wrapper,close:hide});sync();
  }
  const scan=()=>{
    for(const[source,control]of controls){if(!source.isConnected){control.close();controls.delete(source);}else control.sync();}
    document.querySelectorAll('select,input[list]').forEach(enhance);
  };
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label','value']});
  document.addEventListener('pointerdown',e=>{if(current&&!current.wrapper.contains(e.target))close();});
  document.addEventListener('click',()=>queueMicrotask(()=>{for(const c of controls.values())c.sync();}));
  document.addEventListener('reset',()=>setTimeout(scan,0));
  document.addEventListener('scroll',e=>{if(current&&!current.list.contains(e.target))close();},true);
  window.addEventListener('resize',close);document.addEventListener('close',close,true);
  scan();
}
