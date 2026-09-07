// Procedural world generation.
//
// Everything here is a pure function of (seed, x, y). No generation step may
// depend on neighbouring chunks, which is what lets chunks load in any order
// and lets a save file be nothing but a seed plus the player's edits.

import { fbmN, warpedN, ridged, worley, hash3, Rng, smoothstep } from '../core/rng.js';
import { tileId } from './tiles.js';
import { CHUNK } from './world.js';

// Tile ids resolved once — name lookups in the inner loop would be far too slow.
const T = {
  void: tileId('void'), grass: tileId('grass'), grassDark: tileId('grass_dark'),
  dirt: tileId('dirt'), sand: tileId('sand'), water: tileId('water'),
  deep: tileId('deep_water'), stone: tileId('stone_floor'), snow: tileId('snow'),
  ice: tileId('ice'), mud: tileId('mud'), ash: tileId('ash'), cave: tileId('cave_floor'),
  path: tileId('path'), plank: tileId('plank'), lava: tileId('lava'),
  brickFloor: tileId('brick_floor'), moss: tileId('moss_stone'),

  oak: tileId('tree_oak'), pine: tileId('tree_pine'), palm: tileId('tree_palm'),
  dead: tileId('tree_dead'), birch: tileId('tree_birch'),
  bush: tileId('bush'), berry: tileId('berry_bush'), rock: tileId('rock'),
  boulder: tileId('boulder'), cactus: tileId('cactus'), mushroom: tileId('mushroom'),
  glowcap: tileId('glowcap'), flowers: tileId('flowers'), tuft: tileId('tuft'),
  vine: tileId('vine'), crystal: tileId('crystal'),

  copper: tileId('ore_copper'), iron: tileId('ore_iron'), gold: tileId('ore_gold'),
  moonOre: tileId('ore_crystal'),

  wallStone: tileId('wall_stone'), wallWood: tileId('wall_wood'), wallBrick: tileId('wall_brick'),
  door: tileId('door'), torch: tileId('torch'), campfire: tileId('campfire'),
  workbench: tileId('workbench'), furnace: tileId('furnace'), anvil: tileId('anvil'),
  chest: tileId('chest'), bed: tileId('bed'), fence: tileId('fence'), sign: tileId('sign'),
  grave: tileId('grave'), altar: tileId('altar'), lantern: tileId('lantern'),
  caveMouth: tileId('cave_mouth'), caveExit: tileId('cave_exit'), barrel: tileId('barrel'),
};

// ── biomes ───────────────────────────────────────────────────────
export const BIOMES = {
  ocean: { key: 'ocean', id: 0, label: 'Open Water', ground: T.deep,      map: '#10243f', mood: 'day',    decor: [], density: 0 },
  shore: { key: 'shore', id: 1, label: 'Shallows',   ground: T.water,     map: '#265a8f', mood: 'day',    decor: [], density: 0 },
  beach: { key: 'beach', id: 2, label: 'Shore',      ground: T.sand,      map: '#ddc789', mood: 'day',
              density: 0.05, decor: [[4, T.palm], [3, T.rock], [2, T.tuft]] },
  meadow: { key: 'meadow', id: 3, label: 'Meadow',     ground: T.grass,     map: '#68b34a', mood: 'day',
              density: 0.16, decor: [[6, T.tuft], [5, T.flowers], [3, T.oak], [2, T.bush],
                                     [1, T.berry], [1, T.rock]] },
  forest: { key: 'forest', id: 4, label: 'Deepwood',   ground: T.grassDark, map: '#2e6b32', mood: 'day',
              density: 0.40, decor: [[10, T.oak], [7, T.birch], [4, T.pine], [4, T.tuft],
                                     [3, T.bush], [2, T.berry], [2, T.mushroom], [1, T.rock]] },
  taiga: { key: 'taiga', id: 5, label: 'Frostwood',  ground: T.snow,      map: '#c4e4ee', mood: 'night',
              density: 0.26, decor: [[10, T.pine], [3, T.dead], [2, T.rock], [1, T.boulder]] },
  tundra: { key: 'tundra', id: 6, label: 'Icefields',  ground: T.snow,      map: '#eef6fa', mood: 'night',
              density: 0.05, decor: [[3, T.rock], [2, T.dead], [1, T.boulder]] },
  desert: { key: 'desert', id: 7, label: 'Dunes',      ground: T.sand,      map: '#f0e0ae', mood: 'day',
              density: 0.07, decor: [[6, T.cactus], [3, T.rock], [2, T.boulder], [1, T.dead]] },
  swamp: { key: 'swamp', id: 8, label: 'Mirewood',   ground: T.mud,       map: '#4a5a2a', mood: 'night',
              density: 0.30, decor: [[8, T.dead], [4, T.vine], [4, T.mushroom], [3, T.glowcap],
                                     [3, T.tuft], [2, T.bush]] },
  highland: { key: 'highland', id: 9, label: 'Crags',      ground: T.stone,     map: '#727a8c', mood: 'danger',
              density: 0.22, decor: [[8, T.boulder], [8, T.rock], [2, T.pine], [1, T.copper]] },
};
export const BIOME_LIST = Object.values(BIOMES);
const BIOME_BY_ID = new Map(BIOME_LIST.map((b) => [b.id, b]));
export const biomeById = (id) => BIOME_BY_ID.get(id) || BIOMES.meadow;

