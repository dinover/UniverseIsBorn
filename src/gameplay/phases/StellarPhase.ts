import * as THREE from 'three';
import { Phase } from '../Phase';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { Ring } from '../../vfx/Effects';
import { StarBody, type StarLook, lookLerp } from '../../vfx/StarBody';
import { SKY_PRESETS } from '../../vfx/Sky';
import { clamp, damp, formatSolar } from '../../utils/math';
import { h } from '../../ui/Hud';
import type { Rng } from '../../procgen/rng';
import type { LoopHandle } from '../../audio/AudioEngine';

type Pattern = 'single' | 'golden' | 'alternate' | 'shells' | 'triplets';

interface ElementDef {
  sym: string;
  name: string;
  coreTemp: string;
  period: number;
  travel: number;
  pattern: Pattern;
  need: number;
  radius: number;
  onion: string;
  unlock: string;
  look: StarLook;
}

const L = (c: number[], hot: number[], gran: number, inten: number, spots: number, boil: number, rays: number, cs: number, core = 0): StarLook => ({
  color: new THREE.Color(c[0], c[1], c[2]),
  hot: new THREE.Color(hot[0], hot[1], hot[2]),
  granulation: gran,
  intensity: inten,
  spots,
  boil,
  rays,
  coronaScale: cs,
  core,
});

const ELEMENTS: ElementDef[] = [
  { sym: 'H', name: 'Hidrógeno', coreTemp: '15 MK', period: 1.7, travel: 1.35, pattern: 'single', need: 7, radius: 3, onion: '#7fb6ff', unlock: 'Fusión estable: el ritmo del núcleo.', look: L([0.55, 0.7, 1.0], [0.95, 0.97, 1.0], 4, 1.25, 0.05, 0.35, 0.9, 3.2, 0.5) },
  { sym: 'He', name: 'Helio', coreTemp: '100 MK', period: 1.5, travel: 1.25, pattern: 'golden', need: 7, radius: 4.2, onion: '#ffe28a', unlock: 'Proceso triple alfa: los pulsos dorados valen doble.', look: L([1.0, 0.92, 0.7], [1.0, 1.0, 0.95], 3.4, 1.15, 0.1, 0.45, 0.8, 3.0, 0.4) },
  { sym: 'C', name: 'Carbono', coreTemp: '600 MK', period: 1.35, travel: 1.15, pattern: 'single', need: 7, radius: 5.6, onion: '#ffb060', unlock: 'Desbloqueas CONVECCIÓN: mantén clic derecho para ralentizar el ritmo.', look: L([1.0, 0.62, 0.3], [1.0, 0.9, 0.6], 2.8, 1.05, 0.25, 0.55, 0.7, 2.8, 0.3) },
  { sym: 'O', name: 'Oxígeno', coreTemp: '1,5 GK', period: 1.2, travel: 1.05, pattern: 'alternate', need: 7, radius: 7, onion: '#ff7a50', unlock: 'Los pulsos alternan velocidad: lee el ritmo.', look: L([1.0, 0.4, 0.16], [1.0, 0.75, 0.4], 2.2, 1.0, 0.35, 0.7, 0.6, 2.6, 0.3) },
  { sym: 'Ne', name: 'Neón', coreTemp: '1,2 GK', period: 1.1, travel: 1.0, pattern: 'shells', need: 7, radius: 8, onion: '#ff5aa0', unlock: 'Dos capas activas: atrapa cada pulso en su capa (color).', look: L([0.95, 0.25, 0.12], [1.0, 0.6, 0.45], 1.8, 0.95, 0.4, 0.85, 0.6, 2.5, 0.35) },
  { sym: 'Si', name: 'Silicio', coreTemp: '2,7 GK', period: 1.0, travel: 0.9, pattern: 'triplets', need: 8, radius: 8.6, onion: '#b48cff', unlock: 'Ráfagas de tres: el silicio se consume en un día.', look: L([0.9, 0.2, 0.1], [0.8, 0.85, 1.0], 1.6, 1.0, 0.45, 1.0, 0.7, 2.5, 0.8) },
];
const IRON_LOOK = L([0.6, 0.1, 0.05], [1.0, 0.35, 0.2], 1.5, 0.85, 0.6, 1.2, 0.5, 2.3, 1.2);
const IRON_WAVES = 20;

