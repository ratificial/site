import { prepareWithSegments, layoutNextLineRange, materializeLineRange } from "./assets/esm/@chenglou/pretext@0.0.6/es2022/pretext.bundle.mjs";
import {
  cleanInline as mdCleanInline,
  warnAndCollapseProseSpaces as mdWarnAndCollapseProseSpaces,
} from "./reader/markdown-parser.js";
import {
  lineBadness as knuthLineBadness,
  normalizeLineMetrics as knuthNormalizeLineMetrics,
  layoutParagraphTokenKnuth as knuthLayoutParagraphTokenKnuth,
  isSpaceText as isSpaceTextModel,
  measureNextWordWidth as measureNextWordWidthModel,
  buildSegmentsLine as buildSegmentsLineModel,
  layoutParagraphKnuth as layoutParagraphKnuthModel,
} from "./reader/linebreaker-knuth.js";
import { isListLikeProseLine as isListLikeProseLineExtracted, renderViewport as renderViewportExtracted } from "./reader/renderer.js";
import { stripSoftHyphens as stripSoftHyphensExtracted } from "./reader/hyphenation.js";
import { logJson as debugLogJson } from "./reader/debug-telemetry.js";
import { isVerboseDebugEnabledFromUrl, isViewportDebugEnabledFromUrl, logViewportModelDebug as logViewportModelDebugExtracted } from "./reader/debug-telemetry.js";
import { addParagraphLinesToModel } from "./reader/layout.js";
import { createBackgroundController } from "./reader/background.js";
import { createLayoutSnapshot, findOffsetFromLocation as findOffsetFromLocationModel } from "./reader/model-snapshot.js";
import { attachReaderEventHandlers } from "./reader/events.js";
import { formatLocation as formatLocationModel, parseLocation as parseLocationModel, readInitialModel as readInitialModelModel, persistPrefs as persistPrefsModel } from "./reader/state.js";
import { chapterIdAt as chapterIdAtModel, findBookByChapterNr as findBookByChapterNrModel, loadBookConfig as loadBookConfigModel, currentBookSlugFromPath as currentBookSlugFromPathModel, populateLocaleSelect as populateLocaleSelectModel, loadChapterCompiled as loadChapterCompiledModel } from "./reader/book.js";
import { hashString as hashStringModel, makeChapterLayoutKey as makeChapterLayoutKeyModel, getChapterLayout as getChapterLayoutModel, putChapterLayout as putChapterLayoutModel, pruneLayoutCache as pruneLayoutCacheModel, clearLayoutCache as clearLayoutCacheModel } from "./reader/layout-cache.js";
import { setTocOpenState, updateTocActiveState, renderTocFlyout as renderTocFlyoutModel } from "./reader/toc.js";
import { measureSpaceWidth, measureDashWidth, computeReaderWidth, countJustifyGaps as countJustifyGapsModel } from "./reader/typography.js";
import {
  buildLineHeightIndex,
  lineOuterHeightPx as viewportLineOuterHeightPx,
  computePageEndOffset as computePageEndOffsetModel,
  computePageStartOffsetFromEnd as computePageStartOffsetFromEndModel,
  maxReachableOffset as maxReachableOffsetModel,
  maxReachableScrollY as maxReachableScrollYModel,
  offsetForContentY as offsetForContentYModel,
  contentYForOffset as contentYForOffsetModel,
  clampOffsetForMinimumChapterFill as clampOffsetForMinimumChapterFillModel,
  computeViewportBounds as computeViewportBoundsModel,
  updateViewportDebugOverlay as updateViewportDebugOverlayModel,
  createViewportRebuildScheduler,
} from "./reader/viewport.js";
import * as C from "./reader/constants.js";

let BOOK = [];
let BOOK_LOCALES = [];
const storageNamespace = (() => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return 'default';
  const last = parts[parts.length - 1];
  if (last.endsWith('.html') && parts.length > 1) return parts[parts.length - 2];
  return last;
})();
const LOCATION_KEY = `ratification-reader-location-${storageNamespace}`;
const PREFS_KEY = `ratification-reader-prefs-v1-${storageNamespace}`;
const FURTHEST_KEY = `ratification-reader-furthest-v1-${storageNamespace}`;
const themes = ['', 'sepia'];

let fontSize = 18;
let lineHeight = 1.75;
let renderingMode = 'compact';
let themeIdx = 0;
let lines = [];
let offsetLine = 0;
let lineHeightPx = fontSize * lineHeight;
let navigationMode = 'flip'; // 'scroll' | 'flip'
let normalSpaceWidth = 4;
let hyphenWidth = 6;

const CHAPTER_COMPILED_CACHE = new Map();
let lastRenderStartOffset = 0;
let lastRenderEndOffset = 0;
let lineBoxHeights = [];
let lineHeightPrefix = [0];
let layoutSnapshot = null;
let syncScrollLock = false;
let scrollRafPending = false;
const VERBOSE_DEBUG_LOGS = isVerboseDebugEnabledFromUrl(window.location.href);
let viewportDebugEnabled = isViewportDebugEnabledFromUrl(window.location.href);
let viewportDebugReady = false;
let backgroundsEnabled = true;
let viewportScheduler = null;
let initDone = false;
let handlersAttached = false;
let tocOpen = false;
let furthestLoc = null;
let furthestOffset = -1;
let furthestPopoverDismissed = false;
let widescreenLayout = 'right';
let backgroundChapterBuildInFlight = false;
const LAYOUT_CACHE_VERSION = 1;
let layoutCachePruneTriggered = false;
let layoutCacheHintShown = false;
let lastPersistedHash = "";
let lastHashPersistAtMs = 0;
let hashPersistDisabled = false;

