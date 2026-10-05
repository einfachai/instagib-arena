export const SCOPE_IN_SECONDS = 0.5;
export const SCOPE_OUT_SECONDS = 0.25;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export function scopeEase(start: number, end: number, value: number): number {
  const t = clamp01((value - start) / (end - start));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export type ScopeFrame = ReturnType<typeof sampleScope>;
export function sampleScope(progress: number) {
  const p = Number.isFinite(progress) ? clamp01(progress) : 0;
  return {
    progress: p,
    alignment: scopeEase(0, 0.7, p),
    approach: scopeEase(0, 1, p),
    zoom: scopeEase(0.06, 1, p),
    handoff: scopeEase(0.5, 1, p),
    rim: scopeEase(0.52, 0.88, p),
    reticle: scopeEase(0.76, 1, p),
    darkness: scopeEase(0.18, 1, p),
    blur: 12 * scopeEase(0.12, 0.72, p) * (1 - scopeEase(0.92, 1, p)),
    weaponOpacity: 1 - scopeEase(0.7, 0.97, p),
  };
}

// One reversible clock, sampled by every presentation layer. No timers, CSS
// animations, or FOV-derived approximations that drift after a quick reversal.
export class ScopeTransition {
  private progress = 0;
  frame = sampleScope(0);

  update(held: boolean, dt: number, allowed = true): ScopeFrame {
    if (!allowed) return this.reset();
    const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.progress = clamp01(this.progress + (held ? delta / SCOPE_IN_SECONDS : -delta / SCOPE_OUT_SECONDS));
    // Avoid tiny floating-point tails at the exact half/quarter-second boundary.
    if (this.progress < 1e-8) this.progress = 0;
    if (this.progress > 1 - 1e-8) this.progress = 1;
    return this.frame = sampleScope(this.progress);
  }

  reset(): ScopeFrame {
    this.progress = 0;
    return this.frame = sampleScope(0);
  }
}
