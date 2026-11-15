// Quality tier selection. autoTier is pure; readEnv/resolveQuality touch the browser.
import type { QualityTier } from '../types';

export type QualityPref = 'auto' | QualityTier;

export interface Env {
  deviceMemory?: number;
  cores?: number;
  width: number;
  height: number;
  dpr: number;
  reducedMotion: boolean;
  coarse?: boolean;
}

export function autoTier(e: Env): QualityTier {
  let pts = 0;
  const mem = e.deviceMemory ?? 0;
  if (mem >= 8) pts += 2; else if (mem >= 4) pts += 1; else if (mem > 0 && mem <= 2) pts -= 2;
  const c = e.cores ?? 0;
  if (c >= 8) pts += 2; else if (c >= 6) pts += 1; else if (c > 0 && c <= 2) pts -= 2; else if (c > 0 && c <= 4) pts -= 1;
  if (e.width * e.height * e.dpr * e.dpr > 4.5e6) pts -= 1;
  if (e.width < 700 || e.coarse) pts -= 1;
  if (e.reducedMotion) pts -= 1;
  return pts >= 3 ? 'high' : pts >= 0 ? 'medium' : 'low';
}

export function readEnv(): Env {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mq = (q: string): boolean => {
    try { return window.matchMedia(q).matches; } catch { return false; }
  };
  return {
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    width: window.screen?.width || window.innerWidth,
    height: window.screen?.height || window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    coarse: mq('(pointer: coarse)'),
  };
}

export function resolveQuality(pref: QualityPref): QualityTier {
  return pref === 'auto' ? autoTier(readEnv()) : pref;
}
