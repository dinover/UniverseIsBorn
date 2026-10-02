import * as THREE from 'three';
import { STAGES, stageDef } from '../progression/Stages';

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export interface MeterSpec {
  id: string;
  label: string;
  value: number; // 0..1
  text?: string;
  color?: string;
  warn?: boolean;
  zone?: [number, number];
}

export interface AbilitySpec {
  id: string;
  key: string;
  name: string;
  active?: boolean;
  locked?: boolean;
  charge?: number; // 0..1
}

interface Floater {
  el: HTMLElement;
  pos: THREE.Vector3;
  t: number;
  dur: number;
  rise: number;
}

interface Marker {
  el: HTMLElement;
  pos: THREE.Vector3;
  seen: boolean;
}

const ACCENTS: Record<number, [string, string]> = {
  1: ['#ffb86b', '#ffd9a8'],
  2: ['#c49bff', '#8fd3ff'],
  3: ['#ff9a4a', '#ffd06b'],
  4: ['#ffd36b', '#9fd6ff'],
  5: ['#ff5a3c', '#ff9a6b'],
  6: ['#ffffff', '#9fd6ff'],
  7: ['#7fd4ff', '#ffb86b'],
  8: ['#ffb86b', '#7fd4ff'],
  9: ['#ffa24a', '#7fd4ff'],
  10: ['#8fb4ff', '#ffb86b'],
  11: ['#ffb86b', '#7fd4ff'],
  12: ['#b48cff', '#7fd4ff'],
  13: ['#ffc98a', '#9fd6ff'],
  14: ['#d8b4ff', '#ffd6a0'],
  15: ['#c9a8ff', '#ffd6a0'],
};

/** In-game heads-up display. Minimal at first; phases progressively add meters and widgets. */
export class Hud {
  root: HTMLElement;
  private stageEl: HTMLElement;
  private objTxt: HTMLElement;
  private objBar: HTMLElement;
  private objWrap: HTMLElement;
  private massV: HTMLElement;
  private massU: HTMLElement;
  private massD: HTMLElement;
  private meters: HTMLElement;
  private meterEls = new Map<string, HTMLElement>();
  widget: HTMLElement;
  private abilities: HTMLElement;
  private hintEl: HTMLElement;
  private feelEl: HTMLElement;
  private cardEl: HTMLElement;
  private toastsEl: HTMLElement;
  private floatLayer: HTMLElement;
  helpBtn: HTMLButtonElement;
  private floaters: Floater[] = [];
  private markers = new Map<string, Marker>();
  private hintTimer = 0;
  private feelTimer = 0;
  private cardTimer = 0;
  get cardShowing() {
    return this.cardTimer > 0;
  }
  stage = 1;
  onHelp: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = h('div');
    this.root.id = 'hud';
    parent.appendChild(this.root);

    this.floatLayer = h('div');
    this.floatLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden';
    this.root.appendChild(this.floatLayer);

    this.stageEl = h('div', 'hud-stage');
    this.root.appendChild(this.stageEl);

    this.objWrap = h('div', 'hud-obj');
    this.objTxt = h('div', 'txt');
    const bar = h('div', 'bar');
    this.objBar = h('i');
    bar.appendChild(this.objBar);
    this.objWrap.append(this.objTxt, bar);
    this.root.appendChild(this.objWrap);

    const mass = h('div', 'hud-mass');
    const line = h('div');
    this.massV = h('span', 'v');
    this.massU = h('span', 'u');
    line.append(this.massV, this.massU);
    this.massD = h('div', 'd');
    mass.append(line, this.massD);
    this.root.appendChild(mass);

    this.meters = h('div', 'hud-meters');
    this.root.appendChild(this.meters);

    this.widget = h('div', 'hud-widget');
    this.root.appendChild(this.widget);

    this.abilities = h('div', 'hud-abilities');
    this.root.appendChild(this.abilities);

    this.helpBtn = h('button', 'hud-help interactive', '?') as HTMLButtonElement;
    this.helpBtn.title = '¿Qué está pasando?';
    this.helpBtn.addEventListener('click', () => this.onHelp?.());
    this.root.appendChild(this.helpBtn);

