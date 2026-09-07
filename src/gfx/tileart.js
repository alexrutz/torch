// Procedural tile textures. Ground is noise-dithered from a palette ramp;
// objects are hand-authored string art. Everything is baked into canvases once
// at boot, so the render loop only ever blits.

import { makeCanvas, drawArt } from './pixel.js';
import { color, shade } from './palette.js';
import { hash3 } from '../core/rng.js';
import { TILES, byName } from '../world/tiles.js';

export const TS = 16;                 // tile size, in game pixels

// ── ground recipes ───────────────────────────────────────────────
// `spots` are [colour, density] scattered by a deterministic hash so each
// variant is different but stable. `detail` adds a signature mark.
const GROUND = {
  grass:      { base: 'green3', spots: [['green2', .34], ['green4', .20], ['green5', .07], ['moss', .06]], detail: 'blades' },
  grass_dark: { base: 'green2', spots: [['green1', .34], ['green3', .22], ['moss', .10], ['green4', .05]], detail: 'blades' },
  dirt:       { base: 'dirt2',  spots: [['dirt1', .30], ['dirt3', .20], ['dirt0', .08], ['bone0', .04]], detail: 'grit' },
  sand:       { base: 'sand2',  spots: [['sand1', .28], ['sand3', .20], ['sand0', .06]], detail: 'ripple' },
  water:      { base: 'water2', spots: [['water1', .26], ['water3', .18]], detail: 'wave' },
  deep_water: { base: 'water0', spots: [['water1', .24], ['ink', .10]], detail: 'wave' },
  stone_floor:{ base: 'stone2', spots: [['stone1', .32], ['stone3', .18], ['stone0', .08]], detail: 'crack' },
  snow:       { base: 'snow',   spots: [['ice2', .22], ['ice1', .07]], detail: 'sparkle' },
  ice:        { base: 'ice2',   spots: [['ice1', .26], ['ice0', .10], ['white', .08]], detail: 'shard' },
  mud:        { base: 'dirt1',  spots: [['dirt0', .32], ['moss', .14], ['green1', .08]], detail: 'grit' },
  ash:        { base: 'slate1', spots: [['slate0', .30], ['slate2', .16], ['bone0', .05]], detail: 'grit' },
  cave_floor: { base: 'stone1', spots: [['stone0', .34], ['stone2', .18], ['ink', .07]], detail: 'grit' },
  path:       { base: 'bone0',  spots: [['dirt2', .26], ['stone2', .18], ['bone1', .12]], detail: 'grit' },
  plank:      { base: 'dirt3',  spots: [['dirt2', .20], ['bark2', .12]], detail: 'planks' },
  farmland:   { base: 'dirt1',  spots: [['dirt0', .24], ['dirt2', .16]], detail: 'furrow' },
  farmland_wet:{base: 'dirt0',  spots: [['bark0', .26], ['dirt1', .16]], detail: 'furrow' },
  lava:       { base: 'fire0',  spots: [['ember1', .28], ['fire2', .16], ['fire3', .05]], detail: 'wave' },
  brick_floor:{ base: 'copper1',spots: [['copper0', .22], ['copper2', .12]], detail: 'bricks' },
  moss_stone: { base: 'stone2', spots: [['moss', .30], ['green1', .16], ['stone1', .16]], detail: 'crack' },
  void:       { base: 'void',   spots: [] },
};

