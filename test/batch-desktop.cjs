const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'images-batch-'));
  const app = await _electron.launch({ args: [path.resolve(__dirname, '..'), '--test-mode', `--test-data=${root}`] });
  try {
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#settings-dialog[open]'); await page.locator('#close-settings').click();
    assert.equal((await page.locator('#content').innerText()).trim(), 'search for image');
    assert.equal((await page.locator('#saved-tab').innerText()).trim(), '');
    assert.equal((await page.locator('#filters').innerText()).trim(), '');
    await app.evaluate(({ ipcMain }) => {
      globalThis.searchCalls = []; globalThis.plannerCalls = 0;
      ipcMain.removeHandler('search');
      ipcMain.handle('search', async (_event, input) => {
        globalThis.searchCalls.push(input.query);
        await new Promise(resolve => setTimeout(resolve, 200));
        return { value: [{ key: input.query, title: input.query, sourceUrl: 'https://example.com/image.png', previewUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAlkAAAAASUVORK5CYII=', width: 100, height: 200, domain: 'example.com' }] };
      });
      ipcMain.removeHandler('plan-searches');
      ipcMain.handle('plan-searches', async () => { globalThis.plannerCalls++; await new Promise(resolve => setTimeout(resolve, 450)); return { value: 'fox; forest; moon' }; });
    });
    await page.locator('#search-input').fill('monkey; banana;; jungle; monkey');
    await page.locator('#search-input').press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#tabs .tab').length === 3);
    assert.deepEqual(await app.evaluate(() => globalThis.searchCalls), ['monkey', 'banana', 'jungle']);
    assert.equal(await app.evaluate(() => globalThis.plannerCalls), 0);
    await page.waitForSelector('.image-card');
    const card = await page.locator('.image-card').first().evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return { background: getComputedStyle(node).backgroundColor, contains: ['.image-stage', '.image-info', '.card-actions'].every(sel => { const child = node.querySelector(sel).getBoundingClientRect(); return child.top >= bounds.top && child.bottom <= bounds.bottom; }), fit: getComputedStyle(node.querySelector('img')).objectFit };
    });
    assert.equal(card.contains, true); assert.equal(card.fit, 'contain'); assert.equal(card.background, 'rgb(31, 31, 31)');
    await page.locator('#new-tab').click(); await page.locator('#search-input').fill('assets for a woodland story'); await page.locator('#search-input').press('Meta+Enter');
    await page.locator('#new-tab').click(); await page.locator('#search-input').fill('keep this draft');
    await page.waitForFunction(() => document.querySelectorAll('#tabs .tab').length === 7);
    assert.equal(await page.locator('#search-input').inputValue(), 'keep this draft');
    assert.equal(await app.evaluate(() => globalThis.plannerCalls), 1);
    assert.deepEqual((await app.evaluate(() => globalThis.searchCalls)).slice(3), ['fox', 'forest', 'moon']);
    // Editing the prompt cancels the pending expansion instead of replacing new input.
    await page.locator('#ai-search-button').click(); await page.locator('#search-input').fill('edited draft');
    await page.waitForTimeout(650); assert.equal(await page.locator('#tabs .tab').count(), 7);
    assert.equal(await page.locator('#search-input').inputValue(), 'edited draft');
    // Closing a planning tab also cancels its result.
    await page.locator('#ai-search-button').click(); await page.locator('#tabs .tab.active .close-tab').click();
    await page.waitForTimeout(650); assert.equal(await page.locator('#tabs .tab').count(), 6);
    // Preview navigation stays in the current result order and respects boundaries.
    await page.evaluate(() => {
      const tab = current();
      const base = tab.items[0];
      tab.items = [1, 2, 3].map(n => ({ ...base, key: `preview-${n}`, title: `Preview ${n}`, sourceUrl: base.previewUrl }));
      renderContent();
    });
    await page.locator('.image-stage').first().click();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#preview-title').innerText(), 'Preview 1');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#preview-title').innerText(), 'Preview 2');
    await page.locator('#next-image').click();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#preview-title').innerText(), 'Preview 3');
    assert.equal(await page.locator('#next-image').isDisabled(), true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#preview-position').innerText(), '2 / 3');
    await page.locator('#close-preview').click();
    await page.evaluate(() => {
      const base = current().items[0];
      saved = [{ ...base, id: 'a', name: 'Match one' }, { ...base, id: 'b', name: 'Skip' }, { ...base, id: 'c', name: 'Match two' }];
      savedQuery = 'Match'; selectTab('saved');
    });
    await page.locator('.image-stage').first().click();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#preview-title').innerText(), 'Match two');
    assert.equal(await page.locator('#preview-position').innerText(), '2 / 2');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('PASS: parallel Enter batches, deduplication, contained cards, AI button, background completion, edit/close cancellation.');
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
