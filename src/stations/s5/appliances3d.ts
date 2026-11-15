// Station 5 appliance models. Scale: 1 unit = 10 cm, y up, each model stands on y = 0 and faces +z.
// Everything here is owned by the model (except kit-shared materials/geometries) and freed by disposeTree.
import * as THREE from 'three';
import type { QualityTier } from '../../types';
import * as M from '../../kit/materials';
import { blackbody, glowSprite, rbox } from '../../kit/parts/common';
import { glowTexture } from '../../kit/textures';
import type { S5Id } from './model';
import { drawMicrowaveWindow, kettleWindow, linen, microwaveKeypad, phoneScreen, toast, tvPicture } from './textures';
import { canvas } from '../../kit/textures';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface ApplianceModel {
  id: S5Id;
  group: THREE.Group;
  /** local point where the power cord leaves the appliance */
  cordExit: THREE.Vector3;
  cordColour: number;
  /** local centre and radius of the region energy packets leave from */
  hot: THREE.Vector3;
  hotR: number;
  /** local anchor for the on/off tag */
  tag: THREE.Vector3;
  /** footprint for the contact shadow (w, d) */
  foot: [number, number];
  /** per frame: `active` = switched on and running now */
  update(active: boolean, dt: number, t: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function mk(g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh {
  const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = true; return x;
}
/** smooth lathe through (r, y) control points */
function lathe(pts: [number, number][], seg = 64, n = 48, phiStart = 0, phiLen = Math.PI * 2): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.LatheGeometry(curve.getPoints(n), seg, phiStart, phiLen);
}
const ease = (cur: number, target: number, dt: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

const glossBlack = () => new THREE.MeshPhysicalMaterial({ color: 0x141517, roughness: 0.28, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2 });
const steelD = () => new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 0.82, roughness: 0.26, side: THREE.DoubleSide, envMapIntensity: 1.5 });
const chrome = () => new THREE.MeshStandardMaterial({ color: 0xe8e8ea, metalness: 1, roughness: 0.12 });
const ledMat = (c: number) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0, roughness: 0.3 });

