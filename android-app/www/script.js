/**
 * Audio Visualizer Pro V7
 * - Removed YouTube
 * - Improved Input Source Switching (File / Mic)
 * - Microphone Device Selection
 */

// Google Drive integration removed for F‑Droid packaging

// ============== STATE ==============
const state = {
    playlist: [],
    currentIndex: -1,
    addedOrderCounter: 0,  // プレイリストに追加された順序を追跡
    isPlaying: false,
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
    lastAudioTime: 0,  // シーク検出用
    playRequestId: 0,

    // Input Source
    inputSource: 'file', // 'file' or 'mic'
    micStream: null,
    micDeviceId: '',

    // Audio nodes
    audioCtx: null,
    analyser: null,
    source: null,      // Current active source
    fileSource: null,  // MediaElementSource
    micSource: null,   // MediaStreamSource
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

    // GPU rendering
    gpuRenderer: null,
    gpuAvailable: false,

    // Settings
    settings: {
        smoothing: 0.7,
        sensitivity: 1.8,
        barCount: 64,
        lowFreq: 20,
        highFreq: 16000,
        glowStrength: 20,
        fftSize: 2048,
        opacity: 1.0,
        bgBlur: 0,
        mirror: false,
        rainbow: true,
        fixedColor: '#4facfe',
        showLabels: true,
        persistSettings: true,
        lowPowerMode: false,
        targetFps: 60,
        showVideo: true,
        videoMode: 'window', // 'window' or 'background'
        videoFitMode: 'cover', // 'cover', 'contain', 'fill'
        repeatMode: 'none',  // 'none', 'one', 'all'
        shuffle: false,
        eq: [0, 0, 0, 0, 0, 0, 0, 0],
        playbackRate: 1.0,
        balance: 0,
        autoPlayNext: true,
        stopOnVideoEnd: false,
        storeLocalFiles: false,
        // New visualization settings
        changeMode: 'off', // 'off' | 'plus' | 'plusminus'
        sandMode: false,
        sandFallRate: 0.6, // per second
        circleAngleOffset: 0,
        // GPU rendering settings
        renderMode: 'auto', // 'auto', 'gpu', 'cpu'
        // UI auto-hide settings
        autoHideUI: true,
        // Android: 最後に選択したパス
        lastSelectedPath: '',
        // Volume persistence
        volume: 1.0,
        // 言語設定
        language: 'ja'
    }
};

// ==========================================================================
// 多言語対応 (i18n) 完全版翻訳辞書データ
// ==========================================================================
const I18N = {
    ja: {
        // ステータス・再生情報
        "status.waiting": "🎵 待機中...",
        "next.none": "次: --",
        "next.track": "次: {name}",
        "status.loading": "⏳ 読み込み中...",

        // トップバー コントロール
        "tooltip.fileMode": "ファイル再生モード",
        "aria.fileMode": "ファイル再生モード",
        "btn.modeFile": "📁 File",
        "tooltip.micMode": "マイク入力モード",
        "aria.micMode": "マイク入力モード",
        "btn.modeMic": "🎤 Mic",
        "btn.playlist": "プレイリスト",
        "aria.playlist": "プレイリストを開く",
        "btn.settings": "設定",
        "aria.settings": "設定を開く",

        // ボトムバー コントロール
        "aria.volume": "音量",
        "btn.shuffle": "シャッフル",
        "aria.shuffle": "シャッフル",
        "aria.prev": "前の曲",
        "aria.playPause": "再生/一時停止",
        "aria.next": "次の曲",
        "btn.repeat": "リピート",
        "aria.repeat": "リピート",
        "btn.export": "動画書き出し",
        "aria.export": "動画を書き出す",

        // ビデオレイヤー
        "btn.close": "閉じる",
        "btn.bgToggle": "背景切替",
        "aria.closeVideo": "動画を閉じる",
        "aria.toggleVideo": "動画表示モードを切り替える",

        // プレイリスト パネル
        "playlist.title": "プレイリスト",
        "btn.clearAll": "すべて削除",
        "aria.clearAll": "プレイリストをすべて削除",
        "btn.addFile": "ファイル追加",
        "aria.addFile": "ファイルを追加",
        "aria.closePlaylist": "プレイリストを閉じる",
        "playlist.search": "曲名で検索...",
        "playlist.empty": "曲を追加してください",

        // 常時表示コントロール
        "btn.toggleUI": "UI表示切替 (H)",
        "aria.toggleUI": "UI表示を切り替える",

        // 設定モーダル共通
        "settings.title": "設定",
        "tab.display": "表示",
        "tab.audio": "音声/入力",
        "tab.player": "プレーヤー",
        "tab.help": "ヘルプ",
        "tab.developer": "開発者より",
        "btn.resetAll": "初期化",
        "btn.saveClose": "保存して閉じる",

        // 設定：システムセクション
        "section.system": "システム / System",
        "label.language": "言語 / Language",

        // 設定：表示タブ
        "section.displayTuning": "表示チューニング",
        "label.smoothing": "スムージング (滑らかさ)",
        "label.sensitivity": "感度 (Sensitivity)",
        "label.fftQuality": "ビジュアライザー品質（FFT）",
        "opt.fftLight": "省電力 (軽量)",
        "opt.fftBalance": "バランス",
        "opt.fftHigh": "高精細",
        "opt.fftUltra": "超精細",
        "hint.fft": "※ 品質が高いほどCPU負荷が増えます。バー本数も自動調整します。",
        "label.barCount": "バーの本数",
        "label.fps": "フレームレート (FPS)",
        "opt.fps30": "30 FPS (省電力)",
        "opt.fps60": "60 FPS (標準)",
        "opt.fps120": "120 FPS (高品質)",
        "opt.fpsMax": "無制限 (MAX)",
        "label.renderMode": "レンダリングモード",
        "opt.renderAuto": "自動 (Auto)",
        "opt.renderGpu": "GPU優先",
        "opt.renderCpu": "CPU (互換性重視)",
        "section.quickSettings": "クイック設定",
        "label.autoHideUI": "UI自動非表示",
        "label.showVideo": "動画を表示 (動画ファイル時)",
        "label.videoMode": "動画表示モード",
        "opt.videoWindow": "ウィンドウ (移動可能)",
        "opt.videoBg": "背景 (全画面)",
        "label.videoFitMode": "背景表示時のフィットモード",
        "opt.fitCover": "画面を埋める (cover)",
        "opt.fitContain": "全体を表示 (contain)",
        "opt.fitFill": "引き伸ばす (fill)",
        "label.showFreq": "周波数ラベルを表示",
        "label.glow": "発光強度 (Glow)",
        "label.opacity": "ビジュアライザー不透明度",
        "label.changeMode": "変化モード (Change)",
        "opt.changeNormal": "通常",
        "opt.changePlus": "増分のみ",
        "opt.changeUpDown": "上下変化",
        "label.sandMode": "砂モード (Bars/Circle)",
        "label.sandRate": "砂の落下速度",
        "label.circleAngle": "円形バー角度補正",
        "btn.reset0": "0° にリセット",
        "label.mirrorMode": "左右反転 (Mirror)",
        "label.rainbowMode": "虹色モード (Rainbow)",
        "label.fixedColor": "固定色",
        "label.bgBlur": "背景ぼかし (Blur)",
        "label.bgBlurHint": "(※背景表示時のみ適用)",

        // 設定：音声/入力タブ
        "label.micDevice": "マイク入力デバイス",
        "opt.micDefault": "デフォルト",
        "label.freqRange": "周波数範囲 (Low - High)",
        "label.freqPreset": "音域プリセット",
        "opt.freqStandard": "標準 (20-16kHz)",
        "opt.freqFull": "フル (20-20kHz)",
        "opt.freqVoice": "ボイス (100-8kHz)",
        "opt.freqBass": "バス (20-4kHz)",
        "opt.freqCustom": "カスタム",
        "label.equalizer": "イコライザー (EQ)",
        "eq.flat": "フラット",
        "btn.resetEq": "EQリセット",

        // 設定：プレーヤータブ
        "label.resourceMonitor": "📊 リソースモニター",
        "res.fps": "FPS:",
        "res.memory": "メモリ:",
        "res.rendering": "レンダリング:",
        "label.balance": "音楽の重心 (L/R)",
        "btn.resetCenter": "中央にリセット",
        "label.autoPlayNext": "自動で次の曲を再生",
        "label.stopOnVideoEnd": "動画終了時に停止 (動画優先)",
        "label.persistSettings": "設定をブラウザに保存する",
        "label.playbackSpeed": "再生速度",
        "opt.speedNormal": "1.0x (通常)",
        "label.sleepTimer": "スリープタイマー",
        "btn.sleep15": "15分",
        "btn.sleep30": "30分",
        "btn.sleep45": "45分",
        "btn.sleep60": "1時間",
        "btn.sleep90": "1.5時間",

        // 設定：プリセットタブ
        "label.colorPresets": "カラープリセット",
        "label.settingPresets": "設定プリセット (保存/読込)",
        "btn.saveSlot1": "Slot 1 保存",
        "btn.loadSlot1": "Slot 1 読込",
        "btn.saveSlot2": "Slot 2 保存",
        "btn.loadSlot2": "Slot 2 読込",
        "btn.saveSlot3": "Slot 3 保存",
        "btn.loadSlot3": "Slot 3 読込",

        // 設定：ストレージタブ
        "label.storeLocalFiles": "ファイルをアプリ内に保存する（容量を使用）",
        "hint.storeLocalFiles": "有効時: 取り込んだファイルをアプリ内に保持。無効時: URI参照のみで保存しません。",
        "btn.refresh": "🔄 更新",
        "btn.deleteAll": "🗑️ すべて削除",

        // 設定：ヘルプタブ
        "help.shortcuts": "キーボードショートカット",
        "shortcut.play": "再生 / 一時停止",
        "shortcut.prevNext": "前の曲 / 次の曲",
        "shortcut.volume": "音量アップ / ダウン",
        "shortcut.speed": "再生速度ダウン / アップ",
        "shortcut.toggleUI": "UI表示切替",
        "shortcut.toggleVideo": "動画表示切替",
        "shortcut.powerSave": "低電力モード切替",
        "shortcut.shuffle": "シャッフル切替",
        "shortcut.repeat": "リピート切替",
        "shortcut.visualizer": "ビジュアライザーモード切替",
        "shortcut.rainbow": "虹色モード切替",
        "shortcut.mirror": "左右反転切替",
        
        "overlay.seekBack": "⏪ 巻き戻し",
        "overlay.seekForward": "⏩ 早送り",
        "overlay.videoLoadFailed": "動画の読み込みに失敗しました",
        "overlay.videoEnded": "動画が終了しました",
        "overlay.languageChangedJa": "言語を日本語に変更しました",
        "overlay.languageChangedEn": "言語を英語に変更しました",
        "overlay.languageChangedZh": "言語を中国語に変更しました",
        "confirm.resetAll": "すべての設定を初期化しますか？",
        "confirm.clearPlaylist": "プレイリストを空にしますか？",
        "status.idle": "🎵 待機中...",
        "common.unknown": "不明",
        "overlay.playlistCleared": "プレイリストを消去しました",
        "overlay.videoOn": "動画表示をオンにしました",
        "overlay.videoOff": "動画表示をオフにしました",
        "overlay.rainbowOn": "虹色モードをオンにしました",
        "overlay.rainbowOff": "虹色モードをオフにしました",
        "overlay.mirrorOn": "左右反転をオンにしました",
        "overlay.mirrorOff": "左右反転をオフにしました",
        "alert.filePickerMissing": "この環境ではファイル選択機能を利用できません",
        "overlay.noFileSelected": "ファイルが選択されませんでした",
        "overlay.fileSelectFailed": "ファイルの選択に失敗しました",
        "overlay.androidOnly": "この機能は Android 版でのみ利用できます",
        "overlay.selectFolder": "フォルダを選択してください",
        "overlay.filesAdded": "ファイルが追加されました",
        "overlay.folderNoFiles": "フォルダ内に読み込めるファイルが見つかりません",
        "overlay.nowPlaying": "再生中: {title}",
        "playlist.restored": "プレイリストを復元しました",
        "overlay.centerReset": "音声の重心を中央に戻しました",
        "confirm.switchUriMode": "URI モードに切り替えますか？",
        "overlay.localSaveOn": "端末内保存をオンにしました",
        "overlay.localSaveOff": "端末内保存をオフにしました",
        "overlay.loadFailed": "読み込みに失敗しました",
        "overlay.settingsSaved": "設定を保存しました",
        "devMessage.loadFailed": "開発者メッセージの読み込みに失敗しました",
        "status.mic": "🎤 マイク入力中",
        "overlay.micStarted": "マイク入力モードに切り替えました",
        "overlay.deleteNone": "削除する項目がありません",
        "confirm.deleteStoredFiles": "保存済みファイルをすべて削除しますか？",
        "overlay.allDeleted": "すべて削除しました",
        "storage.empty": "保存データはありません",
        "overlay.playlistReordered": "プレイリストの順番を変更しました",
        "overlay.sleepStopped": "スリープタイマーで停止しました",
        "alert.exportBlockedMic": "マイク入力中は動画を書き出せません",
        "confirm.exportVideo": "動画を書き出しますか？",
        "overlay.exporting": "動画を書き出し中...",
        "alert.exportComplete": "書き出しが完了しました",
        "common.unsupported": "非対応",
        "status.playError": "🎵 再生エラー",
        "overlay.audioError": "音声エラーが発生しました",
        "overlay.playFailed": "再生に失敗しました",
        "overlay.urlPrepareFailed": "URL の準備に失敗しました",
        "repeat.none": "なし",
        "repeat.one": "1 曲",
        "repeat.all": "全曲",
        "overlay.mode": "モード: {mode}",
        "version.prefix": "バージョン"
    },
    en: {
        "status.waiting": "🎵 Waiting...",
        "next.none": "Next: --",
        "next.track": "Next: {name}",
        "status.loading": "⏳ Loading...",
        "tooltip.fileMode": "File Playback Mode",
        "aria.fileMode": "File Playback Mode",
        "btn.modeFile": "📁 File",
        "tooltip.micMode": "Microphone Input Mode",
        "aria.micMode": "Microphone Input Mode",
        "btn.modeMic": "🎤 Mic",
        "btn.playlist": "Playlist",
        "aria.playlist": "Open Playlist",
        "btn.settings": "Settings",
        "aria.settings": "Open Settings",
        "aria.volume": "Volume",
        "btn.shuffle": "Shuffle",
        "aria.shuffle": "Shuffle",
        "aria.prev": "Previous Track",
        "aria.playPause": "Play/Pause",
        "aria.next": "Next Track",
        "btn.repeat": "Repeat",
        "aria.repeat": "Repeat",
        "btn.export": "Export Video",
        "aria.export": "Export Video",
        "btn.close": "Close",
        "btn.bgToggle": "Toggle BG",
        "aria.closeVideo": "Close Video",
        "aria.toggleVideo": "Toggle Video Display Mode",
        "playlist.title": "Playlist",
        "btn.clearAll": "Clear All",
        "aria.clearAll": "Clear all tracks from playlist",
        "btn.addFile": "Add File",
        "aria.addFile": "Add files",
        "aria.closePlaylist": "Close Playlist",
        "playlist.search": "Search by title...",
        "playlist.empty": "Please add some tracks",
        "btn.toggleUI": "Toggle UI (H)",
        "aria.toggleUI": "Toggle UI Display",
        "settings.title": "Settings",
        "tab.display": "Display",
        "tab.audio": "Audio/Input",
        "tab.player": "Player",
        "tab.help": "Help",
        "tab.developer": "Developer",
        "btn.resetAll": "Reset All",
        "btn.saveClose": "Save & Close",
        "section.system": "System",
        "label.language": "Language",
        "section.displayTuning": "Display Tuning",
        "label.smoothing": "Smoothing",
        "label.sensitivity": "Sensitivity",
        "label.fftQuality": "Visualizer Quality (FFT)",
        "opt.fftLight": "Power Saving (Light)",
        "opt.fftBalance": "Balanced",
        "opt.fftHigh": "High Definition",
        "opt.fftUltra": "Ultra Definition",
        "hint.fft": "* Higher quality increases CPU load. Bar count adjusts automatically.",
        "label.barCount": "Number of Bars",
        "label.fps": "Frame Rate (FPS)",
        "opt.fps30": "30 FPS (Power Saving)",
        "opt.fps60": "60 FPS (Standard)",
        "opt.fps120": "120 FPS (High Quality)",
        "opt.fpsMax": "Unlimited (MAX)",
        "label.renderMode": "Rendering Mode",
        "opt.renderAuto": "Auto",
        "opt.renderGpu": "GPU Priority",
        "opt.renderCpu": "CPU (Compatibility Mode)",
        "section.quickSettings": "Quick Settings",
        "label.autoHideUI": "Auto-hide UI",
        "label.showVideo": "Show Video (When video file loaded)",
        "label.videoMode": "Video Display Mode",
        "opt.videoWindow": "Window (Movable)",
        "opt.videoBg": "Background (Fullscreen)",
        "label.videoFitMode": "Background Fit Mode",
        "opt.fitCover": "Cover Screen",
        "opt.fitContain": "Show Entire Video",
        "opt.fitFill": "Stretch to Fill",
        "label.showFreq": "Show Frequency Labels",
        "label.glow": "Glow Strength",
        "label.opacity": "Visualizer Opacity",
        "label.changeMode": "Change Mode",
        "opt.changeNormal": "Normal",
        "opt.changePlus": "Increase Only",
        "opt.changeUpDown": "Up/Down Change",
        "label.sandMode": "Sand Mode (Bars/Circle)",
        "label.sandRate": "Sand Fall Speed",
        "label.circleAngle": "Circle Angle Offset",
        "btn.reset0": "Reset to 0°",
        "label.mirrorMode": "Mirror Mode",
        "label.rainbowMode": "Rainbow Mode",
        "label.fixedColor": "Fixed Color",
        "label.bgBlur": "Background Blur",
        "label.bgBlurHint": "(* Only applies when background is visible)",
        "label.micDevice": "Microphone Device",
        "opt.micDefault": "Default",
        "label.freqRange": "Frequency Range (Low - High)",
        "label.freqPreset": "Frequency Preset",
        "opt.freqStandard": "Standard (20-16kHz)",
        "opt.freqFull": "Full Range (20-20kHz)",
        "opt.freqVoice": "Vocal (100-8kHz)",
        "opt.freqBass": "Bass (20-4kHz)",
        "opt.freqCustom": "Custom",
        "label.equalizer": "Equalizer (EQ)",
        "eq.flat": "Flat",
        "btn.resetEq": "Reset EQ",
        "label.resourceMonitor": "📊 Resource Monitor",
        "res.fps": "FPS:",
        "res.memory": "Memory:",
        "res.rendering": "Rendering:",
        "label.balance": "Audio Balance (L/R)",
        "btn.resetCenter": "Reset to Center",
        "label.autoPlayNext": "Auto-play Next Track",
        "label.stopOnVideoEnd": "Stop Track when Video Ends",
        "label.persistSettings": "Save Settings to Browser",
        "label.playbackSpeed": "Playback Speed",
        "opt.speedNormal": "1.0x (Normal)",
        "label.sleepTimer": "Sleep Timer",
        "btn.sleep15": "15 Min",
        "btn.sleep30": "30 Min",
        "btn.sleep45": "45 Min",
        "btn.sleep60": "1 Hour",
        "btn.sleep90": "1.5 Hours",
        "label.colorPresets": "Color Presets",
        "label.settingPresets": "Setting Presets (Save/Load)",
        "btn.saveSlot1": "Save Slot 1",
        "btn.loadSlot1": "Load Slot 1",
        "btn.saveSlot2": "Save Slot 2",
        "btn.loadSlot2": "Load Slot 2",
        "btn.saveSlot3": "Save Slot 3",
        "btn.loadSlot3": "Load Slot 3",
        "label.storeLocalFiles": "Store Files in App (Uses Storage)",
        "hint.storeLocalFiles": "Enabled: Keeps imported files inside the app. Disabled: References by URI only.",
        "btn.refresh": "🔄 Refresh",
        "btn.deleteAll": "🗑️ Delete All",
        "help.shortcuts": "Keyboard Shortcuts",
        "shortcut.play": "Play / Pause",
        "shortcut.prevNext": "Previous / Next Track",
        "shortcut.volume": "Volume Up / Down",
        "shortcut.speed": "Playback Speed Down / Up",
        "shortcut.toggleUI": "Toggle UI Display",
        "shortcut.toggleVideo": "Toggle Video Display",
        "shortcut.powerSave": "Toggle Power Saving Mode",
        "shortcut.shuffle": "Toggle Shuffle",
        "shortcut.repeat": "Toggle Repeat",
        "shortcut.visualizer": "Toggle Visualizer Mode",
        "shortcut.rainbow": "Toggle Rainbow Mode",
        "shortcut.mirror": "Toggle Mirror Mode",

        "overlay.seekBack": "⏪ Seek Back",
        "overlay.seekForward": "⏩ Seek Forward",
        "overlay.videoLoadFailed": "Failed to load video",
        "overlay.videoEnded": "Video ended",
        "overlay.languageChangedJa": "Language changed to Japanese",
        "overlay.languageChangedEn": "Language changed to English",
        "overlay.languageChangedZh": "Language changed to Chinese",
        "confirm.resetAll": "Reset all settings?",
        "confirm.clearPlaylist": "Clear the playlist?",
        "status.idle": "🎵 Idle...",
        "common.unknown": "Unknown",
        "overlay.playlistCleared": "Playlist cleared",
        "overlay.videoOn": "Video display turned on",
        "overlay.videoOff": "Video display turned off",
        "overlay.rainbowOn": "Rainbow mode turned on",
        "overlay.rainbowOff": "Rainbow mode turned off",
        "overlay.mirrorOn": "Mirror mode turned on",
        "overlay.mirrorOff": "Mirror mode turned off",
        "alert.filePickerMissing": "File picker is not available in this environment",
        "overlay.noFileSelected": "No file was selected",
        "overlay.fileSelectFailed": "Failed to select file",
        "overlay.androidOnly": "This feature is available only on Android",
        "overlay.selectFolder": "Please select a folder",
        "overlay.filesAdded": "Files added",
        "overlay.folderNoFiles": "No playable files were found in the folder",
        "overlay.nowPlaying": "Now playing: {title}",
        "playlist.restored": "Playlist restored",
        "overlay.centerReset": "Audio balance reset to center",
        "confirm.switchUriMode": "Switch to URI mode?",
        "overlay.localSaveOn": "Local file storage enabled",
        "overlay.localSaveOff": "Local file storage disabled",
        "overlay.loadFailed": "Failed to load",
        "overlay.settingsSaved": "Settings saved",
        "devMessage.loadFailed": "Failed to load developer message",
        "status.mic": "🎤 Microphone input",
        "overlay.micStarted": "Switched to microphone input mode",
        "overlay.deleteNone": "Nothing to delete",
        "confirm.deleteStoredFiles": "Delete all stored files?",
        "overlay.allDeleted": "All deleted",
        "storage.empty": "No stored data",
        "overlay.playlistReordered": "Playlist reordered",
        "overlay.sleepStopped": "Stopped by sleep timer",
        "alert.exportBlockedMic": "Cannot export video while using microphone input",
        "confirm.exportVideo": "Export the video?",
        "overlay.exporting": "Exporting video...",
        "alert.exportComplete": "Export completed",
        "common.unsupported": "Unsupported",
        "status.playError": "🎵 Playback error",
        "overlay.audioError": "An audio error occurred",
        "overlay.playFailed": "Playback failed",
        "overlay.urlPrepareFailed": "Failed to prepare URL",
        "repeat.none": "None",
        "repeat.one": "One track",
        "repeat.all": "All tracks",
        "overlay.mode": "Mode: {mode}",
        "version.prefix": "Version"
    },
    zh: {
        "status.waiting": "🎵 等待中...",
        "next.none": "下一首: --",
        "next.track": "下一首: {name}",
        "status.loading": "⏳ 加载中...",
        "tooltip.fileMode": "文件播放模式",
        "aria.fileMode": "文件播放模式",
        "btn.modeFile": "📁 文件",
        "tooltip.micMode": "麦克风输入模式",
        "aria.micMode": "麦克风输入模式",
        "btn.modeMic": "🎤 麦克风",
        "btn.playlist": "播放列表",
        "aria.playlist": "打开播放列表",
        "btn.settings": "设置",
        "aria.settings": "打开设置",
        "aria.volume": "音量",
        "btn.shuffle": "随机播放",
        "aria.shuffle": "随机播放",
        "aria.prev": "上一首",
        "aria.playPause": "播放/暂停",
        "aria.next": "下一首",
        "btn.repeat": "循环播放",
        "aria.repeat": "循环播放",
        "btn.export": "导出视频",
        "aria.export": "导出视频",
        "btn.close": "关闭",
        "btn.bgToggle": "切换背景",
        "aria.closeVideo": "关闭视频",
        "aria.toggleVideo": "切换视频显示模式",
        "playlist.title": "播放列表",
        "btn.clearAll": "清空列表",
        "aria.clearAll": "清空播放列表中的所有曲目",
        "btn.addFile": "添加文件",
        "aria.addFile": "添加文件",
        "aria.closePlaylist": "关闭播放列表",
        "playlist.search": "按搜索曲名...",
        "playlist.empty": "请添加曲目",
        "btn.toggleUI": "切换UI显示 (H)",
        "aria.toggleUI": "切换UI显示",
        "settings.title": "设置",
        "tab.display": "显示",
        "tab.audio": "音频/输入",
        "tab.player": "播放器",
        "tab.help": "帮助",
        "tab.developer": "关于开发者",
        "btn.resetAll": "重置全部",
        "btn.saveClose": "保存并关闭",
        "section.system": "系统设置",
        "label.language": "语言 / Language",
        "section.displayTuning": "画面微调",
        "label.smoothing": "平滑度 (Smoothing)",
        "label.sensitivity": "灵敏度 (Sensitivity)",
        "label.fftQuality": "频谱精细度 (FFT)",
        "opt.fftLight": "省电 (轻量)",
        "opt.fftBalance": "平衡",
        "opt.fftHigh": "高精细",
        "opt.fftUltra": "超精细",
        "hint.fft": "* 精细度越高，CPU负载越大。条形图数量会自动调整。",
        "label.barCount": "频谱条数量",
        "label.fps": "帧率 (FPS)",
        "opt.fps30": "30 FPS (省电)",
        "opt.fps60": "60 FPS (标准)",
        "opt.fps120": "120 FPS (高质量)",
        "opt.fpsMax": "无限制 (MAX)",
        "label.renderMode": "渲染模式",
        "opt.renderAuto": "自动 (Auto)",
        "opt.renderGpu": "GPU 优先",
        "opt.renderCpu": "CPU (兼容模式)",
        "section.quickSettings": "快捷设置",
        "label.autoHideUI": "自动隐藏 UI",
        "label.showVideo": "显示视频 (仅限视频文件)",
        "label.videoMode": "视频显示模式",
        "opt.videoWindow": "窗口 (可移动)",
        "opt.videoBg": "背景 (全屏)",
        "label.videoFitMode": "背景填充模式",
        "opt.fitCover": "裁剪填充 (Cover)",
        "opt.fitContain": "完整显示 (Contain)",
        "opt.fitFill": "拉伸填充 (Fill)",
        "label.showFreq": "显示频率标签",
        "label.glow": "发光强度 (Glow)",
        "label.opacity": "可视化不透明度",
        "label.changeMode": "动态模式",
        "opt.changeNormal": "普通",
        "opt.changePlus": "仅单向增强",
        "opt.changeUpDown": "上下双向动态",
        "label.sandMode": "落砂效果 (Bars/Circle)",
        "label.sandRate": "落砂下落速度",
        "label.circleAngle": "圆环角度修正",
        "btn.reset0": "重置为 0°",
        "label.mirrorMode": "左右翻转 (Mirror)",
        "label.rainbowMode": "彩虹渐变 (Rainbow)",
        "label.fixedColor": "固定颜色",
        "label.bgBlur": "背景模糊 (Blur)",
        "label.bgBlurHint": "(* 仅在背景视频可见时有效)",
        "label.micDevice": "麦克风设备",
        "opt.micDefault": "默认设备",
        "label.freqRange": "频率范围 (Low - High)",
        "label.freqPreset": "频段预设",
        "opt.freqStandard": "标准 (20-16kHz)",
        "opt.freqFull": "全频段 (20-20kHz)",
        "opt.freqVoice": "人声优化 (100-8kHz)",
        "opt.freqBass": "低音增强 (20-4kHz)",
        "opt.freqCustom": "自定义",
        "label.equalizer": "均衡器 (EQ)",
        "eq.flat": "平直",
        "btn.resetEq": "重置 EQ",
        "label.resourceMonitor": "📊 资源监视器",
        "res.fps": "FPS:",
        "res.memory": "内存占用:",
        "res.rendering": "渲染引擎:",
        "label.balance": "声道平衡 (L/R)",
        "btn.resetCenter": "恢复居中",
        "label.autoPlayNext": "自动播放下一首",
        "label.stopOnVideoEnd": "视频播放结束时停止曲目",
        "label.persistSettings": "将设置保存到浏览器",
        "label.playbackSpeed": "播放速度",
        "opt.speedNormal": "1.0x (正常)",
        "label.sleepTimer": "睡眠定时器",
        "btn.sleep15": "15 分钟",
        "btn.sleep30": "30 分钟",
        "btn.sleep45": "45 分钟",
        "btn.sleep60": "1 小时",
        "btn.sleep90": "1.5 小时",
        "label.colorPresets": "色彩预设",
        "label.settingPresets": "配置存档 (保存/加载)",
        "btn.saveSlot1": "保存至 槽位1",
        "btn.loadSlot1": "从 槽位1 加载",
        "btn.saveSlot2": "保存至 槽位2",
        "btn.loadSlot2": "从 槽位2 加载",
        "btn.saveSlot3": "保存至 槽位3",
        "btn.loadSlot3": "从 槽位3 加载",
        "label.storeLocalFiles": "将文件保存在本地应用内（占用设备空间）",
        "hint.storeLocalFiles": "开启：文件持久化保存。关闭：仅通过URI引用，不重复占用空间。",
        "btn.refresh": "🔄 刷新",
        "btn.deleteAll": "🗑️ 全部删除",
        "help.shortcuts": "键盘快捷键",
        "shortcut.play": "播放 / 暂停",
        "shortcut.prevNext": "上一首 / 下一首",
        "shortcut.volume": "音量 增大 / 减小",
        "shortcut.speed": "播放速度 减慢 / 加快",
        "shortcut.toggleUI": "切换 UI 显示",
        "shortcut.toggleVideo": "切换 视频显示",
        "shortcut.powerSave": "切换 低功耗模式",
        "shortcut.shuffle": "切换 随机播放",
        "shortcut.repeat": "切换 循环模式",
        "shortcut.visualizer": "切换 可视化样式",
        "shortcut.rainbow": "切换 彩虹渐变",
        "shortcut.mirror": "切换 左右翻转",

        "overlay.seekBack": "⏪ 后退",
        "overlay.seekForward": "⏩ 前进",
        "overlay.videoLoadFailed": "视频加载失败",
        "overlay.videoEnded": "视频已结束",
        "overlay.languageChangedJa": "语言已切换为日语",
        "overlay.languageChangedEn": "语言已切换为英语",
        "overlay.languageChangedZh": "语言已切换为中文",
        "confirm.resetAll": "要重置所有设置吗？",
        "confirm.clearPlaylist": "要清空播放列表吗？",
        "status.idle": "🎵 空闲中...",
        "common.unknown": "未知",
        "overlay.playlistCleared": "播放列表已清空",
        "overlay.videoOn": "已开启视频显示",
        "overlay.videoOff": "已关闭视频显示",
        "overlay.rainbowOn": "已开启彩虹模式",
        "overlay.rainbowOff": "已关闭彩虹模式",
        "overlay.mirrorOn": "已开启左右翻转",
        "overlay.mirrorOff": "已关闭左右翻转",
        "alert.filePickerMissing": "当前环境不支持文件选择器",
        "overlay.noFileSelected": "未选择文件",
        "overlay.fileSelectFailed": "文件选择失败",
        "overlay.androidOnly": "此功能仅在 Android 版可用",
        "overlay.selectFolder": "请选择文件夹",
        "overlay.filesAdded": "文件已添加",
        "overlay.folderNoFiles": "文件夹中没有可读取的文件",
        "overlay.nowPlaying": "正在播放: {title}",
        "playlist.restored": "播放列表已恢复",
        "overlay.centerReset": "已将声像重置为中心",
        "confirm.switchUriMode": "切换到 URI 模式吗？",
        "overlay.localSaveOn": "已开启本地保存",
        "overlay.localSaveOff": "已关闭本地保存",
        "overlay.loadFailed": "加载失败",
        "overlay.settingsSaved": "设置已保存",
        "devMessage.loadFailed": "开发者消息加载失败",
        "status.mic": "🎤 麦克风输入中",
        "overlay.micStarted": "已切换到麦克风输入模式",
        "overlay.deleteNone": "没有可删除的项目",
        "confirm.deleteStoredFiles": "要删除所有已保存文件吗？",
        "overlay.allDeleted": "已全部删除",
        "storage.empty": "没有保存的数据",
        "overlay.playlistReordered": "播放列表顺序已调整",
        "overlay.sleepStopped": "已因睡眠定时器停止",
        "alert.exportBlockedMic": "使用麦克风输入时无法导出视频",
        "confirm.exportVideo": "要导出视频吗？",
        "overlay.exporting": "正在导出视频...",
        "alert.exportComplete": "导出完成",
        "common.unsupported": "不支持",
        "status.playError": "🎵 播放错误",
        "overlay.audioError": "发生音频错误",
        "overlay.playFailed": "播放失败",
        "overlay.urlPrepareFailed": "URL 准备失败",
        "repeat.none": "无",
        "repeat.one": "单曲",
        "repeat.all": "全部",
        "overlay.mode": "模式: {mode}",
        "version.prefix": "版本"
    }
};

