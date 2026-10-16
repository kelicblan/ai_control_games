"""Exercise the real local API and preserve response/timing evidence."""
import json
from pathlib import Path
import time
import urllib.request

root = Path(__file__).resolve().parents[1]
config = json.loads((root / 'model-config.json').read_text(encoding='utf-8'))
payload = {
    'model': config['alias'], 'temperature': 0, 'max_tokens': 160,
    'chat_template_kwargs': {'enable_thinking': False},
    'messages': [
        {'role': 'system', 'content': '你是营地生存游戏中的NPC林岚，勤勉、讲原则、重视公平。仅依据提供的事实作出选择。用中文输出一句台词和一个行动意图，不要思考过程，不要编造经历。'},
        {'role': 'user', 'content': json.dumps({
            'NPCID': 'linlan', 'Character Background': '林岚，营地伙伴，勤勉且重视公平',
            'Traits': {'Core Personality': ['勤勉', '讲原则', '重视公平']},
            'Dynamic Status': {'体力': 15, '天气': '雷暴'},
            'Memory Events': [{'事件': '今天已经采集两趟木材'}, {'事件': '玩家答应换班但未兑现'}],
            'Current Event': '玩家要求你立即再次冒雨采集',
            'Allowed Actions': ['休息', '要求换班', '采集木材']
        }, ensure_ascii=False)}
    ]
}
request = urllib.request.Request('http://127.0.0.1:18080/v1/chat/completions', data=json.dumps(payload, ensure_ascii=False).encode('utf-8'), headers={'Content-Type': 'application/json'})
start = time.perf_counter()
with urllib.request.urlopen(request, timeout=180) as response:
    result = json.load(response)
elapsed = time.perf_counter() - start
content = result['choices'][0]['message'].get('content')
if not content or not any('\u4e00' <= c <= '\u9fff' for c in content):
    raise RuntimeError(f'No Chinese reply: {result}')
evidence = {'elapsed_seconds': elapsed, 'request': payload, 'response': result}
(root / 'logs' / 'smoke-result.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'elapsed_seconds': elapsed, 'reply': content, 'usage': result.get('usage'), 'timings': result.get('timings')}, ensure_ascii=False, indent=2))
