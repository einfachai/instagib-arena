"""Render and validate the saved Blender review asset.

Blender --background --python scripts/character/review-android.py -- preview
Modes: preview, preview-cpu, preview-eevee, finals, views-eevee, orthographic,
poses, turntable, validate. Optional camera names can follow finals or
views-eevee. Outputs stay under art/codex-android.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'art/codex-android'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['preview']
cpu_requested='--cpu' in args
args=[a for a in args if a!='--cpu']
mode=args[0]
bpy.ops.wm.open_mainfile(filepath=str(OUT/'codex-android.blend'))
scene=bpy.context.scene
rig=next(o for o in scene.objects if o.type=='ARMATURE')
asset=[o for o in scene.objects if o.get('asset')=='codex-android']
scene.render.engine='CYCLES'
scene.cycles.use_denoising=True
scene.cycles.use_adaptive_sampling=True
scene.cycles.adaptive_threshold=.055
scene.cycles.max_bounces=6
scene.cycles.diffuse_bounces=2
scene.cycles.glossy_bounces=3
scene.cycles.transmission_bounces=4
scene.cycles.caustics_reflective=False
scene.cycles.caustics_refractive=False
scene.cycles.sample_clamp_indirect=4
scene.render.image_settings.file_format='PNG'

# Use the available GPU; CPU remains a valid path on machines without Metal.
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='METAL'
    prefs.kernel_optimization_level='OFF'
    prefs.metalrt='OFF'
    prefs.get_devices()
    gpu=False
    for d in prefs.devices:
        d.use=d.type!='CPU'
        gpu=gpu or d.use
    scene.cycles.device='GPU' if gpu else 'CPU'
except Exception as error:
    scene.cycles.device='CPU'
    print('CPU_FALLBACK',str(error),flush=True)

if mode=='preview-cpu' or cpu_requested:
    scene.cycles.device='CPU'
print('RENDER_DEVICE',scene.cycles.device,flush=True)

def pose(name='idle.relaxed',fraction=None,frame=60):
    rig.animation_data.action=bpy.data.actions[name]
    if rig.animation_data.action.slots:
        rig.animation_data.action_slot=rig.animation_data.action.slots[0]
    if fraction is not None:
        lo,hi=rig.animation_data.action.frame_range
        frame=round(lo+(hi-lo)*fraction)
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    return frame

def render(name,camera='hero',resolution=(1500,1800),samples=64):
    scene.camera=bpy.data.objects['CAM / '+camera]
    scene.render.resolution_x,scene.render.resolution_y=resolution
    scene.cycles.samples=samples
    scene.render.filepath=str(OUT/'renders'/name)
    bpy.ops.render.render(write_still=True)
    print('REVIEW_RENDER',name,flush=True)

if mode=='orthographic':
    rig.data.pose_position='REST'
    scene.render.engine='BLENDER_EEVEE'
    scene.eevee.use_raytracing=True
    for view,loc,target,scale in [
        ('front',(0,-5,.94),(0,0,.94),2.14),
        ('side',(5,0,.94),(0,0,.94),2.14),
        ('back',(0,5,.94),(0,0,.94),2.14),
        ('left',(-5,0,.94),(0,0,.94),2.14),
        ('top',(0,-.001,5),(0,0,1),2.14),
        ('head-front',(0,-5,1.65),(0,0,1.65),.57)]:
        name='CAM / '+view
        cam=bpy.data.objects.get(name)
        if cam is None:
            data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);scene.collection.objects.link(cam)
        cam.data.type='ORTHO';cam.data.ortho_scale=scale
        cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
        render('orthographic-'+view+'.png',view,(1100,1100),24)
elif mode=='preview-eevee':
    pose()
    scene.render.engine='BLENDER_EEVEE'
    scene.eevee.use_raytracing=True
    render('revision-preview.png',resolution=(900,1125),samples=24)
elif mode=='preview-cpu':
    pose()
    render('preview-cpu.png',resolution=(650,850),samples=12)
elif mode=='preview':
    pose()
    render('preview.png',resolution=(850,1050),samples=24)
elif mode in ('finals','views-eevee'):
    pose()
    if mode=='views-eevee':
        scene.render.engine='BLENDER_EEVEE';scene.eevee.use_raytracing=True
    views=args[1:] or (['front','side','back','head','window'] if mode=='views-eevee' else ['hero','front','side','back','head','window'])
    for view in views:
        size=(1280,1280) if view in ('head','window') else ((1280,1600) if view=='hero' else (1024,1280))
        render(view+'.png',view,size,24)
elif mode=='poses':
    # Neutral technical views make shell intersections easier to inspect than
    # glossy beauty lighting. Hero and window presentation views use Cycles.
    scene.render.engine='BLENDER_WORKBENCH'
    scene.render.use_compositing=False
    scene.display.shading.light='STUDIO'
    scene.display.shading.color_type='MATERIAL'
    # Workbench shadow volumes create long streaks around open armor shells.
    # Use studio illumination and cavity shading for these technical checks.
    scene.display.shading.show_shadows=False
    scene.display.shading.show_cavity=True
    scene.display.shading.cavity_type='BOTH'
    scene.display.shading.background_type='WORLD'
    scene.world.color=(.10,.12,.15)
    bpy.data.objects['Studio / seamless floor'].hide_render=True
    for name,fraction in [('idle.relaxed',.5),('idle.armed',.5),('sprint.forward',.25),('jump.rifle',.50),('dash.right',.50),('emote.placeholder',.35)]:
        pose(name,fraction)
        render('pose-'+name+'.png',resolution=(800,1000),samples=24)
elif mode=='turntable':
    pose()
    scene.render.engine='BLENDER_EEVEE'
    if hasattr(scene.eevee,'taa_render_samples'):
        scene.eevee.taa_render_samples=16
    if hasattr(scene.eevee,'use_raytracing'):
        scene.eevee.use_raytracing=True
    cam=bpy.data.objects['CAM / hero']
    target=Vector((0,0,1.02))
    scene.render.resolution_x=640;scene.render.resolution_y=800
    scene.render.use_persistent_data=True
    (OUT/'renders/turntable-frames').mkdir(exist_ok=True)
    # Fixed pose; orbit the camera. 48 frames at 12 fps yields a 4-second loop.
    for i in range(48):
        angle=2*math.pi*i/48+math.radians(22)
        cam.location=(math.sin(angle)*5,-math.cos(angle)*5,2.17)
        cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.camera=cam
        scene.render.filepath=str(OUT/'renders/turntable-frames'/f'{i:04d}.png')
        bpy.ops.render.render(write_still=True)
        print('TURNTABLE_FRAME',i,flush=True)
elif mode=='validate':
    report=json.loads((OUT/'reports/build.json').read_text())
    signature=dict(matrix=[list(r) for r in rig.matrix_world],bones=[dict(name=b.name,parent=b.parent.name if b.parent else None,rest=[list(r) for r in b.matrix_local]) for b in rig.data.bones])
    assert signature==report['rig'],'Rig differs from source signature'
    assert len(rig.data.bones)==65
    assert {a.name for a in bpy.data.actions}==set(report['actions'])
    assert all(a.use_fake_user for a in bpy.data.actions)
    assert all(bpy.data.materials.get(n) for n in report['materials'])
    assert bpy.data.images.get('monitor-head.png').packed_file
    assert bpy.data.images.get('futuristic-cloud-robot.png').packed_file
    assert bpy.data.images.get('orthographic-character-sheet.png').packed_file
    for o in asset:
        assert any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers),o.name
        for v in o.data.vertices:
            assert abs(sum(g.weight for g in v.groups)-1)<1e-5,(o.name,v.index)
    checks=[]
    for name in ['idle.relaxed','idle.armed','sprint.forward','jump.rifle','dash.right','emote.placeholder']:
        for fraction in [0,.25,.5,.75,1]:
            frame=pose(name,fraction)
            deps=bpy.context.evaluated_depsgraph_get()
            lo=Vector((math.inf,)*3);hi=Vector((-math.inf,)*3)
            for o in asset:
                evaluated=o.evaluated_get(deps)
                for corner in evaluated.bound_box:
                    v=evaluated.matrix_world@Vector(corner)
                    assert all(math.isfinite(c) for c in v),(name,o.name)
                    for i in range(3):lo[i]=min(lo[i],v[i]);hi[i]=max(hi[i],v[i])
            head=BVHTree.FromObject(bpy.data.objects['Head / unified scalloped pearl housing'],deps)
            collisions={}
            for side in ('Left','Right'):
                shoulder=BVHTree.FromObject(bpy.data.objects[side+' / shoulder cap'],deps)
                collisions[side]=len(head.overlap(shoulder))
            checks.append(dict(clip=name,frame=frame,fraction=fraction,bounds=[list(lo),list(hi)],headShoulderTriangleIntersections=collisions))
    result=dict(reopened=True,rig_matches_source=True,bones=65,actions=len(bpy.data.actions),
                weighted_meshes=len(asset),packed_reference=True,materials_persisted=True,
                all_vertices_have_normalized_weights=True,finite_pose_bounds=True,
                head_shoulder_clear=all(not any(c['headShoulderTriangleIntersections'].values()) for c in checks),pose_checks=checks)
    (OUT/'reports/validation.json').write_text(json.dumps(result,indent=2))
    print('ANDROID_VALIDATION',json.dumps({k:v for k,v in result.items() if k!='pose_checks'}),flush=True)
else:
    raise ValueError('Unknown mode '+mode)