function paintGround(ctx, name, variant) {
  const cfg = GROUND[name] || GROUND.dirt;
  const seed = (byName.get(name)?.id ?? 0) * 131 + variant * 7717;

  ctx.fillStyle = color(cfg.base);
  ctx.fillRect(0, 0, TS, TS);

  // Scatter. Each spot colour gets its own hash channel so densities are
  // independent and the result doesn't band.
  cfg.spots.forEach(([col, density], ci) => {
    ctx.fillStyle = color(col);
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        if (((hash3(x, y, seed + ci * 977) & 0xffff) / 65536) < density) ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  const r = (i) => (hash3(i, variant, seed + 55) & 0xffff) / 65536;
  switch (cfg.detail) {
    case 'blades':
      ctx.fillStyle = color('green1');
      for (let i = 0; i < 5; i++) {
        const x = (r(i) * TS) | 0, y = (r(i + 40) * (TS - 3)) | 0;
        ctx.fillRect(x, y, 1, 3);
        ctx.fillRect(x + 1, y + 1, 1, 2);
      }
      break;
    case 'grit':
      ctx.fillStyle = shade(color(cfg.base), -0.35);
      for (let i = 0; i < 7; i++) ctx.fillRect((r(i) * TS) | 0, (r(i + 30) * TS) | 0, 2, 1);
      break;
    case 'ripple':
      ctx.fillStyle = color('sand1');
      for (let i = 0; i < 3; i++) {
        const y = 2 + ((r(i) * (TS - 4)) | 0);
        for (let x = 1; x < TS - 1; x += 2) ctx.fillRect(x, y + ((x >> 1) & 1), 2, 1);
      }
      break;
    case 'wave':
      ctx.fillStyle = shade(color(cfg.base), 0.22);
      for (let i = 0; i < 3; i++) {
        const y = 2 + ((r(i) * (TS - 4)) | 0), x = (r(i + 10) * 8) | 0;
        ctx.fillRect(x, y, 5, 1);
        ctx.fillRect(x + 5, y - 1, 3, 1);
      }
      break;
    case 'crack':
      ctx.fillStyle = shade(color(cfg.base), -0.4);
      for (let i = 0; i < 2; i++) {
        let x = (r(i) * TS) | 0, y = (r(i + 20) * TS) | 0;
        for (let s = 0; s < 6; s++) {
          ctx.fillRect(x, y, 1, 1);
          x += r(i * 10 + s) > 0.5 ? 1 : 0;
          y += r(i * 10 + s + 5) > 0.4 ? 1 : 0;
          if (x >= TS || y >= TS) break;
        }
      }
      break;
    case 'sparkle':
      ctx.fillStyle = color('white');
      for (let i = 0; i < 4; i++) ctx.fillRect((r(i) * TS) | 0, (r(i + 12) * TS) | 0, 1, 1);
      break;
    case 'shard':
      ctx.fillStyle = color('white');
      for (let i = 0; i < 3; i++) {
        const x = (r(i) * (TS - 5)) | 0, y = (r(i + 8) * (TS - 5)) | 0;
        for (let s = 0; s < 4; s++) ctx.fillRect(x + s, y + s, 1, 1);
      }
      break;
    case 'planks':
      ctx.fillStyle = color('bark1');
      for (let y = 0; y < TS; y += 5) ctx.fillRect(0, y, TS, 1);
      ctx.fillRect(variant % 2 ? 7 : 11, 0, 1, 5);
      ctx.fillRect(variant % 2 ? 4 : 9, 5, 1, 5);
      ctx.fillRect(variant % 2 ? 10 : 3, 10, 1, 6);
      break;
    case 'furrow':
      ctx.fillStyle = shade(color(cfg.base), -0.3);
      for (let y = 1; y < TS; y += 4) ctx.fillRect(0, y, TS, 1);
      ctx.fillStyle = shade(color(cfg.base), 0.2);
      for (let y = 2; y < TS; y += 4) ctx.fillRect(0, y, TS, 1);
      break;
    case 'bricks':
      ctx.fillStyle = shade(color(cfg.base), -0.45);
      for (let y = 0; y < TS; y += 4) {
        ctx.fillRect(0, y, TS, 1);
        for (let x = ((y / 4) & 1) ? 3 : 11; x < TS; x += 8) ctx.fillRect(x, y, 1, 4);
      }
      break;
  }
}

// ── object art ───────────────────────────────────────────────────
// Letter codes shared by every object drawing.
const M = {
  // wood / bark
  k: 'bark0', K: 'bark1', w: 'bark2', W: 'dirt3', y: 'dirt4',
  // leaves
  l: 'green1', L: 'green2', m: 'green3', M: 'green4', n: 'green5',
  // stone
  s: 'stone0', S: 'stone1', t: 'stone2', T: 'stone3', u: 'stone4',
  // metals & ores
  c: 'copper1', C: 'copper2', i: 'iron1', I: 'iron2', o: 'gold1', O: 'gold2',
  // fire
  f: 'fire0', F: 'fire1', g: 'fire2', G: 'fire3',
  // arcane / crystal
  a: 'arc1', A: 'arc2', b: 'arc3', B: 'arc4', v: 'cyan1', V: 'cyan2', x: 'cyan3',
  // misc
  d: 'ink', D: 'void', e: 'bone1', E: 'bone3', h: 'white',
  r: 'rose1', R: 'rose2', p: 'toxic1', P: 'toxic2', q: 'blood1', Q: 'blood2',
  z: 'slate2', Z: 'slate4', j: 'moss', J: 'olive',
  '1': 'sand1', '2': 'sand2', '3': 'water2', '4': 'water3', '5': 'ice1', '6': 'ice2',
};

// Tall art overhangs upward; the last TS rows sit in the tile itself.
const OBJECTS = {
  tree_oak: [
    '....lmmml.....',
    '..lmmMMMmml...',
    '.lmMMMnMMMml..',
    'lmMMnMMMnMMml.',
    'lMMMMMMMMMMMl.',
    'lmMMMMnMMMMml.',
    '.lmMMMMMMmml..',
    '..llmMMMmll...',
    '....lKKKl.....',
    '.....KKw......',
    '.....kKw......',
    '.....kKw......',
    '....kkKww.....',
    '...kk.K.ww....',
  ],
  tree_birch: [
    '....lmMMml....',
    '...lmMMMMml...',
    '..lmMMnnMMml..',
    '.lmMMMMMMMMml.',
    '.lmMMnMMMMMml.',
    '..lmMMMMMMml..',
    '...llmMMmll...',
    '.....lmml.....',
    '.....eEe......',
    '.....dEe......',
    '.....eEd......',
    '.....eEe......',
    '....eeEee.....',
    '...eeeEeee....',
  ],
  tree_pine: [
    '......n.......',
    '.....lml......',
    '....lmMml.....',
    '...lmMMMml....',
    '.....lml......',
    '....lmMml.....',
    '...lmMMMml....',
    '..lmMMMMMml...',
    '....lmMml.....',
    '...lmMMMml....',
    '..lmMMMMMml...',
    '.lmMMMMMMMml..',
    '......kKw.....',
    '.....kkKww....',
  ],
  tree_palm: [
    '..m.......m...',
    '.lmM.....Mml..',
    'lmMMn...nMMml.',
    '.lmMMnnnMMml..',
    '...lmMnMml....',
    '.....nMn......',
    '.....KwW......',
    '.....KwW......',
    '....KwW.......',
    '....KwW.......',
    '...KwW........',
    '...KwW........',
    '..KKwWW.......',
    '.kkKwWWy......',
  ],
  tree_dead: [
    '..k......k....',
    '...k....k.....',
    '....kK.Kw.....',
    '.k...kKw...w..',
    '..k...Kw..w...',
    '...kk.Kw.w....',
    '.....kKww.....',
    '......Kw......',
    '......Kw..k...',
    '..w...Kw.k....',
    '...w..Kwk.....',
    '....wwKw......',
    '.....kKww.....',
    '....kkKKww....',
  ],
  bush: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.....lml......',
    '...llmMmll....',
    '..lmMMMMMml...',
    '.lmMMnMnMMml..',
    '.lmMMMMMMMml..',
    '..lmMMMMMml...',
    '...llmMMll....',
    '.....kKw......',
    '.....kKw......',
  ],
  berry_bush: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.....lml......',
    '...llmMmll....',
    '..lmMqMMqml...',
    '.lmMQMnMQMml..',
    '.lmMMMqMMMml..',
    '..lmQMMMQml...',
    '...llmMMll....',
    '.....kKw......',
    '.....kKw......',
  ],
  rock: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.....sSt......',
    '....sStTt.....',
    '...sSttTus....',
    '..sSttTTtus...',
    '..sStttttus...',
    '..ssSSttts....',
    '...sssssss....',
  ],
  boulder: [
    '..............',
    '..............',
    '.....sssS.....',
    '...ssSStTs....',
    '..sSStTTTus...',
    '.sSttTTuuTs...',
    '.sSttTTTuus...',
    'sSttTTTTtuus..',
    'sStttTTtttus..',
    'sSSttttttttus.',
    'sSSttttTttts..',
    '.sSSttttttts..',
    '..ssSSttttss..',
    '...sssssssss..',
  ],
  cactus: [
    '..............',
    '.....pPp......',
    '.....pPp......',
    '..p..pPp..p...',
    '.pPp.pPp.pPp..',
    '.pPp.pPp.pPp..',
    '.pPpppPppPPp..',
    '.pPPPPPPPPPp..',
    '..ppppPppp....',
    '.....pPp......',
    '.....pPp......',
    '.....pPp......',
    '.....pPp......',
    '....ppPpp.....',
  ],
};

