// Foundry Yard: the map, the movement solver, and the light.
//
// An original industrial yard, 56 by 40 metres, open to the sky. Two charge
// sites — A "Furnace" north-west, B "Depot" north-east — joined by three
// lanes with crates, pillars and low walls to crouch behind and shoot over.
// The yard is a table, not a pile of calls: every solid box is one row of
// [width, height, depth, x, y, z, material], and one loop builds them all.
// Each box is a collider for feet and a surface for bullets. The drums and
// pipes are dressing only — they cast shadows but stop nobody and no shot —
// and they sit flat against the walls, clear of every route.
//
// Nothing here is a model or a texture: plain boxes, cylinders and light.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Attackers walk these from the south spawn toward a site; defenders walk
// the same legs backwards to their holds. Each entry is a list of [x, z]
// waypoints, in walking order.
export const ROUTES = {
  aLong: [[0, 17], [-14, 12], [-24, 4], [-24, -6], [-20, -12]],
  bLong: [[0, 17], [14, 12], [24, 4], [24, -6], [20, -12]],
  mid: [[0, 17], [0, 10], [0, 0], [0, -8], [0, -14]],
  toA: [[0, -14], [-10, -14], [-20, -12]],
  toB: [[0, -14], [10, -14], [20, -12]],
};

// Where defenders wait, per site, with a couple of spares per round.
export const HOLDS = {
  A: [[-20, -10], [-16, -14], [-23, -8], [-18, -15]],
  B: [[20, -10], [16, -14], [23, -8], [18, -15]],
  mid: [[-4, -10], [4, -10], [0, -6]],
};

export const SPAWNS = {
  ember: [[-6, 17], [-2, 17], [2, 17], [6, 17], [0, 15]],
  warden: [[-6, -17], [-2, -17], [2, -17], [6, -17], [0, -15]],
};

// The yard's solids, row by row: [w, h, d, x, y, z, material].
// Shell first, then the two sites, then mid, the lane crates, the spawn cover.
const SOLIDS = [
  // Shell: floor and four walls, 5 m high.
  [56.4, 0.4, 40.4, 0, -0.2, 0, 'canvas'],
  [0.4, 5, 40.4, -28.2, 2.5, 0, 'surface'],
  [0.4, 5, 40.4, 28.2, 2.5, 0, 'surface'],
  [56.4, 5, 0.4, 0, 2.5, -20.2, 'surface'],
  [56.4, 5, 0.4, 0, 2.5, 20.2, 'surface'],
  // Site A "Furnace": furnace block, chimney, pipe crates.
  [6, 3.4, 1.2, -24, 1.7, -16, 'surface'],
  [1.4, 6.5, 1.4, -25.5, 3.25, -13, 'hairline'],
  [3.2, 1.1, 1.2, -17, 0.55, -16.5, 'hairline'],
  [1.2, 1.1, 3.2, -15, 0.55, -11, 'hairline'],
  // Site B "Depot": stacked containers and a low wall.
  [5, 2.6, 2.4, 24.5, 1.3, -15, 'surface'],
  [5, 2.6, 2.4, 24.5, 3.9, -15, 'hairline'],
  [2.4, 1.1, 1.2, 17, 0.55, -16.5, 'hairline'],
  [1.2, 1.1, 2.4, 15, 0.55, -11, 'hairline'],
  // Mid: two pillars and two low walls, with gaps to shoot through.
  [1.4, 3.6, 1.4, -3, 1.8, 0, 'hairline'],
  [1.4, 3.6, 1.4, 3, 1.8, 0, 'hairline'],
  [4, 1.1, 1.2, 0, 0.55, -8, 'hairline'],
  [4, 1.1, 1.2, 0, 0.55, 8, 'hairline'],
  // Lane crates to crouch behind on the way to each site.
  [1.6, 1.1, 1.6, -24, 0.55, 6, 'hairline'],
  [1.6, 1.1, 1.6, -24, 0.55, -2, 'hairline'],
  [1.6, 1.1, 1.6, 24, 0.55, 6, 'hairline'],
  [1.6, 1.1, 1.6, 24, 0.55, -2, 'hairline'],
  [2.4, 0.9, 1.2, -12, 0.45, 12, 'hairline'],
  [2.4, 0.9, 1.2, 12, 0.45, 12, 'hairline'],
  [2.4, 0.9, 1.2, -12, 0.45, -6, 'hairline'],
  [2.4, 0.9, 1.2, 12, 0.45, -6, 'hairline'],
  // Spawn cover, south and north.
  [2.4, 0.9, 1.2, -8, 0.45, 14, 'hairline'],
  [2.4, 0.9, 1.2, 8, 0.45, 14, 'hairline'],
  [2.4, 0.9, 1.2, -8, 0.45, -14, 'hairline'],
  [2.4, 0.9, 1.2, 8, 0.45, -14, 'hairline'],
];

