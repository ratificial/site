export function buildLocationKey(loc) {
  if (!loc) return "";
  return `${loc.chapterNr}-${loc.paragraphNr}-${loc.lineNr}`;
}

export function buildLocationIndex(lines) {
  const index = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    index.set(buildLocationKey(line), i);
  }
  return index;
}

export function buildChapterRanges(lines) {
  const ranges = new Map();
  if (!lines.length) return ranges;
  let start = 0;
  while (start < lines.length) {
    const ch = lines[start].chapterNr;
    let end = start + 1;
    while (end < lines.length && lines[end].chapterNr === ch) end += 1;
    ranges.set(ch, { start, end });
    start = end;
  }
  return ranges;
}

export function createLayoutSnapshot(lines, buildLineHeightIndex, lineHeightPx) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const { lineBoxHeights, lineHeightPrefix } = buildLineHeightIndex(safeLines, lineHeightPx);
  return {
    lines: safeLines,
    lineBoxHeights,
    lineHeightPrefix,
    locationIndex: buildLocationIndex(safeLines),
    chapterRanges: buildChapterRanges(safeLines),
    version: Date.now(),
  };
}

export function findOffsetFromLocation(lines, layoutSnapshot, loc) {
  if (layoutSnapshot && layoutSnapshot.locationIndex) {
    const key = buildLocationKey(loc);
    if (layoutSnapshot.locationIndex.has(key)) return layoutSnapshot.locationIndex.get(key);
  }
  if (!loc) return 0;
  if (loc.chapterNr === 0 && loc.paragraphNr === 0 && loc.lineNr === 0) {
    const chapterStart = lines.findIndex((l) => l.chapterNr === 0);
    return chapterStart >= 0 ? chapterStart : 0;
  }
  if (loc.paragraphNr === 0 || loc.lineNr >= 9999) {
    const chapterStart = lines.findIndex((l) => l.chapterNr === loc.chapterNr && l.kind !== "spacer");
    return chapterStart >= 0 ? chapterStart : 0;
  }
  const idx = lines.findIndex((l) => l.chapterNr === loc.chapterNr && l.paragraphNr === loc.paragraphNr && l.lineNr === loc.lineNr);
  if (idx >= 0) return idx;
  const paraIdx = lines.findIndex((l) => l.chapterNr === loc.chapterNr && l.paragraphNr === loc.paragraphNr);
  if (paraIdx >= 0) return paraIdx;
  const chapterIdx = lines.findIndex((l) => l.chapterNr === loc.chapterNr && l.kind !== "spacer");
  if (chapterIdx >= 0) return chapterIdx;
  return 0;
}
