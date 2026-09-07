// One input surface over keyboard, mouse and touch. The game only ever asks
// "is `use` held?" — it never cares which device answered.

const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'use', KeyJ: 'use',
  KeyE: 'interact', KeyF: 'interact',
  KeyI: 'inventory', Tab: 'inventory',
  KeyC: 'craft', KeyM: 'map', KeyQ: 'drop',
  Escape: 'menu', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Digit1: 'slot0', Digit2: 'slot1', Digit3: 'slot2', Digit4: 'slot3', Digit5: 'slot4',
  Digit6: 'slot5', Digit7: 'slot6', Digit8: 'slot7', Digit9: 'slot8', Digit0: 'slot9',
};

/** Keys we swallow so the browser doesn't scroll / tab away mid-fight. */
const SWALLOW = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedNow = new Set();
    this.releasedNow = new Set();
    this.stick = { x: 0, y: 0 };          // touch joystick, already normalized
    this.pointer = { x: 0, y: 0, active: false, down: false };
    this.wheel = 0;
    this.touchMode = matchMedia('(pointer: coarse)').matches;
    this._stickId = null;
    this._stickOrigin = { x: 0, y: 0 };
    this._bind();
  }

  // ── queries ────────────────────────────────────────────────────
  held(action) { return this.down.has(action); }
  pressed(action) { return this.pressedNow.has(action); }
  released(action) { return this.releasedNow.has(action); }

  /** Movement intent as a unit-ish vector; keyboard and stick both feed it. */
  moveVector() {
    let x = this.stick.x, y = this.stick.y;
    if (this.down.has('left')) x -= 1;
    if (this.down.has('right')) x += 1;
    if (this.down.has('up')) y -= 1;
    if (this.down.has('down')) y += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, len: Math.min(len, 1) };
  }

  /** Call once at the end of every simulation tick. */
  endFrame() {
    this.pressedNow.clear();
    this.releasedNow.clear();
    this.wheel = 0;
  }

  /** Lets UI code inject a press (touch buttons, on-screen menus). */
  press(action) { this.down.add(action); this.pressedNow.add(action); }
  release(action) { this.down.delete(action); this.releasedNow.add(action); }

  /** Drops every held key — used when a modal opens or the tab blurs. */
  clear() {
    for (const a of this.down) this.releasedNow.add(a);
    this.down.clear();
    this.stick.x = this.stick.y = 0;
    this._stickId = null;
  }

  // ── wiring ─────────────────────────────────────────────────────
  _bind() {
    addEventListener('keydown', (e) => {
      const a = KEY_MAP[e.code];
      if (!a) return;
      if (SWALLOW.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.press(a);
    });
    addEventListener('keyup', (e) => {
      const a = KEY_MAP[e.code];
      if (a) this.release(a);
    });
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });

    const c = this.canvas;
    const toLocal = (e) => {
      const r = c.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
      this.pointer.active = true;
    };
    c.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') toLocal(e); });
    c.addEventListener('pointerdown', (e) => {
      toLocal(e);
      this.pointer.down = true;
      if (e.pointerType !== 'touch') this.press('use');
    });
    addEventListener('pointerup', (e) => {
      this.pointer.down = false;
      if (e.pointerType !== 'touch') this.release('use');
    });
    c.addEventListener('pointerleave', () => { this.pointer.active = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); },
      { passive: false });
  }

  /**
   * Attaches the on-screen joystick. The knob tracks the finger within a
   * radius; dragging past it clamps instead of detaching, which feels far
   * better on a phone than a re-centering stick.
   */
  attachStick(el, knob, radius = 40) {
    const set = (dx, dy) => {
      const d = Math.hypot(dx, dy);
      const k = d > radius ? radius / d : 1;
      const kx = dx * k, ky = dy * k;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      // Small dead zone so resting thumbs don't creep the character.
      const dead = radius * 0.18;
      if (d < dead) { this.stick.x = this.stick.y = 0; return; }
      const mag = Math.min(1, (d - dead) / (radius - dead));
      this.stick.x = (dx / d) * mag;
      this.stick.y = (dy / d) * mag;
    };
    const reset = () => {
      this._stickId = null;
      this.stick.x = this.stick.y = 0;
      knob.style.transform = '';
    };

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this._stickId = e.pointerId;
      const r = el.getBoundingClientRect();
      this._stickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      set(e.clientX - this._stickOrigin.x, e.clientY - this._stickOrigin.y);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickId) return;
      e.preventDefault();
      set(e.clientX - this._stickOrigin.x, e.clientY - this._stickOrigin.y);
    });
    for (const ev of ['pointerup', 'pointercancel']) {
      el.addEventListener(ev, (e) => { if (e.pointerId === this._stickId) reset(); });
    }
  }

  /** Wires a DOM button to an action for its whole press duration. */
  attachButton(el, action) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      this.press(action);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      el.addEventListener(ev, () => { if (this.down.has(action)) this.release(action); });
    }
  }
}
