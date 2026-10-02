import * as THREE from 'three';
import { Phase } from '../Phase';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { JetBeam, Ring } from '../../vfx/Effects';
import { GalaxyField } from '../../vfx/GalaxyField';
import { SKY_PRESETS } from '../../vfx/Sky';
import { clamp, damp, easeInOut, easeOutCubic, formatSolar, lerp, TAU } from '../../utils/math';
import { h } from '../../ui/Hud';
import { Rng } from '../../procgen/rng';
import type { LoopHandle } from '../../audio/AudioEngine';
import type { Game } from '../../core/Game';
import type { RunCarry } from '../../persistence/SaveSystem';
import { SandboxMode } from '../sandbox/SandboxMode';
import { stageDef } from '../../progression/Stages';
import { tr } from '../../i18n/i18n';

type GState = 'reveal' | 'feed' | 'grow1' | 'satellite' | 'grow2' | 'merger' | 'ending' | 'sandbox';

interface Cloud {
  a: number;
  th0: number;
  h: number;
  mass: number;
  alive: boolean;
  infall: number; // 0 = orbiting, >0 = progress of infall
  from: THREE.Vector3;
  color: [number, number, number];
  pos: THREE.Vector3;
}

interface Flash {
  pos: THREE.Vector3;
  t: number;
}

const RG = 600; // galaxy radius (world units)
const GOAL1 = 1e7;
const GOAL2 = 1.5e8;

/**
 * STAGES 14 & 15 — Supermassive black hole at the heart of a living galaxy.
 * The player channels gas clouds to the centre, manages quasar feedback with jets,
 * cannibalises a satellite galaxy and survives a full galaxy collision.
 * With `sandbox` it hosts free mode instead: the same living galaxy, no goals,
 * plus the economy and shop of `SandboxMode`.
 */
export class GalaxyPhase extends Phase {
  id = 'galaxy' as const;
  private rng!: Rng;
  private gal!: GalaxyField;
  private sat: GalaxyField | null = null;
  private comp: GalaxyField | null = null;
  private M = 1e6;
  private Q = 0.25; // quasar activity
  private idleHint = 0;
  private cloudRings: Ring[] = [];
  private V = 1; // galactic vitality (star formation)
  private state: GState = 'reveal';
  private clouds: Cloud[] = [];
  private cloudN = 12;
  private feeds = 0;
  private cooldown = 0;
  private hover: Cloud | null = null;
  private hoverRing!: Ring;
  private glow!: SpriteBatch;
  private soft!: SpriteBatch;
  private web: SpriteBatch | null = null;
  private jetUp!: JetBeam;
  private jetDown!: JetBeam;
  private jetPower = 0;
  private jetting = false;
  private jetLoop: LoopHandle | null = null;
  private lobes = 0;
  private flashes: Flash[] = [];
  private flashT = 1;
  private satT = 0;
  private satPos = new THREE.Vector3();
  private satEaten = 0;
  private compT = 0;
  private compMass = 0;
  private spin: { needle: number; zone: number; aligned: number; cd: number; el: HTMLElement; needleEl: SVGElement; zoneEl: SVGPathElement; pips: HTMLElement } | null = null;
  private frenzy = 0;
  private regenT = 6;
  private eventT = 25;
  private sizeBoost = 1;
  private clusterInfall: { th: number; r: number; alive: boolean; mass: number; pos: THREE.Vector3 } | null = null;
  private sb: SandboxMode | null = null;
  /** Galaxy size multiplier (grows with the free-mode level). */
  private S = 1;

  constructor(game: Game, carry: RunCarry, private sandbox = false) {
    super(game, carry);
  }

  touchLabels(): [string | null, string | null] {
    return [tr('Atraer', 'Draw in'), tr('Chorros', 'Jets')];
  }

  enter() {
    const g = this.game;
    g.hud.show(true);
    const sb = this.sandbox ? g.prog.loadSandbox() : null;
    if (this.sandbox && !sb) throw new Error('Free mode started without a sandbox save');
    this.rng = sb ? new Rng(sb.seed) : g.rng.fork(14);
    this.M = sb ? sb.mass : Math.max(1e6, this.carry.bhMass ?? 1e6);
    const resumed = (this.carry.galaxyStage ?? 0) > 0;
    if (!sb) g.setStage(14, resumed);
    g.audio.setEra('galaxy');
    g.sky.set(SKY_PRESETS.cluster, 0);
    g.motes.alpha = 0;
    const q = g.quality.profile;
    const base = sb?.base;
    this.gal = new GalaxyField(
      {
        count: q.galaxyStars,
        radius: RG,
        arms: base?.arms ?? this.rng.pick([2, 2, 3, 4]),
        twist: base?.twist ?? this.rng.range(1.4, 2.2),
        ecc: base?.ecc ?? this.rng.range(0.34, 0.45),
        pattern: 0.012,
        vel: 42,
        bulge: base?.bulge ?? this.rng.range(0.12, 0.2),
        hueShift: base?.hueShift ?? this.rng.range(-0.5, 0.5),
      },
      this.rng,
    );
    this.group.add(this.gal);
    this.glow = this.track(new SpriteBatch(2500, 'glow', { stretch: 0.02 }));
    this.soft = this.track(new SpriteBatch(1400, 'soft', { stretch: 0.01 }));
    this.soft.mesh.renderOrder = 5;
    this.glow.mesh.renderOrder = 6;
    this.group.add(this.soft.mesh, this.glow.mesh);
    this.hoverRing = new Ring(0x9fd6ff, false, 0.02);
    this.hoverRing.opacity = 0;
    this.group.add(this.hoverRing);
    this.jetUp = new JetBeam(0xcfe4ff, 0x8a6bff);
    this.jetDown = new JetBeam(0xcfe4ff, 0x8a6bff);
    this.group.add(this.jetUp, this.jetDown);

    if (sb) {
      this.sb = new SandboxMode(g, sb, { gal: this.gal, group: this.group, jets: [this.jetUp, this.jetDown], setBusy: (v) => (this.cinematic = v) });
      this.S = this.sb.scale;
      this.cloudN = this.sb.cloudCap;
      this.eventT = this.sb.clusterInterval(() => this.rng.next());
      this.buildWeb(RG * 6);
      this.web!.alpha = 0;
    }
    for (let i = 0; i < this.cloudN; i++) this.spawnCloud();

    const bh = g.pipe.bhPass;
    bh.primaryActive = true;
    bh.bhPos.set(0, 0, 0);
    bh.rs = 3;
    bh.diskInner = 3;
    bh.diskOuter = 12;
    bh.diskIntensity = 0.8;
    bh.diskHeat = 0.7;
    bh.diskNormal.set(0.1, 1, 0.3).normalize();

    if (this.sb) {
      this.state = 'sandbox';
      g.sky.set(SKY_PRESETS.intergalactic, 0);
      const d = this.sb.viewDistance;
      g.rig.setImmediate({ distance: d * 0.55, pitch: 0.75, yaw: 0.4, fov: 50 }, new THREE.Vector3());
      g.rig.animate({ distance: d, pitch: 0.95, yaw: 1.1 }, 7);
      this.sb.enter((s) => this.wait(s));
    } else if (resumed) {
      this.state = (this.carry.galaxyStage ?? 0) >= 2 ? 'grow2' : 'grow1';
      g.setStage(15, true);
      g.sky.set(SKY_PRESETS.intergalactic, 0);
      g.rig.setImmediate({ distance: 1500, pitch: 0.95, yaw: 0.4, fov: 50 }, new THREE.Vector3());
    } else {
      g.rig.setImmediate({ distance: 70, pitch: 0.55, yaw: 0.4, fov: 50 }, new THREE.Vector3());
      this.reveal();
    }
  }

