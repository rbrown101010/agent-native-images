// Live source download, with isolated library/Downloads. No paid API calls.
const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'images-format-check-'));
  const executablePath = process.env.IMAGES_EXECUTABLE;
  const app = await _electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [path.resolve(__dirname, '..')]), '--test-mode', `--test-data=${root}`] });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#search-input');
    console.log('Desktop ready; downloading original SVG.');
    const source = { sourceUrl: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/anthropic.svg', title: 'Anthropic Icon & Logo', domain: 'dashboardicons.com' };
    const copied = await page.evaluate(item => window.images.action({ type: 'copy', item, query: 'Anthropic' }), source);
    console.log('SVG copied; checking clipboard.');
    assert.equal(copied.sourceFormat, 'svg'); assert.equal(copied.width, 1024); assert.equal(copied.height, 1024);
    const clipboardBytes = await app.evaluate(async ({ clipboard }) => {
      const items = await clipboard.read(); const image = items.find(item => item.types.includes('image/png'));
      const blob = await image.getType('image/png'); return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    assert.equal(Buffer.from(clipboardBytes).subarray(1, 4).toString(), 'PNG');
    console.log('Clipboard verified; checking download.');
    const saved = await page.evaluate(item => window.images.action({ type: 'save', item, query: 'Anthropic' }), source);
    assert.equal(saved.name, 'Anthropic (1)'); assert.equal(saved.id, copied.id);
    assert.ok(saved.downloadPath.startsWith(path.join(root, 'Downloads')));
    const downloaded = await fs.readFile(saved.downloadPath);
    assert.equal(downloaded.subarray(1, 4).toString(), 'PNG');
    const metadata = await require('sharp')(downloaded).metadata();
    assert.equal(metadata.width, 1024); assert.equal(metadata.height, 1024); assert.equal(metadata.hasAlpha, true);
    const library = await page.evaluate(() => window.images.library()); assert.equal(library.length, 1);
    console.log('PASS: original Dashboard Icons SVG copied as 1024px PNG, saved to Downloads, and retained in library.');
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
