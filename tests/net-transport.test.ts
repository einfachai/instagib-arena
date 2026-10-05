import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NetClient } from '../src/game/net';

test('congested pose uploads are discarded and the current pose resumes after the queue drains', () => {
  const client = new NetClient({ url: 'ws://example.invalid', name: 'Guest', roomId: '', events: {} });
  const sent: Uint8Array[] = [];
  const socket = { readyState: WebSocket.OPEN, bufferedAmount: 8192, send: (b: Uint8Array) => sent.push(b) };
  (client as any).ws = socket;
  for (let tick = 0; tick < 64; tick++) assert.equal(client.sendPosition(tick, 0, 0, 0, 0, tick), false);
  assert.equal(sent.length, 0, 'obsolete poses must not accumulate behind a congested socket');
  socket.bufferedAmount = 0;
  assert.equal(client.sendPosition(64, 0, 0, 0, 0, 64), true);
  assert.equal(sent.length, 1, 'only the current pose is published when transport recovers');
});

test('duplicate connects and a late close from an old socket cannot replace the current connection', () => {
  const original = globalThis.WebSocket;
  const sockets: any[] = [];
  class FakeSocket {
    static OPEN = 1; static CONNECTING = 0;
    readyState = 0; bufferedAmount = 0;
    onopen?: () => void; onmessage?: () => void; onclose?: (e: object) => void; onerror?: () => void;
    constructor() { sockets.push(this); }
    send() {} close() { this.readyState = 3; }
  }
  globalThis.WebSocket = FakeSocket as any;
  const client = new NetClient({ url: 'ws://example.invalid', name: 'Guest', roomId: '', events: {} });
  const warn = console.warn; console.warn = () => {};
  try {
    client.connect(); client.connect(); assert.equal(sockets.length, 1);
    const lateClose = sockets[0].onclose;
    sockets[0].readyState = 3; lateClose({ code: 1006, reason: '' });
    client.connect(); assert.equal(sockets.length, 2);
    lateClose({ code: 1006, reason: '' });
    assert.equal((client as any).ws, sockets[1]);
  } finally { client.dispose(); globalThis.WebSocket = original; console.warn = warn; }
});
