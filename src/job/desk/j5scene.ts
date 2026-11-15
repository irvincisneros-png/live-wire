// Job 5 scene: a house with a north-facing roof, panels that appear as PV size grows, a wall battery, a street pole and a sun that crosses the sky.
// 1 unit = 1 metre. North is +z (towards the camera). The sun arc is a stylised diorama arc so it stays in frame.
import * as THREE from 'three';
import * as M from '../../kit/materials';
import { canvas, glowTexture } from '../../kit/textures';
import { createStage, type KitStage } from '../../kit/stage';
import { disposeTree } from '../../kit/dispose';
import { mesh, rbox } from '../../kit/parts/common';
import type { QualityTier } from '../../types';
import type { SolarResult } from '../../sim/solar';
import { PANELS_PER_KW, flowsAt, modulesFor } from './j5logic';
import { smoothstep } from './maths';
import { approach, createLabelLayer, curveThrough, PacketStream } from './scene';

export const FLOW_COLOURS = {
  pvToHouse: 0xffc933, pvToBattery: 0xb6e34a, batteryToHouse: 0x2fd6b4, pvToGrid: 0xb58cff, gridToHouse: 0x5ea8ff,
} as const;
export const FLOW_LABELS: Record<keyof typeof FLOW_COLOURS, string> = {
  pvToHouse: 'Solar to house', pvToBattery: 'Solar to battery', batteryToHouse: 'Battery to house', pvToGrid: 'Solar to grid', gridToHouse: 'Grid to house',
};
type FlowKey = keyof typeof FLOW_COLOURS;

export interface J5Scene {
  stage: KitStage;
  /** how many panels and battery modules are shown */
  setDesign(pvKW: number, batteryKWh: number): void;
  /** time of day 0..24 and the hour's flows (res null = nothing flowing) */
  setTime(hour: number, res: SolarResult | null): void;
  dispose(): void;
}

const ROOF_A = Math.atan2(2.3, 4.6);
const RIDGE_Y = 5.2, WALL_H = 3.0;
const COLS = 7, ROWS = 3;
const PANEL_W = 1.7, PANEL_H = 1.0, GAP = 0.08;

function panelTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(340, 200);
  const g = ctx.createLinearGradient(0, 0, 340, 200);
  g.addColorStop(0, '#16296b'); g.addColorStop(1, '#0c1a45');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 340, 200);
  ctx.strokeStyle = 'rgba(190,205,235,0.55)'; ctx.lineWidth = 1.2;
  const cols = 10, rows = 6;
  for (let i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo((340 / cols) * i, 0); ctx.lineTo((340 / cols) * i, 200); ctx.stroke(); }
  for (let j = 1; j < rows; j++) { ctx.beginPath(); ctx.moveTo(0, (200 / rows) * j); ctx.lineTo(340, (200 / rows) * j); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(220,230,250,0.35)'; ctx.lineWidth = 0.7;
  for (let i = 0; i < cols; i++) for (const f of [0.35, 0.65]) { const x = (340 / cols) * (i + f); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 200); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function roofTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#4b5056'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) {
    const x = i * 16;
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, '#5d636a'); g.addColorStop(0.45, '#3e4348'); g.addColorStop(0.55, '#3a3f44'); g.addColorStop(1, '#565c62');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 16, 128);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1); t.anisotropy = 4; return t;
}

