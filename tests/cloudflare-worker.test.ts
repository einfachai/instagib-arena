import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../cloudflare/worker';

const PUBLIC = 'https://agent-deathmatch.example.workers.dev';
const GAME = 'https://game.example.invalid';
const env = () => ({
  ASSETS: { fetch: async () => new Response('frontend') },
  GAME_ORIGIN: GAME, GAME_PROXY_KEY: 'test-proxy-key',
});

test('frontend routes use the assets binding without contacting the game server', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected game request'); });
  for (const path of ['/', '/play', '/assets/game.js', '/models/robot.glb']) {
    assert.equal(await (await worker.fetch(new Request(PUBLIC + path), env())).text(), 'frontend');
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test('the proxy refuses missing secrets and invalid or insecure upstreams', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not contact invalid upstream'); });
  const request = new Request(PUBLIC + '/api/health');
  assert.equal((await worker.fetch(request, { ...env(), GAME_PROXY_KEY: undefined })).status, 503);
  for (const origin of ['not a URL', 'http://game.example.invalid', PUBLIC, 'https://user:pass@game.example.invalid']) {
    assert.equal((await worker.fetch(request, { ...env(), GAME_ORIGIN: origin })).status, 503);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test('cross-site browser requests are rejected before they can reach the VPS', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => new Response('unexpected'));
  for (const path of ['/api/stats', '/api/auth/login', '/ws/instagib']) {
    const response = await worker.fetch(new Request(PUBLIC + path, {
      headers: { Origin: 'https://attacker.example', Upgrade: 'websocket' },
    }), env());
    assert.equal(response.status, 403);
  }
  assert.equal((await worker.fetch(new Request(PUBLIC + '/api/auth/login', {
    method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' },
  }), env())).status, 403);
  assert.equal(upstream.mock.callCount(), 0);
});

test('API requests preserve bodies and session cookies while replacing spoofed proxy identity', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', async (input, options) => {
    const request = input as Request;
    assert.equal(request.url, GAME + '/api/auth/login?next=%2Fplay');
    assert.equal(request.method, 'POST');
    assert.equal(await request.text(), '{"username":"guest"}');
    assert.equal(request.headers.get('Origin'), PUBLIC);
    assert.equal(request.headers.get('Cookie'), 'igsession=test-session');
    assert.equal(request.headers.get('Authorization'), 'Bearer test-controller');
    assert.equal(request.headers.get('X-Arena-Proxy-Key'), 'test-proxy-key');
    assert.equal(request.headers.get('X-Arena-Client-IP'), '203.0.113.7');
    for (const header of ['Host', 'Forwarded', 'X-Forwarded-For', 'X-Forwarded-Host', 'X-Real-IP']) {
      assert.equal(request.headers.get(header), null, header);
    }
    assert.equal(options?.redirect, 'manual');
    const headers = new Headers();
    headers.append('Set-Cookie', 'igsession=new-session; HttpOnly; Secure; SameSite=Lax; Path=/');
    headers.append('Set-Cookie', 'another=value; Secure; Path=/');
    return new Response('{"ok":true}', { headers });
  });
  const response = await worker.fetch(new Request(PUBLIC + '/api/auth/login?next=%2Fplay', {
    method: 'POST', body: '{"username":"guest"}',
    headers: {
      Origin: PUBLIC, Cookie: 'igsession=test-session', Authorization: 'Bearer test-controller',
      'CF-Connecting-IP': '203.0.113.7', 'X-Arena-Proxy-Key': 'forged', 'X-Arena-Client-IP': 'forged',
      Host: 'forged.example', Forwarded: 'for=forged', 'X-Forwarded-For': 'forged',
      'X-Forwarded-Host': 'forged.example', 'X-Real-IP': 'forged',
    },
  }), env());
  assert.equal(await response.text(), '{"ok":true}');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.match(response.headers.getSetCookie()[0], /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(upstream.mock.callCount(), 1);
});

test('WebSockets require a same-origin upgrade and return the upstream socket response unchanged', async t => {
  const upgrade = { status: 101, webSocket: { marker: 'binary-game-socket' } } as unknown as Response;
  const upstream = t.mock.method(globalThis, 'fetch', async input => {
    const request = input as Request;
    assert.equal(request.url, GAME + '/ws/instagib');
    assert.equal(request.headers.get('Upgrade'), 'websocket');
    return upgrade;
  });
  assert.equal((await worker.fetch(new Request(PUBLIC + '/ws/instagib'), env())).status, 403);
  assert.equal((await worker.fetch(new Request(PUBLIC + '/ws/instagib', { headers: { Origin: PUBLIC } }), env())).status, 426);
  assert.equal(await worker.fetch(new Request(PUBLIC + '/ws/instagib', {
    headers: { Origin: PUBLIC, Upgrade: 'websocket' },
  }), env()), upgrade);
  assert.equal(upstream.mock.callCount(), 1);
});

test('URL query parameters and double slashes cannot select another upstream', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    assert.equal((input as Request).url, GAME + '/api//attacker.example/path?target=https://attacker.example');
    return new Response('ok');
  });
  assert.equal((await worker.fetch(new Request(PUBLIC + '/api//attacker.example/path?target=https://attacker.example'), env())).status, 200);
});

test('redirects stay on the public origin and never forward credentials to another host', async t => {
  let location = GAME + '/api/auth/me';
  const upstream = t.mock.method(globalThis, 'fetch', async (_input, options) => {
    assert.equal(options?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: location } });
  });
  const request = new Request(PUBLIC + '/api/auth/login');
  const response = await worker.fetch(request, env());
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), PUBLIC + '/api/auth/me');
  location = 'https://attacker.example/steal';
  assert.equal((await worker.fetch(request, env())).status, 502);
  assert.equal(upstream.mock.callCount(), 2);
});

test('upstream failures return a bounded error without exposing secrets', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('test-proxy-key'); });
  const response = await worker.fetch(new Request(PUBLIC + '/api/health'), env());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'game_server_unavailable' });
});
