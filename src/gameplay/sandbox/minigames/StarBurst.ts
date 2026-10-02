import * as THREE from 'three';
import { StarBody, type StarLook } from '../../../vfx/StarBody';
import { SpriteBatch } from '../../../vfx/SpriteBatch';
import { Ring } from '../../../vfx/Effects';
import { TAU, clamp, damp, easeInExpo, easeInOut, easeOutCubic } from '../../../utils/math';
import { Minigame } from './Minigame';

type Stage = 'intro' | 'play' | 'collapse' | 'boom';

/** Core burning stages, from hydrogen to iron (the same chain as stage 4 of the story). */
const SHELLS: { sym: string; name: string; look: Omit<StarLook, 'color' | 'hot'> & { color: [number, number, number]; hot: [number, number, number]; r: number } }[] = [
  { sym: 'H', name: 'Hidrógeno', look: { color: [0.55, 0.65, 1], hot: [0.85, 0.92, 1], r: 7, granulation: 2, intensity: 1.4, spots: 0.1, boil: 0.8, rays: 0.6, coronaScale: 2.4, core: 0.5 } },
  { sym: 'He', name: 'Helio', look: { color: [0.72, 0.76, 1], hot: [0.95, 0.95, 1], r: 6.6, granulation: 2, intensity: 1.5, spots: 0.15, boil: 1, rays: 0.7, coronaScale: 2.4, core: 1 } },
  { sym: 'C', name: 'Carbono', look: { color: [1, 0.85, 0.6], hot: [1, 0.95, 0.8], r: 6.2, granulation: 1.8, intensity: 1.6, spots: 0.25, boil: 1.2, rays: 0.8, coronaScale: 2.3, core: 1.5 } },
  { sym: 'O', name: 'Oxígeno', look: { color: [1, 0.7, 0.45], hot: [1, 0.88, 0.6], r: 5.8, granulation: 1.7, intensity: 1.7, spots: 0.35, boil: 1.4, rays: 0.9, coronaScale: 2.3, core: 2 } },
  { sym: 'Ne', name: 'Neón', look: { color: [1, 0.55, 0.38], hot: [1, 0.78, 0.5], r: 5.4, granulation: 1.6, intensity: 1.8, spots: 0.45, boil: 1.7, rays: 1, coronaScale: 2.3, core: 2.5 } },
  { sym: 'Si', name: 'Silicio', look: { color: [1, 0.45, 0.3], hot: [1, 0.7, 0.45], r: 5, granulation: 1.5, intensity: 1.9, spots: 0.55, boil: 2, rays: 1.1, coronaScale: 2.2, core: 3 } },
  { sym: 'Fe', name: 'Hierro', look: { color: [0.9, 0.3, 0.22], hot: [1, 0.6, 0.4], r: 4.6, granulation: 1.4, intensity: 2.1, spots: 0.6, boil: 2.4, rays: 1.2, coronaScale: 2.2, core: 3.5 } },
];

const PERFECT = 0.075;
const GOOD = 0.16;
const EJECTA = [
  [1.0, 0.35, 0.45],
  [0.3, 1.0, 0.8],
  [1.0, 0.85, 0.35],
  [0.55, 0.7, 1.0],
  [1.0, 0.95, 0.9],
];

const lookOf = (i: number, k: number): StarLook => {
  const a = SHELLS[i].look;
  const b = SHELLS[Math.min(SHELLS.length - 1, i + 1)].look;
  const m = (x: number, y: number) => x + (y - x) * k * 0.35;
  return {
    color: new THREE.Color(m(a.color[0], b.color[0]), m(a.color[1], b.color[1]), m(a.color[2], b.color[2])),
    hot: new THREE.Color(m(a.hot[0], b.hot[0]), m(a.hot[1], b.hot[1]), m(a.hot[2], b.hot[2])),
    granulation: a.granulation,
    intensity: a.intensity + k * 0.3,
    spots: a.spots,
    boil: a.boil + k * 0.8,
    rays: a.rays,
    coronaScale: a.coronaScale,
    core: a.core + k,
  };
};

