// Job 2: the 12 V training wall. Connect a new outlet in parallel with the existing one. Pure; no DOM.
//
// Nodes: 0 supply neutral, 1 supply active, 2 supply earth, 3 existing active, 4 existing neutral, 5 existing earth,
//        6 new active, 7 new neutral, 8 new earth.
// Fixed wiring (locked): battery 'bat' (0 negative, 1 positive); cables 'cab-a' (1 to 3), 'cab-n' (0 to 4), 'cab-e' (2 to 5);
// the earth bond 'bond' (2 to 0); lamp 'lamp-existing' across 3 and 4; lamp 'lamp-new' across 6 and 7.
// The student adds up to three wires: 'c-active', 'c-neutral', 'c-earth', each from a new-outlet terminal to a chosen point.
// Because every existing terminal is wired straight to the supply, a series arrangement cannot be built with three conductors:
// the wrong wirings that can happen are reversed polarity, both conductors on one point, earth used wrongly, and missing conductors.
import type { JobAnswer, JobResult, Part } from '../types';
import { solve } from './circuit';
import { makeResult } from './score';
import { within } from './units';

export type OutletTerminal = 'active' | 'neutral' | 'earth';
export type OutletPoint = 'supply-active' | 'supply-neutral' | 'supply-earth' | 'existing-active' | 'existing-neutral' | 'existing-earth';
/** where each new-outlet terminal is wired to (null = left unconnected) */
export type Wiring = Record<OutletTerminal, OutletPoint | null>;

export const OUTLET_POINTS: readonly OutletPoint[] = ['supply-active', 'supply-neutral', 'supply-earth', 'existing-active', 'existing-neutral', 'existing-earth'];
export const SUPPLY_V = 12;
export const PROTECTOR_LIMIT_A = 5;
export const DEFAULT_LAMP_W = 12;

export const POINT_NODE: Record<OutletPoint, number> = {
  'supply-active': 1, 'supply-neutral': 0, 'supply-earth': 2, 'existing-active': 3, 'existing-neutral': 4, 'existing-earth': 5,
};
export const NEW_NODE: Record<OutletTerminal, number> = { active: 6, neutral: 7, earth: 8 };

/** which circuit net a point belongs to */
export function netOf(p: OutletPoint): OutletTerminal {
  return p.endsWith('active') ? 'active' : p.endsWith('neutral') ? 'neutral' : 'earth';
}

/** The correct parallel wiring: each terminal to the matching existing terminal. */
export const CORRECT_WIRING: Wiring = { active: 'existing-active', neutral: 'existing-neutral', earth: 'existing-earth' };

export interface OutletOptions { existingLampW?: number; newLampW?: number; limitA?: number }

/** Build every part of the wall for a wiring. */
export function buildOutletParts(w: Wiring, o: OutletOptions = {}): Part[] {
  const lamp = (id: string, a: number, b: number, watts: number): Part => ({ id, kind: 'globe', a, b, ratedV: SUPPLY_V, ratedW: watts, locked: true });
  const parts: Part[] = [
    { id: 'bat', kind: 'battery', a: 0, b: 1, emf: SUPPLY_V, locked: true },
    { id: 'cab-a', kind: 'wire', a: 1, b: 3, locked: true },
    { id: 'cab-n', kind: 'wire', a: 0, b: 4, locked: true },
    { id: 'cab-e', kind: 'wire', a: 2, b: 5, locked: true },
    { id: 'bond', kind: 'wire', a: 2, b: 0, locked: true },
    lamp('lamp-existing', 3, 4, o.existingLampW ?? DEFAULT_LAMP_W),
    lamp('lamp-new', 6, 7, o.newLampW ?? DEFAULT_LAMP_W),
  ];
  (['active', 'neutral', 'earth'] as const).forEach((t) => {
    const p = w[t];
    if (p) parts.push({ id: `c-${t}`, kind: 'wire', a: NEW_NODE[t], b: POINT_NODE[p] });
  });
  return parts;
}

export type OutletTopology = 'parallel' | 'reversed' | 'same-point' | 'incomplete' | 'earth-misused';

export interface OutletReport {
  status: 'ok' | 'invalid';
  parts: Part[];
  topology: OutletTopology;
  /** short plain-language name of what was built */
  verdict: string;
  /** problems found, student-facing */
  problems: string[];
  /** V(active) - V(neutral) at the existing outlet, volts */
  existingVolts: number;
  /** V(active) - V(neutral) at the new outlet, volts (negative if reversed) */
  newVolts: number;
  existingCurrentA: number;
  newCurrentA: number;
  /** current delivered by the supply, amps */
  totalCurrentA: number;
  limitA: number;
  /** true if the supply protector stays on */
  protectorHolds: boolean;
  /** new outlet reads at least 95 % of the supply, the right way round */
  newOutletFull: boolean;
  /** existing outlet reads at least 95 % of the supply */
  existingOutletFull: boolean;
}

