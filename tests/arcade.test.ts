import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { setTimeout as delay } from 'node:timers/promises';
import { ArcadeVisit, desiredBots } from '../server/arcade-visit';
import { arcadeXpLines } from '../src/game/arcade-rewards';
import { newVisit } from '../src/game/arcade';
import { decodeState, encodePosTick, toView } from '../src/game/netcodec';
import { validPlayerMove } from '../server/game-validation';
import { DAILY_CHALLENGES, WEEKLY_CHALLENGES } from '../src/game/challenges';

const dir = mkdtempSync(join(tmpdir(), 'arena-lifecycle-'));
process.env.DATA_DIR = dir;
const db = await import('../server/db');
const { sqlite } = await import('../server/sqlite');
const { ArenaControllers } = await import('../server/arena-controller');
const { attachInstagibWs } = await import('../server/instagib-game');
const controllers = new ArenaControllers();
const app = express(); app.use(express.json()); app.use('/api/arena', controllers.claimRouter(), controllers.router());
const http = createServer(app);
const wss = new WebSocketServer({ server: http });
const game = attachInstagibWs(wss, controllers);
let origin: string;
const clients = new Set<Peer>();
class Peer {
  ws: WebSocket;
  messages: any[] = [];
  frames: Buffer[] = [];
  private heartbeat?: ReturnType<typeof setInterval>;
  constructor() {
    this.ws = new WebSocket(origin.replace('http:', 'ws:'));
    this.ws.on('open', () => { this.heartbeat = setInterval(() => { if (this.ws.readyState === WebSocket.OPEN) this.send({ type: 'ping', t: Date.now() }); }, 500); });
    this.ws.on('close', () => clearInterval(this.heartbeat));
    this.ws.on('message', (raw, binary) => { if (binary) { this.frames.push(raw as Buffer); if (this.frames.length > 256) this.frames.shift(); } else this.messages.push(JSON.parse(raw.toString())); });
    clients.add(this);
  }
  send(message: object) { this.ws.send(JSON.stringify(message)); }
  pauseHeartbeat() { clearInterval(this.heartbeat); }
  async next(type: string, predicate = (_m: any) => true, timeout = 15000): Promise<any> {
    const end = performance.now() + timeout;
    for (;;) {
      const i = this.messages.findIndex(m => m.type === type && predicate(m));
      if (i >= 0) return this.messages.splice(i, 1)[0];
      if (performance.now() >= end) break;
      await delay(10);
    }
    throw new Error(`Missing ${type}; received ${this.messages.map(m => m.type).join(',')}`);
  }
  clear() { this.messages = []; }
  async arena(extra = {}) { this.send({ type: 'arena', ...extra }); return this.next('joined'); }
  async leave() { this.send({ type: 'leave' }); return this.next('session-ended'); }
}
async function peer() { const p = new Peer(); const welcome = await p.next('welcome'); return { p, welcome }; }
async function api(route: string, token?: string, body?: object) {
  const res = await fetch(`${origin}/api/arena${route}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : null };
}
async function controller() {
  const root = (await api('/controllers', undefined, {})).body;
  const ticket = (await api('/pair', root.token, {})).body.ticket;
  const browser = (await api('/claim', undefined, { ticket })).body.token;
  assert.equal((await api('/claim', undefined, { ticket })).status, 401);
  return { root: root.token, browser };
}
before(async () => { await new Promise<void>((resolve, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', resolve); }); origin = `http://127.0.0.1:${(http.address() as any).port}`; });
afterEach(async () => {
  // Failed assertions must not leave combatants contaminating later room tests.
  await Promise.all([...clients].map(async p => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.send({ type: 'leave' });
      try { await p.next('session-ended', () => true, 1000); } catch { /* Already outside combat. */ }
    }
    p.ws.terminate();
  }));
  clients.clear(); await delay(50);
});
after(async () => { game.dispose(); for (const p of clients) p.ws.terminate(); await new Promise<void>(resolve => http.close(() => resolve())); wss.close(); sqlite.close(); rmSync(dir, { recursive: true, force: true }); });

