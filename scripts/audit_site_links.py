#!/usr/bin/env python3
"""Audit local links in all published HTML pages; report without rewriting content."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, unquote
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = "https://ogb-umalab.com/"
class Reader(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.base = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'base' and a.get('href'):
            self.base = a['href']
        for key in (('href',) if tag in ('a','link') else ('src',) if tag in ('img','script','iframe') else ()):
            if a.get(key):
                self.links.append((tag, a[key]))

def main():
    missing = []
    checked = 0
    for page in sorted(ROOT.rglob('*.html')):
        if '.git' in page.parts:
            continue
        checked += 1
        parser = Reader()
        parser.feed(page.read_text(encoding='utf-8', errors='replace'))
        origin = DOMAIN + page.relative_to(ROOT).as_posix()
        if page.name == 'index.html':
            origin = DOMAIN + page.parent.relative_to(ROOT).as_posix().replace('.', '').strip('/') + '/'
        base = parser.base or origin
        for tag, raw in parser.links:
            if raw.startswith(('#','data:','mailto:','tel:','javascript:')):
                continue
            url = urlsplit(urljoin(base, raw))
            if url.netloc not in ('ogb-umalab.com','www.ogb-umalab.com'):
                continue
            local = ROOT / unquote(url.path).lstrip('/')
            if local.is_dir():
                local /= 'index.html'
            if not local.is_file():
                missing.append((page.relative_to(ROOT).as_posix(), tag, raw))
    print(f'Checked {checked} HTML files; {len(missing)} unresolved local references')
    for page, tag, ref in missing[:200]:
        print(f'{page} [{tag}] {ref}')
    if len(missing) > 200:
        print(f'...and {len(missing)-200} more')
    counts = Counter(x[0].split('/')[0] for x in missing)
    print('By section:', dict(counts))
    # Historical content can contain old links; this audit is informational.
if __name__ == '__main__':
    main()
