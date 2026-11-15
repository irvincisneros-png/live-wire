// Globe (lamp) on a bakelite batten holder: glass bulb, coiled tungsten filament on support wires.
// update({ power, ratedW, blown }): filament colour temperature and glow follow power with ~0.2 s thermal lag.
import * as THREE from 'three';
import type { QualityTier } from '../../types';
import * as M from '../materials';
import { disposeTree } from '../dispose';
import { DIM, bakeStatic, blackbody, glowSprite, lugs, mesh, rbox, screw, sharedGeo, smokeWisp } from './common';

export interface GlobeState { power?: number; ratedW?: number; blown?: boolean }
export interface GlobeModel extends THREE.Group {
  userData: {
    update(s: GlobeState, dt: number): void;
    /** 0..~1.5 current brightness (power / rated, lagged) for the bench's light pool */
    brightness: number;
    /** colour of the light (linear) */
    lightColor: THREE.Color;
    /** local position of the filament centre */
    filamentPos: THREE.Vector3;
    flowPath: { pts: THREE.Vector3[]; u: number[] };
    hotSpot: THREE.Vector3;
  };
}

const BULB_Y = 0.33, BULB_R = 0.125, NECK_Y = 0.17;

function bulbGeometry(): THREE.BufferGeometry {
  return sharedGeo('bulb-glass', () => {
    const pts: THREE.Vector2[] = [];
    // neck (inside the cap) flaring into the sphere
    pts.push(new THREE.Vector2(0.046, NECK_Y - 0.02), new THREE.Vector2(0.047, NECK_Y + 0.02));
    for (let i = 0; i <= 26; i++) {
      const a = -Math.PI / 2 + 0.55 + (i / 26) * (Math.PI - 0.55);
      const r = BULB_R * Math.cos(a), y = BULB_Y + BULB_R * Math.sin(a);
      pts.push(new THREE.Vector2(Math.max(0.0005, r), y));
    }
    return new THREE.LatheGeometry(pts, 40);
  });
}

function coil(x0: number, x1: number, y: number, turns: number, r: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const n = turns * 14;
  for (let i = 0; i <= n; i++) {
    const k = i / n, a = k * turns * Math.PI * 2;
    // slight sag in the middle of the coil like a real filament
    out.push(new THREE.Vector3(x0 + (x1 - x0) * k, y + Math.sin(a) * r - Math.sin(k * Math.PI) * 0.006, Math.cos(a) * r));
  }
  return out;
}

