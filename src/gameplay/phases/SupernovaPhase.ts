import * as THREE from 'three';
import { Phase } from '../Phase';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { JetBeam } from '../../vfx/Effects';
import { StarBody } from '../../vfx/StarBody';
import { SKY_PRESETS } from '../../vfx/Sky';
import { clamp, easeInExpo, easeOutCubic } from '../../utils/math';
import { num, tr } from '../../i18n/i18n';

/** Remnant mass model (simplified): heavier stars and better-resisted cores leave heavier remnants. */
export function remnantMass(starMass: number, coreQuality: number) {
  return 1.4 + Math.max(0, starMass - 8) * 0.12 * (0.5 + coreQuality);
}
export const TOV_LIMIT = 2.5;

const PALETTE = [
  [1.0, 0.35, 0.45], // hydrogen alpha
  [1.0, 0.35, 0.45],
  [0.3, 1.0, 0.8], // oxygen
  [1.0, 0.85, 0.35], // sulphur / silicon
  [0.55, 0.7, 1.0], // iron, hot
  [1.0, 0.95, 0.9],
];

/**
 * STAGE 6 — Core collapse supernova. A fully scripted cinematic: implosion, silence,
 * explosion with Rayleigh-Taylor fingers, shockwaves, and the reveal of the remnant.
 */
export class SupernovaPhase extends Phase {
  id = 'supernova' as const;
  private star!: StarBody;
  private ej!: SpriteBatch;
  private shell!: SpriteBatch;
  private n = 0;
  private dir!: Float32Array;
  private spd!: Float32Array;
  private col!: Uint8Array;
  private dist!: Float32Array;
  private exploded = false;
  private explodeT = 0;
  private implode = 0;
  private remnant: 'bh' | 'ns' = 'bh';
  private mass = 0;
  private beams: JetBeam[] = [];
  private nsGlow = 0;

  enter() {
    const g = this.game;
    g.setStage(6, true);
    g.hud.show(false);
    g.sky.set(SKY_PRESETS.collapse, 0.5);
    const starMass = this.carry.starMass ?? 24;
    const q = this.carry.coreQuality ?? 0.7;
    this.mass = remnantMass(starMass, q);
    this.remnant = this.mass >= TOV_LIMIT ? 'bh' : 'ns';

    this.star = new StarBody({
      color: new THREE.Color(0.6, 0.1, 0.05),
      hot: new THREE.Color(1, 0.35, 0.2),
      granulation: 1.5,
      intensity: 1.0,
      spots: 0.6,
      boil: 1.3,
      rays: 0.5,
      coronaScale: 2.3,
      core: 2,
    });
    this.star.setRadius(8);
    this.group.add(this.star);
    g.rig.setImmediate({ distance: 30, pitch: 0.3, yaw: g.rig.state.yaw, fov: 45 }, new THREE.Vector3());
    g.rig.autoOrbit = 0.02;

    const qn = g.quality.profile.particles;
    this.n = Math.floor(16000 * qn + 3000);
    this.dir = new Float32Array(this.n * 3);
    this.spd = new Float32Array(this.n);
    this.col = new Uint8Array(this.n);
    this.dist = new Float32Array(this.n);
    const rng = g.rng.fork(6);
    const f1 = new THREE.Vector3(rng.range(2, 5), rng.range(2, 5), rng.range(2, 5));
    for (let i = 0; i < this.n; i++) {
      const u = rng.range(-1, 1);
      const th = rng.range(0, Math.PI * 2);
      const s = Math.sqrt(1 - u * u);
      const x = s * Math.cos(th);
      const y = u * 0.8;
      const z = s * Math.sin(th);
      this.dir[i * 3] = x;
      this.dir[i * 3 + 1] = y;
      this.dir[i * 3 + 2] = z;
      // Rayleigh-Taylor-like fingers: speed modulated by a directional pseudo-noise field.
      const fing = Math.sin(x * f1.x * 3 + y * 5) * Math.cos(z * f1.y * 3 - x * 2) + Math.sin(y * f1.z * 4 + z * 3) * 0.5;
      this.spd[i] = 22 * (0.55 + 0.3 * fing + rng.range(0, 0.45)) * (rng.chance(0.08) ? 1.5 : 1);
      this.col[i] = Math.floor(rng.next() * PALETTE.length);
    }
    this.ej = this.track(new SpriteBatch(this.n, 'glow', { stretch: 0.05, maxStretch: 5 }));
    this.shell = this.track(new SpriteBatch(1200, 'soft', { stretch: 0.02 }));
    this.shell.mesh.renderOrder = 2;
    this.ej.mesh.renderOrder = 3;
    this.group.add(this.shell.mesh, this.ej.mesh);
    for (let i = 0; i < 2; i++) {
      const b = new JetBeam(0xe0f0ff, 0x7aa0ff);
      b.visible = false;
      this.beams.push(b);
      this.group.add(b);
    }
    this.run();
  }

