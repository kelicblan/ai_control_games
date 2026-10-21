"""Verify an already trained bundle before publishing it to a caller-selected folder."""
import hashlib, json, pathlib, shutil, sys
source=pathlib.Path(sys.argv[1]);target=pathlib.Path(sys.argv[2]);manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
assert manifest['kind']=='trained' and hashlib.sha256((source/'weights.bin').read_bytes()).hexdigest()==manifest['sha256']
assert hashlib.sha256((source/'training-report.json').read_bytes()).hexdigest()==manifest['training']['reportHash']
assert len((source/'weights.bin').read_bytes())==sum(a*b+b for a,b in zip(manifest['layers'][:-1],manifest['layers'][1:]))*4
target.mkdir(parents=True,exist_ok=False)
for name in ['manifest.json','weights.bin','training-report.json']:shutil.copy2(source/name,target/name)
print(json.dumps({'output':str(target),'sha256':manifest['sha256']}))
