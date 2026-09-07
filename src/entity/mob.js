// Hostile and neutral creatures.
//
// Behaviour is a small state machine — wander, chase, attack, flee — shaped by
// per-species parameters. Shades read the light map directly and recoil from
// bright tiles, which is what turns a torch into a weapon.

import { Entity } from './entity.js';
import { TS } from '../gfx/tileart.js';
import { PAL } from '../gfx/palette.js';
import { Rng } from '../core/rng.js';

/**
 * `light` behaviours:
 *   'burn' — takes damage and flees in bright light (shades)
 *   'shy'  — avoids lit tiles but is unharmed
 *   null   — indifferent
 */
export const SPECIES = {
  slime: {
    label: 'Slime', hp: 18, damage: 4, speed: 26, sight: 90, attackRange: 13,
    cooldown: 1.1, knockback: 60, sprite: 'slime', hop: true, aggressive: true,
    drops: [['gel', 1, 2, 0.9]], biomes: ['meadow', 'forest', 'swamp', 'beach'],
    tint: null, xp: 2,
  },
  bat: {
    label: 'Cave Bat', hp: 12, damage: 5, speed: 66, sight: 120, attackRange: 12,
    cooldown: 0.9, knockback: 40, sprite: 'bat', erratic: true, aggressive: true,
    drops: [['wing', 1, 2, 0.8], ['leather', 0, 1, 0.25]], cave: true, xp: 3,
  },
  wolf: {
    label: 'Grey Wolf', hp: 34, damage: 9, speed: 74, sight: 150, attackRange: 15,
    cooldown: 0.85, knockback: 110, sprite: 'wolf', aggressive: true, pack: true,
    drops: [['pelt', 1, 1, 0.7], ['meat', 1, 2, 0.9]],
    biomes: ['forest', 'taiga', 'tundra', 'highland'], nightBonus: true, xp: 6,
  },
  skeleton: {
    label: 'Skeleton', hp: 42, damage: 13, speed: 42, sight: 140, attackRange: 17,
    cooldown: 1.2, knockback: 90, sprite: null, skin: 'skeleton', aggressive: true,
    drops: [['bone', 1, 3, 0.95], ['arrow', 0, 3, 0.5], ['coin', 1, 4, 0.6]],
    nightOnly: true, cave: true, biomes: ['meadow', 'forest', 'highland'], xp: 10,
  },
  bandit: {
    label: 'Bandit', hp: 48, damage: 15, speed: 58, sight: 160, attackRange: 17,
    cooldown: 1.0, knockback: 100, sprite: null, skin: 'bandit', aggressive: true,
    drops: [['coin', 3, 9, 1], ['leather', 0, 2, 0.4], ['stone_sword', 0, 1, 0.12]],
    nightOnly: true, biomes: ['meadow', 'forest', 'desert', 'highland'], xp: 12,
  },
  wisp: {
    label: 'Wisp', hp: 16, damage: 6, speed: 52, sight: 110, attackRange: 12,
    cooldown: 1.4, knockback: 30, sprite: 'wisp', aggressive: false, skittish: true,
    drops: [['essence', 1, 1, 0.85]], light: null, emits: [0.5, 0.85, 1], emitStrength: 0.5,
    biomes: ['swamp', 'forest'], cave: true, nightOnly: true, xp: 8,
  },
  shade: {
    label: 'Shade', hp: 58, damage: 17, speed: 56, sight: 170, attackRange: 15,
    cooldown: 1.0, knockback: 70, sprite: 'shade', aggressive: true,
    drops: [['shadow', 1, 2, 0.8], ['essence', 0, 1, 0.3]],
    light: 'burn', nightOnly: true, cave: true,
    biomes: ['forest', 'swamp', 'highland', 'tundra'], xp: 18,
  },
  shade_lord: {
    label: 'The Hollow King', hp: 420, damage: 26, speed: 44, sight: 260,
    attackRange: 22, cooldown: 1.4, knockback: 150, sprite: 'shade_lord',
    aggressive: true, boss: true, light: 'shy',
    drops: [['moon_heart', 1, 1, 1], ['moonstone', 4, 8, 1], ['shadow', 3, 6, 1]],
    xp: 200, summons: 'shade',
  },
};

export class Mob extends Entity {
  constructor(x, y, speciesName, opts = {}) {
    super(x, y);
    const s = SPECIES[speciesName];
    this.species = speciesName;
    this.def = s;
    this.w = s.boss ? 14 : 9;
    this.h = s.boss ? 14 : 9;
    this.maxHp = s.hp;
    this.hp = s.hp;
    this.state = 'wander';
    this.stateTimer = 0;
    this.attackTimer = 0;
    this.target = null;
    this.home = { x, y };
    this.guard = !!opts.guard;         // guards don't despawn or stray
    this.rng = new Rng((x * 73856093) ^ (y * 19349663) ^ 0x9e37);
    this.wanderAngle = this.rng.float(0, Math.PI * 2);
    this.hopPhase = this.rng.float(0, 6);
    this.summonTimer = 6;
    this.frame = 0;
  }

  get isBoss() { return !!this.def.boss; }