window.I18N = I18N;

let currentLang = localStorage.getItem('app_lang') || 
    (navigator.language.startsWith('zh') ? 'zh' : navigator.language.startsWith('en') ? 'en' : 'ja');

// ============== I18N FUNCTIONS ==============
// 指定されたキーの翻訳テキストを返す関数
function t(key, vars = {}) {
    if (!window.I18N) return key;
    let text;
    if (I18N[currentLang] && I18N[currentLang][key] !== undefined) {
        text = I18N[currentLang][key];
    } else if (I18N['ja'] && I18N['ja'][key] !== undefined) {
        text = I18N['ja'][key];
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
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translated = t(key);
        if (translated !== key) el.textContent = translated;
    });

    // 2. title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = t(key);
    });

    // 3. aria-label
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        el.setAttribute('aria-label', t(key));
    });

    // 4. placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });

    // 5. 設定モーダル内の動的要素も強制更新
    const modal = document.getElementById('settingsModal');
    if (modal && modal.classList.contains('open')) {
        modal.querySelectorAll('label, h2, h3, button, option, .tab-btn').forEach(el => {
            const key = el.getAttribute('data-i18n') || el.getAttribute('data-i18n-title');
            if (key) {
                const translated = t(key);
                if (translated !== key) {
                    if (el.tagName === 'OPTION' || el.tagName === 'BUTTON' || el.tagName === 'LABEL') {
                        el.textContent = translated;
                    }
                }
            }
        });
    }

    updateNextUpText(state.currentIndex);
    els.statusText.textContent = state.playlist[state.currentIndex] ? `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${state.playlist[state.currentIndex].name}` : t('status.idle');
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
let lastNativeMediaSync = { title: null, artist: null, isPlaying: null };

function getNativeMediaPlugin() {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaNotification) {
            return window.Capacitor.Plugins.MediaNotification;
        }
    } catch (e) {}
    return null;
}

async function ensureNativeMediaListener() {
    if (nativeMediaListenerInstalled) return;
    nativeMediaPlugin = getNativeMediaPlugin();
    if (!nativeMediaPlugin || !nativeMediaPlugin.addListener) return;

    try {
        await nativeMediaPlugin.addListener('command', (ev) => {
            const cmd = ev && ev.command;
            if (!cmd) return;
            if (cmd === 'play') {
                if (!state.isPlaying) togglePlay();
            } else if (cmd === 'pause') {
                if (state.isPlaying) togglePlay();
            } else if (cmd === 'next') {
                nextTrack();
            } else if (cmd === 'prev') {
                prevTrack();
            }
        });
        nativeMediaListenerInstalled = true;
    } catch (e) {
        // ignore
    }
}

function getCurrentTrackTitleArtist() {
    const track = state.playlist[state.currentIndex];
    if (!track) return { title: 'Audio Visualizer', artist: '' };

    let title = track.name || 'Unknown';
    let artist = 'Audio Visualizer';
    title = title.replace(/\.(mp3|m4a|wav|aac|mp4|webm|mkv|mov|ogg|flac|opus)$/i, '');
    if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
    }
    return { title, artist };
}

async function syncNativeMediaNotification(force = false) {
    nativeMediaPlugin = nativeMediaPlugin || getNativeMediaPlugin();
    if (!nativeMediaPlugin || !nativeMediaPlugin.update) return;

    await ensureNativeMediaListener();

    const { title, artist } = getCurrentTrackTitleArtist();
    const isPlaying = !!state.isPlaying;

    if (!force
        && lastNativeMediaSync.title === title
        && lastNativeMediaSync.artist === artist
        && lastNativeMediaSync.isPlaying === isPlaying) {
        return;
    }

    lastNativeMediaSync = { title, artist, isPlaying };

    try {
        await nativeMediaPlugin.update({ title, artist, isPlaying });
    } catch (e) {
        // ignore
    }
}

// ============== MEDIA SESSION API (Android通知コントロール) ==============
function setupMediaSession() {
    if (!('mediaSession' in navigator)) {
        console.log('Media Session API not supported');
        return;
    }
    
    // アクションハンドラを設定
    navigator.mediaSession.setActionHandler('play', () => {
        if (!state.isPlaying) togglePlay();
    });
    
    navigator.mediaSession.setActionHandler('pause', () => {
        if (state.isPlaying) togglePlay();
    });
    
    navigator.mediaSession.setActionHandler('previoustrack', () => {
        prevTrack();
    });
    
    navigator.mediaSession.setActionHandler('nexttrack', () => {
        nextTrack();
    });
    
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipTime = details.seekOffset || 10;
        audio.currentTime = Math.max(0, audio.currentTime - skipTime);
    });
    
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skipTime = details.seekOffset || 10;
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + skipTime);
    });
    
    navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && audio.duration) {
            audio.currentTime = Math.min(details.seekTime, audio.duration);
        }
    });
    
    navigator.mediaSession.setActionHandler('stop', () => {
        audio.pause();
        audio.currentTime = 0;
        state.isPlaying = false;
        updatePlayBtn();
    });
    
    console.log('Media Session API initialized');
}

function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator)) return;
    
    const track = state.playlist[state.currentIndex];
    if (!track) {
        navigator.mediaSession.metadata = null;
        return;
    }
    
    // トラック名からアーティスト情報を推測（ファイル名形式: "Artist - Title" の場合）
    let title = track.name || 'Unknown';
    let artist = 'Audio Visualizer';
    
    // ファイル拡張子を除去
    title = title.replace(/\.(mp3|m4a|wav|aac|mp4|webm|mkv|mov|ogg|flac|opus)$/i, '');
    
    // "Artist - Title" 形式を解析
    if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
    }
    
    navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: artist,
        album: 'Audio Visualizer',
        artwork: [
            { src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%236366f1" width="100" height="100"/><text x="50" y="60" text-anchor="middle" font-size="40" fill="white">♫</text></svg>', sizes: '96x96', type: 'image/svg+xml' },
            { src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%236366f1" width="100" height="100"/><text x="50" y="60" text-anchor="middle" font-size="40" fill="white">♫</text></svg>', sizes: '128x128', type: 'image/svg+xml' },
            { src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%236366f1" width="100" height="100"/><text x="50" y="60" text-anchor="middle" font-size="40" fill="white">♫</text></svg>', sizes: '256x256', type: 'image/svg+xml' }
        ]
    });

    // Native notification metadata (Android)
    syncNativeMediaNotification(false);
}

function updateMediaSessionPlaybackState() {
    if (!('mediaSession' in navigator)) return;
    
    navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
    
    // 再生位置情報を更新
    if (audio.duration && !isNaN(audio.duration)) {
        navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime
        });
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
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlaylistOverflowHelpers);
    } else {
        initPlaylistOverflowHelpers();
    }
} catch (e) {}

const EQ_FREQS = [60, 170, 350, 1000, 3000, 6000, 12000, 14000];
const FREQ_RANGE_PRESETS = {
    standard: { low: 20, high: 16000 },
    full: { low: 20, high: 20000 },
    voice: { low: 100, high: 8000 },
    bass: { low: 20, high: 4000 }
};

const COLOR_PRESETS = [
    { name: 'Cyber', color: '#00f2ff' },
    { name: 'Sunset', color: '#ff4e50' },
    { name: 'Lime', color: '#32ff7e' },
    { name: 'Purple', color: '#7d5fff' },
    { name: 'Gold', color: '#f9ca24' },
    { name: 'Sakura', color: '#ff9ff3' },
    { name: 'Ocean', color: '#4facfe' },
    { name: 'Flame', color: '#eb4d4b' }
];

const LIBRARY_STORAGE_KEY = 'audioVisualizerLibraryV1';
let library = {};

// ============== DOM ELEMENTS ==============
const $ = id => document.getElementById(id);
const cv = $('cv');
const ctx = cv.getContext('2d');
const audio = new Audio();
const bgVideo = $('bgVideo');

const els = {
    uiLayer: $('uiLayer'),
    playBtn: $('playBtn'),
    prevBtn: $('prevBtn'),
    nextBtn: $('nextBtn'),
    shuffleBtn: $('shuffleBtn'),
    repeatBtn: $('repeatBtn'),
    seekBar: $('seekBar'),
    timeDisplay: $('timeDisplay'),
    volSlider: $('volSlider'),
    volIcon: $('volIcon'),
    modeSelect: $('modeSelect'),
    statusText: $('statusText'),
    nowPlayingArtSm: $('nowPlayingArtSm'),
    nextUpText: $('nextUpText'),
    nowPlaying: $('nowPlaying'),
    nowPlayingArt: $('nowPlayingArt'),
    nowPlayingIcon: $('nowPlayingIcon'),
    nowPlayingTitle: $('nowPlayingTitle'),
    nowPlayingArtist: $('nowPlayingArtist'),
    nowPlayingIndex: $('nowPlayingIndex'),
    playlistPanel: $('playlistPanel'),
    playlistToggle: $('playlistToggle'),
    closePlaylistBtn: $('closePlaylistBtn'),
    playlistItems: $('playlistItems'),
    playlistSearchInput: $('playlistSearchInput'),
    clearPlaylistBtn: $('clearPlaylistBtn'),
    fileInput: $('fileInput'),
    folderImportBtn: $('folderImportBtn'),
    toggleUIBtn: $('toggleUIBtn'),
    openSettingsBtn: $('openSettingsBtn'),
    resetAllSettingsBtn: $('resetAllSettingsBtn'),
    exportBtn: $('exportBtn'),
    sourceFileBtn: $('sourceFileBtn'),
    sourceMicBtn: $('sourceMicBtn'),
    micDeviceSelect: $('micDeviceSelect'),
    settingsModal: $('settingsModal'),
    closeSettingsBtn: $('closeSettingsBtn'),
    saveSettingsBtn: $('saveSettingsBtn'),
    controlsBar: $('controlsBar'),
    overlayMsg: $('overlayMsg'),
    progressContainer: $('progressContainer'),
    seekFill: $('seekFill'),
    seekBuffer: $('seekBuffer'),
    playbackControls: $('playbackControls'),
    videoContainer: $('videoContainer'),
    closeVideoBtn: $('closeVideoBtn'),
    toggleVideoModeBtn: $('toggleVideoModeBtn'),
    // lowPowerModeCheckbox removed - replaced by fpsSelect
    showVideoCheckbox: $('showVideoCheckbox'),
    videoModeSelect: $('videoModeSelect'),
    autoPlayNextCheckbox: $('autoPlayNextCheckbox'),
    stopOnVideoEndCheckbox: $('stopOnVideoEndCheckbox'),
    persistSettingsCheckbox: $('persistSettingsCheckbox'),
    storageList: $('storageList'),
    storageSummary: $('storageSummary'),
    storageRefreshBtn: $('storageRefreshBtn'),
    storageDeleteAllBtn: $('storageDeleteAllBtn')
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
    if (state.inputSource !== 'file') return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const next = Math.max(0, Math.min(audio.duration, (audio.currentTime || 0) + deltaSeconds));
    audio.currentTime = next;
    if (bgVideo.src) {
        try { bgVideo.currentTime = next; } catch {}
    }
    showOverlay(deltaSeconds < 0 ? t('overlay.seekBack') : t('overlay.seekForward'));
}

