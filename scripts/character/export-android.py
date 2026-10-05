"""Export the approved android to glTF without changing the editable source.

Run with Blender --background --python scripts/character/export-android.py.
Append -- --variant claude for the independent Claude asset; Codex is the default.
Runtime geometry keeps the original skin and all material boundaries. The
existing 60 Hz motion library binds to the unchanged 65-bone skeleton.
"""
import bpy
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from android_variant import variant_options

ROOT = Path(__file__).resolve().parents[2]
variant, _ = variant_options()
SOURCE = variant['out'] / (variant['id'] + '.blend')
source_sha256 = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
OUT = ROOT / 'public/models' / variant['id']
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
rig.animation_data_clear()
rig.data.pose_position = 'REST'
for bone in rig.pose.bones:
    bone.matrix_basis.identity()

def signature():
    return {'matrix': [list(row) for row in rig.matrix_world], 'bones': [
        {'name': b.name, 'parent': b.parent.name if b.parent else None,
         'rest': [list(row) for row in b.matrix_local]} for b in rig.data.bones]}

original_rig = signature()
parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('asset') == variant['id']]
build_report = json.loads((variant['out'] / 'reports/build.json').read_text())
assert len(parts) == build_report['objects'], 'Geometry differs from the saved build inventory'
for obj in list(bpy.data.objects):
    if obj != rig and obj not in parts:
        bpy.data.objects.remove(obj, do_unlink=True)
for collection in bpy.data.collections:
    collection.hide_viewport = collection.hide_render = False
for layer in bpy.context.view_layer.layer_collection.children:
    layer.exclude = layer.hide_viewport = False
rig.hide_set(False)
rig.hide_viewport = rig.hide_render = False
bpy.context.scene.frame_set(0)

# Modifier operators otherwise rebuild relations for every authored part on
# every invocation. Keep only the current Claude part linked during reduction.
# This affects the transient export scene only, not geometry or the saved file.
processing_collection = None
if variant['key'] == 'claude':
    processing_collection = bpy.data.collections.new('Runtime part processing')
    bpy.context.scene.collection.children.link(processing_collection)
    for obj in parts:
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
    bpy.context.view_layer.update()

# Apply render surfaces in rest space, never apply the armature modifier.
# A single chamfer is enough at player scale; subdivision remains on the
# cloud housing and curved armor before conservative mesh reduction.
rows = []
for part_index, obj in enumerate(parts):
    if processing_collection:
        processing_collection.objects.link(obj)
        bpy.context.view_layer.update()
    obj.hide_set(False)
    obj.hide_viewport = obj.hide_render = False
    bpy.context.view_layer.objects.active = obj
    for modifier in list(obj.modifiers):
        if modifier.type == 'ARMATURE':
            continue
        if modifier.type == 'BEVEL':
            modifier.segments = 4 if obj.name == 'Head / recessed monitor' else (2 if variant['key'] == 'claude' and obj.get('component') == 'face' else 1)
        if modifier.type == 'SUBSURF':
            modifier.levels = modifier.render_levels = 1
        modifier.show_viewport = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    before = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    component = obj.get('component')
    ratio = {'shell': .14, 'frame': .08, 'cable': .12, 'detail': .07, 'face': .45, 'glass': 1}.get(component, .14)
    if (component == 'face' and 'housing' not in obj.name) or 'phosphor' in ' '.join(m.name for m in obj.data.materials if m):
        ratio = 1  # Preserve small face features and luminous elements exactly.
    if variant['key'] == 'claude' and (component == 'face' or 'insignia' in obj.name):
        ratio = 1  # Keep the manufactured head contours and square eyes intact.
    if before > 100 and ratio < 1:
        mod = obj.modifiers.new('Runtime simplification', 'DECIMATE')
        mod.ratio = max(ratio, 12 / before)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    rows.append({'name': obj.name, 'component': component, 'before': before,
                 'triangles': sum(len(p.vertices) - 2 for p in obj.data.polygons)})
    if (part_index + 1) % 100 == 0:
        print('EXPORT_PARTS', part_index + 1, '/', len(parts), flush=True)
    if processing_collection:
        processing_collection.objects.unlink(obj)

# Joining once avoids hundreds of object nodes. Material primitives are
# batched into one opaque draw and one window draw by the runtime loader.
if processing_collection:
    for obj in parts:
        processing_collection.objects.link(obj)
    bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
body = bpy.context.object
body.name = variant['name'].replace(' ', '_')
body.data.name = body.name + '_Runtime'
assert signature() == original_rig, 'Export changed the source skeleton'
rig.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'model.glb'), export_format='GLB', use_selection=True,
    export_animations=False, export_yup=True, export_apply=False,
    export_extras=False, export_cameras=False, export_lights=False,
    export_texcoords=False, export_normals=True, export_materials='EXPORT',
)
motion = json.loads((ROOT / 'public/models/codex-ybot/manifest.json').read_text())
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_sha256, 'Editable source changed during export; rerun the exporter'
manifest = {
    'version': 2, 'name': variant['name'], 'revision': variant['revision'],
    'model': '/models/' + variant['id'] + '/model.glb', 'fps': motion['fps'],
    'clips': motion['clips'], 'source': str(SOURCE.relative_to(ROOT)),
    'sourceSha256': source_sha256,
    'bones': len(rig.data.bones), 'authoredObjects': len(parts),
    'triangles': sum(row['triangles'] for row in rows),
    'bytes': (OUT / 'model.glb').stat().st_size,
    'runtimeDraws': 2,
    'windows': ('Warm' if variant['key'] == 'claude' else 'Blue') + '-tinted alpha windows; solid thickness and internals retained.',
}
assert manifest['triangles'] < 75000, 'Runtime triangle budget exceeded'
assert manifest['bytes'] < 3_000_000, 'Runtime download budget exceeded'
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(variant['out'] / 'reports/runtime-export.json').write_text(
    json.dumps({'manifest': manifest, 'rigUnchanged': True, 'parts': rows}, indent=2) + '\n')
print('ANDROID_EXPORTED', manifest['triangles'], 'triangles,', manifest['bytes'], 'bytes', flush=True)
