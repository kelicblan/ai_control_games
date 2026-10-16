"""Download pinned upstream assets; all output stays under gamesoul/."""
import concurrent.futures
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TAG = 'b11577'
ADAPTER_REV = '9c269339a799d73bab3c7689f58ced8d457de866'
BASE_REV = 'bc640142c66e1fdd12af0bd68f40445458f3869b'
CONFIG_REV = '1cfa9a7208912126459214e8b04321603b3df60c'

def metadata(url):
    with urllib.request.urlopen(url) as response:
        return json.load(response)

def download(url, path, sha=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or (sha and hashlib.file_digest(path.open('rb'), 'sha256').hexdigest() != sha):
        partial = path.with_suffix(path.suffix + '.part')
        subprocess.run(['curl.exe', '-L', '--fail', '--retry', '5', '-C', '-', '-o', str(partial), url], check=True)
        if sha and hashlib.file_digest(partial.open('rb'), 'sha256').hexdigest() != sha:
            raise RuntimeError(f'Hash mismatch: {partial}')
        partial.replace(path)
    digest = hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()
    print(f'Verified {path.name}: {digest}', flush=True)
    return {'path': str(path.relative_to(ROOT)), 'url': url, 'sha256': digest, 'bytes': path.stat().st_size}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--include-gamesoul', action='store_true')
    options = parser.parse_args()
    config = json.loads((ROOT / 'model-config.json').read_text(encoding='utf-8'))
    jobs = []
    for repo, rev, folder, selected in [
        ('NewOrigin/GameSoul-AI-NPC-4B-v0.1', ADAPTER_REV, 'adapter', None),
        (config['repository'], config['revision'], Path(config['model']).parent.name, {Path(config['model']).name, 'LICENSE', 'README.md'}),
        ('Qwen/Qwen3-4B-GGUF', BASE_REV, 'base', {'Qwen3-4B-Q4_K_M.gguf', 'LICENSE', 'README.md'}),
    ]:
        if folder in ('adapter', 'base') and not options.include_gamesoul:
            continue
        info = metadata(f'https://huggingface.co/api/models/{repo}/revision/{rev}?blobs=true')
        for item in info['siblings']:
            name = item['rfilename']
            if name.startswith('.') or name.startswith('DocsAsset/') or (selected and name not in selected):
                continue
            jobs.append((f'https://huggingface.co/{repo}/resolve/{rev}/{name}', ROOT / 'models' / folder / name, (item.get('lfs') or {}).get('sha256')))
    release = metadata(f'https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/{TAG}')
    jobs.append(('https://huggingface.co/Qwen/Qwen3.5-2B/resolve/15852e8c16360a2fea060d615a32b45270f8a8fc/LICENSE', ROOT / Path(config['model']).parent / 'LICENSE', None))
    asset = next(x for x in release['assets'] if x['name'] == f'llama-{TAG}-bin-win-cpu-x64.zip')
    jobs.append((asset['browser_download_url'], ROOT / 'cache' / asset['name'], (asset.get('digest') or '').removeprefix('sha256:') or None))
    jobs.append((f'https://codeload.github.com/ggml-org/llama.cpp/zip/refs/tags/{TAG}', ROOT / 'cache' / f'llama-source-{TAG}.zip', None))
    if options.include_gamesoul:
        jobs.append((f'https://huggingface.co/Qwen/Qwen3-4B/resolve/{CONFIG_REV}/config.json', ROOT / 'models' / 'base-config' / 'config.json', None))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda args: download(*args), jobs))
    with zipfile.ZipFile(ROOT / 'cache' / asset['name']) as archive:
        archive.extractall(ROOT / 'runtime')
    with zipfile.ZipFile(ROOT / 'cache' / f'llama-source-{TAG}.zip') as archive:
        archive.extractall(ROOT / 'vendor')
    (ROOT / f"assets-{Path(config['model']).parent.name}.json").write_text(json.dumps({'llama_tag': TAG, 'model': config, 'assets': results}, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
