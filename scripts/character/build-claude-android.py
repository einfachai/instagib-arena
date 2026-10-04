"""Derive the Claude robot from the saved Codex source without saving over it.

Blender --background --python-exit-code 1 --python scripts/character/build-claude-android.py
Body vertex geometry, modifiers, skin weights, rig transforms and actions are retained.
Only head/mascot geometry and the authored accent materials change.
"""
import hashlib
import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import tessellate_polygon

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/codex-android/codex-android.blend'
OUT = ROOT / 'art/claude-android'
for folder in ('reference', 'renders', 'reports'):
    (OUT / folder).mkdir(parents=True, exist_ok=True)
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
rig.data.pose_position = 'REST'


def signature():
    return dict(matrix=[list(r) for r in rig.matrix_world], bones=[dict(
        name=b.name, parent=b.parent.name if b.parent else None,
        rest=[list(r) for r in b.matrix_local]) for b in rig.data.bones])


def geometry_hash(obj):
    """Geometry and weights independent of a material or object label."""
    digest = hashlib.sha256()
    for vertex in obj.data.vertices:
        digest.update(struct.pack('<3f', *vertex.co))
        for group in vertex.groups:
            digest.update(struct.pack('<If', group.group, group.weight))
        digest.update(b'|')
    for polygon in obj.data.polygons:
        digest.update(struct.pack('<' + 'I' * len(polygon.vertices), *polygon.vertices))
        digest.update(b'|')
    return digest.hexdigest()


original_rig = signature()
original_actions = sorted(a.name for a in bpy.data.actions)
assert len(original_rig['bones']) == 65 and len(original_actions) == 45
replaced = [o for o in scene.objects if o.get('asset') == 'codex-android' and
            (o.get('component') == 'face' or 'cloud insignia' in o.name or o.name == 'Chest / unit designation')]
body = [o for o in scene.objects if o.get('asset') == 'codex-android' and o not in replaced]
body_hashes = {o.name: geometry_hash(o) for o in body}
for obj in replaced:
    bpy.data.objects.remove(obj, do_unlink=True)
for obj in body:
    obj['asset'] = 'claude-android'
face_collection = next(c for c in bpy.data.collections if c.name.startswith('06'))
face_collection.name = '06 · Clawd head'
detail_collection = next(c for c in bpy.data.collections if c.name.startswith('07'))


def linear(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels) + (1,)


# Roles retain their physical surface settings. Neutral armor and machinery retain
# their source colors; every deliberately blue/purple accent receives a warm tone.
palette = {
    'Periwinkle blue housing': ('Terracotta housing', 'D97757'),
    'Cobalt joint enamel': ('Burnt orange joint enamel', 'BB542D'),
    'Azure cable jacket': ('Orange cable jacket', 'E58449'),
    'Blue edge gasket': ('Umber edge gasket', '663323'),
    'Ice blue phosphor': ('Amber phosphor', 'FFC079'),
    'Blue optical fibre': ('Orange optical fibre', 'FF8A38'),
    'Lavender connector polymer': ('Apricot connector polymer', 'DBA078'),
    'Clear blue polycarbonate': ('Warm clear polycarbonate', 'F5E7DC'),
    'Midnight circuit substrate': ('Warm charcoal circuit substrate', '302720'),
}
materials = {}
for mat in list(bpy.data.materials):
    if not mat.name.startswith('CA /'):
        continue
    role = mat.name.split(' / ', 1)[1]
    new_role, color = palette.get(role, (role, None))
    mat.name = 'CL / ' + new_role
    if color:
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = linear(color)
        mat.diffuse_color = linear(color)
        if shader.inputs['Emission Strength'].default_value > 0:
            shader.inputs['Emission Color'].default_value = linear(color)
    materials[new_role] = mat

# The eyes are black physical inserts with no monitor, rim, or emission.
eyes = bpy.data.materials.new('CL / Black eye inserts')
eyes.use_nodes = True
shader = eyes.node_tree.nodes['Principled BSDF']
shader.inputs['Base Color'].default_value = linear('080807')
shader.inputs['Roughness'].default_value = .32
shader.inputs['Metallic'].default_value = .08
shader.inputs['Coat Weight'].default_value = .12
shader.inputs['Emission Strength'].default_value = 0
eyes.diffuse_color = linear('080807')
materials['Black eye inserts'] = eyes


