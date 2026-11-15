// Student-facing strings must follow the builder brief: no em dashes, never "simply" or "just".
import { describe, expect, it } from 'vitest';
import * as appliances from '../src/sim/appliances';
import * as audit from '../src/sim/audit';
import * as faults from '../src/sim/faults';
import * as outlet from '../src/sim/outlet';
import * as powerboard from '../src/sim/powerboard';
import * as solar from '../src/sim/solar';
import * as sources from '../src/sim/sources';

function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((i) => strings(i, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((i) => strings(i, out));
  return out;
}

const data: unknown[] = [
  appliances.APPLIANCES, appliances.LABELS, audit.AUDIT_APPLIANCES, audit.OPTIONS, audit.EXPLANATION_OPTIONS,
  faults.REASONING_OPTIONS, faults.allFaults(), faults.houseLayout(), powerboard.BOARD_APPLIANCES, powerboard.EXPLANATION_OPTIONS,
  solar.TRADEOFF_OPTIONS, sources.SOURCES, sources.OMITTED_NOTE,
];

const results = [
  powerboard.scorePowerBoard({ currents: {}, explanation: null, plan: {} }),
  powerboard.scorePowerBoard({ currents: {}, explanation: 0, plan: { heater: 1, kettle: 1, toaster: 1, iron: 1, 'sandwich-press': 1 } }),
  audit.scoreAudit({ top3: [], chosen: [], explanation: null }),
  audit.scoreAudit({ top3: ['hot-water'], chosen: ['heat-pump', 'tv-swap'], explanation: 1 }),
  solar.scoreSolar({ pvKW: 0, batteryKWh: 0, balanceKWh: null, tradeoff: null }),
  solar.scoreSolar({ pvKW: 5, batteryKWh: 0, balanceKWh: 3, tradeoff: 0 }),
  faults.scoreFault({ fault: faults.allFaults()[0], answerKind: null, answerPartId: null, measurements: [], reasoning: null }),
  faults.scoreFault({ fault: faults.allFaults()[0], answerKind: 'switch-open', answerPartId: 'sw0', measurements: [{ a: 3, b: 4 }], reasoning: 0 }),
  outlet.scoreOutlet({ wiring: { active: null, neutral: null, earth: null }, isolated: false, provedDead: false, testedBoth: false, predictedA: null }),
  outlet.scoreOutlet({ wiring: { active: 'existing-neutral', neutral: 'existing-active', earth: 'existing-active' }, isolated: true, provedDead: false, testedBoth: true, predictedA: 3 }),
];
for (const w of [outlet.CORRECT_WIRING, { active: 'existing-neutral', neutral: 'existing-active', earth: 'existing-earth' } as outlet.Wiring, { active: null, neutral: null, earth: null } as outlet.Wiring, { active: 'existing-active', neutral: 'existing-neutral', earth: 'existing-active' } as outlet.Wiring]) {
  const r = outlet.analyseOutlet(w);
  data.push(r.verdict, r.problems);
}
data.push(results.map((r) => [r.lines, r.answers]));

describe('writing rules for student-facing text', () => {
  const all = strings(data);
  it('collects a real amount of text', () => { expect(all.length).toBeGreaterThan(100); });
  it('has no em dashes', () => { expect(all.filter((s) => s.includes('—'))).toEqual([]); });
  it('never says "simply" or "just"', () => { expect(all.filter((s) => /\b(simply|just)\b/i.test(s))).toEqual([]); });
  it('results have 2 to 4 lines', () => { for (const r of results) { expect(r.lines.length).toBeGreaterThanOrEqual(2); expect(r.lines.length).toBeLessThanOrEqual(4); } });
});
