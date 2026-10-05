import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GAMEPLAY_MUSIC, MusicPlayer } from '../src/game/music/player';
import { gameplayMusicActive, type MusicActivity } from '../src/game/music/activity';
import { Mixer } from '../src/game/sfx/mixer';
import { SfxEngine } from '../src/game/sfx/engine';
import { SoundManager } from '../src/game/audio';
import { DEFAULT_SETTINGS, decodeSettings, encodeSettings } from '../src/settings/codec';
import { loadSettings, saveSettings, SETTINGS_KEY } from '../src/settings/storage';

class Param {
  value = 1;
  events: [string, number, number, number?][] = [];
  cancelScheduledValues(time: number) { this.events.push(['cancel', 0, time]); }
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push(['ramp', value, time]); }
  setTargetAtTime(value: number, time: number, constant: number) { this.events.push(['target', value, time, constant]); }
}
class Node {
  gain = new Param();
  frequency = new Param();
  Q = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  connections: Node[] = [];
  disconnected = false;
  connect(node: Node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
}
function context() {
  const gains: Node[] = [], sources: Node[] = [], limiters: Node[] = [];
  const ctx = {
    currentTime: 10, destination: new Node(),
    createGain() { const node = new Node(); gains.push(node); return node; },
    createMediaElementSource() { const node = new Node(); sources.push(node); return node; },
    createConvolver: () => new Node(), createBiquadFilter: () => new Node(), createWaveShaper: () => new Node(),
    createDynamicsCompressor() { const node = new Node(); limiters.push(node); return node; },
  };
  return { ctx: ctx as unknown as AudioContext, gains, sources, limiters };
}
class Media extends EventTarget {
  paused = true;
  currentTime = 0;
  src = '';
  loop = false;
  preload = '';
  playCalls = 0;
  unloaded = false;
  playJob: () => Promise<void> = () => Promise.resolve();
  play() { this.playCalls++; this.paused = false; return this.playJob(); }
  pause() { this.paused = true; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  load() { this.unloaded = true; }
}
function harness() {
  const h = context();
  const media = new Media(), bus = new Node();
  const player = new MusicPlayer(h.ctx, bus as unknown as GainNode, () => media as unknown as HTMLAudioElement);
  return { ...h, player, media, bus, transition: h.gains[0] };
}
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test('music catalog references the unchanged supplied song and the preview uses the same catalog', async () => {
  const song = await readFile(new URL(`../public${GAMEPLAY_MUSIC.url}`, import.meta.url));
  assert.equal(song.length, GAMEPLAY_MUSIC.bytes);
  assert.equal(createHash('sha256').update(song).digest('hex'), GAMEPLAY_MUSIC.sha256);
  assert.equal(GAMEPLAY_MUSIC.filename, 'kiravale-action-music-598107.mp3');
  assert.equal(GAMEPLAY_MUSIC.duration, 109.632);
  assert.equal(GAMEPLAY_MUSIC.provider, 'user-provided');
  const preview = await readFile(new URL('../public/sound-effects.js', import.meta.url), 'utf8');
  assert.ok(preview.includes('/sounds/music/catalog.json'));
});

test('saved music controls, older settings and share codes retain defaults and choices', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } } });
  try {
    assert.equal(loadSettings().musicEnabled, true);
    assert.equal(loadSettings().musicVolume, 0.3);
    const choices = { ...DEFAULT_SETTINGS, musicEnabled: false, musicVolume: 0.62 };
    saveSettings(choices);
    assert.equal(loadSettings().musicEnabled, false);
    assert.equal(loadSettings().musicVolume, 0.62);
    assert.deepEqual(decodeSettings(encodeSettings(choices)), choices);
    const old = { volume: 0.4, sfxVolume: 0.8 };
    storage.set(SETTINGS_KEY, JSON.stringify(old));
    assert.equal(loadSettings().musicVolume, 0.3);
    assert.equal(loadSettings().musicEnabled, true);
    const oldCode = `IGS-${btoa(JSON.stringify(old))}`;
    assert.equal(decodeSettings(oldCode)?.musicVolume, 0.3);
    assert.equal(decodeSettings(oldCode)?.musicEnabled, true);
    assert.equal(decodeSettings(oldCode)?.volume, 0.4);
    storage.set(SETTINGS_KEY, JSON.stringify({ musicVolume: 5, musicEnabled: 'no' }));
    assert.equal(loadSettings().musicVolume, 1);
    assert.equal(loadSettings().musicEnabled, true);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('full song loops in one media source; pauses, disabling and resuming hold position, resets start at zero', async (t) => {
  const h = harness();
  t.after(() => h.player.dispose());
  assert.equal(h.media.src, GAMEPLAY_MUSIC.url);
  assert.equal(h.media.loop, true);
  assert.equal(h.media.preload, 'none');
  assert.equal(h.media.playCalls, 0);
  h.player.setActive(true);
  await flush();
  h.media.currentTime = 42;
  h.player.setActive(false);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(h.media.paused, true);
  assert.equal(h.media.currentTime, 42);
  h.player.setActive(true);
  await flush();
  assert.equal(h.media.currentTime, 42);
  h.player.setEnabled(false);
  assert.equal(h.transition.gain.value, 0, 'disabling silences immediately');
  assert.equal(h.media.paused, true);
  assert.equal(h.media.currentTime, 42);
  h.player.setEnabled(true);
  await flush();
  assert.equal(h.media.paused, false);
  assert.equal(h.media.currentTime, 42);
  h.player.reset();
  assert.equal(h.media.currentTime, 0);
  assert.equal(h.media.paused, true);
  h.player.setActive(true);
  await flush();
  assert.equal(h.sources.length, 1);
  assert.ok(h.transition.gain.events.some(([kind, value]) => kind === 'ramp' && value === 1));
  const next = harness();
  assert.equal(next.media.currentTime, 0);
  next.player.dispose();
});

test('pending play cannot restart after pausing, disabling, resetting or disposing', async () => {
  for (const action of ['pause', 'disable', 'reset', 'dispose']) {
    const h = harness();
    let resolve!: () => void;
    h.media.playJob = () => new Promise<void>((done) => { resolve = done; });
    h.player.setActive(true);
    if (action === 'pause') h.player.setActive(false);
    if (action === 'disable') h.player.setEnabled(false);
    if (action === 'reset') h.player.reset();
    if (action === 'dispose') h.player.dispose();
    h.media.paused = false; // simulate a delayed browser start
    h.media.dispatchEvent(new Event('playing'));
    resolve();
    await flush();
    assert.equal(h.media.paused, true, action);
    assert.equal(h.transition.gain.value, 0, action);
    h.player.dispose();
    assert.equal(h.media.src, '');
    assert.equal(h.media.unloaded, true);
    assert.equal(h.sources[0].disconnected, true);
    h.player.playFromGesture();
    assert.equal(h.media.playCalls, 1);
  }
});

test('a rejected playback retries only on Play, and a stale rejection cannot silence a newer start', async (t) => {
  const h = harness();
  t.after(() => h.player.dispose());
  h.media.playJob = () => Promise.reject(new Error('NotAllowedError'));
  h.player.setActive(true);
  await flush(); await flush();
  h.player.setActive(false); h.player.setActive(true);
  assert.equal(h.media.playCalls, 1);
  h.media.playJob = () => Promise.resolve();
  h.player.playFromGesture();
  assert.equal(h.media.playCalls, 2, 'gesture retries synchronously');
  await flush();
  assert.equal(h.media.paused, false);
  h.player.setEnabled(false); h.player.setEnabled(true);
  await flush();
  h.player.setEnabled(false);
  let reject!: (error: Error) => void;
  h.media.playJob = () => new Promise<void>((_, fail) => { reject = fail; });
  h.player.setEnabled(true);
  h.player.setEnabled(false);
  h.media.playJob = () => Promise.resolve();
  h.player.setEnabled(true);
  await flush();
  reject(new Error('AbortError'));
  await flush(); await flush();
  assert.equal(h.media.paused, false);
  assert.equal(h.transition.gain.value, 1);
});

test('Play primes the media silently while pointer lock is pending, then activates it without another source', async (t) => {
  const h = harness();
  t.after(() => h.player.dispose());
  let resolve!: () => void;
  h.media.playJob = () => new Promise<void>((done) => { resolve = done; });
  h.player.playFromGesture();
  assert.equal(h.media.playCalls, 1);
  assert.equal(h.transition.gain.value, 0);
  h.player.setActive(true);
  resolve(); await flush();
  assert.equal(h.media.playCalls, 1);
  assert.equal(h.transition.gain.value, 1);
});

test('gameplay activity includes warmup/respawn but excludes loading, pause, lost focus, hidden tabs and post-match states', () => {
  const active: MusicActivity = { started: true, arenaReady: true, locked: true, focused: true, hidden: false, spectator: false, matchOver: false, voting: false, postMatchReplay: false, networkReady: true, photoMode: false };
  assert.equal(gameplayMusicActive(active), true);
  for (const field of Object.keys(active) as (keyof MusicActivity)[]) {
    assert.equal(gameplayMusicActive({ ...active, [field]: !active[field] }), false, field);
  }
});

test('music bypasses SFX and replay processing, shares the limiter/master, and ducks with ambience independently of volume', () => {
  const h = context();
  const mixer = new Mixer(h.ctx);
  const musicBus = mixer.musicBus as unknown as Node;
  const musicDuck = musicBus.connections[0];
  const mix = musicDuck.connections[0];
  assert.equal((mixer.announcerBus as unknown as Node).connections[0], mix);
  assert.equal(mix.connections[0], h.limiters[0]);
  assert.equal(h.limiters[0].connections[0].connections[0], mixer.out);
  const engine = Object.create(SfxEngine.prototype) as SfxEngine;
  Object.defineProperty(engine, 'mixer', { value: mixer });
  const manager = new SoundManager();
  Object.defineProperty(manager, 'engine', { value: engine });
  manager.setMusicVolume(0.6);
  manager.setSfxVolume(0);
  manager.setAnnouncerVolume(0.8);
  assert.equal(musicBus.gain.value, 0.6);
  assert.equal(mixer.sfxBus.gain.value, 0);
  assert.equal(mixer.announcerBus.gain.value, 0.8);
  manager.setVolume(0);
  assert.equal(mixer.out.gain.value, 0, 'master mute is immediate');
  mixer.duck(2);
  const ambienceDuck = (mixer.ambience as unknown as Node).connections[0];
  assert.deepEqual(musicDuck.gain.events, ambienceDuck.gain.events);
  assert.deepEqual(musicDuck.gain.events.slice(-2), [['target', 0.3, 10, 0.05], ['target', 1, 12, 0.35]]);
  assert.equal(musicBus.gain.value, 0.6);
  manager.setMusicVolume(0);
  assert.equal(musicBus.gain.value, 0, 'music volume mute is immediate');
  assert.equal(mixer.announcerBus.gain.value, 0.8);
  manager.setMusicVolume(0.4);
  mixer.setReplay(true);
  assert.equal(musicBus.gain.value, 0.4);
});