Object.assign(OBJECTS, {
  ore_copper: [
    '..............',
    '..............',
    'ssssssssssss..',
    'sStTcCctSttTs.',
    'sStTcCctSttTs.',
    'ssscCcssssss..',
    'sTtScCTtStTs..',
    'sTtStTTtScCs..',
    'sssssssscCs...',
    'sStcCctSttTs..',
    'sStcCctSttTs..',
    'ssssssssssss..',
    'sTtStTTtStTs..',
    'sTtStTTtStTs..',
  ],
  ore_iron: [
    '..............',
    '..............',
    'ssssssssssss..',
    'sStTiIitSttTs.',
    'sStTiIitSttTs.',
    'sssiIisssssss.',
    'sTtSiITtStTs..',
    'sTtStTTtSiIs..',
    'sssssssssiIs..',
    'sStiIitSttTs..',
    'sStiIitSttTs..',
    'ssssssssssss..',
    'sTtStTTtStTs..',
    'sTtStTTtStTs..',
  ],
  ore_gold: [
    '..............',
    '..............',
    'ssssssssssss..',
    'sStToOotSttTs.',
    'sStToOotSttTs.',
    'sssoOosssssss.',
    'sTtSoOTtStTs..',
    'sTtStTTtSoOs..',
    'sssssssssoOs..',
    'sStoOotSttTs..',
    'sStoOotSttTs..',
    'ssssssssssss..',
    'sTtStTTtStTs..',
    'sTtStTTtStTs..',
  ],
  ore_crystal: [
    '..............',
    '..............',
    'ssssssssssss..',
    'sStTvVxtSttTs.',
    'sStTvVxtSttTs.',
    'sssvVxsssssss.',
    'sTtSvVTtStTs..',
    'sTtStTTtSvVs..',
    'sssssssssvVs..',
    'sStvVxtSttTs..',
    'sStvVxtSttTs..',
    'ssssssssssss..',
    'sTtStTTtStTs..',
    'sTtStTTtStTs..',
  ],
  crystal: [
    '..............',
    '..............',
    '.......x......',
    '......vVx.....',
    '..x...vVx.....',
    '.vVx..vVx..x..',
    '.vVx.vvVVxvVx.',
    '.vVxvvVVVxvVx.',
    '.vVVvVVVVvVVx.',
    '..vVVVVVVVVx..',
    '..svVVVVVVs...',
    '...ssvVVss....',
    '....ssvss.....',
    '.....sss......',
  ],
  torch: [
    '..............',
    '..............',
    '..............',
    '.....G........',
    '....GgG.......',
    '...GgFgG......',
    '...gFfFg......',
    '....fFf.......',
    '.....d........',
    '.....kK.......',
    '.....kK.......',
    '.....kK.......',
    '.....kK.......',
    '....kkK.......',
  ],
  lantern: [
    '..............',
    '..............',
    '.....iI.......',
    '....i..i......',
    '...iIIIIi.....',
    '...iGgGgi.....',
    '...iggFgi.....',
    '...igFfgi.....',
    '...iGgGgi.....',
    '...iIIIIi.....',
    '....iIIi......',
    '.....kK.......',
    '.....kK.......',
    '....kkK.......',
  ],
  campfire: [
    '..............',
    '..............',
    '..............',
    '......G.......',
    '.....GgG......',
    '....GgFgG.....',
    '...GgFfFgG....',
    '...gFffFfg....',
    '..kgFfffFgw...',
    '..kKgffFgWw...',
    '.kkKwgFgWwww..',
    '.sSkKwWWwWts..',
    '.ssStTtTtts...',
    '..sssssssss...',
  ],
  workbench: [
    '..............',
    '..............',
    '..............',
    '...i..I.......',
    '..iIi.II......',
    '..............',
    'kkkkkkkkkkkk..',
    'kWWWWWWWWWWk..',
    'kKwWwKWwKwWk..',
    'kkkkkkkkkkkk..',
    'k.kK....Kw.k..',
    'k.kK....Kw.k..',
    'k.kK....Kw.k..',
    'k.kk....kw.k..',
  ],
  furnace: [
    '..............',
    '..............',
    '.....d.d......',
    '...sssssss....',
    '..sStTtTtSs...',
    '..sSt...tSs...',
    '..sS.fFf.Ss...',
    '..sS.FgF.Ss...',
    '..sSt.f.tSs...',
    '..sStTtTtSs...',
    '..sSttTttSs...',
    '..sSSttttSs...',
    '..ssssssssss..',
    '..ssssssssss..',
  ],
  anvil: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..iIIIIIIIi...',
    '..iIIIIIIIi...',
    '...iIIIIii....',
    '.....iIIi.....',
    '.....iIIi.....',
    '....iIIIIi....',
    '...iIIIIIIi...',
    '...iIIIIIIi...',
    '...sssssss....',
    '...sssssss....',
  ],
  chest: [
    '..............',
    '..............',
    '..............',
    '...kkkkkkkk...',
    '..kKwWWWWwKk..',
    '..kKwWWWWwKk..',
    '..kkkoOokkkk..',
    '..kKwWoOWwKk..',
    '..kKwWoOWwKk..',
    '..kKwWWWWwKk..',
    '..kKwWWWWwKk..',
    '..kkkkkkkkkk..',
    '..............',
    '..............',
  ],
  barrel: [
    '..............',
    '..............',
    '..............',
    '...kkkkkkkk...',
    '...kWwWwWwk...',
    '..iIIIIIIIIi..',
    '...kWwWwWwk...',
    '...kWwWwWwk...',
    '..iIIIIIIIIi..',
    '...kWwWwWwk...',
    '...kWwWwWwk...',
    '...kkkkkkkk...',
    '..............',
    '..............',
  ],
  bed: [
    '..............',
    '..............',
    '..............',
    '..kkkkkkkkkk..',
    '..kEEEEEEEEk..',
    '..kEhhhhhEEk..',
    '..krRRRRRrEk..',
    '..krRRRRRrEk..',
    '..krRRRRRrEk..',
    '..krRRRRRrEk..',
    '..krrrrrrrEk..',
    '..kkkkkkkkkk..',
    '..............',
    '..............',
  ],
  fence: [
    '..............',
    '..............',
    '..............',
    '.....kK.......',
    '.....kK.......',
    'kkkkkkkkkkkk..',
    'wWwWwWwWwWww..',
    '.....kK.......',
    '.....kK.......',
    'kkkkkkkkkkkk..',
    'wWwWwWwWwWww..',
    '.....kK.......',
    '.....kK.......',
    '.....kK.......',
  ],
  sign: [
    '..............',
    '..............',
    '..kkkkkkkkk...',
    '..kWWWWWWWk...',
    '..kWdddddWk...',
    '..kWWWWWWWk...',
    '..kWdddddWk...',
    '..kWWWWWWWk...',
    '..kkkkkkkkk...',
    '.....kK.......',
    '.....kK.......',
    '.....kK.......',
    '.....kK.......',
    '....kkK.......',
  ],
  grave: [
    '..............',
    '..............',
    '....ssttss....',
    '...sStTTtSs...',
    '..sSttTTttSs..',
    '..sSt.dd.tSs..',
    '..sStdddttSs..',
    '..sSt.dd.tSs..',
    '..sSt.dd.tSs..',
    '..sSttTTttSs..',
    '..sSttTTttSs..',
    '..jsSttttSsj..',
    '.jjjjjjjjjjj..',
    '..............',
  ],
  altar: [
    '......BB......',
    '.....bBBb.....',
    '....aAbbAa....',
    '....aAbbAa....',
    '.....bBBb.....',
    '......BB......',
    '..............',
    '..ssttttttss..',
    '.sStTTTTTTtSs.',
    '.sStaAAAAatSs.',
    '.sStaAbbAatSs.',
    '.sStTTTTTTtSs.',
    '.ssSttttttSss.',
    '.ssssssssssss.',
  ],
  cave_mouth: [
    '..............',
    '...sssssss....',
    '..sStTTTtSs...',
    '.sSt.....tSs..',
    '.sS..ddd..Ss..',
    '.sS.ddddd.Ss..',
    '.st.ddddd.ts..',
    '.st.ddddd.ts..',
    '.st.ddddd.ts..',
    '.sSt.ddd.tSs..',
    '.ssSt...tSss..',
    '..ssStttSss...',
    '...sssssss....',
    '..............',
  ],
  cave_exit: [
    '..............',
    '..............',
    '...kkkkkkk....',
    '...kWwWwWk....',
    '...k.....k....',
    '...kwwwwwk....',
    '...k.....k....',
    '...kwwwwwk....',
    '...k.....k....',
    '...kwwwwwk....',
    '...k.....k....',
    '...kwwwwwk....',
    '...kkkkkkk....',
    '..............',
  ],
  flowers: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..r...B...o...',
    '.rRr.bBb.oOo..',
    '..r...B...o...',
    '..l...l...l...',
    '..l.l.l.l.l...',
    '..lmlmlmlml...',
    '...lmMmMml....',
    '....lmml......',
    '.....ll.......',
  ],
  tuft: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '...l...l......',
    '..lm..lm.l....',
    '..lm.lmM.lm...',
    '.llmllmMllm...',
    '.lmMlmMMlmM...',
    '.lmMmmMMmmM...',
    '..lmMMMMMml...',
    '...lllllll....',
  ],
  mushroom: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '....qqqq......',
    '...qQQQQq.....',
    '..qQQhQQQq....',
    '..qQhQQQhq....',
    '...qQQQQq.....',
    '....eEEe......',
    '....eEEe......',
    '....eEEe......',
    '...eeEEee.....',
  ],
  glowcap: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '....vvvv......',
    '...vVVVVv.....',
    '..vVVxVVVv....',
    '..vVxVVVxv....',
    '...vVVVVv.....',
    '....eEEe......',
    '....eEEe......',
    '....eEEe......',
    '...eeEEee.....',
  ],
  vine: [
    '..............',
    '.l..l....l....',
    '.lm.lm...lm...',
    '.lm.lm..lmM...',
    '.lmMlmM.lmM...',
    '..lmMlmMlmM...',
    '..lmM.lmMlm...',
    '..lmM.lmMlm...',
    '...lm..lmMl...',
    '...lm..lmM....',
    '...lm...lm....',
    '....l...lm....',
    '....l....l....',
    '.........l....',
  ],
});

