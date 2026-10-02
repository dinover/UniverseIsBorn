import * as THREE from 'three';
import { GalaxyField } from '../../../vfx/GalaxyField';
import { h } from '../../../ui/Hud';
import { Rng } from '../../../procgen/rng';
import { TAU, clamp, damp, easeInOut, lerp } from '../../../utils/math';
import { Minigame } from './Minigame';
import { int, tr } from '../../../i18n/i18n';

type Stage = 'approach' | 'pull' | 'capture' | 'escaped' | 'won';

const NEED = [4, 5, 6];
const TIME = [15, 14, 13];

/**
 * "Galaxias enanas": three dwarf galaxies fall towards yours, one after the other.
 * Press when the needle crosses the green zone to pull them in with your tide; each
 * one is faster, with a narrower (and, at the end, moving) zone. Miss and it drifts away.
 */
export class DwarfMerger extends Minigame {
  private stage: Stage = 'approach';
  private stageT = 0;
  private d = 0;
  private dwarf: GalaxyField | null = null;
  private pos = new THREE.Vector3();
  private ang = 0;
  private dist = 0;
  private hits = 0;
  private timeLeft = 0;
  private needle = 0;
  private spin = 1;
  private speed = 3;
  private zone = 0;
  private half = 0.5;
  private cd = 0;
  private score = 0;
  private combo = 0;
  private perfects = 0;
  private misses = 0;
  private captured = 0;
  private dial!: HTMLElement;
  private needleEl!: SVGElement;
  private zoneEl!: SVGPathElement;
  private perfectEl!: SVGPathElement;
  private pipsEl!: HTMLElement;
  private R = 600;

  start() {
    const c = this.ctx;
    this.R = c.gal.params.radius;
    this.dial = h('div', 'dwarf-dial panel', `
      <svg viewBox="-80 -80 160 160">
        <circle r="62" fill="rgba(6,8,16,0.6)" stroke="rgba(200,220,255,0.25)" stroke-width="2"/>
        <path class="zone" fill="none" stroke="#7dffb2" stroke-width="12" stroke-linecap="round"/>
        <path class="perfect" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" opacity="0.85"/>
        <line class="needle" x1="0" y1="0" x2="0" y2="-70" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
        <circle r="7" fill="#fff"/>
      </svg><div class="pips"></div><div class="tip">${tr('ESPACIO / toca', 'SPACE / tap')}</div>`);
    c.layer.appendChild(this.dial);
    this.needleEl = this.dial.querySelector('.needle') as SVGElement;
    this.zoneEl = this.dial.querySelector('.zone') as SVGPathElement;
    this.perfectEl = this.dial.querySelector('.perfect') as SVGPathElement;
    this.pipsEl = this.dial.querySelector('.pips') as HTMLElement;
    this.g.rig.animate({ distance: c.view * 1.75, pitch: 0.85 }, 2);
    c.hud.set({
      title: `◉ ${tr('Galaxias enanas', 'Dwarf Galaxies')}`,
      combo: '',
      hint: tr(
        'Pulsa <kbd>ESPACIO</kbd> o toca cuando la aguja cruce la <b style="color:#7dffb2">zona verde</b> (el centro blanco es perfecto). Cada acierto la acerca; cada fallo la aleja.',
        'Press <kbd>SPACE</kbd> or tap when the needle crosses the <b style="color:#7dffb2">green zone</b> (the white center is perfect). Each hit draws it closer; each miss lets it drift away.',
      ),
    });
    this.spawn();
  }

  private spawn() {
    const c = this.ctx;
    const d = this.d;
    const rng = new Rng(Math.floor(c.rng() * 1e9));
    const q = this.g.quality.profile.galaxyStars;
    this.dwarf = new GalaxyField(
      { count: Math.floor(q * 0.05) + 2000, radius: 150 * Math.sqrt(c.S), arms: rng.pick([2, 3]), twist: 2, ecc: 0.2, pattern: 0.02, vel: 22, bulge: 0.45, hueShift: rng.range(-0.8, 0.8) },
      rng,
    );
    this.dwarf.orient.setFromMatrix4(new THREE.Matrix4().makeRotationX(0.4 + c.rng() * 0.6).multiply(new THREE.Matrix4().makeRotationZ(c.rng() * 0.8)));
    this.dwarf.fade = 0;
    c.group.add(this.dwarf);
    this.ang = c.rng() * TAU;
    this.dist = this.R * 3.4;
    this.hits = 0;
    this.timeLeft = TIME[d];
    this.speed = 2.6 + d * 0.8;
    this.half = 0.5 - d * 0.06;
    this.zone = c.rng() * TAU;
    this.spin = 1;
    this.stage = 'approach';
    this.stageT = 0;
    c.hud.banner(`${tr('Galaxia enana', 'Dwarf galaxy')} ${d + 1}/3`, d === 2 ? tr('La última: su zona se mueve', 'The last one: its zone moves') : tr('Atráela con tu marea', 'Draw it in with your tide'), 1.6);
  }

