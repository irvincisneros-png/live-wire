// The Stage owns the renderer, the frame loop, the orbit camera, post-processing, environment and lights.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { QualityTier, Stage, StageOptions } from '../types';
import { MOODS, backdropTexture, buildEnvironment, type Mood } from './env';
import { blobTexture } from './textures';

export interface OrbitView { target?: [number, number, number]; distance?: number; yaw?: number; pitch?: number }

/** Stage plus kit-level extras (all optional for callers that only know the `Stage` contract) */
export interface KitStage extends Stage {
  readonly mood: Mood;
  /** change what resetView() returns to (and, unless the user has moved the camera, go there now) */
  setHome(o: OrbitView & { minDistance?: number; maxDistance?: number }, moveNow?: boolean): void;
  /** the user has orbited / zoomed / panned since the last resetView or setHome */
  readonly userMoved: boolean;
  /** subscribe to container resizes (w, h in CSS px). Returns unsubscribe. */
  onResize(cb: (w: number, h: number) => void): () => void;
  readonly keyLight: THREE.DirectionalLight;
  /** limit panning so the target stays within this XZ box */
  setPanBounds(minX: number, maxX: number, minZ: number, maxZ: number): void;
  /** world-to-CSS-pixel projection relative to the container */
  toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean };
}

