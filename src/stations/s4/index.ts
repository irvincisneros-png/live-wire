// Station 4: Ohm's law (ticket "Ohm"). Adjustable supply, ammeter, resistor, voltmeter, and a live V-I graph.
import './s4.css';
import type { CheckTask, CoachStep, Dashboard, Part, Phase, Reading, StationHost, StationInstance, TrayItem } from '../../types';
import { solve, meterReading } from '../../sim/circuit';
import { h, s as svg } from '../../ui/dom';
import { mountBench, TRAY } from '../benchCommon';
import {
  RESISTORS, type Pt, type Shape, fitThroughOrigin, groupLabel, groupOf, lineEnd, mysteryRecorded, ohmParts, pickMystery, ratio, shapeOf, sig3,
} from './logic';

const XMAX = 1.2, YMAX = 12;
const FREE_TRAY = (): TrayItem[] => [TRAY.cell(2), TRAY.pack6(1), TRAY.wire(), TRAY.switch(2), TRAY.globe(2), TRAY.resistor(10, 2), TRAY.resistor(22, 2), TRAY.resistor(47, 2), TRAY.ammeter(2), TRAY.voltmeter(2)];

type SceneName = 'ohm' | 'mystery' | 'calc';

export function mount(host: StationHost): StationInstance {
  let mask: ((r: Reading) => Reading) | null = null;
  const dash: Dashboard = { show: (r) => host.dashboard.show(r && mask ? mask(r) : r) };
  const rig = mountBench({ view: host.view, dashboard: dash, quality: host.quality }, { tray: [], readOnly: true, adjustableSupply: { partId: 'PSU', min: 0, max: 12, step: 0.5 } });
  const { bench } = rig;
  const P = (c: number, r: number): number => bench.postId(c, r);

  let mode: Phase = 'guided';
  let scene: SceneName = 'ohm';
  let points: Pt[] = [];
  let activeGroup = '22';
  let R = 22;
  const mysteryValue = pickMystery(Math.floor(Math.random() * 1e9));

  // ───────── side panel ─────────
  const vOut = h('output', { class: 'q-voltage' });
  const slider = h('input', { type: 'range', min: '0', max: '12', step: '0.5', 'aria-label': 'Supply voltage in volts' }) as HTMLInputElement;
  slider.addEventListener('input', () => bench.editPart('PSU', { emf: Number(slider.value) }));
  const sliderBox = h('label', { class: 's4-slider' }, h('span', null, 'Supply voltage'), vOut, slider);
  const picker = h('div', { class: 's4-picker', role: 'radiogroup', 'aria-label': 'Resistor' });
  const pickBtns = RESISTORS.map((r) => h('button', { class: 's4-pick', type: 'button', role: 'radio', onclick: () => chooseR(r) }, `${r} Ω`));
  picker.append(...pickBtns);
  const pickLabel = h('p', { class: 's4-label' }, 'Resistor');
  const mysteryLabel = h('p', { class: 's4-label' }, 'The resistor is hidden. Its value is what you are finding.');
  const controls = h('div', { class: 's4-block s4-controls' }, sliderBox, pickLabel, picker, mysteryLabel);

  const msg = h('p', { class: 's4-msg', role: 'status', 'aria-live': 'polite' });
  const recBtn = h('button', { class: 'lw-btn', type: 'button', onclick: () => recordPoint() }, 'Record point');
  const clrBtn = h('button', { class: 'lw-btn lw-btn--ghost lw-btn--sm', type: 'button', onclick: () => { points = []; render(); say('Graph cleared.'); } }, 'Clear graph');
  const recBlock = h('div', { class: 's4-recwrap' }, h('div', { class: 's4-row' }, recBtn, clrBtn), msg);
  controls.appendChild(recBlock);

  const graph = svg('svg', { class: 's4-graph', viewBox: '0 0 320 262', role: 'img' });
  const legend = h('ul', { class: 's4-legend' });
  const grad = h('p', { class: 's4-grad', 'aria-live': 'polite' });
  const gnote = h('p', { class: 's4-note' }, 'A globe is only roughly like a resistor. Its resistance changes as it heats up, and this simulator treats it as fixed.');
  const graphBlock = h('div', { class: 's4-block' }, h('h3', null, 'V–I graph'), graph, legend, grad);
  const tbody = h('tbody');
  const table = h('table', { class: 's4-table' }, h('thead', null, h('tr', null, h('th', null, 'R'), h('th', null, 'V (V)'), h('th', null, 'I (A)'), h('th', null, 'V ÷ I (Ω)'))), tbody);
  const tableBlock = h('div', { class: 's4-block' }, h('h3', null, 'Results table'), h('div', { class: 's4-tablewrap' }, table));
  const noteEl = h('p', { class: 's4-note' });
  const noteBlock = h('div', { class: 's4-block' }, noteEl);
  const diagram = h('details', { class: 's4-block s4-diagram' }, h('summary', null, 'Circuit diagram'), bench.diagram);
  host.side.replaceChildren(h('div', { class: 's4-side' }, noteBlock, controls, graphBlock, tableBlock, gnote, diagram));

  function say(t: string): void { msg.textContent = t; }

  // ───────── graph drawing ─────────
  const PX0 = 52, PX1 = 308, PY0 = 214, PY1 = 12;
  const gx = (i: number) => PX0 + (i / XMAX) * (PX1 - PX0);
  const gy = (v: number) => PY0 - (v / YMAX) * (PY0 - PY1);

  function marker(shape: Shape, cx: number, cy: number): SVGElement {
    const r = 5.5;
    switch (shape) {
      case 'circle': return svg('circle', { class: 's4-mk', cx, cy, r });
      case 'square': return svg('rect', { class: 's4-mk', x: cx - r, y: cy - r, width: 2 * r, height: 2 * r });
      case 'triangle': return svg('path', { class: 's4-mk', d: `M${cx} ${cy - r - 1}L${cx + r + 1} ${cy + r}L${cx - r - 1} ${cy + r}Z` });
      case 'diamond': return svg('path', { class: 's4-mk', d: `M${cx} ${cy - r - 1.5}L${cx + r + 1.5} ${cy}L${cx} ${cy + r + 1.5}L${cx - r - 1.5} ${cy}Z` });
      case 'cross': return svg('path', { class: 's4-mkx', d: `M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}` });
      case 'star': return svg('path', { class: 's4-mkx', d: `M${cx} ${cy - r - 1}V${cy + r + 1}M${cx - r - 1} ${cy}H${cx + r + 1}M${cx - r + 1} ${cy - r + 1}L${cx + r - 1} ${cy + r - 1}M${cx + r - 1} ${cy - r + 1}L${cx - r + 1} ${cy + r - 1}` });
      default: return svg('path', { class: 's4-mk', d: `M${cx - r} ${cy}L${cx - r / 2} ${cy - r}H${cx + r / 2}L${cx + r} ${cy}L${cx + r / 2} ${cy + r}H${cx - r / 2}Z` });
    }
  }

  const groups = (): string[] => [...new Set(points.map((p) => p.group))];
  const fitFor = (g: string): number | null => { const pts = points.filter((p) => p.group === g); return pts.length >= 3 && g !== 'globe' ? fitThroughOrigin(pts) : null; };

  function drawGraph(): void {
    const kids: SVGElement[] = [];
    for (let i = 0; i <= 6; i++) {
      const x = gx(i * 0.2);
      kids.push(svg('line', { class: 's4-grid', x1: x, x2: x, y1: PY1, y2: PY0 }));
      kids.push(svg('text', { x, y: PY0 + 15, 'text-anchor': 'middle' }, (i * 0.2).toFixed(1)));
    }
    for (let v = 0; v <= YMAX; v += 2) {
      const y = gy(v);
      kids.push(svg('line', { class: 's4-grid', x1: PX0, x2: PX1, y1: y, y2: y }));
      kids.push(svg('text', { x: PX0 - 7, y: y + 4, 'text-anchor': 'end' }, String(v)));
    }
    kids.push(svg('path', { class: 's4-axis', d: `M${PX0} ${PY1}V${PY0}H${PX1}` }));
    kids.push(svg('text', { class: 's4-xtitle', x: (PX0 + PX1) / 2, y: PY0 + 34, 'text-anchor': 'middle' }, 'Current I (amps, A)'));
    kids.push(svg('text', { class: 's4-ytitle', x: 12, y: (PY0 + PY1) / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${(PY0 + PY1) / 2})` }, 'Voltage V (volts, V)'));
    const gs = groups();
    gs.forEach((g, gi) => {
      const k = fitFor(g);
      if (k !== null) {
        const e = lineEnd(k, XMAX, YMAX);
        kids.push(svg('line', { class: 's4-fit', x1: gx(0), y1: gy(0), x2: gx(e.x), y2: gy(e.y), 'stroke-dasharray': gi % 2 ? '6 4' : '' }));
        const nearRight = e.x > XMAX * 0.8;
        const lx = nearRight ? gx(e.x) - 6 : gx(e.x) + 6, ly = e.y >= YMAX - 0.01 ? gy(e.y) + 12 : gy(e.y) - 6;
        kids.push(svg('text', { class: 's4-lbl', x: lx, y: ly, 'text-anchor': nearRight ? 'end' : 'start' }, groupLabel(g)));
      }
    });
    for (const p of points) kids.push(marker(shapeOf(p.group), gx(Math.min(p.I, XMAX)), gy(Math.min(p.V, YMAX))));
    graph.replaceChildren(...kids);
    graph.setAttribute('aria-label', `Graph of voltage against current with ${points.length} recorded points.`);
    legend.replaceChildren(...gs.map((g) => {
      const mini = svg('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true' }, marker(shapeOf(g), 8, 8));
      return h('li', null, mini, groupLabel(g));
    }));
    const k = fitFor(activeGroup);
    const n = points.filter((p) => p.group === activeGroup).length;
    if (!points.length) grad.textContent = 'Record points to build the graph.';
    else if (k !== null) grad.innerHTML = `${groupLabel(activeGroup)} line: gradient = ΔV ÷ ΔI = <span class="q-resistance">${sig3(k)} Ω</span> (this is R)`;
    else grad.textContent = activeGroup === 'globe' ? 'A real filament globe gives a curved V–I graph because its resistance rises as it heats. The globes in this simulator are simplified to a fixed resistance.' : `Record ${Math.max(0, 3 - n)} more point${3 - n === 1 ? '' : 's'} for ${groupLabel(activeGroup)} to draw the line.`;
  }

  function drawTable(): void {
    tbody.replaceChildren(...points.map((p) => h('tr', null,
      h('td', null, p.group === 'mystery' ? '?' : groupLabel(p.group)), h('td', null, p.V.toFixed(2)), h('td', null, sig3(p.I)), h('td', null, sig3(ratio(p))))));
    if (!points.length) tbody.replaceChildren(h('tr', null, h('td', { colspan: '4' }, 'No points yet.')));
  }

  function render(): void {
    const checks = mode === 'checks';
    const calc = scene === 'calc';
    const tools = !calc;
    controls.hidden = !tools;
    graphBlock.hidden = !tools;
    tableBlock.hidden = !tools;
    gnote.hidden = !tools;
    noteEl.textContent = scene === 'mystery' ? 'Hidden resistor: the ammeter and voltmeter are connected. The supply slider is yours to use.' : scene === 'calc' ? calcNote : '';
    noteBlock.hidden = !checks || !noteEl.textContent;
    pickLabel.hidden = picker.hidden = scene === 'mystery';
    mysteryLabel.hidden = scene !== 'mystery';
    clrBtn.hidden = checks;
    const psu = bench.getParts().find((p) => p.id === 'PSU');
    const emf = psu?.emf ?? 0;
    vOut.textContent = `V = ${emf.toFixed(1)} V`;
    slider.value = String(emf);
    pickBtns.forEach((b, i) => b.setAttribute('aria-checked', String(RESISTORS[i] === R)));
    drawGraph();
    drawTable();
  }

  // ───────── scene control ─────────
  function loadOhm(o: { emf?: number; R?: number } = {}): void {
    scene = 'ohm';
    R = o.R ?? R;
    mask = null;
    bench.select(null); bench.highlight([]);
    bench.setParts(ohmParts(P, { emf: o.emf ?? 1, R }));
    bench.resetEnergy();
    activeGroup = String(R);
    render();
  }
  function chooseR(r: number): void {
    if (scene !== 'ohm') return;
    R = r;
    activeGroup = String(r);
    bench.editPart('R', { resistance: r });
    render();
  }
  function loadMystery(): void {
    scene = 'mystery';
    mask = null;
    points = [];
    bench.select(null); bench.highlight([]);
    bench.setParts(ohmParts(P, { emf: 2, R: mysteryValue, mystery: true }));
    bench.resetEnergy();
    activeGroup = 'mystery';
    say('');
    render();
  }
  const CALC_V = 9, CALC_R = 33;
  const CALC_NOTE = `The voltmeter shows the voltage across the resistor, which is labelled ${CALC_R} Ω. There is no ammeter, so work the current out.`;
  let calcNote = CALC_NOTE;
  function loadCalc(): void {
    scene = 'calc';
    calcNote = CALC_NOTE;
    bench.select(null); bench.highlight([]);
    bench.setParts(ohmParts(P, { emf: CALC_V, R: CALC_R, ammeter: false }));
    // the current is the answer, so the dashboard hides it
    mask = (r) => ({ label: r.label, V: r.V, R: r.R });
    bench.resetEnergy();
    render();
  }

  function meters(): { amm: Part | undefined; volt: Part | undefined } {
    const ps = bench.getParts();
    return { amm: ps.find((p) => p.kind === 'ammeter'), volt: ps.find((p) => p.kind === 'voltmeter') };
  }

  function recordPoint(): void {
    const { amm, volt } = meters();
    if (!amm || !volt) { say('You need an ammeter and a voltmeter on the bench.'); return; }
    if (bench.solution.status !== 'ok') { say('The circuit cannot be read.'); return; }
    const V = Math.abs(meterReading(volt, bench.solution)), I = Math.abs(meterReading(amm, bench.solution));
    if (!(V >= 0.05) || !(I > 0)) { say('Turn the supply voltage up first, so there is a current to measure.'); return; }
    const group = groupOf(bench.getParts(), volt);
    if (points.some((p) => p.group === group && Math.abs(p.V - V) < 0.05)) { say('That point is already on the graph. Change the voltage, then record again.'); return; }
    points = [...points, { group, I, V }];
    activeGroup = group;
    say(`Recorded: V = ${V.toFixed(2)} V, I = ${sig3(I)} A, V ÷ I = ${sig3(V / I)} Ω.`);
    render();
  }

  const offChange = bench.onChange(() => render());

  // ───────── guided steps ─────────
  const have = (g: string, v: number): boolean => points.some((p) => p.group === g && Math.abs(p.V - v) < 0.15);
  const steps: CoachStep[] = [
    { text: 'Set the <span class="q-voltage">supply voltage (V)</span> to <b>2 V</b> with the slider in the side panel. Then press <b>Record point</b>. The point appears on the graph.', done: () => have('22', 2) },
    { text: 'Now <b>4 V</b>. Move the slider, then press <b>Record point</b> again.', done: () => have('22', 4) },
    { text: 'And <b>6 V</b>. Record a third point.', done: () => have('22', 6) },
    { text: 'The points make a straight line through the origin. Look at the <b>V ÷ I</b> column: it is the same every time. That number is the <span class="q-resistance">resistance (R)</span>, and it is the gradient of the line.' },
    {
      text: 'Swap to a bigger resistor: choose <b>47 Ω</b> in the side panel. Record points at 2 V, 4 V and 6 V. The current is smaller for the same voltage, so the line is steeper.',
      done: () => R === 47 && points.filter((p) => p.group === '47').length >= 3,
    },
    { text: 'Press <b>X-ray</b> (top right of the bench). With 47 Ω, fewer dots pass each second than with 22 Ω at the same voltage. That is a smaller current.', done: () => bench.xray },
    { text: 'Tap the <b>resistor</b> on the bench. Read the formula lines in the dashboard: <b>V = I × R</b> with your numbers filled in.', done: () => bench.selectedId === 'R' },
  ];

  // ───────── checks ─────────
  const calcSol = solve({ parts: ohmParts(P, { emf: CALC_V, R: CALC_R, ammeter: false }) });
  const mysterySol = solve({ parts: ohmParts(P, { emf: 6, R: mysteryValue, mystery: true }) });
  const calcV = Math.abs(calcSol.parts.R.drop);
  const mysteryR = Math.abs(mysterySol.parts.R.drop / mysterySol.parts.R.current);

  const tasks: CheckTask[] = [
    {
      id: 'record-mystery', kind: 'do',
      prompt: 'A resistor is hidden. Use the supply slider and <b>Record point</b> to plot at least <b>four points</b> for it, at different voltages.',
      test: () => scene === 'mystery' && mysteryRecorded(points),
      explain: 'Plotting several points gives a line through the origin. The gradient of that line is the resistance.',
      onStart: () => loadMystery(),
    },
    {
      id: 'mystery-resistance', kind: 'number',
      prompt: 'Use your graph. Gradient = ΔV ÷ ΔI. What is the resistance of the mystery resistor?',
      answer: mysteryR, tolerance: 0.08, unit: 'Ω',
      explain: 'The gradient of a V–I graph is R. You can also work it out from any point: R = V ÷ I.',
      onStart: () => { if (scene !== 'mystery') loadMystery(); },
    },
    {
      id: 'find-current', kind: 'number',
      prompt: `A ${CALC_R} Ω resistor has ${calcV.toFixed(2)} V across it (the voltmeter shows this). What current flows through it?`,
      answer: Math.abs(calcSol.parts.R.current), tolerance: 0.05, unit: 'A',
      explain: `Rearrange V = I × R to I = V ÷ R. So I = ${calcV.toFixed(2)} V ÷ ${CALC_R} Ω = ${(calcV / CALC_R).toFixed(2)} A.`,
      onStart: () => loadCalc(),
    },
    {
      id: 'double-r', kind: 'choice',
      prompt: 'A resistor is connected to a fixed supply voltage. You swap it for one with double the resistance. What happens to the current?',
      options: ['It doubles.', 'It halves.', 'It stays the same.', 'It quadruples.'],
      correct: 1,
      onStart: () => { calcNote = 'Think about I = V ÷ R and what happens to each number.'; render(); },
      explain: 'I = V ÷ R. The voltage stays the same and R doubles, so I is half as big. Resistance is how hard it is for the current to get through.',
    },
  ];

  // ───────── phases ─────────
  function onPhase(p: Phase): void {
    mode = p;
    bench.setXray(false);
    rig.stage.resetView();
    bench.select(null); bench.highlight([]);
    if (p === 'guided') {
      points = [];
      R = 22;
      bench.setTray([]); bench.setReadOnly(true);
      loadOhm({ emf: 1, R: 22 });
      say('');
    } else if (p === 'free') {
      bench.setTray(FREE_TRAY()); bench.setReadOnly(false);
      if (scene !== 'ohm') loadOhm({ emf: 6 });
      else { mask = null; render(); }
      say('');
    } else {
      bench.setTray([]); bench.setReadOnly(true);
      points = [];
      render();
    }
  }

  // ───────── tester handle ─────────
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const api = {
    bench, P, mysteryValue, get points() { return points; }, recordPoint, setV: (v: number) => bench.editPart('PSU', { emf: v }), chooseR,
    loadMystery, loadCalc, loadOhm,
    /** perform one guided step (1 to 7) the way a student would */
    perform(step: number): void {
      switch (step) {
        case 1: api.setV(2); recordPoint(); break;
        case 2: api.setV(4); recordPoint(); break;
        case 3: api.setV(6); recordPoint(); break;
        case 4: document.querySelector<HTMLButtonElement>('.lw-coach .lw-btn')?.click(); break;
        case 5: chooseR(47); for (const v of [2, 4, 6]) { api.setV(v); recordPoint(); } break;
        case 6: bench.setXray(true); break;
        case 7: bench.select('R'); break;
      }
    },
    async complete(): Promise<void> { for (let i = 1; i <= 7; i++) { api.perform(i); await sleep(900); } },
    /** do check (a) for the mystery resistor */
    async plotMystery(): Promise<void> { for (const v of [2, 4, 6, 8]) { api.setV(v); await sleep(150); recordPoint(); } },
  };
  (window as unknown as { __s4: typeof api }).__s4 = api;

  onPhase('guided');

  return {
    steps, tasks, onPhase,
    dispose() {
      offChange();
      delete (window as unknown as { __s4?: unknown }).__s4;
      rig.dispose();
      host.side.replaceChildren();
    },
  };
}