def mesh(name, vertices, faces, mat, bone='Head', component='face', bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection = face_collection if component == 'face' else (next(c for c in bpy.data.collections if c.name.startswith('03')) if component == 'frame' else detail_collection)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = rig
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = Matrix.Identity(4)
    group = obj.vertex_groups.new(name='mixamorig:' + bone)
    group.add(list(range(len(vertices))), 1, 'REPLACE')
    if bevel:
        mod = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = 'ANGLE'
        normals = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
        for polygon in data.polygons:
            polygon.use_smooth = True
    mod = obj.modifiers.new('Canonical skeleton', 'ARMATURE')
    mod.object = rig
    obj['asset'] = 'claude-android'
    obj['component'] = component
    return obj


# The small armor insignias retain the graphic mascot; the actual head below
# follows the sculpted robot concept rather than extruding this pixel outline.
pixel_outline = [
    (85,49),(462,49),(462,140),(504,140),(504,231),(462,231),
    (462,412),(420,412),(420,322),(378,322),(378,412),(337,412),
    (337,322),(211,322),(211,412),(169,412),(169,322),(127,322),
    (127,412),(85,412),(85,231),(43,231),(43,140),(85,140),
]


def plate(name, path, zback, zfront, material, bevel):
    signed_area = sum(path[i][0] * path[(i+1) % len(path)][1] - path[(i+1) % len(path)][0] * path[i][1] for i in range(len(path)))
    if signed_area < 0:
        path = list(reversed(path))
    n = len(path)
    vertices = [(x, y, z) for z in (zback, zfront) for x, y in path]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
    return mesh(name, vertices, faces, material, bevel=bevel)


# Broad cheek/forehead planes, clipped corners, short rounded prongs and
# separate side housings echo the user's 3D robot reference. Prongs taper in
# depth toward their tips, avoiding four deep rectangular posts.
outline = [
    (-12.5,185.3),(12.5,185.3),(15.3,182.5),(15.3,168.0),(13.5,165.7),
    (13.5,160.0),(12.6,159.1),(9.5,159.1),(8.6,160.0),(8.6,165.0),
    (6.65,165.0),(6.65,160.0),(5.75,159.1),(2.65,159.1),(1.75,160.0),(1.75,165.0),
    (-1.75,165.0),(-1.75,160.0),(-2.65,159.1),(-5.75,159.1),(-6.65,160.0),(-6.65,165.0),
    (-8.6,165.0),(-8.6,160.0),(-9.5,159.1),(-12.6,159.1),(-13.5,160.0),(-13.5,165.7),
    (-15.3,168.0),(-15.3,182.5),
]
housing = plate('Head / Clawd terracotta housing', outline, -4.8, 9.4, materials['Terracotta housing'], .68)
for vertex in housing.data.vertices:
    if vertex.co.z < 0:
        vertex.co.z += max(0,165.4-vertex.co.y)*.82
        vertex.co.x *= .965
housing['design_reference'] = 'reference/claude-robot-concept.png'
housing['silhouette'] = 'Sculpted chamfered housing, short rounded prongs, separate side pods; no sticker border'
rear_outline=[(-11.8,184.0),(11.8,184.0),(14.0,181.8),(14.0,168.5),(11.8,166.0),(-11.8,166.0),(-14.0,168.5),(-14.0,181.8)]
plate('Head / layered rear housing',rear_outline,-6.5,-4.1,materials['Burnt orange joint enamel'],.65)
for label,sign in [('left',-1),('right',1)]:
    x0,x1=sorted((sign*14.6,sign*20.2))
    pod=[(x0+.65,181.0),(x1-.65,181.0),(x1,180.35),(x1,173.05),
         (x1-.65,172.4),(x0+.65,172.4),(x0,173.05),(x0,180.35)]
    plate('Head / '+label+' rounded side housing',pod,-3.8,7.1,materials['Terracotta housing'],.6)
for label,x in [('left',-8.3),('right',8.3)]:
    path=[(x-2.15,173.9),(x+2.15,173.9),(x+2.15,178.2),(x-2.15,178.2)]
    plate('Face / ' + label + ' black square eye', path, 9.3, 10.15, eyes, .24)


def head_mount(name, y0, y1, radius, material):
    n=32
    vertices=[(radius*math.cos(i*math.tau/n),y,-1+radius*math.sin(i*math.tau/n)) for y in (y0,y1) for i in range(n)]
    faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]
    faces += [(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)]
    return mesh(name,vertices,faces,material,component='frame',bevel=.14)


# Clawd's central recess is taller than the cloud housing's lower surface.
# This new head-side mount overlaps the original neck bearing and the head,
# leaving the inherited neck geometry/weights untouched.
head_mount('Clawd mount / graphite spindle',157.2,166.0,3.5,materials['Graphite alloy'])
head_mount('Clawd mount / orange locking collar',161.7,162.6,3.8,materials['Burnt orange joint enamel'])


