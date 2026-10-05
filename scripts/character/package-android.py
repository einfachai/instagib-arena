"""Compose review sheets from actual Blender renders. Requires Pillow.

--sheet-only produces the orthographic sheet. --contacts-only composes all
still contact sheets while a turntable is rendering. A normal run also checks
that all deliverables correspond to the latest saved model.
Append --variant claude for the independent Claude asset; Codex is the default.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
from android_variant import variant_options
variant, _ = variant_options()
OUT = variant['out']
R = OUT / 'renders'
BG = '#0b0e12'
FG = '#dce7f5'

def picture(name):
    return Image.open(R / name).convert('RGB')

def contact(names, labels, filename, columns=3, cell=(480,600)):
    w,h=cell
    rows=(len(names)+columns-1)//columns
    result=Image.new('RGB',(w*columns,(h+48)*rows),BG)
    draw=ImageDraw.Draw(result)
    for i,(name,label) in enumerate(zip(names,labels)):
        im=ImageOps.contain(picture(name),(w,h))
        x=(i%columns)*w;y=(i//columns)*(h+48)
        result.paste(im,(x+(w-im.width)//2,y+(h-im.height)//2))
        draw.text((x+20,y+h+14),label,fill=FG,font_size=20)
    result.save(R/filename,quality=94)

# Side profiles are cropped to the body; front/back retain the complete T-pose.
tiles=[]
for view in ('front','left','back','side'):
    im=picture(f'orthographic-{view}.png')
    if view in ('left','side'):im=im.crop((355,0,745,1100))
    tiles.append(im)
width=sum(im.width for im in tiles)
sheet=Image.new('RGB',(width,2220),BG)
draw=ImageDraw.Draw(sheet)
draw.text((38,24),variant['name'].upper() + ' / ' + str(variant['revision']).zfill(2),fill=FG,font_size=32)
draw.text((width-600,32),'BLENDER MODEL / REFERENCE STUDY',fill='#8493a8',font_size=20)
x=0
for im,label in zip(tiles,('FRONT','RIGHT','BACK','LEFT')):
    sheet.paste(im,(x,80))
    draw.text((x+22,1154),label,fill=FG,font_size=24)
    x+=im.width
for i,(view,label) in enumerate([('top','TOP'),('head-front','CLAWD HEAD' if variant['key']=='claude' else 'MONITOR HEAD')]):
    im=ImageOps.contain(picture(f'orthographic-{view}.png'),(width//2-60,960))
    x=i*(width//2)+(width//2-im.width)//2
    sheet.paste(im,(x,1210))
    draw.text((i*(width//2)+38,2170),label,fill=FG,font_size=24)
sheet.save(R/'character-sheet.png')
ImageOps.contain(sheet,(1800,1800)).save(R/'character-sheet.jpg',quality=94)
if '--sheet-only' in sys.argv:
    print(R/'character-sheet.jpg')
    raise SystemExit(0)

contact(['front.png','side.png','back.png'],['FRONT','SIDE','BACK'],'body-review.jpg')
contact(['head.png','window.png'],['CLAWD HEAD' if variant['key']=='claude' else 'MONITOR HEAD','INSPECTION WINDOW'],'detail-review.jpg',2,(800,800))
contact(['hands.png','shoulders.png','feet.png'],['HANDS','SHOULDERS','FEET'],'component-review.jpg',3,(600,750))

if variant['key']=='codex':
    # Compare actual model renders with the same supplied full-body reference.
    ref=Image.open(OUT/'reference/futuristic-cloud-robot.png').convert('RGB')
    comparison=Image.new('RGB',(1800,1510),BG);draw=ImageDraw.Draw(comparison)
    for i,(label,rect,name) in enumerate([
        ('HANDS',(202,710,355,928),'hands.png'),
        ('SHOULDERS',(225,276,440,477),'shoulders.png'),
        ('FEET',(212,1255,770,1510),'feet.png')]):
        left=ImageOps.contain(ref.crop(rect),(550,600))
        model=picture(name)
        if name=='shoulders.png':model=model.crop((725,565,1024,1060))
        right=ImageOps.contain(model,(580,750))
        comparison.paste(left,(600*i+(600-left.width)//2,45+(600-left.height)//2))
        comparison.paste(right,(600*i+(600-right.width)//2,705+(750-right.height)//2))
        draw.text((600*i+22,18),label+' / REFERENCE',fill=FG,font_size=22)
        draw.text((600*i+22,665),'REVISED BLENDER MODEL',fill=FG,font_size=22)
    comparison.save(R/'component-comparison.jpg',quality=94)

pose_names=['idle.relaxed','idle.armed','sprint.forward','jump.rifle','dash.right','emote.placeholder']
contact([f'pose-{name}.png' for name in pose_names],['IDLE','RIFLE AIM','SPRINT','JUMP','DASH','VICTORY'],'pose-review.jpg')
turntable_samples=[f'turntable-frames/{frame:04d}.png' for frame in (0,9,18,27)]
if all((R/name).exists() for name in turntable_samples):
    contact(turntable_samples,['0 DEGREES','90 DEGREES','180 DEGREES','270 DEGREES'],'turntable-review.jpg',4,(320,400))
elif '--contacts-only' not in sys.argv:
    raise AssertionError('Render the turntable before final packaging')

if variant['key']=='codex':
    before=Image.open(OUT/'revisions/04/renders/front.png').convert('RGB')
    after=picture('front.png')
    comparison=Image.new('RGB',(1280,848),BG);draw=ImageDraw.Draw(comparison)
    for i,(im,label) in enumerate([(before,'PREVIOUS VERSION'),(after,'CLOSED TORSO / CODEX BLUE')]):
        im=ImageOps.contain(im,(640,800));comparison.paste(im,(640*i+(640-im.width)//2,0))
        draw.text((640*i+20,814),label,fill=FG,font_size=20)
    comparison.save(R/'before-after.jpg',quality=94)
if '--contacts-only' in sys.argv:
    print('Review contact sheets composed; full deliverable validation deferred.')
    raise SystemExit(0)

blend=OUT/(variant['id']+'.blend')
if variant['key']=='claude':
    model_hash=hashlib.sha256(blend.read_bytes()).hexdigest()
    validation=json.loads((OUT/'reports/validation.json').read_text())
    runtime=json.loads((OUT/'reports/glb-validation.json').read_text())
    assert validation['model_sha256']==model_hash and validation['head_shoulder_clear'],'Source validation is stale or failed'
    assert runtime['sourceSha256']==model_hash and runtime['passed'],'GLB validation is stale or failed'
files=[R/f'{name}.png' for name in ('hero','front','side','back','head','window','hands','shoulders','feet','torso-side')]
files += [R/f'pose-{name}.png' for name in pose_names]
files += sorted(R.glob('orthographic-*.png'))
frames=sorted((R/'turntable-frames').glob('*.png'))
assert len(frames)==36
for path in files+frames:
    assert path.stat().st_mtime>blend.stat().st_mtime,f'Stale render: {path}'
    with Image.open(path) as im:im.verify()
video=R/'turntable.mp4'
assert video.stat().st_mtime>max(path.stat().st_mtime for path in frames),'Encode the current turntable frames before packaging'
report=dict(revision=variant['revision'],blend_sha256=hashlib.sha256(blend.read_bytes()).hexdigest(),
            blend_bytes=blend.stat().st_size,review_stills=len(files),turntable_frames=len(frames),
            turntable_sha256=hashlib.sha256(video.read_bytes()).hexdigest(),
            all_renders_newer_than_model=True,
            renderers={'shaded_views':'Eevee','pose_checks':'Workbench'})
(OUT/'reports/deliverables.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
