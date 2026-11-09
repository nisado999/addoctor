/* A small keep-it-for-later store in IndexedDB, for work too big for localStorage: the Create an ad page with its finished ads.
   Every call resolves and never throws; a blocked or full browser just means nothing is kept. */
const DB = "addoctor.draft", STORE = "kv";

const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

export async function draftGet(key) {
  try {
    const db = await open();
    return await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result == null ? null : q.result); q.onerror = () => rej(q.error); });
  } catch (e) { return null; }
}

// A value of null removes the entry.
export async function draftSet(key, value) {
  try {
    const db = await open();
    await new Promise((res, rej) => {
      const t = db.transaction(STORE, "readwrite");
      if (value == null) t.objectStore(STORE).delete(key); else t.objectStore(STORE).put(value, key);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  } catch (e) { /* nothing kept */ }
}
