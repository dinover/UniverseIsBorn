import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { SandboxState } from '../../persistence/SaveSystem';
import type { GalaxyField } from '../../vfx/GalaxyField';
import { h } from '../../ui/Hud';
import { TAU, damp, formatBig, formatTime } from '../../utils/math';
import { CONSTELLATION_BONUS, OBS_ENERGY_EVERY, OBS_ENERGY_MAX, obsOf, type SandboxEconomy } from './Economy';
import { JET_OPTIONS, PALETTES } from './Catalog';
import { MgHud, type Minigame, type MinigameCtx, type MinigameResult } from './minigames/Minigame';
import { SupernovaHunt } from './minigames/SupernovaHunt';
import { StarMemory } from './minigames/StarMemory';
import { ConstellationGame } from './minigames/ConstellationGame';
import { StarBurst } from './minigames/StarBurst';
import { DwarfMerger } from './minigames/DwarfMerger';
import { Slingshot } from './minigames/Slingshot';
import { CONSTELLATIONS, drawFigure, placeFigure } from './minigames/constellations';
import { int, tr, withText, type Bi } from '../../i18n/i18n';

export interface MinigameDef {
  id: string;
  name: string;
  icon: string;
  /** Galaxy level that unlocks it. */
  level: number;
  /** One line for the card (the full description is its tooltip). */
  short: string;
  desc: string;
  /** 'sky': played in the observatory view; 'galaxy': the camera goes back to the galaxy. */
  scene: 'sky' | 'galaxy';
  make: (ctx: MinigameCtx) => Minigame;
  best: (v: number) => string;
}

const pts = (v: number) => `${int(v)} pts`;

type GameBase = Omit<MinigameDef, 'name' | 'short' | 'desc'>;
const game = (b: GameBase, name: Bi, short: Bi, desc: Bi): MinigameDef => withText(b, { name, short, desc });

export const MINIGAMES: MinigameDef[] = [
  game(
    { id: 'hunt', icon: '✸', level: 1, scene: 'galaxy', make: (c) => new SupernovaHunt(c), best: pts },
    { es: 'Lluvia de supernovas', en: 'Supernova Shower' },
    { es: 'Atrapa supernovas justo cuando estallan. Combos, doradas y trampas.', en: 'Catch supernovae right as they burst. Combos, golden ones and decoys.' },
    {
      es: 'Atrapa cada supernova justo cuando estalla. Encadena combos, busca las doradas y no toques las estrellas estables.',
      en: 'Catch each supernova right as it bursts. Chain combos, look for the golden ones and leave the steady stars alone.',
    },
  ),
  game(
    { id: 'memory', icon: '♫', level: 2, scene: 'galaxy', make: (c) => new StarMemory(c), best: (v) => `${tr('nivel', 'level')} ${v}` },
    { es: 'Memoria estelar', en: 'Star Memory' },
    { es: 'Repite la melodía de las estrellas. Cada nivel da más.', en: "Echo the stars' melody. Each level pays more." },
    {
      es: 'Las estrellas cantan una melodía: repítela. Cada nivel suma una nota y da más polvo estelar que el anterior.',
      en: 'The stars sing a melody: sing it back. Each level adds a note and pays more stardust than the last.',
    },
  ),
  game(
    { id: 'constellations', icon: '✧', level: 3, scene: 'sky', make: (c) => new ConstellationGame(c), best: pts },
    { es: 'Constelaciones', en: 'Constellations' },
    { es: 'Dibuja constelaciones en tu cielo: +2% de producción cada una.', en: 'Draw constellations in your sky: +2% production each.' },
    {
      es: 'Encuentra figuras escondidas en el cielo y une sus estrellas. Cada constelación nueva queda en tu cielo y te da un +2% de producción para siempre.',
      en: 'Find figures hidden in the sky and connect their stars. Each new constellation stays in your sky and gives you +2% production forever.',
    },
  ),
  game(
    { id: 'burst', icon: '✺', level: 4, scene: 'galaxy', make: (c) => new StarBurst(c), best: pts },
    { es: 'Estrella explosiva', en: 'Star Burst' },
    { es: 'Comprime un núcleo al ritmo de sus latidos hasta que estalle.', en: 'Compress a core to the rhythm of its heartbeat until it bursts.' },
    {
      es: 'Vuela hasta una estrella y comprime su núcleo al ritmo de sus latidos, del hidrógeno al hierro… hasta que estalle.',
      en: 'Fly to a star and compress its core to the rhythm of its heartbeat, from hydrogen to iron… until it bursts.',
    },
  ),
  game(
    { id: 'dwarf', icon: '◉', level: 6, scene: 'galaxy', make: (c) => new DwarfMerger(c), best: pts },
    { es: 'Galaxias enanas', en: 'Dwarf Galaxies' },
    { es: 'Atrae tres galaxias enanas con tu marea gravitatoria.', en: 'Draw in three dwarf galaxies with your gravitational tide.' },
    {
      es: 'Tres galaxias enanas caen hacia la tuya. Atráelas con tu marea pulsando cuando la aguja cruce la zona verde.',
      en: 'Three dwarf galaxies are falling toward yours. Draw them in with your tide by pressing when the needle crosses the green zone.',
    },
  ),
  game(
    { id: 'sling', icon: '☄', level: 8, scene: 'galaxy', make: (c) => new Slingshot(c), best: pts },
    { es: 'Honda gravitatoria', en: 'Gravity Slingshot' },
    { es: 'Lanza cometas y curva su camino con la gravedad.', en: 'Launch comets and let gravity bend their path.' },
    {
      es: 'Lanza cometas y deja que la gravedad curve su camino para recoger polvo estelar. Pasar rozando el agujero negro multiplica lo que reúnes.',
      en: 'Launch comets and let gravity bend their path to collect stardust. Skimming past the black hole multiplies what you gather.',
    },
  ),
];

