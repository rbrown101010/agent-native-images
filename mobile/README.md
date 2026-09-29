# Agent Native Images — mobile

The iOS/Android version of the Agent Native Images desktop app, built with Expo SDK 57.

It keeps the desktop feature set:

- Google Images search through Serper, with All / Transparent / Icons filters
- AI search: a visual brief becomes several concrete image queries (`openai/gpt-4.1-nano` through Vercel AI Gateway), one tab per query
- Manual multi-search with `;`-separated queries
- Image generation with GPT Image 2 through AI Gateway — 10 aspect ratios, Fast/Standard/High quality, up to 8 reference images, and a queue that survives app restarts
- Copy, save to Photos, save to an on-device library, and remove.bg background removal

## Running

```sh
npm install
npx expo start --ios   # or --android
```

API keys are entered in the Settings tab and stored in the device keychain (`expo-secure-store`). During development they can be preloaded from a local `.env` (never committed):

```sh
EXPO_PUBLIC_SERPER_API_KEY=...
EXPO_PUBLIC_AI_GATEWAY_API_KEY=...
EXPO_PUBLIC_REMOVEBG_API_KEY=...
```

Keys entered in Settings always take precedence, and the `.env` fallback is only read in development builds.

## Layout

```
App.tsx                 tab shell (Search, Generate, Library, Settings)
src/lib/api.ts          Serper, AI Gateway, remove.bg calls
src/lib/generations.ts  generation queue, persisted to generations.json
src/lib/storage.ts      PNG normalization, on-device image library
src/lib/actions.ts      copy, save to Photos, save to library, cutout
src/screens/            Search, Generate, Library, Settings
```
