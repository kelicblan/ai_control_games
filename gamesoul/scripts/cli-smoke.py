"""Verify native inference directly, even when local HTTP is unavailable."""
import json
import argparse
from pathlib import Path
import re
import subprocess
import time

root = Path(__file__).resolve().parents[1]
config = json.loads((root / 'model-config.json').read_text(encoding='utf-8'))
parser = argparse.ArgumentParser()
parser.add_argument('--threads', type=int, default=20)
parser.add_argument('--tag', default='qwen35-08b-cli-smoke')
options = parser.parse_args()
if not re.fullmatch(r'[a-zA-Z0-9_-]+', options.tag):
    parser.error('tag must be a simple filename')
prompt = root / 'logs' / 'cli-prompt.txt'
prompt.write_text('<|im_start|>system\n你是营地伙伴林岚，勤勉、讲原则、重视公平。仅依据事实用中文输出一句台词和一个行动意图，不要编造经历。<|im_end|>\n<|im_start|>user\n你今天已经采集两趟木材，体力只剩15，现在是雷暴。玩家答应换班但未兑现，现在又要求你冒雨采集。允许动作：休息、要求换班、采集木材。请回应。<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n', encoding='utf-8')
args = [str(root / 'runtime' / 'llama-completion.exe'), '-m', str(root / config['model']), '-f', str(prompt), '-n', '160', '-c', '4096', '-t', str(options.threads), '-tb', str(options.threads), '-ngl', '0', '--temp', '0', '--seed', '42', '--no-display-prompt', '--no-conversation']
start = time.perf_counter()
result = subprocess.run(args, capture_output=True, timeout=180, cwd=root)
elapsed = time.perf_counter() - start
stdout = result.stdout.decode('utf-8', errors='replace')
stderr = result.stderr.decode('utf-8', errors='replace')
(root / 'logs' / f'{options.tag}.stdout.log').write_text(stdout, encoding='utf-8')
(root / 'logs' / f'{options.tag}.stderr.log').write_text(stderr, encoding='utf-8')
timings = {}
for name, pattern in [('prompt_tokens_per_second', r'prompt eval time[^\n]*?([\d.]+) tokens per second'), ('generation_tokens_per_second', r'(?<!prompt )eval time[^\n]*?([\d.]+) tokens per second')]:
    match = re.search(pattern, stderr)
    if match:
        timings[name] = float(match.group(1))
evidence = {'elapsed_seconds': elapsed, 'exit_code': result.returncode, 'threads': options.threads, **timings, 'command': args, 'reply': stdout}
(root / 'logs' / f'{options.tag}-result.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
if result.returncode or not any('\u4e00' <= c <= '\u9fff' for c in stdout):
    raise RuntimeError(f'Native inference failed; inspect logs: {stderr[-2000:]}')
print(json.dumps(evidence, ensure_ascii=False, indent=2))
