import * as THREE from 'three';
import { Phase } from '../Phase';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { Ring } from '../../vfx/Effects';
import { SKY_PRESETS } from '../../vfx/Sky';
import { clamp, damp, formatSolar, lerp, smoothstep } from '../../utils/math';
import type { Rng } from '../../procgen/rng';

const R0 = 20;
const T_MIN = 8;
const T_CRIT = 24;
const J0 = 0.27;

interface Clump {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  mass: number;
  dust: boolean;
  seed: number;
  alive: boolean;
}

interface Shock {
  x: number;
  z: number;
  r: number;
  speed: number;
  hit: boolean;
  warned: boolean;
  ring: Ring;
}

/**
 * STAGE 2 — Molecular cloud. Gravity vs dispersion: the player compresses the cloud to
 * exceed the Jeans mass, but compressing too fast heats the gas and blows matter away.
 */
export class CloudPhase extends Phase {
  id = 'cloud' as const;
  private rng!: Rng;
  private gas!: SpriteBatch;
  private dust!: SpriteBatch;
  private glow!: SpriteBatch;
  private cap = 0;
  private n = 0;
  private lx!: Float32Array;
  private ly!: Float32Array;
  private lz!: Float32Array;
  private vx!: Float32Array;
  private vy!: Float32Array;
  private vz!: Float32Array;
  private kind!: Uint8Array; // 0 gas, 1 dust
  private lost: { x: number; y: number; z: number; vx: number; vz: number; life: number }[] = [];
  private C = new THREE.Vector3();
  private vel = new THREE.Vector2();
  private prevVel = new THREE.Vector2();
  private M0 = 3200;
  private M = 3200;
  private unit = 1;
  private T = 10;
  private c = 0;
  private R = R0;
  private prevR = R0;
  private dustiness = 0;
  private J = 0;
  private critT = 0;
  private clumps: Clump[] = [];
  private shocks: Shock[] = [];
  private shockTimer = 22;
  private hotStar = new THREE.Vector3();
  private hotStarBatch!: SpriteBatch;
  private boundary!: Ring;
  private collapsing = 0;
  private done = false;
  private everCompressed = false;
  private loss = 0;

  touchLabels(): [string | null, string | null] {
    return ['Contraer', null];
  }

  enter() {
    const g = this.game;
    this.rng = g.rng.fork(2);
    g.setStage(2);
    g.sky.set(SKY_PRESETS.cloud, 2);
    g.audio.setEra('cloud');
    g.motes.color.setRGB(0.7, 0.6, 1.0);
    g.motes.alpha = 0.3;
    this.M0 = this.carry.cloudMass ?? 3200;
    this.M = this.M0;
    g.rig.setImmediate({ distance: 130, pitch: 0.8, yaw: 0, fov: 50 }, new THREE.Vector3());
    g.rig.animate({ distance: 95 }, 3);

    const q = g.quality.profile.particles;
    this.cap = Math.floor(5200 * q + 1200);
    const initial = Math.floor(this.cap * 0.62);
    this.unit = this.M0 / initial;
    this.lx = new Float32Array(this.cap);
    this.ly = new Float32Array(this.cap);
    this.lz = new Float32Array(this.cap);
    this.vx = new Float32Array(this.cap);
    this.vy = new Float32Array(this.cap);
    this.vz = new Float32Array(this.cap);
    this.kind = new Uint8Array(this.cap);
    for (let i = 0; i < initial; i++) this.addParticle(this.rng.gauss(0, R0 * 0.6), this.rng.gauss(0, R0 * 0.25), this.rng.gauss(0, R0 * 0.6), 0, 0, 0, 0);
    this.gas = this.track(new SpriteBatch(this.cap + 1500, 'soft', { stretch: 0.02, maxStretch: 2 }));
    this.dust = this.track(new SpriteBatch(this.cap, 'dark', { stretch: 0.02, maxStretch: 2 }));
    this.glow = this.track(new SpriteBatch(this.cap + 200, 'glow', { stretch: 0.025, maxStretch: 3 }));
    this.hotStarBatch = this.track(new SpriteBatch(4, 'star'));
    this.group.add(this.dust.mesh, this.gas.mesh, this.glow.mesh, this.hotStarBatch.mesh);
    this.gas.mesh.renderOrder = 2;
    this.dust.mesh.renderOrder = 3;
    this.glow.mesh.renderOrder = 4;

    const r = this.rng;
    for (let i = 0; i < 9; i++) this.spawnClump(i < 3);
    const a = r.range(0, Math.PI * 2);
    this.hotStar.set(Math.cos(a) * 170, 0, Math.sin(a) * 170);
    this.boundary = new Ring(0xb89cff, false, 0.01);
    this.boundary.mat.uniforms.uDash.value = 64;
    this.group.add(this.boundary);
    this.script();
  }

