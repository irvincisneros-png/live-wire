// Job 4 models: ten household appliances for the audit room. 1 unit = 1 metre. PBR materials with bevelled edges.
import * as THREE from 'three';
import * as M from '../../kit/materials';
import { glowTexture } from '../../kit/textures';
import { mesh, rbox } from '../../kit/parts/common';
import { buildHeater } from './j3models';

export interface AuditModel {
  id: string;
  group: THREE.Group;
  /** where packets arrive (world offset from the group origin) */
  top: THREE.Vector3;
  /** label anchor */
  labelAt: THREE.Vector3;
  /** half extents on the floor for the highlight ring */
  radius: number;
  height: number;
  update(dt: number, t: number): void;
}

const phys = (color: number, roughness = 0.5, metalness = 0, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra });
const emissive = (color: number, k = 1.5) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: k, roughness: 0.5 });
const dark = () => phys(0x15171a, 0.35, 0.1, { clearcoat: 0.6 });

function shadowed(g: THREE.Group): THREE.Group {
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
const make = (id: string, g: THREE.Group, o: Omit<AuditModel, 'id' | 'group' | 'update'> & { update?: AuditModel['update'] }): AuditModel =>
  ({ id, group: shadowed(g), update: o.update ?? (() => {}), top: o.top, labelAt: o.labelAt, radius: o.radius, height: o.height });

function glowSprite(color: number, size: number, opacity: number): THREE.Sprite {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sp.scale.set(size, size, 1); sp.userData.noDim = true;
  return sp;
}

function fridge(id: string, o: { w: number; h: number; d: number; body: number; metal: boolean; old: boolean; twoDoors: boolean }): AuditModel {
  const g = new THREE.Group();
  const bodyM = o.metal ? M.steel() : phys(o.body, 0.38, 0, { clearcoat: 0.4 });
  const body = mesh(rbox(o.w, o.h, o.d, o.old ? 0.1 : 0.04, 3), bodyM); body.position.y = o.h / 2 + 0.03; g.add(body);
  const plinth = mesh(rbox(o.w * 0.96, 0.06, o.d * 0.9, 0.02), dark()); plinth.position.y = 0.03; g.add(plinth);
  const seam = o.twoDoors ? 0.64 : 0.78;
  const sy = 0.03 + o.h * seam;
  const gap = mesh(rbox(o.w * 1.005, 0.012, 0.01, 0.003), dark(), false); gap.position.set(0, sy, o.d / 2 + 0.002); g.add(gap);
  const handleM = o.old ? M.nickel() : M.darkSteel();
  if (o.twoDoors) {
    const h1 = mesh(rbox(0.035, o.h * 0.26, 0.05, 0.015), handleM); h1.position.set(o.w / 2 - 0.09, sy - o.h * 0.2, o.d / 2 + 0.04); g.add(h1);
    const h2 = mesh(rbox(0.035, o.h * 0.14, 0.05, 0.015), handleM); h2.position.set(o.w / 2 - 0.09, sy + o.h * 0.1, o.d / 2 + 0.04); g.add(h2);
  } else {
    const h1 = mesh(rbox(0.04, o.h * 0.5, 0.06, 0.02), handleM); h1.position.set(o.w / 2 - 0.08, o.h * 0.5, o.d / 2 + 0.045); g.add(h1);
  }
  if (o.old) {
    // dated styling: chrome badge strip, a dent-coloured lower band
    const strip = mesh(rbox(o.w * 0.8, 0.04, 0.012, 0.005), M.nickel(), false); strip.position.set(0, o.h * 0.9, o.d / 2 + 0.004); g.add(strip);
    const band = mesh(rbox(o.w * 1.004, o.h * 0.1, o.d * 1.004, 0.03), phys(0xb59f78, 0.7), false); band.position.y = o.h * 0.07; g.add(band);
  } else {
    const disp = mesh(rbox(0.12, 0.05, 0.01, 0.005), emissive(0x7fd2ff, 1.4), false); disp.position.set(0, sy + o.h * 0.22, o.d / 2 + 0.006); g.add(disp);
  }
  return make(id, g, { top: new THREE.Vector3(0, o.h + 0.1, 0), labelAt: new THREE.Vector3(0, o.h + 0.25, 0), radius: Math.max(o.w, o.d) * 0.75, height: o.h });
}

function laundry(id: string, o: { dryer: boolean }): AuditModel {
  const g = new THREE.Group();
  const w = 0.6, h = 0.85, d = 0.62;
  const white = phys(0xf2f2ef, 0.3, 0, { clearcoat: 0.6 });
  const body = mesh(rbox(w, h, d, 0.04, 3), white); body.position.y = h / 2 + 0.02; g.add(body);
  const panel = mesh(rbox(w * 0.96, 0.12, 0.02, 0.01), phys(0xdfe2e6, 0.4), false); panel.position.set(0, h - 0.07, d / 2 + 0.002); g.add(panel);
  const disp = mesh(rbox(0.1, 0.04, 0.01, 0.004), emissive(o.dryer ? 0xffa14a : 0x6fd0ff, 1.5), false); disp.position.set(0.17, h - 0.07, d / 2 + 0.012); g.add(disp);
  const knob = mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.03, 20).rotateX(Math.PI / 2), M.darkSteel()); knob.position.set(-0.17, h - 0.07, d / 2 + 0.02); g.add(knob);
  const cy = h * 0.46;
  const ring = mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 36), M.nickel()); ring.position.set(0, cy, d / 2 + 0.01); g.add(ring);
  const glassM = phys(0x1c2a38, 0.05, 0, { transparent: true, opacity: 0.85, clearcoat: 1 });
  const glass = mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.03, 32).rotateX(Math.PI / 2), glassM, false); glass.position.set(0, cy, d / 2 + 0.002); g.add(glass);
  const drum = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 28).rotateX(Math.PI / 2), M.steel(), false); drum.position.set(0, cy, d / 2 - 0.05); g.add(drum);
  const base = mesh(rbox(w * 0.92, 0.03, d * 0.9, 0.01), dark()); base.position.y = 0.015; g.add(base);
  return make(id, g, { top: new THREE.Vector3(0, h + 0.1, 0), labelAt: new THREE.Vector3(0, h + 0.2, 0), radius: 0.5, height: h });
}

