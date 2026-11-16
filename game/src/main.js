// Emberline's boot module: the renderer, the fixed-step loop, and every
// rule that ties the systems together.
//
// The simulation runs at a fixed 60 Hz and the renderer follows the
// display. Rounds, money, planting, grenades and bots all live in the
// simulation step, so a screenshot can only ever show what the code does.
// A `?shot=` query (start, play, tactics or end, with a seed) stages one
// frozen frame for capture instead of starting the loop: it runs the same
// code, settles the same simulation, renders twice, then sets
// `window.__shotReady` and stops.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapon.js';
import { createBots } from './bots.js';
import { createEconomy, ECONOMY } from './economy.js';
import { createObjective, MATCH_RULES } from './objective.js';
import { createGrenades } from './grenade.js';
import { createHud } from './hud.js';

// The clock, the seed and the capture switch, read once from the URL.
const FIXED_STEP = 1 / 60;
const query = new URLSearchParams(window.location.search);
const shot = query.get('shot');
const seed = Number.parseInt(query.get('seed') ?? '1', 10) || 1;
// Bots carry the same rifle the shop sells first; the feed names it once
// here instead of repeating a string at every kill site.
const BOT_GUN = WEAPONS.vk9.name;

// Small deterministic generator, so a capture restages the same frame.
function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

// --- Renderer, scene, camera ----------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 34, 110);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

// --- Systems ---------------------------------------------------------------
const world = createWorld(scene);
const guns = createWeapon(camera);
const purse = createEconomy();
const objective = createObjective(world);
const grenades = createGrenades(scene, world);
const bots = createBots(scene, world, random);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
// Scratch vectors for the frame: the loop and the shooting path allocate
// nothing. The two target lists never change after boot, so they are built
// once here instead of once per shot.
const aimDir = new THREE.Vector3();
const eyeAt = new THREE.Vector3();
const lookDir = new THREE.Vector3();
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const playerEye = new THREE.Vector3();
const targets = world.shootables.concat(bots.hitMeshes);

const pawn = player.state;
const match = objective.state;
const wallet = purse.state;
const holdMarkerMs = shot ? 4000 : 90;

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let playerHealth = 100;
let playerAlive = true;
let playerKills = 0;
let intermission = 0;
let plantHeld = false;
let scoped = false;

