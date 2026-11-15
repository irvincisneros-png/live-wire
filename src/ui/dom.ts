// Tiny DOM helpers used by the shell. No framework.
export type Child = Node | string | number | null | undefined | false;
export type Attrs = Record<string, unknown>;

function addKids(el: Node, kids: (Child | Child[])[]): void {
  for (const k of kids) {
    if (Array.isArray(k)) addKids(el, k);
    else if (k === null || k === undefined || k === false) continue;
    else el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
  }
}

function applyAttrs(el: Element, attrs?: Attrs | null): void {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  addKids(el, kids);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: (Child | Child[])[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  addKids(el, kids);
  return el;
}

export function clear(el: Element): void {
  el.replaceChildren();
}

/** star characters for 0..3 */
export function starsText(n: number): string {
  const k = Math.max(0, Math.min(3, Math.round(n)));
  return '★'.repeat(k) + '☆'.repeat(3 - k);
}

export function starsEl(n: number, cls = ''): HTMLElement {
  return h('span', { class: `lw-stars ${cls}`.trim(), role: 'img', 'aria-label': `${n} of 3 stars` }, starsText(n));
}
