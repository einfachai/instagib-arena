import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(os.homedir(), '.agents/plugins/marketplace.json');
const remove = process.argv.includes('--remove');
const exists = fs.existsSync(catalogPath);
const catalog = exists ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : {
  name: 'agent-deathmatch-local',
  interface: { displayName: 'Agent Deathmatch Local' },
  plugins: []
};

if (typeof catalog.name !== 'string' || !Array.isArray(catalog.plugins)) {
  throw new Error('The personal catalog has an unexpected format; no changes made.');
}

const entry = {
  name: 'agent-deathmatch',
  source: {
    source: 'local',
    path: './' + path.relative(os.homedir(), pluginRoot).split(path.sep).join('/')
  },
  policy: { installation: 'AVAILABLE', authentication: 'ON_USE' },
  category: 'Developer Tools'
};
const index = catalog.plugins.findIndex(item => item.name === entry.name);
if (remove) {
  if (index >= 0) catalog.plugins.splice(index, 1);
} else if (index < 0) {
  catalog.plugins.push(entry);
} else {
  catalog.plugins[index] = entry;
}

if (exists || !remove) {
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  const temporary = catalogPath + '.agent-deathmatch.tmp';
  fs.writeFileSync(temporary, JSON.stringify(catalog, null, 2) + '\n', { mode: 0o644 });
  fs.renameSync(temporary, catalogPath);
}

console.log(`${remove ? 'Removed from' : 'Registered in'} ${catalogPath}`);
console.log(`Marketplace: ${catalog.interface?.displayName || catalog.name}`);
console.log('Fully quit and reopen the desktop app to refresh the Plugins Directory.');
