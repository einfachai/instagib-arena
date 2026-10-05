import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { beginArena, endArena } from '../src/codex-integration';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('starting an arena visit supports HTTP and HTTPS browser crypto', async t => {
  const originals = new Map(['window', 'crypto', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new Map<string, string>();
  const setGlobal = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const httpCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  setGlobal('window', { location: { hash: '' }, sessionStorage: { getItem: (key: string) => storage.get(key) ?? null } });
  try {
    await t.test('an unpaired guest can start distinct visits without randomUUID or API calls', async () => {
      storage.clear();
      setGlobal('crypto', httpCrypto);
      setGlobal('fetch', () => { throw new Error('An unpaired guest should not call the integration API'); });
      const first = await beginArena('completion');
      const second = await beginArena('completion');
      assert.match(first.attemptId, UUID_V4);
      assert.match(second.attemptId, UUID_V4);
      assert.notEqual(first.attemptId, second.attemptId);
      assert.equal(first.controllerToken, undefined);
      assert.equal(await endArena(first.attemptId), null);
    });

    await t.test('a paired HTTP visit sends the same valid UUID when starting and ending', async () => {
      storage.set('agent-deathmatch-controller', 'test-controller');
      setGlobal('crypto', httpCrypto);
      const requests: { route: string; init: RequestInit }[] = [];
      setGlobal('fetch', async (route: string, init: RequestInit) => {
        requests.push({ route, init });
        return { ok: true, json: async () => ({ ok: true }) };
      });
      const before = Date.now();
      const visit = await beginArena('attention');
      assert.match(visit.attemptId, UUID_V4);
      assert.equal(visit.controllerToken, 'test-controller');
      assert.equal(requests[0].route, '/api/arena/begin');
      const begin = JSON.parse(String(requests[0].init.body));
      assert.equal(begin.attemptId, visit.attemptId);
      assert.equal(begin.policy, 'attention');
      assert.ok(begin.requestedAt >= before && begin.requestedAt <= Date.now());
      assert.equal(new Headers(requests[0].init.headers).get('Authorization'), 'Bearer test-controller');
      await endArena(visit.attemptId);
      assert.equal(requests[1].route, '/api/arena/end');
      assert.deepEqual(JSON.parse(String(requests[1].init.body)), { attemptId: visit.attemptId });
    });

    await t.test('HTTPS browsers keep using their native randomUUID', async () => {
      storage.clear();
      const nativeId = 'b5d891b9-9073-4a38-a28e-d86bba8d82c4';
      setGlobal('crypto', {
        randomUUID: () => nativeId,
        getRandomValues: () => { throw new Error('Native UUID support should not use the fallback'); },
      });
      assert.equal((await beginArena('completion')).attemptId, nativeId);
    });
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
