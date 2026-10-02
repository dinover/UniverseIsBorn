import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { NOISE_GLSL, BLACKBODY_GLSL } from '../../shaders/noise';

const MAX_RIVALS = 4;

const vert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/*
 * Screen-space general-relativistic lens.
 * - Near the primary black hole, every pixel's ray is integrated through a Schwarzschild
 *   potential (photon acceleration a = -1.5 h^2 r / |r|^5 in units of rs). The ray can
 *   cross a thin, turbulent, Doppler-beamed accretion disk several times (primary +
 *   secondary images, photon ring) and either falls through the horizon or escapes.
 *   Escaped rays re-project their final direction onto the already rendered frame,
 *   so the real scene (particles, stars, nebulae) gets lensed, Einstein rings included.
 * - Farther out a matching weak-field deflection (alpha = 2 rs / b) is used.
 * - Other black holes use a cheap point-lens mapping plus a shadow disc.
 */
const frag = /* glsl */ `
#define STEPS __STEPS__
uniform sampler2D tDiffuse;
uniform vec3 uCamPos;
uniform mat4 uInvViewProj;
uniform mat4 uViewProj;
uniform vec3 uBH;
uniform float uRs;
uniform vec3 uN;
uniform vec3 uE1;
uniform vec3 uE2;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uDiskI;
uniform float uDiskHeat;
uniform float uTime;
uniform float uFlow;
uniform vec2 uBHuv;
uniform float uBHr;
uniform float uLensR;
uniform float uAspect;
uniform float uFar;
uniform float uPrimary;
uniform float uGlow;
uniform vec4 uRivals[${MAX_RIVALS}];
uniform int uRivalCount;
varying vec2 vUv;

${NOISE_GLSL}
${BLACKBODY_GLSL}

vec2 projectLocal(vec3 p, vec3 dir, out float behind){
  vec3 wp = uBH + (p + dir * uFar) * uRs;
  vec4 c = uViewProj * vec4(wp, 1.0);
  behind = c.w <= 0.0 ? 1.0 : 0.0;
  if (c.w <= 0.0) return uBHuv - (vUv - uBHuv);
  return c.xy / c.w * 0.5 + 0.5;
}

vec3 sampleScene(vec2 suv){
  vec2 m = clamp(suv, vec2(0.001), vec2(0.999));
  float edge = 1.0 - smoothstep(0.0, 0.08, max(max(-suv.x, suv.x - 1.0), max(-suv.y, suv.y - 1.0)));
  return texture2D(tDiffuse, m).rgb * edge;
}

vec4 disk(vec3 hit, vec3 rd){
  float r = length(hit);
  if (r < uDiskIn * 0.8 || r > uDiskOut) return vec4(0.0);
  vec2 q = vec2(dot(hit, uE1), dot(hit, uE2));
  float ang = atan(q.y, q.x);
  float omega = uFlow * 3.2 * pow(max(r, 1.0), -1.5);
  // Two time-phases cross-faded so differential rotation never winds the noise into aliasing.
  const float P = 14.0;
  float t1 = mod(uTime, P);
  float t2 = mod(uTime + P * 0.5, P);
  float w = abs(t1 / P * 2.0 - 1.0);
  float a1 = ang - t1 * omega;
  float a2 = ang - t2 * omega + 1.7;
  float n = mix(fbm3(vec3(cos(a1) * 1.7, sin(a1) * 1.7, r * 1.35)), fbm3(vec3(cos(a2) * 1.7, sin(a2) * 1.7, r * 1.35 + 5.0)), w);
  float n2 = mix(snoise(vec3(cos(a1) * 5.0, sin(a1) * 5.0, r * 4.0)), snoise(vec3(cos(a2) * 5.0, sin(a2) * 5.0, r * 4.0 + 3.0)), w);
  float dens = clamp(0.55 + 0.75 * n + 0.18 * n2, 0.0, 1.4);
  float inner = smoothstep(uDiskIn * 0.8, uDiskIn * 1.12, r);
  float outer = 1.0 - smoothstep(uDiskOut * 0.45, uDiskOut, r);
  float edges = inner * outer;
  // Keplerian velocity & relativistic Doppler beaming.
  vec3 vdir = normalize(cross(uN, hit));
  float beta = clamp(sqrt(0.5 / r), 0.0, 0.62);
  float gamma = inversesqrt(1.0 - beta * beta);
  float cosT = dot(vdir, -rd);
  float dop = 1.0 / (gamma * (1.0 - beta * cosT));
  float grav = sqrt(max(0.0, 1.0 - 1.0 / r));
  float shift = dop * grav;
  float temp = pow(uDiskIn / r, 0.75) * uDiskHeat * shift;
  vec3 col = blackbody(temp * 0.9 + 0.05);
  float I = min(pow(shift, 3.0), 3.5) * (0.35 + 1.1 * pow(uDiskIn / r, 1.6));
  float alpha = clamp(dens * edges * 1.1, 0.0, 1.0) * clamp(uDiskI * 1.3, 0.0, 1.0);
  vec3 emit = col * dens * edges * I * uDiskI * 1.1;
  return vec4(emit, alpha);
}

vec3 thinLens(vec3 camL, vec3 rd, out float shadow){
  float t = -dot(camL, rd);
  vec3 pc = camL + rd * max(t, 0.0);
  float b = max(length(pc), 1e-3);
  shadow = smoothstep(2.3, 2.9, b);
  float alpha = min(2.0 / b, 1.2);
  vec3 outDir = normalize(rd - (pc / b) * alpha);
  float behind;
  vec2 suv = projectLocal(pc, outDir, behind);
  return sampleScene(suv);
}

vec2 rivalLens(vec2 uv, out float shade){
  shade = 1.0;
  for (int i = 0; i < ${MAX_RIVALS}; i++){
    if (i >= uRivalCount) break;
    vec4 rv = uRivals[i];
    vec2 d = (uv - rv.xy) * vec2(uAspect, 1.0);
    float r = max(length(d), 1e-4);
    float rE = rv.z;
    float fade = 1.0 - smoothstep(rE * 5.0, rE * 9.0, r);
    vec2 src = d - d / r * (rE * rE / r) * fade;
    uv = rv.xy + src / vec2(uAspect, 1.0);
    if (rv.w > 0.0) shade *= smoothstep(rv.w * 0.92, rv.w * 1.08, r);
  }
  return uv;
}

void main(){
  float shade;
  vec2 uv = rivalLens(vUv, shade);
  vec3 base = texture2D(tDiffuse, uv).rgb * shade;
  // Rival photon rings
  for (int i = 0; i < ${MAX_RIVALS}; i++){
    if (i >= uRivalCount) break;
    vec4 rv = uRivals[i];
    if (rv.w <= 0.0) continue;
    float r = length((vUv - rv.xy) * vec2(uAspect, 1.0));
    base += vec3(1.0, 0.7, 0.45) * exp(-pow((r - rv.w * 1.12) / (rv.w * 0.07 + 1e-4), 2.0)) * 0.8;
  }
  if (uPrimary < 0.5){ gl_FragColor = vec4(base, 1.0); return; }

  vec2 dUv = (vUv - uBHuv) * vec2(uAspect, 1.0);
  float dist = length(dUv);
  if (dist > uLensR){ gl_FragColor = vec4(base, 1.0); return; }

  vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 wp = uInvViewProj * ndc; wp /= wp.w;
  vec3 rd = normalize(wp.xyz - uCamPos);
  vec3 camL = (uCamPos - uBH) / uRs;

  float sh;
  vec3 lensCol = thinLens(camL, rd, sh) * sh;
  float lensFade = smoothstep(uLensR, uLensR * 0.6, dist);
  vec3 outCol = mix(base, lensCol, lensFade);

  if (dist < uBHr){
    // Full geodesic integration.
    float R0 = max(uDiskOut * 1.25, 14.0);
    vec3 p = camL;
    float cd = length(camL);
    if (cd > R0){
      float b = dot(camL, rd);
      float c = dot(camL, camL) - R0 * R0;
      float disc = b * b - c;
      if (disc > 0.0) p = camL + rd * (-b - sqrt(disc));
    }
    vec3 v = rd;
    vec3 hvec = cross(p, v);
    float h2 = dot(hvec, hvec);
    vec3 acc = vec3(0.0);
    float aacc = 0.0;
    bool captured = false;
    float minR = 1e5;
    float stepK = 6.0 / float(STEPS);
    for (int i = 0; i < STEPS; i++){
      float r2 = dot(p, p);
      float r = sqrt(r2);
      minR = min(minR, r);
      float dt = clamp(stepK * r, 0.015, 3.0);
      vec3 a = -1.5 * h2 * p / (r2 * r2 * r);
      vec3 prev = p;
      v += a * dt;
      p += v * dt;
      float s0 = dot(prev, uN);
      float s1 = dot(p, uN);
      if (s0 * s1 < 0.0 && aacc < 0.99){
        vec3 hit = mix(prev, p, s0 / (s0 - s1));
        vec4 dc = disk(hit, normalize(v));
        acc += (1.0 - aacc) * dc.rgb;
        aacc += (1.0 - aacc) * dc.a;
      }
      if (dot(p, p) < 1.0){ captured = true; break; }
      if (r > R0 * 1.02 && dot(p, v) > 0.0) break;
    }
    vec3 bg = vec3(0.0);
    if (!captured){
      float behind;
      bg = sampleScene(projectLocal(p, normalize(v), behind));
    }
    vec3 ring = vec3(1.0, 0.82, 0.62) * exp(-pow((minR - 1.55) * 5.0, 2.0)) * (0.12 + 0.5 * uDiskI);
    vec3 col = acc + (1.0 - aacc) * bg + ring * (captured ? 0.0 : 1.0);
    // soft halo for bloom
    col += blackbody(uDiskHeat * 0.6) * uGlow * uDiskI * 0.01 / (minR * minR * 0.08 + 0.3);
    float blend = smoothstep(uBHr, uBHr * 0.8, dist);
    outCol = mix(outCol, col, blend);
  }
  gl_FragColor = vec4(outCol, 1.0);
}
`;

