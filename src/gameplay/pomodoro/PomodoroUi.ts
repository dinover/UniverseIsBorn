import { h } from '../../ui/Hud';
import type { Settings } from '../../persistence/SaveSystem';
import { KIND_LABEL, type PomoSave, type PomoSettings, type PomodoroTimer } from './PomodoroTimer';

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
    this.timerEl.innerHTML = `<div class="l"></div><div class="t">25:00</div><div class="bar"><i></i></div><div class="dots"></div>`;
    this.ctrlEl = h('div', 'pomo-ctrl interactive');
    this.skipEl = h('button', 'pomo-skip btn small', 'Saltar intro ⏭');
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
      <div class="label">Modo Pomodoro · relax y estudio</div>
      <h2>Tu tiempo entre las estrellas</h2>
      <div class="pomo-stats">Hoy: <b>${this.save.today}</b> ${this.save.today === 1 ? 'pomodoro' : 'pomodoros'} · <b>${this.save.todayMinutes}</b> min de foco</div>
      <div class="pomo-row"><div class="label">Foco (min)</div>${this.chips('focus', FOCUS, '')}</div>
      <div class="pomo-grid">
        <div><div class="label">Pausa corta (min)</div>${this.chips('short', SHORT, '')}</div>
        <div><div class="label">Pausa larga (min)</div>${this.chips('long', LONG, '')}</div>
        <div><div class="label">Larga cada (focos)</div>${this.chips('every', EVERY, '')}</div>
      </div>
      <div class="pomo-opts">
        <label><button class="toggle${s.auto ? ' on' : ''}" data-t="auto"></button>Encadenar foco y pausas automáticamente</label>
        <label><button class="toggle${s.travel ? ' on' : ''}" data-t="travel"></button>Viaje de cámara por la galaxia</label>
        <label class="vol">Música <input type="range" min="0" max="1" step="0.05" value="${vol.music}" data-vol="music"></label>
        <label class="vol">Campanas y efectos <input type="range" min="0" max="1" step="0.05" value="${vol.sfx}" data-vol="sfx"></label>
      </div>
      <div class="actions">
        ${hasSession ? '<button class="btn small primary" data-a="resume">Continuar sesión</button><button class="btn small" data-a="start">Nueva sesión</button>' : '<button class="btn small primary" data-a="start">Comenzar</button>'}
        <button class="btn small" data-a="exit">Volver al menú</button>
      </div>
      <div class="pomo-tip">Durante la sesión: <kbd>ESPACIO</kbd> pausa · <kbd>ESC</kbd> ajustes · mueve el mouse para ver los controles</div>`;
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
      const label = timer.waiting ? `${KIND_LABEL[timer.kind]} · lista` : `${KIND_LABEL[timer.kind]}${timer.running ? '' : ' · en pausa'}`;
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
      const title = `${fmt(left)} · ${KIND_LABEL[timer.kind]} — Universe is Born`;
      if (title !== this.lastTitle) document.title = this.lastTitle = title;
      const key = `${timer.running}|${timer.waiting}|${timer.kind}`;
      if (key !== this.ctrlKey) {
        this.ctrlKey = key;
        this.buildCtrl(timer);
      }
    }
  }

  private buildCtrl(timer: PomodoroTimer) {
    const play = timer.waiting ? `▶ Comenzar ${KIND_LABEL[timer.kind].toLowerCase()}` : timer.running ? '❚❚ Pausa' : '▶ Seguir';
    this.ctrlEl.innerHTML = `<button class="btn small" data-c="toggle">${play}</button><button class="btn small" data-c="skip">⏭ Saltar</button><button class="btn small" data-c="setup">⚙ Ajustes</button><button class="btn small" data-c="exit">✕ Salir</button>`;
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