// Crops: three stages each, so a field visibly ripens over several days.
Object.assign(OBJECTS, {
  crop_wheat_0: [
    '..............', '..............', '..............', '..............',
    '..............', '..............', '..............', '..............',
    '..............', '.....l........', '..l..l..l.....', '..l.lm.lm.....',
    '..lmlmMlmM....', '...llllll.....',
  ],
  crop_wheat_1: [
    '..............', '..............', '..............', '..............',
    '..............', '...l..l..l....', '...l..l..l....', '..lm.lm.lm....',
    '..lm.lm.lmM...', '..lmMlmMlmM...', '..lmMlmMlmM...', '..lmMlmMlmM...',
    '..lmMlmMlmM...', '...llllllll...',
  ],
  crop_wheat_2: [
    '..............', '..............', '...O..O..O....', '..oOo.oOo.oOo.',
    '..oOo.oOo.oOo.', '..oOo.oOo.oOo.', '...O..O..O....', '..lM.lM.lM....',
    '..lM.lM.lMM...', '..lmMlmMlmM...', '..lmMlmMlmM...', '..lmMlmMlmM...',
    '..lmMlmMlmM...', '...llllllll...',
  ],
  crop_carrot_0: [
    '..............', '..............', '..............', '..............',
    '..............', '..............', '..............', '..............',
    '..............', '..............', '.....l.l......', '....lm.ml.....',
    '....lmMml.....', '.....lll......',
  ],
  crop_carrot_1: [
    '..............', '..............', '..............', '..............',
    '..............', '..............', '...l.....l....', '...lm...ml....',
    '..llmM.Mmll...', '..lmMMmMMml...', '...lmMMMml....', '....lmMml.....',
    '....lmMml.....', '.....lll......',
  ],
  crop_carrot_2: [
    '..............', '..............', '..............', '..............',
    '..l...l...l...', '..lm.lm..ml...', '..lmMlmM.Mml..', '.llmMMmMMmll..',
    '.lmMMMMMMMml..', '..lmMMMMMml...', '...lfFfFfl....', '....fFFFf.....',
    '....fFFf......', '.....ff.......',
  ],
  crop_moon_0: [
    '..............', '..............', '..............', '..............',
    '..............', '..............', '..............', '..............',
    '..............', '.....a........', '.....aA.......', '....lmA.......',
    '....lmM.......', '.....ll.......',
  ],
  crop_moon_1: [
    '..............', '..............', '..............', '..............',
    '..............', '.....a........', '....aAa.......', '....aAb.......',
    '.....A........', '.....l........', '....lmM.......', '....lmM.......',
    '....lmM.......', '.....ll.......',
  ],
  crop_moon_2: [
    '..............', '..............', '......B.......', '.....bBb......',
    '....aAbAa.....', '...aAbBbAa....', '....aAbAa.....', '.....bBb......',
    '......A.......', '......l.......', '.....lmM......', '.....lmM......',
    '.....lmM......', '......ll......',
  ],
});

