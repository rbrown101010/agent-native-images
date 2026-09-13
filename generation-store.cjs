const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SIZES, QUALITIES } = require('./image-generation.cjs');

class GenerationStore {
  constructor(root, { generate, changed = () => {}, concurrency = 4 }) {
    this.file = path.join(root, 'generations.json');
    this.generate = generate; this.changed = changed; this.concurrency = concurrency;
    this.entries = []; this.running = new Set(); this.tail = Promise.resolve();
  }
  async init() {
    try { this.entries = JSON.parse(await fs.readFile(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('The generation library could not be read. Your images are still on disk.'); }
    for (const item of this.entries) if (['queued', 'generating'].includes(item.status)) { item.status = 'error'; item.error = 'Interrupted when the app closed. Retry to generate again.'; }
    await this.persist();
  }
  list() { return structuredClone(this.entries); }
  async persist() { await fs.writeFile(this.file + '.tmp', JSON.stringify(this.entries), { mode: 0o600 }); await fs.rename(this.file + '.tmp', this.file); }
  mutate(fn) {
    const result = this.tail.then(async () => {
      const previous = structuredClone(this.entries);
      try { const value = fn(); await this.persist(); this.changed(); return structuredClone(value); }
      catch (error) { this.entries = previous; throw error; }
    });
    this.tail = result.catch(() => {}); return result;
  }
  async add({ prompt, references = [], size = '1024x1024', quality = 'medium' }) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 6000) throw new Error('Enter a prompt of up to 6,000 characters.');
    if (!SIZES.has(size) || !QUALITIES.has(quality) || !Array.isArray(references) || references.length > 8) throw new Error('Invalid generation options.');
    const job = await this.mutate(() => {
      if (this.entries.filter(item => ['queued', 'generating'].includes(item.status)).length >= 24) throw new Error('Let a few generations finish before adding more.');
      const entry = { id: randomUUID(), prompt: prompt.trim(), references, size, quality, status: 'queued', createdAt: new Date().toISOString() };
      this.entries.unshift(entry); return entry;
    });
    this.pump(); return job;
  }
  async import(asset) {
    return this.mutate(() => {
      const existing = this.entries.find(item => item.asset?.id === asset.id);
      if (existing) return existing;
      const entry = { id: randomUUID(), prompt: asset.title || asset.name || 'Imported image', asset, status: 'ready', imported: true, createdAt: new Date().toISOString() };
      this.entries.unshift(entry); return entry;
    });
  }
  async retry(id) {
    await this.mutate(() => {
      const job = this.entries.find(item => item.id === id);
      if (!job || job.status !== 'error') throw new Error('This generation cannot be retried.');
      job.status = 'queued'; job.error = ''; job.createdAt = new Date().toISOString();
      this.entries = [job, ...this.entries.filter(item => item.id !== id)];
    });
    this.pump();
  }
  remove(id) {
    return this.mutate(() => {
      const job = this.entries.find(item => item.id === id);
      if (job && ['queued', 'generating'].includes(job.status)) throw new Error('Wait for this generation to finish.');
      this.entries = this.entries.filter(item => item.id !== id);
    });
  }
  pump() {
    for (const job of this.entries.filter(item => item.status === 'queued')) {
      if (this.running.size >= this.concurrency) break;
      if (this.running.has(job.id)) continue;
      this.running.add(job.id);
      this.execute(job).catch(() => {}).finally(() => { this.running.delete(job.id); this.pump(); });
    }
  }
  async execute(job) {
    try {
      await this.mutate(() => { this.entries.find(item => item.id === job.id).status = 'generating'; });
      const asset = await this.generate(structuredClone(job));
      await this.mutate(() => { Object.assign(this.entries.find(item => item.id === job.id), { asset, status: 'ready', error: '' }); });
    } catch (error) {
      await this.mutate(() => { const entry = this.entries.find(item => item.id === job.id); if (entry) { entry.status = 'error'; entry.error = error.name === 'TimeoutError' ? 'Generation timed out. Retry when ready.' : error.message || 'Generation failed. Retry when ready.'; } });
    }
  }
}
module.exports = { GenerationStore };
