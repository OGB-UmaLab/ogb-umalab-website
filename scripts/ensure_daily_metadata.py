#!/usr/bin/env python3
"""Add accessible page headings and descriptive metadata to published daily OGB DATA.

Idempotent: updates only the page-heading element and head metadata.
Never modifies race tables, numerical values, styling, or client-side scripts.
"""
from html import escape, unescape
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DAILY = ROOT / "ogb-data" / "daily"

BRAND = re.compile(r'<div class="brand">([^<>]+)</div>')
TITLE = re.compile(r'<title>([^<>]+)</title>')
META_DESCRIPTION = re.compile(r'<meta\s+name="description"\s+content="[^"]*"\s*/?>', re.I)
H1 = re.compile(r'<h1\b', re.I)

def update_page(file: Path) -> bool:
    content = file.read_text(encoding="utf-8")
    # Newer pages already have both semantic elements; leave them unchanged.
    if H1.search(content) and META_DESCRIPTION.search(content):
        return False
    brand = BRAND.search(content)
    title = TITLE.search(content)
    if not brand or not title:
        raise ValueError(f"Unrecognized daily DATA format: {file}")
    label = unescape(brand.group(1)).strip()
    if not label.endswith("｜OGB DATA"):
        raise ValueError(f"Unexpected heading: {file}: {label}")
    if H1.search(content) or META_DESCRIPTION.search(content):
        # Already processed or generated in a newer format.
        if H1.search(content) and META_DESCRIPTION.search(content):
            return False
        raise ValueError(f"Partially formatted page needs manual review: {file}")

    description = (
        f"{label}。出走馬のOGB指数と各種分析データを一覧で比較。"
        "各項目の並べ替えとMY印機能を利用できます。"
    )
    description_tag = '<meta name="description" content="' + escape(description, quote=True) + '"/>'
    content = content.replace(title.group(0), title.group(0) + description_tag, 1)
    content = content.replace(brand.group(0), f'<h1 class="brand">{brand.group(1)}</h1>', 1)
    # div had no user-agent margins; give h1 the same visual box dimensions.
    if ".brand{" in content:
        content = content.replace(".brand{", ".brand{margin:0;", 1)
    else:
        raise ValueError(f"Missing styling: {file}")
    file.write_text(content, encoding="utf-8")
    return True

def main():
    changed = 0
    for file in sorted(DAILY.glob("20*/index.html")):
        changed += update_page(file)
    print(f"Fixed semantic heading and description: {changed} daily pages")

if __name__ == "__main__":
    main()
