import { h } from '../../ui/Hud';
import type { Settings } from '../../persistence/SaveSystem';
import { kindLabel, type PomoSave, type PomoSettings, type PomodoroTimer } from './PomodoroTimer';
import { tr } from '../../i18n/i18n';

export interface PomoUiActions {
  start(): void;
  resume(): void;
  toggle(): void;
  skip(): void;
  setup(): void;
  exit(): void;
  skipIntro(): void;
  changed(s: PomoSettings): void;
  volume(s: Partial<Settings>): void;
  sound(kind: 'click' | 'hover'): void;
}

const FOCUS = [15, 20, 25, 30, 45, 50, 60, 90];
const SHORT = [3, 5, 10, 15];
const LONG = [10, 15, 20, 30];
const EVERY = [2, 3, 4, 5, 6];

const fmt = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Pomodoro screens: the setup panel (over the observatory view), the big timer in the
 * top-left corner, and controls that only appear while the pointer moves.
 */
export class PomodoroUi {
  root: HTMLElement;
  private setupEl: HTMLElement;
  private timerEl: HTMLElement;
  private ctrlEl: HTMLElement;
  private skipEl: HTMLElement;
  private idle = 0;
  private lastTitle = '';

  constructor(parent: HTMLElement, private save: PomoSave, private act: PomoUiActions, private settings: () => Settings) {
    this.root = h('div', 'pomo');
    this.setupEl = h('div', 'pomo-setup panel interactive');
    this.timerEl = h('div', 'pomo-timer');
    this.timerEl.innerHTML = `<div class="l"></div><div class="t">25:00</div><div class="bar"><i></i></div><div class="dots"></div><div class="g"></div>`;
    this.ctrlEl = h('div', 'pomo-ctrl interactive');
    this.skipEl = h('button', 'pomo-skip btn small', tr('Saltar intro ⏭', 'Skip intro ⏭'));
    this.skipEl.addEventListener('click', () => {
      this.skipEl.blur();
      act.skipIntro();
    });
    this.root.append(this.timerEl, this.setupEl, this.ctrlEl, this.skipEl);
    parent.appendChild(this.root);
    window.addEventListener('pointermove', this.wake);
    window.addEventListener('pointerdown', this.wake);
    this.buildSetup();
  }

  onLanguage() {
    this.skipEl.textContent = tr('Saltar intro ⏭', 'Skip intro ⏭');
    if (this.root.dataset.mode === 'setup') this.buildSetup();
    this.lastTitle = '';
    this.refresh();
  }

  private wake = () => {
    this.idle = 0;
    this.root.classList.remove('idle');
  };

  setMode(mode: 'intro' | 'setup' | 'run') {
    this.root.dataset.mode = mode;
    if (mode === 'setup') this.buildSetup();
    this.wake();
  }

  private chips(name: keyof PomoSettings, values: number[], unit: string) {
    const cur = this.save.settings[name];
    return `<div class="chips">${values.map((v) => `<button class="chip${v === cur ? ' on' : ''}" data-k="${name}" data-v="${v}"><b>${v}</b>${unit ? `<small>${unit}</small>` : ''}</button>`).join('')}</div>`;
  }