/**
 * "Estrella explosiva": the camera dives into one star of your galaxy. Press on the beat
 * of its heartbeat to compress the core through every fusion stage up to iron; then it
 * collapses and explodes. No misses at all → hypernova.
 */
export class StarBurst extends Minigame {
  galaxyFade = 0.3;
  private stage: Stage = 'intro';
  private P = new THREE.Vector3();
  private body!: StarBody;
  private ring!: Ring;
  private ej!: SpriteBatch;
  private n = 0;
  private dir!: Float32Array;
  private spd!: Float32Array;
  private col!: Uint8Array;
  private stageT = 0;
  private shell = 0;
  private pressure = 0;
  private beat0 = 0;
  private beatI = 0.92;
  private beatN = 0;
  private lastJudged = -1;
  private pulse = 0;
  private radius = 7;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private perfects = 0;
  private goods = 0;
  private misses = 0;
  private missRow = 0;
  private hyper = false;
  private exploded = false;
  private failed = false;

  start() {
    const c = this.ctx;
    const g = this.g;
    // One of the young stars in the spiral arms (not one of your purchased astros).
    const s = c.gal.samples;
    const i = Math.floor(c.rng() * 400);
    c.gal.orbitPos(s[i * 4], s[i * 4 + 1], 0, c.time(), this.P);
    this.P.y += 4;
    this.body = new StarBody(lookOf(0, 0));
    this.body.setRadius(0.01);
    this.body.position.copy(this.P);
    this.ring = new Ring(0xffffff, true, 0.035);
    this.ring.opacity = 0;
    this.ring.position.copy(this.P);
    const q = g.quality.profile.particles;
    this.n = Math.floor(2600 * q + 900);
    this.ej = new SpriteBatch(this.n + 64, 'glow', { stretch: 0.05, maxStretch: 5 });
    this.ej.mesh.renderOrder = 9;
    c.group.add(this.body, this.ring, this.ej.mesh);
    this.dir = new Float32Array(this.n * 3);
    this.spd = new Float32Array(this.n);
    this.col = new Uint8Array(this.n);
    for (let k = 0; k < this.n; k++) {
      const u = c.rng() * 2 - 1;
      const th = c.rng() * TAU;
      const r = Math.sqrt(1 - u * u);
      const x = r * Math.cos(th);
      const y = u * 0.85;
      const z = r * Math.sin(th);
      this.dir.set([x, y, z], k * 3);
      const fing = Math.sin(x * 9 + y * 5) * Math.cos(z * 8 - x * 2) + Math.sin(y * 11 + z * 3) * 0.5;
      this.spd[k] = 30 * (0.55 + 0.3 * fing + c.rng() * 0.45);
      this.col[k] = Math.floor(c.rng() * EJECTA.length);
    }
    g.rig.followLambda = 1.6;
    g.rig.target.copy(this.P);
    g.rig.animate({ distance: 70, pitch: 0.3 }, 2.8, easeInOut);
    g.audio.whoosh(0.3);
    c.hud.set({ title: '✺ Estrella explosiva', score: '0 pts', combo: '', timer: '', progress: 0, hint: this.chain() });
    c.hud.banner('Una estrella de tu galaxia', 'Comprime su núcleo al ritmo de sus latidos', 2.6);
  }

  private chain() {
    return SHELLS.map((s, i) => (i === this.shell ? `<b style="color:#ffd36b">${s.sym}</b>` : i < this.shell ? `<span style="opacity:.55">${s.sym}</span>` : s.sym)).join(' › ') + ' &nbsp;·&nbsp; pulsa <kbd>ESPACIO</kbd> / toca en cada latido';
  }

  private beatTime(n: number) {
    return this.beat0 + n * this.beatI;
  }

  onDown() {
    this.press();
  }
  onKey(k: string) {
    if (k === ' ' || k === 'enter') this.press();
  }

