export function lineBadness(lineStats, maxWidth, normalSpace, cfg) {
  const effectiveSpaceCount = lineStats.spaceCount > 0 ? lineStats.spaceCount : (lineStats.gapCount || 0);
  const effectiveWordWidth = lineStats.spaceCount > 0
    ? lineStats.wordWidth
    : Math.max(0, lineStats.naturalWidth - effectiveSpaceCount * normalSpace);

  if (lineStats.ending === "paragraph-end") {
    if (lineStats.naturalWidth > maxWidth + 0.25) return cfg.HUGE_BADNESS;
    return 0;
  }
  if (lineStats.naturalWidth > maxWidth + 0.25) return cfg.HUGE_BADNESS;

  if (lineStats.naturalWidth < maxWidth * cfg.SHORT_LINE_RATIO) {
    const missing = maxWidth * cfg.SHORT_LINE_RATIO - lineStats.naturalWidth;
    return 14000 + missing * missing * 1.4;
  }

  if (effectiveSpaceCount <= 0) {
    const slack = maxWidth - effectiveWordWidth;
    if (slack < 0) return cfg.HUGE_BADNESS;
    return slack * slack * 10;
  }
  const justifiedSpace = (maxWidth - effectiveWordWidth) / effectiveSpaceCount;
  if (justifiedSpace < 0) return cfg.HUGE_BADNESS;
  if (justifiedSpace < normalSpace * cfg.INFEASIBLE_SPACE_RATIO) return cfg.HUGE_BADNESS;
  if (justifiedSpace > normalSpace * cfg.MAX_SPACE_EXPANSION_RATIO) return cfg.HUGE_BADNESS;
  const ratio = (justifiedSpace - normalSpace) / normalSpace;
  const absRatio = Math.abs(ratio);
  const badness = absRatio * absRatio * absRatio * 1000;
  const riverExcess = justifiedSpace / normalSpace - cfg.RIVER_THRESHOLD;
  const riverPenalty = riverExcess > 0 ? 5000 + riverExcess * riverExcess * 10000 : 0;
  const tightThreshold = normalSpace * cfg.TIGHT_SPACE_RATIO;
  const tightPenalty = justifiedSpace < tightThreshold ? 3000 + (tightThreshold - justifiedSpace) * (tightThreshold - justifiedSpace) * 10000 : 0;
  const hyphenPenalty = lineStats.trailingMarker === "soft-hyphen" ? cfg.HYPHEN_PENALTY : 0;
  return badness + riverPenalty + tightPenalty + hyphenPenalty;
}

export function normalizeLineMetrics(line, countJustifyGaps) {
  if (!line || (line.kind !== "paragraph" && line.kind !== "quote")) return line;
  if (!Array.isArray(line.segments) || line.segments.length === 0) return line;

  let naturalWidth = 0;
  let explicitWordWidth = 0;
  let explicitSpaceCount = 0;
  for (let i = 0; i < line.segments.length; i++) {
    const seg = line.segments[i];
    const w = typeof seg.width === "number" ? seg.width : 0;
    if (seg.kind === "space" && (seg.text || "").length === 0) continue;
    naturalWidth += w;
    if (seg.kind === "space") {
      const segText = typeof seg.text === "string" ? seg.text : " ";
      explicitSpaceCount += Math.max(1, countJustifyGaps(segText));
    } else {
      explicitWordWidth += w;
    }
  }

  return {
    ...line,
    naturalWidth,
    widthPx: naturalWidth,
    wordWidth: explicitWordWidth,
    spaceCount: explicitSpaceCount,
    gapCount: explicitSpaceCount,
  };
}