  onDown() {
    this.press();
  }
  onKey(k: string) {
    if (k === ' ' || k === 'enter') this.press();
  }

  private press() {
    if (this.stage !== 'pull' || this.cd > 0) return;
    this.cd = 0.22;
    const diff = Math.abs(((this.needle - this.zone + Math.PI * 3) % TAU) - Math.PI);
    const hud = this.ctx.hud;
    const s = this.project(this.pos);
    if (diff <= this.half) {
      const perfect = diff <= this.half * 0.35;
      this.hits++;
      this.combo++;
      if (perfect) this.perfects++;
      const pts = (perfect ? 200 : 100) * (this.d + 1);
      this.score += pts;
      this.g.audio.hit(perfect ? 'perfect' : 'good', this.combo);
      this.g.shake(0.15);
      this.g.pipe.final.shockwave(this.pos.clone(), 0.3, 0.9, 0.3);
      hud.pop(`${perfect ? tr('¡PERFECTO!', 'PERFECT!') : tr('BIEN', 'GOOD')} +${pts}`, s.x, s.y - 40, perfect ? '#ffffff' : '#7dffb2', perfect ? 20 : 16);
      // Harder after every hit: faster needle, narrower zone that jumps somewhere else.
      this.speed += 0.3;
      this.half = Math.max(0.22, this.half - 0.035);
      this.zone = (this.zone + 1.6 + this.ctx.rng() * 2.4) % TAU;
      if (this.hits >= NEED[this.d]) {
        this.stage = 'capture';
        this.stageT = 0;
        this.g.audio.whoosh(0.4);
      }
    } else {
      this.misses++;
      this.combo = 0;
      this.hits = Math.max(0, this.hits - 0.5);
      this.spin *= -1;
      this.g.audio.hit('miss');
      hud.pop(`✕ ${tr('se aleja', 'drifting away')}`, s.x, s.y - 40, '#ff8a8a', 16);
    }
  }

  protected step(dt: number) {
    const c = this.ctx;
    const g = this.g;
    this.stageT += dt;
    this.cd = Math.max(0, this.cd - dt);
    const dw = this.dwarf;
    const need = NEED[Math.min(2, this.d)];

    if (this.stage === 'approach') {
      if (dw) dw.fade = clamp(this.stageT / 1.5);
      this.dist = damp(this.dist, this.R * 2.6, 1.5, dt);
      if (this.stageT > 1.6) {
        this.stage = 'pull';
        this.stageT = 0;
      }
    } else if (this.stage === 'pull') {
      this.timeLeft -= dt;
      this.needle = (this.needle + dt * this.speed * this.spin + TAU) % TAU;
      if (this.d === 2) this.zone = (this.zone - dt * 0.9 + TAU) % TAU;
      const k = this.hits / need;
      this.dist = damp(this.dist, lerp(this.R * 2.6, this.R * 0.9, k), 3, dt);
      if (this.timeLeft <= 0) {
        this.stage = 'escaped';
        this.stageT = 0;
        g.audio.warning();
        c.hud.banner(tr('Siguió su camino', 'It went its own way'), tr(`Atrajiste ${this.captured} de 3 galaxias enanas`, `You drew in ${this.captured} of 3 dwarf galaxies`), 2);
      }
    } else if (this.stage === 'capture') {
      const k = clamp(this.stageT / 2.6);
      this.dist = lerp(this.R * 0.9, 0, easeInOut(k));
      this.ang += dt * 1.6 * k;
      if (dw) {
        dw.setTidal(-this.pos.x, -this.pos.z, 1 + k * 3);
        dw.fade = 1 - clamp((k - 0.6) / 0.4);
      }
      if (k >= 1) this.captureDone();
    } else if (this.stage === 'escaped') {
      this.dist += dt * this.R * 1.5;
      if (dw) dw.fade = Math.max(0, 1 - this.stageT / 1.5);
      if (this.stageT > 2.2) this.finish(false);
    } else if (this.stage === 'won' && this.stageT > 2.8) this.finish(false);

    // Dwarf placement & tides on your galaxy.
    this.ang += dt * 0.08;
    this.pos.set(Math.cos(this.ang) * this.dist, 60 * (this.dist / (this.R * 3)), Math.sin(this.ang) * this.dist);
    if (dw) {
      dw.center.copy(this.pos);
      dw.update(c.time(), g.pipe.renderer.getPixelRatio());
      const near = clamp(1 - this.dist / (this.R * 2.6));
      c.gal.setTidal(this.pos.x, this.pos.z, near * 0.5);
      if (this.stage === 'pull' || this.stage === 'approach') {
        dw.setTidal(-this.pos.x, -this.pos.z, near * 1.2);
      }
    }
    this.renderDial(need);
    c.hud.set({
      score: `${int(this.score)} pts`,
      combo: `${tr('reunidas', 'gathered')} ${this.captured}/3`,
      timer: this.stage === 'pull' ? `${Math.max(0, this.timeLeft).toFixed(1)} s` : '',
      progress: this.stage === 'pull' ? this.timeLeft / TIME[this.d] : this.stage === 'capture' ? 1 : null,
    });
  }

