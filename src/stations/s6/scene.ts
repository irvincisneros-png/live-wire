// Station 6 3D scene: a dim workshop bench with three lamps, plug-in power meters, energy packets (light and heat)
// and a thermal-camera view that recolours everything with a false-colour heat palette.
import * as THREE from 'three';
import type { QualityTier } from '../../types';
import { createStage, contactShadow, type KitStage } from '../../kit/stage';
import * as M from '../../kit/materials';
import { canvas, fbm } from '../../kit/textures';
import { disposeTree } from '../../kit/dispose';
import { mesh, rbox } from '../../kit/parts/common';
import { IRON, LAMPS, THERMAL_MAX_C, THERMAL_MIN_C, packetRates, surfaceTempC, type LampId } from './logic';
import { createLamp, createPowerBoard, createPowerMeter, type LampAssembly, type PowerMeter } from './models';

export const LAMP_X: Record<LampId, number> = { incandescent: -2.6, halogen: 0, led: 2.6 };
const LAMP_Z = -0.35, METER_Z = 1.15, BOARD_Z = -1.85;

export interface S6Scene {
  stage: KitStage;
  lamps: Record<LampId, LampAssembly>;
  setSelected(id: LampId): void;
  setThermal(on: boolean): void;
  readonly thermal: boolean;
  /** world point above a lamp (for DOM labels) */
  labelPoint(id: LampId): THREE.Vector3;
  /** lamp under a pointer, if any */
  lampAt(clientX: number, clientY: number): LampId | null;
  dispose(): void;
}

