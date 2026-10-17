"""Turns the downloaded flower models into the small head-only files the designer loads.

    python tools/prepare_models.py            (needs numpy and Pillow)

Reads   flowers_sources/<source>/<file>.glb   (the downloads, untouched)
Writes  public/models/<id>.glb

For each flower it keeps only the head (the designer draws its own stems), turns the head to face +Y with its
centre at the origin, scales it to the catalogue's head diameter, shrinks the textures, and makes the petals
grey under a material called "petal" so the designer can tint them. Add a flower by adding an entry to FLOWERS.

The models listed in flowers_sources/sketchfab/manifest.json (see organise_downloads.py) are prepared without
per-model settings: the head is found by where the model narrows to a stem, and each keeps its own colours. They go to
public/models/sf/, and src/catalog.generated.ts and the list in public/credits.html are rewritten to match.
"""
import io, json, re, struct, sys, warnings
from html import escape as html_escape
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'flowers_sources'
OUT = ROOT / 'public' / 'models'
TEXTURE_SIZE = 1024

# pick(node, material, lo, hi, triangles) is called once per connected piece of the source model, with the piece's
# bounds in the source's own units. It returns the output part ('petal' is the tintable one) or None to drop it.
# stub_y: non-petal pieces are also cut off below this height, which leaves a short stub of stem under the head.
# face: rough direction the head faces in the source; the exact direction is then fitted to the head. None = up.
# diameter: head width in metres. Keep it equal to headDiameter in src/catalog.ts.
FLOWERS = {
    'rose': dict(
        file='sketchfab/red_rose.glb', diameter=0.07, stub_y=150, face=None,
        pick=lambda node, mat, lo, hi, n: {'petal': 'petal', 'greens': 'stem'}.get(mat)),
    'carnation': dict(
        file='sketchfab/single_flower__carnation__red.glb', diameter=0.06, stub_y=28, face=None,
        # Drops the bottle (Material.003) and the two leaves (Material_9.003).
        pick=lambda node, mat, lo, hi, n: 'petal' if mat.startswith('petal') else 'stem' if mat == 'Material_9.001' else None),
    'lily': dict(
        file='sketchfab/lily.glb', diameter=0.12, stub_y=None, face=(0, 0, 1),
        pick=lambda node, mat, lo, hi, n: {'lambert3': 'petal', 'things': 'centre'}.get(mat)),
    'sunflower': dict(
        file='sketchfab/sunflower.glb', diameter=0.14, stub_y=None, face=(1, 0, 0),
        # The head is every piece in front of the stem. It keeps its own colours: one material, so no tinting.
        pick=lambda node, mat, lo, hi, n: 'head' if lo[0] > 3 else None),
    'tulip': dict(
        file='sketchfab/tulip.glb', diameter=0.05, stub_y=None, face=None,
        pick=lambda node, mat, lo, hi, n: 'petal' if lo[1] > 0.3 else None),
    'daisy': dict(
        file='sketchfab/daisy.glb', diameter=0.1, stub_y=None, face=(0, 1, 0),
        pick=lambda node, mat, lo, hi, n: None if lo[1] < 2.6 else 'petal' if n == 320 else 'centre'),
}

DTYPES = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8, 5120: np.int8, 5122: np.int16}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


SKETCHFAB_URL = re.compile(r'https://sketchfab\.com/3d-models/[0-9a-f]{32}')
MAX_GLB_BYTES = 300 * 1024 * 1024
# A huge image in a downloaded model stops with an error instead of filling the memory (Pillow only warns at 89 MP).
warnings.simplefilter('error', Image.DecompressionBombWarning)


