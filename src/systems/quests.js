// Quest definitions and the player's log.
//
// Quests are data: a type, a goal, and a reward. Progress for 'collect' quests
// is read live from the inventory, so nothing can desync.

export const QUESTS = {
  kindle: {
    id: 'kindle', giver: 'elder', title: 'Kindle the Dark', order: 1,
    type: 'collect', item: 'torch', count: 5,
    offer: "The nights are getting longer, and half this village has forgotten how to make a torch. Bring me five and I'll see you're equipped for what's below.",
    progressText: "Five torches. Sticks and fiber, or sticks and coal if you've a furnace.",
    done: "Good. Keep three for yourself — you'll want them where you're going.",
    reward: [['coin', 40], ['stone_pick', 1]],
    next: 'ironwill',
  },
  ironwill: {
    id: 'ironwill', giver: 'smith', title: 'Iron Will', order: 2,
    type: 'collect', item: 'iron_bar', count: 5,
    offer: "My forge is cold and my ore is gone. Five iron bars — dig the veins deep in the caves, smelt them in any furnace — and I'll make you something worth carrying.",
    progressText: 'Five iron bars. Iron ore sits deeper than copper.',
    done: 'Steady hands. Here — I finished this last winter and never found anyone to give it to.',
    reward: [['iron_sword', 1], ['coin', 60]],
    next: 'harvest',
  },
  harvest: {
    id: 'harvest', giver: 'farmer', title: 'Seeds of Spring', order: 3,
    type: 'collect', item: 'wheat', count: 10,
    offer: "Crows took half my field. Ten wheat and we'll all eat this month — till some soil with a hoe and plant what you find in the tall grass.",
    progressText: 'Ten wheat. Tall grass drops seeds; a hoe turns dirt into a bed for them.',
    done: "Bless you. Take this bread, and these — carrots keep better than wheat anyhow.",
    reward: [['bread', 5], ['seed_carrot', 6], ['stone_hoe', 1]],
    next: 'thinpack',
  },
  thinpack: {
    id: 'thinpack', giver: 'hunter', title: 'Thin the Pack', order: 4,
    type: 'kill', species: 'wolf', count: 6,
    offer: "Wolves have been coming down out of the treeline. Six of them and the rest will think twice. Don't do it barehanded.",
    progressText: 'Six wolves. They run in packs — never fight one in the open at night.',
    done: "That'll hold them a season. This bow was my father's. It shoots straighter than I do now.",
    reward: [['bow', 1], ['arrow', 24], ['coin', 50]],
    next: 'rarefinds',
  },
  rarefinds: {
    id: 'rarefinds', giver: 'trader', title: 'Rare Finds', order: 5,
    type: 'collect', item: 'moonstone', count: 3,
    offer: "I deal in things that shouldn't exist. Moonstone — three pieces. It only grows in the deep dark, far from any way out.",
    progressText: 'Three moonstone. Far from the entrance, deeper than gold.',
    done: "Beautiful. Truly. Here's coin, and something I've been saving for someone foolish enough to go that deep.",
    reward: [['coin', 220], ['potion_sight', 3], ['lantern', 1]],
    next: 'hollowking',
  },
  hollowking: {
    id: 'hollowking', giver: 'elder', title: 'The Hollow King', order: 6,
    type: 'kill', species: 'shade_lord', count: 1,
    offer: "Then you've seen the deep. There is something down there that was old when this village was founded — it sits in a hall of brick and crystal and it is why our nights grow longer. End it.",
    progressText: 'Find the Moon Altar in the deepest dark. Carry light. Carry more light than you think you need.',
    done: 'It is done. The dark is only dark again. Take this — you have earned every ounce of it.',
    reward: [['moonstone', 12], ['coin', 500], ['potion_heal', 5]],
    next: null,
  },
};

export const QUEST_ORDER = Object.values(QUESTS).sort((a, b) => a.order - b.order);

export class QuestLog {
  constructor() {
    this.active = new Set(['kindle']);   // the first quest is always offered
    this.completed = new Set();
    this.kills = {};                     // species → count, for 'kill' quests
  }

  isActive(id) { return this.active.has(id); }
  isDone(id) { return this.completed.has(id); }

  /** Quests this NPC role currently has something to say about. */
  forGiver(role) {
    return QUEST_ORDER.filter((q) => q.giver === role
      && (this.active.has(q.id) || (!this.completed.has(q.id) && this._unlocked(q.id))));
  }

  _unlocked(id) {
    if (id === 'kindle') return true;
    const prior = QUEST_ORDER.find((q) => q.next === id);
    return prior ? this.completed.has(prior.id) : false;
  }

  recordKill(species) {
    this.kills[species] = (this.kills[species] || 0) + 1;
  }

  /** Current progress toward a quest's goal. */
  progress(quest, player) {
    if (quest.type === 'collect') {
      return Math.min(quest.count, player.inventory.count(quest.item));
    }
    return Math.min(quest.count, this.kills[quest.species] || 0);
  }

  canComplete(quest, player) {
    return this.progress(quest, player) >= quest.count;
  }

  /** Hands in a quest: consumes items, grants rewards, unlocks the next. */
  complete(quest, player) {
    if (quest.type === 'collect') player.inventory.remove(quest.item, quest.count);
    this.active.delete(quest.id);
    this.completed.add(quest.id);
    if (quest.next) this.active.add(quest.next);
    const granted = [];
    for (const [id, n] of quest.reward) {
      const left = player.inventory.add(id, n);
      granted.push([id, n - left]);
    }
    return granted;
  }

  /** The quest to show in the HUD tracker. */
  get tracked() {
    for (const q of QUEST_ORDER) if (this.active.has(q.id)) return q;
    return null;
  }

  serialize() {
    return { active: [...this.active], completed: [...this.completed], kills: this.kills };
  }

  deserialize(d) {
    this.active = new Set(d.active || ['kindle']);
    this.completed = new Set(d.completed || []);
    this.kills = d.kills || {};
  }
}
