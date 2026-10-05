"""Make a labeled reference/model comparison sheet without altering either."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2];ART=ROOT/'art/railgun-r01'
ref=Image.open(ART/'reference/r01-design-sheet.png').convert('RGB')
board=Image.new('RGB',(1600,1130),'#141c25');d=ImageDraw.Draw(board)
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',22)
small=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',16)
def panel(image,box,title):
    x,y,w,h=box;d.text((x,y),title,fill='#dceaff',font=font)
    image.thumbnail((w,h-32),Image.Resampling.LANCZOS)
    board.paste(image,(x+(w-image.width)//2,y+32+(h-32-image.height)//2))
panel(ref.crop((40,24,1490,423)),(24,16,1552,335),'SUPPLIED REFERENCE / SIDE')
panel(Image.open(ART/'renders/side.png').crop((55,210,1437,610)),(24,365,1552,360),'R-01 / 7,444 TRIANGLES / SHARED PBR ATLAS')
panel(ref.crop((42,440,1480,560)),(24,752,1160,155),'REFERENCE / TOP')
panel(Image.open(ART/'renders/top.png').crop((60,300,1435,465)),(24,921,1160,176),'MODEL / TOP')
panel(Image.open(ART/'renders/front.png'),(1208,752,368,345),'MODEL / FRONT')
board.save(ART/'renders/reference-comparison.png')