// ───────────── kettle ─────────────
export function createKettle(): ApplianceModel {
  const g = new THREE.Group();
  const black = glossBlack();
  g.add(mk(lathe([[0, 0], [0.9, 0], [0.95, 0.04], [0.95, 0.12], [0.9, 0.17], [0, 0.175]], 64, 16), black));
  const body = lathe([[0.8, 0.17], [0.85, 0.24], [0.865, 0.42], [0.85, 0.8], [0.8, 1.3], [0.73, 1.78], [0.67, 2.1], [0.665, 2.17]]);
  const kSteel = new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 0.82, roughness: 0.26, roughnessMap: M.steel().roughnessMap, envMapIntensity: 1.5 });
  g.add(mk(body, kSteel));
  const band = mk(lathe([[0.86, 0.19], [0.875, 0.26], [0.875, 0.36], [0.866, 0.42]], 64, 8), black); g.add(band);
  const rim = mk(new THREE.TorusGeometry(0.666, 0.022, 10, 64).rotateX(Math.PI / 2), chrome()); rim.position.y = 2.17; g.add(rim);
  g.add(mk(lathe([[0.665, 2.17], [0.64, 2.22], [0.55, 2.3], [0.35, 2.36], [0.001, 2.38]], 64, 16), black));
  g.add(mk(lathe([[0.001, 2.37], [0.17, 2.37], [0.18, 2.43], [0.14, 2.5], [0.001, 2.51]], 32, 10), chrome()));
  // water window following the body profile
  const winPhi = 0.2, winW = 0.46;
  const winTex = kettleWindow();
  const winMat = new THREE.MeshPhysicalMaterial({ map: winTex, transparent: true, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x3aa8ff, emissiveMap: winTex, emissiveIntensity: 0, depthWrite: false });
  const win = mk(lathe([[0.866, 0.58], [0.855, 0.9], [0.818, 1.3], [0.762, 1.68]], 16, 24, winPhi - winW / 2, winW), winMat, false);
  win.scale.set(1.012, 1, 1.012); g.add(win);
  const frame = steelD();
  for (const s of [-1, 1]) {
    const a = winPhi + s * winW / 2;
    const strip = mk(new THREE.BoxGeometry(0.05, 1.12, 0.03), black, false);
    strip.position.set(0.83 * Math.sin(a), 1.13, 0.83 * Math.cos(a)); strip.rotation.y = a; strip.rotation.x = -0.07; g.add(strip);
  }
  // spout
  const spout = mk(new THREE.CylinderGeometry(0.09, 0.2, 0.55, 24, 1, true), frame);
  spout.position.set(-0.78, 1.96, 0); spout.rotation.z = 0.95; spout.scale.z = 0.78; g.add(spout);
  // handle
  const curve = new THREE.CatmullRomCurve3([V(0.58, 2.06, 0), V(0.98, 2.08, 0), V(1.2, 1.8, 0), V(1.23, 1.2, 0), V(1.1, 0.7, 0), V(0.84, 0.42, 0)]);
  const handle = mk(new THREE.TubeGeometry(curve, 48, 0.1, 14), black); handle.scale.z = 0.78; g.add(handle);
  const sw = mk(rbox(0.16, 0.09, 0.2, 0.03), new THREE.MeshPhysicalMaterial({ color: 0x2a2b2e, roughness: 0.4 })); sw.position.set(1.16, 0.62, 0); sw.rotation.z = 0.55; g.add(sw);
  const led = ledMat(0xff7a1a); const ledM = mk(rbox(0.3, 0.035, 0.03, 0.012), led, false); ledM.position.set(0.12, 0.09, 0.945); ledM.rotation.y = 0.12; g.add(ledM);
  // steam
  const tip = V(-0.78 - 0.275 * Math.sin(0.95), 1.96 + 0.275 * Math.cos(0.95), 0);
  const puffs: { s: THREE.Sprite; age: number; v: THREE.Vector3; life: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xaab4bf, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false; g.add(s);
    puffs.push({ s, age: 99, v: V(0, 0, 0), life: 1 });
  }
  let lvl = 0, boil = 0, acc = 0;
  return {
    id: 'kettle', group: g, cordExit: V(0, 0.08, -0.88), cordColour: 0xf0f0ee, hot: V(0, 2.45, 0.1), hotR: 0.55, tag: V(0, 0, 1.15), foot: [2.4, 2.0],
    update(active, dt) {
      lvl = ease(lvl, active ? 1 : 0, dt, 0.15);
      boil = active ? Math.min(1, boil + dt / 2.5) : Math.max(0, boil - dt / 1.5);
      led.emissiveIntensity = lvl * 3;
      winMat.emissiveIntensity = lvl * 0.55;
      sw.rotation.z = 0.55 - lvl * 0.25;
      acc += dt * boil * 11;
      for (const p of puffs) {
        if (p.age >= p.life && acc >= 1) {
          acc -= 1; p.age = 0; p.life = 1.4 + Math.random() * 0.8;
          p.s.position.copy(tip).add(V((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06));
          p.v.set(-0.25 - Math.random() * 0.2, 0.7 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15);
        }
        if (p.age < p.life) {
          p.age += dt;
          const k = p.age / p.life;
          p.s.visible = true;
          p.s.position.addScaledVector(p.v, dt);
          p.v.x *= 0.98; p.v.y *= 0.99;
          p.s.scale.setScalar(0.18 + k * 0.9);
          (p.s.material as THREE.SpriteMaterial).opacity = 0.75 * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k);
        } else p.s.visible = false;
      }
      if (acc > 3) acc = 3;
    },
  };
}