function syncCamera() {
  camera.position.set(pawn.position.x, pawn.position.y + pawn.eye, pawn.position.z);
  camera.rotation.set(pawn.pitch, pawn.yaw, 0, 'YXZ');
  const wantFov = scoped && guns.currentDef.zoom ? 30 : 74;
  if (Math.abs(camera.fov - wantFov) > 0.2) {
    camera.fov += (wantFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - pawn.position.x;
  const dy = point.y - (pawn.position.y + pawn.eye);
  const dz = point.z - pawn.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  pawn.yaw = Math.atan2(-dx, -dz);
  pawn.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function announce(killer, killerTeam, victim, victimTeam, how) {
  hud.feed(killer, killerTeam, victim, victimTeam, how);
}

function placeBot(bot, x, z) {
  bot.pos.set(x, 0, z);
  bot.group.position.copy(bot.pos);
}

// --- Rounds ---------------------------------------------------------------
function checkElimination() {
  if (match.phase !== 'live') return;
  if (bots.aliveCount('warden') === 0) endRound('ember', 'Every Warden is down');
  else if (bots.aliveCount('ember') === 0 && !playerAlive) endRound('warden', 'Every Ember is down');
}

function endRound(winner, reason) {
  if (match.phase === 'over') return;
  objective.endRound(winner, reason);
  const won = winner === 'ember';
  wallet.money += won ? ECONOMY.winBonus : ECONOMY.lossBonus;
  hud.showBanner(won ? 'Ember takes the round' : 'Wardens take the round', reason, 3600);
  hud.setScores(match.wins.ember, match.wins.warden);
  hud.setObjective(null, 0);
  intermission = 4;
  if (document.pointerLockElement) document.exitPointerLock();
}

function startRound(round) {
  objective.startRound(round);
  grenades.clear();
  playerHealth = 100;
  playerAlive = true;
  // The player starts away from the bots: SPAWNS.ember[0] belongs to bot 0,
  // and sharing it once put a teammate's torso across the camera.
  pawn.position.set(-10, 0, 17);
  pawn.velocity.set(0, 0, 0);
  pawn.yaw = Math.PI;
  pawn.pitch = 0;
  bots.reset(round);
  guns.refill();
  hud.setScores(match.wins.ember, match.wins.warden);
  hud.setHealth(playerHealth, wallet.money, wallet.armor);
  hud.setAmmo(guns.mag, guns.reserve, guns.currentDef.name);
  hud.setTimer(match.timer, 'buy');
  hud.showBuy(wallet.money);
  syncCamera();
}

function nextRound() {
  if (match.matchOver) {
    hud.showOverlay('end', { ember: match.wins.ember, warden: match.wins.warden });
    return;
  }
  startRound(match.round + 1);
}

function restartMatch() {
  objective.resetMatch();
  purse.reset();
  playerKills = 0;
  startRound(1);
}

// --- Damage ---------------------------------------------------------------
function hurtPlayer(amount, fromBot) {
  if (!playerAlive || match.phase !== 'live') return;
  const taken = purse.absorb(amount);
  playerHealth -= taken;
  hud.setHealth(playerHealth, wallet.money, wallet.armor);
  if (playerHealth > 0) return;
  playerAlive = false;
  announce(fromBot.name, 'warden', 'You', 'ember', guns.currentDef.name);
  hud.showBanner('You are down', 'Your team fights on', 2600);
  if (document.pointerLockElement) document.exitPointerLock();
  checkElimination();
}

function hurtBotByPlayer(bot, amount, part) {
  const killed = bots.damage(bot, amount, part);
  if (!killed) return false;
  playerKills += 1;
  wallet.money += ECONOMY.killBonus;
  announce('You', 'ember', bot.name, bot.team, part === 'head' ? 'headshot' : guns.currentDef.name);
  hud.setHealth(playerHealth, wallet.money, wallet.armor);
  checkElimination();
  return true;
}

// --- Shooting -------------------------------------------------------------
function shoot(spread) {
  if (!guns.takeRound()) return false;
  const def = guns.currentDef;
  for (let p = 0; p < def.pellets; p += 1) {
    camera.getWorldDirection(aimDir);
    aimDir.x += (random() * 2 - 1) * spread;
    aimDir.y += (random() * 2 - 1) * spread;
    aimDir.z += (random() * 2 - 1) * spread;
    aimDir.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, aimDir);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const killed = hurtBotByPlayer(bot, def.dmg * (part === 'head' ? def.head : 1), part);
      hud.hitMarker(killed, holdMarkerMs);
    } else if (hit) {
      hud.hitMarker(false, holdMarkerMs);
    }
  }
  guns.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(guns.mag, guns.reserve, def.name);
  return true;
}

function throwGrenade() {
  if (wallet.grenades <= 0) return;
  wallet.grenades -= 1;
  camera.getWorldDirection(aimDir);
  eyeAt.copy(camera.position);
  grenades.throwFrom(eyeAt, aimDir);
  hud.setHealth(playerHealth, wallet.money, wallet.armor);
}

function explodeAt(pos, radius, maxDamage) {
  // The player: damage fades with distance, and a burst in the face whites
  // the screen for a blink.
  if (playerAlive) {
    const d = pos.distanceTo(camera.position);
    if (d < radius) {
      hurtPlayer(maxDamage * (1 - d / radius) * 0.6, { name: 'Shard grenade' });
      camera.getWorldDirection(lookDir);
      if (grenades.lookingAt(pos, camera.position, lookDir)) hud.flashScreen(0.85);
    }
  }
  // The bots: the same falloff, and a bot facing the burst is blinded.
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    scratchA.set(bot.pos.x, bot.pos.y + 1.2, bot.pos.z);
    const d = pos.distanceTo(scratchA);
    if (d < radius) {
      const killed = bots.damage(bot, maxDamage * (1 - d / radius), 'torso');
      if (killed) announce('Shard grenade', 'ember', bot.name, bot.team, 'blast');
    }
    scratchA.set(bot.pos.x, bot.pos.y + 1.55, bot.pos.z);
    const toBlast = scratchB.copy(pos).sub(scratchA).normalize();
    scratchA.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (toBlast.dot(scratchA) > 0.4 && d < 26) bot.blindUntil = elapsed + 1.5;
  }
  checkElimination();
}

