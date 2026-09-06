const fs = require('node:fs/promises');
const path = require('node:path');

function titleFor(query) {
  const clean = String(query || 'Image').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 100) || 'Image';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

class Library {
  constructor(root, downloads) {
    this.root = root;
    this.downloads = downloads;
    this.file = path.join(root, 'library.json');
    this.data = { entries: [], counters: {} };
    this.tail = Promise.resolve();
  }
  async init() {
    await fs.mkdir(path.join(this.root, 'images'), { recursive: true });
    await fs.mkdir(this.downloads, { recursive: true });
    try { this.data = JSON.parse(await fs.readFile(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('The saved library could not be read. Your images are still on disk.'); }
  }
  run(task) {
    const result = this.tail.then(task);
    this.tail = result.catch(() => {});
    return result;
  }
  async persist() {
    await fs.writeFile(this.file + '.tmp', JSON.stringify(this.data, null, 2), { mode: 0o600 });
    await fs.rename(this.file + '.tmp', this.file);
  }
  list() { return this.data.entries.map(entry => ({ ...entry })); }
  archive(asset, query) {
    return this.run(async () => {
      const base = titleFor(query);
      const identity = `${base.toLocaleLowerCase()}|${asset.sourceUrl}|${asset.cutout ? 'cutout' : 'original'}`;
      const existing = this.data.entries.find(entry => entry.identity === identity);
      if (existing) return { ...existing };
      const counterKey = base.toLocaleLowerCase();
      const number = (this.data.counters[counterKey] || 0) + 1;
      const entry = { ...asset, identity, query: base, name: `${base} (${number})`, savedAt: new Date().toISOString() };
      const previous = this.data;
      this.data = { entries: [entry, ...previous.entries], counters: { ...previous.counters, [counterKey]: number } };
      try { await this.persist(); } catch (error) { this.data = previous; throw error; }
      return { ...entry };
    });
  }
  download(entry, buffer) {
    return this.run(async () => {
      const current = this.data.entries.find(item => item.id === entry.id && item.identity === entry.identity);
      if (!current) throw new Error('This image is no longer in the library.');
      if (current.downloadPath) {
        try { await fs.access(current.downloadPath); return { ...current }; } catch {}
      }
      let destination;
      for (let attempt = 0; ; attempt++) {
        destination = path.join(this.downloads, `${entry.name}${attempt ? ` - ${attempt + 1}` : ''}.png`);
        try { await fs.writeFile(destination, buffer, { flag: 'wx' }); break; }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      current.downloadPath = destination;
      await this.persist();
      return { ...current };
    });
  }
  remove(id) {
    return this.run(async () => {
      const previous = this.data.entries;
      this.data.entries = previous.filter(entry => entry.id !== id);
      try { await this.persist(); } catch (error) { this.data.entries = previous; throw error; }
    });
  }
}

module.exports = { Library, titleFor };