def load(path):
    """Reads a .glb. The files come from the internet, so the header and chunk sizes are checked before use."""
    if path.stat().st_size > MAX_GLB_BYTES:
        raise ValueError(f'{path.name} is larger than {MAX_GLB_BYTES >> 20} MB')
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b'glTF' or struct.unpack_from('<I', data, 4)[0] != 2:
        raise ValueError(f'{path.name} is not a glTF 2.0 binary')
    if struct.unpack_from('<I', data, 8)[0] != len(data):
        raise ValueError(f'{path.name} is truncated or has a wrong length')
    n, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A or 20 + n > len(data):
        raise ValueError(f'{path.name} has a bad JSON chunk')
    return json.loads(data[20:20 + n]), data[20 + n + 8:]


def accessor(g, blob, i):
    a = g['accessors'][i]
    dt, w = np.dtype(DTYPES[a['componentType']]), WIDTHS[a['type']]
    if 'bufferView' not in a:
        return np.zeros((a['count'], w), dt)
    view = g['bufferViews'][a['bufferView']]
    stride = view.get('byteStride') or dt.itemsize * w
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    rows = np.arange(a['count'])[:, None] * stride + np.arange(dt.itemsize * w)[None, :]
    out = np.frombuffer(blob, np.uint8)[start + rows].copy().view(dt).reshape(a['count'], w)
    return out / np.iinfo(dt).max if a.get('normalized') and dt.kind in 'ui' else out


def local_matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix'], float).reshape(4, 4).T
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4)
    m[:3, :3] = r * np.array(node.get('scale', [1, 1, 1]))
    m[:3, 3] = node.get('translation', [0, 0, 0])
    return m


def primitives(g, blob):
    """Every drawn piece as (node name, material index, positions, normals, uvs, triangles), in world space."""
    out = []

    def walk(i, parent):
        node = g['nodes'][i]
        m = parent @ local_matrix(node)
        if 'mesh' in node:
            for p in g['meshes'][node['mesh']]['primitives']:
                at = p['attributes']
                if p.get('mode', 4) != 4:
                    continue
                pos = accessor(g, blob, at['POSITION']).astype(float) @ m[:3, :3].T + m[:3, 3]
                uv = accessor(g, blob, at['TEXCOORD_0']).astype(float) if 'TEXCOORD_0' in at else np.zeros((len(pos), 2))
                tri = (accessor(g, blob, p['indices']).astype(np.int64) if 'indices' in p else np.arange(len(pos))).reshape(-1)
                tri = tri[:len(tri) // 3 * 3].reshape(-1, 3)
                if 'NORMAL' in at:
                    nrm = accessor(g, blob, at['NORMAL']).astype(float) @ np.linalg.inv(m[:3, :3])
                else:
                    # Each corner gets its triangle's normal, weighted by area.
                    face = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]])
                    nrm = np.zeros_like(pos)
                    for corner in range(3):
                        np.add.at(nrm, tri[:, corner], face)
                out.append((node.get('name', ''), p.get('material'), pos, nrm, uv, tri))
        for child in node.get('children', []):
            walk(child, m)

    for root in g['scenes'][g.get('scene', 0)]['nodes']:
        walk(root, np.eye(4))
    return out


def islands(pos, tri):
    """A label per triangle. Vertices in the same place count as one, so texture seams do not split a piece."""
    _, weld = np.unique(np.round(pos, 4), axis=0, return_inverse=True)
    t = weld.reshape(-1)[tri]
    parent = np.arange(t.max() + 1)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b, c in t:
        ra = find(a)
        parent[find(b)] = ra
        parent[find(c)] = ra
    return np.array([find(a) for a in t[:, 0]])


def rotation_onto_y(v):
    """Rotation matrix that turns unit vector v to +Y."""
    y = np.array([0.0, 1.0, 0.0])
    axis, c = np.cross(v, y), float(v @ y)
    if np.linalg.norm(axis) < 1e-9:
        return np.eye(3) if c > 0 else np.diag([1.0, -1.0, -1.0])
    k = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)


