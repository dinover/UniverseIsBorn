import type * as THREE from 'three';
import type { Game } from '../../core/Game';
import { GalaxyField } from '../../vfx/GalaxyField';
import { Rng } from '../../procgen/rng';
import { clamp, damp, easeInOut, lerp, smoothstep } from '../../utils/math';

type V3 = [number, number, number];

/** Mature colour of the galaxy for each arm count. */
const PALETTE: Record<number, V3> = {
  3: [0.95, 1.0, 1.14],
  4: [1.12, 0.98, 0.86],
  5: [1.13, 0.86, 1.06],
  6: [0.93, 0.9, 1.24],
};
/** A newborn galaxy is bluer: young, hot stars. */
const YOUNG: V3 = [0.8, 0.94, 1.28];
/** Breaks add a warm, golden-hour light. */
const WARM: V3 = [1.08, 0.97, 0.88];
const CROSSFADE = 9;

interface Look {
  twist: number;
  ecc: number;
  spread: number;
  frac: number;
  radius: number;
  bar: number;
  young: number;
  bright: number;
  tint: V3;
}

/** How the galaxy looks at evolution `p` (0 = newborn, 1 = mature). */
function lookAt(p: number, arms: number, calm: boolean): Look {
  const e = easeInOut(clamp(p));
  const pal = PALETTE[arms] ?? PALETTE[4];
  const tint = YOUNG.map((y, i) => lerp(y, pal[i], e) * (calm ? WARM[i] : 1)) as V3;
  return {
    twist: lerp(2.2, 3.4, e), // the arms wind up tighter as it ages
    ecc: lerp(0.36, 0.46, e),
    spread: lerp(1.5, 0.72, e), // and become crisper
    frac: lerp(0.6, 1, e), // more and more stars
    radius: lerp(540, 660, e),
    bar: arms >= 4 ? smoothstep(0.55, 1, p) * 0.7 : 0, // a central bar forms late
    young: lerp(0.55, 1.3, e), // the arms light up with young stars
    bright: lerp(0.95, 1.12, e),
    tint,
  };
}

/**
 * The pomodoro's galaxy: it grows during every focus session (tighter, brighter arms,
 * more stars, a central bar) and gains an arm with each pomodoro of the cycle. Arm
 * changes cross-fade between two galaxies built from the same stars.
 */
export class LivingGalaxy {
  main: GalaxyField;
  private old: GalaxyField | null = null;
  private xfade = 1;
  private seed: number;
  private hue: number;
  private cur: Look;
  arms: number;
  /** Set by the intro while the galaxy is being revealed. */
  introFade = 1;
  /** Dimming requested by the camera director for close shots. */
  dim = 1;

  constructor(private game: Game, private group: THREE.Group, seed: number, arms = 4) {
    this.seed = seed;
    this.hue = new Rng(seed ^ 0x5bd1e995).range(-0.5, 0.5);
    this.arms = arms;
    this.cur = lookAt(1, arms, false);
    this.main = this.make(arms);
  }

  /** The intro drives the reveal through this. */
  get fade() {
    return this.introFade;
  }
  set fade(v: number) {
    this.introFade = v;
  }

  private make(arms: number) {
    const q = this.game.quality.profile;
    const gal = new GalaxyField(
      { count: q.galaxyStars, radius: 600, arms, twist: this.cur.twist, ecc: this.cur.ecc, pattern: 0.012, vel: 42, bulge: 0.12, hueShift: this.hue, armStars: 0.2 },
      new Rng(this.seed),
    );
    gal.fade = 0;
    this.group.add(gal);
    return gal;
  }

  /** Morphs into a galaxy with `arms` arms; `reborn` also changes its colours (new cycle). */
  setArms(arms: number, reborn = false) {
    if (arms === this.arms) return;
    if (this.old) this.drop(this.old);
    if (reborn) {
      this.seed = (this.seed * 16807 + 12345) % 2147483647;
      this.hue = new Rng(this.seed ^ 0x5bd1e995).range(-0.5, 0.5);
    }
    this.old = this.main;
    this.arms = arms;
    this.main = this.make(arms);
    this.xfade = 0;
  }

  private drop(g: GalaxyField) {
    this.group.remove(g);
    g.dispose();
  }

  private apply(g: GalaxyField, l: Look, fade: number, time: number) {
    g.setTwist(l.twist);
    g.setEcc(l.ecc);
    g.armSpread = l.spread;
    g.visibleFraction = l.frac;
    g.setRadius(l.radius);
    g.setBar(l.bar);
    g.young = l.young;
    g.brightness = l.bright;
    g.setTint(l.tint[0], l.tint[1], l.tint[2]);
    g.fade = fade;
    g.update(time, this.game.pipe.renderer.getPixelRatio());
  }

  /** `p`: evolution 0..1 of the current focus; `calm`: break mood. */
  update(dt: number, time: number, p: number, calm: boolean) {
    const t = lookAt(p, this.arms, calm);
    // Everything glides, so resets between sessions are never a jump.
    const c = this.cur;
    const k = 0.5;
    c.twist = damp(c.twist, t.twist, k, dt);
    c.ecc = damp(c.ecc, t.ecc, k, dt);
    c.spread = damp(c.spread, t.spread, k, dt);
    c.frac = damp(c.frac, t.frac, k, dt);
    c.radius = damp(c.radius, t.radius, k, dt);
    c.bar = damp(c.bar, t.bar, k, dt);
    c.young = damp(c.young, t.young, k, dt);
    c.bright = damp(c.bright, t.bright, k, dt);
    for (let i = 0; i < 3; i++) c.tint[i] = damp(c.tint[i], t.tint[i], 0.4, dt);
    const base = this.introFade * this.dim;
    if (this.old) {
      this.xfade = Math.min(1, this.xfade + dt / CROSSFADE);
      const x = easeInOut(this.xfade);
      this.apply(this.old, c, base * (1 - x), time);
      this.apply(this.main, c, base * x, time);
      if (this.xfade >= 1) {
        this.drop(this.old);
        this.old = null;
      }
    } else this.apply(this.main, c, base, time);
  }

  get radius() {
    return this.cur.radius;
  }

  dispose() {
    if (this.old) this.drop(this.old);
    this.drop(this.main);
  }
}
