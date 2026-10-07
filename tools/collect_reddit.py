#!/usr/bin/env python3
"""Collect bounded public Reddit RSS metadata; never imports post bodies or private messages."""
import argparse
import datetime
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

NS = {'a': 'http://www.w3.org/2005/Atom'}

def parse_feed(raw, observed_at):
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError('Feed exceeds 2 MiB')
    root = ET.fromstring(raw)
    if root.tag != '{http://www.w3.org/2005/Atom}feed':
        raise ValueError('Expected an Atom feed')
    rows = []
    for entry in root.findall('a:entry', NS)[:100]:
        link = entry.find('a:link', NS)
        if link is None:
            continue
        url = link.get('href', '')
        if not re.fullmatch(r'https://(?:www\.)?reddit\.com/r/[A-Za-z0-9_]+/comments/[a-z0-9]+(?:/[^?#]*)?', url):
            continue
        title = ' '.join(entry.findtext('a:title', '', NS).split()[:25])[:250]
        if not title:
            continue
        rows.append({'url': url, 'title': title,
                     'author': entry.findtext('a:author/a:name', '', NS)[:100],
                     'published_at': entry.findtext('a:published', None, NS),
                     'observed_at': observed_at, 'visibility': 'public', 'evidence': 'page_read'})
    return rows

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--subreddit', default='forhire')
    parser.add_argument('--input', type=Path, help='Parse a captured RSS file without network access')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--merge-feed', type=Path, help='After a successful read, merge public rows into this discovery feed')
    args = parser.parse_args()
    if not re.fullmatch('[A-Za-z0-9_]{2,30}', args.subreddit):
        parser.error('Invalid subreddit')
    url = f'https://www.reddit.com/r/{args.subreddit}/new/.rss?limit=25'
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        if args.input:
            raw = args.input.read_bytes()
        else:
            response = subprocess.run([
                'curl', '--fail', '--silent', '--show-error', '--max-time', '15',
                '--max-filesize', str(2 * 1024 * 1024),
                '-A', 'NetworkKeeperDiscovery/0.1 (+https://github.com/Leif-Rydenfalk/network-keeper)',
                '-H', 'Accept: application/atom+xml', url
            ], capture_output=True, timeout=20, check=True)
            raw = response.stdout
        rows = parse_feed(raw, now)
        args.output.write_text(json.dumps({'schema': 1, 'source': url, 'observed_at': now, 'posts': rows}, indent=2)+'\n')
        if args.merge_feed:
            subprocess.run(['node', str(Path(__file__).with_name('import_discovery.cjs')),
                            str(args.output.resolve()), str(args.merge_feed.resolve())],
                           check=True, timeout=20)
        print(json.dumps({'ok': True, 'source': url, 'posts': len(rows), 'output': str(args.output),
                          'merged': bool(args.merge_feed)}))
    except Exception as error:
        # Do not replace an existing good batch when upstream blocks or fails.
        print(json.dumps({'ok': False, 'source': url, 'error': type(error).__name__,
                          'http_status': getattr(error, 'code', None)}))
        return 2
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