  private spawnCloud() {
    const r = this.rng;
    this.clouds.push({
      a: r.range(0.25, 0.85),
      th0: r.range(0, TAU),
      h: r.gauss(0, 0.3),
      mass: 0,
      alive: true,
      infall: 0,
      from: new THREE.Vector3(),
      color: r.pick([[0.95, 0.4, 0.7], [0.45, 0.6, 1], [1, 0.55, 0.45]] as [number, number, number][]),
      pos: new THREE.Vector3(),
    });
  }

  private async reveal() {
    const g = this.game;
    this.cinematic = true;
    g.pipe.final.letterboxTarget = 1;
    g.audio.swell(14);
    this.gal.fade = 0.25;
    await this.wait(1);
    g.rig.animate({ distance: 1650, pitch: 0.95, yaw: 1.2 }, 9, easeInOut);
    const t0 = this.t;
    let said = false;
    while (this.alive && this.t - t0 < 9) {
      const k = (this.t - t0) / 9;
      this.gal.fade = lerp(0.25, 1, easeOutCubic(k));
      if (k > 0.2) g.sky.set(SKY_PRESETS.intergalactic, 4);
      if (!said && k > 0.45) {
        said = true;
        g.hud.titleCard(stageDef(14).name, tr('ETAPA 14', 'STAGE 14'), tr('Un millón de soles en el corazón de una galaxia', 'A million suns at the heart of a galaxy'), 4.5);
      }
      await this.wait(0);
    }
    g.hud.feel(tr('Y todas esas estrellas giran a mi alrededor.', 'And all those stars are turning around me.'), 5);
    g.prog.discover('galaxy');
    await this.wait(2);
    g.pipe.final.letterboxTarget = 0;
    this.cinematic = false;
    this.state = 'feed';
    const touch = g.input.touchMode;
    this.tutorial(
      'g_feed',
      tr(
        `Ahora estás en el centro. Las <b>nubes de gas</b> de los brazos están marcadas con <b>anillos</b>. ${touch ? 'Toca una' : 'Haz <kbd>CLIC</kbd> cerca de una'} (o pulsa <kbd>${touch ? 'ATRAER' : 'ESPACIO'}</kbd>) para que caiga en espiral hacia ti. <kbd>${touch ? 'CHORROS' : 'CLIC DER'}</kbd> lanza los chorros del cuásar.`,
        `You now sit at the center. The <b>gas clouds</b> in the arms are marked with <b>rings</b>. ${touch ? 'Tap one' : '<kbd>CLICK</kbd> near one'} (or press <kbd>${touch ? 'DRAW IN' : 'SPACE'}</kbd>) and it will spiral toward you. <kbd>${touch ? 'JETS' : 'R-CLICK'}</kbd> fires the quasar's jets.`,
      ),
      11,
    );
  }

  help() {
    return this.sb ? this.sb.help() : false;
  }

  onLanguage() {
    this.sb?.onLanguage();
  }

  debugSkip() {
    if (this.sb) this.sb.debugDust();
    else if (this.state === 'feed') this.feeds = 3;
    else if (this.state === 'grow1') this.M = GOAL1;
    else if (this.state === 'satellite') this.satEaten = 1;
    else if (this.state === 'grow2') this.M = GOAL2;
    else if (this.state === 'merger' && this.spin) this.compT = 999;
  }
  debugBoost() {
    this.M *= 1.5;
    this.sb?.debugDust();
  }

  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const time = this.t;
    this.gal.update(time, g.pipe.renderer.getPixelRatio());