// ───────────── thermal palette ─────────────
function paletteTexture(): THREE.DataTexture {
  const N = 256, data = new Uint8Array(N * 4);
  const stops = IRON.map(([p, hex]) => [p, new THREE.Color(hex)] as const);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [p0, c0] = stops[k], [p1, c1] = stops[k + 1];
    const c = c0.clone().lerp(c1, Math.min(1, Math.max(0, (t - p0) / (p1 - p0))));
    // THREE.Color from hex is linear; store sRGB bytes so the texture's colour space matches the CSS legend
    const sr = c.clone().convertLinearToSRGB();
    data[i * 4] = sr.r * 255; data[i * 4 + 1] = sr.g * 255; data[i * 4 + 2] = sr.b * 255; data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function thermalMaterial(pal: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPal: { value: pal }, uSrc: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uAmp: { value: [0, 0, 0] }, uRad: { value: [0.4, 0.4, 0.4] }, uAmb: { value: 22 },
      uMin: { value: THERMAL_MIN_C }, uMax: { value: THERMAL_MAX_C }, uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D uPal; uniform vec3 uSrc[3]; uniform float uAmp[3]; uniform float uRad[3]; uniform float uAmb; uniform float uMin; uniform float uMax; uniform float uTime;
      varying vec3 vW; varying vec3 vN; varying vec3 vV;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float T = uAmb;
        for (int i = 0; i < 3; i++) {
          vec3 d = vW - uSrc[i];
          d.y *= d.y > 0.0 ? 0.72 : 1.25;           // the top of a globe runs hotter (hot air rises)
          float r2 = uRad[i] * uRad[i];
          T += uAmp[i] * exp(-dot(d, d) / r2);
          T += uAmp[i] * 0.05 * exp(-dot(d, d) / (r2 * 14.0)); // a faint warm halo on nearby surfaces
        }
        float t = clamp((T - uMin) / (uMax - uMin), 0.0, 1.0);
        float facing = abs(dot(normalize(vN), normalize(vV)));
        // surfaces facing the camera read a touch warmer (emissivity), which keeps room-temperature shapes legible
        t = clamp(t + 0.035 * facing - 0.012 + 0.012 * sin(vW.x * 1.7 + vW.z * 2.3), 0.0, 1.0);
        vec3 c = texture2D(uPal, vec2(t, 0.5)).rgb;
        c *= 0.82 + 0.18 * facing;
        c += (h(gl_FragCoord.xy + uTime) - 0.5) * 0.01;      // faint sensor grain
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ───────────── packets ─────────────
interface Packet { alive: boolean; kind: 0 | 1; p: THREE.Vector3; v: THREE.Vector3; age: number; life: number; seed: number }
const PACKET_MAX = 420;

function packetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 }, uTime: { value: 0 } },
    vertexShader: `attribute float aSize; attribute vec3 aColor; attribute float aAlpha; attribute float aKind;
      uniform float uScale; varying vec3 vC; varying float vA; varying float vK;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; vC = aColor; vA = aAlpha; vK = aKind; }`,
    fragmentShader: `uniform float uTime; varying vec3 vC; varying float vA; varying float vK;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p); float a;
        if (vK < 0.5) {
          // light packet: a crisp bright core with a four-point sparkle
          float core = smoothstep(0.42, 0.0, r);
          float star = max(0.0, 1.0 - abs(p.x) * 9.0) * smoothstep(1.0, 0.0, abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 9.0) * smoothstep(1.0, 0.0, abs(p.x));
          a = core + star * 0.7;
        } else {
          // heat packet: a soft wobbling blob with a wavy rim
          float ang = atan(p.y, p.x);
          float rr = r + 0.07 * sin(ang * 5.0 + uTime * 5.0);
          a = smoothstep(1.0, 0.8, rr) * 0.55 + smoothstep(0.7, 0.0, r) * 0.4;
        }
        a *= vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ───────────── room ─────────────
function plasterTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const v = 0.5 + (fbm(x * 0.06, y * 0.06, 4, 31) - 0.5) * 0.9;
    const i = (y * 256 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 150 + v * 80; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3);
  return t;
}

function plank(w: number, hgt: number, d: number, z: number, seed: number): THREE.Mesh {
  const geo = rbox(w, hgt, d - 0.012, 0.025, 2).clone();
  geo.userData = {};
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const ou = (seed * 0.37) % 1, ov = (seed * 0.61) % 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 4) + ou, uv.getY(i) * 0.4 + ov);
  const m = mesh(geo, M.timber('bench'));
  m.position.set(0, -hgt / 2, z + d / 2);
  return m;
}

function cord(pts: THREE.Vector3[], r = 0.024): THREE.Mesh {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4), 48, r, 8), M.insulation('white'));
}

export function createS6Scene(view: HTMLElement, quality: QualityTier): S6Scene {
  const stage = createStage(view, quality, { mood: 'dark', target: [0, 1.05, 0], distance: 9.6, yaw: 0, pitch: 0.3, minDistance: 4, maxDistance: 22 });
  const { scene, renderer } = stage;
  const world = new THREE.Group();
  scene.add(world);
  stage.keyLight.intensity = 0.55;
  // the dark mood's fog is tuned for close-up benches; phones frame this scene from further away
  scene.fog = new THREE.Fog(0x07080d, 16, 42);
  stage.setPanBounds(-4, 4, -2, 2);

  // bench: a thick hardwood top with a rounded front edge, and an apron
  // bench top: six hardwood planks, each with its own offset grain
  for (let i = 0; i < 6; i++) world.add(plank(10.4, 0.3, 0.8, -2.2 + i * 0.8 + 0.0, i + 1));
  const apron = mesh(rbox(10.2, 0.6, 0.12, 0.03, 2), M.timber('dark', 2, 1)); apron.position.set(0, -0.6, 2.05); world.add(apron);
  // wall behind
  const plaster = plasterTexture();
  const wallM = new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.92, bumpMap: plaster, bumpScale: 0.6, roughnessMap: plaster });
  const wall = mesh(new THREE.PlaneGeometry(24, 10), wallM, false); wall.position.set(0, 3.5, -2.62); world.add(wall);
  const skirting = mesh(rbox(24, 0.3, 0.06, 0.02), M.timber('dark', 4, 1)); skirting.position.set(0, 0.15, -2.58); world.add(skirting);
  // power board and cords
  const board = createPowerBoard(); board.position.set(0, 0, BOARD_Z); world.add(board);
  const plugX = [-1.25, -0.45, 0.35];

  const lamps = {} as Record<LampId, LampAssembly>;
  const meters = {} as Record<LampId, PowerMeter>;
  LAMPS.forEach((l, i) => {
    const x = LAMP_X[l.id];
    const lamp = createLamp(l.id, quality);
    lamp.position.set(x, 0, LAMP_Z);
    world.add(lamp);
    lamps[l.id] = lamp;
    const sh = contactShadow(1.8, 1.8, 0.55); sh.position.set(x, 0.003, LAMP_Z); world.add(sh);
    const m = createPowerMeter();
    m.position.set(x, 0, METER_Z); m.rotation.y = -x * 0.04;
    world.add(m); meters[l.id] = m;
    const ms = contactShadow(1.1, 0.8, 0.45); ms.position.set(x, 0.003, METER_Z); world.add(ms);
    m.userData.set(l.inputW, true);
    // cord: power board → meter (in), meter → lamp (out)
    const px = plugX[i], gap = i === 0 ? -1.35 : i === 1 ? -1.25 : 1.35;
    world.add(cord([new THREE.Vector3(px - 0.05, 0.3, BOARD_Z + 0.16), new THREE.Vector3(px - 0.05, 0.05, BOARD_Z + 0.5), new THREE.Vector3(gap, 0.025, -0.9), new THREE.Vector3(x + (gap - x) * 0.4, 0.025, 0.55), new THREE.Vector3(x - 0.25, 0.09, METER_Z - 0.3)]));
    world.add(cord([new THREE.Vector3(x + 0.25, 0.09, METER_Z - 0.3), new THREE.Vector3(x + 0.32, 0.025, METER_Z - 0.6), new THREE.Vector3(x + 0.18, 0.025, LAMP_Z + 0.7), new THREE.Vector3(x + 0.05, 0.06, LAMP_Z + 0.42)], 0.02));
  });

  // selection ring on the bench
  const ringM = new THREE.MeshBasicMaterial({ color: 0xe0a63a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.74, 64).rotateX(-Math.PI / 2), ringM);
  ring.position.set(0, 0.006, LAMP_Z); world.add(ring);

  // packets
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PACKET_MAX * 3), col = new Float32Array(PACKET_MAX * 3), size = new Float32Array(PACKET_MAX), alpha = new Float32Array(PACKET_MAX), kind = new Float32Array(PACKET_MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const pMat = packetMaterial();
  const points = new THREE.Points(geo, pMat);
  points.frustumCulled = false; points.renderOrder = 10;
  world.add(points);
  const pool: Packet[] = Array.from({ length: PACKET_MAX }, () => ({ alive: false, kind: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 1, seed: 0 }));
  const acc: Record<LampId, { light: number; heat: number }> = { incandescent: { light: 0, heat: 0 }, halogen: { light: 0, heat: 0 }, led: { light: 0, heat: 0 } };
  const lightCol = new THREE.Color('#fff0b0'), heatCol = new THREE.Color('#ff5a2a');
  const tmp = new THREE.Vector3();
  const spawn = (lamp: LampAssembly, k: 0 | 1) => {
    const p = pool.find((x) => !x.alive);
    if (!p) return;
    p.alive = true; p.kind = k; p.age = 0; p.seed = Math.random() * 100;
    const dir = tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    dir.normalize();
    const ud = lamp.userData;
    if (k === 0) {
      // light leaves in straight lines in every direction above the holder, at a steady speed
      dir.y = Math.abs(dir.y) * 0.9 + 0.05; dir.normalize();
      p.p.copy(ud.emitter).add(lamp.position).addScaledVector(dir, 0.05);
      p.v.copy(dir).multiplyScalar(1.9);
      p.life = 1.25;
    } else {
      // heat spreads from the bulb surface and drifts upwards as warm air
      dir.y = dir.y * 0.6 + 0.2; dir.normalize();
      p.p.copy(ud.heatCentre).add(lamp.position).addScaledVector(dir, ud.bulbR * 0.95);
      p.v.copy(dir).multiplyScalar(0.22).add(new THREE.Vector3(0, 0.38, 0));
      p.life = 2.3;
    }
  };

  // thermal swap
  const pal = paletteTexture();
  const thermalM = thermalMaterial(pal);
  LAMPS.forEach((l, i) => {
    const lp = lamps[l.id];
    const c = lp.userData.heatCentre.clone().add(lp.position);
    thermalM.uniforms.uSrc.value[i].copy(c);
    const R = lp.userData.bulbR, r = 0.36;
    thermalM.uniforms.uAmp.value[i] = (surfaceTempC(l) - 22 - 6) / Math.exp(-(R * R) / (r * r));
    thermalM.uniforms.uRad.value[i] = r;
  });
  const keep = new Set<THREE.Object3D>([points, ring]);
  const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const hidden: THREE.Object3D[] = [];
  let thermal = false;
  const bg = scene.background, fog = scene.fog;
  const thermalBg = new THREE.Color(IRON[0][1]);
  const setThermal = (on: boolean) => {
    if (on === thermal) return;
    thermal = on;
    if (on) {
      world.traverse((o) => {
        if (keep.has(o)) return;
        const m = o as THREE.Mesh;
        // lights keep their place (so the light count, and every shader, stays the same); the thermal shader ignores them
        if ((o as THREE.Light).isLight) return;
        if ((o as THREE.Sprite).isSprite) { if (o.visible) { o.visible = false; hidden.push(o); } return; }
        if (!m.isMesh || m.name === 'hit') return;
        const mat = m.material as THREE.Material;
        if (m.name === 'contactShadow' || (mat as THREE.MeshBasicMaterial).blending === THREE.AdditiveBlending) { if (o.visible) { o.visible = false; hidden.push(o); } return; }
        saved.set(m, m.material); m.material = thermalM;
      });
      scene.background = thermalBg; scene.fog = null;
      renderer.toneMapping = THREE.NoToneMapping;
    } else {
      for (const [m, mat] of saved) m.material = mat;
      saved.clear();
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
      scene.background = bg; scene.fog = fog;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
  };

  // camera framing: fit the three lamps on any aspect
  const fit = (w: number, hgt: number) => {
    const aspect = w / Math.max(1, hgt);
    const half = Math.tan(THREE.MathUtils.degToRad(19));
    const d = Math.max(8.8, 3.7 / (half * aspect));
    stage.setHome({ distance: d, target: [0, aspect < 1 ? 1.35 : 1.1, 0.2], pitch: aspect < 1 ? 0.36 : 0.3, maxDistance: Math.max(22, d * 1.4) });
  };
  const offResize = stage.onResize(fit);
  fit(view.clientWidth, view.clientHeight);

  let selected: LampId = 'incandescent';
  const offFrame = stage.onFrame((dt, t) => {
    const on = Math.min(1, t / 0.4);
    for (const l of LAMPS) {
      const lp = lamps[l.id];
      lp.userData.update(on, t);
      const r = packetRates(l), a = acc[l.id];
      a.light += r.light * dt * on; a.heat += r.heat * dt * on;
      while (a.light >= 1) { a.light -= 1; spawn(lp, 0); }
      while (a.heat >= 1) { a.heat -= 1; spawn(lp, 1); }
    }
    pMat.uniforms.uTime.value = t;
    thermalM.uniforms.uTime.value = (t * 60) % 100;
    pMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
    for (let i = 0; i < PACKET_MAX; i++) {
      const p = pool[i];
      if (p.alive) {
        p.age += dt;
        if (p.age >= p.life) p.alive = false;
      }
      if (!p.alive) { alpha[i] = 0; continue; }
      const k = p.age / p.life;
      if (p.kind === 1) {
        p.v.x += Math.sin(t * 2.2 + p.seed) * 0.12 * dt;
        p.v.z += Math.cos(t * 1.9 + p.seed) * 0.12 * dt;
      }
      p.p.addScaledVector(p.v, dt);
      pos[i * 3] = p.p.x; pos[i * 3 + 1] = p.p.y; pos[i * 3 + 2] = p.p.z;
      const c = p.kind === 0 ? lightCol : heatCol;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = p.kind === 0 ? 0.15 : 0.085 + k * 0.05;
      kind[i] = p.kind;
      alpha[i] = Math.min(1, p.age * 8) * (1 - k * k) * (p.kind === 0 ? 1.6 : 0.8);
    }
    for (const n of ['position', 'aColor', 'aSize', 'aAlpha', 'aKind']) (geo.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
    ringM.opacity = 0.42 + 0.22 * Math.sin(t * 3);
    ring.position.x += (LAMP_X[selected] - ring.position.x) * Math.min(1, dt * 12);
  });

  return {
    stage, lamps,
    get thermal() { return thermal; },
    setSelected(id) { selected = id; },
    setThermal,
    labelPoint(id) { return new THREE.Vector3(LAMP_X[id], 2.45, LAMP_Z); },
    lampAt(x, y) {
      const hits = stage.pick(x, y, LAMPS.map((l) => lamps[l.id].userData.hit));
      if (!hits.length) return null;
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !(o.name.startsWith('lamp-'))) o = o.parent;
      return o ? (o.name.slice(5) as LampId) : null;
    },
    dispose() {
      offFrame(); offResize();
      setThermal(false);
      disposeTree(world);
      thermalM.dispose(); pal.dispose(); plaster.dispose();
      stage.dispose();
    },
  };
}