// ───────────── toaster ─────────────
export function createToaster(quality: QualityTier): ApplianceModel {
  const g = new THREE.Group();
  const enamel = new THREE.MeshPhysicalMaterial({ color: 0xe9dcc2, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  const body = mk(new RoundedBoxGeometry(2.6, 1.6, 1.45, 6, 0.3), enamel); body.position.y = 0.94; g.add(body);
  const plinth = mk(rbox(2.5, 0.16, 1.36, 0.06), M.steel()); plinth.position.y = 0.1; g.add(plinth);
  for (const x of [-1.05, 1.05]) for (const z of [-0.5, 0.5]) { const f = mk(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 16), M.rubber()); f.position.set(x, 0.02, z); g.add(f); }
  const hole = new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 0.9, emissive: 0xff4a10, emissiveIntensity: 0 });
  const bread = new THREE.MeshStandardMaterial({ map: toast(), roughness: 0.85 });
  const slices: THREE.Mesh[] = [];
  for (const z of [-0.2, 0.2]) {
    const r = mk(rbox(1.92, 0.03, 0.27, 0.012), chrome(), false); r.position.set(0, 1.742, z); g.add(r);
    const h = mk(rbox(1.8, 0.03, 0.15, 0.012), hole, false); h.position.set(0, 1.752, z); g.add(h);
    const s = mk(rbox(1.5, 1.15, 0.09, 0.09), bread); s.position.set(0, 1.58, z); g.add(s); slices.push(s);
  }
  // lever on the +x end, browning dial and LED on the front
  const slot = mk(rbox(0.03, 0.95, 0.1, 0.012), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }), false); slot.position.set(1.3, 0.98, 0); g.add(slot);
  const lever = mk(rbox(0.26, 0.12, 0.24, 0.045), chrome()); lever.position.set(1.42, 1.35, 0); g.add(lever);
  const dial = mk(new THREE.CylinderGeometry(0.15, 0.165, 0.1, 32).rotateX(Math.PI / 2), chrome()); dial.position.set(0.82, 0.78, 0.74); g.add(dial);
  const tick = mk(new THREE.BoxGeometry(0.02, 0.1, 0.01), new THREE.MeshStandardMaterial({ color: 0x222222 }), false); tick.position.set(0.82, 0.83, 0.795); g.add(tick);
  const btn = mk(rbox(0.22, 0.12, 0.05, 0.03), new THREE.MeshPhysicalMaterial({ color: 0xd9d4c8, roughness: 0.4 })); btn.position.set(0.82, 0.42, 0.73); g.add(btn);
  const led = ledMat(0xff3b1a); const ledM = mk(new THREE.SphereGeometry(0.03, 12, 8), led, false); ledM.position.set(0.82, 0.55, 0.735); g.add(ledM);
  // glow above the slots and a warm light
  const shimmer = glowSprite(0xff7a30); shimmer.position.set(0, 1.85, 0); shimmer.scale.set(2.4, 0.5, 1); g.add(shimmer);
  const light = quality === 'low' ? null : new THREE.PointLight(0xff7a30, 0, 5, 2);
  if (light) { light.position.set(0, 2.1, 0); g.add(light); }
  let heat = 0, lvl = 0;
  const col = new THREE.Color();
  return {
    id: 'toaster', group: g, cordExit: V(-1.1, 0.1, -0.68), cordColour: 0x1b1b1d, hot: V(0, 1.85, 0), hotR: 0.8, tag: V(0, 0, 0.95), foot: [2.9, 1.8],
    update(active, dt) {
      lvl = ease(lvl, active ? 1 : 0, dt, 0.12);
      heat = ease(heat, active ? 1 : 0, dt, active ? 1.2 : 2.2);
      blackbody(900 + heat * 500, col);
      hole.emissive.copy(col); hole.emissiveIntensity = heat * 3.2;
      (shimmer.material as THREE.SpriteMaterial).opacity = heat * 0.4;
      if (light) light.intensity = heat * 3.5;
      led.emissiveIntensity = lvl * 4;
      lever.position.y = 1.35 - lvl * 0.72;
      for (const s of slices) s.position.y = 1.58 - lvl * 0.36;
    },
  };
}


