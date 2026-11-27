#!/usr/bin/env python3
"""Add missing canonical metadata only to public, indexable sitemap pages.

Existing canonical tags (including mismatches), redirects, and page bodies
are not rewritten. The sitemap generator's existing exclusions remain binding.
"""
import argparse
from html.parser import HTMLParser
from pathlib import Path
import re
import tempfile
from xml.etree import ElementTree as ET
import update_sitemap as sitemap

class Head(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.inside = False
        self.start = 0
        self.end = None
        self.canonicals = []
        self.noindex = False
        self.redirect = False

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "head":
            self.inside = True
            self.start += 1
        if tag == "link" and "canonical" in a.get("rel", "").lower().split():
            self.canonicals.append(a.get("href", ""))
        if tag == "meta":
            if a.get("name", "").lower() in ("robots", "googlebot"):
                self.noindex |= "noindex" in re.split(r"[,;\s]+", a.get("content", "").lower())
            self.redirect |= a.get("http-equiv", "").lower().strip() == "refresh"

    def handle_endtag(self, tag):
        if tag == "head" and self.inside:
            self.end = self.getpos()
            self.inside = False

def patch(raw, url):
    # Decode without newline normalization; preserve every byte outside the insertion.
    text = raw.decode("utf-8")
    p = Head()
    p.feed(text)
    p.close()
    if p.noindex or p.redirect:
        return raw, "excluded-directive"
    if p.canonicals:
        return raw, "correct" if p.canonicals == [url] else "review-existing"
    if p.start != 1 or p.end is None:
        return raw, "review-head"
    line, col = p.end
    lines = text.splitlines(keepends=True)
    offset = sum(len(x) for x in lines[:line-1]) + col
    if not re.match(r"</head\s*>", text[offset:], re.I):
        return raw, "review-head"
    tag = '<link rel="canonical" href="' + url + '">'
    return (text[:offset] + tag + text[offset:]).encode("utf-8"), "added"

def route_path(url):
    if not url.startswith(sitemap.BASE):
        return None
    route = url[len(sitemap.BASE):]
    if not re.fullmatch(r"(?:[A-Za-z0-9._~-]+/)*", route):
        return None
    if any(x in (".", "..") for x in route.split("/")):
        return None
    relative = route + "index.html"
    return relative if sitemap.included(relative) else None

def run(root, xml, manifest):
    counts = {}
    changes = []
    urls = [e.text for e in ET.parse(xml).getroot().findall("{*}url/{*}loc")]
    if len(set(urls)) != len(urls):
        raise ValueError("Duplicate sitemap URLs")
    for url in urls:
        relative = route_path(url or "")
        if relative is None:
            raise ValueError("Unexpected sitemap route")
        file = root / relative
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(root.resolve()):
            raise ValueError("Invalid published page: " + relative)
        raw = file.read_bytes()
        out, status = patch(raw, url)
        counts[status] = counts.get(status, 0) + 1
        if status == "added":
            changes.append((relative, file, out))
        elif status.startswith("review"):
            print("REVIEW", relative, status)
    # Parse all pages successfully before writing any changes.
    for relative, file, out in changes:
        file.write_bytes(out)
    manifest.write_bytes(b"".join(relative.encode("utf-8") + b"\0" for relative, _, _ in changes))
    print("Public canonical audit:", len(urls), "pages;", counts)

def self_test():
    url = sitemap.BASE + "tools/test/"
    sample = b'<!doctype html>\r\n<html><HEAD><title>Test</title></HEAD><body>DATA</body></html>\r\n'
    expected = sample.replace(b"</HEAD>", ('<link rel="canonical" href="' + url + '"></HEAD>').encode())
    assert patch(sample, url) == (expected, "added")
    assert patch(expected, url) == (expected, "correct")
    existing = b'<head><link href="https://other.test/" REL="canonical"></head>'
    assert patch(existing, url) == (existing, "review-existing")
    for data in (b'<head><meta content="noindex,follow" name="robots"></head>', b'<head><meta http-equiv="refresh" content="0;url=/"></head>'):
        assert patch(data, url) == (data, "excluded-directive")
    assert patch(b'<body>no head</body>', url)[1] == "review-head"
    for route in ("private-tool/", "ogb-data/central/", "ogb-data/daily-preview/", "tools/../", "tools/test/?v=1"):
        assert route_path(sitemap.BASE + route) is None
    assert route_path(sitemap.BASE + "tools/test/") == "tools/test/index.html"
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        file = root / "tools/test/index.html"
        file.parent.mkdir(parents=True)
        file.write_bytes(sample)
        private = root / "private-tool/index.html"
        private.parent.mkdir()
        private.write_bytes(sample)
        xml = root / "sitemap.xml"
        xml.write_text("<urlset><url><loc>" + url + "</loc></url></urlset>", encoding="utf-8")
        manifest = root / "changed"
        run(root, xml, manifest)
        assert file.read_bytes() == expected and private.read_bytes() == sample
        assert manifest.read_bytes() == b"tools/test/index.html\0"
        run(root, xml, manifest)
        assert manifest.read_bytes() == b""
    print("Canonical regression tests passed")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.manifest:
        run(sitemap.ROOT, sitemap.SITEMAP, args.manifest)
    else:
        parser.error("--manifest is required")