export interface RivalLensData {
  pos: THREE.Vector3;
  rs: number;
  /** Pure lens without event horizon (e.g. dark matter halo). */
  lensOnly?: boolean;
}

export class BlackHolePass extends ShaderPass {
  primaryActive = false;
  bhPos = new THREE.Vector3();
  rs = 1;
  diskNormal = new THREE.Vector3(0, 1, 0);
  diskIntensity = 0;
  diskHeat = 0.7;
  diskInner = 3;
  diskOuter = 14;
  flow = 1;
  glow = 1;
  rivals: RivalLensData[] = [];
  private steps: number;

  constructor(steps: number) {
    super({
      uniforms: {
        tDiffuse: { value: null },
        uCamPos: { value: new THREE.Vector3() },
        uInvViewProj: { value: new THREE.Matrix4() },
        uViewProj: { value: new THREE.Matrix4() },
        uBH: { value: new THREE.Vector3() },
        uRs: { value: 1 },
        uN: { value: new THREE.Vector3(0, 1, 0) },
        uE1: { value: new THREE.Vector3(1, 0, 0) },
        uE2: { value: new THREE.Vector3(0, 0, 1) },
        uDiskIn: { value: 3 },
        uDiskOut: { value: 14 },
        uDiskI: { value: 0 },
        uDiskHeat: { value: 0.7 },
        uTime: { value: 0 },
        uFlow: { value: 1 },
        uBHuv: { value: new THREE.Vector2() },
        uBHr: { value: 0 },
        uLensR: { value: 0 },
        uAspect: { value: 1 },
        uFar: { value: 100 },
        uPrimary: { value: 0 },
        uGlow: { value: 1 },
        uRivals: { value: Array.from({ length: MAX_RIVALS }, () => new THREE.Vector4()) },
        uRivalCount: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: frag.replace('__STEPS__', String(steps)),
    });
    this.steps = steps;
  }

  setSteps(steps: number) {
    if (steps === this.steps) return;
    this.steps = steps;
    this.material.fragmentShader = frag.replace('__STEPS__', String(steps));
    this.material.needsUpdate = true;
  }

  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  /** Screen-space radius (in uv-y units) of a sphere of radius `r` at `pos`. */
  private screenRadius(camera: THREE.PerspectiveCamera, pos: THREE.Vector3, r: number): number {
    const dist = camera.position.distanceTo(pos);
    if (dist <= r) return 10;
    const ang = Math.asin(Math.min(1, r / dist));
    return Math.tan(ang) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 0.5;
  }

  updateUniforms(camera: THREE.PerspectiveCamera, time: number) {
    const u = this.uniforms as any;
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.uViewProj.value.copy(vp);
    u.uInvViewProj.value.copy(vp).invert();
    u.uCamPos.value.copy(camera.position);
    u.uTime.value = time;
    u.uAspect.value = camera.aspect;

    const anyRival = this.rivals.length > 0;
    let count = 0;
    for (const rv of this.rivals) {
      if (count >= MAX_RIVALS) break;
      this.tmp.copy(rv.pos).project(camera);
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.6 || Math.abs(this.tmp.y) > 1.6) continue;
      const shadow = this.screenRadius(camera, rv.pos, rv.rs * 2.6);
      if (shadow < 0.0008) continue;
      u.uRivals.value[count].set(this.tmp.x * 0.5 + 0.5, this.tmp.y * 0.5 + 0.5, shadow * 0.95, rv.lensOnly ? -1 : shadow);
      count++;
    }
    u.uRivalCount.value = count;

    if (!this.primaryActive) {
      u.uPrimary.value = 0;
      this.enabled = anyRival && count > 0;
      return;
    }
    this.tmp.copy(this.bhPos).project(camera);
    const inFront = this.tmp.z < 1;
    const lensR = this.screenRadius(camera, this.bhPos, this.rs * Math.max(this.diskOuter * 2.6, 40));
    const rayR = this.screenRadius(camera, this.bhPos, this.rs * Math.max(this.diskOuter * 1.25, 14));
    const visible = inFront && Math.abs(this.tmp.x) < 1 + lensR * 2 && Math.abs(this.tmp.y) < 1 + lensR * 2;
    this.enabled = visible || count > 0;
    u.uPrimary.value = visible ? 1 : 0;
    u.uBH.value.copy(this.bhPos);
    u.uRs.value = this.rs;
    u.uBHuv.value.set(this.tmp.x * 0.5 + 0.5, this.tmp.y * 0.5 + 0.5);
    u.uBHr.value = rayR < 0.004 ? 0 : rayR;
    u.uLensR.value = lensR;
    u.uFar.value = camera.position.distanceTo(this.bhPos) / this.rs;

    const n = this.diskNormal.clone().normalize();
    u.uN.value.copy(n);
    const helper = Math.abs(n.y) < 0.9 ? this.tmp2.set(0, 1, 0) : this.tmp2.set(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(n, helper).normalize();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    u.uE1.value.copy(e1);
    u.uE2.value.copy(e2);
    u.uDiskIn.value = this.diskInner;
    u.uDiskOut.value = this.diskOuter;
    u.uDiskI.value = this.diskIntensity;
    u.uDiskHeat.value = this.diskHeat;
    u.uFlow.value = this.flow;
    u.uGlow.value = this.glow;
  }
}