interface Pulse {
  ring: Ring;
  r: number;
  speed: number;
  target: number;
  golden: boolean;
  inner: boolean;
  inward: boolean;
  judged: boolean;
  fade: number;
}

/**
 * STAGES 4 & 5 — Massive star and iron core.
 * Fusion is a rhythm: catch energy pulses as they cross the burning shell.
 * Each new element changes the rules and transforms the star. Iron reverses everything.
 */
export class StellarPhase extends Phase {
  id = 'stellar' as const;
  private rng!: Rng;
  private star!: StarBody;
  private wind!: SpriteBatch;
  private field!: SpriteBatch;
  private windP: Float32Array = new Float32Array(0);
  private windN = 0;
  private mass = 24;
  private el = 0;
  private progress = 0;
  private stability = 1;
  private combo = 0;
  private bestCombo = 0;
  private pulses: Pulse[] = [];
  private targetRing!: Ring;
  private innerRing!: Ring;
  private spawnT = 1.5;
  private patternIdx = 0;
  private pausePulses = 2.5;
  private convection = 1;
  private slow = false;
  private iron = false;
  private ironWave = 0;
  private ironScore = 0;
  private ironMisses = 0;
  private coreMass = 1.0;
  private rumble: LoopHandle | null = null;
  private onion!: HTMLCanvasElement;
  private lookFrom: StarLook = ELEMENTS[0].look;
  private lookTo: StarLook = ELEMENTS[0].look;
  private lookT = 1;
  private radius = 3;
  private flare = 0;
  private done = false;
  private companions: { pos: THREE.Vector3; col: number[]; size: number }[] = [];

  touchLabels(): [string | null, string | null] {
    return ['Fusionar', 'Convección'];
  }

  enter() {
    const g = this.game;
    this.rng = g.rng.fork(4);
    g.setStage(4);
    g.sky.set(SKY_PRESETS.stellar, 1);
    g.audio.setEra('star');
    g.motes.color.setRGB(0.8, 0.85, 1);
    g.motes.alpha = 0.2;
    this.mass = this.carry.starMass ?? 24;
    this.star = new StarBody(ELEMENTS[0].look);
    this.star.setRadius(3);
    this.group.add(this.star);
    g.rig.setImmediate({ distance: 22, pitch: 0.28, yaw: 0, fov: 45 }, new THREE.Vector3());
    g.rig.autoOrbit = 0.03;

    this.targetRing = new Ring(0x9fe0ff, true, 0.012);
    this.innerRing = new Ring(0xd08cff, true, 0.012);
    this.innerRing.opacity = 0;
    this.group.add(this.targetRing, this.innerRing);

    this.windN = Math.floor(1400 * g.quality.profile.particles + 300);
    this.windP = new Float32Array(this.windN * 5);
    for (let i = 0; i < this.windN; i++) this.resetWind(i, true);
    this.wind = this.track(new SpriteBatch(this.windN, 'glow', { stretch: 0.08 }));
    this.field = this.track(new SpriteBatch(64, 'star'));
    this.group.add(this.wind.mesh, this.field.mesh);
    for (let i = 0; i < 14; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(120, 260);
      this.companions.push({
        pos: new THREE.Vector3(Math.cos(a) * d, this.rng.range(-60, 60), Math.sin(a) * d),
        col: this.rng.pick([[0.6, 0.75, 1], [1, 0.85, 0.6], [1, 0.6, 0.4], [0.9, 0.9, 1]]),
        size: this.rng.range(2, 6),
      });
    }

    const w = h('div', 'onion panel', `<div class="label" style="margin-bottom:8px">Capas de fusión</div>`);
    this.onion = document.createElement('canvas');
    this.onion.width = 300;
    this.onion.height = 300;
    this.onion.style.width = '150px';
    this.onion.style.height = '150px';
    w.appendChild(this.onion);
    g.hud.widget.appendChild(w);
    this.drawOnion();
    this.script();
  }

