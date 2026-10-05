"""Compose review sheets from actual Blender renders. Requires Pillow.

--sheet-only produces the orthographic sheet. --contacts-only composes all
still contact sheets while a turntable is rendering. A normal run also checks
that all deliverables correspond to the latest saved model.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/codex-android'
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
draw.text((38,24),'CODEX ANDROID / 03',fill=FG,font_size=32)
draw.text((width-600,32),'BLENDER MODEL / REFERENCE STUDY',fill='#8493a8',font_size=20)
x=0
for im,label in zip(tiles,('FRONT','RIGHT','BACK','LEFT')):
    sheet.paste(im,(x,80))
    draw.text((x+22,1154),label,fill=FG,font_size=24)
    x+=im.width
for i,(view,label) in enumerate([('top','TOP'),('head-front','MONITOR HEAD')]):
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
contact(['head.png','window.png'],['MONITOR HEAD','INSPECTION WINDOW'],'detail-review.jpg',2,(800,800))
pose_names=['idle.relaxed','idle.armed','sprint.forward','jump.rifle','dash.right','emote.placeholder']
contact([f'pose-{name}.png' for name in pose_names],['IDLE','RIFLE AIM','SPRINT','JUMP','DASH','VICTORY'],'pose-review.jpg')
contact([f'turntable-frames/{frame:04d}.png' for frame in (0,12,24,36)],['0 DEGREES','90 DEGREES','180 DEGREES','270 DEGREES'],'turntable-review.jpg',4,(320,400))

before=Image.open(OUT/'revisions/01/renders/front.png').convert('RGB')
after=picture('front.png')
comparison=Image.new('RGB',(1280,848),BG);draw=ImageDraw.Draw(comparison)
for i,(im,label) in enumerate([(before,'FIRST PASS'),(after,'REVISED FROM CHARACTER SHEET')]):
    im=ImageOps.contain(im,(640,800));comparison.paste(im,(640*i+(640-im.width)//2,0))
    draw.text((640*i+20,814),label,fill=FG,font_size=20)
comparison.save(R/'before-after.jpg',quality=94)
if '--contacts-only' in sys.argv:
    print('Review contact sheets composed; full deliverable validation deferred.')
    raise SystemExit(0)

blend=OUT/'codex-android.blend'
files=[R/f'{name}.png' for name in ('hero','front','side','back','head','window')]
files += [R/f'pose-{name}.png' for name in pose_names]
files += sorted(R.glob('orthographic-*.png'))
frames=sorted((R/'turntable-frames').glob('*.png'))
assert len(frames)==48
for path in files+frames:
    assert path.stat().st_mtime>blend.stat().st_mtime,f'Stale render: {path}'
    with Image.open(path) as im:im.verify()
video=R/'turntable.mp4'
assert video.stat().st_mtime>max(path.stat().st_mtime for path in frames),'Encode the current turntable frames before packaging'
report=dict(revision=3,blend_sha256=hashlib.sha256(blend.read_bytes()).hexdigest(),
            blend_bytes=blend.stat().st_size,review_stills=len(files),turntable_frames=len(frames),
            turntable_sha256=hashlib.sha256(video.read_bytes()).hexdigest(),
            all_renders_newer_than_model=True,
            renderers={'hero.png':'Cycles','window.png':'Cycles','other_shaded_views':'Eevee','pose_checks':'Workbench'})
(OUT/'reports/deliverables.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
