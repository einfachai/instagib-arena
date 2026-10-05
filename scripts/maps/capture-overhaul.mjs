// One hardware browser session exercises real map switches and resource reuse.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('design/shots/futuristic',{recursive:true});
const args=['scripts/shot.mjs','--base',process.argv[2]??'http://127.0.0.1:5174','--solo','causeway','--all-maps','--switch-check','--size','1920x1080','--out','design/shots/futuristic/map','--shots','wide;surface;combat','--wait','2500','--each','1500','--benchmark','20000'];
const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']});
let log='';
for(const stream of [child.stdout,child.stderr]) stream.on('data',data=>{log+=data;process.stdout.write(data);writeFileSync('design/shots/futuristic/capture.log',log);});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',code=>{writeFileSync('design/shots/futuristic/capture.log',log);process.exitCode=code??1;});
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>child.kill(signal));