  private resetWind(i: number, initial = false) {
    const o = i * 5;
    const u = this.rng.range(-1, 1);
    const th = this.rng.range(0, Math.PI * 2);
    const s = Math.sqrt(1 - u * u);
    this.windP[o] = s * Math.cos(th);
    this.windP[o + 1] = u;
    this.windP[o + 2] = s * Math.sin(th);
    this.windP[o + 3] = initial ? this.rng.range(1, 6) : 1; // distance in radii
    this.windP[o + 4] = this.rng.range(0.4, 1.2); // speed
  }

  private async script() {
    const g = this.game;
    this.pausePulses = 99;
    await this.wait(0.8);
    g.hud.titleCard('Fusión nuclear', 'ETAPA 04', 'Hidrógeno → Helio', 3.5);
    await this.wait(3.5);
    this.tutorial('s4_rhythm', `El núcleo late. Pulsa <kbd>${g.input.touchMode ? 'FUSIONAR' : 'CLIC'}</kbd> o <kbd>ESPACIO</kbd> justo cuando cada onda de energía cruce el <b>anillo de fusión</b>.`, 9);
    this.pausePulses = 0.5;
  }

  debugSkip() {
    if (this.iron) this.ironWave = IRON_WAVES;
    else {
      this.el = ELEMENTS.length - 1;
      this.progress = 99;
    }
  }
  debugBoost() {
    this.progress += 3;
  }

  private get def() {
    return ELEMENTS[Math.min(this.el, ELEMENTS.length - 1)];
  }

  private spawnPulse(opts: Partial<Pulse> & { travelMul?: number } = {}) {
    const ring = new Ring(0xffffff, true, 0.03);
    this.group.add(ring);
    const R = this.star.radius;
    const inward = !!opts.inward;
    const inner = !!opts.inner;
    const target = inward ? R * 0.42 : inner ? R * 0.72 : R * 1.28;
    const start = inward ? R * 1.9 : 0.05;
    const travel = (this.iron ? this.ironTravel() : this.def.travel) * (opts.travelMul ?? 1);
    const speed = (target - start) / travel;
    ring.setColor(opts.golden ? 0xffd36b : inner ? 0xd08cff : inward ? 0xff6040 : 0xbfe8ff);
    this.pulses.push({ ring, r: start, speed, target, golden: !!opts.golden, inner, inward, judged: false, fade: 1 });
  }

  private ironTravel() {
    return Math.max(0.55, 1.25 - this.ironWave * 0.035);
  }

  private schedule() {
    const d = this.def;
    this.patternIdx++;
    switch (d.pattern) {
      case 'single':
        this.spawnPulse();
        this.spawnT = d.period;
        break;
      case 'golden':
        this.spawnPulse({ golden: this.patternIdx % 3 === 0 });
        this.spawnT = d.period;
        break;
      case 'alternate':
        this.spawnPulse({ travelMul: this.patternIdx % 2 ? 0.7 : 1.25 });
        this.spawnT = d.period;
        break;
      case 'shells':
        this.spawnPulse({ inner: this.rng.chance(0.5) });
        this.spawnT = d.period;
        break;
      case 'triplets': {
        const k = this.patternIdx % 4;
        this.spawnPulse({ golden: k === 3 });
        this.spawnT = k === 3 ? d.period * 1.8 : d.period * 0.55;
        break;
      }
    }
  }

