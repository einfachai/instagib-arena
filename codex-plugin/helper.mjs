// SSH-side observer delivery only. No Codex credentials or task contents leave this host.
import { api, dataDir, flushEvents, loadConnection } from './connection.mjs';
import { open, readFile, unlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
const c = await loadConnection();
if (c.source !== 'ssh') throw new Error('SSH helper credential required');
const lockPath = path.join(dataDir, 'helper.lock');
async function lock() { const f = await open(lockPath, 'wx', 0o600); await f.writeFile(String(process.pid)); await f.close(); }
try { await lock(); }
catch (e) {
  if (e.code !== 'EEXIST') throw e;
  const pid = Number(await readFile(lockPath, 'utf8'));
  try { process.kill(pid, 0); process.exit(0); } catch { await unlink(lockPath); await lock(); }
}
let active = true;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { active = false; });
while (active) {
  try { await flushEvents(c); await api(c, '/status', { healthy: true }); } catch { /* The backend expires this helper's heartbeat. */ }
  await delay(10000);
}
await unlink(lockPath).catch(() => {});
