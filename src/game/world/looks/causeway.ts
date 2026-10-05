import { CAUSEWAY } from '../../maps/causeway';
import { baseFacility, surface, stationSkyline } from '../futuristic-kit';
export const VOID = baseFacility(CAUSEWAY,'orbital',{
  floor:surface('titanium',6),wall:surface('ceramic',4),ceiling:surface('steel',4),
  platform:surface('titanium',4),cover:surface('cargo',3),tower:surface('steel',3),
});
VOID.tintFor = (_i,b) => b.tag==='cargo' ? 0x8ea7ba : b.tag==='relay' ? 0x93a8b7 : null;
VOID.lights = VOID.lights.map(l => ({...l,color:l.intensity>0 ? 0xcdeaf2 : 0x78c9df}));
VOID.sky = {mode:'space',top:0x070e20,horizon:0x34465e,nebula:[0x25415b,0x252f5a,0x304560],stars:0.7,
  planet:{dir:[-0.6,0.35,-0.72],size:0.3,color:0x87aeca}};
VOID.fog = {color:0x34465e,near:130,far:430};
VOID.background = 0x070e20;
VOID.skyline = stationSkyline(0x536779,0x68bdd0,48,36);
