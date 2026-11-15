// Station 7 machines: one stylised cutaway power station per source, each built round the same generator.
// Local frame = the turntable at rest: centre at the origin, deck at y = 0, the viewer looks from +z.
import * as THREE from 'three';
import * as M from '../../kit/materials';
import { mesh, rbox } from '../../kit/parts/common';
import type { SourceId } from './logic';
import {
  createGenerator, cutShell, flame, ghostGenerator, glow, latheX, paint, plume, rotorStage, strut, textPlate,
  type Flame, type Generator,
} from './parts';

export interface RoutePoint { p: THREE.Vector3; step: number }

export interface Machine {
  id: SourceId;
  group: THREE.Group;
  /** one point per chain step (labels are pinned here) */
  anchors: THREE.Vector3[];
  /** packet routes from the energy store to the deck socket; each vertex starts a segment in chain step `step` */
  routes: RoutePoint[][];
  /** per-frame animation (spin rotors, flicker flames) */
  tick(dt: number, t: number, cam: THREE.Camera): void;
  /** objects that count as "the generator" for tapping */
  generator: THREE.Object3D | null;
  /** extra callouts, e.g. what is missing */
  notes: { pos: THREE.Vector3; text: string }[];
  view: { target: [number, number, number]; distance: number; pitch: number; yaw: number };
  /** the one shared point light is moved here (fire glow); null = off. Kept to one light so switching never recompiles shaders. */
  lamp: { pos: THREE.Vector3; colour: number; intensity(t: number): number } | null;
}

/** where the generator sits on the turntable for coal, gas and hydro */
export const GEN_POS = new THREE.Vector3(1.55, 1.0, 0);
/** the socket at the deck edge where the output cable leaves the turntable */
export const DECK_OUT = new THREE.Vector3(3.95, 0.05, -1.25);

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const R = (step: number, ...pts: [number, number, number][]): RoutePoint[] => pts.map((p) => ({ p: V(...p), step }));

function concrete(): THREE.MeshStandardMaterial { return paint(0xa9a69d, 0.88, 0) as unknown as THREE.MeshStandardMaterial; }

/** insulated cable lying from a point on the machine to the deck socket */
function outCable(from: THREE.Vector3, via: THREE.Vector3[] = []): THREE.Mesh {
  const pts = [from, ...via, V(DECK_OUT.x - 0.3, 0.06, DECK_OUT.z), DECK_OUT.clone()];
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3), 64, 0.045, 8), M.insulation('black'));
}

/** generator on its concrete plinth, with the output route from its centre to the deck socket */
function placeGenerator(g: THREE.Group, scale = 1, pos = GEN_POS): { gen: Generator; out: RoutePoint[] } {
  const gen = createGenerator();
  gen.position.copy(pos); gen.scale.setScalar(scale);
  g.add(gen);
  const term = gen.userData.terminal.clone().multiplyScalar(scale).add(pos);
  return { gen, out: [{ p: pos.clone(), step: -1 }, { p: term, step: -1 }] };
}

function plinth(x0: number, x1: number, h: number, d: number): THREE.Mesh {
  const m = mesh(rbox(x1 - x0, h, d, 0.04, 2), concrete());
  m.position.set((x0 + x1) / 2, h / 2, 0);
  return m;
}

function pipeAlong(pts: THREE.Vector3[], r: number, mat: THREE.Material, flanges = 0): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
  g.add(mesh(new THREE.TubeGeometry(curve, 64, r, 16), mat));
  for (let i = 1; i <= flanges; i++) {
    const k = i / (flanges + 1);
    const f = mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.18, r * 0.35, 20), M.darkSteel());
    f.position.copy(curve.getPointAt(k));
    f.quaternion.setFromUnitVectors(V(0, 1, 0), curve.getTangentAt(k));
    g.add(f);
  }
  return g;
}

/** steel coupling between two shafts */
function coupling(x: number, y: number): THREE.Mesh {
  const m = latheX([[-0.08, 0.075], [-0.08, 0.16], [0.08, 0.16], [0.08, 0.075]], M.darkSteel(), 24);
  m.position.set(x, y, 0);
  return m;
}

// ───────────── coal ─────────────

function coalLumps(n: number, cx: number, cz: number, rad: number, peak: number): THREE.InstancedMesh {
  const geo = new THREE.DodecahedronGeometry(0.075, 0);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const k = 0.75 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x141414, roughness: 0.38, metalness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const im = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, rr = Math.sqrt(i / n) * rad;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    const y = Math.max(0.03, peak * (1 - rr / rad) + 0.03 * Math.sin(i * 1.7));
    e.set(i * 0.7, i * 1.3, i * 0.37); q.setFromEuler(e); s.setScalar(0.8 + (i % 5) * 0.12);
    m.compose(V(x, y, z), q, s);
    im.setMatrixAt(i, m);
  }
  im.castShadow = true; im.receiveShadow = true;
  return im;
}

