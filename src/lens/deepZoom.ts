// Deep zoom: a close-up of a loop of conductor, used by Station 0 (and any "zoom in" elsewhere).
// One picture, one meaning per word: dots = charge, dots per second through the gate = current (I),
// change in glow between two points = voltage (V), squeeze + collisions = resistance (R),
// packets in the pile = energy (E), how fast the pile grows = power (P).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { KitStage } from '../kit/stage';
import { Q, type QualityTier } from '../types';
import { disposeTree } from '../kit/dispose';
import * as M from '../kit/materials';
import { blackbody } from '../kit/parts/common';
import { fmt } from '../sim/units';
import { createLensModel, glowAt, heatFor, neckRadius, JOULES_PER_PACKET, type LensInput, type LensReadings } from './model';
import { SHAPE, WIRE_R, NECK_TAPER, loopLength, makeLayout, neckWeight, pointAt } from './path';
import { dotFrag, dotVert, fxFrag, fxVert, ionFrag, ionVert, liftFrag, liftVert, rimFrag, rimVert, sheathFrag, sheathVert } from './shaders';
import './lens.css';

export type FocusName = 'overview' | 'battery' | 'gate' | 'resistor';
export const FOCI: FocusName[] = ['overview', 'battery', 'gate', 'resistor'];

export interface DeepZoomOptions {
  volts?: number;
  ohms?: number;
  closed?: boolean;
  focus?: FocusName;
  /** element the DOM labels go in (default: the stage canvas's parent) */
  overlay?: HTMLElement;
  /** show the 3D-anchored DOM labels (default true) */
  labels?: boolean;
}

export interface DeepZoom {
  setVolts(v: number): void;
  setOhms(r: number): void;
  setClosed(c: boolean): void;
  focus(f: FocusName, seconds?: number): void;
  readonly focused: FocusName;
  readonly input: Readonly<LensInput>;
  readings(): LensReadings;
  resetEnergy(): void;
  /** total dots that have passed the counter gate (debug only: amps never come from this) */
  readonly gateCount: number;
  /** fires on every setting change or focus change. Returns unsubscribe. */
  onChange(cb: () => void): () => void;
  dispose(): void;
}

