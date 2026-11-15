// The bench set: timber workbench, raised phenolic circuit panel with printed grid, instanced brass posts,
// pegboard wall, a few quiet props and the supply protector module.
import * as THREE from 'three';
import type { QualityTier } from '../types';
import * as M from '../kit/materials';
import { canvas, fbm } from '../kit/textures';
import { contactShadow } from '../kit/stage';
import { postGeometries } from '../kit/parts/post';
import { bakeStatic, mesh, rbox, screw } from '../kit/parts/common';
import { createCable } from '../kit/parts/lead';
import { postName, postXZ, type GridSize } from './grid';

export const BENCH_Y = -0.05; // bench top surface (panel top is y = 0)

export interface BenchSet {
  root: THREE.Group;
  panelW: number; panelD: number; benchW: number; benchD: number;
  /** surface height under (x, z) in world space */
  ground(x: number, z: number): number;
  posts: THREE.InstancedMesh[];
  protector: { group: THREE.Group; setTripped(t: boolean): void; update(dt: number): void };
  /** where off-board voltmeters stand */
  meterRowZ: number;
}

function panelTexture(g: GridSize, w: number, d: number): THREE.CanvasTexture {
  const ppu = 180;
  const W = Math.round(w * ppu), H = Math.round(d * ppu);
  const [c, ctx] = canvas(W, H);
  // phenolic base with subtle mottling
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x * 0.012, y * 0.012, 3, 21) * 0.5 + fbm(x * 0.08, y * 0.08, 2, 5) * 0.12;
    const i = (y * W + x) * 4;
    img.data[i] = 38 + n * 18; img.data[i + 1] = 50 + n * 20; img.data[i + 2] = 46 + n * 16; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const X = (wx: number) => (wx + w / 2) * ppu, Z = (wz: number) => (wz + d / 2) * ppu;
  ctx.strokeStyle = 'rgba(232,224,200,0.55)'; ctx.lineWidth = 3;
  const inset = 0.16 * ppu;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.lineWidth = 1.5; ctx.strokeRect(inset + 8, inset + 8, W - inset * 2 - 16, H - inset * 2 - 16);
  // printed edge guides between posts
  ctx.setLineDash([10, 9]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(232,224,200,0.22)';
  for (let r = 0; r < g.rows; r++) for (let col = 0; col < g.cols; col++) {
    const id = r * g.cols + col; const [x, z] = postXZ(g, id);
    if (col + 1 < g.cols) { ctx.beginPath(); ctx.moveTo(X(x + 0.13), Z(z)); ctx.lineTo(X(x + 0.87), Z(z)); ctx.stroke(); }
    if (r + 1 < g.rows) { ctx.beginPath(); ctx.moveTo(X(x), Z(z + 0.13)); ctx.lineTo(X(x), Z(z + 0.87)); ctx.stroke(); }
  }
  ctx.setLineDash([]);
  // silk-screened post rings and names
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let id = 0; id < g.cols * g.rows; id++) {
    const [x, z] = postXZ(g, id);
    ctx.strokeStyle = 'rgba(232,224,200,0.5)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(X(x), Z(z), 0.1 * ppu, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(232,224,200,0.62)'; ctx.font = `700 ${0.075 * ppu}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(postName(g, id), X(x + 0.2), Z(z + 0.2));
  }
  ctx.fillStyle = 'rgba(232,224,200,0.7)';
  ctx.font = `800 ${0.085 * ppu}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('LIVE WIRE  ·  DC CIRCUIT BOARD  ·  12 V MAX', W / 2, H - inset / 2 - 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function pegboardTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#5a4532'; ctx.fillRect(0, 0, 512, 512);
  const img = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 10; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.8; }
  ctx.putImageData(img, 0, 0);
  for (let y = 16; y < 512; y += 32) for (let x = 16; x < 512; x += 32) {
    ctx.fillStyle = '#17100a'; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,190,0.12)'; ctx.beginPath(); ctx.arc(x + 0.8, y + 1.2, 4.2, 0, Math.PI); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/** bench planks with offset grain so each plank looks cut from a different board */
function plank(w: number, h: number, d: number, seed: number): THREE.Mesh {
  const geo = rbox(w, h, d, 0.018, 2).clone();
  geo.userData = {};
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const ou = (seed * 0.37) % 1, ov = (seed * 0.61) % 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 4) + ou, uv.getY(i) * 0.4 + ov);
  const m = mesh(geo, M.timber('bench'));
  return m;
}

