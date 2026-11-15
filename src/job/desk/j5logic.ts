// Job 5 glue: UI state -> scorer input -> JobResult, and the per-hour picture the scene and chart share. Pure; no DOM.
import type { JobAnswer, JobResult } from '../../types';
import {
  BATTERY_MAX_C, TRADEOFF_CORRECT, balanceAnswer, eveningImport, sankeyFor, scoreSolar, simulateDay,
  type SolarResult, type SolarSankey,
} from '../../sim/solar';
import { parseNumber } from './maths';

export const PV_MAX_KW = 10;
export const BATTERY_MAX_KWH = 15;
/** panels drawn per kW (each about 500 W, an example size) */
export const PANELS_PER_KW = 2;
export const BATTERY_MODULE_KWH = 2.5;

export interface Attempt { pv: number; battery: number; eveningImportKWh: number; exportedKWh: number }

export interface J5State {
  pv: number;
  battery: number;
  /** the design that was last run through the day, or null if none yet */
  ran: { pv: number; battery: number } | null;
  attempts: Attempt[];
  balanceText: string;
  tradeoff: number | null;
}

export const newState = (): J5State => ({ pv: 3, battery: 5, ran: null, attempts: [], balanceText: '', tradeoff: null });

export const panelsFor = (pvKW: number) => Math.max(0, Math.round(pvKW * PANELS_PER_KW));
export const modulesFor = (batteryKWh: number) => (batteryKWh <= 0 ? 0 : Math.ceil(batteryKWh / BATTERY_MODULE_KWH - 1e-9));

/** Run the design now on the sliders and record the attempt. */
export function runDesign(st: J5State): SolarResult {
  const r = simulateDay({ pvKW: st.pv, batteryKWh: st.battery });
  st.ran = { pv: st.pv, battery: st.battery };
  st.attempts.push({ pv: st.pv, battery: st.battery, eveningImportKWh: eveningImport(r), exportedKWh: r.totals.exported });
  return r;
}

/** True if the sliders still match the design that was run. */
export const designCurrent = (st: J5State) => st.ran !== null && st.ran.pv === st.pv && st.ran.battery === st.battery;

export function finalResult(st: J5State): SolarResult | null {
  return st.ran ? simulateDay({ pvKW: st.ran.pv, batteryKWh: st.ran.battery }) : null;
}

export function sankeyOf(st: J5State): SolarSankey | null {
  const r = finalResult(st);
  return r ? sankeyFor(r) : null;
}

export const balanceTruth = (st: J5State): number | null => { const r = finalResult(st); return r ? balanceAnswer(r) : null; };

export function canSubmit(st: J5State): boolean {
  return designCurrent(st) && parseNumber(st.balanceText) !== undefined && st.tradeoff !== null;
}

/** The finished result: scored from the design that was run, with the attempts added as a recorded answer. */
export function toResult(st: J5State): JobResult {
  const ran = st.ran ?? { pv: st.pv, battery: st.battery };
  const r = scoreSolar({ pvKW: ran.pv, batteryKWh: ran.battery, balanceKWh: parseNumber(st.balanceText) ?? null, tradeoff: st.tradeoff });
  const extra: JobAnswer[] = [{
    q: 'Designs tried before submitting',
    a: st.attempts.length ? st.attempts.map((x) => `${x.pv} kW + ${x.battery} kWh`).join('; ') : 'none',
  }];
  return { ...r, answers: [...r.answers, ...extra] };
}

export interface HourFlows {
  hour: number;
  pvToHouse: number; pvToBattery: number; batteryToHouse: number; pvToGrid: number; gridToHouse: number;
  /** battery energy stored at the end of the hour, kWh */
  soc: number;
  pv: number; load: number;
}

/** The five energy flows for one hour of a simulated day (kWh in that hour). */
export function flowsAt(r: SolarResult, hour: number): HourFlows {
  const i = Math.max(0, Math.min(23, Math.floor(hour)));
  const h = r.hourly;
  return {
    hour: i, pvToHouse: h.selfUsed[i], pvToBattery: h.toBattery[i], batteryToHouse: h.fromBattery[i], pvToGrid: h.exported[i], gridToHouse: h.imported[i],
    soc: h.soc[i], pv: h.pv[i], load: h.load[i],
  };
}

/** Largest charge or discharge in one hour, kWh (0.5 C). */
export const maxBatteryStep = (batteryKWh: number) => batteryKWh * BATTERY_MAX_C;

export const TRADEOFF_RIGHT = TRADEOFF_CORRECT;

/** hour as a clock string: 0 -> "12:00 am", 13.5 -> "1:30 pm" */
export function clockText(hour: number): string {
  const hh = Math.floor(hour) % 24;
  const mm = Math.floor((hour - Math.floor(hour)) * 60);
  const ap = hh < 12 ? 'am' : 'pm';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

/** full marks: 5 kW of panels and an 8 kWh battery, answers read from the Sankey */
export function perfectState(): J5State {
  const st: J5State = { pv: 5, battery: 8, ran: null, attempts: [], balanceText: '', tradeoff: TRADEOFF_CORRECT };
  runDesign(st);
  st.balanceText = String(Number((balanceTruth(st) ?? 0).toFixed(2)));
  return st;
}

/** a poor run: no panels, no battery, wrong answers */
export function poorState(): J5State {
  const st: J5State = { pv: 0, battery: 0, ran: null, attempts: [], balanceText: '5', tradeoff: 1 };
  runDesign(st);
  return st;
}
