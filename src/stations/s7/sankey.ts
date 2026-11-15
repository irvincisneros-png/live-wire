// Station 7's own small SVG Sankey: for every 100 J that goes in, how much leaves as electricity and how much is wasted.
// Uses the midpoint of the source's conversion-efficiency range (labelled approximate).
import { s } from '../../ui/dom';
import { FORM_STYLE, flowPer100, formStyle, type GenSource } from './logic';

const W = 340, X0 = 8, XS = 112, XE = 226, Y0 = 30, K = 1.1; // 100 J → 110 px

export function createSourceSankey(): SVGSVGElement {
  return s('svg', { class: 's7-sankey', role: 'img', 'aria-label': 'Energy flow for the selected source, per 100 joules in' });
}

export function drawSourceSankey(svg: SVGSVGElement, src: GenSource): void {
  const f = flowPer100(src);
  const first = formStyle(src.chain[0].form);
  const he = f.electrical * K, hw = f.wasted * K;
  const wTop = Y0 + he + 24;
  const H = wTop + hw + 14;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const band = (x0: number, a0: number, b0: number, x1: number, a1: number, b1: number, fill: string) => {
    const m = (x0 + x1) / 2;
    return s('path', { d: `M${x0},${a0} C${m},${a0} ${m},${a1} ${x1},${a1} L${x1},${b1} C${m},${b1} ${m},${b0} ${x0},${b0} Z`, fill });
  };
  const id = `s7-hatch-${src.id}`;
  svg.append(s('defs', null, s('pattern', { id, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)' },
    s('rect', { width: 7, height: 7, fill: '#7d6a62' }), s('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: 'rgba(0,0,0,.3)', 'stroke-width': 2.4 }))));
  svg.append(s('rect', { x: X0, y: Y0, width: XS - X0, height: 100 * K, fill: first.colour, rx: 2 }));
  svg.append(band(XS, Y0, Y0 + he, XE, Y0, Y0 + he, FORM_STYLE.electrical.colour));
  svg.append(s('path', { d: `M${XE},${Y0 - 3} L${XE + 11},${Y0 + he / 2} L${XE},${Y0 + he + 3} Z`, fill: FORM_STYLE.electrical.colour }));
  svg.append(band(XS, Y0 + he, Y0 + 100 * K, XE, wTop, wTop + hw, `url(#${id})`));
  svg.append(s('path', { d: `M${XE},${wTop - 3} L${XE + 11},${wTop + hw / 2} L${XE},${wTop + hw + 3} Z`, fill: '#7d6a62' }));
  const t = (x: number, y: number, txt: string, cls: string) => s('text', { x, y, class: cls }, txt);
  svg.append(t(X0, Y0 - 16, `${first.label} energy in`, 's7-sk-lbl'));
  svg.append(t(X0, Y0 - 4, '100 J', 's7-sk-num'));
  svg.append(t(XE + 15, Y0 + he / 2 - 2, `about ${Math.round(f.electrical)} J`, 's7-sk-num'));
  svg.append(t(XE + 15, Y0 + he / 2 + 12, 'electrical (useful)', 's7-sk-tag'));
  svg.append(t(XE + 15, wTop + hw / 2 - 2, `about ${100 - Math.round(f.electrical)} J`, 's7-sk-num'));
  svg.append(t(XE + 15, wTop + hw / 2 + 12, 'wasted', 's7-sk-tag'));
}
