#!/usr/bin/env node
// Headless screenshot harness for visual critique — dev tooling, no deps.
//
// Launches its own headless Chrome (own profile + debugging port, so several
// agents can capture in parallel without fighting over one browser), drives the
// page over the DevTools Protocol with Node's built-in WebSocket, and writes
// JPEGs. Solo vs Bots runs offline, so only a vite dev server is needed.
//
//   node scripts/shot.mjs --base http://localhost:5173 --out design/shots/r1 \
//     --solo reactor --shots "spawn;wide:1.57,-0.1,20,4.7,12;floor:0,-0.6"
//
// Flags
//   --base URL      dev server origin (default http://localhost:5173)
//   --path PATH     page to open (default /play?photo=1)
//   --out PREFIX    output path prefix; each shot → <PREFIX>-<name>.jpg
//   --solo MAP      open the dev-only /mapphoto entry directly (offline)
//   --quality Q     high = 2K, low = 1K (default high)
//   --shots LIST    ';'-separated `name[:yaw,pitch[,x,y,z]]` (default "shot");
//                   a positioned view is held every frame (aerial shots don't fall).
//                   yaw 0 looks toward −z, π/2 toward −x; pitch < 0 looks down.
//   --wait MS       settle time after the match starts (default 5000)
//   --each MS       settle time between shots (default 900)
//   --benchmark MS  measure steady rendering after the last view (default 0)
//   --all-maps      capture every retained map in both qualities in one browser
//   --switch-check  verify live map switches finish loading
//   --missing-assets block world textures and verify procedural fallback
//   --movement-check exercise jump and floor boost through real game input
//   --eval JS       run JS in the page before the first shot
//   --size WxH      viewport (default 1600x900)
//   --keep-overlay  don't strip the click-to-play overlay
//   --no-hud        hide the React HUD layer (pure 3D frame)
//   --no-gun        hide the first-person railgun (layout / overview shots)
//   --no-bots       remove the bots (empty arena; they can't kill the camera)
//   --training      open Training through /mapphoto (instead of --solo)
//   --cookie N=V    set a cookie on the base origin before loading (e.g. a
//                   logged-in igsession from a curl cookie jar)
//
// Menu/front-end pages: pass --path /play (or /, /lockerlab…) and no --solo.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { photoSelectRequest } from './photo-select.mjs';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

const base = flag('base', 'http://localhost:5173');
const path = flag('path', '/play?photo=1');
const out = flag('out', 'design/shots/shot');
const solo = flag('solo', null);
const quality = flag('quality', 'high');
const shotsArg = flag('shots', 'shot');
const settle = Number(flag('wait', 5000));
const benchmark = Number(flag('benchmark', 0));
const each = Number(flag('each', 900));
const evalJs = flag('eval', null);
const [vw, vh] = String(flag('size', '1600x900')).split('x').map(Number);
const keepOverlay = flag('keep-overlay', false) === true;
const noHud = flag('no-hud', false) === true;
const cookie = flag('cookie', null);
const noGun = flag('no-gun', false) === true;
const noBots = flag('no-bots', false) === true;
const missingAssets = flag('missing-assets', false) === true;
const allMaps = flag('all-maps', false) === true;
const switchCheck = flag('switch-check', false) === true;
const movementCheck = flag('movement-check', false) === true;
const trainingMode = flag('training', false) === true;

const CHROME =
  process.env.CHROME_BIN ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logText = (value) => String(value).replace(/\x1b/g, '').replace(/\n|\r/g, '');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

