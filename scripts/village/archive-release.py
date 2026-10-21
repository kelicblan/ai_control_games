"""Archive the integrated gameplay source and synthetic training evidence, never user saves."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path.cwd().resolve()
assert root.name == 'ai_control_games_unity'
relative_roots = [
    'src', 'packages', 'config/village', 'config/moderation', 'scripts/world',
    'scripts/mlp_v4', 'scripts/village', 'scripts/animals', 'config/animals', 'tests/village', 'public/models/village-v4', 'public/models/animal-v1',
    'data/village/beast-tide-v2', 'data/animals', 'public/models/village-tactical-alpha-v1', 'data/village/release', 'data/village/corrected-v4', 'data/village/life-alpha', 'public/models/village-life-alpha-v1',
    'native/CampMind.Unity/Assets/CampMind/Presentation',
    'native/CampMind.Unity/Assets/CampMind/Editor',
]
files = set()
for folder in relative_roots:
    for file in (root / folder).rglob('*'):
        if file.is_file() and not file.is_symlink() and not {'node_modules', '__pycache__', 'cache', 'logs'} & set(file.parts):
            if file.suffix.lower() not in {'.sqlite', '.db', '.env', '.pyc', '.log', '.dmp'} and not file.name.startswith('.env'):
                files.add(file)
for pattern in ['scripts/unity/*', 'docs/implementation/village/*.md', 'docs/implementation/village/*report.json', 'native/Artifacts/village/P5/*.json', 'native/Artifacts/village/P6/*.json']:
    files.update(file for file in root.glob(pattern) if file.is_file() and file.suffix.lower() not in {'.zip', '.log'})
for relative in ['README.md', 'AGENTS.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'native/CampMind.Unity/Assets/Resources/VillageProp.mat', 'native/CampMind.Unity/Assets/Resources/VillageProp.mat.meta']:
    files.add(root / relative)
build = json.loads((root / 'native/Artifacts/village/P6/build.json').read_text(encoding='utf-8'))
marker = json.loads((root / 'native/Builds/village-current.json').read_text(encoding='utf-8'))
probe = root / marker.get('nativeProbe', build.get('nativeProbe', ''))
if probe == root or not probe.is_dir():
    probe = root / 'native/Artifacts/animals/beast-tide-v2/ui-final'
assert probe.is_dir(), 'Verified native probe required'
files.update(file for file in probe.iterdir() if file.suffix in {'.json', '.png'} and file.name != 'processes.json')
marker = json.loads((root / 'native/Builds/village-current.json').read_text(encoding='utf-8'))
if marker.get('automaticUpgradeProbe'):
    upgrade_probe = root / marker['automaticUpgradeProbe']
    files.update(file for file in (upgrade_probe.iterdir() if upgrade_probe.is_dir() else []) if file.suffix in {'.json', '.png'} and file.name != 'processes.json')
if marker.get('animalProbe'):
    animal_probe = root / marker['animalProbe']
    files.update(file for file in (animal_probe.iterdir() if animal_probe.is_dir() else []) if file.suffix in {'.json', '.png'} and file.name != 'processes.json')
for relative in ['tests/village-roster-reset.test.ts','tests/animal-ecology.test.ts','tests/animal-runtime.test.ts','tests/animal-reset.test.ts','native/Artifacts/animals/mlp-v1/evaluation.json','native/Artifacts/animals/mlp-v1/parity-reference.json']:
    files.add(root / relative)
for name in ['tests.json','blocked-collection.json','blocked-evaluation.json','nine-npc-tick-profile.json','formal-steering.json','deployment-before-steering.json','deployment-steering.json']:
    file = root / 'native/Artifacts/village/P7' / name
    if file.exists():
        files.add(file)
for folder in ['life-trained','life-calibrated','tactical-trained','tactical-calibrated','alpha-trained']:
    file = root / 'native/Artifacts/village/P7' / folder / 'training-report.json'
    if file.exists():
        files.add(file)
out = root / 'native/Artifacts/village/P6/gameplay-source-current.zip'
for name in ['tests.json','animal-runtime-recheck.json','rules-tests.json','work-before-feedback.json','work-continuation.json','formal-work.json','deployment-before-work.json','deployment-work.json','parity.json','deployment-feedback.json']:
    file = root / 'native/Artifacts/village/P8' / name
    if file.exists():
        files.add(file)
for folder in ['life-trained','life-calibrated','tactical-trained','tactical-calibrated','alpha-trained','alpha-corrected']:
    file = root / 'native/Artifacts/village/P8' / folder / 'training-report.json'
    if file.exists():
        files.add(file)
entries = []
files.add(root / 'native/Artifacts/village/P8/animal-runtime-timeout-recheck.json')
for name in ['tests-final.json','parity.json','continuation.json','render-final-summary.json','render-distribution-window.json','remote-initial-before.json','remote-initial-after.json','aling-before.json','deployment-before-motion.json','deployment-motion.json','formal-current.json','trained-dataset.json','collector-source-used.ts']:
    file = root / 'native/Artifacts/village/P9' / name
    if file.exists():
        files.add(file)
for folder in ['life-trained','life-calibrated']:
    files.add(root / 'native/Artifacts/village/P9' / folder / 'training-report.json')
for name in ['before.json','social-tests.json','tests-final.json','model-recheck.json','parity-recheck.json','social-live-report.json','deployment-social.json']:
    file = root / 'native/Artifacts/village/P10' / name
    if file.exists():
        files.add(file)
for name in ['rules-tests.json','regression-tests.json','parity.json','base-compatibility.json','build.json','host-performance.json','longrun-mlp-2126.json','longrun-teacher-2127.json','human-life-closed-loop.json','human-tactical-closed-loop.json','native-acceptance.json','migration-reset.json','formal-current.json']:
    file = root / 'native/Artifacts/animals/beast-tide-v2' / name
    if file.exists(): files.add(file)
files.add(root / 'docs/implementation/village/beast-tide-ledger.md')
missing = sorted(str(f.relative_to(root)) for f in files if not f.is_file())
files = {f for f in files if f.is_file()}
for f in (root / 'native/Artifacts/animals/beast-tide-v2').rglob('*'):
    if f.is_file() and f.suffix in {'.json', '.png'} and 'backup' not in str(f).lower(): files.add(f)
files.update(f for f in (root / 'tests').glob('*animal*.test.ts'))
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in sorted(files):
        assert file.is_relative_to(root) and file.is_file()
        relative = file.relative_to(root).as_posix()
        data = file.read_bytes()
        archive.writestr(relative, data)
        entries.append({'file': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
report = {
    'classification': 'current-integrated-gameplay-source-and-synthetic-training-snapshot-not-a-historical-phase-snapshot',
    'archive': out.relative_to(root).as_posix(), 'archiveSha256': hashlib.sha256(out.read_bytes()).hexdigest(),
    'excluded': 'Map art and Unity binary assets, user databases, credentials, caches, raw runtime logs and crash dumps',
    'files': entries, 'missingHistoricalReports': missing,
}
(root / 'docs/implementation/village/P3-P6-SHA256SUMS.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
with zipfile.ZipFile(out) as check:
    assert check.testzip() is None
print(json.dumps({'archive': str(out), 'files': len(entries), 'bytes': out.stat().st_size, 'sha256': report['archiveSha256']}))
