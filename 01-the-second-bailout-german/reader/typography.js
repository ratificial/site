export function measureSpaceWidth(fontSize) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return 4;
  ctx.font = `300 ${fontSize}px 'Exo 2'`;
  return ctx.measureText(" ").width;
}

export function measureDashWidth(fontSize) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return 6;
  ctx.font = `300 ${fontSize}px 'Exo 2'`;
  return ctx.measureText("-").width;
}

export function computeReaderWidth(readerEl) {
  if (!readerEl) return 260;
  const cs = getComputedStyle(readerEl);
  const pl = parseFloat(cs.paddingLeft || "0") || 0;
  const pr = parseFloat(cs.paddingRight || "0") || 0;
  const content = readerEl.clientWidth - pl - pr;
  return Math.max(260, Math.floor(content));
}

export function countJustifyGaps(text) {
  let gaps = 0;
  const src = text || "";
  for (let i = 0; i < src.length; i++) if (src[i] === " ") gaps += 1;
  return gaps;
}
