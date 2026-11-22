'use strict';
const {chromium}=require('playwright');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true});
  const url=pathToFileURL(path.join(__dirname,'../tools/marketplace-profit-compare/index.html')).href;
  await page.goto(url);
  assert.match(await page.locator('#summary').innerText(),/850円/);
  assert.match(await page.locator('#summary').innerText(),/851円/);
  await page.locator('#mp').fill('5000');
  assert.equal(await page.locator('#export').isDisabled(),true,'stale results must not export');
  await page.locator('#calc').click();
  assert.match(await page.locator('#summary').innerText(),/2,150円/);
  assert.equal(await page.locator('#export').isDisabled(),false);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#export').click();
  const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/\.csv$/);
  await page.locator('#mf').fill('101');
  await page.locator('#calc').click();
  assert.equal(await page.locator('#export').isDisabled(),true);
  assert.match(await page.locator('#status').innerText(),/入力値を確認/);
  await page.locator('#mf').fill('10');
  await page.locator('#calc').click();
  assert.equal(await page.locator('#rows tr').count(),7);
  console.log('PASS marketplace browser: initial results, recalculation, stale export, CSV download, invalid rate, recovery');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
