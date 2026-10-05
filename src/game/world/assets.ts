import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MAPS } from '../arena-map-data';
import type { SurfaceKind, SurfaceTextures } from '../textures';
import type { WorldTheme } from './theme-kit';
import { ResourceCache } from './resource-cache';

export type MapAssetDescriptor = { id: string; revision: number; quality: '2k' | '1k'; surfaces: NonNullable<WorldTheme['assets']> };
type Pack = Partial<Record<SurfaceKind, SurfaceTextures>>;
type Binding = { descriptor: MapAssetDescriptor; renderer: THREE.WebGLRenderer; generation: number; prefetch?: (low:boolean)=>void; release?: () => void; materials: Map<THREE.MeshStandardMaterial, { slot: SurfaceKind; fallback: SurfaceTextures }> };
const bindings = new WeakMap<THREE.Group, Binding>();
const runtimes = new WeakMap<THREE.WebGLRenderer, { loader: KTX2Loader; cache: ResourceCache<Pack>; descriptors: Map<string, MapAssetDescriptor> }>();
const keyFor = (d: MapAssetDescriptor) => `${d.id}@${d.revision}:${d.quality}`;

function runtime(renderer: THREE.WebGLRenderer) {
  let rt = runtimes.get(renderer);
  if (rt) return rt;
  const loader = new KTX2Loader().setTranscoderPath('/textures/basis/').setWorkerLimit(2).detectSupport(renderer);
  const descriptors = new Map<string, MapAssetDescriptor>();
  const destroy = (pack: Pack) => {
    const unique = new Set<THREE.Texture>();
    for (const t of Object.values(pack)) { unique.add(t.map); unique.add(t.normalMap); unique.add(t.orm); }
    unique.forEach(t => t.dispose());
  };
  const cache = new ResourceCache<Pack>(async key => {
    const descriptor = descriptors.get(key)!;
    const size = descriptor.quality === '1k' ? 1024 : 2048;
    const unique = new Map<string, Promise<SurfaceTextures>>();
    const loaded = new Set<THREE.Texture>();
    const surface = (material: string, tile: number) => {
      let pending = unique.get(material);
      if (!pending) {
        pending = Promise.allSettled(['color', 'normal', 'orm'].map(async channel => {
          // KTX2Loader may return one cached texture to concurrent maps. Each
          // pack owns its texture objects; Three shares their source/GPU data.
          const texture = (await loader.loadAsync(`/textures/world/${material}-${size}-${channel}.ktx2`)).clone();
          loaded.add(texture);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = Math.min(descriptor.quality === '1k' ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
          texture.colorSpace = channel === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          return texture;
        })).then(results => {
          if (results.some(result => result.status === 'rejected')) throw new Error('Missing material channel');
          const [map, normalMap, orm] = results.map(result => (result as PromiseFulfilledResult<THREE.CompressedTexture>).value);
          return { map, normalMap, orm, tile };
        });
        unique.set(material, pending);
      }
      return pending;
    };
    // Wait for every channel before disposing a failed pack, including late channels.
    const results = await Promise.allSettled(Object.entries(descriptor.surfaces).map(async ([slot,d]) => [slot, await surface(d.material,d.tile)] as const));
    if (results.some(result => result.status === 'rejected')) {
      // All channel requests have settled, including those that finished after a failure.
      loaded.forEach(texture => texture.dispose());
      throw new Error(`Map materials unavailable: ${key}`);
    }
    return Object.fromEntries(results.map(result => (result as PromiseFulfilledResult<readonly [string, SurfaceTextures]>).value)) as Pack;
  }, destroy, 2);
  rt = { loader, cache, descriptors };
  runtimes.set(renderer, rt);
  return rt;
}

export function disposeMapAssets(renderer: THREE.WebGLRenderer) {
  const rt = runtimes.get(renderer);
  if (!rt) return;
  rt.cache.dispose(); rt.loader.dispose(); rt.descriptors.clear(); runtimes.delete(renderer);
}

export function preloadMapAssets(renderer: THREE.WebGLRenderer, descriptor: MapAssetDescriptor) {
  const rt = runtime(renderer);
  rt.descriptors.set(keyFor(descriptor), descriptor);
  return rt.cache.acquire(keyFor(descriptor));
}

function apply(material: THREE.MeshStandardMaterial, textures: SurfaceTextures) {
  material.map = material.emissiveMap = textures.map;
  material.normalMap = textures.normalMap;
  material.aoMap = material.roughnessMap = material.metalnessMap = textures.orm;
  material.needsUpdate = true;
}

export function releaseMapMesh(group: THREE.Group) {
  const binding = bindings.get(group);
  if (!binding) return;
  binding.generation++;
  binding.release?.(); binding.release = undefined;
}

export function hydrateMapMesh(group: THREE.Group, renderer: THREE.WebGLRenderer, descriptor: MapAssetDescriptor, materials: Binding['materials'], prefetch?: (low:boolean)=>void) {
  releaseMapMesh(group);
  const binding: Binding = { renderer, descriptor, materials, prefetch, generation: 0 };
  bindings.set(group, binding);
  setMapMeshAssetQuality(group, descriptor.quality === '1k');
}

export function setMapMeshAssetQuality(group: THREE.Group, low: boolean) {
  const binding = bindings.get(group);
  if (!binding) return;
  const quality = low ? '1k' : '2k';
  if (binding.release && binding.descriptor.quality === quality) return;
  releaseMapMesh(group);
  binding.descriptor = { ...binding.descriptor, quality };
  for (const [material,{fallback}] of binding.materials) apply(material,fallback);
  const generation = ++binding.generation;
  const lease = preloadMapAssets(binding.renderer, binding.descriptor);
  binding.release = lease.release;
  binding.prefetch?.(low);
  group.userData.assetsStatus = 'loading';
  group.userData.assetQuality = quality;
  group.userData.assetsReady = lease.ready.then(pack => {
    if (bindings.get(group) !== binding || generation !== binding.generation) return;
    for (const [material,{slot}] of binding.materials) if (pack[slot]) apply(material,pack[slot]!);
    group.userData.assetsStatus = 'ready';
  }).catch(() => {
    if (bindings.get(group) !== binding || generation !== binding.generation) return;
    group.userData.assetsStatus = 'fallback';
  });
}

export async function whenMapAssetsReady(group: THREE.Group) {
  let ready: Promise<void> | undefined;
  do { ready=group.userData.assetsReady; await ready; } while(ready!==group.userData.assetsReady);
}

// The next retained map is warmed alongside the current one. No mesh is mutated.
export function warmNextMap(renderer: THREE.WebGLRenderer, id: string, themeFor: (id: string) => WorldTheme, low: boolean) {
  const index = MAPS.findIndex(map => map.id === id);
  const next = MAPS[(index + 1) % MAPS.length];
  const surfaces = themeFor(next.id).assets;
  if (!surfaces) return;
  const lease = preloadMapAssets(renderer,{ id:next.id,revision:next.map.revision ?? 1,quality:low?'1k':'2k',surfaces });
  void lease.ready.catch(() => {}).finally(lease.release);
}
