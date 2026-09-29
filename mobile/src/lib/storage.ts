import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type LibraryEntry = {
  id: string;
  title: string;
  query: string;
  uri: string;
  sourceUrl: string;
  source: string;
  cutout: boolean;
  createdAt: number;
};

const imagesDir = new Directory(Paths.document, 'images');
const libraryFile = new File(Paths.document, 'library.json');

function ensureDirs() {
  imagesDir.create({ intermediates: true, idempotent: true });
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readJson<T>(file: File, fallback: T): T {
  if (!file.exists) return fallback;
  try {
    return JSON.parse(file.textSync()) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: File, value: unknown) {
  if (!file.exists) file.create({ intermediates: true, overwrite: true });
  file.write(JSON.stringify(value));
}

/** Downloads any remote image and normalizes it to a PNG stored in the app cache. */
export async function fetchAsPng(url: string): Promise<{ uri: string; base64: string }> {
  const context = ImageManipulator.manipulate(url);
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.PNG, base64: true });
  return { uri: result.uri, base64: result.base64 ?? '' };
}

export function writePng(base64: string): string {
  ensureDirs();
  const file = new File(imagesDir, `${newId()}.png`);
  file.create({ intermediates: true, overwrite: true });
  file.write(base64ToBytes(base64));
  return file.uri;
}

export async function readPngBase64(uri: string): Promise<string> {
  const file = new File(uri);
  if (file.exists) return file.base64();
  return (await fetchAsPng(uri)).base64;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let offset = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const chunk =
      (BASE64_ALPHABET.indexOf(clean[index]) << 18) |
      (BASE64_ALPHABET.indexOf(clean[index + 1]) << 12) |
      ((index + 2 < clean.length ? BASE64_ALPHABET.indexOf(clean[index + 2]) : 0) << 6) |
      (index + 3 < clean.length ? BASE64_ALPHABET.indexOf(clean[index + 3]) : 0);
    bytes[offset++] = (chunk >> 16) & 255;
    if (index + 2 < clean.length) bytes[offset++] = (chunk >> 8) & 255;
    if (index + 3 < clean.length) bytes[offset++] = chunk & 255;
  }
  return bytes.subarray(0, offset);
}

type Listener = () => void;

class LibraryStore {
  private entries: LibraryEntry[] = readJson<LibraryEntry[]>(libraryFile, []);
  private listeners = new Set<Listener>();

  list(): LibraryEntry[] {
    return this.entries;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(entries: LibraryEntry[]) {
    this.entries = entries;
    writeJson(libraryFile, entries);
    this.listeners.forEach(listener => listener());
  }

  add(entry: Omit<LibraryEntry, 'id' | 'createdAt'>): LibraryEntry {
    const existing = this.entries.find(
      item => item.sourceUrl === entry.sourceUrl && item.query === entry.query && item.cutout === entry.cutout
    );
    if (existing) return existing;
    const saved: LibraryEntry = { ...entry, id: newId(), createdAt: Date.now() };
    this.commit([saved, ...this.entries]);
    return saved;
  }

  remove(id: string) {
    this.commit(this.entries.filter(entry => entry.id !== id));
  }
}

export const library = new LibraryStore();
