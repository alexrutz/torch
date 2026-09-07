// A flat slot array. The first HOTBAR slots are the hotbar; the rest is the bag.

import { ITEMS, maxStack } from '../world/items.js';

export const HOTBAR = 8;
export const BAG = 24;
export const SLOTS = HOTBAR + BAG;

export class Inventory {
  constructor(size = SLOTS) {
    /** @type {Array<{id:string,count:number,durability?:number}|null>} */
    this.slots = new Array(size).fill(null);
    this.selected = 0;
  }

  get held() { return this.slots[this.selected]; }

  /** Fresh stack, with durability primed for tools. */
  static make(id, count = 1) {
    const it = ITEMS[id];
    if (!it) return null;
    const stack = { id, count };
    if (it.tool) stack.durability = it.tool.durability;
    return stack;
  }

  /**
   * Adds items, filling partial stacks first.
   * @returns {number} how many could not fit
   */
  add(id, count = 1) {
    const it = ITEMS[id];
    if (!it) return count;
    const cap = maxStack(id);
    let left = count;

    if (cap > 1) {
      for (const s of this.slots) {
        if (left <= 0) break;
        if (s && s.id === id && s.count < cap) {
          const take = Math.min(cap - s.count, left);
          s.count += take;
          left -= take;
        }
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const take = Math.min(cap, left);
      const stack = Inventory.make(id, take);
      this.slots[i] = stack;
      left -= take;
    }
    return left;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  has(id, n = 1) { return this.count(id) >= n; }

  /** Removes n of an item. Returns true only if the full amount was removed. */
  remove(id, n = 1) {
    if (this.count(id) < n) return false;
    let left = n;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      if (s.count <= 0) this.slots[i] = null;
    }
    return true;
  }

  removeAt(index, n = 1) {
    const s = this.slots[index];
    if (!s) return null;
    const take = Math.min(s.count, n);
    s.count -= take;
    const out = { id: s.id, count: take, durability: s.durability };
    if (s.count <= 0) this.slots[index] = null;
    return out;
  }

  /** Swaps two slots, merging instead when they hold the same stackable item. */
  swap(a, b) {
    if (a === b) return;
    const A = this.slots[a], B = this.slots[b];
    if (A && B && A.id === B.id && maxStack(A.id) > 1) {
      const cap = maxStack(A.id);
      const move = Math.min(cap - B.count, A.count);
      if (move > 0) {
        B.count += move;
        A.count -= move;
        if (A.count <= 0) this.slots[a] = null;
        return;
      }
    }
    this.slots[a] = B;
    this.slots[b] = A;
  }

  /** Spends one point of tool durability; returns true if the tool broke. */
  wearHeld(amount = 1) {
    const s = this.held;
    if (!s || s.durability == null) return false;
    s.durability -= amount;
    if (s.durability <= 0) {
      this.slots[this.selected] = null;
      return true;
    }
    return false;
  }

  get isEmpty() { return this.slots.every((s) => !s); }

  serialize() { return { slots: this.slots, selected: this.selected }; }
  deserialize(d) {
    this.slots = (d.slots || []).slice(0, SLOTS);
    while (this.slots.length < SLOTS) this.slots.push(null);
    this.selected = d.selected ?? 0;
  }
}
