// Job 2 glue (pure, no DOM, no three): the training supply, meter readings, conductor connections, lamps and the
// prediction. Tracks the safe-work habit exactly as scoreOutlet expects (isolated, provedDead), scored by scoreOutlet.
import type { JobResult, Part } from '../../types';
import { solve } from '../../sim/circuit';
import { readVoltage } from '../../sim/faults';
import { rng } from '../../sim/seed';
import {
  CORRECT_WIRING, NEW_NODE, POINT_NODE, PROTECTOR_LIMIT_A, SUPPLY_V, buildOutletParts, predictedTotalA, scoreOutlet,
  type OutletOptions, type OutletPoint, type OutletTerminal, type Wiring,
} from '../../sim/outlet';

export const TERMINALS: OutletTerminal[] = ['active', 'neutral', 'earth'];

/** meter test points on the training wall: the supply junction, the existing outlet and the new outlet terminals */
export interface J2Point { id: string; node: number; name: string; short: string; block: 'supply' | 'existing' | 'new'; net: OutletTerminal }
export const J2_POINTS: J2Point[] = (() => {
  const out: J2Point[] = [];
  const blocks = [['supply', 'Supply junction'], ['existing', 'Existing outlet'], ['new', 'New outlet']] as const;
  for (const [block, title] of blocks) for (const net of TERMINALS) {
    const id = `${block}-${net}`;
    const node = block === 'new' ? NEW_NODE[net] : POINT_NODE[id as OutletPoint];
    out.push({ id, node, name: `${title}, ${net}`, short: `${block === 'supply' ? 'J' : block === 'existing' ? 'X' : 'N'}${net[0].toUpperCase()}`, block, net });
  }
  return out;
})();
export const j2Point = (id: string): J2Point | undefined => J2_POINTS.find((p) => p.id === id);

/** human label for a connection point */
export function pointLabel(p: OutletPoint): string { return j2Point(p)?.name ?? p; }

/** lamp resistances for this attempt (12 V lamps): R = V² ÷ P, so P = 144 ÷ R */
export function lampsFor(seed: number): { existingR: number; newR: number; options: OutletOptions } {
  const r = rng(seed * 7 + 3);
  const RS = [24, 16, 12, 8, 6];
  const existingR = r.pick(RS), newR = r.pick(RS);
  return { existingR, newR, options: { existingLampW: (SUPPLY_V * SUPPLY_V) / existingR, newLampW: (SUPPLY_V * SUPPLY_V) / newR } };
}

export interface J2Reading { a: number; b: number; v: number; supplyOn: boolean }

export interface J2State {
  seed: number;
  existingR: number;
  newR: number;
  options: OutletOptions;
  supplyOn: boolean;
  wiring: Wiring;
  plugged: { existing: boolean; new: boolean };
  readings: J2Reading[];
  /** proved dead since the supply was last switched off */
  provedThisOff: boolean;
  /** any conductor touched at all */
  touched: boolean;
  /** a conductor was touched while the supply was on */
  touchedLive: boolean;
  /** a conductor was touched while off but before proving dead */
  touchedUnproved: boolean;
  /** the protector tripped (supply forced off) */
  tripped: boolean;
  /** both lamps lit at full supply since the last wiring change */
  testedBoth: boolean;
  predictedA: number | null;
  /** count of stop cards shown */
  stops: number;
}

export function createJ2(seed: number): J2State {
  const l = lampsFor(seed);
  return {
    seed, existingR: l.existingR, newR: l.newR, options: l.options,
    supplyOn: true, wiring: { active: null, neutral: null, earth: null },
    plugged: { existing: false, new: false }, readings: [], provedThisOff: false,
    touched: false, touchedLive: false, touchedUnproved: false, tripped: false, testedBoth: false, predictedA: null, stops: 0,
  };
}

/** the wall as it is right now: supply removed when off, unplugged lamps removed */
export function liveParts(s: J2State): Part[] {
  return buildOutletParts(s.wiring, s.options).filter((p) => {
    if (p.id === 'bat') return s.supplyOn;
    if (p.id === 'lamp-existing') return s.plugged.existing;
    if (p.id === 'lamp-new') return s.plugged.new;
    return true;
  });
}

export interface J2Live { lampPowerW: { existing: number; new: number }; totalA: number; newVolts: number; existingVolts: number }

export function live(s: J2State): J2Live {
  const parts = liveParts(s);
  const sol = solve({ parts });
  const ok = sol.status === 'ok';
  const pw = (id: string) => (ok ? Math.abs(sol.parts[id]?.power ?? 0) : 0);
  const v = (n: number) => (ok ? sol.node[n] ?? 0 : 0);
  return {
    lampPowerW: { existing: pw('lamp-existing'), new: pw('lamp-new') },
    totalA: ok && s.supplyOn ? Math.abs(sol.parts.bat?.current ?? 0) : 0,
    existingVolts: s.supplyOn ? v(3) - v(4) : 0,
    newVolts: s.supplyOn ? v(6) - v(7) : 0,
  };
}

