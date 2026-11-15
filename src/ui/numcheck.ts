// Number-answer checking for the Checks panel. Pure, no DOM.

/** Parse what a student typed. Accepts "0.5", "0,5", " 12 ohm", "6 V", "1e3". Returns null if it is not a number. */
export function parseNumber(input: string): number | null {
  const t = input.trim().replace(/,/g, '.').replace(/[−–]/g, '-');
  const m = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(t);
  if (!m) return null;
  const rest = t.slice(m[0].length);
  if (!/^\s*[a-zµΩ°%/·²\s]*$/i.test(rest)) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Allowed error in the same units as the answer. `tolerance` is a fraction of the answer.
 *  Answers near zero get an absolute floor of 0.005 so tiny values are not impossible to hit. */
export function allowedError(answer: number, tolerance: number): number {
  const rel = Math.abs(answer) * tolerance;
  const floor = Math.abs(answer) < 0.1 ? 0.005 : 0;
  return Math.max(rel, floor);
}

export function isAcceptable(answer: number, tolerance: number, given: number): boolean {
  return Math.abs(given - answer) <= allowedError(answer, tolerance) + 1e-9;
}

/** Feedback for a wrong answer. `wrongCount` is how many wrong tries so far (1 = first wrong).
 *  Never reveals the answer on the first two wrong tries. */
export function numberHint(answer: number, given: number | null, wrongCount: number): string {
  if (given === null) return 'Type a number, for example 2.5. Leave the unit out, it is already shown.';
  const unitSlip = answer !== 0 && given !== 0 && [1000, 0.001, 100, 0.01].some((f) => Math.abs(given / answer / f - 1) < 0.03);
  if (unitSlip) return 'You are close in digits but the size is off. Check your units: is it milli (÷1000) or kilo (×1000)?';
  if (wrongCount <= 1) return 'Not quite. Check which formula links the quantities, and the units, then have another go.';
  if (wrongCount === 2) return given > answer ? 'Still not there. Your answer is too high. Check the numbers you put in.' : 'Still not there. Your answer is too low. Check the numbers you put in.';
  return given > answer ? 'Too high again. Try "Show me how" to see the working.' : 'Too low again. Try "Show me how" to see the working.';
}
