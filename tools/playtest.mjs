// Drives a real browser session through the core gameplay loop and asserts on
// the resulting game state. This is what catches wiring bugs that a render
// smoke test cannot.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';

const ROOT = process.cwd();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const fp = join(ROOT, normalize(u === '/' ? '/index.html' : u));
    const b = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(8095, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + ' | ' + (e.stack || '').split('\n')[1]));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('http://127.0.0.1:8095/', { waitUntil: 'networkidle' });
await page.click('#btn-new');
await page.waitForTimeout(1500);

const results = [];
const check = (name, pass, detail = '') =>
  results.push({ name, pass, detail: String(detail).slice(0, 150) });

const run = (fn, arg) => page.evaluate(fn, arg);

/** Puts the player back in a known state so one test can't poison the next. */
const reset = () => run(() => {
  const g = window.game;
  g.mobs.length = 0;
  g.drops.length = 0;
  g.projectiles.length = 0;
  if (g.player.dead) g.respawnPlayer();
  g.player.hp = g.player.maxHp;
  g.player.energy = g.player.maxEnergy;
  g.player.invuln = 999;             // no interference from stray damage
  g.player.dead = false;
  g.paused = false;
  g.ui.closePanel();
  g.ui.hideDeath();
  g.spawnTimer = 1e9;                // stop ambient spawning during assertions
  return true;
});


await reset();
// ── 1. mining: put a tree in front of the player and chop it ─────
const mine = await run(async () => {
  const g = window.game;
  const { tileId } = await import('/src/world/tiles.js');
  const p = g.player;
  p.facing = 'down';
  const t = p.targetTile();
  g.world.setObject(t.x, t.y, tileId('tree_oak'));
  const before = p.inventory.count('wood');
  g.player.inventory.slots[0] = { id: 'stone_axe', count: 1, durability: 150 };
  g.player.inventory.selected = 0;
  // Hold "use" for long enough to finish the swing.
  g.input.press('use');
  for (let i = 0; i < 400; i++) g.update(1 / 60);
  g.input.release('use');
  for (let i = 0; i < 120; i++) g.update(1 / 60);   // let drops fly to the player
  return { before, after: p.inventory.count('wood'),
           objectGone: g.world.getObject(t.x, t.y) === 0,
           drops: g.drops.length, mined: p.stats.mined };
});
check('mining breaks a tree', mine.objectGone, JSON.stringify(mine));
check('mining yields wood', mine.after > mine.before, `${mine.before} -> ${mine.after}`);

await reset();
// ── 2. crafting ──────────────────────────────────────────────────
const craft = await run(async () => {
  const g = window.game;
  const { RECIPES } = await import('/src/world/recipes.js');
  const inv = g.player.inventory;
  inv.add('wood', 40); inv.add('stone', 40); inv.add('stick', 20); inv.add('fiber', 20);
  const r = RECIPES.find((x) => x.out === 'workbench');
  const okBefore = r.cost.every(([id, n]) => inv.has(id, n));
  for (const [id, n] of r.cost) inv.remove(id, n);
  inv.add(r.out, r.count);
  return { okBefore, benches: inv.count('workbench') };
});
check('workbench craftable from wood', craft.okBefore && craft.benches > 0, JSON.stringify(craft));

await reset();
// ── 3. placing a block ───────────────────────────────────────────
const place = await run(async () => {
  const g = window.game;
  const p = g.player;
  const i = p.inventory.slots.findIndex((s) => s && s.id === 'workbench');
  p.inventory.selected = i;
  p.facing = 'up';
  const t = p.targetTile();
  g.world.setObject(t.x, t.y, 0);
  const before = p.inventory.count('workbench');
  g.input.press('use'); g.update(1 / 60); g.input.release('use'); g.update(1 / 60);
  const { byId } = await import('/src/world/tiles.js');
  return { placed: byId.get(g.world.getObject(t.x, t.y))?.name,
           consumed: before - p.inventory.count('workbench'), stat: p.stats.placed };
});
check('placing a workbench', place.placed === 'workbench' && place.consumed === 1, JSON.stringify(place));

await reset();
// ── 4. the edit survives a chunk reload (the save model depends on it) ──
const persist = await run(() => {
  const g = window.game;
  const p = g.player;
  p.facing = 'up';
  const t = p.targetTile();
  const before = g.world.getObject(t.x, t.y);
  g.world.chunks.clear();                       // force regeneration from seed
  return { before, after: g.world.getObject(t.x, t.y) };
});
check('edits survive chunk regeneration', persist.before === persist.after, JSON.stringify(persist));