  private async run() {
    const g = this.game;
    this.cinematic = true;
    g.pipe.final.letterboxTarget = 1;
    g.audio.setIntensity(0.9);
    // 1. Implosion
    g.audio.collapseSuck(1.3);
    g.rig.animate({ distance: 20 }, 1.3);
    const t0 = this.t;
    while (this.alive && this.t - t0 < 1.3) {
      this.implode = (this.t - t0) / 1.3;
      g.pipe.final.chroma = this.implode * 1.5;
      g.pipe.final.pulse = this.implode * 2;
      g.shake(0.02);
      await this.wait(0);
    }
    this.implode = 1;
    // 2. Silence
    g.audio.setIntensity(0);
    g.pipe.final.pulse = 0;
    g.pipe.final.chroma = 0;
    this.star.visible = false;
    await this.wait(0.55);
    // 3. Explosion
    this.exploded = true;
    g.prog.add('supernovae', 1);
    g.bus.emit('supernova', { remnant: this.remnant });
    g.audio.boom();
    g.audio.swell(12);
    g.pipe.final.doFlash(1.2, 0xffffff);
    g.pipe.bloomBoost = 3.5;
    g.pipe.exposure = 1.5;
    g.shake(1);
    g.pipe.final.shockwave(new THREE.Vector3(), 1.5, 2.2, 1.6);
    g.timeScale = 0.35;
    g.rig.animate({ distance: 170, pitch: 0.45 }, 8, easeOutCubic);
    await this.wait(0.25);
    g.pipe.final.shockwave(new THREE.Vector3(), 1.0, 2.6, 1.4);
    await this.wait(0.45);
    g.timeScale = 1;
    g.hud.titleCard('Supernova', tr('UN ÚLTIMO DESTELLO', 'ONE LAST BURST OF LIGHT'), tr('Durante unas semanas brillarás más que toda tu galaxia', 'For a few weeks you will outshine your entire galaxy'), 4.5);
    g.sky.set(SKY_PRESETS.remnant, 5);
    await this.wait(5);
    // 4. Remnant
    const isBH = this.remnant === 'bh';
    g.hud.titleCard(
      isBH ? tr('Agujero negro', 'Black hole') : tr('Estrella de neutrones', 'Neutron star'),
      tr('LO QUE QUEDA', 'WHAT REMAINS'),
      isBH
        ? tr(`${num(this.mass, 2)} masas solares, más allá del límite de Tolman-Oppenheimer-Volkoff`, `${num(this.mass, 2)} solar masses, beyond the Tolman-Oppenheimer-Volkoff limit`)
        : tr(`${num(this.mass, 2)} masas solares comprimidas en 20 km`, `${num(this.mass, 2)} solar masses squeezed into 20 km`),
      5,
    );
    if (isBH) g.prog.achieve('direct_collapse');
    else g.prog.discover('neutronstar');
    g.rig.animate({ distance: isBH ? 36 : 40, pitch: isBH ? 0.14 : 0.3 }, 4.5);
    const t1 = this.t;
    while (this.alive && this.t - t1 < 5) {
      const k = clamp((this.t - t1) / 3.5);
      if (isBH) {
        const bh = g.pipe.bhPass;
        bh.primaryActive = true;
        bh.bhPos.set(0, 0, 0);
        bh.rs = 0.05 + easeOutCubic(k) * 1.0;
        bh.diskIntensity = k * 0.25;
        bh.diskHeat = 0.6;
        bh.diskInner = 3;
        bh.diskOuter = 9;
        bh.diskNormal.set(0.1, 1, 0.3).normalize();
      } else this.nsGlow = k;
      await this.wait(0);
    }
    const bhMass = isBH ? Math.max(3, this.mass * 1.6) : this.mass;
    g.saveCarry({ remnant: this.remnant, bhMass });
    await g.goto(isBH ? 'blackhole' : 'neutron', { remnant: this.remnant, bhMass }, { fade: 1 });
  }

