// World clock, sky colour and weather.
//
// The ambient sky colour returned here is fed straight into the light map, so
// this module is what decides whether a torch is decoration or survival gear.

import { lerp, clamp, fbmN } from '../core/rng.js';

export const DAY_LENGTH = 720;            // seconds of real time per full day

// Keyframes across a day: [fraction, [r,g,b], label]. Interpolated smoothly.
const SKY = [
  [0.00, [0.10, 0.13, 0.26], 'night'],
  [0.20, [0.11, 0.14, 0.28], 'night'],
  [0.25, [0.34, 0.24, 0.34], 'dawn'],
  [0.30, [0.72, 0.52, 0.44], 'dawn'],
  [0.36, [0.95, 0.88, 0.78], 'morning'],
  [0.50, [1.00, 0.98, 0.92], 'noon'],
  [0.66, [0.96, 0.90, 0.78], 'afternoon'],
  [0.72, [0.82, 0.54, 0.38], 'dusk'],
  [0.78, [0.42, 0.28, 0.38], 'dusk'],
  [0.84, [0.13, 0.15, 0.30], 'night'],
  [1.00, [0.10, 0.13, 0.26], 'night'],
];

export const WEATHERS = {
  clear: { label: 'Clear',    tint: [1, 1, 1],          dim: 1.00, particles: null },
  cloudy:{ label: 'Overcast', tint: [0.92, 0.94, 1.00], dim: 0.82, particles: null },
  rain:  { label: 'Rain',     tint: [0.78, 0.86, 1.00], dim: 0.66, particles: 'rain' },
  storm: { label: 'Storm',    tint: [0.62, 0.70, 0.95], dim: 0.46, particles: 'storm' },
  snow:  { label: 'Snowfall', tint: [0.92, 0.96, 1.05], dim: 0.74, particles: 'snow' },
  fog:   { label: 'Fog',      tint: [0.86, 0.88, 0.92], dim: 0.70, particles: 'fog' },
};

export class WorldClock {
  constructor(seed, startFraction = 0.30) {
    this.seed = seed;
    this.elapsed = startFraction * DAY_LENGTH;   // seconds since world creation
    this.day = 1;
    this.weather = 'clear';
    this._weatherTimer = 90;
    this.lightning = 0;
  }

  get fraction() { return (this.elapsed % DAY_LENGTH) / DAY_LENGTH; }
  get hour() { return this.fraction * 24; }

  /** 'HH:MM' for the HUD. */
  get clockText() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get phase() {
    const f = this.fraction;
    for (let i = SKY.length - 1; i >= 0; i--) if (f >= SKY[i][0]) return SKY[i][2];
    return 'night';
  }

  get isNight() {
    const f = this.fraction;
    return f < 0.24 || f > 0.80;
  }

  /** 0 at high noon, 1 at deepest night — drives spawn rates and music. */
  get darkness() {
    const [r, g, b] = this.rawSky();
    return clamp(1 - (r + g + b) / 3, 0, 1);
  }

  rawSky() {
    const f = this.fraction;
    for (let i = 0; i < SKY.length - 1; i++) {
      const [f0, c0] = SKY[i], [f1, c1] = SKY[i + 1];
      if (f >= f0 && f <= f1) {
        const t = (f - f0) / (f1 - f0);
        return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
      }
    }
    return SKY[0][1];
  }

  /** Sky colour with weather applied. This is the light map's ambient term. */
  ambient(indoorsFactor = 1) {
    const w = WEATHERS[this.weather];
    const [r, g, b] = this.rawSky();
    let m = w.dim * indoorsFactor;
    if (this.lightning > 0) m += this.lightning * 2.2;   // sheet lightning
    return [
      clamp(r * w.tint[0] * m, 0, 2),
      clamp(g * w.tint[1] * m, 0, 2),
      clamp(b * w.tint[2] * m, 0, 2),
    ];
  }

  update(dt, biomeName = 'meadow') {
    const before = Math.floor(this.elapsed / DAY_LENGTH);
    this.elapsed += dt;
    const after = Math.floor(this.elapsed / DAY_LENGTH);
    if (after > before) this.day += after - before;

    if (this.lightning > 0) this.lightning = Math.max(0, this.lightning - dt * 6);

    this._weatherTimer -= dt;
    if (this._weatherTimer <= 0) {
      this._weatherTimer = 60 + Math.random() * 180;
      this.weather = this._rollWeather(biomeName);
    }
    if (this.weather === 'storm' && Math.random() < dt * 0.12) this.lightning = 1;
  }

  /** Weather is biome-flavoured: deserts stay clear, tundra gets snow. */
  _rollWeather(biome) {
    const drift = fbmN(this.seed + 313, this.elapsed * 0.004, 0, 2);
    const table = {
      desert:   [[6, 'clear'], [2, 'cloudy'], [1, 'fog']],
      tundra:   [[3, 'clear'], [3, 'cloudy'], [4, 'snow']],
      taiga:    [[4, 'clear'], [3, 'cloudy'], [3, 'snow']],
      swamp:    [[2, 'clear'], [3, 'cloudy'], [3, 'rain'], [3, 'fog']],
      highland: [[4, 'clear'], [3, 'cloudy'], [2, 'rain'], [1, 'storm']],
    }[biome] || [[6, 'clear'], [3, 'cloudy'], [2, 'rain'], [1, 'storm'], [1, 'fog']];

    let total = 0;
    for (const [w] of table) total += w;
    // Nudge the roll with slow noise so weather drifts instead of flickering.
    let roll = ((drift + 1) / 2) * total;
    for (const [w, name] of table) { roll -= w; if (roll <= 0) return name; }
    return 'clear';
  }

  /** Jumps to the next dawn. Used by beds. */
  sleepUntilDawn() {
    const target = 0.28;
    const f = this.fraction;
    const advance = ((target - f + 1) % 1) * DAY_LENGTH;
    this.elapsed += advance;
    this.day = Math.floor(this.elapsed / DAY_LENGTH) + 1;
    this.weather = 'clear';
    return advance;
  }

  serialize() { return { elapsed: this.elapsed, day: this.day, weather: this.weather }; }
  deserialize(d) {
    this.elapsed = d.elapsed ?? 0;
    this.day = d.day ?? 1;
    this.weather = d.weather ?? 'clear';
  }
}
