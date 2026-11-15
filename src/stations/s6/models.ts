// Station 6 models: three real lamp types (A60 incandescent, eco-halogen with an inner capsule, A60 LED with
// opal diffuser and finned heat-sink collar) on cast lamp stands, plug-in power meters and a power board.
// Scale: 1 unit = 10 cm, y up, bench top at y = 0.
import * as THREE from 'three';
import type { QualityTier } from '../../types';
import * as M from '../../kit/materials';
import { canvas } from '../../kit/textures';
import { bakeStatic, blackbody, glowSprite, mesh, rbox } from '../../kit/parts/common';
import type { LampId } from './logic';

export interface LampAssembly extends THREE.Group {
  userData: {
    id: LampId;
    /** local point where light packets start */
    emitter: THREE.Vector3;
    /** local centre of the hot surface (thermal field source and heat packet origin) */
    heatCentre: THREE.Vector3;
    /** radius of the outer bulb, for heat packets that leave its surface */
    bulbR: number;
    /** 0..1 lamp on fraction (warm-up) */
    update(on: number, t: number): void;
    /** invisible proxy used for tapping */
    hit: THREE.Mesh;
    light: THREE.PointLight | null;
    glows: THREE.Sprite[];
  };
}

// lamp stand dimensions
const BASE_H = 0.11, STEM_H = 0.55, HOLDER_H = 0.42;
/** y of the top of the lampholder (where the bulb cap sits) */
export const CAP_Y = BASE_H + STEM_H + HOLDER_H;
const CAP_H = 0.24, CAP_R = 0.135;
/** bulb envelope starts at this local y (top of the cap) */
const B0 = CAP_Y + CAP_H;

/** Classic A60 outline above the cap, radius 0.3, height ~0.86. Returns lathe points (x = radius, y). */
function a60Profile(scale = 1, slender = 1): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const R = 0.3 * scale * slender, cy = 0.56 * scale, rn = CAP_R * 0.98;
  // neck: smooth ease from the cap radius out to the sphere's equator
  for (let i = 0; i <= 18; i++) {
    const k = i / 18;
    const e = k * k * (3 - 2 * k);
    const r = rn + (R - rn) * Math.pow(e, 0.8);
    pts.push(new THREE.Vector2(r, k * cy));
  }
  // dome above the equator
  for (let i = 1; i <= 20; i++) {
    const a = (i / 20) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.0005, R * Math.cos(a)), cy + 0.3 * scale * Math.sin(a)));
  }
  return pts.map((p) => new THREE.Vector2(p.x, p.y + B0));
}

/** E27 Edison screw cap with rolled threads, black glass insulator and solder contact. */
function e27Cap(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.0, CAP_Y - 0.035), new THREE.Vector2(0.03, CAP_Y - 0.035), new THREE.Vector2(0.04, CAP_Y - 0.02)];
  const shell: THREE.Vector2[] = [];
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const k = i / n, y = CAP_Y + 0.02 + k * (CAP_H - 0.03);
    shell.push(new THREE.Vector2(CAP_R - 0.012 + 0.012 * Math.abs(Math.sin(k * Math.PI * 4.5)), y));
  }
  shell.unshift(new THREE.Vector2(CAP_R - 0.03, CAP_Y + 0.012), new THREE.Vector2(CAP_R - 0.012, CAP_Y + 0.02));
  shell.push(new THREE.Vector2(CAP_R + 0.002, CAP_Y + CAP_H), new THREE.Vector2(CAP_R - 0.01, CAP_Y + CAP_H + 0.004));
  g.add(mesh(new THREE.LatheGeometry(shell, 40), M.nickel()));
  // black glass insulator and brass contact
  g.add(mesh(new THREE.LatheGeometry([...pts.slice(1), new THREE.Vector2(CAP_R - 0.03, CAP_Y + 0.0), new THREE.Vector2(CAP_R - 0.03, CAP_Y + 0.014)], 32), M.plastic(0x101012, 0.15)));
  const tip = mesh(new THREE.SphereGeometry(0.035, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.brass());
  tip.position.y = CAP_Y - 0.03; g.add(tip);
  return g;
}

