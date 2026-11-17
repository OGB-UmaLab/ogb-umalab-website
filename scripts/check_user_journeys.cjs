'use strict';
// Static acceptance checks for the public task-first navigation and CSV walkthrough.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const homepage = read('index.html');
const tools = read('tools/index.html');
const guide = read('guides/order-reconciliation-hands-on/index.html');
const sitemap = read('sitemap.xml');
const aggregate = read('tools/order-line-aggregate/index.html');
const reconcile = read('tools/order-payment-reconcile/index.html');

check(homepage.includes('id="choose-task"'), 'Homepage task section missing');
check((homepage.match(/class="task-card"/g) || []).length === 6, 'Homepage must show six task choices');
check(homepage.includes('href="#choose-task"'), 'Hero CTA must target task section');
check(homepage.includes('href="guides/order-reconciliation-hands-on/"'), 'Homepage must link to hands-on guide');
check(tools.includes('id="task-quick-title"'), 'Tools directory task navigation missing');
check(tools.includes('href="../guides/order-reconciliation-hands-on/"'), 'Tools directory hands-on guide link missing');
check(aggregate.includes('href="/guides/order-reconciliation-hands-on/"'), 'Order aggregation tool must link to walkthrough');
check(reconcile.includes('href="/guides/order-reconciliation-hands-on/"'), 'Payment reconciliation tool must link to walkthrough');
check(aggregate.includes('href="/examples/order-lines-sample.csv" download'), 'Aggregation tool must offer input CSV download');
check(reconcile.includes('href="/examples/order-totals-sample.csv" download'), 'Reconciliation tool must offer order CSV download');
check(reconcile.includes('href="/examples/payments-sample.csv" download'), 'Reconciliation tool must offer payment CSV download');
check(sitemap.includes('<loc>https://ogb-umalab.com/guides/order-reconciliation-hands-on/</loc>'), 'Hands-on guide missing from sitemap');
check(guide.includes('rel="canonical" href="https://ogb-umalab.com/guides/order-reconciliation-hands-on/"'), 'Hands-on guide canonical missing');

const expectedFiles = [
  'examples/order-lines-sample.csv',
  'examples/order-totals-sample.csv',
  'examples/payments-sample.csv'
];
for (const file of expectedFiles) {
  check(fs.existsSync(path.join(root, file)), 'Missing sample file: ' + file);
  check(guide.includes('href="/' + file + '"'), 'Missing guide download link: ' + file);
}
for (const href of [...homepage.matchAll(/<article class="task-card">[\s\S]*?<\/article>/g)].flatMap(m => [...m[0].matchAll(/href="([^"]+)"/g)].map(x => x[1]))) {
  if (href.startsWith('#') || href.includes('://')) continue;
  check(fs.existsSync(path.join(root, href, 'index.html')), 'Homepage target missing: ' + href);
}
function parseCSV(file) {
  const rows = read(file).replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => line.split(','));
  const width = rows[0].length;
  check(rows.every(row => row.length === width), 'CSV columns mismatch: ' + file);
  return rows.slice(1);
}
const lineRows = parseCSV(expectedFiles[0]);
const totalRows = parseCSV(expectedFiles[1]);
const paymentRows = parseCSV(expectedFiles[2]);
const totals = new Map();
for (const [id, amount] of lineRows) {
  const value = Number(amount);
  check(id && Number.isSafeInteger(value) && value >= 0, 'Invalid order line: ' + id);
  totals.set(id, (totals.get(id) || 0) + value);
}
const orders = new Map(totalRows.map(([id, amount]) => [id, Number(amount)]));
const payments = new Map(paymentRows.map(([id, amount]) => [id, Number(amount)]));
check(orders.size === totalRows.length && payments.size === paymentRows.length, 'Sample IDs must be unique');
check(totals.size === orders.size, 'Aggregated order count mismatch');
for (const [id, amount] of totals) check(orders.get(id) === amount, 'Sample total mismatch: ' + id);
check(orders.get('A001') === 1200 && payments.get('A001') === 1200, 'Expected matching order missing');
check(orders.get('A002') === 2500 && payments.get('A002') === 2400, 'Expected 100 yen mismatch missing');
check(orders.has('A003') && !payments.has('A003'), 'Expected order-only row missing');
check(!orders.has('A004') && payments.get('A004') === 700, 'Expected payment-only row missing');


