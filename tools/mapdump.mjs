// Renders generated worlds as ASCII so terrain tuning can be judged without a browser.
import { World, CHUNK } from '../src/world/world.js';
import { makeSurfaceGenerator, makeCaveGenerator, biomeAt, spawnPoint, villageSite,
         villageCaveMouth, altarSite, BIOME_LIST } from '../src/world/worldgen.js';
import { byId } from '../src/world/tiles.js';
import { hashString } from '../src/core/rng.js';

const GLYPH = {
  void:' ', grass:'"', grass_dark:'*', dirt:',', sand:'.', water:'~', deep_water:'≈',
  stone_floor:'-', snow:'o', ice:'=', mud:'%', ash:';', cave_floor:'·', path:'+',
  plank:'_', farmland:'f', farmland_wet:'F', lava:'!', brick_floor:'#', moss_stone:'`',
  tree_oak:'T', tree_pine:'A', tree_palm:'Y', tree_dead:'t', tree_birch:'B',
  bush:'q', berry_bush:'b', rock:'n', boulder:'O', cactus:'k', mushroom:'m', glowcap:'g',
  flowers:'v', tuft:'"', vine:'j', crystal:'C', ore_copper:'c', ore_iron:'i',
  ore_gold:'G', ore_crystal:'M', wall_stone:'█', wall_wood:'W', wall_brick:'▓',
  door:'D', torch:'¡', campfire:'&', workbench:'E', furnace:'U', anvil:'N', chest:'$',
  bed:'e', fence:'x', sign:'?', grave:'†', altar:'@', lantern:'L', cave_mouth:'∩',
  cave_exit:'∪', barrel:'0',
};
const g = (id) => GLYPH[byId.get(id)?.name] ?? '?';

const seed = hashString(process.argv[2] || 'torch');
const mode = process.argv[3] || 'surface';
const W = +(process.argv[4] || 118), H = +(process.argv[5] || 46);

const world = mode === 'cave'
  ? new World(seed, 'cave', makeCaveGenerator(seed))
  : new World(seed, 'surface', makeSurfaceGenerator(seed));

let cx, cy;
if (mode === 'cave') ({ x: cx, y: cy } = villageCaveMouth(seed));
else ({ x: cx, y: cy } = spawnPoint(seed));
if (process.argv[6]) { const p = process.argv[6].split(','); cx = +p[0]; cy = +p[1]; }

const t0 = Date.now();
const rows = [];
for (let y = cy - (H >> 1); y < cy + (H >> 1); y++) {
  let row = '';
  for (let x = cx - (W >> 1); x < cx + (W >> 1); x++) {
    const o = world.getObject(x, y);
    row += o ? g(o) : g(world.getGround(x, y));
  }
  rows.push(row);
}
const ms = Date.now() - t0;
console.log(rows.join('\n'));
console.log(`\n[${mode}] seed=${seed} center=${cx},${cy}  ${W}x${H} in ${ms}ms  chunks=${world.chunks.size}  spawns=${world.pendingSpawns.length}`);

if (mode === 'surface') {
  const counts = new Map();
  const N = 220;
  for (let y = -N; y < N; y += 2) for (let x = -N; x < N; x += 2) {
    const b = biomeAt(seed, x * 3, y * 3);
    counts.set(b.label, (counts.get(b.label) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  console.log('biome mix over ~1320x1320 tiles:');
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log('  ' + k.padEnd(12), (v / total * 100).toFixed(1) + '%');
  }
  console.log('village site', JSON.stringify(villageSite(seed)), 'spawn', JSON.stringify(spawnPoint(seed)));
} else {
  let open = 0, n = 0;
  for (let y = -200; y < 200; y++) for (let x = -200; x < 200; x++) { n++; if (world.getObject(cx + x, cy + y) === 0) open++; }
  console.log('open floor fraction near entrance:', (open / n * 100).toFixed(1) + '%');
  console.log('altar at', JSON.stringify(altarSite(seed)));
}
