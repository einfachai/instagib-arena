import { announcerVariantCount } from './announcer-lines';
import { SfxEngine, type LocalMoveKind } from './sfx/engine';
import { GENERATED_SFX_URLS } from './sfx/generated-pack';
import type { MotionEventKind } from './sfx/motion-tracker';
import type { StingKind } from './sfx/stings';

export type SoundClipName =
  | 'fire'
  | 'hit'
  | 'kill'
  | 'reload-ready'
  | 'first-blood'
  | 'double-kill'
  | 'triple-kill'
  | 'quad-kill'
  | 'penta-kill'
  | 'killing-spree'
  | 'rampage'
  | 'dominating'
  | 'unstoppable'
  | 'godlike'
  | 'headshot'
  | 'humiliation'
  | 'comeback'
  | 'match-point'
  | 'victory'
  | 'defeat'
  | 'spawn'
  | 'codex-entered' | 'codex-alone' | 'codex-complete' | 'codex-attention';

// Keep old saved pack IDs readable. Every spoken event resolves to the same
// deep male ElevenLabs announcer, including old Kuon selections.
export type AnnouncerPackId = 'legacy' | 'kuon';
export type AnnouncerPack = { id: AnnouncerPackId; name: string; blurb: string };
export const ANNOUNCER_PACKS: ReadonlyArray<AnnouncerPack> = [
  { id: 'legacy', name: 'Victor · Deep male', blurb: 'Victor, a deep male announcer with expressive arena callouts' },
];
export const DEFAULT_ANNOUNCER_PACK: AnnouncerPackId = 'legacy';

// Public recordings. Weapon playback goes through the spatial gameplay engine.
export const SOUND_URLS: Partial<Record<SoundClipName, string>> = {
  'fire':          GENERATED_SFX_URLS['rail-fire'][0],
  'hit':           '/sounds/elevenlabs-v1/weapon/hit_1.mp3',
  'kill':          '/sounds/elevenlabs-v1/weapon/kill_1.mp3',
  'reload-ready':  '/sounds/elevenlabs-v1/weapon/reload-ready_1.mp3',
  'first-blood':   '/sounds/elevenlabs-v1/announcer/victor/first-blood_1.mp3',
  'double-kill':   '/sounds/elevenlabs-v1/announcer/victor/double-kill_1.mp3',
  'triple-kill':   '/sounds/elevenlabs-v1/announcer/victor/triple-kill_1.mp3',
  'quad-kill':     '/sounds/elevenlabs-v1/announcer/victor/quad-kill_1.mp3',
  'penta-kill':    '/sounds/elevenlabs-v1/announcer/victor/penta-kill_1.mp3',
  'killing-spree': '/sounds/elevenlabs-v1/announcer/victor/killing-spree_1.mp3',
  'rampage':       '/sounds/elevenlabs-v1/announcer/victor/rampage_1.mp3',
  'dominating':    '/sounds/elevenlabs-v1/announcer/victor/dominating_1.mp3',
  'unstoppable':   '/sounds/elevenlabs-v1/announcer/victor/unstoppable_1.mp3',
  'godlike':       '/sounds/elevenlabs-v1/announcer/victor/godlike_1.mp3',
  'headshot':      '/sounds/elevenlabs-v1/announcer/victor/headshot_1.mp3',
  'humiliation':   '/sounds/elevenlabs-v1/announcer/victor/humiliation_1.mp3',
  'comeback':      '/sounds/elevenlabs-v1/announcer/victor/comeback_1.mp3',
  'match-point':   '/sounds/elevenlabs-v1/announcer/victor/match-point_1.mp3',
  'victory':       '/sounds/elevenlabs-v1/announcer/victor/victory_1.mp3',
  'defeat':        '/sounds/elevenlabs-v1/announcer/victor/defeat_1.mp3',
  'spawn':         '/sounds/elevenlabs-v1/announcer/victor/spawn_1.mp3',
  'codex-entered': '/sounds/elevenlabs-v1/announcer/victor/codex-entered_1.mp3',
  'codex-complete': '/sounds/elevenlabs-v1/announcer/victor/codex-complete_1.mp3',
  'codex-alone': '/sounds/elevenlabs-v1/announcer/victor/codex-alone_1.mp3',
  'codex-attention': '/sounds/elevenlabs-v1/announcer/victor/codex-attention_1.mp3',
};

