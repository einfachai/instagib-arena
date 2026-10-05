import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, before, afterEach } from 'node:test';
import * as THREE from 'three';
import { preloadCharacterAssets } from '../src/game/character/assets';
import { preloadR01Assets } from '../src/game/gun/r01-assets';
import { Character } from '../src/game/character/character';
import { CharacterAnimator } from '../src/game/character-anim';
import { setCharacterFxQuality, setGibFloorProbe } from '../src/game/character/gibs';
import { LocalDeathImpact } from '../src/game/death-impact';
import { Bot, loadBotModel } from '../src/game/bots';
import { CAUSEWAY } from '../src/game/arena-map-data';
import { RemotePlayer } from '../src/game/remote-player';
import type { RemotePlayerSnapshot } from '../src/game/net';
import { ReplayPlayer, type ReplaySource, type ReplaySfx } from '../src/game/replay';

before(async () => {
  // Real meshes and corpse physics; only canvas drawing is stubbed for Node.
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, clearRect() {}, measureText: () => ({ width: 24 }), beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {}, fillText() {} };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) } as unknown as Document;
  const NativeRequest = globalThis.Request;
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) { super(typeof input === 'string' ? new URL(input, 'http://impact.test') : input, init); }
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? new URL(input.url) : new URL(String(input), 'http://impact.test');
    return new Response(await readFile(process.cwd() + '/public' + url.pathname));
  }) as typeof fetch;
  globalThis.ProgressEvent = class extends Event {
    lengthComputable = false; loaded = 0; total = 0;
    constructor(type: string, init: ProgressEventInit = {}) { super(type); Object.assign(this, init); }
  } as typeof ProgressEvent;
  await preloadR01Assets(async () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
  await preloadCharacterAssets();
});
afterEach(() => {
  setGibFloorProbe(null);
  setCharacterFxQuality({ reducedEffects: false, lowSpec: false });
});

const advance = (step: (dt: number) => void, seconds = 2) => {
  for (let i = 0; i < seconds * 120; i++) step(1 / 120);
};

test('one downward ground impact per corpse survives bounces, transforms and respawn', () => {
  const ch = new Character(), anim = new CharacterAnimator(ch), group = new THREE.Group();
  group.position.set(14, 3, -8); group.rotation.y = 0.8; group.add(ch.root);
  const contacts: THREE.Vector3[] = [];
  anim.onDeathGroundImpact = (x, y, z) => contacts.push(new THREE.Vector3(x, y, z));
  const die = () => {
    anim.update({ dt: 0, yaw: 0.4, pitch: 0, pos: group.position, grounded: true, velocity: { x: 2, y: 0, z: -1 } });
    anim.die({ y: 3 }, 'gibstorm');
  };
  die(); assert.equal(contacts.length, 0, 'Death start must stay silent');
  advance(dt => anim.updateStatic(dt));
  assert.equal(contacts.length, 1, 'Other fragments and bounces repeated the sound');
  assert(Math.abs(contacts[0].y - 3) < 1e-6);
  assert(contacts[0].distanceTo(group.position) < 3, 'Contact was not transformed into world space');
  anim.respawn(); die(); advance(dt => anim.updateStatic(dt));
  assert.equal(contacts.length, 2, 'Respawn failed to reset the impact latch');
  anim.dispose(); ch.dispose();
});

test('no floor and disappearing finishers have no ground impact, including low quality', () => {
  const ch = new Character(), anim = new CharacterAnimator(ch);
  let impacts = 0;
  anim.onDeathGroundImpact = () => impacts++;
  for (const style of ['pulse', 'vaporize', 'derez'] as const) {
    anim.respawn();
    anim.update({ dt: 0, yaw: 0, pitch: 0, pos: new THREE.Vector3(), grounded: true });
    anim.die(style === 'pulse' ? null : { y: 0 }, style);
    advance(dt => anim.updateStatic(dt));
    assert.equal(impacts, 0, style + ' invented a ground contact');
  }
  setCharacterFxQuality({ reducedEffects: true, lowSpec: true });
  anim.respawn(); anim.die({ y: 0 }, 'pulse'); advance(dt => anim.updateStatic(dt));
  assert.equal(impacts, 1);
  anim.dispose(); ch.dispose();
});