  private press() {
    if (this.stage !== 'play' || this.result) return;
    // Nearest beat that has not been judged yet.
    const now = this.t;
    if (now < this.beat0 - GOOD) return; // still counting in
    let n = Math.round((now - this.beat0) / this.beatI);
    if (n <= this.lastJudged) n = this.lastJudged + 1;
    const dtb = now - this.beatTime(n);
    const ad = Math.abs(dtb);
    if (ad > GOOD) {
      this.judge('miss', dtb < 0 ? 'ANTES DE TIEMPO' : 'TARDE');
      // An off-beat press does not consume the next beat unless it was close.
      return;
    }
    this.lastJudged = n;
    this.judge(ad <= PERFECT ? 'perfect' : 'good');
  }

  private judge(q: 'perfect' | 'good' | 'miss', why = '') {
    const audio = this.g.audio;
    const hud = this.ctx.hud;
    const s = this.project(this.P);
    if (q === 'miss') {
      this.misses++;
      this.missRow++;
      this.combo = 0;
      this.pressure = Math.max(0, this.pressure - 0.12);
      audio.hit('miss');
      hud.pop(`✕ ${why || 'FUERA DE RITMO'}`, s.x, s.y + 90, '#ff8a8a', 16);
      if (this.missRow >= 4) this.fail();
      return;
    }
    this.missRow = 0;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (q === 'perfect') this.perfects++;
    else this.goods++;
    const pts = Math.round((q === 'perfect' ? 100 : 50) * (1 + this.shell * 0.25) * (1 + 0.1 * Math.min(this.combo, 20)));
    this.score += pts;
    this.pressure += q === 'perfect' ? 0.3 : 0.18;
    this.pulse = q === 'perfect' ? 1.3 : 0.8;
    audio.hit(q, this.combo);
    this.g.shake(0.06 + this.shell * 0.02);
    hud.pop(`${q === 'perfect' ? '¡PERFECTO!' : 'BIEN'} +${pts}`, s.x, s.y - 110, q === 'perfect' ? '#ffffff' : '#bfe0ff', q === 'perfect' ? 20 : 16);
    if (this.pressure >= 1) this.nextShell();
  }

  private nextShell() {
    const hud = this.ctx.hud;
    this.pressure = 0;
    if (this.shell >= SHELLS.length - 1) return this.collapse();
    this.shell++;
    const sh = SHELLS[this.shell];
    hud.banner(`${sh.sym} · ${sh.name}`, this.shell === SHELLS.length - 1 ? '¡Hierro! Un último empujón…' : 'El núcleo se contrae y se calienta', 1.3);
    this.g.pipe.final.shockwave(this.P.clone(), 0.35, 1, 0.3);
    this.g.pipe.bloomBoost = 0.8;
    this.g.audio.discovery();
    // Faster heartbeat, re-anchored so the next beat keeps the phase.
    const next = this.beatTime(this.lastJudged + 1);
    this.beatI = 0.92 - 0.07 * this.shell;
    this.beat0 = next - (this.lastJudged + 1) * this.beatI;
    this.ctx.hud.set({ hint: this.chain() });
  }

  private collapse() {
    this.stage = 'collapse';
    this.stageT = 0;
    this.hyper = this.misses === 0;
    this.ring.opacity = 0;
    this.g.audio.collapseSuck(1.1);
    this.ctx.hud.banner('¡COLAPSO!', 'El hierro ya no puede fusionarse', 1.2);
  }

  private fail() {
    this.failed = true;
    this.ring.opacity = 0;
    this.ctx.hud.banner('Se estabilizó', 'Perdiste el ritmo: la estrella recuperó el equilibrio', 2);
    this.g.audio.warning();
    this.stage = 'boom';
    this.stageT = 0;
  }

