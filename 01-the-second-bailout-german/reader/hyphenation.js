export function stripSoftHyphens(text) {
  return (text || "").replace(/\u00ad/g, "");
}

export function hyphenateWord(word, deps) {
  const {
    linebreakDict,
    hyphenPrefixes,
    hyphenSuffixes,
    softHyphen,
  } = deps;
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  if (linebreakDict[lower]) {
    const parts = linebreakDict[lower];
    const looksLinguistic = Array.isArray(parts) && parts.length > 1 && (
      parts.length >= 3 ||
      hyphenPrefixes.includes(parts[0].toLowerCase()) ||
      hyphenSuffixes.includes(parts[parts.length - 1].toLowerCase())
    );
    if (looksLinguistic) {
      let cursor = 0;
      const out = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        out.push(word.slice(cursor, cursor + p.length));
        cursor += p.length;
      }
      if (cursor < word.length && out.length) out[out.length - 1] += word.slice(cursor);
      return out;
    }
  }
  if (lower.length < 8) return [word];

  for (let i = 0; i < hyphenPrefixes.length; i++) {
    const prefix = hyphenPrefixes[i];
    if (lower.startsWith(prefix) && lower.length - prefix.length >= 4) {
      return [word.slice(0, prefix.length), word.slice(prefix.length)];
    }
  }

  for (let i = 0; i < hyphenSuffixes.length; i++) {
    const suffix = hyphenSuffixes[i];
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 4) {
      const cut = word.length - suffix.length;
      return [word.slice(0, cut), word.slice(cut)];
    }
  }

  const fallback = Math.floor(word.length / 2);
  if (fallback >= 4 && word.length - fallback >= 4) return [word.slice(0, fallback), word.slice(fallback)];
  return [word];
}

export function hyphenateText(text, deps) {
  if (!deps.useRuntimeHyphenation) return text;
  const tokens = text.split(/(\s+)/);
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\s+$/.test(t) || t === "") {
      out += t;
      continue;
    }
    const pieces = hyphenateWord(t, deps);
    out += pieces.join(deps.softHyphen);
  }
  return out;
}