export function layoutParagraphTokenKnuth(text, chapterNr, paragraphNr, width, useFirstLineIndent, indentPx, deps) {
  const {
    fontSize,
    normalSpaceWidth,
    measureTokenWidth,
    lineBadnessFn,
    normalizeLineMetricsFn,
  } = deps;
  const font = `300 ${fontSize}px 'Exo 2'`;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const widths = words.map((w) => measureTokenWidth(w, font));
  const n = words.length;

  const dp = new Array(n + 1).fill(Infinity);
  const prev = new Array(n + 1).fill(-1);
  dp[0] = 0;

  const prefix = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + widths[i];

  for (let j = 1; j <= n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      if (dp[i] === Infinity) continue;
      const lineNr = i === 0 ? 1 : 2;
      const lineMaxWidth = useFirstLineIndent && lineNr === 1 ? Math.max(60, width - indentPx) : width;
      const wordWidth = prefix[j] - prefix[i];
      const spaceCount = Math.max(0, j - i - 1);
      const naturalWidth = wordWidth + spaceCount * normalSpaceWidth;
      if (naturalWidth > lineMaxWidth + 0.25) break;
      const ending = j === n ? "paragraph-end" : "wrap";
      const nextWordWidth = j < n ? widths[j] : Infinity;
      const stats = {
        ending,
        naturalWidth,
        wordWidth,
        spaceCount,
        trailingMarker: "none",
        prematureWrap: ending !== "paragraph-end" && (naturalWidth + normalSpaceWidth + nextWordWidth <= lineMaxWidth + 0.25),
      };
      if (stats.prematureWrap) continue;
      const bad = lineBadnessFn(stats, lineMaxWidth, normalSpaceWidth);
      const total = dp[i] + bad;
      if (total < dp[j]) {
        dp[j] = total;
        prev[j] = i;
      }
    }
  }

  const breaks = [];
  if (prev[n] === -1) {
    let i = 0;
    while (i < n) {
      const lineNr = i === 0 ? 1 : 2;
      const lineMaxWidth = useFirstLineIndent && lineNr === 1 ? Math.max(60, width - indentPx) : width;
      let j = i + 1;
      let best = i + 1;
      while (j <= n) {
        const wordWidth = prefix[j] - prefix[i];
        const spaceCount = Math.max(0, j - i - 1);
        const naturalWidth = wordWidth + spaceCount * normalSpaceWidth;
        if (naturalWidth <= lineMaxWidth + 0.25) {
          best = j;
          j += 1;
        } else break;
      }
      breaks.push([i, best]);
      i = best;
    }
  } else {
    let cur = n;
    while (cur > 0) {
      const i = prev[cur];
      breaks.push([i, cur]);
      cur = i;
    }
    breaks.reverse();
  }

  const out = [];
  for (let li = 0; li < breaks.length; li++) {
    const [i, j] = breaks[li];
    const lineWords = words.slice(i, j);
    const lineWordWidth = prefix[j] - prefix[i];
    const spaceCount = Math.max(0, j - i - 1);
    const naturalWidth = lineWordWidth + spaceCount * normalSpaceWidth;
    const lineMaxWidth = useFirstLineIndent && li === 0 ? Math.max(60, width - indentPx) : width;
    const segments = [];
    for (let k = 0; k < lineWords.length; k++) {
      segments.push({ kind: "text", text: lineWords[k], width: widths[i + k] });
      if (k < lineWords.length - 1) segments.push({ kind: "space", text: " ", width: normalSpaceWidth });
    }
    out.push(normalizeLineMetricsFn({
      chapterNr,
      paragraphNr,
      lineNr: li + 1,
      text: lineWords.join(" "),
      widthPx: naturalWidth,
      gapCount: Math.max(0, lineWords.length - 1),
      wordWidth: lineWordWidth,
      spaceCount,
      naturalWidth,
      maxWidth: lineMaxWidth,
      ending: j === n ? "paragraph-end" : "wrap",
      kind: "paragraph",
      segments,
      indentPx: useFirstLineIndent && li === 0 ? indentPx : 0,
      trailingMarker: "none",
      isParagraphEnd: j === n,
      prematureWrap: j < n && (naturalWidth + normalSpaceWidth + widths[j] <= lineMaxWidth + 0.25),
      isSingleLineParagraph: false,
      paragraphText: text,
    }));
  }
  if (out.length === 1) out[0].isSingleLineParagraph = true;
  return out;
}

export function isSpaceText(text) {
  return (text || "").trim().length === 0;
}

export function measureNextWordWidth(prepared, segIndex, softHyphen) {
  let w = 0;
  let seenText = false;
  for (let i = segIndex; i < prepared.segments.length; i++) {
    const t = prepared.segments[i];
    if (t === softHyphen) continue;
    if (isSpaceText(t)) {
      if (seenText) break;
      continue;
    }
    seenText = true;
    w += prepared.widths[i] || 0;
  }
  return seenText ? w : Infinity;
}

export function buildSegmentsLine(prepared, fromSeg, toSeg, breakKind, chapterNr, paragraphNr, lineNr, lineMaxWidth, kind, indentPx, cfg) {
  const { softHyphen, hyphenWidth, countJustifyGaps, normalSpaceWidth } = cfg;
  const segments = [];
  let wordWidth = 0;
  let spaceCount = 0;
  let naturalWidth = 0;
  for (let s = fromSeg; s < toSeg; s++) {
    const segText = prepared.segments[s];
    if (segText === softHyphen) continue;
    const segWidth = prepared.widths[s] || 0;
    if (isSpaceText(segText)) {
      spaceCount += 1;
      segments.push({ kind: "space", text: segText, width: segWidth });
    } else {
      wordWidth += segWidth;
      segments.push({ kind: "text", text: segText, width: segWidth });
    }
    naturalWidth += segWidth;
  }
  while (segments.length && segments[segments.length - 1].kind === "space") segments.pop();
  const text = segments.map((s) => s.text).join("");
  if (breakKind === "soft-hyphen") {
    naturalWidth += hyphenWidth;
    wordWidth += hyphenWidth;
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      if (last.kind === "text") {
        last.text = `${last.text}-`;
        last.width += hyphenWidth;
      } else {
        segments.push({ kind: "text", text: "-", width: hyphenWidth });
      }
    } else {
      segments.push({ kind: "text", text: "-", width: hyphenWidth });
    }
  }
  if (spaceCount === 0) {
    const inferredGaps = countJustifyGaps(text);
    if (inferredGaps > 0) {
      spaceCount = inferredGaps;
      wordWidth = Math.max(0, naturalWidth - inferredGaps * normalSpaceWidth);
    }
  }
  const ending = breakKind === "end" ? "paragraph-end" : "wrap";
  return {
    chapterNr,
    paragraphNr,
    lineNr,
    text: segments.map((s) => s.text).join(""),
    widthPx: naturalWidth,
    gapCount: countJustifyGaps(text),
    wordWidth,
    spaceCount,
    naturalWidth,
    maxWidth: lineMaxWidth,
    ending,
    kind,
    segments,
    indentPx,
    trailingMarker: "none",
    isParagraphEnd: ending === "paragraph-end",
    fallbackForced: false,
    fallbackFromCandidate: -1,
    fallbackToCandidate: -1,
  };
}

