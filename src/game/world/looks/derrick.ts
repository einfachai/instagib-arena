import { DERRICK } from '../../maps/derrick';
import { baseFacility, surface, facilityLights, stationSkyline } from '../futuristic-kit';
export const RUSTDUSK = baseFacility(DERRICK,'extraction',{
  floor:surface('regolith',6),wall:surface('ceramic',4),ceiling:surface('steel',4),
  platform:surface('grate',2),cover:surface('steel',3),tower:surface('titanium',3),
});
RUSTDUSK.tintFor = (_i,b) => b.tag==='chamber' ? 0xe1c5a6 : b.tag==='machine' ? 0xaf9e8c : b.tag==='drill' ? 0xc3a286 : null;
RUSTDUSK.lights=facilityLights(DERRICK,0xffd2a2,0xedac6d);
RUSTDUSK.sun.color=0xffe0b8; RUSTDUSK.fill.color=0xb7c8d6;
RUSTDUSK.bake.ambientUp=0xd9c6ab; RUSTDUSK.bake.ambientDown=0x8b786a;
RUSTDUSK.sky={mode:'dusk',top:0x726780,mid:0xc89879,horizon:0xe1bb8e,ground:0x9b7157,
  sunColor:0xffe2b8,sunSize:0.028,sunGlow:0.55,band:0.25,
  planet:{dir:[0.5,0.42,-0.76],size:0.13,color:0xbdb3a7}};
RUSTDUSK.fog={color:0xe1bb8e,near:90,far:330}; RUSTDUSK.background=0xe1bb8e;
RUSTDUSK.skyline=stationSkyline(0xa38b74,0xe8b37f,34,29);
