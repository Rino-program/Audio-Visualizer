/**
 * Audio Visualizer JS
 * - Removed YouTube
 * - Improved Input Source Switching (File / Mic)
 * - Microphone Device Selection
 */

// Google Drive integration removed for F‑Droid packaging

// ============== STATE ==============
const state = {
  playlist: [],
  currentIndex: -1,
  addedOrderCounter: 0, // プレイリストに追加された順序を追跡
  isPlaying: false,
  isRestoringPlayback: false,
  mode: 0,
  uiVisible: true,
  playlistVisible: false,
  settingsOpen: false,
  isExporting: false,
  mediaRecorder: null,
  recordedChunks: [],
  playTimeout: null,
  uiTimeout: null,
  sleepTimerId: null,
  sleepTimerEnd: 0,
  lastSyncTime: 0,
  lastAudioTime: 0, // シーク検出用
  playRequestId: 0,
  deviceMusicScanning: false,

  // Input Source
  inputSource: "file", // 'file' or 'mic'
  micStream: null,
  micDeviceId: "",

  // Audio nodes
  audioCtx: null,
  analyser: null,
  source: null, // Current active source
  fileSource: null, // MediaElementSource
  micSource: null, // MediaStreamSource
  eqFilters: [],
  gainNode: null,
  panNode: null,
  balanceNodes: null,

  // Visualization data
  freqData: null,
  timeData: null,
  bufLen: 0,
  displayValues: null,
  prevLevels: null,
  sandHeights: null,

  // Settings
  settings: {
    smoothing: 0.7,
    sensitivity: 1.8,
    barCount: 64,
    lowFreq: 20,
    highFreq: 16000,
    glowStrength: 20,
    glowEnabled: false,
    blurEnabled: false,
    fftSize: 8192,
    opacity: 1.0,
    bgBlur: 0,
    mirror: false,
    rainbow: true,
    fixedColor: "#4facfe",
    showLabels: true,
    persistSettings: true,
    lowPowerMode: false,
    targetFps: 60,
    // 内部描画解像度（0 = ネイティブ）。見た目のサイズ感は変えずに負荷だけ調整する。
    renderDpr: 1.5,
    showVideo: true,
    videoMode: "window", // 'window' or 'background'
    videoFitMode: "cover", // 'cover', 'contain', 'fill'
    repeatMode: "none", // 'none', 'one', 'all'
    shuffle: false,
    eq: [0, 0, 0, 0, 0, 0, 0, 0],
    playbackRate: 1.0,
    balance: 0,
    autoPlayNext: true,
    stopOnVideoEnd: false,
    resumePlayback: true,
    keepScreenOn: true,
    storeLocalFiles: false,
    // New visualization settings
    changeMode: "off", // 'off' | 'plus' | 'plusminus'
    sandMode: false,
    sandFallRate: 0.6, // per second
    circleAngleOffset: 0,
    // UI auto-hide settings
    autoHideUI: true,
    // fullscreen button visibility
    showFullscreenButton: false,
    // Android: 最後に選択したパス
    lastSelectedPath: "",
    // Volume persistence
    volume: 1.0,
    // 言語設定
    language: "ja-JP",
    // 文字・UI全体の大きさ（%）
    uiScalePercent: 100,
  },
};

// ==========================================================================
// 多言語対応 (i18n) 完全版翻訳辞書データ
// ==========================================================================
// 1. 読み込みたい言語（ファイル名）のリストを定義
const languages = ["ja-JP", "en-US", "zh-CN", "ko-KR"];

let currentLang;

// アプリ起動時に最初に実行する関数
async function initI18n() {
  const i18nData = {};

  // 全言語のJSONを並行してフェッチ（一括読み込み）
  try {
    const promises = languages.map(async (lang) => {
      // I18Nフォルダ内のJSONファイルを指定
      const response = await fetch(`./I18N/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load: ${lang}.json`);
      }
      const data = await response.json();

      // キー名を「ja-JP」から「ja」にする場合はここで調整可能ですが、
      // 今回はファイル名そのまま（"ja-JP" など）をキーにします。
      // もし既存コードが window.I18N.ja で参照している場合は、ハイフン前で区切る処理を入れても良いです（後述）。
      i18nData[lang] = data;
    });

    let savedLang = localStorage.getItem("app_lang");
    // もし古い2文字が保存されていたら、新しい形式に変換する
    if (savedLang === "ja") savedLang = "ja-JP";
    if (savedLang === "en") savedLang = "en-US";
    if (savedLang === "zh") savedLang = "zh-CN";
    if (savedLang === "ko") savedLang = "ko-KR";

    currentLang =
      savedLang ||
      (navigator.language.startsWith("zh")
        ? "zh-CN"
        : navigator.language.startsWith("en")
          ? "en-US"
          : navigator.language.startsWith("ko")
            ? "ko-KR"
            : "ja-JP");
    localStorage.setItem("app_lang", currentLang);

    // すべてのファイルの読み込み完了を待つ
    await Promise.all(promises);

    // 2. 既存のコードと互換性を持たせるために window.I18N にバインド
    window.I18N = i18nData;

    currentLang =
      localStorage.getItem("app_lang") ||
      (navigator.language.startsWith("zh")
        ? "zh-CN"
        : navigator.language.startsWith("en")
          ? "en-US"
          : navigator.language.startsWith("ko")
            ? "ko-KR"
            : "ja-JP");

    console.log("すべての翻訳ファイルを読み込みました:", window.I18N);

    // 3. 翻訳データの準備ができたら、メインのアプリ処理を開始する
    startApplication();
  } catch (error) {
    console.error("翻訳ファイルの読み込み中にエラーが発生しました:", error);
    // フォールバック処理（例: 最悪エラーが出てもアプリが動くように空のオブジェクトを入れておくなど）
    window.I18N = window.I18N || {};
    startApplication();
  }
}

// 元々 script.js のグローバル（直下）で動いていた処理はここにまとめる
function startApplication() {
  console.log("アプリのメイン処理を開始します");

  currentLang =
    localStorage.getItem("app_lang") ||
    (navigator.language.startsWith("zh")
      ? "zh-CN"
      : navigator.language.startsWith("en")
        ? "en-US"
        : navigator.language.startsWith("ko")
          ? "ko-KR"
          : "ja-JP");

  // ==================== スマホ初期化・隙間対策 ====================
  // 起動直後Canvasサイズを強制修正
  function forceCanvasFix() {
    applyCanvasResolution(true); // true = 強制モード
  }

  // 起動後すぐに複数回実行
  setTimeout(forceCanvasFix, 50);
  setTimeout(forceCanvasFix, 700);
  setTimeout(forceCanvasFix, 1500);
}

// 初期化は DOMContentLoaded で1回だけ実行する（二重ロード防止）

// ============== I18N FUNCTIONS ==============
// 指定されたキーの翻訳テキストを返す関数
function t(key, vars = {}) {
  if (!window.I18N) return key;
  let text;
  if (I18N[currentLang] && I18N[currentLang][key] !== undefined) {
    text = I18N[currentLang][key];
  } else if (I18N["ja-JP"] && I18N["ja-JP"][key] !== undefined) {
    text = I18N["ja-JP"][key];
  } else {
    text = key;
  }
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

function updateLanguageUI() {
  console.log(`🌐 言語適用開始: ${currentLang}`);

  // 1. textContent
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const translated = t(key);
    if (translated !== key) el.textContent = translated;
  });

  // 2. title
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    el.title = t(key);
  });

  // 3. aria-label
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    el.setAttribute("aria-label", t(key));
  });

  // 4. placeholder
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = t(key);
  });

  // 5. 設定モーダル内の動的要素も強制更新
  const modal = document.getElementById("settingsModal");
  if (modal && modal.classList.contains("open")) {
    modal
      .querySelectorAll("label, h2, h3, button, option, .tab-btn")
      .forEach((el) => {
        const key =
          el.getAttribute("data-i18n") || el.getAttribute("data-i18n-title");
        if (key) {
          const translated = t(key);
          if (translated !== key) {
            if (
              el.tagName === "OPTION" ||
              el.tagName === "BUTTON" ||
              el.tagName === "LABEL"
            ) {
              el.textContent = translated;
            }
          }
        }
      });
  }

  updateNextUpText(state.currentIndex);
  els.statusText.textContent = state.playlist[state.currentIndex]
    ? `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${state.playlist[state.currentIndex].name}`
    : t("status.idle");
  console.log("✅ 翻訳適用完了");
}

// ============== UTILITY ==============
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ============== ANDROID NATIVE NOTIFICATION (Capacitor plugin) ==============
let nativeMediaPlugin = null;
let nativeMediaListenerInstalled = false;
let nativeNotificationPermissionRequested = false;
let lastNativeMediaSync = {
  title: null,
  artist: null,
  isPlaying: null,
  artwork: null,
  hasTrack: null,
};
const nativePluginCache = {};
let folderImportQueue = Promise.resolve();
let isClearingLibrary = false;

function getRegisteredNativePlugin(name) {
  if (!isNativeCapacitor()) return null;
  if (nativePluginCache[name]) return nativePluginCache[name];
  const registerPlugin = window.Capacitor?.registerPlugin;
  if (typeof registerPlugin === "function") {
    nativePluginCache[name] = registerPlugin(name);
    return nativePluginCache[name];
  }
  return window.Capacitor?.Plugins?.[name] || null;
}

function getNativeMediaPlugin() {
  return getRegisteredNativePlugin("MediaNotification");
}

function getNativeMediaLibraryPlugin() {
  return getRegisteredNativePlugin("MediaLibrary");
}

function getNativeMetadataPlugin() {
  return getRegisteredNativePlugin("MediaMetadata");
}

async function ensureNativeNotificationPermission() {
  if (nativeNotificationPermissionRequested) return;
  nativeNotificationPermissionRequested = true;
  const plugin = getNativeMediaPlugin();
  if (!plugin?.requestNotificationPermission) return;
  try {
    const result = await plugin.requestNotificationPermission();
    if (result && result.granted === false) {
      showOverlay(t("overlay.notificationDenied"), 4000);
    }
  } catch {
    // ignore
  }
}

async function ensureNativeMediaListener() {
  if (nativeMediaListenerInstalled) return;
  nativeMediaPlugin = getNativeMediaPlugin();
  if (!nativeMediaPlugin || !nativeMediaPlugin.addListener) return;

  try {
    await nativeMediaPlugin.addListener("command", (ev) => {
      const cmd = ev && ev.command;
      if (!cmd) return;
      if (cmd === "play") {
        if (!state.isPlaying) togglePlay();
      } else if (cmd === "pause") {
        if (state.isPlaying) togglePlay();
      } else if (cmd === "next") {
        nextTrack();
      } else if (cmd === "prev") {
        prevTrack();
      } else if (cmd === "seek") {
        const positionSec = Number(ev.positionMs) / 1000;
        if (Number.isFinite(positionSec) && Number.isFinite(audio.duration)) {
          audio.currentTime = Math.max(
            0,
            Math.min(audio.duration, positionSec),
          );
          updateTimeDisplay();
        }
      } else if (cmd === "stop") {
        audio.pause();
        audio.currentTime = 0;
        state.isPlaying = false;
        updatePlayBtn();
        updateMediaSessionPlaybackState();
      }
    });
    nativeMediaListenerInstalled = true;
  } catch (e) {
    // ignore
  }
}

function getCurrentTrackTitleArtist() {
  const track = state.playlist[state.currentIndex];
  if (!track) return { title: "Audio Visualizer", artist: "" };

  const meta = track.meta || {};
  let title = meta.title || track.name || t("common.unknown");
  let artist = meta.artist || "Audio Visualizer";

  if (!meta.title) {
    title = title.replace(
      /\.(mp3|m4a|wav|aac|mp4|webm|mkv|mov|ogg|flac|opus)$/i,
      "",
    );
    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  }

  return {
    title,
    artist,
    album: meta.album || "Audio Visualizer",
    artwork: meta.artwork || "",
  };
}

async function syncNativeMediaNotification(force = false) {
  nativeMediaPlugin = nativeMediaPlugin || getNativeMediaPlugin();
  if (!nativeMediaPlugin || !nativeMediaPlugin.update) return;

  await ensureNativeMediaListener();

  const track = state.playlist[state.currentIndex];
  const { title, artist, album, artwork } = getCurrentTrackTitleArtist();
  const isPlaying = !!state.isPlaying;
  const hasTrack = !!track;

  if (isPlaying) {
    await ensureNativeNotificationPermission();
  }

  if (
    !force &&
    lastNativeMediaSync.title === title &&
    lastNativeMediaSync.artist === artist &&
    lastNativeMediaSync.isPlaying === isPlaying &&
    lastNativeMediaSync.artwork === artwork &&
    lastNativeMediaSync.hasTrack === hasTrack
  ) {
    return;
  }

  lastNativeMediaSync = { title, artist, isPlaying, artwork, hasTrack };

  const durationMs = Number.isFinite(audio.duration)
    ? Math.round(audio.duration * 1000)
    : 0;
  const positionMs = Number.isFinite(audio.currentTime)
    ? Math.round(audio.currentTime * 1000)
    : 0;

  try {
    await nativeMediaPlugin.update({
      title,
      artist,
      album,
      isPlaying,
      hasTrack,
      durationMs,
      positionMs,
      artwork,
    });
  } catch (e) {
    // ignore
  }
}

async function ensureTrackMetadata(track) {
  if (!track || track.metaLoaded || track.metaLoading) return;

  const ref = typeof track.localRef === "string" ? track.localRef : "";
  let args = null;
  if (ref.startsWith("app:")) {
    args = { path: ref.slice("app:".length) };
  } else if (ref.startsWith("path:")) {
    args = { path: ref.slice("path:".length) };
  } else if (ref.startsWith("media:")) {
    args = { uri: ref.slice("media:".length) };
  } else if (ref.startsWith("uri:")) {
    args = { uri: ref.slice("uri:".length) };
  }

  if (!args) {
    track.metaLoaded = true;
    return;
  }

  const plugin = getNativeMetadataPlugin();
  if (!plugin || typeof plugin.getMetadata !== "function") {
    track.metaLoaded = true;
    return;
  }

  track.metaLoading = true;
  try {
    const result = await plugin.getMetadata(args);
    if (result && typeof result === "object") {
      const meta = track.meta || {};
      if (result.title) meta.title = result.title;
      if (result.artist) meta.artist = result.artist;
      if (result.album) meta.album = result.album;
      if (result.durationMs) meta.durationMs = result.durationMs;
      if (result.artwork) {
        meta.artwork = result.artwork;
        meta.artworkMime = result.artworkMime || "image/jpeg";
      }
      track.meta = meta;
    }
    track.metaLoaded = true;

    if (state.playlist[state.currentIndex] === track) {
      const index = state.currentIndex;
      const info = getTrackDisplayInfo(track);
      updateTopBadge(track, index);
      updateNowPlayingUI(track, index);
      updateMediaSessionMetadata();
      syncNativeMediaNotification(true);
      if (els.statusText) {
        els.statusText.textContent = `🎵 [${index + 1}/${state.playlist.length}] ${info.title}`;
      }
    }
    saveSettingsToStorage();
  } catch (e) {
    track.metaLoaded = true;
  } finally {
    track.metaLoading = false;
  }
}

function applyKeepScreenOn() {
  const plugin = getNativeMediaPlugin();
  if (!plugin || typeof plugin.setKeepScreenOn !== "function") return;
  const enabled =
    !!state.settings.keepScreenOn &&
    (state.isPlaying || state.inputSource === "mic");
  try {
    plugin.setKeepScreenOn({ enabled }).catch(() => {});
  } catch {
    // ignore
  }
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) {
    console.log("Media Session API not supported");
    return;
  }

  // アクションハンドラを設定
  navigator.mediaSession.setActionHandler("play", () => {
    if (!state.isPlaying) togglePlay();
  });

  navigator.mediaSession.setActionHandler("pause", () => {
    if (state.isPlaying) togglePlay();
  });

  navigator.mediaSession.setActionHandler("previoustrack", () => {
    prevTrack();
  });

  navigator.mediaSession.setActionHandler("nexttrack", () => {
    nextTrack();
  });

  navigator.mediaSession.setActionHandler("seekbackward", (details) => {
    const skipTime = details.seekOffset || 10;
    audio.currentTime = Math.max(0, audio.currentTime - skipTime);
  });

  navigator.mediaSession.setActionHandler("seekforward", (details) => {
    const skipTime = details.seekOffset || 10;
    audio.currentTime = Math.min(
      audio.duration || 0,
      audio.currentTime + skipTime,
    );
  });

  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.seekTime !== undefined && audio.duration) {
      audio.currentTime = Math.min(details.seekTime, audio.duration);
    }
  });

  navigator.mediaSession.setActionHandler("stop", () => {
    audio.pause();
    audio.currentTime = 0;
    state.isPlaying = false;
    updatePlayBtn();
  });

  console.log("Media Session API initialized");
}

function updateMediaSessionMetadata() {
  if (!("mediaSession" in navigator)) {
    syncNativeMediaNotification(false);
    return;
  }

  const track = state.playlist[state.currentIndex];
  if (!track) {
    navigator.mediaSession.metadata = null;
    syncNativeMediaNotification(true);
    return;
  }

  const meta = track.meta || {};
  let title = meta.title || track.name || "Unknown";
  let artist = meta.artist || "Audio Visualizer";

  if (!meta.title) {
    // ファイル拡張子を除去
    title = title.replace(
      /\.(mp3|m4a|wav|aac|mp4|webm|mkv|mov|ogg|flac|opus)$/i,
      "",
    );

    // "Artist - Title" 形式を解析
    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  }

  const artwork = meta.artwork
    ? [
        {
          src: meta.artwork,
          sizes: "512x512",
          type: meta.artworkMime || "image/jpeg",
        },
      ]
    : [
        {
          src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%236366f1" width="100" height="100"/><text x="50" y="60" text-anchor="middle" font-size="40" fill="white">♫</text></svg>',
          sizes: "96x96",
          type: "image/svg+xml",
        },
        {
          src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%236366f1" width="100" height="100"/><text x="50" y="60" text-anchor="middle" font-size="40" fill="white">♫</text></svg>',
          sizes: "128x128",
          type: "image/svg+xml",
        },
        {
          src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%236366f1" width="100" height="100"/><text x="50" y="60" text-anchor="middle" font-size="40" fill="white">♫</text></svg>',
          sizes: "256x256",
          type: "image/svg+xml",
        },
      ];

  navigator.mediaSession.metadata = new MediaMetadata({
    title: title,
    artist: artist,
    album: meta.album || "Audio Visualizer",
    artwork: artwork,
  });

  // Native notification metadata (Android)
  syncNativeMediaNotification(false);
}

function updateMediaSessionPlaybackState() {
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = state.isPlaying
      ? "playing"
      : "paused";

    // 再生位置情報を更新
    if (audio.duration && !isNaN(audio.duration)) {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: audio.currentTime,
      });
    }
  }

  // Native notification state (Android)
  syncNativeMediaNotification(false);
}

// --- Playlist action helpers (simplified, no more-menu) ---
function initPlaylistOverflowHelpers() {
  // No longer needed - simple direct buttons
}

// Initialize helpers after DOM ready (script is included at end but ensure)
try {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlaylistOverflowHelpers);
  } else {
    initPlaylistOverflowHelpers();
  }
} catch (e) {}

const EQ_FREQS = [60, 170, 350, 1000, 3000, 6000, 12000, 14000];
const FREQ_RANGE_PRESETS = {
  standard: { low: 20, high: 16000 },
  full: { low: 20, high: 20000 },
  voice: { low: 100, high: 8000 },
  bass: { low: 20, high: 4000 },
};

const COLOR_PRESETS = [
  { name: "Cyber", color: "#00f2ff" },
  { name: "Sunset", color: "#ff4e50" },
  { name: "Lime", color: "#32ff7e" },
  { name: "Purple", color: "#7d5fff" },
  { name: "Gold", color: "#f9ca24" },
  { name: "Sakura", color: "#ff9ff3" },
  { name: "Ocean", color: "#4facfe" },
  { name: "Flame", color: "#eb4d4b" },
];

const LIBRARY_STORAGE_KEY = "audioVisualizerLibraryV1";
const PLAYBACK_STATE_STORAGE_KEY = "audioVisualizerPlaybackStateV1";
let lastPlaybackStateSaveAt = 0;
let library = {};

// ============== DOM ELEMENTS ==============
const $ = (id) => document.getElementById(id);
const cv = $("cv");
// 描画バックエンドはCanvas2D固定（GPU/CPUの切り替えは提供しない）
let ctx = cv.getContext("2d");
const audio = new Audio();
const bgVideo = $("bgVideo");

const els = {
  uiLayer: $("uiLayer"),
  playBtn: $("playBtn"),
  prevBtn: $("prevBtn"),
  nextBtn: $("nextBtn"),
  shuffleBtn: $("shuffleBtn"),
  repeatBtn: $("repeatBtn"),
  seekBar: $("seekBar"),
  timeDisplay: $("timeDisplay"),
  volSlider: $("volSlider"),
  volIcon: $("volIcon"),
  modeSelect: $("modeSelect"),
  statusText: $("statusText"),
  nowPlayingArtSm: $("nowPlayingArtSm"),
  nextUpText: $("nextUpText"),
  nowPlaying: $("nowPlaying"),
  nowPlayingArt: $("nowPlayingArt"),
  nowPlayingIcon: $("nowPlayingIcon"),
  nowPlayingTitle: $("nowPlayingTitle"),
  nowPlayingArtist: $("nowPlayingArtist"),
  nowPlayingIndex: $("nowPlayingIndex"),
  playlistPanel: $("playlistPanel"),
  playlistToggle: $("playlistToggle"),
  closePlaylistBtn: $("closePlaylistBtn"),
  playlistItems: $("playlistItems"),
  playlistSearchInput: $("playlistSearchInput"),
  clearPlaylistBtn: $("clearPlaylistBtn"),
  fileInput: $("fileInput"),
  folderImportBtn: $("folderImportBtn"),
  toggleUIBtn: $("toggleUIBtn"),
  toggleUIBtnTop: $("toggleUIBtnTop"),
  openSettingsBtn: $("openSettingsBtn"),
  resetAllSettingsBtn: $("resetAllSettingsBtn"),
  exportBtn: $("exportBtn"),
  sourceFileBtn: $("sourceFileBtn"),
  sourceMicBtn: $("sourceMicBtn"),
  micDeviceSelect: $("micDeviceSelect"),
  settingsModal: $("settingsModal"),
  closeSettingsBtn: $("closeSettingsBtn"),
  saveSettingsBtn: $("saveSettingsBtn"),
  controlsBar: $("controlsBar"),
  overlayMsg: $("overlayMsg"),
  progressContainer: $("progressContainer"),
  seekFill: $("seekFill"),
  seekBuffer: $("seekBuffer"),
  playbackControls: $("playbackControls"),
  videoContainer: $("videoContainer"),
  closeVideoBtn: $("closeVideoBtn"),
  toggleVideoModeBtn: $("toggleVideoModeBtn"),
  // lowPowerModeCheckbox removed - replaced by fpsSelect
  autoPlayNextCheckbox: $("autoPlayNextCheckbox"),
  stopOnVideoEndCheckbox: $("stopOnVideoEndCheckbox"),
  persistSettingsCheckbox: $("persistSettingsCheckbox"),
  storageList: $("storageList"),
  storageSummary: $("storageSummary"),
  storageRefreshBtn: $("storageRefreshBtn"),
  storageDeleteAllBtn: $("storageDeleteAllBtn"),
};

function scheduleRenderPlaylist() {
  if (playlistRenderQueued) return;
  playlistRenderQueued = true;
  requestAnimationFrame(() => {
    playlistRenderQueued = false;
    renderPlaylist();
  });
}

function seekBySeconds(deltaSeconds) {
  if (state.inputSource !== "file") return;
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const next = Math.max(
    0,
    Math.min(audio.duration, (audio.currentTime || 0) + deltaSeconds),
  );
  audio.currentTime = next;
  if (bgVideo.src) {
    try {
      bgVideo.currentTime = next;
    } catch {}
  }
  showOverlay(
    deltaSeconds < 0 ? t("overlay.seekBack") : t("overlay.seekForward"),
  );
}

function setupPlaylistEventDelegation() {
  const root = els.playlistItems;
  if (!root) return;
  root.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".remove-btn");
    if (removeBtn) {
      e.stopPropagation();
      removeFromPlaylist(+removeBtn.dataset.index);
      return;
    }

    const moveBtn = e.target.closest(".move-btn");
    if (moveBtn) {
      e.stopPropagation();
      const idx = +moveBtn.dataset.index;
      const direction = moveBtn.classList.contains("up") ? -1 : 1;
      const targetIdx = idx + direction;
      if (targetIdx >= 0 && targetIdx < state.playlist.length) {
        performPlaylistReorder(idx, targetIdx);
      }
      return;
    }

    if (e.target.closest(".drag-handle")) return;
    const item = e.target.closest(".playlist-item");
    if (item && item.dataset && item.dataset.index != null) {
      playTrack(+item.dataset.index);
    }
  });
}

