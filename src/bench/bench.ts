// The interactive circuit bench: model, input (pointer, keyboard, parts list), solver wiring, sim clock, x-ray, diagram.
import './bench.css';
import * as THREE from 'three';
import type { Bench, BenchOptions, Part, PartKind, Solution, Stage, TrayItem } from '../types';
import type { KitStage } from '../kit/stage';
import { solve, meterReading } from '../sim/circuit';
import { adjacent, edgeKey, nearestEdge, nearestPost, postId as gridPostId, postName, stepEdge, stepPost, validPost, type Dir, type Edge, type GridSize } from './grid';
import { SimClock, effectiveParts } from './simclock';
import { createBenchView } from './benchView';
import { createFlow } from './flow';
import { createDiagram } from './diagram';
import { createTray, trayCounts } from './tray';
import { formatOhms } from '../kit/parts/resistor';

const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82, 100];
const KIND_NAME: Record<PartKind, string> = { battery: 'Battery', wire: 'Wire', switch: 'Switch', globe: 'Globe', resistor: 'Resistor', ammeter: 'Ammeter', voltmeter: 'Voltmeter' };

const fmtA = (a: number) => `${Math.abs(a) < 0.0005 ? '0.00' : Math.abs(a) < 10 ? Math.abs(a).toFixed(2) : Math.abs(a).toFixed(0)} amps`;
const fmtV = (v: number) => `${Math.abs(v) < 0.005 ? '0.0' : Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)} volts`;

function asKit(stage: Stage): KitStage {
  const k = stage as Partial<KitStage>;
  // tolerate a plain Stage: add no-op extras
  return Object.assign(stage, {
    setHome: k.setHome ?? (() => {}),
    onResize: k.onResize ?? (() => () => {}),
    setPanBounds: k.setPanBounds ?? (() => {}),
    toScreen: k.toScreen ?? ((p: THREE.Vector3) => { const v = p.clone().project(stage.camera); return { x: (v.x * 0.5 + 0.5) * stage.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * stage.canvas.clientHeight, visible: v.z < 1 }; }),
  }) as KitStage;
}

