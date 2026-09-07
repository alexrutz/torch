// Base entity plus swept tile collision.

import { TS } from '../gfx/tileart.js';

let nextId = 1;

export class Entity {
  constructor(x, y) {
    this.id = nextId++;
    this.x = x; this.y = y;            // centre, in world pixels
    this.vx = 0; this.vy = 0;
    this.w = 10; this.h = 10;          // collision box, smaller than the sprite
    this.facing = 'down';
    /** Which world this lives in. Surface and cave share a coordinate space,
     *  so without this a villager standing at (x,y) above ground is also
     *  simulated and drawn at (x,y) underground. */
    this.dimension = 'surface';
    this.hp = 10; this.maxHp = 10;
    this.dead = false;
    this.remove = false;
    this.hurtFlash = 0;
    this.knockX = 0; this.knockY = 0;
    this.anim = 0;
    this.frame = 0;
  }

  get tx() { return Math.floor(this.x / TS); }
  get ty() { return Math.floor(this.y / TS); }

  distanceTo(o) { return Math.hypot(o.x - this.x, o.y - this.y); }

  /** Sets `facing` from a movement or aim vector. */
  faceVector(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
    else if (dy !== 0) this.facing = dy > 0 ? 'down' : 'up';
  }

  applyKnockback(fromX, fromY, force) {
    const d = Math.hypot(this.x - fromX, this.y - fromY) || 1;
    this.knockX += ((this.x - fromX) / d) * force;
    this.knockY += ((this.y - fromY) / d) * force;
  }

  hurt(amount, source = null) {
    if (this.dead || this.invuln > 0) return 0;
    this.hp -= amount;
    this.hurtFlash = 0.22;
    if (source) this.applyKnockback(source.x, source.y, source.knockback ?? 90);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return amount;
  }

  /**
   * Moves by (dx,dy) resolving each axis separately against solid tiles.
   * Axis-separated resolution is what lets you slide along a wall instead of
   * sticking to it.
   * @returns {{x:boolean,y:boolean}} which axes were blocked
   */
  moveBy(dx, dy, world) {
    const blocked = { x: false, y: false };
    const hw = this.w / 2, hh = this.h / 2;

    if (dx !== 0) {
      const nx = this.x + dx;
      const edge = dx > 0 ? nx + hw : nx - hw;
      const tileX = Math.floor(edge / TS);
      const y0 = Math.floor((this.y - hh + 0.5) / TS);
      const y1 = Math.floor((this.y + hh - 0.5) / TS);
      let hit = false;
      for (let ty = y0; ty <= y1; ty++) if (world.isSolid(tileX, ty)) { hit = true; break; }
      if (hit) {
        this.x = dx > 0 ? tileX * TS - hw - 0.01 : (tileX + 1) * TS + hw + 0.01;
        this.vx = 0;
        blocked.x = true;
      } else {
        this.x = nx;
      }
    }

    if (dy !== 0) {
      const ny = this.y + dy;
      const edge = dy > 0 ? ny + hh : ny - hh;
      const tileY = Math.floor(edge / TS);
      const x0 = Math.floor((this.x - hw + 0.5) / TS);
      const x1 = Math.floor((this.x + hw - 0.5) / TS);
      let hit = false;
      for (let tx = x0; tx <= x1; tx++) if (world.isSolid(tx, tileY)) { hit = true; break; }
      if (hit) {
        this.y = dy > 0 ? tileY * TS - hh - 0.01 : (tileY + 1) * TS + hh + 0.01;
        this.vy = 0;
        blocked.y = true;
      } else {
        this.y = ny;
      }
    }
    return blocked;
  }

  /** Decays knockback and applies it. Call before your own movement. */
  applyPhysics(dt, world) {
    if (this.knockX || this.knockY) {
      this.moveBy(this.knockX * dt, this.knockY * dt, world);
      const d = Math.pow(0.001, dt);
      this.knockX *= d;
      this.knockY *= d;
      if (Math.abs(this.knockX) < 1) this.knockX = 0;
      if (Math.abs(this.knockY) < 1) this.knockY = 0;
    }
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.invuln > 0) this.invuln -= dt;
  }

  /** Ground speed multiplier from the tile underfoot. */
  terrainFactor(world) {
    const g = world.groundTile(this.tx, this.ty);
    if (!g) return 1;
    return (g.slow ?? 1) * (g.speed ?? 1);
  }
}
Entity.prototype.invuln = 0;