/** cast-iron lamp stand: hammered-paint base, brass stem, bakelite E27 holder with grip ribs */
function stand(): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshPhysicalMaterial({ color: 0x23272b, roughness: 0.55, metalness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.5, roughnessMap: M.ceramicMatte().roughnessMap });
  const base = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.56, 0), new THREE.Vector2(0.58, 0.015), new THREE.Vector2(0.58, 0.04),
    new THREE.Vector2(0.54, 0.075), new THREE.Vector2(0.38, 0.095), new THREE.Vector2(0.2, BASE_H), new THREE.Vector2(0.09, BASE_H + 0.02), new THREE.Vector2(0, BASE_H + 0.02),
  ], 48), iron);
  g.add(base);
  // felt foot ring
  const felt = mesh(new THREE.TorusGeometry(0.5, 0.012, 6, 40).rotateX(Math.PI / 2), M.rubber(0x2a2422), false); felt.position.y = 0.004; g.add(felt);
  const stem = mesh(new THREE.CylinderGeometry(0.045, 0.05, STEM_H, 24).translate(0, BASE_H + STEM_H / 2, 0), M.brass()); g.add(stem);
  const nut = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 6).translate(0, BASE_H + 0.035, 0), M.brassDark()); g.add(nut);
  // bakelite holder
  const bak = M.plastic(0x1b1410, 0.32);
  const hp: THREE.Vector2[] = [new THREE.Vector2(0.05, BASE_H + STEM_H - 0.02), new THREE.Vector2(0.12, BASE_H + STEM_H), new THREE.Vector2(0.19, BASE_H + STEM_H + 0.06), new THREE.Vector2(0.2, BASE_H + STEM_H + 0.12)];
  hp.push(new THREE.Vector2(0.2, CAP_Y - 0.05), new THREE.Vector2(0.21, CAP_Y - 0.04), new THREE.Vector2(0.21, CAP_Y - 0.005), new THREE.Vector2(0.19, CAP_Y), new THREE.Vector2(0.15, CAP_Y));
  g.add(mesh(new THREE.LatheGeometry(hp, 40), bak));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rib = mesh(rbox(0.02, 0.2, 0.03, 0.008), bak);
    rib.position.set(Math.cos(a) * 0.2, BASE_H + STEM_H + 0.24, Math.sin(a) * 0.2);
    rib.rotation.y = -a;
    g.add(rib);
  }
  return g;
}

function glowFor(color: THREE.Color, size: number, opacity: number): THREE.Sprite {
  const s = glowSprite(color.getHex());
  s.scale.setScalar(size);
  s.userData.baseOpacity = opacity;
  s.renderOrder = 6;
  return s;
}

function coil(a: THREE.Vector3, b: THREE.Vector3, turns: number, r: number, sag: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const n = turns * 12;
  const axis = b.clone().sub(a), len = axis.length();
  axis.normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(axis);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const up = axis.clone().cross(side).normalize();
  for (let i = 0; i <= n; i++) {
    const k = i / n, ang = k * turns * Math.PI * 2;
    const p = a.clone().addScaledVector(axis, k * len)
      .addScaledVector(side, Math.cos(ang) * r).addScaledVector(up, Math.sin(ang) * r);
    p.y -= Math.sin(k * Math.PI) * sag;
    out.push(p);
  }
  return out;
}

const tube = (pts: THREE.Vector3[], r: number, mat: THREE.Material, seg = 24) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6), mat, false);

