import * as THREE from 'three';
import { CameraRig } from '../render/CameraRig';
import { RenderPipeline } from '../render/RenderPipeline';
import { Input } from './Input';
import { QualityManager } from './Quality';
import { EventBus, type GameEvents } from './Events';
import { AudioEngine } from '../audio/AudioEngine';
import { Hud } from '../ui/Hud';
import { Menus, TouchControls } from '../ui/Menus';
import { Progression } from '../progression/Progression';
import { SaveSystem, type PhaseId, type RunCarry, type SandboxState, type Settings } from '../persistence/SaveSystem';
import { Sky, SKY_PRESETS } from '../vfx/Sky';
import { Motes } from '../vfx/Effects';
import { Rng, randomSeed } from '../procgen/rng';
import type { Phase } from '../gameplay/Phase';
import { stageDef } from '../progression/Stages';
import { codexById } from '../progression/Codex';
import { achievementById } from '../progression/Achievements';
import { SandboxEconomy, createSandboxState, randomGalaxyBase } from '../gameplay/sandbox/Economy';
import type { GalaxyParams } from '../vfx/GalaxyField';

export type PhaseFactory = (game: Game, carry: RunCarry) => Phase;
/** Everything that can own the scene: story phases, the title backdrop and free mode. */
export type SceneId = PhaseId | 'title' | 'sandbox' | 'pomodoro';

type Mode = 'title' | 'playing' | 'paused' | 'transition';

/**
 * Orchestrates everything: render loop, phases, menus, saving, settings and global services.
 */
export class Game {
  scene = new THREE.Scene();
  rig: CameraRig;
  camera: THREE.PerspectiveCamera;
  pipe: RenderPipeline;
  input: Input;
  quality: QualityManager;
  bus = new EventBus<GameEvents>();
  audio = new AudioEngine();
  hud: Hud;
  menus: Menus;
  touch: TouchControls;
  prog: Progression;
  save = new SaveSystem();
  sky: Sky;
  motes: Motes;
  rng: Rng = new Rng(randomSeed());
  time = 0;
  mode: Mode = 'title';
  phase: Phase | null = null;
  private sceneId: SceneId = 'title';
  private factories = new Map<SceneId, PhaseFactory>();
  last = performance.now();
  private fpsEl: HTMLElement;
  debug = new URLSearchParams(location.search).has('debug');
  shakeScale = 1;
  timeScale = 1;
  stage = 1;
  private briefQueue: number[] = [];
  private briefWait = 0;
  private lastBriefed = 0;