const STATE = {
  view: {
    fontSize: () => fontSize,
    renderingMode: () => renderingMode,
    themeIdx: () => themeIdx,
    backgroundsEnabled: () => backgroundsEnabled,
    widescreenLayout: () => widescreenLayout,
  },
  nav: {
    offsetLine: () => offsetLine,
    navigationMode: () => navigationMode,
  },
  runtime: {
    initDone: () => initDone,
  }
};

function readState() {
  return {
    fontSize,
    renderingMode,
    themeIdx,
    backgroundsEnabled,
    widescreenLayout,
    offsetLine,
    navigationMode,
    initDone,
  };
}

function patchState(patch) {
  if (Object.prototype.hasOwnProperty.call(patch, 'fontSize')) fontSize = patch.fontSize;
  if (Object.prototype.hasOwnProperty.call(patch, 'renderingMode')) renderingMode = patch.renderingMode;
  if (Object.prototype.hasOwnProperty.call(patch, 'themeIdx')) themeIdx = patch.themeIdx;
  if (Object.prototype.hasOwnProperty.call(patch, 'backgroundsEnabled')) backgroundsEnabled = patch.backgroundsEnabled;
  if (Object.prototype.hasOwnProperty.call(patch, 'widescreenLayout')) widescreenLayout = patch.widescreenLayout;
  if (Object.prototype.hasOwnProperty.call(patch, 'offsetLine')) offsetLine = patch.offsetLine;
  if (Object.prototype.hasOwnProperty.call(patch, 'navigationMode')) navigationMode = patch.navigationMode;
  if (Object.prototype.hasOwnProperty.call(patch, 'initDone')) initDone = patch.initDone;
}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function measureNormalSpaceWidth() {
  return measureSpaceWidth(fontSize);
}

function measureHyphenWidth() {
  return measureDashWidth(fontSize);
}

async function waitForFontsReady() {
  if (!document.fonts || !document.fonts.ready) return;
  try {
    await document.fonts.ready;
  } catch (_) {
    // Ignore; fall back to current metrics.
  }
}

function formatLocation(ch, para, line) { return formatLocationModel(ch, para, line); }
function parseLocation(value) {
  return parseLocationModel(value);
}

function readInitialModel() {
  return readInitialModelModel({
    prefsKey: PREFS_KEY,
    locationKey: LOCATION_KEY,
    themes,
  });
}

function chapterIdAt(index) {
  return chapterIdAtModel(BOOK, index);
}

function locationFromHash(hashValue) {
  const raw = String(hashValue || '').trim();
  if (!raw) return null;
  const normalized = raw.startsWith('#') ? raw.slice(1) : raw;
  const pair = /^(\d+)-(\d+)$/.exec(normalized);
  if (pair) {
    return {
      chapterNr: parseInt(pair[1], 10),
      paragraphNr: parseInt(pair[2], 10),
      lineNr: 0,
    };
  }
  return null;
}

function findBookByChapterNr(chapterNr) {
  return findBookByChapterNrModel(BOOK, chapterNr);
}

const backgroundController = createBackgroundController({
  findBookByChapterNr,
  debounceMs: 500,
});

async function loadBookConfig() {
  const cfg = await loadBookConfigModel(C.BOOK_CONFIG_PATH);
  BOOK = cfg.book;
  BOOK_LOCALES = cfg.locales;
}

function currentBookSlugFromPath() {
  return currentBookSlugFromPathModel(window.location.pathname, BOOK_LOCALES);
}

function populateLocaleSelect() {
  populateLocaleSelectModel(document.getElementById('book-locale-select'), BOOK_LOCALES, currentBookSlugFromPath());
}

async function loadChapterCompiled(chapter, chapterNr) {
  return loadChapterCompiledModel(chapter, chapterNr, CHAPTER_COMPILED_CACHE, (payload) => logJson('[chapter-load-warning]', payload));
}

function persistPrefs() {
  persistPrefsModel(PREFS_KEY, readState());
}

function applyModel(model) {
  patchState({
    fontSize: Math.max(14, Math.min(32, model.fontSize)),
    renderingMode: model.renderingMode === 'comfortable' ? 'comfortable' : 'compact',
    navigationMode: model.navigationMode === 'scroll' ? 'scroll' : 'flip',
    themeIdx: Math.max(0, Math.min(themes.length - 1, model.themeIdx)),
    backgroundsEnabled: !!model.backgroundsEnabled,
    widescreenLayout: model.widescreenLayout === 'left' || model.widescreenLayout === 'center' ? model.widescreenLayout : 'right',
  });
  lineHeight = renderingMode === 'compact' ? 1.5 : 1.72;
  lineHeightPx = fontSize * lineHeight;

  document.body.style.fontSize = `${fontSize}px`;
  document.documentElement.setAttribute('data-theme', themes[themeIdx]);
  const modeSelect = document.getElementById('rendering-mode-select');
  if (modeSelect) modeSelect.value = renderingMode;
  document.documentElement.setAttribute('data-widescreen-layout', widescreenLayout);
  backgroundController.setEnabled(backgroundsEnabled);
  backgroundController.applyVisibility();
}

