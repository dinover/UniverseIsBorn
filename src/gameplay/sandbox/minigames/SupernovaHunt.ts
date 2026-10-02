import * as THREE from 'three';
import { SpriteBatch } from '../../../vfx/SpriteBatch';
import { Ring } from '../../../vfx/Effects';
import { TAU, clamp, lerp } from '../../../utils/math';
import { Minigame } from './Minigame';

type Kind = 'normal' | 'gold' | 'stable';

interface Target {
  a: number;
  th: number;
  h: number;
  born: number;
  life: number;
  kind: Kind;
  pos: THREE.Vector3;
  ring: Ring;
  alive: boolean;
}

interface Burst {
  pos: THREE.Vector3;
  t: number;
  gold: boolean;
}

const DUR = 40;
const LEAD = 1.6; // countdown before the first supernova
const STARS: [number, number, number] = [2500, 6000, 10000];

/**
 * "Lluvia de supernovas": stars about to explode appear all over the galaxy with a
 * closing ring. Click them as the ring meets the star. Golden ones are worth triple
 * and add time; stable blue stars are a trap. Combos raise the multiplier.
 */
export class SupernovaHunt extends Minigame {
  private targets: Target[] = [];
  private bursts: Burst[] = [];
  private pool: Ring[] = [];
  private glow!: SpriteBatch;
  private star!: SpriteBatch;
  private spawnT = 0;
  private end = DUR;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private perfect = 0;
  private good = 0;
  private miss = 0;
  private trapped = 0;
  private pxWorld = 1;

  start() {
    const c = this.ctx;
    this.glow = new SpriteBatch(1500, 'glow', { stretch: 0 });
    this.star = new SpriteBatch(64, 'star', { stretch: 0 });
    this.glow.mesh.renderOrder = 11;
    this.star.mesh.renderOrder = 12;
    c.group.add(this.glow.mesh, this.star.mesh);
    this.g.rig.animate({ distance: c.view * 0.95, pitch: 1.2 }, 1.4);
    c.hud.set({ title: '✸ Lluvia de supernovas', progress: 1, hint: 'Toca cada estrella cuando el anillo la alcance · las <b style="color:#ffd36b">doradas</b> valen ×3 y suman tiempo · <b style="color:#8fb4ff">evita las azules estables</b>' });
    c.hud.banner('¡Prepárate!', 'Atrapa las supernovas justo cuando estallan', LEAD);
  }

  private get progress() {
    return clamp((this.t - LEAD) / DUR);
  }

  private spawn() {
    const r = this.ctx.rng;
    const p = this.progress;
    const u = r();
    const kind: Kind = u < 0.09 ? 'gold' : u < 0.09 + (this.t > LEAD + 5 ? 0.14 : 0) ? 'stable' : 'normal';
    const life = kind === 'stable' ? 2.4 : lerp(1.75, 1.05, p) * (kind === 'gold' ? 0.8 : 1);
    // Keep new targets apart from the living ones (screen space).
    let best: Target | null = null;
    for (let tries = 0; tries < 8; tries++) {
      const t: Target = { a: 0.12 + 0.8 * Math.sqrt(r()), th: r() * TAU, h: (r() - 0.5) * 0.6, born: this.t, life, kind, pos: new THREE.Vector3(), ring: this.ring(), alive: true };
      this.ctx.gal.orbitPos(t.a, t.th, t.h, this.ctx.time(), t.pos);
      const s = this.project(t.pos);
      const margin = 70;
      if (s.x < margin || s.x > window.innerWidth - margin || s.y < 110 || s.y > window.innerHeight - 90) {
        this.release(t.ring);
        continue;
      }
      const clear = this.targets.every((o) => !o.alive || Math.hypot(this.project(o.pos).x - s.x, this.project(o.pos).y - s.y) > 90);
      if (clear) {
        best = t;
        break;
      }
      this.release(t.ring);
    }
    if (best) this.targets.push(best);
  }

  private ring() {
    const r = this.pool.pop() ?? new Ring(0xffffff, true, 0.05);
    if (!r.parent) this.ctx.group.add(r);
    r.visible = true;
    return r;
  }
  private release(r: Ring) {
    r.opacity = 0;
    this.pool.push(r);
  }