  private judge(p: Pulse, q: 'perfect' | 'good' | 'miss') {
    const g = this.game;
    p.judged = true;
    const pos = this.star.position.clone().add(new THREE.Vector3(0, this.star.radius * 1.6, 0));
    if (q === 'miss') {
      this.combo = 0;
      this.stability -= this.iron ? 0.12 : 0.17;
      g.hud.floater('FALLO', pos, '#ff6a5a', 16, 0.9);
      g.shake(this.iron ? 0.3 : 0.15);
      p.ring.setColor(0xff4040);
      if (this.iron) this.ironMisses++;
    } else {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const perfect = q === 'perfect';
      if (perfect) g.prog.add('perfectHits', 1);
      this.stability = Math.min(1, this.stability + (perfect ? 0.04 : 0.01));
      const val = (perfect ? 1 : 0.6) * (p.golden ? 2 : 1);
      g.hud.floater(perfect ? (p.golden ? 'PERFECTO ×2' : 'PERFECTO') : 'BIEN', pos, perfect ? '#7dffb2' : '#bfe8ff', perfect ? 18 : 15, 0.9);
      if (this.combo >= 10 && !this.iron) g.prog.achieve('rhythm');
      if (this.iron) {
        this.ironScore += perfect ? 1 : 0.6;
        this.coreMass += perfect ? 0.03 : 0.02;
      } else this.progress += val;
      this.flare = perfect ? 1 : 0.6;
      (p.inner ? this.innerRing : this.targetRing).opacity = 1.4;
      p.fade = 0.5;
    }
    g.audio.hit(q, this.combo);
    g.bus.emit('fusionHit', { quality: q });
  }

  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const R = this.star.radius;

    // Convection slow-mo (unlocked at carbon)
    const canSlow = this.el >= 2 && !this.iron;
    this.slow = canSlow && input.secondaryHeld && this.convection > 0.05 && !this.cinematic;
    if (this.slow) this.convection = Math.max(0, this.convection - dt * 0.35);
    else this.convection = Math.min(1, this.convection + dt * 0.12);
    const pdt = dt * (this.slow ? 0.5 : 1);
    g.pipe.final.saturation = damp(g.pipe.final.saturation, this.slow ? 0.6 : 1.05, 6, dt);

    // Spawning
    if (!this.cinematic && !this.done) {
      if (this.pausePulses > 0) this.pausePulses -= dt;
      else {
        this.spawnT -= pdt;
        if (this.spawnT <= 0) {
          if (this.iron) {
            if (this.ironWave < IRON_WAVES) {
              this.ironWave++;
              this.spawnPulse({ inward: true });
              this.spawnT = Math.max(0.5, 1.45 - this.ironWave * 0.05);
              g.audio.thump(0.25 + this.ironWave * 0.015);
              this.star.pulse = 0.6;
            }
          } else this.schedule();
        }
      }
    }

    // Input judgement
    if (input.primaryPressed && !this.cinematic) {
      let best: Pulse | null = null;
      let bestErr = Infinity;
      for (const p of this.pulses) {
        if (p.judged) continue;
        const err = Math.abs(p.r - p.target) / p.target;
        if (err < bestErr) {
          bestErr = err;
          best = p;
        }
      }
      const win = this.iron ? 1.25 : 1; // iron: target is small, windows scaled
      if (best && bestErr < 0.08 * win) this.judge(best, 'perfect');
      else if (best && bestErr < 0.2 * win) this.judge(best, 'good');
      else if (best && bestErr < 0.45 * win) this.judge(best, 'miss');
      else if (this.pulses.length) {
        this.combo = 0;
        this.stability -= 0.05;
        g.audio.hit('miss');
      }
    }

    // Advance pulses
    for (const p of this.pulses) {
      p.r += p.speed * pdt;
      if (!p.judged) {
        const passed = p.inward ? p.r < p.target * (1 - 0.3) : p.r > p.target * 1.3;
        if (passed) this.judge(p, 'miss');
      } else p.fade -= dt * 2.5;
      p.ring.position.copy(this.star.position);
      p.ring.setWorldRadius(Math.max(0.05, p.r));
      const near = 1 - Math.min(1, Math.abs(p.r - p.target) / p.target);
      p.ring.opacity = Math.max(0, p.fade) * (0.35 + near * 0.8) * (p.judged ? 1.2 : 1);
      p.ring.tick(this.t, g.camera);
    }
    this.pulses = this.pulses.filter((p) => {
      const dead = p.fade <= 0 || p.r > R * 3 || p.r < 0.02;
      if (dead) {
        this.group.remove(p.ring);
        p.ring.geometry.dispose();
        p.ring.mat.dispose();
      }
      return !dead;
    });

