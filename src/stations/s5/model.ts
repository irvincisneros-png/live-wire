// Station 5 kitchen model. Pure: no DOM, no three.js. All energy maths goes through src/sim.
// Time only passes during a "run": the student picks a duration, the sim clock fast-forwards over it,
// and every switched-on appliance adds E = P × t (t = seconds it was actually running) to its tally.
import { applianceById, cost, energyJ, EXAMPLE_PRICE_PER_KWH } from '../../sim/appliances';
import { fmt, fmtMoney, joulesToKWh } from '../../sim/units';

export const S5_IDS = ['microwave', 'kettle', 'toaster', 'led-lamp', 'phone-charger', 'led-tv'] as const;
export type S5Id = (typeof S5_IDS)[number];

export interface S5Appliance {
  id: S5Id;
  /** short name for tags and the chart */
  name: string;
  powerW: number;
  resistive: boolean;
  /** typical-day running windows, [startHour, endHour) within one day */
  day: [number, number][];
}

const MIN = 1 / 60;
/** One typical day of use in this kitchen (a station scenario, not survey data). Kettle 10 min, LED lamp 6 h. */
const TYPICAL_DAY: Record<S5Id, [number, number][]> = {
  microwave: [[12.5, 12.5 + 6 * MIN], [18.25, 18.25 + 4 * MIN]], // 10 min
  kettle: [[7, 7 + 5 * MIN], [15.5, 15.5 + 5 * MIN]], // 10 min
  toaster: [[7.1, 7.1 + 5 * MIN]], // 5 min
  'led-lamp': [[17, 23]], // 6 h
  'phone-charger': [[21, 24]], // 3 h
  'led-tv': [[18, 23]], // 5 h
};
const SHORT: Record<S5Id, string> = {
  microwave: 'Microwave', kettle: 'Kettle', toaster: 'Toaster', 'led-lamp': 'LED lamp', 'phone-charger': 'Phone charger', 'led-tv': 'TV',
};

export const S5_APPLIANCES: readonly S5Appliance[] = S5_IDS.map((id) => {
  const a = applianceById(id);
  if (!a) throw new Error(`missing appliance ${id}`);
  return { id, name: SHORT[id], powerW: a.powerW, resistive: a.resistive, day: TYPICAL_DAY[id] };
});
export const s5Appliance = (id: S5Id): S5Appliance => S5_APPLIANCES.find((a) => a.id === id)!;
/** name for use mid-sentence: "kettle", "phone charger", but "LED lamp" and "TV" keep their capitals */
export function lowerName(id: S5Id): string {
  const n = s5Appliance(id).name;
  return /^[A-Z]{2}/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1);
}

export type RunMode = 'min3' | 'hour1' | 'day' | 'h24' | 'min1' | 'min10' | 'min30' | 'hour2' | 'hour8' | 'week';
export interface RunDef { label: string; seconds: number; /** typical-day schedule instead of "on the whole time" */ typical: boolean; /** real seconds the fast-forward takes */ realSeconds: number }
export const RUNS: Record<RunMode, RunDef> = {
  min3: { label: '3 minutes', seconds: 180, typical: false, realSeconds: 3 },
  hour1: { label: '1 hour', seconds: 3600, typical: false, realSeconds: 4 },
  day: { label: 'Typical day', seconds: 86400, typical: true, realSeconds: 7 },
  h24: { label: '24 h left on', seconds: 86400, typical: false, realSeconds: 6 },
  min1: { label: '1 minute', seconds: 60, typical: false, realSeconds: 2 },
  min10: { label: '10 minutes', seconds: 600, typical: false, realSeconds: 3 },
  min30: { label: '30 minutes', seconds: 1800, typical: false, realSeconds: 3.5 },
  hour2: { label: '2 hours', seconds: 7200, typical: false, realSeconds: 4 },
  hour8: { label: '8 hours', seconds: 28800, typical: false, realSeconds: 5 },
  week: { label: '1 week, typical use', seconds: 7 * 86400, typical: true, realSeconds: 8 },
};
export const QUICK_RUNS: RunMode[] = ['min3', 'hour1', 'day', 'h24'];
export const MORE_RUNS: RunMode[] = ['min1', 'min10', 'min30', 'hour2', 'hour8', 'week'];

