// Job 5: solar and battery. Size the system, run a simulated day, read the Sankey, answer two questions.
import type { JobHost, JobInstance } from '../../types';
import { TRADEOFF_OPTIONS, sankeyFor, type SolarResult } from '../../sim/solar';
import '../j345.css';
import { createJ5Scene, FLOW_COLOURS, FLOW_LABELS } from '../desk/j5scene';
import {
  BATTERY_MAX_KWH, PANELS_PER_KW, PV_MAX_KW, canSubmit, clockText, designCurrent, finalResult, modulesFor, newState, panelsFor, perfectState, poorState,
  runDesign, toResult, type J5State,
} from '../desk/j5logic';
import { createStackChart } from '../desk/stackChart';
import { sankeySvg } from '../desk/sankey';
import { choiceGroup, createWizard, h, numField, openSheetOnPhones, raf, type NumField, type Wizard } from '../desk/ui';

const DAY_SECONDS = 9;

export function mount(host: JobHost): JobInstance {
  const st: J5State = newState();
  const view = host.view;
  view.replaceChildren();
  const scene = createJ5Scene(view, host.quality);
  const clock = h('div', { class: 'j5-clock', 'aria-live': 'off' }, h('span', { class: 'j5-clock-t' }, '8:00 am'), h('span', { class: 'j5-clock-s' }, 'One clear day'));
  const legend = h('ul', { class: 'j5-flowkey', 'aria-label': 'Energy flow colours' },
    (Object.keys(FLOW_COLOURS) as (keyof typeof FLOW_COLOURS)[]).map((k) => h('li', null, h('span', { class: 'j5-dot', style: `background:#${FLOW_COLOURS[k].toString(16).padStart(6, '0')}` }), FLOW_LABELS[k])));
  view.append(clock, legend, h('p', { class: 'j5-disclaimer' }, 'Models one clear day. Sizes and prices are examples.'));

  let wiz!: Wizard;
  let result: SolarResult | null = null;
  let stopPlay: (() => void) | null = null;
  const chart = createStackChart();
  const pvRange = h('input', { type: 'range', class: 'j5-range', id: 'j5-pv', min: '0', max: String(PV_MAX_KW), step: '1', value: String(st.pv), 'aria-describedby': 'j5-pv-v' }) as HTMLInputElement;
  const batRange = h('input', { type: 'range', class: 'j5-range', id: 'j5-bat', min: '0', max: String(BATTERY_MAX_KWH), step: '1', value: String(st.battery), 'aria-describedby': 'j5-bat-v' }) as HTMLInputElement;
  const pvVal = h('output', { id: 'j5-pv-v', class: 'j5-val' });
  const batVal = h('output', { id: 'j5-bat-v', class: 'j5-val' });
  const scrub = h('input', { type: 'range', class: 'j5-range j5-scrub', id: 'j5-scrub', min: '0', max: '24', step: '0.05', value: '8', disabled: true, 'aria-label': 'Time of day' }) as HTMLInputElement;
  const runBtn = h('button', { class: 'lw-btn lw-btn--lg', type: 'button', onclick: () => runNow(true) }, 'Run the day') as HTMLButtonElement;
  const stale = h('p', { class: 'j5-stale', role: 'status' });
  const tries = h('p', { class: 'dk-small j5-tries' });
  const readout = h('p', { class: 'j5-readout', 'aria-live': 'off' });
  const sankeyHost = h('div', { class: 'j5-sankeyhost' });
  const sankeyHost2 = h('div', { class: 'j5-sankeyhost' });
  let balance!: NumField;
  let trade!: ReturnType<typeof choiceGroup>;
  const summary = h('div', { class: 'j5-summary' });

  function syncLabels(): void {
    pvVal.textContent = `${st.pv} kW (${panelsFor(st.pv)} panels)`;
    batVal.textContent = st.battery > 0 ? `${st.battery} kWh (${modulesFor(st.battery)} ${modulesFor(st.battery) === 1 ? 'module' : 'modules'})` : 'none';
    pvRange.setAttribute('aria-valuetext', pvVal.textContent);
    batRange.setAttribute('aria-valuetext', batVal.textContent);
    scene.setDesign(st.pv, st.battery);
    stale.textContent = result && !designCurrent(st) ? 'You changed the sizes. Run the day again to use them.' : '';
    tries.textContent = st.attempts.length ? `Designs tried: ${st.attempts.length}. You can run as many as you like.` : 'Choose sizes, then run the day. You can try as many designs as you like.';
  }

  function showHour(hh: number): void {
    scrub.value = String(hh);
    clock.firstElementChild!.textContent = clockText(hh >= 24 ? 23.99 : hh);
    scene.setTime(hh, result);
    chart.update(result, hh);
    if (result) {
      const i = Math.min(23, Math.floor(hh));
      const soc = result.hourly.soc[i];
      readout.textContent = `${clockText(hh >= 24 ? 23.99 : hh)}: battery holds ${soc.toFixed(1)} kWh. House uses ${result.hourly.load[i].toFixed(1)} kWh this hour; solar makes ${result.hourly.pv[i].toFixed(1)} kWh.`;
    }
  }

  function stopPlaying(): void { stopPlay?.(); stopPlay = null; runBtn.textContent = result ? 'Run the day again' : 'Run the day'; }

  function runNow(animate: boolean): void {
    stopPlaying();
    result = runDesign(st);
    scrub.disabled = false;
    syncLabels(); renderSankeys();
    wiz.refresh();
    if (!animate) { showHour(24); return; }
    runBtn.textContent = 'Playing…';
    let t = 0;
    showHour(0);
    stopPlay = raf((dt) => {
      t += dt;
      const hh = Math.min(24, (t / DAY_SECONDS) * 24);
      showHour(hh);
      if (hh >= 24) stopPlaying();
    });
  }

  function renderSankeys(): void {
    for (const box of [sankeyHost, sankeyHost2]) {
      const r = finalResult(st);
      if (!r || !designCurrent(st)) { box.replaceChildren(h('p', { class: 'j5-stale' }, 'Run the day with your final sizes first.')); continue; }
      const sk = sankeyFor(r);
      box.replaceChildren(
        sankeySvg(sk),
        h('table', { class: 'dk-table j5-flowtable' },
          h('caption', { class: 'dk-sr' }, 'Energy flows over the day in kilowatt hours'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'From'), h('th', { scope: 'col' }, 'To'), h('th', { scope: 'col', class: 'dk-r' }, 'kWh'))),
          h('tbody', null, sk.flows.map((f) => h('tr', null, h('td', null, f.from), h('td', null, f.to), h('td', { class: 'dk-r' }, f.kWh.toFixed(1)))))));
    }
  }

  // ───── steps ─────
  const step1 = () => {
    pvRange.addEventListener('input', () => { st.pv = Number(pvRange.value); syncLabels(); wiz.refresh(); });
    batRange.addEventListener('input', () => { st.battery = Number(batRange.value); syncLabels(); wiz.refresh(); });
    scrub.addEventListener('input', () => { stopPlaying(); showHour(Number(scrub.value)); });
    return h('div', { class: 'dk-stepbody' },
      h('p', null, 'Choose the size of the solar panels and the battery for this house. Then run the day and watch where the energy goes. Hour by hour, solar serves the house first, spare solar charges the battery, and what is left goes to the grid.'),
      h('div', { class: 'j5-ctl' },
        h('label', { class: 'dk-label', for: 'j5-pv' }, 'Solar panels (kW)'), pvVal, pvRange,
        h('label', { class: 'dk-label', for: 'j5-bat' }, 'Battery (kWh)'), batVal, batRange),
      runBtn, stale, tries,
      h('div', { class: 'j5-scrubrow' }, h('label', { class: 'dk-label', for: 'j5-scrub' }, 'Time of day'), scrub),
      readout,
      chart.el,
      h('p', { class: 'dk-small' }, `Each ${(1 / PANELS_PER_KW * 1000).toFixed(0)} W panel adds to the size. This models one clear day. Sizes and prices are examples.`));
  };
  const step2 = () => h('div', { class: 'dk-stepbody' },
    h('p', null, 'This Sankey diagram shows where every kilowatt hour went over the day for your final design. A thicker band is more energy.'),
    sankeyHost);
  const step3 = () => {
    balance = numField({ label: 'Energy the house did not use', unit: 'kWh', id: 'j5-balance', onInput: () => { st.balanceText = balance.input.value; wiz.refresh(); } });
    return h('div', { class: 'dk-stepbody' },
      h('p', null, 'How many kWh did the house not use? That means the energy that was exported, lost as heat or left in the battery. Use the numbers on the Sankey.'),
      balance.el,
      h('details', { class: 'j5-again' }, h('summary', null, 'Show the Sankey again'), sankeyHost2));
  };
  const step4 = () => {
    trade = choiceGroup({ name: 'j5-trade', legend: 'What is the trade-off of a bigger battery?', options: TRADEOFF_OPTIONS, onChange: (i) => { st.tradeoff = i; wiz.refresh(); } });
    return h('div', { class: 'dk-stepbody' }, trade.el);
  };
  const step5 = () => h('div', { class: 'dk-stepbody' },
    h('p', null, 'Check your answers, then submit. Your design and your answers are saved on your job sheet.'), summary);

  wiz = createWizard(host.panel, {
    kicker: 'Job 5 · Efficiency, Sources',
    title: 'Solar and battery',
    task: 'Choose solar panels and a battery for this house so the evening runs on solar and stored energy, with little grid power.',
    submitLabel: 'Submit job',
    steps: [
      { id: 'design', title: 'Design and run', build: step1, complete: () => designCurrent(st), need: 'Run the day with your chosen sizes.' },
      { id: 'sankey', title: 'Read the Sankey', build: step2, complete: () => designCurrent(st), need: '' },
      { id: 'balance', title: 'Energy balance', build: step3, complete: () => balance !== undefined && balance.value() !== undefined, need: 'Enter a number of kWh.' },
      { id: 'tradeoff', title: 'The trade-off', build: step4, complete: () => st.tradeoff !== null, need: 'Choose one answer.' },
      { id: 'submit', title: 'Submit', build: step5, complete: () => false, need: '' },
    ],
    canSubmit: () => canSubmit(st),
    onSubmit() { stopPlaying(); host.finish(toResult(st)); },
    onStep(i) {
      renderSankeys();
      if (i === 4) summary.replaceChildren(
        h('p', null, h('b', null, 'Design: '), `${st.ran?.pv ?? st.pv} kW of panels and a ${st.ran?.battery ?? st.battery} kWh battery.`),
        h('p', null, h('b', null, 'Balance answer: '), `${st.balanceText} kWh`),
        h('p', null, h('b', null, 'Trade-off: '), st.tradeoff === null ? 'no answer' : TRADEOFF_OPTIONS[st.tradeoff]));
    },
  });
  syncLabels();
  chart.update(null, 0);
  showHour(8);
  openSheetOnPhones(host.panel);

  // ───── tester handles ─────
  function fill(s: J5State): void {
    stopPlaying();
    pvRange.value = String(s.pv); batRange.value = String(s.battery);
    st.pv = s.pv; st.battery = s.battery;
    runNow(false);
    balance.set(s.balanceText);
    if (s.tradeoff !== null) trade.set(s.tradeoff);
    wiz.refresh(); wiz.go(4);
  }
  const click = () => (host.panel.querySelector('[data-role="submit"]') as HTMLButtonElement | null)?.click();
  const api = {
    state: st, scene, wizard: wiz, go: (i: number) => wiz.go(i),
    /** set the sliders and run the day (animate = play it) */
    design(pv: number, battery: number, animate = false) { pvRange.value = String(pv); batRange.value = String(battery); st.pv = pv; st.battery = battery; syncLabels(); runNow(animate); },
    hour: (hh: number) => { stopPlaying(); showHour(hh); },
    fill(poor = false) { fill(poor ? poorState() : perfectState()); },
    solve() { fill(perfectState()); click(); },
    solvePoorly() { fill(poorState()); click(); },
  };
  (window as unknown as { __j5?: unknown }).__j5 = api;

  return {
    dispose() {
      stopPlaying();
      scene.dispose(); wiz.dispose();
      view.replaceChildren(); host.panel.replaceChildren();
      if ((window as unknown as { __j5?: unknown }).__j5 === api) delete (window as unknown as { __j5?: unknown }).__j5;
    },
  };
}
