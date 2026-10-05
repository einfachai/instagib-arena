import * as THREE from 'three';
import { compositeScope, png } from './capture';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { preloadCharacterAssets } from '../../../src/game/character/assets';
import { Character } from '../../../src/game/character/character';
import { CharacterAnimator } from '../../../src/game/character-anim';
import { attachRailgun, type AttachedRailgun } from '../../../src/game/character/gun';
import { attachRailgun as attachOld } from './.baseline-gun';
import { buildRailgun, setRailgunReducedEffects, type RailgunModel } from '../../../src/game/weapon-model';
import { RAILGUN_FINISHES, railgunFinishById } from '../../../src/game/cosmetics';
import { VIEWMODEL_BASE, VIEWMODEL_SCALE, DEFAULT_FOV, DEFAULT_ZOOM_FOV } from '../../../src/game/constants';
import { ScopeOverlay } from '../../../src/game/scope';
import { ScopeTransition, sampleScope } from '../../../src/game/scope-transition';
import { applyScopePose, projectScopeSight } from '../../../src/game/scope-pose';
import { ViewmodelLayer } from '../../../src/game/renderer';
import { equipViewmodelArms, updateViewmodelArms } from '../../../src/game/viewmodel-arms';
import { ViewmodelMotion } from '../../../src/game/viewmodel-motion';
import { buildMapMesh, mapById } from '../../../src/game/map';

