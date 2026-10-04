import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { preloadR01Assets } from '../src/game/gun/r01-assets';
import { preloadCharacterAssets, characterAssets } from '../src/game/character/assets';
import { Character } from '../src/game/character/character';
import { CharacterAnimator } from '../src/game/character-anim';
import { EMOTES, KILL_EFFECTS } from '../src/game/cosmetics';
import { setCharacterFxQuality } from '../src/game/character/gibs';
import { MovementCueTimeline, isMovementCue } from '../src/game/movement-cues';
import { encodeReplay, decodeReplay, type ReplayData } from '../src/game/replay-codec';
import { ReplayPlayer, type ReplaySource } from '../src/game/replay';
import { RemotePlayer } from '../src/game/remote-player';
import { loadBotModel } from '../src/game/bots';
import { attachRailgun } from '../src/game/character/gun';

// Exercise the real asset loader with local exported files, including the
// sharing/clone code used by every game and preview consumer.
before(async () => {
  // Only the CPU finisher test uses this minimal canvas surface. Browser lab
  // validation exercises the actual flash textures and rendered materials.
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, clearRect() {}, measureText: () => ({ width: 24 }), beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {}, fillText() {} }) }) } as unknown as Document;
  const NativeRequest = globalThis.Request;
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) { super(typeof input === 'string' ? new URL(input, 'http://character.test') : input, init); }
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? new URL(input.url) : new URL(String(input), 'http://character.test');
    const file = await readFile(process.cwd() + '/public' + url.pathname);
    return new Response(file, { headers: { 'Content-Length': String(file.length) } });
  }) as typeof fetch;
  globalThis.ProgressEvent = class extends Event {
    lengthComputable = false; loaded = 0; total = 0;
    constructor(type: string, init: ProgressEventInit = {}) { super(type); Object.assign(this, init); }
  } as typeof ProgressEvent;
  await preloadR01Assets(async () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
  await preloadCharacterAssets();
});

test('approved android surfaces preserve the original rig and fit the runtime budget', async () => {
  const asset = characterAssets();
  assert.equal(asset.manifest.model, '/models/codex-android/model.glb');
  const bytes = await readFile('public/models/codex-ybot/original.glb');
  const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  source.scene.updateMatrixWorld(true);
  const ch = new Character();
  assert.equal(ch.canonicalBones.size, 65);
  source.scene.traverse(o => {
    if (!(o instanceof THREE.Bone)) return;
    const bone = ch.canonicalBones.get(o.name)!;
    assert(bone, o.name + ' missing');
    assert.equal(bone.parent?.name, o.parent?.name);
    assert(asset.rest.get(o.name)!.elements.every((v, i) => Math.abs(v - o.matrixWorld.elements[i]) < 1e-6), o.name + ' rest transform changed');
  });
  const g = ch.mesh.geometry, weights = g.getAttribute('skinWeight');
  assert(g.index && g.index.count / 3 < 75000, 'Android exceeded its 75k triangle ceiling');
  assert.deepEqual(g.groups.map(group => group.materialIndex), [0, 1]);
  assert.equal(g.groups.reduce((sum, group) => sum + group.count, 0), g.index.count);
  for (let i = 0; i < weights.count; i++) {
    assert(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-4, 'Unnormalized runtime skin');
  }
  ch.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(ch.modelContainer);
  assert(Math.abs(box.max.y - 1.8) < 0.001 && Math.abs(box.min.y) < 0.001, 'Game height or floor changed: ' + JSON.stringify(box));
  assert.equal(ch.windowMaterial.userData.charUniforms, ch.uniforms);
  assert(ch.windowMaterial.transparent && !ch.windowMaterial.depthWrite);
  // The terminal bars must sit in front of the display. Thin-screen mesh
  // simplification once produced a spike that completely occluded the face.
  const runtime = await new GLTFLoader().loadAsync(asset.manifest.model);
  let screenFront = -Infinity, glyphFront = -Infinity;
  runtime.scene.traverse(o => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    const material = o.material as THREE.MeshStandardMaterial;
    const p = o.geometry.getAttribute('position');
    if (material.name.includes('Obsidian')) for (let i = 0; i < p.count; i++) screenFront = Math.max(screenFront, p.getZ(i));
    if (material.name.includes('phosphor')) for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.6) glyphFront = Math.max(glyphFront, p.getZ(i));
  });
  assert(glyphFront > screenFront + 0.003, 'Terminal symbols are hidden by the monitor');
  ch.dispose();
});

