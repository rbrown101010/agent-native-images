# Agent Native Images

A small desktop launcher for finding images fast. Google Images search through Serper, independent search tabs, native clipboard, Downloads, one-click background removal through remove.bg, a parallel GPT Image 2 generator through Vercel AI Gateway, X (Twitter) search with tweet image and video downloads through Scrape Creators, and a notes tab for prompts and reminders.

Built with Electron and plain JavaScript. No web server, framework build, account, or hosted backend. The charcoal palette and Geist typography follow Agent Native's visual style.

## Use

- **⌘⇧Space** shows or hides the launcher. Change it in Settings if another app already uses it.
- **⌘T** opens a search tab immediately. Other tabs keep loading in the background.
- Type `monkey; banana; jungle` and press **Enter** to launch each search in a separate tab. Empty fields and repeated queries are skipped. Up to 24 searches per batch.
- Describe the visuals you need and press **⌘Enter** or click **AI search**. A lightweight GPT-4.1 nano model returns only a semicolon-separated list, which immediately launches as parallel searches (up to 12). Manual searches never call AI.
- Search all images, transparent images, or icons. Every image fits fully inside its cell without cropping.
- Hover an image for **Copy**, **Save**, or **Remove BG**. The same actions appear in the full preview. **Remove BG** makes a sticker with a small white outline following the subject and a transparent background. The outline is included in copied and saved PNGs.
- **Copy** places a real PNG image on the native clipboard and adds it to Saved.
- PNG, JPEG, WebP, AVIF, SVG, GIF, and TIFF are converted to PNG with transparency preserved. SVG icons render at a minimum 1024 pixels on their longest edge; animated formats use the first frame.
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
| ⌘N | New note |

## Image generator

Use the image-with-sparkle icon below Search in the left rail. The generator fills the workspace with a minimal image grid and keeps the prompt box at the bottom.

- Type a prompt and press **Enter** to generate; **Shift Enter** adds a line. The prompt and reference chips stay in place after submitting, ready to make another variation. Press Enter again for another independent generation. **Clear** (top right of the composer) or **⌘Backspace** clears only the prompt and references. Keep submitting prompts while earlier images generate. Four jobs can run concurrently, with additional jobs queued. Newest submissions stay at the top left even when results finish out of order.
- Attach or paste an image, drop files on the prompt, or drag a grid image into it. Up to eight reference images are sent with the prompt to GPT Image 2.
- Type **@** to choose an image from Saved. Selected references appear as image-and-name chips above the prompt and can be removed individually; the typed @ mention is removed from the prompt.
- Choose common ratios: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 4:5, 5:4, or 21:9, with Fast, Standard, or High quality.
- Hover any search result or saved image and use **Add to image generator** to keep it in the generator grid. Imported and generated images both support reference reuse, previews, Copy, and Save.
- The grid and prompt draft persist locally. Failed jobs show their error and an explicit Retry action. Jobs interrupted by quitting are not automatically resubmitted.

Generation uses `openai/gpt-image-2` by default, configurable with `IMAGE_MODEL`. Prompts and attached references are sent through Vercel AI Gateway and use its credits. Generated images are kept locally; **Save** additionally puts them in Downloads.

## X (Twitter) search