/** Practice (no energy left) pays this fraction of the reward. */
const PRACTICE = 0.2;

export interface ObservatoryHost {
  game: Game;
  eco: SandboxEconomy;
  state: SandboxState;
  group: THREE.Group;
  gal: GalaxyField;
  scale: () => number;
  view: () => number;
  time: () => number;
  earn: (amount: number) => void;
  save: () => void;
  /** Freezes the galaxy's own gameplay (clouds, jets, zoom) while the observatory is open. */
  setBusy: (v: boolean) => void;
  onClosed: () => void;
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

/**
 * The observatory: a calm view of the sky above your galaxy where your constellations
 * live (they are only visible from here) and the hub of the free-mode minigames.
 * Playing costs one observation energy (5 max, +1 every 8 min, also while away);
 * without energy you can still practise for a fraction of the reward.
 */
export class Observatory {
  isOpen = false;
  private root: HTMLElement;
  private menu: HTMLElement;
  private cards: HTMLElement;
  private energyEl: HTMLElement;
  private sky: HTMLCanvasElement;
  private sg: CanvasRenderingContext2D;
  private layer: HTMLElement;
  private hud: MgHud;
  private resultEl: HTMLElement;
  private active: Minigame | null = null;
  private activeDef: MinigameDef | null = null;
  private practice = false;
  private fade = 1;
  private uiT = 0;
  private onKey: (e: KeyboardEvent) => void;
  private seed = 1;

