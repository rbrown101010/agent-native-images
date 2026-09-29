import { File, Paths } from 'expo-file-system';
import { generateImage } from './api';
import { keys } from './keys';
import { newId, readPngBase64, writePng } from './storage';

export type GenerationStatus = 'queued' | 'generating' | 'ready' | 'error';

export type Generation = {
  id: string;
  prompt: string;
  size: string;
  quality: string;
  references: string[];
  status: GenerationStatus;
  uri?: string;
  error?: string;
  createdAt: number;
};

const MAX_PENDING = 24;
const CONCURRENCY = 4;
const file = new File(Paths.document, 'generations.json');

type Listener = () => void;

class GenerationStore {
  private jobs: Generation[] = this.restore();
  private listeners = new Set<Listener>();
  private running = 0;

  private restore(): Generation[] {
    if (!file.exists) return [];
    try {
      const jobs = JSON.parse(file.textSync()) as Generation[];
      return jobs.map(job =>
        job.status === 'queued' || job.status === 'generating'
          ? { ...job, status: 'error' as const, error: 'Generation was interrupted. Tap to retry.' }
          : job
      );
    } catch {
      return [];
    }
  }

  list(): Generation[] {
    return this.jobs;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(jobs: Generation[]) {
    this.jobs = jobs;
    if (!file.exists) file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify(jobs));
    this.listeners.forEach(listener => listener());
  }

  private update(id: string, patch: Partial<Generation>) {
    this.commit(this.jobs.map(job => (job.id === id ? { ...job, ...patch } : job)));
  }

  add(input: { prompt: string; size: string; quality: string; references: string[] }): Generation {
    const pending = this.jobs.filter(job => job.status === 'queued' || job.status === 'generating').length;
    if (pending >= MAX_PENDING) throw new Error(`Wait for some of the ${MAX_PENDING} queued images to finish.`);
    if (input.references.length > 8) throw new Error('Use up to 8 reference images.');
    const job: Generation = { ...input, id: newId(), status: 'queued', createdAt: Date.now() };
    this.commit([job, ...this.jobs]);
    this.drain();
    return job;
  }

  retry(id: string) {
    this.update(id, { status: 'queued', error: undefined });
    this.drain();
  }

  remove(id: string) {
    this.commit(this.jobs.filter(job => job.id !== id));
  }

  private drain() {
    while (this.running < CONCURRENCY) {
      const next = [...this.jobs].reverse().find(job => job.status === 'queued');
      if (!next) return;
      this.running += 1;
      this.update(next.id, { status: 'generating' });
      void this.run(next).finally(() => {
        this.running -= 1;
        this.drain();
      });
    }
  }

  private async run(job: Generation) {
    try {
      const references = await Promise.all(job.references.map(uri => readPngBase64(uri)));
      const base64 = await generateImage(
        { prompt: job.prompt, size: job.size, quality: job.quality, references },
        keys().gateway
      );
      this.update(job.id, { status: 'ready', uri: writePng(base64), error: undefined });
    } catch (error) {
      this.update(job.id, { status: 'error', error: error instanceof Error ? error.message : 'Generation failed.' });
    }
  }
}

export const generations = new GenerationStore();