def source_material(g, index):
    """Base colour, texture image index and alpha settings, whichever of the two glTF material styles is used."""
    if index is None:
        return [0.8, 0.8, 0.8, 1], None, 'OPAQUE', 0.5
    m = g['materials'][index]
    sg = m.get('extensions', {}).get('KHR_materials_pbrSpecularGlossiness')
    pbr = m.get('pbrMetallicRoughness', {})
    tex = (sg or {}).get('diffuseTexture') or pbr.get('baseColorTexture')
    factor = (sg or {}).get('diffuseFactor') or pbr.get('baseColorFactor') or [1, 1, 1, 1]
    if tex and m.get('emissiveTexture', {}).get('index') == tex['index']:
        # A model lit by its own picture: the base colour is turned almost off and the same image glows instead.
        factor = [1, 1, 1, 1]
    image = g['textures'][tex['index']]['source'] if tex else None
    return factor, image, m.get('alphaMode', 'OPAQUE'), m.get('alphaCutoff', 0.5)


def image_bytes(g, blob, index):
    view = g['bufferViews'][g['images'][index]['bufferView']]
    return blob[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]


def grey_for_tinting(img, uv):
    """Greyscale copy that keeps the shading but not the colour, bright enough that a tint shows as itself."""
    rgb = np.asarray(img.convert('RGB'), float) / 255
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    h, w = lum.shape
    # Brightness is judged only where the petals actually use the texture.
    used = lum[np.clip((uv[:, 1] % 1 * h).astype(int), 0, h - 1), np.clip((uv[:, 0] % 1 * w).astype(int), 0, w - 1)]
    top, mid = np.percentile(used, 90), np.median(used)
    g = np.clip(lum / max(top, 1e-3), 0, 1)
    gamma = float(np.clip(np.log(0.8) / np.log(max(min(mid / max(top, 1e-3), 0.99), 1e-3)), 0.25, 1))
    # The floor keeps the deepest folds from going near-black, which would turn a white flower silver.
    return Image.fromarray(((0.4 + 0.6 * g ** gamma) * 255).astype(np.uint8)).convert('RGB')


