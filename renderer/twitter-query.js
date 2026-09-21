(function (root) {
  // Deterministic conversion of plain-English tweet requests into X search operators.
  const OPERATORS = /^(-?filter|min_faves|min_retweets|min_replies|min_views|from|to|since|until|lang|sort):(\S+)$/i;
  const STATUS = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,15})\/status\/(\d+)\S*/i;
  const LANGS = { english: 'en', spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt', italian: 'it', japanese: 'ja', korean: 'ko', chinese: 'zh', hindi: 'hi', arabic: 'ar', russian: 'ru', dutch: 'nl', turkish: 'tr', indonesian: 'id' };
  const UNITS = { hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 };
  const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
  const SORTS = { like: 'likes', likes: 'likes', fave: 'likes', faves: 'likes', heart: 'likes', hearts: 'likes', 'most liked': 'likes', 'top liked': 'likes', retweet: 'retweets', retweets: 'retweets', repost: 'retweets', reposts: 'retweets', rt: 'retweets', rts: 'retweets', 'most retweeted': 'retweets', 'most reposted': 'retweets', view: 'views', views: 'views', impression: 'views', impressions: 'views', 'most viewed': 'views', date: 'newest', newest: 'newest', recency: 'newest', latest: 'newest', 'most recent': 'newest', recent: 'newest', relevance: 'relevance' };
  const NUM = '(\\d+(?:[.,]\\d+)*)\\s*([km])?';
  const MIN = '(?:(?:that|which|who)\\s+)?(?:(?:have|has|had|got|get|getting|received|reaching|with|having|hitting)\\s+)?(?:(?:over|more than|at least|min(?:imum)?(?: of)?|above|greater than|>=?)\\s*)?';
  const METRICS = [['minLikes', 'likes?|faves?|favou?rites?|hearts?'], ['minRetweets', 'retweets?|rts?|reposts?|shares?'], ['minReplies', 'replies|comments?'], ['minViews', 'views?|impressions?']];
  const CANONICAL = [['minLikes', 'min_faves'], ['minRetweets', 'min_retweets'], ['minReplies', 'min_replies'], ['minViews', 'min_views']];
  const isoDate = date => date.toISOString().slice(0, 10);
  const handleOf = value => String(value || '').replace(/^@/, '').replace(/[^\w]/g, '').slice(0, 15);
  function parseNumber(digits, suffix) {
    let value = Number(String(digits).replace(/,/g, ''));
    if (!Number.isFinite(value)) return 0;
    if (/k/i.test(suffix || '')) value *= 1000; if (/m/i.test(suffix || '')) value *= 1000000;
    return Math.round(value);
  }
  function shift(today, days) { const date = new Date(today + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() - Math.ceil(days)); return isoDate(date); }
  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + 'T00:00:00Z').getTime()) ? value : ''; }
  function parseTwitterQuery(input, today = isoDate(new Date())) {
    const filters = {}; let sort = '';
    let text = String(input || '').replace(/[\s ]+/g, ' ').trim();
    const status = STATUS.exec(text);
    if (status) { filters.url = `https://x.com/${status[1]}/status/${status[2]}`; text = text.replace(status[0], ' '); }
    const rest = [];
    for (const token of text.split(' ')) {
      const op = OPERATORS.exec(token);
      if (!op) { rest.push(token); continue; }
      const name = op[1].toLowerCase(), value = op[2];
      if (name === 'min_faves') filters.minLikes = parseNumber(value);
      else if (name === 'min_retweets') filters.minRetweets = parseNumber(value);
      else if (name === 'min_replies') filters.minReplies = parseNumber(value);
      else if (name === 'min_views') filters.minViews = parseNumber(value);
      else if (name === 'from') filters.from = handleOf(value);
      else if (name === 'to') filters.to = handleOf(value);
      else if (name === 'since') filters.since = validDate(value);
      else if (name === 'until') filters.until = validDate(value);
      else if (name === 'lang') filters.lang = value.toLowerCase().replace(/[^a-z-]/g, '').slice(0, 5);
      else if (name === 'sort') sort = SORTS[value.toLowerCase()] || '';
      else if (name === 'filter') {
        const kind = value.toLowerCase();
        if (['videos', 'video', 'native_video'].includes(kind)) filters.media = 'videos';
        else if (['images', 'image', 'photos', 'photo'].includes(kind)) filters.media = 'images';
        else if (kind === 'media') filters.media = 'media';
        else if (kind === 'links') filters.links = true;
      } else if (name === '-filter') {
        const kind = value.toLowerCase();
        if (kind === 'replies') filters.excludeReplies = true;
        if (['retweets', 'nativeretweets', 'reposts'].includes(kind)) filters.excludeRetweets = true;
      }
    }
    text = rest.join(' ');
    const take = (pattern, fn) => { text = text.replace(pattern, (...match) => { fn(...match); return ' '; }); };
    const setMin = key => (_, digits, suffix) => { filters[key] = Math.max(filters[key] || 0, parseNumber(digits, suffix)); };
    take(/\bin (20\d\d)\b/gi, (_, year) => { filters.since = `${year}-01-01`; filters.until = `${Number(year) + 1}-01-01`; });
    for (const [key, words] of METRICS) {
      const metric = `(?:${words})`;
      take(new RegExp(`\\b${metric}\\s*(?:over|above|of at least|at least|>=?|:)\\s*${NUM}\\+?`, 'gi'), setMin(key));
      take(new RegExp(`\\b${MIN}${NUM}\\s*\\+?\\s*${metric}(?:\\s+(?:or more|and up|and above|minimum|min))?\\b`, 'gi'), setMin(key));
    }
    take(/\b(?:in the |over the |from the |within the |during the )?(?:last|past|previous)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)?\s*(hour|day|week|month|year)s?\b/gi, (_, amount, unit) => {
      const count = amount ? (WORDS[amount.toLowerCase()] || Number(amount) || 1) : 1;
      filters.since = shift(today, count * UNITS[unit.toLowerCase()]);
    });
    take(/\bthis (week|month|year)\b/gi, (_, unit) => {
      const date = new Date(today + 'T00:00:00Z');
      if (unit.toLowerCase() === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      if (unit.toLowerCase() === 'month') date.setUTCDate(1);
      if (unit.toLowerCase() === 'year') date.setUTCMonth(0, 1);
      filters.since = isoDate(date);
    });
    take(/\btoday\b/gi, () => { filters.since = today; });
    take(/\byesterday\b/gi, () => { filters.since = shift(today, 1); filters.until = today; });
    take(/\b(?:since|after|from|starting)\s+(\d{4}-\d{2}-\d{2})\b/gi, (_, date) => { filters.since = validDate(date); });
    take(/\b(?:until|before|up to|through)\s+(\d{4}-\d{2}-\d{2})\b/gi, (_, date) => { filters.until = validDate(date); });
    take(/\b(?:from|by|posted by|tweeted by|written by|author)\s+@(\w{1,15})\b/gi, (_, handle) => { filters.from = handle; });
    take(/\b(?:replying to|replies to|reply to|to)\s+@(\w{1,15})\b/gi, (_, handle) => { filters.to = handle; });
    take(/(?:^|\s)@(\w{1,15})(?:'s|’s)?\s+(?:tweets|posts|timeline)\b/gi, (_, handle) => { filters.from = handle; });
    take(/\b(?:with|has|having|containing|including|that have|that include|only)\s+(?:a\s+)?(?:videos?|clips?)\b|\b(?:videos?|clips?)\s+only\b|\bonly\s+videos?\b/gi, () => { filters.media = 'videos'; });
    take(/\b(?:with|has|having|containing|including|that have|that include|only)\s+(?:an?\s+)?(?:images?|photos?|pictures?|pics?)\b|\b(?:images?|photos?|pictures?|pics?)\s+only\b|\bonly\s+(?:images?|photos?|pictures?)\b/gi, () => { filters.media = 'images'; });
    take(/\b(?:with|has|having|containing|including|that have|that include)\s+media\b|\bmedia only\b/gi, () => { filters.media = 'media'; });
    take(/\b(?:with|has|having|containing|including|that have|that include)\s+(?:a\s+)?links?\b/gi, () => { filters.links = true; });
    take(/\b(?:no|exclude|excluding|without|not|hide|skip)\s+replies\b/gi, () => { filters.excludeReplies = true; });
    take(/\b(?:no|exclude|excluding|without|not|hide|skip)\s+(?:retweets|rts|reposts)\b|\boriginal(?:s| tweets| posts)? only\b/gi, () => { filters.excludeRetweets = true; });
    take(new RegExp(`\\bin (${Object.keys(LANGS).join('|')})\\b`, 'gi'), (_, language) => { filters.lang = LANGS[language.toLowerCase()]; });
    take(/\b(?:sorted?|order(?:ed)?|rank(?:ed)?)\s+by\s+(likes?|faves?|hearts?|retweets?|reposts?|rts?|views?|impressions?|date|newest|recency|latest|relevance)\b/gi, (_, key) => { sort = SORTS[key.toLowerCase()] || sort; });
    take(/\b(most liked|top liked|most retweeted|most reposted|most viewed|newest|latest|most recent)\b/gi, (_, key) => { sort = SORTS[key.toLowerCase()] || sort; });
    text = text.replace(/\b(?:show me|find me|find|search for|search|look for|looking for|give me|get me|pull|fetch)\b/gi, ' ');
    text = text.replace(/\b(?:tweets?|posts?|x posts?)\s+(?:about|on|mentioning|regarding|related to)\b/gi, ' ');
    text = text.replace(/\b(?:on|from)\s+(?:twitter|x)(?:\.com)?\b/gi, ' ');
    text = text.replace(/\b(?:tweets?|posts?|please)\b/gi, ' ');
    let keywords = text.replace(/\s{2,}/g, ' ').trim();
    for (let previous = ''; previous !== keywords;) { previous = keywords; keywords = keywords.replace(/^(?:and|with|that|which|about|on|of|for|the|,)\s+|\s+(?:and|with|that|which|about|on|of|for|the|,)$/gi, '').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim(); }
    const lone = /^@(\w{1,15})$/.exec(keywords);
    if (lone && !filters.from) { filters.from = lone[1]; keywords = ''; }
    for (const key of Object.keys(filters)) if (!filters[key]) delete filters[key];
    return { query: formatQuery(keywords, filters), keywords, filters, sort, url: filters.url || '' };
  }
  function formatQuery(keywords, filters) {
    const parts = [];
    if (keywords && !filters.url) parts.push(keywords);
    if (filters.from) parts.push(`from:${filters.from}`);
    if (filters.to) parts.push(`to:${filters.to}`);
    for (const [key, operator] of CANONICAL) if (filters[key]) parts.push(`${operator}:${filters[key]}`);
    if (filters.since) parts.push(`since:${filters.since}`);
    if (filters.until) parts.push(`until:${filters.until}`);
    if (filters.media) parts.push(`filter:${filters.media}`);
    if (filters.links) parts.push('filter:links');
    if (filters.excludeReplies) parts.push('-filter:replies');
    if (filters.excludeRetweets) parts.push('-filter:retweets');
    if (filters.lang) parts.push(`lang:${filters.lang}`);
    return [filters.url, ...parts].filter(Boolean).join(' ');
  }
  function applyTwitterFilters(input, overrides = {}, today) {
    const parsed = parseTwitterQuery(input, today);
    const filters = { ...parsed.filters };
    for (const key of ['media', 'from', 'minLikes', 'minViews', 'since', 'until', 'excludeReplies', 'excludeRetweets']) {
      if (Object.hasOwn(overrides, key)) {
        if (overrides[key] && overrides[key] !== 'all') filters[key] = overrides[key];
        else delete filters[key];
      }
    }
    const normalized = parseTwitterQuery(formatQuery(parsed.keywords, filters), today);
    if (normalized.filters.since && normalized.filters.until && normalized.filters.since >= normalized.filters.until) throw new Error('Until must be after Since. The Until date is exclusive.');
    return { ...normalized, sort: parsed.sort };
  }
  function matchesKeywords(text, keywords) {
    const lower = String(text || '').toLowerCase();
    const terms = String(keywords || '').match(/-?"[^"]+"|\S+/g) || [];
    if (!terms.length) return true;
    const groups = [[]];
    for (const term of terms) { if (term === 'OR') groups.push([]); else groups[groups.length - 1].push(term); }
    return groups.some(group => group.length && group.every(term => {
      const negate = term.startsWith('-');
      const needle = term.replace(/^-/, '').replace(/^"|"$/g, '').toLowerCase();
      return !needle || lower.includes(needle) !== negate;
    }));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { parseTwitterQuery, matchesKeywords, applyTwitterFilters };
  else root.twitterQuery = { parseTwitterQuery, matchesKeywords, applyTwitterFilters };
})(globalThis);
