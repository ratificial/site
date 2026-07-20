export function normalizeMd(md) {
  return md.replace(/\r\n?/g, "\n").trim();
}

export function cleanInline(md) {
  let t = md;
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  return t;
}

export function inlineMdToHtml(md) {
  let t = md;
  t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noopener noreferrer\">$1</a>");
  return t;
}

export function listItemHtml(md) {
  const stripped = md.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");
  return `&bull; ${inlineMdToHtml(stripped)}`;
}

export function warnAndCollapseProseSpaces(text, chapterNr, paragraphNr, logJson) {
  const input = text || "";
  if (/  +/.test(input)) {
    logJson("[prose-multi-space-warning]", {
      ch: chapterNr,
      para: paragraphNr,
      text: input,
    });
  }
  return input.replace(/ {2,}/g, " ");
}

export function mdBlocks(md) {
  const src = normalizeMd(md).split("\n");
  const blocks = [];
  let i = 0;
  while (i < src.length) {
    const line = src[i];
    if (/^```/.test(line.trim())) {
      i += 1;
      const codeLines = [];
      while (i < src.length && !/^```/.test(src[i].trim())) {
        codeLines.push(src[i]);
        i += 1;
      }
      if (i < src.length) i += 1;
      blocks.push({ kind: "code", text: codeLines.join("\n") });
      continue;
    }
    if (/^( {2,}|\t)/.test(line) && !/^([-*+]\s+|\d+\.\s+)/.test(line.trim())) {
      const quoteLines = [];
      while (i < src.length && (/^( {2,}|\t)/.test(src[i]) || src[i].trim() === "")) {
        quoteLines.push(src[i].replace(/^( {2,}|\t)/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", text: quoteLines.join("\n").replace(/\n+$/g, "") });
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (/^#{1,6}\s+/.test(line.trim())) {
      blocks.push({ kind: "heading", text: line.trim() });
      i += 1;
      continue;
    }
    if (/^(\*\*\*|---+|___+)\s*$/.test(line.trim())) {
      blocks.push({ kind: "divider", text: line.trim() });
      i += 1;
      continue;
    }
    if (/^([-*+]\s+|\d+\.\s+)/.test(line.trim())) {
      blocks.push({ kind: "list-item", text: line.trim() });
      i += 1;
      continue;
    }
    const para = [line];
    i += 1;
    while (
      i < src.length &&
      src[i].trim() !== "" &&
      !/^```/.test(src[i].trim()) &&
      !/^( {2,}|\t)/.test(src[i]) &&
      !/^#{1,6}\s+/.test(src[i].trim()) &&
      !/^(\*\*\*|---+|___+)\s*$/.test(src[i].trim()) &&
      !/^([-*+]\s+|\d+\.\s+)/.test(src[i].trim())
    ) {
      para.push(src[i]);
      i += 1;
    }
    const joined = [];
    for (let j = 0; j < para.length; j++) {
      const rawLine = para[j];
      const nextExists = j < para.length - 1;
      const hasHardBreak = /\\\s*$/.test(rawLine) || / {2,}$/.test(rawLine);
      const normalizedLine = rawLine.replace(/\\\s*$/, "").replace(/\s+$/, "").replace(/^\s+/, "");
      joined.push(normalizedLine);
      if (nextExists) joined.push(hasHardBreak ? "\n" : " ");
    }
    blocks.push({ kind: "paragraph", text: joined.join("") });
  }
  return blocks;
}

export function splitProseAndCode(md) {
  const blocks = mdBlocks(md);
  const proseParagraphs = [];
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === "code") {
      for (let p = 0; p < proseParagraphs.length; p++) out.push({ kind: "paragraph", text: proseParagraphs[p] });
      proseParagraphs.length = 0;
      out.push(blocks[i]);
    } else if (blocks[i].kind === "heading" || blocks[i].kind === "divider" || blocks[i].kind === "list-item" || blocks[i].kind === "quote") {
      for (let p = 0; p < proseParagraphs.length; p++) out.push({ kind: "paragraph", text: proseParagraphs[p] });
      proseParagraphs.length = 0;
      out.push(blocks[i]);
    } else {
      proseParagraphs.push(blocks[i].text);
    }
  }
  for (let p = 0; p < proseParagraphs.length; p++) out.push({ kind: "paragraph", text: proseParagraphs[p] });

  let paragraphOrdinal = 0;
  let paragraphIndexInSection = 0;
  let startsNewSection = true;
  for (let i = 0; i < out.length; i++) {
    const block = out[i];
    if (block.kind === "heading" || block.kind === "divider") {
      startsNewSection = true;
      paragraphIndexInSection = 0;
      continue;
    }
    if (block.kind === "paragraph") {
      paragraphOrdinal += 1;
      paragraphIndexInSection += 1;
      block.paragraphOrdinal = paragraphOrdinal;
      block.paragraphIndexInSection = paragraphIndexInSection;
      block.isSectionLeadParagraph = startsNewSection;
      startsNewSection = false;
      continue;
    }
    if (block.kind === "list-item" || block.kind === "quote" || block.kind === "code") {
      startsNewSection = false;
    }
  }
  return out;
}
