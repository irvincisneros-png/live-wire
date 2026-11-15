// Batteries: 1.5 V D-cell in a holder, 6 V lantern pack, 12 V pack. Terminal a (x = −0.5) is NEGATIVE.
// (The adjustable bench power supply lives in meter.ts beside the meters: it faces the student like they do.)
import * as THREE from 'three';
import * as M from '../materials';
import { canvas } from '../textures';
import { DIM, bakeStatic, heatShell, lugs, mesh, rbox, setHeat, sharedGeo } from './common';
import { createCable } from './lead';

export type BatteryStyle = 'cell' | 'lantern' | 'pack12';
export const batteryStyle = (emf: number): BatteryStyle => (emf <= 3 ? 'cell' : emf <= 7.5 ? 'lantern' : 'pack12');

function cellWrapper(emf: number): THREE.CanvasTexture {
  // canvas x = around the cell, canvas y = along it (top row = + end at +x)
  const [c, ctx] = canvas(512, 512);
  // generic cell: deep blue wrap with a brushed-silver + end band
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#0f2142'); g.addColorStop(0.5, '#1f3f78'); g.addColorStop(1, '#0f2142');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  const cg = ctx.createLinearGradient(0, 0, 512, 0);
  cg.addColorStop(0, '#7d848c'); cg.addColorStop(0.5, '#d7dce0'); cg.addColorStop(1, '#7d848c');
  ctx.fillStyle = cg; ctx.fillRect(0, 0, 512, 130);
  ctx.fillStyle = '#e8c43a'; ctx.fillRect(0, 130, 512, 10);
  ctx.save();
  ctx.translate(256, 256); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f2efe6'; ctx.font = '800 64px Arial, sans-serif';
  ctx.fillText(`${emf % 1 === 0 ? emf.toFixed(1) : emf} V`, -20, 0);
  ctx.font = '700 30px Arial, sans-serif'; ctx.fillStyle = '#c8c3b6';
  ctx.fillText('SIZE D  ·  CELL', -20, 58);
  ctx.font = '900 80px Arial, sans-serif';
  ctx.fillStyle = '#1b2433'; ctx.fillText('+', 196, 0);
  ctx.fillStyle = '#f2efe6'; ctx.fillText('−', -215, -4);
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function packLabel(text: string, bg: string, fg: string, w = 512, h = 256): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, h * 0.72, w, h * 0.06);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = fg; ctx.font = `900 ${h * 0.42}px Arial, sans-serif`;
  ctx.fillText(text, w / 2, h * 0.42);
  ctx.font = `800 ${h * 0.34}px Arial, sans-serif`;
  ctx.fillText('−', w * 0.1, h * 0.42); ctx.fillText('+', w * 0.9, h * 0.42);
  ctx.font = `700 ${h * 0.1}px Arial, sans-serif`; ctx.globalAlpha = 0.75;
  ctx.fillText('DC  BATTERY PACK', w / 2, h * 0.86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function polarityChip(sign: '+' | '−'): THREE.Mesh {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = sign === '+' ? '#c0251c' : '#1d1e21';
  ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '900 50px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(sign, 32, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** terminal post on top of a pack: brass stud + coloured knurled nut */
function packTerminal(sign: '+' | '−'): THREE.Group {
  const g = new THREE.Group();
  const stud = mesh(sharedGeo('pack-stud', () => new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12).translate(0, 0.025, 0)), M.brass(), false);
  const nut = mesh(sharedGeo('pack-nut', () => {
    const g2 = new THREE.CylinderGeometry(0.03, 0.032, 0.035, 18, 1);
    const pos = g2.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x), k = 1 + 0.06 * Math.max(0, Math.cos(a * 9)); pos.setXYZ(i, x * k, pos.getY(i), z * k); }
    g2.computeVertexNormals();
    return g2.translate(0, 0.035, 0);
  }), M.plastic(sign === '+' ? 0xb3231b : 0x1b1c1f, 0.35));
  const base = mesh(sharedGeo('pack-base', () => new THREE.CylinderGeometry(0.03, 0.034, 0.012, 20).translate(0, 0.006, 0)), M.brassDark(), false);
  g.add(stud, nut, base);
  return g;
}

export interface BatteryModel extends THREE.Group { userData: { style: BatteryStyle; update(s: { heat?: number }, dt: number): void; flowPath: { pts: THREE.Vector3[]; u: number[] } } }

