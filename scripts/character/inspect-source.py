import bpy,json,sys
from pathlib import Path
bpy.ops.wm.read_factory_settings(use_empty=True)
p=Path(__file__).resolve().parents[2]/'art/ybot/source/mixamo/rifle-pack/Y Bot.fbx'
bpy.ops.import_scene.fbx(filepath=str(p),automatic_bone_orientation=False)
for o in bpy.data.objects:
 print('OBJECT',o.name,o.type,list(o.location),list(o.scale))
 if o.type=='MESH':
  print('MESH',len(o.data.vertices),len(o.data.polygons),[m.name for m in o.data.materials],[(g.name,g.index) for g in o.vertex_groups])
  print('BOUNDS', [list(v) for v in o.bound_box])
 if o.type=='ARMATURE':
  print('BONES',[(b.name,b.parent.name if b.parent else None,list(b.head_local),list(b.tail_local)) for b in o.data.bones])
print('ACTIONS', [(a.name,list(a.frame_range)) for a in bpy.data.actions])
bpy.ops.wm.save_as_mainfile(filepath=str(p.parents[2]/'original-ybot.blend'))
