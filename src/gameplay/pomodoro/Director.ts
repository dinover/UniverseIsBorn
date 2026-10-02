import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { StarBody } from '../../vfx/StarBody';
import type { GalaxyField } from '../../vfx/GalaxyField';
import { TAU, clamp, damp, easeInOut, smoothstep } from '../../utils/math';

type ShotKind = 'orbit' | 'horizon' | 'arm' | 'birth' | 'supernova' | 'core' | 'nebula';

interface Shot {
  kind: ShotKind;
  t: number;
  dur: number;
  /** Event / focus point (for event shots). */
  P: THREE.Vector3;
  /** Arm followed by the arm ride. */
  k: number;
  boomed: boolean;
}

interface Flash {
  p: THREE.Vector3;
  t: number;
  life: number;
  kind: 'nova' | 'birth';
}

interface Ejecta {
  p: THREE.Vector3;
  t: number;
  dirs: Float32Array;
}

const FOCUS_SHOTS: ShotKind[] = ['orbit', 'arm', 'birth', 'horizon', 'supernova', 'nebula', 'core'];
const BREAK_SHOTS: ShotKind[] = ['horizon', 'orbit', 'nebula', 'core'];

/**
 * The pomodoro's camera operator and event planner. It glides between shots of the
 * galaxy (wide orbits, horizon views, rides along an arm, the black hole's core) and
 * stages small events where the camera looks: a star is born, a star explodes, a
 * nebula drifts by. Everything is slow and soft: it is background for focusing.
 */
export class Director {
  /** Break: calmer shots and warmer light. */
  calm = false;
  /** Off: a fixed, slowly turning horizon view. */
  travel = true;
  private shot: Shot | null = null;
  private last: ShotKind | null = null;
  private glow: SpriteBatch;
  private soft: SpriteBatch;
  private star: StarBody;
  private flashes: Flash[] = [];
  private ejecta: Ejecta[] = [];
  private flashT = 1;
  private noteT = 3;
  /** Galaxy brightness wanted for the current shot (close shots dim it). */
  dim = 1;
  // Smooth camera: the focus point eases from where it was to the new subject.
  private tFrom = new THREE.Vector3();
  private tTo: () => THREE.Vector3 = () => new THREE.Vector3();
  private tT = 1;
  private tDur = 1;
  private orbit = 0.012;

  constructor(private game: Game, private group: THREE.Group, private galaxy: () => GalaxyField) {
    this.glow = new SpriteBatch(3000, 'glow', { stretch: 0.03 });
    this.soft = new SpriteBatch(400, 'soft', { stretch: 0 });
    this.soft.mesh.renderOrder = 5;
    this.glow.mesh.renderOrder = 6;
    this.star = new StarBody({
      color: new THREE.Color(1, 0.45, 0.25),
      hot: new THREE.Color(1, 0.75, 0.5),
      granulation: 1.6,
      intensity: 1.4,
      spots: 0.4,
      boil: 1.4,
      rays: 0.9,
      coronaScale: 2.4,
      core: 1.5,
    });
    this.star.visible = false;
    group.add(this.soft.mesh, this.glow.mesh, this.star);
  }

  private get gal() {
    return this.galaxy();
  }
  private get R() {
    return this.gal.params.radius;
  }

  /** Eases the camera's focus to a (possibly moving) point over `dur` seconds. */
  private focusOn(to: () => THREE.Vector3, dur: number) {
    const rig = this.game.rig;
    this.tFrom.copy(rig.focus);
    this.tTo = to;
    this.tT = 0;
    this.tDur = dur;
    rig.followLambda = 8;
  }

  /** Starts a fresh sequence of shots (e.g. when the timer starts). */
  begin() {
    this.next(true);
  }

  /**
   * The calm "observatory" view. `setup`: a little higher, so the galaxy floats above
   * the settings panel; otherwise ~10° over the disc with the sky above.
   */
  horizon(dur = 4, setup = false) {
    const g = this.game;
    const d = 600 * 3.3;
    const target = new THREE.Vector3(0, d * (setup ? -0.147 : 0.031), 0);
    this.focusOn(() => target, dur);
    g.rig.animate({ distance: d, pitch: setup ? 0.407 : 0.15 }, dur, easeInOut);
    this.orbit = 0.012;
    this.shot = null;
    this.star.visible = false;
  }

