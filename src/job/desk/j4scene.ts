// Job 4 scene: a cutaway dollhouse room with the audited appliances. Packets only appear at the reveal (they would give the ranking away).
import * as THREE from 'three';
import * as M from '../../kit/materials';
import { createStage, type KitStage } from '../../kit/stage';
import { disposeTree } from '../../kit/dispose';
import { mesh, rbox } from '../../kit/parts/common';
import type { QualityTier } from '../../types';
import { AUDIT_APPLIANCES } from '../../sim/audit';
import { approach, createLabelLayer, curveThrough, PacketStream } from './scene';
import { buildAuditModel, type AuditModel } from './auditmodels';

/** floor position, rotation and height of each model */
const PLACE: Record<string, { x: number; z: number; y?: number; ry?: number; lift?: number }> = {
  'hot-water': { x: -4.35, z: -2.55, lift: 0.25 },
  fridge: { x: -3.15, z: -2.5, lift: 1.0 },
  'second-fridge': { x: -2.0, z: -2.55, lift: 0.3 },
  washer: { x: -1.0, z: -2.6 },
  dryer: { x: -0.15, z: -2.6, lift: 0.5 },
  'air-con': { x: 2.1, z: -3.0, y: 2.75 },
  heater: { x: 1.5, z: -0.9 },
  tv: { x: 3.7, z: -2.6 },
  computer: { x: -4.2, z: 1.0, ry: Math.PI / 2 },
  downlights: { x: 0.4, z: -2.9, y: 3.3 },
};
const S = 1.3;

