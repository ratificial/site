export function attachReaderEventHandlers(ctx) {
  const {
    getInitDone,
    updateViewportDebugOverlay,
    isSyncScrollLock,
    isViewportChangeLock,
    getOffsetLine,
    setOffsetAndMode,
    offsetForContentY,
    renderViewport,
    onScrollSample,
    scheduleViewportRebuild,
    setTocOpen,
    getTocOpen,
    getNavigationMode,
    flip,
    stepLines,
    onResumeGo,
    onResumeClose,
    onCopyParagraphLink,
  } = ctx;

  let scrollFramePending = false;
  let latestScrollY = 0;

  function flushScrollFrame() {
    scrollFramePending = false;
    if (typeof isSyncScrollLock === 'function' && isSyncScrollLock()) return;
    if (typeof isViewportChangeLock === 'function' && isViewportChangeLock()) return;
    const nextOffset = offsetForContentY(latestScrollY, false);
    if (typeof onScrollSample === 'function') {
      onScrollSample(nextOffset, nextOffset !== getOffsetLine());
    }
    if (nextOffset !== getOffsetLine()) {
      setOffsetAndMode(nextOffset, 'scroll');
      renderViewport();
    }
  }

  let touchStartX = null;
  let touchStartY = null;
  let touchStartOnUi = false;

  function isUiTapTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest('#toolbar')) return true;
    if (target.closest('#toc-flyout')) return true;
    if (target.closest('#toc-toggle')) return true;
    if (target.closest('#resume-popover')) return true;
    if (target.closest('#paging-next')) return true;
    if (target.closest('button, a, select, input, textarea, label')) return true;
    return false;
  }

  window.addEventListener('scroll', () => {
    if (!getInitDone()) return;
    updateViewportDebugOverlay();
    if (typeof isSyncScrollLock === 'function' && isSyncScrollLock()) return;
    if (typeof isViewportChangeLock === 'function' && isViewportChangeLock()) return;
    latestScrollY = window.scrollY;
    if (scrollFramePending) return;
    scrollFramePending = true;
    requestAnimationFrame(flushScrollFrame);
  }, { passive: true });

  window.addEventListener('resize', () => {
    scheduleViewportRebuild();
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      scheduleViewportRebuild();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && getTocOpen()) { setTocOpen(false); e.preventDefault(); return; }
    if (e.key === 'ArrowRight') { flip(1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { flip(-1); e.preventDefault(); }
    if (e.key === 'ArrowDown') { stepLines(1); e.preventDefault(); }
    if (e.key === 'ArrowUp') { stepLines(-1); e.preventDefault(); }
    if (e.key === 'PageDown' || e.key === ' ') { flip(1); e.preventDefault(); }
    if (e.key === 'PageUp') { flip(-1); e.preventDefault(); }
  });

  document.addEventListener('click', (e) => {
    if (!getTocOpen()) return;
    const flyout = document.getElementById('toc-flyout');
    const toggle = document.getElementById('toc-toggle');
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (flyout && flyout.contains(target)) return;
    if (toggle && toggle.contains(target)) return;
    setTocOpen(false);
  });

  document.addEventListener('contextmenu', async (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const lineEl = target.closest('[data-chapter-nr][data-paragraph-nr]');
    if (!(lineEl instanceof Element)) return;
    const kind = String(lineEl.getAttribute('data-line-kind') || '');
    if (kind === 'spacer' || kind === 'divider') return;
    const chapterNr = parseInt(String(lineEl.getAttribute('data-chapter-nr') || ''), 10);
    const paragraphNr = parseInt(String(lineEl.getAttribute('data-paragraph-nr') || ''), 10);
    if (!Number.isInteger(chapterNr) || !Number.isInteger(paragraphNr)) return;
    e.preventDefault();
    if (typeof onCopyParagraphLink === 'function') {
      await onCopyParagraphLink(chapterNr, paragraphNr);
    }
  });

  document.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length !== 1) {
      touchStartX = null;
      touchStartY = null;
      touchStartOnUi = false;
      return;
    }
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartOnUi = isUiTapTarget(e.target);
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (getTocOpen()) {
      touchStartX = null;
      touchStartY = null;
      touchStartOnUi = false;
      return;
    }
    if (touchStartX === null || touchStartY === null) return;
    const changed = e.changedTouches;
    if (!changed || changed.length !== 1) return;
    const t = changed[0];
    const dx = Math.abs(t.clientX - touchStartX);
    const dy = Math.abs(t.clientY - touchStartY);
    touchStartX = null;
    touchStartY = null;
    const startedOnUi = touchStartOnUi;
    touchStartOnUi = false;
    if (startedOnUi) return;
    if (dx > 14 || dy > 14) return;
    const ratio = t.clientX / Math.max(1, window.innerWidth);
    if (ratio <= 0.2) {
      flip(-1);
      return;
    }
    if (ratio >= 0.7) {
      flip(1);
    }
  }, { passive: true });

  const resumeGo = document.getElementById('resume-popover-go');
  const resumeClose = document.getElementById('resume-popover-close');
  if (resumeGo) resumeGo.addEventListener('click', onResumeGo);
  if (resumeClose) resumeClose.addEventListener('click', onResumeClose);
}
