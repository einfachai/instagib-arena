import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { preloadR01Assets, r01Assets } from '../src/game/gun/r01-assets';
import { buildR01 } from '../src/game/gun/r01';
import { buildRailgun } from '../src/game/weapon-model';
import { AttachedRailgun } from '../src/game/character/gun';
import { STOCK_FINISH } from '../src/game/gun/gun-material';
import { railgunFinishById } from '../src/game/cosmetics';
import { Railgun } from '../src/game/weapon';
import { RAIL_COOLDOWN } from '../src/game/constants';
import { localRail } from '../src/game/fx/rail-state';

before(async () => {
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, arc() {}, stroke() {}, fillRect() {}, clearRect() {} }) }) } as unknown as Document;
  const NativeRequest = globalThis.Request;
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) { super(typeof input === 'string' ? new URL(input, 'http://railgun.test') : input, init); }
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? new URL(input.url) : new URL(String(input), 'http://railgun.test');
    return new Response(await readFile(process.cwd() + '/public' + url.pathname));
  }) as typeof fetch;
  globalThis.ProgressEvent = class extends Event {
    constructor(type: string, init: ProgressEventInit = {}) { super(type); Object.assign(this, init); }
  } as typeof ProgressEvent;
  await preloadR01Assets(async () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
});
const meshes = (root: THREE.Object3D) => { const out: THREE.Mesh[] = []; root.traverse((o) => { if (o instanceof THREE.Mesh) out.push(o); }); return out; };
const positions = (root: THREE.Object3D) => root.children.filter((o) => /carriage|sleeve/.test(o.name)).flatMap((o) => o.position.toArray().map((v) => v || 0));

test('exported LODs meet the triangle budget, carry all surfaces/anchors, and bind the 1.2s clip', () => {
  for (const [lod, budget] of [['high', 8000], ['low', 2000]] as const) {
    const asset = r01Assets()[lod];
    assert.equal(meshes(asset.scene).length, 3);
    let triangles = 0;
    for (const { geometry: g } of meshes(asset.scene)) {
      triangles += (g.index?.count ?? g.getAttribute('position').count) / 3;
      for (const attr of ['gun', '_r01', 'uv', 'normal']) assert(g.hasAttribute(attr), attr);
    }
    assert(triangles <= budget, `${lod}: ${triangles}`);
    for (const name of ['muzzle', 'grip', 'support', 'tracker', 'sight']) assert(asset.scene.children.some((o) => o.name.startsWith('r01_' + name)));
    assert(Math.abs(asset.animations[0].duration - RAIL_COOLDOWN) < 0.00001);
  }
});

test('mechanical reload is deterministic, reversible, independent per instance, and ends at rest', () => {
  const a = buildR01({ lod: 'high', finish: STOCK_FINISH });
  const b = buildR01({ lod: 'high', finish: STOCK_FINISH });
  assert.equal(meshes(a.group)[0].geometry, meshes(b.group)[0].geometry);
  assert.notEqual(meshes(a.group)[0].material, meshes(b.group)[0].material);
  const rest = positions(a.group);
  a.sample(0.45); const open = positions(a.group);
  assert.notDeepEqual(open, rest);
  assert.deepEqual(positions(b.group), rest);
  a.sample(1); assert.deepEqual(positions(a.group), rest);
  a.sample(0.45); assert.deepEqual(positions(a.group), open, 'backward seek');
  a.sample(0.45); assert.deepEqual(positions(a.group), open, 'paused frame');
  a.sample(0); assert.deepEqual(positions(a.group), rest, 'new shot');
  a.sample(NaN); assert.deepEqual(positions(a.group), rest, 'invalid/reset charge');
  a.dispose(); b.sample(0.45); assert.deepEqual(positions(b.group), open); b.dispose();
});

