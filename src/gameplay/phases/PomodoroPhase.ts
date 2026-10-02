import { Phase } from '../Phase';
import { GalaxyField } from '../../vfx/GalaxyField';
import { SKY_PRESETS } from '../../vfx/Sky';
import { Rng, randomSeed } from '../../procgen/rng';
import { IntroCinematic } from '../pomodoro/IntroCinematic';
import { Director } from '../pomodoro/Director';
import { PomodoroUi } from '../pomodoro/PomodoroUi';
import { PomodoroTimer, loadPomo, savePomo, type PomoKind, type PomoSave } from '../pomodoro/PomodoroTimer';

type Mode = 'intro' | 'setup' | 'run';

const ARRIVAL: Record<PomoKind, [string, string]> = {
  focus: ['Foco', 'Un universo entero girando en silencio para ti'],
  short: ['Pausa corta', 'Respira. Estira. Mira las estrellas.'],
  long: ['Pausa larga', 'Te lo ganaste: date un paseo por la galaxia'],
};

/**
 * Pomodoro (relax & study). A one-minute cinematic through every era of the game ends
 * at a galaxy seen from the observatory, where the timer is configured. During the
 * session the screen is clean: a big timer in the corner, a camera that travels
 * through the galaxy on its own, soft events and ambient music.
 */
export class PomodoroPhase extends Phase {
  id = 'galaxy' as const;
  showHud = false;
  allowBackground = true;
  private gal!: GalaxyField;
  private intro: IntroCinematic | null = null;
  private director!: Director;
  private ui!: PomodoroUi;
  private timer!: PomodoroTimer;
  private save!: PomoSave;
  private mode: Mode = 'intro';
  private interval = 0;
  private onKey!: (e: KeyboardEvent) => void;

  enter() {
    const g = this.game;
    this.cinematic = true;
    g.hud.show(false);
    g.audio.setEra('primordial');
    g.audio.setIntensity(0.25);
    const rng = new Rng(randomSeed());
    this.gal = new GalaxyField(
      {
        count: g.quality.profile.galaxyStars,
        radius: 600,
        arms: rng.pick([2, 2, 3, 4]),
        twist: rng.range(1.6, 2.2),
        ecc: rng.range(0.38, 0.45),
        pattern: 0.012,
        vel: 42,
        bulge: rng.range(0.13, 0.18),
        hueShift: rng.range(-0.5, 0.5),
      },
      rng,
    );
    this.group.add(this.gal);
    this.save = loadPomo();
    this.timer = new PomodoroTimer(this.save.settings);
    this.director = new Director(g, this.group, this.gal);
    this.ui = new PomodoroUi(
      g.hud.root.parentElement!,
      this.save,
      {
        start: () => this.start(),
        resume: () => this.resume(),
        toggle: () => this.toggle(),
        skip: () => this.skipSegment(),
        setup: () => this.toSetup(),
        exit: () => g.quitToTitle(),
        skipIntro: () => this.intro?.skip(),
        changed: () => {
          savePomo(this.save);
          this.director.travel = this.save.settings.travel;
        },
        volume: (v) => g.applySettings({ ...g.prog.meta.settings, ...v }),
        sound: (k) => g.audio.ui(k),
      },
      () => g.prog.meta.settings,
    );
    this.intro = new IntroCinematic(g, this.group, this.gal);
    this.ui.setMode('intro');

    // Wall-clock check, also while the tab is hidden (the music keeps timers alive).
    this.interval = window.setInterval(() => this.checkTimer(), 1000);
    this.onKey = (e: KeyboardEvent) => {
      if (g.mode !== 'playing') return;
      const k = e.key.toLowerCase();
      if (this.mode === 'intro' && (k === ' ' || k === 'enter' || k === 'escape')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.intro?.skip();
      } else if (this.mode === 'run' && (k === ' ' || k === 'escape')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (k === ' ') this.toggle();
        else this.toSetup();
      } else if (this.mode === 'setup' && k === 'enter') {
        e.preventDefault();
        if (this.ui.root.dataset.session === '1') this.resume();
        else this.start();
      }
    };
    window.addEventListener('keydown', this.onKey, true);
  }