// Which clips are announcer voice lines (vs. weapon SFX). Drives the
// SFX/announcer volume split and the announcer on/off toggle.
const ANNOUNCER_CLIPS: ReadonlySet<SoundClipName> = new Set<SoundClipName>([
  'codex-entered', 'codex-alone', 'codex-complete', 'codex-attention',
  'first-blood',
  'double-kill',
  'triple-kill',
  'quad-kill',
  'penta-kill',
  'killing-spree',
  'rampage',
  'dominating',
  'unstoppable',
  'godlike',
  'headshot',
  'humiliation',
  'comeback',
  'match-point',
  'victory',
  'defeat',
  'spawn',
]);

// Recorded game audio through the shared spatial mixer, with synthesis as a
// loading fallback for nonverbal cues. Spoken callouts use one ElevenLabs voice
// through the announcer bus, limiter and volume controls.
export class SoundManager {
  private ctx: AudioContext | null = null;
  private engine: SfxEngine | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private announcerBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>(); // keyed by resolved URL (pack-aware)
  private loading = new Map<string, Promise<void>>(); // in-flight fetch + decode
  private missing = new Set<string>(); // URLs that 404'd — don't refetch (use fallback)
  private volume = 0.7;
  private sfxVolume = 1;
  private announcerVolume = 1;
  private announcerEnabled = true;
  private pack: AnnouncerPackId = DEFAULT_ANNOUNCER_PACK;
  private mapId = '';
  private lowSpec = false;
  private lastVariant = new Map<SoundClipName, number>(); // avoid repeating a line back-to-back
  // The currently-playing announcer voice source — only ONE announcer line plays
  // at a time (a new line cuts the previous), so multi-kill + headshot + spree
  // never pile up into a garble.
  private announcerSrc: AudioBufferSourceNode | null = null;
  private noticeIds = new Set<string>();
  private speechQueue: { name: SoundClipName; expires: number }[] = [];
  private loadingSpeech = false;
  private speechGeneration = 0;

