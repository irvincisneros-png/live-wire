// Digital multimeters (ammeter in-line on an edge, voltmeter off the board with flying leads) and the adjustable
// bench power supply. These face the student (+z) whatever edge they are on, and reach their posts with leads.
import * as THREE from 'three';
import * as M from '../materials';
import type { InsulationColour } from '../materials';
import { canvas } from '../textures';
import { DIM, bakeStatic, glowSprite, mesh, rbox, sharedGeo } from './common';
import { createBananaPlug, createCable, plugExit } from './lead';

export type MeterKind = 'ammeter' | 'voltmeter' | 'supply';

export interface MeterModel extends THREE.Group {
  userData: {
    kind: MeterKind;
    /** post bases in the meter group's frame, the plug stack levels at each post, and the surface height function */
    connect(pa: THREE.Vector3, pb: THREE.Vector3, la: number, lb: number, ground?: (x: number, z: number) => number): void;
    /** show a reading (already formatted for the LCD) */
    setReading(digits: string, unit: string, blank?: boolean): void;
    update(s: { emf?: number; on?: boolean }, dt: number): void;
    sway(): void;
    setXray(on: boolean): void;
    flowPath: { pts: THREE.Vector3[]; u: number[] };
    /** footprint half-sizes for layout */
    half: [number, number];
  };
}

