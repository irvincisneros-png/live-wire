// A teaching illustration of an appliance Energy Rating label, drawn in SVG. No logos or government marks.
import type { EnergyLabel, LabelType } from '../../sim/appliances';
import { s } from '../../ui/dom';

const TYPE_NAME: Record<LabelType, string> = { fridge: 'Fridge', tv: 'Television', 'washing-machine': 'Washing machine' };
export const labelTypeName = (t: LabelType) => TYPE_NAME[t];

let uid = 0;

function starPath(cx: number, cy: number, R: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? R : R * 0.42;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** Draw one label. `name` is a neutral title such as "Model A". */
export function ratingLabelSvg(label: EnergyLabel, name: string): SVGSVGElement {
  const id = `rl${++uid}`;
  const stars = [] as SVGElement[];
  const defs = s('defs');
  const x0 = 24, step = 25.5, cy = 118;
  for (let i = 0; i < 6; i++) {
    const cx = x0 + i * step + 12;
    const fill = Math.max(0, Math.min(1, label.stars - i));
    stars.push(s('path', { d: starPath(cx, cy, 12.5), fill: 'none', stroke: '#d9a52b', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
    if (fill > 0) {
      const clip = s('clipPath', { id: `${id}-c${i}` }, s('rect', { x: cx - 13, y: cy - 14, width: 26 * fill, height: 28 }));
      defs.appendChild(clip);
      stars.push(s('path', { d: starPath(cx, cy, 12.5), fill: '#f4c542', 'clip-path': `url(#${id}-c${i})` }));
    }
  }
  const aria = `${name}: ${TYPE_NAME[label.type]}, size ${label.sizeLabel}, ${label.stars} stars out of 6, ${label.kWhPerYear} kilowatt hours per year.`;
  return s('svg', { viewBox: '0 0 200 300', class: 'j4-label', role: 'img', 'aria-label': aria },
    defs,
    s('rect', { x: 3, y: 3, width: 194, height: 294, rx: 12, fill: '#fbfaf5', stroke: '#14201a', 'stroke-width': 4 }),
    s('path', { d: 'M 15 3 H 185 A 12 12 0 0 1 197 15 V 44 H 3 V 15 A 12 12 0 0 1 15 3 Z', fill: '#14614a' }),
    s('text', { x: 100, y: 25, 'text-anchor': 'middle', class: 'j4-l-head' }, 'ENERGY RATING'),
    s('text', { x: 100, y: 38, 'text-anchor': 'middle', class: 'j4-l-sub' }, 'teaching example'),
    s('text', { x: 100, y: 68, 'text-anchor': 'middle', class: 'j4-l-name' }, name),
    s('text', { x: 100, y: 86, 'text-anchor': 'middle', class: 'j4-l-type' }, TYPE_NAME[label.type]),
    s('rect', { x: 12, y: 94, width: 176, height: 48, rx: 8, fill: '#1c2a24' }),
    stars,
    s('text', { x: 100, y: 160, 'text-anchor': 'middle', class: 'j4-l-small' }, 'More stars = more efficient'),
    s('rect', { x: 14, y: 170, width: 172, height: 76, rx: 8, fill: '#fff', stroke: '#14201a', 'stroke-width': 2 }),
    s('text', { x: 100, y: 188, 'text-anchor': 'middle', class: 'j4-l-small' }, 'Energy use'),
    s('text', { x: 100, y: 226, 'text-anchor': 'middle', class: 'j4-l-big' }, String(label.kWhPerYear)),
    s('text', { x: 100, y: 240, 'text-anchor': 'middle', class: 'j4-l-small' }, 'kWh per year'),
    s('text', { x: 100, y: 262, 'text-anchor': 'middle', class: 'j4-l-size' }, `Size: ${label.sizeLabel}`),
    s('text', { x: 100, y: 281, 'text-anchor': 'middle', class: 'j4-l-fine' }, 'Compare the same type and size only.'));
}
