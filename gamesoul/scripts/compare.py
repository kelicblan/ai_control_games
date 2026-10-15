"""Compare original base and adapter strengths using the identical prompt."""
import json
from pathlib import Path
import subprocess
import time

root = Path(__file__).resolve().parents[1]
prompt = root / 'logs' / 'cli-prompt.txt'
rows = []
for scale in (0, 0.5, 1):
    args = [str(root / 'runtime' / 'llama-completion.exe'), '-m', str(root / 'models/base/Qwen3-4B-Q4_K_M.gguf'), '-f', str(prompt), '-n', '160', '-c', '4096', '-t', '8', '-tb', '8', '-ngl', '0', '--temp', '0', '--no-display-prompt', '--no-conversation']
    if scale:
        args += ['--lora-scaled', f'models/gamesoul-f16.gguf:{scale}']
    start = time.perf_counter()
    result = subprocess.run(args, capture_output=True, timeout=180, cwd=root)
    row = {'scale': scale, 'seconds': time.perf_counter()-start, 'exit_code': result.returncode, 'reply': result.stdout.decode('utf-8', errors='replace')}
    rows.append(row)
    print(json.dumps(row, ensure_ascii=False), flush=True)
(root / 'logs/compare.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
