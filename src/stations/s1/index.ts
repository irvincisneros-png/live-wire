// Station 1: Complete circuits (dot point 1.3.1, ticket "Circuits").
import './s1.css';
import type { Bench, CheckTask, CoachStep, Part, Phase, StationHost, StationInstance, TrayItem } from '../../types';
import { anyGlobeLit, mountBench, partsOf, TRAY } from '../benchCommon';
import { createDiagram, symbolIcon } from '../../bench/diagram';
import {
  COLS, ROWS, GUIDED_POSTS, ROLES, SETUPS, SETUP_CORRECT, SHORT_POSTS, FAULTS, commonCropSize, diagramCrop, faultFor, guidedStart,
  shortStart, type Fault, type PartRole,
} from './logic';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const FAULT_KEY = 'lw-s1-fault';

const guidedTray = (): TrayItem[] => [TRAY.wire(4), TRAY.switch(1)];
const freeTray = (): TrayItem[] => [TRAY.cell(4), TRAY.pack6(2), TRAY.pack12(1), TRAY.wire(), TRAY.switch(3), TRAY.globe(3), TRAY.resistor(22, 2)];
const wireTray = (parts: Part[], extra: number): TrayItem[] => [TRAY.wire(parts.filter((p) => p.kind === 'wire').length + extra)];

function readAttempt(): number { try { return Number(localStorage.getItem(FAULT_KEY)) || 0; } catch { return 0; } }
function writeAttempt(n: number): void { try { localStorage.setItem(FAULT_KEY, String(n)); } catch { /* storage may be blocked */ } }

/** a small framed picture of a setup, as an HTML string for a choice option */
function setupPicture(parts: Part[], size: [number, number]): string {
  const d = createDiagram({ cols: COLS, rows: ROWS });
  d.update(parts);
  d.svg.setAttribute('viewBox', diagramCrop(parts, size).join(' '));
  d.svg.removeAttribute('role');
  d.svg.setAttribute('aria-hidden', 'true');
  return d.svg.outerHTML;
}

