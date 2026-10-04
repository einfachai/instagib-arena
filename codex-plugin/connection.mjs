import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

const dataArg = process.argv.indexOf('--data');
export const dataDir = (dataArg >= 0 ? process.argv[dataArg + 1] : undefined) || process.env.PLUGIN_DATA || process.env.AGENT_DEATHMATCH_DATA || path.join(homedir(), '.local', 'share', 'agent-deathmatch');
export const credentialsPath = process.env.AGENT_DEATHMATCH_CREDENTIALS || path.join(dataDir, 'controller.json');
export async function loadConnection() {
  const c = JSON.parse(await readFile(credentialsPath, 'utf8'));
  const url = new URL(c.origin);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use HTTPS for the shared arena');
  return c;
}
export async function api(connection, route, body) {
  const response = await fetch(`${connection.origin}/api/arena${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Arena companion HTTP ${response.status}`);
  return response.json();
}
export async function register(origin = process.env.AGENT_DEATHMATCH_ORIGIN || 'https://instagib.win') {
  try { return await loadConnection(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const connection = { origin: new URL(origin).origin };
  // Validate TLS policy before creating anything remotely.
  const u = new URL(connection.origin);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('Shared origin requires HTTPS');
  const created = await api(connection, '/controllers', {});
  Object.assign(connection, { token: created.token, controllerId: created.controllerId, source: 'local' });
  await mkdir(path.dirname(credentialsPath), { recursive: true, mode: 0o700 });
  await writeFile(credentialsPath, JSON.stringify(connection), { mode: 0o600 });
  return connection;
}
export async function submitEvent(connection, event) {
  if (!event) return;
  try {
    const { active } = await api(connection, '/state');
    if (active && !active.ended && event.occurredAt < active.startedAt) return;
    await api(connection, '/event', { attemptId: active?.ended ? null : active?.attemptId ?? null, event });
  } catch (error) {
    const dir = path.join(dataDir, 'events');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const name = createHash('sha256').update(event.eventId).digest('hex');
    await writeFile(path.join(dir, `${name}.json`), JSON.stringify(event), { mode: 0o600 });
    throw error;
  }
}

export async function flushEvents(connection) {
  const dir = path.join(dataDir, 'events');
  let files; try { files = await readdir(dir); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  for (const name of files.filter(n => /^[a-f0-9]{64}\.json$/.test(n)).slice(0, 5)) {
    const file = path.join(dir, name), event = JSON.parse(await readFile(file, 'utf8'));
    if (Date.now() - event.occurredAt < 86400000) await submitEvent(connection, event);
    // Original event time is retained: retrying can never end a later visit.
    await unlink(file);
  }
}
