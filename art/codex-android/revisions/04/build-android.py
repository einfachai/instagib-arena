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
M['screen'].node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = .10
M['screen'].node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = .05
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
        p.handle_left_type = p.handle_right_type = 'VECTOR' if name=='Face / terminal chevron' else 'AUTO'
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
sphere('Thorax / graphite chassis',(0,135.5,-1.8),(14.7,13.5,10.7),'dark','Spine2')
def chest_position(u,v):
    bottom=120.5+6.0*(1-u*u)**2
    top=149.7-2.9*math.exp(-(u/.43)**4)-.6*u*u
    y=bottom+(top-bottom)*v
    # A broad clavicle line and tapered lower ribs create an athletic thorax.
    width=13.0+4.5*math.sin(math.pi*v)**.60
    x=u*width
    z=-4.4+18.4*max(0,1-u*u)**.63+1.25*math.sin(math.pi*v)
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
chest_surface=BVHTree.FromPolygons([v.co for v in chest.data.vertices],[list(p.vertices) for p in chest.data.polygons])
mark_points=[]
for x,y in cloud_mark:
    hit=chest_surface.ray_cast(Vector((x,y+1.4,50)),Vector((0,0,-1)))[0]
    mark_points.append(hit+Vector((0,0,.06)))
cable('Chest / cloud insignia',mark_points,.15,'ink','Spine2',group='detail')
text_mark('Chest / unit designation','C A  /  0 2',(0,136.0,15.25),.50,'ink','Spine2')
sensor=chest_position(-.61,.71)
cut_window(chest,sensor,(1.8,4.6,16))
inspection('Thorax inspection',sensor,1.8,4.6,'Spine2')
for sign in (-1,1):
    x=sign*7
    rod('Thorax / longitudinal spar '+str(sign),(x,125,-6),(x,146,-6),1.3,'silver','Spine2')
    cable('Thorax / shoulder fibre '+str(sign),[(sign*5,146,-6),(sign*10,146,-7.3),(sign*14,141,-6),(sign*12,130,-5)],.18,'electric','Spine2')
ring('Collar / inset neck gasket',(0,150.0,-2),(0,1,0),6.0,.55,'rubber','Spine2')
# Raised collar blends into the chest and trapezius armor around an open neck.
verts=[]; rings=7; steps=96
for j in range(rings):
    t=j/(rings-1)
    for i in range(steps):
        a=2*math.pi*i/steps;cs,sn=math.cos(a),math.sin(a)
        inner=Vector((6.6*cs,150.1,-2+5.8*sn))
        outer=Vector(chest_position(cs,1)) if sn>=0 else Vector((13.0*cs,149.1-.7*abs(sn),-4.4+8.0*sn))
        point=inner.lerp(outer,t)
        point.y+=.25*math.sin(t*math.pi)
        verts.append(tuple(point))
faces=[(j*steps+i,j*steps+(i+1)%steps,(j+1)*steps+(i+1)%steps,(j+1)*steps+i) for j in range(rings-1) for i in range(steps)]
yoke=mesh('Thorax / sculpted clavicle yoke',verts,faces,'white','Spine2')
sol=yoke.modifiers.new('Collar wall','SOLIDIFY');sol.thickness=.65;yoke.modifiers.move(len(yoke.modifiers)-1,0)
finish_edges(yoke,.24,3)

for i,(y,w,bone) in enumerate([(123.0,14,'Spine1'),(116.5,12,'Spine'),(110.5,14,'Spine')]):
    box('Abdomen / flexible core '+str(i),(0,y,-1.5),(w,5.8,9),'rubber',bone,'frame',1.8)
    for sign in (-1,1):
        rod('Abdomen / exposed piston '+str(i)+str(sign),(sign*6.5,y-2.8,3.8),(sign*6.5,y+2.8,3.8),.8,'silver',bone)
for i,(y,bone) in enumerate([(124,'Spine1'),(118,'Spine'),(112,'Spine')]):
    box('Abdomen / exposed central actuator '+str(i),(0,y,4.1),(6.2,5.4,2.5),'dark',bone,'frame',.6)
    box('Abdomen / actuator access '+str(i),(0,y,5.5),(3.8,3.2,.25),'dark',bone,'detail',.35)
    for sx in (-1,1):
        for sy in (-1,1):
            rod('Abdomen / access fastener '+str(i)+str(sx)+str(sy),(sx*2.2,y+sy*1.75,5.35),(sx*2.2,y+sy*1.75,5.48),.14,'silver',bone,'detail',8)
for sign in (-1,1):
    rod('Abdomen / axial piston '+str(sign),(sign*3.6,108,4.5),(sign*3.6,127,4.5),.65,'silver','Spine')
