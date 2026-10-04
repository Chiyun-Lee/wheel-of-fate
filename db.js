// Small promise wrapper around IndexedDB.
//
// When the app is installed to the iOS home screen it gets its own storage
// partition, separate from Safari's. That data survives app restarts and
// reboots, but is deleted if the app is removed from the home screen —
// hence the export/import helpers below.

const DB_NAME = 'wheel-of-fate';
const DB_VERSION = 1;
const STORES = ['items'];

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Add new stores / indexes here and bump DB_VERSION.
      if (!db.objectStoreNames.contains('items')) {
        db.createObjectStore('items', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const remove = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
export const clear = (store) => run(store, 'readwrite', (s) => s.clear());

// Ask the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  return (await navigator.storage.persisted()) || navigator.storage.persist();
}

export async function exportAll() {
  const data = {};
  for (const store of STORES) data[store] = await getAll(store);
  return { app: DB_NAME, version: DB_VERSION, exportedAt: new Date().toISOString(), data };
}

export async function importAll(backup) {
  if (backup?.app !== DB_NAME) throw new Error('Not a Wheel of Fate backup');
  for (const store of STORES) {
    await clear(store);
    for (const value of backup.data[store] ?? []) await put(store, value);
  }
}
