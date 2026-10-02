import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const MAX_SHOCKS = 4;

const frag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uChroma;
uniform float uVignette;
uniform float uGrain;
uniform float uAspect;
uniform vec4 uShocks[${MAX_SHOCKS}];
uniform vec4 uGW; // center.xy, phase, amplitude
uniform float uLetterbox;
uniform float uSat;
uniform float uPulse;
uniform float uFade;
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 uv = vUv;
  float ringGlow = 0.0;
  for (int i = 0; i < ${MAX_SHOCKS}; i++){
    vec4 s = uShocks[i];
    if (s.w <= 0.0) continue;
    vec2 d = (uv - s.xy) * vec2(uAspect, 1.0);
    float r = length(d);
    float w = 0.02 + s.z * 0.12;
    float k = (r - s.z) / w;
    float ring = exp(-k * k);
    uv -= (d / max(r, 1e-4)) / vec2(uAspect, 1.0) * ring * s.w * 0.035;
    ringGlow += ring * s.w;
  }
  if (uGW.w > 0.0){
    vec2 d = (uv - uGW.xy) * vec2(uAspect, 1.0);
    float r = length(d);
    float wave = sin(r * 60.0 - uGW.z) * exp(-r * 2.0);
    uv += (d / max(r, 1e-4)) / vec2(uAspect, 1.0) * wave * uGW.w * 0.006;
  }
  // Barrel pulse (used when the core throbs)
  vec2 cc = uv - 0.5;
  uv = 0.5 + cc * (1.0 - uPulse * 0.03 * dot(cc, cc) * 4.0);

  vec3 col;
  if (uChroma > 0.0){
    vec2 off = (uv - 0.5) * uChroma * 0.012;
    col.r = texture2D(tDiffuse, uv + off).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - off).b;
  } else col = texture2D(tDiffuse, uv).rgb;

  col += vec3(0.8, 0.9, 1.0) * ringGlow * 0.25;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);

  vec2 vv = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(1.25, 0.25, length(vv) * (0.9 + uVignette));
  col *= mix(1.0, vig, 0.85);
  col = mix(col, uFlashColor * 4.0, clamp(uFlash, 0.0, 1.0));
  if (uGrain > 0.0) col += (hash(vUv * 1000.0 + fract(uTime * 7.3)) - 0.5) * uGrain;
  // Letterbox bars for cinematics
  float bar = uLetterbox * 0.11;
  if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Shock {
  pos: THREE.Vector3;
  t: number;
  dur: number;
  strength: number;
  maxR: number;
}

export class FinalPass extends ShaderPass {
  flash = 0;
  flashColor = new THREE.Color(1, 1, 1);
  chroma = 0;
  baseChroma = 0.25;
  vignette = 0.2;
  grain = 0.03;
  letterbox = 0;
  letterboxTarget = 0;
  saturation = 1.05;
  pulse = 0;
  fade = 0;
  gw = { pos: new THREE.Vector3(), amp: 0, phase: 0 };
  private shocks: Shock[] = [];

  constructor() {
    super({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uChroma: { value: 0.3 },
        uVignette: { value: 0.2 },
        uGrain: { value: 0.03 },
        uAspect: { value: 1 },
        uShocks: { value: Array.from({ length: MAX_SHOCKS }, () => new THREE.Vector4()) },
        uGW: { value: new THREE.Vector4() },
        uLetterbox: { value: 0 },
        uSat: { value: 1 },
        uPulse: { value: 0 },
        uFade: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: frag,
    });
  }

  shockwave(pos: THREE.Vector3, strength = 1, dur = 1.6, maxR = 1.2) {
    if (this.shocks.length >= MAX_SHOCKS) this.shocks.shift();
    this.shocks.push({ pos: pos.clone(), t: 0, dur, strength, maxR });
  }

  doFlash(amount: number, color?: THREE.ColorRepresentation) {
    this.flash = Math.max(this.flash, amount);
    this.flashColor.set(color ?? 0xffffff);
  }

  update(dt: number, time: number, camera: THREE.PerspectiveCamera, chromaEnabled: boolean, grainEnabled: boolean) {
    const u = this.uniforms as any;
    u.uTime.value = time;
    this.flash = Math.max(0, this.flash - dt * 0.7);
    u.uFlash.value = this.flash * this.flash;
    u.uFlashColor.value.copy(this.flashColor);
    this.letterbox += (this.letterboxTarget - this.letterbox) * Math.min(1, dt * 3);
    u.uLetterbox.value = this.letterbox;
    u.uChroma.value = chromaEnabled ? this.baseChroma + this.chroma : this.chroma * 0.5;
    u.uVignette.value = this.vignette;
    u.uGrain.value = grainEnabled ? this.grain : 0;
    u.uAspect.value = camera.aspect;
    u.uSat.value = this.saturation;
    u.uPulse.value = this.pulse;
    u.uFade.value = this.fade;

    const v = new THREE.Vector3();
    for (let i = 0; i < MAX_SHOCKS; i++) {
      const s = this.shocks[i];
      const out = u.uShocks.value[i] as THREE.Vector4;
      if (!s) {
        out.set(0, 0, 0, 0);
        continue;
      }
      s.t += dt;
      const k = s.t / s.dur;
      v.copy(s.pos).project(camera);
      out.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, Math.pow(k, 0.6) * s.maxR, s.strength * Math.max(0, 1 - k) * (v.z < 1 ? 1 : 0));
    }
    this.shocks = this.shocks.filter((s) => s.t < s.dur);

    if (this.gw.amp > 0.001) {
      v.copy(this.gw.pos).project(camera);
      u.uGW.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, this.gw.phase, this.gw.amp);
    } else u.uGW.value.set(0, 0, 0, 0);
  }
}