// Capacitor helpers (Android)
function isNativeCapacitor() {
  return (
    typeof window.Capacitor !== "undefined" &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

// CapacitorのconvertFileSrc結果をキャッシュ
const uriConversionCache = new Map();

function toCapacitorFileUrl(uri) {
  if (!uri) return uri;
  // キャッシュを確認
  if (uriConversionCache.has(uri)) {
    return uriConversionCache.get(uri);
  }
  try {
    if (
      typeof window.Capacitor !== "undefined" &&
      typeof window.Capacitor.convertFileSrc === "function"
    ) {
      const result = window.Capacitor.convertFileSrc(uri);
      uriConversionCache.set(uri, result);
      return result;
    }
  } catch {
    // ignore
  }
  uriConversionCache.set(uri, uri);
  return uri;
}

// ============== Blob URL LRU Cache ==============
class BlobUrlCache {
  constructor(maxSize = 2) {
    this.maxSize = maxSize;
    this.list = []; // [{ track, url }]
  }
  put(track, url) {
    // remove existing entry for this track
    this.list = this.list.filter((e) => e.track !== track);
    this.list.push({ track, url });
    this.enforceLimit([audio.src, bgVideo.src]);
  }
  release(track) {
    const idx = this.list.findIndex((e) => e.track === track);
    if (idx >= 0) {
      const url = this.list[idx].url;
      this.list.splice(idx, 1);
      this.safeRevoke(url);
    }
  }
  safeRevoke(url) {
    try {
      if (url && isBlobUrl(url) && audio.src !== url && bgVideo.src !== url) {
        URL.revokeObjectURL(url);
      }
    } catch {}
  }
  enforceLimit(excludeUrls = []) {
    while (this.list.length > this.maxSize) {
      const oldest = this.list[0];
      this.list.shift();
      if (!excludeUrls.includes(oldest.url)) {
        this.safeRevoke(oldest.url);
        // mark track url cleared if matches
        if (oldest.track && oldest.track.url === oldest.url) {
          oldest.track.url = undefined;
          oldest.track.ephemeral = false;
        }
      } else {
        // push back if excluded
        this.list.push(oldest);
        break;
      }
    }
  }
}
const blobCache = new BlobUrlCache(2);

async function ensureUrlForTrack(track) {
  if (!track) throw new Error("Track is undefined");
  if (track.url && (!track.ephemeral || isBlobUrl(track.url))) return track.url;
  // Local file via blob stored
  if (track.fileBlob instanceof Blob) {
    const url = URL.createObjectURL(track.fileBlob);
    track.url = url;
    track.ephemeral = true;
    blobCache.put(track, url);
    return url;
  }
  // Local references
  if (typeof track.localRef === "string") {
    if (track.localRef.startsWith("idb:")) {
      const id = track.localRef.slice("idb:".length);
      try {
        const file = await idbGetLocalFile(id);
        if (file) {
          const url = URL.createObjectURL(file);
          track.url = url;
          track.ephemeral = true;
          blobCache.put(track, url);
          return url;
        }
      } catch (e) {
        console.warn("IDB read failed", e);
      }
    } else if (track.localRef.startsWith("app:")) {
      const p = track.localRef.slice("app:".length);
      track.url = toCapacitorFileUrl(p);
      track.ephemeral = false;
      return track.url;
    } else if (track.localRef.startsWith("media:")) {
      const uri = track.localRef.slice("media:".length);
      track.url = toCapacitorFileUrl(uri);
      track.ephemeral = false;
      return track.url;
    } else if (track.localRef.startsWith("uri:")) {
      const uri = track.localRef.slice("uri:".length);
      track.url = toCapacitorFileUrl(uri);
      track.ephemeral = false;
      return track.url;
    } else if (track.localRef.startsWith("path:")) {
      const p = track.localRef.slice("path:".length);
      track.url = fileUrlFromPath(p);
      track.ephemeral = false;
      return track.url;
    }
  }
  // Drive support removed: no remote blob handling
  // Fallback
  throw new Error("Unable to ensure URL for track");
}

function releaseObjectUrlForTrack(track) {
  if (!track || !track.url) return;
  if (
    track.ephemeral &&
    isBlobUrl(track.url) &&
    audio.src !== track.url &&
    bgVideo.src !== track.url
  ) {
    try {
      URL.revokeObjectURL(track.url);
    } catch {}
    track.url = undefined;
    track.ephemeral = false;
  }
  blobCache.release(track);
}

let W, H;
let topBarH = 0;
let bottomBarH = 0;
let orientationChangeTimer1 = null;
let orientationChangeTimer2 = null;

function setAppHeight() {
  const viewH = window.visualViewport?.height || window.innerHeight;
  const viewW = window.visualViewport?.width || window.innerWidth;
  document.documentElement.style.setProperty("--app-height", `${viewH}px`);
  document.documentElement.style.setProperty("--app-width", `${viewW}px`);
}

// On some mobile browsers the CSS 100vh and viewport units can change
// when the address bar shows/hides or after orientation changes. Setting
// the body's explicit height helps keep absolutely-positioned UI elements
// anchored correctly instead of snapping to the top-left.
function applyExplicitBodyHeight() {
  const viewH = window.visualViewport?.height || window.innerHeight;
  try {
    document.body.style.height = `${viewH}px`;
    document.body.style.minHeight = `${viewH}px`;
  } catch (e) {
    // ignore in non-browser or constrained environments
  }
}

// Keep body height in sync whenever app height is updated
const _orig_setAppHeight = setAppHeight;
setAppHeight = function () {
  _orig_setAppHeight();
  applyExplicitBodyHeight();
};
function clearPlayTimeout() {
  if (state.playTimeout) {
    clearTimeout(state.playTimeout);
    state.playTimeout = null;
  }
}

// ============== INITIALIZATION ==============
async function init() {
  loadSettings();
  applyUiScale(false);
  updateLanguageUI();
  loadDeveloperMessage();
  library = loadLibraryFromStorage();
  await loadPlaylistFromStorage();
  try {
    await restorePendingFolderImport();
  } catch (error) {
    console.error("Pending folder import restore failed:", error);
    showOverlay(t("overlay.fileSelectFailed"));
  }
  rebuildLibraryFromPlaylist();
  renderStorageList();

  // Playlist click handlers (reduce per-render work)
  setupPlaylistEventDelegation();

  setAppHeight();
  resize();
  window.addEventListener(
    "resize",
    debounce(() => {
      resize();
      clampVideoContainerToViewport(els.videoContainer);
    }, 150),
  );

  // visualViewportの変化にも対応
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize);
    window.visualViewport.addEventListener("scroll", resize);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => {
    setTimeout(resize, 100); // 向き変更後に少し待つ
  });

  window.addEventListener("orientationchange", () => {
    clearTimeout(orientationChangeTimer1);
    clearTimeout(orientationChangeTimer2);

    orientationChangeTimer1 = setTimeout(() => {
      setAppHeight();
      resize();
      calculateUIHeights();
      clampVideoContainerToViewport(els.videoContainer);

      // Monitor モードの場合は画面向き変更後に再計算して再描画
      if (state.mode === "monitor") {
        requestAnimationFrame(() => {
          const viewW = window.visualViewport?.width || window.innerWidth;
          const viewH = window.visualViewport?.height || window.innerHeight;
          W = cv.width = viewW;
          H = cv.height = viewH;
          calculateUIHeights();
          drawMonitor();
        });
      }
    }, 200);

    orientationChangeTimer2 = setTimeout(() => {
      setAppHeight();
      resize();
      clampVideoContainerToViewport(els.videoContainer);
    }, 500);
  });
  // Calculate UI heights after initial render
  requestAnimationFrame(() => {
    calculateUIHeights();
  });

  // 開発者メッセージは init() の冒頭で読み込む

  // Audio setup
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";

  // Audio events
  audio.addEventListener("loadedmetadata", onMetadataLoaded);
  audio.addEventListener("timeupdate", () => {
    updateProgress();
    savePlaybackState();
  });
  audio.addEventListener("play", () => {
    state.isPlaying = true;
    updatePlayBtn();
    updateMediaSessionPlaybackState();
    applyKeepScreenOn();
    savePlaybackState(true);
    renderEmaInterval = 0;
    renderSlowStreak = 0;
    invalidateRender(3);
    if (bgVideo.src && state.settings.showVideo) {
      bgVideo.play().catch(() => {});
    }
  });
  audio.addEventListener("playing", () => {
    console.log("[STATUS] playing");
    if (bgVideo.src && state.settings.showVideo) {
      // 音声が実際に再生開始された瞬間に動画の時間を同期
      bgVideo.currentTime = audio.currentTime + getVideoStartOffset();
      bgVideo.play().catch(() => {});
    }
    const track = state.playlist[state.currentIndex];
    if (track) {
      // els.statusText.textContent = t('status.loading');
      updateTopBadge(track, state.currentIndex);
    }
    updateMediaSessionMetadata();
    updateMediaSessionPlaybackState();
  });
  audio.addEventListener("waiting", () => {
    if (!state.isPlaying) {
      els.statusText.textContent = t("status.loading");
    }
  });
  audio.addEventListener("pause", () => {
    clearPlayTimeout();
    state.isPlaying = false;
    updatePlayBtn();
    bgVideo.pause();
    updateMediaSessionPlaybackState();
    applyKeepScreenOn();
    savePlaybackState(true);
    // 停止状態を1〜2フレーム描いてから描画ループを止める
    invalidateRender(2);
  });
  audio.addEventListener("ended", () => {
    if (state.isExporting) {
      finishExport();
      return;
    }
    // リピートモードが'one'の場合は同じ曲を再生
    if (state.settings.repeatMode === "one") {
      audio.currentTime = 0;
      savePlaybackState(true);
      audio.play().catch(() => {});
      return;
    }
    // 自動再生が有効なら次の曲へ
    if (state.settings.autoPlayNext) {
      nextTrack();
    } else {
      clearPlaybackState();
      state.isPlaying = false;
      updatePlayBtn();
    }
  });
  audio.addEventListener("error", handleAudioError);
  audio.addEventListener("seeking", () => {
    if (bgVideo.src)
      bgVideo.currentTime = audio.currentTime + getVideoStartOffset();
  });
  audio.addEventListener("seeked", () => {
    if (bgVideo.src)
      bgVideo.currentTime = audio.currentTime + getVideoStartOffset();
    savePlaybackState(true);
    syncNativeMediaNotification(true);
  });

  bgVideo.addEventListener("error", () => {
    console.warn("Video load failed");
    // MP3等の音声ファイルの場合はエラーメッセージを表示しない
    const currentTrack = state.playlist[state.currentIndex];
    if (currentTrack && currentTrack.isVideo) {
      showOverlay(t("overlay.videoLoadFailed"));
    }
    els.videoContainer.classList.add("hidden");
  });
  bgVideo.addEventListener("ended", () => {
    if (state.settings.stopOnVideoEnd && state.settings.showVideo) {
      audio.pause();
      state.isPlaying = false;
      updatePlayBtn();
      showOverlay(t("overlay.videoEnded"));
    }
  });

  // UI Events
  els.playBtn.onclick = togglePlay;
  els.prevBtn.onclick = prevTrack;
  els.nextBtn.onclick = nextTrack;
  els.shuffleBtn.onclick = toggleShuffle;
  els.repeatBtn.onclick = toggleRepeat;
  els.seekBar.oninput = seek;
  els.volSlider.oninput = updateVolume;
  els.modeSelect.onchange = (e) => {
    state.mode = +e.target.value;
    invalidateRender(2);
    const modeName = e.target.options[e.target.selectedIndex].text;
    showOverlay(t("overlay.mode", { mode: modeName }));
  };
  // === 言語切り替え（強化版）===
  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.value = currentLang;

    // 変更イベント（「保存して閉じる」まで反映しない）
    langSelect.addEventListener("change", (e) => {
      setSetting("language", e.target.value);
    });
  }
  // UI表示ボタン：タッチ環境で click/touchstart が二重に走りやすいので
  // 「押して離した(pointerup)」タイミングでのみトグルする
  const bindUIToggleButton = (btn) => {
    if (!btn) return;
    btn.addEventListener(
      "pointerup",
      (e) => {
        if (e.pointerType === "touch" || e.pointerType === "mouse") {
          e.preventDefault();
          e.stopImmediatePropagation();
          toggleUI();
        }
      },
      { passive: false },
    );
    // キーボード操作など pointerup を伴わないクリックにも対応
    btn.addEventListener("click", (e) => {
      if (e.detail === 0) toggleUI();
    });
  };
  bindUIToggleButton(els.toggleUIBtn);
  bindUIToggleButton(els.toggleUIBtnTop);

  // 既存の els 定義の近く
  els.toggleUIBtn = document.getElementById("toggleUIBtn");
  els.toggleUIBtnTop = document.getElementById("toggleUIBtnTop");
  els.fullscreenBtn = document.getElementById("fullscreenBtn");

  els.openSettingsBtn.onclick = openSettings;
  els.closeSettingsBtn.onclick = closeSettings;
  els.saveSettingsBtn.onclick = saveSettings;
  els.resetAllSettingsBtn.onclick = async () => {
    if (confirm(t("confirm.resetAll"))) {
      try {
        // プレイリストのBlobURLを解放
        state.playlist.forEach((t) => {
          if (t.source === "local" && isBlobUrl(t.url)) {
            URL.revokeObjectURL(t.url);
          }
        });

        // IndexedDBを削除
        if (typeof indexedDB !== "undefined") {
          await new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(LOCAL_FILE_DB_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            req.onblocked = () => {
              console.warn("IndexedDB deletion blocked, continuing anyway");
              resolve();
            };
          });
        }

        // localStorageを完全にクリア
        localStorage.clear();

        // 音声を停止
        audio.pause();
        audio.src = "";
        bgVideo.pause();
        bgVideo.src = "";

        // リロード
        location.reload();
      } catch (err) {
        console.error("Failed to reset:", err);
        alert(t("alert.initFailed", { message: err.message }));
      }
    }
  };
  // els.exportBtn.onclick = startExport;
  els.playlistToggle.onclick = togglePlaylist;
  // folderImportBtnは統合のため削除
  els.closePlaylistBtn.onclick = togglePlaylist;
  els.playlistSearchInput.oninput = scheduleRenderPlaylist;
  els.clearPlaylistBtn.onclick = async () => {
    if (confirm(t("confirm.clearPlaylist"))) {
      await deleteAllLocalTrackStorage(state.playlist);
      state.playlist.forEach((t) => {
        if (t.source === "local" && isBlobUrl(t.url))
          URL.revokeObjectURL(t.url);
      });
      state.playlist = [];
      state.currentIndex = -1;
      clearPlaybackState();
      audio.pause();
      state.isPlaying = false;
      updatePlayBtn();
      updateVideoVisibility();
      renderPlaylist();
      els.statusText.textContent = t("status.idle");
      updateTopBadge(null, -1);
      updateNowPlayingCustom(t("common.unknown"), "--", "🎵", "0/0");
      updateMediaSessionMetadata();
      saveSettingsToStorage();
      showOverlay(t("overlay.playlistCleared"));
    }
  };

  // ファイル追加ボタン（nativeFileBtn）の統一処理
  const nativeFileBtn = document.getElementById("nativeFileBtn");
  if (nativeFileBtn) {
    nativeFileBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (isNativeCapacitor()) {
        // Native環境: ファイルを直接選択（複数選択可能）
        await openNativeFilePicker();
      } else {
        // ブラウザ環境: 標準のファイル選択
        const fileInput = document.getElementById("fileInput");
        if (fileInput) fileInput.click();
      }
    });
  }

  const deviceMusicBtn = document.getElementById("deviceMusicBtn");
  if (deviceMusicBtn) {
    deviceMusicBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await importDeviceMusic();
    });
  }

  els.fileInput.onchange = handleLocalFiles;
  els.closeVideoBtn.onclick = () => {
    state.settings.showVideo = false;
    updateVideoVisibility();
    applySettingsToUI();
  };
  els.toggleVideoModeBtn.onclick = () => {
    state.settings.videoMode =
      state.settings.videoMode === "window" ? "background" : "window";
    updateVideoVisibility();
    applySettingsToUI();
  };

  // Source Toggle
  els.sourceFileBtn.onclick = () => setInputSource("file");
  els.sourceMicBtn.onclick = () => setInputSource("mic");

  if (els.fullscreenBtn) {
    els.fullscreenBtn.onclick = toggleFullscreen;
  }

  // Mic Device Select
  els.micDeviceSelect.onchange = (e) => {
    state.micDeviceId = e.target.value;
    if (state.inputSource === "mic") startMic();
  };

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  setupSettingsInputs();
  initDraggableVideo();
  // プレイリストパネルはAndroid版では固定位置（ドラッグ無効）
  applySettingsToUI();
  updateShuffleRepeatUI();
  updateTopBadge(null, -1);
  updateNowPlayingCustom(
    t("nowPlaying.notPlaying"),
    "--",
    "🎵",
    `0/${state.playlist.length}`,
  );

  // Media Session API setup for Android notifications
  setupMediaSession();

  // Position update for Media Session
  audio.addEventListener("timeupdate", () => {
    if (state.isPlaying && "mediaSession" in navigator) {
      updateMediaSessionPlaybackState();
    }
  });

  // バックグラウンド/フォアグラウンド切り替え処理
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // バックグラウンド: 描画を停止して省電力化、音声は継続
      console.log("App moved to background - audio continues");
      savePlaybackState(true);
      applyKeepScreenOn();
      // 動画がある場合は一時停止（バックグラウンドではビデオデコードが重い）
      if (bgVideo.src && !bgVideo.paused) {
        bgVideo.pause();
        state._videoPausedInBackground = true;
      }
    } else {
      // フォアグラウンド復帰: 描画再開
      console.log("App returned to foreground");
      lastDrawTs = 0; // FPSタイマーリセット
      applyKeepScreenOn();
      // 動画を再開して音声と同期
      if (state._videoPausedInBackground && bgVideo.src) {
        bgVideo.currentTime =
          audio.currentTime +
          (typeof getVideoSyncOffset === "function" ? getVideoSyncOffset() : 0);
        bgVideo.playbackRate = audio.playbackRate || 1.0;
        if (state.isPlaying) bgVideo.play().catch(() => {});
        state._videoPausedInBackground = false;
      }
      // MediaSession状態を更新
      updateMediaSessionPlaybackState();
      updateMediaSessionMetadata();
    }
  });

  // Drag & Drop
  document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
    document.body.classList.add("drag-over");
  });
  document.body.addEventListener("dragleave", (e) => {
    e.preventDefault();
    document.body.classList.remove("drag-over");
  });
  document.body.addEventListener("drop", async (e) => {
    e.preventDefault();
    document.body.classList.remove("drag-over");
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFiles(files);
    }
  });

  if (els.storageRefreshBtn) els.storageRefreshBtn.onclick = renderStorageList;
  if (els.storageDeleteAllBtn)
    els.storageDeleteAllBtn.onclick = deleteAllLibraryEntries;

  // Auto-hide UI
  document.addEventListener("mousemove", resetUITimeout);
  document.addEventListener("mousedown", resetUITimeout);
  document.addEventListener("touchstart", resetUITimeout, { passive: true }); // passive維持
  // pointerdown も追加（現代的）
  document.addEventListener("pointerdown", resetUITimeout);

  document.addEventListener("keydown", (e) => {
    resetUITimeout();
    // 設定モーダルを開いている間はショートカットで設定を変更しない
    if (state.settingsOpen) return;
    const tag = e.target.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      e.target.isContentEditable
    )
      return;
    const keyId =
      e.key === "]" ? "BracketRight" : e.key === "[" ? "BracketLeft" : e.code;

    switch (keyId) {
      case "Space":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        prevTrack();
        break;
      case "ArrowRight":
        nextTrack();
        break;
      case "ArrowUp":
        e.preventDefault();
        els.volSlider.value = Math.min(1, +els.volSlider.value + 0.1);
        updateVolume();
        showOverlay("volumeUp", { value: Math.round(audio.volume * 100) });
        break;
      case "ArrowDown":
        e.preventDefault();
        els.volSlider.value = Math.max(0, +els.volSlider.value - 0.1);
        updateVolume();
        showOverlay("volumeDown", { value: Math.round(audio.volume * 100) });
        break;
      case "KeyH":
        e.preventDefault();
        toggleUI();
        break;
      case "KeyF":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "KeyV":
        state.settings.showVideo = !state.settings.showVideo;
        updateVideoVisibility();
        applySettingsToUI();
        showOverlay(state.settings.showVideo ? "videoOn" : "videoOff");
        break;
      case "KeyR":
        state.settings.rainbow = !state.settings.rainbow;
        applySettingsToUI();
        showOverlay(
          state.settings.rainbow
            ? t("overlay.rainbowOn")
            : t("overlay.rainbowOff"),
        );
        break;
      case "KeyX":
        state.settings.mirror = !state.settings.mirror;
        applySettingsToUI();
        showOverlay(
          state.settings.mirror
            ? t("overlay.mirrorOn")
            : t("overlay.mirrorOff"),
        );
        break;
      case "KeyS":
        toggleShuffle();
        applySettingsToUI();
        break;
      case "KeyP":
        toggleRepeat();
        applySettingsToUI();
        break;
      case "BracketLeft": {
        const rates = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
        const ci = rates.indexOf(audio.playbackRate);
        const ni = Math.max(0, ci - 1);
        audio.playbackRate = rates[ni];
        state.settings.playbackRate = rates[ni];
        if (bgVideo.src) bgVideo.playbackRate = rates[ni];
        syncVideoRateAfterChange();
        const sel = $("speedSelect");
        if (sel) sel.value = rates[ni];
        showOverlay("playbackSpeed: " + rates[ni]);
        break;
      }
      case "BracketRight": {
        const rates = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
        const ci = rates.indexOf(audio.playbackRate);
        const ni = Math.min(rates.length - 1, ci + 1);
        audio.playbackRate = rates[ni];
        state.settings.playbackRate = rates[ni];
        if (bgVideo.src) bgVideo.playbackRate = rates[ni];
        syncVideoRateAfterChange();
        const sel = $("speedSelect");
        if (sel) sel.value = rates[ni];
        showOverlay("playbackSpeed: " + rates[ni]);
        break;
      }
      case "KeyM":
        state.mode = (state.mode + 1) % 9;
        els.modeSelect.value = state.mode;
        invalidateRender(2);
        const modeName =
          els.modeSelect.options[els.modeSelect.selectedIndex].text;
        showOverlay(t("overlay.mode", { mode: modeName }));
        break;
    }
  });
  resetUITimeout();

  window.addEventListener("beforeunload", () => {
    savePlaybackState(true);
  });

  // 前回の曲・再生位置を復元（自動再生はしない）
  await restorePlaybackState();
  applyKeepScreenOn();

  // 再生中・マイク入力中のみ描画ループを回す（停止中は描かない）
  invalidateRender(3);
}

function resetUITimeout(e) {
  // autoHideUIが無効な場合は自動表示を行わない
  if (!state.settings.autoHideUI) {
    return;
  }

  // === 修正ポイント：トグルボタン自体へのタッチは自動表示/リセットをスキップ ===
  if (
    e &&
    e.target &&
    (e.target.closest("#toggleUIBtn") || e.target.id === "toggleUIBtn")
  ) {
    return; // ボタン操作は toggleUI() が直接処理する
  }

  // タップ操作やマウス移動でUIを表示
  if (!state.uiVisible) {
    toggleUI();
  }

  if (state.uiTimeout) clearTimeout(state.uiTimeout);

  // 設定画面やプレイリストが開いている間、またはマウスがUI上にある間は消さない
  const isOverUI =
    e &&
    (e.target.closest(".top-bar") ||
      e.target.closest(".controls-bar") ||
      e.target.closest(".settings-modal") ||
      e.target.closest(".playlist-container") ||
      e.target.closest("#persistentControls")); // persistentControlsも追加

  if (
    state.isPlaying &&
    !state.settingsOpen &&
    !state.playlistVisible &&
    !isOverUI
  ) {
    state.uiTimeout = setTimeout(() => {
      if (
        state.isPlaying &&
        !state.settingsOpen &&
        !state.playlistVisible &&
        state.uiVisible
      ) {
        toggleUI();
      }
    }, 5000);
  }
}

// Android版ではプレイリストパネルは固定位置
// initDraggablePlaylist は削除済み

function initDraggableVideo() {
  const container = els.videoContainer;
  const handle = container.querySelector(".video-handle");
  let isDragging = false;
  let startX, startY, initialX, initialY;
  let isFirstDrag = true; // 初回ドラッグフラグ

  // 保存された位置を復元
  if (restoreVideoWindowPos(container)) {
    isFirstDrag = false;
  }

  // Mouse events
  handle.onmousedown = (e) => {
    if (state.settings.videoMode === "background") return;
    e.preventDefault();

    // 初回ドラッグ時はハンドルの右上を基準にする
    if (isFirstDrag) {
      const rect = handle.getBoundingClientRect();
      const handleCenterX = rect.right; // 右端
      const handleCenterY = rect.top; // 上端
      const offsetX = e.clientX - handleCenterX;
      const offsetY = e.clientY - handleCenterY;

      // コンテナの位置を調整
      container.style.left = `${container.offsetLeft + offsetX}px`;
      container.style.top = `${container.offsetTop + offsetY}px`;
      container.style.transform = "none";

      isFirstDrag = false;
    }

    startDragging(e.clientX, e.clientY);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stopDragging);
  };

  // Touch events for mobile
  handle.addEventListener(
    "touchstart",
    (e) => {
      if (state.settings.videoMode === "background") return;
      e.preventDefault();
      const touch = e.touches[0];

      // 初回ドラッグ時はハンドルの右上を基準にする
      if (isFirstDrag) {
        const rect = handle.getBoundingClientRect();
        const handleCenterX = rect.right; // 右端
        const handleCenterY = rect.top; // 上端
        const offsetX = touch.clientX - handleCenterX;
        const offsetY = touch.clientY - handleCenterY;

        // コンテナの位置を調整
        container.style.left = `${container.offsetLeft + offsetX}px`;
        container.style.top = `${container.offsetTop + offsetY}px`;
        container.style.transform = "none";

        isFirstDrag = false;
      }

      startDragging(touch.clientX, touch.clientY);
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", stopDragging);
    },
    { passive: false },
  );

  function startDragging(clientX, clientY) {
    isDragging = true;
    container.classList.add("dragging");
    startX = clientX;
    startY = clientY;
    initialX = container.offsetLeft;
    initialY = container.offsetTop;
    container.style.transform = "none";
  }

  function constrainPosition(x, y) {
    const containerRect = container.getBoundingClientRect();
    const { width: vw, height: vh } = getViewportSize();
    const maxX = vw - containerRect.width;
    const maxY = vh - containerRect.height;

    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY)),
    };
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const { x, y } = constrainPosition(initialX + dx, initialY + dy);
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const { x, y } = constrainPosition(initialX + dx, initialY + dy);
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
  }

  function stopDragging() {
    if (!isDragging) return;
    isDragging = false;
    container.classList.remove("dragging");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("mouseup", stopDragging);
    document.removeEventListener("touchend", stopDragging);

    // 位置を保存（画面サイズに対する割合で保存）
    saveVideoWindowPos(container);
  }
}

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: vv?.width || window.innerWidth,
    height: vv?.height || window.innerHeight,
  };
}

