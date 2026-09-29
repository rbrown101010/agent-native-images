import * as Clipboard from 'expo-clipboard';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { removeBackground } from './api';
import { keys } from './keys';
import { library, readPngBase64, writePng } from './storage';

export type ImageRef = {
  uri: string;
  title: string;
  query: string;
  source?: string;
  cutout?: boolean;
};

export async function copyImage(item: ImageRef): Promise<void> {
  await Clipboard.setImageAsync(await readPngBase64(item.uri));
}

export async function saveToPhotos(item: ImageRef): Promise<void> {
  const { status } = await requestPermissionsAsync();
  if (status !== 'granted') throw new Error('Allow photo library access to save images.');
  const local = item.uri.startsWith('file://') ? item.uri : writePng(await readPngBase64(item.uri));
  await Asset.create(local);
}

export async function saveToLibrary(item: ImageRef) {
  const base64 = await readPngBase64(item.uri);
  return library.add({
    title: item.title,
    query: item.query,
    uri: writePng(base64),
    sourceUrl: item.uri,
    source: item.source || '',
    cutout: Boolean(item.cutout)
  });
}

export async function cutout(item: ImageRef) {
  const base64 = await removeBackground(await readPngBase64(item.uri), keys().removebg);
  return library.add({
    title: item.title,
    query: item.query,
    uri: writePng(base64),
    sourceUrl: item.uri,
    source: item.source || '',
    cutout: true
  });
}
