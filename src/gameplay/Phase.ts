import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { PhaseId, RunCarry } from '../persistence/SaveSystem';
import type { AbilitySpec } from '../ui/Hud';

/**
 * Base class for a gameplay phase (one or several evolutionary stages).
 * Provides lifecycle, scene ownership and helpers for scripted cinematic sequences.
 */
export abstract class Phase {
  group = new THREE.Group();
  t = 0;
  alive = true;
  /** True while a scripted cinematic owns the camera/controls. */
  cinematic = false;
  /** Whether the gameplay HUD is shown while this phase runs. */
  showHud = true;
  /** Keep running when the tab is hidden (e.g. a study timer) instead of auto-pausing. */
  allowBackground = false;
  private waiters: { at: number; resolve: () => void }[] = [];
  private disposables: { dispose(): void }[] = [];
  abstract id: PhaseId;

  constructor(protected game: Game, protected carry: RunCarry) {}

  get ctx() {
    return this.game;
  }

  abstract enter(): void;
  abstract update(dt: number): void;

  /** Optional: debug shortcut to finish the phase quickly (QA). */
  debugSkip(): void {}
  /** Optional: debug helper to add progress. */
  debugBoost(): void {}

  /** Optional: phase-specific help for the "?" button. Returns true if it handled it. */
  help(): boolean {
    return false;
  }

  /** Primary/secondary labels for touch buttons. */
  touchLabels(): [string | null, string | null] {
    return [null, null];
  }

  exit() {
    this.alive = false;
    this.game.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    for (const w of this.waiters) w.resolve();
    this.waiters = [];
  }

  track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  /** Called by Game each frame; advances waiters, then the phase. */
  tick(dt: number) {
    this.t += dt;
    if (this.waiters.length) {
      const ready = this.waiters.filter((w) => w.at <= this.t);
      if (ready.length) {
        this.waiters = this.waiters.filter((w) => w.at > this.t);
        for (const w of ready) w.resolve();
      }
    }
    this.update(dt);
  }

  /** Resolves after `s` seconds of (unpaused) phase time. */
  wait(s: number): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ at: this.t + s, resolve }));
  }

  /** Waits until predicate is true (checked each frame). */
  async until(pred: () => boolean) {
    while (this.alive && !pred()) await this.wait(0);
  }

  tutorial(id: string, html: string, seconds = 7) {
    const p = this.game.prog;
    if (p.tutorialSeen(id)) return false;
    p.markTutorial(id);
    this.game.hud.hint(html, seconds);
    return true;
  }

  abilities(list: AbilitySpec[]) {
    this.game.hud.setAbilities(list);
  }

  keyLabel(primary: boolean) {
    if (this.game.input.touchMode) return primary ? 'BOTÓN' : 'BOTÓN 2';
    return primary ? 'CLIC' : 'CLIC DER';
  }
}
