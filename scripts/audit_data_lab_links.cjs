'use strict';
// Check local navigation and assets on public Data Lab, tools and guides.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sections = ['data-lab', 'tools', 'guides'];
const issues = [];
let pages = 0;
let links = 0;
function visit(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) visit(file);
    else if (item.isFile() && item.name.endsWith('.html')) check(file);
  }
}
function check(file) {
  pages++;
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const base = new URL('https://ogb-umalab.com/' + relative.replace(/index\.html$/, ''));
  for (const [, tag, raw] of html.matchAll(/<(a|img|script|link)\b[^>]*?\b(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    if (!raw || /^(?:#|mailto:|tel:|javascript:|data:|blob:)/i.test(raw)) continue;
    let url;
    try { url = new URL(raw, base); } catch { issues.push(relative + ': invalid URL ' + raw); continue; }
    if (!['ogb-umalab.com', 'www.ogb-umalab.com'].includes(url.hostname)) continue;
    links++;
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { issues.push(relative + ': invalid URL encoding ' + raw); continue; }
    const target = path.resolve(root, '.' + pathname);
    if (target !== root && !target.startsWith(root + path.sep)) { issues.push(relative + ': unsafe path ' + raw); continue; }
    const resolved = fs.existsSync(target) && fs.statSync(target).isDirectory() ? path.join(target, 'index.html') : target;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) issues.push(relative + ': missing ' + raw);
  }
}
for (const section of sections) visit(path.join(root, section));
console.log('Data Lab local link audit:', pages, 'HTML pages,', links, 'local references,', issues.length, 'issues');
for (const issue of issues.slice(0, 100)) console.error('ERROR', issue);
if (issues.length > 100) console.error('... additional issues:', issues.length - 100);
if (issues.length) process.exitCode = 1;