  constructor(private host: ObservatoryHost) {
    const ui = host.game.hud.root.parentElement!;
    this.root = h('div', 'obs');
    this.sky = h('canvas', 'obs-sky') as HTMLCanvasElement;
    this.sg = this.sky.getContext('2d')!;
    this.menu = h('div', 'obs-menu interactive');
    this.menu.innerHTML = `
      <div class="obs-top">
        <div><div class="label obs-title"></div><div class="obs-sub"></div></div>
        <div class="obs-energy"></div>
        <button class="obs-x">✕</button>
      </div>
      <div class="obs-cards"></div>`;
    this.cards = this.menu.querySelector('.obs-cards') as HTMLElement;
    this.energyEl = this.menu.querySelector('.obs-energy') as HTMLElement;
    this.menu.querySelector('.obs-x')!.addEventListener('click', () => this.close());
    this.cards.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-game]') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      b.blur();
      this.launch(b.dataset.game!);
    });
    this.layer = h('div', 'mg-layer interactive');
    this.hud = new MgHud(this.layer, () => this.quitGame());
    this.resultEl = h('div', 'mg-result interactive');
    this.root.append(this.sky, this.menu, this.layer, this.resultEl);
    ui.appendChild(this.root);

    const fwd = (fn: 'onDown' | 'onMove' | 'onUp') => (e: PointerEvent) => {
      if (!this.active || this.active.result) return;
      if (fn === 'onDown') {
        try {
          this.layer.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic or already released pointer: dragging still works without capture */
        }
      }
      this.active[fn](e.clientX, e.clientY);
    };
    this.layer.addEventListener('pointerdown', fwd('onDown'));
    this.layer.addEventListener('pointermove', fwd('onMove'));
    this.layer.addEventListener('pointerup', fwd('onUp'));
    this.layer.addEventListener('pointercancel', fwd('onUp'));
    this.layer.addEventListener('contextmenu', (e) => e.preventDefault());

    this.onKey = (e: KeyboardEvent) => {
      const g = this.host.game;
      if (g.mode !== 'playing') return;
      const k = e.key.toLowerCase();
      if (this.active && !this.active.result) {
        if (k === ' ' || k === 'enter' || /^[1-8]$/.test(k)) {
          e.preventDefault();
          if (!e.repeat) this.active.onKey(k);
        }
        return;
      }
      if (!this.isOpen) return;
      if (k === 'escape') {
        e.stopImmediatePropagation();
        if (this.resultEl.classList.contains('show')) this.backToMenu();
        else this.close();
      }
    };
    window.addEventListener('keydown', this.onKey, true);
    this.regen();
    this.onLanguage();
  }

  /** Rewrites the texts built once, and whatever screen is showing, in the current language. */
  onLanguage() {
    (this.menu.querySelector('.obs-title') as HTMLElement).textContent = tr('Observatorio', 'Observatory');
    (this.menu.querySelector('.obs-x') as HTMLElement).title = tr('Volver a la galaxia (O / Esc)', 'Back to the galaxy (O / Esc)');
    this.hud.onLanguage();
    if (this.isOpen && this.menu.classList.contains('show')) this.renderCards();
  }

  private get obs() {
    return obsOf(this.host.state);
  }

  /** Energy regenerates over real time, also while the game is closed. */
  regen() {
    const o = this.obs;
    const now = Date.now();
    if (o.energy >= OBS_ENERGY_MAX) {
      o.at = now;
      return;
    }
    const gained = Math.floor((now - o.at) / (OBS_ENERGY_EVERY * 1000));
    if (gained > 0) {
      o.energy = Math.min(OBS_ENERGY_MAX, o.energy + gained);
      o.at = o.energy >= OBS_ENERGY_MAX ? now : o.at + gained * OBS_ENERGY_EVERY * 1000;
    }
  }

  get energy() {
    this.regen();
    return this.obs.energy;
  }

  addEnergy(n: number) {
    this.regen();
    const o = this.obs;
    o.energy = Math.min(OBS_ENERGY_MAX, o.energy + n);
    if (o.energy >= OBS_ENERGY_MAX) o.at = Date.now();
  }

  /** Seconds until the next energy point (0 when full). */
  get nextEnergy() {
    this.regen();
    const o = this.obs;
    if (o.energy >= OBS_ENERGY_MAX) return 0;
    return Math.max(0, OBS_ENERGY_EVERY - (Date.now() - o.at) / 1000);
  }

  /** The observatory can be closed (no game running). */
  get canLeave() {
    return !this.active;
  }

  // ------------------------------------------------------------------ open / close
  open() {
    if (this.isOpen) return;
    const g = this.host.game;
    this.isOpen = true;
    this.host.setBusy(true);
    g.hud.show(false);
    g.audio.ui('open');
    this.root.classList.add('show');
    this.showMenu();
    this.skyPose();
    if (!g.prog.tutorialSeen('obs_intro')) {
      g.prog.markTutorial('obs_intro');
      g.hud.titleCard(tr('Observatorio', 'Observatory'), tr('TU CIELO', 'YOUR SKY'), tr('Tus constelaciones solo se ven desde aquí', 'Your constellations can only be seen from here'), 3.5);
    }
  }

  close() {
    if (!this.isOpen) return;
    if (this.active) this.endGame(true);
    const g = this.host.game;
    this.isOpen = false;
    this.resultEl.classList.remove('show');
    this.root.classList.remove('show');
    this.layer.classList.remove('show');
    g.hud.show(true);
    g.audio.ui('back');
    g.rig.autoOrbit = 0;
    g.rig.target.set(0, 0, 0);
    g.rig.followLambda = 3.5;
    g.rig.animate({ distance: this.host.view(), pitch: 0.95 }, 2.4);
    this.fade = 1;
    this.host.gal.fade = 1;
    this.host.setBusy(false);
    this.host.save();
    this.host.onClosed();
  }

  /** Camera low over the disc: your galaxy on the horizon, the sky (and your constellations) above. */
  private skyPose() {
    const g = this.host.game;
    const d = this.host.view() * 1.25;
    g.rig.followLambda = 1.5;
    g.rig.target.set(0, d * 0.094, 0);
    g.rig.animate({ distance: d, pitch: 0.086 }, 2.6);
    g.rig.autoOrbit = 0.012;
  }

  private showMenu() {
    this.menu.classList.add('show');
    this.layer.classList.remove('show');
    this.resultEl.classList.remove('show');
    this.renderCards();
  }

  private renderCards() {
    const o = this.obs;
    const L = this.host.eco.level;
    const e = this.energy;
    this.cards.innerHTML = MINIGAMES.map((d) => {
      const locked = L < d.level;
      const best = o.best[d.id];
      const st = o.stars[d.id] ?? 0;
      const extra =
        d.id === 'constellations'
          ? `<div class="obs-extra">${o.constellations.length}/${CONSTELLATIONS.length} ${tr('en tu cielo', 'in your sky')} · +${Math.round(o.constellations.length * CONSTELLATION_BONUS * 100)}% ${tr('de producción', 'production')}</div>`
          : '';
      return `<div class="obs-card${locked ? ' locked' : ''}" title="${d.desc}">
        <div class="obs-ico">${d.icon}</div>
        <div class="obs-name">${d.name}</div>
        <div class="obs-stars">${stars(st)}</div>
        <div class="obs-desc">${d.short}</div>
        ${extra}
        <div class="obs-best">${best ? `${tr('Récord', 'Record')}: ${d.best(best)}` : locked ? '' : tr('Sin récord todavía', 'No record yet')}</div>
        <button class="btn small" data-game="${d.id}" ${locked ? 'disabled' : ''}>${
          locked ? `🔒 ${tr('Galaxia nivel', 'Galaxy level')} ${d.level}` : e > 0 ? tr('Jugar · ◆ 1', 'Play · ◆ 1') : tr('Practicar (20%)', 'Practice (20%)')
        }</button>
      </div>`;
    }).join('');
    this.renderEnergy();
  }

  private renderEnergy() {
    const e = this.energy;
    const next = this.nextEnergy;
    const pips = '◆'.repeat(e) + '◇'.repeat(OBS_ENERGY_MAX - e);
    const html = `<b>${pips}</b><small>${e >= OBS_ENERGY_MAX ? tr('Energía de observación completa', 'Observation energy full') : `+1 ${tr('en', 'in')} ${formatTime(next)}`}</small>`;
    if (this.energyEl.innerHTML !== html) this.energyEl.innerHTML = html;
    const o = this.obs;
    const sub = this.menu.querySelector('.obs-sub') as HTMLElement;
    const s = tr(
      `Tu cielo: ${o.constellations.length}/${CONSTELLATIONS.length} constelaciones · cada partida con ◆ te da lo que tu galaxia produce en varios minutos`,
      `Your sky: ${o.constellations.length}/${CONSTELLATIONS.length} constellations · each game with ◆ gives you several minutes of your galaxy's production`,
    );
    if (sub.textContent !== s) sub.textContent = s;
  }

  // ------------------------------------------------------------------ games
  private launch(id: string) {
    const def = MINIGAMES.find((d) => d.id === id);
    if (!def || this.host.eco.level < def.level) return;
    const g = this.host.game;
    const o = this.obs;
    this.practice = this.energy <= 0;
    if (!this.practice) {
      o.energy--;
      if (o.energy === OBS_ENERGY_MAX - 1) o.at = Date.now();
    }
    g.audio.ui('click');
    this.menu.classList.remove('show');
    this.resultEl.classList.remove('show');
    this.layer.classList.add('show');
    this.hud.reset();
    if (def.scene === 'galaxy') {
      g.rig.autoOrbit = 0;
      g.rig.followLambda = 2.5;
      g.rig.target.set(0, 0, 0);
    }
    const unit = Math.max(1, this.host.eco.production) * (this.practice ? PRACTICE : 1);
    let s = (this.seed = (this.seed * 16807 + Date.now()) % 2147483647);
    const ctx: MinigameCtx = {
      game: g,
      group: this.host.group,
      gal: this.host.gal,
      layer: this.layer,
      hud: this.hud,
      S: this.host.scale(),
      view: this.host.view(),
      obs: o,
      best: o.best[id] ?? 0,
      unit,
      time: this.host.time,
      rng: () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      },
    };
    this.activeDef = def;
    this.active = def.make(ctx);
    this.active.start();
    this.host.save();
  }

  private quitGame() {
    if (!this.active || this.active.result) return;
    this.active.finish(true);
  }

  /** Pays the result, updates records and shows the results card. */
  private endGame(silent = false) {
    const game = this.active;
    const def = this.activeDef;
    if (!game || !def) return;
    if (!game.result) game.finish(true);
    const r = game.result as MinigameResult;
    game.dispose();
    this.active = null;
    this.activeDef = null;
    this.layer.classList.remove('show');
    this.hud.reset();
    const host = this.host;
    const g = host.game;
    const o = this.obs;
    const unit = Math.max(1, host.eco.production) * (this.practice ? PRACTICE : 1);
    const dust = Math.max(0, r.rewardSeconds) * unit;
    host.earn(dust);
    const recVal = r.record ?? r.score;
    const prevBest = o.best[def.id] ?? 0;
    const isRecord = recVal > prevBest && recVal > 0;
    if (isRecord) o.best[def.id] = recVal;
    o.stars[def.id] = Math.max(o.stars[def.id] ?? 0, r.stars);
    o.plays[def.id] = (o.plays[def.id] ?? 0) + 1;
    const extras: string[] = [];
    g.prog.achieve('mg_first');
    for (const a of r.achievements ?? []) g.prog.achieve(a);
    if (r.constellation && !o.constellations.includes(r.constellation)) {
      o.constellations.push(r.constellation);
      const c = CONSTELLATIONS.find((x) => x.id === r.constellation)!;
      const add = Math.round(CONSTELLATION_BONUS * 100);
      const total = Math.round(o.constellations.length * CONSTELLATION_BONUS * 100);
      extras.push(tr(`✧ <b>${c.name}</b> ya brilla en tu cielo · producción +${add}% (total +${total}%)`, `✧ <b>${c.name}</b> now shines in your sky · production +${add}% (total +${total}%)`));
      if (o.constellations.length >= 6) this.unlock('palette:estelar', extras);
      if (o.constellations.length >= CONSTELLATIONS.length) g.prog.achieve('mg_constellations');
    }
    for (const k of r.unlocks ?? []) this.unlock(k, extras);
    host.save();
    if (silent) return;
    g.audio.achievement();
    const recLabel = r.recordLabel ?? def.best;
    this.resultEl.innerHTML = `<div class="panel mg-card">
      <div class="label">${def.icon} ${def.name}</div>
      <div class="mg-stars">${'<i class="on">★</i>'.repeat(r.stars)}${'<i>★</i>'.repeat(3 - r.stars)}</div>
      <div class="mg-score">${r.record !== undefined ? recLabel(recVal) : pts(r.score)}${isRecord ? `<span class="rec">${tr('¡Nuevo récord!', 'New record!')}</span>` : prevBest ? `<span class="prev">${tr('récord', 'record')} ${recLabel(prevBest)}</span>` : ''}</div>
      <div class="mg-lines">${r.lines.map((l) => `<div>${l}</div>`).join('')}</div>
      <div class="mg-reward">+${formatBig(dust)} <span>✦</span>${this.practice ? `<small>${tr('práctica sin energía: 20%', 'practice without energy: 20%')}</small>` : ''}</div>
      ${extras.map((x) => `<div class="mg-extra">${x}</div>`).join('')}
      <div class="actions"></div>
    </div>`;
    const actions = this.resultEl.querySelector('.actions') as HTMLElement;
    const btn = (label: string, fn: () => void) => {
      const b = h('button', 'btn small', label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        b.blur();
        g.audio.ui('click');
        fn();
      });
      actions.appendChild(b);
    };
    btn(this.energy > 0 ? tr('Otra vez · ◆ 1', 'Again · ◆ 1') : tr('Practicar otra vez', 'Practice again'), () => this.launch(def.id));
    btn(tr('Volver al observatorio', 'Back to the observatory'), () => this.backToMenu());
    this.resultEl.classList.add('show');
    if (def.scene === 'galaxy') this.skyPose();
  }

  private unlock(key: string, extras: string[]) {
    const s = this.host.state;
    if (s.unlocked[key]) return;
    s.unlocked[key] = true;
    const [kind, id] = key.split(':');
    const style = (kind === 'palette' ? PALETTES.find((p) => p.id === id)?.name : JET_OPTIONS.find((j) => j.id === id)?.name) ?? '';
    const name = kind === 'palette' ? tr(`Paleta «${style}»`, `“${style}” palette`) : tr(`Chorros «${style}»`, `“${style}” jets`);
    extras.push(tr(`🎨 Nuevo estilo exclusivo: <b>${name}</b> (Tienda › Galaxia)`, `🎨 New exclusive style: <b>${name}</b> (Shop › Galaxy)`));
    this.host.game.hud.toast('🎨', tr('Estilo exclusivo desbloqueado', 'Exclusive style unlocked'), name);
  }

  private backToMenu() {
    this.resultEl.classList.remove('show');
    this.showMenu();
    this.skyPose();
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    if (!this.isOpen) return;
    const host = this.host;
    if (this.active) {
      this.active.tick(dt);
      this.hud.update(dt);
      if (this.active.result) this.endGame();
    }
    this.fade = damp(this.fade, this.active?.galaxyFade ?? 1, 2, dt);
    host.gal.fade = this.fade;
    this.uiT -= dt;
    if (this.uiT <= 0 && this.menu.classList.contains('show')) {
      this.uiT = 0.5;
      this.renderEnergy();
    }
    this.drawSky();
  }

  /** Your constellations on a panoramic strip that drifts with the camera. */
  private drawSky() {
    const show = !this.active;
    this.sky.style.opacity = show ? '1' : '0';
    if (!show) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.sky.width !== Math.round(W * dpr) || this.sky.height !== Math.round(H * dpr)) {
      this.sky.width = Math.round(W * dpr);
      this.sky.height = Math.round(H * dpr);
    }
    const g = this.sg;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const o = this.obs;
    // Your constellations share the visible sky and drift slowly as the camera turns.
    const owned = CONSTELLATIONS.filter((c) => o.constellations.includes(c.id));
    const n = owned.length;
    const size = Math.min(W, H) * 0.16;
    const rows = n > 6 ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    const pano = Math.max(W + size, perRow * size * 1.6);
    const off = ((this.host.game.rig.state.yaw / TAU) * pano * 0.6) % pano;
    const t = this.host.time();
    owned.forEach((c, k) => {
      const row = k % rows;
      const col = Math.floor(k / rows);
      let x = (col + 0.5 + row * 0.5) * (pano / perRow) - off;
      x = ((x % pano) + pano) % pano;
      if (x > W + size) x -= pano;
      if (x < -size || x > W + size) return;
      const y = H * (rows === 2 ? (row ? 0.37 : 0.21) : 0.27);
      const i = CONSTELLATIONS.indexOf(c);
      drawFigure(g, c, placeFigure(c, x, y, size, ((i % 5) - 2) * 0.12), 0.9, true, t);
    });
    if (!o.constellations.length && this.menu.classList.contains('show')) {
      g.font = '500 13px "Chakra Petch", sans-serif';
      g.textAlign = 'center';
      g.fillStyle = 'rgba(225, 232, 248, 0.6)';
      g.fillText(tr('Tu cielo todavía está vacío: juega a «Constelaciones» y tus figuras brillarán aquí', 'Your sky is still empty: play “Constellations” and your figures will shine here'), W / 2, H * 0.3);
    }
  }

  dispose() {
    if (this.active) this.endGame(true);
    window.removeEventListener('keydown', this.onKey, true);
    this.hud.dispose();
    this.root.remove();
  }
}