const TIERS: Record<QualityTier, { dots: number; spacing: number; ghosts: number; bokeh: number; fx: number }> = {
  low: { dots: 700, spacing: 0.205, ghosts: 2, bokeh: 90, fx: 80 },
  medium: { dots: 1000, spacing: 0.175, ghosts: 3, bokeh: 160, fx: 120 },
  high: { dots: 1300, spacing: 0.158, ghosts: 3, bokeh: 220, fx: 160 },
};
const ION_R = 0.054;
const DOT_CORE = 0.021;
const DOT_HALO = 0.055;
const UP = new THREE.Vector3(0, 1, 0);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const colour = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export function createDeepZoom(stage: KitStage, opts: DeepZoomOptions = {}): DeepZoom {
  const tier = TIERS[stage.quality];
  const calm = reducedMotion();
  const model = createLensModel({ volts: opts.volts ?? 6, ohms: opts.ohms ?? 12, closed: opts.closed ?? false });
  const lay = makeLayout();
  const L = loopLength();
  const Y = SHAPE.y;
  const fog0: [number, number] | null = stage.scene.fog instanceof THREE.Fog ? [stage.scene.fog.near, stage.scene.fog.far] : null;
  const root = new THREE.Group();
  root.name = 'deepZoom';
  stage.scene.add(root);
  const changeCbs = new Set<() => void>();
  const emit = () => { for (const cb of [...changeCbs]) cb(); };

  // ───────── fast path lookup (linear interpolation of a dense table) ─────────
  const STEP = 0.01;
  const NS = Math.ceil(L / STEP) + 2;
  const tab = new Float32Array(NS * 4); // px, pz, tx, tz
  {
    const f = { p: [0, 0, 0] as [number, number, number], t: [0, 0, 0] as [number, number, number] };
    for (let i = 0; i < NS; i++) { pointAt(i * STEP, f); tab[i * 4] = f.p[0]; tab[i * 4 + 1] = f.p[2]; tab[i * 4 + 2] = f.t[0]; tab[i * 4 + 3] = f.t[2]; }
  }
  const P = { x: 0, z: 0, tx: 0, tz: 0 };
  const at = (s: number) => {
    let u = s % L; if (u < 0) u += L;
    const fi = u / STEP, i = Math.floor(fi), k = fi - i, j = i * 4;
    P.x = tab[j] + (tab[j + 4] - tab[j]) * k; P.z = tab[j + 1] + (tab[j + 5] - tab[j + 1]) * k;
    P.tx = tab[j + 2] + (tab[j + 6] - tab[j + 2]) * k; P.tz = tab[j + 3] + (tab[j + 7] - tab[j + 3]) * k;
    return P;
  };
  const world = (s: number, u = 0, v = 0, out = new THREE.Vector3()) => {
    const p = at(s);
    // n = t × up = (−tz, 0, tx)
    return out.set(p.x - p.tz * u, Y + v, p.z + p.tx * u);
  };

  // ───────── shared uniforms ─────────
  const fogU = { uFogCol: { value: colour('#060a15') }, uFogNear: { value: 8 }, uFogFar: { value: 30 } };
  const camU = { uScale: { value: 800 }, uFocus: { value: 10 }, uFocusRange: { value: 5 } };
  const timeU = { value: 0 };
  let neckR = neckRadius(model.input.ohms);
  const neckU = { value: neckR };
  const heatColU = { value: new THREE.Color(0, 0, 0) };
  const heatU = { value: 0 };
  const bridgeU = { value: new THREE.Matrix4() };
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => { owned.push(x); return x; };
  const rimMat = own(new THREE.ShaderMaterial({
    vertexShader: rimVert, fragmentShader: rimFrag,
    uniforms: { uColor: { value: new THREE.Color(0.75, 0.85, 1.0) }, uPow: { value: 2.6 }, uK: { value: 0.55 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));

  // ───────── backdrop bokeh (out-of-focus lattice far away) ─────────
  {
    const n = tier.bokeh;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3), alpha = new Float32Array(n);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const c1 = new THREE.Color(0.55, 0.26, 0.12), c2 = new THREE.Color(0.1, 0.28, 0.62), c3 = new THREE.Color(0.35, 0.3, 0.55);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, ph = (rnd() * 0.9 - 0.25) * Math.PI * 0.5, R = 14 + rnd() * 16;
      pos[i * 3] = Math.cos(th) * Math.cos(ph) * R; pos[i * 3 + 1] = Y + Math.sin(ph) * R * 0.8 - 2; pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * R;
      size[i] = 0.25 + rnd() * 0.75;
      const c = rnd() < 0.45 ? c1 : rnd() < 0.7 ? c2 : c3;
      const k = 0.018 + rnd() * 0.04;
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
      alpha[i] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const m = new THREE.ShaderMaterial({ vertexShader: fxVert, fragmentShader: fxFrag, uniforms: { ...fogU, uScale: camU.uScale, uRing: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -2;
    root.add(pts);
  }

  // ───────── the ion lattice ─────────
  const ionData = (() => {
    const pos: number[] = [], phase: number[] = [], kind: number[] = [], rad: number[] = [], sv: number[] = [];
    const sp = tier.spacing;
    const lim = WIRE_R - ION_R * 0.75;
    const M2 = Math.ceil(lim / sp) + 1;
    const alloyA = lay.neckStart - NECK_TAPER * 0.55, alloyB = lay.neckEnd + NECK_TAPER * 0.55;
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const v = new THREE.Vector3();
    let k = 0;
    for (let s = sp * 0.5; s < L; s += sp, k++) {
      if (s > lay.batteryIn - 0.04 && s < lay.batteryOut + 0.04) continue;
      const inGap = s >= lay.gapStart && s <= lay.gapEnd;
      if (inGap && (s > lay.gapEnd - 0.09 || s < lay.gapStart + 0.02)) continue;
      const off = (k % 2) * sp * 0.5;
      for (let i = -M2; i <= M2; i++) for (let j = -M2; j <= M2; j++) {
        const u = i * sp + off, w = j * sp + off;
        const r = Math.hypot(u, w);
        if (r > lim) continue;
        world(s, u, w, v);
        pos.push(v.x + (rnd() - 0.5) * 0.012, v.y + (rnd() - 0.5) * 0.012, v.z + (rnd() - 0.5) * 0.012);
        phase.push(rnd() * 10); rad.push(r); sv.push(s);
        kind.push(inGap ? 2 : s > alloyA && s < alloyB ? 1 : 0);
      }
    }
    return { pos: new Float32Array(pos), phase: new Float32Array(phase), kind: new Float32Array(kind), rad: new Float32Array(rad), s: new Float32Array(sv) };
  })();
  const nIons = ionData.phase.length;
  const ionGeo = own(new THREE.BufferGeometry());
  ionGeo.setAttribute('position', new THREE.BufferAttribute(ionData.pos, 3));
  ionGeo.setAttribute('aPhase', new THREE.BufferAttribute(ionData.phase, 1));
  ionGeo.setAttribute('aKind', new THREE.BufferAttribute(ionData.kind, 1));
  ionGeo.setAttribute('aRad', new THREE.BufferAttribute(ionData.rad, 1));
  ionGeo.setAttribute('aS', new THREE.BufferAttribute(ionData.s, 1));
  const ionIdx = new Uint32Array(nIons);
  for (let i = 0; i < nIons; i++) ionIdx[i] = i;
  const ionIndexAttr = new THREE.BufferAttribute(ionIdx, 1); ionIndexAttr.setUsage(THREE.DynamicDrawUsage);
  ionGeo.setIndex(ionIndexAttr);
  const hotPos = new THREE.Vector3(lay.neckX, Y, SHAPE.r);
  const ionUniforms = {
    ...fogU, ...camU, uTime: timeU,
    uJigW: { value: calm ? 0.002 : 0.0075 }, uJigN: { value: calm ? 0.006 : 0.022 },
    uSize: { value: ION_R }, uNeckR: neckU, uNeckA: { value: lay.neckStart }, uNeckB: { value: lay.neckEnd },
    uTaper: { value: NECK_TAPER }, uWireR: { value: WIRE_R }, uBridge: bridgeU, uHotPos: { value: hotPos }, uHeat: heatU,
    uBase: { value: colour('#b86f45') }, uAlloy: { value: colour('#6f7179') }, uHeatCol: heatColU,
    uRim: { value: colour('#5fb6ea', 0.9) }, uKey: { value: 1.0 }, uGlow: { value: 0.25 }, uDepthPass: { value: 0 }, uIonFade: { value: 0 },
  };
  const ionMat = own(new THREE.ShaderMaterial({ vertexShader: ionVert, fragmentShader: ionFrag, uniforms: ionUniforms, transparent: true, depthWrite: false }));
  const ionDepthMat = own(new THREE.ShaderMaterial({ vertexShader: ionVert, fragmentShader: ionFrag, uniforms: { ...ionUniforms, uDepthPass: { value: 1 } }, colorWrite: false }));
  const ionsDepth = new THREE.Points(ionGeo, ionDepthMat); ionsDepth.frustumCulled = false; ionsDepth.renderOrder = 0;
  const ions = new THREE.Points(ionGeo, ionMat); ions.frustumCulled = false; ions.renderOrder = 1;
  root.add(ionsDepth, ions);
  const ionDepth = new Float32Array(nIons);
  const lastCam = new THREE.Vector3(1e9, 0, 0), lastDir = new THREE.Vector3();
  const sortIons = () => {
    const cp = stage.camera.position;
    const dir = stage.camera.getWorldDirection(new THREE.Vector3());
    if (cp.distanceToSquared(lastCam) < 1e-5 && dir.distanceToSquared(lastDir) < 1e-7) return;
    lastCam.copy(cp); lastDir.copy(dir);
    const p = ionData.pos;
    for (let i = 0; i < nIons; i++) ionDepth[i] = (p[i * 3] - cp.x) * dir.x + (p[i * 3 + 1] - cp.y) * dir.y + (p[i * 3 + 2] - cp.z) * dir.z;
    ionIdx.sort((a, b) => ionDepth[b] - ionDepth[a]);
    ionIndexAttr.needsUpdate = true;
  };

  // ───────── sheath (translucent wire skin; radius follows the neck) ─────────
  const sheathUniforms = {
    ...fogU, uWireR: { value: WIRE_R }, uNeckR: neckU, uScaleR: { value: 1.04 },
    uCol: { value: colour('#8fc6ff') }, uNeckCol: { value: colour(Q.resistance.colour) }, uK: { value: 0.55 }, uHeatCol: heatColU, uHeat: heatU,
  };
  const sheathMat = own(new THREE.ShaderMaterial({ vertexShader: sheathVert, fragmentShader: sheathFrag, uniforms: sheathUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sheathGeo = (s0: number, s1: number, neck: boolean) => {
    const rings = Math.max(2, Math.ceil((s1 - s0) / 0.06)), seg = 40;
    const pos: number[] = [], dir: number[] = [], w: number[] = [], idx: number[] = [];
    const c = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
      const s = s0 + ((s1 - s0) * i) / rings;
      world(s, 0, 0, c);
      const p = at(s);
      const ww = neck ? neckWeight(((s % L) + L) % L, lay) : 0;
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2, u = Math.cos(a), v = Math.sin(a);
        pos.push(c.x, c.y, c.z);
        dir.push(-p.tz * u, v, p.tx * u);
        w.push(ww);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 1));
    g.setIndex(idx);
    return g;
  };
  const addSheath = (g: THREE.BufferGeometry, parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(g, sheathMat); m.frustumCulled = false; m.renderOrder = 5; parent.add(m); return m;
  };
  addSheath(sheathGeo(lay.gapEnd, lay.batteryIn + L, true));
  addSheath(sheathGeo(lay.batteryOut, lay.gapStart, false));

  // ───────── the switch: a hinged bridge of wire ─────────
  const hinge = world(lay.gapStart, 0, WIRE_R);
  const tB = at(lay.gapStart); const tangent = new THREE.Vector3(tB.tx, 0, tB.tz);
  const hingeAxis = new THREE.Vector3().crossVectors(tangent, UP).normalize();
  const bridge = new THREE.Group(); bridge.matrixAutoUpdate = false; root.add(bridge);
  addSheath(sheathGeo(lay.gapStart + 0.01, lay.gapEnd - 0.07, false), bridge);
  const contactGeo = own(new THREE.CylinderGeometry(WIRE_R * 1.02, WIRE_R * 1.02, 0.035, 40));
  const contactMat = own(new THREE.MeshStandardMaterial({ color: 0xd6a066, metalness: 0.85, roughness: 0.32, emissive: 0x3a1c08, emissiveIntensity: 0.6 }));
  const orientX = (m: THREE.Object3D, s: number) => { const p = at(s); m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(p.tx, 0, p.tz)); world(s, 0, 0, m.position); };
  const padFixed = new THREE.Mesh(contactGeo, contactMat); orientX(padFixed, lay.gapEnd); root.add(padFixed);
  const padBridge = new THREE.Mesh(contactGeo, contactMat); orientX(padBridge, lay.gapEnd - 0.075); bridge.add(padBridge);
  const padHinge = new THREE.Mesh(contactGeo, contactMat); orientX(padHinge, lay.gapStart); root.add(padHinge);
  const pinGeo = own(new THREE.CylinderGeometry(0.05, 0.05, WIRE_R * 1.5, 20));
  const pin = new THREE.Mesh(pinGeo, M.brass()); pin.position.copy(hinge); pin.quaternion.setFromUnitVectors(UP, hingeAxis); root.add(pin);
  // brass collars on both ends of the bridge and an insulated handle on top, so the switch reads at a glance
  const collarGeo = own(new THREE.TorusGeometry(WIRE_R * 1.04, 0.035, 12, 48));
  for (const s of [lay.gapStart + 0.04, lay.gapEnd - 0.11]) {
    const c = new THREE.Mesh(collarGeo, M.brass()); orientX(c, s); c.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)); bridge.add(c);
  }
  const fixedCollar = new THREE.Mesh(collarGeo, M.brass()); orientX(fixedCollar, lay.gapEnd + 0.03); fixedCollar.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)); root.add(fixedCollar);
  const midS = (lay.gapStart + lay.gapEnd) / 2 - 0.03;
  const stem = new THREE.Mesh(own(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 16)), M.brass());
  world(midS, 0, WIRE_R + 0.12, stem.position); bridge.add(stem);
  const knob = new THREE.Mesh(own(new RoundedBoxGeometry(0.34, 0.16, 0.2, 3, 0.06)), M.plastic(0xb3261e, 0.35));
  world(midS, 0, WIRE_R + 0.3, knob.position); knob.rotation.y = Math.atan2(-tangent.z, tangent.x); bridge.add(knob);
  let bridgeAngle = model.input.closed ? 0 : 0.85;
  const bridgeM = new THREE.Matrix4();
  const setBridge = (ang: number) => {
    const t1 = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z);
    const r = new THREE.Matrix4().makeRotationAxis(hingeAxis, ang);
    const t2 = new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z);
    bridgeM.copy(t1).multiply(r).multiply(t2);
    bridge.matrix.copy(bridgeM); bridge.matrixWorldNeedsUpdate = true;
    bridgeU.value.copy(bridgeM);
  };
  setBridge(bridgeAngle);

  // ───────── the battery: a lift that raises each dot's energy ─────────
  const bat = new THREE.Group(); root.add(bat);
  const batLen = Math.abs(lay.batteryX[0] - lay.batteryX[1]);
  const batCx = (lay.batteryX[0] + lay.batteryX[1]) / 2;
  bat.position.set(batCx, Y, -SHAPE.r);
  bat.rotation.z = Math.PI / 2; // cylinder axis along x
  const vCol = colour(Q.voltage.colour);
  const liftU = { ...fogU, uCol: { value: vCol.clone().multiplyScalar(1.15) }, uLevel: { value: 0.5 }, uTime: timeU, uFlow: { value: 0 }, uFlip: { value: 0 } };
  const liftMat = own(new THREE.ShaderMaterial({ vertexShader: liftVert, fragmentShader: liftFrag, uniforms: liftU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  // cylinder uv.y runs 0 at −y to 1 at +y; after rotation.z = +90°, local +y points to −x (the − end). So t = uv.y: 0 at + end, 1 at − end.
  const liftGeo = own(new THREE.CylinderGeometry(0.62, 0.62, batLen - 0.1, 48, 1, true));
  const lift = new THREE.Mesh(liftGeo, liftMat); lift.renderOrder = 4; bat.add(lift);
  const shellGeo = own(new THREE.CylinderGeometry(0.86, 0.86, batLen, 64, 1, true));
  const shellMat = own(new THREE.MeshPhysicalMaterial({ color: 0x1b2333, metalness: 0.2, roughness: 0.18, transparent: true, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false, side: THREE.DoubleSide }));
  const shell = new THREE.Mesh(shellGeo, shellMat); shell.renderOrder = 6; bat.add(shell);
  const shellRim = new THREE.Mesh(shellGeo, rimMat); shellRim.renderOrder = 7; shellRim.scale.setScalar(1.003); bat.add(shellRim);
  // rings: each one brighter than the last (the lift), with a wave moving + → − while charge flows
  const rings: THREE.Mesh[] = [];
  const ringGeo = own(new THREE.TorusGeometry(0.8, 0.022, 10, 72));
  const NR = 7;
  for (let i = 0; i < NR; i++) {
    const m = own(new THREE.MeshBasicMaterial({ color: vCol.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ring = new THREE.Mesh(ringGeo, m);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -batLen / 2 + 0.25 + (i * (batLen - 0.5)) / (NR - 1);
    ring.renderOrder = 6;
    bat.add(ring); rings.push(ring);
  }
  // end caps: + end (with a raised nub) and − end (flat)
  const capMat = own(new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.9, roughness: 0.28 }));
  const capGeo = own(new THREE.RingGeometry(WIRE_R * 1.05, 0.9, 64));
  const capRimGeo = own(new THREE.TorusGeometry(0.88, 0.04, 12, 72));
  const nubGeo = own(new THREE.CylinderGeometry(0.6, 0.62, 0.14, 48, 1, true));
  for (const end of [-1, 1] as const) {
    const cap = new THREE.Mesh(capGeo, capMat); cap.rotation.x = Math.PI / 2; cap.position.y = end * batLen / 2; bat.add(cap);
    const cap2 = new THREE.Mesh(capGeo, capMat); cap2.rotation.x = -Math.PI / 2; cap2.position.y = end * batLen / 2; bat.add(cap2);
    const rim = new THREE.Mesh(capRimGeo, capMat); rim.rotation.x = Math.PI / 2; rim.position.y = end * batLen / 2; bat.add(rim);
  }
  const nub = new THREE.Mesh(nubGeo, capMat); nub.position.y = -batLen / 2 - 0.07; bat.add(nub); // local −y = world +x = the + end
  const nubCap = new THREE.Mesh(own(new THREE.RingGeometry(WIRE_R * 1.05, 0.6, 48)), capMat); nubCap.rotation.x = Math.PI / 2; nubCap.position.y = -batLen / 2 - 0.14; bat.add(nubCap);

  // ───────── the counter gate ─────────
  const gate = new THREE.Group(); root.add(gate);
  world(lay.gate, 0, 0, gate.position);
  gate.rotation.y = Math.PI / 2;
  const iCol = colour(Q.current.colour);
  const gateMat = own(new THREE.MeshStandardMaterial({ color: 0x0e1a24, metalness: 0.6, roughness: 0.3, emissive: iCol, emissiveIntensity: 0.8 }));
  const gateRing = new THREE.Mesh(own(new THREE.TorusGeometry(0.6, 0.05, 16, 96)), gateMat); gate.add(gateRing);
  const gateOuter = new THREE.Mesh(own(new THREE.TorusGeometry(0.7, 0.014, 8, 96)), own(new THREE.MeshBasicMaterial({ color: iCol.clone().multiplyScalar(0.6), transparent: true, opacity: 0.8 }))); gate.add(gateOuter);
  const gateDisc = new THREE.Mesh(own(new THREE.RingGeometry(0.47, 0.6, 72)), own(new THREE.MeshBasicMaterial({ color: iCol.clone(), transparent: true, opacity: 0.08, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })));
  gate.add(gateDisc);
  // little sensor nubs round the ring
  const nubMat = own(new THREE.MeshStandardMaterial({ color: 0x2a3440, metalness: 0.7, roughness: 0.35, emissive: iCol, emissiveIntensity: 0.3 }));
  const sensorGeo = own(new RoundedBoxGeometry(0.07, 0.11, 0.07, 2, 0.02));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const nb = new THREE.Mesh(sensorGeo, nubMat); nb.position.set(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0); nb.rotation.z = a + Math.PI / 2; gate.add(nb);
  }
  let gatePulse = 0, gateCount = 0;

  // ───────── the resistor region: heat light + energy pile jar ─────────
  const heatLight = new THREE.PointLight(0xff8040, 0, 6, 2);
  heatLight.position.copy(hotPos).add(new THREE.Vector3(0, -0.1, 0.25));
  root.add(heatLight);
  const jarPos = new THREE.Vector3(lay.neckX, Y - 1.72, SHAPE.r + 0.35);
  const JAR_H = 0.82, JAR_R = 0.4;
  const jar = new THREE.Group(); jar.position.copy(jarPos); root.add(jar);
  const jarGeo = own(new THREE.CylinderGeometry(JAR_R, JAR_R * 0.96, JAR_H, 48, 1, true));
  const jarGlass = new THREE.Mesh(jarGeo, M.glass(stage.quality)); jarGlass.position.y = JAR_H / 2; jarGlass.renderOrder = 8; jar.add(jarGlass);
  const jarRim = new THREE.Mesh(jarGeo, rimMat); jarRim.position.y = JAR_H / 2; jarRim.scale.setScalar(1.01); jarRim.renderOrder = 9; jar.add(jarRim);
  const lipGeo = own(new THREE.TorusGeometry(JAR_R, 0.018, 10, 64));
  const lip = new THREE.Mesh(lipGeo, M.brass()); lip.rotation.x = Math.PI / 2; lip.position.y = JAR_H; jar.add(lip);
  const baseGeo = own(new THREE.CylinderGeometry(JAR_R + 0.08, JAR_R + 0.11, 0.09, 48));
  const base = new THREE.Mesh(baseGeo, M.phenolic()); base.position.y = -0.03; jar.add(base);
  const eCol = colour(Q.energy.colour);
  const packetGeo = own(new RoundedBoxGeometry(0.075, 0.075, 0.075, 2, 0.017));
  const flyMat = own(new THREE.MeshStandardMaterial({ color: eCol, emissive: eCol, emissiveIntensity: 2.2, roughness: 0.45, metalness: 0 }));
  const pileMat = own(new THREE.MeshStandardMaterial({ color: eCol, emissive: eCol, emissiveIntensity: 0.75, roughness: 0.5, metalness: 0 }));
  const POOL = 90;
  const flying = new THREE.InstancedMesh(packetGeo, flyMat, POOL); flying.frustumCulled = false; root.add(flying);
  flying.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const flights = Array.from({ length: POOL }, () => ({ on: false, t: 0, p0: new THREE.Vector3(), p1: new THREE.Vector3(), c: new THREE.Vector3(), p2: new THREE.Vector3(), spin: new THREE.Vector3() }));
  // pile slots: hex rings, bottom up, with a little tumble
  const pileSlots: THREE.Matrix4[] = [];
  {
    let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const sp = 0.082;
    for (let layer = 0; layer < 10; layer++) {
      const ring: THREE.Vector3[] = [];
      for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
        const x = (i + (j % 2) * 0.5) * sp, z = j * sp * 0.866;
        if (Math.hypot(x, z) < JAR_R - 0.06) ring.push(new THREE.Vector3(x + (rnd() - 0.5) * 0.02, 0.05 + layer * 0.074 + rnd() * 0.012, z + (rnd() - 0.5) * 0.02));
      }
      // fill each layer from the centre out so the pile looks heaped
      ring.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) + (rnd() - 0.5) * 0.06);
      for (const v of ring) pileSlots.push(new THREE.Matrix4().compose(v.add(jarPos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.6, rnd() * 3, rnd() * 0.6)), new THREE.Vector3(1, 1, 1)));
    }
  }
  const pile = new THREE.InstancedMesh(packetGeo, pileMat, pileSlots.length); pile.frustumCulled = false; pile.count = 0; root.add(pile);
  pileSlots.forEach((m, i) => pile.setMatrixAt(i, m));
  let pileCount = 0, emitted = 0;

  // ───────── charge dots ─────────
  const ND = tier.dots, G = tier.ghosts, NV = ND * (1 + G);
  const dS = new Float32Array(ND), dU = new Float32Array(ND), dV = new Float32Array(ND), dW = new Float32Array(ND * 3), dPh = new Float32Array(ND * 3), dGlow = new Float32Array(ND);
  {
    let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < ND; i++) {
      dS[i] = ((i + rnd()) / ND) * L;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.86;
      dU[i] = Math.cos(a) * r; dV[i] = Math.sin(a) * r;
      for (let k = 0; k < 3; k++) { dW[i * 3 + k] = 9 + rnd() * 9; dPh[i * 3 + k] = rnd() * 6.283; }
      dGlow[i] = glowAt(dS[i], lay, model.input.volts, model.input.closed);
    }
  }
  const dotPos = new Float32Array(NV * 3), dotGlowA = new Float32Array(NV), dotFade = new Float32Array(NV);
  const dotGeo = own(new THREE.BufferGeometry());
  const dPosAttr = new THREE.BufferAttribute(dotPos, 3).setUsage(THREE.DynamicDrawUsage);
  const dGlowAttr = new THREE.BufferAttribute(dotGlowA, 1).setUsage(THREE.DynamicDrawUsage);
  const dFadeAttr = new THREE.BufferAttribute(dotFade, 1).setUsage(THREE.DynamicDrawUsage);
  dotGeo.setAttribute('position', dPosAttr); dotGeo.setAttribute('aGlow', dGlowAttr); dotGeo.setAttribute('aFade', dFadeAttr);
  const dotMat = own(new THREE.ShaderMaterial({
    vertexShader: dotVert, fragmentShader: dotFrag,
    uniforms: { ...fogU, ...camU, uPx: { value: 1 }, uCore: { value: DOT_CORE }, uHalo: { value: DOT_HALO }, uDim: { value: colour('#8fb0ff') }, uHot: { value: colour('#ffb21f', 1.0) }, uBoost: { value: stage.quality === 'low' ? 0.5 : 0.2 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const dots = new THREE.Points(dotGeo, dotMat); dots.frustumCulled = false; dots.renderOrder = 2; root.add(dots);

  // ───────── fx: collision flashes in the resistor, sparks at the gate ─────────
  const NF = tier.fx;
  const fxPos = new Float32Array(NF * 3), fxSize = new Float32Array(NF), fxCol = new Float32Array(NF * 3), fxAlpha = new Float32Array(NF);
  const fxLife = new Float32Array(NF), fxMax = new Float32Array(NF), fxVel = new Float32Array(NF * 3);
  const fxGeo = own(new THREE.BufferGeometry());
  const fxAttrs = {
    pos: new THREE.BufferAttribute(fxPos, 3).setUsage(THREE.DynamicDrawUsage), size: new THREE.BufferAttribute(fxSize, 1).setUsage(THREE.DynamicDrawUsage),
    col: new THREE.BufferAttribute(fxCol, 3).setUsage(THREE.DynamicDrawUsage), alpha: new THREE.BufferAttribute(fxAlpha, 1).setUsage(THREE.DynamicDrawUsage),
  };
  fxGeo.setAttribute('position', fxAttrs.pos); fxGeo.setAttribute('aSize', fxAttrs.size); fxGeo.setAttribute('aCol', fxAttrs.col); fxGeo.setAttribute('aAlpha', fxAttrs.alpha);
  const fxMat = own(new THREE.ShaderMaterial({ vertexShader: fxVert, fragmentShader: fxFrag, uniforms: { ...fogU, uScale: camU.uScale, uRing: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const fx = new THREE.Points(fxGeo, fxMat); fx.frustumCulled = false; fx.renderOrder = 3; root.add(fx);
  let fxNext = 0;
  const spawnFx = (x: number, y: number, z: number, size: number, c: THREE.Color, life: number, vx = 0, vy = 0, vz = 0) => {
    const i = fxNext; fxNext = (fxNext + 1) % NF;
    fxPos[i * 3] = x; fxPos[i * 3 + 1] = y; fxPos[i * 3 + 2] = z;
    fxSize[i] = size; fxCol[i * 3] = c.r; fxCol[i * 3 + 1] = c.g; fxCol[i * 3 + 2] = c.b;
    fxLife[i] = life; fxMax[i] = life; fxVel[i * 3] = vx; fxVel[i * 3 + 1] = vy; fxVel[i * 3 + 2] = vz;
  };
  const flashCol = new THREE.Color(1.6, 1.15, 0.7), sparkCol = iCol.clone().multiplyScalar(2.2);

  // ───────── DOM labels ─────────
  const overlay = opts.overlay ?? stage.canvas.parentElement ?? document.body;
  const labelsOn = opts.labels !== false;
  const labelLayer = document.createElement('div');
  labelLayer.className = 'lz-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  if (labelsOn) overlay.appendChild(labelLayer);
  interface Tag { el: HTMLElement; at: THREE.Vector3; foci: FocusName[] | 'all'; below?: boolean; val?: HTMLElement; sub?: HTMLElement }
  const qv = (q: keyof typeof Q) => `<b class="lz-sym" style="color:${Q[q].colour}">${Q[q].symbol}</b>`;
  const tags: Tag[] = [];
  const tag = (cls: string, at: THREE.Vector3, title: string, foci: Tag['foci'], below = false): Tag => {
    const el = document.createElement('div');
    el.className = `lz-tag ${cls}${below ? ' lz-below' : ''}`;
    el.innerHTML = `<div class="lz-card"><div class="lz-title">${title}</div><div class="lz-val"></div><div class="lz-sub"></div></div>`;
    labelLayer.appendChild(el);
    const t: Tag = { el, at, foci, below, val: el.querySelector('.lz-val') as HTMLElement, sub: el.querySelector('.lz-sub') as HTMLElement };
    tags.push(t);
    return t;
  };
  const tBattery = tag('lz-battery', new THREE.Vector3(batCx, Y + 1.0, -SHAPE.r), 'Battery: the loader', 'all');
  const tMinus = tag('lz-end', new THREE.Vector3(lay.batteryX[1] - 0.05, Y + 0.95, -SHAPE.r), '<span class="lz-pole">−</span> end', ['battery']);
  const tPlus = tag('lz-end', new THREE.Vector3(lay.batteryX[0] + 0.15, Y + 0.95, -SHAPE.r), '<span class="lz-pole">+</span> end', ['battery']);
  const tSwitch = tag('lz-switch', world((lay.gapStart + lay.gapEnd) / 2, 0, WIRE_R + 0.7), 'Switch', 'all');
  const tGate = tag('lz-gate', new THREE.Vector3(lay.gateX, Y - 0.78, SHAPE.r), 'Counter gate', 'all', true);
  const tRes = tag('lz-res', new THREE.Vector3(lay.neckX + 0.75, Y + 0.5, SHAPE.r), 'Resistor', 'all');
  const tJar = tag('lz-jar', new THREE.Vector3(lay.neckX, Y - 1.82, SHAPE.r + 0.35), 'Energy pile', 'all', true);
  const tA = tag('lz-pt', world(lay.neckStart, 0, 0), 'A', ['resistor', 'overview']);
  const tB2 = tag('lz-pt', world(lay.neckEnd, 0, 0), 'B', ['resistor', 'overview']);
  const tDrift = tag('lz-drift', new THREE.Vector3(lay.neckX + 2.35, Y - 0.62, SHAPE.r), 'electron drift', 'all', true);
  tA.el.classList.add('lz-mark'); tB2.el.classList.add('lz-mark');
  tDrift.val!.innerHTML = '<span class="lz-arrow">➜</span>';
  tMinus.sub!.textContent = 'dots leave bright';
  tPlus.sub!.textContent = 'dots arrive dim';
  const driftA = world(lay.neckEnd + 0.4), driftB = world(lay.neckEnd + 1.0);

  // ───────── camera views ─────────
  let focused: FocusName = opts.focus ?? 'overview';
  const viewFor = (f: FocusName) => {
    const asp = stage.camera.aspect || 1.6;
    const portrait = asp < 1.05;
    const tanV = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
    if (f === 'overview') {
      if (portrait) {
        const d = Math.max(7.8 / tanV, 3.6 / (tanV * asp));
        return { target: [1.9, Y - 0.3, 0.2] as [number, number, number], yaw: -Math.PI / 2 + 0.0001, pitch: 1.0, distance: Math.min(d * 1.06, 26) };
      }
      const d = Math.max(4.2 / tanV, 7.3 / (tanV * asp));
      return { target: [0.25, Y - 0.35, 0.3] as [number, number, number], yaw: 0, pitch: 0.68, distance: Math.min(d, 24) };
    }
    const k = portrait ? Math.min(1.9, 1.15 / asp) : 1;
    if (f === 'battery') return { target: [batCx - 0.35, Y - 0.05, -SHAPE.r] as [number, number, number], yaw: 0.12, pitch: 0.42, distance: 5.0 * k };
    if (f === 'gate') return { target: [lay.gateX + 0.45, Y, SHAPE.r] as [number, number, number], yaw: -0.62, pitch: 0.3, distance: 3.3 * k };
    return { target: [lay.neckX, Y - 0.62, SHAPE.r + 0.15] as [number, number, number], yaw: 0.16, pitch: 0.8, distance: 5.0 * k };
  };
  const focusTarget = new THREE.Vector3();
  const applyFocus = (f: FocusName, seconds: number) => {
    focused = f;
    const v = viewFor(f);
    focusTarget.set(...v.target);
    if (f === 'overview') stage.setHome({ ...v, minDistance: 1.4, maxDistance: 28 }, false);
    stage.flyTo(v, seconds);
    labelLayer.dataset.focus = f;
  };
  stage.setHome({ ...viewFor('overview'), minDistance: 1.4, maxDistance: 28 }, false);
  applyFocus(focused, 0);
  const offResize = stage.onResize(() => {
    if (!stage.userMoved) applyFocus(focused, 0);
    labelLayer.classList.toggle('lz-narrow', (overlay.clientWidth || 800) < 560);
  });
  labelLayer.classList.toggle('lz-narrow', (overlay.clientWidth || 800) < 560);

  // ───────── frame loop ─────────
  let drift = 0, heat = 0, labelTimer = 0, flowPhase = 0;
  const v3 = new THREE.Vector3(), cam = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const bb = new THREE.Vector2();
  const neckAlloyCol = new THREE.Color();
  const me = bridgeM.elements;
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), eu = new THREE.Euler();

  const placeDot = (s: number, u: number, v: number, t: number, i: number, out: Float32Array, o: number) => {
    const w = neckWeight(s, lay);
    const r = WIRE_R * (1 - w) + neckR * w;
    const p = at(s);
    const amp = calm ? 0.005 : 0.02 * (1 + w * 0.6);
    const jx = amp * Math.sin(t * dW[i * 3] + dPh[i * 3]), jy = amp * Math.sin(t * dW[i * 3 + 1] + dPh[i * 3 + 1]), jz = amp * Math.sin(t * dW[i * 3 + 2] + dPh[i * 3 + 2]);
    const uu = u * r * 0.86, vv = v * r * 0.86;
    let x = p.x - p.tz * uu + jx, y = Y + vv + jy, z = p.z + p.tx * uu + jz;
    if (bridgeAngle > 0.001 && s >= lay.gapStart && s <= lay.gapEnd) {
      const nx = me[0] * x + me[4] * y + me[8] * z + me[12], ny = me[1] * x + me[5] * y + me[9] * z + me[13], nz = me[2] * x + me[6] * y + me[10] * z + me[14];
      x = nx; y = ny; z = nz;
    }
    out[o] = x; out[o + 1] = y; out[o + 2] = z;
  };

  const offFrame = stage.onFrame((dt, t) => {
    timeU.value = t;
    const inp = model.input;
    model.step(dt);
    const rd = model.readings();

    // switch bridge swings; current only flows once it is home
    const goal = inp.closed ? 0 : 0.85;
    if (Math.abs(bridgeAngle - goal) > 1e-4) {
      bridgeAngle += Math.sign(goal - bridgeAngle) * Math.min(Math.abs(goal - bridgeAngle), dt * (calm ? 20 : 3.2));
      setBridge(bridgeAngle);
    }
    const contact = bridgeAngle < 0.01;
    const driftGoal = contact ? rd.drift : 0;
    drift += (driftGoal - drift) * Math.min(1, dt * 7);
    if (Math.abs(drift) < 1e-5) drift = 0;
    // neck radius follows the resistance
    const nGoal = neckRadius(inp.ohms);
    neckR += (nGoal - neckR) * Math.min(1, dt * 6);
    neckU.value = neckR;
    heat += (heatFor(contact ? rd.P : 0) - heat) * Math.min(1, dt * 1.6);
    heatU.value = heat;
    blackbody(850 + 1150 * heat, neckAlloyCol).multiplyScalar(0.75 * Math.pow(heat, 1.2));
    heatColU.value.copy(neckAlloyCol);
    heatLight.color.copy(blackbody(850 + 1150 * heat));
    heatLight.intensity = heat * 5;

    // dots
    const ds = drift * dt;
    // a very short, straight motion streak only: a long tail that wiggles behind a round head reads as a swimming cell
    const trail = Math.min(0.028, drift * 0.014);
    const fadeK = Math.min(1, drift / 0.25);
    let crossings = 0;
    for (let i = 0; i < ND; i++) {
      const s0 = dS[i];
      let s1 = s0 + ds; if (s1 >= L) s1 -= L;
      dS[i] = s1;
      if (ds > 0) {
        let d = s1 - lay.gate; if (d < 0) d += L;
        if (d < ds) {
          crossings++; gateCount++;
          if (crossings < 4 && Math.random() < 0.6) { placeDot(s1, dU[i], dV[i], t, i, dotPos, 0); spawnFx(dotPos[0], dotPos[1], dotPos[2], 0.085, sparkCol, 0.28, 0, 0, 0); }
        }
      }
      const g = glowAt(s1, lay, inp.volts, inp.closed && contact);
      dGlow[i] += (g - dGlow[i]) * Math.min(1, dt * 9);
      const base = i * (1 + G);
      placeDot(s1, dU[i], dV[i], t, i, dotPos, base * 3);
      dotGlowA[base] = dGlow[i]; dotFade[base] = 1;
      for (let k = 1; k <= G; k++) {
        const vi = base + k;
        if (fadeK <= 0.001) { dotFade[vi] = 0; continue; }
        placeDot(s1 - trail * k, dU[i], dV[i], t, i, dotPos, vi * 3);
        dotGlowA[vi] = dGlow[i]; dotFade[vi] = fadeK * (1 - k / (G + 1)) * 0.4;
      }
    }
    dPosAttr.needsUpdate = true; dGlowAttr.needsUpdate = true; dFadeAttr.needsUpdate = true;

    // gate pulse
    gatePulse = gatePulse * Math.exp(-dt * 6) + crossings * 0.12;
    gateMat.emissiveIntensity = 0.55 + Math.min(2.2, gatePulse);

    // battery lift
    flowPhase += drift * dt * 1.4;
    liftU.uLevel.value = 0.15 + 0.85 * (inp.volts / 12);
    liftU.uFlow.value = flowPhase;
    for (let i = 0; i < NR; i++) {
      // ring 0 is at local −y = the + end (dim); the last ring is at the − end (bright)
      const tt = i / (NR - 1);
      const wave = drift > 0.001 ? Math.pow(0.5 + 0.5 * Math.sin(flowPhase * 6.283 * 0.6 - tt * 5), 6) : 0;
      (rings[i].material as THREE.MeshBasicMaterial).opacity = Math.min(1, (inp.volts / 12) * (0.04 + 0.96 * tt * tt) + wave * 0.35 * (inp.volts / 12) * tt);
    }

    // collisions in the resistor
    if (contact && drift > 0) {
      const rate = Math.min(140, 40 * rd.I * (1 + heat));
      let n = rate * dt;
      while (n > 0) {
        if (n < 1 && Math.random() > n) break;
        n -= 1;
        const s = lay.neckStart + Math.random() * (lay.neckEnd - lay.neckStart);
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * neckR * 0.8;
        world(s, Math.cos(a) * r, Math.sin(a) * r, v3);
        spawnFx(v3.x, v3.y, v3.z, 0.05 + Math.random() * 0.05, flashCol, 0.12 + Math.random() * 0.1);
      }
    }

    // energy packets: one per joule, flying from the resistor into the pile
    const target = Math.floor(model.energy / JOULES_PER_PACKET + 1e-9);
    let guard = 0;
    while (emitted < target && guard++ < 8) {
      emitted++;
      const f = flights.find((x) => !x.on);
      if (!f) { pileCount++; continue; }
      f.on = true; f.t = 0;
      const s = lay.neckStart + Math.random() * (lay.neckEnd - lay.neckStart);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      world(s, Math.cos(a) * neckR, Math.sin(a) * neckR, f.p0);
      world(s, Math.cos(a) * (neckR + 0.55), Math.sin(a) * (neckR + 0.55), f.p1);
      f.p2.set(jarPos.x + (Math.random() - 0.5) * 0.3, jarPos.y + JAR_H + 0.05, jarPos.z + (Math.random() - 0.5) * 0.3);
      f.c.copy(f.p1).lerp(f.p2, 0.5).add(tmp.set(0, 0.35, 0.25));
      f.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    }
    if (emitted < target) { pileCount += target - emitted; emitted = target; }
    for (let i = 0; i < POOL; i++) {
      const f = flights[i];
      if (!f.on) { flying.setMatrixAt(i, mtx.makeScale(0, 0, 0)); continue; }
      f.t += dt;
      const T1 = 0.32, T2 = 1.05;
      if (f.t < T1) v3.lerpVectors(f.p0, f.p1, 1 - Math.pow(1 - f.t / T1, 2));
      else {
        const k = Math.min(1, (f.t - T1) / (T2 - T1));
        const a1 = (1 - k) * (1 - k), b1 = 2 * (1 - k) * k, c1 = k * k;
        v3.set(a1 * f.p1.x + b1 * f.c.x + c1 * f.p2.x, a1 * f.p1.y + b1 * f.c.y + c1 * f.p2.y, a1 * f.p1.z + b1 * f.c.z + c1 * f.p2.z);
      }
      const grow = Math.min(1, f.t / 0.12);
      q.setFromEuler(eu.set(f.spin.x * f.t, f.spin.y * f.t, f.spin.z * f.t));
      flying.setMatrixAt(i, mtx.compose(v3, q, sc.setScalar(grow)));
      if (f.t >= T2) { f.on = false; pileCount++; }
    }
    flying.instanceMatrix.needsUpdate = true;
    pile.count = Math.min(pileSlots.length, pileCount);

    // fx
    for (let i = 0; i < NF; i++) {
      if (fxLife[i] <= 0) { fxAlpha[i] = 0; continue; }
      fxLife[i] -= dt;
      const k = Math.max(0, fxLife[i] / fxMax[i]);
      fxAlpha[i] = k * k;
      fxPos[i * 3] += fxVel[i * 3] * dt; fxPos[i * 3 + 1] += fxVel[i * 3 + 1] * dt; fxPos[i * 3 + 2] += fxVel[i * 3 + 2] * dt;
    }
    fxAttrs.pos.needsUpdate = true; fxAttrs.size.needsUpdate = true; fxAttrs.col.needsUpdate = true; fxAttrs.alpha.needsUpdate = true;

    // camera-dependent uniforms: point scale, depth of field, fog
    stage.renderer.getDrawingBufferSize(bb);
    camU.uScale.value = bb.y / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
    cam.copy(stage.camera.position);
    stage.camera.getWorldDirection(dir);
    const fd = Math.max(1, tmp.copy(focusTarget).sub(cam).dot(dir));
    camU.uFocus.value += (fd - camU.uFocus.value) * Math.min(1, dt * 5);
    camU.uFocusRange.value = camU.uFocus.value * (focused === 'overview' ? 0.6 : 0.42);
    ionUniforms.uIonFade.value = 0.55 * THREE.MathUtils.smoothstep(camU.uFocus.value, 6, 13);
    dotMat.uniforms.uPx.value = stage.renderer.getPixelRatio();
    fogU.uFogNear.value = camU.uFocus.value * 0.85;
    fogU.uFogFar.value = camU.uFocus.value * (focused === 'overview' ? 2.3 : 2.9);
    if (stage.scene.fog instanceof THREE.Fog) { stage.scene.fog.near = fogU.uFogNear.value; stage.scene.fog.far = fogU.uFogFar.value * 1.3; }
    sortIons();

    // labels
    if (labelsOn) {
      labelTimer -= dt;
      if (labelTimer <= 0) { labelTimer = 0.2; refreshLabelText(rd); }
      const narrow = labelLayer.classList.contains('lz-narrow');
      for (const tg of tags) {
        let on = tg.foci === 'all' || tg.foci.includes(focused);
        // the whole-loop view on a phone has no room for the small markers
        if (narrow && focused === 'overview' && (tg === tA || tg === tB2 || tg === tDrift)) on = false;
        const sp = stage.toScreen(tg.at);
        const vis = on && sp.visible && sp.x > -20 && sp.y > -20 && sp.x < (overlay.clientWidth + 20) && sp.y < (overlay.clientHeight + 20);
        tg.el.style.display = vis ? '' : 'none';
        if (vis) tg.el.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px)`;
      }
      const a2 = stage.toScreen(driftA), b2 = stage.toScreen(driftB);
      const ang = Math.atan2(b2.y - a2.y, b2.x - a2.x);
      const arrow = tDrift.val!.firstElementChild as HTMLElement | null;
      if (arrow) arrow.style.transform = `rotate(${ang.toFixed(3)}rad)`;
    }
  });

  const refreshLabelText = (rd: LensReadings) => {
    const narrow = labelLayer.classList.contains('lz-narrow');
    tBattery.val!.innerHTML = `${qv('voltage')} = ${fmt(rd.V, 'V')}`;
    tBattery.sub!.textContent = narrow ? '' : 'raises the glow of every dot';
    tGate.val!.innerHTML = `${qv('current')} = ${fmt(rd.I, 'A')}`;
    tGate.sub!.textContent = narrow ? '' : 'dots passing each second';
    const detail = focused === 'resistor' || (focused === 'overview' && !narrow);
    tRes.val!.innerHTML = `${qv('resistance')} = ${fmt(rd.R, 'Ω')}` + (detail ? `<br>${qv('voltage')} A→B = ${fmt(rd.VR, 'V')}` : '');
    tRes.sub!.textContent = focused === 'resistor' && !narrow ? 'glow lost from A to B' : '';
    tJar.val!.innerHTML = `${qv('energy')} = ${fmt(rd.E, 'J')}<br>${qv('power')} = ${fmt(rd.P, 'W')}`;
    tJar.sub!.textContent = narrow ? '' : `1 packet = ${JOULES_PER_PACKET} J · ${Q.power.symbol} = how fast it grows`;
    tSwitch.val!.textContent = rd.closed ? 'closed' : 'open';
    tSwitch.el.classList.toggle('is-open', !rd.closed);
    tSwitch.sub!.textContent = !rd.closed && !narrow ? `${Q.voltage.symbol} across the gap = ${fmt(rd.Vgap, 'V')}` : '';
  };
  refreshLabelText(model.readings());

  const notify = () => emit();
  const api: DeepZoom = {
    setVolts(v) { model.set({ volts: Math.min(12, Math.max(0, v)) }); notify(); },
    setOhms(r) { model.set({ ohms: Math.min(1000, Math.max(0.1, r)) }); notify(); },
    setClosed(c) { model.set({ closed: !!c }); notify(); },
    focus(f, seconds = 1.3) { applyFocus(f, seconds); notify(); },
    get focused() { return focused; },
    get input() { return model.input; },
    readings: () => model.readings(),
    resetEnergy() {
      model.resetEnergy(); emitted = 0; pileCount = 0; pile.count = 0;
      for (const f of flights) f.on = false;
      notify();
    },
    get gateCount() { return gateCount; },
    onChange(cb) { changeCbs.add(cb); return () => changeCbs.delete(cb); },
    dispose() {
      offFrame(); offResize();
      if (stage.scene.fog instanceof THREE.Fog && fog0) { stage.scene.fog.near = fog0[0]; stage.scene.fog.far = fog0[1]; }
      changeCbs.clear();
      labelLayer.remove();
      disposeTree(root);
      for (const o of owned) o.dispose();
    },
  };
  return api;
}
