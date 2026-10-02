import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { SandboxState } from '../../persistence/SaveSystem';
import type { GalaxyField } from '../../vfx/GalaxyField';
import type { JetBeam } from '../../vfx/Effects';
import { h } from '../../ui/Hud';
import { clamp, damp, formatBig, formatSolar, formatTime, smoothstep } from '../../utils/math';
import { BAR_COST, JET_OPTIONS, NEBULAE, PALETTES, STARS, TWIST_OPTIONS, astroById, lookKey, upgradeById, type AstroDef, type LookKind } from './Catalog';
import { SandboxEconomy } from './Economy';
import { MAX_VISIBLE, SandboxDecor } from './Decor';
import { ShopUi, fmtRate } from './ShopUi';
import { MINIGAMES, Observatory } from './Observatory';
import { OBS_ENERGY_MAX } from './Economy';

export interface SandboxHost {
  gal: GalaxyField;
  group: THREE.Group;
  jets: JetBeam[];
  /** Freezes the galaxy's own gameplay (observatory, minigames). */
  setBusy: (v: boolean) => void;
}

/** Per-frame values owned by the galaxy phase. */
export interface SandboxSnapshot {
  t: number;
  V: number;
  Q: number;
  M: number;
  cloudHovered: boolean;
}

/** Default camera distance for a galaxy of scale 1. */
export const SANDBOX_VIEW = 1600;

/**
 * Free mode ("modo libre"): a chill, persistent galaxy. Stardust is earned passively
 * and by playing (channelling clouds, venting the quasar, catching clusters) and spent
 * on special stars, nebulae, upgrades and the galaxy's own look. What you invest in
 * astros raises the galaxy level: it grows, you can zoom further out and earn more.
 */
export class SandboxMode {
  eco: SandboxEconomy;
  private decor: SandboxDecor;
  private shop: ShopUi;
  private btn: HTMLButtonElement;
  private badge: HTMLElement;
  private obsBtn: HTMLButtonElement;
  private obsBadge: HTMLElement;
  obs: Observatory;
  private S: number;
  private twist: number;
  private bar: number;
  private tint = new THREE.Vector3(1, 1, 1);
  private level: number;
  private saveT = 10;
  private uiT = 0;
  private rateNow = 0;
  private ventDust = 0;
  private ventT = 0;
  private M = 0;
  private t = 0;
  private seenReveal: string;
  private onKey: (e: KeyboardEvent) => void;
  private onHide: () => void;

