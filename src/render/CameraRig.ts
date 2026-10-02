import * as THREE from 'three';
import { damp, clamp, easeInOut } from '../utils/math';

interface RigTween {
  from: RigState;
  to: Partial<RigState>;
  t: number;
  dur: number;
  ease: (t: number) => number;
  done?: () => void;
}

export interface RigState {
  distance: number;
  pitch: number; // radians above the plane
  yaw: number;
  fov: number;
}

/**
 * Cinematic camera rig: smooth follow, orbit, zoom, trauma-based shake and scripted tweens.
 * Everything is damped so the camera never snaps without a reason.
 */
export class CameraRig {
  camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  focus = new THREE.Vector3(); // smoothed target
  state: RigState = { distance: 60, pitch: 0.95, yaw: 0, fov: 50 };
  followLambda = 3.5;
  zoomBias = 1; // player wheel zoom multiplier
  minZoom = 0.6;
  maxZoom = 1.8;
  trauma = 0;
  private tween: RigTween | null = null;
  private shakeT = 0;
  autoOrbit = 0; // radians/sec slow cinematic orbit
  offset = new THREE.Vector3(); // extra cinematic offset

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 5000);
  }

  setImmediate(s: Partial<RigState>, target?: THREE.Vector3) {
    Object.assign(this.state, s);
    this.tween = null;
    if (target) {
      this.target.copy(target);
      this.focus.copy(target);
    }
  }

  animate(to: Partial<RigState>, dur: number, ease = easeInOut): Promise<void> {
    return new Promise((resolve) => {
      this.tween?.done?.();
      this.tween = { from: { ...this.state }, to, t: 0, dur: Math.max(0.001, dur), ease, done: resolve };
    });
  }

  addTrauma(v: number) {
    this.trauma = clamp(this.trauma + v, 0, 1);
  }

  applyWheel(steps: number) {
    if (!steps) return;
    this.zoomBias = clamp(this.zoomBias * Math.pow(1.1, steps), this.minZoom, this.maxZoom);
  }

  update(dt: number) {
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = tw.ease(clamp(tw.t / tw.dur));
      for (const key of Object.keys(tw.to) as (keyof RigState)[]) {
        const a = tw.from[key];
        const b = tw.to[key]!;
        // distance interpolates in log space so huge zooms feel linear.
        this.state[key] = key === 'distance' ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * k) : a + (b - a) * k;
      }
      if (tw.t >= tw.dur) {
        this.tween = null;
        tw.done?.();
      }
    }
    this.state.yaw += this.autoOrbit * dt;
    this.focus.x = damp(this.focus.x, this.target.x, this.followLambda, dt);
    this.focus.y = damp(this.focus.y, this.target.y, this.followLambda, dt);
    this.focus.z = damp(this.focus.z, this.target.z, this.followLambda, dt);

    const d = this.state.distance * this.zoomBias;
    const cp = Math.cos(this.state.pitch);
    const pos = new THREE.Vector3(
      this.focus.x + Math.sin(this.state.yaw) * cp * d,
      this.focus.y + Math.sin(this.state.pitch) * d,
      this.focus.z + Math.cos(this.state.yaw) * cp * d,
    ).add(this.offset);

    // Trauma shake (squared for nicer falloff).
    this.shakeT += dt;
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    const s = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(this.shakeT * f + o) * 0.6 + Math.sin(this.shakeT * f * 2.37 + o * 3.1) * 0.4;
    const amp = s * d * 0.025;
    pos.x += n(23, 1) * amp;
    pos.y += n(19, 2) * amp;
    pos.z += n(29, 3) * amp;

    this.camera.position.copy(pos);
    this.camera.lookAt(this.focus.x + this.offset.x, this.focus.y + this.offset.y, this.focus.z + this.offset.z);
    this.camera.rotateZ(n(11, 5) * s * 0.03);
    if (Math.abs(this.camera.fov - this.state.fov) > 0.01) {
      this.camera.fov = this.state.fov;
    }
    this.camera.near = Math.max(0.01, d * 0.01);
    this.camera.far = d * 400;
    this.camera.updateProjectionMatrix();
  }

  get effectiveDistance() {
    return this.state.distance * this.zoomBias;
  }
}