const PIXEL_CAP: Record<QualityTier, number> = { low: 1, medium: 1.5, high: 2 };
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createStage(container: HTMLElement, quality: QualityTier, opts: StageOptions = {}): KitStage {
  const mood: Mood = opts.mood ?? 'workshop';
  const def = MOODS[mood];
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_CAP[quality]));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = def.exposure;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.classList.add('lw-stage-canvas');
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none' });
  container.appendChild(canvas);

  const vignette = document.createElement('div');
  vignette.className = 'lw-stage-vignette';
  Object.assign(vignette.style, { position: 'absolute', inset: '0', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)' });
  container.appendChild(vignette);

  const scene = new THREE.Scene();
  const bg = backdropTexture(mood);
  scene.background = bg;
  scene.fog = new THREE.Fog(def.fog, def.fogNear, def.fogFar);
  let envRT = buildEnvironment(renderer, mood);
  scene.environment = envRT.texture;
  scene.environmentIntensity = def.envIntensity;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);

  // lights
  const key = new THREE.DirectionalLight(def.key.color, def.key.intensity);
  key.position.set(...def.key.pos);
  key.castShadow = quality !== 'low';
  if (key.castShadow) {
    key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    const sc = key.shadow.camera;
    sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 25;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = quality === 'high' ? 5 : 3;
  }
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight(def.fill.sky, def.fill.ground, def.fill.intensity);
  scene.add(hemi);
  const rim = new THREE.DirectionalLight(def.rim.color, def.rim.intensity);
  rim.position.set(...def.rim.pos);
  scene.add(rim);

  // post
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  const makeComposer = () => {
    if (quality === 'low') return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 2 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.5, 3.2);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  };
  makeComposer();

  // orbit state
  const home = {
    target: new THREE.Vector3(...(opts.target ?? [0, 0, 0])),
    distance: opts.distance ?? 8, yaw: opts.yaw ?? 0, pitch: opts.pitch ?? 0.85,
  };
  let minD = opts.minDistance ?? 2, maxD = opts.maxDistance ?? 30;
  const cur = { target: home.target.clone(), distance: home.distance, yaw: home.yaw, pitch: home.pitch };
  const goal = { target: home.target.clone(), distance: home.distance, yaw: home.yaw, pitch: home.pitch };
  let locked = !!opts.lockCamera;
  let userMoved = false;
  let panBounds: [number, number, number, number] | null = null;
  const PITCH_MIN = 0.14, PITCH_MAX = 1.45;
  const clampGoal = () => {
    goal.distance = Math.min(maxD, Math.max(minD, goal.distance));
    goal.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, goal.pitch));
    // never under the table: keep the camera at least 0.35 above y = 0
    const minSin = (0.35 - goal.target.y) / goal.distance;
    if (minSin > Math.sin(goal.pitch)) goal.pitch = Math.asin(Math.min(0.99, minSin));
    if (panBounds) {
      goal.target.x = Math.min(panBounds[1], Math.max(panBounds[0], goal.target.x));
      goal.target.z = Math.min(panBounds[3], Math.max(panBounds[2], goal.target.z));
    }
  };
  let tween: { from: typeof cur & { target: THREE.Vector3 }; to: typeof goal; t: number; dur: number } | null = null;

  const applyCamera = () => {
    const cp = Math.cos(cur.pitch);
    camera.position.set(
      cur.target.x + cur.distance * Math.sin(cur.yaw) * cp,
      cur.target.y + cur.distance * Math.sin(cur.pitch),
      cur.target.z + cur.distance * Math.cos(cur.yaw) * cp,
    );
    camera.lookAt(cur.target);
  };
  applyCamera();

  // pointer input
  const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; button: number; shift: boolean }>();
  let dragging = false, lastDragEnd = -1e9, pinchD = 0, pinchMid = { x: 0, y: 0 };
  const panBy = (dx: number, dy: number) => {
    const h = canvas.clientHeight || 1;
    const k = (2 * goal.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h;
    const right = new THREE.Vector3(Math.cos(goal.yaw), 0, -Math.sin(goal.yaw));
    const fwd = new THREE.Vector3(-Math.sin(goal.yaw), 0, -Math.cos(goal.yaw));
    goal.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k / Math.max(0.35, Math.sin(goal.pitch)));
  };
  const onDown = (e: PointerEvent) => {
    if (locked && e.pointerType !== 'touch') { /* still track for tap detection */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, shift: e.shiftKey || e.ctrlKey || e.metaKey });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y); pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    tween = null;
  };
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!dragging && (Math.hypot(p.x - p.sx, p.y - p.sy) > 7 || pointers.size > 1)) dragging = true;
    if (!dragging || locked) return;
    if (pointers.size === 1) {
      if (p.button === 2 || p.button === 1 || p.shift) panBy(dx, dy);
      else { goal.yaw -= dx * 0.0055; goal.pitch += dy * 0.0045; }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchD > 0 && d > 0) goal.distance *= pinchD / d;
      panBy(mid.x - pinchMid.x, mid.y - pinchMid.y);
      pinchD = d; pinchMid = mid;
    }
    userMoved = true;
    clampGoal();
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && dragging) { dragging = false; lastDragEnd = performance.now(); }
    if (pointers.size === 1) { const [a] = [...pointers.values()]; a.sx = a.x; a.sy = a.y; }
  };
  const onWheel = (e: WheelEvent) => {
    if (locked) return;
    e.preventDefault();
    goal.distance *= Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.0012)));
    userMoved = true; tween = null;
    clampGoal();
  };
  const onContext = (e: Event) => e.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContext);

  // keyboard free view: W A S D or the arrow keys glide over the scene, Q / E turn, R / F (or + / −) zoom
  const held = new Set<string>();
  const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract']);
  const typing = (t: EventTarget | null): boolean => { const el = t as HTMLElement | null; return !!el && !!el.closest && !!el.closest('input, textarea, select, [contenteditable="true"]'); };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!MOVE_KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || locked || !onScreen) return;
    if (typing(e.target)) return;
    // arrow keys only steer the camera when focus is on the page or inside the 3D view, so they still scroll panels and move between tabs
    if (e.code.startsWith('Arrow')) { const t = e.target; if (t instanceof HTMLElement && t !== document.body && t !== document.documentElement && !container.contains(t)) return; e.preventDefault(); }
    held.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => { held.delete(e.code); };
  const onBlur = () => held.clear();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // resize & visibility
  const resizeCbs = new Set<(w: number, h: number) => void>();
  let W = 1, H = 1;
  const resize = () => {
    W = Math.max(1, container.clientWidth); H = Math.max(1, container.clientHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    if (composer) composer.setSize(W, H);
    if (bloom) bloom.resolution.set(W / 2, H / 2);
    for (const cb of [...resizeCbs]) cb(W, H);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  let onScreen = true;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { onScreen = es.some((x) => x.isIntersecting); }) : null;
  io?.observe(canvas);

  // context loss
  let lost = false;
  let card: HTMLDivElement | null = null;
  const onLost = (e: Event) => {
    e.preventDefault(); lost = true;
    if (card) return;
    card = document.createElement('div');
    card.className = 'lw-stage-lost';
    card.setAttribute('role', 'alert');
    Object.assign(card.style, { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', background: 'rgba(10,10,14,0.72)', zIndex: '30' });
    card.innerHTML = `<div style="background:var(--lw-panel,#1c1e26);color:var(--lw-ink-inv,#f2f2f5);padding:20px 22px;border-radius:14px;max-width:300px;text-align:center;font:15px/1.4 var(--lw-font,system-ui,sans-serif);box-shadow:0 10px 40px rgba(0,0,0,.5)"><p style="margin:0 0 14px">The 3D view stopped.</p><button type="button" style="min-height:44px;padding:0 18px;border-radius:10px;border:0;background:var(--lw-accent,#56B4E9);color:#0b1520;font-weight:700;font-size:15px;cursor:pointer">Reload the scene</button></div>`;
    card.querySelector('button')!.addEventListener('click', () => {
      try { renderer.forceContextRestore(); } catch { /* ignore */ }
      setTimeout(() => { if (lost) location.reload(); }, 2000);
    });
    container.appendChild(card);
  };
  const onRestored = () => {
    lost = false;
    envRT.dispose();
    envRT = buildEnvironment(renderer, mood);
    scene.environment = envRT.texture;
    card?.remove(); card = null;
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  // loop
  const frameCbs = new Set<(dt: number, t: number) => void>();
  const t0 = performance.now();
  let last = t0, raf = 0, disposed = false;
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (lost || document.hidden || !onScreen) return;
    // camera
    if (held.size && !locked) {
      const ax = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const az = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      const turn = (held.has('KeyE') ? 1 : 0) - (held.has('KeyQ') ? 1 : 0);
      const zoom = (held.has('KeyF') || held.has('Minus') || held.has('NumpadSubtract') ? 1 : 0) - (held.has('KeyR') || held.has('Equal') || held.has('NumpadAdd') ? 1 : 0);
      if (ax || az || turn || zoom) {
        const sp = goal.distance * 0.75 * dt;
        goal.target.x += (Math.cos(goal.yaw) * ax - Math.sin(goal.yaw) * az) * sp;
        goal.target.z += (-Math.sin(goal.yaw) * ax - Math.cos(goal.yaw) * az) * sp;
        goal.yaw += turn * 1.3 * dt;
        goal.distance *= Math.exp(zoom * 1.1 * dt);
        userMoved = true; tween = null;
        clampGoal();
      }
    }
    if (tween) {
      tween.t += dt;
      const k = ease(Math.min(1, tween.t / tween.dur));
      cur.target.lerpVectors(tween.from.target, tween.to.target, k);
      cur.distance = tween.from.distance + (tween.to.distance - tween.from.distance) * k;
      cur.yaw = tween.from.yaw + (tween.to.yaw - tween.from.yaw) * k;
      cur.pitch = tween.from.pitch + (tween.to.pitch - tween.from.pitch) * k;
      if (tween.t >= tween.dur) tween = null;
    } else {
      const a = 1 - Math.exp(-dt * 11);
      cur.target.lerp(goal.target, a);
      cur.distance += (goal.distance - cur.distance) * a;
      cur.yaw += (goal.yaw - cur.yaw) * a;
      cur.pitch += (goal.pitch - cur.pitch) * a;
    }
    applyCamera();
    const t = (now - t0) / 1000;
    for (const cb of [...frameCbs]) cb(dt, t);
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  const raycaster = new THREE.Raycaster();
  const ndc = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  };

  const flyTo: Stage['flyTo'] = (o, seconds = 0.8) => {
    const to = {
      target: o.target ? new THREE.Vector3(...o.target) : goal.target.clone(),
      distance: o.distance ?? goal.distance, yaw: o.yaw ?? goal.yaw, pitch: o.pitch ?? goal.pitch,
    };
    goal.target.copy(to.target); goal.distance = to.distance; goal.yaw = to.yaw; goal.pitch = to.pitch;
    clampGoal();
    // unwrap yaw so the shortest way round is taken
    while (goal.yaw - cur.yaw > Math.PI) cur.yaw += Math.PI * 2;
    while (goal.yaw - cur.yaw < -Math.PI) cur.yaw -= Math.PI * 2;
    if (seconds <= 0 || reducedMotion()) { cur.target.copy(goal.target); cur.distance = goal.distance; cur.yaw = goal.yaw; cur.pitch = goal.pitch; tween = null; applyCamera(); return; }
    tween = { from: { target: cur.target.clone(), distance: cur.distance, yaw: cur.yaw, pitch: cur.pitch }, to: goal, t: 0, dur: seconds };
  };

  const stage: KitStage = {
    scene, camera, renderer, canvas, quality, mood, keyLight: key,
    get orbiting() { return dragging || performance.now() - lastDragEnd < 120; },
    get userMoved() { return userMoved; },
    onFrame(cb) { frameCbs.add(cb); return () => frameCbs.delete(cb); },
    onResize(cb) { resizeCbs.add(cb); return () => resizeCbs.delete(cb); },
    flyTo,
    resetView() { userMoved = false; flyTo({ target: home.target.toArray() as [number, number, number], distance: home.distance, yaw: home.yaw, pitch: home.pitch }); },
    setHome(o, moveNow = true) {
      if (o.target) home.target.set(...o.target);
      if (o.distance !== undefined) home.distance = o.distance;
      if (o.yaw !== undefined) home.yaw = o.yaw;
      if (o.pitch !== undefined) home.pitch = o.pitch;
      if (o.minDistance !== undefined) minD = o.minDistance;
      if (o.maxDistance !== undefined) maxD = o.maxDistance;
      if (moveNow && !userMoved) flyTo({ target: home.target.toArray() as [number, number, number], distance: home.distance, yaw: home.yaw, pitch: home.pitch }, 0);
    },
    setPanBounds(a, b, c, d) { panBounds = [a, b, c, d]; },
    pick(x, y, objects) {
      raycaster.setFromCamera(ndc(x, y), camera);
      return raycaster.intersectObjects(objects, true);
    },
    pointOnPlane(x, y, planeY) {
      raycaster.setFromCamera(ndc(x, y), camera);
      const out = new THREE.Vector3();
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), out);
    },
    toScreen(p) {
      const v = p.clone().project(camera);
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
    },
    setCameraLocked(l) { locked = l; },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      frameCbs.clear(); resizeCbs.clear();
      ro.disconnect(); io?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      key.shadow.map?.dispose();
      composer?.dispose();
      composer?.renderTarget1.dispose(); composer?.renderTarget2.dispose();
      bloom?.dispose();
      envRT.dispose(); bg.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove(); vignette.remove(); card?.remove();
    },
  };
  return stage;
}

/** soft contact shadow: a dark blurred blob lying on y = 0 under an object (uses a shared texture) */
export function contactShadow(width: number, depth: number, opacity = 0.5): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity, depthWrite: false, toneMapped: false, color: 0x000000 }),
  );
  // a black material with a white-alpha texture would draw nothing; the blob texture carries alpha in its alpha channel
  (m.material as THREE.MeshBasicMaterial).color.set(0xffffff);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.renderOrder = -1;
  m.name = 'contactShadow';
  return m;
}
