// Training-house materials. Procedural textures are cached for the session (flagged shared, like the kit's);
// materials are made per house and disposed with it.
import * as THREE from 'three';
import { canvas, fbm, speckle } from '../../kit/textures';

const texCache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) { t = make(); t.userData.shared = true; texCache.set(key, t); }
  return t;
}
function tex(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** radiata pine framing timber: pale straw colour, soft growth rings, the odd knot. Grain runs along U. */
function pineMaps(): { map: THREE.Texture; rough: THREE.Texture; bump: THREE.Texture } {
  const make = () => {
    const W = 1024, H = 256;
    const [cc, cx] = canvas(W, H), [rc, rx] = canvas(W, H), [bc, bx] = canvas(W, H);
    const col = cx.createImageData(W, H), rough = rx.createImageData(W, H), bump = bx.createImageData(W, H);
    const knots = [[180, 70, 15], [610, 190, 11], [880, 60, 9], [400, 150, 6]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x / W) * Math.PI * 2;
      const nx = Math.cos(u) * 2.2, nz = Math.sin(u) * 2.2;
      let warp = fbm(nx + y * 0.006, nz, 3, 21) * 1.4;
      let kd = 0;
      for (const [kx, ky, kr] of knots) {
        const dx = (x - kx) * 0.35, dy = y - ky, d = Math.hypot(dx, dy);
        warp += (kr * 2.2) / (d + kr) * Math.sign(dy || 1) * 0.6;
        kd = Math.max(kd, Math.max(0, 1 - d / kr));
      }
      const rings = (y / H) * 18 + warp;
      const g = Math.pow(0.5 + 0.5 * Math.sin(rings * Math.PI * 2), 3);
      const fleck = fbm(nx * 30, y * 0.6 + nz * 30, 2, 25);
      const tone = 0.9 + fbm(nx * 0.7, nz * 0.7 + y * 0.004, 3, 23) * 0.2;
      const t = Math.min(1, g * 0.5 + (fleck > 0.66 ? (fleck - 0.66) * 1.2 : 0) + kd * 0.9);
      const light = [226, 196, 146], dark = [176, 128, 78];
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) col.data[i + k] = Math.min(255, (light[k] + (dark[k] - light[k]) * t) * tone);
      col.data[i + 3] = 255;
      const r = 175 + t * 40 + (fleck - 0.5) * 30;
      rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = r; rough.data[i + 3] = 255;
      const b = 128 - t * 40 + (fleck - 0.5) * 30;
      bump.data[i] = bump.data[i + 1] = bump.data[i + 2] = b; bump.data[i + 3] = 255;
    }
    cx.putImageData(col, 0, 0); rx.putImageData(rough, 0, 0); bx.putImageData(bump, 0, 0);
    texCache.set('pine-r', tex(rc, false)); texCache.set('pine-b', tex(bc, false));
    texCache.get('pine-r')!.userData.shared = true; texCache.get('pine-b')!.userData.shared = true;
    return tex(cc, true);
  };
  const map = cached('pine', make);
  return { map, rough: texCache.get('pine-r')!, bump: texCache.get('pine-b')! };
}

/** power-floated concrete slab with soft trowel marks and stains */
function concreteMap(): THREE.Texture {
  return cached('concrete', () => {
    const W = 512, [c, ctx] = canvas(W, W);
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / W;
      const n = fbm(u * 6, v * 6, 5, 41) * 0.55 + fbm(u * 40, v * 40, 2, 43) * 0.18;
      const stain = Math.max(0, fbm(u * 2.5, v * 2.5, 3, 47) - 0.55) * 1.2;
      const swirl = Math.sin((u * 30 + fbm(u * 3, v * 3, 2, 49) * 4)) * 0.02;
      const k = 0.62 + n * 0.32 + swirl - stain * 0.35;
      const i = (y * W + x) * 4;
      img.data[i] = 150 * k; img.data[i + 1] = 148 * k; img.data[i + 2] = 142 * k; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, true);
  });
}

/** painted besser-block back wall of the workshop */
function blockMap(): THREE.Texture {
  return cached('block', () => {
    const W = 512, H = 256, [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#7c7a74'; ctx.fillRect(0, 0, W, H);
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, n = fbm(x * 0.05, y * 0.05, 3, 51) * 40 - 20;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = 'rgba(40,38,34,0.55)';
    const bw = 128, bh = 64;
    for (let r = 0; r < H / bh; r++) {
      ctx.fillRect(0, r * bh, W, 3);
      for (let k = 0; k <= W / bw; k++) ctx.fillRect(k * bw + (r % 2) * (bw / 2), r * bh, 3, bh);
    }
    return tex(c, true);
  });
}

/** plasterboard face paper: off-white with faint fibres */
function plasterMap(): THREE.Texture {
  return cached('plaster', () => {
    const W = 256, [c, ctx] = canvas(W, W);
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const n = fbm(x * 0.08, y * 0.08, 3, 61) * 14 + fbm(x * 0.6, y * 0.03, 1, 63) * 6;
      const i = (y * W + x) * 4;
      img.data[i] = 226 + n; img.data[i + 1] = 224 + n; img.data[i + 2] = 216 + n; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, true);
  });
}

