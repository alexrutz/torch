// Tile registry. IDs are explicit and permanent — save files store the number,
// so never renumber an existing entry; append new tiles instead.

export const GROUND = 'ground';
export const OBJECT = 'object';

/** Light emission is [r,g,b] in 0..1, multiplied by the source's strength. */
const T = (id, name, props) => ({ id, name, ...props });

export const TILES = [
  // ── ground (layer 0) ──────────────────────────────────────────
  T(0,  'void',      { layer: GROUND, label: 'Void' }),
  T(1,  'grass',     { layer: GROUND, label: 'Grass', variants: 4, step: 'grass' }),
  T(2,  'grass_dark',{ layer: GROUND, label: 'Wild Grass', variants: 4, step: 'grass' }),
  T(3,  'dirt',      { layer: GROUND, label: 'Dirt', variants: 4, step: 'soft' }),
  T(4,  'sand',      { layer: GROUND, label: 'Sand', variants: 4, step: 'soft' }),
  T(5,  'water',     { layer: GROUND, label: 'Water', variants: 3, liquid: true, slow: 0.55, step: 'water' }),
  T(6,  'deep_water',{ layer: GROUND, label: 'Deep Water', variants: 3, liquid: true, deep: true, slow: 0.4, step: 'water' }),
  T(7,  'stone_floor',{layer: GROUND, label: 'Stone', variants: 4, step: 'hard' }),
  T(8,  'snow',      { layer: GROUND, label: 'Snow', variants: 4, step: 'soft' }),
  T(9,  'ice',       { layer: GROUND, label: 'Ice', variants: 2, slippery: true, step: 'hard' }),
  T(10, 'mud',       { layer: GROUND, label: 'Mud', variants: 3, slow: 0.7, step: 'soft' }),
  T(11, 'ash',       { layer: GROUND, label: 'Ash', variants: 3, step: 'soft' }),
  T(12, 'cave_floor',{ layer: GROUND, label: 'Cave Floor', variants: 4, step: 'hard' }),
  T(13, 'path',      { layer: GROUND, label: 'Path', variants: 3, speed: 1.25, step: 'hard' }),
  T(14, 'plank',     { layer: GROUND, label: 'Planks', variants: 2, step: 'wood' }),
  T(15, 'farmland',  { layer: GROUND, label: 'Tilled Soil', variants: 2, step: 'soft' }),
  T(16, 'farmland_wet',{layer: GROUND, label: 'Watered Soil', variants: 2, step: 'soft' }),
  T(17, 'lava',      { layer: GROUND, label: 'Lava', variants: 3, liquid: true, damage: 8,
                       light: [1, 0.45, 0.12], lightStrength: 9, step: 'hard' }),
  T(18, 'brick_floor',{layer: GROUND, label: 'Brick', variants: 3, step: 'hard' }),
  T(19, 'moss_stone',{ layer: GROUND, label: 'Mossy Stone', variants: 3, step: 'soft' }),

  // ── objects (layer 1) ─────────────────────────────────────────
  T(100, 'tree_oak',   { layer: OBJECT, label: 'Oak', solid: true, opaque: true, tall: true,
                         hardness: 2.4, tool: 'axe', drops: [['wood', 3, 5], ['acorn', 0, 1, 0.35]] }),
  T(101, 'tree_pine',  { layer: OBJECT, label: 'Pine', solid: true, opaque: true, tall: true,
                         hardness: 2.6, tool: 'axe', drops: [['wood', 3, 6], ['pinecone', 0, 1, 0.3]] }),
  T(102, 'tree_palm',  { layer: OBJECT, label: 'Palm', solid: true, opaque: true, tall: true,
                         hardness: 2.0, tool: 'axe', drops: [['wood', 2, 4], ['coconut', 1, 2, 0.6]] }),
  T(103, 'tree_dead',  { layer: OBJECT, label: 'Dead Tree', solid: true, tall: true,
                         hardness: 1.6, tool: 'axe', drops: [['wood', 1, 3], ['stick', 1, 3]] }),
  T(104, 'tree_birch', { layer: OBJECT, label: 'Birch', solid: true, opaque: true, tall: true,
                         hardness: 2.2, tool: 'axe', drops: [['wood', 3, 5], ['bark', 1, 2, 0.4]] }),
  T(105, 'bush',       { layer: OBJECT, label: 'Bush', hardness: 0.5, tool: 'any',
                         drops: [['stick', 1, 2], ['berry', 0, 2, 0.5]] }),
  T(106, 'berry_bush', { layer: OBJECT, label: 'Berry Bush', hardness: 0.5, tool: 'any',
                         drops: [['berry', 2, 4], ['stick', 0, 1, 0.4]] }),
  T(107, 'rock',       { layer: OBJECT, label: 'Rock', hardness: 1.2, tool: 'pick',
                         drops: [['stone', 2, 3], ['flint', 0, 1, 0.3]] }),
  T(108, 'boulder',    { layer: OBJECT, label: 'Boulder', solid: true, opaque: true, tall: true,
                         hardness: 3.2, tool: 'pick', drops: [['stone', 4, 7], ['flint', 1, 2, 0.5]] }),
  T(109, 'ore_copper', { layer: OBJECT, label: 'Copper Vein', solid: true, opaque: true,
                         hardness: 3.0, tool: 'pick', tier: 1,
                         drops: [['copper_ore', 2, 4], ['stone', 1, 2]] }),
  T(110, 'ore_iron',   { layer: OBJECT, label: 'Iron Vein', solid: true, opaque: true,
                         hardness: 4.2, tool: 'pick', tier: 2,
                         drops: [['iron_ore', 2, 3], ['stone', 1, 2]] }),
  T(111, 'ore_gold',   { layer: OBJECT, label: 'Gold Vein', solid: true, opaque: true,
                         hardness: 5.0, tool: 'pick', tier: 3,
                         drops: [['gold_ore', 1, 3], ['stone', 1, 2]] }),
  T(112, 'ore_crystal',{ layer: OBJECT, label: 'Moonstone Vein', solid: true, opaque: true,
                         hardness: 6.5, tool: 'pick', tier: 4, light: [0.4, 0.6, 1], lightStrength: 3,
                         drops: [['moonstone', 1, 2], ['stone', 1, 2]] }),
  T(113, 'wall_stone', { layer: OBJECT, label: 'Stone Wall', solid: true, opaque: true, tall: true,
                         hardness: 2.6, tool: 'pick', drops: [['stone', 2, 2]] }),
  T(114, 'wall_wood',  { layer: OBJECT, label: 'Wood Wall', solid: true, opaque: true, tall: true,
                         hardness: 1.6, tool: 'axe', drops: [['wood', 2, 2]] }),
  T(115, 'wall_brick', { layer: OBJECT, label: 'Brick Wall', solid: true, opaque: true, tall: true,
                         hardness: 3.4, tool: 'pick', drops: [['brick', 2, 2]] }),
  T(116, 'door',       { layer: OBJECT, label: 'Door', solid: true, opaque: true, tall: true,
                         hardness: 1.4, tool: 'axe', interact: 'door', drops: [['door', 1, 1]] }),
  T(117, 'door_open',  { layer: OBJECT, label: 'Open Door', tall: true,
                         hardness: 1.4, tool: 'axe', interact: 'door', drops: [['door', 1, 1]] }),
  T(118, 'torch',      { layer: OBJECT, label: 'Torch', hardness: 0.2, tool: 'any',
                         light: [1, 0.72, 0.36], lightStrength: 9, flicker: 0.16,
                         drops: [['torch', 1, 1]] }),
  T(119, 'campfire',   { layer: OBJECT, label: 'Campfire', hardness: 0.6, tool: 'any',
                         light: [1, 0.6, 0.25], lightStrength: 11, flicker: 0.2,
                         interact: 'campfire', drops: [['campfire', 1, 1]] }),
  T(120, 'workbench',  { layer: OBJECT, label: 'Workbench', solid: true, hardness: 1.2, tool: 'axe',
                         interact: 'station', station: 'workbench', drops: [['workbench', 1, 1]] }),
  T(121, 'furnace',    { layer: OBJECT, label: 'Furnace', solid: true, hardness: 2.4, tool: 'pick',
                         interact: 'station', station: 'furnace', light: [1, 0.5, 0.2],
                         lightStrength: 6, flicker: 0.12, drops: [['furnace', 1, 1]] }),
  T(122, 'anvil',      { layer: OBJECT, label: 'Anvil', solid: true, hardness: 3.0, tool: 'pick',
                         interact: 'station', station: 'anvil', drops: [['anvil', 1, 1]] }),
  T(123, 'chest',      { layer: OBJECT, label: 'Chest', solid: true, hardness: 1.0, tool: 'axe',
                         interact: 'chest', drops: [['chest', 1, 1]] }),
  T(124, 'bed',        { layer: OBJECT, label: 'Bedroll', hardness: 0.4, tool: 'any',
                         interact: 'bed', drops: [['bed', 1, 1]] }),
  T(125, 'cave_mouth', { layer: OBJECT, label: 'Cave Mouth', interact: 'descend', tall: true }),
  T(126, 'cave_exit',  { layer: OBJECT, label: 'Way Up', interact: 'ascend', tall: true }),
  T(127, 'flowers',    { layer: OBJECT, label: 'Flowers', decor: true, hardness: 0.2, tool: 'any',
                         drops: [['petal', 1, 2]] }),
  T(128, 'tuft',       { layer: OBJECT, label: 'Tall Grass', decor: true, hardness: 0.15, tool: 'any',
                         drops: [['fiber', 1, 2], ['seed_wheat', 0, 1, 0.25]] }),
  T(129, 'cactus',     { layer: OBJECT, label: 'Cactus', solid: true, tall: true, damage: 1,
                         hardness: 1.0, tool: 'any', drops: [['cactus_flesh', 1, 3]] }),
  T(130, 'mushroom',   { layer: OBJECT, label: 'Mushroom', decor: true, hardness: 0.2, tool: 'any',
                         drops: [['mushroom', 1, 2]] }),
  T(131, 'glowcap',    { layer: OBJECT, label: 'Glowcap', decor: true, hardness: 0.2, tool: 'any',
                         light: [0.35, 0.9, 0.75], lightStrength: 5,
                         drops: [['glowcap', 1, 2]] }),
  T(132, 'barrel',     { layer: OBJECT, label: 'Barrel', solid: true, hardness: 0.9, tool: 'axe',
                         interact: 'chest', drops: [['wood', 1, 2]] }),
  T(133, 'fence',      { layer: OBJECT, label: 'Fence', solid: true, hardness: 0.8, tool: 'axe',
                         drops: [['fence', 1, 1]] }),
  T(134, 'sign',       { layer: OBJECT, label: 'Signpost', hardness: 0.6, tool: 'axe',
                         interact: 'sign', drops: [['sign', 1, 1]] }),
  T(135, 'grave',      { layer: OBJECT, label: 'Old Grave', solid: true, hardness: 2.0, tool: 'pick',
                         interact: 'grave', drops: [['bone', 1, 2]] }),
  T(136, 'altar',      { layer: OBJECT, label: 'Moon Altar', solid: true, hardness: 8, tool: 'pick',
                         interact: 'altar', light: [0.45, 0.6, 1], lightStrength: 7 }),
  T(137, 'crystal',    { layer: OBJECT, label: 'Crystal Cluster', solid: true, hardness: 3.6,
                         tool: 'pick', tier: 3, light: [0.5, 0.8, 1], lightStrength: 6,
                         drops: [['crystal_shard', 1, 3]] }),
  T(138, 'lantern',    { layer: OBJECT, label: 'Lantern', hardness: 0.5, tool: 'any',
                         light: [1, 0.85, 0.6], lightStrength: 12, flicker: 0.05,
                         drops: [['lantern', 1, 1]] }),
  T(139, 'vine',       { layer: OBJECT, label: 'Vines', decor: true, hardness: 0.3, tool: 'any',
                         drops: [['fiber', 1, 3]] }),

  // ── crops (growth stages chain via `next`) ────────────────────
  T(150, 'crop_wheat_0', { layer: OBJECT, label: 'Wheat Sprout', decor: true, crop: true,
                           stage: 0, growth: 'wheat', hardness: 0.2, tool: 'any' }),
  T(151, 'crop_wheat_1', { layer: OBJECT, label: 'Wheat', decor: true, crop: true,
                           stage: 1, growth: 'wheat', hardness: 0.2, tool: 'any' }),
  T(152, 'crop_wheat_2', { layer: OBJECT, label: 'Ripe Wheat', decor: true, crop: true, ripe: true,
                           stage: 2, growth: 'wheat', hardness: 0.2, tool: 'any',
                           drops: [['wheat', 2, 3], ['seed_wheat', 1, 2]] }),
  T(153, 'crop_carrot_0',{ layer: OBJECT, label: 'Carrot Sprout', decor: true, crop: true,
                           stage: 0, growth: 'carrot', hardness: 0.2, tool: 'any' }),
  T(154, 'crop_carrot_1',{ layer: OBJECT, label: 'Carrot Tops', decor: true, crop: true,
                           stage: 1, growth: 'carrot', hardness: 0.2, tool: 'any' }),
  T(155, 'crop_carrot_2',{ layer: OBJECT, label: 'Ripe Carrot', decor: true, crop: true, ripe: true,
                           stage: 2, growth: 'carrot', hardness: 0.2, tool: 'any',
                           drops: [['carrot', 2, 3], ['seed_carrot', 1, 2]] }),
  T(156, 'crop_moon_0',  { layer: OBJECT, label: 'Moonbloom Bud', decor: true, crop: true,
                           stage: 0, growth: 'moonbloom', hardness: 0.2, tool: 'any' }),
  T(157, 'crop_moon_1',  { layer: OBJECT, label: 'Moonbloom', decor: true, crop: true,
                           stage: 1, growth: 'moonbloom', hardness: 0.2, tool: 'any',
                           light: [0.4, 0.5, 0.9], lightStrength: 3 }),
  T(158, 'crop_moon_2',  { layer: OBJECT, label: 'Full Moonbloom', decor: true, crop: true, ripe: true,
                           stage: 2, growth: 'moonbloom', hardness: 0.2, tool: 'any',
                           light: [0.5, 0.65, 1], lightStrength: 5,
                           drops: [['moonbloom', 1, 2], ['seed_moon', 1, 1]] }),
];

// ── lookups ────────────────────────────────────────────────────
export const byId = new Map(TILES.map((t) => [t.id, t]));
export const byName = new Map(TILES.map((t) => [t.name, t]));

export const ID = Object.fromEntries(TILES.map((t) => [t.name.toUpperCase(), t.id]));

export function tile(idOrName) {
  return typeof idOrName === 'number' ? byId.get(idOrName) : byName.get(idOrName);
}

export function tileId(name) {
  const t = byName.get(name);
  if (!t) throw new Error(`unknown tile: ${name}`);
  return t.id;
}

/** Growth chains, resolved once so crop ticking is a map lookup. */
export const GROWTH_NEXT = new Map();
for (const t of TILES) {
  if (!t.crop || t.ripe) continue;
  const next = TILES.find((o) => o.growth === t.growth && o.stage === t.stage + 1);
  if (next) GROWTH_NEXT.set(t.id, next.id);
}

export const isSolid = (id) => !!byId.get(id)?.solid;
export const isOpaque = (id) => !!byId.get(id)?.opaque;
export const isLiquid = (id) => !!byId.get(id)?.liquid;
export const emitsLight = (id) => !!byId.get(id)?.light;
