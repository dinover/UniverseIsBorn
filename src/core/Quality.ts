export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = QualityLevel | 'auto';

export interface QualityProfile {
  level: QualityLevel;
  pixelRatio: number;
  particles: number; // multiplier for particle budgets
  bloomScale: number;
  bhSteps: number;
  bloomStrength: number;
  grain: boolean;
  chroma: boolean;
  motes: number;
  galaxyStars: number;
}

export const PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { level: 'low', pixelRatio: 0.75, particles: 0.35, bloomScale: 0.35, bhSteps: 48, bloomStrength: 0.8, grain: false, chroma: false, motes: 500, galaxyStars: 45000 },
  medium: { level: 'medium', pixelRatio: 1, particles: 0.65, bloomScale: 0.5, bhSteps: 80, bloomStrength: 0.95, grain: true, chroma: true, motes: 1200, galaxyStars: 110000 },
  high: { level: 'high', pixelRatio: 1.5, particles: 1, bloomScale: 0.5, bhSteps: 120, bloomStrength: 1.05, grain: true, chroma: true, motes: 2200, galaxyStars: 220000 },
};

/**
 * Tracks frame time and, when the player chose "auto", drives the resolution scale
 * and profile so the game stays smooth without the player touching settings.
 */
export class QualityManager {
  setting: QualitySetting = 'auto';
  profile: QualityProfile = PROFILES.high;
  resolutionScale = 1;
  private acc = 0;
  private frames = 0;
  private cooldown = 2;
  fps = 60;
  onChange: (() => void) | null = null;

  constructor(setting: QualitySetting) {
    this.apply(setting);
  }

  apply(setting: QualitySetting) {
    this.setting = setting;
    const isMobile = matchMedia('(pointer: coarse)').matches;
    const lvl: QualityLevel = setting === 'auto' ? (isMobile ? 'medium' : 'high') : setting;
    this.profile = PROFILES[lvl];
    this.resolutionScale = 1;
    this.cooldown = 3;
    this.onChange?.();
  }

  sample(dt: number) {
    this.acc += dt;
    this.frames++;
    if (this.acc < 1) return;
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.setting !== 'auto') return;
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }
    if (this.fps < 42) {
      if (this.resolutionScale > 0.6) this.resolutionScale = Math.max(0.6, this.resolutionScale - 0.15);
      else if (this.profile.level === 'high') this.profile = PROFILES.medium;
      else if (this.profile.level === 'medium') this.profile = PROFILES.low;
      else return;
      this.cooldown = 3;
      this.onChange?.();
    } else if (this.fps > 58 && this.resolutionScale < 1) {
      this.resolutionScale = Math.min(1, this.resolutionScale + 0.1);
      this.cooldown = 4;
      this.onChange?.();
    }
  }
}
