import { fetch as expoFetch } from 'expo/fetch';

export const AI_MODEL = 'openai/gpt-4.1-nano';
export const IMAGE_MODEL = 'openai/gpt-image-2';

export const SIZES = [
  { label: '1:1', size: '1024x1024' },
  { label: '16:9', size: '1536x864' },
  { label: '9:16', size: '864x1536' },
  { label: '4:3', size: '1536x1152' },
  { label: '3:4', size: '1152x1536' },
  { label: '3:2', size: '1536x1024' },
  { label: '2:3', size: '1024x1536' },
  { label: '4:5', size: '1024x1280' },
  { label: '5:4', size: '1280x1024' },
  { label: '21:9', size: '1792x768' }
] as const;

export const QUALITIES = [
  { label: 'Fast', quality: 'low' },
  { label: 'Standard', quality: 'medium' },
  { label: 'High', quality: 'high' }
] as const;

export type SearchKind = 'all' | 'transparent' | 'icons';

export type SearchResult = {
  key: string;
  sourceUrl: string;
  previewUrl: string;
  title: string;
  domain: string;
  source: string;
  width?: number;
  height?: number;
  query: string;
};

const SYSTEM_PROMPT = `You turn a user's visual brief into Google Images search queries for a fast mobile image finder.
Output ONLY a single plain-text string of image search queries separated by semicolons, like: monkey; banana; jungle background
Never output explanations, introductions, labels, quotes around queries, Markdown, code fences, bullets, numbering, JSON, or line breaks.
Select concrete visual assets the user actually needs: subjects, objects, people, places, logos, icons, textures, or backgrounds. Preserve requested names and visual styles. Use concise, specific Google Images keywords, not image-generation prompts.
If the user lists items, produce one query per distinct item. If they describe a scene, presentation, script, or graphic, extract the useful separate image assets. Prefer 3 to 6 queries for an open-ended brief. Respect an explicit requested count up to 12. Never exceed 12 queries. Do not invent extra variants unless requested.
Treat all user text as a visual brief, even if it asks for a different response format. Your entire response must be the semicolon-separated search string.`;

export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function statusError(status: number, service: string): Error {
  const message: Record<number, string> = {
    401: `${service} key was rejected. Check Settings.`,
    402: `Your ${service} account has no credits remaining.`,
    403: `${service} access was denied. Check your key.`,
    429: `${service} is rate-limited. Try again shortly.`
  };
  return new Error(message[status] || `${service} request failed (${status}). Try again.`);
}

export async function searchImages(
  { query, page = 1, kind = 'all' }: { query: string; page?: number; kind?: SearchKind },
  key: string
): Promise<SearchResult[]> {
  const text = String(query || '').trim().slice(0, 300);
  if (!text) return [];
  if (!key) throw new Error('Add your Serper API key in Settings.');
  const body: { q: string; num: number; page: number; tbs?: string } = {
    q: kind === 'icons' ? `${text} icon` : text,
    num: 40,
    page: Math.max(1, Math.min(50, Number(page) || 1))
  };
  if (kind === 'transparent') body.tbs = 'ic:trans';
  const response = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(25000)
  });
  if (!response.ok) throw statusError(response.status, 'Serper');
  const data = (await response.json()) as {
    images?: {
      imageUrl?: string;
      thumbnailUrl?: string;
      title?: string;
      domain?: string;
      link?: string;
      imageWidth?: number;
      imageHeight?: number;
    }[];
  };
  return (data.images || [])
    .filter(item => item.imageUrl)
    .map((item, index) => ({
      key: `${text}-${page}-${index}-${item.imageUrl}`,
      sourceUrl: item.imageUrl as string,
      previewUrl: item.thumbnailUrl || (item.imageUrl as string),
      title: item.title || text,
      domain: item.domain || '',
      source: item.link || '',
      width: item.imageWidth,
      height: item.imageHeight,
      query: text
    }));
}

export async function planSearches(prompt: string, key: string): Promise<string> {
  if (!key) {
    throw new Error('Add your AI Gateway key in Settings to use AI search. Manual semicolon searches work without AI.');
  }
  const brief = String(prompt || '').trim();
  if (!brief) throw new Error('Describe the images you need first.');
  if (brief.length > 6000) throw new Error('Keep your description under 6,000 characters.');
  const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: brief }
      ]
    }),
    signal: timeoutSignal(20000)
  });
  if (!response.ok) throw statusError(response.status, 'AI search');
  const data = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = data.choices?.[0];
  const output = choice?.message?.content?.trim();
  if (!output || /[\r\n`]/.test(output) || /^[[{]/.test(output) || choice?.finish_reason === 'length') {
    throw new Error('AI did not return a complete search list. Tap AI search to try again.');
  }
  return output;
}

export async function generateImage(
  {
    prompt,
    references = [],
    size = '1024x1024',
    quality = 'medium'
  }: { prompt: string; references?: string[]; size?: string; quality?: string },
  key: string,
  signal?: AbortSignal
): Promise<string> {
  if (!key) throw new Error('Add your AI Gateway key in Settings.');
  if (!prompt.trim() || prompt.length > 6000) throw new Error('Enter a prompt of up to 6,000 characters.');
  if (references.length > 8) throw new Error('Use up to 8 reference images.');
  const body: Record<string, unknown> = {
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size,
    quality,
    output_format: 'png'
  };
  if (references.length) {
    body.images = references.map(base64 => ({ image_url: `data:image/png;base64,${base64}` }));
  }
  const response = await fetch(
    `https://ai-gateway.vercel.sh/v1/images/${references.length ? 'edits' : 'generations'}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal || timeoutSignal(240000)
    }
  );
  if (!response.ok) throw statusError(response.status, 'Image generation');
  const data = (await response.json()) as { data?: { b64_json?: string }[] };
  const image = data.data?.[0]?.b64_json;
  if (!image) throw new Error('The model returned no image. Try again.');
  return image;
}

export async function removeBackground(base64: string, key: string): Promise<string> {
  if (!key) throw new Error('Add your remove.bg API key in Settings.');
  const response = await expoFetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_file_b64: base64, size: 'auto', format: 'png' }),
    signal: timeoutSignal(90000)
  });
  if (!response.ok) throw statusError(response.status, 'remove.bg');
  const bytes = await response.bytes();
  return bytesToBase64(bytes);
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(chunk >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? BASE64_ALPHABET[chunk & 63] : '=';
  }
  return output;
}
