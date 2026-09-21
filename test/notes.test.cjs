const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { NotesStore } = require('../notes-store.cjs');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('notes save, update in place, order by last edit, validate input, remove and persist across restarts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-store-'));
  try {
    let changes = 0;
    const store = new NotesStore(root, { changed: () => changes++ });
    await store.init();
    assert.deepEqual(store.list(), []);
    const first = await store.save({ title: '  Hooks ', body: 'Line one\r\nLine two' });
    assert.equal(first.title, 'Hooks'); assert.equal(first.body, 'Line one\nLine two'); assert.match(first.id, /^[a-f0-9-]{36}$/);
    await tick();
    const second = await store.save({ body: 'untitled body' });
    assert.equal(second.title, '');
    assert.deepEqual(store.list().map(note => note.id), [second.id, first.id]);
    await tick();
    const unchanged = await store.save({ id: second.id, body: 'untitled body', title: '' });
    assert.equal(unchanged.updatedAt, second.updatedAt);
    const updated = await store.save({ id: first.id, title: 'Hooks', body: 'Edited' });
    assert.notEqual(updated.updatedAt, first.updatedAt); assert.equal(updated.createdAt, first.createdAt);
    assert.deepEqual(store.list().map(note => note.id), [first.id, second.id]);
    await assert.rejects(store.save({ id: 'nope', body: 'x' }), /Invalid note/);
    await assert.rejects(store.save({ id: '00000000-0000-0000-0000-000000000000', body: 'x' }), /no longer exists/);
    await assert.rejects(store.save({ title: 'x'.repeat(201) }), /title/);
    await assert.rejects(store.save({ body: 5 }), /Invalid note body/);
    await assert.rejects(store.remove('00000000-0000-0000-0000-000000000000'), /no longer exists/);
    await assert.rejects(store.remove('../notes'), /Invalid note/);
    assert.deepEqual(store.list().map(note => note.id), [first.id, second.id]);
    const removed = await store.remove(second.id);
    assert.equal(removed.id, second.id);
    assert.deepEqual(store.list().map(note => note.id), [first.id]);
    assert.ok(changes >= 4);
    const reopened = new NotesStore(root);
    await reopened.init();
    assert.deepEqual(reopened.list(), store.list());
    reopened.list()[0].body = 'mutated';
    assert.equal(reopened.list()[0].body, 'Edited');
    assert.deepEqual(await fs.readdir(root), ['notes.json']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('a corrupt notes file is reported instead of silently replaced', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-store-'));
  try {
    await fs.writeFile(path.join(root, 'notes.json'), '{not json');
    const store = new NotesStore(root);
    await assert.rejects(store.init(), /could not be read/);
    assert.equal(await fs.readFile(path.join(root, 'notes.json'), 'utf8'), '{not json');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
