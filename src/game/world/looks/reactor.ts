import { REACTOR as MAP } from '../../maps/reactor';
import { baseFacility, surface, facilityLights } from '../futuristic-kit';
export const REACTOR = baseFacility(MAP,'fusion',{
  floor:surface('concrete',6),wall:surface('steel',4),ceiling:surface('steel',6),
  platform:surface('grate',2),cover:surface('steel',3),tower:surface('titanium',3),
});
REACTOR.tintFor = (_i,b) => b.tag==='machine' ? 0xb5c0bd : b.tag==='core' ? 0x85b3ad : b.tag==='divider' ? 0xb4bac0 : null;
REACTOR.lights=facilityLights(MAP,0xffd3a0,0x81d9c1);
REACTOR.dress={...REACTOR.dress,beams:{spacing:9,w:0.6,d:0.12},tint:0xaeb7bc};
REACTOR.bake.ambientUp=0xc0c7be; REACTOR.bake.ambientDown=0x737b79;
REACTOR.sun.color=0xffe3bc; REACTOR.sun.intensity=1.6;
REACTOR.fill.color=0xb2d0c9; REACTOR.exposure=1.12;
REACTOR.sky={mode:'interior',top:0x62716f,horizon:0x62716f};
REACTOR.fog={color:0x62716f,near:120,far:450};
