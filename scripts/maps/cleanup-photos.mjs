// Clean only orphaned, disposable headless photo browsers from this helper.
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { sep } from 'node:path';
const rows=execFileSync('ps',['-A','-o','pid=,ppid=,args='],{encoding:'utf8',maxBuffer:4*1024*1024}).split('\n');
let cleaned=0;
for(const row of rows) {
  const match=row.match(/^\s*(\d+)\s+1\s+.*--headless=new.*--remote-debugging-port=(\d+).*--user-data-dir=([^\s]+)/);
  if(!match)continue;
  const [,pid,port,profile]=match;
  if(!profile.startsWith(tmpdir()+sep+'ig-shot-'))continue;
  try {
    const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(2000)})).json();
    if(!tabs.some(tab=>tab.type==='page'&&tab.url.startsWith('http://127.0.0.1:5173/mapphoto?photo=1')))continue;
    process.kill(Number(pid),'SIGKILL');
    rmSync(profile,{recursive:true,force:true});cleaned++;
  } catch { /* Unidentified processes are left alone. */ }
}
console.log(`Cleaned ${cleaned} orphaned photo browser(s).`);