test('the prewarmed local victim uses the captured death pose and cancels on reset/disposal', () => {
  const contacts: THREE.Vector3[] = [];
  const local = new LocalDeathImpact('codex', (x, y, z) => contacts.push(new THREE.Vector3(x, y, z)));
  const pose = { pos: { x: 10, y: 2, z: -7 }, velocity: { x: 3, y: 0, z: 0 }, yaw: 0.5, pitch: 0.2, grounded: true };
  local.die(pose, { y: 2 }, 'pulse');
  pose.pos.x = 80; // the live player respawned somewhere else
  advance(dt => local.update(dt));
  assert.equal(contacts.length, 1); assert(Math.abs(contacts[0].y - 2) < 1e-6);
  assert(Math.abs(contacts[0].x - 10) < 3);
  local.die(pose, { y: 2 }, 'pulse'); local.reset(); advance(dt => local.update(dt));
  assert.equal(contacts.length, 1);
  local.die(pose, { y: 2 }, 'pulse'); local.dispose(); advance(dt => local.update(dt));
  assert.equal(contacts.length, 1);
});

function snapshot(id: string, pos: { x: number; y: number; z: number }): RemotePlayerSnapshot {
  return { id, name: id, pos, yaw: 0.4, pitch: 0, frags: 0, deaths: 1, invulnMs: 0, team: null, hat: 'hat.none', unusual: 'unusual.none', emote: '', nameColor: 'name.default', spawnEffect: '', title: '', railColor: '', railgunFinish: '', crosshair: '', ping: 0, admin: false, verified: false, receivedAt: 0 };
}

test('remote killer/bystander corpses impact at the kill position once despite missing or newer snapshots', async () => {
  setGibFloorProbe(() => 0);
  const scene = new THREE.Scene(), actor = new RemotePlayer('victim', 'Victim', scene, await loadBotModel());
  const contacts: THREE.Vector3[] = [];
  actor.onDeathGroundImpact = (x, y, z) => contacts.push(new THREE.Vector3(x, y, z));
  actor.apply(snapshot('victim', { x: 35, y: 0, z: -40 }), 1 / 60);
  actor.markDead('pulse', { x: 3, y: 0, z: -5 });
  advance(dt => actor.advanceDeathWithoutSnapshot(dt), 0.1);
  actor.markDead('pulse', { x: 35, y: 0, z: -40 }); // duplicate broadcast
  advance(dt => actor.advanceDeathWithoutSnapshot(dt));
  assert.equal(contacts.length, 1);
  assert(contacts[0].distanceTo(new THREE.Vector3(3, 0, -5)) < 3);
  actor.apply(snapshot('victim', { x: 35, y: 0, z: -40 }), 1 / 60);
  actor.markDead('pulse'); advance(dt => actor.advanceDeathWithoutSnapshot(dt));
  assert.equal(contacts.length, 2);
  actor.apply(snapshot('victim', { x: 35, y: 0, z: -40 }), 1 / 60);
  setGibFloorProbe(() => null); actor.markDead('pulse'); advance(dt => actor.advanceDeathWithoutSnapshot(dt));
  assert.equal(contacts.length, 2, 'A missing floor became an imaginary contact');
  actor.dispose(scene);
});

test('bot deaths use the same collision cue and reset it on their next life', async () => {
  const scene = new THREE.Scene(), bot = new Bot('bot', 'Bot', CAUSEWAY.spawn, scene, await loadBotModel());
  let impacts = 0;
  bot.onDeathGroundImpact = () => impacts++;
  bot.step(1 / 60, CAUSEWAY, [], true);
  const finishDeath = () => {
    for (let i = 0; i < 480 && !bot.state.alive; i++) bot.step(1 / 120, CAUSEWAY, []);
    assert(bot.state.alive);
  };
  bot.kill('pulse'); bot.kill('pulse'); finishDeath();
  assert.equal(impacts, 1);
  // Test the newly spawned life before the AI can jump away from its floor.
  bot.kill('pulse'); finishDeath();
  assert.equal(impacts, 2);
  bot.dispose(scene);
});

