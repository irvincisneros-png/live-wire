// The 12 V training house: a cutaway timber-framed house (Lounge, Hallway, Kitchen) on a workshop floor, with a
// training switchboard by the door, three ceiling lampholders, wall switches, a 12 V training outlet wall and
// colour-coded cable runs (red active / positive, black neutral / return, green-yellow earth) clipped to the frame.
// Units: 1 = 10 cm, y up. The back wall's front face is z = 0.45; the open (cut away) front is +z.
import * as THREE from 'three';
import type { KitStage } from '../kit/stage';
import type { QualityTier } from '../types';
import type { InsulationColour } from '../kit/materials';
import { createGlobe, type GlobeModel } from '../kit/parts/globe';
import { createMeter, type MeterModel } from '../kit/parts/meter';
import { createCable } from '../kit/parts/lead';
import { glowSprite } from '../kit/parts/common';
import { disposeTree } from '../kit/dispose';
import { lcdText } from '../kit/materials';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHouseMats, timberGeo } from './house/mats';
import { buildRoute, type CableRun } from './house/cables';
import {
  bracket, lampBlock, lampPlug, mk, placard, powerPoint, stool, switchboard, tagPlane, terminalBlock, testProbe, testSocket, wallSwitch,
  type PowerPoint, type Switchboard, type WallSwitch,
} from './house/fixtures';
import { J1_POINTS } from './house/j1logic';
import type { OutletPoint, OutletTerminal } from '../sim/outlet';

export type CameraPreset = 'overview' | 'switchboard' | 'lighting' | 'outletWall';
export type SwitchKey = 'main' | 'sw0' | 'sw1' | 'sw2';
export type LampKey = 'existing' | 'new';

export interface TestPoint {
  /** J1 code (T1..T15) or J2 point id (supply-active, …) */
  id: string;
  set: 'j1' | 'j2';
  pos: THREE.Vector3;
  /** outward direction the socket / screw faces (the probe comes in along −normal) */
  normal: THREE.Vector3;
}

export type HouseHit =
  | { kind: 'tp'; id: string }
  | { kind: 'switch'; id: SwitchKey }
  | { kind: 'lamp'; id: LampKey };

export interface TrainingHouse {
  readonly root: THREE.Group;
  readonly testPoints: Map<string, TestPoint>;
  readonly globes: GlobeModel[];
  readonly cables: Map<string, CableRun>;
  /** which test-point set is shown and tappable */
  setTestPointSet(set: 'j1' | 'j2'): void;
  /** ceiling globe k (0 Lounge, 1 Kitchen, 2 Hallway): power in watts drives brightness. blown is only for the reveal. */
  setGlobe(k: number, s: { power: number; blown?: boolean }): void;
  setSwitch(id: SwitchKey, on: boolean): void;
  setSupplyDisplay(on: boolean): void;
  setNewOutletInstalled(on: boolean): void;
  /** new-outlet conductor t wired to a point, or removed */
  setConductor(t: OutletTerminal, p: OutletPoint | null): void;
  setTestLamp(k: LampKey, s: { plugged: boolean; power: number }): void;
  /** black (COM) and red probes on test points, or back on the stool */
  setProbes(black: string | null, red: string | null): void;
  setMeterReading(v: number | null): void;
  placeMeter(x: number, z: number): void;
  setCablesVisible(on: boolean): void;
  /** world position of a hit target (for markers) */
  view(p: CameraPreset, seconds?: number): void;
  /** fly to a custom view (kept on resize) */
  frame(o: { target: [number, number, number]; distance: number; yaw?: number; pitch?: number }, seconds?: number): void;
  pick(clientX: number, clientY: number): HouseHit | null;
  onTap(cb: (h: HouseHit) => void): () => void;
  /** a soft pulsing glow at a point (reveal); null clears */
  pulse(at: THREE.Vector3 | null): void;
  /** reveal animations */
  showWireBreak(wireId: string): void;
  repairWire(wireId: string): void;
  swapGlobe(k: number, seconds: number): Promise<void>;
  swapSwitch(id: SwitchKey, seconds: number): Promise<void>;
  partPosition(id: string): THREE.Vector3 | null;
  dispose(): void;
}

// ───────────── layout ─────────────
const WALL_F = 0.45, PLATE_T = 0.45, TOP = 24, STUD_TOP = TOP - 2 * PLATE_T, DEPTH = 16;
const X0 = -27, XL = -8, XR = 8, X1 = 27;
const BACK_STUDS = [-27, -22.25, -17.5, -12.75, -8, -6.0, 2.6, 6.9, 8, 12.75, 17.5, 22.25, 27];
const DOOR = { x0: -5.775, x1: 2.375, top: 20.6 };
/** ceiling globe x per room index (0 Lounge, 1 Kitchen, 2 Hallway) */
export const ROOM_X = [-17, 17, 0];
const LAMP_Z = 7, LAMP_Y = 23.2, PART_D = 6.6, CEIL_D = 10.5;
const SWITCH_X = [-9.6, 9.6, -7.0], SWITCH_Y = 11;
const BOARD = { x: 5.3, y: 16.2 };
const BLOCK_Y = 5.6, GPO_Y = 3.2;
const BLOCK_X = { supply: 10.4, existing: 15.1, new: 19.9 };
const TERM_DX = [-0.38, 0, 0.38];
const GLOBE_SCALE = 3.2, METER_SCALE = 2.2;

/** The kit globe stands on a bench batten whose brass lugs reach out to bench posts. Mounted on a ceiling or a lamp
 *  block there are no posts, so collapse the triangles of the baked base meshes that lie beyond the base's ends. */
function trimLugs(globe: THREE.Object3D): void {
  globe.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name !== 'baked' || m.geometry.index) return;
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 3) {
      if (Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getX(i + 1)), Math.abs(pos.getX(i + 2))) <= 0.236) continue;
      for (let k = 1; k < 3; k++) pos.setXYZ(i + k, pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    pos.needsUpdate = true;
    m.geometry.computeBoundingSphere();
  });
}