// Dressing: [geometry, x, y, z, material]. Drums hug the walls, pipes run
// along the north wall. Never a collider, never on a route.
function dressingGeometries() {
  const drum = new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12);
  const pipe = new THREE.CylinderGeometry(0.22, 0.22, 20, 10);
  pipe.rotateZ(Math.PI / 2);
  return { drum, pipe };
}

const DRESSING = [
  ['drum', -27.4, 0.45, 10, 'accent'],
  ['drum', -27.4, 0.45, 11, 'hairline'],
  ['drum', 27.4, 0.45, -10, 'hairline'],
  ['drum', 27.4, 0.45, -11, 'accent'],
  ['pipe', -14, 4.4, -19.6, 'hairline'],
  ['pipe', 14, 4.4, -19.6, 'hairline'],
];

// The slide both the player and the bots use: move one axis at a time and
// stop at the first solid, so a wall never swallows a body. One probe box is
// reused across calls — the hot loop must not allocate.
const probeBox = new THREE.Box3();

export function slideMove(colliders, pos, vel, dt, radius, height) {
  function blocked(x, y, z, lift) {
    probeBox.min.set(x - radius, y + lift, z - radius);
    probeBox.max.set(x + radius, y + height - lift, z + radius);
    for (const c of colliders) if (probeBox.intersectsBox(c)) return c;
    return null;
  }
  const aheadX = pos.x + vel.x * dt;
  if (!blocked(aheadX, pos.y, pos.z, 0.04)) pos.x = aheadX;
  else vel.x = 0;
  const aheadZ = pos.z + vel.z * dt;
  if (!blocked(pos.x, pos.y, aheadZ, 0.04)) pos.z = aheadZ;
  else vel.z = 0;
  pos.y += vel.y * dt;
  const under = blocked(pos.x, pos.y, pos.z, 0);
  if (under && vel.y <= 0) {
    pos.y = under.max.y;
    vel.y = 0;
    return true;
  }
  if (under) {
    pos.y = under.min.y - height;
    vel.y = 0;
  }
  if (pos.y < 0) {
    pos.y = 0;
    vel.y = 0;
    return true;
  }
  return pos.y === 0;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  for (const [w, h, d, x, y, z, mat] of SOLIDS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }

  const geos = dressingGeometries();
  for (const [kind, x, y, z, mat] of DRESSING) {
    const mesh = new THREE.Mesh(geos[kind], mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // The two site pads the objective reads. Flat volumes, not solids.
  const siteA = new THREE.Box3(new THREE.Vector3(-24, 0, -16), new THREE.Vector3(-16, 3, -8));
  const siteB = new THREE.Box3(new THREE.Vector3(16, 0, -16), new THREE.Vector3(24, 3, -8));

  // Light: sky gradient overhead, a warm key from the south-east, a cool
  // fill from the north.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.45);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.5);
  key.position.set(18, 22, 16);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -32;
  key.shadow.camera.right = 32;
  key.shadow.camera.top = 28;
  key.shadow.camera.bottom = -28;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.55);
  fill.position.set(-14, 12, -18);
  scene.add(fill);

  return { colliders, shootables, group, siteA, siteB };
}
