// Circuit lab: free building with the full tray, starter circuits, live diagram and electron flow.
import type { Dashboard, Part, QualityTier } from '../types';
import { mountBench, TRAY } from '../stations/benchCommon';

export interface LabHost { view: HTMLElement; side: HTMLElement; dashboard: Dashboard; quality: QualityTier }

export function mount(host: LabHost): { dispose(): void } {
  const rig = mountBench(host, {
    xray: true,
    tray: [
      TRAY.cell(), TRAY.pack6(), TRAY.pack12(), TRAY.wire(), TRAY.switch(), TRAY.globe(),
      TRAY.resistor(10), TRAY.resistor(22), TRAY.resistor(47), TRAY.resistor(100),
      TRAY.ammeter(), TRAY.voltmeter(),
    ],
  });
  const { bench } = rig;
  const P = (c: number, r: number) => bench.postId(c, r);
  const g6 = { kind: 'globe' as const, ratedV: 6, ratedW: 3 };
  const starters: Record<string, () => Part[]> = {
    'One globe': () => [
      { id: 'B', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 6 },
      { id: 'W1', kind: 'wire', a: P(2, 2), b: P(3, 2) },
      { id: 'W2', kind: 'wire', a: P(3, 2), b: P(3, 1) },
      { id: 'G', ...g6, a: P(3, 1), b: P(2, 1) },
      { id: 'S', kind: 'switch', a: P(2, 1), b: P(1, 1), closed: true },
      { id: 'W3', kind: 'wire', a: P(1, 1), b: P(1, 2) },
    ],
    'Series': () => [
      { id: 'B', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 12 },
      { id: 'W1', kind: 'wire', a: P(2, 2), b: P(3, 2) },
      { id: 'W2', kind: 'wire', a: P(3, 2), b: P(3, 1) },
      { id: 'G1', ...g6, a: P(3, 1), b: P(2, 1) },
      { id: 'G2', ...g6, a: P(2, 1), b: P(1, 1) },
      { id: 'W3', kind: 'wire', a: P(1, 1), b: P(1, 2) },
    ],
    'Parallel': () => [
      { id: 'B', kind: 'battery', a: P(1, 3), b: P(2, 3), emf: 6 },
      { id: 'W1', kind: 'wire', a: P(2, 3), b: P(3, 3) },
      { id: 'W7', kind: 'wire', a: P(3, 3), b: P(3, 2) },
      { id: 'W2', kind: 'wire', a: P(2, 2), b: P(3, 2) },
      { id: 'G1', ...g6, a: P(2, 2), b: P(2, 1) },
      { id: 'G2', ...g6, a: P(3, 2), b: P(3, 1) },
      { id: 'W3', kind: 'wire', a: P(2, 1), b: P(3, 1) },
      { id: 'W4', kind: 'wire', a: P(1, 1), b: P(2, 1) },
      { id: 'W5', kind: 'wire', a: P(1, 1), b: P(1, 2) },
      { id: 'W6', kind: 'wire', a: P(1, 2), b: P(1, 3) },
    ],
  };
  const load = (parts: Part[]) => { bench.select(null); if (bench.tripped) bench.resetBreaker(); bench.setParts(parts); bench.resetEnergy(); };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const dCard = el('div', 'lab-card lab-diagram');
  dCard.append(el('h3', '', 'Circuit diagram'), bench.diagram);
  const flowRow = el('div', 'lab-row');
  const flowBtn = el('button', '', 'Electron flow: on'); flowBtn.type = 'button';
  const syncFlow = () => { flowBtn.textContent = `Electron flow: ${bench.xray ? 'on' : 'off'}`; flowBtn.classList.toggle('is-on', bench.xray); flowBtn.setAttribute('aria-pressed', String(bench.xray)); const xb = host.view.querySelector('.lw-xray-btn'); xb?.setAttribute('aria-pressed', String(bench.xray)); };
  flowBtn.addEventListener('click', () => { bench.setXray(!bench.xray); syncFlow(); });
  const onViewClick = () => window.setTimeout(syncFlow, 0);
  host.view.addEventListener('click', onViewClick);
  flowRow.append(flowBtn);
  dCard.append(flowRow);
  const note = el('p', '', 'The dots are electrons. They move from the negative terminal, around the loop, to the positive terminal. Faster dots mean more current.');
  dCard.append(note);

  const sCard = el('div', 'lab-card');
  sCard.append(el('h3', '', 'Start from'));
  const row = el('div', 'lab-row');
  for (const name of Object.keys(starters)) { const b = el('button', '', name); b.type = 'button'; b.addEventListener('click', () => load(starters[name]())); row.append(b); }
  const clear = el('button', '', 'Empty board'); clear.type = 'button'; clear.addEventListener('click', () => load([]));
  row.append(clear);
  sCard.append(row);
  const tip = el('p', '', 'Pick a part in the tray, then tap a gap between two posts. Tap a part to change or remove it. Tap a part to see its readings at the top.');
  const keys = el('p', '', 'Move around: W A S D or the arrow keys. Turn: Q and E. Zoom: R and F, or scroll. Drag to orbit.');
  sCard.append(tip, keys);

  host.side.append(dCard, sCard);
  load(starters['One globe']());
  syncFlow();
  (window as unknown as { __lab?: unknown }).__lab = { bench, stage: rig.stage, load, starters };

  return {
    dispose() {
      host.view.removeEventListener('click', onViewClick);
      delete (window as unknown as { __lab?: unknown }).__lab;
      rig.dispose();
      host.side.replaceChildren();
    },
  };
}