  update(dt, game) {
    const { world, player } = game;
    this.applyPhysics(dt, world);
    this.anim += dt * 6;
    this.attackTimer -= dt;

    const lightLevel = game.lightMap.brightness(this.x / TS, this.y / TS);

    // Light-sensitive creatures take the hint, or the damage.
    if (this.def.light === 'burn' && lightLevel > 0.62) {
      this._burnTimer = (this._burnTimer ?? 0) - dt;
      if (this._burnTimer <= 0) {
        this._burnTimer = 0.5;
        this.hp -= 4;
        game.particles.burst(this.x, this.y, 4,
          { color: [PAL.arc3, PAL.fire2], speed: 30, life: 0.4, glow: true });
        if (this.hp <= 0) { this.dead = true; game.onMobDeath(this); return; }
      }
      this.state = 'flee';
      this.stateTimer = 1.2;
    }

    const dist = this.distanceTo(player);
    const canSee = dist < this.def.sight && !player.dead;

    switch (this.state) {
      case 'wander': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.stateTimer = this.rng.float(0.9, 2.8);
          this.wanderAngle = this.rng.float(0, Math.PI * 2);
          if (this.rng.chance(0.3)) this.stateTimer = this.rng.float(0.6, 1.8), this.idle = true;
          else this.idle = false;
        }
        if (!this.idle) {
          const s = this.def.speed * 0.45;
          this._step(Math.cos(this.wanderAngle) * s, Math.sin(this.wanderAngle) * s, dt, world);
        }
        // Skittish creatures only engage if you get close; the rest hunt.
        if (canSee && this.def.aggressive && !(this.def.light === 'shy' && lightLevel > 0.7)) {
          this.state = 'chase';
        } else if (canSee && this.def.skittish && dist < 55) {
          this.state = 'flee';
          this.stateTimer = 2;
        }
        break;
      }

      case 'chase': {
        if (!canSee || dist > this.def.sight * 1.5) { this.state = 'wander'; break; }
        let dx = player.x - this.x, dy = player.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;

        // Erratic fliers weave instead of beelining.
        if (this.def.erratic) {
          const w = Math.sin(game.clock.elapsed * 6 + this.hopPhase) * 0.7;
          const px = -dy, py = dx;
          dx += px * w; dy += py * w;
        }
        if (d > this.def.attackRange * 0.8) {
          this._step(dx * this.def.speed, dy * this.def.speed, dt, world);
        }
        this.faceVector(dx, dy);
        if (d <= this.def.attackRange && this.attackTimer <= 0) {
          this.attackTimer = this.def.cooldown;
          this.state = 'attack';
          this.stateTimer = 0.22;
        }
        break;
      }

      case 'attack': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (this.distanceTo(player) <= this.def.attackRange + 4) {
            player.takeDamage(this.def.damage, game, this.def.label);
            player.applyKnockback(this.x, this.y, this.def.knockback);
          }
          this.state = 'chase';
        }
        break;
      }

      case 'flee': {
        this.stateTimer -= dt;
        let dx = this.x - player.x, dy = this.y - player.y;
        const d = Math.hypot(dx, dy) || 1;
        this._step((dx / d) * this.def.speed * 1.1, (dy / d) * this.def.speed * 1.1, dt, world);
        if (this.stateTimer <= 0) this.state = 'wander';
        break;
      }
    }

    // The boss calls for help when it is hurting.
    if (this.def.summons && this.hp < this.maxHp * 0.6) {
      this.summonTimer -= dt;
      if (this.summonTimer <= 0) {
        this.summonTimer = 9;
        game.summonMob(this.def.summons, this.x + this.rng.float(-40, 40),
                       this.y + this.rng.float(-40, 40));
        game.audio.play('magic');
      }
    }

    // Hoppers and fliers get vertical bob for their draw offset.
    this.hopPhase += dt * (this.def.hop ? 5.5 : 3);
    this.frame = this.def.sprite === 'wolf'
      ? Math.floor(this.anim) % 4
      : Math.floor(this.anim) % 3;

    if (!this.guard && !this.isBoss && dist > 620) this.remove = true;
  }

  _step(vx, vy, dt, world) {
    const before = { x: this.x, y: this.y };
    this.moveBy(vx * dt, vy * dt, world);
    // If we hit a wall, pick a new heading rather than grinding against it.
    if (Math.abs(this.x - before.x) < 0.01 && Math.abs(this.y - before.y) < 0.01) {
      this.wanderAngle = this.rng.float(0, Math.PI * 2);
      this.stateTimer = Math.min(this.stateTimer, 0.3);
    }
    if (vx || vy) this.faceVector(vx, vy);
  }

  /** Extra vertical offset for the hop/hover animation. */
  drawBob() {
    if (this.def.hop) return -Math.abs(Math.sin(this.hopPhase)) * 3;
    if (this.def.erratic || this.def.sprite === 'wisp') return Math.sin(this.hopPhase) * 2.5;
    return 0;
  }

  rollDrops(rng) {
    const out = [];
    for (const [id, min, max, chance] of this.def.drops || []) {
      if (rng.next() > (chance ?? 1)) continue;
      const n = min + Math.floor(rng.next() * (max - min + 1));
      if (n > 0) out.push([id, n]);
    }
    return out;
  }

  serialize() {
    return { species: this.species, x: this.x, y: this.y, hp: this.hp,
             guard: this.guard, dimension: this.dimension };
  }
}
