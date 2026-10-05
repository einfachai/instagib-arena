import * as THREE from 'three';
import { preloadCharacterAssets, characterAssets } from '../../../src/game/character/assets';
import type { MovementCue } from '../../../src/game/movement-cues';
import { Character, skinColorFor } from '../../../src/game/character/character';
import { CharacterAnimator } from '../../../src/game/character-anim';
import { KILL_EFFECTS, EMOTES } from '../../../src/game/cosmetics';
import { DYES } from '../../../src/game/dyes';
import { setCharacterFxQuality } from '../../../src/game/character/gibs';
import { getFxContext, disposeFxContext, setFxQuality } from '../../../src/game/fx-pool';
import { attachRailgun } from '../../../src/game/character/gun';
import { Character as BaselineCharacter } from '../reports/baseline/src/game/character/character';
import { CharacterAnimator as BaselineAnimator } from '../reports/baseline/src/game/character-anim';
import { setCharacterFxQuality as baselineQuality } from '../reports/baseline/src/game/character/gibs';

const canvas = document.querySelector('canvas')!;
const status = document.querySelector('#status')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.toneMapping = THREE.ACESFilmicToneMapping;
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 100);
camera.position.set(0, 3.6, -8.5); camera.lookAt(0, 0.9, 0.7);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101521');
scene.add(new THREE.HemisphereLight(0xe2eaff, 0x5b5d68, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(-4, 8, -4); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#252d43', roughness: 0.8 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; scene.add(floor);
let cast: { ch: Character | BaselineCharacter; anim: CharacterAnimator | BaselineAnimator; anchor: THREE.Group; gun?: ReturnType<typeof attachRailgun>; mixer?: THREE.AnimationMixer }[] = [];
let clock = 0, busy = false, movementSequence = false, sequenceIndex = -1;
const report: { checks?: unknown; performance?: unknown; measuredAt?: string; userAgent: string; viewport: number[] } = { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight, devicePixelRatio] };
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function clearCast() { for (const { ch, anim, gun, anchor, mixer } of cast) { gun?.dispose(); mixer?.stopAllAction(); anim.dispose(); ch.dispose(); anchor.removeFromParent(); } cast = []; disposeFxContext(scene); }
function createCast(baseline = false, n = 8) {
  clearCast(); getFxContext(scene);
  for (let i = 0; i < n; i++) {
    const ch = baseline ? new BaselineCharacter({ castShadow: false, colorHex: '#f6f7fc' }) : new Character({ castShadow: false });
    const anim = baseline ? new BaselineAnimator(ch as BaselineCharacter) : new CharacterAnimator(ch as Character);
    const anchor = new THREE.Group(); anchor.position.set((i % 4 - 1.5) * 1.6, 0, Math.floor(i / 4) * 2.4); anchor.add(ch.root); scene.add(anchor);
    cast.push({ ch, anim, anchor });
  }
  clock = 0; sequenceIndex = -1;
}
const pos = new THREE.Vector3();
function step(dt: number) {
  clock += dt;
  const phase = Math.floor(clock / 1.1), newPhase = phase !== sequenceIndex;
  const cues: MovementCue[] = [{ kind: 'jump' }, { kind: 'double-jump' }, { kind: 'wall-jump', direction: { x: 1, z: 0 } }, { kind: 'wall-jump', direction: { x: -1, z: 0 } }, { kind: 'boost' }, { kind: 'dash', direction: { x: 0, z: -1 } }, { kind: 'dash', direction: { x: 0, z: 1 } }, { kind: 'dash', direction: { x: -1, z: 0 } }, { kind: 'dash', direction: { x: 1, z: 0 } }, { kind: 'landing', impact: 5 }, { kind: 'landing', impact: 18 }];
  cast.forEach(({ anim, mixer, ch, anchor }, i) => {
    if (mixer) { mixer.update(dt); ch.root.updateMatrixWorld(true); return; }
    pos.set(i * 0.1, 0, -clock * 7);
    if (!movementSequence || busy || !(anim instanceof CharacterAnimator)) { anim.update({ dt, yaw: (i % 4 - 1.5) * 0.22, pitch: 0, pos }); return; }
    const angle = (i + phase) % 8 * Math.PI / 4, speed = phase % 3 === 0 ? 3 : phase % 3 === 1 ? 8 : 16;
    const cue = cues[phase % cues.length], airborne = phase % cues.length < 5;
    const elapsed = clock % 1.1;
    anchor.position.y = airborne ? Math.sin(elapsed / 1.1 * Math.PI) * 1.1 : 0;
    if (newPhase) anim.notifyFire();
    anim.update({ dt, yaw: 0, pitch: Math.sin(clock + i) * 0.4, pos, velocity: { x: Math.sin(angle) * speed, y: airborne ? Math.cos(elapsed / 1.1 * Math.PI) * 3 : 0, z: -Math.cos(angle) * speed }, grounded: !airborne, cues: newPhase ? [cue] : [] });
  });
  sequenceIndex = phase;
  getFxContext(scene).step(dt); renderer.render(scene, camera);
}
function frame() { if (!busy) step(1 / 60); requestAnimationFrame(frame); }
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const percentile = (data: number[], q: number) => [...data].sort((a, b) => a - b)[Math.floor((data.length - 1) * q)];
async function benchmark() {
  if (busy) return; busy = true; movementSequence = false;
  const results = [];
  try {
    for (const quality of ['full', 'reduced', 'low']) for (const baseline of [true, false]) for (const death of [false, true]) {
      const settings = { reducedEffects: quality === 'reduced', lowSpec: quality === 'low' };
      setCharacterFxQuality(settings); baselineQuality(settings); setFxQuality(quality === 'low' ? 0 : 2);
      createCast(baseline);
      for (let i = 0; i < 35; i++) { await nextFrame(); step(1 / 60); }
      if (death) cast.forEach(({ anim }, i) => anim.die({ y: 0 }, KILL_EFFECTS[(i * 2) % KILL_EFFECTS.length].id));
      const cpu: number[] = [], frameTimes: number[] = [];
      let previous = await nextFrame(), calls = 0, triangles = 0;
      const count = death ? 60 : 120;
      for (let i = 0; i < count; i++) {
        const stamp = await nextFrame(), start = performance.now(); step(1 / 60);
        cpu.push(performance.now() - start); frameTimes.push(stamp - previous); previous = stamp;
        calls = Math.max(calls, renderer.info.render.calls); triangles = Math.max(triangles, renderer.info.render.triangles);
      }
      const result = { model: baseline ? 'original procedural character' : 'Codex Y Bot', quality, state: death ? 'eight simultaneous deaths' : 'eight moving characters', frames: count, cpuP50Ms: percentile(cpu, 0.5), cpuP95Ms: percentile(cpu, 0.95), frameP50Ms: percentile(frameTimes, 0.5), frameP95Ms: percentile(frameTimes, 0.95), peakDrawCalls: calls, peakTriangles: triangles };
      results.push(result); status.textContent = JSON.stringify(result, null, 2);
    }
    report.performance = results; report.measuredAt = new Date().toISOString();
    status.textContent = 'Benchmark complete. Download report for all 12 comparisons.';
  } catch (error) { status.textContent = String(error); throw error; }
  finally { setCharacterFxQuality({ reducedEffects: false, lowSpec: false }); baselineQuality({ reducedEffects: false, lowSpec: false }); setFxQuality(2); createCast(); busy = false; }
}
async function checks() {
  if (busy) return; busy = true; movementSequence = false; const checked = [];
  try {
    for (const quality of ['full', 'reduced', 'low']) {
      setCharacterFxQuality({ reducedEffects: quality === 'reduced', lowSpec: quality === 'low' }); createCast();
      for (const finisher of KILL_EFFECTS) {
        cast.forEach(({ anim }) => { anim.respawn(); anim.updateStatic(0.5); anim.die({ y: 0 }, finisher.id); });
        for (let i = 0; i < 8; i++) { await nextFrame(); step(0.1); }
        for (const { ch, anim } of cast) { check(ch.rig.bones.every((b) => b.matrix.elements.every(Number.isFinite)), finisher.id); anim.respawn(); }
        checked.push({ quality, finisher: finisher.id, characters: 8, passed: true }); status.textContent = `Checked ${quality} · ${finisher.id}`;
      }
    }
    report.checks = checked; status.textContent = `Passed: all ${KILL_EFFECTS.length} finishers on eight characters at each quality setting.`;
  } finally { setCharacterFxQuality({ reducedEffects: false, lowSpec: false }); createCast(); busy = false; }
}
await preloadCharacterAssets(); createCast(); requestAnimationFrame(frame);
for (const button of document.querySelectorAll('button')) button.disabled = false;
status.textContent = 'Ready. Model, clips and independent skeletons loaded.';
document.querySelector('#checks')!.addEventListener('click', () => void checks());
document.querySelector('#benchmark')!.addEventListener('click', () => void benchmark());
document.querySelector('#victory')!.addEventListener('click', () => { if (busy) return; movementSequence = false; createCast(); cast.forEach(({ anim }, i) => anim.playEmote(EMOTES[i % EMOTES.length].kind, true)); });
document.querySelector('#combat')!.addEventListener('click', () => { if (busy) return; movementSequence = false; createCast(); cast.forEach((entry) => { entry.gun = attachRailgun(entry.ch as Character); }); });
document.querySelector('#movement')!.addEventListener('click', () => { if (busy) return; movementSequence = true; createCast(); cast.forEach((entry) => { entry.gun = attachRailgun(entry.ch as Character); }); status.textContent = 'Cycling eight directions, reversals, jumping, double/wall/boost launches, four dashes, light/heavy landing, aim and recoil.'; });
const clipSelect = document.querySelector<HTMLSelectElement>('#clip')!;
for (const entry of characterAssets().manifest.clips) { const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.id; clipSelect.append(option); }
clipSelect.addEventListener('change', () => {
  if (busy || !clipSelect.value) return; movementSequence = false; createCast();
  const clip = characterAssets().clips.get(clipSelect.value)!;
  cast.forEach((entry, i) => { const ch = entry.ch as Character; entry.mixer = new THREE.AnimationMixer(ch.model); const action = entry.mixer.clipAction(clip).play(); action.time = i / 8 * clip.duration; });
  status.textContent = `Playing ${clip.name} on eight independent skeletons at different phases.`;
});
document.querySelector('#look')!.addEventListener('change', (event) => {
  const mode = (event.target as HTMLSelectElement).value;
  cast.forEach(({ ch }, i) => { if (mode === 'dye') ch.wearDye(DYES[(i + 1) % DYES.length], skinColorFor('preview')); else ch.setLook(mode === 'team' ? (i % 2 ? '#f87191' : '#7d9bff') : mode === 'highlight' ? '#b0ff67' : '#f6f7fc', mode === 'highlight' ? 'highlight' : 'natural'); });
});
document.querySelector('#download')!.addEventListener('click', () => { const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); a.href = url; a.download = 'codex-ybot-browser-validation.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
