const { normalizeImage } = require('./image-formats.cjs');

// Search previews can remain available even when an original URL serves HTML,
// blocks downloads, expires, or uses a format the decoder cannot read.
async function downloadImage(item, { publicURL, responseBytes, fetchOriginal, fetchPreview }) {
  const browserURLs = [...new Set([item.sourceUrl, item.previewUrl, item.thumbnailUrl].filter(Boolean))];
  const candidates = [
    ...(item.sourceUrl ? [{ candidate: item.sourceUrl, fetchImage: fetchOriginal }] : []),
    ...browserURLs.map(candidate => ({ candidate, fetchImage: fetchPreview })),
  ];
  let lastError;
  for (const { candidate, fetchImage } of candidates) {
    try {
      const url = publicURL(candidate);
      const usedPreview = candidate !== item.sourceUrl;
      const response = await fetchImage(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Image download failed (${response.status}).`); }
      // Inspect the bytes, not the extension or Content-Type (both can be wrong).
      const image = await normalizeImage(await responseBytes(response));
      return { image, downloadedFrom: url, usedPreview };
    } catch (error) { lastError = error; }
  }
  throw new Error('The original and preview could not be downloaded. Try refreshing this search.', { cause: lastError });
}

module.exports = { downloadImage };
