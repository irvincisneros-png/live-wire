// Fixed-wiring cable runs for the training house: a polyline with radiused bends, clipped to the framing with
// saddle clips, a little sag between clips on long overhead runs, rubber grommets where it passes through studs,
// and lettered cable markers. A run can be shown with a break (Job 1 reveal) and repaired with a crimp joiner.
import * as THREE from 'three';
import * as M from '../../kit/materials';
import type { InsulationColour } from '../../kit/materials';
import type { HouseMats } from './mats';

export const CABLE_R = 0.045;

export interface RouteOpts {
  radius?: number;
  /** bend radius at each corner */
  bend?: number;
  /** distance between saddle clips on straight runs (0 = no clips) */
  clipEvery?: number;
  /** surface the run is fixed to, for clip orientation (defaults to the wall face, +z) */
  surface?: (mid: THREE.Vector3, dir: THREE.Vector3) => THREE.Vector3;
  /** droop between clips on near-horizontal runs */
  sag?: number;
  /** x positions of studs the run passes through (horizontal runs inside the cavity get grommets) */
  studsX?: number[];
  /** cable marker text and where along the run (0..1) */
  marker?: { text: string; at?: number; near?: THREE.Vector3 };
}

export interface CableRun {
  group: THREE.Group;
  colour: InsulationColour;
  /** dense centreline, start to end */
  points: THREE.Vector3[];
  length: number;
  /** where the marker sits (0..1), or 0.5 */
  markerT: number;
  pointAt(t: number): THREE.Vector3;
  /** show a gap at fraction t (exposed copper ends) */
  showBreak(t: number): void;
  /** close the gap with a crimp joiner */
  repair(): void;
  setXray(on: boolean): void;
  dispose(): void;
}

interface Seg { pts: THREE.Vector3[]; straight: boolean; dir: THREE.Vector3; len: number }

function densify(poly: THREE.Vector3[], bend: number, step: number): Seg[] {
  const segs: Seg[] = [];
  const n = poly.length;
  let cur = poly[0].clone();
  for (let i = 1; i < n; i++) {
    const p = poly[i];
    const dIn = new THREE.Vector3().subVectors(p, poly[i - 1]);
    const lIn = dIn.length(); dIn.normalize();
    let end = p.clone(), arc: THREE.Vector3[] | null = null;
    if (i < n - 1) {
      const dOut = new THREE.Vector3().subVectors(poly[i + 1], p);
      const lOut = dOut.length(); dOut.normalize();
      const r = Math.min(bend, lIn * 0.45, lOut * 0.45);
      if (r > 1e-3 && dIn.dot(dOut) < 0.999) {
        end = p.clone().addScaledVector(dIn, -r);
        const b = p.clone().addScaledVector(dOut, r);
        const q = new THREE.QuadraticBezierCurve3(end, p.clone(), b);
        arc = q.getPoints(8);
      }
    }
    const L = cur.distanceTo(end);
    const m = Math.max(1, Math.ceil(L / step));
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= m; k++) pts.push(cur.clone().lerp(end, k / m));
    segs.push({ pts, straight: true, dir: dIn.clone(), len: L });
    if (arc) { segs.push({ pts: arc, straight: false, dir: dIn.clone(), len: 0 }); cur = arc[arc.length - 1].clone(); }
    else cur = end.clone();
  }
  return segs;
}

/** geometries for a white plastic saddle clip (local x = cable, local +z = away from the surface the cable lies on) */
function clipGeos(r: number) {
  const dome = new THREE.CylinderGeometry(r + 0.026, r + 0.026, 0.16, 14, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2);
  const foot = new THREE.BoxGeometry(0.16, 0.07, 0.022);
  const nail = new THREE.CylinderGeometry(0.017, 0.017, 0.012, 10).rotateX(Math.PI / 2);
  return { dome, foot, nail };
}

