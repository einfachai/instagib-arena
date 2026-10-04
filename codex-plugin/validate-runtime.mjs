import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeNotification, handoffCommand } from './adapters.mjs';
import { setTimeout as delay } from 'node:timers/promises';
const run = promisify(execFile);
const cli = process.env.AGENT_DEATHMATCH_CLI || 'codex';
const { stdout: version } = await run(cli, ['--version']);
const { stdout: features } = await run(cli, ['features', 'list']);
const { stdout: cloudHelp } = await run(cli, ['cloud', 'list', '--help']);
if (!/^hooks\s+stable\s+true$/m.test(features)) throw new Error('Enable trusted Codex hooks before using attention exits');
if (!cloudHelp.includes('--json') || !cloudHelp.includes('--cursor')) throw new Error('Cloud CLI lacks paginated JSON listing');
const { stdout: cloud } = await run(cli, ['cloud', 'list', '--json', '--limit', '1'], { timeout: 25000 });
if (!Array.isArray(JSON.parse(cloud).tasks)) throw new Error('Unexpected Cloud schema');
if (process.platform === 'darwin') {
  const { stdout: bundle } = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', '/Applications/ChatGPT.app/Contents/Info.plist']);
  if (bundle.trim() !== 'com.openai.codex') throw new Error('Codex desktop bundle unavailable');
}
console.log(JSON.stringify({ runtime: version.trim(), hooks: 'enabled', cloud: 'signed-in JSON schema verified', handoff: handoffCommand({ source: 'local', taskLink: 'codex://threads/example' }) }));
if (process.argv.includes('--completion-probe')) {
  if (!process.stdin.isTTY) throw new Error('Run the completion probe in an interactive terminal. codex exec does not emit notify on the installed runtime.');
  const dir = await mkdtemp(path.join(tmpdir(), 'arena-notify-'));
  let child;
  try {
    const capture = path.join(dir, 'capture.mjs'), target = path.join(dir, 'signal.json');
    await writeFile(capture, `import {writeFileSync} from 'node:fs'; const p=JSON.parse(process.argv.at(-1)); writeFileSync(${JSON.stringify(target)},JSON.stringify({type:p.type,'thread-id':p['thread-id'],'turn-id':p['turn-id']}));`);
    child = spawn(cli, ['--no-alt-screen', '--sandbox', 'read-only', '-c', `notify=${JSON.stringify([process.execPath, capture])}`,
      'Reply with exactly ARENA_NOTIFICATION_PROBE_OK. Do not use tools or inspect files.'], { stdio: 'inherit' });
    let signal;
    for (let n = 0; n < 900; n++) {
      try { signal = JSON.parse(await readFile(target, 'utf8')); break; } catch { await delay(100); }
      if (child.exitCode != null) break;
    }
    if (!normalizeNotification(signal)) throw new Error('No supported live completion notification received');
    console.log('Live agent-turn-complete verified. Only IDs and category were captured.');
  } finally { child?.kill('SIGINT'); await rm(dir, { recursive: true, force: true }); }
}
