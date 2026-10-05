import type { AgentKind } from '../agent';
import * as THREE from 'three';
import { DYE_MODE, createCharacterMaterial, createCharacterWindowMaterial, type BodyGeometry, resetDeathLook, tickDyeClock, type CharacterUniforms } from './body';
import type { DyeDef } from '../dyes';
import { B, Rig, SOCKETS, REST_ABS, type SocketName } from './rig';
import { viewPos } from '../fx/fx-settings';
import { characterAssets, cloneCharacterModel, canonicalBoneName, CODEX_PALETTE } from './assets';

// One arena combatant: an independently cloned Mixamo skeleton, one shared
// skinned body geometry, two surface materials, and the existing attachment sockets.
// The logical Rig is a compatibility facade and a separate breakup skeleton.
// `root` carries gameplay position/yaw; the model container normalizes the art.

// The Codex palette is the default across matches, menus and previews. Team,
// highlight and equipped dye overrides are resolved by the existing callers.
export const SKIN_PALETTE: readonly string[] = [CODEX_PALETTE.white];
export function skinColorFor(_seed: string): string { return CODEX_PALETTE.white; }

export type LookMode = 'natural' | 'highlight';

// Socket → owning combatant (lets socket-based APIs like the legacy WornHat
// reach the whole character). Weak: no retention, nothing on userData.
const SOCKET_OWNER = new WeakMap<THREE.Object3D, Character>();
export function characterOfSocket(socket: THREE.Object3D): Character | undefined {
  return SOCKET_OWNER.get(socket);
}

const WHITE = new THREE.Color(1, 1, 1);
const CODEX_BLUE = new THREE.Color(CODEX_PALETTE.blue);
// Metres in the normalized logical bone frames: crown at 1.8 m, face at the
// inset visor, chest effect above the emblem and back gear against the shell.
const ANDROID_SOCKET_POS: Partial<Record<SocketName, readonly [number, number, number]>> = {
  headTop: [0, 0.235, 0.012], face: [0, 0.045, -0.107],
  chest: [0, 0.16, -0.145], back: [0, 0.14, 0.125],
};

// Remember the viewer (finishers aim their debris away from them). Module
// scope: one shared function for every combatant.
function recordViewer(_r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera): void {
  tickDyeClock();
  const e = cam.matrixWorld.elements;
  viewPos.x = e[12];
  viewPos.y = e[13];
  viewPos.z = e[14];
  viewPos.set = true;
}

export class Character {
  readonly agent: AgentKind;
  readonly breakup: BodyGeometry;
  readonly root = new THREE.Group();
  readonly rig: Rig;
  readonly mesh: THREE.SkinnedMesh;
  readonly model: THREE.Group;
  readonly modelContainer = new THREE.Group();
  readonly breakupMesh: THREE.SkinnedMesh;
  readonly canonicalBones = new Map<string, THREE.Bone>();
  private readonly restInverse = new Map<number, THREE.Matrix4>();
  private readonly invRoot = new THREE.Matrix4();
  private readonly facadeMatrix = new THREE.Matrix4();
  private readonly restTranslation = new THREE.Matrix4();
  private readonly facadePosition = new THREE.Vector3();
  private readonly facadeQuaternion = new THREE.Quaternion();
  private readonly facadeScale = new THREE.Vector3();
  readonly material: THREE.MeshStandardMaterial;
  readonly windowMaterial: THREE.MeshPhysicalMaterial;
  readonly uniforms: CharacterUniforms;
  readonly sockets: Record<SocketName, THREE.Object3D>;
  private readonly color = new THREE.Color();
  private mode: LookMode = 'natural';
  private dye: DyeDef | null = null;

