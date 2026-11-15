// Progress store. localStorage key `livewire.v1`, every access guarded, in-memory fallback.
import type { JobAnswer, JobResult, Progress } from '../types';
import type { QualityPref } from './quality';

export const STORAGE_KEY = 'livewire.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredJob {
  result: JobResult;
  /** ISO date-time of the attempt */
  date: string;
  seed: number;
  version: string;
}

export interface JobRecord {
  best: StoredJob;
  latest: StoredJob;
}

export interface SaveData {
  v: 1;
  tickets: string[];
  checks: Record<string, string[]>;
  jobs: Record<string, JobRecord>;
  quality: QualityPref;
  name: string;
}

export function emptyData(): SaveData {
  return { v: 1, tickets: [], checks: {}, jobs: {}, quality: 'auto', name: '' };
}

const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function cleanAnswer(x: unknown): JobAnswer | null {
  if (!isObj(x) || !isStr(x.q) || !isStr(x.a)) return null;
  const a: JobAnswer = { q: x.q, a: x.a };
  if (typeof x.ok === 'boolean') a.ok = x.ok;
  return a;
}

function cleanStored(x: unknown): StoredJob | null {
  if (!isObj(x) || !isObj(x.result)) return null;
  const r = x.result;
  if (!isNum(r.score) || !isNum(r.stars) || !Array.isArray(r.lines) || !Array.isArray(r.answers)) return null;
  const stars = Math.max(0, Math.min(3, Math.round(r.stars))) as 0 | 1 | 2 | 3;
  return {
    result: {
      stars,
      score: Math.max(0, Math.min(100, r.score)),
      lines: r.lines.filter(isStr),
      answers: r.answers.map(cleanAnswer).filter((a): a is JobAnswer => a !== null),
    },
    date: isStr(x.date) ? x.date : '',
    seed: isNum(x.seed) ? x.seed : 0,
    version: isStr(x.version) ? x.version : '',
  };
}

/** Turn whatever was in storage into a valid SaveData (never throws). */
export function sanitize(raw: unknown): SaveData {
  const d = emptyData();
  if (!isObj(raw)) return d;
  if (Array.isArray(raw.tickets)) d.tickets = [...new Set(raw.tickets.filter(isStr))];
  if (isObj(raw.checks)) {
    for (const [k, v] of Object.entries(raw.checks)) if (Array.isArray(v)) d.checks[k] = [...new Set(v.filter(isStr))];
  }
  if (isObj(raw.jobs)) {
    for (const [k, v] of Object.entries(raw.jobs)) {
      if (!isObj(v)) continue;
      const best = cleanStored(v.best);
      const latest = cleanStored(v.latest) ?? best;
      if (best && latest) d.jobs[k] = { best, latest };
    }
  }
  if (raw.quality === 'auto' || raw.quality === 'low' || raw.quality === 'medium' || raw.quality === 'high') d.quality = raw.quality;
  if (isStr(raw.name)) d.name = raw.name.slice(0, 80);
  return d;
}

export class ProgressStore implements Progress {
  private data: SaveData;
  /** true while writes to real storage are succeeding */
  persistent = false;
  private listeners = new Set<() => void>();

  constructor(private storage: StorageLike | null) {
    this.data = emptyData();
    this.load();
  }

  private load(): void {
    if (!this.storage) return;
    try {
      const txt = this.storage.getItem(STORAGE_KEY);
      if (txt) this.data = sanitize(JSON.parse(txt));
      this.persistent = true;
    } catch {
      this.data = emptyData();
      this.persistent = false;
    }
  }

  private save(): void {
    if (this.storage) {
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        this.persistent = true;
      } catch {
        this.persistent = false;
      }
    }
    for (const cb of this.listeners) {
      try { cb(); } catch { /* a listener must not break saving */ }
    }
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ── Progress interface ──
  hasTicket(ticket: string): boolean {
    return this.data.tickets.includes(ticket);
  }
  checkPassed(stationId: string, taskId: string): boolean {
    return (this.data.checks[stationId] ?? []).includes(taskId);
  }
  jobResult(jobId: string): JobResult | null {
    return this.data.jobs[jobId]?.best.result ?? null;
  }

  // ── writes ──
  awardTicket(ticket: string): void {
    if (this.hasTicket(ticket)) return;
    this.data.tickets.push(ticket);
    this.save();
  }
  passCheck(stationId: string, taskId: string): void {
    if (this.checkPassed(stationId, taskId)) return;
    (this.data.checks[stationId] ??= []).push(taskId);
    this.save();
  }
  /** Stores an attempt. Keeps the best (highest score; a tie keeps the earlier one) and the latest. */
  recordJob(jobId: string, result: JobResult, seed: number, version: string, now: Date = new Date()): { newBest: boolean } {
    const entry: StoredJob = { result, date: now.toISOString(), seed, version };
    const prev = this.data.jobs[jobId];
    const newBest = !prev || result.score > prev.best.result.score;
    this.data.jobs[jobId] = { best: newBest ? entry : prev.best, latest: entry };
    this.save();
    return { newBest };
  }
  jobRecord(jobId: string): JobRecord | null {
    return this.data.jobs[jobId] ?? null;
  }
  jobStars(jobId: string): number {
    return this.data.jobs[jobId]?.best.result.stars ?? 0;
  }
  totalStars(jobIds: string[]): number {
    return jobIds.reduce((n, id) => n + this.jobStars(id), 0);
  }
  getQuality(): QualityPref {
    return this.data.quality;
  }
  setQuality(q: QualityPref): void {
    this.data.quality = q;
    this.save();
  }
  getName(): string {
    return this.data.name;
  }
  setName(n: string): void {
    this.data.name = n.slice(0, 80);
    this.save();
  }
  /** Clears tickets, checks and job results. Keeps the quality setting and the name. */
  clearResults(): void {
    this.data.tickets = [];
    this.data.checks = {};
    this.data.jobs = {};
    this.save();
  }
  snapshot(): SaveData {
    return JSON.parse(JSON.stringify(this.data)) as SaveData;
  }
}

/** The real localStorage if it works, else null (the store then keeps everything in memory). */
export function browserStorage(): StorageLike | null {
  try {
    const ls = window.localStorage;
    const probe = '__livewire_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}
