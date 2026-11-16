// The money between rounds: what a round pays, what the shop charges, and
// how armour soaks up hits.
//
// The shape is familiar on purpose — a win buys a rifle, a loss still buys a
// shotgun — but the figures are the game's own. Armour is a 100-point pool:
// every hit loses half its damage to the vest until the pool is empty. The
// shop sells at most two grenades a round, and a vest tops the pool up to
// full rather than stacking.
import { WEAPONS } from './weapon.js';

const PRICES = {
  grenade: 300,
  armor: 650,
};

const REWARDS = {
  start: 800,
  win: 3250,
  loss: 1900,
  kill: 300,
  plant: 300,
};

const LIMITS = { grenades: 2, armor: 100 };

export const ECONOMY = {
  startMoney: REWARDS.start,
  winBonus: REWARDS.win,
  lossBonus: REWARDS.loss,
  killBonus: REWARDS.kill,
  plantBonus: REWARDS.plant,
  grenadePrice: PRICES.grenade,
  armorPrice: PRICES.armor,
  maxGrenades: LIMITS.grenades,
  maxArmor: LIMITS.armor,
};

export function createEconomy() {
  const state = { money: REWARDS.start, grenades: 0, armor: 0 };

  function charge(price) {
    if (state.money < price) return false;
    state.money -= price;
    return true;
  }

  return {
    state,
    reset() {
      state.money = REWARDS.start;
      state.grenades = 0;
      state.armor = 0;
    },
    canAfford(price) {
      return state.money >= price;
    },
    // A weapon sale answers 'bought', 'owned' or 'poor'. Owning the weapon
    // already just equips it and costs nothing.
    buyWeapon(id, arsenal) {
      const def = WEAPONS[id];
      if (!def) return 'poor';
      if (arsenal.owned.has(id)) {
        arsenal.equip(id);
        return 'owned';
      }
      if (!charge(def.price)) return 'poor';
      arsenal.buy(id);
      return 'bought';
    },
    buyGrenade() {
      if (state.grenades >= LIMITS.grenades) return 'full';
      if (!charge(PRICES.grenade)) return 'poor';
      state.grenades += 1;
      return 'bought';
    },
    buyArmor() {
      if (state.armor >= LIMITS.armor) return 'full';
      if (!charge(PRICES.armor)) return 'poor';
      state.armor = LIMITS.armor;
      return 'bought';
    },
    // Half of each hit goes to the vest while it lasts.
    absorb(damage) {
      if (state.armor <= 0) return damage;
      const soaked = Math.min(state.armor, damage * 0.5);
      state.armor -= soaked;
      return damage - soaked;
    },
  };
}