test('visit clock excludes dropped time and counters exceed the snapshot range', () => {
  const v = new ArcadeVisit(1000); v.advance(2000, true, false); v.advance(10000, false, true); v.advance(11000, true, true);
  for (let i = 0; i < 70000; i++) { v.shot(i % 2 === 0); v.kill(i % 2 === 0, false); }
  assert.equal(v.stats.durationMs, 2000); assert.equal(v.stats.humanDurationMs, 1000);
  assert.equal(v.stats.kills, 70000); assert.equal(v.stats.shots, 70000); assert.equal(v.stats.human.kills, 35000);
  const frozen = v.freeze(); v.shot(true); v.death(false); v.advance(20000, true, true); assert.deepEqual(v.stats, frozen);
  assert.deepEqual([0, 1, 2, 3, 2, 1, 0].map(desiredBots), [0, 3, 0, 0, 0, 3, 0]);
});

test('0→1→2→3→2→1→0 has exactly three bots only when alone; visits stay independent', async () => {
  const { p: a, welcome: aw } = await peer(); const aj = await a.arena();
  const alone = await a.next('visit-stats'); assert.equal(alone.players.filter((p: any) => p.actor === 'bot').length, 3);
  assert.ok(!a.messages.some(m => m.type === 'arena-notice'));
  assert.equal(game.liveCounts().inMatch, 1); assert.equal(game.liveCounts().online, 1);
  await delay(180); a.clear();
  const { p: b } = await peer(); const bj = await b.arena(); assert.equal(bj.roomId, aj.roomId); assert.equal(bj.mapId, aj.mapId);
  const two = await a.next('visit-stats', m => m.players.length === 2);
  const entered = await a.next('arena-notice', m => m.clip === 'codex-entered');
  assert.equal(entered.text, 'Codex user entered the arena.');
  assert.equal((await b.next('arena-notice')).id, entered.id);
  assert.ok(two.players.every((p: any) => p.actor === 'human'));
  const incumbent = two.players.find((p: any) => p.id === aw.clientId);
  assert.equal(incumbent.visitId, aj.visitId); assert.ok(incumbent.durationMs > 150);
  assert.ok(incumbent.durationMs > two.players.find((p: any) => p.id !== aw.clientId).durationMs);
  assert.equal(incumbent.kills, alone.players.find((p: any) => p.id === aw.clientId).kills);
  a.clear(); b.clear();
  const { p: c } = await peer(); const cj = await c.arena(); assert.equal(cj.roomId, aj.roomId);
  await a.next('visit-stats', m => m.players.length === 3);
  await c.leave(); await a.next('visit-stats', m => m.players.length === 2);
  assert.ok(!a.messages.some(m => m.type === 'arena-notice'));
  assert.ok(!b.messages.some(m => m.type === 'arena-notice'));
  a.clear(); await b.leave();
  const back = await a.next('visit-stats', m => m.players.filter((p: any) => p.actor === 'bot').length === 3);
  assert.equal(back.players.find((p: any) => p.id === aw.clientId).visitId, aj.visitId);
  const notice = await a.next('arena-notice', m => m.clip === 'codex-alone'); assert.equal(notice.text, 'All other Codex users left the arena.');
  const ended = await a.leave(); assert.equal(ended.stats.visitId, aj.visitId); assert.equal(ended.reason, 'manual');
  assert.equal(game.liveCounts().inMatch, 0);
  a.clear(); const again = await a.arena(); assert.notEqual(again.visitId, aj.visitId);
  const fresh = await a.next('visit-stats'); assert.equal(fresh.players.find((p: any) => p.actor === 'human').kills, 0);
  assert.ok(!a.messages.some(m => m.type === 'arena-notice'));
  await a.leave(); for (const p of [a, b, c]) p.ws.terminate(); await delay(50);
});