function saveVideoWindowPos(container) {
  const { width: vw, height: vh } = getViewportSize();
  const rect = container.getBoundingClientRect();

  const maxLeft = Math.max(1, vw - rect.width);
  const maxTop = Math.max(1, vh - rect.height);

  const left = Math.max(0, Math.min(rect.left, maxLeft));
  const top = Math.max(0, Math.min(rect.top, maxTop));

  localStorage.setItem(
    "videoWindowPos",
    JSON.stringify({
      leftRatio: left / maxLeft,
      topRatio: top / maxTop,
    }),
  );
}

function restoreVideoWindowPos(container) {
  const savedPos = localStorage.getItem("videoWindowPos");
  if (!savedPos) return false;

  try {
    const pos = JSON.parse(savedPos);
    const { width: vw, height: vh } = getViewportSize();
    const rect = container.getBoundingClientRect();

    const maxLeft = Math.max(0, vw - rect.width);
    const maxTop = Math.max(0, vh - rect.height);

    const left = Math.max(
      0,
      Math.min(maxLeft, Math.round(maxLeft * (pos.leftRatio ?? 0.5))),
    );
    const top = Math.max(
      0,
      Math.min(maxTop, Math.round(maxTop * (pos.topRatio ?? 0.35))),
    );

    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    container.style.bottom = "";
    container.style.transform = "none";
    return true;
  } catch {
    return false;
  }
}

function clampVideoContainerToViewport(container) {
  if (!container || container.classList.contains("hidden")) return;

  const { width: vw, height: vh } = getViewportSize();
  const rect = container.getBoundingClientRect();

  const maxLeft = Math.max(0, vw - rect.width);
  const maxTop = Math.max(0, vh - rect.height);

  const left = Math.max(0, Math.min(rect.left, maxLeft));
  const top = Math.max(0, Math.min(rect.top, maxTop));

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;
}

function updateVideoVisibility() {
  const track = state.playlist[state.currentIndex];
  const isVideo = track && track.isVideo;
  const container = els.videoContainer;

  container.classList.toggle("hidden", !state.settings.showVideo || !isVideo);
  container.classList.toggle(
    "background-mode",
    state.settings.videoMode === "background",
  );

  // フィットモードクラスを適用
  container.classList.remove("fit-contain", "fit-fill");
  if (state.settings.videoMode === "background") {
    if (state.settings.videoFitMode === "contain") {
      container.classList.add("fit-contain");
    } else if (state.settings.videoFitMode === "fill") {
      container.classList.add("fit-fill");
    }
  }

  // モード切替時に残りやすいスタイルを整理
  if (state.settings.videoMode === "background") {
    container.style.top = "";
    container.style.left = "";
    container.style.bottom = "";
    container.style.transform = "none";
  } else {
    container.style.bottom = "";

    // 保存位置があればそれを優先
    if (restoreVideoWindowPos(container)) {
      // 何もしない
    } else {
      // 初回だけ中央下に配置
      container.style.top = "auto";
      container.style.bottom = "120px";
      container.style.left = "50%";
      container.style.transform = "translateX(-50%)";
    }
  }

  if (state.settings.videoMode === "window") {
    requestAnimationFrame(() => clampVideoContainerToViewport(container));
  }

  // 背景ぼかし（固定強度）
  applyBackgroundBlur(state.settings.bgBlur);

  if (isVideo && state.settings.showVideo) {
    if (bgVideo.src !== track.url) {
      bgVideo.src = track.url;
      bgVideo.playbackRate = audio.playbackRate || 1.0;

      const onLoaded = () => {
        bgVideo.currentTime = audio.currentTime + getVideoStartOffset();
        bgVideo.playbackRate = audio.playbackRate || 1.0;
        if (state.isPlaying) bgVideo.play().catch(() => {});
        bgVideo.removeEventListener("loadedmetadata", onLoaded);
      };
      bgVideo.addEventListener("loadedmetadata", onLoaded);
    } else {
      // When toggling visibility back on, resync immediately
      bgVideo.playbackRate = audio.playbackRate || 1.0;
      bgVideo.currentTime = audio.currentTime + getVideoSyncOffset();
      if (state.isPlaying) bgVideo.play().catch(() => {});
    }
  } else {
    bgVideo.pause();
    bgVideo.src = "";
  }
}

// ============== Render quality / scheduler state ==============
// 内部描画解像度の上限。バーや波形にネイティブ解像度は不要なため、
// DPR 2.5 の端末では内部バッファが約1/3になり、消費電力を大きく削減できる。
const MAX_RENDER_DPR = 2.5;
// 内部解像度に応じた固定ピクセル値の補正係数（2.5を従来の基準とする）。
// これにより解像度を下げてもバーの太さ・砂粒の大きさなどは見た目が変わらない。
let renderPixelScale = 1;
// 自動品質調整のスケール（0.6〜1.0）。重い端末では自動で解像度を落とす。
let renderQualityScale = 1;
// 明示的な再描画要求（設定変更・シークなど）の残りフレーム数
let renderPendingFrames = 0;
let renderRafId = null;
let renderLastQualityCheck = 0;
let renderEmaInterval = 0;
let renderSlowStreak = 0;
let renderLastSlowAt = 0;
// 実際に観測できた最短フレーム間隔（ディスプレイのリフレッシュ周期の推定値）
let renderMinInterval = 0;
let renderAdaptTargetFps = -1;

function applyCanvasResolution(force = false) {
  if (!cv) return;

  const deviceDpr = window.devicePixelRatio || 1;
  const requested = +state.settings.renderDpr;
  // 0（または未設定）はネイティブ解像度
  const cap = requested > 0 ? Math.min(requested, MAX_RENDER_DPR) : deviceDpr;
  const dpr = Math.max(0.5, Math.min(cap, deviceDpr) * renderQualityScale);
  // 旧実装（min(2.5, devicePixelRatio)）と同じ見た目になるよう補正する
  const referenceDpr = Math.min(MAX_RENDER_DPR, deviceDpr);
  renderPixelScale = Math.max(0.2, dpr / referenceDpr);

  let viewW = Math.floor(window.visualViewport?.width || window.innerWidth);
  let viewH = Math.floor(window.visualViewport?.height || window.innerHeight);

  const targetW = Math.max(1, Math.floor(viewW * dpr));
  const targetH = Math.max(1, Math.floor(viewH * dpr));

  cv.width = targetW;
  cv.height = targetH;
  cv.style.width = "100%";
  cv.style.height = "100%";
  cv.style.top = "0";
  cv.style.left = "0";
  cv.style.right = "0";
  cv.style.bottom = "0";
  cv.style.position = "absolute";

  W = targetW;
  H = targetH;

  const ctx = cv.getContext("2d", { alpha: true });
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, targetW, targetH);
  }

  console.log(`✅ Canvas: ${viewW}×${viewH} (internal: ${targetW}×${targetH})`);
}

function resize() {
  setAppHeight();

  // 初期化時・リサイズ時に複数回実行
  applyCanvasResolution();
  setTimeout(() => applyCanvasResolution(true), 150);
  invalidateRender(3);

  recenterFloatingUiAfterResize();

  requestAnimationFrame(() => {
    calculateUIHeights();
    if (state.mode === "monitor") drawMonitor();
  });
}

function updatePlaylistOffsets() {
  const topBar = document.querySelector(".top-bar");
  const controlsBar = document.querySelector(".controls-bar");
  if (!topBar || !controlsBar) return;

  const topPx = Math.ceil(topBar.getBoundingClientRect().bottom + 8);
  const controlsTop = controlsBar.getBoundingClientRect().top;
  const maxHeight = Math.max(0, Math.floor(controlsTop - topPx - 8));

  document.documentElement.style.setProperty("--playlist-top", `${topPx}px`);
  document.documentElement.style.setProperty(
    "--playlist-max-height",
    `${maxHeight}px`,
  );
}

function recenterFloatingUiAfterResize() {
  const cv = document.getElementById("cv");
  if (cv) {
    const ctx = cv.getContext("2d");
    if (ctx && typeof ctx.setTransform === "function") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  const videoContainer = document.querySelector(".video-container");
  if (videoContainer) {
    videoContainer.style.left = "50%";
    videoContainer.style.right = "auto";
    videoContainer.style.transform = "translateX(-50%) translateZ(0)";
  }

  const floatingPanels = document.querySelectorAll(
    ".playlist-panel, #persistentControls",
  );
  floatingPanels.forEach((el) => {
    el.style.left = "";
    el.style.right = "";
    el.style.transform = "";
  });
}

function calculateUIHeights() {
  const topBar = document.querySelector(".top-bar");
  const controlsBar = document.querySelector(".controls-bar");
  if (topBar) topBarH = topBar.getBoundingClientRect().height;
  if (controlsBar) bottomBarH = controlsBar.getBoundingClientRect().height;

  // Keep the playlist inside the space between the top bar and controls.
  updatePlaylistOffsets();
}

// ============== SETTINGS ==============
function applyUiScale(reflow = true) {
  const raw = Number(state.settings.uiScalePercent);
  const percent = Number.isFinite(raw)
    ? Math.min(130, Math.max(80, raw))
    : 100;
  document.documentElement.style.setProperty(
    "--ui-scale",
    String(percent / 100),
  );

  if (!reflow) return;
  requestAnimationFrame(() => {
    calculateUIHeights();
    resize();
  });
}

function loadSettings() {
  const saved = localStorage.getItem("audioVisualizerSettingsV7");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      Object.assign(state.settings, parsed);
      // 旧バージョンの描画モード設定を削除
      delete state.settings.renderMode;
      // グロー有効なのに強度0だと何も見えないため補正する
      if (state.settings.glowEnabled && !(state.settings.glowStrength > 0)) {
        state.settings.glowStrength = 20;
      }
    } catch (e) {
      console.warn("Settings load failed");
    }
  }
}

function saveSettingsToStorage() {
  try {
    if (state.settings.persistSettings) {
      localStorage.setItem(
        "audioVisualizerSettingsV7",
        JSON.stringify(state.settings),
      );
    }
    // プレイリスト情報（ローカルは参照キー(localRef)を保存、URLなし）
    const playlistData = state.playlist
      .map((track) => {
        // storeLocalFilesがOFFの場合：
        // - uri:形式は一時的な権限なので保存しない（再起動後アクセス不可）
        // - app:形式（コピー済み）とpath:形式（永続パス）のみ保存可能
        if (track.source === "local" && !state.settings.storeLocalFiles) {
          // app: / path: / media: は保存可能
          if (
            !track.localRef?.startsWith("app:") &&
            !track.localRef?.startsWith("path:") &&
            !track.localRef?.startsWith("media:")
          ) {
            return null;
          }
        }
        // storeLocalFilesがONの場合：idb:形式以外は保存しない（uri:は永続権限がない）
        if (track.source === "local" && state.settings.storeLocalFiles) {
          if (
            !track.localRef?.startsWith("idb:") &&
            !track.localRef?.startsWith("app:") &&
            !track.localRef?.startsWith("path:") &&
            !track.localRef?.startsWith("media:")
          ) {
            return null;
          }
        }
        return {
          name: track.name,
          source: track.source,
          isVideo: track.isVideo,
          localRef: track.localRef || null,
          meta: track.meta
            ? {
                title: track.meta.title || "",
                artist: track.meta.artist || "",
                album: track.meta.album || "",
                durationMs: track.meta.durationMs || 0,
              }
            : null,
        };
      })
      .filter(Boolean);
    localStorage.setItem(
      "audioVisualizerPlaylistV7",
      JSON.stringify(playlistData),
    );
    // 後方互換
    localStorage.setItem(
      "audioVisualizerPlaylist",
      JSON.stringify(playlistData),
    );
    return true;
  } catch (error) {
    console.error("Playlist settings save failed:", error);
    return false;
  }
}

