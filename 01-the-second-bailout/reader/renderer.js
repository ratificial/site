export function isListLikeProseLine(text) {
  return /^\s*[-*+]\s+/.test(text || "") || /^\s*\d+\.\s+/.test(text || "");
}

export function applyLinePresentationStyles(p, line, ctx) {
  const { fontSize, lineHeight, renderingMode } = ctx;
  p.classList.remove("quote-line");
  p.style.display = "block";
  p.style.lineHeight = `${line.contentLineHeight || lineHeight}`;
  p.style.fontSize = `${fontSize}px`;
  p.style.whiteSpace = "nowrap";
  p.style.overflowWrap = "normal";
  p.style.wordBreak = "normal";
  p.style.width = "100%";
  p.style.maxWidth = "100%";
  p.style.overflow = "visible";
  p.style.textAlign = line.kind === "heading" ? "center" : "left";
  p.style.wordSpacing = "0px";
  p.style.fontFamily = line.kind === "heading" ? "'Space Grotesk', sans-serif" : "'Exo 2', 'Source Sans 3', sans-serif";
  p.style.fontWeight = line.kind === "heading" ? "400" : "300";
  p.style.marginTop = "0";
  p.style.marginBottom = "0";
  p.style.paddingTop = "0";
  p.style.paddingBottom = "0";

  if (line.kind === "heading") {
    p.style.fontSize = `${Math.round(fontSize * (line.fontScale || 1.45))}px`;
    p.style.lineHeight = `${line.contentLineHeight || 1.25}`;
    p.style.color = "var(--chapter-title)";
    p.style.letterSpacing = "0.02em";
  }
  if (line.kind === "subheading") {
    const scale = line.fontScale || (line.headingLevel === 1 ? 2.0 : 1.15);
    p.style.textAlign = "left";
    p.style.fontFamily = "'Space Grotesk', sans-serif";
    p.style.fontWeight = "500";
    p.style.fontSize = `${Math.round(fontSize * scale)}px`;
    p.style.lineHeight = `${line.contentLineHeight || 1.3}`;
    p.style.color = "var(--chapter-title)";
    p.style.letterSpacing = "0.01em";
  }
  if (line.kind === "code") {
    p.style.color = "var(--code-text)";
  }
  if (line.kind === "quote") {
    p.style.color = "var(--code-text)";
    p.classList.add("quote-line");
  }
  if (line.kind === "divider") {
    p.style.textAlign = "center";
    p.style.color = "var(--accent-dim)";
    p.style.letterSpacing = "0.25em";
  }
  if (line.kind === "spacer") {
    p.style.height = renderingMode === "comfortable" ? `${Math.round(fontSize * 0.9)}px` : `${Math.round(fontSize * 0.2)}px`;
    p.style.lineHeight = "1";
  }
  if ((line.kind === "paragraph" || line.kind === "quote") && line.indentPx > 0) {
    p.style.paddingLeft = `${line.indentPx}px`;
    p.style.width = `calc(100% - ${line.indentPx}px)`;
    p.style.maxWidth = `calc(100% - ${line.indentPx}px)`;
  }
  if (line.padTopPx) p.style.paddingTop = `${line.padTopPx}px`;
  if (line.padBottomPx) p.style.paddingBottom = `${line.padBottomPx}px`;
}

