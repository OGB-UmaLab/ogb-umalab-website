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
const robotsNoindex = html => [...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) => {
  const attrs = Object.fromEntries([...tag.matchAll(/([a-z-]+)\s*=\s*(["'])(.*?)\2/gi)].map(([, key, , value]) => [key.toLowerCase(), value]));
  return ['robots', 'googlebot'].includes((attrs.name || '').toLowerCase()) && /(?:^|[,;\s])noindex(?:$|[,;\s])/i.test(attrs.content || '');
});
const titleOf = html => html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1].replace(/\s+/g, ' ').trim();
const descriptionOf = html => [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => {
  const attrs = Object.fromEntries([...tag.matchAll(/([a-z-]+)\s*=\s*(["'])(.*?)\2/gi)].map(([, key, , value]) => [key.toLowerCase(), value]));
  return attrs.name?.toLowerCase() === 'description' ? attrs.content?.trim() : null;
}).find(Boolean);
const contentTitles = new Map();
const contentDescriptions = new Map();
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
  if (segment === 'tools' || segment === 'guides' || segment === 'data-lab') {
    const title = titleOf(html);
    const description = descriptionOf(html);
    if (!title) errors.push('Missing title: ' + pathname);
    if (!description) errors.push('Missing meta description: ' + pathname);
    if (title) {
      if (contentTitles.has(title)) warnings.push('Duplicate title: ' + pathname + ' and ' + contentTitles.get(title));
      else contentTitles.set(title, pathname);
    }
    if (description) {
      if (contentDescriptions.has(description)) warnings.push('Duplicate meta description: ' + pathname + ' and ' + contentDescriptions.get(description));
      else contentDescriptions.set(description, pathname);
    }
  }
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

// Audit only routes intentionally included in the public sitemap. Never read or
// disclose private/preview/central-only destinations while inspecting links.
const graph = new Map();
let navigationLinks = 0;
let noncanonicalLinks = 0;
const legacyLinks = new Map();
const publicRoutes = new Set(urls);
const publicDirectory = /^\/(?:about|class-promotion|global-news|knowledge|ogb-data|privacy|tools|guides|research|data-lab|umalab)(?:\/|$)/;
const excludedDirectory = /^\/ogb-data\/(?:central|daily-preview|preview)(?:\/|$)/;
for (const url of publicRoutes) {
  if (!url.startsWith(host + '/')) continue;
  const pathname = url.slice(host.length);
  if (!/^\/(?:[a-zA-Z0-9._~%-]+\/)*$/.test(pathname) ||
      pathname.split('/').some(part => part === '.' || part === '..')) continue;
  const file = path.join(root, pathname.slice(1), 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const edges = new Set();
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    const href = match[2].replace(/&amp;/gi, '&').trim();
    if (!href || href.startsWith('#')) continue;
    let target;
    try { target = new URL(href, url); } catch { continue; }
    if (target.origin !== host || excludedDirectory.test(target.pathname)) continue;
    if (target.pathname !== '/' && !publicDirectory.test(target.pathname)) continue;
    let route = target.pathname.replace(/\/index\.html$/i, '/');
    if (!route.endsWith('/')) {
      if (/\.[a-z0-9]+$/i.test(route)) continue;
      route += '/';
    }
    if (!/^\/(?:[a-zA-Z0-9._~%-]+\/)*$/.test(route) ||
        route.split('/').some(part => part === '.' || part === '..')) continue;
    const canonical = host + route;
    navigationLinks++;
    if (publicRoutes.has(canonical)) {
      edges.add(canonical);
      if (target.pathname !== route || target.search) {
        noncanonicalLinks++;
        if (!legacyLinks.has(url)) legacyLinks.set(url, new Set());
        legacyLinks.get(url).add(canonical);
      }
    } else {
      // Report only absent public-directory paths, not legitimate noindex pages.
      const dest = path.join(root, route.slice(1), 'index.html');
      if (!fs.existsSync(dest)) errors.push('Missing public navigation target: ' + pathname + ' -> ' + route);
    }
  }
  graph.set(url, edges);
}
const reached = new Set();
const queue = [host + '/'];
for (let i = 0; i < queue.length; i++) {
  const url = queue[i];
  if (reached.has(url)) continue;
  reached.add(url);
  for (const target of graph.get(url) || []) if (!reached.has(target)) queue.push(target);
}
const unreachableDataLab = urls.filter(url => /^https:\/\/ogb-umalab\.com\/(?:tools|guides|data-lab)\//.test(url) && !reached.has(url));
for (const url of unreachableDataLab) warnings.push('No static public navigation path from home: ' + url);
console.log('Public navigation links:', navigationLinks, '| noncanonical URL variants:', noncanonicalLinks,
            '| reachable sitemap URLs:', urls.filter(url => reached.has(url)).length,
            '| unreachable Data Lab pages:', unreachableDataLab.length);

console.log('Sitemap URLs:', urls.length, '| unique:', seen.size);
for (const [segment, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(segment.padEnd(20), count);
console.log('Architecture errors:', errors.length, '| warnings:', warnings.length);
for (const issue of errors) console.error('ERROR', issue);
for (const issue of warnings.slice(0, 100)) console.warn('WARN', issue);
if (warnings.length > 100) console.warn('... additional warnings:', warnings.length - 100);
const report = { checkedAt: new Date().toISOString(), sitemapUrls: urls.length, uniqueUrls: seen.size, categories: Object.fromEntries(counts), navigationLinks, noncanonicalLinks, reachableSitemapUrls: urls.filter(url => reached.has(url)).length, unreachableDataLab, legacyLinkSources: [...legacyLinks].map(([source, targets]) => ({source, targets: [...targets]})), errors, warnings };
const outDir = path.join(root, 'test-results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'architecture-audit.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log('Saved test-results/architecture-audit.json');
if (errors.length) process.exitCode = 1;
