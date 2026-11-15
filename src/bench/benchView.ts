// 3D view of the bench: the set, one model per part, edge/post markers, coach highlights and the globe light pool.
import * as THREE from 'three';
import type { Part, QualityTier, Solution } from '../types';
import type { KitStage } from '../kit/stage';
import { contactShadow } from '../kit/stage';
import { disposeTree } from '../kit/dispose';
import { canvas } from '../kit/textures';
import * as M from '../kit/materials';
import type { InsulationColour } from '../kit/materials';
import { createBattery, type BatteryModel } from '../kit/parts/battery';
import { createGlobe, type GlobeModel } from '../kit/parts/globe';
import { createSwitch, type SwitchModel } from '../kit/parts/switch';
import { createResistor, type ResistorModel } from '../kit/parts/resistor';
import { createEdgeLead } from '../kit/parts/lead';
import { createMeter, type MeterModel } from '../kit/parts/meter';
import { meterReading } from '../sim/circuit';
import { BENCH_Y, createBenchSet, type BenchSet } from './benchSet';
import { allEdges, edgeKey, postXZ, type Edge, type GridSize } from './grid';

export interface FlowSource {
  id: string;
  obj: THREE.Object3D;
  /** returns the current local path (re-read every frame, so animated parts stay in step) */
  path(): { pts: THREE.Vector3[]; u: number[] };
  hot?: THREE.Vector3;
  kind: Part['kind'];
}

interface View {
  id: string;
  sig: string;
  kind: Part['kind'];
  obj: THREE.Group;
  drop: number; // drop-in animation time
  supply: boolean;
}

export interface MarkerState {
  /** edge keys to show as valid targets (armed) */
  valid: Set<string> | null;
  hover: string | null;
  cursor: string | null;
  /** posts to ring (voltmeter placement / cursor) */
  posts: Set<number> | null;
  postHover: number | null;
  postCursor: number | null;
  postChosen: number | null;
}

const lcdFor = (v: number): string => M.lcdText(v);

function markerTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(8, 8, 240, 48, 24); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  const inner = ctx.createLinearGradient(0, 0, 0, 64);
  inner.addColorStop(0, 'rgba(0,0,0,0)'); inner.addColorStop(0.5, 'rgba(0,0,0,0.55)'); inner.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = inner; ctx.beginPath(); ctx.roundRect(22, 22, 212, 20, 10); ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function ringTexture(thin = false): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 62);
  if (thin) { g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.72, 'rgba(255,255,255,0)'); g.addColorStop(0.82, 'rgba(255,255,255,1)'); g.addColorStop(0.9, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createBenchView(stage: KitStage, grid: GridSize, quality: QualityTier) {
  const root = new THREE.Group();
  root.name = 'bench';
  stage.scene.add(root);
  const set: BenchSet = createBenchSet(grid, quality);
  root.add(set.root);
  const partsRoot = new THREE.Group(); partsRoot.name = 'parts'; root.add(partsRoot);
  const edges: Edge[] = allEdges(grid);
  const views = new Map<string, View>();
  let xray = false;
  let adjustableId: string | null = null;

  const postV = (id: number, y = 0) => { const [x, z] = postXZ(grid, id); return new THREE.Vector3(x, y, z); };

  // ── markers ──
  const mTex = markerTexture(), rTex = ringTexture(), hTex = ringTexture(true);
  const edgeMat = new THREE.MeshBasicMaterial({ map: mTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const edgeMarkers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.72, 0.18).rotateX(-Math.PI / 2), edgeMat, edges.length);
  edgeMarkers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(edges.length * 3), 3);
  edgeMarkers.renderOrder = 3; edgeMarkers.frustumCulled = false;
  root.add(edgeMarkers);
  const nPosts = grid.cols * grid.rows;
  const ringMat = new THREE.MeshBasicMaterial({ map: rTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const postMarkers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.36, 0.36).rotateX(-Math.PI / 2), ringMat, nPosts);
  postMarkers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nPosts * 3), 3);
  postMarkers.renderOrder = 3; postMarkers.frustumCulled = false;
  root.add(postMarkers);
  let markers: MarkerState = { valid: null, hover: null, cursor: null, posts: null, postHover: null, postCursor: null, postChosen: null };

  // ── coach highlight rings ──
  const hlMat = new THREE.MeshBasicMaterial({ map: hTex, color: new THREE.Color(1.5, 1.15, 0.25), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, depthTest: false });
  const hlGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const hlRoot = new THREE.Group(); hlRoot.renderOrder = 10; root.add(hlRoot);
  let hlTargets: { part?: string; post?: number }[] = [];

  // ── globe light pool (constant light count, so shaders never recompile) ──
  const nLights = quality === 'high' ? 3 : quality === 'medium' ? 2 : 0;
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < nLights; i++) { const l = new THREE.PointLight(0xffc080, 0, 4, 2); l.castShadow = false; root.add(l); lights.push(l); }

  // ── part models ──
  const plugLevels = (parts: Part[]) => {
    const used = new Map<number, number>();
    const lv = new Map<string, [number, number]>();
    for (const p of parts) {
      if (p.kind !== 'wire' && p.kind !== 'ammeter' && p.kind !== 'voltmeter' && !(p.kind === 'battery' && p.id === adjustableId)) continue;
      const la = used.get(p.a) ?? 0, lb = used.get(p.b) ?? 0;
      used.set(p.a, la + 1); if (p.b !== p.a) used.set(p.b, lb + 1);
      lv.set(p.id, [la, lb]);
    }
    return lv;
  };
  const wireColours = (parts: Part[]): Map<string, InsulationColour> => {
    // red for wires joined to a battery's + terminal, black for its − terminal, blue otherwise
    const parent = new Map<number, number>();
    const find = (x: number): number => { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
    for (const p of parts) if (p.kind === 'wire') parent.set(find(p.a), find(p.b));
    const plus = new Set<number>(), minus = new Set<number>();
    for (const p of parts) if (p.kind === 'battery') { plus.add(find(p.b)); minus.add(find(p.a)); }
    const out = new Map<string, InsulationColour>();
    for (const p of parts) if (p.kind === 'wire') { const n = find(p.a); out.set(p.id, plus.has(n) ? 'red' : minus.has(n) ? 'black' : 'blue'); }
    return out;
  };

  const meterSlots = (parts: Part[]) => {
    // voltmeters stand in a row in front of the board, near the middle of their two posts, never overlapping
    const vms = parts.filter((p) => p.kind === 'voltmeter').map((p) => ({ id: p.id, x: (postV(p.a).x + postV(p.b).x) / 2 }));
    vms.sort((a, b) => a.x - b.x);
    const gap = 0.72, lim = set.benchW / 2 - 0.6;
    for (let i = 1; i < vms.length; i++) if (vms[i].x < vms[i - 1].x + gap) vms[i].x = vms[i - 1].x + gap;
    const over = vms.length ? vms[vms.length - 1].x - Math.min(lim, set.panelW / 2 + 0.6) : 0;
    if (over > 0) for (const v of vms) v.x -= over;
    return new Map(vms.map((v) => [v.id, Math.max(-lim, v.x)]));
  };

  function build(p: Part, levels: [number, number], colour: InsulationColour, slotX: number | undefined): THREE.Group {
    const A = postV(p.a), B = postV(p.b);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    let obj: THREE.Group;
    const faceFront = p.kind === 'ammeter' || p.kind === 'voltmeter' || (p.kind === 'battery' && p.id === adjustableId);
    if (faceFront) {
      const m = createMeter(p.kind === 'battery' ? 'supply' : (p.kind as 'ammeter' | 'voltmeter'));
      obj = m;
      if (p.kind === 'voltmeter') {
        m.position.set(slotX ?? mid.x, BENCH_Y, set.meterRowZ);
        const off = m.position.clone();
        m.userData.connect(A.sub(off), B.sub(off), levels[0], levels[1], (x, z) => set.ground(x + off.x, z + off.z) - BENCH_Y);
      } else {
        m.position.copy(mid);
        // in-line meters sit beside their edge so both posts stay visible (in front of a horizontal edge,
        // to the outer side of a vertical one)
        const horiz = Math.abs(A.z - B.z) < 1e-6;
        if (p.kind === 'ammeter') {
          if (horiz) m.position.z += 0.3;
          else m.position.x += mid.x >= 0 ? 0.36 : -0.36;
        }
        const off = m.position.clone();
        m.userData.connect(A.sub(off), B.sub(off), levels[0], levels[1], (x, z) => set.ground(x + off.x, z + off.z));
      }
      if (xray) m.userData.setXray(true);
    } else {
      switch (p.kind) {
        case 'battery': obj = createBattery(p.emf ?? 1.5); break;
        case 'globe': obj = createGlobe(quality); break;
        case 'switch': obj = createSwitch(); break;
        case 'resistor': obj = createResistor(p.resistance ?? 10, !!p.mystery, p.label); break;
        default: {
          obj = createEdgeLead(colour, levels[0], levels[1]);
          if (xray) (obj.userData.cable as { userData: { setXray(b: boolean): void } }).userData.setXray(true);
        }
      }
      obj.position.copy(mid);
      obj.rotation.y = Math.atan2(-(B.z - A.z), B.x - A.x);
      if (p.kind !== 'wire') {
        const sh = contactShadow(p.kind === 'globe' ? 0.75 : 0.95, 0.55, quality === 'low' ? 0.5 : 0.32);
        obj.add(sh);
      }
    }
    obj.traverse((o) => { o.userData.partId = p.id; });
    obj.userData.partId = p.id;
    return obj;
  }

  const sigOf = (p: Part, lv: [number, number] | undefined, col: string | undefined, slot: number | undefined) => {
    const style = p.kind === 'battery' ? (p.id === adjustableId ? 'psu' : (p.emf ?? 1.5) <= 3 ? `c${p.emf}` : (p.emf ?? 0) <= 7.5 ? `l${p.emf}` : `p${p.emf}`) : '';
    return [p.kind, p.a, p.b, style, p.kind === 'resistor' ? `${p.resistance}|${p.mystery}|${p.label ?? ''}` : '', lv?.join(',') ?? '', col ?? '', slot?.toFixed(3) ?? ''].join('/');
  };

  /** returns true if any model was built, rebuilt or removed */
  function sync(parts: Part[]): boolean {
    let any = false;
    const lv = plugLevels(parts), cols = wireColours(parts), slots = meterSlots(parts);
    const keep = new Set(parts.map((p) => p.id));
    for (const [id, v] of views) if (!keep.has(id)) { disposeTree(v.obj); views.delete(id); any = true; }
    for (const p of parts) {
      const sig = sigOf(p, lv.get(p.id), cols.get(p.id), slots.get(p.id));
      const old = views.get(p.id);
      if (old && old.sig === sig) continue;
      any = true;
      const fresh = !old || old.kind !== p.kind || !old.sig.startsWith(`${p.kind}/${p.a}/${p.b}/`);
      if (old) disposeTree(old.obj);
      const obj = build(p, lv.get(p.id) ?? [0, 0], cols.get(p.id) ?? 'blue', slots.get(p.id));
      partsRoot.add(obj);
      const v: View = { id: p.id, sig, kind: p.kind, obj, drop: fresh ? 0 : 1, supply: p.id === adjustableId };
      views.set(p.id, v);
      if (fresh) {
        obj.userData.baseY = obj.position.y;
        (obj.userData.cable as { userData: { sway(a?: number): void } } | undefined)?.userData.sway(0.09);
        (obj as MeterModel).userData.sway?.();
      } else v.drop = 1;
    }
    return any;
  }

  // ── per-frame ──
  const tmpBox = new THREE.Box3();
  const col = new THREE.Color();
  function frame(dt: number, t: number, parts: Part[], sol: Solution, heat: (id: string) => number, tripped: boolean): void {
    for (const p of parts) {
      const v = views.get(p.id);
      if (!v) continue;
      const o = v.obj;
      if (v.drop < 1) {
        v.drop = Math.min(1, v.drop + dt / 0.38);
        const k = v.drop;
        // drop with a small bounce
        const y = k < 0.7 ? (1 - (k / 0.7) ** 2) * 0.28 : Math.sin(((k - 0.7) / 0.3) * Math.PI) * 0.018;
        o.position.y = (o.userData.baseY as number) + y;
      }
      const r = sol.parts[p.id];
      const power = sol.status === 'ok' && r ? r.power : 0;
      switch (p.kind) {
        case 'globe': (o as GlobeModel).userData.update({ power, ratedW: p.ratedW ?? 3, blown: p.blown }, dt); break;
        case 'switch': (o as SwitchModel).userData.update({ closed: p.closed }, dt); break;
        case 'resistor': (o as ResistorModel).userData.update({ power }, dt); break;
        case 'battery':
          if (v.supply) {
            const m = o as MeterModel;
            m.userData.update({ emf: p.emf ?? 0, on: !tripped }, dt);
            m.userData.setReading((p.emf ?? 0).toFixed(1), 'V', tripped);
          } else (o as BatteryModel).userData.update({ heat: heat(p.id) }, dt);
          break;
        case 'ammeter': case 'voltmeter': {
          const m = o as MeterModel;
          m.userData.update({}, dt);
          const val = meterReading(p, sol);
          if (!Number.isFinite(val)) m.userData.setReading('', '', true);
          else m.userData.setReading(lcdFor(Math.abs(val) < 0.0005 ? 0 : val), p.kind === 'ammeter' ? 'A' : 'V');
          break;
        }
        case 'wire': (o.userData.cable as { userData: { update(dt: number): boolean } }).userData.update(dt); break;
      }
    }
    // light pool → brightest globes
    if (lights.length) {
      const globes = [...views.values()].filter((v) => v.kind === 'globe').map((v) => v.obj as GlobeModel).sort((a, b) => b.userData.brightness - a.userData.brightness);
      lights.forEach((l, i) => {
        const gm = globes[i];
        if (!gm || gm.userData.brightness <= 0.01) { l.intensity = 0; return; }
        gm.localToWorld(l.position.copy(gm.userData.filamentPos));
        l.color.copy(gm.userData.lightColor);
        l.intensity = Math.min(1.4, gm.userData.brightness) * 1.1;
      });
    }
    set.protector.update(dt);
    // markers
    const pulse = 0.75 + 0.25 * Math.sin(t * 5);
    const m4 = new THREE.Matrix4();
    edges.forEach((e, i) => {
      let c: [number, number, number] | null = null;
      if (markers.cursor === e.key) c = [1.6, 1.6, 1.7];
      else if (markers.hover === e.key) c = [0.5, 1.3, 2.0];
      else if (markers.valid?.has(e.key)) c = [0.12 * pulse, 0.42 * pulse, 0.7 * pulse];
      const [x, z] = [(postV(e.a).x + postV(e.b).x) / 2, (postV(e.a).z + postV(e.b).z) / 2];
      m4.makeRotationY(e.horizontal ? 0 : Math.PI / 2);
      m4.setPosition(x, 0.006, z);
      if (!c) m4.scale(new THREE.Vector3(0, 0, 0));
      edgeMarkers.setMatrixAt(i, m4);
      edgeMarkers.setColorAt(i, col.setRGB(...(c ?? [0, 0, 0])));
    });
    edgeMarkers.instanceMatrix.needsUpdate = true; edgeMarkers.instanceColor!.needsUpdate = true;
    for (let id = 0; id < nPosts; id++) {
      let c: [number, number, number] | null = null;
      if (markers.postChosen === id) c = [2, 1.6, 0.4];
      else if (markers.postCursor === id) c = [1.6, 1.6, 1.7];
      else if (markers.postHover === id) c = [0.5, 1.3, 2.0];
      else if (markers.posts?.has(id)) c = [0.15 * pulse, 0.5 * pulse, 0.8 * pulse];
      const pv = postV(id, 0.008);
      m4.makeTranslation(pv.x, pv.y, pv.z);
      if (!c) m4.scale(new THREE.Vector3(0, 0, 0));
      postMarkers.setMatrixAt(id, m4);
      postMarkers.setColorAt(id, col.setRGB(...(c ?? [0, 0, 0])));
    }
    postMarkers.instanceMatrix.needsUpdate = true; postMarkers.instanceColor!.needsUpdate = true;
    // coach highlights
    const hp = 0.6 + 0.4 * Math.sin(t * 4);
    hlRoot.children.forEach((ring, i) => {
      const tg = hlTargets[i];
      if (tg.part) {
        const v = views.get(tg.part);
        if (!v) { ring.visible = false; return; }
        tmpBox.setFromObject(v.obj);
        const c = tmpBox.getCenter(new THREE.Vector3()), s = tmpBox.getSize(new THREE.Vector3());
        ring.visible = true;
        ring.position.set(c.x, Math.max(0.01, tmpBox.min.y + 0.01), c.z);
        ring.scale.setScalar(Math.max(0.6, Math.min(1.3, Math.max(s.x, s.z))) * (1.0 + 0.06 * hp));
      } else if (tg.post !== undefined) {
        const pv = postV(tg.post, 0.012);
        ring.visible = true; ring.position.copy(pv); ring.scale.setScalar(0.5 + 0.06 * hp);
      }
      ((ring as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.45 * hp;
    });
  }

  function pickPart(x: number, y: number): string | null {
    const hits = stage.pick(x, y, [partsRoot]);
    for (const h of hits) {
      const id = h.object.userData.partId as string | undefined;
      if (id && (h.object as THREE.Mesh).isMesh && h.object.name !== 'contactShadow') return id;
    }
    return null;
  }

  function flowSources(parts: Part[]): FlowSource[] {
    const out: FlowSource[] = [];
    for (const p of parts) {
      const v = views.get(p.id);
      if (!v || p.a === p.b) continue;
      const o = v.obj;
      let path: FlowSource['path'];
      if (p.kind === 'wire') path = o.userData.flowPathFn as FlowSource['path'];
      else if (v.supply || p.kind === 'ammeter' || p.kind === 'voltmeter') path = () => (o as MeterModel).userData.flowPath;
      else path = () => o.userData.flowPath as { pts: THREE.Vector3[]; u: number[] };
      out.push({ id: p.id, obj: o, path, hot: o.userData.hotSpot as THREE.Vector3 | undefined, kind: p.kind });
    }
    return out;
  }

  // camera framing for any aspect: binary-search the distance so the board, protector and meter row fit
  const fit = () => {
    const w = stage.canvas.clientWidth || 1, h = stage.canvas.clientHeight || 1;
    const aspect = w / h;
    const portrait = aspect < 0.85;
    const pitch = portrait ? 1.12 : 0.9;
    const xr = portrait ? (grid.cols - 1) / 2 + 0.3 : set.panelW / 2 + 0.3;
    const zb = -set.panelD / 2 + 0.1, zf = set.meterRowZ + (portrait ? 0.3 : 0.25);
    const corners: THREE.Vector3[] = [];
    for (const x of [-xr, xr]) for (const z of [zb, zf]) for (const y of [0, 0.5]) corners.push(new THREE.Vector3(x, y, z));
    const cam = stage.camera.clone();
    cam.aspect = aspect; cam.updateProjectionMatrix();
    // usable screen: leave room for the tray at the bottom and chips at the top (NDC)
    const trayN = Math.min(0.5, (portrait ? 110 : 120) / h * 2), topN = Math.min(0.3, (portrait ? 70 : 60) / h * 2);
    const place = (d: number, cz: number) => { cam.position.set(0, d * Math.sin(pitch), cz + d * Math.cos(pitch)); cam.lookAt(0, 0, cz); cam.updateMatrixWorld(); };
    const range = () => { let lo = Infinity, hi = -Infinity, wx = 0; for (const c of corners) { const v = c.clone().project(cam); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); wx = Math.max(wx, Math.abs(v.x)); } return { lo, hi, wx }; };
    const fits = () => { const r = range(); return r.wx < 0.97 && r.hi < 1 - topN && r.lo > -1 + trayN; };
    let best = { d: 30, cz: 0 };
    for (let cz = -0.4; cz <= 1.6; cz += 0.1) {
      let lo = 2, hi = 40;
      for (let i = 0; i < 26; i++) { const d = (lo + hi) / 2; place(d, cz); if (fits()) hi = d; else lo = d; }
      if (hi < best.d) best = { d: hi, cz };
    }
    // with the distance fixed, centre the scene in the usable band (matters when width is the limit, e.g. phones)
    const mid = ((1 - topN) + (-1 + trayN)) / 2;
    let bestOff = Infinity;
    for (let cz = -1.5; cz <= 2.5; cz += 0.05) {
      place(best.d, cz);
      const r = range();
      if (r.hi >= 1 - topN || r.lo <= -1 + trayN) continue;
      const off = Math.abs((r.hi + r.lo) / 2 - mid);
      if (off < bestOff) { bestOff = off; best.cz = cz; }
    }
    // fog follows the framing so far-away cameras (phones) do not sink into it
    if (stage.scene.fog instanceof THREE.Fog) { stage.scene.fog.near = best.d * 1.1; stage.scene.fog.far = best.d * 3; }
    stage.setHome({ target: [0, 0, best.cz], distance: best.d, yaw: 0, pitch, minDistance: 1.6, maxDistance: best.d * 1.8 });
    stage.setPanBounds(-set.panelW / 2 - 1, set.panelW / 2 + 1, -set.panelD / 2 - 1, set.meterRowZ + 1);
  };
  const offResize = stage.onResize(fit);
  fit();

  return {
    root, set, edges,
    sync,
    frame,
    pickPart,
    flowSources,
    setAdjustable(id: string | null) { adjustableId = id; },
    setMarkers(m: Partial<MarkerState>) { markers = { ...markers, ...m }; },
    setXray(on: boolean) {
      xray = on;
      for (const v of views.values()) {
        if (v.kind === 'wire') (v.obj.userData.cable as { userData: { setXray(b: boolean): void } }).userData.setXray(on);
        else if (v.kind === 'ammeter' || v.kind === 'voltmeter' || v.supply) (v.obj as MeterModel).userData.setXray(on);
      }
    },
    highlight(partIds: string[], postIds: number[] = []) {
      for (const c of [...hlRoot.children]) { hlRoot.remove(c); ((c as THREE.Mesh).material as THREE.Material).dispose(); }
      hlTargets = [...partIds.map((part) => ({ part })), ...postIds.map((post) => ({ post }))];
      for (let i = 0; i < hlTargets.length; i++) { const m = new THREE.Mesh(hlGeo, hlMat.clone()); m.renderOrder = 10; hlRoot.add(m); }
    },
    object(id: string) { return views.get(id)?.obj ?? null; },
    partPosition(id: string): THREE.Vector3 | null {
      const v = views.get(id);
      if (!v) return null;
      tmpBox.setFromObject(v.obj);
      return tmpBox.getCenter(new THREE.Vector3());
    },
    postPosition(id: number) { return postV(id, 0.215); },
    edgeKeyOf(a: number, b: number) { return edgeKey(a, b); },
    dispose() {
      offResize();
      for (const v of views.values()) disposeTree(v.obj);
      views.clear();
      for (const c of hlRoot.children) ((c as THREE.Mesh).material as THREE.Material).dispose();
      hlGeo.dispose(); hlMat.dispose();
      edgeMarkers.geometry.dispose(); edgeMat.dispose(); postMarkers.geometry.dispose(); ringMat.dispose();
      edgeMarkers.dispose(); postMarkers.dispose();
      mTex.dispose(); rTex.dispose(); hTex.dispose();
      for (const p of set.posts) p.dispose();
      disposeTree(root);
    },
  };
}

export type BenchView = ReturnType<typeof createBenchView>;
