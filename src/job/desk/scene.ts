// Shared 3D helpers for the desk jobs: energy packet streams, DOM label layer, light dimmer, small builders.
import * as THREE from 'three';
import type { KitStage } from '../../kit/stage';

/** A stream of glowing energy packets running along a curve. Density shows how much energy flows (a household picture, not charge dots). */
export class PacketStream {
  readonly mesh: THREE.InstancedMesh;
  /** packets on the curve right now (fractional values fade the last one in) */
  count = 0;
  /** path fractions per second */
  speed = 0.22;
  private curve: THREE.Curve<THREE.Vector3>;
  private readonly max: number;
  private phase = Math.random();
  private readonly m4 = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly sc = new THREE.Vector3();

  constructor(curve: THREE.Curve<THREE.Vector3>, color: number, o: { max?: number; size?: number; boost?: number } = {}) {
    this.curve = curve;
    this.max = o.max ?? 36;
    this.size = o.size ?? 0.12;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(o.boost ?? 2.4), toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat, this.max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 5;
  }
  private size: number;

  setCurve(c: THREE.Curve<THREE.Vector3>): void { this.curve = c; }

  update(dt: number): void {
    const n = Math.min(this.max, Math.ceil(this.count - 1e-6));
    this.mesh.count = Math.max(0, n);
    if (n <= 0) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.phase = (this.phase + dt * this.speed) % 1;
    for (let i = 0; i < n; i++) {
      const u = (this.phase + i / n) % 1;
      this.curve.getPointAt(u, this.p);
      const fadeEnds = Math.min(1, Math.sin(Math.PI * u) * 2.6);
      const fadeCount = i === n - 1 ? Math.min(1, this.count - (n - 1)) : 1;
      const k = this.size * Math.max(0.001, fadeEnds * fadeCount);
      this.sc.set(k, k, k);
      this.m4.compose(this.p, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

export interface LabelLayer {
  el: HTMLElement;
  add(el: HTMLElement, pos: () => THREE.Vector3, o?: { below?: boolean }): void;
  dispose(): void;
}

/** DOM labels pinned to world positions (readable text, selectable, screen-reader friendly). */
export function createLabelLayer(view: HTMLElement, stage: KitStage): LabelLayer {
  const el = document.createElement('div');
  el.className = 'dk-labels';
  view.appendChild(el);
  const items: { el: HTMLElement; pos: () => THREE.Vector3; below: boolean }[] = [];
  const off = stage.onFrame(() => {
    for (const it of items) {
      const p = stage.toScreen(it.pos());
      it.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, ${it.below ? '8%' : '-108%'})`;
      it.el.style.visibility = p.visible ? '' : 'hidden';
    }
  });
  return {
    el,
    add(label, pos, o = {}) { el.appendChild(label); items.push({ el: label, pos, below: !!o.below }); },
    dispose() { off(); el.remove(); items.length = 0; },
  };
}

export interface LightDimmer {
  /** 1 = full light, 0 = dark. */
  set(k: number): void;
  /** call again after adding lights */
  rescan(): void;
}

/** Scales every light in the scene (and the environment) together, for "the power went out" and for the day cycle. */
export function lightDimmer(stage: KitStage): LightDimmer {
  let lights: { l: THREE.Light; base: number }[] = [];
  let envBase = stage.scene.environmentIntensity;
  const rescan = () => {
    lights = [];
    stage.scene.traverse((o) => { const l = o as THREE.Light; if (l.isLight && !o.userData.noDim) lights.push({ l, base: l.intensity }); });
    envBase = stage.scene.environmentIntensity;
  };
  rescan();
  return {
    rescan,
    set(k) {
      for (const x of lights) x.l.intensity = x.base * k;
      stage.scene.environmentIntensity = envBase * k;
    },
  };
}

/** Ease a number toward a target with a time constant (frame-rate independent). */
export function approach(cur: number, target: number, dt: number, rate = 8): number {
  return cur + (target - cur) * (1 - Math.exp(-dt * rate));
}

/** A catmull-rom curve through points. */
export function curveThrough(pts: THREE.Vector3[], tension = 0.5): THREE.CatmullRomCurve3 {
  const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', tension);
  c.arcLengthDivisions = 100;
  return c;
}

/** Remove a group from its parent and dispose what it owns (shared kit resources are skipped). */
export { disposeTree } from '../../kit/dispose';
