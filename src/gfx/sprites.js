// Character and item art.
//
// Humanoids are assembled from a shared rig — one body per facing plus a set of
// leg frames — so the player, every NPC role and the bandits are all the same
// twelve lines of art wearing different palettes.

import { makeCanvas, drawArt, flipH } from './pixel.js';
import { ITEMS } from '../world/items.js';
import { byName } from '../world/tiles.js';
import { objectCanvas } from './tileart.js';

export const CHAR_W = 12;
export const CHAR_H = 16;

// H hair · K skin · S shirt · P pants · B boots · A accent · E eye · d ink
const BODY = {
  down: [
    '....HHHH....',
    '...HHHHHH...',
    '..HHHHHHHH..',
    '..HKKKKKKH..',
    '..HKEKKEKH..',
    '..HKKKKKKH..',
    '..HKKddKKH..',
    '...KKKKKK...',
    '..ASSSSSSA..',
    '.KSSSSSSSSK.',
    '.KSSSSSSSSK.',
    '..SSSSSSSS..',
  ],
  up: [
    '....HHHH....',
    '...HHHHHH...',
    '..HHHHHHHH..',
    '..HHHHHHHH..',
    '..HHHHHHHH..',
    '..HHHHHHHH..',
    '..HHHHHHHH..',
    '...HHHHHH...',
    '..ASSSSSSA..',
    '.KSSSSSSSSK.',
    '.KSSSSSSSSK.',
    '..SSSSSSSS..',
  ],
  side: [
    '...HHHHH....',
    '..HHHHHHH...',
    '..HHHKKKK...',
    '..HHKKEKK...',
    '..HHKKKKK...',
    '...HKKKKd...',
    '...HKKKKK...',
    '....KKKK....',
    '...ASSSSA...',
    '...SSSSSK...',
    '...SSSSSK...',
    '...SSSSS....',
  ],
};

// Four-frame walk cycle: 0 and 2 are the passing pose, 1 and 3 the strides.
const LEGS = {
  front: [
    ['..PPPPPPPP..', '..PPP..PPP..', '..PPP..PPP..', '..BBB..BBB..'],
    ['..PPPPPPPP..', '..PPPP.PPP..', '..PPP...PP..', '..BBB...BB..'],
    ['..PPPPPPPP..', '..PPP..PPP..', '..PPP..PPP..', '..BBB..BBB..'],
    ['..PPPPPPPP..', '..PPP.PPPP..', '..PP...PPP..', '..BB...BBB..'],
  ],
  side: [
    ['...PPPPP....', '...PPPPP....', '...PP.PP....', '...BB.BB....'],
    ['...PPPPP....', '...PPPPP....', '..PPP..P....', '..BBB..BB...'],
    ['...PPPPP....', '...PPPPP....', '...PP.PP....', '...BB.BB....'],
    ['...PPPPP....', '...PPPPP....', '...P..PPP...', '...BB..BBB..'],
  ],
};

/**
 * Builds the full directional frame set for one character skin.
 * @returns {{down:HTMLCanvasElement[],up:*,left:*,right:*}}
 */
export function humanoid(skin) {
  const map = {
    H: skin.hair, K: skin.skin, S: skin.shirt, P: skin.pants,
    B: skin.boots ?? 'bark0', A: skin.accent ?? skin.shirt, E: skin.eye ?? 'ink', d: 'ink',
  };
  const make = (bodyKey, legKey) => LEGS[legKey].map((legs) => {
    const { canvas, ctx } = makeCanvas(CHAR_W, CHAR_H);
    drawArt(ctx, BODY[bodyKey], map, 0, 0, 1);
    drawArt(ctx, legs, map, 0, 12, 1);
    return canvas;
  });
  const right = make('side', 'side');
  return {
    down: make('down', 'front'),
    up: make('up', 'front'),
    right,
    left: right.map(flipH),
  };
}

