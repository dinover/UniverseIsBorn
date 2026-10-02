/**
 * Free-mode catalogue and balance formulas.
 *
 * Economy (tuned with a greedy-player simulation):
 * - Stars are generators: cost × 1.15 per unit owned, flat stardust/s each.
 *   Each tier costs ~12× the previous and pays back ~2× slower, so a new tier
 *   unlocks every few minutes early on and every 10–25 minutes later.
 * - Nebulae multiply all production (max 5 of each, cost × 2.6 per unit).
 * - Stardust invested in stars & nebulae raises the galaxy level: bigger galaxy,
 *   wider zoom and +5% production per level.
 */

export interface AstroDef {
  id: string;
  kind: 'star' | 'nebula';
  name: string;
  desc: string;
  cost: number;
  /** Stardust per second per unit (stars). */
  prod?: number;
  /** Extra fraction of total production per unit (nebulae). */
  boost?: number;
  /** CSS colours for the shop icon. */
  color: string;
  color2?: string;
}

export const STAR_GROWTH = 1.15;
export const NEBULA_GROWTH = 2.6;
export const NEBULA_MAX = 5;
export const WELCOME_DUST = 150;

export const STARS: AstroDef[] = [
  { id: 'redgiant', kind: 'star', name: 'Gigante roja', cost: 20, prod: 0.4, color: '#ff7a3a', desc: 'Una estrella anciana que agotó el hidrógeno de su núcleo y se hinchó cientos de veces.' },
  { id: 'bluegiant', kind: 'star', name: 'Supergigante azul', cost: 220, prod: 2, color: '#8fb4ff', desc: 'Joven, caliente y efímera: brilla como cien mil soles y vive apenas unos millones de años.' },
  { id: 'binary', kind: 'star', name: 'Estrella binaria', cost: 2600, prod: 11, color: '#ffd88a', color2: '#8fb4ff', desc: 'Dos soles que orbitan uno alrededor del otro. Casi la mitad de las estrellas viven en pareja.' },
  { id: 'pulsar', kind: 'star', name: 'Púlsar', cost: 32000, prod: 60, color: '#9fe8ff', desc: 'Una estrella de neutrones que gira cientos de veces por segundo y barre el cosmos con su haz, como un faro.' },
  { id: 'magnetar', kind: 'star', name: 'Magnetar', cost: 420000, prod: 330, color: '#e07bff', desc: 'El imán más potente del universo: mil billones de veces el campo magnético de la Tierra.' },
  { id: 'wolfrayet', kind: 'star', name: 'Estrella Wolf-Rayet', cost: 6e6, prod: 1800, color: '#a9b8ff', color2: '#5fd0ff', desc: 'Tan masiva que sus vientos arrancan sus propias capas externas a miles de kilómetros por segundo.' },
  { id: 'hyper', kind: 'star', name: 'Hipergigante', cost: 9e7, prod: 10000, color: '#ffe2a8', color2: '#ff9a6b', desc: 'Al límite de lo posible, como Eta Carinae: tan luminosa que expulsa nubes enteras de gas.' },
  { id: 'pop3', kind: 'star', name: 'Estrella de Población III', cost: 1.5e9, prod: 56000, color: '#c3b5ff', color2: '#ffffff', desc: 'Las primeras estrellas del universo: solo hidrógeno y helio, cientos de soles de masa. Nadie ha visto una… salvo tú.' },
];

export const NEBULAE: AstroDef[] = [
  { id: 'emission', kind: 'nebula', name: 'Nebulosa de emisión', cost: 800, boost: 0.1, color: '#ff5f9a', color2: '#9a6bff', desc: 'Hidrógeno iluminado por estrellas recién nacidas: brilla con el rosa del hidrógeno-alfa.' },
  { id: 'reflection', kind: 'nebula', name: 'Nebulosa de reflexión', cost: 12000, boost: 0.12, color: '#5f8fff', color2: '#bfe0ff', desc: 'Polvo que refleja la luz de estrellas cercanas. Es azul por la misma razón que el cielo de la Tierra.' },
  { id: 'planetary', kind: 'nebula', name: 'Nebulosa planetaria', cost: 180000, boost: 0.15, color: '#4fffd0', color2: '#ff6b6b', desc: 'El último suspiro de una estrella como el Sol: un anillo de gas alrededor de una enana blanca.' },
  { id: 'snr', kind: 'nebula', name: 'Remanente de supernova', cost: 3e6, boost: 0.2, color: '#ff6b4f', color2: '#6bffb0', desc: 'Los filamentos de una estrella que explotó, como la Nebulosa del Cangrejo. Siembran el cosmos de elementos pesados.' },
  { id: 'pillars', kind: 'nebula', name: 'Pilares de la creación', cost: 5e7, boost: 0.25, color: '#ffc477', color2: '#5fbf9a', desc: 'Columnas de gas y polvo de años luz de altura donde están naciendo nuevas estrellas.' },
];

