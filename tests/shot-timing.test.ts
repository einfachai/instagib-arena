import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Railgun } from '../src/game/weapon';
import { localRail } from '../src/game/fx/rail-state';
import type { AABB } from '../src/game/types';

test('accepted shots notify audio before raycasts or beam effects, exactly once per shot', () => {
  const rail = new Railgun();
  const scene = new THREE.Scene();
  const previousState = { ...localRail };
  const events: string[] = [];
  const wall: AABB = {
    get min() { events.push('raycast'); return { x: -1, y: 0, z: -10 }; },
    get max() { events.push('raycast'); return { x: 1, y: 2, z: -9 }; },
  };
  Reflect.set(rail, 'spawnBeamAt', () => events.push('beam'));
  const fire = () => rail.fire(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1),
    scene, [wall], [], undefined, undefined, () => events.push('audio'),
  );
  try {
    assert.ok(fire());
    assert.equal(events[0], 'audio', 'audio must not wait for hit tests or beam construction');
    assert.ok(events.includes('raycast'));
    assert.equal(events.at(-1), 'beam');
    assert.equal(events.filter(event => event === 'audio').length, 1);
    const acceptedEventCount = events.length;
    assert.equal(fire(), null, 'cooldown must still block a second shot');
    assert.equal(events.length, acceptedEventCount, 'blocked shots must not emit audio or effects');
    rail.cooldown = 0;
    assert.ok(fire());
    assert.equal(events.filter(event => event === 'audio').length, 2);
  } finally {
    rail.disposeAll(scene);
    Object.assign(localRail, previousState);
  }
});
