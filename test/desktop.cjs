// Explicit live integration check. Supply a private credentials JSON outside the repo.
// Set TEST_REMOVE_BG=1 only when you intend to consume a remove.bg credit.
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  if (!process.env.IMAGES_CREDENTIALS_FILE) throw new Error('Set IMAGES_CREDENTIALS_FILE to a private JSON file with serper and removebg keys. This test uses live API credits.');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-images-test-'));
  const credentials = path.join(root, 'setup.json');
  await fs.copyFile(process.env.IMAGES_CREDENTIALS_FILE, credentials); await fs.chmod(credentials, 0o600);
  const app = await electron.launch({ args: [path.resolve(__dirname, '..'), '--test-mode', `--test-data=${root}`, '--credentials-file', credentials] });
  const errors = [];
  try {
    const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#search-input');
    await page.locator('#search-input').fill('monkey'); await page.locator('#search-form').evaluate(form => form.requestSubmit());
    await page.locator('#new-tab').click();
    await page.locator('#search-input').fill('chrome icon'); await page.locator('#search-form').evaluate(form => form.requestSubmit());
    assert.equal(await page.locator('#tabs .tab').count(), 2);
    await page.locator('#tabs .tab-main').first().click();
    await page.waitForSelector('.image-card', { timeout: 35000 });
    assert.equal(await page.locator('#search-input').inputValue(), 'monkey');
    const geometry = await page.locator('.image-card img').first().evaluate(img => ({ fit: getComputedStyle(img).objectFit })); assert.equal(geometry.fit, 'contain');
    const inputs = await page.evaluate(() => [...document.querySelectorAll('.image-card')].slice(0, 8).map(card => Number(card.dataset.index)));
    let chosen;
    for (const index of inputs) {
      try {
        chosen = await page.evaluate(async index => {
          const item = tabs[0].items[index];
          const result = await window.images.action({ type: 'copy', item, query: 'monkey' });
          return { item, result };
        }, index);
        break;
      } catch (error) { console.log('Image candidate unavailable:', error.message.slice(0, 240)); }
    }
    assert.ok(chosen, 'At least one original image must download and copy');
    assert.equal(chosen.result.name, 'Monkey (1)');
    const clipboardSize = await app.evaluate(async ({ clipboard, nativeImage }) => {
      const items = await clipboard.read();
      const image = items.find(item => item.types.includes('image/png'));
      const blob = await image.getType('image/png');
      return nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).getSize();
    }); assert.ok(clipboardSize.width > 0);
    const downloaded = await page.evaluate(item => window.images.action({ type: 'save', item, query: 'monkey' }), chosen.item);
    assert.equal(downloaded.name, 'Monkey (1)');
    const png = await fs.readFile(downloaded.downloadPath); assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(downloaded.downloadPath.startsWith(path.join(root, 'Downloads')));
    if (process.env.TEST_REMOVE_BG === '1') {
      const cutout = await page.evaluate(item => window.images.action({ type: 'removebg', item, query: 'monkey' }), chosen.item);
      assert.equal(cutout.cutout, true);
      const cutoutSaved = await page.evaluate(item => window.images.action({ type: 'save', item, query: 'monkey' }), cutout);
      assert.equal(cutoutSaved.name, 'Monkey (2)');
      console.log('LIVE remove.bg passed:', cutout.width, 'x', cutout.height);
    }
    await page.locator('#saved-tab').click(); await page.waitForSelector('.image-card');
    assert.ok((await page.locator('.image-title').allTextContents()).includes('Monkey (1)'));
    await page.locator('#tabs .tab-main').nth(1).click(); await page.waitForSelector('.image-card', { timeout: 35000 });
    assert.equal(await page.locator('#search-input').inputValue(), 'chrome icon');
    await fs.mkdir(path.resolve(__dirname, '../test-artifacts'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../test-artifacts/search.png') });
    await page.locator('#saved-tab').click(); await page.screenshot({ path: path.resolve(__dirname, '../test-artifacts/saved.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.reload());
    await page.waitForSelector('#search-input'); await page.locator('#saved-tab').click(); await page.waitForSelector('.image-card');
    assert.ok((await page.locator('.image-title').allTextContents()).includes('Monkey (1)'));
    assert.deepEqual(errors, []);
    console.log('PASS: parallel live searches, uncropped grid, native clipboard, Downloads PNG, numbered names, deduplication, saved library, reload persistence.');
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
