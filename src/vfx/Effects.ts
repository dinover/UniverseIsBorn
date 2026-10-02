import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { SpriteBatch } from './SpriteBatch';

const ringFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uRadius;
uniform float uWidth;
uniform float uOpacity;
uniform float uDash;
uniform float uTime;
uniform float uFill;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float k = (r - uRadius) / uWidth;
  float a = exp(-k * k);
  if (uDash > 0.0){
    float ang = atan(p.y, p.x);
    a *= smoothstep(0.0, 0.3, sin(ang * uDash + uTime * 1.5));
  }
  a += uFill * smoothstep(uRadius, 0.0, r) * 0.25;
  gl_FragColor = vec4(uColor * a * uOpacity, 0.0);
}
`;

/** Glowing ring (planar on the gameplay plane or camera-facing). Used for UI-in-world and shock rings. */
export class Ring extends THREE.Mesh {
  mat: THREE.ShaderMaterial;
  billboard: boolean;
  constructor(color: THREE.ColorRepresentation, billboard = false, width = 0.02) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: ringFrag,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uRadius: { value: 0.9 },
        uWidth: { value: width },
        uOpacity: { value: 1 },
        uDash: { value: 0 },
        uTime: { value: 0 },
        uFill: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
    });
    super(new THREE.PlaneGeometry(2, 2), mat);
    this.mat = mat;
    this.billboard = billboard;
    if (!billboard) this.rotation.x = -Math.PI / 2;
    this.renderOrder = 10;
    this.frustumCulled = false;
  }
  /** World radius of the ring line. */
  setWorldRadius(r: number) {
    this.scale.setScalar(r / this.mat.uniforms.uRadius.value);
  }
  set opacity(v: number) {
    this.mat.uniforms.uOpacity.value = v;
    this.visible = v > 0.001;
  }
  get opacity() {
    return this.mat.uniforms.uOpacity.value;
  }
  setColor(c: THREE.ColorRepresentation) {
    (this.mat.uniforms.uColor.value as THREE.Color).set(c);
  }
  tick(time: number, camera: THREE.Camera) {
    this.mat.uniforms.uTime.value = time;
    if (this.billboard) this.quaternion.copy(camera.quaternion);
  }
}

const jetVert = /* glsl */ `
uniform vec3 uStart;
uniform vec3 uDir;
uniform float uLength;
uniform float uWidth;
uniform vec3 uCam;
varying vec2 vUv;
void main(){
  float x = position.x;
  vec3 along = uStart + uDir * x * uLength;
  vec3 side = normalize(cross(uDir, uCam - along));
  float w = uWidth * (0.25 + 0.75 * pow(x, 0.6)) * (1.0 + 0.6 * x);
  vec3 p = along + side * position.y * w;
  vUv = vec2(x, position.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const jetFrag = /* glsl */ `
uniform float uTime;
uniform float uPower;
uniform vec3 uColA;
uniform vec3 uColB;
varying vec2 vUv;
${NOISE_GLSL}
void main(){
  float x = vUv.x;
  float y = vUv.y;
  float n = fbm3(vec3(x * 7.0 - uTime * 4.0, y * 2.0, uTime * 0.5));
  float knots = 0.6 + 0.4 * sin(x * 40.0 - uTime * 18.0);
  float core = exp(-y * y * 30.0) * (1.4 + knots * 0.6);
  float sheath = exp(-y * y * 3.0) * (0.35 + 0.65 * smoothstep(-0.3, 0.6, n));
  float fadeEnd = smoothstep(1.0, 0.7, x) * smoothstep(0.0, 0.03, x);
  vec3 col = uColA * core + uColB * sheath;
  gl_FragColor = vec4(col * fadeEnd * uPower, 0.0);
}
`;

/** Relativistic jet: cylindrical billboard with scrolling plasma, knots and a hot spine. */
export class JetBeam extends THREE.Mesh {
  mat: THREE.ShaderMaterial;
  constructor(colA = 0xbfe6ff, colB = 0x6a7dff) {
    const geo = new THREE.PlaneGeometry(1, 2, 48, 1);
    geo.translate(0.5, 0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: jetVert,
      fragmentShader: jetFrag,
      uniforms: {
        uStart: { value: new THREE.Vector3() },
        uDir: { value: new THREE.Vector3(1, 0, 0) },
        uLength: { value: 10 },
        uWidth: { value: 1 },
        uCam: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uPower: { value: 1 },
        uColA: { value: new THREE.Color(colA) },
        uColB: { value: new THREE.Color(colB) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
    });
    super(geo, mat);
    this.mat = mat;
    this.frustumCulled = false;
    this.renderOrder = 8;
  }
  set(start: THREE.Vector3, dir: THREE.Vector3, length: number, width: number, power: number, time: number, cam: THREE.Vector3) {
    const u = this.mat.uniforms;
    u.uStart.value.copy(start);
    u.uDir.value.copy(dir).normalize();
    u.uLength.value = length;
    u.uWidth.value = width;
    u.uPower.value = power;
    u.uTime.value = time;
    u.uCam.value.copy(cam);
    this.visible = power > 0.01;
  }
}

/**
 * Parallax dust motes around the camera focus. They wrap around a box that scales with
 * the current world scale, giving a constant sense of motion and depth at any zoom.
 */
export class Motes {
  batch: SpriteBatch;
  private pts: Float32Array;
  private n: number;
  color = new THREE.Color(0.6, 0.7, 1.0);
  alpha = 0.5;

  constructor(n: number) {
    this.n = n;
    this.batch = new SpriteBatch(n, 'glow', { stretch: 0.0 });
    this.pts = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      this.pts[i * 4] = Math.random();
      this.pts[i * 4 + 1] = Math.random();
      this.pts[i * 4 + 2] = Math.random();
      this.pts[i * 4 + 3] = Math.random();
    }
  }

  update(center: THREE.Vector3, scale: number, time: number) {
    const b = this.batch;
    b.begin();
    const box = scale * 6;
    const half = box / 2;
    const c = this.color;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      const wrap = (u: number, cc: number) => {
        const v = u * box - cc;
        return ((v % box) + box) % box - half + cc;
      };
      const x = wrap(this.pts[o], center.x);
      const z = wrap(this.pts[o + 2], center.z);
      const y = (this.pts[o + 1] - 0.5) * scale * 2.5 - scale * 0.6 + center.y;
      const tw = 0.6 + 0.4 * Math.sin(time * (0.5 + this.pts[o + 3]) + i);
      const dx = x - center.x;
      const dz = z - center.z;
      const edge = 1 - Math.min(1, Math.sqrt(dx * dx + dz * dz) / half);
      b.push(x, y, z, 0, 0, 0, c.r, c.g, c.b, this.alpha * tw * edge, scale * (0.006 + this.pts[o + 3] * 0.012));
    }
    b.end();
  }
}