for sign in (-1,1):
    for i in range(3):
        y=112.5+i*5
        rod('Waist / lateral tendon '+str(sign)+str(i),(sign*(6.5+i*.4),y-1.5,-1),(sign*(7+i*.6),y+2.5,-1),.72,'silver','Spine' if i<2 else 'Spine1')
    cable('Waist / data loom '+str(sign),[(sign*9.4,126,-3),(sign*10.2,119,-3.5),(sign*9.3,112,-4),(sign*9,104,-4)],.48,'rubber','Spine',blend_axis('Hips','Spine1',1,105,128))
    for j in range(5):
        x=sign*(4.8+j*.8)
        points=[(x+sign*4.0,129,2.0),(x+sign*1.8,123,5.6),(x*.78,116,5.0),(x*.93,108,3.8),(x,103,1.8)]
        cable('Waist / exposed cable '+str(sign)+str(j),points,.4,'darkblue' if j==1 else 'rubber','Spine',blend_axis('Hips','Spine1',1,105,128))
        if j in (1,3):cable('Waist / blue optical fibre '+str(sign)+' '+str(j),[(x+.35*sign,y,z+.28) for x,y,z in points],.13,'electric','Spine',blend_axis('Hips','Spine1',1,105,128))

sphere('Pelvis / drive cage',(0,99,-1.1),(13.0,7.5,8.5),'dark','Hips')
def pelvis_position(u,v):
    bottom=88.2+4.0*abs(u)**3
    top=105.0+3.0*u*u
    return (u*(5.7+8.8*v),bottom+(top-bottom)*v,5.9+5.0*max(0,1-u*u)**.6+.6*math.sin(math.pi*v))
nu,nv=49,33
verts=[pelvis_position(-1+2*i/(nu-1),j/(nv-1)) for j in range(nv) for i in range(nu)]
faces=[(j*nu+i,j*nu+i+1,(j+1)*nu+i+1,(j+1)*nu+i) for j in range(nv-1) for i in range(nu-1)]
pelvis=mesh('Pelvis / contoured hip shell',verts,faces,'white','Hips')
sol=pelvis.modifiers.new('Pelvis wall','SOLIDIFY');sol.thickness=.85;sol.offset=-1;pelvis.modifiers.move(len(pelvis.modifiers)-1,0)
finish_edges(pelvis,.26,3)
points=[Vector(pelvis_position(u,.74))+Vector((0,0,.06)) for u in [-.9,-.7,-.4,0,.4,.7,.9]]
cable('Pelvis / upper service seam',points,.055,'ink','Hips',group='detail')
rear=mesh('Pelvis / cupped dorsal shell',[(x,y,-1.1-z*.87) for x,y,z in verts],[tuple(reversed(f)) for f in faces],'white','Hips')
sol=rear.modifiers.new('Rear pelvis wall','SOLIDIFY');sol.thickness=.85;sol.offset=-1;rear.modifiers.move(len(rear.modifiers)-1,0)
finish_edges(rear,.26,3)
box('Pelvis / belt inset',(0,103.7,11.75),(6.0,1.5,.40),'dark','Hips','detail',.35)
box('Pelvis / belt indicator',(0,103.7,11.98),(2.9,.25,.1),'blue','Hips','detail',.10)

# Spine service harness: clips, connectors and two continuous skinned looms.
for i,(y,bone) in enumerate([(104,'Hips'),(114,'Spine'),(123,'Spine1')]):
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

# The orthographic sheet has a unified back shell with a central status light.
def back_position(u,v):
    x=chest_position(u,v)[0]
    bottom=122.5+1.8*u*u
    top=148.5-1.9*math.exp(-(u/.43)**4)
    return (x,bottom+(top-bottom)*v,-3.0-9.8*max(0,1-u*u)**.64-.5*math.sin(math.pi*v))
nu,nv=49,33
verts=[back_position(-1+2*i/(nu-1),j/(nv-1)) for j in range(nv) for i in range(nu)]
faces=[((j+1)*nu+i,(j+1)*nu+i+1,j*nu+i+1,j*nu+i) for j in range(nv-1) for i in range(nu-1)]
back=mesh('Thorax / unified dorsal armor',verts,faces,'white','Spine2')
sol=back.modifiers.new('Dorsal wall','SOLIDIFY');sol.thickness=.75;sol.offset=-1;back.modifiers.move(len(back.modifiers)-1,0)
finish_edges(back,.22,3)
for sign in (-1,1):
    points=[Vector(back_position(sign*.7,v))+Vector((0,0,-.05)) for v in (.10,.24,.42,.61,.80)]
    cable('Thorax / dorsal panel seam '+str(sign),points,.052,'ink','Spine2',group='detail')
back_surface=BVHTree.FromPolygons([v.co for v in back.data.vertices],[list(p.vertices) for p in back.data.polygons])
back_mark=[]
for x,y in cloud_mark:
    hit=back_surface.ray_cast(Vector((x,y+3.3,-50)),Vector((0,0,1)))[0]
    back_mark.append(hit+Vector((0,0,-.06)))
cable('Back / cloud insignia',back_mark,.15,'ink','Spine2',group='detail')
cable('Back / vertical status light',[(0,134,-13.32),(0,138.0,-13.31)],.18,'electric','Spine2',group='detail')

