// The Checks panel: one task at a time, progress pips, ticket at the end.
import type { CheckTask } from '../types';
import { h } from './dom';
import { isAcceptable, numberHint, parseNumber } from './numcheck';
import type { ProgressStore } from './progress';

export interface ChecksOptions {
  el: HTMLElement;
  stationId: string;
  stationNum: number;
  ticket: string;
  tasks: CheckTask[];
  progress: ProgressStore;
  next: { id: string; title: string } | null;
  go(route: string): void;
}

const put = (box: HTMLElement, ...k: (Node | string | null)[]): void => box.append(...k.filter((x): x is Node | string => x !== null));

export function mountChecks(o: ChecksOptions): { dispose(): void } {
  const { el, tasks, progress } = o;
  el.classList.add('lw-checks-panel');
  const done = new Set<string>(tasks.filter((t) => progress.checkPassed(o.stationId, t.id)).map((t) => t.id));
  let idx = Math.max(0, tasks.findIndex((t) => !done.has(t.id)));
  let mode: 'ask' | 'passed' | 'ticket' = 'ask';
  let wrong = 0;
  let msg = '';
  let msgKind: 'bad' | 'info' = 'info';
  let revealed = false;
  let typed = '';
  const wrongChoices = new Set<number>();
  let poll: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const stopPoll = (): void => { if (poll) clearInterval(poll); poll = null; };

  const allDone = (): boolean => tasks.every((t) => done.has(t.id));

  function enter(i: number): void {
    idx = i;
    mode = 'ask';
    wrong = 0;
    msg = '';
    revealed = false;
    typed = '';
    wrongChoices.clear();
    stopPoll();
    const t = tasks[i];
    try { t.onStart?.(); } catch (e) { console.error(e); }
    if (t.kind === 'do') {
      poll = setInterval(() => {
        let ok = false;
        try { ok = t.test(); } catch { ok = false; }
        if (ok) pass();
      }, 200);
    }
    render();
  }

  function pass(): void {
    stopPoll();
    const t = tasks[idx];
    done.add(t.id);
    progress.passCheck(o.stationId, t.id);
    mode = 'passed';
    render();
  }

  function finishAll(): void {
    stopPoll();
    mode = 'ticket';
    progress.awardTicket(o.ticket);
    render();
  }

  function advance(): void {
    for (let k = 1; k <= tasks.length; k++) {
      const j = (idx + k) % tasks.length;
      if (!done.has(tasks[j].id)) { enter(j); return; }
    }
    finishAll();
  }

  function redo(): void {
    done.clear();
    enter(0);
  }

  function pips(): HTMLElement {
    return h('ol', { class: 'lw-pips', 'aria-label': `Check ${Math.min(idx + 1, tasks.length)} of ${tasks.length}` },
      tasks.map((t, i) => h('li', {
        class: `lw-pip${done.has(t.id) ? ' is-done' : ''}${i === idx && mode !== 'ticket' ? ' is-current' : ''}`,
        'aria-label': `Task ${i + 1}${done.has(t.id) ? ', passed' : ''}`,
      }, done.has(t.id) ? '✓' : String(i + 1))));
  }

  function feedback(): HTMLElement | null {
    return msg ? h('p', { class: `lw-feedback lw-feedback--${msgKind}`, role: 'status' }, msg) : null;
  }

  function renderTicket(): HTMLElement {
    return h('div', { class: 'lw-ticketwrap' },
      h('div', { class: 'lw-ticket', role: 'status' },
        h('div', { class: 'lw-ticket-stub' }, h('span', null, 'TICKET'), h('b', null, String(o.stationNum))),
        h('div', { class: 'lw-ticket-main' },
          h('div', { class: 'lw-ticket-kicker' }, 'Illawarra Trade School'),
          h('div', { class: 'lw-ticket-name' }, o.ticket),
          h('div', { class: 'lw-ticket-sub' }, 'Ticket earned'))),
      h('p', { class: 'lw-muted' }, 'All checks passed. This ticket is saved on this device.'),
      h('div', { class: 'lw-row' },
        o.next ? h('a', { class: 'lw-btn', href: `#${o.next.id}` }, `Next station: ${o.next.title}`) : null,
        h('a', { class: `lw-btn${o.next ? ' lw-btn--ghost' : ''}`, href: '#job' }, 'Go to The Job'),
        h('button', { class: 'lw-link', type: 'button', onclick: redo }, 'Do the checks again')));
  }

  function renderTask(t: CheckTask): HTMLElement {
    const box = h('div', { class: 'lw-task' });
    put(box, h('div', { class: 'lw-task-prompt', html: t.prompt }));
    if (mode === 'passed') {
      put(box, 
        h('p', { class: 'lw-feedback lw-feedback--good', role: 'status' }, '✓ Correct.'),
        'explain' in t && t.explain ? h('div', { class: 'lw-explain', html: t.explain }) : null,
        h('div', { class: 'lw-row' }, h('button', { class: 'lw-btn', type: 'button', onclick: advance }, allDone() ? 'Get my ticket' : 'Next check')));
      return box;
    }
    if (t.kind === 'do') {
      put(box, 
        h('p', { class: 'lw-muted' }, 'Do it in the 3D scene. This ticks over by itself, or press Check.'),
        feedback(),
        h('div', { class: 'lw-row' }, h('button', {
          class: 'lw-btn', type: 'button',
          onclick: () => {
            let ok = false;
            try { ok = t.test(); } catch { ok = false; }
            if (ok) pass();
            else { msg = 'Not yet. Look at the scene again, then try the check once more.'; msgKind = 'info'; render(); }
          },
        }, 'Check')));
    } else if (t.kind === 'number') {
      const input = h('input', {
        class: 'lw-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': `Your answer in ${t.unit}`,
        value: typed, placeholder: 'Type a number',
        oninput: (e: Event) => { typed = (e.target as HTMLInputElement).value; },
      });
      const submit = (e?: Event): void => {
        e?.preventDefault();
        const given = parseNumber(typed);
        if (given !== null && isAcceptable(t.answer, t.tolerance, given)) { pass(); return; }
        wrong += 1;
        msg = numberHint(t.answer, given, wrong);
        msgKind = 'bad';
        render();
      };
      put(box, 
        h('form', { class: 'lw-answer', onsubmit: submit, novalidate: true },
          input, h('span', { class: 'lw-unit' }, t.unit),
          h('button', { class: 'lw-btn', type: 'submit' }, 'Check')),
        feedback(),
        wrong >= 2 && !revealed ? h('div', { class: 'lw-row' }, h('button', { class: 'lw-link', type: 'button', onclick: () => { revealed = true; render(); } }, 'Show me how')) : null,
        revealed ? h('div', { class: 'lw-explain', html: t.explain }) : null);
    } else {
      put(box, 
        h('div', { class: 'lw-options', role: 'group', 'aria-label': 'Answer choices' },
          t.options.map((opt, i) => h('button', {
            class: `lw-opt${wrongChoices.has(i) ? ' is-wrong' : ''}`, type: 'button', disabled: wrongChoices.has(i), html: opt,
            onclick: () => {
              if (i === t.correct) { pass(); return; }
              wrongChoices.add(i);
              msg = 'Not quite. ';
              msgKind = 'bad';
              render();
            },
          }))),
        msg ? h('div', { class: 'lw-feedback lw-feedback--bad', role: 'status' }, msg, h('span', { html: t.explain }), ' Choose another answer.') : null);
    }
    return box;
  }

  function render(): void {
    if (disposed) return;
    const head = h('div', { class: 'lw-checks-head' },
      h('h2', null, mode === 'ticket' ? 'Ticket earned' : 'Checks'),
      h('span', { class: 'lw-muted' }, `Ticket: ${o.ticket}`));
    el.replaceChildren(head, pips(),
      mode === 'ticket' ? renderTicket() : tasks.length ? renderTask(tasks[idx]) : h('p', null, 'No checks here yet.'));
    // keep the typed answer focused after a wrong try
    if (mode === 'ask' && tasks[idx]?.kind === 'number' && wrong > 0) el.querySelector<HTMLInputElement>('.lw-input')?.focus();
  }

  if (tasks.length === 0) finishAll();
  else if (allDone()) { mode = 'ticket'; progress.awardTicket(o.ticket); render(); }
  else enter(idx);

  return {
    dispose() {
      disposed = true;
      stopPoll();
      el.replaceChildren();
      el.classList.remove('lw-checks-panel');
    },
  };
}
