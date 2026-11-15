import * as THREE from 'three';

const isShared = (x: { userData?: Record<string, unknown> } | null | undefined): boolean => !!x?.userData?.shared;

function disposeMaterial(m: THREE.Material, seen: Set<unknown>): void {
  if (seen.has(m) || isShared(m)) return;
  seen.add(m);
  for (const v of Object.values(m as unknown as Record<string, unknown>)) {
    if (v instanceof THREE.Texture && !isShared(v) && !seen.has(v)) { seen.add(v); v.dispose(); }
  }
  // ShaderMaterial uniforms
  const u = (m as THREE.ShaderMaterial).uniforms;
  if (u) for (const k of Object.keys(u)) {
    const v = u[k]?.value;
    if (v instanceof THREE.Texture && !isShared(v) && !seen.has(v)) { seen.add(v); v.dispose(); }
  }
  m.dispose();
}

/** Dispose geometries, materials and textures under `obj`, skipping anything flagged `userData.shared`
 *  (on the object, the geometry, the material or the texture). Also removes `obj` from its parent. */
export function disposeTree(obj: THREE.Object3D, removeFromParent = true): void {
  const seen = new Set<unknown>();
  obj.traverse((o) => {
    if (isShared(o)) return;
    const mesh = o as THREE.Mesh;
    // Sprites share one module-level geometry inside three.js: never dispose it
    if (mesh.geometry && !(o as THREE.Sprite).isSprite && !isShared(mesh.geometry) && !seen.has(mesh.geometry)) { seen.add(mesh.geometry); mesh.geometry.dispose(); }
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => disposeMaterial(m, seen));
    else if (mat) disposeMaterial(mat, seen);
    const light = o as THREE.DirectionalLight;
    if (light.isLight && light.shadow?.map) light.shadow.map.dispose();
    const extra = o.userData?.dispose as (() => void) | undefined;
    if (typeof extra === 'function') extra();
  });
  if (removeFromParent) obj.removeFromParent();
}

/** mark a resource as shared so disposeTree leaves it alone */
export function shared<T extends { userData: Record<string, unknown> }>(x: T): T {
  x.userData.shared = true;
  return x;
}
