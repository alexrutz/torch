// Villagers. They wander their patch by day, head home after dark, and carry
// the quest chain and the shop.

import { Entity } from './entity.js';
import { Rng } from '../core/rng.js';
import { TS } from '../gfx/tileart.js';

const NAMES = {
  elder:  ['Maren', 'Old Alder', 'Sable', 'Grandmother Wick'],
  smith:  ['Bront', 'Halda', 'Cinder', 'Torvald'],
  farmer: ['Pip', 'Ysolde', 'Barley', 'Muck'],
  hunter: ['Rook', 'Ash', 'Vessel', 'Thorn'],
  trader: ['Coin', 'Peddler Fen', 'Marrow', 'Quill'],
  child:  ['Tuppence', 'Sprat', 'Moth', 'Bee'],
  guard:  ['Halberd', 'Wren', 'Stone', 'Dun'],
  hermit: ['The Hermit', 'Nettle', 'Grey Osric', 'Bramble'],
};

/** Ambient lines, chosen by role. Shown when the NPC has no quest business. */
const CHATTER = {
  elder: [
    'Light a torch before the sun touches the trees. Not after.',
    'This village stood before the caves opened. It will stand after.',
    'You have the look of someone who goes down instead of around.',
  ],
  smith: [
    'Copper for practice. Iron for keeping.',
    'An anvil turns bars into things worth swinging.',
    'Bring me ore and I will not ask where you found it.',
  ],
  farmer: [
    'Till the soil, plant the seed, water it. Simple, until the crows come.',
    'Moonbloom only opens at night. Strange crop. Good coin.',
    'Watered soil grows twice as fast. Fetch a bucket.',
  ],
  hunter: [
    'Wolves hunt in packs. Never take the first one you see.',
    'Shades cannot abide light. Remember that when the sun goes.',
    "A bow keeps the trouble at arm's length.",
  ],
  trader: [
    'Everything has a price. Even things that should not.',
    'I buy what you drag out of the dark. No questions.',
    'Coins are heavy. Let me lighten you.',
  ],
  child: [
    'I found a cave once. Father says I am not to go back.',
    'Do you have a torch? I like the way they sound.',
    'The wisps are pretty. Mother says not to follow them.',
  ],
  guard: [
    'Move along. Or do not. It is a quiet night.',
    'Anything that comes out of that cave, I put back in.',
    'Stay inside the lantern light after dusk.',
  ],
  hermit: [
    'I came out here for the quiet. You are ruining it. Sit down.',
    'The deep places remember being lit.',
    'Glowcaps will not kill you. Probably.',
  ],
};

/** What the trader buys and sells. Prices are in coins. */
export const SHOP = [
  { id: 'torch', buy: 4, sell: 1, stock: 30 },
  { id: 'bread', buy: 18, sell: 6, stock: 10 },
  { id: 'arrow', buy: 3, sell: 1, stock: 60 },
  { id: 'potion_heal', buy: 60, sell: 20, stock: 5 },
  { id: 'potion_energy', buy: 45, sell: 15, stock: 5 },
  { id: 'iron_bar', buy: 55, sell: 18, stock: 8 },
  { id: 'seed_moon', buy: 90, sell: 30, stock: 3 },
  { id: 'lantern', buy: 320, sell: 110, stock: 1 },
];

export class NPC extends Entity {
  constructor(x, y, role, opts = {}) {
    super(x, y);
    this.w = 8; this.h = 8;
    this.role = role;
    this.rng = new Rng(opts.vseed ?? ((x * 7919) ^ (y * 104729)));
    this.name = this.rng.pick(NAMES[role] || NAMES.elder);
    this.home = opts.home ? { x: opts.home[0] * TS, y: opts.home[1] * TS } : { x, y };
    this.anchor = { x, y };
    this.maxHp = 999; this.hp = 999;         // villagers are not a combat target
    this.speed = 26;
    this.state = 'wander';
    this.stateTimer = 0;
    this.wanderAngle = this.rng.float(0, Math.PI * 2);
    this.chatter = CHATTER[role] || CHATTER.elder;
    this.friendly = true;
  }

  update(dt, game) {
    const { world, clock } = game;
    this.applyPhysics(dt, world);

    // At night everyone drifts back toward their doorway.
    const goHome = clock.isNight;
    const anchor = goHome ? this.home : this.anchor;
    const dx = anchor.x - this.x, dy = anchor.y - this.y;
    const dist = Math.hypot(dx, dy);
    const leash = goHome ? 12 : 44;

    this.stateTimer -= dt;
    let vx = 0, vy = 0;

    if (dist > leash) {
      vx = (dx / dist) * this.speed;
      vy = (dy / dist) * this.speed;
      this.moving = true;
    } else if (this.stateTimer <= 0) {
      this.stateTimer = this.rng.float(1.2, 3.4);
      this.idle = this.rng.chance(goHome ? 0.8 : 0.45);
      this.wanderAngle = this.rng.float(0, Math.PI * 2);
    }
    if (dist <= leash && !this.idle) {
      vx = Math.cos(this.wanderAngle) * this.speed * 0.5;
      vy = Math.sin(this.wanderAngle) * this.speed * 0.5;
    }

    // Face the player when they're close enough to talk to.
    const toPlayer = this.distanceTo(game.player);
    if (toPlayer < 34) {
      vx = vy = 0;
      this.faceVector(game.player.x - this.x, game.player.y - this.y);
    }

    this.moving = Math.abs(vx) + Math.abs(vy) > 1;
    if (this.moving) {
      this.faceVector(vx, vy);
      const before = this.x;
      this.moveBy(vx * dt, vy * dt, world);
      if (Math.abs(this.x - before) < 0.001 && vx !== 0) {
        this.wanderAngle = this.rng.float(0, Math.PI * 2);
      }
      this.anim += dt * 6;
      this.frame = Math.floor(this.anim) % 4;
    } else {
      this.frame = 0;
    }
  }

  /**
   * Builds the dialogue node for this NPC given current quest state.
   * @returns {{name:string,text:string,choices:Array}}
   */
  dialogue(game) {
    const log = game.quests;
    const choices = [];
    let text = null;

    for (const quest of log.forGiver(this.role)) {
      if (log.isActive(quest.id)) {
        const have = log.progress(quest, game.player);
        if (log.canComplete(quest, game.player)) {
          text = quest.done;
          choices.push({
            label: `Hand in: ${quest.title}`,
            action: () => game.completeQuest(quest),
          });
        } else {
          text = `${quest.progressText}  (${have}/${quest.count})`;
        }
        break;
      }
    }

    if (!text) text = this.rng.pick(this.chatter);

    if (this.role === 'trader') {
      choices.push({ label: 'Trade', action: () => game.openShop(this) });
    }
    if (this.role === 'smith') {
      choices.push({ label: 'Use the anvil', action: () => game.openCrafting('anvil') });
    }
    choices.push({ label: 'Leave', action: () => game.closeDialogue() });
    return { name: this.name, text, choices };
  }

  serialize() {
    return { role: this.role, x: this.x, y: this.y, name: this.name,
             home: this.home, anchor: this.anchor };
  }
}
