// Shared, cached PBR materials. Everything returned by a cached getter is flagged userData.shared = true,
// so kit.disposeTree() leaves it alone. Helpers that make per-object resources (labelTexture, createLcd) do not.
import * as THREE from 'three';
import type { QualityTier } from '../types';
import { brushedRoughness, canvas, knurlBump, speckle, stripeTexture, woodMaps } from './textures';

const cache = new Map<string, THREE.Material>();
function get<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) { m = make(); m.userData.shared = true; cache.set(key, m); }
  return m;
}

export const brass = () => get('brass', () => new THREE.MeshStandardMaterial({ color: 0xd6b267, metalness: 1, roughness: 0.36, roughnessMap: brushedRoughness() }));
export const brassKnurl = () => get('brassKnurl', () => new THREE.MeshStandardMaterial({ color: 0xd2ab5c, metalness: 1, roughness: 0.5, bumpMap: knurlBump(), bumpScale: 1.2 }));
export const brassDark = () => get('brassDark', () => new THREE.MeshStandardMaterial({ color: 0xa47f3c, metalness: 1, roughness: 0.42 }));
export const steel = () => get('steel', () => new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 1, roughness: 0.34, roughnessMap: brushedRoughness() }));
export const darkSteel = () => get('darkSteel', () => new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.9, roughness: 0.45 }));
export const nickel = () => get('nickel', () => new THREE.MeshStandardMaterial({ color: 0xe4e2dc, metalness: 1, roughness: 0.18 }));
export const copper = () => get('copper', () => new THREE.MeshStandardMaterial({ color: 0xe08a5a, metalness: 1, roughness: 0.3 }));
export const tungsten = () => get('tungsten', () => new THREE.MeshStandardMaterial({ color: 0x8a8580, metalness: 1, roughness: 0.4 }));

export function timber(variant: 'bench' | 'dark' = 'bench', repeatX = 1, repeatY = 1): THREE.MeshStandardMaterial {
  return get(`timber-${variant}-${repeatX}-${repeatY}`, () => {
    const w = woodMaps(variant);
    // clone textures only to change repeat; clones share the image so they are cheap, and they are flagged shared
    const rep = (t: THREE.Texture) => { if (repeatX === 1 && repeatY === 1) return t; const c = t.clone(); c.repeat.set(repeatX, repeatY); c.userData.shared = true; return c; };
    return new THREE.MeshStandardMaterial({ map: rep(w.map), normalMap: rep(w.normalMap), roughnessMap: rep(w.roughnessMap), roughness: 0.85, normalScale: new THREE.Vector2(0.5, 0.5), metalness: 0 });
  });
}

export type InsulationColour = 'red' | 'black' | 'greenYellow' | 'blue' | 'yellow' | 'white';
const INS: Record<Exclude<InsulationColour, 'greenYellow'>, number> = { red: 0xc0251c, black: 0x1d1e21, blue: 0x1e5bb8, yellow: 0xe2b21a, white: 0xe9e6de };

export function insulation(c: InsulationColour): THREE.MeshPhysicalMaterial {
  return get('ins-' + c, () => {
    const m = new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.2, sheenRoughness: 0.6 });
    if (c === 'greenYellow') { m.map = stripeTexture('#1f8a3a', '#e7cc24'); m.map.repeat.set(16, 1); }
    else m.color.setHex(INS[c]);
    return m;
  });
}
/** translucent glowing insulation used while x-ray is on */
export function insulationXray(c: InsulationColour): THREE.MeshStandardMaterial {
  return get('insx-' + c, () => {
    const base = c === 'greenYellow' ? 0x7fae3a : INS[c];
    const col = new THREE.Color(base).lerp(new THREE.Color(0x9fc8ff), 0.35);
    return new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.22, roughness: 0.3, depthWrite: false, emissive: col, emissiveIntensity: 0.12 });
  });
}

export function rubber(colour = 0x18191b): THREE.MeshStandardMaterial {
  return get('rubber-' + colour, () => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85, metalness: 0, roughnessMap: speckle() }));
}