def write_glb(target, label, g, blob, parts, texture_size=TEXTURE_SIZE):
    """Writes the parts as a fresh, minimal .glb. The part called 'petal' is made grey so it can be tinted."""
    # One mesh, one primitive and one material per part.
    chunks, views, accessors, materials, images, textures, prims = [], [], [], [], [], [], []
    stored = {}  # (source image, greyed) -> output texture index and whether it has see-through parts

    def add_view(data, target=None):
        offset = sum(len(c) for c in chunks)
        chunks.append(data + b'\0' * (-len(data) % 4))
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data), **({'target': target} if target else {})})
        return len(views) - 1

    def add_accessor(array, kind, target):
        a = {'bufferView': add_view(array.tobytes(), target), 'componentType': 5125 if array.dtype == np.uint32 else 5126,
             'count': int(array.size if kind == 'SCALAR' else len(array)), 'type': kind}
        if kind == 'VEC3':
            a['min'], a['max'] = array.min(0).tolist(), array.max(0).tolist()
        accessors.append(a)
        return len(accessors) - 1

    for name, p in parts.items():
        factor, image, alpha_mode, cutoff = source_material(g, p['material'])
        material = {'name': name, 'doubleSided': True,
                    'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.9, 'baseColorFactor': [*factor[:3], 1]}}
        if name == 'petal':
            material['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, 1]
        if image is not None:
            key = (image, name == 'petal', alpha_mode != 'OPAQUE')
            if key not in stored:
                img = Image.open(io.BytesIO(image_bytes(g, blob, image)))
                if 'transparency' in img.info:
                    img = img.convert('RGBA')  # a palette image keeps its see-through colour here, not in an alpha band
                img.thumbnail((texture_size, texture_size))
                # A blended material is written as cut-out: it needs no sorting, and petals are rarely half see-through.
                masked = alpha_mode != 'OPAQUE' and 'A' in img.getbands()
                if name == 'petal':
                    img = grey_for_tinting(img, p['uv'])
                out = io.BytesIO()
                # ponytail: base colour only; the normal and roughness maps are dropped. Carry them over if heads look flat.
                img.save(out, 'PNG', optimize=True) if masked else img.convert('RGB').save(out, 'JPEG', quality=88)
                images.append({'bufferView': add_view(out.getvalue()), 'mimeType': 'image/png' if masked else 'image/jpeg'})
                textures.append({'source': len(images) - 1})
                stored[key] = (len(textures) - 1, masked)
            texture, masked = stored[key]
            material['pbrMetallicRoughness']['baseColorTexture'] = {'index': texture}
            if masked:
                material.update(alphaMode='MASK', alphaCutoff=cutoff if alpha_mode == 'MASK' else 0.5)
        materials.append(material)
        prims.append({'material': len(materials) - 1, 'indices': add_accessor(p['tri'].astype(np.uint32).reshape(-1), 'SCALAR', 34963),
                      'attributes': {'POSITION': add_accessor(p['pos'].astype(np.float32), 'VEC3', 34962),
                                     'NORMAL': add_accessor(p['nrm'].astype(np.float32), 'VEC3', 34962),
                                     'TEXCOORD_0': add_accessor(p['uv'].astype(np.float32), 'VEC2', 34962)}})

    binary = b''.join(chunks)
    doc = {'asset': {'version': '2.0', 'generator': 'bouquet-designer prepare_models.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
           'nodes': [{'name': label, 'mesh': 0}], 'meshes': [{'name': label, 'primitives': prims}],
           'materials': materials, 'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(binary)}]}
    if images:
        doc.update(images=images, textures=textures, samplers=[{}])
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(text) + len(binary)) + struct.pack('<I4s', len(text), b'JSON') + text
                       + struct.pack('<I4s', len(binary), b'BIN\0') + binary)



def build(flower_id, cfg):
    g, blob = load(SRC / cfg['file'])
    parts = {}  # output part -> dict(material index, lists of pos/nrm/uv/tri)
    for node, mat_index, pos, nrm, uv, tri in primitives(g, blob):
        mat = g['materials'][mat_index]['name']
        labels = islands(pos, tri)
        for label in np.unique(labels):
            t = tri[labels == label]
            v = pos[np.unique(t)]
            part = cfg['pick'](node, mat, v.min(0), v.max(0), len(t))
            if part is None:
                continue
            if part != 'petal' and cfg['stub_y'] is not None:
                t = t[pos[t][:, :, 1].mean(1) > cfg['stub_y']]
            used, remap = np.unique(t, return_inverse=True)
            p = parts.setdefault(part, dict(material=mat_index, pos=[], nrm=[], uv=[], tri=[], count=0))
            p['tri'].append(remap.reshape(-1, 3) + p['count'])
            p['pos'].append(pos[used]); p['nrm'].append(nrm[used]); p['uv'].append(uv[used])
            p['count'] += len(used)
    for p in parts.values():
        for k in ('pos', 'nrm', 'uv', 'tri'):
            p[k] = np.concatenate(p[k])

    # Fit: the head (everything but the stem stub) faces +Y, is centred on the origin and is `diameter` wide.
    head = np.concatenate([p['pos'] for name, p in parts.items() if name != 'stem'])
    face = np.array([0.0, 1.0, 0.0])
    if cfg['face'] is not None:
        # A flat head is thinnest along the direction it faces.
        _, _, axes = np.linalg.svd(head - head.mean(0), full_matrices=False)
        face = axes[2] * np.sign(axes[2] @ np.array(cfg['face'], float))
    rot = rotation_onto_y(face)
    turned = head @ rot.T
    centre = (turned.min(0) + turned.max(0)) / 2
    scale = cfg['diameter'] / np.ptp(turned[:, [0, 2]], axis=0).mean()
    for p in parts.values():
        p['pos'] = (p['pos'] @ rot.T - centre) * scale
        n = p['nrm'] @ rot.T
        p['nrm'] = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)

    target = OUT / f'{flower_id}.glb'
    write_glb(target, flower_id, g, blob, parts)

    everything = np.concatenate([p['pos'] for p in parts.values()])
    triangles = sum(len(p['tri']) for p in parts.values())
    print(f'{flower_id:10s} {triangles:6d} triangles  {target.stat().st_size // 1024:5d} KB  parts: {", ".join(parts)}  '
          f'size (m): {np.round(np.ptp(everything, axis=0), 3).tolist()}  lowest point: {everything[:, 1].min():.3f}')
    assert 'petal' in parts or flower_id == 'sunflower', 'no tintable part found'
    assert abs(np.ptp((head @ rot.T - centre) * scale, axis=0)[[0, 2]].mean() - cfg['diameter']) < 1e-6


# ---- Everything in flowers_sources/sketchfab/manifest.json, prepared without per-model settings ----

AUTO_TEXTURE_SIZE = 512
MAX_TRIANGLES = 12000
# Head width in metres by flower type. A model of several flowers (bunch, vase, branch) is treated as one wide head.
DIAMETERS = {
    'rose': 0.07, 'tulip': 0.05, 'lily': 0.12, 'daisy': 0.08, 'carnation': 0.06, 'sunflower': 0.14, 'peony': 0.10,
    'orchid': 0.08, 'lotus': 0.12, 'daffodil': 0.07, 'hydrangea': 0.14, 'hibiscus': 0.11, 'poppy': 0.08, 'zinnia': 0.07,
    'cherry blossom': 0.04, 'magnolia': 0.10, 'amaryllis': 0.12, 'anthurium': 0.10, 'camellia': 0.08, 'chrysanthemum': 0.09,
    'gerbera': 0.09, 'iris': 0.09, 'plumeria': 0.06, 'calla lily': 0.07, 'lily of the valley': 0.05, 'snowdrop': 0.04,
}
DEFAULT_DIAMETER = 0.07
GROUP_FORMS = ('bunch', 'in vase', 'branch')
# Per-model corrections, by the first 8 characters of the Sketchfab id. Any of:
#   cut: 'all' keeps the whole model; a number keeps that fraction of the model's height, measured from the top.
#   face: direction the flower faces in the source, when it is not up.
#   diameter: head width in metres.   skip: True leaves the model out.
AUTO_OVERRIDES = {
    # Not one flower: a row of separate flowers or pots, a patch of ground, or a model lying on its side.
    **{i: dict(skip=True) for i in ('c12e916b', 'bd7f9c9c', '737212df', 'c914e2eb', '5c5f55c1', 'dfda1a76', 'b02aeabe', 'f8f29d92', '0b1a7d78', '251a3268', 'a9ee071f')},
    # The flower looks forward, not up.
    '16f836d2': dict(face=(0, 0, 1)), 'a9439cdd': dict(face=(0, 0, 1)),
    '13c8a69f': dict(face=(0, 0, 1)), '1980572e': dict(face=(0, 0, 1)), '569a71cc': dict(face=(0, 0, 1)), '966d0bee': dict(face=(0, 0, 1)),
    # Downloaded later: broken, grey or blob-like previews, a duplicate, or not a flower once cut.
    **{i: dict(skip=True) for i in ('86ea2854', '00350ed1', 'a1390865', 'fe4a503f', '6e47f3a5', '0fba1760', '734a979f', 'b5277921', '822764a5', '44e2546c', '5b567a32', 'b112b871')},
    # Faces sideways relative to the stem.
    '1df48628': dict(face=(0, 0, 1)), '56d60886': dict(face=(0, 0, 1)),
    # Wrapping paper, a pot or a vase under the flowers, with no narrow stem between for the cut to find.
    '78ec3368': dict(cut=0.45), '06242e4f': dict(cut=0.45), '782946d2': dict(cut=0.45), '9934b087': dict(cut=0.45),
    '147016ed': dict(cut=0.45), '978b674a': dict(cut=0.5),
    # A long leafy stem that is as wide as the head.
    '7393842c': dict(cut=0.22), '17fe1a8c': dict(cut=0.3), '846e922a': dict(cut=0.2), 'b58f68ed': dict(cut=0.3),
    '114711bf': dict(cut=0.5), 'b4a95a86': dict(cut=0.35), 'dbd44831': dict(cut=0.45),
}


def surface_points(prims, count=200000):
    """Points spread evenly over the surface. A low-poly model has too few vertices to measure its shape by."""
    rng = np.random.default_rng(0)
    areas = [np.linalg.norm(np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]]), axis=1) for _, _, pos, _, _, tri in prims]
    total = sum(a.sum() for a in areas) or 1
    out = []
    for (_, _, pos, _, _, tri), area in zip(prims, areas):
        n = int(count * area.sum() / total)
        if n == 0 or area.sum() == 0:
            continue
        t = tri[rng.choice(len(tri), n, p=area / area.sum())]
        a, b = rng.random(n), rng.random(n)
        flip = a + b > 1
        a[flip], b[flip] = 1 - a[flip], 1 - b[flip]
        out.append(pos[t[:, 0]] * (1 - a - b)[:, None] + pos[t[:, 1]] * a[:, None] + pos[t[:, 2]] * b[:, None])
    return np.concatenate(out) if out else np.concatenate([pos for _, _, pos, _, _, _ in prims])


