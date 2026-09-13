const IMAGE_MODEL = 'openai/gpt-image-2';
const SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', '1536x864', '864x1536', '1536x1152', '1152x1536', '1024x1280', '1280x1024', '1792x768']);
const QUALITIES = new Set(['low', 'medium', 'high']);

async function generateImage({ prompt, references = [], size = '1024x1024', quality = 'medium' }, { key, model = IMAGE_MODEL, fetchImpl = fetch, signal } = {}) {
  if (!key) throw new Error('Add your AI Gateway key in Settings → API Settings.');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 6000) throw new Error('Enter a prompt of up to 6,000 characters.');
  if (!SIZES.has(size) || !QUALITIES.has(quality)) throw new Error('Choose a supported size and quality.');
  if (!Array.isArray(references) || references.length > 8) throw new Error('Use up to 8 reference images.');
  const body = { model, prompt, n: 1, size, quality, output_format: 'png' };
  if (references.length) body.images = references.map(bytes => ({ image_url: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}` }));
  const response = await fetchImpl(`https://ai-gateway.vercel.sh/v1/images/${references.length ? 'edits' : 'generations'}`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal || AbortSignal.timeout(240000),
  });
  if (!response.ok) {
    let data = {}; try { data = await response.json(); } catch {}
    const friendly = { 401: 'Gateway key rejected. Check API Settings.', 402: 'Your Gateway has no credits remaining.', 403: 'This model is not available to your Gateway key.', 429: 'Generation rate limit reached. Retry shortly.' };
    const message = data.error?.message || data.message;
    throw new Error(friendly[response.status] || (typeof message === 'string' ? message.replaceAll(key, '[redacted]').slice(0, 300) : `Image generation failed (${response.status}).`));
  }
  const data = await response.json();
  const encoded = data.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded || encoded.length > 48 * 1024 * 1024) throw new Error('The model returned no usable image. Try again.');
  return Buffer.from(encoded, 'base64');
}
module.exports = { generateImage, IMAGE_MODEL, SIZES, QUALITIES };
