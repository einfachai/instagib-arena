import * as THREE from 'three';
import type { RailgunFinish } from '../cosmetics';
import { RAIL_COOLDOWN } from '../constants';
import { nowMs } from '../fx/rail-state';
import { fxFlags } from '../fx/fx-settings';
import '../gun/custom/load';
import { customGun } from '../gun/custom/registry';
import { makeTicker } from '../gun/custom/ticker';
import type { CustomGunInstance } from '../gun/custom/types';
import { SheenOverlay, festiveKit } from '../gun/gun-extras';
import { buildR01 } from '../gun/r01';
import { STOCK_FINISH, gunFx } from '../gun/gun-material';
import type { Character } from './character';

// R-01 and custom cosmetic instances share cached geometry; animation state
// and energy materials belong to each player. Four base draws per R-01
// (three rigid assemblies + a render ticker), plus the brief muzzle flare.

// World size of the third-person gun (~0.8 m in hand).
export const GUN_SCALE = 0.6;
// The model's palm point is ~(0, -0.12, 0.09) in gun space; seat it on the
// socket (the palm centre), i.e. the gun origin sits up/forward of the palm.
const GUN_IN_SOCKET = new THREE.Vector3(0, 0.12 * GUN_SCALE, -0.09 * GUN_SCALE);
const R01_IN_SOCKET = new THREE.Vector3(0, 0.12 * GUN_SCALE, -0.128 * GUN_SCALE);

// Weapon grip anchors in the aim frame, relative to the chest; −Z runs
// along the barrel. The animator offsets the padded palms from these anchors
// before solving the wrists.
export const HOLD = {
  grip: new THREE.Vector3(0.18, 0.105, -0.27),
  support: new THREE.Vector3(0.118, 0.122, -0.44),
};
// Derive the fore-end from the exported gun anchors and the same mount
// transform used to display it, so moving the hold cannot detach the hand.
const R01_SUPPORT = HOLD.grip.clone().add(R01_IN_SOCKET).addScaledVector(new THREE.Vector3(0, -0.038, -0.37), GUN_SCALE);
// Palm offset from the wrist in the hand bone's frame (= the gun socket).
export const PALM_OFFSET = new THREE.Vector3(0, -0.065, -0.012);

export function gunSupportHold(socket: THREE.Object3D): THREE.Vector3 {
  const gun = socket.children.find((child) => child instanceof AttachedRailgun);
  return gun instanceof AttachedRailgun && gun.modelKey === null ? R01_SUPPORT : HOLD.support;
}

const EXTERNAL_LAPSE_MS = 1500;