  private buildSetup() {
    const s = this.save.settings;
    const vol = this.settings();
    const hasSession = this.root.dataset.session === '1';
    this.setupEl.innerHTML = `
      <div class="label">${tr('Modo Pomodoro · estudio y calma', 'Pomodoro mode · study and calm')}</div>
      <h2>${tr('Tu tiempo entre las estrellas', 'Your time among the stars')}</h2>
      <div class="pomo-stats">${tr(
        `Hoy: <b>${this.save.today}</b> ${this.save.today === 1 ? 'pomodoro' : 'pomodoros'} · <b>${this.save.todayMinutes}</b> min de foco`,
        `Today: <b>${this.save.today}</b> ${this.save.today === 1 ? 'pomodoro' : 'pomodoros'} · <b>${this.save.todayMinutes}</b> focus min`,
      )}</div>
      <div class="pomo-row"><div class="label">${tr('Foco (min)', 'Focus (min)')}</div>${this.chips('focus', FOCUS, '')}</div>
      <div class="pomo-grid">
        <div><div class="label">${tr('Pausa corta (min)', 'Short break (min)')}</div>${this.chips('short', SHORT, '')}</div>
        <div><div class="label">${tr('Pausa larga (min)', 'Long break (min)')}</div>${this.chips('long', LONG, '')}</div>
        <div><div class="label">${tr('Larga cada (focos)', 'Long one every (focus)')}</div>${this.chips('every', EVERY, '')}</div>
      </div>
      <div class="pomo-opts">
        <label><button class="toggle${s.auto ? ' on' : ''}" data-t="auto"></button>${tr('Encadenar foco y pausas automáticamente', 'Chain focus and breaks automatically')}</label>
        <label><button class="toggle${s.travel ? ' on' : ''}" data-t="travel"></button>${tr('Viaje de cámara por la galaxia', 'Camera journey through the galaxy')}</label>
        <label class="vol">${tr('Música', 'Music')} <input type="range" min="0" max="1" step="0.05" value="${vol.music}" data-vol="music"></label>
        <label class="vol">${tr('Campanas y efectos', 'Bells and effects')} <input type="range" min="0" max="1" step="0.05" value="${vol.sfx}" data-vol="sfx"></label>
      </div>
      <div class="actions">
        ${
          hasSession
            ? `<button class="btn small primary" data-a="resume">${tr('Continuar sesión', 'Resume session')}</button><button class="btn small" data-a="start">${tr('Nueva sesión', 'New session')}</button>`
            : `<button class="btn small primary" data-a="start">${tr('Comenzar', 'Start')}</button>`
        }
        <button class="btn small" data-a="exit">${tr('Volver al menú', 'Back to menu')}</button>
      </div>
      <div class="pomo-tip">${tr(
        'Durante la sesión: <kbd>ESPACIO</kbd> pausa · <kbd>ESC</kbd> ajustes · mueve el mouse para ver los controles',
        'During the session: <kbd>SPACE</kbd> pause · <kbd>ESC</kbd> settings · move the mouse to see the controls',
      )}</div>`;
    this.setupEl.querySelectorAll<HTMLButtonElement>('button.chip').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.k as 'focus' | 'short' | 'long' | 'every';
        this.save.settings[k] = Number(b.dataset.v);
        this.act.sound('click');
        this.act.changed(this.save.settings);
        this.buildSetup();
      }),
    );
    this.setupEl.querySelectorAll<HTMLButtonElement>('button.toggle').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.t as 'auto' | 'travel';
        this.save.settings[k] = !this.save.settings[k];
        this.act.sound('click');
        this.act.changed(this.save.settings);
        this.buildSetup();
      }),
    );
    this.setupEl.querySelectorAll<HTMLInputElement>('input[data-vol]').forEach((i) =>
      i.addEventListener('input', () => this.act.volume({ [i.dataset.vol as 'music' | 'sfx']: parseFloat(i.value) })),
    );
    this.setupEl.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        b.blur();
        this.act.sound('click');
        const a = b.dataset.a;
        if (a === 'start') this.act.start();
        else if (a === 'resume') this.act.resume();
        else this.act.exit();
      }),
    );
  }

  /** A session exists (the setup screen then offers to continue it). */
  set hasSession(v: boolean) {
    this.root.dataset.session = v ? '1' : '';
  }

  private ctrlKey = '';

  update(dt: number, timer: PomodoroTimer) {
    const mode = this.root.dataset.mode;
    this.idle += dt;
    if (mode === 'run') {
      // Everything fades away while you work; moving the pointer brings the controls back.
      this.root.classList.toggle('idle', this.idle > 3 && timer.running);
      const left = timer.remaining();
      const kind = kindLabel(timer.kind);
      const label = timer.waiting ? `${kind} · ${tr('lista', 'ready')}` : `${kind}${timer.running ? '' : ` · ${tr('en pausa', 'paused')}`}`;
      const set = (sel: string, v: string) => {
        const el = this.timerEl.querySelector(sel) as HTMLElement;
        if (el.textContent !== v) el.textContent = v;
      };
      set('.t', fmt(left));
      set('.l', label);
      // Focus sessions of this cycle: done ●, current ◐, pending ○.
      const doneN = timer.kind === 'focus' ? timer.index - 1 : timer.index;
      const dots = Array.from({ length: timer.settings.every }, (_, i) => (i < doneN ? '●' : timer.kind === 'focus' && i === doneN ? '◐' : '○')).join(' ');
      set('.dots', dots);
      (this.timerEl.querySelector('.bar i') as HTMLElement).style.width = `${timer.progress() * 100}%`;
      this.timerEl.dataset.kind = timer.kind;
      this.timerEl.classList.toggle('paused', !timer.running);
      const title = `${fmt(left)} · ${kind} — Universe is Born`;
      if (title !== this.lastTitle) document.title = this.lastTitle = title;
      const key = `${timer.running}|${timer.waiting}|${timer.kind}`;
      if (key !== this.ctrlKey) {
        this.ctrlKey = key;
        this.buildCtrl(timer);
      }
    }
  }

  private buildCtrl(timer: PomodoroTimer) {
    const play = timer.waiting ? `▶ ${tr('Comenzar', 'Start')} ${kindLabel(timer.kind).toLowerCase()}` : timer.running ? `❚❚ ${tr('Pausa', 'Pause')}` : `▶ ${tr('Seguir', 'Resume')}`;
    this.ctrlEl.innerHTML = `<button class="btn small" data-c="toggle">${play}</button><button class="btn small" data-c="skip">⏭ ${tr('Saltar', 'Skip')}</button><button class="btn small" data-c="setup">⚙ ${tr('Ajustes', 'Settings')}</button><button class="btn small" data-c="exit">✕ ${tr('Salir', 'Exit')}</button>`;
    this.ctrlEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        b.blur();
        this.act.sound('click');
        const c = b.dataset.c;
        if (c === 'toggle') this.act.toggle();
        else if (c === 'skip') this.act.skip();
        else if (c === 'setup') this.act.setup();
        else this.act.exit();
      }),
    );
  }

  /** The small line under the timer about your evolving galaxy. */
  setGalaxy(text: string) {
    const el = this.timerEl.querySelector('.g') as HTMLElement;
    if (el.textContent !== text) el.textContent = text;
  }

  /** Forces the controls to be rebuilt (after settings or state changes). */
  refresh() {
    this.ctrlKey = '';
  }

  dispose() {
    window.removeEventListener('pointermove', this.wake);
    window.removeEventListener('pointerdown', this.wake);
    document.title = 'Universe is Born';
    this.root.remove();
  }
}