/** bakelite / ABS moulded plastic */
export function plastic(colour = 0x2a1d16, roughness = 0.38): THREE.MeshPhysicalMaterial {
  return get(`plastic-${colour}-${roughness}`, () => new THREE.MeshPhysicalMaterial({ color: colour, roughness, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4, roughnessMap: speckle() }));
}

export const ceramic = () => get('ceramic', () => new THREE.MeshPhysicalMaterial({ color: 0xf1ede2, roughness: 0.22, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12 }));
/** matte unglazed ceramic (power-resistor body) */
export const ceramicMatte = () => get('ceramicMatte', () => new THREE.MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.82, metalness: 0, roughnessMap: speckle() }));
/** black lacquer / dark phenolic for panels */
export const phenolic = () => get('phenolic', () => new THREE.MeshPhysicalMaterial({ color: 0x23201d, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.5, roughnessMap: speckle() }));

/** glass: real transmission on high, a cheap fresnel-ish transparent shell on low/medium */
export function glass(q: QualityTier): THREE.Material {
  if (q === 'high') return get('glass-high', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.04, ior: 1.5, transparent: true, opacity: 1, envMapIntensity: 1.3, specularIntensity: 1, depthWrite: false }));
  return get('glass-' + q, () => new THREE.MeshPhysicalMaterial({ color: 0xf4f8ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, side: THREE.FrontSide }));
}
/** additive fresnel rim so glass edges read on every tier (layer it over a glass mesh) */
export function glassRim(): THREE.ShaderMaterial {
  return get('glassRim', () => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0.75, 0.85, 1.0) }, uPow: { value: 2.6 }, uK: { value: 0.55 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPow; uniform float uK; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow); gl_FragColor = vec4(uColor * f * uK, f);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

/** smoked, blackened glass for a blown globe (per quality) */
export function glassSmoked(q: QualityTier): THREE.Material {
  return get('glassSmoked-' + q, () => new THREE.MeshPhysicalMaterial({ color: 0x5a5048, metalness: 0, roughness: 0.25, transparent: true, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.1, depthWrite: false }));
}

export const paper = () => get('paper', () => new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.9, metalness: 0 }));

// ───────────── labels ─────────────

