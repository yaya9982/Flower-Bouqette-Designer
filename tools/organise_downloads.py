"""Moves flower models downloaded from Sketchfab into flowers_sources/sketchfab/<colour>/.

    python tools/organise_downloads.py [downloads folder] [--since "2026-10-13 19:30"] [--dry-run]

Matches each .glb/.zip in the downloads folder to an entry of docs/flower-models-by-colour.json by its title
(Sketchfab names the file after the title). Entries that share a title are matched, in list order (entries found
by two or three researchers first), to files in download order. Writes flowers_sources/sketchfab/manifest.json, which is what prepare_models.py reads.
Safe to run again after more downloads: entries already in the manifest are left alone.
"""
import io, json, re, shutil, sys, unicodedata, zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'flowers_sources' / 'sketchfab'
MANIFEST = DEST / 'manifest.json'


def key(text):
    """Letters and digits only, so 'Bouquet / Rose red' and 'bouquet__rose_red' compare equal."""
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]', '', text.lower())


def slug(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', text).strip('_')[:40] or 'model'


MAX_UNZIPPED = 500 * 1024 * 1024  # bytes taken out of one download, all members and nested zips together
MAX_DEPTH = 2                      # a zip, and a zip inside it


def read_member(z, info, budget):
    """Reads one member in chunks and stops at the budget: the size written in the zip header can lie."""
    out = bytearray()
    with z.open(info) as f:
        while chunk := f.read(1 << 20):
            out += chunk
            if len(out) > budget[0]:
                raise ValueError('zip unpacks to more than the size limit')
    budget[0] -= len(out)
    return bytes(out)


def glbs_in_zip(data, depth=1, budget=None):
    """Every .glb in a zip, looking inside zips within it too (some uploads are a zip in a zip).
    Downloads are untrusted, so this stops at MAX_DEPTH levels and MAX_UNZIPPED bytes, reads only
    stored or deflated members (the other methods have had memory bugs in CPython), and never
    writes a member to disk under its own name."""
    budget = budget or [MAX_UNZIPPED]
    found = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            name = info.filename.lower()
            if not name.endswith(('.glb', '.zip')):
                continue
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValueError(f'{info.filename}: unsupported compression')
            if info.file_size > budget[0]:
                raise ValueError(f'{info.filename}: larger than the size limit')
            if name.endswith('.glb'):
                found.append(read_member(z, info, budget))
            elif depth < MAX_DEPTH:
                found += glbs_in_zip(read_member(z, info, budget), depth + 1, budget)
    return found


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    since = datetime.min
    if '--since' in sys.argv:
        since = datetime.fromisoformat(sys.argv[sys.argv.index('--since') + 1])
        args.remove(sys.argv[sys.argv.index('--since') + 1])
    downloads = Path(args[0]) if args else Path.home() / 'Downloads'

    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else []
    done = {m['uid'] for m in manifest}
    entries = [e for e in json.loads((ROOT / 'docs' / 'flower-models-by-colour.json').read_text(encoding='utf-8'))
               if e.get('uid') and e['uid'] not in done]
    # Several entries can share a title. Downloads are made in this order (the entries found by two or three
    # researchers first, then the rest, each in list order), so matching in it pairs a file with the right entry.
    entries.sort(key=lambda e: 0 if e.get('foundBy') in (2, 3) else 1)
    files = sorted((f for f in downloads.iterdir() if f.suffix.lower() in ('.glb', '.zip')
                    and datetime.fromtimestamp(f.stat().st_mtime) >= since), key=lambda f: f.stat().st_mtime)

    unmatched = []
    for f in files:
        name = re.sub(r' \(\d+\)$', '', f.stem)  # Chrome adds ' (1)' to a repeated file name
        entry = next((e for e in entries if key(e['title']) == key(name)), None)
        if entry is None:
            unmatched.append(f.name)
            continue
        entries.remove(entry)
        folder = DEST / entry['colour'].replace('/', '-')
        target = folder / f"{slug(entry['flower'])}--{slug(entry['title'])}--{entry['uid'][:8]}.glb"
        print(f'{f.name}  ->  {target.relative_to(ROOT)}')
        if dry:
            continue
        folder.mkdir(parents=True, exist_ok=True)
        if f.suffix.lower() == '.zip':
            # Sketchfab zips the uploader's original file. Only the model is taken out; the zip stays where it is.
            try:
                inner = glbs_in_zip(f.read_bytes())
            except (ValueError, zipfile.BadZipFile) as e:
                unmatched.append(f'{f.name} ({e})')
                continue
            if len(inner) != 1:
                unmatched.append(f'{f.name} (expected one .glb inside, found {len(inner)})')
                continue
            target.write_bytes(inner[0])
        else:
            shutil.move(str(f), target)
        manifest.append({k: entry[k] for k in ('uid', 'colour', 'flower', 'title', 'author', 'licence', 'url', 'form', 'style')}
                        | {'file': target.relative_to(DEST).as_posix()})
    if not dry:
        MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding='utf-8')
    print(f'\n{len(files) - len(unmatched)} matched, {len(manifest)} in the manifest.')
    if unmatched:
        print('Not matched to a list entry (left in place):\n  ' + '\n  '.join(unmatched))


if __name__ == '__main__':
    main()
