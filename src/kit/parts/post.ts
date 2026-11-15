// Brass binding post: hex base nut, washer, threaded stem, knurled cap with a banana socket on top.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from '../materials';
import { DIM, sharedGeo } from './common';

/** shared geometries for one post, split by material so the bench can instance them */
export function postGeometries(): { body: THREE.BufferGeometry; cap: THREE.BufferGeometry; socket: THREE.BufferGeometry } {
  const body = sharedGeo('post-body', () => {
    const parts: THREE.BufferGeometry[] = [];
    // hex nut base with a chamfered top (lathe with 6 segments = hexagon)
    const hex = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.074, 0), new THREE.Vector2(0.074, 0.026), new THREE.Vector2(0.064, 0.034), new THREE.Vector2(0.03, 0.034)], 6);
    hex.rotateY(Math.PI / 6);
    parts.push(toNonIndexedSafe(hex));
    // washer
    parts.push(toNonIndexedSafe(new THREE.LatheGeometry([new THREE.Vector2(0.03, 0.034), new THREE.Vector2(0.066, 0.034), new THREE.Vector2(0.068, 0.037), new THREE.Vector2(0.068, 0.041), new THREE.Vector2(0.03, 0.041)], 28)));
    // threaded stem: a lathe with a saw-tooth profile reads as threads
    const sp: THREE.Vector2[] = [new THREE.Vector2(0, 0.041)];
    for (let y = 0.041, i = 0; y < 0.128; y += 0.006, i++) sp.push(new THREE.Vector2(i % 2 ? DIM.stemR : DIM.stemR - 0.004, y));
    sp.push(new THREE.Vector2(DIM.stemR - 0.002, 0.13), new THREE.Vector2(0, 0.13));
    parts.push(toNonIndexedSafe(new THREE.LatheGeometry(sp, 20)));
    return mergeGeometries(parts)!;
  });
  const cap = sharedGeo('post-cap', () => {
    // knurled cap: bevelled skirt, knurled grip band, domed top with a socket rim
    const pts = [
      new THREE.Vector2(0.03, 0.128), new THREE.Vector2(0.05, 0.128), new THREE.Vector2(0.058, 0.134),
      new THREE.Vector2(0.06, 0.142), new THREE.Vector2(0.06, 0.196), new THREE.Vector2(0.056, 0.205),
      new THREE.Vector2(0.046, 0.212), new THREE.Vector2(0.022, DIM.postTop), new THREE.Vector2(0.0125, DIM.postTop), new THREE.Vector2(0.0125, DIM.postTop - 0.004),
    ];
    const g = new THREE.LatheGeometry(pts, 96);
    // knurl: push alternate radial columns outward inside the grip band
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.y > 0.143 && v.y < 0.195) {
        const a = Math.atan2(v.z, v.x);
        const k = 1 + 0.06 * Math.max(0, Math.cos(a * 32));
        pos.setXYZ(i, v.x * k, v.y, v.z * k);
      }
    }
    g.computeVertexNormals();
    return g;
  });
  const socket = sharedGeo('post-socket', () => new THREE.CylinderGeometry(0.0125, 0.0125, 0.004, 16).translate(0, DIM.postTop - 0.005, 0));
  return { body, cap, socket };
}

function toNonIndexedSafe(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  return n;
}

/** a single post as a Group (the bench instances these geometries instead, for speed) */
export function createPost(): THREE.Group {
  const { body, cap, socket } = postGeometries();
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => { const x = new THREE.Mesh(geo, m); x.castShadow = true; x.receiveShadow = true; g.add(x); };
  add(body, M.brass());
  add(cap, M.brassKnurl());
  add(socket, M.darkSteel());
  g.name = 'post';
  return g;
}
