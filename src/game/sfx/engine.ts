// ── SfxEngine: recorded game audio with a procedural loading fallback ───────
//
// Owns the Mixer (buses / reverb / limiter / voice pool), the NoiseBank, the
// ElevenLabs recordings, current map's room + surface + ambience bed, and one
// method per game sound. Recordings use the same routing and voice pools.
// Works on any BaseAudioContext: the SoundManager (audio.ts) drives it live,
// preview.ts renders it offline to measure levels. Every method takes an
// optional `at` (context time) so sequences can be scheduled offline.
import { NoiseBank, Voice, clamp, rnd, type AC, type VoiceCat } from './core';
import { AmbienceBed, mapAudio } from './map-audio';
import { Mixer, type SpatialOpts } from './mixer';
import type { MotionEventKind } from './motion-tracker';
import {
  airJump,
  boost,
  dash,
  footstep,
  jump,
  land,
  wallKick,
  type SurfaceProfile,
} from './movement-sfx';
import { medalSting, type StingKind } from './stings';
import { finisherAccent, wallImpact } from './finisher-sfx';
import { chargeHum, death, gib, hitTick, railShot, readyCue } from './weapon-sfx';
import { GENERATED_SFX_URLS, type GeneratedSfxName } from './generated-pack';
import { mapSample, RecordedAmbience, sampleBank, type SampleBank } from './samples';

export type LocalMoveKind = 'step' | 'jump' | 'airjump' | 'walljump' | 'land' | 'dash' | 'boost';

// 3D profiles. Rails carry across the arena; footsteps are close-range
// awareness (quieter than your own, culled beyond ~30 m).
const RAIL_3D: SpatialOpts = { ref: 6, rolloff: 0.85, max: 140, send: 0.38 };
const GIB_3D: SpatialOpts = { ref: 5, rolloff: 1.2, max: 70, send: 0.3 };
const STEP_3D: SpatialOpts = { ref: 2.5, rolloff: 1.5, max: 30, send: 0.08 };
const MOVE_3D: SpatialOpts = { ref: 3, rolloff: 1.3, max: 45, send: 0.15 };

export class SfxEngine {
  readonly mixer: Mixer;
  readonly bank: NoiseBank;
  readonly samples: SampleBank;
  private surface: SurfaceProfile;
  private mapId = '';
  private bed: AmbienceBed | RecordedAmbience | null = null;
  private ambienceRevision = 0;
  private ambienceOn = false;
  private charge: Voice | null = null;
  private stepSide = 1;
  // Replay slow-mo: cents applied to every new voice's sources while a slowed
  // clip plays (0 = off).
  private replayCents = 0;

  constructor(readonly ctx: AC, dest?: AudioNode) {
    this.bank = new NoiseBank(ctx);
    this.samples = sampleBank(ctx);
    this.mixer = new Mixer(ctx, dest);
    const a = mapAudio('');
    this.surface = a.surface;
    this.mixer.setRoom(a.room);
    void this.preload();
  }

  /** Load gameplay recordings and the current map. Also used before offline renders. */
  async preload() {
    const names = (Object.keys(GENERATED_SFX_URLS) as GeneratedSfxName[]).filter(
      (name) => !name.startsWith('ui-') && !name.startsWith('ambience-') && !name.startsWith('step-'),
    );
    await this.samples.preload([...names, mapSample('step', this.mapId), mapSample('ambience', this.mapId)]);
  }

  // ── Mix controls ───────────────────────────────────────────────────────────
  setMasterVolume(v: number) {
    this.mixer.out.gain.value = v;
  }
  setSfxVolume(v: number) {
    this.mixer.sfxBus.gain.value = v;
  }
  setAnnouncerVolume(v: number) {
    this.mixer.announcerBus.gain.value = v;
  }
  setLowSpec(on: boolean) {
    this.mixer.setLowSpec(on);
  }
  setListenerPos(x: number, y: number, z: number) {
    this.mixer.lx = x;
    this.mixer.ly = y;
    this.mixer.lz = z;
  }
  /** Duck ambience and music under an announcer line. */
  duck(sec: number) {
    this.mixer.duck(sec);
  }

  // ── Map: room + surface + ambience ─────────────────────────────────────────
  setMap(id: string) {
    if (id === this.mapId) return;
    this.mapId = id;
    const a = mapAudio(id);
    this.surface = a.surface;
    this.mixer.setRoom(a.room);
    void this.samples.preload([mapSample('step', id), mapSample('ambience', id)]);
    if (this.ambienceOn) this.swapBed(2.0);
  }

