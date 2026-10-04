import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferedSoundPlayer } from '../public/sound-buffer-player.js';

function harness(fetchAudio = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })) {
  const sources = [];
  let downloads = 0, decodes = 0;
  const gain = { gain: { value: 1 }, connect() {} };
  const context = {
    state: 'running', currentTime: 10, destination: {},
    createGain: () => gain,
    async resume() { this.state = 'running'; },
    async decodeAudioData() { decodes++; return { duration: 1.2 }; },
    createBufferSource() {
      const source = {
        connect() {}, disconnect() {},
        start(when, offset) { this.startArgs = [when, offset]; },
        stop() { this.stopped = true; queueMicrotask(() => this.onended?.()); },
      };
      sources.push(source);
      return source;
    },
  };
  const player = new BufferedSoundPlayer({
    createContext: () => context,
    fetchAudio: (url) => { downloads++; return fetchAudio(url); },
    requestFrame: () => 1, cancelFrame() {},
  });
  return { player, context, gain, sources, downloads: () => downloads, decodes: () => decodes };
}

test('a predecoded recording starts synchronously on every Play without another download', async () => {
  const h = harness();
  await h.player.preload('/shot.mp3');
  h.player.src = '/shot.mp3';
  const playing = h.player.play();
  assert.equal(h.sources.length, 1, 'warm playback must not wait for a fetch or timer');
  assert.deepEqual(h.sources[0].startArgs, [0, 0]);
  await playing;
  h.player.pause();
  h.player.currentTime = 0;
  const replaying = h.player.play();
  assert.equal(h.sources.length, 2);
  await replaying;
  assert.equal(h.downloads(), 1);
  assert.equal(h.decodes(), 1);
  assert.equal(h.player.paused, false, 'the stopped source must not end the new one');
  h.player.pause();
});

test('stopping while a recording loads prevents delayed playback later', async () => {
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const h = harness(() => response);
  h.player.src = '/slow.mp3';
  const playing = h.player.play();
  h.player.pause();
  release({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  await playing;
  assert.equal(h.sources.length, 0);
  assert.equal(h.player.paused, true);
});

test('changing selection cannot play a previous download after the new sound', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const h = harness((url) => url === '/old.mp3' ? slow : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
  h.player.src = '/old.mp3';
  const oldPlayback = h.player.play();
  const selectedBuffer = await h.player.preload('/new.mp3');
  h.player.src = '/new.mp3';
  await h.player.play();
  release({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  await oldPlayback;
  assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].buffer, selectedBuffer);
  assert.equal(h.player.src, '/new.mp3');
  h.player.pause();
});

test('pause, seek, loop, volume and natural completion preserve transport behavior', async () => {
  const h = harness();
  await h.player.preload('/cue.mp3');
  h.player.src = '/cue.mp3';
  await h.player.play();
  h.context.currentTime += 0.4;
  h.player.pause();
  assert.ok(Math.abs(h.player.currentTime - 0.4) < 0.0001);
  h.player.currentTime = 0.7;
  await h.player.play();
  assert.deepEqual(h.sources[1].startArgs, [0, 0.7]);
  h.player.loop = true;
  assert.equal(h.sources[1].loop, true);
  h.context.currentTime += 1.4;
  assert.ok(Math.abs(h.player.currentTime - 0.9) < 0.0001);
  h.player.volume = 0.35;
  assert.equal(h.gain.gain.value, 0.35);
  h.player.loop = false;
  h.sources[1].onended();
  assert.equal(h.player.ended, true);
  assert.equal(h.player.paused, true);
  await h.player.play();
  assert.deepEqual(h.sources[2].startArgs, [0, 0]);
  h.player.pause();
});
