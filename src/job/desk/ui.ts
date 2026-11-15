// DOM building blocks shared by jobs 3, 4 and 5: wizard with progress, number boxes, choice lists, gauges.
import { h, s } from '../../ui/dom';
import { parseNumber } from './maths';

export { h, s };

export interface StepDef {
  id: string;
  title: string;
  /** build the step once; call wizard.refresh() whenever answers change */
  build(): HTMLElement;
  /** true when the required answers for this step are given */
  complete(): boolean;
  /** why Next is disabled, shown under the buttons */
  need?: string;
  onEnter?(): void;
  onLeave?(): void;
}

export interface WizardOptions {
  kicker: string;
  title: string;
  task: string;
  /** extra paragraph under the task (kept short) */
  note?: string;
  steps: StepDef[];
  /** label of the button on the last step */
  submitLabel: string;
  /** the last step's primary button; return nothing */
  onSubmit(): void;
  /** extra condition for the submit button (default: all steps complete) */
  canSubmit?(): boolean;
  onStep?(index: number): void;
}

export interface Wizard {
  el: HTMLElement;
  readonly index: number;
  go(i: number): void;
  refresh(): void;
  /** the container holding the current step body (for scrolling and tests) */
  body: HTMLElement;
  dispose(): void;
}

/** Numbered, keyboard-friendly stepper with a progress bar. Steps stay in the DOM so typed answers survive moving back and forth. */
export function createWizard(panel: HTMLElement, o: WizardOptions): Wizard {
  let index = 0;
  const n = o.steps.length;
  const pills = o.steps.map((st, i) => h('button', {
    class: 'dk-pill', type: 'button', 'data-step': String(i), 'aria-label': `Step ${i + 1}: ${st.title}`,
    onclick: () => { if (reachable(i)) go(i); },
  }, h('span', { class: 'dk-pill-n' }, String(i + 1)), h('span', { class: 'dk-pill-t' }, st.title)));
  const bar = h('div', { class: 'dk-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': '0', 'aria-label': 'Job progress' }, h('div', { class: 'dk-bar-fill' }));
  const status = h('p', { class: 'dk-status', 'aria-live': 'polite' });
  const stepEls = o.steps.map((st, i) => {
    const el = h('section', { class: 'dk-step', 'data-step': String(i), 'aria-labelledby': `dk-h-${i}`, hidden: i !== 0 },
      h('h3', { class: 'dk-step-h', id: `dk-h-${i}` }, h('span', { class: 'dk-step-num' }, `Step ${i + 1} of ${n}`), ' ', st.title),
      st.build());
    return el;
  });
  const body = h('div', { class: 'dk-body' }, stepEls);
  const back = h('button', { class: 'lw-btn lw-btn--ghost', type: 'button', onclick: () => go(index - 1) }, 'Back');
  const next = h('button', { class: 'lw-btn', type: 'button', onclick: () => { if (index === n - 1) { if (canSubmit()) o.onSubmit(); } else if (o.steps[index].complete()) go(index + 1); } }, 'Next');
  const need = h('p', { class: 'dk-need', role: 'status' });
  const nav = h('div', { class: 'dk-nav' }, back, next);
  const el = h('div', { class: 'dk-wiz' },
    h('div', { class: 'dk-head' },
      h('p', { class: 'lw-kicker' }, o.kicker),
      h('h2', { class: 'dk-title' }, o.title),
      h('p', { class: 'dk-task' }, o.task)),
    h('nav', { class: 'dk-steps', 'aria-label': 'Steps' }, pills),
    bar, status, body, nav, need,
    o.note ? h('p', { class: 'dk-note' }, o.note) : null);
  panel.replaceChildren(el);

  const doneUpTo = (i: number) => o.steps.slice(0, i).every((st) => st.complete());
  const reachable = (i: number) => i <= index || doneUpTo(i);
  /** every step before the last one is answered (the last step is the submit step) */
  const allDone = () => o.steps.slice(0, -1).every((st) => st.complete());
  const canSubmit = () => allDone() && (o.canSubmit ? o.canSubmit() : true);

  function refresh(): void {
    const done = o.steps.filter((st) => st.complete()).length;
    (bar.firstElementChild as HTMLElement).style.width = `${(done / n) * 100}%`;
    bar.setAttribute('aria-valuenow', String(done));
    status.textContent = `Step ${index + 1} of ${n}: ${o.steps[index].title}. ${done} of ${n} steps answered.`;
    pills.forEach((p, i) => {
      p.classList.toggle('is-current', i === index);
      p.classList.toggle('is-done', o.steps[i].complete());
      p.setAttribute('aria-current', i === index ? 'step' : 'false');
      (p as HTMLButtonElement).disabled = !reachable(i);
    });
    back.hidden = index === 0;
    const last = index === n - 1;
    next.textContent = last ? o.submitLabel : 'Next';
    next.classList.toggle('lw-btn--lg', last);
    const ok = last ? canSubmit() : o.steps[index].complete();
    (next as HTMLButtonElement).disabled = !ok;
    next.dataset.role = last ? 'submit' : 'next';
    need.textContent = ok ? '' : (last && !allDone() ? 'Answer every step to submit.' : (o.steps[index].need ?? ''));
  }

  function go(i: number): void {
    if (i < 0 || i >= n) return;
    o.steps[index].onLeave?.();
    index = i;
    stepEls.forEach((e, k) => { e.hidden = k !== i; });
    refresh();
    scrollPanelTop(panel);
    o.steps[i].onEnter?.();
    o.onStep?.(i);
  }

  refresh();
  o.steps[0].onEnter?.();
  o.onStep?.(0);
  return {
    el, body, get index() { return index; }, go, refresh,
    dispose() { el.remove(); },
  };
}

