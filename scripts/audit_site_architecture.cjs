// Site architecture audit: node scripts/audit_site_architecture.cjs
// Checks all sitemap entries against the checked-out repository.
// Fail CI for broken/mismatched indexed URLs; report legacy missing canonicals separately.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const host = 'https://ogb-umalab.com';
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m => m[1].trim());
const counts = new Map();
const errors = [];
const warnings = [];
const canonicalOf = html => html.match(/<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i)?.[1];
const robotsNoindex = html => /<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*\bnoindex\b)[^>]*>/i.test(html);
const seen = new Set();
for (const url of urls) {
  if (seen.has(url)) { errors.push('Duplicate sitemap URL: ' + url); continue; }
  seen.add(url);
  if (!url.startsWith(host + '/')) { errors.push('Unexpected sitemap host: ' + url); continue; }
  const pathname = url.slice(host.length);
  if (!/^\/(?:[a-zA-Z0-9._~%-]+\/)*$/.test(pathname)) {
    errors.push('Non-directory or unsafe sitemap URL: ' + url); continue;
  }
  const segment = pathname.split('/').filter(Boolean)[0] || '(root)';
  counts.set(segment, (counts.get(segment) || 0) + 1);
  const file = path.join(root, pathname.slice(1), 'index.html');
  if (!fs.existsSync(file)) { errors.push('Sitemap URL without index.html: ' + pathname); continue; }
  const html = fs.readFileSync(file, 'utf8');
  const canonical = canonicalOf(html);
  if (canonical && canonical !== url) errors.push('Canonical mismatch: ' + pathname + ' -> ' + canonical);
  if (!canonical) {
    const issue = 'Missing canonical: ' + pathname;
    if (segment === 'tools' || segment === 'guides' || pathname === '/') errors.push(issue);
    else warnings.push(issue);
  }
  if (robotsNoindex(html)) errors.push('Noindex page present in sitemap: ' + pathname);
}
for (const entry of ['index.html', 'data-lab/index.html']) {
  const file = path.join(root, entry);
  if (!fs.existsSync(file)) { errors.push('Missing key landing page: ' + entry); continue; }
  const canonical = canonicalOf(fs.readFileSync(file, 'utf8'));
  if (!canonical) errors.push('Missing canonical on ' + entry);
  else if (entry === 'index.html' && canonical !== host + '/') errors.push('Homepage canonical incorrect: ' + canonical);
  else if (entry !== 'index.html' && !seen.has(canonical)) warnings.push('Landing page canonical not in sitemap: ' + entry + ' -> ' + canonical);
}
console.log('Sitemap URLs:', urls.length, '| unique:', seen.size);
for (const [segment, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(segment.padEnd(20), count);
console.log('Architecture errors:', errors.length, '| warnings:', warnings.length);
for (const issue of errors) console.error('ERROR', issue);
for (const issue of warnings.slice(0, 100)) console.warn('WARN', issue);
if (warnings.length > 100) console.warn('... additional warnings:', warnings.length - 100);
const report = { checkedAt: new Date().toISOString(), sitemapUrls: urls.length, uniqueUrls: seen.size, categories: Object.fromEntries(counts), errors, warnings };
const outDir = path.join(root, 'test-results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'architecture-audit.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log('Saved test-results/architecture-audit.json');
if (errors.length) process.exitCode = 1;
