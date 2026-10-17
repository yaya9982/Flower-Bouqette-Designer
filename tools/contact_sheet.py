"""Pictures of every prepared model in public/models/sf/, to check the automatic head cut at a glance.

    python tools/contact_sheet.py [id ...]        (needs numpy and Pillow)

Writes shots/sheets/sheet-N.png. Each model is drawn twice: from the side (up is up) and from above.
The origin, where the designer attaches the stem, is the small blue cross.
"""
import io, json, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from prepare_models import OUT, ROOT, image_bytes, load, primitives, source_material

VIEW = 128     # pixels per view
COLUMNS = 6
ROWS = 4
POINTS = 60000
LIGHT = np.array([0.4, 0.7, 0.6]) / np.linalg.norm([0.4, 0.7, 0.6])


def cloud(path, rng):
    """Coloured points spread evenly over the model's surface."""
    g, blob = load(path)
    points, colours = [], []
    prims = primitives(g, blob)
    areas = [np.linalg.norm(np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]]), axis=1) for _, _, pos, _, _, tri in prims]
    total = sum(a.sum() for a in areas) or 1
    for (_, mat, pos, _, uv, tri), area in zip(prims, areas):
        n = int(POINTS * area.sum() / total)
        if n == 0:
            continue
        pick = rng.choice(len(tri), n, p=area / area.sum())
        a, b = rng.random(n), rng.random(n)
        flip = a + b > 1
        a[flip], b[flip] = 1 - a[flip], 1 - b[flip]
        w = np.stack([1 - a - b, a, b], 1)[:, :, None]
        t = tri[pick]
        p = (pos[t] * w).sum(1)
        factor, image, _, _ = source_material(g, mat)
        rgb = np.tile(np.array(factor[:3], float), (n, 1))
        keep = np.ones(n, bool)
        if image is not None:
            img = np.asarray(Image.open(io.BytesIO(image_bytes(g, blob, image))).convert('RGBA'), float) / 255
            at = (uv[t] * w).sum(1)
            h, wd = img.shape[:2]
            texel = img[np.clip((at[:, 1] % 1 * h).astype(int), 0, h - 1), np.clip((at[:, 0] % 1 * wd).astype(int), 0, wd - 1)]
            rgb, keep = rgb * texel[:, :3], texel[:, 3] > 0.5
        normal = np.cross(pos[t[:, 1]] - pos[t[:, 0]], pos[t[:, 2]] - pos[t[:, 0]])
        normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-12)
        shade = 0.55 + 0.45 * np.abs(normal @ LIGHT)
        points.append(p[keep])
        colours.append((rgb * shade[:, None])[keep])
    return np.concatenate(points), np.concatenate(colours)


def view(points, colours, across, up, depth, half):
    """A square picture looking along `depth` (points with a larger value are nearer)."""
    img = np.full((VIEW, VIEW, 3), 245, np.uint8)
    order = np.argsort(points[:, depth])
    x = np.clip(((points[order, across] / half + 1) / 2 * (VIEW - 1)).astype(int), 0, VIEW - 2)
    y = np.clip(((1 - points[order, up] / half) / 2 * (VIEW - 1)).astype(int), 0, VIEW - 2)
    rgb = (np.clip(colours[order], 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        img[y + dy, x + dx] = rgb
    c = VIEW // 2
    img[c, c - 4:c + 5] = img[c - 4:c + 5, c] = (47, 111, 237)
    return Image.fromarray(img)


def main():
    rows = [json.loads(line.strip().rstrip(',')) for line in (ROOT / 'src' / 'catalog.generated.ts').read_text(encoding='utf-8').splitlines()
            if line.startswith('  {')]
    only = {a[:8] for a in sys.argv[1:]}
    rows = [r for r in rows if not only or r['id'][3:] in only]
    out = ROOT / 'shots' / 'sheets'
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(1)
    per_sheet = COLUMNS * ROWS
    for start in range(0, len(rows), per_sheet):
        sheet = Image.new('RGB', (COLUMNS * (2 * VIEW + 8), ROWS * (VIEW + 28)), 'white')
        draw = ImageDraw.Draw(sheet)
        for i, row in enumerate(rows[start:start + per_sheet]):
            points, colours = cloud(OUT / row['model'], rng)
            half = max(np.abs(points).max() * 1.05, 1e-6)
            x, y = (i % COLUMNS) * (2 * VIEW + 8), (i // COLUMNS) * (VIEW + 28)
            sheet.paste(view(points, colours, 0, 1, 2, half), (x, y))          # from the side
            sheet.paste(view(points, colours, 0, 2, 1, half), (x + VIEW, y))   # from above
            label = f"{row['id'][3:]} {row['name']}: {row['title']}".encode('ascii', 'replace').decode()[:42]
            draw.text((x + 2, y + VIEW + 2), label, fill='black')
            draw.text((x + 2, y + VIEW + 14), f"{2 * half * 100:.0f} cm across the picture, head {row['headDiameter'] * 100:.0f} cm", fill=(110, 110, 110))
        target = out / f'sheet-{start // per_sheet + 1}.png'
        sheet.save(target)
        print(target.relative_to(ROOT))


if __name__ == '__main__':
    main()
