// Procedural environments per mood: a PMREM'd light-room for reflections, a gradient backdrop, lights and fog.
import * as THREE from 'three';
import { canvas } from './textures';

export type Mood = 'workshop' | 'kitchen' | 'dark' | 'outdoor' | 'house';

export interface MoodDef {
  bgTop: string; bgBottom: string; bgGlow: string;
  fog: number; fogNear: number; fogFar: number;
  key: { color: number; intensity: number; pos: [number, number, number] };
  fill: { sky: number; ground: number; intensity: number };
  rim: { color: number; intensity: number; pos: [number, number, number] };
  envIntensity: number;
  exposure: number;
  /** emissive panels in the env room: colour, intensity, position, size */
  panels: { color: number; k: number; pos: [number, number, number]; size: [number, number, number] }[];
  wall: number;
}

export const MOODS: Record<Mood, MoodDef> = {
  workshop: {
    bgTop: '#3a3129', bgBottom: '#0d0b0a', bgGlow: 'rgba(255,196,130,0.16)',
    fog: 0x16120f, fogNear: 9, fogFar: 22,
    key: { color: 0xffe1bd, intensity: 2.5, pos: [3.5, 7.5, 4.5] },
    fill: { sky: 0xc9dcff, ground: 0x4a3322, intensity: 0.55 },
    rim: { color: 0x9cc2ff, intensity: 0.35, pos: [-4, 3.5, -6] },
    envIntensity: 0.85, exposure: 1.0,
    panels: [
      { color: 0xffd2a0, k: 5, pos: [3, 6, 3], size: [3, 0.1, 2] },
      { color: 0xbcd4ff, k: 3.2, pos: [-6, 2.5, 0], size: [0.1, 3, 5] },
      { color: 0xfff0dc, k: 3, pos: [0, 6.5, -2], size: [6, 0.1, 0.4] },
      { color: 0xffffff, k: 2.2, pos: [2, 2, -6], size: [3, 2, 0.1] },
    ],
    wall: 0x2a2520,
  },
  kitchen: {
    bgTop: '#d9d3ca', bgBottom: '#8f877c', bgGlow: 'rgba(255,255,255,0.25)',
    fog: 0xb3aca2, fogNear: 10, fogFar: 26,
    key: { color: 0xfff3e2, intensity: 2.3, pos: [2, 8, 5] },
    fill: { sky: 0xffffff, ground: 0x8a7a66, intensity: 0.9 },
    rim: { color: 0xdbe8ff, intensity: 0.6, pos: [-4, 4, -6] },
    envIntensity: 1.0, exposure: 1.0,
    panels: [
      { color: 0xffffff, k: 7, pos: [0, 6, 1], size: [5, 0.1, 3] },
      { color: 0xdfeeff, k: 4, pos: [-6, 3, 0], size: [0.1, 3, 4] },
      { color: 0xfff2e0, k: 3, pos: [5, 3, -3], size: [0.1, 2, 3] },
    ],
    wall: 0x9a948b,
  },
  dark: {
    bgTop: '#101626', bgBottom: '#030409', bgGlow: 'rgba(80,140,255,0.10)',
    fog: 0x05070d, fogNear: 6, fogFar: 18,
    key: { color: 0xbfd4ff, intensity: 1.2, pos: [3, 6, 4] },
    fill: { sky: 0x3a5a9a, ground: 0x0a0a12, intensity: 0.35 },
    rim: { color: 0x56b4e9, intensity: 1.2, pos: [-4, 3, -5] },
    envIntensity: 0.4, exposure: 1.0,
    panels: [
      { color: 0x6aa0ff, k: 3, pos: [-4, 4, 2], size: [2, 0.1, 2] },
      { color: 0xffffff, k: 1.5, pos: [4, 5, -2], size: [1, 0.1, 3] },
    ],
    wall: 0x06080e,
  },
  outdoor: {
    bgTop: '#8fc0ea', bgBottom: '#dfe9ee', bgGlow: 'rgba(255,250,230,0.3)',
    fog: 0xcfe0ea, fogNear: 14, fogFar: 40,
    key: { color: 0xfff1d6, intensity: 3.2, pos: [6, 10, 4] },
    fill: { sky: 0xa9d1ff, ground: 0x6b7a4a, intensity: 1.0 },
    rim: { color: 0xffffff, intensity: 0.4, pos: [-4, 4, -6] },
    envIntensity: 1.0, exposure: 0.95,
    panels: [
      { color: 0xfff4dd, k: 30, pos: [5, 8, 3], size: [1, 0.1, 1] },
      { color: 0x9cc8ff, k: 2.5, pos: [0, 9, 0], size: [16, 0.1, 16] },
      { color: 0x6f7a4c, k: 0.5, pos: [0, -1, 0], size: [16, 0.1, 16] },
    ],
    wall: 0x8eb6dd,
  },
  house: {
    bgTop: '#c9c2b8', bgBottom: '#6d665e', bgGlow: 'rgba(255,240,215,0.22)',
    fog: 0x8a837a, fogNear: 14, fogFar: 36,
    key: { color: 0xffe9cc, intensity: 2.4, pos: [5, 9, 6] },
    fill: { sky: 0xe8efff, ground: 0x7a6650, intensity: 0.85 },
    rim: { color: 0xcfe0ff, intensity: 0.6, pos: [-5, 5, -7] },
    envIntensity: 0.9, exposure: 1.0,
    panels: [
      { color: 0xfff0dc, k: 6, pos: [2, 7, 3], size: [4, 0.1, 3] },
      { color: 0xd6e6ff, k: 3, pos: [-7, 3, 0], size: [0.1, 3, 5] },
    ],
    wall: 0x8c857c,
  },
};

/** build a PMREM environment for a mood (caller disposes the returned render target; use .texture) */
export function buildEnvironment(renderer: THREE.WebGLRenderer, mood: Mood): THREE.WebGLRenderTarget {
  const def = MOODS[mood];
  const scene = new THREE.Scene();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const room = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: def.wall, side: THREE.BackSide, roughness: 1 }));
  room.scale.set(16, 10, 16); room.position.y = 3;
  scene.add(room);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const mats: THREE.Material[] = [room.material as THREE.Material];
  for (const p of def.panels) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(p.k) });
    mats.push(m);
    const mesh = new THREE.Mesh(box, m);
    mesh.position.set(...p.pos); mesh.scale.set(...p.size);
    scene.add(mesh);
  }
  // a dark "bench" below to give the bottom hemisphere some warmth
  const floorM = new THREE.MeshStandardMaterial({ color: mood === 'workshop' ? 0x3a2616 : def.wall, roughness: 1 });
  mats.push(floorM);
  const floor = new THREE.Mesh(box, floorM); floor.scale.set(16, 0.1, 16); floor.position.y = -1.5; scene.add(floor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  box.dispose(); mats.forEach((m) => m.dispose());
  return rt;
}

/** screen-filling gradient backdrop with a soft glow (scene.background) */
export function backdropTexture(mood: Mood): THREE.CanvasTexture {
  const def = MOODS[mood];
  const [c, ctx] = canvas(512, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, def.bgTop); g.addColorStop(1, def.bgBottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  const r = ctx.createRadialGradient(256, 190, 10, 256, 190, 340);
  r.addColorStop(0, def.bgGlow); r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, 512, 512);
  // dither noise to avoid banding
  const img = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 5; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
