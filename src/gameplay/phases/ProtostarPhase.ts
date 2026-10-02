import * as THREE from 'three';
import { Phase } from '../Phase';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { JetBeam } from '../../vfx/Effects';
import { StarBody, type StarLook, lookLerp } from '../../vfx/StarBody';
import { SKY_PRESETS } from '../../vfx/Sky';
import { clamp, damp, lerp, formatSolar } from '../../utils/math';
import { h } from '../../ui/Hud';
import type { Rng } from '../../procgen/rng';
import { num, tr } from '../../i18n/i18n';

const IGNITION = 10; // MK
const BAND = 0.3;
const MIN_MASS = 8;

const PROTO_LOOK: StarLook = {
  color: new THREE.Color(1.0, 0.3, 0.08),
  hot: new THREE.Color(1.0, 0.7, 0.3),
  granulation: 2.6,
  intensity: 0.7,
  spots: 0.5,
  boil: 1.0,
  rays: 0.35,
  coronaScale: 2.6,
  core: 0,
};
const IGNITED_LOOK: StarLook = {
  color: new THREE.Color(0.55, 0.7, 1.0),
  hot: new THREE.Color(0.95, 0.97, 1.0),
  granulation: 4,
  intensity: 1.4,
  spots: 0.1,
  boil: 0.4,
  rays: 0.9,
  coronaScale: 3.4,
  core: 0.6,
};

interface Clump {
  a: number;
  r: number;
  vr: number;
  mass: number;
  alive: boolean;
  orbit: number;
  life: number;
}

/**
 * STAGE 3 — Protostar. Keep gravity and pressure in balance while the core heats up.
 * Holding "contract" heats the core faster but tips the balance towards collapse;
 * pressure builds naturally, flares push towards expansion. Failure is possible.
 */
export class ProtostarPhase extends Phase {
  id = 'protostar' as const;
  private rng!: Rng;
  private star!: StarBody;
  private env!: SpriteBatch;
  private envDark!: SpriteBatch;
  private glow!: SpriteBatch;
  private jetUp!: JetBeam;
  private jetDown!: JetBeam;
  private n = 0;
  private pa!: Float32Array; // angle
  private pr!: Float32Array; // radius
  private ph!: Float32Array; // height
  private pk!: Float32Array; // random
  private P = new THREE.Vector3();
  private vel = new THREE.Vector2();
  private mass = 20;
  private E = 0; // -1 collapse .. +1 expansion
  private vE = 0;
  private Tc = 1; // MK
  private flareTimer = 7;
  private flareWarn = 0;
  private flarePending = 0;
  private burstTimer = 11;
  private ventCd = 0;
  private venting = 0;
  private events = 0;
  private clumps: Clump[] = [];
  private gauge!: { needle: HTMLElement; zone: HTMLElement };
  private igniting = 0;
  private done = false;
  private failed = false;
  private pulse = 0;

  touchLabels(): [string | null, string | null] {
    return [tr('Contraer', 'Contract'), tr('Chorro', 'Jet')];
  }

  enter() {
    const g = this.game;
    this.rng = g.rng.fork(3);
    g.setStage(3);
    g.sky.set(SKY_PRESETS.cloud, 1);
    g.audio.setEra('protostar');
    g.motes.color.setRGB(1, 0.6, 0.4);
    g.motes.alpha = 0.25;
    this.mass = this.carry.starMass ?? 20;
    g.rig.setImmediate({ distance: 16, pitch: 0.5, yaw: 0.3, fov: 50 }, new THREE.Vector3());
    g.rig.animate({ distance: 52, pitch: 0.62 }, 3.5);

    this.star = new StarBody(PROTO_LOOK);
    this.star.setRadius(2.5);
    this.group.add(this.star);

    const q = g.quality.profile.particles;
    this.n = Math.floor(3200 * q + 700);
    this.pa = new Float32Array(this.n);
    this.pr = new Float32Array(this.n);
    this.ph = new Float32Array(this.n);
    this.pk = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) this.respawn(i, true);
    this.env = this.track(new SpriteBatch(this.n + 400, 'soft', { stretch: 0.03 }));
    this.envDark = this.track(new SpriteBatch(this.n, 'dark', { stretch: 0.03 }));
    this.glow = this.track(new SpriteBatch(this.n + 200, 'glow', { stretch: 0.025, maxStretch: 2.5 }));
    this.env.mesh.renderOrder = 2;
    this.envDark.mesh.renderOrder = 3;
    this.glow.mesh.renderOrder = 6;
    this.group.add(this.env.mesh, this.envDark.mesh, this.glow.mesh);
    this.jetUp = new JetBeam(0xffd0a0, 0xff7040);
    this.jetDown = new JetBeam(0xffd0a0, 0xff7040);
    this.group.add(this.jetUp, this.jetDown);