// ── the shaping fields ───────────────────────────────────────────
export const elevation = (s, x, y) => warpedN(s + 11, x * 0.0062, y * 0.0062, 1.3, 5);
export const moisture  = (s, x, y) => fbmN(s + 977, x * 0.0090, y * 0.0090, 3);
export const heat      = (s, x, y) => fbmN(s + 4231, x * 0.0041, y * 0.0041, 3);
/** Near 1 along winding lines — the river network. */
export const riverline = (s, x, y) => ridged(s + 8663, x * 0.0034, y * 0.0034, 2);

const SEA = -0.16;
const RIVER_WATER = 0.955;   // ~1.7% of tiles
const RIVER_BANK = 0.935;    // sandy margin either side

/** Classifies a tile into a biome. Pure, and used by both gen and the map. */
export function biomeAt(seed, x, y) {
  const e = elevation(seed, x, y);
  if (e < SEA - 0.16) return BIOMES.ocean;
  if (e < SEA) return BIOMES.shore;

  const t = heat(seed, x, y);
  const m = moisture(seed, x, y);

  // Rivers: a narrow crest band of ridged noise, with sandy banks either side.
  // The threshold is tuned so water covers ~1.7% of land, not 13%.
  if (e < 0.44) {
    const rv = riverline(seed, x, y);
    if (rv > RIVER_WATER) return BIOMES.shore;
    if (rv > RIVER_BANK) return BIOMES.beach;
  }
  if (e < SEA + 0.055) return BIOMES.beach;
  if (e > 0.44) return BIOMES.highland;

  if (t < -0.42) return e > 0.15 ? BIOMES.tundra : BIOMES.taiga;
  if (t < -0.16) return BIOMES.taiga;
  if (t > 0.30 && m < -0.18) return BIOMES.desert;
  if (m > 0.34 && t > -0.05) return BIOMES.swamp;
  if (m > 0.02) return BIOMES.forest;
  return BIOMES.meadow;
}

/** Deterministic 0..1 value per tile per channel — the workhorse of scatter. */
const rnd = (seed, x, y, channel) => (hash3(x, y, seed + channel * 7919) & 0xffff) / 65536;

// ── structures ───────────────────────────────────────────────────
// Structures live on a coarse grid so a chunk only has to check the handful of
// cells it could possibly overlap.

const CELL = 112;

export const STRUCTURE_KINDS = {
  village:   { w: 46, h: 40 },
  ruin:      { w: 15, h: 15 },
  camp:      { w: 9,  h: 9 },
  graveyard: { w: 17, h: 15 },
  cavemouth: { w: 5,  h: 5 },
  hut:       { w: 11, h: 10 },
};

/** What structure, if any, occupies grid cell (gx,gy)? */
export function structureInCell(seed, gx, gy) {
  // Cell (0,0) always holds the starting village so a new game has a home.
  if (gx === 0 && gy === 0) {
    const site = villageSite(seed);
    return { kind: 'village', x: site.x, y: site.y, seed: hash3(seed, 0, 1) };
  }
  const h = hash3(gx, gy, seed + 55501);
  const roll = (h & 0xffff) / 65536;
  let kind = null;
  if (roll < 0.055) kind = 'village';
  else if (roll < 0.15) kind = 'ruin';
  else if (roll < 0.28) kind = 'camp';
  else if (roll < 0.36) kind = 'graveyard';
  else if (roll < 0.44) kind = 'hut';
  else if (roll < 0.72) kind = 'cavemouth';
  if (!kind) return null;

  const spec = STRUCTURE_KINDS[kind];
  const ox = gx * CELL + 8 + (((h >>> 8) & 0x3f) % Math.max(1, CELL - spec.w - 16));
  const oy = gy * CELL + 8 + (((h >>> 16) & 0x3f) % Math.max(1, CELL - spec.h - 16));

  // Structures need dry, buildable ground at their centre.
  const cx = ox + (spec.w >> 1), cy = oy + (spec.h >> 1);
  const e = elevation(seed, cx, cy);
  if (kind === 'cavemouth') {
    if (e < 0.20) return null;             // caves open in high ground only
  } else if (e < SEA + 0.07 || e > 0.46) {
    return null;
  }
  return { kind, x: ox, y: oy, seed: h };
}

