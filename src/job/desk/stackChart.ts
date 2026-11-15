// Job 5: live hourly stacked chart (SVG). Above the axis: where the house's energy came from. Below: where spare solar went.
import type { SolarResult } from '../../sim/solar';
import { h, s } from '../../ui/dom';

export const SERIES = [
  { key: 'selfUsed', label: 'Solar used at home', colour: '#f0b429' },
  { key: 'fromBattery', label: 'Battery to house', colour: '#2fd6b4' },
  { key: 'imported', label: 'Grid import', colour: '#5ea8ff' },
  { key: 'toBattery', label: 'Solar into battery', colour: '#9be564' },
  { key: 'exported', label: 'Solar exported', colour: '#b58cff' },
] as const;

export interface StackChart {
  el: HTMLElement;
  /** draw hours 0 .. floor(upTo) of `r`; `upTo` 24 draws all; r null clears */
  update(r: SolarResult | null, upTo: number): void;
}

const W = 340, H = 190, L = 30, R = 8, T = 10, B = 24;

export function createStackChart(): StackChart {
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'j5-chart', role: 'img', 'aria-label': 'Hourly energy chart for the simulated day' });
  const bars = s('g'), grid = s('g'), cursor = s('line', { class: 'j5-c-cursor', y1: T, y2: H - B });
  const pvLine = s('polyline', { class: 'j5-c-pv', fill: 'none' });
  svg.append(grid, bars, pvLine, cursor);
  const legend = h('ul', { class: 'j5-legend' }, SERIES.map((x) => h('li', null, h('span', { class: 'j5-sw', style: `background:${x.colour}` }), x.label)));
  legend.appendChild(h('li', null, h('span', { class: 'j5-sw j5-sw--line' }), 'Solar made (line)'));
  const caption = h('p', { class: 'j5-c-cap' }, 'Above the line: where the house got its energy. Below the line: where spare solar went. Each bar is one hour, in kWh.');
  const el = h('figure', { class: 'j5-chartwrap' }, svg, caption, legend);

  function drawGrid(top: number, bottom: number, yOf: (v: number) => number): void {
    grid.replaceChildren();
    const xAt = (hr: number) => L + ((W - L - R) * hr) / 24;
    const step = top <= 4 ? 1 : top <= 8 ? 2 : 4;
    for (let v = Math.ceil(bottom); v <= top; v += step) {
      grid.appendChild(s('line', { x1: L, x2: W - R, y1: yOf(v), y2: yOf(v), class: v === 0 ? 'j5-c-axis' : 'j5-c-grid' }));
      grid.appendChild(s('text', { x: L - 4, y: yOf(v) + 3, 'text-anchor': 'end', class: 'j5-c-t' }, String(v)));
    }
    for (const hr of [0, 6, 12, 18, 24]) {
      grid.appendChild(s('text', { x: xAt(hr), y: H - 8, 'text-anchor': hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle', class: 'j5-c-t' }, hr === 0 ? '12 am' : hr === 12 ? 'noon' : hr === 24 ? '12 am' : `${hr % 12} ${hr < 12 ? 'am' : 'pm'}`));
    }
    grid.appendChild(s('text', { x: 2, y: T + 2, class: 'j5-c-u' }, 'kWh'));
  }

  return {
    el,
    update(r, upTo) {
      bars.replaceChildren();
      if (!r) {
        drawGrid(3, -1, (v) => T + ((3 - v) / 4) * (H - T - B));
        pvLine.setAttribute('points', ''); cursor.setAttribute('x1', String(L)); cursor.setAttribute('x2', String(L));
        el.dataset.ready = 'false';
        return;
      }
      el.dataset.ready = 'true';
      const hr = r.hourly;
      const topV = Math.max(...hr.load, ...hr.pv, 0.5);
      const botV = Math.max(...hr.toBattery.map((x, i) => x + hr.exported[i]), 0);
      const top = Math.max(3, Math.ceil(topV)), bottom = botV > 0.05 ? -Math.max(1, Math.ceil(botV)) : -1;
      const yOf = (v: number) => T + ((top - v) / (top - bottom)) * (H - T - B);
      drawGrid(top, bottom, yOf);
      const slot = (W - L - R) / 24, bw = slot * 0.78;
      const last = Math.min(23, Math.floor(upTo - 1e-9));
      const pts: string[] = [];
      for (let i = 0; i <= last; i++) {
        const x = L + slot * i + (slot - bw) / 2;
        let up = 0;
        for (const k of ['selfUsed', 'fromBattery', 'imported'] as const) {
          const v = hr[k][i]; if (v <= 0.0005) continue;
          const col = SERIES.find((q) => q.key === k)!.colour;
          bars.appendChild(s('rect', { x, width: bw, y: yOf(up + v), height: Math.max(0.5, yOf(up) - yOf(up + v)), fill: col }));
          up += v;
        }
        let dn = 0;
        for (const k of ['toBattery', 'exported'] as const) {
          const v = hr[k][i]; if (v <= 0.0005) continue;
          const col = SERIES.find((q) => q.key === k)!.colour;
          bars.appendChild(s('rect', { x, width: bw, y: yOf(-dn), height: Math.max(0.5, yOf(-dn - v) - yOf(-dn)), fill: col }));
          dn += v;
        }
        pts.push(`${(x + bw / 2).toFixed(1)},${yOf(hr.pv[i]).toFixed(1)}`);
      }
      pvLine.setAttribute('points', pts.join(' '));
      const cx = L + slot * Math.min(24, upTo);
      cursor.setAttribute('x1', String(cx)); cursor.setAttribute('x2', String(cx));
    },
  };
}
