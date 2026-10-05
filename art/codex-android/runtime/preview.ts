import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { preloadCharacterAssets, characterAssets, CODEX_PALETTE } from '../../../src/game/character/assets';
import { Character } from '../../../src/game/character/character';
import { CharacterAnimator } from '../../../src/game/character-anim';
import { buildRailgun } from '../../../src/game/weapon-model';
import { equipViewmodelArms, updateViewmodelArms } from '../../../src/game/viewmodel-arms';
import { ViewmodelMotion } from '../../../src/game/viewmodel-motion';
import { VIEWMODEL_BASE, VIEWMODEL_SCALE } from '../../../src/game/constants';
import type { RemotePlayerSnapshot } from '../../../src/game/net';
import { RemotePlayer } from '../../../src/game/remote-player';
import { loadBotModel } from '../../../src/game/bots';
import { attachRailgun } from '../../../src/game/character/gun';

const canvas = document.querySelector('canvas')!;
const status = document.querySelector('#status')!;
const pose = document.querySelector<HTMLSelectElement>('#pose')!;
const view = document.querySelector<HTMLSelectElement>('#view')!;
const pitch = document.querySelector<HTMLSelectElement>('#pitch')!;
const look = document.querySelector<HTMLSelectElement>('#look')!;
const params = new URLSearchParams(location.search);
for (const control of [pose, view, pitch, look]) {
  const value = params.get(control.id);
  if (value && Array.from(control.options).some(option => option.value === value)) control.value = value;
}
await preloadCharacterAssets();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#111820');
const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(room).texture; room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xdcecff, 0x303541, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 5, -4); scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#1d2734', roughness: 0.7 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.015; scene.add(floor);
const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
const controls = new OrbitControls(camera, canvas); controls.target.set(0, 0.93, 0);
type Actor = { ch: Character; anim: CharacterAnimator; gun: ReturnType<typeof attachRailgun>; mixer?: THREE.AnimationMixer };
let actors: Actor[] = [], paused = false, shot = 2, last = performance.now(), frames = 0, frameSum = 0;
const fp = buildRailgun(); equipViewmodelArms(fp); camera.add(fp.group); scene.add(camera); fp.group.scale.setScalar(VIEWMODEL_SCALE);
const motion = new ViewmodelMotion();
const inspectFrame = document.querySelector<HTMLSelectElement>('#inspect-frame')!;
const motionFrame = (dt: number) => ({dt, yaw: 0, pitch: 0, groundSpeed: 0, lateralSpeed: 0, grounded: true, zoom: 0, reducedEffects: false});
function firstPerson() { if (view.value !== 'first-person') { view.value = 'first-person'; setup(); } }
function setPaused(value: boolean) { paused = value; document.querySelector('#pause')!.textContent = paused ? 'Play' : 'Pause'; }
document.querySelector<HTMLButtonElement>('#inspect')!.onclick = () => { firstPerson(); motion.startInspect(false); setPaused(false); };
inspectFrame.onchange = () => {
  firstPerson(); motion.reset();
  const time = Number(inspectFrame.value);
  if (time > 0) { motion.startInspect(false); for (let t = 0; t < time - 1e-6; t += 1 / 120) motion.update(motionFrame(Math.min(1 / 120, time - t))); }
  setPaused(true);
};
const victim = new RemotePlayer('death-review', 'Network death', scene, await loadBotModel());
victim.setPlateSuppressed(true); victim.group.visible = false;
const respawnSnapshot: RemotePlayerSnapshot = {id:'death-review',name:'Network death',pos:{x:8,y:0,z:6},yaw:0,pitch:0,frags:0,deaths:1,invulnMs:1000,team:null,hat:'hat.none',unusual:'unusual.none',emote:'emote.wave',nameColor:'name.default',spawnEffect:'spawn.default',title:'title.none',railColor:'rail.default',railgunFinish:'railgun.default',crosshair:'',ping:0,admin:false,verified:false,receivedAt:0};
let dying = false;
function setup() {
  dying = false; victim.group.visible = false;
  fp.group.visible = view.value === 'first-person';
  camera.fov = view.value === 'first-person' ? 90 : 36; camera.updateProjectionMatrix();
  for (const { ch, anim, gun, mixer } of actors) { mixer?.stopAllAction(); gun.dispose(); anim.dispose(); ch.dispose(); }
  actors = [];
  const n = view.value === 'first-person' ? 0 : view.value === 'eight' ? 8 : 1;
  for (let i = 0; i < n; i++) {
    const ch = new Character({ castShadow: false }), anim = new CharacterAnimator(ch, { holdGun: pose.value === 'combat' });
    scene.add(ch.root); ch.root.position.set(n === 1 ? 0 : (i % 4 - 1.5) * 1.1, 0, Math.floor(i / 4) * 1.5);
    const gun = attachRailgun(ch); gun.visible = pose.value === 'combat';
    let mixer: THREE.AnimationMixer | undefined;
    if (pose.value !== 'combat') {
      mixer = new THREE.AnimationMixer(ch.model);
      const action = mixer.clipAction(characterAssets().clips.get(pose.value === 'relaxed' ? 'idle.relaxed' : pose.value)!).play();
      action.time = 0.12;
    }
    ch.setLook(look.value === 'highlight' ? '#b0ff67' : look.value === 'teams' ? (i % 2 ? '#f87191' : '#7d9bff') : CODEX_PALETTE.white, look.value === 'highlight' ? 'highlight' : 'natural');
    actors.push({ ch, anim, gun, mixer });
  }
  const positions: Record<string, [number, number, number]> = { 'first-person': [0, 1.6, 0], quarter: [2.6, 1.8, -3.9], front: [0, 1.1, -4.2], side: [4.2, 1.1, 0], back: [0, 1.1, 4.2], 'torso-side': [1.15, 1.08, -0.25], eight: [3.8, 3.2, -8], 'grip-right': [1.15, 1.5, -0.48], 'grip-left': [-1.1, 1.45, -0.5] };
  camera.position.set(...positions[view.value]); if (view.value.startsWith('grip')) controls.target.set(0.05, 1.3, -0.25);
  else if (view.value === 'torso-side') controls.target.set(0, 1.02, 0);
  else controls.target.set(0, 0.93, n === 1 ? 0 : 0.6); controls.update();
  if (view.value === 'first-person') { camera.rotation.set(0, 0, 0); controls.enabled = false; } else controls.enabled = true;
  resize();
}
pose.onchange = view.onchange = look.onchange = setup;
document.querySelector<HTMLButtonElement>('#fire')!.onclick = () => { shot = 0; motion.onFire(); fp.notifyFire(); actors.forEach(a => { a.gun.notifyFire(); a.anim.notifyFire(); }); };
document.querySelector<HTMLButtonElement>('#death')!.onclick = () => {
  if (view.value === 'first-person' || view.value === 'eight') { view.value = 'quarter'; setup(); }
  actors.forEach(a => a.ch.root.visible = false);
  victim.resetAnimationTimeline(); victim.apply(respawnSnapshot, 0); victim.markDead('pulse', {x:0,y:0,z:0}); dying = true;
  for(let i=0;i<10;i++) victim.advanceDeathWithoutSnapshot(1/60);
  paused = true; document.querySelector('#pause')!.textContent = 'Play';
};
document.querySelector<HTMLButtonElement>('#pause')!.onclick = e => { paused = !paused; (e.currentTarget as HTMLButtonElement).textContent = paused ? 'Play' : 'Pause'; };
document.querySelector<HTMLButtonElement>('#capture')!.onclick = () => canvas.toBlob(blob => {
  if (!blob) return;
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = `android-runtime-${pose.value}-${view.value}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
// Authoring-only sink shared with the railgun review; never used by gameplay.
document.querySelector<HTMLButtonElement>('#save-review')!.onclick = () => canvas.toBlob(async blob => {
  if (!blob) return;
  const name = `r01-support-${view.value}-${Number(pitch.value) < 0 ? 'down' : Number(pitch.value) > 0 ? 'up' : 'level'}-${inspectFrame.value.replace('.', '-')}.png`;
  try {
    const response = await fetch(`http://127.0.0.1:5199/${name}`, { method: 'POST', body: blob });
    if (!response.ok) throw new Error(String(response.status));
    status.textContent = `Saved ${name}`;
  } catch { status.textContent = 'Start scripts/railgun/capture-server.mjs to save review images.'; }
});
function resize() { canvas.style.height = view.value === 'first-person' ? `${Math.round(canvas.clientWidth * 9 / 16)}px` : 'calc(100vh - 134px)'; renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); setup(); resize();
function frame(now: number) {
  const elapsed = (now - last) / 1000, dt = paused ? 0 : Math.min(0.05, elapsed); last = now; shot += dt;
  for (const a of actors) {
    if (a.mixer) a.mixer.update(dt);
    else a.anim.update({ dt, yaw: 0, pitch: Number(pitch.value), pos: a.ch.root.position, grounded: true, velocity: { x: 0, y: 0, z: 0 } });
    a.gun.setCharge(Math.min(1, shot / 1.2));
  }
  if (dying) victim.advanceDeathWithoutSnapshot(dt);
  if (fp.group.visible) {
    const p = motion.update(motionFrame(dt));
    fp.group.position.set(VIEWMODEL_BASE.x + p.x, VIEWMODEL_BASE.y + p.y, VIEWMODEL_BASE.z + p.z); fp.group.rotation.set(p.rx, p.ry, p.rz); updateViewmodelArms(fp.group); fp.setCharge(Math.min(1, shot / 1.2));
  }
  renderer.render(scene, camera); frames++; frameSum += elapsed;
  if (frames % 60 === 0) { status.textContent = `${actors.length} character${actors.length > 1 ? 's' : ''} · ${renderer.info.render.calls} draws including guns/floor · ${renderer.info.render.triangles.toLocaleString()} triangles · ${Math.round(60 / frameSum)} fps · 65 bones / 45 motions`; frameSum = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
