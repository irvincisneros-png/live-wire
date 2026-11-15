// Shared scoring helpers for every job scorer. Pure; no DOM.
import type { JobAnswer, JobResult } from '../types';

/** Stars for a 0-100 score: 90+ gives 3, 70+ gives 2, 50+ gives 1, otherwise 0. */
export function starsFor(score: number): 0 | 1 | 2 | 3 {
  if (!Number.isFinite(score)) return 0;
  if (score >= 90) return 3;
  if (score >= 70) return 2;
  if (score >= 50) return 1;
  return 0;
}

/** Clamp and round a raw score to a whole number from 0 to 100. */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Build a JobResult: clamps the score, adds stars, keeps at most 4 lines. */
export function makeResult(score: number, lines: string[], answers: JobAnswer[]): JobResult {
  const s = clampScore(score);
  return { stars: starsFor(s), score: s, lines: lines.slice(0, 4), answers };
}
