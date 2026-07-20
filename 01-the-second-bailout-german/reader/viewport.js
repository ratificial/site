export function lineOuterHeightPx(line, lineHeightPx) {
  if (!line) return lineHeightPx;
  if (typeof line.outerHeightPx === "number" && Number.isFinite(line.outerHeightPx)) return line.outerHeightPx;
  return lineHeightPx;
}

export function buildLineHeightIndex(lines, lineHeightPx) {
  const lineBoxHeights = new Array(lines.length);
  const lineHeightPrefix = new Array(lines.length + 1);
  lineHeightPrefix[0] = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = lineOuterHeightPx(lines[i], lineHeightPx);
    lineBoxHeights[i] = h;
    lineHeightPrefix[i + 1] = lineHeightPrefix[i] + h;
  }
  return { lineBoxHeights, lineHeightPrefix };
}

export function findChapterEndOffset(lines, start) {
  if (!lines.length) return 0;
  const chapterNr = lines[start].chapterNr;
  let idx = start;
  while (idx < lines.length && lines[idx].chapterNr === chapterNr) idx += 1;
  return idx;
}

export function computePageEndOffset(lines, lineHeightPrefix, startOffset, availablePx, lockChapterBoundary) {
  if (!lines.length) return 0;
  const start = Math.max(0, Math.min(lines.length - 1, startOffset));
  const hardLimit = lockChapterBoundary ? findChapterEndOffset(lines, start) : lines.length;
  const startPrefix = lineHeightPrefix[start];
  const target = startPrefix + availablePx;
  let lo = start + 1;
  let hi = Math.max(start + 1, hardLimit);
  let best = Math.min(hardLimit, start + 1);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (lineHeightPrefix[mid] <= target) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(start + 1, best);
}

export function computePageStartOffsetFromEnd(lines, lineHeightPrefix, endOffset, availablePx, lockChapterBoundary) {
  if (!lines.length) return 0;
  const end = Math.max(1, Math.min(lines.length, endOffset));
  let floor = 0;
  if (lockChapterBoundary) {
    const chapterNr = lines[end - 1].chapterNr;
    let i = end - 1;
    while (i > 0 && lines[i - 1].chapterNr === chapterNr) i -= 1;
    floor = i;
  }
  const target = lineHeightPrefix[end] - availablePx;
  let lo = floor;
  let hi = end - 1;
  let best = end - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (lineHeightPrefix[mid] >= target) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return Math.max(floor, Math.min(best, end - 1));
}

export function maxReachableOffset(lines, lineHeightPrefix, availablePx, lockChapterBoundary = false) {
  if (!lines.length) return 0;
  return computePageStartOffsetFromEnd(lines, lineHeightPrefix, lines.length, availablePx, lockChapterBoundary);
}

export function maxReachableScrollY(lines, lineHeightPrefix, availablePx, lockChapterBoundary = false) {
  if (!lines.length) return 0;
  const off = maxReachableOffset(lines, lineHeightPrefix, availablePx, lockChapterBoundary);
  return Math.max(0, lineHeightPrefix[off] || 0);
}

export function offsetForContentY(lines, lineHeightPrefix, yPx, maxY, availablePx, lockChapterBoundary) {
  if (!lines.length) return 0;
  const y = Math.max(0, Math.min(maxY, yPx));
  if (y >= maxY - 1) {
    return computePageStartOffsetFromEnd(lines, lineHeightPrefix, lines.length, availablePx, lockChapterBoundary);
  }
  let lo = 0;
  let hi = lines.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (lineHeightPrefix[mid] <= y) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (!lockChapterBoundary) return best;
  const ch = lines[best].chapterNr;
  let start = best;
  while (start > 0 && lines[start - 1].chapterNr === ch) start -= 1;
  return start;
}

export function contentYForOffset(lines, lineHeightPrefix, offset, maxY) {
  if (!lines.length) return 0;
  const idx = Math.max(0, Math.min(lines.length - 1, offset));
  return Math.max(0, Math.min(maxY, lineHeightPrefix[idx] || 0));
}

