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
 const waitForText=(selector,expected)=>page.waitForFunction(
  ([selector,expected])=>document.querySelector(selector)?.textContent.includes(expected),
  [selector,expected]
 );
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
     if(!csv.includes('"一行目\\r\\n二行目"')) throw new Error('Quoted multiline cell missing in export');
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
   await test(local('tools/index.html'),async()=>{
     await page.locator('#csv').setInputFiles({name:'quoted.csv',mimeType:'text/csv',buffer:Buffer.from('項目,金額\n"A,B",1200','utf8')});
     await waitForText('#stats-result','引用符付きCSV');
   });
   await test(local('tools/index.html'),async()=>{
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
