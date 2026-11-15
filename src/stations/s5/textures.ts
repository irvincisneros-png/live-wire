// Procedural canvas textures for the Station 5 kitchen. Each call makes a new texture the caller owns.
import * as THREE from 'three';
import { canvas, fbm } from '../../kit/textures';

const tex = (c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
};

/** small deterministic hash 0..1 */
const hash = (a: number, b: number, s = 0): number => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

export interface TileMaps { map: THREE.CanvasTexture; bump: THREE.CanvasTexture; rough: THREE.CanvasTexture }
/** gloss subway tiles, 4 across × 8 rows per texture, brick offset; grout is light warm grey */
export function subwayTiles(): TileMaps {
  const W = 1024, H = 1024, cols = 4, rows = 8, tw = W / cols, th = H / rows, g = 7;
  const [c, ctx] = canvas(W, H);
  const [b, bx] = canvas(W, H);
  const [r, rx] = canvas(W, H);
  ctx.fillStyle = '#cfc8bd'; ctx.fillRect(0, 0, W, H);
  bx.fillStyle = '#000'; bx.fillRect(0, 0, W, H);
  rx.fillStyle = '#d8d8d8'; rx.fillRect(0, 0, W, H);
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * tw / 2;
    for (let i = -1; i <= cols; i++) {
      const x = i * tw + off + g / 2, y = j * th + g / 2, w = tw - g, h = th - g;
      const v = hash(i + 9, j, 3);
      const base = 241 + Math.round(v * 9);
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, `rgb(${base},${base - 2},${base - 7})`);
      grad.addColorStop(1, `rgb(${base - 8},${base - 10},${base - 15})`);
      ctx.fillStyle = grad;
      rr(ctx, x, y, w, h, 10); ctx.fill();
      // glaze variation
      ctx.fillStyle = `rgba(255,255,255,${0.08 + v * 0.08})`;
      rr(ctx, x + 6, y + 5, w * 0.6, h * 0.25, 8); ctx.fill();
      // bump: bevelled pillow edge
      for (let k = 0; k < 10; k++) {
        const s = 255 * Math.min(1, (k + 1) / 10);
        bx.fillStyle = `rgb(${s},${s},${s})`;
        rr(bx, x + k, y + k, w - 2 * k, h - 2 * k, 10 - k * 0.5); bx.fill();
      }
      rx.fillStyle = `rgb(${30 + v * 20},${30 + v * 20},${30 + v * 20})`;
      rr(rx, x + 2, y + 2, w - 4, h - 4, 9); rx.fill();
    }
  }
  return { map: tex(c, true, true), bump: tex(b, false, true), rough: tex(r, false, true) };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/** engineered-stone benchtop: warm pale grey with fine flecks and faint veins */
export function quartz(): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const W = 1024, H = 1024;
  const [c, ctx] = canvas(W, H);
  const [r, rx] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  const rimg = rx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x * 0.004, y * 0.004, 4, 2);
    const vein = Math.pow(Math.max(0, 1 - Math.abs(Math.sin((x * 0.003 + y * 0.0012 + n * 2.2) * Math.PI)) * 9), 2) * 0.5;
    const fleck = hash(x, y, 5);
    let v = 226 + (n - 0.5) * 14 - vein * 26;
    if (fleck > 0.985) v -= 40 + hash(y, x) * 40;
    else if (fleck < 0.012) v += 18;
    const i = (y * W + x) * 4;
    img.data[i] = v + 3; img.data[i + 1] = v; img.data[i + 2] = v - 6; img.data[i + 3] = 255;
    const rv = 70 + (n - 0.5) * 30 + (fleck > 0.985 ? -30 : 0);
    rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rv; rimg.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  rx.putImageData(rimg, 0, 0);
  return { map: tex(c, true, true), rough: tex(r, false, true) };
}

/** linen weave for the lamp shade */
export function linen(): THREE.CanvasTexture {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const w = (Math.sin(x * 1.6) * Math.sin(y * 1.6) > 0 ? 6 : -6) + (hash(x >> 1, y, 1) - 0.5) * 14 + (fbm(x * 0.05, y * 0.4, 2, 7) - 0.5) * 16;
    const i = (y * W + x) * 4;
    img.data[i] = 236 + w; img.data[i + 1] = 226 + w; img.data[i + 2] = 206 + w; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, true, true);
}

