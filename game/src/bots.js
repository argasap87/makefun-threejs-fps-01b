// The other nine players: five Ember, five Warden, each with a name, a
// lane to walk, a place to hold, and a small set of habits.
//
// A bot's round is a loop: walk the route, hold the ground, and every
// quarter second look for something to shoot. What it sees it strafes
// against and fires at in short bursts, with a hit chance that falls off
// with distance. Without a target it works the objective instead: the
// carrier walks its lane to the end and plants when the site is empty,
// defenders walk back to a planted charge and cut it when the yard is
// clear. Everything here is an original character; nobody here is borrowed.
//
// The hot path allocates nothing: one raycaster, a few scratch vectors, and
// a target position kept on the bot itself.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { ROUTES, HOLDS, SPAWNS, slideMove } from './world.js';

const NAMES = {
  ember: ['Ash', 'Bramble', 'Cinder', 'Dusk', 'Flint'],
  warden: ['Gale', 'Heron', 'Ivy', 'Juniper', 'Kestrel'],
};

// One table for the brain's numbers, so tuning is one edit.
const BRAIN = {
  health: 100,
  walk: 3.4,
  eye: 1.55,
  scanEvery: 0.25,
  seeFar: 42,
  nearFoe: 12,
  plantClear: 10,
  burstShots: 3,
  burstExtra: 3,
  burstGap: 0.13,
  burstRest: 0.7,
  burstRestExtra: 0.6,
  headChance: 0.15,
  bodyDamage: 24,
  headDamage: 48,
  blindSeconds: 1.5,
  fallSeconds: 0.4,
  corpseSeconds: 3,
};

// A bot's body, as parts: [kind, w, h, d, x, y, z, material, part?].
// Legs are plain dark boxes; the torso carries the team colour and the
// 'torso' hit zone; the head is a pale sphere and the 'head' hit zone.
const BODY_PARTS = [
  ['box', 0.4, 0.75, 0.28, 0, 0.375, 0, 'dark', null],
  ['box', 0.52, 0.78, 0.3, 0, 1.12, 0, 'team', 'torso'],
  ['sphere', 0.155, 16, 12, 0, 1.66, 0, 'head', 'head'],
  ['box', 0.07, 0.08, 0.55, 0.2, 1.15, -0.3, 'dark', null],
];

