// Station 6's own small SVG Sankey: electrical energy in splits into light (useful) and heat (wasted).
// Band widths are drawn to one fixed scale for every lamp, so the light band is the same width for all three.
import { s } from '../../ui/dom';
import type { SankeyData } from './logic';
import { watts } from './logic';

export const S6_COL = { input: '#6fb6ff', light: '#ffe27a', heat: '#ff6a3d' };

const VB_W = 340, X0 = 8, XSPLIT = 118, XEND = 236, Y0 = 34;
/** px per watt (60 W is the widest band) */
const K = 2.0;

export interface SankeyOpts {
  /** hide the heat watts (checks: the student works them out) */
  hideHeat?: boolean;
  /** show the "light + heat = input" line with a tick */
  showSum?: boolean;
}

export function drawLampSankey(svg: SVGSVGElement, d: SankeyData, o: SankeyOpts = {}): void {
  const light = d.outputs.find((x) => x.useful)!, heat = d.outputs.find((x) => !x.useful)!;
  const hin = d.inputW * K, hl = Math.max(2, light.watts * K), hh = Math.max(2, heat.watts * K);
  const yl0 = Y0, yh0 = Y0 + hl; // split points on the input band
  const heatTop = Y0 + hl + 30; // where the heat band lands on the right
  const H = Math.max(heatTop + hh + 44, 150);
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H}`);
  svg.replaceChildren();
  const defs = s('defs', null,
    s('pattern', { id: 's6-hatch', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)' },
      s('rect', { width: 7, height: 7, fill: S6_COL.heat }),
      s('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: 'rgba(60,10,0,.35)', 'stroke-width': 2.4 })),
  );
  svg.append(defs);
  const band = (x0: number, y0a: number, y0b: number, x1: number, y1a: number, y1b: number, fill: string) => {
    const mx = (x0 + x1) / 2;
    return s('path', {
      d: `M${x0},${y0a} C${mx},${y0a} ${mx},${y1a} ${x1},${y1a} L${x1},${y1b} C${mx},${y1b} ${mx},${y0b} ${x0},${y0b} Z`,
      fill,
    });
  };
  // input band
  svg.append(s('rect', { x: X0, y: Y0, width: XSPLIT - X0, height: hin, fill: S6_COL.input, rx: 2 }));
  // light: straight on
  svg.append(band(XSPLIT, yl0, yl0 + hl, XEND, yl0, yl0 + hl, S6_COL.light));
  svg.append(s('path', { d: `M${XEND},${yl0 - 3} L${XEND + 12},${yl0 + hl / 2} L${XEND},${yl0 + hl + 3} Z`, fill: S6_COL.light }));
  // heat: bends down and away
  svg.append(band(XSPLIT, yh0, yh0 + hh, XEND, heatTop, heatTop + hh, 'url(#s6-hatch)'));
  svg.append(s('path', { d: `M${XEND},${heatTop - 3} L${XEND + 12},${heatTop + hh / 2} L${XEND},${heatTop + hh + 3} Z`, fill: S6_COL.heat }));
  // labels
  const txt = (x: number, y: number, t: string, cls: string, anchor = 'start') => s('text', { x, y, class: cls, 'text-anchor': anchor }, t);
  svg.append(txt(X0, Y0 - 18, 'Electrical energy in', 's6-sk-lbl'));
  svg.append(txt(X0, Y0 - 5, `${watts(d.inputW)} J each second (${watts(d.inputW)} W)`, 's6-sk-num'));
  const ly = Math.min(yl0 + hl / 2 + 4, heatTop - 24);
  svg.append(txt(XEND + 16, ly - 6, `Light ${watts(light.watts)} W`, 's6-sk-num'));
  svg.append(txt(XEND + 16, ly + 8, 'useful', 's6-sk-tag'));
  const hy = Math.max(heatTop + hh / 2 + 4, ly + 30);
  svg.append(txt(XEND + 16, hy - 6, `Heat ${o.hideHeat ? '?' : watts(heat.watts)} W`, 's6-sk-num'));
  svg.append(txt(XEND + 16, hy + 8, 'wasted', 's6-sk-tag'));
  // the conservation line
  const sy = H - 12;
  svg.append(s('line', { x1: X0, y1: sy - 18, x2: VB_W - 8, y2: sy - 18, stroke: 'var(--lw-line)', 'stroke-width': 1 }));
  if (o.showSum) {
    const heatTxt = o.hideHeat ? '?' : watts(heat.watts);
    svg.append(txt(X0, sy, `Light ${watts(light.watts)} + Heat ${heatTxt} = ${watts(d.inputW)} J/s in${o.hideHeat ? '' : '  ✓'}`, 's6-sk-sum'));
  } else {
    svg.append(txt(X0, sy, 'Light + Heat = ?', 's6-sk-sum s6-sk-dim'));
  }
}

export function createLampSankey(): SVGSVGElement {
  return s('svg', { class: 's6-sankey', role: 'img', 'aria-label': 'Energy flow diagram for the selected lamp' });
}