function hotWater(): AuditModel {
  const g = new THREE.Group();
  const r = 0.27, h = 1.5;
  const tank = mesh(new THREE.CylinderGeometry(r, r, h, 40), phys(0xf0efe9, 0.32, 0, { clearcoat: 0.5 })); tank.position.y = h / 2 + 0.12; g.add(tank);
  for (const y of [0.12, h + 0.12]) { const cap = mesh(new THREE.CylinderGeometry(r * 1.02, r * 0.98, 0.04, 40), phys(0xb4b8bc, 0.4, 0.6)); cap.position.y = y; g.add(cap); }
  const dome = mesh(new THREE.SphereGeometry(r * 0.99, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.28, 1), phys(0xf0efe9, 0.32, 0, { clearcoat: 0.5 })); dome.position.y = h + 0.14; g.add(dome);
  const stand = mesh(rbox(0.7, 0.12, 0.7, 0.02), M.darkSteel()); stand.position.y = 0.06; g.add(stand);
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) { const leg = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), M.darkSteel(), false); leg.position.set(x, 0.06, z); g.add(leg); }
  const box = mesh(rbox(0.2, 0.26, 0.09, 0.025), phys(0xd5d8dc, 0.45)); box.position.set(0, 0.95, r + 0.03); g.add(box);
  const led = mesh(new THREE.SphereGeometry(0.018, 10, 8), emissive(0xff5a3a, 2), false); led.position.set(-0.05, 1.02, r + 0.08); g.add(led);
  for (const [x, c] of [[-0.09, 0xe08a5a], [0.09, 0x4a90d8]] as [number, number][]) {
    const pipe = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.4, 12), c === 0xe08a5a ? M.copper() : phys(c, 0.3, 0.8)); pipe.position.set(x, h + 0.34, 0); g.add(pipe);
  }
  const lab = mesh(rbox(0.14, 0.2, 0.01, 0.004), phys(0xf6d54a, 0.6), false); lab.position.set(0.1, 0.55, r + 0.004); lab.rotation.y = 0.3; g.add(lab);
  return make('hot-water', g, { top: new THREE.Vector3(0, h + 0.5, 0), labelAt: new THREE.Vector3(0, h + 0.65, 0), radius: 0.55, height: h + 0.5 });
}

