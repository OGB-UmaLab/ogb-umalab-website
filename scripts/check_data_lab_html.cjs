// Dependency-free static checks for Data Lab HTML tools.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const files = [
  'tools/csv-merge/index.html',
  'tools/csv-analyzer/index.html',
  'tools/order-line-aggregate/index.html',
  'tools/order-payment-reconcile/index.html',
  'tools/pricing-simulator/index.html'
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
// Content checks for the original reconciliation walkthrough.
const guidePath = 'guides/order-payment-reconciliation/index.html';
const guide = fs.readFileSync(path.join(root, guidePath), 'utf8');
for (const [label, pattern] of [
  ['canonical', /<link\s+rel="canonical"\s+href="https:\/\/ogb-umalab\.com\/guides\/order-payment-reconciliation\/"/],
  ['page title', /<title>[^<]+<\/title>/],
  ['primary heading', /<h1>[^<]+<\/h1>/],
  ['working tool link', /href="\/tools\/order-payment-reconcile\/"/],
  ['exception handling', /判定別の調査記録を残す/]
]) {
  if (!pattern.test(guide)) { console.error(guidePath + ': missing ' + label); failures++; }
}
if (!failures) console.log('PASS', guidePath);
const csvGuidePath = 'guides/csv-analysis-basics/index.html';
const csvGuide = fs.readFileSync(path.join(root, csvGuidePath), 'utf8');
for (const [label, pattern] of [
  ['canonical', /<link\s+rel="canonical"\s+href="https:\/\/ogb-umalab\.com\/guides\/csv-analysis-basics\/"/],
  ['tool link', /href="\.\.\/\.\.\/tools\/csv-analyzer\/"/],
  ['worked IQR example', /IQR＝15−11＝4/],
  ['outlier threshold', /上限＝15＋1\.5×4＝21/]
]) {
  if (!pattern.test(csvGuide)) { console.error(csvGuidePath + ': missing ' + label); failures++; }
}
if (!failures) console.log('PASS', csvGuidePath);
const pricingGuidePath = 'guides/pricing-profit-basics/index.html';
const pricingGuide = fs.readFileSync(path.join(root, pricingGuidePath), 'utf8');
for (const [label, pattern] of [
  ['canonical', /ogb-umalab\.com\/guides\/pricing-profit-basics\//],
  ['tool link', /href="\.\.\/\.\.\/tools\/pricing-simulator\/"/],
  ['50-sale calculation', /2,000円/],
  ['200-sale calculation', /834円/]
]) {
  if (!pattern.test(pricingGuide)) { console.error(pricingGuidePath + ': missing ' + label); failures++; }
}
if (!failures) console.log('PASS', pricingGuidePath);
if (failures) process.exitCode = 1;
