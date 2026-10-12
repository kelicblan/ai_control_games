"""Loopback NPC speech service. Python stdlib only; never blocks the game loop."""
import argparse
import json
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NPCS = {'azhuang', 'xiaomi', 'laozhou'}
ACTIONS = {'wood', 'food', 'fire', 'eat', 'rest', 'help', 'camp', 'explore', 'none'}
EMOTIONS = {'calm', 'happy', 'worried', 'annoyed', 'caring'}
SYSTEM = '你是正在森林露营的伙伴，用简短的中文口语和朋友说话。'
ACTION_WORDS = {'wood': r'木|柴', 'food': r'食物|吃的|浆果|果子|采摘|采集',
                'fire': r'火|柴', 'eat': r'吃|食物|饿|肚子', 'rest': r'歇|休息|缓|喘|恢复|躺|体力',
                'help': r'帮|照顾|搭把|同伴|伙伴', 'camp': r'回|营地|营火', 'explore': r'探|看看|林|路'}
PREFIXES = {
    'wood': ['我去拾些柴，', '我去找点木柴，'], 'food': ['我去找些吃的，', '我去采点浆果，'],
    'fire': ['我来照看火堆，', '我先护着篝火，'], 'eat': ['我先吃点东西，', '让我填填肚子，'],
    'rest': ['我先歇一会儿，', '让我缓口气，'], 'help': ['我来搭把手，', '我去帮帮同伴，'],
    'camp': ['我回营地了，', '我先回营地，'], 'explore': ['我去附近看看，', '我去探探路，'],
    'none': ['我听到了，'],
}


def caption_prefix(payload):
    event = payload['event']
    if '谢谢' in event or '你这句话' in event:
        return secrets.choice(['谢谢你，', '有你在真好，'])
    if '知道了' in event or '听到了' in event:
        return secrets.choice(['我听到了，', '知道了，'])
    if '还不饿' in event:
        return '我还不饿，'
    return secrets.choice(PREFIXES[payload['action']])


def matches_facts(text, payload):
    social = any(word in payload['event'] for word in ('谢谢', '你这句话', '知道了', '听到了', '还不饿'))
    anchor = ACTION_WORDS.get(payload['action'])
    if anchor and not social and not re.search(anchor, text):
        return False
    if any('雷暴' in fact for fact in payload['facts']) and re.search(r'(没有|没|不会|无)雷|晴天|天气晴|雷暴.{0,8}(过去|结束|停)|雨停|转晴', text):
        return False
    if any('精疲力尽' in fact for fact in payload['facts']) and re.search(r'体力充足|不累|精力充沛', text):
        return False
    if payload['action'] == 'rest' and re.search(r'不(?:用|需要|想|会)?休息', text):
        return False
    return True


def validate_request(value):
    if not isinstance(value, dict):
        raise ValueError('Expected a JSON object')
    limits = {'requestId': 120, 'npcId': 20, 'name': 20, 'persona': 100,
              'action': 20, 'emotion': 20, 'event': 180}
    result = {}
    for field, limit in limits.items():
        text = value.get(field)
        if not isinstance(text, str) or not 1 <= len(text) <= limit or '<' in text or '>' in text:
            raise ValueError('Invalid ' + field)
        result[field] = text
    if result['npcId'] not in NPCS or result['action'] not in ACTIONS or result['emotion'] not in EMOTIONS:
        raise ValueError('Unknown character, action or emotion')
    for field, count, length in [('facts', 8, 100), ('memories', 3, 160), ('recentLines', 5, 80)]:
        items = value.get(field, [])
        if not isinstance(items, list) or len(items) > count or any(
            not isinstance(item, str) or len(item) > length or '<' in item or '>' in item for item in items
        ):
            raise ValueError('Invalid ' + field)
        result[field] = items
    return result


def clean_line(text):
    if not isinstance(text, str):
        return ''
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.S).strip()
    if '<' in text or '>' in text or '\ufffd' in text:
        return ''
    text = text.strip('"\'“”‘’ \n')
    # Incomplete or rambling generations are not shown as finished dialogue.
    match = re.match(r'[^\n。！？!?]*[。！？!?]', text)
    line = match.group(0).strip() if match else ''
    if not 4 <= len(line) <= 36 or not re.search(r'[\u4e00-\u9fff]', line):
        return ''
    if re.search(r'金币|奖励|作为.*(?:AI|助手)|玩家获得|系统提示|台词[:：]|只说|第一人称|换个说法|魔[法力]|建议|作为|咖啡|公司|办公室|电脑|手机|<think>', line):
        return ''
    return line


