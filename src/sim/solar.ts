// Job 5: hourly solar + battery model for one household day. Pure; no DOM.
import type { JobAnswer, JobResult } from '../types';
import { makeResult } from './score';
import { within } from './units';

/** Load in kWh for each hour of the day (hour 0 = midnight to 1 am). About 18 kWh a day with an evening peak. */
export const LOAD_KWH: readonly number[] = [
  0.35, 0.30, 0.30, 0.30, 0.35, 0.45, 0.70, 1.00, 0.85, 0.65, 0.55, 0.55,
  0.50, 0.55, 0.55, 0.65, 0.90, 1.30, 1.80, 1.80, 1.50, 1.00, 0.65, 0.45,
];

/** kWh a 1 kW panel array makes on a clear day. */
export const PV_KWH_PER_KW_DAY = 4.5;

const SUN_UP = 6, SUN_DOWN = 18;
const rawShape = Array.from({ length: 24 }, (_, h) => (h >= SUN_UP && h < SUN_DOWN ? Math.sin((Math.PI * (h + 0.5 - SUN_UP)) / (SUN_DOWN - SUN_UP)) : 0));
const shapeSum = rawShape.reduce((s, x) => s + x, 0);

/** kWh made in each hour by 1 kW of panels on a clear day: zero at night, a bell shape by day, 4.5 kWh in total. */
export const PV_KWH_PER_KW: readonly number[] = rawShape.map((x) => (x / shapeSum) * PV_KWH_PER_KW_DAY);

/** Battery round-trip efficiency, applied on charging. */
export const BATTERY_EFFICIENCY = 0.9;
/** Maximum charge or discharge rate as a fraction of capacity per hour (0.5 C). */
export const BATTERY_MAX_C = 0.5;
/** Evening hours checked by the job (5 pm to 10 pm). */
export const EVENING_HOURS: readonly number[] = [17, 18, 19, 20, 21];

export interface SolarInput { pvKW: number; batteryKWh: number }

export interface SolarHourly {
  pv: number[];
  load: number[];
  /** PV used directly by the house */
  selfUsed: number[];
  /** PV energy sent into the battery (before the loss) */
  toBattery: number[];
  /** battery energy delivered to the house */
  fromBattery: number[];
  batteryLoss: number[];
  exported: number[];
  imported: number[];
  /** energy stored in the battery at the end of the hour */
  soc: number[];
}

export interface SolarTotals {
  pv: number; load: number; selfUsed: number; toBattery: number; fromBattery: number;
  batteryLoss: number; exported: number; imported: number; batteryEnd: number;
}

export interface SolarResult { input: SolarInput; hourly: SolarHourly; totals: SolarTotals }

const clean = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

/** Run the day. PV serves the load first, extra charges the battery (10 % lost), the rest is exported; a shortfall comes from the battery, then the grid. All values in kWh. */
export function simulateDay(input: SolarInput): SolarResult {
  const pvKW = clean(input.pvKW), cap = clean(input.batteryKWh);
  const maxStep = cap * BATTERY_MAX_C;
  const h: SolarHourly = { pv: [], load: [], selfUsed: [], toBattery: [], fromBattery: [], batteryLoss: [], exported: [], imported: [], soc: [] };
  let soc = 0;
  for (let i = 0; i < 24; i++) {
    const pv = PV_KWH_PER_KW[i] * pvKW, load = LOAD_KWH[i];
    const selfUsed = Math.min(pv, load);
    const surplus = pv - selfUsed, shortfall = load - selfUsed;
    const toBattery = Math.max(0, Math.min(surplus, maxStep, (cap - soc) / BATTERY_EFFICIENCY));
    const exported = surplus - toBattery;
    const fromBattery = Math.max(0, Math.min(shortfall, soc, maxStep));
    const imported = shortfall - fromBattery;
    const loss = toBattery * (1 - BATTERY_EFFICIENCY);
    soc = Math.max(0, soc + toBattery * BATTERY_EFFICIENCY - fromBattery);
    h.pv.push(pv); h.load.push(load); h.selfUsed.push(selfUsed); h.toBattery.push(toBattery);
    h.fromBattery.push(fromBattery); h.batteryLoss.push(loss); h.exported.push(exported); h.imported.push(imported); h.soc.push(soc);
  }
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const totals: SolarTotals = {
    pv: sum(h.pv), load: sum(h.load), selfUsed: sum(h.selfUsed), toBattery: sum(h.toBattery), fromBattery: sum(h.fromBattery),
    batteryLoss: sum(h.batteryLoss), exported: sum(h.exported), imported: sum(h.imported), batteryEnd: soc,
  };
  return { input: { pvKW, batteryKWh: cap }, hourly: h, totals };
}

/** Left side of the energy balance: PV + import. Always equals load + export + loss + battery end. */
export function balanceIn(t: SolarTotals): number { return t.pv + t.imported; }
/** Right side of the energy balance: load + export + loss + battery end. */
export function balanceOut(t: SolarTotals): number { return t.load + t.exported + t.batteryLoss + t.batteryEnd; }