export const ASTROS = [...STARS, ...NEBULAE];
export const astroById = (id: string) => ASTROS.find((a) => a.id === id);

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  costs: number[];
  /** What the next level does. */
  effect: string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'accretion', name: 'Acreción eficiente', icon: '◎', costs: [200, 2500, 30000, 400000, 5e6], effect: '+50% de polvo estelar por cada nube canalizada' },
  { id: 'jets', name: 'Jets de alta energía', icon: '⇅', costs: [800, 12000, 180000, 2.5e6], effect: '+50% de polvo estelar al liberar energía con los jets' },
  { id: 'reservoir', name: 'Reservas de gas', icon: '☁', costs: [500, 8000, 120000], effect: '+3 nubes en los brazos y regeneración un 25% más rápida' },
  { id: 'halo', name: 'Halo de materia oscura', icon: '◌', costs: [3000, 40000, 500000, 6e6, 8e7], effect: '+20% de toda la producción' },
  { id: 'clusters', name: 'Imán de cúmulos', icon: '✦', costs: [5000, 150000], effect: 'Los cúmulos globulares llegan más seguido y valen el doble' },
  { id: 'memory', name: 'Memoria cósmica', icon: '⌛', costs: [1500, 25000, 400000], effect: 'Tu galaxia produce más mientras no estás (y durante más tiempo)' },
];

export const upgradeById = (id: string) => UPGRADES.find((u) => u.id === id);

// ------------------------------------------------------------------ looks
export type LookKind = 'arms' | 'twist' | 'palette' | 'jets' | 'bar';

export interface LookOption {
  id: string;
  name: string;
  cost: number;
  swatch?: string;
}

export const ARM_OPTIONS: LookOption[] = [
  { id: '2', name: '2', cost: 300 },
  { id: '3', name: '3', cost: 300 },
  { id: '4', name: '4', cost: 300 },
  { id: '5', name: '5', cost: 6000 },
  { id: '6', name: '6', cost: 60000 },
];

export const TWIST_OPTIONS: (LookOption & { twist: number | null })[] = [
  { id: 'abierto', name: 'Abierto', cost: 500, twist: 1.1 },
  { id: 'clasico', name: 'Original', cost: 0, twist: null },
  { id: 'cerrado', name: 'Cerrado', cost: 500, twist: 2.8 },
];

export const PALETTES: (LookOption & { tint: [number, number, number] })[] = [
  { id: 'clasica', name: 'Clásica', cost: 0, tint: [1, 1, 1], swatch: 'linear-gradient(135deg,#ffe9c8,#cfe0ff)' },
  { id: 'ambar', name: 'Ámbar', cost: 1500, tint: [1.18, 0.92, 0.66], swatch: 'linear-gradient(135deg,#ffc56b,#ff8a3a)' },
  { id: 'glaciar', name: 'Glaciar', cost: 1500, tint: [0.72, 0.92, 1.25], swatch: 'linear-gradient(135deg,#bfefff,#5f9fff)' },
  { id: 'aurora', name: 'Aurora', cost: 15000, tint: [0.66, 1.16, 0.86], swatch: 'linear-gradient(135deg,#7dffb2,#4fbfff)' },
  { id: 'rosa', name: 'Rosa cósmica', cost: 15000, tint: [1.22, 0.74, 1.04], swatch: 'linear-gradient(135deg,#ff9ad0,#b47bff)' },
  { id: 'violeta', name: 'Violeta profundo', cost: 150000, tint: [0.92, 0.68, 1.32], swatch: 'linear-gradient(135deg,#c49bff,#5f4bff)' },
];

export const JET_OPTIONS: (LookOption & { a: number; b: number })[] = [
  { id: 'azul', name: 'Azul', cost: 0, a: 0xcfe4ff, b: 0x8a6bff, swatch: 'linear-gradient(135deg,#cfe4ff,#8a6bff)' },
  { id: 'dorado', name: 'Dorado', cost: 4000, a: 0xfff0c0, b: 0xffa040, swatch: 'linear-gradient(135deg,#fff0c0,#ffa040)' },
  { id: 'esmeralda', name: 'Esmeralda', cost: 4000, a: 0xd0ffe8, b: 0x30d090, swatch: 'linear-gradient(135deg,#d0ffe8,#30d090)' },
  { id: 'carmesi', name: 'Carmesí', cost: 40000, a: 0xffd6d0, b: 0xff3050, swatch: 'linear-gradient(135deg,#ffd6d0,#ff3050)' },
];

export const BAR_COST = 25000;

export const lookKey = (kind: LookKind, id = '') => (kind === 'bar' ? 'bar' : `${kind}:${id}`);

// ------------------------------------------------------------------ galaxy level
const LEVEL_BASE = 100;
const LEVEL_RATIO = 2.5;

/** Stardust that must be invested in stars & nebulae to reach level `L`. */
export const levelThreshold = (L: number) => LEVEL_BASE * (Math.pow(LEVEL_RATIO, L - 1) - 1);
export const levelFor = (invested: number) => {
  // Exact walk instead of a logarithm: no rounding surprises right at a threshold.
  let L = 1;
  while (levelThreshold(L + 1) <= invested) L++;
  return L;
};
/** Production multiplier from the galaxy level. */
export const levelBonus = (L: number) => 1 + 0.05 * (L - 1);
/** Galaxy radius multiplier. */
export const galaxyScale = (L: number) => Math.min(3.2, 1 + 0.085 * (L - 1));
/** Wheel zoom-out limit (relative to the default framing). */
export const zoomLimit = (L: number) => Math.min(9, 2.2 + 0.25 * (L - 1));