def head_cut(pos, form):
    """Height below which the model is stem, leaves, pot or vase. -inf keeps the whole model."""
    lo, hi = pos[:, 1].min(), pos[:, 1].max()
    bins = 64
    which = np.clip(((hi - pos[:, 1]) / max(hi - lo, 1e-9) * bins).astype(int), 0, bins - 1)
    width = np.zeros(bins + 3)  # slice by slice from the top; the extra slices are the empty space under the model
    for b in np.unique(which):
        v = pos[which == b]
        if len(v) >= 3:
            width[b] = np.ptp(v[:, [0, 2]], axis=0).mean()
    widest = 0
    for b in range(bins):
        widest = max(widest, width[b])
        # A stem is where the model stays much narrower than the head above it.
        if b >= 2 and max(width[b:b + 3]) < 0.3 * widest:
            return hi - (hi - lo) * b / bins
    if form not in GROUP_FORMS:
        return -np.inf
    # No neck (a bunch, or flowers in a vase): keep a slab under the top about as deep as the flowers are wide.
    top = pos[pos[:, 1] > hi - 0.4 * (hi - lo)]
    return hi - 0.75 * np.ptp(top[:, [0, 2]], axis=0).mean()


def _mean(ids, values, size):
    """Average of the rows of `values` that share an id."""
    total = np.stack([np.bincount(ids, values[:, k], size) for k in range(values.shape[1])], 1)
    return total / np.maximum(np.bincount(ids, minlength=size), 1)[:, None]