/** seconds of overlap between [a0, a1) and [b0, b1) */
const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Seconds an appliance is running between sim times t0 and t1 (seconds since the run started, run starts at midnight). */
export function activeSeconds(id: S5Id, mode: RunMode, t0: number, t1: number): number {
  const run = RUNS[mode];
  const a = Math.max(0, t0), b = Math.min(run.seconds, t1);
  if (b <= a) return 0;
  if (!run.typical) return b - a;
  let s = 0;
  const firstDay = Math.floor(a / 86400), lastDay = Math.floor((b - 1e-9) / 86400);
  for (let d = firstDay; d <= lastDay; d++) {
    for (const [h0, h1] of s5Appliance(id).day) s += overlap(a, b, d * 86400 + h0 * 3600, d * 86400 + h1 * 3600);
  }
  return s;
}

/** Is the appliance running at sim time t of a run? (for the 3D view) */
export function runningAt(id: S5Id, mode: RunMode, t: number): boolean {
  const run = RUNS[mode];
  if (!run.typical) return true;
  const tod = (((t % 86400) + 86400) % 86400) / 3600;
  return s5Appliance(id).day.some(([h0, h1]) => tod >= h0 && tod < h1);
}

/** Total seconds an appliance runs over a whole run. */
export const runSeconds = (id: S5Id, mode: RunMode): number => activeSeconds(id, mode, 0, RUNS[mode].seconds);
/** Energy in joules an appliance uses over a whole run (E = P × t). */
export const runEnergyJ = (id: S5Id, mode: RunMode): number => energyJ(s5Appliance(id).powerW, runSeconds(id, mode));

/** Energy packets per second for an appliance of power P (log-scaled; display only). */
export function packetRate(powerW: number): number {
  if (!(powerW > 0)) return 0;
  return Math.max(0.8, 0.9 + 6 * Math.log10(powerW / 9));
}

// ───────────── state ─────────────

export interface RunResult {
  mode: RunMode;
  /** appliances that were switched on */
  on: S5Id[];
  /** joules per appliance */
  joules: Record<S5Id, number>;
  /** seconds each appliance was running */
  seconds: Record<S5Id, number>;
}

export interface MeterState {
  on: S5Id;
  /** joules since the meter was plugged in or reset (only counts during runs) */
  joules: number;
  /** seconds the appliance was running since then */
  seconds: number;
}

export interface S5State {
  on: Record<S5Id, boolean>;
  meter: MeterState;
  /** the run in progress, or null when the clock is stopped */
  run: { mode: RunMode; t: number; joules: Record<S5Id, number>; seconds: Record<S5Id, number>; on: S5Id[] } | null;
  last: RunResult | null;
  /** count of finished runs (handy for coach steps) */
  runs: number;
}

const zeros = (): Record<S5Id, number> => Object.fromEntries(S5_IDS.map((id) => [id, 0])) as Record<S5Id, number>;

export function createState(meterOn: S5Id = 'kettle'): S5State {
  return {
    on: Object.fromEntries(S5_IDS.map((id) => [id, false])) as Record<S5Id, boolean>,
    meter: { on: meterOn, joules: 0, seconds: 0 },
    run: null, last: null, runs: 0,
  };
}

export function moveMeter(s: S5State, id: S5Id): void {
  if (s.meter.on === id) return;
  s.meter = { on: id, joules: 0, seconds: 0 };
}

/** start a run: the tallies and the meter reset to zero. Switched-off appliances stay off for the whole run. */
export function startRun(s: S5State, mode: RunMode): void {
  s.run = { mode, t: 0, joules: zeros(), seconds: zeros(), on: S5_IDS.filter((id) => s.on[id]) };
  s.meter.joules = 0; s.meter.seconds = 0;
}

/** advance the run by real seconds dt; returns true on the frame the run finishes */
export function stepRun(s: S5State, dt: number): boolean {
  const r = s.run;
  if (!r) return false;
  const def = RUNS[r.mode];
  const t1 = Math.min(def.seconds, r.t + (def.seconds / def.realSeconds) * Math.max(0, dt));
  for (const id of r.on) {
    const secs = activeSeconds(id, r.mode, r.t, t1);
    const j = energyJ(s5Appliance(id).powerW, secs);
    r.seconds[id] += secs; r.joules[id] += j;
    if (id === s.meter.on) { s.meter.seconds += secs; s.meter.joules += j; }
  }
  r.t = t1;
  if (t1 < def.seconds) return false;
  finishRun(s);
  return true;
}

