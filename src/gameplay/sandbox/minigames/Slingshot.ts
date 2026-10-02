import * as THREE from 'three';
import { SpriteBatch } from '../../../vfx/SpriteBatch';
import { Ring } from '../../../vfx/Effects';
import { TAU } from '../../../utils/math';
import { Minigame } from './Minigame';

interface Body {
  x: number;
  z: number;
  mu: number;
  kill: number;
}

interface Orb {
  x: number;
  z: number;
  alive: boolean;
  ring: Ring;
}

type Stage = 'aim' | 'fly' | 'between' | 'over';

const BH: Body = { x: 0, z: 0, mu: 0.22, kill: 0.07 };
const LAUNCH = { x: 0, z: 1.0 };
const ASSIST_R = 0.2;
const STARS: [number, number, number] = [800, 2000, 4000];

/**
 * "Honda gravitatoria": pull back and release a comet. The black hole and a few massive
 * stars bend its path; collect the stardust orbs. Skimming the black hole without
 * falling in is a gravity assist: it multiplies everything you collect afterwards.
 */
export class Slingshot extends Minigame {
  galaxyFade = 0.4;
  private stage: Stage = 'between';
  private stageT = 0;
  private W = 500;
  private wave = 0;
  private comets = 3;
  private wells: Body[] = [];
  private orbs: Orb[] = [];
  private rings: Ring[] = [];
  private glow!: SpriteBatch;
  private star!: SpriteBatch;
  private dark!: SpriteBatch;
  private aiming = false;
  private aimFrom = new THREE.Vector2();
  private aimTo = new THREE.Vector2();
  private cx = 0;
  private cz = 0;
  private vx = 0;
  private vz = 0;
  private flyT = 0;
  private tail: [number, number][] = [];
  private mult = 1;
  private assistArmed = false;
  private shotOrbs = 0;
  private score = 0;
  private bestMult = 1;
  private collected = 0;
  private bhRing!: Ring;
  private assistRing!: Ring;
  private padRing!: Ring;

  start() {
    const c = this.ctx;
    const g = this.g;
    this.W = c.gal.params.radius * 0.85;
    this.glow = new SpriteBatch(1200, 'glow', { stretch: 0 });
    this.star = new SpriteBatch(32, 'star', { stretch: 0 });
    this.dark = new SpriteBatch(4, 'dark', { stretch: 0 });
    this.dark.mesh.renderOrder = 10;
    this.dark.material.depthTest = false;
    c.group.add(this.dark.mesh);
    this.glow.mesh.renderOrder = 11;
    this.star.mesh.renderOrder = 12;
    c.group.add(this.glow.mesh, this.star.mesh);
    this.bhRing = this.makeRing(0xff6a3a, 0.035);
    this.assistRing = this.makeRing(0x9a7cff, 0.02);
    this.padRing = this.makeRing(0x9fd6ff, 0.03);
    this.place(this.bhRing, 0, 0, BH.kill);
    this.place(this.assistRing, 0, 0, ASSIST_R);
    this.place(this.padRing, LAUNCH.x, LAUNCH.z, 0.07);
    // Top-down camera, launch pad at the bottom of the screen.
    const fov = (g.camera.fov * Math.PI) / 180;
    const aspect = window.innerWidth / window.innerHeight;
    const dist = (1.42 * this.W) / (Math.tan(fov / 2) * Math.min(1, aspect));
    const yaw = g.rig.state.yaw - Math.round(g.rig.state.yaw / TAU) * TAU;
    g.rig.state.yaw = yaw;
    g.rig.animate({ distance: dist, pitch: 1.38, yaw: 0 }, 1.6);
    c.hud.set({ title: '☄ Honda gravitatoria', progress: null, hint: 'Arrastra hacia atrás y suelta para lanzar el cometa · recoge los <b style="color:#ffd36b">orbes</b> · rozar el agujero negro sin caer = <b style="color:#c9a8ff">asistencia ×2</b>' });
    this.newWave();
  }

  private makeRing(color: number, width: number) {
    const r = new Ring(color, false, width);
    r.renderOrder = 10;
    this.ctx.group.add(r);
    this.rings.push(r);
    return r;
  }

  private place(r: Ring, x: number, z: number, rad: number) {
    r.position.set(x * this.W, 6, z * this.W);
    r.setWorldRadius(rad * this.W);
  }

