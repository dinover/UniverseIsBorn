import * as THREE from 'three';
import { Phase } from '../Phase';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { Ring } from '../../vfx/Effects';
import { SKY_PRESETS } from '../../vfx/Sky';
import { clamp, damp, formatSolar } from '../../utils/math';
import type { Rng } from '../../procgen/rng';

const GOAL = 3200;
const WORLD = 300;
// species: 0 = hydrogen, 1 = helium, 2 = dust
const SPECIES = [
  { name: 'H', mass: 6, color: [0.55, 0.72, 1.0], size: 0.36 },
  { name: 'He', mass: 16, color: [1.0, 0.78, 0.4], size: 0.46 },
  { name: 'Polvo', mass: 10, color: [1.0, 0.42, 0.28], size: 0.6 },
];

interface Clump {
  x: number;
  z: number;
  r: number;
  vx: number;
  vz: number;
}
interface Well {
  x: number;
  z: number;
  r: number;
  found: boolean;
}

/**
 * STAGE 1 — Primordial matter. The player is a faint gravitational seed in the dark ages.
 * Core loop: steer into dense regions, find dark-matter wells, pulse gravity to pull gas in.
 */
export class PrimordialPhase extends Phase {
  id = 'primordial' as const;
  private rng!: Rng;
  private batch!: SpriteBatch;
  private playerBatch!: SpriteBatch;
  private n = 0;
  private cap = 0;
  private px!: Float32Array;
  private py!: Float32Array;
  private pz!: Float32Array;
  private vx!: Float32Array;
  private vz!: Float32Array;
  private sp!: Uint8Array;
  private clumps: Clump[] = [];
  private wells: Well[] = [];
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector2();
  private mass = 0;
  private energy = 1;
  private pulsing = false;
  private influence!: Ring;
  private pulseRing!: Ring;
  private wellRings: Ring[] = [];
  private inWell = false;
  private halo: Float32Array = new Float32Array(0);
  private done = false;
  private absorbedRecent = 0;
  private everPulsed = false;
  private collapseT = 0;

  touchLabels(): [string | null, string | null] {
    return ['Pulso', null];
  }

