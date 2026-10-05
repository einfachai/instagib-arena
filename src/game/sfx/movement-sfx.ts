// ── Movement synthesis: footsteps, jumps, landings, dash, wall-kick, boost ───
// Same Voice contract as weapon-sfx.ts. Footsteps / landings / wall kicks take
// the map's SurfaceProfile, so Reactor's steel grates ring and Lounge's floor
// thuds. Body / scuff / whoosh layers are pink noise (low-mid weight); heel
// clicks and grit are white noise (top end).
import { clamp, glide, perc, rr, vary, type NoiseBank, type Voice } from './core';

export type SurfaceProfile = {
  /** Heel-thump pitch, Hz. */
  thump: number;
  /** Scuff low-pass, Hz (brighter = harder floor). */
  body: number;
  /** Heel-click band, Hz. */
  click: number;
  /** Click / grit amount 0..1 (grit, gravel, grating rattle). */
  grit: number;
  /** Resonant ring of the floor (metal), Hz — 0 for none. */
  ring: number;
  ringQ: number;
  ringAmt: number;
};

/** One footfall. `speed01` (0 walk … 1 full run) adds weight. */
export function footstep(v: Voice, bank: NoiseBank, s: SurfaceProfile, speed01: number) {
  const t = v.t;
  const p = v.noise(bank.pink, t, t + 0.2, vary(1, 0.1));
  const lp = v.filter('lowpass', vary(s.body, 0.18), 0.8);
  p.connect(lp);
  const g = v.gain(0, v.out);
  lp.connect(g);
  perc(g.gain, t + rr(0, 0.006), 1.0 + 0.35 * speed01, 0.003, vary(0.09, 0.2));
  const w = v.noise(bank.white, t, t + 0.04);
  const bp = v.filter('bandpass', vary(s.click, 0.2), 1.6);
  w.connect(bp);
  const cg = v.gain(0, v.out);
  bp.connect(cg);
  perc(cg.gain, t, 1.8 * s.grit, 0.0006, 0.025);
  const f = vary(s.thump, 0.1);
  const o = v.osc('sine', f, t, t + 0.1);
  glide(o.frequency, t, f, f * 0.6, 0.06);
  const og = v.gain(0, v.out);
  o.connect(og);
  perc(og.gain, t, 0.2 + 0.1 * speed01, 0.002, 0.07);
  if (s.ringAmt > 0) {
    const rb = v.filter('bandpass', vary(s.ring, 0.04), s.ringQ);
    p.connect(rb);
    const rg = v.gain(0, v.out);
    rb.connect(rg);
    perc(rg.gain, t, s.ringAmt * 4, 0.001, 0.15);
  }
}

/** Ground jump loading fallback: a textured sole scuff and a light fabric flick. */
export function jump(v: Voice, bank: NoiseBank, s: SurfaceProfile) {
  const t = v.t;
  const n = v.noise(bank.pink, t, t + 0.2);
  const hp = v.filter('highpass', 170, 0.7);
  const lp = v.filter('lowpass', Math.min(s.body * 2.2, 3200), 0.7);
  n.connect(hp).connect(lp);
  const g = v.gain(0, v.out);
  lp.connect(g);
  perc(g.gain, t, 0.42, 0.003, 0.15);
  const cloth = v.noise(bank.white, t, t + 0.1);
  const band = v.filter('bandpass', 2300, 0.7);
  cloth.connect(band);
  const clothGain = v.gain(0, v.out);
  band.connect(clothGain);
  perc(clothGain.gain, t, 0.1, 0.003, 0.07);
}

/** Double jump loading fallback: a full, unpitched air rush with a smooth tail. */
export function airJump(v: Voice, bank: NoiseBank) {
  const t = v.t;
  const n = v.noise(bank.pink, t, t + 0.29);
  const hp = v.filter('highpass', 180, 0.7);
  const lp = v.filter('lowpass', 5000, 0.7);
  n.connect(hp).connect(lp);
  const g = v.gain(0, v.out);
  lp.connect(g);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.42, t + 0.008);
  g.gain.linearRampToValueAtTime(0.28, t + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  g.gain.setValueAtTime(0, t + 0.26);
}

/**
 * Landing thud scaled by impact speed (m/s): a soft touchdown near 4 m/s, a
 * heavy body-slam + gear rattle at 20+ m/s (big falls, boost arcs).
 */
