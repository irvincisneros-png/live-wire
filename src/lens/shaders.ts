// GLSL for the deep zoom. Ions and dots are point-sprite impostors so they can carry a cheap
// depth-of-field blur (sprite grows and softens away from the focus distance) on every tier.

const SS = `float ss(float x){ x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }`;
const FOG = `uniform vec3 uFogCol; uniform float uFogNear; uniform float uFogFar;
  float fogK(float d){ return smoothstep(uFogNear, uFogFar, d); }`;
const OUT = `#include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ───────────── metal ions (lattice) ─────────────
export const ionVert = /* glsl */ `
attribute float aPhase; attribute float aKind; attribute float aRad; attribute float aS;
uniform float uTime; uniform float uJigW; uniform float uJigN; uniform float uScale; uniform float uSize;
uniform float uFocus; uniform float uFocusRange;
uniform float uNeckR; uniform float uNeckA; uniform float uNeckB; uniform float uTaper; uniform float uWireR;
uniform mat4 uBridge; uniform vec3 uHotPos; uniform float uHeat;
varying float vCoc; varying float vNeck; varying float vDepth; varying float vHot;
${SS}
void main() {
  float neck = (aKind > 0.5 && aKind < 1.5) ? 1.0 : 0.0;
  float w = min(ss((aS - (uNeckA - uTaper)) / uTaper), ss(((uNeckB + uTaper) - aS) / uTaper));
  float rLocal = mix(uWireR, uNeckR, w);
  float show = step(aRad, rLocal - uSize * 0.55);
  vec3 p = position;
  float amp = mix(uJigW, uJigN * (0.6 + 0.9 * uHeat), neck);
  p += amp * vec3(
    sin(uTime * 7.1 + aPhase * 12.9) + 0.5 * sin(uTime * 13.7 + aPhase * 5.1),
    sin(uTime * 8.3 + aPhase * 31.7) + 0.5 * sin(uTime * 11.9 + aPhase * 2.3),
    sin(uTime * 6.7 + aPhase * 17.3) + 0.5 * sin(uTime * 15.1 + aPhase * 7.7));
  if (aKind > 1.5) p = (uBridge * vec4(p, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = max(0.05, -mv.z);
  float coc = clamp(abs(depth - uFocus) / uFocusRange, 0.0, 1.0);
  vCoc = coc; vNeck = neck; vDepth = depth;
  float dh = distance(p, uHotPos);
  vHot = uHeat * exp(-dh * dh * 0.9);
  gl_PointSize = show * max(1.5, uSize * 2.0 * uScale / depth * (1.0 + coc * 0.9));
  gl_Position = projectionMatrix * mv;
}`;

export const ionFrag = /* glsl */ `
uniform vec3 uBase; uniform vec3 uAlloy; uniform vec3 uHeatCol; uniform vec3 uRim; uniform float uKey;
uniform float uHeat; uniform float uDepthPass; uniform float uGlow; uniform float uIonFade;
varying float vCoc; varying float vNeck; varying float vDepth; varying float vHot;
${FOG}
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0; c.y = -c.y;
  float k = 1.0 + vCoc * 0.9;
  vec2 q = c * k;
  float d = length(q);
  float soft = mix(0.05, 0.85, vCoc);
  float alpha = 1.0 - smoothstep(1.0 - soft, 1.0 + soft * 0.25, d);
  alpha *= mix(1.0, 0.42, vCoc);
  if (alpha < 0.01) discard;
  if (uDepthPass > 0.5) { if (alpha < 0.85) discard; gl_FragColor = vec4(0.0); return; }
  float z = sqrt(max(0.0, 1.0 - min(d * d, 1.0)));
  vec3 n = normalize(vec3(q, z));
  vec3 L = normalize(vec3(-0.45, 0.7, 0.55));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 48.0);
  float rim = pow(max(0.0, 1.0 - z), 2.2);
  float under = max(dot(n, normalize(vec3(0.4, -0.6, 0.3))), 0.0);
  vec3 base = mix(uBase, uAlloy, vNeck);
  vec3 col = base * (0.10 + 0.95 * diff * uKey) + base * under * 0.12 * uRim
    + spec * mix(vec3(1.0, 0.82, 0.62), vec3(0.85, 0.9, 1.0), vNeck) * 1.0
    + uRim * rim * 0.85;
  col += base * uGlow * 0.35;
  // heat: the resistor's own atoms glow (blackbody), and its light warms the copper nearby
  col += uHeatCol * vNeck * (0.35 + 0.9 * z) * 2.4;
  col += base * uHeatCol * vHot * (1.0 - vNeck) * 0.9;
  col = mix(col, uFogCol, max(fogK(vDepth), uIonFade * (1.0 - vNeck * 0.5)));
  gl_FragColor = vec4(col, alpha);
  ${OUT}
}`;

// ───────────── charge dots ─────────────
export const dotVert = /* glsl */ `
attribute float aGlow; attribute float aFade;
uniform float uScale; uniform float uCore; uniform float uHalo; uniform float uFocus; uniform float uFocusRange; uniform float uPx;
varying float vGlow; varying float vFade; varying float vCoc; varying float vDepth; varying float vCoreFrac;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(0.05, -mv.z);
  float coc = clamp(abs(depth - uFocus) / uFocusRange, 0.0, 1.0);
  float head = step(0.999, aFade);
  float core = uCore * mix(0.55, 1.0, aFade);
  float rad = core + head * uHalo * (0.3 + 0.9 * aGlow);
  float blur = 1.0 + coc * 0.55;
  float px = rad * 2.0 * uScale / depth * blur;
  // far away (the whole-loop view) keep a readable minimum size: a crisp core plus a glow that scales with energy
  float minPx = uPx * (2.6 + head * 9.0 * aGlow);
  float corePx = core * 2.0 * uScale / depth;
  px = max(px, minPx);
  gl_PointSize = aFade < 0.01 ? 0.0 : px;
  vCoreFrac = max(corePx, uPx * 2.2) / px;
  vGlow = aGlow; vFade = aFade; vCoc = coc; vDepth = depth;
  gl_Position = projectionMatrix * mv;
}`;

export const dotFrag = /* glsl */ `
uniform vec3 uDim; uniform vec3 uHot; uniform float uBoost;
varying float vGlow; varying float vFade; varying float vCoc; varying float vDepth; varying float vCoreFrac;
${FOG}
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  float soft = 0.22 + vCoc * 0.7;
  float core = 1.0 - smoothstep(vCoreFrac * (1.0 - soft), vCoreFrac * (1.0 + soft * 0.6), d);
  float halo = exp(-d * d * 6.5) * (1.0 - d * d);
  vec3 coreCol = mix(uDim * 0.62, vec3(1.0, 0.8, 0.42) * (1.05 + uBoost), smoothstep(0.0, 0.6, vGlow));
  vec3 haloCol = mix(uDim * 0.2, uHot * (0.9 + uBoost * 0.6), vGlow);
  float hAmp = vFade > 0.999 ? (0.03 + 0.62 * vGlow) : 0.0;
  vec3 col = coreCol * core * mix(1.0, 0.55, vCoc) + haloCol * halo * hAmp;
  col *= vFade * (1.0 - fogK(vDepth) * 0.9);
  gl_FragColor = vec4(col, 1.0);
  ${OUT}
}`;

// ───────────── sparks, flashes, out-of-focus bokeh ─────────────
export const fxVert = /* glsl */ `
attribute float aSize; attribute vec3 aCol; attribute float aAlpha;
uniform float uScale;
varying vec3 vCol; varying float vAlpha; varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(0.05, -mv.z);
  gl_PointSize = aAlpha <= 0.001 ? 0.0 : max(2.0, aSize * 2.0 * uScale / depth);
  vCol = aCol; vAlpha = aAlpha; vDepth = depth;
  gl_Position = projectionMatrix * mv;
}`;

export const fxFrag = /* glsl */ `
uniform float uRing;
varying vec3 vCol; varying float vAlpha; varying float vDepth;
${FOG}
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  float g = exp(-d * d * 7.0) + 0.35 * exp(-d * d * 1.6);
  // bokeh discs: flat with a slightly brighter rim
  float disc = (1.0 - smoothstep(0.82, 1.0, d)) * (0.75 + 0.25 * smoothstep(0.5, 0.95, d));
  float a = mix(g, disc, uRing);
  vec3 col = vCol * a * vAlpha * (1.0 - fogK(vDepth) * (1.0 - uRing) * 0.8);
  gl_FragColor = vec4(col, 1.0);
  ${OUT}
}`;

// ───────────── translucent sheath (fresnel shell whose radius follows the neck) ─────────────
export const sheathVert = /* glsl */ `
attribute vec3 aDir; attribute float aW;
uniform float uWireR; uniform float uNeckR; uniform float uScaleR;
varying vec3 vN; varying vec3 vV; varying float vW; varying float vDepth;
void main() {
  float r = mix(uWireR, uNeckR, aW) * uScaleR;
  vec3 p = position + aDir * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * aDir); vV = normalize(-mv.xyz); vW = aW; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const sheathFrag = /* glsl */ `
uniform vec3 uCol; uniform vec3 uNeckCol; uniform float uK; uniform vec3 uHeatCol; uniform float uHeat;
varying vec3 vN; varying vec3 vV; varying float vW; varying float vDepth;
${FOG}
void main() {
  float f = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 2.4);
  vec3 col = mix(uCol, uNeckCol, vW);
  col = col * (0.05 + f * uK) + uHeatCol * uHeat * vW * (0.08 + 0.5 * f);
  col *= 1.0 - fogK(vDepth) * 0.85;
  gl_FragColor = vec4(col, 1.0);
  ${OUT}
}`;

