// A teaching illustration in the style of an Australian appliance energy label: an arched star band,
// stars filled to the rating, the yearly energy box and the type/size line. Not an official mark.
import type { EnergyLabel } from '../../sim/appliances';
import { typeWord } from './tasks';

const TYPE_TITLE: Record<EnergyLabel['type'], string> = { fridge: 'Refrigerator', tv: 'Television', 'washing-machine': 'Washing machine' };

function starPath(cx: number, cy: number, R: number, r: number, rot: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)}`;
  }
  return d + 'Z';
}

let uid = 0;
/** SVG markup for one label. `tag` is a short model name shown under the label (e.g. "Model A"). */
export function labelSvg(l: EnergyLabel, tag: string): string {
  const id = `s5l${++uid}`;
  const W = 200, H = 268, cx = 100, cy = 128, R0 = 66, R1 = 96;
  const a0 = Math.PI * 1.08, a1 = Math.PI * 1.92; // arch from lower-left to lower-right over the top
  const pt = (r: number, a: number) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  const band = `M${pt(R1, a0)} A${R1} ${R1} 0 0 1 ${pt(R1, a1)} L${pt(R0, a1)} A${R0} ${R0} 0 0 0 ${pt(R0, a0)} Z`;
  let stars = '';
  for (let i = 0; i < 6; i++) {
    const a = a0 + ((i + 0.5) / 6) * (a1 - a0);
    const sx = cx + Math.cos(a) * ((R0 + R1) / 2), sy = cy + Math.sin(a) * ((R0 + R1) / 2);
    const d = starPath(sx, sy, 12.5, 5.2, a + Math.PI / 2);
    const fill = Math.max(0, Math.min(1, l.stars - i));
    stars += `<path d="${d}" fill="#fff6dc" stroke="#9c2b1f" stroke-width="1.2"/>`;
    if (fill > 0) {
      const cid = `${id}c${i}`;
      stars += `<clipPath id="${cid}"><rect x="${(sx - 14).toFixed(2)}" y="${(sy - 14).toFixed(2)}" width="${(28 * fill).toFixed(2)}" height="28" transform="rotate(${((a + Math.PI / 2) * 180 / Math.PI).toFixed(1)} ${sx.toFixed(2)} ${sy.toFixed(2)})"/></clipPath>`;
      stars += `<path d="${d}" fill="#c8321f" clip-path="url(#${cid})"/>`;
    }
  }
  const starsTxt = Number.isInteger(l.stars) ? String(l.stars) : l.stars.toFixed(1);
  return `<svg class="s5-label-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tag}: ${typeWord(l.type)}, ${l.sizeLabel}, ${starsTxt} stars, ${l.kWhPerYear} kilowatt-hours per year">
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="12" fill="#fffdf6" stroke="#2a2a2a" stroke-width="2.5"/>
  <rect x="1.5" y="1.5" width="${W - 3}" height="26" rx="12" fill="#2a2a2a"/><rect x="1.5" y="16" width="${W - 3}" height="12" fill="#2a2a2a"/>
  <text x="12" y="19" font-size="11" font-weight="800" fill="#fffdf6" letter-spacing="1">STAR RATING</text>
  <rect x="104" y="7" width="88" height="15" rx="7.5" fill="#56B4E9"/><text x="148" y="17.6" text-anchor="middle" font-size="7.6" font-weight="800" fill="#0b1520" letter-spacing=".4">TEACHING EXAMPLE</text>
  <path d="${band}" fill="#f7c948" stroke="#9c6a12" stroke-width="1.2"/>
  ${stars}
  <text x="${cx}" y="${cy - 26}" text-anchor="middle" font-size="30" font-weight="900" fill="#2a2a2a">${starsTxt}</text>
  <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#2a2a2a">STARS</text>
  <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="7.6" fill="#444">more stars = more efficient</text>
  <rect x="18" y="146" width="${W - 36}" height="70" rx="8" fill="#ffffff" stroke="#2a2a2a" stroke-width="1.6"/>
  <text x="${cx}" y="162" text-anchor="middle" font-size="9" font-weight="700" fill="#2a2a2a">ENERGY CONSUMPTION</text>
  <text x="${cx}" y="192" text-anchor="middle" font-size="28" font-weight="900" fill="#2a2a2a">${l.kWhPerYear}</text>
  <text x="${cx}" y="208" text-anchor="middle" font-size="9" font-weight="700" fill="#2a2a2a">kWh per year</text>
  <text x="${cx}" y="232" text-anchor="middle" font-size="10.5" font-weight="800" fill="#2a2a2a">${TYPE_TITLE[l.type]} · ${l.sizeLabel}</text>
  <text x="${cx}" y="246" text-anchor="middle" font-size="7.2" fill="#555">Compared with models of a similar size.</text>
  <text x="${cx}" y="257" text-anchor="middle" font-size="7.2" fill="#555">Figure from a standard test.</text>
</svg>`;
}
