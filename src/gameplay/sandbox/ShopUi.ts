import { h } from '../../ui/Hud';
import { formatBig, formatTime } from '../../utils/math';
import {
  ARM_OPTIONS,
  BAR_COST,
  JET_OPTIONS,
  NEBULAE,
  NEBULA_MAX,
  PALETTES,
  STARS,
  TWIST_OPTIONS,
  UPGRADES,
  lookKey,
  type AstroDef,
  type LookKind,
  type LookOption,
} from './Catalog';
import type { SandboxEconomy } from './Economy';

type Tab = 'stars' | 'nebulae' | 'galaxy' | 'upgrades';
type Qty = 1 | 10 | 'max';

export interface ShopActions {
  buyAstro(def: AstroDef, k: number): boolean;
  buyUpgrade(id: string): boolean;
  pickLook(kind: LookKind, id: string, cost: number): boolean;
  /** Current stardust income per second. */
  rate(): number;
  sound(kind: 'hover' | 'click' | 'open' | 'back'): void;
  onClose(): void;
}

const TABS: [Tab, string][] = [
  ['stars', 'Estrellas'],
  ['nebulae', 'Nebulosas'],
  ['galaxy', 'Galaxia'],
  ['upgrades', 'Mejoras'],
];

export const fmtRate = (r: number) => (r < 100 ? r.toFixed(1) : formatBig(r));

/** Free-mode shop: a side drawer that keeps the galaxy visible (and running) behind it. */
export class ShopUi {
  root: HTMLElement;
  isOpen = false;
  private list: HTMLElement;
  private dustEl: HTMLElement;
  private rateEl: HTMLElement;
  private qtyEl: HTMLElement;
  private tab: Tab = 'stars';
  private qty: Qty = 1;
  private revealKey = '';

