// Chunked tile storage over an effectively infinite plane.
//
// Terrain is a pure function of (seed, x, y), so we never persist generated
// ground — only the tiles a player actually changed. A save is therefore a few
// KB no matter how far someone has walked.

import { byId, GROWTH_NEXT } from './tiles.js';

export const CHUNK = 32;
export const CHUNK_MASK = CHUNK - 1;

const key = (cx, cy) => `${cx},${cy}`;
const tkey = (x, y) => `${x},${y}`;

export class Chunk {
  constructor(cx, cy) {
    this.cx = cx;
    this.cy = cy;
    this.ground = new Uint8Array(CHUNK * CHUNK);
    this.object = new Uint8Array(CHUNK * CHUNK);
    this.ready = false;
  }
}

export class World {
  /**
   * @param {number} seed
   * @param {'surface'|'cave'} dimension
   * @param {(chunk:Chunk, world:World)=>void} generator
   */
  constructor(seed, dimension, generator) {
    this.seed = seed >>> 0;
    this.dimension = dimension;
    this.generator = generator;
    this.chunks = new Map();
    /** Player edits: 'x,y' → [groundId, objectId]. This is the whole save. */
    this.edits = new Map();
    /** Per-tile extra state: chest contents, sign text, crop timers. */
    this.meta = new Map();
    /** Structures push NPC and mob requests here; the game drains it. */
    this.pendingSpawns = [];
    /** Tiles queued for crop growth, so we don't scan the world every tick. */
    this.growing = new Map();
  }

  chunkAt(cx, cy) {
    const k = key(cx, cy);
    let c = this.chunks.get(k);
    if (c) return c;
    c = new Chunk(cx, cy);
    this.chunks.set(k, c);
    this.generator(c, this);
    this._applyEdits(c);
    c.ready = true;
    return c;
  }

  /** Re-stamps saved edits over freshly generated terrain. */
  _applyEdits(c) {
    if (this.edits.size === 0) return;
    const x0 = c.cx * CHUNK, y0 = c.cy * CHUNK;
    // Iterating the chunk's tiles beats iterating every edit once a world is
    // well-explored, but for small edit sets the reverse is much cheaper.
    if (this.edits.size < CHUNK * CHUNK) {
      for (const [k, v] of this.edits) {
        const ci = k.indexOf(',');
        const x = +k.slice(0, ci), y = +k.slice(ci + 1);
        if (x < x0 || x >= x0 + CHUNK || y < y0 || y >= y0 + CHUNK) continue;
        const i = ((y - y0) * CHUNK) + (x - x0);
        if (v[0] >= 0) c.ground[i] = v[0];
        if (v[1] >= 0) c.object[i] = v[1];
      }
    } else {
      for (let y = 0; y < CHUNK; y++) {
        for (let x = 0; x < CHUNK; x++) {
          const v = this.edits.get(tkey(x0 + x, y0 + y));
          if (!v) continue;
          const i = y * CHUNK + x;
          if (v[0] >= 0) c.ground[i] = v[0];
          if (v[1] >= 0) c.object[i] = v[1];
        }
      }
    }
  }

  // ── tile access ────────────────────────────────────────────────
  getGround(x, y) {
    const c = this.chunkAt(x >> 5, y >> 5);
    return c.ground[((y & CHUNK_MASK) * CHUNK) + (x & CHUNK_MASK)];
  }

  getObject(x, y) {
    const c = this.chunkAt(x >> 5, y >> 5);
    return c.object[((y & CHUNK_MASK) * CHUNK) + (x & CHUNK_MASK)];
  }

  /** Reads without forcing generation — returns -1 for ungenerated chunks. */
  peekObject(x, y) {
    const c = this.chunks.get(key(x >> 5, y >> 5));
    if (!c || !c.ready) return -1;
    return c.object[((y & CHUNK_MASK) * CHUNK) + (x & CHUNK_MASK)];
  }

