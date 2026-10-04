"""Bake Mixamo motion onto the immutable canonical Y Bot, exporting skinless GLB.
Gameplay owns translation: horizontal root movement and ballistic root lift are
removed for movement clips. Emote vertical body motion remains local cosmetic.
"""
import bpy,json,hashlib,tempfile,shutil
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[2]; ART=ROOT/'art/ybot'; OUT=ROOT/'public/models/codex-ybot'
manifest=json.loads((ART/'animation-sources.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(ART/'codex-ybot.blend'))
if (ART/'codex-ybot-animations.blend').exists():
 # Blender keeps a library source marker even for appended local actions.
 # Read a temporary copy so saving the editable source cannot overwrite a
 # currently registered library path.
 with tempfile.TemporaryDirectory() as temporary:
  library=Path(temporary)/'cached-actions.blend';shutil.copyfile(ART/'codex-ybot-animations.blend',library)
  with bpy.data.libraries.load(str(library),link=False) as (available,loaded):loaded.actions=available.actions
for cached_action in bpy.data.actions:cached_action.use_fake_user=True
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
rig.animation_data_create();rig.animation_data.action=None
scene=bpy.context.scene;scene.render.fps=60
baseObjects=set(bpy.data.objects);rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
clips=[]
cache_path=ART/'reports/clip-build-cache.json'
cache=json.loads(cache_path.read_text()) if cache_path.exists() else {}
build_hash=hashlib.sha256(Path(__file__).read_bytes()+(ART/'codex-ybot.blend').read_bytes()).digest()
for entry in manifest['clips']:
 src=ART/'source/mixamo'/entry['file']
 if not src.exists():
  raise FileNotFoundError(f"Missing required clip {entry['id']}: {src}")
 target=OUT/'clips'/f"{entry['id']}.glb"
 digest=hashlib.sha256(build_hash+src.read_bytes()+json.dumps(entry,sort_keys=True).encode()).hexdigest()
 saved=cache.get(entry['id'])
 if saved and saved['hash']==digest and target.exists():
  clips.append(saved['entry']);print('CACHED',entry['id'],flush=True);continue
 bpy.ops.import_scene.fbx(filepath=str(src),automatic_bone_orientation=False)
 imported=set(bpy.data.objects)-baseObjects
 source=next(o for o in imported if o.type=='ARMATURE')
 action=source.animation_data.action
 first,last=map(float,action.frame_range)
 segment=entry.get('segment',[0,1]);length=last-first
 first,last=first+length*segment[0],first+length*segment[1]
 source_fps=scene.render.fps/scene.render.fps_base
 frames=round((last-first)/source_fps*60)+1
 scene.render.fps=60;scene.render.fps_base=1
 source_rest={b.name:b.matrix_local.copy() for b in source.data.bones}
 inverse_target=rig.matrix_world.inverted()
 rest_local={b.name:(b.parent.matrix_local.inverted()@b.matrix_local if b.parent else b.matrix_local.copy()) for b in rig.data.bones}
 previous=bpy.data.actions.get(entry['id'])
 if previous:bpy.data.actions.remove(previous)
 out=bpy.data.actions.new(entry['id']);rig.animation_data.action=out
 for pb in rig.pose.bones:pb.rotation_mode='QUATERNION';pb.matrix_basis=Matrix.Identity(4)
 for sample in range(frames):
  source_frame=min(last,first+sample*source_fps/60)
  scene.frame_set(int(source_frame),subframe=source_frame-int(source_frame));bpy.context.view_layer.update()
  desired={}
  for pb in rig.pose.bones:
   sp=source.pose.bones.get(pb.name)
   if sp:
    desired[pb.name]=inverse_target@source.matrix_world@sp.matrix@source_rest[pb.name].inverted()@rest[pb.name]
   else:desired[pb.name]=rest[pb.name].copy()
  if entry.get('mirror',False):
   reflection=Matrix.Diagonal((-1,1,1,1))
   def opposite(name):return name.replace('Left','TEMP').replace('Right','Left').replace('TEMP','Right')
   desired={name:reflection@desired[opposite(name)]@reflection for name in desired}
  hip=desired['mixamorig:Hips'];delta=hip.translation-rest['mixamorig:Hips'].translation
  # Subtract the same displacement from every bone, so child translation
  # tracks cannot compensate for a stationary pelvis and reintroduce drift.
  if entry.get('movement',False):delta.y-=max(-5,min(5,delta.y))
  else:delta.y=0
  for matrix in desired.values():matrix.translation-=delta
  for pb in rig.pose.bones:
   local=desired[pb.parent.name].inverted()@desired[pb.name] if pb.parent else desired[pb.name]
   pb.matrix_basis=rest_local[pb.name].inverted()@local
   pb.keyframe_insert(data_path='location',frame=sample,group=pb.name)
   pb.keyframe_insert(data_path='rotation_quaternion',frame=sample,group=pb.name)
   pb.keyframe_insert(data_path='scale',frame=sample,group=pb.name)
 rig.animation_data.action=out
 scene.frame_start=0;scene.frame_end=frames-1;scene.frame_set(0)
 for o in bpy.context.selected_objects:o.select_set(False)
 rig.select_set(True);bpy.context.view_layer.objects.active=rig
 target.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True,export_force_sampling=True,export_yup=True)
 out.use_fake_user=True;rig.animation_data.action=None
 for o in imported:bpy.data.objects.remove(o,do_unlink=True)
 if action.users==0:bpy.data.actions.remove(action)
 clip_entry=dict(id=entry['id'],url=f"/models/codex-ybot/clips/{entry['id']}.glb",duration=(frames-1)/60,frames=frames,source=entry['file'],loop=entry.get('loop',True),movement=entry.get('movement',False),segment=segment,mirrored=entry.get('mirror',False))
 clips.append(clip_entry);cache[entry['id']]={'hash':digest,'entry':clip_entry}
 cache_path.write_text(json.dumps(cache,indent=2))
 print('CLIP_EXPORTED',entry['id'],frames,'source FPS',source_fps,flush=True)
# Original T-pose is a constant clip on the unchanged rest rig.
(OUT/'manifest.json').write_text(json.dumps(dict(version=1,model='/models/codex-ybot/model.glb',fps=60,clips=clips),indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'codex-ybot-animations.blend'))
bpy.ops.wm.open_mainfile(filepath=str(ART/'codex-ybot-animations.blend'))
assert {entry['id'] for entry in manifest['clips']}<={action.name for action in bpy.data.actions},'Editable actions were not saved'
print('EXPORTED',len(clips),'of',len(manifest['clips']))
