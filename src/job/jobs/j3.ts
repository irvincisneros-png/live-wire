// Job 3: the tripping power board. Desk job, real household numbers, no wiring.
import type { JobHost, JobInstance } from '../../types';
import { BOARD_APPLIANCES, EXPLANATION_OPTIONS, SOCKET_VS_BREAKER, mainIds } from '../../sim/powerboard';
import { MAINS_V } from '../../sim/appliances';
import '../j345.css';
import { createJ3Scene } from '../desk/j3scene';
import {
  canSubmit, currentsComplete, newState, perfectState, planComplete, poorState, runOutcome, toResult, type J3State, type Slot,
} from '../desk/j3logic';
import { choiceGroup, createWizard, gauge, h, makeDraggable, numField, openSheetOnPhones, type NumField, type Wizard } from '../desk/ui';

const SLOTS: { slot: Slot | 'none'; label: string }[] = [
  { slot: 'none', label: 'Not placed yet' },
  { slot: 'A', label: 'Circuit A (16 A breaker)' },
  { slot: 'B', label: 'Circuit B (16 A breaker)' },
  { slot: 'off', label: 'Leave off' },
];

export function mount(host: JobHost): JobInstance {
  const st: J3State = newState();
  const view = host.view;
  view.replaceChildren();
  const scene = createJ3Scene(view, host.quality);

  // meters over the view
  const gBoard = gauge({ label: 'Power board', max: 25, limit: 10, limitLabel: '10 A cut-out' });
  const gA = gauge({ label: 'Circuit A', max: 25, limit: 16, limitLabel: '16 A breaker' });
  const gB = gauge({ label: 'Circuit B', max: 25, limit: 16, limitLabel: '16 A breaker' });
  const meters = h('div', { class: 'j3-meters', 'aria-label': 'Current meters' }, gBoard.el, gA.el, gB.el);
  view.appendChild(meters);
  const badge = h('div', { class: 'j3-badge', role: 'status', 'aria-live': 'polite' });
  view.appendChild(badge);
  scene.setGauges({ board: gBoard, a: gA, b: gB });
  gA.el.hidden = gB.el.hidden = true;

  let wiz!: Wizard;
  const fields = new Map<string, NumField>();
  let planCleanups: (() => void)[] = [];
  const runStatus = h('div', { class: 'j3-run', 'aria-live': 'polite' });
  const tripStatus = h('p', { class: 'dk-status-line', 'aria-live': 'polite' });
  const bins = new Map<string, HTMLElement>();
  let runBtn!: HTMLButtonElement;
  let tripBtn!: HTMLButtonElement;
  let exp!: ReturnType<typeof choiceGroup>;
  let disposed = false;

  // ───── step bodies ─────
  const step1 = () => {
    tripBtn = h('button', { class: 'lw-btn lw-btn--lg', type: 'button', onclick: () => {
      if (scene.isBusy()) return;
      tripBtn.disabled = true; badge.textContent = ''; badge.classList.remove('is-on');
      tripStatus.textContent = 'Plugging things in…';
      scene.playTrip(() => {
        if (disposed) return;
        st.sawTrip = true; tripBtn.disabled = false; tripBtn.textContent = 'Watch it again';
        badge.textContent = 'The 10 A cut-out popped. Everything went dark.'; badge.classList.add('is-on');
        tripStatus.textContent = 'The board tripped and the power went out.';
        wiz.refresh();
      });
    } }, 'Plug everything in') as HTMLButtonElement;
    return h('div', { class: 'dk-stepbody' },
      h('p', null, 'This power board has a red overload reset button and a "10 A MAX" label. Press the button and watch the current meter as appliances are switched on.'),
      h('p', { class: 'dk-small' }, SOCKET_VS_BREAKER),
      tripBtn, tripStatus);
  };

  const step2 = () => {
    const rows = mainIds().map((id) => {
      const a = BOARD_APPLIANCES.find((x) => x.id === id)!;
      const f = numField({ label: `${a.name} current`, unit: 'A', id: `j3-i-${id}`, compact: true, onInput: () => { st.currentsText[id] = f.input.value; wiz.refresh(); } });
      fields.set(id, f);
      return h('tr', null,
        h('th', { scope: 'row' }, a.name),
        h('td', { class: 'dk-r' }, `${a.powerW} W`),
        h('td', null, f.el));
    });
    return h('div', { class: 'dk-stepbody' },
      h('p', null, `Mains voltage is ${MAINS_V} V. Work out the current each appliance draws. Round to two decimal places if you like.`),
      h('table', { class: 'dk-table' },
        h('caption', { class: 'dk-sr' }, 'Appliance power and current'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Appliance'), h('th', { scope: 'col', class: 'dk-r' }, 'Power'), h('th', { scope: 'col' }, 'Current (A)'))),
        h('tbody', null, rows)));
  };

  const step3 = () => {
    exp = choiceGroup({ name: 'j3-exp', legend: 'Why did the board trip?', options: EXPLANATION_OPTIONS, onChange: (i) => { st.explanation = i; wiz.refresh(); } });
    return h('div', { class: 'dk-stepbody' }, exp.el);
  };

  function applyAssign(id: string, slot: Slot | 'none'): void {
    if (slot === 'none') delete st.assign[id]; else st.assign[id] = slot;
    st.ranCurrent = false; st.tripped = false;
    runStatus.replaceChildren();
    scene.setAssign(st.assign);
    renderPlan();
    wiz.refresh();
  }

  function renderPlan(): void {
    planCleanups.forEach((c) => c()); planCleanups = [];
    for (const { slot } of SLOTS) {
      const bin = bins.get(slot)!;
      const list = bin.querySelector('.j3-bin-list') as HTMLElement;
      list.replaceChildren();
      const ids = BOARD_APPLIANCES.map((a) => a.id).filter((id) => (st.assign[id] ?? 'none') === slot);
      if (!ids.length) list.appendChild(h('p', { class: 'j3-empty' }, slot === 'none' ? 'All placed.' : 'Drop appliances here.'));
      for (const id of ids) {
        const a = BOARD_APPLIANCES.find((x) => x.id === id)!;
        const seg = h('div', { class: 'dk-seg', role: 'group', 'aria-label': `Put the ${a.name.toLowerCase()} on` },
          (['A', 'B', 'off'] as const).map((sl) => h('button', {
            class: 'dk-seg-b', type: 'button', 'aria-pressed': String(st.assign[id] === sl), 'data-slot': sl,
            'aria-label': sl === 'off' ? `Leave the ${a.name.toLowerCase()} off` : `${a.name} on circuit ${sl}`,
            onclick: () => applyAssign(id, sl),
          }, sl === 'off' ? 'Off' : sl)));
        const grip = h('span', { class: 'j3-grip', 'aria-hidden': 'true', title: 'Drag' }, '⋮⋮');
        const chip = h('div', { class: `j3-chip${a.group === 'small' ? ' is-small' : ''}`, 'data-id': id },
          grip, h('span', { class: 'j3-chip-name' }, a.name), h('span', { class: 'j3-chip-w' }, `${a.powerW} W`), seg);
        planCleanups.push(makeDraggable(chip, grip, {
          dropSel: '.j3-bin',
          onOver: (t) => { for (const b of bins.values()) b.classList.toggle('is-over', b === t); },
          onDrop: (t) => applyAssign(id, t.dataset.slot as Slot | 'none'),
        }));
        list.appendChild(chip);
      }
    }
  }

  const step4 = () => {
    const wrap = h('div', { class: 'dk-stepbody' },
      h('p', null, 'Share the appliances between two circuits, or leave some off. Drag a card to a circuit, or use the A, B and Off buttons. At least four of the five main appliances must run.'));
    for (const { slot, label } of SLOTS) {
      const bin = h('div', { class: `j3-bin j3-bin--${slot}`, 'data-slot': slot, role: 'group', 'aria-label': label },
        h('h4', { class: 'j3-bin-h' }, label), h('div', { class: 'j3-bin-list' }));
      bins.set(slot, bin);
      wrap.appendChild(bin);
    }
    wrap.appendChild(h('p', { class: 'dk-small' }, 'The phone charger and the lamp are small loads. You may leave them where they are.'));
    renderPlan();
    return wrap;
  };

  function describeRun(): void {
    const o = runOutcome(st.assign);
    const line = (name: string, a: number, trip: boolean) => h('li', { class: trip ? 'is-bad' : 'is-good' }, `${name}: ${a.toFixed(1)} A. `, trip ? 'Over 16 A, so the breaker tripped.' : 'The breaker held.');
    runStatus.replaceChildren(h('ul', { class: 'j3-runlist' }, line('Circuit A', o.a, o.tripA), line('Circuit B', o.b, o.tripB)),
      h('p', { class: 'dk-small' }, o.held ? 'Nothing tripped. You can submit, or change the plan and run it again.'
        : o.tripA || o.tripB ? 'A breaker tripped. You may change the plan and run it again, or submit.'
        : 'Neither breaker tripped, but fewer than four main appliances were running. Add one and run the plan again, or submit.'));
  }

  const step5 = () => {
    runBtn = h('button', { class: 'lw-btn lw-btn--lg', type: 'button', onclick: () => {
      if (scene.isBusy() || !planComplete(st.assign)) return;
      runBtn.disabled = true; runStatus.replaceChildren(h('p', null, 'Running the plan…'));
      st.runs++;
      scene.playRun(st.assign, () => {
        if (disposed) return;
        st.ranCurrent = true; st.tripped = !runOutcome(st.assign).held;
        runBtn.disabled = false; runBtn.textContent = 'Run the plan again';
        describeRun(); wiz.refresh();
      });
    } }, 'Run the plan') as HTMLButtonElement;
    return h('div', { class: 'dk-stepbody' },
      h('p', null, 'Switch on every appliance you placed. Each circuit has its own meter. If a circuit goes over 16 A its breaker trips.'),
      runBtn, runStatus,
      h('p', { class: 'dk-small' }, 'Submit when you are happy. Your answers and the number of runs are saved on your job sheet.'));
  };

  wiz = createWizard(host.panel, {
    kicker: 'Job 3 · Ohm, Power',
    title: 'The tripping power board',
    task: 'A power board keeps cutting out. Work out why, then share the appliances over two circuits so nothing trips.',
    note: 'Real mains wiring is for licensed electricians. This is a desk job with real numbers: no wiring.',
    submitLabel: 'Submit job',
    steps: [
      { id: 'trip', title: 'Watch it trip', build: step1, complete: () => st.sawTrip, need: 'Press "Plug everything in" and watch the meter.' },
      { id: 'currents', title: 'Work out the currents', build: step2, complete: () => currentsComplete(st.currentsText), need: 'Enter a current in amps for all five appliances.' },
      { id: 'explain', title: 'Explain the trip', build: step3, complete: () => st.explanation !== null, need: 'Choose one explanation.' },
      { id: 'plan', title: 'Plan two circuits', build: step4, complete: () => planComplete(st.assign), need: 'Place each of the five main appliances on A, B or off.' },
      { id: 'run', title: 'Run and submit', build: step5, complete: () => st.ranCurrent, need: 'Run the plan before you submit.' },
    ],
    canSubmit: () => canSubmit(st),
    onSubmit() { host.finish(toResult(st)); },
    onStep(i) {
      const plan = i >= 3;
      scene.setMode(plan ? 'plan' : 'board');
      if (plan) scene.setAssign(st.assign);
      gBoard.el.hidden = plan; gA.el.hidden = gB.el.hidden = !plan;
      if (i !== 0) badge.textContent = '', badge.classList.remove('is-on');
    },
  });
  openSheetOnPhones(host.panel);

  // ───── tester handles ─────
  function fill(s: J3State): void {
    for (const id of mainIds()) fields.get(id)!.set(s.currentsText[id] ?? '');
    exp.set(s.explanation);
    st.sawTrip = s.sawTrip;
    st.assign = {};
    for (const [id, sl] of Object.entries(s.assign)) if (sl) st.assign[id] = sl;
    st.runs = s.runs; st.ranCurrent = s.ranCurrent; st.tripped = s.tripped;
    scene.setAssign(st.assign); renderPlan();
    wiz.go(4);
    describeRun();
  }
  const api = {
    state: st, scene, wizard: wiz,
    go: (i: number) => wiz.go(i),
    fill(poor = false) { fill(poor ? poorState() : perfectState()); },
    solve() { fill(perfectState()); (host.panel.querySelector('[data-role="submit"]') as HTMLButtonElement | null)?.click(); },
    solvePoorly() { fill(poorState()); (host.panel.querySelector('[data-role="submit"]') as HTMLButtonElement | null)?.click(); },
    /** plays the real animations for a screenshot: trip, then the plan */
    trip() { scene.playTrip(() => { st.sawTrip = true; wiz.refresh(); }); },
    run() { st.runs++; scene.playRun(st.assign, () => { st.ranCurrent = true; describeRun(); wiz.refresh(); }); },
  };
  (window as unknown as { __j3?: unknown }).__j3 = api;

  return {
    dispose() {
      disposed = true;
      planCleanups.forEach((c) => c());
      scene.dispose();
      wiz.dispose();
      view.replaceChildren(); host.panel.replaceChildren();
      if ((window as unknown as { __j3?: unknown }).__j3 === api) delete (window as unknown as { __j3?: unknown }).__j3;
    },
  };
}
