// Job 4: energy audit. Fixed household dataset, fixed upgrade options, exhaustive best plan. Pure; no DOM.
import type { JobAnswer, JobResult } from '../types';
import { EXAMPLE_PRICE_PER_KWH, cost } from './appliances';
import { makeResult } from './score';

export interface AuditAppliance {
  id: string;
  name: string;
  /** power while running, watts (approximate) */
  powerW: number;
  hoursPerDay: number;
}

/** Ten household appliances. Typical, approximate figures. */
export const AUDIT_APPLIANCES: readonly AuditAppliance[] = [
  { id: 'hot-water', name: 'Electric hot water', powerW: 3600, hoursPerDay: 3 },
  { id: 'air-con', name: 'Air conditioner', powerW: 1500, hoursPerDay: 4 },
  { id: 'heater', name: 'Room heater', powerW: 2400, hoursPerDay: 2 },
  { id: 'second-fridge', name: 'Old second fridge', powerW: 200, hoursPerDay: 9 },
  { id: 'downlights', name: '6 halogen downlights', powerW: 300, hoursPerDay: 5 },
  { id: 'fridge', name: 'Kitchen fridge', powerW: 150, hoursPerDay: 8 },
  { id: 'dryer', name: 'Clothes dryer', powerW: 2400, hoursPerDay: 0.5 },
  { id: 'tv', name: 'Old television', powerW: 150, hoursPerDay: 5 },
  { id: 'computer', name: 'Desktop computer', powerW: 200, hoursPerDay: 4 },
  { id: 'washer', name: 'Washing machine', powerW: 500, hoursPerDay: 0.7 },
];

/** Money the student may spend on upgrades, dollars. */
export const BUDGET = 1000;

export interface AuditOption {
  id: string;
  name: string;
  /** dollars to do it */
  costDollars: number;
  /** the one appliance it changes */
  applianceId: string;
  /** new power in watts, if it changes power */
  power?: number;
  /** new hours per day, if it changes hours */
  hours?: number;
  /** ids of options that cannot be combined with this one */
  excludes?: string[];
}

/** Eight changes. Two options that change the same thing of the same appliance cannot be combined; options that change different things (power and hours) combine. */
export const OPTIONS: readonly AuditOption[] = [
  { id: 'led-downlights', name: 'Swap 6 halogen downlights for LEDs', costDollars: 180, applianceId: 'downlights', power: 42 },
  { id: 'second-fridge-off', name: 'Turn off the old second fridge', costDollars: 0, applianceId: 'second-fridge', hours: 0, excludes: ['second-fridge-swap'] },
  { id: 'second-fridge-swap', name: 'Swap the old second fridge for a 5-star one', costDollars: 650, applianceId: 'second-fridge', power: 80, excludes: ['second-fridge-off'] },
  { id: 'heat-pump', name: 'Heat-pump hot water', costDollars: 3200, applianceId: 'hot-water', power: 1000 },
  { id: 'short-showers', name: 'Shorter showers (4 minutes)', costDollars: 0, applianceId: 'hot-water', hours: 2.4 },
  { id: 'tv-swap', name: 'Swap the old TV for a 5-star one', costDollars: 500, applianceId: 'tv', power: 60 },
  { id: 'draughts', name: 'Seal draughts around doors and windows', costDollars: 250, applianceId: 'heater', hours: 1.4 },
  { id: 'aircon-24', name: 'Set the air conditioner to 24 °C', costDollars: 0, applianceId: 'air-con', hours: 3 },
];

/** Yearly energy of one appliance in kWh (365 days). */
export function applianceYearlyKWh(a: AuditAppliance): number { return (a.powerW / 1000) * a.hoursPerDay * 365; }

/** Total yearly energy of a list (default: the whole dataset), kWh. */
export function yearlyKWh(items: readonly AuditAppliance[] = AUDIT_APPLIANCES): number {
  return items.reduce((s, a) => s + applianceYearlyKWh(a), 0);
}

/** Total yearly cost of a list (default: the whole dataset), dollars at the example price. */
export function yearlyCost(items: readonly AuditAppliance[] = AUDIT_APPLIANCES, price = EXAMPLE_PRICE_PER_KWH): number {
  return cost(yearlyKWh(items), price);
}

/** The n biggest energy users, biggest first (ties broken by id). */
export function topUsers(n: number, items: readonly AuditAppliance[] = AUDIT_APPLIANCES): AuditAppliance[] {
  return items.slice().sort((a, b) => applianceYearlyKWh(b) - applianceYearlyKWh(a) || a.id.localeCompare(b.id)).slice(0, n);
}

/** Look up an option by id. */
export function optionById(id: string): AuditOption {
  const o = OPTIONS.find((x) => x.id === id);
  if (!o) throw new Error(`unknown option ${id}`);
  return o;
}

/** True if two different options cannot be chosen together (listed as excluding each other, or both change the same thing of the same appliance). */
export function conflicts(aId: string, bId: string): boolean {
  if (aId === bId) return false;
  const a = optionById(aId), b = optionById(bId);
  if (a.excludes?.includes(b.id) || b.excludes?.includes(a.id)) return true;
  if (a.applianceId !== b.applianceId) return false;
  return (a.power !== undefined && b.power !== undefined) || (a.hours !== undefined && b.hours !== undefined);
}