function buildCoal(): Machine {
  const g = new THREE.Group();
  const flames: Flame[] = [];
  const spinners: THREE.Object3D[] = [];
  g.add(plinth(-1.7, 2.75, 0.24, 1.6));
  const { gen, out } = placeGenerator(g);
  spinners.push(gen.userData.rotor);
  // steam turbine: cutaway casing growing towards the low-pressure end, bladed rotor inside
  const tx = -0.65;
  const casing = cutShell([[-0.85, 0.3], [-0.7, 0.38], [-0.4, 0.44], [-0.05, 0.52], [0.35, 0.6], [0.55, 0.6], [0.7, 0.36]], 0.05, paint(0x8a9198, 0.36, 0.7));
  casing.position.set(tx, 1.0, 0); g.add(casing);
  const trotor = new THREE.Group(); trotor.position.set(tx, 1.0, 0);
  const blade = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 1, roughness: 0.28 });
  const disc = M.steel();
  [[-0.6, 0.16, 0.3], [-0.4, 0.17, 0.36], [-0.18, 0.18, 0.42], [0.05, 0.19, 0.48], [0.28, 0.2, 0.54], [0.48, 0.21, 0.56]].forEach(([x, h, tip], i) => trotor.add(rotorStage(x, h, tip, 22 + i * 2, 0.07, blade, disc)));
  trotor.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.75, 20).rotateZ(Math.PI / 2).translate(0.2, 0, 0), M.steel()));
  g.add(trotor); spinners.push(trotor);
  g.add(coupling(0.35, 1.0));
  for (const x of [-1.45, 0.1]) { const ped = mesh(rbox(0.22, 0.6, 0.5, 0.03), paint(0x2c3136, 0.5, 0.5)); ped.position.set(x, 0.5, 0); g.add(ped); }
  // condenser under the exhaust end
  const cond = mesh(rbox(0.9, 0.36, 0.9, 0.05), paint(0x58616a, 0.5, 0.5)); cond.position.set(-0.4, 0.42, 0.0); g.add(cond);
  // boiler: steel frame, casing with the front cut away, water-wall tubes and a fire
  const bx = -3.0, bz = -0.2, BW = 1.4, BH = 2.9, BD = 1.3;
  const casingM = paint(0x5d6f7e, 0.45, 0.45);
  const back = mesh(rbox(BW, BH, 0.06, 0.02), casingM); back.position.set(bx, BH / 2, bz - BD / 2); g.add(back);
  for (const s of [-1, 1]) { const side = mesh(rbox(0.06, BH, BD, 0.02), casingM); side.position.set(bx + s * BW / 2, BH / 2, bz); g.add(side); }
  const roof = mesh(rbox(BW + 0.06, 0.08, BD + 0.06, 0.02), casingM); roof.position.set(bx, BH, bz); g.add(roof);
  // upper front panel stays, the lower front is cut away to show the furnace
  const front = mesh(rbox(BW, 1.0, 0.06, 0.02), casingM); front.position.set(bx, BH - 0.5, bz + BD / 2); g.add(front);
  const cut = mesh(rbox(BW, 0.05, 0.08, 0.01), new THREE.MeshStandardMaterial({ color: 0xd9542b, roughness: 0.6 })); cut.position.set(bx, BH - 1.02, bz + BD / 2); g.add(cut);
  // refractory floor and firebrick lining
  const brick = new THREE.MeshStandardMaterial({ color: 0x8a3b22, roughness: 0.9, emissive: 0x611a08, emissiveIntensity: 0.6 });
  const floor = mesh(rbox(BW - 0.1, 0.12, BD - 0.1, 0.02), brick); floor.position.set(bx, 0.06, bz); g.add(floor);
  // water-wall tubes along the back and sides (instanced)
  const tubeGeo = new THREE.CylinderGeometry(0.03, 0.03, BH - 1.2, 10);
  const tubeM = new THREE.MeshStandardMaterial({ color: 0x6b6f73, metalness: 0.9, roughness: 0.42, emissive: 0x3a1004, emissiveIntensity: 0.5 });
  const nT = 22 + 14 * 2;
  const tubes = new THREE.InstancedMesh(tubeGeo, tubeM, nT);
  const mtx = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < 22; i++) { mtx.makeTranslation(bx - BW / 2 + 0.1 + i * ((BW - 0.2) / 21), 0.12 + (BH - 1.2) / 2, bz - BD / 2 + 0.07); tubes.setMatrixAt(k++, mtx); }
  for (const s of [-1, 1]) for (let i = 0; i < 14; i++) { mtx.makeTranslation(bx + s * (BW / 2 - 0.07), 0.12 + (BH - 1.2) / 2, bz - BD / 2 + 0.14 + i * ((BD - 0.28) / 13)); tubes.setMatrixAt(k++, mtx); }
  g.add(tubes);
  // headers top and bottom
  for (const y of [0.16, BH - 1.05]) { const hd = mesh(new THREE.CylinderGeometry(0.07, 0.07, BW - 0.1, 14).rotateZ(Math.PI / 2), M.darkSteel()); hd.position.set(bx, y, bz - BD / 2 + 0.08); g.add(hd); }
  for (let i = 0; i < 3; i++) { const f = flame(0.55, 0.9 + i * 0.12, 0xfff1b0, 0xff4a0a, i * 3.1); f.position.set(bx - 0.35 + i * 0.35, 0.12, bz + 0.05); g.add(f); flames.push(f); }
  const fireGlow = glow(0xff7a2a, 2.2, 0.75); fireGlow.position.set(bx, 0.7, bz + 0.2); g.add(fireGlow);
  // steam drum across the top
  const drum = mesh(new THREE.CylinderGeometry(0.26, 0.26, BD + 0.3, 24).rotateX(Math.PI / 2), paint(0x9aa2a8, 0.32, 0.8)); drum.position.set(bx, BH + 0.32, bz); g.add(drum);
  for (const s of [-1, 1]) { const cap = mesh(new THREE.SphereGeometry(0.26, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(s * Math.PI / 2), paint(0x9aa2a8, 0.32, 0.8)); cap.position.set(bx, BH + 0.32, bz + s * (BD + 0.3) / 2); g.add(cap); }
  // insulated steam pipe with cladding bands, drum to turbine inlet
  const clad = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: 0.9, roughness: 0.3, roughnessMap: M.steel().roughnessMap });
  g.add(pipeAlong([V(bx + 0.2, BH + 0.52, bz), V(bx + 0.6, BH + 0.7, bz + 0.1), V(-2.0, BH + 0.6, 0.15), V(-1.65, 2.0, 0.1), V(-1.45, 1.42, 0.05), V(-1.35, 1.32, 0)], 0.11, clad, 5));
  // coal pile, hopper and feed chute
  g.add(coalLumps(190, -3.35, 1.45, 0.62, 0.5));
  const hopper = latheX([[-0.35, 0.08], [0.0, 0.32], [0.18, 0.34]], paint(0x4b4f52, 0.5, 0.6), 20);
  hopper.rotation.z = -Math.PI / 2; hopper.position.set(-2.55, 0.85, 0.75); g.add(hopper);
  g.add(strut(V(-2.55, 0.55, 0.75), V(-2.75, 0.32, 0.55), 0.06, paint(0x4b4f52, 0.5, 0.6)));
  for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(strut(V(-2.55 + dx, 0, 0.75 + dz), V(-2.55 + dx * 0.6, 0.6, 0.75 + dz * 0.6), 0.02, M.darkSteel()));
  // conveyor from the pile up to the hopper
  const belt = mesh(rbox(1.0, 0.04, 0.22, 0.01), M.rubber(0x1a1a1a)); belt.position.set(-2.95, 0.68, 1.1); belt.rotation.set(0, 0.75, 0.45); g.add(belt);
  // chimney and flue
  const stackM = paint(0xb8b2a6, 0.8, 0);
  const stack = latheX([[0, 0.3], [3.9, 0.2], [4.0, 0.22]], stackM, 28); stack.rotation.z = Math.PI / 2; stack.position.set(-3.65, 0, -1.55); g.add(stack);
  for (const y of [3.5, 3.75]) { const band = mesh(new THREE.CylinderGeometry(0.215, 0.22, 0.12, 24), paint(0xb8332b, 0.6, 0)); band.position.set(-3.65, y, -1.55); g.add(band); }
  g.add(pipeAlong([V(bx - 0.2, BH + 0.05, bz - 0.4), V(-3.4, BH + 0.3, -1.0), V(-3.6, 2.4, -1.45)], 0.14, paint(0x5d6f7e, 0.45, 0.45)));
  const smoke = plume(0x8b8780, 12, 2.2, 0.6, 0.7, 0.4); smoke.position.set(-3.65, 4.05, -1.55); g.add(smoke);
  g.add(outCable(V(gen.position.x + 0.36, 1.74, -0.45), [V(2.4, 1.2, -0.75), V(2.8, 0.06, -1.0)]));
  return {
    id: 'coal', group: g, generator: gen,
    anchors: [V(-3.35, 0.65, 1.45), V(bx, 1.05, bz + 0.6), V(tx - 0.35, 1.75, 0.3), GEN_POS.clone().add(V(0.25, 0.95, 0))],
    routes: [[
      ...R(0, [-3.35, 0.55, 1.45], [-3.0, 0.62, 1.15], [-2.6, 1.1, 0.8], [-2.62, 0.6, 0.62]),
      ...R(1, [-2.85, 0.5, 0.25], [bx, 0.75, bz + 0.1], [bx + 0.1, 1.6, bz - 0.2], [bx, BH + 0.32, bz], [bx + 0.6, BH + 0.7, bz + 0.1], [-2.0, BH + 0.6, 0.15], [-1.65, 2.0, 0.1], [-1.42, 1.38, 0.05]),
      ...R(2, [-1.3, 1.0, 0], [0.35, 1.0, 0]),
      ...R(3, ...[GEN_POS.toArray() as [number, number, number]]),
      ...out.slice(1).map((o) => ({ p: o.p, step: 3 })),
    ]],
    notes: [],
    tick(dt, t, cam) {
      for (const s of spinners) s.rotation.x -= dt * 5;
      for (const f of flames) f.userData.tick(t, cam);
      fireGlow.material.opacity = 0.65 + Math.sin(t * 9) * 0.08;
      smoke.userData.tick(dt);
    },
    view: { target: [-0.6, 1.5, 0], distance: 11.5, pitch: 0.36, yaw: 0.18 },
    lamp: { pos: V(bx, 0.8, bz + 0.5), colour: 0xff7a30, intensity: (t) => 3.6 + Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3) * 0.4 },
  };
}