test('android and R-01 share the combat, firing and respawn lifecycle', () => {
  const ch = new Character(), gun = attachRailgun(ch), anim = new CharacterAnimator(ch);
  const pos = new THREE.Vector3();
  for (const pitch of [-0.8, 0, 0.8]) for (let i = 0; i < 30; i++) {
    anim.update({ dt: 1 / 60, yaw: 0, pitch, pos, grounded: true, velocity: { x: 0, y: 0, z: 0 } });
    gun.setCharge(i / 29);
    assert(gun.muzzleWorld(new THREE.Vector3()).toArray().every(Number.isFinite));
  }
  assert.equal(gun.modelKey, null);
  assert(gun.getObjectByName('r01'), 'Default third-person gun is not the new R-01');
  anim.die({ y: 0 }); anim.updateStatic(0.1); anim.respawn();
  assert(ch.modelContainer.visible && !ch.breakupMesh.visible);
  gun.dispose(); anim.dispose(); ch.dispose();
});

test('R-01 grasp keeps palms, wrists and finger wraps aligned through aim and recoil', () => {
  const ch = new Character(), gun = attachRailgun(ch), anim = new CharacterAnimator(ch);
  const model = gun.getObjectByName('r01')!;
  const v = new THREE.Vector3(), q = new THREE.Quaternion();
  const relative = (name: string) => {
    ch.root.updateMatrixWorld(true);
    return model.worldToLocal(ch.canonicalBones.get('mixamorig' + name)!.getWorldPosition(new THREE.Vector3()));
  };
  anim.updateStatic(0);
  const wrists = new Map(['Left', 'Right'].map(side => [side, relative(side + 'Hand')]));
  // The firing wrist sits behind the pistol grip with knuckles pointing
  // forward. The old frame pointed the fingers straight down instead.
  ch.canonicalBones.get('mixamorigRightHand')!.getWorldQuaternion(q);
  v.set(0, 1, 0).applyQuaternion(q);
  assert(v.z < -0.85 && v.y < -0.3 && v.y > -0.6, 'Pistol hand points away from the grip');
  const palm = new THREE.Vector3(0, 10.5, 1.65);
  ch.canonicalBones.get('mixamorigRightHand')!.localToWorld(palm); model.worldToLocal(palm);
  assert(palm.x > 0.020 && palm.x < 0.030, 'Palm is not seated on the 47 mm wide pistol grip');
  assert(palm.y > -0.075 && palm.y < -0.035 && palm.z > 0.12 && palm.z < 0.16, 'Palm missed the rubber handle');
  const triggerTip = relative('RightHandIndex4');
  assert(triggerTip.distanceTo(new THREE.Vector3(0, -0.038, 0.064)) * 0.6 < 0.012, 'Index finger missed the trigger');
  assert(triggerTip.y < -0.025 && triggerTip.z > 0.04, 'Index finger overlaps the receiver instead of entering the guard');
  const supportPalm = new THREE.Vector3(0, 10.5, 1.65);
  ch.canonicalBones.get('mixamorigLeftHand')!.localToWorld(supportPalm); model.worldToLocal(supportPalm);
  assert(supportPalm.distanceTo(new THREE.Vector3(0, -0.038, -0.37)) < 0.001, 'Support palm missed the fore-end underside');
  for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
    const knuckle = relative('LeftHand' + finger + '2');
    assert(knuckle.x > 0.055 && knuckle.x < 0.09, finger + ' must wrap outside the fore-end');
  }
  const thumbBase = relative('LeftHandThumb2'), thumbTip = relative('LeftHandThumb4');
  assert(thumbTip.z < thumbBase.z - 0.1, 'Support thumb must point forward along the fore-end');
  assert(thumbTip.x < -0.05 && Math.abs(thumbTip.y) < 0.02, 'Support thumb overlaps the rail or points upright');
  for (const pitch of [-1.22, -0.8, 0, 0.8, 1.22]) {
    for (let i = 0; i < 60; i++) {
      if (i === 20) anim.notifyFire();
      anim.update({ dt: 1 / 60, yaw: 0.7, pitch, pos: new THREE.Vector3(2, 0, 3), grounded: true, velocity: { x: 4, y: 0, z: -7 } });
      for (const side of ['Left', 'Right']) assert(relative(side + 'Hand').distanceTo(wrists.get(side)!) * 0.6 < 0.002, `${side} wrist detached at pitch ${pitch}`);
    }
  }
  // Paused frames cannot accumulate the procedural curl into the animation.
  const fingers = () => [...ch.canonicalBones].filter(([name]) => /Hand(?:Thumb|Index|Middle|Ring|Pinky)/.test(name)).flatMap(([, bone]) => bone.quaternion.toArray());
  anim.updateStatic(0); const first = fingers();
  for (let i = 0; i < 10; i++) anim.updateStatic(0);
  assert.deepEqual(fingers(), first);
  gun.dispose(); anim.dispose(); ch.dispose();
});

