// Electricity generation sources. All figures are typical, rounded and approximate (docs/DATA-SOURCES.md).

export type SourceId = 'coal' | 'gas' | 'hydro' | 'wind' | 'solar';

export interface ChainStep {
  /** the form of energy at this step, e.g. "chemical" */
  form: string;
  /** the thing that holds the energy, or makes the change into this form from the step before */
  device: string;
}

export interface GenSource {
  id: SourceId;
  name: string;
  renewable: boolean;
  /** ordered energy transformations, first step is the energy store, last step is electrical */
  chain: ChainStep[];
  /** typical conversion efficiency range, percent: how much of the energy in the fuel or flow becomes electricity */
  efficiencyPct: [number, number];
  /** typical capacity factor range, percent: the energy a plant really produces in a year as a fraction of what it would produce at full power all year */
  capacityFactorPct: [number, number];
  /** relative cost of new-build electricity, 1 = lowest, 5 = highest (before the cost of backup) */
  costBand: 1 | 2 | 3 | 4 | 5;
  costNote: string;
  /** typical time to build a new plant, years */
  buildYears: [number, number];
  /** operating carbon dioxide, grams per kWh, rounded (building the plant adds a little for every source) */
  co2gPerKWh: number;
  /** can be turned up on demand */
  dispatchable: boolean;
  advantage: string;
  disadvantage: string;
}

/** Sources not covered by Live Wire. They are left out on purpose, not forgotten. */
export const OMITTED: string[] = ['nuclear', 'geothermal', 'biomass'];

export const OMITTED_NOTE = 'Nuclear, geothermal and biomass are real sources too. Live Wire leaves them out to keep the comparison short.';

/** The five sources, in the order used on the turntable. */
export const SOURCES: readonly GenSource[] = [
  {
    id: 'coal', name: 'Black coal', renewable: false,
    chain: [
      { form: 'chemical', device: 'Coal' },
      { form: 'thermal', device: 'Boiler' },
      { form: 'kinetic', device: 'Steam turbine' },
      { form: 'electrical', device: 'Generator' },
    ],
    efficiencyPct: [30, 40], capacityFactorPct: [60, 80], costBand: 5,
    costNote: 'New coal plants are expensive to build and take a long time.',
    buildYears: [5, 10], co2gPerKWh: 900, dispatchable: true,
    advantage: 'It runs day and night and can be turned up when needed.',
    disadvantage: 'It gives off the most carbon dioxide and the coal runs out.',
  },
  {
    id: 'gas', name: 'Gas (gas turbine)', renewable: false,
    chain: [
      { form: 'chemical', device: 'Natural gas' },
      { form: 'thermal', device: 'Combustion chamber' },
      { form: 'kinetic', device: 'Gas turbine' },
      { form: 'electrical', device: 'Generator' },
    ],
    efficiencyPct: [30, 40], capacityFactorPct: [5, 15], costBand: 4,
    costNote: 'Cheap to build but the fuel is costly, so power from it is dear.',
    buildYears: [2, 4], co2gPerKWh: 600, dispatchable: true,
    advantage: 'It starts within minutes, so it covers the busy evening peak.',
    disadvantage: 'It burns a fuel that runs out and gives off carbon dioxide. (A combined-cycle plant is more efficient, at about 50 to 60 %.)',
  },
  {
    id: 'hydro', name: 'Hydro', renewable: true,
    chain: [
      { form: 'gravitational potential', device: 'Water in the dam' },
      { form: 'kinetic', device: 'Water turbine' },
      { form: 'electrical', device: 'Generator' },
    ],
    efficiencyPct: [85, 95], capacityFactorPct: [20, 40], costBand: 4,
    costNote: 'Dams are costly and good sites are rare, but the plant lasts for decades.',
    buildYears: [6, 12], co2gPerKWh: 0, dispatchable: true,
    advantage: 'It can start fast and has very high efficiency.',
    disadvantage: 'Few good sites are left, it floods land and it depends on rainfall.',
  },
  {
    id: 'wind', name: 'Wind', renewable: true,
    chain: [
      { form: 'kinetic', device: 'Moving air' },
      { form: 'kinetic', device: 'Turbine blades' },
      { form: 'electrical', device: 'Generator' },
    ],
    efficiencyPct: [35, 45], capacityFactorPct: [30, 45], costBand: 2,
    costNote: 'Low cost to build, but it needs backup for calm days.',
    buildYears: [1, 3], co2gPerKWh: 0, dispatchable: false,
    advantage: 'The wind is free and the farm is quick to build.',
    disadvantage: 'It only makes power when the wind blows.',
  },
  {
    id: 'solar', name: 'Solar PV', renewable: true,
    chain: [
      { form: 'light', device: 'Sunlight' },
      { form: 'electrical', device: 'Solar cell' },
    ],
    efficiencyPct: [15, 22], capacityFactorPct: [20, 30], costBand: 1,
    costNote: 'The cheapest new power to build, but it needs storage for the night.',
    buildYears: [1, 2], co2gPerKWh: 0, dispatchable: false,
    advantage: 'It has no moving parts and can go on suitable roofs.',
    disadvantage: 'It makes nothing at night and less on cloudy days.',
  },
];

/** Look up a source by id. */
export function sourceById(id: SourceId): GenSource {
  const s = SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown source ${id}`);
  return s;
}

/** The middle of a [low, high] range. */
export function midpoint(range: readonly [number, number]): number { return (range[0] + range[1]) / 2; }

/** True if the chain passes through a turbine and generator (everything except solar PV). */
export function hasTurbine(s: GenSource): boolean { return s.chain.some((c) => /turbine/i.test(c.device)); }

/** Ids of renewable sources. */
export function renewableIds(): SourceId[] { return SOURCES.filter((s) => s.renewable).map((s) => s.id); }
