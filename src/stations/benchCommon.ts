// Shared helpers for bench-based stations and jobs. Owned by the orchestrator; station builders import, do not edit.
import type { Bench, BenchOptions, Part, Reading, StationHost, TrayItem, QualityTier, Dashboard } from '../types';
import { createStage, type KitStage } from '../kit/stage';
import { createBench } from '../bench/bench';
import { resistanceOf } from '../sim/circuit';

/** standard tray entries; pass `max` to limit */
export const TRAY = {
  cell: (max?: number): TrayItem => ({ key: 'cell', label: 'Cell 1.5 V', part: { kind: 'battery', emf: 1.5 }, max }),
  pack6: (max?: number): TrayItem => ({ key: 'pack6', label: 'Battery 6 V', part: { kind: 'battery', emf: 6 }, max }),
  pack12: (max?: number): TrayItem => ({ key: 'pack12', label: 'Battery 12 V', part: { kind: 'battery', emf: 12 }, max }),
  wire: (max?: number): TrayItem => ({ key: 'wire', label: 'Wire', part: { kind: 'wire' }, max }),
  switch: (max?: number): TrayItem => ({ key: 'switch', label: 'Switch', part: { kind: 'switch', closed: false }, max }),
  globe: (max?: number): TrayItem => ({ key: 'globe', label: 'Globe 6 V', part: { kind: 'globe', ratedV: 6, ratedW: 3 }, max }),
  resistor: (ohms = 22, max?: number): TrayItem => ({ key: `res${ohms}`, label: `Resistor ${ohms} Ω`, part: { kind: 'resistor', resistance: ohms }, max }),
  ammeter: (max?: number): TrayItem => ({ key: 'amm', label: 'Ammeter', part: { kind: 'ammeter' }, max }),
  voltmeter: (max?: number): TrayItem => ({ key: 'volt', label: 'Voltmeter', part: { kind: 'voltmeter' }, max }),
};

const NAMES: Record<Part['kind'], string> = { battery: 'Battery', wire: 'Wire', switch: 'Switch', globe: 'Globe', resistor: 'Resistor', ammeter: 'Ammeter', voltmeter: 'Voltmeter' };

/** dashboard reading for one part from the bench's current solution (null if the solve is invalid) */
export function readingFor(bench: Bench, id: string): Reading | null {
  const p = bench.getParts().find((x) => x.id === id);
  const r = bench.solution.parts[id];
  if (!p || !r || bench.solution.status !== 'ok') return null;
  const label = p.label ?? NAMES[p.kind];
  const V = Math.abs(r.drop), I = Math.abs(r.current);
  if (p.kind === 'battery') return { label, V: p.emf ?? 0, I, P: Math.abs(r.power), E: bench.energyOf(id) };
  if (p.kind === 'resistor') return { label, V, I, R: p.mystery ? undefined : resistanceOf(p), P: r.power, E: bench.energyOf(id) };
  if (p.kind === 'globe') return { label, V, I, R: p.blown ? undefined : resistanceOf(p), P: r.power, E: bench.energyOf(id) };
  if (p.kind === 'ammeter') return { label, I };
  if (p.kind === 'voltmeter') return { label, V };
  return { label, V, I };
}

/** keep the dashboard in step with the selected part (refreshes ~4×/s so the energy tally ticks). Returns a stop function. */
export function wireDashboard(bench: Bench, dashboard: Dashboard): () => void {
  const refresh = () => dashboard.show(bench.selectedId ? readingFor(bench, bench.selectedId) : null);
  const offs = [bench.onChange(refresh), bench.onSelect(refresh)];
  const timer = window.setInterval(refresh, 250);
  refresh();
  return () => { offs.forEach((f) => f()); window.clearInterval(timer); dashboard.show(null); };
}

export interface BenchRig {
  stage: KitStage;
  bench: Bench;
  /** adds an "X-ray" toggle and returns it; the bench already has Front view and Parts list buttons */
  dispose(): void;
}

/** one-call setup for a bench station: stage + bench + dashboard wiring + an X-ray toggle button in the view (top right, under the bench's own buttons) */
export function mountBench(host: { view: HTMLElement; dashboard: Dashboard; quality: QualityTier }, opts: BenchOptions, o: { xrayButton?: boolean } = {}): BenchRig {
  const stage = createStage(host.view, host.quality, { mood: 'workshop' });
  const bench = createBench(stage, host.view, opts);
  const stopDash = wireDashboard(bench, host.dashboard);
  let btn: HTMLButtonElement | null = null;
  if (o.xrayButton !== false) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lw-xray-btn';
    btn.textContent = 'X-ray';
    btn.title = 'See the charges moving';
    btn.setAttribute('aria-pressed', String(bench.xray));
    btn.addEventListener('click', () => { bench.setXray(!bench.xray); btn!.setAttribute('aria-pressed', String(bench.xray)); });
    host.view.appendChild(btn);
  }
  return {
    stage, bench,
    dispose() { stopDash(); btn?.remove(); bench.dispose(); stage.dispose(); },
  };
}

/** true if some globe is lit (power above 5 % of rated) */
export const anyGlobeLit = (bench: Bench): boolean => bench.getParts().some((p) => p.kind === 'globe' && !p.blown && (bench.solution.parts[p.id]?.power ?? 0) > 0.05 * (p.ratedW ?? 3));
export const partsOf = (bench: Bench, kind: Part['kind']): Part[] => bench.getParts().filter((p) => p.kind === kind);
export const typedHost = (h: StationHost): StationHost => h;