// ── walls and doors ──────────────────────────────────────────────
// These must cover their whole tile — a 14px drawing in a 16px tile leaves a
// seam of ground showing through every wall. They are also drawn 4px taller
// than a tile so the top face reads as thickness from above.

const WALL_H = TS + 4;
const WALL_CAP = 4;

const WALLS = {
  wall_stone: { face: 'stone2', dark: 'stone0', lo: 'stone1', hi: 'stone3',
                cap: 'stone4', pattern: 'block' },
  wall_wood:  { face: 'bark2', dark: 'bark0', lo: 'bark1', hi: 'dirt3',
                cap: 'dirt4', pattern: 'plank' },
  wall_brick: { face: 'copper1', dark: 'ember0', lo: 'copper0', hi: 'copper2',
                cap: 'copper2', pattern: 'brick' },
};

function paintWall(ctx, cfg, variant) {
  const seed = variant * 7717 + 31;
  // Top face, lit from above.
  ctx.fillStyle = color(cfg.cap);
  ctx.fillRect(0, 0, TS, WALL_CAP);
  ctx.fillStyle = shade(color(cfg.cap), -0.18);
  for (let x = 0; x < TS; x++) {
    if (((hash3(x, 0, seed) & 0xffff) / 65536) < 0.3) ctx.fillRect(x, 1, 1, 2);
  }
  ctx.fillStyle = color(cfg.dark);
  ctx.fillRect(0, WALL_CAP - 1, TS, 1);

  // Wall face.
  ctx.fillStyle = color(cfg.face);
  ctx.fillRect(0, WALL_CAP, TS, TS);
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      const r = (hash3(x, y, seed + 91) & 0xffff) / 65536;
      if (r < 0.16) { ctx.fillStyle = color(cfg.lo); ctx.fillRect(x, WALL_CAP + y, 1, 1); }
      else if (r < 0.28) { ctx.fillStyle = color(cfg.hi); ctx.fillRect(x, WALL_CAP + y, 1, 1); }
    }
  }

  ctx.fillStyle = color(cfg.dark);
  if (cfg.pattern === 'plank') {
    for (let x = 0; x < TS; x += 4) ctx.fillRect(x, WALL_CAP, 1, TS);
    ctx.fillRect(0, WALL_CAP + 7, TS, 1);
  } else {
    // Running-bond courses; alternate rows offset by half a brick.
    const rowH = cfg.pattern === 'brick' ? 4 : 5;
    const half = cfg.pattern === 'brick' ? 4 : 5;
    for (let y = 0; y < TS; y += rowH) {
      ctx.fillRect(0, WALL_CAP + y, TS, 1);
      const off = ((y / rowH) & 1) ? half : 0;
      for (let x = off; x < TS; x += half * 2) ctx.fillRect(x, WALL_CAP + y, 1, rowH);
    }
  }
  // Grounding shadow so walls sit on the floor instead of floating.
  ctx.fillStyle = 'rgba(5,7,12,0.45)';
  ctx.fillRect(0, WALL_CAP + TS - 2, TS, 2);
}