  private pick(): ShotKind {
    if (!this.travel) return 'horizon';
    const pool = (this.calm ? BREAK_SHOTS : FOCUS_SHOTS).filter((k) => k !== this.last);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** A point on a spiral arm of the outer disc (the bright core would wash close-ups out). */
  private eventPoint(out: THREE.Vector3) {
    const gal = this.gal;
    gal.armPoint(0.5 + Math.random() * 0.4, Math.floor(Math.random() * gal.params.arms), this.game.time, out);
    out.y += 8;
    return out;
  }

  /** Somewhere in the disc, for the background flashes. */
  private diskPoint(out: THREE.Vector3) {
    const s = this.gal.samples;
    const i = Math.floor(Math.random() * 400);
    return this.gal.orbitPos(s[i * 4], s[i * 4 + 1], 0, this.game.time, out);
  }

  next(first = false) {
    const g = this.game;
    const rig = g.rig;
    const kind = this.pick();
    this.last = kind;
    const dur = (this.calm ? 45 : 32) + Math.random() * 14;
    const shot: Shot = { kind, t: 0, dur, P: new THREE.Vector3(), k: Math.floor(Math.random() * this.gal.params.arms), boomed: false };
    this.shot = shot;
    this.star.visible = false;
    // Long, eased glides and small turns: nothing should feel like a cut.
    const glide = first ? 8 : 14;
    const yaw = rig.state.yaw + (Math.random() - 0.5) * 0.9;
    const origin = new THREE.Vector3();
    switch (kind) {
      case 'orbit':
        this.focusOn(() => origin, glide);
        rig.animate({ distance: this.R * (2.4 + Math.random() * 0.8), pitch: 0.75 + Math.random() * 0.35, yaw }, glide, easeInOut);
        this.orbit = 0.02;
        break;
      case 'horizon':
        this.horizon(glide);
        this.shot = shot;
        break;
      case 'arm':
        // Drift slowly along one spiral arm, from its outer end inwards.
        this.focusOn(() => this.gal.armPoint(0.88 - 0.45 * clamp(shot.t / shot.dur), shot.k, g.time, new THREE.Vector3()), glide);
        rig.animate({ distance: this.R * 0.65, pitch: 0.45, yaw }, glide, easeInOut);
        this.orbit = 0.008;
        break;
      case 'birth':
      case 'supernova':
      case 'nebula':
        this.eventPoint(shot.P);
        this.focusOn(() => shot.P, glide);
        rig.animate({ distance: kind === 'nebula' ? 260 : kind === 'birth' ? 120 : 150, pitch: 0.3 + Math.random() * 0.25, yaw }, glide, easeInOut);
        this.orbit = 0.022;
        if (kind === 'supernova') {
          this.star.position.copy(shot.P);
          this.star.setRadius(0.001);
          this.star.visible = true;
        }
        break;
      case 'core':
        this.focusOn(() => origin, glide);
        rig.animate({ distance: 80 + Math.random() * 30, pitch: 0.12 + Math.random() * 0.15, yaw }, glide, easeInOut);
        this.orbit = 0.025;
        break;
    }
  }

  update(dt: number) {
    const g = this.game;
    const sh = this.shot;
    if (sh) {
      sh.t += dt;
      if (sh.t >= sh.dur) this.next();
    }
    // Eased focus (smooth start and stop), and a turning speed that changes gently.
    this.tT += dt;
    const k = easeInOut(clamp(this.tT / this.tDur));
    g.rig.target.copy(this.tFrom).lerp(this.tTo(), k);
    g.rig.autoOrbit = damp(g.rig.autoOrbit, this.orbit, 0.25, dt);

    // Closer shots dim the galaxy a little so nearby stars do not turn into blobs.
    this.dim = damp(this.dim, g.rig.effectiveDistance < 400 ? 0.55 : 1, 1.2, dt);
    const bh = g.pipe.bhPass;
    bh.diskIntensity = damp(bh.diskIntensity, sh?.kind === 'core' ? 0.95 : 0.65, 0.8, dt);

    // Life all over the disc: distant supernovae and newborn stars.
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flashT = 0.6 + Math.random() * (this.calm ? 2.4 : 1.6);
      const p = this.diskPoint(new THREE.Vector3());
      this.flashes.push({ p, t: 0, life: Math.random() < 0.35 ? 2.5 : 4, kind: Math.random() < 0.35 ? 'nova' : 'birth' });
    }
    this.flashes = this.flashes.filter((f) => (f.t += dt) < f.life);

    // Ambient melody: the stars sing now and then.
    this.noteT -= dt;
    if (this.noteT <= 0) {
      this.noteT = (this.calm ? 3 : 4.5) + Math.random() * 5;
      g.audio.note(Math.floor(Math.random() * 8), 3, this.calm ? 0.035 : 0.025);
    }

    this.render(dt);
  }

