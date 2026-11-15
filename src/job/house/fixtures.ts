// Fittings for the training house: Australian-style wall switch and power point, 4 mm test sockets, terminal
// blocks, the training switchboard, multimeter test probes, a timber step stool and a plug-in test lamp.
// Units: 1 = 10 cm. Each fitting is built facing +z with its back on z = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as M from '../../kit/materials';
import type { InsulationColour } from '../../kit/materials';
import { glowSprite } from '../../kit/parts/common';
import type { HouseMats } from './mats';

export const rb = (w: number, h: number, d: number, r = 0.02, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
export function mk(g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh {
  const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = true; return x;
}

/** a crisp printed label texture: each line is sized to fit the width (owned by the caller) */
export function fitTexture(lines: string | string[], aspect: number, o: M.LabelOpts = {}): THREE.CanvasTexture {
  const L = Array.isArray(lines) ? lines : [lines];
  const W = aspect >= 1 ? 512 : Math.round(512 * aspect), H = Math.max(24, Math.round(W / aspect));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  if (o.bg !== 'transparent') { ctx.fillStyle = o.bg ?? '#f2ead6'; ctx.fillRect(0, 0, W, H); }
  if (o.border) { const b = Math.max(3, H * 0.045); ctx.strokeStyle = o.border; ctx.lineWidth = b; ctx.strokeRect(b, b, W - 2 * b, H - 2 * b); }
  const font = (px: number, i: number) => `${i === 0 ? (o.font ?? '800') : '600'} ${px}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  const rowH = H / L.length;
  ctx.fillStyle = o.fg ?? '#1c1e26'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  L.forEach((line, i) => {
    let px = rowH * (L.length > 1 && i > 0 ? 0.52 : 0.66);
    ctx.font = font(px, i);
    const wMax = W * 0.88;
    const m = ctx.measureText(line).width;
    if (m > wMax) { px *= wMax / m; ctx.font = font(px, i); }
    ctx.fillText(line, W / 2, rowH * (i + 0.5) + px * 0.04);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** a printed label plane (owned texture) facing +z */
export function tagPlane(lines: string | string[], w: number, h: number, o: M.LabelOpts = {}): THREE.Mesh {
  const t = fitTexture(lines, w / h, o);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0, transparent: o.bg === 'transparent', polygonOffset: true, polygonOffsetFactor: -1 }));
}

// ───────────── wall switch ─────────────
export interface WallSwitch extends THREE.Group { userData: { set(on: boolean): void; update(dt: number): void; hit: THREE.Object3D } }
export function wallSwitch(mats: HouseMats): WallSwitch {
  const g = new THREE.Group() as WallSwitch;
  const plate = mk(rb(0.72, 1.16, 0.08, 0.035, 3), mats.whitePlastic); plate.position.z = 0.04; g.add(plate);
  const bezel = mk(rb(0.34, 0.5, 0.03, 0.02), mats.whitePlastic); bezel.position.set(0, 0, 0.085); g.add(bezel);
  const pivot = new THREE.Group(); pivot.position.set(0, 0, 0.1); g.add(pivot);
  const rocker = mk(rb(0.27, 0.42, 0.05, 0.02, 3), mats.whitePlastic); rocker.position.z = 0.01; pivot.add(rocker);
  const dot = mk(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 12).rotateX(Math.PI / 2), M.plastic(0xc03a2a, 0.3), false); dot.position.set(0, -0.14, 0.04); pivot.add(dot);
  for (const s of [-1, 1]) { const sc = mk(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14).rotateX(Math.PI / 2), mats.whitePlastic, false); sc.position.set(0, s * 0.44, 0.085); g.add(sc); }
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.z = 0.2; g.add(hit);
  let target = 1, cur = 1;
  g.userData = {
    hit,
    // Australian switches are on when the bottom of the rocker is pressed in
    set(on) { target = on ? 1 : -1; },
    update(dt) { cur += (target - cur) * (1 - Math.exp(-dt * 18)); pivot.rotation.x = -0.15 * cur; },
  };
  return g;
}

// ───────────── power point (single switched socket outlet, Australian pattern) ─────────────
export interface PowerPoint extends THREE.Group { userData: { plugAnchor: THREE.Vector3; hit: THREE.Object3D } }
export function powerPoint(mats: HouseMats, label: string): PowerPoint {
  const g = new THREE.Group() as PowerPoint;
  const plate = mk(rb(0.74, 1.18, 0.1, 0.04, 3), mats.whitePlastic); plate.position.z = 0.05; g.add(plate);
  // switch rocker at the top
  const sw = mk(rb(0.24, 0.17, 0.05, 0.015), mats.whitePlastic); sw.position.set(0, 0.38, 0.115); sw.rotation.x = 0.12; g.add(sw);
  const red = mk(rb(0.06, 0.05, 0.02, 0.008), M.plastic(0xc8342a, 0.35), false); red.position.set(0, 0.42, 0.145); g.add(red);
  // socket face
  const face = mk(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 32).rotateX(Math.PI / 2), mats.whitePlastic); face.position.set(0, -0.06, 0.105); g.add(face);
  const slotG = new THREE.BoxGeometry(0.036, 0.12, 0.02);
  for (const s of [-1, 1]) { const sl = mk(slotG, mats.slot, false); sl.position.set(s * 0.1, 0.0, 0.114); sl.rotation.z = s * 0.52; g.add(sl); }
  const e = mk(new THREE.BoxGeometry(0.036, 0.13, 0.02), mats.slot, false); e.position.set(0, -0.18, 0.114); g.add(e);
  const lab = tagPlane(label, 0.6, 0.1, { bg: '#f3f1ea', fg: '#9a2a1d', size: 30 }); lab.position.set(0, -0.47, 0.101); g.add(lab);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.7), new THREE.MeshBasicMaterial({ visible: false })); hit.position.z = 0.25; g.add(hit);
  g.userData = { plugAnchor: new THREE.Vector3(0, -0.06, 0.12), hit };
  return g;
}

/** the plug of a test lamp lead (pins into the socket); origin at the socket face */
export function lampPlug(mats: HouseMats): THREE.Group {
  const g = new THREE.Group();
  const body = mk(rb(0.36, 0.44, 0.24, 0.06, 3), mats.greyPlastic); body.position.set(0, -0.03, 0.12); g.add(body);
  const grip = mk(rb(0.3, 0.06, 0.2, 0.02), mats.greyPlastic); grip.position.set(0, 0.2, 0.12); g.add(grip);
  const boot = mk(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 12), mats.greyPlastic); boot.position.set(0, -0.3, 0.12); g.add(boot);
  return g;
}

// ───────────── 4 mm shrouded test socket with a numbered tag ─────────────
export function testSocket(mats: HouseMats, code: string, tagSide: 'up' | 'down' = 'up'): THREE.Group {
  const g = new THREE.Group();
  const nut = mk(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 6).rotateX(Math.PI / 2), M.brass(), false); nut.position.z = 0.015; g.add(nut);
  const shroud = mk(new THREE.CylinderGeometry(0.062, 0.07, 0.13, 20).rotateX(Math.PI / 2), mats.socketYellow); shroud.position.z = 0.095; g.add(shroud);
  const hole = mk(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 14).rotateX(Math.PI / 2), mats.slot, false); hole.position.z = 0.161; g.add(hole);
  const pin = mk(new THREE.TorusGeometry(0.031, 0.008, 6, 16), M.brass(), false); pin.position.z = 0.162; g.add(pin);
  const tag = tagPlane(code, 0.34, 0.17, { bg: '#f6f4ec', fg: '#1b1b1b', size: 72, border: '#2a2a2a' });
  tag.position.set(0, tagSide === 'up' ? 0.22 : -0.22, 0.005);
  const back = mk(rb(0.37, 0.2, 0.02, 0.01), M.plastic(0x2a2a2a, 0.4), false); back.position.copy(tag.position).setZ(-0.008);
  g.add(back, tag);
  return g;
}

// ───────────── 3-way terminal block ─────────────
const NET_COL: Record<string, { col: string; fg: string; letter: string }> = {
  active: { col: '#c0251c', fg: '#fff', letter: 'A' }, neutral: { col: '#1d1e21', fg: '#fff', letter: 'N' }, earth: { col: '#1f8a3a', fg: '#ffe24a', letter: 'E' },
};
export function terminalBlock(mats: HouseMats, title: string): THREE.Group & { userData: { terminals: THREE.Vector3[] } } {
  const g = new THREE.Group() as THREE.Group & { userData: { terminals: THREE.Vector3[] } };
  const body = mk(rb(1.2, 0.38, 0.3, 0.04, 3), M.plastic(0xd9dbd8, 0.4)); body.position.z = 0.15; g.add(body);
  const terms: THREE.Vector3[] = [];
  (['active', 'neutral', 'earth'] as const).forEach((n, i) => {
    const x = (i - 1) * 0.38;
    const well = mk(rb(0.26, 0.3, 0.04, 0.02), mats.slot, false); well.position.set(x, 0, 0.295); g.add(well);
    const screwH = mk(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 18).rotateX(Math.PI / 2), M.brass()); screwH.position.set(x, 0, 0.32); g.add(screwH);
    const slot = mk(new THREE.BoxGeometry(0.13, 0.02, 0.02), M.brassDark(), false); slot.position.set(x, 0, 0.345); slot.rotation.z = 0.5 + i * 0.7; g.add(slot);
    const t = NET_COL[n];
    const lab = tagPlane(t.letter, 0.24, 0.18, { bg: t.col, fg: t.fg, size: 34 }); lab.position.set(x, -0.33, 0.02);
    g.add(lab);
    terms.push(new THREE.Vector3(x, 0, 0.35));
  });
  const head = tagPlane(title, 1.5, 0.3, { bg: '#f2ead6', fg: '#1c1e26', border: '#1c1e26' }); head.position.set(0, 0.4, 0.01); g.add(head);
  g.userData = { terminals: terms };
  return g;
}

/** galvanised mounting bracket spanning a stud cavity (centred on x = 0), lying on the stud faces */
export function bracket(mats: HouseMats, span: number, h = 0.5): THREE.Mesh {
  const m = mk(rb(span, h, 0.03, 0.01), mats.galv); m.position.z = -0.015;
  return m;
}

// ───────────── training switchboard ─────────────
export interface Switchboard extends THREE.Group {
  userData: {
    setMain(on: boolean): void;
    setSupply(on: boolean, volts: number): void;
    update(dt: number): void;
    mainHit: THREE.Object3D;
    /** sockets in board space: T1 (+), T2 (−), T3 (after main) */
    sockets: { code: string; pos: THREE.Vector3 }[];
    /** cable entries: top and bottom */
    top: THREE.Vector3; bottom: THREE.Vector3;
    dispose(): void;
  };
}
export function switchboard(mats: HouseMats): Switchboard {
  const g = new THREE.Group() as Switchboard;
  const W = 3.8, H = 4.4, D = 1.0;
  const box = mk(rb(W, H, D, 0.08, 3), mats.enclosure); box.position.z = D / 2; g.add(box);
  const lip = mk(rb(W - 0.16, H - 0.16, 0.04, 0.03), mats.enclosure); lip.position.z = D + 0.01; g.add(lip);
  // two DIN rows behind cut-outs in the escutcheon (an oversized training board: modules are 27 mm)
  const MOD = 0.27, DH = 0.8;
  const rowY = [0.85, -0.8];
  for (const y of rowY) { const cut = mk(rb(W - 0.5, DH + 0.1, 0.03, 0.02), M.plastic(0x2a2c30, 0.6), false); cut.position.set(0, y, D + 0.03); g.add(cut); }
  const dev = (mods: number, x: number, y: number, col = 0xf1f0ec) => { const d = mk(rb(mods * MOD - 0.014, DH, 0.2, 0.025, 2), M.plastic(col, 0.34)); d.position.set(x, y, D + 0.1); g.add(d); return d; };
  const lever = (x: number, y: number, colour: number) => {
    const p = new THREE.Group(); p.position.set(x, y + 0.08, D + 0.2); g.add(p);
    const l = mk(rb(0.13, 0.3, 0.14, 0.04), M.plastic(colour, 0.32)); l.position.set(0, 0.08, 0.05); p.add(l);
    return p;
  };
  const under = (text: string, x: number, w: number, y: number) => { const t = tagPlane(text, w - 0.02, 0.16, { bg: '#f2ead6', fg: '#1c1e26' }); t.position.set(x, y - DH / 2 - 0.16, D + 0.035); g.add(t); };
  // top row: main switch (2 modules), lights and outlets breakers, 5 A overload protector (2 modules)
  let x = -1.45;
  const place = (mods: number) => { const cx = x + (mods * MOD) / 2; x += mods * MOD; return cx; };
  const cMain = place(2); dev(2, cMain, rowY[0]);
  const mainLever = lever(cMain, rowY[0], 0xc8291e);
  const cL = place(1); dev(1, cL, rowY[0]); const l1 = lever(cL, rowY[0], 0x1c1d20);
  const cO = place(1); dev(1, cO, rowY[0]); const l2 = lever(cO, rowY[0], 0x1c1d20);
  const cP = place(2); dev(2, cP, rowY[0], 0xe8e7e1);
  const pb = mk(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14).rotateX(Math.PI / 2), M.plastic(0x2d65c8, 0.3)); pb.position.set(cP, rowY[0] + 0.18, D + 0.215); g.add(pb);
  const pr = tagPlane(['5 A', 'OVERLOAD'], 0.44, 0.26, { bg: '#e8e7e1', fg: '#222' }); pr.position.set(cP, rowY[0] - 0.12, D + 0.202); g.add(pr);
  l1.rotation.x = -0.5; l2.rotation.x = -0.5;
  under('MAIN', cMain, 2 * MOD, rowY[0]); under('LIGHTS', cL, MOD * 1.0, rowY[0]); under('OUTLETS', cO, MOD, rowY[0]); under('PROTECTOR', cP, 2 * MOD, rowY[0]);
  const cMeterTxt = tagPlane(['ON', '', 'OFF'], 0.16, 0.5, { bg: 'transparent', fg: '#444' }); cMeterTxt.position.set(cMain + 0.2, rowY[0], D + 0.202); g.add(cMeterTxt);
  // bottom row: 12 V supply module with an LCD, LED and output terminals
  const sx = -0.85;
  dev(4, sx, rowY[1], 0x9aa0a6);
  const lcd = M.createLcd(3, 192, 96);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), lcd.material); scr.position.set(sx - 0.1, rowY[1] + 0.12, D + 0.202); g.add(scr);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff66, emissiveIntensity: 3 })); led.position.set(sx + 0.38, rowY[1] + 0.16, D + 0.205); g.add(led);
  const ledGlow = glowSprite(0x55ff88); ledGlow.position.copy(led.position); ledGlow.scale.setScalar(0.2); g.add(ledGlow);
  const ml = tagPlane('12 V DC  4 A', 0.8, 0.13, { bg: '#9aa0a6', fg: '#111' }); ml.position.set(sx, rowY[1] - 0.2, D + 0.202); g.add(ml);
  under('12 V SUPPLY', sx, 4 * MOD, rowY[1]);
  under('TEST POINTS', 0.95, 1.3, rowY[1]);
  const sockets = [
    { code: 'T1', pos: new THREE.Vector3(0.5, rowY[1] - 0.05, D + 0.04) },
    { code: 'T2', pos: new THREE.Vector3(0.95, rowY[1] - 0.05, D + 0.04) },
    { code: 'T3', pos: new THREE.Vector3(1.4, rowY[1] - 0.05, D + 0.04) },
  ];
  // screws and a hinged-door edge
  for (const sx2 of [-1, 1]) for (const sy of [-1, 1]) { const s = mk(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14).rotateX(Math.PI / 2), M.nickel(), false); s.position.set(sx2 * (W / 2 - 0.2), sy * (H / 2 - 0.2), D + 0.04); g.add(s); }
  const grom = (y: number) => { const r = mk(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), mats.grommet); r.scale.set(2.4, 1, 0.5); r.position.set(0, y, 0.45); g.add(r); };
  grom(H / 2); grom(-H / 2);
  const mainHit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.7), new THREE.MeshBasicMaterial({ visible: false })); mainHit.position.set(cMain, rowY[0], D + 0.3); g.add(mainHit);
  let mainTarget = 1, mainCur = 1;
  g.userData = {
    mainHit, sockets,
    top: new THREE.Vector3(0, H / 2, 0.45), bottom: new THREE.Vector3(0, -H / 2, 0.45),
    setMain(on) { mainTarget = on ? 1 : -1; },
    setSupply(on, v) {
      lcd.set(on ? v.toFixed(1) : ' 0.0', 'V');
      (led.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 3 : 0.0;
      ledGlow.material.opacity = on ? 0.55 : 0;
    },
    update(dt) { mainCur += (mainTarget - mainCur) * (1 - Math.exp(-dt * 16)); mainLever.rotation.x = -0.5 * mainCur; },
    dispose() { lcd.dispose(); },
  };
  return g;
}

/** yellow warning placard for the training supply */
export function placard(): THREE.Mesh {
  const t = fitTexture(['12 V TRAINING SUPPLY', 'Extra-low voltage. Training use only.'], 3.6 / 1.12, { bg: '#f3c21b', fg: '#141414', border: '#141414' });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.12), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0 }));
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

// ───────────── multimeter test probe (tip at origin, pointing along −y; handle up +y) ─────────────
export function testProbe(colour: InsulationColour): THREE.Group & { userData: { exit: THREE.Vector3 } } {
  const g = new THREE.Group() as THREE.Group & { userData: { exit: THREE.Vector3 } };
  const ins = M.insulation(colour);
  const tip = mk(new THREE.CylinderGeometry(0.014, 0.004, 0.24, 10).translate(0, 0.12, 0), M.steel(), false); g.add(tip);
  const guard = mk(new THREE.CylinderGeometry(0.06, 0.085, 0.05, 20).translate(0, 0.28, 0), ins); g.add(guard);
  const prof = [new THREE.Vector2(0.032, 0.3), new THREE.Vector2(0.05, 0.36)];
  for (let i = 0; i < 6; i++) { const y = 0.42 + i * 0.1; prof.push(new THREE.Vector2(0.056, y), new THREE.Vector2(0.05, y + 0.05)); }
  prof.push(new THREE.Vector2(0.052, 1.06), new THREE.Vector2(0.034, 1.16), new THREE.Vector2(0.022, 1.3), new THREE.Vector2(0.0, 1.31));
  const handle = mk(new THREE.LatheGeometry(prof, 20), ins); g.add(handle);
  g.userData = { exit: new THREE.Vector3(0, 1.28, 0) };
  return g;
}

// ───────────── timber step stool ─────────────
export function stool(mats: HouseMats, timberGeo: (x: number, y: number, z: number, s: number) => THREE.BufferGeometry): THREE.Group {
  const g = new THREE.Group();
  const top = mk(timberGeo(3.4, 0.28, 1.8, 3), mats.pine); top.position.y = 4.6; g.add(top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = mk(timberGeo(0.42, 4.5, 0.42, 5 + sx + sz), mats.pine);
      leg.position.set(sx * 1.4, 2.28, sz * 0.62); leg.rotation.z = -sx * 0.06; leg.rotation.x = sz * 0.05; g.add(leg);
    }
    const rail = mk(timberGeo(0.3, 0.42, 1.3, 9), mats.pine); rail.position.set(sx * 1.48, 1.2, 0); g.add(rail);
  }
  const stretcher = mk(timberGeo(2.9, 0.42, 0.3, 11), mats.pine); stretcher.position.set(0, 1.2, 0); g.add(stretcher);
  return g;
}

/** a small timber block that a test lamp stands on */
export function lampBlock(mats: HouseMats, timberGeo: (x: number, y: number, z: number, s: number) => THREE.BufferGeometry, label: string): THREE.Group {
  const g = new THREE.Group();
  const b = mk(timberGeo(1.5, 0.4, 0.9, 13), mats.pine); b.position.y = 0.2; g.add(b);
  const t = tagPlane(label, 1.2, 0.26, { bg: '#f2ead6', fg: '#1c1e26', size: 44 }); t.position.set(0, 0.2, 0.452); g.add(t);
  return g;
}
