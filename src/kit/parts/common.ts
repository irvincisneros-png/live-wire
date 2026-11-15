// Shared dimensions and small building blocks for part models. Scale: 1 unit = 10 cm; posts are 1 unit apart.
// Every edge part is built with its terminals at x = ±0.5 (a at −0.5), origin at the edge midpoint, y = 0 on the board.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from '../materials';
import { glowTexture } from '../textures';

export const DIM = {
  /** top of a binding post's knurled cap (where banana plugs sit) */
  postTop: 0.215,
  /** height at which a part's lug clamps round the post stem */
  lugY: 0.068,
  stemR: 0.028,
  /** height of one stacked banana plug */
  plugH: 0.105,
  plugR: 0.034,
};

/** geometry cache: shared, flagged so disposeTree skips them */
const geo = new Map<string, THREE.BufferGeometry>();
export function sharedGeo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geo.get(key) as T | undefined;
  if (!g) { g = make(); g.userData.shared = true; geo.set(key, g); }
  return g;
}
export function disposeGeometryCache(): void { for (const g of geo.values()) g.dispose(); geo.clear(); }

export function rbox(w: number, h: number, d: number, r = 0.012, seg = 2): THREE.BufferGeometry {
  return sharedGeo(`rbox-${w}-${h}-${d}-${r}-${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh {
  const x = new THREE.Mesh(g, m);
  x.castShadow = shadow; x.receiveShadow = true;
  return x;
}

/** brass spade lug running from the part body (at x = ±inner) to the post stem at x = ±0.5 */
export function lugs(inner: number, y0 = 0.03, side: -1 | 1 | 0 = 0): THREE.Group {
  const g = new THREE.Group();
  const ring = sharedGeo('lug-ring', () => new THREE.TorusGeometry(DIM.stemR + 0.008, 0.008, 6, 20).rotateX(Math.PI / 2));
  for (const s of side === 0 ? [-1, 1] : [side]) {
    const len = 0.5 - DIM.stemR - 0.012 - inner;
    if (len > 0.005) {
      const strip = mesh(sharedGeo(`lug-strip-${len.toFixed(3)}`, () => new RoundedBoxGeometry(len, 0.007, 0.034, 1, 0.003)), M.brass());
      // rises gently from y0 at the body to lugY at the post
      strip.position.set(s * (inner + len / 2), (y0 + DIM.lugY) / 2, 0);
      strip.rotation.z = s * Math.atan2(DIM.lugY - y0, len);
      g.add(strip);
    }
    const r = mesh(ring, M.brass(), false);
    r.position.set(s * 0.5, DIM.lugY, 0);
    g.add(r);
  }
  return g;
}

/** a slotted cheese-head screw, standing on y = 0 */
export function screw(r = 0.018, h = 0.014, mat: THREE.Material = M.nickel()): THREE.Group {
  const g = new THREE.Group();
  const head = mesh(sharedGeo(`screw-${r}-${h}`, () => {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, h * 0.7), new THREE.Vector2(r * 0.85, h), new THREE.Vector2(0, h)];
    return new THREE.LatheGeometry(pts, 20);
  }), mat, false);
  const slot = mesh(sharedGeo(`slot-${r}-${h}`, () => new THREE.BoxGeometry(r * 2.05, h * 0.5, r * 0.25)), M.darkSteel(), false);
  slot.position.y = h;
  g.add(head, slot);
  return g;
}

/** additive "heat" shell drawn over an existing geometry: a fresnel glow that is strongest at the silhouette,
 *  so the part's own surface (labels) still shows through. setHeat(shell, 0..1). */
export function heatShell(g: THREE.BufferGeometry, scale = 1.02): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHeat: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.32, 0.06) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uHeat; uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.8);
        float a = uHeat * (0.12 + 0.9 * f);
        gl_FragColor = vec4(uColor * a * 1.6, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(g, mat);
  m.scale.setScalar(scale);
  m.visible = false;
  m.userData.heatShell = true;
  return m;
}
export function setHeat(shell: THREE.Mesh, h: number): void {
  (shell.material as THREE.ShaderMaterial).uniforms.uHeat.value = Math.min(1, h);
  shell.visible = h > 0.01;
}

/** additive glow sprite (owned by caller) */
export function glowSprite(color = 0xffc070): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  s.userData.glow = true;
  return s;
}

/** approximate blackbody colour (linear RGB) for a temperature in kelvin */
export function blackbody(T: number, out = new THREE.Color()): THREE.Color {
  const t = T / 100;
  let r: number, g: number, b: number;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (v: number) => Math.min(1, Math.max(0, v / 255));
  return out.setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

/** flat printed decal lying on a surface (owned texture) */
export function decal(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** smoke wisp: a few soft grey sprites that rise and fade; call update(dt) until it returns false */
export function smokeWisp(): THREE.Group & { userData: { update(dt: number): boolean } } {
  const g = new THREE.Group() as THREE.Group & { userData: { update(dt: number): boolean } };
  const puffs: { s: THREE.Sprite; v: THREE.Vector3; life: number; delay: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x8c8a86, transparent: true, opacity: 0, depthWrite: false }));
    s.scale.setScalar(0.06);
    g.add(s);
    puffs.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.06, 0.18 + Math.random() * 0.08, (Math.random() - 0.5) * 0.06), life: 0, delay: i * 0.12 });
  }
  let t = 0;
  g.userData.update = (dt: number) => {
    t += dt;
    let alive = false;
    for (const p of puffs) {
      const lt = t - p.delay;
      if (lt < 0) { alive = true; continue; }
      const k = lt / 1.8;
      if (k >= 1) { p.s.visible = false; continue; }
      alive = true;
      p.s.position.copy(p.v).multiplyScalar(lt);
      p.s.position.x += Math.sin(lt * 5 + p.delay * 9) * 0.02;
      p.s.scale.setScalar(0.06 + k * 0.22);
      (p.s.material as THREE.SpriteMaterial).opacity = 0.45 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k);
    }
    return alive;
  };
  return g;
}

/** the userData every part model may carry */
export interface PartModelData {
  /** per-frame update with the solved state (part-specific shape) */
  update?(state: Record<string, unknown>, dt: number): void;
  /** world-or-local path for the x-ray dots: points in the part's local frame from terminal a to b, with u = potential fraction */
  flowPath?: { pts: THREE.Vector3[]; u: number[] };
  /** local point where heat/energy packets come from */
  hotSpot?: THREE.Vector3;
}

/**
 * Merge the static meshes under `root` that share a material into one mesh per material, to cut draw calls.
 * Meshes inside `skip` subtrees, transparent or shader materials, sprites and heat shells are left alone.
 * Call once at the end of building a model, while `root` is still at the origin.
 */
export function bakeStatic(root: THREE.Object3D, skip: THREE.Object3D[] = []): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const skipSet = new Set(skip);
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  const visit = (o: THREE.Object3D) => {
    if (skipSet.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && !m.userData.heatShell && m.name !== 'contactShadow') {
      const mat = m.material as THREE.Material;
      if (!mat.transparent && !(mat as THREE.ShaderMaterial).isShaderMaterial && m.geometry.attributes.uv && m.geometry.attributes.normal) {
        if (!groups.has(mat)) groups.set(mat, []);
        groups.get(mat)!.push(m);
      }
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  for (const [mat, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      let g = m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      g.morphAttributes = {};
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const cast = meshes.some((m) => m.castShadow);
    for (const m of meshes) { if (!m.geometry.userData.shared) m.geometry.dispose(); m.removeFromParent(); }
    const out = new THREE.Mesh(merged, mat);
    out.castShadow = cast; out.receiveShadow = true;
    out.name = 'baked';
    root.add(out);
  }
}
