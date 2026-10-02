import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { StarBody, type StarLook } from '../../vfx/StarBody';
import { JetBeam } from '../../vfx/Effects';
import { SKY_PRESETS } from '../../vfx/Sky';
import { TAU, clamp, damp, easeInExpo, easeInOut, easeOutCubic } from '../../utils/math';

type Pose = 'dust' | 'cloud' | 'disk' | 'scatter' | 'boom' | 'debris' | 'gone';

interface Stage {
  at: number;
  pose: Pose;
  caption: string;
  era: string;
  sky: string;
}

/** The journey, from dust to a galaxy (seconds from the start). */
const STAGES: Stage[] = [
  { at: 0, pose: 'dust', caption: 'Al principio, solo había polvo en la oscuridad.', era: 'primordial', sky: 'darkAges' },
  { at: 7.5, pose: 'cloud', caption: 'La gravedad lo reunió en una nube.', era: 'cloud', sky: 'cloud' },
  { at: 14.5, pose: 'disk', caption: 'En su centro se encendió una estrella.', era: 'protostar', sky: 'stellar' },
  { at: 21.5, pose: 'scatter', caption: 'Brilló millones de años, forjando los elementos.', era: 'star', sky: 'stellar' },
  { at: 28.5, pose: 'boom', caption: 'Hasta que colapsó… y estalló.', era: 'iron', sky: 'collapse' },
  { at: 36, pose: 'debris', caption: 'De sus restos nació un agujero negro.', era: 'blackhole', sky: 'blackhole' },
  { at: 44, pose: 'gone', caption: 'Y a su alrededor, toda una galaxia.', era: 'galaxy', sky: 'cluster' },
];
export const INTRO_LENGTH = 56;

const COLORS: Record<Pose, [number, number, number, number]> = {
  dust: [1, 0.82, 0.62, 0.6],
  cloud: [0.72, 0.55, 1, 0.38],
  disk: [1, 0.62, 0.32, 0.55],
  scatter: [0.75, 0.85, 1, 0.12],
  boom: [1, 0.85, 0.6, 0.6],
  debris: [1, 0.72, 0.42, 0.3],
  gone: [1, 0.8, 0.6, 0],
};

const look = (c: [number, number, number], hot: [number, number, number], intensity: number, boil: number, core: number): StarLook => ({
  color: new THREE.Color(...c),
  hot: new THREE.Color(...hot),
  granulation: 1.8,
  intensity,
  spots: 0.2,
  boil,
  rays: 0.8,
  coronaScale: 2.4,
  core,
});

/**
 * Pomodoro intro: the whole game in one minute. A single particle system morphs from
 * dust to a cloud, an accretion disc, a star's wind and a supernova; then the black
 * hole appears and the camera pulls back to reveal a galaxy.
 */
export class IntroCinematic {
  done = false;
  t = 0;
  private stage = -1;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private rnd: Float32Array;
  private pts: SpriteBatch;
  private puffs: SpriteBatch;
  private star: StarBody;
  private jets: JetBeam[] = [];
  private starR = 0;
  private alpha = 0;
  private col = new THREE.Color(1, 0.8, 0.6);
  private boomT = -1;

  /** `gal`: anything with a fade (the pomodoro's living galaxy). */
  constructor(private game: Game, private group: THREE.Group, private gal: { fade: number }) {
    const q = game.quality.profile.particles;
    this.n = Math.floor(2600 * q + 700);
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.rnd = new Float32Array(this.n * 4);
    for (let i = 0; i < this.n * 4; i++) this.rnd[i] = Math.random();
    for (let i = 0; i < this.n; i++) this.posePoint(i, 'dust', 0, this.pos, i * 3);
    this.pts = new SpriteBatch(this.n, 'glow', { stretch: 0.03 });
    this.puffs = new SpriteBatch(120, 'soft', { stretch: 0 });
    this.puffs.mesh.renderOrder = 4;
    this.pts.mesh.renderOrder = 6;
    this.star = new StarBody(look([1, 0.35, 0.15], [1, 0.7, 0.4], 1.2, 1.2, 1));
    this.star.setRadius(0.001);
    this.star.visible = false;
    for (let k = 0; k < 2; k++) {
      const j = new JetBeam(0xffe0c0, 0xff7a40);
      j.visible = false;
      this.jets.push(j);
      group.add(j);
    }
    group.add(this.puffs.mesh, this.pts.mesh, this.star);
    gal.fade = 0;
    const g = game;
    g.pipe.bhPass.primaryActive = false;
    g.rig.setImmediate({ distance: 140, pitch: 0.35, yaw: 0.3, fov: 50 }, new THREE.Vector3());
    g.rig.autoOrbit = 0.05;
    g.motes.alpha = 0.2;
  }

