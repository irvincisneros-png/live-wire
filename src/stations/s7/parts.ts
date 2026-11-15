// Station 7 building blocks: cutaway shells, blade rows, flames, smoke, the shared generator, and the grid
// (transformer, pylon, house). Stylised but built like real machines. Shaft axes run along world x.
import * as THREE from 'three';
import * as M from '../../kit/materials';
import { canvas, fbm, glowTexture } from '../../kit/textures';
import { mesh, rbox } from '../../kit/parts/common';

// ───────────── materials (station-owned, disposed with the scene) ─────────────
const mats = new Map<string, THREE.Material>();
export function paint(colour: number, rough = 0.42, metal = 0.35): THREE.MeshPhysicalMaterial {
  const k = `paint-${colour}-${rough}-${metal}`;
  let m = mats.get(k) as THREE.MeshPhysicalMaterial | undefined;
  if (!m) { m = new THREE.MeshPhysicalMaterial({ color: colour, roughness: rough, metalness: metal, clearcoat: 0.45, clearcoatRoughness: 0.35, roughnessMap: M.ceramicMatte().roughnessMap }); mats.set(k, m); }
  return m;
}
/** the orange-red colour of a cut face, as in a technical cutaway drawing */
export function cutFace(): THREE.MeshStandardMaterial {
  let m = mats.get('cut') as THREE.MeshStandardMaterial | undefined;
  if (!m) { m = new THREE.MeshStandardMaterial({ color: 0xd9542b, roughness: 0.62, metalness: 0.1, side: THREE.DoubleSide }); mats.set('cut', m); }
  return m;
}
export function disposeS7Materials(): void { for (const m of mats.values()) m.dispose(); mats.clear(); }

// ───────────── geometry helpers ─────────────