const siteCache = new Map();
/** Finds flat, dry, temperate ground near the origin for the starting village. */
export function villageSite(seed) {
  if (siteCache.has(seed)) return siteCache.get(seed);
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 900; i++) {
    // Spiral outward so we prefer a home close to the world origin.
    const a = i * 2.399963;                      // golden angle
    const r = Math.sqrt(i) * 7;
    const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
    const e = elevation(seed, x, y);
    if (e < SEA + 0.10 || e > 0.34) continue;
    if (riverline(seed, x, y) > 0.80) continue;  // don't build in the river

    // Prefer temperate, gently-sloped, un-forested ground.
    const slope = Math.abs(e - elevation(seed, x + 6, y)) + Math.abs(e - elevation(seed, x, y + 6));
    const t = heat(seed, x, y), m = moisture(seed, x, y);
    const score = -slope * 24 - Math.abs(t) * 2.5 - Math.abs(m) * 1.6 - r * 0.004;
    if (score > bestScore) { bestScore = score; best = { x: x - 23, y: y - 20 }; }
  }
  const site = best || { x: -23, y: -20 };
  siteCache.set(seed, site);
  return site;
}

/** Every structure that could touch the rect, including from adjacent cells. */
function structuresOverlapping(seed, x0, y0, w, h) {
  const out = [];
  const hits = (s) => {
    const spec = STRUCTURE_KINDS[s.kind];
    return !(s.x + spec.w < x0 || s.x > x0 + w || s.y + spec.h < y0 || s.y > y0 + h);
  };

  // The starting village is placed by search, not by grid offset, so it usually
  // lands outside cell (0,0)'s own bounds. Test it directly.
  const home = structureInCell(seed, 0, 0);
  if (home && hits(home)) out.push(home);

  const g0x = Math.floor((x0 - CELL) / CELL), g1x = Math.floor((x0 + w) / CELL);
  const g0y = Math.floor((y0 - CELL) / CELL), g1y = Math.floor((y0 + h) / CELL);
  for (let gy = g0y; gy <= g1y; gy++) {
    for (let gx = g0x; gx <= g1x; gx++) {
      if (gx === 0 && gy === 0) continue;          // already handled above
      const s = structureInCell(seed, gx, gy);
      if (!s) continue;
      if (!hits(s)) continue;
      out.push(s);
    }
  }
  return out;
}

// ── stamping helper ──────────────────────────────────────────────
/** Writes blueprint tiles into a chunk, silently clipping anything outside. */
class Stamp {
  constructor(chunk) {
    this.c = chunk;
    this.x0 = chunk.cx * CHUNK;
    this.y0 = chunk.cy * CHUNK;
  }
  _i(x, y) {
    const lx = x - this.x0, ly = y - this.y0;
    if (lx < 0 || ly < 0 || lx >= CHUNK || ly >= CHUNK) return -1;
    return ly * CHUNK + lx;
  }
  g(x, y, id) { const i = this._i(x, y); if (i >= 0) this.c.ground[i] = id; }
  o(x, y, id) { const i = this._i(x, y); if (i >= 0) this.c.object[i] = id; }
  /** Ground fill that also clears whatever object was scattered there. */
  plot(x, y, w, h, groundId) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = this._i(x + i, y + j);
        if (k < 0) continue;
        if (groundId != null) this.c.ground[k] = groundId;
        this.c.object[k] = 0;
      }
    }
  }
  /** Hollow rectangle of objects — walls. */
  ring(x, y, w, h, id) {
    for (let i = 0; i < w; i++) { this.o(x + i, y, id); this.o(x + i, y + h - 1, id); }
    for (let j = 0; j < h; j++) { this.o(x, y + j, id); this.o(x + w - 1, y + j, id); }
  }
  line(x0, y0, x1, y1, groundId) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (let guard = 0; guard < 400; guard++) {
      this.g(x, y, groundId);
      const k = this._i(x, y);
      if (k >= 0) this.c.object[k] = 0;
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
}

/** Records an NPC/mob the game should instantiate when it drains the queue. */
function requestSpawn(world, chunk, kind, x, y, data = {}) {
  const lx = x - chunk.cx * CHUNK, ly = y - chunk.cy * CHUNK;
  if (lx < 0 || ly < 0 || lx >= CHUNK || ly >= CHUNK) return;  // another chunk owns it
  world.pendingSpawns.push({ kind, x, y, ...data });
}

