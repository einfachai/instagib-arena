import * as THREE from 'three';
import type { GroundImpactListener } from './character/gibs';
import { DEFAULT_KILL_EFFECT, type KillEffectStyle } from './cosmetics';
import { Character } from './character/character';
import { characterAssets } from './character/assets';
import { GibBurst, type GibFloor } from './character/gibs';
import { Locomotion, type FootfallListener } from './locomotion';
import type { AnyEmoteKind as EmoteKind } from './emotes';
import type { MovementCue } from './movement-cues';
import { HOLD, gunSupportHold } from './character/gun';

export type CharacterModel = { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
export type CharacterAnimInput = {
  dt: number; yaw: number; pitch: number; pos: THREE.Vector3;
  velocity?: { x: number; y: number; z: number };
  grounded?: boolean;
  cues?: readonly MovementCue[];
};
export type AnimatorOptions = { driveYaw?: boolean; holdGun?: boolean };
export function enableShadows(root: THREE.Object3D): void {
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
}
const clamp = THREE.MathUtils.clamp;
const DIRECTIONS = ['forward', 'forward-right', 'right', 'backward-right', 'backward', 'backward-left', 'left', 'forward-left'];
const WRIST_FRAMES = {
  Right: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0.9, -0.43589), new THREE.Vector3(0, -0.43589, -0.9), new THREE.Vector3(-1, 0, 0))),
  Left: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))),
};

