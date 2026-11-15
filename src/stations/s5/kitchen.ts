// Station 5 kitchen: benchtop corner, tiled splashback, three double power points, six appliances,
// a plug-in power meter that moves between sockets, energy packets and DOM on/off tags.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Q, type QualityTier } from '../../types';
import type { KitStage } from '../../kit/stage';
import { contactShadow } from '../../kit/stage';
import * as M from '../../kit/materials';
import { disposeTree } from '../../kit/dispose';
import { canvas } from '../../kit/textures';
import { S5_IDS, s5Appliance, packetRate, type S5Id } from './model';
import { createChargerPack, createKettle, createLamp, createMicrowave, createPhone, createToaster, createTv, type ApplianceModel } from './appliances3d';
import { drawMeterLcd, quartz, subwayTiles } from './textures';

export const WALL_Z = -3.2;
const BX0 = -9.6, BX1 = 9.8, BZ1 = 3.0, PY = 2.5;

/** world placement of each appliance */
const PLACE: Record<S5Id, { x: number; z: number; ry: number }> = {
  microwave: { x: -6.8, z: -1.25, ry: 0.04 },
  kettle: { x: -2.45, z: -0.45, ry: -0.18 },
  toaster: { x: 0.15, z: -1.15, ry: 0.03 },
  'led-lamp': { x: 3.45, z: -1.2, ry: 0 },
  'phone-charger': { x: 4.95, z: 0.75, ry: 0.35 },
  'led-tv': { x: 7.15, z: -1.45, ry: -0.22 },
};
/** socket centre x for each appliance (three double power points) */
const SOCKET_X: Record<S5Id, number> = {
  microwave: -4.25, kettle: -3.65, toaster: 1.7, 'led-lamp': 2.3, 'phone-charger': 4.6, 'led-tv': 5.2,
};
const GPO_X = [-3.95, 2.0, 4.9];
const SOCK_Y = PY - 0.08;
const METER = { w: 0.86, h: 1.45, d: 0.62 };

export interface LcdLines { watts: string; time: string; joules: string; kwh: string; cost: string }

export interface Kitchen {
  /** per frame: which appliances are switched on, and which are running right now */
  frame(dt: number, isOn: (id: S5Id) => boolean, isActive: (id: S5Id) => boolean): void;
  setMeter(id: S5Id, animate?: boolean): void;
  setLcd(lines: LcdLines, lit: boolean): void;
  /** world-space centre of an appliance (for camera moves) */
  centre(id: S5Id): THREE.Vector3;
  tags: Map<S5Id, HTMLButtonElement>;
  dispose(): void;
}