// ───────────── battery interior: a rising energy glow from + end (dim) to − end (bright) ─────────────
export const liftVert = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const liftFrag = /* glsl */ `
uniform vec3 uCol; uniform float uLevel; uniform float uTime; uniform float uFlow; uniform float uFlip;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vDepth;
${FOG}
void main() {
  // t runs 0 at the + end to 1 at the − end
  float t = uFlip > 0.5 ? 1.0 - vUv.y : vUv.y;
  float f = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 1.6);
  // chevrons moving from + to − (the lift), only while charge flows
  float band = fract(t * 6.0 - uFlow);
  float chev = smoothstep(0.0, 0.08, band) * (1.0 - smoothstep(0.08, 0.5, band));
  float ramp = t * t;
  float a = uLevel * (0.02 + 0.98 * ramp) * (0.2 + 0.8 * f) + uLevel * chev * 0.3 * ramp;
  vec3 col = uCol * a * (1.0 - fogK(vDepth) * 0.8);
  gl_FragColor = vec4(col, 1.0);
  ${OUT}
}`;

// ───────── fresnel rim for glass shells (safe pow: never NaN, which would black out the bloom pass) ─────────
export const rimVert = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
export const rimFrag = /* glsl */ `
uniform vec3 uColor; uniform float uPow; uniform float uK;
varying vec3 vN; varying vec3 vV;
void main() {
  float f = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), uPow);
  gl_FragColor = vec4(uColor * f * uK, 1.0);
  ${OUT}
}`;
