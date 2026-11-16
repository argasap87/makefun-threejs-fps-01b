// Everything the player reads while playing: crosshair, hit marker, ammo,
// health and money, the round clock, the two scores, the kill feed, the
// charge bar, the round banner and the buy menu.
//
// This module owns no game state. The boot module pushes numbers in; the
// play button reports clicks out. Setters write to the DOM only when a
// value actually moved, so a quiet frame costs nothing. Kill-feed lines are
// built from text nodes, never from markup, so a name can never inject HTML.
const OVERLAY_COPY = {
  start: {
    title: 'Emberline',
    copy: 'Five on five in the Foundry Yard. Plant the charge on Furnace or Depot, or drop every Warden. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Emberline',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: 'The yard is decided.',
    action: 'Play again',
  },
};

// Every id the HUD touches, looked up once and kept in a table.
const IDS = [
  'overlay', 'overlay-title', 'overlay-copy', 'play',
  'ammo', 'ammo-mag', 'ammo-reserve', 'weapon-name',
  'health', 'health-num', 'health-bar', 'health-sub',
  'hitmarker', 'timer', 'phase',
  'score-ember', 'score-warden', 'killfeed',
  'objective', 'objective-label', 'objective-bar',
  'banner', 'banner-text', 'banner-sub', 'flash',
  'buy', 'buy-money',
];

function grabAll() {
  const found = {};
  for (const id of IDS) found[id] = document.getElementById(id);
  return found;
}

function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud() {
  const ui = grabAll();
  let hitTimer = 0;
  let bannerTimer = 0;
  // The last values pushed, so repeats skip the DOM entirely.
  let seen = { mag: -1, reserve: -2, health: -1, money: -1, armor: -1, weapon: '' };

  return {
    setAmmo(mag, reserve, name) {
      if (mag === seen.mag && reserve === seen.reserve && name === seen.weapon) return;
      seen = { ...seen, mag, reserve, weapon: name };
      ui['ammo-mag'].textContent = String(mag);
      ui['ammo-reserve'].textContent = reserve < 0 ? '/ ∞' : `/ ${reserve}`;
      ui.ammo.classList.toggle('empty', mag === 0);
      ui['weapon-name'].textContent = name;
    },
    setHealth(health, money, armor) {
      if (health === seen.health && money === seen.money && armor === seen.armor) return;
      seen = { ...seen, health, money, armor };
      ui['health-num'].textContent = String(Math.max(0, Math.round(health)));
      ui['health-bar'].style.width = `${Math.max(0, Math.min(100, health))}%`;
      ui.health.classList.toggle('low', health <= 30);
      ui['health-sub'].textContent = `$${money} · ${armor > 0 ? `armour ${Math.round(armor)}` : 'no armour'}`;
    },
    setTimer(seconds, phaseName) {
      ui.timer.textContent = clockText(seconds);
      ui.timer.classList.toggle('low', seconds <= 10 && phaseName === 'live');
      ui.phase.textContent = phaseName.toUpperCase();
    },
    setScores(ember, warden) {
      ui['score-ember'].textContent = String(ember);
      ui['score-warden'].textContent = String(warden);
    },
    hitMarker(killed, holdMs = 90) {
      ui.hitmarker.classList.add('on');
      ui.hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        ui.hitmarker.classList.remove('on');
        ui.hitmarker.style.transform = '';
      }, holdMs);
    },
    feed(killer, killerTeam, victim, victimTeam, how) {
      const line = document.createElement('div');
      const who = document.createElement('b');
      who.className = killerTeam === 'ember' ? 'e' : 'w';
      who.textContent = killer;
      const whom = document.createElement('b');
      whom.className = victimTeam === 'ember' ? 'e' : 'w';
      whom.textContent = ` ▸ ${victim}${how ? ` (${how})` : ''}`;
      line.append(who, document.createTextNode(' '), whom);
      ui.killfeed.prepend(line);
      while (ui.killfeed.children.length > 5) ui.killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(text, sub, holdMs = 2600) {
      ui['banner-text'].textContent = text;
      ui['banner-sub'].textContent = sub;
      ui.banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => ui.banner.classList.remove('on'), holdMs);
    },
    hideBanner() {
      ui.banner.classList.remove('on');
    },
    setObjective(label, fraction) {
      if (!label) {
        ui.objective.classList.remove('on');
        return;
      }
      ui.objective.classList.add('on');
      ui['objective-label'].textContent = label;
      ui['objective-bar'].style.width = `${Math.round(fraction * 100)}%`;
    },
    flashScreen(strength) {
      ui.flash.style.opacity = String(Math.min(0.9, strength));
      setTimeout(() => {
        ui.flash.style.opacity = '0';
      }, 120);
    },
    showBuy(money) {
      ui['buy-money'].textContent = `$${money}`;
      ui.buy.hidden = false;
    },
    hideBuy() {
      ui.buy.hidden = true;
    },
    get buyOpen() {
      return !ui.buy.hidden;
    },
    showOverlay(mode, score) {
      const text = OVERLAY_COPY[mode];
      ui['overlay-title'].textContent = text.title;
      ui['overlay-copy'].textContent = mode === 'end' ? `${text.copy} Ember ${score.ember} — ${score.warden} Warden.` : text.copy;
      ui.play.textContent = text.action;
      ui.overlay.hidden = false;
      ui.play.focus();
    },
    hideOverlay() {
      ui.overlay.hidden = true;
    },
    onPlay(handler) {
      ui.play.addEventListener('click', handler);
    },
  };
}
