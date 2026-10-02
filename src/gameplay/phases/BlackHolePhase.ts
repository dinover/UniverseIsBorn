import * as THREE from 'three';
import { Phase } from '../Phase';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { JetBeam, Ring } from '../../vfx/Effects';
import { SKY_PRESETS } from '../../vfx/Sky';
import { clamp, damp, formatSolar, lerp, smoothstep, TAU } from '../../utils/math';
import { classifyOrbit, predictPath } from '../../physics/Orbits';
import { makeBody, STAR_COLORS, type Body, type BodyKind } from '../../entities/Body';
import { h } from '../../ui/Hud';
import type { Rng } from '../../procgen/rng';
import type { LoopHandle } from '../../audio/AudioEngine';

const GMK = 720; // GM = GMK * L^3 (world units)
const CAP = 3; // capture radius (x L): innermost stable orbit
const TIDAL = 7.5; // tidal disruption radius for stars (x L)
const INF = 34; // influence radius (x L)
const SPEED = 9.5; // player speed (x L per second)

const GATES = { disk: 12, jets: 35, growth: 150, mergers: 600, imbh: 8000, smbh: 1e6 };

interface Merger {
  rival: Body;
  t: number;
  T: number;
  sep0: number;
  ang: number;
  bary: THREE.Vector3;
  aligned: number;
  needle: number;
  zone: number;
  cooldown: number;
  widget: HTMLElement;
  needleEl: SVGElement;
  zoneEl: SVGPathElement;
  pips: HTMLElement;
  chirped: boolean;
}

const RIVAL_NAMES = ['Cygnus', 'Keres', 'Umbra', 'Tartarus', 'Nyx', 'Erebus', 'Abyssus', 'Vorago', 'Hades', 'Scylla', 'Orcus', 'Styx'];

/**
 * STAGES 7–13 — From a newborn stellar black hole to an intermediate-mass monster.
 * Pillars: orbital capture (not everything falls in), accretion disk, jets, mergers, growing scale.
 */
export class BlackHolePhase extends Phase {
  id = 'blackhole' as const;
  private rng!: Rng;
  private M = 5;
  private M0 = 5;
  private L = 1;
  private Lvis = 1;
  private energy = 1;
  private disk = 0;
  private accRate = 0;
  private stageN = 7;
  private P = new THREE.Vector3();
  private vel = new THREE.Vector2();
  private bodies: Body[] = [];
  private spawnT = 0;
  private eventT = 40;
  private camK = 34;
  // stream particles (captured matter spiralling in)
  private cap = 0;
  private sn = 0;
  private sx!: Float32Array;
  private sz!: Float32Array;
  private svx!: Float32Array;
  private svz!: Float32Array;
  private sy!: Float32Array;
  private sHeat!: Float32Array;
  // rendering
  private glow!: SpriteBatch;
  private stars!: SpriteBatch;
  private gas!: SpriteBatch;
  private dust!: SpriteBatch;
  private lines!: THREE.LineSegments;
  private linePos!: Float32Array;
  private lineCol!: Float32Array;
  private pathBuf = new Float32Array(80);
  private infRing!: Ring;
  private dragRing!: Ring;
  private dangerRings = new Map<number, Ring>();
  private jetA!: JetBeam;
  private jetB!: JetBeam;
  private jetAxis = new THREE.Vector3(1, 0, 0);
  private jetPower = 0;
  private jetting = false;
  private jetLoop: LoopHandle | null = null;
  private diskNormal = new THREE.Vector3(0.12, 1, 0.5).normalize();
  private defaultNormal = new THREE.Vector3(0.12, 1, 0.5).normalize();
  private dragging = false;
  private diskUnlocked = false;
  private jetsUnlocked = false;
  private firstCapture = false;
  private merger: Merger | null = null;
  private mergesDone = 0;
  private transitioning = false;
  private scriptedRival = false;
  private lastPointerDir = new THREE.Vector3(1, 0, 0);
  private rivalCount = 0;
  private hitFlash = 0;

  touchLabels(): [string | null, string | null] {
    return ['Arrastre', this.jetsUnlocked ? 'Jets' : null];
  }

  enter() {
    const g = this.game;
    g.hud.show(true);
    this.rng = g.rng.fork(7 + (this.carry.mergesDone ?? 0));
    this.M = this.M0 = this.carry.bhMass ?? 5;
    this.stageN = this.carry.stage && this.carry.stage >= 7 && this.carry.stage <= 13 ? this.carry.stage : 7;
    this.diskUnlocked = !!this.carry.diskUnlocked || this.stageN >= 9;
    this.jetsUnlocked = !!this.carry.jetsUnlocked || this.stageN >= 10;
    this.mergesDone = this.carry.mergesDone ?? 0;
    if (this.stageN >= 13) this.camK = 55;
    this.L = this.Lvis = this.scaleOf(this.M);
    g.setStage(this.stageN, this.stageN !== 7);
    g.sky.set(this.stageN >= 13 ? SKY_PRESETS.cluster : SKY_PRESETS.blackhole, 2);
    g.audio.setEra(this.stageN >= 10 ? 'active' : 'blackhole');
    g.motes.color.setRGB(0.75, 0.8, 1);
    g.motes.alpha = 0.22;

    const q = g.quality.profile.particles;
    this.cap = Math.floor(3800 * q + 900);
    this.sx = new Float32Array(this.cap);
    this.sz = new Float32Array(this.cap);
    this.sy = new Float32Array(this.cap);
    this.svx = new Float32Array(this.cap);
    this.svz = new Float32Array(this.cap);
    this.sHeat = new Float32Array(this.cap);
    this.gas = this.track(new SpriteBatch(3200, 'soft', { stretch: 0.02 }));
    this.dust = this.track(new SpriteBatch(900, 'dark', { stretch: 0.02 }));
    this.stars = this.track(new SpriteBatch(3500, 'star', { stretch: 0.02, maxStretch: 3 }));
    this.glow = this.track(new SpriteBatch(this.cap + 2500, 'glow', { stretch: 0.1, maxStretch: 8 }));
    this.gas.mesh.renderOrder = 1;
    this.dust.mesh.renderOrder = 2;
    this.stars.mesh.renderOrder = 3;
    this.glow.mesh.renderOrder = 4;
    this.group.add(this.gas.mesh, this.dust.mesh, this.stars.mesh, this.glow.mesh);

    const maxSeg = 12 * 40;
    this.linePos = new Float32Array(maxSeg * 2 * 3);
    this.lineCol = new Float32Array(maxSeg * 2 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    lg.setAttribute('color', new THREE.BufferAttribute(this.lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, premultipliedAlpha: true }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 9;
    this.group.add(this.lines);

    this.infRing = new Ring(0x9fd6ff, false, 0.004);
    this.infRing.mat.uniforms.uDash.value = 90;
    this.dragRing = new Ring(0xffc070, false, 0.03);
    this.dragRing.opacity = 0;
    this.group.add(this.infRing, this.dragRing);
    this.jetA = new JetBeam();
    this.jetB = new JetBeam();
    this.group.add(this.jetA, this.jetB);
    this.jetA.visible = this.jetB.visible = false;

    const bh = g.pipe.bhPass;
    bh.primaryActive = true;
    bh.diskInner = 3;
    bh.diskOuter = 12;
    bh.flow = 1;
    bh.diskIntensity = 0.2;
    g.rig.setImmediate({ distance: this.L * 30, pitch: 0.7, yaw: 0, fov: 50 }, this.P);
    g.rig.animate({ distance: this.L * this.camK }, 3);
    g.rig.followLambda = 3;

    // Supernova remnant: the first meal, right around your birthplace.
    if (this.stageN <= 8) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + this.rng.range(-0.2, 0.2);
        const d = this.rng.range(14, 30) * this.L;
        const tv = this.rng.range(2, 4) * this.L * this.rng.sign();
        const b = makeBody('gas', this.rng, this.M, this.L, Math.cos(a) * d, Math.sin(a) * d, -Math.sin(a) * tv + Math.cos(a) * this.L, Math.cos(a) * tv + Math.sin(a) * this.L);
        b.color = this.rng.pick([[1, 0.4, 0.5], [0.35, 1, 0.8], [1, 0.8, 0.4]] as [number, number, number][]);
        this.bodies.push(b);
      }
    }
    for (let i = 0; i < 18; i++) this.spawnBody(true);
    this.script();
  }