/** a strut (round bar) between two points */
export function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 6): THREE.Mesh {
  const d = b.clone().sub(a), len = d.length();
  const m = mesh(new THREE.CylinderGeometry(r, r, len, seg, 1), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** an angle-iron strut (L section) between two points, for the lattice pylon */
export function angleBar(a: THREE.Vector3, b: THREE.Vector3, w: number, mat: THREE.Material): THREE.Mesh {
  const d = b.clone().sub(a), len = d.length();
  const m = mesh(new THREE.BoxGeometry(w, len, w * 0.35), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** lathe around the x axis: profile points are [x, radius]; phi range as in LatheGeometry (0 = +z, increasing towards -y) */
export function latheX(pts: [number, number][], mat: THREE.Material, seg = 40, phiStart = 0, phiLength = Math.PI * 2): THREE.Mesh {
  const g = new THREE.LatheGeometry(pts.map(([x, r]) => new THREE.Vector2(Math.max(0.0005, r), x)), seg, phiStart, phiLength);
  g.rotateZ(-Math.PI / 2);
  return mesh(g, mat);
}

/** the open window of every cutaway faces the camera (+z, a little above) */
export const CUT_W = Math.PI * 0.62;
export const CUT_START = CUT_W / 2 - 0.4;
export const CUT_LEN = Math.PI * 2 - CUT_W;

/** map a profile point (x along the axis, radius) at angle phi to local space (matches latheX) */
const at = (x: number, r: number, phi: number) => new THREE.Vector3(x, -r * Math.sin(phi), r * Math.cos(phi));

/**
 * A cutaway casing: a thick shell of revolution around x with a window cut towards the viewer.
 * outer: [x, r] profile; wall thickness t. The two cut faces are painted in the cutaway colour.
 */
export function cutShell(outer: [number, number][], t: number, mat: THREE.Material, seg = 48): THREE.Group {
  const g = new THREE.Group();
  const om = latheX(outer, mat, seg, CUT_START, CUT_LEN);
  (om.material as THREE.Material).side = THREE.DoubleSide;
  g.add(om);
  const inner = outer.map(([x, r]) => [x, Math.max(0.01, r - t)] as [number, number]);
  const im = latheX(inner, paint(0x2b2f33, 0.6, 0.4), seg, CUT_START, CUT_LEN);
  (im.material as THREE.Material).side = THREE.DoubleSide;
  g.add(im);
  // cut faces: the ring section between outer and inner at both ends of the window
  for (const phi of [CUT_START, CUT_START + CUT_LEN]) {
    const pos: number[] = [];
    for (let i = 0; i < outer.length - 1; i++) {
      const a = at(outer[i][0], outer[i][1], phi), b = at(outer[i + 1][0], outer[i + 1][1], phi);
      const c = at(inner[i + 1][0], inner[i + 1][1], phi), d = at(inner[i][0], inner[i][1], phi);
      pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const uv = new Float32Array((pos.length / 3) * 2);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.add(mesh(geo, cutFace(), false));
  }
  return g;
}

/** a ring of blades around the x axis (instanced). r0..r1 radial span, chord, pitch angle. */
export function bladeRow(n: number, r0: number, r1: number, chord: number, pitch: number, mat: THREE.Material, thick = 0.012): THREE.InstancedMesh {
  const len = r1 - r0;
  const geo = new THREE.BoxGeometry(thick, len, chord);
  // a slight twist and taper along the blade
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / len + 0.5;
    const z = p.getZ(i) * (1 - 0.25 * y), x = p.getX(i);
    const tw = -0.35 * y;
    p.setXYZ(i, x * Math.cos(tw) - z * Math.sin(tw), p.getY(i), x * Math.sin(tw) + z * Math.cos(tw));
  }
  geo.translate(0, r0 + len / 2, 0);
  geo.computeVertexNormals();
  const im = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    e.set((i / n) * Math.PI * 2, pitch, 0, 'XYZ');
    q.setFromEuler(e);
    m.makeRotationFromQuaternion(q);
    im.setMatrixAt(i, m);
  }
  im.castShadow = true; im.receiveShadow = true;
  return im;
}

/** a bladed rotor stage: disc + blades, origin on the axis */
export function rotorStage(x: number, rHub: number, rTip: number, n: number, chord: number, bladeMat: THREE.Material, discMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.position.x = x;
  g.add(latheX([[-chord * 0.6, 0.02], [-chord * 0.6, rHub * 0.96], [-chord * 0.45, rHub], [chord * 0.45, rHub], [chord * 0.6, rHub * 0.96], [chord * 0.6, 0.02]], discMat, 32));
  g.add(bladeRow(n, rHub * 0.98, rTip, chord, 0.6, bladeMat));
  return g;
}

// ───────────── flames, smoke, glow ─────────────

const flameVS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const flameFS = `uniform float uTime; uniform vec3 uHot; uniform vec3 uCool; uniform float uSeed; varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float f = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { f += a * noise(p); p *= 2.03; a *= 0.5; } return f; }
  void main() {
    vec2 p = vUv; float t = uTime * 1.6 + uSeed;
    float n = fbm(vec2(p.x * 3.0, p.y * 2.2 - t));
    float w = (1.0 - p.y) * 0.42 + 0.06;               // narrower towards the top
    float d = abs(p.x - 0.5 + (n - 0.5) * 0.22 * p.y);
    float body = smoothstep(w, w * 0.25, d) * smoothstep(1.0, 0.25, p.y + n * 0.35) * smoothstep(0.0, 0.08, p.y);
    vec3 col = mix(uCool, uHot, smoothstep(0.15, 0.9, body));
    gl_FragColor = vec4(col * body * 1.8, body);
  }`;

export interface Flame extends THREE.Mesh { userData: { tick(t: number, cam: THREE.Camera): void } }

/** an animated flame card that turns to face the camera about its vertical axis */
export function flame(w: number, h: number, hot = 0xfff1b0, cool = 0xff5a10, seed = 0): Flame {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHot: { value: new THREE.Color(hot) }, uCool: { value: new THREE.Color(cool) }, uSeed: { value: seed } },
    vertexShader: flameVS, fragmentShader: flameFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), mat) as unknown as Flame;
  m.renderOrder = 5;
  const v = new THREE.Vector3();
  m.userData.tick = (t, cam) => {
    mat.uniforms.uTime.value = t;
    m.getWorldPosition(v);
    const parentRotY = m.parent ? new THREE.Euler().setFromQuaternion(m.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
    m.rotation.y = Math.atan2(cam.position.x - v.x, cam.position.z - v.z) - parentRotY;
  };
  return m;
}

export function glow(colour: number, size: number, opacity = 0.8): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  s.renderOrder = 6;
  return s;
}