test('stock matches the reference while ordinary finishes and special model identities survive', () => {
  assert.deepEqual(railgunFinishById('gun.stock').data, STOCK_FINISH);
  const gun = buildRailgun();
  assert.equal(gun.modelKey, null);
  assert(gun.sight?.name.startsWith('r01_sight'));
  assert.deepEqual(gun.sight.position.toArray().map(v => Math.round(v * 10000) / 10000), [0, .17, -.1885]);
  assert(gun.group.getObjectByName('r01'));
  gun.setFinish(railgunFinishById('gun.crimson').data);
  assert(gun.group.getObjectByName('r01'));
  gun.dispose();
  const custom = buildRailgun(railgunFinishById('gun.admin').data);
  assert.equal(custom.modelKey, 'sovereign');
  assert(!custom.group.getObjectByName('r01'));custom.dispose();
});

test('remote charge can seek and reset the same mechanical cycle, with a correct muzzle', () => {
  const gun = new AttachedRailgun();
  const root = gun.getObjectByName('r01')!;
  const rest = positions(root);
  gun.notifyFire(); gun.setCharge(0.5); const open = positions(root);
  assert.notDeepEqual(open, rest);
  gun.setCharge(1); assert.deepEqual(positions(root), rest);
  gun.setCharge(0.5); assert.deepEqual(positions(root), open);
  const muzzle = gun.muzzleWorld(new THREE.Vector3());
  assert(Math.abs(muzzle.z + 0.917) < 0.001);
  gun.setCharge(1);gun.dispose();
});

test('shots automatically recharge; blocked shots never restart the reload; training can shorten the cycle', () => {
  const rail = new Railgun();const scene = new THREE.Scene();
  // Exercise real shot acceptance/cooldown without allocating unrelated beam FX.
  Object.assign(rail, { spawnBeamAt() {} });
  const origin = new THREE.Vector3(), direction = new THREE.Vector3(0, 0, -1);
  for (const duration of [RAIL_COOLDOWN, 0.4]) {
    rail.cooldownTotal = duration;rail.cooldown = 0;
    const count = localRail.shots;
    assert(rail.fire(origin, direction, scene, [], []));assert.equal(rail.charge, 0);
    rail.step(duration / 2, scene);assert(Math.abs(rail.charge - 0.5) < 1e-8);
    assert.equal(rail.fire(origin, direction, scene, [], []), null);
    assert.equal(localRail.shots, count + 1);assert.equal(rail.charge, 0.5);
    rail.step(duration / 2, scene);assert.equal(rail.charge, 1);
    assert(rail.fire(origin, direction, scene, [], []));
  }
  rail.disposeAll(scene);
});

test('notifyFire alone completes an automatic cycle and explicit replay charge overrides it', () => {
  const clock = test.mock.method(performance, 'now', () => 10000);
  const gun = buildRailgun();
  const root = gun.group.getObjectByName('r01')!;
  const ticker = gun.group.getObjectByName('gun-ticker')!;
  const tick = () => (ticker.onBeforeRender as () => void)();
  tick(); const rest = positions(root);
  gun.notifyFire();
  clock.mock.mockImplementation(() => 10600); tick();
  const open = positions(root); assert.notDeepEqual(open, rest);
  clock.mock.mockImplementation(() => 11200); tick();
  assert.deepEqual(positions(root), rest);
  gun.setCharge(0.5); tick(); assert.deepEqual(positions(root), open);
  gun.setCharge(1); tick(); assert.deepEqual(positions(root), rest);
  gun.dispose(); clock.mock.restore();
});

test('reduced effects suppress flash while retaining the identical readable mechanism', () => {
  const gun = buildR01({ lod: 'high', finish: STOCK_FINISH });
  gun.sample(0.02, false); const pose = positions(gun.group);
  const flash = Math.max(...gun.material.gun.uFlash.value.toArray());
  gun.sample(0.02, true);
  assert.deepEqual(positions(gun.group), pose);
  assert(flash > 0); assert.equal(Math.max(...gun.material.gun.uFlash.value.toArray()), 0);
  gun.dispose();
});
