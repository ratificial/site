export function chapterIdAt(book, index) {
  const item = book[index];
  if (!item) return index;
  return Number.isInteger(item.id) ? item.id : index;
}

export function findBookByChapterNr(book, chapterNr) {
  return book.find((entry) => entry.id === chapterNr) || null;
}

export async function loadBookConfig(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to load ${path}: HTTP ${resp.status}`);
  const cfg = await resp.json();
  if (!Array.isArray(cfg.book)) throw new Error('book.json missing "book" array');

  function normalizeResponsiveBg(bg, idx) {
    if (!bg || typeof bg !== "object") {
      throw new Error(`book.json chapter ${idx} missing responsive bg map`);
    }
    const normalized = {};
    const keys = Object.keys(bg);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!/^\d+$/.test(k)) continue;
      const v = bg[k];
      if (typeof v !== "string" || !v.length) continue;
      normalized[k] = v;
    }
    if (!Object.keys(normalized).length) {
      throw new Error(`book.json chapter ${idx} has empty responsive bg map`);
    }
    return normalized;
  }

  const book = cfg.book.map((entry, idx) => ({
    id: Number.isInteger(entry.id) ? entry.id : idx,
    title: typeof entry.title === "string" ? entry.title : `Chapter ${Number.isInteger(entry.id) ? entry.id : idx}`,
    file: entry.file,
    compiled: typeof entry.compiled === "string" ? entry.compiled : "",
    bg: normalizeResponsiveBg(entry.bg, idx),
  })).filter((entry) => typeof entry.file === "string" && entry.file.length > 0);
  const locales = Array.isArray(cfg.locales)
    ? cfg.locales.filter((x) => x && typeof x.slug === "string" && x.slug.length > 0)
    : [];
  if (!book.length) throw new Error("book.json contained no valid chapters");
  return { book, locales };
}

export function currentBookSlugFromPath(path, locales) {
  for (let i = 0; i < locales.length; i++) {
    const slug = locales[i].slug;
    if (path.includes(`/${slug}/`)) return slug;
  }
  return null;
}

export function populateLocaleSelect(localeSelect, locales, currentSlug) {
  if (!localeSelect) return;
  localeSelect.innerHTML = "";
  for (let i = 0; i < locales.length; i++) {
    const loc = locales[i];
    const opt = document.createElement("option");
    opt.value = loc.slug;
    opt.textContent = typeof loc.label === "string" && loc.label ? loc.label : (loc.code || loc.slug);
    localeSelect.appendChild(opt);
  }
  if (currentSlug) localeSelect.value = currentSlug;
}

export async function loadChapterText(chapter, chapterNr, cache, onWarn) {
  const key = chapter && typeof chapter.file === "string" ? chapter.file : "";
  if (!key) return "";
  if (cache.has(key)) return cache.get(key);
  try {
    const resp = await fetch(key);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const md = await resp.text();
    cache.set(key, md);
    return md;
  } catch (e) {
    if (typeof onWarn === "function") onWarn({ ch: chapterNr, file: key, error: String(e) });
    cache.set(key, "");
    return "";
  }
}

export async function loadChapterCompiled(chapter, chapterNr, cache, onWarn) {
  const key = chapter && typeof chapter.compiled === "string" ? chapter.compiled : "";
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  try {
    const resp = await fetch(key);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data || !Array.isArray(data.blocks)) throw new Error("Invalid compiled chapter format");
    cache.set(key, data);
    return data;
  } catch (e) {
    if (typeof onWarn === "function") onWarn({ ch: chapterNr, file: key, error: String(e) });
    cache.set(key, null);
    return null;
  }
}

export function chapterTitleFromMd(md, fallback, normalizeMd, cleanInline) {
  const src = normalizeMd(md).split("\n");
  for (let i = 0; i < src.length; i++) {
    const m = /^#{1,2}\s+(.+)\s*$/.exec(src[i].trim());
    if (m) return { title: cleanInline(m[1]).trim(), headingLevel: (src[i].trim().match(/^#+/) || ["##"])[0].length };
  }
  return { title: fallback, headingLevel: 2 };
}