export function land(v: Voice, bank: NoiseBank, s: SurfaceProfile, impact: number) {
  const t = v.t;
  const k = clamp((impact - 3) / 17, 0, 1);
  const f = 78 - 22 * k;
  const o = v.osc('sine', f, t, t + 0.32);
  glide(o.frequency, t, f, 38, 0.1 + 0.1 * k);
  const og = v.gain(0, v.out);
  o.connect(og);
  perc(og.gain, t, 0.3 + 0.3 * k, 0.002, 0.08 + 0.14 * k);
  const p = v.noise(bank.pink, t, t + 0.35);
  const lp = v.filter('lowpass', s.body * (0.6 + 1.0 * k), 0.9);
  p.connect(lp);
  const ng = v.gain(0, v.out);
  lp.connect(ng);
  perc(ng.gain, t, 1.0 + 0.8 * k, 0.002, 0.07 + 0.13 * k);
  const w = v.noise(bank.white, t, t + 0.12);
  const bp = v.filter('bandpass', vary(s.click, 0.15), 1.6);
  w.connect(bp);
  const cg = v.gain(0, v.out);
  bp.connect(cg);
  perc(cg.gain, t, 1.2 * s.grit * (0.5 + 0.5 * k), 0.0006, 0.03);
  if (k > 0.3) {
    // Gear rattle: armour plates settling a beat after the slam.
    const rb = v.filter('bandpass', 2300, 3);
    w.connect(rb);
    const rg = v.gain(0, v.out);
    rb.connect(rg);
    perc(rg.gain, t + 0.022, 1.4 * k, 0.001, 0.07);
  }
  if (s.ringAmt > 0) {
    const rb = v.filter('bandpass', s.ring * 0.92, s.ringQ);
    p.connect(rb);
    const rg = v.gain(0, v.out);
    rb.connect(rg);
    perc(rg.gain, t, s.ringAmt * (3 + 3.5 * k), 0.001, 0.2 + 0.15 * k);
  }
}

/** Dash loading fallback: a smooth, short air rush following lateral direction. */
export function dash(v: Voice, bank: NoiseBank, lateral: number, wide: boolean) {
  const t = v.t;
  const n = v.noise(bank.pink, t, t + 0.23);
  const bp = v.filter('bandpass', 900, 0.5);
  n.connect(bp);
  const g = v.gain(0);
  bp.connect(g);
  perc(g.gain, t, 0.4, 0.004, 0.18);
  if (wide) g.connect(v.pan(0.35 * lateral)).connect(v.out);
  else g.connect(v.out);
}

/** Wall-jump kick: a solid boot "tok" on the wall + the surface ring + a short whoosh. */
export function wallKick(v: Voice, bank: NoiseBank, s: SurfaceProfile) {
  const t = v.t;
  const n = v.noise(bank.pink, t, t + 0.3);
  const bp = v.filter('bandpass', vary(650, 0.08), 2.5);
  n.connect(bp);
  const g = v.gain(0, v.out);
  bp.connect(g);
  perc(g.gain, t, 2.2, 0.0008, 0.05);
  const o = v.osc('sine', 165, t, t + 0.12);
  glide(o.frequency, t, 165, 88, 0.07);
  const og = v.gain(0, v.out);
  o.connect(og);
  perc(og.gain, t, 0.45, 0.001, 0.08);
  if (s.ringAmt > 0) {
    const rb = v.filter('bandpass', s.ring * 1.08, s.ringQ);
    n.connect(rb);
    const rg = v.gain(0, v.out);
    rb.connect(rg);
    perc(rg.gain, t, s.ringAmt * 5, 0.001, 0.22);
  }
  const wb = v.filter('bandpass', 600, 1);
  glide(wb.frequency, t, 600, 1800, 0.16);
  n.connect(wb);
  const wg = v.gain(0, v.out);
  wb.connect(wg);
  perc(wg.gain, t + 0.02, 0.45, 0.03, 0.18);
}

/** Boost loading fallback: a compact pressure blast with a small bass impulse. */
export function boost(v: Voice, bank: NoiseBank, detail: number) {
  const t = v.t;
  const n = v.noise(bank.pink, t, t + 0.34);
  const lp = v.filter('lowpass', 2000, 0.7);
  n.connect(lp);
  const g = v.gain(0, v.out);
  lp.connect(g);
  perc(g.gain, t, 0.5, 0.002, 0.28);
  const o = v.osc('sine', 95, t, t + 0.13);
  const body = v.gain(0, v.out);
  o.connect(body);
  perc(body.gain, t, 0.08 + 0.03 * detail, 0.002, 0.09);
}