/** Palettes for the cast. Each is a full outfit, not a hue shift. */
export const SKINS = {
  player:  { hair: 'dirt2',   skin: 'flesh2', shirt: 'green2',  pants: 'dirt1',  accent: 'gold2', boots: 'bark0' },
  elder:   { hair: 'bone3',   skin: 'flesh1', shirt: 'arc2',    pants: 'slate2', accent: 'gold2' },
  smith:   { hair: 'ember1',  skin: 'flesh1', shirt: 'iron1',   pants: 'bark1',  accent: 'copper2' },
  farmer:  { hair: 'gold1',   skin: 'flesh2', shirt: 'olive',   pants: 'dirt2',  accent: 'green4' },
  hunter:  { hair: 'bark0',   skin: 'flesh1', shirt: 'green1',  pants: 'bark1',  accent: 'moss' },
  trader:  { hair: 'slate3',  skin: 'flesh3', shirt: 'rose1',   pants: 'arc1',   accent: 'gold3' },
  child:   { hair: 'gold2',   skin: 'flesh3', shirt: 'cyan1',   pants: 'water1', accent: 'cyan3' },
  guard:   { hair: 'slate2',  skin: 'flesh1', shirt: 'iron2',   pants: 'iron0',  accent: 'water3' },
  hermit:  { hair: 'bone2',   skin: 'flesh0', shirt: 'bark1',   pants: 'bark0',  accent: 'moss' },
  bandit:  { hair: 'ink',     skin: 'flesh0', shirt: 'blood0',  pants: 'slate0', accent: 'blood2', eye: 'fire2' },
  skeleton:{ hair: 'bone3',   skin: 'bone3',  shirt: 'slate1',  pants: 'slate0', accent: 'bone1', eye: 'fire1' },
};

// ── non-humanoid mobs ────────────────────────────────────────────
// Codes here are local to each drawing for readability.
const MOB_M = {
  g: 'toxic0', G: 'toxic1', h: 'toxic2', e: 'ink', E: 'white',
  d: 'slate0', D: 'slate2', z: 'slate4', Z: 'slate5',
  b: 'bark0', B: 'bark1', f: 'flesh0', F: 'flesh1',
  c: 'cyan1', C: 'cyan2', x: 'cyan3', a: 'arc1', A: 'arc2', v: 'arc3', V: 'arc4',
  o: 'bone1', O: 'bone3', r: 'blood1', R: 'blood2',
  i: 'iron1', I: 'iron2', y: 'fire1', Y: 'fire2', w: 'fire3',
  s: 'stone1', S: 'stone3',
};

