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

import { withText, type Bi } from '../../i18n/i18n';

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

type AstroBase = Omit<AstroDef, 'kind' | 'name' | 'desc'>;
const star = (b: AstroBase, name: Bi, desc: Bi): AstroDef => withText({ ...b, kind: 'star' as const }, { name, desc });
const nebula = (b: AstroBase, name: Bi, desc: Bi): AstroDef => withText({ ...b, kind: 'nebula' as const }, { name, desc });

export const STARS: AstroDef[] = [
  star(
    { id: 'redgiant', cost: 20, prod: 0.4, color: '#ff7a3a' },
    { es: 'Gigante roja', en: 'Red giant' },
    {
      es: 'Una estrella anciana que agotó el hidrógeno de su núcleo y se expandió cientos de veces.',
      en: 'An elderly star that used up the hydrogen in its core and swelled to hundreds of times its size.',
    },
  ),
  star(
    { id: 'bluegiant', cost: 220, prod: 2, color: '#8fb4ff' },
    { es: 'Supergigante azul', en: 'Blue supergiant' },
    {
      es: 'Joven, caliente y efímera: brilla como cien mil soles y vive apenas unos millones de años.',
      en: 'Young, hot and fleeting: it shines like a hundred thousand suns and lives only a few million years.',
    },
  ),
  star(
    { id: 'binary', cost: 2600, prod: 11, color: '#ffd88a', color2: '#8fb4ff' },
    { es: 'Estrella binaria', en: 'Binary star' },
    { es: 'Dos soles que orbitan uno alrededor del otro. Casi la mitad de las estrellas viven en pareja.', en: 'Two suns orbiting each other. Nearly half of all stars live in pairs.' },
  ),
  star(
    { id: 'pulsar', cost: 32000, prod: 60, color: '#9fe8ff' },
    { es: 'Púlsar', en: 'Pulsar' },
    {
      es: 'Una estrella de neutrones que gira cientos de veces por segundo y recorre el cosmos con su haz, como un faro.',
      en: 'A neutron star spinning hundreds of times per second, sweeping the cosmos with its beam like a lighthouse.',
    },
  ),
  star(
    { id: 'magnetar', cost: 420000, prod: 330, color: '#e07bff' },
    { es: 'Magnetar', en: 'Magnetar' },
    {
      es: 'El imán más potente del universo: su campo magnético es mil billones de veces más intenso que el de la Tierra.',
      en: "The most powerful magnet in the universe: its magnetic field is a thousand trillion times stronger than Earth's.",
    },
  ),
  star(
    { id: 'wolfrayet', cost: 6e6, prod: 1800, color: '#a9b8ff', color2: '#5fd0ff' },
    { es: 'Estrella Wolf-Rayet', en: 'Wolf-Rayet star' },
    {
      es: 'Tan masiva que sus vientos arrastran sus propias capas externas a miles de kilómetros por segundo.',
      en: 'So massive that its winds carry away its own outer layers at thousands of kilometers per second.',
    },
  ),
  star(
    { id: 'hyper', cost: 9e7, prod: 10000, color: '#ffe2a8', color2: '#ff9a6b' },
    { es: 'Hipergigante', en: 'Hypergiant' },
    {
      es: 'Al límite de lo posible, como Eta Carinae: tan luminosa que expulsa nubes enteras de gas.',
      en: 'At the edge of what is possible, like Eta Carinae: so luminous that it blows off entire clouds of gas.',
    },
  ),
  star(
    { id: 'pop3', cost: 1.5e9, prod: 56000, color: '#c3b5ff', color2: '#ffffff' },
    { es: 'Estrella de Población III', en: 'Population III star' },
    {
      es: 'Las primeras estrellas del universo: solo hidrógeno y helio, y cientos de veces la masa del Sol. Nadie ha visto una… salvo tú.',
      en: 'The very first stars in the universe: only hydrogen and helium, and hundreds of times the mass of the Sun. No one has ever seen one… except you.',
    },
  ),
];

