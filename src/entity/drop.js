// Loose items on the ground, and arrows in flight.

import { Entity } from './entity.js';
import { TS } from '../gfx/tileart.js';
import { PAL } from '../gfx/palette.js';
import { itemIcon } from '../gfx/sprites.js';

const MAGNET_RANGE = 42;
const PICKUP_RANGE = 9;

export class ItemDrop extends Entity {
  constructor(x, y, itemId, count = 1) {
    super(x, y);
    this.w = 6; this.h = 6;
    this.itemId = itemId;
    this.count = count;
    this.age = 0;
    this.bob = Math.random() * 6;
    // A short delay stops loot from flying straight back into you mid-swing.
    this.pickupDelay = 0.35;
    const a = Math.random() * Math.PI * 2;
    const s = 20 + Math.random() * 30;
    this.knockX = Math.cos(a) * s;
    this.knockY = Math.sin(a) * s;
  }

  update(dt, game) {
    this.applyPhysics(dt, game.world);
    this.age += dt;
    this.bob += dt * 4;
    if (this.pickupDelay > 0) { this.pickupDelay -= dt; return; }

    const p = game.player;
    const d = this.distanceTo(p);
    if (d < MAGNET_RANGE && !p.dead) {
      // Accelerate as it closes, so pickup feels eager rather than floaty.
      const pull = (1 - d / MAGNET_RANGE) * 340 + 40;
      const dx = (p.x - this.x) / (d || 1), dy = (p.y - this.y) / (d || 1);
      this.x += dx * pull * dt;
      this.y += dy * pull * dt;
    }
    if (d < PICKUP_RANGE && !p.dead) {
      const left = p.inventory.add(this.itemId, this.count);
      if (left < this.count) {
        game.onPickup(this.itemId, this.count - left);
        this.count = left;
      }
      if (this.count <= 0) this.remove = true;
    }

    if (this.age > 240) this.remove = true;      // eventually tidy up
  }

  draw(ctx, camLeft, camTop) {
    const icon = itemIcon(this.itemId);
    const x = Math.round(this.x - camLeft - 6);
    const y = Math.round(this.y - camTop - 6 + Math.sin(this.bob) * 1.6);
    // Fade out just before despawning so it doesn't vanish without warning.
    ctx.globalAlpha = this.age > 225 ? 0.35 + Math.sin(this.age * 12) * 0.3 : 1;
    ctx.drawImage(icon, 2, 2, 12, 12, x, y, 12, 12);
    ctx.globalAlpha = 1;
  }

  serialize() { return { itemId: this.itemId, count: this.count, x: this.x, y: this.y }; }
}

export class Projectile extends Entity {
  constructor(x, y, dx, dy, damage, owner, speed = 190) {
    super(x, y);
    this.w = 3; this.h = 3;
    this.dx = dx; this.dy = dy;
    this.speed = speed;
    this.damage = damage;
    this.owner = owner;
    this.life = 1.6;
    this.trail = 0;
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.remove = true; return; }

    const step = this.speed * dt;
    const nx = this.x + this.dx * step;
    const ny = this.y + this.dy * step;

    if (game.world.isSolid(Math.floor(nx / TS), Math.floor(ny / TS))) {
      game.particles.burst(this.x, this.y, 4,
        { color: [PAL.bone1, PAL.stone3], speed: 40, life: 0.3, gravity: 200 });
      this.remove = true;
      return;
    }
    this.x = nx; this.y = ny;

    this.trail -= dt;
    if (this.trail <= 0) {
      this.trail = 0.03;
      game.particles.spawn({ x: this.x, y: this.y, life: 0.18, size: 1,
                             color: PAL.bone2, drag: 0.9 });
    }

    // Arrows hit the first mob they touch.
    for (const e of game.mobs) {
      if (e.dead || e === this.owner) continue;
      if (Math.abs(e.x - this.x) < e.w && Math.abs(e.y - this.y) < e.h + 3) {
        game.hitMob(e, this.damage, this.owner, { knockback: 70, x: this.x, y: this.y });
        this.remove = true;
        return;
      }
    }
  }

  draw(ctx, camLeft, camTop) {
    const x = Math.round(this.x - camLeft), y = Math.round(this.y - camTop);
    ctx.fillStyle = PAL.bone3;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = PAL.iron3;
    ctx.fillRect(x + Math.round(this.dx * 2), y + Math.round(this.dy * 2), 2, 2);
  }
}

/** Rising damage/pickup numbers. Not an entity — the renderer owns these. */
export class FloatText {
  constructor() { this.items = []; }

  add(x, y, text, color = '#fff', opts = {}) {
    this.items.push({
      x, y, text, color, life: opts.life ?? 0.9, max: opts.life ?? 0.9,
      vy: opts.vy ?? -26, scale: opts.scale ?? 1,
    });
    if (this.items.length > 40) this.items.shift();
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const t = this.items[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.2, dt);
      if (t.life <= 0) this.items.splice(i, 1);
    }
  }
}
