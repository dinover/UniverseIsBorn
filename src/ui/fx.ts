/**
 * Small interface effects for the holographic look. Pure DOM, no dependencies.
 */

const GLYPHS = '01<>/\\[]{}=+*#%ΔΣΨΩ◆◇▲▼░▒';
const runs = new WeakMap<HTMLElement, number>();

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * "Decodes" an element's plain text: every character starts as a random glyph and
 * locks into place from left to right, like a transmission coming into focus.
 * Only for elements whose content is plain text (their markup is replaced).
 */
export function decode(el: HTMLElement | null, ms = 520) {
  if (!el) return;
  const text = el.dataset.decoded ?? el.textContent ?? '';
  el.dataset.decoded = text;
  if (!text.trim() || reducedMotion()) {
    el.textContent = text;
    return;
  }
  const id = (runs.get(el) ?? 0) + 1;
  runs.set(el, id);
  const t0 = performance.now();
  const chars = [...text];
  const step = () => {
    if (runs.get(el) !== id) return;
    const k = Math.min(1, (performance.now() - t0) / ms);
    const locked = Math.floor(k * chars.length * 1.15 - chars.length * 0.15);
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      out += i < locked || c === ' ' ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (k < 1) requestAnimationFrame(step);
    else {
      el.textContent = text;
      delete el.dataset.decoded;
    }
  };
  step();
}
