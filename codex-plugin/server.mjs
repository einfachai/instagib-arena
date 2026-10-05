import { agent, agentName, arenaUrl, returnTarget } from './agent.mjs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { readFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { api, dataDir, register } from './connection.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const configuredEnvironment = JSON.parse(readFileSync(path.join(pluginDir, '.mcp.json'), 'utf8')).mcpServers.agent_deathmatch.env;
const gameDir = process.env.AGENT_DEATHMATCH_GAME_DIR || configuredEnvironment.AGENT_DEATHMATCH_GAME_DIR || path.dirname(pluginDir);
const gameNode = process.env.AGENT_DEATHMATCH_NODE || configuredEnvironment.AGENT_DEATHMATCH_NODE || process.execPath;
const backend = new URL(process.env.AGENT_DEATHMATCH_ORIGIN || configuredEnvironment.AGENT_DEATHMATCH_ORIGIN || 'https://agent-deathmatch.hi-fa2.workers.dev');
const localBackend = ['localhost', '127.0.0.1'].includes(backend.hostname);
const playUrl = arenaUrl(backend.origin);
const resourceUri = 'ui://agent-deathmatch/launcher-v4.html';
const mimeType = 'text/html;profile=mcp-app';
const version = JSON.parse(readFileSync(path.join(pluginDir, '.codex-plugin/plugin.json'), 'utf8')).version;
const gun = readFileSync(path.join(pluginDir, 'assets/gun.svg'));
const icon = { src: `data:image/svg+xml;base64,${gun.toString('base64')}`, mimeType: 'image/svg+xml', sizes: ['64x64'] };
const htmlTemplate = readFileSync(path.join(pluginDir, 'play.html'), 'utf8')
  .replaceAll('__ARENA_GUN_ICON__', icon.src)
  .replaceAll('__ARENA_AGENT_NAME__', agentName)
  .replaceAll('__ARENA_LOGO__', `${backend.origin}/brand/agent-deathmatch-${agent}.png`);
let startup;
let companionStarted = false;
async function pairedUrl() {
  try {
    const c = await register(backend.origin);
    if (c.origin !== backend.origin) throw new Error('Companion origin mismatch');
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    if (!companionStarted) {
      try { if (agent === 'codex') await promisify(execFile)('python3', [path.join(pluginDir, 'setup.py'), '--data', dataDir, '--node', process.execPath], { timeout: 10000 }); }
      catch { console.error('[arena] Local notification setup is unavailable; run setup.py --check.'); }
      const fd = openSync(path.join(dataDir, 'companion.log'), 'a', 0o600);
      const child = spawn(process.execPath, [path.join(pluginDir, 'companion.mjs')], {
        env: { ...process.env, AGENT_DEATHMATCH_ORIGIN: backend.origin, AGENT_DEATHMATCH_AGENT: agent, AGENT_DEATHMATCH_DATA: dataDir, AGENT_DEATHMATCH_RETURN_APP: returnTarget() }, detached: true, stdio: ['ignore', fd, fd] });
      closeSync(fd); child.on('error', () => {}); child.unref(); companionStarted = true;
    }
    const { ticket } = await api(c, '/pair', {});
    return arenaUrl(backend.origin, agent, ticket);
  } catch {
    console.error('[arena] Companion pairing unavailable. Play and manual exit remain available.');
    return playUrl;
  }
}
async function launchResult() {
  const url = await pairedUrl();
  let opened = false;
  if (agent === 'claude') {
    try {
      const command = process.platform === 'darwin' ? ['open', [url]]
        : process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
      await promisify(execFile)(command[0], command[1], { timeout: 5000 });
      opened = true;
    } catch { /* The text result supplies a usable browser link if activation fails. */ }
  }
  return { content: [{ type: 'text', text: agent === 'claude'
    ? `Agent Deathmatch ${opened ? 'opened in your browser' : 'is ready'}. Play while Claude Code works. ${url}`
    : `Open this paired game URL directly in a Codex browser tab using open_in_codex with target { type: "browser", url }. Do not open an external browser or a launcher card. URL: ${url}` }], structuredContent: { url, gameUrl: playUrl, agent, opened } };
}
async function renderLauncher() { return htmlTemplate.replaceAll('__ARENA_PLAY_URL__', await pairedUrl()); }

