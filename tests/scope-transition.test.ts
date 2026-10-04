import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ScopeTransition, sampleScope } from '../src/game/scope-transition';
import { applyScopePose, projectScopeSight } from '../src/game/scope-pose';

const near = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);
for (const fps of [30, 60, 120, 144]) {
  test(`scope takes exactly 0.5s in / 0.25s out at ${fps}fps`, () => {
    const scope = new ScopeTransition();
    for (const [held, duration, end] of [[true, .5, 1], [false, .25, 0]] as const) {
      let elapsed = 0;
      while (elapsed < duration - 1e-10) {
        const dt = Math.min(1 / fps, duration - elapsed);
        scope.update(held, dt); elapsed += dt;
        near(scope.frame.progress, held ? elapsed / duration : 1 - elapsed / duration);
      }
      assert.equal(scope.frame.progress, end);
    }
  });
}
test('quick release and re-press reverse continuously without a new clock', () => {
  const scope = new ScopeTransition();
  scope.update(true, .2); near(scope.frame.progress, .4);
  const before = scope.frame; assert.deepEqual(scope.update(false, 0), before);
  scope.update(false, .05); near(scope.frame.progress, .2);
  const reversed = scope.frame; assert.deepEqual(scope.update(true, 0), reversed);
  scope.update(true, .4); assert.equal(scope.frame.progress, 1);
  scope.update(false, .25); assert.equal(scope.frame.progress, 0);
});
test('interruptions reset every output; invalid deltas cannot corrupt the clock', () => {
  const scope = new ScopeTransition(); scope.update(true, .35);
  const before = scope.frame;
  for (const dt of [-1, NaN, Infinity]) assert.deepEqual(scope.update(true, dt), before);
  assert.deepEqual(scope.update(true, .1, false), sampleScope(0));
  scope.update(true, 1); assert.deepEqual(scope.reset(), sampleScope(0));
});
test('weapon remains opaque through the approach; reticle arrives during the handoff', () => {
  assert.equal(sampleScope(.69).weaponOpacity, 1);
  assert.equal(sampleScope(.75).reticle, 0);
  const middle = sampleScope(.85);
  assert(middle.weaponOpacity > 0 && middle.weaponOpacity < 1);
  assert(middle.blur > 0 && middle.darkness > 0 && middle.reticle > 0);
  const final = sampleScope(1);
  assert.equal(final.weaponOpacity, 0); assert.equal(final.blur, 0);
  assert.equal(final.darkness, 1); assert.equal(final.reticle, 1);
});
test('authored sight aligns at the eye regardless of custom hip offsets and camera/world transforms', () => {
  for (const offset of [new THREE.Vector3(.23, -.245, -.6), new THREE.Vector3(-1, 2, -2)]) {
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, .01, 100);
    camera.position.set(3, 9, -15); camera.rotation.set(.3, 2, 0);
    const group = new THREE.Group(); camera.add(group); group.scale.setScalar(.8);
    group.position.copy(offset); group.rotation.set(.12, -.35, .08);
    const holder = new THREE.Group(); group.add(holder);
    const sight = new THREE.Object3D(); holder.add(sight); sight.position.set(0, .17, -.1885);
    applyScopePose(group, sight, sampleScope(1)); group.updateWorldMatrix(true, true);
    const local = camera.worldToLocal(sight.getWorldPosition(new THREE.Vector3()));
    near(local.x, 0); near(local.y, 0); near(local.z, -.14);
    const projection = projectScopeSight(group, sight, camera, {x: 0, y: 0, scale: 0});
    near(projection.x, 0); near(projection.y, 0); assert(projection.scale > 0);
  }
});
test('special models use a stable fallback and phase zero preserves the hip pose', () => {
  const group = new THREE.Group(); group.position.set(.3, -.2, -.6); group.rotation.set(.1, .2, .3);
  const original = group.matrix.clone(); group.updateMatrix(); original.copy(group.matrix);
  applyScopePose(group, undefined, sampleScope(0)); group.updateMatrix(); assert.deepEqual(group.matrix, original);
  applyScopePose(group, undefined, sampleScope(1)); near(group.position.x, 0); near(group.position.y, -.15);
  near(group.position.z, .04); near(group.quaternion.w, 1);
});