const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!;
const status=document.querySelector<HTMLDivElement>('#status')!;
const report=document.querySelector<HTMLPreElement>('#report')!;
const view=document.querySelector<HTMLSelectElement>('#view')!;
const finish=document.querySelector<HTMLSelectElement>('#finish')!;
const charge=document.querySelector<HTMLInputElement>('#charge')!;
const reduced=document.querySelector<HTMLInputElement>('#reduced')!;
const extras=document.querySelector<HTMLInputElement>('#extras')!;
const phase=document.querySelector<HTMLSpanElement>('#phase')!;
const scopeButton=document.querySelector<HTMLButtonElement>('#scope')!;
const scope=new ScopeOverlay(canvas);
const scopeTransition=new ScopeTransition();
const scopeProjection={x:0,y:0,scale:.1};
let scopeSample:number|null=null;
let scopeHeld=false, scopePreview=false, scopeAnimation=-1;
const aimPhase=document.querySelector<HTMLInputElement>('#aim-phase')!;
for(const f of RAILGUN_FINISHES){const o=document.createElement('option');o.value=f.id;o.textContent=f.name;finish.append(o);}
await preloadCharacterAssets();
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
const scene=new THREE.Scene();scene.background=new THREE.Color('#111820');
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();const env=pmrem.fromScene(room);scene.environment=env.texture;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xdcecff,0x26303c,2));
const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,5,3);scene.add(light);
const camera=new THREE.PerspectiveCamera(38,1,.01,200);scene.add(camera);
const viewmodel=new ViewmodelLayer(scene,camera);
const content=new THREE.Group();scene.add(content);
let gun:RailgunModel|null=null;
let actors:Array<{ch:Character;anim:CharacterAnimator;gun:AttachedRailgun|ReturnType<typeof attachOld>}> = [];
let mapObject:THREE.Group|null=null;
let cycle=1, running=false, busy=false, last=performance.now();
const motion=new ViewmodelMotion();
function qualities(g:{setFestive:(v:boolean)=>void;setKillstreak:(s:string|null,k:string|null)=>void;setStreak:(n:number)=>void;setStrangeKills?:(n:number|null)=>void}){
  g.setFestive(extras.checked);g.setKillstreak(extras.checked?'sheen.team':null,null);g.setStreak(extras.checked?8:0);g.setStrangeKills?.(extras.checked?137:null);
}
function setup(baseline=false){
  gun?.dispose();gun?.group.removeFromParent();gun=null;
  for(const a of actors){a.gun.dispose();a.anim.dispose();a.ch.dispose();}actors=[];content.clear();
  mapObject?.removeFromParent();mapObject=null;
  cycle=1;running=false;motion.reset();
  scopeHeld=false;scopePreview=false;scopeAnimation=-1;scopeButton.setAttribute('aria-pressed','false');scope.update(scopeTransition.reset(),DEFAULT_FOV,DEFAULT_FOV,1);scopeSample=null;
  const f=railgunFinishById(finish.value).data;
  if(view.value==='hero'||view.value==='vm'){
    gun=buildRailgun(f);qualities(gun);
    if(view.value==='hero'){
      content.add(gun.group);camera.fov=34;camera.position.set(-1.1,.4,.68);camera.lookAt(0,0,-.19);
    }else{
      const map=mapById('reactor');mapObject=buildMapMesh(map);scene.add(mapObject);
      camera.fov=DEFAULT_FOV;camera.position.set(map.spawn.x,map.spawn.y+1.65,map.spawn.z);camera.rotation.set(0,0,0);
      equipViewmodelArms(gun,f);viewmodel.camera.add(gun.group);gun.group.scale.setScalar(VIEWMODEL_SCALE);
    }
  }else{
    const count=view.value==='cast'?8:1;
    for(let i=0;i<count;i++){
      const ch=new Character();content.add(ch.root);
      ch.root.position.set((i%4-(count===1?0:1.5))*1.3,0,Math.floor(i/4)*1.7);
      const anim=new CharacterAnimator(ch,{driveYaw:true,holdGun:true});
      const g=baseline?attachOld(ch,f):attachRailgun(ch,f);qualities(g);
      anim.update({dt:1/60,yaw:-.65,pitch:0,pos:ch.root.position,grounded:true,velocity:{x:0,y:0,z:0}});
      actors.push({ch,anim,gun:g});
    }
    camera.fov=38;camera.position.set(count===1?-1.35:-5,count===1?1.9:2.1,count===1?-1.8:-8);camera.lookAt(0,count===1?1.35:1,count===1?0:.65);
  }
  camera.updateProjectionMatrix();resize();
}
function resize(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix();}
function fire(){if(cycle<1)return;cycle=0;running=true;motion.onFire();gun?.notifyFire();actors.forEach(a=>a.gun.notifyFire());}
function render(dt:number){
  if(running){cycle=Math.min(1,cycle+dt/1.2);if(cycle===1)running=false;}
  gun?.setCharge(cycle);actors.forEach(a=>a.gun.setCharge(cycle));
  if(scopeAnimation>=0){scopeAnimation+=dt;scopePreview=scopeAnimation<1.25;if(scopeAnimation>1.6)scopeAnimation=-1;}
  const scoped=view.value==='vm'&&(scopeHeld||scopePreview);
  const scopeFrame=scopeSample===null?scopeTransition.update(scoped,dt,view.value==='vm'):sampleScope(scopeSample);
  aimPhase.value=String(scopeFrame.progress);
  if(gun&&view.value==='vm'){
    camera.fov=THREE.MathUtils.lerp(DEFAULT_FOV,DEFAULT_ZOOM_FOV,scopeFrame.zoom);camera.updateProjectionMatrix();
    gun.group.visible=scopeFrame.weaponOpacity>0;
    const p=motion.update({dt,yaw:0,pitch:0,groundSpeed:0,lateralSpeed:0,grounded:true,zoom:scopeFrame.zoom,reducedEffects:reduced.checked});
    gun.group.position.set(VIEWMODEL_BASE.x+p.x,VIEWMODEL_BASE.y+p.y,VIEWMODEL_BASE.z+p.z);gun.group.rotation.set(p.rx,p.ry,p.rz);
    applyScopePose(gun.group,gun.sight,scopeFrame);updateViewmodelArms(gun.group);
    projectScopeSight(gun.group,gun.sight,camera,scopeProjection);
    gun.muzzleFlash.visible=p.muzzle>0;gun.muzzleFlash.material.opacity=p.muzzle;
  }
  scope.update(scopeFrame,DEFAULT_FOV,camera.fov,cycle,scopeProjection,reduced.checked);
  renderer.render(scene,camera);
  viewmodel.opacity=scopeFrame.weaponOpacity;
  if(view.value==='vm'&&viewmodel.active){viewmodel.sync();viewmodel.render(renderer);}
  charge.value=String(cycle);phase.textContent=cycle===1?'Ready':`${Math.round(cycle*100)}%`;
}
function frame(now:number){const dt=Math.max(0,(now-last)/1000);last=now;if(!busy)render(dt);requestAnimationFrame(frame);}
function download(blob:Blob,name:string){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
view.onchange=()=>setup();finish.onchange=()=>setup();extras.onchange=()=>{if(gun)qualities(gun);actors.forEach(a=>qualities(a.gun));};
reduced.onchange=()=>setRailgunReducedEffects(reduced.checked);
charge.oninput=()=>{running=false;cycle=Number(charge.value);render(0);};
document.querySelector<HTMLButtonElement>('#fire')!.onclick=fire;
scopeButton.onclick=()=>{
  if(view.value!=='vm'){view.value='vm';setup();}
  scopeSample=null;scopeAnimation=-1;scopePreview=!scopePreview;scopeButton.setAttribute('aria-pressed',String(scopePreview));
};
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{
  if(e.button===2){
    e.preventDefault();if(view.value!=='vm'){view.value='vm';setup();}
    scopeSample=null;scopeAnimation=-1;scopeHeld=true;
  }else if(e.button===0&&view.value==='vm')fire();
});
window.addEventListener('mouseup',e=>{if(e.button===2)scopeHeld=false;});
window.addEventListener('blur',()=>{scopeTransition.reset();scopeSample=null;scopeAnimation=-1;scopeHeld=false;scopePreview=false;scopeButton.setAttribute('aria-pressed','false');});
window.addEventListener('keydown',e=>{if(e.code==='Escape'){scopeHeld=false;scopePreview=false;scopeButton.setAttribute('aria-pressed','false');}});
document.querySelector<HTMLButtonElement>('#still')!.onclick=async()=>{render(0);download(await stillBlob(),`r01-${view.value}-${finish.value}-${Math.round(cycle*100)}.png`);};
document.querySelector<HTMLButtonElement>('#record')!.onclick=()=>{
  if(busy)return;cycle=1;const chunks:BlobPart[]=[];const stream=canvas.captureStream(30);const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8_000_000});
  recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());download(new Blob(chunks,{type:'video/webm'}),'r01-fire-reload.webm');status.textContent='Recorded two automatic shot/reload cycles.';};
  recorder.start();fire();setTimeout(fire,1800);setTimeout(()=>recorder.stop(),3600);status.textContent='Recording…';
};
const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
document.querySelector<HTMLButtonElement>('#benchmark')!.onclick=async()=>{
  if(busy)return;busy=true;view.value='cast';extras.checked=false;finish.value='gun.stock';const results=[];
  try{
    for(const baseline of [true,false]){
      setup(baseline);for(let i=0;i<30;i++){await nextFrame();render(1/60);}
      const samples:number[]=[];let triangles=0,calls=0;
      for(let i=0;i<120;i++){await nextFrame();const t=performance.now();
        actors.forEach((a,j)=>a.anim.update({dt:1/60,yaw:-.65,pitch:Math.sin(i*.03+j)*.1,pos:a.ch.root.position,grounded:true,velocity:{x:0,y:0,z:0}}));
        cycle=(i%72)/72;render(1/60);samples.push(performance.now()-t);triangles=Math.max(triangles,renderer.info.render.triangles);calls=Math.max(calls,renderer.info.render.calls);
      }
      samples.sort((a,b)=>a-b);results.push({model:baseline?'previous railgun':'R-01',characters:8,frames:120,cpuP50Ms:samples[60],cpuP95Ms:samples[114],triangles,drawCalls:calls});
      report.textContent=JSON.stringify(results,null,2);
    }
    status.textContent='Eight-character benchmark complete. CPU submission timings, same renderer and character assets.';
  }finally{busy=false;setup();}
};
window.addEventListener('resize',resize);setup();requestAnimationFrame(frame);
status.textContent='Hold right mouse for scope / zoom · Left mouse fires in first person · 1.2-second automatic recharge';

