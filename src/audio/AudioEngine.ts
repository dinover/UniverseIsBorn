/**
 * Fully procedural audio (WebAudio). Nothing is downloaded: every sound is synthesised,
 * which keeps the game tiny, license-free and lets audio react continuously to gameplay.
 */

export interface MusicEra {
  root: number; // Hz
  scale: number[]; // semitone offsets
  brightness: number; // 0..1 filter openness
  shimmer: number; // bell density
  chordSeconds: number;
}

export const ERAS: Record<string, MusicEra> = {
  primordial: { root: 55, scale: [0, 2, 3, 7, 10], brightness: 0.25, shimmer: 0.25, chordSeconds: 12 },
  cloud: { root: 49, scale: [0, 3, 5, 7, 10], brightness: 0.35, shimmer: 0.35, chordSeconds: 11 },
  protostar: { root: 58.27, scale: [0, 2, 4, 7, 9], brightness: 0.5, shimmer: 0.4, chordSeconds: 10 },
  star: { root: 65.41, scale: [0, 2, 4, 7, 9, 11], brightness: 0.7, shimmer: 0.55, chordSeconds: 9 },
  iron: { root: 43.65, scale: [0, 1, 3, 6, 7, 10], brightness: 0.4, shimmer: 0.2, chordSeconds: 6 },
  blackhole: { root: 41.2, scale: [0, 2, 3, 7, 8], brightness: 0.45, shimmer: 0.45, chordSeconds: 12 },
  active: { root: 46.25, scale: [0, 2, 3, 5, 7, 10], brightness: 0.6, shimmer: 0.6, chordSeconds: 9 },
  galaxy: { root: 36.71, scale: [0, 2, 4, 7, 9, 14], brightness: 0.65, shimmer: 0.75, chordSeconds: 14 },
};

const semi = (root: number, s: number) => root * Math.pow(2, s / 12);