function setupPlaylistEventDelegation() {
    const root = els.playlistItems;
    if (!root) return;
    root.addEventListener('click', e => {
        const removeBtn = e.target.closest('.remove-btn');
        if (removeBtn) {
            e.stopPropagation();
            removeFromPlaylist(+removeBtn.dataset.index);
            return;
        }

        const moveBtn = e.target.closest('.move-btn');
        if (moveBtn) {
            e.stopPropagation();
            const idx = +moveBtn.dataset.index;
            const direction = moveBtn.classList.contains('up') ? -1 : 1;
            const targetIdx = idx + direction;
            if (targetIdx >= 0 && targetIdx < state.playlist.length) {
                performPlaylistReorder(idx, targetIdx);
            }
            return;
        }

        if (e.target.closest('.drag-handle')) return;
        const item = e.target.closest('.playlist-item');
        if (item && item.dataset && item.dataset.index != null) {
            playTrack(+item.dataset.index);
        }
    });
}

// Capacitor helpers (Android)
function isNativeCapacitor() {
    return typeof window.Capacitor !== 'undefined' && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
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
        if (typeof window.Capacitor !== 'undefined' && typeof window.Capacitor.convertFileSrc === 'function') {
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
        this.list = this.list.filter(e => e.track !== track);
        this.list.push({ track, url });
        this.enforceLimit([audio.src, bgVideo.src]);
    }
    release(track) {
        const idx = this.list.findIndex(e => e.track === track);
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
    if (!track) throw new Error('Track is undefined');
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
    if (typeof track.localRef === 'string') {
        if (track.localRef.startsWith('idb:')) {
            const id = track.localRef.slice('idb:'.length);
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
                console.warn('IDB read failed', e);
            }
        } else if (track.localRef.startsWith('app:')) {
            const p = track.localRef.slice('app:'.length);
            track.url = toCapacitorFileUrl(p);
            track.ephemeral = false;
            return track.url;
        } else if (track.localRef.startsWith('uri:')) {
            const uri = track.localRef.slice('uri:'.length);
            track.url = toCapacitorFileUrl(uri);
            track.ephemeral = false;
            return track.url;
        } else if (track.localRef.startsWith('path:')) {
            const p = track.localRef.slice('path:'.length);
            track.url = fileUrlFromPath(p);
            track.ephemeral = false;
            return track.url;
        }
    }
    // Drive support removed: no remote blob handling
    // Fallback
    throw new Error('Unable to ensure URL for track');
}

function releaseObjectUrlForTrack(track) {
    if (!track || !track.url) return;
    if (track.ephemeral && isBlobUrl(track.url) && audio.src !== track.url && bgVideo.src !== track.url) {
        try { URL.revokeObjectURL(track.url); } catch {}
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
    document.documentElement.style.setProperty('--app-height', `${viewH}px`);
    document.documentElement.style.setProperty('--app-width', `${viewW}px`);
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
setAppHeight = function() {
    _orig_setAppHeight();
    applyExplicitBodyHeight();
};
function clearPlayTimeout() { if (state.playTimeout) { clearTimeout(state.playTimeout); state.playTimeout = null; } }

// ============== INITIALIZATION ==============
async function init() {
    loadSettings();
    updateLanguageUI();
    loadDeveloperMessage();
    library = loadLibraryFromStorage();
    await loadPlaylistFromStorage();
    rebuildLibraryFromPlaylist();
    renderStorageList();

    // Playlist click handlers (reduce per-render work)
    setupPlaylistEventDelegation();

    setAppHeight();
    resize();
    window.addEventListener('resize', debounce(() => {
        resize();
        clampVideoContainerToViewport(els.videoContainer);
    }, 150));

    // visualViewportの変化にも対応
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resize);
        window.visualViewport.addEventListener('scroll', resize);
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => {
        setTimeout(resize, 100); // 向き変更後に少し待つ
    });

    window.addEventListener('orientationchange', () => {
        clearTimeout(orientationChangeTimer1);
        clearTimeout(orientationChangeTimer2);

        orientationChangeTimer1 = setTimeout(() => {
            setAppHeight();
            resize();
            calculateUIHeights();
            clampVideoContainerToViewport(els.videoContainer);

            // Monitor モードの場合は画面向き変更後に再計算して再描画
            if (state.mode === 'monitor') {
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
    
    // 開発者メッセージを読み込み
    loadDeveloperMessage();
    
    // Audio setup
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    
    // Audio events
    audio.addEventListener('loadedmetadata', onMetadataLoaded);
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('play', () => { 
        state.isPlaying = true; 
        updatePlayBtn(); 
        updateMediaSessionPlaybackState();
        if (bgVideo.src && state.settings.showVideo) {
            bgVideo.play().catch(() => {});
        }
    });
    audio.addEventListener('playing', () => {
        console.log('[STATUS] playing');
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
    audio.addEventListener('waiting', () => {
    if (!state.isPlaying) {
        els.statusText.textContent = t('status.loading');
    }
    });
    audio.addEventListener('pause', () => { 
        clearPlayTimeout();
        state.isPlaying = false; 
        updatePlayBtn(); 
        bgVideo.pause();
        updateMediaSessionPlaybackState();
    });
    audio.addEventListener('ended', () => {
        if (state.isExporting) {
            finishExport();
            return;
        }
        // リピートモードが'one'の場合は同じ曲を再生
        if (state.settings.repeatMode === 'one') {
            audio.currentTime = 0;
            audio.play().catch(() => {});
            return;
        }
        // 自動再生が有効なら次の曲へ
        if (state.settings.autoPlayNext) {
            nextTrack();
        } else {
            state.isPlaying = false;
            updatePlayBtn();
        }
    });
    audio.addEventListener('error', handleAudioError);
    audio.addEventListener('seeking', () => { if (bgVideo.src) bgVideo.currentTime = audio.currentTime + getVideoStartOffset(); });
    audio.addEventListener('seeked', () => { if (bgVideo.src) bgVideo.currentTime = audio.currentTime + getVideoStartOffset(); });

    bgVideo.addEventListener('error', () => {
        console.warn('Video load failed');
        // MP3等の音声ファイルの場合はエラーメッセージを表示しない
        const currentTrack = state.playlist[state.currentIndex];
        if (currentTrack && currentTrack.isVideo) {
            showOverlay(t('overlay.videoLoadFailed'));
        }
        els.videoContainer.classList.add('hidden');
    });
    bgVideo.addEventListener('ended', () => {
        if (state.settings.stopOnVideoEnd && state.settings.showVideo) {
            audio.pause();
            state.isPlaying = false;
            updatePlayBtn();
            showOverlay(t('overlay.videoEnded'));
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
    els.modeSelect.onchange = e => { 
        state.mode = +e.target.value; 
        const modeName = e.target.options[e.target.selectedIndex].text;
        showOverlay(t('overlay.mode', { mode: modeName }));
    };
    // === 言語切り替え（強化版）===
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
        langSelect.value = currentLang;
        
        // 変更イベント
        langSelect.addEventListener('change', (e) => {
            currentLang = e.target.value;
            localStorage.setItem('app_lang', currentLang);
            state.settings.language = currentLang;
            
            updateLanguageUI();           // 即時反映
            loadDeveloperMessage();
            saveSettingsToStorage();
            
            // メッセージ（存在しないキーを安全に扱う）
            showOverlay(currentLang === 'ja' ? t('overlay.languageChangedJa') : currentLang === 'en' ? t('overlay.languageChangedEn') : t('overlay.languageChangedZh'));
        });
    }
    // UI表示ボタン：タッチ環境で click/touchstart が二重に走りやすいので
    // 「押して離した(pointerup)」タイミングでのみトグルする
    // pointerup を優先的に使用（より正確）
    els.toggleUIBtn.addEventListener('pointerup', e => {
        if (e.pointerType === 'touch' || e.pointerType === 'mouse') {
            e.preventDefault();
            e.stopImmediatePropagation();
            toggleUI();
        }
    }, { passive: false });
    // Initialize toggle button label
    els.toggleUIBtn.innerHTML = state.uiVisible 
        ? '<img src="audio-visualizer-icon-btn360.png" alt="表示" class="btn-icon">' 
        : '<img src="audio-visualizer-icon-btn360.png" alt="非表示" class="btn-icon">';

    els.openSettingsBtn.onclick = openSettings;
    els.closeSettingsBtn.onclick = closeSettings;
    els.saveSettingsBtn.onclick = saveSettings;
    els.resetAllSettingsBtn.onclick = async () => {
        if (confirm(t('confirm.resetAll'))) {
            try {
                // プレイリストのBlobURLを解放
                state.playlist.forEach(t => { 
                    if (t.source === 'local' && isBlobUrl(t.url)) {
                        URL.revokeObjectURL(t.url); 
                    }
                });
                
                // IndexedDBを削除
                if (typeof indexedDB !== 'undefined') {
                    await new Promise((resolve, reject) => {
                        const req = indexedDB.deleteDatabase(LOCAL_FILE_DB_NAME);
                        req.onsuccess = () => resolve();
                        req.onerror = () => reject(req.error);
                        req.onblocked = () => {
                            console.warn('IndexedDB deletion blocked, continuing anyway');
                            resolve();
                        };
                    });
                }
                
                // localStorageを完全にクリア
                localStorage.clear();
                
                // 音声を停止
                audio.pause();
                audio.src = '';
                bgVideo.pause();
                bgVideo.src = '';
                
                // リロード
                location.reload();
            } catch (err) {
                console.error('Failed to reset:', err);
                alert(t('alert.initFailed', { message: err.message }));
            }
        }
    };
    els.exportBtn.onclick = startExport;
    els.playlistToggle.onclick = togglePlaylist;
    // folderImportBtnは統合のため削除
    els.closePlaylistBtn.onclick = togglePlaylist;
    els.playlistSearchInput.oninput = scheduleRenderPlaylist;
    els.clearPlaylistBtn.onclick = async () => {
        if (confirm(t('confirm.clearPlaylist'))) {
            await deleteAllLocalTrackStorage(state.playlist);
            state.playlist.forEach(t => { if (t.source === 'local' && isBlobUrl(t.url)) URL.revokeObjectURL(t.url); });
            state.playlist = [];
            state.currentIndex = -1;
            audio.pause();
            state.isPlaying = false;
            updatePlayBtn();
            updateVideoVisibility();
            renderPlaylist();
            els.statusText.textContent = t('status.idle');
            updateTopBadge(null, -1);
            updateNowPlayingCustom(t('common.unknown'), '--', '🎵', '0/0');
            saveSettingsToStorage();
            showOverlay(t('overlay.playlistCleared'));
        }
    };
    
    // ファイル追加ボタン（nativeFileBtn）の統一処理
    const nativeFileBtn = document.getElementById('nativeFileBtn');
    if (nativeFileBtn) {
        nativeFileBtn.addEventListener('click', async e => {
            e.preventDefault();
            e.stopPropagation();
            
            if (isNativeCapacitor()) {
                // Native環境: ファイルを直接選択（複数選択可能）
                await openNativeFilePicker();
            } else {
                // ブラウザ環境: 標準のファイル選択
                const fileInput = document.getElementById('fileInput');
                if (fileInput) fileInput.click();
            }
        });
    }

    els.fileInput.onchange = handleLocalFiles;
    els.closeVideoBtn.onclick = () => { state.settings.showVideo = false; updateVideoVisibility(); applySettingsToUI(); };
    els.toggleVideoModeBtn.onclick = () => {
        state.settings.videoMode = state.settings.videoMode === 'window' ? 'background' : 'window';
        updateVideoVisibility();
        applySettingsToUI();
    };
    
    // Source Toggle
    els.sourceFileBtn.onclick = () => setInputSource('file');
    els.sourceMicBtn.onclick = () => setInputSource('mic');
    
    // Mic Device Select
    els.micDeviceSelect.onchange = e => {
        state.micDeviceId = e.target.value;
        if (state.inputSource === 'mic') startMic();
    };
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab);
    });
    
    
    // GPU サポートチェックと初期化
    checkGPUSupport();
    if (state.gpuAvailable && state.settings.renderMode !== 'cpu') {
        initGPURenderer();
    }
    
    setupSettingsInputs();
    initDraggableVideo();
    // プレイリストパネルはAndroid版では固定位置（ドラッグ無効）
    applySettingsToUI();
    updateShuffleRepeatUI();
    updateTopBadge(null, -1);
    updateNowPlayingCustom('未再生', '--', '🎵', `0/${state.playlist.length}`);
    
    // Media Session API setup for Android notifications
    setupMediaSession();
    
    // Position update for Media Session
    audio.addEventListener('timeupdate', () => {
        if (state.isPlaying && 'mediaSession' in navigator) {
            updateMediaSessionPlaybackState();
        }
    });

    // バックグラウンド/フォアグラウンド切り替え処理
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // バックグラウンド: 描画を停止して省電力化、音声は継続
            console.log('App moved to background - audio continues');
            // 動画がある場合は一時停止（バックグラウンドではビデオデコードが重い）
            if (bgVideo.src && !bgVideo.paused) {
                bgVideo.pause();
                state._videoPausedInBackground = true;
            }
        } else {
            // フォアグラウンド復帰: 描画再開
            console.log('App returned to foreground');
            lastDrawTs = 0; // FPSタイマーリセット
            // 動画を再開して音声と同期
            if (state._videoPausedInBackground && bgVideo.src) {
                bgVideo.currentTime = audio.currentTime + (typeof getVideoSyncOffset === 'function' ? getVideoSyncOffset() : 0);
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
    document.body.addEventListener('dragover', e => {
        e.preventDefault();
        document.body.classList.add('drag-over');
    });
    document.body.addEventListener('dragleave', e => {
        e.preventDefault();
        document.body.classList.remove('drag-over');
    });
    document.body.addEventListener('drop', async e => {
        e.preventDefault();
        document.body.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            await handleFiles(files);
        }
    });

    if (els.storageRefreshBtn) els.storageRefreshBtn.onclick = renderStorageList;
    if (els.storageDeleteAllBtn) els.storageDeleteAllBtn.onclick = deleteAllLibraryEntries;

    // Auto-hide UI
    document.addEventListener('mousemove', resetUITimeout);
    document.addEventListener('mousedown', resetUITimeout);
    document.addEventListener('touchstart', resetUITimeout, { passive: true });  // passive維持
    // pointerdown も追加（現代的）
    document.addEventListener('pointerdown', resetUITimeout);
    
    document.addEventListener('keydown', e => {
        resetUITimeout();
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
        const keyId = (e.key === ']' ? 'BracketRight' : (e.key === '[' ? 'BracketLeft' : e.code));

        switch(keyId) {
            case 'Space': e.preventDefault(); togglePlay(); break;
            case 'ArrowLeft': prevTrack(); break;
            case 'ArrowRight': nextTrack(); break;
            case 'ArrowUp': 
                e.preventDefault(); 
                els.volSlider.value = Math.min(1, +els.volSlider.value + 0.1); 
                updateVolume(); 
                showOverlay(t('overlay.volumeUp', { value: Math.round(audio.volume * 100) }));
                break;
            case 'ArrowDown': 
                e.preventDefault(); 
                els.volSlider.value = Math.max(0, +els.volSlider.value - 0.1); 
                updateVolume(); 
                showOverlay(t('overlay.volumeDown', { value: Math.round(audio.volume * 100) }));
                break;
            case 'KeyH': e.preventDefault(); toggleUI(); break;
            case 'KeyV': 
                state.settings.showVideo = !state.settings.showVideo; 
                updateVideoVisibility(); 
                applySettingsToUI(); 
                showOverlay(state.settings.showVideo ? t('overlay.videoOn') : t('overlay.videoOff'));
                break;
            case 'KeyL': {
                // FPSサイクル: 30 → 60 → 120 → 無制限 → 30
                const fpsSteps = [30, 60, 120, 0];
                const curFps = state.settings.targetFps || 60;
                const ci = fpsSteps.indexOf(curFps);
                const nextFps = fpsSteps[(ci + 1) % fpsSteps.length];
                state.settings.targetFps = nextFps;
                state.settings.lowPowerMode = (nextFps <= 30);
                applySettingsToUI();
                showOverlay(t('overlay.fps', { fps: nextFps === 0 ? '∞' : nextFps })); 
                break;
            }
            case 'KeyR': 
                state.settings.rainbow = !state.settings.rainbow; 
                applySettingsToUI(); 
                showOverlay(state.settings.rainbow ? t('overlay.rainbowOn') : t('overlay.rainbowOff')); 
                break;
            case 'KeyX': 
                state.settings.mirror = !state.settings.mirror; 
                applySettingsToUI(); 
                showOverlay(state.settings.mirror ? t('overlay.mirrorOn') : t('overlay.mirrorOff')); 
                break;
            case 'KeyS': toggleShuffle(); applySettingsToUI(); break;
            case 'KeyP': toggleRepeat(); applySettingsToUI(); break;
            case 'BracketLeft': {
                const rates = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
                const ci = rates.indexOf(audio.playbackRate);
                const ni = Math.max(0, ci - 1);
                audio.playbackRate = rates[ni];
                state.settings.playbackRate = rates[ni];
                if (bgVideo.src) bgVideo.playbackRate = rates[ni];
                syncVideoRateAfterChange();
                const sel = $('speedSelect'); if (sel) sel.value = rates[ni];
                showOverlay(t('overlay.playbackSpeed', { rate: rates[ni] }));
                break;
            }
            case 'BracketRight': {
                const rates = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
                const ci = rates.indexOf(audio.playbackRate);
                const ni = Math.min(rates.length - 1, ci + 1);
                audio.playbackRate = rates[ni];
                state.settings.playbackRate = rates[ni];
                if (bgVideo.src) bgVideo.playbackRate = rates[ni];
                syncVideoRateAfterChange();
                const sel = $('speedSelect'); if (sel) sel.value = rates[ni];
                showOverlay(t('overlay.playbackSpeed', { rate: rates[ni] }));
                break;
            }
            case 'KeyM': 
                state.mode = (state.mode + 1) % 9; 
                els.modeSelect.value = state.mode;
                const modeName = els.modeSelect.options[els.modeSelect.selectedIndex].text;
                showOverlay(t('overlay.mode', { mode: modeName }));
                break;
        }
    });
    resetUITimeout();
    
    requestAnimationFrame(draw);
}

function resetUITimeout(e) {
    // autoHideUIが無効な場合は自動表示を行わない
    if (!state.settings.autoHideUI) {
        return;
    }

    // === 修正ポイント：トグルボタン自体へのタッチは自動表示/リセットをスキップ ===
    if (e && e.target && (e.target.closest('#toggleUIBtn') || e.target.id === 'toggleUIBtn')) {
        return;  // ボタン操作は toggleUI() が直接処理する
    }
    
    // タップ操作やマウス移動でUIを表示
    if (!state.uiVisible) {
        toggleUI();
    }
    
    if (state.uiTimeout) clearTimeout(state.uiTimeout);
    
    // 設定画面やプレイリストが開いている間、またはマウスがUI上にある間は消さない
    const isOverUI = e && (e.target.closest('.top-bar') || e.target.closest('.controls-bar') || 
                          e.target.closest('.settings-modal') || e.target.closest('.playlist-container') ||
                          e.target.closest('#persistentControls'));  // persistentControlsも追加

    if (state.isPlaying && !state.settingsOpen && !state.playlistVisible && !isOverUI) {
        state.uiTimeout = setTimeout(() => {
            if (state.isPlaying && !state.settingsOpen && !state.playlistVisible && state.uiVisible) {
                toggleUI();
            }
        }, 5000);
    }
}

// Android版ではプレイリストパネルは固定位置
// initDraggablePlaylist は削除済み

function initDraggableVideo() {
    const container = els.videoContainer;
    const handle = container.querySelector('.video-handle');
    let isDragging = false;
    let startX, startY, initialX, initialY;
    let isFirstDrag = true; // 初回ドラッグフラグ

    // 保存された位置を復元
    if (restoreVideoWindowPos(container)) {
        isFirstDrag = false;
    }

    // Mouse events
    handle.onmousedown = e => {
        if (state.settings.videoMode === 'background') return;
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
            container.style.transform = 'none';
            
            isFirstDrag = false;
        }
        
        startDragging(e.clientX, e.clientY);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', stopDragging);
    };

    // Touch events for mobile
    handle.addEventListener('touchstart', e => {
        if (state.settings.videoMode === 'background') return;
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
            container.style.transform = 'none';
            
            isFirstDrag = false;
        }
        
        startDragging(touch.clientX, touch.clientY);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', stopDragging);
    }, { passive: false });

    function startDragging(clientX, clientY) {
        isDragging = true;
        container.classList.add('dragging');
        startX = clientX;
        startY = clientY;
        initialX = container.offsetLeft;
        initialY = container.offsetTop;
        container.style.transform = 'none';
    }

    function constrainPosition(x, y) {
        const containerRect = container.getBoundingClientRect();
        const { width: vw, height: vh } = getViewportSize();
        const maxX = vw - containerRect.width;
        const maxY = vh - containerRect.height;

        return {
            x: Math.max(0, Math.min(x, maxX)),
            y: Math.max(0, Math.min(y, maxY))
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
        container.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('mouseup', stopDragging);
        document.removeEventListener('touchend', stopDragging);
        
        // 位置を保存（画面サイズに対する割合で保存）
        saveVideoWindowPos(container);
    }
}

function getViewportSize() {
    const vv = window.visualViewport;
    return {
        width: vv?.width || window.innerWidth,
        height: vv?.height || window.innerHeight
    };
}

function saveVideoWindowPos(container) {
    const { width: vw, height: vh } = getViewportSize();
    const rect = container.getBoundingClientRect();

    const maxLeft = Math.max(1, vw - rect.width);
    const maxTop = Math.max(1, vh - rect.height);

    const left = Math.max(0, Math.min(rect.left, maxLeft));
    const top = Math.max(0, Math.min(rect.top, maxTop));

    localStorage.setItem('videoWindowPos', JSON.stringify({
        leftRatio: left / maxLeft,
        topRatio: top / maxTop
    }));
}

function restoreVideoWindowPos(container) {
    const savedPos = localStorage.getItem('videoWindowPos');
    if (!savedPos) return false;

    try {
        const pos = JSON.parse(savedPos);
        const { width: vw, height: vh } = getViewportSize();
        const rect = container.getBoundingClientRect();

        const maxLeft = Math.max(0, vw - rect.width);
        const maxTop = Math.max(0, vh - rect.height);

        const left = Math.max(0, Math.min(maxLeft, Math.round(maxLeft * (pos.leftRatio ?? 0.5))));
        const top = Math.max(0, Math.min(maxTop, Math.round(maxTop * (pos.topRatio ?? 0.35))));

        container.style.left = `${left}px`;
        container.style.top = `${top}px`;
        container.style.bottom = '';
        container.style.transform = 'none';
        return true;
    } catch {
        return false;
    }
}

function clampVideoContainerToViewport(container) {
    if (!container || container.classList.contains('hidden')) return;

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
    
    container.classList.toggle('hidden', !state.settings.showVideo || !isVideo);
    container.classList.toggle('background-mode', state.settings.videoMode === 'background');
    
    // フィットモードクラスを適用
    container.classList.remove('fit-contain', 'fit-fill');
    if (state.settings.videoMode === 'background') {
        if (state.settings.videoFitMode === 'contain') {
            container.classList.add('fit-contain');
        } else if (state.settings.videoFitMode === 'fill') {
            container.classList.add('fit-fill');
        }
    }
	
    // モード切替時に残りやすいスタイルを整理
    if (state.settings.videoMode === 'background') {
        container.style.top = '';
        container.style.left = '';
        container.style.bottom = '';
        container.style.transform = 'none';
    } else {
        container.style.bottom = '';
        
        // 保存位置があればそれを優先
        if (restoreVideoWindowPos(container)) {
            // 何もしない
        } else {
            // 初回だけ中央下に配置
            container.style.top = 'auto';
            container.style.bottom = '120px';
            container.style.left = '50%';
            container.style.transform = 'translateX(-50%)';
        }
    }

    if (state.settings.videoMode === 'window') {
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
                bgVideo.removeEventListener('loadedmetadata', onLoaded);
            };
            bgVideo.addEventListener('loadedmetadata', onLoaded);
        } else {
            // When toggling visibility back on, resync immediately
            bgVideo.playbackRate = audio.playbackRate || 1.0;
            bgVideo.currentTime = audio.currentTime + getVideoSyncOffset();
            if (state.isPlaying) bgVideo.play().catch(() => {});
        }
    } else {
        bgVideo.pause();
        bgVideo.src = '';
    }
}

function applyCanvasResolution(force = false) {
    if (!cv) return;

    const dpr = Math.min(2.5, window.devicePixelRatio || 1);

    let viewW = Math.floor(window.visualViewport?.width || window.innerWidth);
    let viewH = Math.floor(window.visualViewport?.height || window.innerHeight);

    const targetW = Math.floor(viewW * dpr);
    const targetH = Math.floor(viewH * dpr);

    cv.width = targetW;
    cv.height = targetH;
    cv.style.width = '100%';
    cv.style.height = '100%';
    cv.style.top = '0';
    cv.style.left = '0';
    cv.style.right = '0';
    cv.style.bottom = '0';
    cv.style.position = 'absolute';

    W = targetW;
    H = targetH;

    const ctx = cv.getContext('2d', { alpha: true });
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

    recenterFloatingUiAfterResize();

    requestAnimationFrame(() => {
        calculateUIHeights();
        if (state.mode === 'monitor') drawMonitor();
    });
}

function updatePlaylistTopOffset() {
    const isPortraitMobile = window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;
    if (!isPortraitMobile) {
        document.documentElement.style.removeProperty('--playlist-top');
        return;
    }

    const playlistPanel = document.querySelector('.playlist-panel');
    if (!playlistPanel) return;

    const topBar = document.querySelector('.top-bar');
    const persistentControls = document.querySelector('#persistentControls');

    let bottomY = 0;
    if (topBar) bottomY = Math.max(bottomY, topBar.getBoundingClientRect().bottom);
    if (persistentControls) bottomY = Math.max(bottomY, persistentControls.getBoundingClientRect().bottom);

    const topPx = Math.ceil(bottomY + 8);
    document.documentElement.style.setProperty('--playlist-top', `${topPx}px`);
}

function recenterFloatingUiAfterResize() {
    const cv = document.getElementById('cv');
    if (cv) {
        const ctx = cv.getContext('2d');
        if (ctx && typeof ctx.setTransform === 'function') {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
    }

    const videoContainer = document.querySelector('.video-container');
    if (videoContainer) {
        videoContainer.style.left = '50%';
        videoContainer.style.right = 'auto';
        videoContainer.style.transform = 'translateX(-50%) translateZ(0)';
    }

    const floatingPanels = document.querySelectorAll('.playlist-panel, #persistentControls');
    floatingPanels.forEach((el) => {
        el.style.left = '';
        el.style.right = '';
        el.style.transform = '';
    });
}

function calculateUIHeights() {
    const topBar = document.querySelector('.top-bar');
    const controlsBar = document.querySelector('.controls-bar');
    if (topBar) topBarH = topBar.getBoundingClientRect().height;
    if (controlsBar) bottomBarH = controlsBar.getBoundingClientRect().height;

    // Keep playlist panel below the actual top UI in portrait
    updatePlaylistTopOffset();
}

// ============== SETTINGS ==============
function loadSettings() {
    const saved = localStorage.getItem('audioVisualizerSettingsV7');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(state.settings, parsed);
        } catch (e) { console.warn('Settings load failed'); }
    }
}

function saveSettingsToStorage() {
    if (state.settings.persistSettings) {
        localStorage.setItem('audioVisualizerSettingsV7', JSON.stringify(state.settings));
    }
    // プレイリスト情報（ローカルは参照キー(localRef)を保存、URLなし）
    const playlistData = state.playlist.map(track => {
        // storeLocalFilesがOFFの場合：
        // - uri:形式は一時的な権限なので保存しない（再起動後アクセス不可）
        // - app:形式（コピー済み）とpath:形式（永続パス）のみ保存可能
        if (track.source === 'local' && !state.settings.storeLocalFiles) {
            // app:とpath:以外は保存しない
            if (!track.localRef?.startsWith('app:') && !track.localRef?.startsWith('path:')) {
                return null;
            }
        }
        // storeLocalFilesがONの場合：idb:形式以外は保存しない（uri:は永続権限がない）
        if (track.source === 'local' && state.settings.storeLocalFiles) {
            if (!track.localRef?.startsWith('idb:') && !track.localRef?.startsWith('app:') && !track.localRef?.startsWith('path:')) {
                return null;
            }
        }
        return {
            name: track.name,
            source: track.source,
            isVideo: track.isVideo,
            localRef: track.localRef || null,
            
        };
    }).filter(Boolean);
    localStorage.setItem('audioVisualizerPlaylistV7', JSON.stringify(playlistData));
    // 後方互換
    localStorage.setItem('audioVisualizerPlaylist', JSON.stringify(playlistData));
}

function loadLibraryFromStorage() {
    try {
        const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
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
        type: entry.type || 'idb',
        sizeBytes: entry.sizeBytes || 0,
        isVideo: !!entry.isVideo,
        createdAt: entry.createdAt || Date.now()
    };
    saveLibraryToStorage();
    renderStorageList();
}

function removeLibraryEntries(refs) {
    let changed = false;
    refs.forEach(ref => {
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
    state.playlist.forEach(t => {
        if (t && t.localRef) {
            refs.add(t.localRef);
            if (!library[t.localRef]) {
                upsertLibraryEntry({ 
                    ref: t.localRef, 
                    name: t.name, 
                    type: t.localRef.startsWith('app:') ? 'app' : 'idb', 
                    sizeBytes: t.size || 0,
                    isVideo: !!t.isVideo 
                });
            }
        }
    });
    // Remove stale entries not referenced anywhere
    const stale = Object.keys(library).filter(ref => !refs.has(ref));
    if (stale.length) removeLibraryEntries(stale);
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    const units = ['B','KB','MB','GB'];
    let v = bytes;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
    return `${v.toFixed(v >= 10 ? 0 : 1)}${units[u]}`;
}

const QUALITY_PRESETS = {
    1024: { fftSize: 1024, barCount: 32 },
    2048: { fftSize: 2048, barCount: 64 },
    4096: { fftSize: 4096, barCount: 128 },
    8192: { fftSize: 8192, barCount: 256 }
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

    const plugins = window.Capacitor?.Plugins;
    const filePicker = plugins?.FilePicker;

    if (!filePicker || typeof filePicker.pickFiles !== 'function') {
        alert(t('alert.filePickerMissing'));
        return;
    }

    try {
        const result = await filePicker.pickFiles({ multiple: true, readData: false });
        const files = Array.isArray(result?.files) ? result.files : [];
        if (files.length === 0) return;

        const accepted = [];
        const allowedExt = new Set(['mp3', 'wav', 'm4a', 'aac', 'mp4', 'webm', 'mkv', 'mov', 'ogg', 'flac', 'opus']);
        const videoExt = new Set(['mp4', 'webm', 'mkv', 'mov']);

        for (const f of files) {
            const name = (f?.name || '').toLowerCase();
            const ext = name.includes('.') ? name.split('.').pop() : '';
            const isVideo = videoExt.has(ext);
            if (!name) continue;
            if (allowedExt.has(ext)) {
                const uri = f?.path || f?.uri || '';
                if (!uri) continue;
                accepted.push({ name: f.name, uri, isVideo });
            }
        }

        if (accepted.length === 0) {
            showOverlay(t('overlay.noFileSelected'));
            return;
        }

        // パス記憶機能: 最後に選択したファイルのディレクトリを保存
        if (accepted.length > 0) {
            const lastUri = accepted[0].uri;
            // URIからディレクトリパスを抽出
            const lastPath = lastUri.includes('/') ? lastUri.substring(0, lastUri.lastIndexOf('/')) : lastUri;
            state.settings.lastSelectedPath = lastPath;
            console.log('Last selected path saved:', lastPath);
        }

        showOverlay(t('overlay.importingFiles', { count: accepted.length }));

        for (const item of accepted) {
            state.playlist.push({
                name: item.name,
                url: undefined, // URLは再生時に生成
                source: 'local',
                isVideo: item.isVideo,
                localRef: `uri:${item.uri}`,
                addedOrder: state.addedOrderCounter++
            });
        }

        renderPlaylist();
        if (state.currentIndex === -1) playTrack(state.playlist.length - accepted.length);
        saveSettingsToStorage();
        setTimeout(() => showOverlay(t('overlay.filesAdded', { count: accepted.length })), 500);
        els.statusText.textContent = state.playlist[state.currentIndex] ? `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${state.playlist[state.currentIndex].name}` : t('status.idle');
        updateNextUpText(state.currentIndex);
    } catch (error) {
        console.error('FilePicker failed:', error);
        showOverlay(t('overlay.fileSelectFailed'));
    }
}

async function openNativeFolderImport() {
    if (!isNativeCapacitor()) {
        showOverlay(t('overlay.androidOnly'));
        return;
    }

    const plugins = window.Capacitor?.Plugins;
    const folderImport = plugins?.LocalFolderImport;
    if (!folderImport || typeof folderImport.pickAudioFolder !== 'function') {
        // Fallback to file picker if plugin not available
        console.warn('フォルダ一括追加プラグインが見つかりません。ファイルピッカーを使用します。');
        await openNativeFilePicker();
        return;
    }

    try {
        showOverlay(t('overlay.selectFolder'));
        const result = await folderImport.pickAudioFolder({});
        const files = Array.isArray(result?.files) ? result.files : [];
        if (files.length === 0) {
            showOverlay(t('overlay.folderNoFiles'));
            return;
        }

        // パス記憶機能: フォルダパスを保存
        if (result?.folderPath) {
            state.settings.lastSelectedPath = result.folderPath;
            console.log('Last selected folder path saved:', result.folderPath);
        } else if (files.length > 0 && files[0]?.path) {
            // フォルダパスがない場合、最初のファイルからディレクトリを抽出
            const firstPath = files[0].path;
            const folderPath = firstPath.includes('/') ? firstPath.substring(0, firstPath.lastIndexOf('/')) : firstPath;
            state.settings.lastSelectedPath = folderPath;
            console.log('Last selected folder path (from file) saved:', folderPath);
        }

        showOverlay(t('overlay.importingFiles', { count: files.length }));

        for (const f of files) {
            const name = typeof f?.name === 'string' ? f.name : '';
            const path = typeof f?.path === 'string' ? f.path : '';
            if (!name || !path) continue;
            const isVideo = !!f?.isVideo;
            state.playlist.push({
                name,
                url: undefined, // URLは再生時に生成
                source: 'local',
                isVideo,
                localRef: `app:${path}`,
                size: f?.size || 0,
                addedOrder: state.addedOrderCounter++
            });
            // 保存設定がONの場合のみライブラリに登録
            if (state.settings.storeLocalFiles) {
                upsertLibraryEntry({ ref: `app:${path}`, type: 'app', name, sizeBytes: f?.size || 0, isVideo });
            }
        }

        renderPlaylist();
        if (state.currentIndex === -1) {
            const firstAddedIndex = Math.max(0, state.playlist.length - files.length);
            playTrack(firstAddedIndex);
        }
        saveSettingsToStorage();
        setTimeout(() => showOverlay(t('overlay.filesAdded', { count: files.length })), 500);
        els.statusText.textContent = state.playlist[state.currentIndex] ? `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${state.playlist[state.currentIndex].name}` : t('status.idle');
        updateNextUpText(state.currentIndex);
    } catch (error) {
        console.error('Folder import failed:', error);
        // Fallback to file picker
        console.log('フォルダプラグインエラーのため、ファイルピッカーにフォールバック');
        await openNativeFilePicker();
    }
}

// ============== PLAYLIST PERSISTENCE (LocalStorage + IndexedDB) ==============
const PLAYLIST_STORAGE_KEY = 'audioVisualizerPlaylistV7';
const LOCAL_FILE_DB_NAME = 'audioVisualizerLocalFiles';
const LOCAL_FILE_STORE = 'files';

function isBlobUrl(url) {
    return typeof url === 'string' && url.startsWith('blob:');
}

function generateLocalId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Path to file:// URL conversion cache
const pathToFileUrlCache = new Map();

function fileUrlFromPath(filePath) {
    if (!filePath || typeof filePath !== 'string') return '';
    // キャッシュを確認
    if (pathToFileUrlCache.has(filePath)) {
        return pathToFileUrlCache.get(filePath);
    }
    let normalized = filePath.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) normalized = '/' + normalized;
    const url = encodeURI('file://' + normalized);
    pathToFileUrlCache.set(filePath, url);
    return url;
}

function openLocalFileDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('indexedDB is not available'));
            return;
        }
        const req = indexedDB.open(LOCAL_FILE_DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(LOCAL_FILE_STORE)) {
                db.createObjectStore(LOCAL_FILE_STORE, { keyPath: 'id' });
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
        const tx = db.transaction(LOCAL_FILE_STORE, 'readwrite');
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
        const tx = db.transaction(LOCAL_FILE_STORE, 'readonly');
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
        const tx = db.transaction(LOCAL_FILE_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(LOCAL_FILE_STORE).delete(id);
    });
    db.close();
}

