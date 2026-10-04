import * as db from './db.js';
import { createWheel } from './wheel.js';

const MIN = 1, MAX = 5;
const MIN_SLICES = 24; // repeat options until the wheel has at least this many slices

const $ = (sel) => document.querySelector(sel);
const reveal = $('#reveal');
const wheel = createWheel($('#wheel'), {
  // tap a slice to read its full text; tap it again (or spin) to let it go
  onTap(label) {
    const same = reveal.classList.contains('shown') && reveal.textContent === label;
    reveal.textContent = label;
    reveal.classList.toggle('shown', !same);
  },
  onSpin() {
    reveal.classList.remove('shown');
  },
});
const settingsBtn = $('#settings-btn');
const settings = $('#settings');
const list = $('#options');

let items = [];
let maxEffort = MAX;

const clamp = (n) => Math.min(MAX, Math.max(MIN, Number(n) || MIN));
const normalize = (it) => ({
  id: it.id ?? crypto.randomUUID(),
  label: String(it.label ?? '').trim() || '—',
  effort: clamp(it.effort),
  weight: clamp(it.weight),
  createdAt: Number.isFinite(it.createdAt) ? it.createdAt : Date.now(),
});

// ---------- wheel slices ----------

// Each option gets `weight` slices, spread evenly around the wheel
// (smooth weighted round-robin), then the whole pattern repeats so the wheel
// always has enough slices for only a few to be visible at once.
function buildSlices() {
  const eligible = items.filter((it) => it.effort <= maxEffort);
  if (!eligible.length) return Array(MIN_SLICES).fill('');

  const total = eligible.reduce((n, it) => n + it.weight, 0);
  const current = eligible.map(() => 0);
  const pattern = [];
  for (let n = 0; n < total; n++) {
    let best = 0;
    eligible.forEach((it, i) => {
      current[i] += it.weight;
      if (current[i] > current[best]) best = i;
    });
    current[best] -= total;
    pattern.push(eligible[best].label);
  }

  // rotate so the pattern doesn't meet itself with the same option at the seam
  const seam = pattern.findIndex((label, i) => label !== pattern.at(i - 1));
  if (seam > 0) pattern.push(...pattern.splice(0, seam));

  let reps = Math.ceil(MIN_SLICES / total);
  if ((reps * total) % 2) reps++; // even count keeps the shading alternating
  return Array.from({ length: reps }, () => pattern).flat();
}

const refreshWheel = () => wheel.setSlices(buildSlices());

// ---------- settings ----------

function renderMaxEffort() {
  const scale = $('#max-effort');
  scale.replaceChildren(...Array.from({ length: MAX }, (_, i) => {
    const n = i + 1;
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'radio';
    b.textContent = n;
    b.setAttribute('aria-checked', n === maxEffort);
    b.onclick = async () => {
      maxEffort = n;
      await db.put('settings', n, 'maxEffort');
      renderMaxEffort();
      renderOptions();
      refreshWheel();
    };
    return b;
  }));
}

function stepper(item, key) {
  const wrap = document.createElement('div');
  wrap.className = 'stepper';
  const down = document.createElement('button');
  const up = document.createElement('button');
  const out = document.createElement('output');
  down.type = up.type = 'button';
  down.textContent = '−';
  up.textContent = '+';
  down.ariaLabel = `Decrease ${key}`;
  up.ariaLabel = `Increase ${key}`;
  out.textContent = item[key];
  down.disabled = item[key] <= MIN;
  up.disabled = item[key] >= MAX;
  down.onclick = () => update(item, { [key]: item[key] - 1 });
  up.onclick = () => update(item, { [key]: item[key] + 1 });
  wrap.append(down, out, up);
  return wrap;
}

function renderOptions() {
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'nothing yet';
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    li.classList.toggle('out', item.effort > maxEffort);

    const label = document.createElement('input');
    label.className = 'label';
    label.value = item.label;
    label.enterKeyHint = 'done';
    label.onchange = () => {
      const v = label.value.trim();
      if (v) update(item, { label: v });
      else label.value = item.label;
    };
    label.onkeydown = (e) => { if (e.key === 'Enter') label.blur(); };

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = '✕';
    del.ariaLabel = `Delete ${item.label}`;
    del.onclick = async () => {
      await db.remove('items', item.id);
      items = items.filter((it) => it !== item);
      renderOptions();
      refreshWheel();
    };

    li.append(label, stepper(item, 'effort'), stepper(item, 'weight'), del);
    return li;
  }));
}

async function update(item, changes) {
  Object.assign(item, changes);
  await db.put('items', item);
  renderOptions();
  refreshWheel();
}

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#add-input');
  const label = input.value.trim();
  if (!label) return;
  const item = { id: crypto.randomUUID(), label, effort: 1, weight: 1, createdAt: Date.now() };
  await db.put('items', item);
  items.push(item);
  input.value = '';
  renderOptions();
  refreshWheel();
  list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ---------- backup ----------
// Data survives app updates, but not removing the app from the home screen.

$('#export-btn').addEventListener('click', async () => {
  const backup = { app: 'wheel-of-fate', exportedAt: new Date().toISOString(), maxEffort, items };
  const name = `wheel-of-fate-${backup.exportedAt.slice(0, 10)}.json`;
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' });
  // On iOS the share sheet is the way to save a file (Save to Files, AirDrop…)
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch { /* cancelled */ }
  } else {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
    a.click();
    URL.revokeObjectURL(a.href);
  }
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let backup;
  try {
    backup = JSON.parse(await file.text());
    if (backup?.app !== 'wheel-of-fate' || !Array.isArray(backup.items)) throw new Error();
  } catch {
    alert('That file isn’t a Wheel of Fate backup.');
    return;
  }
  const n = backup.items.length;
  if (!confirm(`Replace your current options with the ${n} in this backup?`)) return;

  await db.clear('items');
  items = backup.items.map(normalize).sort((a, b) => a.createdAt - b.createdAt);
  for (const item of items) await db.put('items', item);
  maxEffort = clamp(backup.maxEffort ?? MAX);
  await db.put('settings', maxEffort, 'maxEffort');
  renderMaxEffort();
  renderOptions();
  refreshWheel();
});

settingsBtn.addEventListener('click', () => {
  const open = settings.hidden;
  settings.hidden = !open;
  document.body.classList.toggle('settings-open', open);
  settingsBtn.setAttribute('aria-expanded', open);
  if (!open) document.activeElement?.blur();
});

// ---------- startup ----------

items = (await db.getAll('items')).map(normalize).sort((a, b) => a.createdAt - b.createdAt);
maxEffort = clamp((await db.get('settings', 'maxEffort')) ?? MAX);

renderMaxEffort();
renderOptions();
refreshWheel();
db.requestPersistence();

// ---------- automatic updates ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
}

// The deploy writes version.json. An installed iOS app is usually resumed
// rather than relaunched, so check for a newer deploy whenever it comes back
// to the foreground and reload into it.
async function deployedVersion() {
  try {
    const res = await fetch('./version.json', { cache: 'no-store' });
    return res.ok ? (await res.json()).version : null;
  } catch {
    return null; // offline
  }
}

const bootVersion = await deployedVersion();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !bootVersion) return;
  const latest = await deployedVersion();
  if (latest && latest !== bootVersion) location.reload();
});