await reset();
// ── 5. combat ────────────────────────────────────────────────────
const combat = await run(async () => {
  const g = window.game;
  const p = g.player;
  const { Mob } = await import('/src/entity/mob.js');
  g.mobs.length = 0;
  p.facing = 'right';
  const m = new Mob(p.x + 14, p.y, 'slime');
  g.mobs.push(m);
  p.inventory.slots[0] = { id: 'iron_sword', count: 1, durability: 520 };
  p.inventory.selected = 0;
  const hp0 = m.hp;
  let swings = 0;
  for (let i = 0; i < 600 && !m.dead; i++) {
    // Re-anchor so knockback doesn't carry it out of reach.
    m.x = p.x + 14; m.y = p.y; m.knockX = 0; m.knockY = 0;
    if (p.swingCooldown <= 0) { g.input.press('use'); swings++; } 
    g.update(1 / 60);
    g.input.release('use');
  }
  return { hp0, hpNow: m.hp, dead: m.dead, swings, kills: p.stats.killed,
           dropsAfter: g.drops.length };
});
check('melee damages and kills a mob', combat.dead && combat.hpNow <= 0, JSON.stringify(combat));
check('kill is recorded', combat.kills > 0, `killed=${combat.kills}`);

await reset();
// ── 6. quests ────────────────────────────────────────────────────
const quest = await run(async () => {
  const g = window.game;
  const { QUESTS } = await import('/src/systems/quests.js');
  const q = QUESTS.kindle;
  g.player.inventory.add('torch', 10);
  const can = g.quests.canComplete(q, g.player);
  const torchBefore = g.player.inventory.count('torch');
  g.completeQuest(q);
  return { can, torchBefore, torchAfter: g.player.inventory.count('torch'),
           done: g.quests.isDone('kindle'), nextActive: g.quests.isActive('ironwill'),
           gotPick: g.player.inventory.has('stone_pick', 1) };
});
check('quest completes and consumes items',
  quest.can && quest.done && quest.torchAfter === quest.torchBefore - 5, JSON.stringify(quest));
check('quest chain advances and pays out', quest.nextActive && quest.gotPick, JSON.stringify(quest));

await reset();
// ── 7. save / load round trip ────────────────────────────────────
const save = await run(() => {
  const g = window.game;
  g.player.inventory.add('moonstone', 7);
  const beforeDay = g.clock.day;
  const beforeMoon = g.player.inventory.count('moonstone');
  const beforeEdits = g.surface.edits.size;
  const ok = g.save();
  const loaded = g.loadSaved();
  return { ok, loaded, beforeDay, beforeMoon, beforeEdits,
           afterDay: g.clock.day, afterMoon: g.player.inventory.count('moonstone'),
           afterEdits: g.surface.edits.size, seed: g.seedName };
});
check('save + load round trip',
  save.ok && save.loaded && save.afterMoon === save.beforeMoon
  && save.afterEdits === save.beforeEdits, JSON.stringify(save));

await reset();
// ── 8. dimension change ──────────────────────────────────────────
const dim = await run(async () => {
  const g = window.game;
  const { villageCaveMouth } = await import('/src/world/worldgen.js');
  const vm = villageCaveMouth(g.seed);
  g.changeDimension('cave', vm.x, vm.y);
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  const inCave = g.player.dimension === 'cave';
  const amb = g.lightMap.ambient;
  const stuck = g.world.isSolid(g.player.tx, g.player.ty);
  g.changeDimension('surface', vm.x, vm.y);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  return { inCave, darkAmbient: amb[0] < 0.2, stuck, back: g.player.dimension };
});
check('descend into the cave', dim.inCave && dim.darkAmbient, JSON.stringify(dim));
check('player is not embedded in rock on arrival', !dim.stuck, JSON.stringify(dim));
check('climb back out', dim.back === 'surface', JSON.stringify(dim));

await reset();
// ── 9. death and respawn ─────────────────────────────────────────
const death = await run(() => {
  const g = window.game;
  g.player.hp = 5;
  g.player.invuln = 0;
  g.player.takeDamage(50, g, 'a test');
  const died = g.player.dead;
  g.respawnPlayer();
  return { died, alive: !g.player.dead, hp: Math.round(g.player.hp),
           paused: g.paused };
});
check('death then respawn restores control',
  death.died && death.alive && death.hp > 0 && !death.paused, JSON.stringify(death));

