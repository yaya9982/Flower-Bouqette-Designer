"""Prepares the paper textures from photographed paper in models downloaded from Sketchfab.

    python tools/prepare_paper.py [kraft|matte|tissue ...]

Reads flowers_sources/sketchfab/paper/*.glb (untrusted: prepare_models.load checks the file) and writes, for each paper,
public/textures/paper/<paper>.jpg and <paper>-normal.jpg, which src/paper-textures.ts loads:
- the fibre map is greyscale and averages about 0.92, so the paper colour the customer picks tints it without changing
  how light or dark that colour looks;
- the normal map is the folds and fibres only, scaled so they show at this size;
- both are a clean square cut out of the model's own map (its edges, creases, labels and baked shadows are left out),
  and the app tiles them mirrored, so no seam shows.
Credits for the models are listed by hand in public/credits.html; keep them in step with PAPERS.
"""
import io
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_models as pm  # noqa: E402

SRC = pm.SRC / 'sketchfab' / 'paper'
OUT = pm.ROOT / 'public' / 'textures' / 'paper'
WIDTH = 512
MEAN = 0.92

# box: the clean part of the map, as fractions (left, top, right, bottom); the picture keeps its shape, 512 px wide.
# grain: how much the fibre's brightness variation is stretched. fold: how much the normal map's tilt is stretched.
# derive: the model has no normal map, so one is worked out from the creases' shading, at this strength.
PAPERS = {
    # Above y = 0.31 the model's map is crumple only (below it are the bag's creases and seams), and its first few
    # percent at the top and left are smeared padding.
    'kraft': dict(file='kraft_package.glb', box=(0.03, 0.07, 0.29, 0.30), grain=1.8, fold=1.6),
    'matte': dict(file='cc0_paper.glb', box=(0.25, 0.25, 0.75, 0.75), grain=8.0, fold=7.0),
    # The model's map is a photograph of a crumpled sheet: this strip has no black gaps and no ink marks.
    'tissue': dict(file='scrunched_paper.glb', box=(0.02, 0.83, 0.42, 1.0), grain=0.8, derive=7.0),
}


def map_images(g):
    """Image indices of the first material's base colour and normal map."""
    for m in g.get('materials', []):
        base = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        normal = m.get('normalTexture')
        if base:
            return g['textures'][base['index']]['source'], g['textures'][normal['index']]['source'] if normal else None
    raise ValueError('no material has a base colour map')


def cut(g, blob, index, box):
    img = Image.open(io.BytesIO(pm.image_bytes(g, blob, index))).convert('RGB')
    w, h = img.size
    left, top, right, bottom = box
    crop = img.crop((int(left * w), int(top * h), int(right * w), int(bottom * h)))
    # Width 512; the height keeps the shape, to the nearest power of two.
    height = 2 ** round(math.log2(WIDTH * crop.height / crop.width))
    return crop.resize((WIDTH, height), Image.LANCZOS)


def fibre(img, grain):
    """Greyscale around MEAN, with the brightness variation stretched by `grain`."""
    lum = np.asarray(img, float) @ np.array([0.299, 0.587, 0.114]) / 255
    relative = lum / max(lum.mean(), 1e-6)
    return Image.fromarray((np.clip(MEAN * (1 + (relative - 1) * grain), 0, 1) * 255).astype(np.uint8), 'L')


def folds(img, fold):
    """A normal map whose tilt is stretched by `fold`."""
    n = np.asarray(img, float) / 255 * 2 - 1
    xy = n[..., :2] * fold
    z = np.sqrt(np.clip(1 - (xy ** 2).sum(-1), 0.05, 1))
    out = np.dstack([xy, z])
    out /= np.linalg.norm(out, axis=-1, keepdims=True)
    return Image.fromarray(((out * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB')


def derived_folds(img, strength):
    """A normal map worked out from shading: brightness is taken as height, so creases read as ridges."""
    from PIL import ImageFilter
    height = np.asarray(img.convert('L').filter(ImageFilter.GaussianBlur(1.2)), float) / 255
    gy, gx = np.gradient(height)
    out = np.dstack([-gx * strength * 8, -gy * strength * 8, np.ones_like(height)])
    out /= np.linalg.norm(out, axis=-1, keepdims=True)
    return Image.fromarray(((out * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB')


def build(name, cfg):
    g, blob = pm.load(SRC / cfg['file'])
    base, normal = map_images(g)
    OUT.mkdir(parents=True, exist_ok=True)
    colour = cut(g, blob, base, cfg['box'])
    fibre(colour, cfg['grain']).save(OUT / f'{name}.jpg', 'JPEG', quality=88)
    normal_map = derived_folds(colour, cfg['derive']) if 'derive' in cfg else folds(cut(g, blob, normal, cfg['box']), cfg['fold'])
    normal_map.save(OUT / f'{name}-normal.jpg', 'JPEG', quality=92)
    print(f'{name:7s} {(OUT / f"{name}.jpg").stat().st_size // 1024:4d} KB + {(OUT / f"{name}-normal.jpg").stat().st_size // 1024:4d} KB')


if __name__ == '__main__':
    for name in sys.argv[1:] or PAPERS:
        if (SRC / PAPERS[name]['file']).exists():
            build(name, PAPERS[name])
        else:
            print(f'{name}: {PAPERS[name]["file"]} not downloaded yet, skipped')