def decimate(parts, max_triangles):
    """Merges vertices that fall in the same small cube, with bigger cubes until the model is under the limit."""
    # ponytail: vertex clustering, which blurs fine petal edges; use a real simplifier (meshoptimizer) if heads look lumpy.
    if sum(len(p['tri']) for p in parts.values()) <= max_triangles:
        return parts
    everything = np.concatenate([p['pos'] for p in parts.values()])
    extent = np.ptp(everything, axis=0).max()
    for divisions in (160, 128, 96, 80, 64, 48, 40, 32, 24, 16):
        out = {}
        for name, p in parts.items():
            cell = np.floor((p['pos'] - everything.min(0)) / (extent / divisions)).astype(np.int64)
            cell_id = np.unique(cell, axis=0, return_inverse=True)[1].reshape(-1)
            # Vertices in one cube but far apart on the texture (either side of a seam) stay separate vertices...
            vid = np.unique(np.column_stack([cell_id, np.floor(p['uv'] * 8).astype(np.int64)]), axis=0, return_inverse=True)[1].reshape(-1)
            n = vid.max() + 1
            # ...but they all move to the same point, so the seam stays closed.
            pos = np.zeros((n, 3))
            pos[vid] = _mean(cell_id, p['pos'], cell_id.max() + 1)[cell_id]
            tri = vid[p['tri']]
            tri = tri[(tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])]
            # The two sides of a thin petal can land on the same three points; materials are double-sided, so keep one.
            first = np.unique(np.sort(tri, axis=1), axis=0, return_index=True)[1]
            out[name] = dict(material=p['material'], pos=pos, nrm=_mean(vid, p['nrm'], n), uv=_mean(vid, p['uv'], n), tri=tri[np.sort(first)])
        if sum(len(p['tri']) for p in out.values()) <= max_triangles:
            break
    return {name: p for name, p in out.items() if len(p['tri'])}


