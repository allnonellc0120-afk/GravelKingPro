// Tiny promise-based IndexedDB key/value helper (no dependency).
//
// Used to persist large binary results (e.g. split stems) across a full tab
// reload — critical on iPad/iOS Safari, which aggressively reloads or kills
// backgrounded tabs (split screen, app switch) under memory pressure. Blobs are
// stored natively via structured clone, so we keep work safe across a crash.
//
// All access is guarded so it no-ops gracefully where IndexedDB is unavailable
// (e.g. the static prerender pass, or private-mode quirks).

const DB_NAME = "gkp";
const STORE = "kv";
const VERSION = 1;

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  if (!hasIDB()) return undefined;
  try {
    const db = await openDB();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, val: unknown): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Quota exceeded / private mode — fail silently; persistence is best-effort.
  }
}

export async function idbDel(key: string): Promise<void> {
  if (!hasIDB()) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
