// Item registry. Keys are stable strings — inventories and save files store the
// key, so renaming one breaks old saves.
//
// Tool tiers gate mining: a tool's `tier` must be >= the ore tile's `tier`.
// `power` scales mining speed; `durability` is uses before the tool breaks.

const I = (id, label, props) => [id, { id, label, stack: 99, kind: 'material', ...props }];

export const ITEMS = Object.fromEntries([
  // ── raw materials ─────────────────────────────────────────────
  I('wood',        'Wood',          { desc: 'Rough timber. The start of everything.' }),
  I('stone',       'Stone',         { desc: 'Common grey rock.' }),
  I('stick',       'Stick',         { desc: 'A stout length of branch.' }),
  I('fiber',       'Plant Fiber',   { desc: 'Twisted grass. Binds things together.' }),
  I('flint',       'Flint',         { desc: 'Sparks when struck.' }),
  I('bone',        'Bone',          { desc: 'Someone did not make it home.' }),
  I('bark',        'Birch Bark',    { desc: 'Papery and pale.' }),
  I('petal',       'Petal',         { desc: 'Bright and fragile.' }),
  I('acorn',       'Acorn',         { desc: 'An oak, waiting.' }),
  I('pinecone',    'Pinecone',      { desc: 'Resinous and stubborn.' }),
  I('copper_ore',  'Copper Ore',    { desc: 'Green-streaked rock.' }),
  I('iron_ore',    'Iron Ore',      { desc: 'Heavy and rust-flecked.' }),
  I('gold_ore',    'Gold Ore',      { desc: 'It catches even faint light.' }),
  I('moonstone',   'Moonstone',     { desc: 'Cold to the touch. Hums faintly.', value: 40 }),
  I('crystal_shard','Crystal Shard',{ desc: 'A splinter of something older.', value: 12 }),
  I('coal',        'Coal',          { desc: 'Burns long and hot.' }),
  I('copper_bar',  'Copper Bar',    { desc: 'Smelted and true.', value: 8 }),
  I('iron_bar',    'Iron Bar',      { desc: 'Smelted and true.', value: 16 }),
  I('gold_bar',    'Gold Bar',      { desc: 'Soft, heavy, precious.', value: 30 }),
  I('brick',       'Brick',         { desc: 'Fired clay block.' }),
  I('cloth',       'Cloth',         { desc: 'Woven from fiber.' }),
  I('leather',     'Leather',       { desc: 'Cured hide.', value: 6 }),
  I('pelt',        'Wolf Pelt',     { desc: 'Thick winter fur.', value: 10 }),
  I('gel',         'Slime Gel',     { desc: 'Unsettlingly warm.', value: 3 }),
  I('wing',        'Bat Wing',      { desc: 'Leathery and thin.', value: 4 }),
  I('essence',     'Wisp Essence',  { desc: 'A trapped mote of light.', value: 18 }),
  I('shadow',      'Shadow Essence',{ desc: 'It drinks the light around it.', value: 25 }),
  I('moon_heart',  'Moon Heart',    { desc: 'It beats slowly. It is not yours.',
                                      value: 200, kind: 'quest', stack: 1 }),
  I('coin',        'Coin',          { desc: 'Stamped with a forgotten king.', value: 1 }),

  // ── food ──────────────────────────────────────────────────────
  I('berry',       'Berries',       { kind: 'food', food: { heal: 3, energy: 8 } }),
  I('mushroom',    'Mushroom',      { kind: 'food', food: { heal: 2, energy: 6 } }),
  I('glowcap',     'Glowcap',       { kind: 'food', food: { heal: 1, energy: 14 },
                                      light: [0.35, 0.9, 0.75], lightStrength: 4,
                                      desc: 'Faintly luminous. Faintly edible.' }),
  I('coconut',     'Coconut',       { kind: 'food', food: { heal: 5, energy: 12 } }),
  I('cactus_flesh','Cactus Flesh',  { kind: 'food', food: { heal: 2, energy: 10 } }),
  I('carrot',      'Carrot',        { kind: 'food', food: { heal: 4, energy: 10 } }),
  I('wheat',       'Wheat',         { desc: 'Grind it, or plant it again.' }),
  I('bread',       'Bread',         { kind: 'food', food: { heal: 12, energy: 30 } }),
  I('meat',        'Raw Meat',      { kind: 'food', food: { heal: 2, energy: 8 } }),
  I('meat_cooked', 'Cooked Meat',   { kind: 'food', food: { heal: 16, energy: 26 } }),
  I('stew',        'Forest Stew',   { kind: 'food', stack: 10,
                                      food: { heal: 28, energy: 50 },
                                      desc: 'Warm enough to fight the night off.' }),
  I('moonbloom',   'Moonbloom',     { kind: 'food', food: { heal: 8, energy: 20 },
                                      light: [0.5, 0.65, 1], lightStrength: 3 }),

  // ── seeds ─────────────────────────────────────────────────────
  I('seed_wheat',  'Wheat Seeds',   { kind: 'seed', plants: 'crop_wheat_0' }),
  I('seed_carrot', 'Carrot Seeds',  { kind: 'seed', plants: 'crop_carrot_0' }),
  I('seed_moon',   'Moonbloom Seeds',{ kind: 'seed', plants: 'crop_moon_0',
                                      desc: 'Only opens under a night sky.' }),

  // ── light sources (the point of the game) ─────────────────────
  I('torch',       'Torch',         { kind: 'light', stack: 30, places: 'torch',
                                      light: [1, 0.72, 0.36], lightStrength: 8,
                                      desc: 'Hold it to see. Plant it to remember the way.' }),
  I('lantern',     'Lantern',       { kind: 'light', stack: 5, places: 'lantern',
                                      light: [1, 0.85, 0.6], lightStrength: 12,
                                      desc: 'Steady where a torch gutters.' }),

  // ── placeable blocks ──────────────────────────────────────────
  I('wall_wood',   'Wood Wall',     { kind: 'block', places: 'wall_wood' }),
  I('wall_stone',  'Stone Wall',    { kind: 'block', places: 'wall_stone' }),
  I('wall_brick',  'Brick Wall',    { kind: 'block', places: 'wall_brick' }),
  I('plank_floor', 'Wood Floor',    { kind: 'block', places: 'plank', ground: true }),
  I('stone_floor', 'Stone Floor',   { kind: 'block', places: 'stone_floor', ground: true }),
  I('brick_floor', 'Brick Floor',   { kind: 'block', places: 'brick_floor', ground: true }),
  I('path',        'Gravel Path',   { kind: 'block', places: 'path', ground: true,
                                      desc: 'Walk faster on your own roads.' }),
  I('door',        'Door',          { kind: 'block', stack: 10, places: 'door' }),
  I('fence',       'Fence',         { kind: 'block', places: 'fence' }),
  I('sign',        'Signpost',      { kind: 'block', stack: 10, places: 'sign' }),
  I('chest',       'Chest',         { kind: 'block', stack: 10, places: 'chest' }),
  I('bed',         'Bedroll',       { kind: 'block', stack: 5, places: 'bed',
                                      desc: 'Sleep through the dark. Sets your waking place.' }),
  I('campfire',    'Campfire',      { kind: 'block', stack: 10, places: 'campfire',
                                      desc: 'Cooks, warms, and keeps things at bay.' }),
  I('workbench',   'Workbench',     { kind: 'block', stack: 5, places: 'workbench' }),
  I('furnace',     'Furnace',       { kind: 'block', stack: 5, places: 'furnace' }),
  I('anvil',       'Anvil',         { kind: 'block', stack: 5, places: 'anvil' }),

  // ── tools ─────────────────────────────────────────────────────
  I('wood_pick',   'Wooden Pick',   { kind: 'tool', stack: 1,
                                      tool: { type: 'pick', tier: 1, power: 1.0, durability: 60 },
                                      weapon: { damage: 2, speed: 0.5, reach: 22 } }),
  I('stone_pick',  'Stone Pick',    { kind: 'tool', stack: 1,
                                      tool: { type: 'pick', tier: 1, power: 1.7, durability: 140 },
                                      weapon: { damage: 3, speed: 0.5, reach: 22 } }),
  I('copper_pick', 'Copper Pick',   { kind: 'tool', stack: 1,
                                      tool: { type: 'pick', tier: 2, power: 2.4, durability: 260 },
                                      weapon: { damage: 4, speed: 0.45, reach: 22 } }),
  I('iron_pick',   'Iron Pick',     { kind: 'tool', stack: 1,
                                      tool: { type: 'pick', tier: 3, power: 3.2, durability: 460 },
                                      weapon: { damage: 5, speed: 0.45, reach: 24 } }),
  I('moon_pick',   'Moonstone Pick',{ kind: 'tool', stack: 1,
                                      tool: { type: 'pick', tier: 4, power: 4.4, durability: 900 },
                                      weapon: { damage: 7, speed: 0.4, reach: 24 },
                                      light: [0.4, 0.6, 1], lightStrength: 4 }),
  I('wood_axe',    'Wooden Axe',    { kind: 'tool', stack: 1,
                                      tool: { type: 'axe', tier: 1, power: 1.2, durability: 60 },
                                      weapon: { damage: 3, speed: 0.55, reach: 22 } }),
  I('stone_axe',   'Stone Axe',     { kind: 'tool', stack: 1,
                                      tool: { type: 'axe', tier: 1, power: 2.0, durability: 150 },
                                      weapon: { damage: 4, speed: 0.55, reach: 22 } }),
  I('iron_axe',    'Iron Axe',      { kind: 'tool', stack: 1,
                                      tool: { type: 'axe', tier: 3, power: 3.4, durability: 480 },
                                      weapon: { damage: 6, speed: 0.5, reach: 24 } }),
  I('moon_axe',    'Moonstone Axe', { kind: 'tool', stack: 1,
                                      tool: { type: 'axe', tier: 4, power: 4.8, durability: 950 },
                                      weapon: { damage: 8, speed: 0.45, reach: 24 },
                                      light: [0.4, 0.6, 1], lightStrength: 4 }),
  I('stone_hoe',   'Hoe',           { kind: 'tool', stack: 1,
                                      tool: { type: 'hoe', tier: 1, power: 1, durability: 200 },
                                      weapon: { damage: 2, speed: 0.6, reach: 20 },
                                      desc: 'Turns soil into farmland.' }),
  I('bucket',      'Bucket',        { kind: 'tool', stack: 1, desc: 'Carries water to dry soil.',
                                      tool: { type: 'bucket', tier: 1, power: 1, durability: 999 } }),

  // ── weapons ───────────────────────────────────────────────────
  I('wood_sword',  'Wooden Sword',  { kind: 'weapon', stack: 1,
                                      tool: { type: 'sword', tier: 0, power: 0.6, durability: 90 },
                                      weapon: { damage: 5, speed: 0.36, reach: 26, knockback: 90 } }),
  I('stone_sword', 'Stone Sword',   { kind: 'weapon', stack: 1,
                                      tool: { type: 'sword', tier: 0, power: 0.6, durability: 180 },
                                      weapon: { damage: 8, speed: 0.36, reach: 26, knockback: 110 } }),
  I('copper_sword','Copper Sword',  { kind: 'weapon', stack: 1,
                                      tool: { type: 'sword', tier: 0, power: 0.6, durability: 300 },
                                      weapon: { damage: 12, speed: 0.33, reach: 28, knockback: 130 } }),
  I('iron_sword',  'Iron Sword',    { kind: 'weapon', stack: 1,
                                      tool: { type: 'sword', tier: 0, power: 0.6, durability: 520 },
                                      weapon: { damage: 18, speed: 0.3, reach: 30, knockback: 150 } }),
  I('moon_sword',  'Moonblade',     { kind: 'weapon', stack: 1,
                                      tool: { type: 'sword', tier: 0, power: 0.6, durability: 1200 },
                                      weapon: { damage: 28, speed: 0.26, reach: 32, knockback: 190 },
                                      light: [0.5, 0.7, 1], lightStrength: 6,
                                      desc: 'It remembers every dark it has cut.' }),
  I('bow',         'Shortbow',      { kind: 'weapon', stack: 1,
                                      tool: { type: 'bow', tier: 0, power: 0.6, durability: 260 },
                                      weapon: { damage: 9, speed: 0.55, reach: 150, ranged: true,
                                                ammo: 'arrow', knockback: 70 } }),
  I('arrow',       'Arrow',         { stack: 99, desc: 'Fletched with wisp-down.' }),

  // ── armor (one slot; simple and readable) ─────────────────────
  I('cloth_tunic', 'Cloth Tunic',   { kind: 'armor', stack: 1, armor: { defense: 1, speed: 0 } }),
  I('leather_vest','Leather Vest',  { kind: 'armor', stack: 1, armor: { defense: 3, speed: 0 } }),
  I('chain_mail',  'Chainmail',     { kind: 'armor', stack: 1, armor: { defense: 6, speed: -0.05 } }),
  I('moon_plate',  'Moonplate',     { kind: 'armor', stack: 1,
                                      armor: { defense: 11, speed: -0.03 },
                                      light: [0.4, 0.55, 0.9], lightStrength: 4,
                                      desc: 'Faintly lit from within.' }),

  // ── potions ───────────────────────────────────────────────────
  I('potion_heal', 'Salve',         { kind: 'potion', stack: 10,
                                      potion: { heal: 40 }, desc: 'Closes what is open.' }),
  I('potion_energy','Tonic',        { kind: 'potion', stack: 10,
                                      potion: { energy: 70 }, desc: 'Legs remember how to run.' }),
  I('potion_sight','Nightsight',    { kind: 'potion', stack: 10,
                                      potion: { effect: 'nightsight', duration: 120 },
                                      desc: 'The dark thins for a while.' }),
  I('potion_swift','Swiftness',     { kind: 'potion', stack: 10,
                                      potion: { effect: 'swift', duration: 90 },
                                      desc: 'Two strides for every one.' }),
]);

export function item(id) { return ITEMS[id]; }
export function label(id) { return ITEMS[id]?.label ?? id; }
export function maxStack(id) { return ITEMS[id]?.stack ?? 99; }

/** Light emitted by a held item, or null. */
export function itemLight(id) {
  const it = ITEMS[id];
  return it?.light ? { rgb: it.light, strength: it.lightStrength ?? 6 } : null;
}
