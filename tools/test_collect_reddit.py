"""Tests for bounded public metadata collection, without upstream requests."""
import unittest
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import collect_reddit as collector

ATOM = b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>[Hiring] Python developer</title><author><name>/u/example</name></author><link href="https://www.reddit.com/r/forhire/comments/abc123/title/"/><published>2026-10-07T08:00:00Z</published><content>PRIVATE_BODY_MUST_NOT_BE_COPIED</content></entry></feed>'''

class FeedTests(unittest.TestCase):
    def test_metadata_only(self):
        rows = collector.parse_feed(ATOM, '2026-10-07T12:00:00Z')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['title'], '[Hiring] Python developer')
        self.assertEqual(rows[0]['author'], '/u/example')
        self.assertEqual(rows[0]['published_at'], '2026-10-07T08:00:00Z')
        self.assertNotIn('PRIVATE_BODY', str(rows))
        self.assertEqual(rows[0]['visibility'], 'public')

    def test_private_or_foreign_links_rejected(self):
        for url in ['https://www.reddit.com/message/inbox', 'https://evil.test/r/forhire/comments/abc123/title/', 'http://www.reddit.com/r/forhire/comments/abc123/title/']:
            raw = ATOM.replace(b'https://www.reddit.com/r/forhire/comments/abc123/title/', url.encode())
            self.assertEqual(collector.parse_feed(raw, '2026-10-07T12:00:00Z'), [])

    def test_refresh_merge_and_failed_read_preserves_feed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            captured, batch, feed = [root / name for name in ('source.xml', 'batch.json', 'feed.json')]
            captured.write_bytes(ATOM)
            command = [sys.executable, str(Path(collector.__file__)), '--input', str(captured),
                       '--output', str(batch), '--merge-feed', str(feed)]
            for _ in range(2):
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            data = json.loads(feed.read_text())
            self.assertEqual(len(data['posts']), 1)
            self.assertNotIn('PRIVATE_BODY', feed.read_text())
            saved = feed.read_bytes()
            captured.write_bytes(b'<html>login required</html>')
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(feed.read_bytes(), saved)

    def test_bounds_and_wrong_document(self):
        with self.assertRaises(ValueError): collector.parse_feed(b'x' * (2*1024*1024+1), '2026-10-07')
        with self.assertRaises(ValueError): collector.parse_feed(b'<html>login</html>', '2026-10-07')
        raw = ATOM.replace(b'[Hiring] Python developer', b'word ' * 100)
        self.assertEqual(len(collector.parse_feed(raw, '2026-10-07')[0]['title'].split()), 25)

if __name__ == '__main__': unittest.main()
