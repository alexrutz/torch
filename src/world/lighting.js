// Coloured tile lighting.
//
// Light is flooded outward from each source with a multiplicative per-tile
// falloff, so a torch carves a warm round pool out of the dark and walls throw
// real shadows. Three channels are relaxed together, which lets a cold
// moonstone glow and a warm campfire overlap without either washing out.

// 0.84 per tile puts a torch's usable pool at roughly 8 tiles and its faint
// edge at ~16 — enough that carrying one genuinely changes what you can do.
const DECAY = 0.84;             // per orthogonal tile step
const DECAY_DIAG = DECAY ** 1.414;
const DECAY_OPAQUE = 0.18;      // light dies fast entering a wall
const CUTOFF = 0.05;            // below this a source stops propagating

// Offsets and their decay, in one flat table so the inner loop stays tight.
const NEIGH = [
  [1, 0, DECAY], [-1, 0, DECAY], [0, 1, DECAY], [0, -1, DECAY],
  [1, 1, DECAY_DIAG], [1, -1, DECAY_DIAG], [-1, 1, DECAY_DIAG], [-1, -1, DECAY_DIAG],
];

export class LightMap {
  constructor() {
    this.w = 0;
    this.h = 0;
    this.x0 = 0;
    this.y0 = 0;
    this.r = null;
    this.g = null;
    this.b = null;
    this.opaque = null;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.image = null;
    this._queue = new Int32Array(0);
    /** Kept so out-of-grid samples answer with the sky, not with white. */
    this.ambient = [1, 1, 1];
  }

  resize(w, h) {
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    const n = w * h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.opaque = new Uint8Array(n);
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = this.ctx.createImageData(w, h);
    // Worst case every cell is queued several times as better paths arrive.
    this._queue = new Int32Array(n * 6);
  }

  /**
   * @param {object} o
   * @param {import('./world.js').World} o.world
   * @param {number} o.x0 top-left tile of the region
   * @param {number[]} o.ambient sky colour [r,g,b], already scaled by time of day
   * @param {Array<{x:number,y:number,rgb:number[],strength:number}>} o.sources
   */
  compute({ world, x0, y0, ambient, sources }) {
    const { w, h, r, g, b, opaque } = this;
    this.x0 = x0; this.y0 = y0;
    this.ambient = ambient;
    const [ar, ag, ab] = ambient;

    // Seed with ambient sky light and cache opacity for the whole region.
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        r[i] = ar; g[i] = ag; b[i] = ab;
        opaque[i] = world.isOpaque(x0 + x, y0 + y) ? 1 : 0;
      }
    }

    const queue = this._queue;
    let head = 0, tail = 0;
    const cap = queue.length;

    // Inject sources.
    for (const s of sources) {
      const lx = Math.floor(s.x) - x0, ly = Math.floor(s.y) - y0;
      if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
      const i = ly * w + lx;
      const [cr, cg, cb] = s.rgb;
      const p = s.strength;
      let improved = false;
      if (cr * p > r[i]) { r[i] = cr * p; improved = true; }
      if (cg * p > g[i]) { g[i] = cg * p; improved = true; }
      if (cb * p > b[i]) { b[i] = cb * p; improved = true; }
      if (improved && tail < cap) queue[tail++] = i;
    }

    // Relax outward. A cell re-enters the queue whenever any channel improves,
    // which is what lets differently-coloured lights blend correctly.
    while (head < tail) {
      const i = queue[head++];
      const cx = i % w, cy = (i / w) | 0;
      const ir = r[i], ig = g[i], ib = b[i];
      if (ir < CUTOFF && ig < CUTOFF && ib < CUTOFF) continue;

      for (let k = 0; k < 8; k++) {
        const nx = cx + NEIGH[k][0], ny = cy + NEIGH[k][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        // Walls are lit on the face but stop light passing through.
        const d = opaque[j] ? DECAY_OPAQUE : NEIGH[k][2];
        const nr = ir * d, ng = ig * d, nb = ib * d;
        let improved = false;
        if (nr > r[j] + 0.002) { r[j] = nr; improved = true; }
        if (ng > g[j] + 0.002) { g[j] = ng; improved = true; }
        if (nb > b[j] + 0.002) { b[j] = nb; improved = true; }
        if (improved && !opaque[j] && tail < cap) queue[tail++] = j;
      }
    }
  }

  /**
   * Light at a world tile, for tinting entities and for AI.
   * Off-grid answers with ambient — returning white here would tell a shade
   * standing just off screen that it was in blinding light.
   */
  sample(wx, wy) {
    const x = Math.floor(wx) - this.x0, y = Math.floor(wy) - this.y0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this.ambient;
    const i = y * this.w + x;
    return [this.r[i], this.g[i], this.b[i]];
  }

  /** Average brightness at a tile — used by AI to decide whether it's hiding. */
  brightness(wx, wy) {
    const [r, g, b] = this.sample(wx, wy);
    return (r + g + b) / 3;
  }

  /**
   * Bakes the grid into a small canvas. Drawing it scaled up with smoothing on
   * turns the per-tile values into soft gradients for free — far cheaper and
   * better looking than computing light per screen pixel.
   */
  toCanvas() {
    const { w, h, r, g, b, image } = this;
    const d = image.data;
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      // Tone-map so bright overlaps roll off instead of clipping to white.
      d[p]     = (255 * (r[i] / (1 + r[i])) * 1.7) | 0;
      d[p + 1] = (255 * (g[i] / (1 + g[i])) * 1.7) | 0;
      d[p + 2] = (255 * (b[i] / (1 + b[i])) * 1.7) | 0;
      d[p + 3] = 255;
    }
    this.ctx.putImageData(image, 0, 0);
    return this.canvas;
  }
}

/**
 * Collects light sources from tiles in view plus any entity-carried lights.
 * `flicker` is a shared phase so every flame in a room pulses together-ish
 * without each needing its own state.
 */
export function gatherTileLights(world, x0, y0, w, h, time, out = []) {
  out.length = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const t = world.lightAt(x, y);
      if (!t) continue;
      let strength = (t.lightStrength ?? 6) / 10;
      if (t.flicker) {
        // Two out-of-phase sines read as an irregular flame, no RNG needed.
        const p = x * 0.7 + y * 1.3;
        strength *= 1 + t.flicker * (Math.sin(time * 7.3 + p) * 0.6
                                   + Math.sin(time * 11.9 + p * 1.7) * 0.4);
      }
      out.push({ x, y, rgb: t.light, strength });
    }
  }
  return out;
}