// ───────────── microwave ─────────────
export function createMicrowave(): ApplianceModel {
  const g = new THREE.Group();
  const W = 4.6, H = 2.6, D = 3.2, Y = 0.08 + H / 2, F = D / 2;
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xd6d8da, metalness: 0.9, roughness: 0.32, roughnessMap: (M.steel().roughnessMap) ?? null, clearcoat: 0.2 });
  const body = mk(new RoundedBoxGeometry(W, H, D, 3, 0.07), shell); body.position.y = Y; g.add(body);
  const glassBlack = new THREE.MeshPhysicalMaterial({ color: 0x08090a, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
  const door = mk(new RoundedBoxGeometry(3.45, 2.42, 0.08, 2, 0.035), glassBlack); door.position.set(-0.55, Y, F + 0.02); g.add(door);
  const panel = mk(new RoundedBoxGeometry(0.98, 2.42, 0.08, 2, 0.035), glassBlack); panel.position.set(1.75, Y, F + 0.02); g.add(panel);
  const [wc, wctx] = canvas(256, 160);
  drawMicrowaveWindow(wctx, 256, 160, false, 0);
  const wtex = new THREE.CanvasTexture(wc); wtex.colorSpace = THREE.SRGBColorSpace;
  const winMat = new THREE.MeshPhysicalMaterial({ map: wtex, emissive: 0xffffff, emissiveMap: wtex, emissiveIntensity: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  const win = mk(new THREE.PlaneGeometry(2.55, 1.55), winMat, false); win.position.set(-0.78, Y + 0.05, F + 0.062); g.add(win);
  const kp = mk(new THREE.PlaneGeometry(0.76, 1.52), new THREE.MeshStandardMaterial({ map: microwaveKeypad(), roughness: 0.15, transparent: false }), false);
  kp.position.set(1.75, Y - 0.32, F + 0.062); g.add(kp);
  const [dc, dctx] = canvas(192, 64);
  const dtex = new THREE.CanvasTexture(dc); dtex.colorSpace = THREE.SRGBColorSpace;
  const dispMat = new THREE.MeshStandardMaterial({ map: dtex, emissive: 0xffffff, emissiveMap: dtex, emissiveIntensity: 1, roughness: 0.2 });
  const disp = mk(new THREE.PlaneGeometry(0.76, 0.26), dispMat, false); disp.position.set(1.75, Y + 0.86, F + 0.062); g.add(disp);
  let lastDisp = '';
  const drawDisp = (s: string, bright: boolean) => {
    if (s + bright === lastDisp) return; lastDisp = s + bright;
    dctx.fillStyle = '#050607'; dctx.fillRect(0, 0, 192, 64);
    dctx.fillStyle = bright ? '#5ff2ff' : '#2a8a96'; dctx.font = '700 44px "SF Mono", Menlo, Consolas, monospace'; dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
    dctx.fillText(s, 96, 34); dtex.needsUpdate = true;
  };
  drawDisp('12:00', false);
  // door handle
  const bar = mk(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 16), chrome()); bar.position.set(0.95, Y, F + 0.2); g.add(bar);
  for (const s of [-1, 1]) { const st = mk(rbox(0.08, 0.08, 0.16, 0.02), chrome()); st.position.set(0.95, Y + s * 0.75, F + 0.12); g.add(st); }
  // side vents
  const vent = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.8 });
  for (let i = 0; i < 9; i++) { const v = mk(new THREE.BoxGeometry(0.02, 0.9, 0.05), vent, false); v.position.set(W / 2 + 0.001, Y + 0.3, -0.9 - i * 0.1); g.add(v); }
  for (const x of [-2, 2]) for (const z of [-1.3, 1.3]) { const f = mk(new THREE.CylinderGeometry(0.09, 0.1, 0.08, 16), M.rubber()); f.position.set(x, 0.04, z); g.add(f); }
  let lvl = 0, ang = 0, redraw = 0, secs = 90, dirty = false;
  return {
    id: 'microwave', group: g, cordExit: V(1.8, 0.35, -F), cordColour: 0x1b1b1d, hot: V(-0.75, 1.5, F + 0.2), hotR: 0.9, tag: V(-0.3, 0, 1.75), foot: [5, 3.6],
    update(active, dt) {
      lvl = ease(lvl, active ? 1 : 0, dt, 0.1);
      winMat.emissiveIntensity = lvl * 0.9;
      if (active) { ang += dt * 1.2; secs -= dt; if (secs < 1) secs = 90; }
      if (active || lvl > 0.02) {
        dirty = true; redraw -= dt;
        if (redraw <= 0) { redraw = 1 / 15; drawMicrowaveWindow(wctx, 256, 160, lvl > 0.3, ang); wtex.needsUpdate = true; }
      } else if (dirty) { dirty = false; drawMicrowaveWindow(wctx, 256, 160, false, ang); wtex.needsUpdate = true; }
      const s = Math.ceil(secs);
      drawDisp(active ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '12:00', active);
    },
  };
}

