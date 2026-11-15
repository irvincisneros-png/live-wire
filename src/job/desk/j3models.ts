// Job 3 models: the power board, the wall points and the seven appliances. 1 unit = 10 cm. All materials are PBR.
import * as THREE from 'three';
import * as M from '../../kit/materials';
import { labelTexture } from '../../kit/materials';
import { glowTexture } from '../../kit/textures';
import { mesh, rbox } from '../../kit/parts/common';

export interface ApplianceModel {
  group: THREE.Group;
  /** where the cord leaves the appliance (local space) */
  plug: THREE.Vector3;
  /** where the rating label hangs (local space) */
  labelAt: THREE.Vector3;
  setOn(on: boolean): void;
  update(dt: number, t: number): void;
  /** footprint radius for layout */
  size: number;
}

const std = (color: number, roughness = 0.5, metalness = 0, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra });
const glowMat = (color: number) => new THREE.MeshStandardMaterial({ color: 0x201008, emissive: color, emissiveIntensity: 0, roughness: 0.5 });

function glowSprite(color: number, scale: number): THREE.Sprite {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sp.scale.set(scale, scale, 1);
  sp.userData.noDim = true;
  return sp;
}

/** drives emissive intensity and a glow sprite toward the on/off state */
function glower(mats: THREE.MeshStandardMaterial[], on: { v: boolean }, peak: number, sprite?: THREE.Sprite, spritePeak = 0.8) {
  let k = 0;
  return (dt: number, t: number) => {
    const target = on.v ? 1 : 0;
    k += (target - k) * Math.min(1, dt * 7);
    const flicker = on.v ? 1 + Math.sin(t * 9) * 0.02 : 1;
    for (const m of mats) m.emissiveIntensity = peak * k * flicker;
    if (sprite) (sprite.material as THREE.SpriteMaterial).opacity = spritePeak * k;
  };
}

function finish(group: THREE.Group): void {
  group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
}

// ───────────── the appliances ─────────────

export function buildHeater(): ApplianceModel {
  const g = new THREE.Group();
  const on = { v: false };
  const body = std(0xe6dfcd, 0.46);
  const dark = std(0x1c1a19, 0.6);
  const bar = glowMat(0xff5a14);
  const hb = mesh(rbox(2.2, 2.5, 0.85, 0.14), body); hb.position.set(0, 1.55, 0); g.add(hb);
  const face = mesh(rbox(1.84, 2.05, 0.08, 0.04), dark); face.position.set(0, 1.55, 0.4); g.add(face);
  // reflector dish behind the elements
  const dish = mesh(new THREE.CylinderGeometry(0.72, 0.9, 0.08, 28, 1, true).rotateX(Math.PI / 2), M.nickel()); dish.scale.set(1, 1.25, 1); dish.position.set(0, 1.55, 0.44); g.add(dish);
  for (const dy of [-0.55, 0, 0.55]) {
    const e = mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.55, 12).rotateZ(Math.PI / 2), bar); e.position.set(0, 1.55 + dy, 0.5); g.add(e);
  }
  for (let i = 0; i < 11; i++) {
    const w = mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.05, 6), M.darkSteel(), false); w.position.set(-0.9 + i * 0.18, 1.55, 0.6); g.add(w);
  }
  for (const y of [0.52, 2.58]) { const rail = mesh(rbox(1.95, 0.06, 0.08, 0.02), M.darkSteel(), false); rail.position.set(0, y, 0.62); g.add(rail); }
  for (const x of [-0.8, 0.8]) { const foot = mesh(rbox(0.3, 0.18, 0.7, 0.06), dark); foot.position.set(x, 0.09, 0); g.add(foot); }
  const knob = mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.1, 20), dark); knob.position.set(0.7, 2.83, 0); g.add(knob);
  const tick = mesh(rbox(0.03, 0.02, 0.12, 0.005), M.nickel(), false); tick.position.set(0.7, 2.89, 0.04); g.add(tick);
  const sp = glowSprite(0xff6a20, 3.4); sp.position.set(0, 1.55, 0.95); g.add(sp);
  finish(g);
  const upd = glower([bar], on, 3.2, sp, 0.55);
  return { group: g, plug: new THREE.Vector3(0.3, 0.14, -0.4), labelAt: new THREE.Vector3(0, 3.1, 0), size: 1.15, setOn: (v) => { on.v = v; }, update: upd };
}

