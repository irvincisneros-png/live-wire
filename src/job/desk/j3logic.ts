// Job 3 glue: UI state -> scorer input -> JobResult. Pure; no DOM.
import type { JobAnswer, JobResult } from '../../types';
import {
  BOARD_APPLIANCES, CIRCUIT_LIMIT_A, applianceCurrent, mainIds, planCurrents, planRuns, scorePowerBoard, trips,
  type CircuitSlot, type Plan, type PowerBoardInput,
} from '../../sim/powerboard';
import { parseNumber } from './maths';

export type Slot = 'A' | 'B' | 'off';

export interface J3State {
  /** raw text the student typed for each main appliance */
  currentsText: Record<string, string>;
  explanation: number | null;
  /** where each appliance was put (missing = not placed yet) */
  assign: Record<string, Slot | undefined>;
  /** how many times the plan was run, and whether the last run was of the plan as it now stands */
  runs: number;
  ranCurrent: boolean;
  tripped: boolean;
  /** true once the student has watched the board trip */
  sawTrip: boolean;
}

export const newState = (): J3State => ({ currentsText: {}, explanation: null, assign: {}, runs: 0, ranCurrent: false, tripped: false, sawTrip: false });

const SLOT_NUM: Record<Slot, CircuitSlot> = { off: 0, A: 1, B: 2 };

/** Circuit A is circuit 1 and circuit B is circuit 2 in the scorer. Unplaced appliances count as left off. */
export function toPlan(assign: Record<string, Slot | undefined>): Plan {
  const plan: Plan = {};
  for (const a of BOARD_APPLIANCES) plan[a.id] = SLOT_NUM[assign[a.id] ?? 'off'];
  return plan;
}

export function currentsFromText(text: Record<string, string>): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  for (const id of mainIds()) out[id] = parseNumber(text[id]);
  return out;
}

export function currentsComplete(text: Record<string, string>): boolean {
  return mainIds().every((id) => parseNumber(text[id]) !== undefined);
}

/** Every main appliance has been put on Circuit A, Circuit B or left off on purpose. */
export function planComplete(assign: Record<string, Slot | undefined>): boolean {
  return mainIds().every((id) => assign[id] !== undefined);
}

export function toScorerInput(st: J3State): PowerBoardInput {
  return { currents: currentsFromText(st.currentsText), explanation: st.explanation, plan: toPlan(st.assign) };
}

export interface RunOutcome { a: number; b: number; tripA: boolean; tripB: boolean; held: boolean }

/** What the animation will show when the plan is run. */
export function runOutcome(assign: Record<string, Slot | undefined>): RunOutcome {
  const plan = toPlan(assign);
  const [a, b] = planCurrents(plan);
  const tripA = trips(a, CIRCUIT_LIMIT_A), tripB = trips(b, CIRCUIT_LIMIT_A);
  return { a, b, tripA, tripB, held: planRuns(plan) };
}

/** The finished result. The scorer decides the mark; the number of plan runs is added as an extra recorded answer. */
export function toResult(st: J3State): JobResult {
  const r = scorePowerBoard(toScorerInput(st));
  const extra: JobAnswer[] = [{ q: 'Times the plan was run before submitting', a: String(st.runs) }];
  return { ...r, answers: [...r.answers, ...extra] };
}

export const canSubmit = (st: J3State) => currentsComplete(st.currentsText) && st.explanation !== null && planComplete(st.assign) && st.runs > 0 && st.ranCurrent;

/** a full-marks run */
export function perfectState(): J3State {
  const text: Record<string, string> = {};
  for (const id of mainIds()) text[id] = applianceCurrent(id).toFixed(2);
  return {
    currentsText: text, explanation: 0,
    assign: { heater: 'A', 'sandwich-press': 'A', kettle: 'B', toaster: 'B', iron: 'off', 'phone-charger': 'off', lamp: 'off' },
    runs: 1, ranCurrent: true, tripped: false, sawTrip: true,
  };
}

/** a poor run: wrong currents, wrong explanation, everything on one circuit */
export function poorState(): J3State {
  const text: Record<string, string> = {};
  for (const id of mainIds()) text[id] = '2';
  return {
    currentsText: text, explanation: 1,
    assign: { heater: 'A', kettle: 'A', toaster: 'A', iron: 'A', 'sandwich-press': 'A', 'phone-charger': 'A', lamp: 'A' },
    runs: 1, ranCurrent: true, tripped: true, sawTrip: true,
  };
}
