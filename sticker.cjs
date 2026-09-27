const sharp = require('sharp');

// Grow only the alpha silhouette, then place the untouched artwork over white.
async function makeSticker(bytes) {
  const source = await sharp(bytes).ensureAlpha().png().toBuffer();
  const meta = await sharp(source).metadata();
  const border = Math.max(3, Math.min(24, Math.round(Math.min(meta.width, meta.height) * 0.012)));
  const padding = border + 3;
  const padded = await sharp(source).extend({ top: padding, bottom: padding, left: padding, right: padding, background: '#00000000' }).png().toBuffer();
  const width = meta.width + padding * 2;
  const height = meta.height + padding * 2;
  const mask = await sharp(padded).extractChannel('alpha').toColourspace('b-w').png().toBuffer();
  const alpha = await sharp(mask).erode(border).blur(0.5).toColourspace('b-w').raw().toBuffer();
  const backing = await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return sharp(backing).composite([{ input: padded }]).png().toBuffer();
}

module.exports = { makeSticker };
