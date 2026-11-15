// Job 3: the tripping power board. Desk job with real household numbers, no wiring. Pure; no DOM.
import type { JobAnswer, JobResult } from '../types';
import { MAINS_V, currentAt } from './appliances';
import { makeResult } from './score';
import { within } from './units';

export const BOARD_LIMIT_A = 10;
export const CIRCUIT_LIMIT_A = 16;
/** the plan only counts if at least this many of the five main appliances are running */
export const MIN_RUNNING = 4;

export interface BoardAppliance {
  id: string;
  name: string;
  powerW: number;
  /** main = one of the five heating appliances the student works out; small = an extra small load, treated as P = V × I here */
  group: 'main' | 'small';
}

export const BOARD_APPLIANCES: readonly BoardAppliance[] = [
  { id: 'heater', name: 'Room heater', powerW: 2400, group: 'main' },
  { id: 'kettle', name: 'Kettle', powerW: 2200, group: 'main' },
  { id: 'toaster', name: 'Toaster', powerW: 900, group: 'main' },
  { id: 'iron', name: 'Iron', powerW: 1800, group: 'main' },
  { id: 'sandwich-press', name: 'Sandwich press', powerW: 750, group: 'main' },
  { id: 'phone-charger', name: 'Phone charger', powerW: 10, group: 'small' },
  { id: 'lamp', name: 'Lamp', powerW: 12, group: 'small' },
];

const MAIN_IDS = BOARD_APPLIANCES.filter((a) => a.group === 'main').map((a) => a.id);

/** Ids of the five main appliances. */
export function mainIds(): string[] { return MAIN_IDS.slice(); }

/** Look up a board appliance by id. */
export function boardAppliance(id: string): BoardAppliance {
  const a = BOARD_APPLIANCES.find((x) => x.id === id);
  if (!a) throw new Error(`unknown board appliance ${id}`);
  return a;
}

/** Current of one appliance at 230 V in amps: I = P ÷ V. Example: kettle 2200 W gives 9.57 A. */
export function applianceCurrent(id: string): number { return currentAt(boardAppliance(id).powerW, MAINS_V); }

/** Total current of appliances all running together (parallel, so currents add), amps. Example: heater + kettle = 20.0 A. */
export function boardCurrent(applianceIds: string[]): number {
  return currentAt(applianceIds.reduce((s, id) => s + boardAppliance(id).powerW, 0), MAINS_V);
}

/** True if the current is above the limit, so the breaker or cut-out opens. Exactly at the limit does not trip. */
export function trips(currentA: number, limitA: number): boolean { return currentA > limitA + 1e-9; }

/** 0 = not running, 1 = on circuit 1, 2 = on circuit 2. */
export type CircuitSlot = 0 | 1 | 2;
export type Plan = Record<string, CircuitSlot>;

/** Currents on circuit 1 and circuit 2 for a plan, amps. */
export function planCurrents(plan: Plan): [number, number] {
  const on = (c: CircuitSlot) => Object.keys(plan).filter((id) => plan[id] === c);
  return [boardCurrent(on(1)), boardCurrent(on(2))];
}

/** Number of main appliances running in the plan. */
export function mainRunning(plan: Plan): number { return MAIN_IDS.filter((id) => (plan[id] ?? 0) !== 0).length; }

/** True if neither 16 A circuit trips and at least four main appliances run. */
export function planRuns(plan: Plan): boolean {
  const [c1, c2] = planCurrents(plan);
  return !trips(c1, CIRCUIT_LIMIT_A) && !trips(c2, CIRCUIT_LIMIT_A) && mainRunning(plan) >= MIN_RUNNING;
}

/** Why did the board trip? The choices shown to the student, in order. */
export const EXPLANATION_OPTIONS: readonly string[] = [
  'Together the appliances drew more current than the 10 A cut-out allows.',
  'The power board ran out of electricity.',
  'The voltage dropped to zero when too many plugs were in.',
  'Each appliance used up some of the charge in the wires.',
];
export const EXPLANATION_CORRECT = 0;

export interface PowerBoardInput {
  /** the student's current for each main appliance, amps (missing = not answered) */
  currents: Record<string, number | undefined>;
  /** index into EXPLANATION_OPTIONS, or null */
  explanation: number | null;
  plan: Plan;
}

/** Score Job 3: currents within 5 % = 40 (8 each), explanation = 20, a plan that runs without a trip = 40. */
export function scorePowerBoard(input: PowerBoardInput): JobResult {
  const answers: JobAnswer[] = [];
  let right = 0;
  for (const id of MAIN_IDS) {
    const a = boardAppliance(id);
    const truth = applianceCurrent(id);
    const given = input.currents[id];
    const ok = given !== undefined && within(given, truth, 0.05);
    if (ok) right++;
    answers.push({ q: `Current of the ${a.name.toLowerCase()} (I = P ÷ V)`, a: given === undefined || !Number.isFinite(given) ? 'no answer' : `${given.toFixed(2)} A (answer ${truth.toFixed(2)} A)`, ok });
  }
  const explainOk = input.explanation === EXPLANATION_CORRECT;
  answers.push({ q: 'Why did the board trip?', a: input.explanation === null ? 'no answer' : EXPLANATION_OPTIONS[input.explanation] ?? 'no answer', ok: explainOk });
  const [c1, c2] = planCurrents(input.plan);
  const running = mainRunning(input.plan);
  const runs = planRuns(input.plan);
  answers.push({ q: 'Plan on two 16 A circuits', a: `Circuit 1: ${c1.toFixed(1)} A, circuit 2: ${c2.toFixed(1)} A, ${running} of 5 main appliances on`, ok: runs });

  const score = right * 8 + (explainOk ? 20 : 0) + (runs ? 40 : 0);
  const lines: string[] = [];
  lines.push(right === 5 ? 'All five currents were right.' : `${right} of 5 currents were within 5 %. Use I = P ÷ V with V = 230.`);
  lines.push(explainOk ? 'You explained the trip correctly: too much current.' : 'The board trips when the total current is above its limit.');
  if (runs) lines.push('Your plan ran with no trip.');
  else if (trips(c1, CIRCUIT_LIMIT_A) || trips(c2, CIRCUIT_LIMIT_A)) lines.push('One circuit went over 16 A and tripped. Move an appliance to the other circuit.');
  else lines.push(`Your plan was safe but ran only ${running} main appliances. Aim for at least ${MIN_RUNNING}.`);
  return makeResult(score, lines, answers);
}
