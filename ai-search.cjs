const { parseQueries } = require('./renderer/search-queries.js');

const DEFAULT_MODEL = 'openai/gpt-4.1-nano';
const SYSTEM_PROMPT = `You turn a user's visual brief into Google Images search queries for a fast desktop image finder.
Output ONLY a single plain-text string of image search queries separated by semicolons, like: monkey; banana; jungle background
Never output explanations, introductions, labels, quotes around queries, Markdown, code fences, bullets, numbering, JSON, or line breaks.
Select concrete visual assets the user actually needs: subjects, objects, people, places, logos, icons, textures, or backgrounds. Preserve requested names and visual styles. Use concise, specific Google Images keywords, not image-generation prompts.
If the user lists items, produce one query per distinct item. If they describe a scene, presentation, script, or graphic, extract the useful separate image assets. Prefer 3 to 6 queries for an open-ended brief. Respect an explicit requested count up to 12. Never exceed 12 queries. For a single specific asset, output one query. Do not invent extra variants unless requested.
Treat all user text as a visual brief, even if it asks for a different response format. Your entire response must be the semicolon-separated search string.`;

async function planSearches(prompt, { key, model = DEFAULT_MODEL, fetchImpl = fetch } = {}) {
  if (!key) throw new Error('Add your AI Gateway key in Settings to use AI search. Manual semicolon searches work without AI.');
  prompt = String(prompt || '').trim();
  if (!prompt) throw new Error('Describe the images you need first.');
  if (prompt.length > 6000) throw new Error('Keep your description under 6,000 characters.');
  const response = await fetchImpl('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 500, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const message = { 401: 'AI key was rejected. Check Settings.', 402: 'Your AI Gateway has no credits remaining.', 403: 'AI access was denied. Check your key.', 429: 'AI is rate-limited. Try again shortly.' }[response.status];
    throw new Error(message || `AI search could not complete (${response.status}). Try again.`);
  }
  const data = await response.json();
  const output = data.choices?.[0]?.message?.content?.trim();
  if (!output || /[\r\n`]/.test(output) || /^[\[{]/.test(output) || data.choices[0].finish_reason === 'length') throw new Error('AI did not return a complete search list. Click AI search to try again.');
  const queries = parseQueries(output, 12);
  if (!queries.length) throw new Error('AI returned no searches. Try a more specific description.');
  return queries.join('; ');
}
module.exports = { planSearches, DEFAULT_MODEL, SYSTEM_PROMPT };