    // Stability
    this.stability = Math.min(1, this.stability + dt * 0.03);
    if (this.stability <= 0) {
      this.stability = 0.5;
      this.flare = 1.5;
      if (!this.iron) this.progress = Math.max(0, this.progress - 1.5);
      this.mass *= 0.98;
      g.hud.floater('INESTABILIDAD · EYECCIÓN DE MASA', this.star.position.clone().add(new THREE.Vector3(0, R * 2, 0)), '#ff6a4a', 16, 1.8);
      g.pipe.final.shockwave(this.star.position.clone(), 0.8, 1.2, 0.5);
      g.shake(0.4);
    }

    // Element progression
    if (!this.iron && !this.cinematic && this.progress >= this.def.need) this.nextElement();

    // Visuals
    this.lookT = Math.min(1, this.lookT + dt * 0.5);
    const look = lookLerp(this.lookFrom, this.lookTo, this.lookT);
    this.flare = damp(this.flare, 0, 3, dt);
    look.intensity *= 1 + this.flare * 0.35;
    if (this.iron) {
      const k = this.ironWave / IRON_WAVES;
      look.core = 1 + k * 2 + Math.sin(this.t * (4 + k * 10)) * 0.5 * k;
    }
    this.star.setLook(look);
    const targetR = this.iron ? this.radius * (1 - (this.ironWave / IRON_WAVES) * 0.12) : this.def.radius;
    this.radius = damp(this.radius, targetR, 0.8, dt);
    this.star.setRadius(this.radius);
    this.star.pulse = damp(this.star.pulse, 0, 4, dt);
    this.star.update(this.t, g.camera);

    this.targetRing.position.copy(this.star.position);
    this.targetRing.setWorldRadius(R * (this.iron ? 0.42 : 1.28));
    this.targetRing.opacity = damp(this.targetRing.opacity, this.done ? 0 : 0.55, 3, dt);
    this.targetRing.setColor(this.iron ? 0xff7050 : 0x9fe0ff);
    this.targetRing.tick(this.t, g.camera);
    this.innerRing.position.copy(this.star.position);
    this.innerRing.setWorldRadius(R * 0.72);
    this.innerRing.opacity = damp(this.innerRing.opacity, this.def.pattern === 'shells' && !this.iron ? 0.5 : 0, 3, dt);
    this.innerRing.tick(this.t, g.camera);
    this.renderWind(dt);

    // Camera & tension
    if (!this.cinematic) {
      const k = this.iron ? this.ironWave / IRON_WAVES : 0;
      g.rig.state.distance = damp(g.rig.state.distance, this.radius * (6.2 - k * 2.4), 1, dt);
      if (this.iron) {
        g.pipe.final.pulse = Math.max(0, Math.sin(this.t * (3 + k * 9))) * k * 1.5;
        g.pipe.final.chroma = k * 0.8;
        g.pipe.final.vignette = 0.2 + k * 0.5;
        this.rumble?.set(0.2 + k * 0.8, k);
        g.shake(k * 0.01);
      }
    }