async function deleteAllLocalTrackStorage(tracks) {
    const deletions = tracks
        .filter(t => t && t.source === 'local' && typeof t.localRef === 'string' && t.localRef.startsWith('idb:'))
        .map(t => t.localRef.slice('idb:'.length));
    for (const id of deletions) {
        try {
            await idbDeleteLocalFile(id);
        } catch {
            // ignore
        }
    }

    const appPaths = tracks
        .filter(t => t && t.source === 'local' && typeof t.localRef === 'string' && t.localRef.startsWith('app:'))
        .map(t => t.localRef.slice('app:'.length))
        .filter(Boolean);

    if (appPaths.length > 0 && isNativeCapacitor()) {
        try {
            const folderImport = window.Capacitor?.Plugins?.LocalFolderImport;
            if (folderImport && typeof folderImport.deleteImportedFiles === 'function') {
                await folderImport.deleteImportedFiles({ paths: appPaths });
            }
        } catch {
            // ignore
        }
    }

    // Remove from library index
    const refs = tracks.map(t => t.localRef).filter(Boolean);
    removeLibraryEntries(refs);
}

async function loadPlaylistFromStorage() {
    const saved = localStorage.getItem(PLAYLIST_STORAGE_KEY) || localStorage.getItem('audioVisualizerPlaylist');
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
        if (!item || typeof item !== 'object') continue;
        const name = typeof item.name === 'string' ? item.name : 'Unknown';
        const source = item.source;
        const isVideo = !!item.isVideo;

        if (source === 'local') {
            const localRef = typeof item.localRef === 'string' ? item.localRef : null;
            const legacyPath = typeof item.path === 'string' ? item.path : null;

            if (localRef && localRef.startsWith('uri:')) {
                const uri = localRef.slice('uri:'.length);
                if (!uri) continue;
                restored.push({ name, url: toCapacitorFileUrl(uri), source: 'local', isVideo, localRef });
                continue;
            }

            if (localRef && localRef.startsWith('app:')) {
                const p = localRef.slice('app:'.length);
                if (!p) continue;
                restored.push({ name, url: toCapacitorFileUrl(p), source: 'local', isVideo, localRef });
                continue;
            }

            if (localRef && localRef.startsWith('path:')) {
                const p = localRef.slice('path:'.length);
                const url = fileUrlFromPath(p);
                if (!url) continue;
                restored.push({ name, url, source: 'local', isVideo, localRef });
                continue;
            }
            if (legacyPath) {
                const url = fileUrlFromPath(legacyPath);
                if (!url) continue;
                restored.push({ name, url, source: 'local', isVideo, localRef: `path:${legacyPath}` });
                continue;
            }
            if (localRef && localRef.startsWith('idb:')) {
                // Do not create blob URL here; lazy on demand
                restored.push({ name, url: undefined, source: 'local', isVideo, localRef });
            }
            continue;
        }

        // drive entries removed; skip
    }

    state.playlist = restored;
    if (state.currentIndex >= state.playlist.length) state.currentIndex = -1;
    renderPlaylist();
    if (state.playlist.length > 0) {
        els.statusText.textContent = t('playlist.restored');
    }
}

function hasIdbLocalTracksInPlaylist() {
    return state.playlist.some(t => t && t.source === 'local' && typeof t.localRef === 'string' && t.localRef.startsWith('idb:'));
}

async function purgeIdbLocalTracksFromPlaylist() {
    const targets = state.playlist
        .map((t, idx) => ({ t, idx }))
        .filter(({ t }) => t && t.source === 'local' && typeof t.localRef === 'string' && t.localRef.startsWith('idb:'));
    if (targets.length === 0) return;

    try {
        await deleteAllLocalTrackStorage(targets.map(x => x.t));
    } catch {
        // ignore
    }

    for (const { t } of targets) {
        if (t && isBlobUrl(t.url)) {
            try { URL.revokeObjectURL(t.url); } catch {}
        }
    }

    const removedIndices = new Set(targets.map(x => x.idx));
    const removedBeforeCurrent = [...removedIndices].filter(i => i < state.currentIndex).length;
    const wasPlayingRemoved = removedIndices.has(state.currentIndex);

    state.playlist = state.playlist.filter((_, idx) => !removedIndices.has(idx));

    if (wasPlayingRemoved) {
        audio.pause();
        state.isPlaying = false;
        updatePlayBtn();
        state.currentIndex = -1;
        els.statusText.textContent = t('status.idle');
    } else if (state.currentIndex >= 0) {
        state.currentIndex = Math.max(-1, state.currentIndex - removedBeforeCurrent);
    }

    renderPlaylist();
    updateVideoVisibility();
    saveSettingsToStorage();
}

