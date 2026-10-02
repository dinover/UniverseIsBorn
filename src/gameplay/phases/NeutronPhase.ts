import * as THREE from 'three';
import { Phase } from '../Phase';
import { SpriteBatch } from '../../vfx/SpriteBatch';
import { JetBeam, Ring } from '../../vfx/Effects';
import { StarBody } from '../../vfx/StarBody';
import { SKY_PRESETS } from '../../vfx/Sky';
import { clamp, damp, easeOutCubic } from '../../utils/math';
import { TOV_LIMIT } from './SupernovaPhase';
import { num, tr } from '../../i18n/i18n';

/**
 * Branch — Neutron star. Too light to be a black hole... yet. Siphon matter from a companion
 * star (Roche-lobe overflow) until you exceed the TOV limit and collapse.
 */
export class NeutronPhase extends Phase {
  id = 'neutron' as const;
  private companion!: StarBody;
  private P = new THREE.Vector3(-34, 0, 10);
  private vel = new THREE.Vector2();
  private mass = 1.8;
  private start = 1.8;
  private glow!: SpriteBatch;
  private stream!: SpriteBatch;
  private beams: JetBeam[] = [];
  private band!: Ring;
  private bandInner!: Ring;
  private flow: { t: number; seed: number }[] = [];
  private rate = 0;
  private done = false;
  private collapse = 0;
  private blobs: { x: number; z: number; vx: number; vz: number; alive: boolean }[] = [];
  private blobT = 6;

  touchLabels(): [string | null, string | null] {
    return [null, null];
  }

  enter() {
    const g = this.game;
    g.hud.show(true);
    g.setStage(6, true);
    g.sky.set(SKY_PRESETS.remnant, 1);
    g.audio.setEra('blackhole');
    this.mass = this.start = this.carry.bhMass ?? 1.9;
    this.companion = new StarBody({
      color: new THREE.Color(1, 0.55, 0.25),
      hot: new THREE.Color(1, 0.85, 0.55),
      granulation: 2.5,
      intensity: 1.0,
      spots: 0.3,
      boil: 0.6,
      rays: 0.6,
      coronaScale: 2.6,
      core: 0.2,
    });
    this.companion.setRadius(6);
    this.group.add(this.companion);
    this.glow = this.track(new SpriteBatch(40, 'glow'));
    this.stream = this.track(new SpriteBatch(2500, 'glow', { stretch: 0.15 }));
    this.group.add(this.stream.mesh, this.glow.mesh);
    for (let i = 0; i < 2; i++) {
      const b = new JetBeam(0xe0f0ff, 0x7aa0ff);
      this.beams.push(b);
      this.group.add(b);
    }
    this.band = new Ring(0x7dffb2, false, 0.01);
    this.band.mat.uniforms.uDash.value = 60;
    this.bandInner = new Ring(0xff6a4a, false, 0.01);
    this.group.add(this.band, this.bandInner);
    for (let i = 0; i < 900; i++) this.flow.push({ t: Math.random(), seed: Math.random() });
    g.rig.setImmediate({ distance: 70, pitch: 0.9, yaw: 0, fov: 50 }, this.P.clone().multiplyScalar(0.5));
    this.script();
  }

  private async script() {
    const g = this.game;
    await this.wait(1);
    g.hud.titleCard(
      tr('Estrella de neutrones', 'Neutron star'),
      tr('UN DESVÍO EN EL CAMINO', 'A DETOUR ALONG THE WAY'),
      tr('Todavía no tienes masa suficiente para ser un agujero negro', "You don't have enough mass to become a black hole yet"),
      4,
    );
    await this.wait(4.5);
    this.tutorial(
      'ns_roche',
      tr(
        'Tu estrella compañera tiene materia de sobra. Acércate a la <b>zona verde</b> para atraer su gas a través del lóbulo de Roche, pero sin acercarte demasiado.',
        "Your companion star has plenty of matter to spare. Move into the <b>green zone</b> to draw its gas through the Roche lobe, but don't get too close.",
      ),
      9,
    );
  }

  debugSkip() {
    this.mass = TOV_LIMIT;
  }