export interface SankeyFlow { from: string; to: string; kWh: number }
export interface SolarSankey { nodes: string[]; flows: SankeyFlow[] }

/** Flows for a Sankey diagram. Every middle node (House, Battery) has equal kWh in and out. */
export function sankeyFor(r: SolarResult): SolarSankey {
  const t = r.totals;
  const flows: SankeyFlow[] = [
    { from: 'Solar panels', to: 'House', kWh: t.selfUsed },
    { from: 'Solar panels', to: 'Battery', kWh: t.toBattery },
    { from: 'Solar panels', to: 'Grid export', kWh: t.exported },
    { from: 'Battery', to: 'House', kWh: t.fromBattery },
    { from: 'Battery', to: 'Lost as heat', kWh: t.batteryLoss },
    { from: 'Battery', to: 'Left in battery', kWh: t.batteryEnd },
    { from: 'Grid import', to: 'House', kWh: t.imported },
  ];
  const nodes = ['Solar panels', 'Grid import', 'Battery', 'House', 'Grid export', 'Lost as heat', 'Left in battery'];
  return { nodes, flows };
}

/** Grid import during the evening hours, kWh. */
export function eveningImport(r: SolarResult): number { return EVENING_HOURS.reduce((s, i) => s + r.hourly.imported[i], 0); }
/** Evening import at or below this earns full marks. */
export const EVENING_IMPORT_FULL_KWH = 2;
/** Evening import at or below this earns part marks. */
export const EVENING_IMPORT_PART_KWH = 4;
/** Exported share of PV at or below this counts as making good use of the panels. */
export const EXPORT_SHARE_LIMIT = 0.4;

/** The answer to the balance question: kWh that were not used by the house (exported + lost + left in the battery) = PV + import − load. */
export function balanceAnswer(r: SolarResult): number { return r.totals.pv + r.totals.imported - r.totals.load; }

export const TRADEOFF_OPTIONS: readonly string[] = [
  'A bigger battery stores more for the evening, but it costs more and the panels must make enough extra to fill it.',
  'A bigger battery always gives a free bill, so bigger is always better.',
  'A battery makes new energy, so it adds to the panels.',
  'Panels keep working at night if the battery is big enough.',
];
export const TRADEOFF_CORRECT = 0;

export interface SolarScoreInput {
  pvKW: number;
  batteryKWh: number;
  /** the student's answer to the balance question, kWh */
  balanceKWh: number | null;
  /** index into TRADEOFF_OPTIONS, or null */
  tradeoff: number | null;
}

/** Score Job 5: balance question = 30, evening import (25) and export share (15) = 40, trade-off question = 30. */
export function scoreSolar(input: SolarScoreInput): JobResult {
  const r = simulateDay({ pvKW: input.pvKW, batteryKWh: input.batteryKWh });
  const truth = balanceAnswer(r);
  const balOk = input.balanceKWh !== null && within(input.balanceKWh, truth, 0.05, 0.1);
  const evening = eveningImport(r);
  const eveScore = evening <= EVENING_IMPORT_FULL_KWH ? 25 : evening <= EVENING_IMPORT_PART_KWH ? 12 : 0;
  const share = r.totals.pv > 0 ? r.totals.exported / r.totals.pv : 1;
  const useScore = r.totals.pv > 0 && share <= EXPORT_SHARE_LIMIT ? 15 : 0;
  const tradeOk = input.tradeoff === TRADEOFF_CORRECT;
  const answers: JobAnswer[] = [
    { q: 'How many kWh did the house not use (exported, lost or left in the battery)?', a: input.balanceKWh === null ? 'no answer' : `${input.balanceKWh.toFixed(2)} kWh (answer ${truth.toFixed(2)} kWh)`, ok: balOk },
    { q: 'Your system', a: `${r.input.pvKW} kW panels, ${r.input.batteryKWh} kWh battery: evening import ${evening.toFixed(1)} kWh, export ${(share * 100).toFixed(0)} % of solar`, ok: eveScore === 25 && useScore === 15 },
    { q: 'What is the trade-off of a bigger battery?', a: input.tradeoff === null ? 'no answer' : TRADEOFF_OPTIONS[input.tradeoff] ?? 'no answer', ok: tradeOk },
  ];
  const lines: string[] = [];
  lines.push(balOk ? 'Your energy balance was right.' : 'Check the balance: solar + import = used + export + loss + left in the battery.');
  lines.push(eveScore === 25 ? 'Your evenings run on solar and stored energy.' : `The house still imports ${evening.toFixed(1)} kWh in the evening. Try more battery or panels.`);
  if (r.totals.pv === 0) lines.push('With no panels there is nothing to use or store.');
  else lines.push(useScore === 15 ? 'You use most of your solar energy at home.' : `You export ${(share * 100).toFixed(0)} % of your solar energy. A battery could store more of it.`);
  lines.push(tradeOk ? 'You described the battery trade-off well.' : 'A bigger battery stores more but costs more.');
  return makeResult((balOk ? 30 : 0) + eveScore + useScore + (tradeOk ? 30 : 0), lines, answers);
}
