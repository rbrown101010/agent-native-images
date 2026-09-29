import * as SecureStore from 'expo-secure-store';

export type KeyName = 'serper' | 'removebg' | 'gateway';
export type Keys = Record<KeyName, string>;

export const KEY_NAMES: KeyName[] = ['serper', 'removebg', 'gateway'];

const STORE_KEYS: Keys = {
  serper: 'agentnative.serper',
  removebg: 'agentnative.removebg',
  gateway: 'agentnative.gateway'
};

const ENV_KEYS: Keys = {
  serper: process.env.EXPO_PUBLIC_SERPER_API_KEY ?? '',
  removebg: process.env.EXPO_PUBLIC_REMOVEBG_API_KEY ?? '',
  gateway: process.env.EXPO_PUBLIC_AI_GATEWAY_API_KEY ?? ''
};

let cache: Keys = { serper: '', removebg: '', gateway: '' };

export function keys(): Keys {
  return cache;
}

export async function loadKeys(): Promise<Keys> {
  const entries = await Promise.all(
    KEY_NAMES.map(async name => {
      const stored = await SecureStore.getItemAsync(STORE_KEYS[name]);
      return [name, stored || (__DEV__ ? ENV_KEYS[name] : '')] as const;
    })
  );
  cache = Object.fromEntries(entries) as Keys;
  return cache;
}

export async function saveKeys(next: Partial<Keys>): Promise<Keys> {
  for (const name of KEY_NAMES) {
    const value = next[name];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) await SecureStore.setItemAsync(STORE_KEYS[name], trimmed);
    else await SecureStore.deleteItemAsync(STORE_KEYS[name]);
    cache = { ...cache, [name]: trimmed };
  }
  return cache;
}
