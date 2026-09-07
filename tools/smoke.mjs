// Boots the game in a real browser, plays it, and reports console errors.
// Screenshots land in tools/shots/.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, mkdir } from 'fs/promises';
import { extname, join, normalize } from 'path';

const ROOT = process.cwd();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const p = join(ROOT, normalize(url === '/' ? '/index.html' : url));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(8099, r));

const shots = join(ROOT, 'tools', 'shots');
await mkdir(shots, { recursive: true });

const device = process.argv[2] || 'desktop';
const seed = process.argv[3] || 'torch';
const viewport = device === 'phone' ? { width: 390, height: 844 }
               : device === 'phone-landscape' ? { width: 844, height: 390 }
               : { width: 1100, height: 640 };

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
         '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport,
  deviceScaleFactor: device.startsWith('phone') ? 3 : 1,
  hasTouch: device.startsWith('phone'),
  isMobile: device.startsWith('phone'),
});
const page = await ctx.newPage();

const errors = [], warnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`));

const step = async (name, fn) => {
  try { await fn(); } catch (e) { errors.push(`STEP ${name}: ${e.message}`); }
  await page.screenshot({ path: join(shots, `${device}-${name}.png`) });
  console.log(`  · ${name}`);
};

console.log(`\n[${device}] ${viewport.width}x${viewport.height}  seed="${seed}"`);
await page.goto('http://127.0.0.1:8099/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await step('01-title', async () => {});

await step('02-world', async () => {
  await page.fill('#seed-input', seed);
  await page.click('#btn-new');
  await page.waitForTimeout(2500);
});

// Report what the game thinks its state is.
const state = await page.evaluate(() => {
  const g = window.game;
  if (!g || !g.running) return { running: false };
  return {
    running: true,
    fps: g.loop.fps,
    seedName: g.seedName,
    player: { x: Math.round(g.player.x), y: Math.round(g.player.y),
              tx: g.player.tx, ty: g.player.ty, hp: g.player.hp,
              dim: g.player.dimension },
    npcs: g.npcs.length, mobs: g.mobs.length, drops: g.drops.length,
    chunks: g.world.chunks.size,
    day: g.clock.day, time: g.clock.clockText, weather: g.clock.weather,
    ambient: g.clock.ambient().map((v) => +v.toFixed(2)),
    canvas: { w: g.renderer.width, h: g.renderer.height },
    lightGrid: { w: g.lightMap.w, h: g.lightMap.h },
    ground: g.world.groundTile(g.player.tx, g.player.ty)?.name,
    inventory: g.player.inventory.slots.filter(Boolean).map((s) => `${s.id}x${s.count}`),
  };
});
console.log('  state:', JSON.stringify(state, null, 2).split('\n').map((l) => '    ' + l).join('\n').trim());

await step('03-walk', async () => {
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1100);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyS');
});

await step('04-inventory', async () => {
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(400);
});
await step('05-crafting', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(400);
});
await step('06-map', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(400);
});
await step('06b-dialogue', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const g = window.game;
    const npc = g.npcs[0];
    if (npc) { g.player.x = npc.x; g.player.y = npc.y + 20; g.ui.openDialogue(npc); }
  });
  await page.waitForTimeout(400);
});

await step('06c-shop', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.player.inventory.add('coin', 400);
    g.player.inventory.add('pelt', 3);
    g.player.inventory.add('moonstone', 2);
    g.ui.openShop(g.npcs[0]);
  });
  await page.waitForTimeout(400);
});

await step('06d-workbench', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const inv = g.player.inventory;
    inv.add('wood', 30); inv.add('stone', 30); inv.add('stick', 20);
    inv.add('fiber', 10); inv.add('iron_bar', 8); inv.add('leather', 4);
    g.ui.openCrafting('workbench');
  });
  await page.waitForTimeout(400);
});

await step('07-night', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // Jump the clock to deep night to check the lighting.
  await page.evaluate(() => { window.game.clock.elapsed += 720 * 0.62; });
  await page.waitForTimeout(1400);
});
await step('07b-wilderness', async () => {
  // Walk well clear of the village lanterns to judge true night.
  await page.evaluate(() => {
    const g = window.game;
    g.player.x += 16 * 60;
    g.player.y += 16 * 30;
    g.camera.snapTo(g.player.x, g.player.y);
  });
  await page.waitForTimeout(1200);
});

await step('07c-torchlit', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.player.inventory.slots[0] = { id: 'torch', count: 5 };
    g.player.inventory.selected = 0;
  });
  await page.waitForTimeout(900);
});

await step('08-cave', async () => {
  await page.evaluate(async () => {
    const g = window.game;
    const { villageCaveMouth } = await import('/src/world/worldgen.js');
    const vm = villageCaveMouth(g.seed);
    g.changeDimension('cave', vm.x, vm.y);
    g.player.inventory.slots[0] = { id: 'torch', count: 5 };
    g.player.inventory.selected = 0;
  });
  await page.waitForTimeout(1500);
});

const perf = await page.evaluate(async () => {
  const g = window.game;
  const t0 = performance.now();
  let frames = 0;
  await new Promise((res) => {
    const tick = () => { frames++; performance.now() - t0 < 1500 ? requestAnimationFrame(tick) : res(); };
    requestAnimationFrame(tick);
  });
  return { fps: Math.round(frames / ((performance.now() - t0) / 1000)), loopFps: g.loop.fps };
});
console.log('  perf:', JSON.stringify(perf));

await browser.close();
server.close();

console.log(`\n  errors: ${errors.length}`);
for (const e of errors.slice(0, 12)) console.log('   ! ' + e.split('\n')[0].slice(0, 220));
if (warnings.length) console.log(`  warnings: ${warnings.length}`);
for (const w of warnings.slice(0, 5)) console.log('   ~ ' + w.slice(0, 160));
process.exit(errors.length ? 1 : 0);
