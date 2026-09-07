// Seeded randomness + coherent noise. Everything world-shaped derives from here,
// so the same seed always rebuilds the same world.

/** FNV-1a — turns an arbitrary seed string into a 32-bit integer. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Mixes three integers into one well-distributed 32-bit hash. */
export function hash3(x, y, z = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mulberry32 — small, fast, good enough for a game. Returns floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random source with the conveniences games actually want. */
export class Rng {
  constructor(seed) {
    this.seed = typeof seed === 'string' ? hashString(seed) : (seed >>> 0);
    this.next = mulberry32(this.seed);
  }
  float(min = 0, max = 1) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.float(min, max + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Picks from [[weight, value], …]. */
  weighted(pairs) {
    let total = 0;
    for (const [w] of pairs) total += w;
    let roll = this.next() * total;
    for (const [w, v] of pairs) { roll -= w; if (roll <= 0) return v; }
    return pairs[pairs.length - 1][1];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  /** Deterministic sub-source, so systems can't desync each other. */
  fork(salt) { return new Rng(hash3(this.seed, hashString(String(salt)))); }
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Gradient (Perlin-style) noise. Stateless — value depends only on (seed,x,y),
 * which is what lets chunks generate independently and still line up.
 * Returns roughly [-1, 1].
 */
export function noise2(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);

  const grad = (gx, gy, dx, dy) => {
    const h = hash3(gx, gy, seed) & 7;               // 8 gradient directions
    const gxv = h < 4 ? 1 : -1, gyv = (h & 1) ? 1 : -1;
    return (h & 2) ? dx * gxv * 0.7071 + dy * gyv * 0.7071
                   : (h & 4) ? dx * gxv : dy * gyv;
  };

  const x1 = lerp(grad(xi, yi, xf, yf), grad(xi + 1, yi, xf - 1, yf), u);
  const x2 = lerp(grad(xi, yi + 1, xf, yf - 1), grad(xi + 1, yi + 1, xf - 1, yf - 1), u);
  return lerp(x1, x2, v);
}

/** Fractal Brownian motion — stacked octaves, the standard terrain shaper. */
export function fbm(seed, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(seed + o * 1013, x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged noise — sharp crests. Good for mountain spines and cave walls. */
export function ridged(seed, x, y, octaves = 4) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * (1 - Math.abs(noise2(seed + o * 7919, x * freq, y * freq)));
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return (sum / norm) * 2 - 1;
}

/**
 * Worley / cellular noise. Returns distance to the nearest feature point,
 * used for cave chambers and biome blotches.
 */
export function worley(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = Infinity;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox, cy = yi + oy;
      const h = hash3(cx, cy, seed);
      const px = cx + ((h & 0xffff) / 65536);
      const py = cy + (((h >>> 16) & 0xffff) / 65536);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

/** Warps the sample point by more noise — kills the grid-aligned look. */
export function warpedFbm(seed, x, y, strength = 1.6, octaves = 4) {
  const wx = fbm(seed + 4001, x * 0.6, y * 0.6, 2) * strength;
  const wy = fbm(seed + 9007, x * 0.6, y * 0.6, 2) * strength;
  return fbm(seed, x + wx, y + wy, octaves);
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
export { lerp };

/**
 * fbm rescaled to roughly fill [-1, 1] and hard-clamped.
 * Raw fbm only spans about ±0.44, so worldgen thresholds would otherwise all
 * be tiny magic numbers. Prefer this anywhere a threshold is compared.
 */
export function fbmN(seed, x, y, octaves = 4) {
  return clamp(fbm(seed, x, y, octaves) * 2.25, -1, 1);
}

/** Same rescaling for the domain-warped variant. */
export function warpedN(seed, x, y, strength = 1.6, octaves = 4) {
  return clamp(warpedFbm(seed, x, y, strength, octaves) * 2.25, -1, 1);
}
