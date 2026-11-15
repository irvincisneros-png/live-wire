// Job 1 glue (pure, no DOM, no three): the student's switch states, meter log and answers, scored by scoreFault.
import type { JobResult, Part } from '../../types';
import {
  REASONING_CORRECT, buildScenario, houseLayout, isUseful, readVoltage, scoreFault,
  type FaultKind, type FaultScenario, type Measurement,
} from '../../sim/faults';

export const SWITCH_IDS = ['main', 'sw0', 'sw1', 'sw2'] as const;
export type SwitchId = (typeof SWITCH_IDS)[number];

export const FAULT_KINDS: { kind: FaultKind; label: string }[] = [
  { kind: 'switch-open', label: 'A switch stuck open' },
  { kind: 'blown-globe', label: 'A blown globe' },
  { kind: 'broken-wire', label: 'A broken wire (a gap)' },
];

/** a named test socket on the training house: code printed on its tag, the circuit node it touches */
export interface J1Point { code: string; node: number; name: string; where: 'board' | 'switch' | 'lamp'; room: number }

const ROOM_NAMES = ['Lounge', 'Kitchen', 'Hallway'];

/** T1 to T15: the board first, then each room's switch (in, out) and lamp (top, bottom). */
export const J1_POINTS: J1Point[] = (() => {
  const out: J1Point[] = [
    { code: 'T1', node: 1, name: 'Supply positive (+)', where: 'board', room: -1 },
    { code: 'T2', node: 0, name: 'Supply negative (−), return rail', where: 'board', room: -1 },
    { code: 'T3', node: 2, name: 'After the main switch', where: 'board', room: -1 },
  ];
  let c = 4;
  for (let k = 0; k < 3; k++) {
    const n = 3 + 4 * k, r = ROOM_NAMES[k];
    out.push(
      { code: `T${c++}`, node: n, name: `${r} switch, in`, where: 'switch', room: k },
      { code: `T${c++}`, node: n + 1, name: `${r} switch, out`, where: 'switch', room: k },
      { code: `T${c++}`, node: n + 2, name: `${r} lamp, top terminal`, where: 'lamp', room: k },
      { code: `T${c++}`, node: n + 3, name: `${r} lamp, bottom terminal`, where: 'lamp', room: k },
    );
  }
  return out;
})();

export const pointByCode = (code: string): J1Point | undefined => J1_POINTS.find((p) => p.code === code);
export const pointByNode = (node: number): J1Point | undefined => J1_POINTS.find((p) => p.node === node);

const WIRE_ROLE = ['board to switch', 'switch to lamp', 'lamp back to board'];

/** every part the student can name as the fault location, with a plain label */
export function locationOptions(): { id: string; label: string }[] {
  const lay = houseLayout();
  const out: { id: string; label: string }[] = [{ id: 'main', label: 'Main switch (switchboard)' }];
  for (let k = 0; k < 3; k++) {
    out.push({ id: `sw${k}`, label: `${ROOM_NAMES[k]} wall switch` }, { id: `g${k}`, label: `${ROOM_NAMES[k]} globe` });
  }
  for (let i = 0; i < 9; i++) {
    const id = `wire-${'ABCDEFGHI'[i]}`;
    out.push({ id, label: `${lay.parts[id].label}: ${ROOM_NAMES[Math.floor(i / 3)]}, ${WIRE_ROLE[i % 3]}` });
  }
  return out;
}

export interface LoggedReading { a: number; b: number; v: number }

export interface J1State {
  seed: number;
  scenario: FaultScenario;
  /** what the student has set each switch to (true = on); a stuck switch moves but does not conduct */
  switchOn: Record<SwitchId, boolean>;
  log: LoggedReading[];
  answerKind: FaultKind | null;
  answerPartId: string | null;
  reasoning: number | null;
}

export function createJ1(seed: number): J1State {
  return {
    seed, scenario: buildScenario(seed),
    switchOn: { main: true, sw0: true, sw1: true, sw2: true },
    log: [], answerKind: null, answerPartId: null, reasoning: null,
  };
}

/** the faulty circuit with the student's switch positions applied */
export function liveParts(s: J1State): Part[] {
  return s.scenario.parts.map((p) => {
    if (p.kind !== 'switch') return p;
    const on = s.switchOn[p.id as SwitchId] ?? true;
    return { ...p, closed: on && !p.locked };
  });
}

/** take a reading: black (COM) probe on node a, red on node b. Reading = V(red) − V(black). Logged. */
export function measure(s: J1State, a: number, b: number): number {
  const raw = readVoltage(liveParts(s), { a, b });
  // a real meter shows 0.00 for microvolts of leakage
  const v = Number.isFinite(raw) && Math.abs(raw) >= 0.005 ? raw : 0;
  s.log.push({ a, b, v });
  return v;
}

export function canSubmit(s: J1State): boolean {
  return s.answerKind !== null && s.answerPartId !== null && s.reasoning !== null;
}

export function resultJ1(s: J1State): JobResult {
  const measurements: Measurement[] = s.log.map(({ a, b }) => ({ a, b }));
  return scoreFault({ fault: s.scenario.fault, answerKind: s.answerKind, answerPartId: s.answerPartId, measurements, reasoning: s.reasoning });
}

/** a measurement between two test sockets that tells this fault apart (used by solve() helpers and tests) */
export function usefulPair(s: J1State): Measurement | null {
  const nodes = J1_POINTS.map((p) => p.node);
  // prefer a reading across a single part in the dark room, the way a tradie would work
  for (const a of nodes) for (const b of nodes) {
    if (a === b) continue;
    if (isUseful(s.scenario.fault, { a, b })) return { a, b };
  }
  return null;
}

/** perform a correct run on a state (no DOM): one useful reading, the right answers */
export function correctRun(s: J1State): J1State {
  const m = usefulPair(s);
  if (m) measure(s, m.a, m.b);
  s.answerKind = s.scenario.fault.kind;
  s.answerPartId = s.scenario.fault.partId;
  s.reasoning = REASONING_CORRECT;
  return s;
}

/** a poor run: one reading across the supply only, a wrong kind in another room, the wrong reason */
export function poorRun(s: J1State): J1State {
  measure(s, 0, 1);
  const f = s.scenario.fault;
  s.answerKind = FAULT_KINDS.find((k) => k.kind !== f.kind)!.kind;
  const room = houseLayout().parts[f.partId].room;
  const other = locationOptions().find((o) => houseLayout().parts[o.id].room !== room && o.id !== f.partId)!;
  s.answerPartId = other.id;
  s.reasoning = REASONING_CORRECT === 0 ? 1 : 0;
  return s;
}