await reset();
// ── 10. mob spawning at night ────────────────────────────────────
const spawn = await run(() => {
  const g = window.game;
  g.mobs.length = 0;
  g.clock.elapsed = 720 * 0.95;              // deep night
  g.spawnTimer = 0;
  for (let i = 0; i < 60 * 90; i++) g.update(1 / 60);
  return { mobs: g.mobs.length, species: [...new Set(g.mobs.map((m) => m.species))],
           night: g.clock.isNight };
});
check('hostiles spawn at night', spawn.mobs > 0, JSON.stringify(spawn));


await reset();
// ── 11. the signature mechanic: shades burn in light ─────────────
const shadeLit = await run(async () => {
  const g = window.game;
  const { Mob } = await import('/src/entity/mob.js');
  const { tileId } = await import('/src/world/tiles.js');
  g.clock.elapsed = 720 * 0.95;                  // night, so ambient is dark
  g.mobs.length = 0;
  const p = g.player;
  // Ring the shade with lanterns so its tile is unambiguously bright.
  for (const [dx, dy] of [[2,0],[-2,0],[0,2],[0,-2]]) {
    g.world.setObject(p.tx + 3 + dx, p.ty + dy, tileId('lantern'));
  }
  const m = new Mob((p.tx + 3) * 16 + 8, p.ty * 16 + 8, 'shade');
  g.mobs.push(m);
  const hp0 = m.hp;
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  const lit = g.lightMap.brightness(p.tx + 3, p.ty);
  const alive = g.mobs.find((x) => x.species === 'shade');
  for (const [dx, dy] of [[2,0],[-2,0],[0,2],[0,-2]]) {
    g.world.setObject(p.tx + 3 + dx, p.ty + dy, 0);
  }
  return { hp0, hpNow: alive ? alive.hp : 0, gone: !alive, brightness: +lit.toFixed(2) };
});
check('shade is lit by the lanterns', shadeLit.brightness > 0.62, JSON.stringify(shadeLit));
check('shade burns in bright light',
  shadeLit.gone || shadeLit.hpNow < shadeLit.hp0, JSON.stringify(shadeLit));

const shadeDark = await run(async () => {
  const g = window.game;
  const { Mob } = await import('/src/entity/mob.js');
  g.clock.elapsed = 720 * 0.95;
  g.mobs.length = 0;
  const p = g.player;
  p.inventory.slots[p.inventory.selected] = null;   // no carried torch
  const m = new Mob(p.x + 300, p.y + 300, 'shade');
  m.guard = true;                                   // don't despawn on distance
  g.mobs.push(m);
  const hp0 = m.hp;
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  const alive = g.mobs.find((x) => x.species === 'shade');
  return { hp0, hpNow: alive ? alive.hp : -1,
           dark: +g.lightMap.brightness(m.x / 16, m.y / 16).toFixed(2) };
});
check('shade is unharmed in the dark',
  shadeDark.hpNow === shadeDark.hp0, JSON.stringify(shadeDark));

await reset();
// ── 12. farming: till, plant, ripen, harvest ─────────────────────
const farm = await run(async () => {
  const g = window.game;
  const { tileId, byId } = await import('/src/world/tiles.js');
  const p = g.player;
  p.facing = 'down';
  const t = p.targetTile();
  g.world.setGround(t.x, t.y, tileId('dirt'));
  g.world.setObject(t.x, t.y, 0);

  p.inventory.slots[0] = { id: 'stone_hoe', count: 1, durability: 200 };
  p.inventory.selected = 0;
  g.input.press('use'); g.update(1 / 60); g.input.release('use'); g.update(1 / 60);
  const tilled = byId.get(g.world.getGround(t.x, t.y))?.name;

  p.inventory.slots[0] = { id: 'seed_wheat', count: 3 };
  g.input.press('use'); g.update(1 / 60); g.input.release('use'); g.update(1 / 60);
  const planted = byId.get(g.world.getObject(t.x, t.y))?.name;

  g.clock.elapsed = 720 * 0.5;                    // daylight, so crops grow
  for (let i = 0; i < 60 * 260; i++) g.update(1 / 60);
  const grown = byId.get(g.world.getObject(t.x, t.y))?.name;

  const wheatBefore = p.inventory.count('wheat');
  g.breakTile(t.x, t.y);
  for (let i = 0; i < 200; i++) g.update(1 / 60);
  return { tilled, planted, grown, wheatBefore, wheatAfter: p.inventory.count('wheat') };
});
check('hoe tills soil', farm.tilled === 'farmland', JSON.stringify(farm));
check('seeds plant', farm.planted === 'crop_wheat_0', JSON.stringify(farm));
check('crops ripen over time', farm.grown === 'crop_wheat_2', JSON.stringify(farm));
check('ripe crop yields wheat', farm.wheatAfter > farm.wheatBefore, JSON.stringify(farm));

