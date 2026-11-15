// Station 6 pure logic: lamp lookups, packet rates, thermal mapping, check answers. No DOM, no three.js.
import { LAMPS, LAMP_LUMENS, efficiency, lampEfficiency, lampSankey, type Lamp, type SankeyData } from '../../sim/efficiency';

export type LampId = Lamp['id'];
export const LAMP_IDS: LampId[] = LAMPS.map((l) => l.id);

export function lampById(id: LampId): Lamp {
  const l = LAMPS.find((x) => x.id === id);
  if (!l) throw new Error(`unknown lamp ${id}`);
  return l;
}

/** short names for buttons */
export const SHORT: Record<LampId, string> = { incandescent: 'Incandescent', halogen: 'Halogen', led: 'LED' };

/** 1 packet stands for this many joules (the scene emits watts ÷ J_PER_PACKET packets each second) */
export const J_PER_PACKET = 1;

/** packets per second for each stream of a lamp, in proportion to the sim watts */
export function packetRates(l: Lamp): { light: number; heat: number } {
  return { light: l.lightW / J_PER_PACKET, heat: l.heatW / J_PER_PACKET };
}

/** Rounded display of a percentage, 1 decimal place ("6.7"). */
export function pct1(x: number): string {
  return Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : '?';
}

/** Watts shown on screen (whole numbers, or one decimal place if needed). */
export function watts(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

/** Sankey for a lamp (throws if energy is not conserved: the sim guarantees it is). */
export function sankeyFor(id: LampId): SankeyData { return lampSankey(lampById(id)); }

/** the lamp with the highest efficiency (computed, not assumed) */
export function mostEfficient(): LampId {
  return [...LAMPS].sort((a, b) => lampEfficiency(b) - lampEfficiency(a))[0].id;
}

/** check a typed efficiency against a lamp's value. Accepts within 0.3 percentage points (rounding). */
export function efficiencyAnswerOk(id: LampId, typed: number): boolean {
  if (!Number.isFinite(typed)) return false;
  return Math.abs(typed - lampEfficiency(lampById(id))) <= 0.3;
}

/** light + heat = input, to the watt */
export function conserves(id: LampId): boolean {
  const s = sankeyFor(id);
  return Math.abs(s.outputs.reduce((a, o) => a + o.watts, 0) - s.inputW) < 1e-9;
}

// ───────────── thermal view ─────────────

/** Approximate surface temperatures (°C) at the hottest point of each lamp, for the false-colour view.
 *  Illustrative: a 60 W filament globe's glass reaches well over 100 °C, an LED's heat sink stays warm. */
export function surfaceTempC(l: Lamp): number {
  // the hottest surface scales with the heat given off; anchor 22 °C room, about 3 °C per watt of heat
  return 22 + l.heatW * 3.1;
}

export const THERMAL_MIN_C = 15;
export const THERMAL_MAX_C = 200;

/** temperature to the 0..1 position on the colour scale */
export function thermalT(c: number): number {
  return Math.min(1, Math.max(0, (c - THERMAL_MIN_C) / (THERMAL_MAX_C - THERMAL_MIN_C)));
}

/** "iron" false-colour palette stops (position 0..1, sRGB hex) shared by the shader and the legend */
export const IRON: [number, string][] = [
  [0.0, '#0a0828'], [0.05, '#191566'], [0.14, '#3a0f78'], [0.28, '#7a0f8c'], [0.45, '#c8244e'], [0.62, '#f05a14'], [0.8, '#fbb023'], [0.93, '#fde98a'], [1.0, '#ffffff'],
];

/** labelled ticks on the legend, °C */
export const LEGEND_TICKS = [20, 50, 100, 150, 200];

// ───────────── checks ─────────────

export const WHERE_OPTIONS = [
  'It is destroyed inside the globe, so it no longer exists.',
  'It spreads into the surroundings as heat. It still exists, but it is not the light we wanted.',
  'It goes back into the power point as electricity.',
  'It is used up making the light brighter.',
];
export const WHERE_CORRECT = 1;

export const IMPROVE_OPTIONS = [
  'Bike: let some air out of the tyres so the ride feels softer.',
  'Bike: oil the chain so less energy becomes heat and sound from friction.',
  'Hot water: heat the water hotter so it is still warm at the tap.',
  'Lamp: swap a 9 W LED globe for a 42 W halogen globe.',
];
export const IMPROVE_CORRECT = 1;

/** the four check answers, computed from the sim */
export function checkAnswers(): { haloEff: number; incWaste: number } {
  const halo = lampById('halogen'), inc = lampById('incandescent');
  return { haloEff: efficiency(halo.lightW, halo.inputW), incWaste: inc.inputW - inc.lightW };
}

export { LAMPS, LAMP_LUMENS, lampEfficiency };
export type { Lamp, SankeyData };
