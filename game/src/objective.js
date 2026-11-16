// Rounds, the charge, and the match. Ember attacks: plant the charge on a
// site and guard it until it blows. Warden defends: stop the plant, or cut
// the charge before its timer runs out. A round also ends when one team is
// wiped out, or when the clock dies with nothing planted — then the yard
// stays with Warden. First side to five rounds takes the match; nine rounds
// is the most a match can run.
import * as THREE from 'three';

// One table for every number the match runs on, so a balance change is one edit.
export const MATCH_RULES = {
  winRounds: 5,
  maxRounds: 9,
  buySeconds: 12,
  liveSeconds: 100,
  chargeSeconds: 40,
  plantSeconds: 3,
  defuseSeconds: 5,
};

// Backwards-compatible alias: the boot module imports MATCH.
export const MATCH = MATCH_RULES;

function freshState() {
  return {
    phase: 'buy', // 'buy' | 'live' | 'over'
    round: 1,
    wins: { ember: 0, warden: 0 },
    timer: MATCH_RULES.buySeconds,
    planted: false,
    plantedSite: null, // 'A' | 'B'
    plantAt: 0,
    defuseAt: 0,
    chargeTimer: MATCH_RULES.chargeSeconds,
    winner: null,
    reason: '',
    matchOver: false,
  };
}

export function createObjective(world) {
  const state = freshState();
  const scratchCenter = new THREE.Vector3();

  function boxFor(name) {
    return name === 'A' ? world.siteA : world.siteB;
  }

  // The site a position stands in, if any. Site pads are flat volumes the
  // world marks out; they block nobody and stop no bullet.
  function siteOf(pos) {
    if (world.siteA.containsPoint(pos)) return 'A';
    if (world.siteB.containsPoint(pos)) return 'B';
    return null;
  }

  function openRound(round) {
    const next = freshState();
    next.round = round;
    next.wins = state.wins;
    next.matchOver = state.matchOver;
    Object.assign(state, next);
  }

  return {
    state,
    siteOf,
    startRound(round) {
      openRound(round);
    },
    beginLive() {
      state.phase = 'live';
      state.timer = MATCH_RULES.liveSeconds;
    },
    plant(site) {
      if (state.phase !== 'live' || state.planted) return false;
      state.planted = true;
      state.plantedSite = site;
      state.chargeTimer = MATCH_RULES.chargeSeconds;
      return true;
    },
    endRound(winner, reason) {
      if (state.phase === 'over') return;
      state.phase = 'over';
      state.winner = winner;
      state.reason = reason;
      state.wins[winner] += 1;
      state.matchOver =
        state.wins.ember >= MATCH_RULES.winRounds ||
        state.wins.warden >= MATCH_RULES.winRounds ||
        state.round >= MATCH_RULES.maxRounds;
    },
    resetMatch() {
      Object.assign(state, freshState());
      this.startRound(1);
    },
    siteCenter(name) {
      boxFor(name).getCenter(scratchCenter);
      return { x: scratchCenter.x, z: scratchCenter.z };
    },
  };
}
