// Placeholder content used until the real stations and jobs are built. Other builders replace the
// per-station and per-job files; this helper can then go unused.
import type { JobHost, JobInstance, StationHost, StationInstance } from '../types';
import { h } from './dom';

export function placeholderStation(host: StationHost, title: string, ticket: string): StationInstance {
  host.view.replaceChildren(
    h('div', { class: 'lw-placeholder' },
      h('div', { class: 'lw-placeholder-card' },
        h('div', { class: 'lw-placeholder-icon', 'aria-hidden': 'true' }, '🔧'),
        h('h2', null, 'This station is being built'),
        h('p', null, `${title} will appear here. You can still try the coach, the checks and the ticket for "${ticket}".`))));
  host.side.replaceChildren(
    h('div', { class: 'lw-card-plain' },
      h('h3', null, 'Side panel'),
      h('p', { class: 'lw-muted' }, 'Diagrams, graphs and cards go here.')));
  host.dashboard.show({ label: 'Demo part', V: 6, I: 0.5, R: 12, P: 3, E: 0 });
  let answered = false;
  return {
    steps: [
      { text: 'Welcome. This is the <b>first</b> practice step. Press Next.' },
      { text: 'This second step finishes when you tap the button.', done: () => answered },
    ],
    tasks: [
      { id: 'demo-choice', kind: 'choice', prompt: 'Which unit measures current?', options: ['Volt (V)', 'Amp (A)', 'Ohm (Ω)'], correct: 1, explain: 'Current is measured in amps (A).' },
      { id: 'demo-number', kind: 'number', prompt: 'A 12 Ω resistor has 6 V across it. What is the current?', answer: 0.5, tolerance: 0.05, unit: 'A', explain: 'I = V ÷ R = 6 ÷ 12 = 0.5 A.' },
    ],
    onPhase(p) {
      if (p === 'guided') answered = false;
      host.view.dataset.phase = p;
      if (p === 'guided') {
        const btn = host.view.querySelector('.lw-placeholder-card');
        if (btn && !btn.querySelector('button')) btn.appendChild(h('button', { class: 'lw-btn', onclick: () => { answered = true; } }, 'Tap to finish the step'));
      }
    },
    dispose() {
      host.view.replaceChildren();
      host.side.replaceChildren();
    },
  };
}

export function placeholderJob(host: JobHost, title: string): JobInstance {
  host.view.replaceChildren(
    h('div', { class: 'lw-placeholder' },
      h('div', { class: 'lw-placeholder-card' },
        h('div', { class: 'lw-placeholder-icon', 'aria-hidden': 'true' }, '🏠'),
        h('h2', null, 'This job is being built'),
        h('p', null, `${title} will run here on the 12 V training house.`),
        h('p', { class: 'lw-muted' }, `Attempt seed: ${host.seed}`))));
  host.dashboard.show({ label: 'Demo part', V: 12, I: 1, R: 12, P: 12, E: 0 });
  host.panel.replaceChildren(
    h('div', { class: 'lw-card-plain' },
      h('h3', null, 'Job panel'),
      h('p', { class: 'lw-muted' }, 'Questions and controls go here.'),
      h('button', {
        class: 'lw-btn',
        onclick: () => host.finish({
          stars: 2, score: 74,
          lines: ['Sample result: strong on the measurements.', 'Sample result: revisit the reasoning question.'],
          answers: [{ q: 'Sample question one', a: 'Sample answer', ok: true }, { q: 'Sample question two', a: 'Another answer', ok: false }],
        }),
      }, 'Finish with a sample result')));
  return { dispose() { host.view.replaceChildren(); host.panel.replaceChildren(); } };
}
