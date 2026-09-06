const sharp = require('sharp');

const MAX_PIXELS = 40_000_000;
const inputOptions = { limitInputPixels: MAX_PIXELS, failOn: 'error', pages: 1 };

async function normalizeImage(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('The image host returned an empty file. Try another result.');
  const header = bytes.subarray(0, 1024).toString('utf8').trimStart();
  if (/^(?:<!doctype\s+html|<html\b)/i.test(header)) throw new Error('The image host returned a webpage instead of an image. Try another result.');
  try {
    const metadata = await sharp(bytes, inputOptions).metadata();
    let pipeline;
    if (metadata.format === 'svg') {
      // Render vectors sharply for graphics, retaining their original aspect ratio.
      const edge = Math.max(metadata.width || 1, metadata.height || 1);
      const target = Math.min(4096, Math.max(1024, edge));
      const density = Math.min(100000, Math.max(1, 72 * target / edge));
      pipeline = sharp(bytes, { ...inputOptions, density }).resize({ width: target, height: target, fit: 'inside' });
    } else {
      // Animated inputs intentionally become their first frame, matching PNG exports.
      pipeline = sharp(bytes, inputOptions).rotate();
    }
    const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height, sourceFormat: metadata.format };
  } catch (error) {
    if (/pixel limit|exceeds.*limit|too large/i.test(error.message)) throw new Error('This image is too large to process (maximum 40 megapixels).');
    throw new Error('This image is damaged or uses an unsupported format. Try another result.');
  }
}

module.exports = { normalizeImage };
