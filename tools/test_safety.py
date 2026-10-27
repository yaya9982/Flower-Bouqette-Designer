"""Checks the tools refuse hostile downloads. Run: python tools/test_safety.py"""
import io, struct, tempfile, zipfile
from pathlib import Path

import organise_downloads as od
import prepare_models as pm


def zip_of(files, method=zipfile.ZIP_DEFLATED):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', method) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def raises(fn, *args):
    try:
        fn(*args)
    except ValueError:
        return True
    return False


# Zips: a normal one works, nesting stops at two levels, and a bomb stops at the byte budget.
assert od.glbs_in_zip(zip_of({'a.glb': b'x', 'b.txt': b'y'})) == [b'x']
assert od.glbs_in_zip(zip_of({'inner.zip': zip_of({'a.glb': b'x'})})) == [b'x']
assert od.glbs_in_zip(zip_of({'1.zip': zip_of({'2.zip': zip_of({'a.glb': b'x'})})})) == []
od.MAX_UNZIPPED = 1000
assert raises(od.glbs_in_zip, zip_of({'bomb.glb': b'\0' * 100_000}))
assert raises(od.glbs_in_zip, zip_of({'a.glb': b'x'}, zipfile.ZIP_LZMA))
# The streaming guard on its own (the header-size check above would catch the bomb first, so this is the one
# that matters when a header lies): read_member stops at the budget however big the member really is.
with zipfile.ZipFile(io.BytesIO(zip_of({'bomb.glb': b'\0' * 100_000}))) as z:
    assert raises(lambda: od.read_member(z, z.infolist()[0], [1000]))

# GLBs: wrong magic, wrong length and an oversized JSON chunk are all refused.
with tempfile.TemporaryDirectory() as d:
    path = Path(d) / 'm.glb'
    body = b'{}  '
    good = b'glTF' + struct.pack('<II', 2, 20 + len(body)) + struct.pack('<II', len(body), 0x4E4F534A) + body
    path.write_bytes(good)
    assert pm.load(path)[0] == {}
    for bad in (b'GLTF' + good[4:], good[:-1], good[:12] + struct.pack('<I', 9999) + good[16:]):
        path.write_bytes(bad)
        assert raises(pm.load, path), bad

# Credits: only Sketchfab model pages are accepted as links.
assert pm.SKETCHFAB_URL.fullmatch('https://sketchfab.com/3d-models/' + 'a' * 32)
assert not pm.SKETCHFAB_URL.fullmatch('javascript:alert(1)//https://sketchfab.com/3d-models/' + 'a' * 32)
assert not pm.SKETCHFAB_URL.fullmatch('https://sketchfab.com/3d-models/' + 'a' * 32 + '" onclick="x')
print('ok')