// --- Planting and defusing ------------------------------------------------
function tryPlantOrDefuse(dt) {
  const inSite = objective.siteOf(pawn.position);
  if (match.phase === 'live' && !match.planted && playerAlive && inSite && plantHeld) {
    match.plantAt += dt;
    hud.setObjective(`Planting the charge — Site ${inSite}`, match.plantAt / MATCH_RULES.plantSeconds);
    if (match.plantAt >= MATCH_RULES.plantSeconds) {
      objective.plant(inSite);
      wallet.money += ECONOMY.plantBonus;
      hud.showBanner('Charge planted', `Site ${inSite} — 40 seconds to detonation`, 3000);
      hud.setObjective(null, 0);
    }
    return;
  }
  if (match.phase === 'live' && match.planted && playerAlive && plantHeld) {
    const c = objective.siteCenter(match.plantedSite);
    const d = Math.hypot(c.x - pawn.position.x, c.z - pawn.position.z);
    if (d < 2.5) {
      match.defuseAt += dt;
      hud.setObjective('Defusing the charge…', match.defuseAt / MATCH_RULES.defuseSeconds);
      if (match.defuseAt >= MATCH_RULES.defuseSeconds) endRound('warden', 'Charge defused');
    } else {
      match.defuseAt = 0;
      hud.setObjective(`Charge planted — Site ${match.plantedSite}`, 1 - match.chargeTimer / MATCH_RULES.chargeSeconds);
    }
    return;
  }
  match.plantAt = 0;
  if (match.phase === 'live' && match.planted) {
    hud.setObjective(`Charge planted — Site ${match.plantedSite}`, 1 - match.chargeTimer / MATCH_RULES.chargeSeconds);
  } else {
    hud.setObjective(null, 0);
  }
}

// --- What the bots see ----------------------------------------------------
function botContext() {
  playerEye.set(pawn.position.x, pawn.position.y + pawn.eye, pawn.position.z);
  return {
    time: elapsed,
    playerAlive,
    playerTeam: 'ember',
    playerPos: playerEye,
    chargePlanted: match.planted,
    plantedSite: match.plantedSite ? objective.siteCenter(match.plantedSite) : null,
    damagePlayer: hurtPlayer,
    damageBot(bot, amount, part, fromBot) {
      const killed = bots.damage(bot, amount, part);
      if (killed) {
        announce(fromBot.name, fromBot.team, bot.name, bot.team, BOT_GUN);
        checkElimination();
      }
    },
    plant(bot, sitePos) {
      const site = objective.siteOf(sitePos);
      if (site && objective.plant(site)) {
        hud.showBanner('Charge planted', `Site ${site} — 40 seconds to detonation`, 3000);
      }
    },
    defuse(bot) {
      endRound('warden', `${bot.name} defused the charge`);
    },
  };
}

