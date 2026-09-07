// Follows a target with critically-damped smoothing and snaps to whole pixels
// so the tile grid never shimmers.

import { TS } from './tileart.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;          // centre, in world pixels
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.vw = 320; this.vh = 180;    // viewport, in game pixels
  }

  snapTo(wx, wy) { this.x = wx; this.y = wy; }

  follow(wx, wy, dt, lead = { x: 0, y: 0 }) {
    // Frame-rate independent exponential smoothing.
    const k = 1 - Math.exp(-8 * dt);
    this.x += (wx + lead.x - this.x) * k;
    this.y += (wy + lead.y - this.y) * k;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.6);
      const m = this.shake * this.shake * 5;
      this.shakeX = (Math.random() * 2 - 1) * m;
      this.shakeY = (Math.random() * 2 - 1) * m;
    } else {
      this.shakeX = this.shakeY = 0;
    }
  }

  addShake(amount) { this.shake = Math.min(1.6, this.shake + amount); }

  get left()   { return Math.round(this.x + this.shakeX - this.vw / 2); }
  get top()    { return Math.round(this.y + this.shakeY - this.vh / 2); }

  /** Inclusive tile bounds currently on screen, with a margin. */
  tileBounds(margin = 1) {
    return {
      x0: Math.floor(this.left / TS) - margin,
      y0: Math.floor(this.top / TS) - margin,
      x1: Math.ceil((this.left + this.vw) / TS) + margin,
      y1: Math.ceil((this.top + this.vh) / TS) + margin,
    };
  }

  worldToScreen(wx, wy) { return { x: wx - this.left, y: wy - this.top }; }
  screenToWorld(sx, sy) { return { x: sx + this.left, y: sy + this.top }; }
}