function vice(): THREE.Group {
  const g = new THREE.Group();
  const paint = M.plastic(0x2f4a3f, 0.55);
  const base = mesh(rbox(0.7, 0.12, 0.5, 0.04, 3), paint); base.position.y = 0.06; g.add(base);
  const body = mesh(rbox(0.45, 0.32, 0.36, 0.04, 3), paint); body.position.set(0, 0.28, -0.05); g.add(body);
  const jawF = mesh(rbox(0.5, 0.22, 0.12, 0.03, 3), paint); jawF.position.set(0, 0.36, 0.28); g.add(jawF);
  for (const z of [0.2, 0.355]) { const plate = mesh(rbox(0.5, 0.1, 0.03, 0.006), M.darkSteel()); plate.position.set(0, 0.43, z); g.add(plate); }
  const bar = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 16).rotateX(Math.PI / 2), M.steel()); bar.position.set(0, 0.24, 0.2); g.add(bar);
  const handle = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 12).rotateZ(Math.PI / 2), M.steel()); handle.position.set(0, 0.24, 0.56); g.add(handle);
  for (const s of [-1, 1]) { const k = mesh(new THREE.SphereGeometry(0.035, 16, 12), M.steel()); k.position.set(s * 0.3, 0.24, 0.56); g.add(k); }
  return g;
}

function drawers(): THREE.Group {
  const g = new THREE.Group();
  const frame = mesh(rbox(1.1, 0.75, 0.55, 0.03, 2), M.plastic(0x3a4a5c, 0.5)); frame.position.y = 0.375; g.add(frame);
  const label = (txt: string) => {
    const [c, ctx] = canvas(128, 40); ctx.fillStyle = '#f2ead6'; ctx.fillRect(0, 0, 128, 40); ctx.fillStyle = '#333'; ctx.font = '700 22px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 64, 21);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const names = ['LUGS', 'GLOBES', 'CLIPS', 'FUSES', 'SCREWS', 'LEADS'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const dr = mesh(rbox(0.5, 0.21, 0.04, 0.015), M.plastic(0xc7ccd2, 0.35)); dr.position.set(-0.26 + c * 0.52, 0.14 + r * 0.235, 0.28); g.add(dr);
    const pull = mesh(rbox(0.16, 0.03, 0.03, 0.01), M.plastic(0x7e8792, 0.4)); pull.position.set(-0.26 + c * 0.52, 0.1 + r * 0.235, 0.31); g.add(pull);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0625), new THREE.MeshStandardMaterial({ map: label(names[r * 2 + c]), roughness: 0.9 }));
    l.position.set(-0.26 + c * 0.52, 0.18 + r * 0.235, 0.301); g.add(l);
  }
  return g;
}

function coiledLead(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 360; i++) {
    const k = i / 360, a = k * Math.PI * 2 * 4.5;
    const r = 0.32 + Math.sin(k * 37) * 0.012 + k * 0.03;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.02 + k * 0.05 + Math.max(0, Math.sin(a * 0.5)) * 0.015, Math.sin(a) * r * 0.85));
  }
  pts.push(new THREE.Vector3(0.6, 0.02, 0.2), new THREE.Vector3(0.75, 0.02, 0.35));
  const c = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 600, 0.018, 8), M.insulation('blue'));
  g.add(c);
  return g;
}

function protectorModule(): BenchSet['protector'] {
  const g = new THREE.Group();
  const body = mesh(rbox(0.34, 0.46, 0.58, 0.035, 3), M.plastic(0xe6e3dc, 0.4)); body.position.y = 0.23; g.add(body);
  const front = mesh(rbox(0.3, 0.06, 0.3, 0.02, 2), M.plastic(0xd8d4cb, 0.4)); front.position.set(0, 0.47, 0.04); g.add(front);
  // label
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#e6e3dc'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#2a2a2a'; ctx.textAlign = 'center'; ctx.font = '800 26px Arial'; ctx.fillText('SUPPLY', 128, 50); ctx.fillText('PROTECTOR', 128, 82);
  ctx.font = '600 20px Arial'; ctx.fillText('trips on a short', 128, 214);
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3; ctx.strokeRect(40, 104, 176, 80);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.4605, -0.14); g.add(lbl);
  // flag window: green when OK, red when tripped
  const flagMat = new THREE.MeshStandardMaterial({ color: 0x1fa34a, emissive: 0x1fa34a, emissiveIntensity: 0.25, roughness: 0.4 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.06), flagMat); flag.rotation.x = -Math.PI / 2; flag.position.set(0, 0.4615, -0.13); g.add(flag);
  // toggle lever on a pivot
  const pivot = new THREE.Group(); pivot.position.set(0, 0.5, 0.04); g.add(pivot);
  const lever = mesh(rbox(0.1, 0.14, 0.05, 0.02), M.plastic(0x1b1c1f, 0.35)); lever.position.y = 0.07; pivot.add(lever);
  // supply cable into the board edge
  const cab = createCable('black', 24, 8);
  cab.userData.setPath({ p0: new THREE.Vector3(0.17, 0.12, 0.1), d0: new THREE.Vector3(1, 0, 0), p1: new THREE.Vector3(0.62, 0.03, 0.25), d1: new THREE.Vector3(-1, 0, 0), h0: 0.2, h1: 0.2, sag: 0.08, ground: () => 0 });
  g.add(cab);
  bakeStatic(g, [pivot, flag]);
  const sh = contactShadow(0.7, 0.9, 0.45); g.add(sh);
  let tripped = false, ang = -0.5, flash = 0;
  return {
    group: g,
    setTripped(t) {
      tripped = t;
      flagMat.color.set(t ? 0xd23a2a : 0x1fa34a); flagMat.emissive.set(t ? 0xff3a20 : 0x1fa34a);
    },
    update(dt) {
      const target = tripped ? 0.6 : -0.5;
      ang += (target - ang) * (1 - Math.exp(-dt * 14));
      pivot.rotation.x = ang;
      flash += dt;
      flagMat.emissiveIntensity = tripped ? 0.8 + 0.6 * Math.max(0, Math.sin(flash * 6)) : 0.25;
    },
  };
}

