// Dependency-free static checks for Data Lab HTML tools.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const files = [
  'tools/csv-merge/index.html',
  'tools/csv-analyzer/index.html',
  'tools/order-line-aggregate/index.html',
  'tools/order-payment-reconcile/index.html'
];
let failures = 0;
for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const allIds = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
  const ids = new Set(allIds);
  const seen = new Set();
  for (const id of allIds) {
    if (seen.has(id)) { console.error(file + ': duplicate id ' + id); failures++; }
    seen.add(id);
  }
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let checked = 0;
  for (const [, attributes, source] of scripts) {
    if (/\bsrc\s*=/.test(attributes) || /type\s*=\s*["']application\/ld\+json/.test(attributes)) continue;
    try { new vm.Script(source, { filename: file }); checked++; }
    catch (error) { console.error(file + ': ' + error.message); failures++; }
    for (const match of source.matchAll(/(?:\$|document\.getElementById)\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!ids.has(match[1])) { console.error(file + ': missing DOM id ' + match[1]); failures++; }
    }
  }
  if (!checked) { console.error(file + ': no inline JavaScript checked'); failures++; }
  else console.log('PASS', file, checked + ' script(s)');
}
if (failures) process.exitCode = 1;
