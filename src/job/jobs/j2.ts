// Job 2: Install a new power point on the 12 V training wall. The student switches the training supply, proves it
// dead with the meter, connects the new outlet's three conductors, plugs in test lamps, restores supply, tests and
// predicts the total current (I = V ÷ R). No shock is ever simulated: unsafe work shows a calm stop card and costs
// the safe-work marks. Scored by scoreOutlet.
import type { JobHost, JobInstance } from '../../types';
import { createStage } from '../../kit/stage';
import { SAFETY_MESSAGE } from '../../ui/content';
import { h } from '../../ui/dom';
import { OUTLET_POINTS, type OutletPoint, type OutletTerminal } from '../../sim/outlet';
import { createTrainingHouse, type CameraPreset, type HouseHit } from '../house3d';
import {
  J2_POINTS, TERMINALS, canSubmit, connect, createJ2, j2Point, live, measure, plug, pointLabel, resultJ2, setSupply, wiringComplete,
} from '../house/j2logic';
import { cameraBar, fmtV, stopCard } from '../house/ui';
import '../j12.css';

const TERM_LABEL: Record<OutletTerminal, string> = { active: 'Active (red)', neutral: 'Neutral (black)', earth: 'Earth (green-yellow)' };
const STOP_TITLE = 'Stop.';
const STOP_BODY = 'On a real job this is how people are hurt. The supply must be off and proven dead before anyone touches a conductor.';

