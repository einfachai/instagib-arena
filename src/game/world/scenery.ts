import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArenaMap } from '../arena-map-data';

// Large props stay beyond the collision boundary. In-arena displays are flush.
export function buildScenery(map: ArenaMap, id: string, low: boolean): THREE.Group {
  const group=new THREE.Group(); group.name='map:scenery';
  const solid:THREE.BufferGeometry[]=[], lamps:THREE.BufferGeometry[]=[];
  const add=(g:THREE.BufferGeometry,x:number,y:number,z:number,s:THREE.BufferGeometry[]=solid)=>{g.translate(x,y,z);s.push(g);};
  if(id==='containeryard') {
    for(const [x,y,z] of [[-54,15,-47],[57,10,4]]) {
      const hull=new THREE.ConeGeometry(6,25,4,1); hull.rotateX(-Math.PI/2); hull.scale(1,.5,1);
      add(hull,x,y,z); add(new THREE.BoxGeometry(23,.7,9),x,y,z+4);
      for(const dx of [-7,7]) {
        const engine=new THREE.CylinderGeometry(1.8,2.2,8,low?8:16); engine.rotateX(Math.PI/2); add(engine,x+dx,y,z+9);
        const glow=new THREE.CylinderGeometry(1.45,1.45,.12,12); glow.rotateX(Math.PI/2); add(glow,x+dx,y,z+13.1,lamps);
      }
      add(new THREE.BoxGeometry(3,2,5),x,y+2,z-4);
    }
  } else if(id==='causeway') {
    for(const x of [-67,67]) {
      const ring=new THREE.TorusGeometry(14,1.2,8,low?24:48); add(ring,x,12,-64);
      add(new THREE.BoxGeometry(9,18,12),x,5,-72);
      for(const dx of [-9,9]) add(new THREE.BoxGeometry(1,16,1),x+dx,12,-63,lamps);
    }
  } else if(id==='derrick') {
    for(let i=0;i<(low?16:30);i++) {
      const a=i*2.399, r=60+(i%5)*9, h=5+(i%4)*6;
      const g=new THREE.IcosahedronGeometry(1,low?1:3);
      const vertices=g.getAttribute('position');
      for(let v=0;v<vertices.count;v++) {
        const x=vertices.getX(v),y=vertices.getY(v),z=vertices.getZ(v);
        const shape=1+.12*Math.sin(x*4.7+y*2.1+i)+.08*Math.cos(z*5.3-y*3.4);
        vertices.setXYZ(v,x*shape,y*shape,z*shape);
      }
      g.scale(6+(i%3)*4,h,8); g.rotateY(a);
      add(g,Math.cos(a)*r,h*.3-4,Math.sin(a)*r);
    }
  }
  for(const [geos,color,glow] of [[solid,id==='derrick'?0x967757:0x7792a7,false],[lamps,id==='containeryard'?0x81caf8:0x70d3e7,true]] as const) {
    if(!geos.length) continue;
    const geometry=mergeGeometries(geos,false); geos.forEach(g=>g.dispose()); if(!geometry)continue;
    const material=glow?new THREE.MeshBasicMaterial({color}):new THREE.MeshStandardMaterial({color,roughness:.65,metalness:id==='derrick'?0:.7});
    const mesh=new THREE.Mesh(geometry,material); mesh.userData.map=true; mesh.userData.surface='trim';mesh.userData.noShadow=true; group.add(mesh);
    if(id==='derrick' && !glow) {
      mesh.userData.assetSlot='floor';
      material.color.setHex(0xc7b39b);
      const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
      for(let v=0;v<positions.count;v++) {
        const nx=Math.abs(normals.getX(v)),ny=Math.abs(normals.getY(v)),nz=Math.abs(normals.getZ(v));
        const u=nx>ny&&nx>nz?positions.getZ(v):positions.getX(v);
        const w=ny>nx&&ny>nz?positions.getZ(v):positions.getY(v);
        uv.setXY(v,u/6,w/6);
      }
    }
  }
  const labels:Record<string,[string,string,string]>= {
    causeway:['ORBITAL // 07','TRANSFER HANGAR','hangar'],reactor:['FUSION // 02','CORE ACCESS','divider'],
    containeryard:['SPACEPORT // 09','BOARDING • CARGO','cargo'],derrick:['EXTRACTION // 04','DRILL CONTROL','chamber'],training:['RESEARCH // 01','CALIBRATION LAB','spine'],
  };
  const [title,subtitle,tag]=labels[id]??labels.training;
  const box=map.boxes.find(b=>b.tag===tag && b.max.x-b.min.x>3 && b.max.y-b.min.y>2);
  if(box) {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#101e2b';ctx.fillRect(0,0,1024,256);
    ctx.fillStyle=id==='containeryard'?'#fba5e7':id==='derrick'?'#ffbf71':'#a9e5fa';ctx.fillRect(24,26,7,205);
    ctx.font='bold 52px monospace';ctx.fillText(title,55,96);ctx.font='28px monospace';ctx.fillText(subtitle,55,161);
    ctx.font='18px monospace';ctx.fillText('AUTHORIZED PERSONNEL   →   SECTOR '+(map.revision??1),55,216);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture});material.addEventListener('dispose',()=>texture.dispose());
    const width=Math.min(3.6,box.max.x-box.min.x-.3);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),material);
    mesh.position.set((box.min.x+box.max.x)/2,Math.min(box.max.y-.7,box.min.y+2.2),box.max.z+.015);
    mesh.userData.map=true;mesh.userData.surface='trim';mesh.userData.noShadow=true;group.add(mesh);
    if(id==='training') {
      // Blue glass inspection display, mounted on the original research wall.
      const display=document.createElement('canvas');display.width=1024;display.height=512;
      const c=display.getContext('2d')!;c.fillStyle='#071f34';c.fillRect(0,0,1024,512);
      c.strokeStyle='#467398';c.lineWidth=2;
      for(let x=32;x<1024;x+=64){c.beginPath();c.moveTo(x,96);c.lineTo(x,464);c.stroke();}
      for(let y=96;y<464;y+=48){c.beginPath();c.moveTo(32,y);c.lineTo(992,y);c.stroke();}
      c.strokeStyle='#6bddff';c.lineWidth=5;c.beginPath();
      for(let x=32;x<992;x+=8){const y=265+Math.sin(x*.024)*58+Math.sin(x*.008)*30;if(x===32)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();
      c.fillStyle='#b2ecff';c.font='bold 34px monospace';c.fillText('R&D // MOTION CALIBRATION',32,58);
      const tex=new THREE.CanvasTexture(display);tex.colorSpace=THREE.SRGBColorSpace;
      const glass=new THREE.MeshPhysicalMaterial({map:tex,color:0xcbe9ff,roughness:.14,metalness:.08,clearcoat:1,clearcoatRoughness:.08});
      glass.addEventListener('dispose',()=>tex.dispose());
      const screen=new THREE.Mesh(new THREE.PlaneGeometry(width,width/2),glass);
      screen.position.set(mesh.position.x,mesh.position.y+2,box.max.z+.025);
      screen.userData.map=true;screen.userData.surface='trim';screen.userData.noShadow=true;group.add(screen);
    }
  }
  return group;
}