def build_auto(entry):
    """One manifest entry -> public/models/sf/<id>.glb. Returns its catalogue row, or None if it was left out."""
    short = entry['uid'][:8]
    cfg = AUTO_OVERRIDES.get(short, {})
    if cfg.get('skip'):
        return None
    g, blob = load(SRC / 'sketchfab' / entry['file'])
    prims = primitives(g, blob)
    if not prims:
        print(f'{short}  no triangles, left out: {entry["title"]}')
        return None
    everything = np.concatenate([pos for _, _, pos, _, _, _ in prims])
    lo, hi = everything[:, 1].min(), everything[:, 1].max()
    cut = cfg.get('cut')
    cut_y = -np.inf if cut == 'all' else hi - (hi - lo) * cut if cut is not None else head_cut(surface_points(prims), entry['form'])

    parts = {}  # one part per source material
    for _, mat_index, pos, nrm, uv, tri in prims:
        tri = tri[pos[tri][:, :, 1].mean(1) > cut_y]
        if not len(tri):
            continue
        used, remap = np.unique(tri, return_inverse=True)
        p = parts.setdefault(f'm{mat_index}', dict(material=mat_index, pos=[], nrm=[], uv=[], tri=[], count=0))
        p['tri'].append(remap.reshape(-1, 3) + p['count'])
        p['pos'].append(pos[used]); p['nrm'].append(nrm[used]); p['uv'].append(uv[used])
        p['count'] += len(used)
    for p in parts.values():
        for k in ('pos', 'nrm', 'uv', 'tri'):
            p[k] = np.concatenate(p[k])
    source_triangles = sum(len(p['tri']) for p in parts.values())
    parts = decimate(parts, MAX_TRIANGLES)

    diameter = cfg.get('diameter') or DIAMETERS.get(entry['flower'], DEFAULT_DIAMETER)
    if entry['form'] in GROUP_FORMS and 'diameter' not in cfg:
        diameter = min(max(diameter * 1.8, 0.12), 0.16)
    rot = rotation_onto_y(np.array(cfg['face'], float) / np.linalg.norm(cfg['face'])) if 'face' in cfg else np.eye(3)
    head = np.concatenate([p['pos'] for p in parts.values()]) @ rot.T
    centre = (head.min(0) + head.max(0)) / 2
    # Width from the 1st to the 99th percentile, so one stray leaf or stamen does not shrink the flower.
    width = np.mean(np.percentile(head[:, [0, 2]], 99, axis=0) - np.percentile(head[:, [0, 2]], 1, axis=0))
    scale = diameter / max(width, 1e-9)
    for p in parts.values():
        p['pos'] = (p['pos'] @ rot.T - centre) * scale
        n = p['nrm'] @ rot.T
        p['nrm'] = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)

    target = OUT / 'sf' / f'{short}.glb'
    write_glb(target, short, g, blob, parts, AUTO_TEXTURE_SIZE)
    triangles = sum(len(p['tri']) for p in parts.values())
    kept = 'all' if not np.isfinite(cut_y) else f'top {100 * (hi - cut_y) / max(hi - lo, 1e-9):3.0f}%'
    print(f'{short}  {entry["form"]:11s} kept {kept:8s} {source_triangles:6d} -> {triangles:5d} triangles  {target.stat().st_size // 1024:5d} KB  '
          f'height {np.ptp(head[:, 1]) * scale:.3f} m  {entry["flower"]}: {entry["title"]}'.encode('ascii', 'replace').decode(), flush=True)
    return {'id': f'sf-{short}', 'name': entry['flower'].capitalize(), 'title': entry['title'], 'model': f'sf/{short}.glb',
            'colour': entry['colour'].split('/')[0], 'headDiameter': round(diameter, 3), 'stemLength': 0.45,
            'author': entry['author'], 'licence': entry['licence'], 'url': entry['url']}