function persistTopLocation() {
  const top = lines[offsetLine];
  if (!top) return;
  const loc = formatLocation(top.chapterNr, top.paragraphNr, top.lineNr);
  try {
    localStorage.setItem(LOCATION_KEY, loc);
  } catch (_) {
    // Storage can be unavailable in restricted iframe/privacy contexts.
  }
  const chapterHash = `#${top.chapterNr}-${top.paragraphNr}`;
  const now = Date.now();
  if (!hashPersistDisabled && chapterHash !== lastPersistedHash && (now - lastHashPersistAtMs) >= 250) {
    try {
      if (window.location.hash !== chapterHash) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}${chapterHash}`);
      }
      lastPersistedHash = chapterHash;
      lastHashPersistAtMs = now;
    } catch (_) {
      // Some embedding/privacy contexts disallow or throttle history mutation.
      hashPersistDisabled = true;
      logJson('[hash-persist-disabled]', { reason: 'history-replace-failed' });
    }
  }
  const chapter = findBookByChapterNr(top.chapterNr);
  const title = chapter && chapter.title ? chapter.title : `Chapter ${top.chapterNr}`;
  document.getElementById('toolbar-title').textContent = title;
  updateFurthestFromCurrent();
  updateResumeUi();
  updateTocActive();
}

function setFurthestLoc(loc) {
  if (!loc) return;
  furthestLoc = { chapterNr: loc.chapterNr, paragraphNr: loc.paragraphNr, lineNr: loc.lineNr };
  furthestOffset = findOffsetFromLocation(furthestLoc);
  try {
    localStorage.setItem(FURTHEST_KEY, formatLocation(furthestLoc.chapterNr, furthestLoc.paragraphNr, furthestLoc.lineNr));
  } catch (_) {
    // Storage can be unavailable in restricted iframe/privacy contexts.
  }
}

function updateFurthestFromCurrent() {
  const top = lines[offsetLine];
  if (!top) return;
  if (offsetLine > furthestOffset) {
    setFurthestLoc({ chapterNr: top.chapterNr, paragraphNr: top.paragraphNr, lineNr: top.lineNr });
    furthestPopoverDismissed = false;
  }
}

function isBehindFurthest() {
  return furthestOffset >= 0 && offsetLine < furthestOffset;
}

function updateResumeUi() {
  const pop = document.getElementById('resume-popover');
  if (!pop) return;
  const shouldShow = initDone && !furthestPopoverDismissed && isBehindFurthest();
  pop.classList.toggle('active', shouldShow);
  pop.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  updateTocActive();
}

function jumpToFurthest() {
  if (!furthestLoc) return;
  patchState({ offsetLine: findOffsetFromLocation(furthestLoc), navigationMode: 'scroll' });
  persistPrefs();
  furthestPopoverDismissed = false;
  syncScrollToOffset();
  renderViewport();
}

function renderTocFlyout() {
  renderTocFlyoutModel({
    el: document.getElementById('toc-flyout'),
    book: BOOK,
    chapterIdAt,
    furthestLoc,
    findBookByChapterNr,
    onJumpToFurthest: jumpToFurthest,
    onSetTocOpen: setTocOpen,
    onScrollToChapter: (i) => scrollToChapter(i),
    onUpdateTocActive: updateTocActive,
    controls: {
      fontSize,
      renderingMode,
      backgroundsEnabled,
      themeIdx,
      widescreenLayout,
      locales: BOOK_LOCALES,
      currentLocaleSlug: currentBookSlugFromPath(),
      onSetFontSize: (size) => window.setFontSize(size),
      onChangeRenderingMode: (mode) => window.changeRenderingMode(mode),
      onSetBackgroundsEnabled: (enabled) => window.setBackgroundsEnabled(enabled),
      onSetTheme: (idx) => window.setTheme(idx),
      onSetWidescreenLayout: (layout) => window.setWidescreenLayout(layout),
      onSwitchLocale: (slug) => window.switchBookLocale(slug),
    },
  });
}

function updateTocActive() {
  const top = lines[offsetLine];
  const activeChapter = top ? top.chapterNr : 0;
  updateTocActiveState({
    flyout: document.getElementById('toc-flyout'),
    activeChapter,
    isBehindFurthest: isBehindFurthest(),
  });
}

function setTocOpen(open) {
  if (open) {
    furthestPopoverDismissed = true;
  }
  tocOpen = setTocOpenState(open, document.getElementById('toc-flyout'), document.getElementById('toc-toggle'));
  if (open) updateResumeUi();
}

function updatePagingNextControl(meta) {
  const root = document.getElementById('paging-next');
  const btn = document.getElementById('paging-next-btn');
  if (!root || !btn) return;
  const cta = meta && meta.flipCta ? meta.flipCta : null;
  const visible = !!(cta && cta.visible);
  root.classList.toggle('active', visible);
  root.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (!visible) return;
  btn.textContent = cta.label || 'next page >';
  btn.onclick = () => {
    patchState({ offsetLine: Math.max(0, Math.min(lines.length - 1, cta.endOffset)), navigationMode: 'flip' });
    persistPrefs();
    syncScrollToOffset();
    renderViewport();
  };
}

function readerWidth() {
  return computeReaderWidth(document.getElementById('reader'));
}

function countJustifyGaps(text) {
  return countJustifyGapsModel(text);
}

function isSpaceText(text) {
  return isSpaceTextModel(text);
}

function isListLikeProseLine(text) {
  return isListLikeProseLineExtracted(text);
}

function logJson(tag, payload) {
  return debugLogJson(tag, payload);
}

function lineBadness(lineStats, maxWidth, normalSpace) {
  return knuthLineBadness(lineStats, maxWidth, normalSpace, {
    HUGE_BADNESS: C.HUGE_BADNESS,
    SHORT_LINE_RATIO: C.SHORT_LINE_RATIO,
    INFEASIBLE_SPACE_RATIO: C.INFEASIBLE_SPACE_RATIO,
    MAX_SPACE_EXPANSION_RATIO: C.MAX_SPACE_EXPANSION_RATIO,
    RIVER_THRESHOLD: C.RIVER_THRESHOLD,
    TIGHT_SPACE_RATIO: C.TIGHT_SPACE_RATIO,
    HYPHEN_PENALTY: C.HYPHEN_PENALTY,
  });
}

function normalizeLineMetrics(line) {
  return knuthNormalizeLineMetrics(line, countJustifyGaps);
}

function measureNextWordWidth(prepared, segIndex) {
  return measureNextWordWidthModel(prepared, segIndex, C.SOFT_HYPHEN);
}

const wordWidthCache = new Map();
function measureTokenWidth(token, font) {
  const visibleToken = stripSoftHyphensExtracted(token);
  const key = `${font}::${visibleToken}`;
  const cached = wordWidthCache.get(key);
  if (cached !== undefined) return cached;
  const prepared = prepareWithSegments(visibleToken, font, { whiteSpace: 'pre-wrap' });
  let w = 0;
  for (let i = 0; i < prepared.widths.length; i++) {
    if (prepared.segments[i] === C.SOFT_HYPHEN) continue;
    w += prepared.widths[i] || 0;
  }
  wordWidthCache.set(key, w);
  return w;
}

function layoutParagraphTokenKnuth(text, chapterNr, paragraphNr, width, useFirstLineIndent, indentPx) {
  return knuthLayoutParagraphTokenKnuth(text, chapterNr, paragraphNr, width, useFirstLineIndent, indentPx, {
    fontSize,
    normalSpaceWidth,
    measureTokenWidth,
    lineBadnessFn: lineBadness,
    normalizeLineMetricsFn: normalizeLineMetrics,
  });
}

function buildSegmentsLine(prepared, fromSeg, toSeg, breakKind, chapterNr, paragraphNr, lineNr, lineMaxWidth, kind, indentPx, prematureWrap = false) {
  const out = buildSegmentsLineModel(prepared, fromSeg, toSeg, breakKind, chapterNr, paragraphNr, lineNr, lineMaxWidth, kind, indentPx, {
    softHyphen: C.SOFT_HYPHEN,
    hyphenWidth,
    countJustifyGaps,
    normalSpaceWidth,
  });
  out.prematureWrap = prematureWrap;
  return out;
}

function layoutParagraphKnuth(prepared, chapterNr, paragraphNr, width, kind, useFirstLineIndent, indentPx) {
  return layoutParagraphKnuthModel(prepared, chapterNr, paragraphNr, width, kind, useFirstLineIndent, indentPx, {
    softHyphen: C.SOFT_HYPHEN,
    normalSpaceWidth,
    maxSpaceExpansionRatio: C.MAX_SPACE_EXPANSION_RATIO,
    buildSegmentsLineFn: buildSegmentsLine,
    measureNextWordWidthFn: measureNextWordWidth,
    lineBadnessFn: lineBadness,
    stripSoftHyphens: stripSoftHyphensExtracted,
    layoutParagraphTokenKnuthFn: layoutParagraphTokenKnuth,
    logJson,
  });
}

function computeViewportBounds() {
  return computeViewportBoundsModel(document.getElementById('reader'), {
    topPx: C.PAGE_FRAME_MARGIN_TOP_PX,
    bottomPx: C.PAGE_FRAME_MARGIN_BOTTOM_PX,
  });
}

function viewportAvailableHeightPx() {
  return computeViewportBounds().height;
}

function updateViewportDebugOverlay() {
  updateViewportDebugOverlayModel({
    frame: document.getElementById('page-frame-overlay'),
    root: document.getElementById('viewport-debug-overlay'),
    topLine: document.getElementById('viewport-debug-top'),
    bottomLine: document.getElementById('viewport-debug-bottom'),
    label: document.getElementById('viewport-debug-label'),
    bounds: computeViewportBounds(),
    ready: viewportDebugReady,
    enabled: viewportDebugEnabled,
  });
}

function visibleLineCount() {
  return Math.max(1, Math.floor(viewportAvailableHeightPx() / lineHeightPx));
}

function lineOuterHeightPx(line) {
  return viewportLineOuterHeightPx(line, lineHeightPx);
}

function rebuildLineHeightIndex() {
  layoutSnapshot = createLayoutSnapshot(lines, buildLineHeightIndex, lineHeightPx);
  lineBoxHeights = layoutSnapshot.lineBoxHeights;
  lineHeightPrefix = layoutSnapshot.lineHeightPrefix;
}

function contentHeightPx() {
  return lineHeightPrefix.length > 0 ? lineHeightPrefix[lineHeightPrefix.length - 1] : 0;
}

function maxReachableOffset(lockChapterBoundary = false) {
  return maxReachableOffsetModel(lines, lineHeightPrefix, viewportAvailableHeightPx(), lockChapterBoundary);
}

function maxReachableScrollY(lockChapterBoundary = false) {
  return maxReachableScrollYModel(lines, lineHeightPrefix, viewportAvailableHeightPx(), lockChapterBoundary);
}

function maxScrollY() {
  return maxReachableScrollY(false);
}

function offsetForContentY(yPx, lockChapterBoundary) {
  return offsetForContentYModel(lines, lineHeightPrefix, yPx, maxScrollY(), viewportAvailableHeightPx(), lockChapterBoundary);
}

function contentYForOffset(offset) {
  return contentYForOffsetModel(lines, lineHeightPrefix, offset, maxScrollY());
}

function scrollSublineOffsetPxForOffset(offset) {
  const y = Math.max(0, Math.min(maxScrollY(), window.scrollY || 0));
  const topY = contentYForOffset(offset);
  return Math.max(0, y - topY);
}

function updateScrollSpacer() {
  const spacer = document.getElementById('scroll-spacer');
  if (!spacer) return;
  const h = Math.max(1, Math.ceil(maxReachableScrollY(false) + window.innerHeight));
  spacer.style.height = `${h}px`;
}

function syncScrollToOffset() {
  const targetY = contentYForOffset(offsetLine);
  syncScrollLock = true;
  window.scrollTo({ top: targetY, behavior: 'auto' });
  requestAnimationFrame(() => { syncScrollLock = false; });
}

function currentTopLocation() {
  const top = lines[offsetLine];
  return top ? { chapterNr: top.chapterNr, paragraphNr: top.paragraphNr, lineNr: top.lineNr } : { chapterNr: 0, paragraphNr: 1, lineNr: 1 };
}

function isViewportChangeLock() {
  return viewportScheduler ? viewportScheduler.isViewportChangeLock() : false;
}

function logViewportModelDebug(tag, extra = {}) {
  logViewportModelDebugExtracted(logJson, tag, {
    lines,
    offsetLine,
    lastRenderEndOffset,
    lineHeightPrefix,
    viewportHeight: viewportAvailableHeightPx(),
    modelMaxScroll: maxScrollY(),
    domMaxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    contentHeightPx: contentHeightPx(),
  }, extra);
}

function scheduleViewportRebuild() {
  if (!viewportScheduler) return;
  viewportScheduler.scheduleViewportRebuild();
}

function computePageEndOffset(startOffset, lockChapterBoundary) {
  return computePageEndOffsetModel(lines, lineHeightPrefix, startOffset, viewportAvailableHeightPx(), lockChapterBoundary);
}

function computePageStartOffsetFromEnd(endOffset, lockChapterBoundary) {
  return computePageStartOffsetFromEndModel(lines, lineHeightPrefix, endOffset, viewportAvailableHeightPx(), lockChapterBoundary);
}

function clampOffsetForMinimumChapterFill(startOffset, minFillRatio = 0.5) {
  return clampOffsetForMinimumChapterFillModel(lines, lineHeightPrefix, startOffset, viewportAvailableHeightPx(), minFillRatio);
}

function renderViewport() {
  const reader = document.getElementById('reader');
  if (!reader) return;
  const renderMeta = renderViewportExtracted({
    reader,
    constants: C,
    state: {
      fontSize,
      lineHeight,
      renderingMode,
      navigationMode,
      normalSpaceWidth,
      hyphenWidth,
      syncScrollLock,
      verboseDebug: VERBOSE_DEBUG_LOGS,
      viewportDebugEnabled,
      scrollSublineOffsetPx: scrollSublineOffsetPxForOffset(offsetLine),
    },
    model: {
      lines,
      offsetLine,
      lineHeightPrefix,
      lineBoxHeights,
    },
    funcs: {
      updateScrollSpacer,
      updateViewportDebugOverlay,
      viewportAvailableHeightPx,
      offsetForContentY,
      patchState,
      requestBackgroundForChapter: (ch) => backgroundController.requestForChapter(ch),
      readerWidth,
      computePageEndOffset,
      setRenderWindow: (start, end) => {
        lastRenderStartOffset = start;
        lastRenderEndOffset = end;
      },
      normalizeLineMetrics,
      isListLikeProseLine,
      countJustifyGaps,
      logJson,
      persistTopLocation,
      logViewportModelDebug,
    },
  });
  updatePagingNextControl(renderMeta);
}

function probeVisibleOverflow() {
  const reader = document.getElementById('reader');
  if (!reader) return { checked: 0, overflowed: 0 };
  const children = Array.from(reader.children);
  const visible = lines.slice(lastRenderStartOffset, lastRenderEndOffset);
  let checked = 0;
  let overflowed = 0;
  for (let i = 0; i < children.length && i < visible.length; i++) {
    const el = children[i];
    const line = visible[i];
    if (!line || line.kind !== 'paragraph') continue;
    checked += 1;
    const measured = el.scrollWidth;
    const available = el.clientWidth;
    const overflow = measured - available;
    const slack = (line.maxWidth || 0) - (line.naturalWidth || 0);
    el.dataset.clientWidth = String(Math.round(available));
    el.dataset.scrollWidth = String(Math.round(measured));
    el.dataset.overflowPx = String(Number(overflow.toFixed(3)));
    el.dataset.slackPx = String(Number(slack.toFixed(3)));
    el.dataset.tooSoonWrap = '0';
    if (overflow > 0.5) {
      overflowed += 1;
      el.dataset.overflow = '1';
      logJson('[line-overflow-debug]', {
        ch: line.chapterNr,
        para: line.paragraphNr,
        line: line.lineNr,
        measured,
        available,
        overflow,
        maxWidth: line.maxWidth,
        naturalWidth: line.naturalWidth,
        wordWidth: line.wordWidth,
        spaceCount: line.spaceCount,
        gapBase: normalSpaceWidth,
        gapExtra: Number(el.dataset.gapExtra || '0'),
        text: line.text,
      });
    } else {
      delete el.dataset.overflow;
    }
  }
  return { checked, overflowed };
}

window.probeOverflowNow = function() {
  const result = probeVisibleOverflow();
  logJson('[overflow-probe-result]', result);
  return result;
};

window.toggleViewportDebug = function(force) {
  viewportDebugEnabled = typeof force === 'boolean' ? force : !viewportDebugEnabled;
  updateViewportDebugOverlay();
  return viewportDebugEnabled;
};

function stepLines(delta) {
  patchState({
    navigationMode: 'scroll',
    offsetLine: Math.max(0, Math.min(lines.length - 1, offsetLine + delta)),
  });
  persistPrefs();
  syncScrollToOffset();
  renderViewport();
}

function findOffsetFromLocation(loc) {
  return findOffsetFromLocationModel(lines, layoutSnapshot, loc);
}

function normalizeLineSoftHyphens(line) {
  line.text = stripSoftHyphensExtracted(line.text || '');
  if (Array.isArray(line.segments)) {
    for (let i = 0; i < line.segments.length; i++) {
      const seg = line.segments[i];
      if (seg.kind === 'text') seg.text = stripSoftHyphensExtracted(seg.text || '');
    }
  }
  return line;
}

function addParagraphLines(chapterNr, paragraphNr, text, width, kind = 'paragraph', options = {}) {
  return addParagraphLinesToModel(lines, chapterNr, paragraphNr, text, width, kind, options, {
    renderingMode,
    fontSize,
    lineHeight,
    normalSpaceWidth,
    softHyphen: C.SOFT_HYPHEN,
    prepareWithSegments,
    layoutNextLineRange,
    materializeLineRange,
    countJustifyGaps,
    mdWarnAndCollapseProseSpaces,
    mdCleanInline,
    logJson,
    layoutParagraphTokenKnuth,
    layoutParagraphKnuth,
    stripSoftHyphens: stripSoftHyphensExtracted,
    normalizeLineSoftHyphens,
  });
}

async function buildLineModel(options = {}) {
  const fromIndex = Number.isInteger(options.fromIndex) ? Math.max(0, options.fromIndex) : 0;
  const toIndex = Number.isInteger(options.toIndex) ? Math.min(BOOK.length, options.toIndex) : BOOK.length;
  const reset = options.reset !== false;
  if (reset) lines = [];
  const width = readerWidth();
  const namespace = storageNamespace;
  for (let i = fromIndex; i < toIndex; i++) {
    const chNr = chapterIdAt(i);
    const chapter = BOOK[i];
    const compiled = await loadChapterCompiled(chapter, chNr);
    if (!compiled || !Array.isArray(compiled.blocks)) continue;
    const compiledHash = hashStringModel(JSON.stringify(compiled.blocks));
    const cacheKey = makeChapterLayoutKeyModel({
      namespace,
      chapterNr: chNr,
      fontSize,
      renderingMode,
      widthPx: width,
      normalSpaceWidth,
      hyphenWidth,
      contentHash: compiledHash,
      version: LAYOUT_CACHE_VERSION,
    });
    const cached = await getChapterLayoutModel(cacheKey);
    if (cached && Array.isArray(cached.lines) && cached.lines.length > 0) {
      for (let c = 0; c < cached.lines.length; c++) lines.push(cached.lines[c]);
      continue;
    }

    const chapterStart = lines.length;
    chapter.title = typeof compiled.title === 'string' && compiled.title ? compiled.title : (chapter.title || `Chapter ${chNr}`);
    chapter.headingLevel = Number.isInteger(compiled.headingLevel) ? compiled.headingLevel : 2;
    const blocks = compiled.blocks;
    for (let p = 0; p < blocks.length; p++) {
      const block = blocks[p] || {};
      const text = typeof block.text === 'string' ? block.text : '';
      if (!text && block.kind !== 'divider') continue;
      const kind = typeof block.kind === 'string' ? block.kind : 'paragraph';
      const options = {};
      if (kind === 'paragraph') options.leadBookTypography = !!block.leadBookTypography;
      if (kind === 'subheading' && Number.isFinite(block.chapterHeadingPreSpacePx)) options.chapterHeadingPreSpacePx = block.chapterHeadingPreSpacePx;
      addParagraphLines(chNr, p + 1, text, width, kind, options);
    }
    const chapterLines = lines.slice(chapterStart);
    putChapterLayoutModel(cacheKey, { lines: chapterLines }).catch(() => {});
    if (!layoutCachePruneTriggered) {
      layoutCachePruneTriggered = true;
      pruneLayoutCacheModel().catch(() => {});
    }
  }
  rebuildLineHeightIndex();
  updateScrollSpacer();
}

async function buildRemainingChaptersInBackground(startIndex) {
  if (backgroundChapterBuildInFlight) return;
  if (!Number.isInteger(startIndex) || startIndex >= BOOK.length) return;
  backgroundChapterBuildInFlight = true;
  try {
    await buildLineModel({ fromIndex: startIndex, toIndex: BOOK.length, reset: false });
    renderViewport();
    updateTocActive();
    updateResumeUi();
  } finally {
    backgroundChapterBuildInFlight = false;
  }
}

function flip(direction) {
  const switchingFromScroll = navigationMode === 'scroll';
  let baseOffset = offsetLine;
  if (switchingFromScroll) {
    baseOffset = offsetForContentY(window.scrollY, false);
    patchState({ offsetLine: baseOffset });
  }
  patchState({ navigationMode: 'flip' });
  persistPrefs();
  if (direction > 0) {
    const nextOffset = computePageEndOffset(baseOffset, true);
    if (nextOffset > baseOffset) {
      patchState({ offsetLine: Math.min(lines.length - 1, nextOffset) });
    }
  } else {
    patchState({ offsetLine: computePageStartOffsetFromEnd(baseOffset, true) });
  }
  syncScrollToOffset();
  renderViewport();
}

window.changeFontSize = async function(delta) {
  fontSize = Math.max(14, Math.min(32, fontSize + delta * 2));
  lineHeightPx = fontSize * lineHeight;
  normalSpaceWidth = measureNormalSpaceWidth();
  hyphenWidth = measureHyphenWidth();
  document.body.style.fontSize = `${fontSize}px`;
  const top = lines[offsetLine] || { chapterNr: 0, paragraphNr: 1, lineNr: 1 };
  await waitForFontsReady();
  await buildLineModel();
  offsetLine = findOffsetFromLocation(top);
  syncScrollToOffset();
  renderViewport();
  persistPrefs();
};

window.setFontSize = async function(nextSize) {
  const clamped = Math.max(14, Math.min(32, Number(nextSize) || fontSize));
  if (clamped === fontSize) return;
  fontSize = clamped;
  lineHeightPx = fontSize * lineHeight;
  normalSpaceWidth = measureNormalSpaceWidth();
  hyphenWidth = measureHyphenWidth();
  document.body.style.fontSize = `${fontSize}px`;
  const top = lines[offsetLine] || { chapterNr: 0, paragraphNr: 1, lineNr: 1 };
  await waitForFontsReady();
  await buildLineModel();
  offsetLine = findOffsetFromLocation(top);
  syncScrollToOffset();
  renderViewport();
  persistPrefs();
};

window.changeRenderingMode = async function(mode) {
  renderingMode = mode === 'compact' ? 'compact' : 'comfortable';
  lineHeight = renderingMode === 'compact' ? 1.5 : 1.72;
  lineHeightPx = fontSize * lineHeight;
  normalSpaceWidth = measureNormalSpaceWidth();
  hyphenWidth = measureHyphenWidth();
  const top = lines[offsetLine] || { chapterNr: 0, paragraphNr: 1, lineNr: 1 };
  await waitForFontsReady();
  await buildLineModel();
  offsetLine = findOffsetFromLocation(top);
  syncScrollToOffset();
  renderViewport();
  persistPrefs();
};

window.cycleTheme = function() {
  themeIdx = (themeIdx + 1) % themes.length;
  document.documentElement.setAttribute('data-theme', themes[themeIdx]);
  persistPrefs();
};

window.setTheme = function(nextIdx) {
  const idx = Math.max(0, Math.min(themes.length - 1, Number(nextIdx) || 0));
  themeIdx = idx;
  document.documentElement.setAttribute('data-theme', themes[themeIdx]);
  persistPrefs();
};

window.toggleBackgrounds = function() {
  backgroundsEnabled = !backgroundsEnabled;
  backgroundController.setEnabled(backgroundsEnabled);
  backgroundController.applyVisibility();
  if (backgroundsEnabled) {
    const top = lines[offsetLine];
    if (top && Number.isInteger(top.chapterNr)) backgroundController.requestForChapter(top.chapterNr);
  }
  persistPrefs();
};

window.setBackgroundsEnabled = function(nextEnabled) {
  backgroundsEnabled = !!nextEnabled;
  backgroundController.setEnabled(backgroundsEnabled);
  backgroundController.applyVisibility();
  if (backgroundsEnabled) {
    const top = lines[offsetLine];
    if (top && Number.isInteger(top.chapterNr)) backgroundController.requestForChapter(top.chapterNr);
  }
  persistPrefs();
};

window.setWidescreenLayout = function(nextLayout) {
  widescreenLayout = nextLayout === 'left' || nextLayout === 'center' ? nextLayout : 'right';
  document.documentElement.setAttribute('data-widescreen-layout', widescreenLayout);
  persistPrefs();
};

window.toggleTocFlyout = function() {
  if (!tocOpen) renderTocFlyout();
  setTocOpen(!tocOpen);
};

window.goHome = function() {
  window.location.href = '../';
};

window.switchBookLocale = function(targetBookSlug) {
  const path = window.location.pathname;
  const current = currentBookSlugFromPath();
  const nextPath = current
    ? path.replace(`/${current}/`, `/${targetBookSlug}/`)
    : `/${targetBookSlug}/`;
  window.location.href = `${nextPath}${window.location.search}${window.location.hash}`;
};

window.switchBookLocaleFromSelect = function(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  const select = event && event.target ? event.target : null;
  if (!select) return;
  const current = currentBookSlugFromPath() || (BOOK_LOCALES[0] ? BOOK_LOCALES[0].slug : null);
  const target = select.value;
  if (!target || target === current) return;
  select.value = current || target;
  select.disabled = true;
  select.style.visibility = 'hidden';
  switchBookLocale(target);
};

window.scrollToChapter = function(idx) {
  const targetChapterId = chapterIdAt(idx);
  const target = lines.findIndex((l) => l.chapterNr === targetChapterId);
  if (target >= 0) {
    offsetLine = target;
    syncScrollToOffset();
    renderViewport();
  }
};
window.goToChapter = window.scrollToChapter;
window.prevChapter = function() { flip(-1); };
window.nextChapter = function() { flip(1); };

window.__readerDebugState = function() {
  return {
    initDone,
    navigationMode,
    offsetLine,
    linesLength: Array.isArray(lines) ? lines.length : 0,
    backgroundChapterBuildInFlight,
  };
};

async function init() {
  if (!layoutCacheHintShown) {
    layoutCacheHintShown = true;
    window.clearReaderLayoutCache = async function() {
      await clearLayoutCacheModel();
      console.info('[layout-cache] cleared');
    };
    console.info('[layout-cache] To clear cached line-break/layout data once, run: clearReaderLayoutCache()');
  }
  viewportScheduler = createViewportRebuildScheduler({
    getInitDone: () => initDone,
    currentTopLocation,
    waitForFontsReady,
    buildLineModel,
    afterModelRebuild: (anchor) => {
      if (furthestLoc) furthestOffset = findOffsetFromLocation(furthestLoc);
      patchState({ offsetLine: findOffsetFromLocation(anchor) });
      syncScrollToOffset();
      updateViewportDebugOverlay();
      renderViewport();
    },
  });
  viewportScheduler.setViewportChangeLock(true);
  document.getElementById('load-progress').textContent = 'Loading book config...';
  document.getElementById('reader').style.display = 'block';
  const initialModel = readInitialModel();
  const hashLoc = locationFromHash(window.location.hash);
  if (hashLoc) {
    initialModel.loc = hashLoc;
  }
  applyModel(initialModel);
  await waitForFontsReady();
  await loadBookConfig();
  populateLocaleSelect();
  document.getElementById('load-progress').textContent = 'Building line model...';
  normalSpaceWidth = measureNormalSpaceWidth();
  hyphenWidth = measureHyphenWidth();
  const startAtChapterZero = !!(initialModel.loc && Number(initialModel.loc.chapterNr) === 0);
  if (startAtChapterZero) {
    await buildLineModel({ fromIndex: 0, toIndex: 1, reset: true });
  } else {
    await buildLineModel({ reset: true });
  }
  let furthestStoredRaw = null;
  try {
    furthestStoredRaw = localStorage.getItem(FURTHEST_KEY);
  } catch (_) {
    furthestStoredRaw = null;
  }
  const furthestStored = parseLocation(furthestStoredRaw);
  if (furthestStored) {
    furthestLoc = furthestStored;
    furthestOffset = findOffsetFromLocation(furthestLoc);
  }
  renderTocFlyout();
  const initialOffset = findOffsetFromLocation(initialModel.loc);
  patchState({ offsetLine: clampOffsetForMinimumChapterFill(initialOffset, 0.5) });
  const toolbar = document.getElementById('toolbar');
  if (toolbar) toolbar.classList.remove('deferred');
  document.getElementById('loading').classList.add('hidden');
  document.body.classList.add('reader-ready');
  syncScrollToOffset();
  renderViewport();
  requestAnimationFrame(() => {
    syncScrollToOffset();
    renderViewport();
    patchState({ initDone: true });
    if (viewportScheduler) viewportScheduler.setViewportChangeLock(false);
    updateResumeUi();
    attachEventHandlers();
  });
  if (startAtChapterZero) {
    setTimeout(() => {
      buildRemainingChaptersInBackground(1);
    }, 30);
  }
  requestAnimationFrame(() => {
    viewportDebugReady = true;
    updateViewportDebugOverlay();
  });
}

function attachEventHandlers() {
  if (handlersAttached) return;
  handlersAttached = true;

  const tocToggleBtn = document.getElementById('toc-toggle');
  if (tocToggleBtn) tocToggleBtn.addEventListener('click', () => window.toggleTocFlyout());
  const homeBtn = document.getElementById('home-btn');
  if (homeBtn) homeBtn.addEventListener('click', () => window.goHome());
  const fontDecBtn = document.getElementById('font-dec-btn');
  if (fontDecBtn) fontDecBtn.addEventListener('click', () => window.changeFontSize(-1));
  const fontIncBtn = document.getElementById('font-inc-btn');
  if (fontIncBtn) fontIncBtn.addEventListener('click', () => window.changeFontSize(1));
  const renderingModeSelect = document.getElementById('rendering-mode-select');
  if (renderingModeSelect) renderingModeSelect.addEventListener('change', (e) => window.changeRenderingMode(e.target.value));
  const bgToggleBtn = document.getElementById('bg-toggle');
  if (bgToggleBtn) bgToggleBtn.addEventListener('click', () => window.toggleBackgrounds());
  const cycleThemeBtn = document.getElementById('cycle-theme-btn');
  if (cycleThemeBtn) cycleThemeBtn.addEventListener('click', () => window.cycleTheme());
  const localeSelect = document.getElementById('book-locale-select');
  if (localeSelect) localeSelect.addEventListener('change', (event) => window.switchBookLocaleFromSelect(event));

  attachReaderEventHandlers({
    getInitDone: () => STATE.runtime.initDone(),
    updateViewportDebugOverlay,
    isSyncScrollLock: () => syncScrollLock,
    isScrollRafPending: () => scrollRafPending,
    setScrollRafPending: (v) => { scrollRafPending = v; },
    isViewportChangeLock,
    getOffsetLine: () => offsetLine,
    setOffsetAndMode: (nextOffset, mode) => {
      patchState({ offsetLine: nextOffset, navigationMode: mode });
      persistPrefs();
    },
    offsetForContentY,
    renderViewport,
    onScrollSample: (nextOffset, offsetChanged) => {
      if (!VERBOSE_DEBUG_LOGS) return;
      logViewportModelDebug('[viewport-model-debug]', {
        source: 'scroll',
        nextOffset,
        offsetChanged,
      });
    },
    scheduleViewportRebuild,
    setTocOpen,
    getTocOpen: () => tocOpen,
    getNavigationMode: () => navigationMode,
    flip,
    stepLines,
    onResumeGo: () => jumpToFurthest(),
    onResumeClose: () => {
      furthestPopoverDismissed = true;
      updateResumeUi();
    },
    onCopyParagraphLink: async (chapterNr, paragraphNr) => {
      const deepLink = `${window.location.origin}${window.location.pathname}${window.location.search}#${chapterNr}-${paragraphNr}`;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(deepLink);
        } else {
          throw new Error('Clipboard API unavailable');
        }
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = deepLink;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
      }
      logJson('[deep-link-copied]', { chapterNr, paragraphNr, deepLink });
    },
  });
}

init();
