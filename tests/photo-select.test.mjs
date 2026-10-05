import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { photoSelectRequest } from '../scripts/photo-select.mjs';

test('photo controls pass hostile text as data without changing evaluated source', () => {
  const baseline = photoSelectRequest('document', 'Map', 'reactor');
  for (const text of ["'; globalThis.injected = true; //", '"\\\n\r` ${globalThis.injected = true}', '</script><img src=x onerror=alert(1)>', '\u2028\u2029']) {
    const request = photoSelectRequest('document', text, text);
    assert.equal(request.functionDeclaration, baseline.functionDeclaration);
    assert.deepEqual(request.arguments, [{ value: text }, { value: text }]);
    const context = { injected: false, Event: class { constructor(type, options) { this.type = type; this.bubbles = options.bubbles; } } };
    const select = { getAttribute: name => name === 'aria-label' ? text : null, value: '', dispatchEvent: event => { assert.equal(event.type, 'change'); assert.equal(event.bubbles, true); } };
    const control = runInNewContext(`(${request.functionDeclaration})`, context);
    assert.equal(control.apply({ querySelectorAll: () => [select] }, request.arguments.map(arg => arg.value)), true);
    assert.equal(select.value, text);
    assert.equal(context.injected, false);
    assert.equal(control.apply({ querySelectorAll: () => [] }, request.arguments.map(arg => arg.value)), false);
  }
});