  private scaleOf(M: number) {
    return Math.pow(M / 10, 1 / 3);
  }

  private async script() {
    const g = this.game;
    if (this.stageN > 7) {
      g.hud.titleCard(this.stageTitle(), `ETAPA ${String(this.stageN).padStart(2, '0')}`, 'Continúas donde lo dejaste', 3);
      return;
    }
    await this.wait(1);
    g.hud.titleCard('Nacimiento del agujero negro', 'ETAPA 07', 'Ahora eres pura gravedad', 4);
    await this.wait(4.5);
    this.tutorial('bh_move', `Ya no eres una estrella: eres un <b>agujero negro</b>. ${g.input.touchMode ? 'Arrastra para moverte' : 'Mueve el cursor para desplazarte'}. Nada que cruce tu horizonte vuelve.`, 8);
    await this.wait(9);
    this.tutorial('bh_orbits', 'Mira las trayectorias: <b style="color:#ffd070">doradas</b> caerán, <b style="color:#7fe0ff">cian</b> orbitarán, <b style="color:#ff6a5a">rojas</b> escaparán. No todo lo que se acerca cae.', 10);
    await this.wait(11);
    this.tutorial('bh_drag', `Mantén <kbd>${g.input.touchMode ? 'ARRASTRE' : 'CLIC'}</kbd> para frenar lo que orbita a tu alrededor: pierde momento angular y cae en espiral. Consume energía.`, 9);
  }

  private stageTitle() {
    return ['', '', '', '', '', '', '', 'Nacimiento del agujero negro', 'Acreción', 'Disco de acreción', 'Agujero negro activo', 'Crecimiento', 'Fusiones', 'Agujero negro intermedio'][this.stageN] ?? '';
  }

  debugSkip() {
    const next = [GATES.disk, GATES.jets, GATES.growth, GATES.mergers, GATES.imbh, GATES.smbh].find((x) => x > this.M) ?? GATES.smbh;
    this.M = next * 1.01;
    this.firstCapture = true;
  }
  debugBoost() {
    this.M *= 1.5;
  }

  // ------------------------------------------------------------------ spawning
  private kindWeights(): [BodyKind, number][] {
    const s = this.stageN;
    const w: [BodyKind, number][] = [
      ['gas', s >= 13 ? 18 : 55],
      ['star', s >= 8 ? 30 : 18],
    ];
    if (s >= 9) w.push(['dust', 10]);
    if (s >= 11) w.push(['wd', 10], ['ns', 8]);
    if (s >= 12) w.push(['bh', s >= 13 ? 6 : 5]);
    if (s >= 13) w.push(['cluster', 14], ['nebula', 12]);
    return w;
  }

  private pickKind(): BodyKind {
    const w = this.kindWeights();
    const total = w.reduce((a, b) => a + b[1], 0);
    let r = this.rng.next() * total;
    for (const [k, v] of w) {
      r -= v;
      if (r <= 0) return k;
    }
    return 'gas';
  }

  private spawnBody(initial = false, kind?: BodyKind, massFrac?: number) {
    const L = this.L;
    const k = kind ?? this.pickKind();
    if (k === 'bh' && this.rivalCount >= 2) return;
    const a = this.rng.range(0, TAU);
    const d = (initial ? this.rng.range(20, 75) : this.rng.range(62, 90)) * L * (this.stageN >= 13 ? 1.4 : 1);
    const x = this.P.x + Math.cos(a) * d;
    const z = this.P.z + Math.sin(a) * d;
    // Velocity: a mix of tangential motion and drift towards the player -> varied orbits.
    const tv = this.rng.range(0.4, 1.2) * Math.sqrt((GMK * L * L * L) / d) * this.rng.sign();
    const inward = this.rng.range(0.1, 0.9) * L * 3;
    const vx = -Math.sin(a) * tv - Math.cos(a) * inward + this.vel.x * 0.3;
    const vz = Math.cos(a) * tv - Math.sin(a) * inward + this.vel.y * 0.3;
    const b = makeBody(k, this.rng, this.M, L, x, z, vx, vz);
    if (massFrac) b.mass = this.M * massFrac;
    if (k === 'bh') {
      if (!massFrac) b.mass = this.M * (this.rng.chance(0.45) ? this.rng.range(1.35, 1.9) : this.rng.range(0.3, 0.8));
      b.radius = this.scaleOf(b.mass);
      b.name = this.rng.pick(RIVAL_NAMES) + '-' + this.rng.int(10, 99);
      b.vx *= 0.4;
      b.vz *= 0.4;
      this.rivalCount++;
    }
    this.bodies.push(b);
    return b;
  }

  private addStream(x: number, z: number, vx: number, vz: number, heat: number, count: number, spread: number) {
    for (let i = 0; i < count && this.sn < this.cap; i++) {
      const j = this.sn++;
      this.sx[j] = x + this.rng.gauss(0, spread);
      this.sz[j] = z + this.rng.gauss(0, spread);
      this.sy[j] = this.rng.gauss(0, spread * 0.15);
      this.svx[j] = vx + this.rng.gauss(0, spread * 0.4);
      this.svz[j] = vz + this.rng.gauss(0, spread * 0.4);
      this.sHeat[j] = heat;
    }
  }

  private removeStream(i: number) {
    const l = --this.sn;
    this.sx[i] = this.sx[l];
    this.sz[i] = this.sz[l];
    this.sy[i] = this.sy[l];
    this.svx[i] = this.svx[l];
    this.svz[i] = this.svz[l];
    this.sHeat[i] = this.sHeat[l];
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const P = this.P;
    this.L = this.scaleOf(this.M);
    this.Lvis = damp(this.Lvis, this.L, 1.5, dt);
    const L = this.L;
    const GM = GMK * L * L * L;

    // --- Movement
    if (!this.cinematic && !this.merger) {
      const steer = input.steer(g.camera, P, 2 * L, 18 * L);
      const drag = this.bodies.some((b) => b.kind === 'dust' && Math.hypot(b.x - P.x, b.z - P.z) < b.radius + 3 * L) ? 0.55 : 1;
      this.vel.x = damp(this.vel.x, steer.x * SPEED * L * drag, 2.6, dt);
      this.vel.y = damp(this.vel.y, steer.y * SPEED * L * drag, 2.6, dt);
      if (steer.lengthSq() > 0.01) this.lastPointerDir.set(steer.x, 0, steer.y).normalize();
    } else if (!this.merger) this.vel.multiplyScalar(1 - dt * 2);
    if (!this.merger) {
      P.x += this.vel.x * dt;
      P.z += this.vel.y * dt;
    }

    // --- Abilities
    const canAct = !this.cinematic && !this.merger;
    this.dragging = canAct && input.primaryHeld && this.energy > 0.02;
    if (this.dragging) this.energy -= dt * 0.16;
    const wantJet = canAct && this.jetsUnlocked && input.secondaryHeld && this.energy > (this.jetting ? 0.01 : 0.08);
    if (wantJet !== this.jetting) {
      this.jetting = wantJet;
      g.bus.emit('jets', { active: wantJet });
      if (wantJet) {
        if (!this.jetLoop) this.jetLoop = g.audio.loopJet();
        g.audio.whoosh(0.2);
      }
    }
    if (this.jetting) {
      this.energy -= dt * 0.2;
      g.prog.add('jetSeconds', dt);
      // Aim: towards the cursor on the plane (or the last move direction on touch).
      const aim = new THREE.Vector3(input.pointerWorld.x - P.x, 0, input.pointerWorld.z - P.z);
      if (input.touchMode || aim.lengthSq() < 1e-4) aim.copy(this.lastPointerDir);
      aim.normalize();
      this.jetAxis.lerp(aim, 1 - Math.exp(-6 * dt)).normalize();
    }
    this.jetPower = damp(this.jetPower, this.jetting ? 1 : 0, this.jetting ? 8 : 4, dt);
    this.jetLoop?.set(this.jetPower, clamp(this.accRate * 20));
    this.energy = clamp(this.energy + (0.02 + Math.min(0.12, this.accRate * 1.2)) * dt);

    // --- Bodies
    this.updateBodies(dt, GM);
    this.updateStream(dt, GM);

    // --- Accretion disk: the reservoir drains into the hole
    const flow = this.disk * 0.32 * dt;
    this.disk -= flow;
    this.grow(flow);
    this.accRate = damp(this.accRate, flow / Math.max(dt, 1e-4) / this.M, 2, dt);

    // --- Spawning & events
    this.spawnT -= dt;
    const want = this.stageN >= 13 ? 26 : 24;
    if (this.spawnT <= 0 && this.bodies.length < want && !this.transitioning) {
      this.spawnT = 0.35;
      this.spawnBody();
    }
    if (this.stageN >= 12 && !this.scriptedRival && !this.merger) {
      this.scriptedRival = true;
      const b = this.spawnBody(false, 'bh', 0.45);
      if (b) {
        const a = this.rng.range(0, TAU);
        b.x = P.x + Math.cos(a) * 40 * L;
        b.z = P.z + Math.sin(a) * 40 * L;
        b.vx = b.vz = 0;
        g.hud.toast('●', 'Otro agujero negro', `${b.name}: ${formatSolar(b.mass)} M☉ · más pequeño que tú`);
      }
    }
    this.eventT -= dt;
    if (this.eventT <= 0 && !this.cinematic && !this.merger) {
      this.eventT = this.rng.range(38, 58);
      this.randomEvent();
    }

    if (this.merger) this.updateMerger(dt);
    this.checkStage();

    this.render(dt);
    this.hud(dt);

    if (!this.cinematic && !this.merger) {
      g.rig.target.set(P.x, 0, P.z);
      g.rig.state.distance = damp(g.rig.state.distance, this.Lvis * this.camK, 1.2, dt);
    }
    // Save occasionally
    if (Math.floor(this.t / 20) !== Math.floor((this.t - dt) / 20)) this.persist();
  }