// ── village ──────────────────────────────────────────────────────
const NPC_ROLES = ['elder', 'smith', 'farmer', 'hunter', 'trader', 'child'];

/** A cave always opens at the village's edge, so the player can't miss one. */
export function villageCaveMouth(seed) {
  const s = villageSite(seed);
  return { x: s.x + 41, y: s.y + 6 };
}

function buildVillage(st, world, chunk, s, seed) {
  const rng = new Rng(s.seed);
  const { x: X, y: Y } = s;

  // Level the ground and lay a plaza.
  st.plot(X, Y, 46, 40, T.grass);
  st.plot(X + 17, Y + 15, 12, 10, T.path);

  // Houses on a loose ring around the plaza.
  const houses = [
    [X + 3,  Y + 3,  11, 9], [X + 20, Y + 2,  10, 8], [X + 33, Y + 5,  11, 9],
    [X + 3,  Y + 27, 12, 10], [X + 32, Y + 26, 11, 10], [X + 18, Y + 30, 11, 8],
  ];
  const count = 4 + (rng.int(0, 2));
  for (let i = 0; i < count; i++) {
    const [hx, hy, hw, hh] = houses[i];
    const brick = rng.chance(0.35);
    st.plot(hx, hy, hw, hh, T.plank);
    st.ring(hx, hy, hw, hh, brick ? T.wallBrick : T.wallWood);

    // Door on the side facing the plaza.
    const doorX = hx + (hw >> 1);
    const doorY = hy + hh - 1 > Y + 20 ? hy : hy + hh - 1;
    st.o(doorX, doorY, T.door);
    st.g(doorX, doorY, T.path);
    st.o(doorX - 1, doorY, brick ? T.wallBrick : T.wallWood);

    // Furnish: every home gets a bed, plus a workstation or storage.
    st.o(hx + 2, hy + 2, T.bed);
    st.o(hx + hw - 3, hy + 2, T.chest);
    const station = rng.pick([T.workbench, T.furnace, T.anvil, T.barrel]);
    st.o(hx + hw - 3, hy + hh - 3, station);
    st.o(hx + 2, hy + hh - 3, T.torch);
    // Porch lights.
    st.o(doorX + 1, doorY + (doorY === hy ? -1 : 1), T.torch);

    st.line(doorX, doorY + (doorY === hy ? -1 : 1), X + 22, Y + 19, T.path);
    requestSpawn(world, chunk, 'npc', doorX, doorY + (doorY === hy ? -2 : 2),
      { role: NPC_ROLES[i % NPC_ROLES.length], home: [hx, hy], vseed: s.seed + i });
  }

  // Central firepit, stamped after the houses because their paths terminate on
  // this tile and paths clear whatever object is under them.
  st.o(X + 22, Y + 19, T.campfire);
  for (const [dx, dy] of [[-3, -3], [4, -3], [-3, 4], [4, 4]]) {
    st.o(X + 22 + dx, Y + 19 + dy, T.lantern);
  }

  // Fenced garden with real, harvestable crops.
  const gx = X + 6, gy = Y + 15;
  st.plot(gx, gy, 9, 8, T.grass);
  st.ring(gx, gy, 9, 8, T.fence);
  st.o(gx + 4, gy + 7, 0);                          // gate
  st.g(gx + 4, gy + 7, T.path);
  for (let j = 1; j < 7; j++) {
    for (let i = 1; i < 8; i++) {
      st.g(gx + i, gy + j, tileId('farmland'));
      const roll = rnd(s.seed, gx + i, gy + j, 3);
      st.o(gx + i, gy + j, roll < 0.5 ? tileId('crop_wheat_2')
                        : roll < 0.8 ? tileId('crop_carrot_2') : 0);
    }
  }

  // A signpost at the road in, and the cave mouth at the village edge.
  st.o(X + 22, Y + 38, T.sign);
  st.g(X + 22, Y + 38, T.path);
  const cm = villageCaveMouth(seed);
  st.plot(cm.x - 2, cm.y - 2, 5, 5, T.stone);
  st.o(cm.x, cm.y, T.caveMouth);
  st.o(cm.x - 1, cm.y - 1, T.boulder);
  st.o(cm.x + 1, cm.y - 1, T.boulder);
  st.o(cm.x - 2, cm.y + 1, T.torch);

  // Guards after dark.
  requestSpawn(world, chunk, 'npc', X + 24, Y + 21, { role: 'guard', vseed: s.seed + 90 });
}