function paintDoor(ctx, open) {
  ctx.fillStyle = color('bark0');
  ctx.fillRect(0, 0, TS, WALL_CAP);
  ctx.fillStyle = color('dirt4');
  ctx.fillRect(0, 0, TS, 2);

  // Jambs stay put; only the leaf swings away.
  ctx.fillStyle = color('bark0');
  ctx.fillRect(0, WALL_CAP, 2, TS);
  ctx.fillRect(TS - 2, WALL_CAP, 2, TS);

  if (open) {
    ctx.fillStyle = color('bark1');
    ctx.fillRect(2, WALL_CAP, 2, TS);
    ctx.fillRect(TS - 4, WALL_CAP, 2, TS);
    return;
  }
  ctx.fillStyle = color('dirt3');
  ctx.fillRect(2, WALL_CAP, TS - 4, TS);
  ctx.fillStyle = color('bark1');
  for (let x = 3; x < TS - 3; x += 4) ctx.fillRect(x, WALL_CAP, 1, TS);
  ctx.fillStyle = color('bark0');
  ctx.fillRect(2, WALL_CAP + 3, TS - 4, 1);
  ctx.fillRect(2, WALL_CAP + TS - 4, TS - 4, 1);
  ctx.fillStyle = color('gold2');
  ctx.fillRect(TS - 6, WALL_CAP + 8, 2, 2);
  ctx.fillStyle = 'rgba(5,7,12,0.45)';
  ctx.fillRect(0, WALL_CAP + TS - 2, TS, 2);
}