function tileFloor(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9d9a92'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const g = ctx.createLinearGradient(x * 128, y * 128, x * 128 + 128, y * 128 + 128);
    g.addColorStop(0, '#e4e1d9'); g.addColorStop(1, '#d3d0c7');
    ctx.fillStyle = g; ctx.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

export interface J4Scene {
  stage: KitStage;
  highlight(id: string | null): void;
  onPick(cb: (id: string) => void): void;
  /** kWh per year for each appliance, or null for no packets */
  setFlow(kwh: Record<string, number> | null): void;
  /** show `before`, then shrink to `after` */
  reveal(before: Record<string, number>, after: Record<string, number>, onShrink?: () => void): void;
  dispose(): void;
}

export function createJ4Scene(view: HTMLElement, quality: QualityTier): J4Scene {
  const stage = createStage(view, quality, { mood: 'house', target: [0, 1.2, -0.3], distance: 19, yaw: 0.5, pitch: 0.6, minDistance: 8, maxDistance: 36 });
  if (stage.scene.fog) { (stage.scene.fog as THREE.Fog).near = 60; (stage.scene.fog as THREE.Fog).far = 120; }
  const root = new THREE.Group(); stage.scene.add(root);
  const sc = stage.keyLight.shadow.camera as THREE.OrthographicCamera;
  sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.far = 50; sc.updateProjectionMatrix();
  stage.keyLight.position.set(6, 12, 9);

  // ── shell of the house: slab, two walls, skirting ──
  const slab = mesh(rbox(10.8, 0.3, 7.0, 0.04), new THREE.MeshStandardMaterial({ color: 0xb8b0a2, roughness: 0.9 })); slab.position.set(0, -0.15, 0); root.add(slab);
  const tex = tileFloor(); tex.repeat.set(6, 6);
  const tileM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0 });
  const tiles = mesh(rbox(5.0, 0.04, 6.6, 0.01), tileM); tiles.position.set(-2.6, 0.02, 0); root.add(tiles);
  const boards = mesh(rbox(5.4, 0.04, 6.6, 0.01), M.timber('dark', 3, 3)); boards.position.set(2.7, 0.02, 0); root.add(boards);
  const wallM = new THREE.MeshStandardMaterial({ color: 0xe9dfcd, roughness: 0.95 });
  const wallM2 = new THREE.MeshStandardMaterial({ color: 0xd3dccd, roughness: 0.95 });
  const back = mesh(rbox(10.8, 3.6, 0.2, 0.03), wallM); back.position.set(0, 1.8, -3.4); root.add(back);
  const left = mesh(rbox(0.2, 3.6, 7.0, 0.03), wallM2); left.position.set(-5.3, 1.8, 0); root.add(left);
  const cap1 = mesh(rbox(10.8, 0.06, 0.24, 0.02), phys(0xf4f1ea)); cap1.position.set(0, 3.62, -3.4); root.add(cap1);
  const cap2 = mesh(rbox(0.24, 0.06, 7.0, 0.02), phys(0xf4f1ea)); cap2.position.set(-5.3, 3.62, 0); root.add(cap2);
  const skA = mesh(rbox(10.4, 0.14, 0.04, 0.01), phys(0xf6f3ec)); skA.position.set(0, 0.09, -3.28); root.add(skA);
  const skB = mesh(rbox(0.04, 0.14, 6.6, 0.01), phys(0xf6f3ec)); skB.position.set(-5.18, 0.09, 0); root.add(skB);
  // a picture above the TV, and the electricity meter box on the back wall
  const frame = mesh(rbox(1.0, 0.7, 0.04, 0.01), M.timber('dark', 1, 1)); frame.position.set(3.7, 2.4, -3.26); root.add(frame);
  const art = mesh(rbox(0.88, 0.58, 0.01, 0.004), new THREE.MeshStandardMaterial({ color: 0x6fa3b8, roughness: 0.8 }), false); art.position.set(3.7, 2.4, -3.23); root.add(art);
  const meterBox = mesh(rbox(0.5, 0.65, 0.18, 0.03), phys(0xd5d8dc, 0.45)); meterBox.position.set(-0.6, 2.1, -3.23); root.add(meterBox);
  const dial = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 28).rotateX(Math.PI / 2), phys(0xf7f7f4, 0.2, 0, { clearcoat: 1 }), false); dial.position.set(-0.6, 2.18, -3.12); root.add(dial);
  const wheel = mesh(rbox(0.2, 0.05, 0.01, 0.005), new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.3 }), false); wheel.position.set(-0.6, 2.18, -3.095); root.add(wheel);
  const hubPos = new THREE.Vector3(-0.6, 1.9, -3.08);
  function phys(color: number, roughness = 0.5, metalness = 0, extra: THREE.MeshPhysicalMaterialParameters = {}) { return new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra }); }

  // ── appliances ──
  const models = new Map<string, AuditModel>();
  const streams = new Map<string, PacketStream>();
  const goal = new Map<string, number>(), cur = new Map<string, number>();
  const labels = createLabelLayer(view, stage);
  const labelEls = new Map<string, HTMLElement>();
  const highlights = new Map<string, THREE.Mesh>();
  const rings = new Map<string, THREE.Mesh>();
  for (const a of AUDIT_APPLIANCES) {
    const m = buildAuditModel(a.id);
    const p = PLACE[a.id];
    m.group.position.set(p.x, p.y ?? 0, p.z); m.group.rotation.y = p.ry ?? 0; m.group.scale.setScalar(S);
    m.group.userData.auditId = a.id;
    root.add(m.group);
    models.set(a.id, m);
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group);
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const edges = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.06, size.y + 0.06, size.z + 0.06), new THREE.MeshBasicMaterial({ color: 0xffb938, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    edges.position.copy(centre); edges.renderOrder = 10; root.add(edges); highlights.set(a.id, edges);
    if (!p.y) {
      const r = m.radius * S;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r * 1.08, 48), new THREE.MeshBasicMaterial({ color: 0xffc24a, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.045, p.z); root.add(ring); rings.set(a.id, ring);
    }
    const target = m.group.localToWorld(m.top.clone());
    const c = curveThrough([
      hubPos.clone(),
      hubPos.clone().lerp(target, 0.35).add(new THREE.Vector3(0, 0.8, 0.9)),
      hubPos.clone().lerp(target, 0.75).add(new THREE.Vector3(0, 0.6, 0.7)),
      target,
    ]);
    const s = new PacketStream(c, 0xffa23a, { max: 40, size: 0.1, boost: 3 });
    s.speed = 0.17; root.add(s.mesh); streams.set(a.id, s);
    cur.set(a.id, 0); goal.set(a.id, 0);
    const el = document.createElement('div');
    el.className = 'dk-plate dk-plate--item'; el.dataset.id = a.id; el.textContent = a.name;
    labelEls.set(a.id, el);
    labels.add(el, () => m.group.localToWorld(m.labelAt.clone()).add(new THREE.Vector3(0, p.lift ?? 0, 0)));
  }

  let hl: string | null = null;
  let pickCb: ((id: string) => void) | null = null;
  let flowMax = 1;
  let timers: { at: number; fn(): void }[] = [], clock = 0;
  let scaleK = 1;

  const downPos = { x: 0, y: 0 };
  const onDown = (e: PointerEvent) => { downPos.x = e.clientX; downPos.y = e.clientY; };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6 || stage.orbiting) return;
    const hit = stage.pick(e.clientX, e.clientY, [...models.values()].map((m) => m.group))[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.auditId) o = o.parent;
    if (o) pickCb?.(o.userData.auditId as string);
  };
  stage.canvas.addEventListener('pointerdown', onDown);
  stage.canvas.addEventListener('pointerup', onUp);

  const off = stage.onFrame((dt, t) => {
    clock += dt;
    timers = timers.filter((x) => { if (clock >= x.at) { x.fn(); return false; } return true; });
    for (const [id, m] of models) {
      m.update(dt, t);
      const c = approach(cur.get(id)!, goal.get(id)!, dt, 1.4);
      cur.set(id, c);
      const s = streams.get(id)!;
      s.count = (c / flowMax) * 36 * scaleK;
      s.update(dt);
      const e = highlights.get(id)!, r = rings.get(id);
      const on = hl === id;
      const mat = e.material as THREE.MeshBasicMaterial;
      mat.opacity = approach(mat.opacity, on ? 0.2 + Math.sin(t * 5) * 0.07 : 0, dt, 12);
      e.visible = mat.opacity > 0.01;
      if (r) { const rm = r.material as THREE.MeshBasicMaterial; rm.opacity = approach(rm.opacity, on ? 0.95 : 0, dt, 12); r.visible = rm.opacity > 0.01; }
    }
  });

  const fit = () => {
    const aspect = Math.max(0.5, view.clientWidth / Math.max(1, view.clientHeight));
    const d = Math.max(12, Math.min(34, 17.5 / (0.688 * aspect)));
    stage.setHome({ target: [0, 1.3, -0.5], distance: d, pitch: aspect < 1.2 ? 0.66 : 0.58, yaw: 0.45, minDistance: 8, maxDistance: 40 }, true);
  };
  const offResize = stage.onResize(fit);
  fit();

  function setGoal(k: Record<string, number> | null): void {
    for (const a of AUDIT_APPLIANCES) goal.set(a.id, k ? (k[a.id] ?? 0) : 0);
  }

  return {
    stage,
    highlight(id) { hl = id; for (const [k, el] of labelEls) el.classList.toggle('is-hl', k === id); },
    onPick(cb) { pickCb = cb; },
    setFlow(k) { if (k) flowMax = Math.max(1, ...Object.values(k)); setGoal(k); },
    reveal(before, after, onShrink) {
      flowMax = Math.max(1, ...Object.values(before));
      setGoal(before);
      timers = [{ at: clock + 3.2, fn: () => { setGoal(after); onShrink?.(); } }];
    },
    dispose() {
      off(); offResize(); labels.dispose();
      stage.canvas.removeEventListener('pointerdown', onDown);
      stage.canvas.removeEventListener('pointerup', onUp);
      for (const s of streams.values()) s.dispose();
      for (const e of highlights.values()) { e.geometry.dispose(); (e.material as THREE.Material).dispose(); }
      for (const r of rings.values()) { r.geometry.dispose(); (r.material as THREE.Material).dispose(); }
      disposeTree(root);
      stage.dispose();
    },
  };
}
