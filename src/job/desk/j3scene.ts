// Job 3 scene: a kitchen bench with a power board, seven appliances and two wall points.
import * as THREE from 'three';
import * as M from '../../kit/materials';
import { canvas } from '../../kit/textures';
import { createStage, type KitStage } from '../../kit/stage';
import { disposeTree } from '../../kit/dispose';
import { rbox, mesh } from '../../kit/parts/common';
import type { QualityTier } from '../../types';
import { BOARD_APPLIANCES, applianceCurrent } from '../../sim/powerboard';
import { approach, createLabelLayer, curveThrough, lightDimmer, PacketStream, type LabelLayer } from './scene';
import { APPLIANCE_BUILDERS, buildPowerBoard, buildWallPoint, cordMesh, plugBody, type ApplianceModel } from './j3models';
import type { Gauge } from './ui';
import type { Slot } from './j3logic';

const BOARD_POS = new THREE.Vector3(0.4, 0, -1.8);
const WALL_Z = -3.4;
const WALL_A = new THREE.Vector3(-5.2, 2.5, WALL_Z + 0.07);
const WALL_B = new THREE.Vector3(5.2, 2.5, WALL_Z + 0.07);
/** appliance resting positions on the bench while it sits on the power board */
const BOARD_LAYOUT: Record<string, [number, number]> = {
  heater: [-5.2, 1.7], kettle: [-2.7, 2.0], toaster: [-0.7, 1.9], iron: [1.9, 2.0], 'sandwich-press': [4.7, 1.8], 'phone-charger': [6.4, -1.0], lamp: [-6.6, -1.3],
};
const ORDER = ['heater', 'kettle', 'toaster', 'iron', 'sandwich-press', 'phone-charger', 'lamp'];

export interface J3Scene {
  stage: KitStage;
  setMode(mode: 'board' | 'plan'): void;
  /** plan mode: where each appliance sits */
  setAssign(assign: Record<string, Slot | undefined>): void;
  /** step 1: plug things in until the 10 A cut-out pops. Calls onDone when the board has tripped. */
  playTrip(onDone: () => void): void;
  resetBoard(): void;
  /** step 5: switch on every placed appliance; the gauges climb, a circuit over 16 A trips */
  playRun(assign: Record<string, Slot | undefined>, onDone: (r: { tripA: boolean; tripB: boolean }) => void): void;
  resetRun(): void;
  setGauges(g: { board: Gauge; a: Gauge; b: Gauge }): void;
  /** current reading for the dashboard strip */
  onReading(cb: (amps: number | null) => void): void;
  isBusy(): boolean;
  dispose(): void;
}

function tileTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  ctx.fillStyle = '#b9b6ad'; ctx.fillRect(0, 0, 256, 128);
  const tile = (x: number, y: number) => {
    const g = ctx.createLinearGradient(x, y, x, y + 64);
    g.addColorStop(0, '#f6f5f0'); g.addColorStop(1, '#e6e4dc');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x + 3, y + 3, 122, 58, 6); ctx.fill();
  };
  tile(0, 0); tile(128, 0); tile(-64, 64); tile(64, 64); tile(192, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

export function createJ3Scene(view: HTMLElement, quality: QualityTier): J3Scene {
  const stage = createStage(view, quality, { mood: 'kitchen', target: [0, 1.0, 0], distance: 17, yaw: 0, pitch: 0.62, minDistance: 8, maxDistance: 30 });
  if (stage.scene.fog) { (stage.scene.fog as THREE.Fog).near = 40; (stage.scene.fog as THREE.Fog).far = 90; }
  const root = new THREE.Group();
  stage.scene.add(root);
  const sc = stage.keyLight.shadow.camera as THREE.OrthographicCamera;
  sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.far = 40; sc.updateProjectionMatrix();

  // ── room ──
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(44, 16), new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.92 }));
  wall.position.set(0, 5.4, WALL_Z - 0.05); wall.receiveShadow = true; root.add(wall);
  const tiles = tileTexture(); tiles.repeat.set(22, 3.6);
  const splash = new THREE.Mesh(new THREE.PlaneGeometry(44, 3.6), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.22, metalness: 0 }));
  splash.position.set(0, 1.8, WALL_Z); splash.receiveShadow = true; root.add(splash);
  const benchTop = mesh(rbox(19, 0.5, 7.6, 0.05), M.timber('bench', 3, 1)); benchTop.position.set(0, -0.25, -0.0); root.add(benchTop);
  const cab = mesh(rbox(18.4, 4.4, 7.0, 0.06), new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.5 })); cab.position.set(0, -2.7, -0.1); root.add(cab);
  for (const x of [-4.6, 0, 4.6]) { const h = mesh(rbox(0.12, 1.4, 0.12, 0.04), M.nickel()); h.position.set(x + 1.2, -1.2, 3.46); root.add(h); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x8d8579, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -4.95; floor.receiveShadow = true; root.add(floor);

  // ── wall points ──
  const wa = buildWallPoint('Circuit A'); wa.group.position.copy(WALL_A); root.add(wa.group);
  const wb = buildWallPoint('Circuit B'); wb.group.position.copy(WALL_B); root.add(wb.group);

  // ── board ──
  const board = buildPowerBoard(); board.group.position.copy(BOARD_POS); root.add(board.group);
  const cordMat = new THREE.MeshStandardMaterial({ color: 0xefece4, roughness: 0.6 });
  const darkCord = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.7 });
  // board cord to wall A
  const boardCordPlug = plugBody(); root.add(boardCordPlug);
  let boardCord: THREE.Mesh | null = null;
  const boardStream = new PacketStream(curveThrough([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]), 0xffa23a, { max: 28, size: 0.1 });
  root.add(boardStream.mesh);

  // ── appliances ──
  interface Item { id: string; m: ApplianceModel; cord: THREE.Mesh | null; plug: THREE.Group; stream: PacketStream; pos: THREE.Vector3; tgt: THREE.Vector3; scale: number; tscale: number; on: boolean; plugged: boolean; dirty: boolean; to: THREE.Vector3; rot: number }
  const items = new Map<string, Item>();
  for (const id of ORDER) {
    const m = APPLIANCE_BUILDERS[id]();
    const [x, z] = BOARD_LAYOUT[id];
    const plug = plugBody();
    const stream = new PacketStream(curveThrough([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]), 0xffa23a, { max: 14, size: 0.085 });
    const it: Item = { id, m, cord: null, plug, stream, pos: new THREE.Vector3(x, 0, z), tgt: new THREE.Vector3(x, 0, z), scale: 1, tscale: 1, on: false, plugged: true, dirty: true, to: new THREE.Vector3(), rot: 0 };
    m.group.position.copy(it.pos);
    root.add(m.group, plug, stream.mesh);
    items.set(id, it);
  }

  let mode: 'board' | 'plan' = 'board';
  let assign: Record<string, Slot | undefined> = {};

  const socketWorld = (i: number) => board.sockets[i].clone().add(BOARD_POS);
  const wallSocket = (w: 'A' | 'B', k: number) => (w === 'A' ? WALL_A : WALL_B).clone().add(new THREE.Vector3((k % 3 - 1) * 0.0, -0.05, 0.14));

  /** destination (socket) for an appliance's cord in the current mode */
  function destination(id: string): { p: THREE.Vector3; kind: 'board' | 'wall' | 'none' } {
    if (mode === 'board') return { p: socketWorld(ORDER.indexOf(id)), kind: 'board' };
    const a = assign[id];
    if (a === 'A' || a === 'B') return { p: wallSocket(a, ORDER.indexOf(id)), kind: 'wall' };
    return { p: new THREE.Vector3(), kind: 'none' };
  }

  function targetPos(id: string): { x: number; z: number; s: number } {
    if (mode === 'board') { const [x, z] = BOARD_LAYOUT[id]; return { x, z, s: 1 }; }
    const a = assign[id];
    if (a === 'A' || a === 'B') {
      const mates = ORDER.filter((o) => assign[o] === a);
      const idx = mates.indexOf(id);
      const col = idx % 3, row = Math.floor(idx / 3);
      return { x: (a === 'A' ? -7.2 : 2.3) + col * 2.5, z: -1.4 + row * 2.0, s: 0.82 };
    }
    return { x: -6.6 + ORDER.indexOf(id) * 2.2, z: 2.7, s: 0.74 };
  }

  function rebuildCord(it: Item): void {
    if (it.cord) { it.cord.removeFromParent(); it.cord.geometry.dispose(); it.cord = null; }
    const d = destination(it.id);
    it.plug.visible = d.kind !== 'none';
    if (d.kind === 'none') return;
    it.m.group.updateMatrixWorld(true);
    const p0 = it.m.group.localToWorld(it.m.plug.clone());
    const s = d.p;
    const mid = p0.clone().lerp(s, 0.55); mid.y = 0.06;
    const pts = d.kind === 'board'
      ? [s.clone().add(new THREE.Vector3(0, 0.05, 0)), s.clone().add(new THREE.Vector3(0, 0.55, 0.9)), mid, p0.clone().lerp(mid, 0.5).setY(0.07), p0]
      : [s.clone().add(new THREE.Vector3(0, 0, 0.1)), s.clone().add(new THREE.Vector3(0, -0.5, 0.55)), s.clone().add(new THREE.Vector3(0, -1.6, 0.9)).lerp(p0, 0.35).setY(0.9), p0.clone().lerp(mid, 0.5).setY(0.1), p0];
    const curve = curveThrough(pts);
    it.cord = cordMesh(curve, d.kind === 'board' ? cordMat : cordMat);
    root.add(it.cord);
    it.stream.setCurve(curve);
    if (d.kind === 'board') { it.plug.position.copy(s).add(new THREE.Vector3(0, 0.22, 0.05)); it.plug.rotation.set(board.tilt, 0, 0); }
    else { it.plug.position.copy(s).add(new THREE.Vector3(0, 0, 0.3)); it.plug.rotation.set(Math.PI / 2, 0, 0); }
    it.to.copy(s);
  }

  function rebuildBoardCord(): void {
    if (boardCord) { boardCord.removeFromParent(); boardCord.geometry.dispose(); boardCord = null; }
    boardCordPlug.visible = mode === 'board';
    boardStream.mesh.visible = mode === 'board';
    if (mode !== 'board') return;
    const p0 = board.cordExit.clone().add(BOARD_POS);
    const s = wallSocket('A', 0);
    const curve = curveThrough([s.clone().add(new THREE.Vector3(0, 0, 0.1)), s.clone().add(new THREE.Vector3(0, -0.7, 0.5)), new THREE.Vector3(-3.6, 0.1, -3.0), new THREE.Vector3(-1.6, 0.06, -2.6), p0]);
    boardCord = cordMesh(curve, darkCord, 0.06);
    root.add(boardCord);
    boardStream.setCurve(curve);
    boardCordPlug.position.copy(s).add(new THREE.Vector3(0, 0, 0.3)); boardCordPlug.rotation.set(Math.PI / 2, 0, 0);
  }

  // zone markers (plan mode)
  const zoneLabels = new Map<string, HTMLElement>();
  const labels: LabelLayer = createLabelLayer(view, stage);
  for (const id of ORDER) {
    const b = BOARD_APPLIANCES.find((x) => x.id === id)!;
    const el = document.createElement('div');
    el.className = 'dk-plate';
    el.dataset.id = id;
    el.innerHTML = `<b>${b.name}</b><span>${b.powerW} W</span>`;
    const it = items.get(id)!;
    labels.add(el, () => it.m.group.localToWorld(it.m.labelAt.clone().multiplyScalar(1)).add(new THREE.Vector3(0, 0.1, 0)));
  }
  const bl = document.createElement('div');
  bl.className = 'dk-plate dk-plate--board'; bl.textContent = 'Power board: 10 A MAX';
  labels.add(bl, () => board.labelAt.clone().add(BOARD_POS));
  for (const [k, pos] of [['A', WALL_A], ['B', WALL_B]] as const) {
    const el = document.createElement('div');
    el.className = 'dk-plate dk-plate--zone';
    el.textContent = `Circuit ${k}: 16 A breaker`;
    zoneLabels.set(k, el);
    labels.add(el, () => pos.clone().add(new THREE.Vector3(0, 0.95, 0)), { below: false });
  }

  const dimmer = lightDimmer(stage);
  let gauges: { board: Gauge; a: Gauge; b: Gauge } | null = null;
  let readingCb: ((a: number | null) => void) | null = null;

  // ── animation state ──
  type Phase = 'idle' | 'trip' | 'run';
  let phase: Phase = 'idle';
  let clock = 0;
  let queue: { at: number; fn(): void }[] = [];
  let shown = { board: 0, a: 0, b: 0 }, goal = { board: 0, a: 0, b: 0 };
  let tripped = { board: false, a: false, b: false };
  let lightK = 1, lightGoal = 1;
  let doneCb: (() => void) | null = null;

  const at = (t: number, fn: () => void) => queue.push({ at: t, fn });
  function setOn(id: string, on: boolean): void { const it = items.get(id)!; it.on = on; it.m.setOn(on); }
  function allOff(): void { for (const id of ORDER) setOn(id, false); }

  function resetBoard(): void {
    phase = 'idle'; queue = []; allOff(); board.setTripped(false); tripped.board = false; goal.board = 0;
    lightGoal = 1; wa.setTripped(false); wb.setTripped(false); gauges?.board.set(shown.board, 'ok'); readingCb?.(null);
  }
  function resetRun(): void {
    if (phase === 'run') phase = 'idle';
    queue = []; allOff(); tripped.a = tripped.b = false; goal.a = goal.b = 0; shown.a = shown.b = 0;
    wa.setTripped(false); wb.setTripped(false); gauges?.a.set(0, 'ok'); gauges?.b.set(0, 'ok');
  }

  function setMode(m: 'board' | 'plan'): void {
    if (m === mode) return;
    mode = m;
    resetBoard(); resetRun();
    board.group.visible = m === 'board';
    for (const it of items.values()) it.dirty = true;
    rebuildBoardCord();
    for (const [, el] of zoneLabels) el.style.display = m === 'plan' ? '' : 'none';
    bl.style.display = m === 'board' ? '' : 'none';
  }
  function setAssign(a: Record<string, Slot | undefined>): void {
    assign = { ...a };
    resetRun();
    for (const it of items.values()) it.dirty = true;
  }
  for (const [, el] of zoneLabels) el.style.display = 'none';
  rebuildBoardCord();

  function playTrip(onDone: () => void): void {
    resetBoard();
    phase = 'trip'; clock = 0; doneCb = onDone;
    const order = ['lamp', 'phone-charger', 'toaster', 'sandwich-press', 'iron'];
    let sum = 0;
    order.forEach((id, i) => {
      at(0.5 + i * 0.95, () => { setOn(id, true); sum += applianceCurrent(id); goal.board = sum; });
    });
  }

  function playRun(a: Record<string, Slot | undefined>, onDone: (r: { tripA: boolean; tripB: boolean }) => void): void {
    resetRun();
    assign = { ...a };
    phase = 'run'; clock = 0;
    let sumA = 0, sumB = 0;
    const placed = ORDER.filter((id) => assign[id] === 'A' || assign[id] === 'B');
    placed.forEach((id, i) => {
      at(0.4 + i * 0.7, () => {
        if (assign[id] === 'A' && !tripped.a) { setOn(id, true); sumA += applianceCurrent(id); goal.a = sumA; }
        if (assign[id] === 'B' && !tripped.b) { setOn(id, true); sumB += applianceCurrent(id); goal.b = sumB; }
      });
    });
    at(0.4 + placed.length * 0.7 + 1.4, () => { phase = 'idle'; onDone({ tripA: tripped.a, tripB: tripped.b }); });
  }

  // ── per frame ──
  const off = stage.onFrame((dt, t) => {
    if (phase !== 'idle') {
      clock += dt;
      queue = queue.filter((q) => { if (clock >= q.at) { q.fn(); return false; } return true; });
    }
    const speed = 3.2;
    shown.board = approach(shown.board, goal.board, dt, tripped.board ? 14 : speed);
    shown.a = approach(shown.a, goal.a, dt, tripped.a ? 14 : speed);
    shown.b = approach(shown.b, goal.b, dt, tripped.b ? 14 : speed);
    // the 10 A cut-out pops as the meter crosses its limit
    if (phase === 'trip' && !tripped.board && shown.board > 10.05) {
      tripped.board = true; board.setTripped(true); goal.board = 0; lightGoal = 0.16; allOff();
      queue = [];
      at(clock + 1.6, () => { phase = 'idle'; const cb = doneCb; doneCb = null; cb?.(); });
    }
    if (phase === 'run') {
      if (!tripped.a && shown.a > 16.05) { tripped.a = true; goal.a = 0; wa.setTripped(true); for (const id of ORDER) if (assign[id] === 'A') setOn(id, false); }
      if (!tripped.b && shown.b > 16.05) { tripped.b = true; goal.b = 0; wb.setTripped(true); for (const id of ORDER) if (assign[id] === 'B') setOn(id, false); }
    }
    lightK = approach(lightK, lightGoal, dt, 6);
    dimmer.set(lightK);
    gauges?.board.set(shown.board, tripped.board ? 'tripped' : shown.board > 8.5 ? 'warn' : 'ok');
    gauges?.a.set(shown.a, tripped.a ? 'tripped' : shown.a > 14 ? 'warn' : 'ok');
    gauges?.b.set(shown.b, tripped.b ? 'tripped' : shown.b > 14 ? 'warn' : 'ok');
    board.update(dt);

    // appliances glide to their places
    for (const it of items.values()) {
      const tp = targetPos(it.id);
      it.tgt.set(tp.x, 0, tp.z); it.tscale = tp.s;
      const moving = it.pos.distanceToSquared(it.tgt) > 1e-5 || Math.abs(it.scale - it.tscale) > 1e-4;
      if (moving) {
        it.pos.x = approach(it.pos.x, it.tgt.x, dt, 6); it.pos.z = approach(it.pos.z, it.tgt.z, dt, 6);
        it.scale = approach(it.scale, it.tscale, dt, 6);
        it.m.group.position.copy(it.pos); it.m.group.scale.setScalar(it.scale);
        it.dirty = true;
      }
      if (it.dirty) { it.dirty = false; rebuildCord(it); }
      it.m.update(dt, t);
      const amps = applianceCurrent(it.id);
      it.stream.count = it.on && it.cord ? Math.min(14, 2 + amps * 1.1) : 0;
      it.stream.update(dt);
    }
    const total = ORDER.filter((id) => items.get(id)!.on).reduce((s, id) => s + applianceCurrent(id), 0);
    boardStream.count = mode === 'board' && total > 0 && !tripped.board ? Math.min(28, 3 + total * 1.2) : 0;
    boardStream.update(dt);
  });

  const fit = () => {
    const aspect = Math.max(0.5, view.clientWidth / Math.max(1, view.clientHeight));
    const d = Math.max(11.5, Math.min(30, 16.2 / (0.688 * aspect)));
    stage.setHome({ target: [0, 1.25, 0.1], distance: d, pitch: aspect < 1.2 ? 0.66 : 0.52, yaw: 0, minDistance: 7, maxDistance: 34 }, true);
  };
  const offResize = stage.onResize(fit);
  fit();
  dimmer.rescan();

  return {
    stage, setMode, setAssign, playTrip, resetBoard, playRun, resetRun,
    setGauges(g) { gauges = g; },
    onReading(cb) { readingCb = cb; },
    isBusy: () => phase !== 'idle',
    dispose() {
      off(); offResize(); labels.dispose();
      for (const it of items.values()) { it.stream.dispose(); it.cord?.geometry.dispose(); }
      boardStream.dispose(); boardCord?.geometry.dispose();
      disposeTree(root);
      stage.dispose();
    },
  };
}

