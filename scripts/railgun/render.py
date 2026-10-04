"""Reopen the saved asset and render orthographic reference comparisons."""
import bpy, sys, math
from pathlib import Path
from mathutils import Vector, Quaternion
ROOT=Path(__file__).resolve().parents[2];ART=ROOT/'art/railgun-r01'
bpy.ops.wm.open_mainfile(filepath=str(ART/'r01.blend'))
scene=bpy.context.scene;camera=scene.camera
scene.cycles.samples=4
scene.cycles.max_bounces=4
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['side','top','front','hero']
views={'side':((2,.24,.025),(0,.24,.025),1.62),
       'top':((0,.24,2),(0,.24,0),1.62),
       'front':((0,2,0),(0,.95,0),.88),
       'hero':((1.7,1.7,.78),(0,.21,.025),1.50),
       'reload':((-1.7,1.7,.78),(0,.21,.025),1.50)}
for name in args:
    loc,at,scale=views[name];camera.location=loc
    q=(Vector(at)-camera.location).to_track_quat('-Z','Y')
    if name=='top':q=q@Quaternion((0,0,1),math.pi/2)
    camera.rotation_euler=q.to_euler();camera.data.ortho_scale=scale
    scene.frame_set(27 if name=='reload' else 72)
    scene.render.resolution_x=1536;scene.render.resolution_y=768
    scene.render.filepath=str(ART/'renders'/f'{name}.png')
    bpy.ops.render.render(write_still=True)
