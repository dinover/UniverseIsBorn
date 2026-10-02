import * as THREE from 'three';

export type SpriteStyle = 'glow' | 'soft' | 'star' | 'dark';

const vert = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iColor;
attribute float iSize;
uniform float uStretch;
uniform float uMaxStretch;
uniform float uSizeScale;
varying vec2 vUv;
varying vec4 vColor;
varying float vStretch;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 v2 = (modelViewMatrix * vec4(iVel, 0.0)).xy;
  float sp = length(v2);
  vec2 dir = sp > 1e-6 ? v2 / sp : vec2(1.0, 0.0);
  float st = 1.0 + min(sp * uStretch / max(iSize, 1e-4), uMaxStretch);
  vec2 perp = vec2(-dir.y, dir.x);
  float s = iSize * uSizeScale;
  mv.xy += dir * position.x * s * st + perp * position.y * s;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy;
  vColor = iColor;
  vStretch = st;
}
`;

const fragGlow = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main(){
  float d2 = dot(vUv, vUv);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 4.5) + exp(-d2 * 40.0) * 0.8;
  gl_FragColor = vec4(vColor.rgb * a * vColor.a, 0.0);
}
`;

const fragSoft = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main(){
  float d2 = dot(vUv, vUv);
  if (d2 > 1.0) discard;
  float a = (1.0 - d2);
  a = a * a * vColor.a;
  gl_FragColor = vec4(vColor.rgb * a, a * 0.85);
}
`;

const fragDark = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main(){
  float d2 = dot(vUv, vUv);
  if (d2 > 1.0) discard;
  float a = (1.0 - d2);
  a = a * a * vColor.a;
  gl_FragColor = vec4(vColor.rgb * a, a);
}
`;

const fragStar = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main(){
  vec2 p = vUv;
  float d2 = dot(p, p);
  if (d2 > 1.0) discard;
  float core = exp(-d2 * 90.0) * 2.5;
  float halo = exp(-d2 * 9.0) * 0.55;
  float spikes = (exp(-abs(p.x) * 60.0) + exp(-abs(p.y) * 60.0)) * (1.0 - sqrt(d2)) * 0.6;
  vec3 c = vColor.rgb * (halo + spikes) + mix(vColor.rgb, vec3(1.0), 0.6) * core;
  gl_FragColor = vec4(c * vColor.a, 0.0);
}
`;

/**
 * Immediate-mode instanced billboard renderer. Each frame: begin(), push() sprites, end().
 * Sprites are stretched along their screen-space velocity, which gives motion trails and
 * makes gravity visible without any extra geometry. One draw call per batch.
 */
export class SpriteBatch {
  mesh: THREE.Mesh;
  count = 0;
  capacity: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;

  constructor(capacity: number, style: SpriteStyle = 'glow', opts: { stretch?: number; maxStretch?: number } = {}) {
    this.capacity = capacity;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    const mk = (arr: Float32Array, n: number) => {
      const a = new THREE.InstancedBufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute('iPos', mk(this.pos, 3));
    geo.setAttribute('iVel', mk(this.vel, 3));
    geo.setAttribute('iColor', mk(this.col, 4));
    geo.setAttribute('iSize', mk(this.size, 1));
    geo.instanceCount = 0;
    this.geo = geo;
    const frag = style === 'glow' ? fragGlow : style === 'soft' ? fragSoft : style === 'dark' ? fragDark : fragStar;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uStretch: { value: opts.stretch ?? 0.12 },
        uMaxStretch: { value: opts.maxStretch ?? 6 },
        uSizeScale: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: style === 'dark',
      blending:
        style === 'dark'
          ? THREE.CustomBlending
          : style === 'soft'
            ? THREE.CustomBlending
            : THREE.AdditiveBlending,
    });
    if (style === 'dark') {
      // Absorbing dust: dst * (1 - a) + src * a
      this.material.blendSrc = THREE.OneFactor;
      this.material.blendDst = THREE.OneMinusSrcAlphaFactor;
    } else if (style === 'soft') {
      // Premultiplied, partially additive gas (glows but also occludes a bit).
      this.material.blendSrc = THREE.OneFactor;
      this.material.blendDst = THREE.OneMinusSrcAlphaFactor;
    }
    this.material.premultipliedAlpha = true;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  set stretch(v: number) {
    this.material.uniforms.uStretch.value = v;
  }
  set sizeScale(v: number) {
    this.material.uniforms.uSizeScale.value = v;
  }

  begin() {
    this.count = 0;
  }

  push(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, a: number, size: number): boolean {
    const i = this.count;
    if (i >= this.capacity) return false;
    const i3 = i * 3;
    const i4 = i * 4;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.col[i4] = r;
    this.col[i4 + 1] = g;
    this.col[i4 + 2] = b;
    this.col[i4 + 3] = a;
    this.size[i] = size;
    this.count++;
    return true;
  }

  end() {
    const g = this.geo;
    g.instanceCount = this.count;
    for (const name of ['iPos', 'iVel', 'iColor', 'iSize']) {
      const attr = g.getAttribute(name) as THREE.InstancedBufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.count * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}
