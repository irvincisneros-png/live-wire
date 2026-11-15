// Pure maths for the x-ray "electron" dots (no DOM, no three).
// Direction rule: dots are electrons, so they move OPPOSITE to the solver's conventional current.

/** speed (units/s) for a given |current| in amps: ∝ I at small values, soft cap, and a minimum visible speed */
export const DOT_GAIN = 0.9; // units/s per amp in the linear region
export const DOT_CAP = 2.6;
export const DOT_MIN = 0.06;
export const CURRENT_EPS = 1e-6;

export function dotSpeedMag(currentA: number): number {
  const i = Math.abs(currentA);
  if (!(i > CURRENT_EPS)) return 0;
  return Math.max(DOT_MIN, DOT_CAP * Math.tanh((i * DOT_GAIN) / DOT_CAP));
}

/**
 * Signed dot velocity along a part's path, measured in the direction a → b.
 * Conventional current a → b (> 0) means electrons travel b → a, so the velocity is negative.
 */
export function electronVelocity(currentAtoB: number): number {
  const m = dotSpeedMag(currentAtoB);
  return m === 0 ? 0 : currentAtoB > 0 ? -m : m;
}

/** energy picture: 1 = full glow (most negative point, where dots leave the − terminal), 0 = dim */
export function glowAt(v: number, vmin: number, vmax: number): number {
  const span = vmax - vmin;
  if (!(span > 1e-9)) return 0.15;
  return Math.min(1, Math.max(0, (vmax - v) / span));
}

/** potential at fraction u (0 at a, 1 at b) of a part's electrical path */
export const potentialAlong = (va: number, vb: number, u: number): number => va + (vb - va) * u;

/** whole number of dots along a path with spacing close to `spacing`, so wrap-around is seamless */
export function dotLayout(length: number, spacing: number): { count: number; spacing: number } {
  if (!(length > 1e-6)) return { count: 0, spacing };
  const count = Math.max(1, Math.round(length / spacing));
  return { count, spacing: length / count };
}

/** advance a path's phase (distance offset from a) by velocity × dt, wrapped into [0, spacing) */
export function advancePhase(phase: number, velocity: number, dt: number, spacing: number): number {
  const p = (phase + velocity * dt) % spacing;
  return p < 0 ? p + spacing : p;
}

/** distance from a of dot i */
export const dotDistance = (i: number, phase: number, spacing: number): number => phase + i * spacing;

/** energy packets per second for a component dissipating `power` watts */
export function packetRate(power: number): number {
  if (!(power > 1e-4)) return 0;
  return Math.min(14, 1.5 + 5 * Math.sqrt(power));
}
