// Station 5: Power and energy. Kitchen bench, plug-in power meter, timed runs, Energy Rating labels.
import './s5.css';
import type { CheckTask, CoachStep, Phase, StationHost, StationInstance } from '../../types';
import { createStage } from '../../kit/stage';
import { EXAMPLE_PRICE_PER_KWH, MAINS_V, currentAt } from '../../sim/appliances';
import { fmt } from '../../sim/units';
import {
  RUNS, S5_IDS, clockText, lowerName, costText, createState, finishRun, grouped, meterWatts, moveMeter, runEnergyJ, runSeconds, runningAt, s5Appliance,
  startRun, stepRun, summary, type RunMode, type S5Id, type S5State,
} from './model';
import { createKitchen } from './kitchen';
import { createDock, createPanel, type PairKey } from './panel';
import { costTask, costWorking, energyTask, energyWorking, pairTask, trapTask, PRICE_LABEL } from './tasks';

const DESKTOP = { target: [-0.05, 1.4, -0.6] as [number, number, number], distance: 20, yaw: 0.08, pitch: 0.29 };
const PHONE = { target: [-1.2, 0.3, -0.6] as [number, number, number], distance: 16.5, yaw: 0.06, pitch: 0.4 };

export function mount(host: StationHost): StationInstance {
  const stage = createStage(host.view, host.quality, { mood: 'kitchen', ...DESKTOP, minDistance: 5, maxDistance: 34 });
  stage.setPanBounds(-8.5, 8.5, -3, 3);
  let narrow = false;
  {
    const r = host.view.getBoundingClientRect();
    narrow = r.width / Math.max(1, r.height) < 0.95;
    stage.setHome({ ...(narrow ? PHONE : DESKTOP) }, true);
  }

  const st: S5State = createState('microwave');
  let phase: Phase = 'guided';
  const hold = new Map<S5Id, number>();
  let clock = 0;

  const kitchen = createKitchen(stage, host.view, host.quality, { tap: (id) => plug(id), toggle: (id) => toggle(id) });
  kitchen.setMeter(st.meter.on, false);
  const dock = createDock(host.view, (m) => run(m), (on) => { if (st.run) return; for (const id of S5_IDS) st.on[id] = on; refresh(); });
  dock.setSize(host.view.clientHeight);
  const offResize = stage.onResize((w, h) => {
    const n = w / Math.max(1, h) < 0.95;
    if (n !== narrow) { narrow = n; stage.setHome({ ...(narrow ? PHONE : DESKTOP) }, true); }
    dock.setSize(h);
    host.view.classList.toggle('s5-tiny', h < 330);
  });
  const panel = createPanel(host.side, () => refresh());
  const status = document.createElement('div');
  status.className = 's5-sr'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  host.view.appendChild(status);

  function plug(id: S5Id): void {
    if (st.run) { dock.flash('Wait for the run to finish.'); return; }
    if (st.meter.on === id) return;
    moveMeter(st, id);
    kitchen.setMeter(id);
    if (narrow) { const c = kitchen.centre(id); stage.flyTo({ target: [Math.max(-6, Math.min(6, c.x)), 0.3, -0.6] }, 0.7); }
    status.textContent = `The meter is now plugged in to the ${lowerName(id)}.`;
    refresh();
  }
  function toggle(id: S5Id): void {
    if (st.run) { dock.flash('Wait for the run to finish.'); return; }
    st.on[id] = !st.on[id];
    status.textContent = `${s5Appliance(id).name} ${st.on[id] ? 'on' : 'off'}.`;
    refresh();
  }
  function run(m: RunMode, instant = false): void {
    if (st.run) return;
    if (!S5_IDS.some((id) => st.on[id])) dock.flash('Nothing is switched on, so no energy will be used.');
    startRun(st, m);
    if (instant) { finishRun(st); announce(); }
    refresh();
  }
  function announce(): void {
    const a = s5Appliance(st.meter.on);
    status.textContent = `Run finished: ${RUNS[st.last!.mode].label}. The meter on the ${lowerName(a.id)} reads ${fmt(st.meter.joules, 'J')}.`;
  }
  const lcdLines = () => {
    const sm = summary(st.meter.joules);
    return { watts: `${grouped(meterWatts(st))} W`, time: clockText(st.meter.seconds), joules: fmt(st.meter.joules, 'J'), kwh: `${Number(sm.kWh.toPrecision(3))} kWh`, cost: costText(sm.dollars) };
  };
  let lastLcd = '';
  function refresh(): void {
    dock.update(st);
    panel.update(st);
    const l = lcdLines(), key = JSON.stringify(l) + meterWatts(st);
    if (key !== lastLcd) { lastLcd = key; kitchen.setLcd(l, meterWatts(st) > 0); }
  }
  const dash = () => {
    const a = s5Appliance(st.meter.on), w = meterWatts(st);
    host.dashboard.show({ label: `Meter: ${a.name}`, V: MAINS_V, I: a.resistive ? currentAt(w) : undefined, P: w, E: st.meter.joules });
  };
  const dashTimer = window.setInterval(dash, 250);
  dash();

  const offFrame = stage.onFrame((dt) => {
    clock += dt;
    const finished = stepRun(st, dt);
    if (finished) announce();
    const r = st.run;
    kitchen.frame(dt, (id) => st.on[id], (id) => {
      const live = st.on[id] && (!r || (r.on.includes(id) && runningAt(id, r.mode, r.t)));
      if (live && r) hold.set(id, clock + 0.6);
      return live || (!!r && r.on.includes(id) && (hold.get(id) ?? 0) > clock);
    });
    if (r || finished) refresh();
  });

  // ───────────── reset / phases ─────────────
  function reset(meterOn: S5Id): void {
    st.run = null; st.last = null;
    for (const id of S5_IDS) st.on[id] = false;
    st.meter = { on: meterOn, joules: 0, seconds: 0 };
    kitchen.setMeter(meterOn, false);
    hold.clear();
    refresh();
  }
  function setScene(o: { meter: S5Id; on?: S5Id[]; viewer?: PairKey | null }): void {
    reset(o.meter);
    for (const id of o.on ?? []) st.on[id] = true;
    panel.openViewer(o.viewer ?? null);
    refresh();
  }

  // ───────────── guided steps ─────────────
  let mark = 0;
  const since = () => { mark = st.runs; };
  const ranSince = (mode: RunMode, need: S5Id[], meter?: S5Id) =>
    st.runs > mark && !!st.last && st.last.mode === mode && need.every((id) => st.last!.on.includes(id)) && (!meter || st.meter.on === meter);
  const kJ = runEnergyJ('kettle', 'day'), lJ = runEnergyJ('led-lamp', 'day'), tvJ = runEnergyJ('led-tv', 'day');
  const timeRatio = Math.round(runSeconds('led-lamp', 'day') / runSeconds('kettle', 'day'));
  const powerRatio = Math.round(s5Appliance('kettle').powerW / s5Appliance('led-lamp').powerW);
  const steps: CoachStep[] = [
    {
      text: 'Tap the <b>kettle</b> to plug the power meter in for it. Then tap the kettle\'s <b>⏻</b> button to switch it on.',
      done: () => st.meter.on === 'kettle' && st.on.kettle,
    },
    {
      text: `The meter reads <span class="q-power">power (P)</span> = ${grouped(s5Appliance('kettle').powerW)} W. That is ${grouped(s5Appliance('kettle').powerW)} joules every second. Press <b>▶ 3 minutes</b> and read the <span class="q-energy">energy (E)</span>.`,
      onEnter: since,
      done: () => ranSince('min3', ['kettle'], 'kettle'),
    },
    {
      text: `${fmt(runEnergyJ('kettle', 'min3'), 'J')} in 3 minutes. Now tap the <b>LED lamp</b> to move the meter, switch the lamp on and run <b>3 minutes</b> again.`,
      onEnter: since,
      done: () => ranSince('min3', ['led-lamp'], 'led-lamp'),
    },
    {
      text: `Only ${fmt(runEnergyJ('led-lamp', 'min3'), 'J')}: the lamp's power is tiny. With the kettle and the lamp both on, press <b>▶ Typical day</b>. The kettle boils for 10 min in total. The lamp shines for 6 h.`,
      onEnter: since,
      done: () => ranSince('day', ['kettle', 'led-lamp']),
    },
    {
      text: `Kettle ${fmt(kJ, 'J')}, lamp ${fmt(lJ, 'J')}. The lamp ran ${timeRatio} times longer, but the kettle has ${powerRatio} times more power, so the kettle still used more. Now switch the <b>TV</b> on as well and run a <b>Typical day</b> again.`,
      onEnter: since,
      done: () => ranSince('day', ['led-tv', 'kettle']),
    },
    {
      text: `The TV (${s5Appliance('led-tv').powerW} W for 5 h) used ${fmt(tvJ, 'J')}, more than the kettle! Low power for a long time can beat high power for a short time. In the panel, switch the chart to <b>Cost</b>.`,
      done: () => panel.unit === 'cost',
    },
    {
      text: `Bills count kilowatt-hours: 1 kWh = 3.6 MJ, at ${Math.round(EXAMPLE_PRICE_PER_KWH * 100)} c each (example price). Last one: open the <b>Energy Rating label viewer</b> in the panel and compare the two <b>400 L fridges</b>.`,
      done: () => panel.viewerOpen && panel.pair === 'fridge',
    },
  ];

  // ───────────── checks ─────────────
  const eT = energyTask(), cT = costTask(), pT = pairTask(), tT = trapTask();
  const tasks: CheckTask[] = [
    {
      id: 'energy-j', kind: 'number',
      prompt: `The meter is on the <b>toaster</b> and the toaster is on. Read its <span class="q-power">power (P)</span>. How many joules does it transform in <b>${eT.seconds} s</b>?`,
      answer: eT.answer, tolerance: eT.tolerance, unit: 'J',
      explain: `${energyWorking(eT)} Watts are joules per second, so multiply by the seconds.`,
      onStart: () => setScene({ meter: 'toaster', on: ['toaster'] }),
    },
    {
      id: 'cost', kind: 'number',
      prompt: `The meter is on the <b>kettle</b>. It runs for a total of <b>${cT.hours} hours</b> in a fortnight. What does that cost at ${PRICE_LABEL}? Answer in dollars.`,
      answer: cT.answer, tolerance: cT.tolerance, unit: 'dollars',
      explain: `${costWorking(cT)} Change watts to kilowatts first, then multiply by hours to get kWh.`,
      onStart: () => setScene({ meter: 'kettle', on: ['kettle'] }),
    },
    {
      id: 'label-pair', kind: 'choice',
      prompt: `The label viewer shows two 55 inch TVs: a ${pT.lo.stars}-star one (${pT.lo.kWhPerYear} kWh a year) and a ${pT.hi.stars}-star one (${pT.hi.kWhPerYear} kWh a year). Which costs less to run each year, and by about how much? Use the example price of ${Math.round(EXAMPLE_PRICE_PER_KWH * 100)} c per kWh.`,
      options: pT.options, correct: pT.correct,
      explain: `Same type and size, so the stars compare fairly. Find the difference in kWh a year (${pT.lo.kWhPerYear} − ${pT.hi.kWhPerYear}), then multiply by the price in dollars per kWh ($${EXAMPLE_PRICE_PER_KWH.toFixed(2)}).`,
      onStart: () => setScene({ meter: 'kettle', viewer: 'tv' }),
    },
    {
      id: 'size-trap', kind: 'choice',
      prompt: `Size trap: a ${tT.big.sizeLabel} fridge has ${tT.big.stars} stars and uses ${tT.big.kWhPerYear} kWh a year. A ${tT.small.sizeLabel} fridge has ${tT.small.stars} stars and uses ${tT.small.kWhPerYear} kWh a year. Why does the ${tT.big.stars}-star fridge use more energy?`,
      options: tT.options, correct: tT.correct,
      explain: 'Stars compare models of the same type and a similar size. A much bigger fridge can be efficient for its size and still use more energy in total.',
      onStart: () => setScene({ meter: 'kettle', viewer: 'trap' }),
    },
  ];

  // ───────────── test handle ─────────────
  const doStep = (i: number) => {
    const acts: (() => void)[] = [
      () => { plug('kettle'); if (!st.on.kettle) toggle('kettle'); },
      () => run('min3', true),
      () => { plug('led-lamp'); if (!st.on['led-lamp']) toggle('led-lamp'); run('min3', true); },
      () => { if (!st.on.kettle) toggle('kettle'); if (!st.on['led-lamp']) toggle('led-lamp'); run('day', true); },
      () => { if (!st.on['led-tv']) toggle('led-tv'); if (!st.on.kettle) toggle('kettle'); run('day', true); },
      () => { panel.setUnit('cost'); refresh(); },
      () => { panel.openViewer('fridge'); },
    ];
    acts[i]?.();
  };
  const dbg = {
    state: st, stage, kitchen, panel, plug, toggle, run, doStep,
    async complete() { for (let i = 0; i < steps.length; i++) { doStep(i); await new Promise((r) => setTimeout(r, 900)); } },
    setScene, phase: () => phase,
  };
  (window as unknown as { __s5?: unknown }).__s5 = dbg;

  refresh();
  return {
    steps, tasks,
    onPhase(p) {
      phase = p;
      dock.setFree(p === 'free');
      if (p === 'guided') { setScene({ meter: 'microwave' }); panel.setUnit('J'); stage.resetView(); }
      else if (p === 'checks') setScene({ meter: 'kettle' });
      refresh();
    },
    dispose() {
      offFrame(); offResize();
      host.view.classList.remove('s5-tiny');
      window.clearInterval(dashTimer);
      host.dashboard.show(null);
      dock.dispose(); panel.dispose(); status.remove();
      kitchen.dispose();
      stage.dispose();
      const w = window as unknown as { __s5?: unknown };
      if (w.__s5 === dbg) delete w.__s5;
    },
  };
}