  async init() {
    if (this.ctx) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      // Request the lowest supported device buffering for combat feedback.
      this.ctx = new AC({ latencyHint: 0 });
      // The engine builds the whole mix graph (SFX + announcer buses → limiter
      // → master volume → destination) synchronously, so sounds work at once.
      this.engine = new SfxEngine(this.ctx);
      this.master = this.engine.mixer.out;
      this.sfxBus = this.engine.mixer.sfxBus;
      this.announcerBus = this.engine.mixer.announcerBus;
      this.engine.setMasterVolume(this.volume);
      this.engine.setSfxVolume(this.sfxVolume);
      this.engine.setAnnouncerVolume(this.announcerVolume);
      this.engine.setLowSpec(this.lowSpec);
      if (this.mapId) this.engine.setMap(this.mapId);
      this.preloadPack();
    } catch {
      // No audio context available — manager becomes a no-op
    }
  }

  // URL of one announcer line variant (1-indexed) for the active pack.
  private announcerVariantUrl(name: SoundClipName, idx: number): string {
    return `/sounds/elevenlabs-v1/announcer/victor/${name}_${idx}.mp3`;
  }

  // Pick a variant index (1..count) for a clip, avoiding an immediate repeat so
  // the same line doesn't fire twice in a row.
  private pickVariant(name: SoundClipName, count: number): number {
    if (count <= 1) return 1;
    let idx = 1 + Math.floor(Math.random() * count);
    if (idx === this.lastVariant.get(name)) idx = (idx % count) + 1;
    this.lastVariant.set(name, idx);
    return idx;
  }

  // Normalize old saved pack selections to the game's single announcer.
  setAnnouncerPack(_id: AnnouncerPackId) {
    const id = DEFAULT_ANNOUNCER_PACK;
    if (id === this.pack) return;
    this.pack = id;
    this.lastVariant.clear();
    this.preloadPack();
  }

  private preloadPack() {
    if (!this.ctx) return;
    for (const name of ANNOUNCER_CLIPS) {
      const count = announcerVariantCount(this.pack, name);
      for (let i = 1; i <= count; i++) void this.loadClip(this.announcerVariantUrl(name, i)).catch(() => {});
    }
  }

  // Cut the current recording so announcer callouts never overlap.
  private stopAnnouncer() {
    if (this.announcerSrc) {
      try { this.announcerSrc.stop(); } catch { /* already stopped */ }
      this.announcerSrc = null;
    }
  }

  announce(name: SoundClipName, id: string) {
    if (this.noticeIds.has(id)) return;
    this.noticeIds.add(id);
    if (this.noticeIds.size > 256) this.noticeIds.delete(this.noticeIds.values().next().value!);
    if (!this.announcerEnabled || this.announcerVolume === 0 || this.volume === 0) return;
    if (name === 'codex-complete' || name === 'codex-attention') { this.speechGeneration++; this.speechQueue.length = 0; this.stopAnnouncer(); }
    this.speechQueue.push({ name, expires: performance.now() + 6000 });
    void this.drainSpeech();
  }

  private async drainSpeech() {
    if (this.announcerSrc || this.loadingSpeech || !this.ctx || !this.announcerEnabled) return;
    while (this.speechQueue[0] && this.speechQueue[0].expires < performance.now()) this.speechQueue.shift();
    const next = this.speechQueue.shift();
    if (!next) return;
    this.loadingSpeech = true;
    const generation = this.speechGeneration;
    try { const url = SOUND_URLS[next.name]; if (url) await this.loadClip(url); } catch { /* Text notice remains available. */ }
    this.loadingSpeech = false;
    if (generation !== this.speechGeneration) { void this.drainSpeech(); return; }
    if (this.announcerSrc) { this.speechQueue.unshift(next); return; }
    if (next.expires > performance.now() && this.ctx && this.announcerEnabled) {
      if (this.play(next.name)) return;
    }
    void this.drainSpeech();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  // Returns whether something audible was started — false when the announcer is
  // off, or a clip has neither a file nor a fallback (callers can substitute a
  // procedural sting so the event never lands silently).
  play(name: SoundClipName, volume = 1): boolean {
    if (!this.ctx || !this.master || !this.engine) return false;
    this.resume();
    const isAnnouncer = ANNOUNCER_CLIPS.has(name);
    if (isAnnouncer && !this.announcerEnabled) return false;
    if (!isAnnouncer) {
      switch (name) {
        case 'fire': this.engine.railShot(volume); return true;
        case 'hit': this.engine.hitTick(false, volume); return true;
        case 'kill': this.engine.kill(false, volume); return true;
        case 'reload-ready': this.engine.ready(volume); return true;
      }
    }
    const bus = (isAnnouncer ? this.announcerBus : this.sfxBus) ?? this.master;
    // Select a recording from the same announcer for every event.
    const variants = isAnnouncer ? announcerVariantCount(this.pack, name) : 0;
    const url = variants > 0 ? this.announcerVariantUrl(name, this.pickVariant(name, variants)) : SOUND_URLS[name];
    const buf = url ? this.buffers.get(url) : undefined;
    if (buf) {
      if (isAnnouncer) this.stopAnnouncer(); // one announcer line at a time
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = clamp01(volume);
      src.connect(g).connect(bus);
      if (isAnnouncer) {
        this.announcerSrc = src;
        src.onended = () => { if (this.announcerSrc === src) { this.announcerSrc = null; void this.drainSpeech(); } };
        this.engine.duck(buf.duration); // ambience dips under the voice
      }
      src.start(0);
      return true;
    }
    // A load miss never switches to browser speech. Preload the recording for
    // the next event; the caller can substitute a nonverbal medal cue.
    if (variants > 0 && url && !this.loading.has(url) && !this.missing.has(url)) {
      void this.loadClip(url).catch(() => {});
    }
    return false;
  }

  // Position + orient the HRTF listener at the camera each frame so spatialized
  // sounds (playAt) pan correctly — `forward` is the look direction, `up` the
  // world up. Call once per render frame from the Game with the live camera pose.
  setListenerPose(
    px: number, py: number, pz: number,
    fx: number, fy: number, fz: number,
    ux: number, uy: number, uz: number,
  ) {
    if (!this.ctx) return;
    this.engine?.setListenerPos(px, py, pz); // distance low-pass + culling
    const L = this.ctx.listener;
    // Modern AudioParam API where available; deprecated setters as a fallback.
    if ('positionX' in L && L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(px, t);
      L.positionY.setValueAtTime(py, t);
      L.positionZ.setValueAtTime(pz, t);
      L.forwardX.setValueAtTime(fx, t);
      L.forwardY.setValueAtTime(fy, t);
      L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(ux, t);
      L.upY.setValueAtTime(uy, t);
      L.upZ.setValueAtTime(uz, t);
    } else {
      const legacy = L as unknown as {
        setPosition: (x: number, y: number, z: number) => void;
        setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      };
      legacy.setPosition(px, py, pz);
      legacy.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // Spatialized one-shot: same clips as play(), but at a world position (HRTF
  // panned, distance-attenuated + low-passed) so you can HEAR where another
  // player is (their rail fire, a nearby frag). `volume` is the at-source
  // level. Announcer lines stay non-positional (centered UI cues).
  playAt(name: SoundClipName, x: number, y: number, z: number, volume = 1) {
    if (!this.ctx || !this.engine) return;
    // Passive (other players') sounds need a running context: built while it's
    // suspended (no user gesture yet — e.g. a fresh spectate link) they'd all
    // fire at once on resume.
    if (this.ctx.state !== 'running' && !ANNOUNCER_CLIPS.has(name)) return;
    if (ANNOUNCER_CLIPS.has(name)) {
      this.play(name, volume);
      return;
    }
    this.resume();
    switch (name) {
      case 'fire': this.engine.railAt(x, y, z, volume); return;
      case 'kill': this.engine.gibAt(x, y, z, volume); return;
      case 'hit': this.engine.hitTick(false, volume); return;
      case 'reload-ready': this.engine.ready(volume); return;
      default: this.play(name, volume); // centered announcer recordings
    }
  }

  // Crisp confirm tick for landing a rail — a higher double tick for headshots.
  hitConfirm(headshot: boolean, volume = 1) {
    if (!this.engine) return;
    this.resume();
    this.engine.hitTick(headshot, volume);
  }

  // Kill confirm (your frag): preserve the distinct headshot recording.
  killConfirm(headshot: boolean, volume = 1) {
    if (!this.engine) return;
    this.resume();
    this.engine.kill(headshot, volume);
  }

  // Someone else's frag, heard at the body (bystander awareness).
  gibAt(x: number, y: number, z: number, volume = 1) {
    if (this.ctx?.state !== 'running') return; // see playAt
    this.engine?.gibAt(x, y, z, volume);
  }

  // You got fragged (also cuts the recharge hum).
  death(volume = 1) {
    if (!this.engine) return;
    this.resume();
    this.engine.death(volume);
  }

  // Rail recharge hum over `seconds` (the cooldown just set by a shot).
  chargeStart(seconds: number) {
    this.engine?.chargeStart(seconds);
  }

  chargeStop() {
    this.engine?.chargeStop();
  }

  // Local movement sounds (footsteps, jump, landing, dash, wall-jump, boost).
  localMove(kind: LocalMoveKind, a = 0) {
    this.engine?.localMove(kind, a);
  }

  // Other players' / bots' movement sounds, positional at their feet.
  remoteMove(kind: MotionEventKind, x: number, y: number, z: number, strength: number) {
    if (this.ctx?.state !== 'running') return; // see playAt
    this.engine?.remoteMove(kind, x, y, z, strength);
  }

  // ── Replay audio (killcam / Play of the Match / rewatch) ───────────────────
  // The replay's own sound set, spatialised from the replay camera (the listener
  // pose follows it). Everything routes through the same SFX bus, so master /
  // SFX volume + mute apply; the treatment (soft low-pass, extra room, boundary
  // fade, slow-mo pitch) is one switch on the mixer.
  replayBegin(timeScale = 1, fade = 0.4) {
    if (!this.engine) return;
    this.resume();
    this.engine.setReplay(true, timeScale, fade);
  }

  replayEnd(fade = 0.4) {
    this.engine?.setReplay(false, 1, fade);
  }

  replayShot(x: number, y: number, z: number, star: boolean, vol = 1) {
    if (this.ctx?.state !== 'running') return;
    this.engine?.replayShot(x, y, z, star, vol);
  }

  replayImpact(x: number, y: number, z: number, vol = 1) {
    if (this.ctx?.state !== 'running') return;
    this.engine?.railImpactAt(x, y, z, vol);
  }

  replayGib(x: number, y: number, z: number, style: string, headshot: boolean, star: boolean, vol = 1) {
    if (this.ctx?.state !== 'running') return;
    this.engine?.replayGib(x, y, z, style, headshot, star, vol);
  }

  // A replayed movement event: the star's own body is centred (as in live play),
  // everyone else's is positional at their feet.
  replayMove(kind: MotionEventKind, x: number, y: number, z: number, strength: number, star: boolean) {
    if (this.ctx?.state !== 'running' || !this.engine) return;
    if (star) this.engine.localMove(kind, kind === 'dash' ? 0 : strength);
    else this.engine.remoteMove(kind, x, y, z, strength);
  }

  // Nonverbal medal cue (used when the announcer can't voice a medal).
  medalSting(kind: StingKind, level: number) {
    if (!this.engine) return;
    this.resume();
    this.engine.medalSting(kind, level);
  }

  // Map id (map.ts registry) → room reverb, floor surface, ambience flavour.
  // Crossfades the ambience if it's already running.
  setMap(id: string) {
    this.mapId = id;
    this.engine?.setMap(id);
  }

  // Start the per-map ambience bed (call when the match starts).
  startAmbience() {
    this.engine?.startAmbience();
  }

  // Fade the ambience bed out (match over / results / map vote).
  stopAmbience(fade = 1.5) {
    this.engine?.stopAmbience(fade);
  }

  // Low-spec: shorter reverb, equal-power panning, fewer concurrent voices.
  setLowSpec(on: boolean) {
    this.lowSpec = on;
    this.engine?.setLowSpec(on);
  }

  setVolume(v: number) {
    this.volume = clamp01(v);
    this.engine?.setMasterVolume(this.volume);
  }

  setSfxVolume(v: number) {
    this.sfxVolume = clamp01(v);
    this.engine?.setSfxVolume(this.sfxVolume);
  }

  setAnnouncerVolume(v: number) {
    this.announcerVolume = clamp01(v);
    this.engine?.setAnnouncerVolume(this.announcerVolume);
  }

  setAnnouncerEnabled(on: boolean) {
    this.announcerEnabled = on;
    if (!on) { this.speechGeneration++; this.speechQueue.length = 0; this.stopAnnouncer(); }
  }

  dispose() {
    this.speechGeneration++;
    this.speechQueue.length = 0;
    this.stopAnnouncer();
    this.engine?.dispose();
    this.engine = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
      this.sfxBus = null;
      this.announcerBus = null;
    }
    this.buffers.clear();
    this.loading.clear();
    this.missing.clear();
    this.lastVariant.clear();
  }

  private loadClip(url: string): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !url || this.buffers.has(url) || this.missing.has(url)) return Promise.resolve();
    const pending = this.loading.get(url);
    if (pending) return pending;
    const job = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        if (this.ctx === ctx) this.buffers.set(url, buf);
      } catch {
        if (this.ctx === ctx) this.missing.add(url);
      } finally {
        this.loading.delete(url);
      }
    })();
    this.loading.set(url, job);
    return job;
  }

}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/* ── Menu / UI sounds ───────────────────────────────────────────────────────
   The recorded cue set for the deck chrome and the rewards reveal (buttons,
   tabs, toggles, modals, toasts, XP ticks, unlock stings…). How each cue sounds
   lives in src/game/sfx/ui-sounds.ts; this bank owns the live context + level.

   It lives on its own AudioContext (there is no Game — and so no SoundManager
   — in the lobby), but follows the same rules as gameplay audio: the context
   is only created/resumed inside a user gesture (unlockUiAudio, wired to the
   first pointerdown/keydown in src/deck-core.ts; or a click-type cue fired
   while the browser reports transient user activation), and its level is
   master × SFX from Settings (setUiVolume), so muting SFX mutes the UI too.
   Timer-driven cues (hover, the rewards reveal, case spins, modal mounts) are
   dropped until the context is actually running, so a page load never queues
   a burst of sounds that fires on the first click. */