// ── Claw flare ──────────────────────────────────────────────────────────────
// The shot cue on a third-person gun: a small camera-facing ring on the muzzle
// claw in the shooter's rail colour — ≤ 0.2 m across its radius, gone in
// ~90 ms, bright enough to catch the eye but too small to bloom over the
// shooter. Hidden (not drawn) between shots.
const CLAW_RADIUS = 0.2; // m
const CLAW_LIFE = 0.09; // s
let clawGeo: THREE.PlaneGeometry | null = null;
const CLAW_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vQ;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vQ = position.xy;
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}
`;
const CLAW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uK;
varying vec2 vQ;
void main() {
  float r = length(vQ);
  if (r > 1.0 || uK <= 0.0) discard;
  float ring = exp(-pow((r - 0.55) / 0.14, 2.0));
  float core = exp(-r * r * 16.0);
  vec3 c = uColor * (ring * 1.5 + core * 2.0) * uK * (1.0 - r);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

// The gun attached to a combatant. A THREE.Group (callers that just hold it
// keep working) with drive hooks for remotes/bots.
export class AttachedRailgun extends THREE.Group {
  private instance: CustomGunInstance | null = null;
  private key: string | null = null;
  private readonly claw: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly clawK = { value: 0 };
  private readonly rail = { value: new THREE.Color() };
  private hasRail = false;
  private fireMs = -1e9;
  private charge = 1;
  private chargeMs = -1e9;
  private tickMs = 0;
  private streak = 0;
  private sheen: SheenOverlay | null = null;
  private sheenId: string | null = null;
  private sheenPro = false;
  private festive: THREE.Mesh | null = null;
  private mounted = false;

  constructor(finish?: RailgunFinish) {
    super();
    this.name = 'railgun-3p';
    clawGeo ??= new THREE.PlaneGeometry(2, 2);
    this.claw = new THREE.Mesh(clawGeo, new THREE.ShaderMaterial({
      uniforms: { uColor: this.rail, uK: this.clawK, uSize: { value: CLAW_RADIUS } },
      vertexShader: CLAW_VERT, fragmentShader: CLAW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.claw.name = 'railgun-3p-claw';
    this.claw.userData.shared = true;
    this.claw.frustumCulled = false;
    this.claw.visible = false;
    this.claw.renderOrder = 2;
    const ticker = makeTicker(() => this.drive(nowMs()));
    ticker.renderOrder = -100;
    this.add(ticker);
    this.setFinish(finish);
  }

  setFinish(finish?: RailgunFinish) {
    const f = finish ?? STOCK_FINISH;
    const custom = customGun(f.model);
    const key = custom ? (f.model ?? null) : null;
    if (!this.instance || key !== this.key) {
      this.sheen?.dispose(); this.sheen = null;
      this.claw.removeFromParent();
      this.instance?.dispose(); this.instance?.group.removeFromParent();
      this.instance = (custom ?? buildR01)({ lod: 'low', finish: f });
      this.key = key;
      if (this.festive) { this.setFestive(false); this.setFestive(true); }
      this.add(this.instance.group);
      this.instance.muzzle.add(this.claw);
      this.claw.position.set(0, 0, -0.002);
      this.fireMs = -1e9; this.charge = 1; this.chargeMs = -1e9;
      if (this.sheenId) this.ensureSheen();
    } else this.instance.setFinish?.(f);
    if (this.mounted) this.position.copy(this.key === null ? R01_IN_SOCKET : GUN_IN_SOCKET);
    if (!this.hasRail) this.rail.value.setHex(f.accentHot);
    this.drive(nowMs());
  }

  get modelKey(): string | null { return this.key; }
  mount(socket: THREE.Object3D) {
    this.mounted = true;
    this.scale.setScalar(GUN_SCALE);
    this.position.copy(this.key === null ? R01_IN_SOCKET : GUN_IN_SOCKET);
    socket.add(this);
  }
  setStreak(n: number) {
    this.streak = Number.isFinite(n) ? n : 0;
    if (this.streak >= 5 && this.sheenId) this.ensureSheen();
    this.sheen?.setStreak(this.streak);
  }
  setKillstreak(sheen: string | null, ksEffect: string | null) {
    this.sheenId = sheen; this.sheenPro = !!ksEffect;
    if (sheen) this.ensureSheen();
    this.sheen?.set(sheen, this.sheenPro);
  }
  private ensureSheen() {
    if (this.sheen || !this.instance) return;
    const meshes: THREE.Mesh[] = [];
    this.instance.group.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
    this.sheen = new SheenOverlay(this, meshes, 0.75);
    this.sheen.set(this.sheenId, this.sheenPro);
    this.sheen.setStreak(this.streak);
  }
  setFestive(on: boolean) {
    if (on && !this.festive) { this.festive = festiveKit(this.key === null); this.add(this.festive); }
    else if (!on && this.festive) { this.festive.removeFromParent(); this.festive = null; }
  }
  notifyFire(railColor?: number) {
    this.fireMs = nowMs();
    this.chargeMs = -1e9;
    if (railColor !== undefined) { this.hasRail = true; this.rail.value.setHex(railColor); }
    this.drive(this.fireMs);
  }
  setCharge(charge: number) {
    this.charge = Number.isFinite(charge) ? THREE.MathUtils.clamp(charge, 0, 1) : 1;
    this.chargeMs = nowMs();
    this.drive(this.chargeMs);
  }
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.updateWorldMatrix(true, true);
    return this.instance!.muzzle.getWorldPosition(out);
  }
  private drive(now: number) {
    if (!this.instance) return;
    const since = (now - this.fireMs) / 1000;
    const explicit = now - this.chargeMs < EXTERNAL_LAPSE_MS;
    const charge = explicit ? this.charge : THREE.MathUtils.clamp(since / RAIL_COOLDOWN, 0, 1);
    const dt = THREE.MathUtils.clamp((now - this.tickMs) / 1000, 0, 0.1);
    this.tickMs = now;
    this.instance.update(dt, { charge, firing: explicit ? Math.max(0, 1 - charge * RAIL_COOLDOWN / 0.25) : Math.max(0, 1 - since / 0.25), streak: this.streak, reduced: gunFx.reduced, lowSpec: fxFlags.low });
    const age = explicit ? charge * RAIL_COOLDOWN : since;
    const k = age >= 0 && age < CLAW_LIFE && !gunFx.reduced ? Math.exp(-age * 22) : 0;
    this.clawK.value = k; this.claw.visible = k > 0;
  }
  dispose() {
    this.removeFromParent(); this.sheen?.dispose(); this.sheen = null;
    this.festive?.removeFromParent(); this.instance?.dispose(); this.instance = null;
    this.claw.material.dispose();
  }
}

export function attachRailgun(ch: Character, finish?: RailgunFinish): AttachedRailgun {
  const g = new AttachedRailgun(finish);
  g.mount(ch.sockets.gun);
  return g;
}

export function disposeRailgun(g: THREE.Object3D | null): void {
  if (!g) return;
  if (g instanceof AttachedRailgun) {
    g.dispose();
    return;
  }
  g.parent?.remove(g);
}
