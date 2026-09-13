const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { GenerationStore } = require('../generation-store.cjs');
const { generateImage } = require('../image-generation.cjs');
const waitFor = async fn => { for (let n = 0; n < 300; n++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error('Timed out'); };

test('generation and reference edits use Gateway with bounded input and no automatic retries', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] })); };
  await generateImage({ prompt: 'a circle', size: '1536x864' }, { key: 'secret', fetchImpl });
  const result = await generateImage({ prompt: 'a purple circle', references: [Buffer.from('reference')] }, { key: 'secret', fetchImpl });
  assert.equal(result.toString(), 'image'); assert.equal(requests[0].body.size, '1536x864'); assert.match(requests[0].url, /images\/generations$/); assert.match(requests[1].url, /images\/edits$/);
  assert.equal(requests[1].body.images[0].image_url, 'data:image/png;base64,cmVmZXJlbmNl');
  await assert.rejects(generateImage({ prompt: 'x', references: Array(9).fill(Buffer.from('x')) }, { key: 'secret', fetchImpl }), /8 reference/);
  let calls = 0;
  await assert.rejects(generateImage({ prompt: 'x' }, { key: 'secret', fetchImpl: async () => { calls++; return new Response('{}', { status: 429 }); } }), /rate limit/);
  assert.equal(calls, 1);
});

test('four parallel jobs preserve submission order, failures retry, imports and restart persist', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-store-'));
  try {
    const pending = new Map();
    const store = new GenerationStore(root, { generate: job => new Promise((resolve, reject) => pending.set(job.id, { resolve, reject })) });
    await store.init();
    const jobs = [];
    for (let i = 0; i < 5; i++) jobs.push(await store.add({ prompt: `image ${i}` }));
    await waitFor(() => pending.size === 4);
    assert.equal(store.list().filter(job => job.status === 'queued').length, 1);
    pending.get(jobs[2].id).resolve({ id: 'image-2' });
    await waitFor(() => pending.size === 5);
    pending.get(jobs[0].id).reject(new Error('provider unavailable'));
    pending.get(jobs[1].id).resolve({ id: 'image-1' }); pending.get(jobs[3].id).resolve({ id: 'image-3' }); pending.get(jobs[4].id).resolve({ id: 'image-4' });
    await waitFor(() => store.running.size === 0);
    assert.deepEqual(store.list().map(job => job.id), jobs.toReversed().map(job => job.id));
    assert.equal(store.list().find(job => job.id === jobs[0].id).status, 'error');
    pending.delete(jobs[0].id); await store.retry(jobs[0].id); await waitFor(() => pending.has(jobs[0].id));
    pending.get(jobs[0].id).resolve({ id: 'image-0' }); await waitFor(() => store.running.size === 0);
    const imported = await store.import({ id: 'imported', title: 'Reference' }); await store.import({ id: 'imported', title: 'Reference' });
    assert.equal(store.list().length, 6);
    const restarted = new GenerationStore(root, { generate: () => { throw Error('Must not run automatically'); } }); await restarted.init();
    assert.equal(restarted.list()[0].id, imported.id); assert.equal(restarted.list()[1].asset.id, 'image-0');
    await restarted.remove(imported.id); assert.equal(restarted.list().length, 5);
    await fs.writeFile(path.join(root, 'generations.json'), JSON.stringify([{ id: 'unfinished', status: 'generating' }]));
    await restarted.init(); assert.equal(restarted.list()[0].status, 'error'); assert.match(restarted.list()[0].error, /Interrupted/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
