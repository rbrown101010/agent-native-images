const { app, BrowserWindow, ipcMain, clipboard, ClipboardItem, nativeImage, globalShortcut, Menu, Tray, shell, safeStorage, protocol, net, screen, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { Library } = require('./library.cjs');
const { GenerationStore } = require('./generation-store.cjs');
const { generateImage, IMAGE_MODEL } = require('./image-generation.cjs');
const { planSearches, DEFAULT_MODEL } = require('./ai-search.cjs');
const { normalizeImage } = require('./image-formats.cjs');

app.setName('Agent Native Images');
const testMode = process.argv.includes('--test-mode');
const testRoot = process.argv.find(arg => arg.startsWith('--test-data='))?.split('=').slice(1).join('=');
if (testMode && testRoot) app.setPath('userData', testRoot);
else app.setPath('userData', path.join(app.getPath('appData'), 'Agent Native Images'));
protocol.registerSchemesAsPrivileged([{ scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, tray, library, generations, quitting = false, shortcutActive = false;
let secrets = {}, preferences = { shortcut: 'CommandOrControl+Shift+Space', launchAtLogin: false };
const assets = new Map();
const assetJobs = new Map();
const removalJobs = new Map();
const root = app.getPath('userData');
const settingsPath = path.join(root, 'settings.json');
const secretPath = path.join(root, 'credentials.enc');
const uuid = /^[a-f0-9-]{36}$/;
const imagePath = id => { if (!uuid.test(id)) throw new Error('Invalid image.'); return path.join(root, 'images', id + '.png'); };

function publicURL(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) throw new Error('Only public image links are supported.');
  return url.href;
}
async function responseBytes(response, maximum = 35 * 1024 * 1024) {
  if (Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel(); throw new Error('This image is too large (maximum 35 MB).'); }
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > maximum) { throw new Error('This image is too large (maximum 35 MB).'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function apiError(response, service) {
  let body = {}; try { body = await response.json(); } catch {}
  const reason = body.errors?.[0]?.title || body.message || body.error;
  const friendly = { 401: 'API key was rejected. Check Settings.', 402: 'No credits remaining.', 403: 'Access denied. Check your API key or credits.', 429: 'Rate limit reached. Try again shortly.' };
  throw new Error(`${service}: ${friendly[response.status] || (typeof reason === 'string' ? reason.slice(0, 220) : `Request failed (${response.status}).`)}`);
}
async function search({ query, page = 1, kind = 'all' }) {
  query = String(query || '').trim().slice(0, 300);
  if (!query) return [];
  if (!secrets.serper) throw new Error('Add your Serper API key in Settings.');
  const body = { q: query, num: 40, page: Math.max(1, Math.min(50, Number(page) || 1)) };
  if (kind === 'transparent') body.tbs = 'ic:trans';
  if (kind === 'icons') body.q += ' icon';
  const response = await fetch('https://google.serper.dev/images', { method: 'POST', headers: { 'X-API-KEY': secrets.serper, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  if (!response.ok) await apiError(response, 'Serper');
  const data = await response.json();
  return (data.images || []).filter(item => item.imageUrl).map(item => ({
    key: randomUUID(), sourceUrl: item.imageUrl, previewUrl: item.thumbnailUrl || item.imageUrl, thumbnailUrl: item.thumbnailUrl,
    title: item.title || query, domain: item.domain || '', source: item.link || '', width: item.imageWidth, height: item.imageHeight, query,
  }));
}
async function storeAsset(bytes, info) {
  const image = await normalizeImage(bytes);
  const id = randomUUID();
  await fs.writeFile(imagePath(id), image.bytes, { mode: 0o600 });
  const asset = { id, ...info, width: image.width, height: image.height, sourceFormat: image.sourceFormat, previewUrl: `asset://image/${id}` };
  await fs.writeFile(imagePath(id) + '.json', JSON.stringify(asset), { mode: 0o600 });
  assets.set(id, asset);
  return asset;
}
async function resolveAsset(item) {
  if (item.id && assets.has(item.id)) return assets.get(item.id);
  if (item.id && uuid.test(item.id)) {
    try { const cached = JSON.parse(await fs.readFile(imagePath(item.id) + '.json', 'utf8')); assets.set(cached.id, cached); return cached; } catch {}
  }
  const url = publicURL(item.sourceUrl);
  if (!assetJobs.has(url)) {
    assetJobs.set(url, (async () => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' }, signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`The image host blocked this download (${response.status}). Try another result.`);
      const bytes = await responseBytes(response);
      return storeAsset(bytes, { sourceUrl: url, source: item.source || '', title: item.title || '', domain: item.domain || '', cutout: false });
    })().catch(error => { assetJobs.delete(url); throw error; }));
  }
  return assetJobs.get(url);
}
async function removeBackground(item) {
  if (!secrets.removebg) throw new Error('Add your remove.bg API key in Settings.');
  const original = await resolveAsset(item);
  if (original.cutout) return original;
  if (!removalJobs.has(original.sourceUrl)) {
    removalJobs.set(original.sourceUrl, (async () => {
      const form = new FormData();
      form.append('image_file', new Blob([await fs.readFile(imagePath(original.id))], { type: 'image/png' }), 'image.png');
      form.append('size', 'auto'); form.append('format', 'png');
      const response = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': secrets.removebg }, body: form, signal: AbortSignal.timeout(90000) });
      if (!response.ok) await apiError(response, 'remove.bg');
      return storeAsset(await responseBytes(response), { sourceUrl: original.sourceUrl, source: original.source, title: original.title, domain: original.domain, cutout: true });
    })().catch(error => { removalJobs.delete(original.sourceUrl); throw error; }));
  }
  return removalJobs.get(original.sourceUrl);
}
async function action({ type, item, query }) {
  if (!['copy', 'save', 'removebg'].includes(type)) throw new Error('Unknown image action.');
  if (type === 'removebg') return removeBackground(item);
  const asset = await resolveAsset(item);
  let entry = await library.archive(asset, query || item.query || 'Image');
  const bytes = await fs.readFile(imagePath(entry.id));
  if (type === 'copy') await clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
  else entry = await library.download(entry, bytes);
  window?.webContents.send('library-changed');
  return entry;
}
async function importGeneration(value) {
  let asset;
  if (value?.bytes) {
    const bytes = Buffer.from(value.bytes);
    if (!bytes.length || bytes.length > 35 * 1024 * 1024) throw new Error('Use an image smaller than 35 MB.');
    const name = String(value.name || 'Reference image').slice(0, 160);
    asset = await storeAsset(bytes, { title: name, query: name.replace(/\.[^.]+$/, ''), sourceUrl: `imported:${randomUUID()}`, cutout: false });
  } else {
    const original = await resolveAsset(value?.item || {});
    asset = { ...original, query: value.item.query || value.item.name || original.title, name: value.item.name };
  }
  return generations.import(asset);
}
async function startGeneration(value) {
  if (!secrets.gateway) throw new Error('Add your AI Gateway key in Settings → API Settings.');
  const refs = value?.references || [];
  if (!Array.isArray(refs) || refs.length > 8) throw new Error('Use up to 8 reference images.');
  const references = await Promise.all(refs.map(async ref => {
    if (!ref || !uuid.test(ref.id)) throw new Error('Choose an image from your library or upload a reference.');
    const asset = await resolveAsset({ id: ref.id });
    return { id: asset.id, name: String(ref.name || asset.title || 'Reference').slice(0, 160) };
  }));
  return generations.add({ prompt: value.prompt, size: value.size, quality: value.quality, references });
}
function status() {
  return { serper: Boolean(secrets.serper), removebg: Boolean(secrets.removebg), gateway: Boolean(secrets.gateway), aiModel: process.env.AI_MODEL || DEFAULT_MODEL, imageModel: process.env.IMAGE_MODEL || IMAGE_MODEL, ...preferences, shortcutActive, downloads: app.getPath('downloads') };
}
async function saveSecrets(value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Keychain encryption is unavailable. Unlock your Mac and try again.');
  const next = { ...secrets };
  for (const name of ['serper', 'removebg', 'gateway']) if (typeof value[name] === 'string' && value[name].trim()) next[name] = value[name].trim();
  await fs.writeFile(secretPath + '.tmp', safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 });
  await fs.rename(secretPath + '.tmp', secretPath);
  secrets = next;
}
function show() {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const bounds = window.getBounds();
  window.setPosition(Math.round(display.x + (display.width - bounds.width) / 2), Math.round(display.y + Math.max(50, (display.height - bounds.height) / 3)));
  window.show(); window.focus(); window.webContents.send('focus-search');
}
function toggle() { window?.isVisible() && window?.isFocused() ? window.hide() : show(); }
function registerShortcut(shortcut) {
  if (testMode) return;
  if (shortcut === preferences.shortcut && shortcutActive) return;
  let registered = false;
  try { registered = globalShortcut.register(shortcut, toggle); } catch {}
  if (!registered) throw new Error('That shortcut is already in use. Choose another in Settings.');
  if (shortcutActive) globalShortcut.unregister(preferences.shortcut);
  shortcutActive = true; preferences.shortcut = shortcut;
}
async function configure(value) {
  if (value.serper || value.removebg || value.gateway) await saveSecrets(value);
  if (value.shortcut) registerShortcut(String(value.shortcut));
  if (typeof value.launchAtLogin === 'boolean') {
    if (!testMode) app.setLoginItemSettings({ openAtLogin: value.launchAtLogin, args: ['--hidden'] });
    preferences.launchAtLogin = value.launchAtLogin;
  }
  await fs.writeFile(settingsPath, JSON.stringify(preferences), { mode: 0o600 });
  return status();
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, value) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted request.');
    try { return { value: await fn(value) }; }
    catch (error) { return { error: error.name === 'TimeoutError' ? 'The request timed out. Try again.' : error.message || 'Something went wrong. Try again.' }; }
  });
}
async function start() {
  await fs.mkdir(root, { recursive: true });
  library = new Library(root, testMode ? path.join(root, 'Downloads') : app.getPath('downloads'));
  await library.init();
  for (const entry of library.list()) assets.set(entry.id, entry);
  generations = new GenerationStore(root, {
    changed: () => window?.webContents.send('generations-changed'),
    generate: async job => {
      const references = await Promise.all(job.references.map(ref => fs.readFile(imagePath(ref.id))));
      const total = references.reduce((sum, bytes) => sum + bytes.length, 0);
      if (total > 35 * 1024 * 1024) throw new Error('Reference images total more than 35 MB. Use fewer or smaller images.');
      const names = job.references.map((ref, index) => `Image ${index + 1}: ${ref.name}`).join('\n');
      const prompt = names ? `${job.prompt}\n\nAttached reference images, in order:\n${names}` : job.prompt;
      const bytes = await generateImage({ ...job, prompt, references }, { key: secrets.gateway, model: process.env.IMAGE_MODEL || IMAGE_MODEL });
      return storeAsset(bytes, { sourceUrl: `generated:${job.id}`, title: job.prompt, query: job.prompt, generated: true, model: process.env.IMAGE_MODEL || IMAGE_MODEL, cutout: false });
    },
  });
  await generations.init();
  try { secrets = JSON.parse(safeStorage.decryptString(await fs.readFile(secretPath))); } catch (error) { if (error.code !== 'ENOENT') console.error('Credentials unavailable; re-enter keys in Settings.'); }
  if (process.env.AI_GATEWAY_API_KEY && process.env.AI_GATEWAY_API_KEY !== secrets.gateway) await saveSecrets({ gateway: process.env.AI_GATEWAY_API_KEY });
  try { preferences = { ...preferences, ...JSON.parse(await fs.readFile(settingsPath, 'utf8')) }; } catch {}
  const importAt = process.argv.indexOf('--credentials-file');
  if (importAt >= 0) {
    const file = process.argv[importAt + 1];
    try { await saveSecrets(JSON.parse(await fs.readFile(file, 'utf8'))); } finally { await fs.unlink(file); }
  }
  protocol.handle('asset', request => {
    const url = new URL(request.url);
    const id = url.pathname.slice(1);
    if (url.host !== 'image' || !uuid.test(id)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(imagePath(id)).href);
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window = new BrowserWindow({ width: 920, height: 690, minWidth: 600, minHeight: 420, show: false, backgroundColor: '#171717', title: 'Agent Native Images', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 17 }, roundedCorners: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
  handle('generations', () => generations.list());
  handle('generate-image', startGeneration); handle('import-generation', importGeneration);
  handle('retry-generation', id => generations.retry(id)); handle('remove-generation', id => generations.remove(id));
  handle('search', search); handle('action', action); handle('library', () => library.list());
  handle('plan-searches', prompt => planSearches(prompt, { key: secrets.gateway, model: process.env.AI_MODEL || DEFAULT_MODEL }));
  handle('status', status); handle('configure', configure);
  handle('hide', () => window.hide());
  handle('downloads', () => shell.openPath(testMode ? path.join(root, 'Downloads') : app.getPath('downloads')));
  handle('source', value => shell.openExternal(publicURL(value)));
  handle('forget', async id => { await library.remove(id); window.webContents.send('library-changed'); });
  handle('reveal', id => { const entry = library.list().find(item => item.id === id); if (entry) shell.showItemInFolder(entry.downloadPath || imagePath(id)); });
  try { registerShortcut(preferences.shortcut); } catch (error) { console.error(error.message); }
  const menu = [
    { label: 'Agent Native Images', submenu: [{ label: 'Show Images', click: show }, { type: 'separator' }, { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => { show(); window.webContents.send('open-settings'); } }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'Window', submenu: [{ label: 'New Search', accelerator: 'CommandOrControl+T', click: () => window.webContents.send('new-tab') }, { label: 'Close Tab', accelerator: 'CommandOrControl+W', click: () => window.webContents.send('close-tab') }, { role: 'minimize' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  if (!testMode) {
    const trayImage = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
    trayImage.setTemplateImage(true);
    tray = new Tray(trayImage);
    tray.setToolTip('Agent Native Images');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Images', click: show }, { label: 'Downloads', click: () => shell.openPath(app.getPath('downloads')) }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }]));
    tray.on('click', toggle);
  }
  await window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (!process.argv.includes('--hidden')) show();
}
if (!testMode && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', show);
  app.whenReady().then(start).catch(error => { console.error(error); app.quit(); });
  app.on('activate', show);
}
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {});
