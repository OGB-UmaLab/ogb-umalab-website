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

const mergeTool = read('tools/csv-merge/index.html');
check(mergeTool.includes('id="reset"'), 'CSV merge reset button missing');
check(mergeTool.includes('$("reset").onclick='), 'CSV merge reset handler missing');
check(mergeTool.includes('mergeVersion++;$("files").value=""'), 'CSV merge reset must invalidate in-flight merges');
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


const analysisGuide = read('guides/csv-analysis-hands-on/index.html');
const analyzerTool = read('tools/csv-analyzer/index.html');
check(homepage.includes('href="guides/csv-analysis-hands-on/"'), 'Homepage analysis hands-on link missing');
check(tools.includes('href="../guides/csv-analysis-hands-on/"'), 'Tools directory analysis hands-on link missing');
check(analyzerTool.includes('href="/guides/csv-analysis-hands-on/"'), 'Analyzer must link to hands-on guide');
check(sitemap.includes('<loc>https://ogb-umalab.com/guides/csv-analysis-hands-on/</loc>'), 'Analysis hands-on guide missing from sitemap');
check(analysisGuide.includes('rel="canonical" href="https://ogb-umalab.com/guides/csv-analysis-hands-on/"'), 'Analysis hands-on canonical missing');
const analysisFile='examples/csv-analysis-sales-sample.csv';
check(fs.existsSync(path.join(root,analysisFile)), 'Missing analysis exercise CSV');
check(analysisGuide.includes('href="/'+analysisFile+'"'), 'Analysis exercise download link missing');
const analysisRows=parseCSV(analysisFile);
const sales=analysisRows.map(row=>Number(row[1]));
check(analysisRows.length===10, 'Analysis exercise should have ten rows');
check(sales.every(Number.isFinite), 'Analysis exercise contains invalid sales values');
check(sales.reduce((a,b)=>a+b,0)===518000, 'Analysis sales sum mismatch');
check(sales.reduce((a,b)=>a+b,0)/sales.length===51800, 'Analysis sales mean mismatch');
check(Math.min(...sales)===25000 && Math.max(...sales)===100000, 'Analysis sales range mismatch');


// Guard the actual next-step links on each workflow tool, and the research-first homepage.
const flowLinks = [
  ['tools/csv-merge/index.html', '/tools/csv-analyzer/', '/guides/csv-merge-hands-on/'],
  ['tools/csv-analyzer/index.html', '/tools/csv-merge/', '/guides/csv-analysis-hands-on/'],
  ['tools/order-line-aggregate/index.html', '/tools/order-payment-reconcile/', '/guides/order-reconciliation-hands-on/'],
  ['tools/order-payment-reconcile/index.html', '/tools/order-line-aggregate/', '/guides/order-reconciliation-hands-on/']
];
for (const [page, next, guide] of flowLinks) {
  const html = read(page);
  check(html.includes('href="' + next + '"'), 'Missing next-step tool link: ' + page + ' -> ' + next);
  check(html.includes('href="' + guide + '"'), 'Missing workflow guide link: ' + page + ' -> ' + guide);
}
check(homepage.includes('<h1>データを整理し、<br>構造を読み解き、<br>次の検証へ。</h1>'), 'Research-first homepage headline must not be replaced by a tool advertisement');
check(homepage.indexOf('id="choose-task"') > homepage.indexOf('<section class="hero">'), 'Tool selection must follow the institute introduction');

check((homepage.match(/class="workflow-card"/g) || []).length === 3, 'Homepage must show the three complete practical workflows');
for (const href of ['guides/order-reconciliation-hands-on/', 'guides/csv-merge-hands-on/', 'guides/pricing-simulator-hands-on/']) {
  check(homepage.includes('href="' + href + '"'), 'Homepage workflow guide link missing: ' + href);
}
check(homepage.indexOf('id="workflows"') > homepage.indexOf('id="choose-task"'), 'Practical workflows must follow task choices');


check(!fs.existsSync(path.join(root, 'tools/x-richtext-test/index.html')), 'Obsolete X-format test page must stay removed');
check(!sitemap.includes('<loc>https://ogb-umalab.com/tools/x-richtext-test/</loc>'), 'Experimental X-format test must stay outside sitemap');
check(read('about/index.html').includes('<link rel="canonical" href="https://ogb-umalab.com/about/">'), 'UmaLab about canonical missing');

// Audience-first navigation and workflow continuity regression checks.
const guidesHub = read('guides/index.html');
const dataLabAbout = read('data-lab/about/index.html');
check(tools.includes('id="by-audience"'), 'Audience-based tool entry is missing');
check(tools.includes('class="quick-nav"'), 'Mobile-friendly category navigation is missing');
for (const heading of ['個人事業主・フリーランス', '店舗・小規模事業の運営', 'ネットショップ・フリマ販売', '事務・バックオフィス', 'データ分析・集計']) {
  check(tools.includes(heading), 'Missing audience category: ' + heading);
}
for (const id of ['file-tools', 'csv-tools', 'price-tools', 'analysis-tools']) {
  check(tools.includes('id="' + id + '"'), 'Missing tool section anchor: ' + id);
}
for (const slug of ['image-batch', 'pdf-split-rename', 'list-cleaner', 'csv-merge', 'csv-analyzer', 'pricing-simulator', 'order-line-aggregate', 'order-payment-reconcile']) {
  const page = read('tools/' + slug + '/index.html');
  check(page.includes('id="ogb-related-work"'), 'Workflow navigation missing from tool: ' + slug);
  check(page.includes('href="/tools/#by-audience"'), 'Audience return path missing from tool: ' + slug);
}
for (const slug of ['csv-analysis-basics', 'csv-analysis-hands-on', 'csv-merge-hands-on', 'order-payment-reconciliation', 'order-reconciliation-hands-on', 'pricing-profit-basics', 'pricing-simulator-hands-on']) {
  check(read('guides/' + slug + '/index.html').includes('id="ogb-guide-navigation"'), 'Guide navigation missing: ' + slug);
}
check(guidesHub.includes('rel="canonical" href="https://ogb-umalab.com/guides/"'), 'Guide directory canonical missing');
check(guidesHub.includes('href="../tools/"'), 'Guide directory must link to tool directory');
check(guidesHub.includes('id="workflows-title"'), 'Workflow walkthrough section missing');
check(tools.includes('href="../guides/#workflows-title"'), 'Workflow walkthrough link missing from tool hub');
for (const slug of ['image-batch', 'pricing-simulator', 'order-line-aggregate', 'order-payment-reconcile']) {
  check(guidesHub.includes('href="../tools/' + slug + '/"'), 'Network selling workflow step missing: ' + slug);
}

check(dataLabAbout.includes('新規の受託分析業務を募集するためのサービスではありません'), 'Free self-service mission missing from about page');

if (failures.length) {
  for (const failure of failures) console.error('FAIL', failure);
  process.exitCode = 1;
} else {
  console.log('PASS task navigation, guide links, sitemap, and sample CSV reconciliation fixtures');
}
