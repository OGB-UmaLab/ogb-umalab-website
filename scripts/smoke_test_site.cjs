const { chromium } = require('playwright');
const base = 'https://ogb-umalab.com';
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage();
 const errors=[];
 const test=async (path,fn)=>{
   const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
   if(!response||response.status()!==200) throw new Error(path+' HTTP '+response?.status());
   await fn();
   console.log('PASS',path);
 };
 try {
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
   });
   await test('/',async()=>{
     if(!(await page.title()).includes('OGBデータ研究所')) throw new Error('Wrong main homepage');
   });
   await test('/tools/csv-analyzer/',async()=>{
     await page.locator('#sample').click();
     if(!(await page.locator('body').innerText()).includes('平均')) throw new Error('CSV sample failed');
   });
   await test('/tools/pricing-simulator/',async()=>{
     await page.locator('#calculate').click();
     const body=await page.locator('body').innerText();
     if(!body.includes('販売価格')) throw new Error('Pricing output missing');
   });
   await test('/tools/',async()=>{
     await page.locator('#calc-profit').click();
     if(!(await page.locator('body').innerText()).includes('利益')) throw new Error('Profit calculator failed');
   });
   await test('/ogb-data/daily/',async()=>{});
   await test('/global-news/',async()=>{});
   await test('/class-promotion/',async()=>{});
 } catch(e) { errors.push(String(e)); }
 await browser.close();
 if(errors.length) {console.error(errors.join('\n')); process.exit(1);}
})().catch(e=>{console.error(e);process.exit(1)});
