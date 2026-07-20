export function setTocOpenState(open, flyout, toggle) {
  const tocOpen = !!open;
  if (flyout) {
    flyout.classList.toggle("active", tocOpen);
    flyout.setAttribute("aria-hidden", tocOpen ? "false" : "true");
  }
  if (toggle) toggle.style.opacity = tocOpen ? "1" : "0.85";
  return tocOpen;
}

export function updateTocActiveState(params) {
  const { flyout, activeChapter, isBehindFurthest } = params;
  if (!flyout) return;
  const items = flyout.querySelectorAll(".toc-item");
  for (let i = 0; i < items.length; i++) {
    const btn = items[i];
    if (!Object.prototype.hasOwnProperty.call(btn.dataset, "chapter")) continue;
    const ch = parseInt(btn.dataset.chapter || "0", 10);
    btn.classList.toggle("active", ch === activeChapter);
  }
  const resumeBtn = document.getElementById("toc-resume-furthest");
  if (resumeBtn) resumeBtn.style.display = isBehindFurthest ? "block" : "none";
}

export function renderTocFlyout(params) {
  const {
    el,
    book,
    chapterIdAt,
    furthestLoc,
    findBookByChapterNr,
    onJumpToFurthest,
    onSetTocOpen,
    onScrollToChapter,
    onUpdateTocActive,
    controls,
  } = params;
  if (!el) return;
  el.innerHTML = "";
  if (controls) {
    const controlsWrap = document.createElement("div");
    controlsWrap.className = "toc-controls";

    const fontRow = document.createElement("div");
    fontRow.className = "toc-controls-row five";
    const fontSizes = [16, 18, 20, 24, 28];
    for (let i = 0; i < fontSizes.length; i++) {
      const size = fontSizes[i];
      const btn = document.createElement("button");
      btn.className = "toc-item toc-font-btn";
      btn.textContent = "Aa";
      btn.style.fontSize = `${Math.max(12, Math.round(size * 0.72))}px`;
      if (size === controls.fontSize) btn.classList.add("active");
      btn.addEventListener("click", () => {
        controls.onSetFontSize(size);
        onSetTocOpen(false);
      });
      fontRow.appendChild(btn);
    }
    controlsWrap.appendChild(fontRow);

    const modeRow = document.createElement("div");
    modeRow.className = "toc-controls-row";
    const compactBtn = document.createElement("button");
    compactBtn.className = "toc-item";
    compactBtn.textContent = "compact";
    if (controls.renderingMode === "compact") compactBtn.classList.add("active");
    compactBtn.addEventListener("click", () => {
      controls.onChangeRenderingMode("compact");
      onSetTocOpen(false);
    });
    const comfortableBtn = document.createElement("button");
    comfortableBtn.className = "toc-item";
    comfortableBtn.textContent = "comfort";
    if (controls.renderingMode === "comfortable") comfortableBtn.classList.add("active");
    comfortableBtn.addEventListener("click", () => {
      controls.onChangeRenderingMode("comfortable");
      onSetTocOpen(false);
    });
    modeRow.appendChild(compactBtn);
    modeRow.appendChild(comfortableBtn);
    controlsWrap.appendChild(modeRow);

    const bgRow = document.createElement("div");
    bgRow.className = "toc-controls-row";
    const bgOn = document.createElement("button");
    bgOn.className = "toc-item";
    bgOn.textContent = "BG on";
    if (controls.backgroundsEnabled) bgOn.classList.add("active");
    bgOn.addEventListener("click", () => {
      controls.onSetBackgroundsEnabled(true);
      onSetTocOpen(false);
    });
    const bgOff = document.createElement("button");
    bgOff.className = "toc-item";
    bgOff.textContent = "BG off";
    if (!controls.backgroundsEnabled) bgOff.classList.add("active");
    bgOff.addEventListener("click", () => {
      controls.onSetBackgroundsEnabled(false);
      onSetTocOpen(false);
    });
    bgRow.appendChild(bgOn);
    bgRow.appendChild(bgOff);
    controlsWrap.appendChild(bgRow);

    const themeRow = document.createElement("div");
    themeRow.className = "toc-controls-row";
    const darkBtn = document.createElement("button");
    darkBtn.className = "toc-item";
    darkBtn.textContent = "dark";
    if ((controls.themeIdx || 0) === 0) darkBtn.classList.add("active");
    darkBtn.addEventListener("click", () => {
      controls.onSetTheme(0);
      onSetTocOpen(false);
    });
    const lightBtn = document.createElement("button");
    lightBtn.className = "toc-item";
    lightBtn.textContent = "light";
    if ((controls.themeIdx || 0) === 1) lightBtn.classList.add("active");
    lightBtn.addEventListener("click", () => {
      controls.onSetTheme(1);
      onSetTocOpen(false);
    });
    themeRow.appendChild(darkBtn);
    themeRow.appendChild(lightBtn);
    controlsWrap.appendChild(themeRow);

    const layoutRow = document.createElement("div");
    layoutRow.className = "toc-controls-row three";
    const layoutOptions = [
      { key: "left", label: "left" },
      { key: "center", label: "center" },
      { key: "right", label: "right" },
    ];
    for (let i = 0; i < layoutOptions.length; i++) {
      const opt = layoutOptions[i];
      const btn = document.createElement("button");
      btn.className = "toc-item";
      btn.textContent = opt.label;
      if ((controls.widescreenLayout || "right") === opt.key) btn.classList.add("active");
      btn.addEventListener("click", () => {
        controls.onSetWidescreenLayout(opt.key);
        onSetTocOpen(false);
      });
      layoutRow.appendChild(btn);
    }
    controlsWrap.appendChild(layoutRow);

    if (Array.isArray(controls.locales) && controls.locales.length > 0) {
      const localeRow = document.createElement("div");
      localeRow.className = "toc-controls-row";
      const current = controls.currentLocaleSlug || "";
      for (let i = 0; i < controls.locales.length; i++) {
        const loc = controls.locales[i];
        const b = document.createElement("button");
        b.className = "toc-item";
        const code = String(loc.code || "").toUpperCase();
        if (code === "DE") b.textContent = "🇩🇪 Deutsch";
        else if (code === "EN") b.textContent = "🇬🇧 English";
        else b.textContent = loc.label || loc.slug || code;
        if (loc.slug === current) b.classList.add("active");
        b.addEventListener("click", () => controls.onSwitchLocale(loc.slug));
        localeRow.appendChild(b);
      }
      controlsWrap.appendChild(localeRow);
    }

    const sepControls = document.createElement("div");
    sepControls.className = "toc-divider";
    controlsWrap.appendChild(sepControls);
    el.appendChild(controlsWrap);
  }

  const resumeBtn = document.createElement("button");
  resumeBtn.className = "toc-item";
  resumeBtn.id = "toc-resume-furthest";
  let resumeLabel = "Go to furthest read";
  if (furthestLoc) {
    const chapterLabel = `Chapter ${furthestLoc.chapterNr}`;
    resumeLabel = `Go to furthest read - ${chapterLabel}`;
  }
  resumeBtn.textContent = resumeLabel;
  resumeBtn.addEventListener("click", () => {
    onJumpToFurthest();
    onSetTocOpen(false);
  });
  el.appendChild(resumeBtn);

  const sep = document.createElement("div");
  sep.className = "toc-divider";
  el.appendChild(sep);

  for (let i = 0; i < book.length; i++) {
    const item = book[i];
    const chapterId = chapterIdAt(i);
    const btn = document.createElement("button");
    btn.className = "toc-item";
    btn.dataset.chapter = String(chapterId);
    btn.textContent = `${chapterId}. ${item.title || `Chapter ${chapterId}`}`;
    const level = Number.isInteger(item.headingLevel) ? item.headingLevel : 2;
    btn.style.paddingLeft = level <= 1 ? "12px" : "26px";
    btn.addEventListener("click", () => {
      onScrollToChapter(i);
      onSetTocOpen(false);
    });
    el.appendChild(btn);
  }
  onUpdateTocActive();
}
