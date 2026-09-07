// A flat, pooled particle system. Everything is a coloured rectangle, which is
// all pixel art needs and keeps thousands of them cheap.

const MAX = 900;

export class Particles {
  constructor() {
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.color = new Array(MAX).fill('#fff');
    this.glow = new Uint8Array(MAX);
    this.count = 0;
    this.next = 0;
  }

  spawn({ x, y, vx = 0, vy = 0, life = 0.5, size = 1, color = '#fff',
          gravity = 0, drag = 0.98, glow = false }) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    if (this.count < MAX) this.count++;
    this.x[i] = x; this.y[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size; this.color[i] = color;
    this.grav[i] = gravity; this.drag[i] = drag;
    this.glow[i] = glow ? 1 : 0;
  }

  /** Radial burst — the workhorse for hits, breaks and pickups. */
  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (opts.speed ?? 40) * (0.35 + Math.random() * 0.65);
      this.spawn({
        ...opts, x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8,
        life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.7),
        size: opts.size ?? 1,
        color: Array.isArray(opts.color)
          ? opts.color[(Math.random() * opts.color.length) | 0]
          : (opts.color ?? '#fff'),
      });
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      this.vy[i] += this.grav[i] * dt;
      const d = Math.pow(this.drag[i], dt * 60);
      this.vx[i] *= d; this.vy[i] *= d;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }

  draw(ctx, camLeft, camTop) {
    for (let i = 0; i < MAX; i++) {
      const l = this.life[i];
      if (l <= 0) continue;
      const t = l / this.maxLife[i];
      ctx.globalAlpha = t > 0.35 ? 1 : t / 0.35;
      ctx.fillStyle = this.color[i];
      const s = Math.max(1, Math.round(this.size[i] * (0.4 + t * 0.6)));
      ctx.fillRect(Math.round(this.x[i] - camLeft), Math.round(this.y[i] - camTop), s, s);
    }
    ctx.globalAlpha = 1;
  }

  /** Particles flagged `glow` also act as tiny light sources. */
  collectLights(out, tileSize) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0 || !this.glow[i]) continue;
      out.push({
        x: this.x[i] / tileSize, y: this.y[i] / tileSize,
        rgb: [1, 0.7, 0.35], strength: 0.25 * (this.life[i] / this.maxLife[i]),
      });
    }
  }

  clear() { this.life.fill(0); }
}
