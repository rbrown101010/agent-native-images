const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'images-reuse-'));
  const app = await _electron.launch({ args: [path.resolve(__dirname, '..'), '--test-mode', `--test-data=${root}`] });
  try {
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#settings-dialog[open]'); await page.locator('#close-settings').click();
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      const previewUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAlkAAAAASUVORK5CYII=';
      globalThis.entries = [
        { id: 'monkey-1', name: 'Monkey (1)', query: 'monkey', title: 'Jungle portrait' },
        { id: 'monkey-2', name: 'Monkey (2)', query: 'monkey', title: 'Animal illustration' },
        { id: 'banana-1', name: 'Banana (1)', query: 'banana', title: 'Yellow fruit' },
      ].map(item => ({ ...item, previewUrl, sourceUrl: `https://example.com/${item.id}.png`, width: 100, height: 200 }));
      ipcMain.removeHandler('library'); ipcMain.handle('library', () => ({ value: globalThis.entries }));
      globalThis.searchCalls = []; globalThis.actions = [];
      ipcMain.removeHandler('search'); ipcMain.handle('search', (_e, input) => {
        globalThis.searchCalls.push(input);
        return new Promise(resolve => { globalThis.finishSearch = () => resolve({ value: [{ key: 'web', title: 'Web result', sourceUrl: previewUrl }] }); });
      });
      ipcMain.removeHandler('action'); ipcMain.handle('action', (_e, input) => { globalThis.actions.push(input); return { value: input.item }; });
      BrowserWindow.getAllWindows()[0].webContents.send('library-changed');
    });
    await page.waitForFunction(() => document.querySelector('#saved-tab').title.includes('(3)'));
    const input = page.locator('#search-input');
    await input.fill('MONK'); assert.equal(await page.locator('.image-card').count(), 2);
    assert.equal(await page.locator('#result-count').innerText(), '2 saved');
    assert.equal((await app.evaluate(() => globalThis.searchCalls)).length, 0);
    await page.locator('.image-stage').first().click();
    assert.equal(await page.locator('#preview-position').innerText(), '1 / 2');
    await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#preview-title').innerText(), 'Monkey (2)');
    await page.locator('#close-preview').click();
    await input.fill('portrait jungle'); assert.equal(await page.locator('.image-card').count(), 1);
    await input.fill('no matching image'); assert.equal(await page.locator('#content').innerText(), 'search for image');
    await input.fill(''); assert.equal(await page.locator('#content').innerText(), 'search for image');
    await input.fill('web query'); await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('.skeleton'));
    await input.fill('monkey'); assert.equal(await page.locator('.image-card').count(), 2);
    await app.evaluate(() => globalThis.finishSearch());
    await page.waitForFunction(() => !document.querySelector('#tabs .spinner'));
    assert.deepEqual(await page.locator('.image-title').allTextContents(), ['Monkey (1)', 'Monkey (2)']);
    await page.locator('.image-card').first().hover();
    await page.locator('.image-card').first().getByRole('button', { name: 'Copy', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('copied'));
    const action = (await app.evaluate(() => globalThis.actions))[0];
    assert.equal(action.item.id, 'monkey-1'); assert.equal(action.query, 'monkey');
    await input.press('Enter'); await page.waitForFunction(() => document.querySelector('.skeleton'));
    await app.evaluate(() => globalThis.finishSearch());
    await page.waitForFunction(() => document.querySelector('.image-title')?.textContent === 'Web result');
    await input.fill('banana'); assert.equal(await page.locator('.image-title').innerText(), 'Banana (1)');
    await page.locator('#new-tab').click(); await page.locator('#tabs .tab-main').first().click();
    assert.equal(await input.inputValue(), 'banana'); assert.equal(await page.locator('.image-title').innerText(), 'Banana (1)');
    await page.screenshot({ path: 'test-artifacts/reuse-saved-search.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: instant saved matching, empty state, preview navigation, original naming, background completion, Enter search, tab restore.');
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
