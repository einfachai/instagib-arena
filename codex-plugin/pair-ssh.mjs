import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { api, loadConnection } from './connection.mjs';
const run = promisify(execFile);
const host = process.argv[2];
if (!host || !/^[\w.@-]+$/.test(host) || host.startsWith('-')) throw new Error('Pass an SSH host from your SSH config');
const connection = await loadConnection();
const { token } = await api(connection, '/helper', { host });
const files = {};
for (const name of ['notify.mjs', 'adapters.mjs', 'connection.mjs', 'setup.py', 'check.mjs', 'helper.mjs']) {
  files[name] = await readFile(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}
files['controller.json'] = JSON.stringify({ origin: connection.origin, token, source: 'ssh', host });
// Upload over SSH stdin: credentials never appear in process arguments, logs, or shell interpolation.
const bootstrap = `import sys,json,pathlib,os,subprocess
p=json.load(sys.stdin); d=pathlib.Path.home()/'.local/share/agent-deathmatch'; d.mkdir(parents=True,exist_ok=True,mode=0o700)
for n,t in p.items():
 f=d/n; f.write_text(t); f.chmod(0o600)
subprocess.run(['python3',str(d/'setup.py'),'--data',str(d),'--install-hooks'],check=True)
subprocess.run(['node',str(d/'check.mjs'),'--data',str(d)],check=True)
with open(d/'helper.log','ab',buffering=0) as log:
 subprocess.Popen(['node',str(d/'helper.mjs'),'--data',str(d)],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
`;
const child = execFile('ssh', [host, 'python3', '-c', `'${bootstrap.replaceAll("'", "'\\''")}'`], { timeout: 30_000 }, (error, stdout, stderr) => {
  if (error) { process.stderr.write(stderr); process.exitCode = 1; }
  else process.stdout.write(stdout);
});
child.stdin.end(JSON.stringify(files));
await new Promise(resolve => child.once('close', resolve));
if (!process.exitCode) {
  const { stdout } = await run('ssh', [host, 'python3 ~/.local/share/agent-deathmatch/setup.py --check'], { timeout: 10_000 });
  process.stdout.write(stdout);
  console.log('Helper installed and paired. Review hook trust on this SSH host before attention mode.');
}
