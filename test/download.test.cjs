const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { downloadImage } = require('../image-download.cjs');

const item = { sourceUrl: 'https://original.example/image', previewUrl: 'https://preview.example/image', thumbnailUrl: 'https://thumb.example/image' };
const image = format => sharp({ create: { width: 48, height: 32, channels: 4, background: '#d97757' } }).toFormat(format).toBuffer();
function setup(responses) {
  const calls = [];
  const fetch = async url => {
    calls.push(url);
    const response = responses[url];
    if (response instanceof Error) throw response;
    return response();
  };
  return { calls, options: {
    publicURL: url => { if (!url.startsWith('https://')) throw new Error('Invalid URL'); return url; },
    responseBytes: async response => Buffer.from(await response.arrayBuffer()),
    fetchOriginal: fetch, fetchPreview: fetch,
  } };
}

test('prefers the full original and converts bytes despite misleading content type', async () => {
  const bytes = await image('webp');
  const { calls, options } = setup({ [item.sourceUrl]: () => new Response(bytes, { headers: { 'Content-Type': 'text/html' } }) });
  const result = await downloadImage(item, options);
  assert.deepEqual(calls, [item.sourceUrl]);
  assert.equal(result.usedPreview, false);
  assert.equal((await sharp(result.image.bytes).metadata()).format, 'png');
});

for (const [name, failed] of Object.entries({
  webpage: () => new Response('<!doctype html><html>Sign in</html>'),
  forbidden: () => new Response('Forbidden', { status: 403 }),
  corrupt: () => new Response('not an image'),
  timeout: new DOMException('Timed out', 'TimeoutError'),
})) {
  test(`${name} original falls back to the displayed preview`, async () => {
    const bytes = await image('jpeg');
    const { calls, options } = setup({ [item.sourceUrl]: failed, [item.previewUrl]: () => new Response(bytes) });
    const result = await downloadImage(item, options);
    assert.deepEqual(calls, [item.sourceUrl, item.sourceUrl, item.previewUrl]);
    assert.equal(result.usedPreview, true);
    assert.equal(result.downloadedFrom, item.previewUrl);
    assert.equal(result.image.width, 48); assert.equal(result.image.height, 32);
    assert.equal((await sharp(result.image.bytes).metadata()).format, 'png');
  });
}

test('tries the thumbnail after a broken preview and skips duplicate URLs', async () => {
  const bytes = await image('png');
  const { calls, options } = setup({ [item.sourceUrl]: () => new Response('<html>blocked</html>'), [item.thumbnailUrl]: () => new Response(bytes) });
  const result = await downloadImage({ ...item, previewUrl: item.sourceUrl }, options);
  assert.deepEqual(calls, [item.sourceUrl, item.sourceUrl, item.thumbnailUrl]);
  assert.equal(result.downloadedFrom, item.thumbnailUrl);
});

test('all failed sources produce an actionable error', async () => {
  const { options } = setup(Object.fromEntries(Object.values(item).map(url => [url, () => new Response('<html>blocked</html>')])));
  await assert.rejects(downloadImage(item, options), /original and preview.*refreshing/);
});

test('recovers the original from the browser session before using a smaller preview', async () => {
  const bytes = await image('png');
  const { options } = setup({ [item.sourceUrl]: () => new Response('<html>blocked</html>') });
  options.fetchPreview = async url => {
    assert.equal(url, item.sourceUrl);
    return new Response(bytes);
  };
  const result = await downloadImage(item, options);
  assert.equal(result.usedPreview, false);
  assert.equal(result.downloadedFrom, item.sourceUrl);
});