def insignia(side, surface_name, center_y, sign):
    surface = bpy.data.objects[surface_name]
    bvh = BVHTree.FromPolygons([v.co for v in surface.data.vertices], [list(p.vertices) for p in surface.data.polygons])
    path = [Vector(((x - 273.5) * .0108, center_y + (230.5 - y) * .0108, 0)) for x, y in pixel_outline]
    triangles = tessellate_polygon([path])
    # Blender 5.2 returns vertex indices; older versions returned vectors.
    faces = [tuple(v if isinstance(v, int) else next(i for i, p in enumerate(path) if (p-v).length < 1e-6) for v in tri) for tri in triangles]
    # Subdivide the interior before projection so the filled mark follows the
    # convex armor instead of its long triangles disappearing inside the shell.
    for _ in range(2):
        midpoint_cache = {}
        refined = []
        def midpoint(a, b):
            key = tuple(sorted((a,b)))
            if key not in midpoint_cache:
                midpoint_cache[key] = len(path)
                path.append((path[a]+path[b])*.5)
            return midpoint_cache[key]
        for a,b,c in faces:
            ab,bc,ca = midpoint(a,b),midpoint(b,c),midpoint(c,a)
            refined.extend([(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)])
        faces = refined
    projected = []
    for point in path:
        hit = bvh.ray_cast(Vector((point.x, point.y, sign * 50)), Vector((0, 0, -sign)))[0]
        assert hit is not None, 'Insignia projection missed armor'
        projected.append(tuple(hit + Vector((0,0,sign * .085))))
    # All triangles face away from the shell, including the back insignia.
    for i, face in enumerate(faces):
        a,b,c = (Vector(projected[j]) for j in face)
        if (b-a).cross(c-a).z * sign < 0:
            faces[i] = tuple(reversed(face))
    mesh(side + ' / Clawd insignia', projected, faces, materials['Terracotta housing'], 'Spine2', 'detail')
    for label,x in [('left',148),('right',399)]:
        eye_path = [((x+dx-273.5)*.0108, center_y+(230.5-162.5+dy)*.0108) for dx,dy in [(-21,-22),(21,-22),(21,22),(-21,22)]]
        vertices=[]
        for px,py in eye_path:
            hit=bvh.ray_cast(Vector((px,py,sign*50)),Vector((0,0,-sign)))[0]
            assert hit is not None
            vertices.append(tuple(hit+Vector((0,0,sign*.115))))
        face=(0,1,2,3) if sign>0 else (3,2,1,0)
        mesh(side+' / insignia '+label+' eye',vertices,[face],eyes,'Spine2','detail')


insignia('Chest', 'Thorax / continuous curved breastplate', 140.0, 1)
insignia('Back', 'Thorax / unified dorsal armor', 142.2, -1)

# Keep the source body's object names stable for direct geometry comparisons.
assert body_hashes == {o.name: geometry_hash(o) for o in body}, 'Body geometry or skin weights changed'
assert signature() == original_rig, 'Source rig changed'
assert sorted(a.name for a in bpy.data.actions) == original_actions
for action in bpy.data.actions:
    action.use_fake_user = True

references = []
for filename in ('clawd-mascot.png', 'claude-robot-concept.png'):
    path = OUT / 'reference' / filename
    ref = bpy.data.images.load(str(path), check_existing=True)
    ref.use_fake_user = True
    ref.pack()
    references.append(dict(file='reference/' + filename, sha256=hashlib.sha256(path.read_bytes()).hexdigest()))

rig.data.pose_position = 'POSE'
rig.animation_data_create()
rig.animation_data.action = bpy.data.actions['idle.relaxed']
if rig.animation_data.action.slots:
    rig.animation_data.action_slot = rig.animation_data.action.slots[0]
scene.frame_set(60)
scene.camera = bpy.data.objects['CAM / hero']
scene.render.filepath = str(OUT / 'renders/hero.png')
scene['design'] = 'Claude Android / 01 · Clawd head and orange accents'
scene['scope'] = 'Independent editable model, GLB and review media. Game selection deferred.'
scene['source_asset'] = str(SOURCE.relative_to(ROOT))
scene['source_sha256'] = source_hash
scene['reference_urls'] = 'User-supplied Clawd screenshot and orange robot concept'
scene['head_object'] = housing.name
bpy.ops.object.select_all(action='DESELECT')
housing.select_set(True)
bpy.context.view_layer.objects.active = housing
rig.hide_set(True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'claude-android.blend'))
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
parts = [o for o in scene.objects if o.get('asset') == 'claude-android']
report = dict(source=str(SOURCE.relative_to(ROOT)), sourceSha256=source_hash,
              revision=1, rig=original_rig, actions=original_actions, objects=len(parts),
              materials=sorted({m.name for o in parts for m in o.data.materials if m}),
              preserved_rig=True, preserved_body_geometry=True, body_geometry_sha256=body_hashes,
              head=housing.name, palette={new:'#'+color for new,color in palette.values()},
              references=references, blender=bpy.app.version_string)
(OUT / 'reports/build.json').write_text(json.dumps(report, indent=2) + '\n')
print('CLAUDE_BUILT', len(parts), 'parts;', len(body), 'unchanged body meshes;', len(original_actions), 'actions', flush=True)
