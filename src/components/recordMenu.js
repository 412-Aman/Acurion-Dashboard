import { icon, escapeHTML as esc } from './icons.js';
// Workly's contextual record actions, limited to actions supported by Acurion.
export function installRecordMenu(container) {
  const menu = document.createElement('div'); menu.className = 'record-menu menu-surface'; menu.hidden = true; menu.setAttribute('role','menu'); menu.setAttribute('aria-label','Record actions'); document.body.append(menu);
  let previousFocus;
  const close = () => { menu.hidden = true; };
  container.addEventListener('contextmenu', event => {
    if (event.target.closest('input,textarea,select')) return;
    const record = event.target.closest('[data-customer],[data-id],.board-card'); if (!record) return;
    const action = record.querySelector('[data-select],[data-case-select]') || (record.matches('.board-card') ? record : record);
    const recordId = record.dataset.customer || record.dataset.id || record.dataset.caseSelect || record.dataset.alertId || record.textContent.trim().split(/\s/)[0];
    event.preventDefault(); previousFocus = document.activeElement;
    menu.innerHTML = `<div class="menu-label">${esc(recordId)}</div><button role="menuitem" id="record-open">${icon('reports')}Open record</button><button role="menuitem" id="record-copy">${icon('transactions')}Copy record ID</button>`;
    menu.hidden=false; menu.style.left=`${Math.min(event.clientX,innerWidth-224)}px`; menu.style.top=`${Math.min(event.clientY,innerHeight-130)}px`;
    menu.querySelector('#record-open').onclick = () => { close(); action.click(); };
    menu.querySelector('#record-copy').onclick = async () => { try { await navigator.clipboard.writeText(recordId); menu.querySelector('#record-copy').textContent='Copied'; } catch { menu.querySelector('#record-copy').textContent='Copy unavailable in this browser'; } };
    menu.querySelector('button').focus();
  });
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) close(); });
  document.addEventListener('keydown', event => { if (menu.hidden) return; if(event.key === 'Escape') { close(); previousFocus?.focus(); } if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); const items=[...menu.querySelectorAll('button')]; const index=items.indexOf(document.activeElement); items[(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus(); } });
  container.addEventListener('scroll',close,true);
}