const tool = {
  name: 'open_agent_deathmatch',
  title: 'Agent Deathmatch',
  description: agent === 'codex'
    ? 'Prepare the paired live Agent Deathmatch URL. Then open structuredContent.url directly in a Codex browser tab with open_in_codex; do not use an external browser or an MCP launcher card.'
    : `Open Agent Deathmatch in the browser and pair it to your local ${agentName} companion.`,
  icons: [icon],
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: {
    'openai/toolInvocation/invoking': 'Opening Agent Deathmatch',
    'openai/toolInvocation/invoked': 'Agent Deathmatch ready'
  }
};

const resourceMeta = {
  ui: {
    csp: { connectDomains: [], resourceDomains: [backend.origin], frameDomains: [] },
    prefersBorder: false
  },
  'openai/ui': { availableDisplayModes: ['fullscreen'] },
  'openai/widgetDescription': 'Play Agent Deathmatch while your agents work.',
  'openai/widgetCSP': { connect_domains: [], resource_domains: [backend.origin], frame_domains: [], redirect_domains: [backend.origin] }
};

async function health(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function ensureGame() {
  if (!localBackend) {
    if (!(await health(`${backend.origin}/api/health`))?.ok) throw new Error('The shared arena is unavailable.');
    return;
  }
  if ((await health(`${backend.origin}/api/health`))?.build === true) return;
  const logDir = path.join(gameDir, 'data');
  mkdirSync(logDir, { recursive: true });
  const logFd = openSync(path.join(logDir, 'agent-deathmatch.log'), 'a');
  let launchError;
  let exited = false;
  const child = spawn(gameNode, ['--import', 'tsx', 'server/index.ts'], {
    cwd: gameDir,
    env: { ...process.env, NODE_ENV: 'production', HOST: backend.hostname, PORT: backend.port || '8787', APP_BASE_URL: backend.origin },
    detached: true,
    stdio: ['ignore', logFd, logFd]
  });
  closeSync(logFd);
  child.once('error', error => { launchError = error; });
  child.once('exit', () => { exited = true; });
  child.unref();
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if ((await health(`${backend.origin}/api/health`))?.build === true) return;
    if (exited) throw new Error('The game could not start. See data/agent-deathmatch.log.');
    await delay(250);
  }
  throw new Error('The game did not become ready. See data/agent-deathmatch.log.');
}

async function ensureReady() {
  if (!startup) startup = ensureGame().finally(() => { startup = undefined; });
  await startup;
}

class RpcError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function dispatch(method, params = {}) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion || '2025-11-25',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'agent-deathmatch', title: 'Agent Deathmatch', version, icons: [icon] }
      };
    case 'ping': return {};
    case 'tools/list': return { tools: [tool] };
    case 'resources/list': return { resources: [] };
    case 'resources/templates/list': return { resourceTemplates: [] };
    case 'prompts/list': return { prompts: [] };
    case 'tools/call':
      if (params.name !== tool.name) throw new RpcError(-32602, 'Unknown tool');
      if (params.arguments && Object.keys(params.arguments).length) throw new RpcError(-32602, 'This launcher does not accept arguments');
      try {
        await ensureReady();
        return {
          ...(await launchResult())
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    case 'resources/read':
      if (params.uri !== resourceUri) throw new RpcError(-32602, 'Unknown resource');
      await ensureReady();
      return { contents: [{ uri: resourceUri, mimeType, text: await renderLauncher(), _meta: resourceMeta }] };
    default: throw new RpcError(-32601, 'Method not found');
  }
}

if (process.argv.includes('--preview')) {
  await ensureReady();
  const port = Number(process.env.AGENT_DEATHMATCH_PREVIEW_PORT || 8790);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
  const preview = http.createServer(async (request, response) => {
    if (request.url !== '/') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    try { response.end(await renderLauncher()); } catch { response.end('The companion could not pair. Check the shared backend and setup.'); }
  });
  await new Promise((resolve, reject) => {
    preview.once('error', reject);
    preview.listen(port, '127.0.0.1', resolve);
  });
  console.error(`http://localhost:${port}/`);
} else {
  // The plugin uses the standard newline-delimited MCP stdio transport.
  // Keep all diagnostic and game output off this protocol stream.
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    let request;
    try { request = JSON.parse(line); } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }) + '\n');
      continue;
    }
    if (request.id === undefined) continue;
    try {
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new RpcError(-32600, 'Invalid request');
      const result = await dispatch(request.method, request.params);
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: error.code || -32603, message: error.message } }) + '\n');
    }
  }
}
