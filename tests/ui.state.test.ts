import { describe, expect, it } from 'vitest';
import type { JobResult } from '../src/types';
import { ProgressStore, STORAGE_KEY, sanitize } from '../src/ui/progress';
import type { StorageLike } from '../src/ui/progress';
import { autoTier } from '../src/ui/quality';
import { parseRoute, routeHash, routeKey } from '../src/ui/route';

function fakeStorage(init: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}
const throwing: StorageLike = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};
const result = (score: number, stars: 0 | 1 | 2 | 3 = 1): JobResult => ({ score, stars, lines: ['a', 'b'], answers: [{ q: 'q', a: 'a', ok: true }] });

describe('progress store', () => {
  it('stores and reloads tickets, checks, quality and name', () => {
    const st = fakeStorage();
    const p = new ProgressStore(st);
    p.awardTicket('Circuits');
    p.awardTicket('Circuits');
    p.passCheck('s1', 'a');
    p.setQuality('low');
    p.setName('Sam');
    const q = new ProgressStore(st);
    expect(q.hasTicket('Circuits')).toBe(true);
    expect(q.snapshot().tickets).toEqual(['Circuits']);
    expect(q.checkPassed('s1', 'a')).toBe(true);
    expect(q.checkPassed('s1', 'b')).toBe(false);
    expect(q.getQuality()).toBe('low');
    expect(q.getName()).toBe('Sam');
    expect(q.persistent).toBe(true);
  });

  it('keeps the best and the latest job result', () => {
    const p = new ProgressStore(fakeStorage());
    expect(p.recordJob('j1', result(80, 2), 11, '0.1.0').newBest).toBe(true);
    expect(p.recordJob('j1', result(60, 1), 22, '0.1.0').newBest).toBe(false);
    expect(p.recordJob('j1', result(80, 2), 33, '0.1.0').newBest).toBe(false);
    const rec = p.jobRecord('j1')!;
    expect(rec.best.seed).toBe(11);
    expect(rec.latest.seed).toBe(33);
    expect(p.jobResult('j1')!.score).toBe(80);
    expect(p.jobResult('j2')).toBeNull();
    p.recordJob('j2', result(95, 3), 1, '0.1.0');
    expect(p.totalStars(['j1', 'j2', 'j3'])).toBe(5);
    expect(rec.best.version).toBe('0.1.0');
    expect(rec.best.date).toMatch(/^\d{4}-/);
  });

  it('works with storage that throws', () => {
    const p = new ProgressStore(throwing);
    expect(p.persistent).toBe(false);
    expect(() => p.awardTicket('Ohm')).not.toThrow();
    expect(p.hasTicket('Ohm')).toBe(true);
    p.recordJob('j3', result(70, 2), 5, 'v');
    expect(p.jobResult('j3')!.stars).toBe(2);
    expect(p.persistent).toBe(false);
  });

  it('works with no storage at all', () => {
    const p = new ProgressStore(null);
    p.passCheck('s0', 'x');
    expect(p.checkPassed('s0', 'x')).toBe(true);
  });

  it('survives corrupt or hostile stored data', () => {
    for (const bad of ['not json', '[]', '{"tickets":5,"jobs":{"j1":3},"quality":"ultra"}', 'null']) {
      const p = new ProgressStore(fakeStorage({ [STORAGE_KEY]: bad }));
      expect(p.hasTicket('x')).toBe(false);
      expect(p.getQuality()).toBe('auto');
      expect(p.jobResult('j1')).toBeNull();
    }
    const d = sanitize({ jobs: { j1: { best: { result: { score: 500, stars: 9, lines: ['x', 1], answers: [{ q: 'a' }, { q: 'q', a: 'a', ok: false }] }, date: 3, seed: 'x' } } } });
    expect(d.jobs.j1.best.result.score).toBe(100);
    expect(d.jobs.j1.best.result.stars).toBe(3);
    expect(d.jobs.j1.best.result.lines).toEqual(['x']);
    expect(d.jobs.j1.best.result.answers).toHaveLength(1);
  });

  it('clearResults keeps name and quality', () => {
    const st = fakeStorage();
    const p = new ProgressStore(st);
    p.awardTicket('Power'); p.passCheck('s5', 'a'); p.recordJob('j1', result(50), 1, 'v'); p.setName('Kai'); p.setQuality('high');
    p.clearResults();
    const q = new ProgressStore(st);
    expect(q.hasTicket('Power')).toBe(false);
    expect(q.jobResult('j1')).toBeNull();
    expect(q.getName()).toBe('Kai');
    expect(q.getQuality()).toBe('high');
  });
});

describe('routes', () => {
  it('parses every documented route', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#home')).toEqual({ name: 'home' });
    expect(parseRoute('#s0')).toEqual({ name: 'station', id: 's0', phase: 'guided' });
    expect(parseRoute('#s3/free')).toEqual({ name: 'station', id: 's3', phase: 'free' });
    expect(parseRoute('#s3/checks')).toEqual({ name: 'station', id: 's3', phase: 'checks' });
    expect(parseRoute('#s7/bogus')).toEqual({ name: 'station', id: 's7', phase: 'guided' });
    expect(parseRoute('#job')).toEqual({ name: 'board' });
    expect(parseRoute('#job/j2')).toEqual({ name: 'job', id: 'j2' });
    expect(parseRoute('#job/j9')).toEqual({ name: 'board' });
    expect(parseRoute('#jobsheet')).toEqual({ name: 'jobsheet' });
    expect(parseRoute('#about')).toEqual({ name: 'about' });
  });
  it('sends unknown routes home', () => {
    expect(parseRoute('#s9')).toEqual({ name: 'home' });
    expect(parseRoute('#nonsense/xx')).toEqual({ name: 'home' });
    expect(parseRoute('#/s1')).toEqual({ name: 'station', id: 's1', phase: 'guided' });
  });
  it('round-trips and keys phases to the same station', () => {
    for (const h of ['#home', '#s2', '#s2/free', '#s2/checks', '#job', '#job/j4', '#jobsheet', '#about']) {
      expect(routeHash(parseRoute(h))).toBe(h);
    }
    expect(routeKey(parseRoute('#s2'))).toBe(routeKey(parseRoute('#s2/checks')));
    expect(routeKey(parseRoute('#s2'))).not.toBe(routeKey(parseRoute('#s3')));
  });
});

describe('quality heuristic', () => {
  const base = { width: 1440, height: 900, dpr: 2, reducedMotion: false };
  it('picks tiers from the machine', () => {
    expect(autoTier({ ...base, deviceMemory: 8, cores: 10 })).toBe('high');
    expect(autoTier({ ...base, deviceMemory: 4, cores: 4 })).toBe('low');
    expect(autoTier({ ...base, deviceMemory: 2, cores: 2 })).toBe('low');
    expect(autoTier({ width: 1366, height: 768, dpr: 1, reducedMotion: false, deviceMemory: 4, cores: 4 })).toBe('medium');
  });
  it('is one step lower for reduced motion and for phones', () => {
    const e = { width: 1920, height: 1080, dpr: 1, deviceMemory: 8, cores: 6 };
    expect(autoTier({ ...e, reducedMotion: false })).toBe('high');
    expect(autoTier({ ...e, reducedMotion: true })).toBe('medium');
    expect(autoTier({ ...e, width: 390, height: 844, reducedMotion: false, coarse: true })).toBe('medium');
  });
  it('falls back to medium when the browser tells us nothing', () => {
    expect(autoTier({ width: 1366, height: 768, dpr: 1, reducedMotion: false })).toBe('medium');
  });
});
