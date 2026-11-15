// Job 1: fault call-out. The 12 V training-house lighting circuit with one seeded fault. Pure; no DOM.
//
// Nodes (ids are fixed):
//   0 battery negative / return rail      1 battery positive      2 positive bus (after the main switch)
//   For room k = 0 (Lounge), 1 (Kitchen), 2 (Hallway), base = 3 + 4k:
//     base     switch in   (after the feed wire)
//     base + 1 switch out
//     base + 2 globe top   (after the link wire)
//     base + 3 globe bottom (before the return wire)
// Parts per room: feed wire (bus to switch in), switch, link wire, globe, return wire (globe bottom to node 0).
// Part ids: 'bat', 'main', 'sw0'..'sw2', 'g0'..'g2', 'wire-A'..'wire-I' (A,B,C = Lounge feed, link, return; D,E,F = Kitchen; G,H,I = Hallway).
//
// Fault models:
//   switch-open : the switch part is kind 'switch' with closed:false AND locked:true. A locked switch cannot be toggled, so it stays open even when the student tries to close it. The UI must respect `locked`.
//   blown-globe : the globe part has blown:true.
//   broken-wire : the wire part is removed from `parts` (its entry stays in layout.parts with missing:true so a 3D view can draw the gap).
import type { Part } from '../types';
import { meterReading, solve } from './circuit';
import { makeResult } from './score';
import { rng } from './seed';
import type { JobAnswer, JobResult } from '../types';

export type FaultKind = 'switch-open' | 'blown-globe' | 'broken-wire';

export interface Fault { kind: FaultKind; partId: string; description: string }

export interface NodeLayout { x: number; y: number; name: string }
export interface PartLayout { label: string; room: string; missing?: boolean }
export interface HouseLayout {
  /** 2D hints in grid units, x to the right and y down (screen style), roughly x 0 to 13 and y 0 to 6 */
  nodes: Record<number, NodeLayout>;
  parts: Record<string, PartLayout>;
  rooms: string[];
}

export interface FaultScenario { parts: Part[]; fault: Fault; layout: HouseLayout }

/** A voltmeter placed between two nodes (reading is V(b) - V(a)). */
export interface Measurement { a: number; b: number }

export const SUPPLY_V = 12;
export const ROOMS: readonly string[] = ['Lounge', 'Kitchen', 'Hallway'];
const LETTERS = 'ABCDEFGHI';
/** a reading must differ by more than this many volts to count as different */
export const DIFF_V = 0.5;
const GLOBE_LIT_A = 0.05;

const nodeBase = (k: number) => 3 + 4 * k;
const wireId = (i: number) => `wire-${LETTERS[i]}`;

/** The lighting circuit with every part working and every switch closed. */
export function healthyHouse(): Part[] {
  const parts: Part[] = [
    { id: 'bat', kind: 'battery', a: 0, b: 1, emf: SUPPLY_V, label: '12 V supply' },
    { id: 'main', kind: 'switch', a: 1, b: 2, closed: true, label: 'Main switch' },
  ];
  for (let k = 0; k < 3; k++) {
    const n = nodeBase(k);
    parts.push(
      { id: wireId(3 * k), kind: 'wire', a: 2, b: n, label: `Wire ${LETTERS[3 * k]}` },
      { id: `sw${k}`, kind: 'switch', a: n, b: n + 1, closed: true, label: `${ROOMS[k]} switch` },
      { id: wireId(3 * k + 1), kind: 'wire', a: n + 1, b: n + 2, label: `Wire ${LETTERS[3 * k + 1]}` },
      { id: `g${k}`, kind: 'globe', a: n + 2, b: n + 3, ratedV: SUPPLY_V, ratedW: 10, label: `${ROOMS[k]} globe` },
      { id: wireId(3 * k + 2), kind: 'wire', a: n + 3, b: 0, label: `Wire ${LETTERS[3 * k + 2]}` },
    );
  }
  return parts;
}

