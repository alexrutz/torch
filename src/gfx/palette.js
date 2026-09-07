// A single closed palette keeps every procedurally-generated sprite and tile
// looking like it came from the same artist. Ramps are ordered dark → light so
// shading code can just walk an index.

export const PAL = {
  // neutrals
  void: '#05070c', ink: '#0b0e14', slate0: '#1b1a24', slate1: '#262433',
  slate2: '#37324a', slate3: '#4a4459', slate4: '#736a86', slate5: '#9c94ad',
  bone0: '#6b6455', bone1: '#9c8f75', bone2: '#c9bb9a', bone3: '#e8dcc0', white: '#fdf6e3',

  // earth & stone
  dirt0: '#3a2a1e', dirt1: '#54392a', dirt2: '#6b4a2f', dirt3: '#8a6440', dirt4: '#a8825a',
  stone0: '#2b2f38', stone1: '#3e434f', stone2: '#565c6b', stone3: '#727a8c', stone4: '#949cae',
  sand0: '#8a7143', sand1: '#c2a763', sand2: '#ddc789', sand3: '#f0e0ae',

  // flora
  green0: '#16301c', green1: '#1f4a26', green2: '#2e6b32', green3: '#438f3c', green4: '#68b34a',
  green5: '#98d45f', moss: '#5a7a35', olive: '#6e7a2f',
  bark0: '#2c1d14', bark1: '#452e1e', bark2: '#5e402a',

  // water & ice
  water0: '#10243f', water1: '#1a3a63', water2: '#265a8f', water3: '#3a86b8', water4: '#63b6d8',
  ice0: '#5a7f96', ice1: '#8fbcd0', ice2: '#c4e4ee', snow: '#eef6fa',

  // fire & light
  ember0: '#6b1f0e', ember1: '#a83a12', fire0: '#e0651c', fire1: '#ff9231',
  fire2: '#ffb347', fire3: '#ffe9a8', glow: '#fff3c4',

  // blood & flesh
  blood0: '#4a0f14', blood1: '#8a1f24', blood2: '#c8434a', flesh0: '#8a5a42',
  flesh1: '#c88e63', flesh2: '#e8b98d', flesh3: '#f5d8b8',

  // metals
  iron0: '#3d434d', iron1: '#5f6772', iron2: '#8e97a3', iron3: '#c3cad3',
  gold0: '#7a5410', gold1: '#b8891f', gold2: '#e8b93a', gold3: '#ffe58a',
  copper0: '#5e3016', copper1: '#a0552a', copper2: '#d4884a',

  // arcane
  arc0: '#2a1548', arc1: '#4a2585', arc2: '#7a44c8', arc3: '#a97ae8', arc4: '#d9c0ff',
  cyan0: '#0f4a4a', cyan1: '#1f8a8a', cyan2: '#3fd0c8', cyan3: '#a8f5ee',
  rose0: '#6b1540', rose1: '#b02a6b', rose2: '#e05a9c', rose3: '#ffaed4',
  toxic0: '#2a4a12', toxic1: '#5a9a1f', toxic2: '#9ee03a',
};

/** Ordered shading ramps — index 0 is darkest. */
export const RAMPS = {
  stone: ['stone0', 'stone1', 'stone2', 'stone3', 'stone4'],
  dirt: ['dirt0', 'dirt1', 'dirt2', 'dirt3', 'dirt4'],
  grass: ['green1', 'green2', 'green3', 'green4', 'green5'],
  sand: ['sand0', 'sand1', 'sand2', 'sand3'],
  water: ['water0', 'water1', 'water2', 'water3', 'water4'],
  ice: ['ice0', 'ice1', 'ice2', 'snow'],
  wood: ['bark0', 'bark1', 'bark2', 'dirt3', 'dirt4'],
  iron: ['iron0', 'iron1', 'iron2', 'iron3'],
  gold: ['gold0', 'gold1', 'gold2', 'gold3'],
  copper: ['copper0', 'copper1', 'copper2'],
  fire: ['ember1', 'fire0', 'fire1', 'fire2', 'fire3'],
  arcane: ['arc1', 'arc2', 'arc3', 'arc4'],
};

/** '#rrggbb' → [r,g,b]. */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Blends two palette hex colours. t=0 → a, t=1 → b. */
export function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  );
}

/** Multiplies toward black (amount<0) or toward white (amount>0). */
export function shade(hex, amount) {
  return amount < 0 ? mix(hex, '#000000', -amount) : mix(hex, '#ffffff', amount);
}

/** Resolves a palette key, a ramp lookup like 'stone:2', or a raw '#hex'. */
export function color(key) {
  if (typeof key !== 'string') return '#ff00ff';
  if (key[0] === '#') return key;
  if (key.includes(':')) {
    const [ramp, idx] = key.split(':');
    const r = RAMPS[ramp];
    if (r) return PAL[r[Math.min(r.length - 1, Math.max(0, +idx))]] || '#ff00ff';
  }
  return PAL[key] || '#ff00ff';
}
