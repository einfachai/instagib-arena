import { playerAgent } from '../agent-session';
import type { AgentKind } from './agent';
import * as THREE from 'three';
import { Character } from './character/character';
import { CharacterAnimator } from './character-anim';
import { attachRailgun } from './character/gun';
import { createCharacterMaterial, createCharacterWindowMaterial } from './character/body';
import type { RailgunModel } from './weapon-model';
import type { RailgunFinish } from './cosmetics';

type ArmRest = {
  shoulder: THREE.Vector3; elbow: THREE.Vector3; wrist: THREE.Vector3;
  upper: THREE.Vector3; lower: THREE.Vector3; a: number; b: number;
};
type ArmAsset = { geometry: THREE.BufferGeometry; arms: ArmRest[] };
type ArmRig = {
  asset: ArmAsset; bones: THREE.Bone[];
  inverse: THREE.Matrix4; rotation: THREE.Quaternion;
  shoulder: THREE.Vector3; elbow: THREE.Vector3; direction: THREE.Vector3;
  pole: THREE.Vector3; delta: THREE.Quaternion; scale: THREE.Vector3;
};
// Hands retain the authored combat grasp in weapon space. The upper arms and
// forearms use four small IK bones, reaching from camera-relative shoulders.
const geometries = new Map<string, ArmAsset>();
const rigs = new WeakMap<THREE.Group, ArmRig>();
// The supporting shoulder leads slightly forward to reach the fore-end during inspection.
const SHOULDERS = [new THREE.Vector3(-0.25, -0.24, 0.04), new THREE.Vector3(0.25, -0.24, 0.12)];
function armGeometry(finish?: RailgunFinish, agent: AgentKind = playerAgent): ArmAsset {
  const key = `${agent}:${finish?.model ?? 'r01'}`;
  const cached = geometries.get(key);
  if (cached) return cached;
  const ch = new Character({ castShadow: false, agent });
  const gun = attachRailgun(ch, finish), anim = new CharacterAnimator(ch);
  anim.updateStatic(0);
  ch.root.updateMatrixWorld(true);
  ch.mesh.skeleton.update();
  const gunInverse = gun.matrixWorld.clone().invert();
  const toGun = gunInverse.clone().multiply(ch.mesh.matrixWorld);
  const arms = ['Left', 'Right'].map(side => {
    const point = (part: string) => ch.canonicalBones.get(`mixamorig${side}${part}`)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(gunInverse);
    const shoulder = point('Arm'), elbow = point('ForeArm'), wrist = point('Hand');
    const upper = elbow.clone().sub(shoulder), lower = wrist.clone().sub(elbow);
    return { shoulder, elbow, wrist, a: upper.length(), b: lower.length(), upper: upper.normalize(), lower: lower.normalize() };
  });
  const mapping = ch.mesh.skeleton.bones.map(bone => {
    const match = /^mixamorig(Left|Right)(Arm|ForeArm|Hand.*)$/.exec(bone.name);
    return !match ? -1 : match[2].startsWith('Hand') ? 0 : (match[1] === 'Left' ? 1 : 3) + (match[2] === 'ForeArm' ? 1 : 0);
  });
  const src = ch.mesh.geometry, index = src.index!;
  const skin = src.getAttribute('skinIndex'), weights = src.getAttribute('skinWeight');
  const vertices: number[] = [], groups: { start: number; count: number; materialIndex: number }[] = [];
  const armWeight = (i: number) => {
    let weight = 0;
    for (let j = 0; j < 4; j++) if (mapping[skin.getComponent(i, j)] >= 0) weight += weights.getComponent(i, j);
    return weight;
  };
  for (const group of src.groups) {
    const start = vertices.length;
    for (let t = group.start; t < group.start + group.count; t += 3) {
      const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      if (ids.reduce((n, i) => n + armWeight(i), 0) > 1.5) vertices.push(...ids);
    }
    groups.push({ start, count: vertices.length - start, materialIndex: group.materialIndex ?? 0 });
  }
  const geometry = new THREE.BufferGeometry(), v = new THREE.Vector3(), n = new THREE.Vector3();
  const normal = src.getAttribute('normal'), boneMatrix = new THREE.Matrix4(), blended = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  for (const [name, attribute] of Object.entries(src.attributes)) {
    if (name === 'skinIndex' || name === 'skinWeight') continue;
    const data = new Float32Array(vertices.length * attribute.itemSize);
    vertices.forEach((id, out) => {
      if (name === 'position') ch.mesh.getVertexPosition(id, v).applyMatrix4(toGun).toArray(data, out * 3);
      else if (name === 'normal') {
        blended.elements.fill(0);
        for (let j = 0; j < 4; j++) {
          const b = skin.getComponent(id, j), w = weights.getComponent(id, j);
          boneMatrix.multiplyMatrices(ch.mesh.skeleton.bones[b].matrixWorld, ch.mesh.skeleton.boneInverses[b]);
          for (let k = 0; k < 16; k++) blended.elements[k] += boneMatrix.elements[k] * w;
        }
        boneMatrix.copy(toGun).multiply(ch.mesh.bindMatrixInverse).multiply(blended).multiply(ch.mesh.bindMatrix);
        normalMatrix.getNormalMatrix(boneMatrix);
        n.fromBufferAttribute(normal, id).applyMatrix3(normalMatrix).normalize().toArray(data, out * 3);
      } else for (let k = 0; k < attribute.itemSize; k++) data[out * attribute.itemSize + k] = attribute.getComponent(id, k);
    });
    geometry.setAttribute(name, new THREE.BufferAttribute(data, attribute.itemSize));
  }
  const indices = new Uint16Array(vertices.length * 4), mappedWeights = new Float32Array(vertices.length * 4);
  vertices.forEach((id, out) => {
    const weightsByBone = new Map<number, number>();
    for (let j = 0; j < 4; j++) {
      const bone = mapping[skin.getComponent(id, j)], weight = weights.getComponent(id, j);
      if (bone >= 0 && weight > 0) weightsByBone.set(bone, (weightsByBone.get(bone) ?? 0) + weight);
    }
    const total = [...weightsByBone.values()].reduce((sum, w) => sum + w, 0);
    let j = 0;
    for (const [bone, weight] of weightsByBone) { indices[out * 4 + j] = bone; mappedWeights[out * 4 + j++] = weight / total; }
    // Border vertices on a triangle spanning the shoulder seam stay attached.
    if (!total) mappedWeights[out * 4] = 1;
  });
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(mappedWeights, 4));
  for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.computeBoundingSphere();
  gun.dispose(); anim.dispose(); ch.dispose();
  const asset = { geometry, arms };
  geometries.set(key, asset);
  return asset;
}