    // HUD
    const d = this.def;
    if (!this.iron) {
      g.hud.setMass(formatSolar(this.mass), 'M☉', `núcleo: ${d.name.toLowerCase()} · ${d.coreTemp}`);
      g.hud.setObjective(`Fusiona ${d.name.toLowerCase()} · ${Math.min(d.need, this.progress).toFixed(1)} / ${d.need}`, this.progress / d.need);
      g.hud.setMeters([
        { id: 'stab', label: 'Estabilidad', value: this.stability, color: this.stability < 0.3 ? '#ff5a3c' : '#7dffb2', warn: this.stability < 0.3 },
        { id: 'combo', label: 'Combo', value: Math.min(1, this.combo / 10), text: `×${this.combo}`, color: '#ffd36b' },
        ...(this.el >= 2 ? [{ id: 'conv', label: 'Convección', value: this.convection, color: '#8fd3ff' }] : []),
      ]);
      this.abilities([
        { id: 'fuse', key: input.touchMode ? 'BTN' : 'CLIC', name: 'Fusionar', active: input.primaryHeld },
        { id: 'conv', key: input.touchMode ? 'BTN 2' : 'CLIC DER', name: 'Convección', locked: this.el < 2, active: this.slow, charge: this.convection },
      ]);
      g.audio.setIntensity(0.4 + this.el * 0.08 + Math.min(0.2, this.combo * 0.02));
    } else {
      const k = this.ironWave / IRON_WAVES;
      g.hud.setMass(this.coreMass.toFixed(2), 'M☉ Fe', 'masa del núcleo de hierro · límite de Chandrasekhar 1,4');
      g.hud.setObjective(`¡RESISTE EL COLAPSO! Onda ${this.ironWave} / ${IRON_WAVES}`, k);
      g.hud.setMeters([
        { id: 'stab', label: 'Degeneración electrónica', value: this.stability, color: '#ff8a5a', warn: this.stability < 0.35 },
        { id: 'core', label: 'Núcleo de hierro', value: clamp(this.coreMass / 1.4), text: `${this.coreMass.toFixed(2)} / 1,40`, color: '#ff5a3c', warn: this.coreMass > 1.3 },
      ]);
      this.abilities([{ id: 'resist', key: input.touchMode ? 'BTN' : 'CLIC', name: 'Resistir', active: input.primaryHeld }]);
      g.audio.setIntensity(0.6 + k * 0.4);
    }
    this.drawOnion();