// ───────────── gas ─────────────

function buildGas(): Machine {
  const g = new THREE.Group();
  const flames: Flame[] = [];
  const spinners: THREE.Object3D[] = [];
  g.add(plinth(-3.5, 2.75, 0.24, 1.6));
  const { gen, out } = placeGenerator(g);
  spinners.push(gen.userData.rotor);
  // casing: intake (right) → compressor → combustors → turbine → exhaust diffuser (left)
  const caseM = paint(0xb7bcc1, 0.32, 0.75);
  const prof: [number, number][] = [[0.25, 0.3], [0.1, 0.46], [-0.1, 0.44], [-0.9, 0.34], [-1.0, 0.42], [-1.15, 0.6], [-1.45, 0.6], [-1.55, 0.46], [-2.3, 0.56], [-2.9, 0.7], [-3.15, 0.7]];
  const shell = cutShell(prof, 0.045, caseM); shell.position.y = 1.0; g.add(shell);
  const rot = new THREE.Group(); rot.position.y = 1.0;
  const compBlade = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.3 });
  const hotBlade = new THREE.MeshStandardMaterial({ color: 0x9c8a7a, metalness: 0.9, roughness: 0.38, emissive: 0xff5a1a, emissiveIntensity: 0.35 });
  for (let i = 0; i < 9; i++) { const x = -0.02 - i * 0.095; rot.add(rotorStage(x, 0.17 + i * 0.006, 0.4 - i * 0.012, 30, 0.045, compBlade, M.steel())); }
  for (let i = 0; i < 3; i++) rot.add(rotorStage(-1.68 - i * 0.22, 0.24, 0.45 + i * 0.03, 24, 0.08, hotBlade, M.darkSteel()));
  rot.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.9, 20).rotateZ(Math.PI / 2).translate(-1.0, 0, 0), M.steel()));
  g.add(rot); spinners.push(rot);
  g.add(coupling(0.38, 1.0));
  // combustion chamber: a ring of cans with flames, glowing
  const canM = paint(0x8c7f72, 0.4, 0.8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const can = latheX([[-0.22, 0.03], [-0.18, 0.075], [0.18, 0.075], [0.22, 0.05]], canM, 16);
    can.position.set(-1.3, 1.0 + Math.cos(a) * 0.42, Math.sin(a) * 0.42); g.add(can);
  }
  for (let i = 0; i < 3; i++) { const f = flame(0.32, 0.5, 0xd8ecff, 0xff7a1a, i * 2.3); f.position.set(-1.42 + i * 0.12, 0.78, 0.25); f.rotation.z = Math.PI / 2; g.add(f); flames.push(f); }
  const cGlow = glow(0xff8a3a, 1.6, 0.8); cGlow.position.set(-1.3, 1.0, 0.35); g.add(cGlow);
  const tGlow = glow(0xff5a1a, 1.3, 0.45); tGlow.position.set(-1.9, 1.0, 0.25); g.add(tGlow);
  // supports
  for (const x of [-2.7, -1.3, 0.05]) { const ped = mesh(rbox(0.22, 0.4, 0.6, 0.03), paint(0x2c3136, 0.5, 0.5)); ped.position.set(x, 0.42, 0); g.add(ped); }
  // air intake: filter house above the compressor with a duct down to the bellmouth
  const filt = mesh(rbox(1.1, 0.7, 1.0, 0.04), paint(0x7d8a92, 0.5, 0.4)); filt.position.set(0.0, 2.75, -0.2); g.add(filt);
  for (let i = 0; i < 6; i++) { const louvre = mesh(rbox(1.0, 0.03, 0.06, 0.01), M.darkSteel()); louvre.position.set(0.0, 2.5 + i * 0.09, 0.32); louvre.rotation.x = 0.5; g.add(louvre); }
  const duct = mesh(rbox(0.6, 1.0, 0.6, 0.03), paint(0x7d8a92, 0.5, 0.4)); duct.position.set(0.12, 1.95, -0.2); g.add(duct);
  // exhaust stack at the far left, with heat shimmer
  const stack = latheX([[0, 0.5], [0.6, 0.45], [3.3, 0.4], [3.4, 0.42]], paint(0x6e7378, 0.55, 0.5), 28); stack.rotation.z = Math.PI / 2; stack.position.set(-3.75, 0, -0.2); g.add(stack);
  g.add(pipeAlong([V(-3.1, 1.0, 0), V(-3.5, 1.0, -0.1)], 0.6, paint(0x6e7378, 0.55, 0.5)));
  const shimmer = plume(0xffb27a, 10, 1.6, 0.4, 0.5, 0.13, true); shimmer.position.set(-3.75, 3.45, -0.2); g.add(shimmer);
  // gas supply: yellow pipe from a metering skid, a valve, and a manifold round the combustors
  const yellow = paint(0xe2b21a, 0.4, 0.2);
  const skid = mesh(rbox(0.8, 0.2, 0.6, 0.03), paint(0x3a3f44, 0.5, 0.4)); skid.position.set(-1.3, 0.1, -2.55); g.add(skid);
  const meterBody = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 20).rotateZ(Math.PI / 2), yellow); meterBody.position.set(-1.3, 0.42, -2.55); g.add(meterBody);
  g.add(pipeAlong([V(-1.75, 0.42, -2.55), V(-1.3, 0.42, -2.55), V(-1.3, 0.42, -1.6), V(-1.3, 0.55, -0.95), V(-1.3, 0.88, -0.62)], 0.06, yellow, 2));
  const valve = new THREE.Group();
  valve.add(mesh(new THREE.TorusGeometry(0.14, 0.018, 8, 24), M.darkSteel()));
  for (let i = 0; i < 3; i++) { const sp = mesh(rbox(0.26, 0.02, 0.02, 0.005), M.darkSteel()); sp.rotation.z = (i / 3) * Math.PI; valve.add(sp); }
  valve.rotation.y = Math.PI / 2; valve.position.set(-1.1, 0.68, -1.75); g.add(valve);
  g.add(strut(V(-1.3, 0.48, -1.75), V(-1.12, 0.68, -1.75), 0.02, M.darkSteel()));
  const ring = mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 40).rotateY(Math.PI / 2), yellow); ring.position.set(-1.3, 1.0, 0); g.add(ring);
  const tag = textPlate(['NATURAL GAS'], 0.6, 0.12, '#1a1a1a', '#e2b21a'); tag.position.set(-1.3, 0.42, -2.34); g.add(tag);
  g.add(outCable(V(gen.position.x + 0.36, 1.74, -0.45), [V(2.4, 1.2, -0.75), V(2.8, 0.06, -1.0)]));
  return {
    id: 'gas', group: g, generator: gen,
    anchors: [V(-1.3, 0.75, -2.55), V(-1.0, 2.05, 0.3), V(-2.35, 1.7, 0.45), GEN_POS.clone().add(V(0.25, 0.95, 0))],
    routes: [[
      ...R(0, [-1.75, 0.42, -2.55], [-1.3, 0.42, -2.55], [-1.3, 0.42, -1.6], [-1.3, 0.55, -0.95]),
      ...R(1, [-1.3, 0.88, -0.6], [-1.3, 1.0, -0.2], [-1.5, 1.0, 0]),
      ...R(2, [-1.7, 1.0, 0], [-1.95, 1.0, 0], [0.38, 1.0, 0]),
      ...R(3, GEN_POS.toArray() as [number, number, number]),
      ...out.slice(1).map((o) => ({ p: o.p, step: 3 })),
    ]],
    notes: [{ pos: V(-3.75, 4.1, -0.2), text: 'No boiler and no steam: hot gas spins the turbine' }],
    tick(dt, t, cam) {
      for (const s of spinners) s.rotation.x -= dt * 7;
      for (const f of flames) f.userData.tick(t, cam);
      cGlow.material.opacity = 0.7 + Math.sin(t * 11) * 0.1;
      shimmer.userData.tick(dt);
    },
    view: { target: [-0.6, 1.4, -0.3], distance: 11, pitch: 0.36, yaw: 0.16 },
    lamp: { pos: V(-1.3, 1.1, 0.8), colour: 0xff8a3a, intensity: (t) => 2.6 + Math.sin(t * 15) * 0.4 },
  };
}