  private render(dt: number) {
    const g = this.game;
    const glow = this.glow;
    const soft = this.soft;
    glow.begin();
    soft.begin();
    const scale = Math.max(1, g.rig.effectiveDistance / 1500);
    // Bulge and nucleus glow, fading as the camera gets close so it never fills the screen.
    const camR = g.camera.position.length();
    const near = smoothstep(180, 700, camR);
    glow.push(0, 0, 0, 0, 0, 0, 1, 0.8, 0.55, 0.13 * near, 140);
    glow.push(0, 0, 0, 0, 0, 0, 1, 0.9, 0.75, 0.2 * near, 30);
    for (const f of this.flashes) {
      const k = f.t / f.life;
      const a = k < 0.1 ? k * 10 : 1 - (k - 0.1) / 0.9;
      if (f.kind === 'nova') glow.push(f.p.x, f.p.y, f.p.z, 0, 0, 0, 0.95, 0.9, 1, a * 1.3, (8 + k * 16) * scale);
      else glow.push(f.p.x, f.p.y, f.p.z, 0, 0, 0, 0.55, 0.7, 1, a * 0.7, 6 * scale);
    }
    const sh = this.shot;
    if (sh?.kind === 'birth') this.renderBirth(sh, glow, soft);
    if (sh?.kind === 'nebula') this.renderNebula(sh, soft, glow);
    if (sh?.kind === 'supernova') this.renderSupernova(sh, glow, soft);
    this.ejecta = this.ejecta.filter((e) => (e.t += dt) < 14);
    for (const e of this.ejecta) {
      const travel = (1 - Math.exp(-e.t * 0.4)) / 0.4;
      const cool = clamp(e.t / 3);
      const n = e.dirs.length / 3;
      for (let i = 0; i < n; i++) {
        const d = travel * (14 + (i % 7) * 3);
        const c = i % 3 === 0 ? [1, 0.4, 0.5] : i % 3 === 1 ? [0.35, 1, 0.8] : [1, 0.85, 0.4];
        const hot = 1 - cool;
        glow.push(e.p.x + e.dirs[i * 3] * d, e.p.y + e.dirs[i * 3 + 1] * d, e.p.z + e.dirs[i * 3 + 2] * d, 0, 0, 0, c[0] * cool + hot, c[1] * cool + hot, c[2] * cool + hot, 0.35 * (1 - e.t / 14), 0.9 + (i % 4) * 0.4);
      }
    }
    glow.end();
    soft.end();
  }

  /** A gas cloud contracts and a new star lights up inside it. */
  private renderBirth(sh: Shot, glow: SpriteBatch, soft: SpriteBatch) {
    const P = sh.P;
    const k = clamp((sh.t - 4) / (sh.dur * 0.55));
    const shrink = 1 - 0.65 * easeInOut(k);
    for (let i = 0; i < 46; i++) {
      const a = i * 2.39996 + sh.t * 0.05;
      const rr = (6 + (i % 9) * 3.4) * shrink;
      const y = Math.sin(i * 1.3) * 6 * shrink;
      const c = i % 3 === 0 ? [0.95, 0.4, 0.65] : i % 3 === 1 ? [0.45, 0.6, 1] : [0.75, 0.45, 0.95];
      soft.push(P.x + Math.cos(a) * rr, P.y + y, P.z + Math.sin(a) * rr, 0, 0, 0, c[0], c[1], c[2], 0.07 + 0.04 * k, 10 + (i % 4) * 3);
    }
    const ignite = clamp((k - 0.55) / 0.3);
    if (ignite > 0) {
      const flick = 0.85 + 0.15 * Math.sin(sh.t * 7);
      glow.push(P.x, P.y, P.z, 0, 0, 0, 1, 0.85, 0.65, 0.9 * ignite * flick, 2.5 + 3 * ignite);
      glow.push(P.x, P.y, P.z, 0, 0, 0, 1, 0.6, 0.35, 0.22 * ignite, 10 * ignite);
      // Bipolar jets of the newborn star.
      for (const s of [1, -1])
        for (let j = 1; j <= 8; j++) glow.push(P.x, P.y + s * j * 2.6, P.z, 0, s * 4, 0, 0.75, 0.85, 1, 0.5 * ignite * (1 - j / 9), 1.4);
      if (!sh.boomed && ignite > 0.05) {
        sh.boomed = true;
        this.game.audio.chime(true);
      }
    }
  }