export function createLamp(id: LampId, quality: QualityTier): LampAssembly {
  const g = new THREE.Group() as unknown as LampAssembly;
  const st = stand();
  g.add(st);
  g.add(e27Cap());
  const glows: THREE.Sprite[] = [];
  const animated: THREE.Object3D[] = [];
  let emitter = new THREE.Vector3(0, B0 + 0.5, 0), heatCentre = new THREE.Vector3(0, B0 + 0.5, 0);
  let bulbR = 0.3;
  const warm = blackbody(2700), white = blackbody(3000);
  const hotMats: { m: THREE.MeshStandardMaterial; k: number }[] = [];
  const glassMat = M.glass(quality);

  if (id === 'incandescent' || id === 'halogen') {
    const slender = id === 'halogen' ? 0.94 : 1;
    const prof = a60Profile(1, slender);
    const env = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), glassMat);
    env.renderOrder = 2; g.add(env); animated.push(env);
    const rim = new THREE.Mesh(env.geometry, M.glassRim()); rim.renderOrder = 3; g.add(rim); animated.push(rim);
    const lead = M.nickel();
    // glass stem (flare) rising from the neck
    const stemG = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.09, B0 - 0.02), new THREE.Vector2(0.07, B0 + 0.04), new THREE.Vector2(0.03, B0 + 0.12), new THREE.Vector2(0.022, B0 + 0.3), new THREE.Vector2(0.03, B0 + 0.33), new THREE.Vector2(0.0, B0 + 0.34)], 24), M.glass('low'));
    stemG.renderOrder = 1; g.add(stemG); animated.push(stemG);
    if (id === 'incandescent') {
      // two lead-in wires and a crown of molybdenum supports holding a coiled-coil tungsten filament in a shallow arc
      const fy = B0 + 0.5, fx = 0.17;
      g.add(tube([new THREE.Vector3(-0.02, B0 + 0.2, 0), new THREE.Vector3(-0.08, B0 + 0.36, 0), new THREE.Vector3(-fx, fy, 0)], 0.005, lead));
      g.add(tube([new THREE.Vector3(0.02, B0 + 0.2, 0), new THREE.Vector3(0.08, B0 + 0.36, 0), new THREE.Vector3(fx, fy, 0)], 0.005, lead));
      const crown: THREE.Vector3[] = [];
      for (let i = 0; i <= 4; i++) {
        const a = Math.PI * (0.15 + 0.7 * (i / 4));
        crown.push(new THREE.Vector3(-Math.cos(a) * fx, fy + Math.sin(a) * 0.06, -Math.sin(a) * 0.09));
      }
      for (const p of crown.slice(1, -1)) g.add(tube([new THREE.Vector3(0, B0 + 0.33, 0), new THREE.Vector3(p.x * 0.4, p.y - 0.05, p.z * 0.4), p], 0.0028, lead, 10));
      const filMat = new THREE.MeshStandardMaterial({ color: 0x6d655c, metalness: 0.6, roughness: 0.45, emissive: warm.clone(), emissiveIntensity: 0 });
      hotMats.push({ m: filMat, k: 30 });
      const path: THREE.Vector3[] = [];
      for (let i = 0; i < crown.length - 1; i++) {
        const seg = coil(crown[i], crown[i + 1], 9, 0.009, 0.012);
        path.push(...(i ? seg.slice(1) : seg));
      }
      const fil = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 420, 0.0032, 5), filMat, false);
      g.add(fil); animated.push(fil);
      emitter = new THREE.Vector3(0, fy + 0.04, -0.05);
      heatCentre = new THREE.Vector3(0, B0 + 0.56, 0);
      const halo = glowFor(warm, 1.6, 0.55); halo.position.copy(emitter); g.add(halo); glows.push(halo);
      const core = glowFor(new THREE.Color(1, 0.93, 0.8), 0.55, 0.9); core.position.copy(emitter); g.add(core); glows.push(core);
      const bulbGlow = new THREE.Mesh(env.geometry, new THREE.MeshBasicMaterial({ color: warm.clone().multiplyScalar(0.35), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
      bulbGlow.scale.setScalar(0.995); bulbGlow.renderOrder = 4; g.add(bulbGlow); animated.push(bulbGlow);
      bulbGlow.userData.envGlow = 0.22;
      glows.push(bulbGlow as unknown as THREE.Sprite);
    } else {
      // eco-halogen: a small quartz capsule with a tight linear filament, held on two stiff leads
      const cy = B0 + 0.42;
      g.add(tube([new THREE.Vector3(-0.02, B0 + 0.2, 0), new THREE.Vector3(-0.03, B0 + 0.3, 0), new THREE.Vector3(-0.03, cy - 0.11, 0)], 0.006, lead, 8));
      g.add(tube([new THREE.Vector3(0.02, B0 + 0.2, 0), new THREE.Vector3(0.03, B0 + 0.3, 0), new THREE.Vector3(0.03, cy - 0.11, 0)], 0.006, lead, 8));
      const capPts: THREE.Vector2[] = [new THREE.Vector2(0.0, cy - 0.15), new THREE.Vector2(0.05, cy - 0.15), new THREE.Vector2(0.055, cy - 0.1), new THREE.Vector2(0.042, cy - 0.085)];
      for (let i = 0; i <= 10; i++) { const k = i / 10; capPts.push(new THREE.Vector2(0.06 + Math.sin(k * Math.PI) * 0.006, cy - 0.08 + k * 0.17)); }
      for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; capPts.push(new THREE.Vector2(Math.max(0.0005, 0.06 * Math.cos(a)), cy + 0.09 + 0.05 * Math.sin(a))); }
      capPts.push(new THREE.Vector2(0.006, cy + 0.15), new THREE.Vector2(0, cy + 0.16));
      const quartz = new THREE.MeshPhysicalMaterial({ color: 0xfff8ea, roughness: 0.05, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false, emissive: warm.clone(), emissiveIntensity: 0 });
      hotMats.push({ m: quartz as unknown as THREE.MeshStandardMaterial, k: 0.35 });
      const cap = new THREE.Mesh(new THREE.LatheGeometry(capPts, 32), quartz); cap.renderOrder = 2; g.add(cap); animated.push(cap);
      // pinch seal: flattened quartz block at the base
      const pinch = new THREE.Mesh(rbox(0.11, 0.06, 0.03, 0.01), quartz); pinch.position.y = cy - 0.12; pinch.renderOrder = 2; g.add(pinch); animated.push(pinch);
      const filMat = new THREE.MeshStandardMaterial({ color: 0x6d655c, metalness: 0.6, roughness: 0.45, emissive: white.clone(), emissiveIntensity: 0 });
      hotMats.push({ m: filMat, k: 40 });
      const fil = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil(new THREE.Vector3(0, cy - 0.06, 0), new THREE.Vector3(0, cy + 0.07, 0), 14, 0.011, 0)), 300, 0.0028, 5), filMat, false);
      g.add(fil); animated.push(fil);
      for (const s of [-1, 1]) g.add(tube([new THREE.Vector3(s * 0.03, cy - 0.11, 0), new THREE.Vector3(s * 0.012, cy - 0.07, 0), new THREE.Vector3(0, cy - 0.06, 0)], 0.003, lead, 6));
      g.add(tube([new THREE.Vector3(0, cy + 0.07, 0), new THREE.Vector3(0.02, cy + 0.1, 0)], 0.003, lead, 4));
      emitter = new THREE.Vector3(0, cy, 0);
      heatCentre = new THREE.Vector3(0, B0 + 0.52, 0);
      bulbR = 0.3 * slender;
      const halo = glowFor(white, 1.5, 0.55); halo.position.copy(emitter); g.add(halo); glows.push(halo);
      const core = glowFor(new THREE.Color(1, 0.96, 0.88), 0.45, 1); core.position.copy(emitter); g.add(core); glows.push(core);
    }
  } else {
    // LED A60: finned white heat-sink collar, chrome seam ring and an opal polycarbonate diffuser
    const sinkM = new THREE.MeshPhysicalMaterial({ color: 0xeeeeea, roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.35, roughnessMap: M.ceramicMatte().roughnessMap });
    const top = B0 + 0.38;
    const cp: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) { const k = i / 14; cp.push(new THREE.Vector2(CAP_R + 0.005 + (0.285 - CAP_R) * Math.pow(k, 1.5), B0 - 0.02 + k * 0.4)); }
    cp.push(new THREE.Vector2(0.29, top), new THREE.Vector2(0.27, top + 0.005), new THREE.Vector2(0.0, top + 0.005));
    g.add(mesh(new THREE.LatheGeometry(cp, 48), sinkM));
    // cooling fins: thin vanes following the collar's flare
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const fin = new THREE.Shape();
      fin.moveTo(-0.04, 0); fin.lineTo(0.02, 0); fin.lineTo(0.032, 0.3); fin.quadraticCurveTo(0.03, 0.36, 0.012, 0.37); fin.lineTo(-0.04, 0.37); fin.closePath();
      const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.012, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 4 });
      fg.translate(0, 0, -0.006);
      const fm = mesh(fg, sinkM);
      // sit each fin on the collar surface
      fm.position.set(Math.cos(a) * (CAP_R + 0.01), B0, Math.sin(a) * (CAP_R + 0.01));
      fm.rotation.y = -a;
            // lean outwards with the flare
      fm.rotateZ(-0.36);
      g.add(fm);
    }
    const seam = mesh(new THREE.TorusGeometry(0.288, 0.01, 8, 48).rotateX(Math.PI / 2), M.nickel(), false); seam.position.y = top; g.add(seam);
    // diffuser dome: slightly more than a hemisphere, opal and softly lit from inside
    const dp: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = -0.25 + (i / 24) * (Math.PI / 2 + 0.25);
      dp.push(new THREE.Vector2(Math.max(0.0005, 0.3 * Math.cos(a)), top + 0.075 + 0.3 * Math.sin(a) * (a > 0 ? 1.05 : 1)));
    }
    dp.unshift(new THREE.Vector2(0.28, top));
    const opal = new THREE.MeshPhysicalMaterial({ color: 0xfbfaf6, roughness: 0.55, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: white.clone().lerp(new THREE.Color(1, 1, 1), 0.3), emissiveIntensity: 0, sheen: 0.3 });
    hotMats.push({ m: opal as unknown as THREE.MeshStandardMaterial, k: 1.6 });
    const dome = mesh(new THREE.LatheGeometry(dp, 48), opal, false); g.add(dome); animated.push(dome);
    emitter = new THREE.Vector3(0, top + 0.17, 0);
    heatCentre = new THREE.Vector3(0, top - 0.06, 0);
    const halo = glowFor(white, 1.7, 0.42); halo.position.copy(emitter); g.add(halo); glows.push(halo);
  }

  // one warm point light per lamp (medium/high), at the same brightness for all three: same light out
  let light: THREE.PointLight | null = null;
  if (quality !== 'low') {
    light = new THREE.PointLight(id === 'led' ? white : warm, 0, 9, 1.6);
    light.position.copy(emitter);
    g.add(light);
  }
  // tap proxy
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, B0 + 1.0, 12).translate(0, (B0 + 1.0) / 2, 0), new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'hit';
  g.add(hit);

  bakeStatic(g, [...animated, ...glows, hit]);
  const baseK = new Map<THREE.MeshStandardMaterial, number>(hotMats.map((x) => [x.m, x.k]));
  g.userData = {
    id, emitter, heatCentre, bulbR, hit, light, glows,
    update(on, t) {
      const flick = id === 'led' ? 1 : 1 + Math.sin(t * 37) * 0.006;
      for (const [m, k] of baseK) m.emissiveIntensity = on * k * flick;
      for (const s of glows) {
        const mat = s.material as THREE.SpriteMaterial;
        const base = (s.userData.envGlow as number | undefined) ?? (s.userData.baseOpacity as number);
        mat.opacity = on * base * flick;
      }
      if (light) light.intensity = on * 2.2;
    },
  };
  g.name = 'lamp-' + id;
  return g;
}

