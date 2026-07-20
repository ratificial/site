export function logJson(tag, payload) {
  try {
    if (tag === "[line-overflow-debug]") {
      console.debug(`${tag} ${JSON.stringify(payload)}`);
    } else {
      console.warn(`${tag} ${JSON.stringify(payload)}`);
    }
  } catch (_) {
    if (tag === "[line-overflow-debug]") {
      console.debug(tag, payload);
    } else {
      console.warn(tag, payload);
    }
  }
}

export function isVerboseDebugEnabledFromUrl(href) {
  const param = new URL(href).searchParams.get("debug");
  return param === "1";
}

export function isViewportDebugEnabledFromUrl(href) {
  const param = new URL(href).searchParams.get("debug");
  return !!param && param !== "0" && param !== "false";
}

export function logViewportModelDebug(log, tag, ctx, extra = {}) {
  const {
    lines,
    offsetLine,
    lastRenderEndOffset,
    lineHeightPrefix,
    viewportHeight,
    modelMaxScroll,
    domMaxScroll,
    contentHeightPx,
  } = ctx;
  if (!lines.length) return;
  const renderEnd = Math.max(offsetLine + 1, lastRenderEndOffset || offsetLine + 1);
  const renderLastIdx = Math.min(lines.length - 1, Math.max(offsetLine, renderEnd - 1));
  const modelLastIdx = lines.length - 1;
  const top = lines[Math.max(0, Math.min(lines.length - 1, offsetLine))];
  const renderLast = lines[renderLastIdx];
  const modelLast = lines[modelLastIdx];
  const visiblePx = (lineHeightPrefix[renderEnd] || 0) - (lineHeightPrefix[offsetLine] || 0);
  log(tag, {
    scrollY: window.scrollY,
    viewportHeightPx: viewportHeight,
    modelMaxScroll,
    domMaxScroll,
    domToModelDelta: domMaxScroll - modelMaxScroll,
    offsetLine,
    renderEndOffset: renderEnd,
    renderedLineCount: Math.max(0, renderEnd - offsetLine),
    renderedHeightPx: visiblePx,
    contentHeightPx,
    topLine: top ? { ch: top.chapterNr, para: top.paragraphNr, line: top.lineNr, kind: top.kind, text: top.text || "" } : null,
    renderLastLine: renderLast ? { idx: renderLastIdx, ch: renderLast.chapterNr, para: renderLast.paragraphNr, line: renderLast.lineNr, kind: renderLast.kind, text: renderLast.text || "" } : null,
    modelLastLine: modelLast ? { idx: modelLastIdx, ch: modelLast.chapterNr, para: modelLast.paragraphNr, line: modelLast.lineNr, kind: modelLast.kind, text: modelLast.text || "" } : null,
    ...extra,
  });
}