function faceText(lines: { t: string; x: number; y: number; size: number; color?: string; weight?: number; align?: CanvasTextAlign }[], w: number, h: number, bg: string | null): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  for (const l of lines) {
    ctx.fillStyle = l.color ?? '#e9e6dc';
    ctx.font = `${l.weight ?? 700} ${l.size}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = l.align ?? 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(l.t, l.x, l.y);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function jack(colour: number): THREE.Group {
  const g = new THREE.Group();
  const ring = mesh(sharedGeo('jack-ring-' + colour, () => new THREE.CylinderGeometry(0.022, 0.024, 0.012, 20).rotateX(Math.PI / 2)), M.plastic(colour, 0.35), false);
  const hole = mesh(sharedGeo('jack-hole', () => new THREE.CylinderGeometry(0.01, 0.01, 0.014, 12).rotateX(Math.PI / 2)), M.darkSteel(), false);
  hole.position.z = 0.0012;
  g.add(ring, hole);
  return g;
}

/** a short plug pushed into a jack, sticking out along +z; returns the cable exit point (local) */
function jackPlug(colour: InsulationColour): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(sharedGeo('jplug', () => new THREE.CylinderGeometry(0.019, 0.022, 0.06, 16).rotateX(Math.PI / 2).translate(0, 0, 0.036)), M.insulation(colour));
  const boot = mesh(sharedGeo('jplug-boot', () => new THREE.CylinderGeometry(0.012, 0.018, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, 0.08)), M.insulation(colour));
  g.add(body, boot);
  return g;
}

export function createMeter(kind: MeterKind): MeterModel {
  const g = new THREE.Group() as unknown as MeterModel;
  const lcd = M.createLcd(4, 256, 104);
  const body = new THREE.Group();
  g.add(body);
  const jackA = new THREE.Vector3(), jackB = new THREE.Vector3();
  let faceN = new THREE.Vector3(0, 0, 1);
  let colA: InsulationColour = 'black', colB: InsulationColour = 'red';
  let knob: THREE.Object3D | null = null, led: THREE.Mesh | null = null, ledGlow: THREE.Sprite | null = null;
  let half: [number, number] = [0.3, 0.2];

  if (kind === 'supply') {
    const W = 0.7, H = 0.34, D = 0.34;
    const caseM = new THREE.MeshPhysicalMaterial({ color: 0xd8d2c4, roughness: 0.48, metalness: 0.2, clearcoat: 0.3, clearcoatRoughness: 0.5 });
    const box = mesh(rbox(W, H, D, 0.03, 3), caseM); box.position.y = H / 2; body.add(box);
    const panel = mesh(rbox(W - 0.04, H - 0.05, 0.02, 0.008), M.plastic(0x202326, 0.45)); panel.position.set(0, H / 2, D / 2 + 0.002); body.add(panel);
    // ventilation slots on top
    for (let i = 0; i < 7; i++) { const s = mesh(rbox(0.3, 0.006, 0.012, 0.003), M.darkSteel(), false); s.position.set(0.06, H + 0.001, -0.12 + i * 0.03); body.add(s); }
    for (const sx of [-1, 1]) { const foot = mesh(rbox(0.08, 0.02, 0.06, 0.008), M.rubber()); foot.position.set(sx * 0.27, 0.0, 0.1); body.add(foot); }
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.11), lcd.material); scr.position.set(-0.17, H * 0.64, D / 2 + 0.0135); body.add(scr);
    const bez = mesh(rbox(0.3, 0.135, 0.008, 0.006), M.plastic(0x0e0f11, 0.3), false); bez.position.set(-0.17, H * 0.64, D / 2 + 0.009); body.add(bez);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.06), new THREE.MeshStandardMaterial({ map: faceText([{ t: 'DC SUPPLY  0–12 V', x: 256, y: 32, size: 34 }], 512, 64, null), transparent: true, roughness: 0.6 }));
    lbl.position.set(-0.17, H * 0.3, D / 2 + 0.0135); body.add(lbl);
    // big knurled voltage knob
    const k = new THREE.Group(); k.position.set(0.14, H * 0.55, D / 2 + 0.012);
    const kb = mesh(sharedGeo('psu-knob', () => {
      const gg = new THREE.CylinderGeometry(0.055, 0.06, 0.05, 40, 1);
      const pos = gg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x), q = 1 + 0.05 * Math.max(0, Math.cos(a * 20)); pos.setXYZ(i, x * q, pos.getY(i), z * q); }
      gg.computeVertexNormals();
      return gg.rotateX(Math.PI / 2).translate(0, 0, 0.025);
    }), M.plastic(0x15161a, 0.32));
    const mark = mesh(rbox(0.008, 0.035, 0.006, 0.002), M.paper(), false); mark.position.set(0, 0.03, 0.052);
    k.add(kb, mark); body.add(k); knob = k;
    led = new THREE.Mesh(sharedGeo('led', () => new THREE.SphereGeometry(0.011, 12, 8)), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff66, emissiveIntensity: 3 }));
    led.position.set(0.28, H * 0.82, D / 2 + 0.014); body.add(led);
    ledGlow = glowSprite(0x55ff88); ledGlow.position.copy(led.position); ledGlow.scale.setScalar(0.06); body.add(ledGlow);
    const jy = H * 0.24, jz = D / 2 + 0.013;
    const jn = jack(0x1b1c1f); jn.position.set(0.06, jy, jz); body.add(jn);
    const jp = jack(0xb3231b); jp.position.set(0.22, jy, jz); body.add(jp);
    const pl = faceText([{ t: '−', x: 32, y: 32, size: 48 }], 64, 64, null), pp = faceText([{ t: '+', x: 32, y: 32, size: 48 }], 64, 64, null);
    for (const [tx, x] of [[pl, 0.06], [pp, 0.22]] as const) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), new THREE.MeshBasicMaterial({ map: tx, transparent: true })); m.position.set(x, jy + 0.045, jz); body.add(m); }
    jackA.set(0.06, jy, jz); jackB.set(0.22, jy, jz);
    colA = 'black'; colB = 'red';
    half = [W / 2, D / 2];
    lcd.set('0.00', 'V');
  } else {
    const small = kind === 'ammeter';
    const W = small ? 0.36 : 0.5, H = small ? 0.56 : 0.8, T = small ? 0.085 : 0.11;
    const tilt = small ? 1.0 : 0.42;
    const holster = mesh(rbox(W, H, T, 0.045, 3), M.rubber(0xe2ac14)); holster.position.y = H / 2;
    const face = mesh(rbox(W - 0.06, H - 0.08, 0.02, 0.02, 2), M.plastic(0x2b2e33, 0.42)); face.position.set(0, H / 2, T / 2);
    const inner = new THREE.Group(); inner.add(holster, face);
    // LCD window
    const lw = W * 0.74, lh = lw * 104 / 256;
    const bez = mesh(rbox(lw + 0.03, lh + 0.03, 0.008, 0.008), M.plastic(0x111214, 0.3), false); bez.position.set(0, H * 0.78, T / 2 + 0.011); inner.add(bez);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), lcd.material); scr.position.set(0, H * 0.78, T / 2 + 0.0155); inner.add(scr);
    // selector dial with printed ranges
    const dial = new THREE.Group(); dial.position.set(0, H * 0.47, T / 2 + 0.01);
    const dr = W * 0.25;
    const ringTex = (() => {
      const [c, ctx] = canvas(256, 256);
      ctx.translate(128, 128);
      const labels = ['OFF', 'V⎓', 'V~', 'A⎓', 'mA', 'Ω'];
      labels.forEach((l, i) => {
        const a = -Math.PI / 2 - 1.2 + i * 0.48;
        const on = (kind === 'voltmeter' && l === 'V⎓') || (kind === 'ammeter' && l === 'A⎓');
        ctx.fillStyle = on ? '#ffd23a' : '#d9d6cc';
        ctx.font = `${on ? 800 : 600} 24px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(l, Math.cos(a) * 104, Math.sin(a) * 104);
        ctx.strokeStyle = '#d9d6cc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 80, Math.sin(a) * 80); ctx.lineTo(Math.cos(a) * 88, Math.sin(a) * 88); ctx.stroke();
      });
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(dr * 2.9, dr * 2.9), new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    ring.position.set(0, H * 0.47, T / 2 + 0.0105); inner.add(ring);
    const knobG = sharedGeo('dmm-knob-' + dr, () => {
      const p = [new THREE.Vector2(0, 0.03), new THREE.Vector2(dr * 0.92, 0.03), new THREE.Vector2(dr, 0.022), new THREE.Vector2(dr, 0.004), new THREE.Vector2(dr * 0.95, 0), new THREE.Vector2(0, 0)];
      return new THREE.LatheGeometry(p, 36).rotateX(Math.PI / 2);
    });
    const kb = mesh(knobG, M.plastic(0x18191c, 0.35)); dial.add(kb);
    const pointer = mesh(rbox(0.016, dr * 1.7, 0.02, 0.006), M.plastic(0x2c2f34, 0.4)); pointer.position.z = 0.035; dial.add(pointer);
    const tick = mesh(rbox(0.008, dr * 0.5, 0.004, 0.002), M.paper(), false); tick.position.set(0, dr * 0.55, 0.046); dial.add(tick);
    dial.rotation.z = kind === 'voltmeter' ? 1.2 - 0.48 : 1.2 - 3 * 0.48;
    inner.add(dial);
    // jacks: the ammeter's A jack (red) sits on the left so in-line leads do not cross; the voltmeter has COM on the left
    const jy = H * 0.14, jz = T / 2 + 0.012;
    const leftRed = small;
    const jl = jack(leftRed ? 0xb3231b : 0x1b1c1f); jl.position.set(-W * 0.2, jy, jz); inner.add(jl);
    const jr = jack(leftRed ? 0x1b1c1f : 0xb3231b); jr.position.set(W * 0.2, jy, jz); inner.add(jr);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.8, W * 0.1), new THREE.MeshBasicMaterial({ map: faceText(leftRed
      ? [{ t: 'A', x: 128 - 70, y: 16, size: 22, color: '#ff8a7a' }, { t: 'COM', x: 128 + 70, y: 16, size: 22 }]
      : [{ t: 'COM', x: 128 - 70, y: 16, size: 22 }, { t: 'V', x: 128 + 70, y: 16, size: 22, color: '#ff8a7a' }], 256, 32, null), transparent: true }));
    lbl.position.set(0, jy + 0.045, jz); inner.add(lbl);
    // tilt back and rest on the surface, with a wire kickstand
    inner.rotation.x = -tilt;
    body.add(inner);
    const stand = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-W * 0.35, 0.005, -Math.sin(tilt) * H * 0.95), new THREE.Vector3(-W * 0.35, Math.cos(tilt) * H * 0.55, -Math.sin(tilt) * H * 0.55 - 0.03), new THREE.Vector3(W * 0.35, Math.cos(tilt) * H * 0.55, -Math.sin(tilt) * H * 0.55 - 0.03), new THREE.Vector3(W * 0.35, 0.005, -Math.sin(tilt) * H * 0.95)]), 24, 0.006, 6), M.steel(), false);
    if (!small) body.add(stand);
    inner.updateMatrix();
    jackA.set(-W * 0.2, jy, jz).applyMatrix4(inner.matrix);
    jackB.set(W * 0.2, jy, jz).applyMatrix4(inner.matrix);
    faceN = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(1, 0, 0), -tilt);
    // ammeter: current enters red (a) and leaves COM (b). voltmeter: COM on a, red on b.
    colA = small ? 'red' : 'black'; colB = small ? 'black' : 'red';
    half = [W / 2, Math.sin(tilt) * H / 2 + T];
    lcd.set('', '', { blank: true });
  }

  bakeStatic(body, [knob, led, ledGlow].filter((x): x is THREE.Object3D => !!x));
  // leads: jack plug → cable → banana plug on the post
  const leadGroup = new THREE.Group(); g.add(leadGroup);
  const cables: ReturnType<typeof createCable>[] = [];
  const fp = { pts: [] as THREE.Vector3[], u: [] as number[] };
  const faceQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceN);
  const connect: MeterModel['userData']['connect'] = (pa, pb, la, lb, ground) => {
    for (const c of [...leadGroup.children]) leadGroup.remove(c);
    for (const c of cables) c.userData.dispose?.();
    cables.length = 0;
    const ends: THREE.Vector3[][] = [];
    for (const [post, level, jk, col] of [[pa, la, jackA, colA], [pb, lb, jackB, colB]] as const) {
      const jp = jackPlug(col); jp.position.copy(jk); jp.quaternion.copy(faceQ); leadGroup.add(jp);
      const exitJack = new THREE.Vector3(0, 0, 0.095).applyQuaternion(faceQ).add(jk);
      const plugBase = new THREE.Vector3(post.x, DIM.postTop + level * DIM.plugH, post.z);
      const plug = createBananaPlug(col, 1);
      plug.position.copy(plugBase);
      // turn the plug so its cable exit faces the meter
      const toMeter = new THREE.Vector3(jk.x - post.x, 0, jk.z - post.z);
      plug.rotation.y = Math.atan2(-toMeter.z, toMeter.x);
      leadGroup.add(plug);
      plug.updateMatrix();
      const exitPlug = plugExit(1).applyMatrix4(plug.matrix);
      const dirPlug = toMeter.lengthSq() > 1e-6 ? toMeter.clone().normalize().setY(0.25) : new THREE.Vector3(0, 1, 0);
      const span = exitJack.distanceTo(exitPlug);
      const c = createCable(col, 36, 8);
      c.userData.setPath({ p0: exitJack, d0: faceN.clone().setY(faceN.y - 0.6), p1: exitPlug, d1: dirPlug, h0: Math.min(0.3, 0.1 + span * 0.25), h1: Math.min(0.35, 0.12 + span * 0.25), sag: Math.min(0.5, span * 0.18), ground });
      leadGroup.add(c); cables.push(c);
      ends.push([new THREE.Vector3(post.x, DIM.lugY, post.z), plugBase.clone().setY(plugBase.y + 0.05), exitPlug, exitJack, jk.clone()]);
    }
    // flow path: post a → lead a (reversed) → through the body → lead b → post b
    const la2 = cables[0].userData.points().slice().reverse(), lb2 = cables[1].userData.points();
    const centre = new THREE.Vector3(0, kind === 'supply' ? 0.17 : 0.1, 0);
    const pts = [...ends[0].slice(0, 3), ...la2, ends[0][4], centre, ends[1][4], ...lb2, ...ends[1].slice(0, 3).reverse()];
    const iC = ends[0].length - 2 + la2.length + 1; // index of centre
    fp.pts = pts;
    fp.u = pts.map((_, i) => (kind === 'supply' ? (i < iC - 1 ? 0 : i > iC + 1 ? 1 : (i - (iC - 1)) / 2) : i / (pts.length - 1)));
  };

  let t = 0;
  g.userData = {
    kind, half, flowPath: fp, connect,
    setReading(digits, unit, blank = false) { lcd.set(digits, unit, { blank }); },
    sway() { for (const c of cables) c.userData.sway(0.05); },
    setXray(on) { for (const c of cables) c.userData.setXray(on); },
    update(s, dt) {
      t += dt;
      for (const c of cables) c.userData.update(dt);
      if (knob && s.emf !== undefined) knob.rotation.z += ((-(s.emf / 12) * 4.4 + 2.2) - knob.rotation.z) * (1 - Math.exp(-dt * 10));
      if (led && ledGlow) { const on = s.on !== false; (led.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 3 : 0; ledGlow.material.opacity = on ? 0.6 : 0; }
    },
  };
  g.name = kind;
  return g;
}
