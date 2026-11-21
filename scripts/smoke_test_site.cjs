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
       try{const out=await convert(file,{w:8000,h:8000,adjustMode:'batch',batchSettings:{brightness:100,contrast:100},perImage:new Map()});URL.revokeObjectURL(out.url);return 'unexpected success'}catch(e){return e.message}
     });
     if(!outcome.includes('ピクセル数'))throw new Error('Oversized square canvas was not rejected: '+outcome);
   });
   await test(local('tools/image-batch/index.html'),async()=>{
     const result=await page.evaluate(async()=>{
       const c=document.createElement('canvas');c.width=6;c.height=4;
       const source=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
       const file=new File([source],'alpha.png',{type:'image/png'});
       const options={w:6,h:4,adjustMode:'batch',batchSettings:{brightness:100,contrast:100},perImage:new Map()};
       async function pixel(format,bg){$('format').value=format;$('bg').value=bg;$('square').value='off';const out=await convert(file,options);const bitmap=await createImageBitmap(out.blob);const target=document.createElement('canvas');target.width=6;target.height=4;const ctx=target.getContext('2d');ctx.drawImage(bitmap,0,0);const data=ctx.getImageData(0,0,1,1).data;bitmap.close();URL.revokeObjectURL(out.url);return [...data]}
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
     const failures=await page.locator('#failure-list').innerText();
     for(let i=0;i<5;i++)if(!failures.includes('bad-'+i+'.png'))throw new Error('Missing failed filename '+i);
     await page.locator('#width').fill('400');await page.locator('#width').dispatchEvent('change');
     if(!(await page.locator('#failure-report').isHidden()))throw new Error('Stale failure report retained after settings change');
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