/** Layout hints and labels for the house. Wire ids listed in `missingId` are marked missing. */
export function houseLayout(missingId?: string): HouseLayout {
  const nodes: Record<number, NodeLayout> = {
    0: { x: 0, y: 6, name: 'Battery negative (return rail)' },
    1: { x: 0, y: 0, name: 'Battery positive' },
    2: { x: 2, y: 0, name: 'Positive bus (after main switch)' },
  };
  const parts: Record<string, PartLayout> = {
    bat: { label: '12 V supply', room: 'Switchboard' },
    main: { label: 'Main switch', room: 'Switchboard' },
  };
  for (let k = 0; k < 3; k++) {
    const n = nodeBase(k), x = 4 + 3 * k, room = ROOMS[k];
    nodes[n] = { x, y: 1, name: `${room} switch in` };
    nodes[n + 1] = { x, y: 2.5, name: `${room} switch out` };
    nodes[n + 2] = { x, y: 4, name: `${room} globe top` };
    nodes[n + 3] = { x, y: 5.5, name: `${room} globe bottom` };
    parts[wireId(3 * k)] = { label: `Wire ${LETTERS[3 * k]}`, room };
    parts[`sw${k}`] = { label: `${room} switch`, room };
    parts[wireId(3 * k + 1)] = { label: `Wire ${LETTERS[3 * k + 1]}`, room };
    parts[`g${k}`] = { label: `${room} globe`, room };
    parts[wireId(3 * k + 2)] = { label: `Wire ${LETTERS[3 * k + 2]}`, room };
  }
  if (missingId && parts[missingId]) parts[missingId].missing = true;
  return { nodes, parts, rooms: ROOMS.slice() };
}

function describe(kind: FaultKind, partId: string): string {
  const label = houseLayout().parts[partId].label;
  if (kind === 'switch-open') return `The ${label} is stuck open, so no current can pass.`;
  if (kind === 'blown-globe') return `The ${label} has a broken filament.`;
  return `${label} is broken, so there is a gap in the circuit.`;
}

/** Every fault the job can choose from (4 switches, 3 globes, 9 wires). */
export function allFaults(): Fault[] {
  const out: Fault[] = [];
  for (const id of ['main', 'sw0', 'sw1', 'sw2']) out.push({ kind: 'switch-open', partId: id, description: describe('switch-open', id) });
  for (let k = 0; k < 3; k++) out.push({ kind: 'blown-globe', partId: `g${k}`, description: describe('blown-globe', `g${k}`) });
  for (let i = 0; i < 9; i++) out.push({ kind: 'broken-wire', partId: wireId(i), description: describe('broken-wire', wireId(i)) });
  return out;
}

/** The healthy circuit with one fault put in. */
export function applyFault(fault: Fault): Part[] {
  const base = healthyHouse();
  if (fault.kind === 'broken-wire') return base.filter((p) => p.id !== fault.partId);
  return base.map((p) => {
    if (p.id !== fault.partId) return p;
    if (fault.kind === 'switch-open') return { ...p, closed: false, locked: true };
    return { ...p, blown: true };
  });
}

/** Build the call-out for a seed: the kind is chosen first (so wires do not dominate), then the part. */
export function buildScenario(seed: number): FaultScenario {
  const r = rng(seed);
  const kind = r.pick<FaultKind>(['switch-open', 'blown-globe', 'broken-wire']);
  const candidates = allFaults().filter((f) => f.kind === kind);
  const fault = r.pick(candidates);
  return { parts: applyFault(fault), fault, layout: houseLayout(fault.kind === 'broken-wire' ? fault.partId : undefined) };
}

/** Voltmeter reading V(b) - V(a) in volts for a set of parts. */
export function readVoltage(parts: Part[], m: Measurement): number {
  if (m.a === m.b) return 0;
  const vm: Part = { id: '__vm', kind: 'voltmeter', a: m.a, b: m.b };
  const sol = solve({ parts: [...parts, vm] });
  const v = meterReading(vm, sol);
  return Number.isFinite(v) ? v : NaN;
}

