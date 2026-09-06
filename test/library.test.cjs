const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Library, titleFor } = require('../library.cjs');

test('concurrent copy/save naming is unique, durable, and deduplicated', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'images-library-'));
  try {
    const lib = new Library(root, path.join(root, 'Downloads')); await lib.init();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => lib.archive({ id: String(i), sourceUrl: `https://example.org/${i}`, cutout: false }, 'monkey')));
    assert.deepEqual(results.map(item => item.name), Array.from({ length: 12 }, (_, i) => `Monkey (${i + 1})`));
    const duplicate = await lib.archive({ id: 'duplicate', sourceUrl: 'https://example.org/0' }, 'Monkey');
    assert.equal(duplicate.name, 'Monkey (1)');
    const cutout = await lib.archive({ id: 'cutout', sourceUrl: 'https://example.org/0', cutout: true }, 'monkey');
    assert.equal(cutout.name, 'Monkey (13)');
    const next = new Library(root, path.join(root, 'Downloads')); await next.init(); assert.equal(next.list().length, 13);
    await fs.writeFile(path.join(root, 'Downloads', 'Monkey (1).png'), 'existing image');
    const downloaded = await next.download(next.list().find(item => item.id === '0'), Buffer.from('new image'));
    assert.equal(path.basename(downloaded.downloadPath), 'Monkey (1) - 2.png');
    assert.equal(await fs.readFile(path.join(root, 'Downloads', 'Monkey (1).png'), 'utf8'), 'existing image');
    await next.remove('0'); assert.equal(await fs.readFile(downloaded.downloadPath, 'utf8'), 'new image');
    assert.equal(titleFor('../bad/name:*?'), '.. bad name');
    assert.equal(titleFor('  '), 'Image');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
