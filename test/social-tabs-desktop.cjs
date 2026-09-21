const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'social-tabs-'));
  const app = await _electron.launch({ args: [process.cwd(), '--test-mode', '--test-data=' + root] });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#settings-dialog[open]'); await page.locator('#close-settings').click();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await app.evaluate(({ ipcMain }) => {
      globalThis.pendingSocial = [];
      ipcMain.removeHandler('search-tweets');
      ipcMain.handle('search-tweets', (_e, value) => new Promise(resolve => globalThis.pendingSocial.push({ value, resolve })));
      ipcMain.removeHandler('plan-tweets');
      ipcMain.handle('plan-tweets', (_e, value) => new Promise(resolve => { globalThis.pendingPlan = { value, resolve }; }));
    });
    await page.locator('#twitter-module').click();
    await page.keyboard.press('Meta+t');
    await page.waitForFunction(() => document.querySelectorAll('#tweet-tabs [role=tab]').length === 2);
    await page.locator('#tweet-filter-button').click(); await page.locator('[data-media=videos]').click(); await page.locator('#tweet-filter-button').click();
    await page.locator('#tweet-input').fill('cats'); await page.locator('#tweet-input').press('Enter');
    await page.locator('#new-tweet-tab').click();
    await page.locator('#tweet-filter-button').click(); await page.locator('[data-media=images]').click(); await page.locator('#tweet-filter-button').click();
    await page.locator('#tweet-input').fill('dogs'); await page.locator('#tweet-input').press('Enter');
    const requests = await app.evaluate(() => globalThis.pendingSocial.map(x => x.value.query));
    assert.deepEqual(requests, ['cats filter:videos', 'dogs filter:images']);
    const complete = async index => app.evaluate((_e, i) => {
      const job = globalThis.pendingSocial[i];
      job.resolve({ value: { query: job.value.query, tweets: [{ id: String(i), name: job.value.query, handle: 'tester', text: job.value.query, media: [], likes: 20, createdAt: '2026-09-21T12:00:00Z' }], hasMore: false } });
    }, index);
    await complete(1);
    await page.waitForFunction(() => document.querySelector('.tweet-text')?.textContent === 'dogs filter:images');
    await page.getByRole('tab', { name: 'cats filter:videos', exact: true }).click();
    assert.match(await page.locator('#tweet-count').innerText(), /Searching/);
    await complete(0);
    await page.waitForFunction(() => document.querySelector('.tweet-text')?.textContent === 'cats filter:videos');
    await page.locator('#tweet-input').fill('cats, viral'); await page.keyboard.press('Meta+Enter');
    await page.waitForFunction(() => document.querySelector('#tweet-ai-button').disabled);
    assert.equal((await app.evaluate(() => globalThis.pendingPlan.value)).filters.media, 'videos');
    await page.locator('#new-tweet-tab').click();
    await app.evaluate(() => globalThis.pendingPlan.resolve({ value: 'cats min_faves:1000 filter:videos' }));
    await page.waitForFunction(() => document.querySelector('#tweet-input').value === '');
    assert.equal(await page.locator('#tweet-input').inputValue(), '');
    await page.locator('#tweet-input').fill('robot filter:videos; landscape filter:images'); await page.locator('#tweet-input').press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#tweet-tabs [role=tab]').length === 5);
    assert.deepEqual((await app.evaluate(() => globalThis.pendingSocial.map(x => x.value.query))).slice(-2), ['robot filter:videos', 'landscape filter:images']);
    await page.keyboard.press('Meta+w');
    await page.waitForFunction(() => document.querySelectorAll('#tweet-tabs [role=tab]').length === 4);
    assert.deepEqual(errors, []);
    console.log('PASS: independent concurrent social tabs, Cmd+T/W, per-tab media filters, AI filter context, inactive AI completion, semicolon batches.');
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
