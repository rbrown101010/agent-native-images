const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const TITLE_LIMIT = 200, BODY_LIMIT = 200000;
const uuid = /^[a-f0-9-]{36}$/;
function clean(value, limit, name) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`Invalid note ${name}.`);
  if (value.length > limit) throw new Error(`Keep the note ${name} under ${limit.toLocaleString()} characters.`);
  return value.replace(/\r\n?/g, '\n');
}

class NotesStore {
  constructor(root, { changed = () => {} } = {}) {
    this.file = path.join(root, 'notes.json');
    this.changed = changed; this.entries = []; this.tail = Promise.resolve();
  }
  async init() {
    try { const data = JSON.parse(await fs.readFile(this.file, 'utf8')); this.entries = Array.isArray(data) ? data.filter(note => note && uuid.test(String(note.id))) : []; }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Your notes could not be read. The notes file is still on disk.'); }
    this.sort();
  }
  sort() { this.entries.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))); }
  list() { return structuredClone(this.entries); }
  async persist() { await fs.writeFile(this.file + '.tmp', JSON.stringify(this.entries), { mode: 0o600 }); await fs.rename(this.file + '.tmp', this.file); }
  mutate(fn) {
    const result = this.tail.then(async () => {
      const previous = structuredClone(this.entries);
      try { const value = fn(); this.sort(); await this.persist(); this.changed(); return structuredClone(value); }
      catch (error) { this.entries = previous; throw error; }
    });
    this.tail = result.catch(() => {}); return result;
  }
  async save(value = {}) {
    const title = clean(value.title, TITLE_LIMIT, 'title').trim();
    const body = clean(value.body, BODY_LIMIT, 'body');
    if (value.id !== undefined && value.id !== null && !uuid.test(String(value.id))) throw new Error('Invalid note.');
    return this.mutate(() => {
      const now = new Date().toISOString();
      if (value.id) {
        const note = this.entries.find(item => item.id === value.id);
        if (!note) throw new Error('This note no longer exists.');
        if (note.title !== title || note.body !== body) Object.assign(note, { title, body, updatedAt: now });
        return note;
      }
      const note = { id: randomUUID(), title, body, createdAt: now, updatedAt: now };
      this.entries.unshift(note); return note;
    });
  }
  async remove(id) {
    if (!uuid.test(String(id))) throw new Error('Invalid note.');
    return this.mutate(() => {
      const note = this.entries.find(item => item.id === id);
      if (!note) throw new Error('This note no longer exists.');
      this.entries = this.entries.filter(item => item.id !== id); return note;
    });
  }
}
module.exports = { NotesStore, TITLE_LIMIT, BODY_LIMIT };
