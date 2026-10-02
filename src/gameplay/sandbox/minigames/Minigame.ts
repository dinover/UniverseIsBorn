import * as THREE from 'three';
import type { Game } from '../../../core/Game';
import type { ObsState } from '../../../persistence/SaveSystem';
import type { GalaxyField } from '../../../vfx/GalaxyField';
import { h } from '../../../ui/Hud';

export interface MinigameResult {
  score: number;
  /** 0..3 */
  stars: number;
  /** Paid as this many seconds of the galaxy's production. */
  rewardSeconds: number;
  /** Summary lines for the results card (HTML allowed). */
  lines: string[];
  /** Value compared with the stored record (defaults to `score`). */
  record?: number;
  /** How the record is shown, e.g. "nivel 7". */
  recordLabel?: (v: number) => string;
  achievements?: string[];
  /** Look keys unlocked by this game (observatory exclusives). */
  unlocks?: string[];
  /** Constellation completed for the first time. */
  constellation?: string;
}

export interface MinigameCtx {
  game: Game;
  /** Scene group for the game's 3D objects (owned by the galaxy phase). */
  group: THREE.Group;
  gal: GalaxyField;
  /** Full-screen layer that receives the game's pointer input and holds its UI. */
  layer: HTMLElement;
  hud: MgHud;
  /** Galaxy size multiplier and default camera distance. */
  S: number;
  view: number;
  obs: ObsState;
  /** Stored record for this game (0 if none). */
  best: number;
  /** Stardust paid per reward-second (production, already reduced in practice mode). */
  unit: number;
  /** Phase time: the galaxy rotates with it. */
  time: () => number;
  rng: () => number;
}

/** Small HUD shared by every minigame: title, score, combo, timer, hint and pop-up texts. */
export class MgHud {
  root: HTMLElement;
  private title: HTMLElement;
  private score: HTMLElement;
  private combo: HTMLElement;
  private timer: HTMLElement;
  private bar: HTMLElement;
  private hintEl: HTMLElement;
  private bannerEl: HTMLElement;
  private bannerT = 0;

  constructor(parent: HTMLElement, onQuit: () => void) {
    this.root = h('div', 'mg-ui');
    this.root.innerHTML = `
      <div class="mg-hud panel"><div class="mg-title"></div><div class="mg-stats"><span class="mg-score"></span><span class="mg-combo"></span><span class="mg-timer"></span></div><div class="mg-bar"><i></i></div></div>
      <button class="mg-quit interactive" title="Salir del minijuego">✕</button>
      <div class="mg-hint"></div>
      <div class="mg-banner"></div>`;
    parent.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.title = q('.mg-title');
    this.score = q('.mg-score');
    this.combo = q('.mg-combo');
    this.timer = q('.mg-timer');
    this.bar = q('.mg-bar');
    this.hintEl = q('.mg-hint');
    this.bannerEl = q('.mg-banner');
    const quit = q('.mg-quit');
    quit.addEventListener('pointerdown', (e) => e.stopPropagation());
    quit.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).blur();
      onQuit();
    });
  }

  set(o: { title?: string; score?: string; combo?: string; timer?: string; progress?: number | null; hint?: string }) {
    const put = (el: HTMLElement, v: string | undefined) => {
      if (v !== undefined && el.innerHTML !== v) el.innerHTML = v;
    };
    put(this.title, o.title);
    put(this.score, o.score);
    put(this.combo, o.combo);
    put(this.timer, o.timer);
    put(this.hintEl, o.hint);
    if (o.progress !== undefined) {
      this.bar.style.display = o.progress === null ? 'none' : '';
      if (o.progress !== null) (this.bar.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, o.progress)) * 100}%`;
    }
  }

  /** Floating text at a screen position (px). */
  pop(text: string, x: number, y: number, color = '#fff', size = 18) {
    const el = h('div', 'mg-pop', text);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  /** Big centred message (countdowns, "¡COLAPSO!", level up…). */
  banner(big: string, small = '', seconds = 1.4) {
    this.bannerEl.innerHTML = `<b>${big}</b>${small ? `<small>${small}</small>` : ''}`;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.bannerT = seconds;
  }

  update(dt: number) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.classList.remove('show');
    }
  }

  reset() {
    this.set({ title: '', score: '', combo: '', timer: '', progress: null, hint: '' });
    this.bannerEl.classList.remove('show');
    this.bannerT = 0;
    this.root.querySelectorAll('.mg-pop').forEach((e) => e.remove());
  }

  dispose() {
    this.root.remove();
  }
}

/**
 * A free-mode minigame. The observatory drives it: `start()`, then `tick(dt)` every
 * frame until `result` is set (by the game itself or by `finish(true)` on quit).
 */
export abstract class Minigame {
  result: MinigameResult | null = null;
  /** Galaxy brightness while this game runs (1 = untouched). */
  galaxyFade = 1;
  protected t = 0;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();

  constructor(protected ctx: MinigameCtx) {}

  abstract start(): void;
  protected abstract step(dt: number): void;
  /** Ends the game now and fills `result` (`quit`: the player left early). */
  abstract finish(quit: boolean): void;

  onDown(_x: number, _y: number) {}
  onMove(_x: number, _y: number) {}
  onUp(_x: number, _y: number) {}
  /** Keyboard (lower-case `KeyboardEvent.key`). */
  onKey(_key: string) {}

  tick(dt: number) {
    if (this.result) return;
    this.t += dt;
    this.step(dt);
  }

  /** Releases DOM and GPU resources. */
  dispose() {}

  protected get g() {
    return this.ctx.game;
  }

  /** World → screen (px). `ok` is false when the point is behind the camera. */
  protected project(p: THREE.Vector3) {
    const v = p.clone().project(this.g.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, ok: v.z < 1 };
  }

  /** Screen (px) → point on the horizontal plane y = `planeY`. */
  protected worldAt(x: number, y: number, planeY = 0) {
    this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.g.camera);
    this.plane.constant = -planeY;
    return this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  /** Stars from a score and three thresholds. */
  protected starsFor(score: number, th: [number, number, number]) {
    return score >= th[2] ? 3 : score >= th[1] ? 2 : score >= th[0] ? 1 : 0;
  }
}
