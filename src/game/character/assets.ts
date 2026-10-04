import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { preloadR01Assets } from '../gun/r01-assets';
import { B, BONE_COUNT, REST_ABS } from './rig';
import { installBreakupGeometry, type BodyGeometry } from './body';

export const CODEX_PALETTE = { white: '#e7ebf0', blue: '#96d9ff', lavender: '#a0a4d6', graphite: '#252d38' } as const;
export type ClipEntry = { id: string; url: string; duration: number; loop: boolean; movement: boolean };
export type CharacterAssets = { scene: THREE.Group; clips: ReadonlyMap<string, THREE.AnimationClip>; manifest: { version: number; model: string; clips: ClipEntry[] }; normalization: THREE.Matrix4; rest: ReadonlyMap<string, THREE.Matrix4> };
let assets: CharacterAssets | null = null;
let pending: Promise<CharacterAssets> | null = null;

// One download/cache for all game, preview, replay, lab and menu consumers.
// A rejected load is retryable; no half-created character escapes the preload.
export function preloadCharacterAssets(): Promise<CharacterAssets> {
  if (assets) return preloadR01Assets().then(() => assets!);
  if (pending) return pending;
  pending = Promise.all([loadAssets(), preloadR01Assets()]).then(([loaded]) => loaded).catch((error: unknown) => { pending = null; throw error; });
  return pending;
}
export function characterAssets(): CharacterAssets {
  if (!assets) throw new Error('Preload the Codex Android assets before creating characters.');
  return assets;
}
export function cloneCharacterModel(): THREE.Group { return clone(characterAssets().scene) as THREE.Group; }

const logicalBones = [
  'Hips', 'Hips', 'Spine', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'Head',
] as const;
export function canonicalBoneName(index: number): string { return 'mixamorig' + logicalBones[index]; }
function logicalIndex(name: string): number {
  const plain = name.replace(/^mixamorig:?/, '');
  const exact = logicalBones.indexOf(plain as typeof logicalBones[number]);
  if (exact >= 0) return exact === 0 ? B.hips : exact;
  if (plain === 'Spine1') return B.chest;
  if (plain.startsWith('LeftHand')) return B.handL;
  if (plain.startsWith('RightHand')) return B.handR;
  if (plain.startsWith('LeftToe')) return B.footL;
  if (plain.startsWith('RightToe')) return B.footR;
  return B.head;
}

async function loadAssets(): Promise<CharacterAssets> {
  const loader = new GLTFLoader();
  const response = await fetch('/models/codex-android/manifest.json');
  if (!response.ok) throw new Error('Could not load the character animation manifest.');
  const manifest = await response.json() as CharacterAssets['manifest'];
  const [model, clipFiles] = await Promise.all([
    loader.loadAsync(manifest.model),
    Promise.all(manifest.clips.map(async (entry) => ({ entry, gltf: await loader.loadAsync(entry.url) }))),
  ]);
  const scene = model.scene;
  scene.updateMatrixWorld(true);
  const rest = new Map<string, THREE.Matrix4>();
  scene.traverse((o) => { if ((o as THREE.Bone).isBone) rest.set(o.name, o.matrixWorld.clone()); });
  const bounds = new THREE.Box3().setFromObject(scene);
  const scale = 1.8 / (bounds.max.y - bounds.min.y);
  const normalization = new THREE.Matrix4().makeRotationY(Math.PI).scale(new THREE.Vector3(scale, scale, scale));
  normalization.setPosition(0, -bounds.min.y * scale, 0);
  // Material boundaries become per-vertex PBR channels. Keep windows in one
  // separate material group: two draws per body, with one canonical skin.
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  if (!meshes.length) throw new Error('Codex Android has no skinned surfaces.');
  const isWindow = (mesh: THREE.SkinnedMesh) => (mesh.material as THREE.MeshPhysicalMaterial).transmission > 0;
  meshes.sort((a, b) => Number(isWindow(a)) - Number(isWindow(b)));
  let opaqueIndices = 0, windowIndices = 0;
  const geometryParts = meshes.map((mesh) => {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const g = mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3), surface = new Float32Array(n * 4);
    const tint = material.name.includes('Pearl ceramic') ? 1 : 0;
    const emission = material.emissiveIntensity * Math.max(material.emissive.r, material.emissive.g, material.emissive.b);
    const emit = emission > 0 ? (material.name.includes('phosphor') ? 1 : 0.55) : 0;
    for (let i = 0; i < n; i++) {
      material.color.toArray(colors, i * 3);
      surface.set([tint, material.roughness, material.metalness, emit], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(surface, 4));
    g.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    // Patterns use normalized metres, independent of the source rig frame.
    const restPosition = g.getAttribute('position').clone();
    restPosition.applyMatrix4(normalization);
    g.setAttribute('aRest', restPosition);
    const count = g.index?.count ?? n;
    if (isWindow(mesh)) windowIndices += count;
    else opaqueIndices += count;
    // glTF skin vertices are already in the bind frame. Its attached mesh's
    // world transform is canceled by bindMatrixInverse during skinning; baking
    // that transform here would apply the FBX centimetre scale a second time.
    return g;
  });
  const merged = mergeGeometries(geometryParts, false);
  if (!merged) throw new Error('Incompatible canonical character surfaces.');
  merged.clearGroups();
  merged.addGroup(0, opaqueIndices, 0);
  if (windowIndices) merged.addGroup(opaqueIndices, windowIndices, 1);
  for (const g of geometryParts) g.dispose();
  const template = meshes[0];
  const body = new THREE.SkinnedMesh(merged, new THREE.MeshStandardMaterial());
  body.name = 'codex-android-body'; body.bindMode = template.bindMode;
  scene.add(body); body.bind(template.skeleton, template.bindMatrix.clone());
  for (const mesh of meshes) {
    mesh.removeFromParent(); mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
  }
  body.userData.shared = true;
  merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const { entry, gltf } of clipFiles) {
    const clip = gltf.animations[0];
    if (!clip) throw new Error('No baked motion in ' + entry.id);
    clip.name = entry.id;
    // Object transforms remain canonical, and the game owns world position.
    clip.tracks = clip.tracks.filter((t) => t.name.startsWith('mixamorig'));
    clips.set(entry.id, clip);
  }
  const tpose = new THREE.AnimationClip('rig.tpose', 3, []);
  scene.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    tpose.tracks.push(new THREE.QuaternionKeyframeTrack(o.name + '.quaternion', [0, 3], [...o.quaternion.toArray(), ...o.quaternion.toArray()]));
    tpose.tracks.push(new THREE.VectorKeyframeTrack(o.name + '.position', [0, 3], [...o.position.toArray(), ...o.position.toArray()]));
  });
  clips.set(tpose.name, tpose);
  installBreakupGeometry(buildBreakupGeometry(body, normalization));
  assets = { scene, clips, manifest, normalization, rest };
  return assets;
}

