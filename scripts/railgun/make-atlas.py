"""Reference-registered PBR atlas with generated material trims and authored relief.
Run with Pillow + numpy. AI source and generation prompt are retained in art/.
"""
from pathlib import Path
import math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/models/railgun-r01';ART=ROOT/'art/railgun-r01'
random.seed(101);size=2048
ref=Image.open(ART/'reference/r01-design-sheet.png').convert('RGB')
generated=Image.open(ART/'textures/generated-atlas-v2.png').convert('RGB')
im=Image.new('RGB',(size,size),(40,43,48))
# The source's exact armor outlines are registered to the authored mesh. Generated
# trims supply the cylindrical coils, non-planar frame, and grip surfaces.
im.paste(ref.crop((0,0,1536,430)).resize((2048,1024),Image.Resampling.LANCZOS),(0,0))
im.paste(ref.crop((0,430,1536,565)).resize((2048,192),Image.Resampling.LANCZOS),(0,1024))
im.paste(ref.crop((0,565,1536,705)).resize((2048,192),Image.Resampling.LANCZOS),(0,1216))
im.paste(generated.crop((0,488,1254,742)).resize((2048,224),Image.Resampling.LANCZOS),(0,1408))
im.paste(generated.crop((0,749,1254,988)).resize((2048,208),Image.Resampling.LANCZOS),(0,1632))
im.paste(generated.crop((0,996,1254,1254)).resize((2048,208),Image.Resampling.LANCZOS),(0,1840))
# Unused sheet margin holds a dedicated muzzle/end-face projection. Side UVs
# never touch this area; the emitter retains its own geometric illuminated rim.
im.paste(ref.crop((440,705,615,984)).resize((150,240),Image.Resampling.LANCZOS),(0,0))
# Six material swatches for end caps and tiny bevels, with generous mip padding.
palette=['e4e8eb','252a30','8b939d','11151a','1b2027','008aff']
d=ImageDraw.Draw(im)
for i,color in enumerate(palette):d.rectangle((1856+i*32,1990,1887+i*32,2047),fill='#'+color)
im.save(OUT/'detail.png',optimize=True)
# Height is structural, NOT simply brightness-to-height: printed labels stay flat.
height=Image.new('L',(size,size),128);h=ImageDraw.Draw(height)
def pt(u,v):return u/1536*2048,v/430*1024
def line(points,width=2,value=80):h.line([pt(*p) for p in points],fill=value,width=width,joint='curve')
def bolt(u,v,r=4):
    x,y=pt(u,v);r*=1.6
    h.ellipse((x-r,y-r,x+r,y+r),fill=170)
    h.ellipse((x-r*.76,y-r*.76,x+r*.76,y+r*.76),fill=75)
    h.ellipse((x-r*.5,y-r*.5,x+r*.5,y+r*.5),fill=139)
    h.line((x-r*.28,y,x+r*.28,y),fill=55,width=2)
def slot(u,v,w=20,hh=5):
    x,y=pt(u,v);w*=1.33;hh*=2.38
    h.rounded_rectangle((x-2,y-2,x+w+2,y+hh+2),radius=hh/2,fill=165)
    h.rounded_rectangle((x,y,x+w,y+hh),radius=hh/2,fill=48)
for u,v in [(182,149),(201,173),(321,137),(355,363),(487,398),(429,241),(401,217),
 (696,153),(710,234),(726,254),(754,285),(850,284),(861,249),(893,153),
 (1361,128),(1399,150),(1360,235),(1382,274),(1172,274),(687,99),(653,98)]:bolt(u,v)
for u,v,w,hh in [(634,96,25,5),(638,121,20,5),(953,128,27,5),(953,234,28,5),
 (972,253,32,4),(1169,269,18,5),(1335,149,23,5),(425,236,6,16),(351,177,31,4)]:slot(u,v,w,hh)
for points in [[(707,155),(707,222),(731,242),(850,242),(878,220)],
 [(724,128),(842,128),(868,145)],[(733,250),(757,271),(830,271),(851,250)],
 [(181,134),(303,134)],[(333,147),(333,176),(350,193)],[(350,326),(374,288),(391,261)],
 [(948,110),(980,110),(999,134),(1242,134),(1264,119),(1375,118)],
 [(938,244),(1097,244),(1113,232),(1303,232),(1328,250)],
 [(233,193),(311,191)],[(587,251),(616,257),(636,238)]]:line(points,3,77)
# Dense machined microdetail from the generated trims, restricted to their own regions.
gray=np.asarray(im.convert('L'),dtype=np.float32)
a=np.asarray(height,dtype=np.float32).copy()
for y0,y1,strength in [(1024,1408,.26),(1408,1632,.5),(1632,1840,.38),(1840,1990,.38)]:
    lum=gray[y0:y1];base=np.asarray(Image.fromarray(lum.astype('uint8')).filter(ImageFilter.GaussianBlur(5)),dtype=np.float32)
    a[y0:y1]=128+(lum-base)*strength
front=gray[:240,:150]
front_base=np.asarray(Image.fromarray(front.astype('uint8')).filter(ImageFilter.GaussianBlur(3)),dtype=np.float32)
a[:240,:150]=128+(front-front_base)*.3
height=Image.fromarray(np.uint8(np.clip(a,0,255))).filter(ImageFilter.GaussianBlur(.75))
height.save(OUT/'height.png',optimize=True)
arr=np.asarray(height,dtype=np.float32)/255
dy,dx=np.gradient(arr)
n=np.stack((-dx*8,dy*8,np.ones_like(dx)),axis=-1);n/=np.linalg.norm(n,axis=-1,keepdims=True)
Image.fromarray(np.uint8(np.clip(n*.5+.5,0,1)*255)).save(OUT/'normal.png',optimize=True)
# A separate roughness texture lets screw wells, ceramic paint and polished
# machining react differently to the environment instead of painting highlights.
noise=np.random.default_rng(101).normal(0,3,(size,size))
rough=np.clip(205+(128-np.asarray(height,dtype=np.float32))*.18+noise,145,235)
rough[1408:1632]=np.clip(180+noise[1408:1632]+gray[1408:1632]*.12,155,220)
Image.fromarray(rough.astype('uint8')).convert('RGB').save(OUT/'roughness.png',optimize=True)
print('Wrote 2048px albedo, authored height, tangent normal, and roughness maps')
