(() => {
  let notes = [], activeId = null, query = '', editing = { id: null }, dirty = false, loaded = false, revision = 0, saveTimer, deleteTimer, saveChain = Promise.resolve();
  const title = $('#note-title'), body = $('#note-body'), list = $('#notes-list'), search = $('#notes-search'), status = $('#note-status'), deleteButton = $('#delete-note'), copyButton = $('#copy-note');
  try { activeId = JSON.parse(localStorage.getItem('notes-state'))?.activeId || null; } catch {}
  function persistState() { try { localStorage.setItem('notes-state', JSON.stringify({ activeId })); } catch {} }
  function firstLine(text) { return String(text || '').split('\n').map(line => line.trim()).find(Boolean) || ''; }
  function nameOf(note) { return note.title || firstLine(note.body) || 'Untitled note'; }
  function snippet(note) { const lines = String(note.body || '').split('\n').map(line => line.trim()).filter(Boolean); if (!note.title) lines.shift(); return lines.join(' ').slice(0, 140); }
  function when(iso) {
    const date = new Date(iso), now = new Date(), diff = now - date;
    if (!(diff >= 0) || diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  }
  function current() { return notes.find(note => note.id === activeId); }
  function visible() {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return notes.filter(note => { const text = `${note.title}\n${note.body}`.toLowerCase(); return words.every(word => text.includes(word)); });
  }
  function renderList() {
    list.replaceChildren();
    const items = visible();
    if (!items.length) { list.append(element('div', 'notes-empty', notes.length ? 'No notes match' : 'No notes yet')); return; }
    for (const note of items) {
      const item = button('', null, () => select(note.id), `note-item${note.id === activeId ? ' active' : ''}`);
      item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(note.id === activeId)); item.dataset.id = note.id;
      item.append(element('span', 'note-item-title', nameOf(note)));
      const preview = snippet(note); if (preview) item.append(element('span', 'note-item-snippet', preview));
      item.append(element('span', 'note-item-date', when(note.updatedAt)));
      list.append(item);
    }
  }
  function disarmDelete() { clearTimeout(deleteTimer); deleteButton.textContent = 'Delete'; deleteButton.classList.remove('armed'); }
  function updateActions() { copyButton.hidden = !title.value.trim() && !body.value.trim(); deleteButton.hidden = !editing.id; }
  function loadEditor() {
    const note = current();
    title.value = note?.title || ''; body.value = note?.body || ''; dirty = false; clearTimeout(saveTimer);
    status.textContent = note ? `Edited · ${when(note.updatedAt)}` : 'New note';
    disarmDelete(); updateActions();
  }
  async function refresh() {
    const request = ++revision;
    try {
      const listed = await api.notes(); if (request !== revision) return;
      notes = listed;
      if (activeId && !notes.some(note => note.id === activeId)) { activeId = null; editing = { id: null }; persistState(); loadEditor(); }
      else if (!loaded) { if (!activeId && notes.length) { activeId = notes[0].id; persistState(); } editing = { id: activeId }; loadEditor(); }
      loaded = true; renderList();
    } catch (error) { toast(error.message, true); }
  }
  function scheduleSave() { dirty = true; clearTimeout(saveTimer); status.textContent = 'Saving…'; updateActions(); saveTimer = setTimeout(save, 400); }
  function save() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    dirty = false;
    const target = editing, snapshot = { title: title.value, body: body.value };
    if (!target.id && !snapshot.title.trim() && !snapshot.body.trim()) { if (target === editing) status.textContent = 'New note'; return; }
    saveChain = saveChain.then(async () => {
      try {
        const saved = await api.saveNote({ id: target.id || undefined, ...snapshot });
        target.id = saved.id;
        notes = [saved, ...notes.filter(note => note.id !== saved.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (target === editing) { activeId = saved.id; persistState(); status.textContent = `Saved · ${when(saved.updatedAt)}`; updateActions(); }
        renderList();
      } catch (error) { if (target === editing) { dirty = true; status.textContent = 'Not saved'; } toast(error.message, true); }
    });
  }
  function select(id) {
    if (id === editing.id && id === activeId) { body.focus(); return; }
    save(); activeId = id; editing = { id }; persistState(); loadEditor(); renderList(); body.focus();
  }
  function create() {
    if (activeModule !== 'notes') selectModule('notes');
    if (!editing.id && !title.value.trim() && !body.value.trim()) { title.focus(); return; }
    save(); activeId = null; editing = { id: null }; persistState(); loadEditor(); renderList(); title.focus();
  }
  async function remove() {
    if (!editing.id) return;
    if (!deleteButton.classList.contains('armed')) { deleteButton.textContent = 'Delete?'; deleteButton.classList.add('armed'); deleteTimer = setTimeout(disarmDelete, 4000); return; }
    disarmDelete();
    const id = editing.id; dirty = false; clearTimeout(saveTimer);
    try {
      await saveChain; await api.removeNote(id);
      notes = notes.filter(note => note.id !== id);
      activeId = visible()[0]?.id || null; editing = { id: activeId }; persistState(); loadEditor(); renderList(); toast('Note deleted.');
      (activeId ? body : title).focus();
    } catch (error) { toast(error.message, true); }
  }
  async function copy() {
    const text = body.value.trim() ? body.value : title.value.trim();
    try { await api.copyNote(text); toast('Note copied.'); } catch (error) { toast(error.message, true); }
  }
  function focus() { (editing.id || title.value.trim() || body.value.trim() ? body : title).focus(); }
  $('#new-note').innerHTML = icon('plus'); $('#notes-search-icon').innerHTML = icon('search');
  $('#new-note').addEventListener('click', create); deleteButton.addEventListener('click', remove); copyButton.addEventListener('click', copy);
  title.addEventListener('input', scheduleSave); body.addEventListener('input', scheduleSave);
  title.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); body.focus(); body.setSelectionRange(0, 0); }
    if (event.key === 'ArrowDown') { event.preventDefault(); body.focus(); body.setSelectionRange(0, 0); }
  });
  search.addEventListener('input', () => { query = search.value; renderList(); });
  search.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); list.querySelector('.note-item')?.focus(); } });
  list.addEventListener('keydown', event => {
    const items = [...list.querySelectorAll('.note-item')]; const index = items.indexOf(document.activeElement);
    if (index < 0 || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  });
  document.addEventListener('pointerdown', event => { if (deleteButton.classList.contains('armed') && !deleteButton.contains(event.target)) disarmDelete(); });
  window.addEventListener('blur', () => save()); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); }); window.addEventListener('beforeunload', () => save());
  window.notes = { refresh, create, focus, search: () => { search.focus(); search.select(); }, flush: save };
  api.onNotes(refresh);
  loadEditor(); refresh();
})();
