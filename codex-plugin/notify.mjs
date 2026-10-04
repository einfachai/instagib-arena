import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir, loadConnection, submitEvent } from './connection.mjs';
import { normalizeHook, normalizeNotification } from './adapters.mjs';

let wire = '';
const hook = process.argv.includes('--hook');
if (hook) { for await (const chunk of process.stdin) { wire += chunk; if (wire.length > 1024 * 1024) process.exit(0); } }
else wire = process.argv.at(-1) ?? '';
// Preserve the preexisting notify program exactly; forward its original argv JSON.
if (!hook) {
  try {
    const chain = JSON.parse(await readFile(path.join(dataDir, 'notify-chain.json'), 'utf8'));
    if (Array.isArray(chain) && chain.length) {
      const child = spawn(chain[0], [...chain.slice(1), wire], { stdio: 'ignore', detached: true });
      child.on('error', () => {}); child.unref();
    }
  } catch { /* No previous notification command. */ }
}
try {
  const payload = JSON.parse(wire);
  const connection = await loadConnection();
  const source = connection.source === 'ssh' ? 'ssh' : 'local';
  const event = hook ? normalizeHook(payload, source) : normalizeNotification(payload, source);
  await submitEvent(connection, event);
} catch { /* Observers cannot change normal approval/input behavior or fail an agent turn. */ }
// Empty stdout is deliberate: no hook-specific approval decision, block, or steer.