  /** Target position of particle `i` for a pose. */
  private posePoint(i: number, pose: Pose, t: number, out: Float32Array, o: number) {
    const r = this.rnd;
    const u1 = r[i * 4];
    const u2 = r[i * 4 + 1];
    const u3 = r[i * 4 + 2];
    const u4 = r[i * 4 + 3];
    let x = 0;
    let y = 0;
    let z = 0;
    if (pose === 'dust' || pose === 'cloud') {
      const cu = u1 * 2 - 1;
      const th = u2 * TAU + t * (pose === 'dust' ? 0.03 : 0.12) * (1.2 - u3);
      const s = Math.sqrt(1 - cu * cu);
      const rad = pose === 'dust' ? 25 + 45 * u3 : 4 + 16 * Math.pow(u3, 1.5);
      x = Math.cos(th) * s * rad;
      y = cu * rad * (pose === 'dust' ? 0.8 : 0.55);
      z = Math.sin(th) * s * rad;
    } else if (pose === 'disk' || pose === 'debris') {
      const rad = pose === 'disk' ? 2.5 + 13 * u3 : 4 + 22 * u3;
      const th = u2 * TAU + t * 2.6 * Math.pow(rad, -1.5) * (pose === 'disk' ? 3 : 2);
      x = Math.cos(th) * rad;
      y = (u4 - 0.5) * rad * 0.06;
      z = Math.sin(th) * rad;
    } else {
      // Stellar wind: blown outward.
      const cu = u1 * 2 - 1;
      const th = u2 * TAU;
      const s = Math.sqrt(1 - cu * cu);
      const rad = 30 + 60 * u3;
      x = Math.cos(th) * s * rad;
      y = cu * rad;
      z = Math.sin(th) * s * rad;
    }
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = z;
  }

  skip() {
    if (this.done) return;
    this.t = INTRO_LENGTH;
    this.finishNow();
  }

  private enterStage(i: number) {
    const g = this.game;
    const s = STAGES[i];
    this.stage = i;
    g.hud.feel(s.caption, 6, 0.4);
    g.audio.setEra(s.era);
    g.sky.set(SKY_PRESETS[s.sky], 3);
    g.audio.swell(6);
    const rig = g.rig;
    switch (s.pose) {
      case 'cloud':
        rig.animate({ distance: 70, pitch: 0.3 }, 7, easeInOut);
        break;
      case 'disk':
        rig.animate({ distance: 34, pitch: 0.42 }, 6, easeInOut);
        g.audio.ignite();
        g.pipe.final.doFlash(0.25, 0xffc080);
        this.star.visible = true;
        break;
      case 'scatter':
        rig.animate({ distance: 40, pitch: 0.18 }, 7, easeInOut);
        break;
      case 'boom':
        g.audio.collapseSuck(1.3);
        rig.animate({ distance: 20 }, 1.3);
        break;
      case 'debris':
        g.pipe.bhPass.primaryActive = true;
        g.pipe.bhPass.bhPos.set(0, 0, 0);
        g.pipe.bhPass.rs = 0.01;
        g.pipe.bhPass.diskInner = 3;
        g.pipe.bhPass.diskOuter = 12;
        g.pipe.bhPass.diskIntensity = 0;
        g.pipe.bhPass.diskNormal.set(0.1, 1, 0.25).normalize();
        rig.animate({ distance: 26, pitch: 0.12 }, 6, easeInOut);
        break;
      case 'gone':
        rig.autoOrbit = 0.02;
        rig.animate({ distance: 1900, pitch: 0.9 }, 11, easeInOut);
        g.motes.alpha = 0;
        break;
    }
  }