test('every baked motion binds on independently cloned characters with a stationary root', () => {
  const a = new Character(), b = new Character();
  assert.notEqual(a.mesh.skeleton, b.mesh.skeleton);
  assert.notEqual(a.mesh.skeleton.bones[0], b.mesh.skeleton.bones[0]);
  assert.equal(a.mesh.geometry, b.mesh.geometry);
  const beforeB = b.canonicalBones.get('mixamorigHead')!.quaternion.clone();
  const mixer = new THREE.AnimationMixer(a.model);
  let checked = 0;
  for (const [id, clip] of characterAssets().clips) {
    mixer.stopAllAction(); const action = mixer.clipAction(clip).play();
    for (const fraction of [0, 0.25, 0.5, 0.9]) {
      action.time = fraction * clip.duration; mixer.update(0); a.root.updateMatrixWorld(true);
      for (const bone of a.canonicalBones.values()) assert(bone.matrixWorld.elements.every(Number.isFinite), id);
      const hips = a.canonicalBones.get('mixamorigHips')!;
      assert(Math.abs(hips.position.x) < 0.001 && Math.abs(hips.position.y) < 0.001, id + ' horizontal drift');
      assert(b.canonicalBones.get('mixamorigHead')!.quaternion.equals(beforeB), 'Shared animation state');
    }
    checked++;
  }
  assert.equal(checked, 46); // 45 exported motions and the original rest pose
  mixer.stopAllAction(); mixer.uncacheRoot(a.model); a.dispose(); b.dispose();
});

test('all 23 inventory emotes play the shared Victory placeholder', () => {
  const ch = new Character(), anim = new CharacterAnimator(ch, { holdGun: false });
  assert.equal(EMOTES.length, 23);
  let reference: number[] | undefined;
  for (const emote of EMOTES) {
    anim.playEmote(emote.kind, true); anim.setEmoteTime(1.75, 1);
    const pose = [...ch.canonicalBones.values()].flatMap((b) => b.quaternion.toArray());
    if (reference) assert.deepEqual(pose, reference, emote.id);
    else reference = pose;
    assert.equal(anim.emoteShowsGun, false);
  }
  anim.dispose(); ch.dispose();
});

