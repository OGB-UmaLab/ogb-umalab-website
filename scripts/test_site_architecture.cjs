'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'audit_site_architecture.cjs'), 'utf8');
const start = source.indexOf('const robotsNoindex =');
const end = source.indexOf('const seen =', start);
assert.ok(start >= 0 && end > start, 'robotsNoindex implementation must exist');
const robotsNoindex = vm.runInNewContext(source.slice(start, end) + '\nrobotsNoindex;');

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

console.log('PASS: sitemap robots/googlebot directive regression tests');