await reset();
// ── 13. tool tier gates hard ore ─────────────────────────────────
const gate = await run(async () => {
  const g = window.game;
  const { tileId } = await import('/src/world/tiles.js');
  const p = g.player;
  p.facing = 'left';
  const t = p.targetTile();
  g.world.setObject(t.x, t.y, tileId('ore_gold'));       // tier 3
  p.inventory.slots[0] = { id: 'wood_pick', count: 1, durability: 60 };  // tier 1
  p.inventory.selected = 0;
  g.input.press('use');
  for (let i = 0; i < 60 * 12; i++) g.update(1 / 60);
  g.input.release('use');
  const stillThere = g.world.getObject(t.x, t.y) !== 0;

  p.inventory.slots[0] = { id: 'iron_pick', count: 1, durability: 460 };  // tier 3
  g.input.press('use');
  for (let i = 0; i < 60 * 12; i++) g.update(1 / 60);
  g.input.release('use');
  for (let i = 0; i < 200; i++) g.update(1 / 60);
  return { stillThere, brokenNow: g.world.getObject(t.x, t.y) === 0,
           ore: p.inventory.count('gold_ore') };
});
check('wooden pick cannot mine gold', gate.stillThere, JSON.stringify(gate));
check('iron pick can, and yields ore', gate.brokenNow && gate.ore > 0, JSON.stringify(gate));

await reset();
// ── 14. tools wear out ───────────────────────────────────────────
const wear = await run(async () => {
  const g = window.game;
  const p = g.player;
  p.inventory.slots[0] = { id: 'wood_axe', count: 1, durability: 3 };
  p.inventory.selected = 0;
  const { tileId } = await import('/src/world/tiles.js');
  p.facing = 'down';
  let broke = false;
  for (let n = 0; n < 5 && !broke; n++) {
    const t = p.targetTile();
    g.world.setObject(t.x, t.y, tileId('bush'));
    g.input.press('use');
    for (let i = 0; i < 60 * 6; i++) g.update(1 / 60);
    g.input.release('use');
    g.update(1 / 60);
    if (!p.inventory.slots[0]) broke = true;
  }
  return { broke };
});
check('tools break when durability runs out', wear.broke, JSON.stringify(wear));

await reset();
// ── 15. chests hold and return items ─────────────────────────────
const chest = await run(async () => {
  const g = window.game;
  const p = g.player;
  const t = { x: p.tx + 4, y: p.ty + 4 };
  g.world.setMeta(t.x, t.y, null);
  g.ui.openChest(t.x, t.y);
  const meta = g.world.getMeta(t.x, t.y);
  const rolled = (meta?.items || []).length;
  g.ui.closePanel();
  return { rolled, ids: (meta?.items || []).map((i) => i.id) };
});
check('chests roll loot on first open', chest.rolled > 0, JSON.stringify(chest));


await reset();
// ── 16. a player inside rock digs themselves out ─────────────────
const unstick = await run(async () => {
  const g = window.game;
  const { villageCaveMouth } = await import('/src/world/worldgen.js');
  const vm = villageCaveMouth(g.seed);
  g.changeDimension('cave', vm.x, vm.y);
  // Find solid rock and drop the player right into the middle of it.
  let rock = null;
  for (let r = 8; r < 60 && !rock; r++) {
    for (let a = 0; a < 32 && !rock; a++) {
      const x = vm.x + Math.round(Math.cos(a / 32 * 6.283) * r);
      const y = vm.y + Math.round(Math.sin(a / 32 * 6.283) * r);
      if (g.world.isSolid(x, y)) rock = { x, y };
    }
  }
  g.player.x = rock.x * 16 + 8;
  g.player.y = rock.y * 16 + 8;
  const embedded = g.world.isSolid(g.player.tx, g.player.ty);
  for (let i = 0; i < 10; i++) g.update(1 / 60);
  const freed = !g.world.isSolid(g.player.tx, g.player.ty);
  g.changeDimension('surface', vm.x, vm.y);
  return { embedded, freed, rock };
});
check('a player embedded in rock is freed',
  unstick.embedded && unstick.freed, JSON.stringify(unstick));

await browser.close();
server.close();

console.log('');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  if (!r.pass) { console.log(`        ${r.detail}`); failed++; }
}
console.log(`\n  ${results.length - failed}/${results.length} passed`);
if (errors.length) {
  console.log(`  runtime errors: ${errors.length}`);
  for (const e of [...new Set(errors)].slice(0, 8)) console.log('   ! ' + e.slice(0, 200));
}
process.exit(failed || errors.length ? 1 : 0);
