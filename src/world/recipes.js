// Crafting graph. `station` null means craftable bare-handed anywhere.
// Order within a category is the order players see, so it doubles as the
// intended progression.

const R = (out, count, cost, station = null, category = 'Basics', extra = {}) =>
  ({ out, count, cost, station, category, ...extra });

export const RECIPES = [
  // ── bare hands ────────────────────────────────────────────────
  R('stick',       4, [['wood', 1]],                          null, 'Basics'),
  R('fiber',       2, [['wood', 1]],                          null, 'Basics'),
  R('torch',       2, [['stick', 1], ['fiber', 1]],           null, 'Basics'),
  R('torch',       5, [['stick', 1], ['coal', 1]],            null, 'Basics'),
  R('workbench',   1, [['wood', 8]],                          null, 'Basics'),
  R('campfire',    1, [['wood', 5], ['stone', 3]],            null, 'Basics'),
  R('cloth',       1, [['fiber', 3]],                         null, 'Basics'),

  // ── workbench ─────────────────────────────────────────────────
  R('wood_pick',   1, [['wood', 3], ['stick', 2]],            'workbench', 'Tools'),
  R('wood_axe',    1, [['wood', 3], ['stick', 2]],            'workbench', 'Tools'),
  R('stone_pick',  1, [['stone', 3], ['stick', 2]],           'workbench', 'Tools'),
  R('stone_axe',   1, [['stone', 3], ['stick', 2]],           'workbench', 'Tools'),
  R('stone_hoe',   1, [['stone', 2], ['stick', 2]],           'workbench', 'Tools'),
  R('bucket',      1, [['iron_bar', 3]],                      'workbench', 'Tools'),
  R('lantern',     1, [['iron_bar', 2], ['essence', 1], ['stick', 1]], 'workbench', 'Tools'),

  R('wood_sword',  1, [['wood', 2], ['stick', 1]],            'workbench', 'Weapons'),
  R('stone_sword', 1, [['stone', 3], ['stick', 1]],           'workbench', 'Weapons'),
  R('bow',         1, [['wood', 3], ['fiber', 3]],            'workbench', 'Weapons'),
  R('arrow',       4, [['stick', 1], ['flint', 1]],           'workbench', 'Weapons'),

  R('furnace',     1, [['stone', 12]],                        'workbench', 'Building'),
  R('anvil',       1, [['iron_bar', 5], ['stone', 4]],        'workbench', 'Building'),
  R('chest',       1, [['wood', 6]],                          'workbench', 'Building'),
  R('door',        1, [['wood', 5]],                          'workbench', 'Building'),
  R('fence',       3, [['wood', 2], ['stick', 2]],            'workbench', 'Building'),
  R('sign',        1, [['wood', 2], ['stick', 1]],            'workbench', 'Building'),
  R('bed',         1, [['cloth', 4], ['wood', 3]],            'workbench', 'Building'),
  R('wall_wood',   4, [['wood', 3]],                          'workbench', 'Building'),
  R('wall_stone',  4, [['stone', 4]],                         'workbench', 'Building'),
  R('wall_brick',  4, [['brick', 4]],                         'workbench', 'Building'),
  R('plank_floor', 4, [['wood', 2]],                          'workbench', 'Building'),
  R('stone_floor', 4, [['stone', 2]],                         'workbench', 'Building'),
  R('brick_floor', 4, [['brick', 2]],                         'workbench', 'Building'),
  R('path',        6, [['stone', 1], ['dirtish', 0]],         'workbench', 'Building'),

  // ── furnace ───────────────────────────────────────────────────
  R('coal',        2, [['wood', 4]],                          'furnace', 'Smelting'),
  R('copper_bar',  1, [['copper_ore', 2], ['coal', 1]],       'furnace', 'Smelting'),
  R('iron_bar',    1, [['iron_ore', 2], ['coal', 1]],         'furnace', 'Smelting'),
  R('gold_bar',    1, [['gold_ore', 2], ['coal', 1]],         'furnace', 'Smelting'),
  R('brick',       2, [['stone', 2], ['coal', 1]],            'furnace', 'Smelting'),

  // ── campfire ──────────────────────────────────────────────────
  R('coal',        1, [['wood', 4]],                          'campfire', 'Cooking'),
  R('meat_cooked', 1, [['meat', 1]],                          'campfire', 'Cooking'),
  R('bread',       1, [['wheat', 3]],                         'campfire', 'Cooking'),
  R('stew',        1, [['meat_cooked', 1], ['mushroom', 1], ['carrot', 1], ['berry', 2]],
                                                              'campfire', 'Cooking'),
  R('potion_heal', 1, [['petal', 2], ['mushroom', 1], ['fiber', 1]],   'campfire', 'Alchemy'),
  R('potion_energy',1,[['berry', 3], ['glowcap', 1]],                  'campfire', 'Alchemy'),
  R('potion_sight',1, [['glowcap', 2], ['essence', 1]],                'campfire', 'Alchemy'),
  R('potion_swift',1, [['moonbloom', 1], ['essence', 1], ['petal', 2]],'campfire', 'Alchemy'),

  // ── anvil ─────────────────────────────────────────────────────
  R('copper_pick', 1, [['copper_bar', 3], ['stick', 2]],      'anvil', 'Tools'),
  R('iron_pick',   1, [['iron_bar', 3], ['stick', 2]],        'anvil', 'Tools'),
  R('iron_axe',    1, [['iron_bar', 3], ['stick', 2]],        'anvil', 'Tools'),
  R('copper_sword',1, [['copper_bar', 3], ['stick', 1]],      'anvil', 'Weapons'),
  R('iron_sword',  1, [['iron_bar', 4], ['stick', 1], ['leather', 1]], 'anvil', 'Weapons'),
  R('cloth_tunic', 1, [['cloth', 4]],                         'anvil', 'Armor'),
  R('leather_vest',1, [['leather', 5], ['cloth', 2]],         'anvil', 'Armor'),
  R('chain_mail',  1, [['iron_bar', 6], ['leather', 2]],      'anvil', 'Armor'),

  // ── moonstone tier: revealed once you actually hold moonstone ──
  R('moon_pick',   1, [['moonstone', 3], ['iron_bar', 2], ['stick', 2]],
                      'anvil', 'Tools',   { requires: 'moonstone' }),
  R('moon_axe',    1, [['moonstone', 3], ['iron_bar', 2], ['stick', 2]],
                      'anvil', 'Tools',   { requires: 'moonstone' }),
  R('moon_sword',  1, [['moonstone', 5], ['iron_bar', 2], ['essence', 2], ['stick', 1]],
                      'anvil', 'Weapons', { requires: 'moonstone' }),
  R('moon_plate',  1, [['moonstone', 6], ['iron_bar', 3], ['essence', 1]],
                      'anvil', 'Armor',   { requires: 'moonstone' }),
];

// The dummy cost entry above was a placeholder; strip zero-count costs so the
// UI never renders "0 ×" rows.
for (const r of RECIPES) r.cost = r.cost.filter(([, n]) => n > 0);

export const CATEGORIES = ['Basics', 'Tools', 'Weapons', 'Building', 'Smelting', 'Cooking', 'Alchemy', 'Armor'];

/** Recipes available at a station (null = the player's own hands). */
export function recipesFor(station) {
  return RECIPES.filter((r) => r.station === station);
}

/** Every station a recipe list can come from, in menu order. */
export const STATIONS = [null, 'workbench', 'furnace', 'campfire', 'anvil'];