export function buildKettle(): ApplianceModel {
  const g = new THREE.Group();
  const on = { v: false };
  const steelM = M.steel();
  const led = glowMat(0x4da3ff);
  const base = mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.12, 36), M.phenolic()); base.position.y = 0.06; g.add(base);
  const ring = mesh(new THREE.TorusGeometry(0.665, 0.018, 8, 40).rotateX(Math.PI / 2), led); ring.position.y = 0.13; g.add(ring);
  const prof = [[0.0, 0.0], [0.56, 0.0], [0.6, 0.06], [0.64, 0.4], [0.6, 1.0], [0.5, 1.45], [0.4, 1.58], [0.32, 1.62]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = mesh(new THREE.LatheGeometry(prof, 40), steelM); body.position.y = 0.12; g.add(body);
  const lid = mesh(new THREE.LatheGeometry([[0.0, 0.16], [0.14, 0.16], [0.3, 0.12], [0.34, 0.0], [0.0, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)), 28), M.phenolic()); lid.position.y = 1.7; g.add(lid);
  const knob = mesh(new THREE.SphereGeometry(0.07, 14, 10), M.phenolic()); knob.position.y = 1.9; g.add(knob);
  const spout = mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.42, 20, 1), steelM); spout.rotation.z = 0.95; spout.position.set(-0.62, 1.36, 0); g.add(spout);
  const hCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.52, 1.38, 0), new THREE.Vector3(0.92, 1.42, 0), new THREE.Vector3(1.0, 0.8, 0), new THREE.Vector3(0.64, 0.36, 0)]);
  const handle = mesh(new THREE.TubeGeometry(hCurve, 24, 0.085, 10), M.phenolic()); g.add(handle);
  const gauge = mesh(rbox(0.1, 0.8, 0.14, 0.03), std(0x8fb4d6, 0.1, 0, { transparent: true, opacity: 0.55 })); gauge.position.set(0.58, 0.8, 0.02); gauge.rotation.z = -0.07; g.add(gauge);
  const sw = mesh(rbox(0.18, 0.1, 0.12, 0.03), M.phenolic()); sw.position.set(0.76, 1.55, 0); g.add(sw);
  const sp = glowSprite(0x6ab4ff, 1.8); sp.position.set(0, 0.2, 0.2); g.add(sp);
  finish(g);
  const upd = glower([led], on, 3.0, sp, 0.4);
  return { group: g, plug: new THREE.Vector3(0.1, 0.12, -0.68), labelAt: new THREE.Vector3(0, 2.15, 0), size: 0.95, setOn: (v) => { on.v = v; }, update: upd };
}

export function buildToaster(): ApplianceModel {
  const g = new THREE.Group();
  const on = { v: false };
  const chrome = std(0xb9bcc2, 0.34, 1);
  const black = M.phenolic();
  const elem = glowMat(0xff6a1a);
  const body = mesh(rbox(1.75, 1.05, 1.1, 0.26, 4), chrome); body.position.y = 0.6; g.add(body);
  for (const sx of [-1, 1]) { const cap = mesh(rbox(0.14, 0.98, 1.02, 0.05), black); cap.position.set(sx * 0.9, 0.6, 0); g.add(cap); }
  const top = mesh(rbox(1.5, 0.08, 0.92, 0.04), black); top.position.y = 1.13; g.add(top);
  for (const z of [-0.2, 0.2]) {
    const slot = mesh(rbox(1.18, 0.03, 0.15, 0.04), std(0x050404, 0.9)); slot.position.set(-0.04, 1.18, z); g.add(slot);
    const hot = mesh(rbox(1.1, 0.02, 0.045, 0.01), elem); hot.position.set(-0.04, 1.2, z); g.add(hot);
  }
  const lever = mesh(rbox(0.1, 0.12, 0.3, 0.03), black); lever.position.set(0.86, 0.8, 0.0); g.add(lever);
  const track = mesh(rbox(0.04, 0.55, 0.1, 0.015), M.darkSteel(), false); track.position.set(0.92, 0.68, 0); g.add(track);
  const dial = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 18).rotateZ(Math.PI / 2), black); dial.position.set(0.9, 0.4, 0.28); g.add(dial);
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.38, 0.38]) { const f = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), M.rubber()); f.position.set(sx, 0.05, sz); g.add(f); }
  const sp = glowSprite(0xff7a28, 1.8); sp.position.set(0, 1.25, 0); g.add(sp);
  finish(g);
  const upd = glower([elem], on, 3.0, sp, 0.55);
  return { group: g, plug: new THREE.Vector3(-0.2, 0.12, -0.6), labelAt: new THREE.Vector3(0, 1.7, 0), size: 1.0, setOn: (v) => { on.v = v; }, update: upd };
}

