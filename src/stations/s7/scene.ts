// Station 7 3D scene: a display turntable showing one power station at a time, energy packets that change form
// along the chain, and fixed grid pieces (transformer, pylon, house) that receive the electricity.
import * as THREE from 'three';
import type { QualityTier } from '../../types';
import { createStage, contactShadow, type KitStage } from '../../kit/stage';
import * as M from '../../kit/materials';
import { canvas } from '../../kit/textures';
import { disposeTree } from '../../kit/dispose';
import { mesh, rbox } from '../../kit/parts/common';
import { formStyle, sourceById, type SourceId } from './logic';
import { DECK_OUT, buildMachine, type Machine } from './machines';
import { createHouse, createPylon, createTransformer, disposeS7Materials, paint, wireBetween } from './parts';

export interface S7Scene {
  stage: KitStage;
  readonly source: SourceId;
  readonly switching: boolean;
  show(id: SourceId, instant?: boolean): void;
  /** current machine (null while switching) */
  machine(): Machine | null;
  /** what this source does without (shown as a fixed callout), or null */
  note(): string | null;
  /** labels: world points with text for the DOM layer */
  labelPoints(): { pos: THREE.Vector3; text: string; colour: string; kind: 'step' | 'note' | 'place' }[];
  /** true if the pointer is over the current generator */
  generatorAt(x: number, y: number): boolean;
  dispose(): void;
}

const PACKET_MAX = 260;
const TX = new THREE.Vector3(4.95, 0, -1.25), PYLON = new THREE.Vector3(4.75, 0, -4.4), HOUSE = new THREE.Vector3(6.85, 0, -3.3);

function deckTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 1024);
  ctx.fillStyle = '#1b1e23'; ctx.fillRect(0, 0, 1024, 1024);
  for (let r = 40; r < 512; r += 9) { ctx.strokeStyle = r % 54 < 9 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.025)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(512, 512, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(224,166,58,0.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(512, 512, 500, 0, Math.PI * 2); ctx.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function packetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute float aSize; attribute vec3 aColor; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; vC = aColor; vA = aAlpha; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p);
        float a = smoothstep(1.0, 0.75, r) * 0.55 + smoothstep(0.55, 0.0, r) * 0.6;
        vec3 c = mix(vC, vec3(1.0), smoothstep(0.35, 0.0, r) * 0.55);
        a *= vA; if (a < 0.01) discard; gl_FragColor = vec4(c * a, a); }`,
    // packets are a teaching overlay: always drawn on top so they can be followed through pipes and casings
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
}

interface Path { pts: THREE.Vector3[]; cum: number[]; steps: number[]; len: number }
function makePath(pts: { p: THREE.Vector3; step: number }[]): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].p.distanceTo(pts[i - 1].p));
  return { pts: pts.map((x) => x.p), cum, steps: pts.map((x) => x.step), len: cum[cum.length - 1] };
}
function sampleAt(path: Path, d: number, out: THREE.Vector3): number {
  let i = 1;
  while (i < path.cum.length - 1 && path.cum[i] < d) i++;
  const a = path.cum[i - 1], b = path.cum[i];
  out.lerpVectors(path.pts[i - 1], path.pts[i], b > a ? (d - a) / (b - a) : 0);
  return path.steps[i - 1];
}

export function createS7Scene(view: HTMLElement, quality: QualityTier): S7Scene {
  const stage = createStage(view, quality, { mood: 'dark', target: [1.2, 1.5, 0], distance: 13, yaw: 0.18, pitch: 0.36, minDistance: 4, maxDistance: 34 });
  const { scene, renderer } = stage;
  scene.fog = new THREE.Fog(0x05070d, 24, 60);
  stage.keyLight.intensity = 2.1;
  stage.keyLight.position.set(4, 9, 6);
  stage.setPanBounds(-5, 8, -4, 3);
  const world = new THREE.Group(); scene.add(world);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5); fill.position.set(-6, 4, 5); world.add(fill);
  // one shared point light for fire and sun glow: the light count never changes, so no shader recompiles on switching
  const lamp = new THREE.PointLight(0xff7a30, 0, 6, 1.6); world.add(lamp);

  // studio floor and the turntable
  const floor = mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.7, metalness: 0 }), false);
  floor.position.y = -0.32; world.add(floor);
  const rim = mesh(new THREE.CylinderGeometry(4.45, 4.55, 0.26, 96), new THREE.MeshStandardMaterial({ color: 0x8d9298, metalness: 1, roughness: 0.5, roughnessMap: M.steel().roughnessMap }));
  rim.position.y = -0.19; world.add(rim);
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.018, 6, 128).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x56c8ff }));
  ledRing.position.y = -0.3; world.add(ledRing);
  const deckTex = deckTexture();
  const deck = new THREE.Group(); world.add(deck);
  const top = mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.06, 96), [
    new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.6, roughness: 0.4 }),
    new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.62, metalness: 0.1 }),
    new THREE.MeshStandardMaterial({ color: 0x2a2e33 }),
  ] as unknown as THREE.Material);
  top.position.y = -0.03; deck.add(top);
  const socket = mesh(rbox(0.3, 0.12, 0.3, 0.03), paint(0x3a3f44, 0.5, 0.5)); socket.position.copy(DECK_OUT).setY(0.06); deck.add(socket);

  // grid: concrete pad, transformer, pylon, house, and the lines between them
  const pad = mesh(rbox(3.5, 0.32, 5.0, 0.05, 2), paint(0x8f8c84, 0.9, 0)); pad.position.set(6.4, -0.16, -2.85); world.add(pad);
  const tx = createTransformer(); tx.position.copy(TX); tx.rotation.y = -0.3; world.add(tx);
  const pylon = createPylon(); pylon.position.copy(PYLON); pylon.rotation.y = -0.5; world.add(pylon);
  const house = createHouse(); house.position.copy(HOUSE); house.rotation.y = -0.6; world.add(house);
  for (const o of [tx, pylon, house]) { const sh = contactShadow(1.6, 1.6, 0.4); sh.position.set(o.position.x, 0.005, o.position.z); world.add(sh); }
  world.updateMatrixWorld(true);
  const txTop = tx.localToWorld((tx.userData.top as THREE.Vector3).clone());
  const att = pylon.userData.attach.map((p) => pylon.localToWorld(p.clone()));
  const service = house.localToWorld(house.userData.service.clone());
  const w1 = wireBetween(txTop, att[0], 0.35);
  const w2 = wireBetween(att[1], service, 0.4);
  const w0 = wireBetween(new THREE.Vector3(4.45, 0.04, -1.3), tx.localToWorld(new THREE.Vector3(-0.46, 0.3, 0)), 0, 0.045, M.insulation('black'));
  world.add(w1.mesh, w2.mesh, w0.mesh);
  const gridRoute = [DECK_OUT.clone(), new THREE.Vector3(4.45, 0.04, -1.3), ...[tx.localToWorld(new THREE.Vector3(-0.46, 0.3, 0)), txTop], ...w1.pts.slice(1), att[0], att[0].clone().setY(att[0].y - 0.05), att[1], ...w2.pts.slice(1)];

  // packets
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PACKET_MAX * 3), col = new Float32Array(PACKET_MAX * 3), size = new Float32Array(PACKET_MAX), alpha = new Float32Array(PACKET_MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const pMat = packetMaterial();
  const points = new THREE.Points(geo, pMat); points.frustumCulled = false; points.renderOrder = 12; world.add(points);
  const pool = Array.from({ length: PACKET_MAX }, () => ({ alive: false, path: 0, d: 0, step: 0, flash: 0 }));
  let paths: Path[] = [];
  let colours: THREE.Color[] = [];
  let spawnAcc = 0;

  // machines
  const built = new Map<SourceId, Machine>();
  let current: SourceId = 'coal';
  let machine: Machine | null = null;
  const machineFor = (id: SourceId): Machine => {
    let m = built.get(id);
    if (!m) { m = buildMachine(id); built.set(id, m); deck.add(m.group); m.group.visible = false; }
    return m;
  };
  const activate = (id: SourceId) => {
    for (const [k, m] of built) m.group.visible = k === id;
    machine = machineFor(id);
    machine.group.visible = true;
    machine.group.position.y = 0; machine.group.scale.setScalar(1);
    const src = sourceById(id);
    const last = src.chain.length - 1;
    paths = machine.routes.map((r) => makePath([...r.map((x) => ({ p: x.p, step: Math.max(0, x.step) })), ...gridRoute.map((p) => ({ p, step: last }))]));
    colours = src.chain.map((c) => new THREE.Color(formStyle(c.form).colour));
    for (const p of pool) p.alive = false;
    // pre-fill so the chain is already flowing when it appears
    for (let i = 0; i < 60; i++) { const p = pool[i]; p.alive = true; p.path = i % paths.length; p.d = (i / 60) * paths[p.path].len; p.step = -1; p.flash = 0; }
  };

  // framing per machine, widened on portrait screens
  let aspect = 1.6;
  const frame = (m: Machine, secs = 0.9) => {
    const portrait = aspect < 1;
    const k = portrait ? Math.max(1.12, 1.08 / aspect) : Math.max(1.12, 1.75 / aspect);
    const v = m.view;
    const target: [number, number, number] = [v.target[0] + (portrait ? 0.7 : 1.5), v.target[1] + (portrait ? 1.0 : 0), v.target[2] - 0.6];
    stage.setHome({ target, distance: v.distance * k, yaw: v.yaw, pitch: v.pitch, maxDistance: Math.max(34, v.distance * k * 1.5) }, false);
    stage.flyTo({ target, distance: v.distance * k, yaw: v.yaw, pitch: v.pitch }, secs);
  };
  const offResize = stage.onResize((w, hh) => { aspect = w / Math.max(1, hh); if (machine && !stage.userMoved) frame(machine, 0); });
  aspect = view.clientWidth / Math.max(1, view.clientHeight);

  // switching: the old machine sinks while the turntable turns, then the new one rises
  let sw: { from: SourceId; to: SourceId; t: number } | null = null;
  const SW = 1.1;
  const show = (id: SourceId, instant = false) => {
    if (instant || !machine) { sw = null; current = id; deck.rotation.y = 0; activate(id); frame(machine!, instant ? 0 : 0.9); return; }
    if (id === current && !sw) return;
    sw = { from: sw ? sw.to : current, to: id, t: 0 };
    current = id;
    machineFor(id);
    for (const p of pool) p.alive = false;
    frame(built.get(id)!, SW);
  };

  const tmp = new THREE.Vector3();
  const offFrame = stage.onFrame((dt, t) => {
    pMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
    ledRing.material.color.setHSL(0.55, 0.8, 0.45 + 0.08 * Math.sin(t * 2));
    if (sw) {
      sw.t += dt;
      const k = Math.min(1, sw.t / SW);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      deck.rotation.y = e * Math.PI * 2;
      const a = built.get(sw.from)!, b = built.get(sw.to)!;
      if (k < 0.5) {
        const s = 1 - k * 2;
        a.group.visible = true; b.group.visible = sw.from === sw.to;
        a.group.scale.setScalar(Math.max(0.001, 0.4 + 0.6 * s)); a.group.position.y = -(1 - s) * 2.2;
        machine = null;
      } else {
        const s = (k - 0.5) * 2;
        if (sw.from !== sw.to) a.group.visible = false;
        b.group.visible = true;
        b.group.scale.setScalar(0.4 + 0.6 * s); b.group.position.y = -(1 - s) * 2.2;
      }
      if (k >= 1) { deck.rotation.y = 0; const to = sw.to; sw = null; activate(to); }
    }
    if (machine) machine.tick(dt, t, stage.camera);
    if (machine && machine.lamp) { lamp.position.copy(machine.lamp.pos); lamp.color.setHex(machine.lamp.colour); lamp.intensity = machine.lamp.intensity(t); }
    else lamp.intensity = 0;
    house.userData.setLit(machine ? 1 : 0.2);
    // packets
    if (machine && paths.length) {
      spawnAcc += dt * 5.5;
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        const p = pool.find((x) => !x.alive);
        if (p) { p.alive = true; p.path = Math.floor(Math.random() * paths.length); p.d = 0; p.step = -1; p.flash = 0; }
      }
    }
    for (let i = 0; i < PACKET_MAX; i++) {
      const p = pool[i];
      if (!p.alive || !machine) { alpha[i] = 0; continue; }
      const path = paths[p.path];
      p.d += dt * 1.55;
      if (p.d >= path.len) { p.alive = false; alpha[i] = 0; continue; }
      const step = sampleAt(path, p.d, tmp);
      if (p.step !== -1 && step !== p.step) p.flash = 1;
      p.step = step;
      p.flash = Math.max(0, p.flash - dt * 2.5);
      pos[i * 3] = tmp.x; pos[i * 3 + 1] = tmp.y; pos[i * 3 + 2] = tmp.z;
      const c = colours[Math.min(step, colours.length - 1)];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = 0.24 + p.flash * 0.3;
      alpha[i] = Math.min(1, p.d * 3) * Math.min(1, (path.len - p.d) * 2) * (0.95 + p.flash * 0.6);
    }
    for (const n of ['position', 'aColor', 'aSize', 'aAlpha']) (geo.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
  });

  // build every machine now and compile their shaders once, so switching later does not stall
  for (const id of ['coal', 'gas', 'hydro', 'wind', 'solar'] as SourceId[]) machineFor(id).group.visible = true;
  try { renderer.compile(scene, stage.camera); } catch { /* compile is an optimisation only */ }
  show('coal', true);

  return {
    stage,
    get source() { return current; },
    get switching() { return !!sw; },
    show,
    machine: () => machine,
    note: () => (machine && machine.notes.length ? machine.notes[0].text : null),
    labelPoints() {
      if (!machine) return [];
      const src = sourceById(current);
      const out: ReturnType<S7Scene['labelPoints']> = src.chain.map((c, i) => ({ pos: machine!.anchors[i], text: `${formStyle(c.form).label}: ${c.device}`, colour: formStyle(c.form).colour, kind: 'step' as const }));
      out.push({ pos: txTop.clone().add(new THREE.Vector3(0, 0.35, 0)), text: 'Transformer', colour: '#cfd6de', kind: 'place' });
      out.push({ pos: service.clone().add(new THREE.Vector3(-1.2, 0.6, 0.4)), text: 'Electrical energy to homes', colour: formStyle('electrical').colour, kind: 'place' });
      return out;
    },
    generatorAt(x, y) {
      const m = machine;
      if (!m || !m.generator) return false;
      return stage.pick(x, y, [m.generator]).length > 0;
    },
    dispose() {
      offFrame(); offResize();
      disposeTree(world);
      deckTex.dispose();
      disposeS7Materials();
      stage.dispose();
    },
  };
}