test('ordinary strafing stays locomotion; explicit cues select every special movement', () => {
  const ch = new Character(), anim = new CharacterAnimator(ch);
  const pos = new THREE.Vector3();
  for (let i = 0; i < 90; i++) {
    pos.x += 10 / 60;
    anim.update({ dt: 1 / 60, yaw: 0, pitch: 0, pos, grounded: true, velocity: { x: 10, y: 0, z: 0 } });
    assert(!anim.movementClip?.startsWith('dash.'));
  }
  const head = ch.canonicalBones.get('mixamorigHead')!.getWorldPosition(new THREE.Vector3());
  assert(head.y > 1.3 && head.y < 1.85, 'Head pose no longer aligns with the hitbox');
  for (const [cue, clip] of [[{ kind: 'dash', direction: { x: 1, z: 0 } }, 'dash.right'], [{ kind: 'jump' }, 'jump.up'], [{ kind: 'double-jump' }, 'jump.double'], [{ kind: 'boost' }, 'jump.boost'], [{ kind: 'wall-jump', direction: { x: -1, z: 0 } }, 'wall.right'], [{ kind: 'landing', impact: 12 }, 'land']] as const) {
    anim.update({ dt: 1 / 60, yaw: 0, pitch: 0, pos, cues: [cue] }); assert.equal(anim.movementClip, clip);
  }
  anim.update({ dt: 1 / 60, yaw: 0, pitch: 0, pos, cues: [{ kind: 'dash', direction: { x: 0, z: -1 } }] });
  for (let i = 0; i < 10; i++) anim.update({ dt: 1 / 60, yaw: 0, pitch: 0, pos, grounded: true });
  assert(!anim.movementClip?.startsWith('dash.'));
  anim.respawn(pos);
  anim.update({ dt: 0, yaw: 0, pitch: 0, pos, grounded: true, cues: [{ kind: 'jump', age: 0.4 }] });
  assert.equal(anim.movementClip, null);
  assert.equal(anim.isAirborne, false, 'An expired cue changed grounded state');
  anim.dispose(); ch.dispose();
});

test('all finishers place rigid pieces from the live pose and restore the same canonical rig', () => {
  for (const quality of [{}, { reducedEffects: true }, { lowSpec: true }]) {
    setCharacterFxQuality(quality);
    const ch = new Character(), anim = new CharacterAnimator(ch);
    const restBinds = ch.mesh.skeleton.boneInverses.map((m) => m.toArray());
    for (const finisher of KILL_EFFECTS) {
      anim.respawn(new THREE.Vector3()); anim.updateStatic(0.5);
      anim.die({ y: 0 }, finisher.id);
      assert.equal((anim as unknown as { gibs: { style: string } }).gibs.style, finisher.id, 'Selected finisher fell back to the default');
      assert(!ch.modelContainer.visible && ch.breakupMesh.visible, finisher.id);
      for (let i = 0; i < 90; i++) anim.updateStatic(1 / 60);
      assert(ch.rig.bones.every((b) => b.matrix.elements.every(Number.isFinite)), finisher.id);
      anim.respawn();
      assert(ch.modelContainer.visible && !ch.breakupMesh.visible);
      assert.deepEqual(ch.mesh.skeleton.boneInverses.map((m) => m.toArray()), restBinds);
    }
    anim.dispose(); ch.dispose();
  }
  setCharacterFxQuality({ reducedEffects: false, lowSpec: false });
});

test('cosmetic cues use the interpolation timeline, reject malformed data, and clear at respawn', () => {
  const timeline = new MovementCueTimeline();
  const seen: string[] = [];
  timeline.enqueue('a', 1100, { kind: 'dash', direction: { x: 1, z: 0 } });
  timeline.enqueue('b', 1000, { kind: 'jump' });
  timeline.consume(950, (id) => seen.push(id)); assert.deepEqual(seen, []);
  timeline.consume(1025, (id, cue) => { seen.push(id); assert.equal(cue.age, 0.025); });
  assert.deepEqual(seen, ['b']);
  timeline.clear('a'); timeline.consume(1200, (id) => seen.push(id)); assert.deepEqual(seen, ['b']);
  timeline.enqueue('stale', 100, { kind: 'jump' }); timeline.consume(1200, (id) => seen.push(id)); assert.deepEqual(seen, ['b']);
  for (const cue of [{ kind: 'dash', direction: null }, { kind: 'jump', direction: { x: NaN, z: 0 } }, { kind: 'boost', impact: Infinity }, { kind: 'shoot' }]) assert.equal(isMovementCue(cue), false);
});

