// Station 3: Series and parallel (ticket "Meters"). Two measurement scenes, a results table the student fills by measuring.
import './s3.css';
import type { CheckTask, CoachStep, Part, Phase, StationHost, StationInstance, TrayItem } from '../../types';
import { solve } from '../../sim/circuit';
import { h } from '../../ui/dom';
import { edgeKey } from '../../bench/grid';
import { mountBench, TRAY } from '../benchCommon';
import {
  type Scene, type Row, liveReadings, rowsOf, sitesOf, seriesParts, parallelParts, summaryLines, measuresOnlyB, currentOf, dropOf, fmt2,
} from './logic';

type Mode = Phase;
type View = Scene | 'blank';

const GUIDED_TRAY = (): TrayItem[] => [TRAY.ammeter(3), TRAY.voltmeter(3)];
const FREE_TRAY = (): TrayItem[] => [TRAY.cell(2), TRAY.pack6(2), TRAY.wire(), TRAY.switch(2), TRAY.globe(4), TRAY.resistor(10, 3), TRAY.resistor(22, 3), TRAY.resistor(47, 3), TRAY.ammeter(3), TRAY.voltmeter(3)];

export function mount(host: StationHost): StationInstance {
  const rig = mountBench(host, { tray: GUIDED_TRAY(), xray: false });
  const { bench } = rig;
  const P = (c: number, r: number): number => bench.postId(c, r);

  let mode: Mode = 'guided';
  let view: View = 'series';
  const records: Record<Scene, Record<string, number>> = { series: {}, parallel: {} };
  const stable = new Map<string, { v: number; t: number }>();
  let checkScene: string | null = null;

  // ───────── side panel DOM ─────────
  const tabsEl = h('div', { class: 's3-tabs', role: 'tablist', 'aria-label': 'Circuit' });
  const tabBtns: Record<View, HTMLButtonElement> = {
    series: h('button', { class: 's3-tab', type: 'button', role: 'tab', onclick: () => setView('series') }, 'Series'),
    parallel: h('button', { class: 's3-tab', type: 'button', role: 'tab', onclick: () => setView('parallel') }, 'Parallel'),
    blank: h('button', { class: 's3-tab', type: 'button', role: 'tab', onclick: () => setView('blank') }, 'Blank board'),
  };
  tabsEl.append(tabBtns.series, tabBtns.parallel, tabBtns.blank);

  const gapsHead = h('p', null, 'Open a gap, then put an ammeter in it:');
  const gapsEl = h('div', { class: 's3-gaps' });
  const gapsBlock = h('div', { class: 's3-block' }, gapsEl);
  const tbody = h('tbody');
  const table = h('table', { class: 's3-table' }, h('thead', null, h('tr', null, h('th', null, 'Measurement'), h('th', null, 'Reading'))), tbody);
  const sumEl = h('ul', { class: 's3-sum', 'aria-live': 'polite' });
  const recordBtn = h('button', { class: 'lw-btn lw-btn--sm', type: 'button', onclick: () => recordNow() }, 'Record readings');
  const clearBtn = h('button', { class: 'lw-btn lw-btn--sm lw-btn--ghost', type: 'button', onclick: () => { records[view as Scene] = {}; stable.clear(); render(); } }, 'Clear table');
  const tableBlock = h('div', { class: 's3-block' }, h('h3', null, 'Results table'), table, h('div', { class: 's3-row' }, recordBtn, clearBtn), sumEl);
  const noteEl = h('p', { class: 's3-note' });
  const noteBlock = h('div', { class: 's3-block' }, noteEl);
  const diagram = h('details', { class: 's3-block s3-diagram' }, h('summary', null, 'Circuit diagram'), bench.diagram);
  const side = h('div', { class: 's3-side' }, tabsEl, gapsBlock, tableBlock, noteBlock, diagram);
  host.side.replaceChildren(side);

  // ───────── scenes ─────────
  const sceneOf = (): Scene | null => (view === 'blank' ? null : view);

  function buildScene(s: Scene, o: { open?: string[] } = {}): Part[] {
    return s === 'series' ? seriesParts(P, { open: o.open ?? [] }) : parallelParts(P, { open: o.open ?? [] });
  }

  function loadScene(s: View, o: { open?: string[] } = {}): void {
    view = s;
    bench.select(null);
    bench.highlight([]);
    bench.setParts(s === 'blank' ? [] : buildScene(s, o));
    bench.resetEnergy();
    stable.clear();
    render();
  }

  function setView(s: View): void {
    if (mode === 'checks') return;
    loadScene(s);
  }

  function siteEdge(key: string): string {
    const s = sitesOf(sceneOf()!, P).find((x) => x.key === key)!;
    return edgeKey(s.a, s.b);
  }
  const partAtSite = (key: string): Part | undefined => bench.getParts().find((p) => p.kind !== 'voltmeter' && edgeKey(p.a, p.b) === siteEdge(key));

  function toggleGap(key: string): void {
    const s = sitesOf(sceneOf()!, P).find((x) => x.key === key)!;
    const at = partAtSite(key);
    if (at) { if (at.kind === 'wire') bench.removePart(at.id); }
    else bench.setParts([...bench.getParts(), { id: `w${key}`, kind: 'wire', a: s.a, b: s.b }]);
  }
  function openGap(key: string): void { if (partAtSite(key)?.kind === 'wire') bench.removePart(partAtSite(key)!.id); }
  function highlightSite(keys: string[]): void {
    const posts: number[] = [];
    for (const k of keys) { const s = sitesOf(sceneOf()!, P).find((x) => x.key === k)!; posts.push(s.a, s.b); }
    bench.highlight([], posts);
  }

  // ───────── table ─────────
  const live = (): Record<string, number | null> => {
    const s = sceneOf();
    return s ? liveReadings(s, bench.getParts(), bench.solution, P) : {};
  };

  function recordNow(): void {
    const s = sceneOf();
    if (!s) return;
    const l = live();
    for (const [k, v] of Object.entries(l)) if (v !== null) records[s][k] = v;
    render();
  }

  function render(): void {
    const s = sceneOf();
    const checks = mode === 'checks';
    tabsEl.hidden = checks;
    tabBtns.blank.hidden = mode !== 'free';
    for (const k of Object.keys(tabBtns) as View[]) tabBtns[k].setAttribute('aria-selected', String(k === view));
    tableBlock.hidden = checks || !s;
    gapsBlock.hidden = checks || !s;
    noteBlock.hidden = !checks;
    gapsEl.replaceChildren(gapsHead);
    if (s) {
      for (const site of sitesOf(s, P)) {
        const at = partAtSite(site.key);
        const open = !at;
        const btn = h('button', {
          class: 's3-gap', type: 'button', 'aria-pressed': String(open), disabled: at?.kind === 'ammeter',
          title: at?.kind === 'ammeter' ? 'An ammeter is in this gap. Remove it from the bench first.' : open ? 'Close the gap with a wire' : 'Open a gap here',
          onclick: () => toggleGap(site.key),
        }, `${open ? 'Gap' : at?.kind === 'ammeter' ? 'Meter' : 'Wire'} at ${site.key === 'M' ? 'main line' : s === 'series' ? site.key : `branch ${site.key}`}`);
        gapsEl.appendChild(btn);
      }
    }
    if (checks || !s) return;
    const l = live();
    const rec = records[s];
    tbody.replaceChildren(...rowsOf(s, P).map((row: Row) => {
      const unit = row.kind === 'I' ? 'A' : 'V';
      const r = rec[row.key];
      const lv = l[row.key];
      const cell = r !== undefined ? `${fmt2(r)} ${unit}` : lv !== null && lv !== undefined ? `${fmt2(lv)} ${unit} (live)` : '—';
      return h('tr', { class: lv !== null && lv !== undefined ? 'is-live' : '' },
        h('td', null, h('span', { class: row.kind === 'I' ? 'q-current' : 'q-voltage' }, row.kind === 'I' ? 'I' : 'V'), ` ${row.label}`),
        h('td', { class: `s3-val${r === undefined ? ' s3-live' : ''}` }, cell));
    }));
    sumEl.replaceChildren(...summaryLines(s, rec).map((x) => h('li', { class: x.ok ? '' : 'is-off' }, x.text)));
  }

  // auto-log a reading once it has been steady for 0.7 s
  const timer = window.setInterval(() => {
    const s = sceneOf();
    if (!s || mode === 'checks') return;
    const l = live();
    const now = performance.now();
    let changed = false;
    for (const [k, v] of Object.entries(l)) {
      if (v === null) { stable.delete(k); continue; }
      const q = Math.round(v * 100) / 100;
      const st = stable.get(k);
      if (!st || st.v !== q) { stable.set(k, { v: q, t: now }); continue; }
      if (now - st.t > 700 && records[s][k] !== v) { records[s][k] = v; changed = true; }
    }
    if (changed) render();
  }, 250);
  const offChange = bench.onChange(() => render());

  // ───────── guided steps ─────────
  const ammAt = (key: string): boolean => { const a = partAtSite(key); return a?.kind === 'ammeter' && bench.solution.live; };
  const liveRow = (k: string): boolean => live()[k] !== null && live()[k] !== undefined;

  const steps: CoachStep[] = [
    {
      text: 'The loop has a gap at the glowing posts. Take the <b>Ammeter</b> from the tray and put it in the gap. An ammeter goes <b>in series</b>, so the dots pass through it. It reads the <span class="q-current">current (I)</span>.',
      onEnter: () => { highlightSite(['A']); },
      done: () => view === 'series' && ammAt('A'),
      onLeave: () => bench.highlight([]),
    },
    {
      text: 'Now the loop is open at point B. Put a second ammeter there. Compare the two readings. What do you notice?',
      onEnter: () => { openGap('B'); highlightSite(['B']); },
      done: () => view === 'series' && ammAt('A') && ammAt('B'),
      onLeave: () => bench.highlight([]),
    },
    {
      text: 'A voltmeter goes <b>across</b> a part, with a lead on the post at each end. Put one across <b>R1</b> and another across <b>R2</b>.',
      onEnter: () => bench.highlight(['R1', 'R2']),
      done: () => view === 'series' && liveRow('vR1') && liveRow('vR2'),
      onLeave: () => bench.highlight([]),
    },
    {
      text: 'Check the results table. Add the two voltages. They make the battery voltage. In a series circuit the <span class="q-voltage">voltage (V)</span> is shared out between the parts.',
    },
    {
      text: 'Now the parallel circuit. Press the <b>Parallel</b> tab, then press <b>X-ray</b> (top right of the bench). Watch the dots split at the junction and join up again.',
      done: () => view === 'parallel' && bench.xray,
    },
    {
      text: 'Put a voltmeter across globe A and another across globe B. Each branch gets the full battery voltage.',
      onEnter: () => bench.highlight(['GA', 'GB']),
      done: () => view === 'parallel' && liveRow('vA') && liveRow('vB'),
      onLeave: () => bench.highlight([]),
    },
    {
      text: 'Open the three gaps and put an ammeter in each: the main line and both branches. Then add the two branch currents and compare with the main line.',
      onEnter: () => { if (view !== 'parallel') loadScene('parallel'); for (const k of ['M', 'A', 'B']) openGap(k); highlightSite(['M', 'A', 'B']); },
      done: () => view === 'parallel' && liveRow('iM') && liveRow('iA') && liveRow('iB'),
      onLeave: () => bench.highlight([]),
    },
  ];

  // ───────── checks ─────────
  const solved = (parts: Part[]) => solve({ parts });
  const A1 = 10, A2 = 15, B1 = 10, B2 = 50;
  const chkA = seriesParts(P, { r1: A1, r2: A2, ammeters: ['B'] });
  const chkB = seriesParts(P, { r1: B1, r2: B2, voltmeters: ['R1'] });
  const chkC = parallelParts(P, { open: ['M', 'A', 'B'] });
  const solA = solved(chkA), solB = solved(chkB);
  const volt1 = dropOf(solB, 'R1');
  const supply = 6;

  function loadCheck(name: string): void {
    checkScene = name;
    bench.select(null);
    bench.highlight([]);
    bench.setXray(false);
    const p = name === 'A' ? chkA : name === 'B' ? chkB : name === 'C' ? chkC : [];
    view = name === 'C' ? 'parallel' : 'series';
    bench.setReadOnly(false);
    bench.setParts(p);
    if (name === 'C') { bench.setTray([TRAY.wire(), TRAY.ammeter(2)]); bench.setReadOnly(false); }
    else { bench.setTray([]); bench.setReadOnly(true); }
    noteEl.innerHTML = name === 'A' ? 'Read the ammeter on the bench. You can tap parts to see the dashboard.'
      : name === 'B' ? 'The voltmeter is across R1. Use what it reads, and the battery voltage, to find R2.'
        : 'Globes A and B are on the board. Fill the three gaps with wires and an ammeter so that the ammeter measures <b>only</b> globe B. Both globes must be lit.';
    render();
  }

  const tasks: CheckTask[] = [
    {
      id: 'read-series-current', kind: 'number',
      prompt: `A ${supply} V battery is connected to R1 = ${A1} Ω and R2 = ${A2} Ω in series. The ammeter is in the loop. What current flows through R1?`,
      answer: currentOf(solA, 'R1'), tolerance: 0.05, unit: 'A',
      explain: `The current is the same at every point in a series loop, so the ammeter reading is also the current through R1 and R2. (Check: ${supply} V ÷ ${A1 + A2} Ω = ${fmt2(currentOf(solA, 'R1'))} A.)`,
      onStart: () => loadCheck('A'),
    },
    {
      id: 'series-voltage-share', kind: 'number',
      prompt: `The battery gives ${supply} V. R1 = ${B1} Ω and R2 = ${B2} Ω are in series. The voltmeter across R1 reads ${fmt2(volt1)} V. What is the voltage across R2?`,
      answer: dropOf(solB, 'R2'), tolerance: 0.05, unit: 'V',
      explain: `In a series circuit the voltages across the parts add up to the supply voltage. ${supply} V − ${fmt2(volt1)} V = ${fmt2(dropOf(solB, 'R2'))} V, so R2 has ${fmt2(dropOf(solB, 'R2'))} V across it.`,
      onStart: () => loadCheck('B'),
    },
    {
      id: 'ammeter-only-b', kind: 'do',
      prompt: 'Make globe B light, then place an ammeter so it measures <b>only</b> the current through globe B. Both globes must be lit.',
      test: () => checkScene === 'C' && measuresOnlyB(bench.getParts(), bench.solution).ok,
      explain: 'An ammeter reads the current through the point where it sits. In the main line it reads the total. In the branch with globe B it reads only the current that passes through B.',
      onStart: () => loadCheck('C'),
    },
    {
      id: 'why-parallel', kind: 'choice',
      prompt: 'Why are the power points in a house wired in parallel?',
      options: [
        'Each power point gets the full supply voltage, and one appliance switched off does not stop the others.',
        'So the same current flows through every appliance.',
        'So the voltages across the appliances add up to the supply voltage.',
        'Because parallel circuits use less energy than series circuits.',
      ],
      correct: 0,
      explain: 'In parallel, every branch has the same voltage as the supply (mains is 230 V), and each branch works on its own. In series, one switched-off appliance would break the loop for all of them.',
    },
  ];

  // ───────── phases ─────────
  function onPhase(p: Phase): void {
    mode = p;
    checkScene = null;
    bench.select(null);
    bench.highlight([]);
    bench.setXray(false);
    rig.stage.resetView();
    if (p === 'guided') {
      records.series = {}; records.parallel = {};
      bench.setReadOnly(false);
      bench.setTray(GUIDED_TRAY());
      loadScene('series', { open: ['A'] });
    } else if (p === 'free') {
      bench.setReadOnly(false);
      records.series = {}; records.parallel = {};
      bench.setTray(FREE_TRAY());
      loadScene('series');
    } else {
      bench.setTray([]);
      bench.setReadOnly(true);
      render();
    }
    render();
  }

  // ───────── tester handle ─────────
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const api = {
    bench, P, loadScene, records, solve: solved, liveReadings: live, logic: { seriesParts, parallelParts, measuresOnlyB, liveReadings, summaryLines },
    /** perform one guided step (1 to 7) the way a student would */
    perform(step: number): void {
      const add = (parts: Part[]) => bench.setParts([...bench.getParts(), ...parts]);
      const sites = (s: Scene) => sitesOf(s, P);
      const amm = (s: Scene, k: string): Part => { const x = sites(s).find((q) => q.key === k)!; return { id: `m${k}`, kind: 'ammeter', a: x.a, b: x.b }; };
      switch (step) {
        case 1: openGap('A'); add([amm('series', 'A')]); break;
        case 2: openGap('B'); add([amm('series', 'B')]); break;
        case 3: add([{ id: 'vR1', kind: 'voltmeter', a: P(3, 1), b: P(3, 2) }, { id: 'vR2', kind: 'voltmeter', a: P(1, 1), b: P(2, 1) }]); break;
        case 4: document.querySelector<HTMLButtonElement>('.lw-coach .lw-btn')?.click(); break;
        case 5: setView('parallel'); bench.setXray(true); break;
        case 6: add([{ id: 'vA', kind: 'voltmeter', a: P(2, 1), b: P(2, 2) }, { id: 'vB', kind: 'voltmeter', a: P(3, 1), b: P(3, 2) }]); break;
        case 7: for (const k of ['M', 'A', 'B']) { openGap(k); } add(['M', 'A', 'B'].map((k) => amm('parallel', k))); break;
      }
    },
    async complete(): Promise<void> { for (let i = 1; i <= 7; i++) { api.perform(i); await sleep(i === 4 ? 400 : 900); } },
  };
  (window as unknown as { __s3: typeof api }).__s3 = api;

  onPhase('guided');

  return {
    steps, tasks, onPhase,
    dispose() {
      window.clearInterval(timer);
      offChange();
      delete (window as unknown as { __s3?: unknown }).__s3;
      rig.dispose();
      host.side.replaceChildren();
    },
  };
}
