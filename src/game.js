// The game: owns the world, the entities, and every verb the player has.

import { Loop } from './core/loop.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Rng, hashString } from './core/rng.js';
import { saveGame, loadGame } from './core/save.js';

import { World } from './world/world.js';
import { makeSurfaceGenerator, makeCaveGenerator, spawnPoint, biomeAt } from './world/worldgen.js';
import { byId, byName, tileId } from './world/tiles.js';
import { ITEMS } from './world/items.js';
import { LightMap, gatherTileLights } from './world/lighting.js';

import { Camera } from './gfx/camera.js';
import { Particles } from './gfx/particles.js';
import { Renderer } from './gfx/renderer.js';
import { TS } from './gfx/tileart.js';
import { PAL } from './gfx/palette.js';

import { Player } from './entity/player.js';
import { Mob, SPECIES } from './entity/mob.js';
import { NPC } from './entity/npc.js';
import { ItemDrop, Projectile, FloatText } from './entity/drop.js';

import { WorldClock } from './systems/time.js';
import { QuestLog } from './systems/quests.js';
import { Inventory } from './systems/inventory.js';
import { UI } from './ui/ui.js';

const T = {
  farmland: tileId('farmland'), farmlandWet: tileId('farmland_wet'),
  dirt: tileId('dirt'), grass: tileId('grass'), grassDark: tileId('grass_dark'),
  door: tileId('door'), doorOpen: tileId('door_open'),
  water: tileId('water'), path: tileId('path'),
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.camera = new Camera();
    this.particles = new Particles();
    this.floats = new FloatText();
    this.lightMap = new LightMap();
    this.ui = new UI(this);

    this.mobs = [];
    this.npcs = [];
    this.drops = [];
    this.projectiles = [];
    this.entities = [];

    this.paused = true;
    this.prompt = '';
    this.dt = 1 / 60;
    this.spawnTimer = 3;
    this.saveTimer = 30;
    this._lights = [];
    this.running = false;

    this.loop = new Loop((dt) => this.update(dt), () => this.render());
    addEventListener('resize', () => this.renderer.resize());
    this.renderer.resize();
  }

  // ── lifecycle ──────────────────────────────────────────────────
  newGame(seedText) {
    const name = (seedText || '').trim() || Math.random().toString(36).slice(2, 9);
    this.seedName = name;
    this.seed = hashString(name);
    this.rng = new Rng(this.seed ^ 0x51ed);

    this.surface = new World(this.seed, 'surface', makeSurfaceGenerator(this.seed));
    this.cave = new World(this.seed, 'cave', makeCaveGenerator(this.seed));
    this.world = this.surface;

    this.clock = new WorldClock(this.seed, 0.30);
    this.quests = new QuestLog();

    const sp = spawnPoint(this.seed);
    this.player = new Player(sp.x * TS + TS / 2, sp.y * TS + TS / 2);
    this.player.respawn = { x: this.player.x, y: this.player.y, dimension: 'surface' };

    // A starting kit: enough to survive night one, not enough to skip the game.
    for (const [id, n] of [['torch', 5], ['wood', 12], ['stone', 6], ['bread', 2], ['stick', 4]]) {
      this.player.inventory.add(id, n);
    }
    this.player.inventory.slots[0] = Inventory.make('torch', 5);

    this._resetEntities();
    this.camera.snapTo(this.player.x, this.player.y);
    this.start();
    this.toast('You wake at the village fire', 'good');
  }

  loadSaved() {
    const d = loadGame();
    if (!d) return false;
    this.seedName = d.seedName;
    this.seed = d.seed;
    this.rng = new Rng(this.seed ^ 0x51ed);

    this.surface = new World(this.seed, 'surface', makeSurfaceGenerator(this.seed));
    this.cave = new World(this.seed, 'cave', makeCaveGenerator(this.seed));
    this.surface.deserialize(d.surface || {});
    this.cave.deserialize(d.cave || {});

    this.clock = new WorldClock(this.seed);
    this.clock.deserialize(d.clock || {});
    this.quests = new QuestLog();
    this.quests.deserialize(d.quests || {});

    this.player = new Player(0, 0);
    this.player.deserialize(d.player || {});
    this.world = this.player.dimension === 'cave' ? this.cave : this.surface;

    this._resetEntities();
    for (const m of d.mobs || []) {
      if (!SPECIES[m.species]) continue;
      const mob = new Mob(m.x, m.y, m.species, { guard: m.guard });
      mob.hp = m.hp;
      mob.dimension = m.dimension ?? 'surface';
      this.mobs.push(mob);
    }
    for (const dr of d.drops || []) {
      const drop = new ItemDrop(dr.x, dr.y, dr.itemId, dr.count);
      drop.dimension = dr.dimension ?? 'surface';
      this.drops.push(drop);
    }

    this.camera.snapTo(this.player.x, this.player.y);
    this.start();
    this.toast(`Day ${this.clock.day} — welcome back`, 'good');
    return true;
  }

  _resetEntities() {
    this.mobs.length = 0;
    this.npcs.length = 0;
    this.drops.length = 0;
    this.projectiles.length = 0;
    this.particles.clear();
    this.floats.items.length = 0;
    this._spawnedChunks = new Set();
  }

  start() {
    this.running = true;
    this.paused = false;
    this.ui.showGame();
    this.renderer.resize();
    this.loop.start();
    this.audio.unlock();
  }

  save() {
    if (!this.running) return false;
    return saveGame({
      seed: this.seed,
      seedName: this.seedName,
      clock: this.clock.serialize(),
      quests: this.quests.serialize(),
      player: this.player.serialize(),
      surface: this.surface.serialize(),
      cave: this.cave.serialize(),
      // Only persist creatures worth remembering; ambient mobs respawn anyway.
      mobs: this.mobs.filter((m) => m.guard || m.isBoss).map((m) => m.serialize()),
      drops: this.drops.slice(0, 60).map((d) => d.serialize()),
    });
  }

  // ── simulation ─────────────────────────────────────────────────
  update(dt) {
    this.dt = dt;
    if (this.paused) { this.input.endFrame(); return; }

    this.clock.update(dt, this.player.dimension === 'cave' ? 'cave' : this._biomeKey());

    if (!this.player.dead) this.player.update(dt, this);

    const here = this.player.dimension;
    for (const m of this.mobs) if (!m.dead && m.dimension === here) m.update(dt, this);
    for (const n of this.npcs) if (n.dimension === here) n.update(dt, this);
    for (const d of this.drops) if (d.dimension === here) d.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);

    this._cull();
    this.particles.update(dt);
    this.floats.update(dt);

    // Crops only advance in daylight (moonbloom is the exception, handled by
    // its own tile emitting light at night).
    this.world.tickGrowth(dt * (this.clock.isNight ? 0.25 : 1), 34,
      (x, y) => this.world.getGround(x, y) !== T.dirt);

    this._drainSpawnQueue();
    this._ambientSpawns(dt);
    this._updateCamera(dt);
    this._updateLight();
    this._updatePrompt();

    this.audio.updateMusic(dt);
    this.audio.setMood(this._mood());

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 45; this.save(); }

    this.world.trim(this.player.tx, this.player.ty, 7);
    this.ui.tick(dt);
    this.input.endFrame();
  }

  /** The biome key ('forest', 'swamp', …) the player is standing in. */
  _biomeKey() {
    return biomeAt(this.seed, this.player.tx, this.player.ty).key;
  }

  _mood() {
    if (this.player.dead) return 'none';
    if (this.player.dimension === 'cave') {
      return this.mobs.some((m) => !m.dead && m.state === 'chase'
        && m.distanceTo(this.player) < 150) ? 'danger' : 'cave';
    }
    if (this.npcs.some((n) => n.distanceTo(this.player) < 130)) return 'village';
    if (this.mobs.some((m) => !m.dead && m.state === 'chase'
      && m.distanceTo(this.player) < 130)) return 'danger';
    return this.clock.isNight ? 'night' : 'day';
  }

  _cull() {
    const drop = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i].remove) arr.splice(i, 1);
    };
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.dead) { this.onMobDeath(m); this.mobs.splice(i, 1); }
      else if (m.remove) this.mobs.splice(i, 1);
    }
    drop(this.drops);
    drop(this.projectiles);
    drop(this.npcs);

    const here = this.player.dimension;
    this.entities.length = 0;
    if (!this.player.dead) this.entities.push(this.player);
    for (const a of this.npcs) if (a.dimension === here) this.entities.push(a);
    for (const a of this.mobs) if (a.dimension === here) this.entities.push(a);
    for (const a of this.drops) if (a.dimension === here) this.entities.push(a);
    for (const a of this.projectiles) this.entities.push(a);
  }

  _updateCamera(dt) {
    const r = this.renderer;
    this.camera.vw = r.width;
    this.camera.vh = r.height;
    // Lead the camera slightly toward where the player is facing.
    const lead = { down: [0, 14], up: [0, -14], left: [-14, 0], right: [14, 0] }[this.player.facing];
    this.camera.follow(this.player.x, this.player.y, dt, { x: lead[0], y: lead[1] });
  }

  _updateLight() {
    const b = this.camera.tileBounds(3);
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    this.lightMap.resize(w, h);

    const lights = this._lights;
    gatherTileLights(this.world, b.x0, b.y0, w, h, this.clock.elapsed, lights);

    for (const l of this.player.carriedLight()) {
      lights.push({ x: this.player.x / TS, y: this.player.y / TS, rgb: l.rgb, strength: l.strength });
    }
    for (const m of this.mobs) {
      if (!m.def.emits) continue;
      lights.push({ x: m.x / TS, y: m.y / TS, rgb: m.def.emits, strength: m.def.emitStrength });
    }
    this.particles.collectLights(lights, TS);

    // Caves have no sky; the surface gets the clock's sky colour.
    const ambient = this.player.dimension === 'cave' ? [0.05, 0.05, 0.07] : this.clock.ambient();
    this.lightMap.compute({ world: this.world, x0: b.x0, y0: b.y0, ambient, sources: lights });
  }

  _updatePrompt() {
    this.prompt = '';
    const near = this.nearestNPC(40);
    if (near) { this.prompt = `Talk to ${near.name}`; return; }
    const t = this.player.targetTile();
    const obj = byId.get(this.world.getObject(t.x, t.y));
    if (obj?.interact) {
      this.prompt = {
        door: 'Open', chest: 'Open', station: `Use ${obj.label}`, bed: 'Sleep',
        descend: 'Descend', ascend: 'Climb out', campfire: 'Cook', sign: 'Read',
        grave: 'Disturb', altar: 'Touch the altar',
      }[obj.interact] || obj.label;
    }
  }

  render() {
    if (!this.running) return;
    this.renderer.render(this);
  }

  // ── spawning ───────────────────────────────────────────────────
  /** Structures request NPCs and guards while generating; instantiate them. */
  _drainSpawnQueue() {
    const q = this.world.pendingSpawns;
    if (!q.length) return;
    for (const s of q) {
      const key = `${this.world.dimension}:${s.x},${s.y}`;
      if (this._spawnedChunks.has(key)) continue;
      this._spawnedChunks.add(key);
      const px = s.x * TS + TS / 2, py = s.y * TS + TS / 2;
      const dim = this.world.dimension;
      if (s.kind === 'npc') {
        const npc = new NPC(px, py, s.role, { home: s.home, vseed: s.vseed });
        npc.dimension = dim;
        this.npcs.push(npc);
      } else if (s.kind === 'mob' && SPECIES[s.species]) {
        const mob = new Mob(px, py, s.species, { guard: s.guard });
        mob.dimension = dim;
        this.mobs.push(mob);
      }
    }
    q.length = 0;
  }

  /** Ambient spawning: darkness and depth decide what shows up. */
  _ambientSpawns(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 2.5;

    const cap = this.player.dimension === 'cave' ? 16 : 12;
    if (this.mobs.length >= cap) return;

    const dark = this.player.dimension === 'cave' ? 0.9 : this.clock.darkness;
    if (dark < 0.35 && this.player.dimension !== 'cave') return;
    if (this.rng.next() > dark * 0.75) return;

    const inCave = this.player.dimension === 'cave';
    const biome = inCave ? null : this._biomeKey();
    const pool = Object.entries(SPECIES).filter(([name, s]) => {
      if (s.boss) return false;
      if (inCave) return !!s.cave;
      if (s.cave && !s.biomes) return false;
      if (s.nightOnly && !this.clock.isNight) return false;
      return !s.biomes || s.biomes.includes(biome);
    });
    if (!pool.length) return;

    const [name] = this.rng.pick(pool);
    const pos = this._findSpawnSpot();
    if (!pos) return;
    // Never spawn something onto a lit tile — camps and torches should feel safe.
    if (this.lightMap.brightness(pos.x, pos.y) > 0.55) return;
    const mob = new Mob(pos.x * TS + TS / 2, pos.y * TS + TS / 2, name);
    mob.dimension = this.player.dimension;
    this.mobs.push(mob);
  }

  /** A walkable tile just off screen, so nothing pops in visibly. */
  _findSpawnSpot() {
    for (let i = 0; i < 24; i++) {
      const a = this.rng.float(0, Math.PI * 2);
      const r = this.rng.float(15, 24);
      const x = this.player.tx + Math.round(Math.cos(a) * r);
      const y = this.player.ty + Math.round(Math.sin(a) * r);
      if (this.world.isWalkable(x, y) && !this.world.groundTile(x, y)?.liquid) return { x, y };
    }
    return null;
  }

  summonMob(species, x, y) {
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    if (!this.world.isWalkable(tx, ty)) return;
    const mob = new Mob(x, y, species);
    mob.dimension = this.player.dimension;
    this.mobs.push(mob);
    this.particles.burst(x, y, 12,
      { color: [PAL.arc2, PAL.arc3], speed: 60, life: 0.6, glow: true });
  }

  /**
   * Creates a ground item in the player's current world.
   * Everything that drops loot goes through here so the dimension tag is set
   * in exactly one place.
   */
  spawnDrop(x, y, itemId, count = 1) {
    const d = new ItemDrop(x, y, itemId, count);
    d.dimension = this.player.dimension;
    this.drops.push(d);
    return d;
  }

  nearestNPC(range) {
    let best = null, bd = range;
    for (const n of this.npcs) {
      const d = n.distanceTo(this.player);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
}

// ── verbs ────────────────────────────────────────────────────────
Object.assign(Game.prototype, {
  /** Breaks the object at a tile, spawning its drops. */
  breakTile(x, y) {
    const id = this.world.getObject(x, y);
    const def = byId.get(id);
    if (!def || def.hardness == null) return;

    this.world.setObject(x, y, 0);
    this.audio.play('break');
    const cx = x * TS + TS / 2, cy = y * TS + TS / 2;
    this.particles.burst(cx, cy, 10, {
      color: def.tool === 'axe' ? [PAL.bark1, PAL.dirt3, PAL.green2]
                                : [PAL.stone1, PAL.stone3, PAL.stone4],
      speed: 70, life: 0.55, gravity: 260,
    });

    for (const [item, min, max, chance] of def.drops || []) {
      if (this.rng.next() > (chance ?? 1)) continue;
      const n = min + Math.floor(this.rng.next() * (max - min + 1));
      if (n > 0) this.spawnDrop(cx, cy, item, n);
    }
    // A broken crop leaves tilled soil behind, ready to replant.
    if (def.crop) this.world.setGround(x, y, T.farmland);
  },

  placeBlock() {
    const held = this.player.inventory.held;
    const def = held && ITEMS[held.id];
    if (!def?.places) return;
    const t = this.player.targetTile();
    const tileDef = byName.get(def.places);

    if (def.ground) {
      if (this.world.groundTile(t.x, t.y)?.id === tileDef.id) return this._deny('Already there');
      this.world.setGround(t.x, t.y, tileDef.id);
    } else {
      if (this.world.getObject(t.x, t.y) !== 0) return this._deny('Something is in the way');
      if (this.world.groundTile(t.x, t.y)?.liquid) return this._deny('Not on water');
      // Don't wall yourself into the tile you're standing on.
      if (tileDef.solid && t.x === this.player.tx && t.y === this.player.ty) return;
      this.world.setObject(t.x, t.y, tileDef.id);
    }

    this.player.inventory.removeAt(this.player.inventory.selected, 1);
    this.player.stats.placed++;
    this.audio.play(tileDef.light ? 'torch' : 'place');
    this.particles.burst(t.x * TS + TS / 2, t.y * TS + TS - 2, 5,
      { color: [PAL.bone1, PAL.stone3], speed: 30, life: 0.3, gravity: 200 });
  },

  plantSeed() {
    const held = this.player.inventory.held;
    const def = held && ITEMS[held.id];
    if (!def?.plants) return;
    const t = this.player.targetTile();
    const g = this.world.getGround(t.x, t.y);
    if (g !== T.farmland && g !== T.farmlandWet) return this._deny('Till the soil first');
    if (this.world.getObject(t.x, t.y) !== 0) return this._deny('Something is in the way');

    this.world.setObject(t.x, t.y, byName.get(def.plants).id);
    this.player.inventory.removeAt(this.player.inventory.selected, 1);
    this.audio.play('place');
    this.particles.burst(t.x * TS + 8, t.y * TS + 12, 4,
      { color: [PAL.green4, PAL.dirt2], speed: 24, life: 0.4, gravity: 130 });
  },

  tillSoil() {
    const t = this.player.targetTile();
    const g = this.world.getGround(t.x, t.y);
    if (g !== T.dirt && g !== T.grass && g !== T.grassDark) return this._deny('Needs bare soil');
    if (this.world.getObject(t.x, t.y) !== 0) return this._deny('Clear it first');
    this.world.setGround(t.x, t.y, T.farmland);
    this.audio.play('mine');
    this.player.inventory.wearHeld(1);
    this.particles.burst(t.x * TS + 8, t.y * TS + 8, 6,
      { color: [PAL.dirt1, PAL.dirt2], speed: 34, life: 0.4, gravity: 200 });
  },

  useBucket() {
    const t = this.player.targetTile();
    const g = this.world.getGround(t.x, t.y);
    if (g === T.farmland) {
      this.world.setGround(t.x, t.y, T.farmlandWet);
      this.audio.play('splash');
      this.particles.burst(t.x * TS + 8, t.y * TS + 8, 6,
        { color: [PAL.water3, PAL.water4], speed: 34, life: 0.4, gravity: 160 });
      return;
    }
    if (byId.get(g)?.liquid) { this.toast('Bucket filled'); this.audio.play('splash'); return; }
    this._deny('Nothing to water');
  },

  consumeHeld() {
    const inv = this.player.inventory;
    const held = inv.held;
    const def = held && ITEMS[held.id];
    if (!def) return;

    if (def.food) {
      this.player.heal(def.food.heal);
      this.player.restore(def.food.energy);
      this.floatText(this.player.x, this.player.y - 14, `+${def.food.heal}`, PAL.green5);
    } else if (def.potion) {
      const p = def.potion;
      if (p.heal) {
        this.player.heal(p.heal);
        this.floatText(this.player.x, this.player.y - 14, `+${p.heal}`, PAL.blood2);
      }
      if (p.energy) this.player.restore(p.energy);
      if (p.effect) {
        this.player.effects[p.effect] = p.duration;
        this.toast(`${def.label} — ${p.duration}s`, 'good');
      }
      this.particles.burst(this.player.x, this.player.y - 4, 10,
        { color: [PAL.arc3, PAL.cyan2], speed: 40, life: 0.6, glow: true });
    } else {
      return;
    }
    inv.removeAt(inv.selected, 1);
    this.audio.play('eat');
  },

  dropHeld() {
    const inv = this.player.inventory;
    const s = inv.held;
    if (!s) return;
    const taken = inv.removeAt(inv.selected, 1);
    if (!taken) return;
    const dirs = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.player.facing];
    this.spawnDrop(this.player.x + dirs[0] * 12, this.player.y + dirs[1] * 12,
                   taken.id, taken.count);
    this.audio.play('ui');
  },

  /** The interact verb: talk, open, sleep, descend. */
  interact() {
    const npc = this.nearestNPC(40);
    if (npc) { this.ui.openDialogue(npc); return; }

    const t = this.player.targetTile();
    const id = this.world.getObject(t.x, t.y);
    const def = byId.get(id);
    if (!def?.interact) return;

    switch (def.interact) {
      case 'door':
        this.world.setObject(t.x, t.y, id === T.door ? T.doorOpen : T.door);
        this.audio.play('door');
        break;
      case 'station':
        this.ui.openCrafting(def.station);
        this.audio.play('ui');
        break;
      case 'campfire':
        this.ui.openCrafting('campfire');
        this.audio.play('ui');
        break;
      case 'chest':
        this.ui.openChest(t.x, t.y);
        break;
      case 'bed':
        this.sleep(t.x, t.y);
        break;
      case 'descend':
        this.changeDimension('cave', t.x, t.y);
        break;
      case 'ascend':
        this.changeDimension('surface', t.x, t.y);
        break;
      case 'sign':
        this.toast(this.world.getMeta(t.x, t.y)?.text
          || 'The paint has weathered away.', 'good');
        break;
      case 'grave':
        this._openGrave(t.x, t.y);
        break;
      case 'altar':
        this._touchAltar(t.x, t.y);
        break;
    }
  },

  _openGrave(x, y) {
    if (this.world.getMeta(x, y)?.looted) return this._deny('Already disturbed');
    this.world.setMeta(x, y, { looted: true });
    this.audio.play('magic');
    const cx = x * TS + 8, cy = y * TS + 8;
    const loot = this.rng.weighted([[4, 'bone'], [3, 'coin'], [2, 'cloth'], [1, 'iron_bar']]);
    this.spawnDrop(cx, cy, loot, this.rng.int(1, 3));
    // Disturbing the dead has consequences after dark.
    if (this.clock.isNight && this.rng.chance(0.55)) {
      this.summonMob('skeleton', cx + 16, cy);
      this.toast('Something climbs out', 'bad');
    }
  },

  _touchAltar(x, y) {
    if (this.quests.isDone('hollowking')) {
      this.toast('The stone is quiet now.', 'good');
      return;
    }
    this.audio.play('magic');
    this.particles.burst(x * TS + 8, y * TS + 8, 24,
      { color: [PAL.arc3, PAL.arc4, PAL.cyan2], speed: 70, life: 1.1, glow: true });
    this.toast('The stone is cold. Something below answers.', 'bad');
    this.camera.addShake(0.5);
  },

  sleep(x, y) {
    if (!this.clock.isNight) return this._deny('You are not tired yet');
    this.player.respawn = { x: this.player.x, y: this.player.y, dimension: this.player.dimension };
    this.clock.sleepUntilDawn();
    this.player.hp = this.player.maxHp;
    this.player.energy = this.player.maxEnergy;
    // Clear the night's monsters so dawn actually feels like relief.
    for (const m of this.mobs) if (!m.guard && !m.isBoss) m.remove = true;
    this.audio.play('levelup');
    this.toast(`You wake on day ${this.clock.day}`, 'good');
    this.save();
  },

  changeDimension(to, x, y) {
    this.world = to === 'cave' ? this.cave : this.surface;
    this.player.dimension = to;
    // Both dimensions share a coordinate space, so the mouth and the exit align.
    this.player.x = x * TS + TS / 2;
    this.player.y = y * TS + TS / 2 + (to === 'cave' ? 20 : 20);
    // Ambient hostiles are disposable; guards and the boss keep their state.
    // Villagers and dropped loot stay where they are — the dimension tag keeps
    // them out of sight until you come back.
    this.mobs = this.mobs.filter((m) => m.guard || m.isBoss);
    this.projectiles.length = 0;
    this.particles.clear();
    // _spawnedChunks is keyed by dimension already. Clearing it here made every
    // return trip re-run the village's spawn requests and duplicate its NPCs.
    this.camera.snapTo(this.player.x, this.player.y);
    this.audio.play('door');
    this.toast(to === 'cave' ? 'The dark closes over you' : 'Daylight', 'good');
    this.save();
  },

  // ── combat ─────────────────────────────────────────────────────
  /** Damages every mob within `radius` of a point. Returns how many were hit. */
  damageArea(x, y, radius, damage, source, opts = {}) {
    let hits = 0;
    for (const m of this.mobs) {
      if (m.dead || m.dimension !== this.player.dimension) continue;
      if (Math.hypot(m.x - x, m.y - y) > radius + m.w / 2) continue;
      this.hitMob(m, damage, source, { ...opts, x, y });
      hits++;
    }
    return hits;
  },

  hitMob(mob, damage, source, opts = {}) {
    // A small crit chance keeps melee from feeling metronomic.
    const crit = this.rng.chance(0.12);
    const dealt = Math.max(1, Math.round(damage * (crit ? 1.9 : 1)));
    mob.hp -= dealt;
    mob.hurtFlash = 0.24;
    mob.applyKnockback(opts.x ?? source.x, opts.y ?? source.y, opts.knockback ?? 80);
    if (mob.state === 'wander') mob.state = 'chase';

    this.audio.play(crit ? 'crit' : 'hit');
    this.floatText(mob.x, mob.y - 12, String(dealt), crit ? PAL.gold3 : PAL.bone3,
      { scale: crit ? 2 : 1 });
    this.particles.burst(mob.x, mob.y, crit ? 10 : 6,
      { color: [PAL.blood1, PAL.blood2], speed: 60, life: 0.4, gravity: 150 });
    if (crit) this.camera.addShake(0.22);

    if (mob.hp <= 0) mob.dead = true;
  },

  onMobDeath(mob) {
    if (mob._counted) return;
    mob._counted = true;
    this.player.stats.killed++;
    this.quests.recordKill(mob.species);
    this.audio.play(mob.isBoss ? 'death' : 'break');
    this.camera.addShake(mob.isBoss ? 1.2 : 0.2);
    this.particles.burst(mob.x, mob.y, mob.isBoss ? 40 : 12, {
      color: mob.def.light ? [PAL.arc2, PAL.arc3] : [PAL.blood1, PAL.blood2],
      speed: mob.isBoss ? 120 : 70, life: 0.8, gravity: 90, glow: !!mob.def.light,
    });
    for (const [id, n] of mob.rollDrops(this.rng)) {
      this.spawnDrop(mob.x, mob.y, id, n);
    }
    if (mob.isBoss) {
      this.toast('The Hollow King falls. The dark thins.', 'good');
      this.audio.play('levelup');
    }
  },

  fireProjectile(from, damage, range) {
    const dirs = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[from.facing];
    this.projectiles.push(new Projectile(
      from.x + dirs[0] * 8, from.y + dirs[1] * 8, dirs[0], dirs[1], damage, from));
  },

  // ── feedback ───────────────────────────────────────────────────
  toast(text, kind = '') { this.ui.toast(text, kind); },
  floatText(x, y, text, color, opts) { this.floats.add(x, y, text, color, opts); },
  _deny(msg) { this.toast(msg, 'bad'); this.audio.play('deny'); },

  onPickup(id, count) {
    this.audio.play(id === 'coin' ? 'coin' : 'pickup');
    this.floatText(this.player.x, this.player.y - 18,
      `+${count} ${ITEMS[id]?.label ?? id}`, PAL.bone3, { life: 1.1 });
  },

  onPlayerDeath(cause) {
    this.audio.play('death');
    this.camera.addShake(1);
    this.particles.burst(this.player.x, this.player.y, 26,
      { color: [PAL.blood1, PAL.blood2], speed: 90, life: 1, gravity: 90 });
    this.ui.showDeath(cause);
    this.save();
  },

  respawnPlayer() {
    const r = this.player.respawn;
    this.player.dead = false;
    this.player.hp = Math.round(this.player.maxHp * 0.6);
    this.player.energy = this.player.maxEnergy;
    this.player.invuln = 2.5;
    this.player.dimension = r.dimension;
    this.world = r.dimension === 'cave' ? this.cave : this.surface;
    this.player.x = r.x;
    this.player.y = r.y;
    this.mobs.length = 0;
    this.camera.snapTo(this.player.x, this.player.y);
    this.ui.hideDeath();
    this.toast('You wake, colder than before', 'bad');
  },

  completeQuest(quest) {
    const granted = this.quests.complete(quest, this.player);
    this.audio.play('quest');
    this.toast(`Completed: ${quest.title}`, 'good');
    for (const [id, n] of granted) {
      if (n > 0) this.floatText(this.player.x, this.player.y - 22,
        `+${n} ${ITEMS[id]?.label ?? id}`, PAL.gold3, { life: 1.4 });
    }
    this.ui.closeDialogue();
  },

  openShop(npc) { this.ui.openShop(npc); },
  openCrafting(station) { this.ui.openCrafting(station); },
  closeDialogue() { this.ui.closeDialogue(); },
});
