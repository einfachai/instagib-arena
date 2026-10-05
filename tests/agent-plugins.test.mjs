import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { arenaUrl, returnTarget } from '../codex-plugin/agent.mjs';
import { normalizeClaudeHook, handoffCommand } from '../codex-plugin/adapters.mjs';
const run = promisify(execFile);

test('plugin launch URLs carry a bounded identity and keep pairing credentials in the fragment', () => {
  for (const agent of ['codex', 'claude']) {
    const url = new URL(arenaUrl('https://agent-deathmatch.hi-fa2.workers.dev', agent, 'one-time'));
    assert.equal(url.pathname, '/play');
    assert.equal(url.searchParams.get('agent'), agent);
    assert.equal(url.searchParams.get('pair'), null);
    assert.equal(new URLSearchParams(url.hash.slice(1)).get('pair'), 'one-time');
  }
  assert.equal(new URL(arenaUrl('https://agent-deathmatch.hi-fa2.workers.dev', '../bad')).searchParams.get('agent'), 'codex');
});

test('Claude events omit prompts and transcripts and ignore tools, idle pings and subagent endings', () => {
  const input = { session_id: 's1', transcript_path: '/secret', last_assistant_message: 'private', tool_input: { secret: true }, hook_event_name: 'Stop', stop_hook_active: false };
  assert.deepEqual(normalizeClaudeHook(input, 123, 'turn1'), { eventId: 'claude:s1:turn1:completion', source: 'local', taskId: 's1', category: 'completion', occurredAt: 123 });
  assert.equal(normalizeClaudeHook({ ...input, stop_hook_active: true }), null);
  assert.equal(normalizeClaudeHook({ ...input, agent_id: 'sub' }), null);
  assert.equal(normalizeClaudeHook({ ...input, hook_event_name: 'SubagentStop' }), null);
  assert.equal(normalizeClaudeHook({ ...input, hook_event_name: 'PostToolUseFailure' }), null);
  assert.equal(normalizeClaudeHook({ ...input, hook_event_name: 'Notification', notification_type: 'idle_prompt' }), null);
  assert.equal(normalizeClaudeHook({ ...input, hook_event_name: 'Notification', notification_type: 'permission_prompt' }).category, 'approval-required');
  assert.equal(normalizeClaudeHook({ ...input, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' }).category, 'input-required');
  assert.equal(normalizeClaudeHook({ ...input, hook_event_name: 'PreToolUse', tool_name: 'Bash' }), null);
  assert.notEqual(normalizeClaudeHook(input, 123, 'turn1').eventId, normalizeClaudeHook(input, 456, 'turn2').eventId);
});

test('host return chooses the launching app and never substitutes Codex for Claude', () => {
  assert.equal(returnTarget({ TERM_PROGRAM: 'iTerm.app' }), 'iterm');
  assert.equal(returnTarget({ TERM_PROGRAM: 'vscode' }), 'vscode');
  assert.equal(returnTarget({ AGENT_DEATHMATCH_RETURN_APP: 'evil command', TERM_PROGRAM: 'Apple_Terminal' }), 'terminal');
  assert.deepEqual(handoffCommand({ taskLink: 'codex://threads/s1' }, 'darwin', 'claude', 'iterm'), ['open', ['-b', 'com.googlecode.iterm2']]);
  assert.throws(() => handoffCommand({}, 'linux', 'claude'), /unavailable/);
});

test('Codex and Claude default controller directories remain isolated', async () => {
  const script = "import { dataDir } from './codex-plugin/connection.mjs'; console.log(dataDir)";
  const env = { ...process.env };
  delete env.PLUGIN_DATA; delete env.AGENT_DEATHMATCH_DATA; delete env.AGENT_DEATHMATCH_AGENT;
  const codex = (await run(process.execPath, ['--input-type=module', '-e', script, '--', '--agent=codex'], { env })).stdout.trim();
  const claude = (await run(process.execPath, ['--input-type=module', '-e', script, '--', '--agent=claude'], { env: { ...env, PLUGIN_DATA: '/codex-only-data' } })).stdout.trim();
  assert.notEqual(codex, claude);
  assert.equal(claude, path.join(codex, 'claude'));
});

test('the installed Claude hook submits an event with empty stdout and no Codex config writes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arena-claude-hook-'));
  const received = [];
  const server = createServer(async (req, res) => {
    let input = ''; for await (const chunk of req) input += chunk;
    if (req.url === '/api/arena/event') received.push(JSON.parse(input));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.endsWith('/state') ? { active: null } : { accepted: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await writeFile(path.join(dir, 'controller.json'), JSON.stringify({ origin: `http://127.0.0.1:${server.address().port}`, token: 'test-only' }));
    const payload = { session_id: 'main-session', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'NEVER-FORWARD', transcript_path: '/private/transcript' };
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, ['codex-plugin/claude-notify.mjs', '--agent=claude', '--data', dir], { env: process.env });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.stdin.end(JSON.stringify(payload));
    const code = await new Promise(resolve => child.once('exit', resolve));
    assert.equal(code, 0); assert.equal(stdout, ''); assert.equal(stderr, '');
    assert.equal(received.length, 1); assert.equal(received[0].event.category, 'completion');
    assert(!JSON.stringify(received).includes('NEVER-FORWARD'));
    assert(!JSON.stringify(received).includes('/private/transcript'));
    assert(JSON.parse(await readFile(path.join(dir, 'claude-hooks.json'), 'utf8')).observedAt > 0);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('release ZIPs are self-contained and exclude credentials and game assets', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arena-plugin-zips-'));
  try {
    await run('python3', ['scripts/package-plugins.py', '--out', dir, '--tag', 'plugin-v0.5.0']);
    const check = `import pathlib,zipfile,json,hashlib
root=pathlib.Path(${JSON.stringify(dir)})
for archive in root.glob('*.zip'):
 with zipfile.ZipFile(archive) as z:
  names=z.namelist(); prefix=names[0].split('/')[0]+'/'
  assert all(n.startswith(prefix) for n in names)
  assert not any('/node_modules/' in n or '/controller.json' in n or '/public/models/' in n for n in names)
  if 'claude-code' in archive.name:
   assert prefix+'codex-plugin/server.mjs' in names
   assert prefix+'codex-plugin/claude-notify.mjs' in names
   assert json.loads(z.read(prefix+'.claude-plugin/plugin.json'))['version']=='0.5.0'
   hooks=json.loads(z.read(prefix+'claude-plugin/hooks/hooks.json'))['hooks']
   assert 'Stop' in hooks and 'SubagentStop' not in hooks
  else:
   assert prefix+'.agents/plugins/marketplace.json' in names
   assert json.loads(z.read(prefix+'.codex-plugin/plugin.json'))['version']=='0.5.0'
for line in (root/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split(); assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest
`;
    await run('python3', ['-c', check]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the relocated Claude MCP launcher pairs the branded URL and never installs Codex notifications', { timeout: 20000 }, async () => {
  const { mkdir, chmod } = await import('node:fs/promises');
  const { spawn } = await import('node:child_process');
  const { createInterface } = await import('node:readline');
  const dir = await mkdtemp(path.join(tmpdir(), 'arena-claude-launch-'));
  const bin = path.join(dir, 'bin'), data = path.join(dir, 'data'), config = path.join(dir, 'codex-home');
  await mkdir(bin); await mkdir(data); await mkdir(config);
  await writeFile(path.join(config, 'config.toml'), 'model = "untouched"\n');
  const opener = path.join(bin, process.platform === 'darwin' ? 'open' : 'xdg-open');
  await writeFile(opener, '#!/bin/sh\nexit 0\n'); await chmod(opener, 0o755);
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const response = req.url === '/api/health' ? { ok: true, build: true }
      : req.url === '/api/arena/controllers' ? { token: 'mock-controller', controllerId: 'mock' }
      : req.url === '/api/arena/pair' ? { ticket: 'single-use-ticket' } : { active: null, ok: true };
    res.end(JSON.stringify(response));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let child;
  try {
    await run('python3', ['scripts/package-plugins.py', '--out', dir]);
    await run('python3', ['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', path.join(dir, 'agent-deathmatch-claude-code-v0.5.0.zip'), dir]);
    const root = path.join(dir, 'agent-deathmatch-claude-code-v0.5.0');
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, AGENT_DEATHMATCH_AGENT: 'claude', AGENT_DEATHMATCH_DATA: data,
      AGENT_DEATHMATCH_ORIGIN: `http://127.0.0.1:${server.address().port}`, CODEX_HOME: config };
    delete env.PLUGIN_DATA; delete env.AGENT_DEATHMATCH_CREDENTIALS;
    child = spawn(process.execPath, [path.join(root, 'codex-plugin/server.mjs'), '--agent=claude'], { cwd: dir, env });
    const lines = createInterface({ input: child.stdout });
    const response = new Promise((resolve, reject) => {
      lines.on('line', line => { const result = JSON.parse(line); if (result.id === 1) resolve(result); });
      child.on('error', reject); child.on('exit', code => { if (code) reject(new Error(`Launcher exited ${code}`)); });
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'open_agent_deathmatch', arguments: {} } }) + '\n');
    const result = await response;
    assert(!result.error); assert(!result.result.isError);
    const url = new URL(result.result.structuredContent.url);
    assert.equal(url.searchParams.get('agent'), 'claude');
    assert.equal(new URLSearchParams(url.hash.slice(1)).get('pair'), 'single-use-ticket');
    assert.equal(await readFile(path.join(config, 'config.toml'), 'utf8'), 'model = "untouched"\n');
    await assert.rejects(readFile(path.join(data, 'notify-chain.json')), { code: 'ENOENT' });
    lines.close(); child.stdin.end();
  } finally {
    child?.kill();
    // This lock was created only by our relocated runtime under the test's private directory.
    try { const pid = Number(await readFile(path.join(data, 'companion.lock'), 'utf8')); if (pid > 0) process.kill(pid, 'SIGTERM'); } catch { /* Companion may not have started yet. */ }
    await new Promise(resolve => setTimeout(resolve, 1200));
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