    // --- Cloud positions, hover & channelling
    this.hover = null;
    // Generous picking: clicking roughly near a cloud is enough.
    let bestD = g.rig.effectiveDistance * 0.16 + 40;
    for (const c of this.clouds) {
      if (!c.alive) continue;
      if (c.infall > 0) {
        c.infall += dt / 3.2;
        const k = easeInOut(Math.min(1, c.infall));
        const ang = Math.atan2(c.from.z, c.from.x) + k * 2.2;
        const r = Math.hypot(c.from.x, c.from.z) * Math.pow(1 - k, 1.3);
        c.pos.set(Math.cos(ang) * r, c.from.y * (1 - k), Math.sin(ang) * r);
        if (c.infall >= 1) this.consumeCloud(c);
      } else {
        this.gal.orbitPos(c.a, c.th0, c.h, time, c.pos);
        const d = Math.hypot(c.pos.x - input.pointerWorld.x, c.pos.z - input.pointerWorld.z);
        if (d < bestD) {
          bestD = d;
          this.hover = c;
        }
      }
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    const canAct = !this.cinematic && this.state !== 'merger' && this.state !== 'ending';
    g.pipe.renderer.domElement.style.cursor = canAct && this.hover && !input.touchMode ? 'pointer' : '';
    // Click near a cloud, or press Space / the touch button to channel the closest one.
    const wantsChannel = canAct && (input.clicked || (input.primaryPressed && !input.primary));
    let usedClick = false;
    if (canAct && input.clicked && this.clusterInfall && this.clusterInfall.alive) {
      const ci = this.clusterInfall;
      if (Math.hypot(ci.pos.x - input.pointerWorld.x, ci.pos.z - input.pointerWorld.z) < bestD * 1.2) {
        ci.r *= 0.3;
        usedClick = true;
        g.audio.whoosh(0.25);
        g.hud.floater(tr('¡EN CAMINO!', 'ON ITS WAY!'), ci.pos.clone().add(new THREE.Vector3(0, 30, 0)), '#ffe0a0', 15, 1.2);
      }
    }
    if (wantsChannel && !usedClick) {
      let target = this.hover;
      if (!target && (input.touchMode || !input.clicked)) {
        // No pointer target: take the closest orbiting cloud to the centre.
        target = this.clouds.filter((c) => c.alive && c.infall === 0).sort((a, b) => a.a - b.a)[0] ?? null;
      }
      if (target && this.cooldown <= 0) {
        this.channel(target);
      } else if (input.clicked) {
        const msg = this.cooldown > 0 ? tr('UN INSTANTE…', 'JUST A MOMENT…') : target ? '' : tr('NO HAY NUBES AHÍ · BUSCA LOS ANILLOS', 'NO CLOUDS THERE · LOOK FOR THE RINGS');
        if (msg) g.hud.floater(msg, input.pointerWorld.clone().add(new THREE.Vector3(0, 20, 0)), '#ffb0a0', 13, 1.2);
      }
    }
    if (this.state === 'feed' && canAct && this.feeds === 0) {
      this.idleHint += dt;
      if (this.idleHint > 14) {
        this.idleHint = 0;
        const touch = g.input.touchMode;
        g.hud.hint(
          tr(
            `Las nubes de gas de los brazos están marcadas con <b>anillos</b>. ${touch ? 'Toca una' : 'Haz <kbd>CLIC</kbd> cerca de una'} (o pulsa <kbd>${touch ? 'ATRAER' : 'ESPACIO'}</kbd>) y caerá en espiral hacia ti.`,
            `The gas clouds in the arms are marked with <b>rings</b>. ${touch ? 'Tap one' : '<kbd>CLICK</kbd> near one'} (or press <kbd>${touch ? 'DRAW IN' : 'SPACE'}</kbd>) and it will spiral toward you.`,
          ),
          8,
        );
      }
    }

    // --- Quasar & jets: always respond; power depends on the quasar charge.
    const wantJet = canAct && input.secondaryHeld;
    if (wantJet && !this.jetting) {
      this.jetLoop = this.jetLoop ?? g.audio.loopJet();
      g.audio.whoosh(0.25);
      if (this.Q < 0.08) g.hud.floater(tr('CHORROS DÉBILES · ALIMENTA EL NÚCLEO PARA CARGAR EL CUÁSAR', 'WEAK JETS · FEED THE CORE TO CHARGE THE QUASAR'), new THREE.Vector3(0, 120, 0), '#c9a8ff', 13, 2);
    }
    this.jetting = wantJet || this.frenzy > 0;
    this.jetPower = damp(this.jetPower, this.jetting ? 0.35 + Math.min(1, this.Q * 2) * 0.65 : 0, 4, dt);
    this.jetLoop?.set(this.jetPower * 0.8, this.Q);
    if (this.jetting && this.frenzy <= 0) {
      const vent = Math.min(this.Q, dt * 0.3);
      this.Q -= vent;
      this.lobes += vent;
      this.sb?.onVent(vent);
      g.prog.add('jetSeconds', dt);
    }
    // Free mode runs for hours: old radio lobes slowly fade instead of growing forever.
    if (this.sb) this.lobes = damp(this.lobes, 0, 0.05, dt);
    this.Q = clamp(this.Q - dt * 0.012);
    if (this.Q >= 1 && this.frenzy <= 0) this.outburst();

    // --- Vitality: star formation depends on the gas left in the arms
    if (this.sb) this.cloudN = this.sb.cloudCap;
    const alive = this.clouds.filter((c) => c.alive && c.infall === 0).length;
    this.V = damp(this.V, clamp(alive / this.cloudN), 0.5, dt);
    this.gal.young = this.V;
    this.gal.brightness = 0.85 + this.V * 0.25 + this.frenzy * 0.3;
    if (this.V < 0.35 && this.state !== 'reveal')
      this.tutorial(
        'g_vital',
        tr(
          'Estás consumiendo el gas muy deprisa y la <b>formación estelar</b> se apaga. Una galaxia viva también te alimenta: deja que las nubes se regeneren.',
          "You're using up the gas very quickly, and <b>star formation</b> is fading. A living galaxy also feeds you: let the clouds grow back.",
        ),
        8,
      );
    this.regenT -= dt * (0.9 + this.V * 1.5) * (this.sb?.regenMul ?? 1);
    // A healthy galaxy feeds its nucleus steadily (stellar winds, gas recycling).
    if (this.sb) {
      // Free mode lasts for hours: much slower growth, flattening past ~10^10 M☉.
      this.M += (this.M * 0.0005 * this.V * this.V * dt) / (1 + this.M / 5e10);
      this.game.bus.emit('massChanged', { mass: this.M });
    } else if (this.state === 'feed' || this.state === 'grow1' || this.state === 'grow2' || this.state === 'satellite') {
      this.M += this.M * 0.006 * this.V * this.V * dt;
      this.game.bus.emit('massChanged', { mass: this.M });
    }
    if (this.regenT <= 0) {
      this.regenT = 7;
      if (this.clouds.filter((c) => c.alive).length < this.cloudN) this.spawnCloud();
    }
    this.clouds = this.clouds.filter((c) => c.alive);

    if (this.sb) {
      this.sb.update(dt, { t: this.t, V: this.V, Q: this.Q, M: this.M, cloudHovered: !!this.hover });
      this.S = this.sb.scale;
      if (this.web) this.web.alpha = this.sb.webAlpha();
    }
    this.updateEvents(dt);
    this.updateState(dt);
    this.render(dt);
    this.updateHud();
    if (Math.floor(this.t / 20) !== Math.floor((this.t - dt) / 20)) this.persist();
  }

  private channel(c: Cloud) {
    const g = this.game;
    c.infall = 0.0001;
    c.from.copy(c.pos);
    c.mass = this.sb ? this.M * 0.03 : this.M * (0.12 + 0.1 * this.V);
    this.cooldown = 0.6;
    this.idleHint = 0;
    g.audio.whoosh(0.3);
    g.pipe.final.shockwave(c.pos.clone(), 0.35, 0.8, 0.25);
    g.hud.floater(tr('CAYENDO HACIA EL NÚCLEO', 'FALLING TOWARD THE CORE'), c.pos.clone().add(new THREE.Vector3(0, 30, 0)), '#9fd6ff', 14, 1.4);
    g.hud.clearHint();
  }