function setupSettingsInputs() {
    const smoothingSlider = $('smoothingSlider');
    if (smoothingSlider) {
        smoothingSlider.oninput = e => {
            state.settings.smoothing = +e.target.value;
            $('smoothingValue').textContent = state.settings.smoothing.toFixed(2);
            if (state.analyser) state.analyser.smoothingTimeConstant = state.settings.smoothing;
        };
    }
    const sensitivitySlider = $('sensitivitySlider');
    if (sensitivitySlider) {
        sensitivitySlider.oninput = e => {
            state.settings.sensitivity = +e.target.value;
            $('sensitivityValue').textContent = state.settings.sensitivity.toFixed(1);
            applySensitivityToAnalyser();
        };
    }
    const fftSizeSelect = $('fftSizeSelect');
    if (fftSizeSelect) {
        fftSizeSelect.onchange = e => {
            state.settings.fftSize = +e.target.value;
            if (state.analyser) state.analyser.fftSize = state.settings.fftSize;
        };
    }
    const qualitySelect = $('qualitySelect');
    if (qualitySelect) {
        qualitySelect.onchange = e => {
            state.settings.quality = e.target.value;
        };
    }
    const barCountSelect = $('barCountSelect');
    if (barCountSelect) {
        barCountSelect.onchange = e => {
            state.settings.barCount = +e.target.value;
            updateNumBars();
        };
    }
    const audioSourceSelect = $('audioSourceSelect');
    if (audioSourceSelect) {
        audioSourceSelect.onchange = async e => {
            state.settings.audioSource = e.target.value;
            await updateAudioSource();
            saveSettingsToStorage();
        };
    }
    const micDeviceSelect = $('micDeviceSelect');
    if (micDeviceSelect) {
        micDeviceSelect.onchange = async e => {
            state.settings.micDeviceId = e.target.value;
            await updateMicrophoneInput();
            saveSettingsToStorage();
        };
    }
    const inputGainSlider = $('inputGainSlider');
    if (inputGainSlider) {
        inputGainSlider.oninput = e => {
            state.settings.inputGain = +e.target.value;
            $('inputGainValue').textContent = state.settings.inputGain.toFixed(1);
            if (state.microphoneGain) state.microphoneGain.gain.value = state.settings.inputGain;
        };
    }
    const freqRangeSelect = $('freqRangeSelect');
    if (freqRangeSelect) {
        freqRangeSelect.onchange = e => {
            const presetKey = e.target.value;
            if (presetKey === 'custom') return;
            const preset = FREQ_RANGE_PRESETS[presetKey];
            if (!preset) return;
            state.settings.lowFreq = preset.low;
            state.settings.highFreq = preset.high;
            $('lowFreqSlider').value = preset.low;
            $('lowFreqValue').textContent = preset.low + 'Hz';
            $('highFreqSlider').value = preset.high;
            $('highFreqValue').textContent = (preset.high >= 1000 ? (preset.high/1000) + 'kHz' : preset.high + 'Hz');
        };
    }
    const lowFreqSlider = $('lowFreqSlider');
    if (lowFreqSlider) {
        lowFreqSlider.oninput = e => {
            state.settings.lowFreq = +e.target.value;
            $('lowFreqValue').textContent = state.settings.lowFreq + 'Hz';
            if (freqRangeSelect) freqRangeSelect.value = 'custom';
        };
    }
    const highFreqSlider = $('highFreqSlider');
    if (highFreqSlider) {
        highFreqSlider.oninput = e => {
            state.settings.highFreq = +e.target.value;
            $('highFreqValue').textContent = (state.settings.highFreq >= 1000 ? (state.settings.highFreq/1000) + 'kHz' : state.settings.highFreq + 'Hz');
            if (freqRangeSelect) freqRangeSelect.value = 'custom';
        };
    }
    EQ_FREQS.forEach((freq, i) => {
        const id = freq >= 1000 ? `eq${freq/1000}k` : `eq${freq}`;
        const el = $(id);
        if (el) el.oninput = e => { state.settings.eq[i] = +e.target.value; updateEQ(i, +e.target.value); };
    });
    const resetEqBtn = $('resetEqBtn');
    if (resetEqBtn) {
        resetEqBtn.onclick = resetEQ;
    }

    // EQプリセットボタン
    const EQ_PRESETS = {
        flat:       [0, 0, 0, 0, 0, 0, 0, 0],
        rock:       [5, 4, -2, -3, 2, 5, 7, 6],
        pop:        [-1, 2, 5, 4, 1, -1, -2, -1],
        jazz:       [3, 2, -2, -1, 2, 4, 5, 3],
        classical:  [4, 3, -1, 1, -1, 2, 3, 4],
        bass:       [8, 6, 4, 1, 0, 0, 0, 0],
        vocal:      [-2, -1, 3, 5, 4, 2, 0, -1],
        electronic: [5, 4, 1, -2, 0, 3, 5, 7]
    };
    document.querySelectorAll('.eq-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            const values = EQ_PRESETS[preset];
            if (!values) return;
            state.settings.eq = [...values];
            state.eqFilters.forEach((f, i) => {
                f.gain.value = values[i];
                const freq = EQ_FREQS[i];
                const id = freq >= 1000 ? `eq${freq/1000}k` : `eq${freq}`;
                const el = $(id);
                if (el) el.value = values[i];
            });
            showOverlay(t('overlay.eq', { name: btn.textContent }));
        });
    });

    // FPSセレクター
    const fpsSelect = $('fpsSelect');
    if (fpsSelect) {
        fpsSelect.onchange = e => {
            const fps = +e.target.value;
            state.settings.targetFps = fps;
            state.settings.lowPowerMode = (fps <= 30);
            showOverlay(t('overlay.fps', { fps: fps === 0 ? '∞' : fps }));
        };
    }
    const glowSlider = $('glowSlider');
    if (glowSlider) {
        glowSlider.oninput = e => { 
            state.settings.glowStrength = +e.target.value; 
            $('glowValue').textContent = state.settings.glowStrength > 30 ? 'strong' : state.settings.glowStrength > 10 ? 'Medium' : 'weak';
        };
    }
    const rainbowCheckbox = $('rainbowCheckbox');
    if (rainbowCheckbox) {
        rainbowCheckbox.onchange = e => { state.settings.rainbow = e.target.checked; };
    }
    const mirrorCheckbox = $('mirrorCheckbox');
    if (mirrorCheckbox) {
        mirrorCheckbox.onchange = e => { state.settings.mirror = e.target.checked; };
    }
    const bgBlurSlider = $('bgBlurSlider');
    if (bgBlurSlider) {
        bgBlurSlider.oninput = e => {
            state.settings.bgBlur = +e.target.value;
            $('bgBlurValue').textContent = state.settings.bgBlur + 'px';
            updateVideoVisibility();
        };
    }
    const opacitySlider = $('opacitySlider');
    if (opacitySlider) {
        opacitySlider.oninput = e => {
            state.settings.opacity = +e.target.value;
            $('opacityValue').textContent = state.settings.opacity.toFixed(1);
        };
    }
    const balanceSlider = $('balanceSlider');
    if (balanceSlider) {
        balanceSlider.oninput = e => {
            state.settings.balance = +e.target.value;
            const label = $('balanceValue');
            if (label) label.textContent = formatBalanceValue(state.settings.balance);
            applyBalanceToPan();
        };
    }
    const resetBalanceBtn = $('resetBalanceBtn');
    if (resetBalanceBtn) {
        resetBalanceBtn.onclick = () => {
            state.settings.balance = 0;
            if (balanceSlider) balanceSlider.value = 0;
            const label = $('balanceValue');
            if (label) label.textContent = 'C';
            applyBalanceToPan();
            showOverlay(t('overlay.centerReset'));
        };
    }
    const fixedColorPicker = $('fixedColorPicker');
    if (fixedColorPicker) {
        fixedColorPicker.oninput = e => { state.settings.fixedColor = e.target.value; };
    }
    const changeModeSelect = $('changeModeSelect');
    if (changeModeSelect) {
        changeModeSelect.onchange = e => { state.settings.changeMode = e.target.value; };
    }
    const sandModeCheckbox = $('sandModeCheckbox');
    if (sandModeCheckbox) {
        sandModeCheckbox.onchange = e => { state.settings.sandMode = e.target.checked; };
    }
    const sandFallRateSlider = $('sandFallRateSlider');
    if (sandFallRateSlider) {
        sandFallRateSlider.oninput = e => { state.settings.sandFallRate = +e.target.value; $('sandFallRateValue').textContent = state.settings.sandFallRate.toFixed(1); };
    }
    const circleAngleOffsetSlider = $('circleAngleOffsetSlider');
    if (circleAngleOffsetSlider) {
        circleAngleOffsetSlider.oninput = e => { state.settings.circleAngleOffset = +e.target.value; $('circleAngleOffsetValue').textContent = `${state.settings.circleAngleOffset}°`; };
    }
    const resetCircleAngleBtn = $('resetCircleAngleBtn');
    if (resetCircleAngleBtn) {
        resetCircleAngleBtn.onclick = () => {
            state.settings.circleAngleOffset = 0;
            const slider = $('circleAngleOffsetSlider');
            const valEl = $('circleAngleOffsetValue');
            if (slider) slider.value = 0;
            if (valEl) valEl.textContent = '0°';
        };
    }
    const persistSettingsCheckbox = $('persistSettingsCheckbox');
    if (persistSettingsCheckbox) {
        persistSettingsCheckbox.onchange = e => { state.settings.persistSettings = e.target.checked; };
    }
    const storeLocalFilesCheckbox = $('storeLocalFilesCheckbox');
    if (storeLocalFilesCheckbox) {
        storeLocalFilesCheckbox.onchange = async e => {
            const nextValue = !!e.target.checked;
            const prevValue = !!state.settings.storeLocalFiles;
            state.settings.storeLocalFiles = nextValue;

            if (prevValue && !nextValue && hasIdbLocalTracksInPlaylist()) {
                const ok = confirm(t('confirm.switchUriMode'));
                if (ok) {
                    await purgeIdbLocalTracksFromPlaylist();
                } else {
                    // 取り消し: 設定を元に戻す
                    state.settings.storeLocalFiles = true;
                    e.target.checked = true;
                    showOverlay(t('overlay.localSaveOn'));
                    return;
                }
            }

            showOverlay(state.settings.storeLocalFiles ? t('overlay.localSaveOn') : t('overlay.localSaveOff'));
            renderStorageList();
        };
    }

    $('autoPlayNextCheckbox').onchange = e => { state.settings.autoPlayNext = e.target.checked; };
    $('stopOnVideoEndCheckbox').onchange = e => { state.settings.stopOnVideoEnd = e.target.checked; };
    
    // Render mode settings
    const renderModeSelect = $('renderModeSelect');
    if (renderModeSelect) {
        renderModeSelect.onchange = e => { 
            state.settings.renderMode = e.target.value; 
            updateRenderModeStatus();
            if (state.settings.renderMode !== 'cpu' && state.gpuAvailable) {
                initGPURenderer();
            }
        };
    }
    
    // Auto-hide UI settings
    const autoHideUICheckbox = $('autoHideUICheckbox');
    if (autoHideUICheckbox) {
        autoHideUICheckbox.checked = state.settings.autoHideUI !== false;
        autoHideUICheckbox.onchange = e => { 
            state.settings.autoHideUI = e.target.checked;
            if (!state.settings.autoHideUI && state.uiTimeout) {
                clearTimeout(state.uiTimeout);
                state.uiTimeout = null;
            }
        };
    }

    const showVideoCheckbox = $('showVideoCheckbox');
    if (showVideoCheckbox) {
        showVideoCheckbox.onchange = e => {
            state.settings.showVideo = e.target.checked;
            updateVideoVisibility();
        };
    }
    const videoModeSelect = $('videoModeSelect');
    if (videoModeSelect) {
        videoModeSelect.onchange = e => {
            state.settings.videoMode = e.target.value;
            updateVideoVisibility();
        };
    }
    const videoFitModeSelect = $('videoFitModeSelect');
    if (videoFitModeSelect) {
        videoFitModeSelect.onchange = e => {
            state.settings.videoFitMode = e.target.value;
            updateVideoVisibility();
        };
    }

    // persistSettingsCheckboxは既に上で処理済みなので重複を避ける

    // Speed select
    const speedSelect = $('speedSelect');
    if (speedSelect) {
        speedSelect.onchange = e => {
            const rate = +e.target.value;
            audio.playbackRate = rate;
            state.settings.playbackRate = rate;
            if (bgVideo.src) bgVideo.playbackRate = rate;
            syncVideoRateAfterChange();
            showOverlay(`⏩ 再生速度: ${rate}x`);
        };
    }

    // Sleep timer buttons
    document.querySelectorAll('.sleep-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const min = +btn.dataset.minutes;
            document.querySelectorAll('.sleep-btn').forEach(b => b.classList.remove('active'));
            if (min === 0) { stopSleepTimer(); showOverlay('⏰ スリープタイマーOFF'); }
            else { startSleepTimer(min); btn.classList.add('active'); }
        });
    });

    setupPresets();
}

function setupPresets() {
    const list = $('colorPresetList');
    if (!list) return;
    
    COLOR_PRESETS.forEach(p => {
        const btn = document.createElement('div');
        btn.className = 'color-preset-btn';
        btn.style.backgroundColor = p.color;
        btn.textContent = p.name;
        btn.onclick = () => {
            state.settings.fixedColor = p.color;
            state.settings.rainbow = false;
            applySettingsToUI();
            showOverlay(t('overlay.colorApplied', { name: p.name }));
        };
        list.appendChild(btn);
    });

    [1, 2, 3].forEach(slot => {
        $(`savePreset${slot}`).onclick = () => savePreset(slot);
        $(`loadPreset${slot}`).onclick = () => loadPreset(slot);
    });
}

function savePreset(slot) {
    const presetData = JSON.stringify(state.settings);
    localStorage.setItem(`visualizerPreset_${slot}`, presetData);
    showOverlay(t('overlay.presetSaved', { slot }));
}

function loadPreset(slot) {
    const saved = localStorage.getItem(`visualizerPreset_${slot}`);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(state.settings, parsed);
            applySettingsToUI();
            updateVideoVisibility();
            applyCanvasResolution();
            if (state.analyser) {
                state.analyser.smoothingTimeConstant = state.settings.smoothing;
                state.analyser.fftSize = state.settings.fftSize;
                applySensitivityToAnalyser();
            }
            showOverlay(t('overlay.presetLoaded', { slot }));
        } catch (e) {
            showOverlay(t('overlay.loadFailed'));
        }
    } else {
        showOverlay(t('overlay.presetEmpty', { slot }));
    }
}

function applySettingsToUI() {
    $('smoothingSlider').value = state.settings.smoothing;
    $('smoothingValue').textContent = state.settings.smoothing.toFixed(2);
    $('sensitivitySlider').value = state.settings.sensitivity;
    $('sensitivityValue').textContent = state.settings.sensitivity.toFixed(1);
    if (!QUALITY_PRESETS[state.settings.fftSize]) state.settings.fftSize = 2048;
    applyQualityPreset(state.settings.fftSize);
    $('qualitySelect').value = state.settings.fftSize;
    $('barCountSelect').value = state.settings.barCount;
    $('showLabelsCheckbox').checked = state.settings.showLabels;
    const fpsSelectUI = $('fpsSelect');
    if (fpsSelectUI) fpsSelectUI.value = state.settings.targetFps || 60;
    $('showVideoCheckbox').checked = state.settings.showVideo;
    $('videoModeSelect').value = state.settings.videoMode;
    $('videoFitModeSelect').value = state.settings.videoFitMode || 'cover';
    $('lowFreqSlider').value = state.settings.lowFreq;
    $('lowFreqValue').textContent = state.settings.lowFreq + 'Hz';
    $('highFreqSlider').value = state.settings.highFreq;
    $('highFreqValue').textContent = (state.settings.highFreq >= 1000 ? (state.settings.highFreq/1000) + 'kHz' : state.settings.highFreq + 'Hz');
    const freqRangeSelectUI = $('freqRangeSelect');
    if (freqRangeSelectUI) {
        let matched = 'custom';
        Object.keys(FREQ_RANGE_PRESETS).forEach(key => {
            const preset = FREQ_RANGE_PRESETS[key];
            if (preset.low === state.settings.lowFreq && preset.high === state.settings.highFreq) {
                matched = key;
            }
        });
        freqRangeSelectUI.value = matched;
    }
    $('glowSlider').value = state.settings.glowStrength;
    $('rainbowCheckbox').checked = state.settings.rainbow;
    $('mirrorCheckbox').checked = state.settings.mirror;
    $('bgBlurSlider').value = state.settings.bgBlur;
    $('bgBlurValue').textContent = state.settings.bgBlur + 'px';
    $('opacitySlider').value = state.settings.opacity;
    $('opacityValue').textContent = state.settings.opacity.toFixed(1);
    const balanceSlider = $('balanceSlider');
    if (balanceSlider) balanceSlider.value = state.settings.balance || 0;
    const balanceValue = $('balanceValue');
    if (balanceValue) balanceValue.textContent = formatBalanceValue(state.settings.balance || 0);
    $('fixedColorPicker').value = state.settings.fixedColor;
    $('changeModeSelect').value = state.settings.changeMode || 'off';
    $('sandModeCheckbox').checked = !!state.settings.sandMode;
    $('sandFallRateSlider').value = state.settings.sandFallRate;
    $('sandFallRateValue').textContent = (state.settings.sandFallRate || 0.6).toFixed(1);
    $('circleAngleOffsetSlider').value = state.settings.circleAngleOffset || 0;
    $('circleAngleOffsetValue').textContent = `${state.settings.circleAngleOffset || 0}°`;
    $('persistSettingsCheckbox').checked = state.settings.persistSettings;
    const storeLocalFilesCheckbox = $('storeLocalFilesCheckbox');
    if (storeLocalFilesCheckbox) storeLocalFilesCheckbox.checked = !!state.settings.storeLocalFiles;
    
    $('autoPlayNextCheckbox').checked = state.settings.autoPlayNext;
    $('stopOnVideoEndCheckbox').checked = state.settings.stopOnVideoEnd;
    
    // Render mode settings
    const renderModeSelect = $('renderModeSelect');
    if (renderModeSelect) renderModeSelect.value = state.settings.renderMode || 'auto';
    updateRenderModeStatus();
    applyBalanceToPan();

    // Volume restore
    if (state.settings.volume !== undefined) {
        els.volSlider.value = state.settings.volume;
        updateVolume();
    }
    // Speed restore
    if (state.settings.playbackRate) {
        audio.playbackRate = state.settings.playbackRate;
        const speedSel = $('speedSelect');
        if (speedSel) speedSel.value = state.settings.playbackRate;
    }

    state.settings.eq.forEach((val, i) => {
        const freq = EQ_FREQS[i];
        const id = freq >= 1000 ? `eq${freq/1000}k` : `eq${freq}`;
        const el = $(id);
        if (el) el.value = val;
    });
}

function openSettings() { 
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
        langSelect.value = currentLang;   // 確実に現在の言語を表示
    }

    els.settingsModal.classList.add('open'); 
    state.settingsOpen = true;
    
    // 設定タブ中はUI非表示ボタンを隠す
    const persistentControls = document.getElementById('persistentControls');
    if (persistentControls) persistentControls.style.display = 'none';
}
function closeSettings() { 
    els.settingsModal.classList.remove('open'); 
    state.settingsOpen = false; 
    // 設定タブを閉じたらUI非表示ボタンを復元
    const persistentControls = document.getElementById('persistentControls');
    if (persistentControls) persistentControls.style.display = '';
}
function saveSettings() { 
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
        currentLang = langSelect.value;
        localStorage.setItem('app_lang', currentLang);
        state.settings.language = currentLang;
    }

    updateLanguageUI();        // 保存時にも確実に反映
    loadDeveloperMessage();
    saveSettingsToStorage(); 
    closeSettings();
    showOverlay(t('overlay.settingsSaved'));
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    $(`tab-${tabId}`).classList.add('active');

    // 音声タブが開かれた時のみデバイスを列挙（権限エラー対策）
    if (tabId === 'audio') {
        enumerateMicDevices();
    } else if (tabId === 'storage') {
        renderStorageList();
    }
}

