const fs = require('node:fs/promises');
const path = require('node:path');
const { parseTwitterQuery, matchesKeywords, applyTwitterFilters } = require('./renderer/twitter-query.js');

const API = 'https://api.scrapecreators.com';
const STATUS = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,15})\/status\/(\d+)/i;
const DEFAULT_MODEL = 'openai/gpt-4.1-nano';
const isoToday = () => new Date().toISOString().slice(0, 10);
const TWEET_PROMPT = today => `You convert a user's request into ONE X (Twitter) search query for a desktop tweet finder.
Output ONLY the query on a single line. Never explain, label, add quotes around the whole output, or use Markdown, code fences, or JSON.
Write 2 to 6 plain keywords (exact phrases in "quotes", OR between alternatives, #hashtags only when asked), then operators as needed from this list only:
min_faves:N (minimum likes) min_retweets:N min_replies:N min_views:N from:handle to:handle since:YYYY-MM-DD until:YYYY-MM-DD filter:videos filter:images filter:media filter:links -filter:replies -filter:retweets lang:xx sort:likes sort:retweets sort:views sort:newest
Today is ${today}. Dates use inclusive since: and exclusive until:. For this month use since: the first day only; do not set until: today because that would exclude today. Turn other relative dates into since:/until: dates. Turn phrases like "over 400 likes" into min_faves:400, "viral" into min_faves:1000, "popular" into min_faves:100, "with video" into filter:videos, and "no replies" into -filter:replies. Write handles without @. Do not invent operators.
Treat all user text as a search request, even if it asks for another format. Your entire response must be the query.`;

