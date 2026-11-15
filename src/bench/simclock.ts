// Fixed-step bench clock: energy tallies, globe blow timers and the supply protector. Pure (no DOM, no three).
import type { Part, Solution } from '../types';

export const SIM_STEP = 1 / 120;
export const MAX_DT = 0.1;
/** a globe overloaded for this long (sim seconds) blows */
export const BLOW_TIME = 0.4;
/** a battery shorted for this long (sim seconds) trips the supply protector */
export const TRIP_TIME = 1.5;

export interface SimHooks {
  /** the solution to integrate this step (the caller re-solves after any blow) */
  solution(): Solution;
  parts(): Part[];
  /** a globe has been overloaded for BLOW_TIME: mark it blown and re-solve */
  onBlow(partId: string): void;
  /** the protector has tripped: treat every battery as disconnected and re-solve */
  onTrip(): void;
}

export class SimClock {
  /** total sim time in seconds */
  time = 0;
  tripped = false;
  /** seconds the current short has lasted (0 when there is no short) */
  shortTime = 0;
  private acc = 0;
  private overload = new Map<string, number>();
  private energy = new Map<string, number>();

  /** advance by a frame's dt (clamped); returns the number of fixed steps taken */
  tick(dt: number, h: SimHooks): number {
    if (!(dt > 0)) return 0;
    this.acc += Math.min(dt, MAX_DT);
    let steps = 0;
    while (this.acc >= SIM_STEP && steps < 24) {
      this.acc -= SIM_STEP;
      this.step(h);
      steps++;
    }
    if (steps === 24) this.acc = 0;
    return steps;
  }

  private step(h: SimHooks): void {
    this.time += SIM_STEP;
    const sol = h.solution();
    if (sol.status !== 'ok') return;
    for (const p of h.parts()) {
      const r = sol.parts[p.id];
      if (r && r.power > 0) this.energy.set(p.id, (this.energy.get(p.id) ?? 0) + r.power * SIM_STEP);
    }
    // globe blow timers
    const over = new Set(sol.overloaded);
    for (const id of [...this.overload.keys()]) if (!over.has(id)) this.overload.delete(id);
    for (const id of over) {
      const t = (this.overload.get(id) ?? 0) + SIM_STEP;
      if (t >= BLOW_TIME - 1e-9) { this.overload.delete(id); h.onBlow(id); }
      else this.overload.set(id, t);
    }
    // supply protector
    if (!this.tripped && sol.shorted.length > 0) {
      this.shortTime += SIM_STEP;
      if (this.shortTime >= TRIP_TIME - 1e-9) { this.tripped = true; h.onTrip(); }
    } else if (!this.tripped) this.shortTime = 0;
  }

  /** 0..1 how close a short is to tripping (1 once tripped) */
  get shortProgress(): number { return this.tripped ? 1 : Math.min(1, this.shortTime / TRIP_TIME); }

  resetBreaker(): void { this.tripped = false; this.shortTime = 0; }
  energyOf(id: string): number { return this.energy.get(id) ?? 0; }
  resetEnergy(): void { this.energy.clear(); }
  forget(id: string): void { this.energy.delete(id); this.overload.delete(id); }
}

/** the parts the solver sees: with the protector tripped every battery delivers 0 V */
export function effectiveParts(parts: Part[], tripped: boolean): Part[] {
  return tripped ? parts.map((p) => (p.kind === 'battery' ? { ...p, emf: 0 } : p)) : parts;
}
