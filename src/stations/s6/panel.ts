// Station 6 side panel: Sankey for the selected lamp, the efficiency formula filling in, and a comparison of all three.
import { h } from '../../ui/dom';
import { LAMPS, LAMP_LUMENS, SHORT, efficiencyAnswerOk, lampById, lampEfficiency, mostEfficient, pct1, sankeyFor, watts, type LampId } from './logic';
import { S6_COL, createLampSankey, drawLampSankey } from './sankey';

export interface PanelState {
  selected: LampId;
  /** reveal = show results; ask = the student types the efficiency; hide = checks (no answers on screen) */
  effMode: 'reveal' | 'ask' | 'hide';
  summed: boolean;
  /** lamp ids whose efficiency the student has worked out */
  solved: Set<LampId>;
  showPick: boolean;
  pick: LampId | null;
}

export interface PanelHandlers {
  select(id: LampId): void;
  sum(): void;
  solved(id: LampId): void;
  pick(id: LampId): void;
}

export interface S6Panel {
  el: HTMLElement;
  render(st: PanelState): void;
}

export function createPanel(on: PanelHandlers): S6Panel {
  const title = h('h3', { class: 's6-title' });
  const sub = h('p', { class: 's6-sub' });
  const tabs = h('div', { class: 's6-tabs', role: 'group', 'aria-label': 'Choose a lamp' });
  const tabBtns = new Map<LampId, HTMLButtonElement>();
  for (const l of LAMPS) {
    const b = h('button', { type: 'button', class: 's6-tab', onclick: () => on.select(l.id) }, SHORT[l.id]);
    tabBtns.set(l.id, b); tabs.append(b);
  }
  const svg = createLampSankey();
  const sumBtn = h('button', { type: 'button', class: 'lw-btn lw-btn--sm lw-btn--ghost s6-sumbtn', onclick: () => on.sum() }, 'Add up the outputs');
  const sankeyCard = h('section', { class: 's6-card' }, h('h4', null, 'Where the energy goes'), svg, sumBtn);

  // efficiency formula
  const f2 = h('div', { class: 's6-f-line' });
  const f3 = h('div', { class: 's6-f-line s6-f-result' });
  const input = h('input', { class: 'lw-input s6-effin', type: 'text', inputmode: 'decimal', 'aria-label': 'Efficiency in percent', placeholder: '?' });
  const fb = h('p', { class: 's6-fb', 'aria-live': 'polite' });
  const checkBtn = h('button', { type: 'button', class: 'lw-btn lw-btn--sm' }, 'Check');
  let cur: PanelState | null = null;
  const tryAnswer = () => {
    if (!cur) return;
    const v = Number(String(input.value).replace('%', '').replace(',', '.').trim());
    if (efficiencyAnswerOk(cur.selected, v)) { fb.textContent = ''; on.solved(cur.selected); }
    else {
      const l = lampById(cur.selected);
      fb.textContent = Number.isFinite(v) && v > 0
        ? `Not quite. Divide the useful light (${watts(l.lightW)} W) by the total in (${watts(l.inputW)} W), then multiply by 100.`
        : 'Type a number, for example 12.5';
    }
  };
  checkBtn.addEventListener('click', tryAnswer);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryAnswer(); });
  const askRow = h('div', { class: 's6-ask' }, h('span', null, '='), input, h('span', null, '%'), checkBtn);
  const effCard = h('section', { class: 's6-card' },
    h('h4', null, 'Efficiency'),
    h('div', { class: 's6-f-line s6-f-def' }, 'efficiency = ', h('span', { class: 's6-frac' }, h('span', null, 'useful energy out'), h('span', null, 'total energy in')), ' × 100 %'),
    f2, f3, askRow, fb);

  // comparison: one stacked bar per lamp, same light, different heat
  const bars = h('div', { class: 's6-bars' });
  const compCard = h('section', { class: 's6-card' }, h('h4', null, 'Same light, different input'), bars,
    h('p', { class: 's6-key' },
      h('span', { class: 's6-sw', style: `background:${S6_COL.light}` }), 'light (useful) ',
      h('span', { class: 's6-sw s6-sw-hatch' }), 'heat (wasted)'));

  // most efficient pick
  const pickFb = h('p', { class: 's6-fb', 'aria-live': 'polite' });
  const pickBtns = new Map<LampId, HTMLButtonElement>();
  const pickRow = h('div', { class: 's6-pick' });
  for (const l of LAMPS) {
    const b = h('button', { type: 'button', class: 'lw-btn lw-btn--sm lw-btn--ghost', onclick: () => on.pick(l.id) }, SHORT[l.id]);
    pickBtns.set(l.id, b); pickRow.append(b);
  }
  const pickCard = h('section', { class: 's6-card' }, h('h4', null, 'Which lamp is the most efficient?'), pickRow, pickFb);

  const note = h('p', { class: 's6-note' }, `All three give about ${LAMP_LUMENS} lumens of light. The 4 W of light power is a teaching figure, and all values are approximate.`);
  const el = h('div', { class: 's6-panel' }, h('div', { class: 's6-head' }, title, sub), tabs, sankeyCard, effCard, compCard, pickCard, note);

  return {
    el,
    render(st) {
      cur = st;
      const l = lampById(st.selected);
      title.textContent = l.name;
      sub.textContent = `Input ${watts(l.inputW)} W, light out about ${LAMP_LUMENS} lm`;
      for (const [id, b] of tabBtns) { b.classList.toggle('is-on', id === st.selected); b.setAttribute('aria-pressed', String(id === st.selected)); }
      const hide = st.effMode === 'hide';
      drawLampSankey(svg, sankeyFor(st.selected), { hideHeat: hide, showSum: st.summed });
      sumBtn.hidden = st.summed;
      f2.textContent = `= ${watts(l.lightW)} J ÷ ${watts(l.inputW)} J × 100 %`;
      const known = st.effMode === 'reveal' || (st.effMode === 'ask' && st.solved.has(st.selected));
      f3.textContent = known ? `= ${pct1(lampEfficiency(l))} %` : '';
      f3.hidden = !known;
      askRow.hidden = known || hide;
      if (hide) { f3.hidden = false; f3.textContent = '= ? %'; }
      if (known) fb.textContent = '';
      if (askRow.hidden) input.value = '';
      // bars
      bars.replaceChildren(...LAMPS.map((x) => {
        const total = 100 * x.inputW / 60;
        const lw = 100 * x.lightW / x.inputW;
        const showPct = st.effMode === 'reveal' || st.solved.has(x.id);
        return h('div', { class: `s6-bar${x.id === st.selected ? ' is-on' : ''}` },
          h('span', { class: 's6-bar-name' }, SHORT[x.id]),
          h('span', { class: 's6-bar-track' },
            h('span', { class: 's6-bar-fill', style: `width:${total}%` },
              h('span', { class: 's6-bar-light', style: `width:${lw}%` }),
              h('span', { class: 's6-bar-heat', style: `width:${100 - lw}%` }))),
          h('span', { class: 's6-bar-val' }, `${watts(x.inputW)} W`, h('small', null, showPct ? ` ${pct1(lampEfficiency(x))} %` : hide ? ' ? %' : '')));
      }));
      pickCard.hidden = !st.showPick;
      for (const [id, b] of pickBtns) {
        b.classList.toggle('is-good', st.pick === id && id === mostEfficient());
        b.classList.toggle('is-bad', st.pick === id && id !== mostEfficient());
      }
      if (st.pick === null) pickFb.textContent = '';
      else if (st.pick === mostEfficient()) pickFb.textContent = `Yes. The ${lampById(mostEfficient()).name} turns ${pct1(lampEfficiency(lampById(mostEfficient())))} % of its input into light. The other two waste most of their energy as heat.`;
      else pickFb.textContent = `Not that one. All three give the same light, so the most efficient one is the one that needs the least energy in.`;
    },
  };
}
