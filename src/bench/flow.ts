// X-ray flow: glowing "electron" dots streaming along every conducting part, and energy packets leaving components.
// Direction = electron flow (opposite to the solver's conventional current). Glow = energy picture (V_max − V_here).
import * as THREE from 'three';
import type { Part, QualityTier, Solution } from '../types';
import { Q } from '../types';
import type { FlowSource } from './benchView';
import { advancePhase, dotLayout, electronVelocity, glowAt, packetRate, potentialAlong } from './flowmath';

const SPACING: Record<QualityTier, number> = { low: 0.13, medium: 0.095, high: 0.075 };
const MAX_PACKETS = 320;

interface Rec {
  src: FlowSource;
  count: number;
  phase: number;
  world: THREE.Vector3[];
  cum: number[];
  u: number[];
  emit: number;
}

const DOT_VS = /* glsl */ `
  attribute float aGlow;
  uniform float uSize; uniform float uPx;
  varying float vGlow;
  void main() {
    vGlow = aGlow;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPx / max(0.1, -mv.z);
  }`;
const DOT_FS = /* glsl */ `
  uniform float uBoost;
  varying float vGlow;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.4, 0.0, d);
    float halo = pow(1.0 - d, 2.4);
    // energy picture: dim blue-white dots have little energy, bright yellow dots carry a lot
    vec3 dim = vec3(0.42, 0.62, 1.0);
    vec3 hot = vec3(1.0, 0.86, 0.22);
    float g = vGlow * vGlow;
    vec3 col = mix(dim * 0.5, hot * 2.6, g) * halo * uBoost + mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.97, 0.8), g) * core * (0.45 + 1.4 * g);
    gl_FragColor = vec4(col, clamp(halo + core, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const PK_VS = /* glsl */ `
  attribute float aLife;
  uniform float uSize; uniform float uPx;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPx * (0.6 + 0.6 * sin(3.14159 * min(1.0, aLife * 1.4))) / max(0.1, -mv.z);
  }`;
const PK_FS = /* glsl */ `
  uniform vec3 uColor;
  varying float vLife;
  void main() {
    vec2 c = abs(gl_PointCoord - 0.5) * 2.0;
    float d = c.x + c.y;
    if (d > 1.0 || vLife >= 1.0) discard;
    float a = (1.0 - d) * (1.0 - vLife);
    gl_FragColor = vec4(uColor * (0.6 + 1.6 * (1.0 - d)), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createFlow(parent: THREE.Object3D, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, quality: QualityTier) {
  const group = new THREE.Group(); group.name = 'xray'; parent.add(group);
  group.visible = false;
  const spacing = SPACING[quality];
  let cap = 512;
  let pos = new Float32Array(cap * 3), glow = new Float32Array(cap);
  const geo = new THREE.BufferGeometry();
  const setAttrs = () => {
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage));
  };
  setAttrs();
  const uPx = { value: 800 };
  const dotMat = new THREE.ShaderMaterial({
    vertexShader: DOT_VS, fragmentShader: DOT_FS,
    uniforms: { uSize: { value: quality === 'low' ? 0.085 : 0.074 }, uPx, uBoost: { value: quality === 'low' ? 1.4 : 1 } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const dots = new THREE.Points(geo, dotMat);
  dots.frustumCulled = false; dots.renderOrder = 20;
  group.add(dots);

  // energy packets
  const pPos = new Float32Array(MAX_PACKETS * 3), pLife = new Float32Array(MAX_PACKETS).fill(1);
  const pVel = new Float32Array(MAX_PACKETS * 3), pDur = new Float32Array(MAX_PACKETS).fill(1);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aLife', new THREE.BufferAttribute(pLife, 1).setUsage(THREE.DynamicDrawUsage));
  const ec = new THREE.Color(Q.energy.colour);
  const pMat = new THREE.ShaderMaterial({
    vertexShader: PK_VS, fragmentShader: PK_FS,
    uniforms: { uSize: { value: 0.07 }, uPx, uColor: { value: new THREE.Vector3(ec.r * 1.6, ec.g * 1.6, ec.b * 1.6) } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const packets = new THREE.Points(pGeo, pMat);
  packets.frustumCulled = false; packets.renderOrder = 21;
  group.add(packets);
  let nextPacket = 0;

  let recs: Rec[] = [];
  const tmp = new THREE.Vector3();

  const toWorld = (r: Rec) => {
    const { pts, u } = r.src.path();
    r.u = u;
    r.src.obj.updateWorldMatrix(true, false);
    const m = r.src.obj.matrixWorld;
    while (r.world.length < pts.length) r.world.push(new THREE.Vector3());
    r.world.length = pts.length;
    r.cum.length = pts.length;
    let L = 0;
    for (let i = 0; i < pts.length; i++) {
      r.world[i].copy(pts[i]).applyMatrix4(m);
      if (i > 0) L += r.world[i].distanceTo(r.world[i - 1]);
      r.cum[i] = L;
    }
    return L;
  };

  function setSources(sources: FlowSource[]): void {
    const old = new Map(recs.map((r) => [r.src.id, r]));
    recs = sources.map((src) => {
      const r: Rec = { src, count: 0, phase: old.get(src.id)?.phase ?? Math.random() * spacing, world: [], cum: [], u: [], emit: 0 };
      const L = toWorld(r);
      r.count = dotLayout(L, spacing).count;
      return r;
    });
    const total = recs.reduce((s, r) => s + r.count, 0);
    if (total > cap) {
      while (cap < total) cap *= 2;
      pos = new Float32Array(cap * 3); glow = new Float32Array(cap);
      geo.dispose(); setAttrs();
    }
  }

  const sampleAt = (r: Rec, s: number, out: THREE.Vector3): number => {
    // binary search segment; returns u
    const c = r.cum, n = c.length;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= s) lo = mid; else hi = mid; }
    const seg = c[hi] - c[lo];
    const k = seg > 1e-9 ? (s - c[lo]) / seg : 0;
    out.lerpVectors(r.world[lo], r.world[hi], k);
    const u = r.u;
    return u[lo] + (u[hi] - u[lo]) * k;
  };

  function spawnPacket(at: THREE.Vector3, power: number): void {
    const i = nextPacket; nextPacket = (nextPacket + 1) % MAX_PACKETS;
    const a = Math.random() * Math.PI * 2, r = 0.02 + Math.random() * 0.04;
    pPos[i * 3] = at.x + Math.cos(a) * r; pPos[i * 3 + 1] = at.y + Math.random() * 0.02; pPos[i * 3 + 2] = at.z + Math.sin(a) * r;
    const sp = 0.1 + Math.random() * 0.12;
    pVel[i * 3] = Math.cos(a) * sp; pVel[i * 3 + 1] = 0.22 + Math.random() * 0.16 + Math.min(0.2, power * 0.02); pVel[i * 3 + 2] = Math.sin(a) * sp;
    pLife[i] = 0; pDur[i] = 0.9 + Math.random() * 0.5;
  }

  function update(dt: number, sol: Solution, parts: Part[], on: boolean): void {
    group.visible = on;
    if (!on) return;
    const h = renderer.getContext().drawingBufferHeight;
    uPx.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const ok = sol.status === 'ok';
    let vmin = Infinity, vmax = -Infinity;
    for (const p of parts) for (const n of [p.a, p.b]) { const v = sol.node[n]; if (v !== undefined) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); } }
    if (!Number.isFinite(vmin)) { vmin = 0; vmax = 0; }
    const byId = new Map(parts.map((p) => [p.id, p]));
    let k = 0;
    for (const r of recs) {
      const p = byId.get(r.src.id);
      if (!p) continue;
      const L = toWorld(r);
      if (r.count === 0 || L <= 1e-6) continue;
      const sp = L / r.count;
      const res = sol.parts[p.id];
      const vel = ok && res ? electronVelocity(res.current) : 0;
      r.phase = advancePhase(r.phase, vel, dt, sp);
      const va = sol.node[p.a] ?? 0, vb = sol.node[p.b] ?? 0;
      for (let i = 0; i < r.count; i++) {
        const s = r.phase + i * sp;
        const u = sampleAt(r, s >= L ? s - L : s, tmp);
        pos[k * 3] = tmp.x; pos[k * 3 + 1] = tmp.y; pos[k * 3 + 2] = tmp.z;
        glow[k] = ok ? glowAt(potentialAlong(va, vb, u), vmin, vmax) : 0.15;
        k++;
      }
      // energy packets from components that turn electrical energy into light and heat
      if (ok && res && (p.kind === 'globe' || p.kind === 'resistor') && r.src.hot && res.power > 1e-4) {
        r.emit += packetRate(res.power) * dt;
        while (r.emit >= 1) { r.emit -= 1; spawnPacket(r.src.obj.localToWorld(tmp.copy(r.src.hot)), res.power); }
      }
    }
    geo.setDrawRange(0, k);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aGlow as THREE.BufferAttribute).needsUpdate = true;
    for (let i = 0; i < MAX_PACKETS; i++) {
      if (pLife[i] >= 1) continue;
      pLife[i] = Math.min(1, pLife[i] + dt / pDur[i]);
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      pVel[i * 3] *= 0.98; pVel[i * 3 + 2] *= 0.98;
    }
    (pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (pGeo.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
  }

  return {
    group,
    setSources,
    update,
    get dotCount() { return geo.drawRange.count; },
    dispose() {
      geo.dispose(); pGeo.dispose(); dotMat.dispose(); pMat.dispose();
      group.removeFromParent();
    },
  };
}

export type Flow = ReturnType<typeof createFlow>;
