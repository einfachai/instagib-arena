import { CONTAINERYARD } from '../../maps/containeryard';
import { baseFacility, surface, facilityLights, stationSkyline } from '../futuristic-kit';
export const NIGHTPORT = baseFacility(CONTAINERYARD,'spaceport',{
  floor:surface('wetplate',6),wall:surface('steel',4),ceiling:surface('steel',4),
  platform:surface('grate',2),cover:surface('cargo',3),tower:surface('titanium',3),
});
NIGHTPORT.tintFor = (_i,b) => b.tag==='cargo' ? ((b.min.x+b.max.x)>0 ? 0x809bbd : 0xb89daa) : null;
NIGHTPORT.lights=facilityLights(CONTAINERYARD,0x93c9ec,0xea9bd0);
NIGHTPORT.sun.color=0xc6d9fa; NIGHTPORT.sun.intensity=1.65;
NIGHTPORT.fill.color=0xe6b3ce; NIGHTPORT.fill.intensity=0.5;
NIGHTPORT.bake.ambientUp=0xabb5d1; NIGHTPORT.bake.ambient=0.4;
NIGHTPORT.exposure=1.15; NIGHTPORT.perimeterTop=3.2;
NIGHTPORT.sky={mode:'night',top:0x17233d,horizon:0x566080,glow:0x293149,stars:0.25};
NIGHTPORT.fog={color:0x566080,near:75,far:290}; NIGHTPORT.background=0x17233d;
NIGHTPORT.skyline=stationSkyline(0x415069,0xa792c5,34,29);
