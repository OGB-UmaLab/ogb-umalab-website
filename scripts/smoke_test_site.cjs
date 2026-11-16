const { chromium } = require('playwright');
const base = 'https://ogb-umalab.com';
const toolsOnly = process.argv.includes('--tools-only');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const local = rel => pathToFileURL(path.resolve(__dirname, '..', rel)).href;
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage();
 const errors=[];
 fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
 const test=async (testPath,fn)=>{
  try {
   const target=testPath.startsWith('file:')?testPath:base+testPath;
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
   await test(local('tools/order-payment-reconcile/index.html'),async()=>{
     await page.locator('#orders').setInputFiles({name:'duplicate.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額,金額\nA001,100,200','utf8')});
     await page.locator('#payments').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,金額\nA001,100','utf8')});
     await page.locator('#load').click();
     if(!(await page.locator('#loadStatus').innerText()).includes('同じ名前の見出し')) throw new Error('Duplicate headers not rejected');
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
     if(!(await page.locator('#loadStatus').innerText()).includes('同じ名前の見出し')) throw new Error('Duplicate aggregation headers not rejected');
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
     await page.locator('#file').setInputFiles({name:'refund.csv',mimeType:'text/csv',buffer:Buffer.from('注文番号,明細金額\\nR001,-100','utf8')});
     await page.locator('#load').click();
     await page.locator('#run').click();
     const downloadPromise=page.waitForEvent('download');
     await page.locator('#save').click();
     const downloaded=await downloadPromise;
     const csv=fs.readFileSync(await downloaded.path(),'utf8');
     if(!csv.includes('R001,-100,1')) throw new Error('Negative amount changed by CSV export guard');
   });
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
   await test('/tools/',async()=>{
     await page.locator('#calc-profit').click();
     if(!(await page.locator('#profit-result').innerText()).trim()) throw new Error('Profit result empty');
     await page.locator('#calc-stats').click();
     if(!(await page.locator('#stats-result').innerText()).trim()) throw new Error('Statistics result empty');
     await page.locator('#calc-corr').click();
     if(!(await page.locator('#corr-result').innerText()).trim()) throw new Error('Correlation result empty');
   });
   await test('/ogb-data/daily/',async()=>{});
   await test('/global-news/',async()=>{});
   await test('/class-promotion/',async()=>{});
   }
 } catch(e) { errors.push(String(e)); }
 await browser.close();
 if(errors.length) {console.error(errors.join('\n')); process.exit(1);}
})().catch(e=>{console.error(e);process.exit(1)});
