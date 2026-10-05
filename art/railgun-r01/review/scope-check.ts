// Local authoring fixture. Runs the real Game/InputManager/weapon, with the
// existing ?photo=1 mode granting input without browser pointer-lock permission.
import { Game } from '../../../src/game/game';
import { preloadCharacterAssets } from '../../../src/game/character/assets';
import { mapById } from '../../../src/game/map';
import type { HudState } from '../../../src/game/types';
import type { PerspectiveCamera, Group } from 'three';
import type { ScopeTransition } from '../../../src/game/scope-transition';

const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!;
const status=document.querySelector<HTMLSpanElement>('#status')!;
const report=document.querySelector<HTMLPreElement>('#report')!;
const button=document.querySelector<HTMLButtonElement>('#check')!;
document.querySelector('header')!.addEventListener('mousedown',event=>event.stopPropagation());
let hud:HudState;
await preloadCharacterAssets();
const game=new Game(canvas,state=>{hud=state;});
game.setMasterVolume(0);game.setBotsEnabled(false);game.setFpsLimit(60);
game.setMap(mapById('reactor'));game.setFov(90);game.setZoomFov(55);
await game.start();
// Inspection is deliberately contained in this authoring fixture, never a
// production debug endpoint. Assert the renderer's result, not a parallel model.
const probe=game as unknown as {camera:PerspectiveCamera;viewmodel:Group;input:{lookScale:number};weapon:{cooldown:number;cooldownTotal:number};localWarmupUntil:number;photoMode:boolean;scopeTransition:ScopeTransition;hideViewmodel:boolean;lowSpec:boolean;scopeProjection:{x:number;y:number};spectator:boolean;chatOpen:boolean;player:{pos:{x:number;z:number}};handleLocalDeath(name:string,id:string):void;killcam:{remaining:number}|null};
probe.localWarmupUntil=0;probe.photoMode=false;
const mouse=(type:string,button:number)=>window.dispatchEvent(new MouseEvent(type,{button,cancelable:true}));
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const optic=()=>document.querySelector<HTMLDivElement>('.r01-scope')!;
const checks:Array<{name:string;pass:boolean}>=[];
const check=(name:string,pass:boolean)=>{checks.push({name,pass});report.textContent=JSON.stringify(checks,null,2);if(!pass)throw new Error(name);};
let held=false;
document.querySelector<HTMLButtonElement>('#scope')!.onclick=()=>{held=!held;mouse(held?'mousedown':'mouseup',2);};
document.querySelector<HTMLButtonElement>('#fire')!.onclick=()=>{mouse('mousedown',0);setTimeout(()=>mouse('mouseup',0),80);};
button.disabled=false;document.querySelector<HTMLButtonElement>('#scope')!.disabled=false;document.querySelector<HTMLButtonElement>('#fire')!.disabled=false;
status.textContent='Ready · hold right mouse in the viewport, or run checks';
button.onclick=async()=>{
  button.disabled=true;checks.length=0;mouse('mouseup',2);probe.scopeTransition.reset();await delay(300);
  try{
    check('photo mode enables real game input',hud.locked);
    mouse('mousedown',2);await delay(180);
    check('weapon stays visible while rising',probe.viewmodel.visible&&probe.scopeTransition.frame.progress>0&&probe.scopeTransition.frame.progress<1);
    check('camera begins zooming during approach',probe.camera.fov<90&&probe.camera.fov>55);
    mouse('mousedown',0);await delay(60);mouse('mouseup',0);
    check('firing remains available during approach',probe.weapon.cooldown>0);
    const beforeRelease=probe.scopeTransition.frame.progress;mouse('mouseup',2);await delay(40);const reversed=probe.scopeTransition.frame.progress;
    check('early release reverses before fully scoped',reversed>=0&&reversed<beforeRelease);
    mouse('mousedown',2);await delay(700);
    check('RMB shows the optic and hides the first-person model',!optic().hidden&&!probe.viewmodel.visible);
    check('camera zoom reaches 55 degrees',Math.abs(probe.camera.fov-55)<.1);
    check('zoom sensitivity follows FOV',Math.abs(probe.input.lookScale-55/90)<.01);
    check('regular crosshair is hidden',getComputedStyle(document.querySelector('#aim')!).visibility==='hidden');
    await delay(1350);mouse('mousedown',0);await delay(90);mouse('mouseup',0);
    check('left mouse fires while scoped',probe.weapon.cooldown>0);
    check('scope displays real recharge',optic().textContent!.includes('RECHARGING'));
    const cooldown=probe.weapon.cooldown;
    mouse('mousedown',0);await delay(90);mouse('mouseup',0);
    check('blocked shot does not restart recharge',probe.weapon.cooldown<cooldown);
    await delay(1350);
    check('automatic recharge returns to ready',probe.weapon.cooldown===0&&optic().textContent!.includes('READY'));
    mouse('mouseup',2);await delay(700);
    check('release restores the weapon and FOV',optic().hidden&&probe.viewmodel.visible&&Math.abs(probe.camera.fov-90)<.1);
    mouse('mousedown',2);await delay(100);window.dispatchEvent(new Event('blur'));await delay(150);
    check('blur cannot leave the optic stuck',optic().hidden);
    game.setReducedEffects(true);mouse('mousedown',2);await delay(700);
    check('reduced effects retains the scope and zoom',!optic().hidden&&Math.abs(probe.camera.fov-55)<.1);
    check('reduced effects disables peripheral blur',optic().querySelector<HTMLElement>('.r01-scope-peripheral')!.hidden);
    mouse('mouseup',2);game.setReducedEffects(false);probe.hideViewmodel=true;await delay(300);mouse('mousedown',2);await delay(180);
    check('hidden viewmodel still transitions zoom',!probe.viewmodel.visible&&probe.camera.fov<90&&!optic().hidden);
    mouse('mouseup',2);probe.hideViewmodel=false;probe.lowSpec=true;await delay(300);mouse('mousedown',2);await delay(180);
    check('low spec transition skips blur',optic().querySelector<HTMLElement>('.r01-scope-peripheral')!.hidden);
    mouse('mouseup',2);probe.lowSpec=false;await delay(300);game.setFov(60);game.setZoomFov(85);
    mouse('mousedown',2);await delay(700);
    check('a wide saved zoom setting never zooms out',probe.camera.fov<60);
    mouse('mouseup',2);game.setFov(90);game.setZoomFov(55);await delay(700);
    game.setViewmodel({x:.3,y:-.2,z:-.3},false);mouse('mousedown',2);await delay(700);
    check('custom offsets cannot misalign the sight',Math.abs(probe.scopeProjection.x)<.01&&Math.abs(probe.scopeProjection.y)<.01);
    const position={...probe.player.pos};window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}));await delay(180);window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}));
    check('movement remains available while aiming',Math.hypot(probe.player.pos.x-position.x,probe.player.pos.z-position.z)>.01);
    game.setRailgunFinish('gun.admin');check('weapon replacement clears scope phase immediately',probe.scopeTransition.frame.progress===0);
    await delay(1000);check('special cosmetic reaches the same centered scope',!optic().hidden&&probe.scopeTransition.frame.progress===1&&Math.abs(probe.scopeProjection.x)<.01);
    probe.spectator=true;await delay(100);check('spectator entry clears the local scope',optic().hidden&&probe.scopeTransition.frame.progress===0);probe.spectator=false;
    await delay(700);probe.chatOpen=true;await delay(100);check('chat entry clears the local scope',optic().hidden&&probe.scopeTransition.frame.progress===0);probe.chatOpen=false;
    await delay(700);probe.handleLocalDeath('Scope fixture','scope-fixture');await delay(120);
    check('death clears the local scope',optic().hidden&&probe.scopeTransition.frame.progress===0);
    mouse('mouseup',2);if(probe.killcam)probe.killcam.remaining=0;await delay(200);
    check('respawn restores hip view with a clean scope phase',!probe.killcam&&optic().hidden&&probe.scopeTransition.frame.progress===0&&probe.viewmodel.visible);
    mouse('mousedown',2);await delay(700);check('scope can enter normally after respawn',probe.scopeTransition.frame.progress===1&&!optic().hidden);
    mouse('mouseup',2);game.setRailgunFinish('gun.stock');game.setViewmodel({x:0,y:0,z:0},false);await delay(700);
    mouse('mousedown',2);await delay(700);held=true;
    status.textContent=`${checks.length} integration checks passed`;
    // Optional loopback capture sink (scripts/railgun/capture-server.mjs).
    try{await fetch('http://127.0.0.1:5199/r01-scope-checks.json',{method:'POST',body:JSON.stringify(checks,null,2)});}catch{/* sink optional */}
  }catch(error){status.textContent=`FAILED: ${String(error)}`;}finally{button.disabled=false;}
};
window.addEventListener('pagehide',()=>game.dispose(),{once:true});
