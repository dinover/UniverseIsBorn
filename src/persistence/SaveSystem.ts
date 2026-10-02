/**
 * Persistence layer. Storage is abstracted behind `SaveBackend` so an online backend
 * (accounts / cloud saves) can be added later without touching gameplay code.
 */
export interface SaveBackend {
  load<T>(key: string): T | null;
  save<T>(key: string, data: T): void;
  remove(key: string): void;
}

export class LocalStorageBackend implements SaveBackend {
  load<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
  save<T>(key: string, data: T) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* storage full or unavailable: the game keeps working without saving */
    }
  }
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export type PhaseId = 'primordial' | 'cloud' | 'protostar' | 'stellar' | 'supernova' | 'neutron' | 'blackhole' | 'galaxy';

export interface RunCarry {
  cloudMass?: number;
  starMass?: number;
  coreQuality?: number;
  remnant?: 'bh' | 'ns';
  bhMass?: number;
  stage?: number;
  galaxyStage?: number;
  mergesDone?: number;
  jetsUnlocked?: boolean;
  diskUnlocked?: boolean;
}

export interface RunState {
  version: 1;
  seed: number;
  phase: PhaseId;
  carry: RunCarry;
  time: number;
  savedAt: number;
}

export interface Settings {
  quality: 'auto' | 'low' | 'medium' | 'high';
  music: number;
  sfx: number;
  educational: boolean;
  shake: boolean;
}

export interface Stats {
  timePlayed: number;
  particles: number;
  starsDevoured: number;
  captures: number;
  bhMerged: number;
  maxMass: number;
  supernovae: number;
  jetSeconds: number;
  runsCompleted: number;
  perfectHits: number;
}

export interface MetaState {
  version: 1;
  achievements: Record<string, number>;
  codex: Record<string, boolean>;
  codexRead: Record<string, boolean>;
  stats: Stats;
  settings: Settings;
  tutorials: Record<string, boolean>;
}

const RUN_KEY = 'uib.run.v1';
const META_KEY = 'uib.meta.v1';

export const defaultSettings = (): Settings => ({ quality: 'auto', music: 0.6, sfx: 0.8, educational: true, shake: true });
export const defaultStats = (): Stats => ({ timePlayed: 0, particles: 0, starsDevoured: 0, captures: 0, bhMerged: 0, maxMass: 0, supernovae: 0, jetSeconds: 0, runsCompleted: 0, perfectHits: 0 });

export class SaveSystem {
  constructor(private backend: SaveBackend = new LocalStorageBackend()) {}

  loadMeta(): MetaState {
    const m = this.backend.load<MetaState>(META_KEY);
    const base: MetaState = { version: 1, achievements: {}, codex: {}, codexRead: {}, stats: defaultStats(), settings: defaultSettings(), tutorials: {} };
    if (!m || m.version !== 1) return base;
    return {
      ...base,
      ...m,
      stats: { ...base.stats, ...m.stats },
      settings: { ...base.settings, ...m.settings },
    };
  }

  saveMeta(m: MetaState) {
    this.backend.save(META_KEY, m);
  }

  loadRun(): RunState | null {
    const r = this.backend.load<RunState>(RUN_KEY);
    if (!r || r.version !== 1 || !r.phase) return null;
    return r;
  }

  saveRun(r: RunState) {
    r.savedAt = Date.now();
    this.backend.save(RUN_KEY, r);
  }

  clearRun() {
    this.backend.remove(RUN_KEY);
  }
}