  private addParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, kind: number) {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    this.lx[i] = x;
    this.ly[i] = y;
    this.lz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.kind[i] = kind;
    return true;
  }

  private removeParticle(i: number) {
    const last = --this.n;
    this.lx[i] = this.lx[last];
    this.ly[i] = this.ly[last];
    this.lz[i] = this.lz[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.vz[i] = this.vz[last];
    this.kind[i] = this.kind[last];
  }

  private spawnClump(near = false) {
    const r = this.rng;
    const a = r.range(0, Math.PI * 2);
    const d = near ? r.range(70, 110) : r.range(120, 220);
    const dust = r.chance(0.3);
    this.clumps.push({
      x: this.C.x + Math.cos(a) * d,
      z: this.C.z + Math.sin(a) * d,
      vx: r.gauss(0, 2),
      vz: r.gauss(0, 2),
      r: dust ? r.range(6, 9) : r.range(8, 13),
      mass: this.M0 * (dust ? r.range(0.03, 0.05) : r.range(0.06, 0.1)),
      dust,
      seed: r.range(0, 1000),
      alive: true,
    });
  }

  private async script() {
    const g = this.game;
    await this.wait(1);
    g.hud.titleCard('Nube molecular', 'ETAPA 02', 'Gravedad contra dispersión', 3.5);
    await this.wait(4);
    this.tutorial('c2_compress', `Mantén <kbd>${g.input.touchMode ? 'CONTRAER' : 'CLIC'}</kbd> para <b>contraer</b> la nube. Comprimir calienta el gas: si te calientas demasiado, la materia se dispersa.`, 9);
    await this.wait(10);
    this.tutorial('c2_jeans', 'Para colapsar debes superar la <b>masa de Jeans</b>: más masa, más densidad y <b>menos temperatura</b>. Contrae con suavidad y deja enfriar.', 9);
    await this.wait(10);
    this.tutorial('c2_clumps', 'Absorbe otras nubes cercanas para ganar masa. Las nubes de polvo ayudan a enfriarte.', 7);
  }

  debugSkip() {
    this.J = 2;
    this.critT = 3;
  }
  debugBoost() {
    this.M *= 1.2;
  }

  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const C = this.C;

    // --- Movement (inertia matters: jerky moves shed outer gas)
    this.prevVel.copy(this.vel);
    if (!this.cinematic) {
      const steer = input.steer(g.camera, C, 4, 40);
      const speed = 22;
      this.vel.x = damp(this.vel.x, steer.x * speed, 2.2, dt);
      this.vel.y = damp(this.vel.y, steer.y * speed, 2.2, dt);
    } else this.vel.multiplyScalar(1 - dt * 3);
    C.x += this.vel.x * dt;
    C.z += this.vel.y * dt;
    const accX = (this.vel.x - this.prevVel.x) / Math.max(dt, 1e-4);
    const accZ = (this.vel.y - this.prevVel.y) / Math.max(dt, 1e-4);

    // --- Thermodynamics (simplified, intentionally)
    const holding = input.primaryHeld && !this.cinematic;
    if (holding) this.everCompressed = true;
    this.c = clamp(this.c + (holding ? 0.85 : -0.22) * dt);
    let RT = R0 * Math.pow(this.M / this.M0, 1 / 3) * Math.sqrt(this.T / 10) / (1 + 1.5 * this.c);
    if (this.cinematic) RT = lerp(this.R, 1.2, this.collapsing);
    this.prevR = this.R;
    this.R = damp(this.R, RT, 1.1, dt);
    const dR = (this.R - this.prevR) / Math.max(dt, 1e-4);
    const adiabatic = Math.max(0, -dR / this.R) * this.T * 2.6 + this.c * 1.5;
    const starDist = Math.hypot(C.x - this.hotStar.x, C.z - this.hotStar.z);
    const radiation = smoothstep(90, 30, starDist) * 6;
    const coolRate = 0.33 * (1 + this.dustiness * 0.6) * Math.sqrt(R0 / this.R);
    if (!this.cinematic) this.T += (adiabatic + radiation - (this.T - T_MIN) * coolRate) * dt;
    this.T = clamp(this.T, T_MIN, 120);

    // Dispersion: hot gas escapes the cloud.
    let escapeRate = this.T > T_CRIT ? (this.T - T_CRIT) * 0.004 : 0;
    const shake = Math.hypot(accX, accZ);
    if (shake > 60) escapeRate += (shake - 60) * 0.00008;

    this.J = J0 * Math.pow(this.M / this.M0, 1.5) * Math.pow(10 / this.T, 1.5) * Math.pow(R0 / this.R, 1.5);
    if (!this.cinematic) {
      if (this.J >= 1) this.critT += dt;
      else this.critT = Math.max(0, this.critT - dt * 1.5);
    }

    // --- Particle dynamics: harmonic well sized to R + thermal noise + turbulence
    const omega = this.cinematic ? 1.6 + this.collapsing * 3 : 1.2;
    const gamma = 1.4;
    const sigma = omega * this.R * Math.sqrt((2 * gamma) / 3) * 1.15;
    const sq = Math.sqrt(dt);
    const t = this.t;
    const turb = 7 + this.T * 0.1;
    let lostMass = 0;
    const R = this.R;
    for (let i = 0; i < this.n; i++) {
      const x = this.lx[i];
      const y = this.ly[i];
      const z = this.lz[i];
      let ax = -omega * omega * x - accX * 0.55;
      let ay = -omega * omega * y * 2.2;
      let az = -omega * omega * z - accZ * 0.55;
      // cheap curl-like turbulence -> filaments
      ax += Math.sin(z * 0.11 + t * 0.4) * turb + Math.sin(y * 0.3 + x * 0.07 + t * 0.2) * turb * 0.5;
      az += Math.cos(x * 0.11 - t * 0.35) * turb + Math.cos(z * 0.23 + t * 0.15) * turb * 0.4;
      if (this.cinematic) {
        // angular momentum: collapse spins up into a disk
        const rr = Math.sqrt(x * x + z * z) + 0.5;
        ax += (-z / rr) * 40 * this.collapsing;
        az += (x / rr) * 40 * this.collapsing;
        ay -= y * 8 * this.collapsing;
      }
      const noise = this.cinematic ? 0.3 : 1;
      this.vx[i] += ax * dt + this.rng.gauss(0, sigma) * sq * noise;
      this.vy[i] += ay * dt + this.rng.gauss(0, sigma * 0.5) * sq * noise;
      this.vz[i] += az * dt + this.rng.gauss(0, sigma) * sq * noise;
      const damping = 1 - gamma * dt;
      this.vx[i] *= damping;
      this.vy[i] *= damping;
      this.vz[i] *= damping;
      this.lx[i] += this.vx[i] * dt;
      this.ly[i] += this.vy[i] * dt;
      this.lz[i] += this.vz[i] * dt;
      const r2 = this.lx[i] * this.lx[i] + this.lz[i] * this.lz[i];
      const escape = !this.cinematic && (r2 > R * R * 10 || (escapeRate > 0 && this.rng.next() < escapeRate * dt * 6 && r2 > R * R * 0.4));
      if (escape) {
        const rr = Math.sqrt(r2) + 1e-3;
        this.lost.push({ x: C.x + this.lx[i], y: this.ly[i], z: C.z + this.lz[i], vx: (this.lx[i] / rr) * 14 + this.vel.x, vz: (this.lz[i] / rr) * 14 + this.vel.y, life: 1 });
        this.removeParticle(i);
        i--;
        lostMass += this.unit;
      }
    }
    if (lostMass > 0) {
      this.M = Math.max(this.M0 * 0.4, this.M - lostMass);
      this.loss += lostMass;
      if (this.loss > this.M0 * 0.01) {
        this.loss = 0;
        g.hud.floater('DISPERSIÓN', C.clone().add(new THREE.Vector3(0, R * 0.8, 0)), '#ff9a7a', 13, 1.2);
        this.tutorial('c2_hot', '¡Demasiado caliente! La presión está <b>dispersando</b> tu nube. Suelta y deja que se enfríe.', 6);
      }
    }

    this.updateClumps(dt);
    this.updateShocks(dt);
    this.render(dt);

    // --- HUD
    const jPct = clamp(this.J / 1);
    g.hud.setMass(formatSolar(this.M), 'M☉', `${Math.round(this.T)} K · radio ${(this.R * 0.5).toFixed(1)} pc`);
    const ready = this.J >= 1;
    g.hud.setObjective(
      this.done ? 'COLAPSO GRAVITACIONAL' : ready ? `¡Masa de Jeans superada! Mantén la nube estable… ${Math.ceil(Math.max(0, 3 - this.critT))}` : 'Supera la masa de Jeans: comprime sin sobrecalentarte',
      ready ? this.critT / 3 : jPct,
    );
    g.hud.setMeters([
      { id: 'jeans', label: 'Masa / masa de Jeans', value: jPct, text: `${(this.J * 100).toFixed(0)}%`, color: ready ? '#7dffb2' : '#c49bff' },
      { id: 'temp', label: 'Temperatura', value: this.T / 60, text: `${this.T.toFixed(0)} K`, color: this.T > T_CRIT ? '#ff6a4a' : '#8fd3ff', warn: this.T > T_CRIT, zone: [T_MIN / 60, T_CRIT / 60] },
      { id: 'dens', label: 'Compresión', value: this.c, color: '#ffb0f0' },
    ]);
    this.abilities([{ id: 'compress', key: input.touchMode ? 'BTN' : 'CLIC', name: 'Contraer', active: holding }]);
    g.audio.setIntensity(0.25 + jPct * 0.4 + this.c * 0.15);
    if (!this.cinematic) {
      g.rig.target.set(C.x, 0, C.z);
      g.rig.state.distance = damp(g.rig.state.distance, 55 + this.R * 2.4, 1.2, dt);
    }

    if (!this.done && this.critT >= 3) {
      this.done = true;
      this.collapse();
    }
  }

  private updateClumps(dt: number) {
    const g = this.game;
    const C = this.C;
    for (const cl of this.clumps) {
      if (!cl.alive) continue;
      // Weak mutual attraction so clumps drift towards the player's cloud.
      const dx = C.x - cl.x;
      const dz = C.z - cl.z;
      const d = Math.hypot(dx, dz) + 1e-3;
      const pull = (this.M / this.M0) * 1200 / (d * d + 400);
      cl.vx += (dx / d) * pull * dt;
      cl.vz += (dz / d) * pull * dt;
      cl.vx *= 1 - dt * 0.1;
      cl.vz *= 1 - dt * 0.1;
      cl.x += cl.vx * dt;
      cl.z += cl.vz * dt;
      if (d > 320) {
        cl.alive = false;
        continue;
      }
      if (!this.cinematic && d < this.R * 1.2 + cl.r) {
        cl.alive = false;
        // Transfer its matter into the cloud as infalling particles.
        const count = Math.round(cl.mass / this.unit);
        for (let k = 0; k < count; k++) {
          const ox = cl.x - C.x + this.rng.gauss(0, cl.r * 0.5);
          const oz = cl.z - C.z + this.rng.gauss(0, cl.r * 0.5);
          if (!this.addParticle(ox, this.rng.gauss(0, 2), oz, cl.vx - this.vel.x, 0, cl.vz - this.vel.y, cl.dust ? 1 : 0)) break;
        }
        this.M += cl.mass;
        if (cl.dust) {
          this.dustiness += 1;
          g.hud.floater(`+${formatSolar(cl.mass)} M☉ · POLVO: MEJOR ENFRIAMIENTO`, new THREE.Vector3(cl.x, 5, cl.z), '#ffc6a0', 13, 1.8);
        } else g.hud.floater(`+${formatSolar(cl.mass)} M☉`, new THREE.Vector3(cl.x, 5, cl.z), '#e5d0ff', 15, 1.4);
        g.audio.capture(0.4);
        g.prog.add('particles', count);
      }
    }
    this.clumps = this.clumps.filter((c) => c.alive);
    while (!this.done && this.clumps.length < 7) this.spawnClump();
  }

  private updateShocks(dt: number) {
    const g = this.game;
    const C = this.C;
    if (!this.cinematic) this.shockTimer -= dt;
    if (this.shockTimer <= 0) {
      this.shockTimer = this.rng.range(22, 32);
      const a = this.rng.range(0, Math.PI * 2);
      const ring = new Ring(0xff9a6a, false, 0.012);
      ring.mat.uniforms.uFill.value = 0.12;
      this.group.add(ring);
      this.shocks.push({ x: C.x + Math.cos(a) * 170, z: C.z + Math.sin(a) * 170, r: 0, speed: 38, hit: false, warned: false, ring });
      g.hud.toast('✺', 'Supernova lejana', 'Una onda de choque se aproxima');
      g.audio.warning();
    }
    for (const s of this.shocks) {
      s.r += s.speed * dt;
      const d = Math.hypot(C.x - s.x, C.z - s.z);
      s.ring.position.set(s.x, 0, s.z);
      s.ring.setWorldRadius(Math.max(0.1, s.r));
      s.ring.opacity = clamp(1 - s.r / 420) * 0.9;
      s.ring.tick(this.t, g.camera);
      if (!s.warned && d - s.r < 80) {
        s.warned = true;
        this.tutorial('c2_shock', '¡Onda de choque! Si estás <b>contrayendo</b> cuando llegue, te comprimirá a tu favor. Si no, calentará y dispersará tu gas.', 7);
      }
      if (!s.hit && s.r >= d - this.R * 0.5) {
        s.hit = true;
        g.shake(0.35);
        g.pipe.final.shockwave(C.clone(), 0.6, 1.2, 0.5);
        const dirx = (C.x - s.x) / d;
        const dirz = (C.z - s.z) / d;
        if (this.c > 0.5) {
          this.R *= 0.72;
          this.M *= 1.06;
          this.T += 3;
          g.hud.floater('¡COMPRESIÓN POR CHOQUE!', C.clone().add(new THREE.Vector3(0, 8, 0)), '#7dffb2', 17, 2);
          g.audio.hit('perfect', 3);
        } else {
          this.T += 14;
          for (let i = 0; i < this.n; i++) {
            this.vx[i] += dirx * 12;
            this.vz[i] += dirz * 12;
          }
          g.hud.floater('CALENTAMIENTO POR CHOQUE', C.clone().add(new THREE.Vector3(0, 8, 0)), '#ff9a7a', 15, 1.8);
          g.audio.thump(0.3);
        }
      }
    }
    this.shocks = this.shocks.filter((s) => {
      if (s.r > 420) {
        this.group.remove(s.ring);
        s.ring.geometry.dispose();
        s.ring.mat.dispose();
        return false;
      }
      return true;
    });
  }

  private render(dt: number) {
    const g = this.game;
    const C = this.C;
    const tc = clamp((this.T - 8) / 45);
    // cold violet-blue -> pink -> orange as it heats
    const cr = lerp(0.42, 1.0, tc);
    const cg = lerp(0.36, 0.55, tc) + (this.J > 1 ? 0.08 : 0);
    const cb = lerp(1.0, 0.45, tc);
    const gas = this.gas;
    const dust = this.dust;
    const glow = this.glow;
    gas.begin();
    dust.begin();
    glow.begin();
    const size = Math.max(2.2, this.R * 0.3);
    for (let i = 0; i < this.n; i++) {
      const x = C.x + this.lx[i];
      const y = this.ly[i];
      const z = C.z + this.lz[i];
      const rr = Math.sqrt(this.lx[i] * this.lx[i] + this.lz[i] * this.lz[i]) / this.R;
      const dens = clamp(1.3 - rr * 0.6);
      if (this.kind[i] === 1 || (i % 9 === 4 && rr > 0.55)) {
        dust.push(x, y + 1, z, this.vx[i], 0, this.vz[i], 0.04, 0.025, 0.03, 0.2, size * 0.7);
      } else if (i % 6 !== 0) {
        // Per-particle hue variation: blue reflection nebula, violet, H-alpha pink.
        const hv = (i * 0.618034) % 1;
        const mr = hv < 0.33 ? 0.3 : hv < 0.66 ? 1.0 : cr;
        const mg = hv < 0.33 ? 0.5 : hv < 0.66 ? 0.35 : cg;
        const mb = hv < 0.33 ? 1.0 : hv < 0.66 ? 0.7 : cb;
        const k = 0.35;
        const br = dens * (0.6 + ((i * 0.371) % 1) * 0.6);
        gas.push(x, y, z, this.vx[i], this.vy[i], this.vz[i], (cr * (1 - k) + mr * k) * br, (cg * (1 - k) + mg * k) * br, (cb * (1 - k) + mb * k) * br, 0.03 + dens * 0.05, size * (0.6 + (i % 7) * 0.2));
      } else {
        glow.push(x, y, z, this.vx[i], this.vy[i], this.vz[i], cr, cg + 0.1, cb, 0.06 + dens * 0.1, 0.3 + (i % 4) * 0.1);
      }
    }
    // Dense protostellar cores appear as the cloud approaches collapse.
    const coreGlow = clamp(this.J - 0.5) + this.collapsing * 2;
    if (coreGlow > 0) {
      glow.push(C.x, 0, C.z, 0, 0, 0, 1.0, 0.7, 0.5, coreGlow * 0.8, this.R * 0.2 + this.collapsing * 4);
      glow.push(C.x, 0, C.z, 0, 0, 0, 1.0, 0.95, 0.8, coreGlow, 1 + this.collapsing * 2);
    }
    // Escaping gas
    this.lost = this.lost.filter((p) => {
      p.life -= dt * 0.5;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if (p.life <= 0) return false;
      gas.push(p.x, p.y, p.z, p.vx, 0, p.vz, 1.0, 0.5, 0.35, p.life * 0.18, size * 0.7);
      return true;
    });
    // Other clumps
    for (const cl of this.clumps) {
      const cnt = 16;
      for (let k = 0; k < cnt; k++) {
        const a = cl.seed + k * 2.39996;
        const rr = cl.r * (0.3 + ((k * 0.618) % 1) * 0.8);
        const x = cl.x + Math.cos(a + this.t * 0.2) * rr;
        const z = cl.z + Math.sin(a + this.t * 0.2) * rr;
        if (cl.dust) dust.push(x, 1, z, 0, 0, 0, 0.06, 0.04, 0.03, 0.5, cl.r * 0.55);
        else gas.push(x, 0, z, cl.vx, 0, cl.vz, 0.55, 0.45, 1.0, 0.2, cl.r * 0.55);
      }
      if (!cl.dust) glow.push(cl.x, 0, cl.z, 0, 0, 0, 0.7, 0.6, 1.0, 0.4, 1.4);
    }
    // Hot O-type star that ionises its surroundings
    const hs = this.hotStarBatch;
    hs.begin();
    hs.push(this.hotStar.x, 0, this.hotStar.z, 0, 0, 0, 0.6, 0.75, 1.0, 1.6, 14);
    hs.end();
    for (let k = 0; k < 24; k++) {
      const a = k * 0.26 + this.t * 0.05;
      const rr = 20 + (k % 5) * 7;
      gas.push(this.hotStar.x + Math.cos(a) * rr, -2, this.hotStar.z + Math.sin(a) * rr, 0, 0, 0, 0.3, 0.55, 1.0, 0.08, 22);
    }
    gas.end();
    dust.end();
    glow.end();

    this.boundary.position.set(C.x, 0, C.z);
    this.boundary.setWorldRadius(this.R * 1.6);
    this.boundary.opacity = this.cinematic ? 0 : 0.18 + this.c * 0.3;
    this.boundary.setColor(this.T > T_CRIT ? 0xff7a5a : this.J >= 1 ? 0x7dffb2 : 0xb89cff);
    this.boundary.tick(this.t, g.camera);
  }

  private async collapse() {
    const g = this.game;
    this.cinematic = true;
    g.hud.clearHint();
    g.pipe.final.letterboxTarget = 1;
    g.hud.titleCard('Colapso gravitacional', 'LA NUBE CEDE', '', 4);
    g.audio.swell(10);
    g.audio.collapseSuck(4.2);
    g.rig.animate({ distance: 22, pitch: 0.55, yaw: g.rig.state.yaw + 0.8 }, 4.8);
    const start = this.t;
    while (this.alive && this.t - start < 4.5) {
      this.collapsing = (this.t - start) / 4.5;
      g.pipe.final.chroma = this.collapsing * 0.6;
      g.pipe.bloomBoost = this.collapsing * 1.2;
      await this.wait(0);
    }
    g.pipe.final.doFlash(1, 0xffd8b0);
    g.pipe.final.shockwave(this.C.clone(), 1, 1.4, 0.8);
    g.shake(0.6);
    g.audio.thump(0.6);
    const starMass = clamp(14 + ((this.M - this.M0) / this.M0) * 30 + this.dustiness * 0.5, 12, 55);
    g.saveCarry({ starMass });
    await this.wait(0.4);
    await g.goto('protostar', { starMass }, { fade: 0.6 });
  }
}
