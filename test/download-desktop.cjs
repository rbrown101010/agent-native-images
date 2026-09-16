// Isolated clipboard/download regression; no paid APIs or user library changes.
const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const sharp = require('sharp');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'images-download-check-'));
  const executablePath = process.env.IMAGES_EXECUTABLE;
  const app = await _electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [path.resolve(__dirname, '..')]), '--test-mode', `--test-data=${root}`] });
  try {
    const bytes = await sharp({ create: { width: 80, height: 50, channels: 4, background: { r: 215, g: 119, b: 87, alpha: 0.5 } } }).webp({ lossless: true }).toBuffer();
    await app.evaluate(({ session }, base64) => {
      globalThis.originalRequests = 0;
      globalThis.fetch = async () => {
        globalThis.originalRequests++;
        return new Response('<!doctype html><html>Image hosting page</html>');
      };
      session.defaultSession.protocol.handle('https', request => request.url.includes('host.example')
        ? new Response('<html>Image hosting page</html>')
        : new Response(Buffer.from(base64, 'base64'), { headers: { 'Content-Type': 'image/webp' } }));
    }, bytes.toString('base64'));
    const page = await app.firstWindow();
    await page.waitForSelector('#search-input');
    const item = { sourceUrl: 'https://host.example/original.webp', previewUrl: 'https://preview.example/image.webp', title: 'Visible preview', query: 'Test image' };
    const [copied, saved] = await page.evaluate(item => Promise.all([
      window.images.action({ type: 'copy', item, query: item.query }),
      window.images.action({ type: 'save', item, query: item.query }),
    ]), item);
    assert.equal(copied.id, saved.id);
    assert.equal(copied.sourceUrl, item.sourceUrl);
    assert.equal(copied.usedPreview, true);
    assert.equal(copied.width, 80); assert.equal(copied.height, 50);
    assert.equal(await app.evaluate(() => globalThis.originalRequests), 1);
    const clipboardBytes = await app.evaluate(async ({ clipboard }) => {
      const items = await clipboard.read();
      const blob = await items.find(item => item.types.includes('image/png')).getType('image/png');
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const output = Buffer.from(clipboardBytes);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 80); assert.equal(metadata.height, 50);
    const pixels = await sharp(output).ensureAlpha().raw().toBuffer();
    assert.ok(Math.abs(pixels[0] - 215) <= 2); assert.ok(Math.abs(pixels[3] - 128) <= 1);
    assert.ok(saved.downloadPath.startsWith(path.join(root, 'Downloads')));
    assert.equal((await sharp(await fs.readFile(saved.downloadPath)).metadata()).format, 'png');
    assert.equal((await page.evaluate(() => window.images.library())).length, 1);
    const imported = await page.evaluate(item => window.images.importGeneration({ item }), item);
    assert.ok(imported);
    // Already saved fallback copies without re-fetching either remote URL.
    await page.evaluate(item => window.images.action({ type: 'copy', item }), copied);
    assert.equal(await app.evaluate(() => globalThis.originalRequests), 1);
    console.log('PASS: HTML original falls back to WebP preview; PNG clipboard pixels/alpha, Downloads, Saved, generator import, concurrent deduplication, and cached re-copy verified.');
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