async function loadDeveloperMessage() {
    try {
        const lang = currentLang || 'ja';

        const response = await fetch(`DEVELOPER_MESSAGE_${lang}.md`);

        if (!response.ok) {
            throw new Error(`Failed to load DEVELOPER_MESSAGE_${lang}.md`);
        }

        const markdown = await response.text();
        const html = simpleMarkdownToHtml(markdown);

        const contentEl = document.getElementById('developerMessageContent');

        if (contentEl) {
            contentEl.innerHTML = html;
        }

    } catch (error) {
        console.warn('Failed to load developer message:', error);

        const contentEl =
            document.getElementById('developerMessageContent');

        if (contentEl) {
            contentEl.textContent = t('devMessage.loadFailed');
        }
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
    html = html.replace(/^### (.+)$/gm, '\n\n<h4 style="margin: 12px 0 6px 0; color: var(--accent-color);">$1</h4>\n\n');
    html = html.replace(/^## (.+)$/gm, '\n\n<h3 style="margin: 14px 0 6px 0; color: var(--accent-color);">$1</h3>\n\n');
    html = html.replace(/^# (.+)$/gm, '\n\n<h2 style="margin: 14px 0 6px 0; color: var(--accent-color);">$1</h2>\n\n');
    html = html.replace(/^---$/gm, '\n\n<hr style="margin: 12px 0; border: none; border-top: 1px solid var(--glass-border);">\n\n');
    
    // 3. リスト要素の変換
    html = html.replace(/^- (.+)$/gm, '<li style="margin-left: 18px; margin-bottom: 2px;">$1</li>');
    // 連続する <li> を <ul> で囲む（隙間対策として内部の改行コードも一撃で消去）
    html = html.replace(/(?:<li[^>]*>.*?<\/li>\n?)+/g, match => {
        const cleanedLi = match.replace(/\n/g, ''); 
        return `\n\n<ul style="margin: 4px 0; padding-left: 18px;">${cleanedLi}</ul>\n\n`;
    });
    
    // 4. インライン装飾（太字、斜体、リンク）
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" style="color: var(--accent-color); text-decoration: underline;">$1</a>');
    
    // 5. 段落（ブロック）処理と「無駄な改行コード」の徹底排除
    const blocks = html.split(/\n{2,}/);
    html = blocks
        .map(block => block.trim())
        .filter(block => block !== '') // 空っぽのブロック（不要な空行）を完全に仕分けして消す
        .map(block => {
            // すでにHTMLブロック要素、またはコードブロックのプレースホルダーの場合はスルー
            if (/^<(h2|h3|h4|ul|ol|hr)/i.test(block) || block.startsWith('%%%CODE_BLOCK_')) {
                return block;
            }
            // 普通のテキストだけを <p> で囲み、段落内の改行は <br> に
            return `<p style="margin: 0 0 6px 0;">${block.replace(/\n/g, '<br>')}</p>`;
        })
        .join(''); // ★最重要：改行（\n）を挟まずにピッタリ結合！
    
    // 6. コードブロックを復元
    codeBlocks.forEach((code, i) => {
        // pre タグのブラウザデフォルトマージンを「margin: 6px 0;」で上書きリセット
        html = html.replace(
            `%%%CODE_BLOCK_${i}%%%`, 
            `<pre style="margin: 6px 0; background: rgba(0,0,0,0.3); padding: 6px; border-radius: 3px; overflow-x: auto;"><code style="white-space: pre;">${code}</code></pre>`
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
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1;
            filter.gain.value = state.settings.eq[i];
            return filter;
        });
        let lastNode = state.eqFilters[0];
        for(let i=1; i<state.eqFilters.length; i++) {
            state.eqFilters[i-1].connect(state.eqFilters[i]);
            lastNode = state.eqFilters[i];
        }
        lastNode.connect(state.analyser);
        state.analyser.connect(state.gainNode);
        setupBalanceNodes();
        state.bufLen = state.analyser.frequencyBinCount;
        state.freqData = new Uint8Array(state.bufLen);
        state.timeData = new Uint8Array(state.bufLen);
    }
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
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
        state.balanceNodes.monoRightGain.gain.value = monoMix * (1 + Math.min(0, p));
        return;
    }
    if (state.panNode) state.panNode.pan.value = p;
}

function formatBalanceValue(v) {
    if (!v) return 'C';
    return v < 0 ? `L${Math.abs(v)}` : `R${v}`;
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

        state.balanceNodes = { splitter, merger, monoGain, monoLeftGain, monoRightGain, stereoLeftGain, stereoRightGain };

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
        console.warn('Balance node init failed:', e);
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
    els.sourceFileBtn.classList.toggle('active', source === 'file');
    els.sourceMicBtn.classList.toggle('active', source === 'mic');
    
    els.progressContainer.classList.toggle('hidden', source === 'mic');
    els.playbackControls.classList.toggle('hidden', source === 'mic');
    
    if (source === 'mic') {
        audio.pause();
        clearPlayTimeout();
        await startMic();
        els.statusText.textContent = t('status.mic');
        updateTopBadge(null, -1);
        updateNowPlayingCustom('マイク入力', 'ライブ入力', '🎤', 'LIVE');
    } else {
        stopMic();
        connectFileSource();
        els.statusText.textContent = state.playlist[state.currentIndex] ? `🎵 ${state.playlist[state.currentIndex].name}` : t('status.idle');
        updateTopBadge(state.playlist[state.currentIndex], state.currentIndex);
        if (state.playlist[state.currentIndex]) {
            updateNowPlayingUI(state.playlist[state.currentIndex], state.currentIndex);
        } else {
            updateNowPlayingCustom('未再生', '--', '🎵', `0/${state.playlist.length}`);
        }
    }
}

async function startMic() {
    initAudioContext();
    
    // Android/Chrome requires user gesture and sometimes multiple resume calls
    if (state.audioCtx.state === 'suspended') {
        await state.audioCtx.resume();
    }
    
    stopMic(); // Clean up previous
    
    try {
        // Android Capacitor環境では事前に権限を要求
        if (isNativeCapacitor()) {
            try {
                const Permissions = window.Capacitor?.Plugins?.Permissions;
                if (Permissions && typeof Permissions.request === 'function') {
                    const permResult = await Permissions.request({ permissions: ['microphone'] });
                    console.log('Permission result:', permResult);
                    if (permResult?.microphone === 'denied') {
                        throw { name: 'NotAllowedError', message: 'マイク権限が拒否されました' };
                    }
                }
            } catch (permErr) {
                console.warn('Permissions plugin error:', permErr);
                // プラグインがない場合はgetUserMediaに任せる
            }
        }
        
        // 一度権限確認のためにラベルなしでデバイスを列挙
        await navigator.mediaDevices.enumerateDevices();
        
        const constraints = {
            audio: state.micDeviceId 
                ? { deviceId: { exact: state.micDeviceId } } 
                : {
                    echoCancellation: false,  // エコーキャンセル無効（ビジュアライザーには不要）
                    noiseSuppression: false,  // ノイズ抑制無効
                    autoGainControl: false    // 自動ゲイン無効
                  }
        };
        
        console.log('Requesting mic with constraints:', constraints);
        state.micStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Mic stream obtained:', state.micStream.id);
        
        // ストリームのトラック情報をログ出力
        const tracks = state.micStream.getAudioTracks();
        console.log('Audio tracks:', tracks.length);
        tracks.forEach((t, i) => {
            console.log(`Track ${i}: label=${t.label}, enabled=${t.enabled}, muted=${t.muted}, readyState=${t.readyState}`);
        });
        
        state.micSource = state.audioCtx.createMediaStreamSource(state.micStream);
        
        // Disconnect file source if any
        if (state.fileSource) {
            try { state.fileSource.disconnect(); } catch(e) {}
        }
        
        state.micSource.connect(state.eqFilters[0]);
        state.gainNode.gain.value = 0; // Prevent feedback
        
        // Double check context state
        if (state.audioCtx.state !== 'running') {
            await state.audioCtx.resume();
        }
        
        console.log('AudioContext state after mic start:', state.audioCtx.state);
        console.log('Analyser connected, bufLen:', state.bufLen);
        
        showOverlay(t('overlay.micStarted'));
    } catch (e) {
        console.error('Mic error:', e);
        let msg = 'マイクアクセスに失敗しました';
        if (e.name === 'NotAllowedError') msg = 'マイク権限が拒否されました';
        else if (e.name === 'NotFoundError') msg = 'マイクが見つかりません';
        
        showOverlay(t('overlay.warn', { msg }));
        alert(`${msg}: ${e.message}`);
        setInputSource('file');
    }
}

function stopMic() {
    if (state.micStream) {
        state.micStream.getTracks().forEach(t => t.stop());
        state.micStream = null;
    }
    if (state.micSource) {
        try { state.micSource.disconnect(); } catch(e) {}
        state.micSource = null;
    }
}

function connectFileSource() {
    initAudioContext();
    if (!state.fileSource) {
        state.fileSource = state.audioCtx.createMediaElementSource(audio);
    }
    // Always ensure it's connected to the EQ chain
    try {
        state.fileSource.connect(state.eqFilters[0]);
    } catch(e) {
        // Already connected or other error
    }
    state.gainNode.gain.value = els.volSlider.value;
}

async function enumerateMicDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        els.micDeviceSelect.innerHTML = mics.map(m => `<option value="${m.deviceId}">${m.label || 'マイク ' + m.deviceId.slice(0,5)}</option>`).join('');
    } catch (e) { console.warn('Device enumeration failed', e); }
}

async function updateMicrophoneInput() {
    state.micDeviceId = state.settings.micDeviceId || '';
    if (els.micDeviceSelect && state.micDeviceId) {
        els.micDeviceSelect.value = state.micDeviceId;
    }
    if (state.inputSource === 'mic') {
        await startMic();
    }
}

function updateEQ(index, gain) { if (state.eqFilters[index]) state.eqFilters[index].gain.value = gain; }
function resetEQ() {
    state.settings.eq = [0, 0, 0, 0, 0, 0, 0, 0];
    state.eqFilters.forEach((f, i) => {
        f.gain.value = 0;
        const freq = EQ_FREQS[i];
        const id = freq >= 1000 ? `eq${freq/1000}k` : `eq${freq}`;
        const el = $(id);
        if (el) el.value = 0;
    });
}

function syncVideoRateAfterChange() {
    state.lastAudioTime = audio.currentTime;
    if (typeof videoSyncCooldown !== 'undefined') videoSyncCooldown = 0.6;
    if (typeof lastVideoSyncCheckTs !== 'undefined') {
        lastVideoSyncCheckTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }
}

// ============== PLAYBACK ==============
let isToggling = false; // 連打防止フラグ

function togglePlay() {
    if (state.inputSource === 'mic') return;
    if (state.playlist.length === 0) return;
    if (state.currentIndex === -1) { playTrack(0); return; }
    if (isToggling) return; // 連打防止
    
    isToggling = true;
    initAudioContext();
    
    if (state.isPlaying) {
        clearPlayTimeout();
        audio.pause();
        state.isPlaying = false;
        updatePlayBtn();
    } else {
        audio.play().then(() => {
            state.isPlaying = true;
            updatePlayBtn();
        }).catch(e => {
            console.error('Play failed:', e);
            state.isPlaying = false;
            updatePlayBtn();
        });
    }
    
    // 連打防止解除（300ms後）
    setTimeout(() => { isToggling = false; }, 300);
}

function toggleShuffle() {
    state.settings.shuffle = !state.settings.shuffle;
    updateShuffleRepeatUI();
    showOverlay(state.settings.shuffle ? t('overlay.shuffleOn') : t('overlay.shuffleOff'));
}

function toggleRepeat() {
    const modes = ['none', 'one', 'all'];
    const idx = modes.indexOf(state.settings.repeatMode);
    state.settings.repeatMode = modes[(idx + 1) % modes.length];
    updateShuffleRepeatUI();
    function getRepeatLabels() {
    return {
        none: t('repeat.none'),
        one: t('repeat.one'),
        all: t('repeat.all')
    };
}
    showOverlay(getRepeatLabels()[state.settings.repeatMode]);
}

function updateShuffleRepeatUI() {
    els.shuffleBtn.classList.toggle('active', state.settings.shuffle);
    const repeatIcons = { none: '🔁', one: '🔂', all: '🔁' };
    els.repeatBtn.textContent = repeatIcons[state.settings.repeatMode];
    els.repeatBtn.classList.toggle('active', state.settings.repeatMode !== 'none');
}

function nextTrack() {
    if (state.playlist.length === 0) return;
    if (state.settings.repeatMode === 'one') {
        playTrack(state.currentIndex);
        return;
    }
    if (state.settings.shuffle) {
        let nextIdx;
        do { nextIdx = Math.floor(Math.random() * state.playlist.length); } while (nextIdx === state.currentIndex && state.playlist.length > 1);
        playTrack(nextIdx);
    } else {
        const nextIdx = (state.currentIndex + 1) % state.playlist.length;
        if (nextIdx === 0 && state.settings.repeatMode === 'none') {
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
    const prevIdx = state.currentIndex <= 0 ? state.playlist.length - 1 : state.currentIndex - 1;
    playTrack(prevIdx);
}

function playTrack(index) {
    if (index < 0 || index >= state.playlist.length) return;
    clearPlayTimeout();
    state.currentIndex = index;
    const track = state.playlist[index];
    console.log('[STATUS] playTrack', track.name);
    els.statusText.textContent = `🎵 [${index + 1}/${state.playlist.length}] ${track.name}`;
    updateTopBadge(track, index);
    updateNowPlayingUI(track, index);
    renderPlaylist();
    
    // 再生中の曲をオーバーレイで表示
    showOverlay(t('overlay.nowPlaying', { title: track.name }), 3000);
    
    if (state.playTimeout) clearTimeout(state.playTimeout);
    
    const requestId = ++state.playRequestId;
    audio.pause();
    audio.currentTime = 0;
    (async () => {
        try {
            const url = await ensureUrlForTrack(track);
            if (requestId !== state.playRequestId) return; // outdated
            audio.src = url;
            audio.load();
            connectFileSource();
            updateVideoVisibility();
            state.playTimeout = setTimeout(() => { 
                audio.play().catch(e => {
                    console.warn("Playback failed:", e);
                    showOverlay(t('overlay.playFailed'));
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
            console.warn('ensureUrlForTrack failed', e);
            showOverlay(t('overlay.urlPrepareFailed'));
            setTimeout(nextTrack, 2000);
        }
    })();
}

function seek() { if (state.inputSource === 'file') audio.currentTime = els.seekBar.value; }
function updateVolume() {
    const v = els.volSlider.value;
    // 対数スケールに近い感覚にするため、2乗を使用
    const volume = v * v;
    audio.volume = volume;
    if (state.inputSource === 'file' && state.gainNode) state.gainNode.gain.value = volume;
    els.volIcon.textContent = v == 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';
    state.settings.volume = +v;
}
function onMetadataLoaded() { els.seekBar.max = audio.duration || 0; updateTimeDisplay(); }
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
function updatePlayBtn() { els.playBtn.textContent = state.isPlaying ? '⏸' : '▶'; }
function handleAudioError(e) { 
    console.error('Audio error:', e); 
    els.statusText.textContent = t('status.playError'); 
    showOverlay(t('overlay.audioError'));
    // エラー時は次の曲へ
    setTimeout(nextTrack, 3000);
}
function formatTime(s) { if (!s || isNaN(s)) return '0:00'; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}`; }

function updateSeekVisuals() {
    if (!els.seekFill) return;
    const duration = audio.duration || 0;
    const current = audio.currentTime || 0;
    const playedPct = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
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
    if (!track) return { title: '未再生', artist: '--', icon: '🎵' };
    let title = track.name || 'Unknown';
    title = title.replace(/\.(mp3|m4a|wav|aac|mp4|webm|mkv|mov|ogg|flac|opus)$/i, '');
    let artist = 'Audio Visualizer';
    if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
    }
    return { title, artist, icon: track.isVideo ? '🎬' : '🎵' };
}

function hashString(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function updateTopBadge(track, index) {
    updateNextUpText(index);

    if (!els.nowPlayingArtSm || !track) return;

    const info = getTrackDisplayInfo(track);
    const base = info.title + info.artist;
    const hue = hashString(base) % 360;

    els.nowPlayingArtSm.style.background =
        `linear-gradient(135deg, hsla(${hue}, 85%, 55%, 0.7), hsla(${(hue + 40) % 360}, 85%, 45%, 0.7))`;

    els.nowPlayingArtSm.textContent = info.icon;
}

function updateNextUpText(currentIndex) {

    const nextIndex = (currentIndex + 1) % state.playlist.length;

    const nextTrack = state.playlist[nextIndex];

    els.nextUpText.textContent = nextTrack ? t("next.track", { name: nextTrack.name }) : t("next.none");
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
    const indexText = index >= 0 ? `${index + 1}/${state.playlist.length}` : `0/${state.playlist.length}`;
    updateNowPlayingCustom(info.title, info.artist, info.icon, indexText);
}

async function handleFiles(files) {
    const allowedExt = new Set(['mp3', 'wav', 'm4a', 'aac', 'mp4', 'webm', 'mkv', 'mov', 'ogg', 'flac', 'opus']);
    const videoExt = new Set(['mp4', 'webm', 'mkv', 'mov']);
    
    const accepted = [];
    files.forEach(file => {
        const name = (file.name || '').toLowerCase();
        const ext = name.includes('.') ? name.split('.').pop() : '';
        const isAudioMime = typeof file.type === 'string' && file.type.startsWith('audio/');
        const isVideoMime = typeof file.type === 'string' && file.type.startsWith('video/');
        if (isAudioMime || isVideoMime || allowedExt.has(ext)) {
            const isVideo = videoExt.has(ext) || isVideoMime;
            accepted.push({ file, isVideo });
        }
    });

    if (accepted.length === 0) {
        showOverlay(t('overlay.noFileSelected'));
        return;
    }

    showOverlay(t('overlay.importingFiles', { count: accepted.length }));

    for (const item of accepted) {
        const file = item.file;
        const filePath = typeof file.path === 'string' ? file.path : '';
        let localRef = null;
        let fileBlob = null;
        if (filePath && state.settings.storeLocalFiles) {
            // パスがあり、かつ保存設定がONの場合のみライブラリに登録
            localRef = `path:${filePath}`;
            upsertLibraryEntry({ ref: localRef, type: 'path', name: file.name, sizeBytes: file.size, isVideo: item.isVideo });
        } else if (filePath) {
            // パスがあるが保存設定がOFFの場合はlocalRefのみ設定（ライブラリには登録しない）
            localRef = `path:${filePath}`;
        } else if (state.settings.storeLocalFiles) {
            try {
                const id = await idbPutLocalFile(file);
                localRef = `idb:${id}`;
                upsertLibraryEntry({ ref: localRef, type: 'idb', name: file.name, sizeBytes: file.size, isVideo: item.isVideo });
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
            source: 'local',
            isVideo: item.isVideo,
            localRef,
            size: file.size,
            ephemeral: false
        });
    }
    renderPlaylist();
    if (state.currentIndex === -1) playTrack(state.playlist.length - accepted.length);
    saveSettingsToStorage();
    
    setTimeout(() => {
        els.statusText.textContent = state.playlist[state.currentIndex] ? `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${state.playlist[state.currentIndex].name}` : t('status.idle');
        updateNextUpText(state.currentIndex);
        showOverlay(t('overlay.filesAdded', { count: accepted.length }));
    }, 500);
}

async function handleLocalFiles(e) {
    await handleFiles(Array.from(e.target.files));
    e.target.value = '';
}

function renderPlaylist() {
    const query = els.playlistSearchInput.value.toLowerCase();
    const filtered = state.playlist.map((track, originalIndex) => ({ ...track, originalIndex }))
                                  .filter(track => track.name.toLowerCase().includes(query));

    if (state.playlist.length === 0) { 
        els.playlistItems.innerHTML = `<div class="playlist-empty">${t('playlist.empty')}</div>`; 
        return; 
    }
    
    if (filtered.length === 0) {
        els.playlistItems.innerHTML = `<div class="playlist-empty">${t('playlist.notFound')}</div>`;
        return;
    }

    els.playlistItems.innerHTML = filtered.map(track => `
        <div class="playlist-item ${track.originalIndex === state.currentIndex ? 'active' : ''}" data-index="${track.originalIndex}" draggable="true">
            <div class="drag-handle" title="ドラッグして移動">☰</div>
            <div class="track-info">
                <span class="name">${track.originalIndex + 1}. ${track.name}</span>
            </div>
            <div class="item-actions">
                <button class="move-btn up" data-index="${track.originalIndex}" title="上に移動">▲</button>
                <button class="move-btn down" data-index="${track.originalIndex}" title="下に移動">▼</button>
                <button class="remove-btn" data-index="${track.originalIndex}" title="削除">✖</button>
            </div>
        </div>
    `).join('');
    
    // ドラッグ&ドロップ処理
    setupPlaylistDragDrop();
    updatePlaylistCount();
}

function removeTracksByLocalRefs(refs) {
    const refSet = new Set(refs);
    const removedIdx = [];
    state.playlist.forEach((t, idx) => {
        if (t && refSet.has(t.localRef)) {
            removedIdx.push(idx);
            if (isBlobUrl(t.url)) {
                try { URL.revokeObjectURL(t.url); } catch {}
            }
        }
    });
    if (removedIdx.length === 0) return;

    // Remove tracks and adjust current index
    const removedBeforeCurrent = removedIdx.filter(i => i < state.currentIndex).length;
    const wasPlayingRemoved = removedIdx.includes(state.currentIndex);

    state.playlist = state.playlist.filter((_, idx) => !removedIdx.includes(idx));
    if (wasPlayingRemoved) {
        audio.pause();
        state.isPlaying = false;
        updatePlayBtn();
        state.currentIndex = -1;
        els.statusText.textContent = t('status.idle');
    } else if (state.currentIndex >= 0) {
        state.currentIndex = Math.max(-1, state.currentIndex - removedBeforeCurrent);
    }
    renderPlaylist();
    updateVideoVisibility();
    saveSettingsToStorage();
}

async function deleteLibraryEntry(ref) {
    if (!ref) return;
    try {
        if (ref.startsWith('idb:')) {
            await idbDeleteLocalFile(ref.slice('idb:'.length));
        } else if (ref.startsWith('app:') && isNativeCapacitor()) {
            const folderImport = window.Capacitor?.Plugins?.LocalFolderImport;
            if (folderImport && typeof folderImport.deleteImportedFiles === 'function') {
                await folderImport.deleteImportedFiles({ paths: [ref.slice('app:'.length)] });
            }
        }
    } catch {
        // ignore deletion errors
    }
    removeTracksByLocalRefs([ref]);
    removeLibraryEntries([ref]);
}

async function deleteAllLibraryEntries() {
    const refs = Object.keys(library);
    if (refs.length === 0) {
        showOverlay(t('overlay.deleteNone'));
        return;
    }
    const ok = confirm(t('confirm.deleteStoredFiles'));
    if (!ok) return;
    for (const ref of refs) {
        await deleteLibraryEntry(ref);
    }
    showOverlay(t('overlay.allDeleted'));
    renderStorageList();
}

function renderStorageList() {
    if (!els.storageList) return;
    const refs = Object.keys(library);
    if (refs.length === 0) {
        els.storageList.innerHTML = `<div class="hint">${t('storage.empty')}</div>`;
        if (els.storageSummary) els.storageSummary.textContent = '';
        return;
    }
    const rows = refs.map(ref => {
        const item = library[ref] || {};
        const size = item.sizeBytes ? formatBytes(item.sizeBytes) : '不明';
        const typeLabel = item.type === 'app' ? '端末' : '内部';
        return `
            <div class="storage-item" data-ref="${ref}" style="padding: 6px 8px; gap: 8px;">
                <div class="storage-meta" style="flex: 1; min-width: 0;">
                    <strong style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.85rem;">${item.name || ref}</strong>
                    <span class="hint" style="font-size: 0.7rem;">${typeLabel} | ${size}</span>
                </div>
                <button class="icon-btn danger" data-delete="${ref}" style="width: 32px; height: 32px; font-size: 0.9rem; flex-shrink: 0;">🗑️</button>
            </div>`;
    }).join('');
    els.storageList.innerHTML = rows;
    els.storageList.querySelectorAll('button[data-delete]').forEach(btn => {
        btn.onclick = () => deleteLibraryEntry(btn.dataset.delete);
    });
    if (els.storageSummary) {
        const totalBytes = refs.reduce((s, r) => s + (library[r]?.sizeBytes || 0), 0);
        els.storageSummary.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-weight: 600; margin-top: 8px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 8px; font-size: 0.85rem;">
                <span>計 ${refs.length} 件</span>
                <span>合計: ${totalBytes ? formatBytes(totalBytes) : '0B'}</span>
            </div>`;
    }
}

let draggedIndex = -1;
let touchStartItem = null;
let touchStartTime = 0;

function setupPlaylistDragDrop() {
    const items = els.playlistItems.querySelectorAll('.playlist-item');
    
    items.forEach(item => {
        // ===== Mouse Drag & Drop Events =====
        item.ondragstart = e => {
            const handle = e.target.closest('.drag-handle');
            if (!handle) {
                e.preventDefault();
                return;
            }
            draggedIndex = +item.dataset.index;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            // Firefox等でドラッグを開始するために必要
            e.dataTransfer.setData('text/plain', draggedIndex);
        };
        
        item.ondragend = e => {
            item.classList.remove('dragging');
            items.forEach(i => i.classList.remove('drag-over'));
            draggedIndex = -1;
        };
        
        item.ondragover = e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const targetIdx = +item.dataset.index;
            if (draggedIndex === -1 || draggedIndex === targetIdx) return;
            item.classList.add('drag-over');
        };
        
        item.ondragleave = e => {
            item.classList.remove('drag-over');
        };
        
        item.ondrop = e => {
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('drag-over');
            
            const targetIndex = +item.dataset.index;
            if (draggedIndex === -1 || draggedIndex === targetIndex) return;
            
            performPlaylistReorder(draggedIndex, targetIndex);
            draggedIndex = -1;
        };
        
        // ===== Touch Events (タッチドラッグ対応) =====
        let touchStartY = 0;
        let touchStartX = 0;
        let touchStartDragHandle = false;
        
        item.addEventListener('touchstart', e => {
            const handle = e.target.closest('.drag-handle');
            if (!handle) return; 
            
            // タッチイベントのデフォルト動作（スクロール等）を防止
            if (e.cancelable) e.preventDefault();
            
            touchStartItem = item;
            touchStartTime = Date.now();
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
            touchStartDragHandle = true;
            
            item.classList.add('dragging');
            item.classList.add('touch-dragging');
        }, { passive: false });
        
        item.addEventListener('touchmove', e => {
            if (!touchStartDragHandle || !touchStartItem) return;
            
            if (e.cancelable) e.preventDefault();
            
            const touch = e.touches[0];
            const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetItem = elementAtPoint?.closest('.playlist-item');
            
            items.forEach(i => i.classList.remove('drag-over'));
            if (targetItem && targetItem !== touchStartItem) {
                targetItem.classList.add('drag-over');
            }
        }, { passive: false });
        
        item.addEventListener('touchend', e => {
            if (!touchStartItem || !touchStartDragHandle) {
                touchStartDragHandle = false;
                return;
            }
            
            const touch = e.changedTouches[0];
            const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetItem = elementAtPoint?.closest('.playlist-item');
            
            if (targetItem && targetItem !== touchStartItem) {
                const dragIdx = +touchStartItem.dataset.index;
                const targetIdx = +targetItem.dataset.index;
                performPlaylistReorder(dragIdx, targetIdx);
            }
            
            item.classList.remove('dragging');
            item.classList.remove('touch-dragging');
            items.forEach(i => i.classList.remove('drag-over'));
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
        } else if (draggedIdx > state.currentIndex && targetIdx <= state.currentIndex) {
            state.currentIndex++;
        }
    }
    
    renderPlaylist();
    saveSettingsToStorage();
    showOverlay(t('overlay.playlistReordered'));
    
    // プレイリストの表示位置を調整（下に移動した場合、タブの上部が隠れないようにする）
    scrollToCurrentPlaylistItem();
}

// プレイリストの現在の曲にスクロール
function scrollToCurrentPlaylistItem() {
    const container = els.playlistItems;
    if (!container) return;
    
    const currentItem = container.querySelector('.playlist-item.active');
    if (currentItem) {
        // 要素が見える位置にスクロール（上部に余白を持たせる）
        const containerRect = container.getBoundingClientRect();
        const itemRect = currentItem.getBoundingClientRect();
        
        // アイテムがコンテナの上部より上にある場合
        if (itemRect.top < containerRect.top) {
            currentItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // アイテムがコンテナの下部より下にある場合
        else if (itemRect.bottom > containerRect.bottom) {
            currentItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }
}

// GPU サポート確認
function checkGPUSupport() {
    try {
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                console.log('GPU Renderer:', renderer);
                state.gpuAvailable = true;
                return true;
            }
            state.gpuAvailable = true;
            return true;
        }
    } catch (e) {
        console.warn('GPU check failed:', e);
    }
    state.gpuAvailable = false;
    return false;
}

// GPU レンダラー初期化（将来的な拡張用）
function initGPURenderer() {
    // renderModeに応じてレンダリング方法を設定
    const mode = state.settings.renderMode;
    
    if (mode === 'cpu') {
        // CPUモード: GPU機能を無効化
        state.gpuRenderer = { enabled: false };
        console.log('Rendering mode: CPU (forced)');
    } else if (state.gpuAvailable) {
        // GPUが利用可能な場合
        try {
            if (typeof OffscreenCanvas !== 'undefined') {
                state.gpuRenderer = {
                    enabled: true,
                    type: 'offscreen'
                };
                console.log('Rendering mode: GPU (OffscreenCanvas)');
            } else {
                // OffscreenCanvasがない場合でもCanvas2Dは通常GPU加速される
                state.gpuRenderer = {
                    enabled: true,
                    type: 'canvas2d'
                };
                console.log('Rendering mode: GPU (Canvas2D hardware accelerated)');
            }
        } catch (e) {
            console.warn('GPU renderer init failed:', e);
            state.gpuRenderer = { enabled: false };
        }
    } else {
        // GPUが利用不可
        state.gpuRenderer = { enabled: false };
        console.log('Rendering mode: CPU (GPU not available)');
    }
    
    updateRenderModeStatus();
}

function updateRenderModeStatus() {
    const statusEl = $('renderModeStatus');
    if (!statusEl) return;
    
    const mode = state.settings.renderMode;
    let status = '';
    
    if (mode === 'auto') {
        if (state.gpuRenderer && state.gpuRenderer.enabled) {
            status = '✓ GPU使用中';
        } else {
            status = '⚠ CPUフォールバック';
        }
    } else if (mode === 'gpu') {
        if (state.gpuRenderer && state.gpuRenderer.enabled) {
            status = '✓ GPU強制';
        } else {
            status = '⚠ GPU非対応';
        }
    } else {
        status = '✓ CPU使用中';
    }
    
    statusEl.textContent = status;
}

async function removeFromPlaylist(index) {
    if (index < 0 || index >= state.playlist.length) return;
    const track = state.playlist[index];
    // ローカルファイルのBlob URLを解放（メモリリーク防止）
    if (track.source === 'local') {
        if (isBlobUrl(track.url)) URL.revokeObjectURL(track.url);
    }
    // fileBlobがあれば参照を削除してGC対象に
    if (track.fileBlob) {
        track.fileBlob = null;
    }
    if (track.source === 'local') {
        if (typeof track.localRef === 'string' && track.localRef.startsWith('idb:')) {
            try {
                await idbDeleteLocalFile(track.localRef.slice('idb:'.length));
            } catch {
                // ignore
            }
        }
        if (typeof track.localRef === 'string' && track.localRef.startsWith('app:') && isNativeCapacitor()) {
            try {
                const folderImport = window.Capacitor?.Plugins?.LocalFolderImport;
                if (folderImport && typeof folderImport.deleteImportedFiles === 'function') {
                    await folderImport.deleteImportedFiles({ paths: [track.localRef.slice('app:'.length)] });
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
            els.statusText.textContent = t('status.idle');
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
    const isCollapsed = els.playlistPanel.classList.toggle('collapsed');
    state.playlistVisible = !isCollapsed;
    els.playlistToggle.textContent = isCollapsed ? '📂' : '✖';
    // 両方のボタンの状態を同期
    if (els.closePlaylistBtn) {
        els.closePlaylistBtn.style.display = isCollapsed ? 'none' : 'block';
    }
}

// ============== UI CONTROLS ==============
function toggleUI() { 
    state.uiVisible = !state.uiVisible; 
    
    els.uiLayer.classList.toggle('hidden', !state.uiVisible); 
    
    if (els.toggleUIBtn) {
        els.toggleUIBtn.innerHTML = state.uiVisible 
            ? '<img src="audio-visualizer-icon-btn360.png" alt="表示" class="btn-icon">' 
            : '<img src="audio-visualizer-icon-btn360.png" alt="非表示" class="btn-icon">';
    }

    if (!state.uiVisible) {
        if (state.settingsOpen) closeSettings();
        if (state.playlistVisible) {
            els.playlistPanel.classList.add('collapsed');
            state.playlistVisible = false;
            if (els.playlistToggle) els.playlistToggle.textContent = '📂';
        }
    } else if (state.settings.autoHideUI) {
        // 少し遅延させて即時リセットを防ぐ
        setTimeout(resetUITimeout, 100);
    }
}

function showOverlay(msg, duration = 2000) {
    els.overlayMsg.textContent = msg;
    els.overlayMsg.classList.remove('hidden', 'fade-out');
    if (duration > 0) {
        setTimeout(() => {
            els.overlayMsg.classList.add('fade-out');
            setTimeout(() => { els.overlayMsg.classList.add('hidden'); els.overlayMsg.classList.remove('fade-out'); }, 400);
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
            showOverlay(t('overlay.sleepStopped'));
        }
        updateSleepTimerStatus();
    }, 1000);
    showOverlay(t('overlay.sleepStart', { minutes }));
    updateSleepTimerStatus();
}
function stopSleepTimer() {
    if (state.sleepTimerId) { clearInterval(state.sleepTimerId); state.sleepTimerId = null; }
    state.sleepTimerEnd = 0;
    updateSleepTimerStatus();
}
function getSleepTimerRemaining() {
    if (!state.sleepTimerEnd) return 0;
    return Math.max(0, Math.ceil((state.sleepTimerEnd - Date.now()) / 60000));
}
function updatePlaylistCount() {
    const el = $('playlistCount');
    if (el) el.textContent = `(${state.playlist.length}曲)`;
}
function updateSleepTimerStatus() {
    const el = $('sleepTimerStatus');
    if (!el) return;
    const rem = getSleepTimerRemaining();
    el.textContent = rem > 0 ? `残り ${rem}分` : '';
}

// ============== EXPORT ==============
function startExport() {
    if (state.inputSource === 'mic') { alert(t('alert.exportBlockedMic')); return; }
    if (!state.playlist[state.currentIndex]) return;
    if (!confirm(t('confirm.exportVideo'))) return;
    state.isExporting = true;
    const stream = cv.captureStream(60);
    state.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
    state.recordedChunks = [];
    state.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) state.recordedChunks.push(e.data); };
    audio.pause(); audio.currentTime = 0;
    state.gainNode.gain.value = 0;
    if (state.uiVisible) toggleUI();
    showOverlay(t('overlay.exporting'), 0);
    state.mediaRecorder.start();
    audio.play();
}
function finishExport() {
    state.mediaRecorder.stop();
    state.isExporting = false;
    if (!state.uiVisible) toggleUI();
    els.overlayMsg.classList.add('hidden');
    state.gainNode.gain.value = els.volSlider.value;
    setTimeout(() => {
        const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `visualizer_${state.playlist[state.currentIndex].name}.webm`;
        a.click();
        alert(t('alert.exportComplete'));
    }, 500);
}

// ============== VISUALIZATION ==============
function getFilteredData() {
    if (!state.analyser) return new Uint8Array(state.settings.barCount);
    state.analyser.getByteFrequencyData(state.freqData);
    state.analyser.getByteTimeDomainData(state.timeData);
    const loIdx = freqToIdx(state.settings.lowFreq);
    const hiIdx = Math.min(freqToIdx(state.settings.highFreq), state.bufLen);
    const out = new Uint8Array(state.settings.barCount);
    const range = hiIdx - loIdx;
    if (range <= 0) return out;
    
    // 対数スケーリングで人間の聴覚に合わせた周波数マッピング
    for (let i = 0; i < state.settings.barCount; i++) {
        const t0 = i / state.settings.barCount;
        const t1 = (i + 1) / state.settings.barCount;
        const startIdx = loIdx + Math.floor(Math.pow(t0, 0.6) * range);
        const endIdx = Math.min(loIdx + Math.floor(Math.pow(t1, 0.6) * range), hiIdx - 1);
        
        if (endIdx >= startIdx) {
            let sum = 0;
            let maxVal = 0;
            for (let j = startIdx; j <= endIdx; j++) {
                const v = state.freqData[j];
                sum += v;
                if (v > maxVal) maxVal = v;
            }
            const avg = sum / (endIdx - startIdx + 1);
            out[i] = Math.round(avg * 0.7 + maxVal * 0.3);
        } else {
            out[i] = state.freqData[Math.min(startIdx, state.bufLen - 1)];
        }
    }
    return out;
}
function updateNumBars() {
    const count = Math.max(16, Math.min(512, state.settings.barCount || 64));
    state.settings.barCount = count;
}
function freqToIdx(f) { return state.audioCtx ? Math.round(f * state.analyser.fftSize / state.audioCtx.sampleRate) : 0; }
function getColor(i, v = 1, total = state.settings.barCount) {
    if (state.settings.rainbow) {
        const baseHue = (i / total) * 360;
        const timeHue = (state.mode === 1 || state.mode === 4) ? (Date.now() * 0.05) : 0;
        const hue = Math.floor((baseHue + timeHue) % 360);
        const lightness = Math.max(0, Math.min(100, Math.round(50 + v * 20)));
        return `hsl(${hue}, 80%, ${lightness}%)`;
    }
    return state.settings.fixedColor;
}

// ============== Display value computation (changeMode + sand) ==============
function ensureFrameBuffers(n) {
    if (!state.displayValues || state.displayValues.length !== n) state.displayValues = new Float32Array(n);
    if (!state.prevLevels || state.prevLevels.length !== n) state.prevLevels = new Float32Array(n);
    if (!state.sandHeights || state.sandHeights.length !== n) state.sandHeights = new Float32Array(n);
    if (!state.curLevels || state.curLevels.length !== n) state.curLevels = new Float32Array(n);
}

function computeDisplayValues(rawFreq, dtSec) {
    const n = rawFreq.length;
    ensureFrameBuffers(n);
    const disp = state.displayValues;
    const prev = state.prevLevels;
    const sand = state.sandHeights;
    const cur_levels = state.curLevels;
    const mode = state.settings.changeMode;
    for (let i = 0; i < n; i++) {
        const cur = Math.max(0, Math.min(1, rawFreq[i] / 255));
        cur_levels[i] = cur; // store raw normalized level for sand
        let v = cur;
        if (mode === 'plus') v = Math.max(0, cur - prev[i]);
        else if (mode === 'plusminus') v = cur - prev[i];
        disp[i] = v;
        // sand update: always uses cur (raw level), not display
        if (state.settings.sandMode) {
            if (cur >= sand[i]) sand[i] = cur;
            else sand[i] = Math.max(0, sand[i] - state.settings.sandFallRate * dtSec);
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
let cachedReduceMotion = false; // matchMediaキャッシュ
let colorsCache = []; // 色配列キャッシュ
let animationFrameId = null; // rAF IDを保存して制御
let appliedBlurPx = -1;
let visualizerBaseAlpha = 1;

// リソースモニター用
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let lastResourceUpdateTime = 0;

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
    
    const fpsEl = $('fpsValue');
    if (fpsEl) fpsEl.textContent = fps + ' fps';
    
    // メモリ使用量
    const memoryEl = $('memoryValue');
    if (memoryEl) {
        if (performance.memory) {
            const usedMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
            memoryEl.textContent = usedMB + ' MB';
        } else {
            memoryEl.textContent = t('common.unsupported');
        }
    }
    
    // GPU状態
    const gpuEl = $('gpuValue');
    if (gpuEl) {
        const gpuEnabled = state.gpuRenderer && state.gpuRenderer.enabled;
        if (gpuEnabled) {
            gpuEl.textContent = 'GPU';
            gpuEl.style.color = '#4f4';
        } else {
            gpuEl.textContent = 'CPU';
            gpuEl.style.color = '#ff4';
        }
    }
}

// matchMediaをキャッシュ
if (window.matchMedia) {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    cachedReduceMotion = motionQuery.matches;
    motionQuery.addEventListener('change', e => { cachedReduceMotion = e.matches; });
}

function draw(ts = 0) {
    try {
        // バックグラウンド中は描画を行わない（復帰時に同期チェックで追従）
        if (document.hidden) {
        animationFrameId = requestAnimationFrame(draw);
        return;
    }

    // Android版も高FPS（設定に応じたフレームレート）
    const targetFps = state.settings.targetFps || 60;
    const minInterval = targetFps > 0 ? (1000 / targetFps) : 0;
    const dtSecRaw = lastDrawTs ? (ts - lastDrawTs) / 1000 : 0;
    if (minInterval > 0 && lastDrawTs && ts - lastDrawTs < minInterval) {
        animationFrameId = requestAnimationFrame(draw);
        return;
    }
    const dtSec = dtSecRaw || (minInterval / 1000);
    lastDrawTs = ts;

    // 背景ぼかしは固定強度で維持
    if (state.settings.videoMode === 'background' && state.settings.bgBlur > 0 && state.settings.showVideo) {
        applyBackgroundBlur(state.settings.bgBlur);
    } else if (appliedBlurPx !== 0) {
        applyBackgroundBlur(0);
    }

    // リソースモニター更新（2秒に1回に削減）
    fpsFrameCount++;
    updateResourceMonitor();

    // 動画と音声の同期チェック（改良版：シーク検出、速度リセット改善）
    if (bgVideo.src && state.isPlaying && state.settings.showVideo && !bgVideo.paused && bgVideo.readyState >= 2) {
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
        } else if (!lastVideoSyncCheckTs || ts - lastVideoSyncCheckTs >= 500) {
            lastVideoSyncCheckTs = ts;
            const videoOffset = getVideoSyncOffset();
            const targetTime = audio.currentTime + videoOffset;
            const timeDiff = bgVideo.currentTime - targetTime;
            const absTimeDiff = Math.abs(timeDiff);
            
            if (absTimeDiff > 2.0) {
                bgVideo.currentTime = targetTime;
                bgVideo.playbackRate = baseRate;
                videoSyncCooldown = 1.5;
            } else if (absTimeDiff > 0.1) {
                if (timeDiff > 0) {
                    bgVideo.playbackRate = baseRate * Math.max(0.95, 1 - absTimeDiff * 0.1);
                } else {
                    bgVideo.playbackRate = baseRate * Math.min(1.05, 1 + absTimeDiff * 0.1);
                }
                videoSyncCooldown = 0.8;
            } else {
                if (Math.abs(bgVideo.playbackRate - baseRate) > 0.01) {
                    bgVideo.playbackRate = baseRate;
                }
            }
        }
    }

    if (state.settings.videoMode === 'background' && state.playlist[state.currentIndex]?.isVideo && state.settings.showVideo) {
        // 背景モード時はCanvasを透明にして動画を直接見せる
        ctx.clearRect(0, 0, W, H);
    } else {
        // 通常時は背景色で塗りつぶし
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, W, H);
    }
    
    if (!state.analyser) {
        animationFrameId = requestAnimationFrame(draw);
        return;
    }
    const fd = getFilteredData();
    if (!fd || fd.length === 0) {
        animationFrameId = requestAnimationFrame(draw);
        return;
    }
    const display = computeDisplayValues(fd, dtSec);
    // Precompute colors for the frame - 配列再利用でメモリ確保を削減
    const nBars = fd.length;
    if (colorsCache.length !== nBars) colorsCache = new Array(nBars);
    for (let i = 0; i < nBars; i++) {
        colorsCache[i] = getColor(i, Math.max(0, Math.min(1, fd[i] / 255)), nBars);
    }
    // Motion preferences - キャッシュされた値を使用
    const reduceMotion = cachedReduceMotion;
    // Shake removed
    
    // Use full screen height for visualization
    const drawH = H;
    const drawStartY = 0;
    // Bars モードは 85%、Monitor モードは 80%（Monitor 框用）、その他は 90%
    const maxH = state.mode === 0 ? (drawH * 0.85) : (state.mode === 6 ? (drawH * 0.80) : (drawH * 0.9));

    // 低 FPSモード時はシャドウを無効化して軽量化
    const originalGlow = state.settings.glowStrength;
    if (state.settings.lowPowerMode || (state.settings.targetFps > 0 && state.settings.targetFps <= 30)) state.settings.glowStrength = 0;

    visualizerBaseAlpha = Math.max(0, Math.min(1, state.settings.opacity));
    ctx.globalAlpha = visualizerBaseAlpha;

    if (state.settings.mirror) {
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
    }

    ctx.save();
    switch (state.mode) {
        case 0: drawBarsFromDisplay(display, colorsCache, maxH, drawH, drawStartY); break;
        case 1: drawWaveform(maxH, drawH, drawStartY); break;
        case 2: drawDigitalBlocks(fd, maxH, drawH, drawStartY); break;
        case 3: drawCircleFromDisplay(display, colorsCache, maxH, drawH, drawStartY); break;
        case 4: drawSpectrum(fd, maxH, drawH, drawStartY); break;
        case 5: drawGalaxy(fd, drawH, drawStartY); break;
        case 6: drawBarsFromDisplay(display, colorsCache, maxH, drawH, drawStartY); break;  // Monitor 時も Bars を描画
        case 7: drawHexagon(fd, drawH, drawStartY); break;
        case 8: drawMirrorBars(fd, maxH, drawH, drawStartY); break;
    }
    ctx.restore();

    // Monitor モード時はビジュアライザーの後に描画（オーバーレイ）
    if (state.mode === 6) {
        drawMonitor(fd, maxH, drawH, drawStartY);
    }

    if (state.settings.mirror) {
        ctx.restore();
    }

    ctx.globalAlpha = 1.0;



    if (state.settings.lowPowerMode || (state.settings.targetFps > 0 && state.settings.targetFps <= 30)) state.settings.glowStrength = originalGlow;
    
    } catch (err) {
        console.error('Draw error:', err);
    }
    // 次のフレームを末尾でスケジュール（エラーが発生しても継続）
    animationFrameId = requestAnimationFrame(draw);
}
// ============== Shake & Sparkles ==============
function computeEnergy(display) {
    let sum = 0, peak = 0, n = display.length;
    for (let i = 0; i < n; i++) { const v = Math.abs(display[i]); sum += v; if (v > peak) peak = v; }
    const avg = sum / Math.max(1, n);
    return Math.max(avg, peak);
}
// Shake and Sparkles features removed

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function applyBackgroundBlur(px) {
    const shouldBlur = state.settings.videoMode === 'background' && state.settings.bgBlur > 0 && state.settings.showVideo;
    const safePx = shouldBlur ? Math.max(0, Math.min(state.settings.bgBlur, px)) : 0;
    if (Math.abs(safePx - appliedBlurPx) < 0.2) return;
    appliedBlurPx = safePx;
    if (safePx > 0) {
        bgVideo.style.willChange = 'filter';
        bgVideo.style.filter = `blur(${safePx}px)`;
        bgVideo.style.webkitFilter = `blur(${safePx}px)`;
    } else {
        bgVideo.style.willChange = 'auto';
        bgVideo.style.filter = 'none';
        bgVideo.style.webkitFilter = 'none';
    }
}

function getVideoSyncOffset() {
    if (state.settings.videoMode === 'background' && state.settings.bgBlur > 0 && state.settings.showVideo) {
        return 0.12;
    }
    return 0.05;
}

function getVideoStartOffset() {
    return Math.max(0.2, getVideoSyncOffset());
}

// Modes (updated bars/circle to use display & sand)
function drawBarsFromDisplay(display, colors, maxH, drawH, drawStartY) {
    const n = display.length; const bw = W / n;
    // バー本数が多い場合は空白を減らす（128本以上で調整開始）
    const gap = n >= 256 ? Math.max(0.5, 2 - (n - 256) / 256) : (n >= 128 ? 1.5 : 2);
    // global glow based on max level
    let peak = 0; for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(display[i])); }
    if (state.settings.glowStrength > 0) {
        ctx.shadowBlur = state.settings.glowStrength * Math.max(0.2, peak);
        ctx.shadowColor = state.settings.rainbow ? '#ffffff' : state.settings.fixedColor;
    }
    for (let i = 0; i < n; i++) {
        const v = Math.max(0, display[i]); const h = v * maxH; const color = colors[i];
        ctx.fillStyle = color;
        ctx.fillRect(i * bw + gap / 2, drawStartY + drawH - h, bw - gap, h);
        // sand marker: use same color as bar
        if (state.settings.sandMode) {
            const sh = state.sandHeights ? state.sandHeights[i] * maxH : 0;
            if (sh > 0) {
                ctx.fillStyle = color; // use bar color, not white
                ctx.globalAlpha = 0.6;
                const y = drawStartY + drawH - sh;
                ctx.fillRect(i * bw + gap / 2, y - 2, bw - gap, 4);
                ctx.globalAlpha = visualizerBaseAlpha;
            }
        }
    }
    ctx.shadowBlur = 0;
}
function drawWaveform(maxH, drawH, drawStartY) {
    const glowEnabled = state.settings.glowStrength >= 5;
    let startIdx = 0; for (let i = 0; i < state.bufLen - 1; i++) { if (state.timeData[i] < 128 && state.timeData[i+1] >= 128) { startIdx = i; break; } }
    ctx.beginPath(); const slice = W / (state.bufLen - startIdx); const centerY = drawStartY + drawH / 2;
    for (let i = startIdx; i < state.bufLen; i++) { const v = state.timeData[i] / 128 - 1; const y = centerY + v * maxH * 0.5; i === startIdx ? ctx.moveTo(0, y) : ctx.lineTo((i - startIdx) * slice, y); }
    ctx.strokeStyle = state.settings.rainbow ? `hsl(${(Date.now() * 0.1) % 360}, 80%, 60%)` : state.settings.fixedColor; ctx.lineWidth = 3;
    if (state.settings.glowStrength >= 5) { ctx.shadowBlur = state.settings.glowStrength * 0.7; ctx.shadowColor = ctx.strokeStyle; }
    ctx.stroke(); ctx.shadowBlur = 0;
}
function drawDigitalBlocks(fd, maxH, drawH, drawStartY) {
    const cols = 32; const rows = 20; const cellW = W / cols; const cellH = drawH / rows;
    for (let i = 0; i < cols; i++) {
        const idx = Math.floor(i / cols * fd.length); const v = fd[idx] / 255; const activeRows = Math.floor(v * rows);
        for (let j = 0; j < rows; j++) { if (rows - j <= activeRows) { ctx.fillStyle = getColor(i, (rows-j)/rows, cols); ctx.fillRect(i * cellW + 2, drawStartY + j * cellH + 2, cellW - 4, cellH - 4); } else { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(i * cellW + 2, drawStartY + j * cellH + 2, cellW - 4, cellH - 4); } }
    }
}
function drawCircleFromDisplay(display, colors, maxH, drawH, drawStartY) {
    const glowEnabled = state.settings.glowStrength >= 5;
    const cx = W / 2, cy = drawStartY + drawH / 2; const r = Math.min(W, drawH) * 0.25; const n = display.length; const circumference = 2 * Math.PI * r; const barW = (circumference / n) * 0.8;
    const angleOffset = ((state.settings.circleAngleOffset || 0) % 360) * Math.PI / 180;
    for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2 + angleOffset; const v = Math.max(0, display[i]); const len = v * maxH * 0.6;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); const color = colors[i]; ctx.fillStyle = color;
        if (glowEnabled && v > 0.3) { ctx.shadowBlur = state.settings.glowStrength * 0.7; ctx.shadowColor = color; }
        ctx.fillRect(r, -barW/2, len, barW); ctx.restore();
        if (state.settings.sandMode) {
            const sh = state.sandHeights ? state.sandHeights[i] * maxH * 0.6 : 0;
            if (sh > 0) {
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
                ctx.fillStyle = color; // use bar color, not white
                ctx.globalAlpha = 0.6;
                ctx.beginPath(); ctx.arc(r + sh, 0, Math.max(1.5, barW * 0.3), 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = visualizerBaseAlpha;
                ctx.restore();
            }
        }
    }
    ctx.shadowBlur = 0;
}
function drawSpectrum(fd, maxH, drawH, drawStartY) {
    const n = fd.length; const bw = W / n; ctx.beginPath(); ctx.moveTo(0, drawStartY + drawH);
    for (let i = 0; i < n; i++) {
        const v = fd[i] / 255; const h = v * maxH; const x = i * bw + bw / 2; const y = drawStartY + drawH - h;
        if (i === 0) ctx.lineTo(x, y); else { const prevX = (i - 1) * bw + bw / 2; const prevY = drawStartY + drawH - (fd[i - 1] / 255) * maxH; const cx = (prevX + x) / 2; ctx.bezierCurveTo(cx, prevY, cx, y, x, y); }
    }
    ctx.lineTo(W, drawStartY + drawH); ctx.closePath(); 
    
    const grad = ctx.createLinearGradient(0, drawStartY + drawH - maxH, 0, drawStartY + drawH); 
    const hue = Math.floor((Date.now() * 0.05) % 360);
    const c = state.settings.rainbow ? `hsl(${hue}, 80%, 60%)` : state.settings.fixedColor; 
    grad.addColorStop(0, c); grad.addColorStop(1, 'transparent'); 
    ctx.fillStyle = grad; ctx.fill(); 
    
    ctx.strokeStyle = state.settings.rainbow ? `hsl(${hue}, 80%, 80%)` : '#fff'; 
    ctx.lineWidth = 2; ctx.stroke();
}
function drawGalaxy(fd, drawH, drawStartY) {
    const glowEnabled = state.settings.glowStrength >= 5;
    const cx = W/2, cy = drawStartY + drawH/2; const bass = fd[0] / 255; ctx.save(); ctx.translate(cx, cy); ctx.rotate(Date.now() * 0.0005);
    const arms = 5; const particlesPerArm = 20;
    for(let i=0; i<arms; i++) {
        for(let j=0; j<particlesPerArm; j++) {
            const progress = j / particlesPerArm; const idx = Math.floor(progress * fd.length); const v = fd[idx] / 255;
            const angle = (i / arms) * Math.PI * 2 + progress * Math.PI * 2; const r = progress * Math.min(W, drawH) * 0.4 + (bass * 50);
            const x = Math.cos(angle) * r; const y = Math.sin(angle) * r; const size = (v * 10 + 2) * (1 - progress * 0.5);
            ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fillStyle = getColor(idx, v, fd.length);
            if(state.settings.glowStrength >= 5) { ctx.shadowBlur = size * 2 * 0.7; ctx.shadowColor = ctx.fillStyle; }
            ctx.fill(); ctx.shadowBlur = 0;
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
    const compact = isPortrait ? (W < 500 || drawH < 420) : (W < 700 || drawH < 420);
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
    const hiIdx = hasRaw ? Math.min(freqToIdx(state.settings.highFreq), state.freqData.length) : 0;
    const startIdx = Math.max(0, Math.min(loIdx, (hasRaw ? state.freqData.length - 1 : 0)));
    const endIdx = Math.max(startIdx + 1, Math.min(hiIdx, (hasRaw ? state.freqData.length : 1)));

    let maxRaw = 0, maxRawIdx = startIdx, sumRaw = 0, rmsSumRaw = 0, spectralSum = 0;
    if (hasRaw) {
        for (let i = startIdx; i < endIdx; i++) {
            const v = state.freqData[i];
            sumRaw += v;
            if (v > maxRaw) { maxRaw = v; maxRawIdx = i; }
            const n = v / 255;
            rmsSumRaw += n * n;
            const freq = i * state.audioCtx.sampleRate / analyser.fftSize;
            spectralSum += freq * v;
        }
    }
    const rawCount = hasRaw ? (endIdx - startIdx) : 1;
    const avgRaw = hasRaw ? (sumRaw / rawCount) : 0;
    const rms = hasRaw ? Math.sqrt(rmsSumRaw / rawCount) : 0;
    const dbLevel = rms > 0.001 ? Math.round(20 * Math.log10(Math.min(1, rms)) * 10) / 10 : -Infinity;
    const dbDisplay = dbLevel === -Infinity ? '-∞' : `${dbLevel}`;
    const crestFactor = rms > 0.001 ? ((maxRaw / 255) / rms).toFixed(2) : '∞';
    const spectralCentroid = (sumRaw > 0 && hasRaw) ? Math.round(spectralSum / sumRaw) : 0;
    const peakFreq = (hasRaw && state.audioCtx && analyser) ? Math.round(maxRawIdx * state.audioCtx.sampleRate / analyser.fftSize) : 0;

    let maxDisp = 0;
    for (let i = 0; i < fd.length; i++) { if (fd[i] > maxDisp) maxDisp = fd[i]; }

    const renderLabel = state.gpuRenderer?.enabled ? 'GPU' : 'CPU';

    const bands = compact
        ? [
            { name: 'LOW  20-250', lo: 20, hi: 250 },
            { name: 'MID  250-2k', lo: 250, hi: 2000 },
            { name: 'HIGH 2k-16k', lo: 2000, hi: 16000 },
        ]
        : [
            { name: 'SUB  20-60', lo: 20, hi: 60 },
            { name: 'LOW  60-250', lo: 60, hi: 250 },
            { name: 'MID  250-500', lo: 250, hi: 500 },
            { name: 'UPPER 500-2k', lo: 500, hi: 2000 },
            { name: 'HIGH 2k-8k', lo: 2000, hi: 8000 },
            { name: 'PRESENCE 8k-16k', lo: 8000, hi: 16000 },
        ];

    const headerLines = compact ? 1 : 2;
    const audioLines = compact ? 4 : 5;
    const textColW = compact ? 170 : 210;
    const bandLabelW = compact ? 68 : 84;

    let showBands = drawH >= (isPortraitPhone ? 200 : (compact ? 260 : 380));
    const bandHeightTotal = showBands ? (bands.length * (bandHeight + bandGap) - bandGap) : 0;
    const textH = (headerLines + audioLines) * lineH;
    const bandsH = showBands ? (lineH + bandHeightTotal) : 0;

    // 常にsideLayout（数値左 + バンド右）を使用
    const useSideLayout = true;
    
    // sideLayout の高さ（数値とバンドの同じ高さ、SYS テキスト用スペース含む）
    const sideBoxH = padding * 2 + Math.max(textH, bandsH);
    
    // 幅：全画面幅を使用（Monitor 枠をなるべく小さく）
    const boxW = W - 24;
    
    let boxH = sideBoxH;
    let finalBoxH = boxH;

    ctx.fillStyle = 'rgba(0,0,0,0.78)';;
    ctx.strokeStyle = state.settings.rainbow ? `hsl(${hue}, 80%, 60%)` : state.settings.fixedColor;
    ctx.lineWidth = 2;
    ctx.fillRect(boxX, boxY, boxW, finalBoxH);
    ctx.strokeRect(boxX, boxY, boxW, finalBoxH);

    ctx.font = `${compact ? 11 : 12}px monospace`;
    let y = boxY + padding + (compact ? 10 : 11);

    ctx.fillStyle = '#4fc3f7';
    ctx.fillText('◆ MONITOR', boxX + padding, y);
    if (!compact) { ctx.fillStyle = '#bbb'; ctx.fillText('AUDIO ANALYSIS', boxX + padding + 75, y); }
    y += lineH;

    ctx.fillStyle = '#fff';
    const peakColor = maxRaw < 100 ? '#4fc3f7' : (maxRaw < 180 ? '#fff' : '#ff6b6b');
    ctx.fillStyle = peakColor;
    ctx.fillText(`PEAK: ${maxRaw}/255  dB: ${dbDisplay}dB`, boxX + padding, y); y += lineH;
    ctx.fillStyle = '#fff';
    ctx.fillText(`RMS: ${(rms * 100).toFixed(1)}%  Crest: ${crestFactor}`, boxX + padding, y); y += lineH;
    ctx.fillText(`Spectrum: ${spectralCentroid}Hz`, boxX + padding, y); y += lineH;
    ctx.fillText(`PEAK freq: ${peakFreq || 'N/A'}Hz`, boxX + padding, y); y += lineH;

    if (showBands) {
        if (useSideLayout) {
            const bandX = boxX + padding + textColW;
            let yB = boxY + padding + (compact ? 10 : 11);

            ctx.fillStyle = '#4fc3f7';
            ctx.fillText('◆ FREQ BANDS', bandX, yB); yB += lineH;

            for (let i = 0; i < bands.length; i++) {
                const b = bands[i];
                let bandVal = 0, bandCount = 0;
                if (hasRaw) {
                    const bLo = Math.max(startIdx, Math.min(freqToIdx(b.lo), state.freqData.length - 1));
                    const bHi = Math.max(bLo + 1, Math.min(freqToIdx(b.hi), state.freqData.length));
                    let s = 0;
                    for (let k = bLo; k < bHi; k++) { s += state.freqData[k]; bandCount++; }
                    bandVal = s / Math.max(1, bandCount);
                }
                ctx.fillStyle = '#bbb';
                ctx.fillText(b.name, bandX, yB + bandHeight - 1);
                const barX = bandX + bandLabelW;
                const barW = Math.max(40, (boxX + boxW - padding) - barX);
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(barX, yB, barW, bandHeight);
                const w = (bandVal / 255) * barW;
                const bandRatio = bandVal / 255;
                const bandColor = bandRatio < 0.3 ? '#4fc3f7' : (bandRatio < 0.6 ? '#00d084' : (bandRatio < 0.8 ? '#ffd700' : '#ff6b6b'));
                ctx.fillStyle = bandColor;
                ctx.fillRect(barX, yB, w, bandHeight);
                yB += bandHeight + bandGap;
            }
        } else {
            ctx.fillStyle = '#4fc3f7';
            ctx.fillText('◆ FREQ BANDS', boxX + padding, y); y += lineH;

            for (let i = 0; i < bands.length; i++) {
                const b = bands[i];
                let bandVal = 0, bandCount = 0;
                if (hasRaw) {
                    const bLo = Math.max(startIdx, Math.min(freqToIdx(b.lo), state.freqData.length - 1));
                    const bHi = Math.max(bLo + 1, Math.min(freqToIdx(b.hi), state.freqData.length));
                    let s = 0;
                    for (let k = bLo; k < bHi; k++) { s += state.freqData[k]; bandCount++; }
                    bandVal = s / Math.max(1, bandCount);
                }
                ctx.fillStyle = '#bbb';
                ctx.fillText(b.name, boxX + padding, y + bandHeight - 1);
                const barX = boxX + padding + (compact ? 92 : 100);
                const barW = boxW - padding * 2 - (compact ? 92 : 100);
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(barX, y, barW, bandHeight);
                const w = (bandVal / 255) * barW;
                const bandRatio = bandVal / 255;
                const bandColor = bandRatio < 0.3 ? '#4fc3f7' : (bandRatio < 0.6 ? '#00d084' : (bandRatio < 0.8 ? '#ffd700' : '#ff6b6b'));
                ctx.fillStyle = bandColor;
                ctx.fillRect(barX, y, w, bandHeight);
                y += bandHeight + bandGap;
            }
        }
    }
}
function drawHexagon(fd, drawH, drawStartY) {
    const glowEnabled = state.settings.glowStrength >= 5;
    const cx = W/2, cy = drawStartY + drawH/2; const maxR = Math.min(W, drawH) * 0.4; const layers = 10;
    for(let i=0; i<layers; i++) {
        const idx = Math.floor(i / layers * fd.length); const v = fd[idx] / 255; const r = (i + 1) / layers * maxR * (1 + v * 0.5);
        ctx.beginPath(); for(let j=0; j<6; j++) { const angle = j * Math.PI / 3 + (i%2 ? 0 : Math.PI/6) + Date.now() * 0.0002 * (i+1); const x = cx + Math.cos(angle) * r; const y = cy + Math.sin(angle) * r; j===0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.closePath();
        ctx.strokeStyle = getColor(idx, v, fd.length); ctx.lineWidth = 2 + v * 5; if(state.settings.glowStrength >= 5) { ctx.shadowBlur = 10 * 0.7; ctx.shadowColor = ctx.strokeStyle; } ctx.stroke(); ctx.shadowBlur = 0;
    }
}
function drawMirrorBars(fd, maxH, drawH, drawStartY) {
    const glowEnabled = state.settings.glowStrength >= 5;
    const n = fd.length; const bw = W / n; const cy = drawStartY + drawH / 2;
    for (let i = 0; i < n; i++) {
        const v = fd[i] / 255; const h = v * maxH * 0.5; const color = getColor(i, v, n);
        if (glowEnabled && v > 0.3) { ctx.shadowBlur = state.settings.glowStrength * 0.7; ctx.shadowColor = color; }
        ctx.fillStyle = color; ctx.fillRect(i * bw + 1, cy - h, bw - 2, h); ctx.fillRect(i * bw + 1, cy, bw - 2, h); ctx.shadowBlur = 0;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 初回翻訳
    updateLanguageUI();
    loadDeveloperMessage();
    init().catch(err => {
        console.error('Init failed:', err);
    });
});

if (!window.__audioVisualizerBgGuardInstalled) {
  window.__audioVisualizerBgGuardInstalled = true;

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (typeof syncNativeMediaNotification === 'function' && typeof state !== 'undefined' && state.isPlaying) {
        syncNativeMediaNotification(false);
      }

      if (typeof updateMediaSessionMetadata === 'function') {
        updateMediaSessionMetadata();
      }
    }
  });
}

(() => {
  if (window.__layoutViewportFixInstalled) return;
  window.__layoutViewportFixInstalled = true;

  const updateViewportLayout = () => {
    const vv = window.visualViewport;
    const width = Math.max(
      1,
      Math.round((vv && vv.width) || window.innerWidth || document.documentElement.clientWidth || 0)
    );
    const height = Math.max(
      1,
      Math.round((vv && vv.height) || window.innerHeight || document.documentElement.clientHeight || 0)
    );

    document.documentElement.style.setProperty('--app-width', `${width}px`);
    document.documentElement.style.setProperty('--app-height', `${height}px`);

    const cv = document.getElementById('cv');
    if (cv) {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
      cv.style.width = '100%';
      cv.style.height = '100%';
    }

    const video = document.getElementById('videoContainer');
    if (video && !video.classList.contains('background-mode')) {
      video.style.left = '50%';
      video.style.transform = 'translateX(-50%) translateZ(0)';
    }
  };

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(updateViewportLayout, 80);
  };

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('DOMContentLoaded', schedule, { once: true });

  schedule();
})();


// ==================== スマホ初期化・隙間対策 ====================
// 起動直後Canvasサイズを強制修正
function forceCanvasFix() {
    applyCanvasResolution(true);   // true = 強制モード
}

// 起動後すぐに複数回実行
setTimeout(forceCanvasFix, 50);
setTimeout(forceCanvasFix, 700);