function loadLibraryFromStorage() {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLibraryToStorage() {
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
}

function upsertLibraryEntry(entry) {
  if (!entry || !entry.ref) return;
  library[entry.ref] = {
    name: entry.name || entry.ref,
    type: entry.type || "idb",
    sizeBytes: entry.sizeBytes || 0,
    isVideo: !!entry.isVideo,
    createdAt: entry.createdAt || Date.now(),
  };
  saveLibraryToStorage();
  renderStorageList();
}

function removeLibraryEntries(refs) {
  let changed = false;
  refs.forEach((ref) => {
    if (library[ref]) {
      delete library[ref];
      changed = true;
    }
  });
  if (changed) {
    saveLibraryToStorage();
    renderStorageList();
  }
}

function rebuildLibraryFromPlaylist() {
  const refs = new Set();
  state.playlist.forEach((t) => {
    if (!t || !t.localRef) return;
    // MediaStore / file-picker URIs are references, not files stored by the app.
    if (t.localRef.startsWith("uri:") || t.localRef.startsWith("media:")) return;
    refs.add(t.localRef);
    if (!library[t.localRef]) {
      upsertLibraryEntry({
        ref: t.localRef,
        name: t.name,
        type: t.localRef.startsWith("app:")
          ? "app"
          : t.localRef.startsWith("path:")
            ? "path"
            : "idb",
        sizeBytes: t.size || 0,
        isVideo: !!t.isVideo,
      });
    }
  });
  // Remove stale entries not referenced anywhere
  const stale = Object.keys(library).filter((ref) => !refs.has(ref));
  if (stale.length) removeLibraryEntries(stale);
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)}${units[u]}`;
}

const QUALITY_PRESETS = {
  1024: { fftSize: 1024, barCount: 32 },
  2048: { fftSize: 2048, barCount: 64 },
  4096: { fftSize: 4096, barCount: 128 },
  8192: { fftSize: 8192, barCount: 256 },
  16384: { fftSize: 16384, barCount: 512 },
  32768: { fftSize: 32768, barCount: 1024 },
};

function applyQualityPreset(nextFft) {
  const preset = QUALITY_PRESETS[nextFft] || QUALITY_PRESETS[2048];
  state.settings.fftSize = preset.fftSize;
  state.settings.barCount = preset.barCount;
  if (state.analyser) {
    state.analyser.fftSize = state.settings.fftSize;
    state.bufLen = state.analyser.frequencyBinCount;
    state.freqData = new Uint8Array(state.bufLen);
    state.timeData = new Uint8Array(state.bufLen);
  }
  if (els.barCountSelect) els.barCountSelect.value = state.settings.barCount;
}

async function openNativeFilePicker() {
  // Requires: capacitor.js loaded + FilePicker plugin installed
  if (!isNativeCapacitor()) {
    els.fileInput?.click();
    return;
  }

  const filePicker = getRegisteredNativePlugin("FilePicker");

  if (!filePicker || typeof filePicker.pickFiles !== "function") {
    alert(t("alert.filePickerMissing"));
    return;
  }

  try {
    const result = await filePicker.pickFiles({
      multiple: true,
      readData: false,
    });
    const files = Array.isArray(result?.files) ? result.files : [];
    if (files.length === 0) return;

    const accepted = [];
    const allowedExt = new Set([
      "mp3",
      "wav",
      "m4a",
      "aac",
      "mp4",
      "webm",
      "mkv",
      "mov",
      "ogg",
      "flac",
      "opus",
    ]);
    const videoExt = new Set(["mp4", "webm", "mkv", "mov"]);

    for (const f of files) {
      const name = (f?.name || "").toLowerCase();
      const ext = name.includes(".") ? name.split(".").pop() : "";
      const isVideo = videoExt.has(ext);
      if (!name) continue;
      if (allowedExt.has(ext)) {
        const uri = f?.path || f?.uri || "";
        if (!uri) continue;
        accepted.push({ name: f.name, uri, isVideo });
      }
    }

    if (accepted.length === 0) {
      showOverlay(t("overlay.noFileSelected"));
      return;
    }

    // パス記憶機能: 最後に選択したファイルのディレクトリを保存
    if (accepted.length > 0) {
      const lastUri = accepted[0].uri;
      // URIからディレクトリパスを抽出
      const lastPath = lastUri.includes("/")
        ? lastUri.substring(0, lastUri.lastIndexOf("/"))
        : lastUri;
      state.settings.lastSelectedPath = lastPath;
      console.log("Last selected path saved:", lastPath);
    }

    showOverlay(t("overlay.importingFiles", { count: accepted.length }));

    for (const item of accepted) {
      state.playlist.push({
        name: item.name,
        url: undefined, // URLは再生時に生成
        source: "local",
        isVideo: item.isVideo,
        localRef: `uri:${item.uri}`,
        addedOrder: state.addedOrderCounter++,
      });
    }

    renderPlaylist();
    if (state.currentIndex === -1)
      playTrack(state.playlist.length - accepted.length);
    saveSettingsToStorage();
    setTimeout(
      () => showOverlay(t("overlay.filesAdded", { count: accepted.length })),
      500,
    );
    els.statusText.textContent = state.playlist[state.currentIndex]
      ? `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${state.playlist[state.currentIndex].name}`
      : t("status.idle");
    updateNextUpText(state.currentIndex);
  } catch (error) {
    console.error("FilePicker failed:", error);
    showOverlay(t("overlay.fileSelectFailed"));
  }
}

async function openNativeFolderImport() {
  if (isClearingLibrary) return;
  const request = folderImportQueue.then(() => performNativeFolderImport());
  folderImportQueue = request.catch(() => {});
  return request;
}

/**
 * Imports a selected Android folder while preserving unacknowledged results.
 */
async function performNativeFolderImport() {
  if (!isNativeCapacitor()) {
    showOverlay(t("overlay.androidOnly"));
    return;
  }

  const folderImport = getRegisteredNativePlugin("LocalFolderImport");
  if (!folderImport || typeof folderImport.pickAudioFolder !== "function") {
    // Fallback to file picker if plugin not available
    console.warn(
      "フォルダ一括追加プラグインが見つかりません。ファイルピッカーを使用します。",
    );
    await openNativeFilePicker();
    return;
  }

  try {
    if (typeof folderImport.getPendingImport === "function") {
      const pending = await folderImport.getPendingImport();
      if (pending?.importId) {
        console.warn("A folder import result is still pending.");
        showOverlay(t("overlay.fileSelectFailed"));
        return;
      }
    }

    showOverlay(t("overlay.selectFolder"));
    const result = await folderImport.pickAudioFolder({});
    const files = Array.isArray(result?.files) ? result.files : [];
    if (files.length === 0) {
      showOverlay(t("overlay.folderNoFiles"));
      return;
    }

    // パス記憶機能: フォルダパスを保存
    if (result?.folderPath) {
      state.settings.lastSelectedPath = result.folderPath;
      console.log("Last selected folder path saved:", result.folderPath);
    } else if (files.length > 0 && files[0]?.path) {
      // フォルダパスがない場合、最初のファイルからディレクトリを抽出
      const firstPath = files[0].path;
      const folderPath = firstPath.includes("/")
        ? firstPath.substring(0, firstPath.lastIndexOf("/"))
        : firstPath;
      state.settings.lastSelectedPath = folderPath;
      console.log("Last selected folder path (from file) saved:", folderPath);
    }

    showOverlay(t("overlay.importingFiles", { count: files.length }));

    addImportedFolderFiles(files);

    renderPlaylist();
    if (state.currentIndex === -1) {
      const firstAddedIndex = Math.max(0, state.playlist.length - files.length);
      playTrack(firstAddedIndex);
    }
    if (!saveSettingsToStorage()) {
      showOverlay(t("overlay.fileSelectFailed"));
      return;
    }
    await folderImport.acknowledgePendingImport({ importId: result.importId });
    setTimeout(
      () => showOverlay(t("overlay.filesAdded", { count: files.length })),
      500,
    );
    els.statusText.textContent = state.playlist[state.currentIndex]
      ? `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${state.playlist[state.currentIndex].name}`
      : t("status.idle");
    updateNextUpText(state.currentIndex);
  } catch (error) {
    console.error("Folder import failed:", error);
    // Fallback to file picker
    console.log(
      "フォルダプラグインエラーのため、ファイルピッカーにフォールバック",
    );
    await openNativeFilePicker();
  }
}

function addImportedFolderFiles(files) {
  for (const f of files) {
    const name = typeof f?.name === "string" ? f.name : "";
    const path = typeof f?.path === "string" ? f.path : "";
    if (!name || !path) continue;
    const localRef = `app:${path}`;
    if (state.playlist.some((track) => track?.localRef === localRef)) continue;
    const isVideo = !!f?.isVideo;
    state.playlist.push({
      name,
      url: undefined,
      source: "local",
      isVideo,
      localRef,
      size: f?.size || 0,
      addedOrder: state.addedOrderCounter++,
    });
    if (state.settings.storeLocalFiles) {
      upsertLibraryEntry({
        ref: localRef,
        type: "app",
        name,
        sizeBytes: f?.size || 0,
        isVideo,
      });
    }
  }
}

/**
 * Restores a folder import persisted by the native plugin after recreation.
 */
async function restorePendingFolderImport() {
  const folderImport = getRegisteredNativePlugin("LocalFolderImport");
  if (!folderImport || typeof folderImport.getPendingImport !== "function")
    return;
  const result = await folderImport.getPendingImport();
  const files = Array.isArray(result?.files) ? result.files : [];
  if (files.length === 0 || !result?.importId) return;

  addImportedFolderFiles(files);
  renderPlaylist();
  if (!saveSettingsToStorage()) {
    throw new Error("Failed to persist restored folder import");
  }
  await folderImport.acknowledgePendingImport({ importId: result.importId });
  renderStorageList();
}

// ============== PLAYLIST PERSISTENCE (LocalStorage + IndexedDB) ==============
const PLAYLIST_STORAGE_KEY = "audioVisualizerPlaylistV7";
const LOCAL_FILE_DB_NAME = "audioVisualizerLocalFiles";
const LOCAL_FILE_STORE = "files";

function isBlobUrl(url) {
  return typeof url === "string" && url.startsWith("blob:");
}

function generateLocalId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Path to file:// URL conversion cache
const pathToFileUrlCache = new Map();

function fileUrlFromPath(filePath) {
  if (!filePath || typeof filePath !== "string") return "";
  // キャッシュを確認
  if (pathToFileUrlCache.has(filePath)) {
    return pathToFileUrlCache.get(filePath);
  }
  let normalized = filePath.replace(/\\/g, "/");
  if (!normalized.startsWith("/")) normalized = "/" + normalized;
  const url = encodeURI("file://" + normalized);
  pathToFileUrlCache.set(filePath, url);
  return url;
}

function openLocalFileDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB is not available"));
      return;
    }
    const req = indexedDB.open(LOCAL_FILE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOCAL_FILE_STORE)) {
        db.createObjectStore(LOCAL_FILE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutLocalFile(file) {
  const db = await openLocalFileDb();
  const id = generateLocalId();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_FILE_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(LOCAL_FILE_STORE).put({ id, file });
  });
  db.close();
  return id;
}

async function idbGetLocalFile(id) {
  const db = await openLocalFileDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_FILE_STORE, "readonly");
    tx.onerror = () => reject(tx.error);
    const req = tx.objectStore(LOCAL_FILE_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return record ? record.file : null;
}

async function idbDeleteLocalFile(id) {
  const db = await openLocalFileDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_FILE_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(LOCAL_FILE_STORE).delete(id);
  });
  db.close();
}

async function deleteAllLocalTrackStorage(tracks) {
  const deletions = tracks
    .filter(
      (t) =>
        t &&
        t.source === "local" &&
        typeof t.localRef === "string" &&
        t.localRef.startsWith("idb:"),
    )
    .map((t) => t.localRef.slice("idb:".length));
  for (const id of deletions) {
    try {
      await idbDeleteLocalFile(id);
    } catch {
      // ignore
    }
  }

  const appPaths = tracks
    .filter(
      (t) =>
        t &&
        t.source === "local" &&
        typeof t.localRef === "string" &&
        t.localRef.startsWith("app:"),
    )
    .map((t) => t.localRef.slice("app:".length))
    .filter(Boolean);

  if (appPaths.length > 0 && isNativeCapacitor()) {
    try {
      const folderImport = getRegisteredNativePlugin("LocalFolderImport");
      if (
        folderImport &&
        typeof folderImport.deleteImportedFiles === "function"
      ) {
        await folderImport.deleteImportedFiles({ paths: appPaths });
      }
    } catch {
      // ignore
    }
  }

  // Remove from library index
  const refs = tracks.map((t) => t.localRef).filter(Boolean);
  removeLibraryEntries(refs);
}

async function loadPlaylistFromStorage() {
  const saved =
    localStorage.getItem(PLAYLIST_STORAGE_KEY) ||
    localStorage.getItem("audioVisualizerPlaylist");
  if (!saved) return;

  let playlistData;
  try {
    playlistData = JSON.parse(saved);
  } catch {
    return;
  }
  if (!Array.isArray(playlistData)) return;

  const restored = [];
  for (const item of playlistData) {
    if (!item || typeof item !== "object") continue;
    const name = typeof item.name === "string" ? item.name : "Unknown";
    const source = item.source;
    const isVideo = !!item.isVideo;

    if (source === "local") {
      const localRef = typeof item.localRef === "string" ? item.localRef : null;
      const legacyPath = typeof item.path === "string" ? item.path : null;
      const meta = item.meta && typeof item.meta === "object" ? item.meta : null;

      if (localRef && localRef.startsWith("media:")) {
        const uri = localRef.slice("media:".length);
        if (!uri) continue;
        restored.push({
          name,
          url: toCapacitorFileUrl(uri),
          source: "local",
          isVideo,
          localRef,
          meta,
        });
        continue;
      }

      if (localRef && localRef.startsWith("uri:")) {
        const uri = localRef.slice("uri:".length);
        if (!uri) continue;
        restored.push({
          name,
          url: toCapacitorFileUrl(uri),
          source: "local",
          isVideo,
          localRef,
          meta,
        });
        continue;
      }

      if (localRef && localRef.startsWith("app:")) {
        const p = localRef.slice("app:".length);
        if (!p) continue;
        restored.push({
          name,
          url: toCapacitorFileUrl(p),
          source: "local",
          isVideo,
          localRef,
          meta,
        });
        continue;
      }

      if (localRef && localRef.startsWith("path:")) {
        const p = localRef.slice("path:".length);
        const url = fileUrlFromPath(p);
        if (!url) continue;
        restored.push({ name, url, source: "local", isVideo, localRef, meta });
        continue;
      }
      if (legacyPath) {
        const url = fileUrlFromPath(legacyPath);
        if (!url) continue;
        restored.push({
          name,
          url,
          source: "local",
          isVideo,
          localRef: `path:${legacyPath}`,
          meta,
        });
        continue;
      }
      if (localRef && localRef.startsWith("idb:")) {
        // Do not create blob URL here; lazy on demand
        restored.push({
          name,
          url: undefined,
          source: "local",
          isVideo,
          localRef,
          meta,
        });
      }
      continue;
    }

    // drive entries removed; skip
  }

  state.playlist = restored;
  if (state.currentIndex >= state.playlist.length) state.currentIndex = -1;
  renderPlaylist();
  if (state.playlist.length > 0) {
    els.statusText.textContent = t("playlist.restored");
  }
}

function hasIdbLocalTracksInPlaylist() {
  return state.playlist.some(
    (t) =>
      t &&
      t.source === "local" &&
      typeof t.localRef === "string" &&
      t.localRef.startsWith("idb:"),
  );
}

async function purgeIdbLocalTracksFromPlaylist() {
  const targets = state.playlist
    .map((t, idx) => ({ t, idx }))
    .filter(
      ({ t }) =>
        t &&
        t.source === "local" &&
        typeof t.localRef === "string" &&
        t.localRef.startsWith("idb:"),
    );
  if (targets.length === 0) return;

  try {
    await deleteAllLocalTrackStorage(targets.map((x) => x.t));
  } catch {
    // ignore
  }

  for (const { t } of targets) {
    if (t && isBlobUrl(t.url)) {
      try {
        URL.revokeObjectURL(t.url);
      } catch {}
    }
  }

  const removedIndices = new Set(targets.map((x) => x.idx));
  const removedBeforeCurrent = [...removedIndices].filter(
    (i) => i < state.currentIndex,
  ).length;
  const wasPlayingRemoved = removedIndices.has(state.currentIndex);

  state.playlist = state.playlist.filter((_, idx) => !removedIndices.has(idx));

  if (wasPlayingRemoved) {
    audio.pause();
    state.isPlaying = false;
    updatePlayBtn();
    state.currentIndex = -1;
    clearPlaybackState();
    updateMediaSessionMetadata();
    els.statusText.textContent = t("status.idle");
  } else if (state.currentIndex >= 0) {
    state.currentIndex = Math.max(
      -1,
      state.currentIndex - removedBeforeCurrent,
    );
  }

  renderPlaylist();
  updateVideoVisibility();
  saveSettingsToStorage();
}

// ============== Settings draft ==============
// 設定モーダル内の変更は下書きに保持し、「保存して閉じる」まで適用しない。
// モーダルが閉じているときは従来どおり state.settings を直接変更する。
let settingsDraft = null;
// 開いた時点の下書き内容（未保存変更の判定用）
let settingsDraftBaseline = null;

function editableSettings() {
  return settingsDraft || state.settings;
}

function setSetting(key, value) {
  editableSettings()[key] = value;
}

function setupSettingsInputs() {
  const smoothingSlider = $("smoothingSlider");
  if (smoothingSlider) {
    smoothingSlider.oninput = (e) => {
      setSetting("smoothing", +e.target.value);
      $("smoothingValue").textContent = editableSettings().smoothing.toFixed(2);
    };
  }
  const uiScaleSlider = $("uiScaleSlider");
  if (uiScaleSlider) {
    uiScaleSlider.oninput = (e) => {
      const percent = Math.min(130, Math.max(80, +e.target.value || 100));
      setSetting("uiScalePercent", percent);
      const valueEl = $("uiScaleValue");
      if (valueEl) valueEl.textContent = `${percent}%`;
    };
  }
  const resetUiScaleBtn = $("resetUiScaleBtn");
  if (resetUiScaleBtn) {
    resetUiScaleBtn.onclick = () => {
      setSetting("uiScalePercent", 100);
      if (uiScaleSlider) uiScaleSlider.value = "100";
      const valueEl = $("uiScaleValue");
      if (valueEl) valueEl.textContent = "100%";
    };
  }
  const sensitivitySlider = $("sensitivitySlider");
  if (sensitivitySlider) {
    sensitivitySlider.oninput = (e) => {
      setSetting("sensitivity", +e.target.value);
      $("sensitivityValue").textContent =
        editableSettings().sensitivity.toFixed(1);
    };
  }
  const fftSizeSelect = $("fftSizeSelect");
  if (fftSizeSelect) {
    fftSizeSelect.onchange = (e) => {
      setSetting("fftSize", +e.target.value);
    };
  }
  const qualitySelect = $("qualitySelect");
  if (qualitySelect) {
    qualitySelect.onchange = (e) => {
      setSetting("quality", e.target.value);
    };
  }
  const barCountSelect = $("barCountSelect");
  if (barCountSelect) {
    barCountSelect.onchange = (e) => {
      setSetting("barCount", +e.target.value);
    };
  }
  const audioSourceSelect = $("audioSourceSelect");
  if (audioSourceSelect) {
    audioSourceSelect.onchange = (e) => {
      setSetting("audioSource", e.target.value);
    };
  }
  const micDeviceSelect = $("micDeviceSelect");
  if (micDeviceSelect) {
    micDeviceSelect.onchange = (e) => {
      setSetting("micDeviceId", e.target.value);
    };
  }
  const inputGainSlider = $("inputGainSlider");
  if (inputGainSlider) {
    inputGainSlider.oninput = (e) => {
      setSetting("inputGain", +e.target.value);
      $("inputGainValue").textContent = editableSettings().inputGain.toFixed(1);
    };
  }
  const freqRangeSelect = $("freqRangeSelect");
  if (freqRangeSelect) {
    freqRangeSelect.onchange = (e) => {
      const presetKey = e.target.value;
      if (presetKey === "custom") return;
      const preset = FREQ_RANGE_PRESETS[presetKey];
      if (!preset) return;
      const s = editableSettings();
      s.lowFreq = preset.low;
      s.highFreq = preset.high;
      $("lowFreqSlider").value = preset.low;
      $("lowFreqValue").textContent = preset.low + "Hz";
      $("highFreqSlider").value = preset.high;
      $("highFreqValue").textContent =
        preset.high >= 1000 ? preset.high / 1000 + "kHz" : preset.high + "Hz";
    };
  }
  const lowFreqSlider = $("lowFreqSlider");
  if (lowFreqSlider) {
    lowFreqSlider.oninput = (e) => {
      setSetting("lowFreq", +e.target.value);
      $("lowFreqValue").textContent = editableSettings().lowFreq + "Hz";
      if (freqRangeSelect) freqRangeSelect.value = "custom";
    };
  }
  const highFreqSlider = $("highFreqSlider");
  if (highFreqSlider) {
    highFreqSlider.oninput = (e) => {
      setSetting("highFreq", +e.target.value);
      const high = editableSettings().highFreq;
      $("highFreqValue").textContent =
        high >= 1000 ? high / 1000 + "kHz" : high + "Hz";
      if (freqRangeSelect) freqRangeSelect.value = "custom";
    };
  }
  EQ_FREQS.forEach((freq, i) => {
    const id = freq >= 1000 ? `eq${freq / 1000}k` : `eq${freq}`;
    const el = $(id);
    if (el)
      el.oninput = (e) => {
        editableSettings().eq[i] = +e.target.value;
      };
  });
  const resetEqBtn = $("resetEqBtn");
  if (resetEqBtn) {
    resetEqBtn.onclick = resetEQ;
  }

  // EQプリセットボタン
  const EQ_PRESETS = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0],
    rock: [5, 4, -2, -3, 2, 5, 7, 6],
    pop: [-1, 2, 5, 4, 1, -1, -2, -1],
    jazz: [3, 2, -2, -1, 2, 4, 5, 3],
    classical: [4, 3, -1, 1, -1, 2, 3, 4],
    bass: [8, 6, 4, 1, 0, 0, 0, 0],
    vocal: [-2, -1, 3, 5, 4, 2, 0, -1],
    electronic: [5, 4, 1, -2, 0, 3, 5, 7],
  };
  document.querySelectorAll(".eq-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      const values = EQ_PRESETS[preset];
      if (!values) return;
      editableSettings().eq = [...values];
      // スライダー表示のみ更新（音声への適用は保存時）
      values.forEach((value, i) => {
        const freq = EQ_FREQS[i];
        const id = freq >= 1000 ? `eq${freq / 1000}k` : `eq${freq}`;
        const el = $(id);
        if (el) el.value = value;
      });
      showOverlay(t("overlay.eq", { name: btn.textContent }));
    });
  });

  // FPSセレクター
  const fpsSelect = $("fpsSelect");
  if (fpsSelect) {
    fpsSelect.onchange = (e) => {
      const fps = +e.target.value;
      setSetting("targetFps", fps);
      setSetting("lowPowerMode", fps <= 30);
    };
  }
  const glowSlider = $("glowSlider");
  if (glowSlider) {
    glowSlider.oninput = (e) => {
      setSetting("glowStrength", +e.target.value);
      $("glowValue").textContent = formatGlowStrength(
        editableSettings().glowStrength,
      );
    };
  }
  const glowEnabledCheckbox = $("glowEnabledCheckbox");
  if (glowEnabledCheckbox) {
    glowEnabledCheckbox.onchange = (e) => {
      const enabled = !!e.target.checked;
      setSetting("glowEnabled", enabled);
      // 強度0のまま有効化すると何も見えないため、既定値を入れる
      if (enabled && !(editableSettings().glowStrength > 0)) {
        setSetting("glowStrength", 20);
        const slider = $("glowSlider");
        if (slider) slider.value = "20";
        const valueEl = $("glowValue");
        if (valueEl) valueEl.textContent = formatGlowStrength(20);
      }
    };
  }
  const rainbowCheckbox = $("rainbowCheckbox");
  if (rainbowCheckbox) {
    rainbowCheckbox.onchange = (e) => {
      setSetting("rainbow", e.target.checked);
    };
  }
  const mirrorCheckbox = $("mirrorCheckbox");
  if (mirrorCheckbox) {
    mirrorCheckbox.onchange = (e) => {
      setSetting("mirror", e.target.checked);
    };
  }
  const bgBlurSlider = $("bgBlurSlider");
  if (bgBlurSlider) {
    bgBlurSlider.oninput = (e) => {
      setSetting("bgBlur", +e.target.value);
      $("bgBlurValue").textContent = editableSettings().bgBlur + "px";
    };
  }
  const blurEnabledCheckbox = $("blurEnabledCheckbox");
  if (blurEnabledCheckbox) {
    blurEnabledCheckbox.onchange = (e) => {
      setSetting("blurEnabled", e.target.checked);
    };
  }
  const opacitySlider = $("opacitySlider");
  if (opacitySlider) {
    opacitySlider.oninput = (e) => {
      setSetting("opacity", +e.target.value);
      $("opacityValue").textContent = editableSettings().opacity.toFixed(1);
    };
  }
  const balanceSlider = $("balanceSlider");
  if (balanceSlider) {
    balanceSlider.oninput = (e) => {
      setSetting("balance", +e.target.value);
      const label = $("balanceValue");
      if (label)
        label.textContent = formatBalanceValue(editableSettings().balance);
    };
  }
  const resetBalanceBtn = $("resetBalanceBtn");
  if (resetBalanceBtn) {
    resetBalanceBtn.onclick = () => {
      setSetting("balance", 0);
      if (balanceSlider) balanceSlider.value = 0;
      const label = $("balanceValue");
      if (label) label.textContent = "C";
      showOverlay(t("overlay.centerReset"));
    };
  }
  const fixedColorPicker = $("fixedColorPicker");
  if (fixedColorPicker) {
    fixedColorPicker.oninput = (e) => {
      setSetting("fixedColor", e.target.value);
    };
  }
  const changeModeSelect = $("changeModeSelect");
  if (changeModeSelect) {
    changeModeSelect.onchange = (e) => {
      setSetting("changeMode", e.target.value);
    };
  }
  const sandModeCheckbox = $("sandModeCheckbox");
  if (sandModeCheckbox) {
    sandModeCheckbox.onchange = (e) => {
      setSetting("sandMode", e.target.checked);
    };
  }
  const sandFallRateSlider = $("sandFallRateSlider");
  if (sandFallRateSlider) {
    sandFallRateSlider.oninput = (e) => {
      setSetting("sandFallRate", +e.target.value);
      $("sandFallRateValue").textContent =
        editableSettings().sandFallRate.toFixed(1);
    };
  }
  const circleAngleOffsetSlider = $("circleAngleOffsetSlider");
  if (circleAngleOffsetSlider) {
    circleAngleOffsetSlider.oninput = (e) => {
      setSetting("circleAngleOffset", +e.target.value);
      $("circleAngleOffsetValue").textContent =
        `${editableSettings().circleAngleOffset}°`;
    };
  }
  const resetCircleAngleBtn = $("resetCircleAngleBtn");
  if (resetCircleAngleBtn) {
    resetCircleAngleBtn.onclick = () => {
      setSetting("circleAngleOffset", 0);
      const slider = $("circleAngleOffsetSlider");
      const valEl = $("circleAngleOffsetValue");
      if (slider) slider.value = 0;
      if (valEl) valEl.textContent = "0°";
    };
  }
  const persistSettingsCheckbox = $("persistSettingsCheckbox");
  if (persistSettingsCheckbox) {
    persistSettingsCheckbox.onchange = (e) => {
      setSetting("persistSettings", e.target.checked);
    };
  }
  const storeLocalFilesCheckbox = $("storeLocalFilesCheckbox");
  if (storeLocalFilesCheckbox) {
    storeLocalFilesCheckbox.onchange = async (e) => {
      const nextValue = !!e.target.checked;
      const prevValue = !!state.settings.storeLocalFiles;
      state.settings.storeLocalFiles = nextValue;

      if (prevValue && !nextValue && hasIdbLocalTracksInPlaylist()) {
        const ok = confirm(t("confirm.switchUriMode"));
        if (ok) {
          await purgeIdbLocalTracksFromPlaylist();
        } else {
          // 取り消し: 設定を元に戻す
          state.settings.storeLocalFiles = true;
          e.target.checked = true;
          showOverlay(t("overlay.localSaveOn"));
          return;
        }
      }

      showOverlay(
        state.settings.storeLocalFiles
          ? t("overlay.localSaveOn")
          : t("overlay.localSaveOff"),
      );
      // 保存ポリシーの変更はデータ操作を伴うため即時反映し、下書きにも同期する
      if (settingsDraft)
        settingsDraft.storeLocalFiles = state.settings.storeLocalFiles;
      renderStorageList();
    };
  }

  $("autoPlayNextCheckbox").onchange = (e) => {
    setSetting("autoPlayNext", e.target.checked);
  };
  const resumePlaybackCheckbox = $("resumePlaybackCheckbox");
  if (resumePlaybackCheckbox) {
    resumePlaybackCheckbox.onchange = (e) => {
      setSetting("resumePlayback", e.target.checked);
    };
  }
  const keepScreenOnCheckbox = $("keepScreenOnCheckbox");
  if (keepScreenOnCheckbox) {
    keepScreenOnCheckbox.onchange = (e) => {
      setSetting("keepScreenOn", e.target.checked);
    };
  }
  $("stopOnVideoEndCheckbox").onchange = (e) => {
    setSetting("stopOnVideoEnd", e.target.checked);
  };

  // Auto-hide UI settings
  const autoHideUICheckbox = $("autoHideUICheckbox");
  if (autoHideUICheckbox) {
    autoHideUICheckbox.onchange = (e) => {
      setSetting("autoHideUI", e.target.checked);
    };
  }

  const videoDisplayModeSelect = $("videoDisplayModeSelect");
  if (videoDisplayModeSelect) {
    videoDisplayModeSelect.onchange = (e) => {
      const mode = e.target.value;
      if (mode === "audio") {
        setSetting("showVideo", false);
      } else {
        setSetting("showVideo", true);
        setSetting(
          "videoMode",
          mode === "background" ? "background" : "window",
        );
      }
    };
  }
  const videoFitModeSelect = $("videoFitModeSelect");
  if (videoFitModeSelect) {
    videoFitModeSelect.onchange = (e) => {
      setSetting("videoFitMode", e.target.value);
    };
  }

  // 内部解像度（描画負荷）
  const renderScaleSelect = $("renderScaleSelect");
  if (renderScaleSelect) {
    renderScaleSelect.onchange = (e) => {
      setSetting("renderDpr", +e.target.value);
    };
  }

  // persistSettingsCheckboxは既に上で処理済みなので重複を避ける

  // Speed select
  const speedSelect = $("speedSelect");
  if (speedSelect) {
    speedSelect.onchange = (e) => {
      setSetting("playbackRate", +e.target.value);
    };
  }

  // Sleep timer buttons
  document.querySelectorAll(".sleep-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const min = +btn.dataset.minutes;
      document
        .querySelectorAll(".sleep-btn")
        .forEach((b) => b.classList.remove("active"));
      if (min === 0) {
        stopSleepTimer();
        showOverlay(t("overlay.sleepOff"));
      } else {
        startSleepTimer(min);
        btn.classList.add("active");
      }
    });
  });

  // fullscreen toggle button
  const showFullscreenCheckbox = $("showFullscreenBtnCheckbox");
  if (showFullscreenCheckbox) {
    showFullscreenCheckbox.onchange = (e) => {
      setSetting("showFullscreenButton", e.target.checked);
    };
  }

  const showLabelsCheckbox = $("showLabelsCheckbox");
  if (showLabelsCheckbox) {
    showLabelsCheckbox.onchange = (e) => {
      setSetting("showLabels", e.target.checked);
    };
  }

  setupPresets();
}

function setupPresets() {
  const list = $("colorPresetList");
  if (!list) return;

  COLOR_PRESETS.forEach((p) => {
    const btn = document.createElement("div");
    btn.className = "color-preset-btn";
    btn.style.backgroundColor = p.color;
    btn.textContent = p.name;
    btn.onclick = () => {
      const s = editableSettings();
      s.fixedColor = p.color;
      s.rainbow = false;
      applySettingsToUI(s);
      showOverlay(t("overlay.colorApplied", { name: p.name }));
    };
    list.appendChild(btn);
  });

  [1, 2, 3].forEach((slot) => {
    $(`savePreset${slot}`).onclick = () => savePreset(slot);
    $(`loadPreset${slot}`).onclick = () => loadPreset(slot);
  });
}

function savePreset(slot) {
  // 編集中なら下書きの内容を保存する
  const presetData = JSON.stringify(editableSettings());
  localStorage.setItem(`visualizerPreset_${slot}`, presetData);
  showOverlay(t("overlay.presetSaved", { slot }));
}

function loadPreset(slot) {
  const saved = localStorage.getItem(`visualizerPreset_${slot}`);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const target = editableSettings();
      Object.assign(target, parsed);
      delete target.renderMode;
      applySettingsToUI(target);
      if (!settingsDraft) {
        applyRuntimeSettings();
      }
      showOverlay(t("overlay.presetLoaded", { slot }));
    } catch (e) {
      showOverlay(t("overlay.loadFailed"));
    }
  } else {
    showOverlay(t("overlay.presetEmpty", { slot }));
  }
}

function applySettingsToUI(source) {
  const s = source || state.settings;
  const isLive = !source || source === state.settings;

  if (!QUALITY_PRESETS[s.fftSize]) s.fftSize = 8192; // デフォルトに戻す
  s.barCount = Math.max(16, Math.min(1024, s.barCount || 64));

  $("smoothingSlider").value = s.smoothing;
  $("smoothingValue").textContent = s.smoothing.toFixed(2);
  const uiScaleSlider = $("uiScaleSlider");
  if (uiScaleSlider) {
    const percent = Math.min(130, Math.max(80, Number(s.uiScalePercent) || 100));
    uiScaleSlider.value = String(percent);
    const valueEl = $("uiScaleValue");
    if (valueEl) valueEl.textContent = `${percent}%`;
  }
  $("sensitivitySlider").value = s.sensitivity;
  $("sensitivityValue").textContent = s.sensitivity.toFixed(1);
  $("qualitySelect").value = s.fftSize;
  $("barCountSelect").value = s.barCount;
  $("showLabelsCheckbox").checked = s.showLabels;
  const fpsSelectUI = $("fpsSelect");
  if (fpsSelectUI) {
    // 0（無制限）を 60 に丸めない
    fpsSelectUI.value = String(s.targetFps === 0 ? 0 : s.targetFps || 60);
  }
  const renderScaleSelect = $("renderScaleSelect");
  if (renderScaleSelect) renderScaleSelect.value = String(s.renderDpr ?? 1.5);
  const videoDisplayModeSelect = $("videoDisplayModeSelect");
  if (videoDisplayModeSelect) {
    videoDisplayModeSelect.value = !s.showVideo
      ? "audio"
      : s.videoMode === "background"
        ? "background"
        : "window";
  }
  $("videoFitModeSelect").value = s.videoFitMode || "cover";
  $("lowFreqSlider").value = s.lowFreq;
  $("lowFreqValue").textContent = s.lowFreq + "Hz";
  $("highFreqSlider").value = s.highFreq;
  $("highFreqValue").textContent =
    s.highFreq >= 1000 ? s.highFreq / 1000 + "kHz" : s.highFreq + "Hz";
  const freqRangeSelectUI = $("freqRangeSelect");
  if (freqRangeSelectUI) {
    let matched = "custom";
    Object.keys(FREQ_RANGE_PRESETS).forEach((key) => {
      const preset = FREQ_RANGE_PRESETS[key];
      if (preset.low === s.lowFreq && preset.high === s.highFreq) {
        matched = key;
      }
    });
    freqRangeSelectUI.value = matched;
  }
  $("glowSlider").value = s.glowStrength;
  $("glowValue").textContent = formatGlowStrength(s.glowStrength);
  $("glowEnabledCheckbox").checked = !!s.glowEnabled;
  $("rainbowCheckbox").checked = s.rainbow;
  $("mirrorCheckbox").checked = s.mirror;
  $("bgBlurSlider").value = s.bgBlur;
  $("blurEnabledCheckbox").checked = !!s.blurEnabled;
  $("bgBlurValue").textContent = s.bgBlur + "px";
  $("opacitySlider").value = s.opacity;
  $("opacityValue").textContent = s.opacity.toFixed(1);
  const balanceSlider = $("balanceSlider");
  if (balanceSlider) balanceSlider.value = s.balance || 0;
  const balanceValue = $("balanceValue");
  if (balanceValue)
    balanceValue.textContent = formatBalanceValue(s.balance || 0);
  $("fixedColorPicker").value = s.fixedColor;
  $("changeModeSelect").value = s.changeMode || "off";
  $("sandModeCheckbox").checked = !!s.sandMode;
  $("sandFallRateSlider").value = s.sandFallRate;
  $("sandFallRateValue").textContent = (s.sandFallRate || 0.6).toFixed(1);
  $("circleAngleOffsetSlider").value = s.circleAngleOffset || 0;
  $("circleAngleOffsetValue").textContent = `${s.circleAngleOffset || 0}°`;
  $("persistSettingsCheckbox").checked = s.persistSettings;
  const storeLocalFilesCheckbox = $("storeLocalFilesCheckbox");
  if (storeLocalFilesCheckbox)
    storeLocalFilesCheckbox.checked = !!s.storeLocalFiles;

  $("autoPlayNextCheckbox").checked = s.autoPlayNext;
  const resumePlaybackCheckbox = $("resumePlaybackCheckbox");
  if (resumePlaybackCheckbox)
    resumePlaybackCheckbox.checked = s.resumePlayback !== false;
  const keepScreenOnCheckbox = $("keepScreenOnCheckbox");
  if (keepScreenOnCheckbox)
    keepScreenOnCheckbox.checked = s.keepScreenOn !== false;
  $("stopOnVideoEndCheckbox").checked = s.stopOnVideoEnd;
  $("autoHideUICheckbox").checked = s.autoHideUI !== false;
  $("showFullscreenBtnCheckbox").checked = !!s.showFullscreenButton;

  const inputGainSlider = $("inputGainSlider");
  if (inputGainSlider) {
    inputGainSlider.value = s.inputGain;
    $("inputGainValue").textContent = (+s.inputGain).toFixed(1);
  }

  (s.eq || []).forEach((val, i) => {
    const freq = EQ_FREQS[i];
    const id = freq >= 1000 ? `eq${freq / 1000}k` : `eq${freq}`;
    const el = $(id);
    if (el) el.value = val;
  });

  const speedSel = $("speedSelect");
  if (speedSel) speedSel.value = s.playbackRate || 1;

  if (!isLive) return;

  applyBalanceToPan();

  // Volume restore
  if (s.volume !== undefined) {
    els.volSlider.value = s.volume;
    updateVolume();
  }
  // Speed restore
  if (s.playbackRate) {
    audio.playbackRate = s.playbackRate;
  }

  // 全画面ボタンの表示制御
  if (els.fullscreenBtn) {
    els.fullscreenBtn.style.display = s.showFullscreenButton ? "flex" : "none";
  }
}

// 下書きを state.settings に反映したあと、音声・動画・描画へ一括適用する
function applyRuntimeSettings() {
  if (state.analyser) {
    state.analyser.smoothingTimeConstant = state.settings.smoothing;
    if (state.analyser.fftSize !== state.settings.fftSize) {
      state.analyser.fftSize = state.settings.fftSize;
      state.bufLen = state.analyser.frequencyBinCount;
      state.freqData = new Uint8Array(state.bufLen);
      state.timeData = new Uint8Array(state.bufLen);
    }
    applySensitivityToAnalyser();
  }

  (state.settings.eq || []).forEach((val, i) => {
    if (state.eqFilters[i]) state.eqFilters[i].gain.value = val;
  });

  applyBalanceToPan();

  if (state.settings.playbackRate) {
    audio.playbackRate = state.settings.playbackRate;
    if (bgVideo.src) bgVideo.playbackRate = state.settings.playbackRate;
    syncVideoRateAfterChange();
  }

  updateVideoVisibility();

  if (state.settings.autoHideUI === false && state.uiTimeout) {
    clearTimeout(state.uiTimeout);
    state.uiTimeout = null;
  }

  updateNumBars();
  applyCanvasResolution();
  if (!state.settings.resumePlayback) clearPlaybackState();
  applyKeepScreenOn();
  applyUiScale();
  invalidateRender(3);
}

function openSettings() {
  // 変更は下書きに保持し、「保存して閉じる」まで適用しない
  settingsDraft = JSON.parse(JSON.stringify(state.settings));
  applySettingsToUI(settingsDraft);
  settingsDraftBaseline = JSON.stringify(settingsDraft);

  // 開くたびに各タブのスクロール位置を先頭へ戻す
  els.settingsModal.querySelectorAll(".tab-content").forEach((content) => {
    content.scrollTop = 0;
  });

  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.value = settingsDraft.language || currentLang;
  }

  els.settingsModal.classList.add("open");
  state.settingsOpen = true;
  requestAnimationFrame(scrollActiveSettingsTabIntoView);

  // 設定タブ中はUI非表示ボタンを隠す
  const persistentControls = document.getElementById("persistentControls");
  if (persistentControls) persistentControls.style.display = "none";
}
function closeSettings() {
  if (settingsDraft) {
    // 未保存の変更がある場合は破棄してよいか確認する
    const changed =
      settingsDraftBaseline &&
      JSON.stringify(settingsDraft) !== settingsDraftBaseline;
    if (changed) {
      const ok = confirm(t("confirm.discardSettings"));
      if (!ok) return;
    }
    // 保存せずに閉じた場合は下書きを破棄して表示を元に戻す
    settingsDraft = null;
    settingsDraftBaseline = null;
    applySettingsToUI();
  }
  els.settingsModal.classList.remove("open");
  state.settingsOpen = false;
  // 設定タブを閉じたらUI非表示ボタンを復元
  const persistentControls = document.getElementById("persistentControls");
  if (persistentControls) persistentControls.style.display = "";
}

/**
 * Androidの戻るボタン用。開いているUIを閉じた場合に true を返す。
 */
function handleAndroidBack() {
  if (state.settingsOpen) {
    closeSettings();
    return true;
  }
  if (state.playlistVisible) {
    togglePlaylist();
    return true;
  }
  return false;
}
window.handleAndroidBack = handleAndroidBack;

/**
 * Persists settings and closes the settings dialog only after success.
 */
function saveSettings() {
  const draft = settingsDraft || JSON.parse(JSON.stringify(state.settings));
  const langSelect = document.getElementById("langSelect");
  if (langSelect) draft.language = langSelect.value;

  const prevMicDeviceId = state.settings.micDeviceId;
  settingsDraft = null;
  settingsDraftBaseline = null;
  Object.assign(state.settings, draft);

  currentLang = state.settings.language || currentLang;
  localStorage.setItem("app_lang", currentLang);

  applyRuntimeSettings();
  applySettingsToUI();
  if (state.settings.micDeviceId !== prevMicDeviceId) {
    updateMicrophoneInput();
  }

  updateLanguageUI(); // 保存時にも確実に反映
  loadDeveloperMessage();
  if (!saveSettingsToStorage()) {
    // 保存に失敗した場合は編集を続けられるよう下書きを復元する
    settingsDraft = JSON.parse(JSON.stringify(state.settings));
    applySettingsToUI(settingsDraft);
    showOverlay(t("overlay.fileSelectFailed"));
    return false;
  }
  closeSettings();
  showOverlay(t("overlay.settingsSaved"));
  return true;
}

function scrollActiveSettingsTabIntoView() {
  const tabs = els.settingsModal?.querySelector(".tabs");
  const active = els.settingsModal?.querySelector(".tab-btn.active");
  if (!tabs || !active) return;
  const left = active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2;
  tabs.scrollLeft = Math.max(0, left);
}

function switchTab(tabId) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));
  document
    .querySelector(`.tab-btn[data-tab="${tabId}"]`)
    .classList.add("active");
  $(`tab-${tabId}`).classList.add("active");
  scrollActiveSettingsTabIntoView();

  // 音声タブが開かれた時のみデバイスを列挙（権限エラー対策）
  if (tabId === "audio") {
    enumerateMicDevices();
  } else if (tabId === "storage") {
    renderStorageList();
  } else if (tabId === "developer") {
    loadOpenSourceLicenses();
  }
}

async function loadDeveloperMessage() {
  try {
    const lang = currentLang || "ja-JP";

    const response = await fetch(`./DevMessages/DEVELOPER_MESSAGE_${lang}.md`);

    if (!response.ok) {
      throw new Error(`Failed to load DEVELOPER_MESSAGE_${lang}.md`);
    }

    const markdown = await response.text();
    const html = simpleMarkdownToHtml(markdown);

    const contentEl = document.getElementById("developerMessageContent");

    if (contentEl) {
      contentEl.innerHTML = html;
    }
  } catch (error) {
    console.warn("Failed to load developer message:", error);

    const contentEl = document.getElementById("developerMessageContent");

    if (contentEl) {
      contentEl.textContent = t("devMessage.loadFailed");
    }
  }
}

let openSourceLicensesLoaded = false;

async function loadOpenSourceLicenses() {
  if (openSourceLicensesLoaded) return;

  const contentEl = document.getElementById("openSourceLicenseContent");
  if (!contentEl) return;

  try {
    const licensePaths = [
      "./licenses/LICENSE.txt",
      "./licenses/THIRD_PARTY_LICENSES.txt",
    ];
    const responses = await Promise.all(
      licensePaths.map(async (path) => {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`Failed to load license document: ${path}`);
        }
        return response.text();
      }),
    );

    contentEl.textContent = responses.join(
      "\n\n========================================\n\n",
    );
    openSourceLicensesLoaded = true;
  } catch (error) {
    console.error("Failed to load third-party licenses:", error);
    contentEl.textContent = t("licenses.loadFailed");
  }
}

// 簡易Markdown→HTML変換（隙間問題解消版）
function simpleMarkdownToHtml(markdown) {
  // 前後の不要な空白を削除
  let html = markdown.trim();

  // 1. コードブロック（```）を保護
  const codeBlocks = [];
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    codeBlocks.push(code.trim());
    return `\n\n%%%CODE_BLOCK_${codeBlocks.length - 1}%%%\n\n`;
  });

  // 2. ブロック要素（見出し・水平線）の変換
  // ※ 記述を「margin: 上 右 下 左;」の形式に統一
  html = html.replace(
    /^### (.+)$/gm,
    '\n\n<h4 style="margin: 12px 0 6px 0; color: var(--accent-color);">$1</h4>\n\n',
  );
  html = html.replace(
    /^## (.+)$/gm,
    '\n\n<h3 style="margin: 14px 0 6px 0; color: var(--accent-color);">$1</h3>\n\n',
  );
  html = html.replace(
    /^# (.+)$/gm,
    '\n\n<h2 style="margin: 14px 0 6px 0; color: var(--accent-color);">$1</h2>\n\n',
  );
  html = html.replace(
    /^---$/gm,
    '\n\n<hr style="margin: 12px 0; border: none; border-top: 1px solid var(--glass-border);">\n\n',
  );

  // 3. リスト要素の変換
  html = html.replace(
    /^- (.+)$/gm,
    '<li style="margin-left: 18px; margin-bottom: 2px;">$1</li>',
  );
  // 連続する <li> を <ul> で囲む（隙間対策として内部の改行コードも一撃で消去）
  html = html.replace(/(?:<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
    const cleanedLi = match.replace(/\n/g, "");
    return `\n\n<ul style="margin: 4px 0; padding-left: 18px;">${cleanedLi}</ul>\n\n`;
  });

  // 4. インライン装飾（太字、斜体、リンク）
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\(([^\)]+)\)/g,
    '<a href="$2" target="_blank" style="color: var(--accent-color); text-decoration: underline;">$1</a>',
  );

  // 5. 段落（ブロック）処理と「無駄な改行コード」の徹底排除
  const blocks = html.split(/\n{2,}/);
  html = blocks
    .map((block) => block.trim())
    .filter((block) => block !== "") // 空っぽのブロック（不要な空行）を完全に仕分けして消す
    .map((block) => {
      // すでにHTMLブロック要素、またはコードブロックのプレースホルダーの場合はスルー
      if (
        /^<(h2|h3|h4|ul|ol|hr)/i.test(block) ||
        block.startsWith("%%%CODE_BLOCK_")
      ) {
        return block;
      }
      // 普通のテキストだけを <p> で囲み、段落内の改行は <br> に
      return `<p style="margin: 0 0 6px 0;">${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join(""); // ★最重要：改行（\n）を挟まずにピッタリ結合！

  // 6. コードブロックを復元
  codeBlocks.forEach((code, i) => {
    // pre タグのブラウザデフォルトマージンを「margin: 6px 0;」で上書きリセット
    html = html.replace(
      `%%%CODE_BLOCK_${i}%%%`,
      `<pre style="margin: 6px 0; background: rgba(0,0,0,0.3); padding: 6px; border-radius: 3px; overflow-x: auto;"><code style="white-space: pre;">${code}</code></pre>`,
    );
  });

  return html;
}

// ============== AUDIO ENGINE ==============
function initAudioContext() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = state.settings.fftSize;
    state.analyser.smoothingTimeConstant = state.settings.smoothing;
    applySensitivityToAnalyser();
    state.gainNode = state.audioCtx.createGain();
    state.gainNode.gain.value = 1.0;
    state.eqFilters = EQ_FREQS.map((freq, i) => {
      const filter = state.audioCtx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = state.settings.eq[i];
      return filter;
    });
    let lastNode = state.eqFilters[0];
    for (let i = 1; i < state.eqFilters.length; i++) {
      state.eqFilters[i - 1].connect(state.eqFilters[i]);
      lastNode = state.eqFilters[i];
    }
    lastNode.connect(state.analyser);
    state.analyser.connect(state.gainNode);
    setupBalanceNodes();
    state.bufLen = state.analyser.frequencyBinCount;
    state.freqData = new Uint8Array(state.bufLen);
    state.timeData = new Uint8Array(state.bufLen);
  }
  if (state.audioCtx.state === "suspended") state.audioCtx.resume();
}

function applySensitivityToAnalyser() {
  if (!state.analyser) return;
  const sens = Math.max(0.1, Math.min(3.0, state.settings.sensitivity || 1));
  const maxDb = -2 - ((sens - 0.1) / 2.9) * 30; // -2dB 〜 -32dB
  const minDb = Math.max(-140, maxDb - 80);
  state.analyser.maxDecibels = maxDb;
  state.analyser.minDecibels = minDb;
}

function applyBalanceToPan() {
  const v = Math.max(-100, Math.min(100, state.settings.balance || 0));
  const p = v / 100;
  if (state.balanceNodes) {
    const monoMix = Math.abs(p);
    const stereoMix = 1 - monoMix;
    state.balanceNodes.stereoLeftGain.gain.value = stereoMix;
    state.balanceNodes.stereoRightGain.gain.value = stereoMix;
    state.balanceNodes.monoLeftGain.gain.value = monoMix * (1 - Math.max(0, p));
    state.balanceNodes.monoRightGain.gain.value =
      monoMix * (1 + Math.min(0, p));
    return;
  }
  if (state.panNode) state.panNode.pan.value = p;
}

function formatBalanceValue(v) {
  if (!v) return "C";
  return v < 0 ? `L${Math.abs(v)}` : `R${v}`;
}

function formatGlowStrength(v) {
  if (v > 30) return t("val.strong");
  if (v > 10) return t("val.medium");
  return t("val.weak");
}

function setupBalanceNodes() {
  if (!state.audioCtx || !state.gainNode) return;
  try {
    const splitter = state.audioCtx.createChannelSplitter(2);
    const merger = state.audioCtx.createChannelMerger(2);
    const monoGain = state.audioCtx.createGain();
    monoGain.gain.value = 0.5;
    const monoLeftGain = state.audioCtx.createGain();
    const monoRightGain = state.audioCtx.createGain();
    const stereoLeftGain = state.audioCtx.createGain();
    const stereoRightGain = state.audioCtx.createGain();

    state.balanceNodes = {
      splitter,
      merger,
      monoGain,
      monoLeftGain,
      monoRightGain,
      stereoLeftGain,
      stereoRightGain,
    };

    state.gainNode.connect(splitter);
    splitter.connect(stereoLeftGain, 0);
    splitter.connect(stereoRightGain, 1);
    stereoLeftGain.connect(merger, 0, 0);
    stereoRightGain.connect(merger, 0, 1);
    splitter.connect(monoGain, 0);
    splitter.connect(monoGain, 1);
    monoGain.connect(monoLeftGain);
    monoGain.connect(monoRightGain);
    monoLeftGain.connect(merger, 0, 0);
    monoRightGain.connect(merger, 0, 1);
    merger.connect(state.audioCtx.destination);

    applyBalanceToPan();
    return;
  } catch (e) {
    console.warn("Balance node init failed:", e);
    state.balanceNodes = null;
  }

  if (state.audioCtx.createStereoPanner) {
    state.panNode = state.audioCtx.createStereoPanner();
    state.gainNode.connect(state.panNode);
    state.panNode.connect(state.audioCtx.destination);
    applyBalanceToPan();
  } else {
    state.gainNode.connect(state.audioCtx.destination);
  }
}

async function setInputSource(source) {
  state.inputSource = source;

  // Update UI
  els.sourceFileBtn.classList.toggle("active", source === "file");
  els.sourceMicBtn.classList.toggle("active", source === "mic");

  els.progressContainer.classList.toggle("hidden", source === "mic");
  els.playbackControls.classList.toggle("hidden", source === "mic");

  if (source === "mic") {
    audio.pause();
    clearPlayTimeout();
    await startMic();
    els.statusText.textContent = t("status.mic");
    updateTopBadge(null, -1);
    applyKeepScreenOn();
    updateNowPlayingCustom(
      t("nowPlaying.micInput"),
      t("nowPlaying.liveInput"),
      "🎤",
      "LIVE",
    );
  } else {
    stopMic();
    connectFileSource();
    applyKeepScreenOn();
    els.statusText.textContent = state.playlist[state.currentIndex]
      ? `🎵 ${state.playlist[state.currentIndex].name}`
      : t("status.idle");
    updateTopBadge(state.playlist[state.currentIndex], state.currentIndex);
    if (state.playlist[state.currentIndex]) {
      updateNowPlayingUI(
        state.playlist[state.currentIndex],
        state.currentIndex,
      );
    } else {
      updateNowPlayingCustom(
        t("nowPlaying.notPlaying"),
        "--",
        "🎵",
        `0/${state.playlist.length}`,
      );
    }
  }
  updatePlaylistOffsets();
}

async function startMic() {
  initAudioContext();

  // AudioContext復帰（Android 14で頻発）
  if (state.audioCtx.state === "suspended") {
    try {
      await state.audioCtx.resume();
    } catch (e) {
      console.warn(e);
    }
  }

  stopMic(); // クリーンアップ

  try {
    // Android 14+ 対策：事前デバイス列挙で権限プロンプトを誘導
    await navigator.mediaDevices.enumerateDevices().catch(() => {});

    const constraints = {
      audio: state.micDeviceId
        ? { deviceId: { exact: state.micDeviceId } }
        : {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 44100, // 安定性向上
            channelCount: 1, // モノラルでシンプルに
          },
    };

    console.log("[Mic] Requesting with constraints:", constraints);

    state.micStream = await navigator.mediaDevices.getUserMedia(constraints);

    if (!state.micStream?.getAudioTracks().length) {
      throw new Error("No audio track received");
    }

    state.micSource = state.audioCtx.createMediaStreamSource(state.micStream);

    // ファイルソースを切断
    if (state.fileSource)
      try {
        state.fileSource.disconnect();
      } catch (e) {}

    state.micSource.connect(state.eqFilters[0]);
    if (state.gainNode) state.gainNode.gain.value = 0; // フィードバック防止

    // 最終確認
    if (state.audioCtx.state !== "running") {
      await state.audioCtx.resume();
    }

    console.log("[Mic] Success - Context state:", state.audioCtx.state);
    showOverlay(t("overlay.micStarted"));
    renderEmaInterval = 0;
    invalidateRender(3);
  } catch (e) {
    console.error("[Mic] Failed:", e);
    let msg = t("mic.accessFailed");

    if (
      e.name === "NotAllowedError" ||
      e.name === "SecurityError" ||
      String(e).includes("denied")
    ) {
      msg = t("mic.permissionDenied");
    } else if (e.name === "NotFoundError") {
      msg = t("mic.deviceNotFound");
    }

    showOverlay(msg);
    alert(msg);
    setInputSource("file"); // 安全にフォールバック
  }
}

function stopMic() {
  if (state.micStream) {
    state.micStream.getTracks().forEach((t) => t.stop());
    state.micStream = null;
  }
  if (state.micSource) {
    try {
      state.micSource.disconnect();
    } catch (e) {}
    state.micSource = null;
  }
  // マイク停止後は数フレーム描いて描画ループを止める
  invalidateRender(2);
}

function connectFileSource() {
  initAudioContext();
  if (!state.fileSource) {
    state.fileSource = state.audioCtx.createMediaElementSource(audio);
  }
  // Always ensure it's connected to the EQ chain
  try {
    state.fileSource.connect(state.eqFilters[0]);
  } catch (e) {
    // Already connected or other error
  }
  state.gainNode.gain.value = els.volSlider.value;
}

async function enumerateMicDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");
    const fragment = document.createDocumentFragment();
    mics.forEach((m) => {
      const option = document.createElement("option");
      option.value = m.deviceId;
      option.textContent = m.label || `マイク ${m.deviceId.slice(0, 5)}`;
      fragment.appendChild(option);
    });
    els.micDeviceSelect.replaceChildren(fragment);
  } catch (e) {
    console.warn("Device enumeration failed", e);
  }
}

async function updateMicrophoneInput() {
  state.micDeviceId = state.settings.micDeviceId || "";
  if (els.micDeviceSelect && state.micDeviceId) {
    els.micDeviceSelect.value = state.micDeviceId;
  }
  if (state.inputSource === "mic") {
    await startMic();
  }
}

function updateEQ(index, gain) {
  if (state.eqFilters[index]) state.eqFilters[index].gain.value = gain;
}
function resetEQ() {
  editableSettings().eq = [0, 0, 0, 0, 0, 0, 0, 0];
  // 保存前（下書き中）は音声へ適用せず、保存時にまとめて反映する
  if (!settingsDraft) {
    state.eqFilters.forEach((f) => {
      f.gain.value = 0;
    });
  }
  EQ_FREQS.forEach((freq, i) => {
    const id = freq >= 1000 ? `eq${freq / 1000}k` : `eq${freq}`;
    const el = $(id);
    if (el) el.value = 0;
  });
}

function syncVideoRateAfterChange() {
  state.lastAudioTime = audio.currentTime;
  if (typeof videoSyncCooldown !== "undefined") videoSyncCooldown = 0.6;
  if (typeof lastVideoSyncCheckTs !== "undefined") {
    lastVideoSyncCheckTs =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
  }
}

// ============== PLAYBACK ==============
let isToggling = false; // 連打防止フラグ

function savePlaybackState(force = false) {
  if (!state.settings.resumePlayback) return;
  const track = state.playlist[state.currentIndex];
  if (!track) {
    clearPlaybackState();
    return;
  }

  const now = Date.now();
  if (!force && now - lastPlaybackStateSaveAt < 5000) return;
  lastPlaybackStateSaveAt = now;

  try {
    localStorage.setItem(
      PLAYBACK_STATE_STORAGE_KEY,
      JSON.stringify({
        localRef: track.localRef || null,
        name: track.name || "",
        position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        updatedAt: now,
      }),
    );
  } catch {
    // ignore
  }
}

function clearPlaybackState() {
  lastPlaybackStateSaveAt = 0;
  try {
    localStorage.removeItem(PLAYBACK_STATE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function restorePlaybackState() {
  if (!state.settings.resumePlayback || state.playlist.length === 0) return;

  let saved = null;
  try {
    saved = JSON.parse(
      localStorage.getItem(PLAYBACK_STATE_STORAGE_KEY) || "null",
    );
  } catch {
    return;
  }
  if (!saved || typeof saved !== "object") return;

  let index = -1;
  if (saved.localRef) {
    index = state.playlist.findIndex((track) => track.localRef === saved.localRef);
  }
  if (index < 0 && saved.name) {
    index = state.playlist.findIndex((track) => track.name === saved.name);
  }
  if (index < 0) return;

  const track = state.playlist[index];
  state.currentIndex = index;
  state.isPlaying = false;
  updatePlayBtn();
  updateTopBadge(track, index);
  updateNowPlayingUI(track, index);
  renderPlaylist();
  ensureTrackMetadata(track);

  try {
    const url = await ensureUrlForTrack(track);
    state.isRestoringPlayback = true;
    audio.src = url;
    audio.load();
    connectFileSource();
    updateVideoVisibility();

    const applyPosition = () => {
      state.isRestoringPlayback = false;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const maxPosition = duration > 0 ? Math.max(0, duration - 0.5) : 0;
      const position = Math.max(
        0,
        Math.min(Number(saved.position) || 0, maxPosition),
      );
      if (position > 0) {
        audio.currentTime = position;
      }
      updateTimeDisplay();
      if (els.seekBar) els.seekBar.value = audio.currentTime;
      audio.removeEventListener("loadedmetadata", applyPosition);
    };

    if (audio.readyState >= 1) {
      applyPosition();
    } else {
      audio.addEventListener("loadedmetadata", applyPosition);
    }

    els.statusText.textContent = `🎵 [${index + 1}/${state.playlist.length}] ${track.name}`;
    updateMediaSessionMetadata();
    showOverlay(
      t("overlay.resumeReady", { title: getTrackDisplayInfo(track).title }),
      2500,
    );
  } catch (e) {
    state.isRestoringPlayback = false;
    console.warn("Failed to restore playback position:", e);
  }
}

function togglePlay() {
  if (state.inputSource === "mic") return;
  if (state.playlist.length === 0) return;
  if (state.currentIndex === -1) {
    playTrack(0);
    return;
  }
  if (isToggling) return; // 連打防止

  isToggling = true;
  initAudioContext();

  if (state.isPlaying) {
    clearPlayTimeout();
    audio.pause();
    state.isPlaying = false;
    updatePlayBtn();
  } else {
    audio
      .play()
      .then(() => {
        state.isPlaying = true;
        updatePlayBtn();
      })
      .catch((e) => {
        console.error("Play failed:", e);
        state.isPlaying = false;
        updatePlayBtn();
      });
  }

  // 連打防止解除（300ms後）
  setTimeout(() => {
    isToggling = false;
  }, 300);
}

function toggleShuffle() {
  state.settings.shuffle = !state.settings.shuffle;
  updateShuffleRepeatUI();
  showOverlay(state.settings.shuffle ? "shuffleOn" : "shuffleOff");
}

function toggleRepeat() {
  const modes = ["none", "one", "all"];
  const idx = modes.indexOf(state.settings.repeatMode);
  state.settings.repeatMode = modes[(idx + 1) % modes.length];
  updateShuffleRepeatUI();
  function getRepeatLabels() {
    return {
      none: t("repeat.none"),
      one: t("repeat.one"),
      all: t("repeat.all"),
    };
  }
  showOverlay(getRepeatLabels()[state.settings.repeatMode]);
}

function updateShuffleRepeatUI() {
  els.shuffleBtn.classList.toggle("active", state.settings.shuffle);
  const repeatIcons = { none: "🔁", one: "🔂", all: "🔁" };
  els.repeatBtn.textContent = repeatIcons[state.settings.repeatMode];
  els.repeatBtn.classList.toggle(
    "active",
    state.settings.repeatMode !== "none",
  );
}

function nextTrack() {
  if (state.playlist.length === 0) return;
  if (state.settings.repeatMode === "one") {
    playTrack(state.currentIndex);
    return;
  }
  if (state.settings.shuffle) {
    let nextIdx;
    do {
      nextIdx = Math.floor(Math.random() * state.playlist.length);
    } while (nextIdx === state.currentIndex && state.playlist.length > 1);
    playTrack(nextIdx);
  } else {
    const nextIdx = (state.currentIndex + 1) % state.playlist.length;
    if (nextIdx === 0 && state.settings.repeatMode === "none") {
      audio.pause();
      state.isPlaying = false;
      updatePlayBtn();
    } else {
      playTrack(nextIdx);
    }
  }
}

function prevTrack() {
  if (state.playlist.length === 0) return;
  const prevIdx =
    state.currentIndex <= 0
      ? state.playlist.length - 1
      : state.currentIndex - 1;
  playTrack(prevIdx);
}

function playTrack(index) {
  if (index < 0 || index >= state.playlist.length) return;
  clearPlayTimeout();
  state.currentIndex = index;
  const track = state.playlist[index];
  console.log("[STATUS] playTrack", track.name);
  ensureTrackMetadata(track);
  els.statusText.textContent = `🎵 [${index + 1}/${state.playlist.length}] ${track.name}`;
  updateTopBadge(track, index);
  updateNowPlayingUI(track, index);
  renderPlaylist();

  // 再生中の曲をオーバーレイで表示
  showOverlay(t("overlay.nowPlaying", { title: track.name }), 3000);

  if (state.playTimeout) clearTimeout(state.playTimeout);

  const requestId = ++state.playRequestId;
  audio.pause();
  audio.currentTime = 0;
  savePlaybackState(true);
  (async () => {
    try {
      const url = await ensureUrlForTrack(track);
      if (requestId !== state.playRequestId) return; // outdated
      audio.src = url;
      audio.load();
      connectFileSource();
      updateVideoVisibility();
      state.playTimeout = setTimeout(() => {
        audio.play().catch((e) => {
          console.warn("Playback failed:", e);
          showOverlay(t("overlay.playFailed"));
          // 失敗した場合は次の曲へ（無限ループ防止のため少し待つ）
          setTimeout(nextTrack, 2000);
        });
        state.playTimeout = null;
      }, 100);
      // Prefetch next track URL asynchronously
      const nextIdx = (index + 1) % state.playlist.length;
      if (state.settings.autoPlayNext && nextIdx !== index) {
        const nextTrack = state.playlist[nextIdx];
        ensureUrlForTrack(nextTrack).catch(() => {});
      }
      // Enforce LRU size after changes
      blobCache.enforceLimit([audio.src, bgVideo.src]);
    } catch (e) {
      console.warn("ensureUrlForTrack failed", e);
      showOverlay(t("overlay.urlPrepareFailed"));
      setTimeout(nextTrack, 2000);
    }
  })();
}

function seek() {
  if (state.inputSource === "file") audio.currentTime = els.seekBar.value;
}
function updateVolume() {
  const v = els.volSlider.value;
  // 対数スケールに近い感覚にするため、2乗を使用
  const volume = v * v;
  audio.volume = volume;
  if (state.inputSource === "file" && state.gainNode)
    state.gainNode.gain.value = volume;
  els.volIcon.textContent = v == 0 ? "🔇" : v < 0.5 ? "🔉" : "🔊";
  state.settings.volume = +v;
}
function onMetadataLoaded() {
  els.seekBar.max = audio.duration || 0;
  updateTimeDisplay();
}
function updateProgress() {
  if (!isNaN(audio.currentTime)) {
    updateTimeDisplay();
    els.seekBar.value = audio.currentTime;
  }
}
function updateTimeDisplay() {
  els.timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  updateSeekVisuals();
}
function updatePlayBtn() {
  els.playBtn.textContent = state.isPlaying ? "⏸" : "▶";
}
function handleAudioError(e) {
  console.error("Audio error:", e);
  els.statusText.textContent = t("status.playError");
  showOverlay(t("overlay.audioError"));
  if (state.isRestoringPlayback) {
    // 起動時の復元に失敗した場合は、勝手に次の曲へ進まない
    state.isRestoringPlayback = false;
    return;
  }
  // エラー時は次の曲へ
  setTimeout(nextTrack, 3000);
}
function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function updateSeekVisuals() {
  if (!els.seekFill) return;
  const duration = audio.duration || 0;
  const current = audio.currentTime || 0;
  const playedPct =
    duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
  els.seekFill.style.width = `${playedPct}%`;
  let bufferedEnd = 0;
  try {
    for (let i = 0; i < audio.buffered.length; i++) {
      const start = audio.buffered.start(i);
      const end = audio.buffered.end(i);
      if (current + 0.2 >= start) bufferedEnd = Math.max(bufferedEnd, end);
    }
  } catch {}
}

function getTrackDisplayInfo(track) {
  if (!track)
    return {
      title: t("nowPlaying.notPlaying"),
      artist: "--",
      album: "",
      artwork: "",
      icon: "🎵",
    };

  const meta = track.meta || {};
  let title = meta.title || track.name || t("common.unknown");
  let artist = meta.artist || "Audio Visualizer";

  if (!meta.title) {
    title = title.replace(
      /\.(mp3|m4a|wav|aac|mp4|webm|mkv|mov|ogg|flac|opus)$/i,
      "",
    );
    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  }

  return {
    title,
    artist,
    album: meta.album || "",
    artwork: meta.artwork || "",
    icon: track.isVideo ? "🎬" : "🎵",
  };
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function updateTopBadge(track, index) {
  updateNextUpText(index);

  if (!els.nowPlayingArtSm) return;
  if (!track) {
    els.nowPlayingArtSm.style.background = "";
    els.nowPlayingArtSm.style.backgroundImage = "";
    els.nowPlayingArtSm.textContent = "🎵";
    return;
  }

  const info = getTrackDisplayInfo(track);
  const base = info.title + info.artist;
  const hue = hashString(base) % 360;

  els.nowPlayingArtSm.style.background = info.artwork
    ? "transparent"
    : `linear-gradient(135deg, hsla(${hue}, 85%, 55%, 0.7), hsla(${(hue + 40) % 360}, 85%, 45%, 0.7))`;
  els.nowPlayingArtSm.style.backgroundImage = info.artwork
    ? `url("${info.artwork}")`
    : "";
  els.nowPlayingArtSm.textContent = info.artwork ? "" : info.icon;
}

function updateNextUpText(currentIndex) {
  const nextIndex = (currentIndex + 1) % state.playlist.length;

  const nextTrack = state.playlist[nextIndex];

  els.nextUpText.textContent = nextTrack
    ? t("next.track", { name: nextTrack.meta?.title || nextTrack.name })
    : t("next.none");
}

function updateNowPlayingCustom(title, artist, icon, indexText) {
  if (!els.nowPlayingTitle) return;
  els.nowPlayingTitle.textContent = title;
  els.nowPlayingArtist.textContent = artist;
  if (els.nowPlayingIcon) els.nowPlayingIcon.textContent = icon;
  if (els.nowPlayingIndex) els.nowPlayingIndex.textContent = indexText;
}

function updateNowPlayingUI(track, index) {
  const info = getTrackDisplayInfo(track);
  const indexText =
    index >= 0
      ? `${index + 1}/${state.playlist.length}`
      : `0/${state.playlist.length}`;
  updateNowPlayingCustom(info.title, info.artist, info.icon, indexText);
}

async function handleFiles(files) {
  const allowedExt = new Set([
    "mp3",
    "wav",
    "m4a",
    "aac",
    "mp4",
    "webm",
    "mkv",
    "mov",
    "ogg",
    "flac",
    "opus",
  ]);
  const videoExt = new Set(["mp4", "webm", "mkv", "mov"]);

  const accepted = [];
  files.forEach((file) => {
    const name = (file.name || "").toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() : "";
    const isAudioMime =
      typeof file.type === "string" && file.type.startsWith("audio/");
    const isVideoMime =
      typeof file.type === "string" && file.type.startsWith("video/");
    if (isAudioMime || isVideoMime || allowedExt.has(ext)) {
      const isVideo = videoExt.has(ext) || isVideoMime;
      accepted.push({ file, isVideo });
    }
  });

  if (accepted.length === 0) {
    showOverlay(t("overlay.noFileSelected"));
    return;
  }

  showOverlay(t("overlay.importingFiles", { count: accepted.length }));

  for (const item of accepted) {
    const file = item.file;
    const filePath = typeof file.path === "string" ? file.path : "";
    let localRef = null;
    let fileBlob = null;
    if (filePath && state.settings.storeLocalFiles) {
      // パスがあり、かつ保存設定がONの場合のみライブラリに登録
      localRef = `path:${filePath}`;
      upsertLibraryEntry({
        ref: localRef,
        type: "path",
        name: file.name,
        sizeBytes: file.size,
        isVideo: item.isVideo,
      });
    } else if (filePath) {
      // パスがあるが保存設定がOFFの場合はlocalRefのみ設定（ライブラリには登録しない）
      localRef = `path:${filePath}`;
    } else if (state.settings.storeLocalFiles) {
      try {
        const id = await idbPutLocalFile(file);
        localRef = `idb:${id}`;
        upsertLibraryEntry({
          ref: localRef,
          type: "idb",
          name: file.name,
          sizeBytes: file.size,
          isVideo: item.isVideo,
        });
      } catch {
        localRef = null;
      }
    } else {
      // Lazy blob URL creation later
      fileBlob = file;
    }

    state.playlist.push({
      name: file.name,
      url: undefined,
      fileBlob,
      source: "local",
      isVideo: item.isVideo,
      localRef,
      size: file.size,
      ephemeral: false,
    });
  }
  renderPlaylist();
  if (state.currentIndex === -1)
    playTrack(state.playlist.length - accepted.length);
  saveSettingsToStorage();

  setTimeout(() => {
    els.statusText.textContent = state.playlist[state.currentIndex]
      ? `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${state.playlist[state.currentIndex].name}`
      : t("status.idle");
    updateNextUpText(state.currentIndex);
    showOverlay(t("overlay.filesAdded", { count: accepted.length }));
  }, 500);
}

async function importDeviceMusic() {
  const plugin = getNativeMediaLibraryPlugin();
  if (!plugin || typeof plugin.scan !== "function") {
    showOverlay(t("overlay.androidOnly"));
    return;
  }
  if (state.deviceMusicScanning) return;

  state.deviceMusicScanning = true;
  showOverlay(t("overlay.deviceMusicScanning"), 0);
  try {
    const result = await plugin.scan();
    const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    if (tracks.length === 0) {
      showOverlay(t("overlay.deviceMusicNone"));
      return;
    }

    let added = 0;
    let skipped = 0;
    for (const item of tracks) {
      if (!item || !item.uri) continue;
      const localRef = `media:${item.uri}`;
      if (state.playlist.some((track) => track.localRef === localRef)) {
        skipped++;
        continue;
      }
      state.playlist.push({
        name: item.name || item.title || t("common.unknown"),
        url: undefined,
        source: "local",
        isVideo: false,
        localRef,
        meta: {
          title: item.title || "",
          artist: item.artist || "",
          album: item.album || "",
          durationMs: item.durationMs || 0,
        },
        addedOrder: state.addedOrderCounter++,
      });
      added++;
    }

    renderPlaylist();
    saveSettingsToStorage();
    if (added > 0) {
      showOverlay(t("overlay.deviceMusicAdded", { count: added }));
    } else if (skipped > 0) {
      showOverlay(t("overlay.deviceMusicAlready"));
    } else {
      showOverlay(t("overlay.deviceMusicNone"));
    }
  } catch (e) {
    console.error("Media library scan failed", e);
    const message = String(e?.message || e);
    if (message.includes("permission")) {
      showOverlay(t("overlay.deviceMusicDenied"));
    } else {
      showOverlay(t("overlay.fileSelectFailed"));
    }
  } finally {
    state.deviceMusicScanning = false;
  }
}

async function handleLocalFiles(e) {
  await handleFiles(Array.from(e.target.files));
  e.target.value = "";
}

function renderPlaylist() {
  const query = els.playlistSearchInput.value.toLowerCase();
  const filtered = state.playlist
    .map((track, originalIndex) => ({ ...track, originalIndex }))
    .filter((track) => track.name.toLowerCase().includes(query));

  if (state.playlist.length === 0) {
    const empty = document.createElement("div");
    empty.className = "playlist-empty";
    empty.textContent = t("playlist.empty");
    els.playlistItems.replaceChildren(empty);
    return;
  }

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "playlist-empty";
    empty.textContent = t("playlist.notFound");
    els.playlistItems.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((track) => {
    const item = document.createElement("div");
    item.className = `playlist-item${track.originalIndex === state.currentIndex ? " active" : ""}`;
    item.dataset.index = String(track.originalIndex);
    item.draggable = true;

    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    dragHandle.title = t("playlist.dragToMove");
    dragHandle.textContent = "☰";

    const trackInfo = document.createElement("div");
    trackInfo.className = "track-info";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `${track.originalIndex + 1}. ${track.name}`;
    trackInfo.appendChild(name);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    for (const [className, titleKey, text] of [
      ["move-btn up", "playlist.moveUp", "▲"],
      ["move-btn down", "playlist.moveDown", "▼"],
      ["remove-btn", "playlist.remove", "✖"],
    ]) {
      const button = document.createElement("button");
      button.className = className;
      button.dataset.index = String(track.originalIndex);
      button.title = t(titleKey);
      button.textContent = text;
      actions.appendChild(button);
    }

    item.append(dragHandle, trackInfo, actions);
    fragment.appendChild(item);
  });
  els.playlistItems.replaceChildren(fragment);

  // ドラッグ&ドロップ処理
  setupPlaylistDragDrop();
  updatePlaylistCount();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function removeTracksByLocalRefs(refs) {
  const refSet = new Set(refs);
  const removedIdx = [];
  state.playlist.forEach((t, idx) => {
    if (t && refSet.has(t.localRef)) {
      removedIdx.push(idx);
      if (isBlobUrl(t.url)) {
        try {
          URL.revokeObjectURL(t.url);
        } catch {}
      }
    }
  });
  if (removedIdx.length === 0) return;

  // Remove tracks and adjust current index
  const removedBeforeCurrent = removedIdx.filter(
    (i) => i < state.currentIndex,
  ).length;
  const wasPlayingRemoved = removedIdx.includes(state.currentIndex);

  state.playlist = state.playlist.filter((_, idx) => !removedIdx.includes(idx));
  if (wasPlayingRemoved) {
    audio.pause();
    state.isPlaying = false;
    updatePlayBtn();
    state.currentIndex = -1;
    clearPlaybackState();
    updateMediaSessionMetadata();
    els.statusText.textContent = t("status.idle");
  } else if (state.currentIndex >= 0) {
    state.currentIndex = Math.max(
      -1,
      state.currentIndex - removedBeforeCurrent,
    );
  }
  renderPlaylist();
  updateVideoVisibility();
  saveSettingsToStorage();
}

async function deleteLibraryEntry(ref) {
  if (!ref) return;
  try {
    if (ref.startsWith("idb:")) {
      await idbDeleteLocalFile(ref.slice("idb:".length));
    } else if (ref.startsWith("app:") && isNativeCapacitor()) {
      const folderImport = getRegisteredNativePlugin("LocalFolderImport");
      if (
        folderImport &&
        typeof folderImport.deleteImportedFiles === "function"
      ) {
        await folderImport.deleteImportedFiles({
          paths: [ref.slice("app:".length)],
        });
      }
    }
  } catch {
    // ignore deletion errors
  }
  removeTracksByLocalRefs([ref]);
  removeLibraryEntries([ref]);
}

async function deleteAllLibraryEntries() {
  if (Object.keys(library).length === 0) {
    showOverlay(t("overlay.deleteNone"));
    return;
  }
  const ok = confirm(t("confirm.deleteStoredFiles"));
  if (!ok) return;
  isClearingLibrary = true;
  try {
    await folderImportQueue;
    const refs = Object.keys(library);
    for (const ref of refs) {
      await deleteLibraryEntry(ref);
    }
  } finally {
    isClearingLibrary = false;
  }
  showOverlay(t("overlay.allDeleted"));
  renderStorageList();
}

function renderStorageList() {
  if (!els.storageList) return;
  const refs = Object.keys(library);
  if (refs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = t("storage.empty");
    els.storageList.replaceChildren(empty);
    if (els.storageSummary) els.storageSummary.textContent = "";
    return;
  }
  const fragment = document.createDocumentFragment();
  refs.forEach((ref) => {
    const item = library[ref] || {};
    const size = item.sizeBytes
      ? formatBytes(item.sizeBytes)
      : t("storage.unknownSize");
    const typeLabel =
      item.type === "app" ? t("storage.typeApp") : t("storage.typeInternal");
    const row = document.createElement("div");
    row.className = "storage-item";
    row.dataset.ref = ref;
    row.style.cssText = "padding: 6px 8px; gap: 8px;";

    const meta = document.createElement("div");
    meta.className = "storage-meta";
    meta.style.cssText = "flex: 1; min-width: 0;";
    const name = document.createElement("strong");
    name.textContent = item.name || ref;
    name.style.cssText =
      "display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.85rem;";
    const details = document.createElement("span");
    details.className = "hint";
    details.textContent = `${typeLabel} | ${size}`;
    details.style.fontSize = "0.7rem";
    meta.append(name, details);

    const button = document.createElement("button");
    button.className = "icon-btn danger";
    button.dataset.delete = ref;
    button.textContent = "🗑️";
    button.style.cssText =
      "width: 32px; height: 32px; font-size: 0.9rem; flex-shrink: 0;";
    button.onclick = () => deleteLibraryEntry(ref);
    row.append(meta, button);
    fragment.appendChild(row);
  });
  els.storageList.replaceChildren(fragment);
  if (els.storageSummary) {
    const totalBytes = refs.reduce(
      (s, r) => s + (library[r]?.sizeBytes || 0),
      0,
    );
    const summary = document.createElement("div");
    summary.style.cssText =
      "display: flex; justify-content: space-between; font-weight: 600; margin-top: 8px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 8px; font-size: 0.85rem;";
    const count = document.createElement("span");
    count.textContent = t("storage.count", { count: refs.length });
    const total = document.createElement("span");
    total.textContent = t("storage.total", {
      size: totalBytes ? formatBytes(totalBytes) : "0B",
    });
    summary.append(count, total);
    els.storageSummary.replaceChildren(summary);
  }
}

let draggedIndex = -1;
let touchStartItem = null;
let touchStartTime = 0;

function setupPlaylistDragDrop() {
  const items = els.playlistItems.querySelectorAll(".playlist-item");

  items.forEach((item) => {
    // ===== Mouse Drag & Drop Events =====
    item.ondragstart = (e) => {
      const handle = e.target.closest(".drag-handle");
      if (!handle) {
        e.preventDefault();
        return;
      }
      draggedIndex = +item.dataset.index;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      // Firefox等でドラッグを開始するために必要
      e.dataTransfer.setData("text/plain", draggedIndex);
    };

    item.ondragend = (e) => {
      item.classList.remove("dragging");
      items.forEach((i) => i.classList.remove("drag-over"));
      draggedIndex = -1;
    };

    item.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const targetIdx = +item.dataset.index;
      if (draggedIndex === -1 || draggedIndex === targetIdx) return;
      item.classList.add("drag-over");
    };

    item.ondragleave = (e) => {
      item.classList.remove("drag-over");
    };

    item.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove("drag-over");

      const targetIndex = +item.dataset.index;
      if (draggedIndex === -1 || draggedIndex === targetIndex) return;

      performPlaylistReorder(draggedIndex, targetIndex);
      draggedIndex = -1;
    };

    // ===== Touch Events (タッチドラッグ対応) =====
    let touchStartY = 0;
    let touchStartX = 0;
    let touchStartDragHandle = false;

    item.addEventListener(
      "touchstart",
      (e) => {
        const handle = e.target.closest(".drag-handle");
        if (!handle) return;

        // タッチイベントのデフォルト動作（スクロール等）を防止
        if (e.cancelable) e.preventDefault();

        touchStartItem = item;
        touchStartTime = Date.now();
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchStartDragHandle = true;

        item.classList.add("dragging");
        item.classList.add("touch-dragging");
      },
      { passive: false },
    );

    item.addEventListener(
      "touchmove",
      (e) => {
        if (!touchStartDragHandle || !touchStartItem) return;

        if (e.cancelable) e.preventDefault();

        const touch = e.touches[0];
        const elementAtPoint = document.elementFromPoint(
          touch.clientX,
          touch.clientY,
        );
        const targetItem = elementAtPoint?.closest(".playlist-item");

        items.forEach((i) => i.classList.remove("drag-over"));
        if (targetItem && targetItem !== touchStartItem) {
          targetItem.classList.add("drag-over");
        }
      },
      { passive: false },
    );

    item.addEventListener("touchend", (e) => {
      if (!touchStartItem || !touchStartDragHandle) {
        touchStartDragHandle = false;
        return;
      }

      const touch = e.changedTouches[0];
      const elementAtPoint = document.elementFromPoint(
        touch.clientX,
        touch.clientY,
      );
      const targetItem = elementAtPoint?.closest(".playlist-item");

      if (targetItem && targetItem !== touchStartItem) {
        const dragIdx = +touchStartItem.dataset.index;
        const targetIdx = +targetItem.dataset.index;
        performPlaylistReorder(dragIdx, targetIdx);
      }

      item.classList.remove("dragging");
      item.classList.remove("touch-dragging");
      items.forEach((i) => i.classList.remove("drag-over"));
      touchStartItem = null;
      touchStartDragHandle = false;
    });
  });
}

function performPlaylistReorder(draggedIdx, targetIdx) {
  if (draggedIdx === -1 || draggedIdx === targetIdx) return;

  // プレイリストの順序を変更
  const [removed] = state.playlist.splice(draggedIdx, 1);
  state.playlist.splice(targetIdx, 0, removed);

  // 現在再生中のインデックスを更新
  if (state.currentIndex === draggedIdx) {
    state.currentIndex = targetIdx;
  } else {
    if (draggedIdx < state.currentIndex && targetIdx >= state.currentIndex) {
      state.currentIndex--;
    } else if (
      draggedIdx > state.currentIndex &&
      targetIdx <= state.currentIndex
    ) {
      state.currentIndex++;
    }
  }

  renderPlaylist();
  saveSettingsToStorage();
  showOverlay(t("overlay.playlistReordered"));

  // プレイリストの表示位置を調整（下に移動した場合、タブの上部が隠れないようにする）
  scrollToCurrentPlaylistItem();
}

// プレイリストの現在の曲にスクロール
function scrollToCurrentPlaylistItem() {
  const container = els.playlistItems;
  if (!container) return;

  const currentItem = container.querySelector(".playlist-item.active");
  if (currentItem) {
    // 要素が見える位置にスクロール（上部に余白を持たせる）
    const containerRect = container.getBoundingClientRect();
    const itemRect = currentItem.getBoundingClientRect();

    // アイテムがコンテナの上部より上にある場合
    if (itemRect.top < containerRect.top) {
      currentItem.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // アイテムがコンテナの下部より下にある場合
    else if (itemRect.bottom > containerRect.bottom) {
      currentItem.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }
}

async function removeFromPlaylist(index) {
  if (index < 0 || index >= state.playlist.length) return;
  const track = state.playlist[index];
  // ローカルファイルのBlob URLを解放（メモリリーク防止）
  if (track.source === "local") {
    if (isBlobUrl(track.url)) URL.revokeObjectURL(track.url);
  }
  // fileBlobがあれば参照を削除してGC対象に
  if (track.fileBlob) {
    track.fileBlob = null;
  }
  if (track.source === "local") {
    if (
      typeof track.localRef === "string" &&
      track.localRef.startsWith("idb:")
    ) {
      try {
        await idbDeleteLocalFile(track.localRef.slice("idb:".length));
      } catch {
        // ignore
      }
    }
    if (
      typeof track.localRef === "string" &&
      track.localRef.startsWith("app:") &&
      isNativeCapacitor()
    ) {
      try {
        const folderImport = getRegisteredNativePlugin("LocalFolderImport");
        if (
          folderImport &&
          typeof folderImport.deleteImportedFiles === "function"
        ) {
          await folderImport.deleteImportedFiles({
            paths: [track.localRef.slice("app:".length)],
          });
        }
      } catch {
        // ignore
      }
    }
  }
  state.playlist.splice(index, 1);

  // 現在再生中の曲を削除した場合の処理
  if (state.currentIndex === index) {
    state.isPlaying = false;
    updatePlayBtn();
    if (state.playlist.length > 0) {
      // 同じインデックスまたはその前の曲があればそれを再生
      const nextIndex = Math.min(index, state.playlist.length - 1);
      playTrack(nextIndex);
    } else {
      // プレイリストが空になった場合
      audio.pause();
      state.currentIndex = -1;
      clearPlaybackState();
      updateMediaSessionMetadata();
      els.statusText.textContent = t("status.idle");
      updateVideoVisibility();
    }
  } else if (state.currentIndex > index) {
    // 削除した曲がcurrentIndexより前の場合、インデックスをデクリメント
    state.currentIndex--;
  }

  renderPlaylist();
  saveSettingsToStorage();
}

function togglePlaylist() {
  const isCollapsed = els.playlistPanel.classList.toggle("collapsed");
  state.playlistVisible = !isCollapsed;
  els.playlistToggle.textContent = isCollapsed ? "📂" : "✖";
  // 両方のボタンの状態を同期
  if (els.closePlaylistBtn) {
    els.closePlaylistBtn.style.display = isCollapsed ? "none" : "block";
  }
  if (!isCollapsed) {
    updatePlaylistOffsets();
  }
}

// ============== UI CONTROLS ==============
function toggleUI() {
  state.uiVisible = !state.uiVisible;

  els.uiLayer.classList.toggle("hidden", !state.uiVisible);

  if (!state.uiVisible) {
    if (state.settingsOpen) closeSettings();
    if (state.playlistVisible) {
      els.playlistPanel.classList.add("collapsed");
      state.playlistVisible = false;
      if (els.playlistToggle) els.playlistToggle.textContent = "📂";
    }
  } else if (state.settings.autoHideUI) {
    // 少し遅延させて即時リセットを防ぐ
    setTimeout(resetUITimeout, 100);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn("Fullscreen failed:", err);
      showOverlay(t("overlay.fullscreenFailed"));
    });
  } else {
    document.exitFullscreen();
  }
}

function showOverlay(msg, duration = 1200) {
  els.overlayMsg.textContent = msg;
  els.overlayMsg.classList.remove("hidden", "fade-out");

  if (duration > 0) {
    if (els.overlayMsg.timeout) clearTimeout(els.overlayMsg.timeout);

    els.overlayMsg.timeout = setTimeout(() => {
      els.overlayMsg.classList.add("fade-out");
      setTimeout(() => {
        els.overlayMsg.classList.add("hidden");
      }, 200); // fade-outの時間
    }, duration);
  }
}

// ============== SLEEP TIMER ==============
function startSleepTimer(minutes) {
  stopSleepTimer();
  state.sleepTimerEnd = Date.now() + minutes * 60000;
  state.sleepTimerId = setInterval(() => {
    if (Date.now() >= state.sleepTimerEnd) {
      stopSleepTimer();
      audio.pause();
      state.isPlaying = false;
      updatePlayBtn();
      showOverlay(t("overlay.sleepStopped"));
    }
    updateSleepTimerStatus();
  }, 1000);
  showOverlay(t("overlay.sleepStart", { minutes }));
  updateSleepTimerStatus();
}
function stopSleepTimer() {
  if (state.sleepTimerId) {
    clearInterval(state.sleepTimerId);
    state.sleepTimerId = null;
  }
  state.sleepTimerEnd = 0;
  updateSleepTimerStatus();
}
function getSleepTimerRemaining() {
  if (!state.sleepTimerEnd) return 0;
  return Math.max(0, Math.ceil((state.sleepTimerEnd - Date.now()) / 60000));
}
function updatePlaylistCount() {
  const el = $("playlistCount");
  if (el)
    el.textContent = t("playlist.count", { count: state.playlist.length });
}
function updateSleepTimerStatus() {
  const el = $("sleepTimerStatus");
  if (!el) return;
  const rem = getSleepTimerRemaining();
  el.textContent = rem > 0 ? t("sleep.remaining", { minutes: rem }) : "";
}

// ============== EXPORT ==============
function startExport() {
  if (state.inputSource === "mic") {
    alert(t("alert.exportBlockedMic"));
    return;
  }
  if (!state.playlist[state.currentIndex]) return;
  if (!confirm(t("confirm.exportVideo"))) return;
  state.isExporting = true;
  const stream = cv.captureStream(60);
  state.mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm; codecs=vp9",
  });
  state.recordedChunks = [];
  state.mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) state.recordedChunks.push(e.data);
  };
  audio.pause();
  audio.currentTime = 0;
  state.gainNode.gain.value = 0;
  if (state.uiVisible) toggleUI();
  showOverlay(t("overlay.exporting"), 0);
  state.mediaRecorder.start();
  audio.play();
}
function finishExport() {
  state.mediaRecorder.stop();
  state.isExporting = false;
  if (!state.uiVisible) toggleUI();
  els.overlayMsg.classList.add("hidden");
  state.gainNode.gain.value = els.volSlider.value;
  setTimeout(() => {
    const blob = new Blob(state.recordedChunks, { type: "video/webm" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `visualizer_${state.playlist[state.currentIndex].name}.webm`;
    a.click();
    alert(t("alert.exportComplete"));
  }, 500);
}

// ============== VISUALIZATION ==============
let filteredFreqBuffer = new Uint8Array(0);
function getFilteredData() {
  const barCount = state.settings.barCount;
  if (!state.analyser) {
    if (filteredFreqBuffer.length !== barCount)
      filteredFreqBuffer = new Uint8Array(barCount);
    return filteredFreqBuffer;
  }
  state.analyser.getByteFrequencyData(state.freqData);
  // 時間波形は波形モード（mode 1）だけが必要
  if (state.mode === 1) {
    state.analyser.getByteTimeDomainData(state.timeData);
  }
  const loIdx = freqToIdx(state.settings.lowFreq);
  const hiIdx = Math.min(freqToIdx(state.settings.highFreq), state.bufLen);
  // 毎フレームの配列確保を避けるためバッファを再利用する
  if (filteredFreqBuffer.length !== barCount)
    filteredFreqBuffer = new Uint8Array(barCount);
  const out = filteredFreqBuffer;
  const range = hiIdx - loIdx;
  if (range <= 0) {
    out.fill(0);
    return out;
  }

  // 対数スケーリングで人間の聴覚に合わせた周波数マッピング
  for (let i = 0; i < barCount; i++) {
    const t0 = i / barCount;
    const t1 = (i + 1) / barCount;
    // ★ 低音を広く・高音を狭く（指数を大きくする）
    // 0.6 → 0.75〜0.85 がおすすめ
    //const exponent = 0.9;   // 調整ポイント（0.65=低音寄り控えめ、0.85=かなり低音重視）

    const startIdx = loIdx + Math.floor(t0 * range);
    const endIdx = Math.min(loIdx + Math.floor(t1 * range), hiIdx - 1);

    if (endIdx >= startIdx) {
      let sum = 0;
      let maxVal = 0;
      for (let j = startIdx; j <= endIdx; j++) {
        const v = state.freqData[j];
        sum += v;
        if (v > maxVal) maxVal = v;
      }
      const avg = sum / (endIdx - startIdx + 1);
      out[i] = Math.round(avg * 0.3 + maxVal * 0.7);
    } else {
      out[i] = state.freqData[Math.min(startIdx, state.bufLen - 1)];
    }
  }
  return out;
}
function updateNumBars() {
  const count = Math.max(16, Math.min(1024, state.settings.barCount || 64));
  state.settings.barCount = count;
}
function freqToIdx(f) {
  return state.audioCtx
    ? Math.round((f * state.analyser.fftSize) / state.audioCtx.sampleRate)
    : 0;
}
// HSL→HEX変換（起動時に一度だけ実行）
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// レインボー色のLUT（360色相 × 明度8段階）。
// 旧実装はバーごとに hsl() 文字列を生成して毎フレームCSS色パースしていた。
const RAINBOW_LEVELS = 8;
const RAINBOW_LUT = (() => {
  const lut = new Array(360 * RAINBOW_LEVELS);
  for (let h = 0; h < 360; h++) {
    for (let i = 0; i < RAINBOW_LEVELS; i++) {
      const lightness = (50 + (i / (RAINBOW_LEVELS - 1)) * 20) / 100;
      lut[h * RAINBOW_LEVELS + i] = hslToHex(h, 0.8, lightness);
    }
  }
  return lut;
})();

function getColor(i, v = 1, total = state.settings.barCount) {
  if (state.settings.rainbow) {
    const baseHue = (i / Math.max(1, total)) * 360;
    // フレーム先頭で計算した値を共有（バーごとに Date.now() を呼ばない）
    const timeHue = frameColorHue;
    const hue = Math.floor((((baseHue + timeHue) % 360) + 360) % 360);
    const level = Math.round(
      Math.max(0, Math.min(1, v)) * (RAINBOW_LEVELS - 1),
    );
    // 事前計算した色文字列を返す（毎フレームのHSL生成・パースを避ける）
    return RAINBOW_LUT[hue * RAINBOW_LEVELS + level];
  }
  return state.settings.fixedColor;
}

// ============== Display value computation (changeMode + sand + 新decay) ==============
function ensureFrameBuffers(n) {
  if (!state.displayValues || state.displayValues.length !== n)
    state.displayValues = new Float32Array(n);
  if (!state.prevLevels || state.prevLevels.length !== n)
    state.prevLevels = new Float32Array(n);
  if (!state.sandHeights || state.sandHeights.length !== n)
    state.sandHeights = new Float32Array(n);
}

function computeDisplayValues(rawFreq, dtSec) {
  const n = rawFreq.length;
  ensureFrameBuffers(n);
  const disp = state.displayValues;
  const prev = state.prevLevels;
  const sand = state.sandHeights;
  const mode = state.settings.changeMode;
  // ループ内のプロパティ参照を減らす
  const sandMode = !!state.settings.sandMode;
  const sandFallRate = state.settings.sandFallRate;

  for (let i = 0; i < n; i++) {
    const cur = Math.max(0, Math.min(1, rawFreq[i] / 255));
    let v = cur;
    if (mode === "plus") v = Math.max(0, cur - prev[i]);
    else if (mode === "plusminus") v = cur - prev[i];
    disp[i] = v;
    // sand update: always uses cur (raw level), not display
    if (sandMode) {
      if (cur >= sand[i]) {
        sand[i] = disp[i]; // ← ここを display値に統一（重要）
      } else {
        sand[i] = Math.max(0, sand[i] - sandFallRate * dtSec);
      }
    } else {
      sand[i] = 0;
    }
    prev[i] = cur;
  }
  return disp;
}

let lastDrawTs = 0;
let lastVideoSyncCheckTs = 0;
let videoSyncCooldown = 0; // 同期後のクールダウン時間
let colorsCache = []; // 色配列キャッシュ
let appliedBlurPx = -1;
let visualizerBaseAlpha = 1;
// レインボーの時間回転（1フレーム1回だけ計算）
let frameColorHue = 0;

// リソースモニター用
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let lastResourceUpdateTime = 0;

// ============== Render scheduler ==============
// 再生中・マイク入力中・明示的な再描画要求があるときだけ描画ループを回す。
// 一時停止中に60fpsで描き続けるのが最大の無駄だったため、停止中はrAFを止める。
let playingUiClass = false;

// 再生中はUIのすりガラス（backdrop-filter）を止める。
// キャンバスが動いている間は毎フレーム背景ブラーが走るため、合成負荷が大きい。
function updatePlayingUiClass() {
  const active =
    state.isPlaying ||
    state.isExporting ||
    (state.inputSource === "mic" && !!state.micStream);
  if (active === playingUiClass) return;
  playingUiClass = active;
  document.body.classList.toggle("playing", active);
}

function isRenderActive() {
  if (state.isExporting) return true;
  if (state.isPlaying) return true;
  if (state.inputSource === "mic" && state.micStream) return true;
  return renderPendingFrames > 0;
}

function invalidateRender(frames = 2) {
  renderPendingFrames = Math.max(renderPendingFrames, frames);
  scheduleRender();
}

function scheduleRender() {
  if (document.hidden) return;
  if (renderRafId !== null) return;
  if (!isRenderActive()) return;
  renderRafId = requestAnimationFrame(draw);
}

function stopRenderLoop() {
  if (renderRafId !== null) {
    cancelAnimationFrame(renderRafId);
    renderRafId = null;
  }
  renderPendingFrames = 0;
  renderEmaInterval = 0;
  renderSlowStreak = 0;
  lastDrawTs = 0;
  fpsFrameCount = 0;
  fpsLastTime = performance.now();
  const fpsEl = $("fpsValue");
  if (fpsEl) fpsEl.textContent = "0 fps";
  updatePlayingUiClass();
}

// 実測フレーム間隔から描画解像度を自動調整する（ユーザー設定の最大FPSは変更しない）
const QUALITY_RECOVER_MS = 30000;
function updateAdaptiveQuality(frameIntervalMs) {
  if (!(frameIntervalMs > 0) || frameIntervalMs > 500) return;

  // 最短間隔を記録（リフレッシュ周期の推定）。目標FPSが120でも60Hz画面で
  // 「常に遅い」と誤判定しないための基準になる。
  if (!renderMinInterval || frameIntervalMs < renderMinInterval) {
    renderMinInterval = Math.max(4, frameIntervalMs);
  }

  renderEmaInterval = renderEmaInterval
    ? renderEmaInterval * 0.9 + frameIntervalMs * 0.1
    : frameIntervalMs;

  const now = performance.now();
  if (now - renderLastQualityCheck < 2000) return;
  renderLastQualityCheck = now;

  const targetFps = state.settings.targetFps || 60;
  if (targetFps !== renderAdaptTargetFps) {
    renderAdaptTargetFps = targetFps;
    renderMinInterval = 0;
  }
  // 120fps等の設定は「出れば嬉しい」扱い。60fpsを基準に品質を判断する。
  const adaptTargetFps = Math.min(targetFps, 60);
  const targetMs = 1000 / Math.max(1, adaptTargetFps);
  // ディスプレイのリフレッシュ周期は30〜120Hzの範囲とみなす。
  // 常時スローな端末でも「60ms周期の画面」と誤認して調整を諦めないようにする。
  const refreshFloorMs = Math.min(
    1000 / 30,
    Math.max(1000 / 120, renderMinInterval || targetMs),
  );
  const effectiveTargetMs = Math.max(targetMs, refreshFloorMs);

  // 実際に達成可能な間隔に対して明確に遅い場合だけ解像度を下げる
  if (renderEmaInterval > effectiveTargetMs * 1.35) {
    renderSlowStreak++;
    renderLastSlowAt = now;
  } else {
    renderSlowStreak = 0;
  }

  if (renderSlowStreak >= 2 && renderQualityScale > 0.6) {
    renderQualityScale = Math.max(0.6, renderQualityScale * 0.85);
    renderSlowStreak = 0;
    renderLastSlowAt = now;
    applyCanvasResolution();
    return;
  }

  // 30秒間遅いフレームが出なければ、余裕があるとみなして徐々に戻す
  if (
    renderQualityScale < 1 &&
    renderLastSlowAt > 0 &&
    now - renderLastSlowAt > QUALITY_RECOVER_MS
  ) {
    renderQualityScale = Math.min(1, renderQualityScale + 0.05);
    renderLastSlowAt = now;
    applyCanvasResolution();
  }
}

function endFrame(ts) {
  updatePlayingUiClass();
  const prevTs = lastDrawTs;
  lastDrawTs = ts;
  if (
    prevTs &&
    (state.isPlaying || (state.inputSource === "mic" && state.micStream))
  ) {
    updateAdaptiveQuality(ts - prevTs);
  }
  if (renderPendingFrames > 0) renderPendingFrames--;
  if (isRenderActive()) {
    renderRafId = requestAnimationFrame(draw);
  } else {
    stopRenderLoop();
  }
}

function updateResourceMonitor() {
  const now = performance.now();
  // Android版は2秒に1回更新（軽量化）
  if (now - lastResourceUpdateTime < 2000) return;
  lastResourceUpdateTime = now;

  // FPS計算
  const elapsed = now - fpsLastTime;
  const fps = Math.round(fpsFrameCount / (elapsed / 1000));
  fpsFrameCount = 0;
  fpsLastTime = now;

  const fpsEl = $("fpsValue");
  if (fpsEl) fpsEl.textContent = fps + " fps";

  // メモリ使用量
  const memoryEl = $("memoryValue");
  if (memoryEl) {
    if (performance.memory) {
      const usedMB = Math.round(
        performance.memory.usedJSHeapSize / (1024 * 1024),
      );
      memoryEl.textContent = usedMB + " MB";
    } else {
      memoryEl.textContent = t("common.unsupported");
    }
  }

  // 描画バックエンド
  const renderEl = $("renderValue");
  if (renderEl) {
    renderEl.textContent = "Canvas2D";
    renderEl.style.color = "#4fc3f7";
  }
}

function draw(ts = 0) {
  renderRafId = null;

  // バックグラウンド中は描画しない（復帰時に visibilitychange で再開）
  if (document.hidden) {
    renderPendingFrames = 0;
    return;
  }

  // 設定された最大FPSを超えるフレームは描画せず次フレームへ
  const targetFps = state.settings.targetFps || 0;
  const minInterval = targetFps > 0 ? 1000 / targetFps : 0;
  if (minInterval > 0 && lastDrawTs && ts - lastDrawTs < minInterval - 0.5) {
    renderRafId = requestAnimationFrame(draw);
    return;
  }

  try {
    const dtSecRaw = lastDrawTs ? (ts - lastDrawTs) / 1000 : 0;
    const dtSec = Math.min(0.1, dtSecRaw || minInterval / 1000 || 1 / 60);

    // 背景ぼかしは固定強度で維持
    if (
      state.settings.videoMode === "background" &&
      state.settings.bgBlur > 0 &&
      state.settings.showVideo
    ) {
      applyBackgroundBlur(state.settings.bgBlur);
    } else if (appliedBlurPx !== 0) {
      applyBackgroundBlur(0);
    }

    // リソースモニター更新（2秒に1回に削減）
    fpsFrameCount++;
    updateResourceMonitor();

    // 動画と音声の同期チェック（改良版：シーク検出、速度リセット改善）
    if (
      bgVideo.src &&
      state.isPlaying &&
      state.settings.showVideo &&
      !bgVideo.paused &&
      bgVideo.readyState >= 2
    ) {
      // シーク検出：音声位置が大きく変化した場合
      const audioTimeDelta = Math.abs(audio.currentTime - state.lastAudioTime);
      const wasSeek = audioTimeDelta > 0.5 && state.lastAudioTime > 0;
      state.lastAudioTime = audio.currentTime;

      const baseRate = audio.playbackRate || 1.0;
      if (wasSeek) {
        const targetTime = audio.currentTime + getVideoSyncOffset();
        bgVideo.currentTime = targetTime;
        bgVideo.playbackRate = baseRate;
        videoSyncCooldown = 2.0;
        lastVideoSyncCheckTs = ts;
      } else if (videoSyncCooldown > 0) {
        videoSyncCooldown -= dtSec;
      } else if (!lastVideoSyncCheckTs || ts - lastVideoSyncCheckTs >= 800) {
        lastVideoSyncCheckTs = ts;
        const videoOffset = getVideoSyncOffset();
        const targetTime = audio.currentTime + videoOffset;
        const timeDiff = bgVideo.currentTime - targetTime;
        const absTimeDiff = Math.abs(timeDiff);

        if (absTimeDiff > 45.0) {
          bgVideo.currentTime = targetTime;
          bgVideo.playbackRate = baseRate;
          videoSyncCooldown = 1.5;
        } else if (absTimeDiff > 25.0) {
          if (timeDiff > 3.0) {
            bgVideo.currentTime = targetTime;
            bgVideo.playbackRate = baseRate;
            videoSyncCooldown = 1.5;
          } else {
            if (bgVideo.playbackRate !== baseRate * 7) {
              bgVideo.playbackRate = baseRate * 7;
            }
          }
        } else if (absTimeDiff > 10.0) {
          if (timeDiff > 0) {
            bgVideo.currentTime = targetTime;
            bgVideo.playbackRate = baseRate;
            videoSyncCooldown = 1.5;
          } else {
            if (bgVideo.playbackRate !== baseRate * 5) {
              bgVideo.playbackRate = baseRate * 5;
            }
          }
        } else if (absTimeDiff > 3.0) {
          if (timeDiff > 0) {
            if (bgVideo.playbackRate !== baseRate * 0.7) {
              bgVideo.playbackRate = baseRate * 0.7;
            }
          } else {
            if (bgVideo.playbackRate !== baseRate * 1.3) {
              bgVideo.playbackRate = baseRate * 1.3;
            }
          }
        } else if (absTimeDiff > 0.5) {
          if (timeDiff > 0) {
            if (bgVideo.playbackRate !== baseRate * 0.9) {
              bgVideo.playbackRate = baseRate * 0.9;
            }
          } else {
            if (bgVideo.playbackRate !== baseRate * 1.1) {
              bgVideo.playbackRate = baseRate * 1.1;
            }
          }
        } else if (absTimeDiff > 0.1) {
          if (timeDiff > 0) {
            if (bgVideo.playbackRate !== baseRate * 0.97) {
              bgVideo.playbackRate = baseRate * 0.97;
            }
          } else {
            if (bgVideo.playbackRate !== baseRate * 1.03) {
              bgVideo.playbackRate = baseRate * 1.03;
            }
          }
        } else {
          if (Math.abs(bgVideo.playbackRate - baseRate) > 0.01) {
            bgVideo.playbackRate = baseRate;
          }
        }
      }
    }

    if (
      state.settings.videoMode === "background" &&
      state.playlist[state.currentIndex]?.isVideo &&
      state.settings.showVideo
    ) {
      // 背景モード時はCanvasを透明にして動画を直接見せる
      ctx.clearRect(0, 0, W, H);
    } else {
      // 通常時は背景色で塗りつぶし
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, W, H);
    }

    if (!state.analyser) {
      return endFrame(ts);
    }
    const fd = getFilteredData();
    if (!fd || fd.length === 0) {
      return endFrame(ts);
    }
    const display = computeDisplayValues(fd, dtSec);
    // Precompute colors for the frame - 配列再利用でメモリ確保を削減
    frameColorHue =
      state.mode === 1 || state.mode === 4 ? Date.now() * 0.05 : 0;
    const nBars = fd.length;
    if (colorsCache.length !== nBars) colorsCache = new Array(nBars);
    for (let i = 0; i < nBars; i++) {
      colorsCache[i] = getColor(
        i,
        Math.max(0, Math.min(1, fd[i] / 255)),
        nBars,
      );
    }
    // Use full screen height for visualization
    const drawH = H;
    const drawStartY = 0;
    // Bars モードは 85%、Monitor モードは 80%（Monitor 框用）、その他は 90%
    const maxH =
      state.mode === 0
        ? drawH * 0.85
        : state.mode === 6
          ? drawH * 0.8
          : drawH * 0.9;

    // 低 FPSモードでもグローは使えるようにする（ブルームは軽量なため）
    visualizerBaseAlpha = Math.max(0, Math.min(1, state.settings.opacity));

    const mainCtx = ctx;
    const glowActive =
      state.settings.glowEnabled && state.settings.glowStrength > 0;
    let glowSource = null;
    if (glowActive) {
      // 背景を含めず、可視化レイヤーだけをグローの光源にする
      ctx = ensureVizLayer();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      glowSource = vizCanvas;
    }

    try {
      ctx.globalAlpha = visualizerBaseAlpha;

      if (state.settings.mirror) {
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
      }

      ctx.save();
      switch (state.mode) {
        case 0:
          drawBarsFromDisplay(display, colorsCache, maxH, drawH, drawStartY);
          break;
        case 1:
          drawWaveform(maxH, drawH, drawStartY);
          break;
        case 2:
          drawDigitalBlocks(fd, maxH, drawH, drawStartY);
          break;
        case 3:
          drawCircleFromDisplay(display, colorsCache, maxH, drawH, drawStartY);
          break;
        case 4:
          drawSpectrum(fd, maxH, drawH, drawStartY);
          break;
        case 5:
          drawGalaxy(fd, drawH, drawStartY);
          break;
        case 6:
          drawBarsFromDisplay(display, colorsCache, maxH, drawH, drawStartY);
          break; // Monitor 時も Bars を描画
        case 7:
          drawHexagon(fd, drawH, drawStartY);
          break;
        case 8:
          drawMirrorBars(fd, maxH, drawH, drawStartY);
          break;
      }
      ctx.restore();

      // Monitor モード時はビジュアライザーの後に描画（オーバーレイ）
      if (state.mode === 6) {
        drawMonitor(fd, maxH, drawH, drawStartY);
      }

      if (state.settings.mirror) {
        ctx.restore();
      }
    } finally {
      // 例外が起きても必ずメインのコンテキストへ戻す
      ctx = mainCtx;
    }

    if (glowActive) {
      // 可視化レイヤーを背景の上に合成してから、グローを加算する
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(glowSource, 0, 0);
      ctx.restore();
      applyBloom(state.settings.glowStrength, glowSource);
    }

    ctx.globalAlpha = 1.0;
  } catch (err) {
    console.error("Draw error:", err);
  }
  // 後始末と次フレームのスケジュール
  endFrame(ts);
}
// ============== Cheap bloom (glow) ==============
// 可視化レイヤー（背景なし）を低解像度でぼかして加算合成する。
// 画面全体を光源にすると暗い背景まで加算されてグローが薄まるため、
// グローON時だけ描画先を透明レイヤーへ切り替えている。
let vizCanvas = null;
let vizCtx = null;

function ensureVizLayer() {
  if (!vizCanvas) {
    vizCanvas = document.createElement("canvas");
    vizCtx = vizCanvas.getContext("2d");
  }
  if (vizCanvas.width !== W || vizCanvas.height !== H) {
    vizCanvas.width = W;
    vizCanvas.height = H;
  }
  return vizCtx;
}

let bloomCanvasA = null;
let bloomCanvasB = null;
let bloomCtxA = null;
let bloomCtxB = null;

function applyBloom(strength, source) {
  if (!cv || W < 8 || H < 8) return;
  const src = source || cv;
  const wA = Math.max(8, Math.floor(W / 2));
  const hA = Math.max(8, Math.floor(H / 2));
  const wB = Math.max(4, Math.floor(W / 8));
  const hB = Math.max(4, Math.floor(H / 8));

  if (!bloomCanvasA) {
    bloomCanvasA = document.createElement("canvas");
    bloomCanvasB = document.createElement("canvas");
    bloomCtxA = bloomCanvasA.getContext("2d");
    bloomCtxB = bloomCanvasB.getContext("2d");
  }
  if (bloomCanvasA.width !== wA || bloomCanvasA.height !== hA) {
    bloomCanvasA.width = wA;
    bloomCanvasA.height = hA;
  }
  if (bloomCanvasB.width !== wB || bloomCanvasB.height !== hB) {
    bloomCanvasB.width = wB;
    bloomCanvasB.height = hB;
  }

  // 1/2解像度：バーの芯に近い、明るいグロー
  bloomCtxA.clearRect(0, 0, wA, hA);
  bloomCtxA.imageSmoothingEnabled = true;
  bloomCtxA.filter = "blur(2px)";
  bloomCtxA.drawImage(src, 0, 0, wA, hA);
  bloomCtxA.filter = "none";

  // 1/8解像度：広く柔らかい光
  bloomCtxB.clearRect(0, 0, wB, hB);
  bloomCtxB.imageSmoothingEnabled = true;
  bloomCtxB.filter = "blur(2px)";
  bloomCtxB.drawImage(bloomCanvasA, 0, 0, wB, hB);
  bloomCtxB.filter = "none";

  const t = Math.max(0, Math.min(1, strength / 50));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.5 + t * 0.4;
  ctx.drawImage(bloomCanvasB, 0, 0, W, H);
  ctx.globalAlpha = 0.55 + t * 0.4;
  ctx.drawImage(bloomCanvasA, 0, 0, W, H);
  ctx.restore();
}
// Shake and Sparkles features removed

function applyBackgroundBlur(px) {
  const shouldBlur =
    state.settings.videoMode === "background" &&
    state.settings.bgBlur > 0 &&
    state.settings.showVideo &&
    state.settings.blurEnabled;
  const safePx = shouldBlur
    ? Math.max(0, Math.min(state.settings.bgBlur, px))
    : 0;
  if (Math.abs(safePx - appliedBlurPx) < 0.2) return;
  appliedBlurPx = safePx;
  if (safePx > 0) {
    bgVideo.style.willChange = "filter";
    bgVideo.style.filter = `blur(${safePx}px)`;
    bgVideo.style.webkitFilter = `blur(${safePx}px)`;
  } else {
    bgVideo.style.willChange = "auto";
    bgVideo.style.filter = "none";
    bgVideo.style.webkitFilter = "none";
  }
}

function getVideoSyncOffset() {
  if (
    state.settings.videoMode === "background" &&
    state.settings.bgBlur > 0 &&
    state.settings.showVideo
  ) {
    return 0.12;
  }
  return 0.05;
}

function getVideoStartOffset() {
  return Math.max(0.2, getVideoSyncOffset());
}

// Modes (updated bars/circle to use display & sand)
function drawBarsFromDisplay(display, colors, maxH, drawH, drawStartY) {
  const n = display.length;
  const px = renderPixelScale;
  const bw = W / n;
  const sandMode = !!state.settings.sandMode;
  const sandHeights = state.sandHeights;
  // バー本数が多い場合は空白を減らす（128本以上で調整開始）
  // 内部解像度が変わっても見た目の太さが変わらないよう px で補正する
  const gap =
    (n >= 256 ? Math.max(0.5, 2 - (n - 256) / 256) : n >= 128 ? 1.5 : 2) * px;
  for (let i = 0; i < n; i++) {
    let v = Math.max(0, display[i]);
    v = Math.pow(v, 1.15); // ★ 低レベル強調でピークが目立つように
    const h = v * maxH;
    const color = colors[i];

    ctx.fillStyle = color;
    ctx.fillRect(i * bw + gap / 2, drawStartY + drawH - h, bw - gap, h);

    // ピーク強調（オプション）
    if (v > 0.7) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.4;
      ctx.fillRect(i * bw + gap / 2, drawStartY + drawH - h, bw - gap, 4 * px); // トップライン
      ctx.globalAlpha = visualizerBaseAlpha;
    }
    // sand marker: use same color as bar
    if (sandMode) {
      const sandV = sandHeights[i] || 0;
      const sh = Math.pow(Math.max(0, sandV), 1.15) * maxH; // Barsの場合
      if (sh > 0) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        const y = drawStartY + drawH - sh;
        ctx.fillRect(i * bw + gap / 2, y - 2 * px, bw - gap, 4 * px);
        ctx.globalAlpha = visualizerBaseAlpha;
      }
    }
  }
}
function drawWaveform(maxH, drawH, drawStartY) {
  let startIdx = 0;
  for (let i = 0; i < state.bufLen - 1; i++) {
    if (state.timeData[i] < 128 && state.timeData[i + 1] >= 128) {
      startIdx = i;
      break;
    }
  }

  // 全サンプル（最大 fftSize/2 点）を結ぶとパス構築が重いので、
  // 画面幅に対して十分な密度まで間引く（見た目はほぼ変わらない）
  const total = state.bufLen - startIdx;
  const step = Math.max(1, Math.ceil(total / Math.max(256, W / 2)));
  const slice = W / total;
  const centerY = drawStartY + drawH / 2;

  ctx.beginPath();
  for (let i = startIdx; i < state.bufLen; i += step) {
    const v = state.timeData[i] / 128 - 1;
    const y = centerY + v * maxH * 0.5;
    i === startIdx ? ctx.moveTo(0, y) : ctx.lineTo((i - startIdx) * slice, y);
  }
  // 間引きで最後のサンプルが落ちた場合は右端まで線をつなぐ
  const lastIdx = state.bufLen - 1;
  if (lastIdx > startIdx && (lastIdx - startIdx) % step !== 0) {
    const v = state.timeData[lastIdx] / 128 - 1;
    ctx.lineTo(W, centerY + v * maxH * 0.5);
  }

  ctx.strokeStyle = state.settings.rainbow
    ? `hsl(${(Date.now() * 0.1) % 360}, 80%, 60%)`
    : state.settings.fixedColor;
  ctx.lineWidth = 3 * renderPixelScale;

  ctx.stroke();
}
function drawDigitalBlocks(fd, maxH, drawH, drawStartY) {
  const cols = 32;
  const rows = 20;
  const px = renderPixelScale;
  const cellW = W / cols;
  const cellH = drawH / rows;
  const inset = 2 * px;
  const innerW = Math.max(0.5, cellW - inset * 2);
  const innerH = Math.max(0.5, cellH - inset * 2);

  // 非アクティブなマス目は全部同じ色なので、1パスにまとめて塗る。
  ctx.beginPath();
  for (let i = 0; i < cols; i++) {
    const idx = Math.floor((i / cols) * fd.length);
    const activeRows = Math.floor((fd[idx] / 255) * rows);
    for (let j = 0; j < rows - activeRows; j++) {
      ctx.rect(
        i * cellW + inset,
        drawStartY + j * cellH + inset,
        innerW,
        innerH,
      );
    }
  }
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();

  // アクティブなマス目だけ個別に塗る（本数はデータ量に依存）
  for (let i = 0; i < cols; i++) {
    const idx = Math.floor((i / cols) * fd.length);
    const activeRows = Math.floor((fd[idx] / 255) * rows);
    for (let j = rows - activeRows; j < rows; j++) {
      ctx.fillStyle = getColor(i, (rows - j) / rows, cols);
      ctx.fillRect(
        i * cellW + inset,
        drawStartY + j * cellH + inset,
        innerW,
        innerH,
      );
    }
  }
}
function drawCircleFromDisplay(display, colors, maxH, drawH, drawStartY) {
  const cx = W / 2,
    cy = drawStartY + drawH / 2;
  const r = Math.min(W, drawH) * 0.25;
  const n = display.length;
  const circumference = 2 * Math.PI * r;
  const barW = (circumference / n) * 0.8;
  const angleOffset =
    (((state.settings.circleAngleOffset || 0) % 360) * Math.PI) / 180;

  // バーごとに save/translate/rotate/restore する代わりに、
  // 現在の変換（ミラー等）に回転と平行移動を合成して setTransform で直接適用する
  const base = ctx.getTransform();
  const ba = base.a,
    bb = base.b,
    bc = base.c,
    bd = base.d,
    be = base.e,
    bf = base.f;
  // 平行移動 (cx, cy) は全バー共通なので事前に計算
  const transE = ba * cx + bc * cy + be;
  const transF = bb * cx + bd * cy + bf;

  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2 + angleOffset;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);

    // base * rotate(ang) * translate(cx, cy)
    ctx.setTransform(
      ba * cos + bc * sin,
      bb * cos + bd * sin,
      -ba * sin + bc * cos,
      -bb * sin + bd * cos,
      transE,
      transF,
    );

    const v = Math.max(0, display[i]);
    const len = v * maxH * 0.6;
    const color = colors[i];
    ctx.fillStyle = color;

    ctx.fillRect(r, -barW / 2, len, barW);

    if (state.settings.sandMode) {
      const sandV = state.sandHeights ? state.sandHeights[i] : 0;
      const sh = sandV * maxH * 0.6; // Circleのバー長さに合わせる
      if (sh > 0) {
        // 直前のバーで設定した変換をそのまま利用する
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(
          r + sh,
          0,
          Math.max(1.5 * renderPixelScale, barW * 0.3),
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.globalAlpha = visualizerBaseAlpha;
      }
    }
  }

  ctx.setTransform(ba, bb, bc, bd, be, bf);
}
function drawSpectrum(fd, maxH, drawH, drawStartY) {
  const n = fd.length;
  const bw = W / n;
  ctx.beginPath();
  ctx.moveTo(0, drawStartY + drawH);
  for (let i = 0; i < n; i++) {
    const v = fd[i] / 255;
    const h = v * maxH;
    const x = i * bw + bw / 2;
    const y = drawStartY + drawH - h;
    if (i === 0) ctx.lineTo(x, y);
    else {
      const prevX = (i - 1) * bw + bw / 2;
      const prevY = drawStartY + drawH - (fd[i - 1] / 255) * maxH;
      const cx = (prevX + x) / 2;
      ctx.bezierCurveTo(cx, prevY, cx, y, x, y);
    }
  }
  ctx.lineTo(W, drawStartY + drawH);
  ctx.closePath();

  const grad = ctx.createLinearGradient(
    0,
    drawStartY + drawH - maxH,
    0,
    drawStartY + drawH,
  );
  const hue = Math.floor((Date.now() * 0.05) % 360);
  const c = state.settings.rainbow
    ? `hsl(${hue}, 80%, 60%)`
    : state.settings.fixedColor;
  grad.addColorStop(0, c);
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = state.settings.rainbow ? `hsl(${hue}, 80%, 80%)` : "#fff";
  ctx.lineWidth = 2 * renderPixelScale;
  ctx.stroke();
}
function drawGalaxy(fd, drawH, drawStartY) {
  const cx = W / 2,
    cy = drawStartY + drawH / 2;
  const px = renderPixelScale;
  const bass = fd[0] / 255;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Date.now() * 0.0005);
  const arms = 5;
  const particlesPerArm = 20;
  for (let i = 0; i < arms; i++) {
    for (let j = 0; j < particlesPerArm; j++) {
      const progress = j / particlesPerArm;
      const idx = Math.floor(progress * fd.length);
      const v = fd[idx] / 255;
      const angle = (i / arms) * Math.PI * 2 + progress * Math.PI * 2;
      const r = progress * Math.min(W, drawH) * 0.4 + bass * 50 * px;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      const size = (v * 10 + 2) * px * (1 - progress * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = getColor(idx, v, fd.length);
      ctx.fill();
    }
  }
  ctx.restore();
}
function drawMonitor(fd, maxH, drawH, drawStartY) {
  // 画面の向きを判定
  const isPortrait = H > W;
  const isLandscape = !isPortrait;

  // デバイスタイプの判定
  const isPhone = Math.min(W, H) <= 520;
  const isTablet = Math.min(W, H) > 520 && Math.min(W, H) <= 768;

  // コンパクトモードの判定（縦横で独立）
  const compact = isPortrait ? W < 500 || drawH < 420 : W < 700 || drawH < 420;
  const isPortraitPhone = isPortrait && isPhone;
  const isLandscapePhone = isLandscape && isPhone;

  const lineH = compact ? (isPortraitPhone ? 16 : 15) : 17;
  const padding = compact ? (isPortraitPhone ? 14 : 12) : 14;
  const bandHeight = compact ? (isPortraitPhone ? 11 : 10) : 12;
  const bandGap = compact ? 3 : 4;
  const boxX = 12;
  const boxY = drawStartY + 12;
  const hue = Math.floor((Date.now() * 0.05) % 360);

  const analyser = state.analyser;
  const hasRaw = !!(analyser && state.freqData && state.freqData.length);
  const loIdx = hasRaw ? freqToIdx(state.settings.lowFreq) : 0;
  const hiIdx = hasRaw
    ? Math.min(freqToIdx(state.settings.highFreq), state.freqData.length)
    : 0;
  const startIdx = Math.max(
    0,
    Math.min(loIdx, hasRaw ? state.freqData.length - 1 : 0),
  );
  const endIdx = Math.max(
    startIdx + 1,
    Math.min(hiIdx, hasRaw ? state.freqData.length : 1),
  );

  let maxRaw = 0,
    maxRawIdx = startIdx,
    sumRaw = 0,
    rmsSumRaw = 0,
    spectralSum = 0;
  if (hasRaw) {
    for (let i = startIdx; i < endIdx; i++) {
      const v = state.freqData[i];
      sumRaw += v;
      if (v > maxRaw) {
        maxRaw = v;
        maxRawIdx = i;
      }
      const n = v / 255;
      rmsSumRaw += n * n;
      const freq = (i * state.audioCtx.sampleRate) / analyser.fftSize;
      spectralSum += freq * v;
    }
  }
  const rawCount = hasRaw ? endIdx - startIdx : 1;
  const avgRaw = hasRaw ? sumRaw / rawCount : 0;
  const rms = hasRaw ? Math.sqrt(rmsSumRaw / rawCount) : 0;
  const dbLevel =
    rms > 0.001
      ? Math.round(20 * Math.log10(Math.min(1, rms)) * 10) / 10
      : -Infinity;
  const dbDisplay = dbLevel === -Infinity ? "-∞" : `${dbLevel}`;
  const crestFactor = rms > 0.001 ? (maxRaw / 255 / rms).toFixed(2) : "∞";
  const spectralCentroid =
    sumRaw > 0 && hasRaw ? Math.round(spectralSum / sumRaw) : 0;
  const peakFreq =
    hasRaw && state.audioCtx && analyser
      ? Math.round((maxRawIdx * state.audioCtx.sampleRate) / analyser.fftSize)
      : 0;

  let maxDisp = 0;
  for (let i = 0; i < fd.length; i++) {
    if (fd[i] > maxDisp) maxDisp = fd[i];
  }

  const bands = compact
    ? [
        { name: "LOW  20-250", lo: 20, hi: 250 },
        { name: "MID  250-2k", lo: 250, hi: 2000 },
        { name: "HIGH 2k-16k", lo: 2000, hi: 16000 },
      ]
    : [
        { name: "SUB  20-60", lo: 20, hi: 60 },
        { name: "LOW  60-250", lo: 60, hi: 250 },
        { name: "MID  250-500", lo: 250, hi: 500 },
        { name: "UPPER 500-2k", lo: 500, hi: 2000 },
        { name: "HIGH 2k-8k", lo: 2000, hi: 8000 },
        { name: "PRESENCE 8k-16k", lo: 8000, hi: 16000 },
      ];

  const headerLines = compact ? 1 : 2;
  const audioLines = compact ? 4 : 5;
  const textColW = compact ? 170 : 210;
  const bandLabelW = compact ? 68 : 84;

  let showBands = drawH >= (isPortraitPhone ? 200 : compact ? 260 : 380);
  const bandHeightTotal = showBands
    ? bands.length * (bandHeight + bandGap) - bandGap
    : 0;
  const textH = (headerLines + audioLines) * lineH;
  const bandsH = showBands ? lineH + bandHeightTotal : 0;

  // 常にsideLayout（数値左 + バンド右）を使用
  const useSideLayout = true;

  // sideLayout の高さ（数値とバンドの同じ高さ、SYS テキスト用スペース含む）
  const sideBoxH = padding * 2 + Math.max(textH, bandsH);

  // 幅：全画面幅を使用（Monitor 枠をなるべく小さく）
  const boxW = W - 24;

  let boxH = sideBoxH;
  let finalBoxH = boxH;

  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.strokeStyle = state.settings.rainbow
    ? `hsl(${hue}, 80%, 60%)`
    : state.settings.fixedColor;
  ctx.lineWidth = 2;
  ctx.fillRect(boxX, boxY, boxW, finalBoxH);
  ctx.strokeRect(boxX, boxY, boxW, finalBoxH);

  ctx.font = `${compact ? 11 : 12}px monospace`;
  let y = boxY + padding + (compact ? 10 : 11);

  ctx.fillStyle = "#4fc3f7";
  ctx.fillText("◆ MONITOR", boxX + padding, y);
  if (!compact) {
    ctx.fillStyle = "#bbb";
    ctx.fillText("AUDIO ANALYSIS", boxX + padding + 75, y);
  }
  y += lineH;

  ctx.fillStyle = "#fff";
  const peakColor =
    maxRaw < 100 ? "#4fc3f7" : maxRaw < 180 ? "#fff" : "#ff6b6b";
  ctx.fillStyle = peakColor;
  ctx.fillText(`PEAK: ${maxRaw}/255  dB: ${dbDisplay}dB`, boxX + padding, y);
  y += lineH;
  ctx.fillStyle = "#fff";
  ctx.fillText(
    `RMS: ${(rms * 100).toFixed(1)}%  Crest: ${crestFactor}`,
    boxX + padding,
    y,
  );
  y += lineH;
  ctx.fillText(`Spectrum: ${spectralCentroid}Hz`, boxX + padding, y);
  y += lineH;
  ctx.fillText(`PEAK freq: ${peakFreq || "N/A"}Hz`, boxX + padding, y);
  y += lineH;

  if (showBands) {
    if (useSideLayout) {
      const bandX = boxX + padding + textColW;
      let yB = boxY + padding + (compact ? 10 : 11);

      ctx.fillStyle = "#4fc3f7";
      ctx.fillText("◆ FREQ BANDS", bandX, yB);
      yB += lineH;

      for (let i = 0; i < bands.length; i++) {
        const b = bands[i];
        let bandVal = 0,
          bandCount = 0;
        if (hasRaw) {
          const bLo = Math.max(
            startIdx,
            Math.min(freqToIdx(b.lo), state.freqData.length - 1),
          );
          const bHi = Math.max(
            bLo + 1,
            Math.min(freqToIdx(b.hi), state.freqData.length),
          );
          let s = 0;
          for (let k = bLo; k < bHi; k++) {
            s += state.freqData[k];
            bandCount++;
          }
          bandVal = s / Math.max(1, bandCount);
        }
        ctx.fillStyle = "#bbb";
        ctx.fillText(b.name, bandX, yB + bandHeight - 1);
        const barX = bandX + bandLabelW;
        const barW = Math.max(40, boxX + boxW - padding - barX);
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(barX, yB, barW, bandHeight);
        const w = (bandVal / 255) * barW;
        const bandRatio = bandVal / 255;
        const bandColor =
          bandRatio < 0.3
            ? "#4fc3f7"
            : bandRatio < 0.6
              ? "#00d084"
              : bandRatio < 0.8
                ? "#ffd700"
                : "#ff6b6b";
        ctx.fillStyle = bandColor;
        ctx.fillRect(barX, yB, w, bandHeight);
        yB += bandHeight + bandGap;
      }
    } else {
      ctx.fillStyle = "#4fc3f7";
      ctx.fillText("◆ FREQ BANDS", boxX + padding, y);
      y += lineH;

      for (let i = 0; i < bands.length; i++) {
        const b = bands[i];
        let bandVal = 0,
          bandCount = 0;
        if (hasRaw) {
          const bLo = Math.max(
            startIdx,
            Math.min(freqToIdx(b.lo), state.freqData.length - 1),
          );
          const bHi = Math.max(
            bLo + 1,
            Math.min(freqToIdx(b.hi), state.freqData.length),
          );
          let s = 0;
          for (let k = bLo; k < bHi; k++) {
            s += state.freqData[k];
            bandCount++;
          }
          bandVal = s / Math.max(1, bandCount);
        }
        ctx.fillStyle = "#bbb";
        ctx.fillText(b.name, boxX + padding, y + bandHeight - 1);
        const barX = boxX + padding + (compact ? 92 : 100);
        const barW = boxW - padding * 2 - (compact ? 92 : 100);
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(barX, y, barW, bandHeight);
        const w = (bandVal / 255) * barW;
        const bandRatio = bandVal / 255;
        const bandColor =
          bandRatio < 0.3
            ? "#4fc3f7"
            : bandRatio < 0.6
              ? "#00d084"
              : bandRatio < 0.8
                ? "#ffd700"
                : "#ff6b6b";
        ctx.fillStyle = bandColor;
        ctx.fillRect(barX, y, w, bandHeight);
        y += bandHeight + bandGap;
      }
    }
  }
}
function drawHexagon(fd, drawH, drawStartY) {
  const cx = W / 2,
    cy = drawStartY + drawH / 2;
  const maxR = Math.min(W, drawH) * 0.4;
  const layers = 10;
  for (let i = 0; i < layers; i++) {
    const idx = Math.floor((i / layers) * fd.length);
    const v = fd[idx] / 255;
    const r = ((i + 1) / layers) * maxR * (1 + v * 0.5);
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const angle =
        (j * Math.PI) / 3 +
        (i % 2 ? 0 : Math.PI / 6) +
        Date.now() * 0.0002 * (i + 1);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = getColor(idx, v, fd.length);
    ctx.lineWidth = (2 + v * 5) * renderPixelScale;
    ctx.stroke();
  }
}
function drawMirrorBars(fd, maxH, drawH, drawStartY) {
  const n = fd.length;
  const px = renderPixelScale;
  const bw = W / n;
  const inset = Math.max(0.5, px);
  const cy = drawStartY + drawH / 2;
  for (let i = 0; i < n; i++) {
    const v = fd[i] / 255;
    const h = v * maxH * 0.5;
    const color = getColor(i, v, n);
    ctx.fillStyle = color;
    ctx.fillRect(i * bw + inset, cy - h, Math.max(0.5, bw - inset * 2), h);
    ctx.fillRect(i * bw + inset, cy, Math.max(0.5, bw - inset * 2), h);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // 初回翻訳
  await initI18n();
  updateLanguageUI();
  init().catch((err) => {
    console.error("Init failed:", err);
  });
});

if (!window.__audioVisualizerBgGuardInstalled) {
  window.__audioVisualizerBgGuardInstalled = true;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // 非表示中は描画ループを完全に止める
      if (typeof stopRenderLoop === "function") stopRenderLoop();
      return;
    }

    // 復帰時は数フレーム描いて状態を同期する
    if (typeof invalidateRender === "function") invalidateRender(3);

    if (
      typeof syncNativeMediaNotification === "function" &&
      typeof state !== "undefined" &&
      state.isPlaying
    ) {
      syncNativeMediaNotification(false);
    }

    if (typeof updateMediaSessionMetadata === "function") {
      updateMediaSessionMetadata();
    }
  });
}

// 設定スライダー・セレクト・ボタン操作で停止中でも即座に描き直す。
// （停止中はrAFを止めているため、明示的な再描画要求が必要）
if (!window.__audioVisualizerRenderInvalidationInstalled) {
  window.__audioVisualizerRenderInvalidationInstalled = true;
  const invalidate = () => {
    // 設定モーダル内の変更は下書きなので、閉じる/保存するまで再描画しない
    if (typeof state !== "undefined" && state.settingsOpen) return;
    if (typeof invalidateRender === "function") invalidateRender(2);
  };
  document.addEventListener("input", invalidate, true);
  document.addEventListener("change", invalidate, true);
  document.addEventListener("click", invalidate, true);
}

(() => {
  if (window.__layoutViewportFixInstalled) return;
  window.__layoutViewportFixInstalled = true;

  const updateViewportLayout = () => {
    const vv = window.visualViewport;
    const width = Math.max(
      1,
      Math.round(
        (vv && vv.width) ||
          window.innerWidth ||
          document.documentElement.clientWidth ||
          0,
      ),
    );
    const height = Math.max(
      1,
      Math.round(
        (vv && vv.height) ||
          window.innerHeight ||
          document.documentElement.clientHeight ||
          0,
      ),
    );

    document.documentElement.style.setProperty("--app-width", `${width}px`);
    document.documentElement.style.setProperty("--app-height", `${height}px`);

    const cv = document.getElementById("cv");
    if (cv) {
      // 解像度は applyCanvasResolution に一任する（DPR上限と自動品質調整を反映）
      if (typeof applyCanvasResolution === "function") {
        applyCanvasResolution();
      } else {
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        cv.width = Math.round(width * dpr);
        cv.height = Math.round(height * dpr);
        cv.style.width = "100%";
        cv.style.height = "100%";
      }
    }

    const video = document.getElementById("videoContainer");
    if (video && !video.classList.contains("background-mode")) {
      video.style.left = "50%";
      video.style.transform = "translateX(-50%) translateZ(0)";
    }
  };

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(updateViewportLayout, 80);
  };

  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  window.addEventListener("pageshow", schedule);
  document.addEventListener("DOMContentLoaded", schedule, { once: true });

  schedule();
})();