    this.hintEl = h('div', 'hint panel');
    this.root.appendChild(this.hintEl);
    this.feelEl = h('div', 'feel');
    parent.appendChild(this.feelEl);
    this.cardEl = h('div', 'titlecard');
    parent.appendChild(this.cardEl);
    this.toastsEl = h('div', 'toasts');
    parent.appendChild(this.toastsEl);
    this.setStage(1);
  }

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  setStage(n: number) {
    this.stage = n;
    this.plateKey = '';
    const def = stageDef(n);
    const [a, b] = ACCENTS[n] ?? ACCENTS[1];
    document.documentElement.style.setProperty('--accent', a);
    document.documentElement.style.setProperty('--accent-2', b);
    const track = STAGES.map((s) => `<i class="${s.n < n ? 'done' : s.n === n ? 'cur' : ''}"></i>`).join('');
    this.stageEl.innerHTML = `<div class="num">ETAPA ${String(n).padStart(2, '0')} / 15</div><div class="name">${def.name}</div><div class="track">${track}</div>`;
  }

  private plateKey = '';

  /** Replaces the stage plate with a custom one (free mode). `null` restores the stage. */
  setModePlate(kicker: string | null, name = '', sub = '') {
    if (kicker === null) {
      this.plateKey = '';
      this.setStage(this.stage);
      return;
    }
    const key = `${kicker}|${name}|${sub}`;
    if (key === this.plateKey) return;
    if (!this.plateKey) {
      const [a, b] = ACCENTS[15];
      document.documentElement.style.setProperty('--accent', a);
      document.documentElement.style.setProperty('--accent-2', b);
    }
    this.plateKey = key;
    this.stageEl.innerHTML = `<div class="num">${kicker}</div><div class="name">${name}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
  }

  setObjective(text: string, progress: number | null = null) {
    if (this.objTxt.textContent !== text) this.objTxt.textContent = text;
    this.objWrap.style.display = text ? '' : 'none';
    (this.objBar.parentElement as HTMLElement).style.display = progress === null ? 'none' : '';
    if (progress !== null) this.objBar.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  }

  setMass(value: string, unit: string, detail = '') {
    if (this.massV.textContent !== value) this.massV.textContent = value;
    if (this.massU.textContent !== unit) this.massU.textContent = unit;
    if (this.massD.textContent !== detail) this.massD.textContent = detail;
  }

  setMeters(specs: MeterSpec[]) {
    const ids = new Set(specs.map((s) => s.id));
    for (const [id, el] of this.meterEls) {
      if (!ids.has(id)) {
        el.remove();
        this.meterEls.delete(id);
      }
    }
    for (const s of specs) {
      let el = this.meterEls.get(s.id);
      if (!el) {
        el = h('div', 'meter', `<div class="top"><span class="label"></span><span class="val"></span></div><div class="b"><div class="zone"></div><i></i></div>`);
        this.meters.appendChild(el);
        this.meterEls.set(s.id, el);
      }
      (el.querySelector('.label') as HTMLElement).textContent = s.label;
      (el.querySelector('.val') as HTMLElement).textContent = s.text ?? `${Math.round(s.value * 100)}%`;
      const bar = el.querySelector('.b i') as HTMLElement;
      bar.style.width = `${Math.max(0, Math.min(1, s.value)) * 100}%`;
      el.style.setProperty('--mc', s.color ?? 'var(--accent)');
      el.classList.toggle('warn', !!s.warn);
      const zone = el.querySelector('.zone') as HTMLElement;
      if (s.zone) {
        zone.style.display = '';
        zone.style.left = `${s.zone[0] * 100}%`;
        zone.style.width = `${(s.zone[1] - s.zone[0]) * 100}%`;
      } else zone.style.display = 'none';
    }
  }

  setAbilities(list: AbilitySpec[]) {
    const key = list.map((a) => `${a.id}|${a.key}|${a.name}|${a.locked}`).join(',');
    if (this.abilities.dataset.key !== key) {
      this.abilities.dataset.key = key;
      this.abilities.innerHTML = list
        .map((a) => `<div class="ability" data-id="${a.id}"><span class="key">${a.key}</span><div><div class="n">${a.name}</div><div class="c"><i></i></div></div></div>`)
        .join('');
    }
    for (const a of list) {
      const el = this.abilities.querySelector(`[data-id="${a.id}"]`) as HTMLElement;
      if (!el) continue;
      el.classList.toggle('active', !!a.active);
      el.classList.toggle('locked', !!a.locked);
      const c = el.querySelector('.c') as HTMLElement;
      c.style.display = a.charge === undefined ? 'none' : '';
      (c.firstElementChild as HTMLElement).style.width = `${(a.charge ?? 0) * 100}%`;
    }
  }

  clearWidget() {
    this.widget.innerHTML = '';
  }

  hint(html: string, seconds = 7) {
    this.hintEl.innerHTML = `<div class="h">${html}</div>`;
    this.hintEl.classList.add('show');
    this.hintTimer = seconds;
  }

  clearHint() {
    this.hintEl.classList.remove('show');
    this.hintTimer = 0;
  }

  private feelDelay = 0;
  private pendingFeel: [string, number] | null = null;

  /** The emotional one-liner of a moment. Optional delay so it doesn't collide with title cards. */
  feel(text: string, seconds = 4.5, delay = 0) {
    if (delay > 0) {
      this.pendingFeel = [text, seconds];
      this.feelDelay = delay;
      return;
    }
    this.feelEl.textContent = text;
    this.feelEl.classList.add('show');
    this.feelTimer = seconds;
  }

  titleCard(big: string, kicker = '', sub = '', seconds = 4) {
    this.cardEl.innerHTML = `<div><div class="k">${kicker}</div><div class="b">${big}</div><div class="s">${sub}</div></div>`;
    this.cardEl.classList.add('show');
    this.cardTimer = seconds;
  }

  toast(icon: string, title: string, sub = '', onClick?: () => void) {
    const el = h('div', 'toast panel' + (onClick ? ' clickable' : ''), `<div class="i">${icon}</div><div><div class="t">${title}</div><div class="s">${sub}</div></div>`);
    if (onClick) el.addEventListener('click', onClick);
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstElementChild!.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
    }, 4800);
  }

  floater(text: string, pos: THREE.Vector3, color = '#fff', size = 14, dur = 1.4) {
    if (this.floaters.length > 30) return;
    const el = h('div', 'floater', text);
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    this.floatLayer.appendChild(el);
    this.floaters.push({ el, pos: pos.clone(), t: 0, dur, rise: 40 });
  }

  /** Keyed world-anchored label (e.g. other black holes). Call every frame it should be visible. */
  marker(id: string, pos: THREE.Vector3, html: string, cls: string) {
    let m = this.markers.get(id);
    if (!m) {
      const el = h('div', 'marker');
      this.floatLayer.appendChild(el);
      m = { el, pos: new THREE.Vector3(), seen: true };
      this.markers.set(id, m);
    }
    m.pos.copy(pos);
    m.seen = true;
    if (m.el.dataset.html !== html) {
      m.el.innerHTML = html;
      m.el.dataset.html = html;
    }
    m.el.className = 'marker ' + cls;
  }

  clearMarkers() {
    for (const m of this.markers.values()) m.el.remove();
    this.markers.clear();
  }

  update(dt: number, camera: THREE.Camera) {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
    }
    if (this.pendingFeel) {
      this.feelDelay -= dt;
      if (this.feelDelay <= 0) {
        const [t, s] = this.pendingFeel;
        this.pendingFeel = null;
        this.feel(t, s);
      }
    }
    if (this.feelTimer > 0) {
      this.feelTimer -= dt;
      if (this.feelTimer <= 0) this.feelEl.classList.remove('show');
    }
    if (this.cardTimer > 0) {
      this.cardTimer -= dt;
      if (this.cardTimer <= 0) this.cardEl.classList.remove('show');
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const v = new THREE.Vector3();
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        f.el.remove();
        return false;
      }
      v.copy(f.pos).project(camera);
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H - k * f.rise;
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + (1 - k) * 0.2})`;
      f.el.style.left = '0';
      f.el.style.top = '0';
      f.el.style.opacity = String(k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4));
      return true;
    });
    for (const [id, m] of this.markers) {
      if (!m.seen) {
        m.el.remove();
        this.markers.delete(id);
        continue;
      }
      m.seen = false;
      v.copy(m.pos).project(camera);
      let x = (v.x * 0.5 + 0.5) * W;
      let y = (-v.y * 0.5 + 0.5) * H;
      const off = v.z > 1 || x < 0 || x > W || y < 0 || y > H;
      if (off) {
        // Clamp to screen edge so the player knows where it is.
        const cx = W / 2;
        const cy = H / 2;
        let dx = x - cx;
        let dy = y - cy;
        if (v.z > 1) {
          dx = -dx;
          dy = -dy;
        }
        const s = Math.min((W / 2 - 60) / Math.abs(dx || 1e-3), (H / 2 - 60) / Math.abs(dy || 1e-3));
        x = cx + dx * s;
        y = cy + dy * s;
      }
      m.el.style.left = `${x}px`;
      m.el.style.top = `${y - (off ? 0 : 18)}px`;
      m.el.style.opacity = off ? '0.75' : '1';
    }
  }
}