// ── smaller structures ───────────────────────────────────────────
function buildRuin(st, s) {
  const rng = new Rng(s.seed);
  const { x: X, y: Y } = s;
  st.plot(X, Y, 15, 15, T.moss);
  // A broken ring of pillars — deliberately gappy so it reads as a ruin.
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const px = X + 7 + Math.round(Math.cos(ang) * 5.6);
    const py = Y + 7 + Math.round(Math.sin(ang) * 5.6);
    if (rng.chance(0.68)) st.o(px, py, T.wallStone);
  }
  st.o(X + 7, Y + 7, T.altar);
  st.o(X + 5, Y + 5, T.grave);
  st.o(X + 9, Y + 9, T.chest);
  for (const [dx, dy] of [[6, 3], [8, 11], [3, 8]]) {
    if (rng.chance(0.7)) st.o(X + dx, Y + dy, T.rock);
  }
}

function buildCamp(st, s) {
  const { x: X, y: Y } = s;
  st.plot(X, Y, 9, 9, T.dirt);
  st.o(X + 4, Y + 4, T.campfire);
  st.o(X + 2, Y + 2, T.chest);
  st.o(X + 6, Y + 3, T.barrel);
  st.o(X + 2, Y + 6, T.bed);
  st.o(X + 6, Y + 6, T.torch);
  st.o(X + 4, Y + 8, T.sign);
}

function buildGraveyard(st, world, chunk, s) {
  const rng = new Rng(s.seed);
  const { x: X, y: Y } = s;
  st.plot(X, Y, 17, 15, T.dirt);
  st.ring(X, Y, 17, 15, T.fence);
  st.o(X + 8, Y + 14, 0);
  for (let j = 2; j < 13; j += 3) {
    for (let i = 2; i < 15; i += 3) {
      if (rng.chance(0.72)) st.o(X + i, Y + j, T.grave);
    }
  }
  st.o(X + 8, Y + 7, T.altar);
  requestSpawn(world, chunk, 'mob', X + 8, Y + 4, { species: 'skeleton', guard: true });
  requestSpawn(world, chunk, 'mob', X + 12, Y + 10, { species: 'skeleton', guard: true });
}

function buildHut(st, world, chunk, s) {
  const rng = new Rng(s.seed);
  const { x: X, y: Y } = s;
  st.plot(X, Y, 11, 10, T.grass);
  st.plot(X + 1, Y + 1, 9, 8, T.plank);
  st.ring(X + 1, Y + 1, 9, 8, T.wallWood);
  st.o(X + 5, Y + 8, T.door);
  st.g(X + 5, Y + 8, T.path);
  st.o(X + 3, Y + 3, T.bed);
  st.o(X + 7, Y + 3, T.chest);
  st.o(X + 7, Y + 6, rng.pick([T.workbench, T.furnace]));
  st.o(X + 3, Y + 6, T.torch);
  st.o(X + 5, Y + 9, T.lantern);
  if (rng.chance(0.6)) {
    requestSpawn(world, chunk, 'npc', X + 5, Y + 9,
      { role: 'hermit', vseed: s.seed, home: [X + 1, Y + 1] });
  }
}

function buildCaveMouth(st, s) {
  const { x: X, y: Y } = s;
  st.plot(X, Y, 5, 5, T.stone);
  st.o(X + 2, Y + 2, T.caveMouth);
  st.o(X, Y, T.boulder); st.o(X + 4, Y, T.boulder);
  st.o(X, Y + 4, T.rock); st.o(X + 4, Y + 4, T.boulder);
}

