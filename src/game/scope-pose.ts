import * as THREE from 'three';
import type { ScopeFrame } from './scope-transition';

export type ScopeProjection = { x: number; y: number; scale: number };
const fallbackSight = new THREE.Vector3(0, 0.15, -0.18);
const localSight = new THREE.Vector3();
const lens = new THREE.Vector3();
const aimed = new THREE.Vector3();
const neutral = new THREE.Quaternion();

// Apply after the ordinary hip pose. Hands are children of the weapon and the
// existing arm IK still anchors shoulders to the camera; no second arm animation.
export function applyScopePose(group: THREE.Group, sight: THREE.Object3D | undefined, frame: ScopeFrame): void {
  if (frame.progress === 0) return;
  group.updateWorldMatrix(true, true);
  if (sight) group.worldToLocal(sight.getWorldPosition(localSight));
  else localSight.copy(fallbackSight);
  localSight.multiply(group.scale);
  // Centre the optic first, then bring its rear aperture to 14 cm from the eye.
  // The receiver/stock crosses the near plane only after the viewmodel fades.
  aimed.set(-localSight.x, -localSight.y, -0.14 - localSight.z);
  group.position.x = THREE.MathUtils.lerp(group.position.x, aimed.x, frame.alignment);
  group.position.y = THREE.MathUtils.lerp(group.position.y, aimed.y, frame.alignment);
  group.position.z = THREE.MathUtils.lerp(group.position.z, aimed.z, frame.approach);
  group.quaternion.slerp(neutral, frame.alignment);
}

// Coordinates in the overlay's centred 1600×900 SVG. Use camera-local weapon
// transforms so the same math works with the separate viewmodel camera and lab.
export function projectScopeSight(group: THREE.Group, sight: THREE.Object3D | undefined,
  camera: THREE.PerspectiveCamera, result: ScopeProjection): ScopeProjection {
  group.updateWorldMatrix(true, true);
  if (sight) group.worldToLocal(sight.getWorldPosition(lens));
  else lens.copy(fallbackSight);
  lens.multiply(group.scale).applyQuaternion(group.quaternion).add(group.position);
  const depth = Math.max(0.05, -lens.z);
  const focal = 1 / Math.tan(camera.fov * Math.PI / 360);
  const svgHeight = Math.max(900, 1600 / camera.aspect);
  result.x = lens.x / depth * focal * svgHeight / 2;
  result.y = -lens.y / depth * focal * svgHeight / 2;
  result.scale = THREE.MathUtils.clamp(0.045 * group.scale.y / depth * focal * svgHeight / 740, 0.025, 0.65);
  return result;
}