  private consumeCloud(c: Cloud) {
    const g = this.game;
    c.alive = false;
    this.M += c.mass;
    g.bus.emit('massChanged', { mass: this.M });
    this.Q = clamp(this.Q + 0.28);
    this.feeds++;
    g.pipe.bloomBoost = 1;
    g.pipe.final.shockwave(new THREE.Vector3(), 0.4, 1.2, 0.3);
    g.audio.capture(0.9);
    if (this.sb) this.sb.onCloud();
    else g.hud.floater(`+${formatSolar(c.mass)} M☉`, new THREE.Vector3(0, 60, 0), '#ffd9a0', 16, 1.6);
    if (this.Q > 0.75)
      this.tutorial(
        'g_vent',
        tr(
          `El cuásar se está sobrecalentando. Mantén <kbd>${g.input.touchMode ? 'CHORROS' : 'CLIC DER'}</kbd> para liberar energía por los chorros. Si llega al máximo, expulsará el gas de tu galaxia.`,
          `The quasar is overheating. Hold <kbd>${g.input.touchMode ? 'JETS' : 'R-CLICK'}</kbd> to release energy through the jets. If it peaks, it will blow the gas out of your galaxy.`,
        ),
        9,
      );
  }

  private outburst() {
    const g = this.game;
    this.Q = 0.35;
    const orbiting = this.clouds.filter((c) => c.alive && c.infall === 0).sort((a, b) => a.a - b.a).slice(0, 3);
    for (const c of orbiting) c.alive = false;
    this.V = Math.max(0, this.V - 0.2);
    g.pipe.final.doFlash(0.5, 0xd0c0ff);
    g.pipe.final.shockwave(new THREE.Vector3(), 1.2, 2.5, 1.5);
    g.shake(0.5);
    g.audio.boom();
    g.prog.discover('feedback');
    if (this.sb) g.hud.toast('✺', tr('El cuásar expulsó el gas', 'The quasar blew the gas away'), tr('Se perdieron algunas nubes. Usa los chorros antes de que llegue al máximo.', 'Some clouds were lost. Use the jets before it peaks.'));
    else g.hud.titleCard(tr('Retroalimentación', 'Feedback'), tr('EL CUÁSAR EXPULSA EL GAS', 'THE QUASAR BLOWS THE GAS AWAY'), tr('Se perdieron nubes: tu galaxia formará menos estrellas', 'Clouds were lost: your galaxy will form fewer stars'), 4);
  }

  private updateEvents(dt: number) {
    const g = this.game;
    // Supernova flashes all over the disc: the galaxy is alive.
    this.flashT -= dt * (0.5 + this.V);
    if (this.flashT <= 0) {
      this.flashT = this.rng.range(0.4, 1.4);
      const i = this.rng.int(0, 399);
      const s = this.gal.samples;
      const p = this.gal.orbitPos(s[i * 4], s[i * 4 + 1], s[i * 4 + 2], this.t);
      this.flashes.push({ pos: p, t: 0 });
    }
    this.flashes = this.flashes.filter((f) => (f.t += dt) < 2.5);
    if (this.state === 'merger' || this.state === 'ending' || this.cinematic) return;
    this.eventT -= dt;
    if (this.eventT <= 0 && !this.clusterInfall) {
      this.eventT = this.sb ? this.sb.clusterInterval(() => this.rng.next()) : this.rng.range(35, 55);
      this.clusterInfall = { th: this.rng.range(0, TAU), r: this.gal.params.radius * 0.7, alive: true, mass: this.M * (this.sb ? 0.02 : 0.1), pos: new THREE.Vector3() };
      if (!this.sb)
        g.hud.toast(
          '✦',
          tr('Un cúmulo globular cae hacia ti', 'A globular cluster is falling in'),
          g.input.touchMode ? tr('Se dirige al centro. Tócalo para acelerarlo.', "It's heading for the center. Tap it to speed it up.") : tr('Se dirige al centro. Haz clic sobre él para acelerarlo.', "It's heading for the center. Click it to speed it up."),
        );
    }
    const ci = this.clusterInfall;
    if (ci) {
      ci.r -= dt * 22 * this.S;
      ci.th += dt * (40 / Math.max(ci.r, 30));
      ci.pos.set(Math.cos(ci.th) * ci.r, 20, Math.sin(ci.th) * ci.r);
      if (this.sb && ci.r > 60) {
        const how = g.input.touchMode ? tr('tócalo', 'tap') : tr('haz clic', 'click');
        g.hud.marker('cluster', ci.pos.clone().add(new THREE.Vector3(0, 30 * this.S, 0)), tr(`Cúmulo globular<div class="m">${how} para acelerarlo · da ✦</div>`, `Globular cluster<div class="m">${how} to speed it up · gives ✦</div>`), 'prey');
      }
      if (ci.r < 15) {
        this.M += ci.mass;
        g.bus.emit('massChanged', { mass: this.M });
        g.prog.add('captures', 1);
        g.audio.capture(1);
        g.pipe.final.shockwave(new THREE.Vector3(), 0.5, 1, 0.4);
        if (this.sb) this.sb.onCluster(new THREE.Vector3(0, 20, 0));
        else g.hud.floater(`${tr('CÚMULO', 'CLUSTER')} · +${formatSolar(ci.mass)} M☉`, new THREE.Vector3(0, 60, 0), '#ffe0a0', 16, 1.8);
        this.clusterInfall = null;
      }
    }
  }

  private updateState(dt: number) {
    const g = this.game;
    switch (this.state) {
      case 'feed':
        if (this.feeds >= 3) {
          this.state = 'grow1';
          g.setStage(15);
          g.hud.titleCard(stageDef(15).name, tr('ETAPA 15', 'STAGE 15'), tr('Un sistema vivo que sigue evolucionando', 'A living system that keeps evolving'), 4);
          this.wait(4.5).then(() => {
            if (!this.alive) return;
            const key = g.input.touchMode ? tr('CHORROS', 'JETS') : tr('CLIC DER', 'R-CLICK');
            g.hud.hint(
              tr(
                `Sigue atrayendo nubes y presta atención a dos cosas: si la <b>actividad del cuásar</b> sube mucho, mantén <kbd>${key}</kbd> para liberarla; con la <b>formación estelar</b> alta, tu galaxia te alimenta sola. No consumas todo el gas de golpe.`,
                `Keep drawing in clouds and watch two things: if <b>quasar activity</b> climbs high, hold <kbd>${key}</kbd> to release it; with high <b>star formation</b>, your galaxy feeds you on its own. Don't use up all the gas at once.`,
              ),
              12,
            );
          });
          this.persist(1);
        }
        break;
      case 'grow1':
        if (this.M >= GOAL1) this.startSatellite();
        break;
      case 'satellite':
        this.updateSatellite(dt);
        break;
      case 'grow2':
        if (this.M >= GOAL2) this.startMerger();
        break;
      case 'merger':
        this.updateMerger(dt);
        break;
    }
    if (this.frenzy > 0) {
      this.frenzy -= dt;
      const dm = this.M * 0.14 * dt;
      this.M += dm;
      g.bus.emit('massChanged', { mass: this.M });
      this.Q = 1;
      if (this.frenzy <= 0) {
        this.Q = 0.4;
        this.endGame();
      }
    }
  }