  update(dt: number) {
    if (this.done) return;
    const g = this.game;
    this.t += dt;
    const t = this.t;
    while (this.stage + 1 < STAGES.length && t >= STAGES[this.stage + 1].at) this.enterStage(this.stage + 1);
    const st = STAGES[this.stage];
    const local = t - st.at;
    const pose = st.pose;

    // Star: protostar → massive star → collapse.
    if (pose === 'disk') {
      this.starR = damp(this.starR, 1.4, 1.2, dt);
      this.star.setLook(look([1, 0.4, 0.15], [1, 0.75, 0.45], 1.3, 1.3, 1));
      for (const [k, j] of this.jets.entries()) {
        const up = new THREE.Vector3(0, k === 0 ? 1 : -1, 0);
        j.set(up.clone().multiplyScalar(1.4), up, 22, 1.2, clamp(local / 2) * 0.8, t, g.camera.position);
      }
    } else if (pose === 'scatter') {
      this.starR = damp(this.starR, 4, 0.8, dt);
      const k = clamp(local / 5);
      this.star.setLook(look([0.45 + 0.35 * (1 - k), 0.55, 1], [0.8, 0.9, 1], 0.95, 1, 1));
      for (const j of this.jets) j.visible = false;
    } else if (pose === 'boom') {
      for (const j of this.jets) j.visible = false;
      if (this.boomT < 0) {
        const k = clamp(local / 1.3);
        this.starR = 4 * (1 - easeInExpo(k) * 0.97);
        this.star.setLook(look([1, 0.5 + k * 0.5, 0.3 + k * 0.7], [1, 1, 1], 1.6 + k * 2.5, 1 + k * 2, 2 + k * 4));
        g.pipe.final.chroma = k;
        if (k >= 1) this.explode();
      } else this.boomT += dt;
    }
    if (this.star.visible) {
      this.star.setRadius(Math.max(0.001, this.starR));
      this.star.update(t, g.camera);
    }

    // Black hole grows out of the remnant, then scales up to the galaxy's own.
    const bh = g.pipe.bhPass;
    if (pose === 'debris') {
      const k = easeOutCubic(clamp(local / 4));
      bh.rs = 0.05 + k * 1;
      bh.diskIntensity = k * 0.9;
      bh.diskHeat = 0.7;
      bh.flow = 1;
    } else if (pose === 'gone') {
      const k = clamp(local / 9);
      bh.rs = 1.05 + easeInOut(k) * 1.95;
      bh.diskIntensity = 0.9 - k * 0.2;
      this.gal.fade = easeInOut(clamp((local - 1.5) / 8));
      if (local > 3) g.sky.set(SKY_PRESETS.intergalactic, 6);
      if (local >= INTRO_LENGTH - st.at) this.finishNow();
    }

    this.renderParticles(dt, pose);
  }

  private explode() {
    const g = this.game;
    this.boomT = 0;
    this.star.visible = false;
    g.pipe.final.chroma = 0;
    g.pipe.final.doFlash(0.9, 0xffffff);
    g.pipe.final.shockwave(new THREE.Vector3(), 1.2, 2.4, 1.5);
    g.pipe.bloomBoost = 2.5;
    g.audio.boom();
    g.rig.animate({ distance: 95, pitch: 0.35 }, 6, easeOutCubic);
    // Every particle becomes ejecta, flying out from the core.
    for (let i = 0; i < this.n; i++) {
      const cu = this.rnd[i * 4] * 2 - 1;
      const th = this.rnd[i * 4 + 1] * TAU;
      const s = Math.sqrt(1 - cu * cu);
      const sp = 18 + 34 * this.rnd[i * 4 + 2];
      this.pos[i * 3] = this.pos[i * 3 + 1] = this.pos[i * 3 + 2] = 0;
      this.vel[i * 3] = Math.cos(th) * s * sp;
      this.vel[i * 3 + 1] = cu * sp * 0.8;
      this.vel[i * 3 + 2] = Math.sin(th) * s * sp;
    }
  }

