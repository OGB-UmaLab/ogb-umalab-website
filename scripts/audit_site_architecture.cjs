// Read-only, dependency-free architecture audit. Run: node scripts/audit_site_architecture.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m => m[1]);
const unique = new Set(urls);
const counts = new Map();
const issues = [];
for (const url of urls) {
  if (!url.startsWith('https://ogb-umalab.com/')) {
    issues.push('Unexpected sitemap host: ' + url);
    continue;
  }
  const pathname = url.slice('https://ogb-umalab.com'.length);
  const segment = pathname.split('/').filter(Boolean)[0] || '(root)';
  counts.set(segment, (counts.get(segment) || 0) + 1);
  const file = path.join(root, pathname.replace(/^\//, ''), 'index.html');
  if (!fs.existsSync(file)) {
    issues.push('Sitemap URL without index.html: ' + pathname);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if (canonical && canonical !== url) issues.push('Canonical mismatch: ' + pathname + ' -> ' + canonical);
}
if (urls.length !== unique.size) issues.push('Duplicate sitemap URLs: ' + (urls.length - unique.size));
for (const entry of ['index.html', 'data-lab/index.html']) {
  const html = fs.readFileSync(path.join(root, entry), 'utf8');
  const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if (!canonical) issues.push('Missing canonical on ' + entry);
  else if (!unique.has(canonical)) issues.push('Canonical not in sitemap: ' + entry + ' -> ' + canonical);
}
console.log('Sitemap URLs:', urls.length, '| unique:', unique.size);
for (const [segment, count] of [...counts].sort((a,b)=>b[1]-a[1])) console.log(segment.padEnd(20), count);
console.log('Architecture findings:', issues.length);
for (const issue of issues.slice(0, 100)) console.log(' -', issue);
if (issues.length > 100) console.log(' ... additional findings:', issues.length - 100);
// Findings are diagnostic: existing site content is not altered and the audit does not fail CI.
