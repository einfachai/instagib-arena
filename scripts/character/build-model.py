"""Rig-preserving Y Bot resculpt. Run with Blender --background --python.
The only edits to original meshes are vertex coordinates and surface materials.
Original vertex ordering, vertex groups, bones and bind transforms are immutable.
"""
import bpy, json, hashlib, struct, math
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'art/ybot'; OUT=ROOT/'public/models/codex-ybot'
ART.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(ART/'source/mixamo/rifle-pack/Y Bot.fbx'),automatic_bone_orientation=False)
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
rig.animation_data_clear()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
originals=[o for o in bpy.data.objects if o.type=='MESH']
for o in originals:
 attribute=o.data.attributes.new('_source_vertex_id','INT','POINT')
 for i,value in enumerate(attribute.data):value.value=i

def signature():
 bones=[dict(name=b.name,parent=b.parent.name if b.parent else None,rest=[float(v) for row in b.matrix_local for v in row]) for b in rig.data.bones]
 meshes={}
 for o in originals:
  weights=[[(o.vertex_groups[g.group].name,float(g.weight)) for g in v.groups] for v in o.data.vertices]
  topology=[list(p.vertices) for p in o.data.polygons]
  meshes[o.name]=dict(vertices=len(o.data.vertices),polygons=len(o.data.polygons),weights=hashlib.sha256(json.dumps(weights,separators=(',',':')).encode()).hexdigest(),topology=hashlib.sha256(json.dumps(topology).encode()).hexdigest(),matrix=[float(v) for row in o.matrix_world for v in row])
 return dict(bones=bones,meshes=meshes,armatureMatrix=[float(v) for row in rig.matrix_world for v in row])

before=signature()
bpy.ops.export_scene.gltf(filepath=str(OUT/'original.glb'),export_format='GLB',export_animations=False,export_yup=True,export_attributes=True)
# Smooth analytic shell edits around existing joints. Blend by the existing skin
# weights; no modifier remesh, subdivision, merge, or weight transfer is used.
body=bpy.data.objects['Alpha_Surface']
changed=0
for v in body.data.vertices:
 co=v.co.copy(); delta=Vector((0,0,0))
 for g in v.groups:
  name=body.vertex_groups[g.group].name.split(':')[-1]
  b=rig.data.bones.get('mixamorig:'+name)
  if not b: continue
  p=co-b.head_local
  d=Vector((0,0,0))
  if name=='Head':
   # Broad rounded helmet with a flatter face and compact jaw.
   k=max(0,min(1,(p.y-2)/8))
   d.x=p.x*(.09*k)
   d.z=(p.z*.12 if p.z>0 else p.z*.035)*k
   if p.y<5: d.x-=p.x*.035
  elif name in ('Spine1','Spine2'):
   # Clean chest shell: fuller sternum, compact sidewalls.
   d.x=-p.x*.04
   if p.z>0: d.z=2.0*math.exp(-((p.y-7)/13)**2)*max(0,min(1,p.z/8))
  elif name.endswith('Shoulder'):
   d.z=p.z*.06; d.y=-p.y*.05
  elif name.endswith('ForeArm'):
   along=max(0,min(1,abs(p.x)/27))
   k=math.sin(math.pi*along)**2
   d.y=p.y*.08*k; d.z=p.z*.13*k
  elif name in ('LeftLeg','RightLeg'):
   k=math.sin(math.pi*max(0,min(1,-p.y/42)))**2
   d.x=p.x*.05*k; d.z=p.z*.16*k
  delta+=d*g.weight
 if delta.length>1e-7:
  v.co+=delta;changed+=1
for o in originals:
 for p in o.data.polygons: p.use_smooth=True

def mat(name,hexcol,rough=.32,metal=.22,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True
 c=tuple(int(hexcol[i:i+2],16)/255 for i in (0,2,4))+(1,)
 # Blender Principled inputs are scene linear.
 c=tuple(((x+.055)/1.055)**2.4 if x>.04045 else x/12.92 for x in c[:3])+(1,)
 s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=c
 s.inputs['Roughness'].default_value=rough;s.inputs['Metallic'].default_value=metal
 if emit:s.inputs['Emission Color'].default_value=c;s.inputs['Emission Strength'].default_value=emit
 m.diffuse_color=c;return m
white=mat('Codex_Shell','f6f7fc');dark=mat('Codex_Joints','101521',.5,.3)
blue=mat('Codex_Blue','7d9bff',.25,.3);lav=mat('Codex_Lavender','aa8eff',.25,.3)
visor=mat('Codex_Visor','7d9bff',.15,.12,1.2)
body.data.materials.clear();body.data.materials.append(white)
joints=bpy.data.objects['Alpha_Joints'];joints.data.materials.clear();joints.data.materials.append(dark)
surface=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices[:] for p in body.data.polygons])
def front_at(x,y):
 hit=surface.ray_cast(Vector((x,y,100)),Vector((0,0,-1)))[0]
 if hit is None:raise ValueError(f'No armor surface at {x},{y}')
 return hit.z
