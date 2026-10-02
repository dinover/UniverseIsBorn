import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { damp } from '../utils/math';

export interface SkyParams {
  colA: THREE.ColorRepresentation;
  colB: THREE.ColorRepresentation;
  colC: THREE.ColorRepresentation;
  haze: THREE.ColorRepresentation;
  nebula: number;
  stars: number;
  band: number;
  galaxies: number;
  brightness: number;
}

const frag = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec3 uHaze;
uniform float uNeb;
uniform float uStars;
uniform float uBand;
uniform float uGal;
uniform float uBright;
uniform float uTime;
uniform float uSeed;
uniform vec3 uBandN;
varying vec3 vDir;
${NOISE_GLSL}

float starLayer(vec3 d, float scale, float thresh){
  vec3 p = d * scale;
  vec3 c = floor(p);
  vec3 h = hash33(c + uSeed);
  float present = step(thresh, h.x);
  vec3 sp = c + 0.2 + 0.6 * hash33(c + 17.0 + uSeed);
  float dist = length(p - sp);
  float tw = 0.75 + 0.25 * sin(uTime * (1.0 + h.y * 3.0) + h.z * 40.0);
  return present * exp(-dist * dist * 55.0) * (0.4 + h.y * 1.6) * tw;
}

void main(){
  vec3 d = normalize(vDir);
  vec3 s = d * 2.2 + uSeed * 0.013;
  float n = fbm5(s);
  float f = ridged(s * 1.3 + 4.0);
  float band = exp(-pow(dot(d, uBandN) * 3.2, 2.0));
  float nebMask = smoothstep(-0.15, 0.6, n) * (0.35 + 0.65 * uBand * band + (1.0 - uBand) * 0.6);
  vec3 neb = mix(uColA, uColB, smoothstep(-0.3, 0.5, fbm3(s * 1.7 + 11.0)));
  neb = mix(neb, uColC, smoothstep(0.55, 0.95, f) * 0.8);
  vec3 col = uHaze * (0.6 + 0.4 * n);
  col += neb * nebMask * uNeb * (0.5 + f * 0.8);
  // dark dust lanes
  float dust = smoothstep(0.1, 0.5, fbm3(s * 3.0 + 7.0)) * uBand * band;
  col *= 1.0 - dust * 0.6;
  // Milky band glow
  col += mix(uColC, vec3(1.0, 0.9, 0.8), 0.5) * band * uBand * 0.08 * (0.6 + 0.4 * n);
  float st = starLayer(d, 90.0, 0.93) + starLayer(d, 220.0, 0.9) * 0.7 + starLayer(d, 500.0, 0.85) * 0.5 * (0.5 + band * uBand);
  vec3 starCol = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), hash13(floor(d * 90.0)));
  col += starCol * st * uStars * (1.0 - dust * 0.8);
  // distant galaxies
  if (uGal > 0.0){
    vec3 p = d * 26.0;
    vec3 c = floor(p);
    vec3 h = hash33(c + 91.0);
    if (h.x > 0.86){
      vec3 gp = c + 0.5 + (hash33(c + 3.0) - 0.5) * 0.5;
      vec3 q = p - gp;
      float e = length(q * vec3(1.0, 2.5 + h.y * 2.0, 1.0));
      col += mix(vec3(0.9, 0.8, 1.0), vec3(1.0, 0.8, 0.6), h.z) * exp(-e * e * 60.0) * uGal * 0.9;
    }
  }
  gl_FragColor = vec4(col * uBright, 1.0);
}
`;

/** Procedural cosmic background that evolves era by era (dark ages -> starry -> galactic). */
export class Sky {
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private target: SkyParams | null = null;
  private speed = 1;

  constructor(seed: number) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColA: { value: new THREE.Color(0x2a0f3a) },
        uColB: { value: new THREE.Color(0x0b2340) },
        uColC: { value: new THREE.Color(0xff8850) },
        uHaze: { value: new THREE.Color(0x0a0604) },
        uNeb: { value: 0.3 },
        uStars: { value: 0 },
        uBand: { value: 0 },
        uGal: { value: 0 },
        uBright: { value: 1 },
        uTime: { value: 0 },
        uSeed: { value: (seed % 1000) + 0.5 },
        uBandN: { value: new THREE.Vector3(0.2, 0.9, 0.35).normalize() },
      },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.mat);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  set(p: SkyParams, transition = 3) {
    this.target = p;
    this.speed = transition <= 0 ? 1000 : 3 / transition;
    if (transition <= 0) this.update(1, 0, new THREE.Vector3());
  }

  update(dt: number, time: number, camPos: THREE.Vector3, far = 100) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    this.mesh.position.copy(camPos);
    this.mesh.scale.setScalar(far * 0.5);
    const t = this.target;
    if (!t) return;
    const k = 1 - Math.exp(-this.speed * dt);
    (u.uColA.value as THREE.Color).lerp(new THREE.Color(t.colA), k);
    (u.uColB.value as THREE.Color).lerp(new THREE.Color(t.colB), k);
    (u.uColC.value as THREE.Color).lerp(new THREE.Color(t.colC), k);
    (u.uHaze.value as THREE.Color).lerp(new THREE.Color(t.haze), k);
    u.uNeb.value = damp(u.uNeb.value, t.nebula, this.speed, dt);
    u.uStars.value = damp(u.uStars.value, t.stars, this.speed, dt);
    u.uBand.value = damp(u.uBand.value, t.band, this.speed, dt);
    u.uGal.value = damp(u.uGal.value, t.galaxies, this.speed, dt);
    u.uBright.value = damp(u.uBright.value, t.brightness, this.speed, dt);
  }
}

export const SKY_PRESETS: Record<string, SkyParams> = {
  darkAges: { colA: 0x3a1420, colB: 0x10203a, colC: 0xff9a60, haze: 0x0d0706, nebula: 0.35, stars: 0, band: 0, galaxies: 0, brightness: 1 },
  cloud: { colA: 0x2a1446, colB: 0x0d2a4a, colC: 0xff7a9a, haze: 0x06060c, nebula: 0.55, stars: 0.35, band: 0.2, galaxies: 0, brightness: 1 },
  stellar: { colA: 0x3b1030, colB: 0x0a2850, colC: 0xffa060, haze: 0x040409, nebula: 0.5, stars: 1, band: 0.7, galaxies: 0, brightness: 1 },
  collapse: { colA: 0x400808, colB: 0x1a0a20, colC: 0xff4020, haze: 0x0a0303, nebula: 0.45, stars: 0.8, band: 0.6, galaxies: 0, brightness: 0.8 },
  remnant: { colA: 0x0e3050, colB: 0x401860, colC: 0x60ffd0, haze: 0x030407, nebula: 0.6, stars: 1.1, band: 0.8, galaxies: 0.1, brightness: 1 },
  blackhole: { colA: 0x1a1040, colB: 0x08284a, colC: 0xff9050, haze: 0x020205, nebula: 0.5, stars: 1.2, band: 0.9, galaxies: 0.2, brightness: 1 },
  cluster: { colA: 0x301050, colB: 0x0a3050, colC: 0xffc080, haze: 0x030306, nebula: 0.55, stars: 1.4, band: 1, galaxies: 0.4, brightness: 1 },
  intergalactic: { colA: 0x0a0a20, colB: 0x06101e, colC: 0x8090ff, haze: 0x010103, nebula: 0.2, stars: 0.25, band: 0, galaxies: 1, brightness: 1 },
};
