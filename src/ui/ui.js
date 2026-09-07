// DOM user interface.
//
// The HUD and panels are real DOM rather than canvas: text stays crisp at any
// scale, tap targets are big enough for thumbs, and the browser handles
// scrolling and focus for us.

import { ITEMS } from '../world/items.js';
import { recipesFor } from '../world/recipes.js';
import { itemIcon } from '../gfx/sprites.js';
import { HOTBAR } from '../systems/inventory.js';
import { Inventory } from '../systems/inventory.js';
import { QUEST_ORDER } from '../systems/quests.js';
import { biomeAt } from '../world/worldgen.js';
import { SHOP } from '../entity/npc.js';
import { ItemDrop } from '../entity/drop.js';
import { PAL } from '../gfx/palette.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), title: $('title'), panel: $('panel'), panelTitle: $('panel-title'),
      panelBody: $('panel-body'), dialogue: $('dialogue'), death: $('death'),
      hotbar: $('hotbar'), toasts: $('toasts'), minimap: $('minimap'),
      clockTime: $('clock-time'), clockDay: $('clock-day'),
      health: $('bar-health'), energy: $('bar-energy'),
      questBox: $('questbox'), questTitle: $('quest-title'), questStep: $('quest-step'),
      touch: $('touch'), loading: $('loading'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.mapCtx.imageSmoothingEnabled = false;
    this.openPanel = null;
    this.dragFrom = null;
    this.slotEls = [];
    this._mapTimer = 0;
    this._lastHud = {};
    this._buildHotbar();
    this._wire();
  }

  // ── setup ──────────────────────────────────────────────────────
  _buildHotbar() {
    this.el.hotbar.innerHTML = '';
    for (let i = 0; i < HOTBAR; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.index = String(i);
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const count = document.createElement('b');
      const bar = document.createElement('u');
      bar.appendChild(document.createElement('i'));
      const key = document.createElement('em');
      key.textContent = String(i + 1);
      slot.append(c, count, bar, key);
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.game.player.inventory.selected = i;
        this.game.audio.play('ui');
      });
      this.el.hotbar.appendChild(slot);
      this.slotEls.push({ slot, ctx: c.getContext('2d'), count, bar: bar.firstChild, canvas: c });
    }
  }

  _wire() {
    $('panel-close').addEventListener('click', () => this.closePanel());
    this.el.panel.addEventListener('pointerdown', (e) => {
      if (e.target === this.el.panel) this.closePanel();
    });
    $('btn-respawn').addEventListener('click', () => this.game.respawnPlayer());

    const g = this.game;
    if (g.input.touchMode) {
      this.el.touch.classList.remove('hidden');
      g.input.attachStick($('stick'), $('stick-knob'), 42);
      g.input.attachButton($('btn-a'), 'use');
      g.input.attachButton($('btn-b'), 'interact');
      $('btn-inv').addEventListener('click', () => this.openInventory());
      $('btn-craft').addEventListener('click', () => this.openCrafting(null));
      $('btn-map').addEventListener('click', () => this.openMap());
    }

    addEventListener('keydown', (e) => {
      if (!this.game.running) return;
      if (e.code === 'Escape') { this.openPanel ? this.closePanel() : this.openMenu(); e.preventDefault(); }
      else if (e.code === 'KeyI' || e.code === 'Tab') { this.toggle(() => this.openInventory()); e.preventDefault(); }
      else if (e.code === 'KeyC') this.toggle(() => this.openCrafting(null));
      else if (e.code === 'KeyM') this.toggle(() => this.openMap());
    });
  }

  toggle(open) { this.openPanel ? this.closePanel() : open(); }

  // ── screens ────────────────────────────────────────────────────
  showGame() {
    this.el.title.classList.add('hidden');
    this.el.loading.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  showLoading(text = 'Shaping the world…') {
    $('loading-text').textContent = text;
    this.el.loading.classList.remove('hidden');
  }

  showDeath(cause) {
    this.el.death.classList.remove('hidden');
    $('death-sub').textContent = cause ? `${cause} took you.` : 'The night takes what it is owed.';
    this.game.paused = true;
  }

  hideDeath() {
    this.el.death.classList.add('hidden');
    this.game.paused = false;
  }

  // ── per-frame HUD ──────────────────────────────────────────────
  tick(dt) {
    const g = this.game, p = g.player;

    const hp = Math.round(p.hp), en = Math.round(p.energy);
    if (this._lastHud.hp !== hp) {
      this._lastHud.hp = hp;
      this.el.health.firstChild.style.width = `${(p.hp / p.maxHp) * 100}%`;
      this.el.health.lastChild.textContent = `${hp} / ${p.maxHp}`;
    }
    if (this._lastHud.en !== en) {
      this._lastHud.en = en;
      this.el.energy.firstChild.style.width = `${(p.energy / p.maxEnergy) * 100}%`;
      this.el.energy.lastChild.textContent = `${en} / ${p.maxEnergy}`;
    }

    const clockText = g.clock.clockText;
    if (this._lastHud.clock !== clockText) {
      this._lastHud.clock = clockText;
      this.el.clockTime.textContent = clockText;
      this.el.clockDay.textContent =
        `Day ${g.clock.day} · ${p.dimension === 'cave' ? 'Underground' : g.clock.phase}`;
    }

    this._updateHotbar();
    this._updateQuest();

    this._mapTimer -= dt;
    if (this._mapTimer <= 0) { this._mapTimer = 0.4; this._drawMinimap(); }
  }

  _updateHotbar() {
    const inv = this.game.player.inventory;
    for (let i = 0; i < HOTBAR; i++) {
      const s = inv.slots[i];
      const el = this.slotEls[i];
      el.slot.classList.toggle('sel', i === inv.selected);

      const sig = s ? `${s.id}:${s.count}:${s.durability ?? ''}` : '';
      if (el._sig === sig) continue;
      el._sig = sig;

      el.ctx.clearRect(0, 0, 16, 16);
      if (s) {
        el.ctx.drawImage(itemIcon(s.id), 0, 0);
        el.count.textContent = s.count > 1 ? String(s.count) : '';
        const def = ITEMS[s.id];
        if (s.durability != null && def?.tool) {
          const f = s.durability / def.tool.durability;
          el.bar.parentElement.style.display = 'block';
          el.bar.style.width = `${f * 100}%`;
          el.bar.style.background = f > 0.5 ? PAL.green4 : f > 0.2 ? PAL.gold2 : PAL.blood2;
        } else {
          el.bar.parentElement.style.display = 'none';
        }
      } else {
        el.count.textContent = '';
        el.bar.parentElement.style.display = 'none';
      }
    }
  }

  _updateQuest() {
    const q = this.game.quests.tracked;
    if (!q) { this.el.questBox.classList.add('hidden'); return; }
    const have = this.game.quests.progress(q, this.game.player);
    const line = `${q.title}|${have}/${q.count}`;
    if (this._lastHud.quest === line) return;
    this._lastHud.quest = line;
    this.el.questBox.classList.remove('hidden');
    this.el.questTitle.textContent = q.title;
    this.el.questStep.textContent = q.type === 'collect'
      ? `${ITEMS[q.item]?.label ?? q.item} ${have}/${q.count}`
      : `Defeat ${q.species.replace('_', ' ')} ${have}/${q.count}`;
  }

  _drawMinimap() {
    const g = this.game, ctx = this.mapCtx;
    const S = this.el.minimap.width;
    const range = 36;                       // tiles from centre to edge
    const step = (range * 2) / S;
    const img = ctx.createImageData(S, S);
    const d = img.data;
    const inCave = g.player.dimension === 'cave';

    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const wx = Math.round(g.player.tx + (px * step - range));
        const wy = Math.round(g.player.ty + (py * step - range));
        let hex;
        if (inCave) {
          const o = g.world.peekObject(wx, wy);
          hex = o === -1 ? '#0a0910' : o === 0 ? '#3e434f' : '#1b1a24';
        } else {
          hex = biomeAt(g.seed, wx, wy).map;
        }
        const n = parseInt(hex.slice(1), 16);
        const i = (py * S + px) * 4;
        d[i] = (n >> 16) & 255; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Markers: NPCs, hostiles, then the player on top.
    const mark = (wx, wy, color, size = 2) => {
      const px = Math.round(((wx - g.player.tx) / range) * (S / 2) + S / 2);
      const py = Math.round(((wy - g.player.ty) / range) * (S / 2) + S / 2);
      if (px < 0 || py < 0 || px >= S || py >= S) return;
      ctx.fillStyle = color;
      ctx.fillRect(px - (size >> 1), py - (size >> 1), size, size);
    };
    for (const n of g.npcs) mark(n.tx, n.ty, PAL.cyan2, 2);
    for (const m of g.mobs) if (!m.dead) mark(m.tx, m.ty, PAL.blood2, 2);
    mark(g.player.tx, g.player.ty, PAL.gold3, 4);
  }

  // ── toasts ─────────────────────────────────────────────────────
  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.el.toasts.appendChild(el);
    setTimeout(() => el.remove(), 2700);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  // ── panels ─────────────────────────────────────────────────────
  _openPanel(title, build) {
    this.openPanel = title;
    this.el.panelTitle.textContent = title;
    this.el.panelBody.innerHTML = '';
    build(this.el.panelBody);
    this.el.panel.classList.remove('hidden');
    this.game.paused = true;
    this.game.input.clear();
  }

  closePanel() {
    this.openPanel = null;
    this.dragFrom = null;
    this.el.panel.classList.add('hidden');
    if (!this.game.player.dead) this.game.paused = false;
  }

  /** Builds one inventory slot element, wired for tap-to-move. */
  _slot(index, stack, onTap) {
    const el = document.createElement('div');
    el.className = 'slot';
    if (this.dragFrom === index) el.classList.add('drag');
    if (stack) {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      c.getContext('2d').drawImage(itemIcon(stack.id), 0, 0);
      el.appendChild(c);
      if (stack.count > 1) {
        const b = document.createElement('b');
        b.textContent = String(stack.count);
        el.appendChild(b);
      }
      el.title = ITEMS[stack.id]?.label ?? stack.id;
    }
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(index); });
    return el;
  }

  openInventory() {
    this._openPanel('Inventory', (body) => this._renderInventory(body));
  }

  _renderInventory(body) {
    body.innerHTML = '';
    const inv = this.game.player.inventory;
    const tap = (i) => {
      if (this.dragFrom == null) {
        if (!inv.slots[i]) return;
        this.dragFrom = i;
      } else {
        inv.swap(this.dragFrom, i);
        this.dragFrom = null;
        this.game.audio.play('ui');
      }
      this._renderInventory(body);
    };

    const section = (label) => {
      const h = document.createElement('p');
      h.className = 'section';
      h.textContent = label;
      body.appendChild(h);
    };
    const grid = () => {
      const g = document.createElement('div');
      g.className = 'grid';
      body.appendChild(g);
      return g;
    };

    section('Hotbar');
    const g1 = grid();
    for (let i = 0; i < HOTBAR; i++) g1.appendChild(this._slot(i, inv.slots[i], tap));

    section('Bag');
    const g2 = grid();
    for (let i = HOTBAR; i < inv.slots.length; i++) g2.appendChild(this._slot(i, inv.slots[i], tap));

    // Detail card for the selected stack, with its verbs.
    const sel = this.dragFrom != null ? inv.slots[this.dragFrom] : inv.held;
    if (sel) {
      section('Selected');
      body.appendChild(this._itemCard(sel, this.dragFrom ?? inv.selected, body));
    }

    section('Worn');
    const worn = document.createElement('div');
    worn.className = 'itemcard';
    const p = this.game.player;
    if (p.armor) {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      c.getContext('2d').drawImage(itemIcon(p.armor.id), 0, 0);
      const meta = document.createElement('div');
      const def = ITEMS[p.armor.id];
      meta.innerHTML = `<h4>${def.label}</h4><p>Defense +${def.armor.defense}</p>`;
      const acts = document.createElement('div');
      acts.className = 'acts';
      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.onclick = () => {
        p.inventory.add(p.armor.id, 1);
        p.armor = null;
        this.game.audio.play('ui');
        this._renderInventory(body);
      };
      acts.appendChild(btn);
      meta.appendChild(acts);
      worn.append(c, meta);
    } else {
      worn.innerHTML = '<div><h4>Nothing worn</h4><p>Armour reduces the damage you take.</p></div>';
    }
    body.appendChild(worn);
  }

  _itemCard(stack, index, body) {
    const def = ITEMS[stack.id] || {};
    const card = document.createElement('div');
    card.className = 'itemcard';
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    c.getContext('2d').drawImage(itemIcon(stack.id), 0, 0);

    const meta = document.createElement('div');
    const bits = [];
    if (def.weapon) bits.push(`${def.weapon.damage} dmg`);
    if (def.tool) bits.push(`tier ${def.tool.tier} ${def.tool.type}`);
    if (def.armor) bits.push(`+${def.armor.defense} def`);
    if (def.food) bits.push(`+${def.food.heal} hp, +${def.food.energy} energy`);
    if (stack.durability != null && def.tool) {
      bits.push(`${stack.durability}/${def.tool.durability} uses`);
    }
    if (def.lightStrength) bits.push('gives light');
    meta.innerHTML = `<h4>${def.label ?? stack.id}</h4>
      <p>${def.desc ?? ''}${bits.length ? `<br>${bits.join(' · ')}` : ''}</p>`;

    const acts = document.createElement('div');
    acts.className = 'acts';
    const act = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { fn(); this._renderInventory(body); };
      acts.appendChild(b);
    };
    const inv = this.game.player.inventory;
    if (def.armor) {
      act('Wear', () => {
        const p = this.game.player;
        if (p.armor) inv.add(p.armor.id, 1);
        p.armor = { id: stack.id };
        inv.removeAt(index, 1);
        this.game.audio.play('craft');
      });
    }
    if (def.food || def.potion) {
      act('Use', () => { inv.selected = index < HOTBAR ? index : inv.selected; this.game.consumeHeld(); });
    }
    if (index >= HOTBAR) {
      act('To hotbar', () => {
        const free = inv.slots.findIndex((s, i) => i < HOTBAR && !s);
        inv.swap(index, free >= 0 ? free : inv.selected);
      });
    }
    act('Drop', () => {
      const taken = inv.removeAt(index, stack.count);
      if (!taken) return;
      const p = this.game.player;
      this.game.drops.push(new ItemDrop(p.x, p.y, taken.id, taken.count));
      this.game.audio.play('ui');
    });
    meta.appendChild(acts);
    card.append(c, meta);
    return card;
  }
}