// ── surface generator ────────────────────────────────────────────
export function makeSurfaceGenerator(seed) {
  return function generateSurface(chunk, world) {
    const x0 = chunk.cx * CHUNK, y0 = chunk.cy * CHUNK;

    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, y = y0 + ly, i = ly * CHUNK + lx;
        const b = biomeAt(seed, x, y);
        let ground = b.ground;

        // Rivers and lake edges: shallow water with a sandy lip.
        if (b === BIOMES.shore) {
          const e = elevation(seed, x, y);
          if (e < SEA - 0.10) ground = T.deep;
        }

        // Break up large flat expanses with patches of a related material.
        if (b === BIOMES.meadow || b === BIOMES.forest) {
          const p = fbmN(seed + 313, x * 0.09, y * 0.09, 2);
          if (p > 0.62) ground = T.dirt;
          else if (p < -0.72) ground = T.moss;
        } else if (b === BIOMES.highland) {
          const p = fbmN(seed + 511, x * 0.07, y * 0.07, 2);
          if (p > 0.45) ground = T.moss;
          else if (p < -0.6) ground = T.dirt;
        } else if (b === BIOMES.taiga || b === BIOMES.tundra) {
          const p = fbmN(seed + 733, x * 0.10, y * 0.10, 2);
          if (p > 0.70) ground = T.ice;
        } else if (b === BIOMES.desert) {
          const p = fbmN(seed + 907, x * 0.06, y * 0.06, 2);
          if (p > 0.66) ground = T.stone;
        } else if (b === BIOMES.swamp) {
          const p = fbmN(seed + 1117, x * 0.11, y * 0.11, 2);
          if (p > 0.52) ground = T.water;
        }

        chunk.ground[i] = ground;

        // Scatter decor. Liquids stay clear so shorelines read cleanly.
        if (b.density > 0 && ground !== T.water && ground !== T.deep && ground !== T.ice) {
          // A second, slower noise carves clearings and thickets out of the
          // uniform density — this is what makes forests feel authored.
          const clump = fbmN(seed + 2029, x * 0.035, y * 0.035, 2);
          const density = b.density * (0.45 + smoothstep(-0.6, 0.6, clump) * 1.35);
          if (rnd(seed, x, y, 1) < density) {
            chunk.object[i] = pickWeighted(b.decor, rnd(seed, x, y, 2));
          }
        }
      }
    }

    // Structures are stamped last so they always win over scattered terrain.
    const st = new Stamp(chunk);
    for (const s of structuresOverlapping(seed, x0, y0, CHUNK, CHUNK)) {
      switch (s.kind) {
        case 'village':   buildVillage(st, world, chunk, s, seed); break;
        case 'ruin':      buildRuin(st, s); break;
        case 'camp':      buildCamp(st, s); break;
        case 'graveyard': buildGraveyard(st, world, chunk, s); break;
        case 'hut':       buildHut(st, world, chunk, s); break;
        case 'cavemouth': buildCaveMouth(st, s); break;
      }
    }
  };
}

