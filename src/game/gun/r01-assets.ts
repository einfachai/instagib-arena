import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

export type R01Assets = {
  high: GLTF;
  low: GLTF;
  detail: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
};
let assets: R01Assets | null = null;
let pending: Promise<R01Assets> | null = null;
const base = '/models/railgun-r01/';

// The injectable texture loader lets CPU tests exercise the real exported GLBs.
export function preloadR01Assets(loadTexture = (url: string) => new THREE.TextureLoader().loadAsync(url)): Promise<R01Assets> {
  if (assets) return Promise.resolve(assets);
  if (pending) return pending;
  pending = (async () => {
    const loader = new GLTFLoader();
    const [high, low, detail, normal, roughness] = await Promise.all([
      loader.loadAsync(base + 'high.glb'), loader.loadAsync(base + 'low.glb'),
      loadTexture(base + 'detail.png'), loadTexture(base + 'normal.png'), loadTexture(base + 'roughness.png'),
    ]);
    for (const gltf of [high, low]) {
      const clip = gltf.animations.find((c) => c.name === 'shot_cycle');
      if (!clip || Math.abs(clip.duration - 1.2) > 0.001) throw new Error('Invalid R-01 shot cycle.');
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const g = o.geometry;
        if (!g.hasAttribute('_gun') || !g.hasAttribute('_r01') || !g.hasAttribute('uv')) throw new Error('Invalid R-01 surface attributes.');
        g.setAttribute('gun', g.getAttribute('_gun'));
        g.deleteAttribute('_gun');
        g.userData.shared = true;
        o.userData.shared = true;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
    }
    detail.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [detail, normal, roughness]) {
      texture.flipY = false;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.userData.shared = true;
    }
    assets = { high, low, detail, normal, roughness };
    return assets;
  })().catch((error: unknown) => { pending = null; throw error; });
  return pending;
}

export function r01Assets(): R01Assets {
  if (!assets) throw new Error('Preload the R-01 assets before building a railgun.');
  return assets;
}