export function buildRoute(poly: THREE.Vector3[], colour: InsulationColour, mats: HouseMats, o: RouteOpts = {}): CableRun {
  const r = o.radius ?? CABLE_R;
  const group = new THREE.Group();
  group.name = 'cable';
  const segs = densify(poly, o.bend ?? 0.45, 0.2);
  const clipEvery = o.clipEvery ?? 2.6;
  const sag = o.sag ?? 0;
  const surface = o.surface ?? (() => new THREE.Vector3(0, 0, 1));
  const clips: { pos: THREE.Vector3; dir: THREE.Vector3; nrm: THREE.Vector3 }[] = [];
  const dense: THREE.Vector3[] = [];
  for (const s of segs) {
    let pts = s.pts;
    if (s.straight && s.len > 0.6) {
      const horiz = Math.abs(s.dir.y) < 0.15;
      if (clipEvery > 0 && s.len > clipEvery * 0.6) {
        const nC = Math.max(1, Math.floor(s.len / clipEvery));
        const gap = s.len / nC;
        for (let k = 0; k <= nC; k++) {
          const d = k * gap;
          if (d < 0.25 || d > s.len - 0.25) continue;
          const pos = s.pts[0].clone().addScaledVector(s.dir, d);
          clips.push({ pos, dir: s.dir.clone(), nrm: surface(pos, s.dir).clone().normalize() });
        }
        if (sag > 0 && horiz) {
          pts = pts.map((p) => {
            const d = p.distanceTo(s.pts[0]);
            const k = (d % gap) / gap;
            return p.clone().setY(p.y - sag * Math.sin(Math.PI * k) * Math.min(1, gap / 3));
          });
        }
      }
    }
    for (const p of pts) if (!dense.length || dense[dense.length - 1].distanceToSquared(p) > 1e-6) dense.push(p);
  }
  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + dense[i].distanceTo(dense[i - 1]));
  const length = cum[cum.length - 1];
  const pointAt = (t: number): THREE.Vector3 => {
    const s = Math.max(0, Math.min(1, t)) * length;
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const k = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return dense[i - 1].clone().lerp(dense[i], k);
  };
  const tubeOf = (pts: THREE.Vector3[]) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    return new THREE.TubeGeometry(curve, Math.max(8, Math.round(pts.length * 1.6)), r, 9, false);
  };
  let mat: THREE.Material = M.insulation(colour);
  const tubes: THREE.Mesh[] = [];
  const setTubes = (list: THREE.Vector3[][]) => {
    for (const t of tubes) { t.geometry.dispose(); t.removeFromParent(); }
    tubes.length = 0;
    for (const pts of list) {
      if (pts.length < 2) continue;
      const m = new THREE.Mesh(tubeOf(pts), mat); m.castShadow = true; m.receiveShadow = true;
      group.add(m); tubes.push(m);
    }
  };
  setTubes([dense]);

  // saddle clips
  const own: THREE.Material[] = [];
  if (clips.length) {
    const cg = clipGeos(r);
    for (const c of clips) {
      const x = c.dir.clone().normalize();
      const z = c.nrm.clone().addScaledVector(x, -c.nrm.dot(x));
      if (z.lengthSq() < 0.25) continue;
      z.normalize();
      const y = new THREE.Vector3().crossVectors(z, x);
      const cm = new THREE.Group();
      const dome = new THREE.Mesh(cg.dome, mats.whitePlastic); dome.castShadow = true;
      cm.add(dome);
      for (const s of [-1, 1]) {
        const f = new THREE.Mesh(cg.foot, mats.whitePlastic); f.position.set(0, s * (r + 0.06), -r + 0.011); cm.add(f);
      }
      const n = new THREE.Mesh(cg.nail, mats.galv); n.position.set(0, r + 0.06, -r + 0.026); cm.add(n);
      cm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      cm.position.copy(c.pos);
      group.add(cm);
    }
  }

  // grommets where a horizontal cavity run passes through a stud
  if (o.studsX?.length) {
    const ring = new THREE.TorusGeometry(r + 0.022, 0.022, 6, 16);
    ring.rotateY(Math.PI / 2);
    for (const s of segs) {
      if (!s.straight || Math.abs(s.dir.x) < 0.95) continue;
      const a = s.pts[0], b = s.pts[s.pts.length - 1];
      if (Math.abs(a.z) > 0.42) continue;
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      for (const sx of o.studsX) {
        if (sx - 0.3 < lo || sx + 0.3 > hi) continue;
        for (const f of [-0.235, 0.235]) {
          const g = new THREE.Mesh(ring, mats.grommet);
          g.position.set(sx + f, a.y, a.z);
          group.add(g);
        }
      }
    }
  }

  // lettered marker sleeve
  let markerTex: THREE.Texture | null = null;
  let markerT = 0.5;
  if (o.marker?.near) {
    let best = 0, bd = Infinity;
    dense.forEach((p, i) => { const d = p.distanceToSquared(o.marker!.near!); if (d < bd) { bd = d; best = i; } });
    markerT = cum[best] / length;
  } else if (o.marker?.at !== undefined) markerT = o.marker.at;
  if (o.marker) {
    const at = markerT;
    const p = pointAt(at), q = pointAt(Math.min(1, at + 0.01));
    const dir = q.sub(p).normalize();
    markerTex = M.labelTexture(o.marker.text, { width: 64, height: 64, bg: '#f4f2ea', fg: '#111', size: 44 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.55 }); own.push(sleeveMat);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.022, r + 0.022, 0.42, 14), sleeveMat);
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    sleeve.position.copy(p);
    const tagMat = new THREE.MeshStandardMaterial({ map: markerTex, roughness: 0.6, transparent: true }); own.push(tagMat);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), tagMat);
    tag.position.copy(p).add(new THREE.Vector3(0, 0, r + 0.026));
    group.add(sleeve, tag);
  }

  // break / repair
  let extras: THREE.Object3D[] = [];
  const clearExtras = () => { for (const e of extras) { e.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); e.removeFromParent(); } extras = []; };
  let breakAt = -1;
  const splice = (t: number, half: number) => {
    const s0 = t * length - half, s1 = t * length + half;
    const a: THREE.Vector3[] = [], b: THREE.Vector3[] = [];
    for (let i = 0; i < dense.length; i++) { if (cum[i] <= s0) a.push(dense[i]); else if (cum[i] >= s1) b.push(dense[i]); }
    a.push(pointAt(s0 / length)); b.unshift(pointAt(s1 / length));
    return [a, b] as const;
  };
  const crimpMat = new THREE.MeshPhysicalMaterial({ color: 0x2f6fd0, roughness: 0.35, clearcoat: 0.5 });

  const run: CableRun = {
    group, colour, points: dense, length, pointAt, markerT,
    showBreak(t) {
      breakAt = t;
      clearExtras();
      const [a, b] = splice(t, 0.42);
      setTubes([a, b]);
      // bare copper tails sticking out of each cut end
      for (const [end, prev] of [[a[a.length - 1], a[a.length - 2]], [b[0], b[1]]] as const) {
        const dir = end.clone().sub(prev).normalize();
        const cu = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.42, 0.2, 8), mats.copperBare);
        cu.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        cu.position.copy(end).addScaledVector(dir, 0.09);
        group.add(cu); extras.push(cu);
      }
    },
    repair() {
      clearExtras();
      setTubes([dense]);
      if (breakAt < 0) return;
      const p = pointAt(breakAt), dir = pointAt(Math.min(1, breakAt + 0.01)).sub(p).normalize();
      const crimp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.5, 16), crimpMat);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.08, 16), crimpMat);
      crimp.add(body, band);
      crimp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      crimp.position.copy(p);
      group.add(crimp); extras.push(crimp);
    },
    setXray(on) {
      mat = on ? M.insulationXray(colour) : M.insulation(colour);
      for (const t of tubes) { t.material = mat; t.castShadow = !on; }
    },
    dispose() {
      clearExtras();
      crimpMat.dispose();
      own.forEach((m) => m.dispose());
      const geos = new Set<THREE.BufferGeometry>();
      group.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) geos.add(m.geometry); });
      geos.forEach((g) => g.dispose());
      markerTex?.dispose();
      group.removeFromParent();
    },
  };
  return run;
}
