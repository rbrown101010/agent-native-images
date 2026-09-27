const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { makeSticker } = require('../sticker.cjs');

test('sticker preserves artwork, adds white outline and leaves outer padding transparent', async () => {
  const input = await sharp({ create: { width: 30, height: 30, channels: 4, background: '#ff0000' } }).png().toBuffer();
  const { data, info } = await sharp(await makeSticker(input)).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x,y) => [...data.subarray((y*info.width+x)*4, (y*info.width+x)*4+4)];
  assert.equal(info.width, 42);
  assert.deepEqual(pixel(21,21), [255,0,0,255]);
  assert.deepEqual(pixel(4,21), [255,255,255,255]);
  assert.equal(pixel(0,0)[3], 0);
});

test('empty transparent cutout does not become a white rectangle', async () => {
  const input = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#00000000' } }).png().toBuffer();
  const { data } = await sharp(await makeSticker(input)).raw().toBuffer({ resolveWithObject: true });
  for (let i=3;i<data.length;i+=4) assert.equal(data[i], 0);
});
