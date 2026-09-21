(() => {
  Object.assign(paths, {
    x: '<path d="M5 4h4l10 16h-4L5 4Z"/><path d="m19 4-6.2 7.2M5 20l6.2-7.2"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
    repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
    reply: '<path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12Z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    play: '<path d="M8 5v14l11-7L8 5Z" fill="currentColor"/>',
    text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  });
  const fresh = () => ({ id: crypto.randomUUID(), draft: '', query: '', canonical: '', tweets: [], page: 0, hasMore: false, sort: 'likes', mode: '', filters: {}, loading: false, planning: false, token: '', error: '' });
  let tabs = [fresh()], state = tabs[0];
  const busy = new Map();
  const input = $('#tweet-input'), content = $('#tweet-content'), sortSelect = $('#tweet-sort'), aiButton = $('#tweet-ai-button');
  try {
    const saved = JSON.parse(localStorage.getItem('twitter-tabs'));
    const legacy = JSON.parse(localStorage.getItem('twitter-session'));
    const restored = saved?.tabs?.length ? saved.tabs : legacy ? [legacy] : [];
    if (restored.length) { tabs = restored.slice(0, 24).map(tab => ({ ...fresh(), ...tab, filters: tab.filters || {}, tweets: Array.isArray(tab.tweets) ? tab.tweets : [], loading: false, planning: false, token: '', error: '' })); state = tabs.find(tab => tab.id === saved?.activeId) || tabs[0]; }
  } catch {}
  function persist() { try { localStorage.setItem('twitter-tabs', JSON.stringify({ activeId: state.id, tabs: tabs.map(tab => ({ ...tab, tweets: tab.tweets.slice(0, 60), loading: false, planning: false, token: '' })) })); } catch {} }
  const fields = { from: '#tweet-from', minLikes: '#tweet-min-likes', minViews: '#tweet-min-views', since: '#tweet-since', until: '#tweet-until', excludeReplies: '#tweet-no-replies', excludeRetweets: '#tweet-no-reposts' };
  function closeFilters() { $('#tweet-filter-menu').hidden = true; $('#tweet-filter-button').setAttribute('aria-expanded', 'false'); }
  function syncFilters() {
    let effective = state.filters;
    try { effective = window.twitterQuery.applyTwitterFilters(state.draft || state.query, state.filters).filters; } catch {}
    for (const [key, selector] of Object.entries(fields)) { const el = $(selector); if (el.type === 'checkbox') el.checked = Boolean(effective[key]); else el.value = effective[key] || ''; }
    for (const el of document.querySelectorAll('[data-media]')) { const selected = el.dataset.media === (effective.media || 'all'); el.setAttribute('aria-pressed', String(selected)); el.textContent = `${selected ? '✓ ' : ''}${el.dataset.media === 'all' ? 'All' : el.dataset.media === 'videos' ? 'Videos' : 'Images'}`; }
    $('#tweet-filter-button').classList.toggle('active', Object.values(effective).some(value => value && value !== 'all'));
    sortSelect.value = state.sort;
  }
  function select(id) {
    state.scrollTop = content.scrollTop;
    state = tabs.find(tab => tab.id === id) || tabs[0]; input.value = state.draft;
    closeFilters(); syncFilters(); render(); content.scrollTop = state.scrollTop || 0; input.focus(); persist();
  }
  function newTab() { if (tabs.length >= 24) return toast('Use up to 24 social search tabs.', true); const tab = fresh(); tabs.push(tab); select(tab.id); }
  function closeTab(id = state.id) { const index = tabs.findIndex(tab => tab.id === id); tabs = tabs.filter(tab => tab.id !== id); if (!tabs.length) tabs.push(fresh()); if (state.id === id) select(tabs[Math.min(index, tabs.length - 1)].id); else { render(); persist(); } }
  function renderTabs() {
    const container = $('#tweet-tabs'); container.replaceChildren();
    for (const tab of tabs) {
      const wrap = element('div', `tab${tab === state ? ' active' : ''}`);
      const main = button('', null, () => select(tab.id), 'tab-main'); main.setAttribute('role', 'tab'); main.setAttribute('aria-selected', String(tab === state)); main.setAttribute('aria-label', tab.query || 'New X search');
      const glyph = element('span', 'tab-icon'); glyph.innerHTML = tab.loading || tab.planning ? '<span class="spinner"></span>' : icon('x');
      main.append(glyph, element('span', 'tab-name', tab.query || 'New X search'));
      const close = button('', 'close', () => closeTab(tab.id), 'close-tab'); close.setAttribute('aria-label', `Close ${tab.query || 'X search'}`);
      wrap.append(main, close); container.append(wrap);
    }
  }
  const fmt = value => value >= 1e6 ? `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1)}K` : String(value || 0);
  const duration = ms => { const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  function ago(iso) {
    if (!iso) return ''; const date = new Date(iso), diff = Date.now() - date;
    if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}d`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  }
  function sorted() {
    const list = [...state.tweets];
    if (state.sort === 'newest') list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    else if (['likes', 'retweets', 'views'].includes(state.sort)) list.sort((a, b) => (b[state.sort] || 0) - (a[state.sort] || 0));
    return list;
  }
  function renderAction() { aiButton.hidden = !input.value.trim(); aiButton.disabled = state.planning; aiButton.querySelector('.button-label').textContent = state.planning ? 'Thinking…' : 'AI search'; }
  function imageItem(tweet, media) { return { key: media.key, sourceUrl: media.sourceUrl, previewUrl: media.previewUrl, thumbnailUrl: media.previewUrl, title: `${tweet.name} (@${tweet.handle})`, query: `@${tweet.handle}`, source: tweet.url, domain: 'x.com', width: media.width, height: media.height }; }
  async function imageAction(type, tweet, media) {
    if (busy.has(media.key)) return;
    busy.set(media.key, type === 'copy' ? 'Copying…' : 'Saving…'); render();
    try {
      const result = await api.action({ type, item: imageItem(tweet, media), query: `@${tweet.handle}` });
      await refreshSaved(); toast(type === 'copy' ? `${result.name} copied · kept in Saved` : `${result.name}.png saved to Downloads`);
    } catch (err) { toast(err.message, true); }
    finally { busy.delete(media.key); render(); }
  }
  async function videoAction(type, tweet, media) {
    if (busy.has(media.key)) return;
    busy.set(media.key, type === 'copy' ? 'Copying…' : 'Downloading…'); render();
    try {
      const result = await api.tweetVideo({ type, media: { key: media.key, variants: media.variants }, title: `${tweet.name} @${tweet.handle} ${tweet.text.slice(0, 50)}` });
      toast(type === 'copy' ? 'Video copied. Paste it in Finder, Messages, Slack, or your editor.' : `${result.name} saved to Downloads`);
    } catch (err) { toast(err.message, true); }
    finally { busy.delete(media.key); render(); }
  }
  function openTweet(tweet) { api.source(tweet.url).catch(err => toast(err.message, true)); }
  function mediaTile(tweet, media, photos) {
    const tile = element('div', `tweet-media-tile ${media.kind}`);
    const stage = button('', null, () => media.kind === 'photo' ? openPreview(imageItem(tweet, media), { query: `@${tweet.handle}`, items: [] }, photos.map(item => imageItem(tweet, item))) : openTweet(tweet), 'tweet-media-stage');
    stage.setAttribute('aria-label', media.kind === 'photo' ? 'Preview image' : 'Open video on X');
    const img = element('img'); img.src = media.previewUrl; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.decoding = 'async'; stage.append(img);
    img.addEventListener('error', () => { img.remove(); const broken = element('span', 'broken'); broken.innerHTML = icon(media.kind === 'photo' ? 'image' : 'play'); broken.append(document.createTextNode(media.kind === 'photo' ? 'Preview unavailable' : 'Video')); stage.prepend(broken); });
    if (media.kind !== 'photo') { const badge = element('span', 'play-badge'); badge.innerHTML = icon('play'); badge.append(document.createTextNode(media.duration ? duration(media.duration) : media.kind === 'gif' ? 'GIF' : 'Video')); stage.append(badge); }
    const working = busy.get(media.key);
    if (working) { const overlay = element('span', 'working'); overlay.innerHTML = '<span class="spinner"></span>'; overlay.append(document.createTextNode(working)); stage.append(overlay); }
    tile.append(stage);
    const actions = element('div', 'tweet-media-actions');
    if (media.kind === 'photo') actions.append(button('Copy', 'copy', () => imageAction('copy', tweet, media)), button('Save', 'save', () => imageAction('save', tweet, media)));
    else if (media.variants?.length) actions.append(button('Download', 'save', () => videoAction('save', tweet, media)), button('Copy', 'copy', () => videoAction('copy', tweet, media)));
    for (const node of actions.querySelectorAll('button')) { node.disabled = Boolean(working); node.title = node.textContent === 'Copy' ? (media.kind === 'photo' ? 'Copy image and keep in Saved' : 'Copy the MP4 to the clipboard as a file') : node.textContent === 'Save' ? 'Save PNG to Downloads' : 'Download the MP4 to Downloads'; }
    tile.append(actions); return tile;
  }
  function card(tweet, index) {
    const article = element('article', 'tweet-card'); article.tabIndex = 0; article.dataset.index = index; article.dataset.id = tweet.id;
    const head = element('header', 'tweet-head');
    const avatar = element('img', 'tweet-avatar'); avatar.alt = ''; avatar.referrerPolicy = 'no-referrer'; if (tweet.avatar) avatar.src = tweet.avatar; avatar.addEventListener('error', () => avatar.replaceWith(element('span', 'tweet-avatar')));
    const who = element('div', 'tweet-who'); who.append(element('strong', '', tweet.name || `@${tweet.handle}`), element('span', 'tweet-handle', `@${tweet.handle}${tweet.createdAt ? ` · ${ago(tweet.createdAt)}` : ''}`));
    const open = button('', 'external', () => openTweet(tweet), 'icon-button'); open.title = 'Open on X'; open.setAttribute('aria-label', 'Open on X');
    head.append(avatar, who, open); article.append(head);
    if (tweet.text) article.append(element('p', 'tweet-text', tweet.text));
    const photos = tweet.media.filter(item => item.kind === 'photo');
    if (tweet.media.length) { const grid = element('div', `tweet-media count-${Math.min(tweet.media.length, 4)}`); for (const media of tweet.media.slice(0, 4)) grid.append(mediaTile(tweet, media, photos)); article.append(grid); }
    const foot = element('footer', 'tweet-stats');
    for (const [glyph, value, label] of [['heart', tweet.likes, 'likes'], ['repeat', tweet.retweets, 'reposts'], ['reply', tweet.replies, 'replies'], ['eye', tweet.views, 'views']]) {
      const stat = element('span', 'tweet-stat'); stat.innerHTML = icon(glyph); stat.append(document.createTextNode(fmt(value || 0))); stat.title = `${(value || 0).toLocaleString()} ${label}`; stat.dataset.stat = label; foot.append(stat);
    }
    foot.append(button('Copy text', 'text', async () => { try { await api.copyNote(tweet.text || tweet.url); toast('Tweet text copied.'); } catch (err) { toast(err.message, true); } }, 'tweet-copy-text'));
    article.append(foot);
    article.addEventListener('keydown', event => {
      if (event.target !== article) return;
      if (event.key === 'Enter') { event.preventDefault(); openTweet(tweet); }
      const offset = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (offset) { event.preventDefault(); content.querySelector(`.tweet-card[data-index="${index + offset}"]`)?.focus(); }
    });
    return article;
  }
  function render() {
    renderTabs(); renderAction();
    const { loading, planning, error } = state;
    $('#tweet-query').textContent = state.canonical || ''; $('#tweet-query').hidden = !state.canonical;
    const list = sorted();
    $('#tweet-count').textContent = planning ? 'Writing your search…' : loading && !list.length ? 'Searching X…' : list.length ? `${list.length} tweets${state.mode === 'user' && list[0] ? ` from @${list[0].handle}` : ''}` : '';
    const scroll = content.scrollTop; content.replaceChildren();
    if (error) { const node = element('div', 'inline-error'); node.append(element('span', 'error-text', error), button('Try again', null, () => search(state.tweets.length > 0))); content.append(node); }
    if (planning || (loading && !list.length)) {
      const note = element('div', 'loading-note'); note.innerHTML = '<span class="spinner"></span>';
      note.append(document.createTextNode(planning ? 'Turning your description into an X search…' : 'Finding tweets and pulling their stats…')); content.append(note); return;
    }
    if (!list.length) { if (!error) content.append(element('div', 'empty minimal-empty', state.query ? 'no tweets matched · try fewer filters' : 'search x')); return; }
    if (state.warning) content.append(element('p', 'social-discovery-note', state.warning));
    const feed = element('div', 'tweet-feed'); list.forEach((tweet, index) => feed.append(card(tweet, index))); content.append(feed);
    if (state.hasMore) { const more = button(loading ? 'Loading…' : 'Load more tweets', null, () => search(true), 'load-more'); more.disabled = loading; content.append(more); }
    content.append(element('p', 'social-discovery-note', 'Public X posts discovered via Google · filters checked against tweet data'));
    content.scrollTop = scroll;
  }
  async function search(more = false, tab = state, raw = tab.draft) {
    raw = more ? tab.query : raw.trim();
    if (!raw || !tabs.includes(tab) || (more && tab.loading)) return;
    const request = tab.token = crypto.randomUUID(); tab.error = ''; tab.planning = false; tab.loading = true;
    if (!more) {
      try {
        const parsed = window.twitterQuery.applyTwitterFilters(raw, tab.filters);
        tab.query = parsed.query; tab.canonical = parsed.query; tab.draft = raw; tab.tweets = []; tab.page = 0; tab.hasMore = false; tab.mode = '';
        if (parsed.sort) tab.sort = parsed.sort;
        if (tab === state) { content.scrollTop = 0; syncFilters(); }
      } catch (err) { tab.error = err.message; tab.loading = false; render(); return; }
    }
    closeFilters(); render(); persist();
    try {
      do {
        const result = await api.searchTweets({ query: tab.query, page: tab.page + 1 });
        if (tab.token !== request || !tabs.includes(tab)) return;
        const seen = new Set(tab.tweets.map(tweet => tweet.id));
        tab.tweets.push(...result.tweets.filter(tweet => !seen.has(tweet.id)));
        tab.page++; tab.hasMore = Boolean(result.hasMore); tab.mode = result.mode || ''; tab.canonical = result.query || tab.canonical;
        tab.warning = result.warning || '';
      } while (!tab.tweets.length && tab.hasMore && tab.page < 3);
    } catch (err) { if (tab.token === request) tab.error = err.message; }
    finally { if (tab.token === request && tabs.includes(tab)) { tab.loading = false; render(); persist(); } }
  }
  function submit() {
    const queries = [...new Set(input.value.split(';').map(query => query.trim()).filter(Boolean))];
    if (!queries.length) return;
    const available = 25 - tabs.length;
    if (queries.length > available) { toast('Use up to 24 social search tabs.', true); return; }
    const first = state;
    for (const [index, query] of queries.entries()) {
      const tab = index === 0 ? first : { ...fresh(), filters: { ...first.filters }, sort: first.sort };
      if (index) tabs.push(tab);
      tab.draft = query; if (!index) input.value = query;
      search(false, tab, query);
    }
  }
  async function aiSearch() {
    const tab = state, prompt = input.value.trim(); if (!prompt || tab.planning) return;
    const request = tab.token = crypto.randomUUID(); tab.planning = true; tab.loading = false; tab.error = ''; render();
    try {
      const query = await api.planTweets({ prompt, filters: { ...tab.filters } });
      if (!tabs.includes(tab) || tab.token !== request) return;
      tab.draft = query; tab.planning = false;
      if (state === tab) input.value = query;
      await search(false, tab, query);
    } catch (err) { if (tab.token === request) tab.error = err.message; }
    finally { if (tab.token === request && tabs.includes(tab)) { tab.planning = false; render(); persist(); } }
  }
  $('#tweet-icon').innerHTML = icon('x'); $('#twitter-module').innerHTML = icon('x');
  $('#new-tweet-tab').innerHTML = icon('plus'); $('#new-tweet-tab').addEventListener('click', newTab);
  $('#tweet-filter-button').innerHTML = icon('filter');
  $('#tweet-filter-button').addEventListener('click', () => { const menu = $('#tweet-filter-menu'); syncFilters(); menu.hidden = !menu.hidden; $('#tweet-filter-button').setAttribute('aria-expanded', String(!menu.hidden)); });
  for (const [key, selector] of Object.entries(fields)) $(selector).addEventListener('change', event => { state.filters[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; persist(); syncFilters(); });
  for (const el of document.querySelectorAll('[data-media]')) el.addEventListener('click', () => { state.filters.media = el.dataset.media; syncFilters(); persist(); });
  $('#tweet-reset-filters').addEventListener('click', () => { state.filters = { media: 'all', from: '', minLikes: '', minViews: '', since: '', until: '', excludeReplies: false, excludeRetweets: false }; syncFilters(); persist(); });
  $('#tweet-apply-filters').addEventListener('click', () => { closeFilters(); search(false); });
  document.addEventListener('click', event => { if (!event.target.closest('.social-filter-wrap')) closeFilters(); });
  $('#tweet-form').addEventListener('submit', event => { event.preventDefault(); submit(); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.isComposing) { event.preventDefault(); if (!event.repeat) submit(); } });
  input.addEventListener('input', () => { state.draft = input.value; if (state.planning) { state.planning = false; state.token = ''; } renderAction(); persist(); });
  aiButton.addEventListener('click', aiSearch);
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; render(); persist(); });
  window.twitter = { focus: (select = true) => { input.focus(); if (select) input.select(); }, aiSearch, refresh: render, focusFirst: () => content.querySelector('.tweet-card')?.focus(), search, newTab, closeTab, nextTab: () => select(tabs[(tabs.indexOf(state) + 1) % tabs.length].id), closeFilters };
  input.value = state.draft; syncFilters(); render();
})();
