// Station 7 side panel: the transformation chain, renewable badge, energy-flow Sankey, the comparison table with a
// "compare by" selector, a renewable sort, and the chain-ordering task area used by the checks.
import { h } from '../../ui/dom';
import {
  MEASURES, OMITTED_NOTE, SHORT, SOURCES, SOURCE_IDS, WASTE_NOTE, chainIds, chainPrefixRight, chipLabel, formStyle, measureByKey, sortedBy,
  sourceById, wrongPlacements, type Bin, type MeasureKey, type SourceId,
} from './logic';
import { createSourceSankey, drawSourceSankey } from './sankey';

export interface S7PanelState {
  source: SourceId;
  compare: MeasureKey;
  placed: Partial<Record<SourceId, Bin>>;
  showSort: boolean;
  /** chain-ordering task: the source being ordered and the order tapped so far (null = hidden) */
  order: { source: SourceId; pool: string[]; picked: string[] } | null;
}

export interface S7PanelHandlers {
  source(id: SourceId): void;
  compare(k: MeasureKey): void;
  place(id: SourceId, bin: Bin): void;
  pickChip(chipId: string): void;
  clearOrder(): void;
}

export function createPanel(on: S7PanelHandlers): { el: HTMLElement; render(st: S7PanelState): void } {
  // chain-ordering task area (top of the panel when active)
  const orderBox = h('section', { class: 's7-card s7-order', hidden: true });

  const title = h('h3', { class: 's7-title' });
  const badge = h('span', { class: 's7-badge' });
  const tabs = h('div', { class: 's7-tabs', role: 'group', 'aria-label': 'Choose a source' });
  const tabBtns = new Map<SourceId, HTMLButtonElement>();
  for (const id of SOURCE_IDS) { const b = h('button', { type: 'button', class: 's7-tab', onclick: () => on.source(id) }, SHORT[id]); tabBtns.set(id, b); tabs.append(b); }
  const chain = h('ol', { class: 's7-chain', 'aria-label': 'Energy transformation chain' });
  const sk = createSourceSankey();
  const wasteNote = h('p', { class: 's7-note' });
  const chainCard = h('section', { class: 's7-card' }, h('h4', null, 'Energy chain'), chain,
    h('h4', { class: 's7-sub' }, 'For every 100 J in (approximate)'), sk, wasteNote);

  // compare
  const sel = h('select', { class: 'lw-select s7-select', 'aria-label': 'Compare by' }) as HTMLSelectElement;
  for (const m of MEASURES) sel.append(h('option', { value: m.key }, m.label));
  sel.addEventListener('change', () => on.compare(sel.value as MeasureKey));
  const def = h('p', { class: 's7-def' });
  const ranked = h('ol', { class: 's7-ranked' });
  const table = h('table', { class: 's7-table' });
  const compareCard = h('section', { class: 's7-card' },
    h('h4', null, 'Compare the five'),
    h('label', { class: 's7-cmp' }, h('span', null, 'Compare by'), sel), def, ranked,
    h('details', { class: 's7-details' }, h('summary', null, 'Full table'), h('div', { class: 's7-tablewrap' }, table)),
    h('details', { class: 's7-details' }, h('summary', null, 'Efficiency or capacity factor?'),
      h('p', null, h('b', null, 'Conversion efficiency'), ' is how much of the energy going in comes out as electricity. A coal plant turns about a third of the coal\'s energy into electricity.'),
      h('p', null, h('b', null, 'Capacity factor'), ' is how much electricity a plant makes over a year, compared with running flat out all year. A solar farm can be efficient enough and still have a low capacity factor, because the sun sets.')));

  // renewable sort
  const sortRows = h('div', { class: 's7-sort' });
  const sortFb = h('p', { class: 's7-fb', 'aria-live': 'polite' });
  const sortCard = h('section', { class: 's7-card' }, h('h4', null, 'Sort the sources'), h('p', { class: 's7-note' }, 'Renewable sources are replaced naturally and will not run out. Tap one box for each source.'), sortRows, sortFb);

  const foot = h('p', { class: 's7-note' }, 'All figures are typical, rounded and approximate. Cost is for new plants, before the cost of storage or backup. ', OMITTED_NOTE);
  const el = h('div', { class: 's7-panel' }, orderBox, h('div', { class: 's7-head' }, title, badge), tabs, chainCard, compareCard, sortCard, foot);

  return {
    el,
    render(st) {
      const src = sourceById(st.source);
      title.textContent = src.name;
      badge.textContent = src.renewable ? 'Renewable' : 'Non-renewable';
      badge.className = `s7-badge ${src.renewable ? 'is-ren' : 'is-non'}`;
      for (const [id, b] of tabBtns) { b.classList.toggle('is-on', id === st.source); b.setAttribute('aria-pressed', String(id === st.source)); }
      chain.replaceChildren(...src.chain.map((c, i) => {
        const fs = formStyle(c.form);
        return h('li', { class: 's7-step', style: `--c:${fs.colour}` },
          h('span', { class: 's7-step-form' }, fs.label), h('span', { class: 's7-step-dev' }, c.device),
          i < src.chain.length - 1 ? h('span', { class: 's7-arrow', 'aria-hidden': 'true' }, '→') : null);
      }));
      // while the student orders the chain, the answer strip is hidden
      chainCard.hidden = !!st.order;
      drawSourceSankey(sk, src);
      wasteNote.textContent = `Wasted: ${WASTE_NOTE[src.id]}.`;

      // compare
      const m = measureByKey(st.compare);
      sel.value = st.compare;
      def.textContent = m.def;
      const list = sortedBy(st.compare);
      const max = Math.max(...SOURCES.map((x) => m.value(x)), 1e-9);
      ranked.replaceChildren(...list.map((x) => h('li', { class: `s7-row${x.id === st.source ? ' is-on' : ''}` },
        h('div', { class: 's7-row-top' },
          h('b', null, x.name),
          h('span', { class: `s7-mini ${x.renewable ? 'is-ren' : 'is-non'}` }, x.renewable ? 'R' : 'NR'),
          h('span', { class: 's7-row-val' }, m.text(x))),
        h('div', { class: 's7-row-bar' }, h('span', { style: `width:${Math.max(3, (100 * m.value(x)) / max)}%` })),
        h('div', { class: 's7-pro' }, h('span', { 'aria-hidden': 'true' }, '+ '), x.advantage),
        h('div', { class: 's7-con' }, h('span', { 'aria-hidden': 'true' }, '− '), x.disadvantage))));
      ranked.setAttribute('aria-label', `Sources ranked by ${m.label}, ${m.best === 'high' ? 'highest' : 'lowest'} first`);
      // full table
      const head = h('tr', null, h('th', { scope: 'col' }, 'Source'), MEASURES.map((mm) => h('th', { scope: 'col' },
        h('button', { type: 'button', class: `s7-th${mm.key === st.compare ? ' is-on' : ''}`, title: mm.def, onclick: () => on.compare(mm.key) }, mm.label))));
      table.replaceChildren(h('thead', null, head), h('tbody', null, list.map((x) => h('tr', null, h('th', { scope: 'row' }, x.name), MEASURES.map((mm) => h('td', { class: mm.key === st.compare ? 'is-on' : '' }, mm.text(x)))))));

      // renewable sort
      sortCard.hidden = !st.showSort;
      const wrong = new Set(wrongPlacements(st.placed));
      sortRows.replaceChildren(...SOURCE_IDS.map((id) => {
        const b = (bin: Bin, label: string) => h('button', {
          type: 'button', class: `s7-bin${st.placed[id] === bin ? ' is-on' : ''}${st.placed[id] === bin && wrong.has(id) ? ' is-bad' : ''}`,
          'aria-pressed': String(st.placed[id] === bin), onclick: () => on.place(id, bin),
        }, label);
        return h('div', { class: 's7-sortrow' }, h('span', null, sourceById(id).name), b('renewable', 'Renewable'), b('non-renewable', 'Non-renewable'));
      }));
      const n = SOURCE_IDS.filter((id) => st.placed[id]).length;
      sortFb.textContent = wrong.size ? `Check ${[...wrong].map((id) => SHORT[id]).join(' and ')}: will its energy source run out?`
        : n === SOURCE_IDS.length ? 'All sorted. Coal and gas are fuels that took millions of years to form, so they will run out.' : '';

      // ordering task
      orderBox.hidden = !st.order;
      if (st.order) {
        const o = st.order, s2 = sourceById(o.source);
        const steps = new Map(chainIds(s2).map((cid, i) => [cid, s2.chain[i]]));
        const right = chainPrefixRight(o.picked, s2);
        orderBox.replaceChildren(
          h('h4', null, `Order the energy chain for ${s2.name.toLowerCase()}`),
          h('p', { class: 's7-note' }, 'Tap the steps from the energy store to electricity.'),
          h('ol', { class: 's7-picked' }, o.picked.map((cid, i) => {
            const c = steps.get(cid)!;
            return h('li', { class: `${i < right ? 'is-good' : 'is-bad'}`, style: `--c:${formStyle(c.form).colour}` }, chipLabel(c));
          })),
          h('div', { class: 's7-pool' }, o.pool.filter((cid) => !o.picked.includes(cid)).map((cid) => {
            const c = steps.get(cid)!;
            return h('button', { type: 'button', class: 's7-chip', style: `--c:${formStyle(c.form).colour}`, onclick: () => on.pickChip(cid) }, chipLabel(c));
          })),
          h('button', { type: 'button', class: 'lw-btn lw-btn--sm lw-btn--ghost', onclick: () => on.clearOrder() }, 'Start again'),
        );
      }
    },
  };
}
