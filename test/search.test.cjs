const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseQueries } = require('../renderer/search-queries.js');
const { planSearches } = require('../ai-search.cjs');

test('manual batches trim empty fields and duplicate queries without splitting commas', () => {
  assert.deepEqual(parseQueries(' monkey ;; banana ; MONKEY; New York, USA； jungle '), ['monkey', 'banana', 'New York, USA', 'jungle']);
  assert.deepEqual(parseQueries('; ;'), []);
  assert.throws(() => parseQueries('x'.repeat(301)), /300 characters/);
  assert.throws(() => parseQueries(Array.from({ length: 25 }, (_, i) => `image ${i}`).join(';')), /24 searches/);
});
test('AI returns only normalized search strings and rejects incomplete or structured output', async () => {
  const complete = content => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
  assert.equal(await planSearches('jungle graphic', { key: 'test-only', fetchImpl: complete('monkey; banana; jungle') }), 'monkey; banana; jungle');
  for (const text of ['```monkey; banana```', '["monkey"]', 'Here are searches:\nmonkey; banana', '']) {
    await assert.rejects(planSearches('brief', { key: 'test-only', fetchImpl: complete(text) }), /complete search list/);
  }
  await assert.rejects(planSearches('brief', { key: 'test-only', fetchImpl: async () => ({ ok: false, status: 402 }) }), /credits/);
  await assert.rejects(planSearches('brief', {}), /Gateway key/);
});