// ── atlas ────────────────────────────────────────────────────────
const OBJ_H = 14;                     // rows in every object drawing
const OBJ_W = 14;
const LIFT = 6;                       // px a `tall` object overhangs upward
const VARIANTS = 4;

const groundCache = new Map();        // tileId → canvas[]
const objectCache = new Map();        // tileId → { canvas, lift }

/** Renders every tile's art. Call once before the first frame. */
export function buildTileArt() {
  if (groundCache.size) return;

  for (const t of TILES) {
    if (t.layer === 'ground') {
      const n = t.variants || 1;
      const list = [];
      for (let v = 0; v < Math.max(n, 1); v++) {
        const { canvas, ctx } = makeCanvas(TS, TS);
        paintGround(ctx, t.name, v);
        list.push(canvas);
      }
      groundCache.set(t.id, list);
    } else if (WALLS[t.name]) {
      const { canvas, ctx } = makeCanvas(TS, WALL_H);
      paintWall(ctx, WALLS[t.name], t.id);
      objectCache.set(t.id, { canvas, lift: WALL_CAP, ox: 0 });
    } else if (t.name === 'door' || t.name === 'door_open') {
      const { canvas, ctx } = makeCanvas(TS, WALL_H);
      paintDoor(ctx, t.name === 'door_open');
      objectCache.set(t.id, { canvas, lift: WALL_CAP, ox: 0 });
    } else {
      const art = OBJECTS[t.name];
      if (!art) continue;
      // Tall objects get a taller canvas so the drawing can spill upward.
      const lift = t.tall ? LIFT : 0;
      const { canvas, ctx } = makeCanvas(OBJ_W, OBJ_H + lift);
      drawArt(ctx, art, M, 0, 0, 1);
      objectCache.set(t.id, { canvas, lift, ox: (TS - OBJ_W) / 2 });
    }
  }
}

/** Picks a stable variant for a tile position so terrain doesn't shimmer. */
export function groundCanvas(id, x, y) {
  const list = groundCache.get(id);
  if (!list) return null;
  return list.length === 1 ? list[0] : list[hash3(x, y, 1337) % list.length];
}

export function objectCanvas(id) {
  return objectCache.get(id) || null;
}

export const OBJECT_OFFSET_X = (TS - OBJ_W) / 2;   // centre the 14px art in a 16px tile
export const OBJECT_HEIGHT = OBJ_H;
export const OBJECT_LIFT = LIFT;
