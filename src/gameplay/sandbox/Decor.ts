import * as THREE from 'three';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import type { GalaxyField } from '../../vfx/GalaxyField';
import { TAU } from '../../utils/math';
import { NEBULAE, STARS } from './Catalog';

/** Beyond this many units of one star type, extra purchases only add production. */
export const MAX_VISIBLE = 24;

interface Slot {
  a: number;
  th: number;
  h: number;
  ph: number;
}

/** A nebula is a fixed cloud of puffs: [dx, dy, dz, r, g, b, alpha, size] × n. */
type Shape = { soft: number[]; glow: number[] };

export interface DecorSpot {
  id: string;
  pos: THREE.Vector3;
}

const fract = (x: number) => x - Math.floor(x);
const hash = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const idSeed = (id: string) => {
  let s = 0;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) % 9973;
  return s;
};

/**
 * Renders every star and nebula the player bought in free mode. Each unit gets a
 * deterministic orbit, so a galaxy looks the same every time it is loaded.
 */
export class SandboxDecor {
  glow: SpriteBatch;
  star: SpriteBatch;
  soft: SpriteBatch;
  /** Positions of the visible objects last frame (for hover labels). */
  spots: DecorSpot[] = [];
  private births = new Map<string, number>();
  private shapes = new Map<string, Shape>();
  private p = new THREE.Vector3();

  constructor(group: THREE.Group) {
    this.glow = new SpriteBatch(5000, 'glow', { stretch: 0 });
    this.star = new SpriteBatch(600, 'star', { stretch: 0 });
    this.soft = new SpriteBatch(2000, 'soft', { stretch: 0 });
    this.soft.mesh.renderOrder = 5;
    this.glow.mesh.renderOrder = 6;
    this.star.mesh.renderOrder = 7;
    group.add(this.soft.mesh, this.glow.mesh, this.star.mesh);
  }

  private slot(id: string, i: number, nebula: boolean): Slot {
    const s = idSeed(id) * 13.37 + i * 7.13;
    return nebula
      ? { a: 0.42 + 0.55 * hash(s + 1), th: TAU * hash(s + 2), h: (hash(s + 3) - 0.5) * 3, ph: hash(s + 4) }
      : { a: 0.14 + 0.8 * Math.sqrt(hash(s + 1)), th: TAU * hash(s + 2), h: (hash(s + 3) - 0.5) * 1.4, ph: hash(s + 4) };
  }

  position(gal: GalaxyField, id: string, i: number, time: number, out = new THREE.Vector3()) {
    const sl = this.slot(id, i, NEBULAE.some((n) => n.id === id));
    return gal.orbitPos(sl.a, sl.th, sl.h, time, out);
  }

  /** Marks a freshly bought unit so it fades in with a birth flash. */
  born(id: string, i: number, time: number) {
    this.births.set(`${id}:${i}`, time);
  }

