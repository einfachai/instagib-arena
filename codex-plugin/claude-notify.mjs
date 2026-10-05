import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir, loadConnection, submitEvent } from './connection.mjs';
import { normalizeClaudeHook } from './adapters.mjs';

const occurredAt = Date.now();
let wire = '';
try {
  for await (const chunk of process.stdin) {
    wire += chunk;
    if (wire.length > 1024 * 1024) process.exit(0);
  }
  const payload = JSON.parse(wire);
  // A SessionStart heartbeat checks that the installed hook actually executed.
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(dataDir, 'claude-hooks.json'), JSON.stringify({ observedAt: occurredAt }), { mode: 0o600 });
  const event = normalizeClaudeHook(payload, occurredAt, randomUUID());
  if (event) await submitEvent(await loadConnection(), event);
} catch { /* Never block a task, change an approval, or expose its transcript. */ }
