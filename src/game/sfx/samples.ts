// Decoded ElevenLabs recordings, shared by the game and offline audio previews.
// Missing recordings use the existing synthesis while a preload is in flight.
import { GENERATED_SFX_URLS, type GeneratedSfxName } from './generated-pack';
import { rnd, type AC, type Voice } from './core';

const banks = new WeakMap<AC, SampleBank>();

export function sampleBank(ctx: AC): SampleBank {
  let bank = banks.get(ctx);
  if (!bank) {
    bank = new SampleBank(ctx);
    banks.set(ctx, bank);
  }
  return bank;
}

export class SampleBank {
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<void>>();
  private failed = new Set<string>();
  private last = new Map<GeneratedSfxName, number>();

  constructor(private readonly ctx: AC) {}

  async preload(names: readonly GeneratedSfxName[]): Promise<void> {
    const urls = [...new Set(names.flatMap((name) => [...GENERATED_SFX_URLS[name]]))];
    // Bound decoding and network work, including on lower-end machines.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, urls.length) }, async () => {
      while (next < urls.length) await this.load(urls[next++]);
    }));
  }

  private load(url: string): Promise<void> {
    if (this.buffers.has(url) || this.failed.has(url)) return Promise.resolve();
    const pending = this.loading.get(url);
    if (pending) return pending;
    const job = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Audio HTTP ${res.status}`);
        const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(url, buffer);
      } catch {
        this.failed.add(url);
      } finally {
        this.loading.delete(url);
      }
    })();
    this.loading.set(url, job);
    return job;
  }

  buffer(name: GeneratedSfxName): AudioBuffer | undefined {
    const ready = GENERATED_SFX_URLS[name].map((url) => this.buffers.get(url)).filter((b): b is AudioBuffer => !!b);
    if (!ready.length) return undefined;
    let i = Math.floor(rnd() * ready.length);
    if (ready.length > 1 && i === this.last.get(name)) i = (i + 1) % ready.length;
    this.last.set(name, i);
    return ready[i];
  }

  /** Attach a recording to the existing Voice so pooling, 3D and replays apply. */
  play(v: Voice, name: GeneratedSfxName, rate = 1, loopSeconds?: number): boolean {
    const buffer = this.buffer(name);
    if (!buffer) {
      void this.preload([name]);
      return false;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const duration = loopSeconds ?? buffer.duration / rate;
    if (loopSeconds !== undefined) {
      src.loop = true;
      const gain = v.gain(0, v.out);
      const fade = Math.min(0.06, duration / 4);
      gain.gain.setValueAtTime(0, v.t);
      gain.gain.linearRampToValueAtTime(1, v.t + fade);
      gain.gain.setValueAtTime(1, v.t + duration - fade);
      gain.gain.linearRampToValueAtTime(0, v.t + duration);
      src.connect(gain);
    } else src.connect(v.out);
    src.start(v.t);
    src.stop(v.t + duration);
    v.srcs.push(src);
    v.end = Math.max(v.end, v.t + duration);
    return true;
  }
}

export class RecordedAmbience {
  private readonly src: AudioBufferSourceNode;
  private readonly gain: GainNode;
  private stopped = false;

  constructor(private readonly ctx: AC, buffer: AudioBuffer, dest: AudioNode, fadeIn: number) {
    this.src = ctx.createBufferSource();
    this.src.buffer = buffer;
    this.src.loop = true;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0, ctx.currentTime);
    this.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeIn);
    this.src.connect(this.gain).connect(dest);
    this.src.onended = () => {
      this.src.disconnect();
      this.gain.disconnect();
    };
    this.src.start();
  }

  stop(fade: number) {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelAndHoldAtTime(t);
    this.gain.gain.linearRampToValueAtTime(0, t + Math.max(0, fade));
    this.src.stop(t + Math.max(0, fade) + 0.01);
  }
}

export function mapSample(kind: 'step' | 'ambience', map: string): GeneratedSfxName {
  const key = `${kind}-${map}`;
  return (Object.hasOwn(GENERATED_SFX_URLS, key) ? key : `${kind}-default`) as GeneratedSfxName;
}