function scrollPanelTop(panel: HTMLElement): void {
  const sc = panel.closest('.lw-sidebody') as HTMLElement | null;
  if (sc) sc.scrollTop = 0;
}

/** On phones the panel is a pull-up sheet that starts closed: open it so the controls are reachable. */
export function openSheetOnPhones(panel: HTMLElement): void {
  try {
    if (typeof matchMedia === 'function' && !matchMedia('(max-width: 899px)').matches) return;
    const handle = panel.closest('.lw-sidewrap')?.querySelector('.lw-handle') as HTMLButtonElement | null;
    if (handle && handle.getAttribute('aria-expanded') !== 'true') handle.click();
  } catch { /* ignore */ }
}

export interface NumField {
  el: HTMLElement;
  input: HTMLInputElement;
  value(): number | undefined;
  set(text: string): void;
}

/** A labelled number box that accepts decimals and shows its unit. */
export function numField(o: { label: string; unit: string; id: string; value?: string; placeholder?: string; onInput?(): void; compact?: boolean }): NumField {
  const input = h('input', {
    class: 'lw-input dk-num', id: o.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
    placeholder: o.placeholder ?? '0.0', value: o.value ?? '', 'aria-describedby': `${o.id}-u`,
  }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = parseNumber(input.value);
    input.classList.toggle('is-bad', input.value.trim() !== '' && v === undefined);
    o.onInput?.();
  });
  const el = h('div', { class: `dk-field${o.compact ? ' dk-field--compact' : ''}` },
    h('label', { class: 'dk-label', for: o.id }, o.label),
    h('span', { class: 'dk-numwrap' }, input, h('span', { class: 'dk-unit', id: `${o.id}-u` }, o.unit)));
  return {
    el, input,
    value: () => parseNumber(input.value),
    set(text) { input.value = text; input.dispatchEvent(new Event('input')); },
  };
}

export interface ChoiceGroup {
  el: HTMLElement;
  value(): number | null;
  set(i: number | null): void;
}

/** A radio list (one answer). Native radios, so arrow keys work. */
export function choiceGroup(o: { name: string; legend: string; options: readonly string[]; onChange?(i: number): void; labels?: string[] }): ChoiceGroup {
  let cur: number | null = null;
  const inputs: HTMLInputElement[] = [];
  const rows = o.options.map((t, i) => {
    const input = h('input', { type: 'radio', name: o.name, id: `${o.name}-${i}`, value: String(i), class: 'dk-radio' }) as HTMLInputElement;
    input.addEventListener('change', () => { cur = i; o.onChange?.(i); });
    inputs.push(input);
    return h('label', { class: 'dk-choice', for: `${o.name}-${i}` }, input, h('span', { class: 'dk-choice-t' }, o.labels ? h('b', null, o.labels[i] + ' ') : null, t));
  });
  const el = h('fieldset', { class: 'dk-choices' }, h('legend', { class: 'dk-legend' }, o.legend), rows);
  return {
    el, value: () => cur,
    set(i) { cur = i; inputs.forEach((x, k) => { x.checked = k === i; }); if (i !== null) o.onChange?.(i); },
  };
}

export interface Gauge {
  el: HTMLElement;
  set(value: number, state?: 'ok' | 'warn' | 'tripped'): void;
}