  private mult() {
    return Math.min(3, 1 + 0.25 * Math.floor(this.combo / 4));
  }

  onDown(x: number, y: number) {
    if (this.t < LEAD || this.result) return;
    let hit: Target | null = null;
    let bd = Infinity;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const s = this.project(t.pos);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) {
        bd = d;
        hit = t;
      }
    }
    const audio = this.g.audio;
    if (!hit || bd > 46) {
      // Clicking empty space breaks the combo: no spamming.
      if (this.combo > 0) this.ctx.hud.pop('✕ combo', x, y, '#ff8a8a', 14);
      this.combo = 0;
      audio.buzz();
      return;
    }
    hit.alive = false;
    this.release(hit.ring);
    if (hit.kind === 'stable') {
      this.trapped++;
      this.combo = 0;
      this.score = Math.max(0, this.score - 150);
      audio.buzz();
      this.ctx.hud.pop('¡ESTABLE! −150', x, y - 20, '#8fb4ff', 18);
      return;
    }
    const ph = (this.t - hit.born) / hit.life;
    const q = ph >= 0.8 ? 'perfect' : ph >= 0.45 ? 'good' : 'early';
    const base = q === 'perfect' ? 100 : q === 'good' ? 50 : 25;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const pts = Math.round(base * (hit.kind === 'gold' ? 3 : 1) * this.mult());
    this.score += pts;
    if (q === 'perfect') this.perfect++;
    else this.good++;
    if (hit.kind === 'gold' && this.end < DUR + 8) this.end += 1;
    this.bursts.push({ pos: hit.pos.clone(), t: 0, gold: hit.kind === 'gold' });
    this.g.pipe.final.shockwave(hit.pos.clone(), q === 'perfect' ? 0.35 : 0.2, 0.8, 0.22);
    audio.hit(q === 'perfect' ? 'perfect' : 'good', this.combo);
    const label = q === 'perfect' ? '¡PERFECTO!' : q === 'good' ? 'BIEN' : 'PRONTO';
    const col = hit.kind === 'gold' ? '#ffd36b' : q === 'perfect' ? '#ffffff' : '#bfe0ff';
    this.ctx.hud.pop(`${label} +${pts}${hit.kind === 'gold' && this.end < DUR + 8 ? ' · +1 s' : ''}`, x, y - 24, col, q === 'perfect' ? 20 : 16);
  }

  protected step(dt: number) {
    const c = this.ctx;
    const time = c.time();
    const cam = this.g.camera;
    // World units per pixel at the galaxy, so sprites keep a constant screen size.
    const fov = (cam.fov * Math.PI) / 180;
    this.pxWorld = (2 * this.g.rig.effectiveDistance * Math.tan(fov / 2)) / window.innerHeight;
    const px = this.pxWorld;

    const running = this.t >= LEAD && this.t < LEAD + this.end;
    if (running) {
      this.spawnT -= dt;
      const alive = this.targets.filter((t) => t.alive).length;
      if (this.spawnT <= 0 && alive < 6) {
        this.spawn();
        const p = this.progress;
        this.spawnT = lerp(0.95, 0.38, p) * (0.75 + c.rng() * 0.5);
      }
    }

    const glow = this.glow;
    const star = this.star;
    glow.begin();
    star.begin();
    for (const t of this.targets) {
      if (!t.alive) continue;
      c.gal.orbitPos(t.a, t.th, t.h, time, t.pos);
      const ph = (this.t - t.born) / t.life;
      if (t.kind === 'stable') {
        if (ph >= 1) {
          t.alive = false;
          this.release(t.ring);
          continue;
        }
        const fade = Math.min(1, ph * 6, (1 - ph) * 6);
        star.push(t.pos.x, t.pos.y, t.pos.z, 0, 0, 0, 0.55, 0.72, 1, 0.9 * fade, 30 * px);
        glow.push(t.pos.x, t.pos.y, t.pos.z, 0, 0, 0, 0.35, 0.5, 1, 0.45 * fade * (0.8 + 0.2 * Math.sin(this.t * 6)), 60 * px);
        t.ring.opacity = 0;
        continue;
      }
      if (ph > 1.12) {
        t.alive = false;
        this.release(t.ring);
        this.miss++;
        if (this.combo >= 4) {
          const s = this.project(t.pos);
          c.hud.pop('se apagó · combo perdido', s.x, s.y - 20, '#ff9a8a', 13);
        }
        this.combo = 0;
        continue;
      }
      const gold = t.kind === 'gold';
      const swell = 1 + 0.5 * Math.min(1, ph);
      const r = gold ? 1 : 0.95;
      const gg = gold ? 0.82 : 0.9;
      const b = gold ? 0.35 : 1;
      star.push(t.pos.x, t.pos.y, t.pos.z, 0, 0, 0, r, gg, b, 0.8 + 0.5 * ph, 26 * px * swell);
      glow.push(t.pos.x, t.pos.y, t.pos.z, 0, 0, 0, r, gg * 0.85, b * 0.8, 0.25 + 0.5 * ph, 64 * px * swell);
      // The approach ring closes onto the star; it turns bright inside the perfect window.
      t.ring.position.copy(t.pos);
      t.ring.setWorldRadius(16 * px * (1 + 2.6 * Math.max(0, 1 - ph)));
      t.ring.setColor(ph >= 0.8 ? (gold ? 0xffe070 : 0xffffff) : gold ? 0xffb030 : 0x9fd6ff);
      t.ring.opacity = ph >= 0.8 ? 1 : 0.55;
      t.ring.tick(this.t, cam);
    }
    this.targets = this.targets.filter((t) => t.alive);
    // Explosions of the stars you caught.
    this.bursts = this.bursts.filter((b) => (b.t += dt) < 1.2);
    for (const b of this.bursts) {
      const k = b.t / 1.2;
      const rad = (20 + k * 140) * px;
      const al = (1 - k) * 0.9;
      const col = b.gold ? [1, 0.8, 0.35] : [0.85, 0.9, 1];
      glow.push(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 1, 0.95, 0.9, (1 - k) * 2, 70 * px * (1 - k * 0.5));
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        glow.push(b.pos.x + Math.cos(a) * rad, b.pos.y, b.pos.z + Math.sin(a) * rad, 0, 0, 0, col[0], col[1], col[2], al, 12 * px);
      }
    }
    glow.end();
    star.end();

    const left = Math.max(0, LEAD + this.end - Math.max(this.t, LEAD));
    c.hud.set({
      score: `${this.score.toLocaleString('es')} pts`,
      combo: this.combo >= 2 ? `combo ${this.combo} · ×${this.mult().toFixed(2).replace(/\.?0+$/, '')}` : '',
      timer: `${left.toFixed(1)} s`,
      progress: left / this.end,
    });
    if (!running && this.t >= LEAD && this.targets.length === 0) this.finish(false);
  }

  finish(quit: boolean) {
    if (this.result) return;
    const stars = quit ? 0 : this.starsFor(this.score, STARS);
    this.result = {
      score: this.score,
      stars,
      // Saturating: great rounds pay well, but a flawless marathon cannot break the economy.
      rewardSeconds: (quit ? 0.5 : 1) * (40 + 300 * (1 - Math.exp(-this.score / 8000))),
      lines: [
        `Perfectos <b>${this.perfect}</b> · buenos <b>${this.good}</b> · se apagaron <b>${this.miss}</b>${this.trapped ? ` · trampas <b>${this.trapped}</b>` : ''}`,
        `Combo máximo <b>${this.maxCombo}</b>`,
      ],
      achievements: stars >= 3 ? ['mg_supernova'] : [],
    };
  }

  dispose() {
    for (const t of this.targets) this.release(t.ring);
    for (const r of this.pool) {
      this.ctx.group.remove(r);
      r.geometry.dispose();
      r.mat.dispose();
    }
    this.ctx.group.remove(this.glow.mesh, this.star.mesh);
    this.glow.dispose();
    this.star.dispose();
  }
}
