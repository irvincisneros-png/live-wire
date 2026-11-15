import type { QualityTier } from '../types';
import type { ProgressStore } from './progress';
import type { QualityPref } from './quality';

export interface Ctx {
  progress: ProgressStore;
  version: string;
  go(route: string): void;
  quality(): QualityTier;
  qualityPref(): QualityPref;
  setQuality(pref: QualityPref): void;
}

export interface PageHandle {
  dispose(): void;
  /** stations only: switch phase without remounting */
  setPhase?(phase: import('../types').Phase): void;
}