export function createBattery(emf: number): BatteryModel {
  const style = batteryStyle(emf);
  const g = new THREE.Group() as unknown as BatteryModel;
  const shells: THREE.Mesh[] = [];
  let flow: { pts: THREE.Vector3[]; u: number[] };
  if (style === 'cell') {
    // black ABS holder tray with end walls
    const tray = mesh(rbox(0.76, 0.04, 0.4, 0.015), M.plastic(0x1c1d20, 0.5)); tray.position.y = 0.02; g.add(tray);
    for (const s of [-1, 1]) {
      const wall = mesh(rbox(0.035, 0.24, 0.38, 0.012), M.plastic(0x1c1d20, 0.5)); wall.position.set(s * 0.36, 0.12, 0); g.add(wall);
      const rail = mesh(rbox(0.68, 0.1, 0.03, 0.012), M.plastic(0x1c1d20, 0.5)); rail.position.set(0, 0.07, s * 0.185); g.add(rail);
      const chip = polarityChip(s > 0 ? '+' : '−'); chip.position.set(s * 0.36, 0.2405, 0.13); g.add(chip);
    }
    // the cell, lying along x, seam at the back
    const R = 0.163, L = 0.6, cy = 0.04 + R + 0.002;
    const wrapGeo = new THREE.CylinderGeometry(R, R, L - 0.03, 48, 1, true).rotateZ(-Math.PI / 2).rotateX(Math.PI);
    const wrapper = mesh(wrapGeo, new THREE.MeshPhysicalMaterial({ map: cellWrapper(emf), roughness: 0.32, metalness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    wrapper.position.y = cy; g.add(wrapper);
    // steel end caps: flat negative, nipple positive
    const capGeo = sharedGeo('cell-cap', () => new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(R - 0.012, 0), new THREE.Vector2(R, 0.008), new THREE.Vector2(R, 0.016)], 40).rotateZ(Math.PI / 2));
    const neg = mesh(capGeo, M.steel()); neg.position.set(-L / 2, cy, 0); g.add(neg);
    const pos = mesh(capGeo, M.steel()); pos.position.set(L / 2, cy, 0); pos.scale.x = -1; g.add(pos);
    const nip = mesh(sharedGeo('cell-nip', () => new THREE.CylinderGeometry(0.048, 0.05, 0.03, 24).rotateZ(Math.PI / 2)), M.nickel()); nip.position.set(L / 2 + 0.01, cy, 0); g.add(nip);
    // spring at the negative end
    const coil: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 2 * 5; coil.push(new THREE.Vector3(-0.342 + i / 80 * 0.04, cy + Math.cos(a) * 0.04, Math.sin(a) * 0.04)); }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 160, 0.004, 5), M.steel(), false));
    const heatG = sharedGeo('cell-heat', () => new THREE.CylinderGeometry(R, R, L, 32, 1, false).rotateZ(-Math.PI / 2));
    const sh = heatShell(heatG, 1.03); sh.position.y = cy; g.add(sh); shells.push(sh);
    g.add(lugs(0.378, 0.05));
    const pts = [[-0.5, DIM.lugY], [-0.4, 0.06], [-0.3, cy], [-0.1, cy], [0.1, cy], [0.3, cy], [0.4, 0.06], [0.5, DIM.lugY]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    flow = { pts, u: [0, 0, 0, 1 / 3, 2 / 3, 1, 1, 1] };
  } else {
    const W = style === 'lantern' ? 0.6 : 0.7, Hh = style === 'lantern' ? 0.34 : 0.32, D = style === 'lantern' ? 0.36 : 0.4;
    const caseCol = style === 'lantern' ? 0x22303d : 0x3c4046;
    const body = mesh(rbox(W, Hh, D, 0.035, 3), M.plastic(caseCol, 0.42)); body.position.y = Hh / 2; g.add(body);
    // lid seam
    const lid = mesh(rbox(W + 0.008, 0.04, D + 0.008, 0.015), M.plastic(style === 'lantern' ? 0x18222c : 0x2a2d31, 0.4)); lid.position.y = Hh - 0.03; g.add(lid);
    const text = style === 'lantern' ? `${emf} V` : `${emf} V`;
    const tex = packLabel(text, style === 'lantern' ? '#e9b61e' : '#c42a20', style === 'lantern' ? '#1c1e26' : '#ffffff');
    const lblMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
    const lblGeo = new THREE.PlaneGeometry(W * 0.86, Hh * 0.5);
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(lblGeo, lblMat); l.position.set(0, Hh * 0.45, s * (D / 2 + 0.0015)); if (s < 0) l.rotation.y = Math.PI; g.add(l);
    }
    const tx = W / 2 - 0.1;
    for (const s of [-1, 1] as const) {
      const t = packTerminal(s > 0 ? '+' : '−'); t.position.set(s * tx, Hh, 0); g.add(t);
      const chip = polarityChip(s > 0 ? '+' : '−'); chip.position.set(s * tx, Hh + 0.0015, 0.1); g.add(chip);
      // short lead from the terminal down to a ring lug on the post
      const c = createCable(s > 0 ? 'red' : 'black', 20, 8);
      c.userData.setPath({ p0: new THREE.Vector3(s * tx, Hh + 0.03, 0), d0: new THREE.Vector3(s * 0.4, 1, 0), p1: new THREE.Vector3(s * 0.47, DIM.lugY + 0.012, 0), d1: new THREE.Vector3(-s * 0.3, 1, 0), h0: 0.1, h1: 0.14 });
      g.add(c);
    }
    g.add(lugs(0.45, DIM.lugY));
    const sh = heatShell(rbox(W, Hh, D, 0.035, 3), 1.03); sh.position.y = Hh / 2; g.add(sh); shells.push(sh);
    const cy = Hh * 0.5;
    const pts = [[-0.5, DIM.lugY], [-tx - 0.05, Hh + 0.08], [-tx, Hh - 0.02], [-tx * 0.6, cy], [0, cy], [tx * 0.6, cy], [tx, Hh - 0.02], [tx + 0.05, Hh + 0.08], [0.5, DIM.lugY]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    flow = { pts, u: [0, 0, 0, 0, 0.5, 1, 1, 1, 1] };
  }
  bakeStatic(g, shells);
  let heat = 0, t = 0;
  g.userData = {
    style,
    flowPath: flow,
    update(s, dt) {
      t += dt;
      const target = s.heat ?? 0;
      heat += (target - heat) * (1 - Math.exp(-dt * (target > heat ? 3 : 0.8)));
      const flicker = heat > 0.02 ? 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3) : 1;
      for (const sh of shells) setHeat(sh, heat * flicker);
    },
  };
  g.name = 'battery';
  return g;
}