  enter() {
    const g = this.game;
    this.rng = g.rng.fork(1);
    g.setStage(1);
    g.sky.set(SKY_PRESETS.darkAges, 0);
    g.audio.setEra('primordial');
    g.audio.setIntensity(0.15);
    g.motes.color.setRGB(0.9, 0.7, 0.55);
    g.motes.alpha = 0.35;
    g.rig.setImmediate({ distance: 58, pitch: 1.0, yaw: 0, fov: 50 }, new THREE.Vector3());
    g.rig.followLambda = 3;

    const q = g.quality.profile.particles;
    this.cap = Math.floor(14000 * q + 2500);
    this.px = new Float32Array(this.cap);
    this.py = new Float32Array(this.cap);
    this.pz = new Float32Array(this.cap);
    this.vx = new Float32Array(this.cap);
    this.vz = new Float32Array(this.cap);
    this.sp = new Uint8Array(this.cap);
    this.batch = this.track(new SpriteBatch(this.cap, 'glow', { stretch: 0.18, maxStretch: 7 }));
    this.playerBatch = this.track(new SpriteBatch(600, 'glow', { stretch: 0.1 }));
    this.group.add(this.batch.mesh, this.playerBatch.mesh);

    // Density fluctuations: clumps of gas, some sitting inside dark matter wells.
    const r = this.rng;
    const nClumps = r.int(14, 19);
    for (let i = 0; i < nClumps; i++) {
      const ang = r.range(0, Math.PI * 2);
      const dist = i < 2 ? r.range(35, 60) : r.range(60, WORLD * 0.9);
      this.clumps.push({ x: Math.cos(ang) * dist, z: Math.sin(ang) * dist, r: r.range(12, 30), vx: r.gauss(0, 0.6), vz: r.gauss(0, 0.6) });
    }
    const nWells = r.int(5, 7);
    for (let i = 0; i < nWells; i++) {
      const c = this.clumps[(i * 3 + 1) % this.clumps.length];
      this.wells.push({ x: c.x + r.gauss(0, 6), z: c.z + r.gauss(0, 6), r: r.range(26, 38), found: false });
    }
    for (let i = 0; i < this.cap; i++) this.spawnParticle(i, i < this.cap * 0.6);
    this.n = this.cap;

    this.influence = new Ring(0xffc890, false, 0.006);
    this.influence.mat.uniforms.uDash.value = 48;
    this.pulseRing = new Ring(0xffe0b0, false, 0.05);
    this.pulseRing.opacity = 0;
    this.group.add(this.influence, this.pulseRing);
    for (const w of this.wells) {
      const ring = new Ring(0x9a7dff, false, 0.02);
      ring.position.set(w.x, -0.5, w.z);
      ring.setWorldRadius(w.r);
      ring.mat.uniforms.uFill.value = 0.5;
      ring.opacity = 0;
      this.wellRings.push(ring);
      this.group.add(ring);
    }
    this.halo = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) {
      this.halo[i * 3] = Math.random() * Math.PI * 2;
      this.halo[i * 3 + 1] = 0.6 + Math.random() * 1.8;
      this.halo[i * 3 + 2] = Math.random();
    }
    this.script();
  }

  private spawnParticle(i: number, inClump: boolean, awayFrom?: THREE.Vector3) {
    const r = this.rng;
    let x: number;
    let z: number;
    if (inClump) {
      let c: Clump;
      let tries = 0;
      do {
        c = this.clumps[Math.floor(r.next() * this.clumps.length)];
        tries++;
      } while (awayFrom && Math.hypot(c.x - awayFrom.x, c.z - awayFrom.z) < 90 && tries < 8);
      x = c.x + r.gauss(0, c.r * 0.55);
      z = c.z + r.gauss(0, c.r * 0.55);
    } else {
      const a = r.range(0, Math.PI * 2);
      const d = Math.sqrt(r.next()) * WORLD;
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
      if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < 70) {
        x = -x;
        z = -z;
      }
    }
    this.px[i] = x;
    this.pz[i] = z;
    this.py[i] = r.gauss(0, 2.5);
    this.vx[i] = r.gauss(0, 0.8);
    this.vz[i] = r.gauss(0, 0.8);
    const s = r.next();
    this.sp[i] = s < 0.7 ? 0 : s < 0.92 ? 1 : 2;
  }

  private async script() {
    const g = this.game;
    await this.wait(1.2);
    g.hud.titleCard('Materia primordial', 'ETAPA 01', 'La edad oscura del universo', 3.5);
    await this.wait(3.5);
    const moveHint = g.input.touchMode ? 'Arrastra en la parte izquierda de la pantalla para moverte.' : 'Mueve el <kbd>CURSOR</kbd> para desplazarte (o <kbd>WASD</kbd>).';
    this.tutorial('p1_move', `Eres una pequeña concentración de materia. ${moveHint}<br/>Tu gravedad, aún muy débil, atrae el gas cercano.`, 8);
    await this.wait(9);
    this.tutorial('p1_dense', 'Busca las zonas más densas: donde hay más gas, creces más rápido.', 6);
    await this.wait(7);
    if (!this.everPulsed)
      this.tutorial('p1_pulse', `Mantén <kbd>${g.input.touchMode ? 'PULSO' : 'CLIC'}</kbd> o <kbd>ESPACIO</kbd> para un <b>pulso gravitacional</b>: más alcance y fuerza, pero consume energía.`, 8);
  }

  debugSkip() {
    this.mass = GOAL;
  }
  debugBoost() {
    this.mass += GOAL * 0.2;
  }

  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const P = this.pos;

    // --- Player movement
    if (!this.cinematic) {
      const steer = input.steer(g.camera, P, 2, 22);
      const speed = 17 / (1 + this.mass / 12000);
      this.vel.x = damp(this.vel.x, steer.x * speed, 4, dt);
      this.vel.y = damp(this.vel.y, steer.y * speed, 4, dt);
    } else {
      this.vel.multiplyScalar(1 - dt * 2);
    }
    P.x += this.vel.x * dt;
    P.z += this.vel.y * dt;
    const pd = Math.hypot(P.x, P.z);
    if (pd > WORLD) P.multiplyScalar(WORLD / pd);

    // --- Pulse ability
    const want = input.primaryHeld && !this.cinematic;
    if (want && !this.pulsing && this.energy > 0.15) {
      this.pulsing = true;
      this.everPulsed = true;
      g.audio.pulse();
      g.pipe.final.shockwave(P, 0.5, 1.0, 0.35);
      this.pulseRing.opacity = 1;
      this.pulseRing.scale.setScalar(1);
    }
    if (this.pulsing) {
      this.energy -= dt * 0.38;
      if (!want || this.energy <= 0) this.pulsing = false;
    } else this.energy = Math.min(1, this.energy + dt * 0.14);
    this.energy = clamp(this.energy);

    // --- Dark matter wells
    let well = 1;
    this.inWell = false;
    for (let i = 0; i < this.wells.length; i++) {
      const w = this.wells[i];
      const d = Math.hypot(P.x - w.x, P.z - w.z);
      const ring = this.wellRings[i];
      ring.opacity = clamp(1 - (d - w.r) / 90) * 0.35 + (d < w.r ? 0.3 : 0);
      if (d < w.r) {
        well = 2;
        this.inWell = true;
        if (!w.found) {
          w.found = true;
          g.prog.discover('darkmatter');
          g.hud.floater('POZO DE MATERIA OSCURA · GRAVEDAD ×2', P.clone().add(new THREE.Vector3(0, 4, 0)), '#c7b4ff', 15, 2.2);
          g.audio.whoosh(0.12);
          this.tutorial('p1_well', 'Entraste en un <b>pozo de materia oscura</b>: aquí tu atracción se duplica. Las distorsiones del fondo te delatan dónde están.', 7);
        }
      }
    }

    // --- Gravity & particles
    const growth = Math.sqrt(this.mass);
    let reach = (14 + growth * 0.42) * (this.pulsing ? 1.8 : 1) * (well > 1 ? 1.35 : 1);
    let pull = (24 + growth * 0.9) * (this.pulsing ? 2.6 : 1) * well;
    if (this.cinematic) {
      reach = 160 + this.collapseT * 60;
      pull = 220 + this.collapseT * 200;
    }
    const capR = 1.6 + growth * 0.035;
    const reach2 = reach * reach;
    const px = this.px;
    const pz = this.pz;
    const vx = this.vx;
    const vz = this.vz;
    let absorbed = 0;
    let gained = 0;
    const t = this.t;
    for (let i = 0; i < this.n; i++) {
      const dx = P.x - px[i];
      const dz = P.z - pz[i];
      const d2 = dx * dx + dz * dz;
      if (d2 < reach2) {
        const d = Math.sqrt(d2) + 1e-4;
        const a = pull / (d + 3);
        // radial pull + a touch of swirl so matter spirals in
        vx[i] += (dx / d) * a * dt + (-dz / d) * a * 0.35 * dt;
        vz[i] += (dz / d) * a * dt + (dx / d) * a * 0.35 * dt;
        const damping = 1 - dt * 0.9;
        vx[i] *= damping;
        vz[i] *= damping;
        if (d < capR) {
          const s = this.sp[i];
          gained += SPECIES[s].mass;
          absorbed++;
          // Recycle the particle into a distant fluctuation, so the world never empties.
          this.spawnParticle(i, this.rng.next() < 0.8, P);
          continue;
        }
      } else {
        // Gentle primordial turbulence
        const k = 0.35 * dt;
        vx[i] += Math.sin(pz[i] * 0.05 + t * 0.2) * k;
        vz[i] += Math.cos(px[i] * 0.05 - t * 0.17) * k;
        const damping = 1 - dt * 0.25;
        vx[i] *= damping;
        vz[i] *= damping;
      }
      px[i] += vx[i] * dt;
      pz[i] += vz[i] * dt;
      if (px[i] * px[i] + pz[i] * pz[i] > WORLD * WORLD * 1.1) this.spawnParticle(i, true, P);
    }
    for (const c of this.clumps) {
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      if (Math.hypot(c.x, c.z) > WORLD * 0.9) {
        c.vx *= -1;
        c.vz *= -1;
      }
    }
    if (absorbed > 0 && !this.done) {
      this.mass += gained;
      this.absorbedRecent += absorbed;
      g.prog.add('particles', absorbed);
      g.audio.absorb(Math.min(1, this.mass / GOAL), 0.03 + Math.min(0.05, absorbed * 0.01));
    }

    this.render(dt, reach, capR);

    // --- HUD & progression
    const prog = this.mass / GOAL;
    g.hud.setMass(formatSolar(this.mass), 'M☉', this.inWell ? 'dentro de un pozo de materia oscura' : 'hidrógeno · helio · polvo');
    g.hud.setObjective(this.done ? 'Masa crítica alcanzada' : `Acumula masa para formar una nube · ${Math.floor(prog * 100)}%`, prog);
    g.hud.setMeters([{ id: 'energy', label: 'Energía gravitatoria', value: this.energy, color: '#ffcf8a' }]);
    this.abilities([{ id: 'pulse', key: input.touchMode ? 'BTN' : 'CLIC', name: 'Pulso gravitacional', active: this.pulsing, charge: this.energy }]);
    g.audio.setIntensity(0.15 + prog * 0.35 + (this.pulsing ? 0.15 : 0));

    // Camera grows with you
    if (!this.cinematic) {
      g.rig.target.set(P.x, 0, P.z);
      g.rig.state.distance = damp(g.rig.state.distance, 52 + growth * 0.55, 1, dt);
    }

    // Lensing hint of the dark matter wells (screen-space lens without horizon)
    const near = this.wells
      .map((w) => ({ w, d: Math.hypot(P.x - w.x, P.z - w.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    g.pipe.bhPass.rivals = near.map(({ w }) => ({ pos: new THREE.Vector3(w.x, 0, w.z), rs: w.r * 0.11, lensOnly: true }));

    if (!this.done && this.mass >= GOAL) {
      this.done = true;
      this.finish();
    }
  }

  private render(dt: number, reach: number, capR: number) {
    const g = this.game;
    const b = this.batch;
    const P = this.pos;
    b.begin();
    for (let i = 0; i < this.n; i++) {
      const s = SPECIES[this.sp[i]];
      const dx = this.px[i] - P.x;
      const dz = this.pz[i] - P.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const heat = clamp(1 - d / reach);
      const tw = 0.7 + 0.3 * Math.sin(i * 12.9898 + this.t * (1 + (i % 7) * 0.3));
      const a = (0.45 + heat * 0.9) * tw;
      b.push(this.px[i], this.py[i], this.pz[i], this.vx[i], 0, this.vz[i], s.color[0] + heat * 0.3, s.color[1] + heat * 0.25, s.color[2] + heat * 0.1, a, s.size * (1 + heat * 0.4));
    }
    b.end();

    // Player: bright seed + orbiting halo of captured matter.
    const pb = this.playerBatch;
    pb.begin();
    const growth = Math.sqrt(this.mass);
    const core = 1.6 + growth * 0.06;
    const flick = 1 + Math.sin(this.t * 7) * 0.06 + (this.pulsing ? 0.25 : 0);
    pb.push(P.x, 0.2, P.z, 0, 0, 0, 1.0, 0.8, 0.55, 0.7, core * 1.5 * flick);
    pb.push(P.x, 0.2, P.z, 0, 0, 0, 1.0, 0.95, 0.9, 1.4, core * 0.45);
    const count = Math.min(400, 20 + Math.floor(this.mass / 9));
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const rr = this.halo[o + 1] * core * (1.3 + (this.cinematic ? -this.collapseT * 0.3 : 0));
      const w = 2.2 / Math.pow(this.halo[o + 1], 1.5);
      const a = this.halo[o] + this.t * w;
      const x = P.x + Math.cos(a) * rr;
      const z = P.z + Math.sin(a) * rr;
      const k = this.halo[o + 2];
      pb.push(x, (k - 0.5) * rr * 0.3, z, -Math.sin(a) * w * rr, 0, Math.cos(a) * w * rr, 0.8 + k * 0.2, 0.65 + k * 0.2, 0.5 + k * 0.4, 0.6, 0.35 + k * 0.3);
    }
    pb.end();

    this.influence.position.set(P.x, 0, P.z);
    this.influence.setWorldRadius(reach);
    this.influence.opacity = this.cinematic ? 0 : 0.25 + (this.pulsing ? 0.35 : 0);
    this.influence.tick(this.t, g.camera);
    if (this.pulseRing.opacity > 0) {
      this.pulseRing.position.set(P.x, 0, P.z);
      const s = this.pulseRing.scale.x + dt * reach * 2.2;
      this.pulseRing.scale.setScalar(s);
      this.pulseRing.opacity = Math.max(0, this.pulseRing.opacity - dt * 1.4);
      if (this.pulseRing.opacity <= 0 && this.pulsing) {
        this.pulseRing.opacity = 0.8;
        this.pulseRing.scale.setScalar(capR);
      }
    }
    for (const r of this.wellRings) r.tick(this.t, g.camera);
  }

  private async finish() {
    const g = this.game;
    this.cinematic = true;
    g.hud.clearHint();
    g.audio.swell(8);
    g.audio.whoosh(0.3);
    g.pipe.final.letterboxTarget = 1;
    g.hud.titleCard('Masa crítica', 'LA GRAVEDAD GANA', 'El gas empieza a caer hacia ti', 3.5);
    g.rig.animate({ distance: g.rig.state.distance * 2.6, pitch: 0.75 }, 5);
    const start = this.t;
    while (this.alive && this.t - start < 4.5) {
      this.collapseT = (this.t - start) / 4.5;
      await this.wait(0);
    }
    g.sky.set(SKY_PRESETS.cloud, 2);
    g.saveCarry({ cloudMass: this.mass });
    await g.goto('cloud', { cloudMass: this.mass }, { fade: 0.9 });
  }
}