  startAmbience() {
    if (this.ambienceOn) return;
    this.ambienceOn = true;
    this.swapBed(2.5);
  }

  stopAmbience(fade = 0.6) {
    this.ambienceRevision++;
    this.ambienceOn = false;
    this.bed?.stop(fade);
    this.bed = null;
  }

  // Crossfade: the old bed fades out while the new one fades in.
  private swapBed(fadeIn: number) {
    const revision = ++this.ambienceRevision;
    this.bed?.stop(1.5);
    const key = mapSample('ambience', this.mapId);
    const buffer = this.samples.buffer(key);
    this.bed = buffer
      ? new RecordedAmbience(this.ctx, buffer, this.mixer.ambience, fadeIn)
      : new AmbienceBed(this.ctx, this.bank, mapAudio(this.mapId).bed, this.mixer.ambience, fadeIn);
    if (!buffer) void this.samples.preload([key]).then(() => {
      if (this.ambienceOn && revision === this.ambienceRevision && this.samples.buffer(key)) this.swapBed(0.8);
    });
  }

  // ── Voice plumbing ─────────────────────────────────────────────────────────
  private voice(gain: number, at?: number): Voice {
    return new Voice(this.ctx, at ?? this.ctx.currentTime, gain);
  }

  private commit(v: Voice, cat: VoiceCat): Voice {
    if (this.replayCents !== 0) {
      for (const s of v.srcs) {
        const d = (s as unknown as { detune?: AudioParam }).detune;
        if (d) d.value = this.replayCents;
      }
    }
    this.mixer.add(v, cat);
    return v;
  }

  // ── Weapon ─────────────────────────────────────────────────────────────────
  /** Your own rail shot: full layered stereo discharge + room reverb. */
  railShot(vol = 1, at?: number) {
    const v = this.voice(vol, at);
    if (!this.samples.play(v, 'rail-fire')) railShot(v, this.bank, true, 1);
    this.mixer.toWorld(v, this.mixer.sendMid);
    return this.commit(v, 'self');
  }

  /** Another player's / bot's rail shot at its muzzle (3D). */
  railAt(x: number, y: number, z: number, vol = 1, at?: number) {
    const d = this.mixer.audible(x, y, z, RAIL_3D.max);
    if (d < 0) return null;
    // Others' shots sit ~6 dB under your own at the same distance.
    const v = this.voice(vol * 0.5, at);
    if (!this.samples.play(v, 'rail-fire')) railShot(v, this.bank, false, 0.5);
    this.mixer.spatial(v, x, y, z, d, RAIL_3D);
    return this.commit(v, 'rail');
  }

  /** Recharge hum for `dur` seconds (quiet). Replaces any hum in flight. */
  chargeStart(dur: number, at?: number) {
    this.chargeStop();
    if (!(dur > 0.1)) return;
    const v = this.voice(1, at);
    if (!this.samples.play(v, 'rail-charge', 1, dur)) chargeHum(v, dur);
    v.out.connect(this.mixer.hud);
    this.charge = this.commit(v, 'hud');
  }

  chargeStop() {
    if (this.charge && this.charge.end > this.ctx.currentTime) this.mixer.stop(this.charge);
    this.charge = null;
  }

  ready(vol = 1, at?: number) {
    const v = this.voice(vol, at);
    if (!this.samples.play(v, 'reload-ready')) readyCue(v, this.bank);
    v.out.connect(this.mixer.hud);
    return this.commit(v, 'hud');
  }

  // ── Hit / kill ─────────────────────────────────────────────────────────────
  hitTick(headshot: boolean, vol = 1, at?: number) {
    const v = this.voice(vol, at);
    if (!this.samples.play(v, headshot ? 'hit-headshot' : 'hit')) hitTick(v, this.bank, headshot);
    v.out.connect(this.mixer.hud);
    return this.commit(v, 'hud');
  }

  /** Kill confirm: the victim bursting (non-positional — it's your frag). */
  kill(headshot: boolean, vol = 1, at?: number) {
    const v = this.voice(vol, at);
    if (!this.samples.play(v, headshot ? 'kill-headshot' : 'kill')) gib(v, this.bank, headshot, 1);
    this.mixer.toWorld(v, this.mixer.sendLo);
    return this.commit(v, 'self');
  }

