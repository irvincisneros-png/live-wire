// Station 5 check data. Pure: every answer is computed from src/sim with the same numbers shown on screen.
import { EXAMPLE_PRICE_PER_KWH, LABEL_PAIRS, SIZE_TRAP, cost, energyJ, energyKWh, labelById, pairSavingPerYear, type EnergyLabel, type LabelPair } from '../../sim/appliances';
import { fmtMoney } from '../../sim/units';
import { grouped, s5Appliance, type S5Id } from './model';

const PRICE_C = Math.round(EXAMPLE_PRICE_PER_KWH * 100);

export interface EnergyTask { id: S5Id; name: string; powerW: number; seconds: number; answer: number; tolerance: number }
/** (a) joules for the toaster (resistive) at its metered power for 150 s */
export function energyTask(): EnergyTask {
  const a = s5Appliance('toaster');
  const seconds = 150;
  return { id: a.id, name: a.name, powerW: a.powerW, seconds, answer: energyJ(a.powerW, seconds), tolerance: 0.02 };
}

export interface CostTask { id: S5Id; name: string; powerW: number; hours: number; kWh: number; answer: number; tolerance: number }
/** (b) dollars to run the kettle (resistive) for 2 hours at the example price */
export function costTask(): CostTask {
  const a = s5Appliance('kettle');
  const hours = 2;
  const kWh = energyKWh(a.powerW, hours);
  return { id: a.id, name: a.name, powerW: a.powerW, hours, kWh, answer: cost(kWh), tolerance: 0.02 };
}

export interface ChoiceTask { options: string[]; correct: number; lo: EnergyLabel; hi: EnergyLabel }

const TYPE_WORD: Record<EnergyLabel['type'], string> = { fridge: 'fridge', tv: 'TV', 'washing-machine': 'washing machine' };
export const typeWord = (t: EnergyLabel['type']): string => TYPE_WORD[t];
export const starText = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1)}-star`;

/** the label pair used by check (c): the two 55 inch TVs */
export const CHECK_PAIR: LabelPair = LABEL_PAIRS.find((p) => p.type === 'tv')!;
/** the pair used in the guided steps: the two 400 L fridges */
export const GUIDED_PAIR: LabelPair = LABEL_PAIRS.find((p) => p.type === 'fridge')!;

/** (c) which of a matched pair costs less a year, and by how much (pairSavingPerYear) */
export function pairTask(pair: LabelPair = CHECK_PAIR): ChoiceTask {
  const lo = labelById(pair.lower)!, hi = labelById(pair.higher)!;
  const saving = pairSavingPerYear(pair);
  const kWhGap = lo.kWhPerYear - hi.kWhPerYear;
  const w = typeWord(pair.type);
  const options = [
    `The ${starText(lo.stars)} ${w}, about ${fmtMoney(saving)} less a year`,
    `The ${starText(hi.stars)} ${w}, about ${fmtMoney(saving)} less a year`,
    `The ${starText(hi.stars)} ${w}, about ${fmtMoney(kWhGap)} less a year`,
    'They cost the same to run, because they are the same size',
  ];
  return { options, correct: 1, lo, hi };
}

const TRAP_SMALL = labelById(SIZE_TRAP[0])!, TRAP_BIG = labelById(SIZE_TRAP[1])!;
const TIMES = Math.round(parseFloat(TRAP_BIG.sizeLabel) / parseFloat(TRAP_SMALL.sizeLabel));
const TIMES_WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six'][TIMES] ?? String(TIMES);
export const TRAP_OPTIONS = [
  'The label must be wrong: more stars always means less energy.',
  `Stars compare models of a similar size. The ${TRAP_BIG.sizeLabel} fridge is efficient for its size, but it is ${TIMES_WORD} times bigger, so it still uses more energy.`,
  'Stars show how cold a fridge gets, not how much energy it uses.',
  'The small fridge has fewer stars, so its label figure is only a guess.',
];
/** (d) the size trap */
export function trapTask(): ChoiceTask & { small: EnergyLabel; big: EnergyLabel } {
  const small = labelById(SIZE_TRAP[0])!, big = labelById(SIZE_TRAP[1])!;
  return { options: TRAP_OPTIONS, correct: 1, lo: small, hi: big, small, big };
}

/** working lines for the explanations (same numbers as the prompts) */
export function energyWorking(t: EnergyTask = energyTask()): string {
  return `E = P × t = ${grouped(t.powerW)} W × ${t.seconds} s = ${grouped(t.answer)} J.`;
}
export function costWorking(t: CostTask = costTask()): string {
  return `E = ${t.powerW / 1000} kW × ${t.hours} h = ${t.kWh} kWh. Cost = ${t.kWh} kWh × $${EXAMPLE_PRICE_PER_KWH.toFixed(2)} = ${fmtMoney(t.answer)}.`;
}
export const PRICE_LABEL = `${PRICE_C} c per kWh (example price)`;