function airCon(): AuditModel {
  const g = new THREE.Group();
  const w = 1.05, h = 0.3, d = 0.22;
  const body = mesh(rbox(w, h, d, 0.1, 4), phys(0xf6f6f3, 0.28, 0, { clearcoat: 0.7 })); g.add(body);
  const slot = mesh(rbox(w * 0.88, 0.04, 0.05, 0.015), dark(), false); slot.position.set(0, -0.09, d / 2 - 0.01); g.add(slot);
  const louvre = mesh(rbox(w * 0.86, 0.012, 0.06, 0.004), phys(0xe4e6e8, 0.4), false); louvre.position.set(0, -0.125, d / 2 + 0.01); louvre.rotation.x = 0.5; g.add(louvre);
  const led = mesh(new THREE.SphereGeometry(0.012, 8, 8), emissive(0x7affb0, 2), false); led.position.set(w * 0.4, 0.04, d / 2 + 0.003); g.add(led);
  const grille = mesh(rbox(w * 0.7, 0.07, 0.01, 0.003), phys(0xdcdedf, 0.5), false); grille.position.set(-0.08, 0.06, d / 2 + 0.002); g.add(grille);
  return make('air-con', g, { top: new THREE.Vector3(0, 0.25, 0.1), labelAt: new THREE.Vector3(0, 0.4, 0), radius: 0.6, height: h });
}

function television(): AuditModel {
  const g = new THREE.Group();
  const cab = mesh(rbox(1.5, 0.5, 0.42, 0.03), M.timber('dark', 1, 1)); cab.position.y = 0.25; g.add(cab);
  const door = mesh(rbox(1.46, 0.015, 0.4, 0.01), phys(0x3a2a1e, 0.6), false); door.position.set(0, 0.5, 0); g.add(door);
  const set = new THREE.Group(); set.position.y = 0.5; g.add(set);
  const w = 1.25, h = 0.74;
  const bezel = mesh(rbox(w, h, 0.09, 0.03), phys(0x101114, 0.3, 0.3)); bezel.position.y = 0.06 + h / 2 + 0.06; set.add(bezel);
  const back = mesh(rbox(w * 0.55, h * 0.55, 0.18, 0.05), phys(0x15171a, 0.5)); back.position.set(0, 0.06 + h / 2 + 0.08, -0.12); set.add(back);
  const screen = mesh(rbox(w - 0.1, h - 0.1, 0.01, 0.01), new THREE.MeshStandardMaterial({ color: 0x0a1018, emissive: 0x2e5a86, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.2 }), false);
  screen.position.set(0, 0.06 + h / 2 + 0.06, 0.05); set.add(screen);
  const neck = mesh(rbox(0.2, 0.09, 0.1, 0.02), M.darkSteel()); neck.position.set(0, 0.05, -0.04); set.add(neck);
  const foot = mesh(rbox(0.56, 0.02, 0.26, 0.01), M.darkSteel()); foot.position.set(0, 0.01, 0); set.add(foot);
  const led = mesh(new THREE.SphereGeometry(0.01, 8, 8), emissive(0xff3a2a, 2), false); led.position.set(0.45, 0.1, 0.05); set.add(led);
  return make('tv', g, { top: new THREE.Vector3(0, 1.45, 0), labelAt: new THREE.Vector3(0, 1.65, 0), radius: 0.85, height: 1.4 });
}

