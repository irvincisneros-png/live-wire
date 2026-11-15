// Procedural canvas textures (no external assets). Shared ones are cached and flagged userData.shared.
import * as THREE from 'three';

// ── tiny value noise ──
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 4, s = 0): number {
  let f = 0, amp = 0.5, fr = 1;
  for (let i = 0; i < oct; i++) { f += amp * vnoise(x * fr, y * fr, s + i * 17); fr *= 2; amp *= 0.5; }
  return f;
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

const cache = new Map<string, THREE.Texture>();
function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) { t = make(); t.userData.shared = true; cache.set(key, t); }
  return t;
}

function heightToNormal(hgt: Float32Array, w: number, h: number, strength: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = hgt[y * w + ((x - 1 + w) % w)], xr = hgt[y * w + ((x + 1) % w)];
    const yu = hgt[((y - 1 + h) % h) * w + x], yd = hgt[((y + 1) % h) * w + x];
    let nx = (xl - xr) * strength, ny = (yd - yu) * strength;
    const nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l;
    const i = (y * w + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export interface WoodMaps { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }

/** long-grain timber (grain along U), tileable in U */
export function woodMaps(variant: 'bench' | 'dark' = 'bench'): WoodMaps {
  const key = 'wood-' + variant;
  const make = (): WoodMaps => {
    const W = 1024, H = 512;
    const [cc, cx] = canvas(W, H), [rc, rx] = canvas(W, H);
    const col = cx.createImageData(W, H), rough = rx.createImageData(W, H);
    const hgt = new Float32Array(W * H);
    const light = variant === 'bench' ? [168, 122, 80] : [112, 72, 44];
    const dark = variant === 'bench' ? [104, 66, 38] : [58, 34, 20];
    const seed = variant === 'bench' ? 3 : 9;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x / W) * Math.PI * 2;
      // tileable in x: sample noise on a circle (radius sets how fast the grain wanders along the board)
      const nx = Math.cos(u) * 1.6, nz = Math.sin(u) * 1.6;
      const warp = fbm(nx + y * 0.004, nz + y * 0.003, 3, seed) * 0.9 + fbm(nx * 3, nz * 3 + y * 0.01, 2, seed + 1) * 0.25;
      const rings = (y / H) * 44 + warp + fbm(nx * 5, nz * 5 + y * 0.08, 2, seed + 5) * 0.35;
      // smooth periodic ring profile (no hard edges): narrow dark latewood band, wide earlywood
      const g = Math.pow(0.5 + 0.5 * Math.sin(rings * Math.PI * 2), 4);
      // long thin pore streaks along the grain
      const fleck = fbm(nx * 40, y * 0.9 + nz * 40, 2, seed + 9);
      const pores = fleck > 0.62 ? (fleck - 0.62) * 1.6 : 0;
      const tone = 0.86 + fbm(nx * 0.8, nz * 0.8 + y * 0.01, 3, seed + 2) * 0.26;
      const t = Math.min(1, g * 0.7 + pores);
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) col.data[i + k] = Math.min(255, (light[k] + (dark[k] - light[k]) * t) * tone);
      col.data[i + 3] = 255;
      const r = 140 + t * 70 + (fleck - 0.5) * 30;
      rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = r; rough.data[i + 3] = 255;
      hgt[y * W + x] = -t * 0.5 - pores * 0.8;
    }
    cx.putImageData(col, 0, 0); rx.putImageData(rough, 0, 0);
    const map = tex(cc, true), roughnessMap = tex(rc, false), normalMap = tex(heightToNormal(hgt, W, H, 1.4), false);
    for (const t of [map, roughnessMap, normalMap]) t.userData.shared = true;
    return { map, normalMap, roughnessMap };
  };
  const m = cached(key + '-map', () => { const w = make(); cache.set(key + '-n', w.normalMap); cache.set(key + '-r', w.roughnessMap); return w.map; });
  return { map: m, normalMap: cache.get(key + '-n')!, roughnessMap: cache.get(key + '-r')! };
}

/** brushed-metal roughness streaks (along U) */
export function brushedRoughness(): THREE.Texture {
  return cached('brushed', () => {
    const W = 256, H = 256;
    const [c, ctx] = canvas(W, H);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const row = hash(y, 1, 7);
      for (let x = 0; x < W; x++) {
        const v = 0.5 + (row - 0.5) * 0.5 + (fbm(x * 0.02, y * 0.9, 2, 4) - 0.5) * 0.5;
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * Math.min(1, 0.72 + v * 0.3); img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, false);
  });
}

/** generic speckle roughness/bump for moulded plastic and ceramic */
export function speckle(): THREE.Texture {
  return cached('speckle', () => {
    const W = 256, H = 256;
    const [c, ctx] = canvas(W, H);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = fbm(x * 0.15, y * 0.15, 3, 11);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 120 + v * 90; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, false);
  });
}

/** soft radial glow (white centre → transparent), used for sprites */
export function glowTexture(): THREE.Texture {
  return cached('glow', () => {
    const [c, ctx] = canvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return tex(c, true, false);
  });
}

/** blurred dark blob for contact shadows */
export function blobTexture(): THREE.Texture {
  return cached('blob', () => {
    const [c, ctx] = canvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return tex(c, false, false);
  });
}

/** green/yellow earth stripe for insulation (stripes spiral along the tube's U) */
export function stripeTexture(a: string, b: string): THREE.Texture {
  return cached('stripe-' + a + b, () => {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = a; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = b;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(22, 0); ctx.lineTo(64, 42); ctx.lineTo(64, 64); ctx.lineTo(42, 64); ctx.lineTo(0, 22); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(42, 0); ctx.lineTo(64, 0); ctx.lineTo(64, 22); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 42); ctx.lineTo(22, 64); ctx.lineTo(0, 64); ctx.closePath(); ctx.fill();
    return tex(c, true);
  });
}

/** knurl pattern bump (diamond) */
export function knurlBump(): THREE.Texture {
  return cached('knurl', () => {
    const W = 128, H = 32;
    const [c, ctx] = canvas(W, H);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = Math.abs(Math.sin((x / W) * Math.PI * 48 + (y / H) * Math.PI * 4));
      const b = Math.abs(Math.sin((x / W) * Math.PI * 48 - (y / H) * Math.PI * 4));
      const v = Math.min(a, b);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, false);
  });
}

export function disposeTextureCache(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
