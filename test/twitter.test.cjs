const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseTwitterQuery, matchesKeywords } = require('../renderer/twitter-query.js');
const { searchTweets, planTweetQuery, downloadVideo, normalizeTweet } = require('../twitter.cjs');

const TODAY = '2026-09-18';
const video = { type: 'video', media_key: '13_1', media_url_https: 'https://pbs.twimg.com/v.jpg', url: 'https://t.co/vid', original_info: { width: 1920, height: 1080 }, video_info: { duration_millis: 65000, variants: [{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/a/pl.m3u8' }, { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/a/640.mp4' }, { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/a/1280.mp4' }] } };
const photo = { type: 'photo', media_key: '3_1', media_url_https: 'https://pbs.twimg.com/media/p.jpg', url: 'https://t.co/pic', original_info: { width: 800, height: 600 } };
const tweet = ({ id, handle = 'someone', name = 'Someone', likes = 0, retweets = 0, views = 0, createdAt = 'Mon Sep 14 16:30:23 +0000 2026', text = 'Hello', media = [], reply = false, shape = 'legacy', lang = 'en' }) => ({
  rest_id: id, url: `https://x.com/${handle}/status/${id}`, views: { count: String(views) },
  core: { user_results: { result: shape === 'core' ? { core: { screen_name: handle, name }, avatar: { image_url: 'https://pbs.twimg.com/avatar.jpg' } } : { legacy: { screen_name: handle, name, profile_image_url_https: 'https://pbs.twimg.com/avatar.jpg' } } } },
  legacy: { full_text: `${text} ${media.map(item => item.url).join(' ')}`.trim(), favorite_count: likes, retweet_count: retweets, reply_count: 3, created_at: createdAt, lang, in_reply_to_status_id_str: reply ? '1' : undefined, in_reply_to_screen_name: reply ? 'other' : undefined, entities: { media, urls: [{ url: 'https://t.co/link', expanded_url: 'https://agentnative.inc' }] }, extended_entities: media.length ? { media } : undefined },
});

test('plain English becomes deterministic X operators and canonical queries round-trip', () => {
  const first = parseTwitterQuery('ai agents over 400 likes last week with video', TODAY);
  assert.equal(first.query, 'ai agents min_faves:400 since:2026-09-11 filter:videos');
  assert.deepEqual(first.filters, { minLikes: 400, since: '2026-09-11', media: 'videos' });
  const second = parseTwitterQuery('1k+ retweets from @rileybrown no replies sorted by views', TODAY);
  assert.equal(second.query, 'from:rileybrown min_retweets:1000 -filter:replies'); assert.equal(second.sort, 'views'); assert.equal(second.keywords, '');
  const third = parseTwitterQuery('show me posts about claude code that have over 2,500 likes with images this month in english', TODAY);
  assert.equal(third.query, 'claude code min_faves:2500 since:2026-09-01 filter:images lang:en');
  const fourth = parseTwitterQuery('"vibe coding" OR vibecoding min_faves:250 until:2026-09-01 -filter:retweets', TODAY);
  assert.equal(fourth.query, '"vibe coding" OR vibecoding min_faves:250 until:2026-09-01 -filter:retweets');
  assert.equal(parseTwitterQuery('@levelsio', TODAY).query, 'from:levelsio');
  assert.equal(parseTwitterQuery('tweets by @levelsio about revenue in 2025 likes > 300', TODAY).query, 'revenue from:levelsio min_faves:300 since:2025-01-01 until:2026-01-01');
  assert.equal(parseTwitterQuery('openai launch yesterday 10k views', TODAY).query, 'openai launch min_views:10000 since:2026-09-17 until:2026-09-18');
  assert.equal(parseTwitterQuery('last 3 days cursor with links', TODAY).query, 'cursor since:2026-09-15 filter:links');
  const url = parseTwitterQuery('look at https://twitter.com/rileybrown/status/2099536246859010412?s=20 please', TODAY);
  assert.equal(url.url, 'https://x.com/rileybrown/status/2099536246859010412'); assert.equal(url.query, url.url);
  for (const text of ['ai agents over 400 likes last week with video', 'from:levelsio min_faves:12 since:2026-01-02 lang:en', 'claude code min_retweets:5 filter:media -filter:replies']) {
    const once = parseTwitterQuery(text, TODAY); assert.equal(parseTwitterQuery(once.query, TODAY).query, once.query);
  }
  assert.equal(parseTwitterQuery('video editing tips', TODAY).query, 'video editing tips');
  assert.equal(parseTwitterQuery('since:bad-date openai', TODAY).query, 'openai');
  assert.equal(matchesKeywords('Claude Code ships agents', 'claude agents'), true);
  assert.equal(matchesKeywords('Claude Code ships agents', '"claude code" -ships'), false);
  assert.equal(matchesKeywords('Cursor is fast', 'claude OR cursor'), true);
});

test('tweets normalize from both user-field shapes and searches apply filters on real counts', async () => {
  const normalized = normalizeTweet({ success: true, ...tweet({ id: '1', shape: 'core', likes: '1,234', media: [video, photo], text: 'Read this https://t.co/link &amp; more' }) });
  assert.equal(normalized.handle, 'someone'); assert.equal(normalized.likes, 1234); assert.equal(normalized.text, 'Read this https://agentnative.inc & more');
  assert.deepEqual(normalized.media.map(item => item.kind), ['video', 'photo']);
  assert.equal(normalized.media[0].variants[0].url, 'https://video.twimg.com/a/1280.mp4'); assert.equal(normalized.media[0].duration, 65000);
  assert.equal(normalized.media[1].sourceUrl, 'https://pbs.twimg.com/media/p.jpg?name=orig');
  const store = { 101: tweet({ id: '101', likes: 900, retweets: 40, views: 5000, media: [video], createdAt: 'Wed Sep 16 10:00:00 +0000 2026' }), 102: tweet({ id: '102', likes: 50, media: [video] }), 103: tweet({ id: '103', likes: 2000, media: [photo], createdAt: 'Tue Sep 01 10:00:00 +0000 2026' }), 104: tweet({ id: '104', likes: 700, media: [video], reply: true, createdAt: 'Thu Sep 17 10:00:00 +0000 2026' }) };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, key: options.headers['x-api-key'] });
    const parsed = new URL(url);
    if (parsed.pathname === '/v1/google/search') {
      const page = Number(parsed.searchParams.get('page'));
      const results = page === 1 ? [{ url: 'https://x.com/someone/status/101' }, { url: 'https://x.com/i/article/9' }, { url: 'https://x.com/someone/status/102' }] : page === 2 ? [{ url: 'https://twitter.com/someone/status/103?s=20' }, { url: 'https://x.com/someone/status/104' }, { url: 'https://x.com/someone/status/101' }] : [];
      return new Response(JSON.stringify({ success: true, results, next_page: page < 3 ? page + 1 : undefined }));
    }
    if (parsed.pathname === '/v1/twitter/tweet') { const id = parsed.searchParams.get('url').split('/').pop(); return store[id] ? new Response(JSON.stringify({ success: true, ...store[id] })) : new Response('{"success":false,"message":"missing"}', { status: 404 }); }
    if (parsed.pathname === '/v1/twitter/user-tweets') return new Response(JSON.stringify({ success: true, tweets: Object.values(store) }));
    throw new Error('unexpected ' + url);
  };
  const result = await searchTweets('ai agents over 400 likes with video no replies last month', { key: 'secret', fetchImpl, today: TODAY });
  assert.equal(result.query, 'ai agents min_faves:400 since:2026-08-19 filter:videos -filter:replies');
  assert.deepEqual(result.tweets.map(item => item.id), ['101']); assert.equal(result.hasMore, true); assert.equal(result.found, 4); assert.equal(result.mode, 'search');
  const google = calls.filter(call => call.url.includes('/v1/google/search')).map(call => new URL(call.url));
  assert.equal(google.length, 2); assert.equal(google[0].searchParams.get('query'), 'site:x.com/*/status/* ai agents after:2026-08-19'); assert.equal(google[0].searchParams.get('date_posted'), 'last-month');
  assert.equal(calls.filter(call => call.url.includes('/v1/twitter/tweet')).length, 4); assert.ok(calls.every(call => call.key === 'secret'));
  const user = await searchTweets('from:someone hello min_faves:600 sort:newest', { key: 'secret', fetchImpl, today: TODAY });
  assert.deepEqual(user.tweets.map(item => item.id), ['101', '103', '104']); assert.equal(user.mode, 'user'); assert.equal(user.hasMore, false);
  const single = await searchTweets('https://x.com/someone/status/103', { key: 'secret', fetchImpl, today: TODAY });
  assert.equal(single.mode, 'tweet'); assert.equal(single.tweets[0].likes, 2000);
  await assert.rejects(searchTweets('min_faves:400', { key: 'secret', fetchImpl }), /Add a few words/);
  await assert.rejects(searchTweets('anything', { key: '', fetchImpl }), /Scrape Creators API key/);
  await assert.rejects(searchTweets('anything', { key: 'secret', fetchImpl: async () => new Response('{}', { status: 401 }) }), /rejected/);
});

test('AI planning returns a normalized single-line query and video download prefers the best variant that fits', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push(JSON.parse(options.body)); return new Response(JSON.stringify({ choices: [{ message: { content: '`ai agents min_faves:400 since:2026-09-11 filter:videos sort:views`' }, finish_reason: 'stop' }] })); };
  assert.equal(await planTweetQuery('viral ai agent videos from the last week, most viewed first', { key: 'secret', fetchImpl, today: TODAY }), 'ai agents min_faves:400 since:2026-09-11 filter:videos sort:views');
  assert.match(requests[0].messages[0].content, /Today is 2026-09-18/);
  await assert.rejects(planTweetQuery('x', { key: 'secret', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'one\ntwo' }, finish_reason: 'stop' }] })) }), /usable search/);
  await assert.rejects(planTweetQuery('x', { key: '' }), /AI Gateway key/);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tweet-video-'));
  try {
    const destination = path.join(root, 'videos', 'clip.mp4');
    const attempts = [];
    const videoFetch = async url => { attempts.push(url); if (url.includes('1280')) return new Response(Buffer.alloc(10), { headers: { 'content-length': '900000000' } }); return new Response(Buffer.from('0000ftypisommp4 bytes'), { headers: { 'content-length': '21' } }); };
    const result = await downloadVideo(video.video_info.variants.map(variant => ({ url: variant.url, bitrate: variant.bitrate })), { publicURL: value => new URL(value).href, destination, fetchImpl: videoFetch });
    assert.equal(result.url, 'https://video.twimg.com/a/640.mp4'); assert.equal(result.bytes, 21);
    assert.deepEqual(attempts, ['https://video.twimg.com/a/1280.mp4', 'https://video.twimg.com/a/640.mp4']);
    assert.equal(await fs.readFile(destination, 'utf8'), '0000ftypisommp4 bytes');
    assert.deepEqual(await fs.readdir(path.join(root, 'videos')), ['clip.mp4']);
    await assert.rejects(downloadVideo([{ url: 'https://evil.example/a.mp4', bitrate: 1 }], { publicURL: value => new URL(value).href, destination: path.join(root, 'other.mp4'), fetchImpl: videoFetch }), /hosted by X/);
    await assert.rejects(downloadVideo([], { publicURL: value => value, destination }), /no downloadable/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});


test('selected media filters override AI suggestions and direct links obey filters', async () => {
  const { applyTwitterFilters } = require('../renderer/twitter-query.js');
  assert.equal(applyTwitterFilters('cats filter:images min_faves:10', { media: 'videos', minLikes: 500 }).query, 'cats min_faves:500 filter:videos');
  assert.equal(applyTwitterFilters('cats filter:images', { media: 'all' }).query, 'cats');
  assert.throws(() => applyTwitterFilters('cats', { since: '2026-09-10', until: '2026-09-01' }), /Until/);
  const planned = await planTweetQuery('cats', { key: 'test', filters: { media: 'videos', minLikes: 500 }, fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'cats filter:images' }, finish_reason: 'stop' }] })) });
  assert.equal(planned, 'cats min_faves:500 filter:videos');
  const query = applyTwitterFilters('https://x.com/someone/status/101', { media: 'videos' }).query;
  const result = await searchTweets(query, { key: 'test', fetchImpl: async () => new Response(JSON.stringify(tweet({ id: '101', media: [photo] }))) });
  assert.deepEqual(result.tweets, []);
});