// Authored breakup ownership is the nearest existing limb segment. At death
// these rigid pieces are placed from the current canonical pose; the live
// skeleton and its inverse binds are never modified by the finisher simulation.
function buildBreakupGeometry(mesh: THREE.SkinnedMesh, normalization: THREE.Matrix4): BodyGeometry {
  const flat = mesh.geometry.toNonIndexed();
  const position = flat.getAttribute('position') as THREE.BufferAttribute;
  const normals = flat.getAttribute('normal') as THREE.BufferAttribute;
  const indices = flat.getAttribute('skinIndex') as THREE.BufferAttribute;
  const weights = flat.getAttribute('skinWeight') as THREE.BufferAttribute;
  const owner = new Uint16Array(position.count * 4), rigidWeights = new Float32Array(position.count * 4);
  const com = new Float32Array(BONE_COUNT * 3), count = new Uint32Array(BONE_COUNT), radius = new Float32Array(BONE_COUNT);
  const v = new THREE.Vector3(), norm = new THREE.Matrix3().getNormalMatrix(normalization);
  for (let t = 0; t < position.count; t += 3) {
    const votes = new Float32Array(BONE_COUNT);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) votes[logicalIndex(mesh.skeleton.bones[indices.getComponent(t + k, j)].name)] += weights.getComponent(t + k, j);
    let bone = 1;
    for (let b = 2; b < BONE_COUNT; b++) if (votes[b] > votes[bone]) bone = b;
    for (let k = 0; k < 3; k++) {
      const i = t + k;
      v.fromBufferAttribute(position, i).applyMatrix4(normalization); position.setXYZ(i, v.x, v.y, v.z);
      com[bone * 3] += v.x; com[bone * 3 + 1] += v.y; com[bone * 3 + 2] += v.z; count[bone]++;
      v.fromBufferAttribute(normals, i).applyMatrix3(norm).normalize(); normals.setXYZ(i, v.x, v.y, v.z);
      owner[i * 4] = bone; rigidWeights[i * 4] = 1;
    }
  }
  for (let b = 0; b < BONE_COUNT; b++) for (let k = 0; k < 3; k++) com[b * 3 + k] = count[b] ? com[b * 3 + k] / count[b] : REST_ABS[b][k];
  for (let i = 0; i < position.count; i++) {
    const b = owner[i * 4]; v.fromBufferAttribute(position, i).sub(new THREE.Vector3().fromArray(com, b * 3)); radius[b] = Math.max(radius[b], v.length());
  }
  flat.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(owner, 4));
  flat.setAttribute('skinWeight', new THREE.Float32BufferAttribute(rigidWeights, 4));
  return { geometry: flat, com, radius, hasGeo: Array.from(count, (n) => n > 0), triangles: position.count / 3 };
}
