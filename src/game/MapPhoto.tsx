import { useEffect, useRef, useState } from 'react';
import { Game } from './game';
import { MAPS } from './arena-map-data';

// Development-only entry: direct, offline, without menu or account side effects.
const query = new URLSearchParams(window.location.search);
type View = 'wide' | 'surface' | 'combat';
const poses: Record<string, Record<View, number[]>> = {
  causeway: {wide:[.86,-.3,42,18,31],surface:[-1.57,0,17,0.3,13],combat:[2.5,-.05,13,0.05,-17]},
  reactor: {wide:[.88,-.28,41,17,30],surface:[0,-.12,24,.05,-8],combat:[.6,-.06,26,.05,-5]},
  containeryard: {wide:[.85,-.3,31,16,26],surface:[0,-.1,19,.05,-7],combat:[.4,-.03,13,.05,22]},
  derrick: {wide:[.86,-.3,31,16,26],surface:[0,0,24,.05,-4],combat:[-.6,-.05,-28.5,.05,-23]},
  training: {wide:[.7,-.24,52,25,37],surface:[-1.57,-.05,-11,.05,12],combat:[0,0,-34,.05,18.5]},
};
export default function MapPhoto() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [map,setMap]=useState(MAPS.some(m=>m.id===query.get('map'))?query.get('map')!:'causeway');
  const [low,setLow]=useState(query.get('quality')==='low');
  const [view,setView]=useState<View>(['surface','combat'].includes(query.get('view')??'')?query.get('view') as View:'wide');
  const [status,setStatus]=useState('Preparing');
  const [metrics,setMetrics]=useState('');
  const [showControls,setShowControls]=useState(true);
  const [play,setPlay]=useState(false);
  const gameRef=useRef<Game|null>(null);
  const selection=useRef({map,low,view,play}); selection.current={map,low,view,play};
  useEffect(()=>{
    if (!canvas.current || !import.meta.env.DEV) return;
    const game=new Game(canvas.current,()=>{}); gameRef.current=game;
    let live=true, frame=0, nextReport=0;
    game.setMasterVolume(0); game.setFpsLimit(0); game.setBotDifficulty('hard'); game.setBloomScale(.35);
    const hold=(now:number)=>{
      if(!live)return;
      const chosen=selection.current, pose=poses[chosen.map][chosen.view];
      if(!chosen.play)game.setPhotoView(pose[0],pose[1],{x:pose[2],y:pose[3],z:pose[4]});
      if(now>nextReport) {setMetrics(chosen.play?game.photoMovementStatus():game.photoDiagnostics());nextReport=now+(chosen.play?100:1000);}
      frame=requestAnimationFrame(hold);
    };
    frame=requestAnimationFrame(hold);
    void game.start().catch(e=>{if(live)setStatus(String(e));});
    return ()=>{live=false;cancelAnimationFrame(frame);gameRef.current=null;game.dispose();};
  },[]);
  useEffect(()=>{
    const game=gameRef.current;if(!game)return;
    let live=true;
    game.setQuality(1/(window.devicePixelRatio||1),low);
    game.setTraining(map==='training'); game.setMap(MAPS.find(m=>m.id===map)!.map);
    game.setBotCount(query.get('bots')==='0'?0:7);
    game.setBotsEnabled(map!=='training' && !play && query.get('bots')!=='0');
    game.setViewmodel({x:0,y:0,z:0},view!=='combat');
    if(play) {
      const pose=poses[map][view];
      game.releasePhotoView();game.setPlayerView(pose[0],pose[1],{x:pose[2],y:pose[3],z:pose[4]});
    }
    setStatus('Loading materials');
    void game.mapAssetsReady().then(()=>{if(live)setStatus(game.photoAssetStatus());});
    return ()=>{live=false;};
  },[map,low,view,play]);
  return <div style={{position:'fixed',inset:0,background:'#080d17'}}>
    <canvas ref={canvas} style={{width:'100%',height:'100%',display:'block'}} />
    <button onClick={()=>setShowControls(!showControls)} style={{position:'absolute',right:12,top:12,opacity:.5}}>Photo controls</button>
    {showControls && <div data-photo-controls style={{position:'absolute',left:16,bottom:16,padding:12,background:'#08101ee6',color:'white',font:'13px monospace',display:'flex',gap:12,alignItems:'center'}}>
      <label>Map <select aria-label='Map' value={map} onChange={e=>setMap(e.target.value)}>{MAPS.map(m=><option key={m.id} value={m.id}>{m.map.name}</option>)}</select></label>
      <label>Quality <select aria-label='Quality' value={low?'low':'high'} onChange={e=>setLow(e.target.value==='low')}><option value='high'>2K</option><option value='low'>1K</option></select></label>
      <label>View <select aria-label='View' value={view} onChange={e=>setView(e.target.value as View)}>{['wide','surface','combat'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <button aria-pressed={play} onClick={()=>setPlay(!play)}>Playtest</button>
      <output data-photo-status>{status}</output><output data-photo-metrics>{metrics}</output>
    </div>}
  </div>;
}