  // ------------------------------------------------------------------ satellite galaxy
  private startSatellite() {
    const g = this.game;
    this.state = 'satellite';
    this.sat = new GalaxyField({ count: Math.floor(g.quality.profile.galaxyStars * 0.08), radius: 160, arms: 2, twist: 2, ecc: 0.1, pattern: 0.02, vel: 20, bulge: 0.5, hueShift: 0.4 }, this.rng);
    this.sat.orient.setFromMatrix4(new THREE.Matrix4().makeRotationX(0.6));
    this.group.add(this.sat);
    this.satT = 0;
    g.hud.toast('◉', tr('Galaxia satélite', 'Satellite galaxy'), tr('Una galaxia enana cae hacia la tuya', 'A dwarf galaxy is falling toward yours'));
    g.hud.titleCard(tr('Galaxia satélite', 'Satellite galaxy'), tr('UNA VISITA', 'A VISITOR'), tr('Tu gravedad la está atrayendo', 'Your gravity is drawing it in'), 3.5);
    this.tutorial(
      'g_sat',
      g.input.touchMode
        ? tr('Cuando la galaxia enana esté cerca, tócala para atraerla con tu marea.', 'When the dwarf galaxy is close, tap it to draw it in with your tide.')
        : tr('Cuando la galaxia enana esté cerca, haz <kbd>CLIC</kbd> sobre ella para atraerla con tu marea.', 'When the dwarf galaxy is close, <kbd>CLICK</kbd> on it to draw it in with your tide.'),
      8,
    );
  }

  private updateSatellite(dt: number) {
    const g = this.game;
    const s = this.sat!;
    this.satT += dt;
    const ang = 0.8 + this.satT * 0.1;
    const dist = Math.max(250, 1500 - this.satT * 55);
    this.satPos.set(Math.cos(ang) * dist, 80, Math.sin(ang) * dist);
    s.center.copy(this.satPos);
    s.update(this.t, g.pipe.renderer.getPixelRatio());
    const near = dist < 900;
    if (near) {
      const sub = this.satEaten > 0 ? tr('uniéndose a ti', 'joining you') : g.input.touchMode ? tr('tócala', 'tap it') : tr('haz clic', 'click it');
      g.hud.marker('sat', this.satPos.clone().add(new THREE.Vector3(0, 120, 0)), `${tr('Galaxia enana', 'Dwarf galaxy')}<div class="m">${sub}</div>`, 'prey');
    }
    if (near && this.satEaten === 0 && g.input.clicked && Math.hypot(this.satPos.x - g.input.pointerWorld.x, this.satPos.z - g.input.pointerWorld.z) < 260) {
      this.satEaten = 0.0001;
      g.audio.whoosh(0.35);
      g.shake(0.3);
    }
    if (this.satEaten > 0) {
      this.satEaten += dt / 8;
      // tidal stretching towards the centre (in the satellite's own frame)
      s.setTidal(-this.satPos.x, -this.satPos.z, this.satEaten * 3);
      s.fade = 1 - Math.max(0, this.satEaten - 0.6) / 0.4;
      const dm = this.M * 0.08 * dt;
      this.M += dm;
      g.bus.emit('massChanged', { mass: this.M });
    }
    if (this.satEaten >= 1) {
      this.group.remove(s);
      s.dispose();
      this.sat = null;
      for (let i = 0; i < 4; i++) this.spawnCloud();
      this.state = 'grow2';
      g.hud.titleCard(tr('Una nueva familia de estrellas', 'A new family of stars'), tr('LA GALAXIA SATÉLITE SE UNE A TI', 'THE SATELLITE GALAXY JOINS YOU'), tr('Sus estrellas forman ahora un halo alrededor de tu galaxia', 'Its stars now form a halo around your galaxy'), 4);
      g.prog.discover('merger');
      this.persist(2);
    }
  }

  // ------------------------------------------------------------------ galaxy collision
  private async startMerger() {
    const g = this.game;
    this.state = 'merger';
    this.cinematic = true;
    this.compMass = this.M * 1.3;
    this.comp = new GalaxyField({ count: Math.floor(g.quality.profile.galaxyStars * 0.55), radius: 520, arms: 2, twist: 1.8, ecc: 0.33, pattern: 0.012, vel: 40, bulge: 0.2, hueShift: -0.4 }, this.rng);
    this.comp.orient.setFromMatrix4(new THREE.Matrix4().makeRotationX(0.7).multiply(new THREE.Matrix4().makeRotationZ(0.4)));
    this.group.add(this.comp);
    this.compT = 0;
    g.pipe.final.letterboxTarget = 1;
    g.audio.swell(20);
    g.hud.titleCard(tr('Encuentro galáctico', 'Galactic encounter'), tr('EL GRAN FINAL', 'THE GRAND FINALE'), tr('Otra galaxia, con su propio agujero negro supermasivo, viene a tu encuentro', 'Another galaxy, with its own supermassive black hole, is coming to meet you'), 5);
    g.rig.animate({ distance: 4200, pitch: 1.0, yaw: g.rig.state.yaw + 0.6 }, 6);
    g.prog.discover('merger');
  }