/** a calm landscape for the TV screen */
export function tvPicture(): THREE.CanvasTexture {
  const W = 512, H = 288;
  const [c, ctx] = canvas(W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#2c4f86'); sky.addColorStop(0.55, '#e88a5a'); sky.addColorStop(1, '#ffd39a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(W * 0.64, H * 0.55, 4, W * 0.64, H * 0.55, 70);
  sun.addColorStop(0, 'rgba(255,248,220,1)'); sun.addColorStop(0.25, 'rgba(255,220,150,.9)'); sun.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  const hills = (y0: number, amp: number, col: string, f: number, s: number) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, y0 - amp * fbm(x * f, s, 3, s));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  };
  hills(H * 0.62, 70, '#7a5a7a', 0.008, 1);
  hills(H * 0.66, 50, '#4d3f5e', 0.012, 2);
  // sea with sun glint
  const sea = ctx.createLinearGradient(0, H * 0.66, 0, H);
  sea.addColorStop(0, '#e9a073'); sea.addColorStop(1, '#2a3550');
  ctx.fillStyle = sea; ctx.fillRect(0, H * 0.68, W, H);
  for (let i = 0; i < 40; i++) {
    const y = H * 0.7 + i * 2.2, w = 50 - i * 0.9;
    ctx.fillStyle = `rgba(255,230,180,${0.5 - i * 0.012})`;
    ctx.fillRect(W * 0.64 - w / 2 + Math.sin(i * 3.1) * 6, y, w, 1.2);
  }
  hills(H * 0.86, 30, '#1f2430', 0.02, 3);
  return tex(c, true);
}

/** the phone's lock screen while charging */
export function phoneScreen(on: boolean, pct = 78): HTMLCanvasElement {
  const [c, ctx] = canvas(128, 256);
  if (!on) { ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, 128, 256); return c; }
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#1c2a44'); g.addColorStop(1, '#0b0f1a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = '#e9eef7'; ctx.font = '600 30px Arial, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('7:42', 64, 62);
  // battery
  ctx.strokeStyle = '#e9eef7'; ctx.lineWidth = 3; ctx.strokeRect(40, 112, 48, 84); ctx.fillStyle = '#e9eef7'; ctx.fillRect(56, 104, 16, 7);
  ctx.fillStyle = '#5fd39b'; const hgt = 76 * pct / 100; ctx.fillRect(44, 192 - hgt, 40, hgt);
  ctx.fillStyle = '#0b0f1a'; ctx.beginPath(); ctx.moveTo(68, 128); ctx.lineTo(54, 158); ctx.lineTo(64, 158); ctx.lineTo(58, 182); ctx.lineTo(76, 148); ctx.lineTo(65, 148); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9d3e6'; ctx.font = '600 14px Arial, sans-serif'; ctx.fillText(`Charging ${pct}%`, 64, 224);
  return c;
}

/** microwave window: dark cavity seen through the perforated door; lit with a turning mug when on */
export function drawMicrowaveWindow(ctx: CanvasRenderingContext2D, W: number, H: number, on: boolean, angle: number): void {
  if (on) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.25, 10, W * 0.5, H * 0.5, W * 0.6);
    g.addColorStop(0, '#fff1c8'); g.addColorStop(0.6, '#e8c27a'); g.addColorStop(1, '#8a6a36');
    ctx.fillStyle = g;
  } else ctx.fillStyle = '#151516';
  ctx.fillRect(0, 0, W, H);
  // turntable plate (ellipse) and a mug that swings left-right as the plate turns
  const cx = W * 0.5, cy = H * 0.8;
  ctx.fillStyle = on ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.05)';
  ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.34, H * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  const mx = cx + Math.sin(angle) * W * 0.18, depth = Math.cos(angle);
  const mw = W * (0.15 + depth * 0.015), mh = H * 0.34;
  ctx.fillStyle = on ? (depth > 0 ? '#b8473a' : '#9e3c31') : '#232324';
  ctx.fillRect(mx - mw / 2, cy - mh, mw, mh);
  ctx.beginPath(); ctx.ellipse(mx, cy - mh, mw / 2, H * 0.03, 0, 0, Math.PI * 2); ctx.fillStyle = on ? '#7d2c23' : '#1b1b1c'; ctx.fill();
  ctx.strokeStyle = ctx.fillStyle = on ? '#b8473a' : '#232324'; ctx.lineWidth = W * 0.025;
  ctx.beginPath(); ctx.arc(mx + mw / 2 * Math.cos(angle) * 1.05, cy - mh * 0.5, mh * 0.2, -1.3, 1.3); ctx.stroke();
  // perforated screen
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  for (let y = 0; y < H; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < W; x += 4) ctx.fillRect(x, y, 2, 2);
  // tint
  ctx.fillStyle = 'rgba(10,10,12,0.35)'; ctx.fillRect(0, 0, W, H);
}