  private newWave() {
    const rng = this.ctx.rng;
    this.wave++;
    this.comets = 3;
    for (const o of this.orbs) o.ring.opacity = 0;
    this.orbs = [];
    this.wells = [];
    const nWells = Math.min(4, this.wave);
    const ok = (x: number, z: number, min: number) =>
      Math.hypot(x - LAUNCH.x, z - LAUNCH.z) > 0.35 && Math.hypot(x, z) > min && this.wells.every((w) => Math.hypot(w.x - x, w.z - z) > 0.3) && this.orbs.every((o) => Math.hypot(o.x - x, o.z - z) > 0.16);
    for (let tries = 0; this.wells.length < nWells && tries < 300; tries++) {
      const a = rng() * TAU;
      const r = 0.38 + rng() * 0.55;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.9;
      if (ok(x, z, 0.35)) this.wells.push({ x, z, mu: 0.045 + rng() * 0.02, kill: 0.04 });
    }
    const nOrbs = 5 + Math.min(4, this.wave);
    for (let tries = 0; this.orbs.length < nOrbs && tries < 500; tries++) {
      const a = rng() * TAU;
      const r = 0.2 + rng() * 0.85;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.9;
      if (ok(x, z, 0.17) && this.wells.every((w) => Math.hypot(w.x - x, w.z - z) > 0.12)) {
        const ring = this.ringFor();
        this.orbs.push({ x, z, alive: true, ring });
      }
    }
    for (const o of this.orbs) this.place(o.ring, o.x, o.z, 0.055);
    this.stage = 'between';
    this.stageT = 0;
    this.ctx.hud.banner(`Oleada ${this.wave}`, `${this.orbs.length} orbes · ${this.wells.length} ${this.wells.length === 1 ? 'estrella masiva' : 'estrellas masivas'} · 3 cometas`, 1.5);
  }

  private ringFor() {
    const spare = this.rings.find((r) => r.userData.orb && r.opacity === 0);
    if (spare) return spare;
    const r = this.makeRing(0xffd36b, 0.03);
    r.userData.orb = true;
    return r;
  }

  /** Screen px → arena units. */
  private local(x: number, y: number) {
    const p = this.worldAt(x, y, 6);
    return p ? new THREE.Vector2(p.x / this.W, p.z / this.W) : null;
  }

  onDown(x: number, y: number) {
    if (this.stage !== 'aim') return;
    const p = this.local(x, y);
    if (!p) return;
    this.aiming = true;
    this.aimFrom.copy(p);
    this.aimTo.copy(p);
  }

  onMove(x: number, y: number) {
    if (!this.aiming) return;
    const p = this.local(x, y);
    if (p) this.aimTo.copy(p);
  }

  onUp() {
    if (!this.aiming) return;
    this.aiming = false;
    const v = this.launchVel();
    if (v.length() < 0.18) return;
    this.cx = LAUNCH.x;
    this.cz = LAUNCH.z;
    this.vx = v.x;
    this.vz = v.y;
    this.flyT = 0;
    this.tail = [];
    this.mult = 1;
    this.assistArmed = false;
    this.shotOrbs = 0;
    this.comets--;
    this.stage = 'fly';
    this.ctx.hud.set({ hint: '' });
    this.g.audio.whoosh(0.3);
  }

  /** Slingshot: the velocity points opposite to the drag. */
  private launchVel() {
    const v = new THREE.Vector2(this.aimFrom.x - this.aimTo.x, this.aimFrom.y - this.aimTo.y).multiplyScalar(1.7);
    if (v.length() > 1.7) v.setLength(1.7);
    return v;
  }

  private accel(x: number, z: number, out: { ax: number; az: number }) {
    out.ax = 0;
    out.az = 0;
    for (const b of [BH, ...this.wells]) {
      const dx = b.x - x;
      const dz = b.z - z;
      const r2 = dx * dx + dz * dz + 0.0004;
      const inv = b.mu / (r2 * Math.sqrt(r2));
      out.ax += dx * inv;
      out.az += dz * inv;
    }
    return out;
  }

  /** Where the comet would go (first part only): helps aiming without solving it for you. */
  private preview(): [number, number][] {
    const v = this.launchVel();
    let x = LAUNCH.x;
    let z = LAUNCH.z;
    let vx = v.x;
    let vz = v.y;
    const a = { ax: 0, az: 0 };
    const out: [number, number][] = [];
    const h = 0.01;
    for (let i = 0; i < 110; i++) {
      this.accel(x, z, a);
      vx += a.ax * h;
      vz += a.az * h;
      x += vx * h;
      z += vz * h;
      if (Math.hypot(x, z) < BH.kill || this.wells.some((w) => Math.hypot(w.x - x, w.z - z) < w.kill)) break;
      if (i % 4 === 0) out.push([x, z]);
    }
    return out;
  }

