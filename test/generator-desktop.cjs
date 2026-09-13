const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const sharp = require('sharp');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'images-generator-'));
  const bytes = await sharp({ create: { width: 400, height: 300, channels: 4, background: '#b095d2' } }).png().toBuffer();
  const fixture = path.join(root, 'Purple reference.png'); await fs.writeFile(fixture, bytes);
  let app;
  try {
    app = await _electron.launch({ args: [path.resolve(__dirname, '..'), '--test-mode', `--test-data=${root}`] });
    const page = await app.firstWindow(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#settings-dialog[open]');
    await page.evaluate(() => window.images.configure({ gateway: 'test-gateway-key' }));
    await page.locator('#close-settings').click();
    await app.evaluate(({ ipcMain }, base64) => {
      globalThis.calls = []; globalThis.pending = [];
      globalThis.fetch = async (url, options) => {
        if (url.includes('ai-gateway.vercel.sh/v1/images/')) {
          globalThis.calls.push({ url, body: JSON.parse(options.body) });
          return new Promise(resolve => globalThis.pending.push((fail = false) => resolve(new Response(JSON.stringify(fail ? { error: { message: 'Test provider failure' } } : { data: [{ b64_json: base64 }] }), { status: fail ? 500 : 200 }))));
        }
        return new Response(Buffer.from(base64, 'base64'));
      };
      ipcMain.removeHandler('search'); ipcMain.handle('search', () => ({ value: [{ key: 'source', sourceUrl: 'https://example.com/search.png', previewUrl: `data:image/png;base64,${base64}`, title: 'Search reference', query: 'reference', width: 400, height: 300 }] }));
    }, bytes.toString('base64'));
    await page.locator('#search-input').fill('reference'); await page.locator('#search-input').press('Enter');
    await page.locator('.image-card').hover(); await page.getByRole('button', { name: 'Add to image generator', exact: true }).click();
    await page.locator('#generate-module').click(); await page.waitForSelector('.generation-tile.ready');
    const prompt = page.locator('#generation-prompt');
    await page.locator('#generation-size').selectOption('1536x864');
    await prompt.fill('first image'); await prompt.press('Enter');
    await page.waitForFunction(() => document.querySelector('.generation-tile.generating'));
    assert.equal(await prompt.inputValue(), 'first image');
    await prompt.fill('second image'); await prompt.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.generation-tile.generating').length === 2);
    assert.deepEqual((await page.locator('.generation-caption').allTextContents()).slice(0, 2), ['second image', 'first image']);
    await app.evaluate(() => globalThis.pending[1]());
    await page.waitForFunction(() => document.querySelector('.generation-tile')?.classList.contains('ready'));
    await app.evaluate(() => globalThis.pending[0]());
    await page.waitForFunction(() => document.querySelectorAll('.generation-tile.ready').length === 3);
    assert.deepEqual(await page.locator('.generation-image').evaluateAll(nodes => nodes.slice(0, 2).map(node => node.getAttribute('aria-label'))), ['Preview second image', 'Preview first image']);
    await page.locator('.generation-image').first().dragTo(page.locator('#generation-prompt'));
    assert.equal(await page.locator('.reference-chip').count(), 1);
    await page.locator('#reference-file').setInputFiles(fixture);
    await page.waitForFunction(() => document.querySelectorAll('.reference-chip').length === 2);
    await page.locator('.generation-tile.ready').first().hover(); await page.locator('.generation-tile.ready').first().getByRole('button', { name: 'Save image', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('saved to Downloads'));
    assert.equal((await fs.readdir(path.join(root, 'Downloads'))).filter(name => name.endsWith('.png')).length, 1);
    await prompt.fill('Use @Purple'); await page.waitForSelector('.mention-option'); await prompt.press('Enter');
    assert.equal(await prompt.inputValue(), 'Use '); assert.equal(await page.locator('#mention-menu').isVisible(), false);
    await prompt.press('Enter'); await page.waitForFunction(() => document.querySelector('.generation-tile.generating'));
    assert.equal(await page.locator('.reference-chip').count(), 2); assert.equal(await prompt.inputValue(), 'Use ');
    const calls = await app.evaluate(() => globalThis.calls);
    assert.equal(calls[0].body.size, '1536x864');
    assert.match(calls[2].url, /images\/edits$/); assert.equal(calls[2].body.images.length, 2);
    await app.evaluate(() => globalThis.pending[2](true)); await page.waitForSelector('.generation-tile.error');
    await page.locator('.generation-tile.error').getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.generation-tile.generating'));
    await app.evaluate(() => globalThis.pending[3]()); await page.waitForFunction(() => document.querySelectorAll('.generation-tile.ready').length === 5);
    await page.locator('.generation-image').first().click(); await page.waitForSelector('#preview-dialog[open]'); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#preview-position').innerText(), '2 / 5'); await page.locator('#close-preview').click();
    await page.locator('#clear-generation').click(); assert.equal(await prompt.inputValue(), ''); assert.equal(await page.locator('.reference-chip').count(), 0);
    await prompt.fill('repeat this image'); await prompt.press('Enter'); await prompt.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.generation-tile.generating').length === 2);
    assert.equal(await prompt.inputValue(), 'repeat this image');
    await prompt.press('Meta+Backspace'); assert.equal(await prompt.inputValue(), '');
    await app.evaluate(() => { globalThis.pending[4](); globalThis.pending[5](); });
    await page.waitForFunction(() => document.querySelectorAll('.generation-tile.ready').length === 7);
    await page.screenshot({ path: 'test-artifacts/generator-desktop.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(600, 420));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.generation-tile').evaluateAll(nodes => nodes[2].getBoundingClientRect().top >= nodes[0].getBoundingClientRect().bottom), true);
    await page.screenshot({ path: 'test-artifacts/generator-small.png' });
    await page.locator('#search-module').click(); assert.equal(await page.locator('#search-input').inputValue(), 'reference');
    assert.deepEqual(errors, []);
    const listBefore = await page.evaluate(() => window.images.generations());
    await app.close();
    app = await _electron.launch({ args: [path.resolve(__dirname, '..'), '--test-mode', `--test-data=${root}`] });
    const reopened = await app.firstWindow(); await reopened.waitForSelector('#settings-dialog[open]'); await reopened.locator('#close-settings').click(); await reopened.locator('#generate-module').click();
    await reopened.waitForFunction(() => document.querySelectorAll('.generation-tile.ready').length === 7);
    assert.deepEqual((await reopened.evaluate(() => window.images.generations())).map(job => job.id), listBefore.map(job => job.id));
    console.log('PASS: search import, parallel jobs, stable order, drag/upload references, saved mentions, Gateway edit payload, retry, Downloads, preview, responsive layout and restart.');
  } finally { if (app) await app.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
