// Station 5 DOM: the meter readout + run dock over the 3D view, and the side panel
// (formula lines, energy chart, Energy Rating label viewer).
import { EXAMPLE_PRICE_PER_KWH, LABEL_PAIRS, SIZE_TRAP, labelById, pairSavingPerYear, type LabelType } from '../../sim/appliances';
import { fmt, fmtMoney, joulesToKWh } from '../../sim/units';
import { MORE_RUNS, QUICK_RUNS, RUNS, S5_IDS, clockText, costText, durationText, grouped, insight, meterWatts, s5Appliance, summary, type RunMode, type S5State } from './model';
import { labelSvg } from './label';
import { starText, typeWord } from './tasks';

const PRICE_C = Math.round(EXAMPLE_PRICE_PER_KWH * 100);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e;
};

// ───────────── dock (meter readout + run buttons) ─────────────
export interface Dock {
  update(s: S5State): void;
  setFree(free: boolean): void;
  /** view height in px: the dock slims down (and hides) when the view is short, e.g. with the phone panel open */
  setSize(h: number): void;
  flash(msg: string): void;
  dispose(): void;
}

export function createDock(view: HTMLElement, onRun: (m: RunMode) => void, onAll: (on: boolean) => void): Dock {
  const root = el('div', 's5-dock');
  const lcd = el('div', 's5-lcd');
  lcd.innerHTML = `<div class="s5-lcd-head"><span class="s5-lcd-lab">Power meter</span><span class="s5-lcd-on"></span></div>
    <div class="s5-lcd-grid">
      <div class="s5-lcd-cell s5-lcd-p"><small>Power</small><b data-k="p"></b></div>
      <div class="s5-lcd-cell"><small>Time on</small><b data-k="t"></b></div>
      <div class="s5-lcd-cell s5-lcd-e"><small>Energy</small><b data-k="j"></b></div>
      <div class="s5-lcd-cell"><small>kWh</small><b data-k="k"></b></div>
      <div class="s5-lcd-cell"><small>Cost*</small><b data-k="c"></b></div>
    </div>`;
  const run = el('div', 's5-run');
  const clock = el('div', 's5-clock', '<small>Sim clock</small><b>0:00:00</b>');
  const btns = el('div', 's5-run-btns');
  const buttons = new Map<RunMode, HTMLButtonElement>();
  for (const m of QUICK_RUNS) {
    const b = el('button', 's5-runbtn', `<span class="s5-play" aria-hidden="true">▶</span>${RUNS[m].label}`);
    b.type = 'button'; b.dataset.mode = m;
    b.title = RUNS[m].typical ? 'Run one day: each appliance runs for its usual time' : `Run everything that is on for ${RUNS[m].label}`;
    b.addEventListener('click', () => onRun(m));
    btns.appendChild(b); buttons.set(m, b);
  }
  const more = el('select', 's5-more') as HTMLSelectElement;
  more.setAttribute('aria-label', 'Run for another time');
  more.innerHTML = `<option value="">More times…</option>` + MORE_RUNS.map((m) => `<option value="${m}">${RUNS[m].label}</option>`).join('');
  more.addEventListener('change', () => { const v = more.value as RunMode; more.value = ''; if (v) onRun(v); });
  const all = el('button', 's5-allbtn', 'All on');
  all.type = 'button';
  let allOn = false;
  all.addEventListener('click', () => { allOn = !allOn; onAll(allOn); all.textContent = allOn ? 'All off' : 'All on'; });
  btns.append(more, all);
  run.append(clock, btns);
  const prog = el('div', 's5-prog', '<i></i>');
  const msg = el('div', 's5-msg'); msg.setAttribute('role', 'status');
  root.append(lcd, run, prog, msg);
  view.appendChild(root);
  const cell = (k: string) => lcd.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
  const cP = cell('p'), cT = cell('t'), cJ = cell('j'), cK = cell('k'), cC = cell('c');
  const lab = lcd.querySelector<HTMLElement>('.s5-lcd-lab')!, onEl = lcd.querySelector<HTMLElement>('.s5-lcd-on')!;
  const bar = prog.querySelector('i')!;
  let msgTimer = 0;
  const setText = (e: HTMLElement, t: string) => { if (e.textContent !== t) e.textContent = t; };
  return {
    update(s) {
      const a = s5Appliance(s.meter.on);
      const w = meterWatts(s);
      const sum = summary(s.meter.joules);
      setText(lab, `Meter on: ${a.name}`);
      setText(onEl, s.on[a.id] ? (w > 0 ? 'running' : 'on, idle') : 'switched off');
      onEl.dataset.state = s.on[a.id] ? (w > 0 ? 'run' : 'idle') : 'off';
      setText(cP, `P = ${grouped(w)} W`);
      setText(cT, clockText(s.meter.seconds));
      setText(cJ, `E = ${fmt(s.meter.joules, 'J')}`);
      setText(cK, `${sum.kWh === 0 ? '0' : sum.kWh < 0.001 ? sum.kWh.toExponential(1) : Number(sum.kWh.toPrecision(3))} kWh`);
      setText(cC, costText(sum.dollars));
      const r = s.run;
      setText(clock.querySelector('b')!, clockText(r ? r.t : s.last ? RUNS[s.last.mode].seconds : 0));
      clock.classList.toggle('is-running', !!r);
      bar.style.width = r ? `${(100 * r.t) / RUNS[r.mode].seconds}%` : '0%';
      root.classList.toggle('is-running', !!r);
      for (const [m, b] of buttons) { b.disabled = !!r; b.classList.toggle('is-current', !!r && r.mode === m); }
      more.disabled = !!r; all.disabled = !!r;
      if (!S5_IDS.some((id) => s.on[id]) && allOn) { allOn = false; all.textContent = 'All on'; }
      if (S5_IDS.every((id) => s.on[id]) && !allOn) { allOn = true; all.textContent = 'All off'; }
    },
    setFree(free) { root.classList.toggle('is-free', free); },
    setSize(h) { root.classList.toggle('is-short', h < 470); root.classList.toggle('is-tiny', h < 330); },
    flash(m) {
      msg.textContent = m; msg.classList.add('is-on');
      clearTimeout(msgTimer); msgTimer = window.setTimeout(() => msg.classList.remove('is-on'), 2600);
    },
    dispose() { clearTimeout(msgTimer); root.remove(); },
  };
}