  private toSetup() {
    const g = this.game;
    this.mode = 'setup';
    this.timer.pause();
    this.save.introSeen = true;
    savePomo(this.save);
    this.director.calm = true;
    this.director.horizon(6, true);
    this.ui.setMode('setup');
    g.audio.setIntensity(0.2);
    document.body.classList.remove('pomo-idle');
  }

  private start() {
    this.timer.settings = this.save.settings;
    this.timer.reset();
    this.timer.start();
    this.ui.hasSession = true;
    this.enterRun();
    this.announce('focus');
  }

  private resume() {
    if (!this.timer.waiting) this.timer.start();
    this.enterRun();
  }

  private enterRun() {
    const g = this.game;
    this.mode = 'run';
    this.ui.setMode('run');
    this.ui.refresh();
    this.director.travel = this.save.settings.travel;
    this.director.calm = this.timer.kind !== 'focus';
    this.director.begin();
    g.audio.setEra(this.director.calm ? 'star' : 'galaxy');
    g.audio.setIntensity(this.director.calm ? 0.3 : 0.18);
  }

  private toggle() {
    if (this.timer.waiting) {
      this.timer.start();
      this.announce(this.timer.kind);
    } else this.timer.toggle();
    this.ui.refresh();
  }

  private skipSegment() {
    this.timer.advance(false);
    this.arrive(false);
  }

  private checkTimer() {
    if (this.mode !== 'run') return;
    const done = this.timer.check();
    if (!done) return;
    if (done === 'focus') {
      const g = this.game;
      const min = this.save.settings.focus;
      this.save.today++;
      this.save.todayMinutes += min;
      savePomo(this.save);
      g.prog.add('pomodoros', 1);
      g.prog.add('focusMinutes', min);
      g.prog.achieve('pomo_first');
      if (this.timer.kind === 'long') g.prog.achieve('pomo_cycle');
      g.prog.flushMeta();
    }
    this.arrive(true);
  }

  /** A new segment begins (or waits): bell, a short card and a change of mood. */
  private arrive(bell: boolean) {
    const g = this.game;
    const kind = this.timer.kind;
    if (bell) g.audio.chime(kind === 'focus');
    if (this.timer.waiting) g.hud.titleCard(kind === 'focus' ? 'Pausa terminada' : '¡Bien hecho!', 'POMODORO', `Cuando quieras: ${kind === 'focus' ? 'comienza el foco' : 'comienza la pausa'} (ESPACIO)`, 6);
    else this.announce(kind);
    this.director.calm = kind !== 'focus';
    this.director.next();
    g.audio.setEra(this.director.calm ? 'star' : 'galaxy');
    g.audio.setIntensity(this.director.calm ? 0.3 : 0.18);
    this.ui.refresh();
  }

  private announce(kind: PomoKind) {
    const [big, sub] = ARRIVAL[kind];
    const min = this.timer.duration(kind) / 60;
    this.game.hud.titleCard(big, `${min} MINUTOS`, sub, 4);
  }

  update(dt: number) {
    const g = this.game;
    this.gal.update(this.t, g.pipe.renderer.getPixelRatio());
    if (this.intro) {
      this.intro.update(dt);
      if (this.intro.done) {
        this.intro.dispose();
        this.toSetup();
        this.intro = null;
        g.sky.set(SKY_PRESETS.intergalactic, 2);
      }
    } else this.director.update(dt);
    this.checkTimer();
    this.ui.update(dt, this.timer);
    document.body.classList.toggle('pomo-idle', this.mode === 'run' && this.ui.root.classList.contains('idle'));
  }

  exit() {
    window.clearInterval(this.interval);
    window.removeEventListener('keydown', this.onKey, true);
    document.body.classList.remove('pomo-idle');
    this.intro?.dispose();
    this.director.dispose();
    this.ui.dispose();
    this.gal.dispose();
    this.game.rig.target.set(0, 0, 0);
    super.exit();
  }
}
