import * as THREE from 'three';
import type { AgentKind } from './agent';
import { Character } from './character/character';
import { CharacterAnimator } from './character-anim';
import type { GibFloor, GroundImpactListener } from './character/gibs';

export type DeathPose = {
  pos: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  grounded: boolean;
};

/** The local victim has no live third-person body. Reuse corpse physics in a
 * prewarmed, detached character so their thud follows a real ground collision. */
export class LocalDeathImpact {
  private readonly group = new THREE.Group();
  private readonly character: Character;
  private readonly animator: CharacterAnimator;

  constructor(agent: AgentKind, onImpact: GroundImpactListener) {
    this.character = new Character({ agent, castShadow: false });
    this.group.add(this.character.root);
    this.group.visible = false;
    this.animator = new CharacterAnimator(this.character);
    this.animator.onDeathGroundImpact = onImpact;
  }

  die(pose: DeathPose, floor: GibFloor, style: Parameters<CharacterAnimator['die']>[1]) {
    this.animator.respawn();
    this.group.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    this.animator.update({
      dt: 0, pos: this.group.position, velocity: pose.velocity,
      yaw: pose.yaw, pitch: pose.pitch, grounded: pose.grounded && floor !== null,
    });
    this.animator.die(floor, style);
  }

  update(dt: number) {
    if (this.animator.isDying() && !this.animator.deathDone()) this.animator.updateStatic(dt);
  }

  reset() { this.animator.respawn(); }

  dispose() {
    this.animator.onDeathGroundImpact = null;
    this.animator.dispose();
    this.character.dispose();
    this.group.clear();
  }
}
