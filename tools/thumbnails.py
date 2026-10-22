"""Square preview pictures of every flower for the "Add flowers" list: public/thumbs/<flower id>.webp.

    python tools/thumbnails.py [id ...]        (needs numpy and Pillow; run after prepare_models.py)

Each model is drawn as lit coloured points (the contact sheet's renderer) from the front and a little above, at three
times the size, then scaled down so the edges are smooth. The recolourable flowers are shown in their first colour.
"""
import json, re, sys
from pathlib import Path

import numpy as np
from PIL import Image

import contact_sheet
from contact_sheet import cloud
from prepare_models import OUT, ROOT

SIZE = 128
SCALE = 3
TARGET = ROOT / 'public' / 'thumbs'
# Enough points to close the surface at this size (the contact sheet's default is for smaller pictures).
contact_sheet.POINTS = 400000
# Looking down at the head this far from the side, radians.
FROM_ABOVE = 0.6


def tintable_flowers():
    """id, model file and first colour of the six recolourable flowers, read from src/catalog.ts."""
    text = (ROOT / 'src' / 'catalog.ts').read_text(encoding='utf-8')
    found = re.findall(r"id: '(\w+)', name: '[^']*', model: '([\w.]+)'.*?colours: \[\s*\{ id: '\w+', name: '[^']*', hex: '(#[0-9a-f]{6})'", text, re.S)
    return [(fid, model, hex_) for fid, model, hex_ in found]


def generated_flowers():
    rows = [json.loads(line.strip().rstrip(',')) for line in (ROOT / 'src' / 'catalog.generated.ts').read_text(encoding='utf-8').splitlines()
            if line.startswith('  {')]
    return [(r['id'], r['model'], None) for r in rows]


def picture(points, colours):
    """Points facing +Y (the way the head faces), seen from the front and above, on a transparent square."""
    c, s = np.cos(FROM_ABOVE), np.sin(FROM_ABOVE)
    # Tip the head towards the viewer: the camera looks along -Z, +Y is up on the picture.
    p = points @ np.array([[1, 0, 0], [0, s, -c], [0, c, s]]).T
    big = SIZE * SCALE
    half = max(np.abs(p[:, :2]).max() * 1.08, 1e-6)
    img = np.zeros((big, big, 4), np.uint8)
    order = np.argsort(p[:, 2])
    x = np.clip(((p[order, 0] / half + 1) / 2 * (big - 1)).astype(int), 0, big - 4)
    y = np.clip(((1 - p[order, 1] / half) / 2 * (big - 1)).astype(int), 0, big - 4)
    rgba = np.column_stack([(np.clip(colours[order], 0, 1) ** (1 / 2.2) * 255).astype(np.uint8), np.full(len(order), 255, np.uint8)])
    for dx in range(4):
        for dy in range(4):
            img[y + dy, x + dx] = rgba
    return Image.fromarray(img, 'RGBA').resize((SIZE, SIZE), Image.LANCZOS)


def main():
    only = set(sys.argv[1:])
    TARGET.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(1)
    for fid, model, hex_ in tintable_flowers() + generated_flowers():
        if only and fid not in only:
            continue
        points, colours = cloud(OUT / model, rng, tint=hex_)
        target = TARGET / f'{fid}.webp'
        picture(points, colours).save(target, 'WEBP', quality=82)
        print(f'{fid:12s} {target.stat().st_size // 1024:3d} KB')


if __name__ == '__main__':
    main()
