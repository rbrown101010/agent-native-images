const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { normalizeImage } = require('../image-formats.cjs');

test('SVG becomes a sharp transparent PNG without changing aspect ratio', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect x="8" width="16" height="16" fill="#d97757"/></svg>');
  const result = await normalizeImage(svg);
  assert.equal(result.sourceFormat, 'svg');
  assert.equal(result.width, 1024); assert.equal(result.height, 512);
  const { data, info } = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0);
  assert.equal(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3], 255);
});

for (const format of ['png', 'jpeg', 'webp', 'avif', 'gif', 'tiff']) {
  test(`${format} converts to a usable PNG`, async () => {
    const source = await sharp({ create: { width: 30, height: 20, channels: 4, background: { r: 210, g: 110, b: 70, alpha: 0.5 } } }).toFormat(format, format === 'tiff' ? { compression: 'lzw' } : {}).toBuffer();
    const result = await normalizeImage(source);
    const output = await sharp(result.bytes).metadata();
    assert.equal(output.format, 'png'); assert.equal(output.width, 30); assert.equal(output.height, 20);
    if (['png', 'webp', 'avif', 'tiff'].includes(format)) assert.equal(output.hasAlpha, true);
  });
}

test('JPEG orientation is applied before copying or saving', async () => {
  const source = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#d97757' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await normalizeImage(source);
  assert.equal(result.width, 20); assert.equal(result.height, 30);
});

test('empty, webpage, corrupt, and oversized files produce useful errors', async () => {
  await assert.rejects(normalizeImage(Buffer.alloc(0)), /empty file/);
  await assert.rejects(normalizeImage(Buffer.from('<!DOCTYPE html><html>Blocked</html>')), /webpage/);
  await assert.rejects(normalizeImage(Buffer.from('not an image')), /damaged/);
  await assert.rejects(normalizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>')), /too large/);
});