test('replay v4 retains cues; v1/v2/v3 still round-trip without them', () => {
  const data: ReplayData = { version: 4, hz: 20, mapId: 'arena', durationMs: 1000, localId: 'a', won: false,
    profiles: [{ id: 'a', name: 'A', kind: 'local', hat: 'hat.none', unusual: 'unusual.none', nameColor: 'name.default', team: null }],
    frames: [{ t: 0, poses: { a: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, visible: true } } }], kills: [], shots: [], taunts: [],
    movement: [{ t: 0.2, actorId: 'a', cue: { kind: 'wall-jump', direction: { x: -1, z: 0 } } }, { t: 0.3, actorId: 'a', cue: { kind: 'landing', impact: 8 } }] };
  assert.deepEqual(decodeReplay(encodeReplay(data)).movement, data.movement);
  assert.deepEqual(decodeReplay(encodeReplay(data), false).movement, data.movement);
  for (const version of [1, 2, 3]) { const decoded = decodeReplay(encodeReplay({ ...data, version })); assert.equal(decoded.version, version); assert.deepEqual(decoded.movement, []); assert.equal(decoded.frames[0].poses.a.visible, true); }
  const bad = encodeReplay(data); assert.throws(() => decodeReplay(bad.subarray(0, bad.length - 1)));
});