    if (this.iron && !this.done && this.ironWave >= IRON_WAVES && this.pulses.every((p) => p.judged)) {
      this.done = true;
      this.endIron();
    }
  }

  private async nextElement() {
    const g = this.game;
    const prev = this.def;
    this.progress = 0;
    this.pausePulses = 2.6;
    this.lookFrom = lookLerp(this.lookFrom, this.lookTo, this.lookT);
    this.lookT = 0;
    if (this.el >= ELEMENTS.length - 1) {
      this.startIron();
      return;
    }
    this.el++;
    const d = this.def;
    this.lookTo = d.look;
    this.mass *= 0.985; // stellar winds carry mass away over time
    g.pipe.final.doFlash(0.35, 0xffe8c0);
    g.pipe.final.shockwave(this.star.position.clone(), 0.7, 1.4, 0.7);
    g.pipe.bloomBoost = 1.2;
    g.audio.ignite();
    g.hud.titleCard(`${prev.sym} → ${d.sym}`, 'NUEVA CAPA DE FUSIÓN', `${d.name}: ${d.unlock}`, 3.6);
    if (this.el === 1) g.prog.discover('onion');
    if (this.el === 2) this.tutorial('s4_conv', `Nuevo: mantén <kbd>${g.input.touchMode ? 'CONVECCIÓN' : 'CLIC DER'}</kbd> (o <kbd>SHIFT</kbd>) para ralentizar el ritmo del núcleo. Se recarga con el tiempo.`, 8);
    if (this.el === 3) g.hud.feel('La estrella se hincha: ahora es una supergigante.', 4);
  }

  private async startIron() {
    const g = this.game;
    this.cinematic = true;
    this.lookTo = IRON_LOOK;
    this.lookT = 0;
    g.pipe.final.letterboxTarget = 1;
    g.audio.setEra('iron');
    g.sky.set(SKY_PRESETS.collapse, 3);
    g.hud.titleCard('Hierro', 'EL NÚCLEO YA NO FUSIONA', 'Fusionar hierro consume energía en vez de liberarla', 4.5);
    g.audio.thump(0.6);
    await this.wait(3);
    g.setStage(5);
    this.rumble = g.audio.loopRumble(38);
    this.rumble.set(0.2, 0);
    g.rig.autoOrbit = 0.01;
    await this.wait(2);
    g.pipe.final.letterboxTarget = 0;
    this.iron = true;
    this.stability = 1;
    this.cinematic = false;
    this.pausePulses = 1.2;
    this.tutorial('s5_iron', `¡El núcleo colapsa! Ahora las ondas vienen <b>hacia dentro</b>. Pulsa <kbd>${g.input.touchMode ? 'RESISTIR' : 'CLIC'}</kbd> cuando toquen el núcleo para resistir. Cuanto mejor resistas, más masivo será tu núcleo.`, 9);
  }

  private async endIron() {
    const g = this.game;
    this.cinematic = true;
    const quality = clamp(this.ironScore / IRON_WAVES);
    if (this.ironMisses <= 1) g.prog.achieve('iron_will');
    this.rumble?.set(1, 1.2);
    g.hud.titleCard('Límite superado', '1,4 MASAS SOLARES', 'La presión de degeneración cede', 2.5);
    await this.wait(2);
    this.rumble?.stop(0.2);
    g.pipe.final.pulse = 0;
    g.saveCarry({ starMass: this.mass, coreQuality: quality });
    await g.goto('supernova', { starMass: this.mass, coreQuality: quality }, { instant: true });
  }

  exit() {
    this.rumble?.stop(0.3);
    this.game.pipe.final.saturation = 1.05;
    this.game.pipe.final.vignette = 0.2;
    super.exit();
  }

  private renderWind(dt: number) {
    const b = this.wind;
    b.begin();
    const R = this.star.radius;
    const c = this.lookTo.color;
    const hot = this.lookTo.hot;
    const inward = this.iron ? -1 : 1;
    const k = this.iron ? this.ironWave / IRON_WAVES : 0;
    for (let i = 0; i < this.windN; i++) {
      const o = i * 5;
      this.windP[o + 3] += inward * this.windP[o + 4] * dt * (this.iron ? 1 + k * 3 : 0.6);
      if (this.windP[o + 3] > 7 || this.windP[o + 3] < 1.02) {
        this.resetWind(i);
        if (this.iron) this.windP[o + 3] = 6.5;
      }
      const d = this.windP[o + 3] * R;
      const x = this.star.position.x + this.windP[o] * d;
      const y = this.star.position.y + this.windP[o + 1] * d;
      const z = this.star.position.z + this.windP[o + 2] * d;
      const s = this.windP[o + 4] * R * inward * (this.iron ? 1 + k * 3 : 0.6);
      const fade = clamp((7 - this.windP[o + 3]) / 5) * clamp((this.windP[o + 3] - 1) * 2);
      b.push(x, y, z, this.windP[o] * s, this.windP[o + 1] * s, this.windP[o + 2] * s, c.r * 0.6 + hot.r * 0.4, c.g * 0.6 + hot.g * 0.4, c.b * 0.6 + hot.b * 0.4, fade * 0.28, R * 0.014 * (0.6 + this.windP[o + 4]));
    }
    b.end();
    const f = this.field;
    f.begin();
    for (const s of this.companions) f.push(s.pos.x, s.pos.y, s.pos.z, 0, 0, 0, s.col[0], s.col[1], s.col[2], 1, s.size);
    f.end();
  }

  private drawOnion() {
    const ctx = this.onion.getContext('2d');
    if (!ctx) return;
    const W = 300;
    ctx.clearRect(0, 0, W, W);
    const layers = this.iron ? ELEMENTS.length + 1 : this.el + 1;
    const maxR = 140;
    for (let i = 0; i < layers; i++) {
      const isIron = i === ELEMENTS.length;
      const col = isIron ? '#8a2a1a' : ELEMENTS[i].onion;
      const r = maxR * (1 - i / (ELEMENTS.length + 1.5));
      const cur = i === layers - 1;
      ctx.beginPath();
      ctx.arc(150, 150, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = cur ? 0.85 + Math.sin(this.t * 6) * 0.15 : 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = '600 22px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      const label = isIron ? 'Fe' : ELEMENTS[i].sym;
      const nextR = maxR * (1 - (i + 1) / (ELEMENTS.length + 1.5));
      ctx.fillText(label, 150, cur ? 158 : 150 - (r + nextR) / 2 + 8);
    }
  }
}
