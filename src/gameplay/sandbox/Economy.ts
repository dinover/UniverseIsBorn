import type { ObsState, SandboxState } from '../../persistence/SaveSystem';
import type { Rng } from '../../procgen/rng';
import {
  NEBULAE,
  NEBULA_GROWTH,
  NEBULA_MAX,
  STARS,
  STAR_GROWTH,
  WELCOME_DUST,
  galaxyScale,
  levelBonus,
  levelFor,
  levelThreshold,
  upgradeById,
  zoomLimit,
  type AstroDef,
  type UpgradeDef,
} from './Catalog';

/** A brand-new free-mode galaxy with its welcome gift. */
export function createSandboxState(seed: number, mass: number, base: SandboxState['base']): SandboxState {
  return {
    version: 1,
    seed,
    mass,
    dust: WELCOME_DUST,
    earned: WELCOME_DUST,
    invested: 0,
    owned: {},
    unlocked: {},
    look: { arms: base.arms, twist: 'clasico', palette: 'clasica', bar: false, jets: 'azul' },
    base,
    time: 0,
    savedAt: Date.now(),
    obs: freshObs(),
  };
}

export const OBS_ENERGY_MAX = 5;
/** Real-time seconds to regain one observatory energy. */
export const OBS_ENERGY_EVERY = 8 * 60;
/** Permanent production bonus per completed constellation. */
export const CONSTELLATION_BONUS = 0.02;

const freshObs = (): ObsState => ({ energy: OBS_ENERGY_MAX, at: Date.now(), best: {}, stars: {}, plays: {}, constellations: [] });

/** The observatory block of a save, created on demand for saves older than the observatory. */
export function obsOf(s: SandboxState): ObsState {
  if (!s.obs) s.obs = freshObs();
  return s.obs;
}

/** Galaxy shape for a free mode that does not come straight from a finished story. */
export function randomGalaxyBase(rng: Rng): SandboxState['base'] {
  return { arms: rng.pick([2, 2, 3, 4]), twist: rng.range(1.4, 2.2), ecc: rng.range(0.34, 0.45), bulge: rng.range(0.12, 0.2), hueShift: rng.range(-0.5, 0.5) };
}

/** Pure free-mode economy: production, prices, purchases and rewards. */
export class SandboxEconomy {
  constructor(public s: SandboxState) {}

  count(id: string) {
    return this.s.owned[id] ?? 0;
  }

  /** Current level of an upgrade (0 = not bought). */
  up(id: string) {
    return this.s.owned[id] ?? 0;
  }

  get level() {
    return levelFor(this.s.invested);
  }

  /** 0..1 progress towards the next galaxy level. */
  get levelProgress() {
    const L = this.level;
    const a = levelThreshold(L);
    const b = levelThreshold(L + 1);
    return Math.min(1, (this.s.invested - a) / (b - a));
  }

  get toNextLevel() {
    return Math.max(0, levelThreshold(this.level + 1) - this.s.invested);
  }

  get scale() {
    return galaxyScale(this.level);
  }

  get zoomLimit() {
    return zoomLimit(this.level);
  }

  get astrosOwned() {
    let n = 0;
    for (const a of [...STARS, ...NEBULAE]) n += this.count(a.id);
    return n;
  }

  /** Total production multiplier from nebulae. */
  get nebulaBoost() {
    let m = 1;
    for (const n of NEBULAE) m += this.count(n.id) * (n.boost ?? 0);
    return m;
  }

  /** Stardust per second at full star formation. */
  get production() {
    let p = 1; // the galaxy itself always shines a little
    for (const s of STARS) p += this.count(s.id) * (s.prod ?? 0);
    return p * this.nebulaBoost * levelBonus(this.level) * (1 + 0.2 * this.up('halo')) * (1 + CONSTELLATION_BONUS * obsOf(this.s).constellations.length);
  }

  /** Actual income: a galaxy that still forms stars (vitality V) shines brighter. */
  rate(V: number) {
    return this.production * (0.6 + 0.4 * V);
  }

  // ------------------------------------------------------------------ prices
  isMaxed(def: AstroDef) {
    return def.kind === 'nebula' && this.count(def.id) >= NEBULA_MAX;
  }

  private growth(def: AstroDef) {
    return def.kind === 'nebula' ? NEBULA_GROWTH : STAR_GROWTH;
  }

  /** Price of the next `k` units. */
  costOf(def: AstroDef, k = 1) {
    const g = this.growth(def);
    const first = def.cost * Math.pow(g, this.count(def.id));
    return k === 1 ? first : (first * (Math.pow(g, k) - 1)) / (g - 1);
  }

  /** How many units fit in the current budget (respecting the nebula cap). */
  maxAffordable(def: AstroDef) {
    const g = this.growth(def);
    const first = def.cost * Math.pow(g, this.count(def.id));
    let k = Math.floor(Math.log(1 + (this.s.dust * (g - 1)) / first) / Math.log(g) + 1e-9);
    if (def.kind === 'nebula') k = Math.min(k, NEBULA_MAX - this.count(def.id));
    return Math.max(0, k);
  }

  /** Revealed in the shop once the player has earned a fair share of its price. */
  revealed(def: AstroDef) {
    return this.count(def.id) > 0 || this.s.earned >= def.cost * 0.25;
  }

  upgradeCost(def: UpgradeDef) {
    const l = this.up(def.id);
    return l < def.costs.length ? def.costs[l] : Infinity;
  }

  // ------------------------------------------------------------------ actions
  earn(amount: number) {
    if (!(amount > 0)) return;
    this.s.dust += amount;
    this.s.earned += amount;
  }

  buyAstro(def: AstroDef, k: number) {
    if (k <= 0 || this.isMaxed(def)) return false;
    if (def.kind === 'nebula') k = Math.min(k, NEBULA_MAX - this.count(def.id));
    const cost = this.costOf(def, k);
    if (cost > this.s.dust) return false;
    this.s.dust -= cost;
    this.s.invested += cost;
    this.s.owned[def.id] = this.count(def.id) + k;
    return true;
  }

  buyUpgrade(id: string) {
    const def = upgradeById(id);
    if (!def) return false;
    const cost = this.upgradeCost(def);
    if (cost > this.s.dust) return false;
    this.s.dust -= cost;
    this.s.owned[id] = this.up(id) + 1;
    return true;
  }

  unlock(key: string, cost: number) {
    if (this.s.unlocked[key]) return true;
    if (cost > this.s.dust) return false;
    this.s.dust -= cost;
    this.s.unlocked[key] = true;
    return true;
  }

  // ------------------------------------------------------------------ rewards
  cloudDust(rate: number) {
    return (10 + rate * 3) * (1 + 0.5 * this.up('accretion'));
  }

  jetDust(vented: number, rate: number) {
    return vented * (4 + rate * 4) * (1 + 0.5 * this.up('jets'));
  }

  clusterDust(rate: number) {
    return (30 + rate * 15) * Math.pow(2, this.up('clusters'));
  }

  get cloudCap() {
    return 12 + 3 * this.up('reservoir');
  }

  get regenMul() {
    return 1 + 0.25 * this.up('reservoir');
  }

  get clusterInterval(): [number, number] {
    const k = Math.pow(0.7, this.up('clusters'));
    return [35 * k, 55 * k];
  }

  /** Stardust produced while the game was closed. */
  offline(seconds: number) {
    const l = this.up('memory');
    const cap = (2 + 3 * l) * 3600;
    const eff = 0.25 + 0.15 * l;
    return { amount: this.rate(1) * Math.min(seconds, cap) * eff, capped: seconds > cap, eff, cap };
  }
}
