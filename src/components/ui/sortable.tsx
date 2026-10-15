"use client";

import * as React from "react";
import { flushSync } from "react-dom";

/** Spread onto the element people grab: a handle button, or the whole item. */
export type HandleProps = {
  "data-sortable-handle": string;
  "aria-label": string;
  "aria-describedby": string;
  "aria-pressed": boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onClick: (e: React.MouseEvent) => void;
};
export interface SortableProps<T> {
  items: T[];
  onItemsChange: (items: T[]) => void;
  itemKey: (item: T) => string | number;
  itemLabel: (item: T) => string;
  label: string;
  layout?: "list" | "row" | "grid";
  onReorder?: (items: T[]) => void;
  children: (item: T, handleProps: HandleProps, meta: { dragging: boolean; index: number }) => React.ReactNode;
  className?: string;
}
const ease = { standard: "cubic-bezier(0.22, 1, 0.36, 1)" };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let announceRegion: HTMLDivElement | undefined;
function announce(text: string, politeness: "polite" | "assertive" = "polite") {
  if (typeof document === "undefined") return;
  if (!announceRegion?.isConnected) {
    announceRegion = document.createElement("div");
    announceRegion.className = "sr-only";
    document.body.append(announceRegion);
  }
  // Live announcements inside a modal must remain inside its accessible subtree.
  const host=document.querySelector('dialog[open]') ?? document.body;
  if(announceRegion.parentElement!==host)host.append(announceRegion);
  announceRegion.setAttribute("aria-live", politeness);
  announceRegion.textContent = "";
  const region = announceRegion;
  setTimeout(() => { if (region) region.textContent = text; }, 50);
}
type Press = { id: string | number; x: number; y: number; timer?: ReturnType<typeof setTimeout>; el: HTMLElement; pointerId: number };
type Drag = { grabX: number; grabY: number; x: number; y: number; frame: number };

