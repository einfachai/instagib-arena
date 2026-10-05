import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
const script = path.resolve('codex-plugin/setup.py');

test('the plugin relocates without developer paths and completes an MCP handshake', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-plugin-portable-'));
  try {
    cpSync(path.resolve('codex-plugin'), dir, { recursive: true });
    const config = JSON.parse(readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers.agent_deathmatch;
    assert.equal(config.command, 'node'); assert.equal(config.cwd, '.');
    assert.ok(config.args.every(arg => !path.isAbsolute(arg)));
    const input = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'resources/list', params: {} },
    ].map(m => JSON.stringify(m) + '\n').join('');
    const output = execFileSync(process.execPath, config.args, { cwd: dir, input, encoding: 'utf8', timeout: 30000 });
    const [init, list, resources] = output.trim().split('\n').map(JSON.parse);
    assert.equal(init.result.serverInfo.name, 'agent-deathmatch');
    assert.equal(list.result.tools[0].name, 'open_agent_deathmatch');
    assert.deepEqual(resources.result.resources, []);
    assert.equal(list.result.tools[0]._meta.ui, undefined);
    assert.equal(list.result.tools[0]._meta['openai/outputTemplate'], undefined);
    assert.match(list.result.tools[0].description, /Codex browser tab with open_in_codex/);
    const manifest = JSON.parse(readFileSync(path.join(dir, '.codex-plugin/plugin.json'), 'utf8'));
    const marketplace = JSON.parse(readFileSync(path.join(dir, '.agents/plugins/marketplace.json'), 'utf8'));
    assert.equal(marketplace.plugins[0].name, manifest.name);
    assert.equal(manifest.name, init.result.serverInfo.name);
    assert.ok(readFileSync(path.join(dir, 'play.html'), 'utf8').includes(`name:'${list.result.tools[0].name}'`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('notification setup and companion agree on the renamed data-directory override', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-deathmatch-env-'));
  try {
    const config = path.join(dir, 'config.toml'), data = path.join(dir, 'companion');
    mkdirSync(data);
    writeFileSync(path.join(data, 'controller.json'), '{}');
    const env = { ...process.env, AGENT_DEATHMATCH_DATA: data };
    delete env.PLUGIN_DATA;
    delete env.AGENT_DEATHMATCH_CREDENTIALS;
    const connection = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
      "import {dataDir, credentialsPath} from './codex-plugin/connection.mjs'; console.log(JSON.stringify({dataDir, credentialsPath}));"],
    { env, encoding: 'utf8' }));
    assert.equal(connection.dataDir, data);
    assert.equal(connection.credentialsPath, path.join(data, 'controller.json'));
    const args = [script, '--config', config, '--node', process.execPath];
    execFileSync('python3', args, { env });
    const check = JSON.parse(execFileSync('python3', [...args, '--check'], { env, encoding: 'utf8' }));
    assert.equal(check.notificationInstalled, true);
    assert.ok(readFileSync(config, 'utf8').includes(data));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setup preserves multiline notify, unrelated hooks and profiles, and is idempotent', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-setup-'));
  try {
    const config = path.join(dir, 'config.toml'), data = path.join(dir, 'data'); mkdirSync(data);
    writeFileSync(config, 'notify = [\n "/usr/bin/example", # preserved\n "literal [value] $HOME"\n]\nmodel_reasoning_effort = "high"\n[profiles.other]\nnotify = ["unrelated"]\n');
    writeFileSync(path.join(dir, 'hooks.json'), JSON.stringify({ hooks: { PermissionRequest: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'existing-hook' }] }] } }));
    writeFileSync(path.join(data, 'controller.json'), '{}');
    const args = [script, '--config', config, '--data', data, '--node', process.execPath, '--install-hooks'];
    execFileSync('python3', args); const text = readFileSync(config, 'utf8'); const hooks = readFileSync(path.join(dir, 'hooks.json'), 'utf8');
    assert.deepEqual(JSON.parse(readFileSync(path.join(data, 'notify-chain.json'), 'utf8')), ['/usr/bin/example', 'literal [value] $HOME']);
    assert.ok(text.includes('[profiles.other]\nnotify = ["unrelated"]'));
    assert.ok(hooks.includes('existing-hook'));
    execFileSync('python3', args); assert.equal(readFileSync(config, 'utf8'), text); assert.equal(readFileSync(path.join(dir, 'hooks.json'), 'utf8'), hooks);
    const check = JSON.parse(execFileSync('python3', [...args, '--check'], { encoding: 'utf8' }));
    assert.equal(check.notificationInstalled, true); assert.equal(check.hooksInstalled, true); assert.equal(check.hookTrustRecords, false);
    assert.equal((JSON.parse(hooks).hooks.PreToolUse[0].hooks[0]).async, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a profile-only notify is never overwritten or chained as a global command', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-setup-profile-'));
  try {
    const config = path.join(dir, 'config.toml'), data = path.join(dir, 'data');
    writeFileSync(config, '[profiles.other]\nnotify = ["unrelated"]\n');
    execFileSync('python3', [script, '--config', config, '--data', data, '--node', process.execPath]);
    assert.ok(readFileSync(config, 'utf8').includes('[profiles.other]\nnotify = ["unrelated"]'));
    assert.deepEqual(JSON.parse(readFileSync(path.join(data, 'notify-chain.json'), 'utf8')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
