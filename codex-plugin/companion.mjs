import { agent } from './agent.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { open, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { api, dataDir, register, submitEvent, flushEvents } from './connection.mjs';
import { CloudMonitor, handoffCommand } from './adapters.mjs';
const execute = promisify(execFile);
const c = await register();
const lockPath = path.join(dataDir, 'companion.lock');
try {
  const lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(String(process.pid)); await lock.close();
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const { readFile } = await import('node:fs/promises');
  const pid = Number(await readFile(lockPath, 'utf8'));
  try { process.kill(pid, 0); process.exit(0); } catch { await unlink(lockPath); await writeFile(lockPath, String(process.pid), { mode: 0o600 }); }
}
process.on('exit', () => { void unlink(lockPath).catch(() => {}); });
const providers = agent === 'claude' ? { companion: 'healthy', local: 'unconfigured', attention: 'unconfigured' } : { companion: 'healthy', local: 'unconfigured', cloud: 'degraded' };
const cloud = new CloudMonitor({ cli: process.env.AGENT_DEATHMATCH_CLI || 'codex',
  onEvent: e => submitEvent(c, e), onStatus: status => { providers.cloud = status; } });
let lastCloud = 0;
let lastStatus = 0;
let running = true;
const handedOff = new Set();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { running = false; });
while (running) {
  const now = Date.now();
  if (agent === 'codex' && now - lastCloud >= 10_000 && !cloud.scanning) { lastCloud = now; void cloud.scan(); }
  try {
    await flushEvents(c);
    if (now - lastStatus >= 10_000) {
      const { readFile } = await import('node:fs/promises');
      try {
        await readFile(path.join(dataDir, agent === 'claude' ? 'claude-hooks.json' : 'notify-chain.json'));
        providers.local = 'healthy';
        if (agent === 'claude') providers.attention = 'healthy';
      } catch { providers.local = 'unconfigured'; }
      await api(c, '/status', { providers }); lastStatus = now;
    }
    const { active } = await api(c, '/state');
    providers.companion = 'healthy';
    if (active?.handoff && active.event && !handedOff.has(active.handoff)) {
      // Check again immediately before activating: a later Play invalidates this countdown.
      const fresh = await api(c, '/state');
      if (fresh.active?.handoff === active.handoff) {
        const { event } = await api(c, '/handoff-claim', { visitId: active.handoff });
        let success = false;
        try {
          const [command, args] = handoffCommand(event, process.platform, agent, process.env.AGENT_DEATHMATCH_RETURN_APP);
          await execute(command, args, { timeout: 5000 });
          success = true;
          handedOff.add(active.handoff);
          if (handedOff.size > 100) handedOff.delete(handedOff.values().next().value);
        } finally { await api(c, '/handoff-ack', { visitId: active.handoff, success }); }
      }
    }
  } catch { providers.companion = 'degraded'; }
  await delay(1000);
}
await unlink(lockPath).catch(() => {});