The **Social** (X) icon in the left rail finds tweets through your [Scrape Creators](https://scrapecreators.com/) key and shows each tweet's likes, reposts, replies, views, text, images, and videos.

- **⌘T** or **+** opens an independent Social search tab; **⌘W** closes it. Start another search while earlier tabs load. Semicolon-separated queries open separate tabs, with per-tab filters and results restored on restart.
- Use the filter icon for **All / Videos / Images**, author, minimum likes/views, Since/Until dates, and excluding replies/reposts. Until is exclusive. Selected filters also apply to **AI search** and cannot be overwritten by its response.
- Type plain English and press **Enter**. Filters become X search operators deterministically, so `ai agents over 400 likes last week with video` runs as `ai agents min_faves:400 since:2026-09-11 filter:videos`, and the exact query appears under the search box. Understood: minimum likes, reposts, replies, or views (`400+ likes`, `over 1k retweets`, `10k views`), dates (`last 3 days`, `this month`, `yesterday`, `since 2026-09-01`, `in 2025`), `from @handle`, `to @handle`, `with video`, `with images`, `with links`, `no replies`, `no retweets`, `in english`, and `sorted by views`. Operators typed directly (`min_faves:`, `from:`, `since:`, `until:`, `filter:videos`, `-filter:replies`, `lang:`) work as on X, and a pasted tweet URL opens that tweet.
- **AI search** (⌘Enter) sends a looser description to your AI Gateway model, which writes the query; the same deterministic normalization then runs on its output.
- Keyword searches use Google (through Scrape Creators) to find tweet URLs and then fetch each tweet from X, so the minimum-like and date filters are checked against real counts. This is discovery of Google-indexed public posts, not an exhaustive native X search. Media and other filters are checked on retrieved posts. When a page has no matches the app loads up to two more pages automatically, and **Load more tweets** continues from there. `from:@handle` reads that account's top tweets directly, which X limits to about 100.
- Sort by likes, reposts, views, or recency without searching again.
- Hover an image for **Copy** (a PNG on the clipboard, kept in Saved) or **Save** (Downloads), or click it for a full preview. Hover a video for **Download** (the best MP4 to Downloads) or **Copy**, which puts the MP4 on the clipboard as a file to paste into Finder, Messages, Slack, or a video editor. **Copy text** copies the tweet, and the arrow opens it on X.
- Each search spends Scrape Creators credits: one per Google page plus one per tweet that is not already cached. Videos over 400 MB fall back to a smaller variant.

## Notes

Use the note icon in the left rail, or press **⌘N** anywhere in the app, to keep short notes beside your images: prompts, hooks, links, and reminders you want at hand later.

- A new note opens with the title focused. Press **Enter** to move into the text. Notes save on their own as you type, and the footer shows when the last save happened.
- The list on the left shows every note, most recently edited first, with its title or first line and a short excerpt. Click a note to open it, or type in the search box (**⌘L** in Notes) to filter by any word in the title or text.
- **Copy** puts the note text on the clipboard. **Delete** asks once more before removing a note.
- Notes are stored in `notes.json` inside the app's local data folder, persist across restarts, and never leave your Mac.

## Run locally

Requires Node.js 22.12 or later. macOS is the verified platform.

```sh
npm ci
npm start
```

For AI search, add an [AI Gateway](https://vercel.com/ai-gateway) key in Settings. The model defaults to `openai/gpt-4.1-nano`; set `AI_MODEL` when launching to override it. Launching once with `AI_GATEWAY_API_KEY` saves that key in encrypted local storage for future launches.

Enter your own [Serper](https://serper.dev/), [remove.bg](https://www.remove.bg/api), and [Scrape Creators](https://scrapecreators.com/) API keys in Settings. Launching once with `SCRAPECREATORS_API_KEY` set stores that key like the Gateway key. These services may charge for use. Keys are encrypted locally using Electron safeStorage backed by the macOS Keychain. They never go into renderer code or this repository.

AI search descriptions go to Vercel AI Gateway. Image searches go to Serper. Source images are fetched from their original host when copied, saved, or processed. Background removal uploads the selected image to remove.bg. If the original returns a web page, blocks downloads, times out, or cannot be decoded, the app retries through its browser session/cache, then tries the displayed preview and thumbnail. Available image bytes are converted to PNG; the success message says “preview quality” when a preview was used. If neither the original nor preview is accessible, refresh the search and try again.

Local data lives in `~/Library/Application Support/Agent Native Images/`. Keep that directory private: it contains your library, notes, downloaded tweet videos, search session, image cache, and encrypted credentials.

## Package a Mac app

```sh
npm run package
```

The Apple Silicon app is created at `release/Agent Native Images-darwin-arm64/Agent Native Images.app`. Copy it to Applications and open it. For Intel Macs, change `--arch=arm64` to `--arch=x64` in the package command. This is a local build, without a Developer ID signature or notarization.

## Checks

```sh
npm test
npm run test:batch
node test/reuse-desktop.cjs
node test/generator-desktop.cjs
node test/notes-desktop.cjs
node test/twitter-desktop.cjs
node test/social-tabs-desktop.cjs
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
- `image-formats.cjs`: asynchronous format conversion, SVG rasterization, and orientation handling.
- `image-generation.cjs`: Gateway generation and reference editing requests.
- `generation-store.cjs`: persistent gallery and bounded parallel job queue.
- `notes-store.cjs`: serialized note writes with atomic persistence.
- `twitter.cjs`: Scrape Creators requests, tweet normalization, count-based filtering, AI query planning, and bounded, MP4-validated downloads.
- `renderer/twitter-query.js`: deterministic plain-English to X operator parser shared by both processes.
- `library.cjs`: serialized library writes, collision-safe filenames, and Downloads.
- `preload.cjs`: narrow context-isolated renderer bridge.
- `renderer/`: the local interface. All remote text is inserted as text, not HTML.
- `scripts/make-icons.swift`: app icon source.

The renderer runs sandboxed with Node disabled, a restrictive content security policy, blocked navigation, and denied permission requests. API keys stay in the main process. Geist is included under its license in `assets/Geist-LICENSE.txt`.

## Jev image ranking (experimental)

Settings has **Jev mode** and **Jev overlay**. Mode waits one second after search results appear, then scores actual images in up to four concurrent requests and animates cards into descending fit order as answers arrive. Scores combine relevance (40%), visual clarity (30%), and suitability as an Excalidraw sticker/icon (30%). Overlay shows fit out of 100 and the sticker question's model-reported confidence when supplied, with dimension scores in its tooltip. Turning mode off restores search order. Reduced motion disables movement. Failed ranking leaves images usable and displays the error.

Image bytes go through Vercel AI Gateway's TypeSafe-compatible endpoint, using `assets` and `TypeSafe-Danger-Zone-Images: true` from [TypeSafe's image docs](https://docs.typesafe.ai/images). Keys stay in the main process. The default model is the catalog-listed `typesafe-ai/jev`; `JEV_MODEL` can override it when Gateway exposes a newer ID. The native provider announced Jev 1.14 (`jev-preview`) on October 14; Gateway's catalog has not yet confirmed that version. Both native Jev 1.13 and 1.14 support the experimental image flag.

Verification: unit tests and desktop tests with a mock provider pass. Live multimodal Gateway verification is pending: the available Gateway key returned HTTP 402 (insufficient credits). Neither image forwarding nor the underlying served version has been verified. Jev mode defaults off. Test with `node test/jev-desktop.cjs`.
