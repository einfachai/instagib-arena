import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { InputManager } from '../src/game/input.ts';
import { DEFAULT_KEYBINDS, mergeKeybinds } from '../src/game/constants.ts';

// Exercise the actual registered input listeners without WebGL/pointer-lock
// permission. These targets model the browser event boundary, not game state.
let windowTarget: EventTarget;
let documentTarget: EventTarget & { pointerLockElement: object | null };
let input: InputManager;
const canvas = {} as HTMLCanvasElement;
function mouse(type: string, button: number) {
  const event = Object.assign(new Event(type, { cancelable: true }), { button });
  windowTarget.dispatchEvent(event);
  return event;
}
function key(type: string, code: string) {
  windowTarget.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
}
beforeEach(() => {
  windowTarget = new EventTarget();
  documentTarget = Object.assign(new EventTarget(), { pointerLockElement: null as object | null });
  Object.assign(globalThis, { window: windowTarget, document: documentTarget });
  input = new InputManager(canvas, () => {});
  input.forceLocked();
});
afterEach(() => {
  documentTarget.pointerLockElement = null;
  input.detach();
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
});

test('right mouse scopes without boosting; left mouse still fires during scope', () => {
  assert.equal(mouse('mousedown', 2).defaultPrevented, true);
  mouse('mousedown', 0);
  const state = input.consume();
  assert.equal(state.zoom, true);
  assert.equal(state.boost, false);
  assert.equal(state.boostPressed, false);
  assert.equal(state.firePressed, true);
  assert.equal(input.consume().firePressed, false);
  mouse('mouseup', 2);
  assert.equal(input.zoomHeld, false);
  assert.equal(input.consume().fire, true);
});

test('mouse and alternate scope key release independently', () => {
  key('keydown', 'KeyC'); mouse('mousedown', 2); mouse('mouseup', 2);
  assert.equal(input.consume().zoom, true);
  mouse('mousedown', 2); key('keyup', 'KeyC');
  assert.equal(input.consume().zoom, true);
  mouse('mouseup', 2);
  assert.equal(input.consume().zoom, false);
});

test('blur, chat and pointer unlock clear held scope and do not resume it', () => {
  for (const clear of [
    () => windowTarget.dispatchEvent(new Event('blur')),
    () => { input.setChatting(true); input.setChatting(false); },
    () => documentTarget.dispatchEvent(new Event('pointerlockchange')),
  ]) {
    input.forceLocked(); mouse('mousedown', 2); key('keydown', 'KeyC');
    clear();
    assert.equal(input.zoomHeld, false);
    input.forceLocked();
    assert.equal(input.consume().zoom, false);
  }
});

test('mouse input is ignored in menus/chat and context menu is suppressed', () => {
  documentTarget.dispatchEvent(new Event('pointerlockchange'));
  mouse('mousedown', 2);
  assert.equal(input.zoomHeld, false);
  input.forceLocked(); input.setChatting(true); mouse('mousedown', 2);
  assert.equal(input.zoomHeld, false);
  assert.equal(mouse('contextmenu', 2).defaultPrevented, true);
});

test('boost moves to E, remains rebindable and migrates saved binds without conflicts', () => {
  key('keydown', 'KeyE');
  assert.equal(input.consume().boostPressed, true);
  assert.equal(input.consume().boostPressed, false);
  key('keyup', 'KeyE'); input.consume();
  input.setBindings({ ...DEFAULT_KEYBINDS, boost: 'KeyV' });
  key('keydown', 'KeyE'); assert.equal(input.consume().boost, false);
  key('keydown', 'KeyV'); assert.equal(input.consume().boostPressed, true);
  assert.equal(mergeKeybinds({ zoom: 'KeyC' }).boost, 'KeyE');
  const migrated = mergeKeybinds({ inspect: 'KeyE' });
  assert.equal(migrated.inspect, 'KeyE');
  assert.equal(migrated.boost, '');
});

test('detaching removes scope input listeners', () => {
  input.detach(); mouse('mousedown', 2);
  assert.equal(input.zoomHeld, false);
});
