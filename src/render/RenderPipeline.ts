import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BlackHolePass } from './passes/BlackHolePass';
import { FinalPass } from './passes/FinalPass';
import type { QualityManager } from '../core/Quality';

/**
 * HDR render pipeline: scene -> GR lens -> bloom -> cinematic composite -> ACES tone map.
 */
export class RenderPipeline {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bhPass: BlackHolePass;
  bloom: UnrealBloomPass;
  final: FinalPass;
  bloomBoost = 0;
  exposure = 1;
  private renderPass: RenderPass;

  constructor(container: HTMLElement, public scene: THREE.Scene, public camera: THREE.PerspectiveCamera, private quality: QualityManager) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    container.appendChild(this.renderer.domElement);

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bhPass = new BlackHolePass(quality.profile.bhSteps);
    this.composer.addPass(this.bhPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.0, 0.65, 0.72);
    this.composer.addPass(this.bloom);
    this.final = new FinalPass();
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
    quality.onChange = () => this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const p = this.quality.profile;
    const pr = Math.min(window.devicePixelRatio || 1, p.pixelRatio) * this.quality.resolutionScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(Math.round(w * p.bloomScale), Math.round(h * p.bloomScale));
    this.bloom.setSize(Math.round(w * pr * p.bloomScale), Math.round(h * pr * p.bloomScale));
    this.bhPass.setSteps(p.bhSteps);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number, time: number) {
    const p = this.quality.profile;
    this.bloom.strength = p.bloomStrength + this.bloomBoost;
    this.bloomBoost = Math.max(0, this.bloomBoost - dt * 0.8);
    this.renderer.toneMappingExposure = this.exposure;
    this.bhPass.updateUniforms(this.camera, time);
    this.final.update(dt, time, this.camera, p.chroma, p.grain);
    this.composer.render(dt);
  }
}