    // Balance gauge widget
    const w = h('div', 'balance panel', `<div class="label"></div><div class="scale"><div class="rail"></div><div class="zone"></div><div class="needle"></div></div><div class="ends"><span></span><span></span><span></span></div>`);
    g.hud.widget.appendChild(w);
    this.gaugeEl = w;
    this.onLanguage();
    this.gauge = { needle: w.querySelector('.needle') as HTMLElement, zone: w.querySelector('.zone') as HTMLElement };
    this.gauge.zone.style.left = `${(0.5 - BAND / 2) * 100}%`;
    this.gauge.zone.style.width = `${BAND * 100}%`;
    this.script();
  }

  private gaugeEl: HTMLElement | null = null;

  onLanguage() {
    const w = this.gaugeEl;
    if (!w) return;
    (w.querySelector('.label') as HTMLElement).textContent = tr('Equilibrio hidrostático', 'Hydrostatic balance');
    const ends = w.querySelectorAll('.ends span');
    ends[0].textContent = tr('Colapso', 'Collapse');
    ends[1].textContent = tr('Equilibrio', 'Balance');
    ends[2].textContent = tr('Expansión', 'Expansion');
  }

  private respawn(i: number, initial = false) {
    const r = this.rng;
    this.pa[i] = r.range(0, Math.PI * 2);
    this.pr[i] = initial ? r.range(3.5, 38) : r.range(28, 40);
    this.ph[i] = r.gauss(0, 1) * (0.5 + this.pr[i] * 0.08);
    this.pk[i] = r.next();
  }

  private async script() {
    const g = this.game;
    await this.wait(1);
    g.hud.titleCard(tr('Protoestrella', 'Protostar'), tr('ETAPA 03', 'STAGE 03'), tr('El núcleo empieza a calentarse', 'The core begins to warm up'), 3.5);
    await this.wait(4);
    this.tutorial(
      's3_balance',
      tr(
        `La gravedad comprime y la presión empuja. Mantén la aguja en la <b>zona verde</b>. Si mantienes <kbd>${g.input.touchMode ? 'CONTRAER' : 'CLIC'}</kbd>, el núcleo se calienta más rápido, pero la balanza se inclina hacia el colapso.`,
        `Gravity squeezes and pressure pushes back. Keep the needle in the <b>green zone</b>. Holding <kbd>${g.input.touchMode ? 'CONTRACT' : 'CLICK'}</kbd> heats the core faster, but tips the balance toward collapse.`,
      ),
      10,
    );
    await this.wait(11);
    this.tutorial(
      's3_vent',
      tr(
        `Las <b>fulguraciones</b> empujan hacia la expansión. Usa <kbd>${g.input.touchMode ? 'CHORRO' : 'CLIC DER'}</kbd> (o <kbd>SHIFT</kbd>) para liberar un chorro bipolar y aliviar la presión.`,
        `<b>Flares</b> push toward expansion. Use <kbd>${g.input.touchMode ? 'JET' : 'R-CLICK'}</kbd> (or <kbd>SHIFT</kbd>) to release a bipolar jet and ease the pressure.`,
      ),
      9,
    );
    await this.wait(10);
    this.tutorial(
      's3_clumps',
      tr(
        'Muévete para atrapar los grumos de gas que caen: con más masa, la estrella será más grande… y su destino, más sorprendente.',
        'Move around to catch the falling clumps of gas: with more mass, the star will be bigger… and its fate more astonishing.',
      ),
      8,
    );
  }

  debugSkip() {
    this.Tc = IGNITION;
  }
  debugBoost() {
    this.mass += 5;
  }

  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const P = this.P;

    if (!this.cinematic) {
      const steer = input.steer(g.camera, P, 1.5, 14);
      this.vel.x = damp(this.vel.x, steer.x * 7, 2.5, dt);
      this.vel.y = damp(this.vel.y, steer.y * 7, 2.5, dt);
      P.x += this.vel.x * dt;
      P.z += this.vel.y * dt;
      const d = Math.hypot(P.x, P.z);
      if (d > 12) P.multiplyScalar(12 / d);
    }

    // --- Balance model
    const holding = input.primaryHeld && !this.cinematic && !this.failed;
    if (!this.cinematic && !this.failed) {
      // The needle has inertia: the star responds with delay, so the player must anticipate.
      const turbulence = Math.sin(this.t * 0.9) * 0.12 + Math.sin(this.t * 2.3 + 1) * 0.1;
      const force = 0.16 + turbulence + (this.Tc / IGNITION) * 0.1 - (holding ? 0.62 : 0);
      this.vE += force * dt * 2.2;
      this.vE *= 1 - dt * 1.6;
      this.E += this.vE * dt;
      // Flares
      this.flareTimer -= dt;
      if (this.flareTimer <= 0 && this.flareWarn <= 0) {
        this.flareWarn = 1.2;
        g.audio.warning();
      }
      if (this.flareWarn > 0) {
        this.flareWarn -= dt;
        if (this.flareWarn <= 0) {
          this.flarePending = 0.5;
          this.flareTimer = this.rng.range(6, 10) * (1 - (this.Tc / IGNITION) * 0.35);
          g.hud.floater(tr('FULGURACIÓN', 'FLARE'), P.clone().add(new THREE.Vector3(0, 4, 0)), '#ffcf6b', 15, 1.2);
          g.pipe.final.shockwave(P.clone(), 0.4, 0.9, 0.3);
          g.audio.whoosh(0.2);
        }
      }
      if (this.flarePending > 0) {
        const k = Math.min(this.flarePending, dt);
        this.vE += (0.75 / 0.5) * k;
        this.flarePending -= k;
      }
      // Episodic accretion bursts
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstTimer = this.rng.range(9, 15);
        this.vE -= 0.55;
        this.mass += 0.4;
        g.hud.floater(tr('ESTALLIDO DE ACRECIÓN', 'ACCRETION BURST'), P.clone().add(new THREE.Vector3(0, 4, 0)), '#ff9a6a', 14, 1.2);
        g.audio.thump(0.25);
      }
      // Bipolar outflow (vent)
      this.ventCd = Math.max(0, this.ventCd - dt);
      if (input.secondaryPressed && this.ventCd <= 0) {
        this.ventCd = 2.5;
        this.venting = 1;
        this.vE = Math.min(this.vE, 0) - 0.7;
        this.mass *= 0.992;
        g.audio.whoosh(0.25);
        g.pipe.final.shockwave(P.clone(), 0.35, 0.8, 0.25);
      }
      // Heating
      const inBand = Math.abs(this.E) < BAND;
      if (inBand) this.Tc += (0.11 + (holding ? 0.32 : 0)) * dt;
      else this.Tc = Math.max(1, this.Tc - 0.06 * dt);
      if (this.E >= 1) {
        this.events++;
        this.mass *= 0.92;
        this.E = 0.12;
        this.vE = 0;
        this.Tc = Math.max(1, this.Tc - 0.8);
        g.hud.floater(tr('EXPANSIÓN · PIERDES MASA', 'EXPANSION · MASS LOST'), P.clone().add(new THREE.Vector3(0, 5, 0)), '#6ab8ff', 16, 1.8);
        g.pipe.final.shockwave(P.clone(), 0.8, 1.2, 0.6);
        g.shake(0.35);
        g.audio.thump(0.4);
        this.pulse = 1;
      } else if (this.E <= -1) {
        this.events++;
        this.E = -0.12;
        this.vE = 0;
        this.Tc = Math.max(1, this.Tc - 1.4);
        g.hud.floater(tr('COLAPSO PARCIAL · REBOTE', 'PARTIAL COLLAPSE · BOUNCE'), P.clone().add(new THREE.Vector3(0, 5, 0)), '#ff6a4a', 16, 1.8);
        g.shake(0.5);
        g.audio.thump(0.5);
        this.pulse = -1;
      }
      this.E = clamp(this.E, -1.05, 1.05);
      if (this.mass < MIN_MASS && !this.failed) this.fail();
    }

    this.venting = Math.max(0, this.venting - dt * 0.8);
    this.pulse = damp(this.pulse, 0, 3, dt);
    this.updateClumps(dt);

    // --- Visuals
    const heat = clamp((this.Tc - 1) / (IGNITION - 1));
    const look = lookLerp(PROTO_LOOK, IGNITED_LOOK, this.igniting > 0 ? this.igniting : heat * 0.25);
    look.intensity *= 1 + heat * 0.6 + (this.flareWarn > 0 ? (1.2 - this.flareWarn) * 0.8 : 0) + this.igniting * 1.5;
    this.star.setLook(look);
    const radius = 2.2 * (1 + this.E * 0.28 + this.pulse * 0.15) * (1 + this.mass / 120) * (1 - this.igniting * 0.2);
    this.star.setRadius(damp(this.star.radius, radius, 6, dt));
    this.star.position.copy(P);
    this.star.pulse = this.pulse * 0.5;
    this.star.update(this.t, g.camera);
    const jp = 0.3 + this.venting * 1.6 + this.igniting * 2;
    const up = new THREE.Vector3(0, 1, 0);
    this.jetUp.set(P.clone().add(new THREE.Vector3(0, radius * 0.8, 0)), up, 16 + this.venting * 14, 1.2 + this.venting, jp, this.t, g.camera.position);
    this.jetDown.set(P.clone().add(new THREE.Vector3(0, -radius * 0.8, 0)), up.clone().negate(), 16 + this.venting * 14, 1.2 + this.venting, jp, this.t, g.camera.position);
    this.renderEnvelope(dt, heat);

    // --- HUD
    const pos = (clamp(this.E, -1, 1) + 1) / 2;
    this.gauge.needle.style.left = `${pos * 100}%`;
    this.gauge.needle.style.background = Math.abs(this.E) < BAND ? '#7dffb2' : Math.abs(this.E) > 0.75 ? '#ff5a3c' : '#fff';
    g.hud.setMass(formatSolar(this.mass), 'M☉', this.mass < 10 ? tr('cuidado: queda poca masa', 'careful: mass is running low') : tr('protoestrella', 'protostar'));
    g.hud.setObjective(
      this.done ? tr('Ignición', 'Ignition') : `${tr('Calienta el núcleo hasta 10 millones de K', 'Heat the core to 10 million K')} · ${num(this.Tc, 1)} MK`,
      (this.Tc - 1) / (IGNITION - 1),
    );
    g.hud.setMeters([
      { id: 'tc', label: tr('Temperatura del núcleo', 'Core temperature'), value: (this.Tc - 1) / (IGNITION - 1), text: `${num(this.Tc, 1)} MK`, color: '#ffb46b' },
      { id: 'vent', label: tr('Chorro bipolar', 'Bipolar jet'), value: 1 - this.ventCd / 2.5, text: this.ventCd > 0 ? '…' : tr('LISTO', 'READY'), color: '#ff8a5a' },
    ]);
    this.abilities([
      { id: 'contract', key: input.touchMode ? 'BTN' : tr('CLIC', 'CLICK'), name: tr('Contraer', 'Contract'), active: holding },
      { id: 'vent', key: input.touchMode ? 'BTN 2' : tr('CLIC DER', 'R-CLICK'), name: tr('Chorro bipolar', 'Bipolar jet'), charge: 1 - this.ventCd / 2.5 },
    ]);
    g.audio.setIntensity(0.35 + heat * 0.4 + Math.abs(this.E) * 0.2);
    if (!this.cinematic) {
      g.rig.target.set(P.x * 0.6, 0, P.z * 0.6);
    }

    if (!this.done && this.Tc >= IGNITION) {
      this.done = true;
      this.ignite();
    }
  }

  private updateClumps(dt: number) {
    const g = this.game;
    if (!this.cinematic && this.clumps.length < 4 && this.rng.next() < dt * 0.5) {
      this.clumps.push({ a: this.rng.range(0, Math.PI * 2), r: 30, vr: -this.rng.range(3, 5), mass: this.rng.range(0.4, 0.9), alive: true, orbit: this.rng.range(7, 12), life: 16 });
    }
    for (const c of this.clumps) {
      // Clumps settle into an orbit around the disk and dissolve if nobody catches them.
      c.r = Math.max(c.orbit, c.r + c.vr * dt);
      c.life -= dt;
      if (c.life <= 0) c.alive = false;
      c.a += (4 / Math.max(3, c.r)) * dt;
      const x = Math.cos(c.a) * c.r;
      const z = Math.sin(c.a) * c.r;
      const d = Math.hypot(x - this.P.x, z - this.P.z);
      if (d < this.star.radius * 1.7) {
        c.alive = false;
        this.mass += c.mass;
        this.vE -= 0.22;
        g.hud.floater(`+${num(c.mass, 1)} M☉`, new THREE.Vector3(x, 2, z), '#ffd0a0', 15, 1.2);
        g.audio.capture(0.3);
      } else if (c.r < 2) c.alive = false;
    }
    this.clumps = this.clumps.filter((c) => c.alive);
  }

  private renderEnvelope(dt: number, heat: number) {
    const env = this.env;
    const dark = this.envDark;
    const glow = this.glow;
    env.begin();
    dark.begin();
    glow.begin();
    const P = this.P;
    const blow = this.igniting;
    for (let i = 0; i < this.n; i++) {
      const r = this.pr[i];
      const w = 7 / Math.pow(Math.max(r, 2), 1.5);
      this.pa[i] += w * dt;
      if (blow > 0) this.pr[i] += (6 + r * 1.5) * blow * dt * 3;
      else this.pr[i] -= (0.35 + (this.pk[i] < 0.2 ? 1.5 : 0)) * dt;
      if (this.pr[i] < this.star.radius * 1.1 || this.pr[i] > 90) {
        if (blow > 0 && this.pr[i] > 90) this.pr[i] = 200;
        else this.respawn(i);
      }
      if (this.pr[i] > 150) continue;
      const a = this.pa[i];
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.ph[i] * (1 - blow * 0.5);
      const v = w * r;
      const vx = -Math.sin(a) * v;
      const vz = Math.cos(a) * v;
      const k = this.pk[i];
      const near = clamp(1 - r / 30);
      if (k < 0.18) dark.push(x, y, z, vx, 0, vz, 0.06, 0.03, 0.02, 0.35 * (1 - blow), 2.2 + k * 6);
      else if (k < 0.85) env.push(x, y, z, vx, 0, vz, 0.9 * near + 0.3, 0.35 * near + 0.15, 0.2 + 0.2 * (1 - near), 0.04 + near * 0.06, 2.2 + k * 4);
      else glow.push(x, y, z, vx, 0, vz, 1.0, 0.55 + near * 0.3, 0.3, 0.12 + near * 0.3 + heat * 0.15, 0.1 + (k - 0.75) * 0.5);
    }
    for (const c of this.clumps) {
      const x = Math.cos(c.a) * c.r;
      const z = Math.sin(c.a) * c.r;
      glow.push(x, 0, z, 0, 0, 0, 1.0, 0.75, 0.45, 1.2, 1.4 + c.mass);
      env.push(x, 0, z, 0, 0, 0, 1.0, 0.5, 0.3, 0.3, 3.5);
    }
    // warm glow around the star
    glow.push(P.x, 0, P.z, 0, 0, 0, 1.0, 0.45 + heat * 0.3, 0.2 + heat * 0.4, 0.2 + heat * 0.25, this.star.radius * 3);
    env.end();
    dark.end();
    glow.end();
  }

  private async fail() {
    const g = this.game;
    this.failed = true;
    this.cinematic = true;
    g.bus.emit('failure', { reason: 'lowmass' });
    g.hud.titleCard(
      tr('Falta un poco de masa', 'Not quite enough mass'),
      tr('UN NUEVO INTENTO', "LET'S TRY AGAIN"),
      tr('Con tan poca masa no habrá supernova: serías una estrella tranquila, como el Sol.', "With this little mass there will be no supernova: you'd become a calm star, like the Sun."),
      5,
    );
    g.audio.thump(0.5);
    await this.wait(5);
    g.hud.hint(tr('Evita las expansiones: cada una se lleva parte de tu masa. Volvamos a intentarlo…', "Avoid expansions: each one carries away part of your mass. Let's try again…"), 5);
    await g.goto('protostar', { starMass: Math.max(this.carry.starMass ?? 18, 16) });
  }

  private async ignite() {
    const g = this.game;
    this.cinematic = true;
    g.hud.clearHint();
    g.pipe.final.letterboxTarget = 1;
    g.audio.ignite();
    g.audio.swell(10);
    g.rig.animate({ distance: 14, pitch: 0.35 }, 2.5);
    const start = this.t;
    while (this.alive && this.t - start < 2.5) {
      this.igniting = ((this.t - start) / 2.5) * 0.3;
      g.pipe.bloomBoost = this.igniting * 3;
      g.shake(0.005);
      await this.wait(0);
    }
    g.pipe.final.doFlash(1, 0xcfe0ff);
    g.pipe.final.shockwave(this.P.clone(), 1.2, 2, 1.2);
    g.shake(0.7);
    g.audio.boom();
    g.hud.titleCard(tr('Nace una estrella', 'A star is born'), tr('IGNICIÓN', 'IGNITION'), tr('La fusión del hidrógeno ha comenzado', 'Hydrogen fusion has begun'), 4.5);
    g.prog.achieve('first_light');
    if (this.events === 0) g.prog.achieve('perfect_balance');
    g.sky.set(SKY_PRESETS.stellar, 3);
    g.rig.animate({ distance: 60, pitch: 0.45 }, 5);
    const s2 = this.t;
    while (this.alive && this.t - s2 < 5) {
      this.igniting = 0.3 + ((this.t - s2) / 5) * 0.7;
      await this.wait(0);
    }
    g.saveCarry({ starMass: this.mass });
    await g.goto('stellar', { starMass: this.mass }, { fade: 0.8 });

  }
}
