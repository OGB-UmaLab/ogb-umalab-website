const { chromium } = require('playwright');
const base = 'https://ogb-umalab.com';
const toolsOnly = process.argv.includes('--tools-only');
const publicOnly = process.argv.includes('--public-only');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const http = require('http');
const local = rel => pathToFileURL(path.resolve(__dirname, '..', rel)).href;
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage();
 const errors=[];
 let ledgerOrigin=null;
 const ledgerServer=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost').pathname;let rel;if(u==='/tools/'||u==='/tools/index.html')rel='/tools/index.html';else if(/^\/tools\/business\/(?:online-selling|small-shop|freelance)\/(?:index\.html)?$/.test(u))rel=u.endsWith('/')?u+'index.html':u;else if(/^\/tools\/(?:product-ledger|daily-sales-ledger|sales-summary|cash-register-close|annual-income-summary|income-tax-simulator|resident-tax-simulator|product-listing-prep|inventory-movement|inventory-reorder|pricing-simulator|invoice-maker|receivables-report|cash-flow-planner|annual-expense-merge|expense-category-report|product-margin-report|channel-profit-report|side-income-summary|tax-reserve-planner|order-line-aggregate|order-payment-reconcile|packing-checklist|returns-refunds|purchase-receiving|stocktake-reconcile|inventory-aging|supplier-payment-reconcile|shop-sales-performance|staff-cost-planner|recipe-cost-calculator|profit-break-even|project-profit-report|business-expense-allocation|depreciation-calculator|tax-filing-check|consumption-tax-simulator|csv-merge|csv-analyzer|list-cleaner|basic-statistics|correlation|image-batch|pdf-split-rename|marketplace-profit-compare|shipping-cost-report|withholding-tax-calculator)\/(?:index\.html)?$/.test(u))rel=u.endsWith('/')?u+'index.html':u;else if(/^\/tools\/assets\/(?:tool-handoff|tax-form-draft|csv-grid-editor|result-table-controls|row-form-draft|editable-grid|save-input-grid|grid-usability|ledger-draft|data-transfer|form-draft)\.js$/.test(u))rel=u;else{res.writeHead(404);res.end();return}res.writeHead(200,{'Content-Type':rel.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.resolve(__dirname,'..','.'+rel)))});
 const waitForText=(selector,expected)=>page.waitForFunction(
  ([selector,expected])=>document.querySelector(selector)?.textContent.includes(expected),
  [selector,expected]
 );
 fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
 const test=async (testPath,fn)=>{
  // Local Data Lab scenarios run in dedicated workflows; public smoke checks
  // only deployed routes, avoiding duplicate tests and the 12-minute timeout.
  if(publicOnly && testPath.startsWith('file:')) return;
  try {
   const target=testPath===local('tools/product-ledger/index.html')?ledgerOrigin+'/tools/product-ledger/index.html':testPath.startsWith('file:')?testPath:base+testPath;
   const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
   if(target.startsWith('https:')&&(!response||response.status()!==200)) throw new Error(testPath+' HTTP '+response?.status());
   await fn();
   console.log('PASS',testPath);
  } catch(e) {
   const message=testPath+': '+String(e);
   errors.push(message);
   console.error('FAIL',message);
   try { await page.screenshot({path:path.resolve(__dirname,'../test-results/failure-'+errors.length+'.png'),fullPage:true}); } catch(_) {}
  }
 };
 try {
   await new Promise((resolve,reject)=>{ledgerServer.once('error',reject);ledgerServer.listen(0,'127.0.0.1',resolve)});ledgerOrigin='http://127.0.0.1:'+ledgerServer.address().port;
   // Batch audit of local navigation targets across every Data Lab tool and guide.
   // This runs once per workflow, without opening hundreds of pages in Chromium.
   const sections=['tools','guides','data-lab'];
   const pages=sections.flatMap(section=>{
     const root=path.resolve(__dirname,'..',section);
     const visit=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
       const file=path.join(dir,entry.name);
       return entry.isDirectory()?visit(file):entry.name==='index.html'?[file]:[];
     });
     return visit(root);
   });
   let linkCount=0;
   for(const file of pages){
     const html=fs.readFileSync(file,'utf8');
     for(const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/g)){
       const href=match[1];
       if(/^(?:#|https?:|mailto:|tel:|javascript:|data:|\/\/)/i.test(href))continue;
       const pathname=href.split(/[?#]/)[0];
       if(!pathname)continue;
       const decoded=decodeURIComponent(pathname);
       const target=decoded.startsWith('/')?path.resolve(__dirname,'..','.'+decoded):path.resolve(path.dirname(file),decoded);
       const siteRoot=path.resolve(__dirname,'..');
       if(target!==siteRoot&&!target.startsWith(siteRoot+path.sep))throw new Error('Link leaves site root: '+file+' -> '+href);
       if(!fs.existsSync(target)&&!fs.existsSync(path.join(target,'index.html')))throw new Error('Broken Data Lab link: '+path.relative(siteRoot,file)+' -> '+href);
       linkCount++;
     }
   }
   console.log('PASS Data Lab internal link audit:',pages.length,'pages,',linkCount,'links');
   await test(local('examples/pdf-split-invoice-print/index.html'),async()=>{
     const sheets=page.locator('.sheet');
     if(await sheets.count()!==3) throw new Error('PDF practice must contain three invoice sheets');
     for(const name of ['田中','佐藤','鈴木']){
       if(await sheets.filter({hasText:name}).count()!==1) throw new Error('Missing or repeated sample invoice: '+name);
     }
     if(await page.locator('button[onclick="window.print()"] ').count()!==1) throw new Error('PDF practice print button missing');
     const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
     const text=pdf.toString('latin1');
     const pageObjects=(text.match(/\/Type\s*\/Page\b/g)||[]).length;
     if(pageObjects!==3) throw new Error('PDF practice print output is not three pages: '+pageObjects);
   });
   await test(local('tools/basic-statistics/index.html'),async()=>{
     await page.locator('#values').fill('1.5,2.5');
     await page.locator('#calc-stats').click();
     if(!(await page.locator('#stats-result').innerText()).includes('中央値：2')) throw new Error('Fractional median incorrect');
     await page.locator('#values').fill('1e308,1e308');
     await page.locator('#calc-stats').click();
     if(!(await page.locator('#stats-result').innerText()).includes('正確に算出できません')) throw new Error('Extreme statistics overflow not rejected');
   });
   await test(local('tools/basic-statistics/index.html'),async()=>{
     const before=await page.locator('#stats-result').innerText();
     if(!before.includes('平均：')) throw new Error('Initial statistics unavailable');
     await page.locator('#values').fill('2,4,6');
     if(!(await page.locator('#stats-result').innerText()).includes('再計算してください')) throw new Error('Stale statistics remained after edit');
     await page.locator('#calc-stats').click();
     if(!(await page.locator('#stats-result').innerText()).includes('平均：4')) throw new Error('Statistics not recalculated');
   });
   await test(local('tools/basic-statistics/index.html'),async()=>{
     await page.locator('#csv').setInputFiles({name:'empty.csv',mimeType:'text/csv',buffer:Buffer.from('','utf8')});
     await page.waitForFunction(() => document.querySelector('#stats-result')?.textContent.includes('データ行がありません'));
     if((await page.locator('#values').inputValue()).trim()) throw new Error('Empty CSV retained stale values');
   });
   await test(local('tools/basic-statistics/index.html'),async()=>{
     await page.locator('#csv').setInputFiles({name:'uneven.csv',mimeType:'text/csv',buffer:Buffer.from('1,2\n3','utf8')});
     await page.waitForFunction(() => document.querySelector('#stats-result')?.textContent.includes('列数が一致しません'));
     if((await page.locator('#values').inputValue()).trim()) throw new Error('Malformed CSV retained previous statistics');
   });
   await test(local('tools/basic-statistics/index.html'),async()=>{
     await page.locator('#values').fill('1e308,1e308');
     await page.locator('#calc-stats').click();
     if(!(await page.locator('#stats-result').innerText()).includes('正確に算出できません')) throw new Error('Nonfinite statistics not rejected');
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     await page.locator('#demo').click();
     if(await page.locator('#output').isHidden()) throw new Error('CSV merge demo output missing');
     await page.locator('#mode').selectOption('position');
     if(!await page.locator('#output').isHidden()) throw new Error('CSV merge stale output visible after settings change');
     if(await page.locator('#metrics').locator('*').count()) throw new Error('CSV merge stale metrics retained after settings change');
   });
   await test(local('tools/profit-break-even/index.html'),async()=>{
     await page.locator('#calc-profit').click();
     if(!(await page.locator('#profit-result').innerText()).includes('利益：')) throw new Error('Initial profit result missing');
     await page.locator('#price').fill('2000');
     if(!(await page.locator('#profit-result').innerText()).includes('再計算してください')) throw new Error('Stale break-even result after edit');
     await page.locator('#calc-profit').click();
     if(!(await page.locator('#profit-result').innerText()).includes('利益：')) throw new Error('Break-even recalculation failed');
   });
   await test(local('tools/profit-break-even/index.html'),async()=>{
     await page.locator('#price').fill('');
     await page.locator('#calc-profit').click();
     if(!(await page.locator('#profit-result').innerText()).includes('入力値を確認')) throw new Error('Empty price was treated as zero');
     await page.locator('#price').fill('1980');
     await page.locator('#units').fill('1e20');
     await page.locator('#calc-profit').click();
     if(!(await page.locator('#profit-result').innerText()).includes('入力値を確認')) throw new Error('Unsafe unit count accepted');
   });
   await test(local('tools/correlation/index.html'),async()=>{
     await page.locator('#calc-corr').click();
     if(!(await page.locator('#corr-result').innerText()).includes('相関係数：')) throw new Error('Initial correlation result missing');
     await page.locator('#xs').fill('1,2,3');
     if(!(await page.locator('#corr-result').innerText()).includes('再計算してください')) throw new Error('Stale correlation after X edit');
     await page.locator('#calc-corr').click();
     await page.locator('#ys').fill('3,2,1');
     if(!(await page.locator('#corr-result').innerText()).includes('再計算してください')) throw new Error('Stale correlation after Y edit');
   });
   await test(local('tools/correlation/index.html'),async()=>{
     await page.locator('#xs').fill('1e200,2e200,3e200');
     await page.locator('#ys').fill('1e200,2e200,3e200');
     await page.locator('#calc-corr').click();
     if(!(await page.locator('#corr-result').innerText()).includes('正確に算出できません')) throw new Error('Nonfinite correlation not rejected');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#orders').setInputFiles({name:'orders.csv',mimeType:'text/csv',buffer:Buffer.from('id,amount\nA,10')});
     await page.locator('#payments').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('id,amount\nA,10')});
     await page.locator('#demo').click();
     if(await page.locator('#orders').inputValue() || await page.locator('#payments').inputValue()) throw new Error('Reconciliation demo retained selected files');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     await page.locator('#idSearch').fill('A001');
     await page.locator('#statusFilter').selectOption('');
     if(await page.locator('#exportFiltered').isDisabled()) throw new Error('ID-only filtered export button remained disabled');
     const pending=page.waitForEvent('download');
     await page.locator('#exportFiltered').click();
     const downloaded=await pending;
     const exported=require('node:fs').readFileSync(await downloaded.path(),'utf8');
     if(!exported.includes('A001')||exported.includes('A002')||exported.includes('A003')) throw new Error('Reconciliation export ignored order ID search without status');
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#file').setInputFiles({name:'orders.csv',mimeType:'text/csv',buffer:Buffer.from('id,amount\nA,10')});
     await page.locator('#demo').click();
     if(await page.locator('#file').inputValue()) throw new Error('Aggregation demo retained selected file');
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     await page.locator('#files').setInputFiles([{name:'a.csv',mimeType:'text/csv',buffer:Buffer.from('id\nA')},{name:'b.csv',mimeType:'text/csv',buffer:Buffer.from('id\nB')}]);
     await page.locator('#demo').click();
     if(await page.locator('#files').inputValue()) throw new Error('Merge demo retained selected files');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#orders').setInputFiles({name:'duplicate.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額,金額\nA001,100,200','utf8')});
     await page.locator('#payments').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\nA001,100','utf8')});
     await page.locator('#load').click();
     await waitForText('#loadStatus','同じ名前の見出し');
     if(!await page.locator('#run').isDisabled()) throw new Error('Run enabled after invalid headers');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#orders').setInputFiles({name:'orders.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\n=1+1,100\n+SUM(1),200','utf8')});
     await page.locator('#payments').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\n=1+1,100\n+SUM(1),200','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(() => document.querySelector('#run')?.disabled === false);
     await page.locator('#run').click();
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const download=await downloadPromise;
     const fs=require('node:fs');
     const saved=await download.path();
     const exported=fs.readFileSync(saved,'utf8');
     if(!exported.includes("'=1+1")||!exported.includes("'+SUM(1)")) throw new Error('Spreadsheet formula export not escaped');
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     const rows=await page.locator('#result tr').allTextContents();
     if(rows.length!==3) throw new Error('Order aggregation count incorrect');
     if(!rows.some(x=>x.includes('A001')&&x.includes('1200')&&x.includes('2'))) throw new Error('A001 aggregation incorrect');
     await page.locator('#save').click();
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     if(await page.locator('#export').isDisabled()) throw new Error('Expected demo export');
     await page.locator('#load').click();
     if(!await page.locator('#export').isDisabled()) throw new Error('Stale export after missing file');
     if(await page.locator('#results tr').count()) throw new Error('Stale rows after missing file');
     await page.locator('#demo').click();
     await page.locator('#run').click();
     if(await page.locator('#export').isDisabled()) throw new Error('Failed to recover from missing file');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     const summary=await page.locator('#summary').innerText();
     for(const status of ['一致 1件','金額不一致 1件','受注のみ 1件','決済のみ 1件','ID重複 1件']){
       if(!summary.includes(status)) throw new Error('Reconciliation missing '+status+': '+summary);
     }
     if(await page.locator('#results tr').count()!==5) throw new Error('Reconciliation result count incorrect');
     await page.locator('#export').click();
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#amtcol').selectOption('0');
     await page.locator('#run').click();
     if(!(await page.locator('#runStatus').innerText()).includes('集計エラー')) throw new Error('Same-column validation failed');
     await page.locator('#amtcol').selectOption('1');
     await page.locator('#run').click();
     if(!(await page.locator('#summary').innerText()).includes('3注文')) throw new Error('Recovery after validation error failed');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#orderAmount').selectOption('0');
     await page.locator('#run').click();
     if(!(await page.locator('#runStatus').innerText()).includes('照合エラー')) throw new Error('Same-column validation failed');
     await page.locator('#orderAmount').selectOption('1');
     await page.locator('#run').click();
     if(!(await page.locator('#summary').innerText()).includes('ID重複 1件')) throw new Error('Recovery after validation error failed');
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#file').setInputFiles({name:'lines.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,明細金額\nZ001,300\nZ001,200\nZ002,800','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(() => document.querySelector('#run')?.disabled === false);
     await page.locator('#run').click();
     const rows=await page.locator('#result tr').allTextContents();
     if(rows.length!==2||!rows.some(x=>x.includes('Z001')&&x.includes('500'))) throw new Error('Uploaded CSV aggregation failed: '+rows);
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#save').click();
     const download=await downloadPromise;
     if(download.suggestedFilename()!=='order-totals.csv') throw new Error('Wrong aggregation export filename');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#orders').setInputFiles({name:'orders.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,税込注文総額\nZ001,500\nZ002,800','utf8')});
     await page.locator('#payments').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,決済金額\nZ001,500\nZ002,700','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(() => document.querySelector('#run')?.disabled === false);
     await page.locator('#run').click();
     const summary=await page.locator('#summary').innerText();
     if(!summary.includes('一致 1件')||!summary.includes('金額不一致 1件')) throw new Error('Uploaded CSV reconciliation failed: '+summary);
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const download=await downloadPromise;
     if(download.suggestedFilename()!=='order-payment-reconciliation.csv') throw new Error('Wrong reconciliation export filename');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     if(await page.locator('#export').isDisabled()) throw new Error('Initial export not available');
     await page.locator('#orderAmount').selectOption('0');
     await page.locator('#run').click();
     if(!await page.locator('#export').isDisabled()) throw new Error('Stale reconciliation export remains enabled after error');
     if(await page.locator('#results tr').count()) throw new Error('Stale reconciliation rows remain after error');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#orders').setInputFiles({name:'orders.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\nZERO,0\nZERO2,0.00','utf8')});
     await page.locator('#payments').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\nZERO,0.00\nZERO2,0','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(() => document.querySelector('#run')?.disabled === false);
     await page.locator('#run').click();
     const summary=await page.locator('#summary').innerText();
     if(!summary.includes('一致 2件')) throw new Error('Zero-value reconciliation failed: '+summary);
     await page.locator('#demo').click();
     if((await page.locator('#excluded').innerText()).trim()) throw new Error('Stale excluded counts after demo reload');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#orders').setInputFiles({name:'orders.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\nC001,10.25\nC002,10.123','utf8')});
     await page.locator('#payments').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\nC001,10.25\nC002,10.12','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(() => document.querySelector('#run')?.disabled === false);
     await page.locator('#run').click();
     const summary=await page.locator('#summary').innerText();
     if(!summary.includes('一致 1件')||!summary.includes('金額不正 1件')) throw new Error('Cent precision validation failed: '+summary);
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     const csv='注文番号,明細金額,商品名\n"Q,001",100,"商品,特別"\n"Q,001",250,"複数行\nの商品"\nQ002,900,通常';
     await page.locator('#file').setInputFiles({name:'quoted.csv',mimeType:'text/csv',buffer:Buffer.from(csv,'utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(() => document.querySelector('#run')?.disabled === false);
     await page.locator('#run').click();
     const rows=await page.locator('#result tr').allTextContents();
     if(rows.length!==2||!rows.some(x=>x.includes('Q,001')&&x.includes('350'))) throw new Error('Quoted CSV parsing failed: '+rows);
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     const csv='注文番号,明細金額\nA001,100\n,200';
     await page.locator('#file').setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from(csv,'utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(() => document.querySelector('#run')?.disabled === false);
     await page.locator('#run').click();
     if(!(await page.locator('#runStatus').innerText()).includes('注文番号が空欄')) throw new Error('Missing order ID not rejected');
     if(!await page.locator('#save').isDisabled()) throw new Error('Invalid aggregation still exportable');
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     if(await page.locator('#save').isDisabled()) throw new Error('Demo aggregation not exportable');
     await page.locator('#file').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額,金額\nA001,100,200','utf8')});
     await page.locator('#load').click();
     await waitForText('#loadStatus','同じ名前の見出し');
     if(!await page.locator('#save').isDisabled()) throw new Error('Stale aggregation export after load failure');
     if(await page.locator('#result tr').count()) throw new Error('Stale aggregation results after load failure');
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#file').setInputFiles({name:'orders.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,明細金額\n=1+1,100\n+SUM(1),200','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(() => document.querySelector('#run')?.disabled === false);
     await page.locator('#run').click();
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#save').click();
     const download=await downloadPromise;
     const exported=fs.readFileSync(await download.path(),'utf8');
     if(!exported.includes("'=1+1")||!exported.includes("'+SUM(1)")) throw new Error('Aggregation CSV formula escaping failed');
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#file').setInputFiles({name:'refund.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,明細金額\nR001,-100','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(() => document.querySelector('#run')?.disabled === false);
     await page.locator('#run').click();
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#save').click();
     const downloaded=await downloadPromise;
     const csv=fs.readFileSync(await downloaded.path(),'utf8');
     if(!csv.includes('R001,-100,1')) throw new Error('Negative amount changed by CSV export guard');
   });
   await test(local('tools/inventory-movement/index.html'),async()=>{
     await page.locator('#sample').click();if(!(await page.locator('#result').innerText()).includes('現在庫合計：10個')||await page.locator('#rows tr').count()!==2)throw Error('Inventory movement sample');
     const dl=page.waitForEvent('download');await page.locator('#reorderTemplate').click();const csv=fs.readFileSync(await (await dl).path(),'utf8');if(!csv.includes('"A001","10","","","","","",""')||!csv.includes('"B001","0","","","","","",""'))throw Error('Inventory reorder template');
     await page.locator('#data').fill('日付,SKU,区分,数量,摘要\n2026-11-01,A,開始,1,\n2026-11-02,A,出庫,2,');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled()||!(await page.locator('#error').innerText()).includes('負になります'))throw Error('Negative inventory accepted');
     await page.locator('#data').fill('日付,SKU,区分,数量,摘要\n2026-11-01,A,入庫,2,');await page.locator('#calculate').click();if(!(await page.locator('#error').innerText()).includes('開始在庫'))throw Error('Missing initial inventory accepted');
   });
   await test(local('tools/project-profit-report/index.html'),async()=>{
     await page.locator('#sample').click();const s=await page.locator('#result').innerText();if(!s.includes('115,000円')||!s.includes('3,833円')||await page.locator('#rows tr').count()!==2)throw Error('Project profit sample');
     const dl=page.waitForEvent('download');await page.locator('#export').click();const csv=fs.readFileSync(await (await dl).path(),'utf8');if(!csv.includes('"P001","制作案件","100000","10000","90000","1500","3600"'))throw Error('Project profit CSV');
     await page.locator('#data').fill('案件ID,案件名,報酬額,直接経費,作業時間（分）\nA,赤字,10,20,0');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('算出不可'))throw Error('Zero time project');
     await page.locator('#data').fill('案件ID,案件名,報酬額,直接経費,作業時間（分）\nA,案件A,10,0,1\nA,案件B,10,0,1');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled()||!(await page.locator('#error').innerText()).includes('一致しません'))throw Error('Project mismatch accepted');
   });
   for(const slug of ['invoice-maker','business-expense-allocation']){
     await test(local('tools/'+slug+'/index.html'),async()=>{
       const key='ogb-row-draft-v1:'+slug;
       await page.evaluate(k=>localStorage.removeItem(k),key);await page.reload();
       await page.locator('#sample').click();
       if(await page.evaluate(k=>localStorage.getItem(k),key)!==null)throw Error('Unexpected autosave');
       const check=slug==='invoice-maker'?'qualified':'confirm';
       const first=slug==='invoice-maker'?'name':'category';
       await page.locator('#inputRows tr').first().locator('[data-key='+first+']').fill('保存確認');
       await page.locator('#rowDraftSave').click();
       const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
       if(saved.rows.length!==2||saved.rows[0][first]!=='保存確認'||check in saved.fields)throw Error('Row draft data');
       const dl=page.waitForEvent('download');await page.locator('#rowDraftDownload').click();const json=fs.readFileSync(await(await dl).path(),'utf8');
       await page.reload();page.once('dialog',d=>d.accept());await page.locator('#rowDraftRestore').click();
       if(await page.locator('#inputRows tr').count()!==2||await page.locator('#inputRows tr').first().locator('[data-key='+first+']').inputValue()!=='保存確認'||await page.locator('#'+check).isChecked())throw Error('Row restore');
       if(!await page.locator(slug==='invoice-maker'?'#print':'#export').isDisabled())throw Error('Stale calculation');
       await page.locator('#clear').click();page.once('dialog',d=>d.accept());await page.locator('#rowDraftFile').setInputFiles({name:'draft.json',mimeType:'application/json',buffer:Buffer.from(json)});await waitForText('#rowDraftStatus','入力を復元');
       if(await page.locator('#inputRows tr').count()!==2)throw Error('Portable draft import');
       await page.locator('#rowDraftFile').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...saved,tool:'wrong'}))});await waitForText('#rowDraftStatus','一致しません');if(await page.locator('#inputRows tr').count()!==2)throw Error('Invalid import mutated rows');
       page.once('dialog',d=>d.accept());await page.locator('#rowDraftDelete').click();if(await page.evaluate(k=>localStorage.getItem(k),key)!==null)throw Error('Row draft delete');
     });
   }
   await test(local('tools/invoice-maker/index.html'),async()=>{
     await page.locator('#sample').click();if(!(await page.locator('#result').innerText()).includes('11,218円')||await page.locator('#taxRows tr').count()!==3)throw Error('Invoice sample');
     const ok=await page.evaluate(()=>{const a=taxTotals([{tax:'10',amount:5n},{tax:'10',amount:5n}],'exclusive','floor'),b=taxTotals([{tax:'8',amount:108n}],'inclusive','floor');return a.vat===1n&&a.total===11n&&b.vat===8n&&b.total===108n});if(!ok)throw Error('Invoice rate-level rounding');
     const dl=page.waitForEvent('download');await page.locator('#receivable').click();const csv=fs.readFileSync(await(await dl).path(),'utf8');if(!csv.includes('"SAMPLE-001","2026-11-26","2026-12-31","11218","0"'))throw Error('Invoice receivable export');
     await page.locator('#qualified').check();await page.locator('#calculate').click();if(!await page.locator('#print').isDisabled())throw Error('Missing registration accepted');
     await page.locator('#registration').fill('T1234567890123');await page.locator('#calculate').click();if(!(await page.locator('#docTitle').innerText()).includes('適格請求書'))throw Error('Invoice qualified preview');
     await page.locator('#kind').selectOption('quote');await page.locator('#calculate').click();if(!await page.locator('#receivable').isDisabled()||!(await page.locator('#docTitle').innerText()).includes('見積書'))throw Error('Quote receivable enabled');
     await page.goto(local('tools/receivables-report/index.html'),{waitUntil:'domcontentloaded'});await page.locator('#asOf').fill('2026-11-26');await page.locator('#file').setInputFiles({name:'invoice.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await waitForText('#result','読み込みました');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('11,218円'))throw Error('Invoice receivable import');
   });
   for(const [slug,targets] of [['business-inventory-workflow',['product-ledger','inventory-movement','inventory-reorder']],['invoice-cashflow-workflow',['invoice-maker','receivables-report','cash-flow-planner']],['annual-tax-workflow',['annual-income-summary','income-tax-simulator','resident-tax-simulator','tax-reserve-planner']]]){
     await test(local('guides/'+slug+'/index.html'),async()=>{
       for(const target of targets)if(!await page.locator('a[href="../../tools/'+target+'/"]').count())throw Error('Workflow guide missing tool: '+target);
       if(await page.locator('main section').count()<4)throw Error('Workflow guide sections missing');
     });
   }
   await test(local('tools/index.html'),async()=>{
     const all=page.locator('#toolDirectory li');if(await all.count()!==47)throw Error('Tool directory count');
     await page.locator('#toolSearch').fill('家事按分');if(!await page.locator('#toolDirectory a[href="/tools/business-expense-allocation/"]').isVisible()||await page.locator('#toolDirectory a[href="/tools/image-batch/"]').isVisible())throw Error('Tool search match');
     await page.locator('#toolSearch').fill('ＰＤＦ');if(!await page.locator('#toolDirectory a[href="/tools/pdf-split-rename/"]').isVisible())throw Error('Tool search full-width');
     await page.locator('#toolSearch').fill('zzzz-nonexistent');if(!await page.locator('#toolSearchEmpty').isVisible())throw Error('Tool search empty');
     await page.locator('#toolSearch').fill('');if(await page.locator('#toolDirectory li:visible').count()!==47)throw Error('Tool search reset');
   });
   await test(local('tools/cash-flow-planner/index.html'),async()=>{
     const key=await page.evaluate(()=>{const k='ogb-csv-grid-draft-v1:'+location.pathname.replace(/index\.html$/,'');localStorage.removeItem(k);return k});await page.reload();
     await page.locator('#sample').click();
     if(await page.locator('#csvDraftAuto').isChecked()||await page.evaluate(k=>localStorage.getItem(k),key)!==null)throw Error('Draft must be opt-in');
     await page.locator('#opening').fill('12345');await page.locator('#csvDraftSave').click();
     await page.reload();if(await page.locator('#csvDraftAuto').isChecked()||await page.locator('#opening').inputValue()==='12345')throw Error('Draft restored automatically');
     page.once('dialog',d=>d.accept());await page.locator('#csvDraftRestore').click();
     if(await page.locator('#opening').inputValue()!=='12345'||await page.locator('#start').inputValue()!=='2026-11'||await page.locator('#csvGridRows tr').count()!==3||!await page.locator('#export').isDisabled())throw Error('Draft restore fields');
     await page.locator('#csvDraftAuto').check();await page.locator('#opening').fill('20000');
     if(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).settings.opening,key)!=='20000')throw Error('Draft autosave');
     await page.evaluate(k=>localStorage.setItem(k,'external'),key);await page.locator('#opening').fill('30000');
     if(await page.locator('#csvDraftAuto').isChecked()||await page.evaluate(k=>localStorage.getItem(k),key)!=='external')throw Error('Draft conflict');
     page.once('dialog',d=>d.accept());await page.locator('#csvDraftDelete').click();
     if(await page.evaluate(k=>localStorage.getItem(k),key)!==null||await page.locator('#opening').inputValue()!=='30000')throw Error('Draft deletion');
   });
   await test(local('tools/project-profit-report/index.html'),async()=>{
     await page.locator('#sample').click();const n=await page.locator('#csvGridRows tr').count();
     await page.locator('#csvGridFive').click();if(await page.locator('#csvGridRows tr').count()!==n+5)throw Error('Grid five rows');
     await page.locator('#csvGridTidy').click();if(await page.locator('#csvGridRows tr').count()!==n)throw Error('Grid tidy');
     await page.locator('#csvGridRows tr').first().locator('input').first().focus();await page.locator('#csvGridDuplicate').click();if(await page.locator('#csvGridRows tr').count()!==n+1||!await page.locator('#export').isDisabled())throw Error('Grid duplicate');
     await page.locator('#csvGridUndo').click();if(await page.locator('#csvGridRows tr').count()!==n)throw Error('Grid undo');
     await page.locator('#csvGridRedo').click();if(await page.locator('#csvGridRows tr').count()!==n+1)throw Error('Grid redo');
     await page.locator('#csvGridUndo').click();await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('115,000円'))throw Error('Grid undo calculation');
     await page.locator('input[aria-label="集計結果を検索"]').fill('P001');if(await page.locator('#rows tr:visible').count()!==1)throw Error('Result filter');
     await page.locator('input[aria-label="集計結果を検索"]').fill('');await page.locator('button[aria-label="差引利益で並べ替え"]').click();if(!(await page.locator('#rows tr').first().innerText()).includes('P002'))throw Error('Result ascending sort');
     const dl=page.waitForEvent('download');await page.locator('#export').click();const csv=fs.readFileSync(await(await dl).path(),'utf8');if(!csv.includes('P001')||!csv.includes('P002'))throw Error('Result filter changed export');
   });
   for(const slug of ['receivables-report','cash-flow-planner','inventory-movement','project-profit-report','staff-cost-planner','recipe-cost-calculator','shop-sales-performance']){
     await test(local('tools/'+slug+'/index.html'),async()=>{
       await page.locator('#sample').click();
       if(await page.locator('#csvGridRows tr').count()<2||await page.locator('#export').isDisabled())throw Error('Grid sample mapping: '+slug);
       const before=await page.locator('#csvGridRows tr').count();await page.locator('#csvGridAdd').click();if(await page.locator('#csvGridRows tr').count()!==before+1)throw Error('Grid add: '+slug);
       await page.locator('#csvGridRows tr').last().locator('button').click();
       if(!await page.locator('#export').isDisabled())throw Error('Grid result invalidation: '+slug);
       await page.locator('#calculate').click();if(await page.locator('#export').isDisabled())throw Error('Grid roundtrip: '+slug);
       const dl=page.waitForEvent('download');await page.locator('#csvGridSave').click();const csv=fs.readFileSync(await(await dl).path(),'utf8');
       await page.locator('#clear').click();await page.locator('#file').setInputFiles({name:'input.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await waitForText('#result','読み込みました');if(await page.locator('#csvGridRows tr').count()!==before)throw Error('Grid CSV import: '+slug);
       await page.locator('#calculate').click();if(await page.locator('#export').isDisabled())throw Error('Grid CSV calculation: '+slug);
       await page.locator('#data').fill('invalid');if(!await page.locator('#csvGridAdd').isDisabled())throw Error('Grid malformed CSV protection: '+slug);
       await page.locator('#clear').click();if(await page.locator('#csvGridAdd').isDisabled())throw Error('Grid recovery: '+slug);
     });
   }
   await test(local('tools/project-profit-report/index.html'),async()=>{
     const first=page.locator('#csvGridRows input').first();
     await first.evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','P1\t名称,補足\t１，０００\t100\t30\nP2\t案件B\t2000\t0\t60');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))});
     if(await page.locator('#csvGridRows tr').count()!==2||await page.locator('#csvGridRows tr').first().locator('input').nth(2).inputValue()!=='1000')throw Error('Excel paste normalization');
     await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('2,900円'))throw Error('Excel pasted calculation');
     if(!(await page.locator('#rows').innerText()).includes('名称,補足'))throw Error('Quoted text preservation');
   });
   await test(local('tools/recipe-cost-calculator/index.html'),async()=>{
     await page.locator('#sample').click();const s=await page.locator('#result').innerText();if(!s.includes('910円')||!s.includes('248円')||!s.includes('31.00%'))throw Error('Recipe cost sample');
     const ok=await page.evaluate(()=>ingredientCost(1200n,100000n,8000n,40000n)===600n&&ingredientCost(1n,300n,10000n,100n)===1n);if(!ok)throw Error('Recipe cost rounding');
     const dl=page.waitForEvent('download');await page.locator('#summaryExport').click();const csv=fs.readFileSync(await(await dl).path(),'utf8');if(!csv.includes('"見本ランチ","4","910","228","20","248","800","552","31.00"'))throw Error('Recipe summary CSV');
     await page.locator('#portions').fill('0');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled())throw Error('Zero servings accepted');
   });
   await test(local('tools/shop-sales-performance/index.html'),async()=>{
     await page.locator('#sample').click();const s=await page.locator('#result').innerText();if(!s.includes('140,000円')||!s.includes('1,866円')||!s.includes('100.00%')||await page.locator('#weekdayRows tr').count()!==7)throw Error('Shop sales performance sample');
     const dl=page.waitForEvent('download');await page.locator('#weekdayExport').click();const csv=fs.readFileSync(await(await dl).path(),'utf8');if(!csv.includes('"月","2","110000","55000","55","2000"'))throw Error('Shop weekday CSV');
     await page.locator('#data').fill('営業日,売上金額,客数,売上目標\n2026-11-02,1000,1,1000\n2026-11-02,1000,1,1000');if(await page.locator('#weekdayRows tr').count()!==0||!await page.locator('#export').isDisabled())throw Error('Stale shop weekday results');
     await page.locator('#calculate').click();if(!(await page.locator('#error').innerText()).includes('重複'))throw Error('Duplicate shop date accepted');
   });
   await test(local('tools/staff-cost-planner/index.html'),async()=>{
     await page.locator('#sample').click();const s=await page.locator('#result').innerText();if(!s.includes('22,350円')||!s.includes('22.35%')||await page.locator('#rows tr').count()!==2)throw Error('Staff cost sample');
     const dl=page.waitForEvent('download');await page.locator('#export').click();const csv=fs.readFileSync(await(await dl).path(),'utf8');if(!csv.includes('"2026-11","A","720","14400","500","14900"'))throw Error('Staff cost CSV');
     await page.locator('#month').fill('2026-12');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled()||!(await page.locator('#error').innerText()).includes('対象年月'))throw Error('Staff month mismatch');
   });
   await test(local('tools/receivables-report/index.html'),async()=>{
     await page.locator('#sample').click();const s=await page.locator('#result').innerText();if(!s.includes('140,000円')||!s.includes('60,000円')||!s.includes('5,000円'))throw Error('Receivables totals');
     const dl=page.waitForEvent('download');await page.locator('#forecast').click();const csv=fs.readFileSync(await (await dl).path(),'utf8');if(!csv.includes('"2026-11-26","入金","60000"')||!csv.includes('"2026-12-15","入金","80000"'))throw Error('Receivables forecast');
     await page.locator('#data').fill('取引先,請求番号,請求日,入金期限,請求額,入金済額\nA,X,2026-11-01,2026-11-20,100,0\nA,X,2026-11-01,2026-11-20,100,0');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled()||!(await page.locator('#error').innerText()).includes('重複'))throw Error('Receivables duplicate');
     await page.goto(local('tools/cash-flow-planner/index.html'),{waitUntil:'domcontentloaded'});await page.locator('#start').fill('2026-11');await page.locator('#file').setInputFiles({name:'forecast.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await waitForText('#result','読み込みました');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('140,000円'))throw Error('Receivables forecast import');
   });
   await test(local('tools/cash-flow-planner/index.html'),async()=>{
     await page.locator('#sample').click();const s=await page.locator('#result').innerText();if(!s.includes('30,000円')||!s.includes('-30,000円')||!s.includes('不足月：1か月')||await page.locator('#rows tr').count()!==12)throw Error('Cash flow sample');
     await page.locator('#start').fill('2027-01');if(!await page.locator('#export').isDisabled())throw Error('Stale cash flow');await page.locator('#calculate').click();if(!(await page.locator('#error').innerText()).includes('期間外'))throw Error('Cash flow out of range');
   });
   await test(local('tools/business/freelance/index.html'),async()=>{
     for(const slug of ['receivables-report','cash-flow-planner','annual-income-summary','income-tax-simulator','tax-reserve-planner'])if(!await page.locator('a[href="/tools/'+slug+'/"]').count())throw Error('Freelance journey missing: '+slug);
   });
   await test(local('tools/consumption-tax-simulator/index.html'),async()=>{
     await page.locator('#sample').click();const summary=await page.locator('#result').innerText();if(!summary.includes('180,000円')||!summary.includes('116,000円'))throw Error('Consumption estimate sample');
     const ok=await page.evaluate(()=>{const x=estimate(110n,108n,20n,90n);return x.output===18n&&x.general===-2n&&x.simple===1n&&x.special===3n});if(!ok)throw Error('Consumption boundary');
     await page.locator('#business').selectOption('');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled())throw Error('Missing business type accepted');
     await page.locator('#scope').uncheck();await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled())throw Error('Unconfirmed consumption scope');
   });
   await test(local('tools/withholding-tax-calculator/index.html'),async()=>{
     await page.locator('#sample').click();if(!(await page.locator('#result').innerText()).includes('10,210円')||!(await page.locator('#result').innerText()).includes('99,790円'))throw Error('Withholding sample');
     const ok=await page.evaluate(()=>withholding(0n)===0n&&withholding(1000000n)===102100n&&withholding(1000001n)===102100n&&withholding(1500000n)===204200n);if(!ok)throw Error('Withholding boundary');
     await page.locator('#mode').selectOption('both');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('11,231円'))throw Error('Withholding tax included');
     await page.locator('#mode').selectOption('included');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled())throw Error('Double VAT accepted');
   });
   await test(local('tools/tax-filing-check/index.html'),async()=>{
     await page.locator('#sample').click();if(!(await page.locator('#result').innerText()).includes('条件内'))throw Error('Filing threshold 200000');
     await page.locator('#other').fill('200001');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('20万円超'))throw Error('Filing threshold 200001');
     await page.locator('#voluntary').check();await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('別途申告'))throw Error('Filing voluntary');
     await page.locator('#voluntary').uncheck();await page.locator('#salary').fill('20000001');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('2,000万円'))throw Error('Filing salary threshold');
     await page.locator('#scope').uncheck();await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('個別確認'))throw Error('Filing unsupported');
   });
   await test(local('tools/tax-reserve-planner/index.html'),async()=>{
     await page.locator('#sample').click();if(!(await page.locator('#result').innerText()).includes('120,000円'))throw Error('Reserve sample');
     await page.locator('#months').fill('0');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled())throw Error('Reserve invalid months');
     await page.locator('#months').fill('3');page.once('dialog',d=>d.accept());await page.locator('#taxFile').setInputFiles({name:'tax.csv',mimeType:'text/csv',buffer:Buffer.from('対象年,項目,金額\n2026,納付・還付見込額（負は還付）,-50000')});await waitForText('#importStatus','反映しました');if(await page.locator('#incomeTax').inputValue()!=='0')throw Error('Reserve refund input');
     page.once('dialog',d=>d.accept());await page.locator('#residentFile').setInputFiles({name:'resident.csv',mimeType:'text/csv',buffer:Buffer.from('課税年度,所得対象年,項目,金額\n2027,2026,年間税額合計,344500')});await page.waitForFunction(()=>document.querySelector('#residentTax').value==='344500');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('74,834円'))throw Error('Reserve imported amount rounding');
     await page.locator('#covered').fill('400000');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled())throw Error('Reserve invalid covered amount');
   });
   await test(local('tools/depreciation-calculator/index.html'),async()=>{
     await page.locator('#sample').click();if(!(await page.locator('#result').innerText()).includes('60,000円'))throw Error('Depreciation sample');
     const v=await page.evaluate(()=>{const a=depreciation(1000000n,100000n,100n,12n),b=depreciation(100001n,100001n,167n,1n),c=depreciation(100000n,1n,250n,12n);return a.amount===99999n&&a.end===1n&&b.amount===1392n&&c.amount===0n});if(!v)throw Error('Depreciation boundaries');
     const dl=page.waitForEvent('download');await page.locator('#expenseExport').click();const csv=fs.readFileSync(await (await dl).path(),'utf8');if(!csv.includes('"減価償却費","1","60000"'))throw Error('Depreciation CSV');
     await page.locator('#months').fill('7');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled())throw Error('Depreciation invalid month accepted');
     await page.goto(local('tools/annual-income-summary/index.html'),{waitUntil:'domcontentloaded'});await page.locator('#file').setInputFiles({name:'expense.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.locator('#preview').waitFor({state:'visible'});await page.locator('#expenseOptions input').check();await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#expenses').inputValue()!=='60000')throw Error('Depreciation annual CSV');
   });
   await test(local('tools/side-income-summary/index.html'),async()=>{
     await page.locator('#sample').click();if(!(await page.locator('#result').innerText()).includes('3,550,000円'))throw Error('Side income sample');
     const v=await page.evaluate(()=>{const a=summarize(10n,20n,500000n,0n,100n),b=summarize(0n,0n,500001n,0n,0n),c=summarize(0n,0n,500002n,0n,0n);return a.total===100n&&a.misc===-10n&&b.tempIncluded===0n&&c.tempIncluded===1n});if(!v)throw Error('Side income boundaries');
     const dl=page.waitForEvent('download');await page.locator('#export').click();const csv=fs.readFileSync(await (await dl).path(),'utf8');if(!csv.includes('2026,その他総合課税所得,3550000'))throw Error('Side income CSV');
     await page.locator('#tempExpense').fill('1000000');await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled())throw Error('Unsupported temporary loss accepted');
     await page.goto(local('tools/income-tax-simulator/index.html'),{waitUntil:'domcontentloaded'});page.once('dialog',d=>d.accept());await page.locator('#sideFile').setInputFiles({name:'side.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await waitForText('#sideStatus','反映しました');if(await page.locator('#other').inputValue()!=='3550000')throw Error('Side income tax import');
   });
   await test(local('tools/resident-tax-simulator/index.html'),async()=>{
     const core=await page.evaluate(()=>{
       const eq=(a,b,m)=>{if(a!==b)throw Error(m+': '+String(a)+' != '+String(b))};
       for(const [a,b] of [[24000000n,430000n],[24000001n,290000n],[24500000n,290000n],[24500001n,150000n],[25000000n,150000n],[25000001n,0n]])eq(basic(a),b,'Resident basic boundary');
       eq(tokyoExemption(450000n,0n,'none').flatTaxable,false,'Single exemption');eq(tokyoExemption(450001n,0n,'none').incomeTaxable,true,'Single threshold');
       eq(tokyoExemption(1010000n,1n,'none').flatTaxable,false,'Dependent exemption');eq(tokyoExemption(1010001n,1n,'none').flatTaxable,true,'Dependent flat threshold');eq(tokyoExemption(1120000n,1n,'none').incomeTaxable,false,'Dependent income threshold');eq(tokyoExemption(1120001n,1n,'none').incomeTaxable,true,'Dependent income above threshold');eq(tokyoExemption(1350000n,0n,'protected').forestTaxable,false,'Special exemption');
       const input={income:4350000n,social:500000n,deductions:0n,humanDiff:0n,cityRate:600n,prefRate:400n,cityFlat:3000n,prefFlat:1000n,cityCredit:0n,prefCredit:0n,incomeTaxable:true,flatTaxable:true,forestTaxable:true};
       const v=compute(input);eq(v.taxable,3420000n,'Resident taxable');eq(v.cityAdj,1500n,'City adjustment');eq(v.prefAdj,1000n,'Pref adjustment');eq(v.total,344500n,'Resident annual');
       const x=compute({...input,income:25000001n});eq(x.cityAdj,0n,'High income no adjustment');
       const d=compute({...input,designated:true,cityRate:800n,prefRate:200n});eq(d.cityAdj,2000n,'Designated city adjustment');eq(d.prefAdj,500n,'Designated prefecture adjustment');eq(d.total,344500n,'Designated standard annual');return true;
     });if(!core)throw Error('Resident core tests');
     await page.locator('#sample').click();if(!(await page.locator('#result').innerText()).includes('344,500円'))throw Error('Resident sample');
     const dl=page.waitForEvent('download');await page.locator('#export').click();if(!fs.readFileSync(await (await dl).path(),'utf8').includes('2027,2026,年間税額合計,344500'))throw Error('Resident CSV export');
     await page.locator('#income').fill('450000');if(!await page.locator('#export').isDisabled())throw Error('Stale resident result');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('年間合計：0円'))throw Error('Resident exemption result');
     await page.locator('#file').setInputFiles({name:'income.csv',mimeType:'text/csv',buffer:Buffer.from('対象年,項目,金額\n2026,合計所得金額（概算）,4350000\n2026,社会保険料控除,500000')});await page.locator('#preview').waitFor({state:'visible'});await page.locator('#apply').click();if(await page.locator('#income').inputValue()!=='4350000'||await page.locator('#social').inputValue()!=='500000')throw Error('Resident tax import');
     await page.locator('#mode').selectOption('designated');await page.locator('#scope').check();await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled())throw Error('Unconfirmed local exemptions accepted');
     for(const id of ['incomeStatus','flatStatus','forestStatus'])await page.locator('#'+id).selectOption('yes');
     await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('344,500円'))throw Error('Resident designated city result');
   });
   await test(local('tools/business-expense-allocation/index.html'),async()=>{
     await page.locator('#sample').click();
     if(!(await page.locator('#result').innerText()).includes('348,000円')||await page.locator('#rows tr').count()!==2)throw Error('Allocation sample incorrect');
     const dl=page.waitForEvent('download');await page.locator('#expenseExport').click();const csv=fs.readFileSync(await (await dl).path(),'utf8');
     if(!csv.includes('"地代家賃","1","300000"')||!csv.includes('"通信費","1","48000"'))throw Error('Allocation export incorrect');
     const first=page.locator('#inputRows tr').first();await first.locator('[data-key=used]').fill('81');if(!await page.locator('#export').isDisabled())throw Error('Stale allocation result');
     await page.locator('#calculate').click();if(!await page.locator('#expenseExport').isDisabled()||!(await page.locator('#error').innerText()).includes('全体量'))throw Error('Invalid allocation accepted');
     await first.locator('[data-key=used]').fill('0');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('事業分：48,000円'))throw Error('Zero allocation incorrect');
     const exact=await page.evaluate(()=>{const a=allocate(100n,1n,3n),b=allocate(100n,3n,3n);return a.business===33n&&a.privateAmount===67n&&a.ratio==='33.33'&&b.business===100n});if(!exact)throw Error('Allocation boundaries');
     await page.goto(local('tools/annual-income-summary/index.html'),{waitUntil:'domcontentloaded'});
     await page.locator('#file').setInputFiles({name:'expense.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.locator('#preview').waitFor({state:'visible'});await page.locator('#expenseOptions input').first().check();await page.locator('#expenseOptions input').nth(1).check();await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#expenses').inputValue()!=='348000')throw Error('Allocation annual CSV integration');
   });
   await test(local('tools/income-tax-simulator/index.html'),async()=>{
     const verify=await page.evaluate(()=>{
       const eq=(a,b,m)=>{if(a!==b)throw Error(m+': '+String(a)+' != '+String(b))};
       for(const [n,b] of [[0n,1040000n],[4890000n,1040000n],[4890001n,670000n],[6550000n,670000n],[6550001n,620000n],[23500000n,620000n],[23500001n,480000n],[24000000n,480000n],[24000001n,320000n],[24500000n,320000n],[24500001n,160000n],[25000000n,160000n],[25000001n,0n]])eq(basic(n),b,'Basic deduction boundary');
       for(const [taxable,tax] of [[1949000n,97450n],[1950000n,97500n],[3299000n,232400n],[3300000n,232500n],[6949000n,962300n],[6950000n,962500n],[8999000n,1433770n],[9000000n,1434000n],[17999000n,4403670n],[18000000n,4404000n],[39999000n,13203600n],[40000000n,13204000n]]){
         const income=taxable+2000000n;const x=compute(income,0n,0n,2000000n-basic(income),0n);eq(x.tax,tax,'Bracket boundary');eq(x.reconstruction,tax*21n/1000n,'Reconstruction');
       }
       const v=compute(9000000n,0n,1380000n,0n,0n);eq(v.taxable,7000000n,'NTA example taxable');eq(v.tax,974000n,'NTA example tax');eq(v.reconstruction,20454n,'NTA example reconstruction');
       eq(compute(100000n,0n,0n,0n,650000n).applied,100000n,'Blue cap');
       eq(compute(-100000n,0n,0n,0n,650000n).applied,0n,'Loss cap');
       eq(compute(1040999n,0n,0n,0n,0n).taxable,0n,'Taxable rounding');
       eq(compute(2000000n,0n,0n,0n,0n,0n,100000n).settlement,-50992n,'Refund');
       return true;
     });if(!verify)throw Error('Income tax core checks failed');
     await page.locator('#sample').click();
     if(!(await page.locator('#result').innerText()).includes('187,353円')||await page.locator('#compareRows tr').count()!==4)throw Error('Tax sample incorrect');
     const dl=page.waitForEvent('download');await page.locator('#export').click();
     if(!fs.readFileSync(await (await dl).path(),'utf8').includes('2026,復興特別所得税,3853'))throw Error('Tax CSV incorrect');
     await page.locator('#business').fill('100000');if(!await page.locator('#export').isDisabled())throw Error('Stale tax result');
     await page.locator('#file').setInputFiles({name:'annual.csv',mimeType:'text/csv',buffer:Buffer.from('\uFEFF対象年,項目,金額\r\n2026,青色申告特別控除前所得,1300000')});
     await page.locator('#preview').waitFor({state:'visible'});await page.locator('#apply').click();
     if(await page.locator('#business').inputValue()!=='1300000')throw Error('Tax annual import mismatch');
     await page.locator('#file').setInputFiles({name:'wrong.csv',mimeType:'text/csv',buffer:Buffer.from('対象年,項目,金額\n2025,青色申告特別控除前所得,90000')});
     await waitForText('#importError','年度');if(await page.locator('#business').inputValue()!=='1300000')throw Error('Wrong year changed tax input');
     await page.locator('#business').fill('-100');await page.locator('#other').fill('1000');await page.locator('#calculate').click();
     if(!await page.locator('#export').isDisabled()||!(await page.locator('#error').innerText()).includes('損益通算'))throw Error('Unsupported loss accepted');
     await page.locator('#clear').click();await page.locator('#calculate').click();
     if(!await page.locator('#export').isDisabled())throw Error('Tax scope unchecked');
   });
   for(const [slug,field,expected] of [['annual-income-summary','sales','3000000'],['income-tax-simulator','business','5000000'],['resident-tax-simulator','income','4350000'],['side-income-summary','miscRevenue','500000'],['tax-filing-check','salary','5000000'],['tax-reserve-planner','incomeTax','180000'],['consumption-tax-simulator','sales10','5500000'],['withholding-tax-calculator','fee','100000'],['depreciation-calculator','cost','480000']]){
     await test(local('tools/'+slug+'/index.html'),async()=>{
       const key=await page.evaluate(()=>{const k='ogb-tax-form-draft-2026-v1:'+location.pathname.replace(/index\.html$/,'');localStorage.removeItem(k);return k});await page.reload();
       await page.locator('#sample').click();
       if(await page.evaluate(k=>localStorage.getItem(k),key)!==null)throw Error('Tax draft auto save: '+slug);
       if(slug==='resident-tax-simulator'){await page.locator('#mode').selectOption('designated');await page.locator('#cityRate').fill('8.2');await page.locator('#incomeStatus').selectOption('yes');await page.locator('#flatStatus').selectOption('yes');await page.locator('#forestStatus').selectOption('yes')}
       if(slug==='annual-income-summary'){await page.locator('#costMode').selectOption('direct');await page.locator('#goods').fill('1234')}
       await page.locator('#taxDraftSave').click();
       const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(saved.fields[field]!==expected||'scope' in saved.fields)throw Error('Tax draft stored fields: '+slug);
       await page.reload();if(await page.locator('#'+field).inputValue()===expected)throw Error('Tax draft auto restore: '+slug);
       page.once('dialog',d=>d.accept());await page.locator('#taxDraftRestore').click();
       if(await page.locator('#'+field).inputValue()!==expected||await page.locator('main input[type=checkbox]:checked').count()!==0)throw Error('Tax draft restore: '+slug);
       if(await page.locator('#export').count()&&!await page.locator('#export').isDisabled())throw Error('Stale tax export: '+slug);
       if(slug==='resident-tax-simulator'&&(await page.locator('#mode').inputValue()!=='designated'||!await page.locator('#localFields').isVisible()||await page.locator('#cityRate').inputValue()!=='8.2'||await page.locator('#incomeStatus').inputValue()!=='yes'))throw Error('Resident draft settings lost');
       if(slug==='annual-income-summary'&&(!await page.locator('#direct').isVisible()||await page.locator('#goods').inputValue()!=='1234'))throw Error('Annual draft direct cost lost');
       page.once('dialog',d=>d.accept());await page.locator('#taxDraftDelete').click();if(await page.evaluate(k=>localStorage.getItem(k),key)!==null||await page.locator('#'+field).inputValue()!==expected)throw Error('Tax draft delete: '+slug);
     });
   }
   await test(local('tools/annual-expense-merge/index.html'),async()=>{
     const header='経費科目,取引件数,支出金額\n',a=header+'通信費,2,12000\n広告費,1,2000',b=header+'通信費,1,4000\n減価償却費,1,60000',c=header+'広告費,1,2000\n通信費,2,12000';
     await page.locator('#file').setInputFiles([a,b,c].map((v,i)=>({name:'expense'+i+'.csv',mimeType:'text/csv',buffer:Buffer.from(v)})));await waitForText('#status','3ファイル');
     if(await page.locator('#sources input:checked').count()!==2)throw Error('Duplicate expense default selection');
     await page.locator('#sources input').nth(2).check();await page.locator('#confirm').check();await page.locator('#calculate').click();if(!await page.locator('#export').isDisabled()||!(await page.locator('#error').innerText()).includes('重複'))throw Error('Duplicate expense accepted');
     await page.locator('#sources input').nth(2).uncheck();await page.locator('#confirm').check();await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('78,000円'))throw Error('Expense merge total');
     const dl=page.waitForEvent('download');await page.locator('#export').click();const csv=fs.readFileSync(await(await dl).path(),'utf8');if(!csv.includes('"通信費","3","16000"'))throw Error('Expense merge CSV');
     await page.goto(local('tools/annual-income-summary/index.html'),{waitUntil:'domcontentloaded'});await page.locator('#file').setInputFiles({name:'merged.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.locator('#preview').waitFor({state:'visible'});for(const c of await page.locator('#expenseOptions input').all())await c.check();await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#expenses').inputValue()!=='78000')throw Error('Merged annual expense import');
   });
   await test(local('tools/annual-income-summary/index.html'),async()=>{
     const fill=async(id,v)=>page.locator('#'+id).fill(String(v));
     const calc=async()=>page.locator('#calculate').click();
     const expectResult=async(v)=>{if(!(await page.locator('#result').innerText()).includes(v))throw Error('Annual result mismatch: '+v)};
     const importCSV=async(csv,expense=false)=>{
       await page.locator('#file').setInputFiles({name:'annual.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
       await page.locator('#preview').waitFor({state:'visible'});
       if(!await page.locator('#apply').isDisabled())throw Error('Annual import lacked confirmation');
       if(expense)await page.locator('#expenseOptions input').first().check();
       await page.locator('#confirmPeriod').check();await page.locator('#apply').click();
     };
     await page.locator('#sample').click();await expectResult('1,300,000円');
     const dl=page.waitForEvent('download');await page.locator('#export').click();
     if(!fs.readFileSync(await (await dl).path(),'utf8').includes('2026,青色申告特別控除前所得,1300000'))throw Error('Annual CSV mismatch');
     await fill('closing',2000000);if(!await page.locator('#export').isDisabled())throw Error('Stale annual result');
     await calc();if(!await page.locator('#export').isDisabled()||!(await page.locator('#error').innerText()).includes('期末棚卸'))throw Error('Invalid inventory accepted');
     await page.locator('#clear').click();await fill('expenses',100);await calc();await expectResult('-100円');
     await page.locator('#clear').click();
     await importCSV('営業日,決済方法,売上金額,摘要\n2026-01-02,現金,1000,"a,b"\n2026-01-03,カード,2000,');
     if(await page.locator('#sales').inputValue()!=='3000')throw Error('Daily CSV mapping');
     await importCSV('対象月,現金,カード,QR決済,その他,合計\n2026-01,2000,3000,0,0,5000');
     if(await page.locator('#sales').inputValue()!=='5000')throw Error('Monthly replacement');
     await importCSV('SKU,販売数量,売上,商品原価,販売手数料,送料,利益,利益率（%）\nA,1,10000,4000,1000,500,4500,45');
     await calc();await expectResult('4,500円');
     await importCSV('販売チャネル,取引行数,売上,原価,手数料,送料,利益,利益率（%）\nX,1,20000,8000,2000,1000,9000,45');
     await importCSV('経費科目,取引件数,支出金額\n広告費,1,3000\n送料,1,1000',true);
     await calc();await expectResult('6,000円');
     await page.locator('#file').setInputFiles({name:'wrong-year.csv',mimeType:'text/csv',buffer:Buffer.from('営業日,決済方法,売上金額,摘要\n2025-01-01,現金,1000,')});
     await waitForText('#importError','2026年分以外');if(await page.locator('#sales').inputValue()!=='20000')throw Error('Invalid annual import mutated sales');
     await fill('sales','9007199254740992');await calc();if(!await page.locator('#export').isDisabled())throw Error('Unsafe annual value accepted');
   });
   await test(local('tools/product-ledger/index.html'),async()=>{
     await page.evaluate(()=>localStorage.removeItem('ogb-product-ledger-v1'));await page.reload();
     await page.locator('#sku').fill('EXISTING');await page.locator('#name').fill('Existing product');await page.locator('#cost').fill('400');await page.locator('#save').click();
     const prep='SKU,商品名,文字数,確認\nNEW-001,新商品,3,確認済み';
     page.once('dialog',d=>d.accept());await page.locator('#prepFile').setInputFiles({name:'prep.csv',mimeType:'text/csv',buffer:Buffer.from(prep)});await waitForText('#status','1商品を追加');if(await page.locator('#rows tr').count()!==2)throw Error('Product preparation import failed');
     await page.locator('#prepFile').setInputFiles({name:'duplicate.csv',mimeType:'text/csv',buffer:Buffer.from(prep+'\nNEW-002,別商品,3,確認済み')});await waitForText('#status','重複');if(await page.locator('#rows tr').count()!==2)throw Error('Duplicate preparation changed ledger');
     for(const [id,expected] of [['inventoryTemplate','"EXISTING","","","","","","",""'],['pricingTemplate','"EXISTING","400","","","","",""'],['movementTemplate','"","EXISTING","開始","",""']]){
       const dl=page.waitForEvent('download');await page.locator('#'+id).click();const csv=fs.readFileSync(await (await dl).path(),'utf8');if(!csv.includes(expected))throw Error('Ledger template failed: '+id);
     }
     await page.evaluate(()=>localStorage.setItem('ogb-product-ledger-v1',JSON.stringify([['OTHER','Other','','','','準備中']])));await page.locator('#sku').fill('CONFLICT');await page.locator('#name').fill('Conflict');await page.locator('#save').click();await waitForText('#status','別の画面');const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ogb-product-ledger-v1')));if(stored.length!==1||stored[0][0]!=='OTHER')throw Error('Ledger overwrote concurrent change');await page.evaluate(()=>localStorage.removeItem('ogb-product-ledger-v1'));
   });
   await test(local('tools/product-ledger/index.html'),async()=>{
     await page.evaluate(()=>localStorage.removeItem('ogb-product-ledger-v1'));
     await page.reload();
     await page.locator('#sku').fill('TEST-001');
     await page.locator('#name').fill('Test product');
     await page.locator('#cost').fill('400');
     await page.locator('#price').fill('1000');
     await page.locator('#save').click();
     if(await page.locator('#rows tr').count()!==1)throw new Error('Ledger registration failed');
     const savedBeforeReload=await page.evaluate(()=>JSON.parse(localStorage.getItem('ogb-product-ledger-v1')));if(savedBeforeReload?.length!==1||savedBeforeReload[0][0]!=='TEST-001')throw Error('Ledger storage write failed');
     await page.reload();
     await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===1&&document.querySelector('#rows tr').textContent.includes('TEST-001'));
     const savedAfterReload=await page.evaluate(()=>JSON.parse(localStorage.getItem('ogb-product-ledger-v1')));if(JSON.stringify(savedAfterReload)!==JSON.stringify(savedBeforeReload))throw Error('Ledger persistence failed');
     await page.locator('#rows button').first().click();
     await page.locator('#state').selectOption('出品中');
     await page.locator('#save').click();
     await page.locator('#filter').selectOption('準備中');
     if(await page.locator('#rows tr').count())throw new Error('Ledger filter failed');
     await page.locator('#filter').selectOption('出品中');
     if(await page.locator('#rows tr').count()!==1)throw new Error('Ledger edit failed');
     await page.locator('#sku').fill('TEST-001');
     await page.locator('#name').fill('Duplicate');
     await page.locator('#save').click();
     if(await page.locator('#rows tr').count()!==1||!(await page.locator('#status').innerText()).includes('重複'))throw new Error('Ledger duplicate accepted');
     const dl=page.waitForEvent('download');await page.locator('#export').click();
     const csv=fs.readFileSync(await (await dl).path(),'utf8');
     if(!csv.includes('"TEST-001","Test product","400","1000","","出品中"'))throw new Error('Ledger export incorrect');
     await page.evaluate(()=>localStorage.removeItem('ogb-product-ledger-v1'));
     await page.reload();
     await page.locator('#file').setInputFiles({name:'ledger.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
     await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===1);
     await page.evaluate(()=>localStorage.removeItem('ogb-product-ledger-v1'));
   });
   await test(local('tools/pricing-simulator/index.html'),async()=>{
     await page.locator('#calculate').click();
     if(await page.locator('#copyResult').isDisabled()) throw new Error('Valid pricing result not copyable');
     if(!(await page.locator('#result').innerText()).includes('1,223円')) throw new Error('Pricing default calculation incorrect');
     await page.locator('#fee').fill('100');
     if(!await page.locator('#copyResult').isDisabled()) throw new Error('Stale pricing result copyable after input change');
     await page.locator('#calculate').click();
     if(!await page.locator('#copyResult').isDisabled()) throw new Error('Invalid pricing result copyable');
     if(await page.locator('#comparison tr').count()) throw new Error('Stale pricing comparison after impossible fee');
     await page.locator('#fee').fill('10');
     await page.locator('#count').fill('0');
     await page.locator('#calculate').click();
     if(!await page.locator('#copyResult').isDisabled()) throw new Error('Invalid sales count copyable');
     await page.locator('#count').fill('100');
     await page.locator('#calculate').click();
     if(await page.locator('#copyResult').isDisabled()) throw new Error('Pricing result did not recover');
     await page.locator('#bulkSample').click();
     if(await page.locator('#bulkRows tr').count()!==2||await page.locator('#bulkRows tr').first().locator('td').nth(1).innerText()!=='1223'||await page.locator('#bulkRows tr').nth(1).locator('td').nth(1).innerText()!=='1063')throw new Error('Bulk pricing sample incorrect');
     const bulkDownload=page.waitForEvent('download');
     await page.locator('#bulkExport').click();
     const bulk=fs.readFileSync(await (await bulkDownload).path(),'utf8');
     if(!bulk.includes('"ITEM-001","1223","667"'))throw new Error('Bulk pricing CSV incorrect');
     await page.locator('#bulkInput').fill('A,1,0,1,100,0,0');
     await page.locator('#bulkCalc').click();
     if(!await page.locator('#bulkExport').isDisabled()||await page.locator('#bulkRows tr').count())throw new Error('Invalid bulk pricing export enabled');
     await page.locator('#bulkFile').setInputFiles({name:'prices.csv',mimeType:'text/csv',buffer:Buffer.from('SKU,原価,月間固定費,月間販売数,手数料率,固定手数料,目標月間利益\n0001,90,0,1,10,0,0')});
     await page.waitForFunction(()=>document.querySelector('#bulkRows tr'));
     if(await page.locator('#bulkRows tr').first().locator('td').nth(1).innerText()!=='100')throw new Error('Bulk pricing exact boundary incorrect');

   });
   // Empty separator lines in exported CSVs are harmless; incomplete data rows are not.
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#file').setInputFiles({name:'blank-lines.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,明細金額\n\nB001,100\n\nB001,200\n\n','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
     await page.locator('#run').click();
     if(!(await page.locator('#summary').innerText()).includes('2明細行 → 1注文')) throw new Error('Blank CSV lines affected order aggregation');
     await page.locator('#file').setInputFiles({name:'missing-id.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,明細金額\n,100\n','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
     await page.locator('#run').click();
     if(!(await page.locator('#runStatus').innerText()).includes('注文番号が空欄')) throw new Error('Incomplete order row was silently ignored');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#orders').setInputFiles({name:'orders.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\n\nB001,300\n\n','utf8')});
     await page.locator('#payments').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\n\nB001,300\n\n','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
     await page.locator('#run').click();
     if(!(await page.locator('#summary').innerText()).includes('一致 1件')) throw new Error('Blank CSV lines affected reconciliation');
     await page.locator('#orders').setInputFiles({name:'missing-id.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\n,300\n','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
     await page.locator('#run').click();
     if(!(await page.locator('#excluded').innerText()).includes('受注 1行')) throw new Error('Incomplete order row was silently ignored rather than counted');
   });
   // Changing the decoding charset requires reloading, not exporting the previously decoded data.
   for(const tool of [
     {page:'tools/order-line-aggregate/index.html',save:'#save'},
     {page:'tools/order-payment-reconcile/index.html',save:'#export'}
   ]){
     await test(local(tool.page),async()=>{
       await page.locator('#demo').click();
       await page.locator('#run').click();
       if(await page.locator(tool.save).isDisabled()) throw new Error('Demo result missing');
       await page.locator('#encoding').selectOption('shift_jis');
       if(!await page.locator(tool.save).isDisabled()||!await page.locator('#run').isDisabled()) throw new Error('Stale export remained after encoding change');
     });
   }
   // A newly selected file must invalidate the old export even before the user presses Load.
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     await page.locator('#file').setInputFiles({name:'new.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,明細金額\nN001,100','utf8')});
     if(!await page.locator('#save').isDisabled()||!await page.locator('#run').isDisabled()||await page.locator('#result tr').count()) throw new Error('Old aggregation still available after selecting new CSV');
     await page.locator('#load').click();
     await page.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
     await page.locator('#run').click();
     if(await page.locator('#save').isDisabled()) throw new Error('New aggregation did not become available');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     await page.locator('#orders').setInputFiles({name:'new-orders.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\nN001,100','utf8')});
     if(!await page.locator('#export').isDisabled()||!await page.locator('#run').isDisabled()||await page.locator('#results tr').count()) throw new Error('Old reconciliation still available after selecting new CSV');
     await page.locator('#payments').setInputFiles({name:'new-payments.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\nN001,100','utf8')});
     await page.locator('#load').click();
     await page.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
     await page.locator('#run').click();
     if(await page.locator('#export').isDisabled()) throw new Error('New reconciliation did not become available');
   });
   // Changing an ID, amount, or whitespace option must invalidate prior downloadable results.
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     if(await page.locator('#save').isDisabled()) throw new Error('Initial aggregation unavailable');
     await page.locator('#trim').uncheck();
     if(!await page.locator('#save').isDisabled() || await page.locator('#result tr').count()) throw new Error('Old aggregation remained after option change');
     await page.locator('#run').click();
     if(await page.locator('#save').isDisabled()) throw new Error('Aggregation did not recover after option change');
     await page.locator('#amtcol').selectOption('0');
     if(!await page.locator('#save').isDisabled() || await page.locator('#result tr').count()) throw new Error('Old aggregation remained after amount column change');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     if(await page.locator('#export').isDisabled()) throw new Error('Initial reconciliation unavailable');
     await page.locator('#trim').uncheck();
     if(!await page.locator('#export').isDisabled() || await page.locator('#results tr').count()) throw new Error('Old reconciliation remained after whitespace option change');
     await page.locator('#run').click();
     if(await page.locator('#export').isDisabled()) throw new Error('Reconciliation did not recover after option change');
     await page.locator('#paymentAmount').selectOption('0');
     if(!await page.locator('#export').isDisabled() || await page.locator('#results tr').count()) throw new Error('Old reconciliation remained after amount column change');
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     const csv='ID,金額\n'+Array.from({length:50000},(_,i)=>'R'+i+',1').join('\n');
     const buffer=Buffer.from(csv,'utf8');
     await page.locator('#files').setInputFiles([
       {name:'large-a.csv',mimeType:'text/csv',buffer},
       {name:'large-b.csv',mimeType:'text/csv',buffer}
     ]);
     await page.locator('#dedup').uncheck();
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible',timeout:60000});
     if(await page.evaluate(()=>state.rows.length)!==100000) throw new Error('100000-row CSV merge boundary failed');
     await page.locator('#dedup').check();
     if(!await page.locator('#output').isHidden()) throw new Error('Stale 100000-row result after option change');
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     const sjis=Buffer.from('96bc914f2c94f58d6c2c8be08a7a0d0a8fa49569412c2288ea8d7396da0d0a93f18d7396da222c313230300d0a','hex');
     await page.locator('#encoding').selectOption('shift_jis');
     await page.locator('#files').setInputFiles([
       {name:'sjis-a.csv',mimeType:'text/csv',buffer:sjis},
       {name:'sjis-b.csv',mimeType:'text/csv',buffer:sjis}
     ]);
     await page.locator('#dedup').uncheck();
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     if(await page.locator('#body tr').count()!==2) throw new Error('Shift_JIS multiline rows not merged');
     const text=await page.locator('#body tr').first().innerText();
     if(!text.includes('商品A')||!text.includes('一行目')||!text.includes('二行目')) throw new Error('Shift_JIS multiline value corrupted');
     const pending=page.waitForEvent('download');
     await page.locator('#download').click();
     const csv=fs.readFileSync(await (await pending).path(),'utf8');
     if(!csv.includes('"一行目\r\n二行目"')) throw new Error('Quoted multiline cell missing in export');
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     const files=[
       {name:'a.csv',mimeType:'text/csv',buffer:Buffer.from('ID,金額\n=1+1,-100','utf8')},
       {name:'b.csv',mimeType:'text/csv',buffer:Buffer.from('ID,金額\n+SUM(1),200','utf8')}
     ];
     await page.locator('#files').setInputFiles(files);
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#download').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes("'=1+1,-100")||!csv.includes("'+SUM(1),200")) throw new Error('CSV merge formula guard or negative amount failed');
   });
   await test(local('tools/expense-category-report/index.html'),async()=>{
     const csv=Buffer.concat([Buffer.from([0x8d,0x4c,0x8d,0x90]),Buffer.from(',2026/11/2,"1,200"\r\n')]);
     await page.locator('#importFile').setInputFiles({name:'excel.csv',mimeType:'text/csv',buffer:csv});
     await page.waitForFunction(()=>!document.querySelector('#importFile').value);
     const cells=page.locator('#entryRows input');
     if(await cells.nth(0).inputValue()!=='広告'||await cells.nth(1).inputValue()!=='2026-11-02'||await cells.nth(2).inputValue()!=='1200')throw new Error('Japanese Excel CSV normalization failed');
     if(!(await page.locator('#summary').innerText()).includes('1,200円'))throw new Error('Normalized CSV calculation failed');
   });
   await test(local('tools/product-margin-report/index.html'),async()=>{
     const cells=page.locator('#entryRows input');
     await cells.first().fill('UNDO-TEST');
     await page.getByRole('button',{name:'元に戻す',exact:true}).click();
     if(await cells.first().inputValue()!=='')throw new Error('Undo failed');
     await page.getByRole('button',{name:'やり直す',exact:true}).click();
     if(await cells.first().inputValue()!=='UNDO-TEST')throw new Error('Redo failed');
     await page.getByRole('checkbox',{name:'この端末に入力途中のデータを自動保存する'}).check();
     await page.reload();
     await page.getByRole('button',{name:'前回の入力を復元'}).click();
     if(await cells.first().inputValue()!=='UNDO-TEST')throw new Error('Draft restore failed');
     await page.getByRole('button',{name:'保存データを削除'}).click();
     if(!(await page.getByRole('button',{name:'前回の入力を復元'}).isDisabled()))throw new Error('Draft deletion failed');
   });
   await test(local('tools/product-margin-report/index.html'),async()=>{
     const cells=page.locator('#entryRows input');
     await cells.nth(0).fill('SKU-SAVE');await cells.nth(1).fill('1');await cells.nth(2).fill('1000');await cells.nth(3).fill('500');await cells.nth(4).fill('100');await cells.nth(5).fill('100');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#saveInput').click();
     const file=await downloadPromise;
     const csv=fs.readFileSync(await file.path(),'utf8');
     if(!csv.includes('SKU-SAVE')||!csv.includes('販売数量'))throw new Error('Input backup CSV missing data');
     await cells.nth(0).fill('CHANGED');
     await page.locator('#importFile').setInputFiles({name:'saved.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
     await page.waitForFunction(()=>!document.querySelector('#importFile,#restore').value);
     if(await cells.nth(0).inputValue()!=='SKU-SAVE'||!(await page.locator('#summary').innerText()).includes('300円'))throw new Error('Saved input CSV not restored');
   });
   await test(local('tools/product-margin-report/index.html'),async()=>{
     await page.locator('#importFile').setInputFiles({name:'product-data.csv',mimeType:'text/csv',buffer:Buffer.from(['SKU,販売数量,単価,単位原価,販売手数料合計,送料合計','SKU-A,2,2000,800,200,300','SKU-B,1,1000,500,100,100'].join(String.fromCharCode(10)))});
     await page.waitForFunction(()=>!document.querySelector('#importFile,#restore').value);
     if(await page.locator('#entryRows tr').count()!==2)throw new Error('CSV import row count incorrect');
     if(!(await page.locator('#summary').innerText()).includes('2,200円'))throw new Error('CSV import calculation incorrect');
     await page.locator('#entryRows input').first().fill('SKU,INVALID');
     if(!(await page.locator('#entryError').innerText()).includes('カンマ'))throw new Error('Comma in field accepted');
     if(!(await page.locator('#export').isDisabled()))throw new Error('Export remained enabled after invalid field');
   });
   await test(local('tools/product-margin-report/index.html'),async()=>{
     await page.locator('#entryRows input').first().fill('SKU-TEST');
     await page.locator('#entryRows input').nth(1).fill('2');
     await page.locator('#entryRows input').nth(2).fill('2000');
     await page.locator('#entryRows input').nth(3).fill('800');
     await page.locator('#entryRows input').nth(4).fill('200');
     await page.locator('#entryRows input').nth(5).fill('300');
     if(!(await page.locator('#summary').innerText()).includes('1,900円'))throw new Error('Product margin editable input incorrect');
   });
   await test(local('tools/stocktake-reconcile/index.html'),async()=>{
     await page.locator('#entryRows input').first().fill('SKU-TEST');
     await page.locator('#entryRows input').nth(1).fill('10');
     await page.locator('#entryRows input').nth(2).fill('8');
     await page.locator('#entryRows input').nth(3).fill('500');
     if(!(await page.locator('#summary').innerText()).includes('-1,000円'))throw new Error('Stocktake editable input incorrect');
   });
   await test(local('tools/shipping-cost-report/index.html'),async()=>{
     await page.getByRole('button',{name:'＋ 5行追加'}).click();
     if(await page.locator('#entryRows tr').count()!==6)throw new Error('Bulk row addition failed');
     await page.getByRole('button',{name:'空行を整理'}).click();
     if(await page.locator('#entryRows tr').count()!==1)throw new Error('Empty row cleanup failed');
     await page.locator('#entryRows input').first().fill('宅配便');
     await page.locator('#entryRows input').first().press('Enter');
     if(!(await page.locator('#entryRows input').nth(1).evaluate(el=>el===document.activeElement)))throw new Error('Keyboard next-field navigation failed');
   });
   await test(local('tools/shipping-cost-report/index.html'),async()=>{
     await page.locator('#entryRows input').first().fill('宅配便');
     await page.locator('#entryRows input').nth(1).fill('2');
     await page.locator('#entryRows input').nth(2).fill('1000');
     await page.locator('#entryRows input').nth(3).fill('800');
     if(!(await page.locator('#summary').innerText()).includes('送料差額：200円'))throw new Error('Editable shipping row did not calculate');
     await page.locator('#addRow').click();
     if(await page.locator('#entryRows tr').count()!==2)throw new Error('Row addition failed');
     await page.locator('#entryRows tr').last().locator('button').click();
     if(await page.locator('#entryRows tr').count()!==1)throw new Error('Row deletion failed');
   });
   await test(local('tools/expense-category-report/index.html'),async()=>{
     await page.locator('#entryRows input').first().fill('広告宣伝費');
     await page.locator('#entryRows input').nth(1).fill('2026-11-24');
     await page.locator('#entryRows input').nth(2).fill('3500');
     if(!(await page.locator('#summary').innerText()).includes('支出合計：3,500円'))throw new Error('Editable expense row did not calculate');
   });
   await test(local('tools/shipping-cost-report/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==2)throw new Error('Shipping cost grouping incorrect');
     if(!(await page.locator('#summary').innerText()).includes('送料差額：-1,500円'))throw new Error('Shipping cost total incorrect');
     const pending=page.waitForEvent('download');await page.locator('#export').click();
     const csv=fs.readFileSync(await (await pending).path(),'utf8');
     if(!csv.includes('宅配便')||!csv.includes('送料差額'))throw new Error('Shipping cost CSV incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'宅配便,-1,100,200');await page.locator('#calculate').click();
     if(!(await page.locator('#error').innerText()).includes('0以上')||!(await page.locator('#export').isDisabled()))throw new Error('Invalid shipping data accepted');
   });
   await test(local('tools/expense-category-report/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==2)throw new Error('Expense category grouping incorrect');
     if(!(await page.locator('#summary').innerText()).includes('支出合計：9,200円'))throw new Error('Expense total incorrect');
     const pending=page.waitForEvent('download');await page.locator('#export').click();
     const csv=fs.readFileSync(await (await pending).path(),'utf8');
     if(!csv.includes('広告宣伝費')||!csv.includes('支出金額'))throw new Error('Expense CSV incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'広告宣伝費,2026-02-30,100');await page.locator('#calculate').click();
     if(!(await page.locator('#error').innerText()).includes('支出日')||!(await page.locator('#export').isDisabled()))throw new Error('Invalid expense date accepted');
   });
   await test(local('tools/channel-profit-report/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==2) throw new Error('Sales channel aggregation incorrect');
     const summary=await page.locator('#summary').innerText();
     if(!summary.includes('売上合計：23,000円')||!summary.includes('利益合計：9,800円')) throw new Error('Channel profit totals incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('ネットショップ')||!csv.includes('利益率')) throw new Error('Channel profit CSV incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'ネットショップ,0,100,0,0');
     await page.locator('#calculate').click();
     if(!(await page.locator('#summary').innerText()).includes('利益合計：-100円')) throw new Error('Negative channel profit incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'ネットショップ,-1,100,0,0');
     await page.locator('#calculate').click();
     if(!(await page.locator('#error').innerText()).includes('0以上')) throw new Error('Invalid channel sale accepted');
     if(!(await page.locator('#export').isDisabled())) throw new Error('Stale channel export enabled');
   });
   await test(local('tools/inventory-aging/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==3) throw new Error('Inventory aging sample count incorrect');
     const summary=await page.locator('#summary').innerText();
     if(!summary.includes('在庫評価額：10,600円')||!summary.includes('91～180日：2件')) throw new Error('Inventory aging bucket totals incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('ITEM-001')||!csv.includes('滞留区分')) throw new Error('Inventory aging CSV incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'SKU-1,2026-11-25,1,100');
     await page.locator('#calculate').click();
     if(!(await page.locator('#error').innerText()).includes('最終入荷日')) throw new Error('Future stock date accepted');
     if(!(await page.locator('#export').isDisabled())) throw new Error('Stale inventory aging export enabled');
   });
   await test(local('tools/product-margin-report/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==2) throw new Error('SKU aggregation incorrect');
     if(!(await page.locator('#summary').innerText()).includes('利益合計：3,600円')) throw new Error('Product margin total incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('ITEM-001')||!csv.includes('利益率')) throw new Error('Product margin CSV incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'ITEM-001,1,100,200,0,0');
     await page.locator('#calculate').click();
     if(!(await page.locator('#summary').innerText()).includes('利益合計：-100円')) throw new Error('Negative margin incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'ITEM-001,-1,100,20,0,0');
     await page.locator('#calculate').click();
     if(!(await page.locator('#error').innerText()).includes('0以上')) throw new Error('Invalid quantity accepted');
     if(!(await page.locator('#export').isDisabled())) throw new Error('Stale margin export enabled');
   });
   await test(local('tools/supplier-payment-reconcile/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==3) throw new Error('Supplier invoice sample count incorrect');
     const summary=await page.locator('#summary').innerText();
     if(!summary.includes('未払総額：2,000円')||!summary.includes('過払総額：500円')) throw new Error('Supplier payment totals incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('INV-001')||!csv.includes('過払金額')) throw new Error('Supplier payment CSV incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'A,INV-1,100,0\nA,INV-1,100,0');
     await page.locator('#calculate').click();
     if(!(await page.locator('#error').innerText()).includes('重複')) throw new Error('Duplicate invoice accepted');
     if(!(await page.locator('#export').isDisabled())) throw new Error('Stale supplier export enabled');
   });
   await test(local('tools/purchase-receiving/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==3) throw new Error('Purchase receiving sample count incorrect');
     if(!(await page.locator('#summary').innerText()).includes('未入荷金額：4,000円')) throw new Error('Purchase receiving amount incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('PO-001')||!csv.includes('未入荷金額')) throw new Error('Purchase receiving CSV incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'P1,A,2,1,100\nP2,A,2,1,200\nP3,B,2,1,300\nP4,B,2,1,300\nP5,C,2,0,500');
     await page.locator('#calculate').click();
     const marginDownload=page.waitForEvent('download');
     await page.locator('#marginTemplate').click();
     const margin=fs.readFileSync(await (await marginDownload).path(),'utf8');
     if(!margin.includes('"A","","","","",""')||!margin.includes('"B","","","300","",""')||margin.includes('"C"'))throw new Error('Margin template cost candidates incorrect');
     await page.goto(local('tools/product-margin-report/index.html'));
     await page.locator('#importFile').setInputFiles({name:'product-margin-input-template.csv',mimeType:'text/csv',buffer:Buffer.from(margin)});
     await page.waitForFunction(()=>!document.querySelector('#importFile').value);
     if(await page.locator('#entryRows tr').count()!==2||await page.locator('#entryRows tr').nth(1).locator('input').nth(3).inputValue()!=='300'||await page.locator('#entryRows tr').first().locator('input').nth(1).inputValue()!=='')throw new Error('Margin template import incorrect');
     await page.goto(local('tools/purchase-receiving/index.html'));
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'PO-1,SKU-1,1,2,100');
     await page.locator('#calculate').click();
     if(!(await page.locator('#error').innerText()).includes('超えて')) throw new Error('Over-receipt accepted');
     if(!(await page.locator('#export').isDisabled())) throw new Error('Stale export enabled');
   });
   await test(local('tools/stocktake-reconcile/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==3) throw new Error('Stocktake sample count incorrect');
     if(!(await page.locator('#summary').innerText()).includes('差異金額：200円')) throw new Error('Stocktake valuation variance incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('ITEM-001')||!csv.includes('差異金額')) throw new Error('Stocktake CSV export incorrect');
     await page.locator('#data').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},'SKU-A,1,2,100\nSKU-A,2,3,100');
     await page.locator('#calculate').click();
     if(!(await page.locator('#error').innerText()).includes('重複')) throw new Error('Stocktake duplicate SKU accepted');
     if(!(await page.locator('#export').isDisabled())) throw new Error('Stocktake stale export remained enabled');
   });
   await test(local('tools/returns-refunds/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==3) throw new Error('Returns sample count incorrect');
     if(!(await page.locator('#summary').innerText()).includes('返金予定額：5,000円')) throw new Error('Refund planned sum incorrect');
     if(!(await page.locator('#summary').innerText()).includes('未完了額：3,000円')) throw new Error('Refund outstanding sum incorrect');
     await page.locator('#rows tr').first().locator('select').selectOption('返金完了');
     if(!(await page.locator('#summary').innerText()).includes('未完了額：0円')) throw new Error('Refund completion not reflected');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('ORDER-001')||!csv.includes('返金完了')) throw new Error('Refund ledger CSV export incorrect');
     await page.locator('#order').fill('ORDER-001');
     await page.locator('#sku').fill('ITEM-001');
     await page.locator('#add').click();
     if(!(await page.locator('#error').innerText()).includes('重複')||await page.locator('#rows tr').count()!==3) throw new Error('Duplicate refund case accepted');
     page.once('dialog',d=>d.accept());await page.locator('#clear').click();
     if(!(await page.locator('#export').isDisabled())) throw new Error('Stale refunds export remained enabled');
   });
   await test(local('tools/sales-summary/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==2) throw new Error('Monthly sales sample month count incorrect');
     if(!(await page.locator('#summary').innerText()).includes('25,000円')) throw new Error('Monthly sales overall total incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('2026-10')||!csv.includes('2026-11')||!csv.includes('13000')) throw new Error('Monthly sales CSV export incorrect');
     await page.evaluate(()=>{try{load('営業日,決済方法,売上金額,摘要\n2026-02-30,現金,100,無効')}catch(e){reset();document.getElementById('error').textContent=e.message}});
     if(!(await page.locator('#error').innerText()).includes('2行目')) throw new Error('Invalid sales date accepted');
     if(!(await page.locator('#export').isDisabled())) throw new Error('Stale monthly summary export enabled');
   });
   await test(local('tools/product-listing-prep/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/')};
     await open('product-listing-prep');await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('ogb-product-ledger-v1')});await page.locator('#sample').click();await send('product-ledger');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#status','3商品を追加');if(await page.locator('#rows tr').count()!==3)throw Error('Product handoff count');
     const sku=await page.locator('#rows tr').first().locator('td').first().innerText();await send('inventory-movement');await page.locator('#handoffAccept').click();await waitForText('#result','商品コードを引き継ぎ');if(await page.locator('#csvGridRows tr').count()!==3)throw Error('Inventory movement handoff');
     await page.locator('#data').fill('日付,SKU,区分,数量,摘要\n2026-11-26,'+sku+',開始,10,\n2026-11-27,'+sku+',出庫,2,');await page.locator('#calculate').click();await send('inventory-reorder');await page.locator('#handoffAccept').click();if(!(await page.locator('#batchInput').inputValue()).includes('"'+sku+'","8"'))throw Error('Stock handoff quantity');
     await page.locator('#batchInput').fill('商品コード,現在庫,入荷待ち,引当済み,1日平均販売数,納期日数,安全在庫,目標日数\n'+sku+',8,0,0,3,5,5,14');await page.locator('#batchCalc').click();if(await page.locator('#resultBody tr td').nth(3).innerText()!=='54')throw Error('Stock handoff calculation');
     await open('inventory-movement');await page.locator('#data').fill('日付,SKU,区分,数量,摘要\n2026-11-26,'+sku+',開始,10,保存済み\n2026-11-27,'+sku+',出庫,2,');await page.locator('#csvDraftSave').click();
     await open('product-ledger');await send('inventory-movement');await page.locator('#handoffAccept').click();await waitForText('#result','新規 2件、登録済み 1件');if(await page.locator('#csvGridRows tr').count()!==4||!(await page.locator('#data').inputValue()).includes('保存済み'))throw Error('Saved inventory merge');if(!await page.evaluate(()=>JSON.parse(localStorage.getItem('ogb-csv-grid-draft-v1:/tools/inventory-movement/')).data.includes('保存済み')))throw Error('Saved draft modified unexpectedly');
     await page.evaluate(()=>localStorage.removeItem('ogb-csv-grid-draft-v1:/tools/inventory-movement/'));
     await open('product-ledger');await send('pricing-simulator');await page.locator('#handoffAccept').click();if(!(await page.locator('#bulkInput').inputValue()).includes(sku)||!await page.locator('#bulkExport').isDisabled())throw Error('Pricing handoff');
     await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('ogb-product-ledger-v1')});
   });
   await test(local('tools/invoice-maker/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/')};
     await open('receivables-report');await page.evaluate(()=>localStorage.removeItem('ogb-csv-grid-draft-v1:/tools/receivables-report/'));await page.locator('#sample').click();await page.locator('#csvDraftSave').click();await open('cash-flow-planner');await page.evaluate(()=>localStorage.removeItem('ogb-csv-grid-draft-v1:/tools/cash-flow-planner/'));await page.locator('#sample').click();await page.locator('#csvDraftSave').click();
     await open('invoice-maker');await page.locator('#sample').click();await send('receivables-report');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#result','請求明細を追加');if(await page.locator('#csvGridRows tr').count()!==4)throw Error('Invoice appended rows');
     await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('151,218円'))throw Error('Invoice appended total');
     await send('cash-flow-planner');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#result','入金予定を追加');if(await page.locator('#csvGridRows tr').count()!==6)throw Error('Cash plan appended rows');await page.locator('#calculate').click();if(!(await page.locator('#result').innerText()).includes('181,218円'))throw Error('Cash plan handoff total');
     await page.evaluate(()=>{for(const slug of ['receivables-report','cash-flow-planner'])localStorage.removeItem('ogb-csv-grid-draft-v1:/tools/'+slug+'/')});
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/');await page.locator('#handoffAccept').click()};
     await open('packing-checklist');await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('ogb-packing-checklist-v1')});await page.locator('#orders').fill('A001\nOLD-001');await page.locator('#build').click();await page.locator('#rows tr').first().locator('input').first().check();await page.locator('#draftSave').click();
     await open('order-line-aggregate');await page.locator('#demo').click();await page.locator('#run').click();await send('order-payment-reconcile');await page.locator('#payments').setInputFiles({name:'pay.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,決済金額\nA001,1200\nA002,2400\nA004,700')});await page.locator('#load').click();await page.locator('#run').click();await waitForText('#summary','一致 1件');await waitForText('#summary','金額不一致 1件');await send('packing-checklist');if(await page.locator('#rows tr').count()!==2||!await page.locator('#rows tr').first().locator('input').first().isChecked()||(await page.locator('#orders').inputValue()).includes('A002'))throw Error('Matched shipping and draft preservation');
     await open('order-line-aggregate');await page.locator('#demo').click();await page.locator('#run').click();await send('packing-checklist');if(await page.locator('#rows tr').count()!==4||!await page.locator('#rows tr').first().locator('input').first().isChecked())throw Error('All order shipping merge');
     await send('returns-refunds');if(await page.locator('#rows tr').count()!==0)throw Error('Return created without user action');await page.locator('#handoffReturnOrder').selectOption('A001');await page.locator('#handoffReturnApply').click();if(await page.locator('#order').inputValue()!=='A001'||await page.locator('#rows tr').count()!==0)throw Error('Return order selection');
     await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('ogb-packing-checklist-v1')});
   });
   await test(local('tools/purchase-receiving/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/');await page.locator('#handoffAccept').click()};
     await open('inventory-reorder');await page.evaluate(()=>{sessionStorage.clear();for(const s of ['purchase-receiving','stocktake-reconcile','inventory-aging','product-margin-report'])localStorage.removeItem('ogb-grid-draft-v1:/tools/'+s+'/');localStorage.removeItem('ogb-csv-grid-draft-v1:/tools/cash-flow-planner/')});await page.locator('#sample').click();await send('purchase-receiving');const purchaseRows=await page.locator('#entryRows tr').count();if(purchaseRows<1||await page.locator('#entryRows tr').first().locator('input').nth(0).inputValue()!==''||await page.locator('#entryRows tr').first().locator('input').nth(2).inputValue()===''||!await page.locator('#export').isDisabled())throw Error('Purchase suggestion blanks');
     await page.locator('#sample').click();await send('product-margin-report');if(await page.locator('#entryRows tr').count()!==3||await page.locator('#entryRows tr').first().locator('input').nth(3).inputValue()!=='500'||await page.locator('#entryRows tr').first().locator('input').nth(1).inputValue()!==''||!await page.locator('#export').isDisabled())throw Error('Received cost transfer');
     await open('stocktake-reconcile');await page.evaluate(()=>localStorage.setItem('ogb-grid-draft-v1:/tools/stocktake-reconcile/',JSON.stringify({fields:['SKU','帳簿数量','実棚数量','単位原価'],data:[['A001','','7','500'],['OLD','2','2','100']]})));
     await open('inventory-movement');await page.locator('#sample').click();await page.locator('#calculate').click();await send('stocktake-reconcile');if(await page.locator('#entryRows tr').first().locator('input').nth(1).inputValue()!=='10'||await page.locator('#entryRows tr').first().locator('input').nth(2).inputValue()!=='7'||await page.locator('#entryRows tr').first().locator('input').nth(3).inputValue()!=='500'||await page.locator('#entryRows tr').count()!==3)throw Error('Stocktake restored draft fill blanks');await page.evaluate(()=>localStorage.removeItem('ogb-grid-draft-v1:/tools/stocktake-reconcile/'));
     await open('inventory-movement');await page.locator('#sample').click();await page.locator('#calculate').click();await send('inventory-aging');if(await page.locator('#entryRows tr').first().locator('input').nth(1).inputValue()!==''||await page.locator('#entryRows tr').first().locator('input').nth(2).inputValue()!=='10')throw Error('Aging quantity transfer');
     await open('supplier-payment-reconcile');await page.locator('#sample').click();page.once('dialog',d=>d.accept());await page.locator('#handoff-cash-flow-planner').click();await page.waitForURL('**/tools/cash-flow-planner/');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#result','未払額を出金予定に追加');const raw=await page.locator('#data').inputValue();if(!raw.includes('"出金","2000"')||!raw.includes('"","出金"')||!await page.locator('#export').isDisabled())throw Error('Supplier payment transfer');
     await page.evaluate(()=>sessionStorage.clear());
   });
   await test(local('tools/shop-sales-performance/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/')};
     await open('daily-sales-ledger');await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('ogb-csv-grid-draft-v1:/tools/shop-sales-performance/');localStorage.removeItem('ogb-csv-grid-draft-v1:/tools/staff-cost-planner/');localStorage.removeItem('ogb-profit-break-even-v1')});await page.locator('#sample').click();await send('shop-sales-performance');await page.locator('#handoffAccept').click();await waitForText('#result','日別売上を');if(await page.locator('#csvGridRows tr').first().locator('input').nth(2).inputValue()!==''||!await page.locator('#export').isDisabled())throw Error('Shop handoff unknown customer count');
     await open('sales-summary');await page.locator('#sample').click();await send('staff-cost-planner');await page.locator('#handoffAccept').click();await page.locator('#staffHandoffMonth').selectOption('2026-11');page.once('dialog',d=>d.accept());await page.locator('#staffHandoffApply').click();if(await page.locator('#sales').inputValue()!=='13000')throw Error('Staff monthly sales');
     await open('recipe-cost-calculator');await page.locator('#sample').click();await send('profit-break-even');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();if(await page.locator('#price').inputValue()!=='800'||await page.locator('#variable').inputValue()===''||await page.locator('#units').inputValue()!==''||await page.locator('#fixed').inputValue()!=='')throw Error('Recipe cost handoff defaults');const variable=await page.locator('#variable').inputValue();await page.locator('#profitDraftSave').click();
     await open('staff-cost-planner');await page.locator('#sample').click();await send('profit-break-even');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();if(await page.locator('#price').inputValue()!=='800'||await page.locator('#variable').inputValue()!==variable||await page.locator('#fixed').inputValue()!=='22350')throw Error('Staff cost fixed plan and saved recipe');await page.evaluate(()=>localStorage.removeItem('ogb-profit-break-even-v1'));
   });
   await test(local('tools/business-expense-allocation/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/')};
     await open('annual-expense-merge');await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('ogb-annual-expense-merge-2026-v1');for(const s of ['annual-income-summary','side-income-summary','tax-filing-check','tax-reserve-planner'])localStorage.removeItem('ogb-tax-form-draft-2026-v1:/tools/'+s+'/')});
     await open('business-expense-allocation');await page.locator('#sample').click();await send('annual-expense-merge');await page.locator('#handoffAccept').click();if(await page.locator('#sources input').count()!==1)throw Error('Allocation handoff');await page.locator('#expenseDraftSave').click();
     await open('depreciation-calculator');await page.locator('#sample').click();await send('annual-expense-merge');await page.locator('#handoffAccept').click();if(await page.locator('#sources input').count()!==2||await page.locator('#confirm').isChecked())throw Error('Depreciation draft merge');page.once('dialog',d=>d.accept());await page.locator('#expenseDraftSave').click();
     await open('depreciation-calculator');await page.locator('#sample').click();await send('annual-expense-merge');await page.locator('#handoffAccept').click();if(await page.locator('#sources input').count()!==2)throw Error('Duplicate depreciation handoff');
     await open('expense-category-report');await page.locator('#sample').click();await send('annual-expense-merge');await page.locator('#handoffAccept').click();await page.locator('#confirm').check();await page.locator('#calculate').click();await waitForText('#result','417,200円');await send('annual-income-summary');await page.locator('#handoffAccept').click();await page.locator('#preview').waitFor({state:'visible'});for(const ch of await page.locator('#expenseOptions input').all())await ch.check();await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#expenses').inputValue()!=='417200')throw Error('Combined annual expenses');
     await open('project-profit-report');await page.locator('#sample').click();await send('annual-income-summary');await page.locator('#handoffAccept').click();await page.locator('#preview').waitFor({state:'visible'});await page.locator('#projectSales').check();await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#sales').inputValue()!=='130000'||await page.locator('#expenses').inputValue()!=='0')throw Error('Project selective annual handoff');
     await open('project-profit-report');await page.locator('#sample').click();await send('side-income-summary');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();if(await page.locator('#miscRevenue').inputValue()!=='130000'||await page.locator('#miscExpense').inputValue()!=='15000'||await page.locator('#scope').isChecked())throw Error('Project miscellaneous handoff');await page.locator('#scope').check();await page.locator('#calculate').click();await send('tax-filing-check');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();if(await page.locator('#other').inputValue()!=='115000'||await page.locator('#scope').isChecked())throw Error('Filing check excludes salary');
     await open('consumption-tax-simulator');await page.locator('#sample').click();await send('tax-reserve-planner');await page.locator('#handoffAccept').click();if(await page.locator('#consumptionApply').isEnabled())throw Error('Consumption regime must be chosen');await page.locator('#consumptionChoice').selectOption('2割特例（概算）');page.once('dialog',d=>d.accept());await page.locator('#consumptionApply').click();if(await page.locator('#otherTax').inputValue()!=='116000')throw Error('Selected consumption tax only');
     await page.evaluate(()=>localStorage.removeItem('ogb-annual-expense-merge-2026-v1'));
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/')};
     await open('csv-merge');await page.evaluate(()=>sessionStorage.clear());await page.locator('#demo').click();await send('csv-analyzer');await page.locator('#handoffAccept').click();await page.locator('#results').waitFor({state:'visible'});await send('basic-statistics');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await page.locator('#calc-stats').click();await waitForText('#stats-result','11,000');
     await open('csv-analyzer');await page.locator('#file').setInputFiles({name:'paired.csv',mimeType:'text/csv',buffer:Buffer.from('X,Y,商品\n1,2,"A,B"\n2,,C\n,100,D\n3,6,E')});await page.locator('#results').waitFor({state:'visible'});await page.locator('#xcol').selectOption('0');await page.locator('#ycol').selectOption('1');await send('correlation');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();if(await page.locator('#xs').inputValue()!=='1\n3'||await page.locator('#ys').inputValue()!=='2\n6')throw Error('Pairwise missing preservation');await page.locator('#calc-corr').click();await waitForText('#corr-result','相関係数：1');
     await open('csv-merge');await page.locator('#demo').click();await send('list-cleaner');await page.locator('#handoffAccept').click();const col=await page.locator('#listHandoffColumn option').filter({hasText:'商品'}).getAttribute('value');await page.locator('#listHandoffColumn').selectOption(col);await page.locator('#listHandoffApply').click();await page.locator('#mode').selectOption('frequency');await page.locator('#run').click();await send('csv-analyzer');await page.locator('#handoffAccept').click();await page.locator('#results').waitFor({state:'visible'});
     await open('list-cleaner');await page.locator('#frequency-example').click();await send('basic-statistics');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await page.locator('#calc-stats').click();await waitForText('#stats-result','合計：6');
   });
   await test(local('tools/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug,{waitUntil:'domcontentloaded'});
     await open('product-ledger/');await page.evaluate(()=>localStorage.removeItem('ogb-tool-navigation-v1'));await page.reload();await page.locator('#ogbToolNavigation').waitFor();await page.locator('#ogbFavorite').click();await page.locator('#ogbToolNavigation summary').click();await page.locator('#ogbHistoryToggle').click();if(!(await page.locator('#ogbToolNavigation').innerText()).includes('仕入発注・入荷照合'))throw Error('Direct target navigation missing');
     await open('inventory-movement/');await page.locator('#ogbToolNavigation summary').click();await page.locator('#ogbFavorite').click();await open('');await page.locator('#ogbToolNavigation').waitFor();const text=await page.locator('#ogbToolNavigation').innerText();if(!text.includes('商品台帳')||!text.includes('入出庫')||!text.includes('最近使ったツール'))throw Error('Directory navigation did not retain favorites/history');const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ogb-tool-navigation-v1')));if(saved.recent[0]!=='inventory-movement'||saved.favorites.length!==2||Object.keys(saved).sort().join(',')!=='favorites,historyEnabled,recent,version')throw Error('Unexpected navigation storage');
     await page.locator('#ogbHistoryToggle').click();if((await page.evaluate(()=>JSON.parse(localStorage.getItem('ogb-tool-navigation-v1')))).recent.length)throw Error('History not cleared');page.once('dialog',d=>d.accept());await page.locator('#ogbFavoritesClear').click();
     await open('image-batch/');await page.locator('#ogbToolNavigation').waitFor();await page.locator('#ogbToolNavigation summary').click();if(!(await page.locator('#ogbToolNavigation').innerText()).includes('直接データ転送はありません'))throw Error('Independent tool incorrectly advertises transfer');await open('business/small-shop/');await page.locator('#direct-workflows-title').waitFor();await page.locator('#ogbToolNavigation').waitFor();await page.evaluate(()=>localStorage.removeItem('ogb-tool-navigation-v1'));
   });
   await test(local('tools/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug,{waitUntil:'domcontentloaded'});
     await open('annual-income-summary/');await page.evaluate(()=>{for(const k of ['ogb-tax-form-draft-2026-v1:/tools/annual-income-summary/','ogb-grid-draft-v1:/tools/stocktake-reconcile/','ogb-product-ledger-v1','ogb-profit-break-even-v1'])localStorage.removeItem(k)});await page.reload();await page.locator('#sales').fill('123456');await page.locator('#taxDraftSave').click();await page.locator('#ogbResumeSaved').waitFor();await page.locator('#sales').fill('999');page.once('dialog',d=>d.accept());await page.locator('#ogbResumeSaved').click();if(await page.locator('#sales').inputValue()!=='123456')throw Error('Quick restore did not invoke native restore');
     await open('stocktake-reconcile/');await page.locator('#sample').click();await page.locator('#ogbGridAuto').check();await page.locator('#ogbResumeSaved').waitFor();await open('');await page.locator('#ogbSavedData').waitFor();await page.locator('#ogbSavedFilter').fill('年間売上');if(await page.locator('#ogbSavedList a').count()!==1)throw Error('Saved work filter');await page.locator('#ogbSavedList a').click();await page.waitForURL('**/tools/annual-income-summary/#taxDraftRestore');if(await page.locator('#sales').inputValue()!=='0')throw Error('Unexpected automatic restoration');page.once('dialog',d=>d.accept());await page.locator('#ogbResumeSaved').click();if(await page.locator('#sales').inputValue()!=='123456')throw Error('Directory resume');
     await open('');await page.locator('#ogbSavedFilter').fill('棚卸');await page.locator('#ogbSavedList a').click();await page.waitForURL('**/tools/stocktake-reconcile/#ogbGridRestore');await page.locator('#ogbResumeSaved').click();if(!(await page.locator('#data').inputValue()).includes('ITEM-001'))throw Error('Grid native restoration');
     await page.evaluate(()=>{localStorage.setItem('ogb-profit-break-even-v1','invalid-json');localStorage.setItem('unrelated-secret-key','not a tool draft')});await open('');await page.locator('#ogbSavedFilter').fill('損益分岐点');if(!(await page.locator('#ogbSavedList').innerText()).includes('形式の確認が必要'))throw Error('Corrupt draft not identified');await page.locator('#ogbSavedFilter').fill('');if((await page.locator('#ogbSavedList').innerText()).includes('unrelated-secret'))throw Error('Unexpected storage read');
     await page.evaluate(()=>{for(const k of ['ogb-tax-form-draft-2026-v1:/tools/annual-income-summary/','ogb-grid-draft-v1:/tools/stocktake-reconcile/','ogb-profit-break-even-v1','unrelated-secret-key'])localStorage.removeItem(k)});
   });
   await test(local('tools/pricing-simulator/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),keys=['pricing-simulator','inventory-reorder','list-cleaner','cash-register-close'];
     await open('pricing-simulator');await page.evaluate(keys=>keys.forEach(s=>localStorage.removeItem('ogb-form-draft-v1:'+s)),keys);await page.reload({waitUntil:'domcontentloaded'});
     try{
       await page.locator('#cost').fill('777');await page.locator('#bulkInput').fill('SKU-01,100,0,10,10,0,500');await page.locator('#formDraftSave').click();await page.locator('#ogbResumeSaved').waitFor();await page.locator('#cost').fill('999');await page.locator('#bulkInput').fill('');page.once('dialog',d=>d.accept());await page.locator('#ogbResumeSaved').click();if(await page.locator('#cost').inputValue()!=='777'||!(await page.locator('#bulkInput').inputValue()).includes('SKU-01')||!await page.locator('#bulkExport').isDisabled()||!await page.locator('#copyResult').isDisabled())throw Error('Pricing draft restore or stale result');
       await open('inventory-reorder');await page.locator('#sample').click();const data=await page.locator('#batchInput').inputValue();await page.locator('#formDraftSave').click();await page.reload({waitUntil:'domcontentloaded'});page.once('dialog',d=>d.accept());await page.locator('#formDraftRestore').click();if(await page.locator('#batchInput').inputValue()!==data||!await page.locator('#export').isDisabled())throw Error('Inventory draft restore');
       await open('list-cleaner');await page.locator('#frequency-example').click();await page.locator('#trim').uncheck();await page.locator('#formDraftSave').click();await page.reload({waitUntil:'domcontentloaded'});page.once('dialog',d=>d.accept());await page.locator('#formDraftRestore').click();if(await page.locator('#mode').inputValue()!=='frequency'||await page.locator('#trim').isChecked()||!(await page.locator('#a').inputValue()).includes('SKU-01')||!await page.locator('#download').isDisabled())throw Error('List settings restore');
       await open('cash-register-close');await page.locator('#date').fill('2026-11-25');await page.locator('#n10000').fill('5');await page.locator('#formDraftSave').click();await page.reload({waitUntil:'domcontentloaded'});page.once('dialog',d=>d.accept());await page.locator('#formDraftRestore').click();if(await page.locator('#date').inputValue()!=='2026-11-25'||await page.locator('#n10000').inputValue()!=='5'||!await page.locator('#download').isDisabled())throw Error('Cash register draft restore');
       await page.goto(ledgerOrigin+'/tools/',{waitUntil:'domcontentloaded'});await page.locator('#ogbSavedFilter').fill('販売価格');if(await page.locator('#ogbSavedList a[data-saved-slug="pricing-simulator"]').count()!==1)throw Error('New draft directory registration');
     }finally{await page.evaluate(keys=>keys.forEach(s=>localStorage.removeItem('ogb-form-draft-v1:'+s)),keys)}
   });
   await test(local('tools/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),key='ogb-form-draft-v1:csv-merge',key2='ogb-form-draft-v1:order-line-aggregate';
     await open('csv-merge');await page.evaluate(([a,b])=>{localStorage.removeItem(a);localStorage.removeItem(b)},[key,key2]);await page.reload({waitUntil:'domcontentloaded'});
     try{
       await page.locator('#dedup').check();await page.locator('#source').uncheck();await page.locator('#formDraftSave').click();await page.locator('#ogbResumeSaved').waitFor();await page.locator('#dedup').uncheck();page.once('dialog',d=>d.accept());await page.locator('#formDraftRestore').click();if(!await page.locator('#dedup').isChecked()||await page.locator('#source').isChecked())throw Error('CSV merge settings restore');
       await open('order-line-aggregate');await page.locator('#trim').uncheck();await page.locator('#formDraftSave').click();await page.locator('#demo').click();await page.locator('#run').click();page.once('dialog',d=>d.accept());await page.locator('#formDraftRestore').click();if(!await page.locator('#run').isDisabled()||!await page.locator('#save').isDisabled())throw Error('Order settings stale output');
       await page.goto(ledgerOrigin+'/tools/',{waitUntil:'domcontentloaded'});await page.locator('#ogbBackupPanel summary').click();const pending=page.waitForEvent('download');page.once('dialog',d=>d.accept());await page.locator('#ogbBackupExport').click();const dl=await pending;const raw=fs.readFileSync(await dl.path(),'utf8'),backup=JSON.parse(raw);const subset=backup.entries.filter(e=>['csv-merge','order-line-aggregate'].includes(e.slug));if(backup.format!=='ogb-data-lab-backup'||subset.length!==2)throw Error('Backup export missing saved settings');
       const orig=await page.evaluate(k=>localStorage.getItem(k),key2);await page.evaluate(k=>localStorage.removeItem(k),key);
       const file={name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,entries:subset}))};
       await page.locator('#ogbBackupFile').setInputFiles(file);await page.locator('#ogbBackupApply').waitFor({state:'visible'});await waitForText('#ogbBackupStatus','まだ復元していません');if(!await page.locator('[data-backup-slug="order-line-aggregate"]').isDisabled()||await page.evaluate(k=>localStorage.getItem(k),key)!==null)throw Error('Backup preview protection');
       page.once('dialog',d=>d.accept());await page.locator('#ogbBackupApply').click();await waitForText('#ogbBackupStatus','復元 1種類');if(await page.evaluate(k=>localStorage.getItem(k),key)!==subset.find(e=>e.slug==='csv-merge').raw||await page.evaluate(k=>localStorage.getItem(k),key2)!==orig)throw Error('Backup restore changed existing data');
       await page.locator('#ogbBackupFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,entries:[{slug:'unknown-tool',raw:'{}'}]}))});await waitForText('#ogbBackupStatus','読み込めませんでした');if(!await page.locator('#ogbBackupApply').isDisabled())throw Error('Invalid backup accepted');
     }finally{await page.evaluate(([a,b])=>{localStorage.removeItem(a);localStorage.removeItem(b)},[key,key2])}
   });
   await test(local('tools/index.html'),async()=>{
     const key='ogb-workspace-v1',open=slug=>page.goto(ledgerOrigin+'/tools/'+slug,{waitUntil:'domcontentloaded'});
     await open('');await page.evaluate(k=>localStorage.removeItem(k),key);await page.reload({waitUntil:'domcontentloaded'});
     try{
       await page.locator('#ogbWorkTemplate').selectOption('orders');await page.locator('#ogbWorkName').fill('毎日の発送');await page.locator('#ogbWorkCreate').click();await waitForText('#ogbWorkProgress','完了 0 / 5');await page.locator('#ogbWorkDone-order-line-aggregate').check();await waitForText('#ogbWorkProgress','完了 1 / 5');
       await page.locator('#ogbWorkNext').click();await page.waitForURL('**/tools/order-payment-reconcile/');await page.locator('#ogbWorkMark').waitFor();const before=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(before.sets[0].done.length!==1)throw Error('Opening a tool automatically completed it');
       page.once('dialog',d=>d.accept());await page.locator('#ogbWorkMark').click();await waitForText('#ogbCurrentWork','完了 2 / 5');await page.locator('#ogbCurrentWork a').filter({hasText:'業務セットへ戻る'}).click();await page.waitForURL('**/tools/#workspace-entry');await waitForText('#ogbWorkProgress','完了 2 / 5');
       await page.locator('#ogbWorkUp-packing-checklist').click();let saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(saved.sets[0].steps[1]!=='packing-checklist'||saved.sets[0].done.length!==2)throw Error('Reorder lost progress');
       await page.locator('#ogbWorkAddTool').selectOption('product-ledger');await page.locator('#ogbWorkAdd').click();await waitForText('#ogbWorkProgress','完了 2 / 6');page.once('dialog',d=>d.accept());await page.locator('#ogbWorkRemove-returns-refunds').click();await waitForText('#ogbWorkProgress','完了 2 / 5');
       await page.locator('#ogbWorkRename').fill('発送・照合業務');await page.locator('#ogbWorkRenameApply').click();await page.reload({waitUntil:'domcontentloaded'});if(await page.locator('#ogbWorkRename').inputValue()!=='発送・照合業務')throw Error('Workspace persistence');
       page.once('dialog',d=>d.accept());await page.locator('#ogbWorkReset').click();await waitForText('#ogbWorkProgress','完了 0 / 5');await page.locator('#ogbWorkCreatePanel summary').click();await page.locator('#ogbWorkTemplate').selectOption('daily');await page.locator('#ogbWorkCreate').click();await waitForText('#ogbWorkProgress','完了 0 / 7');saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(saved.sets.length!==2)throw Error('Multiple workspaces not stored');page.once('dialog',d=>d.accept());await page.locator('#ogbWorkDelete').click();await waitForText('#ogbWorkProgress','完了 0 / 5');
     }finally{await page.evaluate(k=>localStorage.removeItem(k),key)}
   });
   await test(local('tools/index.html'),async()=>{
     const workKey='ogb-workspace-v1',draftKey='ogb-form-draft-v1:pricing-simulator',open=()=>page.goto(ledgerOrigin+'/tools/',{waitUntil:'domcontentloaded'});
     const original={version:1,active:'w-existing',sets:[{id:'w-existing',name:'既存業務',steps:['pricing-simulator','product-ledger'],done:['pricing-simulator']}]};
     const incoming={version:1,active:'w-new',sets:[{id:'w-existing',name:'上書き禁止',steps:['image-batch'],done:[]},{id:'w-new',name:'移行業務',steps:['pricing-simulator','cash-register-close'],done:['cash-register-close']}]};
     await open();const prior=await page.evaluate(([a,b])=>[localStorage.getItem(a),localStorage.getItem(b)],[workKey,draftKey]);
     try{
       await page.evaluate(([a,b,w])=>{localStorage.setItem(a,JSON.stringify(w));localStorage.setItem(b,JSON.stringify({version:1,tool:'pricing-simulator',fields:{cost:'777'}}))},[workKey,draftKey,original]);await page.reload({waitUntil:'domcontentloaded'});
       await waitForText('#ogbWorkDashboard','保存済み 1 種類');if(!(await page.locator('[data-work-draft="pricing-simulator"]').innerText()).includes('保存済み')||await page.locator('[data-work-restore="pricing-simulator"]').count()!==1)throw Error('Workspace draft status');
       await page.locator('#ogbBackupPanel summary').click();const pending=page.waitForEvent('download');page.once('dialog',d=>d.accept());await page.locator('#ogbBackupExport').click();const dl=await pending;const backup=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));if(backup.version!==2||JSON.stringify(backup.workspace)!==JSON.stringify(original))throw Error('Workspace backup export');
       await page.locator('#ogbBackupFile').setInputFiles({name:'work.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'ogb-data-lab-backup',version:2,entries:[],workspace:incoming}))});await waitForText('#ogbBackupStatus','まだ復元していません');if(!await page.locator('[data-backup-work="w-existing"]').isDisabled()||!await page.locator('[data-backup-work="w-new"]').isChecked())throw Error('Workspace import preview');
       if(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).sets.length,workKey)!==1)throw Error('Workspace preview mutated storage');page.once('dialog',d=>d.accept());await page.locator('#ogbBackupApply').click();await waitForText('#ogbBackupStatus','業務セット：復元 1件');const state=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),workKey);if(state.active!=='w-existing'||JSON.stringify(state.sets[0])!==JSON.stringify(original.sets[0])||JSON.stringify(state.sets[1])!==JSON.stringify(incoming.sets[1]))throw Error('Workspace merge changed existing data');
       await page.locator('#ogbWorkActivate-w-new').click();await waitForText('#ogbWorkProgress','完了 1 / 2');page.once('dialog',d=>d.accept());await page.locator('#ogbWorkDuplicate').click();await waitForText('#ogbWorkProgress','完了 0 / 2');const copy=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),workKey);if(copy.sets.length!==3||copy.sets[2].steps.join(',')!==incoming.sets[1].steps.join(',')||copy.sets[1].done.length!==1)throw Error('Workspace duplicate');
       if(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).fields.cost,draftKey)!=='777')throw Error('Workspace changed tool data');
       await page.locator('#ogbBackupFile').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'ogb-data-lab-backup',version:1,entries:[{slug:'pricing-simulator',raw:JSON.stringify({version:1,tool:'pricing-simulator',fields:{cost:'100'}})}]}))});await waitForText('#ogbBackupStatus','まだ復元していません');if(!await page.locator('[data-backup-slug="pricing-simulator"]').isDisabled())throw Error('Legacy backup compatibility');await page.locator('#ogbBackupCancel').click();
     }finally{await page.evaluate(([a,b,prior])=>{[a,b].forEach((k,i)=>prior[i]===null?localStorage.removeItem(k):localStorage.setItem(k,prior[i]))},[workKey,draftKey,prior])}
   });
   await test(local('tools/business/small-shop/index.html'),async()=>{
     const key='ogb-workspace-v1',open=slug=>page.goto(ledgerOrigin+'/tools/'+slug,{waitUntil:'domcontentloaded'});await open('business/small-shop/');const prior=await page.evaluate(k=>localStorage.getItem(k),key);
     try{
       await page.evaluate(k=>localStorage.removeItem(k),key);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#ogbBusinessChoice-shop-close').check();await page.locator('#ogbBusinessChoice-shop-cost').check();await waitForText('#ogbBusinessCount','選択 2 件');await page.locator('#ogbBusinessCreate').click();await waitForText('#ogbBusinessStatus','新規 2 件');let state=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(state.sets.length!==2||state.sets[0].steps.join(',')!=='daily-sales-ledger,cash-register-close'||state.sets[0].done.length!==0)throw Error('Business starter registration');
       await page.reload({waitUntil:'domcontentloaded'});if(!await page.locator('#ogbBusinessChoice-shop-close').isDisabled())throw Error('Duplicate business preset not detected');
       await open('business/online-selling/');await page.locator('#ogbBusinessChoice-seller-dispatch').check();await page.locator('#ogbBusinessCreate').click();await waitForText('#ogbBusinessStatus','新規 1 件');state=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(state.sets.length!==3||state.active!==state.sets[0].id)throw Error('Existing active workspace changed');
       await page.locator('#ogbBusinessUse-seller-dispatch').click();await page.waitForURL('**/tools/#workspace-entry');await waitForText('#ogbQuickResume','毎日の受注・決済・発送');await page.locator('#ogbQuickNext').click();await page.waitForURL('**/tools/order-line-aggregate/');page.once('dialog',d=>d.accept());await page.locator('#ogbWorkMark').click();await open('');await waitForText('#ogbQuickResume','完了 1 / 3');if(!(await page.locator('#ogbQuickNext').getAttribute('href')).includes('order-payment-reconcile'))throw Error('Quick resume next step');
       await open('business/freelance/');if(await page.locator('#ogbBusinessStart input[type="checkbox"]').count()!==4)throw Error('Freelance templates not rendered');await page.locator('#ogbBusinessChoice-free-invoice').check();await page.locator('#ogbBusinessCreate').click();await waitForText('#ogbBusinessStatus','新規 1 件');
       await open('');state=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(state.sets.length!==4||state.sets.find(s=>s.id===state.active).done.length!==1)throw Error('Other work progress changed');
     }finally{await page.evaluate(([k,v])=>v===null?localStorage.removeItem(k):localStorage.setItem(k,v),[key,prior])}
   });
   await test(local('tools/index.html'),async()=>{
     const key='ogb-workspace-v1',draftKey='ogb-form-draft-v1:pricing-simulator',open=slug=>page.goto(ledgerOrigin+'/tools/'+slug,{waitUntil:'domcontentloaded'});
     const original={version:1,active:'w-cycle',sets:[{id:'w-cycle',name:'月次集計',steps:['pricing-simulator','product-ledger'],done:['pricing-simulator']}]};
     await open('');const prior=await page.evaluate(([a,b])=>[localStorage.getItem(a),localStorage.getItem(b)],[key,draftKey]);
     try{
       await page.evaluate(([a,b,w])=>{localStorage.setItem(a,JSON.stringify(w));localStorage.setItem(b,'{"version":1,"tool":"pricing-simulator","fields":{"cost":"777"}}')},[key,draftKey,original]);await page.reload({waitUntil:'domcontentloaded'});
       await page.locator('#ogbWorkCycleKind').selectOption('monthly');page.once('dialog',d=>d.accept());await page.locator('#ogbWorkCycleApply').click();await waitForText('#ogbWorkPeriod','作業対象：');let x=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(x.sets[0].cycle.kind!=='monthly'||x.sets[0].done.length!==1||!await page.locator('#ogbWorkAdvance').isDisabled())throw Error('Cycle configuration lost progress');
       await page.evaluate(k=>{const x=JSON.parse(localStorage.getItem(k));x.sets[0].cycle.start='2000-02-01';localStorage.setItem(k,JSON.stringify(x))},key);await page.reload({waitUntil:'domcontentloaded'});await waitForText('#ogbQuickResume','新しい対象期間');if(await page.locator('#ogbQuickNext').count()!==0)throw Error('Stale period resumed silently');await page.locator('#ogbQuickCycle').click();
       if(await page.locator('#ogbWorkReset').isEnabled())throw Error('Cycle reset bypasses history');page.once('dialog',d=>d.dismiss());await page.locator('#ogbWorkAdvance').click();x=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(x.sets[0].done.length!==1||x.sets[0].history)throw Error('Cancelled rollover changed state');
       page.once('dialog',d=>d.accept());await page.locator('#ogbWorkAdvance').click();await waitForText('#ogbWorkProgress','完了 0 / 2');x=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(x.sets[0].history.length!==1||x.sets[0].history[0].start!=='2000-02-01'||x.sets[0].history[0].done!==1||x.sets[0].history[0].total!==2||x.sets[0].cycle.start==='2000-02-01')throw Error('Cycle history incorrect');
       if(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).fields.cost,draftKey)!=='777')throw Error('Rollover changed tool draft');await page.locator('#ogbWorkCycleHistory summary').click();await waitForText('#ogbWorkCycleHistory','2000-02');
       await page.locator('#ogbBackupPanel summary').click();const pending=page.waitForEvent('download');page.once('dialog',d=>d.accept());await page.locator('#ogbBackupExport').click();const dl=await pending;const backup=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));if(JSON.stringify(backup.workspace.sets[0])!==JSON.stringify(x.sets[0]))throw Error('Cycle backup lost history');await page.evaluate(k=>localStorage.removeItem(k),key);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#ogbBackupPanel summary').click();await page.locator('#ogbBackupFile').setInputFiles({name:'cycle.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,entries:[]}))});await waitForText('#ogbBackupStatus','まだ復元していません');page.once('dialog',d=>d.accept());await page.locator('#ogbBackupApply').click();await waitForText('#ogbBackupStatus','業務セット：復元 1件');const restored=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(JSON.stringify(restored.sets[0])!==JSON.stringify(x.sets[0]))throw Error('Cycle restore lost history');
     }finally{await page.evaluate(([a,b,prior])=>{[a,b].forEach((k,i)=>prior[i]===null?localStorage.removeItem(k):localStorage.setItem(k,prior[i]))},[key,draftKey,prior])}
   });
   await test(local('tools/index.html'),async()=>{
     const key='ogb-workspace-v1',open=()=>page.goto(ledgerOrigin+'/tools/',{waitUntil:'domcontentloaded'});await open();const prior=await page.evaluate(k=>localStorage.getItem(k),key);
     try{
       await page.evaluate(k=>{const d=new Date(),date=n=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-')};localStorage.setItem(k,JSON.stringify({version:1,active:'w-later',sets:[{id:'w-later',name:'後の業務',steps:['pricing-simulator'],done:[],deadline:date(20)},{id:'w-today',name:'本日業務',steps:['product-ledger'],done:[],deadline:date(0)},{id:'w-old',name:'期限超過業務',steps:['inventory-movement'],done:[],deadline:date(-1),priority:'high'},{id:'w-done',name:'完了業務',steps:['cash-register-close'],done:['cash-register-close'],deadline:date(-3)}]}))},key);
       await page.reload({waitUntil:'domcontentloaded'});await waitForText('#ogbWorkDeadlineSummary','期限超過 1 件');await waitForText('#ogbWorkDeadlineSummary','本日期限 1 件');const order=await page.locator('#ogbWorkDashboard [data-work-set]').evaluateAll(els=>els.map(e=>e.dataset.workSet));if(order.join(',')!=='w-old,w-today,w-later,w-done')throw Error('Deadline sort or completed status');
       await page.locator('#ogbWorkDeadlineFilter').selectOption('urgent');if(await page.locator('#ogbWorkDashboard [data-work-set]').count()!==2)throw Error('Urgent filter');
       await page.locator('#ogbQuickUrgent-w-today').click();await waitForText('#ogbWorkPlanStatus','本日期限');await page.locator('#ogbWorkPriority').selectOption('high');await page.locator('#ogbWorkPlanApply').click();await waitForText('#ogbWorkPlanStatus','優先度：高');page.once('dialog',d=>d.accept());await page.locator('#ogbWorkDeadlineClear').click();await waitForText('#ogbWorkPlanStatus','期限未設定');
       let x=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);if(x.sets.find(s=>s.id==='w-today').deadline||x.sets.find(s=>s.id==='w-today').priority!=='high'||x.sets.find(s=>s.id==='w-done').done.length!==1)throw Error('Deadline edit altered progress');
       await page.evaluate(k=>{const x=JSON.parse(localStorage.getItem(k)),s=x.sets.find(s=>s.id==='w-today');s.cycle={kind:'monthly',start:'2000-01-01'};s.deadline='2000-02-01';localStorage.setItem(k,JSON.stringify(x))},key);await page.reload({waitUntil:'domcontentloaded'});page.once('dialog',d=>d.accept());await page.locator('#ogbWorkAdvance').click();await waitForText('#ogbWorkPlanStatus','期限未設定');x=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);const s=x.sets.find(s=>s.id==='w-today');if(s.deadline||s.priority!=='high'||s.history[0].deadline!=='2000-02-01')throw Error('Period deadline preservation');
       await page.locator('#ogbBackupPanel summary').click();const pending=page.waitForEvent('download');page.once('dialog',d=>d.accept());await page.locator('#ogbBackupExport').click();const dl=await pending;const backup=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));if(backup.workspace.sets.find(s=>s.id==='w-today').history[0].deadline!=='2000-02-01'||backup.workspace.sets.find(s=>s.id==='w-old').priority!=='high')throw Error('Deadline backup lost fields');
     }finally{await page.evaluate(([k,v])=>v===null?localStorage.removeItem(k):localStorage.setItem(k,v),[key,prior])}
   });
   await test(local('tools/marketplace-profit-compare/index.html'),async()=>{
     const keys=['ogb-product-ledger-v1','ogb-form-draft-v1:marketplace-profit-compare','ogb-form-draft-v1:pricing-simulator'],open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/')};
     await open('product-ledger');const prior=await page.evaluate(ks=>ks.map(k=>localStorage.getItem(k)),keys);
     try{
       const market={version:1,tool:'marketplace-profit-compare',fields:{item:'保存済み商品',cost:'100',other:'30',mp:'1000',mf:'10',ms:'500',mb:'50',yp:'1000',yf:'10',ys:'600',yb:'40'}},pricing={version:1,tool:'pricing-simulator',fields:{cost:'200',fixed:'12345',count:'20',fee:'12',flat:'30',target:'9876',bulkInput:'ITEM-001,500,0,10,10,0,0'}};
       await page.evaluate(([ks,m,p])=>{localStorage.setItem(ks[0],JSON.stringify([['ITEM-A','商品A','1500','3500','メルカリ','出品中'],['ITEM-B','商品B','','','','準備中']]));localStorage.setItem(ks[1],JSON.stringify(m));localStorage.setItem(ks[2],JSON.stringify(p));sessionStorage.clear()},[keys,market,pricing]);await page.reload({waitUntil:'domcontentloaded'});
       await send('marketplace-profit-compare');await page.locator('#handoffAccept').click();await page.locator('#marketProductChoice').selectOption('0');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#status','商品台帳から反映');if(await page.locator('#cost').inputValue()!=='1500'||await page.locator('#other').inputValue()!=='30'||await page.locator('#ms').inputValue()!=='500'||await page.locator('#yp').inputValue()!=='3500'||await page.locator('#export').isEnabled())throw Error('Product handoff fields or stale result');
       await page.locator('#calc').click();page.once('dialog',d=>d.accept());await page.locator('#formDraftSave').click();await waitForText('#formDraftStatus','入力を保存しました');
       await open('shipping-cost-report');await page.locator('#sample').click();await send('marketplace-profit-compare');await page.locator('#handoffAccept').click();await page.locator('#marketShippingChoice').selectOption('0');await page.locator('#marketShippingTarget').selectOption('m');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#status','平均配送費の目安を反映');if(await page.locator('#ms').inputValue()!=='934'||await page.locator('#ys').inputValue()!=='600'||await page.locator('#cost').inputValue()!=='1500')throw Error('Shipping average or unrelated fields');
       await page.locator('#calc').click();await send('pricing-simulator');await page.locator('#handoffAccept').click();await page.locator('#pricingMarketChoice').selectOption('0');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#copyStatus','販売先別の原価');if(await page.locator('#cost').inputValue()!=='2514'||await page.locator('#fee').inputValue()!=='10'||await page.locator('#fixed').inputValue()!=='12345'||await page.locator('#target').inputValue()!=='9876'||await page.locator('#bulkInput').inputValue()!==pricing.fields.bulkInput||await page.locator('#copyResult').isEnabled())throw Error('Pricing handoff or saved settings lost');await page.locator('#calculate').click();if(!await page.locator('#copyResult').isEnabled())throw Error('Pricing recalc failed');if(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).fields.cost,keys[2])!=='200')throw Error('Handoff silently saved');
     }finally{await page.evaluate(([ks,prior])=>{ks.forEach((k,i)=>prior[i]===null?localStorage.removeItem(k):localStorage.setItem(k,prior[i]));sessionStorage.clear()},[keys,prior])}
   });
   await test(local('tools/pricing-simulator/index.html'),async()=>{
     const keys=['ogb-product-ledger-v1','ogb-form-draft-v1:pricing-simulator'],open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/')};await open('product-ledger');const prior=await page.evaluate(ks=>ks.map(k=>localStorage.getItem(k)),keys);
     const original=[['ITEM-001','商品A','400','900','メルカリ','準備中'],['ITEM-002','商品B','800','1500','ヤフオク','出品中']];
     try{
       await page.evaluate(([ks,rows])=>{localStorage.setItem(ks[0],JSON.stringify(rows));localStorage.removeItem(ks[1]);sessionStorage.clear()},[keys,original]);await open('pricing-simulator');await page.locator('#bulkInput').fill('ITEM-001,400,20000,100,10,0,50000\nUNKNOWN,800,0,10,12.5,30,1000');await page.locator('#bulkCalc').click();await send('product-ledger');await page.locator('#handoffAccept').click();if(!await page.locator('[data-price-sku="UNKNOWN"]').isDisabled()||await page.locator('[data-price-sku="ITEM-001"]').isChecked())throw Error('Price review selection');if(JSON.stringify(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),keys[0]))!==JSON.stringify(original))throw Error('Preview mutated ledger');await page.locator('#ledgerPriceKind').selectOption('1');await page.locator('[data-price-sku="ITEM-001"]').check();page.once('dialog',d=>d.dismiss());await page.locator('#handoffAccept').click();if(JSON.stringify(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),keys[0]))!==JSON.stringify(original))throw Error('Cancelled price update changed ledger');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#status','1商品の販売価格を更新');let stored=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),keys[0]);if(JSON.stringify(stored)!==JSON.stringify([['ITEM-001','商品A','400','1223','メルカリ','準備中'],original[1]]))throw Error('Bulk update changed unrelated fields');
       await open('pricing-simulator');await page.locator('#cost').fill('800');await page.locator('#fixed').fill('0');await page.locator('#count').fill('10');await page.locator('#fee').fill('0');await page.locator('#flat').fill('0');await page.locator('#target').fill('2000');if(await page.locator('#sendSinglePrice').isEnabled())throw Error('Stale single price result');await page.locator('#calculate').click();page.once('dialog',d=>d.accept());await page.locator('#sendSinglePrice').click();await page.waitForURL('**/tools/product-ledger/');await page.locator('#handoffAccept').click();await page.locator('#ledgerPriceKind').selectOption('2');await page.locator('#ledgerPriceSku').selectOption('ITEM-002');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#status','1商品の販売価格を更新');stored=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),keys[0]);if(stored[1][3]!=='800'||stored[0][3]!=='1223'||stored[1][5]!=='出品中')throw Error('Single break-even update');
       await send('product-listing-prep');await page.locator('#handoffAccept').click();await page.locator('#registeredListingChoice').selectOption('ITEM-001');await waitForText('#registeredListingDetails','1223円');await page.locator('#registeredListingFilter').selectOption('出品中');if(await page.locator('#registeredListingChoice option').count()!==2)throw Error('Registered listing filter');await page.locator('#registeredListingChoice').selectOption('ITEM-002');await waitForText('#registeredListingDetails','800円');if(JSON.stringify(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),keys[0]))!==JSON.stringify(stored))throw Error('Listing view mutated ledger');
     }finally{await page.evaluate(([ks,prior])=>{ks.forEach((k,i)=>prior[i]===null?localStorage.removeItem(k):localStorage.setItem(k,prior[i]));sessionStorage.clear()},[keys,prior])}
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     const keys=['ogb-csv-grid-draft-v1:/tools/inventory-movement/','ogb-grid-draft-v1:/tools/product-margin-report/'],open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'});
     const text='注文番号,SKU,数量,販売単価,原価,手数料,送料,発送日\nO001,A001,2,1000,400,200,300,2026-11-05\nO002,A001,1,1200,400,120,200,2026-11-06';
     await open('order-line-aggregate');const prior=await page.evaluate(ks=>ks.map(k=>localStorage.getItem(k)),keys);
     const inventory={version:1,labels:['日付','SKU','区分','数量','摘要'],settings:{},data:'日付,SKU,区分,数量,摘要\n2026-11-01,A001,開始,10,'},margin={fields:['SKU','販売数量','単価','単位原価','販売手数料合計','送料合計'],data:[['OLD','1','999','100','0','0']]};
     const send=async mode=>{await open('order-line-aggregate');await page.locator('#file').setInputFiles({name:'sales.csv',mimeType:'text/csv',buffer:Buffer.from(text)});await page.locator('#load').click();await waitForText('#loadStatus','2明細行');await page.locator('#salesLinkMode').selectOption(mode);for(const [id,value] of Object.entries(mode==='profit'?{sku:'1',qty:'2',price:'3',cost:'4',fee:'5',shipping:'6'}:{order:'0',sku:'1',qty:'2',date:'7'}))await page.locator('#salesLink-'+id).selectOption(value);if(mode==='stock')await page.locator('#salesLinkSource').fill('店A');await page.locator('#salesLinkConfirmed').check();page.once('dialog',d=>d.accept());await page.locator('#salesLinkSend').click();await page.waitForURL('**/tools/'+(mode==='profit'?'product-margin-report':'inventory-movement')+'/')};
     try{
       await page.evaluate(([ks,i,m])=>{localStorage.setItem(ks[0],JSON.stringify(i));localStorage.setItem(ks[1],JSON.stringify(m));sessionStorage.clear()},[keys,inventory,margin]);
       await send('profit');page.once('dialog',d=>d.dismiss());await page.locator('#handoffAccept').click();if(await page.locator('#entryRows input').first().inputValue()!=='')throw Error('Cancelled profit replacement');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#summary','売上合計：3,200円');await waitForText('#summary','利益合計：1,180円');if(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).data[0][0],keys[1])!=='OLD')throw Error('Profit saved draft overwritten');
       await send('stock');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#result','追加 2件');await page.locator('#calculate').click();await waitForText('#result','現在庫合計：7個');page.once('dialog',d=>d.accept());await page.locator('#csvDraftSave').click();await waitForText('#csvDraftStatus','保存しました');
       await send('stock');await page.locator('#handoffAccept').click();await waitForText('#result','追加 0件、反映済み 2件');await page.locator('#calculate').click();await waitForText('#result','現在庫合計：7個');
     }finally{await page.evaluate(([ks,prior])=>{ks.forEach((k,i)=>prior[i]===null?localStorage.removeItem(k):localStorage.setItem(k,prior[i]));sessionStorage.clear()},[keys,prior])}
   });
   await test(local('tools/side-income-summary/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'}),send=async slug=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/')};
     await open('annual-income-summary');await page.evaluate(()=>{sessionStorage.clear();for(const s of ['annual-income-summary','income-tax-simulator','resident-tax-simulator','tax-reserve-planner'])localStorage.removeItem('ogb-tax-form-draft-2026-v1:/tools/'+s+'/')});await page.reload({waitUntil:'domcontentloaded'});await page.locator('#expenses').fill('1234');await page.locator('#taxDraftSave').click();
     await open('product-margin-report');await page.locator('#sample').click();await send('annual-income-summary');await page.locator('#handoffAccept').click();await page.locator('#preview').waitFor({state:'visible'});if(await page.locator('#expenses').inputValue()!=='1234')throw Error('Tax draft restore lost expenses');await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#sales').inputValue()!=='11000'||await page.locator('#goods').inputValue()!=='5200'||await page.locator('#expenses').inputValue()!=='1234')throw Error('Product annual handoff');
     await open('channel-profit-report');await page.locator('#sample').click();await send('annual-income-summary');await page.locator('#handoffAccept').click();await page.locator('#preview').waitFor({state:'visible'});await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#sales').inputValue()!=='23000')throw Error('Channel annual handoff');
     await open('expense-category-report');await page.locator('#sample').click();await send('annual-income-summary');await page.locator('#handoffAccept').click();await page.locator('#preview').waitFor({state:'visible'});await page.locator('#expenseOptions input').first().check();await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#expenses').inputValue()!=='8000')throw Error('Expense annual handoff');
     await open('annual-expense-merge');await page.locator('#file').setInputFiles({name:'expense.csv',mimeType:'text/csv',buffer:Buffer.from('経費科目,取引件数,支出金額\n消耗品費,1,900')});await page.locator('#sources input').first().waitFor();await page.locator('#sources input').first().check();await page.locator('#confirm').check();await page.locator('#calculate').click();await send('annual-income-summary');await page.locator('#handoffAccept').click();await page.locator('#preview').waitFor({state:'visible'});await page.locator('#expenseOptions input').first().check();await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#expenses').inputValue()!=='900')throw Error('Merged expense handoff');
     await open('income-tax-simulator');await page.locator('#business').fill('1000000');await page.locator('#social').fill('100000');await page.locator('#taxDraftSave').click();
     await open('side-income-summary');await page.locator('#sample').click();await page.locator('#calculate').click();await send('income-tax-simulator');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#sideStatus','副業・給与所得を反映');if(await page.locator('#other').inputValue()!=='3550000'||await page.locator('#business').inputValue()!=='1000000'||await page.locator('#social').inputValue()!=='100000')throw Error('Side income saved tax fields');
     await page.locator('#scope').check();await page.locator('#calculate').click();await send('tax-reserve-planner');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#importStatus','税額を反映');await page.locator('#savings').fill('50000');await page.locator('#taxDraftSave').click();const incomeTax=await page.locator('#incomeTax').inputValue();
     await open('resident-tax-simulator');await page.locator('#sample').click();await page.locator('#scope').check();await page.locator('#calculate').click();await send('tax-reserve-planner');page.once('dialog',d=>d.accept());await page.locator('#handoffAccept').click();await waitForText('#importStatus','税額を反映');if(await page.locator('#incomeTax').inputValue()!==incomeTax||await page.locator('#savings').inputValue()!=='50000')throw Error('Reserve handoff lost saved fields');
     await page.evaluate(()=>{for(const s of ['annual-income-summary','income-tax-simulator','resident-tax-simulator','tax-reserve-planner'])localStorage.removeItem('ogb-tax-form-draft-2026-v1:/tools/'+s+'/')});
   });
   await test(local('tools/daily-sales-ledger/index.html'),async()=>{
     const open=slug=>page.goto(ledgerOrigin+'/tools/'+slug+'/',{waitUntil:'domcontentloaded'});
     await open('daily-sales-ledger');await page.evaluate(()=>sessionStorage.clear());await page.locator('#sample').click();
     const send=async(slug)=>{page.once('dialog',d=>d.accept());await page.locator('#handoff-'+slug).click();await page.waitForURL('**/tools/'+slug+'/');await page.locator('#handoffAccept').click()};
     await send('cash-register-close');await waitForText('#salesImportStatus','12,000円');if(await page.locator('#date').inputValue()!=='2026-11-23'||await page.locator('#salesApply').isDisabled())throw Error('Cash handoff preview');page.once('dialog',d=>d.accept());await page.locator('#salesApply').click();if(await page.locator('#sales').inputValue()!=='12000')throw Error('Cash handoff value');
     await open('daily-sales-ledger');await page.locator('#sample').click();await send('sales-summary');await waitForText('#summary','25,000円');await send('annual-income-summary');await page.locator('#preview').waitFor({state:'visible'});if(await page.locator('#sales').inputValue()!=='0')throw Error('Annual handoff applied before confirmation');await page.locator('#confirmPeriod').check();await page.locator('#apply').click();if(await page.locator('#sales').inputValue()!=='25000')throw Error('Annual handoff');
     await page.locator('#calculate').click();await send('income-tax-simulator');await page.locator('#preview').waitFor({state:'visible'});await page.locator('#apply').click();if(await page.locator('#business').inputValue()!=='25000')throw Error('Income handoff');
     await page.locator('#scope').check();await page.locator('#calculate').click();await send('resident-tax-simulator');await page.locator('#preview').waitFor({state:'visible'});await page.locator('#apply').click();if(await page.locator('#income').inputValue()!=='25000'||await page.locator('#scope').isChecked())throw Error('Resident handoff');if(await page.evaluate(()=>sessionStorage.getItem('ogb-tool-handoff-v1'))!==null)throw Error('Handoff not consumed');
   });
   await test(local('tools/cash-register-close/index.html'),async()=>{
     await page.locator('#date').fill('2026-11-26');const h='営業日,決済方法,売上金額,摘要\n',csv=h+'2026-11-26,現金,12000,午前\n2026-11-26,カード,8000,午後\n2026-11-26,現金,3000,夕方\n2026-11-25,現金,40000,前日';
     await page.locator('#salesFile').setInputFiles({name:'sales.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await waitForText('#salesImportStatus','15,000円');if(await page.locator('#salesApply').isDisabled())throw Error('Register cash preview');
     page.once('dialog',d=>d.accept());await page.locator('#salesApply').click();if(await page.locator('#sales').inputValue()!=='15000'||!await page.locator('#download').isDisabled())throw Error('Register cash import');
     await page.locator('#calc').click();if(!(await page.locator('#result').innerText()).includes('40,000円'))throw Error('Register imported balance');
     await page.locator('#salesFile').setInputFiles({name:'sales.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await waitForText('#salesImportStatus','15,000円');await page.locator('#date').fill('2026-11-27');if(!await page.locator('#salesApply').isDisabled())throw Error('Stale register import');
     await page.locator('#salesFile').setInputFiles({name:'sales.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await waitForText('#salesImportStatus','明細がありません');if(await page.locator('#sales').inputValue()!=='15000')throw Error('Missing date changed cash sales');
   });
   await test(local('tools/returns-refunds/index.html'),async()=>{
     const key='ogb-returns-refunds-v1';await page.evaluate(k=>localStorage.removeItem(k),key);await page.reload();await page.locator('#sample').click();
     await page.locator('#rows tr').first().getByRole('button',{name:'編集',exact:true}).click();await page.locator('#amount').fill('3500');await page.locator('#add').click();
     if(await page.locator('#rows tr').count()!==3||!(await page.locator('#summary').innerText()).includes('未完了額：3,500円'))throw Error('Return edit');
     await page.locator('#draftSave').click();await page.reload();page.once('dialog',d=>d.accept());await page.locator('#draftRestore').click();await waitForText('#draftStatus','復元しました');if(await page.locator('#rows tr').count()!==3||!(await page.locator('#summary').innerText()).includes('未完了額：3,500円'))throw Error('Return draft');
     page.once('dialog',d=>d.accept());await page.locator('#draftDelete').click();if(await page.evaluate(k=>localStorage.getItem(k),key)!==null)throw Error('Return draft deletion');
   });
   await test(local('tools/packing-checklist/index.html'),async()=>{
     const key='ogb-packing-checklist-v1';await page.evaluate(k=>localStorage.removeItem(k),key);await page.reload();await page.locator('#sample').click();
     for(let i=0;i<5;i++)await page.locator('#rows tr').first().locator('input').nth(i).check();
     await page.locator('#packingFilter').selectOption('open');if(await page.locator('#rows tr:visible').count()!==2)throw Error('Packing open filter');
     await page.locator('#packingFilter').selectOption('done');if(await page.locator('#rows tr:visible').count()!==1)throw Error('Packing done filter');
     const dl=page.waitForEvent('download');await page.locator('#export').click();const csv=fs.readFileSync(await(await dl).path(),'utf8');if(!csv.includes('ORDER-003'))throw Error('Packing filter changed CSV');
     await page.locator('#draftSave').click();await page.reload();page.once('dialog',d=>d.accept());await page.locator('#draftRestore').click();await waitForText('#draftStatus','復元しました');if(!(await page.locator('#summary').innerText()).includes('発送準備完了：1件'))throw Error('Packing draft progress');
     page.once('dialog',d=>d.accept());await page.locator('#draftDelete').click();if(await page.evaluate(k=>localStorage.getItem(k),key)!==null)throw Error('Packing draft delete');
   });
   await test(local('tools/daily-sales-ledger/index.html'),async()=>{
     const key='ogb-daily-sales-ledger-v1';await page.evaluate(k=>localStorage.removeItem(k),key);await page.reload();
     await page.locator('#sample').click();
     await page.locator('#rows tr').first().getByRole('button',{name:/の明細を編集/}).click();
     await page.locator('#amount').fill('13000');await page.locator('#add').click();
     if(await page.locator('#rows tr').count()!==3||!(await page.locator('#summary').innerText()).includes('26,000円'))throw Error('Daily sales edit');
     await page.locator('#draftSave').click();await page.reload();if(await page.locator('#rows tr').count()!==0)throw Error('Ledger restored without request');
     page.once('dialog',d=>d.accept());await page.locator('#draftRestore').click();
     if(await page.locator('#rows tr').count()!==3||!(await page.locator('#summary').innerText()).includes('26,000円'))throw Error('Daily sales restore');
     page.once('dialog',d=>d.accept());await page.locator('#draftDelete').click();if(await page.evaluate(k=>localStorage.getItem(k),key)!==null||await page.locator('#rows tr').count()!==3)throw Error('Daily sales delete');
   });
   await test(local('tools/daily-sales-ledger/index.html'),async()=>{
     const csv=['営業日,決済方法,売上金額,摘要','2026-11-24,現金,1200,午前','2026-11-24,カード,800,午後'].join(String.fromCharCode(10));
     await page.locator('#importFile').setInputFiles({name:'daily-sales-ledger.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
     await page.waitForFunction(()=>!document.querySelector('#importFile,#restore').value);
     if(await page.locator('#rows tr').count()!==2)throw new Error('Sales CSV restore row count incorrect');
     if(!(await page.locator('#summary').innerText()).includes('売上合計：2,000円'))throw new Error('Sales CSV restore sum incorrect');
     const bad=['営業日,決済方法,売上金額,摘要','2026-02-30,現金,100,不正'].join(String.fromCharCode(10));
     await page.locator('#importFile').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from(bad)});
     await page.waitForFunction(()=>!document.querySelector('#importFile,#restore').value);
     if(!(await page.locator('#error').innerText()).includes('営業日'))throw new Error('Invalid sales date imported');
     if(await page.locator('#rows tr').count()!==2)throw new Error('Failed import overwrote sales ledger');
   });
   await test(local('tools/returns-refunds/index.html'),async()=>{
     const csv=['受付日,注文番号,SKU・商品,理由,返金予定額,対応状況','2026-11-24,ORDER-1,SKU-1,商品不良,2500,返金待ち'].join(String.fromCharCode(10));
     await page.locator('#importFile').setInputFiles({name:'returns-refunds.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
     await page.waitForFunction(()=>!document.querySelector('#importFile,#restore').value);
     if(await page.locator('#rows tr').count()!==1)throw new Error('Returns CSV restore row count incorrect');
     if(!(await page.locator('#summary').innerText()).includes('未完了額：2,500円'))throw new Error('Returns CSV restore sum incorrect');
   });
   await test(local('tools/daily-sales-ledger/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==3) throw new Error('Sales ledger sample rows incorrect');
     if(!(await page.locator('#summary').innerText()).includes('売上合計：25,000円')) throw new Error('Sales ledger sum incorrect');
     if(!(await page.locator('#summary').innerText()).includes('カード：8,000円')) throw new Error('Sales ledger payment grouping incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('QR決済')||!csv.includes('12000')) throw new Error('Sales ledger CSV export incorrect');
     await page.locator('#amount').fill('-10');
     await page.locator('#add').click();
     if(!(await page.locator('#error').innerText()).includes('0以上')) throw new Error('Negative sales amount accepted');
     page.once('dialog',d=>d.accept());
     await page.locator('#clear').click();
     if(!(await page.locator('#export').isDisabled())) throw new Error('Sales ledger stale CSV export enabled');
   });
   await test(local('tools/packing-checklist/index.html'),async()=>{
     const csv=['注文番号,商品・数量,商品状態,梱包,宛先・配送方法,発送準備完了','ORDER-1,済,済,済,済,済','ORDER-2,済,未,未,未,未'].join(String.fromCharCode(10));
     await page.locator('#restore').setInputFiles({name:'packing-checklist.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
     await page.waitForFunction(()=>!document.querySelector('#importFile,#restore').value);
     if(await page.locator('#rows tr').count()!==2)throw new Error('Packing CSV restore count incorrect');
     if(!(await page.locator('#summary').innerText()).includes('発送準備完了：1件'))throw new Error('Packing CSV restore progress incorrect');
     const aggregate=['注文番号,注文別合計,明細行数','ORDER-1,1200,2','0003,500,1'].join('\n');
     await page.locator('#orderCsv').setInputFiles({name:'order-totals.csv',mimeType:'text/csv',buffer:Buffer.from(aggregate)});
     await page.waitForFunction(()=>!document.querySelector('#orderCsv').value);
     if(await page.locator('#rows tr').count()!==2||!(await page.locator('#orders').inputValue()).includes('0003'))throw new Error('Packing aggregate import incorrect');
     if(!(await page.locator('#summary').innerText()).includes('発送準備完了：1件'))throw new Error('Packing aggregate import lost progress');
     await page.locator('#orderCsv').setInputFiles({name:'duplicate.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,注文別合計\nA,100\nA,200')});
     await page.waitForFunction(()=>!document.querySelector('#orderCsv').value);
     if(!(await page.locator('#error').innerText()).includes('重複')||await page.locator('#rows tr').count()!==2)throw new Error('Packing aggregate invalid import changed rows');
     await page.locator('#orders').fill('ORDER-1'+String.fromCharCode(10)+'ORDER-1');
     await page.locator('#build').click();
     if(!(await page.locator('#error').innerText()).includes('重複'))throw new Error('Packing duplicate accepted');
   });
   await test(local('tools/packing-checklist/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==3) throw new Error('Packing checklist sample count incorrect');
     const row=page.locator('#rows tr').first();
     await row.locator('input[type=checkbox]').nth(4).click();
     if(!(await page.locator('#error').innerText()).includes('先に4項目')) throw new Error('Packing completion allowed before verification');
     for(let i=0;i<4;i++)await page.locator('#rows tr').first().locator('input[type=checkbox]').nth(i).check();
     await page.locator('#rows tr').first().locator('input[type=checkbox]').nth(4).check();
     if(!(await page.locator('#summary').innerText()).includes('発送準備完了：1件')) throw new Error('Packing completion count incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('ORDER-001')||!csv.includes('発送準備完了')) throw new Error('Packing checklist CSV export missing');
     await page.locator('#orders').fill('ORDER-001\nORDER-001');
     await page.locator('#build').click();
     if(!(await page.locator('#error').innerText()).includes('重複')) throw new Error('Duplicate order accepted');
     if(!(await page.locator('#export').isDisabled())) throw new Error('Stale packing export remained enabled');
   });
   await test(local('tools/product-listing-prep/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#rows tr').count()!==3) throw new Error('Product listing sample count incorrect');
     if(!(await page.locator('#rows tr').first().innerText()).includes('ITEM-0001')) throw new Error('Product listing SKU generation incorrect');
     await page.locator('#limit').fill('2');
     await page.locator('#generate').click();
     if(!(await page.locator('#summary').innerText()).includes('文字数目安超過：3件')) throw new Error('Product title limit warning incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.includes('ITEM-0001')||!csv.includes('ステンレスボトル')) throw new Error('Product listing CSV export failed');
     const templateDownload=page.waitForEvent('download');
     await page.locator('#inventoryTemplate').click();
     const template=fs.readFileSync(await (await templateDownload).path(),'utf8');
     if(!template.includes('"商品コード","現在庫","入荷待ち","引当済み","1日平均販売数","納期日数","安全在庫","目標日数"')||!template.includes('"ITEM-0001","","","","","","",""'))throw new Error('Inventory template missing SKU or blank inputs');
     const pricingDownload=page.waitForEvent('download');
     await page.locator('#pricingTemplate').click();
     const pricing=fs.readFileSync(await (await pricingDownload).path(),'utf8');
     if(!pricing.includes('"SKU","原価","月間固定費","月間販売数","手数料率","固定手数料","目標月間利益"')||!pricing.includes('"ITEM-0001","","","","","",""'))throw new Error('Pricing template incorrect');
     await page.locator('#start').fill('9999');
     await page.locator('#generate').click();
     if(!(await page.locator('#error').innerText()).includes('桁数')) throw new Error('SKU overflow not rejected');
     if(!(await page.locator('#export').isDisabled())||!(await page.locator('#inventoryTemplate').isDisabled())||!(await page.locator('#pricingTemplate').isDisabled())) throw new Error('Stale SKU export remained enabled');
   });
   await test(local('tools/cash-register-close/index.html'),async()=>{
     await page.locator('#sample').click();
     if(!(await page.locator('#result').innerText()).includes('現金過不足：-10,000円')) throw new Error('Cash register shortage calculation incorrect');
     await page.locator('#n10000').fill('4');
     await page.locator('#calc').click();
     if(!(await page.locator('#result').innerText()).includes('現金過不足：0円')) throw new Error('Cash register balanced calculation incorrect');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#download').click();
     const data=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!data.includes('帳簿上の現金残高')||!data.includes('実査現金')) throw new Error('Cash register CSV export missing values');
     await page.locator('#opening').fill('');
     await page.locator('#calc').click();
     if(!(await page.locator('#download').isDisabled())) throw new Error('Invalid cash close still downloadable');
     if(!(await page.locator('#error').innerText()).includes('整数')) throw new Error('Empty opening cash accepted');
   });
   await test(local('tools/inventory-reorder/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#resultBody tr').count()!==3) throw new Error('Inventory sample did not load');
     if(!(await page.locator('#summary').innerText()).includes('発注対象：1商品')) throw new Error('Inventory reorder sample classification incorrect');
     const row=await page.locator('#resultBody tr').first().innerText();
     if(!row.includes('20')||!row.includes('50')) throw new Error('Inventory reorder calculation incorrect');
     const purchaseDownload=page.waitForEvent('download');
     await page.locator('#purchaseTemplate').click();
     const purchase=fs.readFileSync(await (await purchaseDownload).path(),'utf8');
     if(!purchase.includes('"発注番号","SKU","発注数量","入荷数量","仕入単価"')||!purchase.includes('"","SKU-001","50","",""')||purchase.includes('SKU-002')||purchase.includes('SKU-003'))throw new Error('Purchase template incorrect');
     await page.evaluate(()=>{try{loadCSV('商品コード,現在庫,入荷待ち,引当済み,1日平均販売数,納期日数,安全在庫,目標日数\nA,1,0,0,1,1,1,7\nA,2,0,0,1,1,1,7')}catch(e){resetBatch(e.message)}});
     if(!(await page.locator('#error').innerText()).includes('重複')) throw new Error('Duplicate SKU was not rejected');
     if(!(await page.locator('#export').isDisabled())||!(await page.locator('#purchaseTemplate').isDisabled())) throw new Error('Invalid inventory retained CSV export');
     await page.evaluate(()=>{try{loadCSV('商品コード,現在庫,入荷待ち,引当済み,1日平均販売数,納期日数,安全在庫,目標日数\\nA,1,0,0,1,1,1,7\\nB,1,0,0,1,1,1,7"unexpected')}catch(e){resetBatch(e.message)}});
     if(!(await page.locator('#error').innerText()).includes('引用符')) throw new Error('Malformed quoted CSV was not rejected');
     await page.locator('#stock').fill('');
     await page.locator('#calc').click();
     if(!(await page.locator('#singleResult').innerText()).includes('数値をすべて')) throw new Error('Blank stock was accepted as zero');
     await page.locator('#stock').fill('12');
     await page.locator('#sample').click();
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#export').click();
     const file=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!file.includes('SKU-001')||!file.includes('発注目安')) throw new Error('Inventory CSV export missing results');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.evaluate(()=>{
       load('分類,金額\nA,10\nB,20');
       const t=state.stats.find(t=>t.index===1);
       t.min=-1e308;t.max=1e308;t.values=[-1e308,1e308];
       document.querySelector('#chartType').value='hist';
       renderChart();
     });
     if(!(await page.locator('#chartError').innerText()).includes('数値範囲が大きすぎて')) throw new Error('Histogram overflow was not reported');
     if(await page.evaluate(()=>state.group.length)!==0) throw new Error('Histogram overflow retained exportable data');
     if(await page.locator('#groupBody tr').count()!==0) throw new Error('Histogram overflow retained preview rows');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     const result=await page.evaluate(()=>median([1e308,1e308]));
     if(result!==1e308) throw new Error('CSV analyzer median overflowed');
     const fractional=await page.evaluate(()=>median([1.5,2.5]));
     if(fractional!==2) throw new Error('CSV analyzer fractional median incorrect');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.evaluate(()=>{
       load('分類,金額\nA,10\nB,20');
       state.rows=[['A','1e308'],['A','1e308']];
       document.querySelector('#chartType').value='pie';
       renderChart();
     });
     if(!(await page.locator('#chartError').innerText()).includes('計算可能な範囲')) throw new Error('Aggregate overflow was not reported');
     if(await page.evaluate(()=>state.group.length)!==0) throw new Error('Overflow retained exportable aggregate');
     if(await page.locator('#groupBody tr').count()!==0) throw new Error('Overflow retained chart preview');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.evaluate(()=>load('分類,金額\nA,-10\nB,20'));
     await page.locator('#chartType').selectOption('pie');
     await page.locator('#agg').selectOption('sum');
     if(!(await page.locator('#chartError').innerText()).includes('負の値')) throw new Error('Negative pie values not rejected');
     if(await page.evaluate(()=>state.group.length)!==0) throw new Error('Invalid chart retained exportable aggregates');
     if(await page.locator('#groupBody tr').count()!==0) throw new Error('Invalid chart retained preview rows');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#file').setInputFiles({name:'source.csv',mimeType:'text/csv',buffer:Buffer.from('Name,Value\nA,10','utf8')});
     await page.waitForFunction(()=>document.querySelector('#results')?.hidden===false);
     await page.locator('#sample').click();
     if(await page.locator('#file').inputValue()!=='') throw new Error('Analyzer demo left a stale file selection');
     if(await page.locator('#results').isHidden()) throw new Error('Analyzer demo failed to load');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     const rows=Array.from({length:100001},()=>['1']);
     const status=await page.evaluate(data=>{
       const original=parseCSV;
       try{
         parseCSV=()=>data;
         document.querySelector('#hasHeader').checked=false;
         load('ignored');
         return document.querySelector('#status').textContent;
       }finally{parseCSV=original}
     },rows);
     if(!status.includes('10万行以下')) throw new Error('Headerless analyzer accepted 100001 rows');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#results').isHidden()) throw new Error('Analyzer demo missing');
     await page.locator('#encoding').selectOption('shift_jis');
     if(!await page.locator('#results').isHidden()||await page.evaluate(()=>state.rows.length)!==0) throw new Error('Stale analyzer rows after encoding change');
     await page.locator('#encoding').selectOption('utf-8');
     await page.locator('#file').setInputFiles({name:'sample.csv',mimeType:'text/csv',buffer:Buffer.from('商品,売上\nA,100\nB,200','utf8')});
     await page.waitForFunction(()=>document.querySelector('#results')?.hidden===false);
     await page.locator('#hasHeader').uncheck();
     if(!await page.locator('#results').isHidden()) throw new Error('Stale analyzer rows after header change');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#results').isHidden()) throw new Error('CSV analyzer results missing');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#downloadReport').click();
     const csv=fs.readFileSync(await (await downloadPromise).path(),'utf8');
     if(!csv.trim()) throw new Error('CSV analyzer report empty');
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     await page.locator('#files').setInputFiles([
       {name:'first.csv',mimeType:'text/csv',buffer:Buffer.from('商品,売上\nA,100','utf8')},
       {name:'second.csv',mimeType:'text/csv',buffer:Buffer.from('商品,売上,地域\nB,200,東京','utf8')}
     ]);
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     const details=await page.locator('#details').innerText();
     if(!details.includes('追加された列：地域')||!details.includes('欠けている列：地域')) throw new Error('Per-file column differences were not reported: '+details);
     const pending=page.waitForEvent('download');
     await page.locator('#downloadLog').click();
     const report=fs.readFileSync(await (await pending).path(),'utf8');
     if(!report.includes('追加された列：地域')||!report.includes('欠けている列：地域')) throw new Error('Column differences missing from exported audit report');
     if(!report.includes('出力行数')) throw new Error('Audit report missing per-file output row counts');
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     const inputs=['tokyo','osaka','nagoya'].map(city=>path.resolve(__dirname,'../examples/csv-merge-'+city+'.csv'));
     await page.locator('#files').setInputFiles(inputs);
     await page.locator('#encoding').selectOption('shift_jis');
     await page.locator('#mode').selectOption('position');
     await page.locator('#source').uncheck();
     await page.locator('#dedup').check();
     await page.locator('#dedupMode').selectOption('source');
     await page.locator('#reset').click();
     if(await page.locator('#files').evaluate(el=>el.files.length)!==0) throw new Error('Reset did not clear selected CSV files');
     if(await page.locator('#encoding').inputValue()!=='utf-8'||await page.locator('#mode').inputValue()!=='name') throw new Error('Reset did not restore merge options');
     if(!await page.locator('#source').isChecked()||await page.locator('#dedup').isChecked()||await page.locator('#dedupMode').inputValue()!=='all') throw new Error('Reset did not restore deduplication defaults');
     await page.locator('#demo').click();
     if(await page.locator('#output').isHidden()) throw new Error('Sample merge failed before reset');
     await page.locator('#reset').click();
     if(!await page.locator('#output').isHidden()) throw new Error('Reset left stale merged results visible');
     if(await page.evaluate(()=>state.rows.length)!==0) throw new Error('Reset retained stale merged rows');
     if(!(await page.locator('#status').innerText()).includes('初期化しました')) throw new Error('Reset status was not announced');
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     await page.locator('#demo').click();
     if(await page.locator('#output').isHidden()) throw new Error('Demo merge failed');
     await page.locator('#files').setInputFiles([
       {name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('ID,金額\nA001,"100"oops','utf8')},
       {name:'good.csv',mimeType:'text/csv',buffer:Buffer.from('ID,金額\nA002,200','utf8')}
     ]);
     await page.locator('#merge').click();
     await waitForText('#status','閉じ引用符の後に文字');
     if(!await page.locator('#output').isHidden()) throw new Error('Stale merge output visible after failure');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#results').isHidden()) throw new Error('Analyzer sample did not load');
     await page.locator('#file').setInputFiles({name:'invalid-quote.csv',mimeType:'text/csv',buffer:Buffer.from('項目,金額\nA,"100"oops','utf8')});
     await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('閉じ引用符の後に文字'));
     if(!(await page.locator('#status').innerText()).includes('閉じ引用符の後に文字')) throw new Error('Analyzer accepted malformed quoted field');
     if(!await page.locator('#results').isHidden()) throw new Error('Analyzer retained stale results after invalid CSV');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#sample').click();
     if(await page.locator('#results').isHidden()) throw new Error('Initial sample load failed');
     await page.locator('#file').setInputFiles({name:'bad-data.csv',mimeType:'text/csv',buffer:Buffer.from('日付,売上\nA,"100"oops','utf8')});
     await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('閉じ引用符の後に文字'));
     if(!await page.locator('#results').isHidden()) throw new Error('Stale analyzer results visible');
     const cleared=await page.evaluate(()=>({rows:state.rows.length,report:state.reportRows.length}));
     if(cleared.rows||cleared.report) throw new Error('Stale analyzer data retained: '+JSON.stringify(cleared));
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     await page.locator('#demo').click();
     if(await page.locator('#output').isHidden()) throw new Error('Merge demo missing');
     await page.locator('#mode').selectOption('position');
     if(!await page.locator('#output').isHidden()) throw new Error('Merge results survived mode change');
     if(await page.evaluate(()=>state.rows.length)!==0) throw new Error('Merge rows survived mode change');
     await page.locator('#demo').click();
     await page.locator('#files').setInputFiles([
       {name:'a.csv',mimeType:'text/csv',buffer:Buffer.from('名前,金額\nA,100')},
       {name:'b.csv',mimeType:'text/csv',buffer:Buffer.from('名前,金額\nB,200')}
     ]);
     if(!await page.locator('#output').isHidden()) throw new Error('Old merge export visible after file change');
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     if(await page.locator('#body tr').count()!==2) throw new Error('Changed files not merged');
     await page.locator('#encoding').selectOption('shift_jis');
     if(!await page.locator('#output').isHidden()||await page.evaluate(()=>state.rows.length)!==0) throw new Error('Stale merge rows after encoding change');
   });
   await test(local('tools/csv-merge/index.html'),async()=>{
     await page.locator('#demo').click();
     if(await page.locator('#output').isHidden()) throw new Error('Merge sample failed');
     await page.locator('#merge').click();
     if(!(await page.locator('#status').innerText()).includes('CSVを2〜50ファイル')) throw new Error('Missing files not rejected');
     if(!await page.locator('#output').isHidden()) throw new Error('Old merge results still visible');
     const remaining=await page.evaluate(()=>state.rows.length);
     if(remaining!==0) throw new Error('Old merge rows still exportable');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#sample').click();
     await page.locator('#file').setInputFiles({name:'overflow.csv',mimeType:'text/csv',buffer:Buffer.from('数値\n1e308\n1e308','utf8')});
     await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('数値が大きすぎて'));
     if(!await page.locator('#results').isHidden()) throw new Error('Overflowing analysis results visible');
     const remaining=await page.evaluate(()=>state.reportRows.length);
     if(remaining) throw new Error('Overflowing analysis retained old report');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#sample').click();
     await page.locator('#file').setInputFiles({name:'variance-overflow.csv',mimeType:'text/csv',buffer:Buffer.from('数値\n-1e155\n1e155','utf8')});
     await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('標準偏差が計算可能な範囲を超えました'));
     if(!await page.locator('#results').isHidden()) throw new Error('Invalid standard deviation report visible');
   });
   await test(local('tools/pricing-simulator/index.html'),async()=>{
     const result=page.locator('#result');
     if(!(await result.innerText()).includes('1,223円')) throw new Error('Default pricing example differs from documented calculation');
     await page.locator('#count').fill('50');
     await page.locator('#calculate').click();
     if(!(await result.innerText()).includes('2,000円')) throw new Error('50-sale pricing example incorrect');
     await page.locator('#count').fill('200');
     await page.locator('#calculate').click();
     if(!(await result.innerText()).includes('834円')) throw new Error('200-sale pricing example incorrect');
     await page.locator('#fee').fill('100');
     await page.locator('#calculate').click();
     if(!(await result.innerText()).includes('算出できません')) throw new Error('100 percent fee was not rejected');
     await page.locator('#fee').fill('10');
     await page.locator('#cost').fill('1e308');
     await page.locator('#calculate').click();
     if(!(await result.innerText()).includes('算出できません')) throw new Error('Overflowing price was not rejected');
     if((await page.locator('#comparison').innerText()).includes('Infinity')) throw new Error('Invalid pricing comparison visible');
   });
   await test(local('tools/basic-statistics/index.html'),async()=>{
     await page.locator('#csv').setInputFiles({name:'quoted.csv',mimeType:'text/csv',buffer:Buffer.from('項目,金額\n"A,B",1200','utf8')});
     await waitForText('#stats-result','引用符付きCSV');
   });
   await test(local('tools/basic-statistics/index.html'),async()=>{
     await page.locator('#values').fill('999');
     await page.locator('#col').fill('3');
     await page.locator('#csv').setInputFiles({name:'short.csv',mimeType:'text/csv',buffer:Buffer.from('A,B\n10,20','utf8')});
     await page.waitForFunction(() => document.querySelector('#stats-result')?.textContent?.includes('指定列が存在しない'));
     if(await page.locator('#values').inputValue()) throw new Error('Old statistics values remained after missing-column import');
   });
   await test(local('index.html'),async()=>{
     const instituteTitle=await page.locator('.hero h1').innerText();
     if(!instituteTitle.includes('データを整理し')||!instituteTitle.includes('構造を読み解き')) throw new Error('Research institute introduction replaced');
     if(!(await page.locator('.hero a[href="data-lab/about/"]').count())) throw new Error('Institute introduction link missing');
     if((await page.locator('#workflows .workflow-card').count())!==3) throw new Error('Three practical workflows missing');
     for(const guide of ['order-reconciliation-hands-on','csv-merge-hands-on','pricing-simulator-hands-on']){
       const href='guides/'+guide+'/';
       if(!(await page.locator('#workflows a[href="'+href+'"]').count())) throw new Error('Workflow guide missing: '+href);
       if(!fs.existsSync(path.resolve(__dirname,'..',href,'index.html'))) throw new Error('Workflow guide target missing: '+href);
     }
     if((await page.locator('#choose-task .task-card').count())!==6) throw new Error('Homepage task choices missing');
     if(!(await page.locator('.hero a[href="#choose-task"]').count())) throw new Error('Hero task CTA missing');
     const links=page.locator('#choose-task .task-card a[href]');
     for(let i=0;i<await links.count();i++){
       const href=await links.nth(i).getAttribute('href');
       const target=path.resolve(__dirname,'..',href,'index.html');
       if(!fs.existsSync(target)) throw new Error('Homepage task link target missing: '+href);
     }
   });
   await test(local('tools/index.html'),async()=>{
     if(!(await page.locator('#task-quick-title').count())) throw new Error('Task quick navigation missing');
     if(!(await page.locator('a[href="../guides/order-payment-reconciliation/"]').count())) throw new Error('Reconciliation guide link missing');
   });
   await test(local('guides/order-reconciliation-hands-on/index.html'),async()=>{
     const links=page.locator('a[download]');
     if(await links.count()!==3) throw new Error('Expected three downloadable CSV examples');
     for(let i=0;i<await links.count();i++){
       const href=await links.nth(i).getAttribute('href');
       const file=path.resolve(__dirname,'..',href.replace(/^\//,''));
       if(!fs.existsSync(file)) throw new Error('Missing sample CSV: '+href);
     }
     const lines=fs.readFileSync(path.resolve(__dirname,'../examples/order-lines-sample.csv'),'utf8');
     const orders=fs.readFileSync(path.resolve(__dirname,'../examples/order-totals-sample.csv'),'utf8');
     const payments=fs.readFileSync(path.resolve(__dirname,'../examples/payments-sample.csv'),'utf8');
     const parse=(csv)=>csv.trim().split(/\r?\n/).slice(1).map(row=>row.split(','));
     const sums=new Map();
     for(const [id,amount] of parse(lines)) sums.set(id,(sums.get(id)||0)+Number(amount));
     for(const [id,amount] of parse(orders)) if(sums.get(id)!==Number(amount)) throw new Error('Sample totals mismatch: '+id);
     const pay=new Map(parse(payments).map(([id,amount])=>[id,Number(amount)]));
     if(pay.get('A001')!==sums.get('A001')||pay.get('A002')!==2400||pay.has('A003')||sums.has('A004')!==false) throw new Error('Sample reconciliation fixture mismatch');
   });
   // Real file handoff: downloaded training lines -> aggregate export -> reconciliation.
   let aggregatedCsv=null;
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     const input=path.resolve(__dirname,'../examples/order-lines-sample.csv');
     await page.locator('#file').setInputFiles(input);
     await page.locator('#load').click();
     await page.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
     await page.locator('#run').click();
     const summary=await page.locator('#summary').innerText();
     if(!summary.includes('5明細行')||!summary.includes('3注文')) throw new Error('Training aggregation summary incorrect: '+summary);
     const orderSearch=page.locator('#orderSearch');
     if(await orderSearch.isDisabled()) throw new Error('Order search should be enabled after aggregation');
     await orderSearch.fill('A002');
     if(await page.locator('#result tr').count()!==1) throw new Error('Order search should show one matching row');
     if(await page.locator('#saveSearch').isDisabled()) throw new Error('Search export should be enabled');
     const filteredOrdersDownload=page.waitForEvent('download');
     await page.locator('#saveSearch').click();
     const filteredOrdersCsv=fs.readFileSync(await (await filteredOrdersDownload).path(),'utf8');
     if(!filteredOrdersCsv.includes('A002,2500,2')||filteredOrdersCsv.includes('A001,1200,2')) throw new Error('Order filtered CSV includes wrong orders');
     if(!(await page.locator('#result').innerText()).includes('2500')) throw new Error('Order search returned wrong amount');
     if(!(await page.locator('#searchStatus').innerText()).includes('全件CSVは3注文')) throw new Error('Order search must preserve full export');
     const pending=page.waitForEvent('download');
     await page.locator('#save').click();
     const downloaded=await pending;
     aggregatedCsv=fs.readFileSync(await downloaded.path());
     const csv=aggregatedCsv.toString('utf8').replace(/^\uFEFF/,'');
     if(!csv.includes('A001,1200,2')||!csv.includes('A002,2500,2')||!csv.includes('A003,900,1')) throw new Error('Training aggregate export mismatch');
     await orderSearch.fill('A003');
     const nextDownload=page.waitForEvent('download');
     await page.locator('#saveSearch').click();
     const changed=fs.readFileSync(await (await nextDownload).path(),'utf8').replace(/^\uFEFF/,'');
     if(changed.split(/\r?\n/).slice(1).join()!=='A003,900,1') throw new Error('Changed search did not update export');
     await orderSearch.fill('not-found');
     if(await page.locator('#result tr').count()!==0) throw new Error('Unmatched order search should be empty');
     await page.locator('#clearSearch').click();
     if(await orderSearch.inputValue()!=='') throw new Error('Clear order search did not empty input');
     if(await page.locator('#result tr').count()!==3) throw new Error('Cleared order search should restore three orders');
     if(!(await page.locator('#saveSearch').isDisabled())) throw new Error('Search export should disable when search cleared');

   });
   if(aggregatedCsv){
     await test(local('tools/order-payment-reconcile/index.html'),async()=>{
       await page.locator('#orders').setInputFiles({name:'order-totals.csv',mimeType:'text/csv',buffer:aggregatedCsv});
       await page.locator('#payments').setInputFiles(path.resolve(__dirname,'../examples/payments-sample.csv'));
       await page.locator('#load').click();
       await page.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
       await page.locator('#run').click();
       const summary=await page.locator('#summary').innerText();
       for(const item of ['一致 1件','金額不一致 1件','受注のみ 1件','決済のみ 1件']){
         if(!summary.includes(item)) throw new Error('Training handoff missing '+item+': '+summary);
       }
       if(await page.locator('#results tr').count()!==4) throw new Error('Training handoff should produce four statuses');
       const filter=page.locator('#statusFilter');
       if(await filter.isDisabled()) throw new Error('Status filter should be enabled after reconciliation');
       if(!(await page.locator('#exportFiltered').isDisabled())) throw new Error('Filtered export must be disabled without selected status');
       await filter.selectOption('金額不一致');
       if(await page.locator('#results tr').count()!==1) throw new Error('Mismatch filter should show exactly one row');
       if(!(await page.locator('#results').innerText()).includes('A002')) throw new Error('Mismatch filter did not show A002');
       await page.locator('#idSearch').fill('A002');
       if(await page.locator('#results tr').count()!==1) throw new Error('ID search should retain A002');
       await page.locator('#idSearch').fill('not-found');
       if(await page.locator('#results tr').count()!==0) throw new Error('ID search should show zero unmatched rows');
       await page.locator('#idSearch').fill('');
       const filteredDownload=page.waitForEvent('download');
       await page.locator('#exportFiltered').click();
       const filteredFile=await filteredDownload;
       if(filteredFile.suggestedFilename()!=='order-payment-mismatch.csv') throw new Error('Filtered export filename wrong');
       const filteredCsv=fs.readFileSync(await filteredFile.path(),'utf8');
       if(!filteredCsv.includes('A002')||filteredCsv.includes('A001')||filteredCsv.includes('A003')||filteredCsv.includes('A004')) throw new Error('Filtered CSV should contain mismatch only');
       if(!(await page.locator('#filterStatus').innerText()).includes('全件CSVは4件')) throw new Error('Filter should preserve full CSV export');
       await filter.selectOption('受注のみ');
       if(!(await page.locator('#results').innerText()).includes('A003')) throw new Error('Orders-only filter did not show A003');
       await filter.selectOption('決済のみ');
       if(!(await page.locator('#results').innerText()).includes('A004')) throw new Error('Payments-only filter did not show A004');
       await filter.selectOption('ID重複');
       if(await page.locator('#results tr').count()!==0) throw new Error('Empty status should show no rows');
       await page.locator('#clearFilters').click();
       if(await filter.inputValue()!==''||await page.locator('#idSearch').inputValue()!=='') throw new Error('Clear filters did not reset controls');
       if(await page.locator('#results tr').count()!==4) throw new Error('Clearing filter should restore all rows');
       if(!(await page.locator('#exportFiltered').isDisabled())) throw new Error('Filtered export must disable after clearing filter');
       const pending=page.waitForEvent('download');
       await page.locator('#export').click();
       const downloaded=await pending;
       const csv=fs.readFileSync(await downloaded.path(),'utf8');
       if(!csv.includes('A002')||!csv.includes('A004')) throw new Error('Training reconciliation export incomplete');
     });
   }
   await test(local('tools/csv-merge/index.html'),async()=>{
     const files=['tokyo','osaka','nagoya'].map(city=>path.resolve(__dirname,'../examples/csv-merge-'+city+'.csv'));
     await page.locator('#files').setInputFiles(files);
     await page.locator('#mode').selectOption('name');
     await page.locator('#source').check();
     await page.locator('#dedup').uncheck();
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     if(await page.locator('#body tr').count()!==5) throw new Error('Training CSV merge should contain five rows');
     const headers=await page.locator('#head th').allTextContents();
     if(headers.join(',')!=='日付,商品,売上,元ファイル') throw new Error('Training CSV merge headers wrong: '+headers);
     const pending=page.waitForEvent('download');
     await page.locator('#download').click();
     const csv=fs.readFileSync(await (await pending).path(),'utf8');
     if(!csv.includes('11/1,A,1000,csv-merge-tokyo.csv')||!csv.includes('11/1,A,1000,csv-merge-osaka.csv')) throw new Error('Different stores lost in merge');
     await page.locator('#dedup').check();
     await page.locator('#dedupMode').selectOption('all');
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     if(await page.locator('#body tr').count()!==4) throw new Error('Data-only dedup should retain four rows');
     const metricText=await page.locator('#metrics').innerText();
     if(!metricText.includes('出力列数')||!metricText.includes('4列')) throw new Error('Merged column count missing: '+metricText);

     const fileAuditHeaders=await page.locator('#output table').first().locator('th').allTextContents();
     if(!fileAuditHeaders.includes('重複削除行数')) throw new Error('Per-file dedup count column missing');
     const fileCounts=await page.locator('#details tr').allTextContents();
     if(!fileCounts.some(x=>x.includes('2')&&x.includes('1'))) throw new Error('File-level retained rows were not displayed');
     await page.locator('#dedupMode').selectOption('source');
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     if(await page.locator('#body tr').count()!==5) throw new Error('Source-aware dedup should retain five rows');
   });
   // Verify the second complete workflow using the CSV actually exported by the merge tool.
   let mergedFixture=null;
   await test(local('tools/csv-merge/index.html'),async()=>{
     const inputs=['tokyo','osaka','nagoya'].map(city=>path.resolve(__dirname,'../examples/csv-merge-'+city+'.csv'));
     await page.locator('#files').setInputFiles(inputs);
     await page.locator('#mode').selectOption('name');
     await page.locator('#source').check();
     await page.locator('#dedup').uncheck();
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     const pending=page.waitForEvent('download');
     await page.locator('#download').click();
     mergedFixture=fs.readFileSync(await (await pending).path());
     if(!mergedFixture.toString('utf8').includes('csv-merge-nagoya.csv')) throw new Error('Merge export lost source names');
   });
   if(mergedFixture) await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#file').setInputFiles({name:'merged.csv',mimeType:'text/csv',buffer:mergedFixture});
     await page.waitForFunction(()=>document.querySelector('#results')?.hidden===false);
     const status=await page.locator('#status').innerText();
     if(!status.includes('5行・4列')) throw new Error('Merged CSV import row count mismatch: '+status);
     const stats=await page.locator('#summary').innerText();
     if(!stats.includes('売上')||!stats.includes('11,000')||!stats.includes('2,200')) throw new Error('Merged sales statistics mismatch: '+stats);
   });
   // Deleting data-only duplicates changes the sales total; verify this risk in the analyzer.
   let deduplicatedFixture=null;
   await test(local('tools/csv-merge/index.html'),async()=>{
     const inputs=['tokyo','osaka','nagoya'].map(city=>path.resolve(__dirname,'../examples/csv-merge-'+city+'.csv'));
     await page.locator('#files').setInputFiles(inputs);
     await page.locator('#mode').selectOption('name');
     await page.locator('#source').check();
     await page.locator('#dedup').check();
     await page.locator('#dedupMode').selectOption('all');
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     if(await page.locator('#body tr').count()!==4) throw new Error('Expected four rows after data-only dedup');
     const pending=page.waitForEvent('download');
     await page.locator('#download').click();
     deduplicatedFixture=fs.readFileSync(await (await pending).path());
   });
   if(deduplicatedFixture) await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#file').setInputFiles({name:'deduplicated.csv',mimeType:'text/csv',buffer:deduplicatedFixture});
     await page.waitForFunction(()=>document.querySelector('#results')?.hidden===false);
     const status=await page.locator('#status').innerText();
     if(!status.includes('4行・4列')) throw new Error('Deduplicated CSV import row count mismatch: '+status);
     const stats=await page.locator('#summary').innerText();
     if(!stats.includes('10,000')||!stats.includes('2,500')) throw new Error('Deduplication impact on sales was not reflected: '+stats);
   });
   await test(local('tools/pricing-simulator/index.html'),async()=>{
     await page.locator('#example-digital').click();
     let result=await page.locator('#result').innerText();
     for(const expected of ['824円／件','118円／件','41,200円','30,020円']){
       if(!result.includes(expected)) throw new Error('Digital pricing scenario missing '+expected);
     }
     await page.locator('#example-physical').click();
     result=await page.locator('#result').innerText();
     for(const expected of ['1,589円／件','1,145円／件','238,350円','60,015円']){
       if(!result.includes(expected)) throw new Error('Physical pricing scenario missing '+expected);
     }
     await page.locator('#cost').fill('801');
     if(!(await page.locator('#copyResult').isDisabled())) throw new Error('Pricing copy should disable after changing inputs');
     await page.locator('#calculate').click();
     if(await page.locator('#copyResult').isDisabled()) throw new Error('Pricing copy should enable after recalculation');
     await page.locator('#cost').fill('800');
     await page.locator('#count').fill('100');
     await page.locator('#calculate').click();
     if(!(await page.locator('#result').innerText()).includes('1,923円／件')) throw new Error('Physical quantity sensitivity mismatch');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#file').setInputFiles(path.resolve(__dirname,'../examples/csv-analysis-sales-sample.csv'));
     await page.waitForFunction(()=>document.querySelector('#results')?.hidden===false);
     const status=await page.locator('#status').innerText();
     if(!status.includes('10行・3列')) throw new Error('Analysis fixture row/column count mismatch: '+status);
     const stats=await page.locator('#summary').innerText();
     if(!stats.includes('売上')||!stats.includes('518,000')||!stats.includes('51,800')) throw new Error('Analysis fixture statistics mismatch: '+stats);
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     const csv='注文番号,金額\n"001,東京",90071992547409.';
     for(const [id,fraction] of [['orders','90'],['payments','91']]){
       await page.locator('#'+id).setInputFiles({name:id+'.csv',mimeType:'text/csv',buffer:Buffer.from(csv+fraction)});
     }
     await page.locator('#load').click();
     await page.locator('#run').click();
     const cells=await page.locator('#results tr:first-child td').allTextContents();
     if(cells.slice(0,5).join('|')!=='金額不一致|001,東京|90071992547409.9|90071992547409.91|0.01'){
       throw new Error('One-cent difference or quoted ID lost: '+cells.join('|'));
     }
   });
   for(const fixture of [
     {tool:'order-line-aggregate',input:'file'},
     {tool:'order-payment-reconcile',input:'orders',second:'payments'},
   ]){
     await test(local('tools/'+fixture.tool+'/index.html'),async()=>{
       const csv={name:'orders.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\n001,100')};
       for(const id of [fixture.input,fixture.second].filter(Boolean)){
         await page.locator('#'+id).setInputFiles(csv);
       }
       await page.evaluate(input=>{
         const file=document.getElementById(input).files[0];
         const pending=file.arrayBuffer();
         file.arrayBuffer=()=>new Promise(resolve=>{
           window.finishReading=async()=>resolve(await pending);
         });
       },fixture.input);
       await page.locator('#load').click();
       await page.locator('#'+fixture.input).setInputFiles([]);
       await page.evaluate(()=>window.finishReading());
       await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
       if(!await page.locator('#run').isDisabled()) throw new Error('Obsolete file read restored previous data');
     });
   }
   await test(local('tools/pricing-simulator/index.html'),async()=>{
     for(const id of ['cost','fixed','fee','flat','target']) await page.locator('#'+id).fill('0');
     await page.locator('#count').fill('1');
     await page.locator('#calculate').click();
     await waitForText('#result','必要販売価格： 0円');
     await page.evaluate(()=>{
       Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
         writeText:async text=>{window.copiedResult=text;}
       }});
     });
     await page.locator('#copyResult').click();
     await waitForText('#copyStatus','コピーしました');
     if(!(await page.evaluate(()=>window.copiedResult)).includes('必要販売価格： 0円')){
       throw new Error('Clipboard did not receive the displayed calculation');
     }
     await page.locator('#cost').fill('0.00000000001');
     if(!await page.locator('#copyResult').isDisabled()) throw new Error('Stale pricing result remained copyable');
     await page.locator('#calculate').click();
     await waitForText('#result','必要販売価格： 1円');
     await waitForText('#result','損益分岐販売価格： 1円');
     await page.locator('#copyResult').click();
     await waitForText('#copyStatus','コピーしました');
     if(!(await page.evaluate(()=>window.copiedResult)).includes('必要販売価格： 1円')){
       throw new Error('Clipboard received the previous calculation');
     }
     await page.locator('#cost').fill('');
     await page.locator('#calculate').click();
     await waitForText('#result','入力条件を確認');
   });
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     const ids=Array.from({length:201},(_,i)=>String(i).padStart(4,'0'));
     const csv='注文番号,金額\n'+ids.map(id=>id+',100').join('\n');
     for(const id of ['orders','payments']){
       await page.locator('#'+id).setInputFiles({name:id+'.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
     }
     await page.locator('#load').click();
     await page.locator('#run').click();
     if(await page.locator('#results tr').count()!==200) throw new Error('Reconciliation preview is not limited to 200 rows');
     await page.locator('#statusFilter').selectOption('一致');
     await page.locator('#idSearch').fill('0200');
     const pendingFiltered=page.waitForEvent('download');
     await page.locator('#exportFiltered').click();
     const filtered=fs.readFileSync(await (await pendingFiltered).path(),'utf8').split(/\r?\n/);
     if(filtered.length!==2||filtered[1]!=='一致,0200,100,100,0,') throw new Error('Combined filter lost the matching ID');
     const pendingAll=page.waitForEvent('download');
     await page.locator('#export').click();
     const all=fs.readFileSync(await (await pendingAll).path(),'utf8').split(/\r?\n/);
     if(all.length!==202||all[201]!==filtered[1]) throw new Error('All-results CSV lost rows beyond the preview');
   });
   await test(local('tools/list-cleaner/index.html'),async()=>{
     await page.locator('#empty').uncheck();
     await page.locator('#a').fill('りんご\nみかん\nりんご');
     await page.locator('#mode').selectOption('union');
     await page.locator('#run').focus();
     await page.keyboard.press('Enter');
     if(await page.locator('#out').inputValue()!=='りんご\nみかん') throw new Error('Unused list generated an empty item');
     await waitForText('#stats','出力: 2行');
     if(await page.locator('#download').isDisabled()) throw new Error('List result cannot be saved');
     await page.locator('#b').fill('みかん\nバナナ');
     if(await page.locator('#out').inputValue()||!await page.locator('#copy').isDisabled()||!await page.locator('#download').isDisabled()){
       throw new Error('Stale list result remained available after input changed');
     }
     await page.locator('#mode').selectOption('common');
     await page.locator('#run').click();
     if(await page.locator('#out').inputValue()!=='みかん') throw new Error('List intersection is incorrect');
     await page.locator('#reset').click();
     if(await page.locator('#out').inputValue()||!await page.locator('#download').isDisabled()) throw new Error('Reset left list output available');
   });
   await test(local('tools/list-cleaner/index.html'),async()=>{
     await page.locator('#frequency-example').click();
     if(await page.locator('#mode').inputValue()!=='frequency'||await page.locator('#b').inputValue()!=='') throw new Error('Frequency demo did not select mode or clear list B');
     if(await page.locator('#out').inputValue()!=='SKU-01\\t3\\nSKU-02\\t2\\nSKU-03\\t1'.replace(/\\t/g,'\t').replace(/\\n/g,'\n')) throw new Error('Frequency demo result incorrect');
     await page.locator('#a').fill('SKU-01\nSKU-02\nSKU-01\nSKU-03\nSKU-02\nSKU-01');
     await page.locator('#mode').selectOption('frequency');
     await page.locator('#run').click();
     const expected='SKU-01\t3\nSKU-02\t2\nSKU-03\t1';
     if(await page.locator('#out').inputValue()!==expected) throw new Error('Frequency ranking or counts incorrect');
     const pending=page.waitForEvent('download');
     await page.locator('#download').click();
     const file=await pending;
     if(file.suggestedFilename()!=='list-frequency.tsv') throw new Error('Frequency export extension incorrect');
     const exported=fs.readFileSync(await file.path(),'utf8').replace(/^\uFEFF/,'');
     if(exported!==expected) throw new Error('Frequency TSV export differs from preview');
     await page.locator('#a').fill('SKU-01\tblue');
     await page.locator('#run').click();
     if(!(await page.locator('#stats').innerText()).includes('タブ文字')) throw new Error('Tab input was not rejected');
     if(!await page.locator('#download').isDisabled()) throw new Error('Invalid frequency result remained downloadable');
     await page.locator('#a').fill('Apple\napple\nBanana');
     await page.locator('#case').check();
     await page.locator('#run').click();
     if(await page.locator('#out').inputValue()!=='Apple\t2\nBanana\t1') throw new Error('Case-insensitive frequency count incorrect');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{
       const c=document.createElement('canvas');c.width=80;c.height=40;
       c.getContext('2d').fillRect(0,0,80,40);
       return c.toDataURL('image/png').split(',')[1];
     });
     await page.locator('#files').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
     await page.locator('#format').selectOption('image/png');
     await page.locator('#run').click();
     await page.waitForFunction(()=>!document.querySelector('#result').classList.contains('hidden'));
     await page.locator('#square').selectOption('white');
     if(!(await page.locator('#result').evaluate(el=>el.classList.contains('hidden'))))throw new Error('Old conversion remained downloadable after square setting change');
     if(!(await page.locator('#status').innerText()).includes('再実行'))throw new Error('Reconversion notice missing');
     await page.locator('#run').click();
     await page.waitForFunction(()=>!document.querySelector('#result').classList.contains('hidden'));
     await page.locator('#brightness').evaluate(el=>{el.value='110';el.dispatchEvent(new Event('input',{bubbles:true}))});
     if(!(await page.locator('#result').evaluate(el=>el.classList.contains('hidden'))))throw new Error('Old conversion remained after brightness change');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{
       const c=document.createElement('canvas');c.width=120;c.height=60;
       const ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,120,60);
       return c.toDataURL('image/png').split(',')[1];
     });
     await page.locator('#files').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
     await page.locator('#format').selectOption('image/png');
     await page.locator('#width').fill('120');
     await page.locator('#height').fill('120');
     await page.locator('#square').selectOption('white');
     await page.locator('#run').click();
     await page.waitForFunction(()=>document.querySelector('#result')?.classList.contains('hidden')===false);
     if(!(await page.locator('#list').innerText()).includes('120 × 120 px')) throw new Error('Square padding dimensions incorrect');
     const image=await page.locator('#list img').first().evaluate(async im=>{
       await im.decode();const c=document.createElement('canvas');c.width=120;c.height=120;
       const x=c.getContext('2d');x.drawImage(im,0,0);
       const pixel=(px,py)=>Array.from(x.getImageData(px,py,1,1).data);
       return {top:pixel(60,5),middle:pixel(60,60),bottom:pixel(60,115)};
     });
     for(const key of ['top','bottom'])if(image[key].join(',')!=='255,255,255,255') throw new Error('Square padding background incorrect: '+key);
     if(image.middle.join(',')!=='255,0,0,255') throw new Error('Square padding distorted image');
     await page.locator('#square').selectOption('off');
     await page.locator('#run').click();
     await page.waitForFunction(()=>document.querySelector('#list')?.textContent.includes('120 × 60 px'));
     if(!(await page.locator('#list').innerText()).includes('120 × 60 px')) throw new Error('Default non-square output changed');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{
       const c=document.createElement('canvas');c.width=80;c.height=80;
       const x=c.getContext('2d');x.fillStyle='rgb(100,100,100)';x.fillRect(0,0,80,80);
       return c.toDataURL('image/png').split(',')[1];
     });
     await page.locator('#files').setInputFiles({name:'gray.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
     await page.locator('#format').selectOption('image/png');
     await page.locator('#width').fill('80');
     await page.locator('#height').fill('80');
     const sample=async()=>{
       await page.locator('#run').click();
       await page.waitForFunction(()=>document.querySelector('#list img')?.complete&&document.querySelector('#list img')?.naturalWidth===80);
       return page.locator('#list img').first().evaluate(async im=>{
         await im.decode();const c=document.createElement('canvas');c.width=80;c.height=80;
         const x=c.getContext('2d');x.drawImage(im,0,0);return x.getImageData(40,40,1,1).data[0];
       });
     };
     const neutral=await sample();
     if(Math.abs(neutral-100)>2) throw new Error('Neutral image setting altered pixel: '+neutral);
     await page.locator('#brightness').fill('150');
     await page.locator('#brightness').dispatchEvent('input');
     if(await page.locator('#brightness-value').innerText()!=='150') throw new Error('Brightness display not updated');
     const bright=await sample();
     if(bright<neutral+35) throw new Error('Brightness adjustment ineffective: '+neutral+' -> '+bright);
     await page.locator('#brightness').fill('100');
     await page.locator('#brightness').dispatchEvent('input');
     await page.locator('#contrast').fill('150');
     await page.locator('#contrast').dispatchEvent('input');
     const contrasted=await sample();
     if(contrasted>=neutral-8) throw new Error('Contrast adjustment ineffective: '+neutral+' -> '+contrasted);
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=32;const x=c.getContext('2d');x.fillStyle='rgb(100,100,100)';x.fillRect(0,0,32,32);return c.toDataURL('image/png').split(',')[1]});
     const buffer=Buffer.from(png,'base64');
     await page.locator('#files').setInputFiles([{name:'one.png',mimeType:'image/png',buffer},{name:'two.png',mimeType:'image/png',buffer}]);
     await page.locator('#format').selectOption('image/png');
     if(await page.locator('#adjust-mode').inputValue()!=='individual')throw new Error('Individual adjustment must be default');
     await page.locator('#brightness').fill('150');await page.locator('#brightness').dispatchEvent('input');
     if(!(await page.locator('#preview-adjusted').evaluate(im=>im.style.filter)).includes('brightness(150%)'))throw new Error('Live preview did not reflect first adjustment');
     if(await page.locator('#preview-counter').innerText()!=='1 / 2')throw new Error('Preview counter incorrect');
     await page.locator('#preview-next').click();
     if(await page.locator('#preview-counter').innerText()!=='2 / 2')throw new Error('Preview navigation did not advance');
     if(await page.locator('#brightness').inputValue()!=='100')throw new Error('Second image inherited first adjustment');
     await page.locator('#brightness').fill('50');await page.locator('#brightness').dispatchEvent('input');
     await page.locator('#preview-select').selectOption('0');
     if(await page.locator('#brightness').inputValue()!=='150')throw new Error('Direct image selection did not restore first adjustment');
     if(!(await page.locator('#adjusted-counter').innerText()).includes('2 / 2'))throw new Error('Adjusted image counter incorrect');
     await page.locator('#preview-reset').click();
     if(await page.locator('#brightness').inputValue()!=='100')throw new Error('Reset did not restore neutral adjustment');
     if(!(await page.locator('#adjusted-counter').innerText()).includes('1 / 2'))throw new Error('Reset did not update adjustment counter');
     await page.locator('#brightness').fill('150');await page.locator('#brightness').dispatchEvent('input');
     await page.locator('#preview-next').click();
     if(await page.locator('#brightness').inputValue()!=='50')throw new Error('Second adjustment lost after reset of first');
     await page.locator('#preview-prev').click();
     if(await page.locator('#brightness').inputValue()!=='150')throw new Error('First image adjustment not retained');
     await page.locator('#run').click();
     await page.waitForFunction(()=>document.querySelectorAll('#list img').length===2);
     const labels=await page.locator('#list article').allInnerTexts();
     if(!labels[0].includes('明るさ 150%')||!labels[1].includes('明るさ 50%'))throw new Error('Converted image adjustment details incorrect: '+labels);
     const pixels=await page.locator('#list img').evaluateAll(async imgs=>Promise.all(imgs.map(async im=>{await im.decode();const c=document.createElement('canvas');c.width=32;c.height=32;const x=c.getContext('2d');x.drawImage(im,0,0);return x.getImageData(16,16,1,1).data[0]})));
     if(pixels[0]<135||pixels[1]>65)throw new Error('Individual pixel adjustments incorrect: '+pixels);
     await page.locator('#adjust-mode').selectOption('batch');
     await page.locator('#brightness').fill('120');await page.locator('#brightness').dispatchEvent('input');
     await page.locator('#run').click();
     await page.waitForFunction(()=>document.querySelectorAll('#list img').length===2);
     const batchPixels=await page.locator('#list img').evaluateAll(async imgs=>Promise.all(imgs.map(async im=>{await im.decode();const c=document.createElement('canvas');c.width=32;c.height=32;const x=c.getContext('2d');x.drawImage(im,0,0);return x.getImageData(16,16,1,1).data[0]})));
     if(Math.abs(batchPixels[0]-batchPixels[1])>2||batchPixels[0]<115)throw new Error('Batch pixel adjustments incorrect: '+batchPixels);
     const batchLabels=await page.locator('#list article').allInnerTexts();
     if(batchLabels.some(label=>!label.includes('明るさ 120%')))throw new Error('Batch adjustment details incorrect: '+batchLabels);
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=16;c.height=16;return c.toDataURL('image/png').split(',')[1]});
     const buffer=Buffer.from(png,'base64');
     await page.locator('#files').setInputFiles([{name:'remove.png',mimeType:'image/png',buffer},{name:'keep.png',mimeType:'image/png',buffer}]);
     await page.locator('#preview-select').selectOption('1');
     await page.locator('#brightness').fill('125');await page.locator('#brightness').dispatchEvent('input');
     await page.locator('#preview-select').selectOption('0');
     await page.locator('#preview-remove').click();
     if(await page.locator('#preview-select option').count()!==1)throw new Error('Removing image did not update picker');
     if(!(await page.locator('#preview-name').innerText()).includes('keep.png'))throw new Error('Removing image selected wrong remaining image');
     if(await page.locator('#brightness').inputValue()!=='125')throw new Error('Removing image lost remaining adjustment');
     if(!(await page.locator('#chosen').innerText()).includes('1枚'))throw new Error('Remaining count incorrect');
     await page.locator('#preview-remove').click();
     if(!(await page.locator('#preview-panel').evaluate(el=>el.classList.contains('hidden'))))throw new Error('Empty image preview remained visible');
     if(!(await page.locator('#run').isDisabled()))throw new Error('Conversion enabled without images');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=16;c.height=16;return c.toDataURL('image/png').split(',')[1]});
     const buffer=Buffer.from(png,'base64');
     await page.locator('#files').setInputFiles([{name:'a.png',mimeType:'image/png',buffer},{name:'b.png',mimeType:'image/png',buffer}]);
     await page.locator('#preview-select').selectOption('1');
     await page.locator('#brightness').fill('150');await page.locator('#brightness').dispatchEvent('input');
     await page.locator('#files').setInputFiles({name:'c.png',mimeType:'image/png',buffer});
     if(await page.locator('#preview-select').inputValue()!=='1')throw new Error('Adding image changed current selection');
     if(await page.locator('#brightness').inputValue()!=='150')throw new Error('Adding image lost adjustment');
     await page.locator('#reset-adjustments').click();
     if(await page.locator('#brightness').inputValue()!=='100')throw new Error('Reset all failed in individual mode');
     await page.locator('#preview-select').selectOption('0');
     if(await page.locator('#brightness').inputValue()!=='100')throw new Error('Reset all left individual adjustment');
     await page.locator('#adjust-mode').selectOption('batch');
     await page.locator('#brightness').fill('130');await page.locator('#brightness').dispatchEvent('input');
     await page.locator('#reset-adjustments').click();
     if(await page.locator('#brightness').inputValue()!=='100')throw new Error('Reset all failed in batch mode');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=12;c.height=12;const x=c.getContext('2d');x.fillStyle='#888';x.fillRect(0,0,12,12);return c.toDataURL('image/png').split(',')[1]});
     const buffer=Buffer.from(png,'base64');
     await page.locator('#files').setInputFiles([{name:'photo.png',mimeType:'image/png',buffer},{name:'photo.png',mimeType:'image/png',buffer:Buffer.concat([buffer,Buffer.from([0])])}]);
     await page.locator('#format').selectOption('image/png');
     await page.locator('#run').click();
     await page.locator('#list article').first().waitFor();
     if(await page.locator('#list article').count()!==2)throw new Error('Duplicate-name images not both converted');
     const names=await page.locator('#list article h3').allInnerTexts();
     if(new Set(names).size!==2)throw new Error('Duplicate image names not made unique');
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#zip').click();
     const download=await downloadPromise;
     const zip=require('node:fs').readFileSync(await download.path());
     if(zip.readUInt32LE(0)!==0x04034b50||zip.readUInt32LE(zip.length-22)!==0x06054b50)throw new Error('ZIP archive headers invalid');
     if(zip.readUInt16LE(zip.length-12)!==2)throw new Error('ZIP entry count incorrect');
     for(const name of names)if(!zip.includes(Buffer.from(name)))throw new Error('ZIP missing file '+name);
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=10;c.height=10;return c.toDataURL('image/png').split(',')[1]});
     const buffer=Buffer.from(png,'base64');
     await page.evaluate(bytes=>{const f=new File([new Uint8Array(bytes)],'again.png',{type:'image/png',lastModified:123456789});choose([f]);choose([f])},[...buffer]);
     if(!(await page.locator('#chosen').innerText()).includes('重複 1枚'))throw new Error('Duplicate selection not reported');
     if(await page.locator('#preview-select option').count()!==1)throw new Error('Duplicate selection added twice');
     await page.locator('#preview-remove').click();
     await page.locator('#files').setInputFiles({name:'again.png',mimeType:'image/png',buffer});
     if(!(await page.locator('#preview-original').getAttribute('src')))throw new Error('Preview missing after remove and re-add');
     if(await page.locator('#preview-original').evaluate(img=>img.decode().then(()=>img.naturalWidth).catch(()=>0))!==10)throw new Error('Preview image failed to load after re-add');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=60;return c.toDataURL('image/png').split(',')[1]});
     await page.locator('#files').setInputFiles({name:'rectangle.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
     await page.locator('#square').selectOption('white');
     const ratio=await page.locator('#preview-stage').evaluate(e=>{const r=e.getBoundingClientRect();return r.width/r.height});
     if(Math.abs(ratio-1)>0.02)throw new Error('Square padding preview is not square');
     await page.locator('#square').selectOption('black');
     const blackRatio=await page.locator('#preview-stage').evaluate(e=>{const r=e.getBoundingClientRect();return r.width/r.height});
     if(Math.abs(blackRatio-1)>0.02)throw new Error('Black square padding preview is not square');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=12;c.height=12;return c.toDataURL('image/png').split(',')[1]});
     await page.locator('#files').setInputFiles({name:'transparent.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
     await page.locator('#format').selectOption('image/jpeg');
     await page.locator('#bg').selectOption('black');
     const black=await page.locator('#preview-stage').evaluate(e=>getComputedStyle(e).backgroundColor);
     if(black!=='rgb(0, 0, 0)')throw new Error('JPEG background color not shown in preview: '+black);
     await page.locator('#format').selectOption('image/png');
     const pngBg=await page.locator('#preview-stage').evaluate(e=>getComputedStyle(e).backgroundColor);
     if(pngBg==='rgb(0, 0, 0)')throw new Error('JPEG background leaked into PNG preview');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=16;c.height=16;return c.toDataURL('image/png').split(',')[1]});
     const buffer=Buffer.from(png,'base64');
     await page.evaluate(bytes=>{const f=new File([new Uint8Array(bytes)],'stable.png',{type:'image/png',lastModified:123});choose([f])},[...buffer]);
     await page.locator('#format').selectOption('image/png');
     await page.locator('#run').click();
     await page.locator('#list article').first().waitFor();
     await page.evaluate(bytes=>{const f=new File([new Uint8Array(bytes)],'stable.png',{type:'image/png',lastModified:123});choose([f])},[...buffer]);
     if(await page.locator('#result').evaluate(e=>e.classList.contains('hidden')))throw new Error('Duplicate-only upload discarded completed exports');
     await page.evaluate(()=>choose([new File(['bad'],'unsupported.txt',{type:'text/plain'})]));
     if(await page.locator('#result').evaluate(e=>e.classList.contains('hidden')))throw new Error('Unsupported-only upload discarded completed exports');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     await page.evaluate(()=>choose([new File(['not image'],'notes.txt',{type:'text/plain'})]));
     const chosen=await page.locator('#chosen').innerText();
     if(!chosen.includes('画像が選択されていません')||!chosen.includes('除外 1枚'))throw new Error('Unsupported-only selection shows incorrect empty state: '+chosen);
     if(await page.locator('#run').isEnabled())throw new Error('Conversion enabled without an image');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=16;c.height=8;return c.toDataURL('image/png').split(',')[1]});
     const buffer=Buffer.from(png,'base64');
     await page.locator('#files').setInputFiles({name:'first.png',mimeType:'image/png',buffer});
     await page.locator('#format').selectOption('image/png');
     await page.locator('#run').click();
     await page.locator('#list article').first().waitFor();
     await page.evaluate(bytes=>choose([new File([new Uint8Array(bytes)],'second.png',{type:'image/png',lastModified:456})]),[...buffer]);
     if(!(await page.locator('#result').evaluate(e=>e.classList.contains('hidden'))))throw new Error('New image did not invalidate stale export');
     if(!(await page.locator('#status').innerText()).includes('再変換'))throw new Error('Missing clear reconversion instruction');
     if(await page.locator('#preview-select option').count()!==2)throw new Error('New image was not appended');
     await page.locator('#run').click();
     await page.locator('#list article').nth(1).waitFor();
     if(await page.locator('#list article').count()!==2)throw new Error('Reconversion did not include both images');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const outcome=await page.evaluate(async()=>{
       const c=document.createElement('canvas');c.width=8000;c.height=1;
       const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
       const file=new File([blob],'wide.png',{type:'image/png'});
       $('width').value='8000';$('height').value='8000';$('square').value='white';
       try{const out=await convert(file,{w:8000,h:8000,square:'white',format:'image/png',bg:'white',quality:0.8,target:0,adjustMode:'batch',batchSettings:{brightness:100,contrast:100},perImage:new Map()});URL.revokeObjectURL(out.url);return 'unexpected success'}catch(e){return e.message}
     });
     if(!outcome.includes('ピクセル数'))throw new Error('Oversized square canvas was not rejected: '+outcome);
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const c=document.createElement('canvas');c.width=6;c.height=4;
       const source=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
       const file=new File([source],'alpha.png',{type:'image/png'});
       const options={w:6,h:4,square:'off',format:'image/png',bg:'white',quality:0.8,target:0,adjustMode:'batch',batchSettings:{brightness:100,contrast:100},perImage:new Map()};
       async function pixel(format,bg){options.format=format;options.bg=bg;const out=await convert(file,options);const bitmap=await createImageBitmap(out.blob);const target=document.createElement('canvas');target.width=6;target.height=4;const ctx=target.getContext('2d');ctx.drawImage(bitmap,0,0);const data=ctx.getImageData(0,0,1,1).data;bitmap.close();URL.revokeObjectURL(out.url);return [...data]}
       return {white:await pixel('image/jpeg','white'),black:await pixel('image/jpeg','black'),png:await pixel('image/png','white')};
     });
     if(result.white[0]<245||result.white[1]<245||result.white[2]<245)throw new Error('JPEG white background not rendered');
     if(result.black[0]>10||result.black[1]>10||result.black[2]>10)throw new Error('JPEG black background not rendered');
     if(result.png[3]!==0)throw new Error('PNG transparency was lost');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       try{await zipStore([{blob:{size:513*1024*1024}}]);return 'unexpected success'}catch(e){return e.message}
     });
     if(!result.includes('512MB'))throw new Error('Oversized ZIP was not blocked before allocation: '+result);
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     await page.evaluate(()=>choose([new File([],'empty.png',{type:'image/png'})]));
     const state=await page.locator('#chosen').innerText();
     if(!state.includes('除外 1枚')||await page.locator('#run').isEnabled())throw new Error('Zero-byte image was accepted');
     const busyResult=await page.evaluate(async()=>{
       const c=document.createElement('canvas');c.width=4;c.height=4;
       const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
       const file=new File([blob],'original.png',{type:'image/png',lastModified:42});
       choose([file]);zipBusy=true;
       choose([new File([blob],'blocked.png',{type:'image/png'})]);
       const count=selected.length;
       $('clear').click();
       const afterClear=selected.length;
       zipBusy=false;
       return {count,afterClear};
     });
     if(busyResult.count!==1||busyResult.afterClear!==1)throw new Error('ZIP export did not guard selection changes');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const report=await page.evaluate(async()=>{
       const bytes=new Uint8Array([0,1,2,3,4,255,128,42]);
       const items=[{name:'画像A.png',blob:new Blob([bytes])},{name:'second.webp',blob:new Blob([new Uint8Array([5,6,7])])}];
       const zip=new Uint8Array(await (await zipStore(items)).arrayBuffer());
       const dv=new DataView(zip.buffer);const u16=(p)=>dv.getUint16(p,true),u32=(p)=>dv.getUint32(p,true);
       let p=0;const entries=[];
       for(let i=0;i<items.length;i++){
         if(u32(p)!==0x04034b50)throw Error('Missing local ZIP header');
         const size=u32(p+18),length=u16(p+26),name=new TextDecoder().decode(zip.slice(p+30,p+30+length));
         const data=zip.slice(p+30+length,p+30+length+size);
         entries.push({name,size,crc:u32(p+14),actualCrc:crc32(data),data:[...data]});
         p+=30+length+size;
       }
       if(u32(p)!==0x02014b50)throw Error('Missing ZIP central directory');
       const end=zip.length-22;
       return {entries,endSignature:u32(end),count:u16(end+10),centralOffset:u32(end+16),expectedOffset:p};
     });
     if(report.endSignature!==0x06054b50||report.count!==2||report.centralOffset!==report.expectedOffset)throw new Error('ZIP directory metadata invalid');
     if(report.entries[0].name!=='画像A.png'||report.entries[1].name!=='second.webp')throw new Error('ZIP filename encoding incorrect');
     if(report.entries.some(e=>e.crc!==e.actualCrc)||report.entries[0].data.join(',')!=='0,1,2,3,4,255,128,42')throw new Error('ZIP payload or checksum corrupted');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const image=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=8;c.height=8;return (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer().then(b=>[...new Uint8Array(b)])});
     await page.evaluate(bytes=>choose([new File([new Uint8Array(bytes)],'lock.png',{type:'image/png'})]),image);
     await page.locator('#run').click();await page.locator('#list article').first().waitFor();
     await page.evaluate(()=>{zipStore=async()=>{await new Promise(r=>setTimeout(r,300));return new Blob(['ZIP'])}});
     await page.locator('#zip').click();
     await page.waitForFunction(()=>zipBusy===true);
     for(const id of ['run','clear','zip','format','brightness','preview-remove'])if(await page.locator('#'+id).isEnabled())throw new Error('Control not locked during ZIP generation: '+id);
     await page.waitForFunction(()=>zipBusy===false);
     if(!(await page.locator('#format').isEnabled())||!(await page.locator('#run').isEnabled()))throw new Error('Controls not restored after ZIP generation');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=7;c.height=5;return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())]});
     await page.evaluate(bytes=>{
       choose([new File([new Uint8Array(bytes)],'good.png',{type:'image/png'}),new File(['not a real image'],'broken.png',{type:'image/png'})]);
     },png);
     await page.locator('#format').selectOption('image/png');
     await page.locator('#run').click();
     await page.locator('#list article').first().waitFor();
     await page.waitForFunction(()=>!busy);
     if(await page.locator('#list article').count()!==1)throw new Error('Corrupt input prevented valid file conversion');
     const status=await page.locator('#status').innerText();
     if(!status.includes('失敗 1枚')||!status.includes('broken.png'))throw new Error('Corrupt image failure was not reported: '+status);
     if(!(await page.locator('#zip').isEnabled()))throw new Error('ZIP disabled after partial conversion success');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=20;c.height=20;const ctx=c.getContext('2d');ctx.fillStyle='#555';ctx.fillRect(0,0,20,20);return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())]});
     await page.evaluate(bytes=>choose([new File([new Uint8Array(bytes)],'snapshot.png',{type:'image/png'})]),bytes);
     await page.locator('#format').selectOption('image/jpeg');
     await page.locator('#target').fill('10');
     await page.locator('#run').click();
     await page.locator('#list article').first().waitFor();
     await page.waitForFunction(()=>!busy);
     const original=await page.locator('#list article').first().innerText();
     await page.evaluate(()=>$('target').value='30000');
     const after=await page.locator('#list article').first().innerText();
     if(original!==after)throw new Error('Completed output report changed with uncommitted form value');
     const snapshot=await page.evaluate(()=>outputs[0].targetBytes);
     if(snapshot!==10240)throw new Error('Conversion target snapshot was not preserved');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=8;c.height=8;return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())]});
     if(await page.locator('#zip').isEnabled()||await page.locator('#each').isEnabled())throw new Error('Export enabled without results');
     await page.evaluate(bytes=>choose([new File([new Uint8Array(bytes)],'ready.png',{type:'image/png'})]),png);
     await page.locator('#format').selectOption('image/png');await page.locator('#run').click();
     await page.locator('#list article').first().waitFor();await page.waitForFunction(()=>!busy);
     if(!(await page.locator('#zip').isEnabled())||!(await page.locator('#each').isEnabled()))throw new Error('Export not enabled after successful conversion');
     await page.locator('#width').fill('900');await page.locator('#width').dispatchEvent('change');
     if(await page.locator('#zip').isEnabled()||await page.locator('#each').isEnabled())throw new Error('Stale exports remain enabled after settings change');
     await page.locator('#run').click();await page.locator('#list article').first().waitFor();await page.waitForFunction(()=>!busy);
     await page.locator('#clear').click();
     if(await page.locator('#zip').isEnabled()||await page.locator('#each').isEnabled())throw new Error('Exports remain enabled after clearing images');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const png=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=5;c.height=5;return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())]});
     await page.evaluate(bytes=>{
       const good=new File([new Uint8Array(bytes)],'good.png',{type:'image/png'});
       const bad=Array.from({length:5},(_,i)=>new File(['bad '+i],'bad-'+i+'.png',{type:'image/png',lastModified:i+1}));
       choose([good,...bad]);
     },png);
     await page.locator('#format').selectOption('image/png');await page.locator('#run').click();
     await page.waitForFunction(()=>!busy);
     if(await page.locator('#list article').count()!==1)throw new Error('Valid image missing after partial failure');
     if(await page.locator('#failure-report').isHidden())throw new Error('Failure details are not available');
     if(await page.locator('#failure-list li').count()!==5)throw new Error('Failure report truncated');
     const failures=await page.locator('#failure-list').textContent();
     for(let i=0;i<5;i++)if(!failures.includes('bad-'+i+'.png'))throw new Error('Missing failed filename '+i);
     await page.locator('#width').fill('400');await page.locator('#width').dispatchEvent('change');
     if(!(await page.locator('#failure-report').isHidden()))throw new Error('Stale failure report retained after settings change');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     await page.evaluate(()=>choose([new File(['broken image'],'only-broken.png',{type:'image/png'})]));
     await page.locator('#run').click();await page.waitForFunction(()=>!busy);
     if(await page.locator('#list article').count()!==0)throw new Error('Invalid image unexpectedly converted');
     if(await page.locator('#failure-report').isHidden())throw new Error('All-failed report missing');
     await page.locator('#width').fill('350');await page.locator('#width').dispatchEvent('change');
     if(!(await page.locator('#failure-report').isHidden()))throw new Error('All-failed report was not invalidated');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const input=new TextEncoder().encode('123456789');
       const checksum=crc32(input);
       const reports=[];
       const files=[{name:'one.txt',blob:new Blob(['first'])},{name:'two.txt',blob:new Blob(['second'])},{name:'三.txt',blob:new Blob(['third'])}];
       const zip=await zipStore(files,(done,total)=>reports.push([done,total]));
       const bytes=new Uint8Array(await zip.arrayBuffer());
       const view=new DataView(bytes.buffer);
       let pos=0;const names=[];
       while(pos+30<=bytes.length&&view.getUint32(pos,true)===0x04034b50){
         const size=view.getUint32(pos+18,true),length=view.getUint16(pos+26,true),extra=view.getUint16(pos+28,true);
         names.push(new TextDecoder().decode(bytes.subarray(pos+30,pos+30+length)));
         pos+=30+length+extra+size;
       }
       return {checksum,reports,names,zipSize:zip.size};
     });
     if(result.checksum!==0xcbf43926)throw new Error('CRC32 standard test vector failed');
     if(JSON.stringify(result.reports)!==JSON.stringify([[1,3],[2,3],[3,3]]))throw new Error('ZIP progress callback was inaccurate');
     if(result.names.join('|')!=='one.txt|two.txt|三.txt'||result.zipSize<100)throw new Error('ZIP structure changed during CRC optimization');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(()=>{
       const original=outputs;
       const limit=512*1024*1024;
       const mk=(size,name='a.png')=>({blob:{size},name});
       const overhead=zipBytes([mk(0)]);
       outputs=[mk(limit-overhead)];const boundary=zipAllowed();
       outputs=[mk(limit-overhead+1)];const exceeded=zipAllowed();
       outputs=[mk(300*1024*1024,'a.png'),mk(limit-300*1024*1024-zipBytes([mk(0,'a.png'),mk(0,'日本語.png')])+1,'日本語.png')];const combined=zipAllowed();
       const utf8Overhead=zipBytes([mk(0,'日本語.png')])-zipBytes([mk(0,'a.png')]);
       outputs=original;
       const stamp=localDateStamp(new Date(2026,0,2,0,30));
       return {boundary,exceeded,combined,stamp,utf8Overhead};
     });
     if(!result.boundary||result.exceeded||result.combined)throw new Error('ZIP size preflight failed at 512MB boundary');
     if(result.stamp!=='2026-01-02')throw new Error('Archive date uses wrong local calendar day');
     if(result.utf8Overhead<=0)throw new Error('UTF-8 ZIP filename bytes were not counted');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const data=new Uint8Array(262147);
       for(let i=0;i<data.length;i++)data[i]=i%251;
       const blob=new Blob([data.subarray(0,65535),data.subarray(65535,131071),data.subarray(131071)]);
       const expected=crc32(data),actual=await crc32Blob(blob);
       const archive=await zipStore([{name:'chunk-test.bin',blob}]);
       const bytes=new Uint8Array(await archive.arrayBuffer());
       const view=new DataView(bytes.buffer);
       const storedCRC=view.getUint32(14,true),storedSize=view.getUint32(18,true),nameLength=view.getUint16(26,true);
       const content=bytes.subarray(30+nameLength,30+nameLength+storedSize);
       let matches=content.length===data.length;
       for(let i=0;matches&&i<data.length;i++)if(content[i]!==data[i])matches=false;
       return {expected,actual,storedCRC,storedSize,matches};
     });
     if(result.expected!==result.actual||result.actual!==result.storedCRC)throw new Error('Streaming ZIP CRC differs from original CRC32');
     if(result.storedSize!==262147||!result.matches)throw new Error('Streaming ZIP content was truncated or changed');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const names=await page.evaluate(()=>uniqueNames(['CON.png','aux.JPG','LPT1.gif','file .png','file.png','A?.jpg','a*.jpg','normal.webp'].map(name=>({source:{name},ext:'png'}))).map(x=>x.name));
     const expected=['_CON.png','_aux.png','_LPT1.png','file.png','file_2.png','A_.png','a__2.png','normal.png'];
     if(JSON.stringify(names)!==JSON.stringify(expected))throw new Error('Unsafe or colliding ZIP filenames: '+JSON.stringify(names));
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const c=document.createElement('canvas');c.width=12;c.height=8;c.getContext('2d').fillRect(0,0,12,8);
       const file=new File([await new Promise(resolve=>c.toBlob(resolve,'image/png'))],'snapshot.png',{type:'image/png'});
       const options={w:12,h:8,format:'image/png',square:'white',bg:'#ffffff',quality:0.8,target:0,adjustMode:'batch',batchSettings:{brightness:100,contrast:100},perImage:new Map()};
       const oldFormat=$('format').value,oldSquare=$('square').value,oldBg=$('bg').value;
       $('format').value='image/jpeg';$('square').value='off';$('bg').value='#000000';
       try{const converted=await convert(file,options);URL.revokeObjectURL(converted.url);return {ext:converted.ext,type:converted.blob.type,w:converted.w,h:converted.h}}
       finally{$('format').value=oldFormat;$('square').value=oldSquare;$('bg').value=oldBg}
     });
     if(result.ext!=='png'||result.type!=='image/png'||result.w!==12||result.h!==12)throw new Error('Conversion ignored snapshotted settings');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const data=new TextEncoder().encode('stream-reader-only');
       let released=false,readCount=0;
       const fake={stream:()=>({getReader:()=>({read:async()=>{readCount++;return readCount===1?{done:false,value:data}:{done:true}},releaseLock:()=>{released=true}})})};
       return {expected:crc32(data),actual:await crc32Blob(fake),released,readCount};
     });
     if(result.actual!==result.expected||!result.released||result.readCount!==2)throw new Error('ZIP CRC requires async iterator or leaks stream reader');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(()=>{
       const long='日本語'.repeat(90);
       const names=uniqueNames([long+'.png',long+'.jpg','🎠'.repeat(80)+'.png','CON.png'].map(name=>({source:{name},ext:'png'}))).map(x=>x.name);
       return {names,lengths:names.map(n=>new TextEncoder().encode(n).length)};
     });
     if(result.lengths.some(n=>n>200))throw new Error('UTF-8 filename exceeds 200-byte export cap');
     if(result.names[0]===result.names[1]||!result.names[1].endsWith('_2.png'))throw new Error('Long Unicode filename collision not resolved');
     if(!result.names[2].endsWith('.png')||result.names[3]!=='_CON.png')throw new Error('Unicode truncation or reserved name failed');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(()=>{
       const names=['image.JPG','image.jpeg','image.PNG','image.webp','image.BMP','image.gif','image.svg','image.txt'];
       const supported=names.map(name=>supportedImage({name,type:''}));
       const mismatched=supportedImage({name:'image.png',type:'text/plain'});
       const declared=supportedImage({name:'unknown',type:'image/jpeg'});const binary=supportedImage({name:'photo.JPG',type:'application/octet-stream'});const invalidBinary=supportedImage({name:'payload.exe',type:'application/octet-stream'});
       return {supported,mismatched,declared,binary,invalidBinary};
     });
     if(JSON.stringify(result.supported)!==JSON.stringify([true,true,true,true,true,true,false,false]))throw new Error('MIME-less image extension filtering failed');
     if(result.mismatched||!result.declared||!result.binary||result.invalidBinary)throw new Error('Explicit and generic MIME type handling failed');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const c=document.createElement('canvas');c.width=2;c.height=2;
       const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
       const file=new File([blob],'clipboard.png',{type:'image/png',lastModified:Date.now()});
       const paste=(target,files)=>{let prevented=false;pasteImages({target,clipboardData:{files},preventDefault(){prevented=true}});return prevented};
       const first=paste(document.body,[file]);const count=selected.length;
       const duplicate=paste(document.body,[file]);const afterDuplicate=selected.length;
       const formPaste=paste($('target'),[new File([blob],'other.png',{type:'image/png'})]);
       const afterForm=selected.length;
       const plain=paste(document.body,[new File(['abc'],'text.txt',{type:'text/plain'})]);
       return {first,count,duplicate,afterDuplicate,formPaste,afterForm,plain};
     });
     if(!result.first||result.count!==1||!result.duplicate||result.afterDuplicate!==1)throw new Error('Clipboard image import or deduplication failed');
     if(result.formPaste||result.afterForm!==1||result.plain)throw new Error('Clipboard handler intercepted form paste or plain text');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const c=document.createElement('canvas');c.width=3;c.height=3;
       const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
       const file=new File([blob],'clipboard-item.png',{type:'image/png'});
       let prevented=false;
       pasteImages({target:document.body,clipboardData:{files:[],items:[{kind:'file',type:'image/png',getAsFile:()=>file}]},preventDefault(){prevented=true}});
       const count=selected.length;
       let preventedText=false;
       pasteImages({target:document.body,clipboardData:{files:[],items:[{kind:'string',type:'text/plain'}]},preventDefault(){preventedText=true}});
       return {prevented,count,preventedText};
     });
     if(!result.prevented||result.count!==1||result.preventedText)throw new Error('Clipboard DataTransferItem fallback failed');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;const ctx=canvas.getContext('2d');ctx.fillStyle='#f00';ctx.fillRect(0,0,4,4);ctx.fillStyle='#00f';ctx.fillRect(4,0,4,4);
       const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
       choose([new File([blob],'platform-test.png',{type:'image/png'})]);
       const values={};for(const key of Object.keys(presets)){applyPreset(key);values[key]={w:$('width').value,h:$('height').value,fit:$('fit').value,format:$('format').value}}
       const convertPreset=async(key,fit)=>{applyPreset(key);$('fit').value=fit;const settings=valid();settings.fit=$('fit').value;settings.format=$('format').value;settings.square=$('square').value;settings.bg=$('bg').value;settings.quality=Number($('quality').value)/100;settings.target=0;settings.adjustMode='batch';settings.batchSettings={brightness:100,contrast:100};settings.perImage=new Map();const output=await convert(selected[0],settings);const image=await createImageBitmap(output.blob);const check=document.createElement('canvas');check.width=output.w;check.height=output.h;const context=check.getContext('2d');context.drawImage(image,0,0);const corner=[...context.getImageData(0,0,1,1).data];const middle=[...context.getImageData(output.w/2|0,output.h/2|0,1,1).data];image.close();URL.revokeObjectURL(output.url);return {w:output.w,h:output.h,corner,middle}};
       const contain=await convertPreset('x-header','contain');const cover=await convertPreset('x-header','cover');
       applyPreset('mercari');$('width').value='900';$('width').dispatchEvent(new Event('change',{bubbles:true}));
       return {values,contain,cover,custom:$('preset').value};
     });
     const v=result.values;
     for(const [key,w,h] of [['mercari','1080','1080'],['yahoo','1200','1200'],['x-post','1200','675'],['x-header','1500','500'],['x-avatar','400','400'],['ig-square','1080','1080'],['ig-portrait','1080','1350'],['ig-story','1080','1920'],['fb-post','1200','630'],['fb-cover','820','312'],['youtube','3840','2160'],['shorts','1080','1920']]){if(!v[key]||v[key].w!==w||v[key].h!==h||v[key].fit!=='contain')throw new Error('Platform preset failed: '+key)}
     if(v.web.fit!=='resize'||v.archive.format!=='image/png')throw new Error('Legacy web/archive preset failed');
     if(result.contain.w!==1500||result.contain.h!==500||result.cover.w!==1500||result.cover.h!==500)throw new Error('Exact-size output failed');
     if(result.contain.corner[0]<220||result.contain.corner[1]<220||result.contain.corner[2]<220)throw new Error('Contain padding is not white');
     if(result.cover.corner[0]>200&&result.cover.corner[1]>200&&result.cover.corner[2]>200)throw new Error('Crop mode unexpectedly padded image');
     if(result.custom!=='custom')throw new Error('Manual override did not switch to custom');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(()=>{
       const initial=$('width').value;const originalPreset=$('preset').value;
       busy=true;applyPreset('x-header');const blockedBusy=$('width').value===initial;
       busy=false;zipBusy=true;applyPreset('ig-story');const blockedZip=$('width').value===initial;
       zipBusy=false;applyPreset('x-header');const applied=$('width').value==='1500'&&$('height').value==='500';
       $('preset').value=originalPreset;return {blockedBusy,blockedZip,applied};
     });
     if(!result.blockedBusy||!result.blockedZip||!result.applied)throw new Error('Preset changed during active processing');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(()=>{
       $('preset').value='ig-story';applyPreset('ig-story');
       const guide=$('preset-guide').textContent;
       const stage=$('preview-stage');
       $('fit').value='cover';$('fit').dispatchEvent(new Event('change',{bubbles:true}));
       const crop=$('preset-guide').textContent;
       const custom=$('preset').value;
       const hasFitControl=$('fit').options.length===3;
       zipBusy=true;applyPreset('x-header');const blocked=$('width').value==='1080';zipBusy=false;
       return {guide,crop,custom,hasFitControl,blocked};
     });
     if(!result.guide.includes('Instagram')||!result.guide.includes('余白')||!result.crop.includes('手動設定')||result.custom!=='custom'||!result.hasFitControl||!result.blocked)throw new Error('Preset guidance or locked settings failed');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const canvas=document.createElement('canvas');canvas.width=8;canvas.height=4;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
       choose([new File([blob],'preview-size.png',{type:'image/png'})]);
       applyPreset('ig-story');const contain=$('preview-dimensions').textContent;
       $('fit').value='cover';$('fit').dispatchEvent(new Event('change',{bubbles:true}));
       const cover=$('preview-dimensions').textContent;const objectFit=$('preview-adjusted').style.objectFit;
       applyPreset('web');const resize=$('preview-dimensions').textContent;
       return {contain,cover,objectFit,resize};
     });
     if(!result.contain.includes('1080×1920')||!result.contain.includes('余白')||!result.cover.includes('中央切り抜き')||result.objectFit!=='cover'||!result.resize.includes('縦横比'))throw new Error('Platform preview dimensions and crop guidance failed');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const canvas=document.createElement('canvas');canvas.width=20;canvas.height=10;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,20,10);
       const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const file=new File([blob],'pad-check.png',{type:'image/png'});
       const sample=async(preset,fit,bg)=>{applyPreset(preset);$('fit').value=fit;$('bg').value=bg;const o=valid();o.fit=fit;o.bg=bg;o.format=$('format').value;o.square='off';o.quality=.85;o.target=0;o.adjustMode='batch';o.batchSettings={brightness:100,contrast:100};o.perImage=new Map();const out=await convert(file,o);const bitmap=await createImageBitmap(out.blob);const c=document.createElement('canvas');c.width=out.w;c.height=out.h;const g=c.getContext('2d');g.drawImage(bitmap,0,0);const top=[...g.getImageData(0,0,1,1).data],center=[...g.getImageData(out.w/2|0,out.h/2|0,1,1).data];bitmap.close();URL.revokeObjectURL(out.url);return {w:out.w,h:out.h,top,center}};
       return {black:await sample('mercari','contain','black'),white:await sample('mercari','contain','white'),crop:await sample('mercari','cover','white'),portrait:await sample('ig-story','contain','white')};
     });
     for(const key of ['black','white','crop'])if(result[key].w!==1080||result[key].h!==1080)throw new Error('Marketplace exact output dimensions failed: '+key);
     if(result.portrait.w!==1080||result.portrait.h!==1920)throw new Error('Instagram story exact output dimensions failed');
     const black=result.black.top,white=result.white.top,crop=result.crop.top;
     if(black[0]>30||black[1]>30||black[2]>30)throw new Error('Black padding pixels failed');
     if(white[0]<220||white[1]<220||white[2]<220)throw new Error('White padding pixels failed');
     if(crop[0]<180||crop[1]>80||crop[2]>80)throw new Error('Crop unexpectedly left padding');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const canvas=document.createElement('canvas');canvas.width=80;canvas.height=40;const ctx=canvas.getContext('2d');ctx.fillStyle='#f33';ctx.fillRect(0,0,80,40);
       const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const file=new File([blob],'small-source.png',{type:'image/png'});
       const check=async(preset,fit)=>{applyPreset(preset);const o=valid();o.fit=fit;o.bg='white';o.format='image/jpeg';o.square='off';o.quality=.85;o.target=0;o.adjustMode='batch';o.batchSettings={brightness:100,contrast:100};o.perImage=new Map();const out=await convert(file,o);const result={w:out.w,h:out.h,sourceWidth:out.sourceWidth,sourceHeight:out.sourceHeight,upscaled:out.upscaled,fit:out.fit};URL.revokeObjectURL(out.url);return result};
       const contain=await check('mercari','contain'),crop=await check('x-header','cover'),resize=await check('web','resize');
       return {contain,crop,resize};
     });
     if(result.contain.sourceWidth!==80||result.contain.sourceHeight!==40||!result.contain.upscaled||result.contain.w!==1080||result.contain.h!==1080)throw new Error('Contain enlargement metadata failed');
     if(!result.crop.upscaled||result.crop.fit!=='cover'||result.crop.w!==1500||result.crop.h!==500)throw new Error('Crop enlargement metadata failed');
     if(result.resize.upscaled||result.resize.w!==80||result.resize.h!==40)throw new Error('Resize should not enlarge source');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(()=>{
       const blob=new Blob(['sample'],{type:'image/jpeg'}),file=new File([blob],'small.jpg',{type:'image/jpeg'});
       const output={source:file,blob,w:1080,h:1080,sourceWidth:80,sourceHeight:40,upscaled:true,fit:'cover',ext:'jpg',name:'small.jpg',url:URL.createObjectURL(blob),adjustment:{brightness:100,contrast:100},targetBytes:0};
       outputs=[output];render();const text=$('list').textContent;resetResults();return {text,hidden:$('result').classList.contains('hidden')};
     });
     if(!result.text.includes('80 × 40 px → 1080 × 1080 px')||!result.text.includes('元画像を拡大')||!result.text.includes('中央切り抜き')||!result.hidden)throw new Error('Result quality warnings or cleanup failed');
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(()=>{
       applyPreset('mercari');const presetSquareDisabled=$('square').disabled;
       $('fit').value='resize';$('fit').dispatchEvent(new Event('change',{bubbles:true}));
       const resizeSquareEnabled=!$('square').disabled;
       $('square').value='black';$('fit').value='cover';$('fit').dispatchEvent(new Event('change',{bubbles:true}));
       const coverSquareDisabled=$('square').disabled&&$('square').value==='off';
       $('width').value='10000';$('height').value='10000';let rejected=false;try{valid()}catch(e){rejected=e.message.includes('5000万画素')}
       $('width').value='1080';$('height').value='1080';const accepted=valid().w===1080;
       return {presetSquareDisabled,resizeSquareEnabled,coverSquareDisabled,rejected,accepted};
     });
     if(Object.values(result).some(v=>!v))throw new Error('Square-mode conflict or 50MP prevalidation regression: '+JSON.stringify(result));
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(()=>{
       const expected={threads:[1080,1350],linkedin:[1200,627],pinterest:[1000,1500]};const checks=[];
       for(const [preset,dimensions] of Object.entries(expected)){
         $('preset').value=preset;applyPreset(preset);
         checks.push({preset,exists:$('preset').selectedOptions[0]?.textContent.includes('設定例'),width:Number($('width').value),height:Number($('height').value),fit:$('fit').value,format:$('format').value,squareDisabled:$('square').disabled,guide:$('preset-guide').textContent});
       }
       return {expected,checks};
     });
     for(const x of result.checks){const [w,h]=result.expected[x.preset];if(!x.exists||x.width!==w||x.height!==h||x.fit!=='contain'||x.format!=='image/jpeg'||!x.squareDisabled||!x.guide.includes('余白'))throw new Error('New social platform preset failed: '+JSON.stringify(x));}
   });
   // Baseline coverage for the PDF tool: file requirement, mode switching and safe reset.
   await test(local('tools/pdf-split-rename/index.html'),async()=>{
     await page.locator('#preview').click();
     const noFile=await page.locator('#message').innerText();
     if(!noFile.includes('先にPDFを選択'))throw new Error('PDF missing-file validation failed: '+noFile);
     if(await page.locator('#save').isEnabled())throw new Error('PDF ZIP save enabled without a plan');
     await page.locator('#mode').selectOption('ranges');
     if(await page.locator('#rangeWrap').evaluate(el=>el.hidden))throw new Error('PDF range mode hidden');
     await page.locator('#names').fill('請求書_一件');
     await page.locator('#ranges').fill('1-3');
     await page.locator('#clear').click();
     if(await page.locator('#names').inputValue())throw new Error('PDF filename reset failed');
     if(await page.locator('#save').isEnabled())throw new Error('PDF ZIP save enabled after reset');
     await page.locator('#mode').selectOption('each');
     if(!(await page.locator('#rangeWrap').evaluate(el=>el.hidden)))throw new Error('PDF range mode not hidden after switch');
   });
   // End-to-end PDF test: generate a fixture, split by range, inspect ZIP contents and resulting page counts.
   await test(local('tools/pdf-split-rename/index.html'),async()=>{
     await page.waitForFunction(()=>Boolean(window.PDFLib&&window.JSZip),{timeout:20000});
     const base64=await page.evaluate(async()=>{
       const pdf=await PDFLib.PDFDocument.create();for(let i=0;i<3;i++)pdf.addPage([300,400]);
       const bytes=await pdf.save();let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);
     });
     await page.locator('#file').setInputFiles({name:'invoices.pdf',mimeType:'application/pdf',buffer:Buffer.from(base64,'base64')});
     await page.waitForFunction(()=>document.querySelector('#fileInfo').textContent.includes('3ページ'));
     await page.locator('#mode').selectOption('ranges');
     await page.locator('#ranges').fill('1-2\n3');
     await page.locator('#names').fill('請求書_前半\n請求書_後半');
     await page.locator('#preview').click();
     if(!(await page.locator('#summary').innerText()).includes('2ファイル'))throw new Error('PDF split preview did not show two files');
     const result=await page.evaluate(async()=>{
       const original=HTMLAnchorElement.prototype.click;let captured=null;
       HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.zip'))captured={url:this.href,name:this.download};else original.call(this)};
       try{
         document.getElementById('save').click();for(let i=0;i<200&&!captured;i++)await new Promise(resolve=>setTimeout(resolve,50));
         if(!captured)throw Error('ZIP download was not initiated: '+document.getElementById('progress').textContent);
         const zip=await JSZip.loadAsync(await (await fetch(captured.url)).arrayBuffer());
         const names=Object.keys(zip.files).sort();const counts=[];
         for(const name of names){const bytes=await zip.file(name).async('uint8array');const pdf=await PDFLib.PDFDocument.load(bytes);counts.push(pdf.getPageCount())}
         return {name:captured.name,names,counts};
       }finally{HTMLAnchorElement.prototype.click=original}
     });
     if(result.name!=='invoices-split.zip'||JSON.stringify(result.names)!==JSON.stringify(['請求書_前半.pdf','請求書_後半.pdf'])||JSON.stringify(result.counts)!==JSON.stringify([2,1]))throw new Error('PDF ZIP split content mismatch: '+JSON.stringify(result));
   });
   // PDF validation: invalid page ranges, duplicate filenames, stale previews and damaged files.
   await test(local('tools/pdf-split-rename/index.html'),async()=>{
     await page.waitForFunction(()=>Boolean(window.PDFLib&&window.JSZip),{timeout:20000});
     const base64=await page.evaluate(async()=>{
       const pdf=await PDFLib.PDFDocument.create();pdf.addPage([300,400]);pdf.addPage([300,400]);
       const bytes=await pdf.save();let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);
     });
     await page.locator('#file').setInputFiles({name:'二枚.pdf',mimeType:'application/pdf',buffer:Buffer.from(base64,'base64')});
     await page.waitForFunction(()=>document.querySelector('#fileInfo').textContent.includes('2ページ'));
     await page.locator('#mode').selectOption('ranges');
     await page.locator('#ranges').fill('3');
     await page.locator('#preview').click();
     if(!(await page.locator('#message').innerText()).includes('1〜2ページ'))throw new Error('Out-of-range PDF page was accepted');
     if(await page.locator('#save').isEnabled())throw new Error('PDF save enabled after invalid range');
     await page.locator('#ranges').fill('2-1');
     await page.locator('#preview').click();
     if(await page.locator('#save').isEnabled())throw new Error('Descending PDF range was accepted');
     await page.locator('#ranges').fill('1\n2');
     await page.locator('#names').fill('請求書\n請求書');
     await page.locator('#preview').click();
     if(!(await page.locator('#message').innerText()).includes('重複'))throw new Error('Duplicate PDF filenames were accepted');
     await page.locator('#names').fill('請求書A\n請求書B');
     await page.locator('#preview').click();
     if(await page.locator('#save').isDisabled())throw new Error('Valid PDF preview did not enable ZIP save');
     await page.locator('#names').fill('変更後A\n変更後B');
     if(await page.locator('#save').isEnabled()||await page.locator('#rows tr').count())throw new Error('PDF preview remained valid after filename edit');
     await page.locator('#file').setInputFiles({name:'damaged.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf','utf8')});
     await page.waitForFunction(()=>document.querySelector('#fileInfo').textContent.includes('PDFを開けません'));
     if(await page.locator('#save').isEnabled())throw new Error('Damaged PDF allowed ZIP export');
   });
   // End-to-end list cleaner: deduplicate, compare two lists, count frequencies and reset.
   await test(local('tools/list-cleaner/index.html'),async()=>{
     await page.locator('#a').fill('apple\nbanana\napple\ncherry');
     await page.locator('#b').fill('banana\ndate');
     const cases=[['unique','apple\nbanana\ncherry'],['common','banana'],['onlyA','apple\ncherry'],['onlyB','date'],['union','apple\nbanana\ncherry\ndate']];
     for(const [mode,expected] of cases){
       await page.locator('#mode').selectOption(mode);await page.locator('#run').click();
       const actual=await page.locator('#out').inputValue();
       if(actual!==expected)throw new Error('List cleaner '+mode+' mismatch: '+JSON.stringify(actual));
     }
     await page.locator('#mode').selectOption('frequency');await page.locator('#run').click();
     const frequency=await page.locator('#out').inputValue();
     if(!frequency.includes('apple\t2')||!frequency.includes('banana\t1'))throw new Error('List cleaner frequency mismatch: '+JSON.stringify(frequency));
     await page.locator('#reset').click();
     if(await page.locator('#a').inputValue()||await page.locator('#b').inputValue()||await page.locator('#out').inputValue())throw new Error('List cleaner reset did not clear data');
   });
   // Spreadsheet-safe frequency copy must match the protected TSV export.
   await test(local('tools/list-cleaner/index.html'),async()=>{
     await page.locator('#mode').selectOption('frequency');
     await page.locator('#a').fill('=SUM(1,1)\n=SUM(1,1)\n+IMPORTXML(A1,B1)\n-abc\n-12.5\n@cmd');
     await page.locator('#run').click();
     await page.evaluate(()=>{
       window.__copiedText=null;
       Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copiedText=value}}});
     });
     await page.locator('#copy').click();
     const copied=await page.evaluate(()=>window.__copiedText);
     if(!copied)throw new Error('Frequency copy produced no text');
     for(const value of ["'=SUM(1,1)\t2","'+IMPORTXML(A1,B1)\t1","'-abc\t1","'@cmd\t1","-12.5\t1"]){
       if(!copied.split('\n').includes(value))throw new Error('Unsafe frequency copy: '+value);
     }
     if((await page.locator('#out').inputValue()).includes("'=SUM"))throw new Error('Copy escaping changed preview');
   });
   // List cleaner export: output changes invalidate old downloads and TSV keeps a UTF-8 BOM.
   await test(local('tools/list-cleaner/index.html'),async()=>{
     await page.locator('#a').fill('SKU-02\nSKU-01\nSKU-02');
     await page.locator('#mode').selectOption('frequency');
     await page.locator('#run').click();
     const pending=page.waitForEvent('download');
     await page.locator('#download').click();
     const file=await pending;
     if(file.suggestedFilename()!=='list-frequency.tsv')throw new Error('List cleaner export filename mismatch');
     const bytes=fs.readFileSync(await file.path());
     const data=bytes.toString('utf8');
     if(!data.startsWith('\ufeff')||!data.includes('SKU-02\t2')||!data.includes('SKU-01\t1'))throw new Error('List cleaner TSV content or BOM mismatch: '+JSON.stringify(data));
     await page.locator('#a').fill('changed');
     if(await page.locator('#download').isEnabled())throw new Error('List cleaner allows stale export after input edit');
     await page.locator('#run').click();
     if(!(await page.locator('#download').isEnabled()))throw new Error('List cleaner export did not re-enable');
   });
   // AdSense readiness: batch-check all eight tools for accessible content,
   // first-use guidance, privacy disclosure, support navigation and reset-safe outputs.
   for(const slug of ['csv-merge','csv-analyzer','list-cleaner','pricing-simulator','order-line-aggregate','order-payment-reconcile','pdf-split-rename','image-batch']){
     await test(local('tools/'+slug+'/index.html'),async()=>{
       const title=(await page.title()).trim();
       const heading=(await page.locator('main h1').first().innerText()).trim();
       if(!title||!heading)throw new Error('Tool missing page title or primary heading: '+slug);
       const mainText=await page.locator('main').innerText();
       if(mainText.length<400)throw new Error('Tool has insufficient visible usage content: '+slug);
       if(!/ブラウザ|端末|外部|送信|保存/.test(mainText))throw new Error('Tool missing data handling explanation: '+slug);
       if(await page.locator('main a[href*="guides/"]').count()===0)throw new Error('Tool missing usage guide: '+slug);
       if(await page.locator('a[href*="privacy/"]').count()===0)throw new Error('Tool missing privacy link: '+slug);
       if(await page.locator('a[href*="data-lab/organization/"]').count()===0)throw new Error('Tool missing operator information link: '+slug);
       if(await page.locator('main button').count()===0)throw new Error('Tool missing action controls: '+slug);
     });
   }
   // Batch regression: changed pricing inputs must invalidate both stale output
   // and stale comparison; recalculation must restore a valid copyable result.
   await test(local('tools/pricing-simulator/index.html'),async()=>{
     await page.locator('#example-physical').click();
     if(!(await page.locator('#comparison tr').count()))throw new Error('Pricing comparison missing after preset');
     if(await page.locator('#copyResult').isDisabled())throw new Error('Pricing copy disabled after valid calculation');
     await page.locator('#fee').fill('18');
     if(await page.locator('#comparison tr').count())throw new Error('Stale comparison retained after fee edit');
     if(!(await page.locator('#result').innerText()).includes('再計算'))throw new Error('Stale pricing result retained after fee edit');
     if(!(await page.locator('#copyResult').isDisabled()))throw new Error('Stale pricing result remains copyable');
     await page.locator('#calculate').click();
     if(!(await page.locator('#comparison tr').count()))throw new Error('Comparison not restored after recalculation');
     if(await page.locator('#copyResult').isDisabled())throw new Error('Copy not restored after recalculation');
     await page.locator('#count').fill('0');
     await page.locator('#calculate').click();
     if(!(await page.locator('#copyResult').isDisabled()))throw new Error('Invalid sale count enabled copy');
     if(await page.locator('#comparison tr').count())throw new Error('Invalid sale count retained comparison');
   });
   // AdSense technical readiness: check canonical/indexing metadata for the
   // eight tools plus their directories and the published sitemap in one pass.
   const indexable=['tools/','guides/','data-lab/','tools/csv-merge/','tools/csv-analyzer/','tools/list-cleaner/','tools/pricing-simulator/','tools/order-line-aggregate/','tools/order-payment-reconcile/','tools/pdf-split-rename/','tools/image-batch/'];
   const sitemap=fs.readFileSync(path.resolve(__dirname,'../sitemap.xml'),'utf8');
   for(const route of indexable){
     await test(local(route+'index.html'),async()=>{
       const canonical='https://ogb-umalab.com/'+route;
       const actual=await page.locator('link[rel="canonical"]').getAttribute('href');
       if(actual!==canonical)throw new Error('Canonical mismatch for '+route+': '+actual);
       const description=await page.locator('meta[name="description"]').getAttribute('content');
       if(!description||description.trim().length<35)throw new Error('Missing useful meta description: '+route);
       const robots=await page.evaluate(()=>document.querySelector('meta[name="robots"]')?.getAttribute('content')??null);
       if(robots&&/noindex/i.test(robots))throw new Error('Unexpected noindex: '+route);
       if(!sitemap.includes('<loc>'+canonical+'</loc>'))throw new Error('Sitemap missing canonical: '+route);
     });
   }
   // Batch check the full guide catalogue: indexability, canonical URLs,
   // descriptive metadata and sitemap discovery, not just the landing page.
   for(const slug of ['troubleshooting','tool-selection','csv-merge-hands-on','csv-analysis-hands-on','csv-analysis-basics','order-reconciliation-hands-on','order-payment-reconciliation','pricing-simulator-hands-on','pricing-profit-basics','list-cleaner-hands-on','image-batch-hands-on']){
     await test(local('guides/'+slug+'/index.html'),async()=>{
       const canonical='https://ogb-umalab.com/guides/'+slug+'/';
       if(await page.locator('link[rel="canonical"]').getAttribute('href')!==canonical)throw new Error('Guide canonical mismatch: '+slug);
       if(!sitemap.includes('<loc>'+canonical+'</loc>'))throw new Error('Guide absent from sitemap: '+slug);
       const description=await page.locator('meta[name="description"]').getAttribute('content');
       if(!description||description.trim().length<35)throw new Error('Guide description missing: '+slug);
       if(!(await page.locator('main h1').first().innerText()).trim())throw new Error('Guide heading missing: '+slug);
       const robots=await page.evaluate(()=>document.querySelector('meta[name="robots"]')?.getAttribute('content')??null);
       if(robots&&/noindex/i.test(robots))throw new Error('Guide marked noindex: '+slug);
     });
   }
   // Editorial accuracy: guide claims must match the implemented image presets.
   await test(local('tools/image-batch/index.html'),async()=>{
     for(const preset of ['mercari','yahoo','x-post','ig-square']){
       if(await page.locator('#preset option[value="'+preset+'"]').count()!==1)throw new Error('Missing advertised image preset: '+preset);
     const guideText=await page.locator('main').innerText();
     if(guideText.includes('販売サービス別プリセットは現在ありません'))throw new Error('Tool still denies existing presets');
     }
   });
   for(const guide of ['guides/index.html','guides/image-batch-hands-on/index.html']){
     await test(local(guide),async()=>{
       const content=await page.locator('main').innerText();
       if(!content.includes('メルカリ')||!content.includes('Yahoo!オークション'))throw new Error('Image preset guidance missing: '+guide);
       if(/メルカリ・ヤフオク[^。]*プリセット[^。]*対応していません/.test(content))throw new Error('Outdated preset disclaimer: '+guide);
     });
   }
   // Reset must restore list-cleaner defaults, not only clear its text fields.
   await test(local('tools/list-cleaner/index.html'),async()=>{
     await page.locator('#frequency-example').click();
     if(await page.locator('#mode').inputValue()!=='frequency'||await page.locator('#download').isDisabled())throw new Error('Frequency sample failed');
     await page.locator('#trim').uncheck();
     await page.locator('#empty').uncheck();
     await page.locator('#case').check();
     await page.locator('#reset').click();
     if(await page.locator('#a').inputValue()||await page.locator('#b').inputValue()||await page.locator('#out').inputValue())throw new Error('List cleaner reset retained text');
     if(await page.locator('#mode').inputValue()!=='unique'||!await page.locator('#trim').isChecked()||!await page.locator('#empty').isChecked()||await page.locator('#case').isChecked())throw new Error('List cleaner reset did not restore defaults');
     if(await page.locator('#download').isEnabled()||await page.locator('#copy').isEnabled())throw new Error('List cleaner reset retained stale export');
   });
   // Cross-tool CSV checks: malformed columns, quoted Japanese IDs, and exported grouping data.
   await test(local('tools/csv-merge/index.html'),async()=>{
     const files=[
       {name:'東京.csv',mimeType:'text/csv',buffer:Buffer.from('ID,金額\n"東京,001",120\n','utf8')},
       {name:'大阪.csv',mimeType:'text/csv',buffer:Buffer.from('金額,ID\n80,"大阪,002"\n','utf8')}
     ];
     await page.locator('#files').setInputFiles(files);
     await page.locator('#source').uncheck();
     await page.locator('#merge').click();
     await page.locator('#output').waitFor({state:'visible'});
     const promise=page.waitForEvent('download');
     await page.locator('#download').click();
     const data=fs.readFileSync(await (await promise).path(),'utf8');
     if(!data.startsWith('\ufeff')||!data.includes('"東京,001",120')||!data.includes('"大阪,002",80'))throw new Error('Merged CSV changed quoted IDs or reordered amounts: '+JSON.stringify(data));
     await page.locator('#files').setInputFiles([
       {name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('ID,ID\nA,1','utf8')},files[1]
     ]);
     await page.locator('#merge').click();
     await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('同じ列名'),{timeout:10000});
     if(!await page.locator('#output').isHidden())throw new Error('Invalid merge retained old downloadable output');
   });
   await test(local('tools/csv-analyzer/index.html'),async()=>{
     await page.locator('#file').setInputFiles({name:'日本語.csv',mimeType:'text/csv',buffer:Buffer.from('分類,売上\n東京,100\n大阪,200\n東京,50','utf8')});
     await page.waitForFunction(()=>document.querySelector('#results')?.hidden===false);
     await page.locator('#xcol').selectOption('0');
     await page.locator('#ycol').selectOption('1');
     await page.locator('#chartType').selectOption('bar');
     await page.locator('#agg').selectOption('sum');
     const pending=page.waitForEvent('download');
     await page.locator('#exportGroup').click();
     const data=fs.readFileSync(await (await pending).path(),'utf8');
     if(!data.startsWith('\ufeff')||!data.includes('東京,150')||!data.includes('大阪,200'))throw new Error('CSV analyzer grouped export incorrect: '+JSON.stringify(data));
     await page.locator('#file').setInputFiles({name:'broken.csv',mimeType:'text/csv',buffer:Buffer.from('分類,売上\n東京,100,EXTRA','utf8')});
     await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('列数が一致しません'));
     if(!await page.locator('#results').isHidden())throw new Error('Invalid analyzer input retained previous export results');
   });
   await test(local('tools/order-line-aggregate/index.html'),async()=>{
     await page.locator('#demo').click();
     await page.locator('#run').click();
     if(await page.locator('#save').isDisabled())throw new Error('Order totals were not exportable');
     await page.locator('#amtcol').selectOption('2');
     await page.locator('#amtcol').selectOption('0');
     if(await page.locator('#save').isEnabled()||await page.locator('#saveSearch').isEnabled())throw new Error('Order totals remained exportable after column change');
     await page.locator('#run').click();
     if(!(await page.locator('#runStatus').innerText()).includes('別の列'))throw new Error('Same ID and amount column accepted');
     if(await page.locator('#result tr').count())throw new Error('Invalid aggregation retained old results');
   });
   await test(local('tools/list-cleaner/index.html'),async()=>{
     await page.locator('#frequency-example').click();
     if(await page.locator('#download').innerText()!=='TSVで保存') throw new Error('Frequency export label is incorrect');
     await page.locator('#a').fill('=SUM(1,1)\n=SUM(1,1)\n+IMPORTXML(A1,B1)\n-abc\n-12.5\n@cmd');
     await page.locator('#run').click();
     const pending=page.waitForEvent('download');
     await page.locator('#download').click();
     const file=await pending;
     const exported=fs.readFileSync(await file.path(),'utf8').replace(/^\uFEFF/,'');
     for(const value of ["'=SUM(1,1)\t2","'+IMPORTXML(A1,B1)\t1","'-abc\t1","'@cmd\t1","-12.5\t1"]){
       if(!exported.split('\n').includes(value))throw new Error('Spreadsheet-safe TSV missing: '+value);
     }
     if((await page.locator('#out').inputValue()).includes("'=SUM")) throw new Error('Export escaping changed on-screen data');
     await page.locator('#mode').selectOption('unique');
     if(await page.locator('#download').innerText()!=='TXTで保存')throw new Error('TXT export label not restored');
     if(!await page.locator('#download').isDisabled())throw new Error('Old result remained downloadable after mode switch');
   });
   // Keyboard navigation regression: each free tool must offer a visible skip link.
   for(const slug of ['', 'pdf-split-rename/', 'image-batch/', 'list-cleaner/', 'order-line-aggregate/', 'order-payment-reconcile/', 'csv-merge/', 'csv-analyzer/', 'pricing-simulator/']){
     await test(local('tools/'+slug+'index.html'),async()=>{
       await page.keyboard.press('Tab');
       const active=await page.evaluate(()=>({href:document.activeElement?.getAttribute('href'),visible:(()=>{const e=document.activeElement;const r=e?.getBoundingClientRect();return !!r&&r.top>=0&&r.bottom>r.top})()}));
       if(active.href!=='#main'||!active.visible) throw new Error('Keyboard skip link missing or not visible: '+JSON.stringify(active));
       await page.keyboard.press('Enter');
       const hash=await page.evaluate(()=>location.hash);
       if(hash!=='#main') throw new Error('Skip link did not navigate to main: '+hash);
       const main=page.locator('main#main');
       if(await main.count()!==1) throw new Error('Missing unique main landmark');
       const link=page.locator('main a').first();
       if(await link.count()){
         await link.focus();
         const outline=await link.evaluate(e=>getComputedStyle(e).outlineStyle);
         if(outline==='none') throw new Error('Keyboard link focus is invisible');
       }
     });
   }
   // Public visitor journeys: verify live pages and their navigation, not only source HTML.
   if(!toolsOnly){
     await test('/data-lab/',async()=>{
       for(const slug of ['csv-merge','csv-analyzer','list-cleaner','pricing-simulator','order-line-aggregate','order-payment-reconcile','pdf-split-rename','image-batch']){
         const link=page.locator('a[href="../tools/'+slug+'/"]').first();
         if(await link.count()===0) throw new Error('Landing missing tool: '+slug);
       }
       for(const guide of ['tool-selection','troubleshooting']){
         if(await page.locator('a[href="../guides/'+guide+'/"]').count()===0) throw new Error('Landing missing guide: '+guide);
       }
     });
     await test('/guides/',async()=>{
       for(const guide of ['tool-selection','troubleshooting','image-batch-hands-on','list-cleaner-hands-on']){
         if(await page.locator('a[href="'+guide+'/"]').count()===0) throw new Error('Guide directory missing '+guide);
       }
     });
     for(const slug of ['tool-selection','troubleshooting','image-batch-hands-on','list-cleaner-hands-on']){
       await test('/guides/'+slug+'/',async()=>{
         if(!(await page.locator('main h1').innerText()).trim()) throw new Error('Guide heading missing: '+slug);
         if(await page.locator('main a[href*="tools/"]').count()===0) throw new Error('Guide has no tool navigation: '+slug);
       });
     }
     await test('/tools/',async()=>{
       const link=page.locator('a[href="../guides/troubleshooting/"]').first();
       if(await link.count()===0) throw new Error('Tool directory missing troubleshooting');
       await link.click();
       await page.waitForURL('**/guides/troubleshooting/');
       if(!(await page.locator('h1').innerText()).includes('困ったとき')) throw new Error('Troubleshooting navigation failed');
     });
     for(const slug of ['csv-merge','csv-analyzer','list-cleaner','pricing-simulator','order-line-aggregate','order-payment-reconcile','pdf-split-rename','image-batch']){
       await test('/tools/'+slug+'/',async()=>{
         const link=page.locator('a[href="/guides/troubleshooting/"]').first();
         if(await link.count()===0) throw new Error('Tool missing support link: '+slug);
         await link.click();
         await page.waitForURL('**/guides/troubleshooting/');
         if(!(await page.locator('h1').innerText()).includes('困ったとき')) throw new Error('Tool support link broken: '+slug);
       });
     }
   }
   if(!toolsOnly){
   await test('/umalab/',async()=>{
     const css=await page.locator('body').evaluate(e=>getComputedStyle(e).fontFamily);
     if(!css||css==='Times New Roman') throw new Error('UmaLab stylesheet not applied');
     const logo=page.locator('header img').first();
     if(!(await logo.evaluate(e=>e.complete&&e.naturalWidth>0))) throw new Error('UmaLab logo missing');
   });
   await test('/about/',async()=>{
     const link=page.locator('a.official-link-card').filter({hasText:'OGBデータ研究所'}).first();
     if(!await link.count()) throw new Error('Data Lab card not found');
     if(new URL(await link.getAttribute('href'),base).pathname!=='/') throw new Error('Data Lab link rewritten');
     await link.click();
     await page.waitForTimeout(250);
     const href = await link.getAttribute('href');
     if(new URL(href,base).pathname!=='/') throw new Error('Data Lab card click target incorrect');
   });
   await test('/',async()=>{
     if(!(await page.title()).includes('OGBデータ研究所')) throw new Error('Wrong main homepage');
   });
   await test('/tools/csv-analyzer/',async()=>{
     await page.locator('#sample').click();
     if(!(await page.locator('#results').isVisible())) throw new Error('CSV results did not appear');
     if(!(await page.locator('#summary tr').count())) throw new Error('CSV statistical rows missing');
   });
   await test('/tools/pricing-simulator/',async()=>{
     await page.locator('#calculate').click();
     const body=await page.locator('body').innerText();
     if(!(await page.locator('#result').innerText()).trim()) throw new Error('Pricing output empty');
   });
   for(const [slug,button,result] of [['profit-break-even','calc-profit','profit-result'],['basic-statistics','calc-stats','stats-result'],['correlation','calc-corr','corr-result']]){
     await test('/tools/'+slug+'/',async()=>{
       await page.locator('#'+button).click();
       if(!(await page.locator('#'+result).innerText()).trim()) throw new Error('Calculator output empty: '+slug);
     });
   }
   await test('/ogb-data/daily/',async()=>{});
   await test('/global-news/',async()=>{});
   await test('/class-promotion/',async()=>{});
   }
 } catch(e) { errors.push(String(e)); }
 await browser.close();
 if(ledgerServer.listening)await new Promise(resolve=>ledgerServer.close(resolve));
 if(errors.length) {console.error(errors.join('\n')); process.exit(1);}
})().catch(e=>{console.error(e);process.exit(1)});