export const NEBULAE: AstroDef[] = [
  nebula(
    { id: 'emission', cost: 800, boost: 0.1, color: '#ff5f9a', color2: '#9a6bff' },
    { es: 'Nebulosa de emisión', en: 'Emission nebula' },
    { es: 'Hidrógeno iluminado por estrellas recién nacidas: brilla con el tono rosado del hidrógeno-alfa.', en: 'Hydrogen lit up by newborn stars: it glows with the pink hue of hydrogen-alpha.' },
  ),
  nebula(
    { id: 'reflection', cost: 12000, boost: 0.12, color: '#5f8fff', color2: '#bfe0ff' },
    { es: 'Nebulosa de reflexión', en: 'Reflection nebula' },
    { es: 'Polvo que refleja la luz de estrellas cercanas. Es azul por la misma razón que el cielo de la Tierra.', en: "Dust reflecting the light of nearby stars. It's blue for the same reason Earth's sky is." },
  ),
  nebula(
    { id: 'planetary', cost: 180000, boost: 0.15, color: '#4fffd0', color2: '#ff6b6b' },
    { es: 'Nebulosa planetaria', en: 'Planetary nebula' },
    { es: 'El último suspiro de una estrella como el Sol: un anillo de gas alrededor de una enana blanca.', en: 'The last breath of a star like the Sun: a ring of gas around a white dwarf.' },
  ),
  nebula(
    { id: 'snr', cost: 3e6, boost: 0.2, color: '#ff6b4f', color2: '#6bffb0' },
    { es: 'Remanente de supernova', en: 'Supernova remnant' },
    {
      es: 'Los filamentos de una estrella que estalló, como la Nebulosa del Cangrejo. Siembran el cosmos de elementos pesados.',
      en: 'The glowing filaments of a star that exploded, like the Crab Nebula. They seed the cosmos with heavy elements.',
    },
  ),
  nebula(
    { id: 'pillars', cost: 5e7, boost: 0.25, color: '#ffc477', color2: '#5fbf9a' },
    { es: 'Pilares de la creación', en: 'Pillars of Creation' },
    { es: 'Columnas de gas y polvo de varios años luz de altura donde están naciendo nuevas estrellas.', en: 'Columns of gas and dust several light-years tall where new stars are being born.' },
  ),
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

const upgrade = (b: Omit<UpgradeDef, 'name' | 'effect'>, name: Bi, effect: Bi): UpgradeDef => withText(b, { name, effect });

export const UPGRADES: UpgradeDef[] = [
  upgrade(
    { id: 'accretion', icon: '◎', costs: [200, 2500, 30000, 400000, 5e6] },
    { es: 'Acreción eficiente', en: 'Efficient accretion' },
    { es: '+50% de polvo estelar por cada nube que atraes', en: '+50% stardust from each cloud you draw in' },
  ),
  upgrade(
    { id: 'jets', icon: '⇅', costs: [800, 12000, 180000, 2.5e6] },
    { es: 'Chorros de alta energía', en: 'High-energy jets' },
    { es: '+50% de polvo estelar al liberar energía con los chorros', en: '+50% stardust when you release energy through the jets' },
  ),
  upgrade(
    { id: 'reservoir', icon: '☁', costs: [500, 8000, 120000] },
    { es: 'Reservas de gas', en: 'Gas reserves' },
    { es: '+3 nubes en los brazos y regeneración un 25% más rápida', en: '+3 clouds in the arms and 25% faster regrowth' },
  ),
  upgrade({ id: 'halo', icon: '◌', costs: [3000, 40000, 500000, 6e6, 8e7] }, { es: 'Halo de materia oscura', en: 'Dark matter halo' }, { es: '+20% de toda la producción', en: '+20% to all production' }),
  upgrade(
    { id: 'clusters', icon: '✦', costs: [5000, 150000] },
    { es: 'Imán de cúmulos', en: 'Cluster magnet' },
    { es: 'Los cúmulos globulares llegan con más frecuencia y valen el doble', en: 'Globular clusters arrive more often and are worth double' },
  ),
  upgrade(
    { id: 'memory', icon: '⌛', costs: [1500, 25000, 400000] },
    { es: 'Memoria cósmica', en: 'Cosmic memory' },
    { es: 'Tu galaxia produce más mientras no estás (y durante más tiempo)', en: "Your galaxy produces more while you're away (and for longer)" },
  ),
];

export const upgradeById = (id: string) => UPGRADES.find((u) => u.id === id);

// ------------------------------------------------------------------ looks
export type LookKind = 'arms' | 'twist' | 'palette' | 'jets' | 'bar';

export interface LookOption {
  id: string;
  name: string;
  cost: number;
  swatch?: string;
  /** Observatory exclusive: what unlocks it there (cannot be bought). */
  lock?: string;
}

export const ARM_OPTIONS: LookOption[] = [
  { id: '2', name: '2', cost: 300 },
  { id: '3', name: '3', cost: 300 },
  { id: '4', name: '4', cost: 300 },
  { id: '5', name: '5', cost: 6000 },
  { id: '6', name: '6', cost: 60000 },
];

const named = <T extends Omit<LookOption, 'name' | 'lock'>>(b: T, name: Bi, lock?: Bi): T & LookOption => {
  const texts: Partial<Record<'name' | 'lock', Bi>> = { name };
  if (lock) texts.lock = lock;
  return withText(b, texts as Record<'name' | 'lock', Bi>);
};

export const TWIST_OPTIONS: (LookOption & { twist: number | null })[] = [
  named({ id: 'abierto', cost: 500, twist: 1.1 }, { es: 'Abierto', en: 'Open' }),
  named({ id: 'clasico', cost: 0, twist: null }, { es: 'Original', en: 'Original' }),
  named({ id: 'cerrado', cost: 500, twist: 2.8 }, { es: 'Cerrado', en: 'Tight' }),
];

export const PALETTES: (LookOption & { tint: [number, number, number] })[] = [
  named({ id: 'clasica', cost: 0, tint: [1, 1, 1] as [number, number, number], swatch: 'linear-gradient(135deg,#ffe9c8,#cfe0ff)' }, { es: 'Clásica', en: 'Classic' }),
  named({ id: 'ambar', cost: 1500, tint: [1.18, 0.92, 0.66] as [number, number, number], swatch: 'linear-gradient(135deg,#ffc56b,#ff8a3a)' }, { es: 'Ámbar', en: 'Amber' }),
  named({ id: 'glaciar', cost: 1500, tint: [0.72, 0.92, 1.25] as [number, number, number], swatch: 'linear-gradient(135deg,#bfefff,#5f9fff)' }, { es: 'Glaciar', en: 'Glacier' }),
  named({ id: 'aurora', cost: 15000, tint: [0.66, 1.16, 0.86] as [number, number, number], swatch: 'linear-gradient(135deg,#7dffb2,#4fbfff)' }, { es: 'Aurora', en: 'Aurora' }),
  named({ id: 'rosa', cost: 15000, tint: [1.22, 0.74, 1.04] as [number, number, number], swatch: 'linear-gradient(135deg,#ff9ad0,#b47bff)' }, { es: 'Rosa cósmico', en: 'Cosmic pink' }),
  named({ id: 'violeta', cost: 150000, tint: [0.92, 0.68, 1.32] as [number, number, number], swatch: 'linear-gradient(135deg,#c49bff,#5f4bff)' }, { es: 'Violeta profundo', en: 'Deep violet' }),
  named(
    { id: 'estelar', cost: 0, tint: [1.12, 1.04, 0.82] as [number, number, number], swatch: 'linear-gradient(135deg,#fff6d0,#ffd36b 50%,#7fd4ff)' },
    { es: 'Mapa estelar', en: 'Star map' },
    { es: '6 constelaciones', en: '6 constellations' },
  ),
];

export const JET_OPTIONS: (LookOption & { a: number; b: number })[] = [
  named({ id: 'azul', cost: 0, a: 0xcfe4ff, b: 0x8a6bff, swatch: 'linear-gradient(135deg,#cfe4ff,#8a6bff)' }, { es: 'Azul', en: 'Blue' }),
  named({ id: 'dorado', cost: 4000, a: 0xfff0c0, b: 0xffa040, swatch: 'linear-gradient(135deg,#fff0c0,#ffa040)' }, { es: 'Dorado', en: 'Gold' }),
  named({ id: 'esmeralda', cost: 4000, a: 0xd0ffe8, b: 0x30d090, swatch: 'linear-gradient(135deg,#d0ffe8,#30d090)' }, { es: 'Esmeralda', en: 'Emerald' }),
  named({ id: 'carmesi', cost: 40000, a: 0xffd6d0, b: 0xff3050, swatch: 'linear-gradient(135deg,#ffd6d0,#ff3050)' }, { es: 'Carmesí', en: 'Crimson' }),
  named(
    { id: 'hipernova', cost: 0, a: 0xffffff, b: 0xff7a1a, swatch: 'linear-gradient(135deg,#ffffff,#ffb040 45%,#ff3a6a)' },
    { es: 'Hipernova', en: 'Hypernova' },
    { es: 'una hipernova', en: 'a hypernova' },
  ),
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
