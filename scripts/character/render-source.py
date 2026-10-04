"""Render the editable source for art review without changing its saved rig.
Usage: blender --background --python scripts/character/render-source.py -- idle.relaxed 60
"""
import bpy, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];ART=ROOT/'art/ybot'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
clip=args[0] if args else 'idle.relaxed';frame=int(args[1]) if len(args)>1 else 60
bpy.ops.wm.open_mainfile(filepath=str(ART/'codex-ybot-animations.blend'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
action=bpy.data.actions[clip];rig.animation_data_create();rig.animation_data.action=action
if action.slots:rig.animation_data.action_slot=action.slots[0]
scene=bpy.context.scene;scene.render.fps=60;scene.frame_set(frame)
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('ReviewWorld');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.032,.042,.068,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01))
floor=bpy.context.object;mat=bpy.data.materials.new('ReviewFloor');mat.diffuse_color=(.025,.035,.06,1);floor.data.materials.append(mat)
for location,power,size,color in [((2,-3,4),450,4,(.92,.95,1)),((-3,-1,2),260,3,(.65,.72,1)),((0,2,4),500,3,(.74,.65,1))]:
 data=bpy.data.lights.new('ReviewSoftbox','AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
 light=bpy.data.objects.new('ReviewSoftbox',data);scene.collection.objects.link(light);light.location=location
 light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.5,-4.6,2.4));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.1))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=2.65;scene.camera=camera
destination=ART/'reports/screenshots';destination.mkdir(parents=True,exist_ok=True)
scene.render.filepath=str(destination/(clip+'.png'))
bpy.ops.render.render(write_still=True)
print('SOURCE_REVIEW_RENDER',scene.render.filepath)