  constructor(opts: { castShadow?: boolean; colorHex?: string; agent?: AgentKind } = {}) {
    this.root.name = 'combatant';
    this.agent = opts.agent ?? 'codex';
    const asset = characterAssets(this.agent);
    this.breakup = asset.breakup;
    const { material, uniforms } = createCharacterMaterial();
    this.material = material;
    this.uniforms = uniforms;
    this.windowMaterial = createCharacterWindowMaterial(uniforms);
    this.model = cloneCharacterModel(this.agent);
    this.modelContainer.name = 'android-normalization';
    this.modelContainer.matrix.copy(asset.normalization);
    this.modelContainer.matrixAutoUpdate = false;
    this.root.add(this.modelContainer);
    this.modelContainer.add(this.model);
    let mesh: THREE.SkinnedMesh | undefined;
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.canonicalBones.set(o.name, o as THREE.Bone);
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
    });
    if (!mesh) throw new Error('Codex Android has no skinned body.');
    this.mesh = mesh;
    this.mesh.material = [material, this.windowMaterial];
    this.mesh.castShadow = opts.castShadow ?? true;
    this.mesh.receiveShadow = false;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 2.2);
    this.mesh.onBeforeRender = recordViewer;
    this.mesh.userData.shared = true;
    // Legacy logical bones remain a read-only facade for sockets, cape
    // collision and labs, plus an independent rigid breakup skeleton.
    this.rig = new Rig(this.root);
    this.breakupMesh = new THREE.SkinnedMesh(this.breakup.geometry, [material, this.windowMaterial]);
    this.breakupMesh.name = 'android-rigid-breakup';
    this.breakupMesh.visible = false;
    this.breakupMesh.castShadow = this.mesh.castShadow;
    this.breakupMesh.userData.shared = true;
    this.root.add(this.breakupMesh);
    this.breakupMesh.bind(this.rig.skeleton, new THREE.Matrix4());
    for (let i = 0; i < this.rig.bones.length; i++) {
      const rest = asset.rest.get(canonicalBoneName(i));
      if (rest) this.restInverse.set(i, asset.normalization.clone().multiply(rest).invert());
    }
    this.syncRigFacade();

    const sockets = {} as Record<SocketName, THREE.Object3D>;
    for (const name of Object.keys(SOCKETS) as SocketName[]) {
      const def = SOCKETS[name];
      const o = new THREE.Object3D();
      o.name = `socket.${name}`;
      const position = ANDROID_SOCKET_POS[name] ?? def.pos;
      o.position.set(position[0], position[1], position[2]);
      this.rig.bones[def.bone].add(o);
      sockets[name] = o;
      SOCKET_OWNER.set(o, this);
    }
    this.sockets = sockets;
    // Hats report equip changes through the crown socket: hide the crest fin
    // under a hat so it never pokes through the brim.
    sockets.headTop.userData.onHatChange = (hasHat: boolean) => this.setCrestHidden(hasHat);
    this.setLook(opts.colorHex ?? SKIN_PALETTE[0], 'natural');
  }

  // Recolour the armour. `natural` = the player's own bright skin with a
  // subtle rim; `highlight` = the viewer's enemy-highlight / team colour,
  // pushed toward full-bright (Quake Live bright skins).
  setLook(color: THREE.Color | string, mode: LookMode = 'natural'): void {
    if (typeof color === 'string') this.color.set(color);
    else this.color.copy(color);
    this.mode = mode;
    const u = this.uniforms;
    const codexDefault = mode === 'natural' && this.color.getHexString() === CODEX_PALETTE.white.slice(1);
    u.uPlayer.value.copy(codexDefault ? WHITE : this.color);
    // Visor: a hot near-white core (blooms) fading to a saturated player-
    // colour edge; the light slits use the edge colour.
    const visorColor = codexDefault ? (this.agent === 'claude' ? new THREE.Color('#ff6736') : CODEX_BLUE) : this.color;
    u.uVisorCore.value.copy(visorColor).lerp(WHITE, 0.8).multiplyScalar(mode === 'highlight' ? 3.0 : 2.6);
    u.uVisorEdge.value.copy(visorColor).multiplyScalar(mode === 'highlight' ? 2.4 : 2.0);
    // Readability rim: a light tint of the skin colour, strong enough to read
    // as a thin outline at 30 m on same-hue walls. Same for every player.
    u.uRim.value.copy(this.color).lerp(WHITE, 0.15).multiplyScalar(1.15);
    u.uLift.value = mode === 'highlight' ? 0.55 : 0.07;
    u.uRimStr.value = mode === 'highlight' ? 1.6 : 0.3;
    // A plain look carries no dye pattern (highlight / team colours win).
    u.uDyeP.value.x = 0;
    u.uDyeF.value.set(-1, -1);
    this.dye = null;
  }

  // The natural look with a dye (dyes.ts): `null` = the name-keyed skin
  // `skinHex`. Callers only use this when neither a TDM team colour nor the
  // viewer's enemy highlight applies — those go through setLook and clear it.
  wearDye(dye: DyeDef | null, skinHex: string): void {
    if (!dye) {
      this.setLook(skinHex, 'natural');
      return;
    }
    this.setLook(dye.a, 'natural');
    this.dye = dye;
    const u = this.uniforms;
    u.uDyeP.value.set(DYE_MODE[dye.pattern], dye.speed ?? 1, dye.scale ?? 1, 0);
    u.uDyeA.value.set(dye.a);
    u.uDyeB.value.set(dye.b ?? dye.a);
    u.uDyeC.value.set(dye.c ?? dye.b ?? dye.a);
    if (dye.finish === 'matte') u.uDyeF.value.set(0.8, 0.04);
    else if (dye.finish === 'metal') u.uDyeF.value.set(0.26, 0.92);
    // Dark / glowing patterns: a stronger, lighter rim + visor so the
    // silhouette reads at least as well as a natural skin.
    switch (dye.pattern) {
      case 'void':
      case 'horizon':
        u.uRim.value.set(dye.b ?? '#e8f0ff').lerp(WHITE, 0.5).multiplyScalar(1.3);
        u.uRimStr.value = 1.25;
        u.uVisorEdge.value.set(dye.b ?? '#e8f0ff').multiplyScalar(2.2);
        break;
      case 'spectre':
      case 'hologram':
        u.uRim.value.set(dye.a).multiplyScalar(1.3);
        u.uRimStr.value = 1.3;
        break;
      case 'magma':
      case 'circuit':
      case 'nebula':
        u.uRim.value.set(dye.b ?? dye.a).lerp(WHITE, 0.2).multiplyScalar(1.3);
        u.uRimStr.value = 1.6;
        u.uVisorEdge.value.set(dye.b ?? dye.a).multiplyScalar(2.2);
        break;
      case 'chroma':
        u.uRim.value.set('#ffffff').multiplyScalar(1.1);
        break;
    }
  }

  get dyeId(): string | null {
    return this.dye?.id ?? null;
  }

  setCrestHidden(hidden: boolean): void {
    this.rig.boneScale[B.crest] = hidden ? 0.0001 : 1;
  }

  getColor(out: THREE.Color): THREE.Color {
    return out.copy(this.color);
  }

  get lookMode(): LookMode {
    return this.mode;
  }

  // Gib heat: glowing seams/silhouette in `color` (energy discharge on death).
  setGlow(v: number, color?: THREE.Color): void {
    this.uniforms.uGlow.value = v;
    if (color) this.uniforms.uGlowCol.value.copy(color);
  }

  // Gib char: 0 = clean paint … 1 = scorched plates.
  setBurn(v: number): void {
    this.uniforms.uBurn.value = v;
  }

  // Back to a living body: clears every death-animation look (glow, char,
  // dissolve, ash, crystal, derez bands, overload veins, rainbow).
  resetDeathLook(): void {
    resetDeathLook(this.uniforms);
  }

  // Project the current canonical deformation into the legacy logical frame.
  // These matrices do not participate in live skinning.
  syncRigFacade(): void {
    if (this.rig.frozen) return;
    this.root.updateWorldMatrix(true, true);
    const invRoot = this.invRoot.copy(this.root.matrixWorld).invert();
    const matrix = this.facadeMatrix, restTranslation = this.restTranslation;
    const p = this.facadePosition, q = this.facadeQuaternion, scale = this.facadeScale;
    for (let i = 0; i < this.rig.bones.length; i++) {
      const bone = this.canonicalBones.get(canonicalBoneName(i));
      const inverse = this.restInverse.get(i);
      if (!bone || !inverse) continue;
      matrix.copy(invRoot).multiply(bone.matrixWorld).multiply(inverse);
      restTranslation.makeTranslation(...REST_ABS[i]);
      matrix.multiply(restTranslation);
      this.rig.bones[i].matrix.copy(matrix);
      this.rig.bones[i].matrixWorldNeedsUpdate = true;
      matrix.decompose(p, q, scale);
      p.toArray(this.rig.mp, i * 3); q.toArray(this.rig.mq, i * 4);
    }
    this.root.updateWorldMatrix(false, true);
  }

  beginBreakup(): void {
    this.syncRigFacade();
    this.modelContainer.visible = false;
    this.breakupMesh.visible = true;
  }
  endBreakup(): void {
    this.modelContainer.visible = true;
    this.breakupMesh.visible = false;
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.material.dispose();
    this.windowMaterial.dispose();
    this.rig.skeleton.dispose();
    this.mesh.skeleton.dispose();
  }
}
