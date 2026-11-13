#!/usr/bin/env python3
"""Check key Data Lab migration invariants without touching racing content."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parents[1]
PAGES = [ROOT / 'index.html', *sorted((ROOT / 'data-lab').rglob('index.html')),
         *sorted((ROOT / 'research').rglob('index.html')),
         *sorted((ROOT / 'tools').rglob('index.html')),
         *sorted((ROOT / 'guides').rglob('index.html'))]

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.canonicals = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('a', 'link') and a.get('href'):
            self.refs.append(a['href'])
        if tag in ('script', 'img') and a.get('src'):
            self.refs.append(a['src'])
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonicals.append(a.get('href'))

errors = []
for page in PAGES:
    parser = Links()
    html = page.read_text(encoding='utf-8')
    parser.feed(html)
    expected = 'https://ogb-umalab.com/' + ('' if page == ROOT / 'index.html' else page.relative_to(ROOT).as_posix()[:-len('index.html')])
    if parser.canonicals != [expected]:
        errors.append(f'{page.relative_to(ROOT)}: canonical {parser.canonicals} != {expected}')
    for ref in parser.refs:
        if ref.startswith(('mailto:', 'tel:', 'javascript:', '#', 'data:')):
            continue
        parsed = urlparse(ref)
        if parsed.scheme and parsed.scheme not in ('http', 'https'):
            continue
        if parsed.netloc and parsed.netloc not in ('ogb-umalab.com', 'www.ogb-umalab.com'):
            if 'ogb-umalab.github.io/ogb-data-lab-website' in ref:
                errors.append(f'{page.relative_to(ROOT)}: legacy image or page link: {ref}')
            continue
        path = unquote(parsed.path)
        target = ROOT / path.lstrip('/') if parsed.netloc else page.parent / path
        target = target.resolve()
        if not target.is_relative_to(ROOT.resolve()):
            errors.append(f'{page.relative_to(ROOT)}: outside repository: {ref}')
            continue
        if target.is_dir():
            target /= 'index.html'
        if not target.exists():
            errors.append(f'{page.relative_to(ROOT)}: missing local target: {ref}')
for path, minimum in [('assets/data-lab-images/ogb-data-lab-office.png', 1000000),
                      ('assets/data-lab-images/logo-ogb-data-lab.png', 100000),
                      ('assets/data-lab-images/ogb-data-lab-og.png', 100000),
                      ('assets/data-lab-icons/favicon.ico', 1000)]:
    if not (ROOT / path).exists() or (ROOT / path).stat().st_size < minimum:
        errors.append(f'Missing or truncated image: {path}')
print(f'Checked {len(PAGES)} research pages; {len(errors)} issues')
for error in errors:
    print('ERROR:', error)
raise SystemExit(bool(errors))
