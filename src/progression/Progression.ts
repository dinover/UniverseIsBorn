import type { EventBus, GameEvents } from '../core/Events';
import type { MetaState, RunState, SandboxState, SaveSystem, Stats } from '../persistence/SaveSystem';
import { codexById } from './Codex';

/** Owns meta-progression (achievements, codex, stats, settings) and the current run. */
export class Progression {
  meta: MetaState;
  run: RunState | null = null;
  private dirty = false;
  private saveTimer = 0;

  constructor(private save: SaveSystem, private bus: EventBus<GameEvents>) {
    this.meta = save.loadMeta();
  }

  achieve(id: string) {
    if (this.meta.achievements[id]) return;
    this.meta.achievements[id] = Date.now();
    this.dirty = true;
    this.bus.emit('achievement', { id });
  }

  discover(id: string) {
    if (!codexById(id)) return;
    if (this.meta.codex[id]) return;
    this.meta.codex[id] = true;
    this.dirty = true;
    this.bus.emit('discovery', { id });
  }

  markRead(id: string) {
    if (this.meta.codexRead[id]) return;
    this.meta.codexRead[id] = true;
    this.dirty = true;
    if (Object.keys(this.meta.codexRead).length >= 8) this.achieve('scholar');
  }

  add(key: keyof Stats, v: number) {
    this.meta.stats[key] += v;
    this.dirty = true;
  }

  max(key: keyof Stats, v: number) {
    if (v > this.meta.stats[key]) {
      this.meta.stats[key] = v;
      this.dirty = true;
    }
  }

  tutorialSeen(id: string) {
    return !!this.meta.tutorials[id];
  }
  markTutorial(id: string) {
    this.meta.tutorials[id] = true;
    this.dirty = true;
  }

  saveRunNow() {
    if (this.run) this.save.saveRun(this.run);
    this.flushMeta();
  }

  flushMeta() {
    this.save.saveMeta(this.meta);
    this.dirty = false;
  }

  clearRun() {
    this.run = null;
    this.save.clearRun();
  }

  loadRun() {
    return this.save.loadRun();
  }

  loadSandbox() {
    return this.save.loadSandbox();
  }

  saveSandbox(s: SandboxState) {
    this.save.saveSandbox(s);
  }

  /** Free mode unlocks once the story has been completed. */
  get sandboxUnlocked() {
    return this.meta.stats.runsCompleted > 0 || !!this.save.loadSandbox();
  }

  update(dt: number, playing: boolean) {
    if (playing) {
      this.meta.stats.timePlayed += dt;
      if (this.run) this.run.time += dt;
    }
    this.saveTimer += dt;
    if (this.saveTimer > 10) {
      this.saveTimer = 0;
      if (this.dirty) this.flushMeta();
    }
  }
}