const MOBS = {
  slime: [[
    '............', '............', '...gggggg...', '..gGGGGGGg..',
    '.gGGhhGGhGg.', '.gGhEeGhEeg.', 'gGGGGGGGGGGg', 'gGGGGGGGGGGg',
    '.gGGGGGGGGg.', '..gggggggg..', '............', '............',
  ], [
    '............', '...gggggg...', '..gGGGGGGg..', '.gGGhhGGhGg.',
    '.gGhEeGhEeg.', 'gGGGGGGGGGGg', 'gGGGGGGGGGGg', 'gGGGGGGGGGGg',
    '.gGGGGGGGGg.', '..gggggggg..', '............', '............',
  ], [
    '............', '............', '............', '...gggggg...',
    '..gGhhGGhg..', '.gGhEeGhEeg.', 'gGGGGGGGGGGg', 'gGGGGGGGGGGg',
    'gGGGGGGGGGGg', '.gggggggggg.', '............', '............',
  ]],
  bat: [[
    '............', '..d......d..', '.dDd....dDd.', '.dDDd..dDDd.',
    'dDDDDddDDDDd', 'dDDDDDDDDDDd', '.dDyDDDDyDd.', '..dDDDDDDd..',
    '...dDDDDd...', '....dDDd....', '.....dd.....', '............',
  ], [
    '............', '............', 'dd........dd', 'dDDd....dDDd',
    '.dDDdd..dDd.', '..dDDDDDDd..', '..dDyDDyDd..', '...dDDDDd...',
    '....dDDd....', '.....dd.....', '............', '............',
  ], [
    '............', '............', '............', '..dd....dd..',
    '..dDDd..dDd.', '...dDDDDDd..', '...dDyDDyd..', '....dDDDd...',
    '.....dDd....', '.....dd.....', '............', '............',
  ]],
  wolf: [[
    '............', '..dd........', '.dDDd...dd..', '.dDzDddddDd.',
    'dDzyzDDDDDDd', 'dDzzzDDDDDDd', '.dDDDDDDDDd.', '..dD.DD.Dd..',
    '..dD.DD.Dd..', '..dd.dd.dd..', '............', '............',
  ], [
    '............', '..dd........', '.dDDd...dd..', '.dDzDddddDd.',
    'dDzyzDDDDDDd', 'dDzzzDDDDDDd', '.dDDDDDDDDd.', '.dD..DDD..Dd',
    '.dD...DD...D', '.dd...dd...d', '............', '............',
  ], [
    '............', '..dd........', '.dDDd...dd..', '.dDzDddddDd.',
    'dDzyzDDDDDDd', 'dDzzzDDDDDDd', '.dDDDDDDDDd.', '..dD.DD.Dd..',
    '..dD.DD.Dd..', '..dd.dd.dd..', '............', '............',
  ], [
    '............', '..dd........', '.dDDd...dd..', '.dDzDddddDd.',
    'dDzyzDDDDDDd', 'dDzzzDDDDDDd', '.dDDDDDDDDd.', 'dD..DDD...Dd',
    'D...DD.....D', 'd...dd.....d', '............', '............',
  ]],
  wisp: [[
    '............', '.....cc.....', '...ccxxcc...', '..cxxEExxc..',
    '..cxEEEExc..', '..cxxEExxc..', '...ccxxcc...', '.....cc.....',
    '............', '............', '............', '............',
  ], [
    '............', '....cccc....', '..ccxxxxcc..', '.cxxEEEExxc.',
    '.cxEEEEEExc.', '.cxxEEEExxc.', '..ccxxxxcc..', '....cccc....',
    '............', '............', '............', '............',
  ], [
    '............', '.....cc.....', '....cxxc....', '...cxEExc...',
    '...cxEExc...', '....cxxc....', '.....cc.....', '............',
    '............', '............', '............', '............',
  ]],
  shade: [[
    '............', '....aaaa....', '...aAAAAa...', '..aAvyyvAa..',
    '..aAvyyvAa..', '..aAAAAAAa..', '.aAAAAAAAAa.', '.aAAAAAAAAa.',
    '..aaAAAAaa..', '...a.aa.a...', '....a..a....', '............',
  ], [
    '............', '...aaaaa....', '..aAAAAAa...', '..aAvyyvAa..',
    '.aAvyyvAAa..', '.aAAAAAAAa..', 'aAAAAAAAAAa.', '.aAAAAAAAa..',
    '..aaAAAAa...', '..a..aa..a..', '...a....a...', '............',
  ], [
    '............', '....aaaa....', '...aAAAAa...', '..aAvyyvAa..',
    '..aAvyyvAa..', '..aAAAAAAa..', '.aAAAAAAAAa.', '..aAAAAAAa..',
    '...aAAAAa...', '....aaaa....', '.....aa.....', '............',
  ]],
};

/** Boss: bigger canvas, drawn separately so it reads as a threat. */
const SHADE_LORD = [[
  '....aaaaaaaa....', '..aaAAAAAAAAaa..', '.aAAAAAAAAAAAAa.', '.aAAvwwAAwwvAAa.',
  'aAAAvyyAAyyvAAAa', 'aAAAAAAAAAAAAAAa', 'aAAAAAAvvAAAAAAa', 'aAAAAAvVVvAAAAAa',
  'aAAAAAvVVvAAAAAa', 'aAAAAAAvvAAAAAAa', '.aAAAAAAAAAAAAa.', '.aaAAAAAAAAAAaa.',
  '..aaAAAAAAAAaa..', '...aa.aaaa.aa...', '....a.a..a.a....', '......a..a......',
], [
  '...aaaaaaaaaa...', '.aaAAAAAAAAAAaa.', 'aAAAAAAAAAAAAAAa', 'aAAvwwAAAAwwvAAa',
  'aAAAvyyAAyyvAAAa', 'aAAAAAAAAAAAAAAa', 'aAAAAAvvvvAAAAAa', 'aAAAAvVVVVvAAAAa',
  'aAAAAvVVVVvAAAAa', 'aAAAAAvvvvAAAAAa', 'aAAAAAAAAAAAAAAa', '.aaAAAAAAAAAAaa.',
  '..aaAAAAAAAAaa..', '...a.aa..aa.a...', '..a..a....a..a..', '.....a....a.....',
]];

