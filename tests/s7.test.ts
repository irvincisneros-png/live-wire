// Station 7 pure helpers: chain ordering, sorting, renewable sort and computed questions.
import { describe, expect, it } from 'vitest';
import {
  MEASURES, SOURCES, SOURCE_IDS, WASTE_NOTE, chainIds, chainOrderCorrect, chainPrefixRight, commonDevice, commonPartQuestion, evaluateQuestion,
  flowPer100, scrambled, sortComplete, sortedBy, sourceById, tableQuestion, wrongPlacements, type Bin,
} from '../src/stations/s7/logic';
import { midpoint } from '../src/sim/sources';

describe('s7 chain ordering', () => {
  const coal = sourceById('coal');
  it('accepts the sim order and rejects others', () => {
    expect(chainOrderCorrect(chainIds(coal), coal)).toBe(true);
    expect(chainOrderCorrect(['coal-1', 'coal-0', 'coal-2', 'coal-3'], coal)).toBe(false);
    expect(chainOrderCorrect(['coal-0', 'coal-1', 'coal-2'], coal)).toBe(false);
    expect(chainOrderCorrect(chainIds(sourceById('gas')), coal)).toBe(false);
  });
  it('the coal chain is chemical → thermal → kinetic → electrical', () => {
    expect(coal.chain.map((c) => c.form)).toEqual(['chemical', 'thermal', 'kinetic', 'electrical']);
  });
  it('counts the correct prefix', () => {
    expect(chainPrefixRight(['coal-0', 'coal-1', 'coal-3'], coal)).toBe(2);
    expect(chainPrefixRight([], coal)).toBe(0);
  });
  it('the scrambled pool is never already solved and keeps every step', () => {
    for (const s of SOURCES) for (let seed = 1; seed < 20; seed++) {
      const ids = chainIds(s), sc = scrambled(ids, seed);
      expect([...sc].sort()).toEqual([...ids].sort());
      expect(sc).not.toEqual(ids);
    }
  });
});

describe('s7 comparison table', () => {
  it('sorts best first using the sim values', () => {
    expect(sortedBy('efficiency')[0].id).toBe('hydro');
    expect(sortedBy('capacity')[0].id).toBe('coal');
    expect(sortedBy('cost')[0].id).toBe('solar');
    expect(sortedBy('co2').slice(-1)[0].id).toBe('coal');
    const caps = sortedBy('capacity').map((s) => midpoint(s.capacityFactorPct));
    for (let i = 1; i < caps.length; i++) expect(caps[i]).toBeLessThanOrEqual(caps[i - 1]);
  });
  it('every measure has text for every source', () => {
    for (const m of MEASURES) for (const s of SOURCES) expect(m.text(s).length).toBeGreaterThan(0);
  });
});

describe('s7 renewable sort', () => {
  const right = Object.fromEntries(SOURCE_IDS.map((id) => [id, sourceById(id).renewable ? 'renewable' : 'non-renewable'])) as Record<string, Bin>;
  it('complete only when every source is in the right bin', () => {
    expect(sortComplete(right)).toBe(true);
    expect(sortComplete({ ...right, coal: 'renewable' })).toBe(false);
    const partial = { ...right }; delete (partial as Record<string, Bin | undefined>).wind;
    expect(sortComplete(partial)).toBe(false);
  });
  it('lists wrong placements', () => {
    expect(wrongPlacements({ gas: 'renewable', solar: 'renewable' })).toEqual(['gas']);
    expect(wrongPlacements({})).toEqual([]);
  });
});

describe('s7 computed questions', () => {
  it('the common part is the generator', () => {
    expect(commonDevice()).toBe('Generator');
    const q = commonPartQuestion();
    expect(q.options[q.correct]).toMatch(/Generator/);
  });
  it('the table question answer has the highest capacity factor', () => {
    const q = tableQuestion();
    const best = Math.max(...SOURCES.map((s) => midpoint(s.capacityFactorPct)));
    expect(midpoint(SOURCES[q.correct].capacityFactorPct)).toBe(best);
    expect(q.options[q.correct]).toBe(SOURCES[q.correct].name);
  });
  it('the evaluate answer runs on demand and is the quickest to build', () => {
    const q = evaluateQuestion();
    expect(q.options[q.correct]).toMatch(/gas turbine/i);
    expect(q.options[0]).toMatch(/solar/i);
  });
  it('flows per 100 J add to 100', () => {
    for (const s of SOURCES) { const f = flowPer100(s); expect(f.electrical + f.wasted).toBeCloseTo(100, 9); expect(WASTE_NOTE[s.id].length).toBeGreaterThan(5); }
  });
  it('question text follows the writing rules', () => {
    for (const q of [commonPartQuestion(), tableQuestion(), evaluateQuestion()]) for (const t of [q.prompt, q.explain, ...q.options]) {
      expect(t).not.toMatch(/—/); expect(t).not.toMatch(/\b(simply|just)\b/i);
    }
  });
});