const mergeGuide = read('guides/csv-merge-hands-on/index.html');
const mergeTool = read('tools/csv-merge/index.html');
check(homepage.includes('href="guides/csv-merge-hands-on/"'), 'Homepage must link to CSV merge walkthrough');
check(tools.includes('href="../guides/csv-merge-hands-on/"'), 'Tool directory must link to CSV merge walkthrough');
check(mergeTool.includes('href="/guides/csv-merge-hands-on/"'), 'CSV merge tool must link to walkthrough');
check(sitemap.includes('<loc>https://ogb-umalab.com/guides/csv-merge-hands-on/</loc>'), 'CSV merge walkthrough missing from sitemap');
check(mergeGuide.includes('rel="canonical" href="https://ogb-umalab.com/guides/csv-merge-hands-on/"'), 'CSV merge canonical missing');
const mergeInputs = [
  'examples/csv-merge-tokyo.csv',
  'examples/csv-merge-osaka.csv',
  'examples/csv-merge-nagoya.csv'
];
const mergedRows = [];
let mergeHeaders = [];
for (const file of mergeInputs) {
  check(fs.existsSync(path.join(root, file)), 'Missing merge exercise file: ' + file);
  check(mergeGuide.includes('href="/' + file + '"'), 'Missing merge exercise download: ' + file);
  const rows = read(file).trim().split(/\r?\n/).map(line => line.split(','));
  const headers = rows.shift();
  check(headers.length === 3 && new Set(headers).size === 3, 'Merge exercise headers invalid: ' + file);
  if (!mergeHeaders.length) mergeHeaders = headers;
  for (const row of rows) {
    check(row.length === headers.length, 'Merge exercise column count invalid: ' + file);
    mergedRows.push(Object.fromEntries(headers.map((h, i) => [h, row[i]])));
  }
}
check(mergedRows.length === 5, 'Merge exercise must contain five data rows');
check(mergedRows.reduce((sum, row) => sum + Number(row['売上']), 0) === 11000, 'Merge exercise sales total must be 11000');
const unique = new Set(mergedRows.map(row => JSON.stringify(mergeHeaders.map(h => row[h]))));
check(unique.size === 4, 'Merge exercise should have four unique rows without source filenames');


const pricingGuide = read('guides/pricing-simulator-hands-on/index.html');
const pricingTool = read('tools/pricing-simulator/index.html');
check(homepage.includes('href="guides/pricing-simulator-hands-on/"'), 'Homepage pricing hands-on link missing');
check(tools.includes('href="../guides/pricing-simulator-hands-on/"'), 'Tool directory pricing hands-on link missing');
check(pricingTool.includes('href="/guides/pricing-simulator-hands-on/"'), 'Pricing tool hands-on link missing');
check(sitemap.includes('<loc>https://ogb-umalab.com/guides/pricing-simulator-hands-on/</loc>'), 'Pricing guide missing from sitemap');
check(pricingGuide.includes('rel="canonical" href="https://ogb-umalab.com/guides/pricing-simulator-hands-on/"'), 'Pricing guide canonical missing');
const pricingCases = [
  {cost:0,fixed:5000,count:50,fee:15,flat:0,target:30000,price:824,breakEven:118,profit:30020},
  {cost:800,fixed:30000,count:150,fee:10,flat:30,target:60000,price:1589,breakEven:1145,profit:60015}
];
for (const c of pricingCases) {
  const price = Math.ceil((c.cost+c.flat+(c.fixed+c.target)/c.count)/(1-c.fee/100)-1e-10);
  const breakEven = Math.ceil((c.cost+c.flat+c.fixed/c.count)/(1-c.fee/100)-1e-10);
  const profit = price*c.count*(1-c.fee/100)-(c.cost+c.flat)*c.count-c.fixed;
  check(price===c.price && breakEven===c.breakEven && Math.abs(profit-c.profit)<1e-6, 'Pricing exercise calculation mismatch');
  check(pricingGuide.includes(c.price.toLocaleString('ja-JP')+'円'), 'Pricing guide expected price missing: '+c.price);
}
check(Math.ceil((700)/(1-0.10)-1e-10)===778, 'Digital fee comparison mismatch');
check(Math.ceil((830+900)/(1-0.10)-1e-10)===1923, 'Physical count comparison mismatch');

if (failures.length) {
  for (const failure of failures) console.error('FAIL', failure);
  process.exitCode = 1;
} else {
  console.log('PASS task navigation, guide links, sitemap, and sample CSV reconciliation fixtures');
}
