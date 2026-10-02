import { h } from '../../../ui/Hud';
import { TAU, clamp } from '../../../utils/math';
import { Minigame } from './Minigame';
import { CONSTELLATIONS, drawFigure, drawStar, placeFigure, type ConstellationDef } from './constellations';

interface SkyStar {
  x: number;
  y: number;
  r: number;
  /** Index in the constellation figure, or -1 for a decoy. */
  idx: number;
  tw: number;
}

interface BadLine {
  a: number;
  b: number;
  t: number;
}

type Stage = 'play' | 'done' | 'out';

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * "Constelaciones": find a figure hidden among the stars of the observatory sky and
 * join its stars. New constellations stay in your sky (only visible from the
 * observatory) and add a permanent production bonus.
 */
export class ConstellationGame extends Minigame {
  private def!: ConstellationDef;
  private fresh = false;
  private canvas!: HTMLCanvasElement;
  private g2!: CanvasRenderingContext2D;
  private card!: HTMLElement;
  private stars: SkyStar[] = [];
  private figure: [number, number][] = [];
  private want = new Set<string>();
  private drawn = new Set<string>();
  private bad: BadLine[] = [];
  private from = -1;
  private px = 0;
  private py = 0;
  private dragging = false;
  private stage: Stage = 'play';
  private stageT = 0;
  private limit = 40;
  private left = 40;
  private mistakes = 0;
  private score = 0;
  private sinceGood = 0;
  private hintStar = -1;
  private dpr = 1;

  start() {
    const c = this.ctx;
    const done = new Set(c.obs.constellations);
    const next = CONSTELLATIONS.find((d) => !done.has(d.id));
    this.fresh = !!next;
    this.def = next ?? CONSTELLATIONS[Math.floor(c.rng() * CONSTELLATIONS.length)];
    for (const [a, b] of this.def.edges) this.want.add(edgeKey(a, b));
    this.limit = 30 + this.def.edges.length * 4;
    this.left = this.limit;

    this.canvas = h('canvas', 'mg-canvas') as HTMLCanvasElement;
    c.layer.appendChild(this.canvas);
    this.g2 = this.canvas.getContext('2d')!;
    this.card = h('div', 'cst-card panel');
    c.layer.appendChild(this.card);
    const prev = h('canvas') as HTMLCanvasElement;
    prev.width = 150;
    prev.height = 110;
    this.card.innerHTML = `<div class="label">${this.fresh ? 'Nueva constelación' : 'Repaso'}</div><b>${this.def.name}</b>`;
    this.card.appendChild(prev);
    this.card.appendChild(h('small', '', `${this.def.pts.length} estrellas · ${this.def.edges.length} trazos`));
    const pg = prev.getContext('2d')!;
    drawFigure(pg, this.def, placeFigure(this.def, 75, 55, 86, 0), 1, false);

    this.layout();
    c.layer.classList.add('dim');
    c.hud.set({ title: '✧ Constelaciones', combo: '', progress: 1, hint: `Encuentra <b>${this.def.name}</b> entre las estrellas y une sus puntos ${this.ctx.game.input.touchMode ? 'tocando una estrella y luego otra' : 'arrastrando de estrella a estrella'}` });
    c.hud.banner(this.def.name, this.fresh ? 'Encuéntrala en el cielo y dibújala' : 'Ya es tuya: dibújala más rápido que nunca', 1.6);
  }

  /** Places the figure (rotated, scaled) and the decoy stars on the screen. */
  private layout() {
    const r = this.ctx.rng;
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = W * this.dpr;
    this.canvas.height = H * this.dpr;
    const x0 = W * 0.08;
    const x1 = W * 0.92;
    const y0 = W < 760 ? 190 : 120;
    const y1 = H - 70;
    const size = Math.min(x1 - x0, y1 - y0) * (0.55 + r() * 0.15);
    const rot = this.fresh ? (r() - 0.5) * 0.5 : (r() - 0.5) * TAU;
    const cx = x0 + size * 0.62 + r() * Math.max(0, x1 - x0 - size * 1.24);
    const cy = y0 + size * 0.62 + r() * Math.max(0, y1 - y0 - size * 1.24);
    this.figure = placeFigure(this.def, cx, cy, size, rot);
    this.stars = this.figure.map(([x, y], idx) => ({ x, y, r: 2.6 + r() * 1, idx, tw: r() * TAU }));
    const plays = this.ctx.obs.plays.constellations ?? 0;
    const decoys = 10 + this.def.pts.length + Math.min(10, plays);
    for (let k = 0, tries = 0; k < decoys && tries < 600; tries++) {
      const x = x0 + r() * (x1 - x0);
      const y = y0 + r() * (y1 - y0);
      if (this.stars.some((s) => Math.hypot(s.x - x, s.y - y) < 46)) continue;
      this.stars.push({ x, y, r: 1.3 + r() * 2, idx: -1, tw: r() * TAU });
      k++;
    }
  }

