// Station 0: What is electricity? The deep zoom, one word = one visible thing.
import type { CheckTask, CoachStep, Phase, StationHost, StationInstance } from '../../types';
import { Q } from '../../types';
import { createStage } from '../../kit/stage';
import { createDeepZoom, type FocusName } from '../../lens/deepZoom';
import { LENS_R_MAX, LENS_R_MIN, LENS_V_MAX } from '../../lens/model';
import { fmt } from '../../sim/units';
import { h, s } from '../../ui/dom';
import {
  ARROW_NOTE, HALF_AMP, LIMITS, NUMBER_SETUP, PILE_SECONDS, STEP_JOULES, STEP_OHMS, STEP_VOLTS,
  SWITCH_CORRECT, SWITCH_OPTIONS, VOLTAGE_CORRECT, VOLTAGE_OPTIONS, WORDS, halfAmpOk, pileAnswer,
} from './logic';
import './s0.css';

const FOCUS_LABEL: Record<FocusName, string> = { overview: 'Whole loop', battery: 'Battery', gate: 'Gate', resistor: 'Resistor' };

export function mount(host: StationHost): StationInstance {
  const stage = createStage(host.view, host.quality, { mood: 'dark', target: [0, 2, 0], distance: 14, pitch: 0.68, minDistance: 1.4, maxDistance: 28 });
  const lens = createDeepZoom(stage, { volts: 6, ohms: 12, closed: false, focus: 'overview', overlay: host.view });

  // ───────── in-view: switch button + "where are we?" inset ─────────
  const swBtn = h('button', { type: 'button', class: 's0-swbtn', 'aria-pressed': 'false' });
  swBtn.addEventListener('click', () => lens.setClosed(!lens.input.closed));
  const inset = buildInset((f) => lens.focus(f));
  host.view.append(swBtn, inset.el);
  // when the phone sheet is open the view gets short: the sheet already has the switch, so clear the view
  const ro = new ResizeObserver(() => host.view.classList.toggle('s0-short', host.view.clientHeight < 330));
  ro.observe(host.view);

  // ───────── side panel ─────────
  const vOut = h('output', { class: 's0-out q-voltage' });
  const rOut = h('output', { class: 's0-out q-resistance' });
  const vIn = h('input', { type: 'range', min: '0', max: String(LENS_V_MAX), step: '0.5', class: 's0-range s0-range--v', 'aria-label': 'Battery voltage in volts' });
  const rIn = h('input', { type: 'range', min: String(LENS_R_MIN), max: String(LENS_R_MAX), step: '1', class: 's0-range s0-range--r', 'aria-label': 'Resistance in ohms' });
  vIn.addEventListener('input', () => lens.setVolts(Number(vIn.value)));
  rIn.addEventListener('input', () => lens.setOhms(Number(rIn.value)));
  const sideSw = h('button', { type: 'button', class: 'lw-btn lw-btn--ghost s0-sidesw', 'aria-pressed': 'false' });
  sideSw.addEventListener('click', () => lens.setClosed(!lens.input.closed));
  const focusBtns = new Map<FocusName, HTMLButtonElement>();
  const focusRow = h('div', { class: 's0-focus', role: 'group', 'aria-label': 'Fly the camera to' },
    (['overview', 'battery', 'gate', 'resistor'] as FocusName[]).map((f) => {
      const b = h('button', { type: 'button', class: 's0-fbtn', 'aria-pressed': 'false', onclick: () => lens.focus(f) }, FOCUS_LABEL[f]);
      focusBtns.set(f, b);
      return b;
    }));
  const resetBtn = h('button', { type: 'button', class: 'lw-link s0-reset', onclick: () => lens.resetEnergy() }, 'Empty the energy pile');

  const controls = h('section', { class: 'lw-card-plain s0-card', 'aria-label': 'Controls' },
    h('label', { class: 's0-field' },
      h('span', { class: 's0-flabel' }, h('span', { class: 'q-voltage' }, 'Battery voltage (V)'), vOut), vIn),
    h('label', { class: 's0-field' },
      h('span', { class: 's0-flabel' }, h('span', { class: 'q-resistance' }, 'Resistance (R)'), rOut), rIn),
    sideSw,
    h('div', { class: 's0-ftitle' }, 'Fly to'),
    focusRow,
    resetBtn);

  const legend = h('section', { class: 'lw-card-plain s0-card s0-legend', 'aria-label': 'Six words' },
    h('h3', null, 'Six words, six things you can see'),
    h('ul', { class: 's0-words' }, WORDS.map((w) => h('li', { class: `s0-word s0-word--${w.q}` },
      h('span', { class: 's0-swatch', style: `--c:${w.q === 'charge' ? '#ffffff' : Q[w.q].colour}`, 'aria-hidden': 'true' }),
      h('div', null,
        h('div', { class: 's0-wname' },
          h('b', { class: w.q === 'charge' ? '' : `q-${w.q}` }, w.name),
          w.sym ? h('span', { class: 's0-wunit' }, ` ${w.sym}, ${w.unit}`) : null),
        h('div', { class: 's0-wline' }, w.line))))),
    h('p', { class: 's0-small lw-muted' }, 'The glow on each dot is an energy picture. Dots always move from the − end of the battery to the + end.'));

  const limits = h('details', { class: 's0-details' },
    h('summary', null, 'Limits of this model'),
    h('ul', null, LIMITS.map((t) => h('li', null, t))));
  const arrow = h('details', { class: 's0-details' },
    h('summary', null, 'Why some diagrams show the arrow the other way'),
    ARROW_NOTE.map((t) => h('p', null, t)),
    h('p', { class: 's0-small lw-muted' }, 'This note is for interest only. It is not in the checks.'));
  host.side.replaceChildren(h('div', { class: 's0-side' }, controls, legend, limits, arrow));

  // ───────── keep controls + dashboard in step ─────────
  const sync = () => {
    const inp = lens.input;
    if (Number(vIn.value) !== inp.volts) vIn.value = String(inp.volts);
    if (Number(rIn.value) !== inp.ohms) rIn.value = String(inp.ohms);
    vOut.textContent = fmt(inp.volts, 'V');
    rOut.textContent = fmt(inp.ohms, 'Ω');
    const c = inp.closed;
    for (const b of [swBtn, sideSw]) {
      b.setAttribute('aria-pressed', String(c));
      b.classList.toggle('is-closed', c);
    }
    swBtn.innerHTML = `<span class="s0-swicon" aria-hidden="true"></span><span>Switch: <b>${c ? 'closed' : 'open'}</b></span>`;
    sideSw.textContent = c ? 'Open the switch' : 'Close the switch';
    for (const [f, b] of focusBtns) { b.setAttribute('aria-pressed', String(lens.focused === f)); b.classList.toggle('is-on', lens.focused === f); }
    inset.set(lens.focused, c);
  };
  const dash = () => {
    const r = lens.readings();
    host.dashboard.show({ label: 'Resistor', V: r.VR, I: r.I, R: r.R, P: r.P, E: r.E });
  };
  const offChange = lens.onChange(() => { sync(); dash(); });
  const timer = window.setInterval(dash, 250);
  sync(); dash();

  // ───────── guided steps ─────────
  const steps: CoachStep[] = [
    {
      text: 'The dots are charges, and they already fill the whole wire. <b>Close the switch</b> and watch the dots start moving almost straight away, all around the loop.',
      done: () => lens.input.closed,
    },
    {
      text: 'Now <b>open the switch</b>. The dots stop, but they stay in the wire. Charge is never used up.',
      done: () => !lens.input.closed,
    },
    {
      text: 'Close the switch again, then fly to the <b>Gate</b>. It counts dots passing each second: that is the <span class="q-current">current (I)</span>, in amps.',
      done: () => lens.input.closed && lens.focused === 'gate',
    },
    {
      text: `Slide the <span class="q-voltage">battery voltage (V)</span> up to ${STEP_VOLTS} V or more. Each dot leaves the battery with more glow, and more dots pass the gate each second.`,
      done: () => lens.input.closed && lens.input.volts >= STEP_VOLTS,
    },
    {
      text: 'Fly to the <b>Resistor</b>. Dots squeeze through the thin stretch and bump into vibrating atoms. They lose glow from A to B, and that energy leaves as <span class="q-energy">packets (E)</span>.',
      done: () => lens.focused === 'resistor',
    },
    {
      text: `Slide the <span class="q-resistance">resistance (R)</span> up to ${STEP_OHMS} Ω or more. The stretch gets thinner, fewer dots pass each second, and the current drops.`,
      done: () => lens.input.closed && lens.input.ohms >= STEP_OHMS,
    },
    {
      text: `Watch the packets pile up in the jar. <span class="q-power">Power (P)</span> in watts is how fast the pile grows: joules each second. Wait for ${STEP_JOULES} J.`,
      onEnter: () => { lens.resetEnergy(); if (!lens.input.closed) lens.setClosed(true); if (lens.focused !== 'resistor') lens.focus('resistor'); },
      done: () => lens.readings().E >= STEP_JOULES,
    },
  ];

  // ───────── checks ─────────
  const tasks: CheckTask[] = [
    {
      id: 'half-amp', kind: 'do',
      prompt: `Make the <span class="q-current">current</span> exactly <b>${HALF_AMP.toFixed(2)} A</b>. Use the voltage and resistance sliders, and keep the switch closed.`,
      test: () => halfAmpOk(lens.readings()),
      explain: 'Current = voltage ÷ resistance. For example 6 V ÷ 12 Ω = 0.50 A, and so does 9 V ÷ 18 Ω.',
      onStart: () => { lens.setVolts(3); lens.setOhms(12); lens.setClosed(true); lens.focus('gate'); },
    },
    {
      id: 'voltage-meaning', kind: 'choice',
      prompt: 'In this picture, what does the <span class="q-voltage">voltage (V)</span> across the resistor show?',
      options: VOLTAGE_OPTIONS, correct: VOLTAGE_CORRECT,
      explain: 'A voltage is always between two points. Here it is the glow (energy) each dot loses from A to B: 1 volt is 1 joule for each coulomb of charge.',
      onStart: () => { lens.setClosed(true); lens.focus('resistor'); },
    },
    {
      id: 'switch-open', kind: 'choice',
      prompt: 'You open the switch. What happens to the dots?',
      options: SWITCH_OPTIONS, correct: SWITCH_CORRECT,
      explain: 'Charge is never used up. The dots were in the wire all along. Opening the switch stops them drifting around the loop, so the current becomes zero. They still jiggle on the spot.',
      onStart: () => { lens.focus('overview'); },
    },
    {
      id: 'pile-10s', kind: 'number',
      prompt: `The dashboard shows the resistor's <span class="q-power">power (P)</span> right now. How many <span class="q-energy">joules (J)</span> will pile up in the jar in <b>${PILE_SECONDS} seconds</b>?`,
      get answer() { return pileAnswer(lens.readings()); },
      tolerance: 0.05, unit: 'J',
      get explain() {
        const P = lens.readings().P;
        return `Power is how fast the pile grows. E = P × t = ${fmt(P, 'W')} × ${PILE_SECONDS} s = ${fmt(pileAnswer({ P }), 'J')}. Joules are the pile; watts are joules each second.`;
      },
      onStart: () => { lens.setVolts(NUMBER_SETUP.volts); lens.setOhms(NUMBER_SETUP.ohms); lens.setClosed(NUMBER_SETUP.closed); lens.resetEnergy(); lens.focus('resistor'); },
    } as CheckTask,
  ];

  const resetScene = (closed: boolean) => {
    lens.setVolts(6); lens.setOhms(12); lens.setClosed(closed); lens.resetEnergy(); lens.focus('overview', 0.9);
  };

  // debug / test handle
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const dbg = {
    lens, stage,
    set(o: { volts?: number; ohms?: number; closed?: boolean }) {
      if (o.volts !== undefined) lens.setVolts(o.volts);
      if (o.ohms !== undefined) lens.setOhms(o.ohms);
      if (o.closed !== undefined) lens.setClosed(o.closed);
    },
    focus: (f: FocusName) => lens.focus(f),
    readings: () => lens.readings(),
    /** performs the guided actions in order (each step polls its own done()) */
    async complete() {
      lens.setClosed(true); await wait(700);
      lens.setClosed(false); await wait(700);
      lens.setClosed(true); lens.focus('gate'); await wait(700);
      lens.setVolts(10); await wait(700);
      lens.focus('resistor'); await wait(700);
      lens.setOhms(25); await wait(700);
      lens.setVolts(12); await wait(4500);
    },
  };
  (window as unknown as { __s0?: typeof dbg }).__s0 = dbg;

  return {
    steps, tasks,
    onPhase(p: Phase) {
      if (p === 'guided') resetScene(false);
      else if (p === 'checks') resetScene(true);
    },
    dispose() {
      window.clearInterval(timer);
      offChange();
      host.dashboard.show(null);
      lens.dispose();
      stage.dispose();
      ro.disconnect(); host.view.classList.remove('s0-short');
      swBtn.remove(); inset.el.remove();
      host.side.replaceChildren();
      const w = window as unknown as { __s0?: typeof dbg };
      if (w.__s0 === dbg) delete w.__s0;
    },
  };
}

