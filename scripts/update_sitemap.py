#!/usr/bin/env python3
"""Rebuild the sitemap from published, crawlable HTML pages.

OGB central-race data pages deliberately remain excluded: their discovery
workflow begins at note, not at the website's navigation/search sitemap.
Preview/test pages are also excluded.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://ogb-umalab.com/"
SITEMAP = ROOT / "sitemap.xml"

ALLOWED = (
    "about/",
    "class-promotion/",
    "global-news/",
    "knowledge/",
    "ogb-data/",
    "privacy/",
)
EXCLUDED = (
    "ogb-data/central/",
    "ogb-data/daily-preview/",
    "ogb-data/preview/",
)


def included(path: str) -> bool:
    return (
        path == "index.html"
        or (path.startswith(ALLOWED) and not path.startswith(EXCLUDED))
    )


def main() -> None:
    urls = set()
    for index in ROOT.rglob("index.html"):
        relative = index.relative_to(ROOT).as_posix()
        if included(relative):
            suffix = "" if relative == "index.html" else relative[: -len("index.html")]
            urls.add(BASE + suffix)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for url in sorted(urls):
        lines += ["  <url>", f"    <loc>{url}</loc>", "  </url>"]
    lines.append("</urlset>")
    SITEMAP.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Generated sitemap.xml with {len(urls)} URLs")


if __name__ == "__main__":
    main()
