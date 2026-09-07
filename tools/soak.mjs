// Plays the game with random input for a long simulated stretch and asserts
// nothing drifts: no exceptions, no NaN positions, no getting sealed inside
// rock, no unbounded growth in chunks or entities.
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
await new Promise((r) => server.listen(8094, r));

const minutes = +(process.argv[2] || 10);
const seed = process.argv[3] || 'soak';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
         '--disable-background-networking', '--disable-component-update',
         '--disable-features=Translate,OptimizationHints'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('http://127.0.0.1:8094/', { waitUntil: 'networkidle' });
await page.fill('#seed-input', seed);
await page.click('#btn-new');
await page.waitForTimeout(1200);

console.log(`soak: ${minutes} simulated minutes, seed "${seed}"`);

const report = await page.evaluate(async (mins) => {
  const g = window.game;
  const rng = (() => { let a = 12345; return () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const ACTIONS = ['up', 'down', 'left', 'right', 'use', 'interact', 'sprint'];
  const held = new Set();
  const samples = [];
  const problems = [];

  // Equip so the random 'use' presses exercise mining and combat, not nothing.
  const inv = g.player.inventory;
  inv.slots[0] = { id: 'iron_pick', count: 1, durability: 99999 };
  inv.slots[1] = { id: 'iron_axe', count: 1, durability: 99999 };
  inv.slots[2] = { id: 'iron_sword', count: 1, durability: 99999 };
  inv.slots[3] = { id: 'torch', count: 99 };
  inv.slots[4] = { id: 'wall_stone', count: 99 };

  const { villageCaveMouth } = await import('/src/world/worldgen.js');
  window.__caveMouth = villageCaveMouth(g.seed);

  const TICKS = Math.round(mins * 60 * 60);
  let stuckTicks = 0, maxStuck = 0;

  for (let i = 0; i < TICKS; i++) {
    // Shuffle the held actions occasionally.
    if (i % 18 === 0) {
      for (const a of held) g.input.release(a);
      held.clear();
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const a = ACTIONS[Math.floor(rng() * ACTIONS.length)];
        held.add(a); g.input.press(a);
      }
      // Occasionally switch hotbar slot, and rarely dive/climb.
      if (rng() < 0.15) g.player.inventory.selected = Math.floor(rng() * 8);
      // Travel the way the game does: through the village cave mouth, whose
      // landing room is carved. Teleporting to arbitrary coordinates would
      // drop the player inside rock, which normal play cannot do.
      if (rng() < 0.004) {
        const to = g.player.dimension === 'cave' ? 'surface' : 'cave';
        g.changeDimension(to, window.__caveMouth.x, window.__caveMouth.y);
      }
    }
    // A random `interact` can open a panel, which pauses the game — close it
    // again or the rest of the soak measures a frozen world.
    if (g.ui.openPanel) g.ui.closePanel();
    if (!g.el?.dialogue) g.ui.closeDialogue();
    // Keep the player alive so the sim keeps running.
    if (g.player.dead) { g.respawnPlayer(); }
    if (g.player.hp < 25) g.player.hp = g.player.maxHp;
    g.paused = false;

    g.update(1 / 60);

    if (!Number.isFinite(g.player.x) || !Number.isFinite(g.player.y)) {
      problems.push(`NaN position at tick ${i}`);
      break;
    }
    const inRock = g.world.isSolid(g.player.tx, g.player.ty);
    if (inRock) { stuckTicks++; maxStuck = Math.max(maxStuck, stuckTicks); }
    else stuckTicks = 0;

    if (i % Math.round(TICKS / 12) === 0) {
      samples.push({
        min: +(i / 3600).toFixed(1),
        chunks: g.surface.chunks.size + g.cave.chunks.size,
        mobs: g.mobs.length, npcs: g.npcs.length, drops: g.drops.length,
        edits: g.surface.edits.size + g.cave.edits.size,
        meta: g.surface.meta.size + g.cave.meta.size,
        day: g.clock.day,
        dim: g.player.dimension,
      });
    }
  }
  for (const a of held) g.input.release(a);

  return {
    problems, maxStuckTicks: maxStuck, samples,
    stats: g.player.stats,
    day: g.clock.day,
    finalChunks: g.surface.chunks.size + g.cave.chunks.size,
    finalMobs: g.mobs.length,
    saveOk: g.save(),
    saveBytes: (localStorage.getItem('torch.save.v1') || '').length,
  };
}, minutes);

await browser.close();
server.close();

console.log('\n  min   chunks  mobs  npcs  drops  edits  meta  day  where');
for (const s of report.samples) {
  console.log(`  ${String(s.min).padStart(4)}  ${String(s.chunks).padStart(6)}`
    + `  ${String(s.mobs).padStart(4)}  ${String(s.npcs).padStart(4)}`
    + `  ${String(s.drops).padStart(5)}  ${String(s.edits).padStart(5)}`
    + `  ${String(s.meta).padStart(4)}  ${String(s.day).padStart(3)}  ${s.dim}`);
}
console.log('\n  player stats:', JSON.stringify(report.stats));
console.log('  save:', report.saveOk ? `${(report.saveBytes / 1024).toFixed(1)} KB` : 'FAILED');
console.log('  longest run inside a solid tile:',
  (report.maxStuckTicks / 60).toFixed(2) + 's');

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
if (report.problems.length) fail(report.problems.join('; '));
if (errors.length) fail(`${errors.length} runtime errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
if (report.finalChunks > 400) fail(`chunk cache unbounded: ${report.finalChunks}`);
if (report.finalMobs > 40) fail(`mob count unbounded: ${report.finalMobs}`);
if (report.maxStuckTicks > 180) fail(`player sealed in rock for ${(report.maxStuckTicks / 60).toFixed(1)}s`);
if (!report.saveOk) fail('save failed');
console.log(bad ? `\n  ${bad} problem(s)` : '\n  clean');
process.exit(bad ? 1 : 0);
