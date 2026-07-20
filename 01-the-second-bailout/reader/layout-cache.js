const DB_NAME = "rat-reader-layout-v1";
const STORE = "chapterLayouts";
const MAX_ENTRIES = 240;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function hashString(input) {
  const str = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function makeChapterLayoutKey(params) {
  const {
    namespace,
    chapterNr,
    fontSize,
    renderingMode,
    widthPx,
    normalSpaceWidth,
    hyphenWidth,
    contentHash,
    version,
  } = params;
  const widthBucket = Math.max(240, Math.round(Number(widthPx || 0) / 8) * 8);
  return [
    namespace,
    `ch${chapterNr}`,
    `v${version}`,
    `f${fontSize}`,
    `m${renderingMode}`,
    `w${widthBucket}`,
    `s${Math.round(Number(normalSpaceWidth || 0) * 100)}`,
    `h${Math.round(Number(hyphenWidth || 0) * 100)}`,
    `c${contentHash}`,
  ].join("|");
}

export async function getChapterLayout(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => resolve(null);
  });
}

export async function putChapterLayout(key, value) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function pruneLayoutCache(maxEntries = MAX_ENTRIES) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const rows = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        if (rows.length <= maxEntries) {
          resolve();
          return;
        }
        rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        for (let i = maxEntries; i < rows.length; i++) store.delete(rows[i].key);
        resolve();
        return;
      }
      rows.push({ key: cursor.key, updatedAt: (cursor.value && cursor.value.updatedAt) || 0 });
      cursor.continue();
    };
    req.onerror = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function clearLayoutCache() {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