  setGround(x, y, id, { record = true } = {}) {
    const c = this.chunkAt(x >> 5, y >> 5);
    c.ground[((y & CHUNK_MASK) * CHUNK) + (x & CHUNK_MASK)] = id;
    if (record) this._record(x, y, id, -1);
  }

  setObject(x, y, id, { record = true } = {}) {
    const c = this.chunkAt(x >> 5, y >> 5);
    c.object[((y & CHUNK_MASK) * CHUNK) + (x & CHUNK_MASK)] = id;
    if (record) this._record(x, y, -1, id);
    const t = byId.get(id);
    if (t?.crop && GROWTH_NEXT.has(id)) this.growing.set(tkey(x, y), 0);
    else if (!t?.crop) this.growing.delete(tkey(x, y));
  }

  _record(x, y, g, o) {
    const k = tkey(x, y);
    const prev = this.edits.get(k);
    if (prev) {
      if (g >= 0) prev[0] = g;
      if (o >= 0) prev[1] = o;
    } else {
      this.edits.set(k, [g, o]);
    }
  }

  // ── queries ────────────────────────────────────────────────────
  groundTile(x, y) { return byId.get(this.getGround(x, y)); }
  objectTile(x, y) { return byId.get(this.getObject(x, y)); }

  isSolid(x, y) {
    const o = byId.get(this.getObject(x, y));
    if (o?.solid) return true;
    const g = byId.get(this.getGround(x, y));
    return !!g?.deep;                       // deep water blocks walking
  }

  isOpaque(x, y) {
    return !!byId.get(this.getObject(x, y))?.opaque;
  }

  /** Total light emitted at a tile, or null. */
  lightAt(x, y) {
    const o = byId.get(this.getObject(x, y));
    if (o?.light) return o;
    const g = byId.get(this.getGround(x, y));
    return g?.light ? g : null;
  }

  /** Can a walker stand here? */
  isWalkable(x, y) {
    if (this.isSolid(x, y)) return false;
    const g = byId.get(this.getGround(x, y));
    if (g?.deep) return false;
    return g?.id !== 0;
  }

  // ── per-tile metadata ──────────────────────────────────────────
  getMeta(x, y) { return this.meta.get(tkey(x, y)); }
  setMeta(x, y, data) {
    if (data == null) this.meta.delete(tkey(x, y));
    else this.meta.set(tkey(x, y), data);
  }

  /** Crops advance a stage every `interval` seconds of world time. */
  tickGrowth(dt, interval = 42, canGrow = () => true) {
    if (this.growing.size === 0) return;
    const done = [];
    for (const [k, t] of this.growing) {
      const ci = k.indexOf(',');
      const x = +k.slice(0, ci), y = +k.slice(ci + 1);
      if (!canGrow(x, y)) continue;
      const nt = t + dt;
      if (nt < interval) { this.growing.set(k, nt); continue; }
      const cur = this.getObject(x, y);
      const next = GROWTH_NEXT.get(cur);
      if (next == null) { done.push(k); continue; }
      this.setObject(x, y, next);
      if (!GROWTH_NEXT.has(next)) done.push(k);
      else this.growing.set(k, 0);
    }
    for (const k of done) this.growing.delete(k);
  }

  /** Discards far-away generated chunks; edits and meta are untouched. */
  trim(centerX, centerY, radiusChunks = 6) {
    if (this.chunks.size < 160) return;
    const ccx = centerX >> 5, ccy = centerY >> 5;
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - ccx) > radiusChunks || Math.abs(c.cy - ccy) > radiusChunks) {
        this.chunks.delete(k);
      }
    }
  }

  // ── persistence ────────────────────────────────────────────────
  serialize() {
    return {
      edits: [...this.edits].map(([k, v]) => [k, v[0], v[1]]),
      meta: [...this.meta],
      growing: [...this.growing],
    };
  }

  deserialize(data) {
    this.edits = new Map((data.edits || []).map(([k, g, o]) => [k, [g, o]]));
    this.meta = new Map(data.meta || []);
    this.growing = new Map(data.growing || []);
    this.chunks.clear();                   // force regeneration with edits applied
  }
}