function pickWeighted(pairs, roll) {
  let total = 0;
  for (const [w] of pairs) total += w;
  let r = roll * total;
  for (const [w, v] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs.length ? pairs[pairs.length - 1][1] : 0;
}

// ── caves ────────────────────────────────────────────────────────
const CAVE_SALT = 0x5eed1;

/** True where the rock is hollow. Pure, so neighbours are free to test. */
export function caveOpen(seed, x, y) {
  const s = seed + CAVE_SALT;
  // Blobby chambers…
  const chambers = worley(s + 17, x * 0.026, y * 0.026) < 0.18;
  // …joined by winding tunnels along ridged-noise crests.
  const tunnel = ridged(s + 41, x * 0.017, y * 0.017, 2) > 0.86;
  // …plus a little porous rock so it never looks like drawn corridors.
  const porous = fbmN(s, x * 0.052, y * 0.052, 3) > 0.64;
  return chambers || tunnel || porous;
}

/** Ore richness rises with distance from the entrance shafts. */
function oreFor(seed, x, y, r) {
  const s = seed + CAVE_SALT;
  const vein = fbmN(s + 6151, x * 0.085, y * 0.085, 2);
  if (vein < 0.34) return 0;
  const roll = rnd(s, x, y, 9);
  if (r > 360 && roll < 0.16) return T.moonOre;
  if (r > 190 && roll < 0.26) return T.gold;
  if (r > 70 && roll < 0.46) return T.iron;
  if (roll < 0.62) return T.copper;
  return 0;
}

/** The endgame altar sits deep and always in the same direction per seed. */
export function altarSite(seed) {
  const a = ((hash3(seed, 77, 7) & 0xffff) / 65536) * Math.PI * 2;
  return { x: Math.round(Math.cos(a) * 520), y: Math.round(Math.sin(a) * 520) };
}

export function makeCaveGenerator(seed) {
  const altar = altarSite(seed);
  return function generateCave(chunk, world) {
    const x0 = chunk.cx * CHUNK, y0 = chunk.cy * CHUNK;

    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, y = y0 + ly, i = ly * CHUNK + lx;
        const r = Math.hypot(x, y);
        const open = caveOpen(seed, x, y);

        if (!open) {
          chunk.ground[i] = T.cave;
          // Only rock facing open space can hold a visible vein.
          const exposed = caveOpen(seed, x + 1, y) || caveOpen(seed, x - 1, y)
                       || caveOpen(seed, x, y + 1) || caveOpen(seed, x, y - 1);
          chunk.object[i] = exposed ? (oreFor(seed, x, y, r) || T.wallStone) : T.wallStone;
          continue;
        }

        // Open floor: mostly rock, with pools of water and — deep down — lava.
        const pool = fbmN(seed + 991, x * 0.06, y * 0.06, 2);
        let ground = T.cave;
        if (pool > 0.70) ground = T.water;
        else if (r > 240 && pool < -0.74) ground = T.lava;
        else if (pool < -0.48) ground = T.moss;
        chunk.ground[i] = ground;

        if (ground === T.water || ground === T.lava) { chunk.object[i] = 0; continue; }

        const roll = rnd(seed, x, y, 4);
        if (roll < 0.030) chunk.object[i] = T.glowcap;
        else if (roll < 0.050) chunk.object[i] = T.mushroom;
        else if (roll < 0.062) chunk.object[i] = T.rock;
        else if (roll < 0.070 && r > 150) chunk.object[i] = T.crystal;
        else if (roll < 0.074 && r > 60) chunk.object[i] = T.boulder;
      }
    }

    const st = new Stamp(chunk);
    carveCaveNetwork(st, seed, x0, y0);

    // Carve a landing room under every surface cave mouth and mark the way out.
    // REACH must cover the corridor length, or a chunk mid-corridor won't know
    // to carve its slice and the tunnel will come out perforated.
    const REACH = 64;
    for (const s of structuresOverlapping(seed, x0 - REACH, y0 - REACH,
                                          CHUNK + REACH * 2, CHUNK + REACH * 2)) {
      if (s.kind !== 'cavemouth') continue;
      linkToNetwork(st, seed, s.x + 2, s.y + 2);
      carveRoom(st, s.x + 2, s.y + 2, 5);
      carveCorridors(st, seed, s.x + 2, s.y + 2, 3, 34);
      st.o(s.x + 2, s.y + 2, T.caveExit);
      st.o(s.x, s.y + 2, T.torch);
    }
    const vm = villageCaveMouth(seed);
    if (vm.x + REACH > x0 && vm.x - REACH < x0 + CHUNK
     && vm.y + REACH > y0 && vm.y - REACH < y0 + CHUNK) {
      linkToNetwork(st, seed, vm.x, vm.y);
      carveRoom(st, vm.x, vm.y, 6);
      carveCorridors(st, seed, vm.x, vm.y, 4, 34);
      st.o(vm.x, vm.y, T.caveExit);
      st.o(vm.x - 2, vm.y, T.torch);
      st.o(vm.x + 2, vm.y, T.torch);
      st.o(vm.x, vm.y + 3, T.chest);
      st.o(vm.x + 3, vm.y + 2, T.sign);
    }

    // The Moon Altar chamber — the reason to go deep at all.
    if (altar.x + REACH > x0 && altar.x - REACH < x0 + CHUNK
     && altar.y + REACH > y0 && altar.y - REACH < y0 + CHUNK) {
      linkToNetwork(st, seed, altar.x, altar.y);
      carveCorridors(st, seed, altar.x, altar.y, 3, 40);
      carveRoom(st, altar.x, altar.y, 11, T.brickFloor);
      st.ring(altar.x - 9, altar.y - 9, 19, 19, T.wallBrick);
      st.o(altar.x, altar.y, T.altar);
      for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        st.o(altar.x + dx, altar.y + dy, T.lantern);
      }
      for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) {
        st.o(altar.x + dx, altar.y + dy, T.crystal);
      }
      st.o(altar.x - 2, altar.y + 7, T.chest);
      st.o(altar.x + 2, altar.y + 7, T.chest);
      st.o(altar.x, altar.y - 9, T.door);
      requestSpawn(world, chunk, 'mob', altar.x, altar.y - 4,
        { species: 'shade_lord', boss: true, guard: true });
    }
  };
}

// A thresholded noise field at ~40% density sits below the 2D site-percolation
// threshold (~0.593), so `caveOpen` alone reliably produces disconnected
// pockets — measured at 33% reachable, and as low as 9% on some seeds.
//
// The fix is explicit structure: a lattice of cave nodes whose edges exist with
// p = 0.72, comfortably above the bond-percolation threshold of 0.5 for a square
// lattice, so a giant connected component is effectively guaranteed. Carving
// those edges brings reachability to ~96% (worst seed 95%) while keeping the
// cave at ~39% open. The noise still supplies every organic shape; the lattice
// only guarantees you can walk between them.
const NODE = 26;
const EDGE_P = 0.72;

/** Jittered node position for lattice cell (nx,ny). Pure. */
function nodePos(seed, nx, ny) {
  const h = hash3(nx, ny, seed + 0x9e37);
  return {
    x: nx * NODE + 4 + ((h & 0xffff) % (NODE - 8)),
    y: ny * NODE + 4 + (((h >>> 16) & 0xffff) % (NODE - 8)),
  };
}

