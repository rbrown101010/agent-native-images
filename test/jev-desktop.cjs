const { _electron }=require('playwright');
const fs=require('node:fs/promises'), os=require('node:os'), path=require('node:path'), assert=require('node:assert/strict');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jev-ui-'));let app;
 try {
 app=await _electron.launch({args:[path.resolve(__dirname,'..'),'--test-mode',`--test-data=${root}`]});
 const page=await app.firstWindow(); await page.locator('#settings-dialog[open]').waitFor();await page.locator('#close-settings').click();
 await app.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('search');ipcMain.handle('search',()=>({value:[10,90,50].map((score,i)=>({key:`test-${i}`,sourceUrl:`https://example.com/${i}.png`,previewUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>',title:`Image ${score}`,width:512,height:512,score}))}));
   ipcMain.removeHandler('rank-image');ipcMain.handle('rank-image',async(_,{item})=>{await new Promise(r=>setTimeout(r,100+item.score));return {value:{score:item.score,model:'mock-test-only',scores:Object.fromEntries(['relevance','clarity','sticker'].map(k=>[k,{score:item.score,confidence:80}]))}}});
 });
 await page.locator('#settings-button').click();await page.locator('#jev-mode').check();await page.locator('#jev-overlay').check();await page.locator('#settings-form button[type=submit]').click();
 await page.locator('#search-input').fill('logo');await page.locator('#search-input').press('Enter');
 await page.locator('.image-card').first().waitFor();assert.equal(await page.locator('.image-title').first().textContent(),'Image 10');
 await page.waitForFunction(()=>document.querySelector('.image-title')?.textContent==='Image 90');
 assert.deepEqual(await page.locator('.image-title').allTextContents(),['Image 90','Image 50','Image 10']);
 assert.match(await page.locator('.jev-badge').first().textContent(),/Jev 90\/100/);
 await page.locator('#settings-button').click();await page.locator('#jev-mode').uncheck();await page.locator('#settings-form button[type=submit]').click();
 assert.deepEqual(await page.locator('.image-title').allTextContents(),['Image 10','Image 90','Image 50']);assert.equal(await page.locator('.jev-badge').count(),0);
 console.log('PASS: Jev mode, delayed progressive ranking, overlay, original-order restoration (mock provider).');
 }finally {if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
