#!/usr/bin/env python3
"""Regression tests for the sitemap generator using an isolated temporary site."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import update_sitemap as generator


class SitemapGenerationTests(unittest.TestCase):
    def test_excludes_noindex_and_preserves_public_pages(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            pages = {
                "index.html": '<html><head><title>Home</title></head></html>',
                "tools/public/index.html": '<html><head><title>Public</title></head></html>',
                "tools/test/index.html": '<html><head><meta name="robots" content="noindex,follow"></head></html>',
                "guides/hidden/index.html": '<html><head><meta content="NOINDEX, FOLLOW" name="ROBOTS"></head></html>',
                "tools/google-hidden/index.html": '<html><head><meta name="googlebot" content="noindex"></head></html>',
                "ogb-data/central/index.html": '<html></html>',
                "data-lab/index.html": '<html></html>',
            }
            for name, html in pages.items():
                file = root / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(html, encoding="utf-8")
            with patch.object(generator, "ROOT", root), patch.object(generator, "SITEMAP", root / "sitemap.xml"):
                generator.main()
            xml = (root / "sitemap.xml").read_text(encoding="utf-8")
            self.assertIn("<loc>https://ogb-umalab.com/</loc>", xml)
            self.assertIn("<loc>https://ogb-umalab.com/tools/public/</loc>", xml)
            self.assertIn("<loc>https://ogb-umalab.com/data-lab/</loc>", xml)
            for excluded in ("tools/test/", "guides/hidden/", "tools/google-hidden/", "ogb-data/central/"):
                self.assertNotIn("<loc>https://ogb-umalab.com/" + excluded + "</loc>", xml)


if __name__ == "__main__":
    unittest.main()
