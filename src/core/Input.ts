import * as THREE from 'three';

/**
 * Unified input: mouse (move towards cursor), keyboard (WASD), touch (virtual stick + buttons).
 * Gameplay reads the steering helpers, `primaryHeld`, `secondaryHeld` and `pointerWorld`.
 */
export class Input {
  pointerNdc = new THREE.Vector2();
  pointerWorld = new THREE.Vector3();
  pointerInside = false;
  primary = false;
  secondary = false;
  touchPrimary = false;
  touchSecondary = false;
  primaryPressed = false; // rising edge this frame
  secondaryPressed = false;
  clicked = false; // a click/tap happened this frame (for selecting things)
  keys = new Set<string>();
  wheel = 0;
  touchMode = matchMedia('(pointer: coarse)').matches;
  stick = new THREE.Vector2();
  private stickId: number | null = null;
  private stickOrigin = new THREE.Vector2();
  private prevPrimary = false;
  private prevSecondary = false;
  private pendingClick = false;
  enabled = true;
  onPause: (() => void) | null = null;
  onAnyInput: (() => void) | null = null;

  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private el: HTMLElement) {
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.setNdc(e.clientX, e.clientY);
      this.pointerInside = true;
    });
    el.addEventListener('pointerleave', () => (this.pointerInside = false));
    el.addEventListener('pointerdown', (e) => {
      this.onAnyInput?.();
      if (e.pointerType === 'touch') return;
      this.setNdc(e.clientX, e.clientY);
      this.pointerInside = true;
      if (e.button === 0) {
        this.primary = true;
        this.pendingClick = true;
      }
      if (e.button === 2) this.secondary = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.primary = false;
      if (e.button === 2) this.secondary = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      this.onAnyInput?.();
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'p') {
        this.onPause?.();
        return;
      }
      this.keys.add(k);
      if (k === ' ') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.primary = this.secondary = false;
    });

    // Touch: left 60% of the screen = floating stick; taps elsewhere aim/select.
    el.addEventListener(
      'touchstart',
      (e) => {
        this.touchMode = true;
        for (const t of Array.from(e.changedTouches)) {
          if (this.stickId === null && t.clientX < window.innerWidth * 0.6) {
            this.stickId = t.identifier;
            this.stickOrigin.set(t.clientX, t.clientY);
            this.stick.set(0, 0);
          } else {
            this.setNdc(t.clientX, t.clientY);
            this.pendingClick = true;
          }
        }
        e.preventDefault();
      },
      { passive: false },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.stickId) {
            this.stick.set((t.clientX - this.stickOrigin.x) / 60, (t.clientY - this.stickOrigin.y) / 60);
            if (this.stick.length() > 1) this.stick.normalize();
          } else this.setNdc(t.clientX, t.clientY);
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickId) {
          this.stickId = null;
          this.stick.set(0, 0);
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  get stickActive() {
    return this.stickId !== null;
  }
  get stickOriginPx() {
    return this.stickOrigin;
  }

  private setNdc(x: number, y: number) {
    this.pointerNdc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  }

  keyAxis(): THREE.Vector2 {
    const v = new THREE.Vector2();
    if (this.keys.has('w') || this.keys.has('arrowup')) v.y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) v.y += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) v.x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) v.x += 1;
    return v;
  }

  get primaryHeld() {
    return this.enabled && (this.primary || this.touchPrimary || this.keys.has(' '));
  }
  get secondaryHeld() {
    return this.enabled && (this.secondary || this.touchSecondary || this.keys.has('shift') || this.keys.has('e'));
  }

  /** Called once per frame before gameplay update. */
  update(camera: THREE.Camera, planeY = 0) {
    this.plane.constant = -planeY;
    this.raycaster.setFromCamera(this.pointerNdc, camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (hit) this.pointerWorld.copy(hit);
    const p = this.primaryHeld;
    const s = this.secondaryHeld;
    this.primaryPressed = p && !this.prevPrimary;
    this.secondaryPressed = s && !this.prevSecondary;
    this.prevPrimary = p;
    this.prevSecondary = s;
    this.clicked = this.pendingClick && this.enabled;
    this.pendingClick = false;
  }

  /**
   * Returns a desired world-space (x,z) steering vector with length 0..1.
   * Mouse: towards the cursor (agar-style). Keyboard/touch stick override.
   */
  steer(camera: THREE.Camera, from: THREE.Vector3, deadZone: number, fullAt: number): THREE.Vector2 {
    if (!this.enabled) return new THREE.Vector2();
    const k = this.keyAxis();
    const stickLike = k.lengthSq() > 0 ? k : this.stickActive ? this.stick.clone() : null;
    if (stickLike) {
      // Convert screen axes to world using camera yaw.
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const v = new THREE.Vector2(right.x * stickLike.x - fwd.x * stickLike.y, right.z * stickLike.x - fwd.z * stickLike.y);
      if (v.length() > 1) v.normalize();
      return v;
    }
    if (this.touchMode || !this.pointerInside) return new THREE.Vector2();
    const dx = this.pointerWorld.x - from.x;
    const dz = this.pointerWorld.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d < deadZone) return new THREE.Vector2();
    const mag = Math.min(1, (d - deadZone) / Math.max(1e-6, fullAt - deadZone));
    return new THREE.Vector2((dx / d) * mag, (dz / d) * mag);
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
}