  private explode() {
    const g = this.g;
    this.exploded = true;
    this.body.visible = false;
    g.audio.boom();
    g.pipe.final.doFlash(this.hyper ? 1.3 : 1, this.hyper ? 0xfff0d0 : 0xffffff);
    g.pipe.bloomBoost = this.hyper ? 4 : 3;
    g.pipe.exposure = 1.4;
    g.shake(this.hyper ? 1 : 0.8);
    g.pipe.final.shockwave(this.P.clone(), 1.4, 2.2, 1.6);
    setTimeout(() => g.pipe.final.shockwave(this.P.clone(), 1, 2.6, 1.4), 250);
    g.rig.animate({ distance: this.hyper ? 420 : 300, pitch: 0.42 }, 4.5, easeOutCubic);
    g.prog.add('supernovae', 1);
    this.score += this.hyper ? 3000 : 1500;
    this.ctx.hud.banner(this.hyper ? '¡HIPERNOVA!' : '¡SUPERNOVA!', this.hyper ? 'Ni un solo fallo: la explosión más brillante' : 'Por unas semanas brilla más que toda la galaxia', 3);
  }

  protected step(dt: number) {
    const c = this.ctx;
    const g = this.g;
    this.stageT += dt;
    this.pulse = damp(this.pulse, 0, 6, dt);

    if (this.stage === 'intro') {
      const k = clamp(this.stageT / 2.6);
      this.radius = SHELLS[0].look.r * easeOutCubic(k);
      if (this.stageT >= 2.8) {
        this.stage = 'play';
        this.stageT = 0;
        this.beat0 = this.t + 1.2;
        this.beatI = 0.92;
        this.lastJudged = -1;
        this.beatN = -1;
      }
    } else if (this.stage === 'play') {
      const target = SHELLS[this.shell].look.r * (1 - this.pressure * 0.06);
      this.radius = damp(this.radius, target, 4, dt);
      // Heartbeat sound & visual on every beat.
      const n = Math.floor((this.t - this.beat0) / this.beatI);
      if (n > this.beatN && n >= 0) {
        this.beatN = n;
        g.audio.beat(true);
        this.pulse = Math.max(this.pulse, 0.6);
      }
      // A beat that went by unanswered counts as a miss.
      if (this.t - this.beatTime(this.lastJudged + 1) > GOOD && this.lastJudged + 1 >= 0 && this.t > this.beat0) {
        this.lastJudged++;
        this.judge('miss', 'SIN PULSAR');
      }
      // Approach ring: reaches the limb exactly on the next beat.
      const nb = this.beatTime(this.lastJudged + 1);
      const toBeat = nb - this.t;
      const k = clamp(toBeat / this.beatI);
      this.ring.setWorldRadius(this.radius * (1.12 + 2.4 * k));
      const inPerfect = Math.abs(toBeat) <= PERFECT;
      this.ring.setColor(inPerfect ? 0xffffff : 0xffc070);
      this.ring.opacity = this.t > this.beat0 - this.beatI ? (inPerfect ? 1 : 0.6) : 0;
      this.ring.tick(this.t, g.camera);
      g.pipe.final.chroma = this.shell / 12 + this.pressure * 0.1;
    } else if (this.stage === 'collapse') {
      const k = clamp(this.stageT / 1.1);
      this.radius = SHELLS[SHELLS.length - 1].look.r * (1 - easeInExpo(k) * 0.95);
      g.pipe.final.chroma = 0.5 + k * 1.2;
      g.shake(0.03);
      if (k >= 1) {
        g.pipe.final.chroma = 0;
        this.stage = 'boom';
        this.stageT = 0;
        this.explode();
      }
    } else {
      g.pipe.exposure = Math.max(1, g.pipe.exposure - dt * 0.5);
      if (this.failed) {
        this.radius = damp(this.radius, SHELLS[this.shell].look.r, 2, dt);
        this.body.pulse = 0;
      }
      if (this.stageT > (this.failed ? 2.2 : 5)) this.finish(false);
    }

    if (!this.exploded) {
      this.body.setRadius(Math.max(0.01, this.radius));
      this.body.setLook(lookOf(this.shell, this.stage === 'collapse' ? 1 : this.pressure));
      this.body.pulse = this.pulse;
      this.body.update(this.t, g.camera);
    }
    this.renderEjecta();

    c.hud.set({
      score: `${this.score.toLocaleString('es')} pts`,
      combo: this.combo >= 2 ? `combo ${this.combo}` : '',
      timer: `Núcleo: ${SHELLS[this.shell].name}`,
      progress: this.stage === 'play' ? this.pressure : this.stage === 'intro' ? 0 : 1,
    });
  }

