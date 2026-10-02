import * as THREE from 'three';
import { Phase } from '../Phase';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { SKY_PRESETS } from '../../vfx/Sky';

/** Attract-mode backdrop for the title screen: a slowly orbiting, fully lensed black hole. */
export class TitlePhase extends Phase {
  id = 'primordial' as const;
  private dust!: SpriteBatch;
  private parts: Float32Array = new Float32Array(0);
  private n = 0;

  enter() {
    const g = this.game;
    g.sky.set(SKY_PRESETS.blackhole, 0);
    const bh = g.pipe.bhPass;
    bh.primaryActive = true;
    bh.bhPos.set(0, 0, 0);
    bh.rs = 1;
    bh.diskIntensity = 1;
    bh.diskHeat = 0.72;
    bh.diskInner = 3;
    bh.diskOuter = 13;
    bh.flow = 1;
    bh.diskNormal.set(0.08, 1, 0.12).normalize();
    g.rig.setImmediate({ distance: 34, pitch: 0.1, yaw: 0.6, fov: 42 }, new THREE.Vector3(-4.5, 0, 0));
    g.rig.autoOrbit = 0.025;
    g.motes.alpha = 0.25;

    this.n = Math.floor(2500 * g.quality.profile.particles) + 400;
    this.dust = this.track(new SpriteBatch(this.n, 'glow', { stretch: 0.05 }));
    this.group.add(this.dust.mesh);
    this.parts = new Float32Array(this.n * 4);
    for (let i = 0; i < this.n; i++) {
      const r = 14 + Math.pow(Math.random(), 1.5) * 45;
      this.parts[i * 4] = r;
      this.parts[i * 4 + 1] = Math.random() * Math.PI * 2;
      this.parts[i * 4 + 2] = (Math.random() - 0.5) * r * 0.08;
      this.parts[i * 4 + 3] = Math.random();
    }
  }

  update(dt: number) {
    const b = this.dust;
    b.begin();
    const n = this.game.pipe.bhPass.diskNormal;
    const e1 = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 0, 1)).normalize();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      const r = this.parts[o];
      const w = 2.2 * Math.pow(r, -1.5);
      this.parts[o + 1] += w * dt;
      const a = this.parts[o + 1];
      const c = Math.cos(a);
      const s = Math.sin(a);
      const h = this.parts[o + 2];
      const x = e1.x * c * r + e2.x * s * r + n.x * h;
      const y = e1.y * c * r + e2.y * s * r + n.y * h;
      const z = e1.z * c * r + e2.z * s * r + n.z * h;
      const v = w * r;
      const vx = (-e1.x * s + e2.x * c) * v;
      const vy = (-e1.y * s + e2.y * c) * v;
      const vz = (-e1.z * s + e2.z * c) * v;
      const heat = Math.min(1, 16 / r);
      const k = this.parts[o + 3];
      b.push(x, y, z, vx, vy, vz, 1.0 * heat + 0.3, 0.55 * heat + 0.25 * k, 0.3 + 0.5 * k * (1 - heat), 0.35 + heat * 0.5, 0.12 + k * 0.2);
    }
    b.end();
  }
}