export function createBenchSet(g: GridSize, quality: QualityTier): BenchSet {
  const root = new THREE.Group();
  root.name = 'benchSet';
  const panelW = g.cols - 1 + 1.15, panelD = g.rows - 1 + 1.15;
  const benchW = Math.max(10, panelW + 5), benchD = Math.max(11, panelD + 7.6);
  // the bench top sits a little forward so there is room in front for meters
  const benchZ = benchD / 2 - 2.65; // back edge stays put; the top runs well forward so phones never see past its front edge
  const thick = 0.3;
  const nPlanks = Math.round(benchD / 0.8);
  const pd = benchD / nPlanks;
  for (let i = 0; i < nPlanks; i++) {
    const p = plank(benchW, thick, pd - 0.012, i + 1);
    p.position.set(((i * 0.173) % 0.06) - 0.03, BENCH_Y - thick / 2, benchZ - benchD / 2 + pd * (i + 0.5));
    root.add(p);
  }
  // front apron and legs hint (seen from low angles)
  const apron = mesh(rbox(benchW - 0.3, 0.5, 0.12, 0.02), M.timber('dark')); apron.position.set(0, BENCH_Y - thick - 0.25, benchZ + benchD / 2 - 0.25); root.add(apron);

  // pegboard wall behind the bench
  const wallTex = pegboardTexture(); wallTex.repeat.set(benchW / 2.2, 2.2);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(benchW + 6, 5), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 }));
  wall.position.set(0, 2.2, benchZ - benchD / 2 - 0.05); wall.receiveShadow = true; root.add(wall);
  const rail = mesh(rbox(benchW, 0.12, 0.08, 0.02), M.timber('dark')); rail.position.set(0, 0.06 + BENCH_Y, benchZ - benchD / 2 + 0.02); root.add(rail);

  // raised circuit panel
  const panel = mesh(rbox(panelW, 0.05, panelD, 0.02, 3), M.phenolic()); panel.position.y = -0.025; root.add(panel);
  const printed = new THREE.Mesh(new THREE.PlaneGeometry(panelW - 0.03, panelD - 0.03), new THREE.MeshPhysicalMaterial({ map: panelTexture(g, panelW - 0.03, panelD - 0.03), roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.45 }));
  printed.rotation.x = -Math.PI / 2; printed.position.y = 0.0006; printed.receiveShadow = true; root.add(printed);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const s = screw(0.03, 0.012, M.brass()); s.position.set(sx * (panelW / 2 - 0.09), 0, sz * (panelD / 2 - 0.09)); root.add(s); }
  const pshadow = contactShadow(panelW + 0.5, panelD + 0.5, quality === 'low' ? 0.55 : 0.35); pshadow.position.y = BENCH_Y + 0.002; root.add(pshadow);

  // posts (instanced: 3 draws for the whole grid)
  const n = g.cols * g.rows;
  const pg = postGeometries();
  const mats = [M.brass(), M.brassKnurl(), M.darkSteel()];
  const posts = [pg.body, pg.cap, pg.socket].map((geo, i) => {
    const im = new THREE.InstancedMesh(geo, mats[i], n);
    im.castShadow = i < 2; im.receiveShadow = true;
    im.userData.shared = false;
    const m4 = new THREE.Matrix4();
    for (let id = 0; id < n; id++) { const [x, z] = postXZ(g, id); m4.makeRotationY((id * 1.7) % (Math.PI / 3)); m4.setPosition(x, 0, z); im.setMatrixAt(id, m4); }
    im.instanceMatrix.needsUpdate = true;
    root.add(im);
    return im;
  });

  // props, kept to the back and sides
  const v = vice(); v.position.set(-benchW / 2 + 0.9, BENCH_Y, benchZ - benchD / 2 + 0.6); v.rotation.y = 0.25; root.add(v);
  const dr = drawers(); dr.position.set(benchW / 2 - 1.05, BENCH_Y, benchZ - benchD / 2 + 0.5); dr.rotation.y = -0.2; root.add(dr);
  const coil = coiledLead(); coil.position.set(panelW / 2 + 1.25, BENCH_Y, -panelD / 2 + 0.2); root.add(coil);
  const prot = protectorModule(); prot.group.position.set(-panelW / 2 - 0.55, BENCH_Y, -panelD / 2 + 0.55); root.add(prot.group);

  bakeStatic(root, [...posts, prot.group]);
  const ground = (x: number, z: number) => (Math.abs(x) < panelW / 2 && Math.abs(z) < panelD / 2 ? 0 : BENCH_Y);
  return { root, panelW, panelD, benchW, benchD, ground, posts, protector: prot, meterRowZ: panelD / 2 + 0.6 };
}
