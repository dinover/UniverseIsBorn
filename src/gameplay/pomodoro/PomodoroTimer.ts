import { tr } from '../../i18n/i18n';

import { LocalStorageBackend } from '../../persistence/SaveSystem';

export type PomoKind = 'focus' | 'short' | 'long';

export interface PomoSettings {
  /** Minutes. */
  focus: number;
  short: number;
  long: number;
  /** A long break after this many focus sessions. */
  every: number;
  /** Start the next segment automatically. */
  auto: boolean;
  /** Let the camera travel around the galaxy (off: a calm fixed view). */
  travel: boolean;
}

export interface PomoSave {
  version: 1;
  settings: PomoSettings;
  /** Local date (YYYY-MM-DD) of today's counters. */
  day: string;
  today: number;
  todayMinutes: number;
  introSeen: boolean;
}

const KEY = 'uib.pomodoro.v1';
const store = new LocalStorageBackend();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const DEFAULT_POMO: PomoSettings = { focus: 25, short: 5, long: 15, every: 4, auto: true, travel: true };

export function loadPomo(): PomoSave {
  const s = store.load<PomoSave>(KEY);
  const base: PomoSave = { version: 1, settings: { ...DEFAULT_POMO }, day: today(), today: 0, todayMinutes: 0, introSeen: false };
  if (!s || s.version !== 1) return base;
  const out = { ...base, ...s, settings: { ...DEFAULT_POMO, ...s.settings } };
  if (out.day !== today()) {
    out.day = today();
    out.today = 0;
    out.todayMinutes = 0;
  }
  return out;
}

export function savePomo(s: PomoSave) {
  store.save(KEY, s);
}

export const kindLabel = (k: PomoKind) => (k === 'focus' ? tr('Foco', 'Focus') : k === 'short' ? tr('Pausa corta', 'Short break') : tr('Pausa larga', 'Long break'));

/**
 * Pomodoro clock. Runs on wall-clock time (not frame time) so it stays exact when the
 * tab is in the background and rendering stops.
 */
export class PomodoroTimer {
  kind: PomoKind = 'focus';
  /** Focus session number within the current cycle (1..every). */
  index = 1;
  running = false;
  /** The segment ended and `auto` is off: waiting for the player. */
  waiting = false;
  private endsAt = 0;
  private left: number;

  constructor(public settings: PomoSettings) {
    this.left = this.duration('focus');
  }

  duration(kind: PomoKind) {
    const s = this.settings;
    return (kind === 'focus' ? s.focus : kind === 'short' ? s.short : s.long) * 60;
  }

  /** Seconds left in the current segment. */
  remaining(now = Date.now()) {
    return this.running ? Math.max(0, (this.endsAt - now) / 1000) : this.left;
  }

  /** 0..1 elapsed fraction of the current segment. */
  progress(now = Date.now()) {
    const d = this.duration(this.kind);
    return d > 0 ? 1 - this.remaining(now) / d : 1;
  }

  start(now = Date.now()) {
    this.waiting = false;
    this.running = true;
    this.endsAt = now + this.left * 1000;
  }

  pause(now = Date.now()) {
    if (!this.running) return;
    this.left = this.remaining(now);
    this.running = false;
  }

  toggle(now = Date.now()) {
    if (this.running) this.pause(now);
    else this.start(now);
  }

  /** Fresh cycle with the current settings (keeps nothing running). */
  reset() {
    this.kind = 'focus';
    this.index = 1;
    this.running = false;
    this.waiting = false;
    this.left = this.duration('focus');
  }

  /** The segment that follows the current one. */
  get nextKind(): PomoKind {
    if (this.kind !== 'focus') return 'focus';
    return this.index >= this.settings.every ? 'long' : 'short';
  }

  /** Jumps to the next segment; it starts right away unless `hold`. */
  advance(hold: boolean, now = Date.now()) {
    const next = this.nextKind;
    if (this.kind === 'long') this.index = 1;
    else if (this.kind === 'short') this.index++;
    this.kind = next;
    this.left = this.duration(next);
    this.running = false;
    this.waiting = hold;
    if (!hold) this.start(now);
  }

  /**
   * Call regularly. When the running segment reaches zero, returns the kind that just
   * finished and moves on (or waits, if `auto` is off).
   */
  check(now = Date.now()): PomoKind | null {
    if (!this.running || now < this.endsAt) return null;
    const done = this.kind;
    this.left = 0;
    this.advance(!this.settings.auto, now);
    return done;
  }
}
