import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const source = execFileSync('git', ['show', 'HEAD:src/game/character/gun.ts'], { encoding: 'utf8' });
await writeFile('art/railgun-r01/review/.baseline-gun.ts', source.replaceAll("from '../", "from '../../../src/game/").replaceAll("import '../", "import '../../../src/game/").replace("from './character'", "from '../../../src/game/character/character'"));