// ── crafting, map, help, dialogue, shop ──────────────────────────
Object.assign(UI.prototype, {
  /** @param {string|null} station null = the recipes you can do bare-handed */
  openCrafting(station) {
    const label = station
      ? station[0].toUpperCase() + station.slice(1)
      : 'Handcraft';
    this._openPanel(label, (body) => this._renderCrafting(body, station));
  },

  _renderCrafting(body, station) {
    body.innerHTML = '';
    const g = this.game, inv = g.player.inventory;

    // Bare-handed crafting also lists what nearby stations could make, so the
    // player learns the tech tree without hunting for benches.
    // Gated recipes stay hidden until you actually hold the material once, so
    // the moonstone tier is a discovery rather than a spoiler.
    const visible = recipesFor(station).filter((r) => !r.requires || inv.has(r.requires, 1));

    if (!visible.length) {
      const p = document.createElement('p');
      p.className = 'section';
      p.textContent = 'Nothing available here yet.';
      body.appendChild(p);
    }

    const byCat = new Map();
    for (const r of visible) {
      if (!byCat.has(r.category)) byCat.set(r.category, []);
      byCat.get(r.category).push(r);
    }

    for (const [cat, recipes] of byCat) {
      const h = document.createElement('p');
      h.className = 'section';
      h.textContent = cat;
      body.appendChild(h);

      for (const r of recipes) {
        const can = r.cost.every(([id, n]) => inv.has(id, n));
        const row = document.createElement('div');
        row.className = `recipe ${can ? 'can' : 'cant'}`;

        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        c.getContext('2d').drawImage(itemIcon(r.out), 0, 0);

        const meta = document.createElement('div');
        meta.className = 'rmeta';
        const costs = r.cost.map(([id, n]) => {
          const have = inv.count(id);
          const text = `${n}× ${ITEMS[id]?.label ?? id}`;
          return have >= n ? text : `<s>${text} (${have})</s>`;
        }).join(', ');
        meta.innerHTML = `<div class="rname">${ITEMS[r.out]?.label ?? r.out}`
          + `${r.count > 1 ? ` ×${r.count}` : ''}</div><div class="rcost">${costs}</div>`;

        const btn = document.createElement('button');
        btn.textContent = 'Craft';
        btn.disabled = !can;
        btn.onclick = () => {
          if (!r.cost.every(([id, n]) => inv.has(id, n))) return;
          for (const [id, n] of r.cost) inv.remove(id, n);
          const left = inv.add(r.out, r.count);
          if (left > 0) {
            // Bag full: the overflow lands at your feet rather than vanishing.
            this.game.drops.push(new ItemDrop(g.player.x, g.player.y, r.out, left));
          }
          g.player.stats.crafted++;
          g.audio.play('craft');
          this.toast(`Crafted ${ITEMS[r.out]?.label ?? r.out}`, 'good');
          this._renderCrafting(body, station);
        };

        row.append(c, meta, btn);
        body.appendChild(row);
      }
    }
  },

  openMap() {
    this._openPanel('Map', (body) => {
      const g = this.game;
      const canvas = document.createElement('canvas');
      const S = 224;
      canvas.width = S; canvas.height = S;
      canvas.id = 'bigmap';
      body.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const range = 130;
      const step = (range * 2) / S;
      const img = ctx.createImageData(S, S);
      const inCave = g.player.dimension === 'cave';
      for (let py = 0; py < S; py++) {
        for (let px = 0; px < S; px++) {
          const wx = Math.round(g.player.tx + (px * step - range));
          const wy = Math.round(g.player.ty + (py * step - range));
          const hex = inCave
            ? (g.world.peekObject(wx, wy) === 0 ? '#3e434f' : '#16151d')
            : biomeAt(g.seed, wx, wy).map;
          const n = parseInt(hex.slice(1), 16);
          const i = (py * S + px) * 4;
          img.data[i] = (n >> 16) & 255;
          img.data[i + 1] = (n >> 8) & 255;
          img.data[i + 2] = n & 255;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      ctx.fillStyle = PAL.gold3;
      ctx.fillRect(S / 2 - 2, S / 2 - 2, 5, 5);
      ctx.strokeStyle = PAL.void;
      ctx.strokeRect(S / 2 - 2.5, S / 2 - 2.5, 6, 6);

      const info = document.createElement('div');
      info.className = 'help';
      const b = biomeAt(g.seed, g.player.tx, g.player.ty);
      info.innerHTML = `<h3>Position</h3>
        <p>${inCave ? 'Underground' : b.label} · ${g.player.tx}, ${g.player.ty}</p>
        <p>Day ${g.clock.day}, ${g.clock.clockText} · ${g.clock.weather}</p>
        <h3>Tally</h3>
        <p>Mined ${g.player.stats.mined} · Placed ${g.player.stats.placed}
           · Crafted ${g.player.stats.crafted} · Felled ${g.player.stats.killed}</p>
        <p>Deepest descent: ${g.player.stats.deepest} tiles from the shaft</p>`;
      body.appendChild(info);
    });
  },

  openMenu() {
    this._openPanel('Paused', (body) => {
      const g = this.game;
      const wrap = document.createElement('div');
      wrap.className = 'help';
      wrap.innerHTML = `<h3>World</h3><p>Seed: <kbd>${g.seedName}</kbd> · Day ${g.clock.day}</p>`;
      body.appendChild(wrap);

      const mk = (label, fn) => {
        const b = document.createElement('button');
        b.className = 'mbtn';
        b.style.width = '100%';
        b.style.marginTop = '8px';
        b.textContent = label;
        b.onclick = fn;
        body.appendChild(b);
        return b;
      };
      mk('Resume', () => this.closePanel());
      mk('Save now', () => {
        this.toast(g.save() ? 'Saved' : 'Could not save', g.save() ? 'good' : 'bad');
      });
      mk(g.audio.muted ? 'Unmute' : 'Mute', (e) => {
        const muted = g.audio.toggleMute();
        e.target.textContent = muted ? 'Unmute' : 'Mute';
      });
      mk('How to play', () => this.openHelp());
      mk('Abandon world', () => {
        if (!confirm('Abandon this world? Your save will be erased.')) return;
        localStorage.removeItem('torch.save.v1');
        location.reload();
      });
    });
  },

  openHelp() {
    this._openPanel('How to Play', (body) => {
      const d = document.createElement('div');
      d.className = 'help';
      const touch = this.game.input.touchMode;
      d.innerHTML = `
        <h3>Controls</h3>
        ${touch ? `<ul>
          <li><b>Left stick</b> — move</li>
          <li><b>⚔ button</b> — use: mine, chop, place, eat or attack, depending on what you hold</li>
          <li><b>✋ button</b> — interact: talk, open doors and chests, sleep, enter caves</li>
          <li><b>🎒 ⚒ 🗺</b> — inventory, crafting, map</li>
          <li>Tap a hotbar slot to select it</li>
        </ul>` : `<ul>
          <li><kbd>WASD</kbd> or arrows — move · <kbd>Shift</kbd> — sprint</li>
          <li><kbd>Space</kbd> or click — use the held item</li>
          <li><kbd>E</kbd> — interact · <kbd>Q</kbd> — drop</li>
          <li><kbd>1</kbd>–<kbd>8</kbd> or scroll — pick a hotbar slot</li>
          <li><kbd>I</kbd> inventory · <kbd>C</kbd> craft · <kbd>M</kbd> map · <kbd>Esc</kbd> menu</li>
        </ul>`}
        <h3>The dark</h3>
        <p>Night is genuinely dark, and caves are darker. Hold a torch in your
           selected slot to carry light with you; place torches to keep a route lit.
           Shades burn in bright light — a well-lit camp is a weapon.</p>
        <h3>Getting started</h3>
        <ul>
          <li>Punch trees for wood, then craft a <b>Workbench</b> (8 wood).</li>
          <li>At the bench: a pick and an axe. Stone tools mine copper.</li>
          <li>Craft a <b>Furnace</b> (12 stone) to smelt ore into bars.</li>
          <li>Bars plus an <b>Anvil</b> unlock iron and moonstone gear.</li>
          <li>Sleep in a bed at night to skip to dawn and set your waking place.</li>
        </ul>
        <h3>Below</h3>
        <p>Cave mouths sit in high, rocky ground — there is one at the village edge.
           Ore gets richer the further you travel from the shaft: copper near,
           then iron, gold, and moonstone in the deepest dark. Something old
           lives down there.</p>
        <h3>Farming</h3>
        <p>Till dirt with a hoe, plant seeds from tall grass, water with a bucket
           to double the growth rate. Moonbloom only ripens at night.</p>`;
      body.appendChild(d);
    });
  },

  // ── dialogue ───────────────────────────────────────────────────
  openDialogue(npc) {
    const node = npc.dialogue(this.game);
    $('dlg-name').textContent = node.name;
    $('dlg-text').textContent = node.text;
    const box = $('dlg-choices');
    box.innerHTML = '';

    // If the NPC has a quest to offer, offering it is the first choice.
    const offer = QUEST_ORDER.find((q) => q.giver === npc.role
      && this.game.quests.isActive(q.id)
      && !this.game.quests.canComplete(q, this.game.player));
    if (offer && !this._seenOffer?.has(offer.id)) {
      this._seenOffer = this._seenOffer || new Set();
      this._seenOffer.add(offer.id);
      $('dlg-text').textContent = offer.offer;
    }

    for (const c of node.choices) {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.onclick = () => { this.game.audio.play('ui'); c.action(); };
      box.appendChild(b);
    }
    this.el.dialogue.classList.remove('hidden');
    this.game.paused = true;
    this.game.input.clear();
  },

  closeDialogue() {
    this.el.dialogue.classList.add('hidden');
    if (!this.openPanel && !this.game.player.dead) this.game.paused = false;
  },

  /** @param {import('../entity/npc.js').NPC} [npc] the trader you're talking to */
  openShop(npc) {
    this.closeDialogue();
    this._openPanel(npc ? `Trade — ${npc.name}` : 'Trade', (body) => this._renderShop(body));
  },

  _renderShop(body) {
    body.innerHTML = '';
    const inv = this.game.player.inventory;
    const coins = inv.count('coin');

    const head = document.createElement('p');
    head.className = 'section';
    head.textContent = `You carry ${coins} coin${coins === 1 ? '' : 's'}`;
    body.appendChild(head);

    const row = (id, price, label, enabled, fn) => {
      const r = document.createElement('div');
      r.className = `recipe ${enabled ? 'can' : 'cant'}`;
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      c.getContext('2d').drawImage(itemIcon(id), 0, 0);
      const meta = document.createElement('div');
      meta.className = 'rmeta';
      meta.innerHTML = `<div class="rname">${ITEMS[id]?.label ?? id}</div>
                        <div class="rcost">${price} coins</div>`;
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = !enabled;
      b.onclick = () => { fn(); this._renderShop(body); };
      r.append(c, meta, b);
      body.appendChild(r);
    };

    const buyHead = document.createElement('p');
    buyHead.className = 'section';
    buyHead.textContent = 'For sale';
    body.appendChild(buyHead);
    for (const s of SHOP) {
      row(s.id, s.buy, 'Buy', coins >= s.buy, () => {
        inv.remove('coin', s.buy);
        inv.add(s.id, 1);
        this.game.audio.play('coin');
      });
    }

    const sellHead = document.createElement('p');
    sellHead.className = 'section';
    sellHead.textContent = 'They will buy';
    body.appendChild(sellHead);
    let any = false;
    for (const [id, def] of Object.entries(ITEMS)) {
      if (!def.value || id === 'coin' || !inv.has(id, 1)) continue;
      any = true;
      row(id, def.value, `Sell (${inv.count(id)})`, true, () => {
        inv.remove(id, 1);
        inv.add('coin', def.value);
        this.game.audio.play('coin');
      });
    }
    if (!any) {
      const p = document.createElement('p');
      p.className = 'section';
      p.textContent = 'Nothing they want. Bring ore, pelts, or essence.';
      body.appendChild(p);
    }
  },

  // ── chests ─────────────────────────────────────────────────────
  openChest(x, y) {
    const g = this.game;
    let meta = g.world.getMeta(x, y);
    if (!meta) {
      // First open: roll loot based on how deep the chest is.
      meta = { items: this._rollChestLoot(x, y) };
      g.world.setMeta(x, y, meta);
    }
    g.audio.play('door');
    this._openPanel('Chest', (body) => this._renderChest(body, x, y));
  },

  _rollChestLoot(x, y) {
    const g = this.game;
    const deep = g.player.dimension === 'cave' ? Math.hypot(x, y) : 0;
    const table = deep > 300
      ? [[3, 'moonstone'], [3, 'gold_bar'], [4, 'iron_bar'], [3, 'potion_heal'],
         [2, 'crystal_shard'], [4, 'coin']]
      : deep > 90
        ? [[4, 'iron_ore'], [4, 'copper_bar'], [3, 'coal'], [3, 'torch'],
           [2, 'potion_energy'], [5, 'coin']]
        : [[5, 'wood'], [4, 'stone'], [4, 'torch'], [3, 'bread'], [3, 'fiber'],
           [2, 'flint'], [4, 'coin']];
    const out = [];
    const n = g.rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const id = g.rng.weighted(table);
      out.push({ id, count: id === 'coin' ? g.rng.int(6, 24) : g.rng.int(1, 5) });
    }
    return out;
  },

  _renderChest(body, x, y) {
    body.innerHTML = '';
    const g = this.game;
    const meta = g.world.getMeta(x, y) || { items: [] };

    const h = document.createElement('p');
    h.className = 'section';
    h.textContent = meta.items.length ? 'Contents — tap to take' : 'Empty';
    body.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'grid';
    meta.items.forEach((s, i) => {
      grid.appendChild(this._slot(i, s, () => {
        const left = g.player.inventory.add(s.id, s.count);
        if (left === s.count) { this.toast('Your bag is full', 'bad'); return; }
        g.audio.play('pickup');
        if (left > 0) s.count = left;
        else meta.items.splice(i, 1);
        g.world.setMeta(x, y, meta);
        this._renderChest(body, x, y);
      }));
    });
    body.appendChild(grid);

    if (meta.items.length) {
      const all = document.createElement('button');
      all.className = 'mbtn';
      all.style.width = '100%';
      all.style.marginTop = '10px';
      all.textContent = 'Take all';
      all.onclick = () => {
        for (let i = meta.items.length - 1; i >= 0; i--) {
          const s = meta.items[i];
          const left = g.player.inventory.add(s.id, s.count);
          if (left === 0) meta.items.splice(i, 1);
          else s.count = left;
        }
        g.world.setMeta(x, y, meta);
        g.audio.play('pickup');
        this._renderChest(body, x, y);
      };
      body.appendChild(all);
    }

    const store = document.createElement('p');
    store.className = 'section';
    store.textContent = 'Store from your bag';
    body.appendChild(store);
    const inv = g.player.inventory;
    const g2 = document.createElement('div');
    g2.className = 'grid';
    inv.slots.forEach((s, i) => {
      if (!s) return;
      g2.appendChild(this._slot(i, s, () => {
        const taken = inv.removeAt(i, s.count);
        meta.items.push({ id: taken.id, count: taken.count });
        g.world.setMeta(x, y, meta);
        g.audio.play('ui');
        this._renderChest(body, x, y);
      }));
    });
    body.appendChild(g2);
  },
});