export interface LoopHandle {
  set(level: number, param?: number): void;
  stop(fade?: number): void;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  musicVolume = 0.6;
  sfxVolume = 0.8;
  private era: MusicEra = ERAS.primordial;
  intensity = 0.2;
  private targetIntensity = 0.2;
  private pads: { oscs: OscillatorNode[]; gain: GainNode }[] = [];
  private padFilter!: BiquadFilterNode;
  private padGain!: GainNode;
  private drone!: OscillatorNode;
  private drone2!: OscillatorNode;
  private droneGain!: GainNode;
  private wind!: AudioBufferSourceNode;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private chordTimer = 0;
  private bellTimer = 0;
  private chordIdx = 0;
  private lastAbsorb = 0;
  private swellT = 0;
  muted = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);

    // Noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Generated reverb impulse (long, dark, spacey)
    this.reverb = ctx.createConvolver();
    const irLen = ctx.sampleRate * 5;
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen;
        lp = lp * 0.7 + (Math.random() * 2 - 1) * 0.3;
        ch[i] = lp * Math.pow(1 - t, 2.2);
      }
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.8;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.startMusic();
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music, this.ctx.currentTime, 0.1);
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.1);
  }

  suspend(v: boolean) {
    if (!this.ctx) return;
    if (v) this.ctx.suspend();
    else this.ctx.resume();
  }

  private startMusic() {
    const ctx = this.ctx!;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 0.7;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.musicBus);
    this.padGain.connect(this.reverbSend);
    for (let v = 0; v < 4; v++) {
      const g = ctx.createGain();
      g.gain.value = 0.05;
      g.connect(this.padFilter);
      const oscs: OscillatorNode[] = [];
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = det + (Math.random() - 0.5) * 4;
        o.frequency.value = 110;
        o.connect(g);
        o.start();
        oscs.push(o);
      }
      this.pads.push({ oscs, gain: g });
    }
    this.padGain.gain.setTargetAtTime(0.5, ctx.currentTime, 3);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.musicBus);
    this.drone = ctx.createOscillator();
    this.drone.type = 'sine';
    this.drone.frequency.value = this.era.root;
    this.drone.connect(this.droneGain);
    this.drone.start();
    this.drone2 = ctx.createOscillator();
    this.drone2.type = 'triangle';
    this.drone2.frequency.value = this.era.root * 1.5;
    const d2g = ctx.createGain();
    d2g.gain.value = 0.25;
    this.drone2.connect(d2g).connect(this.droneGain);
    this.drone2.start();
    this.droneGain.gain.setTargetAtTime(0.22, ctx.currentTime, 4);

    this.wind = ctx.createBufferSource();
    this.wind.buffer = this.noiseBuf;
    this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 1.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.03;
    this.wind.connect(this.windFilter).connect(this.windGain);
    this.windGain.connect(this.musicBus);
    this.windGain.connect(this.reverbSend);
    this.wind.start();
    this.applyChord(true);
  }

  setEra(name: keyof typeof ERAS | string) {
    const e = ERAS[name];
    if (!e || e === this.era) return;
    this.era = e;
    this.chordTimer = 0.1;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.drone.frequency.setTargetAtTime(e.root, t, 2);
      this.drone2.frequency.setTargetAtTime(e.root * 1.5, t, 2);
    }
  }

  setIntensity(v: number) {
    this.targetIntensity = Math.max(0, Math.min(1, v));
  }

  /** Temporarily push the music up for a big moment. */
  swell(seconds = 6) {
    this.swellT = Math.max(this.swellT, seconds);
  }

  private applyChord(immediate = false) {
    if (!this.ctx) return;
    const e = this.era;
    const sc = e.scale;
    this.chordIdx = (this.chordIdx + 1 + Math.floor(Math.random() * 3)) % sc.length;
    const base = this.chordIdx;
    const notes = [sc[base], sc[(base + 2) % sc.length] + (base + 2 >= sc.length ? 12 : 0), sc[(base + 4) % sc.length] + (base + 4 >= sc.length ? 12 : 0), sc[base] + 12];
    const t = this.ctx.currentTime;
    this.pads.forEach((p, i) => {
      const f = semi(e.root * 2, notes[i]);
      for (const o of p.oscs) {
        if (immediate) o.frequency.value = f;
        else o.frequency.setTargetAtTime(f, t, 1.5);
      }
    });
  }

  private bell(freq: number, gain = 0.05, dur = 3) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.76;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverbSend);
    o.start(t);
    o2.start(t);
    o.stop(t + dur);
    o2.stop(t + dur);
  }

  update(dt: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 0.8);
    this.swellT = Math.max(0, this.swellT - dt);
    const I = Math.min(1, this.intensity + (this.swellT > 0 ? 0.35 : 0));
    const t = this.ctx.currentTime;
    const e = this.era;
    this.padFilter.frequency.setTargetAtTime(300 + (e.brightness * 1600 + I * 2200), t, 0.5);
    this.padGain.gain.setTargetAtTime(0.35 + I * 0.35, t, 0.8);
    this.windFilter.frequency.setTargetAtTime(250 + I * 900 + Math.sin(t * 0.13) * 150, t, 0.5);
    this.windGain.gain.setTargetAtTime(0.02 + I * 0.05, t, 0.5);
    this.chordTimer -= dt;
    if (this.chordTimer <= 0) {
      this.chordTimer = e.chordSeconds * (1.2 - I * 0.5);
      this.applyChord();
    }
    this.bellTimer -= dt;
    if (this.bellTimer <= 0) {
      this.bellTimer = (1.8 + Math.random() * 3.5) / (0.3 + e.shimmer * (0.5 + I));
      const s = e.scale[Math.floor(Math.random() * e.scale.length)];
      const oct = Math.random() < 0.5 ? 8 : 16;
      this.bell(semi(e.root * oct, s), 0.025 + I * 0.03, 4);
    }
  }

  // ---------------------------------------------------------------- SFX helpers
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; to?: number; reverb?: number; delay?: number } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + dur);
    const g = ctx.createGain();
    this.env(g, t, opts.attack ?? 0.005, opts.gain ?? 0.1, dur);
    o.connect(g).connect(this.sfxBus);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + dur + (opts.attack ?? 0.005) + 0.05);
  }

  private noise(dur: number, opts: { type?: BiquadFilterType; from?: number; to?: number; q?: number; gain?: number; attack?: number; reverb?: number } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'lowpass';
    f.frequency.setValueAtTime(opts.from ?? 2000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, opts.attack ?? 0.01, opts.gain ?? 0.2, dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    src.start(t, Math.random());
    src.stop(t + dur + (opts.attack ?? 0.01) + 0.1);
  }

  // ---------------------------------------------------------------- Game SFX
  absorb(pitch = 0.5, gain = 0.04) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastAbsorb < 0.035) return;
    this.lastAbsorb = now;
    const f = semi(440, this.era.scale[Math.floor(Math.random() * this.era.scale.length)] + Math.round(pitch * 12));
    this.tone(f, 0.25, { gain, attack: 0.004, reverb: 0.5 });
  }

  pulse() {
    this.noise(0.9, { type: 'bandpass', from: 2400, to: 150, q: 2, gain: 0.25, reverb: 0.4 });
    this.tone(140, 0.7, { to: 50, gain: 0.25 });
  }

  whoosh(gain = 0.2) {
    this.noise(0.8, { type: 'bandpass', from: 300, to: 3000, q: 1.5, gain, attack: 0.3, reverb: 0.4 });
  }

  hit(q: 'perfect' | 'good' | 'miss', combo = 0) {
    if (q === 'miss') {
      this.tone(90, 0.4, { type: 'triangle', to: 55, gain: 0.3 });
      this.noise(0.3, { from: 600, to: 100, gain: 0.15 });
      return;
    }
    const e = this.era;
    const step = e.scale[combo % e.scale.length] + 12 * Math.floor(combo / e.scale.length) % 24;
    const base = semi(e.root * 8, step);
    this.tone(base, q === 'perfect' ? 1.2 : 0.7, { gain: q === 'perfect' ? 0.16 : 0.1, reverb: 0.7 });
    if (q === 'perfect') {
      this.tone(base * 1.5, 1.0, { gain: 0.08, reverb: 0.7, delay: 0.03 });
      this.tone(base * 2, 0.8, { gain: 0.05, reverb: 0.7, delay: 0.06 });
    }
    this.tone(70, 0.3, { to: 40, gain: 0.25 });
  }

  thump(gain = 0.35) {
    this.tone(80, 0.35, { to: 38, gain });
    this.noise(0.12, { from: 400, to: 80, gain: gain * 0.3 });
  }

  warning() {
    this.tone(220, 0.18, { type: 'square', gain: 0.05 });
    this.tone(165, 0.25, { type: 'square', gain: 0.05, delay: 0.2 });
  }

  ignite() {
    const e = this.era;
    for (let i = 0; i < 6; i++) this.tone(semi(e.root * 4, e.scale[i % e.scale.length] + 12 * Math.floor(i / 3)), 4, { gain: 0.07, attack: 0.8 + i * 0.1, reverb: 1, delay: i * 0.08 });
    this.noise(3, { type: 'highpass', from: 800, to: 6000, gain: 0.08, attack: 1.2, reverb: 0.8 });
    this.tone(60, 3, { to: 30, gain: 0.4, attack: 0.3 });
  }

  collapseSuck(dur = 2) {
    this.noise(dur, { type: 'bandpass', from: 200, to: 4000, q: 3, gain: 0.25, attack: dur * 0.9 });
    this.tone(40, dur, { to: 160, gain: 0.3, attack: dur * 0.9 });
  }

  boom() {
    this.noise(6, { from: 9000, to: 60, gain: 0.8, attack: 0.005, reverb: 1.2 });
    this.tone(55, 5, { to: 22, gain: 0.9, attack: 0.005 });
    this.tone(110, 3, { to: 30, gain: 0.4, type: 'triangle' });
    for (let i = 0; i < 5; i++) this.tone(semi(this.era.root * 8, this.era.scale[i % this.era.scale.length]), 7, { gain: 0.05, attack: 1.5, reverb: 1.2, delay: 0.5 });
  }

  chirp(dur: number) {
    this.tone(35, dur, { to: 420, gain: 0.22, attack: dur * 0.85, reverb: 0.5 });
    this.tone(70, dur, { to: 840, gain: 0.06, attack: dur * 0.85, type: 'triangle' });
  }

  ringdown() {
    this.tone(260, 3, { to: 180, gain: 0.3, reverb: 1 });
    this.tone(50, 2.5, { to: 25, gain: 0.7 });
    this.noise(2.5, { from: 5000, to: 80, gain: 0.35, reverb: 1 });
  }

  tde() {
    this.noise(2.2, { type: 'bandpass', from: 3000, to: 200, q: 2, gain: 0.3, reverb: 0.8 });
    this.tone(400, 1.5, { to: 90, gain: 0.12, type: 'sawtooth' });
  }

  capture(size = 0.5) {
    this.tone(semi(220, Math.round((1 - size) * 12)), 0.9, { gain: 0.12, reverb: 0.8 });
    this.tone(55, 0.6, { to: 30, gain: 0.25 * size + 0.1 });
  }

  discovery() {
    const e = this.era;
    [0, 2, 4].forEach((i, k) => this.tone(semi(e.root * 16, e.scale[i % e.scale.length]), 1.6, { gain: 0.06, reverb: 1, delay: k * 0.12 }));
  }

  achievement() {
    [0, 4, 7, 12].forEach((s, k) => this.tone(semi(523.25, s), 1.2, { gain: 0.07, reverb: 0.9, delay: k * 0.09, type: 'triangle' }));
  }

  /** Bell-like note of a major pentatonic scale (minigames: memory melodies, chimes). */
  note(i: number, dur = 0.7, gain = 0.1) {
    const PENTA = [0, 2, 4, 7, 9];
    const st = PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);
    const f = semi(392, st);
    this.tone(f, dur, { type: 'triangle', gain, reverb: 0.8 });
    this.tone(f * 2, dur * 0.6, { gain: gain * 0.35, reverb: 0.8 });
  }

  /** Heartbeat of a star (rhythm minigame). `strong` marks the beat to hit. */
  beat(strong = true) {
    this.tone(strong ? 62 : 48, 0.28, { to: 34, gain: strong ? 0.38 : 0.18 });
    if (strong) this.noise(0.08, { from: 1800, to: 300, gain: 0.05 });
  }

  /** Gentle three-note bell (pomodoro transitions). */
  chime(rising = true) {
    const notes = rising ? [0, 4, 7] : [7, 4, 0];
    notes.forEach((s, k) => {
      const f = semi(523.25, s);
      this.tone(f, 2.4, { type: 'sine', gain: 0.09, reverb: 1, delay: k * 0.32 });
      this.tone(f * 2, 1.4, { gain: 0.025, reverb: 1, delay: k * 0.32 });
    });
  }

  /** A distant, soft explosion: no jump scares while studying. */
  softBoom() {
    this.noise(4, { from: 2500, to: 60, gain: 0.12, attack: 0.05, reverb: 1.2 });
    this.tone(48, 3.5, { to: 26, gain: 0.22, attack: 0.04 });
  }

  /** Short wrong-answer buzz. */
  buzz() {
    this.tone(140, 0.35, { type: 'square', gain: 0.05, to: 90 });
  }

  /** Tiny sparkle for collecting things. */
  sparkle(pitch = 0) {
    this.tone(semi(1046.5, pitch), 0.35, { gain: 0.05, reverb: 0.7 });
  }

  ui(kind: 'hover' | 'click' | 'open' | 'back' = 'click') {
    if (kind === 'hover') this.tone(1800, 0.06, { gain: 0.015 });
    else if (kind === 'click') this.tone(900, 0.12, { gain: 0.05, to: 1300, reverb: 0.3 });
    else if (kind === 'open') this.whoosh(0.08);
    else this.tone(700, 0.12, { gain: 0.05, to: 400 });
  }

  /** Continuous low rumble / hum with controllable level (0..1) and pitch param. */
  loopRumble(baseFreq = 40): LoopHandle {
    if (!this.ctx) return { set() {}, stop() {} };
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 120;
    const o = ctx.createOscillator();
    o.frequency.value = baseFreq;
    const og = ctx.createGain();
    og.gain.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g);
    o.connect(og).connect(g);
    g.connect(this.sfxBus);
    src.start();
    o.start();
    return {
      set: (level: number, param = 0) => {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(level * 0.5, t, 0.15);
        f.frequency.setTargetAtTime(90 + param * 500, t, 0.2);
        o.frequency.setTargetAtTime(baseFreq * (1 + param), t, 0.2);
      },
      stop: (fade = 0.5) => {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0, t, fade / 3);
        src.stop(t + fade + 0.2);
        o.stop(t + fade + 0.2);
      },
    };
  }

  /** Relativistic jet roar. */
  loopJet(): LoopHandle {
    if (!this.ctx) return { set() {}, stop() {} };
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 900;
    hp.Q.value = 0.8;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 55;
    const sawF = ctx.createBiquadFilter();
    sawF.type = 'lowpass';
    sawF.frequency.value = 300;
    const sg = ctx.createGain();
    sg.gain.value = 0.3;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(hp).connect(g);
    saw.connect(sawF).connect(sg).connect(g);
    g.connect(this.sfxBus);
    const rs = ctx.createGain();
    rs.gain.value = 0.3;
    g.connect(rs).connect(this.reverbSend);
    src.start();
    saw.start();
    return {
      set: (level: number, param = 0) => {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(level * 0.35, t, 0.08);
        hp.frequency.setTargetAtTime(700 + param * 2500, t, 0.1);
        sawF.frequency.setTargetAtTime(200 + param * 900, t, 0.1);
      },
      stop: (fade = 0.4) => {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0, t, fade / 3);
        src.stop(t + fade + 0.2);
        saw.stop(t + fade + 0.2);
      },
    };
  }
}