  render(gal: GalaxyField, time: number, count: (id: string) => number, sz: number) {
    const glow = this.glow;
    const star = this.star;
    const soft = this.soft;
    glow.begin();
    star.begin();
    soft.begin();
    this.spots.length = 0;
    const p = this.p;

    for (const def of STARS) {
      const n = Math.min(MAX_VISIBLE, count(def.id));
      for (let i = 0; i < n; i++) {
        const sl = this.slot(def.id, i, false);
        gal.orbitPos(sl.a, sl.th, sl.h, time, p);
        const f = this.birth(def.id, i, time, p, sz);
        if (i < 12) this.spots.push({ id: def.id, pos: p.clone() });
        const ph = sl.ph * TAU;
        switch (def.id) {
          case 'redgiant':
            star.push(p.x, p.y, p.z, 0, 0, 0, 1, 0.5, 0.25, f, 11 * sz);
            glow.push(p.x, p.y, p.z, 0, 0, 0, 1, 0.35, 0.12, 0.22 * f, 26 * sz);
            break;
          case 'bluegiant':
            star.push(p.x, p.y, p.z, 0, 0, 0, 0.65, 0.8, 1, 1.1 * f, 15 * sz);
            glow.push(p.x, p.y, p.z, 0, 0, 0, 0.45, 0.6, 1, 0.25 * f, 34 * sz);
            break;
          case 'binary': {
            const a = time * (1.4 + sl.ph) + ph;
            const ox = Math.cos(a) * 9 * sz;
            const oz = Math.sin(a) * 9 * sz;
            star.push(p.x + ox, p.y, p.z + oz, 0, 0, 0, 1, 0.85, 0.5, f, 12 * sz);
            star.push(p.x - ox, p.y, p.z - oz, 0, 0, 0, 0.6, 0.75, 1, f, 10 * sz);
            glow.push(p.x, p.y, p.z, 0, 0, 0, 0.8, 0.8, 1, 0.16 * f, 28 * sz);
            break;
          }
          case 'pulsar': {
            const beat = Math.pow(Math.max(0, Math.sin(time * 9 + ph)), 6);
            star.push(p.x, p.y, p.z, 0, 0, 0, 0.75, 0.95, 1, (0.5 + beat) * f, 9 * sz);
            const a = time * 2.4 + ph;
            const dx = Math.cos(a) * 0.85;
            const dy = 0.5;
            const dz = Math.sin(a) * 0.85;
            for (let k = 1; k <= 6; k++) {
              const d = k * 7 * sz;
              const al = (0.55 - k * 0.07) * (0.4 + beat) * f;
              glow.push(p.x + dx * d, p.y + dy * d, p.z + dz * d, 0, 0, 0, 0.6, 0.85, 1, al, (7 - k * 0.6) * sz);
              glow.push(p.x - dx * d, p.y - dy * d, p.z - dz * d, 0, 0, 0, 0.6, 0.85, 1, al, (7 - k * 0.6) * sz);
            }
            break;
          }
          case 'magnetar': {
            const flare = Math.pow(Math.max(0, Math.sin(time * 0.6 + ph * 20)), 16);
            star.push(p.x, p.y, p.z, 0, 0, 0, 1, 0.5, 1, (1 + flare) * f, 11 * sz);
            glow.push(p.x, p.y, p.z, 0, 0, 0, 0.85, 0.3, 1, (0.2 + 0.6 * flare) * f, 26 * sz * (1 + 2 * flare));
            break;
          }
          case 'wolfrayet': {
            star.push(p.x, p.y, p.z, 0, 0, 0, 0.75, 0.72, 1, 1.1 * f, 13 * sz);
            const w = fract(time * 0.2 + sl.ph);
            const r = (6 + w * 30) * sz;
            for (let k = 0; k < 10; k++) {
              const a = (k / 10) * TAU + ph;
              glow.push(p.x + Math.cos(a) * r, p.y + Math.sin(a * 2) * r * 0.3, p.z + Math.sin(a) * r, 0, 0, 0, 0.55, 0.75, 1, 0.4 * (1 - w) * f, 6 * sz);
            }
            break;
          }
          case 'hyper': {
            star.push(p.x, p.y, p.z, 0, 0, 0, 1, 0.92, 0.75, 1.3 * f, 22 * sz);
            glow.push(p.x, p.y, p.z, 0, 0, 0, 1, 0.75, 0.45, 0.28 * f, 45 * sz);
            for (const s of [1, -1]) soft.push(p.x, p.y + s * 15 * sz, p.z, 0, 0, 0, 1, 0.55, 0.4, 0.3 * f, 20 * sz);
            break;
          }
          case 'pop3': {
            const tw = 1 + 0.12 * Math.sin(time * 2 + ph);
            star.push(p.x, p.y, p.z, 0, 0, 0, 0.75, 0.78, 1, 1.6 * f, 28 * sz);
            glow.push(p.x, p.y, p.z, 0, 0, 0, 0.55, 0.45, 1, 0.35 * f, 60 * sz * tw);
            glow.push(p.x, p.y, p.z, 0, 0, 0, 1, 1, 1, 0.5 * f, 14 * sz);
            break;
          }
        }
      }
    }

    for (const def of NEBULAE) {
      const n = count(def.id);
      for (let i = 0; i < n; i++) {
        const sl = this.slot(def.id, i, true);
        gal.orbitPos(sl.a, sl.th, sl.h, time, p);
        const f = this.birth(def.id, i, time, p, sz * 1.5);
        this.spots.push({ id: def.id, pos: p.clone() });
        const shape = this.shape(def.id, i);
        const rot = time * 0.03 + sl.ph * TAU;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const breathe = def.id === 'snr' ? 1 + 0.06 * Math.sin(time * 0.5 + sl.ph * 9) : 1;
        const ns = sz * 0.75; // nebulae are already big: they grow a bit less than stars
        const k = ns * breathe;
        const emit = (arr: number[], b: SpriteBatch) => {
          for (let j = 0; j < arr.length; j += 8) {
            const x = arr[j] * c - arr[j + 2] * s;
            const z = arr[j] * s + arr[j + 2] * c;
            b.push(p.x + x * k, p.y + arr[j + 1] * ns, p.z + z * k, 0, 0, 0, arr[j + 3], arr[j + 4], arr[j + 5], arr[j + 6] * f, arr[j + 7] * ns);
          }
        };
        emit(shape.soft, soft);
        emit(shape.glow, glow);
      }
    }
    glow.end();
    star.end();
    soft.end();
  }

