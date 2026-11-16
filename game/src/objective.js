// The objective: Ember plants a charge on a site, Wardens defuse it. A round
// is won by eliminating the other team, by the charge going off, by a defuse,
// or by the clock running out with the charge unplanted (Wardens hold the
// yard). First to 5 rounds wins the match, at most 9 rounds.
import * as THREE from 'three';

export const MATCH = { winRounds: 5, maxRounds: 9, buySeconds: 12, liveSeconds: 100, chargeSeconds: 40, plantSeconds: 3, defuseSeconds: 5 };

export function createObjective(world) {
  const state = {
    phase: 'buy', // 'buy' | 'live' | 'over'
    round: 1,
    wins: { ember: 0, warden: 0 },
    timer: MATCH.buySeconds,
    planted: false,
    plantedSite: null, // 'A' | 'B'
    plantAt: 0,
    defuseAt: 0,
    chargeTimer: MATCH.chargeSeconds,
    winner: null,
    reason: '',
    matchOver: false,
  };

  function siteBox(name) {
    return name === 'A' ? world.siteA : world.siteB;
  }

  // Which site, if any, a position stands in. The site boxes are flat pads
  // the world defines; they are not colliders.
  function siteOf(pos) {
    if (world.siteA.containsPoint(pos)) return 'A';
    if (world.siteB.containsPoint(pos)) return 'B';
    return null;
  }

  return {
    state,
    siteOf,
    startRound(round) {
      state.round = round;
      state.phase = 'buy';
      state.timer = MATCH.buySeconds;
      state.planted = false;
      state.plantedSite = null;
      state.plantAt = 0;
      state.defuseAt = 0;
      state.chargeTimer = MATCH.chargeSeconds;
      state.winner = null;
      state.reason = '';
    },
    beginLive() {
      state.phase = 'live';
      state.timer = MATCH.liveSeconds;
    },
    plant(site) {
      if (state.phase !== 'live' || state.planted) return false;
      state.planted = true;
      state.plantedSite = site;
      state.chargeTimer = MATCH.chargeSeconds;
      return true;
    },
    endRound(winner, reason) {
      if (state.phase === 'over') return;
      state.phase = 'over';
      state.winner = winner;
      state.reason = reason;
      state.wins[winner] += 1;
      state.matchOver =
        state.wins.ember >= MATCH.winRounds ||
        state.wins.warden >= MATCH.winRounds ||
        state.round >= MATCH.maxRounds;
    },
    resetMatch() {
      state.wins = { ember: 0, warden: 0 };
      state.round = 1;
      state.matchOver = false;
      this.startRound(1);
    },
    siteCenter(name) {
      const center = siteBox(name).getCenter(new THREE.Vector3());
      return { x: center.x, z: center.z };
    },
  };
}