# ----- Limb shells: shaped open-backed armor over actual drive rods -----
def limb_shell(name, a, b, r0, r1, depth0, depth1, bone, front=True):
    a,b=Vector(a),Vector(b)
    axis=(b-a).normalized()
    front_dir=Vector((0,0,1))
    side=axis.cross(front_dir).normalized()
    profile=[(i/32,.88+.12*math.sin(math.pi*i/32)**.65) for i in range(33)]
    shoulder=name.endswith('shoulder cap')
    count=65 if shoulder else 49
    verts=[]
    for t,f in profile:
        if 'UpLeg' in name:
            f=.76+.33*math.sin(math.pi*t)**.7
        elif 'Leg' in name:
            f=.80+.27*math.sin(math.pi*t)**.85
        elif 'ForeArm' in name:
            f=.78+.30*math.sin(math.pi*t)**.7
        if shoulder:
            f*=max(.025,math.sin(min(1,t/.34)*math.pi/2)**.7)
        for j in range(count):
            theta=(1.22+3.84*j/(count-1) if shoulder else -.32+(math.pi+.64)*j/(count-1)+(0 if front else math.pi))
            # Curved cutbacks expose each bearing; a fuller middle gives the
            # limb an anatomical taper instead of a straight cylindrical sleeve.
            frontal=max(0,math.sin(theta))**4
            upper=(.035 if shoulder else (.23 if 'UpLeg' in name else (.24 if 'Leg' in name else .10)))*frontal
            lower=(.035 if shoulder else (.055 if 'UpLeg' in name else .09))*frontal
            tt=upper+(1-upper-lower)*t
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

def oriented_panel(name,outline,origin,u,v,n,zback,zfront,bulge,mat,bone,group='shell'):
    o=sculpted_panel(name,outline,zback,zfront,bulge,mat,bone,group)
    origin,u,v,n=map(Vector,(origin,u,v,n))
    for vert in o.data.vertices:
        p=vert.co.copy();vert.co=origin+u*p.x+v*p.y+n*p.z
    if u.cross(v).dot(n)<0:
        for poly in o.data.polygons:poly.flip()
    return o

def deltoid_cap(side,sign,center,axis):
    # A continuous cupped cap over the joint. Its lower opening exposes the
    # inboard mechanism; the old cap left the front of the ball uncovered.
    count=65;rows=33;verts=[]
    up=Vector((0,1,0));front=Vector((0,0,1))
    for i in range(rows):
        t=i/(rows-1)
        length=-4.8+13.3*t
        radial=.53+.48*math.sin(math.pi*t*.87)**.62
        for j in range(count):
            theta=.48+(2*math.pi-.96)*j/(count-1)
            # Arc is centered on the top of the arm, extending around both faces.
            y=-math.cos(theta)*(7.5*(1-t)+6.2*t)*radial
            z=math.sin(theta)*(8.35*(1-t)+6.7*t)*radial
            point=center+axis*(length-2.6*t*t*max(0,math.sin(theta))**4)+up*y+front*z
            verts.append(tuple(point))
    faces=[(i*count+j,i*count+j+1,(i+1)*count+j+1,(i+1)*count+j) for i in range(rows-1) for j in range(count-1)]
    o=mesh(side+' / shoulder cap',verts,faces,'white',side+'Arm')
    # Local winding differs across mirrored arms.
    if sign>0:
        for poly in o.data.polygons:poly.flip()
    sol=o.modifiers.new('Deltoid shell wall','SOLIDIFY');sol.thickness=.72;sol.offset=-1;o.modifiers.move(len(o.modifiers)-1,0)
    finish_edges(o,.25,3)
    # Molded lip follows the distal opening. Thin graphite seam, recessed vent.
    for t,label in [(.84,'distal service seam')]:
        points=[]
        radial=.53+.48*math.sin(math.pi*t*.87)**.62
        for j in range(35):
            theta=.61+(2*math.pi-1.22)*j/34
            points.append(center+axis*(-4.8+13.3*t-2.6*t*t*max(0,math.sin(theta))**4)+up*(-math.cos(theta)*(7.5*(1-t)+6.2*t)*radial)+front*(math.sin(theta)*(8.35*(1-t)+6.7*t)*radial))
        cable(side+' / shoulder '+label,points,.055,'ink',side+'Arm',group='detail')
    for i in range(3):
        c=center+axis*(2.2+i*.8)+up*6.92
        # The vents are on the outward surface when the arms are lowered.
        rod(side+' / deltoid inset vent '+str(i),c+front*1.5,c+front*3.5,.14,'ink',side+'Arm','detail',12)
    return o

def boot_loft(name,x,sections,bone,material_key='white',base=2.8):
    # Closed cross-sections remove the open ends and paper-thin slipper profile.
    count=48;verts=[]
    for z,width,top in sections:
        for i in range(count):
            theta=2*math.pi*i/count
            s=math.sin(theta)
            y=base+(top-base)*max(0,s)**.66 if s>=0 else base+.30*s
            verts.append((x+width*math.cos(theta),y,z))
    faces=[(j*count+i,j*count+(i+1)%count,(j+1)*count+(i+1)%count,(j+1)*count+i) for j in range(len(sections)-1) for i in range(count)]
    faces += [tuple(reversed(range(count))),tuple(range((len(sections)-1)*count,len(sections)*count))]
    o=mesh(name,verts,faces,material_key,bone)
    sub=o.modifiers.new('Molded boot curvature','SUBSURF');sub.levels=2;sub.render_levels=2;o.modifiers.move(len(o.modifiers)-1,0)
    return o

