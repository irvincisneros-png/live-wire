// Job 1: Fault call-out. One seeded fault in the 12 V lighting circuit of the training house. The student measures
// with the multimeter (no hints, x-ray off), names the fault and its place, answers the reasoning question and submits.
// The fix is then shown and the result comes from scoreFault.
import type { JobHost, JobInstance } from '../../types';
import { createStage } from '../../kit/stage';
import { solve } from '../../sim/circuit';
import { REASONING_OPTIONS, healthyHouse, houseLayout } from '../../sim/faults';
import { h, s } from '../../ui/dom';
import { createTrainingHouse, type CameraPreset, type HouseHit } from '../house3d';
import {
  FAULT_KINDS, J1_POINTS, SWITCH_IDS, canSubmit, createJ1, liveParts, locationOptions, measure, pointByCode, pointByNode,
  resultJ1, usefulPair, type SwitchId,
} from '../house/j1logic';
import { cameraBar, fmtV } from '../house/ui';
import '../j12.css';

const ROOMS = ['Lounge', 'Kitchen', 'Hallway'];
const SWITCH_NAMES: Record<SwitchId, string> = { main: 'Main switch', sw0: 'Lounge switch', sw1: 'Kitchen switch', sw2: 'Hallway switch' };

export function mount(host: JobHost): JobInstance {
  const stage = createStage(host.view, host.quality, { mood: 'house', minDistance: 6, maxDistance: 220 });
  const house = createTrainingHouse(stage, host.quality);
  house.setTestPointSet('j1');
  house.setNewOutletInstalled(false);
  house.setSupplyDisplay(true);
  house.placeMeter(-1.5, 9.5);
  const st = createJ1(host.seed);
  let submitted = false;
  let disposed = false;
  let probe: { black: number | null; red: number | null } = { black: null, red: null };

  // ── live circuit → globes ──
  const refresh = () => {
    const parts = liveParts(st);
    const sol = solve({ parts });
    for (let k = 0; k < 3; k++) house.setGlobe(k, { power: sol.status === 'ok' ? Math.abs(sol.parts[`g${k}`]?.power ?? 0) : 0 });
    for (const id of SWITCH_IDS) house.setSwitch(id, st.switchOn[id]);
    house.setSupplyDisplay(true);
    roomRows.forEach((row, k) => {
      const lit = sol.status === 'ok' && Math.abs(sol.parts[`g${k}`]?.current ?? 0) > 0.05;
      row.querySelector('.j12-state')!.textContent = lit ? 'On' : 'Off';
      row.classList.toggle('is-on', lit);
    });
  };

  // ── panel ──
  const live = h('p', { class: 'j12-live', 'aria-live': 'polite' }, 'Tap a test point for the black probe, then one for the red probe. Or use the lists below.');
  const roomRows = ROOMS.map((r) => h('li', { class: 'j12-room' }, h('span', null, `${r} light`), h('span', { class: 'j12-state' }, '…')));
  const swBtns = SWITCH_IDS.map((id) => {
    const b = h('button', { class: 'j12-toggle', type: 'button', 'aria-pressed': 'true', onclick: () => toggleSwitch(id) }, h('span', { class: 'j12-toggle-dot', 'aria-hidden': 'true' }), SWITCH_NAMES[id]);
    return b;
  });
  const opt = (v: string, t: string) => h('option', { value: v }, t);
  const pointOpts = () => [opt('', 'Choose a test point'), ...J1_POINTS.map((p) => opt(String(p.node), `${p.code}  ${p.name}`))];
  const selBlack = h('select', { class: 'lw-select j12-select', 'aria-label': 'Black probe (COM) test point' }, pointOpts());
  const selRed = h('select', { class: 'lw-select j12-select', 'aria-label': 'Red probe (V) test point' }, pointOpts());
  const readBtn = h('button', { class: 'lw-btn lw-btn--sm', type: 'button', onclick: () => takeReading() }, 'Take reading');
  const readout = h('div', { class: 'j12-readout', role: 'status' }, h('span', { class: 'q-voltage j12-readout-v' }, '– – –'), h('span', { class: 'j12-readout-u' }, 'V'));
  const tbody = h('tbody');
  const table = h('table', { class: 'j12-table' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, 'Black (COM)'), h('th', { scope: 'col' }, 'Red (V)'), h('th', { scope: 'col' }, h('span', { class: 'q-voltage' }, 'V')))),
    tbody);
  const emptyRow = h('tr', { class: 'j12-empty' }, h('td', { colspan: '4' }, 'No readings yet.'));
  tbody.append(emptyRow);

  const kindRadios = FAULT_KINDS.map((k) => h('label', { class: 'j12-radio' }, h('input', { type: 'radio', name: 'j1-kind', value: k.kind, onchange: () => { st.answerKind = k.kind; update(); } }), h('span', null, k.label)));
  const locSel = h('select', { class: 'lw-select j12-select', 'aria-label': 'Where is the fault?', onchange: () => { st.answerPartId = locSel.value || null; update(); } },
    opt('', 'Choose the part'), ...locationOptions().map((o) => opt(o.id, o.label)));
  const reasonRadios = REASONING_OPTIONS.map((t, i) => h('label', { class: 'j12-radio' }, h('input', { type: 'radio', name: 'j1-reason', value: String(i), onchange: () => { st.reasoning = i; update(); } }), h('span', null, t)));
  const submit = h('button', { class: 'lw-btn j12-submit', type: 'button', disabled: true, onclick: () => { void doSubmit(); } }, 'Submit diagnosis');
  const chips = h('ul', { class: 'j12-progress', 'aria-label': 'Progress' });
  const reveal = h('div', { class: 'j12-reveal', hidden: true, role: 'status' });

  const sec = (title: string, ...kids: (Node | string | null)[]) => h('section', { class: 'j12-sec' }, h('h3', { class: 'j12-h' }, title), ...kids);
  host.panel.replaceChildren(h('div', { class: 'j12' },
    h('div', { class: 'j12-task' },
      h('p', { class: 'lw-kicker' }, 'Call-out ticket'),
      h('h2', { class: 'j12-title' }, 'Lights out at the training house'),
      h('p', null, 'Some lights are not working, with every switch on. Use the multimeter to find the one fault, say what it is and where it is, then submit. Your answers are recorded and scored.'),
      h('p', { class: 'j12-note' }, '12 V training circuit. X-ray is off for this job.')),
    chips,
    sec('What you can see', h('ul', { class: 'j12-rooms' }, roomRows)),
    sec('Switches', h('div', { class: 'j12-toggles' }, swBtns)),
    sec('Multimeter (DC volts)',
      h('div', { class: 'j12-probes' },
        h('label', { class: 'j12-field' }, h('span', { class: 'j12-probe j12-probe--black' }, 'Black (COM)'), selBlack),
        h('label', { class: 'j12-field' }, h('span', { class: 'j12-probe j12-probe--red' }, 'Red (V)'), selRed)),
      h('div', { class: 'j12-readrow' }, readout, readBtn),
      live),
    sec('Readings', h('div', { class: 'j12-tablewrap' }, table)),
    sec('Circuit plan', diagram()),
    sec('Your diagnosis',
      h('fieldset', { class: 'j12-fs' }, h('legend', null, 'What is the fault?'), ...kindRadios),
      h('label', { class: 'j12-field j12-field--wide' }, h('span', null, 'Where is it?'), locSel),
      h('fieldset', { class: 'j12-fs' }, h('legend', null, 'A gap in a circuit reads the full supply voltage. Why?'), ...reasonRadios)),
    reveal,
    h('div', { class: 'j12-submitrow' }, submit)));

  function update(): void {
    submit.disabled = submitted || !canSubmit(st);
    const items: [string, boolean][] = [
      [`Readings: ${st.log.length}`, st.log.length > 0],
      ['Fault type', st.answerKind !== null],
      ['Location', st.answerPartId !== null],
      ['Reason', st.reasoning !== null],
    ];
    chips.replaceChildren(...items.map(([t, ok]) => h('li', { class: `j12-chip${ok ? ' is-done' : ''}` }, h('span', { 'aria-hidden': 'true' }, ok ? '✓' : '○'), ' ', t)));
  }

  function toggleSwitch(id: SwitchId): void {
    if (submitted) return;
    st.switchOn[id] = !st.switchOn[id];
    const b = swBtns[SWITCH_IDS.indexOf(id)];
    b.setAttribute('aria-pressed', String(st.switchOn[id]));
    live.textContent = `${SWITCH_NAMES[id]} ${st.switchOn[id] ? 'on' : 'off'}.`;
    refresh();
  }

  function setProbes(black: number | null, red: number | null): void {
    probe = { black, red };
    selBlack.value = black === null ? '' : String(black);
    selRed.value = red === null ? '' : String(red);
    house.setProbes(black === null ? null : pointByNode(black)!.code, red === null ? null : pointByNode(red)!.code);
  }

  function takeReading(): void {
    if (submitted) return;
    const a = selBlack.value === '' ? null : Number(selBlack.value), b = selRed.value === '' ? null : Number(selRed.value);
    if (a === null || b === null) { live.textContent = 'Choose a test point for each probe first.'; return; }
    setProbes(a, b);
    const v = measure(st, a, b);
    house.setMeterReading(v);
    (readout.firstChild as HTMLElement).textContent = fmtV(v);
    host.dashboard.show({ label: `Meter ${pointByNode(a)!.code} to ${pointByNode(b)!.code}`, V: v });
    emptyRow.remove();
    tbody.append(h('tr', null, h('td', null, String(st.log.length)), h('td', null, pointByNode(a)!.code), h('td', null, pointByNode(b)!.code), h('td', { class: 'j12-num' }, `${fmtV(v)} V`)));
    live.textContent = `Reading ${st.log.length}: ${fmtV(v)} volts between ${pointByNode(a)!.code} and ${pointByNode(b)!.code}.`;
    update();
  }

  selBlack.addEventListener('change', () => setProbes(selBlack.value === '' ? null : Number(selBlack.value), probe.red));
  selRed.addEventListener('change', () => setProbes(probe.black, selRed.value === '' ? null : Number(selRed.value)));

  const offTap = house.onTap((hit: HouseHit) => {
    if (submitted) return;
    if (hit.kind === 'switch') { toggleSwitch(hit.id); return; }
    if (hit.kind !== 'tp') return;
    const p = pointByCode(hit.id);
    if (!p) return;
    if (probe.black === null || probe.red !== null) {
      setProbes(p.node, null);
      house.setMeterReading(null);
      live.textContent = `Black probe on ${p.code} (${p.name}). Tap a second point for the red probe.`;
    } else {
      setProbes(probe.black, p.node);
      takeReading();
    }
  });

  // camera buttons over the view
  const cams = cameraBar(host.view, (p: CameraPreset) => house.view(p), ['overview', 'switchboard', 'lighting']);

  // ── submit and reveal ──
  async function doSubmit(): Promise<void> {
    if (submitted || !canSubmit(st)) return;
    submitted = true;
    update();
    host.panel.querySelectorAll('input, select, button').forEach((el) => { (el as HTMLInputElement).disabled = true; });
    const result = resultJ1(st);
    result.answers.push({ q: 'Readings taken', a: String(st.log.length) });
    const f = st.scenario.fault;
    reveal.hidden = false;
    reveal.replaceChildren(h('b', null, 'The fault: '), f.description, ' ', h('span', null, 'Watch the repair.'));
    const where = house.partPosition(f.partId);
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    // look at the place (from the side the partition stubs do not block), then fix it
    if (where) {
      const yaw = where.x < -8 ? -0.14 : where.x > 8 ? 0.14 : where.x < 0 ? 0.14 : -0.14;
      house.frame({ target: [where.x, where.y, Math.max(1, where.z)], distance: f.kind === 'switch-open' && f.partId === 'main' ? 14 : 16, yaw, pitch: where.y > 20 ? 0.14 : 0.18 }, 1.0);
    }
    house.pulse(where);
    await sleep(900);
    if (disposed) return;
    const k = f.kind === 'blown-globe' ? Number(f.partId.slice(1)) : -1;
    if (f.kind === 'blown-globe') { house.setGlobe(k, { power: 0, blown: true }); await sleep(1300); if (disposed) return; await house.swapGlobe(k, 1.1); }
    else if (f.kind === 'broken-wire') { house.showWireBreak(f.partId); await sleep(1500); if (disposed) return; house.repairWire(f.partId); }
    else await house.swapSwitch(f.partId as SwitchId, 1.0);
    if (disposed) return;
    house.pulse(null);
    // the repaired house with every switch on
    for (const id of SWITCH_IDS) { st.switchOn[id] = true; house.setSwitch(id, true); }
    const sol = solve({ parts: healthyHouse() });
    for (let i = 0; i < 3; i++) house.setGlobe(i, { power: Math.abs(sol.parts[`g${i}`]?.power ?? 0) });
    roomRows.forEach((row) => { row.querySelector('.j12-state')!.textContent = 'On'; row.classList.add('is-on'); });
    house.view('lighting', 1.0);
    await sleep(1700);
    if (disposed) return;
    host.finish(result);
  }

  // ── debug handle for testers ──
  const api = {
    house, stage, state: st,
    /** a correct run driven through the UI: one useful reading, the right answers, submit */
    async solve() {
      const m = usefulPair(st)!;
      selBlack.value = String(m.a); selRed.value = String(m.b); takeReading();
      check(`input[name="j1-kind"][value="${st.scenario.fault.kind}"]`);
      locSel.value = st.scenario.fault.partId; locSel.dispatchEvent(new Event('change'));
      check('input[name="j1-reason"][value="0"]');
      await doSubmit();
    },
    /** a poor run: a reading across the supply only and wrong answers */
    async solvePoor() {
      selBlack.value = '0'; selRed.value = '1'; takeReading();
      const wrong = FAULT_KINDS.find((x) => x.kind !== st.scenario.fault.kind)!.kind;
      check(`input[name="j1-kind"][value="${wrong}"]`);
      const room = houseLayout().parts[st.scenario.fault.partId].room;
      locSel.value = locationOptions().find((o) => houseLayout().parts[o.id].room !== room)!.id; locSel.dispatchEvent(new Event('change'));
      check('input[name="j1-reason"][value="2"]');
      await doSubmit();
    },
    view: (p: CameraPreset) => house.view(p, 0),
    fault: () => st.scenario.fault,
  };
  function check(sel: string): void { const el = host.panel.querySelector(sel) as HTMLInputElement | null; if (el) { el.checked = true; el.dispatchEvent(new Event('change')); } }
  (window as unknown as { __j1?: typeof api }).__j1 = api;

  refresh();
  update();
  return {
    dispose() {
      disposed = true;
      offTap();
      cams.remove();
      house.dispose();
      stage.dispose();
      host.panel.replaceChildren();
      host.dashboard.show(null);
      const w = window as unknown as { __j1?: unknown };
      if (w.__j1 === api) delete w.__j1;
    },
  };
}

