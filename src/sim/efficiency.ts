// Efficiency, lamp models and Sankey checks. Pure; no DOM.

/** Efficiency as a percentage: useful output ÷ total input × 100. Returns NaN if the input is not above 0. */
export function efficiency(usefulOut: number, totalIn: number): number {
  if (!(totalIn > 0) || !Number.isFinite(usefulOut)) return NaN;
  return (usefulOut / totalIn) * 100;
}

export interface Lamp {
  id: 'incandescent' | 'halogen' | 'led';
  name: string;
  /** electrical power in, watts */
  inputW: number;
  /** light out, watts (the same for every lamp, because they give the same brightness) */
  lightW: number;
  /** heat out, watts; lightW + heatW = inputW exactly */
  heatW: number;
}

/** Light output of every lamp, about 800 lumens. */
export const LAMP_LUMENS = 800;
/** Teaching figure for the light power of an 800 lm lamp, watts. Approximate. */
export const LAMP_LIGHT_W = 4.0;

const lamp = (id: Lamp['id'], name: string, inputW: number): Lamp => ({ id, name, inputW, lightW: LAMP_LIGHT_W, heatW: inputW - LAMP_LIGHT_W });

/** Three lamps with the same light output (about 800 lm). Teaching figures, approximate. */
export const LAMPS: readonly Lamp[] = [
  lamp('incandescent', 'Incandescent globe', 60),
  lamp('halogen', 'Halogen globe', 42),
  lamp('led', 'LED globe', 9),
];

/** Efficiency of a lamp as a percentage (light out ÷ electrical in). */
export function lampEfficiency(l: Lamp): number { return efficiency(l.lightW, l.inputW); }

export interface SankeyOutput { label: string; watts: number; useful: boolean }

export interface SankeyData {
  inputW: number;
  outputs: SankeyOutput[];
  usefulW: number;
  wastedW: number;
  /** useful ÷ input × 100 */
  efficiencyPct: number;
}

/** Check that outputs add up to the input (energy is conserved) and return the totals. Throws if they differ by more than 1e-9 relative. */
export function sankey(inputW: number, outputs: SankeyOutput[]): SankeyData {
  const total = outputs.reduce((s, o) => s + o.watts, 0);
  if (Math.abs(total - inputW) > 1e-9 * Math.max(1, Math.abs(inputW))) {
    throw new Error(`sankey: outputs add to ${total} but input is ${inputW}`);
  }
  const usefulW = outputs.filter((o) => o.useful).reduce((s, o) => s + o.watts, 0);
  return { inputW, outputs, usefulW, wastedW: inputW - usefulW, efficiencyPct: efficiency(usefulW, inputW) };
}

/** Sankey for a lamp: light is useful, heat is wasted. */
export function lampSankey(l: Lamp): SankeyData {
  return sankey(l.inputW, [
    { label: 'Light', watts: l.lightW, useful: true },
    { label: 'Heat', watts: l.heatW, useful: false },
  ]);
}
