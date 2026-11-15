// The readout dashboard: V, I, R, P, E chips in the fixed quantity colours plus two live formula lines.
import { Q } from '../types';
import type { Dashboard, Quantity, Reading } from '../types';
import { h } from './dom';
import { EMPTY, formatSI, ohmLine, powerLine } from './format';
import type { FormulaLine } from './format';

interface ChipDef { key: 'V' | 'I' | 'R' | 'P' | 'E'; q: Quantity }
const CHIPS: ChipDef[] = [
  { key: 'V', q: 'voltage' }, { key: 'I', q: 'current' }, { key: 'R', q: 'resistance' }, { key: 'P', q: 'power' }, { key: 'E', q: 'energy' },
];
const QCLASS: Record<string, string> = { V: 'q-voltage', I: 'q-current', R: 'q-resistance', P: 'q-power', E: 'q-energy' };
const UNIT_WORDS: Record<Quantity, string> = { current: 'amps', voltage: 'volts', resistance: 'ohms', energy: 'joules', power: 'watts' };

export interface DashboardUI extends Dashboard {
  readonly el: HTMLElement;
}

function formulaHtml(f: FormulaLine): HTMLElement {
  const letters = f.lead.map((l) => h('span', { class: QCLASS[l] }, l));
  return h('div', { class: `lw-formula${f.complete ? ' is-live' : ''}`, 'data-formula': f.lead.join('') },
    letters[0], ' = ', letters[1], ' × ', letters[2],
    h('span', { class: 'lw-formula-arrow', 'aria-hidden': 'true' }, ' → '),
    h('span', { class: 'lw-formula-nums' }, f.nums));
}

export function createDashboard(el: HTMLElement): DashboardUI {
  el.classList.add('lw-dash');
  el.hidden = true;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Readouts');
  const label = h('div', { class: 'lw-dash-label' });
  const vals = new Map<string, HTMLElement>();
  const chipEls = CHIPS.map((c) => {
    const def = Q[c.q];
    const val = h('span', { class: 'lw-chip-val' }, EMPTY);
    vals.set(c.key, val);
    return h('div', { class: `lw-chip ${QCLASS[c.key]}`, tabindex: '0', 'data-q': c.key, title: `${def.name} (${def.symbol}), ${UNIT_WORDS[c.q]}`,'aria-label': `${def.name} (${def.symbol}), measured in ${UNIT_WORDS[c.q]}` },
      h('span', { class: 'lw-chip-sym' }, def.symbol),
      val,
      h('span', { class: 'lw-chip-tip', role: 'tooltip' }, `${def.name} (${def.unit}), ${UNIT_WORDS[c.q]}`));
  });
  const formulas = h('div', { class: 'lw-formulas' });
  const chips = h('div', { class: 'lw-chips' }, chipEls);
  el.append(label, chips, formulas);

  return {
    el,
    show(r: Reading | null) {
      if (!r) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      label.textContent = r.label;
      for (const c of CHIPS) {
        const v = r[c.key];
        vals.get(c.key)!.textContent = v === undefined ? EMPTY : formatSI(v, Q[c.q].unit);
      }
      formulas.replaceChildren(formulaHtml(ohmLine(r)), formulaHtml(powerLine(r)));
    },
  };
}