def sole_loft(name,x,sections,bone):
    # Chamfered, shaped outsole with a raised toe and a thicker heel.
    verts=[];count=8
    for z,width,lift in sections:
        for dx,dy in [(-.90,0),(.90,0),(1,.4),(1,1.9),(.87,2.55),(-.87,2.55),(-1,1.9),(-1,.4)]:
            verts.append((x+width*dx,.2+lift+dy,z))
    faces=[(j*count+i,j*count+(i+1)%count,(j+1)*count+(i+1)%count,(j+1)*count+i) for j in range(len(sections)-1) for i in range(count)]
    faces += [tuple(reversed(range(count))),tuple(range((len(sections)-1)*count,len(sections)*count))]
    return mesh(name,verts,faces,'rubber',bone,'frame',.18)

def build_boot(side,sign):
    bone=side+'Foot';toe=side+'ToeBase'
    foot=rig.data.bones[bone_name(bone)].head_local;x=foot.x
    sphere(side+' / ankle bearing',foot,(3.6,3.8,3.6),'dark',bone)
    for direction in (-1,1):
        axis=Vector((direction,0,0))
        rod(side+' / ankle recessed axle '+str(direction),foot+axis*3.25,foot+axis*3.9,2.9,'silver',bone)
        rod(side+' / ankle axle inset '+str(direction),foot+axis*3.92,foot+axis*4.03,2.16,'dark',bone)
        ring(side+' / ankle axle seal '+str(direction),foot+axis*4.07,axis,1.65,.13,'darkblue',bone)
    sole_loft(side+' / contoured rear outsole',x,[(-8.4,3.7,.45),(-8.0,4.65,.05),(-5,5.0,0),(0,4.7,.05),(5,5.0,.05),(10.95,5.75,.03)],bone)
    sole_loft(side+' / articulated toe outsole',x,[(11.35,5.75,.03),(15.6,5.85,.08),(18.7,5.5,.23),(21.0,4.65,.65),(21.4,3.8,.85)],toe)
    boot_loft(side+' / molded heel and instep',x,[(-8.05,2.9,5.3),(-7.8,4.1,7.1),(-6.4,4.5,9.7),(-3,4.6,12.25),(0,4.6,12.5),(4.7,4.8,11.1),(8.8,5.35,8.8),(10.95,5.5,8.2)],bone)
    boot_loft(side+' / rounded articulated toe box',x,[(11.35,5.5,8.15),(12.1,5.65,8.1),(16,5.55,7.8),(19.2,5.05,6.9),(20.5,4.25,5.5),(20.85,3.6,4.35)],toe)
    # Heel counter and side panels give the boot structure around the ankle.
    for direction in (-1,1):
        panel=[(-7.0,3.2),(-7.2,7.3),(-4.7,10.0),(-1.8,9.6),(1.8,5.6),(4.4,3.4)]
        oriented_panel(side+' / heel counter '+str(direction),panel,(x+direction*4.38,0,0),(0,0,1),(0,1,0),(direction,0,0),0,.40,.30,'white',bone)
        for z in (-6.2,-2.5,4.0,8.1,14.5,18.0):
            width=4.8 if z<4 else (5.25 if z<10 else 5.55)
            box(side+' / outsole side lug '+str(direction)+' '+str(z),(x+direction*width,1.15,z),(1.0,1.8,1.9),'dark',bone if z<11 else toe,'frame',.24)
    # Raised instep plates follow the sloped boot surface, separated by gaskets.
    for z,top,width in [(-.8,12.35,3.65),(3.8,11.42,3.8),(7.7,9.35,4.2)]:
        outline=[(-width,-1.6),(width,-1.6),(width+.1,.8),(width*.80,1.5),(-width*.80,1.5),(-width-.1,.8)]
        # local v points along the foot; each plate is tilted with the instep.
        v=Vector((0,-.22 if z<4 else -.42,1)).normalized();n=Vector((0,v.z,-v.y))
        origin=Vector((x,top-.10,z))
        oriented_panel(side+' / instep gasket '+str(z),outline,origin,(1,0,0),v,n,-.18,.02,.08,'rubber',bone,'frame')
        oriented_panel(side+' / instep armor '+str(z),[(a*.95,b*.85) for a,b in outline],origin,(1,0,0),v,n,.03,.35,.25,'white',bone)
    # Toe bumper wraps the front, heel marker is inset into the counter.
    boot_loft(side+' / toe bumper',x,[(20.1,4.25,4.8),(20.7,4.1,4.6),(21.1,3.6,3.6)],toe,'dark',1.55)
    box(side+' / heel marker',(x,6.3,-7.95),(3.4,.65,.22),'darkblue',bone,'detail',.12)

