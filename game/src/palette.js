// The look plan, in one place. Six neutrals and one accent hue, plus one
// colour per team so a bot's side reads at a glance. Lighting makes every
// shade the game needs, so no other colour appears in the code; the same
// names are the CSS custom properties in index.html.
//
// canvas — ground and sky; surface — walls and big blocks; hairline — crates,
// pillars and trim; ink — text and light metal; muted — fill light and dim
// text; accent — muzzle flash, grenades, money; ember / warden — the teams.
export const PALETTE = {
  canvas: '#33363d',
  surface: '#54595f',
  hairline: '#7d838d',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  ember: '#e0603a',
  warden: '#3fa8c8',
};

export function shade(name) {
  return PALETTE[name];
}
