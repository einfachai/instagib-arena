"""Build the independent Codex android review asset on the canonical Mixamo rig.

Run with Blender --background --python scripts/character/build-android.py.
All modeling coordinates are in the original rig's centimetre frame: +Y up,
+Z forward. The rig transform, rest bones, and existing actions are untouched.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/codex-android'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'art/ybot/codex-ybot-animations.blend'))
scene = bpy.context.scene
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
rig.animation_data_clear()
rig.data.pose_position = 'REST'

def signature():
    return dict(matrix=[list(r) for r in rig.matrix_world], bones=[dict(
        name=b.name, parent=b.parent.name if b.parent else None,
        rest=[list(r) for r in b.matrix_local]) for b in rig.data.bones])

original_signature = signature()
expected_actions = {c['id'] for c in json.loads((ROOT / 'art/ybot/animation-sources.json').read_text())['clips']}
for action in list(bpy.data.actions):
    if action.name in expected_actions:
        action.use_fake_user = True
    else:
        bpy.data.actions.remove(action)

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

groups = {k: collection(v) for k, v in {
    'rig': '01 · Animation rig', 'shell': '02 · Pearl shells',
    'frame': '03 · Mechanical frame', 'cable': '04 · Cable harnesses',
    'glass': '05 · Inspection windows', 'face': '06 · Cloud monitor head',
    'detail': '07 · Hardware and markings', 'stage': '08 · Studio',
    'ref': '99 · Original Y Bot reference (hidden)'}.items()}

for o in list(scene.objects):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    groups['rig' if o == rig else 'ref'].objects.link(o)
    if o != rig:
        o.hide_render = True
        o.hide_set(True)
groups['ref'].hide_render = True
groups['ref'].hide_viewport = True
for c in list(bpy.data.collections):
    if c not in groups.values() and not c.objects and not c.children:
        bpy.data.collections.remove(c)

def linear(hex_value):
    values = [int(hex_value[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values) + (1,)

def material(name, color, rough=.3, metal=0, emit=0, transmission=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    s = m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value = linear(color)
    s.inputs['Roughness'].default_value = rough
    s.inputs['Metallic'].default_value = metal
    s.inputs['Coat Weight'].default_value = .25 if not metal else .12
    s.inputs['Coat Roughness'].default_value = .22
    if transmission:
        s.inputs['Transmission Weight'].default_value = transmission
        s.inputs['IOR'].default_value = 1.46
    if emit:
        s.inputs['Emission Color'].default_value = linear(color)
        s.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = linear(color)
    return m

M = {
    'white': material('CA / Pearl ceramic polymer', 'E7EBF0', .20, .12),
    'blue': material('CA / Periwinkle blue housing', '2856B7', .43, .02),
    'darkblue': material('CA / Blue edge gasket', '263F72', .36, .05),
    'dark': material('CA / Graphite alloy', '252D38', .34, .72),
    'rubber': material('CA / Soft black cable jacket', '111923', .52, .05),
    'silver': material('CA / Brushed titanium', '8595AB', .26, .82),
    'screen': material('CA / Obsidian monitor glass', '040A15', .16, .28),
    'light': material('CA / Ice blue phosphor', '96D9FF', .23, .05, 4.5),
    'electric': material('CA / Blue optical fibre', '348DDD', .25, .15, 3.0),
    'lavender': material('CA / Lavender connector polymer', 'A0A4D6', .35, .05),
    'glass': material('CA / Clear blue polycarbonate', 'DAEEFA', .115, 0, 0, .96),
    'board': material('CA / Midnight circuit substrate', '152D3D', .44, .35),
    'copper': material('CA / Copper circuit traces', 'A79477', .3, .78),
    'ink': material('CA / Graphite markings', '3A465A', .48),
}

M['blue'].node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = .10
created = []

def bone_name(name):
    return name if name.startswith('mixamorig:') else 'mixamorig:' + name

def bind(o, name, mat, group, bone, weight_fn=None):
    o.name = name
    if o.type != 'MESH':
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.convert(target='MESH')
        o = bpy.context.object
    # Compose from channels directly: Blender's cached matrix_world can lag
    # behind a just-assigned primitive scale/rotation until depsgraph evaluation.
    transform = Matrix.LocRotScale(o.location, o.rotation_euler.to_quaternion(), o.scale)
    o.data.transform(transform)
    o.matrix_world = Matrix.Identity(4)
    for c in list(o.users_collection):
        c.objects.unlink(o)
    groups[group].objects.link(o)
    o.data.materials.clear()
    o.data.materials.append(M[mat])
    o.parent = rig
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.matrix_basis = Matrix.Identity(4)
    if weight_fn:
        for v in o.data.vertices:
            for b, weight in weight_fn(v.co).items():
                vg = o.vertex_groups.get(bone_name(b)) or o.vertex_groups.new(name=bone_name(b))
                vg.add([v.index], weight, 'REPLACE')
    else:
        vg = o.vertex_groups.new(name=bone_name(bone))
        vg.add(list(range(len(o.data.vertices))), 1, 'REPLACE')
    mod = o.modifiers.new('Canonical skeleton', 'ARMATURE')
    mod.object = rig
    for p in o.data.polygons:
        p.use_smooth = True
    o['asset'] = 'codex-android'
    o['component'] = group
    created.append(o)
    return o

def active(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o

def finish_edges(o, width=.5, segments=3):
    # Insert before skinning so editable bevel widths remain in rest coordinates.
    bevel = o.modifiers.new('Manufactured edge radius', 'BEVEL')
    bevel.width = width
    bevel.segments = segments
    bevel.limit_method = 'ANGLE'
    o.modifiers.move(len(o.modifiers)-1, 0)
    normals = o.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
    normals.keep_sharp = True
    o.modifiers.move(len(o.modifiers)-1, len(o.modifiers)-2)
    return o

def box(name, center, size, mat, bone, group='shell', bevel=.6):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.object
    o.scale = size
    o = bind(o, name, mat, group, bone)
    return finish_edges(o, bevel, 4) if bevel else o

def sphere(name, center, scale, mat, bone, group='frame'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=center)
    o = bpy.context.object
    o.scale = scale
    return bind(o, name, mat, group, bone)

def rod(name, a, b, radius, mat, bone, group='frame', vertices=24):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b-a).length, location=(a+b)*.5)
    o = bpy.context.object
    o.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return finish_edges(bind(o, name, mat, group, bone), min(.22, radius*.18), 3)

def ring(name,center,axis,radius,tube,mat,bone,group='detail'):
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,major_radius=radius,minor_radius=tube,location=center)
    o=bpy.context.object
    o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
    return bind(o,name,mat,group,bone)

def mesh(name, verts, faces, mat, bone, group='shell', bevel=0):
    d = bpy.data.meshes.new(name)
    d.from_pydata(verts, [], faces)
    d.update()
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    o = bind(o, name, mat, group, bone)
    return finish_edges(o, bevel) if bevel else o

def plate(name, outline, zback, zfront, mat, bone, group='shell', bevel=.7):
    area = sum(outline[i][0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*outline[i][1] for i in range(len(outline)))
    if area < 0:
        outline = list(reversed(outline))
    n = len(outline)
    verts = [(x,y,z) for z in (zback,zfront) for x,y in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name, verts, faces, mat, bone, group, bevel)

def cable(name, points, radius, mat, bone, weight_fn=None, group='cable'):
    d = bpy.data.curves.new(name, 'CURVE')
    d.dimensions = '3D'
    d.resolution_u = 12
    d.bevel_depth = radius
    d.bevel_resolution = 3
    d.use_fill_caps = True
    spl = d.splines.new('BEZIER')
    spl.bezier_points.add(len(points)-1)
    for p, co in zip(spl.bezier_points, points):
        p.co = co
        p.handle_left_type = p.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    active(o)
    return bind(o, name, mat, group, bone, weight_fn)

def text_mark(name, text, center, size, mat, bone, align='CENTER'):
    d = bpy.data.curves.new(name, 'FONT')
    d.body = text
    d.size = size
    d.space_character = 1.15
    d.align_x = align
    d.align_y = 'CENTER'
    d.extrude = .012
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    o.location = center
    active(o)
    return bind(o, name, mat, 'detail', bone)

def smoothstep(a,b,x):
    t = max(0, min(1, (x-a)/(b-a)))
    return t*t*(3-2*t)

def blend_axis(bone_a, bone_b, axis, a, b):
    def weights(v):
        t = smoothstep(a,b,v[axis])
        return {bone_a: 1-t, bone_b: t}
    return weights

def outline_rectangle(w,h,r,n=12):
    result=[]
    for cx,cy,angle in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
        for i in range(n):
            a=math.radians(angle+i*90/(n-1))
            result.append((cx+math.cos(a)*r,cy+math.sin(a)*r))
    return result

def frame(name, center, width, height, border, depth, mat, bone, group='detail'):
    x,y,z=center
    outer=outline_rectangle(width,height,min(width,height)*.17)
    inner=outline_rectangle(width-2*border,height-2*border,min(width,height)*.12)
    n=len(outer)
    verts=[(x+u,y+v,z+k) for k in (-depth/2,depth/2) for loop in (outer,inner) for u,v in loop]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces += [(i,j,2*n+j,2*n+i),(n+j,n+i,3*n+i,3*n+j),
                  (2*n+i,2*n+j,3*n+j,3*n+i),(j,i,n+i,n+j)]
    return mesh(name,verts,faces,mat,bone,group,.08)

def cut_window(o, center, size):
    # Apply a real opening before bevel and skin, with the rig held in rest pose.
    bpy.ops.mesh.primitive_cube_add(size=1)
    cutter=bpy.context.object
    for v in cutter.data.vertices:
        v.co=Vector((v.co.x*size[0],v.co.y*size[1],v.co.z*size[2]))+Vector(center)
    cutter.matrix_world=rig.matrix_world.copy()
    bevel=cutter.modifiers.new('Round aperture','BEVEL');bevel.width=.45;bevel.segments=4
    active(cutter);bpy.ops.object.modifier_apply(modifier=bevel.name)
    cut=o.modifiers.new('Inspection aperture','BOOLEAN');cut.operation='DIFFERENCE';cut.object=cutter
    o.modifiers.move(len(o.modifiers)-1,0)
    active(o);bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    # Boolean-generated aperture vertices do not inherit groups from the cutter.
    # These are rigid shell pieces, so every new vertex uses the same bone.
    assert len(o.vertex_groups)==1
    o.vertex_groups[0].add(list(range(len(o.data.vertices))),1,'REPLACE')

def inspection(name, center, width, height, bone):
    x,y,z=center
    box(name+' / black pocket',(x,y,z-.75),(width,height,1.5),'rubber',bone,'frame',.45)
    box(name+' / PCB',(x,y,z-.24),(width-.7,height-.7,.25),'board',bone,'frame',.15)
    frame(name+' / metal rim',(x,y,z+.15),width+.45,height+.45,.33,.45,'silver',bone)
    frame(name+' / blue seal',(x,y,z+.30),width-.18,height-.18,.14,.20,'darkblue',bone)
    # Actual circuitry, pins and traces behind the transmissive panel.
    chip_count=3 if width>height else 2
    for i in range(chip_count):
        xx=x+(i-(chip_count-1)/2)*width*.25
        box(name+f' / controller {i}',(xx,y,z+.015),(width*.18,height*.34,.28),'dark',bone,'frame',.07)
        for sign in (-1,1):
            for j in range(4):
                box(name+f' / pin {i} {sign} {j}',(xx+(j-1.5)*width*.043,y+sign*height*.22,z+.02),(width*.023,height*.09,.09),'silver',bone,'detail',.015)
    for sign in (-1,1):
        box(name+' / trace '+str(sign),(x,y+sign*height*.34,z-.015),(width*.73,.055,.055),'copper',bone,'detail',.01)
    for i in range(3):
        box(name+f' / status {i}',(x-width*.34+i*.31,y-height*.32,z+.075),(.16,.16,.10),'light' if i==0 else 'lavender',bone,'detail',.04)
    box(name+' / polycarbonate lens',(x,y,z+.48),(width-.36,height-.36,.22),'glass',bone,'glass',.105)

def sculpted_panel(name,outline,zback,zfront,bulge,mat,bone,group='shell'):
    """Convex manufactured panel, using nested contour rings with rounded edges."""
    area=sum(outline[i][0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*outline[i][1] for i in range(len(outline)))
    if area<0:outline=list(reversed(outline))
    # Chaikin corner cutting creates a smooth silhouette without a box primitive.
    for _ in range(3):
        smooth=[]
        for i,p in enumerate(outline):
            q=outline[(i+1)%len(outline)]
            smooth += [(.90*p[0]+.10*q[0],.90*p[1]+.10*q[1]),(.10*p[0]+.90*q[0],.10*p[1]+.90*q[1])]
        outline=smooth
    cx=sum(p[0] for p in outline)/len(outline);cy=sum(p[1] for p in outline)/len(outline)
    n=len(outline)
    levels=[(.97,zback),(1,zback+.45),(1,zfront-.5),(.97,zfront),(.84,zfront+bulge*.4),(.55,zfront+bulge*.82),(.22,zfront+bulge)]
    verts=[(cx+(x-cx)*scale,cy+(y-cy)*scale,z) for scale,z in levels for x,y in outline]
    faces=[tuple(reversed(range(n)))]
    faces += [(i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j) for i in range(len(levels)-1) for j in range(n)]
    faces.append(tuple(range((len(levels)-1)*n,len(levels)*n)))
    return mesh(name,verts,faces,mat,bone,group)

# ----- Internal torso, manufactured chest plates, waist and pelvic assembly -----
sphere('Thorax / graphite chassis',(0,135.5,-1.8),(12.4,11.5,8.6),'dark','Spine2')
def chest_position(u,v):
    bottom=125.3+5.2*(1-u*u)**2
    top=147.8-1.6*math.exp(-(u/.37)**4)
    y=bottom+(top-bottom)*v
    width=16.0*(.91+.09*math.sin(math.pi*v))
    x=u*width
    z=3.2+7.7*max(0,1-u*u)**.7+.65*math.sin(math.pi*v)
    return (x,y,z)
nu,nv=49,25
verts=[chest_position(-1+2*i/(nu-1),j/(nv-1)) for j in range(nv) for i in range(nu)]
faces=[(j*nu+i,j*nu+i+1,(j+1)*nu+i+1,(j+1)*nu+i) for j in range(nv-1) for i in range(nu-1)]
chest=mesh('Thorax / continuous curved breastplate',verts,faces,'white','Spine2')
sol=chest.modifiers.new('Moulded chest wall','SOLIDIFY');sol.thickness=.85;sol.offset=-1;chest.modifiers.move(len(chest.modifiers)-1,0)
finish_edges(chest,.22,3)
for sign in (-1,1):
    seam=[chest_position(sign*.73,v) for v in (.06,.22,.43,.65,.86)]
    cable('Thorax / precision panel seam '+str(sign),[(x,y,z+.055) for x,y,z in seam],.058,'ink','Spine2',group='detail')
    for v in (.18,.80):
        x,y,z=chest_position(sign*.82,v)
        rod('Thorax / captive fastener '+str(sign)+str(v),(x,y,z),(x,y,z+.11),.19,'silver','Spine2','detail',12)
# A small outlined cloud echoes the monitor housing, as in the supplied image.
cloud_mark=[(-2,137.2),(-2.5,138),(-2.2,139),(-1.3,139.2),(-1.1,140.4),(0,140.9),(1.1,140.2),(1.3,139.5),(2.1,139.1),(2.5,138.2),(2.3,137.4),(-2,137.2)]
cable('Chest / cloud insignia',[(x,y,11.55) for x,y in cloud_mark],.15,'ink','Spine2',group='detail')
text_mark('Chest / unit designation','C A  /  0 1',(0,134.9,11.36),.52,'ink','Spine2')
inspection('Thorax inspection',(-10.7,140,8.9),1.8,4.6,'Spine2')
for sign in (-1,1):
    x=sign*7
    rod('Thorax / longitudinal spar '+str(sign),(x,125,-6),(x,146,-6),1.3,'silver','Spine2')
    sculpted_panel('Thorax / back plate '+str(sign),[(sign*x,y) for x,y in [(2,144.4),(11.5,144.6),(13,131.4),(4,127.6),(2,131)]],-10,-7,-1,'white','Spine2')
    cable('Thorax / shoulder fibre '+str(sign),[(sign*5,146,-6),(sign*10,146,-7.3),(sign*14,141,-6),(sign*12,130,-5)],.18,'electric','Spine2')
ring('Collar / inset neck gasket',(0,146,-2),(0,1,0),5.0,.55,'rubber','Spine2')

for i,(y,w,bone) in enumerate([(123.0,18,'Spine1'),(116.5,16,'Spine'),(110.5,17,'Spine')]):
    box('Abdomen / flexible core '+str(i),(0,y,-1.5),(w,5.8,12),'rubber',bone,'frame',1.8)
    for sign in (-1,1):
        rod('Abdomen / exposed piston '+str(i)+str(sign),(sign*6.5,y-2.8,3.8),(sign*6.5,y+2.8,3.8),.8,'silver',bone)
sculpted_panel('Abdomen / upper floating shield',[(-6.1,130.4),(6.1,130.4),(5.2,122),(3.4,119.5),(-3.4,119.5),(-5.2,122)],4.5,6.3,1.7,'white','Spine1')
sculpted_panel('Abdomen / lower tapered shield',[(-4.5,121.2),(4.5,121.2),(3,110.9),(0,109.2),(-3,110.9)],4.3,6.1,1.4,'white','Spine')
for sign in (-1,1):
    for i in range(3):
        y=112.5+i*5
        rod('Waist / lateral tendon '+str(sign)+str(i),(sign*(8+i*.4),y-1.5,-1),(sign*(8.5+i*.6),y+2.5,-1),.85,'silver','Spine' if i<2 else 'Spine1')
    cable('Waist / data loom '+str(sign),[(sign*9.4,126,-3),(sign*10.2,119,-3.5),(sign*9.3,112,-4),(sign*9,104,-4)],.48,'rubber','Spine',blend_axis('Hips','Spine1',1,105,128))
    for j in range(3):
        x=sign*(5.7+j*.9)
        points=[(x,129,3.4),(x+sign*.7,123,5.3),(x+sign*1.3,117,4.6),(x,108,3.8),(x,103,1.8)]
        cable('Waist / exposed cable '+str(sign)+str(j),points,.4,'darkblue' if j==1 else 'rubber','Spine',blend_axis('Hips','Spine1',1,105,128))
        if j==1:cable('Waist / blue optical fibre '+str(sign),[(x+.35*sign,y,z+.28) for x,y,z in points],.15,'electric','Spine',blend_axis('Hips','Spine1',1,105,128))

box('Pelvis / drive cage',(0,99,-1.1),(23,14,15),'dark','Hips','frame',3.2)
sculpted_panel('Pelvis / contoured hip shell',[(-10,107),(-13,103),(-12,98),(-7,97),(-4.5,89.5),(0,87.8),(4.5,89.5),(7,97),(12,98),(13,103),(10,107),(0,103.5)],4.9,7.5,1.4,'white','Hips')
box('Pelvis / dorsal shell',(0,100,-8),(21,9,3),'white','Hips','shell',2)
box('Pelvis / belt inset',(0,102.3,8.5),(6.8,2,.55),'dark','Hips','detail',.45)
box('Pelvis / belt indicator',(0,102.3,8.83),(2.9,.35,.1),'blue','Hips','detail',.13)

# Spine service harness: clips, connectors and two continuous skinned looms.
for i,(y,bone) in enumerate([(104,'Hips'),(114,'Spine'),(123,'Spine1'),(133,'Spine2'),(143,'Spine2')]):
    box('Back / service vertebra '+str(i),(0,y,-10.1),(4.3,3.2,2.6),'silver',bone,'frame',.6)
    box('Back / vertebra inset '+str(i),(0,y,-11.6),(2.5,1.5,.5),'dark',bone,'detail',.4)
def spine_weights(v):
    levels=[(101,'Hips'),(113,'Spine'),(124,'Spine1'),(136,'Spine2')]
    for (a,ba),(b,bb) in zip(levels,levels[1:]):
        if a<=v.y<=b:
            t=smoothstep(a,b,v.y);return {ba:1-t,bb:t}
    return {levels[0 if v.y<101 else -1][1]:1}
for sign in (-1,1):
    for j in range(2):
        x=sign*(3+j*.8)
        cable('Back / '+str(sign)+' loom '+str(j),[(x,103,-8),(x,112,-10),(x,124,-12),(x,137,-12),(x,146,-7)],.42,'rubber' if j==0 else 'darkblue','Spine2',spine_weights)
        if j==1:cable('Back / optical spine '+str(sign),[(x+sign*.4,103,-8.4),(x+sign*.4,112,-10.4),(x+sign*.4,124,-12.4),(x+sign*.4,137,-12.4),(x+sign*.4,146,-7.4)],.14,'electric','Spine2',spine_weights)
    for y,bone in [(106,'Hips'),(124,'Spine1'),(143,'Spine2')]:
        box('Back / cable clip '+str(sign)+str(y),(sign*3.4,y,-12.0),(2.5,1,1.2),'silver',bone,'detail',.25)

# ----- Limb shells: shaped open-backed armor over actual drive rods -----
def limb_shell(name, a, b, r0, r1, depth0, depth1, bone, front=True):
    a,b=Vector(a),Vector(b)
    axis=(b-a).normalized()
    front_dir=Vector((0,0,1))
    side=axis.cross(front_dir).normalized()
    profile=[(i/24,.84+.16*math.sin(math.pi*i/24)**.65) for i in range(25)]
    count=41
    verts=[]
    for t,f in profile:
        if name.endswith('shoulder cap'):
            f*=max(.012,math.sin(min(1,t/.25)*math.pi/2)**.65)
        for j in range(count):
            theta=-.14+(math.pi+.28)*j/(count-1)+(0 if front else math.pi)
            # Curved cutbacks expose each bearing; a fuller middle gives the
            # limb an anatomical taper instead of a straight cylindrical sleeve.
            cutback=.09*max(0,math.sin(theta))**4
            tt=cutback+(1-2*cutback)*t
            p=a.lerp(b,tt)
            u=math.copysign(abs(math.cos(theta))**.96,math.cos(theta))
            v=math.copysign(abs(math.sin(theta))**.96,math.sin(theta))
            verts.append(tuple(p+side*u*(r0*(1-t)+r1*t)*f+front_dir*v*(depth0*(1-t)+depth1*t)*f))
    faces=[((i+1)*count+j,(i+1)*count+j+1,i*count+j+1,i*count+j) for i in range(len(profile)-1) for j in range(count-1)]
    o=mesh(name,verts,faces,'white',bone)
    sol=o.modifiers.new('Polymer shell thickness','SOLIDIFY');sol.thickness=.58;sol.offset=-1
    o.modifiers.move(len(o.modifiers)-1,0)
    finish_edges(o,.27,3)
    return o

def shoe_upper(name,x,sections,bone):
    count=33
    verts=[]
    for z,width,top in sections:
        for i in range(count):
            theta=math.pi*i/(count-1)
            verts.append((x+width*math.cos(theta),2.5+(top-2.5)*math.sin(theta)**.65,z))
    faces=[(j*count+i,j*count+i+1,(j+1)*count+i+1,(j+1)*count+i) for j in range(len(sections)-1) for i in range(count-1)]
    o=mesh(name,verts,faces,'white',bone)
    sol=o.modifiers.new('Foot shell thickness','SOLIDIFY');sol.thickness=.65;sol.offset=-1;o.modifiers.move(len(o.modifiers)-1,0)
    sub=o.modifiers.new('Sculpted instep','SUBSURF');sub.levels=2;sub.render_levels=2;o.modifiers.move(len(o.modifiers)-1,0)
    return o

for side,sign in [('Left',1),('Right',-1)]:
    for part in ['Arm','ForeArm','UpLeg','Leg']:
        bone=side+part
        b=rig.data.bones[bone_name(bone)]
        a,e=b.head_local.copy(),b.tail_local.copy()
        axis=(e-a).normalized()
        arm=part in ('Arm','ForeArm')
        p=a+axis*(6 if part=='Arm' else 5)
        q=e-axis*(4.8 if arm else 5.8)
        cfg={'Arm':(6.4,4.7,6.0,4.7),'ForeArm':(6.0,4.1,5.8,4.1),'UpLeg':(8.5,5.6,8.1,5.2),'Leg':(6.7,3.9,7.1,4.1)}[part]
        plate_obj=limb_shell(side+' / '+part+' front shell',p,q,*cfg,bone)
        # Back covers are narrower so the central drives and cables remain visible.
        if part in ('Arm','UpLeg'):
            limb_shell(side+' / '+part+' rear shell',p,q,cfg[0]*.81,cfg[1]*.8,cfg[2]*.76,cfg[3]*.75,bone,False)
        rod(side+' / '+part+' structural drive',a+axis*2,e-axis*2,2.5 if arm else 3.0,'dark',bone)
        for offset in (-1,1):
            lateral=Vector((0,offset*2.7,-2)) if arm else Vector((offset*2.7,0,-2))
            rod(side+' / '+part+' piston '+str(offset),a+axis*5+lateral,e-axis*5+lateral,.65,'silver',bone)
            rod(side+' / '+part+' actuator barrel '+str(offset),a+axis*5+lateral,a.lerp(e,.52)+lateral,1.0,'dark',bone)
        # Hinge surrounds and layered axle caps.
        sphere(side+' / '+part+' joint',a,(6.0,6.0,6.0) if part=='Arm' else ((4.4,4.4,4.4) if arm else (5.1,5.1,5.1)),'dark',bone)
        axle=Vector((0,0,1)) if arm else Vector((sign,0,0))
        radius=4.8 if part=='Arm' else (3.4 if arm else 3.9)
        rod(side+' / '+part+' titanium pivot',a+axle*3.4,a+axle*4.2,radius,'silver',bone)
        rod(side+' / '+part+' blue hub',a+axle*4.2,a+axle*4.45,radius*.65,'darkblue',bone)
        rod(side+' / '+part+' hub pin',a+axle*4.45,a+axle*4.6,.7,'silver',bone)
        ring(side+' / '+part+' machined pivot ring',a+axle*4.22,axle,radius*.84,.22,'dark',bone)
        if part!='Arm':
            ring(side+' / '+part+' optical bearing',a+axle*4.50,axle,radius*.50,.13,'electric',bone)
        # Routed back-of-limb data and power tendons with a thin optical guide.
        cable(side+' / '+part+' rear cable',[(a+axis*5+Vector((sign*1.4 if not arm else 0,0,-3.9))),(a.lerp(e,.45)+Vector((sign*1.9 if not arm else 0,0,-4.5))),(e-axis*5+Vector((sign*1.2 if not arm else 0,0,-3.3)))],.43,'rubber',bone)
        cable(side+' / '+part+' rear light guide',[(a+axis*6+Vector((sign*2.1 if not arm else 0,.8 if arm else 0,-4.0))),(a.lerp(e,.45)+Vector((sign*2.6 if not arm else 0,.8 if arm else 0,-4.6))),(e-axis*6+Vector((sign*1.9 if not arm else 0,.8 if arm else 0,-3.5)))],.13,'electric',bone)
        if part=='ForeArm':
            center=a.lerp(e,.52)
            z=center.z+5.4
            cut_window(plate_obj,(center.x,center.y,z),(8.0,2.6,7))
            inspection(side+' forearm inspection',(center.x,center.y,z-.15),8.0,2.6,bone)
        if part=='Leg':
            center=a.lerp(e,.46)
            # Window offset toward outer calf; still readable from front/three-quarter.
            x=center.x+sign*2.2
            z=center.z+6.1
            cut_window(plate_obj,(x,center.y,z),(2.2,8.1,7))
            inspection(side+' calf inspection',(x,center.y,z-.05),2.2,8.1,bone)
        armor_surface=BVHTree.FromPolygons([v.co for v in plate_obj.data.vertices],[list(p.vertices) for p in plate_obj.data.polygons])
        for t in (.22,.78):
            c=a.lerp(e,t)
            z=c.z+(cfg[2]*(1-t)+cfg[3]*t)
            for offset in (-1,1):
                co=c+Vector((0,offset*cfg[0]*.72,z-c.z)) if arm else c+Vector((offset*cfg[0]*.7,0,z-c.z))
                hit=armor_surface.ray_cast(Vector((co.x,co.y,50)),Vector((0,0,-1)))[0]
                if hit is not None:
                    rod(side+' / '+part+' shell screw '+str(t)+str(offset),hit,hit+Vector((0,0,.10)),.24,'silver',bone,'detail',12)
    # Modest shoulder armor leaves room for the monitor head.
    b=rig.data.bones[bone_name(side+'Arm')]
    c=b.head_local
    shoulder_axis=(b.tail_local-c).normalized()
    limb_shell(side+' / shoulder cap',c-shoulder_axis*4,c+shoulder_axis*10,8.0,6.8,7.8,6.3,side+'Arm')
    inspection(side+' shoulder sensor',(c.x+sign*3.1,c.y+2.9,c.z+6.6),2.7,1.75,side+'Arm')
    # Elbow cable has a controlled loop on the rear side and smooth joint weights.
    c=rig.data.bones[bone_name(side+'ForeArm')].head_local
    fn=blend_axis(side+'Arm',side+'ForeArm',0,c.x-sign*4,c.x+sign*5)
    for j in range(2):
        cable(side+' / elbow flex '+str(j),[(c.x-sign*7,c.y+j*.9,c.z-4),(c.x-sign*3,c.y+j*.9-1,c.z-6.3),(c.x+sign*3,c.y+j*.9-1,c.z-6.3),(c.x+sign*8,c.y+j*.9,c.z-3.8)],.43,'rubber' if j==0 else 'darkblue',side+'ForeArm',fn)
    # Knee cable runs behind the pivot, tucked inside the limb silhouette.
    c=rig.data.bones[bone_name(side+'Leg')].head_local
    fn=blend_axis(side+'Leg',side+'UpLeg',1,c.y-6,c.y+6)
    for j in range(2):
        cable(side+' / knee flex '+str(j),[(c.x+sign*(2+j*.85),c.y+8,c.z-4),(c.x+sign*(3+j*.85),c.y+3,c.z-6),(c.x+sign*(3+j*.85),c.y-3,c.z-6),(c.x+sign*(2+j*.85),c.y-8,c.z-3.8)],.47,'rubber',side+'Leg',fn)
    c=rig.data.bones[bone_name(side+'Leg')].head_local
    sculpted_panel(side+' / kneecap',[(c.x-3.7,c.y+4),(c.x+3.7,c.y+4),(c.x+3,c.y-4.2),(c.x,c.y-5),(c.x-3,c.y-4.2)],c.z+3.9,c.z+5.4,1.1,'white',side+'Leg')
    # Heel and split toe shoes leave the original foot/toe articulation intact.
    foot=rig.data.bones[bone_name(side+'Foot')].head_local
    x=foot.x
    sphere(side+' / ankle bearing',foot,(3.5,3.5,3.5),'dark',side+'Foot')
    rod(side+' / ankle axle',(foot.x-sign*3.4,foot.y,foot.z),(foot.x+sign*3.4,foot.y,foot.z),1.9,'silver',side+'Foot')
    box(side+' / foot sole',(x,1.35,3.6),(11.1,2.4,21),'rubber',side+'Foot','frame',1.0)
    shoe_upper(side+' / sculpted heel and instep',x,[(-8,4.0,5.9),(-7,4.7,8.2),(-4,5.2,10.6),(0,5.25,11.2),(5,5.25,8.6),(9,5.1,6.4),(11,5.0,5.9)],side+'Foot')
    box(side+' / toe sole',(x,1.3,16.2),(11.0,2.3,10.8),'rubber',side+'ToeBase','frame',1)
    shoe_upper(side+' / sculpted toe',x,[(11.5,5.05,5.7),(13,5.3,6.1),(17,5.3,5.7),(20,4.8,4.7),(21.3,4.2,3.4)],side+'ToeBase')
    for z,width,top in [(1,5.2,10.8),(6.0,5.2,7.9)]:
        points=[(x+width*math.cos(math.pi*t/20),2.5+(top-2.5)*math.sin(math.pi*t/20)**.65+.1,z) for t in range(1,20)]
        cable(side+' / instep panel seam '+str(z),points,.07,'ink',side+'Foot',group='detail')
    box(side+' / heel marker',(x,6.5,-8.2),(4,1,.22),'lavender',side+'Foot','detail',.1)
    # Compact mechanical hands made around every original finger segment.
    hand=rig.data.bones[bone_name(side+'Hand')]
    sphere(side+' / wrist bearing',hand.head_local,(2.5,2.5,2.5),'rubber',side+'Hand')
    rod(side+' / wrist collar',hand.head_local-Vector((sign*.6,0,0)),hand.head_local+Vector((sign*.8,0,0)),2.6,'silver',side+'Hand')
    hc=hand.head_local.lerp(hand.tail_local,.44)
    box(side+' / palm chassis',hc,(7.5,7.9,3.9),'dark',side+'Hand','frame',1.2)
    box(side+' / palm dorsal cover',hc+Vector((0,0,-2)),(6.7,6.9,1.45),'white',side+'Hand','shell',1.1)
    box(side+' / metacarpal front plate',hc+Vector((0,0,2)),(6.7,6.9,1.0),'white',side+'Hand','shell',.8)
    for j in range(3):
        box(side+' / palm seam '+str(j),hc+Vector((0,(j-1)*1.5,2.52)),(3.8,.14,.06),'ink',side+'Hand','detail',.025)
    for b in rig.data.bones:
        if b.name.startswith(bone_name(side+'Hand')) and b.name[-1:] in ('1','2','3'):
            a,e=b.head_local,b.tail_local
            axis=(e-a).normalized()
            sphere(b.name+' / knuckle',a,(.96,.96,.96),'dark',b.name)
            rod(b.name+' / phalange',a+axis*.5,e-axis*.35,.90 if b.name.endswith('1') else .77,'silver',b.name,'shell',16)
            rod(b.name+' / tendon',a+Vector((0,0,-.83)),e+Vector((0,0,-.72)),.2,'dark',b.name,'detail',12)

# ----- Neck: central bearing with four routed cable tendons -----
rod('Neck / main bearing',(0,147.5,-2),(0,162.6,-1),3.5,'dark','Neck')
for i in range(4):
    rod('Neck / articulation ring '+str(i),(0,150+i*2.7,-1.8),(0,150.7+i*2.7,-1.8),4.3,'silver','Neck')
for sign in (-1,1):
    for j in range(2):
        cable('Neck / paired tendon '+str(sign)+str(j),[(sign*5.8,147,-1+j*2),(sign*5.5,152,-1+j*2),(sign*4.3,157,-.5+j*2),(sign*4.9,162.3,1+j*2)],.48,'rubber' if j==0 else 'darkblue','Neck',blend_axis('Spine2','Head',1,149,163))
        rod('Neck / lower plug '+str(sign)+str(j),(sign*5.8,146.5,-1+j*2),(sign*5.8,148,-1+j*2),.72,'silver','Spine2')
    cable('Neck / blue guide '+str(sign),[(sign*5.5,147,-1),(sign*5.2,152,-.7),(sign*4.8,158,1),(sign*5.4,162.3,1.6)],.15,'electric','Neck',blend_axis('Spine2','Head',1,149,163))

# ----- The signature cloud head: a continuous hollow manufactured housing -----
N=128
cloud_circles=[(-6.0,8.1,8),(5.5,7.5,8),(-11,1,7),(11,1,7),(-8.1,-6.5,6.8),(7.8,-6.5,6.8),(0,0,11.5)]
radii=[]
for i in range(N):
    a=2*math.pi*i/N;dx,dy=math.cos(a),math.sin(a)
    choices=[]
    for x,y,r in cloud_circles:
        dot=x*dx+y*dy;disc=r*r-x*x-y*y+dot*dot
        if disc>=0:choices.append(dot+math.sqrt(disc))
    radii.append(max(choices)*1.05)
for _ in range(5):
    radii=[.2*radii[(i-1)%N]+.6*radii[i]+.2*radii[(i+1)%N] for i in range(N)]
outer=[Vector((radii[i]*math.cos(2*math.pi*i/N),173.1+radii[i]*math.sin(2*math.pi*i/N))) for i in range(N)]
def face_loop(width,height,center_y):
    points=[]
    for i in range(N):
        a=2*math.pi*i/N;c,s=math.cos(a),math.sin(a);p=5.2
        r=(abs(c/(width/2))**p+abs(s/(height/2))**p)**(-1/p)
        points.append(Vector((r*c,center_y+r*s)))
    return points
inside=face_loop(24.8,18.5,171.1)
verts=[]
loops=[]
for scale,z in [(.79,-8.8),(.90,-8.1),(.99,-5.8),(1,-1),(1,4.5),(.985,7.7),(.93,10.3)]:
    loops.append([(p.x*scale,173.1+(p.y-173.1)*scale,z) for p in outer])
for t,z in [(.35,11.05),(.72,11.10),(1,10.55),(1.015,9.6),(1.015,8.4)]:
    loop=[]
    for o,p in zip(outer,inside):
        q=Vector((o.x*.93,173.1+(o.y-173.1)*.93)).lerp(p,t)
        loop.append((q.x,q.y,z))
    loops.append(loop)
verts=[v for loop in loops for v in loop]
faces=[(i*N+j,i*N+(j+1)%N,(i+1)*N+(j+1)%N,(i+1)*N+j) for i in range(len(loops)-1) for j in range(N)]
faces.append(tuple(reversed(range(N))))
housing=mesh('Head / unified scalloped pearl housing',verts,faces,'white','Head','face')
sub=housing.modifiers.new('Continuous cloud curvature','SUBSURF');sub.levels=2;sub.render_levels=2
housing.modifiers.move(len(housing.modifiers)-1,0)
housing['design_reference']='reference/futuristic-cloud-robot.png'
box('Head / recessed monitor',(0,171.1,9.25),(24.72,18.42,1.25),'screen','Head','face',2.2)
# The face is physical luminous geometry; no external font or texture is needed.
cable('Face / terminal chevron',[(-6.8,174.8,10.01),(-3.4,171.25,10.01),(-6.8,167.7,10.01)],.65,'light','Head',group='face')
cable('Face / terminal cursor',[(3.2,167.7,10.01),(8.0,167.7,10.01)],.60,'light','Head',group='face')
# Restrained industrial detailing at the rear preserves the front silhouette.
box('Head / rear service hatch',(0,171,-8.94),(15.5,12.5,1.0),'white','Head','face',2)
for i in range(5):
    box('Head / rear vent '+str(i),(0,168.7+i*1.35,-9.54),(8.5,.37,.20),'rubber','Head','detail',.15)
for sign in (-1,1):
    for y in (166.4,175.6):
        rod('Head / rear captive screw '+str(sign)+str(y),(sign*5.7,y,-9.5),(sign*5.7,y,-9.65),.32,'silver','Head','detail',16)

# Pack the supplied reference into the Blender file for convenient art review.
reference=bpy.data.images.load(str(OUT/'reference/monitor-head.png'),check_existing=True)
reference.use_fake_user=True
reference.pack()
reference=bpy.data.images.load(str(OUT/'reference/futuristic-cloud-robot.png'),check_existing=True)
reference.use_fake_user=True
reference.pack()

# ----- Studio, presentation cameras and persisted review pose -----
rig.data.pose_position='POSE'
rig.animation_data_create()
rig.animation_data.action=bpy.data.actions['idle.relaxed']
if rig.animation_data.action.slots:
    rig.animation_data.action_slot=rig.animation_data.action.slots[0]
scene.render.fps=60
scene.frame_set(60)
bpy.context.view_layer.update()

stage_mat=material('Studio / charcoal floor','13171D',.40,.12)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.007))
floor=bpy.context.object;floor.name='Studio / seamless floor';floor.data.materials.append(stage_mat)
for c in list(floor.users_collection):c.objects.unlink(floor)
groups['stage'].objects.link(floor)
scene.world=bpy.data.worlds.new('Studio / neutral environment');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.15,.21,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.10

def area(name, position, target, power, size, color, size_y=None):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='RECTANGLE' if size_y else 'DISK';d.size=size
    if size_y:d.size_y=size_y
    d.color=color
    o=bpy.data.objects.new(name,d);groups['stage'].objects.link(o);o.location=position
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o
area('Studio / key softbox',(-2.7,-3.6,4.0),(0,0,1),430,2.2,(.84,.91,1),3.5)
area('Studio / cool fill',(2.5,-1.3,2.5),(0,0,1.1),90,2.0,(.68,.79,1),3.0)
area('Studio / warm edge strip',(1.6,2.4,3.0),(0,0,1.2),600,1.0,(1,.85,.67),3)
area('Studio / frontal bounce',(-.3,-4,1.5),(0,0,1.1),45,3,(1,1,1))

def camera(name, location, target, ortho, lens=65):
    d=bpy.data.cameras.new(name);d.type='ORTHO';d.ortho_scale=ortho;d.lens=lens
    o=bpy.data.objects.new(name,d);groups['stage'].objects.link(o);o.location=location
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o
camera('CAM / hero',(2.4,-4.8,1.9),(0,0,1.0),2.34)
camera('CAM / front',(0,-5,1.12),(0,0,1.01),2.27)
camera('CAM / side',(5,0,1.15),(0,0,1.0),2.27)
camera('CAM / back',(0,5,1.15),(0,0,1.0),2.27)
camera('CAM / head',(1.6,-4,2.12),(0,0,1.70),.68)
camera('CAM / window',(1.3,-3.0,1.28),(.26,-.06,1.09),.49)
scene.camera=bpy.data.objects['CAM / hero']
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.cycles.max_bounces=8;scene.cycles.transmission_bounces=6
scene.render.resolution_x=1500;scene.render.resolution_y=1800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.film_transparent=False
scene.render.filepath=str(OUT/'renders/hero.png')
scene['design']='Codex Android / 01 · precision android with cloud monitor head'
scene['review_action']='idle.relaxed, frame 60'
scene['scope']='Blender design review; runtime integration is deferred.'
scene['reference_urls']='https://openai.com/codex/ | https://openai.com/brand/'
scene.unit_settings.system='METRIC'
scene.unit_settings.length_unit='METERS'
rig.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
housing.select_set(True);bpy.context.view_layer.objects.active=housing
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.shading.type='MATERIAL'
            a.spaces.active.overlay.show_overlays=False
assert signature()==original_signature,'Canonical skeleton changed'
assert expected_actions=={a.name for a in bpy.data.actions},'Named motion clips changed'
scene.frame_start=1;scene.frame_end=240
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'codex-android.blend'))
(OUT/'reports/build.json').write_text(json.dumps(dict(
    source='art/ybot/codex-ybot-animations.blend',rig=original_signature,
    actions=sorted(expected_actions),objects=len(created),materials=[m.name for m in M.values()],
    shell_vertex_count=sum(len(o.data.vertices) for o in created),
    preserved_rig=True,blender=bpy.app.version_string),indent=2))
print('ANDROID_BUILT',len(created),'objects',len(expected_actions),'actions')