test('replay seeks restore cue phases, freeze when paused, clear at respawn, and play older recordings', async () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const actor = new RemotePlayer('a', 'A', scene, await loadBotModel());
  const player = new ReplayPlayer({ scene, camera, botModel: null, plates: 'off', acquireActor: () => actor, releaseActor() {}, spawnBeam() {}, spawnMuzzleFlash() {}, spawnKillEffect() {}, reducedEffects: () => true });
  const profile = { id: 'a', name: 'A', kind: 'remote' as const, hat: 'hat.none', unusual: 'unusual.none', nameColor: 'name.default', team: null };
  const pose = (x: number, visible = true) => ({ x, y: 0, z: 0, yaw: 0, pitch: 0, visible });
  const src: ReplaySource = { profiles: new Map([['a', profile]]), frames: [
    { t: 0, poses: { a: pose(0), star: pose(0) } }, { t: 0.5, poses: { a: pose(3.5), star: pose(0) } },
    { t: 1, poses: { a: pose(7), star: pose(0) } }, { t: 1.1, poses: { a: pose(7, false), star: pose(0) } },
    { t: 1.5, poses: { a: pose(20), star: pose(0) } }, { t: 2, poses: { a: pose(23.5), star: pose(0) } },
  ], shots: ['a', 'star'].map(killerId => ({ t: 0.1, killerId, origin: { x: 0, y: 1, z: 0 }, end: { x: 0, y: 1, z: -8 } })), kills: [], movement: [{ t: 0.2, actorId: 'a', cue: { kind: 'dash', direction: { x: 1, z: 0 } } }] };
  player.start({ starId: 'star', starName: 'Star', label: 'Test', startT: 0, endT: 2, kills: [] }, src, { holdAtEnd: true });
  const bones = () => [...actor.body!.canonicalBones.values()].flatMap((b) => [...b.position.toArray(), ...b.quaternion.toArray()]);
  const assertPose = (expected: number[], message: string) => { assert(bones().every((v, i) => Math.abs(v - expected[i]) < 1e-6), message); };
  player.pause(); player.seek(0.25); player.update(0);
  const gunPose = () => actor.group.getObjectByName('r01')!.children.filter(o => /carriage|sleeve/.test(o.name)).flatMap(o => o.position.toArray().map(v => v || 0));
  const firstGun = gunPose();
  assert(firstGun.some(v => v !== 0), 'Seeking into a reload must restore the mechanism');
  assert(Math.abs(player.starSinceShot - 0.15) < 1e-6, 'First-person replay recharge restores the last recorded shot');
  const first = bones();
  player.update(0.1); assertPose(first, 'Paused animation kept advancing');
  assert.deepEqual(gunPose(), firstGun, 'Paused weapon kept advancing');
  player.seek(0.8); player.update(0); const later = bones(); assert.notDeepEqual(later, first);
  player.seek(0.25); player.update(0); assertPose(first, 'A repeated seek changed the cue phase');
  assert.deepEqual(gunPose(), firstGun, 'Backward seek changed the recharge phase');
  actor.queueMovementCue({ kind: 'boost' }); actor.resetAnimationTimeline(); actor.snap(pose(20), 0);
  assert(gunPose().every(v => v === 0), 'Respawn retained a partial reload');
  assert(actor.body!.modelContainer.visible && !actor.body!.breakupMesh.visible);
  assert(bones().every(Number.isFinite));
  const neutralHips = actor.body!.canonicalBones.get('mixamorigHips')!.quaternion.clone();
  actor.queueMovementCue({ kind: 'boost' }); actor.snap(pose(20, false), 0); actor.snap(pose(20), 0);
  assert(actor.body!.canonicalBones.get('mixamorigHips')!.quaternion.angleTo(neutralHips) < 1e-6, 'A cue queued before a hidden frame leaked into respawn');
  player.dispose(); actor.dispose(scene);

  // The old recording shape has no movement field. It still supplies measured
  // velocity from adjacent frames, even in slow motion and after a seek.
  const older = new RemotePlayer('a', 'A', scene, await loadBotModel());
  let sampledVelocity: number | undefined;
  const realSnap = older.snap.bind(older);
  older.snap = (p, dt) => { sampledVelocity = p.velocity?.x; realSnap(p, dt); };
  const legacy = new ReplayPlayer({ scene, camera, botModel: null, acquireActor: () => older, releaseActor() {}, spawnBeam() {}, spawnMuzzleFlash() {}, spawnKillEffect() {}, reducedEffects: () => true });
  legacy.start({ starId: 'star', starName: 'Star', label: 'Old recording', startT: 0, endT: 2, kills: [] }, { ...src, movement: undefined }, { holdAtEnd: true, timeScale: 0.5 });
  legacy.update(0.1); assert.equal(sampledVelocity, 7);
  legacy.seek(0.4); legacy.update(0); assert.equal(sampledVelocity, 7);
  assert([...older.body!.canonicalBones.values()].every((b) => b.quaternion.toArray().every(Number.isFinite)));
  legacy.dispose(); older.dispose(scene);
});

