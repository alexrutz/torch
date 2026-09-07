// Every sound is synthesized at runtime. No audio files ship with the game,
// which keeps the whole thing a few hundred KB and instant to load on mobile.

const SCALES = {
  // semitone offsets from the root
  aeolian: [0, 2, 3, 5, 7, 8, 10],   // night — minor, unsettled
  lydian:  [0, 2, 4, 6, 7, 9, 11],   // day — bright, open
  pentMin: [0, 3, 5, 7, 10],         // caves — sparse and hollow
};

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volumes = { master: 0.7, sfx: 0.85, music: 0.32 };
    this._noise = null;
    this._musicTimer = 0;
    this._mood = 'day';
    this._lastStep = 0;
  }

  /** Browsers require a gesture before audio; call this from the first tap. */
  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.volumes.master;
    // A limiter keeps stacked explosions from clipping into crackle.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.master.connect(this.limiter).connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.volumes.sfx;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;                    // faded in by setMood
    // A long-ish reverb makes cheap oscillators sound like a place.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.4, 2.6);
    this.revSend = this.ctx.createGain();
    this.revSend.gain.value = 0.34;
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.revSend).connect(this.reverb).connect(this.master);

    this._noise = this._noiseBuffer(2);
    this.ready = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(kind, v) {
    this.volumes[kind] = v;
    if (!this.ready) return;
    if (kind === 'master') this.master.gain.value = this.muted ? 0 : v;
    if (kind === 'sfx') this.sfxBus.gain.value = v;
    if (kind === 'music') this.musicBus.gain.value = v;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ready) this.master.gain.value = this.muted ? 0 : this.volumes.master;
    return this.muted;
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Exponentially-decaying noise burst — a serviceable synthetic reverb. */
  _impulse(seconds, decay) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // ── primitives ─────────────────────────────────────────────────
  _tone({ freq = 440, to = null, type = 'square', dur = 0.15, gain = 0.2,
          attack = 0.005, delay = 0, bus = null, detune = 0,
          filter = null, q = 1, filterTo = null }) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    let node = osc;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = q;
      f.frequency.setValueAtTime(filter, t);
      if (filterTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t + dur);
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(bus || this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return osc;
  }

  _burst({ dur = 0.12, gain = 0.2, filter = 1200, filterTo = null,
           q = 1, type = 'lowpass', delay = 0, attack = 0.002 }) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(filter, t);
    if (filterTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  // ── the sound library ──────────────────────────────────────────
  play(name, opts = {}) {
    if (!this.ready || this.muted) return;
    const v = opts.volume ?? 1;
    const r = (a, b) => a + Math.random() * (b - a);

    switch (name) {
      case 'step': {
        // Throttled so a sprinting player doesn't machine-gun footsteps.
        const now = this.ctx.currentTime;
        if (now - this._lastStep < 0.12) return;
        this._lastStep = now;
        this._burst({ dur: 0.07, gain: 0.05 * v, filter: r(500, 900), filterTo: 220, q: 1.5 });
        break;
      }
      case 'mine':
        this._burst({ dur: 0.1, gain: 0.22 * v, filter: r(1800, 2600), filterTo: 400, q: 2 });
        this._tone({ freq: r(150, 200), to: 70, type: 'square', dur: 0.09, gain: 0.1 * v });
        break;
      case 'chop':
        this._burst({ dur: 0.13, gain: 0.2 * v, filter: r(700, 1000), filterTo: 200, q: 3 });
        this._tone({ freq: r(110, 140), to: 60, type: 'triangle', dur: 0.14, gain: 0.16 * v });
        break;
      case 'break':
        this._burst({ dur: 0.3, gain: 0.24 * v, filter: 3000, filterTo: 300, q: 1 });
        for (let i = 0; i < 3; i++) {
          this._tone({ freq: r(300, 700), to: r(80, 160), type: 'square',
                       dur: 0.11, gain: 0.07 * v, delay: i * 0.035 });
        }
        break;
      case 'place':
        this._tone({ freq: 320, to: 180, type: 'square', dur: 0.1, gain: 0.14 * v });
        this._burst({ dur: 0.08, gain: 0.12 * v, filter: 1400, filterTo: 400 });
        break;
      case 'swing':
        this._burst({ dur: 0.16, gain: 0.14 * v, filter: 400, filterTo: 2600,
                      type: 'bandpass', q: 1.2 });
        break;
      case 'hit':
        this._tone({ freq: r(220, 300), to: 90, type: 'square', dur: 0.12, gain: 0.2 * v });
        this._burst({ dur: 0.14, gain: 0.2 * v, filter: 2200, filterTo: 300, q: 1.5 });
        break;
      case 'crit':
        this._tone({ freq: 900, to: 200, type: 'sawtooth', dur: 0.2, gain: 0.2 * v,
                     filter: 3000, filterTo: 600 });
        this._burst({ dur: 0.22, gain: 0.22 * v, filter: 3400, filterTo: 260, q: 2 });
        break;
      case 'hurt':
        this._tone({ freq: 380, to: 120, type: 'sawtooth', dur: 0.28, gain: 0.24 * v,
                     filter: 1600, filterTo: 300 });
        break;
      case 'pickup':
        this._tone({ freq: 700, type: 'square', dur: 0.07, gain: 0.13 * v });
        this._tone({ freq: 1050, type: 'square', dur: 0.09, gain: 0.11 * v, delay: 0.055 });
        break;
      case 'coin':
        this._tone({ freq: 1180, type: 'square', dur: 0.07, gain: 0.12 * v });
        this._tone({ freq: 1770, type: 'square', dur: 0.14, gain: 0.1 * v, delay: 0.06 });
        break;
      case 'craft':
        [523, 659, 784, 1046].forEach((f, i) =>
          this._tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.13 * v, delay: i * 0.06 }));
        break;
      case 'levelup':
        [523, 659, 784, 1046, 1318].forEach((f, i) =>
          this._tone({ freq: f, type: 'square', dur: 0.3, gain: 0.11 * v, delay: i * 0.08 }));
        break;
      case 'torch':
        this._burst({ dur: 0.45, gain: 0.16 * v, filter: 900, filterTo: 2400, q: 0.8 });
        this._tone({ freq: 90, to: 220, type: 'sine', dur: 0.4, gain: 0.1 * v });
        break;
      case 'splash':
        this._burst({ dur: 0.34, gain: 0.16 * v, filter: 700, filterTo: 3000,
                      type: 'bandpass', q: 0.7 });
        break;
      case 'door':
        this._tone({ freq: 160, to: 90, type: 'sawtooth', dur: 0.3, gain: 0.12 * v,
                     filter: 700, filterTo: 200 });
        break;
      case 'magic':
        this._tone({ freq: 400, to: 1600, type: 'sine', dur: 0.4, gain: 0.14 * v });
        this._tone({ freq: 604, to: 2410, type: 'sine', dur: 0.4, gain: 0.08 * v, delay: 0.04 });
        break;
      case 'bow':
        this._burst({ dur: 0.1, gain: 0.16 * v, filter: 2000, filterTo: 600, q: 3 });
        this._tone({ freq: 700, to: 300, type: 'triangle', dur: 0.12, gain: 0.1 * v });
        break;
      case 'eat':
        this._burst({ dur: 0.1, gain: 0.11 * v, filter: 900, filterTo: 300, q: 2 });
        this._tone({ freq: 200, to: 320, type: 'triangle', dur: 0.14, gain: 0.09 * v, delay: 0.09 });
        break;
      case 'death':
        [440, 349, 262, 196].forEach((f, i) =>
          this._tone({ freq: f, to: f * 0.5, type: 'sawtooth', dur: 0.65, gain: 0.16 * v,
                       delay: i * 0.18, filter: 1400, filterTo: 200 }));
        break;
      case 'ui':
        this._tone({ freq: 660, type: 'square', dur: 0.045, gain: 0.07 * v });
        break;
      case 'deny':
        this._tone({ freq: 200, to: 130, type: 'square', dur: 0.13, gain: 0.11 * v });
        break;
      case 'quest':
        [659, 784, 988].forEach((f, i) =>
          this._tone({ freq: f, type: 'triangle', dur: 0.34, gain: 0.12 * v, delay: i * 0.11 }));
        break;
      case 'thunder':
        this._burst({ dur: 1.6, gain: 0.3 * v, filter: 400, filterTo: 60, q: 0.6 });
        this._tone({ freq: 60, to: 28, type: 'sine', dur: 1.4, gain: 0.22 * v });
        break;
    }
  }

  // ── generative score ───────────────────────────────────────────
  /** @param {'day'|'night'|'cave'|'danger'|'village'|'none'} mood */
  setMood(mood) {
    if (mood === this._mood) return;
    this._mood = mood;
    if (!this.ready) return;
    const target = mood === 'none' ? 0 : this.volumes.music;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(g.value, this.ctx.currentTime);
    g.linearRampToValueAtTime(target, this.ctx.currentTime + 2.5);
  }

  /** Called every frame; emits a phrase whenever the previous one has decayed. */
  updateMusic(dt) {
    if (!this.ready || this.muted || this._mood === 'none') return;
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;

    const cfg = {
      day:     { scale: 'lydian',  root: 60, gap: [3.5, 6], notes: 3, wave: 'triangle', oct: 0 },
      village: { scale: 'lydian',  root: 62, gap: [2.5, 4.5], notes: 4, wave: 'triangle', oct: 0 },
      night:   { scale: 'aeolian', root: 55, gap: [5, 9],   notes: 2, wave: 'sine', oct: -12 },
      cave:    { scale: 'pentMin', root: 50, gap: [6, 11],  notes: 2, wave: 'sine', oct: -12 },
      danger:  { scale: 'aeolian', root: 48, gap: [1.6, 2.8], notes: 3, wave: 'sawtooth', oct: -12 },
    }[this._mood] || { scale: 'lydian', root: 60, gap: [4, 7], notes: 3, wave: 'triangle', oct: 0 };

    const scale = SCALES[cfg.scale];
    const root = cfg.root + cfg.oct;

    // A low drone anchors the phrase.
    this._tone({ freq: midi(root - 12), type: 'sine', dur: 5, gain: 0.05,
                 attack: 1.2, bus: this.musicBus });

    for (let i = 0; i < cfg.notes; i++) {
      const deg = scale[Math.floor(Math.random() * scale.length)];
      const octave = Math.random() < 0.3 ? 12 : 0;
      this._tone({
        freq: midi(root + deg + octave), type: cfg.wave,
        dur: 1.6 + Math.random() * 1.6, gain: 0.055, attack: 0.25,
        delay: i * (0.4 + Math.random() * 0.7), bus: this.musicBus,
        filter: 2200, filterTo: 700,
      });
    }
    this._musicTimer = cfg.gap[0] + Math.random() * (cfg.gap[1] - cfg.gap[0]);
  }
}
