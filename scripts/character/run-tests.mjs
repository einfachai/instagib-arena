import { build } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// The character imports the custom gun registry's Vite-only eager glob. For
// the Node harness, materialize that same single eager import at build time.
// Production sources and runtime dependencies are unchanged.
const outfile = 'art/ybot/reports/.runtime-tests.mjs';
await build({ entryPoints: ['tests/character.test.ts'], outfile, bundle: true, platform: 'node', format: 'esm', external: ['three', 'three/*'],
  plugins: [{ name: 'eager-custom-gun-registry', setup(builder) {
    builder.onLoad({ filter: /gun\/custom\/load\.ts$/ }, async ({ path }) => ({ contents: (await readFile(path, 'utf8')).replace("import.meta.glob('./index.ts', { eager: true });", "import './index.ts';"), loader: 'ts' }));
  } }] });
try { process.stdout.write(execFileSync(process.execPath, ['--test', ...process.argv.slice(2), outfile], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })); }
catch (error) { process.stdout.write(error.stdout ?? ''); process.stderr.write(error.stderr ?? ''); process.exitCode = 1; }

finally { await rm(outfile, { force: true }); }
