import * as THREE from 'three';
import type { Rng } from '../procgen/rng';

export interface GalaxyParams {
  count: number;
  radius: number;
  arms: number;
  twist: number;
  ecc: number;
  pattern: number;
  vel: number;
  bulge: number; // fraction of bulge stars
  hueShift: number;
  bar?: boolean;
}

const vert = /* glsl */ `
attribute vec4 aOrbit;
attribute vec3 aColor;
attribute float aSize;
uniform float uTime;
uniform float uArms;
uniform float uTwist;
uniform float uEcc;
uniform float uPattern;
uniform float uR;
uniform float uVel;
uniform float uPx;
uniform float uBright;
uniform float uYoung;
uniform float uSizeMul;
uniform vec3 uCenter;
uniform vec4 uTidal;
uniform mat3 uOrient;
uniform float uFade;
uniform float uDark;
varying vec3 vColor;
varying float vAlpha;

vec3 orbitPos(vec4 o){
  float a = o.x;
  float rr = a * uR;
  float omega = uVel / (rr + uR * 0.06);
  float th = o.y + uTime * omega;
  float phi = log(a + 0.03) * uTwist + uTime * uPattern - uDark * 0.22;
  float e = uEcc * smoothstep(0.06, 0.3, a) * step(0.5, o.w);
  float r = rr * (1.0 + e * cos(uArms * (th - phi)));
  float thick = mix(0.32, 0.035, smoothstep(0.0, 0.22, a)) * uR * (o.w < 0.5 ? 1.0 : 0.55);
  return vec3(cos(th) * r, o.z * thick, sin(th) * r);
}

void main(){
  vec3 p = orbitPos(aOrbit);
  float a = aOrbit.x;
  // Tidal stretching towards an intruder (xy: position in galaxy plane, z: strength)
  if (uTidal.z > 0.0){
    vec2 d = uTidal.xy - p.xz;
    float dl = max(length(d), 1.0);
    float k = uTidal.z * a * a / (1.0 + dl / uR);
    p.xz += d / dl * k * uR * 0.8;
    p.y += sin(aOrbit.y * 3.0) * k * uR * 0.15;
  }
  vec3 w = uOrient * p + uCenter;
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  float young = step(1.5, aOrbit.w) * step(aOrbit.w, 2.5);
  float s = aSize * uSizeMul * (young > 0.5 ? mix(0.5, 1.0, uYoung) : 1.0);
  gl_PointSize = clamp(s * uPx * 900.0 / max(-mv.z, 1.0), 0.8, 90.0);
  vColor = aColor * uBright * (young > 0.5 ? mix(0.3, 1.2, uYoung) : 1.0);
  vAlpha = uFade;
}
`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
uniform float uDark;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 5.0) * vAlpha;
  if (uDark > 0.5) gl_FragColor = vec4(vColor * a, a * 0.55);
  else gl_FragColor = vec4(vColor * a, 0.0);
}
`;

/** A whole spiral galaxy on the GPU. Stars follow nested, rotated orbits (density-wave arms). */
export class GalaxyField extends THREE.Group {
  stars: THREE.Points;
  dust: THREE.Points;
  starMat: THREE.ShaderMaterial;
  dustMat: THREE.ShaderMaterial;
  params: GalaxyParams;
  /** orbit params of some young stars, for placing HII regions / events in JS */
  samples: Float32Array;

  constructor(p: GalaxyParams, rng: Rng) {
    super();
    this.params = p;
    const n = p.count;
    const orbit = new Float32Array(n * 4);
    const color = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const hue = (c: number[], shift: number) => [c[0] * (1 - shift * 0.2), c[1], c[2] * (1 + shift * 0.2)];
    for (let i = 0; i < n; i++) {
      const u = rng.next();
      let a: number;
      let kind: number;
      let c: number[];
      let s: number;
      if (u < p.bulge) {
        a = Math.abs(rng.gauss(0, 0.07));
        kind = 0;
        c = rng.pick([[1, 0.82, 0.55], [1, 0.72, 0.45], [1, 0.9, 0.7]]);
        s = rng.range(0.6, 1.4);
      } else if (u < p.bulge + 0.12) {
        a = 0.1 + Math.pow(rng.next(), 0.8) * 0.85;
        kind = 2;
        c = rng.pick([[0.55, 0.7, 1], [0.7, 0.8, 1], [1, 0.55, 0.8]]);
        s = rng.range(1.2, 2.6);
      } else if (u < p.bulge + 0.16) {
        a = 0.08 + Math.pow(rng.next(), 0.9) * 0.8;
        kind = 4; // gas glow
        c = rng.pick([[0.35, 0.45, 1], [0.9, 0.35, 0.6]]);
        s = rng.range(6, 12);
      } else {
        // exponential disk
        a = Math.min(1.1, -Math.log(1 - rng.next() * 0.985) * 0.24 + 0.02);
        kind = 1;
        c = rng.pick([[1, 0.95, 0.85], [0.95, 0.9, 1], [1, 0.85, 0.65], [0.85, 0.9, 1]]);
        s = rng.range(0.5, 1.2);
      }
      const cc = hue(c, p.hueShift);
      const br = kind === 4 ? 0.12 : kind === 0 ? 0.55 : kind === 2 ? 0.9 : 0.45;
      orbit[i * 4] = a;
      orbit[i * 4 + 1] = rng.range(0, Math.PI * 2);
      orbit[i * 4 + 2] = rng.gauss(0, 0.5);
      orbit[i * 4 + 3] = kind;
      color[i * 3] = cc[0] * br;
      color[i * 3 + 1] = cc[1] * br;
      color[i * 3 + 2] = cc[2] * br;
      size[i] = s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 4));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const uniforms = () => ({
      uTime: { value: 0 },
      uArms: { value: p.arms },
      uTwist: { value: p.twist },
      uEcc: { value: p.ecc },
      uPattern: { value: p.pattern },
      uR: { value: p.radius },
      uVel: { value: p.vel },
      uPx: { value: 1 },
      uBright: { value: 1 },
      uYoung: { value: 1 },
      uSizeMul: { value: 1 },
      uCenter: { value: new THREE.Vector3() },
      uTidal: { value: new THREE.Vector4() },
      uOrient: { value: new THREE.Matrix3() },
      uFade: { value: 1 },
      uDark: { value: 0 },
    });
    this.starMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: uniforms(), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 3;

    // Dust lanes: a darker, absorbing population trailing the arms.
    const dn = Math.floor(n * 0.08);
    const dOrbit = new Float32Array(dn * 4);
    const dColor = new Float32Array(dn * 3);
    const dSize = new Float32Array(dn);
    for (let i = 0; i < dn; i++) {
      dOrbit[i * 4] = 0.12 + Math.pow(rng.next(), 0.9) * 0.7;
      dOrbit[i * 4 + 1] = rng.range(0, Math.PI * 2);
      dOrbit[i * 4 + 2] = rng.gauss(0, 0.2);
      dOrbit[i * 4 + 3] = 3;
      dColor[i * 3] = 0.05;
      dColor[i * 3 + 1] = 0.03;
      dColor[i * 3 + 2] = 0.02;
      dSize[i] = rng.range(4, 9);
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dn * 3), 3));
    dgeo.setAttribute('aOrbit', new THREE.BufferAttribute(dOrbit, 4));
    dgeo.setAttribute('aColor', new THREE.BufferAttribute(dColor, 3));
    dgeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
    this.dustMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: uniforms(), transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    this.dustMat.uniforms.uDark.value = 1;
    this.dust = new THREE.Points(dgeo, this.dustMat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 4;
    this.add(this.dust, this.stars);

    // Samples for JS-side placement (young population)
    this.samples = new Float32Array(400 * 4);
    for (let i = 0; i < 400; i++) {
      this.samples[i * 4] = 0.15 + rng.next() * 0.7;
      this.samples[i * 4 + 1] = rng.range(0, Math.PI * 2);
      this.samples[i * 4 + 2] = rng.gauss(0, 0.3);
      this.samples[i * 4 + 3] = 2;
    }
  }

  /** CPU mirror of the vertex shader orbit, for gameplay objects riding the galaxy. */
  orbitPos(a: number, th0: number, height: number, time: number, out = new THREE.Vector3()) {
    const p = this.params;
    const rr = a * p.radius;
    const omega = p.vel / (rr + p.radius * 0.06);
    const th = th0 + time * omega;
    const phi = Math.log(a + 0.03) * p.twist + time * p.pattern;
    const e = p.ecc * Math.min(1, Math.max(0, (a - 0.06) / 0.24));
    const r = rr * (1 + e * Math.cos(p.arms * (th - phi)));
    const thick = 0.035 * p.radius * 0.55;
    out.set(Math.cos(th) * r, height * thick, Math.sin(th) * r);
    return out.applyMatrix3(this.orient).add(this.center);
  }

  center = new THREE.Vector3();
  orient = new THREE.Matrix3();

  update(time: number, pixelRatio: number) {
    for (const m of [this.starMat, this.dustMat]) {
      const u = m.uniforms;
      u.uTime.value = time;
      u.uPx.value = pixelRatio;
      u.uCenter.value.copy(this.center);
      u.uOrient.value.copy(this.orient);
    }
  }

  set brightness(v: number) {
    this.starMat.uniforms.uBright.value = v;
  }
  set young(v: number) {
    this.starMat.uniforms.uYoung.value = v;
  }
  set fade(v: number) {
    this.starMat.uniforms.uFade.value = v;
    this.dustMat.uniforms.uFade.value = v;
  }
  setTidal(x: number, z: number, strength: number) {
    this.starMat.uniforms.uTidal.value.set(x, z, strength, 0);
    this.dustMat.uniforms.uTidal.value.set(x, z, strength, 0);
  }
  set sizeMul(v: number) {
    this.starMat.uniforms.uSizeMul.value = v;
    this.dustMat.uniforms.uSizeMul.value = v;
  }

  dispose() {
    this.stars.geometry.dispose();
    this.dust.geometry.dispose();
    this.starMat.dispose();
    this.dustMat.dispose();
  }
}
