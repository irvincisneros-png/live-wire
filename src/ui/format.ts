// Number formatting for the readout dashboard. Pure, no DOM. Does not import src/sim.

const PREFIXES: [number, string][] = [
  [1e-12, 'p'], [1e-9, 'n'], [1e-6, 'µ'], [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'M'], [1e9, 'G'],
];

export const EMPTY = '—';

/** 3 significant figures with an SI prefix: 0.5 A → "500 mA", 6 V → "6.00 V", 1500 W → "1.50 kW". */
export function formatSI(value: number | null | undefined, unit = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  if (value === 0) return `0.00${unit ? ' ' + unit : ''}`;
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  let i = 0;
  for (let k = 0; k < PREFIXES.length; k++) if (abs >= PREFIXES[k][0]) i = k;
  let num = (abs / PREFIXES[i][0]).toPrecision(3);
  // 999.7 rounds to "1.00e+3": move up a prefix instead
  if (parseFloat(num) >= 1000 && i < PREFIXES.length - 1) {
    i += 1;
    num = (abs / PREFIXES[i][0]).toPrecision(3);
  }
  if (num.includes('e')) num = parseFloat(num).toString();
  return `${sign}${num} ${PREFIXES[i][1]}${unit}`.trimEnd();
}

/** 3 significant figures in base units, for the formula lines: 6.00, 0.500, 12.0. */
export function formatBase(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  if (value === 0) return '0.00';
  const abs = Math.abs(value);
  if (abs >= 1e5 || abs < 1e-3) return value.toExponential(2).replace('e+', 'e');
  if (abs >= 1000) return String(Number(value.toPrecision(3)));
  return value.toPrecision(3);
}

export interface FormulaLine {
  /** "V = I × R → 6.00 = 0.500 × 12.0" as parts so the UI can colour the letters */
  lead: string[];
  nums: string;
  complete: boolean;
}

function line(letters: [string, string, string], op: string, vals: (number | undefined)[]): FormulaLine {
  const [a, b, c] = letters;
  const [va, vb, vc] = vals;
  const complete = [va, vb, vc].every((x) => x !== undefined && Number.isFinite(x as number));
  return {
    lead: [a, b, c],
    nums: `${formatBase(va)} = ${formatBase(vb)} ${op} ${formatBase(vc)}`,
    complete,
  };
}

export function ohmLine(r: { V?: number; I?: number; R?: number }): FormulaLine {
  return line(['V', 'I', 'R'], '×', [r.V, r.I, r.R]);
}

export function powerLine(r: { P?: number; V?: number; I?: number }): FormulaLine {
  return line(['P', 'V', 'I'], '×', [r.P, r.V, r.I]);
}
