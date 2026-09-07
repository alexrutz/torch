// Scene renderer.
//
// Draws at a small internal resolution and lets the browser scale it up with
// nearest-neighbour, which is what makes the pixels look deliberate. Layers:
// ground → flat decor → y-sorted objects and actors → particles → light →
// weather → world-space UI.

import { TS, groundCanvas, objectCanvas, buildTileArt } from './tileart.js';
import { humanSprite, mobSprite, buildSprites, CHAR_W, CHAR_H } from './sprites.js';
import { Font } from './pixel.js';
import { PAL } from './palette.js';
import { byId } from '../world/tiles.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.scale = 3;
    this.drawList = [];
    this.weatherParts = [];
    this._weatherKind = null;
    buildTileArt();
    buildSprites();
  }

  /**
   * Sizes the internal buffer. We hold the game-pixel height roughly constant
   * so every device sees a comparable amount of world, then let CSS stretch.
   */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const dw = Math.max(1, this.canvas.clientWidth * dpr);
    const dh = Math.max(1, this.canvas.clientHeight * dpr);
    const aspect = dw / dh;

    // One dimension is chosen, the other is *derived* from the display aspect.
    // Clamping both independently (as an earlier version did) leaves the buffer
    // a different shape from the canvas, and CSS then stretches the pixels —
    // fatal for pixel art. Every adjustment below re-derives the partner.
    let ih = aspect >= 1 ? 236 : 460;
    let iw = Math.round(ih * aspect);
    if (iw > 640) { iw = 640; ih = Math.round(iw / aspect); }
    if (iw < 200) { iw = 200; ih = Math.round(iw / aspect); }
    iw |= 0; ih |= 0;

    if (this.canvas.width !== iw || this.canvas.height !== ih) {
      this.canvas.width = iw;
      this.canvas.height = ih;
      this.ctx.imageSmoothingEnabled = false;
    }
    this.scale = dh / ih;
    return { w: iw, h: ih };
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  /** Converts a CSS-pixel pointer position into game pixels. */
  pointerToGame(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (px / rect.width) * this.canvas.width,
      y: (py / rect.height) * this.canvas.height,
    };
  }

  render(game) {
    const ctx = this.ctx;
    const cam = game.camera;
    const left = cam.left, top = cam.top;
    const b = cam.tileBounds(2);

    ctx.fillStyle = PAL.void;
    ctx.fillRect(0, 0, this.width, this.height);

    this._drawGround(ctx, game, b, left, top);
    this._drawActors(ctx, game, b, left, top);
    game.particles.draw(ctx, left, top);
    this._drawLight(ctx, game);
    this._drawWeather(ctx, game);
    this._drawWorldUI(ctx, game, left, top);
  }

  // ── layer 1: ground and flat decor ─────────────────────────────
  _drawGround(ctx, game, b, left, top) {
    const world = game.world;
    for (let y = b.y0; y <= b.y1; y++) {
      const sy = y * TS - top;
      for (let x = b.x0; x <= b.x1; x++) {
        const g = groundCanvas(world.getGround(x, y), x, y);
        if (g) ctx.drawImage(g, x * TS - left, sy);
      }
    }
    // Flat decor draws with the ground so tall things can overlap it.
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const id = world.getObject(x, y);
        if (!id) continue;
        const def = byId.get(id);
        if (!def?.decor) continue;
        const art = objectCanvas(id);
        if (!art) continue;
        ctx.drawImage(art.canvas, x * TS - left + art.ox,
                      y * TS - top + TS - art.canvas.height);
      }
    }
  }

  // ── layer 2: everything that needs depth sorting ───────────────
  _drawActors(ctx, game, b, left, top) {
    const list = this.drawList;
    list.length = 0;
    const world = game.world;

    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const id = world.getObject(x, y);
        if (!id) continue;
        const def = byId.get(id);
        if (!def || def.decor) continue;
        const art = objectCanvas(id);
        if (!art) continue;
        list.push({ sort: y * TS + TS, kind: 'tile', art, x, y });
      }
    }

    for (const e of game.entities) {
      if (e.remove) continue;
      list.push({ sort: e.y + 6, kind: 'entity', e });
    }

    list.sort((a, b2) => a.sort - b2.sort);

    for (const item of list) {
      if (item.kind === 'tile') {
        ctx.drawImage(item.art.canvas,
          item.x * TS - left + item.art.ox,
          item.y * TS - top + TS - item.art.canvas.height);
      } else {
        this._drawEntity(ctx, game, item.e, left, top);
      }
    }
  }

  _drawEntity(ctx, game, e, left, top) {
    if (e.draw) { e.draw(ctx, left, top, game); return; }

    let frames = null, w = CHAR_W, h = CHAR_H, bob = 0;
    if (e.role) {                                  // NPC
      frames = humanSprite(e.role);
    } else if (e.species) {                        // Mob
      const def = e.def;
      bob = e.drawBob();
      if (def.sprite) {
        const s = mobSprite(def.sprite);
        if (!s) return;
        const dir = (e.facing === 'left') ? s.left : s.right;
        const img = dir[Math.min(e.frame, dir.length - 1)];
        this._blit(ctx, img, e, left, top, s.w, s.h, bob, game);
        return;
      }
      frames = humanSprite(def.skin || 'bandit');
    } else {                                       // Player
      frames = humanSprite('player');
    }

    const dir = frames[e.facing] || frames.down;
    const img = dir[Math.min(e.frame ?? 0, dir.length - 1)];
    this._blit(ctx, img, e, left, top, w, h, bob, game);
  }

  /** Blits a sprite with hit-flash and a soft contact shadow. */
  _blit(ctx, img, e, left, top, w, h, bob, game) {
    const x = Math.round(e.x - left - w / 2);
    const y = Math.round(e.y - top - h + 6 + bob);

    ctx.globalAlpha = 0.28;
    ctx.fillStyle = PAL.void;
    const sw = Math.round(w * 0.62);
    ctx.fillRect(Math.round(e.x - left - sw / 2), Math.round(e.y - top + 3), sw, 2);
    ctx.globalAlpha = 1;

    ctx.drawImage(img, x, y);

    if (e.hurtFlash > 0) {
      // Tint by redrawing the sprite as a solid silhouette on top.
      ctx.save();
      ctx.globalAlpha = Math.min(0.85, e.hurtFlash * 3.4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(img, x, y);
      ctx.restore();
    }
    if (e.invuln > 0 && Math.floor(e.invuln * 18) % 2 === 0) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(img, x, y);
      ctx.globalAlpha = 1;
    }
  }

  // ── layer 3: lighting ──────────────────────────────────────────
  _drawLight(ctx, game) {
    const lm = game.lightMap;
    if (!lm.w) return;
    const canvas = lm.toCanvas();
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    // Smoothing on for this one draw turns per-tile values into gradients.
    ctx.imageSmoothingEnabled = true;
    const left = game.camera.left, top = game.camera.top;
    // One light pixel per tile: drawn at the grid origin and scaled by TS, each
    // pixel's centre lands exactly on its tile's centre. No extra offset.
    ctx.drawImage(canvas,
      lm.x0 * TS - left, lm.y0 * TS - top,
      lm.w * TS, lm.h * TS);
    ctx.imageSmoothingEnabled = false;
    ctx.restore();
  }

  // ── layer 4: weather ───────────────────────────────────────────
  _drawWeather(ctx, game) {
    const kind = game.clock.weather;
    const w = this.width, h = this.height;

    if (kind !== this._weatherKind) {
      this._weatherKind = kind;
      this.weatherParts.length = 0;
      const n = kind === 'storm' ? 220 : kind === 'rain' ? 140 : kind === 'snow' ? 110 : 0;
      for (let i = 0; i < n; i++) {
        this.weatherParts.push({
          x: Math.random() * w, y: Math.random() * h,
          v: 0.6 + Math.random() * 0.8, o: Math.random(),
        });
      }
    }

    if (kind === 'rain' || kind === 'storm') {
      const speed = kind === 'storm' ? 620 : 420;
      const slant = kind === 'storm' ? 0.42 : 0.22;
      ctx.strokeStyle = kind === 'storm' ? '#8fbcd0aa' : '#8fbcd088';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const p of this.weatherParts) {
        p.y += speed * p.v * game.dt;
        p.x += speed * slant * p.v * game.dt;
        if (p.y > h) { p.y = -6; p.x = Math.random() * w; }
        if (p.x > w) p.x -= w;
        const len = kind === 'storm' ? 9 : 6;
        ctx.moveTo(p.x | 0, p.y | 0);
        ctx.lineTo((p.x - len * slant) | 0, (p.y - len) | 0);
      }
      ctx.stroke();
    } else if (kind === 'snow') {
      ctx.fillStyle = '#eef6facc';
      for (const p of this.weatherParts) {
        p.y += 34 * p.v * game.dt;
        p.x += Math.sin(game.clock.elapsed * 1.4 + p.o * 9) * 12 * game.dt;
        if (p.y > h) { p.y = -3; p.x = Math.random() * w; }
        ctx.fillRect(p.x | 0, p.y | 0, 1, 1);
      }
    } else if (kind === 'fog') {
      // Two drifting bands read as fog far more cheaply than real noise.
      const t = game.clock.elapsed * 6;
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#c9bb9a';
      for (let i = 0; i < 3; i++) {
        const y = ((t * (0.3 + i * 0.15) + i * 90) % (h + 80)) - 40;
        ctx.fillRect(0, y, w, 26);
      }
      ctx.globalAlpha = 1;
    }

    if (game.clock.lightning > 0.5) {
      ctx.globalAlpha = (game.clock.lightning - 0.5) * 0.7;
      ctx.fillStyle = '#dfe9ff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Vignette: a couple of translucent edges, no gradient allocation.
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = PAL.void;
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillRect(0, 0, 10, h);
    ctx.fillRect(w - 10, 0, 10, h);
    ctx.globalAlpha = 1;
  }

  // ── layer 5: in-world UI ───────────────────────────────────────
  _drawWorldUI(ctx, game, left, top) {
    const p = game.player;

    // Highlight the tile the next action would affect.
    if (!p.dead) {
      const t = p.targetTile();
      const sx = t.x * TS - left, sy = t.y * TS - top;
      const solid = game.world.getObject(t.x, t.y);
      ctx.strokeStyle = solid ? '#ffe9a877' : '#ffffff33';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TS - 1, TS - 1);

      if (p.mineTarget && p.mineProgress > 0) {
        const mx = p.mineTarget.x * TS - left, my = p.mineTarget.y * TS - top;
        ctx.fillStyle = '#05070ccc';
        ctx.fillRect(mx + 2, my - 5, TS - 4, 3);
        ctx.fillStyle = PAL.gold2;
        ctx.fillRect(mx + 3, my - 4, Math.round((TS - 6) * p.mineProgress), 1);
      }
    }

    // Health pips over wounded creatures.
    for (const e of game.mobs) {
      if (e.dead || e.hp >= e.maxHp) continue;
      const w = e.def?.boss ? 30 : 14;
      const x = Math.round(e.x - left - w / 2), y = Math.round(e.y - top - 16);
      ctx.fillStyle = '#05070cbb';
      ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = PAL.blood2;
      ctx.fillRect(x, y, Math.round(w * (e.hp / e.maxHp)), 2);
    }

    // NPC names when you're close enough to talk.
    for (const e of game.npcs) {
      if (e.distanceTo(p) > 46) continue;
      Font.draw(ctx, e.name, Math.round(e.x - left), Math.round(e.y - top - 24),
        { fill: PAL.bone3, align: 'center', scale: 1 });
      Font.draw(ctx, 'talk', Math.round(e.x - left), Math.round(e.y - top - 15),
        { fill: PAL.gold2, align: 'center', scale: 1, alpha: 0.85 });
    }

    for (const t of game.floats.items) {
      const a = t.life / t.max;
      Font.draw(ctx, t.text, Math.round(t.x - left), Math.round(t.y - top),
        { fill: t.color, align: 'center', alpha: a > 0.5 ? 1 : a * 2, scale: t.scale });
    }

    if (game.prompt) {
      // Sit above the thumb buttons on touch, just above the hotbar otherwise.
      const y = Math.round(this.height * (game.input.touchMode ? 0.80 : 0.92));
      Font.draw(ctx, game.prompt, this.width / 2, y, { fill: PAL.gold3, align: 'center' });
    }
  }
}