test('simultaneous joins respect eight human slots and fullest-arena matchmaking', async () => {
  const peers = await Promise.all(Array.from({ length: 9 }, () => peer()));
  const joins = await Promise.all(peers.map(({ p }) => p.arena()));
  const counts = new Map<string, number>(); for (const j of joins) counts.set(j.roomId, (counts.get(j.roomId) ?? 0) + 1);
  assert.deepEqual([...counts.values()].sort(), [1, 8]);
  await Promise.all(peers.map(({ p }) => p.leave()));
  for (const { p } of peers) p.ws.terminate(); await delay(50);
});

test('buffered movement tolerates a short delivery burst while a sustained flood still closes', async () => {
  const { p } = await peer(); const joined = await p.arena();
  // TCP can deliver several seconds of 64 Hz movement together after a stall.
  for (let tick = 1; tick <= 180; tick++) p.ws.send(encodePosTick(joined.spawn.x, joined.spawn.y, joined.spawn.z, 0, 0, tick, 0));
  const probeTs = -12345;
  p.send({ type: 'ping', ts: probeTs });
  await p.next('pong', m => m.ts === probeTs, 15000);
  assert.equal(p.ws.readyState, WebSocket.OPEN);
  const closed = new Promise<number>(resolve => p.ws.once('close', resolve));
  for (let tick = 181; tick <= 1200; tick++) p.ws.send(encodePosTick(joined.spawn.x, joined.spawn.y, joined.spawn.z, 0, 0, tick, 0));
  assert.equal(await closed, 1008);
});

test('transport pongs keep a throttled browser connected without application timers', async () => {
  const { p } = await peer(); await p.arena(); p.pauseHeartbeat();
  const socket = [...wss.clients].find(ws => ws.readyState === WebSocket.OPEN)!;
  const transportPing = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.ping(); }, 15000);
  try {
    await delay(36000);
    assert.equal(p.ws.readyState, WebSocket.OPEN);
    assert.ok(p.frames.length > 0);
    p.send({ type: 'ping', ts: -23456 });
    await p.next('pong', m => m.ts === -23456);
    await p.leave();
  } finally { clearInterval(transportPing); }
});

test('reconnect resumes the same visit, pauses playtime, and removes solo bots atomically', async () => {
  const { p: a, welcome: aw } = await peer(); const aj = await a.arena();
  const { p: b } = await peer(); await b.arena(); a.clear(); b.clear();
  await delay(180); const before = await b.next('visit-stats', m => m.players.length === 2);
  const elapsed = before.players.find((p: any) => p.id === aw.clientId).durationMs;
  a.ws.terminate(); await b.next('visit-stats', m => m.players.some((p: any) => p.actor === 'bot'));
  await delay(650);
  const { p: returned, welcome: rw } = await peer(); returned.send({ type: 'resume', token: aw.resumeToken });
  const resumed = await returned.next('joined'); assert.equal(resumed.visitId, aj.visitId);
  const stats = await returned.next('visit-stats', m => m.players.length === 2);
  const own = stats.players.find((p: any) => p.id === rw.clientId);
  assert.ok(own.durationMs >= elapsed);
  assert.ok(Date.now() - own.startedAt - own.durationMs >= 600, 'the acknowledged disconnection is excluded from playtime');
  assert.ok(stats.players.every((p: any) => p.actor === 'human'));
  await Promise.all([returned.leave(), b.leave()]); returned.ws.terminate(); b.ws.terminate(); await delay(50);
});

test('a solo reconnect restores bots and the same visit without an arrival or leaving callout', async () => {
  const { p, welcome } = await peer(); const joined = await p.arena();
  await p.next('visit-stats'); p.ws.terminate(); await delay(100);
  const { p: returned } = await peer(); returned.send({ type: 'resume', token: welcome.resumeToken });
  assert.equal((await returned.next('joined')).visitId, joined.visitId);
  const stats = await returned.next('visit-stats');
  assert.equal(stats.players.filter((p: any) => p.actor === 'bot').length, 3);
  assert.ok(!returned.messages.some(m => m.type === 'arena-notice'));
  await returned.leave();
});

