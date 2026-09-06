const $ = selector => document.querySelector(selector);
const api = window.images;
const paths = {
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  save: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  cut: '<path d="m16 3 1.5 4.5L22 9l-4.5 1.5L16 15l-1.5-4.5L10 9l4.5-1.5L16 3ZM6 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/>',
  undo: '<path d="M3 9h11a6 6 0 0 1 0 12M3 9l5-5M3 9l5 5"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.image}</svg>`; }
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(label, iconName, callback, className = '') { const node = element('button', className); node.type = 'button'; if (iconName) node.innerHTML = icon(iconName); if (label) node.append(document.createTextNode(label)); node.addEventListener('click', callback); return node; }
function freshTab() { return { id: crypto.randomUUID(), query: '', draft: '', kind: 'all', items: [], page: 0, loading: false, error: '', token: '', hasMore: false }; }
let tabs = [freshTab()], activeId = tabs[0].id, saved = [], savedQuery = '', recent = [], preview = null, toastTimer;
const busy = new Map();
try {
  const state = JSON.parse(localStorage.getItem('image-session'));
  if (state?.tabs?.length) { tabs = state.tabs.map(tab => ({ ...tab, loading: false, error: '', token: '' })); activeId = tabs.some(tab => tab.id === state.activeId) ? state.activeId : tabs[0].id; recent = state.recent || []; }
} catch {}
function current() { return tabs.find(tab => tab.id === activeId); }
function persist() {
  try { localStorage.setItem('image-session', JSON.stringify({ tabs: tabs.map(tab => ({ ...tab, items: tab.items.slice(0, 120), loading: false, token: '' })), activeId: activeId === 'saved' ? tabs[0].id : activeId, recent })); } catch {}
}
function focusSearch(select = true) { const input = $('#search-input'); input.focus(); if (select) input.select(); }
function toast(text, error = false) { clearTimeout(toastTimer); const node = $('#toast'); node.textContent = text; node.className = error ? 'error' : ''; node.hidden = false; toastTimer = setTimeout(() => { node.hidden = true; }, error ? 8000 : 2800); }
function renderTabs() {
  const container = $('#tabs'); container.replaceChildren();
  for (const tab of tabs) {
    const wrapper = element('div', `tab${tab.id === activeId ? ' active' : ''}`);
    const main = button('', null, () => selectTab(tab.id), 'tab-main'); main.setAttribute('role', 'tab'); main.setAttribute('aria-selected', String(tab.id === activeId)); main.setAttribute('aria-label', tab.query || 'New search');
    const glyph = element('span', 'tab-icon'); glyph.innerHTML = tab.loading ? '<span class="spinner"></span>' : icon('search');
    main.append(glyph, element('span', 'tab-name', tab.query || 'New search'));
    if (tab.unread) main.append(element('span', 'ready-dot'));
    const close = button('', 'close', () => closeTab(tab.id), 'close-tab'); close.setAttribute('aria-label', `Close ${tab.query || 'new search'}`);
    wrapper.append(main, close); container.append(wrapper);
  }
  const savedTab = $('#saved-tab'); savedTab.innerHTML = icon('bookmark'); savedTab.append(document.createTextNode('Saved'), element('span', 'saved-count', String(saved.length))); savedTab.classList.toggle('active', activeId === 'saved'); savedTab.setAttribute('aria-selected', String(activeId === 'saved'));
}
function selectTab(id) {
  const previous = current(); if (previous) previous.scrollTop = $('#content').scrollTop;
  activeId = id;
  const tab = current(); if (tab) tab.unread = false;
  $('#search-input').value = tab ? tab.draft : savedQuery;
  $('#search-input').placeholder = tab ? 'Search Google Images…' : 'Search your saved images…';
  $('#search-input').setAttribute('aria-label', tab ? 'Search Google Images' : 'Search saved images');
  render(); $('#content').scrollTop = tab?.scrollTop || 0; focusSearch(); persist();
  $('#tabs .tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function newTab() { const tab = freshTab(); tabs.push(tab); selectTab(tab.id); }
function closeTab(id = activeId) {
  if (id === 'saved') { selectTab(tabs[tabs.length - 1].id); return; }
  const index = tabs.findIndex(tab => tab.id === id); tabs = tabs.filter(tab => tab.id !== id);
  if (!tabs.length) tabs.push(freshTab());
  if (activeId === id) selectTab(tabs[Math.min(index, tabs.length - 1)].id); else { renderTabs(); persist(); }
}
async function runSearch(tab, more = false) {
  const query = (more ? tab.query : tab.draft).trim();
  if (!query) return focusSearch();
  const token = crypto.randomUUID(); tab.token = token; tab.loading = true; tab.error = ''; tab.unread = false;
  if (!more) { tab.query = query; tab.items = []; tab.page = 0; tab.hasMore = false; tab.scrollTop = 0; if (activeId === tab.id) $('#content').scrollTop = 0; }
  recent = [query, ...recent.filter(value => value !== query)].slice(0, 6); render(); persist();
  try {
    const items = await api.search({ query, page: tab.page + 1, kind: tab.kind });
    if (tab.token !== token || !tabs.includes(tab)) return;
    const existing = new Set(tab.items.map(item => item.sourceUrl));
    tab.items.push(...items.filter(item => !existing.has(item.sourceUrl))); tab.page++; tab.hasMore = items.length > 0; tab.unread = activeId !== tab.id;
  } catch (error) { if (tab.token === token) tab.error = error.message; }
  finally { if (tab.token === token) { tab.loading = false; renderTabs(); if (activeId === tab.id) renderContent(); persist(); } }
}
function emptyState(title, description, image = 'image') {
  const node = element('div', 'empty'); const art = element('div', 'empty-art'); art.innerHTML = icon(image); node.append(art, element('h1', '', title), element('p', '', description)); return node;
}
function render() {
  renderTabs();
  const tab = current(); $('#filters').hidden = !tab;
  for (const filter of document.querySelectorAll('[data-kind]')) { const active = filter.dataset.kind === tab?.kind; filter.classList.toggle('active', active); filter.setAttribute('aria-pressed', String(active)); }
  $('.search-submit').hidden = !tab;
  renderContent();
}
function renderContent() {
  const content = $('#content'); const scroll = content.scrollTop; content.replaceChildren();
  const tab = current();
  const items = tab ? tab.items : saved.filter(item => `${item.name} ${item.query} ${item.title}`.toLowerCase().includes(savedQuery.toLowerCase()));
  $('#result-count').textContent = tab?.loading ? 'Searching…' : items.length ? `${items.length} ${tab ? 'images' : 'saved'}${tab?.kind === 'all' ? ' · Google Images' : ''}` : '';
  if (tab?.error) {
    const error = element('div', 'inline-error'); error.append(element('span', 'error-text', tab.error), button('Try again', null, () => runSearch(tab, tab.items.length > 0))); content.append(error);
  }
  if (tab?.loading && !items.length) {
    const note = element('div', 'loading-note'); note.innerHTML = '<span class="spinner"></span>'; note.append(document.createTextNode('Finding your images. You can start another tab.')); content.append(note);
    const grid = element('div', 'grid skeleton'); for (let index = 0; index < 8; index++) { const skeleton = element('div'); skeleton.innerHTML = '<div class="image-stage"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div>'; grid.append(skeleton); } content.append(grid); return;
  }
  if (!items.length) {
    let empty;
    if (!tab) empty = emptyState(savedQuery ? 'No saved images found.' : 'Your visuals, within reach.', savedQuery ? 'Try another search.' : 'Copy or save an image and it will be kept here, ready for next time.', 'bookmark');
    else if (tab.query) empty = emptyState(tab.error ? 'Let’s try that again.' : 'No images found.', tab.error ? 'Check the message above, or try a different search.' : 'Try a broader search or a different image type.');
    else {
      empty = emptyState('Find your next visual.', 'Search images, grab an icon, or make a cutout.\nFrom idea to clipboard in seconds.');
      const suggestions = element('div', 'suggestions');
      for (const query of (recent.length ? recent.slice(0, 3) : ['Monkey', 'Chrome icon', 'Paper texture'])) suggestions.append(button(query, null, () => { tab.draft = query; $('#search-input').value = query; runSearch(tab); }));
      empty.append(suggestions, element('div', 'empty-key', '⌘ T to search for something else in a new tab'));
    }
    content.append(empty); return;
  }
  const grid = element('div', 'grid'); items.forEach((item, index) => grid.append(card(item, tab, index))); content.append(grid);
  if (tab?.hasMore) { const more = button(tab.loading ? 'Loading…' : 'Load more images', null, () => runSearch(tab, true), 'load-more'); more.disabled = tab.loading; content.append(more); }
  content.scrollTop = scroll;
}
function itemKey(item) { return item.key || item.id; }
function sourceDomain(item) { if (item.domain) return item.domain; try { return new URL(item.sourceUrl).hostname.replace(/^www\./, ''); } catch { return ''; } }
function card(item, tab, index) {
  const key = itemKey(item); const working = busy.get(key);
  const article = element('article', `image-card${working ? ' busy' : ''}`); article.tabIndex = 0; article.dataset.index = index; article.dataset.key = key; article.setAttribute('aria-label', item.name || item.title);
  const stage = button('', null, () => openPreview(item, tab), `image-stage${item.cutout ? ' cutout' : ''}`); stage.tabIndex = -1; stage.setAttribute('aria-label', `Preview ${item.name || item.title}`);
  const img = element('img'); img.alt = item.title || item.name || 'Image result'; img.src = item.previewUrl || item.sourceUrl; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
  let fallback = false;
  img.addEventListener('error', () => { if (item.thumbnailUrl && !fallback && !item.cutout) { fallback = true; img.src = item.thumbnailUrl; } else { img.remove(); const broken = element('span', 'broken'); broken.innerHTML = icon('image'); broken.append(document.createTextNode('Preview unavailable')); stage.append(broken); } });
  stage.append(img);
  if (saved.some(entry => entry.sourceUrl === item.sourceUrl && Boolean(entry.cutout) === Boolean(item.cutout))) { const mark = element('span', 'saved-mark'); mark.innerHTML = icon('check'); mark.title = 'In your saved library'; stage.append(mark); }
  if (working) { const overlay = element('span', 'working'); overlay.innerHTML = '<span class="spinner"></span>'; overlay.append(document.createTextNode(working)); stage.append(overlay); }
  const info = element('div', 'image-info'); const title = element('div', 'image-title', item.name || item.title); title.title = item.name || item.title; info.append(title);
  const meta = element('div', 'image-meta'); meta.append(element('span', 'domain', item.cutout ? 'Background removed' : sourceDomain(item)), element('span', '', item.width && item.height ? `${item.width} × ${item.height}` : '')); info.append(meta);
  const actions = actionButtons(item, tab, false); article.append(stage, info, actions);
  article.addEventListener('keydown', event => {
    if (event.target !== article) return;
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); openPreview(item, tab); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); perform('copy', item, tab); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); perform('save', item, tab); }
    if (event.key.toLowerCase() === 'b') { event.preventDefault(); perform('removebg', item, tab); }
    const columns = getComputedStyle(article.parentElement).gridTemplateColumns.split(' ').length;
    const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
    if (offset !== undefined) { event.preventDefault(); document.querySelector(`.image-card[data-index="${index + offset}"]`)?.focus(); }
  });
  return article;
}
function actionButtons(item, tab, large) {
  const row = element('div', large ? 'preview-buttons' : 'card-actions');
  const actions = [['copy', 'Copy', 'copy'], ['save', 'Save', 'save'], [item.cutout && item.original ? 'undo' : 'removebg', item.cutout && item.original ? 'Original' : item.cutout ? 'Cutout' : 'Remove BG', item.cutout && item.original ? 'undo' : 'cut']];
  for (const [type, label, glyph] of actions) {
    const action = button(label, glyph, () => perform(type, item, tab)); action.disabled = Boolean(busy.get(itemKey(item))) || (type === 'removebg' && item.cutout); action.title = type === 'copy' ? 'Copy image and keep in Saved · ⌘C' : type === 'save' ? 'Save to Downloads and library · ⌘S' : type === 'undo' ? 'Return to the original image' : 'Remove background with remove.bg · B'; row.append(action);
  }
  if (large && item.source) row.append(button('Source', 'external', () => api.source(item.source).catch(error => toast(error.message, true))));
  if (large && !tab) row.append(button('Remove from saved', null, async () => { try { await api.forget(item.id); $('#preview-dialog').close(); preview = null; await refreshSaved(); toast('Removed from library. Downloads are kept.'); } catch (error) { toast(error.message, true); } }));
  return row;
}
async function perform(type, item, tab) {
  const key = itemKey(item); if (busy.has(key)) return;
  if (type === 'undo') { const original = item.original; for (const field of Object.keys(item)) delete item[field]; Object.assign(item, original); renderContent(); updatePreview(); persist(); return; }
  busy.set(key, { copy: 'Copying…', save: 'Saving…', removebg: 'Removing…' }[type]); renderContent(); updatePreview();
  try {
    const result = await api.action({ type, item: { ...item, original: undefined }, query: tab?.query || item.query });
    if (type === 'removebg') {
      if (tab) { const original = { ...item }; Object.assign(item, result, { key, original }); }
      else { const cutoutTab = freshTab(); cutoutTab.query = item.query; cutoutTab.draft = item.query; cutoutTab.items = [{ ...result, key: crypto.randomUUID(), original: item, query: item.query }]; tabs.push(cutoutTab); selectTab(cutoutTab.id); if (preview) preview = { item: cutoutTab.items[0], tab: cutoutTab }; }
      toast('Background removed. Ready to copy or save.');
    } else {
      await refreshSaved(); toast(type === 'copy' ? `${result.name} copied · kept in Saved` : `${result.name}.png saved to Downloads`);
    }
  } catch (error) { toast(error.message, true); }
  finally { busy.delete(key); renderContent(); updatePreview(); persist(); }
}
function openPreview(item, tab) { preview = { item, tab }; updatePreview(); $('#preview-dialog').showModal(); }
function updatePreview() {
  if (!preview) return;
  const { item, tab } = preview;
  $('#preview-title').textContent = item.name || item.title;
  $('#preview-meta').textContent = `${item.width && item.height ? `${item.width} × ${item.height} · ` : ''}${item.cutout ? 'Transparent PNG' : sourceDomain(item)}`;
  $('#preview-image').src = item.id ? item.previewUrl : item.sourceUrl; $('#preview-image').alt = item.title || item.name;
  $('#preview-image').onerror = () => { if (item.thumbnailUrl && $('#preview-image').src !== item.thumbnailUrl) $('#preview-image').src = item.thumbnailUrl; };
  $('.preview-image-wrap').classList.toggle('cutout', Boolean(item.cutout));
  const actions = actionButtons(item, tab, true); $('#preview-actions').replaceChildren(...actions.childNodes);
}
async function refreshSaved() { saved = await api.library(); renderTabs(); if (activeId === 'saved') renderContent(); }
function setShortcutLabel(shortcut) { return shortcut.replace('CommandOrControl', '⌘').replace('Control', '⌃').replace('Shift', '⇧').replace('Alt', '⌥').replaceAll('+', ''); }
async function openSettings() {
  try {
    const status = await api.status(); $('#shortcut-select').value = status.shortcut; $('#login-checkbox').checked = status.launchAtLogin;
    for (const [name, configured] of [['serper', status.serper], ['removebg', status.removebg]]) { $(`#${name}-state`).textContent = configured ? 'Connected' : 'Not configured'; $(`#${name}-key`).value = ''; $(`#${name}-key`).placeholder = configured ? 'Saved securely · enter to replace' : 'Enter API key'; }
    $('#settings-error').textContent = status.shortcutActive ? '' : 'The shortcut is unavailable. Choose another shortcut below.';
    $('#settings-dialog').showModal();
  } catch (error) { toast(error.message, true); }
}
$('#search-icon').innerHTML = icon('search'); $('#new-tab').innerHTML = icon('plus'); $('#settings-button').innerHTML = icon('settings'); $('#close-preview').innerHTML = icon('close'); $('#close-settings').innerHTML = icon('close'); $('#downloads-button').innerHTML = icon('folder') + 'Downloads';
$('#new-tab').addEventListener('click', newTab); $('#saved-tab').addEventListener('click', () => selectTab('saved')); $('#settings-button').addEventListener('click', openSettings);
$('#downloads-button').addEventListener('click', () => api.downloads().catch(error => toast(error.message, true)));
$('#close-preview').addEventListener('click', () => { $('#preview-dialog').close(); preview = null; }); $('#preview-dialog').addEventListener('close', () => { preview = null; });
$('#close-settings').addEventListener('click', () => $('#settings-dialog').close());
$('#search-input').addEventListener('input', event => { if (current()) current().draft = event.target.value; else { savedQuery = event.target.value; renderContent(); } });
$('#search-form').addEventListener('submit', event => { event.preventDefault(); if (current()) runSearch(current()); });
$('#filters').addEventListener('click', event => { const node = event.target.closest('[data-kind]'); if (!node || !current()) return; const tab = current(); tab.kind = node.dataset.kind; if (tab.draft.trim()) runSearch(tab); else render(); });
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = $('#settings-form .primary-button'); submit.disabled = true; $('#settings-error').textContent = '';
  try { const status = await api.configure({ serper: $('#serper-key').value, removebg: $('#removebg-key').value, shortcut: $('#shortcut-select').value, launchAtLogin: $('#login-checkbox').checked }); $('#shortcut-label').textContent = setShortcutLabel(status.shortcut); $('#settings-dialog').close(); $('#serper-key').value = ''; $('#removebg-key').value = ''; toast('Settings saved.'); } catch (error) { $('#settings-error').textContent = error.message; } finally { submit.disabled = false; }
});
document.addEventListener('keydown', event => {
  if ($('#settings-dialog').open) return;
  const command = event.metaKey || event.ctrlKey;
  if ($('#preview-dialog').open) {
    if (command && ['c', 's'].includes(event.key.toLowerCase())) { event.preventDefault(); perform(event.key.toLowerCase() === 'c' ? 'copy' : 'save', preview.item, preview.tab); }
    if (event.key.toLowerCase() === 'b') { event.preventDefault(); perform('removebg', preview.item, preview.tab); }
    return;
  }
  if (event.key === 'Escape') { event.preventDefault(); api.hide(); }
  if (command && event.key.toLowerCase() === 'l') { event.preventDefault(); focusSearch(); }
  if (command && event.key.toLowerCase() === 't') { event.preventDefault(); newTab(); }
  if (command && event.key.toLowerCase() === 'w') { event.preventDefault(); closeTab(); }
  if (command && event.key === ',') { event.preventDefault(); openSettings(); }
  if (command && event.key === '9') { event.preventDefault(); selectTab('saved'); }
  if (command && /^[1-8]$/.test(event.key) && tabs[Number(event.key) - 1]) { event.preventDefault(); selectTab(tabs[Number(event.key) - 1].id); }
  if (event.ctrlKey && event.key === 'Tab') { event.preventDefault(); const ids = [...tabs.map(tab => tab.id), 'saved']; selectTab(ids[(ids.indexOf(activeId) + (event.shiftKey ? ids.length - 1 : 1)) % ids.length]); }
  if (event.key === 'ArrowDown' && event.target === $('#search-input')) { event.preventDefault(); $('.image-card')?.focus(); }
});
api.onLibrary(() => refreshSaved().catch(error => toast(error.message, true))); api.onFocus(() => { if (!document.querySelector('dialog[open]')) focusSearch(); }); api.onNewTab(newTab); api.onCloseTab(closeTab); api.onSettings(openSettings);
window.addEventListener('beforeunload', persist);
selectTab(activeId);
refreshSaved().catch(error => toast(error.message, true));
api.status().then(status => { $('#shortcut-label').textContent = setShortcutLabel(status.shortcut); if (!status.serper) openSettings(); else if (!status.shortcutActive) toast('Shortcut is in use. Choose another in Settings.', true); }).catch(error => toast(error.message, true));
