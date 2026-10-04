"""Build the R-01 from the supplied orthographic sheet; Blender 5.2+.
Run: blender --background --python-exit-code 1 --python scripts/railgun/build.py
Author in sheet coordinates, convert once to Blender, export glTF +Y up / -Z forward.
"""
import bpy, bmesh, math, json, shutil
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'art/railgun-r01'; OUT=ROOT/'public/models/railgun-r01'
for path in [ART/'renders',ART/'reports',OUT]: path.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.render.fps=60; scene.frame_start=0; scene.frame_end=72
def xyz(x,u,v): return (x,(u-545)/1000,(222-v)/1000)
def linear(c): return ((c+.055)/1.055)**2.4 if c>.04045 else c/12.92
palette={0:('Ceramic','e4e8eb',.36,.15),1:('Graphite','252a30',.36,.8),2:('Steel','8b939d',.28,.85),3:('Grip','11151a',.8,0),4:('Frame','1b2027',.5,.45),5:('Status','0677ff',.25,.2),6:('Rail','008aff',.2,.2),9:('Copper','c37842',.28,.9)}
mats={}
for role,(name,col,rough,metal) in palette.items():
    m=bpy.data.materials.new(name); m.use_nodes=True
    color=tuple(linear(int(col[i:i+2],16)/255) for i in (0,2,4))+(1,)
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=color
    bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    if role in (5,6): bs.inputs['Emission Color'].default_value=color;bs.inputs['Emission Strength'].default_value=3
    else:
        tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(OUT/'detail.png'),check_existing=True)
        m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        nt=m.node_tree.nodes.new('ShaderNodeTexImage');nt.image=bpy.data.images.load(str(OUT/'normal.png'),check_existing=True);nt.image.colorspace_settings.name='Non-Color'
        normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.85
        m.node_tree.links.new(nt.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
        rt=m.node_tree.nodes.new('ShaderNodeTexImage');rt.image=bpy.data.images.load(str(OUT/'roughness.png'),check_existing=True);rt.image.colorspace_settings.name='Non-Color'
        mult=m.node_tree.nodes.new('ShaderNodeMath');mult.operation='MULTIPLY';mult.inputs[1].default_value=rough
        m.node_tree.links.new(rt.outputs['Color'],mult.inputs[0]);m.node_tree.links.new(mult.outputs[0],bs.inputs['Roughness'])
    m.diffuse_color=color;mats[role]=m

sources={};lod='high';group='body';items=[]
def finish(o,name,role,bevel=0):
    if lod=='low' and name in ('Muzzle_steel','Muzzle_inner','Capacitor_band','Stock_joint'):
        bpy.data.objects.remove(o,do_unlink=True);return None
    o.name=name;o.data.materials.clear();o.data.materials.append(mats[role]);o['assembly']=group
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    if bevel and lod=='high':
        mod=o.modifiers.new('Machined chamfer','BEVEL');mod.width=bevel;mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    a=o.data.attributes.new('_gun','FLOAT_VECTOR','POINT')
    c=o.data.attributes.new('_r01','FLOAT','POINT')
    for i in range(len(o.data.vertices)):
        a.data[i].vector=(1 if role==9 else role,0,-10);c.data[i].value=1 if role==9 else 0
    for layer in list(o.data.uv_layers): o.data.uv_layers.remove(layer)
    uv=o.data.uv_layers.new(name='UVMap')
    # Registered orthographic projections cover the side, top and underside.
    # Cylindrical windings and grip receive generated material trims.
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            co=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
            u=co.y*1000+545;v=222-co.z*1000
            if role==9:
                center=.097 if v<150 else .051
                uv.data[li].uv=((u-498)/78,1-(1408+(math.atan2(co.x,co.z-center)/math.tau%1)*224)/2048)
            elif name=='Rail_bed':uv.data[li].uv=((u-945)/439,1-(1660+(v-150)/70*144)/2048)
            elif poly.normal.y>.65 and u>1400 and (name.startswith('Muzzle_') or name=='Bore_recess'):
                fx=520+co.x*840;fy=843+(v-185)*.69
                uv.data[li].uv=((fx-440)*150/175/2048,1-(fy-705)*240/279/2048)
            elif name.startswith('Trigger') and role==2: uv.data[li].uv=(1936/2048,1-2020/2048)
            elif role==3 and 300<u<470: uv.data[li].uv=((v-250)/105,1-(1870+(co.x+.025)*1800)/2048)
            elif abs(poly.normal.x)>.65 and role in (0,1,2,3,4):
                uv.data[li].uv=(u/1536,1-v/430*.5)
            elif poly.normal.z>.65 and role in (0,1,2,4):
                uv.data[li].uv=(u/1536,1-(1024+(503-co.x*750-430)/135*192)/2048)
            elif poly.normal.z<-.65 and role in (0,1,2,4):
                uv.data[li].uv=(u/1536,1-(1216+(635+co.x*750-565)/140*192)/2048)
            else:
                slot=min(role,5)
                uv.data[li].uv=((1856+slot*32+16)/2048,1-2020/2048)
    items.append(o);o.select_set(False);return o

def plate(name,points,x0,x1,role=0,bevel=.003):
    n=len(points);verts=[xyz(x,u,v) for x in (x0,x1) for u,v in points]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);return finish(o,name,role,bevel)
