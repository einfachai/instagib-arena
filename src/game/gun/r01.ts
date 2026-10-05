import * as THREE from 'three';
import { GunMaterial, STOCK_FINISH } from './gun-material';
import { r01Assets } from './r01-assets';
import type { CustomGunBuild, CustomGunInstance, CustomGunState } from './custom/types';
import type { RailgunFinish } from '../cosmetics';

export const R01_TRACKER_MOUNT = { position: [-0.061, -0.041, -0.246] as [number, number, number], scale: 0.8 };

class R01Material extends GunMaterial {
  private readonly referenceColors: THREE.Color[];
  constructor(finish: RailgunFinish, lod: 'high' | 'low') {
    super(STOCK_FINISH, { lod });
    this.referenceColors = this.gun.uPartCol.value.map((color) => color.clone());
    this.setFinish(finish);
    const a = r01Assets();
    this.map = a.detail;
    this.normalMap = lod === 'high' ? a.normal : null;
    this.normalScale.setScalar(0.85);
    this.roughnessMap = a.roughness;
    this.name = 'r01-surface';
  }
  override customProgramCacheKey(): string { return super.customProgramCacheKey() + '|r01-2'; }
  override onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
    super.onBeforeCompile(shader);
    shader.uniforms.uR01Reference = { value: this.referenceColors };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float _r01;\nvarying float vCopper;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCopper = _r01;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCopper;\nuniform vec3 uR01Reference[8];')
      // The atlas contains actual albedo. Apply finish colors as a ratio to the
      // stock palette so ceramic stays white and copper keeps its own material.
      .replace('vec4 diffuseColor = vec4(gunS.albedo', `
        if (vGun.x < 4.5) gunS.albedo /= max(uR01Reference[int(vGun.x + 0.5)], vec3(0.003));
        if (vCopper > 0.5) { gunS.albedo = vec3(1.0); gunS.metal = 0.9; gunS.rough = 0.31; }
        vec4 diffuseColor = vec4(gunS.albedo`)
      .replace('#include <map_fragment>', `
        if (vGun.x < 4.5) {
          vec2 r01Uv = vMapUv;
          // The opposite flank shares panel wear but its printed legend reads
          // normally from the player's side instead of becoming mirror text.
          if (vGunNrm.x < -0.5 && r01Uv.x > 750.0/1536.0 && r01Uv.x < 858.0/1536.0
              && r01Uv.y > 157.0/860.0 && r01Uv.y < 228.0/860.0) r01Uv.x = 1608.0/1536.0 - r01Uv.x;
          diffuseColor *= texture2D(map, r01Uv);
        }`)
      .replace('s.ao = gunAO(p, n, part);', 's.ao = 1.0;')
      .replace('float seam = GUN_PAT == 8 ? 0.0 : gunSeam(p, n, part);', 'float seam = 0.0;')
      .replace('normal = gunPerturb(-vViewPosition, normal, dH, faceDirection);', '')
      .replace('gunS.albedo * gunBounce(vGunPos, gunN)', 'diffuseColor.rgb * gunBounce(vGunPos, gunN) * 0.15')
      .replace('roughnessFactor = gunS.rough;', 'roughnessFactor *= gunS.rough / max(roughness, 0.01);');
  }
}

export type R01Instance = CustomGunInstance & { material: GunMaterial; sample(charge: number, reduced?: boolean): void };

// All movement is sampled from authoritative/predicted charge, including reverse
// replay seeks. No timer or accumulated delta can leave a sleeve stuck open.
export const buildR01: CustomGunBuild & ((opts: Parameters<CustomGunBuild>[0]) => R01Instance) = ({ lod, finish }) => {
  const source = r01Assets()[lod];
  const group = source.scene.clone(true);
  group.name = 'r01';
  const material = new R01Material(finish, lod);
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.material = material;
    o.castShadow = lod === 'low';
    o.frustumCulled = false;
    meshes.push(o);
  });
  const muzzle = group.children.find((o) => o.name.startsWith('r01_muzzle'));
  if (!muzzle) throw new Error('R-01 muzzle anchor is missing.');
  const sight = group.children.find((o) => o.name.startsWith('r01_sight'));
  if (!sight) throw new Error('R-01 sight anchor is missing.');
  const mixer = new THREE.AnimationMixer(group);
  const clip = source.animations.find((c) => c.name === 'shot_cycle')!;
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.clampWhenFinished = true;
  let lastCharge = -1;
  let lastReduced = false;
  const sample = (raw: number, reduced = false) => {
    const charge = Number.isFinite(raw) ? THREE.MathUtils.clamp(raw, 0, 1) : 1;
    if (charge === lastCharge && reduced === lastReduced) return;
    lastCharge = charge; lastReduced = reduced;
    // Explicitly re-enable after the last frame: LoopOnce otherwise remains paused.
    action.enabled = true; action.paused = false; action.time = charge * clip.duration;
    mixer.update(0);
    group.updateMatrixWorld(true);
    const fill = THREE.MathUtils.smoothstep(charge, 0.12, 0.92);
    const flash = reduced ? 0 : Math.max(0, 1 - charge / 0.07) * 3;
    const ready = reduced ? 0 : Math.sin(Math.PI * THREE.MathUtils.clamp((charge - 0.9) / 0.1, 0, 1)) * 0.35;
    const u = material.gun;
    u.uCore.value.copy(u.uAccent.value).multiplyScalar(0.05 + fill * 2.4 + flash + ready);
    u.uCap.value.copy(u.uAccent.value).multiplyScalar(0.04 + fill + flash);
    u.uWin.value.set(u.uAccent.value.r, u.uAccent.value.g, u.uAccent.value.b, charge);
    for (let i = 0; i < u.uCoil.value.length; i++) u.uCoil.value[i].copy(u.uAccent.value).multiplyScalar(fill * 2 + flash);
    u.uFlash.value.copy(u.uAccentHot.value).multiplyScalar(flash);
    material.emissiveIntensity = 0.3 + fill * 0.65 + flash + ready;
  };
  sample(1);
  return {
    group, muzzle, sight, material, trackerMount: R01_TRACKER_MOUNT, sample,
    setFinish(f: RailgunFinish) { material.setFinish(f); lastCharge = -1; },
    update(_dt: number, state: CustomGunState) {
      material.setHighDetail(lod === 'high' && !state.lowSpec);
      material.gun.uCalm.value = state.reduced ? 1 : 0;
      // Stable during paused replays; finish animation follows the charge phase.
      material.gun.uTime.value = state.reduced ? 0 : state.charge * 1.2;
      sample(state.charge, state.reduced);
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(group); material.dispose(); },
  };
};