// Optional reproducible local capture run. The sink is a separate, loopback-only
// authoring script and is never part of the production game or its server.
async function saveArtifact(name:string, body:Blob|string) {
  const response=await fetch(`http://127.0.0.1:5199/${name}`,{method:'POST',body});
  if(!response.ok)throw new Error(`Capture save failed: ${response.status}`);
}
async function saveStill(name:string) {
  render(0);
  await saveArtifact(name,await stillBlob());
}
// Include the same live vector overlay that is visible in the review viewport.
async function stillBlob() {
  const capture=document.createElement('canvas');await compositeScope(canvas,scope.element,capture);return png(capture);
}
aimPhase.oninput=()=>{const value=Number(aimPhase.value);if(view.value!=='vm'){view.value='vm';setup();}scopeAnimation=-1;scopeSample=value;render(0);};
document.querySelector<HTMLButtonElement>('#animate-scope')!.onclick=()=>{view.value='vm';setup();scopeAnimation=0;scopeSample=null;};
document.querySelector<HTMLButtonElement>('#capture-scope')!.onclick=()=>captureTransition();
async function captureTransition(){
  if(busy)return;busy=true;view.value='vm';setup();renderer.setPixelRatio(1);resize();
  const samples=[];
  try{
    for(const p of [0,.2,.4,.6,.8,.9,1]){scopeSample=p;await saveStill(`r01-scope-transition-${Math.round(p*100)}.png`);}
    // Submission and real rAF pacing, warm shaders first. DOM blur is included
    // in pacing; CPU submission alone cannot isolate compositor/GPU cost.
    for(const [name,p,calm] of [['hip',0,false],['handoff-with-blur',.85,false],['handoff-no-blur',.85,true],['scoped',1,false]] as const){
      scopeSample=p;reduced.checked=calm;
      for(let i=0;i<8;i++){await nextFrame();render(0);}
      const cpu:number[]=[],interval:number[]=[];let prev=performance.now();let calls=0;
      renderer.info.autoReset=false;
      for(let i=0;i<45;i++){await nextFrame();const now=performance.now();interval.push(now-prev);prev=now;renderer.info.reset();render(0);cpu.push(performance.now()-now);calls=renderer.info.render.calls;}
      renderer.info.autoReset=true;cpu.sort((a,b)=>a-b);interval.sort((a,b)=>a-b);
      samples.push({name,frames:45,cpuMedianMs:cpu[22],cpuP95Ms:cpu[42],frameMedianMs:interval[22],frameP95Ms:interval[42],drawCalls:calls});
    }
    reduced.checked=false;scopeSample=null;scopeTransition.reset();scopePreview=false;
    const output=document.createElement('canvas');await compositeScope(canvas,scope.element,output);
    const stream=output.captureStream(30),parts:BlobPart[]=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8_000_000});
    const stopped=new Promise<void>(resolve=>{recorder.onstop=()=>resolve();});recorder.ondataavailable=e=>parts.push(e.data);recorder.start();
    let elapsed=0,lastTime=performance.now(),shot=false;
    while(elapsed<3.4){
      const now=performance.now(),dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;elapsed+=dt;
      scopePreview=(elapsed>.25&&elapsed<1.8)||(elapsed>2.25&&elapsed<2.45)||(elapsed>2.52&&elapsed<2.9);
      if(elapsed>.62&&!shot){fire();shot=true;}
      render(dt);await compositeScope(canvas,scope.element,output);await new Promise(resolve=>setTimeout(resolve,16));
    }
    recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());await saveArtifact('r01-scope-transition.webm',new Blob(parts,{type:'video/webm'}));
    await saveArtifact('r01-scope-performance.json',JSON.stringify({viewport:[canvas.width,canvas.height],samples,note:'Warmed CPU submission and rAF intervals in the local browser. Not isolated GPU timestamps. Video includes the live vector overlay and equivalent masked Canvas2D blur.'},null,2));
    status.textContent='Scope transition screenshots, video, and performance samples saved to art/railgun-r01/renders/.';
  }catch(error){status.textContent=String(error);}finally{busy=false;reduced.checked=false;scopeSample=null;scopePreview=false;scopeTransition.reset();}
}
async function captureReview() {
  busy=true;
  renderer.setPixelRatio(2);resize();
  const checks:Record<string,unknown>={canvas:[canvas.width,canvas.height],triangleBudgets:{high:7400,low:1868}};
  try {
    view.value='hero';finish.value='gun.stock';extras.checked=false;setup();
    await saveStill('r01-ingame-hero.png');
    view.value='vm';setup();await saveStill('r01-ingame-first-person.png');
    scopePreview=true;scopeSample=1;render(0);await saveStill('r01-ingame-scope.png');
    cycle=.45;render(0);await saveStill('r01-ingame-scope-recharge.png');
    scopePreview=false;scopeSample=null;scopeTransition.reset();camera.fov=DEFAULT_FOV;cycle=1;
    for(const [name,t] of [['discharge',0.02],['retract',0.2],['recharge',0.55],['locking',0.85],['ready',1]] as const){
      cycle=t;await saveStill(`r01-ingame-${name}.png`);
    }
    const type=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
    if(type){
      const stream=canvas.captureStream(30),parts:BlobPart[]=[];
      const recorder=new MediaRecorder(stream,{mimeType:type});
      const stopped=new Promise<void>(resolve=>{recorder.onstop=()=>resolve();});
      recorder.ondataavailable=e=>parts.push(e.data);recorder.start();
      const start=performance.now();let last=0,shots=0;
      while(last<3.65){
        const elapsed=(performance.now()-start)/1000;
        if(shots===0||(shots===1&&elapsed>=1.8)){motion.onFire();gun?.notifyFire();shots++;}
        cycle=Math.min(1,(elapsed>=1.8?elapsed-1.8:elapsed)/1.2);running=false;
        render(Math.min(.05,elapsed-last));last=elapsed;
        await new Promise(resolve=>setTimeout(resolve,16));
      }
      recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
      await saveArtifact('r01-fire-reload.webm',new Blob(parts,{type:'video/webm'}));
      checks.video='Two automatic recharge cycles, real viewmodel renderer, no audio';
    }else checks.video='WebM recording unsupported by this browser; phase PNGs were saved.';
    view.value='hero';finish.value='gun.hazard';setup();await saveStill('r01-ingame-hazard.png');
    finish.value='gun.admin';setup();await saveStill('r01-ingame-special.png');
    finish.value='gun.stock';extras.checked=true;setup();await saveStill('r01-ingame-attachments.png');
    extras.checked=false;view.value='character';setup();await saveStill('r01-ingame-character.png');
    view.value='cast';const benchmark=[];
    for(const old of [true,false]){
      setup(old);for(let i=0;i<12;i++)render(1/60);
      const samples:number[]=[];
      for(let i=0;i<60;i++){const start=performance.now();render(1/60);samples.push(performance.now()-start);}
      samples.sort((a,b)=>a-b);
      benchmark.push({model:old?'previous railgun':'R-01',characters:8,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cpuP50Ms:samples[30],cpuP95Ms:samples[57]});
    }
    checks.benchmark=benchmark;checks.timingNote='Synchronous CPU render-submission samples; not a GPU or frame-rate benchmark. Other local builds may affect timing.';
    await saveStill('r01-ingame-eight-characters.png');
    setRailgunReducedEffects(true);view.value='hero';setup();cycle=.3;await saveStill('r01-ingame-reduced.png');setRailgunReducedEffects(false);
    await saveArtifact('r01-capture-report.json',JSON.stringify(checks,null,2));
    status.textContent='Saved first-person, hero, character, finish, attachment and recharge captures to art/railgun-r01/renders/.';
  }catch(error){
    checks.error=String(error);await saveArtifact('r01-capture-report.json',JSON.stringify(checks,null,2));status.textContent=String(error);
  }finally{busy=false;renderer.setPixelRatio(1);view.value='hero';finish.value='gun.stock';extras.checked=false;setup();}
}
async function captureScope(){
  busy=true;renderer.setPixelRatio(2);view.value='vm';setup();
  try{
    await saveStill('r01-scope-hipfire.png');
    scopePreview=true;scopeSample=1;await saveStill('r01-ingame-scope.png');
    cycle=.45;await saveStill('r01-ingame-scope-recharge.png');
    cycle=1;scopeSample=null;scopeTransition.update(true,.5);scopeButton.setAttribute('aria-pressed','true');
    status.textContent='Scope captures saved · Hold right mouse for scoped aiming';
  }finally{busy=false;renderer.setPixelRatio(1);resize();}
}
fetch('http://127.0.0.1:5199/status').then(r=>r.json()).then(state=>{
  if(state.armed){const mode=new URLSearchParams(location.search).get('capture');return mode==='transition'?captureTransition():mode==='scope'?captureScope():captureReview();}
}).catch(()=>{});