export function clampOffsetForMinimumChapterFill(lines, lineHeightPrefix, startOffset, availablePx, minFillRatio = 0.5) {
  if (!lines.length) return 0;
  const start = Math.max(0, Math.min(lines.length - 1, startOffset));
  const chapterNr = lines[start].chapterNr;
  let chapterStart = start;
  while (chapterStart > 0 && lines[chapterStart - 1].chapterNr === chapterNr) chapterStart -= 1;

  const targetFillPx = availablePx * Math.max(0, Math.min(1, minFillRatio));
  let cur = start;
  while (cur > chapterStart) {
    const end = computePageEndOffset(lines, lineHeightPrefix, cur, availablePx, true);
    const filled = (lineHeightPrefix[end] || 0) - (lineHeightPrefix[cur] || 0);
    if (filled >= targetFillPx) break;
    cur -= 1;
  }
  return cur;
}

export function computeViewportBounds(reader, margins) {
  const { topPx, bottomPx } = margins;
  if (!reader) {
    const top = topPx;
    const bottom = window.innerHeight - bottomPx;
    return { top, bottom, height: Math.max(120, bottom - top) };
  }
  const rr = reader.getBoundingClientRect();
  const cs = window.getComputedStyle(reader);
  const readerTop = rr.top + (parseFloat(cs.paddingTop) || 0);
  const readerBottom = rr.bottom - (parseFloat(cs.paddingBottom) || 0);
  const frameTop = topPx;
  const frameBottom = window.innerHeight - bottomPx;
  const top = Math.max(readerTop, frameTop);
  const bottom = Math.min(readerBottom, frameBottom);
  return { top, bottom, height: Math.max(120, bottom - top) };
}

export function updateViewportDebugOverlay(params) {
  const {
    frame,
    root,
    topLine,
    bottomLine,
    label,
    bounds,
    ready,
    enabled,
  } = params;
  if (!root || !topLine || !bottomLine || !label) return;
  if (!ready) {
    if (frame) frame.classList.remove("active");
    root.classList.remove("active");
    return;
  }
  if (frame) {
    frame.classList.toggle("active", enabled);
    frame.style.top = `${Math.round(bounds.top)}px`;
    frame.style.bottom = `${Math.max(0, Math.round(window.innerHeight - bounds.bottom))}px`;
  }
  if (!enabled) {
    root.classList.remove("active");
    return;
  }
  root.classList.add("active");
  topLine.style.top = `${Math.round(bounds.top)}px`;
  bottomLine.style.top = `${Math.round(bounds.bottom)}px`;
  label.textContent = [
    `slicerTop: ${Math.round(bounds.top)}px`,
    `slicerBottom: ${Math.round(bounds.bottom)}px`,
    `slicerHeight: ${Math.round(bounds.height)}px`,
    `scrollY: ${Math.round(window.scrollY)}px`,
    `scrollYBottom: ${Math.round(window.scrollY + bounds.bottom)}px`,
  ].join("\n");
}

export function createViewportRebuildScheduler(ctx) {
  let viewportChangeLock = false;
  let viewportChangeAnchor = null;
  let viewportRebuildTimer = null;

  function beginViewportChange() {
    if (!viewportChangeLock) {
      viewportChangeAnchor = ctx.currentTopLocation();
      viewportChangeLock = true;
    }
  }

  function isViewportChangeLock() {
    return viewportChangeLock;
  }

  function setViewportChangeLock(next) {
    viewportChangeLock = !!next;
    if (!viewportChangeLock) viewportChangeAnchor = null;
  }

  function scheduleViewportRebuild() {
    if (!ctx.getInitDone()) return;
    beginViewportChange();
    if (viewportRebuildTimer) clearTimeout(viewportRebuildTimer);
    viewportRebuildTimer = setTimeout(async () => {
      viewportRebuildTimer = null;
      const anchor = viewportChangeAnchor || ctx.currentTopLocation();
      await ctx.waitForFontsReady();
      await ctx.buildLineModel();
      ctx.afterModelRebuild(anchor);
      viewportChangeAnchor = null;
      viewportChangeLock = false;
    }, 140);
  }

  return {
    beginViewportChange,
    isViewportChangeLock,
    setViewportChangeLock,
    scheduleViewportRebuild,
  };
}