function afterChange(s: J2State): void {
  const l = live(s);
  if (l.totalA > PROTECTOR_LIMIT_A) { s.supplyOn = false; s.tripped = true; s.provedThisOff = false; return; }
  const full = SUPPLY_V * 0.95;
  if (s.supplyOn && s.plugged.existing && s.plugged.new && l.existingVolts >= full && l.newVolts >= full) s.testedBoth = true;
}

export function setSupply(s: J2State, on: boolean): void {
  if (s.supplyOn === on) return;
  s.supplyOn = on;
  s.provedThisOff = false;
  if (on) s.tripped = false;
  afterChange(s);
}

const ACTIVE_NODES = new Set([POINT_NODE['supply-active'], POINT_NODE['existing-active']]);
const NEUTRAL_NODES = new Set([POINT_NODE['supply-neutral'], POINT_NODE['existing-neutral']]);

/** true if a reading proves the work point dead: supply off, between active and neutral at the supply junction or the existing outlet, reading 0 V */
export function provesDead(r: J2Reading): boolean {
  const an = (ACTIVE_NODES.has(r.a) && NEUTRAL_NODES.has(r.b)) || (ACTIVE_NODES.has(r.b) && NEUTRAL_NODES.has(r.a));
  return !r.supplyOn && an && Math.abs(r.v) < 0.5;
}

/** black (COM) probe on node a, red on node b. Reading = V(red) − V(black). */
export function measure(s: J2State, a: number, b: number): number {
  const v = a === b ? 0 : readVoltage(liveParts(s), { a, b });
  const r: J2Reading = { a, b, v: Number.isFinite(v) && Math.abs(v) >= 0.005 ? v : 0, supplyOn: s.supplyOn };
  s.readings.push(r);
  if (provesDead(r)) s.provedThisOff = true;
  return r.v;
}

/** what touching a conductor now would break; null if it is safe */
export function touchProblem(s: J2State): 'live' | 'unproved' | null {
  if (s.supplyOn) return 'live';
  if (!s.provedThisOff) return 'unproved';
  return null;
}

/** make, move or remove one of the new outlet's conductors. Returns the safety problem (the change still happens). */
export function connect(s: J2State, t: OutletTerminal, p: OutletPoint | null): 'live' | 'unproved' | null {
  if (s.wiring[t] === p) return null;
  const problem = touchProblem(s);
  s.touched = true;
  if (problem === 'live') s.touchedLive = true;
  if (problem === 'unproved') s.touchedUnproved = true;
  if (problem) s.stops++;
  s.wiring = { ...s.wiring, [t]: p };
  s.testedBoth = false;
  afterChange(s);
  return problem;
}

export function plug(s: J2State, which: 'existing' | 'new', on: boolean): void {
  s.plugged = { ...s.plugged, [which]: on };
  afterChange(s);
}

export function wiringComplete(s: J2State): boolean { return TERMINALS.every((t) => s.wiring[t] !== null); }

export function canSubmit(s: J2State): boolean { return wiringComplete(s) && s.predictedA !== null; }

/** the inputs scoreOutlet needs */
export function outletInput(s: J2State) {
  const isolated = s.touched && !s.touchedLive;
  return {
    wiring: s.wiring,
    isolated,
    provedDead: isolated && !s.touchedUnproved,
    testedBoth: s.testedBoth,
    predictedA: s.predictedA,
    options: s.options,
  };
}

export function resultJ2(s: J2State): JobResult { return scoreOutlet(outletInput(s)); }

/** the answer to the prediction for this attempt */
export function truthA(s: J2State): number { return predictedTotalA(s.options); }

/** a correct run: off, prove dead at the existing outlet, connect in parallel, plug both lamps, on, predict */
export function correctRun(s: J2State): J2State {
  setSupply(s, false);
  measure(s, POINT_NODE['existing-neutral'], POINT_NODE['existing-active']);
  for (const t of TERMINALS) connect(s, t, CORRECT_WIRING[t]);
  plug(s, 'existing', true); plug(s, 'new', true);
  setSupply(s, true);
  measure(s, NEW_NODE.neutral, NEW_NODE.active);
  const hand = SUPPLY_V / s.existingR + SUPPLY_V / s.newR;
  s.predictedA = Math.round(hand * 100) / 100;
  return s;
}

/** a poor run: wires it live, active and neutral swapped, earth left off, one lamp, a guess of 1 A */
export function poorRun(s: J2State): J2State {
  connect(s, 'active', 'existing-neutral');
  connect(s, 'neutral', 'existing-active');
  connect(s, 'earth', 'existing-active');
  plug(s, 'new', true);
  s.predictedA = 50;
  return s;
}
