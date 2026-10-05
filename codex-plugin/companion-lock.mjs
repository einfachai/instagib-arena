import { openSync, closeSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

function livePid(text) {
  const pid = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('Invalid companion.lock; inspect the file before removing it');
  }
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

// All PID-file operations run under this exclusive guard. A crashed guard is
// deliberately left for inspection: unlinking a supposedly stale guard would
// introduce the same takeover race that this guard prevents.
function guarded(guardPath, action) {
  let fd;
  try { fd = openSync(guardPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return { busy: true }; throw error; }
  try {
    writeFileSync(fd, String(process.pid));
    return { busy: false, value: action() };
  } finally {
    closeSync(fd);
    unlinkSync(guardPath);
  }
}

export async function acquireCompanionLock(dataDir, waitMs = 2000) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const lockPath = path.join(dataDir, 'companion.lock');
  const guardPath = path.join(dataDir, 'companion.lock.guard');
  const deadline = Date.now() + waitMs;
  for (;;) {
    const attempt = guarded(guardPath, () => {
      try {
        if (livePid(readFileSync(lockPath, 'utf8'))) return null;
        unlinkSync(lockPath);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const fd = openSync(lockPath, 'wx', 0o600);
      try { writeFileSync(fd, String(process.pid)); } finally { closeSync(fd); }
      return () => {
        guarded(guardPath, () => {
          try {
            if (readFileSync(lockPath, 'utf8') === String(process.pid)) unlinkSync(lockPath);
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
        });
      };
    });
    if (!attempt.busy) return attempt.value;
    if (Date.now() >= deadline) throw new Error(`Companion lock guard is busy: ${guardPath}. If its process has exited, inspect and remove only this guard file before retrying.`);
    await delay(20);
  }
}
