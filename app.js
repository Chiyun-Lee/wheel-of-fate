import * as db from './db.js';

const $ = (sel) => document.querySelector(sel);
const list = $('#items');
const status = $('#status');

async function render() {
  const items = (await db.getAll('items')).sort((a, b) => a.createdAt - b.createdAt);
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = item.label;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.ariaLabel = `Delete ${item.label}`;
    del.onclick = async () => { await db.remove('items', item.id); render(); };
    li.append(label, del);
    return li;
  }));
}

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#add-input');
  const label = input.value.trim();
  if (!label) return;
  await db.put('items', { id: crypto.randomUUID(), label, createdAt: Date.now() });
  input.value = '';
  render();
});

$('#export-btn').addEventListener('click', async () => {
  const backup = await db.exportAll();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const file = new File([blob], `wheel-of-fate-${backup.exportedAt.slice(0, 10)}.json`, { type: blob.type });
  // On iOS, the share sheet is the friendliest way to save a file (Files, AirDrop, etc.)
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch { /* user cancelled */ }
  } else {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
    a.click();
    URL.revokeObjectURL(a.href);
  }
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await db.importAll(JSON.parse(await file.text()));
    status.textContent = 'Backup restored.';
    render();
  } catch (err) {
    status.textContent = `Import failed: ${err.message}`;
  }
  e.target.value = '';
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const persisted = await db.requestPersistence();
status.textContent = standalone
  ? `Installed app · storage ${persisted ? 'persistent' : 'best-effort'}`
  : 'Tip: Share → Add to Home Screen to install.';

render();