# Added hard-surface details are rigidly weighted to existing bones. No new bones.
# Mesh coordinates use the same original FBX space and object transform.
def bind_detail(o,bone,material):
 o.data.materials.clear();o.data.materials.append(material)
 # Bake primitive object matrix to vertex coordinates, retain original mesh frame.
 M=o.matrix_world.copy()
 for v in o.data.vertices:v.co=M@v.co
 o.matrix_world=body.matrix_world.copy()
 vg=o.vertex_groups.new(name='mixamorig:'+bone);vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
 mod=o.modifiers.new('Canonical Mixamo Skin','ARMATURE');mod.object=rig
 o.parent=rig;o.matrix_parent_inverse=rig.matrix_world.inverted()
 for p in o.data.polygons:p.use_smooth=True
 return o

def shell(name,center,size,bone,material,bevel=.5):
 bpy.ops.mesh.primitive_cube_add(size=1,location=center)
 o=bpy.context.object;o.name=name;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Soft machined edges','BEVEL');mod.width=bevel;mod.segments=3
 bpy.ops.object.modifier_apply(modifier=mod.name)
 return bind_detail(o,bone,material)
# An open frame around the inset lens. A solid surround would occlude the
# recessed lens; these four rails leave the illuminated face visible.
visor_z=front_at(0,166.4)+.25
shell('Visor_Recess_Back',(0,166.4,visor_z),(18.6,5.1,.16),'Head',dark,.07)
for side in (-1,1):
 shell('Visor_Recess_Horizontal_'+str(side),(0,166.4+side*2.2,visor_z+.5),(18.6,.7,1.4),'Head',dark,.25)
 shell('Visor_Recess_Vertical_'+str(side),(side*8.95,166.4,visor_z+.5),(.7,3.7,1.4),'Head',dark,.25)
shell('Visor_Lens',(0,166.4,visor_z+.65),(16.8,3.1,.18),'Head',visor,.08)
# Narrow armor accents and panel seams.
def ribbon(name,x,y0,y1,width,bone,material):
 verts=[];faces=[];steps=16
 for i in range(steps+1):
  y=y0+(y1-y0)*i/steps
  for side in (-1,1):
   px=x+side*width/2;verts.append((px,y,front_at(px,y)+.14))
 for i in range(steps):faces.append((i*2,i*2+1,i*2+3,i*2+2))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 return bind_detail(o,bone,material)
# A short chest strip follows the shell's horizontal curvature.
for side in (-1,1):
 shell('Chest_Accent_'+str(side),(side*4.5,132.8,front_at(side*4.5,132.8)+.18),(6.0,.7,.35),'Spine2',blue,.22)
for side in (-1,1):
 ribbon('Chest_Seam_'+str(side),side*10.7,130,138,.22,'Spine2',dark)
 ribbon('Shin_Accent_'+str(side),side*9.2,24,37,1.7,('LeftLeg' if side>0 else 'RightLeg'),lav)
# Arena emblem: the existing ring, crosshair ticks and central dot (favicon.svg).
# Front is original +Z. Keep the relief restrained.
bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,location=(0,139.0,front_at(0,139)+.34),rotation=(0,0,0),major_radius=2.9,minor_radius=.24)
o=bpy.context.object;o.name='Arena_Emblem_Ring'
# Source coordinates face +Z: the torus already lies in the correct XY plane.
# Fit each added vertex to the curved chest so the whole ring remains visible.
bpy.context.view_layer.update();emblem_matrix=o.matrix_world.copy();emblem_z=o.location.z
for v in o.data.vertices:
 p=emblem_matrix@v.co;p.z=front_at(p.x,p.y)+.34+(p.z-emblem_z);v.co=p
o.matrix_world=Matrix.Identity(4);bind_detail(o,'Spine2',blue)
for x,y,w,h in [(0,143,.48,2.4),(0,135,.48,2.4),(-4,139,2.4,.48),(4,139,2.4,.48),(0,139,.9,.9)]:
 shell('Arena_Emblem_Tick',(x,y,front_at(x,y)+.25),(w,h,.35),'Spine2',blue,.15)
after=signature()
assert before==after,'Original rig, weights or vertex ordering changed'
report=dict(passed=True,original=before,resculpted=after,changedArmorVertices=changed,addedDetails=[o.name for o in bpy.data.objects if o.type=='MESH' and o not in originals],export=dict(format='GLB',fps=60,source='Mixamo FBX Binary / T-pose / no keyframe reduction'),normalization=dict(height=1.8,forward='-Z',sourceForward='+Z',containerOnly=True))
(ART/'reports/rig-comparison.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'codex-ybot.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',export_animations=False,export_yup=True,export_attributes=True)
print('RIG_VALIDATED',changed,'vertices resculpted; original bone and weight signatures unchanged')
