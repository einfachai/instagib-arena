import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { api, loadConnection } from './connection.mjs';
const c = await loadConnection();
const { stdout: features } = await promisify(execFile)(process.env.AGENT_DEATHMATCH_CLI || 'codex', ['features', 'list'], { timeout: 10000 });
const hooksEnabled = /^hooks\s+stable\s+true$/m.test(features);
await api(c, '/state');
await api(c, '/status', { healthy: true, providers: { local: 'healthy' } });
console.log(JSON.stringify({ paired: true, connectivity: 'healthy', hooksEnabled, hookTrust: 'Review current observer definitions in /hooks on this host.' }));