  private updateMerger(dt: number) {
    const g = this.game;
    const c = this.comp!;
    this.compT += dt;
    const T = 26;
    const k = clamp(this.compT / T);
    // Approach along a curving path, then sink to the centre.
    const ang = -0.9 + k * 2.6;
    const dist = lerp(3200, 0, easeInOut(k));
    const pos = new THREE.Vector3(Math.cos(ang) * dist, lerp(500, 0, k), Math.sin(ang) * dist);
    c.center.copy(pos);
    c.update(this.t, g.pipe.renderer.getPixelRatio());
    const tidal = Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.9;
    this.gal.setTidal(pos.x, pos.z, tidal);
    c.setTidal(-pos.x, -pos.z, tidal * 1.2);
    c.fade = 1 - clamp((k - 0.75) / 0.25);
    this.sizeBoost = lerp(1, 1.25, clamp((k - 0.6) / 0.4));
    this.gal.sizeMul = this.sizeBoost;
    // The other supermassive black hole
    const rsC = 3 * Math.pow(this.compMass / this.M, 1 / 3);
    g.pipe.bhPass.rivals = dist > 10 ? [{ pos: pos.clone(), rs: rsC }] : [];
    if (dist > 60) g.hud.marker('smbh2', pos.clone().add(new THREE.Vector3(0, 60, 0)), `${tr('Agujero negro supermasivo', 'Supermassive black hole')}<div class="m">${formatSolar(this.compMass)} M☉</div>`, 'neutral');
    if (k > 0.25 && k < 0.3) g.rig.animate({ distance: 2400, pitch: 0.9 }, 8);
    if (k > 0.55 && !this.spin) {
      g.pipe.final.letterboxTarget = 0.6;
      this.cinematic = false;
      this.buildSpin();
      g.audio.chirp(T * 0.45);
      this.tutorial(
        'g_spin',
        tr(
          `Los dos agujeros negros supermasivos se hunden hacia el centro. Alinea sus espines: pulsa <kbd>${g.input.touchMode ? 'ATRAER' : 'ESPACIO'}</kbd> cuando la aguja pase por la zona verde.`,
          `The two supermassive black holes sink toward the center. Align their spins: press <kbd>${g.input.touchMode ? 'DRAW IN' : 'SPACE'}</kbd> when the needle crosses the green zone.`,
        ),
        8,
      );
    }
    if (this.spin) {
      const sp = this.spin;
      sp.cd = Math.max(0, sp.cd - dt);
      sp.needle = (sp.needle + dt * (2.4 + k * 4)) % TAU;
      const diff = Math.abs(((sp.needle - sp.zone + Math.PI * 3) % TAU) - Math.PI);
      if (g.input.primaryPressed && sp.cd <= 0 && sp.aligned < 3) {
        sp.cd = 0.35;
        if (diff < 0.42) {
          sp.aligned++;
          sp.zone = (sp.zone + this.rng.range(1.6, 4)) % TAU;
          g.audio.hit('perfect', sp.aligned * 2);
        } else g.audio.hit('miss');
      }
      sp.needleEl.setAttribute('transform', `rotate(${(sp.needle * 180) / Math.PI})`);
      const a0 = sp.zone - 0.42 - Math.PI / 2;
      const a1 = sp.zone + 0.42 - Math.PI / 2;
      sp.zoneEl.setAttribute('d', `M ${Math.cos(a0) * 50} ${Math.sin(a0) * 50} A 50 50 0 0 1 ${Math.cos(a1) * 50} ${Math.sin(a1) * 50}`);
      sp.pips.textContent = [0, 1, 2].map((i) => (i < sp.aligned ? '●' : '○')).join(' ');
      const gw = g.pipe.final.gw;
      gw.pos.set(0, 0, 0);
      gw.amp = Math.pow(clamp((k - 0.55) / 0.45), 2) * 2.5;
      gw.phase += dt * (6 + k * 30);
    }
    if (this.compT >= T) this.finishMerger();
  }

  private buildSpin() {
    const w = h('div', 'panel', `<div class="label" style="margin-bottom:6px">${tr('Alineación de espines', 'Spin alignment')}</div>
      <svg width="130" height="130" viewBox="-65 -65 130 130">
        <circle r="50" fill="none" stroke="rgba(200,220,255,0.25)" stroke-width="2"/>
        <path class="zone" fill="none" stroke="#7dffb2" stroke-width="8" stroke-linecap="round"/>
        <line class="needle" x1="0" y1="0" x2="0" y2="-54" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <circle r="6" fill="#fff"/>
      </svg><div class="pips label" style="text-align:center;margin-top:4px">○ ○ ○</div>`);
    w.style.padding = '12px 14px';
    this.game.hud.widget.appendChild(w);
    this.spin = { needle: 0, zone: this.rng.range(0, TAU), aligned: 0, cd: 0, el: w, needleEl: w.querySelector('.needle') as SVGElement, zoneEl: w.querySelector('.zone') as SVGPathElement, pips: w.querySelector('.pips') as HTMLElement };
  }

  private finishMerger() {
    const g = this.game;
    const perfect = (this.spin?.aligned ?? 0) >= 3;
    this.spin?.el.remove();
    this.spin = null;
    if (this.comp) {
      this.group.remove(this.comp);
      this.comp.dispose();
      this.comp = null;
    }
    g.pipe.bhPass.rivals = [];
    g.pipe.final.gw.amp = 0;
    this.M = (this.M + this.compMass) * (perfect ? 0.96 : 0.95);
    g.bus.emit('massChanged', { mass: this.M });
    g.prog.add('bhMerged', 1);
    if (perfect) g.prog.achieve('aligned');
    g.prog.achieve('galaxy_merge');
    this.gal.setTidal(0, 0, 0);
    g.pipe.final.doFlash(1.1, 0xe8e0ff);
    g.pipe.final.shockwave(new THREE.Vector3(), 1.6, 3, 2);
    g.pipe.bloomBoost = 3;
    g.shake(1);
    g.audio.ringdown();
    g.audio.boom();
    g.hud.titleCard(tr('Un solo corazón', 'One single heart'), tr('FUSIÓN DE SUPERMASIVOS', 'SUPERMASSIVE MERGER'), tr('El gas de ambas galaxias cae en espiral: comienza la fase de cuásar', 'Gas from both galaxies spirals inward: the quasar phase begins'), 5);
    for (let i = 0; i < 6; i++) this.spawnCloud();
    this.frenzy = 9;
    this.state = 'ending';
    this.cinematic = true;
    g.rig.animate({ distance: 1800, pitch: 0.7 }, 5);
  }

  private async endGame() {
    const g = this.game;
    g.hud.feel(tr(`Ahora guardo ${formatSolar(this.M)} masas solares en mi interior.`, `I now hold ${formatSolar(this.M)} solar masses within me.`), 5);
    await this.wait(4);
    // Final zoom out: the galaxy is one of many.
    g.sky.set(SKY_PRESETS.intergalactic, 3);
    this.buildWeb();
    g.prog.discover('cosmicweb');
    g.rig.animate({ distance: 90000, pitch: 1.1, yaw: g.rig.state.yaw + 0.8 }, 12, easeInOut);
    g.hud.titleCard(tr('La red cósmica', 'The cosmic web'), tr('MÁS ALLÁ DE TU GALAXIA', 'BEYOND YOUR GALAXY'), tr('Tu galaxia es un pequeño punto de luz entre miles de millones', 'Your galaxy is a tiny point of light among billions'), 6);
    await this.wait(12.5);
    const time = g.prog.run?.time ?? 0;
    g.finishRun();
    // The journey is over: the run is cleared and the galaxy lives on in free mode.
    const reward = g.completeStory(this.M, this.gal.params);
    g.prog.clearRun();
    g.pipe.final.letterboxTarget = 0;
    g.pause(false);
    g.menus.openEnding(
      this.M,
      time,
      reward,
      () => g.startSandbox(),
      () => g.quitToTitle(),
    );
  }