export function buildIron(): ApplianceModel {
  const g = new THREE.Group();
  const on = { v: false };
  const led = glowMat(0xff3322);
  const outline = (len: number, wid: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(-len / 2, -wid * 0.42);
    sh.quadraticCurveTo(-len / 2 - 0.02, -wid / 2, -len / 2 + 0.2, -wid / 2);
    sh.lineTo(len * 0.12, -wid / 2);
    sh.quadraticCurveTo(len / 2, -wid * 0.28, len / 2, 0);
    sh.quadraticCurveTo(len / 2, wid * 0.28, len * 0.12, wid / 2);
    sh.lineTo(-len / 2 + 0.2, wid / 2);
    sh.quadraticCurveTo(-len / 2 - 0.02, wid / 2, -len / 2, wid * 0.42);
    sh.closePath();
    return sh;
  };
  const flat = (shape: THREE.Shape, depth: number, bevel: number) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  };
  const sole = mesh(flat(outline(2.1, 1.0), 0.06, 0.03), M.steel()); sole.position.y = 0.0; g.add(sole);
  const shell = mesh(flat(outline(1.9, 0.86), 0.5, 0.1), std(0x2d5fa8, 0.32, 0, { clearcoat: 0.6 })); shell.position.y = 0.1; g.add(shell);
  const cap = mesh(flat(outline(1.4, 0.62), 0.12, 0.07), std(0xe8ebef, 0.35)); cap.position.set(-0.1, 0.72, 0); g.add(cap);
  const hc = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.78, 0.8, 0), new THREE.Vector3(-0.5, 1.45, 0), new THREE.Vector3(0.3, 1.5, 0), new THREE.Vector3(0.52, 0.8, 0)]);
  const handle = mesh(new THREE.TubeGeometry(hc, 28, 0.1, 10), std(0x1d1f23, 0.4)); g.add(handle);
  const dial = mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 22), std(0xe8ebef, 0.35)); dial.position.set(0.7, 0.86, 0); g.add(dial);
  const light = mesh(new THREE.SphereGeometry(0.06, 12, 10), led); light.position.set(0.36, 0.9, 0.2); g.add(light);
  const sp = glowSprite(0xff4030, 0.9); sp.position.copy(light.position); g.add(sp);
  const steamer = mesh(rbox(0.5, 0.06, 0.26, 0.02), M.darkSteel(), false); steamer.position.set(-0.3, 0.72, 0.0); g.add(steamer);
  finish(g);
  const upd = glower([led], on, 3.4, sp, 0.9);
  return { group: g, plug: new THREE.Vector3(-1.0, 0.45, 0), labelAt: new THREE.Vector3(0, 1.9, 0), size: 1.1, setOn: (v) => { on.v = v; }, update: upd };
}

export function buildSandwichPress(): ApplianceModel {
  const g = new THREE.Group();
  const on = { v: false };
  const led = glowMat(0x4cf08a);
  const heat = glowMat(0xff7a22);
  const dark = M.phenolic();
  const base = mesh(rbox(2.1, 0.3, 1.75, 0.12, 3), dark); base.position.y = 0.2; g.add(base);
  const platen = mesh(rbox(1.75, 0.05, 1.4, 0.03), M.darkSteel()); platen.position.y = 0.37; g.add(platen);
  for (let i = 0; i < 9; i++) { const r = mesh(rbox(0.07, 0.04, 1.3, 0.01), heat, false); r.position.set(-0.76 + i * 0.19, 0.42, 0); g.add(r); }
  const hinge = new THREE.Group(); hinge.position.set(0, 0.4, -0.85); hinge.rotation.x = -0.5; g.add(hinge);
  const lid = mesh(rbox(2.1, 0.3, 1.75, 0.12, 3), dark); lid.position.set(0, 0.17, 0.87); hinge.add(lid);
  const lidTop = mesh(rbox(1.8, 0.05, 1.45, 0.03), M.steel()); lidTop.position.set(0, 0.34, 0.87); hinge.add(lidTop);
  const grip = mesh(rbox(1.0, 0.16, 0.2, 0.06), dark); grip.position.set(0, 0.2, 1.8); hinge.add(grip);
  const dot = mesh(new THREE.SphereGeometry(0.05, 12, 10), led); dot.position.set(0.8, 0.3, 0.95); g.add(dot);
  const sp = glowSprite(0xff7a22, 2.4); sp.position.set(0, 0.6, 0.1); g.add(sp);
  finish(g);
  const upd = glower([led, heat], on, 2.6, sp, 0.4);
  return { group: g, plug: new THREE.Vector3(0, 0.2, -0.85), labelAt: new THREE.Vector3(0, 1.1, 0.2), size: 1.2, setOn: (v) => { on.v = v; }, update: upd };
}

