// Station 6: Efficiency. Three lamps with the same light output, a thermal camera, energy packets and a Sankey.
import './s6.css';
import type { CheckTask, CoachStep, Phase, StationHost, StationInstance } from '../../types';
import { h } from '../../ui/dom';
import {
  IMPROVE_CORRECT, IMPROVE_OPTIONS, IRON, LAMPS, LAMP_LUMENS, LEGEND_TICKS, SHORT, WHERE_CORRECT, WHERE_OPTIONS,
  checkAnswers, lampById, mostEfficient, pct1, surfaceTempC, thermalT, watts, type LampId,
} from './logic';
import { createPanel, type PanelState } from './panel';
import { createS6Scene } from './scene';

export function mount(host: StationHost): StationInstance {
  const scene = createS6Scene(host.view, host.quality);
  const { stage } = scene;

  const st = {
    phase: 'guided' as Phase,
    selected: 'incandescent' as LampId,
    seen: new Set<LampId>(),
    measured: false,
    panel: { selected: 'incandescent', effMode: 'ask', summed: false, solved: new Set<LampId>(), showPick: true, pick: null } as PanelState,
    selectedAt: performance.now(),
  };

  // ───── overlay: lamp labels, packet key, thermal legend, controls ─────
  const labels = new Map<LampId, { el: HTMLElement; temp: HTMLElement; lm: HTMLElement }>();
  const labelLayer = h('div', { class: 's6-labels', 'aria-hidden': 'true' });
  for (const l of LAMPS) {
    const temp = h('span', { class: 's6-lbl-temp' });
    const lm = h('span', { class: 's6-lbl-lm' });
    const el = h('div', { class: 's6-lbl' }, h('b', null, SHORT[l.id]), h('span', { class: 's6-lbl-w q-power' }, `P = ${watts(l.inputW)} W in`), lm, temp);
    labels.set(l.id, { el, temp, lm });
    labelLayer.append(el);
  }
  const lampBtns = new Map<LampId, HTMLButtonElement>();
  const lampRow = h('div', { class: 's6-lamprow', role: 'group', 'aria-label': 'Choose a lamp' });
  for (const l of LAMPS) {
    const b = h('button', { type: 'button', class: 's6-vbtn', onclick: () => select(l.id) }, h('b', null, SHORT[l.id]), h('small', null, `${watts(l.inputW)} W`));
    lampBtns.set(l.id, b); lampRow.append(b);
  }
  const thermalBtn = h('button', { type: 'button', class: 's6-vbtn s6-tog', 'aria-pressed': 'false', onclick: () => setThermal(!scene.thermal) }, h('span', { class: 's6-ico s6-ico-th', 'aria-hidden': 'true' }), 'Thermal camera');
  const lightBtn = h('button', { type: 'button', class: 's6-vbtn s6-tog', 'aria-pressed': 'false', onclick: () => setMeasured(!st.measured) }, h('span', { class: 's6-ico s6-ico-lm', 'aria-hidden': 'true' }), 'Measure light');
  const key = h('div', { class: 's6-key3d' },
    h('span', null, h('i', { class: 's6-k-light', 'aria-hidden': 'true' }), 'Light (useful)'),
    h('span', null, h('i', { class: 's6-k-heat', 'aria-hidden': 'true' }), 'Heat (wasted)'),
    h('span', { class: 's6-k-note' }, '1 packet = 1 J'));
  const ctrl = h('div', { class: 's6-ctrl' }, key, h('div', { class: 's6-ctrl-row' }, lampRow, h('div', { class: 's6-togrow' }, thermalBtn, lightBtn)));
  // thermal colour scale: gradient + labelled ticks, so temperature is never shown by colour alone
  const grad = `linear-gradient(to top, ${IRON.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`;
  const scale = h('div', { class: 's6-scale', hidden: true },
    h('div', { class: 's6-scale-title' }, 'Surface temperature', h('small', null, '(approx.)')),
    h('div', { class: 's6-scale-body' },
      h('div', { class: 's6-scale-bar', style: `background:${grad}` }),
      h('div', { class: 's6-scale-ticks' }, LEGEND_TICKS.map((c) => h('span', { style: `bottom:${thermalT(c) * 100}%` }, `${c} °C`)))));
  host.view.append(labelLayer, scale, ctrl);

  // ───── side panel ─────
  const panel = createPanel({
    select: (id) => select(id),
    sum: () => { st.panel.summed = true; refresh(); },
    solved: (id) => { st.panel.solved.add(id); refresh(); },
    pick: (id) => { st.panel.pick = id; refresh(); },
  });
  host.side.replaceChildren(panel.el);

  function refresh(): void {
    st.panel.selected = st.selected;
    panel.render(st.panel);
    for (const [id, b] of lampBtns) { b.classList.toggle('is-on', id === st.selected); b.setAttribute('aria-pressed', String(id === st.selected)); }
    thermalBtn.setAttribute('aria-pressed', String(scene.thermal)); thermalBtn.classList.toggle('is-on', scene.thermal);
    lightBtn.setAttribute('aria-pressed', String(st.measured)); lightBtn.classList.toggle('is-on', st.measured);
    scale.hidden = !scene.thermal;
    host.view.classList.toggle('s6-is-thermal', scene.thermal);
    for (const l of LAMPS) {
      const lb = labels.get(l.id)!;
      lb.el.classList.toggle('is-on', l.id === st.selected);
      lb.lm.textContent = st.measured ? `${LAMP_LUMENS} lm light` : '';
      lb.lm.hidden = !st.measured;
      lb.temp.textContent = scene.thermal ? `about ${Math.round(surfaceTempC(l) / 5) * 5} °C` : '';
      lb.temp.hidden = !scene.thermal;
    }
    showDash();
  }
  function showDash(): void {
    const l = lampById(st.selected);
    const secs = (performance.now() - st.selectedAt) / 1000;
    host.dashboard.show({ label: l.name, P: l.inputW, E: l.inputW * secs });
  }
  function select(id: LampId): void {
    if (id !== st.selected) st.selectedAt = performance.now();
    st.selected = id; st.seen.add(id);
    scene.setSelected(id);
    refresh();
  }
  function setThermal(on: boolean): void { scene.setThermal(on); refresh(); }
  function setMeasured(on: boolean): void { st.measured = on; refresh(); }

  // taps on the lamps
  const onUp = (e: PointerEvent) => {
    if (stage.orbiting || e.button !== 0) return;
    const id = scene.lampAt(e.clientX, e.clientY);
    if (id) select(id);
  };
  stage.canvas.addEventListener('pointerup', onUp);

  // labels follow the lamps
  const offFrame = stage.onFrame(() => {
    for (const l of LAMPS) {
      const p = stage.toScreen(scene.labelPoint(l.id));
      const el = labels.get(l.id)!.el;
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      el.style.visibility = p.visible ? 'visible' : 'hidden';
    }
  });
  const dashTimer = setInterval(showDash, 250);

  // ───── guided steps ─────
  const steps: CoachStep[] = [
    { text: 'Three lamps, side by side. Tap each lamp to read the <span class="q-power">power (P)</span> going in on its meter.', done: () => st.seen.size >= 3 },
    { text: 'Do they give the same light? Press <b>Measure light</b> to check each one.', done: () => st.measured },
    { text: 'Same light out, but very different energy in. Where does the rest go? Turn on the <b>Thermal camera</b>.', done: () => scene.thermal },
    { text: 'Energy is never made or destroyed. In the panel, press <b>Add up the outputs</b> and check that light + heat equals the energy in.', done: () => st.panel.summed },
    { text: 'Efficiency = useful energy out ÷ total energy in × 100 %. Work it out for the selected lamp and type it in the panel.', done: () => st.panel.solved.size > 0 },
    { text: 'Which lamp is the most efficient? Answer in the panel.', done: () => st.panel.pick === mostEfficient() },
  ];

  // ───── checks ─────
  const ans = checkAnswers();
  const halo = lampById('halogen'), inc = lampById('incandescent');
  const tasks: CheckTask[] = [
    {
      id: 'eff-halogen', kind: 'number',
      prompt: `The halogen globe's meter reads ${watts(halo.inputW)} W and it gives out ${watts(halo.lightW)} W of light. What is its efficiency?`,
      answer: ans.haloEff, tolerance: 0.03, unit: '%',
      explain: `Efficiency = useful out ÷ total in × 100 = ${watts(halo.lightW)} ÷ ${watts(halo.inputW)} × 100 = ${pct1(ans.haloEff)} %.`,
      onStart: () => select('halogen'),
    },
    {
      id: 'waste-incandescent', kind: 'number',
      prompt: `The incandescent globe takes in ${watts(inc.inputW)} J of electrical energy each second and gives out ${watts(inc.lightW)} J of light. How many joules of heat does it give out each second?`,
      answer: ans.incWaste, tolerance: 0.01, unit: 'J',
      explain: `Energy in = energy out, so heat = ${watts(inc.inputW)} − ${watts(inc.lightW)} = ${watts(ans.incWaste)} J each second. No energy is lost, it is only transformed.`,
      onStart: () => { select('incandescent'); setThermal(true); },
    },
    {
      id: 'where-wasted', kind: 'choice',
      prompt: 'The thermal camera shows the incandescent globe glowing hot. What happens to this "wasted" energy?',
      options: WHERE_OPTIONS, correct: WHERE_CORRECT,
      explain: 'Energy cannot be destroyed. The wasted energy spreads into the surroundings as heat, so it still exists but is too spread out to be useful.',
    },
    {
      id: 'improve', kind: 'choice',
      prompt: 'Which change improves efficiency by cutting an unwanted energy transfer?',
      options: IMPROVE_OPTIONS, correct: IMPROVE_CORRECT,
      explain: 'Oiling the chain cuts friction, so less energy becomes heat and sound. Wrapping a hot water pipe in insulation and swapping a halogen globe for an LED work the same way.',
    },
  ];

  const onPhase = (p: Phase) => {
    st.phase = p;
    st.seen.clear(); st.measured = false;
    st.panel.summed = false; st.panel.solved = new Set(); st.panel.pick = null;
    st.panel.effMode = p === 'guided' ? 'ask' : p === 'free' ? 'reveal' : 'hide';
    st.panel.showPick = p !== 'checks';
    scene.setThermal(false);
    st.selected = 'incandescent'; st.selectedAt = performance.now();
    scene.setSelected('incandescent');
    if (p === 'guided') stage.resetView();
    refresh();
  };

  const debug = {
    scene, state: st,
    select, setThermal, setMeasured,
    complete() {
      for (const l of LAMPS) select(l.id);
      setMeasured(true); setThermal(true);
      st.panel.summed = true; st.panel.solved.add(st.selected); st.panel.pick = mostEfficient();
      refresh();
    },
  };
  (window as unknown as { __s6?: unknown }).__s6 = debug;
  refresh();

  return {
    steps, tasks, onPhase,
    dispose() {
      clearInterval(dashTimer);
      offFrame();
      stage.canvas.removeEventListener('pointerup', onUp);
      scene.dispose();
      labelLayer.remove(); scale.remove(); ctrl.remove();
      host.side.replaceChildren();
      host.dashboard.show(null);
      if ((window as unknown as { __s6?: unknown }).__s6 === debug) delete (window as unknown as { __s6?: unknown }).__s6;
    },
  };
}