const mobCache = new Map();

export function buildSprites() {
  if (mobCache.size) return;
  for (const [name, frames] of Object.entries(MOBS)) {
    const list = frames.map((art) => {
      const { canvas, ctx } = makeCanvas(12, 12);
      drawArt(ctx, art, MOB_M, 0, 0, 1);
      return canvas;
    });
    mobCache.set(name, { right: list, left: list.map(flipH), w: 12, h: 12 });
  }
  const boss = SHADE_LORD.map((art) => {
    const { canvas, ctx } = makeCanvas(16, 16);
    drawArt(ctx, art, MOB_M, 0, 0, 1);
    return canvas;
  });
  mobCache.set('shade_lord', { right: boss, left: boss.map(flipH), w: 16, h: 16 });

  for (const [role, skin] of Object.entries(SKINS)) {
    humanCache.set(role, humanoid(skin));
  }
}

const humanCache = new Map();
export const mobSprite = (name) => mobCache.get(name) || null;
export const humanSprite = (role) => humanCache.get(role) || humanCache.get('player');

// ── item icons ───────────────────────────────────────────────────
// Rather than draw 88 icons, we draw a dozen archetype shapes and recolour
// them. A = primary, B = highlight, C = shadow, D = detail, h/H = handle.
export const ICON = 16;