export function createBots(scene, world, random) {
  const sight = new THREE.Raycaster();
  sight.far = 60;
  const bots = [];
  const hitMeshes = [];
  // Scratch space for the scan, the strafe and the line of sight.
  const dir = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const foeAt = new THREE.Vector3();
  const facing = new THREE.Vector3();

  function materialsFor(team) {
    const teamColor = team === 'ember' ? PALETTE.ember : PALETTE.warden;
    return {
      team: new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.05 }),
      head: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 }),
      dark: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 }),
    };
  }

  function buildBody(team) {
    const mats = materialsFor(team);
    const group = new THREE.Group();
    let torso = null;
    let head = null;
    for (const [kind, a, b, c, x, y, z, mat, part] of BODY_PARTS) {
      const geo = kind === 'sphere' ? new THREE.SphereGeometry(a, b, c) : new THREE.BoxGeometry(a, b, c);
      const mesh = new THREE.Mesh(geo, mats[mat]);
      mesh.position.set(x, y, z);
      if (part) mesh.userData.part = part;
      group.add(mesh);
      if (part === 'torso') torso = mesh;
      if (part === 'head') head = mesh;
    }
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    flash.position.set(0.2, 1.15, -0.65);
    group.add(flash);
    group.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return { group, torso, head, flash };
  }

  function spawnBot(team, index) {
    const parts = buildBody(team);
    scene.add(parts.group);
    const bot = {
      name: NAMES[team][index],
      team,
      index,
      parts,
      group: parts.group,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0,
      health: BRAIN.health,
      alive: true,
      route: [],
      routeIndex: 0,
      hold: null,
      holdYaw: 0,
      state: 'route',
      target: null,
      // Where the target stands, kept on the bot so the scan never allocates.
      targetPos: new THREE.Vector3(),
      scanAt: 0,
      burstLeft: 0,
      burstAt: 0,
      fall: 0,
      deadAt: 0,
      plantAt: 0,
      defuseAt: 0,
      blindUntil: 0,
      isCarrier: team === 'ember' && index === 0,
    };
    parts.torso.userData.bot = bot;
    parts.head.userData.bot = bot;
    hitMeshes.push(parts.torso, parts.head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 5; i += 1) {
    spawnBot('ember', i);
    spawnBot('warden', i);
  }

  function giveOrders(round) {
    const lanes = [ROUTES.aLong, ROUTES.bLong, ROUTES.mid, ROUTES.aLong, ROUTES.bLong];
    const posts = [HOLDS.A, HOLDS.B, HOLDS.mid, HOLDS.A, HOLDS.B];
    for (const bot of bots) {
      if (bot.team === 'ember') {
        const lane = lanes[bot.index % lanes.length];
        bot.route = lane.map(([x, z]) => new THREE.Vector3(x, 0, z));
        bot.hold = null;
      } else {
        const post = posts[bot.index];
        const spot = post[(round + bot.index) % post.length];
        bot.route = [new THREE.Vector3(spot[0], 0, spot[1])];
        bot.hold = new THREE.Vector3(spot[0], 0, spot[1]);
        bot.holdYaw = bot.index % 2 === 0 ? 0 : Math.PI;
      }
      bot.routeIndex = 0;
      bot.state = 'route';
      bot.target = null;
    }
  }

  function reset(round) {
    for (const bot of bots) {
      const [x, z] = SPAWNS[bot.team][bot.index];
      bot.pos.set(x, 0, z);
      bot.vel.set(0, 0, 0);
      bot.health = BRAIN.health;
      bot.alive = true;
      bot.fall = 0;
      bot.yaw = bot.team === 'ember' ? Math.PI : 0;
      bot.group.visible = true;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.copy(bot.pos);
      bot.parts.flash.material.opacity = 0;
      bot.blindUntil = 0;
      bot.plantAt = 0;
      bot.defuseAt = 0;
    }
    giveOrders(round);
  }

  function eyeOf(bot) {
    return eye.set(bot.pos.x, bot.pos.y + BRAIN.eye, bot.pos.z);
  }

  // Can the bot see the point? Nothing solid may stand between its eye and
  // the target's chest, and the point must be inside its sight range.
  function canSee(bot, point, range) {
    dir.copy(point).sub(eyeOf(bot));
    const dist = dir.length();
    if (dist > range) return false;
    dir.normalize();
    sight.set(eyeOf(bot), dir);
    sight.far = dist;
    return !sight.intersectObjects(world.shootables, false)[0];
  }

  function turnToward(bot, x, z, dt) {
    const want = Math.atan2(-(x - bot.pos.x), -(z - bot.pos.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  }

  function walkToward(bot, x, z, dt, speed) {
    const dx = x - bot.pos.x;
    const dz = z - bot.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) return true;
    bot.vel.set((dx / len) * speed, 0, (dz / len) * speed);
    turnToward(bot, x, z, dt);
    slideMove(world.colliders, bot.pos, bot.vel, dt, 0.34, 1.72);
    return false;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.deadAt = 0;
    return true;
  }

  // Any living enemy close to a point — the player counts too. Planting and
  // defusing both need the answer to be no.
  function foeClose(team, x, z, range, ctx) {
    for (const other of bots) {
      if (other.alive && other.team !== team && Math.hypot(other.pos.x - x, other.pos.z - z) < range) return true;
    }
    return ctx.playerAlive && ctx.playerTeam !== team && Math.hypot(ctx.playerPos.x - x, ctx.playerPos.z - z) < range;
  }

  // Look around: the player first, then the living enemies. The nearest
  // one actually visible wins the bot's attention.
  function lookForFoe(bot, ctx) {
    bot.scanAt = ctx.time + BRAIN.scanEvery;
    bot.target = null;
    if (ctx.time < bot.blindUntil) return;
    let best = null;
    let bestDist = BRAIN.seeFar;
    if (ctx.playerAlive && ctx.playerTeam !== bot.team) {
      foeAt.copy(ctx.playerPos);
      const d = eyeOf(bot).distanceTo(foeAt);
      if (d < bestDist && canSee(bot, foeAt, BRAIN.seeFar)) {
        bot.targetPos.copy(ctx.playerPos);
        best = { pos: bot.targetPos, isPlayer: true };
        bestDist = d;
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      foeAt.set(other.pos.x, other.pos.y + 1.2, other.pos.z);
      const d = eyeOf(bot).distanceTo(foeAt);
      if (d < bestDist && canSee(bot, foeAt, BRAIN.seeFar)) {
        bot.targetPos.copy(foeAt);
        best = { pos: bot.targetPos, bot: other };
        bestDist = d;
      }
    }
    bot.target = best;
    if (best) {
      bot.state = 'engage';
      bot.burstLeft = BRAIN.burstShots + Math.floor(random() * BRAIN.burstExtra);
      bot.burstAt = ctx.time + 0.2 + random() * 0.3;
    } else if (bot.state === 'engage') {
      bot.state = bot.hold ? 'hold' : 'route';
    }
  }

  // Face the target, strafe slowly so the duel moves, and fire in bursts.
  function fight(bot, ctx, dt) {
    const tp = bot.target.pos;
    turnToward(bot, tp.x, tp.z, dt);
    const strafe = Math.sin(ctx.time * 1.3 + bot.index * 2.1) * 1.1;
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    bot.vel.set(-fz * strafe, 0, fx * strafe);
    slideMove(world.colliders, bot.pos, bot.vel, dt, 0.34, 1.72);
    if (ctx.time < bot.burstAt || bot.burstLeft <= 0) return;
    bot.burstAt = ctx.time + BRAIN.burstGap;
    bot.burstLeft -= 1;
    bot.parts.flash.material.opacity = 0.9;
    const dist = eyeOf(bot).distanceTo(tp);
    const chance = Math.max(0.08, Math.min(0.42, 0.42 - dist * 0.008));
    if (random() < chance) {
      const head = random() < BRAIN.headChance;
      const dmg = head ? BRAIN.headDamage : BRAIN.bodyDamage;
      if (bot.target.isPlayer) ctx.damagePlayer(dmg, bot);
      else ctx.damageBot(bot.target.bot, dmg, head ? 'head' : 'torso', bot);
    }
    if (bot.burstLeft === 0) bot.burstAt = ctx.time + BRAIN.burstRest + random() * BRAIN.burstRestExtra;
  }

  // A dead bot tips over, then fades from the yard after a few seconds.
  function settleCorpse(bot, dt) {
    bot.fall = Math.min(1, bot.fall + dt / BRAIN.fallSeconds);
    bot.group.rotation.x = -bot.fall * 1.45;
    bot.deadAt += dt;
    if (bot.deadAt > BRAIN.corpseSeconds) bot.group.visible = false;
  }

  function step(dt, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        settleCorpse(bot, dt);
        continue;
      }
      bot.group.position.copy(bot.pos);
      bot.group.rotation.y = bot.yaw;
      bot.parts.flash.material.opacity = Math.max(0, bot.parts.flash.material.opacity - dt * 12);
      const blinded = ctx.time < bot.blindUntil;

      if (ctx.time >= bot.scanAt) lookForFoe(bot, ctx);

      if (bot.target && !blinded) {
        fight(bot, ctx, dt);
        continue;
      }

      // No target: work the objective.
      if (ctx.chargePlanted && bot.team === 'warden') {
        // Retake: walk to the planted site, cut the charge when it is clear.
        const site = ctx.plantedSite;
        const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
        if (d > 1.5) {
          bot.state = 'route';
          walkToward(bot, site.x, site.z, dt, BRAIN.walk);
          bot.defuseAt = 0;
        } else if (!foeClose(bot.team, bot.pos.x, bot.pos.z, BRAIN.nearFoe, ctx)) {
          bot.state = 'defuse';
          bot.defuseAt += dt;
          if (bot.defuseAt >= 5) ctx.defuse(bot);
        } else {
          bot.defuseAt = 0;
        }
        continue;
      }

      // The carrier plants when it reaches the end of its lane and the site
      // is empty of enemies.
      if (bot.isCarrier && bot.team === 'ember' && !ctx.chargePlanted) {
        const site = bot.route.length ? bot.route[bot.route.length - 1] : null;
        if (site && Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z) < 2) {
          if (!foeClose(bot.team, site.x, site.z, BRAIN.plantClear, ctx)) {
            bot.state = 'plant';
            bot.plantAt += dt;
            if (bot.plantAt >= 3) ctx.plant(bot, site);
            continue;
          }
        }
      }

      if (bot.state === 'hold' || (bot.hold && bot.routeIndex >= bot.route.length)) {
        bot.state = 'hold';
        bot.yaw += Math.sin(ctx.time * 0.5 + bot.index) * dt * 0.4;
        continue;
      }

      const wp = bot.route[bot.routeIndex];
      if (wp) {
        if (walkToward(bot, wp.x, wp.z, dt, BRAIN.walk)) bot.routeIndex += 1;
      } else if (bot.hold) {
        bot.state = 'hold';
      }
    }
  }

  return {
    bots,
    hitMeshes,
    step,
    reset,
    damage,
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    carrier() {
      return bots.find((b) => b.isCarrier);
    },
  };
}
