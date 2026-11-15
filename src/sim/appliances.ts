// Household appliance data and energy maths. All figures are typical Australian values and approximate.

export type ApplianceCategory = 'heating' | 'cooling' | 'kitchen' | 'laundry' | 'entertainment' | 'lighting' | 'electronics' | 'cleaning';

export interface Appliance {
  id: string;
  name: string;
  /** power while running, watts (approximate) */
  powerW: number;
  /** typical hours of running per day (approximate) */
  hoursPerDay: number;
  /** true if it is a plain heating element, so P = V × I works directly */
  resistive: boolean;
  category: ApplianceCategory;
}

/** Example electricity price in dollars per kWh (an example figure, not a real tariff). */
export const EXAMPLE_PRICE_PER_KWH = 0.33;
/** Mains voltage used for household maths, volts. */
export const MAINS_V = 230;

/** Typical household appliances. Values are approximate; see docs/DATA-SOURCES.md. */
export const APPLIANCES: readonly Appliance[] = [
  { id: 'kettle', name: 'Electric kettle', powerW: 2200, hoursPerDay: 0.25, resistive: true, category: 'kitchen' },
  { id: 'toaster', name: 'Toaster', powerW: 900, hoursPerDay: 0.1, resistive: true, category: 'kitchen' },
  { id: 'iron', name: 'Clothes iron', powerW: 1800, hoursPerDay: 0.2, resistive: true, category: 'laundry' },
  { id: 'sandwich-press', name: 'Sandwich press', powerW: 750, hoursPerDay: 0.1, resistive: true, category: 'kitchen' },
  { id: 'room-heater', name: 'Radiant room heater', powerW: 2400, hoursPerDay: 3, resistive: true, category: 'heating' },
  { id: 'microwave', name: 'Microwave oven', powerW: 1200, hoursPerDay: 0.3, resistive: false, category: 'kitchen' },
  { id: 'fridge', name: 'Fridge (motor running)', powerW: 150, hoursPerDay: 8, resistive: false, category: 'cooling' },
  { id: 'led-tv', name: 'LED television', powerW: 100, hoursPerDay: 5, resistive: false, category: 'entertainment' },
  { id: 'laptop', name: 'Laptop', powerW: 50, hoursPerDay: 4, resistive: false, category: 'electronics' },
  { id: 'phone-charger', name: 'Phone charger', powerW: 10, hoursPerDay: 3, resistive: false, category: 'electronics' },
  { id: 'washing-machine', name: 'Washing machine', powerW: 500, hoursPerDay: 0.7, resistive: false, category: 'laundry' },
  { id: 'clothes-dryer', name: 'Clothes dryer', powerW: 2400, hoursPerDay: 0.5, resistive: false, category: 'laundry' },
  { id: 'dishwasher', name: 'Dishwasher', powerW: 1200, hoursPerDay: 1, resistive: false, category: 'kitchen' },
  { id: 'air-conditioner', name: 'Air conditioner (cooling)', powerW: 1500, hoursPerDay: 4, resistive: false, category: 'cooling' },
  { id: 'led-lamp', name: 'LED lamp', powerW: 9, hoursPerDay: 5, resistive: false, category: 'lighting' },
  { id: 'vacuum', name: 'Vacuum cleaner', powerW: 1200, hoursPerDay: 0.2, resistive: false, category: 'cleaning' },
];

/** Look up an appliance by id, or undefined. */
export function applianceById(id: string): Appliance | undefined {
  return APPLIANCES.find((a) => a.id === id);
}

/** Energy in joules: E = P × t, with P in watts and t in seconds. Example: 2200 W for 60 s = 132 000 J. */
export function energyJ(powerW: number, seconds: number): number { return powerW * seconds; }

/** Energy in kilowatt-hours: E = P ÷ 1000 × hours. Example: 2200 W for 0.5 h = 1.1 kWh. */
export function energyKWh(powerW: number, hours: number): number { return (powerW / 1000) * hours; }

/** Cost in dollars: kWh × price per kWh (default 33 c, an example price). */
export function cost(kWh: number, pricePerKWh = EXAMPLE_PRICE_PER_KWH): number { return kWh * pricePerKWh; }

/** Current in amps from P = V × I, so I = P ÷ V. Only meaningful for resistive loads (heating elements); motors and electronics differ. */
export function currentAt(powerW: number, volts = MAINS_V): number { return powerW / volts; }

// ───────────── Energy Rating labels ─────────────

export type LabelType = 'fridge' | 'tv' | 'washing-machine';

export interface EnergyLabel {
  id: string;
  type: LabelType;
  /** size class the stars are judged within, e.g. "400 L" */
  sizeLabel: string;
  /** 1 to 6 in steps of 0.5 */
  stars: number;
  /** label estimate from a standard test, kWh per year (approximate) */
  kWhPerYear: number;
}

/** Example label data in the style of the Australian Energy Rating label. Not real models; approximate. */
export const LABELS: readonly EnergyLabel[] = [
  { id: 'fridge-400-low', type: 'fridge', sizeLabel: '400 L', stars: 2.5, kWhPerYear: 560 },
  { id: 'fridge-400-high', type: 'fridge', sizeLabel: '400 L', stars: 4.0, kWhPerYear: 380 },
  { id: 'tv-55-low', type: 'tv', sizeLabel: '55 inch', stars: 2.5, kWhPerYear: 260 },
  { id: 'tv-55-high', type: 'tv', sizeLabel: '55 inch', stars: 4.5, kWhPerYear: 140 },
  { id: 'wash-7-low', type: 'washing-machine', sizeLabel: '7 kg', stars: 3.0, kWhPerYear: 190 },
  { id: 'wash-7-high', type: 'washing-machine', sizeLabel: '7 kg', stars: 4.5, kWhPerYear: 110 },
  // size trap: a small 3-star fridge uses less than a big 5-star one
  { id: 'fridge-150-small', type: 'fridge', sizeLabel: '150 L', stars: 3.0, kWhPerYear: 260 },
  { id: 'fridge-600-large', type: 'fridge', sizeLabel: '600 L', stars: 5.0, kWhPerYear: 420 },
];

/** A matched pair: same type, same size class, different stars. */
export interface LabelPair {
  type: LabelType;
  sizeLabel: string;
  /** label id with fewer stars */
  lower: string;
  /** label id with more stars */
  higher: string;
}

/** Pairs for "which uses less?" tasks. In every pair the higher-star label uses fewer kWh per year. */
export const LABEL_PAIRS: readonly LabelPair[] = [
  { type: 'fridge', sizeLabel: '400 L', lower: 'fridge-400-low', higher: 'fridge-400-high' },
  { type: 'tv', sizeLabel: '55 inch', lower: 'tv-55-low', higher: 'tv-55-high' },
  { type: 'washing-machine', sizeLabel: '7 kg', lower: 'wash-7-low', higher: 'wash-7-high' },
];

/** The two labels that show stars only compare within a size class: the 5-star one uses MORE energy. */
export const SIZE_TRAP: readonly [string, string] = ['fridge-150-small', 'fridge-600-large'];

/** Look up a label by id, or undefined. */
export function labelById(id: string): EnergyLabel | undefined {
  return LABELS.find((l) => l.id === id);
}

/** Dollars per year saved by choosing the higher-star label of a pair, at the given price. */
export function pairSavingPerYear(pair: LabelPair, pricePerKWh = EXAMPLE_PRICE_PER_KWH): number {
  const lo = labelById(pair.lower), hi = labelById(pair.higher);
  if (!lo || !hi) return NaN;
  return cost(lo.kWhPerYear - hi.kWhPerYear, pricePerKWh);
}