const SHAPES = {
  sword: [
    '............BB..', '...........ABB..', '..........AABC..', '.........AABC...',
    '........AABC....', '.......AABC.....', '......AABC......', '.....AABC.......',
    '....AABC........', '...DAAC.........', '..DDDC..........', '.DDhDD..........',
    '..hh............', '.hh.............', 'hh..............', '................',
  ],
  pick: [
    '................', '..BBB......BBB..', '.BAAAB....BAAAB.', '.BAAAAB..BAAAAB.',
    '..CAAAABBAAAAC..', '...CAAAAAAAAC...', '.....CAAAAC.....', '......hHhH......',
    '......hH........', '.....hH.........', '.....hH.........', '....hH..........',
    '....hH..........', '...hH...........', '...hH...........', '................',
  ],
  axe: [
    '................', '.....BBBB.......', '....BAAAAB......', '...BAAAAAAC.....',
    '...BAAAAAACh....', '....AAAAAhH.....', '.....AAAhH......', '......ChH.......',
    '......hH........', '.....hH.........', '.....hH.........', '....hH..........',
    '....hH..........', '...hH...........', '...hH...........', '................',
  ],
  hoe: [
    '................', '...BBBBBBB......', '..BAAAAAAAB.....', '..CAAAAAAAC.....',
    '...CCCCCAAC.....', '.........hH.....', '........hH......', '.......hH.......',
    '.......hH.......', '......hH........', '......hH........', '.....hH.........',
    '.....hH.........', '....hH..........', '....hH..........', '................',
  ],
  bucket: [
    '................', '................', '...B......B.....', '...A......A.....',
    '..BAAAAAAAAB....', '..ACCCCCCCCA....', '..ACAAAAAACA....', '..ACAAAAAACA....',
    '..ACAAAAAACA....', '...CAAAAAAC.....', '...CAAAAAAC.....', '....CAAAAC......',
    '....BBBBBB......', '................', '................', '................',
  ],
  bow: [
    '................', '......hH........', '.....hH.C.......', '....hH...C......',
    '....h....C......', '...hH....C......', '...h.....C......', '...h.....C......',
    '...h.....C......', '...hH....C......', '....h....C......', '....hH...C......',
    '.....hH.C.......', '......hH........', '................', '................',
  ],
  arrow: [
    '................', '...........BAB..', '..........BAAB..', '.........BAAC...',
    '........hHAC....', '.......hH.C.....', '......hH........', '.....hH.........',
    '....hH..........', '...hH...........', '..hHD...........', '.hHDD...........',
    'DDD.D...........', 'DD..............', '.D..............', '................',
  ],
  ore: [
    '................', '................', '.....CCCC.......', '....CAABAC......',
    '...CAABBAAC.....', '..CAABBBAAAC....', '..CAAABAAAAC....', '.CAAAAAAABAC....',
    '.CAABAAAAAAC....', '.CAAAAABAAAC....', '..CAAAAAAAC.....', '..CCAAAACC......',
    '....CCCC........', '................', '................', '................',
  ],
  bar: [
    '................', '................', '................', '....BBBBBBBB....',
    '...BAAAAAAAAB...', '..BAAAAAAAAAAB..', '..CAAAAAAAAAAC..', '..CAAAAAAAAAAC..',
    '..CCAAAAAAAACC..', '...CCCCCCCCCC...', '................', '................',
    '................', '................', '................', '................',
  ],
  gem: [
    '................', '................', '......BB........', '.....BAAB.......',
    '....BAAAAB......', '...BAAABAAB.....', '..BAAABBAAAB....', '..CAAABAAAAC....',
    '...CAAAAAAC.....', '....CAAAAC......', '.....CAAC.......', '......CC........',
    '................', '................', '................', '................',
  ],
  potion: [
    '................', '......CC........', '......hh........', '......hh........',
    '.....CCCC.......', '....CAAAAC......', '...CABAABAC.....', '..CAABAAAAAC....',
    '..CAAAAAAAAC....', '..CAAAABAAAC....', '..CAAAAAAAAC....', '..CCAAAAAACC....',
    '...CCCCCCCC.....', '................', '................', '................',
  ],
  seed: [
    '................', '................', '................', '.....BA..AB.....',
    '....BAAC.CAAB...', '....AAAC.CAAA...', '.....CC...CC....', '..BA......AB....',
    '.BAAC......CAA..', '.AAAC.BA...CA...', '..CC.BAAC.......', '.....AAAC.......',
    '......CC........', '................', '................', '................',
  ],
  armor: [
    '................', '...BB......BB...', '..BAAB....BAAB..', '.BAAAABBBBAAAAB.',
    '.AAAAAAAAAAAAAA.', '.CAAAAAAAAAAAAC.', '..CAAAAAAAAAAC..', '...CAAAAAAAAC...',
    '...CAADAADAAC...', '...CAAAAAAAAC...', '...CAAAAAAAAC...', '...CAAAAAAAAC...',
    '...CCAAAAAACC...', '.....CCCCCC.....', '................', '................',
  ],
  pouch: [
    '................', '................', '......CC........', '.....CAAC.......',
    '....CAAAAC......', '...CAABBAAC.....', '..CAAABBAAAC....', '..CAAAAAAAAC....',
    '..CAAAAAAAAC....', '..CAAABBAAAC....', '..CCAAAAAACC....', '....CCCCCC......',
    '................', '................', '................', '................',
  ],
  leaf: [
    '................', '................', '..........BB....', '........BBAAB...',
    '......BBAAAAAB..', '....BBAAAADAAB..', '..BBAAAADAAAAB..', '.BAAAADAAAAAB...',
    '.BAAADAAAAAB....', '.BAADAAAAAB.....', '.BADAAAAB.......', '.BCAAAB.........',
    '..CCB...........', '................', '................', '................',
  ],
  round: [
    '................', '................', '.....CCCC.......', '....CAABAC......',
    '...CAABBAAC.....', '..CAAABBAAAC....', '..CAAAAAAAAC....', '..CAAAAAAAAC....',
    '..CAAAAAAAAC....', '..CAAAAAAAAC....', '...CAAAAAAC.....', '....CCCCCC......',
    '................', '................', '................', '................',
  ],
  stick: [
    '................', '............BB..', '...........BAB..', '..........BAC...',
    '.........BAC....', '........BAC.....', '.......BAC......', '......BAC.......',
    '.....BAC........', '....BAC.........', '...BAC..........', '..BAC...........',
    '..CC............', '................', '................', '................',
  ],
  cap: [
    '................', '................', '......BBBB......', '....BBAAAABB....',
    '...BAAADAAAAB...', '..BAADDDAAAAAB..', '..CAAADAAADAAC..', '...CCAAAAAACC...',
    '.....DDDDDD.....', '......DDDD......', '......DDDD......', '......DDDD......',
    '.....DDDDDD.....', '......CCCC......', '................', '................',
  ],
  bowl: [
    '................', '................', '................', '...BBBBBBBBBB...',
    '..BAAAAAAAAAAB..', '..BADAAADAAAAB..', '..BAAAAAAADAAB..', '..CAAADAAAAAAC..',
    '...CAAAAAAAAC...', '....CCCCCCCC....', '.....CCCCCC.....', '................',
    '................', '................', '................', '................',
  ],
  meat: [
    '................', '................', '.......BB.......', '.....BBAABB.....',
    '...BBAAAAAABB...', '..BAAADAAAAAB...', '..AAADAAAAAAB...', '..AAAAAAAAAB....',
    '..CAAAAAAAB.....', '...CAAAAAB..EE..', '....CAAAB..EEE..', '.....CCC..EEE...',
    '..........EE....', '................', '................', '................',
  ],
  bread: [
    '................', '................', '.....BBBBB......', '...BBAAAAABB....',
    '..BAAADAAAADAB..', '.BAAAADAAAADAAB.', '.AAAAAAAAAAAAAA.', '.AAADAAAADAAAAA.',
    '.CAAAAAAAAAAAAC.', '..CAAAAAAAAAAC..', '...CCAAAAAACC...', '.....CCCCCC.....',
    '................', '................', '................', '................',
  ],
};

