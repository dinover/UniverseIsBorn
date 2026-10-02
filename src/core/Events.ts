type Handler<T> = (payload: T) => void;

/** Tiny typed event bus used to decouple gameplay, progression, audio and UI. */
export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<any>>>();

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]) {
    const set = this.handlers.get(type);
    if (set) for (const fn of [...set]) fn(payload);
  }
}

export interface GameEvents extends Record<string, unknown> {
  absorb: { kind: string; amount: number };
  stage: { stage: number };
  discovery: { id: string };
  achievement: { id: string };
  starDevoured: { mass: number };
  bhMerged: { mass: number };
  supernova: { remnant: 'bh' | 'ns' };
  fusionHit: { quality: 'perfect' | 'good' | 'miss' };
  jets: { active: boolean };
  failure: { reason: string };
  massChanged: { mass: number };
  phaseComplete: { phase: string };
}
