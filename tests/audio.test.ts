import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { ANNOUNCER_PACK_LINES, announcerVariantCount } from '../src/game/announcer-lines';
import { SOUND_URLS, type SoundClipName } from '../src/game/audio';
import { GENERATED_SFX_URLS } from '../src/game/sfx/generated-pack';
import { mapSample } from '../src/game/sfx/samples';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'public/sounds/elevenlabs-v1/manifest.json'), 'utf8')) as {
  files: { key: string; path: string; generation_id: string; duration: number; peak_db: number; voice_id?: string }[];
};
const plan = JSON.parse(await readFile(resolve(root, 'docs/audio-generation.json'), 'utf8')) as {
  announcer: { voice_id: string };
  effects: { key: string; type: string; category: string }[];
};

test('every enabled game sound has a non-silent ElevenLabs recording', async () => {
  for (const event of plan.effects) {
    const files = manifest.files.filter((file) => file.key === event.key);
    assert.ok(files.length, `Missing ${event.key}`);
    for (const file of files) {
      assert.ok(file.generation_id, `${event.key} lacks generation provenance`);
      assert.ok(file.duration > 0.02, `${event.key} is empty`);
      assert.ok(file.peak_db <= -3, `${event.key} exceeds its audio ceiling`);
      assert.ok((await stat(resolve(root, file.path))).size > 512, `${file.path} is empty`);
    }
  }
});

test('runtime sound URLs all point to shipped recordings', async () => {
  const urls = [...Object.values(GENERATED_SFX_URLS).flat(), ...Object.values(SOUND_URLS).filter((url): url is string => !!url)];
  for (const url of new Set(urls)) {
    assert.ok(url.startsWith('/sounds/elevenlabs-v1/'), `Unexpected audio pack: ${url}`);
    assert.ok((await stat(resolve(root, `public${url}`))).size > 512, `Missing ${url}`);
  }
});

test('game playback uses the manifest selections rather than older replacement files', () => {
  const selected = manifest.files
    .filter((file) => !file.path.includes('/announcer/'))
    .map((file) => file.path.replace(/^public/, ''))
    .sort();
  assert.deepEqual([...Object.values(GENERATED_SFX_URLS).flat()].sort(), selected);
  assert.equal(SOUND_URLS.fire, GENERATED_SFX_URLS['rail-fire'][0]);
});

test('every spoken callout uses Victor, including Codex notices and old pack selections', () => {
  assert.equal(plan.announcer.voice_id, 'cPoqAvGWCPfCfyPMwe4z');
  const spoken = plan.effects.filter((event) => event.type === 'tts');
  assert.deepEqual(new Set(spoken.map((event) => event.key)), new Set(Object.keys(ANNOUNCER_PACK_LINES.legacy)));
  for (const event of spoken) {
    const file = manifest.files.find((file) => file.key === event.key);
    assert.equal(file?.voice_id, plan.announcer.voice_id, `${event.key} changes announcer`);
    assert.equal(SOUND_URLS[event.key as SoundClipName], file?.path.replace(/^public/, ''));
    assert.ok(announcerVariantCount('legacy', event.key as SoundClipName) > 0);
  }
  assert.deepEqual(ANNOUNCER_PACK_LINES.kuon, ANNOUNCER_PACK_LINES.legacy);
});

test('unknown maps retain a valid footstep and ambience fallback', () => {
  assert.equal(mapSample('step', 'custom-map'), 'step-default');
  assert.equal(mapSample('ambience', 'custom-map'), 'ambience-default');
  assert.equal(mapSample('step', 'reactor'), 'step-reactor');
});