  constructor(parent: HTMLElement, private eco: SandboxEconomy, private act: ShopActions) {
    this.root = h('div', 'shop panel interactive');
    this.root.innerHTML = `
      <div class="shop-top">
        <div>
          <div class="label">Tienda cósmica</div>
          <div class="shop-dust"><b></b><span>✦</span></div>
          <div class="shop-rate"></div>
        </div>
        <button class="shop-x" title="Cerrar (T)">✕</button>
      </div>
      <div class="shop-tabs">${TABS.map(([id, l]) => `<button data-tab="${id}">${l}</button>`).join('')}</div>
      <div class="shop-qty seg"><button data-q="1">×1</button><button data-q="10">×10</button><button data-q="max">Máx</button></div>
      <div class="shop-list"></div>`;
    parent.appendChild(this.root);
    this.list = this.root.querySelector('.shop-list') as HTMLElement;
    this.dustEl = this.root.querySelector('.shop-dust b') as HTMLElement;
    this.rateEl = this.root.querySelector('.shop-rate') as HTMLElement;
    this.qtyEl = this.root.querySelector('.shop-qty') as HTMLElement;
    this.root.querySelector('.shop-x')!.addEventListener('click', () => this.act.onClose());
    this.root.querySelectorAll<HTMLButtonElement>('.shop-tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.act.sound('click');
        b.blur();
        this.rebuild();
      }),
    );
    this.qtyEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        this.qty = b.dataset.q === 'max' ? 'max' : (Number(b.dataset.q) as 1 | 10);
        this.act.sound('click');
        b.blur();
        this.refresh();
      }),
    );
    // One delegated handler for every buy button / chip in the list.
    this.list.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!el || el.disabled) return;
      el.blur();
      const d = el.dataset;
      let ok = false;
      if (d.astro) {
        const def = [...STARS, ...NEBULAE].find((a) => a.id === d.astro)!;
        ok = this.act.buyAstro(def, this.units(def));
      } else if (d.up) ok = this.act.buyUpgrade(d.up);
      else if (d.kind) ok = this.act.pickLook(d.kind as LookKind, d.id ?? '', Number(d.cost ?? 0));
      if (!ok) this.act.sound('back');
      this.rebuild();
    });
    this.rebuild();
  }

  setOpen(v: boolean) {
    this.isOpen = v;
    this.root.classList.toggle('show', v);
    if (v) this.rebuild();
  }

  /** How many units the current quantity selector buys. */
  private units(def: AstroDef) {
    const left = def.kind === 'nebula' ? NEBULA_MAX - this.eco.count(def.id) : Infinity;
    const k = this.qty === 'max' ? Math.max(1, this.eco.maxAffordable(def)) : this.qty;
    return Math.max(1, Math.min(k, left));
  }

  private astroCard(def: AstroDef) {
    const n = this.eco.count(def.id);
    const c2 = def.color2 ?? def.color;
    const eff =
      def.kind === 'star'
        ? `+${fmtRate(def.prod!)} ✦/s cada una${n ? ` · <b>total +${fmtRate(def.prod! * n)} ✦/s</b>` : ''}`
        : `+${Math.round(def.boost! * 100)}% de toda la producción cada una · <b>${n}/${NEBULA_MAX}</b>`;
    return `<div class="shop-item" data-card="${def.id}">
      <div class="ico ${def.kind}" style="--c1:${def.color};--c2:${c2}"></div>
      <div class="body">
        <div class="name">${def.name}${n ? ` <span class="cnt">×${n}</span>` : ''}</div>
        <div class="desc">${def.desc}</div>
        <div class="eff">${eff}</div>
      </div>
      <button class="buy" data-astro="${def.id}"><span class="q"></span><b class="c"></b><small class="eta"></small></button>
    </div>`;
  }

  private lockedCard() {
    return `<div class="shop-item locked"><div class="ico"></div><div class="body"><div class="name">???</div><div class="desc">Sigue generando polvo estelar para descubrir el siguiente astro.</div></div></div>`;
  }

  private chips(kind: LookKind, opts: LookOption[], current: string) {
    return opts
      .map((o) => {
        const owned = !!this.eco.s.unlocked[lookKey(kind, o.id)] || (o.cost === 0 && !o.lock);
        const on = o.id === current;
        const sw = o.swatch ? `<i class="sw" style="background:${o.swatch}"></i>` : '';
        if (o.lock && !owned) return `<button class="chip locked" data-locked="1" disabled title="${o.lock}">${sw}<b>${o.name}</b><small>🔒 ${o.lock.replace('Observatorio: ', '')}</small></button>`;
        const tag = on ? '✓' : owned ? 'Usar' : `${formatBig(o.cost)} ✦`;
        return `<button class="chip${on ? ' on' : ''}${owned ? ' owned' : ''}" data-kind="${kind}" data-id="${o.id}" data-cost="${owned ? 0 : o.cost}">${sw}<b>${o.name}</b><small>${tag}</small></button>`;
      })
      .join('');
  }

  rebuild() {
    this.root.querySelectorAll<HTMLButtonElement>('.shop-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.qtyEl.style.display = this.tab === 'stars' || this.tab === 'nebulae' ? '' : 'none';
    const scroll = this.list.scrollTop;
    let html = '';
    if (this.tab === 'stars' || this.tab === 'nebulae') {
      const defs = this.tab === 'stars' ? STARS : NEBULAE;
      let hidden = false;
      for (const d of defs) {
        if (this.eco.revealed(d)) html += this.astroCard(d);
        else if (!hidden) {
          hidden = true;
          html += this.lockedCard();
        }
      }
      if (this.tab === 'nebulae') html = `<div class="shop-note">Las nebulosas multiplican <b>toda</b> tu producción. Máximo ${NEBULA_MAX} de cada tipo.</div>` + html;
    } else if (this.tab === 'galaxy') {
      const L = this.eco.s.look;
      const armOpts = ARM_OPTIONS.map((o) => (Number(o.id) === this.eco.s.base.arms ? { ...o, cost: 0 } : o));
      html += `<div class="shop-note">Una vez comprado, cada estilo es tuyo: cámbialo cuando quieras.</div>`;
      html += `<div class="shop-sec"><div class="label">Brazos espirales</div><div class="chips">${this.chips('arms', armOpts, String(L.arms))}</div></div>`;
      html += `<div class="shop-sec"><div class="label">Enrollamiento</div><div class="chips">${this.chips('twist', TWIST_OPTIONS, L.twist)}</div></div>`;
      html += `<div class="shop-sec"><div class="label">Paleta de colores</div><div class="chips">${this.chips('palette', PALETTES, L.palette)}</div></div>`;
      html += `<div class="shop-sec"><div class="label">Barra central</div><div class="desc">Como la Vía Láctea: una barra de estrellas cruza el núcleo y alimenta los brazos.</div><div class="chips">${this.chips(
        'bar',
        [
          { id: 'off', name: 'Sin barra', cost: 0 },
          { id: 'on', name: 'Espiral barrada', cost: this.eco.s.unlocked.bar ? 0 : BAR_COST },
        ],
        L.bar ? 'on' : 'off',
      )}</div></div>`;
      html += `<div class="shop-sec"><div class="label">Color de los jets</div><div class="chips">${this.chips('jets', JET_OPTIONS, L.jets)}</div></div>`;
    } else {
      for (const u of UPGRADES) {
        const lvl = this.eco.up(u.id);
        const max = lvl >= u.costs.length;
        const pips = u.costs.map((_, i) => (i < lvl ? '●' : '○')).join(' ');
        html += `<div class="shop-item" data-card="${u.id}">
          <div class="ico glyph">${u.icon}</div>
          <div class="body">
            <div class="name">${u.name} <span class="cnt">Nv ${lvl}/${u.costs.length}</span></div>
            <div class="desc">${u.effect}</div>
            <div class="eff pips">${pips}</div>
          </div>
          <button class="buy" data-up="${u.id}" ${max ? 'disabled' : ''}><span class="q">${max ? 'Completo' : 'Mejorar'}</span><b class="c"></b><small class="eta"></small></button>
        </div>`;
      }
    }
    this.list.innerHTML = html;
    this.list.scrollTop = scroll;
    this.revealKey = this.revealSignature();
    this.refresh();
  }

  private revealSignature() {
    return [...STARS, ...NEBULAE].map((d) => (this.eco.revealed(d) ? 1 : 0)).join('');
  }

  private eta(cost: number) {
    const r = this.act.rate();
    const need = cost - this.eco.s.dust;
    if (need <= 0 || r <= 0) return '';
    const s = need / r;
    return s < 36000 ? `en ${formatTime(s)}` : '';
  }

  /** Cheap per-tick update: prices, affordability and the header. */
  refresh() {
    const dust = this.eco.s.dust;
    this.dustEl.textContent = formatBig(dust);
    this.rateEl.textContent = `+${fmtRate(this.act.rate())} ✦/s · nivel ${this.eco.level}`;
    this.qtyEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.q === String(this.qty)));
    if (this.revealSignature() !== this.revealKey) return this.rebuild();
    this.list.querySelectorAll<HTMLButtonElement>('button.buy').forEach((b) => {
      let cost: number;
      let label: string;
      if (b.dataset.astro) {
        const def = [...STARS, ...NEBULAE].find((a) => a.id === b.dataset.astro)!;
        if (this.eco.isMaxed(def)) {
          b.disabled = true;
          (b.querySelector('.q') as HTMLElement).textContent = 'Completo';
          (b.querySelector('.c') as HTMLElement).textContent = '';
          (b.querySelector('.eta') as HTMLElement).textContent = '';
          return;
        }
        const k = this.units(def);
        cost = this.eco.costOf(def, k);
        label = `Comprar ×${k}`;
      } else {
        const def = UPGRADES.find((u) => u.id === b.dataset.up)!;
        cost = this.eco.upgradeCost(def);
        if (!isFinite(cost)) return;
        label = 'Mejorar';
      }
      b.disabled = cost > dust;
      (b.querySelector('.q') as HTMLElement).textContent = label;
      (b.querySelector('.c') as HTMLElement).textContent = `${formatBig(cost)} ✦`;
      (b.querySelector('.eta') as HTMLElement).textContent = b.disabled ? this.eta(cost) : '';
    });
    this.list.querySelectorAll<HTMLButtonElement>('button.chip').forEach((b) => {
      b.disabled = b.dataset.locked === '1' || Number(b.dataset.cost) > dust;
    });
  }

  dispose() {
    this.root.remove();
  }
}
