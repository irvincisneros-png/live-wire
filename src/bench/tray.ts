// DOM parts tray: one button per TrayItem (schematic icon + label + remaining count). Tap to arm, or drag onto the board.
import type { Part, TrayItem } from '../types';
import { symbolIcon } from './diagram';

export interface TrayHandlers {
  /** tap / Enter on an item (toggle arming). `viaKeyboard` is true for keyboard activation. */
  arm(key: string, viaKeyboard: boolean): void;
  /** drag events in client coords; `drop` returns true if the drop placed something */
  dragMove(key: string, x: number, y: number): void;
  drop(key: string, x: number, y: number): void;
  dragCancel(): void;
}

/** how many tray-matching parts are on the board (by kind and key values; falls back to kind) */
export function trayCounts(items: TrayItem[], parts: Part[]): Map<string, number> {
  const counts = new Map<string, number>(items.map((i) => [i.key, 0]));
  const keys: (keyof Part)[] = ['emf', 'ratedV', 'ratedW', 'resistance', 'mystery'];
  for (const p of parts) {
    const same = items.filter((i) => i.part.kind === p.kind);
    if (!same.length) continue;
    const exact = same.find((i) => keys.every((k) => (i.part as Partial<Part>)[k] === undefined || (i.part as Partial<Part>)[k] === p[k])) ?? same[0];
    counts.set(exact.key, (counts.get(exact.key) ?? 0) + 1);
  }
  return counts;
}

export function createTray(host: HTMLElement, h: TrayHandlers) {
  const el = document.createElement('div');
  el.className = 'lw-tray';
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'Parts tray');
  const inner = document.createElement('div');
  inner.className = 'lw-tray-inner';
  el.appendChild(inner);
  host.appendChild(el);
  let items: TrayItem[] = [];
  let armed: string | null = null;
  let disabled = false;
  const buttons = new Map<string, HTMLButtonElement>();
  let ghost: HTMLDivElement | null = null;

  const render = (counts: Map<string, number>) => {
    inner.replaceChildren(); buttons.clear();
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lw-tray-item';
      b.dataset.key = it.key;
      const left = it.max === undefined ? null : Math.max(0, it.max - (counts.get(it.key) ?? 0));
      const out = left === 0;
      b.disabled = disabled || out;
      b.setAttribute('aria-pressed', String(armed === it.key));
      b.setAttribute('aria-label', `${it.label}${left === null ? '' : `, ${left} left`}`);
      b.innerHTML = `<span class="lw-tray-icon">${symbolIcon(it.part.kind, { emf: it.part.emf, closed: it.part.closed })}</span><span class="lw-tray-label">${it.label}</span>${left === null ? '' : `<span class="lw-tray-count" aria-hidden="true">${left}</span>`}`;
      // pointer: short press = arm; drag beyond 8 px = drag onto the board
      b.addEventListener('pointerdown', (e) => {
        if (b.disabled) return;
        const sx = e.clientX, sy = e.clientY;
        let dragging = false;
        const move = (ev: PointerEvent) => {
          if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8 && Math.abs(ev.clientY - sy) > Math.abs(ev.clientX - sx) * 0.6) {
            dragging = true;
            ghost = document.createElement('div');
            ghost.className = 'lw-tray-ghost';
            ghost.innerHTML = symbolIcon(it.part.kind, { emf: it.part.emf });
            document.body.appendChild(ghost);
          }
          if (dragging && ghost) {
            ghost.style.transform = `translate(${ev.clientX - 30}px, ${ev.clientY - 46}px)`;
            h.dragMove(it.key, ev.clientX, ev.clientY);
          }
        };
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', cancel);
          ghost?.remove(); ghost = null;
          if (dragging) h.drop(it.key, ev.clientX, ev.clientY);
        };
        const cancel = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); ghost?.remove(); ghost = null; if (dragging) h.dragCancel(); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        b.addEventListener('click', function once(ce) { b.removeEventListener('click', once); if (dragging) { ce.preventDefault(); return; } h.arm(it.key, false); }, { once: true });
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.arm(it.key, true); } });
      inner.appendChild(b);
      buttons.set(it.key, b);
    }
    el.hidden = items.length === 0 || disabled;
  };

  return {
    el,
    setItems(next: TrayItem[], counts: Map<string, number>) { items = next; render(counts); },
    refresh(counts: Map<string, number>) { render(counts); },
    setArmed(key: string | null) { armed = key; for (const [k, b] of buttons) b.setAttribute('aria-pressed', String(k === key)); },
    setDisabled(d: boolean, counts: Map<string, number>) { disabled = d; render(counts); },
    focusItem(key: string) { buttons.get(key)?.focus(); },
    dispose() { ghost?.remove(); el.remove(); },
  };
}