  /** Cosmic web of galaxies; `clearR` keeps the space around our own galaxy empty. */
  private buildWeb(clearR = 0) {
    const g = this.game;
    const n = Math.floor(9000 * g.quality.profile.particles + 2000);
    this.web = this.track(new SpriteBatch(n + 200, 'glow', { stretch: 0 }));
    this.group.add(this.web.mesh);
    const nodes: THREE.Vector3[] = [new THREE.Vector3()];
    for (let i = 0; i < 40; i++) nodes.push(new THREE.Vector3(this.rng.gauss(0, 50000), this.rng.gauss(0, 12000), this.rng.gauss(0, 50000)));
    const w = this.web;
    w.begin();
    let placed = 0;
    for (let i = 0; i < nodes.length && placed < n; i++) {
      const a = nodes[i];
      const near = nodes.map((b, j) => ({ b, j, d: a.distanceTo(b) })).filter((x) => x.j !== i).sort((x, y) => x.d - y.d).slice(0, 3);
      for (const { b } of near) {
        const segN = Math.floor(n / (nodes.length * 3));
        for (let k = 0; k < segN && placed < n; k++) {
          const f = this.rng.next();
          const p = a.clone().lerp(b, f);
          const spread = 1400 * (0.3 + Math.sin(f * Math.PI));
          p.set(p.x + this.rng.gauss(0, spread), p.y + this.rng.gauss(0, spread), p.z + this.rng.gauss(0, spread));
          placed++;
          if (clearR && p.length() < clearR) continue;
          w.push(p.x, p.y, p.z, 0, 0, 0, 0.55, 0.6, 1, 0.5, this.rng.range(120, 380));
        }
      }
      // cluster of galaxies at the node
      if (clearR && i === 0) continue;
      for (let k = 0; k < 20; k++) w.push(a.x + this.rng.gauss(0, 900), a.y + this.rng.gauss(0, 900), a.z + this.rng.gauss(0, 900), 0, 0, 0, 1, 0.85, 0.7, 0.9, this.rng.range(250, 600));
    }
    w.end();
  }

  private persist(galaxyStage?: number) {
    if (this.sb) return;
    const cur = this.game.prog.run?.carry.galaxyStage ?? 0;
    this.game.saveCarry({ bhMass: this.M, stage: this.game.stage, galaxyStage: galaxyStage ?? cur });
  }

  exit() {
    this.jetLoop?.stop(0.3);
    this.spin?.el.remove();
    this.sb?.dispose();
    this.gal.dispose();
    this.sat?.dispose();
    this.comp?.dispose();
    super.exit();
  }

  // ------------------------------------------------------------------ render & HUD
  private render(dt: number) {
    const g = this.game;
    const glow = this.glow;
    const soft = this.soft;
    glow.begin();
    soft.begin();
    // Bulge & nucleus glow
    const act = this.Q + this.frenzy * 0.2;
    const cs = Math.pow(this.S, 0.7); // gameplay objects grow a bit slower than the galaxy
    glow.push(0, 0, 0, 0, 0, 0, 1, 0.8, 0.55, 0.22, 140 * this.sizeBoost * this.S);
    glow.push(0, 0, 0, 0, 0, 0, 1, 0.9, 0.75, 0.25 + act * 0.5, 30 * Math.sqrt(this.S));
    // Clouds
    for (const c of this.clouds) {
      const sel = c === this.hover;
      for (let k = 0; k < 7; k++) {
        const a = k * 2.39996 + c.th0;
        const rr = (8 + (k % 3) * 9) * cs;
        soft.push(c.pos.x + Math.cos(a) * rr, c.pos.y, c.pos.z + Math.sin(a) * rr, 0, 0, 0, c.color[0], c.color[1], c.color[2], sel ? 0.35 : 0.2, 30 * cs);
      }
      glow.push(c.pos.x, c.pos.y, c.pos.z, 0, 0, 0, c.color[0], c.color[1], c.color[2], sel ? 1.2 : 0.6, 14 * cs);
      if (c.infall > 0) {
        // Luminous gas stream along the spiral path already travelled.
        const a0 = Math.atan2(c.from.z, c.from.x);
        const r0 = Math.hypot(c.from.x, c.from.z);
        const now = Math.min(1, c.infall);
        for (let k = 0; k < 60; k++) {
          const f = (k / 60) * now;
          const e = easeInOut(f);
          const rr = r0 * Math.pow(1 - e, 1.3);
          const aa = a0 + e * 2.2;
          const fade = 0.2 + 0.8 * (f / Math.max(now, 1e-3));
          glow.push(Math.cos(aa) * rr, c.from.y * (1 - e), Math.sin(aa) * rr, 0, 0, 0, c.color[0], c.color[1] * 0.9 + 0.1, c.color[2], fade * 0.7, (10 + (1 - fade) * 8) * cs);
        }
        glow.push(c.pos.x, c.pos.y, c.pos.z, 0, 0, 0, 1, 0.9, 0.8, 1.2, 22 * cs);
      }
    }
    // Supernova flashes
    for (const f of this.flashes) {
      const k = f.t / 2.5;
      glow.push(f.pos.x, f.pos.y, f.pos.z, 0, 0, 0, 0.9, 0.95, 1, (1 - k) * (k < 0.05 ? k * 20 : 1) * 1.5, 10 + k * 20);
    }
    // Infalling globular cluster
    if (this.clusterInfall) {
      const p = this.clusterInfall.pos;
      for (let k = 0; k < 30; k++) {
        const a = k * 2.39996;
        const rr = (k % 5) * 3 * cs;
        glow.push(p.x + Math.cos(a) * rr, p.y, p.z + Math.sin(a) * rr, 0, 0, 0, 1, 0.9, 0.7, 0.8, 5 * cs);
      }
      glow.push(p.x, p.y, p.z, 0, 0, 0, 1, 0.85, 0.6, 0.6, 30 * cs);
    }
    // Radio lobes inflated by the jets
    const L = 700 * this.S;
    const lobeS = (60 + this.lobes * 160 + this.frenzy * 20) * this.S;
    if (this.lobes > 0.01 || this.frenzy > 0) {
      for (const s of [1, -1]) {
        for (let k = 0; k < 10; k++) {
          const a = k * 2.39996 + this.t * 0.05;
          const rr = lobeS * 0.35 * ((k % 4) / 4);
          soft.push(Math.cos(a) * rr, s * (L + lobeS * 0.3) + Math.sin(a) * rr, Math.sin(a * 1.3) * rr, 0, 0, 0, 0.55, 0.45, 1, 0.12, lobeS * 0.7);
        }
      }
    }
    glow.end();
    soft.end();

    const cam = g.camera.position;
    const up = new THREE.Vector3(0, 1, 0);
    const p = Math.max(this.jetPower, this.frenzy > 0 ? 1 : 0);
    this.jetUp.set(new THREE.Vector3(0, 8, 0), up, L, 18 * cs, p * 1.2, this.t, cam);
    this.jetDown.set(new THREE.Vector3(0, -8, 0), up.clone().negate(), L, 18 * cs, p * 1.2, this.t, cam);

    const bh = g.pipe.bhPass;
    bh.diskIntensity = damp(bh.diskIntensity, 0.55 + act * 0.8, 2, dt);
    bh.diskHeat = 0.6 + act * 0.3;
    bh.flow = 1 + act;

    if (this.hover && !this.cinematic) {
      this.hoverRing.position.copy(this.hover.pos);
      this.hoverRing.setWorldRadius(38 * cs);
      this.hoverRing.opacity = 0.7;
    } else this.hoverRing.opacity = 0;
    this.hoverRing.tick(this.t, g.camera);

    // Every cloud that can be channelled wears a pulsing marker ring.
    const showMarkers = !this.cinematic && this.state !== 'merger' && this.state !== 'ending';
    let ri = 0;
    for (const c of this.clouds) {
      if (!c.alive || c.infall > 0 || !showMarkers) continue;
      let ring = this.cloudRings[ri];
      if (!ring) {
        ring = new Ring(0xbfe0ff, false, 0.035);
        this.cloudRings.push(ring);
        this.group.add(ring);
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3 + c.th0 * 5);
      ring.position.copy(c.pos);
      ring.setWorldRadius((34 + pulse * 10) * cs);
      ring.setColor(c === this.hover ? 0xffffff : 0x9fd6ff);
      ring.opacity = c === this.hover ? 1 : 0.35 + pulse * 0.35;
      ring.tick(this.t, g.camera);
      ri++;
    }
    for (; ri < this.cloudRings.length; ri++) this.cloudRings[ri].opacity = 0;
  }

