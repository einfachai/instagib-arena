// Local-only artifact sink for the authored weapon review harness. No game API.
import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('art/railgun-r01/renders');
await mkdir(output, { recursive: true });
// Manual captures must not start an unrelated full review on an HMR reload.
let armed = !process.argv.includes('--manual');
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin !== 'http://127.0.0.1:5173') { res.writeHead(403).end(); return; }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method === 'GET' && req.url === '/status') {
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ armed })); armed = false; return;
  }
  const name = (req.url || '').slice(1);
  if (req.method !== 'POST' || !/^r01-[a-z0-9-]+\.(png|webm|json)$/.test(name)) { res.writeHead(404).end(); return; }
  try {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 32 * 1024 * 1024) throw new Error('Capture too large'); chunks.push(chunk); }
    await writeFile(path.join(output, name), Buffer.concat(chunks));
    console.log(`Saved ${name}: ${size} bytes`); res.end('saved');
  } catch (e) { res.writeHead(400).end(String(e)); }
});
server.listen(5199, '127.0.0.1', () => console.log('R-01 local capture sink ready on 127.0.0.1:5199'));