/** Ids of globes that are dark (current below 50 mA) in a set of parts. */
export function darkGlobes(parts: Part[]): string[] {
  const sol = solve({ parts });
  return parts.filter((p) => p.kind === 'globe').filter((p) => Math.abs(sol.parts[p.id]?.current ?? 0) < GLOBE_LIT_A).map((p) => p.id);
}

/** True if the voltmeter reads differently (by more than 0.5 V) with this fault than in the healthy house. */
export function distinguishes(fault: Fault, m: Measurement): boolean {
  return Math.abs(readVoltage(applyFault(fault), m) - readVoltage(healthyHouse(), m)) > DIFF_V;
}

/** True if the reading separates this fault from another fault that makes the same globes go dark (so the measurement narrows the search). */
export function discriminates(fault: Fault, m: Measurement): boolean {
  const mine = readVoltage(applyFault(fault), m);
  const symptom = darkGlobes(applyFault(fault)).join();
  return allFaults()
    .filter((f) => f.partId !== fault.partId && darkGlobes(applyFault(f)).join() === symptom)
    .some((f) => Math.abs(readVoltage(applyFault(f), m) - mine) > DIFF_V);
}

/** A measurement is useful if it distinguishes the fault from a healthy house or from another fault with the same symptom. A blown globe reads the same as a healthy one, so only the second test can tell it apart. */
export function isUseful(fault: Fault, m: Measurement): boolean { return distinguishes(fault, m) || discriminates(fault, m); }

export const REASONING_OPTIONS: readonly string[] = [
  'A gap has very high resistance, so almost no current flows and the full supply voltage appears across it.',
  'The gap makes voltage from nothing.',
  'Voltage only shows up where current is large.',
  'The rest of the circuit has no resistance, so the voltage must go somewhere.',
];
export const REASONING_CORRECT = 0;

export interface FaultInput {
  /** the real fault from the scenario */
  fault: Fault;
  answerKind: FaultKind | null;
  answerPartId: string | null;
  /** every measurement taken before answering */
  measurements: Measurement[];
  /** index into REASONING_OPTIONS, or null */
  reasoning: number | null;
}

/** Score Job 1: fault kind (20) and exact location (30, or 10 for the right room), a useful measurement taken (25), reasoning question (25). */
export function scoreFault(input: FaultInput): JobResult {
  const layout = houseLayout();
  const kindOk = input.answerKind === input.fault.kind;
  const exact = input.answerPartId === input.fault.partId;
  const sameRoom = !exact && input.answerPartId !== null && layout.parts[input.answerPartId]?.room === layout.parts[input.fault.partId].room;
  const useful = input.measurements.some((m) => isUseful(input.fault, m));
  const reasonOk = input.reasoning === REASONING_CORRECT;
  const answers: JobAnswer[] = [
    { q: 'What is the fault?', a: input.answerKind ?? 'no answer', ok: kindOk },
    { q: 'Where is it?', a: input.answerPartId ? layout.parts[input.answerPartId]?.label ?? input.answerPartId : 'no answer', ok: exact },
    { q: 'A measurement that tells the fault apart', a: `${input.measurements.length} taken`, ok: useful },
    { q: 'Why does a gap read almost the full voltage?', a: input.reasoning === null ? 'no answer' : REASONING_OPTIONS[input.reasoning] ?? 'no answer', ok: reasonOk },
  ];
  const lines: string[] = [];
  lines.push(kindOk && exact ? 'You named the fault and found it.' : exact ? 'You found the part but named the wrong kind of fault.' : sameRoom ? 'The right room, but not the right part. Measure across each part in that room.' : 'The fault is somewhere else. Measure across parts to find the gap.');
  lines.push(useful ? 'You took a measurement that told the fault apart.' : 'None of your measurements told the fault apart. Try a voltmeter across a part.');
  lines.push(reasonOk ? 'You explained the voltage across a gap.' : 'With every other switch closed and one gap in this circuit, almost the full supply voltage appears across the gap, because almost no current flows.');
  return makeResult((kindOk ? 20 : 0) + (exact ? 30 : sameRoom ? 10 : 0) + (useful ? 25 : 0) + (reasonOk ? 25 : 0), lines, answers);
}