// ───────────── side panel ─────────────
export type ChartUnit = 'J' | 'kWh' | 'cost';
export type PairKey = LabelType | 'trap';

export interface Panel {
  update(s: S5State): void;
  readonly unit: ChartUnit;
  setUnit(u: ChartUnit): void;
  readonly viewerOpen: boolean;
  readonly pair: PairKey;
  openViewer(p: PairKey | null): void;
  dispose(): void;
}

const PAIR_TABS: { key: PairKey; label: string }[] = [
  { key: 'fridge', label: 'Fridges 400 L' }, { key: 'tv', label: 'TVs 55 inch' }, { key: 'washing-machine', label: 'Washers 7 kg' }, { key: 'trap', label: 'Size trap' },
];

export function createPanel(side: HTMLElement, onChange: () => void): Panel {
  let unit: ChartUnit = 'J';
  let open = false;
  let pair: PairKey = 'fridge';
  side.replaceChildren();

  // formulas
  const fSec = el('section', 's5-sec s5-formulas');
  fSec.innerHTML = `<h3 class="s5-h">Energy = power × time</h3>
    <p class="s5-f"><span class="s5-f-lead"><span class="q-energy">E</span> = <span class="q-power">P</span> × t</span><span class="s5-f-nums" data-f="j"></span></p>
    <p class="s5-f"><span class="s5-f-lead">in kWh</span><span class="s5-f-nums" data-f="k"></span></p>
    <p class="s5-f"><span class="s5-f-lead">cost = kWh × price</span><span class="s5-f-nums" data-f="c"></span></p>
    <p class="s5-note">Power in watts (W) is how many joules (J) are transformed every second. 1 kWh = 1000 W for 1 hour = 3 600 000 J (3.6 MJ). Bills count kWh. *Price: ${PRICE_C} c per kWh, an example price.</p>`;
  const fJ = fSec.querySelector<HTMLElement>('[data-f="j"]')!, fK = fSec.querySelector<HTMLElement>('[data-f="k"]')!, fC = fSec.querySelector<HTMLElement>('[data-f="c"]')!;

  // chart
  const cSec = el('section', 's5-sec s5-chart');
  const cHead = el('div', 's5-chart-head', '<h3 class="s5-h">Energy used in the last run</h3>');
  const seg = el('div', 's5-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Show energy as');
  const segBtns = new Map<ChartUnit, HTMLButtonElement>();
  for (const [u, t] of [['J', 'Joules'], ['kWh', 'kWh'], ['cost', 'Cost']] as const) {
    const b = el('button', 's5-segbtn', t); b.type = 'button';
    b.addEventListener('click', () => { api.setUnit(u); onChange(); });
    seg.appendChild(b); segBtns.set(u, b);
  }
  cHead.appendChild(seg);
  const cap = el('p', 's5-cap');
  const rows = el('div', 's5-rows');
  const rowEls = new Map<string, { row: HTMLElement; fill: HTMLElement; val: HTMLElement; sub: HTMLElement }>();
  for (const id of S5_IDS) {
    const a = s5Appliance(id);
    const row = el('div', 's5-row', `<div class="s5-row-name">${a.name}<small>${grouped(a.powerW)} W</small></div><div class="s5-row-bar"><i></i></div><div class="s5-row-val"></div><div class="s5-row-sub"></div>`);
    rows.appendChild(row);
    rowEls.set(id, { row, fill: row.querySelector('i')!, val: row.querySelector('.s5-row-val')!, sub: row.querySelector('.s5-row-sub')! });
  }
  const ins = el('p', 's5-insight');
  cSec.append(cHead, cap, rows, ins);

  // label viewer
  const lSec = el('section', 's5-sec s5-labels');
  const tog = el('button', 's5-lv-toggle', '<span>Energy Rating label viewer</span><span class="s5-chev" aria-hidden="true">▾</span>');
  tog.type = 'button'; tog.setAttribute('aria-expanded', 'false');
  const body = el('div', 's5-lv-body'); body.hidden = true;
  const ptabs = el('div', 's5-seg s5-pairtabs'); ptabs.setAttribute('role', 'group'); ptabs.setAttribute('aria-label', 'Labels to compare');
  const pBtns = new Map<PairKey, HTMLButtonElement>();
  for (const t of PAIR_TABS) {
    const b = el('button', 's5-segbtn', t.label); b.type = 'button';
    b.addEventListener('click', () => { api.openViewer(t.key); onChange(); });
    ptabs.appendChild(b); pBtns.set(t.key, b);
  }
  const pairEl = el('div', 's5-lv-pair');
  const cmp = el('p', 's5-lv-cmp');
  const note = el('p', 's5-note', 'More stars means more efficient <b>than other models of the same type and a similar size</b>. The kWh figure comes from a standard test, so it is an estimate: your real use = power × your own hours.');
  body.append(ptabs, pairEl, cmp, note);
  tog.addEventListener('click', () => { api.openViewer(open ? null : pair); onChange(); });
  lSec.append(tog, body);

  side.append(fSec, cSec, lSec);

  const renderPair = () => {
    for (const [k, b] of pBtns) { b.classList.toggle('is-on', k === pair); b.setAttribute('aria-pressed', String(k === pair)); }
    let a, b;
    if (pair === 'trap') { a = labelById(SIZE_TRAP[0])!; b = labelById(SIZE_TRAP[1])!; }
    else { const p = LABEL_PAIRS.find((x) => x.type === pair)!; a = labelById(p.lower)!; b = labelById(p.higher)!; }
    pairEl.innerHTML = `<figure>${labelSvg(a, 'Model A')}<figcaption>Model A</figcaption></figure><figure>${labelSvg(b, 'Model B')}<figcaption>Model B</figcaption></figure>`;
    if (pair === 'trap') {
      cmp.innerHTML = `<b>Careful: different sizes.</b> Model B (${starText(b.stars)}, ${b.sizeLabel}) uses ${b.kWhPerYear} kWh a year, which is <b>${b.kWhPerYear - a.kWhPerYear} kWh more</b> than Model A (${starText(a.stars)}, ${a.sizeLabel}, ${a.kWhPerYear} kWh). Stars only compare ${typeWord(a.type)}s of a similar size.`;
    } else {
      const p = LABEL_PAIRS.find((x) => x.type === pair)!;
      const gap = a.kWhPerYear - b.kWhPerYear;
      cmp.innerHTML = `Same type, same size, so the stars compare fairly. Model B (${starText(b.stars)}) uses ${a.kWhPerYear} − ${b.kWhPerYear} = <b>${gap} kWh less</b> each year. ${gap} kWh × $${EXAMPLE_PRICE_PER_KWH.toFixed(2)} = <b>${fmtMoney(pairSavingPerYear(p))} saved a year</b> (example price).`;
    }
  };

  const api: Panel = {
    get unit() { return unit; },
    get viewerOpen() { return open; },
    get pair() { return pair; },
    setUnit(u) {
      unit = u;
      for (const [k, b] of segBtns) { b.classList.toggle('is-on', k === u); b.setAttribute('aria-pressed', String(k === u)); }
      last = '';
    },
    openViewer(p) {
      open = p !== null;
      if (p) pair = p;
      body.hidden = !open;
      tog.setAttribute('aria-expanded', String(open));
      lSec.classList.toggle('is-open', open);
      if (open) renderPair();
    },
    update(s) {
      // formulas follow the meter
      const a = s5Appliance(s.meter.on);
      const t = s.meter.seconds, j = s.meter.joules, sm = summary(j);
      fJ.innerHTML = `<span class="q-energy">${grouped(j)} J</span> = <span class="q-power">${grouped(a.powerW)} W</span> × ${grouped(t)} s`;
      const kw = a.powerW / 1000, h = t / 3600;
      fK.innerHTML = `${kwhText(sm.kWh)} kWh = ${kw} kW × ${Number(h.toPrecision(3))} h`;
      fC.innerHTML = `${costText(sm.dollars)} = ${kwhText(sm.kWh)} kWh × ${PRICE_C} c`;
      fSec.dataset.app = a.name;
      // chart
      const key = `${s.runs}|${unit}|${s.run ? Math.floor(s.run.t) : -1}`;
      if (key === last) return;
      last = key;
      const src = s.run ?? s.last;
      if (!src) {
        cap.textContent = 'No run yet. Switch something on, then press a Run button.';
        for (const r of rowEls.values()) { r.fill.style.width = '0%'; r.val.textContent = ''; r.sub.textContent = ''; r.row.classList.add('is-off'); }
        ins.textContent = '';
        return;
      }
      const mode = s.run ? s.run.mode : s.last!.mode;
      cap.textContent = `${s.run ? 'Running' : 'Last run'}: ${RUNS[mode].label}${RUNS[mode].typical ? ' (each appliance runs for its usual time)' : ''}.${unit === 'cost' ? ` Price ${PRICE_C} c per kWh (example price).` : ''}`;
      const val = (id: (typeof S5_IDS)[number]) => { const x = src.joules[id]; return unit === 'J' ? x : unit === 'kWh' ? joulesToKWh(x) : summary(x).dollars; };
      const max = Math.max(...S5_IDS.map(val), 1e-12);
      for (const id of S5_IDS) {
        const r = rowEls.get(id)!, v = val(id), was = src.on.includes(id);
        r.row.classList.toggle('is-off', !was);
        r.fill.style.width = `${Math.max(was && v > 0 ? 1.2 : 0, (100 * v) / max)}%`;
        r.val.textContent = !was ? 'off' : unit === 'J' ? fmt(v, 'J') : unit === 'kWh' ? `${kwhText(v)} kWh` : costText(v);
        r.sub.textContent = was ? `on for ${durationText(src.seconds[id])}` : '';
      }
      ins.textContent = s.run ? '' : insight(s.last!);
    },
    dispose() { side.replaceChildren(); },
  };
  let last = '';
  api.setUnit('J');
  return api;
}

function kwhText(k: number): string {
  if (k === 0) return '0';
  if (k < 0.001) return k.toPrecision(2);
  return String(Number(k.toPrecision(3)));
}
