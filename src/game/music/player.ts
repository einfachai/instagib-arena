import catalog from '../../../public/sounds/music/catalog.json';

export const GAMEPLAY_MUSIC = catalog.files[0];
const FADE_SECONDS = 0.08;

/** One streamed recording per SoundManager; never decoded into the SFX bank. */
export class MusicPlayer {
  private readonly media: HTMLAudioElement;
  private readonly source: MediaElementAudioSourceNode;
  private readonly transition: GainNode;
  private active = false;
  private enabled = true;
  private disposed = false;
  private blocked = false;
  private revision = 0;
  private pending: number | null = null;
  private priming = false;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ctx: AudioContext, bus: GainNode, createMedia = () => new Audio()) {
    this.media = createMedia();
    this.media.preload = 'none';
    this.media.loop = true;
    this.media.src = GAMEPLAY_MUSIC.url;
    this.transition = ctx.createGain();
    this.transition.gain.value = 0;
    this.source = ctx.createMediaElementSource(this.media);
    this.source.connect(this.transition).connect(bus);
    this.media.addEventListener('playing', this.onPlaying);
  }

  private get wanted() { return this.active && this.enabled && !this.disposed; }

  private onPlaying = () => {
    // A late media event must never bypass a pause, disable, or disposal.
    if (!this.wanted && !this.priming) {
      this.fade(0, true);
      this.media.pause();
    }
  };

  private clearPauseTimer() {
    if (this.pauseTimer !== null) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  private fade(value: number, immediate = false) {
    const now = this.ctx.currentTime;
    const gain = this.transition.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (immediate) gain.setValueAtTime(value, now);
    else gain.linearRampToValueAtTime(value, now + FADE_SECONDS);
  }

  setActive(on: boolean) {
    if (this.disposed || on === this.active) return;
    this.active = on;
    if (this.wanted) this.start();
    else this.pause();
  }

  setEnabled(on: boolean) {
    if (this.disposed || on === this.enabled) return;
    this.enabled = on;
    if (this.wanted) this.start();
    else this.pause(true); // toggling off is a mute: silence immediately
  }

  /** Invoke synchronously from Play, before pointer-lock's asynchronous event. */
  playFromGesture() {
    if (this.disposed || !this.enabled) return;
    this.blocked = false;
    this.start(true);
  }

  private start(fromGesture = false) {
    this.clearPauseTimer();
    if (this.pending !== null || this.blocked || (!this.wanted && !fromGesture)) return;
    if (!this.media.paused) {
      if (this.wanted) this.fade(1);
      return;
    }
    const request = ++this.revision;
    this.pending = request;
    this.priming = fromGesture && !this.wanted;
    // play() stays inside the gesture; don't await AudioContext.resume() first.
    try {
      const playback = this.media.play();
      void Promise.resolve(playback).then(() => {
        if (request !== this.revision) {
          if (!this.wanted) { this.fade(0, true); this.media.pause(); }
          return;
        }
        this.pending = null;
        this.priming = false;
        if (this.wanted) this.fade(1);
        else { this.fade(0, true); this.media.pause(); }
      }).catch(() => this.reject(request));
    } catch { this.reject(request); }
  }

  private reject(request: number) {
    if (request !== this.revision) return;
    this.pending = null;
    this.priming = false;
    this.blocked = true; // retry only on the next explicit Play gesture
    this.fade(0, true);
    this.media.pause();
  }

  private pause(immediate = false) {
    const loading = this.pending !== null;
    ++this.revision;
    this.pending = null;
    this.priming = false;
    this.clearPauseTimer();
    this.fade(0, immediate || loading || this.media.paused);
    if (immediate || loading || this.media.paused) this.media.pause();
    else this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null;
      if (!this.wanted) this.media.pause();
    }, FADE_SECONDS * 1000);
  }

  /** An online vote starts a new match within the same Game instance. */
  reset() {
    if (this.disposed) return;
    this.active = false;
    this.pause(true);
    this.media.currentTime = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pause(true);
    this.media.removeEventListener('playing', this.onPlaying);
    this.media.removeAttribute('src');
    this.media.load(); // abort downloads and release the recording
    this.source.disconnect();
    this.transition.disconnect();
  }
}
