// The player. One context-sensitive "use" action covers mining, placing,
// planting, eating and attacking, because a phone has room for two buttons.

import { Entity } from './entity.js';
import { Inventory, HOTBAR } from '../systems/inventory.js';
import { ITEMS, itemLight } from '../world/items.js';
import { byId } from '../world/tiles.js';
import { TS } from '../gfx/tileart.js';
import { PAL } from '../gfx/palette.js';

const WALK = 62;              // px/sec
const SPRINT = 1.55;
const REACH = 2.4;            // tiles

export class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.w = 8; this.h = 8;
    this.maxHp = 100; this.hp = 100;
    this.maxEnergy = 100; this.energy = 100;
    this.inventory = new Inventory();
    this.armor = null;

    this.swing = 0;               // >0 while the attack animation plays
    this.swingCooldown = 0;
    this.mineTarget = null;       // {x,y}
    this.mineProgress = 0;
    this.effects = {};            // name → seconds remaining
    this.respawn = { x, y, dimension: 'surface' };
    this.dimension = 'surface';
    this.stats = { mined: 0, crafted: 0, killed: 0, placed: 0, deepest: 0 };
    this.moving = false;
    this.footTimer = 0;
  }

  // ── derived stats ──────────────────────────────────────────────
  get defense() {
    const a = this.armor && ITEMS[this.armor.id]?.armor;
    return a ? a.defense : 0;
  }

  get speedMult() {
    const a = this.armor && ITEMS[this.armor.id]?.armor;
    let m = 1 + (a?.speed ?? 0);
    if (this.effects.swift > 0) m *= 1.35;
    if (this.energy <= 0) m *= 0.6;
    return m;
  }

  /** Light carried by the held item, armour, or a nightsight potion. */
  carriedLight() {
    const out = [];
    const held = this.inventory.held;
    if (held) {
      const l = itemLight(held.id);
      if (l) out.push({ rgb: l.rgb, strength: l.strength / 10 });
    }
    if (this.armor) {
      const l = itemLight(this.armor.id);
      if (l) out.push({ rgb: l.rgb, strength: l.strength / 10 });
    }
    if (this.effects.nightsight > 0) out.push({ rgb: [0.45, 0.62, 0.7], strength: 0.55 });
    // A faint personal glow means you are never in total blackness.
    out.push({ rgb: [0.5, 0.5, 0.62], strength: 0.14 });
    return out;
  }

  /** The tile this action would affect. */
  targetTile() {
    const dirs = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = dirs[this.facing];
    return { x: this.tx + dx, y: this.ty + dy };
  }

  // ── main update ────────────────────────────────────────────────
  update(dt, game) {
    const { input, world } = game;
    this.applyPhysics(dt, world);

    for (const k of Object.keys(this.effects)) {
      this.effects[k] -= dt;
      if (this.effects[k] <= 0) delete this.effects[k];
    }

    // ── movement ──
    const mv = input.moveVector();
    const sprinting = input.held('sprint') && this.energy > 0 && mv.len > 0.1;
    let speed = WALK * this.speedMult * this.terrainFactor(world);
    if (sprinting) { speed *= SPRINT; this.energy = Math.max(0, this.energy - dt * 11); }

    this.moving = mv.len > 0.08;
    if (this.moving && this.swing <= 0) this.faceVector(mv.x, mv.y);
    this.moveBy(mv.x * speed * dt, mv.y * speed * dt, world);

    // Walk-cycle timing, and a footstep sound synced to the contact frames.
    if (this.moving) {
      this.anim += dt * (sprinting ? 11 : 7.5);
      this.frame = Math.floor(this.anim) % 4;
      this.footTimer -= dt;
      if (this.footTimer <= 0) {
        this.footTimer = sprinting ? 0.26 : 0.36;
        const g = world.groundTile(this.tx, this.ty);
        game.audio.play(g?.liquid ? 'splash' : 'step');
        if (g?.liquid) {
          game.particles.burst(this.x, this.y + 4, 3,
            { color: PAL.water4, speed: 26, life: 0.3, gravity: 90 });
        }
      }
    } else {
      this.anim = 0;
      this.frame = 0;
    }

    // ── energy & regeneration ──
    if (!sprinting) {
      this.energy = Math.min(this.maxEnergy, this.energy + dt * (this.moving ? 2.4 : 6));
    }
    if (this.energy > 60 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + dt * 0.9);
    }

    // ── environmental damage ──
    const ground = world.groundTile(this.tx, this.ty);
    if (ground?.damage) {
      this._envTimer = (this._envTimer ?? 0) - dt;
      if (this._envTimer <= 0) {
        this._envTimer = 0.65;
        this.takeDamage(ground.damage, game, ground.label);
      }
    }

    if (this.swing > 0) this.swing -= dt;
    if (this.swingCooldown > 0) this.swingCooldown -= dt;

    // ── the use action ──
    if (input.held('use')) this._use(dt, game);
    else { this.mineTarget = null; this.mineProgress = 0; }

    if (input.pressed('interact')) game.interact();
    if (input.pressed('drop')) game.dropHeld();

    for (let i = 0; i < HOTBAR; i++) {
      if (input.pressed(`slot${i}`)) { this.inventory.selected = i; game.audio.play('ui'); }
    }
    if (input.wheel) {
      this.inventory.selected =
        (this.inventory.selected + input.wheel + HOTBAR) % HOTBAR;
      game.audio.play('ui');
    }

    if (this.dimension === 'cave') {
      this.stats.deepest = Math.max(this.stats.deepest,
        Math.round(Math.hypot(this.x, this.y) / TS));
    }
  }

  takeDamage(amount, game, cause = '') {
    if (this.invuln > 0 || this.dead) return;
    const reduced = Math.max(1, Math.round(amount * (1 - this.defense / (this.defense + 22))));
    this.hp -= reduced;
    this.invuln = 0.6;
    this.hurtFlash = 0.3;
    game.audio.play('hurt');
    game.camera.addShake(0.35);
    game.floatText(this.x, this.y - 10, `-${reduced}`, PAL.blood2);
    game.particles.burst(this.x, this.y, 6,
      { color: [PAL.blood1, PAL.blood2], speed: 55, life: 0.4, gravity: 120 });
    if (this.hp <= 0) { this.hp = 0; this.dead = true; game.onPlayerDeath(cause); }
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }
  restore(amount) { this.energy = Math.min(this.maxEnergy, this.energy + amount); }

  // ── context-sensitive use ──────────────────────────────────────
  _use(dt, game) {
    const held = this.inventory.held;
    const def = held ? ITEMS[held.id] : null;

    // Consumables fire once per press, not per frame.
    if (def && (def.food || def.potion)) {
      if (game.input.pressed('use')) game.consumeHeld();
      return;
    }
    if (def?.plants) { if (game.input.pressed('use')) game.plantSeed(); return; }
    if (def?.places) { if (game.input.pressed('use')) game.placeBlock(); return; }
    if (def?.tool?.type === 'bucket') { if (game.input.pressed('use')) game.useBucket(); return; }
    if (def?.tool?.type === 'hoe') { if (game.input.pressed('use')) game.tillSoil(); return; }
    if (def?.weapon?.ranged) { this._attack(game, true); return; }

    // Otherwise: mine what's in front, or swing at what's beside you.
    const t = this.targetTile();
    const objId = game.world.getObject(t.x, t.y);
    const obj = byId.get(objId);
    if (obj && obj.hardness != null) this._mine(dt, game, t, obj);
    else { this.mineTarget = null; this.mineProgress = 0; this._attack(game, false); }
  }

  _mine(dt, game, t, obj) {
    const held = this.inventory.held;
    const tool = held ? ITEMS[held.id]?.tool : null;

    // Wrong tool type still works, just slowly. Tier gates hard ore, though.
    if (obj.tier && (!tool || (tool.tier ?? 0) < obj.tier)) {
      if (game.input.pressed('use')) {
        game.toast(`Needs a stronger pick (tier ${obj.tier})`, 'bad');
        game.audio.play('deny');
      }
      return;
    }

    let power = 0.55;                              // bare hands
    if (tool) power = tool.type === obj.tool || obj.tool === 'any' ? tool.power : tool.power * 0.35;

    if (!this.mineTarget || this.mineTarget.x !== t.x || this.mineTarget.y !== t.y) {
      this.mineTarget = { x: t.x, y: t.y };
      this.mineProgress = 0;
    }

    this.mineProgress += (power * dt) / obj.hardness;
    this.energy = Math.max(0, this.energy - dt * 3);

    this._mineSfx = (this._mineSfx ?? 0) - dt;
    if (this._mineSfx <= 0) {
      this._mineSfx = 0.24;
      game.audio.play(obj.tool === 'axe' ? 'chop' : 'mine');
      const cx = t.x * TS + TS / 2, cy = t.y * TS + TS / 2;
      game.particles.burst(cx, cy, 3, {
        color: obj.tool === 'axe' ? [PAL.bark1, PAL.dirt3] : [PAL.stone2, PAL.stone3],
        speed: 42, life: 0.35, gravity: 190, size: 1,
      });
      this.swing = 0.18;
    }

    if (this.mineProgress >= 1) {
      game.breakTile(t.x, t.y);
      this.mineProgress = 0;
      this.mineTarget = null;
      this.stats.mined++;
      if (this.inventory.wearHeld(1)) {
        game.toast('Your tool broke', 'bad');
        game.audio.play('deny');
      }
    }
  }

  _attack(game, ranged) {
    if (this.swingCooldown > 0) return;
    const held = this.inventory.held;
    const w = held ? ITEMS[held.id]?.weapon : null;
    const speed = w?.speed ?? 0.42;
    const damage = w?.damage ?? 2;
    const reach = w?.reach ?? 20;

    this.swingCooldown = speed;
    this.swing = Math.min(speed, 0.22);
    this.energy = Math.max(0, this.energy - 2.5);

    if (ranged) {
      if (!this.inventory.has(w.ammo, 1)) {
        game.toast('Out of arrows', 'bad');
        game.audio.play('deny');
        this.swingCooldown = 0.25;
        return;
      }
      this.inventory.remove(w.ammo, 1);
      game.fireProjectile(this, damage, reach);
      game.audio.play('bow');
      if (this.inventory.wearHeld(1)) game.toast('Your bow snapped', 'bad');
      return;
    }

    game.audio.play('swing');
    const dirs = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = dirs[this.facing];
    const hitX = this.x + dx * reach * 0.6;
    const hitY = this.y + dy * reach * 0.6;
    const hit = game.damageArea(hitX, hitY, reach * 0.72, damage, this, {
      knockback: w?.knockback ?? 80,
    });
    if (hit > 0 && this.inventory.wearHeld(1)) {
      game.toast('Your weapon broke', 'bad');
    }
  }

  serialize() {
    return {
      x: this.x, y: this.y, hp: this.hp, energy: this.energy, facing: this.facing,
      dimension: this.dimension, armor: this.armor, effects: this.effects,
      respawn: this.respawn, stats: this.stats,
      inventory: this.inventory.serialize(),
    };
  }

  deserialize(d) {
    Object.assign(this, {
      x: d.x, y: d.y, hp: d.hp, energy: d.energy, facing: d.facing ?? 'down',
      dimension: d.dimension ?? 'surface', armor: d.armor ?? null,
      effects: d.effects ?? {}, respawn: d.respawn ?? { x: d.x, y: d.y, dimension: 'surface' },
      stats: { mined: 0, crafted: 0, killed: 0, placed: 0, deepest: 0, ...(d.stats || {}) },
    });
    this.inventory.deserialize(d.inventory || {});
    this.dead = false;
  }
}