export function buildCharger(): ApplianceModel {
  const g = new THREE.Group();
  const on = { v: false };
  const led = glowMat(0x4cf08a);
  const white = std(0xf4f4f1, 0.28, 0, { clearcoat: 0.5 });
  const brick = mesh(rbox(0.56, 0.56, 0.38, 0.1, 3), white); brick.position.y = 0.3; g.add(brick);
  const usb = mesh(rbox(0.22, 0.1, 0.02, 0.01), M.darkSteel(), false); usb.position.set(0, 0.2, 0.2); g.add(usb);
  const dot = mesh(new THREE.SphereGeometry(0.025, 8, 8), led); dot.position.set(0.16, 0.5, 0.2); g.add(dot);
  // the phone lying beside it
  const phone = mesh(rbox(0.72, 0.07, 1.4, 0.07, 3), std(0x15171b, 0.2, 0.3)); phone.position.set(0.8, 0.045, 0.45); g.add(phone);
  const screen = glowMat(0x5aa8ff); const sc = mesh(rbox(0.62, 0.01, 1.28, 0.05), screen, false); sc.position.set(0.8, 0.085, 0.45); g.add(sc);
  const cable = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.08, 0.2, 0.2), new THREE.Vector3(0.2, 0.05, 0.5), new THREE.Vector3(0.55, 0.045, 0.55)]), 14, 0.022, 6), std(0xf0f0ee, 0.5), false); g.add(cable);
  finish(g);
  const upd = glower([led, screen], on, 2.2);
  return { group: g, plug: new THREE.Vector3(0, 0.3, -0.2), labelAt: new THREE.Vector3(0.35, 0.9, 0.3), size: 0.8, setOn: (v) => { on.v = v; }, update: upd };
}

export function buildLamp(): ApplianceModel {
  const g = new THREE.Group();
  const on = { v: false };
  const shadeIn = glowMat(0xffd89a);
  const dark = std(0x23262b, 0.35, 0.6);
  const base = mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.1, 30), dark); base.position.y = 0.05; g.add(base);
  const lower = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35, 10), M.steel()); lower.position.set(0, 0.75, 0); lower.rotation.z = 0.12; g.add(lower);
  const joint = mesh(new THREE.SphereGeometry(0.06, 12, 10), dark); joint.position.set(-0.08, 1.4, 0); g.add(joint);
  const upper = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 10), M.steel()); upper.position.set(0.22, 1.85, 0); upper.rotation.z = -1.0; g.add(upper);
  const shade = new THREE.Group(); shade.position.set(0.62, 2.25, 0); shade.rotation.z = -0.4; g.add(shade);
  const cone = mesh(new THREE.CylinderGeometry(0.2, 0.55, 0.62, 30, 1, true), std(0xe0b04a, 0.35, 0.2, { side: THREE.DoubleSide })); shade.add(cone);
  const inner = mesh(new THREE.CylinderGeometry(0.19, 0.53, 0.6, 30, 1, true), shadeIn); (inner.material as THREE.MeshStandardMaterial).side = THREE.BackSide; shade.add(inner);
  const bulb = mesh(new THREE.SphereGeometry(0.15, 16, 12), shadeIn); bulb.position.y = -0.12; shade.add(bulb);
  const sp = glowSprite(0xffcf80, 2.4); sp.position.set(0, -0.3, 0); shade.add(sp);
  finish(g);
  const upd = glower([shadeIn], on, 3.2, sp, 0.85);
  return { group: g, plug: new THREE.Vector3(-0.2, 0.1, -0.35), labelAt: new THREE.Vector3(0.4, 2.9, 0), size: 0.85, setOn: (v) => { on.v = v; }, update: upd };
}

