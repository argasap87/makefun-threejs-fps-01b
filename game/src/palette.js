// Every colour the game uses, decided once here and nowhere else.
//
// The yard is lit, not textured: six quiet tones carry the whole scene, one
// warm accent marks money, muzzle flash and grenades, and each team gets a
// single loud colour so a bot's side is readable at a glance. The page's
// stylesheet repeats these names as its own custom properties.
//
//   canvas   — floor, sky and fog
//   surface  — walls and the big blocks
//   hairline — crates, pillars, pipes, trim
//   ink      — lettering and pale metal
//   muted    — dim lettering and the cool fill light
//   accent   — flash, grenades, money
//   ember    — the attackers
//   warden   — the defenders
const ENTRIES = [
  ['canvas', '#33363d'],
  ['surface', '#54595f'],
  ['hairline', '#7d838d'],
  ['ink', '#e9e6df'],
  ['muted', '#98a0a8'],
  ['accent', '#f0a830'],
  ['ember', '#e0603a'],
  ['warden', '#3fa8c8'],
];

export const PALETTE = Object.freeze(Object.fromEntries(ENTRIES));

export function shade(name) {
  return PALETTE[name];
}
