# Agent Native Images

A small desktop launcher for finding images fast. Google Images search through Serper, independent search tabs, native clipboard, Downloads, and one-click background removal through remove.bg.

Built with Electron and plain JavaScript. No web server, framework build, account, or hosted backend. The charcoal palette and Geist typography follow Agent Native's visual style.

## Use

- **⌘⇧Space** shows or hides the launcher. Change it in Settings if another app already uses it.
- **⌘T** opens a search tab immediately. Other tabs keep loading in the background.
- Type `monkey; banana; jungle` and press **Enter** to launch each search in a separate tab. Empty fields and repeated queries are skipped. Up to 24 searches per batch.
- Describe the visuals you need and press **⌘Enter** or click **AI search**. A lightweight GPT-4.1 nano model returns only a semicolon-separated list, which immediately launches as parallel searches (up to 12). Manual searches never call AI.
- Search all images, transparent images, or icons. Every image fits fully inside its cell without cropping.
- Hover an image for **Copy**, **Save**, or **Remove BG**. The same actions appear in the full preview.
- **Copy** places a real PNG image on the native clipboard and adds it to Saved.
- **Save** writes a PNG to your Downloads folder and adds it to Saved.
- Names follow the search: `Monkey (1).png`, `Monkey (2).png`, and so on. Copying then saving the same image reuses its library entry. A cutout is a separate image.
- Saved images and search tabs persist across restarts. Downloads are never overwritten. Removing a library entry keeps the downloaded file.
- The menu bar icon keeps the app available when the window is closed. Settings includes an optional **Open at login** toggle.

| Shortcut | Action |
| --- | --- |
| ⌘⇧Space | Show / hide |
| ⌘T / ⌘W | New / close search tab |
| ⌘L | Focus search |
| ⌘Enter | AI search from a description |
| ⌘1–8 | Switch search tab |
| ⌘9 | Saved |
| Control Tab | Next tab |
| ↓ from search | Focus first result |
| Arrow keys | Move through results |
| Space / Enter | Preview focused image |
| ← / → in preview | Previous / next image in the current results or filtered Saved view |
| ⌘C / ⌘S | Copy / save focused image or preview |
| B | Remove background of focused image or preview |
| Escape | Close preview or hide launcher |
| ⌘, | Settings |

## Run locally

Requires Node.js 22.12 or later. macOS is the verified platform.

```sh
npm ci
npm start
```

For AI search, add an [AI Gateway](https://vercel.com/ai-gateway) key in Settings. The model defaults to `openai/gpt-4.1-nano`; set `AI_MODEL` when launching to override it. Launching once with `AI_GATEWAY_API_KEY` saves that key in encrypted local storage for future launches.

Enter your own [Serper](https://serper.dev/) and [remove.bg](https://www.remove.bg/api) API keys in Settings. Both services may charge for use. Keys are encrypted locally using Electron safeStorage backed by the macOS Keychain. They never go into renderer code or this repository.

AI search descriptions go to Vercel AI Gateway. Image searches go to Serper. Source images are fetched from their original host when copied, saved, or processed. Background removal uploads the selected image to remove.bg. Some image hosts block downloads; the app reports that failure rather than silently substituting a lower-resolution thumbnail. Unsupported source formats also produce a clear error.

Local data lives in `~/Library/Application Support/Agent Native Images/`. Keep that directory private: it contains your library, search session, image cache, and encrypted credentials.

## Package a Mac app

```sh
npm run package
```

The Apple Silicon app is created at `release/Agent Native Images-darwin-arm64/Agent Native Images.app`. Copy it to Applications and open it. For Intel Macs, change `--arch=arm64` to `--arch=x64` in the package command. This is a local build, without a Developer ID signature or notarization.

## Checks

```sh
npm test
npm run test:batch
```

The batch desktop test checks parallel tab creation, card layout, and AI completion/cancellation using mocked providers, without API charges.

The library test covers concurrent naming, duplicate copy/save actions, persistence, and preserving existing Downloads files.

An opt-in Electron integration check uses real API calls. Point it at a private JSON file **outside this repo** containing `serper` and `removebg` keys:

```sh
IMAGES_CREDENTIALS_FILE=/private/path/keys.json npm run test:desktop
```

Add `TEST_REMOVE_BG=1` to also test background removal and consume a remove.bg credit. Screenshots go to ignored `test-artifacts/`. Test data is isolated in a temporary directory and deleted afterward; the test copies an image to the clipboard.

## Implementation

- `main.cjs`: native window, global shortcut, API requests, clipboard, secure credentials, and restricted IPC.
- `ai-search.cjs`: lightweight AI query planning with a strict semicolon-only prompt.
- `library.cjs`: serialized library writes, collision-safe filenames, and Downloads.
- `preload.cjs`: narrow context-isolated renderer bridge.
- `renderer/`: the local interface. All remote text is inserted as text, not HTML.
- `scripts/make-icons.swift`: app icon source.

The renderer runs sandboxed with Node disabled, a restrictive content security policy, blocked navigation, and denied permission requests. API keys stay in the main process. Geist is included under its license in `assets/Geist-LICENSE.txt`.
