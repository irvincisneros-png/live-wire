// Station 7: Sources. A turntable of cutaway power stations that share one generator, packets that change form
// along the chain, and a comparison of the five sources.
import './s7.css';
import type { CheckTask, CoachStep, Phase, StationHost, StationInstance } from '../../types';
import { h } from '../../ui/dom';
import {
  SHORT, SOURCE_IDS, chainIds, chainOrderCorrect, commonPartQuestion, evaluateQuestion, scrambled, sortComplete, sourceById, tableQuestion,
  type Bin, type MeasureKey, type SourceId,
} from './logic';
import { createPanel, type S7PanelState } from './panel';
import { createS7Scene } from './scene';

export function mount(host: StationHost): StationInstance {
  const scene = createS7Scene(host.view, host.quality);
  const { stage } = scene;
  const st = {
    phase: 'guided' as Phase,
    visited: new Set<SourceId>(['coal']),
    genTapped: false,
    compareChanged: false,
    panel: { source: 'coal', compare: 'efficiency', placed: {}, showSort: true, order: null } as S7PanelState,
  };

  // ───── overlay: labels and source picker ─────
  const labelLayer = h('div', { class: 's7-labels', 'aria-hidden': 'true' });
  let labelEls: HTMLElement[] = [];
  let labelKey = '';
  const picker = h('div', { class: 's7-picker', role: 'group', 'aria-label': 'Choose a source' });
  const pickBtns = new Map<SourceId, HTMLButtonElement>();
  for (const id of SOURCE_IDS) {
    const b = h('button', { type: 'button', class: 's7-pbtn', onclick: () => choose(id) }, h('span', { class: `s7-pico s7-pico-${id}`, 'aria-hidden': 'true' }), SHORT[id]);
    pickBtns.set(id, b); picker.append(b);
  }
  const tapHint = h('div', { class: 's7-taphint', hidden: true }, 'Generator: magnets spin inside coils of wire');
  const callout = h('div', { class: 's7-callout', hidden: true });
  host.view.append(labelLayer, tapHint, callout, picker);

  const panel = createPanel({
    source: (id) => choose(id),
    compare: (k: MeasureKey) => { if (k !== st.panel.compare) st.compareChanged = true; st.panel.compare = k; refresh(); },
    place: (id: SourceId, bin: Bin) => { st.panel.placed = { ...st.panel.placed, [id]: bin }; refresh(); },
    pickChip: (cid) => { const o = st.panel.order; if (o && !o.picked.includes(cid)) { o.picked = [...o.picked, cid]; refresh(); } },
    clearOrder: () => { if (st.panel.order) { st.panel.order.picked = []; refresh(); } },
  });
  host.side.replaceChildren(panel.el);

  function refresh(): void {
    st.panel.source = scene.source;
    panel.render(st.panel);
    labelLayer.hidden = !!st.panel.order;
    for (const [id, b] of pickBtns) { b.classList.toggle('is-on', id === scene.source); b.setAttribute('aria-pressed', String(id === scene.source)); }
    // no circuit quantities to read at a power station scale: keep the dashboard strip hidden
    host.dashboard.show(null);
  }
  function choose(id: SourceId): void {
    st.visited.add(id);
    scene.show(id);
    tapHint.hidden = true;
    refresh();
  }

  const onUp = (e: PointerEvent) => {
    if (stage.orbiting || e.button !== 0) return;
    if (scene.generatorAt(e.clientX, e.clientY)) { st.genTapped = true; tapHint.hidden = false; }
  };
  stage.canvas.addEventListener('pointerup', onUp);

  const offFrame = stage.onFrame(() => {
    const pts = scene.labelPoints();
    const key = scene.source + ':' + pts.length + ':' + (scene.switching ? 1 : 0);
    if (key !== labelKey) {
      labelKey = key;
      const note = scene.note();
      callout.textContent = note ?? '';
      callout.hidden = !note;
      labelEls = pts.map((p) => h('div', { class: `s7-lbl s7-lbl-${p.kind}`, style: `--c:${p.colour}` }, p.kind === 'step' ? h('i', { 'aria-hidden': 'true' }) : null, p.text));
      labelLayer.replaceChildren(...labelEls);
    }
    pts.forEach((p, i) => {
      const sp = stage.toScreen(p.pos);
      const el = labelEls[i];
      if (!el) return;
      el.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px) translate(-50%, -100%)`;
      // on narrow screens only the chain labels are shown, to keep the picture readable
      const show = sp.visible && (pts[i].kind === 'step' || host.view.clientWidth >= 600);
      el.style.visibility = show ? 'visible' : 'hidden';
    });
  });

  // ───── guided ─────
  const stepStart = { visited: new Set<SourceId>() };
  const visitedSince = (id: SourceId) => stepStart.visited.has(id);
  const mark = () => { stepStart.visited = new Set(); };
  const trackVisit = setInterval(() => { if (!scene.switching) stepStart.visited.add(scene.source); }, 150);
  const steps: CoachStep[] = [
    { text: 'Coal is on the turntable. Follow the packets from the coal to the spinning generator, then <b>tap the generator</b>.', done: () => st.genTapped && scene.source === 'coal' },
    { text: 'Switch to <b>Gas</b>. Compare it with coal: which big part is missing?', onEnter: mark, done: () => scene.source === 'gas' && !scene.switching },
    { text: 'Now look at <b>Hydro</b> and <b>Wind</b>. Neither one burns anything, so there is no heat step.', onEnter: mark, done: () => visitedSince('hydro') && visitedSince('wind') },
    { text: 'Try <b>Solar</b>. Can you find its generator?', onEnter: mark, done: () => visitedSince('solar') },
    { text: 'In the panel, use <b>Compare by</b> to rank the five sources by a different measure.', done: () => st.compareChanged },
    { text: 'Last one: in the panel, sort the five sources into renewable and non-renewable.', done: () => sortComplete(st.panel.placed) },
  ];

  // ───── checks ─────
  const q1 = commonPartQuestion(), q3 = tableQuestion(), q4 = evaluateQuestion();
  const coal = sourceById('coal');
  const hideOrder = () => { st.panel.order = null; refresh(); };
  const tasks: CheckTask[] = [
    { id: 'common-part', kind: 'choice', prompt: q1.prompt, options: q1.options, correct: q1.correct, explain: q1.explain, onStart: hideOrder },
    {
      id: 'coal-chain', kind: 'do',
      prompt: 'In the panel, tap the steps of the coal power station\'s energy chain in order, from the coal to the electricity.',
      test: () => !!st.panel.order && chainOrderCorrect(st.panel.order.picked, coal),
      explain: `Coal: ${coal.chain.map((c) => c.form).join(' → ')}. Burning turns chemical energy into heat, steam spins the turbine, and the generator makes electricity.`,
      onStart: () => { choose('coal'); st.panel.order = { source: 'coal', pool: scrambled(chainIds(coal)), picked: [] }; refresh(); host.side.scrollTop = 0; },
    },
    { id: 'table', kind: 'choice', prompt: q3.prompt, options: q3.options, correct: q3.correct, explain: q3.explain, onStart: hideOrder },
    { id: 'evaluate', kind: 'choice', prompt: q4.prompt, options: q4.options, correct: q4.correct, explain: q4.explain, onStart: hideOrder },
  ];

  const onPhase = (p: Phase) => {
    st.phase = p;
    st.genTapped = false; st.compareChanged = false;
    st.visited = new Set(['coal']);
    st.panel.compare = 'efficiency'; st.panel.placed = {}; st.panel.order = null;
    st.panel.showSort = p !== 'checks';
    tapHint.hidden = true;
    if (scene.source !== 'coal') scene.show('coal', true);
    if (p === 'guided') stage.resetView();
    refresh();
  };

  const debug = {
    scene, state: st, choose,
    complete() {
      st.genTapped = true;
      for (const id of SOURCE_IDS) stepStart.visited.add(id);
      st.compareChanged = true; st.panel.compare = 'co2';
      st.panel.placed = Object.fromEntries(SOURCE_IDS.map((id) => [id, sourceById(id).renewable ? 'renewable' : 'non-renewable'])) as S7PanelState['placed'];
      refresh();
    },
    solveOrder() { if (st.panel.order) { st.panel.order.picked = chainIds(sourceById(st.panel.order.source)); refresh(); } },
  };
  (window as unknown as { __s7?: unknown }).__s7 = debug;
  refresh();

  return {
    steps, tasks, onPhase,
    dispose() {
      clearInterval(trackVisit);
      offFrame();
      stage.canvas.removeEventListener('pointerup', onUp);
      scene.dispose();
      labelLayer.remove(); picker.remove(); tapHint.remove(); callout.remove();
      host.side.replaceChildren();
      host.dashboard.show(null);
      if ((window as unknown as { __s7?: unknown }).__s7 === debug) delete (window as unknown as { __s7?: unknown }).__s7;
    },
  };
}
