// The deep-zoom lens model. Pure: no DOM, no three.js. Everything the lens draws comes from here,
// so the picture and the readouts can never disagree.

export const LENS_V_MAX = 12;
export const LENS_V_MIN = 0;
export const LENS_R_MIN = 4;
export const LENS_R_MAX = 40;
/** path units per second of dot drift for each amp (drift speed is proportional to current) */
export const DRIFT_PER_AMP = 1.1;
/** each energy packet stands for this many joules */
export const JOULES_PER_PACKET = 1;

export interface LensInput {
  /** battery voltage, 0 to 12 V */
  volts: number;
  /** resistor value, ohms */
  ohms: number;
  /** switch closed (conducting) */
  closed: boolean;
}

export interface LensReadings {
  /** battery voltage (V) */
  V: number;
  /** voltage across the resistor (V): equals the battery voltage when current flows, 0 when the switch is open */
  VR: number;
  /** voltage across the switch gap (V): the full battery voltage when open */
  Vgap: number;
  /** current everywhere in the loop (A) */
  I: number;
  /** resistor (Ω) */
  R: number;
  /** power in the resistor (W) */
  P: number;
  /** energy given out by the resistor since the last reset (J) */
  E: number;
  closed: boolean;
  /** dot drift speed along the wire (path units per second) */
  drift: number;
  /** energy picture (0 to 1): glow of a dot arriving at the resistor */
  glowBefore: number;
  /** energy picture (0 to 1): glow of a dot leaving the resistor */
  glowAfter: number;
  /** energy packets per second leaving the resistor */
  packetRate: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const finite = (x: number, d: number) => (Number.isFinite(x) ? x : d);

/** the steady-state values for one setting (no energy tally) */
export function solveLens(inp: LensInput): Omit<LensReadings, 'E'> {
  const V = clamp(finite(inp.volts, 0), LENS_V_MIN, LENS_V_MAX);
  const R = clamp(finite(inp.ohms, LENS_R_MIN), 0.1, 1e6);
  const closed = !!inp.closed;
  const I = closed ? V / R : 0;
  const VR = I * R;
  const P = VR * I;
  const g = V / LENS_V_MAX;
  return {
    V, VR, Vgap: closed ? 0 : V, I, R, P, closed,
    drift: DRIFT_PER_AMP * I,
    // with the switch open the resistor sits after the gap, so dots on both sides of it are dim
    glowBefore: closed ? g : 0,
    glowAfter: 0,
    packetRate: P / JOULES_PER_PACKET,
  };
}

export interface LensModel {
  readonly input: Readonly<LensInput>;
  set(patch: Partial<LensInput>): void;
  /** advance sim time; integrates the energy tally */
  step(dt: number): void;
  readings(): LensReadings;
  resetEnergy(): void;
  /** energy given out so far (J) */
  readonly energy: number;
}

export function createLensModel(init: Partial<LensInput> = {}): LensModel {
  const input: LensInput = { volts: 6, ohms: 12, closed: false, ...init };
  let E = 0;
  return {
    get input() { return input; },
    set(patch) { Object.assign(input, patch); },
    step(dt) {
      const d = clamp(finite(dt, 0), 0, 0.25);
      E += solveLens(input).P * d;
    },
    readings() { return { ...solveLens(input), E }; },
    resetEnergy() { E = 0; },
    get energy() { return E; },
  };
}

// ───────────── the energy picture along the loop ─────────────

/** Positions along the loop, in path units, measured in the direction the dots travel. */
export interface LoopLayout {
  length: number;
  /** + end of the battery: dots arrive here dim */
  batteryIn: number;
  /** − end of the battery: dots leave here bright */
  batteryOut: number;
  /** the switch's moving bridge spans gapStart → gapEnd (hinged at gapStart) */
  gapStart: number;
  gapEnd: number;
  /** thin resistor stretch */
  neckStart: number;
  neckEnd: number;
  /** counter gate */
  gate: number;
}

/** distance travelled from the battery's − end to s, in [0, length) */
export function fromOut(s: number, L: LoopLayout): number {
  const d = (s - L.batteryOut) % L.length;
  return d < 0 ? d + L.length : d;
}

/**
 * Glow (energy picture, 0..1) of a dot at path position s. Full leaving the − end, steady along the wire,
 * dropping across the resistor (or across the open switch gap), dim back to the + end, raised again inside the battery.
 */
export function glowAt(s: number, L: LoopLayout, volts: number, closed: boolean): number {
  const g = clamp(volts / LENS_V_MAX, 0, 1);
  const d = fromOut(s, L);
  const inn = fromOut(L.batteryIn, L);
  if (d >= inn) return g * ((d - inn) / (L.length - inn));
  if (!closed) return d <= fromOut(L.gapEnd, L) ? g : 0;
  const a = fromOut(L.neckStart, L), b = fromOut(L.neckEnd, L);
  if (d <= a) return g;
  if (d >= b) return 0;
  return g * (1 - (d - a) / (b - a));
}

/** neck (resistor stretch) radius for a resistance: thinner wire = more resistance (R ∝ 1/area) */
export function neckRadius(ohms: number): number {
  return clamp(0.62 / Math.sqrt(Math.max(0.1, ohms)), 0.1, 0.31);
}

/** visual heat (0..1) of the resistor's atoms for a power in watts */
export function heatFor(P: number): number {
  return 1 - Math.exp(-Math.max(0, P) / 5);
}