function computer(): AuditModel {
  const g = new THREE.Group();
  const top = mesh(rbox(1.35, 0.045, 0.68, 0.015), M.timber('bench', 1, 1)); top.position.y = 0.74; g.add(top);
  for (const [x, z] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) { const l = mesh(rbox(0.045, 0.72, 0.045, 0.01), M.darkSteel(), false); l.position.set(x, 0.36, z); g.add(l); }
  const mon = mesh(rbox(0.6, 0.36, 0.025, 0.012), phys(0x111214, 0.3, 0.2)); mon.position.set(-0.1, 1.08, -0.18); g.add(mon);
  const scr = mesh(rbox(0.56, 0.32, 0.006, 0.006), new THREE.MeshStandardMaterial({ color: 0x0b1018, emissive: 0x3a7acb, emissiveIntensity: 0.7, roughness: 0.1 }), false); scr.position.set(-0.1, 1.08, -0.166); g.add(scr);
  const neck = mesh(rbox(0.05, 0.14, 0.03, 0.01), M.darkSteel()); neck.position.set(-0.1, 0.84, -0.2); g.add(neck);
  const foot = mesh(rbox(0.26, 0.015, 0.16, 0.006), M.darkSteel()); foot.position.set(-0.1, 0.77, -0.18); g.add(foot);
  const tower = mesh(rbox(0.2, 0.44, 0.46, 0.02), phys(0x1c1e22, 0.35, 0.3)); tower.position.set(0.52, 1.0, -0.12); g.add(tower);
  const pled = mesh(new THREE.SphereGeometry(0.012, 8, 8), emissive(0x5cffa0, 2), false); pled.position.set(0.52, 1.1, 0.12); g.add(pled);
  const kb = mesh(rbox(0.42, 0.015, 0.14, 0.006), phys(0x2a2d33, 0.5), false); kb.position.set(-0.1, 0.77, 0.12); g.add(kb);
  const ms = mesh(rbox(0.06, 0.02, 0.1, 0.01), phys(0x2a2d33, 0.4), false); ms.position.set(0.25, 0.77, 0.14); g.add(ms);
  return make('computer', g, { top: new THREE.Vector3(0, 1.4, 0), labelAt: new THREE.Vector3(0, 1.6, 0), radius: 0.8, height: 1.3 });
}

function downlights(): AuditModel {
  const g = new THREE.Group();
  const slab = mesh(rbox(5.4, 0.16, 0.8, 0.04), phys(0xe9e5dc, 0.9)); slab.position.y = 0.03; g.add(slab);
  const lens = emissive(0xffd9a0, 2.4);
  for (let i = 0; i < 6; i++) {
    const x = -2.3 + i * 0.92;
    const can = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 28), M.nickel()); can.position.set(x, -0.065, 0); g.add(can);
    const bulb = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 24), lens); bulb.position.set(x, -0.085, 0); g.add(bulb);
    const sp = glowSprite(0xffcf90, 0.9, 0.85); sp.position.set(x, -0.25, 0); g.add(sp);
  }
  return make('downlights', g, { top: new THREE.Vector3(0, -0.25, 0), labelAt: new THREE.Vector3(0, 0.3, 0), radius: 1.0, height: 0.2 });
}

function heater(): AuditModel {
  const m = buildHeater();
  const g = new THREE.Group();
  m.group.scale.setScalar(0.27);
  g.add(m.group);
  m.setOn(true);
  return make('heater', g, { top: new THREE.Vector3(0, 0.95, 0), labelAt: new THREE.Vector3(0, 1.0, 0), radius: 0.4, height: 0.8, update: (dt, t) => m.update(dt, t) });
}

export function buildAuditModel(id: string): AuditModel {
  switch (id) {
    case 'hot-water': return hotWater();
    case 'air-con': return airCon();
    case 'heater': return heater();
    case 'second-fridge': return fridge(id, { w: 0.58, h: 1.25, d: 0.6, body: 0xe9dcbc, metal: false, old: true, twoDoors: false });
    case 'downlights': return downlights();
    case 'fridge': return fridge(id, { w: 0.78, h: 1.8, d: 0.72, body: 0xcfd2d6, metal: true, old: false, twoDoors: true });
    case 'dryer': return laundry(id, { dryer: true });
    case 'tv': return television();
    case 'computer': return computer();
    case 'washer': return laundry(id, { dryer: false });
    default: throw new Error(`no model for ${id}`);
  }
}