  private starAt(x: number, y: number) {
    const reach = this.g.input.touchMode ? 34 : 26;
    let best = -1;
    let bd = reach;
    this.stars.forEach((s, i) => {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  onDown(x: number, y: number) {
    if (this.stage !== 'play') return;
    this.px = x;
    this.py = y;
    const i = this.starAt(x, y);
    if (i < 0) {
      this.from = -1;
      return;
    }
    if (this.from >= 0 && this.from !== i) {
      // Tap-tap mode: second star of a pair.
      this.connect(this.from, i);
      this.from = -1;
      return;
    }
    this.from = i;
    this.dragging = true;
    this.g.audio.ui('hover');
  }

  onMove(x: number, y: number) {
    this.px = x;
    this.py = y;
  }

  onUp(x: number, y: number) {
    if (!this.dragging) return;
    this.dragging = false;
    const i = this.starAt(x, y);
    if (i >= 0 && i !== this.from) {
      this.connect(this.from, i);
      this.from = -1;
    }
    // Releasing on the same star keeps it selected for a tap-tap connection.
  }

  private connect(a: number, b: number) {
    const sa = this.stars[a];
    const sb = this.stars[b];
    const key = sa.idx >= 0 && sb.idx >= 0 ? edgeKey(sa.idx, sb.idx) : '';
    const hud = this.ctx.hud;
    if (key && this.want.has(key) && !this.drawn.has(key)) {
      this.drawn.add(key);
      this.score += 100;
      this.sinceGood = 0;
      this.hintStar = -1;
      this.g.audio.note(this.drawn.size + 1, 0.8, 0.1);
      hud.pop('+100', (sa.x + sb.x) / 2, (sa.y + sb.y) / 2 - 12, '#ffe6a8', 16);
      if (this.drawn.size === this.want.size) this.complete();
      return;
    }
    if (key && this.drawn.has(key)) return;
    this.mistakes++;
    this.score = Math.max(0, this.score - 50);
    this.left = Math.max(0, this.left - 3);
    this.bad.push({ a, b, t: 0.6 });
    this.g.audio.buzz();
    hud.pop('✕ −3 s', (sa.x + sb.x) / 2, (sa.y + sb.y) / 2 - 12, '#ff8a8a', 15);
  }

  private complete() {
    this.stage = 'done';
    this.stageT = 0;
    this.score += 500 + Math.round(this.left * 20);
    this.g.audio.achievement();
    this.g.pipe.bloomBoost = 0.6;
    this.ctx.hud.banner(this.def.name, this.def.fact, 3.2);
  }

  protected step(dt: number) {
    const c = this.ctx;
    this.stageT += dt;
    if (this.stage === 'play') {
      this.left -= dt;
      this.sinceGood += dt;
      if (this.sinceGood > 10 && this.hintStar < 0) {
        // Hint: pulse one end of a missing line.
        const miss = this.def.edges.find(([a, b]) => !this.drawn.has(edgeKey(a, b)));
        if (miss) this.hintStar = miss[0];
      }
      if (this.left <= 0) {
        this.left = 0;
        this.stage = 'out';
        this.stageT = 0;
        this.g.audio.warning();
        c.hud.banner('¡Se acabó el tiempo!', `Te faltaron ${this.want.size - this.drawn.size} trazos`, 2);
      }
    } else if (this.stageT > (this.stage === 'done' ? 3.4 : 2.2)) this.finish(false);
    this.bad = this.bad.filter((b) => (b.t -= dt) > 0);
    this.draw();
    c.hud.set({
      score: `${this.score.toLocaleString('es')} pts`,
      combo: `${this.drawn.size}/${this.want.size} trazos`,
      timer: `${Math.ceil(this.left)} s`,
      progress: this.left / this.limit,
    });
  }

  private draw() {
    const g = this.g2;
    const d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const time = this.t;
    // Lines already drawn.
    g.save();
    g.lineCap = 'round';
    g.lineWidth = this.stage === 'done' ? 2.6 : 2;
    g.strokeStyle = this.stage === 'done' ? `rgba(255, 220, 150, ${0.75 + 0.25 * Math.sin(time * 6)})` : 'rgba(255, 214, 140, 0.85)';
    g.shadowColor = 'rgba(255, 190, 90, 1)';
    g.shadowBlur = this.stage === 'done' ? 16 : 9;
    g.beginPath();
    for (const key of this.drawn) {
      const [a, b] = key.split('-').map(Number);
      const pa = this.figure[a];
      const pb = this.figure[b];
      g.moveTo(pa[0], pa[1]);
      g.lineTo(pb[0], pb[1]);
    }
    g.stroke();
    // Wrong attempts flash red.
    for (const bl of this.bad) {
      g.strokeStyle = `rgba(255, 90, 90, ${bl.t / 0.6})`;
      g.shadowColor = 'rgba(255, 60, 60, 1)';
      g.beginPath();
      g.moveTo(this.stars[bl.a].x, this.stars[bl.a].y);
      g.lineTo(this.stars[bl.b].x, this.stars[bl.b].y);
      g.stroke();
    }
    // The line being drawn.
    if (this.from >= 0 && this.stage === 'play') {
      const s = this.stars[this.from];
      g.strokeStyle = 'rgba(220, 235, 255, 0.7)';
      g.shadowColor = 'rgba(160, 200, 255, 1)';
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(this.px, this.py);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    // Stars.
    this.stars.forEach((s, i) => {
      const tw = 0.65 + 0.35 * Math.sin(time * 2.2 + s.tw);
      const sel = i === this.from;
      const glowUp = this.stage === 'done' && s.idx >= 0;
      drawStar(g, s.x, s.y, s.r * (sel ? 1.6 : glowUp ? 1.4 : 1), sel || glowUp ? 1 : tw);
      if (i === this.from || (this.hintStar >= 0 && s.idx === this.hintStar)) {
        g.save();
        g.strokeStyle = sel ? 'rgba(160, 210, 255, 0.9)' : `rgba(255, 214, 140, ${0.5 + 0.5 * Math.sin(time * 8)})`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(s.x, s.y, 14 + (sel ? 0 : 4 * Math.sin(time * 8)), 0, TAU);
        g.stroke();
        g.restore();
      }
    });
    if (this.stage === 'done') drawFigure(g, this.def, this.figure, clamp(this.stageT), true, time);
  }

  finish(quit: boolean) {
    if (this.result) return;
    const ok = this.stage === 'done' || (this.drawn.size === this.want.size && this.want.size > 0);
    const pct = this.left / this.limit;
    const stars = !ok || quit ? 0 : this.mistakes === 0 && pct >= 0.4 ? 3 : this.mistakes <= 2 ? 2 : 1;
    const isNew = ok && this.fresh;
    this.result = {
      score: this.score,
      stars,
      rewardSeconds: ok ? Math.max(40, 70 + this.left * 2 + (isNew ? 60 : 0) - this.mistakes * 5) : this.drawn.size * 6,
      lines: [
        ok ? `Dibujaste <b>${this.def.name}</b>${isNew ? ' · <b style="color:#ffd36b">¡nueva en tu cielo!</b>' : ''}` : `${this.def.name}: <b>${this.drawn.size}/${this.want.size}</b> trazos`,
        `Errores <b>${this.mistakes}</b> · tiempo sobrante <b>${Math.ceil(this.left)} s</b>`,
        ok ? `<i>${this.def.fact}</i>` : '',
      ].filter(Boolean),
      constellation: isNew ? this.def.id : undefined,
    };
  }

  dispose() {
    this.ctx.layer.classList.remove('dim');
    this.canvas.remove();
    this.card.remove();
  }
}