export function createTrainingHouse(stage: KitStage, quality: QualityTier): TrainingHouse {
  const scene = stage.scene;
  const root = new THREE.Group(); root.name = 'training-house'; scene.add(root);
  const mats = createHouseMats();
  const unsubs: (() => void)[] = [];
  const toDispose: { dispose(): void }[] = [];

  // ── camera, fog, lights tuned for a room-size set ──
  stage.camera.far = 420; stage.camera.near = 0.2; stage.camera.updateProjectionMatrix();
  if (scene.fog instanceof THREE.Fog) { scene.fog.near = 90; scene.fog.far = 260; }
  const key = stage.keyLight;
  key.position.set(32, 62, 48); key.target.position.set(0, 10, 4); key.intensity = 2.1;
  if (key.castShadow) {
    const sc = key.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 34; sc.bottom = -30; sc.near = 20; sc.far = 140; sc.updateProjectionMatrix();
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.06; key.shadow.radius = quality === 'high' ? 4 : 2.5;
  }
  const work: THREE.SpotLight[] = [];
  for (const [x, z] of [[-20, 34], [22, 32]] as const) {
    const s = new THREE.SpotLight(0xffd6a0, 2600, 0, 0.62, 0.65, 2);
    s.position.set(x, 34, z); s.target.position.set(x * 0.4, 9, 0);
    root.add(s, s.target); work.push(s);
  }
  // ── floor and workshop ──
  const floor = mk(new THREE.PlaneGeometry(220, 150), mats.concrete, false); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 20); root.add(floor);
  const backWall = mk(new THREE.PlaneGeometry(220, 70), mats.block, false); backWall.position.set(0, 35, -26); root.add(backWall);
  // LED shop battens on the workshop wall (they read as the warm work lights)
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0xfff1d8, emissive: 0xffe2b0, emissiveIntensity: 2.4, roughness: 0.4 });
  for (const x of [-30, 0, 30]) {
    const body = mk(new THREE.BoxGeometry(12, 0.5, 0.8), mats.enclosure, false); body.position.set(x, 40, -25.4); root.add(body);
    const tube = mk(new THREE.BoxGeometry(11.4, 0.18, 0.5), tubeMat, false); tube.position.set(x, 39.7, -25.1); root.add(tube);
  }
  // painted safety line round the bay
  const line = (w: number, d: number, x: number, z: number) => { const m = mk(new THREE.PlaneGeometry(w, d), mats.paintYellow, false); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); root.add(m); };
  line(62, 0.5, 0, 21); line(62, 0.5, 0, -3.5); line(0.5, 25, -31, 8.75); line(0.5, 25, 31, 8.75);

  // ── framing (merged into one mesh) ──
  const framing: THREE.BufferGeometry[] = [];
  let seed = 1;
  const timber = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const g = timberGeo(sx, sy, sz, seed++); g.translate(x, y, z); framing.push(g);
  };
  // back wall: bottom plate (gap at the door), double top plate, studs, door frame, noggins
  timber(DOOR.x0 - X0 + 0.225, PLATE_T, 0.9, (X0 - 0.225 + DOOR.x0) / 2, PLATE_T / 2, 0);
  timber(X1 + 0.225 - DOOR.x1, PLATE_T, 0.9, (DOOR.x1 + X1 + 0.225) / 2, PLATE_T / 2, 0);
  timber(X1 - X0 + 0.45, PLATE_T, 0.9, 0, STUD_TOP + PLATE_T / 2, 0);
  timber(X1 - X0 + 0.45, PLATE_T, 0.9, 0, STUD_TOP + PLATE_T * 1.5, 0);
  for (const x of BACK_STUDS) timber(0.45, STUD_TOP - PLATE_T, 0.9, x, (PLATE_T + STUD_TOP) / 2, 0);
  // door: jack studs, lintel, cripple stud
  for (const x of [DOOR.x0 - 0.0, DOOR.x1]) timber(0.45, DOOR.top - PLATE_T, 0.9, x + (x < 0 ? 0.225 : -0.225) * 0, (PLATE_T + DOOR.top) / 2, 0);
  timber(DOOR.x1 - DOOR.x0 + 1.35, 1.8, 0.9, (DOOR.x0 + DOOR.x1) / 2, DOOR.top + 0.9, 0);
  timber(0.45, STUD_TOP - DOOR.top - 1.8, 0.9, -1.7, (DOOR.top + 1.8 + STUD_TOP) / 2, 0);
  // noggins: staggered row
  for (let i = 0; i < BACK_STUDS.length - 1; i++) {
    const a = BACK_STUDS[i] + 0.225, b = BACK_STUDS[i + 1] - 0.225;
    if (b - a < 0.6 || (a > DOOR.x0 - 0.5 && b < DOOR.x1 + 0.5)) continue;
    const y = 14.4 + (i % 2 ? 0.45 : 0);
    timber(b - a, 0.9, 0.9, (a + b) / 2, y, 0);
  }
  // partitions (Lounge|Hallway at x = -8, Hallway|Kitchen at x = 8) and the two end walls, running along z
  const sideWall = (x: number, z1: number) => {
    const z0 = WALL_F;
    timber(0.9, PLATE_T, z1 - z0, x, PLATE_T / 2, (z0 + z1) / 2);
    timber(0.9, PLATE_T, z1 - z0, x, STUD_TOP + PLATE_T / 2, (z0 + z1) / 2);
    timber(0.9, PLATE_T, z1 - z0, x, STUD_TOP + PLATE_T * 1.5, (z0 + z1) / 2);
    const n = Math.max(2, Math.round((z1 - z0) / 4.5));
    const zs: number[] = [];
    for (let i = 0; i <= n; i++) zs.push(z0 + 0.225 + ((z1 - z0 - 0.45) * i) / n);
    for (const z of zs) timber(0.9, STUD_TOP - PLATE_T, 0.45, x, (PLATE_T + STUD_TOP) / 2, z);
    for (let i = 0; i < zs.length - 1; i++) timber(0.9, 0.9, zs[i + 1] - zs[i] - 0.45, x, 14.4 + (i % 2 ? 0.45 : 0), (zs[i] + zs[i + 1]) / 2);
  };
  // end walls run the full depth; the partitions are cut back to stubs so the rooms stay open to view
  sideWall(X0, DEPTH); sideWall(X1, DEPTH); sideWall(XL, PART_D); sideWall(XR, PART_D);
  // ceiling joists, cut back over the rooms so the ceiling reads as a cutaway section; lamp battens and lamp blocks
  for (let i = 0; i <= 9; i++) timber(0.45, 1.4, CEIL_D + 0.45, -26.775 + 6 * i, TOP + 0.7, (CEIL_D - 0.45) / 2);
  timber(X1 - X0 + 0.9, 1.4, 0.45, 0, TOP + 0.7, -0.225 - 0.0);
  for (const x of ROOM_X) {
    timber(0.9, 0.45, CEIL_D - WALL_F, x, TOP - 0.225, (WALL_F + CEIL_D) / 2);
    timber(1.7, 0.35, 1.2, x, LAMP_Y + 0.175, LAMP_Z);
  }
  // plywood backing for the switchboard
  const ply = mk(new THREE.BoxGeometry(5.6, 11.0, 0.12), mats.ply); ply.position.set(5.25, 17.5, WALL_F + 0.06); root.add(ply);
  const frameGeo = mergeGeometries(framing.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  framing.forEach((g) => g.dispose());
  const frame = mk(frameGeo!, mats.pine); frame.name = 'framing'; root.add(frame);

  // ── plasterboard linings (cut away to show the cavity) ──
  const lining = (x0: number, x1: number, y0: number, y1: number) => {
    const w = x1 - x0, h = y1 - y0;
    const face = mk(new THREE.BoxGeometry(w, h, 0.13), mats.plaster); face.position.set((x0 + x1) / 2, (y0 + y1) / 2, WALL_F + 0.065); root.add(face);
    // the cut edge shows the grey gypsum core between the paper faces
    const edge = mk(new THREE.BoxGeometry(0.02, h, 0.1), mats.gypsum, false); edge.position.set(x1 + 0.005, (y0 + y1) / 2, WALL_F + 0.065); root.add(edge);
    // a taped joint
    const tape = mk(new THREE.PlaneGeometry(0.5, h), new THREE.MeshStandardMaterial({ color: 0xeeebe2, roughness: 0.85 }), false);
    tape.position.set(x0 + w * 0.5, (y0 + y1) / 2, WALL_F + 0.131); root.add(tape);
  };
  lining(X0 - 0.2, -17.5, 0.0, TOP - 0.05);
  lining(22.25, X1 + 0.2, 0.0, TOP - 0.05);

  // ── room name boards on the framing, and a poster on the lounge lining ──
  const roomNames = ['LOUNGE', 'KITCHEN', 'HALLWAY'];
  const signAt: [number, number][] = [[-15.1, 21.2], [15.1, 21.2], [-1.7, 21.5]];
  signAt.forEach(([x, y], k) => { const t = tagPlane(roomNames[k], 2.8, 0.62, { bg: '#1d2024', fg: '#f2c264', size: 54 }); t.position.set(x, y, WALL_F + 0.03); root.add(t); });
  const school = tagPlane(['TRAINING HOUSE', 'All circuits run on 12 V DC', 'Apprentice practice only'], 4.6, 2.4, { bg: '#f2ead6', fg: '#1c1e26', size: 30, border: '#1c1e26' });
  school.position.set(-22.4, 16.5, WALL_F + 0.14); root.add(school);

  // ── switchboard ──
  const board = switchboard(mats) as Switchboard;
  board.position.set(BOARD.x, BOARD.y, WALL_F + 0.12); root.add(board);
  toDispose.push({ dispose: board.userData.dispose });
  const plac = placard(); plac.scale.setScalar(0.74); plac.position.set(0, 1.74, 1.045); board.add(plac);

  // ── test points ──
  const testPoints = new Map<string, TestPoint>();
  const tpObjs = new Map<string, THREE.Object3D>();
  const hitObjs: THREE.Object3D[] = [];
  const hitGeo = new THREE.SphereGeometry(0.42, 10, 8), hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const addHit = (pos: THREE.Vector3, hit: HouseHit, geo: THREE.BufferGeometry = hitGeo) => {
    const m = new THREE.Mesh(geo, hitMat); m.position.copy(pos); m.userData.hit = hit; root.add(m); hitObjs.push(m); return m;
  };
  const addTp = (id: string, set: 'j1' | 'j2', pos: THREE.Vector3, normal: THREE.Vector3, obj: THREE.Object3D | null) => {
    testPoints.set(id, { id, set, pos, normal });
    const h = addHit(pos, { kind: 'tp', id });
    h.userData.tpSet = set;
    if (obj) tpObjs.set(id, obj);
  };
  // J1: board sockets T1..T3
  board.updateMatrixWorld(true);
  for (const s of board.userData.sockets) {
    const sock = testSocket(mats, s.code, 'up'); sock.position.copy(s.pos); board.add(sock);
    const w = s.pos.clone().applyMatrix4(board.matrixWorld).add(new THREE.Vector3(0, 0, 0.16));
    addTp(s.code, 'j1', w, new THREE.Vector3(0, 0, 1), sock);
  }
  // J1: switch and lamp sockets
  for (let k = 0; k < 3; k++) {
    const sx = SWITCH_X[k];
    const codes = J1_POINTS.filter((p) => p.room === k);
    const inP = codes.find((p) => p.node === 3 + 4 * k)!, outP = codes.find((p) => p.node === 4 + 4 * k)!;
    const topP = codes.find((p) => p.node === 5 + 4 * k)!, botP = codes.find((p) => p.node === 6 + 4 * k)!;
    for (const [p, y, side] of [[inP, SWITCH_Y + 1.15, 'up'], [outP, SWITCH_Y - 1.15, 'down']] as const) {
      const s = testSocket(mats, p.code, side); s.position.set(sx, y, WALL_F + 0.02); root.add(s);
      addTp(p.code, 'j1', new THREE.Vector3(sx, y, WALL_F + 0.18), new THREE.Vector3(0, 0, 1), s);
    }
    const lx = ROOM_X[k];
    for (const [p, dx] of [[topP, -0.5], [botP, 0.5]] as const) {
      const s = testSocket(mats, p.code, 'down'); s.position.set(lx + dx, LAMP_Y + 0.2, LAMP_Z + 0.6); s.scale.setScalar(0.85); root.add(s);
      addTp(p.code, 'j1', new THREE.Vector3(lx + dx, LAMP_Y + 0.2, LAMP_Z + 0.75), new THREE.Vector3(0, 0, 1), s);
    }
  }

  // ── wall switches with mounting brackets ──
  const switches = new Map<SwitchKey, WallSwitch>();
  const cavity = (x: number): [number, number] => {
    let a = -1e9, b = 1e9;
    for (const s of BACK_STUDS) { if (s <= x && s > a) a = s; if (s >= x && s < b) b = s; }
    return [a, b];
  };
  for (let k = 0; k < 3; k++) {
    const sx = SWITCH_X[k];
    const [a, b] = cavity(sx);
    const br = bracket(mats, b - a, 0.6); br.position.set((a + b) / 2, SWITCH_Y, WALL_F + 0.015); root.add(br);
    const sw = wallSwitch(mats); sw.position.set(sx, SWITCH_Y, WALL_F + 0.03); root.add(sw);
    switches.set(`sw${k}` as SwitchKey, sw);
    const hp = new THREE.Vector3(sx, SWITCH_Y, WALL_F + 0.25);
    addHit(hp, { kind: 'switch', id: `sw${k}` as SwitchKey }, new THREE.BoxGeometry(0.9, 1.3, 0.6));
  }
  board.userData.mainHit.userData.hit = { kind: 'switch', id: 'main' } as HouseHit;
  hitObjs.push(board.userData.mainHit);

  // ── ceiling globes ──
  const globes: GlobeModel[] = [];
  const globePower = [0, 0, 0], globeBlown = [false, false, false];
  const globeHolders: THREE.Group[] = [];
  for (let k = 0; k < 3; k++) {
    const holder = new THREE.Group(); holder.position.set(ROOM_X[k], LAMP_Y, LAMP_Z); holder.rotation.x = Math.PI; holder.scale.setScalar(GLOBE_SCALE);
    const g = createGlobe(quality); trimLugs(g); holder.add(g); root.add(holder);
    globes.push(g); globeHolders.push(holder);
  }
  // point lights for globes and test lamps (constant count so shaders never recompile)
  const nLights = quality === 'low' ? 0 : 5;
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < nLights; i++) { const l = new THREE.PointLight(0xffc27a, 0, 0, 2); root.add(l); lights.push(l); }

  // ── outlet wall: brackets, terminal blocks, power points ──
  const blocks: Record<'supply' | 'existing' | 'new', THREE.Group & { userData: { terminals: THREE.Vector3[] } }> = {} as never;
  const titles = { supply: 'SUPPLY JUNCTION', existing: 'EXISTING OUTLET', new: 'NEW OUTLET' } as const;
  const gpos: Partial<Record<LampKey, PowerPoint>> = {};
  const newOutletGroup = new THREE.Group(); root.add(newOutletGroup);
  for (const key2 of ['supply', 'existing', 'new'] as const) {
    const x = BLOCK_X[key2];
    const [a, b] = cavity(x);
    const parent = key2 === 'new' ? newOutletGroup : root;
    const br = bracket(mats, b - a, 0.55); br.position.set((a + b) / 2, BLOCK_Y, WALL_F + 0.015); root.add(br);
    const blk = terminalBlock(mats, titles[key2]); blk.position.set(x, BLOCK_Y, WALL_F + 0.03); parent.add(blk);
    blocks[key2] = blk;
    if (key2 !== 'supply') {
      const br2 = bracket(mats, b - a, 0.6); br2.position.set((a + b) / 2, GPO_Y, WALL_F + 0.015); root.add(br2);
      const gp = powerPoint(mats, '12 V TRAINING'); gp.position.set(x, GPO_Y, WALL_F + 0.03); parent.add(gp);
      gpos[key2] = gp;
      addHit(new THREE.Vector3(x, GPO_Y, WALL_F + 0.4), { kind: 'lamp', id: key2 }, new THREE.BoxGeometry(1.0, 1.4, 0.7));
      // pigtails from the terminal block down to the outlet
      TERM_DX.forEach((dx, i) => {
        const col: InsulationColour = (['red', 'black', 'greenYellow'] as const)[i];
        const run = buildRoute([new THREE.Vector3(x + dx, BLOCK_Y - 0.15, WALL_F + 0.2), new THREE.Vector3(x + dx, BLOCK_Y - 0.7, WALL_F + 0.0), new THREE.Vector3(x + dx * 0.4, GPO_Y + 0.9, WALL_F - 0.05), new THREE.Vector3(x + dx * 0.3, GPO_Y + 0.2, WALL_F + 0.0)], col, mats, { clipEvery: 0, bend: 0.25 });
        parent.add(run.group); toDispose.push(run);
      });
    }
    blk.updateMatrixWorld(true);
    (['active', 'neutral', 'earth'] as const).forEach((net, i) => {
      const id = `${key2}-${net}`;
      const local = blk.userData.terminals[i];
      const w = local.clone().applyMatrix4(blk.matrixWorld);
      addTp(id, 'j2', w, new THREE.Vector3(0, 0, 1), null);
    });
  }

  // ── cable runs ──
  const cables = new Map<string, CableRun>();
  const surfaceFor = (_p: THREE.Vector3, dir: THREE.Vector3) => (Math.abs(dir.z) > 0.7 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, 1));
  const addRun = (id: string, pts: THREE.Vector3[], col: InsulationColour, marker?: { text: string; near: THREE.Vector3 }, sag = 0) => {
    const run = buildRoute(pts, col, mats, { clipEvery: 2.4, surface: surfaceFor, studsX: BACK_STUDS, marker, sag });
    root.add(run.group); cables.set(id, run);
    return run;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const boardTop = BOARD.y + 2.2, boardBot = BOARD.y - 2.2;
  const zW = WALL_F + 0.05, zC = 0.1;
  // lighting circuit: for each room, A (board to switch, red), B (switch to lamp, red), C (lamp back to board, black)
  const L = {
    // room: [exit A, level A, exit C, level C, drop A, drop B]
    0: { ea: 4.4, la: 23.7, ec: 4.6, lc: 23.85, da: -8.66, db: -8.88 },
    1: { ea: 6.1, la: 23.7, ec: 5.9, lc: 23.85, da: 8.66, db: 8.88 },
    2: { ea: 3.8, la: 23.35, ec: 4.0, lc: 23.5, da: -6.6, db: -6.4 },
  } as const;
  const LB = 23.2;
  for (let k = 0; k < 3; k++) {
    const r = L[k as 0 | 1 | 2], sx = SWITCH_X[k], lx = ROOM_X[k];
    const letters = 'ABCDEFGHI';
    const [ia, ib, ic] = [3 * k, 3 * k + 1, 3 * k + 2];
    const cFromRight = BOARD.x > lx;
    // lamp terminals: a (top, B) at lx − 0.41, b (bottom, C) at lx + 0.41; B runs on the −x side of the batten, C on the +x side
    const bSide = lx - 0.2, cSide = lx + 0.2;
    addRun(`wire-${letters[ia]}`, [
      V(r.ea, boardTop + 0.05, WALL_F + 0.62), V(r.ea, 22.7, WALL_F + 0.2), V(r.ea, r.la, zW), V(r.da, r.la, zW),
      V(r.da, r.la - 0.7, zC), V(r.da, SWITCH_Y + 1.6, zC), V(sx + (r.da > sx ? 0.15 : -0.15), SWITCH_Y + 0.45, WALL_F - 0.1),
    ], 'red', { text: letters[ia], near: V(r.da, 17.5, zC) });
    addRun(`wire-${letters[ib]}`, [
      V(sx + (r.db > sx ? 0.15 : -0.15), SWITCH_Y - 0.1, WALL_F - 0.1), V(r.db, SWITCH_Y + 0.9, zC), V(r.db, LB - 0.7, zC), V(r.db, LB, zW),
      V(bSide, LB, zW), V(bSide, TOP - 0.5, WALL_F + 0.9), V(bSide, TOP - 0.5, LAMP_Z - 1.0), V(lx - 0.41, LAMP_Y - 0.12, LAMP_Z - 0.2),
    ], 'red', { text: letters[ib], near: V(r.db, 19.5, zC) }, 0.04);
    addRun(`wire-${letters[ic]}`, [
      V(lx + 0.41, LAMP_Y - 0.12, LAMP_Z - 0.2), V(cSide, TOP - 0.5, LAMP_Z - 1.0), V(cSide, TOP - 0.5, WALL_F + 0.9), V(cSide, r.lc, zW),
      V(r.ec, r.lc, zW), V(r.ec, 22.7, WALL_F + 0.2), V(r.ec, boardTop + 0.05, WALL_F + 0.62),
    ], 'black', { text: letters[ic], near: V(cFromRight ? lx + 2.4 : lx - 2.4, r.lc, zW) }, 0.04);
  }
  // supply feed from the board to the junction (fixed), and cab-a/n/e from the junction to the existing outlet (fixed)
  const NETS = ['active', 'neutral', 'earth'] as const;
  const NET_COL: Record<OutletTerminal, InsulationColour> = { active: 'red', neutral: 'black', earth: 'greenYellow' };
  const termTop = (blk: 'supply' | 'existing' | 'new', i: number, dx: number) => V(BLOCK_X[blk] + TERM_DX[i] + dx, BLOCK_Y + 0.18, WALL_F + 0.2);
  NETS.forEach((net, i) => {
    const ex = 4.4 + 0.3 * i, lvl = 7.4 + 0.2 * i, tx = BLOCK_X.supply + TERM_DX[i] - 0.08;
    addRun(`feed-${net}`, [
      V(ex, boardBot - 0.05, WALL_F + 0.62), V(ex, 12.0, WALL_F + 0.6), V(ex, 11.2, 0.15), V(ex, lvl, 0.15), V(tx, lvl, 0.15), V(tx, BLOCK_Y + 0.9, 0.15), termTop('supply', i, -0.08),
    ], NET_COL[net]);
  });
  NETS.forEach((net, i) => {
    const lvl = 7.0 - 0.2 * i, z = -0.05 - 0.15 * i;
    const a = BLOCK_X.supply + TERM_DX[i] + 0.08, b = BLOCK_X.existing + TERM_DX[i] - 0.08;
    addRun(`cab-${net[0]}`, [termTop('supply', i, 0.08), V(a, BLOCK_Y + 0.9, z), V(a, lvl, z), V(b, lvl, z), V(b, BLOCK_Y + 0.9, z), termTop('existing', i, -0.08)], NET_COL[net]);
  });
  // the student's new conductors (rebuilt when they change)
  const conductors: Partial<Record<OutletTerminal, CableRun>> = {};
  const setConductor = (t: OutletTerminal, p: OutletPoint | null) => {
    const old = conductors[t];
    if (old) { old.dispose(); cables.delete(`c-${t}`); delete conductors[t]; }
    if (!p) return;
    const i = NETS.indexOf(t);
    const [blk, net] = p.split('-') as ['supply' | 'existing', OutletTerminal];
    const j = NETS.indexOf(net);
    const lvl = 8.3 + 0.2 * i, z = 0.32;
    const sx0 = BLOCK_X.new + TERM_DX[i], tx = BLOCK_X[blk] + TERM_DX[j] + (blk === 'supply' ? 0 : 0.08);
    const run = buildRoute([termTop('new', i, 0), V(sx0, BLOCK_Y + 0.9, z), V(sx0, lvl, z), V(tx, lvl, z), V(tx, BLOCK_Y + 0.9, z), termTop(blk, j, blk === 'supply' ? 0 : 0.08)], NET_COL[t], mats, { clipEvery: 2.4, studsX: BACK_STUDS });
    newOutletGroup.add(run.group);
    conductors[t] = run; cables.set(`c-${t}`, run);
  };

  // ── multimeter on a step stool, with test probes ──
  const stoolG = stool(mats, timberGeo); root.add(stoolG);
  const meter = createMeter('voltmeter') as MeterModel;
  meter.scale.setScalar(METER_SCALE); meter.position.set(0, 4.74, 0.1);
  stoolG.add(meter);
  const probes = { black: testProbe('black'), red: testProbe('red') };
  root.add(probes.black, probes.red);
  const leads = { black: createCable('black', 60, 8), red: createCable('red', 60, 8) };
  root.add(leads.black, leads.red);
  // jack positions in the meter's own frame (from the kit's voltmeter layout: COM left, V right, tilted back 0.42 rad)
  const tilt = 0.42, jy = 0.8 * 0.14, jz = 0.11 / 2 + 0.012;
  const jackLocal = (sx: number) => new THREE.Vector3(sx * 0.1, jy * Math.cos(tilt) + jz * Math.sin(tilt), -jy * Math.sin(tilt) + jz * Math.cos(tilt));
  const faceN = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
  let probeAt: { black: string | null; red: string | null } = { black: null, red: null };
  const groundY = (x: number, z: number) => {
    const sp = stoolG.position;
    if (Math.abs(x - sp.x) < 1.7 && Math.abs(z - sp.z) < 0.9) return 4.74;
    return z < WALL_F + 0.1 ? -10 : 0;
  };
  const layProbes = () => {
    stoolG.updateMatrixWorld(true);
    for (const c of ['black', 'red'] as const) {
      const pr = probes[c], id = probeAt[c], tp = id ? testPoints.get(id) : undefined;
      if (tp) {
        // probe comes in along −normal, tipped down a little so it reads as a hand-held probe
        const axis = tp.normal.clone().add(new THREE.Vector3(c === 'black' ? -0.18 : 0.18, 0.35, 0)).normalize();
        pr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
        pr.position.copy(tp.pos).addScaledVector(tp.normal, -0.05);
      } else {
        pr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(c === 'black' ? -1 : 1, 0.02, 0.15).normalize());
        pr.position.copy(stoolG.position).add(new THREE.Vector3(c === 'black' ? -0.55 : 0.55, 4.82, 0.55));
      }
      pr.updateMatrixWorld(true);
      const exit = pr.userData.exit.clone().applyMatrix4(pr.matrixWorld);
      const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(pr.quaternion);
      const jack = jackLocal(c === 'black' ? -1 : 1).multiplyScalar(1).applyMatrix4(meter.matrixWorld);
      const fn = faceN.clone().transformDirection(meter.matrixWorld);
      const span = exit.distanceTo(jack);
      leads[c].userData.setPath({ p0: jack, d0: fn.setY(fn.y - 0.3), p1: exit, d1: dir, h0: Math.min(2.2, 0.4 + span * 0.25), h1: Math.min(3, 0.6 + span * 0.3), sag: Math.min(4, span * 0.22), ground: groundY });
    }
  };
  const placeMeter = (x: number, z: number) => { stoolG.position.set(x, 0, z); layProbes(); };
  placeMeter(-1.5, 9.5);

  // ── test lamps (Job 2) ──
  const lampW = { existing: 0, new: 0 };
  const testLamps: Partial<Record<LampKey, { group: THREE.Group; globe: GlobeModel; plug: THREE.Group; cord: ReturnType<typeof createCable>; plugged: boolean }>> = {};
  for (const k2 of ['existing', 'new'] as const) {
    const x = BLOCK_X[k2];
    const group = new THREE.Group(); group.position.set(x - 0.3, 0, 3.0); group.visible = false; root.add(group);
    const blk = lampBlock(mats, timberGeo, k2 === 'existing' ? 'LAMP 1' : 'LAMP 2'); group.add(blk);
    const gh = new THREE.Group(); gh.position.y = 0.4; gh.scale.setScalar(GLOBE_SCALE * 0.9); group.add(gh);
    const globe = createGlobe(quality); trimLugs(globe); gh.add(globe);
    const plug = lampPlug(mats); root.add(plug);
    const cord = createCable('white', 50, 8); root.add(cord);
    testLamps[k2] = { group, globe, plug, cord, plugged: false };
    addHit(new THREE.Vector3(x - 0.3, 0.8, 3.0), { kind: 'lamp', id: k2 }, new THREE.BoxGeometry(1.8, 1.8, 1.4));
  }
  const layLamp = (k2: LampKey) => {
    const t = testLamps[k2]!;
    const gp = gpos[k2]!;
    gp.updateMatrixWorld(true);
    if (t.plugged) {
      t.plug.position.copy(gp.userData.plugAnchor).applyMatrix4(gp.matrixWorld); t.plug.position.z -= 0.0; t.plug.rotation.set(0, 0, 0);
    } else {
      t.plug.position.set(BLOCK_X[k2] + 1.1, 0.12, 3.4); t.plug.rotation.set(-Math.PI / 2, 0, 0.6);
    }
    t.plug.updateMatrixWorld(true);
    const p1 = new THREE.Vector3(0, -0.38, 0.12).applyMatrix4(t.plug.matrixWorld);
    const p0 = new THREE.Vector3(0.65, 0.25, -0.3).applyMatrix4(t.group.matrixWorld);
    const d1 = new THREE.Vector3(0, -1, 0).transformDirection(t.plug.matrixWorld);
    t.cord.userData.setPath({ p0, d0: new THREE.Vector3(0.3, -0.2, -1), p1, d1, h0: 0.6, h1: 0.8, sag: 0.5, ground: (_x, z) => (z < WALL_F + 0.1 ? -10 : 0) });
  };

  // ── per-frame ──
  const blownSmoke = [false, false, false];
  let pulseAt: THREE.Vector3 | null = null;
  const pulseSprite = glowSprite(0xffd277); pulseSprite.visible = false; pulseSprite.renderOrder = 30; (pulseSprite.material as THREE.SpriteMaterial).depthTest = false; root.add(pulseSprite);
  unsubs.push(stage.onFrame((dt, t) => {
    for (let k = 0; k < 3; k++) globes[k].userData.update({ power: globePower[k], ratedW: 10, blown: globeBlown[k] || blownSmoke[k] }, dt);
    for (const k2 of ['existing', 'new'] as const) { const tl = testLamps[k2]!; tl.globe.userData.update({ power: lampW[k2], ratedW: Math.max(lampW[k2], 6) }, dt); }
    for (const s of switches.values()) s.userData.update(dt);
    board.userData.update(dt);
    leads.black.userData.update(dt); leads.red.userData.update(dt);
    // light pool: ceiling globes then test lamps
    const src: { b: number; pos: THREE.Vector3; col: THREE.Color; k: number }[] = [];
    globes.forEach((g, k) => src.push({ b: g.userData.brightness, pos: new THREE.Vector3(ROOM_X[k], LAMP_Y - 0.8, LAMP_Z), col: g.userData.lightColor, k: 60 }));
    for (const k2 of ['existing', 'new'] as const) { const tl = testLamps[k2]!; if (tl.group.visible) src.push({ b: tl.globe.userData.brightness, pos: tl.group.position.clone().setY(1.2), col: tl.globe.userData.lightColor, k: 14 }); }
    lights.forEach((l, i) => {
      const s = src[i];
      if (!s || s.b < 0.01) { l.intensity = 0; return; }
      l.position.copy(s.pos); l.color.copy(s.col); l.intensity = Math.min(1.4, s.b) * s.k;
    });
    if (pulseAt) { pulseSprite.visible = true; pulseSprite.position.copy(pulseAt); const k = 0.5 + 0.5 * Math.sin(t * 5); pulseSprite.scale.setScalar(1.6 + k * 1.2); (pulseSprite.material as THREE.SpriteMaterial).opacity = 0.35 + 0.45 * k; }
    else pulseSprite.visible = false;
  }));

  // ── input ──
  const tapCbs = new Set<(h: HouseHit) => void>();
  let tpSet: 'j1' | 'j2' = 'j1';
  const pick = (x: number, y: number): HouseHit | null => {
    const objs = hitObjs.filter((o) => o.visible && (o.userData.tpSet === undefined || o.userData.tpSet === tpSet));
    const hits = stage.pick(x, y, objs);
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o && !o.userData.hit) o = o.parent; if (o) return o.userData.hit as HouseHit; }
    return null;
  };
  let downAt = { x: 0, y: 0, t: 0 };
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onUp = (e: PointerEvent) => {
    if (stage.orbiting || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8 || performance.now() - downAt.t > 700) return;
    const h = pick(e.clientX, e.clientY);
    if (h) for (const cb of [...tapCbs]) cb(h);
  };
  const onMove = (e: PointerEvent) => { if (e.buttons) return; stage.canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : ''; };
  stage.canvas.addEventListener('pointerdown', onDown);
  stage.canvas.addEventListener('pointerup', onUp);
  stage.canvas.addEventListener('pointermove', onMove);

  // ── camera presets (fit a box to the view) ──
  // hwP: the half-width to keep in view on a portrait (phone) screen, where the sides may be cropped
  const PRESETS: Record<CameraPreset, { target: [number, number, number]; hw: number; hh: number; hwP: number; tP?: [number, number, number]; yaw: number; pitch: number }> = {
    overview: { target: [0, 13.2, 4], hw: 28.5, hh: 12.4, hwP: 13, tP: [1, 12, 4], yaw: 0.16, pitch: 0.16 },
    switchboard: { target: [BOARD.x - 0.4, 16.2, 1.5], hw: 3.9, hh: 3.6, hwP: 2.6, yaw: 0.1, pitch: 0.14 },
    lighting: { target: [0, 20.6, 5], hw: 20, hh: 4.8, hwP: 9, tP: [-2, 20, 5], yaw: 0.1, pitch: 0.14 },
    outletWall: { target: [16.2, 4.6, 2.2], hw: 8.2, hh: 4.2, hwP: 5.4, tP: [15.8, 4.6, 2.2], yaw: -0.08, pitch: 0.2 },
  };
  let curPreset: CameraPreset = 'overview';
  let custom: { target: [number, number, number]; distance: number; yaw: number; pitch: number } | null = null;
  const fit = (p: CameraPreset) => {
    const d = PRESETS[p];
    const aspect = stage.camera.aspect || 1.6;
    const t = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
    const portrait = aspect < 1;
    const hw = portrait ? d.hwP : d.hw;
    const dist = Math.max(portrait ? 0 : d.hh / t, hw / (t * aspect)) * 1.04 + 4;
    return { target: portrait && d.tP ? d.tP : d.target, distance: dist, yaw: d.yaw, pitch: d.pitch };
  };
  const view = (p: CameraPreset, seconds = 0.9) => {
    curPreset = p; custom = null;
    const v = fit(p);
    stage.setHome({ ...v, minDistance: 6, maxDistance: 220 }, false);
    stage.flyTo(v, seconds);
  };
  unsubs.push(stage.onResize(() => { if (!stage.userMoved) { const v = custom ?? fit(curPreset); stage.setHome({ ...v, minDistance: 6, maxDistance: 220 }, true); } }));
  stage.setPanBounds(-34, 34, -6, 30);
  view('overview', 0);

  // ── initial state ──
  for (const k2 of ['existing', 'new'] as const) layLamp(k2);
  newOutletGroup.visible = false;

  const setTestPointSet = (set: 'j1' | 'j2') => {
    tpSet = set;
    for (const [id, o] of tpObjs) o.visible = testPoints.get(id)!.set === set;
  };
  setTestPointSet('j1');

  const house: TrainingHouse = {
    root, testPoints, globes, cables,
    setTestPointSet,
    setGlobe(k, s) { globePower[k] = s.power; globeBlown[k] = !!s.blown; },
    setSwitch(id, on) { if (id === 'main') board.userData.setMain(on); else switches.get(id)?.userData.set(on); },
    setSupplyDisplay(on) { board.userData.setSupply(on, 12); },
    setNewOutletInstalled(on) {
      newOutletGroup.visible = on;
      for (const h of hitObjs) { const hh = h.userData.hit as HouseHit | undefined; if (hh && ((hh.kind === 'tp' && hh.id.startsWith('new-')) || (hh.kind === 'lamp' && hh.id === 'new'))) h.visible = on; }
    },
    setConductor,
    setTestLamp(k2, s) {
      const t = testLamps[k2]!;
      t.group.visible = true;
      lampW[k2] = s.plugged ? s.power : 0;
      if (t.plugged !== s.plugged) { t.plugged = s.plugged; layLamp(k2); }
    },
    setProbes(black, red) { probeAt = { black, red }; layProbes(); leads.black.userData.sway(0.08); leads.red.userData.sway(0.08); },
    setMeterReading(v) { if (v === null) meter.userData.setReading('', '', true); else meter.userData.setReading(lcdText(v), 'V'); },
    placeMeter,
    setCablesVisible(on) { for (const c of cables.values()) c.group.visible = on; },
    view,
    frame(o, seconds = 0.9) {
      custom = { target: o.target, distance: o.distance, yaw: o.yaw ?? 0, pitch: o.pitch ?? 0.2 };
      stage.setHome({ ...custom, minDistance: 6, maxDistance: 220 }, false);
      stage.flyTo(custom, seconds);
    },
    pick,
    onTap(cb) { tapCbs.add(cb); return () => tapCbs.delete(cb); },
    pulse(at) { pulseAt = at ? at.clone() : null; },
    showWireBreak(id) { const c = cables.get(id); if (c) c.showBreak(Math.min(0.97, c.markerT + 0.06)); },
    repairWire(id) { cables.get(id)?.repair(); },
    swapGlobe(k, seconds) {
      // the old globe drops away and a new one rises into the holder
      return new Promise((resolve) => {
        const h = globeHolders[k]; let t = 0, done = false;
        const finish = () => { if (done) return; done = true; off(); clearTimeout(timer); h.scale.setScalar(GLOBE_SCALE); globeBlown[k] = false; blownSmoke[k] = false; resolve(); };
        const off = stage.onFrame((dt) => {
          t += dt / seconds;
          const k1 = Math.min(1, t);
          const s = k1 < 0.5 ? 1 - k1 * 2 : (k1 - 0.5) * 2;
          h.scale.setScalar(GLOBE_SCALE * Math.max(0.02, s));
          if (k1 >= 0.5) { globeBlown[k] = false; blownSmoke[k] = false; }
          if (k1 >= 1) finish();
        });
        // the frame loop pauses in a hidden tab: never leave the job waiting on it
        const timer = setTimeout(finish, seconds * 1000 + 400);
        unsubs.push(off, () => clearTimeout(timer));
      });
    },
    swapSwitch(id, seconds) {
      return new Promise((resolve) => {
        const obj: THREE.Object3D = id === 'main' ? board : switches.get(id)!;
        const z0 = obj.position.z; let t = 0, done = false;
        const finish = () => { if (done) return; done = true; off(); clearTimeout(timer); obj.position.z = z0; resolve(); };
        const off = stage.onFrame((dt) => {
          t += dt / seconds;
          const k1 = Math.min(1, t);
          obj.position.z = z0 + Math.sin(Math.PI * k1) * (id === 'main' ? 0.25 : 0.9);
          if (k1 >= 1) finish();
        });
        const timer = setTimeout(finish, seconds * 1000 + 400);
        unsubs.push(off, () => clearTimeout(timer));
      });
    },
    partPosition(id) {
      if (id === 'main') { board.updateMatrixWorld(true); return board.userData.mainHit.getWorldPosition(new THREE.Vector3()); }
      const m = /^sw(\d)$/.exec(id); if (m) return new THREE.Vector3(SWITCH_X[+m[1]], SWITCH_Y, WALL_F + 0.4);
      const g = /^g(\d)$/.exec(id); if (g) return new THREE.Vector3(ROOM_X[+g[1]], LAMP_Y - 0.9, LAMP_Z);
      const c = cables.get(id); if (c) return c.pointAt(Math.min(0.97, c.markerT + 0.06));
      return null;
    },
    dispose() {
      unsubs.forEach((u) => u());
      stage.canvas.removeEventListener('pointerdown', onDown);
      stage.canvas.removeEventListener('pointerup', onUp);
      stage.canvas.removeEventListener('pointermove', onMove);
      for (const c of cables.values()) c.dispose();
      for (const c of Object.values(leads)) c.userData.dispose?.();
      for (const t of Object.values(testLamps)) t?.cord.userData.dispose?.();
      toDispose.forEach((d) => d.dispose());
      hitGeo.dispose(); hitMat.dispose();
      for (const w of work) w.dispose();
      disposeTree(root);
      mats.dispose();
    },
  };
  return house;
}
