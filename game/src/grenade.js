// The Shard grenade, thrown and forgotten: a short fuse, one wall bounce,
// then a burst whose damage fades with distance and blinds anyone facing
// it. This module flies the charge and draws the burst. Who gets hurt and
// who gets flashed lives in the boot module, which sees the whole game.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// One table for the throw, so the numbers are argued about in one place.
const THROW = {
  gravity: 12,
  fuse: 1.6,
  speed: 16,
  lift: 4.5,
  radius: 6,
  damage: 90,
  floorRest: 0.35,
  slideKeep: 0.7,
  wallRest: -0.35,
  blastLife: 0.35,
  flashRange: 26,
};

export function createGrenades(scene, world) {
  const flying = [];
  const bursts = [];
  const pebbleGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const pebbleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4 });
  const burstGeo = new THREE.SphereGeometry(1, 16, 12);
  const burstMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.7, depthWrite: false });
  const scratch = new THREE.Vector3();

  function solidAt(p) {
    for (const c of world.colliders) {
      if (p.x > c.min.x && p.x < c.max.x && p.y > c.min.y && p.y < c.max.y && p.z > c.min.z && p.z < c.max.z) return c;
    }
    return null;
  }

  function burstAt(p) {
    const shell = new THREE.Mesh(burstGeo, burstMat.clone());
    shell.position.copy(p);
    shell.scale.setScalar(0.5);
    scene.add(shell);
    bursts.push({ mesh: shell, life: THROW.blastLife });
  }

  function flyGrenade(g, dt, ctx) {
    g.fuse -= dt;
    g.vel.y -= THROW.gravity * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    const p = g.mesh.position;
    if (p.y <= 0.09) {
      // Skim the floor: keep a third of the bounce, lose a third of the slide.
      p.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * THROW.floorRest;
      g.vel.x *= THROW.slideKeep;
      g.vel.z *= THROW.slideKeep;
    }
    if (solidAt(p) && !g.bounced) {
      g.bounced = true;
      g.vel.multiplyScalar(THROW.wallRest);
      p.addScaledVector(g.vel, dt);
    }
    if (g.fuse > 0) return false;
    burstAt(p);
    ctx.explode(p.clone(), THROW.radius, THROW.damage);
    return true;
  }

  function ageBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const b = bursts[i];
      b.life -= dt;
      const grown = 0.5 + (THROW.blastLife - b.life) * 14;
      b.mesh.scale.setScalar(Math.max(0.1, grown));
      b.mesh.material.opacity = Math.max(0, b.life / THROW.blastLife) * 0.7;
      if (b.life <= 0) {
        scene.remove(b.mesh);
        bursts.splice(i, 1);
      }
    }
  }

  return {
    active: flying,
    throwFrom(origin, direction) {
      const mesh = new THREE.Mesh(pebbleGeo, pebbleMat);
      mesh.position.copy(origin);
      scene.add(mesh);
      const vel = direction.clone().multiplyScalar(THROW.speed);
      vel.y += THROW.lift;
      flying.push({ mesh, vel, fuse: THROW.fuse, bounced: false });
    },
    step(dt, ctx) {
      for (let i = flying.length - 1; i >= 0; i -= 1) {
        if (flyGrenade(flying[i], dt, ctx)) {
          scene.remove(flying[i].mesh);
          flying.splice(i, 1);
        }
      }
      ageBursts(dt);
    },
    clear() {
      for (const g of flying) scene.remove(g.mesh);
      flying.length = 0;
      for (const b of bursts) scene.remove(b.mesh);
      bursts.length = 0;
    },
    // Is the burst in the viewer's face? The boot module flashes the screen.
    lookingAt(pos, eye, forward) {
      scratch.copy(pos).sub(eye).normalize();
      return scratch.dot(forward) > 0.5 && eye.distanceTo(pos) < THROW.flashRange;
    },
  };
}
