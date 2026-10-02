import { h } from '../../../ui/Hud';
import { TAU, formatBig } from '../../../utils/math';
import { Minigame } from './Minigame';

type Stage = 'pause' | 'show' | 'input' | 'over';

const COLORS = ['#ff6b6b', '#ffd36b', '#7dffb2', '#6bc8ff', '#c49bff', '#ff9ad0', '#ffffff', '#ff9a4a'];
/** Reward of a completed level, in seconds of production: grows faster than the level. */
export const memoryLevelReward = (L: number) => 6 * Math.pow(L, 1.3);

/**
 * "Memoria estelar": the stars sing a melody, repeat it. Each level adds one note and
 * pays more than the previous one. From level 5 there are more stars, from level 7
 * the ring rotates and the melody speeds up.
 */
export class StarMemory extends Minigame {
  private stage: Stage = 'pause';
  private stageT = 0;
  private level = 1;
  private seq: number[] = [];
  private pos = 0;
  private nodes: HTMLButtonElement[] = [];
  private root!: HTMLElement;
  private core!: HTMLElement;
  private rot = 0;
  private lit: number[] = [];
  private shown = -1;
  private idle = 0;
  private earned = 0;
  private completed = 0;

  start() {
    const c = this.ctx;
    this.root = h('div', 'mem');
    this.core = h('div', 'mem-core');
    this.root.appendChild(this.core);
    c.layer.appendChild(this.root);
    for (let i = 0; i < 8; i++) {
      const b = h('button', 'mem-node', `<span>${i + 1}</span>`) as HTMLButtonElement;
      b.style.setProperty('--c', COLORS[i]);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.press(i);
      });
      this.root.appendChild(b);
      this.nodes.push(b);
    }
    this.lit = new Array(8).fill(0);
    for (let i = 0; i < 3; i++) this.seq.push(this.randomNode());
    this.g.rig.animate({ distance: c.view * 1.15, pitch: 1.05 }, 1.5);
    c.hud.set({ title: '♫ Memoria estelar', combo: '', progress: null, hint: 'Escucha la melodía y repítela tocando las estrellas (o con las teclas <kbd>1</kbd>–<kbd>8</kbd>)' });
    c.hud.banner('Nivel 1', 'Escucha…', 1.4);
    this.stageT = -0.6;
  }

  private get count() {
    return this.level <= 4 ? 4 : this.level <= 8 ? 6 : 8;
  }

  private randomNode() {
    return Math.floor(this.ctx.rng() * this.count);
  }

  private get on() {
    return Math.max(0.24, 0.55 - 0.025 * this.level);
  }
  private get gap() {
    return Math.max(0.08, 0.16 - 0.006 * this.level);
  }

  private flash(i: number, dur: number) {
    this.lit[i] = dur;
    this.g.audio.note(i, Math.max(0.35, dur * 1.6), 0.11);
  }

  onKey(k: string) {
    const n = Number(k);
    if (n >= 1 && n <= this.count) this.press(n - 1);
  }

  private press(i: number) {
    if (this.stage !== 'input' || i >= this.count) return;
    this.idle = 0;
    if (this.seq[this.pos] !== i) return this.wrong(i);
    this.flash(i, 0.22);
    this.pos++;
    if (this.pos >= this.seq.length) this.levelDone();
  }

  private wrong(i: number) {
    const c = this.ctx;
    this.stage = 'over';
    this.stageT = 0;
    this.g.audio.buzz();
    this.nodes[i].classList.add('bad');
    this.nodes[this.seq[this.pos]].classList.add('hint');
    c.hud.banner('¡Desafinada!', `Era la estrella ${this.seq[this.pos] + 1}`, 1.8);
  }

  private levelDone() {
    const c = this.ctx;
    const r = memoryLevelReward(this.level);
    this.earned += r;
    this.completed = this.level;
    const dust = r * c.unit;
    c.hud.pop(`Nivel ${this.level} ✓ +${formatBig(dust)} ✦`, window.innerWidth / 2, window.innerHeight * 0.3, '#ffe6a8', 20);
    this.g.audio.achievement();
    this.level++;
    this.seq.push(this.randomNode());
    this.stage = 'pause';
    this.stageT = -0.4;
    const extra = this.level === 5 ? 'Aparecen dos estrellas nuevas' : this.level === 7 ? '¡Ahora las estrellas giran!' : this.level === 9 ? 'Ocho estrellas: el coro completo' : 'Escucha…';
    c.hud.banner(`Nivel ${this.level}`, extra, 1.3);
  }

  protected step(dt: number) {
    const c = this.ctx;
    this.stageT += dt;
    for (let i = 0; i < 8; i++) this.lit[i] = Math.max(0, this.lit[i] - dt);

    if (this.stage === 'pause' && this.stageT >= 1) {
      this.stage = 'show';
      this.stageT = 0;
      this.shown = -1;
    } else if (this.stage === 'show') {
      const k = Math.floor(this.stageT / (this.on + this.gap));
      if (k !== this.shown && k < this.seq.length) {
        this.shown = k;
        this.flash(this.seq[k], this.on);
      }
      if (this.stageT >= this.seq.length * (this.on + this.gap) + 0.15) {
        this.stage = 'input';
        this.stageT = 0;
        this.pos = 0;
        this.idle = 0;
      }
    } else if (this.stage === 'input') {
      this.idle += dt;
      if (this.idle > 10) this.wrong(this.seq[this.pos]);
    } else if (this.stage === 'over' && this.stageT > 2) this.finish(false);

    // Layout: a ring of stars, spinning from level 7.
    if (this.level >= 7 && this.stage !== 'over') this.rot += dt * Math.min(1.2, 0.35 + 0.06 * (this.level - 7));
    const n = this.count;
    const R = Math.min(window.innerWidth, window.innerHeight) * (window.innerWidth < 760 ? 0.33 : 0.27);
    for (let i = 0; i < 8; i++) {
      const b = this.nodes[i];
      const show = i < n;
      b.style.display = show ? '' : 'none';
      if (!show) continue;
      const a = -Math.PI / 2 + (i / n) * TAU + this.rot;
      b.style.transform = `translate(${Math.cos(a) * R}px, ${Math.sin(a) * R}px) translate(-50%, -50%) scale(${this.lit[i] > 0 ? 1.25 : 1})`;
      b.classList.toggle('lit', this.lit[i] > 0);
      b.disabled = this.stage !== 'input';
    }
    const status = this.stage === 'input' ? `¡Tu turno! ${this.pos}/${this.seq.length}` : this.stage === 'over' ? 'Fin' : 'Escucha…';
    const html = `<b>Nivel ${this.level}</b><small>${status}</small>`;
    if (this.core.innerHTML !== html) this.core.innerHTML = html;
    c.hud.set({
      score: `Récord: nivel ${Math.max(c.best, this.completed)}`,
      timer: `Botín: ${formatBig(this.earned * c.unit)} ✦`,
    });
  }

  finish(quit: boolean) {
    if (this.result) return;
    const L = this.completed;
    const stars = L >= 10 ? 3 : L >= 7 ? 2 : L >= 4 ? 1 : 0;
    this.result = {
      score: L * 100,
      stars,
      rewardSeconds: this.earned,
      record: L,
      recordLabel: (v) => `nivel ${v}`,
      lines: [L ? `Completaste <b>${L}</b> ${L === 1 ? 'nivel' : 'niveles'} · melodía de <b>${L + 2}</b> notas` : 'No completaste ningún nivel', quit ? 'Te retiraste con el botín acumulado' : `Cada nivel paga más: el ${L + 1} habría dado ${formatBig(memoryLevelReward(L + 1) * this.ctx.unit)} ✦`],
      achievements: L >= 10 ? ['mg_memory10'] : [],
    };
  }

  dispose() {
    this.root.remove();
  }
}