def finger_volume(name,a,b,width,depth,mat,bone):
    axis=(b-a).normalized()
    across=Vector((0,0,1));across=(across-axis*across.dot(axis)).normalized()
    dorsal=across.cross(axis).normalized()
    if dorsal.y<0:dorsal=-dorsal
    count=16;verts=[]
    for t,factor in [(0,.76),(.10,.97),(.30,1),(.76,.95),(.94,.85),(1,.66)]:
        p=a.lerp(b,t)
        for j in range(count):
            angle=2*math.pi*j/count
            c,s=math.cos(angle),math.sin(angle)
            u=math.copysign(abs(c)**.52,c)*width*.5*factor
            v=math.copysign(abs(s)**.52,s)*depth*.5*factor
            verts.append(tuple(p+across*u+dorsal*v))
    faces=[(i*count+j,i*count+(j+1)%count,(i+1)*count+(j+1)%count,(i+1)*count+j) for i in range(5) for j in range(count)]
    faces += [tuple(reversed(range(count))),tuple(range(5*count,6*count))]
    if across.cross(dorsal).dot(axis)<0:
        faces=[tuple(reversed(f)) for f in faces]
    o=mesh(name,verts,faces,mat,bone,'frame')
    sub=o.modifiers.new('Rounded finger segment','SUBSURF');sub.levels=1;sub.render_levels=1;o.modifiers.move(len(o.modifiers)-1,0)
    return axis,across,dorsal

def build_hand(side,sign):
    bone=side+'Hand';hand=rig.data.bones[bone_name(bone)];origin=hand.head_local.copy()
    u=Vector((sign,0,0));v=Vector((0,0,1));n=Vector((0,1,0))
    sphere(side+' / wrist bearing',origin,(2.65,2.65,2.65),'rubber',bone)
    rod(side+' / wrist socket',origin-u*.65,origin+u*.7,2.95,'dark',bone)
    ring(side+' / wrist collar',origin+u*.65,u,2.72,.22,'silver',bone)
    outline=[(.6,-2.8),(2.3,-4.2),(9.5,-5.2),(11.45,-4.5),(12.1,-2.5),(12.2,.2),(11.9,2.9),(9.8,4.0),(5.2,3.8),(3.0,2.8),(.6,2.5)]
    # The source hand's width runs across Z, not Y. Correcting this plane makes
    # the palm connect to all four metacarpals instead of sitting edge-on.
    oriented_panel(side+' / anatomical palm chassis',outline,origin,u,v,n,-1.7,1.1,.3,'dark',bone,'frame')
    cover=[(1.5,-2.45),(3.4,-3.65),(9.8,-4.45),(11.0,-3.8),(11.4,-1.5),(11.6,.7),(10.9,2.8),(7.5,3.5),(4.0,2.9),(1.5,2.3)]
    oriented_panel(side+' / dorsal hand armor',cover,origin,u,v,n,1.0,1.85,.60,'white',bone)
    # Palm contact surface has padded rails and a thenar volume beside the thumb.
    oriented_panel(side+' / palm grip pad',[(2,-2.5),(8.9,-3.9),(10.8,-2.8),(10.7,2.2),(5.3,2.8),(2,1.9)],origin,u,v,-n,.9,1.65,.2,'rubber',bone,'frame')
    for i in range(3):
        points=[origin+u*s+v*(-2.6+i*2.0)+n*2.48 for s in (5.7,7.3,9.5)]
        cable(side+' / metacarpal armor seam '+str(i),points,.06,'ink',bone,group='detail')
    for s,z in [(3.3,-2.8),(3.3,2.1),(9.6,-3.4),(9.9,2.0)]:
        p=origin+u*s+v*z+n*2.30
        rod(side+' / dorsal hand fastener '+str(s)+str(z),p,p+n*.12,.22,'silver',bone,'detail',12)
    for digit in ('Thumb','Index','Middle','Ring','Pinky'):
        width={'Thumb':2.48,'Index':2.10,'Middle':2.06,'Ring':1.97,'Pinky':1.83}[digit]
        root=rig.data.bones[bone_name(side+'Hand'+digit+'1')].head_local
        sphere(side+' / '+digit+' metacarpal socket',root,(1.22,1.22,1.22),'dark',bone)
        if digit=='Thumb':
            sphere(side+' / thumb saddle',root-u*.85,(2.15,1.9,2.0),'dark',bone)
        else:
            # Short seated drives fill the space under the knuckle lip.
            rod(side+' / '+digit+' metacarpal drive',root-u*2.0,root-u*.2,width*.43,'silver',bone)
        for segment in (1,2,3):
            b=rig.data.bones[bone_name(side+'Hand'+digit+str(segment))]
            a,e=b.head_local.copy(),b.tail_local.copy();axis=(e-a).normalized()
            w=width*(1 if segment==1 else (.96 if segment==2 else .90))
            aa=a+axis*.30;bb=e-axis*.23
            axis,across,dorsal=finger_volume(b.name+' / contoured phalange',aa,bb,w,2.25 if digit=='Thumb' else 2.05,'silver',b.name)
            # Dark hinge barrel with flush titanium end caps, no bead-like gaps.
            rod(b.name+' / hinge',a-across*w*.49,a+across*w*.49,.87 if digit=='Thumb' else .78,'dark',b.name)
            for direction in (-1,1):
                p=a+across*direction*w*.51
                rod(b.name+' / hinge cap '+str(direction),p,p+across*direction*.10,.43,'silver',b.name,'detail',12)
            # Flattened pads and a dark dorsal inset break up the metal segment.
            c=aa.lerp(bb,.5)
            ln=(bb-aa).length*.32
            pad=[(-ln,-w*.30),(ln,-w*.30),(ln,w*.30),(-ln,w*.30)]
            oriented_panel(b.name+' / tactile pad',pad,c,axis,across,-dorsal,.72,.93,.08,'rubber',b.name,'detail')
            oriented_panel(b.name+' / dorsal insert',pad,c,axis,across,dorsal,.83,.98,.06,'dark',b.name,'detail')