def box(name,u,v,length,height,width,role=1,x=0,bevel=.001):
    return plate(name,[(u-length/2,v-height/2),(u+length/2,v-height/2),(u+length/2,v+height/2),(u-length/2,v+height/2)],x-width/2,x+width/2,role,bevel)
def rod(name,a,b,width,depth,role=1,x=0):
    du=b[0]-a[0];dv=b[1]-a[1];length=math.hypot(du,dv);nu=-dv/length*width/2;nv=du/length*width/2
    return plate(name,[(a[0]+nu,a[1]+nv),(b[0]+nu,b[1]+nv),(b[0]-nu,b[1]-nv),(a[0]-nu,a[1]-nv)],x-depth/2,x+depth/2,role,.001)
def cyl(name,u,v,length,radius,role=1,x=0,seg=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg or (12 if lod=='high' else 6),radius=radius,depth=length/1000,location=xyz(x,u,v),rotation=(math.pi/2,0,0))
    o=bpy.context.object
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return finish(o,name,role,0)
def ring(name,u,v,w,h,thick,depth,role=1):
    def outline(w,h):
        c=min(w,h)*.23
        return [(-w/2,-h/2+c),(-w/2+c,-h/2),(w/2-c,-h/2),(w/2,-h/2+c),(w/2,h/2-c),(w/2-c,h/2),(-w/2+c,h/2),(-w/2,h/2-c)]
    outer=outline(w,h);inner=outline(w-thick*2,h-thick*2)
    verts=[xyz(x,u+dz,v+dy*1000) for dz in (-depth/2,depth/2) for arr in (outer,inner) for x,dy in arr]
    faces=[]
    for i in range(8):
        j=(i+1)%8
        faces.extend([(i,j,j+8,i+8),(i+16,i+24,j+24,j+16),(i,i+16,j+16,j),(i+8,j+8,j+24,i+24)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
    return finish(o,name,role,0)

def build(detail):
    global lod,group,items
    lod=detail;items=[];group='body'
    # Skeletal stock: rear pad, cheek rest and visible structural openings.
    plate('Butt_pad',[(70,129),(91,112),(124,114),(137,130),(136,307),(119,332),(78,328),(68,311)],-.033,.033,3)
    for x in (-.037,.029):plate('Butt_side',[(69,133),(82,119),(100,119),(102,145),(98,284),(116,307),(102,321),(77,316)],x,x+.008,1)
    for x in (-.038,.038):rod('Stock_blue_spine',(103,154),(103,287),4,.005,5,x)
    for v in (143,296):
        cyl('Stock_piston',148,v,94,.012,2)
        cyl('Stock_joint',119,v,22,.021,1)
    plate('Cheek_armor',[(171,113),(309,112),(329,132),(319,175),(231,178),(207,213),(192,203),(186,171),(172,160)],-.034,.034,0)
    rod('Stock_lower_strut',(181,296),(251,214),18,.032,1)
    rod('Stock_upper_strut',(248,211),(363,211),15,.036,1)
    plate('Rear_armor',[(307,137),(342,99),(410,98),(438,123),(440,184),(415,207),(346,201),(309,176)],-.043,.043,0)
    # Grip frame and large cutout. These are separate bars, never a filled silhouette.
    plate('Grip_white_back',[(370,204),(406,215),(437,234),(437,263),(421,275),(366,356),(378,373),(362,389),(332,373),(316,356),(337,325),(379,261),(388,237)],-.027,.027,0)
    rod('Rubber_pistol_grip',(430,252),(371,374),46,.050,3)
    rod('Grip_heel',(363,375),(489,403),22,.046,0)
    rod('Guard_outer',(493,397),(587,290),22,.037,1)
    rod('Guard_inner',(393,351),(478,376),10,.025,1)
    rod('Guard_slant',(478,376),(586,261),13,.027,2)
    plate('Grip_end_cap',[(481,388),(507,389),(516,401),(499,416),(480,411)],-.027,.027,1)
    rod('Trigger_guard_lower',(464,294),(548,294),8,.021,1)
    rod('Trigger_guard_front',(548,294),(581,250),8,.021,1)
    rod('Trigger_guard_rear',(457,232),(464,294),8,.021,1)
    rod('Trigger',(493,231),(482,249),9,.016,2)
    rod('Trigger_tip',(482,249),(488,273),9,.016,2)
    # Receiver and dark chassis underneath the white side plates.
    plate('Receiver_chassis',[(583,105),(657,86),(860,88),(916,127),(916,249),(865,296),(690,294),(656,264),(601,290),(570,266)],-.043,.043,1)
    plate('Receiver_panel_L',[(690,118),(708,106),(861,111),(891,131),(907,154),(907,215),(881,244),(864,292),(739,292),(716,265),(690,246),(678,231),(678,157)],-.059,-.044,0)
    plate('Receiver_panel_R',[(690,118),(708,106),(861,111),(891,131),(907,154),(907,215),(881,244),(864,292),(739,292),(716,265),(690,246),(678,231),(678,157)],.044,.059,0)
    # Open reflex sight: keep the sightline clear during the ADS approach.
    box('Sight_foot',740,87,88,13,.052,1)
    box('Sight_pedestal',741,72,60,21,.037,1)
    ring('Sight_housing',754,52,.055,.045,.006,41,0)
    for u in (748,755):box('Sight_reticle',u,60,4,3,.021,5)
    # Long accelerator chassis; preserve the open side channel.
    box('Rail_top_chassis',1164,135,499,21,.069,1)
    box('Rail_lower_chassis',1165,226,498,24,.069,1)
    top=[(902,98),(1063,97),(1078,90),(1399,91),(1411,111),(1390,143),(1250,148),(1235,156),(995,156),(979,145),(927,140)]
    bottom=[(932,222),(1097,222),(1115,217),(1389,222),(1407,248),(1394,275),(1270,279),(1257,263),(1210,261),(1195,278),(1152,276),(1143,256),(957,256),(919,243)]
    for x0,x1 in [(-.047,-.034),(.034,.047)]:
        plate('Upper_rail_armor',top,x0,x1,0)
        plate('Lower_rail_armor',bottom,x0,x1,0)
    box('Upper_bridge',1225,101,310,12,.068,0)
    box('Rail_bed',1170,185,439,64,.039,1)
    for x in (-.026,.026):
        cyl('Accelerator_core',1119,171,242,.006,6,x)
        # The blue rails remain clearly separated, with a dark gap between them.
        cyl('Lower_energy_guide',1119,186,242,.006,6,x)
        for u in (970,990,1251,1271):cyl('Rail_collar',u,178,12,.021,1,x)
    for u in (956,1344):cyl('Bore_coupler',u,183,45,.036,2)
    # Octagonal rectangular muzzle, as seen in the front view.
    ring('Muzzle_rear',1412,185,.089,.151,.014,26,1)
    ring('Muzzle_steel',1432,185,.091,.148,.009,12,2)
    ring('Muzzle_shell',1446,185,.083,.139,.012,23,1)
    ring('Muzzle_energy',1460,185,.070,.119,.0032,3,5)
    ring('Muzzle_inner',1454,185,.063,.109,.006,12,3)
    box('Bore_recess',1442,185,2,92,.046,3)
    # Exposed rear capacitor rails; lower structure is visible through the grip.
    for v in (96,212):rod('Capacitor_cage',(437,v),(616,v),14,.059,1)
    for x in (-.026,.026):
        for v in (100,197):
            cyl('Capacitor_piston',528,v,173,.012,2,x)
    # Animated carriage holds the copper windings and their dark collars.
    group='carriage'
    for v in (125,171):
        cyl('Copper_winding',537,v,78,.020,9,0,16 if lod=='high' else 8)
        for u in (489,583):
            cyl('Capacitor_collar',u,v,20,.027,1)
            cyl('Capacitor_band',u+4,v,4,.028,2)
        for u in (476,597):cyl('Capacitor_blue_ring',u,v,4,.024,5)
    for x0,x1 in [(-.044,-.031),(.031,.044)]:
        plate('Carriage_bracket',[(459,98),(476,98),(482,112),(476,190),(487,210),(467,211),(450,188),(452,121)],x0,x1,1)
        rod('Carriage_status',(464,139),(462,177),4,.004,5,(x0+x1)/2)
    group='sleeve'
    for x0,x1 in [(-.052,-.038),(.038,.052)]:
        plate('Locking_sleeve',[(618,88),(672,87),(695,108),(680,135),(663,154),(658,211),(640,220),(621,205),(617,150),(598,124),(599,106)],x0,x1,0)
    box('Sleeve_top',644,94,66,10,.080,0)
    group='body'
    # Geometry detail only where it changes the outline or is readable in FPS.
    if lod=='high':
        for u in range(368,580,27):box('Top_notches',u,84,17,9,.035,1)
        for u in range(951,1320,62):box('Underside_teeth',u,269,18,10,.043,1)
        for u in range(435,597,29):box('Cage_rib',u,221,13,12,.075,1)
        # Layered rails and exposed hardware read in the close first-person view.
        for x in (-.030,.030):
            rod('Receiver_spine',(699,99),(875,102),9,.009,1,x)
            rod('Rail_edge_inlay',(1000,150),(1236,150),3,.004,5,x)
            rod('Sight_guard',(734,37),(734,82),9,.011,1,x)
        for u in (515,561):
            for v in (125,171):cyl('Winding_retainer',u,v,3,.021,2,seg=12)
        for u in (1337,1392):
            ring('Front_binding',u,185,.071,.120,.006,7,1)
        for x in (-.049,.049):
            rod('Carriage_brace',(453,120),(478,102),10,.012,2,x)
            rod('Carriage_brace',(454,183),(479,202),10,.012,2,x)
        for x in (-.049,.049):
            for u,v in [(335,147),(412,179),(720,128),(878,157),(714,239),(857,276),(1354,126),(1388,246)]:
                # Small steel washers; bolt slots are in the atlas.
                points=[(u+3*math.cos(i*math.tau/6),v+3*math.sin(i*math.tau/6)) for i in range(6)]
                plate('Fastener',points,x-.001,x+.001,2,0)
        for v in range(274,344,12):rod('Grip_ridge',(414-(v-274)*.58,v),(424-(v-274)*.58,v+5),3,.049,1)
    return items[:]

def collect(objects,name):
    col=bpy.data.collections.new(name);scene.collection.children.link(col)
    for o in objects:
        for c in list(o.users_collection):c.objects.unlink(o)
        col.objects.link(o)
    return col

high=build('high');source=collect(high,'Editable source / HIGH')
low=build('low');lowcol=collect(low,'Editable source / LOW')
source.hide_render=True;source.hide_viewport=True;lowcol.hide_render=True;lowcol.hide_viewport=True
exports=[];reports={}
for detail,objects in [('high',high),('low',low)]:
    col=bpy.data.collections.new('Runtime / '+detail);scene.collection.children.link(col)
    roots=[]
    for assembly in ('body','carriage','sleeve'):
        clones=[]
        for o in objects:
            if o['assembly']!=assembly:continue
            c=o.copy();c.data=o.data.copy();col.objects.link(c);clones.append(c)
        bpy.ops.object.select_all(action='DESELECT')
        for c in clones:c.select_set(True)
        bpy.context.view_layer.objects.active=clones[0];bpy.ops.object.join();o=bpy.context.object
        o.name='r01_'+assembly
        # Bake object transforms into geometry, then animate only the rigid assembly.
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        roots.append(o)
        if assembly!='body':
            samples=[(0,0),(2,0),(5,.005),(14,.022),(36,.022),(54,.010),(66,0),(72,0)] if assembly=='carriage' else [(0,0),(2,0),(8,.005),(14,.012),(54,.012),(66,0),(72,0)]
            for frame,value in samples:
                o.location=(0,-value,0) if assembly=='carriage' else (0,0,value)
                o.keyframe_insert(data_path='location',frame=frame,group=assembly)
            action=o.animation_data.action;action.name='shot_cycle_'+assembly;action.use_fake_user=True
            track=o.animation_data.nla_tracks.new();track.name='shot_cycle';track.strips.new(action.name,0,action)
            o.animation_data.action=None
    anchors={'muzzle':(0,1462,185),'grip':(0,417,342),'support':(0,915,260),'tracker':(-.061,791,263),'sight':(0,733.5,52)}
    for name,(x,u,v) in anchors.items():
        o=bpy.data.objects.new('r01_'+name,None);o.location=xyz(x,u,v);col.objects.link(o);roots.append(o)
    scene.frame_set(0);bpy.ops.object.select_all(action='DESELECT')
    for o in roots:o.select_set(True)
    count=0
    for o in roots:
        if o.type=='MESH':o.data.calc_loop_triangles();count+=len(o.data.loop_triangles)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{detail}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_attributes=True,export_materials='NONE',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_frame_range=True,export_frame_step=1,export_extras=True)
    reports[detail]={'triangles':count,'runtimeMeshes':3,'baseDrawCalls':4,'bytes':(OUT/f'{detail}.glb').stat().st_size}
    exports.append(col)
    col.hide_render=True;col.hide_viewport=True

manifest={'version':2,'name':'R-01','source':'User supplied Railgun R-01 Technical Design Sheet.png','duration':1.2,'clip':'shot_cycle','forward':'-Z','up':'+Y','lods':reports,'anchors':{name:[x,(222-v)/1000,(545-u)/1000] for name,(x,u,v) in anchors.items()},'atlas':{'width':2048,'height':2048,'maps':['detail.png','normal.png','roughness.png'],'authoring':['height.png'],'note':'2048px atlas retained for close-view fidelity after user quality review.'}}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
(ART/'reports/build.json').write_text(json.dumps(manifest,indent=2))
assert reports['high']['triangles']<=8000,reports
assert reports['low']['triangles']<=2000,reports
# Keep an editable, nicely lit hero scene, with the runtime high assembly visible.
exports[0].hide_render=False;exports[0].hide_viewport=False
reference=bpy.data.images.load(str(ART/'reference/r01-design-sheet.png'));reference.pack()
for im in bpy.data.images:
    if im.source=='FILE':im.pack()
scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.115,.15,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
def aim(o,at):o.rotation_euler=(Vector(at)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,energy,size in [('Key',(-1.5,-.1,2),190,2.2),('Rim',(1,1,1.4),210,1.7),('Fill',(-.6,1,.2),50,1.4)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;aim(o,(0,.15,.03))
data=bpy.data.cameras.new('Review');camera=bpy.data.objects.new('Review',data);scene.collection.objects.link(camera);scene.camera=camera
camera.location=(-1.8,1.9,.85);aim(camera,(0,.15,.025));data.type='ORTHO';data.ortho_scale=1.65
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=1536;scene.render.resolution_y=768;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'r01.blend'))
print('R01_BUILD',json.dumps(reports))