/** a compact plan of the lighting circuit with every test point, drawn from the sim layout (the healthy design) */
function diagram(): SVGSVGElement {
  const lay = houseLayout();
  const S = 26, ox = 22, oy = 26;
  const P = (n: number) => ({ x: ox + lay.nodes[n].x * S, y: oy + lay.nodes[n].y * S });
  const el = s('svg', { class: 'j12-diagram', viewBox: `0 0 ${ox * 2 + 13 * S} ${oy + 6 * S + 26}`, role: 'img', 'aria-label': 'Plan of the 12 V lighting circuit with test points T1 to T15' });
  const line = (pts: { x: number; y: number }[], cls = 'j12-d-wire') => el.append(s('polyline', { class: cls, points: pts.map((p) => `${p.x},${p.y}`).join(' ') }));
  const text = (x: number, y: number, t: string, cls = 'j12-d-label', anchor = 'middle') => el.append(s('text', { x, y, class: cls, 'text-anchor': anchor }, t));
  // battery and main switch
  const p0 = P(0), p1 = P(1), p2 = P(2);
  line([p0, { x: p0.x, y: (p0.y + p1.y) / 2 + 8 }]); line([{ x: p1.x, y: (p0.y + p1.y) / 2 - 8 }, p1]);
  const by = (p0.y + p1.y) / 2;
  el.append(s('line', { class: 'j12-d-sym', x1: p0.x - 12, x2: p0.x + 12, y1: by - 8, y2: by - 8 }), s('line', { class: 'j12-d-sym', x1: p0.x - 6, x2: p0.x + 6, y1: by + 8, y2: by + 8 }));
  text(p0.x + 16, by + 4, '12 V', 'j12-d-label', 'start');
  const sw = (a: { x: number; y: number }, b: { x: number; y: number }, horiz: boolean) => {
    if (horiz) { const m = (a.x + b.x) / 2; line([a, { x: m - 9, y: a.y }]); line([{ x: m + 9, y: a.y }, b]); el.append(s('line', { class: 'j12-d-sym', x1: m - 9, y1: a.y, x2: m + 8, y2: a.y - 9 })); }
    else { const m = (a.y + b.y) / 2; line([a, { x: a.x, y: m - 9 }]); line([{ x: a.x, y: m + 9 }, b]); el.append(s('line', { class: 'j12-d-sym', x1: a.x, y1: m - 9, x2: a.x + 9, y2: m + 8 })); }
  };
  sw(p1, p2, true); text((p1.x + p2.x) / 2, p1.y - 12, 'Main');
  for (let k = 0; k < 3; k++) {
    const n = 3 + 4 * k, a = P(n), b = P(n + 1), c = P(n + 2), d = P(n + 3);
    const L = 'ABCDEFGHI';
    line([p2, { x: a.x, y: p2.y }, a]); text(a.x - 9, (p2.y + a.y) / 2 + 4, L[3 * k], 'j12-d-wl');
    sw(a, b, false);
    line([b, c]); text(b.x - 9, (b.y + c.y) / 2 + 4, L[3 * k + 1], 'j12-d-wl');
    // lamp
    const m = (c.y + d.y) / 2;
    line([c, { x: c.x, y: m - 10 }]); line([{ x: c.x, y: m + 10 }, d]);
    el.append(s('circle', { class: 'j12-d-sym', cx: c.x, cy: m, r: 10 }), s('path', { class: 'j12-d-sym', d: `M${c.x - 7} ${m - 7} L${c.x + 7} ${m + 7} M${c.x + 7} ${m - 7} L${c.x - 7} ${m + 7}` }));
    line([d, { x: d.x, y: p0.y }, k === 0 ? p0 : { x: P(3 + 4 * (k - 1)).x, y: p0.y }]);
    text(d.x - 9, p0.y - 4, L[3 * k + 2], 'j12-d-wl');
    text(a.x, oy - 12 + 0, ROOMS[k], 'j12-d-room');
  }
  // test points
  for (const tp of J1_POINTS) {
    const p = P(tp.node);
    el.append(s('circle', { class: 'j12-d-tp', cx: p.x, cy: p.y, r: 3.6 }));
    const right = tp.node >= 3 || tp.node === 2;
    text(p.x + (right ? 6 : -6), p.y + (tp.node === 2 ? 14 : 4), tp.code, 'j12-d-tpl', right ? 'start' : 'end');
  }
  return el;
}
