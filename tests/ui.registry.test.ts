import { describe, expect, it } from 'vitest';
import { JOBS } from '../src/job/index';
import { STATIONS, stationForTicket } from '../src/stations/index';
import { DOT_POINTS } from '../src/ui/content';
import { JOB_IDS, STATION_IDS } from '../src/ui/route';

describe('registries', () => {
  it('has 8 stations and 5 jobs with unique ids in order', () => {
    expect(STATIONS.map((s) => s.id)).toEqual(STATION_IDS);
    expect(JOBS.map((j) => j.id)).toEqual(JOB_IDS);
    expect(new Set(STATIONS.map((s) => s.ticket)).size).toBe(8);
    STATIONS.forEach((s, i) => { expect(s.num).toBe(i); expect(typeof s.load).toBe('function'); expect(s.blurb.length).toBeGreaterThan(20); });
    JOBS.forEach((j, i) => { expect(j.num).toBe(i + 1); expect(typeof j.load).toBe('function'); expect(j.brief.length).toBeGreaterThan(20); });
  });

  it('every job ticket is a real station ticket', () => {
    for (const j of JOBS) for (const t of j.tickets) expect(stationForTicket(t), `${j.id} ${t}`).toBeDefined();
  });

  it('covers every dot point 1.1.1 to 1.3.6 and 1.4.1 somewhere, and nothing else', () => {
    const all = new Set([...STATIONS.flatMap((s) => s.dotPoints), ...JOBS.flatMap((j) => j.dotPoints)]);
    const expected = ['1.1.1', '1.1.2', '1.1.3', '1.2.1', '1.2.2', '1.2.3', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.4.1'];
    for (const d of expected) expect(all.has(d), d).toBe(true);
    for (const d of all) expect(expected).toContain(d);
    expect(DOT_POINTS.map((d) => d.code)).toEqual(expected);
  });

  it('follows the spec table for where dot points live', () => {
    const st = (c: string) => STATIONS.filter((s) => s.dotPoints.includes(c)).map((s) => s.num);
    const jb = (c: string) => JOBS.filter((j) => j.dotPoints.includes(c)).map((j) => j.num);
    expect(st('1.1.1')).toEqual([6]); expect(jb('1.1.1')).toEqual([5]);
    expect(st('1.3.3')).toEqual([3]); expect(jb('1.3.3')).toEqual([1]);
    expect(st('1.3.4')).toEqual([4]); expect(jb('1.3.4')).toEqual([2, 3]);
    expect(st('1.3.6')).toEqual([5]); expect(jb('1.3.6')).toEqual([4]);
    expect(jb('1.4.1')).toEqual([4]);
  });

  it('student-facing registry text avoids banned words and em dashes', () => {
    const text = [...STATIONS.map((s) => `${s.title} ${s.blurb}`), ...JOBS.map((j) => `${j.title} ${j.brief}`)].join(' ');
    expect(text).not.toMatch(/\bsimply\b|\bjust\b|—/i);
  });
});