for side,sign in [('Left',1),('Right',-1)]:
    for part in ['Arm','ForeArm','UpLeg','Leg']:
        bone=side+part
        b=rig.data.bones[bone_name(bone)]
        a,e=b.head_local.copy(),b.tail_local.copy()
        axis=(e-a).normalized()
        arm=part in ('Arm','ForeArm')
        p=a+axis*(10.8 if part=='Arm' else (5.0 if arm else 1.4))
        q=e-axis*(4.2 if arm else 4.4)
        cfg={'Arm':(5.7,4.1,6.8,4.7),'ForeArm':(6.2,4.1,7.0,4.4),'UpLeg':(8.8,5.2,10.7,5.8),'Leg':(8.0,4.3,9.0,4.5)}[part]
        if not arm:
            # Mass sits toward the outside of the legs, preserving an inner gap.
            p.x+=sign*1.25;q.x+=sign*.45
        plate_obj=limb_shell(side+' / '+part+' front shell',p,q,*cfg,bone)
        # Back covers are narrower so the central drives and cables remain visible.
        limb_shell(side+' / '+part+' rear shell',p,q,cfg[0]*.72,cfg[1]*.77,cfg[2]*.75,cfg[3]*.76,bone,False)
        rod(side+' / '+part+' structural drive',a+axis*2,e-axis*2,3.1 if arm else 3.7,'dark',bone)
        for offset in (-1,1):
            lateral=Vector((0,offset*2.7,-2)) if arm else Vector((offset*2.7,0,-2))
            rod(side+' / '+part+' piston '+str(offset),a+axis*5+lateral,e-axis*5+lateral,.65,'silver',bone)
            rod(side+' / '+part+' actuator barrel '+str(offset),a+axis*5+lateral,a.lerp(e,.52)+lateral,1.0,'dark',bone)
        # Hinge surrounds and layered axle caps.
        sphere(side+' / '+part+' joint',a,(6.25,6.25,6.25) if part=='Arm' else ((5.3,5.3,5.3) if arm else (6.5,6.5,6.5)),'dark',bone)
        axle=Vector((0,0,1)) if part=='ForeArm' else Vector((sign,0,0))
        pivot_bone=side+'Shoulder' if part=='Arm' else bone
        radius=4.8 if part=='Arm' else (4.1 if arm else 5.2)
        axle_depth=2.15 if part=='Arm' else (5.3 if arm else 6.5)
        rod(side+' / '+part+' titanium pivot',a+axle*(axle_depth-.8),a+axle*(axle_depth+.15),radius,'silver',pivot_bone)
        rod(side+' / '+part+' blue hub',a+axle*(axle_depth+.15),a+axle*(axle_depth+.42),radius*.65,'dark' if part=='Arm' else 'darkblue',pivot_bone)
        rod(side+' / '+part+' hub pin',a+axle*(axle_depth+.42),a+axle*(axle_depth+.65),.85,'silver',pivot_bone)
        ring(side+' / '+part+' machined pivot ring',a+axle*(axle_depth+.20),axle,radius*.84,.22,'dark',pivot_bone)
        if part=='Arm':
            for scale in (.41,.60):
                ring(side+' / shoulder concentric bearing '+str(scale),a+axle*(axle_depth+.45),axle,radius*scale,.16,'silver',pivot_bone)
        if part!='Arm':
            ring(side+' / '+part+' optical bearing',a+axle*(axle_depth+.46),axle,radius*.50,.13,'electric',bone)
        for i in range(8):
            angle=2*math.pi*i/8
            radial=(Vector((math.cos(angle),math.sin(angle),0)) if part=='ForeArm' else Vector((0,math.cos(angle),math.sin(angle))))*radius*.78
            rod(side+' / '+part+' pivot fastener '+str(i),a+axle*(axle_depth+.24)+radial,a+axle*(axle_depth+.35)+radial,.17,'silver',pivot_bone,'detail',8)
        # Routed back-of-limb data and power tendons with a thin optical guide.
        cable(side+' / '+part+' rear cable',[(a+axis*5+Vector((sign*1.4 if not arm else 0,0,-3.9))),(a.lerp(e,.45)+Vector((sign*1.9 if not arm else 0,0,-4.5))),(e-axis*5+Vector((sign*1.2 if not arm else 0,0,-3.3)))],.43,'rubber',bone)
        cable(side+' / '+part+' rear light guide',[(a+axis*6+Vector((sign*2.1 if not arm else 0,.8 if arm else 0,-4.0))),(a.lerp(e,.45)+Vector((sign*2.6 if not arm else 0,.8 if arm else 0,-4.6))),(e-axis*6+Vector((sign*1.9 if not arm else 0,.8 if arm else 0,-3.5)))],.13,'electric',bone)
        if not arm:
            for j in (-1,1):
                offset=Vector((j*2.2,0,4.0))
                rod(side+' / '+part+' exposed upper piston '+str(j),a+axis*3.3+offset,a+axis*14+offset,.64,'silver',bone)
                rod(side+' / '+part+' upper piston sleeve '+str(j),a+axis*9+offset,a+axis*14.3+offset,.98,'dark',bone)
            cable(side+' / '+part+' inset optical wire',[a+axis*4+Vector((sign*3.5,0,4.1)),a+axis*8+Vector((sign*3.8,0,4.6)),a+axis*13+Vector((sign*3.4,0,4.0))],.14,'electric',bone)
        armor_surface=BVHTree.FromPolygons([v.co for v in plate_obj.data.vertices],[list(p.vertices) for p in plate_obj.data.polygons])
        if part=='ForeArm':
            center=a.lerp(e,.52)
            hit=armor_surface.ray_cast(Vector((center.x,center.y,50)),Vector((0,0,-1)))[0]
            z=hit.z+.10
            cut_window(plate_obj,(center.x,center.y,z),(8.0,2.6,18))
            inspection(side+' forearm inspection',(center.x,center.y,z),8.0,2.6,bone)
        if part=='Leg':
            center=a.lerp(e,.46)
            # Window offset toward outer calf; still readable from front/three-quarter.
            x=center.x+sign*3.1
            hit=armor_surface.ray_cast(Vector((x,center.y,50)),Vector((0,0,-1)))[0]
            z=hit.z+.10
            cut_window(plate_obj,(x,center.y,z),(2.2,8.1,18))
            inspection(side+' calf inspection',(x,center.y,z),2.2,8.1,bone)
        armor_surface=BVHTree.FromPolygons([v.co for v in plate_obj.data.vertices],[list(p.vertices) for p in plate_obj.data.polygons])
        # Recessed contour lines follow the molded surface rather than floating
        # straight above it. They split each large armor form into service panels.
        lateral=axis.cross(Vector((0,0,1))).normalized()
        for edge in (-1,1):
            points=[]
            for t in (.15,.28,.44,.61,.76,.85):
                c=p.lerp(q,t)+lateral*edge*(cfg[0]*(1-t)+cfg[1]*t)*.68
                hit=armor_surface.ray_cast(Vector((c.x,c.y,50)),Vector((0,0,-1)))[0]
                if hit:points.append(hit+Vector((0,0,.035)))
            if len(points)>2:
                cable(side+' / '+part+' contoured seam '+str(edge),points,.052,'ink',bone,group='detail')
        for t in (.22,.78):
            c=a.lerp(e,t)
            z=c.z+(cfg[2]*(1-t)+cfg[3]*t)
            for offset in (-1,1):
                co=c+Vector((0,offset*cfg[0]*.72,z-c.z)) if arm else c+Vector((offset*cfg[0]*.7,0,z-c.z))
                hit=armor_surface.ray_cast(Vector((co.x,co.y,50)),Vector((0,0,-1)))[0]
                if hit is not None:
                    rod(side+' / '+part+' shell screw '+str(t)+str(offset),hit,hit+Vector((0,0,.10)),.24,'silver',bone,'detail',12)
    # Full deltoid caps establish the shoulder line while retaining joint gaps.
    b=rig.data.bones[bone_name(side+'Arm')]
    c=b.head_local
    shoulder_axis=(b.tail_local-c).normalized()
    shoulder=deltoid_cap(side,sign,c,shoulder_axis)
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
    sculpted_panel(side+' / kneecap',[(c.x-4.8,c.y+4.7),(c.x+4.8,c.y+4.7),(c.x+4,c.y-4.5),(c.x,c.y-6),(c.x-4,c.y-4.5)],c.z+5.1,c.z+6.6,1.4,'white',side+'Leg')
    build_boot(side,sign)
    build_hand(side,sign)