  private grow(dm: number) {
    if (dm <= 0) return;
    this.M += dm;
    this.game.bus.emit('massChanged', { mass: this.M });
  }

  private persist() {
    this.game.saveCarry({ bhMass: this.M, stage: this.stageN, diskUnlocked: this.diskUnlocked, jetsUnlocked: this.jetsUnlocked, mergesDone: this.mergesDone });
  }

  private updateBodies(dt: number, GM: number) {
    const g = this.game;
    const P = this.P;
    const L = this.L;
    const soft = 1.5 * L;
    const jetLen = 60 * L;
    const jetW = 3.2 * L;
    const released: Body[] = [];
    for (const b of this.bodies) {
      if (!b.alive) continue;
      b.age += dt;
      if (this.merger && b === this.merger.rival) continue;
      let dx = P.x - b.x;
      let dz = P.z - b.z;
      let r2 = dx * dx + dz * dz;
      let r = Math.sqrt(r2);
      const steps = r < 12 * L ? 4 : 1;
      const sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        dx = P.x - b.x;
        dz = P.z - b.z;
        r2 = dx * dx + dz * dz;
        r = Math.sqrt(r2) + 1e-6;
        let a = GM / (r2 + soft * soft);
        if (b.kind === 'bh') a *= 0.8;
        b.vx += (dx / r) * a * sdt;
        b.vz += (dz / r) * a * sdt;
        b.x += b.vx * sdt;
        b.z += b.vz * sdt;
      }
      // Drag: steal angular momentum from everything inside the influence radius.
      if (this.dragging && r < INF * L && b.kind !== 'bh') {
        const rx = -dx / r;
        const rz = -dz / r;
        const rvx = b.vx - this.vel.x;
        const rvz = b.vz - this.vel.y;
        const vr = rvx * rx + rvz * rz;
        const vtx = rvx - vr * rx;
        const vtz = rvz - vr * rz;
        const k = Math.exp(-1.4 * dt);
        b.vx = this.vel.x + vr * rx + vtx * k - rx * 2.5 * L * dt;
        b.vz = this.vel.y + vr * rz + vtz * k - rz * 2.5 * L * dt;
      }
      // Jets
      if (this.jetPower > 0.2) {
        for (const sgn of [1, -1]) {
          const ax = this.jetAxis.x * sgn;
          const az = this.jetAxis.z * sgn;
          const px = b.x - P.x;
          const pz = b.z - P.z;
          const along = px * ax + pz * az;
          if (along <= 0 || along > jetLen) continue;
          const perp = Math.abs(px * -az + pz * ax);
          if (perp > jetW + b.radius) continue;
          const force = this.jetPower * 55 * L * (b.kind === 'bh' ? 0.5 : 1);
          b.vx += ax * force * dt;
          b.vz += az * force * dt;
          b.jetExposure += dt;
          if (b.kind === 'bh') {
            b.mass *= 1 - 0.05 * dt;
            b.radius = this.scaleOf(b.mass);
            if (b.mass > this.M) g.prog.achieve('pushback');
          } else if ((b.kind === 'gas' || b.kind === 'nebula') && b.jetExposure > 0.7) {
            this.triggerStarFormation(b, released);
          }
        }
      }
      // Rival black holes pull on the player and may devour it.
      if (b.kind === 'bh') {
        this.rivalBehaviour(b, dt, r, dx, dz);
        continue;
      }
      // Captures
      if (b.kind === 'star' && r < TIDAL * L) this.tidalDisruption(b);
      else if ((b.kind === 'gas' || b.kind === 'dust') && r < CAP * L + b.radius * 0.6) this.dissolve(b, 1);
      else if ((b.kind === 'wd' || b.kind === 'ns') && r < CAP * L * 1.2) this.swallow(b);
      else if (b.kind === 'cluster' && r < 16 * L) this.stripCluster(b, released, dt);
      else if (b.kind === 'nebula' && r < b.radius + 5 * L) this.feedNebula(b, dt);
      // Pulsar beams sting
      if (b.kind === 'ns' && r < 10 * L) {
        const ang = this.t * 3 + b.seed;
        const bx = Math.cos(ang);
        const bz = Math.sin(ang);
        const along = -dx * bx + -dz * bz;
        const perp = Math.abs(-dx * -bz + -dz * bx);
        if (perp < 1.2 * L && Math.abs(along) < 10 * L) {
          this.energy = Math.max(0, this.energy - dt * 0.3);
          this.hitFlash = 0.5;
        }
      }
      // Despawn far away
      if (r > 130 * L * (this.stageN >= 13 ? 1.4 : 1)) b.alive = false;
    }
    this.bodies = this.bodies.filter((b) => {
      if (!b.alive && b.kind === 'bh') {
        this.rivalCount--;
        const ring = this.dangerRings.get(b.id);
        if (ring) {
          this.group.remove(ring);
          ring.geometry.dispose();
          ring.mat.dispose();
          this.dangerRings.delete(b.id);
        }
      }
      return b.alive;
    });
    for (const b of released) if (this.bodies.length < 170) this.bodies.push(b);
  }

  private rivalBehaviour(b: Body, dt: number, r: number, dx: number, dz: number) {
    const g = this.game;
    const P = this.P;
    const L = this.L;
    const Lr = this.scaleOf(b.mass);
    const bigger = b.mass > this.M * 1.3;
    // Wander / hunt
    const n = Math.sin(this.t * 0.3 + b.seed) * 0.6;
    b.vx += Math.cos(b.seed + this.t * 0.2) * n * L * dt;
    b.vz += Math.sin(b.seed + this.t * 0.2) * n * L * dt;
    if (bigger && r < 70 * L) {
      b.vx += (dx / r) * 1.2 * L * dt;
      b.vz += (dz / r) * 1.2 * L * dt;
    }
    b.vx *= 1 - dt * 0.15;
    b.vz *= 1 - dt * 0.15;
    // Its gravity on you
    if (!this.cinematic && !this.merger && r < 30 * Lr) {
      const a = (GMK * Lr * Lr * Lr) / (r * r + (1.5 * Lr) ** 2);
      this.vel.x -= (dx / r) * a * dt * 0.9;
      this.vel.y -= (dz / r) * a * dt * 0.9;
    }
    if (this.merger || this.cinematic) return;
    if (!bigger && r < 9 * L + 3 * Lr) this.startMerger(b);
    else if (bigger && r < (CAP * Lr + CAP * L) * 0.8) this.devoured(b);
  }

  private triggerStarFormation(b: Body, out: Body[]) {
    const g = this.game;
    b.alive = false;
    const n = b.kind === 'nebula' ? 8 : 4;
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, TAU);
      const d = this.rng.range(0, b.radius);
      const s = makeBody('star', this.rng, this.M, this.L, b.x + Math.cos(a) * d, b.z + Math.sin(a) * d, b.vx + this.rng.gauss(0, this.L), b.vz + this.rng.gauss(0, this.L));
      s.color = STAR_COLORS[this.rng.int(0, 1)];
      s.mass = (b.mass / n) * 1.1;
      s.young = true;
      out.push(s);
    }
    g.hud.floater('¡FORMACIÓN ESTELAR!', new THREE.Vector3(b.x, 4 * this.L, b.z), '#9fd6ff', 16, 2);
    g.pipe.final.shockwave(new THREE.Vector3(b.x, 0, b.z), 0.5, 1, 0.3);
    g.audio.ignite();
    g.prog.achieve('seeder');
    g.prog.discover('feedback');
  }

  private dissolve(b: Body, fraction: number) {
    const g = this.game;
    b.alive = false;
    this.disk += b.mass * fraction;
    const count = Math.round(clamp(b.radius / this.L, 2, 5) * 22);
    this.addStream(b.x, b.z, b.vx, b.vz, b.kind === 'dust' ? 0.2 : 0.6, count, b.radius * 0.5);
    this.onCapture(b, b.mass * fraction);
    g.audio.capture(0.3);
  }

  private swallow(b: Body) {
    const g = this.game;
    b.alive = false;
    this.grow(b.mass);
    this.addStream(b.x, b.z, b.vx, b.vz, 1, 20, this.L);
    g.pipe.final.shockwave(this.P.clone(), 0.3, 0.8, 0.2);
    g.audio.capture(0.6);
    this.onCapture(b, b.mass);
  }

  private tidalDisruption(b: Body) {
    const g = this.game;
    b.alive = false;
    const bound = b.mass * 0.5;
    this.disk += bound;
    // Spaghettification: a long stream along the star's trajectory. Half of it flies away.
    const sp = Math.hypot(b.vx, b.vz) + 1e-3;
    const tx = b.vx / sp;
    const tz = b.vz / sp;
    for (let i = 0; i < 90 && this.sn < this.cap; i++) {
      const k = (i / 90 - 0.5) * 2;
      const j = this.sn++;
      this.sx[j] = b.x + tx * k * 5 * this.L;
      this.sz[j] = b.z + tz * k * 5 * this.L;
      this.sy[j] = this.rng.gauss(0, 0.2 * this.L);
      const boost = k > 0 ? 1.35 : 0.8; // leading half unbound, trailing half bound
      this.svx[j] = b.vx * boost;
      this.svz[j] = b.vz * boost;
      this.sHeat[j] = 0.9;
    }
    g.prog.add('starsDevoured', 1);
    g.prog.achieve('spaghetti');
    if (g.prog.meta.stats.starsDevoured >= 25) g.prog.achieve('glutton');
    g.prog.discover('tde');
    g.bus.emit('starDevoured', { mass: b.mass });
    g.pipe.final.doFlash(0.18, 0xffe0c0);
    g.pipe.bloomBoost = 1;
    g.audio.tde();
    g.hud.floater('DISRUPCIÓN DE MAREA', new THREE.Vector3(b.x, 3 * this.L, b.z), '#ffcf9a', 15, 1.6);
    this.onCapture(b, bound);
  }

  private stripCluster(b: Body, out: Body[], dt: number) {
    if (!b.members || !b.memberCount) {
      b.alive = false;
      return;
    }
    const perMember = b.mass / b.memberCount;
    const rate = Math.ceil(dt * 14);
    for (let k = 0; k < rate && b.memberCount > 0; k++) {
      const i = --b.memberCount;
      const rr = b.members[i * 4];
      const a = b.members[i * 4 + 1] + this.t * 0.2;
      const s = makeBody('star', this.rng, this.M, this.L, b.x + Math.cos(a) * rr, b.z + Math.sin(a) * rr, b.vx + -Math.sin(a) * 2 * this.L, b.vz + Math.cos(a) * 2 * this.L);
      s.mass = perMember;
      s.color = STAR_COLORS[b.members[i * 4 + 3] | 0];
      out.push(s);
      b.mass -= perMember;
    }
    if (b.memberCount <= 0) {
      b.alive = false;
      this.game.hud.floater('CÚMULO DESARMADO', new THREE.Vector3(b.x, 4 * this.L, b.z), '#ffe0a0', 15, 1.6);
    }
  }

  private feedNebula(b: Body, dt: number) {
    const dm = Math.min(b.mass, b.mass * 0.5 * dt + this.M * 0.002 * dt);
    b.mass -= dm;
    this.disk += dm;
    b.radius = Math.max(this.L, b.radius * (1 - dt * 0.12));
    const a = Math.atan2(this.P.z - b.z, this.P.x - b.x);
    this.addStream(b.x + Math.cos(a) * b.radius * 0.6, b.z + Math.sin(a) * b.radius * 0.6, b.vx, b.vz, 0.5, 2, b.radius * 0.2);
    if (b.mass < this.M * 0.01) {
      b.alive = false;
      this.onCapture(b, 0);
    }
  }

  private onCapture(b: Body, gained: number) {
    const g = this.game;
    g.prog.add('captures', 1);
    if (g.prog.meta.stats.captures >= 40) g.prog.achieve('orbital');
    g.bus.emit('absorb', { kind: b.kind, amount: gained });
    if (gained > 0) g.hud.floater(`+${formatSolar(gained)} M☉`, new THREE.Vector3(b.x, 2 * this.L, b.z), '#ffd9a0', 13, 1.2);
    if (!this.firstCapture) {
      this.firstCapture = true;
      this.wait(1.5).then(() => {
        if (this.alive && this.stageN === 7) this.setStage(8);
      });
    }
  }

  private updateStream(dt: number, GM: number) {
    const P = this.P;
    const L = this.L;
    const soft = 1.2 * L;
    const inner = 2.6 * L;
    for (let i = 0; i < this.sn; i++) {
      let dx = P.x - this.sx[i];
      let dz = P.z - this.sz[i];
      const r2 = dx * dx + dz * dz;
      const r = Math.sqrt(r2) + 1e-6;
      const a = GM / (r2 + soft * soft);
      this.svx[i] += (dx / r) * a * dt;
      this.svz[i] += (dz / r) * a * dt;
      // Viscous circularisation: relative velocity relaxes towards a slowly decaying circular orbit.
      const rvx = this.svx[i] - this.vel.x;
      const rvz = this.svz[i] - this.vel.y;
      const rx = -dx / r;
      const rz = -dz / r;
      const vr = rvx * rx + rvz * rz;
      let vtx = rvx - vr * rx;
      let vtz = rvz - vr * rz;
      const vt = Math.hypot(vtx, vtz) + 1e-6;
      const vc = Math.sqrt(GM / r);
      const target = vc * 0.93;
      const k = 1 - Math.exp(-0.8 * dt);
      const nvt = vt + (target - vt) * k;
      vtx *= nvt / vt;
      vtz *= nvt / vt;
      const nvr = vr * (1 - k) - vc * 0.04;
      this.svx[i] = this.vel.x + vtx + rx * nvr;
      this.svz[i] = this.vel.y + vtz + rz * nvr;
      this.sx[i] += this.svx[i] * dt;
      this.sz[i] += this.svz[i] * dt;
      this.sy[i] *= 1 - dt * 0.8;
      this.sHeat[i] = Math.max(this.sHeat[i], clamp(1 - r / (20 * L)));
      if (r < inner || r > 160 * L) {
        this.removeStream(i);
        i--;
      }
    }
  }

  // ------------------------------------------------------------------ mergers
  private startMerger(b: Body) {
    const g = this.game;
    this.jetting = false;
    const w = h('div', 'panel', `<div class="label" style="margin-bottom:6px">Alineación de espines</div>
      <svg width="130" height="130" viewBox="-65 -65 130 130">
        <circle r="50" fill="none" stroke="rgba(200,220,255,0.25)" stroke-width="2"/>
        <path class="zone" fill="none" stroke="#7dffb2" stroke-width="8" stroke-linecap="round"/>
        <line class="needle" x1="0" y1="0" x2="0" y2="-54" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <circle r="6" fill="#fff"/>
      </svg><div class="pips label" style="text-align:center;margin-top:4px">○ ○ ○</div>`);
    w.style.padding = '12px 14px';
    g.hud.widget.appendChild(w);
    this.merger = {
      rival: b,
      t: 0,
      T: 7.5,
      sep0: Math.hypot(b.x - this.P.x, b.z - this.P.z),
      ang: Math.atan2(b.z - this.P.z, b.x - this.P.x),
      bary: new THREE.Vector3((this.P.x * this.M + b.x * b.mass) / (this.M + b.mass), 0, (this.P.z * this.M + b.z * b.mass) / (this.M + b.mass)),
      aligned: 0,
      needle: 0,
      zone: this.rng.range(0, TAU),
      cooldown: 0,
      widget: w,
      needleEl: w.querySelector('.needle') as SVGElement,
      zoneEl: w.querySelector('.zone') as SVGPathElement,
      pips: w.querySelector('.pips') as HTMLElement,
      chirped: false,
    };
    g.pipe.final.letterboxTarget = 0.6;
    g.hud.titleCard('Binaria de agujeros negros', 'ÓRBITA FINAL', 'Las ondas gravitacionales se llevan la energía orbital', 3.2);
    g.prog.discover('gw');
    this.tutorial('merge_spin', `Pulsa <kbd>${g.input.touchMode ? 'BOTÓN' : 'CLIC'}</kbd> cuando la aguja pase por la <b style="color:#7dffb2">zona verde</b> para alinear los espines. Tres aciertos = fusión perfecta, sin retroceso.`, 7);
    g.audio.swell(9);
  }

  private updateMerger(dt: number) {
    const g = this.game;
    const m = this.merger!;
    const b = m.rival;
    m.t += dt;
    const k = clamp(m.t / m.T);
    if (!m.chirped && m.t > 0.5) {
      m.chirped = true;
      g.audio.chirp(m.T - 0.5);
    }
    const sep = Math.max(this.L * 2.5, m.sep0 * Math.pow(1 - k * 0.985, 0.25) * (1 - k * 0.6));
    const GMt = GMK * (this.L ** 3 + this.scaleOf(b.mass) ** 3);
    const omega = Math.min(22, Math.sqrt(GMt / (sep * sep * sep)));
    m.ang += omega * dt;
    const tot = this.M + b.mass;
    const cx = Math.cos(m.ang);
    const cz = Math.sin(m.ang);
    this.P.set(m.bary.x - cx * sep * (b.mass / tot), 0, m.bary.z - cz * sep * (b.mass / tot));
    b.x = m.bary.x + cx * sep * (this.M / tot);
    b.z = m.bary.z + cz * sep * (this.M / tot);
    const v = omega * sep;
    this.vel.set(cz * v * (b.mass / tot), -cx * v * (b.mass / tot));
    b.vx = -cz * v * (this.M / tot);
    b.vz = cx * v * (this.M / tot);
    // Gravitational waves ripple space itself.
    const gw = g.pipe.final.gw;
    gw.pos.copy(m.bary);
    gw.amp = 0.3 + Math.pow(k, 2) * 2.5;
    gw.phase += omega * 2 * dt;
    g.shake(k * k * 0.02);
    g.rig.target.copy(m.bary);
    g.rig.state.distance = damp(g.rig.state.distance, Math.max(this.L * 22, sep * 2.8), 2, dt);

    // Spin alignment mini-game
    m.cooldown = Math.max(0, m.cooldown - dt);
    m.needle = (m.needle + dt * (2.2 + k * 4)) % TAU;
    const diff = Math.abs(((m.needle - m.zone + Math.PI * 3) % TAU) - Math.PI);
    if (g.input.primaryPressed && m.cooldown <= 0 && m.aligned < 3) {
      m.cooldown = 0.35;
      if (diff < 0.4) {
        m.aligned++;
        m.zone = (m.zone + this.rng.range(1.6, 4.2)) % TAU;
        g.audio.hit('perfect', m.aligned * 2);
        g.hud.floater('ESPÍN ALINEADO', m.bary.clone().add(new THREE.Vector3(0, 6 * this.L, 0)), '#7dffb2', 15, 1);
      } else {
        g.audio.hit('miss');
      }
    }
    m.needleEl.setAttribute('transform', `rotate(${(m.needle * 180) / Math.PI})`);
    const a0 = m.zone - 0.4 - Math.PI / 2;
    const a1 = m.zone + 0.4 - Math.PI / 2;
    m.zoneEl.setAttribute('d', `M ${Math.cos(a0) * 50} ${Math.sin(a0) * 50} A 50 50 0 0 1 ${Math.cos(a1) * 50} ${Math.sin(a1) * 50}`);
    m.zoneEl.style.opacity = m.aligned >= 3 ? '0.2' : '1';
    m.pips.textContent = [0, 1, 2].map((i) => (i < m.aligned ? '●' : '○')).join(' ');

    if (m.t >= m.T) this.completeMerger();
  }

  private completeMerger() {
    const g = this.game;
    const m = this.merger!;
    const b = m.rival;
    this.merger = null;
    m.widget.remove();
    b.alive = false;
    const perfect = m.aligned >= 3;
    const radiated = perfect ? 0.04 : 0.05 + (3 - m.aligned) * 0.005;
    const before = this.M;
    this.M = (this.M + b.mass) * (1 - radiated);
    g.bus.emit('massChanged', { mass: this.M });
    g.bus.emit('bhMerged', { mass: this.M });
    this.mergesDone++;
    g.prog.add('bhMerged', 1);
    g.prog.achieve('first_merge');
    if (perfect) g.prog.achieve('aligned');
    g.pipe.final.gw.amp = 0;
    g.pipe.final.letterboxTarget = 0;
    g.pipe.final.doFlash(0.9, 0xe0e8ff);
    g.pipe.final.shockwave(this.P.clone(), 1.4, 2.2, 1.6);
    g.pipe.bloomBoost = 2.5;
    g.shake(0.8);
    g.audio.ringdown();
    if (!perfect) {
      // Gravitational-wave recoil kick
      const a = this.rng.range(0, TAU);
      const kick = (3 - m.aligned) * 9 * this.L;
      this.vel.set(Math.cos(a) * kick, Math.sin(a) * kick);
      g.hud.floater('RETROCESO GRAVITACIONAL', this.P.clone().add(new THREE.Vector3(0, 6 * this.L, 0)), '#ffb070', 16, 1.8);
    }
    g.hud.titleCard(perfect ? 'Fusión perfecta' : 'Fusión', `${formatSolar(before)} + ${formatSolar(b.mass)} → ${formatSolar(this.M)} M☉`, `${Math.round(radiated * 100)}% de la masa se convirtió en ondas gravitacionales`, 4);
    if (this.mergesDone === 1) g.hud.feel('Acabo de absorber otro agujero negro.', 4);
    // The camera steps back: your scale just changed.
    this.L = this.scaleOf(this.M);
    g.rig.animate({ distance: this.L * this.camK * 1.1 }, 2.5);
    this.persist();
  }

  private devoured(b: Body) {
    const g = this.game;
    const lost = this.M * 0.35;
    this.M -= lost;
    b.mass += lost;
    b.radius = this.scaleOf(b.mass);
    this.energy = 0.6;
    const a = Math.atan2(this.P.z - b.z, this.P.x - b.x);
    this.P.x = b.x + Math.cos(a) * 45 * this.L;
    this.P.z = b.z + Math.sin(a) * 45 * this.L;
    b.vx -= Math.cos(a) * 6 * this.L;
    b.vz -= Math.sin(a) * 6 * this.L;
    this.vel.set(Math.cos(a) * 10 * this.L, Math.sin(a) * 10 * this.L);
    g.pipe.final.doFlash(0.7, 0xff5040);
    g.shake(0.9);
    g.audio.boom();
    g.bus.emit('failure', { reason: 'devoured' });
    g.hud.titleCard('Casi te devora', `${b.name} · ${formatSolar(b.mass)} M☉`, `Perdiste ${formatSolar(lost)} M☉. Aléjate de los agujeros negros mayores o empújalos con tus jets.`, 4.5);
  }

  // ------------------------------------------------------------------ events & stages
  private randomEvent() {
    const g = this.game;
    const L = this.L;
    const options = ['giant', 'perturb', 'hyper', 'supernova'];
    if (this.stageN >= 12) options.push('rogue');
    const ev = this.rng.pick(options);
    if (ev === 'giant') {
      const b = this.spawnBody(false, this.stageN >= 13 ? 'nebula' : 'gas', 0.3);
      if (b) {
        b.radius *= 2;
        g.hud.toast('☁', 'Nube molecular gigante', 'Una enorme nube de gas se acerca');
      }
    } else if (ev === 'perturb') {
      for (const b of this.bodies) {
        const dx = this.P.x - b.x;
        const dz = this.P.z - b.z;
        const r = Math.hypot(dx, dz);
        if (r < 90 * L && b.kind !== 'bh') {
          b.vx += (dx / r) * 4 * L;
          b.vz += (dz / r) * 4 * L;
        }
      }
      g.pipe.final.shockwave(this.P.clone(), 0.6, 2, 1.5);
      g.hud.toast('〰', 'Perturbación gravitacional', 'La materia cercana cae hacia ti');
    } else if (ev === 'hyper') {
      const b = this.spawnBody(false, 'star', 0.35);
      if (b) {
        const a = Math.atan2(this.P.z - b.z, this.P.x - b.x) + this.rng.range(-0.25, 0.25);
        b.vx = Math.cos(a) * 20 * L;
        b.vz = Math.sin(a) * 20 * L;
        b.color = [0.7, 0.8, 1];
        g.hud.toast('✧', 'Estrella hiperveloz', 'Una estrella masiva cruza a toda velocidad. ¿Podrás atraparla?');
      }
    } else if (ev === 'supernova') {
      const cands = this.bodies.filter((b) => b.kind === 'star' && Math.hypot(b.x - this.P.x, b.z - this.P.z) > 20 * L);
      const s = cands[0];
      if (!s) return;
      s.alive = false;
      const pos = new THREE.Vector3(s.x, 0, s.z);
      g.pipe.final.doFlash(0.3, 0xffffff);
      g.pipe.final.shockwave(pos, 1, 1.8, 0.9);
      g.audio.boom();
      for (const b of this.bodies) {
        const dx = b.x - s.x;
        const dz = b.z - s.z;
        const r = Math.hypot(dx, dz) + 1e-3;
        if (r < 30 * L) {
          b.vx += (dx / r) * 8 * L;
          b.vz += (dz / r) * 8 * L;
        }
      }
      for (let i = 0; i < 3; i++) {
        const gb = makeBody('gas', this.rng, this.M, L, s.x + this.rng.gauss(0, 3 * L), s.z + this.rng.gauss(0, 3 * L), s.vx + this.rng.gauss(0, 3 * L), s.vz + this.rng.gauss(0, 3 * L));
        gb.color = [1, 0.5, 0.55];
        this.bodies.push(gb);
      }
      if (this.stageN >= 11) this.bodies.push(makeBody('ns', this.rng, this.M, L, s.x, s.z, s.vx, s.vz));
      this.addStream(s.x, s.z, s.vx, s.vz, 1, 60, 3 * L);
      g.hud.toast('✺', 'Supernova cercana', 'Una estrella vecina explotó y dejó gas y restos');
    } else if (ev === 'rogue') {
      const b = this.spawnBody(false, 'bh');
      if (b) g.hud.toast('●', 'Agujero negro errante', `${b.name}: ${formatSolar(b.mass)} M☉ ${b.mass > this.M * 1.3 ? '· ¡PELIGRO!' : ''}`);
    }
  }

  private setStage(n: number) {
    this.stageN = n;
    this.game.setStage(n);
    this.game.touch.setLabels(...this.touchLabels());
    this.persist();
  }

  private checkStage() {
    if (this.cinematic || this.merger || this.transitioning) return;
    const M = this.M;
    const s = this.stageN;
    if (s === 7 && M > this.M0 * 1.25) this.setStage(8);
    else if (s === 8 && M >= Math.max(GATES.disk, this.M0 * 1.8)) this.diskCinematic();
    else if (s === 9 && M >= GATES.jets) this.jetsCinematic();
    else if (s === 10 && M >= GATES.growth) {
      this.setStage(11);
      this.tutorial('bh_sources', 'Nuevas presas: <b>enanas blancas</b> y <b>estrellas de neutrones</b> caen enteras, pero son rápidas. Cuidado con el haz de los púlsares: drena tu energía.', 9);
    } else if (s === 11 && M >= GATES.mergers) {
      this.setStage(12);
      this.tutorial('bh_rivals', 'Aparecen otros agujeros negros. Los <b style="color:#7dffb2">verdes</b> son más pequeños: acércate para fusionarte. Los <b style="color:#ff4d5e">rojos</b> son mayores: huye o empújalos con tus jets.', 10);
    } else if (s === 12 && M >= GATES.imbh) this.imbhCinematic();
    else if (s === 13 && M >= GATES.smbh) this.smbhTransition();
  }

  private async diskCinematic() {
    const g = this.game;
    this.cinematic = true;
    this.setStage(9);
    this.disk += this.M * 0.4; // a surge of infalling gas
    g.pipe.final.letterboxTarget = 1;
    g.audio.swell(8);
    const back = { distance: g.rig.state.distance, pitch: g.rig.state.pitch };
    g.rig.target.copy(this.P);
    g.rig.animate({ distance: this.L * 16, pitch: 0.12 }, 2.5);
    await this.wait(1.6);
    this.diskUnlocked = true;
    g.audio.ignite();
    g.pipe.final.doFlash(0.45, 0xffd0a0);
    g.pipe.bloomBoost = 2;
    g.hud.titleCard('Disco de acreción', 'ETAPA 09', 'Gas a millones de grados, girando casi a la velocidad de la luz', 4.5);
    g.prog.discover('lensing');
    await this.wait(5);
    g.rig.animate(back, 2.5);
    g.pipe.final.letterboxTarget = 0;
    await this.wait(1);
    this.cinematic = false;
    this.persist();
  }

  private async jetsCinematic() {
    const g = this.game;
    this.cinematic = true;
    this.setStage(10);
    g.audio.setEra('active');
    g.pipe.final.letterboxTarget = 1;
    this.energy = 1;
    g.rig.target.copy(this.P);
    g.rig.animate({ distance: this.L * 42, pitch: 0.5 }, 2.2);
    g.hud.titleCard('Campo magnético retorcido', 'ALGO SE ESTÁ FORMANDO', '', 2.5);
    await this.wait(2.5);
    this.jetsUnlocked = true;
    this.jetAxis.set(1, 0, 0.3).normalize();
    this.jetting = true;
    this.jetLoop = g.audio.loopJet();
    g.pipe.final.doFlash(0.8, 0xcfe0ff);
    g.pipe.final.shockwave(this.P.clone(), 1.3, 2, 1.3);
    g.pipe.bloomBoost = 3;
    g.shake(0.7);
    g.audio.boom();
    g.hud.titleCard('Jets relativistas', 'ETAPA 10', 'Plasma disparado al 99% de la velocidad de la luz', 4);
    await this.wait(3.5);
    this.jetting = false;
    g.pipe.final.letterboxTarget = 0;
    g.rig.animate({ distance: this.L * this.camK }, 2);
    await this.wait(1);
    this.cinematic = false;
    g.touch.setLabels(...this.touchLabels());
    this.tutorial('bh_jets', `Mantén <kbd>${g.input.touchMode ? 'JETS' : 'CLIC DER'}</kbd> (o <kbd>SHIFT</kbd>) para disparar jets hacia ${g.input.touchMode ? 'donde te mueves' : 'el cursor'}. Empujan cuerpos, repelen agujeros negros mayores y, si golpean una nube de gas, <b>forman estrellas</b> nuevas.`, 11);
    this.persist();
  }

  private async imbhCinematic() {
    const g = this.game;
    this.cinematic = true;
    this.setStage(13);
    g.pipe.final.letterboxTarget = 1;
    g.audio.swell(10);
    g.sky.set(SKY_PRESETS.cluster, 5);
    this.camK = 55;
    // Populate the wider neighbourhood.
    for (let i = 0; i < 4; i++) this.spawnBody(false, i % 2 ? 'cluster' : 'nebula');
    g.rig.animate({ distance: this.L * 120, pitch: 0.85 }, 5);
    g.hud.titleCard('Agujero negro intermedio', 'ETAPA 13', 'Tu entorno ahora son cúmulos y nebulosas enteras', 5);
    await this.wait(6);
    g.rig.animate({ distance: this.L * this.camK }, 3);
    g.pipe.final.letterboxTarget = 0;
    await this.wait(1.5);
    this.cinematic = false;
    this.tutorial('bh_clusters', 'Los <b>cúmulos</b> se desarman con tu marea: acércate y sus estrellas caerán una a una. Las <b>nebulosas</b> te alimentan de forma continua.', 9);
    this.persist();
  }

  private async smbhTransition() {
    const g = this.game;
    this.cinematic = true;
    this.transitioning = true;
    g.pipe.final.letterboxTarget = 1;
    g.audio.swell(12);
    g.hud.titleCard('Un millón de masas solares', 'SUPERMASIVO', '', 3.5);
    g.rig.animate({ distance: this.L * 260, pitch: 1.1 }, 4.5);
    await this.wait(4);
    this.jetLoop?.stop(0.5);
    this.jetLoop = null;
    g.saveCarry({ bhMass: this.M, stage: 14, mergesDone: this.mergesDone });
    await g.goto('galaxy', { bhMass: this.M, stage: 14, mergesDone: this.mergesDone }, { fade: 1.4 });
  }

  exit() {
    this.jetLoop?.stop(0.3);
    for (const r of this.dangerRings.values()) {
      r.geometry.dispose();
      r.mat.dispose();
    }
    this.merger?.widget.remove();
    this.game.pipe.final.gw.amp = 0;
    super.exit();
  }

  // ------------------------------------------------------------------ rendering
  private render(dt: number) {
    const g = this.game;
    const P = this.P;
    const L = this.Lvis;
    const t = this.t;
    const glow = this.glow;
    const stars = this.stars;
    const gas = this.gas;
    const dust = this.dust;
    glow.begin();
    stars.begin();
    gas.begin();
    dust.begin();

    const rivals: { pos: THREE.Vector3; rs: number }[] = [];
    for (const b of this.bodies) {
      switch (b.kind) {
        case 'star': {
          const tw = 0.85 + 0.15 * Math.sin(t * 3 + b.seed);
          stars.push(b.x, 0, b.z, b.vx, 0, b.vz, b.color[0], b.color[1], b.color[2], b.young ? 1.3 : 1, b.radius * 3.4 * tw);
          if (b.planets) {
            for (let p = 0; p < b.planets; p++) {
              const pr = b.radius * (2.2 + p * 1.1);
              const pa = t * (1.5 / (p + 1)) + b.seed + p * 2;
              glow.push(b.x + Math.cos(pa) * pr, 0, b.z + Math.sin(pa) * pr, 0, 0, 0, 0.6, 0.7, 0.9, 0.7, b.radius * 0.35);
            }
          }
          break;
        }
        case 'wd':
          stars.push(b.x, 0, b.z, b.vx, 0, b.vz, 0.85, 0.92, 1, 1.2, b.radius * 3);
          break;
        case 'ns': {
          stars.push(b.x, 0, b.z, 0, 0, 0, 0.6, 0.8, 1, 1.4, b.radius * 3);
          const ang = t * 3 + b.seed;
          const bx = Math.cos(ang);
          const bz = Math.sin(ang);
          for (const s of [1, -1]) {
            for (let k = 1; k <= 4; k++) {
              const d = k * 2.2 * this.L * s;
              glow.push(b.x + bx * d, 0, b.z + bz * d, bx * 60 * this.L, 0, bz * 60 * this.L, 0.55, 0.75, 1, 0.5 / k, 0.4 * this.L);
            }
          }
          break;
        }
        case 'gas': {
          for (let k = 0; k < 12; k++) {
            const a = b.seed + k * 2.39996 + t * 0.15;
            const rr = b.radius * (0.15 + ((k * 0.618 + b.seed) % 1) * 0.75);
            gas.push(b.x + Math.cos(a) * rr, (k % 3) * 0.2 * b.radius - 0.2 * b.radius, b.z + Math.sin(a) * rr, b.vx, 0, b.vz, b.color[0] * 0.8, b.color[1] * 0.8, b.color[2] * 0.8, 0.09, b.radius * (0.35 + (k % 4) * 0.12));
          }
          glow.push(b.x, 0, b.z, b.vx, 0, b.vz, b.color[0], b.color[1], b.color[2], 0.25, b.radius * 0.3);
          break;
        }
        case 'dust':
          for (let k = 0; k < 8; k++) {
            const a = b.seed + k * 2.39996 + t * 0.1;
            const rr = b.radius * (0.2 + ((k * 0.618) % 1) * 0.7);
            dust.push(b.x + Math.cos(a) * rr, 0.5, b.z + Math.sin(a) * rr, 0, 0, 0, 0.06, 0.04, 0.03, 0.55, b.radius * 0.7);
          }
          break;
        case 'cluster': {
          const m = b.members!;
          for (let i = 0; i < (b.memberCount ?? 0); i++) {
            const rr = m[i * 4];
            const a = m[i * 4 + 1] + t * (0.6 / (1 + rr / this.L));
            const c = STAR_COLORS[m[i * 4 + 3] | 0];
            stars.push(b.x + Math.cos(a) * rr, m[i * 4 + 2], b.z + Math.sin(a) * rr, b.vx, 0, b.vz, c[0], c[1], c[2], 0.9, this.L * 0.9);
          }
          glow.push(b.x, 0, b.z, 0, 0, 0, 1, 0.9, 0.7, 0.35, b.radius * 1.2);
          break;
        }
        case 'nebula': {
          const m = b.members!;
          for (let k = 0; k < 26; k++) {
            const a = b.seed + k * 2.39996 + t * 0.05;
            const rr = b.radius * (0.1 + ((k * 0.618 + b.seed) % 1) * 0.85);
            const c2 = k % 3 === 0 ? [0.4, 0.6, 1.0] : b.color;
            gas.push(b.x + Math.cos(a) * rr, 0, b.z + Math.sin(a) * rr, 0, 0, 0, c2[0], c2[1], c2[2], 0.12, b.radius * 0.6);
          }
          for (let k = 0; k < (b.memberCount ?? 0); k++) {
            const rr = Math.min(m[k * 2], b.radius);
            const a = m[k * 2 + 1];
            stars.push(b.x + Math.cos(a) * rr, 0, b.z + Math.sin(a) * rr, 0, 0, 0, 0.7, 0.8, 1, 1.1, this.L * 1.2);
          }
          break;
        }
        case 'bh': {
          const Lr = this.scaleOf(b.mass);
          rivals.push({ pos: new THREE.Vector3(b.x, 0, b.z), rs: Lr });
          for (let k = 0; k < 24; k++) {
            const a = t * (2 + (k % 3)) + k * 0.26;
            const rr = Lr * (3 + (k % 5) * 0.8);
            glow.push(b.x + Math.cos(a) * rr, 0, b.z + Math.sin(a) * rr, -Math.sin(a) * rr * 3, 0, Math.cos(a) * rr * 3, 1, 0.65, 0.35, 0.6, Lr * 0.35);
          }
          const bigger = b.mass > this.M * 1.3;
          const cls = bigger ? 'danger' : b.mass < this.M * 0.8 ? 'prey' : 'neutral';
          g.hud.marker('bh' + b.id, new THREE.Vector3(b.x, 0, b.z - Lr * 4), `${b.name}<div class="m">${formatSolar(b.mass)} M☉${bigger ? ' · PELIGRO' : ''}</div>`, cls);
          let ring = this.dangerRings.get(b.id);
          if (!ring) {
            ring = new Ring(0xff4d5e, false, 0.008);
            ring.mat.uniforms.uDash.value = 50;
            this.dangerRings.set(b.id, ring);
            this.group.add(ring);
          }
          ring.position.set(b.x, 0, b.z);
          ring.setWorldRadius(bigger ? 18 * Lr : 9 * this.L + 3 * Lr);
          ring.setColor(bigger ? 0xff4d5e : 0x7dffb2);
          ring.opacity = 0.4;
          ring.tick(t, g.camera);
          break;
        }
      }
    }

    // Stream particles: the accretion flow
    for (let i = 0; i < this.sn; i++) {
      const dx = this.sx[i] - P.x;
      const dz = this.sz[i] - P.z;
      const r = Math.sqrt(dx * dx + dz * dz) / this.L;
      const heat = clamp(Math.max(this.sHeat[i] * 0.5, 1.4 - r / 12));
      const cr = 1;
      const cg = lerp(0.35, 0.95, heat);
      const cb = lerp(0.18, 1.0, heat * heat);
      glow.push(this.sx[i], this.sy[i], this.sz[i], this.svx[i], 0, this.svz[i], cr, cg, cb, 0.12 + heat * 0.3, this.L * (0.12 + heat * 0.08));
    }

    // Jets: knots racing outwards
    if (this.jetPower > 0.02) {
      const len = 60 * this.L;
      for (const s of [1, -1]) {
        for (let k = 0; k < 40; k++) {
          const f = ((t * 1.6 + k / 40) % 1);
          const d = f * len;
          const wob = Math.sin(k * 7 + t * 5) * this.L * 0.8 * f;
          const x = P.x + this.jetAxis.x * d * s - this.jetAxis.z * wob;
          const z = P.z + this.jetAxis.z * d * s + this.jetAxis.x * wob;
          glow.push(x, 0, z, this.jetAxis.x * s * 80 * this.L, 0, this.jetAxis.z * s * 80 * this.L, 0.75, 0.85, 1, this.jetPower * (1 - f) * 0.9, this.L * (0.5 + f));
        }
      }
    }
    glow.end();
    stars.end();
    gas.end();
    dust.end();

    // Black hole lens + disk
    const bh = g.pipe.bhPass;
    bh.bhPos.set(P.x, 0, P.z);
    bh.rs = L;
    const target = this.diskUnlocked ? clamp(0.32 + Math.sqrt(this.accRate) * 3.2, 0.32, 1.35) : clamp(0.05 + Math.sqrt(this.accRate) * 1.6, 0.05, 0.28);
    bh.diskIntensity = damp(bh.diskIntensity, target, 2, dt);
    bh.diskHeat = damp(bh.diskHeat, 0.45 + clamp(this.accRate * 12) * 0.45, 1, dt);
    bh.diskOuter = 12;
    bh.flow = 1 + clamp(this.accRate * 10);
    const n = this.jetPower > 0.05 ? this.jetAxis.clone() : this.defaultNormal;
    this.diskNormal.lerp(n, 1 - Math.exp(-(this.jetPower > 0.05 ? 5 : 0.8) * dt)).normalize();
    bh.diskNormal.copy(this.diskNormal);
    bh.rivals = rivals;
    if (this.merger) bh.rivals = [{ pos: new THREE.Vector3(this.merger.rival.x, 0, this.merger.rival.z), rs: this.scaleOf(this.merger.rival.mass) }];

    const cam = g.camera.position;
    const off = new THREE.Vector3(P.x, 0, P.z).add(this.jetAxis.clone().multiplyScalar(2.5 * L));
    const offB = new THREE.Vector3(P.x, 0, P.z).add(this.jetAxis.clone().multiplyScalar(-2.5 * L));
    this.jetA.set(off, this.jetAxis, 60 * L, 2.4 * L, this.jetPower * 1.3, t, cam);
    this.jetB.set(offB, this.jetAxis.clone().negate(), 60 * L, 2.4 * L, this.jetPower * 1.3, t, cam);

    this.infRing.position.set(P.x, 0, P.z);
    this.infRing.setWorldRadius(INF * this.L);
    this.infRing.opacity = this.cinematic ? 0 : 0.12 + (this.dragging ? 0.25 : 0);
    this.infRing.tick(t, g.camera);
    // Drag visual: rings contracting towards the hole
    if (this.dragging) {
      const f = (t * 0.8) % 1;
      this.dragRing.position.set(P.x, 0, P.z);
      this.dragRing.setWorldRadius(INF * this.L * (1 - f));
      this.dragRing.opacity = 0.35 * f;
    } else this.dragRing.opacity = 0;
    this.dragRing.tick(t, g.camera);

    this.renderPredictions();
  }

  private renderPredictions() {
    const P = this.P;
    const L = this.L;
    const GM = GMK * L * L * L;
    const show = this.stageN >= 7 && !this.cinematic && !this.merger;
    let seg = 0;
    if (show) {
      const cands = this.bodies
        .filter((b) => b.kind !== 'bh' && b.kind !== 'cluster' && b.kind !== 'nebula')
        .map((b) => ({ b, d: Math.hypot(b.x - P.x, b.z - P.z) }))
        .filter((c) => c.d < INF * L * 1.4)
        .sort((a, b) => a.d - b.d)
        .slice(0, 10);
      for (const { b } of cands) {
        const rx = b.x - P.x;
        const rz = b.z - P.z;
        const vx = b.vx - this.vel.x;
        const vz = b.vz - this.vel.y;
        const info = classifyOrbit(rx, rz, vx, vz, GM, (b.kind === 'star' ? TIDAL : CAP) * L);
        const col = info.type === 'capture' ? [1, 0.75, 0.3] : info.type === 'bound' ? [0.35, 0.85, 1] : [1, 0.3, 0.25];
        const n = predictPath(this.pathBuf, rx, rz, vx, vz, GM, 1.5 * L, 40, 5, CAP * L * 0.8);
        for (let i = 0; i < n - 1 && seg < 12 * 40; i++) {
          const f0 = (1 - i / n) * 0.55;
          const f1 = (1 - (i + 1) / n) * 0.55;
          const o = seg * 6;
          this.linePos[o] = P.x + this.pathBuf[i * 2];
          this.linePos[o + 1] = 0;
          this.linePos[o + 2] = P.z + this.pathBuf[i * 2 + 1];
          this.linePos[o + 3] = P.x + this.pathBuf[i * 2 + 2];
          this.linePos[o + 4] = 0;
          this.linePos[o + 5] = P.z + this.pathBuf[i * 2 + 3];
          this.lineCol[o] = col[0] * f0;
          this.lineCol[o + 1] = col[1] * f0;
          this.lineCol[o + 2] = col[2] * f0;
          this.lineCol[o + 3] = col[0] * f1;
          this.lineCol[o + 4] = col[1] * f1;
          this.lineCol[o + 5] = col[2] * f1;
          seg++;
        }
      }
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, seg * 2);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private hud(dt: number) {
    const g = this.game;
    const input = g.input;
    const rsKm = 2.95 * this.M;
    const rsTxt = rsKm < 1e6 ? `${Math.round(rsKm).toLocaleString('es')} km` : `${(rsKm / 1.496e8).toFixed(2)} UA`;
    g.hud.setMass(formatSolar(this.M), 'M☉', `radio de Schwarzschild ≈ ${rsTxt}`);
    const s = this.stageN;
    const range = (a: number, b: number) => clamp(Math.log(this.M / a) / Math.log(b / a));
    const obj: Record<number, [string, number | null]> = {
      7: ['Acércate a la materia y captúrala', null],
      8: [`Captura materia · alcanza ${formatSolar(Math.max(GATES.disk, this.M0 * 1.8))} M☉`, range(this.M0, Math.max(GATES.disk, this.M0 * 1.8))],
      9: [`Alimenta el disco · alcanza ${GATES.jets} M☉`, range(GATES.disk, GATES.jets)],
      10: [`Crece con ayuda de tus jets · ${GATES.growth} M☉`, range(GATES.jets, GATES.growth)],
      11: [`Aliméntate de todo · ${GATES.mergers} M☉`, range(GATES.growth, GATES.mergers)],
      12: [`Fusiónate con otros agujeros negros · ${formatSolar(GATES.imbh)} M☉`, range(GATES.mergers, GATES.imbh)],
      13: [`Domina tu entorno · 1 millón M☉`, range(GATES.imbh, GATES.smbh)],
    };
    const [txt, p] = this.merger ? ['Fusión en curso: alinea los espines', clamp(this.merger.t / this.merger.T)] : obj[s] ?? ['', null];
    g.hud.setObjective(txt, p);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    g.hud.setMeters([
      { id: 'energy', label: 'Energía', value: this.energy, color: this.hitFlash > 0 ? '#ff5a3c' : '#8fd3ff', warn: this.hitFlash > 0 },
      { id: 'acc', label: 'Acreción', value: clamp(Math.sqrt(this.accRate) * 3), text: this.accRate > 0.001 ? `${(this.accRate * 100).toFixed(1)}%/s` : '—', color: '#ffb46b' },
      ...(this.diskUnlocked ? [{ id: 'disk', label: 'Disco', value: clamp(this.disk / this.M), text: `${formatSolar(this.disk)} M☉`, color: '#ff8a5a' }] : []),
    ]);
    this.abilities([
      { id: 'drag', key: input.touchMode ? 'BTN' : 'CLIC', name: 'Arrastre', active: this.dragging, charge: this.energy },
      { id: 'jets', key: input.touchMode ? 'BTN 2' : 'CLIC DER', name: 'Jets', locked: !this.jetsUnlocked, active: this.jetting },
    ]);
    g.audio.setIntensity(0.3 + clamp(Math.sqrt(this.accRate) * 2) * 0.3 + this.jetPower * 0.25 + (this.merger ? 0.3 : 0));
  }
}