/** jump to the end of the run in progress (exact totals) */
export function finishRun(s: S5State): void {
  const r = s.run;
  if (!r) return;
  // exact totals (no accumulated floating error from many small steps)
  const joules = zeros(), seconds = zeros();
  for (const id of r.on) { seconds[id] = runSeconds(id, r.mode); joules[id] = runEnergyJ(id, r.mode); }
  if (r.on.includes(s.meter.on)) { s.meter.seconds = seconds[s.meter.on]; s.meter.joules = joules[s.meter.on]; }
  s.last = { mode: r.mode, on: r.on, joules, seconds };
  s.run = null;
  s.runs += 1;
}

/** watts the meter reads right now: the appliance's power if it is switched on (and running, during a typical-day run) */
export function meterWatts(s: S5State): number {
  const id = s.meter.on;
  if (!s.on[id]) return 0;
  if (s.run && (!s.run.on.includes(id) || !runningAt(id, s.run.mode, s.run.t))) return 0;
  return s5Appliance(id).powerW;
}

// ───────────── formatting (pure, tested) ─────────────

/** dollars as a friendly string: cents below $1 ("3.6 c"), dollars above ("$1.45") */
export function costText(dollars: number): string {
  if (!Number.isFinite(dollars)) return '—';
  if (dollars === 0) return '0 c';
  if (dollars < 1) {
    const c = dollars * 100;
    return `${c >= 10 ? c.toFixed(1) : c >= 0.1 ? c.toFixed(2) : Number(c.toPrecision(2)).toString()} c`;
  }
  return fmtMoney(dollars);
}

/** integer with thin spaces between thousands ("396 000"); falls back to SI prefixes for very large values */
export function grouped(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e8) return fmt(n, '');
  const r = Math.round(n);
  if (Math.abs(n - r) > 1e-6 && Math.abs(n) < 100) return Number(n.toPrecision(3)).toString();
  return r.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** "h:mm:ss" */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

/** a friendly duration: "10 min", "6 h", "3 min 30 s" */
export function durationText(seconds: number): string {
  const s = Math.round(seconds);
  if (s === 0) return '0 s';
  if (s < 60) return `${s} s`;
  if (s < 3600) { const m = Math.floor(s / 60), r = s % 60; return r ? `${m} min ${r} s` : `${m} min`; }
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export interface EnergySummary { joules: number; kWh: number; dollars: number }
export function summary(joules: number, price = EXAMPLE_PRICE_PER_KWH): EnergySummary {
  const kWh = joulesToKWh(joules);
  return { joules, kWh, dollars: cost(kWh, price) };
}

/** one plain sentence about the last run: which appliance used the most energy, and why */
export function insight(r: RunResult): string {
  const on = r.on;
  if (on.length === 0) return 'Nothing was switched on, so no energy was used.';
  const name = (id: S5Id) => lowerName(id);
  const byE = [...on].sort((a, b) => r.joules[b] - r.joules[a]);
  const byP = [...on].sort((a, b) => s5Appliance(b).powerW - s5Appliance(a).powerW);
  const e = byE[0], p = byP[0];
  if (on.length === 1) return `Only the ${name(e)} was on: ${fmt(r.joules[e], 'J')} in ${durationText(r.seconds[e])}.`;
  if (r.joules[e] === 0) return 'The switched-on appliances did not run during this time.';
  if (e !== p) {
    const ratio = s5Appliance(p).powerW / s5Appliance(e).powerW;
    return `The ${name(e)} used the most energy, even though the ${name(p)} has ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)} times more power. The ${name(e)} ran for ${durationText(r.seconds[e])}; the ${name(p)} ran for ${durationText(r.seconds[p])}.`;
  }
  const last = byE[byE.length - 1];
  return `The ${name(p)} has the most power and used the most energy. The ${name(last)} used the least.`;
}