/** Wire, solve and report. */
export function analyseOutlet(w: Wiring, o: OutletOptions = {}): OutletReport {
  const parts = buildOutletParts(w, o);
  const sol = solve({ parts });
  const limitA = o.limitA ?? PROTECTOR_LIMIT_A;
  const v = (n: number) => sol.node[n] ?? 0;
  const existingVolts = v(3) - v(4), newVolts = v(6) - v(7);
  const total = sol.parts.bat?.current ?? 0;
  const problems: string[] = [];
  const nets = (['active', 'neutral', 'earth'] as const).map((t) => (w[t] ? netOf(w[t]!) : null));
  let topology: OutletTopology = 'parallel';
  let verdict = 'In parallel with the existing outlet.';
  if (nets.some((n) => n === null)) {
    topology = 'incomplete';
    verdict = 'Not finished: a conductor is missing.';
    (['active', 'neutral', 'earth'] as const).forEach((t) => { if (!w[t]) problems.push(`The ${t} terminal is not connected.`); });
  } else if (nets[0] === nets[1]) {
    topology = 'same-point';
    verdict = 'Both lamp conductors go to the same point, so nothing drives the lamp.';
    problems.push('The active and neutral conductors are on the same point. The lamp has no voltage across it.');
  } else if (nets[0] === 'neutral' && nets[1] === 'active') {
    topology = 'reversed';
    verdict = 'Cross-connected: active and neutral are swapped.';
    problems.push('Active and neutral are swapped. The lamp may light, but the outlet is wired the wrong way round.');
  } else if (nets[0] !== 'active' || nets[1] !== 'neutral') {
    topology = 'earth-misused';
    verdict = 'The earth point is being used as a lamp conductor.';
    problems.push('An earth connection is carrying the lamp circuit. Earth is only for safety.');
  } else if (nets[2] !== 'earth') {
    topology = 'earth-misused';
    verdict = 'The earth terminal is on the wrong point.';
    problems.push(nets[2] === 'active' ? 'The earth terminal is wired to active. On a real outlet that would make the metal parts live.' : 'The earth terminal should go to the earth point.');
  }
  const protectorHolds = Math.abs(total) <= limitA;
  if (!protectorHolds) problems.push(`The supply protector would trip: ${Math.abs(total).toFixed(1)} A is more than ${limitA} A.`);
  const full = SUPPLY_V * 0.95;
  return {
    status: sol.status, parts, topology, verdict, problems, existingVolts, newVolts,
    existingCurrentA: sol.parts['lamp-existing']?.current ?? 0, newCurrentA: sol.parts['lamp-new']?.current ?? 0,
    totalCurrentA: total, limitA, protectorHolds,
    newOutletFull: sol.status === 'ok' && newVolts >= full, existingOutletFull: sol.status === 'ok' && existingVolts >= full,
  };
}

/** Total current of the correct parallel wiring, amps (the answer to the prediction question). */
export function predictedTotalA(o: OutletOptions = {}): number { return analyseOutlet(CORRECT_WIRING, o).totalCurrentA; }

/** Current by the student's method: I = V ÷ R for each lamp, then add. R = rated V² ÷ rated W. */
export function handPredictionA(o: OutletOptions = {}): number {
  const r = (w: number) => (SUPPLY_V * SUPPLY_V) / w;
  return SUPPLY_V / r(o.existingLampW ?? DEFAULT_LAMP_W) + SUPPLY_V / r(o.newLampW ?? DEFAULT_LAMP_W);
}

export interface OutletInput {
  wiring: Wiring;
  /** the training supply was switched off before touching any conductor */
  isolated: boolean;
  /** the meter was used to show the wiring was dead before touching it */
  provedDead: boolean;
  /** both outlets were tested with a lamp */
  testedBoth: boolean;
  /** the student's prediction of the new total current, amps (null = none) */
  predictedA: number | null;
  options?: OutletOptions;
}

/** Score Job 2: parallel connection 35 (active 12, neutral 12, earth 11), off and proven dead 25, both outlets at full voltage 15, current prediction within 5 % 25. */
export function scoreOutlet(input: OutletInput): JobResult {
  const o = input.options ?? {};
  const rep = analyseOutlet(input.wiring, o);
  const w = input.wiring;
  const okA = !!w.active && netOf(w.active) === 'active';
  const okN = !!w.neutral && netOf(w.neutral) === 'neutral';
  const okE = !!w.earth && netOf(w.earth) === 'earth';
  const connScore = (okA ? 12 : 0) + (okN ? 12 : 0) + (okE ? 11 : 0);
  const safeScore = input.isolated && input.provedDead ? 25 : input.isolated ? 12 : 0;
  const fullOk = rep.newOutletFull && rep.existingOutletFull;
  const testScore = fullOk ? (input.testedBoth ? 15 : 7) : 0;
  const truth = predictedTotalA(o);
  const predOk = input.predictedA !== null && within(input.predictedA, truth, 0.05, 0.01);
  const answers: JobAnswer[] = [
    { q: 'New outlet wired in parallel', a: rep.verdict, ok: connScore === 35 },
    { q: 'Switched off and proved dead first', a: `${input.isolated ? 'switched off' : 'not switched off'}, ${input.provedDead ? 'proved dead with the meter' : 'not proved dead'}`, ok: safeScore === 25 },
    { q: 'Both outlets at full voltage', a: `existing ${rep.existingVolts.toFixed(1)} V, new ${rep.newVolts.toFixed(1)} V`, ok: fullOk && input.testedBoth },
    { q: 'New total current (I = V ÷ R)', a: input.predictedA === null ? 'no answer' : `${input.predictedA.toFixed(2)} A (answer ${truth.toFixed(2)} A)`, ok: predOk },
  ];
  const lines: string[] = [];
  lines.push(connScore === 35 ? 'Your new outlet is in parallel with the existing one.' : rep.problems[0] ?? 'Check each conductor goes to the matching terminal.');
  lines.push(safeScore === 25 ? 'You switched off and proved it dead first. That is the safe habit.' : 'Always switch off and prove it dead with the meter before touching conductors.');
  lines.push(fullOk ? (input.testedBoth ? 'Both outlets read full voltage.' : 'Both outlets would read full voltage, but you did not test both.') : 'One outlet does not read full voltage.');
  lines.push(predOk ? 'Your current prediction was right.' : `Add the lamp currents. Each is V ÷ R. The answer is about ${truth.toFixed(1)} A.`);
  return makeResult(connScore + safeScore + testScore + (predOk ? 25 : 0), lines, answers);
}
