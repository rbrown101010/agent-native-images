const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');

const launch = root => _electron.launch({ args: [path.resolve(__dirname, '..'), '--test-mode', `--test-data=${root}`] });
const open = async app => { const page = await app.firstWindow(); await page.waitForSelector('#settings-dialog[open]'); await page.locator('#close-settings').click(); return page; };
const media = (kind, id) => kind === 'video'
  ? { type: 'video', media_key: `13_${id}`, media_url_https: `https://pbs.twimg.com/thumb${id}.jpg`, url: `https://t.co/v${id}`, original_info: { width: 1280, height: 720 }, video_info: { duration_millis: 12000, variants: [{ content_type: 'video/mp4', bitrate: 832000, url: `https://video.twimg.com/${id}/640.mp4` }, { content_type: 'video/mp4', bitrate: 2176000, url: `https://video.twimg.com/${id}/1280.mp4` }] } }
  : { type: 'photo', media_key: `3_${id}`, media_url_https: `https://pbs.twimg.com/media/photo${id}.jpg`, url: `https://t.co/p${id}`, original_info: { width: 640, height: 480 } };
const tweet = (id, { handle, name, likes, retweets, views, createdAt, text, media: items = [] }) => ({ success: true, rest_id: id, url: `https://x.com/${handle}/status/${id}`, views: { count: String(views) }, core: { user_results: { result: { core: { screen_name: handle, name }, avatar: { image_url: 'https://pbs.twimg.com/avatar.jpg' } } } }, legacy: { full_text: `${text} ${items.map(item => item.url).join(' ')}`, favorite_count: likes, retweet_count: retweets, reply_count: 2, created_at: createdAt, lang: 'en', entities: { media: items }, extended_entities: { media: items } } });

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'images-twitter-'));
  const png = await sharp({ create: { width: 640, height: 480, channels: 4, background: '#5a7fb0' } }).png().toBuffer();
  let app;
  try {
    app = await launch(root);
    const page = await open(app); const errors = []; page.on('pageerror', error => errors.push(error.message));
    const diagnose = async () => { try { console.error('CONTENT:', await page.locator('#tweet-content').innerText()); console.error('TOAST:', await page.locator('#toast').textContent()); console.error('CALLS:', await app.evaluate(() => globalThis.calls)); console.error('PAGE ERRORS:', errors); } catch (error) { console.error('diagnose failed', error.message); } };
    try {
    await page.evaluate(() => window.images.configure({ scrapecreators: 'test-scrapecreators-key', gateway: 'test-gateway-key' }));
    await app.evaluate(`(() => { globalThis.media = ${media.toString()}; globalThis.tweet = ${tweet.toString()}; })()`);
    await app.evaluate((_electron, { png }) => {
      const tweets = {
        901: { handle: 'rileybrown', name: 'Riley Brown', likes: 865, retweets: 80, views: 113305, createdAt: 'Mon Sep 14 16:30:23 +0000 2026', text: 'GPT-6 Astra inside Codex &amp; the beginners guide', media: [globalThis.media('video', 901)] },
        902: { handle: 'someone', name: 'Someone Else', likes: 120, retweets: 4, views: 900, createdAt: 'Tue Sep 15 10:00:00 +0000 2026', text: 'Low engagement video tweet', media: [globalThis.media('video', 902)] },
        903: { handle: 'lexfridman', name: 'Lex Fridman', likes: 4300, retweets: 500, views: 800000, createdAt: 'Sun Sep 13 08:00:00 +0000 2026', text: 'The power of AI agents comes from the model', media: [globalThis.media('photo', 903), globalThis.media('video', 903)] },
        904: { handle: 'builder', name: 'Builder', likes: 2200, retweets: 90, views: 40000, createdAt: 'Thu Sep 17 12:00:00 +0000 2026', text: 'Shipping agents all week, no video here', media: [globalThis.media('photo', 904)] },
      };
      globalThis.calls = [];
      globalThis.fetch = async (url, options = {}) => {
        const href = String(url); globalThis.calls.push(href);
        const parsed = new URL(href);
        if (parsed.hostname === 'api.scrapecreators.com') {
          if (options.headers?.['x-api-key'] !== 'test-scrapecreators-key') return new Response('{"success":false}', { status: 401 });
          if (parsed.pathname === '/v1/google/search') { const number = Number(parsed.searchParams.get('page')); const results = number === 1 ? [{ url: 'https://x.com/rileybrown/status/901' }, { url: 'https://x.com/i/article/5' }, { url: 'https://x.com/someone/status/902' }] : number === 2 ? [{ url: 'https://x.com/lexfridman/status/903' }, { url: 'https://x.com/builder/status/904' }] : []; return new Response(JSON.stringify({ success: true, results, next_page: number < 2 ? 2 : undefined })); }
          if (parsed.pathname === '/v1/twitter/tweet') { const id = parsed.searchParams.get('url').split('/').pop(); return new Response(JSON.stringify(globalThis.tweet(id, tweets[id]))); }
          if (parsed.pathname === '/v1/twitter/user-tweets') return new Response(JSON.stringify({ success: true, tweets: Object.entries(tweets).filter(([, item]) => item.handle === parsed.searchParams.get('handle')).map(([id, item]) => globalThis.tweet(id, item)) }));
        }
        if (parsed.hostname === 'ai-gateway.vercel.sh') return new Response(JSON.stringify({ choices: [{ message: { content: 'ai agents min_faves:400 filter:videos sort:views' }, finish_reason: 'stop' }] }));
        if (parsed.hostname === 'video.twimg.com') { const body = Buffer.from(`0000ftypisommp4:${parsed.pathname}`); return new Response(body, { headers: { 'content-length': String(body.length), 'content-type': 'video/mp4' } }); }
        if (parsed.hostname === 'pbs.twimg.com') return new Response(Buffer.from(png, 'base64'), { headers: { 'content-type': 'image/png' } });
        return new Response('not found', { status: 404 });
      };
    }, { png: png.toString('base64') });
    await page.locator('#twitter-module').click();
    assert.equal(await page.locator('#twitter-workspace').isVisible(), true); assert.equal(await page.evaluate(() => document.activeElement?.id), 'tweet-input');
    await page.locator('#tweet-input').fill('ai agents over 400 likes with video'); await page.locator('#tweet-input').press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.tweet-card').length === 2);
    assert.equal(await page.locator('#tweet-query').innerText(), 'ai agents min_faves:400 filter:videos');
    assert.deepEqual(await page.locator('.tweet-card strong').allInnerTexts(), ['Lex Fridman', 'Riley Brown']);
    assert.equal(await page.locator('.tweet-card').first().locator('[data-stat="likes"]').innerText(), '4.3K');
    assert.equal(await page.locator('.tweet-card').last().locator('.tweet-text').innerText(), 'GPT-6 Astra inside Codex & the beginners guide');
    assert.equal(await page.locator('#tweet-count').innerText(), '2 tweets');
    await page.locator('#tweet-filter-button').click(); await page.locator('#tweet-sort').selectOption('newest'); await page.locator('#tweet-filter-button').click();
    assert.deepEqual(await page.locator('.tweet-card strong').allInnerTexts(), ['Riley Brown', 'Lex Fridman']);
    const first = page.locator('.tweet-card').first();
    await first.locator('.tweet-media-tile.video').hover(); await first.getByRole('button', { name: 'Download', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('saved to Downloads'));
    const downloads = (await fs.readdir(path.join(root, 'Downloads'))).filter(name => name.endsWith('.mp4'));
    assert.equal(downloads.length, 1); assert.match(downloads[0], /^Riley Brown @rileybrown/);
    assert.equal(await fs.readFile(path.join(root, 'Downloads', downloads[0]), 'utf8'), '0000ftypisommp4:/901/1280.mp4');
    await first.locator('.tweet-media-tile.video').hover(); await first.locator('.tweet-media-tile.video').getByRole('button', { name: 'Copy', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Video copied'));
    assert.match(execFileSync('osascript', ['-e', 'clipboard info']).toString(), /furl/);
    const copiedPath = execFileSync('osascript', ['-e', 'POSIX path of (the clipboard as «class furl»)']).toString().trim();
    assert.match(copiedPath, /\.mp4$/); assert.equal(await fs.readFile(copiedPath, 'utf8'), '0000ftypisommp4:/901/1280.mp4');
    assert.equal((await fs.readdir(path.join(root, 'Downloads'))).filter(name => name.endsWith('.mp4')).length, 1);
    const lex = page.locator('.tweet-card').last();
    await lex.locator('.tweet-media-tile.photo').hover(); await lex.locator('.tweet-media-tile.photo').getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('saved to Downloads'));
    assert.deepEqual((await fs.readdir(path.join(root, 'Downloads'))).filter(name => name.endsWith('.png')), ['@lexfridman (1).png']);
    await lex.locator('.tweet-copy-text').click(); await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Tweet text copied'));
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'The power of AI agents comes from the model');
    await page.locator('#tweet-input').fill('from:rileybrown'); await page.locator('#tweet-input').press('Enter');
    await page.waitForFunction(() => document.querySelector('#tweet-count')?.textContent === '1 tweets from @rileybrown');
    await page.locator('#tweet-input').fill('viral ai agent videos most viewed'); await page.keyboard.press('Meta+Enter');
    await page.waitForFunction(() => document.querySelector('#tweet-input')?.value === 'ai agents min_faves:400 filter:videos sort:views');
    await page.waitForFunction(() => document.querySelector('#tweet-sort')?.value === 'views' && document.querySelectorAll('.tweet-card').length === 2);
    assert.equal(await page.locator('#tweet-sort').inputValue(), 'views'); assert.equal(await page.locator('#tweet-input').inputValue(), 'ai agents min_faves:400 filter:videos sort:views');
    assert.deepEqual(await page.locator('.tweet-card strong').allInnerTexts(), ['Lex Fridman', 'Riley Brown']);
    await page.screenshot({ path: 'test-artifacts/twitter-desktop.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(600, 420));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: 'test-artifacts/twitter-small.png' });
    assert.deepEqual(errors, []);
    await app.close();
    app = await launch(root);
    const reopened = await open(app); await reopened.locator('#twitter-module').click();
    await reopened.waitForFunction(() => document.querySelectorAll('.tweet-card').length === 2);
    assert.equal(await reopened.locator('#tweet-input').inputValue(), 'ai agents min_faves:400 filter:videos sort:views');
    } catch (error) { await diagnose(); throw error; }
    console.log('PASS: X search with deterministic filters, sorting, video download and clipboard copy, image save, text copy, from:handle, AI search and restart.');
  } finally { if (app) await app.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
