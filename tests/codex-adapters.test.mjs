import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudMonitor, handoffCommand, normalizeHook, normalizeNotification } from '../codex-plugin/adapters.mjs';

test('notifications strip task contents and ignore subagent/tool endings', () => {
  const payload = { type: 'agent-turn-complete', 'thread-id': 'abc', 'turn-id': 'def', cwd: '/secret', 'input-messages': ['secret'], 'last-assistant-message': 'private' };
  assert.deepEqual(normalizeNotification(payload, 'local', 123), { eventId: 'local:abc:def:completion', source: 'local', taskId: 'abc', category: 'completion', occurredAt: 123, taskLink: 'codex://threads/abc' });
  assert.equal(normalizeNotification({ ...payload, subagent: {} }), null);
  assert.equal(normalizeNotification({ ...payload, type: 'tool-complete' }), null);
});
test('attention observers emit no approval decision and ignore Stop', () => {
  const base = { session_id: 'abc', turn_id: 'def' };
  assert.equal(normalizeHook({ ...base, hook_event_name: 'PermissionRequest' }).category, 'approval-required');
  assert.equal(normalizeHook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'functions.request_user_input_async' }).category, 'input-required');
  assert.equal(normalizeHook({ ...base, hook_event_name: 'Stop' }), null);
  assert.equal(normalizeHook({ ...base, hook_event_name: 'PostToolUse', exit_code: 1 }), null);
});
test('Cloud baseline, pagination, duplicate revisions and failed scans', async () => {
  let round = 0;
  const events = [];
  const run = async (_cli, args) => ({ stdout: JSON.stringify(args.includes('--cursor')
    ? { tasks: [{ id: 'b', status: 'running', updated_at: '2026-10-03T00:00:00Z' }], cursor: null }
    : { tasks: [{ id: 'a', status: round ? 'ready' : 'running', updated_at: '2026-10-03T00:00:01Z', url: 'https://chatgpt.com/codex/tasks/a' }], cursor: 'second' }) });
  const monitor = new CloudMonitor({ run, onEvent: async e => events.push(e) });
  await monitor.scan(); assert.equal(events.length, 0);
  round++; await monitor.scan(); await monitor.scan();
  assert.equal(events.length, 1); assert.equal(events[0].category, 'completion');
  const historical = new CloudMonitor({ run, onEvent: async e => events.push(e) });
  await historical.scan(); assert.equal(events.length, 1);
});
test('desktop handoff only opens supported local chat links', () => {
  assert.deepEqual(handoffCommand({ source: 'local', taskLink: 'codex://threads/abc' }, 'darwin'), ['open', ['codex://threads/abc']]);
  assert.deepEqual(handoffCommand({ source: 'ssh', taskLink: 'https://chatgpt.com/x' }, 'darwin'), ['open', ['-b', 'com.openai.codex']]);
});

test('cloud scans never overlap and metadata edits do not replay a completion', async () => {
  let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  let status = 'running', updated = '2026-10-03T00:00:00Z';
  const events = [], health = [];
  const monitor = new CloudMonitor({ run: async () => { calls++; await gate; return { stdout: JSON.stringify({ tasks: [{ id: 'task', status, updated_at: updated, attempt_total: 1 }], cursor: null }) }; }, onEvent: async e => events.push(e), onStatus: s => health.push(s) });
  const first = monitor.scan(); await monitor.scan(); assert.equal(calls, 1); release(); await first;
  status = 'ready'; updated = '2026-10-03T00:00:01Z'; await monitor.scan();
  updated = '2026-10-03T00:00:02Z'; await monitor.scan(); assert.equal(events.length, 1);
  monitor.run = async () => { throw new Error('offline'); }; await monitor.scan(); assert.equal(health.at(-1), 'degraded');
  assert.equal(monitor.previous.get('task').status, 'ready');
});