// [shape, primary, highlight, shadow, detail]
const ICONS = {
  wood:         ['bar', 'dirt3', 'dirt4', 'bark1', 'bark0'],
  stone:        ['ore', 'stone2', 'stone4', 'stone0'],
  stick:        ['stick', 'bark2', 'dirt3', 'bark0'],
  fiber:        ['leaf', 'moss', 'green4', 'green1', 'olive'],
  flint:        ['gem', 'slate3', 'slate5', 'slate0'],
  bone:         ['stick', 'bone2', 'bone3', 'bone0'],
  bark:         ['bar', 'bone2', 'bone3', 'bark1', 'ink'],
  petal:        ['leaf', 'rose2', 'rose3', 'rose1', 'gold3'],
  acorn:        ['round', 'dirt3', 'dirt4', 'bark0', 'bark1'],
  pinecone:     ['round', 'bark2', 'dirt3', 'bark0', 'dirt4'],
  copper_ore:   ['ore', 'stone2', 'copper2', 'stone0'],
  iron_ore:     ['ore', 'stone2', 'iron2', 'stone0'],
  gold_ore:     ['ore', 'stone2', 'gold2', 'stone0'],
  moonstone:    ['gem', 'cyan2', 'cyan3', 'cyan0'],
  crystal_shard:['gem', 'arc3', 'arc4', 'arc1'],
  coal:         ['ore', 'ink', 'slate2', 'void'],
  copper_bar:   ['bar', 'copper1', 'copper2', 'copper0'],
  iron_bar:     ['bar', 'iron1', 'iron3', 'iron0'],
  gold_bar:     ['bar', 'gold1', 'gold3', 'gold0'],
  brick:        ['bar', 'copper1', 'copper2', 'ember0'],
  cloth:        ['pouch', 'bone2', 'bone3', 'bone0'],
  leather:      ['pouch', 'dirt3', 'dirt4', 'dirt1'],
  pelt:         ['pouch', 'slate3', 'slate5', 'slate1'],
  gel:          ['round', 'toxic1', 'toxic2', 'toxic0'],
  wing:         ['leaf', 'slate2', 'slate4', 'slate0', 'ink'],
  essence:      ['gem', 'cyan1', 'cyan3', 'cyan0'],
  shadow:       ['gem', 'arc1', 'arc3', 'void'],
  moon_heart:   ['gem', 'arc2', 'arc4', 'arc0'],
  coin:         ['round', 'gold1', 'gold3', 'gold0'],

  berry:        ['round', 'blood2', 'rose2', 'blood0'],
  mushroom:     ['cap', 'blood1', 'blood2', 'blood0', 'bone2'],
  glowcap:      ['cap', 'cyan1', 'cyan3', 'cyan0', 'bone2'],
  coconut:      ['round', 'bark1', 'dirt3', 'bark0'],
  cactus_flesh: ['leaf', 'toxic1', 'toxic2', 'toxic0'],
  carrot:       ['leaf', 'fire1', 'fire2', 'ember1', 'green3'],
  wheat:        ['leaf', 'gold2', 'gold3', 'gold0', 'green3'],
  bread:        ['bread', 'dirt4', 'sand3', 'dirt2', 'dirt1'],
  meat:         ['meat', 'blood2', 'rose2', 'blood0', 'flesh1'],
  meat_cooked:  ['meat', 'dirt3', 'dirt4', 'dirt1', 'bark1'],
  stew:         ['bowl', 'dirt3', 'fire1', 'bark0', 'fire2'],
  moonbloom:    ['leaf', 'arc3', 'arc4', 'arc1', 'cyan3'],

  seed_wheat:   ['seed', 'gold2', 'gold3', 'gold0'],
  seed_carrot:  ['seed', 'fire1', 'fire2', 'ember1'],
  seed_moon:    ['seed', 'arc3', 'arc4', 'arc1'],

  cloth_tunic:  ['armor', 'bone2', 'bone3', 'bone0', 'dirt2'],
  leather_vest: ['armor', 'dirt3', 'dirt4', 'dirt1', 'bark0'],
  chain_mail:   ['armor', 'iron1', 'iron3', 'iron0', 'slate2'],
  moon_plate:   ['armor', 'cyan1', 'cyan3', 'cyan0', 'arc3'],

  potion_heal:  ['potion', 'blood2', 'rose3', 'blood0'],
  potion_energy:['potion', 'water3', 'water4', 'water1'],
  potion_sight: ['potion', 'cyan2', 'cyan3', 'cyan0'],
  potion_swift: ['potion', 'toxic1', 'toxic2', 'toxic0'],

  arrow:        ['arrow', 'iron2', 'iron3', 'iron0', 'bone2'],
  bow:          ['bow', 'bark2', 'dirt4', 'bark0'],
  bucket:       ['bucket', 'iron1', 'iron3', 'iron0'],
};