async function main() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'ig-shot-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${vw},${vh}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--ignore-gpu-blocklist',
      'about:blank',
    ],
    { stdio: ['ignore','ignore','pipe'] },
  );
  let launchLog='';
  chrome.stderr.on('data',chunk=>{launchLog=(launchLog+String(chunk)).slice(-1800);});
  chrome.on('error',error=>{launchLog+=error.message;});
  const cleanup = () => {
    try { chrome.kill('SIGKILL'); } catch { /* gone */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
  };
  process.on('exit', cleanup);
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{cleanup();process.exit(1);});

  // Wait for the DevTools endpoint, then attach to the first page target.
  let target = null;
  for (let i = 0; i < 400 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page') ?? null;
    } catch { /* not up yet */ }
    if (!target) await sleep(150);
  }
  if (!target) throw new Error(`Chrome DevTools endpoint never came up (exit ${chrome.exitCode}, signal ${chrome.signalCode}): ${launchLog}`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let nextId = 1;
  const pending = new Map();
  const consoleLines = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const line = `[exception] ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`;
      consoleLines.push(line);
      console.error(logText(line));
    } else if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      consoleLines.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'info' && String(msg.params.args[0]?.value ?? '').startsWith('[world]')) {
      // Map build timings (lightmap bake, texture generation) — dev builds only.
      consoleLines.push(String(msg.params.args[0].value));
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  const selectPhoto = async (label, value) => {
    for (let i = 0; i < 240; i++) {
      const present = await (async () => {
        const document = await send('Runtime.evaluate', { expression: 'document' });
        const result = await send('Runtime.callFunctionOn', photoSelectRequest(document.result.objectId, label, value));
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        return result.result?.value;
      })().catch(() => false);
      if (present) {
        await sleep(150);
        return;
      }
      await sleep(250);
    }
    const state = await evaluate(`JSON.stringify({url:location.href,text:document.body.innerText.slice(0,1500)})`);
    throw new Error(`Missing photo ${label} control: ${state}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
  // Skip first-run onboarding and give the profile a name.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{localStorage.setItem('instagib-onboarded','1');if(!localStorage.getItem('instagib-name'))localStorage.setItem('instagib-name','shot');}catch(e){}`,
  });
  if (cookie) {
    await send('Network.enable');
    const eq = String(cookie).indexOf('=');
    await send('Network.setCookie', { url: base, name: String(cookie).slice(0, eq), value: String(cookie).slice(eq + 1) });
  }
  if(missingAssets) { await send('Network.enable'); await send('Network.setBlockedURLs',{urls:['*://*/textures/world/*']}); }
  const photoPath=(solo||trainingMode) ? `/mapphoto?photo=1&map=${encodeURIComponent(trainingMode?'training':solo)}&quality=${encodeURIComponent(quality)}&bots=${noBots?'0':'7'}` : path;
  await send('Page.navigate', { url: base + photoPath });
  // Wait for the app to mount (a cold vite can take a while to serve the first
  // module graph) rather than a fixed sleep.
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    const ready = await evaluate(`document.readyState === 'complete' && document.querySelectorAll('button,a,canvas').length > 0`).catch(() => false);
    if (ready) break;
  }
  await sleep(800);

  // Strip the click-to-play overlay's blur, and optionally hide the HUD layer.
  const clearOverlays = async () => {
    if (!keepOverlay) {
      await evaluate(`(() => {
        const h = [...document.querySelectorAll('h1,h2,div,p,span')].find((e) => e.childElementCount === 0 && /click to play/i.test(e.textContent || ''));
        let el = h, ov = null;
        while (el && el !== document.body) {
          const cs = getComputedStyle(el);
          if ((cs.position === 'fixed' || cs.position === 'absolute') && (cs.backdropFilter !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)')) { ov = el; break; }
          el = el.parentElement;
        }
        if (ov) { ov.style.backdropFilter = 'none'; ov.style.background = 'transparent'; [...ov.children].forEach((c) => (c.style.visibility = 'hidden')); }
        return !!ov;
      })()`);
    }
    if (noHud) {
      await evaluate(`(() => { const c = document.querySelector('canvas'); if (!c) return; for (const el of c.parentElement.children) if (el !== c) el.style.visibility = 'hidden'; })()`);
    }
  };

  if (solo || trainingMode) {
    let ready=false;
    for(let i=0;i<240;i++) {
      ready=await evaluate(`['ready','fallback'].includes(document.querySelector('[data-photo-status]')?.textContent)`);
      if(ready) break;
      await sleep(250);
    }
    if(!ready) throw new Error('Photo arena did not finish loading');
    await sleep(settle);
    await evaluate(`(() => {const style=document.createElement('style');style.textContent='[data-photo-controls],body button {display:none!important}';document.head.append(style);})()`);
    await clearOverlays();
  } else await sleep(Math.min(settle,2500));

  // Settings sync can re-show the viewmodel after the first shot, so the hide is
  // re-applied every frame (the hold loop below also calls it).
  if (noGun) await evaluate(`(() => { window.__shotNoGun = true; const f = () => { if (window.__ig) window.__ig.setViewmodel({ x: 0, y: 0, z: 0 }, true); requestAnimationFrame(f); }; f(); })()`);
  // Re-applied every frame too: a settings sync / respawn can bring bots back.
  if (noBots) await evaluate(`(() => { const f = () => { if (window.__ig) window.__ig.setBotsEnabled(false); requestAnimationFrame(f); }; f(); })()`);
  if (evalJs) await evaluate(String(evalJs));

  const shots = String(shotsArg).split(';').map((s) => s.trim()).filter(Boolean);
  const jobs=allMaps?['causeway','reactor','containeryard','derrick','training'].flatMap(map=>['high','low'].map(quality=>({map,quality}))):[{map:solo,quality}];
  mkdirSync(dirname(out), { recursive: true });
  for(const job of jobs) {
    if(allMaps) {
      await selectPhoto('Map', job.map);
      await selectPhoto('Quality', job.quality);
      let ready=false;
      for(let i=0;i<600;i++){await sleep(100);ready=await evaluate(`['ready','fallback'].includes(document.querySelector('[data-photo-status]')?.textContent)`);if(ready)break;}
      if(!ready)throw new Error(`Photo materials stalled: ${job.map}/${job.quality}`);
      await sleep(settle);
    }
    for (const spec of shots) {
      const [name, view] = spec.split(':');
      if (!view && ['wide','surface','combat'].includes(name)) {
        await selectPhoto('View', name);
      }
      if (view) {
        const n = view.split(',').map(Number);
        const pos = n.length >= 5 ? `{x:${n[2]},y:${n[3]},z:${n[4]}}` : 'undefined';
        await evaluate(`(() => {
          window.__shotHold = { yaw: ${n[0]}, pitch: ${n[1]}, pos: ${pos} };
          if (!window.__shotHoldLoop) {
            window.__shotHoldLoop = true;
            const f = () => { const h = window.__shotHold; if (h && window.__ig) window.__ig.setPhotoView(h.yaw, h.pitch, h.pos && { ...h.pos }); requestAnimationFrame(f); }; f();
          }
        })()`);
      }
      await sleep(each);
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      const file = allMaps?`${out}-${job.map}-${job.quality}-${name}.jpg`:`${out}-${name}.jpg`;
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log(logText(file));
    }
    if(benchmark>0) {
      // Begin after traversal/material/shader warmup; report steady frames only.
      await evaluate(`window.__ig?.mapAssetsReady()`);
      await sleep(benchmark);
    }
    const metrics=await evaluate(`document.querySelector('[data-photo-metrics]')?.textContent`);
    if((solo||trainingMode)&&benchmark>0&&!metrics?.includes('render '))throw Error(`Missing timing sample: ${job.map}/${job.quality}`);
    if(metrics) console.log(`[performance ${job.map}/${job.quality}] ${logText(metrics)}`);
  }
  if(switchCheck) {
    for(const map of ['derrick','reactor','containeryard','training','causeway']) {
      await selectPhoto('Map', map);
      let status='';
      for(let i=0;i<600;i++) {await sleep(100);status=await evaluate(`document.querySelector('[data-photo-status]')?.textContent`);if(status==='ready'||status==='fallback')break;}
      if(status!=='ready' && status!=='fallback')throw new Error(`Map switch stalled: ${map}`);
      console.log(`[switch] ${map}: ${status}`);
    }
  }
  if(movementCheck) {
    await send('Page.bringToFront');
    const key=async(code,key,pressed,windowsVirtualKeyCode)=>send('Input.dispatchKeyEvent',{type:pressed?'keyDown':'keyUp',code,key,windowsVirtualKeyCode});
    const beginMovement=async()=>evaluate(`(() => {document.activeElement?.blur();window.__shotMovement=[];window.__shotMovementObserver?.disconnect();const output=document.querySelector('[data-photo-metrics]');window.__shotMovementObserver=new MutationObserver(()=>window.__shotMovement.push(output.textContent));window.__shotMovementObserver.observe(output,{childList:true,subtree:true,characterData:true});})()`);
    const movement=async(peak=false)=>{
      const value=await evaluate(peak?`(window.__shotMovement??[]).filter(text=>text.includes('position')).sort((a,b)=>Number(b.match(/position [\\d.-]+, ([\\d.-]+)/)?.[1])-Number(a.match(/position [\\d.-]+, ([\\d.-]+)/)?.[1]))[0]??document.querySelector('[data-photo-metrics]')?.textContent`:`document.querySelector('[data-photo-metrics]')?.textContent ?? ''`);
      const match=value.match(/position ([\d.-]+), ([\d.-]+), ([\d.-]+)/);
      if(!match)throw Error(`Missing movement diagnostics: ${value}`);
      return {x:Number(match[1]),y:Number(match[2]),z:Number(match[3]),text:value};
    };
    for(const map of ['causeway','reactor','containeryard','derrick']) {
      await selectPhoto('Map',map);await selectPhoto('View','surface');
      await evaluate(`window.__ig?.mapAssetsReady()`);
      await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Playtest').click()`);
      await sleep(1200);
      const start=await movement();
      await beginMovement();
      await key('Space',' ',true,32);await sleep(220);await key('Space',' ',false,32);await sleep(80);
      await sleep(600);
      const jump=await movement(true);
      if(jump.y<start.y+.5 || !jump.text.includes('airborne'))throw Error(`${map}: jump failed (${jump.text})`);
      await sleep(1000);
      await evaluate(`window.__ig.setPlayerView(0,-Math.PI/2)`);
      await sleep(150);
      await beginMovement();
      await key('KeyE','e',true,69);await sleep(100);await key('KeyE','e',false,69);await sleep(300);
      await sleep(600);
      const boost=await movement(true);
      if(boost.y<start.y+3 || !boost.text.includes('airborne'))throw Error(`${map}: floor boost failed (${boost.text})`);
      const [halfX,halfZ,cap]=['causeway','reactor'].includes(map)?[48,36,30]:[34,29,26];
      for(const pose of [start,jump,boost]) if(![pose.x,pose.y,pose.z].every(Number.isFinite) || Math.abs(pose.x)>=halfX || Math.abs(pose.z)>=halfZ || pose.y<0 || pose.y>=cap)throw Error(`${map}: invalid movement position (${pose.text})`);
      console.log(`[movement] ${map}: jump +${(jump.y-start.y).toFixed(2)} m; boost +${(boost.y-start.y).toFixed(2)} m; finite and inside bounds`);
      const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:90});
      writeFileSync(`${out}-${map}-boost.jpg`,Buffer.from(shot.data,'base64'));
      await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Playtest').click()`);
      await sleep(150);
    }
  }
  const gl = await evaluate(`(() => { try { const c = document.createElement('canvas').getContext('webgl2'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : (c ? 'webgl2' : 'none'); } catch (e) { return String(e); } })()`);
  console.log(`[gl] ${logText(gl)}`);
  for (const line of consoleLines.slice(0, 30)) console.log(logText(line));
  ws.close();
  cleanup();
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