// ───────── "where are we?" inset: the whole one-globe circuit, with a marker on the bit we are inside ─────────
function buildInset(go: (f: FocusName) => void) {
  // map x (world −6..6) → 20..140; top wire = back of the loop (battery), bottom wire = front (gate, globe)
  const X = (x: number) => 80 + x * 10;
  const T = 26, B = 84;
  const wire = 's0-iw';
  const marker = s('circle', { class: 's0-imark', r: '13', cx: '80', cy: '55' });
  const frame = s('rect', { class: 's0-iframe', x: '10', y: '14', width: '140', height: '82', rx: '12' });
  const hit = (f: FocusName, x: number, y: number, w: number, hh: number, label: string) => {
    const r = s('rect', { class: 's0-ihit', x: String(x), y: String(y), width: String(w), height: String(hh), rx: '8', tabindex: '0', role: 'button', 'aria-label': label });
    r.addEventListener('click', () => go(f));
    r.addEventListener('keydown', (e: Event) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); go(f); } });
    return r;
  };
  const G = { bat: [3.3, 0.3], sw: [-0.6, -1.2], gate: -2.4, globe: 0.6 };
  const bx = X((G.bat[0] + G.bat[1]) / 2);
  const swArm = s('line', { class: wire, x1: String(X(G.sw[0])), y1: String(T), x2: String(X(G.sw[1])), y2: String(T) });
  const svg = s('svg', { viewBox: '0 0 160 110', class: 's0-isvg', 'aria-label': 'Where are we? The whole circuit' },
    frame,
    // wires (with gaps for battery, switch and globe)
    s('path', { class: wire, d: `M ${bx - 3} ${T} H ${X(G.sw[0])} M ${X(G.sw[1])} ${T} H 32 Q 22 ${T} 22 ${T + 10} V ${B - 10} Q 22 ${B} 32 ${B} H ${X(G.globe) - 7} M ${X(G.globe) + 7} ${B} H 128 Q 138 ${B} 138 ${B - 10} V ${T + 10} Q 138 ${T} 128 ${T} H ${bx + 3}` }),
    // battery: short thick plate (−) on the left, long thin plate (+) on the right
    s('line', { class: 's0-iplate s0-iplate--neg', x1: String(bx - 3), y1: String(T - 5), x2: String(bx - 3), y2: String(T + 5) }),
    s('line', { class: 's0-iplate', x1: String(bx + 3), y1: String(T - 9), x2: String(bx + 3), y2: String(T + 9) }),
    s('text', { class: 's0-ipole', x: String(bx + 7), y: String(T - 6) }, '+'),
    s('text', { class: 's0-ipole', x: String(bx - 13), y: String(T - 6) }, '−'),
    // switch
    swArm,
    s('circle', { class: 's0-idot', cx: String(X(G.sw[0])), cy: String(T), r: '1.8' }),
    s('circle', { class: 's0-idot', cx: String(X(G.sw[1])), cy: String(T), r: '1.8' }),
    // counter gate
    s('ellipse', { class: 's0-igate', cx: String(X(G.gate)), cy: String(B), rx: '3', ry: '6' }),
    // globe
    s('circle', { class: 's0-iglobe', cx: String(X(G.globe)), cy: String(B), r: '7' }),
    s('path', { class: 's0-iglobe-x', d: `M ${X(G.globe) - 5} ${B - 5} L ${X(G.globe) + 5} ${B + 5} M ${X(G.globe) + 5} ${B - 5} L ${X(G.globe) - 5} ${B + 5}` }),
    // electron direction chevrons (− end → round the loop → + end)
    s('path', { class: 's0-ichev', d: `M ${X(-1.2)} ${B - 3} l 3 3 l -3 3 M ${X(3.2)} ${B - 3} l 3 3 l -3 3 M ${X(-3.6)} ${T - 3} l -3 3 l 3 3 M 135 58 l 3 -3 l 3 3 M 19 52 l 3 3 l 3 -3` }),
    marker,
    hit('battery', bx - 16, T - 12, 32, 24, 'Fly to the battery'),
    hit('gate', X(G.gate) - 9, B - 12, 18, 24, 'Fly to the counter gate'),
    hit('resistor', X(G.globe) - 12, B - 12, 24, 24, 'Fly to the resistor'),
    hit('overview', 40, 40, 80, 30, 'See the whole loop'));
  const el = h('div', { class: 's0-inset' }, h('div', { class: 's0-ititle' }, 'Where are we?'), svg);
  const POS: Record<Exclude<FocusName, 'overview'>, [number, number, number]> = { battery: [bx, T, 15], gate: [X(G.gate), B, 11], resistor: [X(G.globe), B, 13] };
  return {
    el,
    set(f: FocusName, closed: boolean) {
      if (f === 'overview') { marker.style.display = 'none'; frame.classList.add('is-on'); }
      else {
        const [cx, cy, r] = POS[f];
        marker.style.display = ''; marker.setAttribute('cx', String(cx)); marker.setAttribute('cy', String(cy)); marker.setAttribute('r', String(r));
        frame.classList.remove('is-on');
      }
      // switch arm: closed lies flat, open swings up
      swArm.setAttribute('x2', String(closed ? X(G.sw[1]) : X(G.sw[0]) - 4.5));
      swArm.setAttribute('y2', String(closed ? T : T - 6));
    },
  };
}