// --- The fixed-step simulation --------------------------------------------
function step(dt) {
  elapsed += dt;
  if (match.phase === 'buy') {
    match.timer -= dt;
    hud.setTimer(match.timer, 'buy');
    if (match.timer <= 0) {
      objective.beginLive();
      hud.hideBuy();
      hud.setTimer(match.timer, 'live');
      hud.showBanner(`Round ${match.round}`, 'Plant the charge or drop every Warden', 2200);
    }
  } else if (match.phase === 'live') {
    if (match.planted) {
      match.chargeTimer -= dt;
      hud.setTimer(match.chargeTimer, 'live');
      if (match.chargeTimer <= 0) endRound('ember', 'Charge detonated');
    } else {
      match.timer -= dt;
      hud.setTimer(match.timer, 'live');
      if (match.timer <= 0) endRound('warden', 'Time expired — Wardens hold the yard');
    }
  } else if (match.phase === 'over') {
    intermission -= dt;
    if (intermission <= 0) nextRound();
  }

  if (playerAlive) player.step(dt, input.state.keys);
  guns.step(dt);
  bots.step(dt, botContext());
  grenades.step(dt, { explode: explodeAt });
  tryPlantOrDefuse(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerAlive && match.phase !== 'buy') player.look(look.x, look.y);
    if (playerAlive && input.state.firing && guns.ready() && match.phase === 'live') {
      shoot(shot ? 0 : guns.spread(player.groundSpeed()));
    }
    if (input.state.keys.has('KeyR')) guns.reload();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

// --- Staged frames for the screenshots ------------------------------------
// Each staging function sets the round up, moves the pieces where the frame
// needs them, and leaves the HUD showing what the frame is about. They share
// one tail: refresh the readouts, keep the buy menu only on the start frame,
// and render twice before freezing.
function stageStart() {
  startRound(1);
  pawn.position.set(0, 0, 14);
  pawn.yaw = Math.PI;
  settle(20);
  aimAt(new THREE.Vector3(0, 1.5, -10));
  hud.showBuy(wallet.money);
}

function stagePlay() {
  startRound(1);
  objective.beginLive();
  match.timer = 82;
  pawn.position.set(2, 0, 8);
  settle(20);
  const foe = bots.bots.find((b) => b.team === 'warden');
  placeBot(foe, -2, -2);
  const mate = bots.bots.find((b) => b.team === 'ember' && b.index === 1);
  placeBot(mate, 5, 4);
  aimAt(new THREE.Vector3(foe.pos.x, 1.2, foe.pos.z));
  shoot(0);
  settle(10);
  aimAt(new THREE.Vector3(foe.pos.x, 1.2, foe.pos.z));
  hud.setTimer(match.timer, 'live');
}

function stageTactics() {
  startRound(1);
  objective.beginLive();
  objective.plant('A');
  match.chargeTimer = 31;
  pawn.position.set(-12, 0, -6);
  settle(20);
  const foe = bots.bots.find((b) => b.team === 'warden' && b.index === 1);
  placeBot(foe, -18, -10);
  foe.yaw = Math.PI * 0.75;
  aimAt(new THREE.Vector3(-20, 1.4, -12));
  hud.setTimer(match.chargeTimer, 'live');
  hud.setObjective('Charge planted — Site A', 0.22);
  hud.showBanner('Charge planted', 'Site A — 31 seconds to detonation', 4000);
}

function stageEnd() {
  startRound(1);
  // endRound here, not objective.endRound: it books the 4 s intermission,
  // so the settle below cannot roll the game into the next round and move
  // the camera back to spawn.
  endRound('ember', 'Charge detonated');
  pawn.position.set(0, 0, 14);
  settle(20);
  const foe = bots.bots.find((b) => b.team === 'warden');
  bots.damage(foe, 500, 'torso');
  foe.group.rotation.x = -1.45;
  aimAt(new THREE.Vector3(0, 1.2, -12));
  hud.setScores(1, 0);
  hud.setTimer(0, 'over');
  hud.showBanner('Ember takes the round', 'Charge detonated', 4000);
}

const SHOTS = { start: stageStart, play: stagePlay, tactics: stageTactics, end: stageEnd };

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  pawn.pitch = 0;
  (SHOTS[name] ?? SHOTS.end)();
  hud.setHealth(playerHealth, wallet.money, wallet.armor);
  hud.setAmmo(guns.mag, guns.reserve, guns.currentDef.name);
  // startRound opens the buy menu again; only the start frame keeps it.
  if (name !== 'start') hud.hideBuy();
  // The round-end banner runs on a 3.6 s timer the capture's clock would
  // outlast; hold it open so the end frame keeps its banner.
  if (name === 'end') hud.showBanner('Ember takes the round', 'Charge detonated', 60000);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// --- Browser events -------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('mousedown', (event) => {
  if (event.button === 2 && playerAlive) {
    scoped = true;
    guns.setScoped(true);
  }
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 2) {
    scoped = false;
    guns.setScoped(false);
  }
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyB' && match.phase === 'buy' && !shot) {
    if (hud.buyOpen) {
      hud.hideBuy();
      input.requestLock();
    } else {
      hud.showBuy(wallet.money);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  if (hud.buyOpen && match.phase === 'buy') {
    if (event.code === 'Digit1') purse.buyWeapon('vk9', guns);
    if (event.code === 'Digit2') purse.buyWeapon('heron', guns);
    if (event.code === 'Digit3') purse.buyWeapon('longbow', guns);
    if (event.code === 'Digit4') purse.buyWeapon('p9', guns);
    if (event.code === 'Digit5') purse.buyGrenade();
    if (event.code === 'Digit6') purse.buyArmor();
    hud.setAmmo(guns.mag, guns.reserve, guns.currentDef.name);
    hud.setHealth(playerHealth, wallet.money, wallet.armor);
    if (hud.buyOpen) hud.showBuy(wallet.money);
  }
  // Number keys swap the weapon in hand during a live round; B is the shop.
  if (event.code === 'Digit1' && match.phase === 'live') guns.equip('vk9');
  if (event.code === 'Digit2' && match.phase === 'live') guns.equip('heron');
  if (event.code === 'Digit3' && match.phase === 'live') guns.equip('longbow');
  if (event.code === 'Digit4' && match.phase === 'live') guns.equip('p9');
  if (event.code === 'KeyG' && match.phase === 'live') throwGrenade();
  if (event.code === 'KeyE') plantHeld = true;
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyE') plantHeld = false;
});

hud.onPlay(() => {
  if (shot) return;
  if (match.matchOver) {
    restartMatch();
    input.requestLock();
    return;
  }
  if (!started) started = true;
  hud.hideOverlay();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (!match.matchOver && !hud.buyOpen) {
    hud.showOverlay(started ? 'paused' : 'start', { ember: match.wins.ember, warden: match.wins.warden });
  }
}

syncCamera();
startRound(1);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