  private renderParticles(dt: number, pose: Pose) {
    const target = COLORS[pose];
    this.col.r = damp(this.col.r, target[0], 1.5, dt);
    this.col.g = damp(this.col.g, target[1], 1.5, dt);
    this.col.b = damp(this.col.b, target[2], 1.5, dt);
    this.alpha = damp(this.alpha, target[3], pose === 'gone' ? 0.8 : 1.2, dt);
    const tmp = new Float32Array(3);
    const b = this.pts;
    b.begin();
    const exploding = pose === 'boom' && this.boomT >= 0;
    const lambda = pose === 'scatter' ? 0.5 : pose === 'debris' ? 0.35 : 0.9;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      let vx: number;
      let vy: number;
      let vz: number;
      if (exploding) {
        const drag = Math.exp(-dt * 0.5);
        this.vel[o] *= drag;
        this.vel[o + 1] *= drag;
        this.vel[o + 2] *= drag;
        vx = this.vel[o];
        vy = this.vel[o + 1];
        vz = this.vel[o + 2];
        this.pos[o] += vx * dt;
        this.pos[o + 1] += vy * dt;
        this.pos[o + 2] += vz * dt;
      } else {
        // Morph smoothly towards the current pose.
        this.posePoint(i, pose === 'boom' ? 'cloud' : pose, this.t, tmp, 0);
        const px = this.pos[o];
        const py = this.pos[o + 1];
        const pz = this.pos[o + 2];
        this.pos[o] = damp(px, tmp[0], lambda, dt);
        this.pos[o + 1] = damp(py, tmp[1], lambda, dt);
        this.pos[o + 2] = damp(pz, tmp[2], lambda, dt);
        vx = (this.pos[o] - px) / Math.max(dt, 1e-4);
        vy = (this.pos[o + 1] - py) / Math.max(dt, 1e-4);
        vz = (this.pos[o + 2] - pz) / Math.max(dt, 1e-4);
      }
      const u = this.rnd[i * 4 + 3];
      const hot = exploding ? Math.max(0, 1 - this.boomT / 3) : 0;
      const pal = exploding ? (i % 4 === 0 ? [1, 0.35, 0.45] : i % 4 === 1 ? [0.3, 1, 0.8] : i % 4 === 2 ? [1, 0.85, 0.35] : [0.55, 0.7, 1]) : null;
      const r = pal ? pal[0] * (1 - hot) + hot : this.col.r * (0.8 + 0.4 * u);
      const gg = pal ? pal[1] * (1 - hot) + hot : this.col.g * (0.8 + 0.3 * u);
      const bb = pal ? pal[2] * (1 - hot) + hot * 0.9 : this.col.b;
      const a = exploding ? 0.55 * Math.max(0, 1 - this.boomT / 7) + 0.05 : this.alpha;
      const size = pose === 'dust' ? 0.45 + u * 0.5 : pose === 'disk' ? 0.12 + u * 0.18 : exploding ? 0.5 + u * 0.6 : pose === 'debris' ? 0.08 + u * 0.12 : 0.25 + u * 0.35;
      b.push(this.pos[o], this.pos[o + 1], this.pos[o + 2], vx, vy, vz, r, gg, bb, a, size);
    }
    b.end();

    // Nebula puffs while it is a cloud.
    const p = this.puffs;
    p.begin();
    const cloudA = pose === 'cloud' ? clamp((this.t - STAGES[1].at) / 3) : pose === 'disk' ? Math.max(0, 1 - (this.t - STAGES[2].at) / 3) : 0;
    if (cloudA > 0) {
      for (let k = 0; k < 60; k++) {
        const a = k * 2.39996 + this.t * 0.08;
        const rr = 4 + (k % 7) * 2.6;
        const y = Math.sin(k * 1.7) * 4;
        const c = k % 3 === 0 ? [0.95, 0.4, 0.7] : k % 3 === 1 ? [0.45, 0.55, 1] : [0.7, 0.45, 1];
        p.push(Math.cos(a) * rr, y, Math.sin(a) * rr, 0, 0, 0, c[0], c[1], c[2], 0.12 * cloudA, 9 + (k % 4) * 3);
      }
    }
    p.end();
  }

  private finishNow() {
    const g = this.game;
    this.done = true;
    this.star.visible = false;
    for (const j of this.jets) j.visible = false;
    this.pts.mesh.visible = false;
    this.puffs.mesh.visible = false;
    this.gal.fade = 1;
    const bh = g.pipe.bhPass;
    bh.primaryActive = true;
    bh.bhPos.set(0, 0, 0);
    bh.rs = 3;
    bh.diskInner = 3;
    bh.diskOuter = 12;
    bh.diskIntensity = 0.7;
    bh.diskHeat = 0.7;
    bh.diskNormal.set(0.1, 1, 0.3).normalize();
    g.pipe.final.chroma = 0;
    g.motes.alpha = 0;
    g.sky.set(SKY_PRESETS.intergalactic, 2);
    g.audio.setEra('galaxy');
  }

  dispose() {
    this.group.remove(this.pts.mesh, this.puffs.mesh, this.star, ...this.jets);
    this.pts.dispose();
    this.puffs.dispose();
    this.star.dispose();
    for (const j of this.jets) {
      j.geometry.dispose();
      j.mat.dispose();
    }
  }
}
