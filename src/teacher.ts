import './ui/styles.css';
import { JOBS } from './job/index';
import { STATIONS } from './stations/index';
import { DOT_POINTS, HUB_URL, MODEL_LIMITS, NOT_COVERED, SAFETY_MESSAGE, SAFETY_SIMPLIFIED } from './ui/content';
import { h } from './ui/dom';
import { APP_VERSION } from './ui/version';

function where(code: string): string {
  const st = STATIONS.filter((x) => x.dotPoints.includes(code)).map((x) => `Station ${x.num}`);
  const jb = JOBS.filter((x) => x.dotPoints.includes(code)).map((x) => `Job ${x.num}`);
  return [...st, ...jb].join(', ') || 'Not covered';
}

function table(head: string[], rows: (string | Node)[][]): HTMLElement {
  return h('div', { class: 'lw-tablewrap' },
    h('table', { class: 'lw-table' },
      h('thead', null, h('tr', null, head.map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));
}

function sec(id: string, title: string, ...kids: (Node | string)[]): HTMLElement {
  return h('section', { id }, h('h2', null, title), ...kids);
}

const TICKET_SHOWS: Record<string, string> = {
  s0: 'The student can say what charge, current, voltage, resistance, energy and power look like in the Live Wire picture, and knows the limits of the model.',
  s1: 'The student can name the elements of a complete circuit, diagnose a dead circuit, and recognise a short circuit.',
  s2: 'The student can build a circuit from a diagram, draw the circuit they built, and match symbols to parts.',
  s3: 'The student can measure current and voltage in series and parallel and say how they compare.',
  s4: 'The student can use V = I × R, read the V–I graph (gradient is R) and find an unknown resistance.',
  s5: 'The student can use P = V × I, compare energy in joules and kWh, estimate a running cost and read an Energy Rating label.',
  s6: 'The student can find useful and wasted energy, calculate efficiency and choose an improvement.',
  s7: 'The student can trace the energy transformations from source to generator and compare sources.',
};

const SEQUENCE: [string, string][] = [
  ['Week 1, lesson 1', 'Station 0 (What is electricity?) and Station 1 (Complete circuits). Introduce the one picture the whole unit uses.'],
  ['Week 1, lesson 2', 'Station 2 (Build and draw). Students swap between the 3D bench and the diagram.'],
  ['Week 1, lesson 3', 'Station 3 (Series and parallel). Take readings in a table or workbook.'],
  ['Week 2, lesson 1', 'Station 4 (Ohm\'s law). Keep the V–I graph in their books.'],
  ['Week 2, lesson 2', 'Station 5 (Power and energy). Good moment for the worked cost examples.'],
  ['Week 2, lesson 3', 'Station 6 (Efficiency).'],
  ['Week 3, lesson 1', 'Station 7 (Sources), then check tickets with the class.'],
  ['Week 3, lesson 2', 'The Job, Jobs 1 and 2 (hands-on, 12 V training house).'],
  ['Week 3, lesson 3', 'The Job, Jobs 3 to 5 (desk jobs). Students print or save the job sheet and hand it in.'],
];

function rubricRows(): (string | Node)[][] {
  return [
    ['Job 1: Fault call-out', 'Fault and location correct (50). At least one measurement that actually tells the faults apart, taken before answering (25). Reasoning question (25). The number of measurements is recorded, not scored.'],
    ['Job 2: Install a new power point', 'Parallel connection correct (35). "Switched off and checked the training supply" done before touching conductors (25, a safe-work habit; skipping it shows a calm stop card and costs the marks). Both outlets test at full voltage (15). Current prediction within 5 % (25).'],
    ['Job 3: The tripping power board', 'Currents within 5 % (40). Explanation choice (20). The plan runs without a trip (40).'],
    ['Job 4: Energy audit', 'Top three users (30). Saving achieved as a fraction of the best possible saving, found by exhaustive search (50). Efficiency explanation (20).'],
    ['Job 5: Solar and battery', 'Energy balance question answered from the Sankey diagram (30). Evening demand met with grid import under a threshold (40). Trade-off question (30).'],
  ];
}

const app = document.getElementById('app')!;
const title = h('h1', { tabindex: '-1' }, 'Live Wire for teachers');
app.append(
  h('div', { class: 'lw-page lw-teacher' },
    h('header', { class: 'lw-topbar no-print' },
      h('a', { class: 'lw-back', href: './' }, h('span', { 'aria-hidden': 'true' }, '←'), ' Live Wire'),
      h('nav', { class: 'lw-topnav' },
        h('a', { href: HUB_URL }, 'Learning Hub'),
        h('button', { class: 'lw-btn lw-btn--sm', type: 'button', onclick: () => window.print() }, 'Print'))),
    h('main', { class: 'lw-wrap' },
      h('header', { class: 'lw-pagehead' },
        h('p', { class: 'lw-kicker' }, 'Year 9 Science · NSW Science 7–10 (2023) · Energy (SC5-EGY-01)'),
        title,
        h('p', { class: 'lw-lead' }, `Live Wire is a 3D electricity simulator in two parts: Learn (eight stations) and The Job (five summative jobs). This page is for planning and marking. Version ${APP_VERSION}.`),
        h('nav', { class: 'lw-toc no-print', 'aria-label': 'On this page' },
          [['syllabus', 'Syllabus map'], ['class', 'Running it in class'], ['tickets', 'What tickets show'], ['job', 'How The Job is scored'], ['limits', 'Limits of the model'], ['safety', 'Safety position'], ['approx', 'Approximations'], ['notcovered', 'Not covered']]
            .map(([id, label]) => h('a', { href: `#${id}` }, label)))),

      sec('syllabus', 'Syllabus map',
        h('p', null, 'Dot points from the Stage 5 Energy focus area and where Live Wire covers them.'),
        table(['Dot point', 'Content', 'Where'], DOT_POINTS.map((d) => [d.code, d.text, where(d.code)]))),

      sec('class', 'Running it in class',
        h('p', null, 'Live Wire runs in a browser on school laptops and Chromebooks. There is nothing to install, no accounts and no data sent anywhere. Students can work at their own pace and jump between Guided, Free play and Checks. A suggested sequence over about three weeks (nine lessons):'),
        table(['When', 'What'], SEQUENCE.map(([a, b]) => [a, b])),
        h('ul', null,
          h('li', null, 'Graphics quality is picked automatically. If a laptop struggles, set it to Low on the home page.'),
          h('li', null, 'Progress is saved in each student\'s browser on that device. If students share a login on a shared device, ask them to press "Clear my results" on the job sheet when they finish.'),
          h('li', null, 'The Job is open from the start. You can use it as a pre-test, a post-test or both.'),
          h('li', null, 'Collecting evidence: each student opens the job sheet, types their name, and prints it (or saves it as PDF from the print dialog) and hands it in. The sheet lists the score, seed, date, app version and every answer for each job.'))),

      sec('tickets', 'What each ticket shows',
        table(['Station', 'Ticket', 'The student can…'], STATIONS.map((s) => [`${s.num}. ${s.title}`, s.ticket, TICKET_SHOWS[s.id] ?? '']))),

      sec('job', 'How The Job is scored',
        h('p', null, 'Each job is scored out of 100. Stars: 50 or more is one star, 70 or more is two, 90 or more is three. The Job gives no hints. Each attempt uses a random seed, so a retry is a different fault or dataset. The job sheet is evidence for you to review, not an automatic grade.'),
        table(['Job', 'Scored on'], rubricRows()),
        h('p', null, h('b', null, 'Job sheet. '), 'Shows stars, score, attempt date, seed, app version and every answer with a tick or cross for each of the five jobs. The name field is kept only in the browser. The best attempt is shown, with a note if the latest attempt was different.')),

      sec('limits', 'Limits of this model',
        h('p', null, MODEL_LIMITS),
        h('ul', null,
          h('li', null, 'Voltage is always shown between two named points. The glow on a dot is an "energy picture", not the voltage of a dot.'),
          h('li', null, 'Each dot stands for a very large amount of charge. The amps on a counter gate come from the circuit solution, never from counting dots on screen.'),
          h('li', null, 'Dots appear only on the low-voltage DC bench circuits and the 12 V training house. Household (230 V) content uses energy-flow displays, never dots.'),
          h('li', null, 'Electrons always move from the negative terminal to the positive terminal. Conventional current is mentioned once in Station 0 and is never assessed.'))),

      sec('safety', 'Safety position',
        h('p', null, SAFETY_MESSAGE),
        h('p', null, SAFETY_SIMPLIFIED),
        h('p', null, 'All hands-on wiring in The Job is on a 12 V training house. Nothing in the game is a mains procedure, and there is no shock simulation. Jobs 3 to 5 are desk jobs that use real household numbers (230 V) but involve no wiring. The training house shows one common Australian colour convention and states that colour never proves a wire is safe. Please reinforce that mains work is for licensed electricians only.')),

      sec('approx', 'Approximations used',
        h('ul', null,
          h('li', null, 'A globe has one fixed resistance, R = rated V² ÷ rated W. A real filament\'s resistance rises as it heats, so a real globe\'s V–I graph curves. Ohm\'s law is taught and assessed with resistors only.'),
          h('li', null, 'Batteries have a small internal resistance (0.2 Ω per pack) so a short circuit gives a large but finite current. Wires and ammeters are 0.001 Ω, a voltmeter is 10 MΩ.'),
          h('li', null, 'Protection on the bench is one labelled supply overload protector that trips after 1.5 s of overload. It is a game simplification. Safety switches (RCDs) are described in text only.'),
          h('li', null, 'Mains is AC; Live Wire treats it as steady flow. Assessed appliance maths uses resistive appliances only (heater, kettle, toaster, iron), so P = V × I holds directly.'),
          h('li', null, 'Appliance wattages, lamp and source efficiencies and the cost example (33 c/kWh) are typical figures labelled as approximate. 1 kWh = 3.6 MJ.'),
          h('li', null, 'Lamp efficiency is compared at equal light output. Source comparisons separate conversion efficiency from capacity factor. Gas is shown as a gas turbine, solar PV as direct conversion, and nuclear, geothermal and biomass are omitted.'),
          h('li', null, 'The solar job uses a fixed 24-hour load profile and a fixed clear-day solar profile, with a 90 % round-trip battery efficiency.'),
          h('li', null, 'An Energy Rating label\'s figure comes from a standard test and is an estimate. More stars means more efficient than other models of the same type and similar size.'))),

      sec('notcovered', 'What is not covered',
        h('p', null, 'These dot points are outside Live Wire. Cover them with other resources.'),
        table(['Dot point', 'Content'], NOT_COVERED.map((d) => [d.code, d.text]))),

      h('footer', { class: 'lw-footer' }, h('span', null, `Live Wire v${APP_VERSION}`), h('span', null, 'Typical figures are approximate. Check the unit and the numbers before you reuse them.')))));
title.focus({ preventScroll: true });
document.body.classList.remove('lw-fixed');