/** True if no two chosen options conflict and there are no repeats or unknown ids. */
export function compatible(ids: readonly string[]): boolean {
  if (new Set(ids).size !== ids.length) return false;
  if (ids.some((id) => !OPTIONS.some((o) => o.id === id))) return false;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (conflicts(ids[i], ids[j])) return false;
  return true;
}

/** Total cost of chosen options, dollars. */
export function optionsCost(ids: readonly string[]): number { return ids.reduce((s, id) => s + optionById(id).costDollars, 0); }

/** The dataset after the chosen options are applied. Power changes and hours changes on the same appliance combine. Throws if the options conflict. */
export function applyOptions(ids: readonly string[]): AuditAppliance[] {
  if (!compatible(ids)) throw new Error('applyOptions: options conflict or are unknown');
  return AUDIT_APPLIANCES.map((a) => {
    let powerW = a.powerW, hoursPerDay = a.hoursPerDay;
    for (const id of ids) {
      const o = optionById(id);
      if (o.applianceId !== a.id) continue;
      if (o.power !== undefined) powerW = o.power;
      if (o.hours !== undefined) hoursPerDay = o.hours;
    }
    return { ...a, powerW, hoursPerDay };
  });
}

/** Dollars saved per year by the chosen options (0 for none). */
export function yearlySaving(ids: readonly string[], price = EXAMPLE_PRICE_PER_KWH): number {
  return yearlyCost(AUDIT_APPLIANCES, price) - yearlyCost(applyOptions(ids), price);
}

export interface PlanChoice { ids: string[]; costDollars: number; savingDollars: number }

/** The best set of options within the budget, found by trying every subset. Ties go to the cheaper set, then the smaller one. */
export function bestPlan(budget = BUDGET, price = EXAMPLE_PRICE_PER_KWH): PlanChoice {
  const n = OPTIONS.length;
  let best: PlanChoice = { ids: [], costDollars: 0, savingDollars: 0 };
  for (let mask = 1; mask < 1 << n; mask++) {
    const ids = OPTIONS.filter((_, i) => mask & (1 << i)).map((o) => o.id);
    const c = optionsCost(ids);
    if (c > budget || !compatible(ids)) continue;
    const s = yearlySaving(ids, price);
    const better = s > best.savingDollars + 1e-9
      || (Math.abs(s - best.savingDollars) <= 1e-9 && (c < best.costDollars || (c === best.costDollars && ids.length < best.ids.length)));
    if (better) best = { ids, costDollars: c, savingDollars: s };
  }
  return best;
}

export const EXPLANATION_OPTIONS: readonly string[] = [
  'More of the electrical energy becomes light and less is lost as heat, so it needs fewer watts for the same brightness.',
  'It makes extra energy from nothing.',
  'It uses up the electrons more slowly.',
  'It is cooler because it has a lower voltage rating.',
];
export const EXPLANATION_CORRECT = 0;

export interface AuditInput {
  /** appliance ids, biggest user first */
  top3: string[];
  /** chosen option ids */
  chosen: string[];
  budget?: number;
  /** index into EXPLANATION_OPTIONS, or null */
  explanation: number | null;
}

/** Score Job 4: top three = 30 (6 for each correct one, 4 for each correct place), saving ÷ best possible saving × 50, explanation = 20. */
export function scoreAudit(input: AuditInput): JobResult {
  const budget = input.budget ?? BUDGET;
  const truth = topUsers(3).map((a) => a.id);
  let topScore = 0, members = 0;
  truth.forEach((id, i) => {
    if (input.top3.includes(id)) { topScore += 6; members++; }
    if (input.top3[i] === id) topScore += 4;
  });
  const best = bestPlan(budget);
  const valid = compatible(input.chosen) && optionsCost(input.chosen) <= budget;
  const saving = valid ? yearlySaving(input.chosen) : 0;
  const frac = best.savingDollars > 0 ? Math.max(0, Math.min(1, saving / best.savingDollars)) : 1;
  const planScore = frac * 50;
  const explainOk = input.explanation === EXPLANATION_CORRECT;

  const answers: JobAnswer[] = [
    { q: 'Top three energy users', a: input.top3.length ? input.top3.join(', ') : 'no answer', ok: topScore === 30 },
    { q: 'Upgrades chosen', a: input.chosen.length ? `${input.chosen.join(', ')} ($${optionsCost(input.chosen)}, saves $${saving.toFixed(0)} a year)` : 'none', ok: frac >= 0.999 },
    { q: 'Why does an LED use less energy for the same light?', a: input.explanation === null ? 'no answer' : EXPLANATION_OPTIONS[input.explanation] ?? 'no answer', ok: explainOk },
  ];
  const lines: string[] = [];
  lines.push(members === 3 ? (topScore === 30 ? 'You found the top three users in the right order.' : 'You found the top three users but not in the right order.') : `You found ${members} of the top 3. Compare power × hours for each.`);
  if (!compatible(input.chosen)) lines.push('Some of your changes cannot be combined.');
  else if (optionsCost(input.chosen) > budget) lines.push('Your plan went over budget.');
  else lines.push(`Your plan saves $${saving.toFixed(0)} a year. The best plan saves $${best.savingDollars.toFixed(0)}.`);
  lines.push(explainOk ? 'You explained efficiency correctly.' : 'An efficient device wastes less of its input as heat.');
  return makeResult(topScore + planScore + (explainOk ? 20 : 0), lines, answers);
}