  /** Someone else's frag, heard where the body burst (3D, thinner). */
  gibAt(x: number, y: number, z: number, vol = 1, at?: number) {
    const d = this.mixer.audible(x, y, z, GIB_3D.max);
    if (d < 0) return null;
    const v = this.voice(vol, at);
    if (!this.samples.play(v, 'kill')) gib(v, this.bank, false, 0.5);
    this.mixer.spatial(v, x, y, z, d, GIB_3D);
    return this.commit(v, 'impact');
  }

  /** You got fragged. */
  death(vol = 1, at?: number) {
    this.chargeStop();
    const v = this.voice(vol, at);
    if (!this.samples.play(v, 'death')) death(v, this.bank);
    this.mixer.toWorld(v, this.mixer.sendLo);
    return this.commit(v, 'self');
  }

  /** One body collision, positioned at its ground contact for every listener. */
  deathImpactAt(x: number, y: number, z: number, vol = 0.6, at?: number) {
    const d = this.mixer.audible(x, y, z, GIB_3D.max);
    if (d < 0) return null;
    const v = this.voice(vol, at);
    if (!this.samples.play(v, 'death-impact') && !this.samples.play(v, 'death')) death(v, this.bank);
    this.mixer.spatial(v, x, y, z, d, GIB_3D);
    return this.commit(v, 'impact');
  }

  medalSting(kind: StingKind, level: number, vol = 1, at?: number) {
    const v = this.voice(vol, at);
    const key = (kind === 'special' ? 'medal-special' : `medal-${kind}-${Math.round(clamp(level, kind === 'multi' ? 2 : 1, 5))}`) as GeneratedSfxName;
    if (!this.samples.play(v, key)) medalSting(v, kind, level);
    v.out.connect(this.mixer.hud);
    return this.commit(v, 'hud');
  }

  // ── Replay (killcam / Play of the Match / rewatch) ─────────────────────────
  /** Begin/end the replay audio treatment; `timeScale` < 1 also drops pitch a little. */
  setReplay(on: boolean, timeScale = 1, fade = 0.4) {
    this.mixer.setReplay(on, fade);
    this.replayCents = on && timeScale > 0 && timeScale < 1 ? Math.round(1200 * Math.log2(timeScale) * 0.4) : 0;
  }

  /** A replayed rail shot: the star's own (layered, centred) or someone's at the muzzle (3D). */
  replayShot(x: number, y: number, z: number, star: boolean, vol = 1) {
    return star ? this.railShot(vol) : this.railAt(x, y, z, vol);
  }

  /** A rail striking geometry (a miss), heard at the impact point. */
  railImpactAt(x: number, y: number, z: number, vol = 1) {
    const d = this.mixer.audible(x, y, z, GIB_3D.max);
    if (d < 0) return null;
    const v = this.voice(vol);
    if (!this.samples.play(v, 'wall-impact')) wallImpact(v, this.bank);
    this.mixer.spatial(v, x, y, z, d, GIB_3D);
    return this.commit(v, 'impact');
  }

  /** A replayed frag: the gib + the killer's finisher accent (centred for the star, else 3D). */
  replayGib(x: number, y: number, z: number, style: string, headshot: boolean, star: boolean, vol = 1) {
    if (star) {
      const v = this.voice(vol);
      if (!this.samples.play(v, headshot ? 'kill-headshot' : 'kill')) gib(v, this.bank, headshot, 1);
      this.finisher(v, style);
      this.mixer.toWorld(v, this.mixer.sendLo);
      return this.commit(v, 'self');
    }
    const d = this.mixer.audible(x, y, z, GIB_3D.max);
    if (d < 0) return null;
    const v = this.voice(vol);
    if (!this.samples.play(v, 'kill')) gib(v, this.bank, false, 0.5);
    this.finisher(v, style);
    this.mixer.spatial(v, x, y, z, d, GIB_3D);
    return this.commit(v, 'impact');
  }

  // ── Local movement ─────────────────────────────────────────────────────────
  private finisher(v: Voice, style: string) {
    const key = `finisher-${style}`;
    if (Object.hasOwn(GENERATED_SFX_URLS, key) && this.samples.play(v, key as GeneratedSfxName)) return;
    finisherAccent(v, this.bank, style);
  }