  update(dt: number) {
    const g = this.game;
    const P = this.P;
    if (!this.cinematic) {
      const steer = g.input.steer(g.camera, P, 1.5, 20);
      this.vel.x = damp(this.vel.x, steer.x * 16, 3, dt);
      this.vel.y = damp(this.vel.y, steer.y * 16, 3, dt);
    } else this.vel.multiplyScalar(1 - dt * 2);
    P.x += this.vel.x * dt;
    P.z += this.vel.y * dt;
    const d = Math.hypot(P.x, P.z);
    if (d > 80) P.multiplyScalar(80 / d);
    if (d < 9 && !this.cinematic) {
      // too close: the companion's envelope drags and pushes you out
      P.multiplyScalar(9.5 / d);
      this.vel.set((P.x / 9.5) * 12, (P.z / 9.5) * 12);
      this.mass = Math.max(this.start, this.mass - 0.015);
      g.shake(0.2);
      g.hud.floater(tr('DEMASIADO CERCA', 'TOO CLOSE'), P.clone().add(new THREE.Vector3(0, 3, 0)), '#ff6a4a', 14, 0.8);
    }
    this.rate = this.cinematic ? 0 : clamp((24 - d) / 12) * (d > 9 ? 1 : 0);
    if (!this.done) this.mass += this.rate * 0.02 * dt;

    // Blobs thrown by the companion (bonus)
    this.blobT -= dt;
    if (this.blobT <= 0 && !this.cinematic) {
      this.blobT = 5 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      this.blobs.push({ x: Math.cos(a) * 7, z: Math.sin(a) * 7, vx: Math.cos(a) * 9, vz: Math.sin(a) * 9, alive: true });
    }
    for (const b of this.blobs) {
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (Math.hypot(b.x - P.x, b.z - P.z) < 3) {
        b.alive = false;
        this.mass += 0.06;
        g.audio.capture(0.2);
        g.hud.floater(`+${num(0.06, 2)} M☉`, new THREE.Vector3(b.x, 2, b.z), '#bfe8ff', 14);
      }
      if (Math.hypot(b.x, b.z) > 90) b.alive = false;
    }
    this.blobs = this.blobs.filter((b) => b.alive);

    // Visuals
    this.companion.update(this.t, g.camera);
    const gl = this.glow;
    gl.begin();
    const pulse = 0.7 + Math.sin(this.t * 40) * 0.3;
    gl.push(P.x, 0, P.z, 0, 0, 0, 0.7, 0.85, 1, 1.5 * pulse + this.collapse * 3, 1.4 + this.collapse * 5);
    gl.push(P.x, 0, P.z, 0, 0, 0, 0.4, 0.55, 1, 0.5, 5);
    for (const b of this.blobs) gl.push(b.x, 0, b.z, b.vx, 0, b.vz, 1, 0.7, 0.4, 1, 1.2);
    gl.end();
    const ax = new THREE.Vector3(Math.cos(this.t * 5), 0.5, Math.sin(this.t * 5)).normalize();
    const bl = 18 * (1 - this.collapse);
    this.beams[0].set(P, ax, bl, 0.6, 0.8, this.t, g.camera.position);
    this.beams[1].set(P, ax.clone().negate(), bl, 0.6, 0.8, this.t, g.camera.position);

    // Roche stream: from the companion's surface (L1 point) spiralling onto you
    const st = this.stream;
    st.begin();
    const toP = new THREE.Vector3(P.x, 0, P.z).normalize();
    const L1 = toP.clone().multiplyScalar(6.2);
    for (const f of this.flow) {
      f.t += dt * (0.4 + f.seed * 0.3);
      if (f.t > 1) f.t -= 1;
      if (this.rate <= 0.01) continue;
      const k = f.t;
      const swirl = (1 - k) * 2.5;
      const base = new THREE.Vector3().lerpVectors(L1, P, easeOutCubic(k));
      const perp = new THREE.Vector3(-toP.z, 0, toP.x);
      const off = Math.sin(k * 9 + f.seed * 20) * swirl * (0.5 + f.seed);
      st.push(base.x + perp.x * off, (f.seed - 0.5) * 0.8, base.z + perp.z * off, (P.x - L1.x) * 0.5, 0, (P.z - L1.z) * 0.5, 1, 0.6 + k * 0.3, 0.35 + k * 0.6, this.rate * (0.4 + k * 0.6), 0.25 + f.seed * 0.2);
    }
    st.end();
    this.band.position.set(0, 0, 0);
    this.band.setWorldRadius(17);
    this.band.mat.uniforms.uFill.value = 0;
    this.band.opacity = 0.35;
    this.band.tick(this.t, g.camera);
    this.bandInner.setWorldRadius(9);
    this.bandInner.opacity = 0.3;
    this.bandInner.tick(this.t, g.camera);

    const prog = (this.mass - this.start) / (TOV_LIMIT - this.start);
    g.hud.setMass(num(this.mass, 2), 'M☉', tr(`estrella de neutrones · límite TOV ≈ ${num(2.5, 1)}`, 'neutron star · TOV limit ≈ 2.5'));
    g.hud.setObjective(this.done ? tr('Colapso', 'Collapse') : tr('Atrae gas de tu compañera hasta superar el límite TOV', 'Draw gas from your companion until you pass the TOV limit'), prog);
    g.hud.setMeters([{ id: 'rate', label: tr('Transferencia de masa', 'Mass transfer'), value: this.rate, color: '#8fd3ff' }]);
    g.audio.setIntensity(0.3 + this.rate * 0.4);
    if (!this.cinematic) g.rig.target.set(P.x * 0.55, 0, P.z * 0.55);

    if (!this.done && this.mass >= TOV_LIMIT) {
      this.done = true;
      this.finish();
    }
  }

  private async finish() {
    const g = this.game;
    this.cinematic = true;
    g.prog.achieve('neutron_detour');
    g.pipe.final.letterboxTarget = 1;
    g.hud.titleCard(tr('Límite TOV superado', 'TOV limit exceeded'), tr('COLAPSO', 'COLLAPSE'), tr('Ni siquiera los neutrones pueden resistir', 'Not even neutrons can hold out'), 3.5);
    g.audio.collapseSuck(2);
    g.rig.target.copy(this.P);
    g.rig.animate({ distance: 26, pitch: 0.2 }, 2.5);
    const t0 = this.t;
    while (this.alive && this.t - t0 < 2) {
      this.collapse = (this.t - t0) / 2;
      await this.wait(0);
    }
    g.pipe.final.doFlash(1, 0xdde8ff);
    g.pipe.final.shockwave(this.P.clone(), 1, 1.5, 1);
    g.audio.boom();
    const bh = g.pipe.bhPass;
    bh.primaryActive = true;
    bh.bhPos.copy(this.P);
    bh.diskIntensity = 0.3;
    bh.diskNormal.set(0.1, 1, 0.3).normalize();
    const t1 = this.t;
    while (this.alive && this.t - t1 < 2.5) {
      bh.rs = 0.05 + clamp((this.t - t1) / 2) * 0.8;
      this.collapse = 1;
      await this.wait(0);
    }
    g.saveCarry({ remnant: 'bh', bhMass: 3 });
    await g.goto('blackhole', { remnant: 'bh', bhMass: 3 }, { fade: 1 });
  }
}
