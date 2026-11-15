// Job 4: energy audit. Rank the top three users, read two labels, choose upgrades within a budget.
import type { JobHost, JobInstance } from '../../types';
import { EXAMPLE_PRICE_PER_KWH, labelById } from '../../sim/appliances';
import { AUDIT_APPLIANCES, BUDGET, EXPLANATION_OPTIONS, OPTIONS } from '../../sim/audit';
import { fmtMoney } from '../../sim/units';
import '../j345.css';
import { createJ4Scene } from '../desk/j4scene';
import {
  canSubmit, labelOrder, newState, optionBlock, pairFor, perfectState, poorState, rankComplete, revealFor, setRank, toResult, toggleOption,
  type J4State,
} from '../desk/j4logic';
import { evalExpression, trimNum } from '../desk/maths';
import { ratingLabelSvg, labelTypeName } from '../desk/ratingLabel';
import { choiceGroup, createWizard, h, numField, openSheetOnPhones, type NumField, type Wizard } from '../desk/ui';

export function mount(host: JobHost): JobInstance {
  const st: J4State = newState();
  const seed = host.seed;
  const pair = pairFor(seed);
  const view = host.view;
  view.replaceChildren();
  const scene = createJ4Scene(view, host.quality);
  view.appendChild(h('p', { class: 'j4-hint' }, 'Tap an appliance to find it in the table.'));

  let wiz!: Wizard;
  let disposed = false;
  let hlTimer = 0;
  const rows = new Map<string, HTMLElement>();
  const selects: HTMLSelectElement[] = [];
  let labelChoice!: ReturnType<typeof choiceGroup>;
  let labelNum!: NumField;
  let expl!: ReturnType<typeof choiceGroup>;
  const optInputs = new Map<string, HTMLInputElement>();
  const optNotes = new Map<string, HTMLElement>();
  const optRows = new Map<string, HTMLElement>();
  const meterFill = h('div', { class: 'j4-meter-fill' });
  const meterText = h('span', { class: 'j4-meter-text' });
  const meter = h('div', { class: 'j4-meter', role: 'meter', 'aria-label': 'Budget spent', 'aria-valuemin': '0', 'aria-valuemax': String(BUDGET) }, meterFill);
  const revealBox = h('div', { class: 'j4-reveal', 'aria-live': 'polite' });
  const summary = h('div', { class: 'j4-summary' });
  let finishBtn: HTMLButtonElement | null = null;

  // ───── notepad and calculator (moves between steps) ─────
  const calcIn = h('input', { class: 'lw-input j4-calc-in', type: 'text', inputmode: 'text', autocomplete: 'off', 'aria-label': 'Calculator: type a sum', placeholder: 'e.g. 1500 × 4 ÷ 1000' }) as HTMLInputElement;
  const calcOut = h('output', { class: 'j4-calc-out', 'aria-live': 'polite' }, '');
  const doCalc = () => {
    const v = evalExpression(calcIn.value);
    calcOut.textContent = v === undefined ? (calcIn.value.trim() ? 'Cannot read that sum' : '') : `= ${trimNum(v, 4)}`;
  };
  calcIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doCalc(); } });
  const pad = h('details', { class: 'j4-pad' },
    h('summary', null, 'Notepad and calculator'),
    h('div', { class: 'j4-pad-body' },
      h('div', { class: 'j4-calc' }, calcIn, h('button', { class: 'lw-btn lw-btn--sm lw-btn--ghost', type: 'button', onclick: doCalc }, '='), calcOut),
      h('label', { class: 'dk-label', for: 'j4-notes' }, 'Notes (kept only on this page)'),
      h('textarea', { class: 'lw-input j4-notes', id: 'j4-notes', rows: '3', spellcheck: 'false' })));
  const padHosts: HTMLElement[] = [];

  function highlight(id: string | null, scroll = false): void {
    scene.highlight(id);
    for (const [k, el] of rows) el.classList.toggle('is-hl', k === id);
    if (id && scroll) rows.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    window.clearTimeout(hlTimer);
    if (id) hlTimer = window.setTimeout(() => { if (!disposed) highlight(null); }, 6000);
  }
  scene.onPick((id) => { if (wiz.index === 0) highlight(id, true); else highlight(id); });

  // ───── step 1: rank ─────
  const step1 = () => {
    const body = h('tbody', null, AUDIT_APPLIANCES.map((a) => {
      const tr = h('tr', { class: 'j4-row', 'data-id': a.id },
        h('th', { scope: 'row' }, h('button', { class: 'j4-showbtn', type: 'button', 'aria-label': `${a.name}: show it in the room`, onclick: () => highlight(a.id) }, a.name)),
        h('td', { class: 'dk-r' }, String(a.powerW)),
        h('td', { class: 'dk-r' }, trimNum(a.hoursPerDay, 2)));
      tr.addEventListener('pointerenter', () => scene.highlight(a.id));
      tr.addEventListener('pointerleave', () => scene.highlight(null));
      tr.addEventListener('focusin', () => scene.highlight(a.id));
      tr.addEventListener('focusout', () => scene.highlight(null));
      rows.set(a.id, tr);
      return tr;
    }));
    const sels = ['1st', '2nd', '3rd'].map((lab, i) => {
      const sel = h('select', { class: 'lw-input j4-sel', id: `j4-rank-${i}`, 'aria-label': `${lab} biggest energy user over a year` },
        h('option', { value: '' }, 'Choose…'),
        AUDIT_APPLIANCES.map((a) => h('option', { value: a.id }, a.name))) as HTMLSelectElement;
      sel.addEventListener('change', () => {
        st.top3 = setRank(st.top3, i, sel.value || null);
        syncSelects(); wiz.refresh();
      });
      selects.push(sel);
      return h('div', { class: 'dk-field' }, h('label', { class: 'dk-label', for: sel.id }, `${lab} biggest user`), sel);
    });
    const padHost = h('div', { class: 'j4-padhost' }); padHosts[0] = padHost;
    return h('div', { class: 'dk-stepbody' },
      h('p', null, 'Over a whole year, which three appliances use the most energy? Use the power and the hours each day. Tap a name to find it in the room.'),
      h('table', { class: 'dk-table j4-table' },
        h('caption', { class: 'dk-sr' }, 'Household appliances: power in watts and hours per day'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Appliance'), h('th', { scope: 'col', class: 'dk-r' }, 'Power (W)'), h('th', { scope: 'col', class: 'dk-r' }, 'Hours a day'))),
        body),
      padHost,
      h('div', { class: 'j4-ranks' }, sels));
  };
  function syncSelects(): void { selects.forEach((s, i) => { s.value = st.top3[i] ?? ''; }); }

  // ───── step 2: labels ─────
  const step2 = () => {
    const [l1, l2] = labelOrder(seed);
    const names = ['Model A', 'Model B'];
    const labs = [l1, l2].map((id, i) => {
      const lab = labelById(id)!;
      return h('figure', { class: 'j4-fig' }, ratingLabelSvg(lab, names[i]), h('figcaption', null, `${names[i]}: ${lab.sizeLabel} ${labelTypeName(lab.type).toLowerCase()}`));
    });
    labelChoice = choiceGroup({
      name: 'j4-label', legend: 'Which model uses less energy in a year?', options: ['Model A', 'Model B'],
      onChange: (i) => { st.labelPick = [l1, l2][i]; wiz.refresh(); },
    });
    labelNum = numField({ label: 'Money saved a year by choosing the model that uses less', unit: '$', id: 'j4-label-save', onInput: () => { st.labelSavingText = labelNum.input.value; wiz.refresh(); } });
    const padHost = h('div', { class: 'j4-padhost' }); padHosts[1] = padHost;
    return h('div', { class: 'dk-stepbody' },
      h('p', null, `Two ${labelTypeName(pair.type).toLowerCase()} models, both ${pair.sizeLabel}. Read the labels. The example electricity price is ${Math.round(EXAMPLE_PRICE_PER_KWH * 100)} c per kWh.`),
      h('div', { class: 'j4-labels' }, labs),
      labelChoice.el, labelNum.el,
      h('p', { class: 'dk-small' }, 'These two answers are saved on your job sheet but do not change the score for this job.'),
      padHost);
  };

  // ───── step 3: upgrades ─────
  function renderOptions(): void {
    const spent = st.chosen.reduce((s, id) => s + (OPTIONS.find((o) => o.id === id)?.costDollars ?? 0), 0);
    meterFill.style.width = `${Math.min(100, (spent / BUDGET) * 100)}%`;
    meterFill.classList.toggle('is-full', spent >= BUDGET);
    meter.setAttribute('aria-valuenow', String(spent));
    meterText.textContent = `Spent ${fmtMoney(spent)} of ${fmtMoney(BUDGET)}`;
    for (const o of OPTIONS) {
      const inp = optInputs.get(o.id)!;
      const note = optNotes.get(o.id)!;
      const blk = optionBlock(o.id, st.chosen);
      inp.checked = st.chosen.includes(o.id);
      inp.disabled = blk !== null;
      optRows.get(o.id)!.classList.toggle('is-off', blk !== null);
      optRows.get(o.id)!.classList.toggle('is-on', inp.checked);
      const withName = blk && blk.reason === 'conflict' ? OPTIONS.find((x) => x.id === blk.with)?.name : '';
      note.textContent = blk === null ? '' : blk.reason === 'conflict' ? `Cannot combine with "${withName}".` : `Not enough budget left.`;
    }
  }
  const step3 = () => {
    const list = h('div', { class: 'j4-opts', role: 'group', 'aria-label': 'Upgrade options' }, OPTIONS.map((o) => {
      const app = AUDIT_APPLIANCES.find((a) => a.id === o.applianceId)!;
      const inp = h('input', { type: 'checkbox', class: 'j4-check', id: `j4-opt-${o.id}`, onchange: () => {
        st.chosen = toggleOption(st.chosen, o.id);
        renderOptions(); wiz.refresh();
      } }) as HTMLInputElement;
      inp.addEventListener('focus', () => scene.highlight(app.id));
      inp.addEventListener('blur', () => scene.highlight(null));
      const note = h('span', { class: 'j4-opt-note' });
      const row = h('label', { class: 'j4-opt', for: inp.id },
        inp,
        h('span', { class: 'j4-opt-main' }, h('span', { class: 'j4-opt-name' }, o.name), note),
        h('span', { class: 'j4-opt-cost' }, o.costDollars === 0 ? 'Free' : fmtMoney(o.costDollars).replace('.00', '')));
      row.addEventListener('pointerenter', () => scene.highlight(app.id));
      row.addEventListener('pointerleave', () => scene.highlight(null));
      optInputs.set(o.id, inp); optNotes.set(o.id, note); optRows.set(o.id, row);
      return row;
    }));
    const padHost = h('div', { class: 'j4-padhost' }); padHosts[2] = padHost;
    renderOptions();
    return h('div', { class: 'dk-stepbody' },
      h('p', null, `Choose changes to cut the yearly bill. You have ${fmtMoney(BUDGET).replace('.00', '')} to spend. Options that clash, or that you cannot afford, are switched off.`),
      h('div', { class: 'j4-budget' }, meter, meterText), list, padHost);
  };

  // ───── step 4: explanation ─────
  const step4 = () => {
    expl = choiceGroup({ name: 'j4-exp', legend: 'Why does an efficient LED use less energy for the same light?', options: EXPLANATION_OPTIONS, onChange: (i) => { st.explanation = i; wiz.refresh(); } });
    return h('div', { class: 'dk-stepbody' }, expl.el);
  };

  // ───── step 5: submit and reveal ─────
  function doSubmit(): void {
    if (st.submitted || !canSubmit(st)) return;
    st.submitted = true;
    const r = revealFor(st.chosen);
    const before: Record<string, number> = {}, after: Record<string, number> = {};
    for (const row of r.rows) { before[row.id] = row.beforeKWh; after[row.id] = row.afterKWh; }
    scene.reveal(before, after);
    const top = r.rows.slice().sort((a, b) => b.beforeKWh - a.beforeKWh);
    revealBox.replaceChildren(
      h('h4', null, 'Your audit, revealed'),
      h('table', { class: 'dk-table j4-rtable' },
        h('caption', { class: 'dk-sr' }, 'Yearly energy before and after your changes'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Appliance'), h('th', { scope: 'col', class: 'dk-r' }, 'Before (kWh)'), h('th', { scope: 'col', class: 'dk-r' }, 'After (kWh)'))),
        h('tbody', null, top.map((x) => h('tr', { class: x.afterKWh < x.beforeKWh ? 'is-cut' : '' },
          h('th', { scope: 'row' }, x.name), h('td', { class: 'dk-r' }, Math.round(x.beforeKWh).toLocaleString('en-AU')), h('td', { class: 'dk-r' }, Math.round(x.afterKWh).toLocaleString('en-AU')))),
        h('tr', { class: 'j4-total' }, h('th', { scope: 'row' }, 'Whole home'), h('td', { class: 'dk-r' }, Math.round(r.beforeKWh).toLocaleString('en-AU')), h('td', { class: 'dk-r' }, Math.round(r.afterKWh).toLocaleString('en-AU'))))),
      h('ul', { class: 'j4-facts' },
        h('li', null, 'Yearly bill before: ', h('b', null, fmtMoney(r.beforeCost)), ' · after: ', h('b', null, fmtMoney(r.afterCost))),
        h('li', null, 'You spent ', h('b', null, fmtMoney(r.spend)), ' and saved ', h('b', null, fmtMoney(r.saving)), ' a year.'),
        h('li', null, 'The best possible saving within the budget is ', h('b', null, fmtMoney(r.bestSaving)), `. You reached ${Math.round(r.fraction * 100)} % of it.`),
        h('li', { class: 'dk-small' }, `Example price: ${Math.round(EXAMPLE_PRICE_PER_KWH * 100)} c per kWh. The glowing packets show each appliance's yearly energy, then shrink after your changes.`)));
    finishBtn = h('button', { class: 'lw-btn lw-btn--lg', type: 'button', onclick: () => { if (!disposed) host.finish(toResult(st, seed)); } }, 'See my result') as HTMLButtonElement;
    revealBox.appendChild(finishBtn);
    wiz.refresh();
    finishBtn.focus();
  }
  const step5 = () => {
    const sumRows = () => {
      const top = st.top3.map((id) => AUDIT_APPLIANCES.find((a) => a.id === id)?.name ?? '?').join(', ');
      summary.replaceChildren(
        h('p', null, h('b', null, 'Top three: '), top),
        h('p', null, h('b', null, 'Upgrades: '), st.chosen.length ? st.chosen.map((id) => OPTIONS.find((o) => o.id === id)!.name).join('; ') : 'none'));
    };
    sumRows();
    (summary as HTMLElement & { _sum?: () => void })._sum = sumRows;
    return h('div', { class: 'dk-stepbody' },
      h('p', null, 'Check your answers, then submit. After you submit, the yearly energy and cost are revealed and the packet streams in the room show your saving.'),
      summary, revealBox);
  };

  wiz = createWizard(host.panel, {
    kicker: 'Job 4 · Power, Efficiency',
    title: 'Energy audit',
    task: 'Find the biggest energy users in this home, read two Energy Rating labels, and choose upgrades within the budget to cut the yearly bill.',
    submitLabel: 'Submit audit',
    steps: [
      { id: 'rank', title: 'Rank the top three', build: step1, complete: () => rankComplete(st.top3), need: 'Choose a different appliance for 1st, 2nd and 3rd.' },
      { id: 'labels', title: 'Read two labels', build: step2, complete: () => st.labelPick !== null && labelNum.value() !== undefined, need: 'Pick a model and enter the money saved.' },
      { id: 'upgrades', title: 'Choose upgrades', build: step3, complete: () => st.chosen.length > 0, need: 'Tick at least one change.' },
      { id: 'explain', title: 'Explain efficiency', build: step4, complete: () => st.explanation !== null, need: 'Choose one explanation.' },
      { id: 'submit', title: 'Submit and reveal', build: step5, complete: () => st.submitted, need: '' },
    ],
    canSubmit: () => !st.submitted && canSubmit(st),
    onSubmit: doSubmit,
    onStep(i) {
      if (padHosts[i]) padHosts[i].appendChild(pad);
      if (i === 4) (summary as HTMLElement & { _sum?: () => void })._sum?.();
      if (i !== 0) scene.highlight(null);
    },
  });
  openSheetOnPhones(host.panel);
  // the pad sits in the first step at the start
  padHosts[0]?.appendChild(pad);

  // ───── tester handles ─────
  function fill(s: J4State): void {
    st.top3 = s.top3.slice(); syncSelects();
    labelChoice.set(s.labelPick === labelOrder(seed)[0] ? 0 : 1);
    st.labelPick = s.labelPick;
    labelNum.set(s.labelSavingText);
    st.chosen = s.chosen.slice(); renderOptions();
    expl.set(s.explanation);
    wiz.refresh();
    wiz.go(4);
  }
  const click = () => (host.panel.querySelector('[data-role="submit"]') as HTMLButtonElement | null)?.click();
  const api = {
    state: st, scene, wizard: wiz, pair,
    go: (i: number) => wiz.go(i),
    fill(poor = false) { fill(poor ? poorState(seed) : perfectState(seed)); },
    /** fills a perfect run and submits; the reveal shows and "See my result" finishes the job */
    solve(finish = true) { fill(perfectState(seed)); click(); if (finish) finishBtn?.click(); },
    solvePoorly(finish = true) { fill(poorState(seed)); click(); if (finish) finishBtn?.click(); },
  };
  (window as unknown as { __j4?: unknown }).__j4 = api;

  return {
    dispose() {
      disposed = true;
      window.clearTimeout(hlTimer);
      scene.dispose(); wiz.dispose();
      view.replaceChildren(); host.panel.replaceChildren();
      if ((window as unknown as { __j4?: unknown }).__j4 === api) delete (window as unknown as { __j4?: unknown }).__j4;
    },
  };
}