export const APPLIANCE_BUILDERS: Record<string, () => ApplianceModel> = {
  heater: buildHeater, kettle: buildKettle, toaster: buildToaster, iron: buildIron, 'sandwich-press': buildSandwichPress,
  'phone-charger': buildCharger, lamp: buildLamp,
};

// ───────────── the power board ─────────────

export interface PowerBoardModel {
  group: THREE.Group;
  /** world-space-ish position (board local) of each socket, in order */
  sockets: THREE.Vector3[];
  /** socket plane rotation x */
  tilt: number;
  setTripped(t: boolean, k?: number): void;
  /** local anchor for the "10 A MAX" label */
  labelAt: THREE.Vector3;
  cordExit: THREE.Vector3;
  update(dt: number): void;
}

export const BOARD_SOCKETS = 7;

export function buildPowerBoard(): PowerBoardModel {
  const g = new THREE.Group();
  const L = 7.4, D = 1.7, Hb = 0.95, Hf = 0.3;
  const phi = Math.atan2(Hb - Hf, D);
  // side profile wedge, extruded along x
  const sh = new THREE.Shape();
  sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(D / 2, Hf); sh.lineTo(-D / 2, Hb); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: L - 0.4, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 3 });
  geo.rotateY(-Math.PI / 2); geo.translate((L - 0.4) / 2, 0, 0);
  const shell = mesh(geo, std(0xf0eee6, 0.42, 0, { clearcoat: 0.3 }));
  g.add(shell);
  // top face frame (a faceplate recess)
  const slopeMid = new THREE.Vector3(0, (Hb + Hf) / 2 + 0.07, 0);
  const plate = new THREE.Group(); plate.position.copy(slopeMid); plate.rotation.x = phi; g.add(plate);
  const facePlate = mesh(rbox(L - 0.9, 0.05, 1.12, 0.05), std(0xdedbd0, 0.5)); plate.add(facePlate);
  const sockets: THREE.Vector3[] = [];
  const socketMat = std(0xc9c6bb, 0.45);
  const slotMat = std(0x0b0b0c, 0.9);
  for (let i = 0; i < BOARD_SOCKETS; i++) {
    const x = -3.05 + i * 0.84;
    const s = new THREE.Group(); s.position.set(x, 0.035, 0.0); plate.add(s);
    const ring = mesh(rbox(0.7, 0.05, 0.86, 0.08, 3), socketMat); s.add(ring);
    for (const sx of [-1, 1]) { const sl = mesh(rbox(0.07, 0.03, 0.2, 0.01), slotMat, false); sl.position.set(sx * 0.17, 0.03, 0.18); sl.rotation.y = -sx * 0.5; s.add(sl); }
    const eg = mesh(rbox(0.07, 0.03, 0.2, 0.01), slotMat, false); eg.position.set(0, 0.03, -0.17); s.add(eg);
    const world = new THREE.Vector3(x, 0.06, 0).applyEuler(new THREE.Euler(phi, 0, 0)).add(slopeMid);
    sockets.push(world);
  }
  // overload reset button + label + status light at the right end
  const bx = 3.05;
  const bezel = mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.08, 28), std(0xbfbcb1, 0.4)); bezel.position.set(bx, 0.07, -0.28); plate.add(bezel);
  const buttonMat = std(0xd3281e, 0.28, 0, { clearcoat: 0.8 });
  const button = mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.22, 28), buttonMat); button.position.set(bx, 0.14, -0.28); plate.add(button);
  const led = new THREE.MeshStandardMaterial({ color: 0x103018, emissive: 0x2aff6a, emissiveIntensity: 1.6, roughness: 0.4 });
  const lamp = mesh(new THREE.SphereGeometry(0.06, 12, 10), led, false); lamp.position.set(bx, 0.09, 0.2); plate.add(lamp);
  const tex = labelTexture(['10 A MAX'], { width: 256, height: 96, bg: '#f4f1e8', fg: '#a1180f', border: '#a1180f', size: 46 });
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.29), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  lab.rotation.x = -Math.PI / 2; lab.position.set(bx, 0.065, 0.4); plate.add(lab);
  // cord to the wall, leaving the back
  for (const sx of [-1.6, 1.6]) { const foot = mesh(rbox(0.5, 0.08, 0.5, 0.03), M.rubber()); foot.position.set(sx, -0.02, 0.5); g.add(foot); }
  finish(g);
  const base = button.position.y;
  let trippedK = 0, target = 0;
  return {
    group: g, sockets, tilt: phi,
    labelAt: new THREE.Vector3(bx, 1.35, -0.3),
    cordExit: new THREE.Vector3(-L / 2 + 0.3, 0.45, -D / 2 + 0.1),
    setTripped(t, k) { target = t ? 1 : 0; if (k !== undefined) trippedK = k; },
    update(dt) {
      trippedK += (target - trippedK) * Math.min(1, dt * 9);
      // tripped: the button pops up and the light goes red
      button.position.y = base + trippedK * 0.12;
      led.color.setHex(trippedK > 0.5 ? 0x300808 : 0x103018);
      led.emissive.setHex(trippedK > 0.5 ? 0xff2a1a : 0x2aff6a);
      led.emissiveIntensity = trippedK > 0.5 ? 2.2 : 1.6;
    },
  };
}

