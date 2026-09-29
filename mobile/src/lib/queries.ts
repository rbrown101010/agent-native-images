export function parseQueries(value: string, limit = 24): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  for (const piece of String(value || '').split(/[;；]/)) {
    const query = piece.replace(/\s+/g, ' ').trim();
    if (!query) continue;
    if (query.length > 300) {
      throw new Error('Keep each image search under 300 characters. Use AI search for a longer description.');
    }
    const seenKey = query.toLocaleLowerCase();
    if (seen.has(seenKey)) continue;
    queries.push(query);
    seen.add(seenKey);
  }
  if (queries.length > limit) throw new Error(`Use up to ${limit} searches at a time.`);
  return queries;
}
