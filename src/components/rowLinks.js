// Rows and cards marked with data-row-link open their record from anywhere on the surface.
// The real control inside ([data-row-primary]) stays the keyboard and screen reader target.
let installed=false;
export function installRowLinks(){
  if(installed)return;installed=true;
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0)return;
    const row=event.target.closest?.('[data-row-link]');
    if(!row)return;
    const interactive=event.target.closest('a,button,input,select,textarea,label,summary,[role="button"],[contenteditable="true"]');
    if(interactive&&row.contains(interactive))return;
    if(String(getSelection?.()||'').trim())return; // let people select text without opening the record
    const primary=row.querySelector('[data-row-primary]');
    if(!primary)return;
    if(primary instanceof HTMLAnchorElement&&(event.metaKey||event.ctrlKey||event.shiftKey)){window.open(primary.href,'_blank','noopener');return;}
    primary.click();
  });
}
