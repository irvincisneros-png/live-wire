// Knife switch: brass blade hinged at terminal a, closing into a sprung jaw at terminal b, on a ceramic base.
import * as THREE from 'three';
import * as M from '../materials';
import { DIM, bakeStatic, lugs, mesh, rbox, screw, sharedGeo } from './common';

export interface SwitchModel extends THREE.Group {
  userData: { update(s: { closed?: boolean }, dt: number): void; flowPath: { pts: THREE.Vector3[]; u: number[] }; bladeAngle(): number };
}

const OPEN_ANGLE = 1.0; // radians the blade lifts when open
const HINGE_X = -0.2, JAW_X = 0.2, BLADE_Y = 0.105;

export function createSwitch(): SwitchModel {
  const g = new THREE.Group() as unknown as SwitchModel;
  const base = mesh(rbox(0.58, 0.05, 0.22, 0.02, 3), M.ceramic()); base.position.y = 0.025; g.add(base);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const sc = screw(0.012, 0.008); sc.position.set(sx * 0.255, 0.05, sz * 0.075); g.add(sc); }
  // hinge block with two cheeks
  const block = (x: number) => {
    const b = mesh(rbox(0.07, 0.02, 0.09, 0.006), M.brass()); b.position.set(x, 0.06, 0); g.add(b);
    for (const z of [-0.022, 0.022]) { const ch = mesh(rbox(0.05, 0.075, 0.012, 0.005), M.brass()); ch.position.set(x, 0.095, z); g.add(ch); }
    const ts = screw(0.02, 0.014, M.brass()); ts.position.set(x + (x < 0 ? -0.07 : 0.07), 0.05, 0); g.add(ts);
  };
  block(HINGE_X); block(JAW_X);
  const pin = mesh(sharedGeo('sw-pin', () => new THREE.CylinderGeometry(0.008, 0.008, 0.07, 12).rotateX(Math.PI / 2)), M.nickel(), false);
  pin.position.set(HINGE_X, BLADE_Y, 0); g.add(pin);
  // terminal straps to the lugs
  for (const s of [-1, 1]) { const st = mesh(rbox(0.1, 0.006, 0.03, 0.003), M.brass()); st.position.set(s * 0.25, 0.052, 0); g.add(st); }
  g.add(lugs(0.29, 0.05));
  // blade on a pivot at the hinge
  const pivot = new THREE.Group(); pivot.position.set(HINGE_X, BLADE_Y, 0); g.add(pivot);
  const len = JAW_X - HINGE_X + 0.07;
  const blade = mesh(rbox(len, 0.05, 0.018, 0.006), M.brass()); blade.position.set(len / 2 - 0.01, 0, 0); pivot.add(blade);
  // insulated handle: bakelite cross-bar and knob
  const stalk = mesh(sharedGeo('sw-stalk', () => new THREE.CylinderGeometry(0.008, 0.008, 0.06, 10)), M.nickel(), false); stalk.position.set(len - 0.01, 0.04, 0); pivot.add(stalk);
  const knob = mesh(sharedGeo('sw-knob', () => {
    const p = [new THREE.Vector2(0, 0), new THREE.Vector2(0.018, 0), new THREE.Vector2(0.026, 0.02), new THREE.Vector2(0.028, 0.05), new THREE.Vector2(0.022, 0.072), new THREE.Vector2(0, 0.078)];
    return new THREE.LatheGeometry(p, 24);
  }), M.plastic(0x16110e, 0.3)); knob.position.set(len - 0.01, 0.06, 0); pivot.add(knob);

  bakeStatic(g, [pivot]);
  bakeStatic(pivot);
  let angle = OPEN_ANGLE, closedNow = false;
  const flowFor = () => {
    const tip = new THREE.Vector3(len - 0.03, 0, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), angle).add(pivot.position);
    return [new THREE.Vector3(-0.5, DIM.lugY, 0), new THREE.Vector3(-0.3, 0.06, 0), new THREE.Vector3(HINGE_X, 0.08, 0), pivot.position.clone(), tip, new THREE.Vector3(JAW_X, 0.08, 0), new THREE.Vector3(0.3, 0.06, 0), new THREE.Vector3(0.5, DIM.lugY, 0)];
  };
  const fp = { pts: flowFor(), u: [0, 0, 0, 0, 1, 1, 1, 1].map((x, i) => (i < 4 ? 0 : x)) };
  g.userData = {
    flowPath: fp,
    bladeAngle: () => angle,
    update(s, dt) {
      closedNow = !!s.closed;
      const target = closedNow ? 0 : OPEN_ANGLE;
      if (Math.abs(target - angle) > 1e-4) {
        // snap shut quickly with a tiny overshoot into the jaw; open a little slower
        angle += (target - angle) * (1 - Math.exp(-dt * (closedNow ? 16 : 10)));
        if (Math.abs(target - angle) < 1e-3) angle = target;
        pivot.rotation.z = angle;
        fp.pts = flowFor();
      }
    },
  };
  pivot.rotation.z = angle;
  g.name = 'switch';
  return g;
}
