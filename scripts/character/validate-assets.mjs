import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = new URL('../../', import.meta.url);
async function glb(file) {
  const b = await readFile(new URL(file, root));
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)));
  const binary = b.subarray(28 + b.readUInt32LE(12));
  const accessor = (index) => {
    const a = json.accessors[index], v = json.bufferViews[a.bufferView];
    const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
    const offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    assert(!v.byteStride, 'Unexpected interleaved export');
    return binary.subarray(offset, offset + a.count * sizes[a.type] * bytes[a.componentType]);
  };
  return { json, accessor, gltf: await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '') };
}

const original = await glb('public/models/codex-ybot/original.glb');
const model = await glb('public/models/codex-ybot/model.glb');
const signature = ({ json }) => {
  const parents = new Map();
  json.nodes.forEach((n, i) => n.children?.forEach((c) => parents.set(c, i)));
  return json.skins[0].joints.map((i) => {
    const n = json.nodes[i];
    return { name: n.name, parent: json.nodes[parents.get(i)]?.name, translation: n.translation, rotation: n.rotation, scale: n.scale };
  });
};
assert.deepEqual(signature(model), signature(original), 'Canonical joint names/hierarchy/rest transforms changed');
assert.deepEqual(model.accessor(model.json.skins[0].inverseBindMatrices), original.accessor(original.json.skins[0].inverseBindMatrices), 'Inverse bind matrices changed');
const weightChecks = [];
for (const name of ['Alpha_Joints', 'Alpha_Surface']) {
  const old = original.json.meshes.find((m) => m.name === name);
  const next = model.json.meshes.find((m) => m.name === name);
  assert.equal(next.primitives.length, old.primitives.length);
  old.primitives.forEach((p, i) => {
    for (const attribute of ['JOINTS_0', 'WEIGHTS_0', '_SOURCE_VERTEX_ID']) assert(model.accessor(next.primitives[i].attributes[attribute]).equals(original.accessor(p.attributes[attribute])), name + ' ' + attribute + ' changed');
    assert.equal(model.json.accessors[next.primitives[i].attributes.POSITION].count, original.json.accessors[p.attributes.POSITION].count);
    const source = (asset, primitive) => {
      const ids = asset.accessor(primitive.attributes._SOURCE_VERTEX_ID);
      const indices = asset.accessor(primitive.indices);
      const size = asset.json.accessors[primitive.indices].componentType === 5123 ? 2 : 4;
      return Array.from({ length: indices.length / size }, (_, i) => ids.readUInt32LE((size === 2 ? indices.readUInt16LE(i * size) : indices.readUInt32LE(i * size)) * 4));
    };
    // Normal/UV duplicate vertices can be interchanged by the exporter. Their
    // original source identities and triangle order must remain identical.
    assert.deepEqual(source(model, next.primitives[i]), source(original, p), 'Original source topology/order changed');
  });
  weightChecks.push({ mesh: name, vertices: model.json.accessors[next.primitives[0].attributes.POSITION].count, skinWeightsIdentical: true, jointIndicesIdentical: true, topologyIdentical: true });
}
const manifest = JSON.parse(await readFile(new URL('public/models/codex-ybot/manifest.json', root), 'utf8'));
const clipChecks = [];
for (const entry of manifest.clips) {
  const { gltf } = await glb('public' + entry.url);
  const clip = gltf.animations[0];
  assert(clip && Math.abs(clip.duration - entry.duration) < 0.02, entry.id + ' duration mismatch');
  let maxSamplingStep = 0;
  for (const track of clip.tracks) {
    assert(Array.from(track.values).every(Number.isFinite), entry.id + ' non-finite track');
    if (!track.name.startsWith('mixamorig')) continue;
    if (track.times.length > 2) for (let i = 1; i < track.times.length; i++) maxSamplingStep = Math.max(maxSamplingStep, track.times[i] - track.times[i - 1]);
    if (track.name.endsWith('.quaternion')) for (let i = 0; i < track.values.length; i += 4) assert(Math.abs(Math.hypot(...track.values.slice(i, i + 4)) - 1) < 0.001, entry.id + ' invalid quaternion');
  }
  assert(maxSamplingStep <= 1 / 60 + 0.00001, entry.id + ' not sampled at 60 FPS');
  const hip = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
  assert(hip, entry.id + ' missing root');
  // Canonical FBX local Z is vertical; the armature converts it to world Y.
  for (let i = 0; i < hip.values.length; i += 3) for (const axis of [0, 1]) assert(Math.abs(hip.values[i + axis] - hip.values[axis]) < 0.001, entry.id + ' root drift');
  clipChecks.push({ id: entry.id, duration: clip.duration, tracks: clip.tracks.length, maxSamplingStep, stationaryRoot: true });
}
const report = { passed: true, joints: signature(model).length, inverseBindMatricesIdentical: true, originalSurfaces: weightChecks, clips: clipChecks };
await writeFile(new URL('art/ybot/reports/glb-validation.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, joints: report.joints, clips: report.clips.length, inverseBinds: 'identical', originalWeights: 'identical' }));
