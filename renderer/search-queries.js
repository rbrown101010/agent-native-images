(function (root) {
  function parseQueries(value, limit = 24) {
    const queries = [];
    const seen = new Set();
    for (const piece of String(value || '').split(/[;；]/)) {
      const query = piece.replace(/\s+/g, ' ').trim();
      if (!query) continue;
      if (query.length > 300) throw new Error('Keep each image search under 300 characters. Use AI search for a longer description.');
      if (!seen.has(query.toLocaleLowerCase())) { queries.push(query); seen.add(query.toLocaleLowerCase()); }
    }
    if (queries.length > limit) throw new Error(`Use up to ${limit} searches at a time.`);
    return queries;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { parseQueries };
  else root.searchQueries = { parseQueries };
})(globalThis);