class SpeechService:
    def __init__(self, generate, timeout=2.5):
        self.generate = generate
        self.timeout = timeout
        self._slot = threading.Lock()
        self.generated = 0
        self.last_latency_ms = 0

    @property
    def busy(self):
        return self._slot.locked()

    def speech(self, raw):
        try:
            payload = validate_request(raw)
        except ValueError as error:
            return 400, {'error': str(error)}
        if not self._slot.acquire(blocking=False):
            return 200, {'requestId': payload['requestId'], 'source': 'template', 'outcome': 'busy'}
        started = time.monotonic()
        deadline = started + self.timeout
        try:
            # Exclusive native ownership persists across client disconnects/timeouts.
            text = self.generate(payload, deadline)
            if time.monotonic() >= deadline:
                raise TimeoutError()
            text = clean_line(text)
            if not text or text in payload['recentLines'] or text == payload['event'] or not matches_facts(text, payload):
                return 200, {'requestId': payload['requestId'], 'source': 'template', 'outcome': 'skipped',
                             'reason': 'No fresh valid caption; keep immediate feedback'}
            self.last_latency_ms = round((time.monotonic() - started) * 1000, 1)
            self.generated += 1
            return 200, {'requestId': payload['requestId'], 'text': text, 'source': 'minimind3',
                         'latencyMs': self.last_latency_ms}
        except TimeoutError:
            return 200, {'requestId': payload['requestId'], 'source': 'template', 'outcome': 'skipped',
                         'reason': 'Generation timed out; keep immediate feedback'}
        except Exception as error:
            print('[npc] generation failed:', type(error).__name__, flush=True)
            return 500, {'error': 'Generation failed; keep immediate feedback'}
        finally:
            self._slot.release()


def native_generator():
    # Import only when actually starting the model, keeping portable tests DLL-free.
    from mmchat import Chat, reset_context

    def generate(payload, deadline):
        # This 64M checkpoint needs a factual first-person anchor. Only the
        # continuation is generated; unsuitable continuations retain game feedback.
        prefix = caption_prefix(payload)
        prompt = (f"现在{'，'.join(payload['facts'][:3])}。{payload['event']}"
                  + (f"刚才{payload['memories'][-1]}" if payload['memories'] else ''))
        chat = None
        try:
            chat = Chat(f"{SYSTEM}你叫{payload['name']}，{payload['persona']}。", deadline=deadline)
            text = chat.ask(prompt, max_new_tokens=96, verbose=False, temperature=.7,
                            no_thinking=True, stop_at_sentence=True, assistant_prefix=prefix)
            if len(text.removeprefix(prefix).strip()) < 3:
                return ''
            return text
        finally:
            reset_context()
    return generate


def make_handler(service):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'CampMindNPC/1'
        def send_json(self, status, body):
            encoded = json.dumps(body, ensure_ascii=False).encode('utf-8')
            try:
                self.send_response(status)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass  # Model cleanup already finished before sending the response.

        def do_GET(self):
            if self.path != '/health':
                self.send_json(404, {'error': 'Not found'}); return
            self.send_json(200, {'ready': True, 'model': 'minimind-3-q8', 'busy': service.busy,
                                 'generated': service.generated, 'lastLatencyMs': service.last_latency_ms})

        def do_POST(self):
            if self.path != '/speech':
                self.send_json(404, {'error': 'Not found'}); return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 12000:
                    raise ValueError('Request too large or empty')
                self.connection.settimeout(3)
                payload = json.loads(self.rfile.read(size))
            except (ValueError, OSError):
                self.send_json(400, {'error': 'Invalid JSON request'}); return
            status, body = service.speech(payload)
            self.send_json(status, body)

        def log_message(self, format, *args):
            if args and str(args[0]).startswith('GET /health'):
                return
            super().log_message(format, *args)
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    service = SpeechService(native_generator())
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(service))
    server.daemon_threads = True
    print(f'[npc] ready on http://127.0.0.1:{args.port} (local CPU model)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