  private updateHud() {
    const g = this.game;
    if (this.sb) return this.sb.updateHud({ t: this.t, V: this.V, Q: this.Q, M: this.M, cloudHovered: !!this.hover }, this.jetting, this.cooldown);
    g.hud.setMass(formatSolar(this.M), 'M☉', tr('agujero negro supermasivo', 'supermassive black hole'));
    const touch = g.input.touchMode;
    const hot = touch
      ? tr('El cuásar está al límite: mantén el botón 2 para liberar energía', 'The quasar is at its limit: hold button 2 to release energy')
      : tr('El cuásar está al límite: mantén CLIC DERECHO para liberar energía', 'The quasar is at its limit: hold RIGHT CLICK to release energy');
    const obj: Record<GState, [string, number | null]> = {
      reveal: ['', null],
      feed: [
        `${touch ? tr('Toca una nube marcada para atraerla', 'Tap a marked cloud to draw it in') : tr('Haz clic cerca de una nube marcada (o pulsa ESPACIO) para atraerla', 'Click near a marked cloud (or press SPACE) to draw it in')} · ${this.feeds}/3`,
        this.feeds / 3,
      ],
      grow1: [this.Q > 0.75 ? hot : tr('Atrae nubes hasta 10 millones de M☉ · sin agotar el gas', 'Draw in clouds up to 10 million M☉ · without using up the gas'), clamp(Math.log(this.M / 1e6) / Math.log(GOAL1 / 1e6))],
      satellite: [
        this.satEaten > 0
          ? tr('La galaxia satélite se une a la tuya…', 'The satellite galaxy is joining yours…')
          : this.satPos.length() < 900
            ? touch
              ? tr('Toca la galaxia enana (etiqueta verde)', 'Tap the dwarf galaxy (green label)')
              : tr('Haz clic sobre la galaxia enana (etiqueta verde)', 'Click the dwarf galaxy (green label)')
            : tr('Una galaxia enana se acerca… espera a que esté cerca', 'A dwarf galaxy is approaching… wait until it is close'),
        this.satEaten,
      ],
      grow2: [this.Q > 0.75 ? hot : `${tr('Atrae nubes hasta', 'Draw in clouds up to')} ${formatSolar(GOAL2)} M☉`, clamp(Math.log(this.M / GOAL1) / Math.log(GOAL2 / GOAL1))],
      merger: [
        this.spin
          ? `${touch ? tr('Pulsa el botón', 'Press the button') : tr('Pulsa ESPACIO', 'Press SPACE')} ${tr('cuando la aguja pase por la zona verde', 'when the needle crosses the green zone')} (${this.spin.aligned}/3)`
          : tr('Encuentro galáctico en curso…', 'Galactic encounter in progress…'),
        clamp(this.compT / 26),
      ],
      ending: [tr('Fase de cuásar', 'Quasar phase'), null],
      sandbox: ['', null],
    };
    const [txt, p] = obj[this.state];
    g.hud.setObjective(txt, p);
    g.hud.setMeters([
      { id: 'q', label: tr('Actividad del cuásar', 'Quasar activity'), value: this.Q, color: this.Q > 0.8 ? '#ff5a3c' : '#c9a8ff', warn: this.Q > 0.85 },
      { id: 'v', label: tr('Formación estelar', 'Star formation'), value: this.V, color: '#8fd3ff', warn: this.V < 0.3 },
    ]);
    this.abilities([
      { id: 'feed', key: touch ? tr('TOCAR', 'TAP') : tr('CLIC / ESPACIO', 'CLICK / SPACE'), name: tr('Atraer nube', 'Draw in cloud'), charge: 1 - this.cooldown },
      { id: 'jets', key: touch ? 'BTN 2' : tr('CLIC DER', 'R-CLICK'), name: tr('Chorros · liberar energía', 'Jets · release energy'), active: this.jetting },
    ]);
    g.audio.setIntensity(0.35 + this.Q * 0.4 + (this.state === 'merger' ? 0.3 : 0));
  }
}
