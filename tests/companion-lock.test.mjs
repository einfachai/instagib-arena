import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { acquireCompanionLock } from '../codex-plugin/companion-lock.mjs';

const run = promisify(execFile);
const moduleUrl = new URL('../codex-plugin/companion-lock.mjs', import.meta.url).href;
const contender = `
  import { acquireCompanionLock } from ${JSON.stringify(moduleUrl)};
  const release = await acquireCompanionLock(process.argv[1]);
  if (release) process.on('exit', release);
  process.send({ acquired: !!release });
  if (!release) process.exit(0);
  process.on('message', () => process.exit(0));
`;

for (const stale of [false, true]) test(`concurrent companion startups elect one owner${stale ? ' after a crash' : ''}`, { timeout: 15000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arena-companion-lock-'));
  const children = [];
  try {
    if (stale) {
      const dead = await run(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']);
      await writeFile(path.join(dir, 'companion.lock'), dead.stdout, { mode: 0o600 });
    }
    const results = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', contender, dir], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      children.push(child);
      let errors = '';
      child.stderr.on('data', data => { errors += data; });
      child.once('error', reject);
      child.once('message', result => resolve({ child, ...result }));
      child.once('exit', code => { if (code) reject(new Error(errors)); });
    })));
    const owners = results.filter(result => result.acquired);
    assert.equal(owners.length, 1);
    assert.equal(await readFile(path.join(dir, 'companion.lock'), 'utf8'), String(owners[0].child.pid));
    if (process.platform !== 'win32') assert.equal((await stat(path.join(dir, 'companion.lock'))).mode & 0o777, 0o600);
    const exit = new Promise(resolve => owners[0].child.once('exit', resolve));
    owners[0].child.send('exit');
    await exit;
    await assert.rejects(readFile(path.join(dir, 'companion.lock')), { code: 'ENOENT' });
    const release = await acquireCompanionLock(dir);
    assert.equal(typeof release, 'function');
    release();
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
    await rm(dir, { recursive: true, force: true });
  }
});

test('lock release preserves a different owner and never takes over a crashed guard', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arena-companion-owner-'));
  try {
    const release = await acquireCompanionLock(dir);
    await writeFile(path.join(dir, 'companion.lock'), '123');
    release();
    assert.equal(await readFile(path.join(dir, 'companion.lock'), 'utf8'), '123');
    await writeFile(path.join(dir, 'companion.lock.guard'), '456');
    await assert.rejects(acquireCompanionLock(dir, 0), /inspect and remove only this guard/);
    assert.equal(await readFile(path.join(dir, 'companion.lock.guard'), 'utf8'), '456');
    assert.equal(await readFile(path.join(dir, 'companion.lock'), 'utf8'), '123');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('invalid PID files cannot probe process groups or trigger takeover', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arena-companion-invalid-'));
  try {
    for (const value of ['0', '-1', '', 'NaN', '1e3', '9007199254740992']) {
      await writeFile(path.join(dir, 'companion.lock'), value);
      await assert.rejects(acquireCompanionLock(dir), /Invalid companion.lock/);
      assert.equal(await readFile(path.join(dir, 'companion.lock'), 'utf8'), value);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