test('network deaths stay at the hit location through early respawn snapshots and duplicate events', async () => {
  const scene = new THREE.Scene(), actor = new RemotePlayer('victim', 'Victim', scene, await loadBotModel());
  const snapshot: import('../src/game/net').RemotePlayerSnapshot = { id: 'victim', name: 'Victim', pos: { x: 30, y: 0, z: -40 }, yaw: 0.4, pitch: 0, frags: 0, deaths: 1, invulnMs: 1000, team: null, hat: 'hat.none', unusual: 'unusual.none', emote: '', nameColor: 'name.default', spawnEffect: '', title: '', railColor: '', railgunFinish: '', crosshair: '', ping: 0, admin: false, verified: false, receivedAt: 0 };
  actor.apply(snapshot, 1 / 60); // the newer spawn snapshot arrives first
  const hit = new THREE.Vector3(3, 2, -5);
  actor.markDead('pulse', hit);
  const ch = actor.body!;
  assert(ch.breakupMesh.visible && !ch.modelContainer.visible && actor.group.visible);
  const skin = ch.breakupMesh.geometry.getAttribute('skinIndex');
  let head = 0; while (skin.getX(head) !== 5) head++;
  const sample = () => { scene.updateMatrixWorld(true); ch.breakupMesh.skeleton.update(); return ch.breakupMesh.getVertexPosition(head, new THREE.Vector3()).applyMatrix4(ch.breakupMesh.matrixWorld); };
  const start = sample();
  // Match the server: the victim is omitted from movement snapshots.
  for (let i = 0; i < 12; i++) assert(actor.advanceDeathWithoutSnapshot(1 / 60));
  assert(actor.group.position.equals(hit), 'Corpse teleported to the new spawn');
  assert(actor.group.visible && ch.breakupMesh.visible, 'Corpse was hidden before breakup');
  assert(sample().distanceTo(start) > 0.05, 'Visible head vertices did not separate');
  const timer = actor.deadTimer, matrices = ch.rig.bones.map(b => b.matrix.toArray());
  actor.markDead('pulse', snapshot.pos);
  assert.equal(actor.deadTimer, timer); assert(actor.group.position.equals(hit));
  assert.deepEqual(ch.rig.bones.map(b => b.matrix.toArray()), matrices);
  for (let i = 0; i < 90; i++) actor.advanceDeathWithoutSnapshot(1 / 60);
  assert(!actor.advanceDeathWithoutSnapshot(1 / 60));
  assert(!actor.group.visible, 'Absent victim reappeared at the death location');
  actor.apply(snapshot, 1 / 60);
  assert(actor.group.visible && ch.modelContainer.visible && !ch.breakupMesh.visible);
  assert(actor.group.position.distanceTo(new THREE.Vector3().copy(snapshot.pos)) < 0.001);
  actor.dispose(scene);
});