  /**
   * Your own movement. `a` = horizontal speed (step), impact speed (land) or
   * lateral dash direction -1..1 (dash).
   */
  localMove(kind: LocalMoveKind, a = 0, at?: number) {
    if (!Number.isFinite(a)) a = 0; // strengths feed AudioParams (non-finite throws)
    const t = at ?? this.ctx.currentTime;
    const s = this.surface;
    let v: Voice;
    let send: GainNode | null = this.mixer.sendLo;
    switch (kind) {
      case 'step': {
        const k = clamp(a / 10, 0, 1);
        v = this.voice(0.16 * (0.75 + 0.25 * k), t);
        if (!this.samples.play(v, mapSample('step', this.mapId), 0.96 + rnd() * 0.08)) footstep(v, this.bank, s, k);
        // Alternate feet: a slight L/R offset.
        this.stepSide = -this.stepSide;
        const p = v.pan(0.12 * this.stepSide);
        v.out.connect(p).connect(this.mixer.world);
        p.connect(this.mixer.sendLo);
        return this.commit(v, 'local');
      }
      case 'jump': {
        v = this.voice(0.42, t);
        if (!this.samples.play(v, 'jump')) jump(v, this.bank, s);
        break;
      }
      case 'airjump':
        v = this.voice(0.36, t);
        if (!this.samples.play(v, 'airjump')) airJump(v, this.bank);
        break;
      case 'walljump':
        v = this.voice(0.4, t);
        if (!this.samples.play(v, 'walljump')) wallKick(v, this.bank, s);
        break;
      case 'land': {
        if (a < 2.5) return null; // stepping off a kerb
        const k = clamp((a - 3) / 17, 0, 1);
        v = this.voice(0.28 + 0.22 * k, t);
        if (!this.samples.play(v, a >= 12 ? 'land-heavy' : 'land')) land(v, this.bank, s, a);
        send = k > 0.5 ? this.mixer.sendMid : this.mixer.sendLo;
        break;
      }
      case 'dash':
        v = this.voice(0.4, t);
        if (!this.samples.play(v, 'dash')) dash(v, this.bank, clamp(a, -1, 1), true);
        break;
      case 'boost':
        v = this.voice(0.42, t);
        if (!this.samples.play(v, 'boost')) boost(v, this.bank, 1);
        send = this.mixer.sendMid;
        break;
    }
    this.mixer.toWorld(v, send);
    return this.commit(v, 'local');
  }

  // ── Other combatants' movement (3D) ─────────────────────────────────────────
  /** Remote player / bot movement event at their feet. `strength` = speed m/s. */
  remoteMove(kind: MotionEventKind, x: number, y: number, z: number, strength: number, at?: number) {
    if (!Number.isFinite(strength)) return null;
    const opts = kind === 'step' ? STEP_3D : MOVE_3D;
    const d = this.mixer.audible(x, y, z, opts.max);
    if (d < 0) return null;
    const s = this.surface;
    const t = at ?? this.ctx.currentTime;
    let v: Voice;
    switch (kind) {
      case 'step': {
        const k = clamp(strength / 10, 0, 1);
        v = this.voice(0.13 * (0.75 + 0.25 * k), t);
        if (!this.samples.play(v, mapSample('step', this.mapId), 0.96 + rnd() * 0.08)) footstep(v, this.bank, s, k);
        break;
      }
      case 'jump': {
        v = this.voice(0.36, t);
        if (!this.samples.play(v, 'jump')) jump(v, this.bank, s);
        break;
      }
      case 'airjump':
        v = this.voice(0.32, t);
        if (!this.samples.play(v, 'airjump')) airJump(v, this.bank);
        break;
      case 'land': {
        if (strength < 3) return null;
        const k = clamp((strength - 3) / 17, 0, 1);
        v = this.voice(0.2 + 0.16 * k, t);
        if (!this.samples.play(v, strength >= 12 ? 'land-heavy' : 'land')) land(v, this.bank, s, strength);
        break;
      }
      case 'dash':
        v = this.voice(0.34, t);
        if (!this.samples.play(v, 'dash')) dash(v, this.bank, 0, false);
        break;
      case 'boost':
        v = this.voice(0.45, t);
        if (!this.samples.play(v, 'boost')) boost(v, this.bank, 0.5);
        break;
    }
    this.mixer.spatial(v, x, y, z, d, opts);
    return this.commit(v, 'remote');
  }

  dispose() {
    this.stopAmbience(0.05);
    this.charge = null;
  }
}
