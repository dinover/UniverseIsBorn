export const TAU = Math.PI * 2;

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a));
export const remap = (a: number, b: number, c: number, d: number, v: number) => lerp(c, d, invLerp(a, b, v));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential smoothing. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInExpo = (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));

export function angleLerp(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % TAU) - Math.PI;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/** Human readable mass in solar masses with scientific flavour. */
export function formatSolar(m: number): string {
  if (m < 1000) return m.toFixed(m < 10 ? 2 : m < 100 ? 1 : 0);
  if (m < 1e6) return (m / 1e3).toFixed(m < 1e4 ? 2 : 1) + ' mil';
  if (m < 1e9) return (m / 1e6).toFixed(m < 1e7 ? 2 : 1) + ' millones';
  return (m / 1e9).toFixed(2) + ' mil millones';
}

export function formatTime(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatBig(n: number): string {
  if (n < 1e4) return Math.round(n).toLocaleString('es');
  const units = ['', 'mil', 'M', 'mil M', 'B'];
  let u = 0;
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000;
    u++;
  }
  return n.toFixed(1) + ' ' + units[u];
}