def write_catalogue(rows):
    rows = sorted(rows, key=lambda r: (r['name'], r['title'], r['id']))
    lines = ',\n'.join('  ' + json.dumps(r, ensure_ascii=False) for r in rows)
    (ROOT / 'src' / 'catalog.generated.ts').write_text(
        '// Written by tools/prepare_models.py from flowers_sources/sketchfab/manifest.json. Do not edit by hand.\n'
        "import type { GeneratedFlower } from './catalog';\n\n"
        f'export const GENERATED_FLOWERS: GeneratedFlower[] = [\n{lines},\n];\n', encoding='utf-8')

    licences = {'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/', 'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/'}
    # Titles, authors and links come from Sketchfab, so all are escaped and the link must be a Sketchfab model page.
    for r in rows:
        assert SKETCHFAB_URL.fullmatch(r['url']), f'{r["id"]}: not a Sketchfab model link: {r["url"]!r}'
    esc = lambda t: html_escape(t, quote=True)
    items = '\n'.join(
        f'      <li>{esc(r["name"])}: “{esc(r["title"])}” by {esc(r["author"])}, <a href="{licences[r["licence"]]}">{esc(r["licence"])}</a>, '
        f'modified, <a href="{esc(r["url"])}">source</a></li>' for r in rows)
    page = ROOT / 'public' / 'credits.html'
    html = page.read_text(encoding='utf-8')
    start, end = '<!-- generated models: start -->', '<!-- generated models: end -->'
    assert start in html and end in html, 'credits.html has lost its generated-models markers'
    page.write_text(html[:html.index(start) + len(start)] + '\n' + items + '\n      ' + html[html.index(end):], encoding='utf-8')


def build_all_auto(only=()):
    manifest = json.loads((SRC / 'sketchfab' / 'manifest.json').read_text(encoding='utf-8'))
    rows = []
    for entry in manifest:
        if only and entry['uid'][:8] not in only:
            continue
        try:
            row = build_auto(entry)
        except Exception as error:  # one odd file must not stop the other 140
            print(f'{entry["uid"][:8]}  FAILED ({type(error).__name__}: {error}): {entry["title"]}'.encode('ascii', 'replace').decode(), flush=True)
            row = None
        if row:
            rows.append(row)
    if not only:
        write_catalogue(rows)
        # Files from an earlier run for models that are now left out.
        wanted = {row['model'] for row in rows}
        for stale in (OUT / 'sf').glob('*.glb'):
            if f'sf/{stale.name}' not in wanted:
                stale.unlink()
    print(f'{len(rows)} of {len(manifest)} models prepared.')


if __name__ == '__main__':
    # No arguments: everything. "auto": only the manifest models. "auto <id> <id>": just those, to check a correction.
    args = sys.argv[1:]
    if not args:
        for flower_id, cfg in FLOWERS.items():
            build(flower_id, cfg)
    build_all_auto(only=tuple(a[:8] for a in args[1:]))