// ───────────── plug-in power meter ─────────────

export interface PowerMeter extends THREE.Group {
  userData: { set(watts: number, on: boolean): void; dispose(): void };
}

/** Wall-plug style energy meter lying on the bench: grey case, LCD reading watts, three keys. */
export function createPowerMeter(): PowerMeter {
  const g = new THREE.Group() as unknown as PowerMeter;
  const caseM = new THREE.MeshPhysicalMaterial({ color: 0xe3e1dc, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, roughnessMap: M.ceramicMatte().roughnessMap });
  // wedge-shaped case: low at the front, high at the back, so the display tilts towards the student
  const ZF = 0.24, ZB = -0.24, YF = 0.1, YB = 0.27, BV = 0.035;
  const prof = new THREE.Shape();
  prof.moveTo(-ZF, 0); prof.lineTo(-ZB, 0); prof.lineTo(-ZB, YB); prof.lineTo(-ZF, YF); prof.closePath();
  const bodyG = new THREE.ExtrudeGeometry(prof, { depth: 0.66, bevelEnabled: true, bevelSize: BV, bevelThickness: BV, bevelSegments: 3, curveSegments: 4 });
  bodyG.translate(0, BV, -0.33).rotateY(Math.PI / 2);
  g.add(mesh(bodyG, caseM));
  const slope = Math.atan2(YB - YF, ZF - ZB);
  const n = new THREE.Vector3(0, Math.cos(slope), Math.sin(slope));
  const onTop = (z: number, lift: number) => new THREE.Vector3(0, BV + YF + (ZF - z) / (ZF - ZB) * (YB - YF), z).addScaledVector(n, BV + lift);
  const face = mesh(rbox(0.62, 0.36, 0.02, 0.02, 3), M.plastic(0x2c3035, 0.4)); face.position.copy(onTop(-0.03, 0.0)); face.rotation.x = -Math.PI / 2 + slope; g.add(face);
  const [c, ctx] = canvas(256, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const lcdM = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45, roughness: 0.25 });
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.26), lcdM); lcd.rotation.x = -Math.PI / 2 + slope; lcd.position.copy(onTop(-0.06, 0.012)); g.add(lcd);
  for (let i = 0; i < 3; i++) { const k = mesh(rbox(0.12, 0.05, 0.03, 0.012, 2), M.plastic(0x5b6168, 0.5)); k.position.copy(onTop(0.17, 0.012)).setX(-0.17 + i * 0.17); k.rotation.x = slope; g.add(k); }
  for (const sx of [-1, 1]) { const f = mesh(rbox(0.1, 0.02, 0.08, 0.01), M.rubber()); f.position.set(sx * 0.28, 0.004, 0); g.add(f); }
  // cable glands on the back (cords are routed by the scene)
  for (const sx of [-0.25, 0.25]) { const gl = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 12).rotateX(Math.PI / 2), M.plastic(0x9a9a96, 0.5)); gl.position.set(sx, 0.11, -0.29); g.add(gl); }
  bakeStatic(g, [lcd]);
  let last = '';
  g.userData = {
    set(watts, on) {
      const txt = on ? watts.toFixed(1) : '';
      if (txt === last) return;
      last = txt;
      const grd = ctx.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, '#b4c4a6'); grd.addColorStop(1, '#93a587');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = 'rgba(20,28,18,0.85)';
      ctx.font = '700 16px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('POWER', 12, 10);
      ctx.fillStyle = '#141a12';
      ctx.font = '700 70px "SF Mono", Menlo, Consolas, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(txt || '0.0', 200, 106);
      ctx.font = '700 34px Arial, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('W', 208, 104);
      tex.needsUpdate = true;
    },
    dispose() { tex.dispose(); lcdM.dispose(); caseM.dispose(); },
  };
  g.userData.set(0, true);
  return g;
}

