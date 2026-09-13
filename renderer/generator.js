(() => {
  let entries = [], references = [], revision = 0, uploadCount = 0, referenceEpoch = 0;
  let mentionStart = -1, mentionIndex = 0, mentionOptions = [];
  const prompt = $('#generation-prompt'), form = $('#generation-form');
  const readyImages = () => entries.filter(entry => entry.status === 'ready').map(entry => entry.asset);
  const nameOf = item => item.name || item.title || item.query || 'Reference image';
  try {
    const draft = JSON.parse(localStorage.getItem('generation-draft'));
    if (draft) { prompt.value = draft.prompt || ''; references = (draft.references || []).slice(0, 8); $('#generation-size').value = draft.size || '1024x1024'; $('#generation-quality').value = draft.quality || 'medium'; }
  } catch {}
  for (const ref of references) prompt.value = prompt.value.replaceAll(`@${ref.name}`, '');
  if (!prompt.value.trim()) prompt.value = '';
  function persistDraft() {
    localStorage.setItem('generation-draft', JSON.stringify({ prompt: prompt.value, references, size: $('#generation-size').value, quality: $('#generation-quality').value }));
  }
  function updateSubmit() { $('#generate-button').disabled = !prompt.value.trim() || uploadCount > 0; $('#clear-generation').disabled = !prompt.value && !references.length; }
  async function refresh() {
    const request = ++revision;
    try { const list = await api.generations(); if (request !== revision) return; entries = list; renderGrid(); }
    catch (error) { toast(error.message, true); }
  }
  function iconAction(label, glyph, callback) {
    const node = button('', glyph, callback, 'icon-button'); node.title = label; node.setAttribute('aria-label', label); return node;
  }
  function renderGrid() {
    const grid = $('#generation-grid'); const scroll = grid.scrollTop; grid.replaceChildren();
    if (!entries.length) { grid.append(element('div', 'generation-empty', 'make an image')); return; }
    for (const entry of entries) {
      const tile = element('article', `generation-tile ${entry.status}`); tile.dataset.jobId = entry.id;
      if (entry.status === 'ready') {
        const item = entry.asset;
        const stage = button('', null, () => openPreview(item, null, readyImages(), true), 'generation-image'); stage.setAttribute('aria-label', `Preview ${nameOf(item)}`);
        const img = element('img'); img.src = item.previewUrl; img.alt = nameOf(item); img.loading = 'lazy'; img.draggable = false;
        stage.append(img); stage.draggable = true;
        stage.addEventListener('dragstart', event => { event.dataTransfer.setData('application/x-agent-image', JSON.stringify({ id: item.id, name: nameOf(item), previewUrl: item.previewUrl })); event.dataTransfer.effectAllowed = 'copy'; });
        const actions = element('div', 'generation-tile-actions');
        actions.append(iconAction('Use as reference', 'plus', () => addReference(item)), iconAction('Copy image', 'copy', () => perform('copy', item, null)), iconAction('Save image', 'save', () => perform('save', item, null)), iconAction('Remove from generator', 'close', async () => { try { await api.removeGeneration(entry.id); await refresh(); } catch (error) { toast(error.message, true); } }));
        tile.append(stage, actions);
      } else {
        const state = element('div', 'generation-state');
        if (entry.status !== 'error') { const spinner = element('span', 'spinner'); state.append(spinner, element('span', '', entry.status === 'queued' ? 'Queued' : 'Generating')); }
        else {
          state.append(element('span', 'generation-error', entry.error || 'Generation failed'));
          state.append(button('Retry', null, async () => { try { await api.retryGeneration(entry.id); await refresh(); } catch (error) { toast(error.message, true); } }));
          state.append(iconAction('Remove failed generation', 'close', async () => { await api.removeGeneration(entry.id); await refresh(); }));
        }
        tile.append(state, element('p', 'generation-caption', entry.prompt));
      }
      grid.append(tile);
    }
    grid.scrollTop = scroll;
  }
  function renderReferences() {
    const container = $('#reference-list'); container.replaceChildren(); container.hidden = !references.length && !uploadCount;
    for (const ref of references) {
      const chip = element('div', 'reference-chip'); const img = element('img'); img.src = ref.previewUrl; img.alt = '';
      const name = element('span', '', ref.name); name.title = ref.name;
      const remove = iconAction(`Remove reference ${ref.name}`, 'close', () => { references = references.filter(item => item.id !== ref.id); renderReferences(); persistDraft(); });
      chip.append(img, name, remove); container.append(chip);
    }
    if (uploadCount) { const loading = element('span', 'reference-loading', 'Adding references…'); container.append(loading); }
    updateSubmit();
  }
  function addReference(item) {
    if (references.some(ref => ref.id === item.id)) return true;
    if (references.length >= 8) { toast('Use up to 8 reference images.', true); return false; }
    references.push({ id: item.id, name: nameOf(item), previewUrl: item.previewUrl }); renderReferences(); persistDraft(); return true;
  }
  async function importSearch(item) {
    try { await api.importGeneration({ item }); await refresh(); toast('Added to image generator.'); }
    catch (error) { toast(error.message, true); }
  }
  async function upload(files) {
    const epoch = referenceEpoch;
    const list = [...files];
    for (const file of list) {
      if (epoch !== referenceEpoch) break;
      if (references.length >= 8) { toast('Use up to 8 reference images.', true); break; }
      if (file.size > 35 * 1024 * 1024) { toast(`${file.name} is too large. Use an image smaller than 35 MB.`, true); continue; }
      uploadCount++; renderReferences();
      try { const entry = await api.importGeneration({ bytes: new Uint8Array(await file.arrayBuffer()), name: file.name }); if (epoch === referenceEpoch) addReference(entry.asset); await refresh(); }
      catch (error) { toast(error.message, true); }
      finally { uploadCount--; renderReferences(); }
    }
  }
  function closeMentions() { $('#mention-menu').hidden = true; prompt.setAttribute('aria-expanded', 'false'); prompt.removeAttribute('aria-activedescendant'); mentionStart = -1; }
  function renderMentions() {
    const before = prompt.value.slice(0, prompt.selectionStart);
    const match = before.match(/(?:^|\s)@([^@\n]*)$/);
    if (!match) return closeMentions();
    mentionStart = before.lastIndexOf('@');
    const query = match[1].toLowerCase();
    mentionOptions = saved.filter(item => [item.name, item.title, item.query].filter(Boolean).join(' ').toLowerCase().includes(query)).slice(0, 8);
    mentionIndex = Math.min(mentionIndex, Math.max(0, mentionOptions.length - 1));
    const menu = $('#mention-menu'); menu.replaceChildren(); menu.hidden = false; prompt.setAttribute('aria-expanded', 'true');
    if (!mentionOptions.length) { menu.append(element('div', 'mention-empty', saved.length ? 'No saved images found' : 'Copy or save an image in Search to mention it here')); prompt.removeAttribute('aria-activedescendant'); return; }
    mentionOptions.forEach((item, index) => {
      const option = button('', null, () => chooseMention(index), `mention-option${index === mentionIndex ? ' selected' : ''}`); option.id = `mention-${index}`; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(index === mentionIndex)); option.tabIndex = -1;
      const img = element('img'); img.src = item.previewUrl; img.alt = ''; option.append(img, element('span', '', nameOf(item)));
      option.addEventListener('mousedown', event => event.preventDefault()); menu.append(option);
    });
    prompt.setAttribute('aria-activedescendant', `mention-${mentionIndex}`);
  }
  function chooseMention(index) {
    const item = mentionOptions[index]; if (!item || !addReference(item)) return;
    const start = mentionStart, end = prompt.selectionStart;
    prompt.setRangeText('', start, end, 'end'); closeMentions(); persistDraft(); updateSubmit(); prompt.focus();
  }
  async function submit(event) {
    event.preventDefault(); if (!prompt.value.trim() || uploadCount) return;
    closeMentions();
    const snapshot = { prompt: prompt.value.trim(), references: references.map(ref => ({ id: ref.id, name: ref.name })), size: $('#generation-size').value, quality: $('#generation-quality').value };
    try {
      await api.generateImage(snapshot);
      persistDraft(); await refresh(); $('#generation-grid').scrollTop = 0;
    } catch (error) { toast(error.message, true); }
    finally { updateSubmit(); if (activeModule === 'generator') prompt.focus(); }
  }
  function clearComposer() {
    referenceEpoch++; prompt.value = ''; references = []; closeMentions(); renderReferences(); persistDraft(); prompt.focus();
  }
  $('#clear-generation').addEventListener('click', clearComposer);
  document.addEventListener('keydown', event => {
    if (activeModule === 'generator' && !document.querySelector('dialog[open]') && (event.metaKey || event.ctrlKey) && event.key === 'Backspace') {
      event.preventDefault(); event.stopPropagation(); clearComposer();
    }
  });
  function previewActions(item) {
    const actions = element('div');
    actions.append(button('Use as reference', 'plus', () => { if (addReference(item)) { $('#preview-dialog').close(); selectModule('generator'); } }), button('Copy', 'copy', () => perform('copy', item, null)), button('Save', 'save', () => perform('save', item, null)));
    return actions;
  }
  $('#attach-reference').innerHTML = icon('attach'); $('#generate-button').innerHTML = icon('arrowUp');
  $('#attach-reference').addEventListener('click', () => $('#reference-file').click());
  $('#reference-file').addEventListener('change', event => { upload(event.target.files); event.target.value = ''; });
  $('#mention-reference').addEventListener('click', () => { prompt.focus(); const prefix = prompt.selectionStart && !/\s/.test(prompt.value[prompt.selectionStart - 1]) ? ' @' : '@'; prompt.setRangeText(prefix, prompt.selectionStart, prompt.selectionEnd, 'end'); mentionIndex = 0; renderMentions(); updateSubmit(); });
  prompt.addEventListener('input', () => { mentionIndex = 0; renderMentions(); updateSubmit(); persistDraft(); });
  prompt.addEventListener('click', renderMentions);
  prompt.addEventListener('keydown', event => {
    if (!$('#mention-menu').hidden) {
      if (['ArrowDown', 'ArrowUp'].includes(event.key) && mentionOptions.length) { event.preventDefault(); event.stopPropagation(); mentionIndex = (mentionIndex + (event.key === 'ArrowDown' ? 1 : mentionOptions.length - 1)) % mentionOptions.length; renderMentions(); return; }
      if (['Enter', 'Tab'].includes(event.key) && mentionOptions.length) { event.preventDefault(); event.stopPropagation(); chooseMention(mentionIndex); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMentions(); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) form.requestSubmit(); }
  });
  form.addEventListener('submit', submit);
  for (const id of ['generation-size', 'generation-quality']) $('#' + id).addEventListener('change', persistDraft);
  document.addEventListener('pointerdown', event => { if (!form.contains(event.target)) closeMentions(); });
  form.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; form.classList.add('drag-over'); });
  form.addEventListener('dragleave', event => { if (!form.contains(event.relatedTarget)) form.classList.remove('drag-over'); });
  form.addEventListener('drop', event => {
    event.preventDefault(); form.classList.remove('drag-over');
    const internal = event.dataTransfer.getData('application/x-agent-image');
    if (internal) { try { const ref = JSON.parse(internal); const item = readyImages().find(item => item.id === ref.id); if (item) addReference(item); } catch {} }
    else if (event.dataTransfer.files.length) upload(event.dataTransfer.files);
  });
  prompt.addEventListener('paste', event => { const files = [...event.clipboardData.files]; if (files.length) { event.preventDefault(); upload(files); } });
  window.generator = { refresh, importSearch, previewActions };
  api.onGenerations(refresh); window.addEventListener('beforeunload', persistDraft);
  renderReferences(); refresh();
})();
