// Validate the exported asset directly; no production character selection changes.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { AnimationMixer, LoopOnce, Vector3, Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const { values } = parseArgs({ options: { variant: { type: 'string', default: 'codex' } } });
assert(['codex', 'claude'].includes(values.variant), 'Unknown character variant');
const id = values.variant + '-android';
const root = new URL('../../', import.meta.url);
const jsonFile = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
async function glb(path) {
  const bytes = await readFile(new URL(path, root));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { bytes, json, gltf };
}
const manifest = await jsonFile(`public/models/${id}/manifest.json`);
const canonical = await jsonFile('public/models/codex-ybot/manifest.json');
const model = await glb('public' + manifest.model);
const original = await glb('public/models/codex-ybot/original.glb');
assert.equal(sha(await readFile(new URL(manifest.source, root))), manifest.sourceSha256, 'Export source checksum is stale');
assert.deepEqual(manifest.clips, canonical.clips, 'The shared animation library was changed');
assert.equal(manifest.clips.length, 45);
assert(model.bytes.length < 3_000_000);
assert.equal(manifest.bytes, model.bytes.length);

function joints(json) {
  const parents = new Map();
  json.nodes.forEach((node, i) => node.children?.forEach((child) => parents.set(child, i)));
  return json.skins[0].joints.map((i) => {
    const node = json.nodes[i];
    return { name: node.name, parent: json.nodes[parents.get(i)]?.name, translation: node.translation,
      rotation: node.rotation, scale: node.scale };
  });
}
assert.deepEqual(joints(model.json), joints(original.json), 'Canonical rig names, hierarchy or rest transforms changed');
const inverseBinds = ({ json, bytes }) => {
  const accessor = json.accessors[json.skins[0].inverseBindMatrices];
  const view = json.bufferViews[accessor.bufferView];
  const start = 28 + bytes.readUInt32LE(12) + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return bytes.subarray(start, start + accessor.count * 16 * 4);
};
assert(inverseBinds(model).equals(inverseBinds(original)), 'Inverse bind matrices changed');
const scene = model.gltf.scene;
const meshes = [], bones = [];
scene.traverse((object) => {
  if (object.isSkinnedMesh) meshes.push(object);
  if (object.isBone) bones.push(object);
});
assert.equal(bones.length, 65);
assert(meshes.length > 0);
const boneNames = new Set(bones.map((bone) => bone.name));
let triangles = 0, vertices = 0;
for (const mesh of meshes) {
  const geometry = mesh.geometry;
  triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
  vertices += geometry.attributes.position.count;
  const weights = geometry.attributes.skinWeight, indices = geometry.attributes.skinIndex;
  for (let i = 0; i < weights.count; i++) {
    assert(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-5, 'Unnormalized skin weights');
    for (const channel of ['X', 'Y', 'Z', 'W']) assert(indices['get' + channel](i) < 65, 'Invalid bone index');
  }
}
assert.equal(triangles, manifest.triangles);
assert(triangles < 75_000);
if (values.variant === 'claude') {
  const materials = meshes.map((mesh) => mesh.material);
  const eyes = materials.find((material) => material.name === 'CL / Black eye inserts');
  assert(eyes && eyes.emissiveIntensity * Math.max(...eyes.emissive.toArray()) === 0, 'Eyes should not emit light');
  assert(Math.max(...eyes.color.toArray()) < .01, 'Eyes should be black');
  assert(!materials.some((material) => /blue|cobalt|lavender|periwinkle/i.test(material.name)), 'Cool accent material remains');
}
scene.updateMatrixWorld(true);
const restBounds = new Box3().setFromObject(scene);
const normalizationScale = 1.8 / (restBounds.max.y - restBounds.min.y);
assert(Number.isFinite(normalizationScale) && normalizationScale > 0);
const mixer = new AnimationMixer(scene);
const clipChecks = [];
const point = new Vector3();
for (const entry of manifest.clips) {
  const { gltf } = await glb('public' + entry.url);
  const clip = gltf.animations[0];
  assert(clip && Math.abs(clip.duration - entry.duration) < .02, entry.id + ': wrong duration');
  clip.tracks = clip.tracks.filter((track) => track.name.startsWith('mixamorig'));
  assert(clip.tracks.length > 0);
  for (const track of clip.tracks) {
    assert(boneNames.has(track.name.split('.')[0]), entry.id + ': unmatched animation target ' + track.name);
    assert(Array.from(track.values).every(Number.isFinite), entry.id + ': non-finite animation data');
  }
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.reset().play();
  const samples = [];
  for (const fraction of [0, .25, .5, .75, 1]) {
    mixer.setTime(clip.duration * fraction);
    scene.updateMatrixWorld(true);
    const bounds = new Box3();
    for (const mesh of meshes) {
      mesh.skeleton.update();
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
        assert(point.toArray().every(Number.isFinite), entry.id + ': non-finite skinned vertex');
        bounds.expandByPoint(point);
      }
    }
    const size = bounds.getSize(new Vector3()).multiplyScalar(normalizationScale);
    assert(size.x < 5 && size.y < 5 && size.z < 5, entry.id + ': explosive deformation');
    samples.push({ fraction, normalizedSize: size.toArray() });
  }
  clipChecks.push({ id: entry.id, tracks: clip.tracks.length, samples });
  mixer.stopAllAction();
  mixer.uncacheClip(clip);
}
const report = { passed: true, variant: id, sourceSha256: manifest.sourceSha256, modelSha256: sha(model.bytes),
  bones: bones.length, triangles, vertices, bytes: model.bytes.length, normalizedHeight: 1.8,
  inverseBindsIdentical: true, rigMatchesCanonical: true, sharedClips: clipChecks.length,
  sampledPoses: clipChecks.length * 5, clips: clipChecks };
await writeFile(new URL(`art/${id}/reports/glb-validation.json`, root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, clips: undefined }));
