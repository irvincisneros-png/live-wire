// Small DOM-free helpers shared by jobs 3, 4 and 5. Pure; no DOM, no three.

/** Parse what a student typed into a number box. Accepts decimals, a decimal comma and stray spaces; anything else is undefined. */
export function parseNumber(text: string | null | undefined): number | undefined {
  if (text === null || text === undefined) return undefined;
  const t = text.trim().replace(/\s+/g, '').replace(',', '.');
  if (t === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Evaluate a plain arithmetic expression for the notepad calculator: numbers, + - * / x × ÷, brackets and powers of ten are not needed.
 * Returns undefined for anything it cannot read (it never uses eval).
 */
export function evalExpression(src: string): number | undefined {
  const s = src.replace(/×|x|X/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s+/g, '');
  if (!s) return undefined;
  let i = 0;
  const peek = () => s[i];
  function num(): number {
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) throw new Error('number');
    i += m[0].length;
    return Number(m[0]);
  }
  function factor(): number {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error('bracket');
      i++;
      return v;
    }
    return num();
  }
  function term(): number {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return undefined;
    return v;
  } catch { return undefined; }
}

/** 1.234 -> "1.23" style: trims trailing zeros after rounding to `dp` places. */
export function trimNum(x: number, dp = 2): string {
  if (!Number.isFinite(x)) return '0';
  return String(Number(x.toFixed(dp)));
}

/** Smooth 0..1 step between a and b. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
