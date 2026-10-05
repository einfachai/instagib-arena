"""Fast mechanical cycle proof in Blender; assemble PNG frames with ffmpeg.
This is a Blender animation preview, not a gameplay recording.
"""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];ART=ROOT/'art/railgun-r01'
bpy.ops.wm.open_mainfile(filepath=str(ART/'r01.blend'))
s=bpy.context.scene;c=s.camera
c.location=(1.5,1.7,.7);c.rotation_euler=(Vector((0,.1,.04))-c.location).to_track_quat('-Z','Y').to_euler();c.data.ortho_scale=1.5
s.render.engine='BLENDER_EEVEE'
s.render.resolution_x=960;s.render.resolution_y=540;s.render.resolution_percentage=100
s.render.fps=30
out=ART/'renders/animation-frames';out.mkdir(parents=True,exist_ok=True)
for i in range(48):
    s.frame_set(min(72,i*2))
    s.render.filepath=str(out/f'{i:03d}.png')
    bpy.ops.render.render(write_still=True)