// ───────────── hydro ─────────────

function waterMaterial(opacity = 0.78): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: 0x2c7fa8, roughness: 0.06, metalness: 0, transparent: true, opacity, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false });
}

function buildHydro(): Machine {
  const g = new THREE.Group();
  const spinners: THREE.Object3D[] = [];
  g.add(plinth(-0.95, 2.75, 0.24, 1.6));
  const { gen, out } = placeGenerator(g);
  spinners.push(gen.userData.rotor);
  // dam: a concrete gravity wall, curved slightly, with a walkway and rails
  const con = concrete();
  const prof = new THREE.Shape();
  prof.moveTo(-3.05, 0); prof.lineTo(-1.95, 0); prof.lineTo(-2.75, 3.2); prof.lineTo(-3.05, 3.2); prof.closePath();
  const damGeo = new THREE.ExtrudeGeometry(prof, { depth: 3.4, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  damGeo.translate(0, 0, -1.7);
  const dam = mesh(damGeo, con); g.add(dam);
  for (let i = 0; i < 9; i++) { const post = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), M.steel(), false); post.position.set(-2.78, 3.33, -1.6 + i * 0.4); g.add(post); }
  const rail = mesh(new THREE.CylinderGeometry(0.012, 0.012, 3.3, 6).rotateX(Math.PI / 2), M.steel(), false); rail.position.set(-2.78, 3.43, 0); g.add(rail);
  // the reservoir behind the dam (a cut slice of the lake)
  const water = mesh(rbox(1.1, 2.9, 3.3, 0.02), waterMaterial(0.72), false); water.position.set(-3.6, 1.45, 0); water.renderOrder = 3; g.add(water);
  const bed = mesh(rbox(1.15, 0.1, 3.35, 0.02), paint(0x5b5246, 0.95, 0)); bed.position.set(-3.6, 0.05, 0); g.add(bed);
  // intake gate on the upstream face
  const gate = mesh(rbox(0.06, 0.6, 0.6, 0.02), paint(0x3b4650, 0.5, 0.6)); gate.position.set(-3.08, 1.3, -0.9); g.add(gate);
  // penstock: from the intake down to the turbine casing, painted steel with flanges
  const pen = paint(0x2f3d36, 0.45, 0.55);
  const penPts = [V(-2.6, 1.32, -0.9), V(-1.9, 1.3, -0.95), V(-1.2, 1.15, -0.95), V(-0.55, 1.08, -0.7), V(-0.35, 1.05, -0.45)];
  g.add(pipeAlong(penPts, 0.2, pen, 4));
  // turbine casing (cutaway) and Francis runner
  const tx = -0.3;
  const casing = cutShell([[-0.45, 0.25], [-0.38, 0.55], [-0.15, 0.68], [0.15, 0.62], [0.3, 0.42], [0.38, 0.2]], 0.06, paint(0x2f3d36, 0.45, 0.55));
  casing.position.set(tx, 1.0, 0); g.add(casing);
  const runner = new THREE.Group(); runner.position.set(tx, 1.0, 0);
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb98a4a, metalness: 1, roughness: 0.3 });
  runner.add(latheX([[0.18, 0.08], [0.18, 0.5], [0.12, 0.52], [0.05, 0.3], [0.0, 0.1]], bronze, 32));
  runner.add(latheX([[-0.2, 0.42], [-0.12, 0.5], [0.0, 0.52]], bronze, 32));
  const fb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.02).translate(0, 0.32, 0), bronze, 13);
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 13; i++) { q.setFromEuler(new THREE.Euler((i / 13) * Math.PI * 2, 0.5, 0.25, 'XYZ')); mm.makeRotationFromQuaternion(q); fb.setMatrixAt(i, mm); }
  runner.add(fb);
  runner.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.2, 20).rotateZ(Math.PI / 2).translate(0.4, 0, 0), M.steel()));
  g.add(runner); spinners.push(runner);
  g.add(coupling(0.38, 1.0));
  // draft tube out of the left of the casing, down into the tailrace pool
  g.add(pipeAlong([V(-0.75, 1.0, 0), V(-1.05, 0.95, 0.05), V(-1.35, 0.6, 0.25), V(-1.45, 0.3, 0.45)], 0.24, pen));
  const basin = mesh(rbox(1.2, 0.3, 1.1, 0.04), con); basin.position.set(-1.45, 0.15, 0.75); g.add(basin);
  const tail = mesh(rbox(1.05, 0.04, 0.95, 0.02), waterMaterial(0.85), false); tail.position.set(-1.45, 0.29, 0.75); g.add(tail);
  const foam = plume(0xe8f4ff, 8, 0.35, 0.5, 0.25, 0.35); foam.position.set(-1.45, 0.32, 0.55); g.add(foam);
  for (const x of [-0.3]) { const ped = mesh(rbox(0.5, 0.42, 0.7, 0.03), con); ped.position.set(x, 0.43, 0); g.add(ped); }
  g.add(outCable(V(gen.position.x + 0.36, 1.74, -0.45), [V(2.4, 1.2, -0.75), V(2.8, 0.06, -1.0)]));
  return {
    id: 'hydro', group: g, generator: gen,
    anchors: [V(-3.6, 3.15, 0.5), V(tx - 0.75, 0.55, 0.9), GEN_POS.clone().add(V(0.25, 0.95, 0))],
    routes: [[
      ...R(0, [-3.6, 2.7, 0.5], [-3.4, 1.8, -0.4], [-3.1, 1.32, -0.9], ...penPts.map((p) => p.toArray() as [number, number, number])),
      ...R(1, [tx, 1.0, -0.2], [tx, 1.0, 0], [0.38, 1.0, 0]),
      ...R(2, GEN_POS.toArray() as [number, number, number]),
      ...out.slice(1).map((o) => ({ p: o.p, step: 2 })),
    ]],
    notes: [{ pos: V(-1.3, 2.4, 0.3), text: 'No fuel and no heat step: falling water spins the turbine' }],
    tick(dt) {
      for (const s of spinners) s.rotation.x -= dt * 4;
      foam.userData.tick(dt);
    },
    view: { target: [-0.7, 1.5, 0], distance: 11.5, pitch: 0.36, yaw: 0.2 },
    lamp: null,
  };
}

