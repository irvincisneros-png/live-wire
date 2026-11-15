// Station 7 pure logic: chain ordering, table sorting, renewable sort, computed check questions. No DOM, no three.js.
import { OMITTED_NOTE, SOURCES, hasTurbine, midpoint, renewableIds, sourceById, type GenSource, type SourceId } from '../../sim/sources';

export const SOURCE_IDS: SourceId[] = SOURCES.map((s) => s.id);
export const SHORT: Record<SourceId, string> = { coal: 'Coal', gas: 'Gas', hydro: 'Hydro', wind: 'Wind', solar: 'Solar' };

// ───────────── energy forms ─────────────

/** colour and short label for each form of energy in the chains (always shown with the word, never by colour alone) */
export const FORM_STYLE: Record<string, { colour: string; label: string }> = {
  chemical: { colour: '#b48cff', label: 'Chemical' },
  thermal: { colour: '#ff7043', label: 'Thermal' },
  kinetic: { colour: '#5fd39b', label: 'Kinetic' },
  'gravitational potential': { colour: '#6f8dff', label: 'Gravitational' },
  light: { colour: '#fff27a', label: 'Light' },
  electrical: { colour: '#56c8ff', label: 'Electrical' },
};

export function formStyle(form: string): { colour: string; label: string } {
  return FORM_STYLE[form] ?? { colour: '#cccccc', label: form.charAt(0).toUpperCase() + form.slice(1) };
}

/** a chain step as one chip label, e.g. "Thermal: Boiler" */
export function chipLabel(s: { form: string; device: string }): string {
  return `${formStyle(s.form).label}: ${s.device}`;
}

// ───────────── chain ordering (check task) ─────────────

/** stable ids for a source's chain steps ("coal-0" …) */
export function chainIds(src: GenSource): string[] { return src.chain.map((_, i) => `${src.id}-${i}`); }

/** true when `order` lists every step of the source's chain exactly once, in the sim's order */
export function chainOrderCorrect(order: readonly string[], src: GenSource): boolean {
  const want = chainIds(src);
  return order.length === want.length && order.every((id, i) => id === want[i]);
}

/** how many steps from the start are already in the right place */
export function chainPrefixRight(order: readonly string[], src: GenSource): number {
  const want = chainIds(src);
  let n = 0;
  while (n < order.length && n < want.length && order[n] === want[n]) n++;
  return n;
}

/** deterministic shuffle that never returns the solved order (so the task is never pre-solved) */
export function scrambled(ids: readonly string[], seed = 7): string[] {
  const out = [...ids];
  let x = seed;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.every((v, i) => v === ids[i]) && out.length > 1) out.push(out.shift()!);
  return out;
}

// ───────────── comparison table ─────────────

export type MeasureKey = 'efficiency' | 'capacity' | 'cost' | 'build' | 'co2' | 'dispatch';

export interface Measure {
  key: MeasureKey;
  label: string;
  unit: string;
  /** a value for sorting; better is not implied */
  value(s: GenSource): number;
  /** the text shown in the table */
  text(s: GenSource): string;
  /** which way is "better" for the sort: high values first or low values first */
  best: 'high' | 'low';
  /** one-line definition */
  def: string;
}

const range = (r: readonly [number, number], unit: string) => `${r[0]} to ${r[1]}${unit}`;

export const MEASURES: Measure[] = [
  {
    key: 'efficiency', label: 'Conversion efficiency', unit: '%', best: 'high',
    value: (s) => midpoint(s.efficiencyPct), text: (s) => range(s.efficiencyPct, ' %'),
    def: 'How much of the energy in the fuel, water, wind or sunlight becomes electricity. The rest is wasted, mostly as heat.',
  },
  {
    key: 'capacity', label: 'Capacity factor', unit: '%', best: 'high',
    value: (s) => midpoint(s.capacityFactorPct), text: (s) => range(s.capacityFactorPct, ' %'),
    def: 'How much electricity a plant makes in a year, compared with running flat out all year. Low if it often has no wind or sun, or is only switched on at busy times.',
  },
  {
    key: 'cost', label: 'Cost of new power', unit: 'band', best: 'low',
    value: (s) => s.costBand, text: (s) => `${'$'.repeat(s.costBand)} (${s.costBand} of 5)`,
    def: 'How dear electricity from a newly built plant is, from 1 (cheapest) to 5 (dearest). Wind and solar are shown before the cost of storage or backup.',
  },
  {
    key: 'build', label: 'Time to build', unit: 'years', best: 'low',
    value: (s) => midpoint(s.buildYears), text: (s) => range(s.buildYears, ' years'),
    def: 'Typical years to plan and build a new plant.',
  },
  {
    key: 'co2', label: 'Operating CO2', unit: 'g/kWh', best: 'low',
    value: (s) => s.co2gPerKWh, text: (s) => `${s.co2gPerKWh} g/kWh`,
    def: 'Carbon dioxide given off at the power station for each kilowatt-hour of electricity. Building any plant adds a little more.',
  },
  {
    key: 'dispatch', label: 'Runs on demand', unit: '', best: 'high',
    value: (s) => (s.dispatchable ? 1 : 0), text: (s) => (s.dispatchable ? 'Yes' : 'No'),
    def: 'Whether the output can be turned up when people need more power, without storage.',
  },
];

export function measureByKey(k: MeasureKey): Measure {
  const m = MEASURES.find((x) => x.key === k);
  if (!m) throw new Error(`unknown measure ${k}`);
  return m;
}