test('authoritative bots move, shoot and despawn during firing without phantom kills', async () => {
  const { p: a, welcome: aw } = await peer(); const joined = await a.arena();
  const rows = await a.next('visit-stats'); const bots = new Set(rows.players.filter((p: any) => p.actor === 'bot').map((p: any) => p.id));
  await a.next('beam', m => bots.has(m.id), 30000);
  const frame = decodeState(toView(a.frames.at(-1)!))!;
  for (const actor of frame.players) assert.ok(validPlayerMove(joined.mapId, actor, actor));
  const { p: b } = await peer(); await b.arena();
  const transition = await a.next('visit-stats', m => m.players.length === 2);
  const own = transition.players.find((p: any) => p.id === aw.clientId);
  a.clear(); await delay(1100);
  assert.ok(!a.messages.some(m => (m.type === 'beam' && bots.has(m.id)) || (m.type === 'kill' && (bots.has(m.killerId) || bots.has(m.victimId)))));
  const live = await a.next('visit-stats'); assert.equal(live.players.find((p: any) => p.id === aw.clientId).kills, own.kills);
  assert.equal(live.players.find((p: any) => p.id === aw.clientId).deaths, own.deaths);
  await Promise.all([a.leave(), b.leave()]); a.ws.terminate(); b.ws.terminate(); await delay(50);
});

test('paired events are isolated, scoped, deduplicated and cancel pending matchmaking', async () => {
  const a = await controller(), b = await controller(); const attemptA = randomUUID(), attemptB = randomUUID();
  await api('/begin', a.browser, { attemptId: attemptA }); await api('/begin', b.browser, { attemptId: attemptB, policy: 'attention' });
  const { p } = await peer(); const joined = await p.arena({ controllerToken: b.browser, attemptId: attemptB });
  const event = { eventId: randomUUID(), taskId: 'chat-one', source: 'local', category: 'approval-required', occurredAt: Date.now(), taskLink: 'codex://threads/chat-one' };
  assert.equal((await api('/event', a.root, { attemptId: attemptA, event })).body.accepted, false);
  assert.equal((await api('/event', a.browser, { attemptId: attemptA, event: { ...event, eventId: randomUUID(), category: 'completion' } })).body.accepted, false);
  const helper = (await api('/helper', a.root, { host: 'host-a' })).body.token;
  assert.equal((await api('/event', helper, { attemptId: attemptA, event: { ...event, eventId: randomUUID(), category: 'completion' } })).body.accepted, false);
  const done = { ...event, category: 'completion', eventId: randomUUID() };
  assert.equal((await api('/event', a.root, { attemptId: attemptA, event: done })).body.accepted, true);
  assert.equal((await api('/event', a.root, { attemptId: attemptA, event: done })).body.accepted, false);
  const cancelled = (await api('/state', a.browser)).body.active;
  assert.equal(cancelled.result.stats.durationMs, 0);
  assert.equal((await api('/state', b.browser)).body.active.ended, undefined);
  assert.equal((await api('/handoff', a.browser, { visitId: cancelled.visitId })).status, 409);
  const { p: cancelledPeer } = await peer(); cancelledPeer.send({ type: 'arena', controllerToken: a.browser, attemptId: attemptA });
  assert.equal((await cancelledPeer.next('join-failed')).reason, 'cancelled'); cancelledPeer.ws.terminate();
  assert.equal((await api('/event', b.root, { attemptId: attemptB, event: { ...event, eventId: randomUUID() } })).body.accepted, true);
  const ended = await p.next('session-ended'); assert.equal(ended.stats.visitId, joined.visitId); assert.equal(ended.reason, 'approval-required');
  const nextAttempt = randomUUID(); await api('/begin', b.browser, { attemptId: nextAttempt });
  assert.equal((await api('/handoff', b.browser, { visitId: ended.stats.visitId })).status, 409);
  assert.equal((await api('/event', b.root, { attemptId: attemptB, event: { ...done, eventId: randomUUID() } })).body.accepted, false);
  p.ws.terminate(); await delay(50);
});

