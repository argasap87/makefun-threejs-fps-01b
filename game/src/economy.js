// Money: earned every round, spent in the buy menu between rounds. The
// numbers are Counter-Strike-shaped on purpose — a win pays for a rifle, a
// loss still pays for a shotgun — but every price and reward is this game's
// own. Armour is a pool of 100 that absorbs half of each hit until it runs
// out; grenades cap at two a round.
import { WEAPONS } from './weapon.js';

export const ECONOMY = {
  startMoney: 800,
  winBonus: 3250,
  lossBonus: 1900,
  killBonus: 300,
  plantBonus: 300,
  grenadePrice: 300,
  armorPrice: 650,
  maxGrenades: 2,
  maxArmor: 100,
};

export function createEconomy() {
  const state = { money: ECONOMY.startMoney, grenades: 0, armor: 0 };

  return {
    state,
    reset() {
      state.money = ECONOMY.startMoney;
      state.grenades = 0;
      state.armor = 0;
    },
    canAfford(price) {
      return state.money >= price;
    },
    // Buy a weapon: 'bought', 'owned' (already held — just equip it) or 'poor'.
    buyWeapon(id, arsenal) {
      const def = WEAPONS[id];
      if (!def) return 'poor';
      if (arsenal.owned.has(id)) {
        arsenal.equip(id);
        return 'owned';
      }
      if (state.money < def.price) return 'poor';
      state.money -= def.price;
      arsenal.buy(id);
      return 'bought';
    },
    buyGrenade() {
      if (state.grenades >= ECONOMY.maxGrenades) return 'full';
      if (state.money < ECONOMY.grenadePrice) return 'poor';
      state.money -= ECONOMY.grenadePrice;
      state.grenades += 1;
      return 'bought';
    },
    buyArmor() {
      if (state.armor >= ECONOMY.maxArmor) return 'full';
      if (state.money < ECONOMY.armorPrice) return 'poor';
      state.money -= ECONOMY.armorPrice;
      state.armor = ECONOMY.maxArmor;
      return 'bought';
    },
    // Incoming damage: armour absorbs half until it runs out.
    absorb(damage) {
      if (state.armor <= 0) return damage;
      const absorbed = Math.min(state.armor, damage * 0.5);
      state.armor -= absorbed;
      return damage - absorbed;
    },
  };
}