  private endShot(why: string, color: string) {
    const s = this.project(new THREE.Vector3(this.cx * this.W, 6, this.cz * this.W));
    if (why) this.ctx.hud.pop(why, s.x, s.y - 20, color, 17);
    if (this.shotOrbs >= 3) {
      this.score += 150 * (this.shotOrbs - 2);
      this.ctx.hud.pop(`¡${this.shotOrbs} de un tiro! +${150 * (this.shotOrbs - 2)}`, window.innerWidth / 2, window.innerHeight * 0.35, '#ffe6a8', 20);
    }
    this.stage = 'between';
    this.stageT = 0;
    this.tail = [];
  }

  protected step(dt: number) {
    const c = this.ctx;
    const g = this.g;
    this.stageT += dt;
    const remaining = this.orbs.filter((o) => o.alive).length;

    if (this.stage === 'between' && this.stageT > 0.9) {
      if (remaining === 0) {
        const bonus = 500 * this.wave + 150 * this.comets;
        this.score += bonus;
        g.audio.achievement();
        c.hud.banner('¡Oleada limpia!', `+${bonus} pts`, 1.4);
        this.newWave();
        this.stageT = -0.6;
      } else if (this.comets <= 0) {
        this.stage = 'over';
        this.stageT = 0;
        c.hud.banner('Sin cometas', `Quedaron ${remaining} orbes`, 1.8);
      } else this.stage = 'aim';
    } else if (this.stage === 'fly') this.fly(dt);
    else if (this.stage === 'over' && this.stageT > 2) this.finish(false);

    this.render();
    c.hud.set({
      score: `${this.score.toLocaleString('es')} pts`,
      combo: this.stage === 'fly' && this.mult > 1 ? `asistencia ×${this.mult}` : `oleada ${this.wave}`,
      timer: `☄ ${'●'.repeat(Math.max(0, this.comets))}${'○'.repeat(Math.max(0, 3 - this.comets))}`,
    });
  }

  private fly(dt: number) {
    const a = { ax: 0, az: 0 };
    const n = 8;
    const h = dt / n;
    const hud = this.ctx.hud;
    for (let i = 0; i < n; i++) {
      this.accel(this.cx, this.cz, a);
      this.vx += a.ax * h;
      this.vz += a.az * h;
      this.cx += this.vx * h;
      this.cz += this.vz * h;
      const rBH = Math.hypot(this.cx, this.cz);
      if (rBH < BH.kill) {
        this.g.pipe.final.shockwave(new THREE.Vector3(), 0.5, 1, 0.3);
        this.g.audio.capture(1);
        return this.endShot('¡Devorado!', '#ff9a6b');
      }
      // Gravity assist: dive inside the assist ring and come back out alive.
      if (rBH < ASSIST_R) this.assistArmed = true;
      else if (this.assistArmed && rBH > ASSIST_R * 1.6) {
        this.assistArmed = false;
        this.mult = Math.min(4, this.mult + 1);
        this.bestMult = Math.max(this.bestMult, this.mult);
        const s = this.project(new THREE.Vector3(this.cx * this.W, 6, this.cz * this.W));
        hud.pop(`¡ASISTENCIA GRAVITATORIA! ×${this.mult}`, s.x, s.y - 30, '#c9a8ff', 18);
        this.g.audio.hit('perfect', this.mult * 2);
      }
      for (const w of this.wells) {
        if (Math.hypot(w.x - this.cx, w.z - this.cz) < w.kill) {
          this.g.pipe.final.shockwave(new THREE.Vector3(w.x * this.W, 6, w.z * this.W), 0.4, 0.8, 0.25);
          this.g.audio.thump(0.4);
          return this.endShot('¡Choque!', '#ff8a8a');
        }
      }
      for (const o of this.orbs) {
        if (!o.alive || Math.hypot(o.x - this.cx, o.z - this.cz) > 0.065) continue;
        o.alive = false;
        o.ring.opacity = 0;
        this.shotOrbs++;
        this.collected++;
        const pts = 100 * this.mult;
        this.score += pts;
        this.g.audio.sparkle(this.shotOrbs * 2);
        const s = this.project(new THREE.Vector3(o.x * this.W, 6, o.z * this.W));
        hud.pop(`+${pts}`, s.x, s.y - 18, '#ffd36b', 17);
      }
    }
    this.flyT += dt;
    this.tail.push([this.cx, this.cz]);
    if (this.tail.length > 60) this.tail.shift();
    if (this.bestMult >= 3) this.ctx.game.prog.achieve('mg_slingshot');
    if (Math.hypot(this.cx, this.cz) > 1.7) return this.endShot('fuera', '#bfe0ff');
    if (this.flyT > 9) return this.endShot('se disipó', '#bfe0ff');
  }