// ───────────── wall, bench, wall points ─────────────

export interface WallPoint { group: THREE.Group; socket: THREE.Vector3; setTripped(t: boolean): void }

export function buildWallPoint(name: string): WallPoint {
  const g = new THREE.Group();
  const plate = mesh(rbox(1.1, 1.1, 0.14, 0.12, 3), std(0xf2f0ea, 0.38)); g.add(plate);
  const rec = mesh(rbox(0.82, 0.82, 0.04, 0.1, 3), std(0xdcd9ce, 0.5)); rec.position.z = 0.07; g.add(rec);
  const slotMat = std(0x0b0b0c, 0.9);
  for (const sx of [-1, 1]) { const sl = mesh(rbox(0.07, 0.2, 0.03, 0.01), slotMat, false); sl.position.set(sx * 0.17, 0.12, 0.1); sl.rotation.z = -sx * 0.5; g.add(sl); }
  const eg = mesh(rbox(0.07, 0.2, 0.03, 0.01), slotMat, false); eg.position.set(0, -0.14, 0.1); g.add(eg);
  const sw = mesh(rbox(0.16, 0.26, 0.08, 0.04), std(0xe9e6dc, 0.4)); sw.position.set(0.0, -0.36, 0.1); sw.visible = false; g.add(sw);
  const ok = new THREE.MeshStandardMaterial({ color: 0x103018, emissive: 0x2aff6a, emissiveIntensity: 1.4, roughness: 0.4 });
  const led = mesh(new THREE.SphereGeometry(0.05, 10, 8), ok, false); led.position.set(0.38, 0.38, 0.1); g.add(led);
  const tex = labelTexture([name, '16 A breaker'], { width: 320, height: 160, bg: '#f4f1e8', fg: '#1c1e26', border: '#555', size: 46 });
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  lab.position.set(0, -1.1, 0.05); g.add(lab);
  finish(g);
  return {
    group: g, socket: new THREE.Vector3(0, -0.05, 0.14),
    setTripped(t) { ok.color.setHex(t ? 0x300808 : 0x103018); ok.emissive.setHex(t ? 0xff2a1a : 0x2aff6a); },
  };
}

/** a rubber-jacketed cord as a tube. Rebuild by calling again with a new curve (dispose the old geometry yourself). */
export function cordMesh(curve: THREE.Curve<THREE.Vector3>, mat: THREE.Material, radius = 0.045): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, radius, 6, false), mat);
  m.castShadow = true;
  return m;
}

/** a plug body lying on the cord end */
export function plugBody(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(rbox(0.36, 0.3, 0.5, 0.08, 3), std(0x1b1c1f, 0.5)); g.add(body);
  for (const sx of [-1, 1]) { const pin = mesh(new THREE.BoxGeometry(0.04, 0.05, 0.16), M.brass(), false); pin.position.set(sx * 0.09, -0.02, 0.28); pin.rotation.y = -sx * 0.5; g.add(pin); }
  return g;
}
