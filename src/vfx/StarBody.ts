import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';

const surfVert = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uBoil;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewDir;
${NOISE_GLSL}
void main(){
  vObj = normalize(position);
  float disp = snoise(vObj * 3.0 + uTime * 0.3) * uBoil * 0.04 + uPulse * 0.06;
  vec3 p = position * (1.0 + disp);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const surfFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uGran;
uniform float uIntensity;
uniform float uSpots;
uniform float uBoil;
uniform float uCore;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewDir;
${NOISE_GLSL}
void main(){
  vec3 p = vObj;
  float t = uTime;
  vec3 warp = vec3(snoise(p * 1.5 + t * 0.05), snoise(p * 1.5 + 13.0 - t * 0.04), snoise(p * 1.5 + 27.0)) * 0.25 * (0.6 + uBoil);
  float cells = ridged(p * uGran + warp * 2.0 + vec3(0.0, t * 0.08, t * 0.05));
  float fine = fbm3(p * uGran * 3.0 + vec3(t * 0.3));
  float g = clamp(cells * 0.9 + fine * 0.35, 0.0, 1.4);
  float spots = smoothstep(0.35, 0.65, snoise(p * 2.2 + vec3(t * 0.02))) * uSpots;
  float mu = clamp(dot(vNormalV, vViewDir), 0.0, 1.0);
  float limb = 0.35 + 0.65 * pow(mu, 0.55);
  vec3 col = mix(uColor, uHot, smoothstep(0.55, 1.1, g));
  col *= (0.3 + 0.65 * g) * (1.0 - spots * 0.75) * limb;
  float rim = pow(1.0 - mu, 2.5);
  col += uColor * rim * 0.6;
  col += uHot * uCore * pow(mu, 6.0) * 0.8;
  gl_FragColor = vec4(col * uIntensity * 0.62, 1.0);
}
`;

const coronaFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uRays;
uniform float uInner;
varying vec2 vUv;
${NOISE_GLSL}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float ang = atan(p.y, p.x);
  float rr = r / uInner;
  float fall = exp(-max(rr - 1.0, 0.0) * 3.2);
  float halo = exp(-(rr - 1.0) * 1.1) * 0.35;
  float ray = fbm3(vec3(cos(ang) * 3.0, sin(ang) * 3.0, rr * 1.5 - uTime * 0.25));
  ray = smoothstep(-0.1, 0.8, ray) * uRays;
  float inner = smoothstep(0.82, 1.04, rr);
  float a = (fall * (0.7 + ray * 1.6) + halo * (0.6 + ray)) * inner * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(uColor * a * uIntensity, 0.0);
}
`;

export interface StarLook {
  color: THREE.Color;
  hot: THREE.Color;
  granulation: number;
  intensity: number;
  spots: number;
  boil: number;
  rays: number;
  coronaScale: number;
  core: number;
}

export const lookLerp = (a: StarLook, b: StarLook, t: number): StarLook => ({
  color: a.color.clone().lerp(b.color, t),
  hot: a.hot.clone().lerp(b.hot, t),
  granulation: a.granulation + (b.granulation - a.granulation) * t,
  intensity: a.intensity + (b.intensity - a.intensity) * t,
  spots: a.spots + (b.spots - a.spots) * t,
  boil: a.boil + (b.boil - a.boil) * t,
  rays: a.rays + (b.rays - a.rays) * t,
  coronaScale: a.coronaScale + (b.coronaScale - a.coronaScale) * t,
  core: a.core + (b.core - a.core) * t,
});

/** A living star: boiling plasma surface with granulation, limb darkening, spots and a rayed corona. */
export class StarBody extends THREE.Group {
  surface: THREE.Mesh;
  corona: THREE.Mesh;
  private sMat: THREE.ShaderMaterial;
  private cMat: THREE.ShaderMaterial;
  radius = 1;
  pulse = 0;

  constructor(look: StarLook) {
    super();
    this.sMat = new THREE.ShaderMaterial({
      vertexShader: surfVert,
      fragmentShader: surfFrag,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: look.color.clone() },
        uHot: { value: look.hot.clone() },
        uGran: { value: look.granulation },
        uIntensity: { value: look.intensity },
        uSpots: { value: look.spots },
        uBoil: { value: look.boil },
        uPulse: { value: 0 },
        uCore: { value: 0 },
      },
    });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this.sMat);
    this.add(this.surface);
    this.cMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: coronaFrag,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: look.color.clone() },
        uIntensity: { value: 1 },
        uRays: { value: look.rays },
        uInner: { value: 0.3 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
    });
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.cMat);
    this.corona.renderOrder = 5;
    this.add(this.corona);
    this.setLook(look);
  }

  setLook(l: StarLook) {
    const u = this.sMat.uniforms;
    (u.uColor.value as THREE.Color).copy(l.color);
    (u.uHot.value as THREE.Color).copy(l.hot);
    u.uGran.value = l.granulation;
    u.uIntensity.value = l.intensity;
    u.uSpots.value = l.spots;
    u.uBoil.value = l.boil;
    u.uCore.value = l.core;
    const c = this.cMat.uniforms;
    (c.uColor.value as THREE.Color).copy(l.color).lerp(l.hot, 0.3);
    c.uRays.value = l.rays;
    c.uIntensity.value = l.intensity * 0.9;
    const cs = l.coronaScale;
    this.corona.scale.setScalar(cs);
    c.uInner.value = 1 / cs;
  }

  setRadius(r: number) {
    this.radius = r;
    this.scale.setScalar(r);
  }

  update(time: number, camera: THREE.Camera) {
    this.sMat.uniforms.uTime.value = time;
    this.sMat.uniforms.uPulse.value = this.pulse;
    this.cMat.uniforms.uTime.value = time;
    this.corona.quaternion.copy(camera.quaternion);
    // Undo parent rotation so the billboard truly faces the camera.
    const pq = new THREE.Quaternion();
    this.getWorldQuaternion(pq);
    this.corona.quaternion.premultiply(pq.invert());
  }

  dispose() {
    this.surface.geometry.dispose();
    this.sMat.dispose();
    this.corona.geometry.dispose();
    this.cMat.dispose();
  }
}
