// Decode recordings ahead of playback, as the game does. The small media-like
// interface keeps the listening page's transport, seek and playlist controls.
export class BufferedSoundPlayer extends EventTarget {
  #context;
  #gain;
  #source;
  #buffers = new Map();
  #loading = new Map();
  #url = '';
  #buffer;
  #position = 0;
  #startedAt = 0;
  #paused = true;
  #ended = false;
  #loop = false;
  #volume = 0.75;
  #request = 0;
  #selection = 0;
  #frame;

  constructor({ createContext, fetchAudio, requestFrame, cancelFrame } = {}) {
    super();
    this.createContext = createContext ?? (() => new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 0 }));
    this.fetchAudio = fetchAudio ?? ((url) => fetch(url));
    this.requestFrame = requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.cancelFrame = cancelFrame ?? ((id) => cancelAnimationFrame(id));
  }

  #ensureContext() {
    if (!this.#context) {
      this.#context = this.createContext();
      this.#gain = this.#context.createGain();
      this.#gain.gain.value = this.#volume;
      this.#gain.connect(this.#context.destination);
    }
    return this.#context;
  }

  async preload(url) {
    if (this.#buffers.has(url)) return this.#buffers.get(url);
    if (this.#loading.has(url)) return this.#loading.get(url);
    const context = this.#ensureContext();
    const job = (async () => {
      const response = await this.fetchAudio(url);
      if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      this.#buffers.set(url, buffer);
      // Long ambience tracks load on demand; keep browsing memory bounded.
      if (this.#buffers.size > 24) {
        const oldest = [...this.#buffers.keys()].find((key) => key !== this.#url);
        if (oldest) this.#buffers.delete(oldest);
      }
      return buffer;
    })();
    this.#loading.set(url, job);
    try { return await job; }
    finally { this.#loading.delete(url); }
  }

  get src() { return this.#url; }
  set src(url) {
    this.pause();
    const selection = ++this.#selection;
    this.#url = url;
    this.#position = 0;
    this.#ended = false;
    this.#buffer = this.#buffers.get(url);
    void this.preload(url).then((buffer) => {
      if (selection !== this.#selection) return;
      this.#buffer = buffer;
      this.dispatchEvent(new Event('loadedmetadata'));
    }).catch(() => {
      if (selection === this.#selection) this.dispatchEvent(new Event('error'));
    });
  }
  get duration() { return this.#buffer?.duration ?? NaN; }
  get paused() { return this.#paused; }
  get ended() { return this.#ended; }
  get currentTime() {
    if (this.#paused || !this.#context) return this.#position;
    const elapsed = Math.max(0, this.#context.currentTime - this.#startedAt);
    return this.#loop ? elapsed % this.duration : Math.min(elapsed, this.duration);
  }
  set currentTime(position) {
    const playing = !this.#paused;
    this.pause();
    this.#position = Math.max(0, Math.min(position, this.#buffer?.duration ?? 0));
    this.#ended = false;
    this.dispatchEvent(new Event('timeupdate'));
    if (playing) void this.play().catch(() => this.dispatchEvent(new Event('error')));
  }
  get volume() { return this.#volume; }
  set volume(value) {
    this.#volume = Math.max(0, Math.min(value, 1));
    if (this.#gain) this.#gain.gain.value = this.#volume;
  }
  get loop() { return this.#loop; }
  set loop(value) {
    const position = this.currentTime;
    this.#loop = !!value;
    if (this.#source) {
      this.#startedAt = this.#context.currentTime - position;
      this.#source.loop = this.#loop;
    }
  }

  async play() {
    if (!this.#url || !this.#paused) return;
    const request = ++this.#request;
    const url = this.#url;
    const context = this.#ensureContext();
    // Resume inside the click gesture. A warm, running player reaches start()
    // synchronously; no fetch, decode, media-element buffering or timer.
    if (context.state !== 'running') await context.resume();
    const buffer = this.#buffer ?? await this.preload(url);
    if (request !== this.#request || url !== this.#url) return;
    this.#buffer = buffer;
    if (this.#position >= buffer.duration) this.#position = 0;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = this.#loop;
    source.connect(this.#gain);
    source.onended = () => {
      source.disconnect();
      if (this.#source !== source) return;
      this.#source = undefined;
      this.#paused = true;
      this.#ended = true;
      this.#position = buffer.duration;
      this.cancelFrame(this.#frame);
      this.dispatchEvent(new Event('timeupdate'));
      this.dispatchEvent(new Event('ended'));
    };
    this.#startedAt = context.currentTime - this.#position;
    this.#source = source;
    this.#paused = false;
    this.#ended = false;
    source.start(0, this.#position);
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
    const tick = () => {
      if (this.#source !== source) return;
      this.dispatchEvent(new Event('timeupdate'));
      this.#frame = this.requestFrame(tick);
    };
    this.#frame = this.requestFrame(tick);
  }

  pause() {
    ++this.#request;
    this.#position = this.currentTime;
    const wasPlaying = !this.#paused;
    this.#paused = true;
    const source = this.#source;
    this.#source = undefined;
    if (source) source.stop();
    if (this.#frame !== undefined) this.cancelFrame(this.#frame);
    if (wasPlaying) this.dispatchEvent(new Event('pause'));
  }
}