// ───────────── wind ─────────────

/** a tapered, twisted wind-turbine blade along +y (root at the origin) */
function windBlade(len: number, root: number, tip: number): THREE.BufferGeometry {
  const secs = 14, ring = 12;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= secs; i++) {
    const k = i / secs, y = k * len;
    // chord peaks a little way out from the root, then tapers to the tip
    const chord = k < 0.18 ? root * (0.55 + 0.45 * (k / 0.18)) : root + (tip - root) * ((k - 0.18) / 0.82);
    const th = chord * (k < 0.12 ? 0.55 : 0.16);
    const tw = 0.9 * (1 - k);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      // a teardrop airfoil: round leading edge (+x), sharp trailing edge
      const cx = Math.cos(a), sx = Math.sin(a);
      const x = (cx > 0 ? cx * 0.35 : cx * 0.65) * chord;
      const z = sx * th * (cx > 0 ? 1 : (1 + cx) * 0.9 + 0.1);
      pos.push(x * Math.cos(tw) - z * Math.sin(tw), y, x * Math.sin(tw) + z * Math.cos(tw));
    }
  }
  for (let i = 0; i < secs; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildWind(): Machine {
  const g = new THREE.Group();
  const white = paint(0xeef0f0, 0.38, 0.1);
  const TX = -0.4, TOP = 3.7;
  const found = mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.18, 32), concrete()); found.position.set(TX, 0.09, 0); g.add(found);
  const tower = latheX([[0, 0.27], [TOP, 0.15]], white, 32); tower.rotation.z = Math.PI / 2; tower.position.set(TX, 0.18, 0); g.add(tower);
  const door = mesh(rbox(0.04, 0.4, 0.22, 0.01), paint(0xc9ccce, 0.4, 0.2)); door.position.set(TX + 0.0, 0.45, 0.26); door.rotation.y = Math.PI / 2; g.add(door);
  // nacelle: cutaway cover along x, the rotor facing into the wind (−x)
  const NY = TOP + 0.4;
  const nac = cutShell([[-0.75, 0.2], [-0.65, 0.36], [0.55, 0.38], [0.85, 0.3], [0.9, 0.12]], 0.04, white, 40);
  nac.position.set(TX + 0.15, NY, 0); g.add(nac);
  const bed = mesh(rbox(1.5, 0.08, 0.5, 0.02), paint(0x5b6168, 0.5, 0.6)); bed.position.set(TX + 0.15, NY - 0.3, 0); g.add(bed);
  // main shaft, gearbox, high-speed shaft, generator (the same generator, smaller)
  const hub = new THREE.Group(); hub.position.set(TX - 0.85, NY, 0);
  hub.add(latheX([[-0.38, 0.02], [-0.32, 0.12], [-0.15, 0.22], [0.08, 0.25], [0.12, 0.2]], white, 32));
  hub.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 16).rotateZ(Math.PI / 2).translate(0.55, 0, 0), M.steel()));
  const bladeGeo = windBlade(1.85, 0.32, 0.07);
  for (let i = 0; i < 3; i++) {
    const b = mesh(bladeGeo, white);
    const holder = new THREE.Group(); holder.rotation.x = (i / 3) * Math.PI * 2;
    b.position.y = 0.12; b.rotation.y = 0.15;
    holder.add(b); hub.add(holder);
  }
  g.add(hub);
  const gb = new THREE.Group(); gb.position.set(TX - 0.05, NY - 0.02, 0);
  gb.add(mesh(rbox(0.42, 0.44, 0.46, 0.05, 2), paint(0x7b8288, 0.42, 0.6)));
  const gear = new THREE.Group(); gear.position.set(0, 0.0, 0.25);
  const gearM = new THREE.MeshStandardMaterial({ color: 0xb7b9bb, metalness: 1, roughness: 0.3 });
  gear.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 32).rotateX(Math.PI / 2), gearM));
  for (let i = 0; i < 24; i++) { const tooth = mesh(rbox(0.025, 0.04, 0.03, 0.004), gearM, false); const a = (i / 24) * Math.PI * 2; tooth.position.set(Math.cos(a) * 0.185, Math.sin(a) * 0.185, 0); tooth.rotation.z = a; gear.add(tooth); }
  gb.add(gear);
  const pinion = new THREE.Group(); pinion.position.set(0.0, 0.215, 0.25);
  pinion.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.032, 16).rotateX(Math.PI / 2), gearM));
  for (let i = 0; i < 9; i++) { const tooth = mesh(rbox(0.02, 0.03, 0.03, 0.004), gearM, false); const a = (i / 9) * Math.PI * 2; tooth.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0); tooth.rotation.z = a; pinion.add(tooth); }
  gb.add(pinion);
  g.add(gb);
  const genPos = V(TX + 0.55, NY + 0.02, 0);
  const { gen } = placeGenerator(g, 0.3, genPos);
  const hss = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12).rotateZ(Math.PI / 2), M.steel()); hss.position.set(TX + 0.22, NY + 0.0, 0); g.add(hss);
  const gbLabel = textPlate(['GEARBOX'], 0.36, 0.07, '#f2efe6'); gbLabel.position.set(TX - 0.05, NY + 0.15, 0.235); g.add(gbLabel);
  // cable down the inside of the tower and out across the deck
  g.add(outCable(V(TX + 0.2, 0.3, 0.1), [V(TX + 1.2, 0.06, -0.3), V(2.6, 0.06, -0.9)]));
  // wind streams in from the left at the height of the rotor
  const routes: RoutePoint[][] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3, rr = 0.5 + (i % 2) * 0.5;
    const y = NY + Math.cos(a) * rr, z = Math.sin(a) * rr;
    routes.push([
      ...R(0, [-4.6, y, z], [-2.6, y, z]),
      ...R(1, [TX - 0.95, y * 0.4 + NY * 0.6, z * 0.4], [TX - 0.85, NY, 0], [TX - 0.05, NY, 0]),
      ...R(2, genPos.toArray() as [number, number, number], [TX + 0.2, NY - 0.25, 0.0], [TX + 0.2, 0.3, 0.1], [TX + 1.2, 0.06, -0.3], [2.6, 0.06, -0.9]),
    ]);
  }
  return {
    id: 'wind', group: g, generator: gen,
    anchors: [V(-3.2, NY + 1.0, 0), V(TX - 1.0, NY - 1.25, 0.6), V(genPos.x + 0.3, NY + 0.55, 0)],
    routes,
    notes: [{ pos: V(TX + 1.6, 2.3, 0.4), text: 'No fuel and no heat step: moving air spins the blades' }],
    tick(dt) {
      hub.rotation.x -= dt * 1.3;
      gear.rotation.z -= dt * 1.3;
      pinion.rotation.z += dt * 1.3 * 3.4;
      gen.userData.rotor.rotation.x -= dt * 9;
    },
    view: { target: [-0.4, 2.6, 0], distance: 12.5, pitch: 0.24, yaw: 0.22 },
    lamp: null,
  };
}

