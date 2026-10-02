import type { Rng } from '../procgen/rng';

export type BodyKind = 'gas' | 'dust' | 'star' | 'wd' | 'ns' | 'bh' | 'cluster' | 'nebula';

export interface Body {
  id: number;
  kind: BodyKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  mass: number;
  radius: number;
  color: [number, number, number];
  seed: number;
  alive: boolean;
  age: number;
  /** accumulated swept angle around the player, to detect full orbits */
  swept: number;
  lastAngle: number;
  jetExposure: number;
  /** cluster members (offsets) or nebula young stars */
  members?: Float32Array;
  memberCount?: number;
  planets?: number;
  young?: boolean;
  name?: string;
}

let nextId = 1;

export interface BodyTemplate {
  kind: BodyKind;
  weight: number;
}

/** Visual/gameplay descriptions of each growth source (risk / reward). */
export const KIND_INFO: Record<BodyKind, { label: string; massFrac: [number, number]; risk: string }> = {
  gas: { label: 'Nube de gas', massFrac: [0.03, 0.06], risk: 'Fácil de capturar, alimenta el disco poco a poco.' },
  dust: { label: 'Polvo', massFrac: [0.01, 0.025], risk: 'Poco valor, pero te frena.' },
  star: { label: 'Estrella', massFrac: [0.08, 0.16], risk: 'Mucha masa, pero se destroza: la mitad sale despedida.' },
  wd: { label: 'Enana blanca', massFrac: [0.03, 0.05], risk: 'Compacta y rápida: difícil de atrapar, cae entera.' },
  ns: { label: 'Estrella de neutrones', massFrac: [0.04, 0.07], risk: 'Su púlsar drena tu energía si te toca el haz.' },
  bh: { label: 'Agujero negro', massFrac: [0.3, 0.9], risk: 'Fusión: enorme recompensa... o te devora si es mayor.' },
  cluster: { label: 'Cúmulo estelar', massFrac: [0.35, 0.8], risk: 'Cientos de estrellas: desármalo con tu marea.' },
  nebula: { label: 'Nebulosa', massFrac: [0.25, 0.5], risk: 'Gas abundante que forma estrellas nuevas.' },
};

const STAR_COLORS: [number, number, number][] = [
  [0.6, 0.72, 1.0],
  [0.8, 0.88, 1.0],
  [1.0, 0.95, 0.85],
  [1.0, 0.85, 0.55],
  [1.0, 0.62, 0.38],
  [1.0, 0.45, 0.3],
];
const GAS_COLORS: [number, number, number][] = [
  [0.45, 0.55, 1.0],
  [0.95, 0.45, 0.7],
  [1.0, 0.6, 0.35],
  [0.5, 0.9, 0.85],
  [0.75, 0.5, 1.0],
];

export function makeBody(kind: BodyKind, rng: Rng, M: number, L: number, x: number, z: number, vx: number, vz: number): Body {
  const info = KIND_INFO[kind];
  const mass = M * rng.range(info.massFrac[0], info.massFrac[1]);
  const s = Math.pow(L, 0.8);
  let radius = 1;
  let color: [number, number, number] = [1, 1, 1];
  const b: Body = { id: nextId++, kind, x, z, vx, vz, mass, radius, color, seed: rng.range(0, 1000), alive: true, age: 0, swept: 0, lastAngle: Math.atan2(z, x), jetExposure: 0 };
  switch (kind) {
    case 'gas':
      radius = s * rng.range(2.2, 4);
      color = rng.pick(GAS_COLORS);
      break;
    case 'dust':
      radius = s * rng.range(2, 3.5);
      color = [0.08, 0.05, 0.04];
      break;
    case 'star': {
      const c = rng.int(0, STAR_COLORS.length - 1);
      color = STAR_COLORS[c];
      radius = s * (0.45 + (STAR_COLORS.length - c) * 0.1);
      if (rng.chance(0.3)) b.planets = rng.int(1, 4);
      break;
    }
    case 'wd':
      radius = s * 0.3;
      color = [0.8, 0.9, 1.0];
      break;
    case 'ns':
      radius = s * 0.3;
      color = [0.65, 0.8, 1.0];
      break;
    case 'bh':
      radius = Math.pow(mass / 10, 1 / 3);
      color = [1, 0.7, 0.45];
      break;
    case 'cluster': {
      radius = s * rng.range(5, 8);
      color = rng.pick(STAR_COLORS);
      const n = rng.int(40, 90);
      b.memberCount = n;
      b.members = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        // Plummer-ish distribution
        const r = radius * 0.6 / Math.sqrt(Math.pow(rng.range(0.02, 1), -2 / 3) - 0.95);
        const a = rng.range(0, Math.PI * 2);
        b.members[i * 4] = Math.min(r, radius * 1.6);
        b.members[i * 4 + 1] = a;
        b.members[i * 4 + 2] = rng.range(-0.4, 0.4) * radius;
        b.members[i * 4 + 3] = rng.int(0, STAR_COLORS.length - 1);
      }
      break;
    }
    case 'nebula': {
      radius = s * rng.range(8, 12);
      color = rng.pick(GAS_COLORS);
      const n = 10;
      b.members = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        b.members[i * 2] = rng.range(0, radius * 0.8);
        b.members[i * 2 + 1] = rng.range(0, Math.PI * 2);
      }
      b.memberCount = n;
      break;
    }
  }
  b.radius = radius;
  b.color = color;
  return b;
}

export { STAR_COLORS, GAS_COLORS };