  private render() {
    const W = this.W;
    const t = this.t;
    const glow = this.glow;
    const star = this.star;
    glow.begin();
    star.begin();
    const cam = this.g.camera;
    // Black hole: a dark pit over the bright bulge, its danger ring and the assist zone.
    this.dark.begin();
    this.dark.push(0, 8, 0, 0, 0, 0, 0, 0, 0, 0.95, BH.kill * W * 1.6);
    this.dark.end();
    glow.push(0, 6, 0, 0, 0, 0, 1, 0.5, 0.25, 0.25, BH.kill * W * 2.2);
    for (const r of [this.bhRing, this.assistRing, this.padRing]) r.tick(t, cam);
    this.bhRing.opacity = 0.9;
    this.assistRing.opacity = 0.35 + 0.15 * Math.sin(t * 2);
    this.padRing.opacity = this.stage === 'aim' ? 0.9 : 0.3;
    for (const w of this.wells) {
      star.push(w.x * W, 6, w.z * W, 0, 0, 0, 1, 0.75, 0.45, 1.2, 0.07 * W);
      glow.push(w.x * W, 6, w.z * W, 0, 0, 0, 1, 0.5, 0.25, 0.3, 0.18 * W);
    }
    for (const o of this.orbs) {
      if (!o.alive) continue;
      const p = 0.75 + 0.25 * Math.sin(t * 4 + o.x * 9);
      glow.push(o.x * W, 6, o.z * W, 0, 0, 0, 1, 0.82, 0.4, 0.9 * p, 0.06 * W);
      o.ring.opacity = 0.6 * p;
      o.ring.tick(t, cam);
    }
    if (this.stage === 'aim') {
      star.push(LAUNCH.x * W, 6, LAUNCH.z * W, 0, 0, 0, 0.75, 0.92, 1, 1.2, 0.05 * W);
      if (this.aiming) {
        const pts = this.preview();
        pts.forEach(([x, z], i) => glow.push(x * W, 6, z * W, 0, 0, 0, 0.75, 0.9, 1, 0.8 * (1 - i / pts.length), 0.012 * W));
        // Rubber band from the pad towards the drag.
        const v = this.launchVel();
        for (let k = 1; k <= 6; k++) {
          const f = k / 6;
          glow.push((LAUNCH.x - v.x * 0.12 * f) * W, 6, (LAUNCH.z - v.y * 0.12 * f) * W, 0, 0, 0, 1, 0.7, 0.4, 0.6, 0.01 * W);
        }
      }
    }
    if (this.stage === 'fly' || this.tail.length) {
      this.tail.forEach(([x, z], i) => {
        const f = i / this.tail.length;
        glow.push(x * W, 6, z * W, 0, 0, 0, 0.6, 0.85, 1, 0.5 * f, (0.008 + 0.02 * f) * W);
      });
      if (this.stage === 'fly') {
        star.push(this.cx * W, 6, this.cz * W, 0, 0, 0, 0.85, 0.95, 1, 1.4, 0.05 * W);
        glow.push(this.cx * W, 6, this.cz * W, 0, 0, 0, 0.6, 0.85, 1, 0.6, 0.09 * W);
      }
    }
    glow.end();
    star.end();
  }

  finish(quit: boolean) {
    if (this.result) return;
    this.result = {
      score: this.score,
      stars: quit ? 0 : this.starsFor(this.score, STARS),
      rewardSeconds: 30 + 330 * (1 - Math.exp(-this.score / 3000)),
      lines: [`Orbes recogidos <b>${this.collected}</b> · oleadas superadas <b>${this.wave - 1}</b>`, `Mejor asistencia gravitatoria <b>×${this.bestMult}</b>`],
      achievements: this.bestMult >= 3 ? ['mg_slingshot'] : [],
    };
  }

  dispose() {
    const c = this.ctx;
    for (const r of this.rings) {
      c.group.remove(r);
      r.geometry.dispose();
      r.mat.dispose();
    }
    c.group.remove(this.glow.mesh, this.star.mesh, this.dark.mesh);
    this.glow.dispose();
    this.star.dispose();
    this.dark.dispose();
  }
}
