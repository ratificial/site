export function addParagraphLinesToModel(targetLines, chapterNr, paragraphNr, text, width, kind, options, deps) {
  const {
    renderingMode,
    fontSize,
    lineHeight,
    normalSpaceWidth,
    softHyphen,
    prepareWithSegments,
    layoutNextLineRange,
    materializeLineRange,
    countJustifyGaps,
    mdWarnAndCollapseProseSpaces,
    mdCleanInline,
    logJson,
    layoutParagraphTokenKnuth,
    layoutParagraphKnuth,
    stripSoftHyphens,
    normalizeLineSoftHyphens,
  } = deps;
  const leadBookTypography = !!(options && options.leadBookTypography);
  const chapterHeadingPreSpacePx = options && Number.isFinite(options.chapterHeadingPreSpacePx)
    ? Math.max(0, options.chapterHeadingPreSpacePx)
    : 0;

  function applyBoxMetrics(line) {
    const baseLineHeightPx = fontSize * lineHeight;
    line.padTopPx = 0;
    line.padBottomPx = 0;
    line.contentLineHeight = lineHeight;
    line.fontScale = 1;

    if (line.kind === 'heading') {
      line.fontScale = 1.45;
      line.contentLineHeight = 1.25;
      line.padTopPx = Math.round(fontSize * 1.6);
      line.padBottomPx = Math.round(fontSize * 1.1);
      line.outerHeightPx = Math.round(fontSize * line.fontScale) * line.contentLineHeight + line.padTopPx + line.padBottomPx;
      return line;
    }
    if (line.kind === 'subheading') {
      line.fontScale = line.headingLevel === 1 ? 2.0 : 1.15;
      line.contentLineHeight = line.headingLevel === 1 ? 1.16 : 1.18;
      if (line.headingLevel === 1) {
        if (line.lineNr === 1) {
          line.padTopPx = Math.round(fontSize * 1.1) + Math.max(0, line.preSpaceBeforePx || 0);
        }
        if (line.isParagraphEnd) {
          line.padBottomPx = Math.round(fontSize * 0.45);
        }
      } else {
        line.contentLineHeight = 1.22;
        if (line.lineNr === 1) {
          line.padTopPx = Math.round(fontSize * 0.95) + Math.max(0, line.preSpaceBeforePx || 0);
        }
        if (line.isParagraphEnd) {
          line.padBottomPx = Math.round(fontSize * 0.35);
        }
      }
      line.outerHeightPx = Math.round(fontSize * line.fontScale) * line.contentLineHeight + line.padTopPx + line.padBottomPx;
      return line;
    }
    if (line.kind === 'divider') {
      line.padTopPx = Math.round(fontSize * 1.2);
      line.padBottomPx = Math.round(fontSize * 1.2);
      line.outerHeightPx = baseLineHeightPx + line.padTopPx + line.padBottomPx;
      return line;
    }
    if (line.kind === 'spacer') {
      line.outerHeightPx = renderingMode === 'comfortable' ? Math.round(fontSize * 0.9) : Math.round(fontSize * 0.2);
      return line;
    }
    if (line.kind === 'code') {
      const block = Math.round(fontSize * lineHeight * 0.5);
      if (line.lineNr === 1) line.padTopPx = block;
      if (line.isParagraphEnd) line.padBottomPx = block;
      line.outerHeightPx = baseLineHeightPx + line.padTopPx + line.padBottomPx;
      return line;
    }
    if (line.kind === 'quote') {
      if (line.lineNr === 1) line.padTopPx = Math.round(fontSize * 0.35);
      if (line.isParagraphEnd) line.padBottomPx = Math.round(fontSize * 0.35);
      line.outerHeightPx = baseLineHeightPx + line.padTopPx + line.padBottomPx;
      return line;
    }
    if (line.kind === 'paragraph') {
      if (line.isParagraphEnd && renderingMode === 'comfortable') line.padBottomPx = Math.round(fontSize * 0.75);
      line.outerHeightPx = baseLineHeightPx + line.padTopPx + line.padBottomPx;
      return line;
    }
    line.outerHeightPx = baseLineHeightPx;
    return line;
  }

  const startIdx = targetLines.length;

  if (kind === 'html') {
    targetLines.push({
      chapterNr,
      paragraphNr,
      lineNr: 1,
      text: '',
      html: text,
      widthPx: 0,
      gapCount: 0,
      wordWidth: 0,
      spaceCount: 0,
      naturalWidth: 0,
      maxWidth: width,
      ending: 'paragraph-end',
      kind: 'html',
      indentPx: 0,
      trailingMarker: 'none',
      isParagraphEnd: true,
      isSingleLineParagraph: true,
    });
    applyBoxMetrics(targetLines[targetLines.length - 1]);
    return;
  }
  if (kind === 'divider') {
    targetLines.push({ chapterNr, paragraphNr, lineNr: 1, text: '🐀 🐀 🐀', kind: 'divider', isParagraphEnd: true });
    applyBoxMetrics(targetLines[targetLines.length - 1]);
    return;
  }
  if (kind === 'subheading') {
    const m = /^(#{1,6})\s+/.exec((text || '').trim());
    const headingLevel = m ? m[1].length : 2;
    const headText = text.replace(/^#{1,6}\s+/, '').trim();
    const headingScale = headingLevel === 1 ? 2.0 : 1.15;
    const preparedHead = prepareWithSegments(headText, `500 ${Math.round(fontSize * headingScale)}px 'Space Grotesk'`);
    let cursorHead = { segmentIndex: 0, graphemeIndex: 0 };
    let i = 0;
    while (true) {
      const rangeHead = layoutNextLineRange(preparedHead, cursorHead, width);
      if (!rangeHead) break;
      const lineHead = materializeLineRange(preparedHead, rangeHead);
      const endingHead = rangeHead.end.segmentIndex >= preparedHead.segments.length ? 'paragraph-end' : 'wrap';
      targetLines.push({
        chapterNr,
        paragraphNr,
        lineNr: i + 1,
        text: lineHead.text || '',
        widthPx: lineHead.width || 0,
        gapCount: countJustifyGaps(lineHead.text || ''),
        wordWidth: lineHead.width || 0,
        spaceCount: 0,
        naturalWidth: lineHead.width || 0,
        maxWidth: width,
        ending: endingHead,
        kind: 'subheading',
        headingLevel,
        headingScale,
        isParagraphEnd: endingHead === 'paragraph-end',
        preSpaceBeforePx: i === 0 ? chapterHeadingPreSpacePx : 0,
      });
      cursorHead = rangeHead.end;
      i += 1;
    }
    for (let j = startIdx; j < targetLines.length; j++) applyBoxMetrics(targetLines[j]);
    return;
  }
  if (kind === 'quote' || kind === 'code') {
    const sourceLines = (text || '').replace(/\r\n?/g, '\n').split('\n');
    let renderedLineNr = 1;
    for (let i = 0; i < sourceLines.length; i++) {
      const srcLineRaw = sourceLines[i];
      const srcLine = kind === 'quote'
        ? mdWarnAndCollapseProseSpaces(mdCleanInline(srcLineRaw), chapterNr, paragraphNr, logJson)
        : srcLineRaw;
      const isLastSourceLine = i === sourceLines.length - 1;
      if (srcLine.length === 0) {
        targetLines.push({
          chapterNr,
          paragraphNr,
          lineNr: renderedLineNr,
          text: '',
          widthPx: 0,
          gapCount: 0,
          wordWidth: 0,
          spaceCount: 0,
          naturalWidth: 0,
          maxWidth: width,
          ending: isLastSourceLine ? 'paragraph-end' : 'wrap',
          kind,
          indentPx: 0,
          trailingMarker: 'none',
          isParagraphEnd: isLastSourceLine,
          isSingleLineParagraph: sourceLines.length === 1,
          hardBreakAfter: !isLastSourceLine,
        });
        renderedLineNr += 1;
        continue;
      }
      const wrapped = layoutParagraphTokenKnuth(srcLine, chapterNr, paragraphNr, width, false, 0);
      for (let w = 0; w < wrapped.length; w++) {
        const isLastWrappedLine = w === wrapped.length - 1;
        wrapped[w].kind = kind;
        wrapped[w].indentPx = 0;
        wrapped[w].lineNr = renderedLineNr;
        wrapped[w].hardBreakAfter = !isLastSourceLine && isLastWrappedLine;
        wrapped[w].isParagraphEnd = isLastSourceLine && isLastWrappedLine;
        targetLines.push(wrapped[w]);
        renderedLineNr += 1;
      }
    }
    for (let j = startIdx; j < targetLines.length; j++) applyBoxMetrics(targetLines[j]);
    return;
  }

  const useFirstLineIndent = kind === 'paragraph' && renderingMode === 'compact' && paragraphNr > 1 && !leadBookTypography;
  const indentPx = useFirstLineIndent ? Math.round(normalSpaceWidth * 4.5) : 0;
  const hardBreakParts = (text || '').split('\n');
  const paraStart = targetLines.length;
  for (let partIdx = 0; partIdx < hardBreakParts.length; partIdx++) {
    const partText = hardBreakParts[partIdx];
    const isLastPart = partIdx === hardBreakParts.length - 1;
    let partLines = [];
    if (partText.includes(softHyphen)) {
      const prepared = prepareWithSegments(partText, `300 ${fontSize}px 'Exo 2'`, { whiteSpace: 'pre-wrap' });
      partLines = layoutParagraphKnuth(prepared, chapterNr, paragraphNr, width, 'paragraph', useFirstLineIndent && partIdx === 0, indentPx);
    } else {
      partLines = layoutParagraphTokenKnuth(partText, chapterNr, paragraphNr, width, useFirstLineIndent && partIdx === 0, indentPx);
    }
    if (partLines.some((ln) => ln && ln.kind === 'paragraph' && ln.naturalWidth > (ln.maxWidth || width) + 0.25)) {
      const plainFallbackText = stripSoftHyphens(partText);
      partLines = layoutParagraphTokenKnuth(plainFallbackText, chapterNr, paragraphNr, width, useFirstLineIndent && partIdx === 0, indentPx);
      logJson('[layout-fallback-warning]', {
        ch: chapterNr,
        para: paragraphNr,
        reason: 'post-layout-overfull-reflow-token-knuth',
        width,
        indentPx: useFirstLineIndent && partIdx === 0 ? indentPx : 0,
        text: partText,
      });
    }
    for (let li = 0; li < partLines.length; li++) {
      const normalized = normalizeLineSoftHyphens(partLines[li]);
      if (kind === 'paragraph' && leadBookTypography && partIdx === 0 && li === 0) {
        normalized.leadNoIndent = true;
        normalized.indentPx = 0;
      }
      targetLines.push(normalized);
    }
    if (!isLastPart && partLines.length > 0) {
      const forcedBreakLine = targetLines[targetLines.length - 1];
      forcedBreakLine.hardBreakAfter = true;
      forcedBreakLine.isParagraphEnd = false;
    }
  }
  const paraEnd = targetLines.length;
  const paraCount = paraEnd - paraStart;
  if (paraCount === 1 && paraStart >= 0 && paraEnd > paraStart) {
    targetLines[paraStart].isSingleLineParagraph = true;
  } else {
    for (let idx = paraStart; idx < paraEnd; idx++) targetLines[idx].isSingleLineParagraph = false;
  }
  for (let j = startIdx; j < targetLines.length; j++) applyBoxMetrics(targetLines[j]);
}