export default function SortableInner<T>({ items, onItemsChange, itemKey, itemLabel, label, layout = "list", onReorder, children, className }: SortableProps<T>) {
  const uid = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);
  const itemsRef = React.useRef(items); itemsRef.current = items;
  const [active, setActive] = React.useState<string | number | undefined>(undefined);
  const [mode, setMode] = React.useState<"pointer" | "keyboard" | undefined>(undefined);
  const activeRef = React.useRef(active); activeRef.current = active;
  const modeRef = React.useRef(mode); modeRef.current = mode;
  const beforeRef = React.useRef<T[]>([]);
  const pressRef = React.useRef<Press | undefined>(undefined);
  const dragRef = React.useRef<Drag | undefined>(undefined);
  const lastClickSuppressedRef = React.useRef(false);
  const detachRef = React.useRef<(() => void) | undefined>(undefined);
  const indexOf = (id: string | number) => itemsRef.current.findIndex(i => itemKey(i) === id);
  const nodeOf = (id: string | number) => listRef.current?.querySelector<HTMLElement>(`[data-sortable-key="${CSS.escape(String(id))}"]`) ?? null;
  const where = (i: number) => `position ${i + 1} of ${itemsRef.current.length}`;
  function moveTo(from: number, to: number) {
    const current = itemsRef.current;
    if (from < 0 || from === to || to < 0 || to >= current.length) return;
    const next = [...current]; next.splice(to, 0, ...next.splice(from, 1));
    itemsRef.current = next; onItemsChange(next);
  }
  function pickUp(id: string | number, how: "pointer" | "keyboard") {
    const i = indexOf(id); if (i < 0) return;
    beforeRef.current = [...itemsRef.current]; setActive(id); setMode(how);
    activeRef.current = id; modeRef.current = how;
    announce(how === "keyboard" ? `Picked up ${itemLabel(itemsRef.current[i])}, ${where(i)}. Arrow keys move it, Space drops it, Escape puts it back.` : `Picked up ${itemLabel(itemsRef.current[i])}.`, "assertive");
  }
  function drop() {
    if (activeRef.current === undefined) return;
    const i = indexOf(activeRef.current);
    if (i >= 0) announce(`Dropped ${itemLabel(itemsRef.current[i])} at ${where(i)}.`, "assertive");
    setActive(undefined); setMode(undefined); activeRef.current = undefined; modeRef.current = undefined;
    onReorder?.(itemsRef.current);
  }
  function cancel() {
    if (activeRef.current === undefined) return;
    const i = indexOf(activeRef.current), name = i >= 0 ? itemLabel(itemsRef.current[i]) : "Item";
    itemsRef.current = beforeRef.current; onItemsChange(beforeRef.current);
    setActive(undefined); setMode(undefined); activeRef.current = undefined; modeRef.current = undefined;
    announce(`${name} put back.`, "assertive");
  }
  function columns() {
    const nodes = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    return Math.max(1, nodes.filter(n => n.offsetTop === nodes[0]?.offsetTop).length);
  }
  function keys(e: React.KeyboardEvent, id: string | number) {
    const picked = activeRef.current === id && modeRef.current === "keyboard";
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (picked) flushSync(drop); else if (activeRef.current === undefined) flushSync(() => pickUp(id, "keyboard"));
      return;
    }
    if (!picked) return;
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation(); flushSync(cancel);
      nodeOf(id)?.querySelector<HTMLElement>("[data-sortable-handle]")?.focus(); return;
    }
    const list = listRef.current, rtl = list ? getComputedStyle(list).direction === "rtl" : false;
    const cols = layout === "grid" ? columns() : 1;
    const steps: Record<string, number> = { ArrowUp: layout === "row" ? 0 : -cols, ArrowDown: layout === "row" ? 0 : cols, ArrowLeft: layout === "list" ? 0 : rtl ? 1 : -1, ArrowRight: layout === "list" ? 0 : rtl ? -1 : 1, Home: -Infinity, End: Infinity };
    if (!(e.key in steps) || !steps[e.key]) return;
    e.preventDefault();
    const from = indexOf(id), to = Math.min(itemsRef.current.length - 1, Math.max(0, from + steps[e.key]));
    if (to === from) return;
    flushSync(() => moveTo(from, to));
    nodeOf(id)?.querySelector<HTMLElement>("[data-sortable-handle]")?.focus(); announce(where(to), "assertive");
  }
  const local = (e: PointerEvent) => {
    const list = listRef.current!, r = list.getBoundingClientRect();
    return { x: e.clientX - r.left + list.scrollLeft, y: e.clientY - r.top + list.scrollTop };
  };
  function down(e: React.PointerEvent, id: string | number) {
    if (e.button !== 0 || activeRef.current !== undefined) return;
    const el = e.currentTarget as HTMLElement, native = e.nativeEvent;
    lastClickSuppressedRef.current = false;
    pressRef.current = { id, x: native.clientX, y: native.clientY, el, pointerId: native.pointerId };
    if (native.pointerType === "touch" && el.hasAttribute("data-sortable-item")) {
      pressRef.current.timer = setTimeout(() => begin(native), 220);
      el.addEventListener("touchmove", hold, { passive: false });
    }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    detachRef.current=()=>{el.removeEventListener('touchmove',hold);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
  }
  function begin(e: PointerEvent) {
    const press = pressRef.current; if (!press) return;
    if (press.timer) clearTimeout(press.timer); press.timer = undefined;
    const node = nodeOf(press.id); if (!node) { release(); return; }
    try { press.el.setPointerCapture(e.pointerId); } catch { /* Capture is optional when the pointer has already gone. */ }
    const p = local(e);
    dragRef.current = { grabX: p.x - node.offsetLeft, grabY: p.y - node.offsetTop, x: p.x, y: p.y, frame: 0 };
    node.getAnimations().forEach(a => a.cancel());
    pickUp(press.id, "pointer");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8);
    follow();
  }
  function move(e: PointerEvent) {
    const press = pressRef.current; if (!press) return;
    if (!dragRef.current) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= (e.pointerType === "touch" ? 8 : 4)) return;
      if (press.timer) { release(); return; }
      begin(e);
    }
    const drag = dragRef.current; if (!drag) return;
    e.preventDefault(); const p = local(e); drag.x = p.x; drag.y = p.y; autoscroll(e);
    const node = nodeOf(press.id); if (!node) return;
    const cx = p.x - drag.grabX + node.offsetWidth / 2, cy = p.y - drag.grabY + node.offsetHeight / 2;
    let best = indexOf(press.id), dist = Infinity;
    Array.from(listRef.current?.children ?? []).forEach((child, i) => {
      const c = child as HTMLElement, d = Math.hypot(c.offsetLeft + c.offsetWidth / 2 - cx, c.offsetTop + c.offsetHeight / 2 - cy);
      if (d < dist) { dist = d; best = i; }
    });
    moveTo(indexOf(press.id), best);
  }
  function follow() {
    const drag = dragRef.current, press = pressRef.current; if (!drag || !press) return;
    const node = nodeOf(press.id);
    if (node) node.style.transform = `translate(${drag.x - drag.grabX - node.offsetLeft}px, ${drag.y - drag.grabY - node.offsetTop}px)${reduced() ? "" : " scale(1.03)"}`;
    drag.frame = requestAnimationFrame(follow);
  }
  function autoscroll(e: PointerEvent) {
    const list = listRef.current; if (!list) return;
    // The workspace map scrolls in its dialog. Prefer that container over the page.
    const scrollHost = list.closest<HTMLElement>('[data-sortable-scroll]') ?? list;
    const scrolls = scrollHost.scrollHeight > scrollHost.clientHeight || scrollHost.scrollWidth > scrollHost.clientWidth;
    const box = scrolls ? scrollHost.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
    const dy = e.clientY < box.top + 40 ? -8 : e.clientY > box.bottom - 40 ? 8 : 0;
    const dx = e.clientX < box.left + 40 ? -8 : e.clientX > box.right - 40 ? 8 : 0;
    if (!dx && !dy) return;
    if (scrolls) scrollHost.scrollBy(dx, dy); else scrollBy(dx, dy);
  }
  function up(e: PointerEvent) {
    const drag = dragRef.current, press = pressRef.current;
    if (drag && press) {
      cancelAnimationFrame(drag.frame); const node = nodeOf(press.id); lastClickSuppressedRef.current = true;
      if (e.type === "pointercancel") cancel(); else drop();
      if (node) {
        const from = node.style.transform; node.style.transform = "";
        if (from && !reduced()) node.animate([{ transform: from }, { transform: "none" }], { duration: 220, easing: ease.standard });
      }
    }
    release();
  }
  const hold = (e: TouchEvent) => { if (dragRef.current) e.preventDefault(); };
  function release() {
    const press = pressRef.current; if (press?.timer) clearTimeout(press.timer);
    if (press) {
      try { if (press.el.hasPointerCapture(press.pointerId)) press.el.releasePointerCapture(press.pointerId); } catch { /* Element may have unmounted. */ }
    }
    if (dragRef.current) cancelAnimationFrame(dragRef.current.frame);
    pressRef.current = undefined; dragRef.current = undefined;
    detachRef.current?.();detachRef.current=undefined;
  }
  // Escape also cancels a pointer drag. Cancel on window blur so a lost release cannot stick.
  React.useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || activeRef.current === undefined) return;
      event.preventDefault();
      const id = activeRef.current;
      nodeOf(id)?.style.removeProperty('transform'); cancel(); release();
      nodeOf(id)?.querySelector<HTMLElement>('[data-sortable-handle]')?.focus();
    };
    const blur = () => { if (modeRef.current === 'pointer') { if (activeRef.current !== undefined) nodeOf(activeRef.current)?.style.removeProperty('transform'); cancel(); release(); } };
    window.addEventListener('keydown', escape); window.addEventListener('blur', blur);
    return () => { release(); window.removeEventListener('keydown', escape); window.removeEventListener('blur', blur); };
  }, []);
  const handleFor = (item: T): HandleProps => {
    const id = itemKey(item);
    return { "data-sortable-handle": "", "aria-label": `Move ${itemLabel(item)}`, "aria-describedby": `${uid}-how`, "aria-pressed": active === id && mode === "keyboard", onPointerDown: e => down(e, id), onKeyDown: e => keys(e, id), onClick: e => {
      if (lastClickSuppressedRef.current) { e.preventDefault(); e.stopPropagation(); lastClickSuppressedRef.current = false; }
    } };
  };
  React.useEffect(() => {
    const el = listRef.current; if (!el) return;
    const update = () => {
      const horizontal = el.dataset.fade === 'x', max = horizontal ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
      const before = horizontal ? getComputedStyle(el).direction === 'rtl' ? max + el.scrollLeft : el.scrollLeft : el.scrollTop;
      el.style.setProperty('--scroll-start', `${Math.min(1, Math.max(0, before / 24))}`);
      el.style.setProperty('--scroll-end', `${Math.min(1, Math.max(0, (max - before) / 24))}`);
    };
    update(); el.addEventListener('scroll', update, { passive: true });
    const resized = new ResizeObserver(update); resized.observe(el);
    for (const child of Array.from(el.children)) resized.observe(child);
    const changed = new MutationObserver(update); changed.observe(el, { childList: true });
    return () => { el.removeEventListener('scroll', update); resized.disconnect(); changed.disconnect(); };
  }, []);
  const rectsRef = React.useRef<Map<string, DOMRect>>(new Map());
  React.useLayoutEffect(() => {
    const nodes = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    const nextRects = new Map<string, DOMRect>();
    nodes.forEach(node => {
      const id = node.getAttribute('data-sortable-key'); if (id === null) return;
      // Offset coordinates avoid compounding the previous in-flight FLIP animation.
      const rect = new DOMRect(node.offsetLeft, node.offsetTop, node.offsetWidth, node.offsetHeight), prev = rectsRef.current.get(id);
      if (prev && !(String(active) === id && mode === 'pointer')) {
        const dx = prev.left - rect.left, dy = prev.top - rect.top;
        if ((dx || dy) && !reduced()) {
          node.getAnimations().forEach(a => a.cancel());
          node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 200, easing: ease.standard });
        }
      }
      nextRects.set(id, rect);
    });
    rectsRef.current = nextRects;
  }, [items, active, mode]);
  return <>
    <ul ref={listRef} data-fade={layout === 'row' ? 'x' : undefined} className={['sortable', layout, active !== undefined && 'moving', className].filter(Boolean).join(' ')} aria-label={label}>
      {items.map((item, index) => { const id = itemKey(item); return <li key={id} data-sortable-key={id} className={['item', active === id && 'active', active === id && mode === 'pointer' && 'lifted'].filter(Boolean).join(' ')}>{children(item, handleFor(item), { dragging: active === id, index })}</li>; })}
    </ul>
    <p id={`${uid}-how`} className="sr-only">Press Space to pick up, arrow keys to move, Space again to drop, Escape to cancel.</p>
  </>;
}
