// The coach: a compact card pinned over the top of the view.
import type { Coach, CoachStep } from '../types';
import { h } from './dom';

const POLL_MS = 200;
const TICK_MS = 700;

export class CoachUI implements Coach {
  private run_: { steps: CoachStep[]; i: number; resolve: () => void } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private ticking = false;
  private collapsed = false;
  private disposed = false;

  constructor(private el: HTMLElement) {
    el.classList.add('lw-coach');
    el.hidden = true;
  }

  // ── Coach interface ──
  run(steps: CoachStep[]): Promise<void> {
    this.stopRun(false);
    if (this.disposed || steps.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.run_ = { steps, i: -1, resolve };
      this.goTo(0);
      this.timer = setInterval(() => this.poll(), POLL_MS);
    });
  }

  say(html: string): void {
    this.stopRun(false);
    if (this.disposed) return;
    this.el.hidden = false;
    this.el.className = 'lw-coach lw-coach--say';
    this.el.replaceChildren(
      h('div', { class: 'lw-coach-body', role: 'status', 'aria-live': 'polite' },
        h('div', { class: 'lw-coach-text', html }),
        h('button', { class: 'lw-coach-x', type: 'button', 'aria-label': 'Close message', onclick: () => this.clear() }, '×')));
  }

  clear(): void {
    this.stopRun(false);
    this.el.hidden = true;
    this.el.replaceChildren();
  }

  /** Stop a running guide without resolving it as finished. Used when the phase changes. */
  cancel(): void {
    this.stopRun(false);
    this.el.hidden = true;
    this.el.replaceChildren();
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }

  // ── internals ──
  private stopRun(resolve: boolean): void {
    if (this.timer) clearInterval(this.timer);
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.timer = null;
    this.tickTimer = null;
    this.ticking = false;
    const r = this.run_;
    this.run_ = null;
    if (r) {
      const cur = r.steps[r.i];
      try { cur?.onLeave?.(); } catch (e) { console.error(e); }
      if (resolve) r.resolve();
    }
  }

  private goTo(i: number): void {
    const r = this.run_;
    if (!r) return;
    const prev = r.steps[r.i];
    if (prev) { try { prev.onLeave?.(); } catch (e) { console.error(e); } }
    if (i >= r.steps.length) {
      this.run_ = { ...r, i: -1 };
      this.finish();
      return;
    }
    r.i = i;
    this.ticking = false;
    const step = r.steps[i];
    try { step.onEnter?.(); } catch (e) { console.error(e); }
    this.render();
  }

  private finish(): void {
    const r = this.run_;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.run_ = null;
    this.el.hidden = true;
    this.el.replaceChildren();
    r?.resolve();
  }

  private poll(): void {
    const r = this.run_;
    if (!r || this.ticking) return;
    const step = r.steps[r.i];
    let ok = false;
    try { ok = !!step?.done?.(); } catch { ok = false; }
    if (!ok) return;
    this.ticking = true;
    const body = this.el.querySelector('.lw-coach-tick');
    if (body) body.classList.add('is-on');
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      if (this.run_ === r) this.goTo(r.i + 1);
    }, TICK_MS);
  }

  private render(): void {
    const r = this.run_;
    if (!r) return;
    const step = r.steps[r.i];
    const n = r.steps.length;
    const hasDone = typeof step.done === 'function';
    this.el.hidden = false;
    this.el.className = `lw-coach${this.collapsed ? ' is-collapsed' : ''}`;
    const text = h('div', { class: 'lw-coach-text', html: step.text });
    const actions = h('div', { class: 'lw-coach-actions' },
      r.i > 0 ? h('button', { class: 'lw-link', type: 'button', onclick: () => this.goTo(r.i - 1) }, 'Back') : null,
      hasDone ? h('button', { class: 'lw-link', type: 'button', onclick: () => this.goTo(r.i + 1) }, 'Skip step') : null,
      h('button', { class: 'lw-link', type: 'button', onclick: () => { this.stopRun(true); this.el.hidden = true; this.el.replaceChildren(); } }, 'Skip guide'),
      !hasDone ? h('button', { class: 'lw-btn lw-btn--sm', type: 'button', onclick: () => this.goTo(r.i + 1) }, r.i === n - 1 ? 'Finish' : 'Next') : null);
    this.el.replaceChildren(
      h('div', { class: 'lw-coach-body', role: 'status', 'aria-live': 'polite' },
        h('div', { class: 'lw-coach-head' },
          h('span', { class: 'lw-coach-step' }, `Step ${r.i + 1} of ${n}`),
          h('span', { class: 'lw-coach-tick', 'aria-hidden': 'true' }, '✓ Nice'),
          h('button', {
            class: 'lw-coach-min', type: 'button', 'aria-expanded': String(!this.collapsed),
            'aria-label': this.collapsed ? 'Show coach' : 'Shrink coach',
            onclick: () => { this.collapsed = !this.collapsed; this.render(); },
          }, this.collapsed ? '▾' : '▴')),
        this.collapsed ? null : text,
        this.collapsed ? null : actions));
  }
}