# ----- Neck: central bearing with four routed cable tendons -----
rod('Neck / main bearing',(0,147.5,-2),(0,158.3,-1),4.3,'dark','Neck')
for i in range(2):
    rod('Neck / articulation ring '+str(i),(0,151+i*3.4,-1.8),(0,151.6+i*3.4,-1.8),4.8,'silver','Neck')
for sign in (-1,1):
    for j in range(2):
        cable('Neck / paired tendon '+str(sign)+str(j),[(sign*5.8,147,-1+j*2),(sign*5.5,151,-1+j*2),(sign*4.3,155,-.5+j*2),(sign*4.9,158.0,1+j*2)],.58,'rubber' if j==0 else 'darkblue','Neck',blend_axis('Spine2','Head',1,149,159))
        rod('Neck / lower plug '+str(sign)+str(j),(sign*5.8,146.5,-1+j*2),(sign*5.8,148,-1+j*2),.72,'silver','Spine2')
    cable('Neck / blue guide '+str(sign),[(sign*5.5,147,-1),(sign*5.2,151,-.7),(sign*4.8,156,1),(sign*5.4,158.0,1.6)],.15,'electric','Neck',blend_axis('Spine2','Head',1,149,159))

# ----- The signature cloud head: a continuous hollow manufactured housing -----
N=128
cloud_circles=[(-5.3,9.3,8.2),(5.6,7.3,7.4),(-11,1,7),(11,.3,7.3),(-8.1,-6.5,6.8),(7.8,-6.5,6.8),(0,0,11.5)]
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
inside=face_loop(24.8,15.6,170.0)
verts=[]
loops=[]
for scale,z in [(.10,-16.0),(.35,-15.6),(.65,-14.8),(.86,-12.6),(.98,-8.2),(1,-2),(1,4.5),(.985,7.7),(.93,10.3)]:
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
housing['design_reference']='reference/orthographic-character-sheet.png'
box('Head / recessed monitor',(0,170.0,9.25),(24.72,15.52,1.25),'screen','Head','face',2.2)
# The face is physical luminous geometry; no external font or texture is needed.
cable('Face / terminal chevron',[(-6.8,173.1,10.01),(-3.4,170.0,10.01),(-6.8,166.9,10.01)],.65,'light','Head',group='face')
cable('Face / terminal cursor',[(3.2,166.9,10.01),(8.0,166.9,10.01)],.60,'light','Head',group='face')
# The sheet defines a bulbous head with a compact vertical proportion.
# Only visible geometry changes; the original head bone stays intact.
for o in created:
    if o.name.startswith(('Head /','Face /')):
        for v in o.data.vertices:
            v.co.x*=.97
            v.co.y=168.6+(v.co.y-173.1)*.92