test('forward replays impact once; pause, seek reconstruction and returned pool actors stay silent', async () => {
  setGibFloorProbe(() => 0);
  const model = await loadBotModel(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const actor = new RemotePlayer('victim', 'Victim', scene, model);
  let impacts = 0;
  const sfx: ReplaySfx = { shot() {}, kill() {}, move() {}, groundImpact() { impacts++; } };
  const pose = (x: number, visible = true, y = 0) => ({ x, y, z: 0, yaw: 0, pitch: 0, visible });
  const kill = { t: 0.5, killerId: 'star', victimId: 'victim', headshot: false, killerName: 'Star', victimName: 'Victim' };
  const src: ReplaySource = {
    profiles: new Map([['victim', { id: 'victim', name: 'Victim', kind: 'remote', hat: 'hat.none', unusual: 'unusual.none', nameColor: 'name.default', team: null }]]),
    frames: [0, 0.4, 0.5, 0.6, 1, 2, 3].map(t => ({ t, poses: { victim: pose(5, t < 0.5, 1), star: pose(0) } })), kills: [kill], shots: [],
  };
  const player = new ReplayPlayer({ scene, camera, botModel: model, acquireActor: () => actor, releaseActor() {}, spawnBeam() {}, spawnMuzzleFlash() {}, spawnKillEffect() {}, reducedEffects: () => false, sfx });
  player.start({ starId: 'star', starName: 'Star', label: 'Test', startT: 0, endT: 3, kills: [kill] }, src, { holdAtEnd: true });
  advance(dt => player.update(dt), 0.55); player.pause(); advance(dt => player.update(dt));
  assert.equal(impacts, 0, 'Paused corpse kept falling');
  player.resume(); advance(dt => player.update(dt), 1);
  assert.equal(impacts, 1);
  player.seek(0.8); player.update(0); advance(dt => player.update(dt), 1);
  assert.equal(impacts, 1, 'Seeking reconstructed an audible death');
  player.seek(0); player.update(0); advance(dt => player.update(dt), 1.8);
  assert.equal(impacts, 2, 'Replaying a death failed to reset the cue');
  player.dispose();
  actor.resetAnimationTimeline(); actor.apply(snapshot('victim', { x: 0, y: 0, z: 0 }), 1 / 60);
  actor.markDead('pulse'); advance(dt => actor.advanceDeathWithoutSnapshot(dt));
  assert.equal(impacts, 2, 'A pooled actor retained the disposed replay callback');
  actor.dispose(scene);
});

test('a first-person replay victim has a collision-driven cue too', async () => {
  setGibFloorProbe(() => 0);
  const model = await loadBotModel(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  let impacts = 0;
  const pose = (visible: boolean) => ({ x: 4, y: 0, z: -3, yaw: 0, pitch: 0, visible });
  const kill = { t: 0.3, killerId: 'other', victimId: 'star', headshot: false, killerName: 'Other', victimName: 'Star' };
  const src: ReplaySource = { profiles: new Map(), frames: [0, 0.2, 0.3, 1, 2].map(t => ({ t, poses: { star: pose(t < 0.3) } })), kills: [kill], shots: [] };
  const player = new ReplayPlayer({ scene, camera, botModel: model, spawnBeam() {}, spawnMuzzleFlash() {}, spawnKillEffect() {}, reducedEffects: () => false, sfx: { shot() {}, kill() {}, move() {}, groundImpact() { impacts++; } } });
  player.start({ starId: 'star', starName: 'Star', label: 'Test', startT: 0, endT: 2, kills: [kill] }, src, { holdAtEnd: true });
  advance(dt => player.update(dt), 1.6); assert.equal(impacts, 1);
  player.seek(0.5); player.update(0); advance(dt => player.update(dt), 0.8); assert.equal(impacts, 1);
  player.dispose();
});