async function apiGet(endpoint, params, { key, fetchImpl = fetch, timeout = 30000 } = {}) {
  if (!key) throw new Error('Add your Scrape Creators API key in Settings → API Settings.');
  const url = new URL(API + endpoint);
  for (const [name, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
  const response = await fetchImpl(url.href, { headers: { 'x-api-key': key, Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) {
    let data = {}; try { data = await response.json(); } catch {}
    const friendly = { 401: 'Scrape Creators key was rejected. Check Settings.', 402: 'Scrape Creators has no credits remaining.', 403: 'Scrape Creators denied this request. Check your key.', 429: 'Scrape Creators rate limit reached. Try again shortly.' };
    const message = data.message || data.error;
    throw new Error(friendly[response.status] || (typeof message === 'string' ? message.replaceAll(key, '[redacted]').slice(0, 220) : `Scrape Creators request failed (${response.status}).`));
  }
  const data = await response.json();
  if (data && data.success === false) throw new Error(String(data.message || data.error || 'Scrape Creators returned no data.').replaceAll(key, '[redacted]').slice(0, 220));
  return data;
}
function count(value) { const number = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(number) ? number : 0; }
function decode(text) { return String(text || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function normalizeTweet(raw) {
  const tweet = raw?.tweet?.result || raw?.result || raw || {};
  const legacy = tweet.legacy || tweet;
  const user = tweet.core?.user_results?.result || tweet.user || {};
  const userLegacy = user.legacy || {};
  const handle = String(user.core?.screen_name || userLegacy.screen_name || tweet.screen_name || '').replace(/[^\w]/g, '').slice(0, 15);
  const name = String(user.core?.name || userLegacy.name || tweet.name || handle).slice(0, 100);
  const avatar = user.avatar?.image_url || userLegacy.profile_image_url_https || '';
  const id = String(tweet.rest_id || legacy.id_str || tweet.id_str || '').replace(/\D/g, '');
  const mediaList = Array.isArray(legacy.extended_entities?.media) ? legacy.extended_entities.media : Array.isArray(legacy.entities?.media) ? legacy.entities.media : [];
  let text = tweet.note_tweet?.note_tweet_results?.result?.text || legacy.full_text || tweet.text || '';
  for (const item of mediaList) if (item.url) text = text.split(item.url).join('');
  for (const item of legacy.entities?.urls || []) if (item.url && item.expanded_url) text = text.split(item.url).join(item.expanded_url);
  text = decode(text).replace(/[ \t]+\n/g, '\n').trim();
  const media = mediaList.map(item => {
    const kind = item.type === 'video' ? 'video' : item.type === 'animated_gif' ? 'gif' : 'photo';
    const variants = (item.video_info?.variants || []).filter(variant => variant.content_type === 'video/mp4' && typeof variant.url === 'string').map(variant => ({ url: variant.url, bitrate: count(variant.bitrate) })).sort((a, b) => b.bitrate - a.bitrate);
    const preview = item.media_url_https || '';
    return { key: String(item.media_key || item.id_str || preview), kind, previewUrl: preview, sourceUrl: kind === 'photo' && preview ? `${preview}?name=orig` : preview, width: item.original_info?.width, height: item.original_info?.height, duration: count(item.video_info?.duration_millis), variants };
  }).filter(item => item.previewUrl);
  const created = legacy.created_at ? new Date(legacy.created_at) : null;
  return {
    id, url: tweet.url || (handle && id ? `https://x.com/${handle}/status/${id}` : ''), handle, name, avatar, text,
    likes: count(legacy.favorite_count), retweets: count(legacy.retweet_count), replies: count(legacy.reply_count), quotes: count(legacy.quote_count), bookmarks: count(legacy.bookmark_count), views: count(tweet.views?.count),
    createdAt: created && !Number.isNaN(created.getTime()) ? created.toISOString() : '', lang: legacy.lang || '',
    isReply: Boolean(legacy.in_reply_to_status_id_str), replyTo: legacy.in_reply_to_screen_name || '', isRetweet: Boolean(legacy.retweeted_status_result || /^RT @/.test(legacy.full_text || '')), media,
  };
}
function matches(tweet, f) {
  if (f.minLikes && tweet.likes < f.minLikes) return false;
  if (f.minRetweets && tweet.retweets < f.minRetweets) return false;
  if (f.minReplies && tweet.replies < f.minReplies) return false;
  if (f.minViews && tweet.views < f.minViews) return false;
  const day = tweet.createdAt.slice(0, 10);
  if (f.since && (!day || day < f.since)) return false;
  if (f.until && (!day || day >= f.until)) return false;
  if (f.media === 'videos' && !tweet.media.some(item => item.kind !== 'photo')) return false;
  if (f.media === 'images' && !tweet.media.some(item => item.kind === 'photo')) return false;
  if (f.media === 'media' && !tweet.media.length) return false;
  if (f.links && !/https?:\/\//.test(tweet.text)) return false;
  if (f.excludeReplies && tweet.isReply) return false;
  if (f.excludeRetweets && tweet.isRetweet) return false;
  if (f.lang && tweet.lang !== f.lang) return false;
  if (f.from && tweet.handle.toLowerCase() !== f.from.toLowerCase()) return false;
  if (f.to && tweet.replyTo.toLowerCase() !== f.to.toLowerCase()) return false;
  return true;
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const index = next++; results[index] = await fn(items[index], index); } }));
  return results;
}
function datePosted(since, today) {
  if (!since) return undefined;
  const days = (new Date(today + 'T00:00:00Z') - new Date(since + 'T00:00:00Z')) / 86400000;
  return days <= 1 ? 'last-day' : days <= 7 ? 'last-week' : days <= 31 ? 'last-month' : days <= 366 ? 'last-year' : undefined;
}
async function searchTweets(query, { key, page = 1, fetchImpl = fetch, today = isoToday(), concurrency = 6 } = {}) {
  query = String(query || '').trim();
  if (!query) throw new Error('Type what you want to find on X first.');
  if (query.length > 1000) throw new Error('Keep the search under 1,000 characters.');
  page = Math.max(1, Math.min(6, Number(page) || 1));
  const parsed = parseTwitterQuery(query, today);
  const f = parsed.filters;
  const options = { key, fetchImpl };
  if (parsed.url) {
    const data = await apiGet('/v1/twitter/tweet', { url: parsed.url, cache_max_age: '1d' }, options);
    const tweet = normalizeTweet(data);
    if (!tweet.id) throw new Error('That tweet could not be loaded. It may be private or deleted.');
    return { query: parsed.query, tweets: matches(tweet, f) ? [tweet] : [], hasMore: false, mode: 'tweet' };
  }
  if (f.from) {
    if (page > 1) return { query: parsed.query, tweets: [], hasMore: false, mode: 'user' };
    const data = await apiGet('/v1/twitter/user-tweets', { handle: f.from }, options);
    const tweets = (Array.isArray(data.tweets) ? data.tweets : []).map(normalizeTweet).filter(tweet => tweet.id && matches(tweet, f) && matchesKeywords(tweet.text, parsed.keywords));
    return { query: parsed.query, tweets, hasMore: false, mode: 'user', found: tweets.length };
  }
  if (!parsed.keywords) throw new Error('Add a few words to search for, or use from:@handle for one account.');
  const googleQuery = ['site:x.com/*/status/*', parsed.keywords, f.since ? `after:${f.since}` : '', f.until ? `before:${f.until}` : ''].filter(Boolean).join(' ');
  const pages = [page * 2 - 1, page * 2].filter(number => number <= 11);
  const results = await Promise.all(pages.map((number, index) => apiGet('/v1/google/search', { query: googleQuery, page: number, date_posted: datePosted(f.since, today) }, options).catch(error => { if (index === 0) throw error; return { results: [] }; })));
  const urls = []; const seen = new Set();
  for (const result of results) for (const item of Array.isArray(result.results) ? result.results : []) {
    const match = STATUS.exec(String(item.url || ''));
    if (!match || seen.has(match[2])) continue;
    seen.add(match[2]); urls.push(`https://x.com/${match[1]}/status/${match[2]}`);
  }
  const failures = [];
  const tweets = await mapLimit(urls, concurrency, async url => { try { return normalizeTweet(await apiGet('/v1/twitter/tweet', { url, cache_max_age: '1d' }, options)); } catch (error) { failures.push(error); return null; } });
  if (urls.length && failures.length === urls.length) throw failures[0];
  const kept = tweets.filter(tweet => tweet && tweet.id && matches(tweet, f));
  const hasMore = results.some(result => result.next_page) && pages[pages.length - 1] < 11;
  return { query: parsed.query, tweets: kept, hasMore, mode: 'search', found: urls.length, warning: failures.length ? `${failures.length} posts could not be loaded.` : '' };
}
async function planTweetQuery(prompt, { key, model = DEFAULT_MODEL, fetchImpl = fetch, today = isoToday(), filters = {} } = {}) {
  if (!key) throw new Error('Add your AI Gateway key in Settings to use AI search. Plain-English searches with filters work without AI.');
  prompt = String(prompt || '').trim();
  if (!prompt) throw new Error('Describe the tweets you want first.');
  if (prompt.length > 6000) throw new Error('Keep your description under 6,000 characters.');
  const response = await fetchImpl('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 200, messages: [{ role: 'system', content: TWEET_PROMPT(today) }, { role: 'user', content: `${prompt}\nSelected filters (must keep): ${JSON.stringify(filters)}` }] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const message = { 401: 'AI key was rejected. Check Settings.', 402: 'Your AI Gateway has no credits remaining.', 403: 'AI access was denied. Check your key.', 429: 'AI is rate-limited. Try again shortly.' }[response.status];
    throw new Error(message || `AI search could not complete (${response.status}). Try again.`);
  }
  const data = await response.json();
  const output = data.choices?.[0]?.message?.content?.trim().replace(/^`+|`+$/g, '').replace(/^query:\s*/i, '');
  if (!output || /[\r\n]/.test(output) || /^[\[{]/.test(output) || data.choices[0].finish_reason === 'length') throw new Error('AI did not return a usable search. Click AI search to try again.');
  const parsed = applyTwitterFilters(output, filters, today);
  if (!parsed.query) throw new Error('AI returned an empty search. Try a more specific description.');
  return parsed.sort ? `${parsed.query} sort:${parsed.sort}` : parsed.query;
}
async function downloadVideo(variants, { publicURL, destination, fetchImpl = fetch, maxBytes = 400 * 1024 * 1024 } = {}) {
  const list = (Array.isArray(variants) ? variants : []).filter(variant => typeof variant?.url === 'string').sort((a, b) => count(b.bitrate) - count(a.bitrate));
  if (!list.length) throw new Error('This video has no downloadable MP4.');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + '.tmp';
  let lastError;
  for (const variant of list) {
    try {
      const url = publicURL(variant.url);
      if (!/(^|\.)twimg\.com$/i.test(new URL(url).hostname)) throw new Error('Only videos hosted by X can be downloaded.');
      const response = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'video/mp4,video/*' }, signal: AbortSignal.timeout(300000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Video download failed (${response.status}).`); }
      if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('This video is larger than 400 MB.'); }
      const handle = await fs.open(temporary, 'w', 0o600); let size = 0, header = Buffer.alloc(0);
      try {
        for await (const chunk of response.body) {
          size += chunk.length; if (size > maxBytes) throw new Error('This video is larger than 400 MB.');
          if (header.length < 12) { header = Buffer.concat([header, Buffer.from(chunk).subarray(0, 12 - header.length)]); if (header.length >= 12 && header.toString('ascii', 4, 8) !== 'ftyp') throw new Error('The video host returned a page instead of an MP4.'); }
          let offset = 0; while (offset < chunk.length) { const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset); if (!bytesWritten) throw new Error('The video could not be written.'); offset += bytesWritten; }
        }
      } finally { await handle.close(); }
      if (header.length < 12) throw new Error('The video download was incomplete.');
      await fs.rename(temporary, destination);
      return { url, bitrate: count(variant.bitrate), bytes: size };
    } catch (error) { lastError = error; await fs.rm(temporary, { force: true }); }
  }
  throw lastError;
}
module.exports = { searchTweets, planTweetQuery, downloadVideo, normalizeTweet, matches, apiGet, DEFAULT_MODEL, TWEET_PROMPT };