export function renderViewport(ctx) {
  const {
    reader,
    constants,
    state,
    model,
    funcs,
  } = ctx;
  const {
    fontSize,
    lineHeight,
    renderingMode,
    navigationMode,
    normalSpaceWidth,
    hyphenWidth,
    syncScrollLock,
    verboseDebug,
    viewportDebugEnabled,
    scrollSublineOffsetPx = 0,
  } = state;
  const {
    lines,
    offsetLine,
    lineHeightPrefix,
    lineBoxHeights,
  } = model;

  reader.style.paddingBottom = `${constants.PAGE_FRAME_MARGIN_BOTTOM_PX}px`;
  funcs.updateScrollSpacer();
  funcs.updateViewportDebugOverlay();
  let nextOffsetLine = offsetLine;
  if (navigationMode === "scroll" && !syncScrollLock) {
    const scrollOffset = funcs.offsetForContentY(window.scrollY, false);
    if (scrollOffset !== nextOffsetLine) {
      funcs.patchState({ offsetLine: scrollOffset });
      nextOffsetLine = scrollOffset;
    }
  }
  const topLine = lines[nextOffsetLine];
  if (topLine && Number.isInteger(topLine.chapterNr)) funcs.requestBackgroundForChapter(topLine.chapterNr);
  const width = funcs.readerWidth();
  const end = navigationMode === "flip"
    ? funcs.computePageEndOffset(nextOffsetLine, true)
    : funcs.computePageEndOffset(nextOffsetLine, false);
  funcs.setRenderWindow(nextOffsetLine, end);
  const slice = lines.slice(nextOffsetLine, end);
  const existingByKey = new Map();
  const existingNodes = reader.querySelectorAll('[data-vkey]');
  for (let i = 0; i < existingNodes.length; i++) {
    const node = existingNodes[i];
    const key = node.getAttribute('data-vkey');
    if (key) existingByKey.set(key, node);
  }
  const frag = document.createDocumentFragment();
  const localTopBase = lineHeightPrefix[nextOffsetLine] || 0;
  const readerStyle = window.getComputedStyle(reader);
  const readerPadTop = parseFloat(readerStyle.paddingTop) || 0;
  const readerPadLeft = parseFloat(readerStyle.paddingLeft) || 0;
  const readerPadRight = parseFloat(readerStyle.paddingRight) || 0;
  const activeKeys = new Set();
  const pendingJustifyWarnings = [];
  for (let i = 0; i < slice.length; i++) {
    const globalIdx = nextOffsetLine + i;
    let line = slice[i];
    if (line && (line.kind === "paragraph" || line.kind === "quote")) line = funcs.normalizeLineMetrics(line);
    const key = `line-${globalIdx}`;
    activeKeys.add(key);
    let p = existingByKey.get(key);
    if (!p) p = document.createElement("div");
    p.textContent = "";
    p.dataset.vkey = key;
    const isVisualEmptyLine = !(line.text && line.text.length > 0);
    applyLinePresentationStyles(p, line, { fontSize, lineHeight, renderingMode });
    let extraPerGap = null;
    let justifyShortfall = null;
    let expectedRenderWidth = null;
    const shouldAttemptJustify = (line.kind === "paragraph" || line.kind === "quote") && !line.isParagraphEnd && !line.hardBreakAfter && !line.isSingleLineParagraph && line.spaceCount > 0;
    if (shouldAttemptJustify) {
      const base = normalSpaceWidth;
      const remaining = Math.max(0, (line.maxWidth - line.naturalWidth) - constants.RENDER_WIDTH_SAFETY_PX);
      const extra = remaining / line.spaceCount;
      const finalSpace = base + extra;
      if (extra >= 0 && finalSpace >= base * constants.OVERFLOW_SPACE_RATIO && finalSpace <= base * constants.MAX_SPACE_EXPANSION_RATIO) {
        if (finalSpace > base * constants.RENDER_MAX_SPACE_RATIO) {
          funcs.logJson("[justify-warning]", { ch: line.chapterNr, para: line.paragraphNr, line: line.lineNr, reason: "render-gap-too-wide", finalSpace, baseSpace: base, text: line.text });
        } else {
          extraPerGap = extra;
        }
        justifyShortfall = Math.max(0, remaining - (extraPerGap || 0) * line.spaceCount);
      } else if (viewportDebugEnabled && !funcs.isListLikeProseLine(line.text)) {
        pendingJustifyWarnings.push({
          p,
          payload: {
            ch: line.chapterNr, para: line.paragraphNr, line: line.lineNr, reason: "justify-disabled-by-threshold", baseSpace: base, finalSpace, extra,
            ending: line.ending, fallbackForced: !!line.fallbackForced, fallbackFromCandidate: line.fallbackFromCandidate, fallbackToCandidate: line.fallbackToCandidate, text: line.text,
          },
        });
      }
    }
    if (line.kind === "paragraph" || line.kind === "quote") {
      if (Array.isArray(line.segments) && line.segments.length > 0) {
        let expected = 0;
        const gapExtra = extraPerGap !== null ? Math.max(0, extraPerGap) : 0;
        for (let s = 0; s < line.segments.length; s++) {
          const seg = line.segments[s];
          const segWidth = typeof seg.width === "number" ? seg.width : 0;
          if (seg.kind === "space") {
            const segGapCount = Math.max(1, funcs.countJustifyGaps(typeof seg.text === "string" ? seg.text : " "));
            expected += segWidth + gapExtra * segGapCount;
          } else expected += segWidth;
        }
        if (line.trailingMarker === "soft-hyphen") expected += hyphenWidth;
        expectedRenderWidth = expected;
      } else {
        expectedRenderWidth = (line.wordWidth || 0) + (line.spaceCount || 0) * (normalSpaceWidth + (extraPerGap || 0));
        if (line.trailingMarker === "soft-hyphen") expectedRenderWidth += hyphenWidth;
      }
    }
    if (line.kind === "paragraph" || line.kind === "quote") {
      const gapExtra = extraPerGap !== null ? Math.max(0, extraPerGap) : 0;
      if (Array.isArray(line.segments) && line.segments.length > 0) {
        const mergedTokens = [];
        let tokenText = "";
        let tokenWidth = 0;
        let trailingSpaceText = "";
        let trailingSpaceCount = 0;
        let trailingSpaceWidth = 0;
        const flushToken = () => {
          if (!tokenText) return;
          mergedTokens.push({ text: tokenText, baseWidth: tokenWidth, trailingSpaceText, trailingSpaceCount, trailingSpaceWidth });
          tokenText = ""; tokenWidth = 0; trailingSpaceText = ""; trailingSpaceCount = 0; trailingSpaceWidth = 0;
        };
        for (let s = 0; s < line.segments.length; s++) {
          const seg = line.segments[s];
          if (seg.kind === "text") { tokenText += seg.text || ""; tokenWidth += typeof seg.width === "number" ? seg.width : 0; continue; }
          if (seg.kind === "space" && tokenText) {
            const baseGap = typeof seg.width === "number" ? seg.width : normalSpaceWidth;
            const segGapCount = Math.max(1, funcs.countJustifyGaps(typeof seg.text === "string" ? seg.text : " "));
            const appliedGap = Math.max(0, baseGap + gapExtra * segGapCount);
            trailingSpaceText += typeof seg.text === "string" ? seg.text : " ";
            trailingSpaceCount += segGapCount;
            trailingSpaceWidth += appliedGap;
            flushToken();
          }
        }
        flushToken();
        const wordSpans = [];
        let tokenIndex = 0;
        for (let s = 0; s < mergedTokens.length; s++) {
          const tok = mergedTokens[s];
          const assignedWidth = Math.max(0, tok.baseWidth + tok.trailingSpaceWidth);
          const word = document.createElement("span");
          word.style.display = "inline-block";
          word.style.width = `${assignedWidth}px`;
          word.textContent = `${tok.text || ""}${tok.trailingSpaceText}`;
          word.dataset.tokenIndex = String(tokenIndex);
          word.dataset.assignedWidth = String(Number(assignedWidth.toFixed(3)));
          word.dataset.baseTokenWidth = String(Number(tok.baseWidth.toFixed(3)));
          word.dataset.trailingSpaces = String(tok.trailingSpaceCount);
          word.dataset.trailingSpaceWidth = String(Number(tok.trailingSpaceWidth.toFixed(3)));
          p.appendChild(word);
          wordSpans.push(word);
          tokenIndex += 1;
        }
        if (wordSpans.length >= 2) {
          const last = wordSpans[wordSpans.length - 1];
          const prev = wordSpans[wordSpans.length - 2];
          const prevW = parseFloat(prev.style.width || "0") || 0;
          const lastW = parseFloat(last.style.width || "0") || 0;
          if (prevW > 1) {
            const nextPrev = Math.max(0, prevW - 1);
            const nextLast = Math.max(0, lastW + 1);
            prev.style.width = `${nextPrev}px`;
            last.style.width = `${nextLast}px`;
            prev.dataset.assignedWidth = String(Number(nextPrev.toFixed(3)));
            last.dataset.assignedWidth = String(Number(nextLast.toFixed(3)));
            last.style.textAlign = "right";
          }
        }
        if (line.trailingMarker === "soft-hyphen" && wordSpans.length > 0) {
          wordSpans[wordSpans.length - 1].style.textAlign = "right";
        }
      } else {
        p.textContent = line.text && line.text.length > 0 ? line.text : "\u00a0";
      }
    } else if (line.kind === "html") {
      p.innerHTML = line.html || "";
    } else {
      p.textContent = line.text && line.text.length > 0 ? line.text : "\u00a0";
    }
    p.dataset.lineOffset = String(globalIdx);
    p.dataset.chapterNr = String(line.chapterNr);
    p.dataset.paragraphNr = String(line.paragraphNr);
    p.dataset.lineNr = String(line.lineNr);
    p.dataset.lineKind = String(line.kind || "");
    p.dataset.assumedTopPx = String(Number((lineHeightPrefix[globalIdx] || 0).toFixed(3)));
    p.dataset.assumedBottomPx = String(Number((lineHeightPrefix[globalIdx + 1] || 0).toFixed(3)));
    p.dataset.assumedHeightPx = String(Number((lineBoxHeights[globalIdx] || 0).toFixed(3)));
    const topPx = readerPadTop + (lineHeightPrefix[globalIdx] || 0) - localTopBase - scrollSublineOffsetPx;
    p.style.position = 'absolute';
    p.style.left = `${readerPadLeft}px`;
    p.style.right = `${readerPadRight}px`;
    p.style.top = `${topPx}px`;
    p.style.transform = 'none';
    frag.appendChild(p);
  }
  for (let i = 0; i < existingNodes.length; i++) {
    const node = existingNodes[i];
    const k = node.getAttribute('data-vkey') || '';
    if (!activeKeys.has(k)) node.remove();
  }
  reader.appendChild(frag);

  let flipCta = null;
  if (navigationMode === "flip" && end > 0 && end < lines.length) {
    const currentChapterNr = lines[end - 1] ? lines[end - 1].chapterNr : null;
    const nextChapterNr = lines[end] ? lines[end].chapterNr : null;
    const isChapterBoundary = currentChapterNr !== null && nextChapterNr !== null && nextChapterNr !== currentChapterNr;
    flipCta = {
      visible: true,
      endOffset: end,
      isChapterBoundary,
      nextChapterNr,
      label: isChapterBoundary ? "next chapter >" : "next page >",
    };
  }

  for (let i = 0; i < pendingJustifyWarnings.length; i++) {
    const item = pendingJustifyWarnings[i];
    const next = item.p.nextElementSibling;
    funcs.logJson("[justify-warning]", { ...item.payload, outerHTML: item.p.outerHTML, nextOuterHTML: next ? next.outerHTML : null });
  }
  funcs.persistTopLocation();
  const progress = lines.length > 0 ? (nextOffsetLine / Math.max(1, lines.length - 1)) * 100 : 0;
  const progressEl = document.getElementById("progress");
  if (progressEl) progressEl.style.width = `${progress}%`;
  if (verboseDebug) funcs.logViewportModelDebug("[viewport-model-debug]", { source: "render" });
  return {
    endOffset: end,
    flipCta,
  };
}