/** sources sorted by a measure, best first (ties keep the turntable order) */
export function sortedBy(k: MeasureKey, dir: 'best' | 'worst' = 'best'): GenSource[] {
  const m = measureByKey(k);
  const sign = (m.best === 'high' ? -1 : 1) * (dir === 'best' ? 1 : -1);
  return [...SOURCES].map((s, i) => ({ s, i })).sort((a, b) => sign * (m.value(a.s) - m.value(b.s)) || a.i - b.i).map((x) => x.s);
}

// ───────────── renewable sort ─────────────

export type Bin = 'renewable' | 'non-renewable';

/** ids placed in the wrong bin (unplaced ids are not counted as wrong) */
export function wrongPlacements(placed: Partial<Record<SourceId, Bin>>): SourceId[] {
  return SOURCE_IDS.filter((id) => placed[id] !== undefined && (placed[id] === 'renewable') !== sourceById(id).renewable);
}

export function sortComplete(placed: Partial<Record<SourceId, Bin>>): boolean {
  return SOURCE_IDS.every((id) => placed[id] !== undefined) && wrongPlacements(placed).length === 0;
}

// ───────────── computed check questions ─────────────

/** the device shared by every chain that goes through a turbine */
export function commonDevice(): string {
  const turb = SOURCES.filter(hasTurbine);
  const sets = turb.map((s) => new Set(s.chain.map((c) => c.device)));
  const common = [...sets[0]].filter((d) => sets.every((x) => x.has(d)));
  if (common.length !== 1) throw new Error('expected exactly one shared device');
  return common[0];
}

export interface ChoiceQ { prompt: string; options: string[]; correct: number; explain: string }

export function commonPartQuestion(): ChoiceQ {
  const dev = commonDevice();
  const options = ['Boiler', `${dev} (a spinning coil and magnets)`, 'Solar cell', 'Combustion chamber'];
  return {
    prompt: 'Coal, gas, hydro and wind power stations all use one part to make their electricity. Which part?',
    options, correct: 1,
    explain: `Each of them spins a turbine, and the turbine turns a ${dev.toLowerCase()}: magnets spinning past coils of wire. Solar PV is the only one that makes electricity with no ${dev.toLowerCase()}.`,
  };
}

/** a table question: which source has the highest capacity factor (read from SOURCES) */
export function tableQuestion(): ChoiceQ {
  const m = measureByKey('capacity');
  const top = sortedBy('capacity')[0];
  const options = SOURCES.map((s) => s.name);
  return {
    prompt: `Use the comparison table. Which source has the highest ${m.label.toLowerCase()}?`,
    options, correct: SOURCES.indexOf(top),
    explain: `${top.name} has a capacity factor of about ${m.text(top)}, the highest of the five. That means it makes power for more of the year. It says nothing about how efficient it is (${measureByKey('efficiency').text(top)}).`,
  };
}

/** evaluate: power on a still night with no storage and no river; picks the quickest-to-build source that runs on demand */
export function evaluateQuestion(): ChoiceQ {
  const order: SourceId[] = ['solar', 'wind', 'gas', 'coal'];
  const pool = order.map(sourceById);
  const candidates = pool.filter((s) => s.dispatchable);
  const best = [...candidates].sort((a, b) => midpoint(a.buildYears) - midpoint(b.buildYears))[0];
  const coal = sourceById('coal'), solar = sourceById('solar'), wind = sourceById('wind');
  const options = [
    `More ${solar.name.toLowerCase()} panels, because they are the cheapest new power.`,
    `More ${wind.name.toLowerCase()} turbines, because the wind is free.`,
    'A gas turbine power station, because it starts within minutes, even though it burns fuel and gives off CO2.',
    `A new ${coal.name.toLowerCase()} plant, because it runs day and night.`,
  ];
  return {
    prompt: 'A town gets its power from wind and solar farms, with no batteries and no river for hydro. On still nights it needs extra power for a few hours at the evening peak. Which is the best thing to add?',
    options, correct: order.indexOf(best.id),
    explain: `Solar makes nothing at night and wind makes nothing when it is still, so the town needs a source that runs on demand. A gas turbine takes about ${best.buildYears[0]} to ${best.buildYears[1]} years to build and starts within minutes. Coal also runs on demand but takes ${coal.buildYears[0]} to ${coal.buildYears[1]} years to build, gives off the most CO2 and is slow to start. The gas turbine's CO2 is the cost of having power on demand.`,
  };
}

// ───────────── energy flow numbers for the side Sankey ─────────────

/** where the energy that does not become electricity goes, per source */
export const WASTE_NOTE: Record<SourceId, string> = {
  coal: 'mostly heat, in warm cooling water and hot flue gas',
  gas: 'mostly heat, in the hot exhaust gas',
  hydro: 'heat and sound from friction in the water and machines',
  wind: 'wind that passes by the blades, and heat in the machines',
  solar: 'heat in the panel and light it reflects',
};

/** For 100 J of energy in, how much becomes electricity (midpoint of the efficiency range) and how much is wasted */
export function flowPer100(src: GenSource): { electrical: number; wasted: number } {
  const e = midpoint(src.efficiencyPct);
  return { electrical: e, wasted: 100 - e };
}

export { OMITTED_NOTE, SOURCES, renewableIds, sourceById, hasTurbine, midpoint };
export type { GenSource, SourceId };