test('first-person full arms reach from fixed shoulders and retain both grips throughout inspection', async () => {
  const { buildRailgun } = await import('../src/game/weapon-model');
  const { equipViewmodelArms, updateViewmodelArms } = await import('../src/game/viewmodel-arms');
  const { ViewmodelMotion } = await import('../src/game/viewmodel-motion');
  const { VIEWMODEL_BASE, VIEWMODEL_SCALE } = await import('../src/game/constants');
  const vm = buildRailgun(); equipViewmodelArms(vm); equipViewmodelArms(vm);
  const mesh = vm.group.getObjectByName('android-viewmodel-arms') as THREE.SkinnedMesh;
  assert(mesh && mesh.geometry.getAttribute('position').count > 1000);
  assert.equal(vm.group.children.filter(c => c.name === mesh.name).length, 1);
  assert.equal(mesh.skeleton.bones.length, 5);
  const skin = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
  const origin = mesh.geometry.getAttribute('position'), hands = [-1, -1];
  const owners = new Set<number>();
  for (let i = 0; i < skin.count; i++) {
    for (let j = 0; j < 4; j++) if (weights.getComponent(i, j) > 0) owners.add(skin.getComponent(i, j));
    if (skin.getX(i) === 0 && weights.getX(i) === 1) hands[origin.getX(i) < 0 ? 0 : 1] = i;
  }
  assert.deepEqual([...owners].sort(), [0, 1, 2, 3, 4], 'Missing upper arm or forearm surfaces');
  assert(hands.every(i => i >= 0), 'Both hands must be present');
  const camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.01, 100); camera.add(vm.group);
  const local = (v: THREE.Vector3) => camera.worldToLocal(v);
  const reference = new Character({castShadow:false}), referenceGun = attachRailgun(reference), referenceAnim = new CharacterAnimator(reference);
  referenceAnim.updateStatic(0); reference.root.updateMatrixWorld(true);
  const wrists = ['Left', 'Right'].map(side => referenceGun.worldToLocal(reference.canonicalBones.get(`mixamorig${side}Hand`)!.getWorldPosition(new THREE.Vector3())));
  referenceGun.dispose(); referenceAnim.dispose(); reference.dispose();
  const motion = new ViewmodelMotion();
  for (const mode of ['inspect', 'reduced-inspect', 'move-fire-zoom']) {
    const reduced = mode === 'reduced-inspect', moving = mode === 'move-fire-zoom';
    motion.reset(); motion.startInspect(reduced);
    for (let i = 0; i < 180; i++) {
      if (moving && i === 40) { motion.onFire(); motion.onLand(8); }
      const p = motion.update({dt:1/60,yaw:moving?i*.01:0,pitch:0,groundSpeed:moving?8:0,lateralSpeed:moving?3:0,grounded:true,zoom:moving&&i>90?1:0,reducedEffects:reduced});
      vm.group.position.set(VIEWMODEL_BASE.x+p.x,VIEWMODEL_BASE.y+p.y,VIEWMODEL_BASE.z+p.z);
      vm.group.rotation.set(p.rx,p.ry,p.rz);vm.group.scale.setScalar(VIEWMODEL_SCALE);
      updateViewmodelArms(vm.group);
      camera.position.set(3, 1.6, -2); camera.rotation.set(.2, i * .01, 0);
      camera.updateMatrixWorld(true); mesh.skeleton.update();
      for (const id of hands) {
        const point = mesh.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        assert(vm.group.worldToLocal(point).distanceTo(new THREE.Vector3().fromBufferAttribute(origin,id))<1e-6, 'Hand detached from grip');
      }
      for (let side = 0; side < 2; side++) {
        const upper = mesh.skeleton.bones[1+side*2], fore = mesh.skeleton.bones[2+side*2];
        const shoulder = local(upper.getWorldPosition(new THREE.Vector3()));
        assert(shoulder.distanceTo(new THREE.Vector3(side === 0 ? -.25 : .25, -.24, side === 0 ? .04 : .12)) < 1e-6, 'Shoulder followed the gun into view');
        const scale = new THREE.Vector3().setFromMatrixScale(upper.matrix);
        assert(scale.x <= 1.01, `Arm stretched during inspect: ${scale.x}, frame ${i}`);
        assert(new THREE.Vector3().setFromMatrixScale(fore.matrix).distanceTo(scale)<1e-6);
        // The forearm base must meet the transformed upper-arm endpoint.
        const restElbow = new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[2+side*2].clone().invert());
        const tip = restElbow.applyMatrix4(mesh.skeleton.boneInverses[1+side*2]).applyMatrix4(upper.matrixWorld);
        assert(tip.distanceTo(fore.getWorldPosition(new THREE.Vector3()))<1e-6, 'Disconnected elbow');
        const wrist = wrists[side].clone().applyMatrix4(mesh.skeleton.boneInverses[2+side*2]).applyMatrix4(fore.matrixWorld);
        assert(wrist.distanceTo(vm.group.localToWorld(wrists[side].clone()))<1e-6, 'Forearm detached at the wrist');
      }
    }
  }
  motion.reset();
  const p = motion.update({dt:0,yaw:0,pitch:0,groundSpeed:0,lateralSpeed:0,grounded:true,zoom:0,reducedEffects:false});
  vm.group.position.set(VIEWMODEL_BASE.x+p.x,VIEWMODEL_BASE.y+p.y,VIEWMODEL_BASE.z+p.z); vm.group.rotation.set(p.rx,p.ry,p.rz);
  vm.group.updateMatrix();
  assert(new THREE.Vector3(0,0,.476).applyMatrix4(vm.group.matrix).z > 0, 'Carry shows the stock in front of the camera');
  assert(new THREE.Vector3(0,.037,-.917).applyMatrix4(vm.group.matrix).z < -.5, 'Muzzle is behind the camera');
  vm.dispose(); assert(!mesh.parent);
});
