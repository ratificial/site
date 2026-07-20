export function createAppState(initial) {
  const state = { ...initial };
  return {
    read() {
      return { ...state };
    },
    patch(patch) {
      const next = patch || {};
      const keys = Object.keys(next);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (Object.prototype.hasOwnProperty.call(state, k)) state[k] = next[k];
      }
    },
    get(key) {
      return state[key];
    },
    set(key, value) {
      state[key] = value;
    },
  };
}

export function formatLocation(ch, para, line) {
  return `${ch}-${para}-${line}`;
}

export function parseLocation(value) {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*$/.exec(value || "");
  if (!m) return null;
  return { chapterNr: parseInt(m[1], 10), paragraphNr: parseInt(m[2], 10), lineNr: parseInt(m[3], 10) };
}

export function readInitialModel(params) {
  const { prefsKey, locationKey, themes } = params;
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem(prefsKey) || "{}") || {};
  } catch (_) {
    prefs = {};
  }
  const storageLoc = parseLocation(localStorage.getItem(locationKey));
  let loc = storageLoc || { chapterNr: 0, paragraphNr: 0, lineNr: 0 };
  const model = {
    loc,
    fontSize: Number.isFinite(prefs.fontSize) ? prefs.fontSize : 18,
    renderingMode: prefs.renderingMode === "comfortable" ? "comfortable" : "compact",
    navigationMode: prefs.navigationMode === "scroll" ? "scroll" : "flip",
    themeIdx: Number.isInteger(prefs.themeIdx) ? Math.max(0, Math.min(themes.length - 1, prefs.themeIdx)) : 0,
    backgroundsEnabled: typeof prefs.backgroundsEnabled === "boolean" ? prefs.backgroundsEnabled : true,
    widescreenLayout: prefs.widescreenLayout === "left" || prefs.widescreenLayout === "center" || prefs.widescreenLayout === "right"
      ? prefs.widescreenLayout
      : "right",
  };
  model.fontSize = Math.max(14, Math.min(32, model.fontSize));
  return model;
}

export function persistPrefs(prefsKey, state) {
  const prefs = {
    fontSize: state.fontSize,
    renderingMode: state.renderingMode,
    navigationMode: state.navigationMode,
    themeIdx: state.themeIdx,
    backgroundsEnabled: state.backgroundsEnabled,
    widescreenLayout: state.widescreenLayout,
  };
  localStorage.setItem(prefsKey, JSON.stringify(prefs));
}
