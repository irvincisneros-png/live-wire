// Standalone bench test page: http://localhost:8530/dev-bench.html#lit (routes: lit, xray, parallel, ohm, short, empty; ?q=low|medium|high)
import type { Part, QualityTier, TrayItem } from './types';
import { createStage } from './kit/stage';
import { createBench } from './bench/bench';

const q = (new URLSearchParams(location.search).get('q') as QualityTier | null) ?? 'high';
const quality: QualityTier = q === 'low' || q === 'medium' || q === 'high' ? q : 'high';
const view = document.getElementById('view')!;
const stage = createStage(view, quality, { mood: 'workshop' });

const tray: TrayItem[] = [
  { key: 'cell', label: 'Cell 1.5 V', part: { kind: 'battery', emf: 1.5 }, max: 2 },
  { key: 'pack6', label: 'Battery 6 V', part: { kind: 'battery', emf: 6 }, max: 1 },
  { key: 'pack12', label: 'Battery 12 V', part: { kind: 'battery', emf: 12 }, max: 1 },
  { key: 'wire', label: 'Wire', part: { kind: 'wire' } },
  { key: 'switch', label: 'Switch', part: { kind: 'switch', closed: false }, max: 2 },
  { key: 'globe', label: 'Globe 6 V', part: { kind: 'globe', ratedV: 6, ratedW: 3 }, max: 3 },
  { key: 'res', label: 'Resistor', part: { kind: 'resistor', resistance: 22 }, max: 2 },
  { key: 'mystery', label: 'Mystery R', part: { kind: 'resistor', resistance: 33, mystery: true }, max: 1 },
  { key: 'amm', label: 'Ammeter', part: { kind: 'ammeter' }, max: 2 },
  { key: 'volt', label: 'Voltmeter', part: { kind: 'voltmeter' }, max: 2 },
];

const bench = createBench(stage, view, { tray, adjustableSupply: { partId: 'PSU', min: 0, max: 12, step: 0.5 } });
const P = (c: number, r: number) => bench.postId(c, r);
const g6 = { kind: 'globe' as const, ratedV: 6, ratedW: 3 };

const lit = (): Part[] => [
  { id: 'B', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 6 },
  { id: 'W1', kind: 'wire', a: P(2, 2), b: P(3, 2) },
  { id: 'W2', kind: 'wire', a: P(3, 2), b: P(3, 1) },
  { id: 'G', ...g6, a: P(3, 1), b: P(2, 1) },
  { id: 'S', kind: 'switch', a: P(2, 1), b: P(1, 1), closed: true },
  { id: 'W3', kind: 'wire', a: P(1, 1), b: P(1, 2) },
];
const parallel = (): Part[] => [
  { id: 'B', kind: 'battery', a: P(1, 3), b: P(2, 3), emf: 6 },
  { id: 'W1', kind: 'wire', a: P(2, 3), b: P(3, 3) },
  { id: 'A', kind: 'ammeter', a: P(3, 3), b: P(3, 2) },
  { id: 'W2', kind: 'wire', a: P(2, 2), b: P(3, 2) },
  { id: 'G1', ...g6, a: P(2, 2), b: P(2, 1) },
  { id: 'G2', ...g6, a: P(3, 2), b: P(3, 1) },
  { id: 'W3', kind: 'wire', a: P(2, 1), b: P(3, 1) },
  { id: 'W4', kind: 'wire', a: P(1, 1), b: P(2, 1) },
  { id: 'W5', kind: 'wire', a: P(1, 1), b: P(1, 2) },
  { id: 'W6', kind: 'wire', a: P(1, 2), b: P(1, 3) },
  { id: 'V', kind: 'voltmeter', a: P(3, 1), b: P(3, 2) },
];
const short = (): Part[] => [
  { id: 'B', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 1.5 },
  { id: 'W1', kind: 'wire', a: P(2, 2), b: P(2, 1) },
  { id: 'W2', kind: 'wire', a: P(2, 1), b: P(1, 1) },
  { id: 'W3', kind: 'wire', a: P(1, 1), b: P(1, 2) },
  { id: 'G', ...g6, a: P(3, 1), b: P(3, 2) },
];

const ohm = (): Part[] => [
  { id: 'PSU', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 6 },
  { id: 'A', kind: 'ammeter', a: P(2, 2), b: P(3, 2) },
  { id: 'W1', kind: 'wire', a: P(3, 2), b: P(3, 1) },
  { id: 'R1', kind: 'resistor', a: P(3, 1), b: P(2, 1), resistance: 47, label: 'R1' },
  { id: 'RX', kind: 'resistor', a: P(2, 1), b: P(1, 1), resistance: 33, mystery: true },
  { id: 'W2', kind: 'wire', a: P(1, 1), b: P(1, 2) },
  { id: 'V', kind: 'voltmeter', a: P(2, 1), b: P(3, 1) },
];

const xrayBtn = document.getElementById('xray')!;
const setX = (on: boolean) => { bench.setXray(on); xrayBtn.setAttribute('aria-pressed', String(on)); };
xrayBtn.addEventListener('click', () => setX(!bench.xray));
const dg = document.getElementById('diagram')!;
dg.appendChild(bench.diagram);
document.getElementById('dg')!.addEventListener('click', (e) => { dg.hidden = !dg.hidden; (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(!dg.hidden)); });

function route(): void {
  const r = location.hash.slice(1) || 'lit';
  bench.select(null);
  bench.highlight([]);
  if (bench.tripped) bench.resetBreaker();
  switch (r) {
    case 'xray': bench.setParts(lit()); setX(true); break;
    case 'parallel': bench.setParts(parallel()); setX(true); break;
    case 'ohm': bench.setParts(ohm()); setX(false); break;
    case 'short': bench.setParts(short()); setX(false); break;
    case 'empty': bench.setParts([]); setX(false); break;
    default: bench.setParts(lit()); setX(false);
  }
  bench.resetEnergy();
  stage.resetView();
}
window.addEventListener('hashchange', route);
route();

Object.assign(window, { __bench: bench, __stage: stage });
