import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Reproduce the original body/animation implementation for the dev-only
// comparison scene. These generated copies never enter the production build.
const revision = 'c3b4e53e79b1f5cb58ea9461e7465e384e1fb325';
const sources = ['src/game/character-anim.ts', 'src/game/emotes.ts', 'src/game/character/character.ts', 'src/game/character/body.ts', 'src/game/character/gibs.ts'];
for (const source of sources) {
  const original = execFileSync('git', ['show', `${revision}:${source}`], { encoding: 'utf8' });
  const rewritten = original.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g, (_match, quote, specifier) => {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), specifier));
    const selected = sources.find((s) => s === resolved || s === resolved + '.ts');
    return `from ${quote}${selected ? '/art/ybot/reports/baseline/' + selected : '/' + resolved}${quote}`;
  });
  const destination = 'art/ybot/reports/baseline/' + source;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, rewritten);
}
await writeFile('art/ybot/reports/baseline/revision.json', JSON.stringify({ revision, sources }, null, 2) + '\n');
console.log(`Prepared ${sources.length} original character sources from ${revision}.`);