  /** A big, colourful nebula drifting past the camera. */
  private renderNebula(sh: Shot, soft: SpriteBatch, glow: SpriteBatch) {
    const P = sh.P;
    const fadeIn = clamp(sh.t / 4) * clamp((sh.dur - sh.t) / 4);
    for (let i = 0; i < 110; i++) {
      const a = i * 2.39996 + sh.t * 0.02;
      const rr = 12 + (i % 13) * 9;
      const y = Math.sin(i * 0.9) * 18;
      const c = i % 4 === 0 ? [1, 0.35, 0.55] : i % 4 === 1 ? [0.3, 0.85, 0.8] : i % 4 === 2 ? [0.5, 0.5, 1] : [1, 0.7, 0.4];
      soft.push(P.x + Math.cos(a) * rr, P.y + y, P.z + Math.sin(a) * rr * 0.8, 0, 0, 0, c[0], c[1], c[2], 0.045 * fadeIn, 14 + (i % 5) * 5);
    }
    for (let i = 0; i < 12; i++) {
      const a = i * 1.7;
      glow.push(P.x + Math.cos(a) * (8 + i * 4), P.y + Math.sin(i) * 6, P.z + Math.sin(a) * (8 + i * 4), 0, 0, 0, 0.8, 0.9, 1, 0.9 * fadeIn, 1.6);
    }
  }

  /** An old red supergiant pulses, collapses and explodes (softly: this is study time). */
  private renderSupernova(sh: Shot, glow: SpriteBatch, soft: SpriteBatch) {
    const g = this.game;
    const P = sh.P;
    const boomAt = sh.dur * 0.45;
    if (sh.t < boomAt) {
      const k = clamp(sh.t / boomAt);
      const pulse = Math.sin(sh.t * (2 + k * 9)) * 0.08 * k;
      const r = 6 * (1 + pulse) * (k > 0.92 ? 1 - (k - 0.92) / 0.08 * 0.9 : 1);
      this.star.setRadius(Math.max(0.05, r * clamp(sh.t / 2)));
      this.star.pulse = pulse * 4;
      this.star.update(g.time, g.camera);
      glow.push(P.x, P.y, P.z, 0, 0, 0, 1, 0.5, 0.3, 0.25, 30);
    } else if (!sh.boomed) {
      sh.boomed = true;
      this.star.visible = false;
      const n = Math.floor(900 * g.quality.profile.particles + 300);
      const dirs = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1;
        const th = Math.random() * TAU;
        const s = Math.sqrt(1 - u * u) * (0.7 + Math.random() * 0.6);
        dirs.set([Math.cos(th) * s, u * 0.8, Math.sin(th) * s], i * 3);
      }
      this.ejecta.push({ p: P.clone(), t: 0, dirs });
      g.pipe.final.doFlash(0.18, 0xffffff);
      g.pipe.final.shockwave(P.clone(), 0.5, 2, 0.8);
      g.pipe.bloomBoost = 1;
      g.audio.softBoom();
      g.rig.animate({ distance: 260 }, 8, easeInOut);
    } else {
      const k = clamp((sh.t - boomAt) / 10);
      for (let i = 0; i < 30; i++) {
        const a = i * 2.39996;
        const rr = 8 + k * 30 + (i % 5) * 3;
        soft.push(P.x + Math.cos(a) * rr, P.y + Math.sin(i) * rr * 0.4, P.z + Math.sin(a) * rr, 0, 0, 0, i % 2 ? 1 : 0.4, i % 2 ? 0.4 : 1, 0.6, 0.08 * (1 - k * 0.6), 14 + k * 10);
      }
      glow.push(P.x, P.y, P.z, 0, 0, 0, 0.7, 0.85, 1, 0.8, 2.5);
    }
  }

  dispose() {
    this.group.remove(this.glow.mesh, this.soft.mesh, this.star);
    this.glow.dispose();
    this.soft.dispose();
    this.star.dispose();
  }
}