import { isGestureUiSound, playUiCue, preloadUiCues, type UiSoundName } from './sfx/ui-sounds';

export type { UiSoundName } from './sfx/ui-sounds';

// The UI set is mixed well below the weapon SFX so it never competes with a
// match (the same settings sliders scale both).
const UI_TRIM = 0.55;

// True while the page holds transient user activation (inside a click / key
// handler). Browsers without the API answer "no": the first pointerdown/keydown
// still unlocks the bank (unlockUiAudio, wired in deck-core), so they lose nothing.
function inUserGesture(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : false;
}

class UiSoundBank {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private master = 0.7;
  private sfx = 1;

  // Create the context (only call from inside a user gesture) and resume it.
  unlock() {
    if (!this.ctx) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.bus = this.ctx.createGain();
        this.bus.gain.value = this.level();
        // A gentle bus compressor: a fast run of cues (XP ticks over a fanfare)
        // can never stack into a spike.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 8;
        comp.ratio.value = 6;
        comp.attack.value = 0.002;
        comp.release.value = 0.12;
        this.bus.connect(comp).connect(this.ctx.destination);
        void preloadUiCues(this.ctx);
      } catch {
        this.ctx = null;
        this.bus = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(master: number, sfx: number) {
    this.master = clamp01(master);
    this.sfx = clamp01(sfx);
    if (this.bus) this.bus.gain.value = this.level();
  }

  private level(): number {
    return this.master * this.sfx * UI_TRIM;
  }

  play(name: UiSoundName, detail = 0) {
    if (typeof window === 'undefined') return;
    if (this.level() <= 0) return;
    // Only a click-type cue fired inside a gesture may create / resume the
    // context; everything else plays only once it is already running.
    if (isGestureUiSound(name) && inUserGesture()) this.unlock();
    if (!this.ctx || !this.bus || this.ctx.state !== 'running') return;
    playUiCue(this.ctx, this.bus, name, this.ctx.currentTime, detail);
  }
}

const uiSounds = new UiSoundBank();

// `detail` is a per-cue parameter: the xpTick line index, the uiToggle new
// state, the countdownTick seconds left, the unlock rarity index… (see
// UiSoundName in src/game/sfx/ui-sounds.ts).
export function playUi(name: UiSoundName, detail?: number) {
  uiSounds.play(name, detail);
}

// Mirror the Settings sliders (master + SFX) onto the UI bank.
export function setUiVolume(master: number, sfx: number) {
  uiSounds.setVolume(master, sfx);
}

// Call from a user gesture (pointerdown / keydown) so the UI context exists
// and is running before the first cue is needed.
export function unlockUiAudio() {
  uiSounds.unlock();
}