/** Does an edge run from node (nx,ny) toward +x (dir 0) or +y (dir 1)? */
function hasEdge(seed, nx, ny, dir) {
  return ((hash3(nx * 2 + dir, ny, seed + 0x2f1b) & 0xffff) / 65536) < EDGE_P;
}

/** Carves one wandering corridor between two points. */
function carveEdge(st, ax, ay, bx, by, wobble, radius = 1) {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
  const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
  for (let t = 0; t <= steps; t++) {
    const f = t / steps;
    const w = Math.sin(f * Math.PI) * wobble;
    const px = Math.round(ax + (bx - ax) * f + (horizontal ? 0 : w));
    const py = Math.round(ay + (by - ay) * f + (horizontal ? w : 0));
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + 1) continue;
        st.g(px + dx, py + dy, T.cave);
        st.o(px + dx, py + dy, 0);
      }
    }
  }
}

/**
 * Carves every network edge that could touch this chunk. Each chunk recomputes
 * the same edges and clips its own slice, so corridors line up across borders.
 */
function carveCaveNetwork(st, seed, x0, y0) {
  const s = seed + CAVE_SALT;
  const pad = 2;                                   // cells of slack for long edges
  const n0x = Math.floor(x0 / NODE) - pad, n1x = Math.floor((x0 + CHUNK) / NODE) + pad;
  const n0y = Math.floor(y0 / NODE) - pad, n1y = Math.floor((y0 + CHUNK) / NODE) + pad;
  for (let ny = n0y; ny <= n1y; ny++) {
    for (let nx = n0x; nx <= n1x; nx++) {
      const a = nodePos(s, nx, ny);
      for (const dir of [0, 1]) {
        if (!hasEdge(s, nx, ny, dir)) continue;
        const b = dir === 0 ? nodePos(s, nx + 1, ny) : nodePos(s, nx, ny + 1);
        const wobble = ((hash3(nx, ny, s + dir * 7) & 15) - 7) * 0.5;
        carveEdge(st, a.x, a.y, b.x, b.y, wobble);
      }
    }
  }
}

/** Links an entrance or chamber into the nearest lattice nodes. */
function linkToNetwork(st, seed, ex, ey) {
  const s = seed + CAVE_SALT;
  const nx = Math.floor(ex / NODE), ny = Math.floor(ey / NODE);
  // Three nodes, so an unlucky isolated node can't strand the entrance.
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
    const n = nodePos(s, nx + dx, ny + dy);
    carveEdge(st, ex, ey, n.x, n.y, 1.5, 1);
  }
}

/**
 * Carves winding corridors outward from a point until each one breaks into
 * natural cave, guaranteeing every entrance is actually reachable.
 *
 * The whole path is recomputed identically by every chunk it crosses — only the
 * writes are clipped — so the corridor is chunk-order independent like the rest
 * of generation. That is also why the early-exit below is safe: the loop runs
 * the same way no matter which chunk is asking.
 */
function carveCorridors(st, seed, ex, ey, count = 4, maxLen = 52) {
  for (let k = 0; k < count; k++) {
    const base = ((hash3(ex, ey, seed + k * 131) & 0xffff) / 65536) * Math.PI * 2
               + (k * Math.PI * 2) / count;
    let broke = 0;
    for (let t = 2; t <= maxLen; t++) {
      // Sine wander keeps corridors from reading as spokes on a wheel.
      const a = base + Math.sin(t * 0.16 + k * 1.7) * 0.55;
      const x = Math.round(ex + Math.cos(a) * t);
      const y = Math.round(ey + Math.sin(a) * t);
      const r = t < 6 ? 2 : 1;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + 1) continue;
          st.g(x + dx, y + dy, T.cave);
          st.o(x + dx, y + dy, 0);
        }
      }
      // Once we've been inside natural cave for a few steps, stop digging.
      if (caveOpen(seed, x, y)) { if (++broke > 3) break; } else broke = 0;
    }
  }
}

/** Clears a rough disc of rock. Slight noise on the radius keeps it organic. */
function carveRoom(st, cx, cy, radius, groundId = T.cave) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      st.g(cx + dx, cy + dy, groundId);
      st.o(cx + dx, cy + dy, 0);
    }
  }
}

// ── spawn ────────────────────────────────────────────────────────
/** Where a new game drops the player: the village plaza. */
export function spawnPoint(seed) {
  const s = villageSite(seed);
  return { x: s.x + 22, y: s.y + 22 };
}