export function createGlobe(quality: QualityTier): GlobeModel {
  const g = new THREE.Group() as unknown as GlobeModel;
  // bakelite base with two brass terminal screws
  const base = mesh(rbox(0.46, 0.06, 0.28, 0.022, 3), M.plastic(0x2b1a12, 0.36)); base.position.y = 0.03; g.add(base);
  const plinth = mesh(sharedGeo('globe-plinth', () => new THREE.CylinderGeometry(0.085, 0.1, 0.035, 32).translate(0, 0.0775, 0)), M.plastic(0x2b1a12, 0.36)); g.add(plinth);
  for (const s of [-1, 1]) {
    const pad = mesh(rbox(0.07, 0.008, 0.07, 0.004), M.brass()); pad.position.set(s * 0.17, 0.064, 0); g.add(pad);
    const sc = screw(0.022, 0.016, M.brass()); sc.position.set(s * 0.17, 0.068, 0); g.add(sc);
  }
  g.add(lugs(0.2, 0.064));
  // MES brass cap with screw thread rings
  const capPts: THREE.Vector2[] = [new THREE.Vector2(0.03, 0.095)];
  for (let i = 0; i < 6; i++) { const y = 0.098 + i * 0.012; capPts.push(new THREE.Vector2(0.05, y), new THREE.Vector2(0.056, y + 0.006)); }
  capPts.push(new THREE.Vector2(0.052, 0.17), new THREE.Vector2(0.047, 0.172));
  const cap = mesh(sharedGeo('globe-cap', () => new THREE.LatheGeometry(capPts, 32)), M.brass()); g.add(cap);
  const collar = mesh(sharedGeo('globe-collar', () => new THREE.CylinderGeometry(0.068, 0.072, 0.02, 32).translate(0, 0.1, 0)), M.brassDark()); g.add(collar);

  // glass
  const clearGlass = M.glass(quality), smoked = M.glassSmoked(quality);
  const bulb = new THREE.Mesh(bulbGeometry(), clearGlass);
  bulb.renderOrder = 2; bulb.castShadow = false;
  g.add(bulb);
  const rim = new THREE.Mesh(bulbGeometry(), M.glassRim()); rim.renderOrder = 3; g.add(rim);
  // glass stem (button) and support wires
  const stem = new THREE.Mesh(sharedGeo('globe-stem', () => new THREE.CylinderGeometry(0.012, 0.026, 0.09, 16).translate(0, NECK_Y + 0.03, 0)), M.glass('low'));
  stem.renderOrder = 1; g.add(stem);
  const fx = 0.05, fy = BULB_Y + 0.005;
  const wireMat = M.nickel();
  const supports: THREE.Vector3[][] = [
    [new THREE.Vector3(-0.008, NECK_Y + 0.06, 0), new THREE.Vector3(-0.03, BULB_Y - 0.05, 0), new THREE.Vector3(-fx, fy, 0)],
    [new THREE.Vector3(0.008, NECK_Y + 0.06, 0), new THREE.Vector3(0.03, BULB_Y - 0.05, 0), new THREE.Vector3(fx, fy, 0)],
  ];
  for (const s of supports) g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(s), 12, 0.0022, 5), wireMat, false));
  // the filament: two halves so it can break
  const filMat = new THREE.MeshStandardMaterial({ color: 0x6d655c, metalness: 0.6, roughness: 0.45, emissive: 0x000000, emissiveIntensity: 1 });
  const half = (x0: number, x1: number, px: number) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil(x0, x1, fy, 7, 0.0085)), 196, 0.0024, 5).translate(-px, -fy, 0), filMat);
    const pivot = new THREE.Group(); pivot.position.set(px, fy, 0); pivot.add(m);
    return pivot;
  };
  const left = half(-fx, 0, -fx), right = half(0, fx, fx);
  g.add(left, right);
  // glow: a soft sprite around the filament, and a hot core sprite
  const halo = glowSprite(0xffc27a); halo.position.set(0, fy, 0); halo.renderOrder = 5; g.add(halo);
  const core = glowSprite(0xffffff); core.position.set(0, fy, 0); core.renderOrder = 6; g.add(core);

  bakeStatic(g, [bulb, rim, left, right, halo, core]);
  let smoke: ReturnType<typeof smokeWisp> | null = null;
  let wasBlown = false, bright = 0;
  const col = new THREE.Color();
  const lowBoost = quality === 'low' ? 1.6 : 1;
  const flowPts = [
    new THREE.Vector3(-0.5, DIM.lugY, 0), new THREE.Vector3(-0.17, 0.075, 0), new THREE.Vector3(-0.03, 0.12, 0),
    supports[0][0].clone(), supports[0][1].clone(), new THREE.Vector3(-fx, fy, 0), new THREE.Vector3(-fx / 2, fy - 0.004, 0), new THREE.Vector3(0, fy - 0.006, 0),
    new THREE.Vector3(fx / 2, fy - 0.004, 0), new THREE.Vector3(fx, fy, 0), supports[1][1].clone(), supports[1][0].clone(),
    new THREE.Vector3(0.03, 0.12, 0), new THREE.Vector3(0.17, 0.075, 0), new THREE.Vector3(0.5, DIM.lugY, 0),
  ];
  const u = [0, 0, 0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1, 1, 1];

  g.userData = {
    brightness: 0,
    lightColor: new THREE.Color(),
    filamentPos: new THREE.Vector3(0, fy, 0),
    flowPath: { pts: flowPts, u },
    hotSpot: new THREE.Vector3(0, fy, 0),
    update(s, dt) {
      const blown = !!s.blown;
      const target = blown ? 0 : Math.max(0, (s.power ?? 0) / Math.max(1e-6, s.ratedW ?? 3));
      // thermal lag: heats in ~0.2 s, cools a little slower
      const tau = target > bright ? 0.07 : 0.1;
      bright += (target - bright) * (1 - Math.exp(-dt / tau));
      if (bright < 1e-4) bright = 0;
      const b = Math.min(bright, 1.6);
      // colour temperature: dull red at low power → ~2800 K at rated → whiter when overdriven
      const T = 800 + 2000 * Math.sqrt(b);
      blackbody(T, col);
      const vis = Math.pow(b, 1.6);
      filMat.emissive.copy(col);
      filMat.emissiveIntensity = vis * 22 + (b > 0.02 ? 0.6 * b : 0);
      halo.material.color.copy(col);
      halo.material.opacity = Math.min(1, vis * 0.5) * lowBoost;
      halo.scale.setScalar(0.22 + 0.4 * Math.min(1.2, Math.sqrt(b)));
      core.material.color.copy(col).lerp(new THREE.Color(1, 1, 1), 0.4);
      core.material.opacity = Math.min(1, vis * 0.7);
      core.scale.setScalar(0.05 + 0.07 * Math.min(1.3, b));
      g.userData.brightness = b;
      g.userData.lightColor.copy(col);
      if (blown && !wasBlown) {
        // break: halves droop apart, glass smokes, a wisp rises
        left.rotation.z = -0.55; right.rotation.z = 0.7;
        bulb.material = smoked;
        if (smoke) disposeTree(smoke);
        smoke = smokeWisp(); smoke.position.set(0, BULB_Y + BULB_R, 0); g.add(smoke);
      } else if (!blown && wasBlown) {
        left.rotation.z = 0; right.rotation.z = 0;
        bulb.material = clearGlass;
        if (smoke) disposeTree(smoke);
        smoke = null;
      }
      wasBlown = blown;
      if (smoke && !smoke.userData.update(dt)) { disposeTree(smoke); smoke = null; }
    },
  };
  g.name = 'globe';
  return g;
}