export function equipViewmodelArms(vm: RailgunModel, finish?: RailgunFinish): void {
  if (vm.group.getObjectByName('android-viewmodel-arms')) return;
  const asset = armGeometry(finish);
  const { material, uniforms } = createCharacterMaterial();
  uniforms.uPlayer.value.setRGB(1, 1, 1);
  uniforms.uLift.value = 0.07;
  uniforms.uRim.value.setRGB(1.15, 1.15, 1.15); uniforms.uRimStr.value = 0.3;
  uniforms.uVisorCore.value.set('#d9f0ff').multiplyScalar(2.6);
  uniforms.uVisorEdge.value.set('#96d9ff').multiplyScalar(2);
  const window = createCharacterWindowMaterial(uniforms);
  const mesh = new THREE.SkinnedMesh(asset.geometry, [material, window]);
  mesh.name = 'android-viewmodel-arms'; mesh.frustumCulled = false;
  const bones = ['grasp', 'left-upper-arm', 'left-forearm', 'right-upper-arm', 'right-forearm'].map(name => {
    const bone = new THREE.Bone(); bone.name = name; bone.matrixAutoUpdate = false; mesh.add(bone); return bone;
  });
  const origins = [new THREE.Vector3(), ...asset.arms.flatMap(arm => [arm.shoulder, arm.elbow])];
  const skeleton = new THREE.Skeleton(bones, origins.map(p => new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z)));
  mesh.bind(skeleton, new THREE.Matrix4());
  vm.group.add(mesh);
  rigs.set(vm.group, { asset, bones, inverse: new THREE.Matrix4(), rotation: new THREE.Quaternion(), shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), direction: new THREE.Vector3(), pole: new THREE.Vector3(), delta: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) });
  updateViewmodelArms(vm.group);
  const disposeGun = vm.dispose;
  vm.dispose = () => { rigs.delete(vm.group); mesh.removeFromParent(); skeleton.dispose(); material.dispose(); window.dispose(); disposeGun(); };
}

// Call after the weapon transform is finalized, including inspect and recoil.
// All calculations are camera-local, so world aim and camera motion cannot
// introduce a second transform that pulls the hands away from their grips.
export function updateViewmodelArms(group: THREE.Group): void {
  const rig = rigs.get(group);
  if (!rig) return;
  group.updateMatrix();
  rig.inverse.copy(group.matrix).invert();
  rig.rotation.copy(group.quaternion).invert();
  rig.asset.arms.forEach((arm, i) => {
    const { shoulder, elbow, direction, pole, delta, scale } = rig;
    shoulder.copy(SHOULDERS[i]).applyMatrix4(rig.inverse);
    direction.copy(arm.wrist).sub(shoulder);
    const distance = Math.max(0.0001, direction.length()); direction.divideScalar(distance);
    // Both elbows point down and outward; the pole stays relative to the body
    // while the weapon turns in the hands.
    pole.set(i === 0 ? -0.7 : 0.7, -1, 0.15).applyQuaternion(rig.rotation);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    // User offsets can exceed arm reach. A small, uniform extension preserves
    // both attachments in that case; the authored carry/inspect needs none.
    const stretch = Math.max(1, distance / (arm.a + arm.b - 0.001));
    const a = arm.a * stretch, b = arm.b * stretch;
    const along = THREE.MathUtils.clamp((a * a - b * b + distance * distance) / (2 * distance), -a, a);
    elbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
    delta.setFromUnitVectors(arm.upper, direction.copy(elbow).sub(shoulder).normalize());
    scale.setScalar(stretch);
    rig.bones[1 + i * 2].matrix.compose(shoulder, delta, scale);
    delta.setFromUnitVectors(arm.lower, direction.copy(arm.wrist).sub(elbow).normalize());
    rig.bones[2 + i * 2].matrix.compose(elbow, delta, scale);
    rig.bones[1 + i * 2].matrixWorldNeedsUpdate = rig.bones[2 + i * 2].matrixWorldNeedsUpdate = true;
  });
}