// ───────────── LED lamp ─────────────
export function createLamp(quality: QualityTier): ApplianceModel {
  const g = new THREE.Group();
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, metalness: 0.7, roughness: 0.42 });
  g.add(mk(lathe([[0.001, 0], [0.56, 0], [0.6, 0.04], [0.58, 0.1], [0.46, 0.15], [0.12, 0.17], [0.001, 0.17]], 48, 14), blackMetal));
  const stem = mk(new THREE.CylinderGeometry(0.035, 0.035, 2.25, 16), M.brass()); stem.position.y = 0.17 + 1.125; g.add(stem);
  const holder = mk(new THREE.CylinderGeometry(0.08, 0.09, 0.22, 20), blackMetal); holder.position.y = 2.36; g.add(holder);
  const btn = mk(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), M.brass()); btn.position.set(0.3, 0.17, 0.15); g.add(btn);
  const lin = linen();
  const shadeOut = new THREE.MeshStandardMaterial({ map: lin, color: 0xffffff, roughness: 0.95, emissive: 0xffc27a, emissiveMap: lin, emissiveIntensity: 0, side: THREE.FrontSide });
  const shadeIn = new THREE.MeshStandardMaterial({ color: 0xf4ead8, roughness: 1, emissive: 0xffd49a, emissiveIntensity: 0, side: THREE.BackSide });
  const shadeGeo = new THREE.CylinderGeometry(0.62, 0.84, 1.05, 64, 1, true);
  const so = mk(shadeGeo, shadeOut); so.position.y = 2.62; g.add(so);
  const si = mk(shadeGeo, shadeIn, false); si.position.y = 2.62; si.scale.setScalar(0.99); g.add(si);
  for (const [r, y] of [[0.62, 3.145], [0.84, 2.095]] as const) { const t = mk(new THREE.TorusGeometry(r, 0.012, 6, 64).rotateX(Math.PI / 2), M.brass(), false); t.position.y = y; g.add(t); }
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.3, emissive: 0xffe2b8, emissiveIntensity: 0 });
  const bulb = mk(new THREE.SphereGeometry(0.17, 24, 16), bulbMat, false); bulb.position.y = 2.6; g.add(bulb);
  const glow = glowSprite(0xffd8a0); glow.position.y = 2.5; glow.scale.setScalar(2.4); g.add(glow);
  const light = new THREE.PointLight(0xffd2a0, 0, 9, 2); light.position.set(0, 2.3, 0.1); g.add(light);
  const up = quality === 'low' ? null : new THREE.PointLight(0xffd2a0, 0, 5, 2);
  if (up) { up.position.set(0, 3.3, 0); g.add(up); }
  let lvl = 0;
  return {
    id: 'led-lamp', group: g, cordExit: V(0, 0.05, -0.56), cordColour: 0xf0f0ee, hot: V(0, 3.15, 0), hotR: 0.5, tag: V(0, 0, 0.75), foot: [1.4, 1.4],
    update(active, dt) {
      lvl = ease(lvl, active ? 1 : 0, dt, 0.08);
      shadeOut.emissiveIntensity = lvl * 0.42;
      shadeIn.emissiveIntensity = lvl * 0.8;
      bulbMat.emissiveIntensity = lvl * 4;
      (glow.material as THREE.SpriteMaterial).opacity = lvl * 0.35;
      light.intensity = lvl * 9;
      if (up) up.intensity = lvl * 3;
      btn.position.y = 0.17 - lvl * 0.015;
    },
  };
}

