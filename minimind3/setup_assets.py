"""Restore the exact tested Windows CPU runtime and model; no pip dependencies."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.request
import zipfile

BASE = Path(__file__).resolve().parent
MANIFEST = json.loads((BASE / 'assets-manifest.json').read_text(encoding='utf-8'))


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verified(relative):
    path = BASE / relative
    return path.is_file() and digest(path) == MANIFEST['files'][relative]


def download(url, target, expected):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.part')
    print('Downloading:', url, flush=True)
    with urllib.request.urlopen(url, timeout=60) as response, temporary.open('wb') as stream:
        while chunk := response.read(1024 * 1024):
            stream.write(chunk)
    if digest(temporary) != expected:
        temporary.unlink()
        raise ValueError('SHA-256 mismatch: ' + target.name)
    os.replace(temporary, target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only', action='store_true', help='Verify existing files without downloading')
    args = parser.parse_args()
    missing = [relative for relative in MANIFEST['files'] if not verified(relative)]
    if args.check_only:
        for relative in missing:
            print('Missing or mismatched:', relative)
        print(f"Verified {len(MANIFEST['files']) - len(missing)}/{len(MANIFEST['files'])} pinned files")
        return 1 if missing else 0
    if sys.platform != 'win32':
        raise SystemExit('The tested ctypes runtime is Windows x64; the browser game and portable tests work on other platforms.')
    model = 'model/minimind-3.q8.gguf'
    if model in missing:
        download(MANIFEST['modelUrl'], BASE / model, MANIFEST['files'][model])
    libraries = [relative for relative in missing if relative != model]
    if libraries:
        archive = BASE / 'ollama/runtime.zip'
        archive_hash = MANIFEST['runtimeDigest'].removeprefix('sha256:')
        if not archive.is_file() or digest(archive) != archive_hash:
            download(MANIFEST['runtimeUrl'], archive, archive_hash)
        with zipfile.ZipFile(archive) as bundle:
            members = {entry.filename.replace('\\', '/'): entry for entry in bundle.infolist()}
            for relative in libraries:
                suffix = relative.removeprefix('ollama/')
                matches = [entry for name, entry in members.items() if name == suffix or name.endswith('/' + suffix)]
                if len(matches) != 1:
                    raise ValueError('Runtime archive missing pinned library: ' + suffix)
                target = BASE / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_name(target.name + '.part')
                temporary.write_bytes(bundle.read(matches[0]))
                if digest(temporary) != MANIFEST['files'][relative]:
                    temporary.unlink()
                    raise ValueError('DLL ABI mismatch: ' + suffix)
                os.replace(temporary, target)
            # Preserve upstream notices beside the native runtime.
            for name, entry in members.items():
                if name.startswith('lib/ollama/') and '/' not in name[len('lib/ollama/'):]:
                    filename = Path(name).name
                    if 'LICENSE' in filename or filename.endswith(('COPYING', 'NOTICE')):
                        (BASE / 'ollama/lib/ollama' / filename).write_bytes(bundle.read(entry))
        archive.unlink()
    if not all(verified(relative) for relative in MANIFEST['files']):
        raise ValueError('Asset verification incomplete')
    print('MiniMind model and CPU DLL hashes verified. Ready to run.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