/** a white four-outlet power board at the back of the bench */
export function createPowerBoard(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf1f0ec, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.3, roughnessMap: M.ceramicMatte().roughnessMap });
  const body = mesh(rbox(3.4, 0.22, 0.5, 0.08, 4), white); body.position.y = 0.11; g.add(body);
  for (let i = 0; i < 4; i++) {
    const x = -1.2 + i * 0.8;
    const plate = mesh(rbox(0.5, 0.02, 0.38, 0.05, 3), white); plate.position.set(x, 0.225, 0); g.add(plate);
    const sw = mesh(rbox(0.12, 0.05, 0.16, 0.02, 2), M.plastic(0xd8d4cc, 0.4)); sw.position.set(x + 0.17, 0.24, 0); g.add(sw);
    const led = mesh(rbox(0.04, 0.01, 0.04, 0.01), new THREE.MeshStandardMaterial({ color: 0xff3b2f, emissive: 0xff2a1a, emissiveIntensity: 1.6 }), false); led.position.set(x + 0.17, 0.27, 0.05); g.add(led);
    // plug head pushed in
    if (i < 3) { const p = mesh(rbox(0.3, 0.18, 0.3, 0.05, 3), white); p.position.set(x - 0.05, 0.32, 0); g.add(p); }
  }
  bakeStatic(g);
  return g;
}
