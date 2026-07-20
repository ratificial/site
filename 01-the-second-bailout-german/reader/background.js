export function createBackgroundController(deps) {
  const { findBookByChapterNr, debounceMs = 500 } = deps;
  let activeBackgroundLayer = 0;
  let activeBackgroundUrl = "";
  let backgroundSwitchTimer = null;
  let pendingBackgroundUrl = "";
  let backgroundLoadToken = 0;
  let enabled = true;

  function resolveResponsiveBackgroundUrl(bgMap) {
    if (!bgMap || typeof bgMap !== "object") return "";
    const widths = Object.keys(bgMap)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    if (!widths.length) return "";

    const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement ? document.documentElement.clientWidth : 0, 360);
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    let target = viewportWidth * dpr;

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const saveData = !!(conn && conn.saveData);
    const effectiveType = conn && typeof conn.effectiveType === "string" ? conn.effectiveType : "";
    if (saveData || effectiveType === "slow-2g" || effectiveType === "2g") {
      target = Math.min(target, 640);
    } else if (effectiveType === "3g") {
      target = Math.min(target, 1280);
    }

    for (let i = 0; i < widths.length; i++) {
      if (widths[i] >= target) return bgMap[String(widths[i])] || "";
    }
    return bgMap[String(widths[widths.length - 1])] || "";
  }

  function applyVisibility() {
    const a = document.getElementById("chapter-bg-a");
    const b = document.getElementById("chapter-bg-b");
    const btn = document.getElementById("bg-toggle");
    if (a) a.style.display = enabled ? "block" : "none";
    if (b) b.style.display = enabled ? "block" : "none";
    if (btn) btn.style.opacity = enabled ? "1" : "0.55";
  }

  function requestForChapter(chapterNr) {
    if (!enabled) return;
    const chapter = findBookByChapterNr(chapterNr);
    const nextUrl = chapter ? resolveResponsiveBackgroundUrl(chapter.bg) : "";
    if (!nextUrl || nextUrl === activeBackgroundUrl) return;
    pendingBackgroundUrl = nextUrl;
    if (backgroundSwitchTimer) clearTimeout(backgroundSwitchTimer);
    backgroundSwitchTimer = setTimeout(() => {
      backgroundSwitchTimer = null;
      const scheduledUrl = pendingBackgroundUrl;
      if (!scheduledUrl || scheduledUrl === activeBackgroundUrl) return;
      const front = document.getElementById(activeBackgroundLayer === 0 ? "chapter-bg-a" : "chapter-bg-b");
      const back = document.getElementById(activeBackgroundLayer === 0 ? "chapter-bg-b" : "chapter-bg-a");
      if (!front || !back) return;
      const token = ++backgroundLoadToken;
      const img = new Image();
      img.onload = () => {
        if (token !== backgroundLoadToken) return;
        back.style.backgroundImage = `url("${scheduledUrl}")`;
        back.classList.add("visible");
        front.classList.remove("visible");
        activeBackgroundLayer = activeBackgroundLayer === 0 ? 1 : 0;
        activeBackgroundUrl = scheduledUrl;
      };
      img.src = scheduledUrl;
    }, debounceMs);
  }

  function setEnabled(nextEnabled) {
    enabled = !!nextEnabled;
  }

  function getEnabled() {
    return enabled;
  }

  return {
    applyVisibility,
    requestForChapter,
    setEnabled,
    getEnabled,
  };
}