// The support palm cups the fore-end diagonally: the wrist points forward
// from the elbow, while the fingers cross the underside. The thumb opposes
// them along the near rail instead of sticking vertically up the receiver.
const R01_SUPPORT_WRIST = WRIST_FRAMES.Left.clone().premultiply(
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35),
);
const R01_SUPPORT_PALM = new THREE.Vector3(0, 0.1021, 0.01604).applyQuaternion(R01_SUPPORT_WRIST);
const R01_FINGERS = { Index: [0.5, 1.1, 0.3], Middle: [0.85, 0.75, 0.3], Ring: [1.05, 0.55, 0.3], Pinky: [1.2, 0.4, 0.3] };
const R01_THUMB = [new THREE.Vector3(-0.27, 0.92, 0.3), new THREE.Vector3(-0.95, 0.30, 0.1), new THREE.Vector3(-0.95, 0.30, -0.06)]
  .map(direction => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
// Bone rotations are relative to the previous phalange, not the wrist.
for (let i = R01_THUMB.length - 1; i > 0; i--) R01_THUMB[i].premultiply(R01_THUMB[i - 1].clone().invert());

// Independent mixer and cloned skeleton per character. The mixer changes only
// canonical bone transforms; position, gravity, collision and hitboxes stay in
// the existing gameplay controller. Directional strafing never implies a dash.
export class CharacterAnimator {
  readonly loco = new Locomotion(); // compatibility/footfall telemetry for labs
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly gibs: GibBurst;
  private readonly prev = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private hasPrev = false;
  private grounded = true;
  private speed = 0;
  private pitch = 0;
  private prevYaw = 0;
  private event: { id: string; t: number; duration: number; weight: number } | null = null;
  private emote: EmoteKind | null = null;
  private emoteWeight = 0;
  private emoteTarget = 0;
  private recoil = 0;
  private r01SupportGrip = false;
  private stepPhase = 0;
  private readonly driveYaw: boolean;
  private readonly holdGun: boolean;
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly target = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly ikGoal = new THREE.Vector3();
  private readonly ikDirection = new THREE.Vector3();
  private readonly shoulder = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly joint = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly aimQuaternion = new THREE.Quaternion();
  private readonly weights = new Map<string, number>();
  private readonly upperActions = new Map<string, THREE.AnimationAction>();
  private readonly upperAim: THREE.AnimationAction | null;
  private readonly authoredRotations = new Map<THREE.Bone, THREE.Quaternion>();

  constructor(readonly character: Character, opts: AnimatorOptions = {}) {
    this.driveYaw = opts.driveYaw ?? true;
    this.holdGun = opts.holdGun ?? true;
    this.gibs = new GibBurst(character);
    this.mixer = new THREE.AnimationMixer(character.model);
    for (const name of ['Spine', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', ...['Left', 'Right'].flatMap(side => ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].flatMap(digit => [1, 2, 3].map(segment => side + 'Hand' + digit + segment)))]) {
      const bone = character.canonicalBones.get('mixamorig' + name);
      if (bone) this.authoredRotations.set(bone, bone.quaternion.clone());
    }
    const lower = (name: string) => /mixamorig(?:Hips|(?:Left|Right)(?:UpLeg|Leg|Foot|Toe))/.test(name);
    for (const [id, clip] of characterAssets(character.agent).clips) {
      const movement = this.holdGun && !id.startsWith('emote.') && id !== 'rig.tpose' && id !== 'idle.relaxed';
      const action = this.mixer.clipAction(movement ? new THREE.AnimationClip(id, clip.duration, clip.tracks.filter((t) => lower(t.name))) : clip);
      action.play(); action.setEffectiveWeight(0);
      this.actions.set(id, action);
      if (movement && !/^(walk|run|sprint)\.|^idle\.|^jump\.(loop|down)$/.test(id)) {
        const upper = this.mixer.clipAction(new THREE.AnimationClip(id + '.upper', clip.duration, clip.tracks.filter((t) => !lower(t.name))));
        upper.play().setEffectiveWeight(0); this.upperActions.set(id, upper);
      }
    }
    const aim = characterAssets(character.agent).clips.get('idle.armed')!;
    this.upperAim = this.holdGun ? this.mixer.clipAction(new THREE.AnimationClip('aim.upper', aim.duration, aim.tracks.filter((t) => !lower(t.name)))) : null;
    this.upperAim?.play();
    this.character.root.rotation.order = 'YXZ';
    this.pose(0, 0, 0, 0, 0);
  }
  get footfalls(): number { return this.loco.footfalls; }
  set onFootfall(fn: FootfallListener | null) { this.loco.onFootfall = fn; }
  get isAirborne(): boolean { return !this.grounded; }
  get currentEmote(): EmoteKind | null { return this.emote; }
  get movementClip(): string | null { return this.event?.id ?? null; }
  get emoteShowsGun(): boolean { return false; }
  playEmote(kind: EmoteKind | null, restart = false): void {
    if (kind === this.emote && !restart) return;
    if (kind === null) { this.emoteTarget = 0; return; }
    const id = kind === 'idle' ? 'idle.relaxed' : 'emote.placeholder';
    const action = this.actions.get(id);
    if (!action) throw new Error('Missing character emote: ' + id);
    this.emote = kind; this.emoteTarget = 1; action.reset().play();
  }
  setEmoteTime(t: number, weight = 1): void {
    if (!this.emote) return;
    const a = this.actions.get(this.emote === 'idle' ? 'idle.relaxed' : 'emote.placeholder');
    if (a) a.time = t;
    this.emoteWeight = this.emoteTarget = weight;
    this.pose(0, 0, 0, 0, 0);
  }
  notifyFire(): void { this.recoil = 1; }
  set onDeathGroundImpact(listener: GroundImpactListener | null) { this.gibs.onGroundImpact = listener; }
  die(floor?: GibFloor, style: KillEffectStyle = DEFAULT_KILL_EFFECT): boolean {
    if (!this.gibs.active) this.gibs.start(this.velocity.x, this.velocity.y, this.velocity.z, floor === undefined ? (this.grounded ? { y: this.prev.y } : null) : floor, style);
    return true;
  }
  isDying(): boolean { return this.gibs.active; }
  deathDone(): boolean { return this.gibs.active && this.gibs.done; }
  respawn(pos?: THREE.Vector3): void {
    this.gibs.stop(); this.event = null; this.emote = null; this.emoteTarget = this.emoteWeight = 0;
    this.character.root.position.set(0, 0, 0); this.resetMotion(pos); this.pose(0, 0, 0, 0, 0);
  }
  resetMotion(pos?: THREE.Vector3): void {
    this.hasPrev = !!pos; if (pos) this.prev.copy(pos);
    this.velocity.set(0, 0, 0); this.speed = this.pitch = this.recoil = 0;
    this.grounded = true; this.event = null; this.stepPhase = 0; this.loco.reset();
  }
  dispose(): void { this.gibs.dispose(); this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.character.model); }

  update(input: CharacterAnimInput): void {
    const dt = clamp(input.dt, 0, 0.1);
    if (this.gibs.active) { this.gibs.update(dt); return; }
    const oldGround = this.grounded, oldVy = this.velocity.y, oldVx = this.velocity.x, oldVz = this.velocity.z, oldSpeed = this.speed;
    if (input.velocity) this.velocity.copy(input.velocity);
    else if (this.hasPrev && dt > 0) {
      this.velocity.subVectors(input.pos, this.prev).divideScalar(dt);
      if (this.velocity.length() > 60) this.resetMotion(input.pos);
    }
    this.prev.copy(input.pos); this.hasPrev = true;
    this.grounded = input.grounded ?? Math.abs(this.velocity.y) < 0.35;
    this.speed += (Math.hypot(this.velocity.x, this.velocity.z) - this.speed) * (1 - Math.exp(-10 * dt));
    const cy = Math.cos(input.yaw), sy = Math.sin(input.yaw);
    const vx = this.velocity.x * cy - this.velocity.z * sy, vz = this.velocity.x * sy + this.velocity.z * cy;
    if (this.driveYaw) this.character.root.rotation.set(0, input.yaw, 0);
    const yawRate = dt ? THREE.MathUtils.euclideanModulo(input.yaw - this.prevYaw + Math.PI, 2 * Math.PI) - Math.PI : 0;
    this.prevYaw = input.yaw;
    this.pitch += (clamp(input.pitch, -70 * Math.PI / 180, 70 * Math.PI / 180) - this.pitch) * (1 - Math.exp(-14 * dt));
    // Older clients/replays have no events. Infer launch/relaunch/landing from
    // motion, while dash remains an explicit cue to avoid false strafe lunges.
    if (!input.cues?.length) {
      if (oldGround && !this.grounded && this.velocity.y > 2) this.trigger({ kind: 'jump' });
      else if (!oldGround && !this.grounded && this.velocity.y - oldVy > 4) {
        const impulse = Math.hypot(this.velocity.x - oldVx, this.velocity.z - oldVz);
        const length = Math.hypot(this.velocity.x, this.velocity.z) || 1;
        this.trigger({ kind: this.velocity.y > 15 ? 'boost' : impulse > 7 ? 'wall-jump' : 'double-jump', direction: { x: this.velocity.x / length, z: this.velocity.z / length } }, input.yaw);
      }
      else if (!oldGround && this.grounded) this.trigger({ kind: 'landing', impact: Math.max(2, -oldVy) });
    }
    for (const cue of input.cues ?? []) this.trigger(cue, input.yaw);
    if (!this.event && this.grounded) {
      if (oldSpeed < 0.8 && this.speed >= 0.8) this.startEvent('run.start', 0.25, 0.35);
      if (oldSpeed >= 0.8 && this.speed < 0.8) this.startEvent(oldSpeed > 4 ? 'run.stop' : 'walk.stop', 0.3, 0.5);
      if (this.speed < 0.5 && Math.abs(yawRate) > 0.05) this.startEvent(yawRate > 0 ? 'turn.left' : 'turn.right', 0.3, 0.4);
    }
    this.pose(dt, vx, vz, this.speed, this.holdGun ? this.pitch : 0);
    this.loco.air = this.grounded ? 0 : 1; this.loco.move = clamp(this.speed / 5, 0, 1);
    if (this.grounded && this.speed > 0.8 && !this.emote) {
      const phase = this.stepPhase;
      this.stepPhase += dt * clamp(this.speed * 0.45, 1.4, 6);
      if (Math.floor(phase) !== Math.floor(this.stepPhase)) { this.loco.footfalls++; this.loco.onFootfall?.((Math.floor(this.stepPhase) % 2) as 0 | 1, this.speed); }
    }
  }
  updateStatic(dt: number): void {
    if (this.gibs.active) { this.gibs.update(clamp(dt, 0, 0.1)); return; }
    this.grounded = true; this.pose(clamp(dt, 0, 0.1), 0, 0, 0, 0);
  }
  private trigger(cue: MovementCue, yaw = 0): void {
    let id: string, duration: number, weight = 1;
    switch (cue.kind) {
      case 'jump': id = 'jump.up'; duration = 0.22; break;
      case 'double-jump': id = 'jump.double'; duration = 0.32; break;
      case 'boost': id = 'jump.boost'; duration = 0.38; break;
      case 'wall-jump': {
        const d = cue.direction; const side = d ? d.x * Math.cos(yaw) - d.z * Math.sin(yaw) : 1;
        id = side > 0 ? 'wall.left' : 'wall.right'; duration = 0.28; break;
      }
      case 'dash': {
        const d = cue.direction ?? { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        const x = d.x * Math.cos(yaw) - d.z * Math.sin(yaw), z = d.x * Math.sin(yaw) + d.z * Math.cos(yaw);
        const direction = Math.abs(x) > Math.abs(z) ? x > 0 ? 'right' : 'left' : z > 0 ? 'backward' : 'forward';
        id = 'dash.' + direction; duration = 0.15; break;
      }
      case 'landing': id = 'land'; duration = 0.2 + clamp((cue.impact ?? 5) / 40, 0, 0.2); weight = clamp((cue.impact ?? 5) / 12, 0.25, 1); break;
    }
    if (!this.startEvent(id, duration, weight, cue.age)) return;
    if (cue.kind === 'landing') this.grounded = true;
    else if (cue.kind !== 'dash') this.grounded = false;
  }
  private startEvent(id: string, duration: number, weight: number, age = 0): boolean {
    const a = this.actions.get(id);
    if (!a || age >= duration) return false;
    a.reset().play(); a.time = age / duration * a.getClip().duration;
    this.event = { id, t: age, duration, weight };
    return true;
  }
  private pose(dt: number, vx: number, vz: number, speed: number, pitch: number): void {
    for (const a of this.actions.values()) { a.setEffectiveWeight(0); a.setEffectiveTimeScale(1); }
    const weights = this.weights; weights.clear();
    for (const a of this.upperActions.values()) a.setEffectiveWeight(0);
    if (!this.grounded) weights.set(this.velocity.y < -2 ? 'jump.down' : 'jump.loop', 1);
    else if (speed < 0.65) weights.set(this.holdGun ? 'idle.armed' : 'idle.relaxed', 1);
    else {
      const angle = THREE.MathUtils.euclideanModulo(Math.atan2(vx, -vz), Math.PI * 2) / (Math.PI / 4);
      const first = Math.floor(angle) % 8, fraction = angle - Math.floor(angle);
      const sprint = clamp((speed - 11) / 7, 0, 1), run = clamp((speed - 2) / 4, 0, 1);
      for (const [gait, weight] of [['walk', 1 - run], ['run', run * (1 - sprint)], ['sprint', sprint]] as const) {
        weights.set(gait + '.' + DIRECTIONS[first], weight * (1 - fraction));
        weights.set(gait + '.' + DIRECTIONS[(first + 1) % 8], weight * fraction);
      }
      for (const [id] of weights) this.actions.get(id)?.setEffectiveTimeScale(clamp(speed / (id.startsWith('walk') ? 3 : id.startsWith('run') ? 7 : 12), 0.65, 1.8));
    }
    let eventWeight = 0;
    if (this.event) {
      this.event.t += dt;
      if (this.event.t >= this.event.duration) this.event = null;
      else {
        eventWeight = this.event.weight * Math.min(1, (this.event.duration - this.event.t) / 0.06);
        const a = this.actions.get(this.event.id);
        if (a) {
          a.time = this.event.t / this.event.duration * a.getClip().duration; a.setEffectiveTimeScale(0);
          const upper = this.upperActions.get(this.event.id);
          if (upper) { upper.time = a.time; upper.setEffectiveTimeScale(0); upper.setEffectiveWeight(eventWeight * 0.5 * (1 - this.emoteWeight)); }
        }
      }
    }
    this.emoteWeight += (this.emoteTarget - this.emoteWeight) * (1 - Math.exp(-9 * dt));
    if (!this.emoteTarget && this.emoteWeight < 0.01) { this.emote = null; this.emoteWeight = 0; }
    for (const [id, weight] of weights) this.actions.get(id)?.setEffectiveWeight(weight * (1 - eventWeight) * (1 - this.emoteWeight));
    if (this.event) this.actions.get(this.event.id)?.setEffectiveWeight(eventWeight * (1 - this.emoteWeight));
    if (this.emote) this.actions.get(this.emote === 'idle' ? 'idle.relaxed' : 'emote.placeholder')?.setEffectiveWeight(this.emoteWeight);
    this.upperAim?.setEffectiveWeight((1 - this.emoteWeight) * (1 - (this.event && this.upperActions.has(this.event.id) ? eventWeight * 0.5 : 0)));
    // PropertyMixer skips assigning a transform when its sampled value has
    // not changed. Restore the authored rotations so aim/IK cannot accumulate
    // on a paused replay or a held animation frame.
    for (const [bone, rotation] of this.authoredRotations) bone.quaternion.copy(rotation);
    this.mixer.update(dt);
    for (const [bone, rotation] of this.authoredRotations) rotation.copy(bone.quaternion);
    this.recoil *= Math.exp(-20 * dt);
    this.character.root.updateWorldMatrix(true, true);
    if (this.holdGun && this.emoteWeight < 0.5) this.aim(pitch);
    this.character.syncRigFacade();
    // Socket coordinates are in the game's normalized logical frame.
    if ((this.holdGun && this.emoteWeight < 0.5) || this.emoteShowsGun) this.grip(pitch);
  }
  private aim(pitch: number): void {
    for (const [name, share] of [['Spine', 0.2], ['Spine2', 0.3], ['Neck', 0.15], ['Head', 0.35]] as const) {
      const b = this.character.canonicalBones.get('mixamorig' + name);
      if (!b) continue;
      b.getWorldQuaternion(this.q);
      this.v.set(1, 0, 0).applyQuaternion(this.character.root.getWorldQuaternion(this.q2));
      this.q.premultiply(this.q2.setFromAxisAngle(this.v, pitch * share + (name === 'Spine2' ? this.recoil * 0.035 : 0)));
      b.parent!.getWorldQuaternion(this.q2); b.quaternion.copy(this.q2.invert().multiply(this.q)); b.updateWorldMatrix(false, true);
    }
  }
  private grip(pitch: number): void {
    const ch = this.character, socket = ch.sockets.gun;
    // Gun aim frame is relative to the gameplay root, never to the imported
    // hand's arbitrary FBX rest axes. Railgun scale and first-person gun stay.
    this.aimQuaternion.setFromAxisAngle(this.v.set(1, 0, 0), pitch + this.recoil * 0.035);
    ch.rig.modelPos(3, this.target);
    this.target.add(this.v.copy(HOLD.grip).applyQuaternion(this.aimQuaternion));
    this.target.z += this.recoil * 0.015;
    this.m.compose(this.target, this.aimQuaternion, this.scale.set(1, 1, 1));
    const hand = ch.rig.bones[13];
    socket.matrix.copy(hand.matrix).invert().multiply(this.m); socket.matrixAutoUpdate = false;
    // Correct the real Mixamo arm chains and orient the wrists to the gun.
    // Palm contact is on the side of the slanted pistol grip. The hand's
    // +Y runs wrist-to-knuckles and +Z points out through its padded palm.
    this.target.add(this.v.set(0.0305, 0.0392, -0.0004).applyQuaternion(this.aimQuaternion));
    this.target.sub(this.v.set(0, 0.103, 0).applyQuaternion(WRIST_FRAMES.Right).applyQuaternion(this.aimQuaternion));
    ch.root.localToWorld(this.target); this.solveArm('Right', this.target);
    this.orientWrist('Right');
    const support = gunSupportHold(socket);
    // Custom models return their legacy HOLD.support anchor and retain that pose.
    this.r01SupportGrip = support !== HOLD.support;
    this.target.setFromMatrixPosition(this.m).add(this.elbow.copy(support).sub(HOLD.grip).applyQuaternion(this.aimQuaternion));
    if (this.r01SupportGrip) this.v.copy(R01_SUPPORT_PALM);
    else this.v.set(0.108, 0.027, 0);
    this.target.sub(this.v.applyQuaternion(this.aimQuaternion));
    ch.root.localToWorld(this.target); this.solveArm('Left', this.target);
    this.orientWrist('Left');
    this.curlFingers();
    ch.syncRigFacade();
    socket.matrix.copy(hand.matrix).invert().multiply(this.m); socket.matrixWorldNeedsUpdate = true;
  }
  private orientWrist(side: 'Left' | 'Right'): void {
    const hand = this.character.canonicalBones.get('mixamorig' + side + 'Hand');
    if (!hand) return;
    this.character.root.getWorldQuaternion(this.q);
    this.q.multiply(this.aimQuaternion).multiply(side === 'Left' && this.r01SupportGrip ? R01_SUPPORT_WRIST : WRIST_FRAMES[side]);
    hand.parent!.getWorldQuaternion(this.q2);
    hand.quaternion.copy(this.q2.invert().multiply(this.q)).normalize();
    hand.updateWorldMatrix(false, true);
  }
  private curlFingers(): void {
    // Dedicated grasp, independent of the fingers in the old rifle animation.
    for (const side of ['Left', 'Right'] as const) {
      for (const digit of ['Index', 'Middle', 'Ring', 'Pinky'] as const) {
        const angles = side === 'Right' ? (digit === 'Index' ? [0, 1.53, 1.5] : [1.05, 1.35, 0.9]) : this.r01SupportGrip ? R01_FINGERS[digit] : [0.8, 0.9, 0.55];
        for (let i = 0; i < 3; i++) {
          const bone = this.character.canonicalBones.get(`mixamorig${side}Hand${digit}${i + 1}`)!;
          bone.quaternion.setFromAxisAngle(this.v.set(1, 0, 0), angles[i]);
          if (side === 'Right' && digit === 'Index' && i === 0) bone.quaternion.multiply(this.q.setFromAxisAngle(this.v.set(0, 0, 1), 0.234));
        }
      }
      if (side === 'Left') for (let i = 0; i < 3; i++) {
        const rotation = this.character.canonicalBones.get(`mixamorigLeftHandThumb${i + 1}`)!.quaternion;
        if (this.r01SupportGrip) rotation.copy(R01_THUMB[i]);
        else rotation.setFromAxisAngle(this.v.set(1, 0, 0), [0.9, 0.9, 0.35][i]);
      }
    }
  }
  private pointBone(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3): void {
    bone.getWorldPosition(this.elbow); child.getWorldPosition(this.v);
    this.v.sub(this.elbow).normalize(); this.ikDirection.copy(target).sub(this.elbow).normalize();
    this.q.setFromUnitVectors(this.v, this.ikDirection);
    bone.getWorldQuaternion(this.q2); this.q.multiply(this.q2);
    bone.parent!.getWorldQuaternion(this.q2); bone.quaternion.copy(this.q2.invert().multiply(this.q));
    bone.updateWorldMatrix(false, true);
  }
  private solveArm(side: 'Left' | 'Right', target: THREE.Vector3): void {
    const bones = this.character.canonicalBones;
    const upper = bones.get('mixamorig' + side + 'Arm')!, lower = bones.get('mixamorig' + side + 'ForeArm')!, hand = bones.get('mixamorig' + side + 'Hand')!;
    upper.getWorldPosition(this.shoulder); lower.getWorldPosition(this.joint); hand.getWorldPosition(this.end);
    const a = this.shoulder.distanceTo(this.joint), b = this.joint.distanceTo(this.end);
    this.ikGoal.copy(target);
    this.end.subVectors(target, this.shoulder);
    const distance = clamp(this.end.length(), Math.abs(a - b) + 0.0001, a + b - 0.0001);
    this.end.normalize();
    this.ikGoal.copy(this.shoulder).addScaledVector(this.end, distance);
    // A stable outward/downward elbow pole avoids wrist reach errors and arm
    // flips as pitch crosses zero. Solve the full two-bone triangle directly.
    this.bend.set(side === 'Right' ? 0.7 : -0.7, -1, 0.15).applyQuaternion(this.character.root.getWorldQuaternion(this.q));
    this.bend.addScaledVector(this.end, -this.bend.dot(this.end)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    this.joint.copy(this.shoulder).addScaledVector(this.end, along).addScaledVector(this.bend, Math.sqrt(Math.max(0, a * a - along * along)));
    this.pointBone(upper, lower, this.joint);
    this.pointBone(lower, hand, this.ikGoal);
  }
}
export function createCombatant(opts: { colorHex?: string; castShadow?: boolean } & AnimatorOptions = {}) {
  const character = new Character(opts); return { character, anim: new CharacterAnimator(character, opts) };
}