test('mixed settlement is atomic, capped and exactly once; bot combat never changes career data', () => {
  const now = Date.now(); const user = 'arcade-rewards';
  db.createUser({ id: user, username: 'ArenaRewards', usernameLower: 'arenarewards', pwHash: '00'.repeat(64), pwSalt: 'test', email: null, createdAt: now - 86400000 });
  const stats = newVisit(randomUUID(), now - 600000); Object.assign(stats, { durationMs: 600000, humanDurationMs: 600000, kills: 10004, shots: 10010, hits: 10004 });
  Object.assign(stats.human, { kills: 4, deaths: 2, shots: 10, hits: 4, headshots: 1, bestStreak: 3 });
  Object.assign(stats.bot, { kills: 10000, shots: 10000, hits: 10000, headshots: 3000, bestStreak: 50 });
  const delta = { playerId: user, userName: 'ArenaRewards', kills: 4, deaths: 2, wins: 0, shotsFired: 10, shotsHit: 4, headshots: 1, bestStreak: 3, accuracy: 40, offline: false, now, arcade: stats, humanPlaytimeSeconds: 600 };
  const reward = db.recordMatch(delta); const stored = db.getStats(user);
  assert.equal(stored.totalKills, 4); assert.equal(stored.totalDeaths, 2); assert.equal(stored.totalWins, 0);
  const ledger = sqlite.prepare('SELECT total_xp, credits, offline_xp, first_win_day FROM instagib_stats WHERE player_id = ?').get(user) as any;
  assert.ok(ledger.offline_xp > 1400 && ledger.offline_xp <= 1500); assert.equal(ledger.first_win_day, 0);
  assert.deepEqual(db.recordMatch(delta), reward); assert.deepEqual(db.getStats(user), stored);
  assert.deepEqual(sqlite.prepare('SELECT total_xp, credits, offline_xp, first_win_day FROM instagib_stats WHERE player_id = ?').get(user), ledger);
  assert.equal(reward.xpLines.filter((l: any) => l.key === 'base').length, 1);
  assert.ok(!reward.xpLines.some((l: any) => ['win', 'firstWin'].includes(l.key)));
  const solo = newVisit(randomUUID(), now); solo.durationMs = 180000; Object.assign(solo.bot, { kills: 1000, shots: 1000, hits: 1000 });
  const capped = db.recordMatch({ ...delta, kills: 0, deaths: 0, shotsFired: 0, shotsHit: 0, bestStreak: 0, headshots: 0, arcade: solo, offline: true });
  assert.ok(capped.xpGained <= 1500 - ledger.offline_xp); assert.deepEqual(db.getStats(user), stored);
  assert.ok(DAILY_CHALLENGES.some(c => c.id === 'daily:human-playtime' && c.goal === 600 && c.rewardXp === 110));
  assert.ok(WEEKLY_CHALLENGES.some(c => c.id === 'weekly:human-playtime' && c.goal === 3600 && c.rewardXp === 420));
  assert.ok(![...DAILY_CHALLENGES, ...WEEKLY_CHALLENGES].some(c => c.metric === 'wins'));
  const split = arcadeXpLines({ human: { kills: 0, headshots: 0, bestStreak: 0, accuracy: 0, won: false }, bot: { ...stats.bot, kills: 0, shots: 0, hits: 0, headshots: 0, bestStreak: 0 }, durationMs: 180000, humanDurationMs: 90000 });
  assert.equal(split.xp, 16); // one participation share, half normal + half practice
});