// ───────────── phone (the charger plug pack is built by the kitchen at the socket) ─────────────
export function createPhone(): ApplianceModel {
  const g = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 1, roughness: 0.32 });
  const body = mk(new RoundedBoxGeometry(0.74, 0.08, 1.5, 3, 0.035), alu); body.position.y = 0.045; g.add(body);
  const offC = phoneScreen(false), onC = phoneScreen(true);
  const offT = new THREE.CanvasTexture(offC), onT = new THREE.CanvasTexture(onC);
  offT.colorSpace = onT.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.MeshPhysicalMaterial({ map: offT, emissive: 0xffffff, emissiveMap: onT, emissiveIntensity: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  const screen = mk(new THREE.PlaneGeometry(0.7, 1.46).rotateX(-Math.PI / 2), scr, false); screen.position.y = 0.0865;
  screen.userData.dispose = () => { onT.dispose(); offT.dispose(); };
  g.add(screen);
  let lvl = 0, shown = false;
  return {
    id: 'phone-charger', group: g, cordExit: V(0, 0.045, 0.77), cordColour: 0xf2f2f0, hot: V(0, 0.18, 0), hotR: 0.35, tag: V(0, 0, 0.95), foot: [0.9, 1.7],
    update(active, dt) {
      lvl = ease(lvl, active ? 1 : 0, dt, 0.1);
      const want = lvl > 0.5;
      if (want !== shown) { shown = want; scr.map = want ? onT : offT; scr.needsUpdate = true; }
      scr.emissiveIntensity = lvl * 0.9;
    },
  };
}

/** the white plug pack that sits in the socket (or in the meter) */
export function createChargerPack(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf3f3f1, roughness: 0.35, clearcoat: 0.4 });
  const b = mk(new RoundedBoxGeometry(0.44, 0.5, 0.4, 3, 0.07), white); b.position.set(0, 0, 0.2); g.add(b);
  const port = mk(rbox(0.14, 0.05, 0.03, 0.02), new THREE.MeshStandardMaterial({ color: 0x222222 }), false); port.position.set(0, -0.25, 0.22); port.rotation.x = Math.PI / 2; g.add(port);
  return g;
}

// ───────────── TV ─────────────
export function createTv(): ApplianceModel {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.6, roughness: 0.45 });
  const plate = mk(new RoundedBoxGeometry(1.8, 0.06, 1.0, 2, 0.025), dark); plate.position.y = 0.03; g.add(plate);
  const neck = mk(new RoundedBoxGeometry(0.34, 0.52, 0.12, 2, 0.04), dark); neck.position.set(0, 0.3, -0.12); g.add(neck);
  const bezel = new THREE.MeshPhysicalMaterial({ color: 0x0e0f11, roughness: 0.4, clearcoat: 0.3 });
  const panel = mk(new RoundedBoxGeometry(3.9, 2.3, 0.1, 2, 0.03), bezel); panel.position.set(0, 1.68, 0); g.add(panel);
  const back = mk(new RoundedBoxGeometry(2.6, 1.5, 0.3, 3, 0.1), dark); back.position.set(0, 1.6, -0.18); g.add(back);
  const pic = tvPicture();
  const scr = new THREE.MeshPhysicalMaterial({ color: 0x050608, map: pic, emissive: 0xffffff, emissiveMap: pic, emissiveIntensity: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const screen = mk(new THREE.PlaneGeometry(3.8, 2.16), scr, false); screen.position.set(0, 1.7, 0.052); g.add(screen);
  const led = ledMat(0xff3030); const lm = mk(new THREE.SphereGeometry(0.018, 8, 6), led, false); lm.position.set(1.65, 0.56, 0.052); g.add(lm);
  let lvl = 0;
  const black = new THREE.Color(0x050608), white = new THREE.Color(0x222222);
  return {
    id: 'led-tv', group: g, cordExit: V(-0.8, 0.9, -0.34), cordColour: 0x1b1b1d, hot: V(0, 1.75, 0.15), hotR: 1.4, tag: V(0, 0, 0.75), foot: [4.0, 1.2],
    update(active, dt) {
      lvl = ease(lvl, active ? 1 : 0, dt, 0.25);
      scr.color.copy(black).lerp(white, lvl);
      scr.emissiveIntensity = lvl * 0.95;
      led.emissiveIntensity = active ? 0 : 1.2;
      led.emissive.setHex(active ? 0xffffff : 0xff3030);
    },
  };
}