export function createBench(stageIn: Stage, uiHost: HTMLElement, opts: BenchOptions): Bench {
  const stage = asKit(stageIn);
  const grid: GridSize = { cols: opts.cols ?? 5, rows: opts.rows ?? 4 };
  const quality = stage.quality;
  let tray: TrayItem[] = opts.tray ?? [];
  let readOnly = !!opts.readOnly;
  let xray = !!opts.xray;
  let parts: Part[] = [];
  let solution: Solution = solve({ parts: [] });
  let selectedId: string | null = null;
  let idSeq = 0;
  const clock = new SimClock();
  const changeCbs = new Set<(b: Bench) => void>();
  const eventCbs = new Set<(e: { type: 'blown' | 'tripped' | 'reset'; partId?: string }) => void>();
  const selectCbs = new Set<(id: string | null) => void>();
  const adjustable = opts.adjustableSupply ?? null;

  // ── 3D ──
  const view = createBenchView(stage, grid, quality);
  view.setAdjustable(adjustable?.partId ?? null);
  const flow = createFlow(view.root, stage.renderer, stage.camera, quality);
  const diagram = createDiagram(grid);

  // ── DOM ──
  if (getComputedStyle(uiHost).position === 'static') uiHost.style.position = 'relative';
  const ui = document.createElement('div');
  ui.className = 'lw-bench';
  uiHost.appendChild(ui);
  const chips = document.createElement('div'); chips.className = 'lw-chips'; ui.appendChild(chips);
  const live = document.createElement('div'); live.className = 'lw-sr'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status'); ui.appendChild(live);
  const pop = document.createElement('div'); pop.className = 'lw-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Part actions'); ui.appendChild(pop);
  const listWrap = document.createElement('details'); listWrap.className = 'lw-partslist';
  listWrap.innerHTML = '<summary>Parts list</summary><ul></ul>';
  ui.appendChild(listWrap);
  const listUl = listWrap.querySelector('ul')!;
  const viewBtn = document.createElement('button');
  viewBtn.type = 'button'; viewBtn.className = 'lw-viewbtn'; viewBtn.setAttribute('aria-label', 'Front view'); viewBtn.title = 'Front view';
  viewBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
  viewBtn.addEventListener('click', () => stage.resetView());
  ui.appendChild(viewBtn);
  const canvas = stage.canvas;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Circuit board. Use the arrow keys to move between gaps, Enter to place or select, Delete to remove, Space to flip a switch, Escape to cancel.');

  let announceTimer = 0;
  const announce = (msg: string) => { live.textContent = ''; clearTimeout(announceTimer); announceTimer = window.setTimeout(() => { live.textContent = msg; }, 30); };

  // ── model helpers ──
  const byId = (id: string) => parts.find((p) => p.id === id) ?? null;
  const nameOf = (p: Part): string => {
    const same = parts.filter((q) => q.kind === p.kind);
    return same.length > 1 ? `${KIND_NAME[p.kind]} ${same.indexOf(p) + 1}` : KIND_NAME[p.kind];
  };
  const between = (p: Part) => `between posts ${postName(grid, p.a)} and ${postName(grid, p.b)}`;
  const partOnEdge = (key: string) => parts.find((p) => p.kind !== 'voltmeter' && edgeKey(p.a, p.b) === key) ?? null;
  const counts = () => trayCounts(tray, parts);

  function stateLine(p: Part): string {
    if (solution.status !== 'ok') return '';
    const r = solution.parts[p.id];
    if (!r) return '';
    switch (p.kind) {
      case 'globe': {
        if (p.blown) return `${nameOf(p)} has blown.`;
        const b = r.power / (p.ratedW ?? 3);
        return `${nameOf(p)} is ${b > 0.6 ? 'lit' : b > 0.05 ? 'glowing dimly' : 'off'}, ${fmtA(r.current)}.`;
      }
      case 'battery': return clock.tripped ? 'The supply protector has tripped.' : solution.shorted.includes(p.id) ? 'Short circuit. The battery is heating up.' : `${nameOf(p)} gives ${fmtA(r.current)}.`;
      case 'switch': return `${nameOf(p)} is ${p.closed ? 'closed' : 'open'}.`;
      case 'resistor': return `${nameOf(p)}: ${fmtA(r.current)}.`;
      case 'ammeter': return `Ammeter reads ${fmtA(meterReading(p, solution))}.`;
      case 'voltmeter': return `Voltmeter reads ${fmtV(meterReading(p, solution))}.`;
      default: return '';
    }
  }

  // ── solving and change notification ──
  function resolve(): void {
    solution = solve({ parts: effectiveParts(parts, clock.tripped) });
    if (clock.tripped) {
      // the short has been removed: the protector resets itself
      const real = solve({ parts });
      if (real.shorted.length === 0) { clock.resetBreaker(); solution = real; emitEvent({ type: 'reset' }); }
    }
  }
  let structural = true;
  function changed(opts2: { structural?: boolean } = {}): void {
    if (opts2.structural !== false) structural = true;
    resolve();
    const rebuilt = view.sync(parts);
    if (structural || rebuilt) { flow.setSources(view.flowSources(parts)); structural = false; }
    diagram.update(parts, adjustable?.partId ?? null);
    diagram.setFlow(xray ? parts : null, solution);
    trayUi.refresh(counts());
    renderChips();
    renderList();
    if (selectedId && !byId(selectedId)) setSelected(null);
    else if (selectedId) renderPopover();
    for (const cb of [...changeCbs]) cb(bench);
  }
  function emitEvent(e: { type: 'blown' | 'tripped' | 'reset'; partId?: string }): void {
    for (const cb of [...eventCbs]) cb(e);
  }

  // ── chips (warnings) ──
  function renderChips(): void {
    chips.replaceChildren();
    const chip = (cls: string, html: string) => { const c = document.createElement('div'); c.className = `lw-chip ${cls}`; c.innerHTML = html; chips.appendChild(c); return c; };
    if (solution.status !== 'ok') chip('lw-chip-warn', "<b>Can't read this circuit</b>");
    if (clock.tripped) {
      const c = chip('lw-chip-trip', '<span class="lw-chip-flag" aria-hidden="true"></span><span><b>Supply protector tripped.</b> The supply is off.</span>');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lw-btn lw-btn-small'; b.textContent = 'Reset';
      b.addEventListener('click', () => bench.resetBreaker());
      c.appendChild(b);
    } else if (solution.shorted.length) {
      chip('lw-chip-short', '<b>Short circuit:</b> almost no resistance, huge current');
    }
  }

  // ── selection & popover ──
  function setSelected(id: string | null): void {
    if (id === selectedId) { renderPopover(); return; }
    selectedId = id;
    renderPopover();
    for (const cb of [...selectCbs]) cb(id);
  }
  function actionsFor(p: Part): { label: string; run: () => void; cls?: string }[] {
    const a: { label: string; run: () => void; cls?: string }[] = [];
    if (p.locked) return a;
    if (p.kind === 'switch') a.push({ label: p.closed ? 'Open switch' : 'Close switch', run: () => toggleSwitch(p.id) });
    if (p.kind === 'battery') a.push({ label: 'Flip battery', run: () => { bench.editPart(p.id, { a: p.b, b: p.a }); announce(`${nameOf(p)} flipped. Negative end now at ${postName(grid, p.b)}.`); } });
    if (p.kind === 'globe' && p.blown) a.push({ label: 'Replace globe', run: () => { bench.editPart(p.id, { blown: false }); announce(`${nameOf(p)} replaced.`); } });
    if (!readOnly) a.push({ label: 'Remove', run: () => removeWithAnnounce(p.id), cls: 'lw-btn-danger' });
    return a;
  }
  function renderPopover(): void {
    const p = selectedId ? byId(selectedId) : null;
    if (!p) { pop.hidden = true; pop.replaceChildren(); return; }
    pop.hidden = false;
    pop.replaceChildren();
    const h = document.createElement('div'); h.className = 'lw-pop-title';
    h.textContent = `${nameOf(p)}${p.label ? ` (${p.label})` : ''}`;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'lw-pop-close'; close.setAttribute('aria-label', 'Close'); close.textContent = '×';
    close.addEventListener('click', () => setSelected(null));
    h.appendChild(close);
    pop.appendChild(h);
    const info = document.createElement('div'); info.className = 'lw-pop-info';
    info.textContent = `Between posts ${postName(grid, p.a)} and ${postName(grid, p.b)}. ${stateLine(p)}`.trim();
    pop.appendChild(info);
    if (p.locked) { const l = document.createElement('div'); l.className = 'lw-pop-note'; l.textContent = 'This part is locked.'; pop.appendChild(l); }
    // value controls
    if (!p.locked && p.kind === 'resistor' && !p.mystery) {
      const row = document.createElement('div'); row.className = 'lw-stepper';
      const cur = p.resistance ?? 10;
      const idx = E12.reduce((bi, v, i) => (Math.abs(v - cur) < Math.abs(E12[bi] - cur) ? i : bi), 0);
      const dn = document.createElement('button'); dn.type = 'button'; dn.className = 'lw-btn'; dn.textContent = '−'; dn.setAttribute('aria-label', 'Less resistance');
      const val = document.createElement('output'); val.className = 'q-resistance lw-stepper-val'; val.textContent = `R = ${formatOhms(cur)}`;
      const up = document.createElement('button'); up.type = 'button'; up.className = 'lw-btn'; up.textContent = '+'; up.setAttribute('aria-label', 'More resistance');
      dn.disabled = idx <= 0; up.disabled = idx >= E12.length - 1;
      dn.addEventListener('click', () => { bench.editPart(p.id, { resistance: E12[Math.max(0, idx - 1)] }); announce(`Resistance ${formatOhms(E12[Math.max(0, idx - 1)])}.`); });
      up.addEventListener('click', () => { bench.editPart(p.id, { resistance: E12[Math.min(E12.length - 1, idx + 1)] }); announce(`Resistance ${formatOhms(E12[Math.min(E12.length - 1, idx + 1)])}.`); });
      row.append(dn, val, up);
      pop.appendChild(row);
    }
    if (!p.locked && p.kind === 'battery' && adjustable && p.id === adjustable.partId) {
      const row = document.createElement('label'); row.className = 'lw-slider';
      const r = document.createElement('input'); r.type = 'range'; r.min = String(adjustable.min); r.max = String(adjustable.max); r.step = String(adjustable.step); r.value = String(p.emf ?? 0);
      const out = document.createElement('output'); out.className = 'q-voltage'; out.textContent = `V = ${(p.emf ?? 0).toFixed(1)} V`;
      r.setAttribute('aria-label', 'Supply voltage');
      r.addEventListener('input', () => { bench.editPart(p.id, { emf: Number(r.value) }); out.textContent = `V = ${Number(r.value).toFixed(1)} V`; });
      row.append(out, r);
      pop.appendChild(row);
    }
    const acts = actionsFor(p);
    if (acts.length) {
      const row = document.createElement('div'); row.className = 'lw-pop-actions';
      for (const a of acts) { const b = document.createElement('button'); b.type = 'button'; b.className = `lw-btn ${a.cls ?? ''}`; b.textContent = a.label; b.addEventListener('click', a.run); row.appendChild(b); }
      pop.appendChild(row);
    }
    placePopover();
  }
  const box = new THREE.Box3();
  function placePopover(): void {
    if (pop.hidden || !selectedId) return;
    const obj = view.object(selectedId);
    if (!obj) return;
    box.setFromObject(obj);
    const hostR = uiHost.getBoundingClientRect(), canR = canvas.getBoundingClientRect();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const s = stage.toScreen(new THREE.Vector3(x, y, z));
      x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
    }
    const ox = canR.left - hostR.left, oy = canR.top - hostR.top;
    x0 += ox; x1 += ox; y0 += oy; y1 += oy;
    const W = hostR.width, H = hostR.height, pw = pop.offsetWidth, ph = pop.offsetHeight, m = 10;
    const trayH = trayUi.el.hidden ? 0 : trayUi.el.offsetHeight + 8;
    let left = (x0 + x1) / 2 - pw / 2, top: number;
    if (y0 - ph - m > 56) top = y0 - ph - m; // above the part
    else if (y1 + m + ph < H - trayH) top = y1 + m; // below
    else { top = Math.max(56, Math.min(H - trayH - ph - m, (y0 + y1) / 2 - ph / 2)); left = x1 + m + pw < W ? x1 + m : x0 - m - pw; } // beside
    left = Math.max(m, Math.min(W - pw - m, left));
    top = Math.max(m, Math.min(H - ph - m, top));
    pop.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  // ── parts list ──
  function renderList(): void {
    listUl.replaceChildren();
    (listWrap.querySelector('summary') as HTMLElement).textContent = `Parts list (${parts.length})`;
    if (!parts.length) { const li = document.createElement('li'); li.className = 'lw-pl-empty'; li.textContent = 'No parts on the board yet.'; listUl.appendChild(li); return; }
    for (const p of parts) {
      const li = document.createElement('li');
      if (p.id === selectedId) li.classList.add('is-selected');
      const t = document.createElement('div'); t.className = 'lw-pl-text';
      t.innerHTML = `<b>${nameOf(p)}</b> <span>${postName(grid, p.a)}–${postName(grid, p.b)}</span><br><small>${stateLine(p) || (p.kind === 'wire' ? 'Wire.' : '')}</small>`;
      li.appendChild(t);
      const btns = document.createElement('div'); btns.className = 'lw-pl-btns';
      const add = (label: string, fn: () => void, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = `lw-btn lw-btn-small ${cls}`; b.textContent = label; b.addEventListener('click', fn); btns.appendChild(b); };
      add('Select', () => setSelected(p.id));
      for (const a of actionsFor(p)) add(a.label, a.run, a.cls);
      li.appendChild(btns);
      listUl.appendChild(li);
    }
  }

  // ── actions ──
  function newId(kind: PartKind): string { let id: string; do { id = `${kind}-${++idSeq}`; } while (byId(id)); return id; }
  function place(item: TrayItem, a: number, b: number): Part | null {
    if (readOnly) return null;
    const left = item.max === undefined ? Infinity : item.max - (counts().get(item.key) ?? 0);
    if (left <= 0) { announce(`No ${item.label.toLowerCase()} left in the tray.`); return null; }
    if (item.part.kind !== 'voltmeter' && partOnEdge(edgeKey(a, b))) { announce('That gap already has a part.'); return null; }
    const p: Part = { ...item.part, id: newId(item.part.kind), a, b } as Part;
    parts = [...parts, p];
    changed();
    const msg = `${KIND_NAME[p.kind]} placed ${between(p)}.`;
    announce(`${msg} ${stateLine(p)}`.trim());
    if (item.max !== undefined && (counts().get(item.key) ?? 0) >= item.max) disarm();
    return p;
  }
  function removeWithAnnounce(id: string): void {
    const p = byId(id);
    if (!p || p.locked || readOnly) return;
    const name = nameOf(p);
    bench.removePart(id);
    announce(`${name} removed.`);
  }
  function toggleSwitch(id: string): void {
    const p = byId(id);
    if (!p || p.kind !== 'switch' || p.locked) return;
    bench.editPart(id, { closed: !p.closed });
    const q = byId(id)!;
    announce(`${stateLine(q)} ${parts.filter((x) => x.kind === 'globe').map(stateLine).join(' ')}`.trim());
  }

  // ── arming & markers ──
  let armed: TrayItem | null = null;
  let firstPost: number | null = null;
  let hoverEdge: string | null = null, hoverPost: number | null = null;
  let cursor: Edge | null = null, postCursor: number | null = null, showCursor = false;
  const validEdges = () => new Set(view.edges.filter((e) => !partOnEdge(e.key)).map((e) => e.key));
  function refreshMarkers(): void {
    const volt = armed?.part.kind === 'voltmeter';
    view.setMarkers({
      valid: armed && !volt ? validEdges() : null,
      hover: armed && !volt ? hoverEdge : null,
      cursor: showCursor && !volt && cursor ? cursor.key : null,
      posts: volt ? new Set(Array.from({ length: grid.cols * grid.rows }, (_, i) => i).filter((i) => i !== firstPost)) : null,
      postHover: volt ? hoverPost : null,
      postCursor: showCursor && volt ? postCursor : null,
      postChosen: volt ? firstPost : null,
    });
  }
  function arm(key: string | null): void {
    const item = key ? tray.find((t) => t.key === key) ?? null : null;
    armed = armed && item && armed.key === item.key ? null : item;
    firstPost = null;
    trayUi.setArmed(armed?.key ?? null);
    if (armed) { setSelected(null); announce(armed.part.kind === 'voltmeter' ? `${armed.label} ready. Choose the first post, then the second post.` : `${armed.label} ready. Choose a gap between two posts.`); }
    refreshMarkers();
  }
  function disarm(): void { if (armed) { armed = null; firstPost = null; trayUi.setArmed(null); refreshMarkers(); } }

  const trayUi = createTray(ui, {
    arm: (key, kb) => {
      arm(key);
      if (kb && armed) { showCursor = true; cursor ??= view.edges[0]; postCursor ??= 0; refreshMarkers(); canvas.focus(); }
    },
    dragMove: (key, x, y) => {
      if (armed?.key !== key) { armed = tray.find((t) => t.key === key) ?? null; trayUi.setArmed(armed?.key ?? null); firstPost = null; }
      hover(x, y);
    },
    drop: (key, x, y) => {
      const item = tray.find((t) => t.key === key);
      if (!item) return;
      const r = canvas.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) { disarm(); return; }
      if (item.part.kind === 'voltmeter') { tapPostFor(item, x, y); return; }
      const e = edgeUnder(x, y);
      if (e && !partOnEdge(e.key)) { place(item, e.a, e.b); disarm(); } else disarm();
      hoverEdge = null; refreshMarkers();
    },
    dragCancel: () => { disarm(); },
  });
  trayUi.setItems(tray, counts());
  trayUi.setDisabled(readOnly, counts());

  function edgeUnder(x: number, y: number): Edge | null {
    const p = stage.pointOnPlane(x, y, 0.08);
    return p ? nearestEdge(grid, view.edges, p.x, p.z, 0.42) : null;
  }
  function postUnder(x: number, y: number): number | null {
    const p = stage.pointOnPlane(x, y, 0.15);
    return p ? nearestPost(grid, p.x, p.z, 0.38) : null;
  }
  function hover(x: number, y: number): void {
    if (!armed) return;
    if (armed.part.kind === 'voltmeter') hoverPost = postUnder(x, y);
    else { const e = edgeUnder(x, y); hoverEdge = e && !partOnEdge(e.key) ? e.key : null; }
    refreshMarkers();
  }
  function tapPostFor(item: TrayItem, x: number, y: number): void {
    const id = postUnder(x, y);
    if (id === null) return;
    choosePost(item, id);
  }
  function choosePost(item: TrayItem, id: number): void {
    if (firstPost === null) { firstPost = id; announce(`First lead on post ${postName(grid, id)}. Now choose the second post.`); refreshMarkers(); return; }
    if (id === firstPost) { firstPost = null; announce('Lead lifted. Choose the first post.'); refreshMarkers(); return; }
    const a = firstPost; firstPost = null;
    place(item, a, id);
    disarm();
  }

  // ── canvas pointer input ──
  let downAt: { x: number; y: number; id: number } | null = null;
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY, id: e.pointerId }; showCursor = false; refreshMarkers(); };
  const onMove = (e: PointerEvent) => { if (e.pointerType === 'mouse' && armed) hover(e.clientX, e.clientY); };
  const onUp = (e: PointerEvent) => {
    if (!downAt || downAt.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (stage.orbiting || moved > 8 || e.button > 0) return;
    tap(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);

  function tap(x: number, y: number): void {
    if (armed?.part.kind === 'voltmeter') { tapPostFor(armed, x, y); return; }
    const hit = view.pickPart(x, y);
    if (armed) {
      const e = edgeUnder(x, y);
      if (e && !partOnEdge(e.key)) { place(armed, e.a, e.b); hoverEdge = null; refreshMarkers(); return; }
      if (hit) { disarm(); setSelected(hit); return; }
      if (e) { announce('That gap already has a part.'); return; }
      return;
    }
    let id = hit;
    if (!id) { const e = edgeUnder(x, y); id = e ? partOnEdge(e.key)?.id ?? null : null; }
    if (!id) { setSelected(null); return; }
    const p = byId(id)!;
    if (p.kind === 'switch' && !p.locked) { toggleSwitch(id); setSelected(id); return; }
    setSelected(id);
    announce(`${nameOf(p)} selected, ${between(p)}. ${stateLine(p)}`.trim());
  }

  // ── keyboard ──
  const onKey = (e: KeyboardEvent) => {
    const dirs: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const volt = armed?.part.kind === 'voltmeter';
    if (dirs[e.key]) {
      // mouse and touch users steer the camera with the arrow keys; the edge cursor is for keyboard-only building (focus arrived by Tab)
      if (!canvas.matches(':focus-visible')) return;
      e.preventDefault();
      showCursor = true;
      if (volt) { postCursor = postCursor === null ? 0 : stepPost(grid, postCursor, dirs[e.key]); announce(`Post ${postName(grid, postCursor)}.`); }
      else {
        cursor = cursor ? stepEdge(grid, view.edges, cursor, dirs[e.key]) : view.edges[0];
        const p = partOnEdge(cursor.key);
        announce(`Gap ${postName(grid, cursor.a)} to ${postName(grid, cursor.b)}${p ? `: ${nameOf(p)}` : ', empty'}.`);
      }
      refreshMarkers();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (volt && armed) { choosePost(armed, postCursor ?? 0); return; }
      if (!cursor) { cursor = view.edges[0]; showCursor = true; refreshMarkers(); return; }
      const p = partOnEdge(cursor.key);
      if (armed && !p) { place(armed, cursor.a, cursor.b); refreshMarkers(); return; }
      if (p) { setSelected(p.id); announce(`${nameOf(p)} selected. ${stateLine(p)}`.trim()); }
      return;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
      const p = (cursor && partOnEdge(cursor.key)) || (selectedId ? byId(selectedId) : null);
      if (p?.kind === 'switch') { e.preventDefault(); toggleSwitch(p.id); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const p = (selectedId ? byId(selectedId) : null) || (cursor && partOnEdge(cursor.key));
      if (p) { e.preventDefault(); removeWithAnnounce(p.id); }
      return;
    }
    if (e.key === 'Escape') {
      if (armed) { disarm(); announce('Cancelled.'); } else if (selectedId) setSelected(null);
      showCursor = false; refreshMarkers();
    }
  };
  canvas.addEventListener('keydown', onKey);
  const onBlur = () => { showCursor = false; refreshMarkers(); };
  canvas.addEventListener('blur', onBlur);

  // ── sim loop ──
  const heatOf = (id: string) => (solution.shorted.includes(id) ? 0.25 + 0.75 * clock.shortProgress : 0);
  const hooks = {
    solution: () => solution,
    parts: () => parts,
    onBlow: (id: string) => {
      const p = byId(id);
      if (!p || p.blown) return;
      parts = parts.map((q) => (q.id === id ? { ...q, blown: true } : q));
      changed({ structural: false });
      emitEvent({ type: 'blown', partId: id });
      announce(`${nameOf(byId(id)!)} blew. Too much power for this globe. Select it to replace it.`);
    },
    onTrip: () => {
      changed({ structural: false });
      emitEvent({ type: 'tripped' });
      announce('Short circuit. The supply protector tripped and turned the supply off. Remove the short, then press Reset.');
    },
  };
  let tripShown = false;
  const offFrame = stage.onFrame((dt, t) => {
    clock.tick(dt, hooks);
    if (tripShown !== clock.tripped) { tripShown = clock.tripped; view.set.protector.setTripped(clock.tripped); }
    view.frame(dt, t, parts, solution, heatOf, clock.tripped);
    flow.update(dt, solution, parts, xray);
    placePopover();
  });

  // ── public API ──
  const sanitize = (list: Part[]): Part[] => {
    const seen = new Set<string>();
    return list.filter((p) => validPost(grid, p.a) && validPost(grid, p.b) && (p.kind === 'voltmeter' ? p.a !== p.b : adjacent(grid, p.a, p.b))).map((p) => {
      let id = p.id || newId(p.kind);
      while (seen.has(id)) id = newId(p.kind);
      seen.add(id);
      return { ...p, id };
    });
  };
  const bench: Bench = {
    getParts: () => parts,
    setParts(list) {
      parts = sanitize(list);
      changed();
    },
    editPart(id, patch) {
      const p = byId(id);
      if (!p) return;
      const next = { ...p, ...patch, id: p.id };
      if (patch.a !== undefined || patch.b !== undefined) {
        if (!(next.kind === 'voltmeter' ? next.a !== next.b && validPost(grid, next.a) && validPost(grid, next.b) : adjacent(grid, next.a, next.b))) return;
      }
      parts = parts.map((q) => (q.id === id ? next : q));
      const geo = patch.a !== undefined || patch.b !== undefined || patch.kind !== undefined || patch.emf !== undefined || patch.resistance !== undefined;
      changed({ structural: geo });
    },
    removePart(id) {
      if (!byId(id)) return;
      parts = parts.filter((p) => p.id !== id);
      clock.forget(id);
      changed();
    },
    get solution() { return solution; },
    onChange(cb) { changeCbs.add(cb); return () => changeCbs.delete(cb); },
    onEvent(cb) { eventCbs.add(cb); return () => eventCbs.delete(cb); },
    get selectedId() { return selectedId; },
    select(id) { setSelected(id && byId(id) ? id : null); },
    onSelect(cb) { selectCbs.add(cb); return () => selectCbs.delete(cb); },
    setXray(on) { xray = on; view.setXray(on); diagram.setFlow(on ? parts : null, solution); },
    get xray() { return xray; },
    setTray(items) { tray = items; if (armed && !items.some((i) => i.key === armed!.key)) disarm(); trayUi.setItems(tray, counts()); trayUi.setDisabled(readOnly, counts()); },
    setReadOnly(r) { readOnly = r; if (r) disarm(); trayUi.setDisabled(r, counts()); renderList(); renderPopover(); },
    highlight(partIds, postIds) { view.highlight(partIds, postIds ?? []); },
    get tripped() { return clock.tripped; },
    resetBreaker() {
      if (!clock.tripped) return;
      clock.resetBreaker();
      changed({ structural: false });
      emitEvent({ type: 'reset' });
      announce(solution.shorted.length ? 'Protector reset, but the short is still there.' : 'Protector reset. The supply is on.');
    },
    energyOf: (id) => clock.energyOf(id),
    resetEnergy: () => clock.resetEnergy(),
    diagram: diagram.svg,
    postId: (col, row) => gridPostId(grid, col, row),
    postPosition: (id) => view.postPosition(id),
    partPosition: (id) => view.partPosition(id),
    dispose() {
      offFrame();
      clearTimeout(announceTimer);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('blur', onBlur);
      canvas.removeAttribute('role'); canvas.removeAttribute('aria-label');
      changeCbs.clear(); eventCbs.clear(); selectCbs.clear();
      trayUi.dispose();
      flow.dispose();
      view.dispose();
      ui.remove();
      diagram.svg.remove();
    },
  };
  if (xray) view.setXray(true);
  // the adjustable supply never starts outside its range
  parts = sanitize((opts.initial ?? []).map((p) => (adjustable && p.id === adjustable.partId && p.emf !== undefined ? { ...p, emf: Math.min(adjustable.max, Math.max(adjustable.min, p.emf)) } : p)));
  changed();
  return bench;
}
