// Station 2: Build and draw (dot point 1.3.2, ticket "Diagrams").
import './s2.css';
import type { Bench, CheckTask, CoachStep, Part, Phase, StationHost, StationInstance, TrayItem } from '../../types';
import { anyGlobeLit, mountBench, partsOf, TRAY } from '../benchCommon';
import { createDiagram, createDiagramEditor, symbolIcon, type DiagramEditor } from '../../bench/diagram';
import {
  COLS, ROWS, DRAW_CIRCUIT, PARALLEL_TARGET, SERIES_TARGET, SYMBOL_QUIZ, P, allGlobesLit, buildPasses, diagramCrop, diagramFeedback, drawPasses, sameCircuit,
} from './logic';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const guidedTray = (): TrayItem[] => [TRAY.pack6(1), TRAY.switch(1), TRAY.globe(1), TRAY.wire()];
const freeTray = (): TrayItem[] => [TRAY.cell(4), TRAY.pack6(2), TRAY.pack12(1), TRAY.wire(), TRAY.switch(3), TRAY.globe(4), TRAY.resistor(22, 3), TRAY.resistor(47, 2), TRAY.ammeter(2), TRAY.voltmeter(2)];

const JUNCTION = '<svg viewBox="-32 -18 64 36" width="48" height="27" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="-28" y1="0" x2="28" y2="0"/><line x1="0" y1="0" x2="0" y2="-15"/></g><circle r="4" fill="currentColor"/></svg>';
const KEY: { icon: string; name: string; note?: string }[] = [
  { icon: symbolIcon('battery', { emf: 1.5 }), name: 'Cell', note: 'long line is +' },
  { icon: symbolIcon('battery', { emf: 6 }), name: 'Battery', note: 'cells in a row' },
  { icon: symbolIcon('switch', { closed: false }), name: 'Switch (open)' },
  { icon: symbolIcon('switch', { closed: true }), name: 'Switch (closed)' },
  { icon: symbolIcon('globe'), name: 'Lamp (globe)' },
  { icon: symbolIcon('resistor'), name: 'Resistor' },
  { icon: symbolIcon('ammeter'), name: 'Ammeter', note: 'in the loop' },
  { icon: symbolIcon('voltmeter'), name: 'Voltmeter', note: 'across a part' },
  { icon: symbolIcon('wire'), name: 'Wire' },
  { icon: JUNCTION, name: 'Junction', note: 'wires meet' },
];

/** a small framed diagram of a target circuit as an HTML string */
function targetPicture(parts: Part[]): string {
  const d = createDiagram({ cols: COLS, rows: ROWS });
  d.update(parts);
  d.svg.setAttribute('viewBox', diagramCrop(parts).join(' '));
  d.svg.removeAttribute('role');
  d.svg.setAttribute('aria-hidden', 'true');
  return `<div class="s2-target"><span class="s2-target-cap">Target diagram</span>${d.svg.outerHTML}</div>`;
}

