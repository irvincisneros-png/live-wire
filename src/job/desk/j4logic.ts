// Job 4 glue: UI state -> scorer input -> JobResult. Pure; no DOM.
import type { JobAnswer, JobResult } from '../../types';
import { EXAMPLE_PRICE_PER_KWH, LABELS, LABEL_PAIRS, labelById, pairSavingPerYear, type LabelPair } from '../../sim/appliances';
import {
  AUDIT_APPLIANCES, BUDGET, EXPLANATION_CORRECT, OPTIONS, applianceYearlyKWh, applyOptions, bestPlan, compatible, conflicts, optionById,
  optionsCost, scoreAudit, topUsers, yearlyCost, yearlyKWh, yearlySaving, type AuditInput,
} from '../../sim/audit';
import { within } from '../../sim/units';
import { parseNumber } from './maths';

export interface J4State {
  /** 1st, 2nd and 3rd biggest users (appliance ids) */
  top3: (string | null)[];
  /** which of the two labels the student says uses less energy */
  labelPick: string | null;
  /** raw text: dollars saved a year by choosing the better label */
  labelSavingText: string;
  chosen: string[];
  explanation: number | null;
  submitted: boolean;
}

export const newState = (): J4State => ({ top3: [null, null, null], labelPick: null, labelSavingText: '', chosen: [], explanation: null, submitted: false });

/** The label pair this attempt uses, chosen from the seed. */
export function pairFor(seed: number): LabelPair { return LABEL_PAIRS[Math.abs(Math.floor(seed)) % LABEL_PAIRS.length]; }

/** The two label ids in the order they are shown (the better one is on the left or right depending on the seed). */
export function labelOrder(seed: number): [string, string] {
  const p = pairFor(seed);
  return (Math.floor(Math.abs(seed) / LABEL_PAIRS.length) % 2 === 0) ? [p.lower, p.higher] : [p.higher, p.lower];
}

/** Put an appliance in a ranking slot; if it was in another slot it leaves that slot. */
export function setRank(top3: (string | null)[], slot: number, id: string | null): (string | null)[] {
  const next = top3.map((x) => (id !== null && x === id ? null : x));
  next[slot] = id;
  return next;
}

export function rankComplete(top3: (string | null)[]): boolean {
  return top3.length === 3 && top3.every((x) => x !== null) && new Set(top3).size === 3;
}

export type OptionBlock = null | { reason: 'conflict'; with: string } | { reason: 'budget' };

/** Why an option cannot be ticked right now (null if it can, or if it is already ticked). */
export function optionBlock(id: string, chosen: readonly string[], budget = BUDGET): OptionBlock {
  if (chosen.includes(id)) return null;
  const c = chosen.find((o) => conflicts(id, o));
  if (c) return { reason: 'conflict', with: c };
  if (optionsCost([...chosen, id]) > budget) return { reason: 'budget' };
  return null;
}

export function toggleOption(chosen: readonly string[], id: string, budget = BUDGET): string[] {
  if (chosen.includes(id)) return chosen.filter((x) => x !== id);
  if (optionBlock(id, chosen, budget)) return chosen.slice();
  return [...chosen, id];
}

export function canSubmit(st: J4State): boolean {
  return rankComplete(st.top3) && st.labelPick !== null && parseNumber(st.labelSavingText) !== undefined && st.explanation !== null && compatible(st.chosen) && optionsCost(st.chosen) <= BUDGET;
}

export function toScorerInput(st: J4State): AuditInput {
  return { top3: st.top3.filter((x): x is string => x !== null), chosen: st.chosen.slice(), budget: BUDGET, explanation: st.explanation };
}

/** The job result: the scorer's mark, with the two label answers added as recorded (unmarked) answers. */
export function toResult(st: J4State, seed: number): JobResult {
  const r = scoreAudit(toScorerInput(st));
  const pair = pairFor(seed);
  const truthSave = pairSavingPerYear(pair);
  const given = parseNumber(st.labelSavingText);
  const pickOk = st.labelPick === pair.higher;
  const saveOk = given !== undefined && within(given, truthSave, 0.05, 0.5);
  const extra: JobAnswer[] = [
    { q: `Which ${pair.sizeLabel} label uses less energy per year? (not in the score)`, a: st.labelPick ? (labelById(st.labelPick)?.stars ?? '?') + ' stars' : 'no answer', ok: pickOk },
    { q: 'Dollars saved a year by choosing it, at the example price (not in the score)', a: given === undefined ? 'no answer' : `$${given.toFixed(2)} (answer $${truthSave.toFixed(2)})`, ok: saveOk },
  ];
  return { ...r, answers: [...r.answers, ...extra] };
}

export interface RevealRow { id: string; name: string; beforeKWh: number; afterKWh: number }
export interface Reveal {
  rows: RevealRow[];
  beforeKWh: number; afterKWh: number; beforeCost: number; afterCost: number; saving: number; spend: number;
  bestSaving: number; bestIds: string[]; fraction: number;
}

/** Numbers shown after Submit: yearly kWh and cost before and after, and the saving against the best possible. */
export function revealFor(chosen: readonly string[]): Reveal {
  const after = applyOptions(chosen);
  const best = bestPlan();
  const saving = yearlySaving(chosen);
  return {
    rows: AUDIT_APPLIANCES.map((a, i) => ({ id: a.id, name: a.name, beforeKWh: applianceYearlyKWh(a), afterKWh: applianceYearlyKWh(after[i]) })),
    beforeKWh: yearlyKWh(), afterKWh: yearlyKWh(after), beforeCost: yearlyCost(), afterCost: yearlyCost(after), saving, spend: optionsCost(chosen),
    bestSaving: best.savingDollars, bestIds: best.ids, fraction: best.savingDollars > 0 ? Math.max(0, Math.min(1, saving / best.savingDollars)) : 1,
  };
}

export function perfectState(seed: number): J4State {
  const pair = pairFor(seed);
  return {
    top3: topUsers(3).map((a) => a.id),
    labelPick: pair.higher,
    labelSavingText: pairSavingPerYear(pair).toFixed(2),
    chosen: bestPlan().ids,
    explanation: EXPLANATION_CORRECT,
    submitted: false,
  };
}

export function poorState(seed: number): J4State {
  const pair = pairFor(seed);
  return {
    top3: ['washer', 'computer', 'tv'], labelPick: pair.lower, labelSavingText: '1',
    chosen: ['tv-swap'], explanation: 1, submitted: false,
  };
}

export const PRICE_NOTE = `Example price: ${Math.round(EXAMPLE_PRICE_PER_KWH * 100)} c per kWh.`;
export const ALL_LABELS = LABELS;
export const optionName = (id: string) => optionById(id).name;
export const allOptions = OPTIONS;