  /** Fade-in factor of a unit; also draws its expanding birth ring. */
  private birth(id: string, i: number, time: number, p: THREE.Vector3, sz: number) {
    const key = `${id}:${i}`;
    const t0 = this.births.get(key);
    if (t0 === undefined) return 1;
    const age = time - t0;
    if (age > 2.5) {
      this.births.delete(key);
      return 1;
    }
    const r = (8 + age * 45) * sz;
    const al = (1 - age / 2.5) * 0.6;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      this.glow.push(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r, 0, 0, 0, 1, 0.9, 0.7, al, 7 * sz);
    }
    this.glow.push(p.x, p.y, p.z, 0, 0, 0, 1, 0.95, 0.85, Math.max(0, 1 - age) * 1.5, 40 * sz);
    return Math.min(1, age / 1.2);
  }

  private shape(id: string, i: number): Shape {
    const key = `${id}:${i}`;
    let sh = this.shapes.get(key);
    if (sh) return sh;
    let seed = idSeed(id) * 3.1 + i * 17.7;
    const rnd = () => hash((seed += 1.618));
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.15;
    const soft: number[] = [];
    const glow: number[] = [];
    const put = (arr: number[], x: number, y: number, z: number, c: number[], a: number, size: number) => arr.push(x, y, z, c[0], c[1], c[2], a, size);
    switch (id) {
      case 'emission':
        for (let k = 0; k < 26; k++) {
          const r = 55 * Math.sqrt(rnd());
          const a = rnd() * TAU;
          const u = rnd();
          const col = u < 0.7 ? [1, 0.32, 0.55] : u < 0.9 ? [0.65, 0.3, 0.95] : [1, 0.6, 0.7];
          put(soft, Math.cos(a) * r, gauss() * 8, Math.sin(a) * r, col, 0.16 + rnd() * 0.1, 26 + rnd() * 22);
        }
        for (let k = 0; k < 5; k++) put(glow, gauss() * 20, gauss() * 4, gauss() * 20, [0.8, 0.9, 1], 0.9, 4);
        break;
      case 'reflection':
        for (let k = 0; k < 22; k++) {
          const t = rnd();
          const a = t * 2.2;
          const r = 40 + gauss() * 8;
          put(soft, Math.cos(a) * r - 25, gauss() * 6, Math.sin(a) * r - 15, rnd() < 0.8 ? [0.35, 0.55, 1] : [0.7, 0.85, 1], 0.14 + rnd() * 0.08, 22 + rnd() * 18);
        }
        put(glow, 0, 0, 0, [0.85, 0.9, 1], 1.2, 10);
        put(glow, 0, 0, 0, [0.5, 0.65, 1], 0.4, 40);
        break;
      case 'planetary':
        for (let k = 0; k < 26; k++) {
          const a = (k / 26) * TAU;
          put(soft, Math.cos(a) * 22, 0, Math.sin(a) * 22, [0.3, 1, 0.85], 0.3, 12 + rnd() * 4);
        }
        for (let k = 0; k < 22; k++) {
          const a = (k / 22) * TAU + 0.1;
          put(soft, Math.cos(a) * 31, 0, Math.sin(a) * 31, [1, 0.3, 0.35], 0.16, 14);
        }
        put(soft, 0, 0, 0, [0.4, 0.6, 1], 0.15, 20);
        put(glow, 0, 0, 0, [1, 1, 1], 1, 4);
        put(glow, 0, 0, 0, [0.4, 1, 0.9], 0.25, 50);
        break;
      case 'snr':
        for (let k = 0; k < 44; k++) {
          const a = rnd() * TAU;
          const r = 32 * (0.85 + rnd() * 0.3);
          const u = rnd();
          const col = u < 0.45 ? [1, 0.35, 0.3] : u < 0.85 ? [0.35, 1, 0.7] : [0.6, 0.5, 1];
          put(soft, Math.cos(a) * r, gauss() * 10, Math.sin(a) * r, col, 0.22, 7 + rnd() * 7);
        }
        put(glow, 0, 0, 0, [0.7, 0.9, 1], 1, 4);
        put(glow, 0, 0, 0, [0.6, 0.7, 1], 0.2, 36);
        break;
      case 'pillars': {
        for (let k = 0; k < 8; k++) put(soft, gauss() * 30, 20 + gauss() * 10, gauss() * 30, [0.3, 0.75, 0.6], 0.08, 50);
        const cols: [number, number, number][] = [[-18, 0, 60], [0, 6, 80], [16, -4, 50]];
        for (const [x, z, hgt] of cols) {
          for (let k = 0; k < 9; k++) {
            const t = k / 8;
            put(soft, x + gauss() * 2, t * hgt, z + gauss() * 2, [0.75, 0.5, 0.28], 0.26, 18 - t * 10);
          }
          put(glow, x, hgt + 3, z, [1, 0.85, 0.55], 0.7, 8);
        }
        break;
      }
    }
    sh = { soft, glow };
    this.shapes.set(key, sh);
    return sh;
  }

  dispose() {
    this.glow.dispose();
    this.star.dispose();
    this.soft.dispose();
  }
}