/** plywood backing board: rotary-cut face veneer */
function plyMap(): THREE.Texture {
  return cached('ply', () => {
    const W = 512, H = 512, [c, ctx] = canvas(W, H);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const w = fbm(x * 0.004, y * 0.02, 3, 71) * 6;
      const g = Math.pow(0.5 + 0.5 * Math.sin((y * 0.05 + w) * Math.PI), 2);
      const i = (y * W + x) * 4, t = 0.9 + fbm(x * 0.01, y * 0.01, 2, 73) * 0.2;
      img.data[i] = (214 - g * 34) * t; img.data[i + 1] = (180 - g * 36) * t; img.data[i + 2] = (128 - g * 34) * t; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, true);
  });
}

export interface HouseMats {
  pine: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  block: THREE.MeshStandardMaterial;
  plaster: THREE.MeshStandardMaterial;
  gypsum: THREE.MeshStandardMaterial;
  ply: THREE.MeshStandardMaterial;
  paintYellow: THREE.MeshStandardMaterial;
  enclosure: THREE.MeshPhysicalMaterial;
  whitePlastic: THREE.MeshPhysicalMaterial;
  greyPlastic: THREE.MeshPhysicalMaterial;
  slot: THREE.MeshStandardMaterial;
  galv: THREE.MeshStandardMaterial;
  grommet: THREE.MeshStandardMaterial;
  copperBare: THREE.MeshStandardMaterial;
  socketYellow: THREE.MeshPhysicalMaterial;
  dispose(): void;
}

export function createHouseMats(): HouseMats {
  const p = pineMaps();
  const own: THREE.Material[] = [];
  const keep = <T extends THREE.Material>(m: T): T => { own.push(m); return m; };
  const conc = concreteMap().clone(); conc.repeat.set(10, 7); conc.needsUpdate = true;
  const blk = blockMap().clone(); blk.repeat.set(9, 7); blk.needsUpdate = true;
  const pl = plasterMap().clone(); pl.repeat.set(3, 6); pl.needsUpdate = true;
  const ply = plyMap().clone(); ply.repeat.set(1, 1); ply.needsUpdate = true;
  const owned = [conc, blk, pl, ply];
  const m: HouseMats = {
    pine: keep(new THREE.MeshStandardMaterial({ map: p.map, roughnessMap: p.rough, bumpMap: p.bump, bumpScale: 0.6, roughness: 1, metalness: 0 })),
    concrete: keep(new THREE.MeshStandardMaterial({ map: conc, roughness: 0.62, metalness: 0, envMapIntensity: 0.6 })),
    block: keep(new THREE.MeshStandardMaterial({ map: blk, color: 0x8a8378, roughness: 0.95, metalness: 0 })),
    plaster: keep(new THREE.MeshStandardMaterial({ map: pl, color: 0xd8d4ca, roughness: 0.92, metalness: 0 })),
    gypsum: keep(new THREE.MeshStandardMaterial({ color: 0xd9d4c4, roughness: 1, roughnessMap: speckle(), metalness: 0 })),
    ply: keep(new THREE.MeshStandardMaterial({ map: ply, roughness: 0.8, metalness: 0 })),
    paintYellow: keep(new THREE.MeshStandardMaterial({ color: 0xe2b020, roughness: 0.55, metalness: 0, roughnessMap: speckle() })),
    enclosure: keep(new THREE.MeshPhysicalMaterial({ color: 0xe9e8e2, roughness: 0.42, metalness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.4, roughnessMap: speckle() })),
    whitePlastic: keep(new THREE.MeshPhysicalMaterial({ color: 0xf3f1ea, roughness: 0.3, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25 })),
    greyPlastic: keep(new THREE.MeshPhysicalMaterial({ color: 0x8d9196, roughness: 0.45, metalness: 0, clearcoat: 0.2, roughnessMap: speckle() })),
    slot: keep(new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 })),
    galv: keep(new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.5, metalness: 0.55, roughnessMap: speckle() })),
    grommet: keep(new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.8 })),
    copperBare: keep(new THREE.MeshStandardMaterial({ color: 0xe0864e, roughness: 0.28, metalness: 1, emissive: 0x000000 })),
    socketYellow: keep(new THREE.MeshPhysicalMaterial({ color: 0xf0c419, roughness: 0.35, clearcoat: 0.4 })),
    dispose() { own.forEach((x) => x.dispose()); owned.forEach((t) => t.dispose()); },
  };
  return m;
}

/** timber box with the grain along its longest axis and UVs scaled to real size, so every piece shares one texture scale */
export function timberGeo(sx: number, sy: number, sz: number, seed = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const long = sx >= sy && sx >= sz ? 0 : sy >= sz ? 1 : 2;
  const off = (seed * 0.6180339) % 1, offV = (seed * 0.3819) % 1;
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)], n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const face = n[0] > 0.5 ? 0 : n[1] > 0.5 ? 1 : 2;
    const across = [0, 1, 2].find((k) => k !== long && k !== face) ?? 0;
    // U along the length (1 tile per 2.4 m), V across the face (a 90 mm face spans ~ a third of the tile)
    uv.setXY(i, p[long] / 24 + off, p[across] / 3 + offV);
  }
  uv.needsUpdate = true;
  return g;
}