/** rising puffs (smoke from a stack, steam, or shimmer); call tick(dt) */
export function plume(colour: number, count: number, rise: number, spread: number, size: number, opacity: number, additive = false): THREE.Group & { userData: { tick(dt: number): void } } {
  const g = new THREE.Group() as THREE.Group & { userData: { tick(dt: number): void } };
  const puffs: { s: THREE.Sprite; age: number; life: number; dx: number; dz: number }[] = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colour, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    g.add(s);
    puffs.push({ s, age: (i / count) * 3, life: 3, dx: (Math.random() - 0.5) * spread, dz: (Math.random() - 0.5) * spread });
  }
  g.userData.tick = (dt) => {
    for (const p of puffs) {
      p.age += dt;
      if (p.age > p.life) { p.age -= p.life; p.dx = (Math.random() - 0.5) * spread; p.dz = (Math.random() - 0.5) * spread; }
      const k = p.age / p.life;
      p.s.position.set(p.dx * k * 2 + k * spread * 0.8, k * rise, p.dz * k);
      p.s.scale.setScalar(size * (0.4 + k * 1.4));
      (p.s.material as THREE.SpriteMaterial).opacity = opacity * Math.sin(Math.PI * k);
    }
  };
  return g;
}

/** a label texture plane (owned) */
export function textPlate(lines: string[], w: number, h: number, fg = '#f2efe6', bg: string | null = null, px = 256): THREE.Mesh {
  const [c, ctx] = canvas(px * (w / h), px);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const size = (px * 0.7) / lines.length;
  ctx.font = `800 ${size}px "Helvetica Neue", Arial, sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, c.width / 2, (px * (i + 0.5)) / lines.length));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: !bg, roughness: 0.6, depthWrite: !!bg, polygonOffset: true, polygonOffsetFactor: -2 }));
  return m;
}

// ───────────── the shared generator ─────────────

export interface Generator extends THREE.Group {
  userData: {
    rotor: THREE.Group;
    /** local point on the terminal box where the output cables leave */
    terminal: THREE.Vector3;
    /** local point at the centre of the rotor (the "electrical" anchor) */
    centre: THREE.Vector3;
    /** local point at the input shaft end (left) */
    shaftIn: THREE.Vector3;
  };
}

function magnetTexture(letter: string, bg: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(384, 128);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 384, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = '900 84px "Helvetica Neue", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const x of [64, 192, 320]) ctx.fillText(letter, x, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Generator: a cutaway stator (laminated iron with copper coils) round a rotor carrying N and S magnets on a steel
 * shaft, on a skid with bearing pedestals and a terminal box. Shaft along x; centre at the origin, shaft height y = 0.
 * Overall about 2.2 long and 1.3 across.
 */
export function createGenerator(): Generator {
  const g = new THREE.Group() as unknown as Generator;
  const housing = paint(0x3d6b58, 0.4, 0.35);
  const L = 1.2, R = 0.62;
  // housing with cooling ribs, cut away
  const prof: [number, number][] = [[-L / 2, R - 0.06], [-L / 2 + 0.04, R]];
  for (let i = 0; i < 7; i++) { const x = -L / 2 + 0.12 + i * 0.16; prof.push([x - 0.03, R], [x - 0.02, R + 0.04], [x + 0.02, R + 0.04], [x + 0.03, R]); }
  prof.push([L / 2 - 0.04, R], [L / 2, R - 0.06]);
  g.add(cutShell(prof, 0.08, housing));
  // end shields (full discs at the far end, cut at the near end)
  const shield = (x: number, s: number) => latheX([[x, 0.1], [x + s * 0.02, 0.2], [x + s * 0.05, R - 0.06], [x, R - 0.06]], housing, 40, CUT_START, CUT_LEN);
  g.add(shield(-L / 2, -1), shield(L / 2, 1));
  // stator iron: laminated ring (thin plates suggested by grooves)
  const statorM = new THREE.MeshStandardMaterial({ color: 0x5d6168, metalness: 0.85, roughness: 0.38, bumpMap: laminationBump(), bumpScale: 0.6 });
  const sp: [number, number][] = [[-0.45, 0.44], [0.45, 0.44], [0.45, 0.54], [-0.45, 0.54], [-0.45, 0.44]];
  const stator = latheX(sp, statorM, 64, CUT_START, CUT_LEN);
  (stator.material as THREE.Material).side = THREE.DoubleSide;
  g.add(stator);
  // copper coils sitting in the stator slots, with end turns curling over at both ends
  const copperM = M.copper();
  const nCoils = 12;
  const cg = coilGeometry();
  for (let i = 0; i < nCoils; i++) {
    const phi = (i / nCoils) * Math.PI * 2;
    // skip coils in the open window so the rotor can be seen
    const rel = ((phi - CUT_START) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (rel > CUT_LEN) continue;
    const coil = new THREE.Group();
    coil.add(mesh(cg, copperM));
    coil.rotation.x = -phi;
    g.add(coil);
  }
  // rotor: steel core with alternating N/S pole magnets, on the shaft
  const rotor = new THREE.Group();
  const coreM = new THREE.MeshStandardMaterial({ color: 0x6e737a, metalness: 0.9, roughness: 0.32, roughnessMap: M.steel().roughnessMap });
  rotor.add(latheX([[-0.48, 0.08], [-0.48, 0.3], [-0.44, 0.33], [0.44, 0.33], [0.48, 0.3], [0.48, 0.08]], coreM, 40));
  const nTex = magnetTexture('N', '#b8332b'), sTex = magnetTexture('S', '#2d5fb0');
  const nM = new THREE.MeshPhysicalMaterial({ map: nTex, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, metalness: 0.1 });
  const sM = new THREE.MeshPhysicalMaterial({ map: sTex, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, metalness: 0.1 });
  const poles = 6;
  for (let i = 0; i < poles; i++) {
    const a = (i / poles) * Math.PI * 2;
    const mg = mesh(rbox(0.8, 0.07, 0.24, 0.025, 2), i % 2 ? sM : nM);
    // face texture points out: put the magnet on the rotor surface, rotated round x
    const holder = new THREE.Group();
    mg.position.y = 0.36;
    holder.add(mg);
    holder.rotation.x = a;
    rotor.add(holder);
  }
  // the shaft runs right through and out of both ends
  const shaftM = M.steel();
  const shaft = mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.3, 24).rotateZ(Math.PI / 2), shaftM);
  rotor.add(shaft);
  // a painted stripe on the shaft so the spin can be seen
  const stripe = mesh(rbox(0.4, 0.02, 0.05, 0.008), paint(0xf2c230, 0.4, 0.1), false); stripe.position.set(-0.85, 0.07, 0); rotor.add(stripe);
  g.add(rotor);
  // bearing pedestals and skid
  const skid = paint(0x2c3136, 0.5, 0.5);
  for (const sx of [-1, 1]) {
    const ped = mesh(rbox(0.22, 0.62, 0.42, 0.04, 2), skid); ped.position.set(sx * 0.82, -0.36, 0); g.add(ped);
    const brg = latheX([[-0.1, 0.08], [-0.1, 0.16], [0.1, 0.16], [0.1, 0.08]], M.brassDark(), 24); brg.position.x = sx * 0.82; g.add(brg);
  }
  const base = mesh(rbox(2.2, 0.12, 1.2, 0.03, 2), skid); base.position.y = -0.7; g.add(base);
  // feet under the housing
  for (const sx of [-1, 1]) { const ft = mesh(rbox(0.16, 0.12, 1.0, 0.02), housing); ft.position.set(sx * 0.4, -0.6, 0); g.add(ft); }
  for (let i = 0; i < 6; i++) { const b = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 6), M.darkSteel(), false); b.position.set(-0.9 + (i % 3) * 0.9, -0.63, i < 3 ? -0.5 : 0.5); g.add(b); }
  // terminal box on top at the back, with three insulated output cables
  const tb = mesh(rbox(0.42, 0.26, 0.32, 0.04, 2), housing); tb.position.set(0.2, R + 0.1, -0.32); g.add(tb);
  const lid = mesh(rbox(0.46, 0.03, 0.36, 0.015), paint(0x2f5546, 0.4, 0.35)); lid.position.set(0.2, R + 0.24, -0.32); g.add(lid);
  const plate = textPlate(['GENERATOR'], 0.4, 0.07, '#e9efe9'); plate.position.set(0.2, R + 0.1, -0.155); g.add(plate);
  g.userData = {
    rotor,
    terminal: new THREE.Vector3(0.36, R + 0.12, -0.45),
    centre: new THREE.Vector3(0, 0, 0),
    shaftIn: new THREE.Vector3(-1.15, 0, 0),
  };
  g.name = 'generator';
  return g;
}

/** one stator coil: a rounded loop of copper lying along the axis at the stator's inner face, end turns lifted */
function coilGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const hx = 0.5, hz = 0.085, r = 0.06, y = 0.47;
  const corner = (cx: number, cz: number, a0: number) => { for (let i = 0; i <= 5; i++) { const a = a0 + (i / 5) * (Math.PI / 2); pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y + (Math.abs(cx) > 0.3 ? 0.035 : 0), cz + Math.sin(a) * r)); } };
  corner(hx - r, hz - r, 0); corner(-hx + r, hz - r, Math.PI / 2); corner(-hx + r, -hz + r, Math.PI); corner(hx - r, -hz + r, Math.PI * 1.5);
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.03, 8, true);
}

function laminationBump(): THREE.CanvasTexture {
  const [c, ctx] = canvas(8, 256);
  for (let y = 0; y < 256; y++) { const v = y % 4 === 0 ? 40 : 200; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, y, 8, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1);
  return t;
}

/** a ghost outline of the generator for solar PV: same size, see-through, dashed edges */
export function ghostGenerator(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.62, 0.62, 1.2, 28, 1, true).rotateZ(Math.PI / 2);
  const shell = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
  g.add(shell);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 14, 2).rotateZ(Math.PI / 2), 1),
    new THREE.LineDashedMaterial({ color: 0xc9d6e2, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.7 }));
  edges.computeLineDistances();
  g.add(edges);
  const base = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, 0.12, 1.2)), new THREE.LineDashedMaterial({ color: 0xc9d6e2, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.6 }));
  base.computeLineDistances(); base.position.y = -0.7; g.add(base);
  return g;
}

// ───────────── the grid: transformer, pylon, house ─────────────

export function createTransformer(): THREE.Group {
  const g = new THREE.Group();
  const body = paint(0x6b7a72, 0.5, 0.4);
  const tank = mesh(rbox(0.9, 1.0, 0.7, 0.05, 2), body); tank.position.y = 0.5; g.add(tank);
  for (let i = 0; i < 7; i++) { const fin = mesh(rbox(0.04, 0.8, 0.28, 0.01), body); fin.position.set(-0.36 + i * 0.12, 0.48, 0.48); g.add(fin); }
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0x8a4a2a, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  for (let i = 0; i < 3; i++) {
    const bp: [number, number][] = [[0, 0.07]];
    for (let k = 0; k < 6; k++) bp.push([0.03 + k * 0.06, 0.05], [0.05 + k * 0.06, 0.09]);
    bp.push([0.4, 0.04], [0.42, 0.02]);
    const bush = latheX(bp, porcelain, 20); bush.rotation.z = Math.PI / 2; bush.position.set(-0.28 + i * 0.28, 1.0, -0.05); g.add(bush);
  }
  const warn = textPlate(['DANGER', 'HIGH VOLTAGE'], 0.42, 0.22, '#111', '#f2c230'); warn.position.set(0, 0.62, 0.352); g.add(warn);
  g.userData.top = new THREE.Vector3(0, 1.44, -0.05);
  return g;
}

/** a lattice steel pylon (about 4.4 tall) with insulator strings; returns attach points on the crossarms */
export function createPylon(): THREE.Group & { userData: { attach: THREE.Vector3[] } } {
  const g = new THREE.Group() as THREE.Group & { userData: { attach: THREE.Vector3[] } };
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1a6, metalness: 0.85, roughness: 0.48, roughnessMap: M.steel().roughnessMap });
  const H = 4.4, b0 = 0.55, b1 = 0.16;
  const leg = (y: number, sx: number, sz: number) => { const k = y / H; const b = b0 + (b1 - b0) * Math.pow(k, 0.8); return new THREE.Vector3(sx * b, y, sz * b); };
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const levels = [0, 0.7, 1.35, 1.95, 2.5, 3.0, 3.45, 3.85, H];
  for (const [sx, sz] of corners) for (let i = 0; i < levels.length - 1; i++) g.add(angleBar(leg(levels[i], sx, sz), leg(levels[i + 1], sx, sz), 0.045, steel));
  for (let i = 1; i < levels.length; i++) for (let c = 0; c < 4; c++) {
    const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
    g.add(angleBar(leg(levels[i], ax, az), leg(levels[i], bx, bz), 0.025, steel));
    // cross bracing on each face
    g.add(angleBar(leg(levels[i - 1], ax, az), leg(levels[i], bx, bz), 0.02, steel));
    g.add(angleBar(leg(levels[i - 1], bx, bz), leg(levels[i], ax, az), 0.02, steel));
  }
  // two crossarms
  const attach: THREE.Vector3[] = [];
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x6fa3a0, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.85 });
  for (const y of [3.45, 4.1]) {
    const w = y > 4 ? 0.9 : 1.25;
    const t0 = leg(y, -1, 0).x, t1 = leg(y, 1, 0).x;
    for (const sz of [-1, 1]) {
      g.add(angleBar(new THREE.Vector3(-w, y, sz * 0.08), new THREE.Vector3(w, y, sz * 0.08), 0.04, steel));
      g.add(angleBar(new THREE.Vector3(-w, y, sz * 0.08), new THREE.Vector3(t0, y - 0.35, sz * 0.12), 0.025, steel));
      g.add(angleBar(new THREE.Vector3(w, y, sz * 0.08), new THREE.Vector3(t1, y - 0.35, sz * 0.12), 0.025, steel));
    }
    for (const sx of [-1, 1]) {
      // insulator string: a column of glass discs
      for (let k = 0; k < 5; k++) {
        const d = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.025, 14), glassM, false);
        d.position.set(sx * (w - 0.05), y - 0.08 - k * 0.06, 0); g.add(d);
      }
      attach.push(new THREE.Vector3(sx * (w - 0.05), y - 0.4, 0));
    }
  }
  for (const [sx, sz] of corners) { const f = mesh(rbox(0.24, 0.12, 0.24, 0.02), paint(0x8f918c, 0.85, 0)); f.position.set(sx * b0, 0.06, sz * b0); g.add(f); }
  g.userData.attach = attach;
  return g;
}

function weatherboard(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  for (let i = 0; i < 16; i++) {
    const y = i * 16;
    const gr = ctx.createLinearGradient(0, y, 0, y + 16);
    gr.addColorStop(0, '#e9e0cb'); gr.addColorStop(0.8, '#d8ccb0'); gr.addColorStop(1, '#a89c80');
    ctx.fillStyle = gr; ctx.fillRect(0, y, 256, 16);
  }
  const img = ctx.getImageData(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const n = (fbm(x * 0.05, y * 0.6, 2, 3) - 0.5) * 14; const i = (y * 256 + x) * 4; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function corrugated(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 16);
  for (let x = 0; x < 256; x++) { const v = 128 + 120 * Math.sin((x / 256) * Math.PI * 2 * 24); ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, 0, 1, 16); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** a small weatherboard cottage with a corrugated iron roof; windows glow when powered */
export function createHouse(): THREE.Group & { userData: { setLit(k: number): void; service: THREE.Vector3 } } {
  const g = new THREE.Group() as THREE.Group & { userData: { setLit(k: number): void; service: THREE.Vector3 } };
  const W = 1.6, D = 1.2, H = 0.95;
  const wb = weatherboard();
  wb.repeat.set(2, 2);
  const wallM = new THREE.MeshStandardMaterial({ map: wb, roughness: 0.75, bumpMap: wb, bumpScale: 0.4 });
  const walls = mesh(rbox(W, H, D, 0.02), wallM); walls.position.y = H / 2; g.add(walls);
  // gable roof
  const rise = 0.55;
  const tri = new THREE.Shape(); tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, rise); tri.closePath();
  const gable = mesh(new THREE.ExtrudeGeometry(tri, { depth: W - 0.02, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-(W - 0.02) / 2, H, 0), wallM); g.add(gable);
  const roofTex = corrugated(); roofTex.repeat.set(1, 1);
  const roofM = new THREE.MeshStandardMaterial({ color: 0x8c9599, metalness: 0.7, roughness: 0.42, bumpMap: roofTex, bumpScale: 1.2 });
  const slope = Math.hypot(D / 2 + 0.12, rise + 0.08);
  for (const s of [-1, 1]) {
    const r = mesh(rbox(W + 0.24, 0.035, slope, 0.01), roofM);
    r.position.set(0, H + rise / 2 + 0.03, s * (D / 4 + 0.03));
    r.rotation.x = s * Math.atan2(rise + 0.08, D / 2 + 0.12);
    g.add(r);
  }
  const ridge = mesh(new THREE.CylinderGeometry(0.04, 0.04, W + 0.24, 10).rotateZ(Math.PI / 2), roofM); ridge.position.y = H + rise + 0.04; g.add(ridge);
  // windows and door
  const winM = new THREE.MeshStandardMaterial({ color: 0x1a2430, emissive: 0xffc777, emissiveIntensity: 0, roughness: 0.2 });
  const frameM = paint(0xf4f1ea, 0.5, 0);
  for (const x of [-0.45, 0.45]) {
    const fr = mesh(rbox(0.36, 0.34, 0.04, 0.01), frameM); fr.position.set(x, 0.55, D / 2 + 0.005); g.add(fr);
    const gl = mesh(rbox(0.3, 0.28, 0.02, 0.005), winM, false); gl.position.set(x, 0.55, D / 2 + 0.02); g.add(gl);
    const mull = mesh(rbox(0.02, 0.28, 0.01, 0.002), frameM, false); mull.position.set(x, 0.55, D / 2 + 0.032); g.add(mull);
  }
  const door = mesh(rbox(0.3, 0.6, 0.04, 0.01), paint(0x2f5a7a, 0.45, 0)); door.position.set(0, 0.3, D / 2 + 0.01); g.add(door);
  const step = mesh(rbox(0.5, 0.06, 0.2, 0.01), paint(0x9a958c, 0.9, 0)); step.position.set(0, 0.03, D / 2 + 0.1); g.add(step);
  // service pole and meter box
  const pole = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 10), paint(0x6a5a48, 0.8, 0)); pole.position.set(W / 2 - 0.15, H + 0.45 + 0.2, -D / 2 + 0.2); g.add(pole);
  g.userData = {
    service: new THREE.Vector3(W / 2 - 0.15, H + 1.1, -D / 2 + 0.2),
    setLit(k) { winM.emissiveIntensity = 1.4 * k; },
  };
  return g;
}

/** a sagging overhead conductor between two points (catenary-ish) */
export function wireBetween(a: THREE.Vector3, b: THREE.Vector3, sag: number, r = 0.012, mat: THREE.Material = M.darkSteel()): { mesh: THREE.Mesh; pts: THREE.Vector3[] } {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) { const k = i / 16; const p = a.clone().lerp(b, k); p.y -= sag * 4 * k * (1 - k); pts.push(p); }
  return { mesh: mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, r, 6), mat, false), pts };
}
