'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogb-link-audit-'));
const script = path.join(__dirname, 'audit_data_lab_links.cjs');
function write(relative, html) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
}
function run() {
  return spawnSync(process.execPath, [script], { env: { ...process.env, OGB_AUDIT_ROOT: root }, encoding: 'utf8' });
}
try {
  write('data-lab/index.html', '<a href="/tools/#calculator">Go</a><a href="/guides/intro/#example">Guide</a>');
  write('tools/index.html', '<h1 id="calculator">Calculator</h1><a href="/data-lab/">Back</a>');
  write('guides/intro/index.html', '<h2 id="example">Example</h2>');
  let result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  write('data-lab/index.html', '<a href="/tools/#not-present">Broken anchor</a>');
  result = run();
  assert.notEqual(result.status, 0, 'Broken anchor must fail');
  assert.match(result.stderr, /missing anchor/);
  write('data-lab/index.html', '<a href="/tools/missing/">Broken page</a>');
  result = run();
  assert.notEqual(result.status, 0, 'Broken page must fail');
  assert.match(result.stderr, /missing/);
  write('data-lab/index.html', '<h2 id="local">Local</h2><a href="#local">Jump</a>');
  result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  write('data-lab/index.html', '<a href="#missing">Broken same-page anchor</a>');
  result = run();
  assert.notEqual(result.status, 0, 'Broken same-page anchor must fail');
  assert.match(result.stderr, /missing anchor/);
  write('data-lab/index.html', '<h2 id="duplicate">First</h2><h3 id="duplicate">Second</h3>');
  result = run();
  assert.notEqual(result.status, 0, 'Duplicate HTML ids must fail');
  assert.match(result.stderr, /duplicate id/);
  write('data-lab/index.html', '<a class="nav" data-url="/not-real/" href="/tools/#calculator">Valid attributes</a><img alt="test" src="/assets/pixel.png">');
  write('assets/pixel.png', 'fixture');
  result = run();
  assert.equal(result.status, 0, 'Attributes and local asset must resolve: ' + result.stdout + result.stderr);
  write('data-lab/index.html', '<a href="/tools/#calculator" data-extra="/missing/">Link</a><img src="/assets/missing.png">');
  result = run();
  assert.notEqual(result.status, 0, 'Missing image asset must fail');
  assert.match(result.stderr, /missing.*missing\.png/);
  write('data-lab/index.html', '<a href="/tools/#calculator" src="/assets/missing.png">Link with unrelated src</a>');
  result = run();
  assert.equal(result.status, 0, 'Anchor src attribute must not be treated as a link: ' + result.stdout + result.stderr);
  write('data-lab/index.html', '<a href="https://example.com/#remote">External</a><a href="mailto:hello@example.com">Email</a>');
  result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  console.log('PASS: valid navigation, same-page anchors, duplicate IDs, missing files and external links');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
