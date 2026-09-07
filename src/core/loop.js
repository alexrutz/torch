// Fixed-timestep simulation with an interpolated render pass.
// Physics stays deterministic regardless of frame rate; drawing runs as fast
// as the display allows.

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
const MAX_CATCHUP = 5;   // never simulate more than this many ticks per frame

export class Loop {
  /**
   * @param {(dt:number)=>void} update  called at a fixed TICK_MS, dt in seconds
   * @param {(alpha:number)=>void} render called once per animation frame
   */
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.accumulator = 0;
    this.last = 0;
    this.frame = 0;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._raf = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);

    let elapsed = now - this.last;
    this.last = now;
    // A backgrounded tab can hand us a huge gap; clamp rather than spiral.
    if (elapsed > 250) elapsed = 250;
    this.accumulator += elapsed;

    let steps = 0;
    while (this.accumulator >= TICK_MS && steps < MAX_CATCHUP) {
      this.update(TICK_MS / 1000);
      this.accumulator -= TICK_MS;
      steps++;
      this.frame++;
    }
    if (steps === MAX_CATCHUP) this.accumulator = 0;  // gave up catching up

    this.render(this.accumulator / TICK_MS);

    this._fpsAccum += elapsed;
    this._fpsFrames++;
    if (this._fpsAccum >= 500) {
      this.fps = Math.round((this._fpsFrames * 1000) / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }
}