export interface LabelOpts {
  width?: number; height?: number; bg?: string; fg?: string; font?: string; size?: number; border?: string; align?: CanvasTextAlign;
}
/** paper / printed label texture (NOT shared: the caller owns it) */
export function labelTexture(text: string | string[], o: LabelOpts = {}): THREE.CanvasTexture {
  const W = o.width ?? 256, H = o.height ?? 128;
  const [c, ctx] = canvas(W, H);
  if (o.bg !== 'transparent') { ctx.fillStyle = o.bg ?? '#f2ead6'; ctx.fillRect(0, 0, W, H); }
  if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = Math.max(2, H * 0.04); ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, W - ctx.lineWidth * 2, H - ctx.lineWidth * 2); }
  const lines = Array.isArray(text) ? text : [text];
  const size = o.size ?? H * 0.5 / lines.length;
  ctx.fillStyle = o.fg ?? '#1c1e26';
  ctx.font = `${o.font ?? '700'} ${size}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = o.align ?? 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, o.align === 'left' ? W * 0.08 : W / 2, H * (i + 0.5) / lines.length + size * 0.04));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ───────────── LCD ─────────────

// segment layout: a b c d e f g  (standard 7-segment)
const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g', ' ': '', 'E': 'adefg', 'r': 'eg', 'O': 'abcdef', 'L': 'def', 'o': 'cdeg', 'n': 'ceg', 'F': 'aefg', 'P': 'abefg', 'H': 'bcefg', 'u': 'cde', 'C': 'adef', 'A': 'abcefg', 'V': 'bcdef',
};

export interface Lcd {
  texture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  /** redraws only when the text changes. `digits` like "-0.503", unit like "A" or "V". */
  set(digits: string, unit?: string, opts?: { blank?: boolean }): void;
  dispose(): void;
}

/** a reflective-LCD panel with ghosted 7-segment digits (owned by the caller) */
export function createLcd(cells = 4, w = 256, h = 104): Lcd {
  const [c, ctx] = canvas(w, h);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.25, metalness: 0, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.22 });
  let last = '\u0000';
  const cellW = (w * 0.74) / cells, digH = h * 0.62, x0 = w * 0.05, y0 = h * 0.2, th = cellW * 0.15;
  const segPath = (x: number, y: number, s: string) => {
    const sw = cellW * 0.62, sh = digH / 2, sk = cellW * 0.08; // skew for italic look
    const P = (px: number, py: number): [number, number] => [x + px + (1 - py / digH) * sk, y + py];
    const hseg = (py: number) => [P(th, py), P(sw - th, py), P(sw - th * 0.5, py + th * 0.5), P(sw - th, py + th), P(th, py + th), P(th * 0.5, py + th * 0.5)];
    const vseg = (px: number, py: number) => [P(px, py + th), P(px + th * 0.5, py + th * 0.5), P(px + th, py + th), P(px + th, py + sh - th * 0.5), P(px + th * 0.5, py + sh), P(px, py + sh - th * 0.5)];
    const m: Record<string, [number, number][]> = {
      a: hseg(0), g: hseg(sh - th * 0.5), d: hseg(digH - th),
      f: vseg(0, 0), b: vseg(sw - th, 0), e: vseg(0, sh - th * 0.5), c: vseg(sw - th, sh - th * 0.5),
    };
    const pts = m[s];
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath(); ctx.fill();
  };
  const set = (digits: string, unit = '', o: { blank?: boolean } = {}) => {
    const key = digits + '|' + unit + (o.blank ? '|b' : '');
    if (key === last) return;
    last = key;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#a9b59a'); g.addColorStop(1, '#8f9c82');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // split into cells, attaching '.' to the previous cell
    const cellsArr: { ch: string; dot: boolean }[] = [];
    for (const ch of digits) { if (ch === '.' && cellsArr.length) cellsArr[cellsArr.length - 1].dot = true; else cellsArr.push({ ch, dot: false }); }
    while (cellsArr.length < cells) cellsArr.unshift({ ch: ' ', dot: false });
    const shown = cellsArr.slice(-cells);
    for (let i = 0; i < cells; i++) {
      const x = x0 + i * cellW, on = o.blank ? '' : SEG[shown[i].ch] ?? '';
      for (const s of 'abcdefg') {
        ctx.fillStyle = on.includes(s) ? '#1a1f18' : 'rgba(40,52,36,0.07)';
        segPath(x, y0, s);
      }
      ctx.fillStyle = shown[i].dot && !o.blank ? '#1a1f18' : 'rgba(40,52,36,0.07)';
      ctx.beginPath(); ctx.arc(x + cellW * 0.78, y0 + digH - th * 0.5, th * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    if (unit && !o.blank) {
      ctx.fillStyle = '#1a1f18';
      ctx.font = `700 ${h * 0.3}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(unit, w * 0.83, y0 + digH);
    }
    // faint annunciator line
    ctx.fillStyle = 'rgba(26,31,24,0.55)'; ctx.font = `600 ${h * 0.12}px Arial, sans-serif`; ctx.textAlign = 'left';
    ctx.fillText('DC', w * 0.05, h * 0.14);
    texture.needsUpdate = true;
  };
  set('', '', { blank: true });
  return { texture, material, set, dispose: () => { texture.dispose(); material.dispose(); } };
}

/** format a reading for a 4-digit LCD: "0.503", "12.0", "-1.50", "OL" */
export function lcdText(v: number): string {
  if (!Number.isFinite(v)) return '----';
  const a = Math.abs(v);
  if (a >= 999.5) return ' OL';
  const s = a >= 99.95 ? a.toFixed(0) : a >= 9.995 ? a.toFixed(1) : a >= 0.9995 ? a.toFixed(2) : a.toFixed(3);
  return (v < 0 && Number(s) !== 0 ? '-' : '') + s;
}

export function disposeMaterialCache(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