// ───────────── solar ─────────────

function cellTexture(): THREE.CanvasTexture {
  const W = 512, H = 768;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e8ecef'; ctx.fillRect(0, 0, W, H);
  const cols = 6, rows = 10, gap = 6, m = 10;
  const cw = (W - 2 * m - (cols - 1) * gap) / cols, ch = (H - 2 * m - (rows - 1) * gap) / rows;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const x = m + q * (cw + gap), y = m + r * (ch + gap);
    const gr = ctx.createLinearGradient(x, y, x + cw, y + ch);
    gr.addColorStop(0, '#16264a'); gr.addColorStop(0.5, '#1d3466'); gr.addColorStop(1, '#122041');
    ctx.fillStyle = gr; ctx.fillRect(x, y, cw, ch);
    // fine fingers and two busbars
    ctx.fillStyle = 'rgba(200,210,225,0.25)';
    for (let k = 1; k < 14; k++) ctx.fillRect(x, y + (k * ch) / 14, cw, 0.8);
    ctx.fillStyle = 'rgba(225,230,238,0.85)';
    ctx.fillRect(x + cw * 0.3, y, 2.2, ch); ctx.fillRect(x + cw * 0.7, y, 2.2, ch);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function buildSolar(): Machine {
  const g = new THREE.Group();
  const tex = cellTexture();
  const cellM = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 1, roughness: 0.3, roughnessMap: M.steel().roughnessMap });
  const PW = 0.95, PH = 1.45, tilt = 0.55;
  const panels: THREE.Vector3[] = [];
  for (let r = 0; r < 2; r++) for (let q = 0; q < 4; q++) {
    const x = -3.05 + q * 1.05, z = -1.0 + r * 1.75, y = 0.62;
    const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.x = -Math.PI / 2 + tilt;
    const frame = mesh(rbox(PW, PH, 0.05, 0.012), alu); p.add(frame);
    const face = mesh(new THREE.PlaneGeometry(PW - 0.04, PH - 0.04), cellM, false); face.position.z = 0.027; p.add(face);
    g.add(p);
    panels.push(V(x, y + 0.05, z));
    // legs
    g.add(strut(V(x - 0.35, 0, z + 0.45), V(x - 0.35, 0.3, z + 0.45), 0.025, alu));
    g.add(strut(V(x + 0.35, 0, z + 0.45), V(x + 0.35, 0.3, z + 0.45), 0.025, alu));
    g.add(strut(V(x - 0.35, 0, z - 0.45), V(x - 0.35, 0.95, z - 0.45), 0.025, alu));
    g.add(strut(V(x + 0.35, 0, z - 0.45), V(x + 0.35, 0.95, z - 0.45), 0.025, alu));
  }
  // the sun
  const sunPos = V(-4.8, 5.4, 1.8);
  const sun = glow(0xfff1c0, 3.2, 1); sun.position.copy(sunPos); g.add(sun);
  const core = glow(0xffffff, 1.1, 1); core.position.copy(sunPos); g.add(core);
  const disc = mesh(new THREE.SphereGeometry(0.32, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), false); disc.position.copy(sunPos); g.add(disc);
  // inverter (turns the panels' DC into AC for the grid): a box on a stand, no moving parts
  const inv = new THREE.Group(); inv.position.set(1.0, 0, -0.9);
  inv.add(mesh(rbox(0.5, 0.62, 0.22, 0.04, 2), paint(0xd9dcdc, 0.4, 0.1)).translateY(0.95));
  inv.add(strut(V(0, 0, 0), V(0, 0.64, 0), 0.04, alu));
  const led = mesh(rbox(0.05, 0.05, 0.01, 0.005), new THREE.MeshStandardMaterial({ color: 0x2bd96a, emissive: 0x2bd96a, emissiveIntensity: 2 }), false); led.position.set(0.15, 1.15, 0.115); inv.add(led);
  const lab = textPlate(['INVERTER'], 0.4, 0.08, '#2a2f35'); lab.position.set(0, 1.02, 0.115); inv.add(lab);
  g.add(inv);
  // cable from the array to the inverter, then out
  const cab = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.25, 0.3, -0.2), V(0.7, 0.05, -0.5), V(1.0, 0.05, -0.85), V(1.0, 0.7, -0.9)]), 32, 0.035, 8), M.insulation('black'));
  g.add(cab);
  g.add(outCable(V(1.15, 0.85, -1.0), [V(1.6, 0.06, -1.1), V(2.6, 0.06, -1.2)]));
  // no generator: a ghost outline where it would stand
  const ghost = ghostGenerator(); ghost.position.copy(GEN_POS); ghost.position.x += 0.6; g.add(ghost);
  const routes: RoutePoint[][] = panels.map((p, i) => [
    ...R(0, [sunPos.x + Math.sin(i) * 0.2, sunPos.y + Math.cos(i * 1.7) * 0.2, sunPos.z], p.toArray() as [number, number, number]),
    ...R(1, [p.x + 0.3, p.y - 0.2, p.z], [0.25, 0.3, -0.2], [0.7, 0.05, -0.5], [1.0, 0.05, -0.85], [1.0, 0.95, -0.9], [1.15, 0.85, -1.0], [1.6, 0.06, -1.1], [2.6, 0.06, -1.2]),
  ]);
  return {
    id: 'solar', group: g, generator: null,
    anchors: [V(sunPos.x + 0.9, sunPos.y - 0.6, sunPos.z), V(-1.45, 1.55, -0.1)],
    routes,
    notes: [{ pos: V(GEN_POS.x + 0.6, 2.2, 0), text: 'No generator here: nothing spins' }],
    tick(_dt, t) { sun.material.opacity = 0.9 + Math.sin(t * 1.3) * 0.05; },
    view: { target: [-1.0, 2.0, 0], distance: 12, pitch: 0.34, yaw: 0.18 },
    lamp: { pos: V(-2.5, 3.5, 1.5), colour: 0xfff1d0, intensity: () => 2.2 },
  };
}

export function buildMachine(id: SourceId): Machine {
  switch (id) {
    case 'coal': return buildCoal();
    case 'gas': return buildGas();
    case 'hydro': return buildHydro();
    case 'wind': return buildWind();
    case 'solar': return buildSolar();
  }
}

