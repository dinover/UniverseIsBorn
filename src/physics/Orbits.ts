/**
 * Two-body helpers on the gameplay plane (x, z), relative to a central mass with parameter mu = GM.
 */
export type OrbitClass = 'capture' | 'bound' | 'escape';

export interface OrbitInfo {
  type: OrbitClass;
  periapsis: number;
  eccentricity: number;
  energy: number;
}

export function classifyOrbit(rx: number, rz: number, vx: number, vz: number, mu: number, captureR: number): OrbitInfo {
  const r = Math.hypot(rx, rz);
  const v2 = vx * vx + vz * vz;
  const energy = v2 / 2 - mu / Math.max(r, 1e-6);
  const h = rx * vz - rz * vx; // specific angular momentum (scalar in 2D)
  // eccentricity vector magnitude
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (mu * mu)));
  const p = (h * h) / mu; // semi-latus rectum
  const periapsis = p / (1 + e);
  // Only a capture if the periapsis is actually ahead (or the body is already inside).
  const approaching = rx * vx + rz * vz < 0;
  let type: OrbitClass;
  if (periapsis < captureR && (approaching || r < captureR * 1.5)) type = 'capture';
  else if (energy < 0) type = 'bound';
  else type = 'escape';
  return { type, periapsis, eccentricity: e, energy };
}

/**
 * Integrates a test particle's future path (velocity-Verlet, adaptive step) for the orbit preview.
 * Writes xz pairs into `out` and returns the number of points written.
 */
export function predictPath(out: Float32Array, rx: number, rz: number, vx: number, vz: number, mu: number, soft: number, steps: number, horizon: number, stopR: number): number {
  let x = rx;
  let z = rz;
  let n = 0;
  const baseDt = horizon / steps;
  for (let i = 0; i < steps; i++) {
    out[n * 2] = x;
    out[n * 2 + 1] = z;
    n++;
    const r2 = x * x + z * z;
    const r = Math.sqrt(r2);
    if (r < stopR) break;
    // Smaller steps when close to the hole for stability.
    const dt = baseDt * Math.min(1, r / (stopR * 6) + 0.15);
    const a = -mu / Math.pow(r2 + soft * soft, 1.5);
    vx += x * a * dt * 0.5;
    vz += z * a * dt * 0.5;
    x += vx * dt;
    z += vz * dt;
    const r2b = x * x + z * z;
    const a2 = -mu / Math.pow(r2b + soft * soft, 1.5);
    vx += x * a2 * dt * 0.5;
    vz += z * a2 * dt * 0.5;
  }
  return n;
}
