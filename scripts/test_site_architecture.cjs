'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'audit_site_architecture.cjs'), 'utf8');
const start = source.indexOf('const robotsNoindex =');
const end = source.indexOf('const seen =', start);
assert.ok(start >= 0 && end > start, 'robotsNoindex implementation must exist');
const helpers = vm.runInNewContext(source.slice(start, end) + '\n({ robotsNoindex, titleOf, descriptionOf, canonicalOf });');
const { robotsNoindex, titleOf, descriptionOf, canonicalOf } = helpers;

for (const html of [
  '<meta name="robots" content="noindex,follow">',
  '<meta content="NOINDEX, FOLLOW" name="ROBOTS">',
  '<meta name="googlebot" content="index, noindex">',
  '<meta name="googlebot" content="noindex;follow">',
  '<meta NAME=\'GoogleBot\' CONTENT=\'noindex\'>',
]) assert.equal(robotsNoindex(html), true, 'Must detect noindex: ' + html);

for (const html of [
  '<meta name="robots" content="index,follow">',
  '<meta name="googlebot" content="index">',
  '<meta name="description" content="noindex">',
  '<meta name="robots" content="noindexing">',
  '<html><head><title>Public</title></head></html>',
]) assert.equal(robotsNoindex(html), false, 'Must not misclassify: ' + html);

assert.equal(titleOf('<title>  売上 CSV   分析 ｜ OGB </title>'), '売上 CSV 分析 ｜ OGB');
assert.equal(titleOf('<html><head></head></html>'), undefined);
assert.equal(descriptionOf('<meta content="売上データを分析" name="description">'), '売上データを分析');
assert.equal(descriptionOf('<meta name="DESCRIPTION" content="集計を簡単に">'), '集計を簡単に');
assert.equal(descriptionOf('<meta name="robots" content="index">'), undefined);
assert.equal(canonicalOf('<link href="https://ogb-umalab.com/tools/" rel="canonical">'), 'https://ogb-umalab.com/tools/');
console.log('PASS: sitemap robots, canonical, title and description regression tests');
