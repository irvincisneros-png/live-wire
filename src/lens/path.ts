// The loop the deep zoom is built on: a flat stadium (two straights, two half circles) in the XZ plane.
// Pure maths, no three.js. s is distance along the loop in the direction the dots (electrons) travel.
import type { LoopLayout } from './model';

export interface LoopShape {
  /** half length of each straight */
  a: number;
  /** radius of the end half circles */
  r: number;
  /** height of the loop */
  y: number;
}

export const SHAPE: LoopShape = { a: 3.8, r: 2.2, y: 2 };
/** radius of the ordinary copper wire */
export const WIRE_R = 0.45;

export function loopLength(sh: LoopShape = SHAPE): number {
  return 4 * sh.a + 2 * Math.PI * sh.r;
}

/** point and unit tangent at s. Front straight (z = +r) runs +x, right end turns back, back straight (z = −r) runs −x. */
export function pointAt(s: number, out: { p: [number, number, number]; t: [number, number, number] }, sh: LoopShape = SHAPE): typeof out {
  const { a, r, y } = sh;
  const L = loopLength(sh);
  let u = s % L; if (u < 0) u += L;
  const S1 = 2 * a, S2 = S1 + Math.PI * r, S3 = S2 + 2 * a;
  if (u < S1) { out.p = [-a + u, y, r]; out.t = [1, 0, 0]; }
  else if (u < S2) { const th = (u - S1) / r; out.p = [a + r * Math.sin(th), y, r * Math.cos(th)]; out.t = [Math.cos(th), 0, -Math.sin(th)]; }
  else if (u < S3) { out.p = [a - (u - S2), y, -r]; out.t = [-1, 0, 0]; }
  else { const th = (u - S3) / r; out.p = [-a - r * Math.sin(th), y, -r * Math.cos(th)]; out.t = [-Math.cos(th), 0, Math.sin(th)]; }
  return out;
}

/** s of a point on the front straight at x (front straight runs from x = −a to x = +a) */
export const frontS = (x: number, sh: LoopShape = SHAPE) => x + sh.a;
/** s of a point on the back straight at x */
export const backS = (x: number, sh: LoopShape = SHAPE) => 2 * sh.a + Math.PI * sh.r + (sh.a - x);

/** where each featured region sits on the loop */
export function makeLayout(sh: LoopShape = SHAPE): LoopLayout & { neckX: number; batteryX: [number, number]; gapX: [number, number]; gateX: number } {
  const neckX = 0.6, neckHalf = 1.15;
  const batteryX: [number, number] = [3.3, 0.3]; // + end, − end (dots travel −x on the back straight)
  const gapX: [number, number] = [-0.6, -1.2];
  const gateX = -2.4;
  return {
    length: loopLength(sh),
    batteryIn: backS(batteryX[0], sh), batteryOut: backS(batteryX[1], sh),
    gapStart: backS(gapX[0], sh), gapEnd: backS(gapX[1], sh),
    neckStart: frontS(neckX - neckHalf, sh), neckEnd: frontS(neckX + neckHalf, sh),
    gate: frontS(gateX, sh),
    neckX, batteryX, gapX, gateX,
  };
}

/** neck blend weight (0 = ordinary wire, 1 = full neck) with a smooth taper either side */
export const NECK_TAPER = 0.4;
export function neckWeight(s: number, L: LoopLayout): number {
  const ss = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  return Math.min(ss((s - (L.neckStart - NECK_TAPER)) / NECK_TAPER), ss(((L.neckEnd + NECK_TAPER) - s) / NECK_TAPER));
}
