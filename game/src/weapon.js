// The arsenal: four hitscan weapons, each with its own numbers and view
// model. It owns the numbers and the view model; main.js owns the ray and
// the damage. Spread punishes firing on the move and rewards stopping to
// aim; the DMR zooms on right click. One ammo pool per weapon, kept when the
// weapon is holstered, so switching back does not refill a magazine.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: { id: 'p9', name: 'P9 sidearm', price: 0, mag: 12, reserve: -1, gap: 0.18, reload: 1.2, dmg: 26, head: 2, pellets: 1, spreadStill: 0.004, spreadMove: 0.03, auto: false, kick: 0.02 },
  vk9: { id: 'vk9', name: 'VK-9 rifle', price: 2500, mag: 30, reserve: 120, gap: 0.096, reload: 1.9, dmg: 34, head: 2, pellets: 1, spreadStill: 0.0022, spreadMove: 0.028, auto: true, kick: 0.055 },
  heron: { id: 'heron', name: 'Heron-12 shotgun', price: 1800, mag: 6, reserve: 24, gap: 0.85, reload: 2.6, dmg: 13, head: 2, pellets: 6, spreadStill: 0.03, spreadMove: 0.045, auto: false, kick: 0.11 },
  longbow: { id: 'longbow', name: 'Longbow DMR', price: 3200, mag: 10, reserve: 30, gap: 0.5, reload: 2.2, dmg: 80, head: 2, pellets: 1, spreadStill: 0.0008, spreadMove: 0.02, auto: false, kick: 0.09, zoom: true },
};

const MUZZLE_TIME = 0.06;
const MOVE_REFERENCE = 5.2;
const MODEL_POS = { x: 0.24, y: -0.2, z: -0.42 };

export function createWeapon(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.6, metalness: 0.3 });

  function boxMesh(w, h, d, mat, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // A small blocky view model per weapon, built from the same three materials.
  function buildModel(def) {
    const model = new THREE.Group();
    if (def.id === 'p9') {
      model.add(boxMesh(0.06, 0.05, 0.24, bodyMat));
      model.add(boxMesh(0.05, 0.12, 0.07, gripMat, 0, -0.07, 0.08));
    } else if (def.id === 'heron') {
      model.add(boxMesh(0.07, 0.07, 0.55, bodyMat));
      model.add(boxMesh(0.08, 0.09, 0.2, gripMat, 0, -0.02, -0.28));
      model.add(boxMesh(0.06, 0.09, 0.2, darkMat, 0, -0.02, 0.3));
    } else if (def.id === 'longbow') {
      model.add(boxMesh(0.04, 0.04, 0.62, darkMat, 0, 0.02, -0.42));
      model.add(boxMesh(0.05, 0.05, 0.18, gripMat, 0, 0.08, -0.05));
      model.add(boxMesh(0.06, 0.08, 0.26, bodyMat, 0, -0.02, 0.28));
    } else {
      model.add(boxMesh(0.09, 0.1, 0.42, bodyMat));
      model.add(boxMesh(0.045, 0.045, 0.4, gripMat, 0, 0.025, -0.38));
      model.add(boxMesh(0.075, 0.08, 0.22, gripMat, 0, -0.02, 0.3));
    }
    model.position.set(MODEL_POS.x, MODEL_POS.y, MODEL_POS.z);
    return model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  const owned = new Set(['p9']);
  let model = buildModel(WEAPONS.p9);
  camera.add(model);

  const state = { current: 'p9', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, scoped: false };

  function def() { return WEAPONS[state.current]; }
  function pool() { return ammo[state.current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = MODEL_POS.z + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      // Dip the barrel while the reload runs, then settle back.
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - pool().mag;
        const take = pool().reserve < 0 ? need : Math.min(need, pool().reserve);
        pool().mag += take;
        if (pool().reserve >= 0) pool().reserve -= take;
      }
    }
  }

  return {
    state,
    defs: WEAPONS,
    owned,
    get mag() { return pool().mag; },
    get reserve() { return pool().reserve; },
    get currentDef() { return def(); },
    step,
    ready() {
      return pool().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = def().kick;
    },
    takeRound() {
      if (pool().mag <= 0) return false;
      pool().mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || pool().mag === def().mag) return;
      if (pool().reserve === 0) return;
      state.reloadLeft = def().reload;
    },
    spread(speed) {
      const base = def().spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def().spreadMove;
      return state.scoped ? base * 0.4 : base;
    },
    equip(id) {
      if (!owned.has(id) || id === state.current) return false;
      camera.remove(model);
      model = buildModel(WEAPONS[id]);
      camera.add(model);
      state.current = id;
      state.reloadLeft = 0;
      state.cooldown = 0.25;
      state.scoped = false;
      return true;
    },
    buy(id) {
      if (owned.has(id)) return this.equip(id);
      owned.add(id);
      return this.equip(id);
    },
    refill() {
      for (const d of Object.values(WEAPONS)) ammo[d.id] = { mag: d.mag, reserve: d.reserve };
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    setScoped(on) {
      state.scoped = on && !!def().zoom;
    },
  };
}