test('five-second desktop return is scoped to its ended visit and SSH events only end the paired player', async () => {
  const c = await controller(), attemptId = randomUUID(); await api('/begin', c.browser, { attemptId });
  const helper = (await api('/helper', c.root, { host: 'test-host' })).body.token;
  const { p } = await peer(); const joined = await p.arena({ controllerToken: c.browser, attemptId });
  const { p: other } = await peer(); await other.arena(); other.clear();
  const event = { eventId: randomUUID(), taskId: 'remote-chat', category: 'completion', source: 'ssh', occurredAt: Date.now() };
  assert.equal((await api('/event', helper, { attemptId, event })).body.accepted, true);
  await p.next('session-ended'); await other.next('visit-stats', m => m.players.some((p: any) => p.actor === 'bot'));
  assert.equal((await api('/handoff', c.browser, { visitId: joined.visitId })).status, 409);
  await delay(5100);
  assert.equal((await api('/handoff', c.browser, { visitId: joined.visitId })).status, 200);
  assert.equal((await api('/handoff-ack', helper, { visitId: joined.visitId })).status, 409);
  assert.equal((await api('/handoff-claim', c.root, { visitId: joined.visitId })).status, 200);
  assert.equal((await api('/begin', c.browser, { attemptId: randomUUID() })).status, 409);
  assert.equal((await api('/handoff-ack', c.root, { visitId: joined.visitId, success: true })).status, 200);
  assert.equal((await api('/state', c.browser)).body.active.handoffResult, 'complete');
  const next = randomUUID(); await api('/begin', c.browser, { attemptId: next });
  assert.equal((await api('/handoff', c.browser, { visitId: joined.visitId })).status, 409);
  await other.leave(); p.ws.terminate(); other.ws.terminate(); await delay(50);
});

test('empty arenas stop bot simulation and are reaped after the existing grace period', async () => {
  const { p } = await peer(); const joined = await p.arena(); await p.leave();
  assert.equal(game.liveCounts().inMatch, 0); p.clear(); await delay(35000);
  p.send({ type: 'join', roomId: joined.roomId }); assert.equal((await p.next('join-failed')).reason, 'gone');
  assert.ok(!p.messages.some(m => m.type === 'beam')); p.ws.terminate();
});

test('a completion during pairing cancels the attempted visit without carrying historical events into re-entry', async () => {
  const c = await controller(); const clickAt = Date.now();
  const event = { eventId: randomUUID(), taskId: 'pairing-chat', category: 'completion', source: 'local', occurredAt: clickAt + 1 };
  await delay(5); await api('/event', c.root, { event });
  const cancelled = await api('/begin', c.browser, { attemptId: randomUUID(), requestedAt: clickAt });
  assert.equal(cancelled.body.ended, true); assert.equal(cancelled.body.result.stats.durationMs, 0);
  await delay(5); const next = await api('/begin', c.browser, { attemptId: randomUUID(), requestedAt: Date.now() });
  assert.equal(next.body.ended, undefined);
});

test('completion with no observed attempt catches Play racing the companion state lookup', async () => {
  const c = await controller(), attemptId = randomUUID();
  await api('/begin', c.browser, { attemptId });
  const event = { eventId: randomUUID(), taskId: 'lookup-race', category: 'completion', source: 'local', occurredAt: Date.now() };
  assert.equal((await api('/event', c.root, { attemptId: null, event })).body.accepted, true);
  const ended = (await api('/state', c.browser)).body.active;
  assert.equal(ended.ended, true);
  await api('/begin', c.browser, { attemptId: randomUUID() });
  assert.equal((await api('/event', c.root, { attemptId, event: { ...event, eventId: randomUUID(), occurredAt: Date.now() } })).body.accepted, false);
});

test('an idle arcade visit delivers frozen personal results before the socket closes', async () => {
  const { p } = await peer(); const joined = await p.arena();
  const actualNow = Date.now;
  try {
    Date.now = () => actualNow() + 121_000;
    const ended = await p.next('session-ended', () => true, 15000);
    assert.equal(ended.reason, 'idle'); assert.equal(ended.stats.visitId, joined.visitId);
    assert.ok(!p.messages.some(m => m.type === 'error'));
    assert.equal(game.liveCounts().inMatch, 0);
  } finally { Date.now = actualNow; p.ws.terminate(); }
});