/** printed keypad on the microwave control panel */
export function microwaveKeypad(): THREE.CanvasTexture {
  const W = 128, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#0d0e10'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(220,225,232,.55)'; ctx.fillStyle = 'rgba(220,225,232,.8)'; ctx.lineWidth = 1.5;
  ctx.font = '600 13px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'STOP', '0', '+30s'];
  keys.forEach((k, i) => {
    const x = 14 + (i % 3) * 36, y = 18 + Math.floor(i / 3) * 34;
    rr(ctx, x, y, 30, 26, 5); ctx.stroke();
    ctx.font = `600 ${k.length > 2 ? 9 : 13}px Arial, sans-serif`; ctx.fillText(k, x + 15, y + 13.5);
  });
  ctx.fillStyle = 'rgba(95,211,155,.85)'; rr(ctx, 14, 160, 102, 34, 8); ctx.fill();
  ctx.fillStyle = '#0d0e10'; ctx.font = '700 15px Arial, sans-serif'; ctx.fillText('START', 65, 177.5);
  ctx.fillStyle = 'rgba(220,225,232,.5)'; ctx.font = '600 10px Arial, sans-serif';
  ctx.fillText('POWER   DEFROST', 65, 214);
  rr(ctx, 14, 224, 48, 20, 4); ctx.strokeStyle = 'rgba(220,225,232,.4)'; ctx.stroke(); rr(ctx, 68, 224, 48, 20, 4); ctx.stroke();
  return tex(c, true);
}

/** the kettle's water window: level marks over water */
export function kettleWindow(): THREE.CanvasTexture {
  const W = 64, H = 256;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(200,220,235,0.35)'); g.addColorStop(0.38, 'rgba(200,220,235,0.35)');
  g.addColorStop(0.4, 'rgba(120,170,210,0.9)'); g.addColorStop(1, 'rgba(70,120,170,0.95)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(20,30,40,.85)'; ctx.font = '700 12px Arial, sans-serif'; ctx.textAlign = 'left';
  for (let k = 0; k <= 6; k++) { const y = 30 + k * 30; ctx.fillRect(6, y, k % 2 ? 10 : 18, 2.5); }
  ctx.fillText('MAX', 26, 35); ctx.fillText('1.0', 26, 125); ctx.fillText('0.5', 26, 185);
  return tex(c, true);
}

/** bread slice face */
export function toast(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#8a5428'; ctx.fillRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 70, 10, 64, 70, 60);
  g.addColorStop(0, '#e1a65e'); g.addColorStop(1, '#b97a3c');
  ctx.fillStyle = g; rr(ctx, 9, 9, 110, 110, 22); ctx.fill();
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(90,50,20,${hash(i, 1) * 0.25})`; ctx.fillRect(hash(i, 2) * 128, hash(i, 3) * 128, 2, 2); }
  return tex(c, true);
}

/** the plug-in meter's LCD (owned canvas; redraw with drawMeterLcd) */
export function drawMeterLcd(ctx: CanvasRenderingContext2D, W: number, H: number, lines: { watts: string; time: string; joules: string; kwh: string; cost: string }, lit: boolean): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, lit ? '#c9e3c0' : '#a9b59a'); g.addColorStop(1, lit ? '#a8cfa0' : '#8f9c82');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#16241a'; ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.font = `700 ${H * 0.3}px "SF Mono", Menlo, Consolas, monospace`;
  ctx.fillText(lines.watts, W * 0.95, H * 0.33);
  ctx.font = `700 ${H * 0.15}px "SF Mono", Menlo, Consolas, monospace`;
  ctx.fillText(lines.joules, W * 0.95, H * 0.55);
  ctx.fillText(lines.kwh, W * 0.95, H * 0.74);
  ctx.textAlign = 'left';
  ctx.font = `700 ${H * 0.12}px Arial, sans-serif`;
  ctx.fillText('POWER', W * 0.05, H * 0.15);
  ctx.fillText('ON ' + lines.time, W * 0.05, H * 0.93);
  ctx.textAlign = 'right';
  ctx.fillText(lines.cost, W * 0.95, H * 0.93);
  ctx.fillStyle = 'rgba(22,36,26,.25)'; ctx.fillRect(W * 0.04, H * 0.39, W * 0.92, 2);
}