/** Tier palettes for the parametric tools and weapons. */
const TIER_METAL = {
  wood:  ['dirt3', 'dirt4', 'bark0'],
  stone: ['stone2', 'stone4', 'stone0'],
  copper:['copper1', 'copper2', 'copper0'],
  iron:  ['iron2', 'iron3', 'iron0'],
  gold:  ['gold2', 'gold3', 'gold0'],
  moon:  ['cyan2', 'cyan3', 'arc1'],
};

const iconCache = new Map();

function paintIcon(shapeName, [primary, highlight, shadow, detail]) {
  const { canvas, ctx } = makeCanvas(ICON, ICON);
  drawArt(ctx, SHAPES[shapeName], {
    A: primary, B: highlight ?? primary, C: shadow ?? primary, D: detail ?? shadow ?? primary,
    h: 'bark1', H: 'dirt3', E: 'bone1',
  }, 0, 0, 1);
  return canvas;
}

/** Icon for any item id. Blocks reuse their tile art so they always match. */
export function itemIcon(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  const it = ITEMS[id];
  let canvas = null;

  if (it?.places) {
    // Placeable: render the actual tile so the icon matches what you'll build.
    const tileDef = byName.get(it.places);
    const art = tileDef && objectCanvas(tileDef.id);
    if (art) {
      const c = makeCanvas(ICON, ICON);
      c.ctx.drawImage(art.canvas, (ICON - art.canvas.width) / 2 | 0,
                      ICON - art.canvas.height + (art.lift ? 2 : 1));
      canvas = c.canvas;
    }
  }

  if (!canvas && ICONS[id]) {
    const [shape, ...cols] = ICONS[id];
    canvas = paintIcon(shape, cols);
  }

  if (!canvas && it?.tool) {
    // Parametric tool: shape from the tool type, colours from the tier prefix.
    const tierKey = id.split('_')[0];
    const metal = TIER_METAL[tierKey] || TIER_METAL.iron;
    const shape = { pick: 'pick', axe: 'axe', sword: 'sword', hoe: 'hoe',
                    bow: 'bow', bucket: 'bucket' }[it.tool.type] || 'sword';
    canvas = paintIcon(shape, metal);
  }

  if (!canvas) canvas = paintIcon('pouch', ['slate3', 'slate5', 'slate1']);
  iconCache.set(id, canvas);
  return canvas;
}