/** Round current meter with a red zone above the limit. Units: amps. */
export function gauge(o: { label: string; max: number; limit: number; limitLabel: string }): Gauge {
  const R = 46, cx = 60, cy = 58;
  const a0 = Math.PI * 0.85, a1 = Math.PI * 2.15; // sweep 1.3 PI
  const ang = (v: number) => a0 + (a1 - a0) * Math.max(0, Math.min(1, v / o.max));
  const pt = (a: number, r: number) => `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
  const arc = (v0: number, v1: number, r: number) => `M ${pt(ang(v0), r)} A ${r} ${r} 0 ${ang(v1) - ang(v0) > Math.PI ? 1 : 0} 1 ${pt(ang(v1), r)}`;
  const ticks: SVGElement[] = [];
  for (let v = 0; v <= o.max; v += 5) {
    ticks.push(s('line', { x1: cx + Math.cos(ang(v)) * (R - 6), y1: cy + Math.sin(ang(v)) * (R - 6), x2: cx + Math.cos(ang(v)) * R, y2: cy + Math.sin(ang(v)) * R, class: 'dk-g-tick' }));
    ticks.push(s('text', { x: cx + Math.cos(ang(v)) * (R - 13), y: cy + Math.sin(ang(v)) * (R - 13) + 3, class: 'dk-g-num', 'text-anchor': 'middle' }, String(v)));
  }
  const needle = s('line', { x1: cx, y1: cy, x2: cx + R - 10, y2: cy, class: 'dk-g-needle' });
  const readout = s('text', { x: cx, y: cy + 30, class: 'dk-g-read', 'text-anchor': 'middle' }, '0.0 A');
  const svg = s('svg', { viewBox: '0 0 120 96', class: 'dk-gauge-svg', role: 'img', 'aria-label': `${o.label} current meter` },
    s('path', { d: arc(0, o.limit, R), class: 'dk-g-ok' }),
    s('path', { d: arc(o.limit, o.max, R), class: 'dk-g-hot' }),
    ticks, needle, s('circle', { cx, cy, r: 4, class: 'dk-g-hub' }), readout);
  const badge = h('span', { class: 'dk-g-badge' }, `${o.limitLabel}`);
  const el = h('div', { class: 'dk-gauge', 'data-state': 'ok' }, h('div', { class: 'dk-g-label' }, o.label), svg, badge);
  return {
    el,
    set(value, state = 'ok') {
      const a = ang(value);
      needle.setAttribute('x2', String(cx + Math.cos(a) * (R - 10)));
      needle.setAttribute('y2', String(cy + Math.sin(a) * (R - 10)));
      readout.textContent = `${value.toFixed(1)} A`;
      el.dataset.state = state;
      badge.textContent = state === 'tripped' ? 'TRIPPED' : o.limitLabel;
    },
  };
}

/** Tiny pointer-based drag helper: lets a chip be dragged onto elements matching `dropSel`. Click without moving does nothing. */
export function makeDraggable(chip: HTMLElement, handle: HTMLElement, o: { dropSel: string; onDrop(target: HTMLElement): void; onOver?(target: HTMLElement | null): void }): () => void {
  let ghost: HTMLElement | null = null, sx = 0, sy = 0, pid = -1, moved = false;
  const down = (e: PointerEvent) => {
    sx = e.clientX; sy = e.clientY; pid = e.pointerId; moved = false;
    try { handle.setPointerCapture(pid); } catch { /* ignore */ }
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return;
    if (!moved) {
      moved = true;
      ghost = chip.cloneNode(true) as HTMLElement;
      ghost.classList.add('dk-ghost');
      ghost.style.width = `${chip.offsetWidth}px`;
      document.body.appendChild(ghost);
      chip.classList.add('is-dragging');
    }
    if (ghost) { ghost.style.left = `${e.clientX - 20}px`; ghost.style.top = `${e.clientY - 18}px`; }
    ghost?.style.setProperty('display', 'none');
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest(o.dropSel) as HTMLElement | null;
    ghost?.style.removeProperty('display');
    o.onOver?.(t);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    pid = -1;
    if (moved) {
      ghost?.style.setProperty('display', 'none');
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest(o.dropSel) as HTMLElement | null;
      if (t) o.onDrop(t);
    }
    o.onOver?.(null);
    ghost?.remove(); ghost = null; chip.classList.remove('is-dragging');
  };
  handle.addEventListener('pointerdown', down);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
  return () => {
    handle.removeEventListener('pointerdown', down); handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
    ghost?.remove();
  };
}

/** Run `cb` every animation frame until the returned stop function is called. Safe to call after the page is gone. */
export function raf(cb: (dt: number) => void): () => void {
  let id = 0, last = performance.now(), stopped = false;
  const loop = (now: number) => {
    if (stopped) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    cb(dt);
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => { stopped = true; cancelAnimationFrame(id); };
}
