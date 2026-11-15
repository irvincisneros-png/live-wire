// Insulated test lead: stackable banana plugs and a cable that sags along a bezier, clamped so it lies on surfaces.
import * as THREE from 'three';
import * as M from '../materials';
import type { InsulationColour } from '../materials';
import { DIM, bakeStatic, mesh, sharedGeo } from './common';

export const CABLE_R = 0.017;

/** a vertical stackable banana plug; origin at its base (sits on a post cap or on the plug below) */
export function createBananaPlug(colour: InsulationColour, exitSide: 1 | -1 = 1): THREE.Group {
  const g = new THREE.Group();
  const sleeve = sharedGeo('plug-sleeve', () => {
    const p: THREE.Vector2[] = [new THREE.Vector2(0.012, 0)];
    p.push(new THREE.Vector2(0.026, 0.002), new THREE.Vector2(0.03, 0.01));
    for (let i = 0; i < 6; i++) { const y = 0.014 + i * 0.01; p.push(new THREE.Vector2(DIM.plugR, y), new THREE.Vector2(DIM.plugR - 0.003, y + 0.005)); }
    p.push(new THREE.Vector2(DIM.plugR, 0.078), new THREE.Vector2(0.03, 0.09), new THREE.Vector2(0.02, 0.094), new THREE.Vector2(0.016, 0.094));
    return new THREE.LatheGeometry(p, 28);
  });
  const ins = M.insulation(colour === 'greenYellow' ? 'yellow' : colour);
  g.add(mesh(sleeve, ins));
  // nickel stacking socket on top
  const top = mesh(sharedGeo('plug-top', () => new THREE.LatheGeometry([new THREE.Vector2(0.008, 0.088), new THREE.Vector2(0.017, 0.09), new THREE.Vector2(0.017, DIM.plugH - 0.002), new THREE.Vector2(0.012, DIM.plugH), new THREE.Vector2(0.008, DIM.plugH - 0.004)], 20)), M.nickel(), false);
  g.add(top);
  // pin (mostly hidden in the socket below)
  const pin = mesh(sharedGeo('plug-pin', () => new THREE.CylinderGeometry(0.0085, 0.0075, 0.03, 12).translate(0, -0.012, 0)), M.nickel(), false);
  g.add(pin);
  // side cable boss with a strain-relief taper
  const boss = mesh(sharedGeo('plug-boss', () => new THREE.CylinderGeometry(0.019, 0.024, 0.04, 16).rotateZ(-Math.PI / 2).translate(0.035, 0.056, 0)), ins);
  if (exitSide < 0) boss.scale.x = -1;
  g.add(boss);
  return g;
}

/** local point where the cable leaves a plug */
export const plugExit = (side: 1 | -1): THREE.Vector3 => new THREE.Vector3(side * 0.058, 0.056, 0);

export interface LeadPath {
  p0: THREE.Vector3; d0: THREE.Vector3;
  p1: THREE.Vector3; d1: THREE.Vector3;
  /** handle lengths */
  h0?: number; h1?: number;
  /** extra droop of the handles (gravity) */
  sag?: number;
  /** surface height under (x, z) in the lead's frame; the cable never goes below it */
  ground?: (x: number, z: number) => number;
}

export interface LeadData {
  setPath(p: LeadPath): void;
  /** start the settle/sway animation */
  sway(amount?: number): void;
  /** per frame; returns true while animating */
  update(dt: number): boolean;
  setXray(on: boolean): void;
  /** current sampled centreline, p0 → p1 */
  points(): THREE.Vector3[];
  dispose?: () => void;
}

/** a cable mesh following a bezier; the group is in whatever frame the path points are given in */
export function createCable(colour: InsulationColour, segments = 40, radial = 10): THREE.Group & { userData: LeadData } {
  const g = new THREE.Group() as THREE.Group & { userData: LeadData };
  const cable = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(new THREE.BufferGeometry(), M.insulation(colour));
  cable.castShadow = true; cable.receiveShadow = true;
  g.add(cable);
  let path: LeadPath | null = null;
  let pts: THREE.Vector3[] = [];
  let swayT = 10, swayAmp = 0;
  const build = (wob: number) => {
    if (!path) return;
    const { p0, d0, p1, d1 } = path;
    const span = p0.distanceTo(p1);
    const h0 = path.h0 ?? Math.min(0.45, 0.25 + span * 0.12), h1 = path.h1 ?? h0;
    const sag = path.sag ?? 0;
    const c0 = p0.clone().addScaledVector(d0.clone().normalize(), h0); c0.y -= sag;
    const c1 = p1.clone().addScaledVector(d1.clone().normalize(), h1); c1.y -= sag;
    if (wob !== 0) {
      const side = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3(0, 1, 0)).normalize();
      c0.addScaledVector(side, wob * 0.6).y += wob * 0.5;
      c1.addScaledVector(side, -wob * 0.4).y += wob * 0.7;
    }
    const bez = new THREE.CubicBezierCurve3(p0, c0, c1, p1);
    const n = Math.max(12, Math.round(segments * Math.min(2.5, 0.6 + span * 0.5)));
    pts = bez.getSpacedPoints(n);
    if (path.ground) for (const p of pts) p.y = Math.max(p.y, path.ground(p.x, p.z) + CABLE_R);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, n, CABLE_R, radial, false);
    cable.geometry.dispose();
    cable.geometry = geo;
  };
  g.userData = {
    setPath(p) { path = p; build(0); },
    sway(a = 0.08) { swayT = 0; swayAmp = a; },
    update(dt) {
      if (swayT > 2) return false;
      swayT += dt;
      const w = swayAmp * Math.exp(-swayT * 3.2) * Math.sin(swayT * 10);
      build(swayT > 2 ? 0 : w);
      return true;
    },
    setXray(on) { cable.material = on ? M.insulationXray(colour) : M.insulation(colour); cable.castShadow = !on; },
    points: () => pts,
  };
  g.userData.dispose = () => cable.geometry.dispose();
  return g;
}

/**
 * A wire on a bench edge: plug on post a (at x = −0.5) and post b (x = +0.5), stacked at the given levels,
 * with the cable arching between them. Local frame of the edge.
 */
export function createEdgeLead(colour: InsulationColour, levelA = 0, levelB = 0): THREE.Group {
  const g = new THREE.Group();
  const ya = DIM.postTop + levelA * DIM.plugH, yb = DIM.postTop + levelB * DIM.plugH;
  const pa = createBananaPlug(colour, 1); pa.position.set(-0.5, ya, 0);
  const pb = createBananaPlug(colour, -1); pb.position.set(0.5, yb, 0);
  g.add(pa, pb);
  bakeStatic(g);
  const cable = createCable(colour);
  const e0 = plugExit(1).add(pa.position), e1 = plugExit(-1).add(pb.position);
  cable.userData.setPath({ p0: e0, d0: new THREE.Vector3(1, 0.55, 0), p1: e1, d1: new THREE.Vector3(-1, 0.55, 0), h0: 0.28, h1: 0.28, sag: 0.02 });
  g.add(cable);
  g.userData.cable = cable;
  // dots run from the post axis up through plug a, along the cable, down plug b
  const flow = () => {
    const c = cable.userData.points();
    return [new THREE.Vector3(-0.5, DIM.lugY, 0), new THREE.Vector3(-0.5, ya + 0.05, 0), ...c, new THREE.Vector3(0.5, yb + 0.05, 0), new THREE.Vector3(0.5, DIM.lugY, 0)];
  };
  g.userData.flowPathFn = () => { const pts = flow(); return { pts, u: pts.map((_, i) => i / (pts.length - 1)) }; };
  return g;
}