  private captureDone() {
    const g = this.g;
    const c = this.ctx;
    this.captured++;
    const bonus = 800 * this.captured + Math.round(this.timeLeft * 30);
    this.score += bonus;
    g.pipe.final.doFlash(0.6, 0xe8e0ff);
    g.pipe.final.shockwave(new THREE.Vector3(), 1, 2, 1.2);
    g.pipe.bloomBoost = 1.5;
    g.audio.boom();
    g.shake(0.5);
    c.hud.banner(tr('¡Fusión!', 'Merged!'), tr(`+${bonus} pts · sus estrellas ahora son parte de tu galaxia`, `+${bonus} pts · its stars are now part of your galaxy`), 1.8);
    if (this.dwarf) {
      c.group.remove(this.dwarf);
      this.dwarf.dispose();
      this.dwarf = null;
    }
    c.gal.setTidal(0, 0, 0);
    if (this.captured >= 3) {
      this.stage = 'won';
      this.stageT = 0;
      return;
    }
    this.d++;
    this.spawn();
  }

  private renderDial(need: number) {
    const arc = (a0: number, a1: number) => {
      const p = (a: number) => `${Math.cos(a - Math.PI / 2) * 62} ${Math.sin(a - Math.PI / 2) * 62}`;
      return `M ${p(a0)} A 62 62 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
    };
    this.zoneEl.setAttribute('d', arc(this.zone - this.half, this.zone + this.half));
    this.perfectEl.setAttribute('d', arc(this.zone - this.half * 0.35, this.zone + this.half * 0.35));
    this.needleEl.setAttribute('transform', `rotate(${(this.needle * 180) / Math.PI})`);
    this.dial.classList.toggle('off', this.stage !== 'pull');
    const pips = Array.from({ length: need }, (_, i) => (i < Math.floor(this.hits) ? '●' : '○')).join(' ');
    if (this.pipsEl.textContent !== pips) this.pipsEl.textContent = pips;
  }

  finish(quit: boolean) {
    if (this.result) return;
    const n = this.captured;
    this.result = {
      score: this.score,
      stars: quit ? 0 : n,
      rewardSeconds: n * 60 + this.score / 80,
      lines: [`${tr('Galaxias enanas reunidas', 'Dwarf galaxies gathered')}: <b>${n}/3</b>`, tr(`Perfectos <b>${this.perfects}</b> · fallos <b>${this.misses}</b>`, `Perfect <b>${this.perfects}</b> · misses <b>${this.misses}</b>`)],
      achievements: n >= 3 ? ['mg_dwarf3'] : [],
    };
  }

  dispose() {
    const c = this.ctx;
    c.gal.setTidal(0, 0, 0);
    if (this.dwarf) {
      c.group.remove(this.dwarf);
      this.dwarf.dispose();
    }
    this.dial.remove();
  }
}