export function mount(host: StationHost): StationInstance {
  const rig = mountBench(host, { tray: guidedTray(), initial: guidedStart() });
  const { bench } = rig;
  const timers = new Set<number>();
  const offs: (() => void)[] = [];
  let disposed = false;
  let phase: Phase = 'guided';
  const seen = new Set<PartRole['id']>();
  let tripLatch = false;
  let attempt = readAttempt();
  let current: Fault = FAULTS[0];
  let activeTest: (() => boolean) | null = null;
  let activeHint: (() => string) | null = null;

  // ── scene helpers ──
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
  const sw = (b: Bench): Part | undefined => partsOf(b, 'switch')[0];
  const lit = () => anyGlobeLit(bench);

  // ── side panel: live diagram + parts of a circuit ──
  const diagramCard = document.createElement('section');
  diagramCard.className = 'lw-card-plain s1-card';
  diagramCard.innerHTML = '<h3>Circuit diagram</h3>';
  const dgWrap = document.createElement('div');
  dgWrap.className = 's1-diagram';
  dgWrap.appendChild(bench.diagram);
  diagramCard.appendChild(dgWrap);
  const dgNote = document.createElement('p');
  dgNote.textContent = 'It redraws itself as you build.';
  diagramCard.appendChild(dgNote);

  const rolesCard = document.createElement('section');
  rolesCard.className = 'lw-card-plain s1-card';
  rolesCard.innerHTML = '<h3>Parts of a circuit</h3>';
  const ul = document.createElement('ul');
  ul.className = 's1-roles';
  rolesCard.appendChild(ul);
  const shortNote = document.createElement('p');
  shortNote.innerHTML = 'A <b>short circuit</b> is a loop with almost no resistance. The current gets huge and the wires heat up.';
  rolesCard.appendChild(shortNote);
  const roleEls = new Map<PartRole['id'], { btn: HTMLButtonElement; tick: HTMLElement; msg: HTMLElement }>();
  let hlTimer = 0;
  function tapRole(id: PartRole['id']): void {
    const role = ROLES.find((r) => r.id === id)!;
    const ids = bench.getParts().filter((p) => role.kinds.includes(p.kind)).map((p) => p.id);
    const e = roleEls.get(id)!;
    if (!ids.length) { e.msg.textContent = 'None on the board yet.'; return; }
    e.msg.textContent = '';
    seen.add(id);
    renderRoles();
    bench.highlight(ids);
    clearTimeout(hlTimer);
    hlTimer = window.setTimeout(() => { if (!disposed) bench.highlight([]); }, 2600);
    timers.add(hlTimer);
  }
  for (const r of ROLES) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 's1-role';
    btn.innerHTML = `<span class="s1-role-icon">${symbolIcon(r.icon, { emf: r.icon === 'battery' ? 6 : undefined, closed: r.icon === 'switch' ? true : undefined })}</span><span class="s1-role-text"><b>${r.name}</b><span>${r.what}</span><em></em></span><span class="s1-role-tick" aria-hidden="true"></span>`;
    btn.setAttribute('aria-label', `${r.name}. ${r.what} Show it on the board.`);
    btn.addEventListener('click', () => tapRole(r.id));
    li.appendChild(btn);
    ul.appendChild(li);
    roleEls.set(r.id, { btn, tick: btn.querySelector('.s1-role-tick')!, msg: btn.querySelector('em')! });
  }
  function renderRoles(): void {
    for (const [id, e] of roleEls) { const s = seen.has(id); e.btn.classList.toggle('is-seen', s); e.tick.textContent = s ? '✓' : ''; }
  }
  host.side.replaceChildren(diagramCard, rolesCard);

  // ── the protector: latch the trip for the short-circuit check ──
  offs.push(bench.onEvent((e) => { if (e.type === 'tripped') { tripLatch = true; bench.highlight([]); } }));

  // pressing the shell's Check button without a pass gives a specific hint through the coach
  const sheet = host.side.parentElement;
  const onPress = (e: Event): void => {
    const b = (e.target as HTMLElement | null)?.closest?.('button.lw-btn');
    if (!b || b.textContent?.trim() !== 'Check' || !activeHint) return;
    timers.add(window.setTimeout(() => { if (!disposed && activeHint && activeTest && !activeTest()) host.coach.say(activeHint()); }, 80));
  };
  sheet?.addEventListener('click', onPress, true);

  // ── guided steps ──
  const rightWire = (): Part | undefined => bench.getParts().find((p) => p.kind === 'wire' && p.id === 'w-right');
  const steps: CoachStep[] = [
    {
      text: 'A <b>battery</b> and a <b>globe</b> are on the board but not joined. Pick <b>Wire</b> in the tray, then tap the gap between two glowing posts. Place <b>two wires</b> so the globe lights.',
      onEnter: () => bench.highlight([], GUIDED_POSTS),
      onLeave: () => bench.highlight([]),
      done: lit,
    },
    {
      text: 'The globe is lit because the loop is complete. Tap <b>X-ray</b> (top right) to see the charges. They were in every wire all along, and now they all move round together.',
      done: () => bench.xray,
    },
    {
      text: 'Now add a <b>switch</b>. Tap the <b>right-hand wire</b>, press <b>Remove</b>, then pick <b>Switch</b> in the tray and place it in the gap.',
      done: () => !!sw(bench),
    },
    {
      text: 'A new switch starts <b>open</b>, so there is a gap. The globe is out and every dot stopped at the same moment, but they are all still in the wire. <b>Close</b> the switch by tapping it.',
      done: () => !!sw(bench)?.closed && lit(),
    },
    {
      text: 'Tap the switch to <b>open</b> it again. The path is broken, so the <span class="q-current">current (I)</span> stops everywhere at once.',
      done: () => !!sw(bench) && !sw(bench)!.closed && !lit(),
    },
    {
      text: 'Name the parts. Tap each row in <b>Parts of a circuit</b> (open the panel on a phone). A ring shows where that part is on the board.',
      onEnter: () => { seen.clear(); renderRoles(); },
      onLeave: () => bench.highlight([]),
      done: () => seen.size === ROLES.length,
    },
  ];

  // ── checks ──
  const crop = commonCropSize(SETUPS.map((s) => s.parts));
  const tasks: CheckTask[] = [
    {
      id: 'dead', kind: 'do',
      get prompt() { return 'This circuit is <b>dead</b>: the globe is dark. Find out why, then fix it so the globe lights. You can tap parts, add wires and remove wires.'; },
      get explain() { return current.explain; },
      test: () => lit(),
      onStart: () => {
        current = faultFor(attempt);
        attempt += 1;
        writeAttempt(attempt);
        const parts = current.parts();
        scene(parts, wireTray(parts, current.extraWires));
        activeTest = () => lit();
        activeHint = () => `<b>Hint.</b> ${current.hint}`;
      },
    } as CheckTask,
    {
      id: 'short', kind: 'do',
      prompt: 'The globe is lit. Now make a <b>short circuit</b> on purpose. Place a <b>wire</b> between the two glowing posts so charge can skip the globe. Then watch what the supply protector does.',
      test: () => tripLatch,
      explain: 'The wire gave the charge an easy path that skips the globe. With almost no resistance the <span class="q-current">current (I)</span> became huge. A huge current heats wires and batteries very fast, which is dangerous. The supply protector cut the supply before anything overheated.',
      onStart: () => {
        tripLatch = false;
        const parts = shortStart();
        scene(parts, wireTray(parts, 2));
        bench.highlight([], SHORT_POSTS);
        activeTest = () => tripLatch;
        activeHint = () => 'Pick <b>Wire</b>, then tap the gap between the two glowing posts. That wire bypasses the globe. Keep it there for a moment and watch the warning.';
      },
    },
    {
      id: 'why', kind: 'choice',
      prompt: 'The globe went out and the supply protector tripped. <b>Why?</b>',
      options: [
        'The battery was too strong for the globe, so the globe blew.',
        'The new wire gave the charge a path with almost no resistance. The current became huge, so the protector cut the supply.',
        'The wire used up all the charge in the battery.',
        'The new wire opened the loop, so the current stopped.',
      ],
      correct: 1,
      explain: 'A short circuit is a loop with almost no resistance. The charge takes the easy path past the globe, so the globe gets almost nothing. The current becomes huge, and a huge current heats wires and the battery quickly. The protector is there to cut the supply before that happens. Charge is never used up.',
      onStart: () => { activeTest = null; activeHint = null; bench.highlight([]); },
    },
    {
      id: 'complete', kind: 'choice',
      prompt: 'Which setup is a <b>complete circuit</b> that will light the globe? Each one has a 6 V battery and a globe.',
      options: SETUPS.map((s) => `<span class="s1-opt"><span class="s1-pic">${setupPicture(s.parts, crop)}</span><span class="s1-cap"><b>${s.label}.</b> ${s.caption}</span></span>`),
      correct: SETUP_CORRECT,
      explain: 'A circuit needs an energy source, a conducting path that goes all the way round, and a load. Only setup C has all three joined in one unbroken loop. A has a gap, B has a switch that is open (a gap you can close), and in D the path leaves the battery’s positive end and returns to the same end.',
      onStart: () => { activeTest = null; activeHint = null; scene(shortStart(), [], true); },
    },
  ];

  function onPhase(p: Phase): void {
    phase = p;
    activeTest = null; activeHint = null;
    clearTimeout(hlTimer);
    if (p === 'guided') {
      seen.clear(); renderRoles();
      scene(guidedStart(), guidedTray());
    } else if (p === 'free') {
      bench.highlight([]);
      bench.select(null);
      if (bench.tripped) bench.resetBreaker();
      bench.setReadOnly(false);
      bench.setParts(bench.getParts().map((q) => ({ ...q, locked: false })));
      bench.setTray(freeTray());
    } else {
      bench.highlight([]);
      bench.select(null);
      setXray(false);
    }
  }

  // ── tester handle ──
  async function complete(gap = 1150): Promise<void> {
    bench.setParts(guidedStart());
    await wait(gap);
    const base = bench.getParts();
    bench.setParts([...base, { id: 'w-right', kind: 'wire', a: bench.postId(2, 2), b: bench.postId(2, 1) }, { id: 'w-left', kind: 'wire', a: bench.postId(1, 1), b: bench.postId(1, 2) }]);
    await wait(gap);
    setXray(true);
    await wait(gap);
    const rw = rightWire();
    if (rw) bench.removePart(rw.id);
    bench.setParts([...bench.getParts(), { id: 'sw', kind: 'switch', a: bench.postId(2, 2), b: bench.postId(2, 1), closed: false }]);
    await wait(gap);
    bench.editPart('sw', { closed: true });
    await wait(gap);
    bench.editPart('sw', { closed: false });
    await wait(gap);
    for (const r of ROLES) tapRole(r.id);
    await wait(gap);
  }
  const handle = { bench, stage: rig.stage, complete, tapRole, faults: FAULTS, tasks, seen, onPhase, setXray, get phase() { return phase; } };
  (window as unknown as { __s1?: unknown }).__s1 = handle;

  return {
    steps, tasks, onPhase,
    dispose() {
      disposed = true;
      timers.forEach((t) => clearTimeout(t));
      offs.forEach((f) => f());
      sheet?.removeEventListener('click', onPress, true);
      if ((window as unknown as { __s1?: unknown }).__s1 === handle) delete (window as unknown as { __s1?: unknown }).__s1;
      rig.dispose();
      host.side.replaceChildren();
    },
  };
}
