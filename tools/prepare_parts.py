"""Prepares the non-flower models (bows, stem, greenery) from flowers_sources/sketchfab/parts/ into public/models/parts/.

    python tools/prepare_parts.py

Each source is untrusted and read with prepare_models.load (size and header checks). Output conventions, which
src/wrap.ts, src/flowers.ts and src/greenery.ts rely on:
- bows: 1 unit wide, the knot (or the star's base) at the origin, facing -Z (the front), part 'petal' for the ribbon tint.
- stem and sprigs: start at the origin and run 1 unit up +Y.
Credits for every part are in public/credits.html (the "other models" list) and must match PARTS below.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_models as pm  # noqa: E402

SRC = pm.SRC / 'sketchfab' / 'parts'
OUT = pm.OUT / 'parts'
TEXTURE_SIZE = 512

# pick: 'all' pieces, or the 'largest' single piece (one frond or leaf out of a clump).
# base: which end of a sprig is its stalk: 'low' (lowest in the source) or 'centre' (nearest the source's middle,
# where a clump's fronds meet). colour: replaces a source colour that is unusable (black, untextured).
PARTS = {
    'bow-ribbon': dict(file='decorative_bow.glb', kind='bow', max_triangles=6000),
    # Object_2 is a flat disc under the star.
    'bow-star': dict(file='present_bow.glb', kind='star', skip_nodes=('Object_2',), max_triangles=8000),
    'stem': dict(file='modular_flower_stem.glb', kind='sprig', base='low', max_triangles=1500),
    'fern-low-poly': dict(file='low_poly_fern.glb', kind='sprig', pick='largest', base='centre'),
    'fern-polypody': dict(file='realistic_hd_common_polypody_fern_4355.glb', kind='sprig', pick='largest', base='centre'),
    'fern-pack': dict(file='fern_pack.glb', kind='sprig', pick='largest', base='centre', colour=[0.035, 0.11, 0.025, 1]),  # linear, about #355e2b
    'fern-leaf': dict(file='fern_leaf_lonefennec.glb', kind='sprig', base='centre'),
    'eucalyptus-leaf': dict(file='eucalyptus_l.glb', kind='sprig', base='low', max_triangles=1500),
    'leaves': dict(file='leaves.glb', kind='sprig', pick='largest', base='centre', max_triangles=1500),
    'twig': dict(file='daun.glb', kind='sprig', base='low'),
    'trailing-leaves': dict(file='branches_with_leaves.glb', kind='sprig', base='centre'),
    # The stem and leaves of the rose; its head (material Petals) is left out.
    'rose-leaves': dict(file='smcafee_red_rose.glb', kind='sprig', base='low', materials=('Leaves',)),
}


def gather(g, blob, cfg):
    """The chosen pieces as one part: dict(material, pos, nrm, uv, tri), in the source's units."""
    pieces = []
    for node, mat, pos, nrm, uv, tri in pm.primitives(g, blob):
        if node in cfg.get('skip_nodes', ()):
            continue
        if 'materials' in cfg and g['materials'][mat]['name'] not in cfg['materials']:
            continue
        labels = pm.islands(pos, tri)
        for label in np.unique(labels):
            t = tri[labels == label]
            used, remap = np.unique(t, return_inverse=True)
            pieces.append(dict(material=mat, pos=pos[used], nrm=nrm[used], uv=uv[used], tri=remap.reshape(-1, 3)))
    if not pieces:
        raise ValueError(f"{cfg['file']}: nothing picked")
    centre = np.concatenate([p['pos'] for p in pieces]).mean(0)
    if cfg.get('pick') == 'largest':
        pieces = [max(pieces, key=lambda p: np.ptp(p['pos'], axis=0).max())]
    # One output part needs one material; a piece in another material keeps its shape but takes the first one's look.
    part, count = dict(material=pieces[0]['material'], pos=[], nrm=[], uv=[], tri=[]), 0
    for p in pieces:
        part['tri'].append(p['tri'] + count)
        for k in ('pos', 'nrm', 'uv'):
            part[k].append(p[k])
        count += len(p['pos'])
    return {k: (np.concatenate(v) if isinstance(v, list) else v) for k, v in part.items()}, centre


def turned(part, rot):
    n = part['nrm'] @ rot.T
    return {**part, 'pos': part['pos'] @ rot.T, 'nrm': n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)}


def fit_sprig(part, centre, base):
    """Along its longest direction, stalk end at the origin, 1 unit long up +Y."""
    pos = part['pos']
    _, _, axes = np.linalg.svd(pos - pos.mean(0), full_matrices=False)
    axis = axes[0]
    along = pos @ axis
    lo_end, hi_end = pos[along.argmin()], pos[along.argmax()]
    if base == 'low':
        stalk_is_lo = lo_end[1] <= hi_end[1]
    else:
        stalk_is_lo = np.linalg.norm(lo_end - centre) <= np.linalg.norm(hi_end - centre)
    if not stalk_is_lo:
        axis = -axis
    part = turned(part, pm.rotation_onto_y(axis))
    p = part['pos']
    length = np.ptp(p[:, 1])
    foot = p[p[:, 1] <= p[:, 1].min() + 0.05 * length]
    part['pos'] = (p - [foot[:, 0].mean(), p[:, 1].min(), foot[:, 2].mean()]) / length
    return part


def fit_bow(part, star):
    """1 unit wide, facing -Z. The ribbon bow's knot (its biggest piece is the knot) or the star's base at the origin."""
    if star:
        # The star faces +Y in the source; turn +Y to -Z.
        part = turned(part, np.array([[1.0, 0, 0], [0, 0, 1], [0, -1, 0]]))
        p = part['pos']
        origin = [(p[:, 0].min() + p[:, 0].max()) / 2, (p[:, 1].min() + p[:, 1].max()) / 2, p[:, 2].max()]
    else:
        p = part['pos']
        labels = pm.islands(p, part['tri'])
        biggest = np.bincount(labels).argmax()
        knot = p[np.unique(part['tri'][labels == biggest])]
        origin = (knot.min(0) + knot.max(0)) / 2
    part['pos'] = (part['pos'] - origin) / np.ptp(part['pos'][:, 0])
    return part


def build(name, cfg):
    g, blob = pm.load(SRC / cfg['file'])
    part, centre = gather(g, blob, cfg)
    if 'colour' in cfg:
        g['materials'][part['material']].setdefault('pbrMetallicRoughness', {})['baseColorFactor'] = cfg['colour']
    part = fit_sprig(part, centre, cfg['base']) if cfg['kind'] == 'sprig' else fit_bow(part, cfg['kind'] == 'star')
    label = 'petal' if cfg['kind'] in ('bow', 'star') else 'leaf'
    parts = pm.decimate({label: part}, cfg.get('max_triangles', 3000))
    target = OUT / f'{name}.glb'
    pm.write_glb(target, name, g, blob, parts, TEXTURE_SIZE)
    p = parts[label]['pos']
    print(f'{name:16s} {len(parts[label]["tri"]):6d} triangles {target.stat().st_size // 1024:5d} KB  size {np.round(np.ptp(p, axis=0), 3).tolist()}')
    # The conventions above, which the app relies on.
    if cfg['kind'] == 'sprig':
        assert abs(p[:, 1].min()) < 0.03 and abs(np.ptp(p[:, 1]) - 1) < 0.05, name
    else:
        assert abs(np.ptp(p[:, 0]) - 1) < 0.05, name


if __name__ == '__main__':
    for name, cfg in PARTS.items():
        build(name, cfg)