  constructor(private game: Game, private state: SandboxState, private host: SandboxHost) {
    this.eco = new SandboxEconomy(state);
    this.M = state.mass;
    this.level = this.eco.level;
    this.S = this.eco.scale;
    this.twist = this.targetTwist();
    this.bar = state.look.bar ? 1 : 0;
    const pal = PALETTES.find((p) => p.id === state.look.palette) ?? PALETTES[0];
    this.tint.set(...pal.tint);
    this.decor = new SandboxDecor(host.group);
    this.applyLook(true);

    const hud = game.hud;
    this.btn = h('button', 'sb-shopbtn interactive', `<span class="i">✦</span>Tienda<kbd>T</kbd><em class="badge"></em>`) as HTMLButtonElement;
    this.badge = this.btn.querySelector('.badge') as HTMLElement;
    this.btn.addEventListener('click', () => {
      this.btn.blur();
      this.toggleShop();
    });
    hud.root.appendChild(this.btn);
    this.shop = new ShopUi(hud.root, this.eco, {
      buyAstro: (d, k) => this.buyAstro(d, k),
      buyUpgrade: (id) => this.buyUpgrade(id),
      pickLook: (kind, id, cost) => this.pickLook(kind, id, cost),
      rate: () => this.rateNow,
      sound: (k) => game.audio.ui(k),
      onClose: () => this.toggleShop(false),
    });
    this.seenReveal = this.revealSignature();

    this.obsBtn = h('button', 'sb-obsbtn interactive', `<span class="i">◎</span>Observatorio<kbd>O</kbd><em class="badge"></em>`) as HTMLButtonElement;
    this.obsBadge = this.obsBtn.querySelector('.badge') as HTMLElement;
    this.obsBtn.addEventListener('click', () => {
      this.obsBtn.blur();
      this.openObservatory();
    });
    hud.root.appendChild(this.obsBtn);
    if (!game.prog.tutorialSeen('obs_intro')) this.obsBtn.classList.add('pulse');
    this.obs = new Observatory({
      game,
      eco: this.eco,
      state,
      group: host.group,
      gal: host.gal,
      scale: () => this.S,
      view: () => this.viewDistance,
      time: () => this.t,
      earn: (a) => this.earn(a),
      save: () => this.save(),
      setBusy: (v) => host.setBusy(v),
      onClosed: () => this.shop.refresh(),
    });

    this.onKey = (e: KeyboardEvent) => {
      if (this.game.mode !== 'playing') return;
      const k = e.key.toLowerCase();
      if (k === 'o') {
        if (this.obs.isOpen) {
          if (this.obs.canLeave) this.obs.close();
        } else this.openObservatory();
        return;
      }
      if (this.obs.isOpen) return;
      if (k === 't') this.toggleShop();
      else if (k === 'escape' && this.shop.isOpen) {
        // Esc closes the shop first instead of pausing.
        this.toggleShop(false);
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', this.onKey, true);
    this.onHide = () => this.save();
    window.addEventListener('pagehide', this.onHide);
  }

  get scale() {
    return this.S;
  }

  /** Default camera distance for the current galaxy size. */
  get viewDistance() {
    return SANDBOX_VIEW * Math.pow(this.eco.scale, 0.9);
  }

  /** Called once the phase is visible: welcome, offline earnings, first-time briefing. */
  async enter(phaseWait: (s: number) => Promise<void>) {
    const g = this.game;
    g.rig.maxZoom = this.eco.zoomLimit;
    const first = this.state.time === 0;
    const away = (Date.now() - this.state.savedAt) / 1000;
    await phaseWait(1.6);
    if (first) {
      g.hud.titleCard('Modo libre', 'TU GALAXIA', 'Llénala de estrellas y nebulosas a tu gusto', 4.5);
    } else if (away > 60) {
      const off = this.eco.offline(away);
      if (off.amount >= 1) {
        this.earn(off.amount);
        g.hud.titleCard(`+${formatBig(off.amount)} ✦`, 'MIENTRAS NO ESTABAS', `Tu galaxia siguió brillando durante ${formatTime(Math.min(away, off.cap))}${off.capped ? ' (máximo)' : ''}`, 4.5);
        g.audio.achievement();
      }
    }
    if (!g.prog.tutorialSeen('sb_intro')) {
      await phaseWait(first ? 5 : 2);
      if (g.mode !== 'playing') return;
      g.prog.markTutorial('sb_intro');
      this.help();
    }
  }

  help() {
    const g = this.game;
    if (g.mode === 'playing') g.pause(false);
    g.menus.openSandboxBriefing(g.input.touchMode);
    return true;
  }

  // ------------------------------------------------------------------ gameplay hooks
  private earn(amount: number) {
    this.eco.earn(amount);
    this.game.prog.add('stardust', amount);
  }

  private floatDust(amount: number, pos: THREE.Vector3, color = '#ffe6a8') {
    this.game.hud.floater(`+${formatBig(amount)} ✦`, pos.clone().add(new THREE.Vector3(0, 40 * this.S, 0)), color, 15, 1.6);
  }

  onCloud() {
    const d = this.eco.cloudDust(this.rateNow);
    this.earn(d);
    this.floatDust(d, new THREE.Vector3(0, 30, 0));
  }

  onVent(vented: number) {
    if (vented <= 0) return;
    const d = this.eco.jetDust(vented, this.rateNow);
    this.earn(d);
    this.ventDust += d;
  }

  onCluster(pos: THREE.Vector3) {
    const d = this.eco.clusterDust(this.rateNow);
    this.earn(d);
    this.floatDust(d, pos, '#ffe0a0');
  }

  get cloudCap() {
    return this.eco.cloudCap;
  }
  get regenMul() {
    return this.eco.regenMul;
  }
  clusterInterval(rng: () => number) {
    const [a, b] = this.eco.clusterInterval;
    return a + (b - a) * rng();
  }

  private openObservatory() {
    this.obsBtn.classList.remove('pulse');
    this.toggleShop(false);
    this.game.hud.clearHint();
    this.obs.open();
  }

  // ------------------------------------------------------------------ shop actions
  private toggleShop(v = !this.shop.isOpen) {
    if (v === this.shop.isOpen) return;
    this.shop.setOpen(v);
    this.btn.classList.toggle('on', v);
    this.game.audio.ui(v ? 'open' : 'back');
    if (v) {
      this.seenReveal = this.revealSignature();
      this.btn.classList.remove('pulse');
      this.game.hud.clearHint();
    }
  }

  private buyAstro(def: AstroDef, k: number) {
    const before = this.eco.count(def.id);
    if (!this.eco.buyAstro(def, k)) return false;
    const g = this.game;
    const n = this.eco.count(def.id);
    for (let i = before; i < n; i++) this.decor.born(def.id, i, this.t);
    const pos = this.decor.position(this.host.gal, def.id, Math.min(before, MAX_VISIBLE - 1), this.t);
    g.pipe.final.shockwave(pos, 0.25, 1, 0.2);
    g.hud.floater(`${def.name}${n - before > 1 ? ` ×${n - before}` : ''}`, pos.clone().add(new THREE.Vector3(0, 50 * this.S, 0)), '#ffffff', 14, 2);
    g.audio.capture(def.kind === 'nebula' ? 1 : 0.6);
    g.prog.achieve('sb_first');
    if (this.eco.astrosOwned >= 50) g.prog.achieve('sb_collector');
    if (NEBULAE.every((nb) => this.eco.count(nb.id) > 0)) g.prog.achieve('sb_nebulae');
    this.checkLevel();
    this.save();
    return true;
  }

  private buyUpgrade(id: string) {
    if (!this.eco.buyUpgrade(id)) return false;
    const def = upgradeById(id)!;
    this.game.audio.discovery();
    this.game.hud.toast(def.icon, `${def.name} · nivel ${this.eco.up(id)}`, def.effect);
    this.save();
    return true;
  }

  private pickLook(kind: LookKind, id: string, cost: number) {
    const key = kind === 'bar' ? 'bar' : lookKey(kind, id);
    const needsUnlock = !(kind === 'bar' && id === 'off') && cost > 0;
    if (needsUnlock && !this.eco.unlock(key, kind === 'bar' ? BAR_COST : cost)) return false;
    const look = this.state.look;
    if (kind === 'arms') look.arms = Number(id);
    else if (kind === 'twist') look.twist = id;
    else if (kind === 'palette') look.palette = id;
    else if (kind === 'jets') look.jets = id;
    else look.bar = id === 'on';
    const g = this.game;
    if (kind === 'arms') {
      // The arm pattern changes instantly: hide the switch behind a flash.
      g.pipe.final.doFlash(0.35, 0xe8e0ff);
      g.pipe.final.shockwave(new THREE.Vector3(), 0.6, 1.6, 1);
      g.audio.whoosh(0.35);
    } else g.audio.ui('click');
    this.applyLook(false);
    this.save();
    return true;
  }

  private targetTwist() {
    const opt = TWIST_OPTIONS.find((o) => o.id === this.state.look.twist);
    return opt?.twist ?? this.state.base.twist;
  }

  /** Pushes the stored look to the galaxy (twist, palette and bar blend in smoothly). */
  private applyLook(immediate: boolean) {
    const gal = this.host.gal;
    gal.setArms(this.state.look.arms);
    const jet = JET_OPTIONS.find((j) => j.id === this.state.look.jets) ?? JET_OPTIONS[0];
    for (const j of this.host.jets) {
      (j.mat.uniforms.uColA.value as THREE.Color).set(jet.a);
      (j.mat.uniforms.uColB.value as THREE.Color).set(jet.b);
    }
    if (immediate) {
      gal.setTwist(this.twist);
      gal.setBar(this.bar);
      gal.setTint(this.tint.x, this.tint.y, this.tint.z);
      gal.setRadius(600 * this.S);
    }
  }

  private checkLevel() {
    const L = this.eco.level;
    if (L <= this.level) return;
    const prev = this.level;
    this.level = L;
    const g = this.game;
    const bonus = Math.round((this.eco.scale - 1) * 100);
    g.hud.titleCard(`Nivel ${L}`, 'TU GALAXIA CRECIÓ', `Radio +${bonus}% · producción +${Math.round(5 * (L - 1))}% · más zoom`, 3.5);
    g.pipe.final.shockwave(new THREE.Vector3(), 1, 2.2, 1.4);
    g.pipe.bloomBoost = 1.2;
    g.audio.swell(4);
    g.rig.maxZoom = this.eco.zoomLimit;
    if (!this.obs.isOpen) g.rig.animate({ distance: this.viewDistance }, 4);
    // Growing also refreshes your observing energy and may open a new minigame.
    this.obs.addEnergy(1);
    const fresh = MINIGAMES.filter((m) => m.level > prev && m.level <= L);
    for (const m of fresh) g.hud.toast(m.icon, `Nuevo minijuego: ${m.name}`, 'Te espera en el Observatorio (O)');
    if (fresh.length) this.obsBtn.classList.add('pulse');
    if (L >= 10) g.prog.achieve('sb_level10');
    if (L >= 20) g.prog.achieve('sb_level20');
  }

  private revealSignature() {
    return [...STARS, ...NEBULAE].map((d) => (this.eco.revealed(d) ? 1 : 0)).join('');
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, snap: SandboxSnapshot) {
    const g = this.game;
    this.t = snap.t;
    this.M = snap.M;
    this.state.time += dt;
    this.rateNow = this.eco.rate(snap.V);
    this.earn(this.rateNow * dt);

    // Galaxy growth & look blend smoothly towards their targets.
    this.S = damp(this.S, this.eco.scale, 1.2, dt);
    this.twist = damp(this.twist, this.targetTwist(), 2, dt);
    this.bar = damp(this.bar, this.state.look.bar ? 1 : 0, 1.5, dt);
    const pal = PALETTES.find((p) => p.id === this.state.look.palette) ?? PALETTES[0];
    this.tint.x = damp(this.tint.x, pal.tint[0], 2, dt);
    this.tint.y = damp(this.tint.y, pal.tint[1], 2, dt);
    this.tint.z = damp(this.tint.z, pal.tint[2], 2, dt);
    const gal = this.host.gal;
    gal.setRadius(600 * this.S);
    gal.setTwist(this.twist);
    gal.setBar(this.bar);
    gal.setTint(this.tint.x, this.tint.y, this.tint.z);
    gal.visibleFraction = 0.75 + 0.03 * (this.eco.level - 1);
    gal.sizeMul = Math.pow(this.S, 0.6);

    // Objects stay readable when zooming far out.
    const view = SANDBOX_VIEW * Math.pow(this.S, 0.9);
    const sz = 1.25 * Math.sqrt(this.S) * Math.max(1, Math.sqrt(g.rig.effectiveDistance / view));
    this.decor.render(gal, snap.t, (id) => this.eco.count(id), sz);
    if (this.obs.isOpen) this.obs.update(dt);
    else this.hoverLabel(snap.cloudHovered);

    // Jets pay out continuously: summarise it once a second near the jet.
    this.ventT -= dt;
    if (this.ventT <= 0) {
      this.ventT = 1;
      if (this.ventDust >= 1) this.floatDust(this.ventDust, new THREE.Vector3(0, 260 * this.S, 0), '#d9c8ff');
      this.ventDust = 0;
    }

    this.uiT -= dt;
    if (this.uiT <= 0) {
      this.uiT = 0.25;
      if (this.shop.isOpen) this.shop.refresh();
      this.updateButton();
    }
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 10;
      this.save();
    }
  }

  private hoverLabel(cloudHovered: boolean) {
    const g = this.game;
    const input = g.input;
    if (cloudHovered || input.touchMode || !input.pointerInside) return;
    const maxD = g.rig.effectiveDistance * 0.035 + 15;
    let best: { id: string; pos: THREE.Vector3 } | null = null;
    let bd = maxD;
    for (const s of this.decor.spots) {
      const d = Math.hypot(s.pos.x - input.pointerWorld.x, s.pos.z - input.pointerWorld.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) return;
    const def = astroById(best.id)!;
    const n = this.eco.count(def.id);
    const sub = def.kind === 'star' ? `${n} en tu galaxia · +${fmtRate(def.prod! * n)} ✦/s` : `+${Math.round(def.boost! * 100 * n)}% producción`;
    g.hud.marker('sb-hover', best.pos.clone().add(new THREE.Vector3(0, 30 * this.S, 0)), `${def.name}<div class="m">${sub}</div>`, 'neutral');
  }

  private updateButton() {
    const e = this.eco;
    let n = 0;
    for (const d of [...STARS, ...NEBULAE]) if (e.revealed(d) && !e.isMaxed(d) && e.costOf(d) <= e.s.dust) n++;
    this.badge.textContent = n ? String(n) : '';
    this.badge.style.display = n ? '' : 'none';
    const en = this.obs.energy;
    const txt = `◆${en}`;
    if (this.obsBadge.textContent !== txt) this.obsBadge.textContent = txt;
    this.obsBtn.classList.toggle('full', en >= OBS_ENERGY_MAX);
    if (!this.shop.isOpen && this.revealSignature() !== this.seenReveal) this.btn.classList.add('pulse');
  }

  updateHud(snap: SandboxSnapshot, jetting: boolean, cooldown: number) {
    const g = this.game;
    const e = this.eco;
    const L = e.level;
    const touch = g.input.touchMode;
    g.hud.setModePlate('MODO LIBRE', `Nivel ${L}`, `≈ ${Math.round(40 * this.S * this.S)} mil millones de estrellas`);
    g.hud.setMass(formatBig(e.s.dust), '✦', `+${fmtRate(this.rateNow)} polvo estelar/s`);
    const nothing = e.astrosOwned === 0;
    g.hud.setObjective(
      nothing
        ? `Abre la TIENDA ${touch ? '(botón ✦)' : '(T)'} y compra tu primera estrella`
        : `Nivel ${L + 1}: invierte ${formatBig(e.toNextLevel)} ✦ más en astros`,
      nothing ? clamp(e.s.dust / 20) : e.levelProgress,
    );
    const lg = Math.log10(Math.max(1, snap.M));
    g.hud.setMeters([
      { id: 'q', label: 'Actividad del cuásar', value: snap.Q, color: snap.Q > 0.8 ? '#ff5a3c' : '#c9a8ff', warn: snap.Q > 0.85 },
      { id: 'v', label: 'Formación estelar', value: snap.V, color: '#8fd3ff', warn: snap.V < 0.3 },
      { id: 'm', label: 'Agujero negro', value: lg - Math.floor(lg), text: `${formatSolar(snap.M)} M☉`, color: '#ffd6a0' },
    ]);
    g.hud.setAbilities([
      { id: 'feed', key: touch ? 'TOCAR' : 'CLIC / ESPACIO', name: 'Canalizar nube', charge: 1 - cooldown },
      { id: 'jets', key: touch ? 'BTN 2' : 'CLIC DER', name: 'Jets del cuásar', active: jetting },
      { id: 'shop', key: touch ? '✦' : 'T', name: 'Tienda', active: this.shop.isOpen },
    ]);
    g.audio.setIntensity(0.25 + snap.Q * 0.3);
  }

  /** Far zoom reveals the cosmic web around your galaxy. */
  webAlpha() {
    return smoothstep(6000, 16000, this.game.rig.effectiveDistance);
  }

  /** QA helper (debug builds): a few minutes worth of stardust. */
  debugDust() {
    this.earn(Math.max(1000, this.eco.production * 300));
  }

  save() {
    this.state.mass = this.M;
    this.game.prog.saveSandbox(this.state);
  }

  dispose() {
    this.save();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('pagehide', this.onHide);
    this.obs.dispose();
    this.obsBtn.remove();
    this.btn.remove();
    this.shop.dispose();
    this.decor.dispose();
    this.game.hud.setModePlate(null);
  }
}
