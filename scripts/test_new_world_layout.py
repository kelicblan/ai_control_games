import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class NewWorldLayoutContract(unittest.TestCase):
    def test_layout_is_bound_to_selected_source_and_has_no_legacy_models(self):
        data = json.loads((ROOT/'docs/new-world/layout.json').read_text(encoding='utf-8'))
        source = ROOT/'native/ArtSource/new-world-20261017/selected-world-map.png'
        self.assertEqual(data['referenceSha256'], hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertEqual(data['imageSize'], [1672,941])
        self.assertEqual([b['id'] for b in data['buildings']], ['H','A','B','C','D','E','T'])
        for b in data['buildings']:
            self.assertNotIn('model', b)
            self.assertGreaterEqual(len(b['footprint']),4)
            self.assertTrue(b['inferredHeightMeters'] > 0)
        self.assertLess(data['gate']['left'][0], data['gate']['right'][0])
        self.assertGreater(data['bridge']['villageEnd'][0],data['bridge']['outerEnd'][0])
        self.assertLess(data['bridge']['villageEnd'][1],data['bridge']['outerEnd'][1])
        self.assertFalse(data['visualAccepted'])
        self.assertFalse(data['authorityConnected'])
        self.assertGreaterEqual(len(data['river']['villageBank']),12)
        self.assertGreaterEqual(len(data['mountains']),6)

if __name__ == '__main__':
    unittest.main()
