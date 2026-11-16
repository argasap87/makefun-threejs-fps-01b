// How the player moves: run, crouch, jump, and a box that slides along the
// map one axis at a time. Acceleration bends the velocity toward what the
// keys ask for instead of snapping it there, friction bleeds speed off when
// the keys go quiet, and the eye rides lower while crouched. Moving fast
// widens the weapon's spread, so the movement model is also the aim model:
// stop, and the shots tighten.
import * as THREE from 'three';

// One table for the body. Radius is the body's half-width; heights are the
// standing and crouched crowns; eyes are where the camera sits in each pose.
const BODY = {
  radius: 0.34,
  standHeight: 1.72,
  crouchHeight: 1.12,
  standEye: 1.6,
  crouchEye: 1.02,
  walk: 5.2,
  crouch: 2.4,
  groundAccel: 42,
  airAccel: 9,
  friction: 9,
  gravity: 20,
  jump: 6.2,
  maxFall: 30,
  look: 0.0022,
  pitchLimit: 1.45,
};

export function createPlayer(colliders) {
  const player = {
    position: new THREE.Vector3(0, 0, 9.5),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: BODY.standEye,
    onGround: true,
    crouching: false,
    height: BODY.standHeight,
  };
  const probe = new THREE.Box3();
  const wishDir = new THREE.Vector3();

  // The lift leaves the feet and the crown out of the sideways tests, so
  // standing on the floor never reads as walking into a wall.
  function blockedAt(x, y, z, height, lift) {
    probe.min.set(x - BODY.radius, y + lift, z - BODY.radius);
    probe.max.set(x + BODY.radius, y + height - lift, z + BODY.radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  function look(dx, dy, sensitivity = BODY.look) {
    player.yaw -= dx * sensitivity;
    const next = player.pitch - dy * sensitivity;
    player.pitch = Math.max(-BODY.pitchLimit, Math.min(BODY.pitchLimit, next));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(BODY.pitchLimit, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function applyCrouch(keys) {
    const want = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (want && !player.crouching) {
      player.crouching = true;
      player.height = BODY.crouchHeight;
      return;
    }
    if (want || !player.crouching) return;
    // A low ceiling holds the crouch until the full height fits again.
    if (blockedAt(player.position.x, player.position.y, player.position.z, BODY.standHeight, 0.02)) return;
    player.crouching = false;
    player.height = BODY.standHeight;
  }

  function wishDirection(keys) {
    const ahead = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wishDir.set(0, 0, 0);
    if (!ahead && !side) return wishDir;
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    return wishDir.set(-sin * ahead + cos * side, 0, -cos * ahead - sin * side).normalize();
  }

  function accelerate(dt, keys) {
    const wish = wishDirection(keys);
    const top = player.crouching ? BODY.crouch : BODY.walk;
    const rate = player.onGround ? BODY.groundAccel : BODY.airAccel;
    const blend = Math.min(1, (rate * dt) / top);
    player.velocity.x += (wish.x * top - player.velocity.x) * blend;
    player.velocity.z += (wish.z * top - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const drag = Math.max(0, 1 - BODY.friction * dt);
      player.velocity.x *= drag;
      player.velocity.z *= drag;
    }
  }

  function slideHorizontal(dt) {
    const nextX = player.position.x + player.velocity.x * dt;
    if (!blockedAt(nextX, player.position.y, player.position.z, player.height, 0.04)) player.position.x = nextX;
    else player.velocity.x = 0;
    const nextZ = player.position.z + player.velocity.z * dt;
    if (!blockedAt(player.position.x, player.position.y, nextZ, player.height, 0.04)) player.position.z = nextZ;
    else player.velocity.z = 0;
  }

  function fallAndLand(dt) {
    player.position.y += player.velocity.y * dt;
    player.onGround = false;
    const hit = blockedAt(player.position.x, player.position.y, player.position.z, player.height, 0);
    if (hit && player.velocity.y <= 0) {
      player.position.y = hit.max.y;
      player.velocity.y = 0;
      player.onGround = true;
    } else if (hit) {
      player.position.y = hit.min.y - player.height;
      player.velocity.y = 0;
    }
    if (player.position.y < 0) {
      player.position.y = 0;
      player.velocity.y = 0;
      player.onGround = true;
    }
    player.velocity.y = Math.max(-BODY.maxFall, player.velocity.y);
  }

  function step(dt, keys) {
    applyCrouch(keys);
    const eyeGoal = player.crouching ? BODY.crouchEye : BODY.standEye;
    player.eye += (eyeGoal - player.eye) * Math.min(1, dt * 12);
    accelerate(dt, keys);
    if (keys.has('Space') && player.onGround) {
      player.velocity.y = BODY.jump;
      player.onGround = false;
    }
    player.velocity.y -= BODY.gravity * dt;
    slideHorizontal(dt);
    fallAndLand(dt);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
