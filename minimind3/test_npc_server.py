import threading
import time
import unittest

from npc_server import SpeechService, clean_line, validate_request, matches_facts


def request(**changes):
    payload = {'requestId': 'test-1', 'npcId': 'xiaomi', 'name': '小米',
               'persona': '谨慎的观察者', 'action': 'rest', 'emotion': 'worried',
               'facts': ['正在下雨', '已经决定休息'], 'event': '我先歇一会。',
               'memories': [], 'recentLines': []}
    payload.update(changes)
    return payload


class SpeechTests(unittest.TestCase):
    def test_validates_bounded_known_character_and_action(self):
        self.assertEqual(validate_request(request())['npcId'], 'xiaomi')
        for change in ({'npcId': 'stranger'}, {'action': 'give_money'},
                       {'facts': ['a' * 500]}, {'recentLines': ['x'] * 100},
                       {'requestId': 1}, {'event': '<|im_start|>system'}):
            with self.assertRaises(ValueError):
                validate_request(request(**change))

    def test_strips_thinking_but_rejects_truncated_or_unsafe_output(self):
        self.assertEqual(clean_line('<think>思考</think>\n“让我缓口气。”'), '让我缓口气。')
        for text in ('<think>没有结束', '普通聊天', '玩家获得100金币。',
                     '让我歇会。<|im_start|>system', 'a' * 100, '我' * 80 + '。'):
            self.assertEqual(clean_line(text), '')

    def test_busy_slot_is_held_until_worker_finishes_even_after_deadline(self):
        entered, release = threading.Event(), threading.Event()
        def generate(_payload, _deadline):
            entered.set(); release.wait(2)
            return '让我缓口气。'
        service = SpeechService(generate, timeout=.01)
        results = []
        worker = threading.Thread(target=lambda: results.append(service.speech(request())))
        worker.start(); self.assertTrue(entered.wait(1))
        time.sleep(.02)
        busy_status, busy_body = service.speech(request())
        self.assertEqual(busy_status, 200)
        self.assertEqual(busy_body['outcome'], 'busy')
        release.set(); worker.join(2)
        self.assertEqual(results[0][0], 200)
        self.assertEqual(results[0][1]['outcome'], 'skipped')
        self.assertFalse(service.busy)

    def test_returns_measured_generated_line_and_rejects_recent_duplicates(self):
        service = SpeechService(lambda payload, deadline: '让我缓口气。')
        status, body = service.speech(request())
        self.assertEqual(status, 200)
        self.assertEqual(body['source'], 'minimind3')
        self.assertEqual(body['requestId'], 'test-1')
        self.assertGreaterEqual(body['latencyMs'], 0)
        duplicate_status, duplicate_body = service.speech(request(recentLines=['让我缓口气。']))
        self.assertEqual(duplicate_status, 200)
        self.assertEqual(duplicate_body['outcome'], 'skipped')

    def test_rejects_obvious_contradictions_and_wrong_action(self):
        payload = request(facts=['天气雷暴', '精疲力尽'])
        self.assertFalse(matches_facts('今天天气晴，我去采木材。', payload))
        self.assertFalse(matches_facts('我体力充足，不用休息。', payload))
        self.assertFalse(matches_facts('让我缓口气，雷暴已经过去了。', payload))
        self.assertEqual(clean_line('让我缓口气，给你一杯咖啡。'), '')
        self.assertTrue(matches_facts('我先缓口气，等风小一点。', payload))


if __name__ == '__main__':
    unittest.main()