export function layoutParagraphKnuth(prepared, chapterNr, paragraphNr, width, kind, useFirstLineIndent, indentPx, deps) {
  const {
    softHyphen,
    normalSpaceWidth,
    maxSpaceExpansionRatio,
    buildSegmentsLineFn,
    measureNextWordWidthFn,
    lineBadnessFn,
    stripSoftHyphens,
    layoutParagraphTokenKnuthFn,
    logJson,
  } = deps;
  const segs = prepared.segments;
  const segCount = segs.length;
  if (segCount === 0) return [];
  const breaks = [{ segIndex: 0, kind: "start" }];
  for (let s = 0; s < segCount; s++) {
    const t = segs[s];
    if (t === softHyphen) {
      if (s + 1 < segCount) breaks.push({ segIndex: s + 1, kind: "soft-hyphen" });
      continue;
    }
    if (isSpaceText(t) && s + 1 < segCount) breaks.push({ segIndex: s + 1, kind: "space" });
  }
  breaks.push({ segIndex: segCount, kind: "end" });
  const n = breaks.length;
  const dp = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  dp[0] = 0;

  const buildFallback = () => {
    if (kind === "paragraph") {
      let fallbackText = "";
      for (let s = 0; s < prepared.segments.length; s++) {
        const seg = prepared.segments[s];
        if (seg === softHyphen) continue;
        fallbackText += seg;
      }
      logJson("[layout-fallback-warning]", { ch: chapterNr, para: paragraphNr, reason: "knuth-unreachable-path-token-fallback", width, indentPx: useFirstLineIndent ? indentPx : 0 });
      return layoutParagraphTokenKnuthFn(stripSoftHyphens(fallbackText), chapterNr, paragraphNr, width, useFirstLineIndent, indentPx);
    }
    return [];
  };

  for (let to = 1; to < n; to++) {
    for (let from = to - 1; from >= 0; from--) {
      if (dp[from] === Infinity) continue;
      const lineNr = 1;
      const lineMaxWidth = useFirstLineIndent && from === 0 ? Math.max(60, width - indentPx) : width;
      const stats = buildSegmentsLineFn(prepared, breaks[from].segIndex, breaks[to].segIndex, breaks[to].kind, chapterNr, paragraphNr, lineNr, lineMaxWidth, kind, 0);
      if (stats.naturalWidth > lineMaxWidth + 0.25) break;
      if (stats.ending !== "paragraph-end") {
        const nextWordWidth = measureNextWordWidthFn(prepared, breaks[to].segIndex, softHyphen);
        if (Number.isFinite(nextWordWidth) && (stats.naturalWidth + normalSpaceWidth + nextWordWidth <= lineMaxWidth + 0.25)) continue;
      }
      const effSpaceCount = stats.spaceCount > 0 ? stats.spaceCount : (stats.gapCount || 0);
      const effWordWidth = stats.spaceCount > 0 ? stats.wordWidth : Math.max(0, stats.naturalWidth - effSpaceCount * normalSpaceWidth);
      if (stats.ending !== "paragraph-end" && effSpaceCount > 0) {
        const candidateFinalSpace = (lineMaxWidth - effWordWidth) / effSpaceCount;
        if (candidateFinalSpace > normalSpaceWidth * maxSpaceExpansionRatio) continue;
      }
      const bad = lineBadnessFn(stats, lineMaxWidth, normalSpaceWidth);
      const total = dp[from] + bad;
      if (total < dp[to]) {
        dp[to] = total;
        prev[to] = from;
      }
    }
  }
  if (prev[n - 1] === -1) return buildFallback();
  const path = [];
  let cur = n - 1;
  while (cur > 0) {
    if (prev[cur] === -1) break;
    path.push(cur);
    cur = prev[cur];
  }
  if (cur !== 0) return buildFallback();
  path.reverse();
  const out = [];
  let from = 0;
  for (let i = 0; i < path.length; i++) {
    const to = path[i];
    const lineMaxWidth = useFirstLineIndent && i === 0 ? Math.max(60, width - indentPx) : width;
    const candidate = buildSegmentsLineFn(prepared, breaks[from].segIndex, breaks[to].segIndex, breaks[to].kind, chapterNr, paragraphNr, i + 1, lineMaxWidth, kind, useFirstLineIndent && i === 0 ? indentPx : 0);
    candidate.prematureWrap = false;
    out.push(candidate);
    from = to;
  }
  return out;
}