export function mount(host: StationHost): StationInstance {
  const rig = mountBench(host, { tray: guidedTray(), initial: [] });
  const { bench } = rig;
  const timers = new Set<number>();
  const offs: (() => void)[] = [];
  let disposed = false;
  let phase: Phase = 'guided';
  let activeTest: (() => boolean) | null = null;
  let activeHint: (() => string) | null = null;
  let flipFrom: [number, number] | null = null;

  const xrayBtn = host.view.querySelector<HTMLButtonElement>('.lw-xray-btn');
  const setXray = (on: boolean): void => { bench.setXray(on); xrayBtn?.setAttribute('aria-pressed', String(on)); };
  function scene(parts: Part[], tray: TrayItem[], readOnly = false): void {
    bench.highlight([]);
    bench.select(null);
    if (bench.tripped) bench.resetBreaker();
    bench.setReadOnly(readOnly);
    bench.setTray(tray);
    bench.setParts(parts);
    bench.resetEnergy();
    setXray(false);
    host.coach.clear();
  }
  const first = (b: Bench, kind: Part['kind']): Part | undefined => partsOf(b, kind)[0];
  const lit = () => anyGlobeLit(bench);

  // ── side panel: live diagram, symbol key, and the draw-it editor ──
  const card = (title: string, ...kids: (Node | string)[]): HTMLElement => {
    const s = document.createElement('section');
    s.className = 'lw-card-plain s2-card';
    const h3 = document.createElement('h3'); h3.textContent = title; s.appendChild(h3);
    s.append(...kids);
    return s;
  };
  const dgWrap = document.createElement('div');
  dgWrap.className = 's2-diagram';
  dgWrap.appendChild(bench.diagram);
  const dgNote = document.createElement('p');
  dgNote.textContent = 'This diagram draws itself as you build. Every part has its own symbol.';
  const diagramCard = card('Circuit diagram', dgWrap, dgNote);

  const keyUl = document.createElement('ul');
  keyUl.className = 's2-key';
  for (const k of KEY) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${k.icon}</span><span>${k.name}${k.note ? `<small>${k.note}</small>` : ''}</span>`;
    keyUl.appendChild(li);
  }
  const keyCard = card('Symbol key', keyUl);

  const editor: DiagramEditor = createDiagramEditor({ cols: 4, rows: 3, symbols: ['battery', 'switch', 'globe', 'resistor', 'wire'] });
  const drawWrap = document.createElement('div');
  drawWrap.className = 's2-draw';
  drawWrap.appendChild(editor.svg);
  const row = document.createElement('div');
  row.className = 's2-draw-row';
  const checkBtn = document.createElement('button'); checkBtn.type = 'button'; checkBtn.className = 'lw-btn'; checkBtn.textContent = 'Check my diagram';
  const clearBtn = document.createElement('button'); clearBtn.type = 'button'; clearBtn.className = 'lw-btn lw-btn--ghost'; clearBtn.textContent = 'Clear';
  const count = document.createElement('span'); count.className = 's2-count'; count.setAttribute('aria-live', 'polite');
  row.append(checkBtn, clearBtn, count);
  const drawCard = card('Draw it here', drawWrap, row);
  const shownParts = () => editor.getParts().filter((p) => p.kind !== 'wire').length;
  const refreshCount = () => { const n = shownParts(); count.textContent = `${n} symbol${n === 1 ? '' : 's'} drawn`; };
  offs.push(editor.onChange(refreshCount));
  refreshCount();
  clearBtn.addEventListener('click', () => editor.clear());

  function drawFeedback(): string | null {
    return diagramFeedback(editor.getParts(), bench.getParts(), { mine: 'diagram', other: 'circuit' });
  }
  checkBtn.addEventListener('click', () => {
    const msg = drawFeedback();
    host.coach.say(msg ?? '<b>Yes.</b> Your diagram matches the circuit.');
  });
  clearBtn.disabled = false;

  function showCards(o: { diagram: boolean; key: boolean; draw: boolean }): void {
    diagramCard.hidden = !o.diagram;
    keyCard.hidden = !o.key;
    drawCard.hidden = !o.draw;
  }
  host.side.replaceChildren(diagramCard, drawCard, keyCard);
  showCards({ diagram: true, key: true, draw: false });

  // pressing the shell's Check button without a pass gives a specific message through the coach
  const sheet = host.side.parentElement;
  const onPress = (e: Event): void => {
    const b = (e.target as HTMLElement | null)?.closest?.('button.lw-btn');
    if (!b || b.textContent?.trim() !== 'Check' || !activeHint) return;
    timers.add(window.setTimeout(() => { if (!disposed && activeHint && activeTest && !activeTest()) host.coach.say(activeHint()); }, 80));
  };
  sheet?.addEventListener('click', onPress, true);

  // ── guided steps ──
  const steps: CoachStep[] = [
    {
      text: 'Pick the <b>Battery 6 V</b> and place it on the glowing gap. Look at the diagram: a <b>battery symbol</b> appears. A circuit diagram is the same circuit drawn with symbols.',
      onEnter: () => bench.highlight([], [P(1, 2), P(2, 2)]),
      onLeave: () => bench.highlight([]),
      done: () => !!first(bench, 'battery'),
    },
    {
      text: 'Now place the <b>Switch</b> on the next gap. The diagram adds a switch symbol. It starts <b>open</b>: see the gap in the line.',
      onEnter: () => bench.highlight([], [P(2, 2), P(3, 2)]),
      onLeave: () => bench.highlight([]),
      done: () => !!first(bench, 'switch'),
    },
    {
      text: 'Place the <b>Globe</b> above the switch. In a diagram a globe (lamp) is a <b>circle with a cross</b>.',
      onEnter: () => bench.highlight([], [P(3, 2), P(3, 1)]),
      onLeave: () => bench.highlight([]),
      done: () => !!first(bench, 'globe'),
    },
    {
      text: 'Join them with <b>wires</b> to finish the loop, then tap the switch to <b>close</b> it. The globe lights. Wires are plain lines in the diagram.',
      onEnter: () => bench.highlight([], [P(2, 1), P(1, 1), P(1, 2)]),
      onLeave: () => bench.highlight([]),
      done: lit,
    },
    {
      text: 'Tap the <b>battery</b> and press <b>Flip battery</b>. In the diagram the <b>long line</b> and <b>short line</b> swap ends. The long thin line is the positive (+) end.',
      onEnter: () => { const b = first(bench, 'battery'); flipFrom = b ? [b.a, b.b] : null; },
      done: () => { const b = first(bench, 'battery'); return !!b && !!flipFrom && b.a === flipFrom[1] && b.b === flipFrom[0]; },
    },
    {
      text: 'Tap the switch to <b>open</b> it. In the diagram the switch symbol opens too. The symbols follow the real circuit.',
      done: () => { const s = first(bench, 'switch'); return !!s && !s.closed; },
    },
  ];

  // ── checks ──
  const buildTask = (id: string, prompt: string, target: Part[], tray: () => TrayItem[], extra: string): CheckTask => {
    const test = () => buildPasses(bench.getParts(), target);
    const hint = (): string => {
      const msg = diagramFeedback(bench.getParts(), target, { mine: 'circuit', other: 'diagram' });
      if (msg) return msg;
      return allGlobesLit(bench.getParts()) ? 'That matches.' : `Your circuit matches the diagram, but ${extra}`;
    };
    return {
      id, kind: 'do', prompt: `${prompt}${targetPicture(target)}`, test,
      explain: 'A circuit diagram is the same circuit drawn with symbols. You went from a diagram to a real circuit by matching each symbol to a part and each line to a conducting path.',
      onStart: () => {
        scene([], tray());
        showCards({ diagram: true, key: true, draw: false });
        activeTest = test; activeHint = hint;
      },
    };
  };

  const drawTest = (): boolean => drawPasses(editor.getParts(), bench.getParts());
  const tasks: CheckTask[] = [
    {
      id: 'symbol', kind: 'choice',
      prompt: `Which part does this circuit symbol stand for?<br><span class="s2-sym">${symbolIcon(SYMBOL_QUIZ.kind)}</span>`,
      options: SYMBOL_QUIZ.options.map((o) => o.label),
      correct: SYMBOL_QUIZ.correct,
      explain: 'A circle with a cross is a lamp (globe). A resistor is a plain rectangle. Meters are circles with a letter inside: A for ammeter, V for voltmeter. A switch has a gap and a lever.',
      onStart: () => { activeTest = null; activeHint = null; showCards({ diagram: true, key: false, draw: false }); },
    },
    buildTask('build-series',
      'Build this circuit on the bench: a <b>battery</b>, a <b>switch</b> and <b>two globes</b> in one single loop (in series). Close the switch so both globes light.',
      SERIES_TARGET, () => [TRAY.pack6(1), TRAY.wire(), TRAY.switch(1), TRAY.globe(2)], 'both globes are not lit yet. Is the switch closed?'),
    buildTask('build-parallel',
      'Now build this one: a <b>battery</b> and <b>two globes</b>, each globe on its <b>own branch</b> (in parallel). Both globes must light.',
      PARALLEL_TARGET, () => [TRAY.pack6(1), TRAY.wire(), TRAY.globe(2)], 'both globes are not lit yet. Does each one have a complete path to the battery?'),
    {
      id: 'draw', kind: 'do',
      prompt: 'Look at the circuit on the bench. <b>Draw its circuit diagram</b> in the panel. Tap a gap between two dots, then choose a symbol. Press <b>Check my diagram</b> to get feedback.',
      test: drawTest,
      explain: 'You went from a real circuit to a diagram. Each part became its symbol, each wire became a line, and the loop stayed joined in the same way.',
      onStart: () => {
        scene(DRAW_CIRCUIT, [], true);
        editor.clear();
        showCards({ diagram: false, key: true, draw: true });
        activeTest = drawTest;
        activeHint = () => drawFeedback() ?? 'That matches.';
      },
    },
  ];

  function onPhase(p: Phase): void {
    phase = p;
    activeTest = null; activeHint = null;
    bench.highlight([]);
    bench.select(null);
    if (p === 'guided') {
      scene([], guidedTray());
      showCards({ diagram: true, key: true, draw: false });
    } else if (p === 'free') {
      if (bench.tripped) bench.resetBreaker();
      bench.setReadOnly(false);
      bench.setParts(bench.getParts().map((q) => ({ ...q, locked: false })));
      bench.setTray(freeTray());
      showCards({ diagram: true, key: true, draw: false });
    } else {
      setXray(false);
    }
  }

  // ── tester handle ──
  /** perform the guided actions (one per step) */
  async function complete(gap = 1150): Promise<void> {
    bench.setParts([]);
    await wait(gap);
    bench.setParts([{ id: 'bat', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 6 }]);
    await wait(gap);
    bench.setParts([...bench.getParts(), { id: 'sw', kind: 'switch', a: P(2, 2), b: P(3, 2), closed: false }]);
    await wait(gap);
    bench.setParts([...bench.getParts(), { id: 'glb', kind: 'globe', a: P(3, 2), b: P(3, 1), ratedV: 6, ratedW: 3 }]);
    await wait(gap);
    bench.setParts([...bench.getParts(), { id: 'w1', kind: 'wire', a: P(3, 1), b: P(2, 1) }, { id: 'w2', kind: 'wire', a: P(2, 1), b: P(1, 1) }, { id: 'w3', kind: 'wire', a: P(1, 1), b: P(1, 2) }]);
    bench.editPart('sw', { closed: true });
    await wait(gap);
    const b = first(bench, 'battery')!;
    bench.editPart(b.id, { a: b.b, b: b.a });
    await wait(gap);
    bench.editPart('sw', { closed: false });
    await wait(gap);
  }
  /** set the bench to a target (so a tester can pass a build check) */
  const buildTarget = (parts: Part[]): void => bench.setParts(parts.map((p) => ({ ...p, id: p.id })));
  /** draw the circuit on the bench into the editor by clicking its own controls; positions use the editor's 4 x 3 grid */
  async function drawCorrect(): Promise<void> {
    editor.clear();
    const eid = (id: number) => (Math.floor(id / COLS)) * 4 + (id % COLS);
    const names: Record<string, string> = { battery: 'battery', switch: 'switch', globe: 'globe', resistor: 'resistor', wire: 'wire' };
    for (const p of DRAW_CIRCUIT) {
      const a = Math.min(eid(p.a), eid(p.b)), b = Math.max(eid(p.a), eid(p.b));
      const hit = editor.svg.querySelector<SVGElement>(`[data-edge="${a}-${b}"]`);
      hit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(30);
      const choice = [...editor.svg.querySelectorAll<SVGElement>('.lw-dg-choice')].find((c) => c.getAttribute('aria-label') === `Place ${names[p.kind]}`);
      choice?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(30);
    }
  }
  const handle = { bench, stage: rig.stage, editor, complete, buildTarget, drawCorrect, tasks, onPhase, sameCircuit, SERIES_TARGET, PARALLEL_TARGET, DRAW_CIRCUIT, setXray, get phase() { return phase; } };
  (window as unknown as { __s2?: unknown }).__s2 = handle;

  return {
    steps, tasks, onPhase,
    dispose() {
      disposed = true;
      timers.forEach((t) => clearTimeout(t));
      offs.forEach((f) => f());
      sheet?.removeEventListener('click', onPress, true);
      if ((window as unknown as { __s2?: unknown }).__s2 === handle) delete (window as unknown as { __s2?: unknown }).__s2;
      rig.dispose();
      host.side.replaceChildren();
    },
  };
}
