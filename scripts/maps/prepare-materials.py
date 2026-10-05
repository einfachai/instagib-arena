#!/usr/bin/env python3
"""Build locally shipped 2K/1K PBR sets. Requires Pillow, numpy and toktx 4.4.
Sources are CC0 ambientCG Metal032 / Concrete034; downloads are cached outside public/.
Usage: python prepare-materials.py --sources /tmp/arena-surface-sources --toktx /path/to/toktx
"""
import argparse, hashlib, io, json, subprocess, urllib.request, zipfile
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MATERIALS = {
    'titanium': ((157, 170, 181), .44, .75, 'panel'),
    'ceramic': ((207, 216, 223), .48, .04, 'panel'),
    'steel': ((135, 141, 145), .53, .82, 'panel'),
    'grate': ((150, 162, 171), .5, .8, 'grate'),
    'cargo': ((199, 210, 220), .46, .5, 'panel'),
    'concrete': ((154, 157, 155), .78, .0, 'slab'),
    'regolith': ((174, 140, 108), .86, .0, 'ground'),
    'epoxy': ((168, 184, 194), .3, .05, 'slab'),
    'wetplate': ((121, 139, 154), .23, .6, 'panel'),
}

def build(args):
    sources = Path(args.sources); sources.mkdir(parents=True, exist_ok=True)
    out = ROOT / 'public/textures/world'; out.mkdir(parents=True, exist_ok=True)
    scratch = sources / 'processed'; scratch.mkdir(exist_ok=True)
    archives = {}; provenance = []
    for ident in ['Metal032', 'Concrete034']:
        path = sources / (ident + '.zip')
        if not path.exists():
            urllib.request.urlretrieve('https://ambientcg.com/get?file=' + ident + '_2K-JPG.zip', path)
        archives[ident] = zipfile.ZipFile(path)
        provenance.append({'id': ident, 'url': 'https://ambientcg.com/view?id='+ident,
                           'license': 'CC0-1.0', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    def channel(ident, name):
        z = archives[ident]
        found = next((n for n in z.namelist() if n.endswith('_'+name+'.jpg')), None)
        return np.array(Image.open(io.BytesIO(z.read(found))).convert('RGB').resize((2048,2048),Image.Resampling.LANCZOS), dtype=np.float32)/255 if found else None
    metal = channel('Metal032', 'Color').mean(axis=2)
    cement = channel('Concrete034', 'Color').mean(axis=2)
    mr = channel('Metal032', 'Roughness').mean(axis=2)
    mn = channel('Metal032', 'NormalGL') * 2 - 1
    yy, xx = np.mgrid[:2048,:2048].astype(np.float32)
    records = []
    for name, (base, rough, metallic, pattern) in MATERIALS.items():
        source = cement if pattern in ('ground', 'slab') else metal
        texture_noise = (source - source.mean())
        tile = 1024 if pattern != 'grate' else 256
        dx = np.minimum(xx % tile, tile - xx % tile)
        dy = np.minimum(yy % tile, tile - yy % tile)
        height = np.minimum(np.clip(dx/8, 0, 1), np.clip(dy/8, 0, 1)) * 5
        if pattern == 'grate':
            height = np.maximum((xx % 48 < 8).astype(np.float32), (yy % 128 < 9).astype(np.float32)) * 3
        if pattern == 'ground': height[:] = 2
        # Narrow recessed fastening points, repeated consistently across all channels.
        if pattern == 'panel':
            for cx in [32, 992, 1056, 2016]:
                for cy in [32, 992, 1056, 2016]:
                    r = np.hypot(xx-cx, yy-cy)
                    height -= np.clip((6-r)/3, 0, 1)*2
        seam = np.clip((5-height)/5, 0, 1)
        shade = 1 - seam*.28 + texture_noise*.32
        albedo = np.clip(np.array(base)[None,None,:] * shade[:,:,None], 0, 255).astype(np.uint8)
        gx = (np.roll(height, -1, 1)-np.roll(height, 1, 1))*.42
        gy = (np.roll(height, -1, 0)-np.roll(height, 1, 0))*.42
        normal = np.stack([-gx, -gy, np.ones_like(gx)], axis=2)
        normal[:,:,:2] += mn[:,:,:2] * (.18 if pattern=='ground' else .1)
        normal /= np.linalg.norm(normal, axis=2, keepdims=True)
        normal = np.clip((normal*.5+.5)*255, 0, 255).astype(np.uint8)
        orm = np.stack([1-seam*.35, np.clip(rough+seam*.18+(mr-mr.mean())*.14, .12, .97),
                        np.full_like(seam, metallic)], axis=2)
        orm = np.clip(orm*255, 0, 255).astype(np.uint8)
        for size in [2048,1024]:
            for channel_name, data in [('color',albedo),('normal',normal),('orm',orm)]:
                img = Image.fromarray(data)
                if size != 2048: img = img.resize((size,size), Image.Resampling.LANCZOS)
                png = scratch / f'{name}-{size}-{channel_name}.png'; img.save(png)
                target = out / f'{name}-{size}-{channel_name}.ktx2'
                cmd = [args.toktx, '--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '9',
                       '--genmipmap', '--assign_oetf', 'srgb' if channel_name=='color' else 'linear',
                       '--assign_primaries', 'bt709', '--threads', '4', str(target), str(png)]
                if not target.exists(): subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
                records.append({'file':target.name,'size':size,'channel':channel_name,
                                'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size})
        print(name, flush=True)
    (out/'manifest.json').write_text(json.dumps({'version':1,'encoder':'KTX-Software 4.4.2 / UASTC + Zstandard',
        'sources':provenance,'authored':'Seams, plate bevels, fastening recesses and aligned ORM channels authored for Agent Deathmatch.',
        'files':records}, indent=2)+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--sources', required=True); parser.add_argument('--toktx', required=True)
    build(parser.parse_args())