  private renderEjecta() {
    const b = this.ej;
    b.begin();
    if (this.exploded) {
      const T = this.stageT;
      const travel = (1 - Math.exp(-T * 0.45)) / 0.45;
      const cool = clamp(T / 2.5);
      const boost = this.hyper ? 1.5 : 1;
      const P = this.P;
      for (let i = 0; i < this.n; i++) {
        const v = this.spd[i] * boost;
        const d = v * travel;
        const x = this.dir[i * 3];
        const y = this.dir[i * 3 + 1];
        const z = this.dir[i * 3 + 2];
        const c = this.hyper && i % 3 === 0 ? [1, 0.85, 0.5] : EJECTA[this.col[i]];
        const hot = 1 - cool;
        const cv = v * Math.exp(-T * 0.45);
        const a = (0.12 + hot * 0.5) * (0.6 + 0.4 * Math.sin(i * 1.7)) * (1 - clamp((T - 3.5) / 1.5));
        b.push(P.x + x * d, P.y + y * d, P.z + z * d, x * cv, y * cv, z * cv, c[0] * cool + hot, c[1] * cool + hot * 0.95, c[2] * cool + hot * 0.9, a, 0.6 + (i % 5) * 0.2 + d * 0.01);
      }
      b.push(P.x, P.y, P.z, 0, 0, 0, 0.8, 0.9, 1, Math.max(0, 2 - T * 0.5), 6);
    } else if (this.stage === 'collapse') {
      // Matter raining onto the collapsing core.
      const k = clamp(this.stageT / 1.1);
      const P = this.P;
      for (let i = 0; i < Math.min(this.n, 1200); i++) {
        const d = this.radius + (1 - ((this.t * 0.9 + i * 0.137) % 1)) * 30 * (1 - k * 0.5);
        const x = this.dir[i * 3];
        const y = this.dir[i * 3 + 1];
        const z = this.dir[i * 3 + 2];
        b.push(P.x + x * d, P.y + y * d, P.z + z * d, -x * 30, -y * 30, -z * 30, 1, 0.55, 0.35, 0.08 + k * 0.25, 0.25);
      }
    }
    b.end();
  }

  finish(quit: boolean) {
    if (this.result) return;
    const done = this.exploded;
    const hits = this.perfects + this.goods;
    const acc = hits + this.misses > 0 ? this.perfects / (hits + this.misses) : 0;
    const stars = !done || quit ? 0 : this.hyper ? 3 : acc >= 0.7 ? 2 : 1;
    this.result = {
      score: this.score,
      stars,
      rewardSeconds: done ? 100 + this.score / 60 : this.shell * 12 + this.score / 90,
      lines: [
        done ? (this.hyper ? '¡<b>Hipernova</b>! Ni un solo fallo' : 'La estrella estalló en <b>supernova</b>') : `Llegaste hasta el <b>${SHELLS[this.shell].name}</b>`,
        `Perfectos <b>${this.perfects}</b> · buenos <b>${this.goods}</b> · fallos <b>${this.misses}</b> · combo máximo <b>${this.maxCombo}</b>`,
      ],
      achievements: this.hyper && done ? ['mg_hypernova'] : [],
      unlocks: this.hyper && done ? ['jets:hipernova'] : [],
    };
  }

  dispose() {
    const g = this.g;
    g.rig.target.set(0, 0, 0);
    g.rig.followLambda = 3.5;
    g.pipe.final.chroma = 0;
    g.pipe.exposure = 1;
    this.ctx.group.remove(this.body, this.ring, this.ej.mesh);
    this.body.dispose();
    this.ring.geometry.dispose();
    this.ring.mat.dispose();
    this.ej.dispose();
  }
}