export function mount(host: JobHost): JobInstance {
  const stage = createStage(host.view, host.quality, { mood: 'house', minDistance: 6, maxDistance: 220 });
  const house = createTrainingHouse(stage, host.quality);
  house.setTestPointSet('j2');
  house.setNewOutletInstalled(true);
  house.placeMeter(24.4, 3.4);
  house.view('outletWall', 0);
  const st = createJ2(host.seed);
  let submitted = false, disposed = false;
  let probe: { black: string | null; red: string | null } = { black: null, red: null };
  let stopEl: HTMLElement | null = null;

  const refresh = () => {
    const l = live(st);
    house.setSwitch('main', st.supplyOn);
    house.setSupplyDisplay(st.supplyOn);
    for (let k = 0; k < 3; k++) house.setGlobe(k, { power: st.supplyOn ? 10 : 0 });
    house.setTestLamp('existing', { plugged: st.plugged.existing, power: l.lampPowerW.existing });
    house.setTestLamp('new', { plugged: st.plugged.new, power: l.lampPowerW.new });
    supplyBtn.setAttribute('aria-pressed', String(st.supplyOn));
    supplyBtn.lastChild!.textContent = st.supplyOn ? 'Training supply is ON (tap to switch off)' : 'Training supply is OFF (tap to switch on)';
    lampBtns.existing.setAttribute('aria-pressed', String(st.plugged.existing));
    lampBtns.new.setAttribute('aria-pressed', String(st.plugged.new));
    update();
  };

  // ── panel ──
  const liveMsg = h('p', { class: 'j12-live', 'aria-live': 'polite' }, 'Tap two terminals on the wall to place the meter probes (black first), or use the lists.');
  const supplyBtn = h('button', { class: 'j12-toggle', type: 'button', 'aria-pressed': 'true', onclick: () => doSupply(!st.supplyOn) }, h('span', { class: 'j12-toggle-dot', 'aria-hidden': 'true' }), 'Training supply');
  const opt = (v: string, t: string) => h('option', { value: v }, t);
  const pOpts = () => [opt('', 'Choose a terminal'), ...J2_POINTS.map((p) => opt(p.id, p.name))];
  const selBlack = h('select', { class: 'lw-select j12-select', 'aria-label': 'Black probe (COM) terminal' }, pOpts());
  const selRed = h('select', { class: 'lw-select j12-select', 'aria-label': 'Red probe (V) terminal' }, pOpts());
  const readBtn = h('button', { class: 'lw-btn lw-btn--sm', type: 'button', onclick: () => takeReading() }, 'Take reading');
  const readout = h('div', { class: 'j12-readout', role: 'status' }, h('span', { class: 'q-voltage j12-readout-v' }, '– – –'), h('span', { class: 'j12-readout-u' }, 'V'));
  const tbody = h('tbody');
  const emptyRow = h('tr', { class: 'j12-empty' }, h('td', { colspan: '4' }, 'No readings yet.'));
  tbody.append(emptyRow);
  const table = h('table', { class: 'j12-table' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Black'), h('th', { scope: 'col' }, 'Red'), h('th', { scope: 'col' }, 'Supply'), h('th', { scope: 'col' }, h('span', { class: 'q-voltage' }, 'V')))), tbody);
  const connSel = {} as Record<OutletTerminal, HTMLSelectElement>;
  const connRows = TERMINALS.map((t) => {
    const sel = h('select', { class: 'lw-select j12-select', 'aria-label': `New outlet ${TERM_LABEL[t]} terminal connects to` },
      opt('', 'Not connected'), ...OUTLET_POINTS.map((p) => opt(p, pointLabel(p))));
    sel.addEventListener('change', () => doConnect(t, (sel.value || null) as OutletPoint | null));
    connSel[t] = sel;
    return h('label', { class: 'j12-field j12-field--wide' }, h('span', null, `New outlet ${TERM_LABEL[t]}`), sel);
  });
  const lampBtns = {
    existing: h('button', { class: 'j12-toggle', type: 'button', 'aria-pressed': 'false', onclick: () => doPlug('existing', !st.plugged.existing) }, h('span', { class: 'j12-toggle-dot', 'aria-hidden': 'true' }), 'Lamp 1 in existing outlet'),
    new: h('button', { class: 'j12-toggle', type: 'button', 'aria-pressed': 'false', onclick: () => doPlug('new', !st.plugged.new) }, h('span', { class: 'j12-toggle-dot', 'aria-hidden': 'true' }), 'Lamp 2 in new outlet'),
  };
  const predIn = h('input', { class: 'lw-input', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', 'aria-label': 'Predicted total current in amps', placeholder: 'e.g. 1.5' });
  predIn.addEventListener('input', () => { const v = parseFloat(predIn.value); st.predictedA = Number.isFinite(v) ? v : null; update(); });
  const submit = h('button', { class: 'lw-btn j12-submit', type: 'button', disabled: true, onclick: () => { void doSubmit(); } }, 'Submit the job');
  const chips = h('ul', { class: 'j12-progress', 'aria-label': 'Progress' });
  const done = h('div', { class: 'j12-reveal', hidden: true, role: 'status' });
  const sec = (title: string, ...kids: (Node | string | null)[]) => h('section', { class: 'j12-sec' }, h('h3', { class: 'j12-h' }, title), ...kids);

  host.panel.replaceChildren(h('div', { class: 'j12' },
    h('div', { class: 'j12-task' },
      h('p', { class: 'lw-kicker' }, 'Work order'),
      h('h2', { class: 'j12-title' }, 'Install a new power point'),
      h('p', null, 'Add a second 12 V training outlet to the kitchen wall so it works alongside the existing one. Work safely, test both outlets with a lamp, then predict the new total current. Do the steps in the order you choose. Your actions are recorded and scored.'),
      h('p', { class: 'j12-safety' }, h('b', null, 'Safety. '), SAFETY_MESSAGE, ' This is a 12 V training wall. It is not a how-to for house wiring.')),
    chips,
    sec('Training supply (main switch)', supplyBtn),
    sec('Multimeter (DC volts)',
      h('div', { class: 'j12-probes' },
        h('label', { class: 'j12-field' }, h('span', { class: 'j12-probe j12-probe--black' }, 'Black (COM)'), selBlack),
        h('label', { class: 'j12-field' }, h('span', { class: 'j12-probe j12-probe--red' }, 'Red (V)'), selRed)),
      h('div', { class: 'j12-readrow' }, readout, readBtn),
      liveMsg,
      h('div', { class: 'j12-tablewrap' }, table)),
    sec('Connect the new outlet', h('div', { class: 'j12-probes' }, connRows),
      h('p', { class: 'j12-note' }, 'Colour convention on this wall: red active, black neutral, green-yellow earth. Colour never proves a wire is safe.')),
    sec('Test lamps', h('div', { class: 'j12-toggles' }, lampBtns.existing, lampBtns.new),
      h('ul', { class: 'j12-lamps' },
        h('li', null, `Lamp 1: 12 V lamp, `, h('span', { class: 'q-resistance' }, `R = ${st.existingR} Ω`)),
        h('li', null, `Lamp 2: 12 V lamp, `, h('span', { class: 'q-resistance' }, `R = ${st.newR} Ω`)))),
    sec('Prediction',
      h('p', { style: 'margin:0' }, 'The supply is 12 V. With both lamps plugged in and on, what total ', h('span', { class: 'q-current' }, 'current (I)'), ' will the supply deliver? Use I = V ÷ R.'),
      h('label', { class: 'j12-num-in' }, predIn, h('span', { class: 'lw-unit' }, 'A'))),
    done,
    h('div', { class: 'j12-submitrow' }, submit)));

  function update(): void {
    submit.disabled = submitted || !canSubmit(st);
    const n = TERMINALS.filter((t) => st.wiring[t]).length;
    const items: [string, boolean][] = [
      [`Supply ${st.supplyOn ? 'on' : 'off'}`, !st.supplyOn],
      [`Readings: ${st.readings.length}`, st.readings.length > 0],
      [`Conductors ${n}/3`, n === 3],
      [`Lamps ${(st.plugged.existing ? 1 : 0) + (st.plugged.new ? 1 : 0)}/2`, st.plugged.existing && st.plugged.new],
      ['Prediction', st.predictedA !== null],
    ];
    chips.replaceChildren(...items.map(([t, ok]) => h('li', { class: `j12-chip${ok ? ' is-done' : ''}` }, h('span', { 'aria-hidden': 'true' }, ok ? '✓' : '○'), ' ', t)));
  }

  function doSupply(on: boolean): void {
    if (submitted) return;
    setSupply(st, on);
    liveMsg.textContent = `Training supply switched ${st.supplyOn ? 'on' : 'off'}.`;
    refresh();
  }

  function doConnect(t: OutletTerminal, p: OutletPoint | null): void {
    if (submitted) return;
    const problem = connect(st, t, p);
    house.setConductor(t, p);
    connSel[t].value = p ?? '';
    liveMsg.textContent = p ? `New outlet ${t} connected to ${pointLabel(p)}.` : `New outlet ${t} disconnected.`;
    refresh();
    if (problem && !stopEl) {
      stopEl = stopCard(host.view, STOP_TITLE, STOP_BODY, () => { stopEl = null; connSel[t].focus(); });
    }
  }

  function doPlug(k: 'existing' | 'new', on: boolean): void {
    if (submitted) return;
    plug(st, k, on);
    liveMsg.textContent = `Lamp ${k === 'existing' ? 1 : 2} ${on ? 'plugged in' : 'unplugged'}.`;
    refresh();
  }

  function setProbes(black: string | null, red: string | null): void {
    probe = { black, red };
    selBlack.value = black ?? ''; selRed.value = red ?? '';
    house.setProbes(black, red);
  }

  function takeReading(): void {
    if (submitted) return;
    const a = selBlack.value || null, b = selRed.value || null;
    if (!a || !b) { liveMsg.textContent = 'Choose a terminal for each probe first.'; return; }
    setProbes(a, b);
    const pa = j2Point(a)!, pb = j2Point(b)!;
    const v = measure(st, pa.node, pb.node);
    house.setMeterReading(v);
    (readout.firstChild as HTMLElement).textContent = fmtV(v);
    host.dashboard.show({ label: `Meter ${pa.short} to ${pb.short}`, V: v });
    emptyRow.remove();
    tbody.append(h('tr', null, h('td', null, pa.short), h('td', null, pb.short), h('td', null, st.supplyOn ? 'on' : 'off'), h('td', { class: 'j12-num' }, `${fmtV(v)} V`)));
    liveMsg.textContent = `${fmtV(v)} volts from ${pa.name} (black) to ${pb.name} (red).`;
    update();
  }
  selBlack.addEventListener('change', () => setProbes(selBlack.value || null, probe.red));
  selRed.addEventListener('change', () => setProbes(probe.black, selRed.value || null));

  const offTap = house.onTap((hit: HouseHit) => {
    if (submitted || stopEl) return;
    if (hit.kind === 'switch' && hit.id === 'main') { doSupply(!st.supplyOn); return; }
    if (hit.kind === 'lamp') { doPlug(hit.id, !st.plugged[hit.id]); return; }
    if (hit.kind !== 'tp') return;
    const p = j2Point(hit.id);
    if (!p) return;
    if (probe.black === null || probe.red !== null) {
      setProbes(p.id, null); house.setMeterReading(null);
      liveMsg.textContent = `Black probe on ${p.name}. Tap a second terminal for the red probe.`;
    } else { setProbes(probe.black, p.id); takeReading(); }
  });

  const cams = cameraBar(host.view, (p: CameraPreset) => house.view(p), ['outletWall', 'switchboard', 'overview']);

  async function doSubmit(): Promise<void> {
    if (submitted || !canSubmit(st)) return;
    submitted = true;
    stopEl?.remove(); stopEl = null;
    host.panel.querySelectorAll('input, select, button').forEach((el) => { (el as HTMLInputElement).disabled = true; });
    const result = resultJ2(st);
    result.answers.push({ q: 'Meter readings taken', a: String(st.readings.length) }, { q: 'Stop cards', a: String(st.stops) });
    done.hidden = false;
    const l = live(st);
    done.replaceChildren(h('b', null, 'Job submitted. '), st.supplyOn ? `The supply is delivering ${fmtV(l.totalA)} A.` : 'The supply is off.');
    house.view('outletWall', 0.8);
    await new Promise<void>((r) => setTimeout(r, 1600));
    if (disposed) return;
    host.finish(result);
  }

  const api = {
    house, stage, state: st,
    /** a correct run through the UI: off, prove dead, connect in parallel, lamps, on, test, predict, submit */
    async solve() {
      doSupply(false);
      selBlack.value = 'existing-neutral'; selRed.value = 'existing-active'; takeReading();
      for (const t of TERMINALS) doConnect(t, `existing-${t}` as OutletPoint);
      doPlug('existing', true); doPlug('new', true);
      doSupply(true);
      selBlack.value = 'new-neutral'; selRed.value = 'new-active'; takeReading();
      predIn.value = (12 / st.existingR + 12 / st.newR).toFixed(2); predIn.dispatchEvent(new Event('input'));
      await doSubmit();
    },
    /** a poor run: wires it live, swapped, earth on active, a wild guess */
    async solvePoor() {
      doConnect('active', 'existing-neutral');
      (host.view.querySelector('.j12-stop button') as HTMLButtonElement | null)?.click();
      doConnect('neutral', 'existing-active'); doConnect('earth', 'existing-active');
      doPlug('new', true);
      predIn.value = '50'; predIn.dispatchEvent(new Event('input'));
      await doSubmit();
    },
    /** stage a mid-job state for screenshots */
    stage1() {
      doSupply(false);
      selBlack.value = 'existing-neutral'; selRed.value = 'existing-active'; takeReading();
      doConnect('active', 'existing-active'); doConnect('neutral', 'existing-neutral'); doConnect('earth', 'existing-earth');
      doPlug('existing', true); doPlug('new', true); doSupply(true);
    },
    view: (p: CameraPreset) => house.view(p, 0),
    complete: () => wiringComplete(st),
  };
  (window as unknown as { __j2?: typeof api }).__j2 = api;

  refresh();
  return {
    dispose() {
      disposed = true;
      offTap();
      cams.remove();
      stopEl?.remove();
      house.dispose();
      stage.dispose();
      host.panel.replaceChildren();
      host.dashboard.show(null);
      const w = window as unknown as { __j2?: unknown };
      if (w.__j2 === api) delete w.__j2;
    },
  };
}
