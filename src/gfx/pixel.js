// Turns compact string-art into canvases, plus a bitmap font.
// Sprites are compiled once at boot and then blitted, so the per-frame cost is
// the same as if we'd loaded a spritesheet — we just never ship one.

import { color } from './palette.js';

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w | 0);
  canvas.height = Math.max(1, h | 0);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/**
 * Paints string-art onto a context.
 * `art` is an array of equal-length strings; each character indexes `map`.
 * '.' and ' ' are always transparent.
 */
export function drawArt(ctx, art, map, ox = 0, oy = 0, scale = 1) {
  for (let y = 0; y < art.length; y++) {
    const row = art[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const key = map[ch];
      if (!key) continue;
      ctx.fillStyle = color(key);
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
}

/** Compiles string-art into a standalone canvas sized to the art. */
export function sprite(art, map, scale = 1) {
  const w = Math.max(...art.map((r) => r.length));
  const { canvas, ctx } = makeCanvas(w * scale, art.length * scale);
  drawArt(ctx, art, map, 0, 0, scale);
  return canvas;
}

/** Horizontally mirrored copy — lets one drawing serve left and right facings. */
export function flipH(src) {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return canvas;
}

/** Adds a 1px silhouette so sprites stay readable against busy terrain. */
export function outline(src, hex = '#05070c') {
  const { canvas, ctx } = makeCanvas(src.width + 2, src.height + 2);
  ctx.drawImage(src, 1, 1);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  const out = makeCanvas(src.width + 2, src.height + 2);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) out.ctx.drawImage(canvas, dx - 1, dy - 1);
  out.ctx.drawImage(src, 1, 1);
  return out.canvas;
}

/** Recolours a sprite while keeping its alpha — used for hit flashes. */
export function tint(src, hex, alpha = 1) {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// ── 5×7 bitmap font ──────────────────────────────────────────────
// Rows are '/'-separated; '#' is ink. Lowercase maps to uppercase.
const GLYPHS = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.####/#..../#..../#..../#..../#..../.####',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.####/#..../#..../#..##/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '#####/..#../..#../..#../..#../..#../#####',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '####./....#/....#/.###./....#/....#/####.',
  4: '#..#./#..#./#..#./#####/...#./...#./...#.',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '.###./#..../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/....#/.###.',
  ' ': '...../...../...../...../...../...../.....',
  '.': '...../...../...../...../...../...../..#..',
  ',': '...../...../...../...../..#../..#../.#...',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  ':': '...../..#../..#../...../..#../..#../.....',
  ';': '...../..#../..#../...../..#../..#../.#...',
  "'": '..#../..#../...../...../...../...../.....',
  '"': '.#.#./.#.#./...../...../...../...../.....',
  '-': '...../...../...../.###./...../...../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '=': '...../...../#####/...../#####/...../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.',
  ']': '.###./...#./...#./...#./...#./...#./.###.',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '%': '#...#/#..#./...#./..#../.#.../#..#./#...#',
  '*': '...../..#../#.#.#/.###./#.#.#/..#../.....',
  '#': '.#.#./#####/.#.#./.#.#./#####/.#.#./.....',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  '_': '...../...../...../...../...../...../#####',
  '♥': '.#.#./#####/#####/#####/.###./..#../.....',   // heart
  '★': '..#../..#../#####/.###./.#.#./#...#/.....',   // star
};

const GLYPH_W = 5, GLYPH_H = 7, TRACKING = 1;
const parsed = new Map();
for (const [ch, def] of Object.entries(GLYPHS)) parsed.set(ch, def.split('/'));

export const Font = {
  height: GLYPH_H,
  lineHeight: GLYPH_H + 2,

  width(text, scale = 1) {
    return text.length > 0
      ? (text.length * (GLYPH_W + TRACKING) - TRACKING) * scale
      : 0;
  },

  /**
   * Draws pixel text. `align` accepts 'left' | 'center' | 'right'.
   * A 1px drop shadow is on by default — in-world text sits over noisy
   * terrain and is unreadable without it.
   */
  draw(ctx, text, x, y, {
    fill = '#fdf6e3', scale = 1, align = 'left', shadow = '#05070c', alpha = 1,
  } = {}) {
    const str = String(text).toUpperCase();
    const w = Font.width(str, scale);
    let ox = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ox = Math.round(ox);
    const oy = Math.round(y);

    const paint = (col, dx, dy) => {
      ctx.fillStyle = col;
      let cx = ox + dx;
      for (const ch of str) {
        const g = parsed.get(ch) || parsed.get('?');
        for (let row = 0; row < GLYPH_H; row++) {
          const line = g[row];
          for (let col2 = 0; col2 < GLYPH_W; col2++) {
            if (line[col2] === '#') {
              ctx.fillRect(cx + col2 * scale, oy + dy + row * scale, scale, scale);
            }
          }
        }
        cx += (GLYPH_W + TRACKING) * scale;
      }
    };

    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    if (shadow) paint(shadow, scale, scale);
    paint(fill, 0, 0);
    ctx.globalAlpha = prevAlpha;
    return w;
  },
};
