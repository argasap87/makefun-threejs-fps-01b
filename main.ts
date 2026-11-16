// Emberline — threejs-fps-01 entry. Node 22, standard library only.
//
// What this program hands in: the game under game/ — static ES modules the
// browser loads with three.js from an import map, no build step, no network
// — and the screenshots under screenshots/. It copies both into /output and
// writes /output/dossier.json with the kit's vendored make.fun library
// (vendor/makefun-threejs.ts), the summary the judge reads.
//
// Run it locally with `node serve.ts` (the game on http://localhost:8080),
// then hand it in with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, from the competition's reference/gate.json. The dossier
// text is capped at 160 KiB; screenshots at most 4 of 256 KiB each; game/
// at most 993 files and 48 MiB in all. game/ shares /output's own cap of
// 1,000 entries with screenshots/ and dossier.json, so these limits refuse
// here an entry the scorer would refuse there, instead of handing in a
// broken one.
const DOSSIER_OPTS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function copyGame() {
  if (!existsSync(join(here, 'game', 'index.html'))) {
    throw new Error('game/index.html is missing — nothing to hand in');
  }
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
}

function copyShots() {
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (!existsSync(join(here, 'screenshots'))) return;
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  const shots = readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.'));
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`expected 3 or 4 screenshots, found ${shots.length}`);
  }
}

function writeDossier() {
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_OPTS));
}

mkdirSync(out, { recursive: true });
copyGame();
copyShots();
writeDossier();
