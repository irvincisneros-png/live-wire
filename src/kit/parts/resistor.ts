// Axial resistor with a correct 4-band colour code, on a small phenolic carrier with terminal screws and a paper value tag.
import * as THREE from 'three';
import * as M from '../materials';
import { canvas } from '../textures';
import { DIM, bakeStatic, heatShell, lugs, mesh, rbox, screw, setHeat, sharedGeo } from './common';

const BAND = ['#111111', '#7a4a21', '#c8261d', '#e8761c', '#f2d21b', '#2d9a3e', '#2453c2', '#7b3fb5', '#8d8d8d', '#f4f4f4'];
const GOLD = '#c9a13b', SILVER = '#c7c9cc';

/** 4-band code: [digit1, digit2, multiplier, tolerance] as CSS colours (tolerance gold ±5 %) */
export function colourBands(ohms: number): string[] {
  if (!(ohms > 0)) return [BAND[0], BAND[0], BAND[0], GOLD];
  let e = Math.floor(Math.log10(ohms)) - 1;
  let two = Math.round(ohms / Math.pow(10, e));
  if (two >= 100) { two = Math.round(two / 10); e += 1; }
  if (two < 10) { two *= 10; e -= 1; }
  const d1 = Math.floor(two / 10), d2 = two % 10;
  const mult = e === -1 ? GOLD : e === -2 ? SILVER : BAND[Math.min(9, Math.max(0, e))];
  return [BAND[d1], BAND[d2], mult, GOLD];
}

export const formatOhms = (r: number): string => (r >= 1000 ? `${+(r / 1000).toFixed(2)} kΩ` : `${+r.toFixed(r < 10 ? 1 : 0)} Ω`);

function bodyTexture(ohms: number): THREE.CanvasTexture {
  // canvas y runs along the body (top = +x end); bands placed toward the a end as usual, tolerance band apart
  const [c, ctx] = canvas(64, 256);
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, '#b8a07a'); g.addColorStop(0.5, '#dcc59c'); g.addColorStop(1, '#b8a07a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  const bands = colourBands(ohms);
  const ys = [196, 168, 140, 58];
  bands.forEach((b, i) => { ctx.fillStyle = b; ctx.fillRect(0, ys[i] - 11, 64, 20); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function tagTexture(text: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 112);
  ctx.fillStyle = '#f3ecd8'; ctx.fillRect(0, 0, 256, 112);
  ctx.strokeStyle = 'rgba(120,100,70,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(6, 6, 244, 100);
  ctx.fillStyle = '#1c1e26'; ctx.font = '800 58px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export interface ResistorModel extends THREE.Group { userData: { update(s: { power?: number }, dt: number): void; flowPath: { pts: THREE.Vector3[]; u: number[] }; hotSpot: THREE.Vector3 } }

export function createResistor(ohms: number, mystery = false, label?: string): ResistorModel {
  const g = new THREE.Group() as unknown as ResistorModel;
  const carrier = mesh(rbox(0.6, 0.045, 0.24, 0.016, 3), M.plastic(0x3a2a1c, 0.5)); carrier.position.y = 0.0225; g.add(carrier);
  for (const s of [-1, 1]) { const sc = screw(0.022, 0.016, M.brass()); sc.position.set(s * 0.22, 0.045, 0); g.add(sc); }
  g.add(lugs(0.3, 0.045));
  for (const s of [-1, 1]) { const st = mesh(rbox(0.09, 0.006, 0.028, 0.003), M.brass()); st.position.set(s * 0.26, 0.047, 0); g.add(st); }
  // body: lathe with end bulges, mysteries get a plain grey body (no bands)
  const Y = 0.11, L = 0.26;
  const bodyGeo = sharedGeo('res-body', () => {
    const p: THREE.Vector2[] = [];
    const prof = [[0, 0], [0.018, 0.002], [0.034, 0.012], [0.038, 0.035], [0.033, 0.06], [0.031, 0.09], [0.031, L - 0.09], [0.033, L - 0.06], [0.038, L - 0.035], [0.034, L - 0.012], [0.018, L - 0.002], [0, L]];
    for (const [r, y] of prof) p.push(new THREE.Vector2(r, y - L / 2));
    return new THREE.LatheGeometry(p, 32).rotateZ(-Math.PI / 2).rotateX(Math.PI);
  });
  const bodyMat = mystery
    ? new THREE.MeshPhysicalMaterial({ color: 0x5a5f66, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 })
    : new THREE.MeshPhysicalMaterial({ map: bodyTexture(ohms), roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3 });
  const body = mesh(bodyGeo, bodyMat); body.position.y = Y; g.add(body);
  // tinned leads bending down to the screws
  for (const s of [-1, 1]) {
    const pts = [new THREE.Vector3(s * (L / 2 - 0.005), Y, 0), new THREE.Vector3(s * 0.19, Y, 0), new THREE.Vector3(s * 0.215, Y - 0.025, 0), new THREE.Vector3(s * 0.22, 0.062, 0)];
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 16, 0.006, 6), M.nickel(), false));
  }
  const sh = heatShell(bodyGeo, 1.12); sh.position.y = Y; g.add(sh);
  // paper tag lying on the carrier in front
  const tagText = mystery ? '?' : (label ? `${label}  ${formatOhms(ohms)}` : formatOhms(ohms));
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0875), new THREE.MeshStandardMaterial({ map: tagTexture(tagText), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2 }));
  tag.rotation.x = -Math.PI / 2 + 0.03; tag.position.set(0, 0.0465, 0.075);
  g.add(tag);
  bakeStatic(g, [sh]);
  let heat = 0;
  const pts = [[-0.5, DIM.lugY], [-0.3, 0.05], [-0.22, 0.07], [-0.19, Y], [-L / 2, Y], [-L / 4, Y], [0, Y], [L / 4, Y], [L / 2, Y], [0.19, Y], [0.22, 0.07], [0.3, 0.05], [0.5, DIM.lugY]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  g.userData = {
    flowPath: { pts, u: [0, 0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1, 1] },
    hotSpot: new THREE.Vector3(0, Y, 0),
    update(s, dt) {
      const target = Math.min(1, Math.max(0, (s.power ?? 0) / 6));
      heat += (target - heat) * (1 - Math.exp(-dt * 1.5));
      setHeat(sh, heat * 0.6);
    },
  };
  g.name = 'resistor';
  return g;
}