  constructor(private container: HTMLElement, private uiRoot: HTMLElement) {
    this.prog = new Progression(this.save, this.bus);
    this.migrateLegacySandbox();
    const settings = this.prog.meta.settings;
    this.quality = new QualityManager(settings.quality);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.camera = this.rig.camera;
    this.pipe = new RenderPipeline(container, this.scene, this.camera, this.quality);
    this.input = new Input(this.pipe.renderer.domElement);
    this.input.onPause = () => this.togglePause();
    this.input.onAnyInput = () => this.audio.init();

    this.sky = new Sky(this.rng.int(0, 100000));
    this.scene.add(this.sky.mesh);
    this.sky.set(SKY_PRESETS.blackhole, 0);
    this.motes = new Motes(this.quality.profile.motes);
    this.scene.add(this.motes.batch.mesh);

    this.hud = new Hud(uiRoot);
    this.hud.show(false);
    this.hud.onHelp = () => this.openHelp();
    this.menus = new Menus(uiRoot, this.prog, this.audio, {
      onNewGame: () => this.newGame(),
      onContinue: () => this.continueGame(),
      onSandbox: () => this.startSandbox(),
      onPomodoro: () => this.startPomodoro(),
      onResume: () => this.resume(),
      onQuitToTitle: () => this.quitToTitle(),
      onSettings: (s) => this.applySettings(s),
      onResetProgress: () => {
        localStorage.clear();
        location.reload();
      },
    });
    this.menus.onAllClosed = () => {
      if (this.mode === 'paused') this.resume();
    };
    this.touch = new TouchControls(
      uiRoot,
      (d) => (this.input.touchPrimary = d),
      (d) => (this.input.touchSecondary = d),
      () => this.togglePause(),
    );
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps';
    uiRoot.appendChild(this.fpsEl);
    this.applySettings(settings);
    this.wireEvents();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing' && !this.phase?.allowBackground) this.pause();
    });
    if (this.debug) this.installDebug();
  }

  register(id: SceneId, f: PhaseFactory) {
    this.factories.set(id, f);
  }

  private wireEvents() {
    this.bus.on('discovery', ({ id }) => {
      const c = codexById(id);
      if (!c || this.mode === 'title') return;
      this.audio.discovery();
      const edu = this.prog.meta.settings.educational;
      this.hud.toast('❖', `Descubrimiento: ${c.title}`, edu ? 'Toca para leer · ' + c.question : '', edu ? () => this.openCodexEntry(id) : undefined);
      if (edu) this.hud.helpBtn.classList.add('pulse');
    });
    this.bus.on('achievement', ({ id }) => {
      const a = achievementById(id);
      if (!a) return;
      this.audio.achievement();
      this.hud.toast(a.icon, `Logro: ${a.title}`, a.desc);
    });
    this.bus.on('massChanged', ({ mass }) => {
      this.prog.max('maxMass', mass);
      if (mass >= 1e6) this.prog.achieve('million');
      if (mass >= 1e9) this.prog.achieve('billion');
    });
  }

  applySettings(s: Settings) {
    this.prog.meta.settings = s;
    this.prog.flushMeta();
    if (s.quality !== this.quality.setting) this.quality.apply(s.quality);
    this.audio.setVolumes(s.music, s.sfx);
    this.shakeScale = s.shake ? 1 : 0;
  }

  shake(v: number) {
    this.rig.addTrauma(v * this.shakeScale);
  }

  // ------------------------------------------------------------------ flow
  start() {
    const params = new URLSearchParams(location.search);
    const jump = params.get('phase') as SceneId | null;
    if (this.debug && jump === 'pomodoro') {
      this.prog.run = null;
      this.menus.showTitle(false);
      this.mode = 'playing';
      this.switchPhase('pomodoro', {});
    } else if (this.debug && jump === 'sandbox') {
      this.ensureSandbox();
      this.prog.run = null;
      this.menus.showTitle(false);
      this.mode = 'playing';
      this.switchPhase('sandbox', {});
    } else if (this.debug && jump && jump !== 'title' && jump !== 'sandbox' && jump !== 'pomodoro' && this.factories.has(jump)) {
      const seed = randomSeed();
      this.rng = new Rng(seed);
      const carry: RunCarry = { cloudMass: 4000, starMass: 24, coreQuality: 0.8, remnant: 'bh', bhMass: Number(params.get('mass') ?? 6) };
      this.prog.run = { version: 1, seed, phase: jump, carry, time: 0, savedAt: Date.now() };
      this.menus.showTitle(false);
      this.mode = 'playing';
      this.switchPhase(jump, carry);
    } else this.enterTitle();
    const loop = () => {
      requestAnimationFrame(loop);
      this.frame();
    };
    requestAnimationFrame(loop);
  }

  private enterTitle() {
    this.mode = 'title';
    this.switchPhase('title', {});
    this.hud.show(false);
    this.touch.setEnabled(false);
    this.menus.showTitle(true);
    this.audio.setEra('blackhole');
    this.audio.setIntensity(0.15);
  }

  newGame() {
    this.prog.clearRun();
    const seed = randomSeed();
    this.rng = new Rng(seed);
    this.prog.run = { version: 1, seed, phase: 'primordial', carry: {}, time: 0, savedAt: Date.now() };
    this.prog.saveRunNow();
    this.beginPlay('primordial', {});
  }

  continueGame() {
    const run = this.prog.loadRun();
    if (!run) return this.newGame();
    this.prog.run = run;
    this.rng = new Rng(run.seed ^ Math.floor(run.time * 1000));
    this.beginPlay(run.phase, run.carry);
  }

  // ------------------------------------------------------------------ free mode
  /** Older saves kept a finished run alive as free mode: move it to its own save. */
  private migrateLegacySandbox() {
    const run = this.prog.loadRun();
    if (run?.phase !== 'galaxy' || (run.carry.galaxyStage ?? 0) < 3) return;
    if (!this.prog.loadSandbox()) this.prog.saveSandbox(createSandboxState(run.seed, run.carry.bhMass ?? 2e8, randomGalaxyBase(new Rng(run.seed))));
    this.prog.clearRun();
  }

  /** Free mode is unlocked by finishing the story once. Creates the galaxy on first use. */
  ensureSandbox(): SandboxState | null {
    const s = this.prog.loadSandbox();
    if (s) return s;
    if (!this.prog.sandboxUnlocked && !this.debug) return null;
    const seed = randomSeed();
    const fresh = createSandboxState(seed, Math.max(2e8, this.prog.meta.stats.maxMass), randomGalaxyBase(new Rng(seed)));
    this.prog.saveSandbox(fresh);
    return fresh;
  }

  startSandbox() {
    if (!this.ensureSandbox()) return;
    // A story run in progress stays saved as it is: free mode never touches it.
    this.prog.saveRunNow();
    this.audio.suspend(false);
    this.prog.run = null;
    this.beginPlay('sandbox', {});
  }

  /** Pomodoro (relax & study): a cosmic journey with a focus timer. Never touches runs or saves. */
  startPomodoro() {
    this.prog.saveRunNow();
    this.audio.suspend(false);
    this.prog.run = null;
    this.beginPlay('pomodoro', {});
  }

  /** End of the story: creates the free-mode galaxy, or rewards the existing one. */
  completeStory(mass: number, p: GalaxyParams): { created: boolean; bonus: number } {
    const s = this.prog.loadSandbox();
    if (!s) {
      const base = { arms: p.arms, twist: p.twist, ecc: p.ecc, bulge: p.bulge, hueShift: p.hueShift };
      this.prog.saveSandbox(createSandboxState(this.prog.run?.seed ?? randomSeed(), mass, base));
      return { created: true, bonus: 0 };
    }
    const eco = new SandboxEconomy(s);
    const bonus = Math.max(1000, eco.production * 600); // ten minutes of production
    eco.earn(bonus);
    this.prog.add('stardust', bonus);
    this.prog.saveSandbox(s);
    return { created: false, bonus };
  }

  private async beginPlay(id: SceneId, carry: RunCarry) {
    this.lastBriefed = 0;
    this.briefQueue = [];
    this.stage = 0;
    this.menus.showTitle(false);
    this.mode = 'transition';
    await this.fadeTo(1, 0.9);
    this.switchPhase(id, carry);
    this.mode = 'playing';
    const hud = this.phase?.showHud ?? true;
    this.hud.show(hud);
    this.touch.setEnabled(this.input.touchMode && hud);
    await this.fadeTo(0, 1.4);
  }

  /** Advance to the next phase with a fade (unless `instant`, when the phase already did its own transition). */
  async goto(id: PhaseId, carry: RunCarry, opts: { fade?: number; instant?: boolean } = {}) {
    const run = this.prog.run;
    if (run) {
      run.phase = id;
      run.carry = { ...carry };
      this.prog.saveRunNow();
    }
    if (!opts.instant) await this.fadeTo(1, opts.fade ?? 0.8);
    this.switchPhase(id, carry);
    if (!opts.instant) await this.fadeTo(0, opts.fade ?? 1.2);
    else this.pipe.final.fade = 0;
  }

  saveCarry(carry: RunCarry) {
    if (!this.prog.run) return;
    this.prog.run.carry = { ...this.prog.run.carry, ...carry };
    this.prog.saveRunNow();
  }

  private switchPhase(id: SceneId, carry: RunCarry) {
    if (this.phase) this.phase.exit();
    this.hud.clearMarkers();
    this.hud.clearWidget();
    this.hud.setMeters([]);
    this.hud.setAbilities([]);
    this.hud.setObjective('');
    this.hud.clearHint();
    this.pipe.bhPass.primaryActive = false;
    this.pipe.bhPass.rivals = [];
    this.pipe.final.letterboxTarget = 0;
    this.pipe.final.chroma = 0;
    this.pipe.final.pulse = 0;
    this.pipe.final.gw.amp = 0;
    this.pipe.exposure = 1;
    this.rig.autoOrbit = 0;
    this.rig.zoomBias = 1;
    const galaxy = id === 'galaxy' || id === 'sandbox' || id === 'pomodoro';
    this.rig.minZoom = galaxy ? 0.08 : 0.6;
    this.rig.maxZoom = galaxy ? 2.2 : 1.8;
    this.rig.offset.set(0, 0, 0);
    this.rig.followLambda = 3.5;
    this.pipe.final.saturation = 1.05;
    this.pipe.final.vignette = 0.2;
    this.hud.show(id !== 'title' && this.mode !== 'title');
    this.timeScale = 1;
    const f = this.factories.get(id);
    if (!f) throw new Error('Unknown phase ' + id);
    this.sceneId = id;
    this.phase = f(this, carry);
    this.scene.add(this.phase.group);
    this.phase.enter();
    const [p, s] = this.phase.touchLabels();
    this.touch.setLabels(p, s);
  }

  fadeTo(v: number, dur: number): Promise<void> {
    return new Promise((resolve) => {
      const from = this.pipe.final.fade;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
        this.pipe.final.fade = from + (v - from) * k;
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      step();
    });
  }

  setStage(n: number, silent = false) {
    const isNew = n !== this.stage || this.hud.stage !== n;
    this.stage = n;
    const def = stageDef(n);
    if (n !== this.lastBriefed && n !== 6 && !this.briefQueue.includes(n)) {
      this.briefQueue.push(n);
      this.lastBriefed = n;
    }
    this.hud.setStage(n);
    if (!silent && isNew) this.hud.feel(def.feel, 4.5, 5.2);
    this.prog.discover(def.codex);
    if (this.prog.run) this.prog.run.carry.stage = n;
    this.bus.emit('stage', { stage: n });
  }

  // ------------------------------------------------------------------ pause & menus
  togglePause() {
    if (this.mode === 'playing') this.pause();
    else if (this.mode === 'paused') this.menus.closeAll(), this.resume();
  }

  pause(openMenu = true) {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.audio.suspend(true);
    if (openMenu) this.menus.openPause(this.sceneId !== 'sandbox' && this.prog.sandboxUnlocked);
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.audio.suspend(false);
    this.last = performance.now();
  }

  openHelp() {
    this.hud.helpBtn.classList.remove('pulse');
    if (this.mode === 'playing') this.pause(false);
    if (this.phase?.help()) return;
    if (!this.menus.openBriefing(this.stage, this.input.touchMode, () => this.openCodexEntry(stageDef(this.stage).codex))) this.openCodexEntry(stageDef(this.stage).codex);
  }

  openCodexEntry(id: string) {
    if (this.mode === 'playing') this.pause(false);
    this.prog.discover(id);
    this.menus.openEntry(id);
  }

  quitToTitle() {
    this.prog.saveRunNow();
    this.audio.suspend(false);
    this.fadeTo(1, 0.6).then(() => {
      this.enterTitle();
      this.fadeTo(0, 1);
    });
  }

  finishRun() {
    this.prog.add('runsCompleted', 1);
    this.prog.flushMeta();
  }

  // ------------------------------------------------------------------ loop
  frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.quality.sample(dt);
    const running = this.mode === 'playing' || this.mode === 'title' || this.mode === 'transition';
    if (!running) dt = 0;
    const sdt = dt * this.timeScale;
    this.time += sdt;

    this.input.update(this.camera);
    if (this.mode === 'playing' && this.phase && !this.phase.cinematic) this.rig.applyWheel(this.input.consumeWheel());
    else this.input.consumeWheel();

    if (this.phase && running) this.phase.tick(sdt);
    this.updateBriefing(dt);
    this.prog.update(dt, this.mode === 'playing');
    this.rig.update(dt);
    this.sky.update(dt, this.time, this.camera.position, this.camera.far);
    this.motes.update(this.rig.focus, this.rig.effectiveDistance * 0.9, this.time);
    this.audio.update(dt);
    this.hud.update(dt, this.camera);
    this.touch.updateStick(this.input.stickActive, this.input.stickOriginPx.x, this.input.stickOriginPx.y, this.input.stick.x, this.input.stick.y);
    this.pipe.render(dt, this.time);
    if (this.debug) this.fpsEl.textContent = `${this.quality.fps.toFixed(0)} fps · ${this.quality.profile.level} · x${this.quality.resolutionScale.toFixed(2)}`;
  }

  /** Shows the stage briefing (and pauses) once intros, cinematics and fades are over. */
  private updateBriefing(dt: number) {
    if (!this.briefQueue.length || this.mode !== 'playing' || !this.phase) return;
    const busy = this.phase.t < 2 || this.phase.cinematic || this.pipe.final.fade > 0.05 || this.hud.cardShowing || this.menus.anyOpen;
    this.briefWait = busy ? 0 : this.briefWait + dt;
    if (this.briefWait < 0.5) return;
    const n = this.briefQueue.shift()!;
    this.pause(false);
    this.hud.clearHint();
    if (!this.menus.openBriefing(n, this.input.touchMode, () => this.openCodexEntry(stageDef(n).codex))) this.resume();
  }

  private installDebug() {
    (window as any).__game = this;
    // QA helper: advance the simulation deterministically (works even when rAF is throttled).
    (window as any).__step = async (sec: number, perFrame?: () => void) => {
      const n = Math.round(sec * 60);
      for (let i = 0; i < n; i++) {
        perFrame?.();
        this.last = performance.now() - 1000 / 60;
        this.frame();
        await Promise.resolve();
        await Promise.resolve();
      }
      return this.phase ? `${this.phase.id} t=${this.phase.t.toFixed(2)}` : 'none';
    };
    window.addEventListener('keydown', (e) => {
      if (!this.phase || this.mode !== 'playing') return;
      if (e.key === 'n') this.phase.debugSkip();
      if (e.key === 'm') this.phase.debugBoost();
    });
  }
}