  update(dt: number) {
    const g = this.game;
    if (!this.exploded) {
      const k = easeInExpo(this.implode);
      this.star.setRadius(8 * (1 - k * 0.97));
      this.star.setLook({
        color: new THREE.Color(0.6 + k * 0.4, 0.1 + k * 0.5, 0.05 + k * 0.8),
        hot: new THREE.Color(1, 0.6 + k * 0.4, 0.4 + k * 0.6),
        granulation: 1.5,
        intensity: 0.8 + k * 2.5,
        spots: 0.6 * (1 - k),
        boil: 1.3 + k * 2,
        rays: 0.5 + k,
        coronaScale: 2.3,
        core: 2 + k * 4,
      });
      this.star.update(this.t, g.camera);
    } else {
      this.explodeT += dt;
      g.pipe.exposure = Math.max(1, g.pipe.exposure - dt * 0.6);
    }
    const b = this.ej;
    b.begin();
    const s = this.shell;
    s.begin();
    if (this.exploded) {
      const T = this.explodeT;
      // Ejecta decelerate as they sweep the interstellar medium.
      const travel = (1 - Math.exp(-T * 0.35)) / 0.35;
      const cool = clamp(T / 3);
      for (let i = 0; i < this.n; i++) {
        const v = this.spd[i];
        const d = v * travel;
        const vx = this.dir[i * 3];
        const vy = this.dir[i * 3 + 1];
        const vz = this.dir[i * 3 + 2];
        const c = PALETTE[this.col[i]];
        const hot = 1 - cool;
        const r = c[0] * cool + hot;
        const gg = c[1] * cool + hot * 0.95;
        const bb = c[2] * cool + hot * 0.9;
        const a = (0.1 + hot * 0.45) * (0.6 + 0.4 * Math.sin(i * 1.7));
        const cv = v * Math.exp(-T * 0.35);
        b.push(vx * d, vy * d, vz * d, vx * cv, vy * cv, vz * cv, r, gg, bb, a, 0.35 + (i % 5) * 0.12 + d * 0.004);
      }
      // Soft volumetric shell
      for (let i = 0; i < 1200; i++) {
        const j = (i * 13) % this.n;
        const d = this.spd[j] * travel * 0.92;
        const c = PALETTE[this.col[j]];
        s.push(this.dir[j * 3] * d, this.dir[j * 3 + 1] * d, this.dir[j * 3 + 2] * d, 0, 0, 0, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 0.05, 6 + d * 0.08);
      }
    } else {
      // Infalling matter during implosion
      const k = this.implode;
      for (let i = 0; i < Math.min(this.n, 4000); i++) {
        const d = 8 + (1 - ((this.t * 0.8 + i * 0.137) % 1)) * 40 * (1 - k * 0.6);
        const vx = this.dir[i * 3];
        const vy = this.dir[i * 3 + 1];
        const vz = this.dir[i * 3 + 2];
        b.push(vx * d, vy * d, vz * d, -vx * 30, -vy * 30, -vz * 30, 1, 0.5, 0.3, 0.05 + k * 0.2, 0.16);
      }
    }
    // Neutron star remnant glow + beams
    if (this.nsGlow > 0) {
      b.push(0, 0, 0, 0, 0, 0, 0.7, 0.85, 1, 2 * this.nsGlow, 1.5);
      const ax = new THREE.Vector3(Math.cos(this.t * 3), 0.6, Math.sin(this.t * 3)).normalize();
      this.beams[0].set(new THREE.Vector3(), ax, 30, 0.8, this.nsGlow, this.t, g.camera.position);
      this.beams[1].set(new THREE.Vector3(), ax.clone().negate(), 30, 0.8, this.nsGlow, this.t, g.camera.position);
    }
    b.end();
    s.end();
  }
}
