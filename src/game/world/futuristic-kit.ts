import type { ArenaMap } from '../arena-map-data';
import { panel, type SurfaceKind } from '../textures';
import { defaultSlot, norm, prop, type LightDef, type SkyProp, type WorldTheme } from './theme-kit';

const KINDS: SurfaceKind[] = ['floor', 'wall', 'ceiling', 'platform', 'cover', 'tower'];
export type SurfaceSet = Record<SurfaceKind, { material: string; tile: number }>;
export const surface = (material: string, tile = 4) => ({ material, tile });

// Small deterministic fallback recipes keep loading failures playable. Detailed
// textures are authored offline and never generated on a combat frame.
export function fallbackTextures(assets: SurfaceSet): WorldTheme['textures'] {
  return Object.fromEntries(KINDS.map((kind, i) => [kind, () => panel(
    kind === 'floor' ? 0x9ba4af : 0xc2cbd2, assets[kind].tile,
    { cols: 2, rows: 1, seamHalf: 1, bevel: 2, depth: 2, rough: 0.55, tone: 0.025, seed: 31 + i * 17 },
  )])) as WorldTheme['textures'];
}

// Lamps follow authored collision faces, so a layout edit cannot leave a lamp
// floating at its previous coordinates. Reject buried faces and thin steps.
export function facilityLights(map: ArenaMap, primary: number, secondary: number): LightDef[] {
  const out: LightDef[] = [];
  const blocked = (x: number, y: number, z: number, self: number) => map.boxes.some((b, i) =>
    i !== self && i !== 1 && x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z);
  for (let i = 6; i < map.boxes.length; i++) {
    const b = map.boxes[i];
    const h = b.max.y - b.min.y, w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    if (h < 1.8 || b.tag === 'steps') continue;
    const y = b.max.y - Math.min(0.65, h * 0.3), cx = (b.min.x+b.max.x)/2, cz = (b.min.z+b.max.z)/2;
    const faces = [
      { face: '+x' as const, at: [b.max.x,y,cz] as [number,number,number], probe: [b.max.x+0.1,y,cz], len: d },
      { face: '-x' as const, at: [b.min.x,y,cz] as [number,number,number], probe: [b.min.x-0.1,y,cz], len: d },
      { face: '+z' as const, at: [cx,y,b.max.z] as [number,number,number], probe: [cx,y,b.max.z+0.1], len: w },
      { face: '-z' as const, at: [cx,y,b.min.z] as [number,number,number], probe: [cx,y,b.min.z-0.1], len: w },
    ];
    const core = ['core','relay','drill','antenna'].includes(b.tag ?? '');
    for (const f of faces) {
      if (f.len < 1.1 || blocked(f.probe[0],f.probe[1],f.probe[2],i)) continue;
      out.push({ at:f.at, face:f.face, size:[Math.min(4, f.len-0.5),core ? 0.22 : 0.12],
        color:core ? secondary : primary, intensity:core ? 45 : (out.length % 4 === 0 ? 65 : 0),
        range:core ? 16 : 20, out:0.6, radius:0.3, kind:'strip', level:core ? 0.9 : 0.65 });
    }
  }
  if (!map.openTop) {
    for (const x of [-30,0,30]) for (const z of [-20,20]) out.push({
      at:[x,map.boxes[1].min.y,z],face:'-y',size:[4,1.2],color:0xffedcf,
      intensity:220,range:45,out:0.6,radius:0.8,kind:'lamp',level:0.7,
    });
  }
  return out;
}

export function baseFacility(map: ArenaMap, id: string, assets: SurfaceSet): WorldTheme {
  return {
    id, assets, textures:fallbackTextures(assets), openSky:!!map.openTop, perimeterTop:map.openTop?3.5:undefined,
    slots:{ floor:{metalness:1,normalScale:0.65,ao:0.55},wall:{metalness:1,normalScale:0.65,ao:0.6},
      ceiling:{metalness:1,normalScale:0.55,ao:0.5},platform:{metalness:1,normalScale:0.75,ao:0.6},
      cover:{metalness:1,normalScale:0.7,ao:0.6},tower:{metalness:1,normalScale:0.75,ao:0.55} },
    slotFor:(i,b,k) => {
      if (['core','relay','drill','antenna','support'].includes(b.tag ?? '')) return 'tower';
      if (['cargo','machine','service','core-base'].includes(b.tag ?? '')) return 'cover';
      if (['deck','gallery','gantry','bridge','control','apex','boarding','apron','roof','dais'].includes(b.tag ?? '')) return 'platform';
      if (['hangar','divider','chamber'].includes(b.tag ?? '')) return 'wall';
      return defaultSlot(i,b,k);
    },
    trim:null,
    dress:{slot:'tower',tint:0xc9d5df,bright:1.12,baseboard:{h:0.3,d:0.06},
      edges:{h:0.12,d:0.035},crown:{h:0.24,d:0.07},collars:{h:0.25,d:0.07},
      panels:{spacing:3,vents:true,conduits:true}},
    lights:facilityLights(map,0xc5e7f3,map.accent ?? 0x70cddd),
    bake:{ambientUp:0xb6c8d4,ambientDown:0x7b8790,ambient:0.36,
      sky:map.openTop ? {color:0xb4cbdc,intensity:0.5} : null,
      ao:{radius:2.2,strength:0.7},sunShadow:true,sunIgnorePerimeter:true,
      sunIgnoreCeiling:!map.openTop,texel:0.55,maxTexels:160_000},
    sun:{dir:norm([-0.5,0.85,0.35]),color:0xfff3e7,intensity:2.3,mapScale:0.9},
    hemi:{sky:0xaebdd2,ground:0x596572,intensity:0.65,mapScale:0.22},
    fill:{dir:norm([0.7,0.3,-0.65]),color:0xb4dbf7,intensity:0.6,mapScale:0.35},
    env:{intensity:0.7,mapScale:0.7},worldSaturation:0.88,satCap:0.55,
    exposure:1.05,fog:{color:0x96b5cd,near:100,far:380},background:0x96b5cd,
    shadowBox:100,sky:{mode:'lab',top:0x668daf,horizon:0xb5cbdc},
  };
}

export function stationSkyline(color: number, accent: number, halfX: number, halfZ: number): SkyProp[] {
  const out: SkyProp[] = [];
  for (const s of [-1,1]) for (let i=0;i<5;i++) {
    const x=s*(halfX+30+i*18), z=-halfZ-35-(i%3)*16, h=12+(i%3)*13;
    out.push(prop(x-6,-5,z-7,x+6,h,z+7,color));
    out.push(prop(x-6,h-0.5,z-7,x+6,h,z+7,0xb0c6d4,accent));
    for(let y=3;y<h-2;y+=4) out.push(prop(x-5,y,z+7.01,x+5,y+0.35,z+7.04,accent));
  }
  return out;
}