# Pack the supplied reference into the Blender file for convenient art review.
reference=bpy.data.images.load(str(OUT/'reference/monitor-head.png'),check_existing=True)
reference.use_fake_user=True
reference.pack()
reference=bpy.data.images.load(str(OUT/'reference/futuristic-cloud-robot.png'),check_existing=True)
reference.use_fake_user=True
reference.pack()
reference=bpy.data.images.load(str(OUT/'reference/orthographic-character-sheet.png'),check_existing=True)
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

# Blender 5.2 compositor uses a scene node group and menu-valued sockets.
ng=bpy.data.node_groups.new('Studio / restrained optical bloom','CompositorNodeTree')
ng.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
source=ng.nodes.new('CompositorNodeRLayers')
glow=ng.nodes.new('CompositorNodeGlare')
glow.inputs['Type'].default_value='Fog Glow'
glow.inputs['Quality'].default_value='High'
glow.inputs['Threshold'].default_value=2.0
glow.inputs['Strength'].default_value=.22
glow.inputs['Size'].default_value=.055
output=ng.nodes.new('NodeGroupOutput')
ng.links.new(source.outputs['Image'],glow.inputs['Image'])
ng.links.new(glow.outputs['Image'],output.inputs['Image'])
scene.compositing_node_group=ng

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
hero=camera('CAM / hero',(2.4,-4.8,2.18),(0,0,.96),2.22)
hero.data.type='PERSP';hero.data.lens=84;hero.data.sensor_fit='VERTICAL';hero.data.sensor_height=36
camera('CAM / front',(0,-5,1.12),(0,0,1.01),2.27)
camera('CAM / side',(5,0,1.15),(0,0,1.0),2.27)
camera('CAM / back',(0,5,1.15),(0,0,1.0),2.27)
camera('CAM / head',(1.6,-4,2.04),(0,0,1.66),.66)
camera('CAM / window',(1.3,-3.0,1.28),(.26,-.06,1.09),.49)
camera('CAM / shoulders',(1.2,-3.0,1.85),(0,-.025,1.44),.76)
camera('CAM / feet',(.70,-1.8,.65),(0,-.065,.10),.65)
hand_bone=rig.pose.bones[bone_name('LeftHand')]
hand_target=rig.matrix_world @ (hand_bone.matrix @ Vector((0,10,0)))
camera('CAM / hands',hand_target+Vector((.50,-1.4,.32)),hand_target,.34)
scene.camera=bpy.data.objects['CAM / hero']
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.cycles.max_bounces=8;scene.cycles.transmission_bounces=6
scene.render.resolution_x=1500;scene.render.resolution_y=1800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.film_transparent=False
scene.render.filepath=str(OUT/'renders/hero.png')
scene['design']='Codex Android / 04 · articulated hands, deltoid armor and boots'
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