const mk = (g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh => { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = true; return x; };
const POWER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M12 3v8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/><path d="M6.6 6.8a8 8 0 1 0 10.8 0" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>';

export function createKitchen(stage: KitStage, view: HTMLElement, quality: QualityTier, on: { tap(id: S5Id): void; toggle(id: S5Id): void }): Kitchen {
  const root = new THREE.Group();
  root.name = 's5-kitchen';
  stage.scene.add(root);

  // the mood's fog is tuned for small benches; this room is bigger, so push it back
  const oldFog = stage.scene.fog;
  stage.scene.fog = new THREE.Fog(0xb3aca2, 40, 90);
  // ── shadows cover the whole bench
  const key = stage.keyLight;
  key.position.set(4, 11, 9); key.intensity = 2.0;
  if (key.castShadow) {
    const sc = key.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40; sc.updateProjectionMatrix();
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03;
  }

  // ── benchtop and cabinets
  const q = quartz();
  q.map.repeat.set(3, 1); q.rough.repeat.set(3, 1);
  const stone = new THREE.MeshPhysicalMaterial({ map: q.map, roughnessMap: q.rough, roughness: 0.55, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.18 });
  const top = mk(new RoundedBoxGeometry(BX1 - BX0, 0.4, BZ1 - WALL_Z, 3, 0.06), stone);
  top.position.set((BX0 + BX1) / 2, -0.2, (BZ1 + WALL_Z) / 2); root.add(top);
  const sage = new THREE.MeshPhysicalMaterial({ color: 0x6d7d68, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5 });
  const carcass = mk(new THREE.BoxGeometry(BX1 - BX0, 9, 0.5), new THREE.MeshStandardMaterial({ color: 0x3b4238, roughness: 0.9 }), false);
  carcass.position.set((BX0 + BX1) / 2, -4.9, BZ1 - 0.45); root.add(carcass);
  const doorW = (BX1 - BX0 - 0.1) / 5;
  for (let i = 0; i < 5; i++) {
    const x = BX0 + 0.05 + doorW * (i + 0.5);
    const drawer = mk(new RoundedBoxGeometry(doorW - 0.08, 1.6, 0.12, 2, 0.03), sage); drawer.position.set(x, -1.35, BZ1 - 0.2); root.add(drawer);
    const door = mk(new RoundedBoxGeometry(doorW - 0.08, 6.4, 0.12, 2, 0.03), sage); door.position.set(x, -5.4, BZ1 - 0.2); root.add(door);
    const h1 = mk(new RoundedBoxGeometry(1.3, 0.09, 0.09, 2, 0.035), M.brass()); h1.position.set(x, -0.95, BZ1 - 0.07); root.add(h1);
    const h2 = mk(new RoundedBoxGeometry(0.09, 1.2, 0.09, 2, 0.035), M.brass()); h2.position.set(x + (i % 2 ? -1 : 1) * (doorW / 2 - 0.35), -3.2, BZ1 - 0.07); root.add(h2);
  }
  // ── splashback and side wall
  const tiles = subwayTiles();
  const wallW = BX1 - BX0, wallH = 6.5;
  for (const t of [tiles.map, tiles.bump, tiles.rough]) t.repeat.set(wallW / 6, wallH / 6);
  const tileMat = new THREE.MeshPhysicalMaterial({ map: tiles.map, bumpMap: tiles.bump, bumpScale: 1.6, roughnessMap: tiles.rough, roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.14 });
  const splash = mk(new THREE.PlaneGeometry(wallW, wallH), tileMat, false); splash.position.set((BX0 + BX1) / 2, wallH / 2, WALL_Z); root.add(splash);
  const sideTiles = { map: tiles.map.clone(), bump: tiles.bump.clone(), rough: tiles.rough.clone() };
  const sideD = BZ1 - WALL_Z;
  for (const t of Object.values(sideTiles)) t.repeat.set(sideD / 6, wallH / 6);
  const sideMat = new THREE.MeshPhysicalMaterial({ map: sideTiles.map, bumpMap: sideTiles.bump, bumpScale: 1.6, roughnessMap: sideTiles.rough, roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.14 });
  const side = mk(new THREE.PlaneGeometry(sideD, wallH), sideMat, false); side.rotation.y = Math.PI / 2; side.position.set(BX0, wallH / 2, (BZ1 + WALL_Z) / 2); root.add(side);
  const paint = new THREE.MeshStandardMaterial({ color: 0xe6dfd3, roughness: 0.92 });
  const sideUp = mk(new THREE.PlaneGeometry(sideD + 4, 10), paint, false); sideUp.rotation.y = Math.PI / 2; sideUp.position.set(BX0 - 0.001, wallH + 5, (BZ1 + WALL_Z) / 2); root.add(sideUp);
  // upper cabinets with an LED strip underneath
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf1ede4, roughness: 0.5, clearcoat: 0.2 });
  const upper = mk(new RoundedBoxGeometry(wallW, 6, 3.3, 2, 0.04), white); upper.position.set((BX0 + BX1) / 2, wallH + 3, WALL_Z + 1.65); root.add(upper);
  const groove = new THREE.MeshStandardMaterial({ color: 0x8c877e, roughness: 0.9 });
  for (let i = 1; i < 6; i++) { const gx = mk(new THREE.BoxGeometry(0.04, 6, 0.02), groove, false); gx.position.set(BX0 + wallW * i / 6, wallH + 3, WALL_Z + 3.31); root.add(gx); }
  for (let i = 0; i < 6; i++) { const hx = mk(new RoundedBoxGeometry(0.09, 1.1, 0.09, 2, 0.035), M.brass()); hx.position.set(BX0 + wallW * (i + 0.5) / 6 + (i % 2 ? -1 : 1) * (wallW / 12 - 0.35), wallH + 0.9, WALL_Z + 3.38); root.add(hx); }
  const stripMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 2.2 });
  const strip = mk(new THREE.BoxGeometry(wallW - 1, 0.04, 0.12), stripMat, false); strip.position.set((BX0 + BX1) / 2, wallH - 0.02, WALL_Z + 0.6); root.add(strip);
  const ucl: THREE.PointLight[] = [];
  for (const x of quality === 'low' ? [-3, 4] : [-6.5, -1.5, 3.5, 8]) { const l = new THREE.PointLight(0xffd9a8, quality === 'low' ? 10 : 6, 14, 2); l.position.set(x, wallH - 0.3, WALL_Z + 1.9); root.add(l); ucl.push(l); }

  // chopping board leaning on the splashback
  const board = mk(new RoundedBoxGeometry(2.0, 2.9, 0.18, 3, 0.08), M.timber('bench')); board.position.set(-0.75, 1.42, WALL_Z + 0.32); board.rotation.x = -0.1; root.add(board);
  const hole = mk(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }), false); hole.position.set(-0.75, 2.55, WALL_Z + 0.43); hole.rotation.x = -0.1; root.add(hole);

  // ── power points
  const gpoWhite = new THREE.MeshPhysicalMaterial({ color: 0xf6f5f1, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const rockers = new Map<S5Id, { mesh: THREE.Mesh; mark: THREE.MeshStandardMaterial }>();
  for (const gx of GPO_X) {
    const plate = mk(new RoundedBoxGeometry(1.25, 0.78, 0.07, 2, 0.03), gpoWhite); plate.position.set(gx, PY, WALL_Z + 0.035); root.add(plate);
  }
  const slots = (x: number, y: number, z: number, parent: THREE.Object3D) => {
    for (const s of [-1, 1]) { const sl = mk(new THREE.BoxGeometry(0.03, 0.1, 0.01), slotMat, false); sl.position.set(x + s * 0.065, y + 0.03, z); sl.rotation.z = -s * 0.52; parent.add(sl); }
    const e = mk(new THREE.BoxGeometry(0.03, 0.1, 0.01), slotMat, false); e.position.set(x, y - 0.1, z); parent.add(e);
  };
  for (const id of S5_IDS) {
    const sx = SOCKET_X[id];
    slots(sx, SOCK_Y, WALL_Z + 0.072, root);
    const mark = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.5, emissive: 0xff3a1a, emissiveIntensity: 0 });
    const rocker = mk(new RoundedBoxGeometry(0.15, 0.2, 0.05, 2, 0.02), gpoWhite); rocker.position.set(sx, PY + 0.22, WALL_Z + 0.08); root.add(rocker);
    const m = mk(new THREE.BoxGeometry(0.07, 0.035, 0.01), mark, false); m.position.set(0, 0.06, 0.027); rocker.add(m);
    rockers.set(id, { mesh: rocker, mark });
  }

  // ── appliances
  const models = new Map<S5Id, ApplianceModel>();
  const list: ApplianceModel[] = [createMicrowave(), createKettle(), createToaster(quality), createLamp(quality), createPhone(), createTv()];
  for (const m of list) {
    const p = PLACE[m.id];
    m.group.position.set(p.x, 0, p.z); m.group.rotation.y = p.ry;
    m.group.userData.s5id = m.id;
    const sh = contactShadow(m.foot[0] * 1.15, m.foot[1] * 1.15, 0.45); m.group.add(sh);
    root.add(m.group);
    models.set(m.id, m);
  }

  // ── plugs, the charger pack, cords
  const plugBlack = new THREE.MeshPhysicalMaterial({ color: 0x1b1c1e, roughness: 0.45, clearcoat: 0.2 });
  const plugWhite = new THREE.MeshPhysicalMaterial({ color: 0xf0f0ee, roughness: 0.4, clearcoat: 0.3 });
  const plugs = new Map<S5Id, THREE.Group>();
  const cordMats = new Map<number, THREE.MeshPhysicalMaterial>();
  const cordMat = (c: number) => { let m = cordMats.get(c); if (!m) { m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }); cordMats.set(c, m); } return m; };
  const cords = new Map<S5Id, THREE.Mesh>();
  for (const id of S5_IDS) {
    let plug: THREE.Group;
    if (id === 'phone-charger') plug = createChargerPack();
    else {
      plug = new THREE.Group();
      const white = models.get(id)!.cordColour > 0x808080;
      const b = mk(new RoundedBoxGeometry(0.3, 0.36, 0.2, 2, 0.06), white ? plugWhite : plugBlack); b.position.set(0, 0, 0.1); plug.add(b);
      const grip = mk(new THREE.CylinderGeometry(0.05, 0.035, 0.12, 12), white ? plugWhite : plugBlack); grip.position.set(0, -0.22, 0.1); plug.add(grip);
    }
    plug.userData.s5id = id;
    root.add(plug);
    plugs.set(id, plug);
    const cord = mk(new THREE.BufferGeometry(), cordMat(models.get(id)!.cordColour), true);
    cord.userData.s5id = id;
    root.add(cord); cords.set(id, cord);
  }

  // ── the plug-in power meter
  const meter = new THREE.Group();
  const meterWhite = new THREE.MeshPhysicalMaterial({ color: 0xf4f3ef, roughness: 0.36, clearcoat: 0.45, clearcoatRoughness: 0.25 });
  const mb = mk(new RoundedBoxGeometry(METER.w, METER.h, METER.d, 3, 0.09), meterWhite); mb.position.set(0, 0, METER.d / 2); meter.add(mb);
  const bezel = mk(new RoundedBoxGeometry(0.74, 0.58, 0.03, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5 })); bezel.position.set(0, 0.32, METER.d + 0.005); meter.add(bezel);
  const [lc, lctx] = canvas(256, 192);
  const ltex = new THREE.CanvasTexture(lc); ltex.colorSpace = THREE.SRGBColorSpace; ltex.anisotropy = 8;
  const lcdMat = new THREE.MeshStandardMaterial({ map: ltex, emissive: 0xffffff, emissiveMap: ltex, emissiveIntensity: 0.35, roughness: 0.25 });
  const lcd = mk(new THREE.PlaneGeometry(0.68, 0.51), lcdMat, false); lcd.position.set(0, 0.32, METER.d + 0.022); meter.add(lcd);
  for (const [bx, col] of [[-0.18, 0xf08a24], [0.18, 0x9aa3ad]] as const) {
    const b = mk(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 20).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.4 })); b.position.set(bx, -0.1, METER.d + 0.01); meter.add(b);
  }
  slots(0, -0.42, METER.d + 0.002, meter);
  const brand = mk(new THREE.PlaneGeometry(0.44, 0.07), new THREE.MeshStandardMaterial({ map: M.labelTexture('POWER METER', { width: 256, height: 40, bg: '#f4f3ef', fg: '#55595f', size: 26 }), roughness: 0.5 }), false);
  brand.position.set(0, 0.65, METER.d + 0.002); meter.add(brand);
  meter.userData.s5meter = true;
  root.add(meter);

  let meterOn: S5Id = 'kettle';
  let anim: { from: S5Id; to: S5Id; t: number } | null = null;
  const plugAt = (id: S5Id, inMeter: number) => {
    // inMeter 0 = in the wall socket, 1 = in the meter's front socket
    const sx = SOCKET_X[id];
    return new THREE.Vector3(sx, SOCK_Y - inMeter * 0.34, WALL_Z + 0.07 + inMeter * METER.d);
  };
  const meterPos = (id: S5Id) => new THREE.Vector3(SOCKET_X[id], SOCK_Y + 0.08, WALL_Z + 0.07);
  const tmp = new THREE.Vector3();
  const buildCord = (id: S5Id) => {
    const plug = plugs.get(id)!;
    const m = models.get(id)!;
    const start = plug.position.clone().add(id === 'phone-charger' ? tmp.set(0, -0.25, 0.22) : tmp.set(0, -0.27, 0.1));
    const exit = m.group.localToWorld(m.cordExit.clone());
    const r = 0.028, yb = r + 0.006;
    const backZ = WALL_Z + 0.32;
    const pts = [start, start.clone().add(new THREE.Vector3(0, -0.4, 0.04)), new THREE.Vector3(start.x, Math.min(0.5, start.y - 0.9), backZ - 0.05),
      new THREE.Vector3(start.x * 0.75 + exit.x * 0.25, yb, backZ + 0.05), new THREE.Vector3(start.x * 0.3 + exit.x * 0.7, yb, backZ * 0.4 + exit.z * 0.6)];
    if (exit.y > 0.15) pts.push(new THREE.Vector3(exit.x, yb, exit.z - 0.25), exit);
    else pts.push(new THREE.Vector3(exit.x, yb, exit.z), );
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const cord = cords.get(id)!;
    cord.geometry.dispose();
    cord.geometry = new THREE.TubeGeometry(curve, 72, r, 7);
  };
  const placePlugs = () => {
    for (const id of S5_IDS) {
      let k = id === meterOn ? 1 : 0;
      if (anim) {
        const e = Math.min(1, anim.t / 0.7), s = e * e * (3 - 2 * e);
        if (id === anim.from) k = 1 - s; else if (id === anim.to) k = s;
      }
      plugs.get(id)!.position.copy(plugAt(id, k));
    }
    if (anim) {
      const e = Math.min(1, anim.t / 0.7), s = e * e * (3 - 2 * e);
      meter.position.lerpVectors(meterPos(anim.from), meterPos(anim.to), s);
      meter.position.z += Math.sin(Math.PI * s) * 0.9;
      meter.position.y += Math.sin(Math.PI * s) * 0.4;
    } else meter.position.copy(meterPos(meterOn));
  };
  placePlugs();
  for (const id of S5_IDS) buildCord(id);

  // ── energy packets
  const MAX = quality === 'high' ? 520 : quality === 'medium' ? 380 : 180;
  const pos = new Float32Array(MAX * 3), alpha = new Float32Array(MAX), size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), age = new Float32Array(MAX).fill(99), life = new Float32Array(MAX).fill(1);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute('aA', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute('aS', new THREE.BufferAttribute(size, 1));
  pgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 30);
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(Q.energy.colour) }, uScale: { value: 400 } },
    vertexShader: `attribute float aA; attribute float aS; uniform float uScale; varying float vA;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aA; gl_PointSize = aS * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; varying float vA;
      void main() { vec2 p = gl_PointCoord - 0.5; float d = length(p);
        float core = smoothstep(0.31, 0.27, d); float halo = smoothstep(0.5, 0.3, d) * 0.35;
        float a = max(core, halo) * vA; if (a < 0.01) discard;
        float rim = smoothstep(0.2, 0.29, d) * core;
        vec3 c = mix(uC * 1.6, uC * 0.75, rim);
        c += vec3(0.35, 0.18, 0.05) * smoothstep(0.16, 0.0, length(p + vec2(0.07, -0.07)));
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(pgeo, pmat);
  points.frustumCulled = false; points.renderOrder = 5;
  root.add(points);
  const spawnAcc = new Map<S5Id, number>(S5_IDS.map((id) => [id, 0]));
  let cursor = 0;
  const hotW = new THREE.Vector3();
  const spawn = (m: ApplianceModel) => {
    let i = -1;
    for (let k = 0; k < MAX; k++) { const j = (cursor + k) % MAX; if (age[j] >= life[j]) { i = j; break; } }
    if (i < 0) return;
    cursor = (i + 1) % MAX;
    m.group.localToWorld(hotW.copy(m.hot));
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * m.hotR;
    pos[i * 3] = hotW.x + Math.cos(a) * rr; pos[i * 3 + 1] = hotW.y + (Math.random() - 0.5) * m.hotR * 0.6; pos[i * 3 + 2] = hotW.z + Math.sin(a) * rr * 0.6;
    vel[i * 3] = Math.cos(a) * 0.18; vel[i * 3 + 1] = 0.55 + Math.random() * 0.35; vel[i * 3 + 2] = Math.sin(a) * 0.12 + 0.08;
    age[i] = 0; life[i] = 1.6 + Math.random() * 0.7; size[i] = 0.26 + Math.random() * 0.06;
    (pgeo.attributes.aS as THREE.BufferAttribute).needsUpdate = true;
  };
  const resize = () => {
    const h = stage.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    pmat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
  };
  const offResize = stage.onResize(resize);
  resize();

  // ── DOM on/off tags
  const tagLayer = document.createElement('div');
  tagLayer.className = 's5-tags';
  view.appendChild(tagLayer);
  const tags = new Map<S5Id, HTMLButtonElement>();
  for (const id of S5_IDS) {
    const a = s5Appliance(id);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 's5-tag'; b.dataset.id = id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="s5-tag-pw">${POWER_SVG}</span><span class="s5-tag-txt"><span class="s5-tag-name">${a.name}</span><span class="s5-tag-w">${a.powerW} W</span></span><span class="s5-tag-meter" aria-hidden="true">meter</span>`;
    b.title = `Switch the ${a.name} on or off`;
    b.addEventListener('click', (e) => { e.stopPropagation(); on.toggle(id); });
    tagLayer.appendChild(b);
    tags.set(id, b);
  }
  const anchorW = new THREE.Vector3();

  // ── picking: tap an appliance (or its plug / cord) to move the meter there
  const pickables: THREE.Object3D[] = [...list.map((m) => m.group), ...plugs.values(), ...cords.values()];
  let down: { x: number; y: number; id: number } | null = null;
  const idOf = (o: THREE.Object3D | null): S5Id | null => { while (o) { if (o.userData.s5id) return o.userData.s5id as S5Id; o = o.parent; } return null; };
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
  const onUp = (e: PointerEvent) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 8 || stage.orbiting) return;
    const hit = stage.pick(e.clientX, e.clientY, pickables).find((h) => h.object.visible && !(h.object as THREE.Points).isPoints && h.object.name !== 'contactShadow');
    const id = hit ? idOf(hit.object) : null;
    if (id) on.tap(id);
  };
  let hoverT = 0;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const now = performance.now(); if (now - hoverT < 80) return; hoverT = now;
    const hit = stage.pick(e.clientX, e.clientY, pickables).find((h) => h.object.name !== 'contactShadow');
    stage.canvas.style.cursor = hit && idOf(hit.object) ? 'pointer' : '';
  };
  stage.canvas.addEventListener('pointerdown', onDown);
  stage.canvas.addEventListener('pointerup', onUp);
  stage.canvas.addEventListener('pointermove', onMove);

  const kitchen: Kitchen = {
    tags,
    frame(dt, isOn, isActive) {
      if (anim) {
        anim.t += dt;
        placePlugs(); buildCord(anim.from); buildCord(anim.to);
        if (anim.t >= 0.7) { anim = null; placePlugs(); }
      }
      for (const m of list) {
        const act = isActive(m.id);
        m.update(act, dt, 0);
        const r = rockers.get(m.id)!;
        const o = isOn(m.id);
        r.mesh.rotation.x = o ? -0.16 : 0.16;
        r.mark.emissiveIntensity = o ? 1.6 : 0;
        r.mark.color.setHex(o ? 0xd8341c : 0x777777);
        if (act) {
          let acc = spawnAcc.get(m.id)! + dt * packetRate(s5Appliance(m.id).powerW) * (quality === 'low' ? 0.6 : 1);
          while (acc >= 1) { spawn(m); acc -= 1; }
          spawnAcc.set(m.id, Math.min(acc, 2));
        }
      }
      for (let i = 0; i < MAX; i++) {
        if (age[i] >= life[i]) { alpha[i] = 0; continue; }
        age[i] += dt;
        const k = age[i] / life[i];
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3] *= 0.985; vel[i * 3 + 2] *= 0.985;
        alpha[i] = Math.min(1, k * 8) * (1 - Math.pow(k, 2.2));
      }
      (pgeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (pgeo.attributes.aA as THREE.BufferAttribute).needsUpdate = true;
      // tags follow their appliances
      for (const m of list) {
        const b = tags.get(m.id)!;
        const p = stage.toScreen(m.group.localToWorld(anchorW.copy(m.tag)));
        if (!p.visible) { b.style.visibility = 'hidden'; continue; }
        b.style.visibility = '';
        b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, 4px)`;
        const o = isOn(m.id);
        if (b.getAttribute('aria-pressed') !== String(o)) b.setAttribute('aria-pressed', String(o));
        b.classList.toggle('is-metered', m.id === meterOn);
      }
    },
    setMeter(id, animate = true) {
      if (id === meterOn && !anim) return;
      const from = meterOn;
      meterOn = id;
      if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) anim = { from, to: id, t: 0 };
      else { anim = null; placePlugs(); buildCord(from); buildCord(id); }
    },
    setLcd(lines, lit) {
      drawMeterLcd(lctx, 256, 192, lines, lit);
      ltex.needsUpdate = true;
      lcdMat.emissiveIntensity = lit ? 0.55 : 0.3;
    },
    centre(id) {
      const m = models.get(id)!;
      return m.group.localToWorld(m.hot.clone());
    },
    dispose() {
      stage.canvas.removeEventListener('pointerdown', onDown);
      stage.canvas.removeEventListener('pointerup', onUp);
      stage.canvas.removeEventListener('pointermove', onMove);
      offResize();
      tagLayer.remove();
      for (const t of Object.values(sideTiles)) t.dispose();
      disposeTree(root);
      stage.scene.fog = oldFog;
      void ucl;
    },
  };
  return kitchen;
}
