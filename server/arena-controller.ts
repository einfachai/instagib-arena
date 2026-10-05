import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Router } from 'express';
import { sqlite } from './sqlite';
import type { CodexEvent, ExitPolicy } from '../src/game/arcade';
import { newVisit } from '../src/game/arcade';

type Role = 'companion' | 'browser' | 'helper';
type Credential = { controller_id: string; role: Role; source: string };
type Active = { attemptId: string; startedAt: number; policy: ExitPolicy; clientId?: string; visitId?: string; ended?: boolean; event?: CodexEvent; endedAt?: number; handoff?: string; handoffClaimedAt?: number; handoffResult?: 'complete' | 'failed'; result?: object };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
sqlite.exec(`CREATE TABLE IF NOT EXISTS arena_controller_credentials (
  token_hash TEXT PRIMARY KEY, controller_id TEXT NOT NULL, role TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS arena_controller_id ON arena_controller_credentials(controller_id);`);
const lookup = sqlite.prepare('SELECT controller_id, role, source FROM arena_controller_credentials WHERE token_hash = ?');
const insert = sqlite.prepare('INSERT INTO arena_controller_credentials VALUES (?, ?, ?, ?, ?)');

export class ArenaControllers {
  private active = new Map<string, Active>();
  private tickets = new Map<string, { controllerId: string; expires: number }>();
  private seen = new Map<string, Map<string, number>>();
  private recent = new Map<string, CodexEvent[]>();
  private statuses = new Map<string, { updatedAt: number; providers: Record<string, string>; times: Record<string, number> }>();
  onEvent: (clientId: string, event: CodexEvent) => void = () => {};
  onEnd: (clientId: string) => void = () => {};
  credential(token: unknown): Credential | null {
    if (typeof token !== 'string' || token.length !== 43) return null;
    return (lookup.get(hash(token)) as Credential | undefined) ?? null;
  }
  issue(controllerId: string, role: Role, source: string) {
    const token = secret(); insert.run(hash(token), controllerId, role, source, Date.now()); return token;
  }
  begin(token: string, attemptId: string, policy: ExitPolicy, requestedAt?: number) {
    const c = this.credential(token);
    if (!c || c.role !== 'browser' || !/^[\w-]{8,80}$/.test(attemptId)) return null;
    const prior = this.active.get(c.controller_id);
    if (prior?.clientId && !prior.ended) return null;
    if (prior?.handoffClaimedAt && Date.now() - prior.handoffClaimedAt < 10_000) return null;
    const now = Date.now();
    const state: Active = { attemptId, startedAt: Number.isFinite(requestedAt) && Math.abs(now - requestedAt!) < 30_000 ? Math.min(now, requestedAt!) : now, policy };
    this.active.set(c.controller_id, state); return state;
  }
  bind(token: string, attemptId: string, clientId: string, visitId: string) {
    const c = this.credential(token);
    const a = c && this.active.get(c.controller_id);
    if (!c || c.role !== 'browser' || !a || a.attemptId !== attemptId || a.ended || a.clientId) return false;
    Object.assign(a, { clientId, visitId }); return true;
  }
  resume(oldId: string, newId: string) {
    for (const a of this.active.values()) if (a.clientId === oldId) a.clientId = newId;
  }
  ended(clientId: string, event?: CodexEvent, result?: object) {
    for (const a of this.active.values()) if (a.clientId === clientId) {
      a.ended = true; a.endedAt ??= Date.now(); if (event) a.event = event;
      if (result) a.result = result;
    }
  }
  accept(c: Credential, input: unknown) {
    const body = input as { attemptId?: unknown; event?: Partial<CodexEvent> };
    const e = body?.event;
    const a = this.active.get(c.controller_id);
    if (!e || !['local', 'ssh', 'cloud'].includes(e.source ?? '') ||
      (c.role === 'helper' && e.source !== 'ssh') || c.role === 'browser' ||
      typeof e.eventId !== 'string' || e.eventId.length > 500 || typeof e.taskId !== 'string' || e.taskId.length > 200 ||
      !['completion', 'approval-required', 'input-required', 'terminal-error'].includes(e.category ?? '') ||
      !Number.isFinite(e.occurredAt)) return false;
    const now = Date.now();
    let seen = this.seen.get(c.controller_id);
    if (!seen) this.seen.set(c.controller_id, seen = new Map());
    for (const [key, ts] of seen) if (now - ts > 86_400_000) seen.delete(key);
    if (seen.has(e.eventId)) return false;
    seen.set(e.eventId, now);
    if (seen.size > 4096) seen.delete(seen.keys().next().value!);
    const event: CodexEvent = { eventId: e.eventId, taskId: e.taskId, source: e.source!, category: e.category!, occurredAt: e.occurredAt! };
    if (typeof e.taskLink === 'string' && e.taskLink.length < 500 &&
      (/^codex:\/\/threads\/[\w-]+$/.test(e.taskLink) || /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(e.taskLink))) event.taskLink = e.taskLink;
    if (e.occurredAt! > now + 30_000 || (body.attemptId && body.attemptId !== a?.attemptId)) return false;
    this.recent.set(c.controller_id, [...(this.recent.get(c.controller_id) ?? []).filter(e => now - e.occurredAt < 30_000), event].slice(-32));
    // A companion can observe no active attempt just before Play creates one.
    // Timestamp scoping covers that race; an explicit old attempt still fails above.
    if (!a || a.ended || e.occurredAt! < a.startedAt) return false;
    if (a.policy === 'completion' && e.category !== 'completion') return false;
    this.endFromEvent(a, event, now);
    return true;
  }
  private endFromEvent(a: Active, event: CodexEvent, now = Date.now()) {
    a.event = event;
    a.ended = true;
    a.endedAt = now;
    if (a.clientId) this.onEvent(a.clientId, event);
    else {
      a.visitId = `cancelled-${randomUUID()}`;
      a.result = { type: 'session-ended', stats: newVisit(a.visitId, now), reason: event.category,
        event, returnAfterMs: 5000, rewardsPending: false };
    }
  }
  router() {
    const router = Router();
    router.post('/controllers', (_req, res) => {
      const controllerId = randomUUID();
      res.json({ controllerId, token: this.issue(controllerId, 'companion', 'local') });
    });
    router.use((req, res, next) => {
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const credential = this.credential(token);
      if (!credential) { res.status(401).json({ error: 'unpaired' }); return; }
      res.locals.credential = credential; res.locals.token = token; next();
    });
    router.post('/pair', (_req, res) => {
      const c: Credential = res.locals.credential;
      if (c.role !== 'companion') { res.sendStatus(403); return; }
      const ticket = secret();
      const now = Date.now();
      for (const [t, v] of this.tickets) if (v.expires < now) this.tickets.delete(t);
      this.tickets.set(ticket, { controllerId: c.controller_id, expires: now + 180_000 });
      res.json({ ticket });
    });
    router.post('/helper', (req, res) => {
      const c: Credential = res.locals.credential;
      if (c.role !== 'companion') { res.sendStatus(403); return; }
      res.json({ token: this.issue(c.controller_id, 'helper', String(req.body?.host ?? 'ssh').slice(0, 100)) });
    });
    router.post('/begin', (req, res) => {
      const state = this.begin(res.locals.token, req.body?.attemptId, req.body?.policy === 'attention' ? 'attention' : 'completion', req.body?.requestedAt);
      if (!state) { res.status(409).json({ error: 'already-playing' }); return; }
      const c: Credential = res.locals.credential;
      const event = this.recent.get(c.controller_id)?.find(e => e.occurredAt >= state.startedAt && (state.policy === 'attention' || e.category === 'completion'));
      if (event) this.endFromEvent(state, event);
      res.json(state);
    });
    router.get('/state', (_req, res) => {
      const c: Credential = res.locals.credential;
      const status = this.statuses.get(c.controller_id);
      if (status) for (const key of Object.keys(status.providers)) {
        if (Date.now() - status.times[key] > 30_000) status.providers[key] = 'degraded';
      }
      res.json({ active: this.active.get(c.controller_id) ?? null,
        integration: status && Date.now() - status.updatedAt < 30_000 ? status : { updatedAt: 0, providers: { companion: 'degraded' } } });
    });
    router.post('/event', (req, res) => res.json({ accepted: this.accept(res.locals.credential, req.body) }));
    router.post('/end', (req, res) => {
      const c: Credential = res.locals.credential;
      const a = this.active.get(c.controller_id);
      if (c.role !== 'browser' || !a || a.attemptId !== req.body?.attemptId) { res.sendStatus(409); return; }
      if (!a.ended && a.clientId) this.onEnd(a.clientId);
      a.ended = true; a.endedAt ??= Date.now();
      res.json({ session: a.result ?? null });
    });
    router.post('/status', (req, res) => {
      const c: Credential = res.locals.credential;
      if (c.role === 'browser') { res.sendStatus(403); return; }
      const prior = this.statuses.get(c.controller_id)?.providers ?? {};
      const providers: Record<string, string> = { ...prior };
      const times = { ...this.statuses.get(c.controller_id)?.times };
      for (const [key, value] of Object.entries(c.role === 'companion' ? req.body?.providers ?? {} : {}).slice(0, 20)) {
        if (['local', 'cloud', 'companion', 'attention'].includes(key) && ['healthy', 'degraded', 'unconfigured'].includes(String(value))) {
          providers[key] = String(value); times[key] = Date.now();
        }
      }
      if (c.role === 'helper') { providers[`ssh.${c.source}`] = req.body?.healthy === false ? 'degraded' : 'healthy'; times[`ssh.${c.source}`] = Date.now(); }
      this.statuses.set(c.controller_id, { updatedAt: Date.now(), providers, times }); res.json({ ok: true });
    });
    router.post('/handoff', (req, res) => {
      const c: Credential = res.locals.credential;
      const a = this.active.get(c.controller_id);
      if (c.role !== 'browser' || !a?.ended || !a.event || a.visitId !== req.body?.visitId || Date.now() - a.endedAt! < 5000) { res.status(409).json({ error: 'stale-or-early' }); return; }
      a.handoff = a.visitId; res.json({ ok: true });
    });
    router.post('/handoff-claim', (req, res) => {
      const c: Credential = res.locals.credential;
      const a = this.active.get(c.controller_id);
      if (c.role !== 'companion' || !a?.handoff || a.handoff !== req.body?.visitId || a.handoffClaimedAt) { res.sendStatus(409); return; }
      a.handoffClaimedAt = Date.now(); res.json({ event: a.event });
    });
    router.post('/handoff-ack', (req, res) => {
      const c: Credential = res.locals.credential;
      const a = this.active.get(c.controller_id);
      if (c.role !== 'companion' || !a?.handoff || a.handoff !== req.body?.visitId) { res.sendStatus(409); return; }
      a.handoffResult = req.body?.success === true ? 'complete' : 'failed';
      a.handoff = undefined; a.handoffClaimedAt = undefined; res.json({ ok: true });
    });
    return router;
  }
  claimRouter() {
    const router = Router();
    router.post('/claim', (req, res) => {
      const ticket = req.body?.ticket;
      const pair = this.tickets.get(ticket);
      this.tickets.delete(ticket);
      if (!pair || pair.expires < Date.now()) { res.status(401).json({ error: 'expired-pairing' }); return; }
      res.json({ token: this.issue(pair.controllerId, 'browser', 'browser') });
    });
    return router;
  }
}
