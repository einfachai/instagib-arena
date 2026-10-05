import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAPS, replayMap } from '../src/game/arena-map-data';
import { FFA_MAP_POOL, DUEL_MAP_POOL } from '../src/game/arena-data';
import { decodeReplay, encodeReplay, REPLAY_VERSION, type ReplayData } from '../src/game/replay-codec';
import { ResourceCache } from '../src/game/world/resource-cache';
import { CompressedTexture, type WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { disposeMapAssets, preloadMapAssets } from '../src/game/world/assets';

const recording=(version=REPLAY_VERSION):ReplayData=>({version,hz:20,mapId:'causeway',mapRevision:2,durationMs:1000,localId:'p',won:false,profiles:[{id:'p',name:'Player',kind:'local',hat:'',unusual:'',nameColor:'',team:null}],frames:[{t:0,poses:{p:{x:0,y:1,z:0,yaw:0,pitch:0,visible:true}}}],kills:[],shots:[]});
test('retained roster and exact replay layouts',()=>{
  assert.deepEqual(MAPS.map(m=>m.id),['causeway','reactor','containeryard','derrick','training']);
  assert.deepEqual(FFA_MAP_POOL,['causeway','reactor']);assert.deepEqual(DUEL_MAP_POOL,['containeryard','derrick']);
  for(const id of ['lounge','nuketown','unknown']) assert.equal(replayMap(id,1),null);
  for(const id of [...FFA_MAP_POOL,...DUEL_MAP_POOL]) {
    assert.equal(replayMap(id,1),null);assert.ok(replayMap(id,2));assert.equal(replayMap(id,3),null);
  }
  assert.ok(replayMap('training',1));
});
test('v5 layout revisions round-trip; old formats default to revision 1',()=>{
  assert.equal(REPLAY_VERSION,5);
  for(let version=1;version<=5;version++) {
    const data=decodeReplay(encodeReplay(recording(version)));
    assert.equal(data.mapRevision,version===5?2:1); assert.equal(data.frames.length,1);
    const actors=recording(version);actors.profiles[0].agent='claude';
    assert.equal(decodeReplay(encodeReplay(actors)).profiles[0].agent,version===5?'claude':'codex');
  }
  assert.throws(()=>encodeReplay({...recording(),mapRevision:0}),/invalid map revision/);
});
test('Duel collision geometry and spawns are rotationally symmetric',()=>{
  for(const id of DUEL_MAP_POOL) {
    const map=MAPS.find(m=>m.id===id)!.map;
    const boxKey=(b:typeof map.boxes[number])=>[b.min.x,b.min.y,b.min.z,b.max.x,b.max.y,b.max.z].map(v=>v.toFixed(3)).join(',');
    const keys=new Set(map.boxes.slice(2).map(boxKey));
    // Boundary walls are symmetric too; floors and caps are excluded.
    for(const b of map.boxes.slice(2)) assert.ok(keys.has(boxKey({...b,min:{x:-b.max.x,y:b.min.y,z:-b.max.z},max:{x:-b.min.x,y:b.max.y,z:-b.min.z}})),`${id}: asymmetric box ${boxKey(b)}`);
    for(const p of map.spawns) assert.ok(map.spawns.some(q=>Math.abs(p.x+q.x)<.001&&Math.abs(p.z+q.z)<.001&&p.y===q.y));
  }
});
test('every shipped PBR channel has matching dimensions and a full mip chain',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/textures/world/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.files.length,54);
  for(const file of manifest.files) {
    const bytes=readFileSync(new URL(`../public/textures/world/${file.file}`,import.meta.url));
    assert.equal(bytes.readUInt32LE(20),file.size);assert.equal(bytes.readUInt32LE(24),file.size);
    assert.equal(bytes.readUInt32LE(40),Math.log2(file.size)+1);
    assert.equal(bytes.byteLength,file.bytes);
  }
});
test('cache preserves leased active resources and evicts late idle loads safely',async()=>{
  const destroyed:string[]=[];
  const resolvers=new Map<string,(value:string)=>void>();
  const cache=new ResourceCache<string>(key=>new Promise(resolve=>resolvers.set(key,resolve)),value=>destroyed.push(value),2);
  const active=cache.acquire('active@2:2k'),next=cache.acquire('next@2:2k');
  resolvers.get('active@2:2k')!('active');await active.ready;
  next.release();
  const switched=cache.acquire('next@2:1k');
  resolvers.get('next@2:2k')!('late');await next.ready;
  assert.deepEqual(destroyed,['late']);assert.equal(cache.size,2);
  resolvers.get('next@2:1k')!('low');await switched.ready;
  active.release();active.release();switched.release();cache.dispose();
  assert.deepEqual(destroyed,['late','active','low']);
});
test('failed loads can be retried without poisoning the cache',async()=>{
  let attempt=0;
  const cache=new ResourceCache<string>(async()=>{if(++attempt===1)throw Error('missing');return 'ready';},()=>{});
  const first=cache.acquire('map');await assert.rejects(first.ready,/missing/);first.release();
  const retry=cache.acquire('map');assert.equal(await retry.ready,'ready');retry.release();cache.dispose();
});
test('evicting a prefetched pack does not dispose textures held by another map',async()=>{
  const original=KTX2Loader.prototype.loadAsync;
  const channels=['color','normal','orm'].map(()=>new CompressedTexture([{data:new Uint8Array(16),width:4,height:4}],4,4));
  KTX2Loader.prototype.loadAsync=async(url:string)=>channels[url.includes('-color.')?0:url.includes('-normal.')?1:2];
  const renderer={extensions:{has:()=>false},capabilities:{getMaxAnisotropy:()=>8}} as unknown as WebGLRenderer;
  const surfaces=Object.fromEntries(['floor','wall','ceiling','platform','cover','tower'].map(slot=>[slot,{material:'shared',tile:4}])) as Parameters<typeof preloadMapAssets>[1]['surfaces'];
  try {
    const a=preloadMapAssets(renderer,{id:'a',revision:2,quality:'2k',surfaces});
    const b=preloadMapAssets(renderer,{id:'b',revision:2,quality:'2k',surfaces});
    const [first,active]=await Promise.all([a.ready,b.ready]);
    assert.notEqual(first.floor!.map,active.floor!.map);
    assert.equal(first.floor!.map.source,active.floor!.map.source);
    let activeDisposals=0;
    for(const texture of [active.floor!.map,active.floor!.normalMap,active.floor!.orm])texture.addEventListener('dispose',()=>activeDisposals++);
    a.release();
    const next=preloadMapAssets(renderer,{id:'c',revision:2,quality:'2k',surfaces});await next.ready;
    assert.equal(activeDisposals,0);
    b.release();next.release();disposeMapAssets(renderer);
    assert.equal(activeDisposals,3);
  } finally {KTX2Loader.prototype.loadAsync=original;disposeMapAssets(renderer);}
});