export function createJ5Scene(view: HTMLElement, quality: QualityTier): J5Scene {
  const stage = createStage(view, quality, { mood: 'outdoor', target: [1.5, 3.0, 1], distance: 33, yaw: 0.55, pitch: 0.3, minDistance: 12, maxDistance: 55 });
  const scene = stage.scene;
  const fog = scene.fog as THREE.Fog;
  fog.near = 58; fog.far = 135;
  const root = new THREE.Group(); scene.add(root);
  const sc = stage.keyLight.shadow.camera as THREE.OrthographicCamera;
  sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 80; sc.updateProjectionMatrix();

  // lights we dim with the day (everything but the key light)
  const others: { l: THREE.Light; base: number }[] = [];
  scene.traverse((o) => { const l = o as THREE.Light; if (l.isLight && l !== stage.keyLight) others.push({ l, base: l.intensity }); });
  const envBase = scene.environmentIntensity, keyBase = stage.keyLight.intensity;
  const moon = new THREE.DirectionalLight(0x8fb0ff, 0); moon.userData.noDim = true; scene.add(moon, moon.target);

  // ── sky dome, stars, sun, moon ──
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3a82d0) }, horizon: { value: new THREE.Color(0xb9d8ee) }, glow: { value: new THREE.Color(0xff9a55) }, glowAmt: { value: 0 }, glowDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform float glowAmt; uniform vec3 glowDir; varying vec3 vD; void main(){ float h = clamp(vD.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.55)); float g = pow(max(dot(normalize(vec3(vD.x, 0.0, vD.z)), glowDir), 0.0), 3.0) * (1.0 - pow(h, 0.5)); c = mix(c, glow, clamp(g * glowAmt, 0.0, 1.0)); if (vD.y < 0.0) c = horizon; gl_FragColor = vec4(c, 1.0); }',
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 20), skyMat); dome.renderOrder = -10; dome.frustumCulled = false; root.add(dome);
  scene.background = new THREE.Color(0x9ec6e6);
  const starGeo = new THREE.BufferGeometry();
  const sp: number[] = [];
  for (let i = 0; i < 420; i++) { const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 0.95 + 0.05); sp.push(Math.cos(u) * Math.sin(v) * 62, Math.cos(v) * 62, Math.sin(u) * Math.sin(v) * 62); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.0, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false; root.add(stars);
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe9a8).multiplyScalar(2.2), toneMapped: false, fog: false });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 16), sunMat); root.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd98a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  sunGlow.scale.set(16, 16, 1); sun.add(sunGlow);
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 14), new THREE.MeshBasicMaterial({ color: 0xdfe6f5, toneMapped: false, fog: false })); root.add(moonMesh);

  // ── ground, road, trees ──
  const grassTex = canvas(256, 256);
  grassTex[1].fillStyle = '#6c8a47'; grassTex[1].fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { grassTex[1].fillStyle = `rgba(${70 + Math.random() * 40},${110 + Math.random() * 50},${50 + Math.random() * 30},0.55)`; grassTex[1].fillRect(Math.random() * 256, Math.random() * 256, 2, 4); }
  for (let i = 0; i < 60; i++) { const gx = Math.random() * 256, gy = Math.random() * 256, gr = 14 + Math.random() * 34; const gg2 = grassTex[1].createRadialGradient(gx, gy, 0, gx, gy, gr); const dk = Math.random() < 0.5; gg2.addColorStop(0, dk ? 'rgba(52,84,38,0.28)' : 'rgba(140,168,84,0.22)'); gg2.addColorStop(1, 'rgba(0,0,0,0)'); grassTex[1].fillStyle = gg2; grassTex[1].fillRect(gx - gr, gy - gr, gr * 2, gr * 2); }
  const gt = new THREE.CanvasTexture(grassTex[0]); gt.colorSpace = THREE.SRGBColorSpace; gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(11, 11); gt.anisotropy = 4;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(6, 160), new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.9 })); road.rotation.x = -Math.PI / 2; road.position.set(17, 0.02, 0); road.receiveShadow = true; root.add(road);
  for (let i = -8; i < 8; i++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2), new THREE.MeshBasicMaterial({ color: 0xe8e4d0 })); d.rotation.x = -Math.PI / 2; d.position.set(17, 0.03, i * 4.5); root.add(d); }
  const kerb = mesh(rbox(0.3, 0.12, 160, 0.03), new THREE.MeshStandardMaterial({ color: 0xb4b0a6, roughness: 0.9 })); kerb.position.set(13.9, 0.06, 0); root.add(kerb);
  const path = mesh(rbox(2.2, 0.06, 9, 0.02), new THREE.MeshStandardMaterial({ color: 0xbdb8ad, roughness: 0.9 })); path.position.set(-1.7, 0.03, 9.2); root.add(path);
  const drive = mesh(rbox(3.6, 0.06, 9, 0.02), new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.95 })); drive.position.set(3.6, 0.03, 9.2); root.add(drive);
  // deterministic scatter so the yard looks the same every visit
  let rs = 7;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const leafMats = [0x3d7436, 0x4b8a42, 0x33652f, 0x5a9648].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x57432f, roughness: 1 });
  const blob = (r: number, mat: THREE.Material) => {
    const g = new THREE.SphereGeometry(r, 14, 10);
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pa.count; k++) { const f = 1 + (Math.sin(pa.getX(k) * 7.1 + pa.getY(k) * 5.3) + Math.sin(pa.getZ(k) * 6.7)) * 0.045; pa.setXYZ(k, pa.getX(k) * f, pa.getY(k) * f, pa.getZ(k) * f); }
    g.computeVertexNormals();
    return mesh(g, mat);
  };
  const tree = (x: number, z: number, s: number) => {
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.11 * s, 0.24 * s, 2.3 * s, 10), barkMat); trunk.position.y = 1.15 * s; t.add(trunk);
    for (const a of [0.6, 2.7, 4.6]) { const br = mesh(new THREE.CylinderGeometry(0.05 * s, 0.09 * s, 1.1 * s, 6), barkMat); br.position.set(Math.cos(a) * 0.35 * s, 2.3 * s, Math.sin(a) * 0.35 * s); br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); t.add(br); }
    for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2, rr = (k === 0 ? 0 : 0.5 + rnd() * 0.75) * s;
      const f = blob((0.75 + rnd() * 0.55) * s, leafMats[Math.floor(rnd() * leafMats.length)]);
      f.position.set(Math.cos(a) * rr, (2.6 + rnd() * 1.3 + (k === 0 ? 0.5 : 0)) * s, Math.sin(a) * rr); f.scale.y = 0.8 + rnd() * 0.25; t.add(f);
    }
    t.position.set(x, 0, z); t.rotation.y = rnd() * 6; root.add(t);
  };
  tree(-11, 7, 1.3); tree(-9, -7, 1.2); tree(10, -8, 1.4); tree(-14.5, 0, 1.05);
  tree(-3, -13, 1.7); tree(4.5, -14, 1.5); tree(-17, -11, 1.5); tree(-20, 6, 1.3); tree(11, -17, 1.6); tree(-10, -18, 1.4);
  // garden bed and shrubs along the front wall, a clipped hedge on the street boundary, a letterbox
  const soil = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 });
  for (const [bx, bw] of [[-4.4, 3.4], [2.9, 6.0]] as const) { const bed = mesh(rbox(bw, 0.12, 0.9, 0.05), soil); bed.position.set(bx, 0.06, 4.75); root.add(bed); }
  for (const sx of [-5.6, -4.6, -3.5, 0.4, 1.5, 2.6, 3.6, 4.7, 5.5]) { const sh = blob(0.34 + rnd() * 0.16, leafMats[Math.floor(rnd() * leafMats.length)]); sh.position.set(sx, 0.36, 4.75 + (rnd() - 0.5) * 0.2); sh.scale.y = 0.85; root.add(sh); }
  for (const fx of [-4.9, 1.0, 4.2]) { const fl = mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: fx > 2 ? 0xf2c14e : 0xe8719a, roughness: 0.7 }), false); fl.position.set(fx, 0.72, 4.95); root.add(fl); }
  const hedgeMat = leafMats[2];
  for (const [hx, hw] of [[-9.6, 13.2], [0.55, 1.5], [9.55, 7.9]] as const) { const hd = mesh(rbox(hw, 0.85, 0.75, 0.3, 4), hedgeMat); hd.position.set(hx, 0.42, 13.4); root.add(hd); }
  const hedgeW = mesh(rbox(0.75, 0.85, 26, 0.3, 4), hedgeMat); hedgeW.position.set(-16.2, 0.42, 0.6); root.add(hedgeW);
  const lbPost = mesh(rbox(0.1, 1.0, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.6 })); lbPost.position.set(1.55, 0.5, 13.9); root.add(lbPost);
  const lbBox = mesh(rbox(0.42, 0.26, 0.26, 0.05), new THREE.MeshStandardMaterial({ color: 0x9c2f2a, roughness: 0.45 })); lbBox.position.set(1.55, 1.1, 13.9); root.add(lbBox);
  const verge = mesh(rbox(0.9, 0.05, 160, 0.02), new THREE.MeshStandardMaterial({ color: 0xbdb8ad, roughness: 0.92 })); verge.position.set(15.1, 0.03, 0); root.add(verge);

  // ── house ──
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xeee6d6, roughness: 0.92 });
  const body = mesh(rbox(12, WALL_H, 8, 0.04), wallMat); body.position.set(0, WALL_H / 2, 0); root.add(body);
  const gable = new THREE.Shape(); gable.moveTo(-4.2, WALL_H); gable.lineTo(4.2, WALL_H); gable.lineTo(0, RIDGE_Y); gable.closePath();
  const gg = new THREE.ExtrudeGeometry(gable, { depth: 11.8, bevelEnabled: false }); gg.rotateY(-Math.PI / 2); gg.translate(5.9, 0, 0);
  const prism = mesh(gg, wallMat); root.add(prism);
  const L = Math.hypot(4.6, 2.3);
  const roofTex = roofTexture();
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.55, metalness: 0.3 });
  for (const side of [1, -1]) {
    const r = mesh(rbox(13.2, 0.14, L, 0.03), roofMat);
    r.position.set(0, RIDGE_Y - (L / 2) * Math.sin(ROOF_A) - 0.06, side * (L / 2) * Math.cos(ROOF_A));
    r.rotation.x = side * ROOF_A; root.add(r);
  }
  const ridge = mesh(rbox(13.3, 0.2, 0.34, 0.05), new THREE.MeshStandardMaterial({ color: 0x35393d, roughness: 0.5, metalness: 0.4 })); ridge.position.set(0, RIDGE_Y + 0.02, 0); root.add(ridge);
  const fascia = mesh(rbox(13.2, 0.14, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.6 })); fascia.position.set(0, 2.84, 4.58); root.add(fascia);
  const plinth = mesh(rbox(12.1, 0.3, 8.1, 0.04), new THREE.MeshStandardMaterial({ color: 0xa7a197, roughness: 0.95 })); plinth.position.y = 0.15; root.add(plinth);
  const gutter = mesh(rbox(13.3, 0.12, 0.14, 0.04), new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.5 })); gutter.position.set(0, 2.76, 4.66); root.add(gutter);
  const downpipe = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.5 })); downpipe.position.set(-5.85, 1.45, 4.1); root.add(downpipe);
  const awning = mesh(rbox(2.2, 0.08, 1.3, 0.03), new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.5, metalness: 0.3 })); awning.position.set(-1.7, 2.52, 4.6); awning.rotation.x = 0.16; root.add(awning);
  for (const px of [-2.7, -0.7]) { const post = mesh(rbox(0.09, 2.3, 0.09, 0.02), new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.6 })); post.position.set(px, 1.25, 5.15); root.add(post); }
  // windows and door on the north wall
  const winGlass: THREE.MeshStandardMaterial[] = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.45 });
  const addWindow = (x: number, y: number, w: number, hgt: number, wall: 'n' | 'e') => {
    const g = new THREE.Group();
    const fr = mesh(rbox(w + 0.2, hgt + 0.2, 0.1, 0.03), frameMat); g.add(fr);
    const gm = new THREE.MeshStandardMaterial({ color: 0x8fb4cf, roughness: 0.06, metalness: 0.2, emissive: 0xffc477, emissiveIntensity: 0 });
    winGlass.push(gm);
    const gl = mesh(rbox(w, hgt, 0.04, 0.01), gm, false); gl.position.z = 0.04; g.add(gl);
    const bar = mesh(rbox(0.05, hgt, 0.05, 0.01), frameMat, false); bar.position.z = 0.07; g.add(bar);
    const bar2 = mesh(rbox(w, 0.05, 0.05, 0.01), frameMat, false); bar2.position.z = 0.07; g.add(bar2);
    const sill = mesh(rbox(w + 0.4, 0.08, 0.22, 0.02), frameMat); sill.position.set(0, -hgt / 2 - 0.14, 0.08); g.add(sill);
    g.position.set(x, y, 4.0 + 0.04);
    if (wall === 'e') { g.rotation.y = Math.PI / 2; g.position.set(6.04, y, x); }
    root.add(g);
  };
  addWindow(-4.1, 1.7, 1.9, 1.2, 'n'); addWindow(1.4, 1.7, 2.2, 1.2, 'n'); addWindow(4.3, 1.7, 1.5, 1.2, 'n');
  addWindow(-1.5, 1.6, 1.6, 1.1, 'e');
  const door = mesh(rbox(1.0, 2.1, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0x3f5f4e, roughness: 0.5 })); door.position.set(-1.7, 1.05 + 0.15, 4.05); root.add(door);
  const knob = mesh(new THREE.SphereGeometry(0.05, 10, 8), M.brass()); knob.position.set(-1.35, 1.2, 4.12); root.add(knob);
  const step = mesh(rbox(1.6, 0.12, 0.6, 0.03), new THREE.MeshStandardMaterial({ color: 0xb9b4a9, roughness: 0.9 })); step.position.set(-1.7, 0.06, 4.35); root.add(step);

  // ── panels ──
  const panelTex = panelTexture();
  const glassMat = new THREE.MeshPhysicalMaterial({ map: panelTex, roughness: 0.14, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.35, metalness: 1 });
  interface Slot { g: THREE.Group; k: number }
  const slots: Slot[] = [];
  const totalSlots = COLS * ROWS;
  const order: [number, number][] = [];
  for (let row = 0; row < ROWS; row++) {
    const cs = Array.from({ length: COLS }, (_, i) => i).sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3) || a - b);
    for (const c of cs) order.push([row, c]);
  }
  for (let n = 0; n < totalSlots; n++) {
    const [row, col] = order[n];
    const g = new THREE.Group();
    const frame = mesh(rbox(PANEL_W, 0.05, PANEL_H, 0.015), alu); g.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W - 0.08, PANEL_H - 0.08), glassMat); face.rotation.x = -Math.PI / 2; face.position.y = 0.028; face.receiveShadow = true; g.add(face);
    const sCenter = 0.75 + PANEL_H / 2 + row * (PANEL_H + GAP);
    const x = (col - (COLS - 1) / 2) * (PANEL_W + GAP);
    const nrm = new THREE.Vector3(0, Math.cos(ROOF_A), Math.sin(ROOF_A));
    const pos = new THREE.Vector3(x, RIDGE_Y - sCenter * Math.sin(ROOF_A) + 0.02, sCenter * Math.cos(ROOF_A)).addScaledVector(nrm, 0.07);
    g.position.copy(pos); g.rotation.x = ROOF_A;
    g.scale.setScalar(0.001); g.visible = false;
    root.add(g);
    slots.push({ g, k: 0 });
  }
  const panelCentre = new THREE.Vector3(0, RIDGE_Y - 2.2 * Math.sin(ROOF_A) + 0.3, 2.2 * Math.cos(ROOF_A));
  let panelTarget = 0;

  // ── meter box, inverter, battery on the west wall ──
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf1f1ee, roughness: 0.3, clearcoat: 0.6 });
  const meterBox = mesh(rbox(0.16, 0.7, 0.5, 0.04), new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.5 })); meterBox.position.set(6.1, 2.0, 2.2); root.add(meterBox);
  const mdial = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24).rotateZ(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xf7f7f4, roughness: 0.2, clearcoat: 1 }), false); mdial.position.set(6.2, 2.08, 2.2); root.add(mdial);
  const inverter = mesh(rbox(0.16, 0.62, 0.42, 0.04), white); inverter.position.set(6.1, 1.2, 3.2); root.add(inverter);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x103018, emissive: 0x4cf08a, emissiveIntensity: 1.5 });
  const iled = mesh(new THREE.SphereGeometry(0.025, 8, 8), ledMat, false); iled.position.set(6.2, 1.4, 3.2); root.add(iled);
  const conduit = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 8), new THREE.MeshStandardMaterial({ color: 0x8a8f95, roughness: 0.5 }), false); conduit.position.set(6.08, 2.1, 3.6); root.add(conduit);
  const battery = new THREE.Group(); battery.position.set(6.08, 0.35, -0.4); root.add(battery);
  const modLed: THREE.MeshStandardMaterial[] = [];
  const mods: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Group();
    const bodyM = mesh(rbox(0.18, 0.34, 0.9, 0.05, 3), white); m.add(bodyM);
    const lm = new THREE.MeshStandardMaterial({ color: 0x0a1a14, emissive: 0x3cf0a8, emissiveIntensity: 0 });
    modLed.push(lm);
    const strip = mesh(rbox(0.012, 0.035, 0.7, 0.006), lm, false); strip.position.set(0.096, 0, 0); m.add(strip);
    m.position.y = 0.17 + i * 0.37;
    m.visible = false; battery.add(m); mods.push(m);
  }
  const cap = mesh(rbox(0.2, 0.05, 0.94, 0.02), new THREE.MeshStandardMaterial({ color: 0x33373c, roughness: 0.5 })); cap.visible = false; battery.add(cap);
  let modCount = 0, socShown = 0, socCap = 0;

  // ── street pole and service line ──
  const poleBase = new THREE.Vector3(12.2, 0, 3.6);
  const pole = mesh(new THREE.CylinderGeometry(0.15, 0.22, 9, 12), new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 1 })); pole.position.copy(poleBase).setY(4.5); root.add(pole);
  const arm = mesh(rbox(2.4, 0.14, 0.14, 0.03), new THREE.MeshStandardMaterial({ color: 0x6b5d4b, roughness: 1 })); arm.position.copy(poleBase).setY(8.55); root.add(arm);
  for (const dx of [-0.9, 0, 0.9]) { const ins = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 10), M.ceramic()); ins.position.copy(poleBase).add(new THREE.Vector3(dx, 8.7, 0)); root.add(ins); }
  const tx = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 20), new THREE.MeshStandardMaterial({ color: 0x7d868e, roughness: 0.45, metalness: 0.6 })); tx.position.copy(poleBase).add(new THREE.Vector3(0.5, 7.4, 0)); root.add(tx);
  const poleTop = poleBase.clone().add(new THREE.Vector3(0, 8.8, 0));
  const meterPt = new THREE.Vector3(6.2, 2.2, 2.7);
  const wire: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; wire.push(new THREE.Vector3().lerpVectors(poleTop, meterPt, t).add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * 1.3, 0))); }
  const wireCurve = curveThrough(wire, 0.5);
  const wireMesh = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 40, 0.025, 6), new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.6 })); root.add(wireMesh);
  const wire2 = new THREE.Mesh(new THREE.TubeGeometry(curveThrough(wire.map((p, i) => p.clone().add(new THREE.Vector3(i === wire.length - 1 ? 0 : -0.7, 0, i === wire.length - 1 ? 0 : 0))), 0.5), 40, 0.02, 6), new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.6 })); root.add(wire2);

  // ── energy packet streams ──
  const hubFor = (off: number) => new THREE.Vector3(6.35, 2.25 + off, 2.5 + off * 0.4);
  const houseIn = new THREE.Vector3(4.6, 1.5, 2.2);
  const battPt = new THREE.Vector3(6.3, 1.0, -0.4);
  const roofEdge = new THREE.Vector3(5.2, 3.1, 4.9);
  const flows: Record<FlowKey, THREE.CatmullRomCurve3> = {
    pvToHouse: curveThrough([panelCentre.clone().add(new THREE.Vector3(0.5, 0, 0.3)), roofEdge.clone().add(new THREE.Vector3(0.2, 0.2, 0.1)), new THREE.Vector3(6.4, 2.9, 3.6), hubFor(0.15), new THREE.Vector3(5.5, 1.9, 2.4), houseIn]),
    pvToBattery: curveThrough([panelCentre.clone().add(new THREE.Vector3(1.2, 0, 0.3)), roofEdge.clone().add(new THREE.Vector3(0.6, 0.0, 0.3)), new THREE.Vector3(6.55, 2.7, 3.4), hubFor(-0.05), new THREE.Vector3(6.5, 1.6, 0.8), battPt]),
    batteryToHouse: curveThrough([battPt.clone().add(new THREE.Vector3(0.1, 0.35, 0)), new THREE.Vector3(6.55, 1.7, 1.0), hubFor(0.0), new THREE.Vector3(5.6, 1.9, 2.0), houseIn.clone().add(new THREE.Vector3(0, 0.1, -0.5))]),
    pvToGrid: curveThrough([panelCentre.clone().add(new THREE.Vector3(1.8, 0, 0.3)), roofEdge.clone().add(new THREE.Vector3(1.1, 0.0, 0.5)), new THREE.Vector3(6.7, 2.7, 3.8), hubFor(0.25), meterPt.clone().add(new THREE.Vector3(0.1, 0.3, 0.1)), ...wire.slice(1).map((p) => p.clone().add(new THREE.Vector3(0, 0.06, 0)))]),
    gridToHouse: curveThrough([...wire.slice().reverse().slice(0, -1).map((p) => p.clone().add(new THREE.Vector3(0, -0.06, 0))), meterPt.clone().add(new THREE.Vector3(0.1, -0.2, -0.1)), hubFor(-0.2), new THREE.Vector3(5.5, 1.8, 2.3), houseIn.clone().add(new THREE.Vector3(0, -0.2, 0.4))]),
  };
  const streams = {} as Record<FlowKey, PacketStream>;
  const target = {} as Record<FlowKey, number>;
  for (const k of Object.keys(flows) as FlowKey[]) {
    const ps = new PacketStream(flows[k], FLOW_COLOURS[k], { max: 34, size: 0.17, boost: 3 });
    ps.speed = k === 'pvToGrid' || k === 'gridToHouse' ? 0.1 : 0.16;
    root.add(ps.mesh); streams[k] = ps; target[k] = 0;
  }

  // ── labels ──
  const labels = createLabelLayer(view, stage);
  const mkLabel = (cls = '') => { const el = document.createElement('div'); el.className = `dk-plate dk-plate--zone j5-tag ${cls}`; return el; };
  const lPanels = mkLabel(), lBattery = mkLabel(), lGrid = mkLabel();
  lGrid.textContent = 'Grid';
  labels.add(lPanels, () => panelCentre.clone().add(new THREE.Vector3(0, 1.2, 0.5)));
  labels.add(lBattery, () => battery.position.clone().add(new THREE.Vector3(0.3, modCount * 0.37 + 0.5, 0)));
  labels.add(lGrid, () => poleTop.clone().add(new THREE.Vector3(0, 0.5, 0)));
  const sunLabel = mkLabel('j5-sunlabel'); sunLabel.textContent = '';

  // ── time of day ──
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  const NIGHT_TOP = new THREE.Color(0x050914), DAY_TOP = new THREE.Color(0x3a82d0), NIGHT_H = new THREE.Color(0x141d36), DAY_H = new THREE.Color(0xa6cdf0);
  let hourShown = 8, hourGoal = 8;
  let res: SolarResult | null = null;
  function applyTime(h: number): void {
    const phi = ((h - 6) / 12) * Math.PI;
    const sy = Math.sin(phi);
    const day = Math.pow(Math.max(0, Math.min(1, (sy + 0.1) * 2.6)), 0.9);
    const tw = Math.exp(-Math.pow((sy - 0.02) / 0.2, 2));
    sun.position.set(-50 * Math.cos(phi), 34 * sy + 2, -18 + 6 * sy); // far out near the sky dome, never inside the yard
    sun.visible = sy > -0.12;
    sunMat.color.set(0xffe9a8).lerp(tmpA.set(0xff9a4a), tw * 0.9).multiplyScalar(2.2);
    (sunGlow.material as THREE.SpriteMaterial).opacity = 0.35 + 0.5 * day + 0.25 * tw;
    const mphi = phi + Math.PI;
    const msy = Math.sin(mphi);
    moonMesh.position.set(-48 * Math.cos(mphi), 30 * msy + 2, -20);
    moonMesh.visible = msy > 0.05 && day < 0.5;
    skyMat.uniforms.top.value.copy(NIGHT_TOP).lerp(DAY_TOP, day);
    skyMat.uniforms.horizon.value.copy(NIGHT_H).lerp(DAY_H, day);
    skyMat.uniforms.glowAmt.value = tw * 0.95;
    (skyMat.uniforms.glowDir.value as THREE.Vector3).set(-Math.cos(phi) < 0 ? -1 : 1, 0, 0.35).normalize();
    scene.background = tmpB.copy(skyMat.uniforms.horizon.value) as THREE.Color;
    fog.color.copy(skyMat.uniforms.horizon.value as THREE.Color).lerp(tmpA.set(0xffb27a), tw * 0.12);
    // lights
    stage.keyLight.position.set(-20 * Math.cos(phi), 10 * sy, 4 + 4 * sy).multiplyScalar(1.7).add(new THREE.Vector3(0, 3, 2));
    stage.keyLight.intensity = keyBase * day * 1.15;
    stage.keyLight.color.set(0xfff1d6).lerp(tmpA.set(0xff9a55), tw * 0.8);
    stage.keyLight.castShadow = quality !== 'low' && day > 0.05;
    moon.position.set(-20 * Math.cos(mphi), 9 * msy, 3).multiplyScalar(2); moon.intensity = 0.9 * (1 - day) * (moonMesh.visible ? 1 : 0.4);
    const amb = 0.34 + 0.8 * day;
    for (const o of others) o.l.intensity = o.base * amb;
    scene.environmentIntensity = envBase * (0.3 + 0.7 * day);
    (stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - day * 3.5);
    const dark = Math.pow(1 - smoothstep(0.05, 0.55, day), 1);
    const eve = h >= 16.5 || h < 6.5 ? 1 : 0;
    for (const m of winGlass) m.emissiveIntensity = 2.4 * dark * (0.35 + 0.65 * eve) + 0.0;
  }

  // ── frame loop ──
  const off = stage.onFrame((dt) => {
    // time glides toward the goal so scrubbing looks smooth
    hourShown = approach(hourShown, hourGoal, dt, 14);
    applyTime(hourShown);
    dome.position.copy(stage.camera.position);
    // panels pop in and out
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      const goal = i < panelTarget ? 1 : 0;
      sl.k = approach(sl.k, goal, dt, 9);
      sl.g.visible = sl.k > 0.02;
      sl.g.scale.setScalar(Math.max(0.001, sl.k * (1 + 0.1 * Math.sin(Math.min(1, sl.k) * Math.PI))));
    }
    // battery modules and charge LEDs
    const f = socCap > 0 ? Math.max(0, Math.min(1, socShown / socCap)) : 0;
    for (let i = 0; i < mods.length; i++) {
      mods[i].visible = i < modCount;
      const lit = Math.max(0, Math.min(1, f * modCount - i));
      modLed[i].emissiveIntensity = 0.1 + 2.4 * lit;
    }
    cap.visible = modCount > 0; cap.position.y = modCount * 0.37 + 0.005;
    iled.visible = true;
    // packet streams
    for (const k of Object.keys(streams) as FlowKey[]) {
      streams[k].count = approach(streams[k].count, target[k], dt, 6);
      streams[k].update(dt);
    }
  });

  const fit = () => {
    const aspect = Math.max(0.5, view.clientWidth / Math.max(1, view.clientHeight));
    const d = Math.max(22, Math.min(52, 27 / (0.688 * aspect)));
    stage.setHome({ target: [1.6, 3.2, 1.5], distance: d, pitch: aspect < 1.2 ? 0.34 : 0.3, yaw: 0.55, minDistance: 12, maxDistance: 60 }, true);
  };
  const offResize = stage.onResize(fit);
  fit();
  applyTime(hourShown);

  let lastKey = '';
  return {
    stage,
    setDesign(pvKW, batteryKWh) {
      panelTarget = Math.min(totalSlots, Math.round(pvKW * PANELS_PER_KW));
      modCount = modulesFor(batteryKWh); socCap = batteryKWh;
      lPanels.textContent = pvKW > 0 ? `${pvKW} kW solar panels` : 'No solar panels';
      lBattery.textContent = batteryKWh > 0 ? `Battery ${batteryKWh} kWh` : 'No battery';
    },
    setTime(hour, r) {
      hourGoal = Math.max(0, Math.min(24, hour));
      res = r;
      if (!r) { for (const k of Object.keys(target) as FlowKey[]) target[k] = 0; socShown = 0; lastKey = ''; return; }
      const fl = flowsAt(r, Math.min(23.999, hourGoal));
      const key = `${fl.hour}`;
      if (key !== lastKey) lastKey = key;
      const c = (x: number) => (x < 0.02 ? 0 : Math.min(30, 3 + x * 9));
      target.pvToHouse = c(fl.pvToHouse); target.pvToBattery = c(fl.pvToBattery); target.batteryToHouse = c(fl.batteryToHouse);
      target.pvToGrid = c(fl.pvToGrid); target.gridToHouse = c(fl.gridToHouse);
      const prev = fl.hour > 0 ? r.hourly.soc[fl.hour - 1] : 0;
      socShown = prev + (fl.soc - prev) * (hourGoal - fl.hour);
      void res;
    },
    dispose() {
      off(); offResize(); labels.dispose();
      for (const k of Object.keys(streams) as FlowKey[]) streams[k].dispose();
      moon.removeFromParent();
      disposeTree(root);
      scene.background = null;
      stage.dispose();
    },
  };
}
