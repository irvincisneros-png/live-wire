// Number formatting and small unit helpers. Pure; no DOM.
import { starsFor } from './score';

export { starsFor };

const PREFIX: Record<number, string> = { [-4]: 'p', [-3]: 'n', [-2]: 'µ', [-1]: 'm', 0: '', 1: 'k', 2: 'M', 3: 'G' };
/** units that already carry their own scale and never get an SI prefix */
const NO_PREFIX = new Set(['kWh', '%', 'h', 'g/kWh', 'years', 'lm', 'L', 'kg', '']);

/** Joules in one kilowatt-hour. */
export const J_PER_KWH = 3_600_000;

const DASH = '—';

/** Round to `sig` significant figures and return a plain decimal string (no exponent). */
function sigString(x: number, sig: number): string {
  if (x === 0) return '0';
  const rounded = Number(x.toPrecision(sig));
  const mag = Math.floor(Math.log10(Math.abs(rounded)));
  return rounded.toFixed(Math.max(0, sig - 1 - mag));
}

/** Format a value with 3 significant figures and an SI prefix: fmt(0.0123,'A') gives "12.3 mA". NaN or Infinity give "—". */
export function fmt(value: number, unit: string, sig = 3): string {
  if (!Number.isFinite(value)) return DASH;
  const u = unit ? ` ${unit}` : '';
  if (value === 0) return `0${u}`;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (NO_PREFIX.has(unit)) return `${sign}${sigString(abs, sig)}${u}`;
  let e = Math.max(-4, Math.min(3, Math.floor(Math.log10(abs) / 3)));
  let scaled = abs / Math.pow(10, 3 * e);
  if (Number(scaled.toPrecision(sig)) >= 1000 && e < 3) { e += 1; scaled = abs / Math.pow(10, 3 * e); }
  return `${sign}${sigString(scaled, sig)} ${PREFIX[e]}${unit}`;
}

/** Format dollars as "$1,234.50". NaN or Infinity give "—". */
export function fmtMoney(dollars: number): string {
  if (!Number.isFinite(dollars)) return DASH;
  const cents = Math.round(Math.abs(dollars) * 100);
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (cents % 100).toString().padStart(2, '0');
  return `${dollars < 0 && cents > 0 ? '-' : ''}$${whole}.${frac}`;
}

/** Convert joules to kilowatt-hours (1 kWh = 3.6 MJ). */
export function joulesToKWh(joules: number): number { return joules / J_PER_KWH; }

/** Convert kilowatt-hours to joules (1 kWh = 3.6 MJ). */
export function kWhToJoules(kWh: number): number { return kWh * J_PER_KWH; }

/** True if `value` is within `tolerance` (a fraction, 0.05 = 5 %) of `answer`; `absFloor` is the smallest allowed gap, for answers near 0. */
export function within(value: number, answer: number, tolerance: number, absFloor = 1e-6): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(answer)) return false;
  const allowed = Math.max(Math.abs(answer) * tolerance, absFloor);
  return Math.abs(value - answer) <= allowed * (1 + 1e-9);
}
