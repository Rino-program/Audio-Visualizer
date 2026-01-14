/**
 * Audio Visualizer Pro V7
 * - Removed YouTube
 * - Improved Input Source Switching (File / Mic)
 * - Microphone Device Selection
 */

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
    lastSyncTime: 0,
    lastAudioTime: 0,  // シーク検出用
    
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
    
    // Visualization data
    freqData: null,
    timeData: null,
    bufLen: 0,
    displayValues: null,
    prevLevels: null,
    sandHeights: null,
    curLevels: null,
    
    // Race condition protection
    playRequestId: 0,
    
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
        showVideo: true,
        videoMode: 'window', // 'window' or 'background'
        videoFitMode: 'cover', // 'cover', 'contain', 'fill'
        repeatMode: 'none',  // 'none', 'one', 'all'
        shuffle: false,
        gDriveClientId: '',
        gDriveApiKey: '',
        eq: [0, 0, 0, 0, 0, 0, 0, 0],
        playbackRate: 1.0,
        autoPlayNext: true,
        stopOnVideoEnd: false,
        // New visualization settings
        changeMode: 'off', // 'off' | 'plus' | 'plusminus'
        sandMode: false,
        sandFallRate: 0.6, // per second
        circleAngleOffset: 0,
        // GPU rendering settings
        renderMode: 'auto', // 'auto', 'gpu', 'cpu'
        // UI auto-hide settings
        autoHideUI: true
    }
};

// ============== BLOB URL CACHE ==============
function isBlobUrl(url) { return typeof url === 'string' && url.startsWith('blob:'); }

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
    // Direct URL (http/https)
    if (track.url && (track.url.startsWith('http://') || track.url.startsWith('https://'))) {
        return track.url;
    }
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

const EQ_FREQS = [60, 170, 350, 1000, 3000, 6000, 12000, 14000];

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
    playlistPanel: $('playlistPanel'),
    playlistToggle: $('playlistToggle'),
    closePlaylistBtn: $('closePlaylistBtn'),
    playlistItems: $('playlistItems'),
    playlistSearchInput: $('playlistSearchInput'),
    clearPlaylistBtn: $('clearPlaylistBtn'),
    fileInput: $('fileInput'),
    gDriveBtn: $('gDriveBtn'),
    toggleUIBtn: $('toggleUIBtn'),
    fullscreenBtn: $('fullscreenBtn'),
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
    playbackControls: $('playbackControls'),
    videoContainer: $('videoContainer'),
    closeVideoBtn: $('closeVideoBtn'),
    toggleVideoModeBtn: $('toggleVideoModeBtn'),
    lowPowerModeCheckbox: $('lowPowerModeCheckbox'),
    showVideoCheckbox: $('showVideoCheckbox'),
    videoModeSelect: $('videoModeSelect'),
    autoPlayNextCheckbox: $('autoPlayNextCheckbox'),
    stopOnVideoEndCheckbox: $('stopOnVideoEndCheckbox'),
    persistSettingsCheckbox: $('persistSettingsCheckbox'),
    sortPlaylistBtn: $('sortPlaylistBtn'),
    sortMenu: $('sortMenu'),
    renderModeSelect: $('renderModeSelect'),
    renderModeStatus: $('renderModeStatus'),
    autoHideUICheckbox: $('autoHideUICheckbox')
};

let W, H;
let topBarH = 0;
let bottomBarH = 0;

// Safari/iOS対応：動的な高さ調整
function setAppHeight() {
    // Safari/iOSでの100vh問題を解決
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}

// ============== GPU RENDERING ==============
function checkGPUSupport() {
    try {
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                console.log('GPU Renderer:', renderer);
            }
            state.gpuAvailable = true;
            return true;
        }
    } catch (e) {
        console.warn('WebGL not available:', e);
    }
    state.gpuAvailable = false;
    return false;
}

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

// ============== INITIALIZATION ==============
function init() {
    loadSettings();
    
    // GPU サポートチェック
    checkGPUSupport();
    initGPURenderer();
    
    // Safari/iOS対応：初期化時に高さを設定
    setAppHeight();
    
    resize();
    window.addEventListener('resize', resize);
    
    // Safari/iOS対応：リサイズ・スクロール・向き変更時に高さを再計算
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            setAppHeight();
            resize();
            // Monitor モードの場合は明示的に再描画
            if (state.mode === 'monitor') {
                requestAnimationFrame(() => {
                    drawMonitor();
                });
            }
        }, 200);
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
        if (bgVideo.src && state.settings.showVideo) {
            bgVideo.play().catch(() => {});
        }
    });
    audio.addEventListener('playing', () => {
        if (bgVideo.src && state.settings.showVideo) {
            // 音声が実際に再生開始された瞬間に動画の時間を同期
            bgVideo.currentTime = audio.currentTime + 0.2;
            bgVideo.play().catch(() => {});
        }
        const track = state.playlist[state.currentIndex];
        if (track) els.statusText.textContent = `🎵 ${track.name}`;
    });
    audio.addEventListener('waiting', () => {
        if (bgVideo.src) bgVideo.pause();
        els.statusText.textContent = '⏳ 読み込み中...';
    });
    audio.addEventListener('pause', () => { 
        state.isPlaying = false; 
        updatePlayBtn(); 
        bgVideo.pause(); 
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
    audio.addEventListener('seeking', () => { if (bgVideo.src) bgVideo.currentTime = audio.currentTime + 0.2; });
    audio.addEventListener('seeked', () => { if (bgVideo.src) bgVideo.currentTime = audio.currentTime + 0.2; });

    bgVideo.addEventListener('error', () => {
        console.warn('Video load failed');
        // MP3等の音声ファイルの場合はエラーメッセージを表示しない
        const currentTrack = state.playlist[state.currentIndex];
        if (currentTrack && currentTrack.isVideo) {
            showOverlay('⚠️ 動画の読み込みに失敗しました');
        }
        els.videoContainer.classList.add('hidden');
    });
    bgVideo.addEventListener('ended', () => {
        if (state.settings.stopOnVideoEnd && state.settings.showVideo) {
            audio.pause();
            state.isPlaying = false;
            updatePlayBtn();
            showOverlay('⏹ 動画終了により停止しました');
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
        showOverlay(`📊 モード: ${modeName}`);
    };
    els.toggleUIBtn.addEventListener('click', e => {
        e.preventDefault();
        toggleUI();
    });
    // Initialize toggle button label
    els.toggleUIBtn.textContent = state.uiVisible ? '🔳' : '🔲';
    els.fullscreenBtn.onclick = toggleFullscreen;
    els.openSettingsBtn.onclick = openSettings;
    els.closeSettingsBtn.onclick = closeSettings;
    els.saveSettingsBtn.onclick = saveSettings;
    els.resetAllSettingsBtn.onclick = () => {
        if (confirm('すべての設定を初期状態に戻しますか？')) {
            localStorage.removeItem('audioVisualizerSettingsV7');
            location.reload();
        }
    };
    els.exportBtn.onclick = startExport;
    els.playlistToggle.onclick = togglePlaylist;
    els.closePlaylistBtn.onclick = togglePlaylist;
    els.playlistSearchInput.oninput = renderPlaylist;
    els.clearPlaylistBtn.onclick = () => {
        if (confirm('プレイリストをすべてクリアしますか？')) {
            state.playlist.forEach(t => { if (t.source === 'local') URL.revokeObjectURL(t.url); });
            state.playlist = [];
            state.currentIndex = -1;
            audio.pause();
            state.isPlaying = false;
            updatePlayBtn();
            updateVideoVisibility();
            renderPlaylist();
            els.statusText.textContent = '待機中...';
            saveSettingsToStorage();
            showOverlay('✅ プレイリストをクリアしました');
        }
    };
    
    // ソートメニューの処理
    if (els.sortPlaylistBtn && els.sortMenu) {
        els.sortPlaylistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            els.sortMenu.classList.toggle('show');
        });
        
        // sortMenu内のボタンにイベントを登録
        els.sortMenu.querySelectorAll('.sort-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sortType = btn.dataset.sort;
                if (sortType) {
                    sortPlaylist(sortType);
                }
                els.sortMenu.classList.remove('show');
            });
        });
        
        // メニュー外クリックで閉じる（重複登録を避けるため、一度だけ登録）
        document.addEventListener('click', (e) => {
            if (els.sortMenu && els.sortPlaylistBtn && 
                !els.sortMenu.contains(e.target) && 
                e.target !== els.sortPlaylistBtn) {
                els.sortMenu.classList.remove('show');
            }
        }, true);  // キャプチャフェーズで実行
    }
    
    els.fileInput.onchange = handleLocalFiles;
    // Ensure the playlist "追加" control opens the file picker reliably
    try {
        const fileBtn = document.querySelector('.playlist-panel .file-btn');
        // If the control is a <label> or already contains an <input type="file">,
        // the native click will forward to the input. Avoid programmatic click
        // to prevent duplicate change events.
        if (fileBtn) {
            const hasInput = fileBtn.querySelector && fileBtn.querySelector('input[type=file]');
            const isLabel = fileBtn.tagName && fileBtn.tagName.toLowerCase() === 'label';
            if (!hasInput && !isLabel) {
                fileBtn.addEventListener('click', e => {
                    const input = document.getElementById('fileInput');
                    if (!input) return;
                    input.click();
                });
            }
        }
    } catch (err) { console.warn('fileBtn bind failed', err); }
    els.gDriveBtn.onclick = openGDrivePicker;
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
    
    setupSettingsInputs();
    initDraggableVideo();
    initDraggablePlaylist();
    applySettingsToUI();
    updateShuffleRepeatUI();
    
    // Drag & Drop
    document.body.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    // Drag & Drop
    document.body.addEventListener('dragover', e => {
        e.preventDefault();
        document.body.classList.add('drag-over');
    });
    document.body.addEventListener('dragleave', e => {
        e.preventDefault();
        document.body.classList.remove('drag-over');
    });
    document.body.addEventListener('drop', e => {
        e.preventDefault();
        document.body.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleFiles(files);
        }
    });

    // Auto-hide UI
    document.addEventListener('mousemove', resetUITimeout);
    document.addEventListener('mousedown', resetUITimeout);
    document.addEventListener('touchstart', resetUITimeout);
    document.addEventListener('keydown', e => {
        resetUITimeout();
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch(e.code) {
            case 'Space': e.preventDefault(); togglePlay(); break;
            case 'ArrowLeft': prevTrack(); break;
            case 'ArrowRight': nextTrack(); break;
            case 'ArrowUp': 
                e.preventDefault(); 
                els.volSlider.value = Math.min(1, +els.volSlider.value + 0.1); 
                updateVolume(); 
                showOverlay(`🔊 音量: ${Math.round(audio.volume * 100)}%`);
                break;
            case 'ArrowDown': 
                e.preventDefault(); 
                els.volSlider.value = Math.max(0, +els.volSlider.value - 0.1); 
                updateVolume(); 
                showOverlay(`🔉 音量: ${Math.round(audio.volume * 100)}%`);
                break;
            case 'KeyF': toggleFullscreen(); break;
            case 'KeyH': e.preventDefault(); toggleUI(); break;
            case 'KeyV': 
                state.settings.showVideo = !state.settings.showVideo; 
                updateVideoVisibility(); 
                applySettingsToUI(); 
                showOverlay(state.settings.showVideo ? '📺 動画表示: ON' : '📺 動画表示: OFF');
                break;
            case 'KeyL': 
                state.settings.lowPowerMode = !state.settings.lowPowerMode; 
                applySettingsToUI(); 
                showOverlay(state.settings.lowPowerMode ? '🔋 低電力モード: ON' : '⚡ 低電力モード: OFF'); 
                break;
            case 'KeyR': 
                state.settings.rainbow = !state.settings.rainbow; 
                applySettingsToUI(); 
                showOverlay(state.settings.rainbow ? '🌈 虹色モード: ON' : '🎨 虹色モード: OFF'); 
                break;
            case 'KeyX': 
                state.settings.mirror = !state.settings.mirror; 
                applySettingsToUI(); 
                showOverlay(state.settings.mirror ? '🪞 左右反転: ON' : '🪞 左右反転: OFF'); 
                break;
            case 'KeyS': toggleShuffle(); applySettingsToUI(); break;
            case 'KeyP': toggleRepeat(); applySettingsToUI(); break;
            case 'KeyM': 
                state.mode = (state.mode + 1) % 11; 
                els.modeSelect.value = state.mode;
                const modeName = els.modeSelect.options[els.modeSelect.selectedIndex].text;
                showOverlay(`📊 モード: ${modeName}`);
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
    
    // タップ操作やマウス移動でUIを表示
    if (!state.uiVisible) {
        toggleUI();
    }
    
    if (state.uiTimeout) clearTimeout(state.uiTimeout);
    
    // UI自動非表示が無効の場合は何もしない
    if (!state.settings.autoHideUI) return;
    
    // 設定画面やプレイリストが開いている間、またはマウスがUI上にある間は消さない
    const isOverUI = e && (e.target.closest('.top-bar') || e.target.closest('.controls-bar') || e.target.closest('.settings-modal') || e.target.closest('.playlist-container'));

    if (state.isPlaying && !state.settingsOpen && !state.playlistVisible && !isOverUI) {
        state.uiTimeout = setTimeout(() => {
            if (state.isPlaying && !state.settingsOpen && !state.playlistVisible && state.uiVisible && state.settings.autoHideUI) {
                toggleUI();
            }
        }, 5000);
    }
}

// プレイリストパネルのドラッグ機能
function initDraggablePlaylist() {
    const panel = els.playlistPanel;
    const header = panel.querySelector('.playlist-header h3');
    if (!header) return;
    
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    // ドラッグハンドル用のスタイルを追加
    header.style.cursor = 'move';
    header.title = 'ドラッグして移動';
    
    // 保存された位置を復元
    const savedPos = localStorage.getItem('playlistPanelPos');
    if (savedPos) {
        try {
            const { left, top } = JSON.parse(savedPos);
            panel.style.left = left;
            panel.style.top = top;
            panel.style.right = 'auto';
        } catch(e) {}
    }
    
    const startDragging = (clientX, clientY) => {
        isDragging = true;
        panel.classList.add('dragging');
        startX = clientX;
        startY = clientY;
        const rect = panel.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
    };
    
    const constrainPosition = (x, y) => {
        const panelRect = panel.getBoundingClientRect();
        const maxX = window.innerWidth - panelRect.width;
        const maxY = window.innerHeight - panelRect.height;
        return {
            x: Math.max(0, Math.min(x, maxX)),
            y: Math.max(0, Math.min(y, maxY))
        };
    };
    
    const onMove = (clientX, clientY) => {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        const { x, y } = constrainPosition(initialX + dx, initialY + dy);
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
        panel.style.right = 'auto';
    };
    
    const stopDragging = () => {
        if (!isDragging) return;
        isDragging = false;
        panel.classList.remove('dragging');
        localStorage.setItem('playlistPanelPos', JSON.stringify({
            left: panel.style.left,
            top: panel.style.top
        }));
    };
    
    // Mouse events
    header.addEventListener('mousedown', e => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        e.preventDefault();
        startDragging(e.clientX, e.clientY);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    
    function onMouseMove(e) {
        onMove(e.clientX, e.clientY);
    }
    
    function onMouseUp() {
        stopDragging();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
    
    // Touch events
    header.addEventListener('touchstart', e => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        e.preventDefault();
        const touch = e.touches[0];
        startDragging(touch.clientX, touch.clientY);
    }, { passive: false });
    
    header.addEventListener('touchmove', e => {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        onMove(touch.clientX, touch.clientY);
    }, { passive: false });
    
    header.addEventListener('touchend', stopDragging);
    header.addEventListener('touchcancel', stopDragging);
}

function initDraggableVideo() {
    const container = els.videoContainer;
    const handle = container.querySelector('.video-handle');
    let isDragging = false;
    let startX, startY, initialX, initialY;
    let isFirstDrag = true; // 初回ドラッグフラグ

    // 保存された位置を復元
    const savedPos = localStorage.getItem('videoWindowPos');
    if (savedPos) {
        const { left, top } = JSON.parse(savedPos);
        container.style.left = left;
        container.style.top = top;
        container.style.transform = 'none';
        isFirstDrag = false; // 位置が保存されている場合は初回ではない
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
        const maxX = window.innerWidth - containerRect.width;
        const maxY = window.innerHeight - containerRect.height;
        
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

    function stopDragging() {
        if (!isDragging) return;
        isDragging = false;
        container.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', stopDragging);
        
        // 位置を保存
        localStorage.setItem('videoWindowPos', JSON.stringify({
            left: container.style.left,
            top: container.style.top
        }));
    }
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
    
    // ウィンドウモードで位置が未設定なら中央下に配置
    if (state.settings.videoMode === 'window' && !localStorage.getItem('videoWindowPos')) {
        container.style.top = 'auto';
        container.style.bottom = '120px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
    }

    // 負荷軽減: 背景ぼかしの最適化
    // ウィンドウモード時は背景ぼかしを適用しない
    if (state.settings.videoMode === 'background' && state.settings.bgBlur > 0) {
        bgVideo.style.willChange = 'filter'; // GPUアクセラレーションを有効化
        bgVideo.style.filter = `blur(${state.settings.bgBlur}px)`;
        bgVideo.style.webkitFilter = `blur(${state.settings.bgBlur}px)`;
    } else {
        bgVideo.style.willChange = 'auto';
        bgVideo.style.filter = 'none';
        bgVideo.style.webkitFilter = 'none';
    }
    
    if (isVideo && state.settings.showVideo) {
        if (bgVideo.src !== track.url) {
            bgVideo.src = track.url;
            bgVideo.playbackRate = 1.0; // 再生速度をリセット
            
            // ロード完了後に時間を合わせる（MVを0.05秒先に）
            const onLoaded = () => {
                bgVideo.currentTime = audio.currentTime + 0.05;
                if (state.isPlaying) bgVideo.play().catch(() => {});
                bgVideo.removeEventListener('loadedmetadata', onLoaded);
            };
            bgVideo.addEventListener('loadedmetadata', onLoaded);
        }
    } else {
        bgVideo.pause();
        bgVideo.src = '';
    }
}

function resize() {
    W = cv.width = window.innerWidth;
    H = cv.height = window.innerHeight;
    // Recalculate UI heights on resize
    requestAnimationFrame(() => {
        calculateUIHeights();
        if (state.mode === 'monitor') {
            drawMonitor();
        }
    });
}

function calculateUIHeights() {
    const topBar = document.querySelector('.top-bar');
    const controlsBar = document.querySelector('.controls-bar');
    if (topBar) topBarH = topBar.getBoundingClientRect().height;
    if (controlsBar) bottomBarH = controlsBar.getBoundingClientRect().height;
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
    // プレイリストの位置情報（Google Drive/ローカルのみ保存）
    const playlistData = state.playlist.map(track => ({
        name: track.name,
        source: track.source,
        isVideo: track.isVideo,
        ...(track.source === 'drive' && { fileId: track.fileId })
    }));
    localStorage.setItem('audioVisualizerPlaylist', JSON.stringify(playlistData));
}

function setupSettingsInputs() {
    $('smoothingSlider').oninput = e => {
        state.settings.smoothing = +e.target.value;
        $('smoothingValue').textContent = state.settings.smoothing.toFixed(2);
        if (state.analyser) state.analyser.smoothingTimeConstant = state.settings.smoothing;
    };
    $('sensitivitySlider').oninput = e => {
        state.settings.sensitivity = +e.target.value;
        $('sensitivityValue').textContent = state.settings.sensitivity.toFixed(1);
    };
    $('qualitySelect').onchange = e => {
        state.settings.fftSize = +e.target.value;
        if (state.analyser) {
            state.analyser.fftSize = state.settings.fftSize;
            state.bufLen = state.analyser.frequencyBinCount;
            state.freqData = new Uint8Array(state.bufLen);
            state.timeData = new Uint8Array(state.bufLen);
        }
    };
    $('barCountSelect').onchange = e => { state.settings.barCount = +e.target.value; };
    $('showLabelsCheckbox').onchange = e => { state.settings.showLabels = e.target.checked; };
    $('lowPowerModeCheckbox').onchange = e => { state.settings.lowPowerMode = e.target.checked; };
    $('showVideoCheckbox').onchange = e => { state.settings.showVideo = e.target.checked; updateVideoVisibility(); };
    $('videoModeSelect').onchange = e => { state.settings.videoMode = e.target.value; updateVideoVisibility(); };
    $('videoFitModeSelect').onchange = e => { state.settings.videoFitMode = e.target.value; updateVideoVisibility(); };
    
    // レンダリングモード
    const renderModeSelect = $('renderModeSelect');
    if (renderModeSelect) {
        renderModeSelect.onchange = e => {
            state.settings.renderMode = e.target.value;
            initGPURenderer();
            updateRenderModeStatus();
        };
    }
    
    // UI自動非表示
    const autoHideUICheckbox = $('autoHideUICheckbox');
    if (autoHideUICheckbox) {
        autoHideUICheckbox.onchange = e => {
            state.settings.autoHideUI = e.target.checked;
        };
    }
    
    $('lowFreqSlider').oninput = e => {
        state.settings.lowFreq = +e.target.value;
        $('lowFreqValue').textContent = state.settings.lowFreq + 'Hz';
    };
    $('highFreqSlider').oninput = e => {
        state.settings.highFreq = +e.target.value;
        $('highFreqValue').textContent = (state.settings.highFreq >= 1000 ? (state.settings.highFreq/1000) + 'kHz' : state.settings.highFreq + 'Hz');
    };
    EQ_FREQS.forEach((freq, i) => {
        const id = freq >= 1000 ? `eq${freq/1000}k` : `eq${freq}`;
        const el = $(id);
        if (el) el.oninput = e => { state.settings.eq[i] = +e.target.value; updateEQ(i, +e.target.value); };
    });
    $('resetEqBtn').onclick = resetEQ;
    $('glowSlider').oninput = e => { 
        state.settings.glowStrength = +e.target.value; 
        $('glowValue').textContent = state.settings.glowStrength > 30 ? '強' : state.settings.glowStrength > 10 ? '中' : '弱';
    };
    $('rainbowCheckbox').onchange = e => { state.settings.rainbow = e.target.checked; };
    $('mirrorCheckbox').onchange = e => { state.settings.mirror = e.target.checked; };
    $('bgBlurSlider').oninput = e => {
        state.settings.bgBlur = +e.target.value;
        $('bgBlurValue').textContent = state.settings.bgBlur + 'px';
        updateVideoVisibility();
    };
    $('opacitySlider').oninput = e => {
        state.settings.opacity = +e.target.value;
        $('opacityValue').textContent = state.settings.opacity.toFixed(1);
    };
    $('fixedColorPicker').oninput = e => { state.settings.fixedColor = e.target.value; };
    $('clientIdInput').onchange = e => { state.settings.gDriveClientId = e.target.value.trim(); };
    $('apiKeyInput').onchange = e => { state.settings.gDriveApiKey = e.target.value.trim(); };
    $('persistSettingsCheckbox').onchange = e => { state.settings.persistSettings = e.target.checked; };

    $('autoPlayNextCheckbox').onchange = e => { state.settings.autoPlayNext = e.target.checked; };
    $('stopOnVideoEndCheckbox').onchange = e => { state.settings.stopOnVideoEnd = e.target.checked; };

    // New settings handlers
    const changeModeSelect = $('changeModeSelect');
    if (changeModeSelect) changeModeSelect.onchange = e => { state.settings.changeMode = e.target.value; };
    const sandModeCheckbox = $('sandModeCheckbox');
    if (sandModeCheckbox) sandModeCheckbox.onchange = e => { state.settings.sandMode = e.target.checked; };
    const sandFallRateSlider = $('sandFallRateSlider');
    if (sandFallRateSlider) sandFallRateSlider.oninput = e => { state.settings.sandFallRate = +e.target.value; $('sandFallRateValue').textContent = state.settings.sandFallRate.toFixed(1); };
    const circleAngleOffsetSlider = $('circleAngleOffsetSlider');
    if (circleAngleOffsetSlider) circleAngleOffsetSlider.oninput = e => { state.settings.circleAngleOffset = +e.target.value; $('circleAngleOffsetValue').textContent = `${state.settings.circleAngleOffset}°`; };

    // persistSettingsCheckboxは既に上で処理済みなので重複を避ける
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
            showOverlay(`🎨 ${p.name} カラー適用`);
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
    showOverlay(`💾 プリセット ${slot} を保存しました`);
}

function loadPreset(slot) {
    const saved = localStorage.getItem(`visualizerPreset_${slot}`);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(state.settings, parsed);
            applySettingsToUI();
            updateVideoVisibility();
            if (state.analyser) {
                state.analyser.smoothingTimeConstant = state.settings.smoothing;
                state.analyser.fftSize = state.settings.fftSize;
            }
            showOverlay(`📂 プリセット ${slot} を読み込みました`);
        } catch (e) {
            showOverlay('❌ 読み込みに失敗しました');
        }
    } else {
        showOverlay(`❌ プリセット ${slot} は空です`);
    }
}

function applySettingsToUI() {
    $('smoothingSlider').value = state.settings.smoothing;
    $('smoothingValue').textContent = state.settings.smoothing.toFixed(2);
    $('sensitivitySlider').value = state.settings.sensitivity;
    $('sensitivityValue').textContent = state.settings.sensitivity.toFixed(1);
    $('qualitySelect').value = state.settings.fftSize;
    $('barCountSelect').value = state.settings.barCount;
    $('showLabelsCheckbox').checked = state.settings.showLabels;
    $('lowPowerModeCheckbox').checked = state.settings.lowPowerMode;
    $('showVideoCheckbox').checked = state.settings.showVideo;
    $('videoModeSelect').value = state.settings.videoMode;
    $('videoFitModeSelect').value = state.settings.videoFitMode || 'cover';
    
    $('lowFreqSlider').value = state.settings.lowFreq;
    $('lowFreqValue').textContent = state.settings.lowFreq + 'Hz';
    $('highFreqSlider').value = state.settings.highFreq;
    $('highFreqValue').textContent = (state.settings.highFreq >= 1000 ? (state.settings.highFreq/1000) + 'kHz' : state.settings.highFreq + 'Hz');
    $('glowSlider').value = state.settings.glowStrength;
    $('rainbowCheckbox').checked = state.settings.rainbow;
    $('mirrorCheckbox').checked = state.settings.mirror;
    $('bgBlurSlider').value = state.settings.bgBlur;
    $('bgBlurValue').textContent = state.settings.bgBlur + 'px';
    $('opacitySlider').value = state.settings.opacity;
    $('opacityValue').textContent = state.settings.opacity.toFixed(1);
    $('fixedColorPicker').value = state.settings.fixedColor;
    $('clientIdInput').value = state.settings.gDriveClientId;
    $('apiKeyInput').value = state.settings.gDriveApiKey;
    $('persistSettingsCheckbox').checked = state.settings.persistSettings;
    
    $('autoPlayNextCheckbox').checked = state.settings.autoPlayNext;
    $('stopOnVideoEndCheckbox').checked = state.settings.stopOnVideoEnd;

    // Apply new settings to UI
    const changeModeSelect = $('changeModeSelect');
    if (changeModeSelect) changeModeSelect.value = state.settings.changeMode || 'off';
    const sandModeCheckbox = $('sandModeCheckbox');
    if (sandModeCheckbox) sandModeCheckbox.checked = !!state.settings.sandMode;
    const sandFallRateSlider = $('sandFallRateSlider');
    if (sandFallRateSlider) sandFallRateSlider.value = state.settings.sandFallRate || 0.6;
    const sandFallRateValue = $('sandFallRateValue');
    if (sandFallRateValue) sandFallRateValue.textContent = (state.settings.sandFallRate || 0.6).toFixed(1);
    const circleAngleOffsetSlider = $('circleAngleOffsetSlider');
    if (circleAngleOffsetSlider) circleAngleOffsetSlider.value = state.settings.circleAngleOffset || 0;
    const circleAngleOffsetValue = $('circleAngleOffsetValue');
    if (circleAngleOffsetValue) circleAngleOffsetValue.textContent = `${state.settings.circleAngleOffset || 0}°`;
    
    // レンダリングモードとUI自動非表示
    const renderModeSelect = $('renderModeSelect');
    if (renderModeSelect) renderModeSelect.value = state.settings.renderMode || 'auto';
    const autoHideUICheckbox = $('autoHideUICheckbox');
    if (autoHideUICheckbox) autoHideUICheckbox.checked = state.settings.autoHideUI !== false;
    
    updateRenderModeStatus();

    state.settings.eq.forEach((val, i) => {
        const freq = EQ_FREQS[i];
        const id = freq >= 1000 ? `eq${freq/1000}k` : `eq${freq}`;
        const el = $(id);
        if (el) el.value = val;
    });
}

function openSettings() { 
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
    saveSettingsToStorage(); 
    closeSettings(); 
    showOverlay('✅ 設定を保存しました');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    $(`tab-${tabId}`).classList.add('active');

    // 音声タブが開かれた時のみデバイスを列挙（権限エラー対策）
    if (tabId === 'audio') {
        enumerateMicDevices();
    }
}

// 開発者メッセージを読み込み・表示
async function loadDeveloperMessage() {
    try {
        const response = await fetch('DEVELOPER_MESSAGE.md');
        if (!response.ok) throw new Error('Failed to load developer message');
        const markdown = await response.text();
        const html = simpleMarkdownToHtml(markdown);
        const contentEl = document.getElementById('developerMessageContent');
        if (contentEl) contentEl.innerHTML = html;
    } catch (error) {
        console.warn('Failed to load developer message:', error);
        const contentEl = document.getElementById('developerMessageContent');
        if (contentEl) contentEl.textContent = '開発者メッセージを読み込めませんでした。';
    }
}

// 簡易Markdown→HTML変換
function simpleMarkdownToHtml(markdown) {
    let html = markdown;
    
    // コードブロック（```）を保護
    const codeBlocks = [];
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
        codeBlocks.push(code);
        return `%%%CODE_BLOCK_${codeBlocks.length - 1}%%%`;
    });
    
    // 見出し
    html = html.replace(/^### (.+)$/gm, '<h4 style="margin-top: 12px; margin-bottom: 6px; color: var(--accent-color);">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 style="margin-top: 14px; margin-bottom: 6px; color: var(--accent-color);">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 style="margin-top: 14px; margin-bottom: 6px; color: var(--accent-color);">$1</h2>');
    
    // リスト
    html = html.replace(/^- (.+)$/gm, '<li style="margin-left: 18px; margin-bottom: 2px;">$1</li>');
    html = html.replace(/(<li.*<\/li>\n?)+/g, '<ul style="margin: 4px 0; padding-left: 18px;">$&</ul>');
    
    // 太字
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // 斜体
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // リンク
    html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" style="color: var(--accent-color); text-decoration: underline;">$1</a>');
    
    // 水平線
    html = html.replace(/^---$/gm, '<hr style="margin: 12px 0; border: none; border-top: 1px solid var(--glass-border);">');
    
    // 段落（空行）を<p>でラップして、過度な空白を防止
    const blocks = html.split(/\n{2,}/);
    html = blocks.map(block => {
        const b = block.trim();
        if (!b) return '';
        // 既にHTMLタグになっているブロックはそのまま
        if (/^<(h2|h3|h4|ul|ol|pre|hr)/.test(b)) return b;
        // 段内の改行は<br>に変換
        return `<p style="margin: 0 0 6px 0;">${b.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    
    // コードブロックを復元
    codeBlocks.forEach((code, i) => {
        html = html.replace(`%%%CODE_BLOCK_${i}%%%`, `<pre style="background: rgba(0,0,0,0.3); padding: 6px; border-radius: 3px; overflow-x: auto;"><code>${code.trim()}</code></pre>`);
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
        state.gainNode.connect(state.audioCtx.destination);
        state.bufLen = state.analyser.frequencyBinCount;
        state.freqData = new Uint8Array(state.bufLen);
        state.timeData = new Uint8Array(state.bufLen);
    }
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
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
        await startMic();
        els.statusText.textContent = '🎤 マイク入力中';
    } else {
        stopMic();
        connectFileSource();
        els.statusText.textContent = state.playlist[state.currentIndex] ? `🎵 ${state.playlist[state.currentIndex].name}` : '待機中...';
    }
}

async function startMic() {
    initAudioContext();
    stopMic(); // Clean up previous
    
    try {
        const constraints = {
            audio: state.micDeviceId ? { deviceId: { exact: state.micDeviceId } } : true
        };
        state.micStream = await navigator.mediaDevices.getUserMedia(constraints);
        state.micSource = state.audioCtx.createMediaStreamSource(state.micStream);
        
        // Disconnect file source if any
        if (state.fileSource) state.fileSource.disconnect();
        
        state.micSource.connect(state.eqFilters[0]);
        state.gainNode.gain.value = 0; // Prevent feedback
        showOverlay('マイク入力開始');
    } catch (e) {
        alert('マイクアクセス失敗: ' + e.message);
        setInputSource('file');
    }
}

function stopMic() {
    if (state.micStream) {
        state.micStream.getTracks().forEach(t => t.stop());
        state.micStream = null;
    }
    if (state.micSource) {
        state.micSource.disconnect();
        state.micSource = null;
    }
}

function connectFileSource() {
    initAudioContext();
    if (!state.fileSource) {
        state.fileSource = state.audioCtx.createMediaElementSource(audio);
        state.fileSource.connect(state.eqFilters[0]);
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
    showOverlay(state.settings.shuffle ? '🔀 シャッフルON' : '🔀 シャッフルOFF');
}

function toggleRepeat() {
    const modes = ['none', 'one', 'all'];
    const idx = modes.indexOf(state.settings.repeatMode);
    state.settings.repeatMode = modes[(idx + 1) % modes.length];
    updateShuffleRepeatUI();
    const labels = { none: '🔁 リピートOFF', one: '🔂 1曲リピート', all: '🔁 全曲リピート' };
    showOverlay(labels[state.settings.repeatMode]);
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
    state.currentIndex = index;
    const track = state.playlist[index];
    els.statusText.textContent = `🎵 ${track.name}`;
    document.title = `${track.name} - Audio Visualizer`;
    renderPlaylist();
    
    // 再生中の曲をオーバーレイで表示
    showOverlay(`Now Playing: ${track.name}`, 3000);
    
    if (state.playTimeout) clearTimeout(state.playTimeout);
    
    // Race condition protection
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
            
            // Prefetch next track (non-blocking)
            const nextIdx = (state.currentIndex + 1) % state.playlist.length;
            if (state.playlist[nextIdx]) {
                ensureUrlForTrack(state.playlist[nextIdx]).catch(() => {});
            }
            
            // Enforce cache limit
            blobCache.enforceLimit([audio.src, bgVideo.src]);
            
            state.playTimeout = setTimeout(() => { 
                audio.play().catch(e => {
                    console.warn("Playback failed:", e);
                    showOverlay('⚠️ 再生に失敗しました');
                    setTimeout(nextTrack, 2000);
                }); 
                state.playTimeout = null;
            }, 100);
        } catch (e) {
            console.warn('ensureUrlForTrack failed', e);
            showOverlay('⚠️ URL準備に失敗しました');
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
}
function onMetadataLoaded() { els.seekBar.max = audio.duration || 0; updateTimeDisplay(); }
function updateProgress() { 
    if (!isNaN(audio.currentTime)) { 
        els.seekBar.value = audio.currentTime; 
        updateTimeDisplay(); 
    } 
}
function updateTimeDisplay() { els.timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`; }
function updatePlayBtn() { els.playBtn.textContent = state.isPlaying ? '⏸' : '▶'; }
function handleAudioError(e) { 
    console.error('Audio error:', e); 
    els.statusText.textContent = '再生エラー'; 
    showOverlay('⚠️ オーディオエラーが発生しました');
    // エラー時は次の曲へ
    setTimeout(nextTrack, 3000);
}
function formatTime(s) { if (!s || isNaN(s)) return '0:00'; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}`; }

function handleFiles(files) {
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
        showOverlay('対応するファイルを選択してください');
        return;
    }

    showOverlay(`📥 ${accepted.length}個のファイルを取り込み中...`);

    accepted.forEach(item => {
        state.playlist.push({ 
            name: item.file.name, 
            fileBlob: item.file,
            source: 'local', 
            isVideo: item.isVideo,
            ephemeral: false,
            addedOrder: state.addedOrderCounter++
        });
    });
    renderPlaylist();
    if (state.currentIndex === -1) playTrack(state.playlist.length - accepted.length);
    
    setTimeout(() => {
        showOverlay(`✅ ${accepted.length}個のファイルを追加しました`);
    }, 500);
}

function handleLocalFiles(e) {
    handleFiles(Array.from(e.target.files));
    e.target.value = '';
}

function renderPlaylist() {
    const query = els.playlistSearchInput.value.toLowerCase();
    const filtered = state.playlist.map((track, originalIndex) => ({ ...track, originalIndex }))
                                  .filter(track => track.name.toLowerCase().includes(query));

    if (state.playlist.length === 0) { 
        els.playlistItems.innerHTML = '<div class="playlist-empty">曲を追加してください</div>'; 
        return; 
    }
    
    if (filtered.length === 0) {
        els.playlistItems.innerHTML = '<div class="playlist-empty">見つかりませんでした</div>';
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

    // プレイリストアイテムのクリック処理
    els.playlistItems.querySelectorAll('.playlist-item').forEach(item => { 
        item.onclick = e => { 
            if (!e.target.closest('.remove-btn') && !e.target.closest('.drag-handle') && !e.target.closest('.move-btn')) {
                playTrack(+item.dataset.index); 
            }
        }; 
    });
    
    // 移動ボタン処理
    els.playlistItems.querySelectorAll('.move-btn').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const idx = +btn.dataset.index;
            const direction = btn.classList.contains('up') ? -1 : 1;
            const targetIdx = idx + direction;
            if (targetIdx >= 0 && targetIdx < state.playlist.length) {
                performPlaylistReorder(idx, targetIdx);
            }
        };
    });
    
    // 削除ボタン処理
    els.playlistItems.querySelectorAll('.remove-btn').forEach(btn => { 
        btn.onclick = e => { 
            e.stopPropagation(); 
            removeFromPlaylist(+btn.dataset.index); 
        }; 
    });
    
    // ドラッグ&ドロップ処理
    setupPlaylistDragDrop();
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
    showOverlay('プレイリストの順序を変更しました');
    
    // プレイリストの表示位置を調整（下に移動した場合、タブの上部が隠れないようにする）
    scrollToCurrentPlaylistItem();
}

// プレイリストのソート機能
function sortPlaylist(sortType) {
    if (state.playlist.length === 0) return;
    
    const currentTrackName = state.currentIndex >= 0 ? state.playlist[state.currentIndex]?.name : null;
    
    switch(sortType) {
        case 'name-asc':
            state.playlist.sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true, sensitivity: 'base' }));
            break;
        case 'name-desc':
            state.playlist.sort((a, b) => b.name.localeCompare(a.name, 'ja', { numeric: true, sensitivity: 'base' }));
            break;
        case 'added-asc':
            // 追加順（addedOrder でソート、なければ元の順序を保つ）
            state.playlist.sort((a, b) => (a.addedOrder ?? Infinity) - (b.addedOrder ?? Infinity));
            break;
        case 'added-desc':
            // 追加順逆順
            state.playlist.sort((a, b) => (b.addedOrder ?? -Infinity) - (a.addedOrder ?? -Infinity));
            break;
        case 'random':
            // Fisher-Yates shuffle
            for (let i = state.playlist.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [state.playlist[i], state.playlist[j]] = [state.playlist[j], state.playlist[i]];
            }
            break;
    }
    
    // 現在再生中のトラックのインデックスを更新
    if (currentTrackName) {
        state.currentIndex = state.playlist.findIndex(t => t.name === currentTrackName);
    }
    
    renderPlaylist();
    saveSettingsToStorage();
    
    const sortNames = {
        'name-asc': '名前順（A→Z）',
        'name-desc': '名前順（Z→A）',
        'added-asc': '追加順',
        'added-desc': '追加順（逆）',
        'random': 'ランダム'
    };
    showOverlay(`🔄 ${sortNames[sortType]}でソートしました`);
}

// プレイリストの現在の曲にスクロール
function scrollToCurrentPlaylistItem() {
    requestAnimationFrame(() => {
        const currentItem = els.playlistItems.querySelector('.playlist-item.active');
        if (currentItem) {
            currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

function removeFromPlaylist(index) {
    if (index < 0 || index >= state.playlist.length) return;
    const track = state.playlist[index];
    // ローカルファイルとDriveファイルのBlob URLを解放（メモリリーク防止）
    if (track.url && (track.source === 'local' || track.source === 'drive')) {
        releaseObjectUrlForTrack(track);
    }
    // fileBlobがあれば参照を削除してGC対象に
    if (track.fileBlob) {
        track.fileBlob = null;
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
            els.statusText.textContent = '待機中...';
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

// Google Drive (Simplified)
let accessToken = null;
function openGDrivePicker() { if (!state.settings.gDriveClientId || !state.settings.gDriveApiKey) { openSettings(); switchTab('gdrive'); return; } if (accessToken) createPicker(); else initGoogleAuth(); }
function initGoogleAuth() { if (typeof google === 'undefined' || !google.accounts) { const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.onload = requestGoogleToken; document.body.appendChild(script); } else requestGoogleToken(); }
function requestGoogleToken() { const tokenClient = google.accounts.oauth2.initTokenClient({ client_id: state.settings.gDriveClientId, scope: 'https://www.googleapis.com/auth/drive.readonly', callback: r => { if (r.error) return; accessToken = r.access_token; loadPickerApi(); } }); tokenClient.requestAccessToken({ prompt: 'consent' }); }
function loadPickerApi() { if (typeof gapi !== 'undefined' && gapi.picker) createPicker(); else { const script = document.createElement('script'); script.src = 'https://apis.google.com/js/api.js'; script.onload = () => gapi.load('picker', createPicker); document.body.appendChild(script); } }
function createPicker() { 
    // MIMEタイプフィルタを使用せず、すべてのファイルを表示可能にする
    const docsView = new google.picker.DocsView()
        .setIncludeFolders(true);
    
    new google.picker.PickerBuilder()
        .addView(docsView)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(accessToken)
        .setDeveloperKey(state.settings.gDriveApiKey)
        .setCallback(pickerCallback)
        .build()
        .setVisible(true);
}
async function pickerCallback(data) { 
    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) { 
        const docs = data[google.picker.Response.DOCUMENTS]; 
        const promises = docs.map(doc => {
            const fileName = doc[google.picker.Document.NAME];
            const ext = fileName.toLowerCase().split('.').pop();
            const allowedExt = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'mp4', 'webm', 'opus', 'mkv']);
            
            if (allowedExt.has(ext)) {
                return fetchDriveFile(doc[google.picker.Document.ID], fileName);
            } else {
                console.warn(`非対応ファイル: ${fileName}`);
                return Promise.resolve();
            }
        });
        await Promise.all(promises);
    } 
}

// Driveダウンロード状況管理（進捗%表示対応）
const driveDownloads = new Map(); // fileId -> { fileName, status, progress }

function updateDriveDownloadUI() {
    const statusEl = document.getElementById('driveDownloadStatus');
    const listEl = document.getElementById('driveDownloadList');
    if (!statusEl || !listEl) return;

    const downloading = Array.from(driveDownloads.entries()).filter(([_, v]) => v.status === 'downloading');
    if (downloading.length === 0) {
        statusEl.style.display = 'none';
        driveDownloads.clear();
        return;
    }

    statusEl.style.display = 'block';
    listEl.innerHTML = downloading.map(([id, info]) => {
        const pct = (typeof info.progress === 'number') ? ` <strong>${info.progress}%</strong>` : '';
        const kb = info.received ? ` (${Math.round(info.received/1024)} KB)` : '';
        return `<div style="padding:4px 0; color:var(--text-muted);">📥 ${info.fileName}${pct}${kb}</div>`;
    }).join('');
}

async function fetchDriveFile(fileId, fileName) {
    driveDownloads.set(fileId, { fileName, status: 'downloading', progress: 0, received: 0 });
    updateDriveDownloadUI();

    try {
        showOverlay(`☁️ Google Driveから取得中...`);
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': 'Bearer ' + accessToken } });
        if (!r.ok) {
            driveDownloads.set(fileId, { fileName, status: 'error' });
            updateDriveDownloadUI();
            showOverlay('❌ 取得に失敗しました');
            return;
        }

        const contentLength = r.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : null;
        const reader = r.body && r.body.getReader ? r.body.getReader() : null;
        let chunks = [];
        let received = 0;

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length || value.byteLength || 0;
                const progress = total ? Math.min(100, Math.round((received / total) * 100)) : null;
                driveDownloads.set(fileId, { fileName, status: 'downloading', progress, received });
                updateDriveDownloadUI();
            }
            const blob = new Blob(chunks);
            const ext = fileName.toLowerCase().split('.').pop();
            const videoExt = new Set(['mp4', 'webm', 'mkv', 'mov']);
            const isVideo = videoExt.has(ext);
            state.playlist.push({ name: fileName, url: URL.createObjectURL(blob), source: 'drive', isVideo: isVideo, fileId: fileId, addedOrder: state.addedOrderCounter++ });
            renderPlaylist();
            if (state.currentIndex === -1) playTrack(state.playlist.length - 1);

            driveDownloads.set(fileId, { fileName, status: 'completed', progress: 100 });
            updateDriveDownloadUI();
            showOverlay(`✅ ${fileName} を追加しました`);
            return;
        }

        // フォールバック（ストリーム未対応環境）
        const blob = await r.blob();
        const ext = fileName.toLowerCase().split('.').pop();
        const videoExt = new Set(['mp4', 'webm', 'mkv', 'mov']);
        const isVideo = videoExt.has(ext);
        state.playlist.push({ name: fileName, url: URL.createObjectURL(blob), source: 'drive', isVideo: isVideo, fileId: fileId, addedOrder: state.addedOrderCounter++ });
        renderPlaylist();
        if (state.currentIndex === -1) playTrack(state.playlist.length - 1);

        driveDownloads.set(fileId, { fileName, status: 'completed', progress: 100 });
        updateDriveDownloadUI();
        showOverlay(`✅ ${fileName} を追加しました`);
    } catch (e) {
        driveDownloads.set(fileId, { fileName, status: 'error' });
        updateDriveDownloadUI();
        showOverlay('❌ エラーが発生しました');
    }
}

// ============== UI CONTROLS ==============
function toggleUI() {
    // 状態を即座に反転
    state.uiVisible = !state.uiVisible;
    
    // DOM更新
    els.uiLayer.classList.toggle('hidden', !state.uiVisible);
    if (els.toggleUIBtn) {
        els.toggleUIBtn.textContent = state.uiVisible ? '🔳' : '🔲';
    }

    // UIを非表示にする時は開いているパネル/モーダルを閉じる
    if (!state.uiVisible) {
        if (state.settingsOpen) closeSettings();
        if (state.playlistVisible) {
            els.playlistPanel.classList.add('collapsed');
            state.playlistVisible = false;
            if (els.playlistToggle) els.playlistToggle.textContent = '📂';
        }
    } else {
        // 自動非表示が有効の時のみタイムアウトを設定
        if (state.settings.autoHideUI) {
            resetUITimeout();
        }
    }
}

function toggleFullscreen() {
    const doc = window.document;
    const docEl = doc.documentElement;

    const requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    const cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

    try {
        if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
            if (requestFullScreen) {
                requestFullScreen.call(docEl);
            } else if (typeof window.ActiveXObject !== "undefined") { // for Internet Explorer
                const wscript = new ActiveXObject("WScript.Shell");
                if (wscript !== null) {
                    wscript.SendKeys("{F11}");
                }
            }
        } else {
            if (cancelFullScreen) {
                cancelFullScreen.call(doc);
            }
        }
    } catch (e) {
        console.warn("Fullscreen toggle failed:", e);
        showOverlay("⚠️ フルスクリーン切替に失敗しました");
    }
}

function showOverlay(msg, duration = 2000) { els.overlayMsg.textContent = msg; els.overlayMsg.classList.remove('hidden'); if (duration > 0) setTimeout(() => { els.overlayMsg.classList.add('hidden'); }, duration); }

// ============== EXPORT ==============
function startExport() {
    if (state.inputSource === 'mic') { alert('マイク入力モードでは書き出しできません'); return; }
    if (!state.playlist[state.currentIndex]) return;
    if (!confirm('現在の曲を動画として書き出しますか？')) return;
    state.isExporting = true;
    const stream = cv.captureStream(60);
    state.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
    state.recordedChunks = [];
    state.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) state.recordedChunks.push(e.data); };
    audio.pause(); audio.currentTime = 0;
    state.gainNode.gain.value = 0;
    if (state.uiVisible) toggleUI();
    showOverlay('🎬 動画書き出し中...', 0);
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
        alert('書き出し完了');
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
    const step = (hiIdx - loIdx) / state.settings.barCount;
    for (let i = 0; i < state.settings.barCount; i++) {
        const idx = Math.min(loIdx + Math.floor(i * step), state.bufLen - 1);
        // 感度をフリークエンシーデータに乗算 → グラフの高さに直接反映
        out[i] = Math.min(255, state.freqData[idx] * state.settings.sensitivity);
    }
    return out;
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

// ============== Display Values & Sand ==============
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
        cur_levels[i] = cur;
        let v = cur;
        if (mode === 'plus') v = Math.max(0, cur - prev[i]);
        else if (mode === 'plusminus') v = cur - prev[i];
        disp[i] = v;
        // sand update
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

// ============== Shake & Sparkles ==============
function computeEnergy(display) {
    let sum = 0, peak = 0, n = display.length;
    for (let i = 0; i < n; i++) { const v = Math.abs(display[i]); sum += v; if (v > peak) peak = v; }
    const avg = sum / Math.max(1, n);
    return Math.max(avg, peak);
}
// Shake and Sparkles features removed

let lastDrawTs = 0;
let lastVideoSyncCheckTs = 0;
let videoSyncCooldown = 0; // 同期後のクールダウン時間
let cachedReduceMotion = false; // matchMediaキャッシュ
let colorsCache = []; // 色配列キャッシュ
let animationFrameId = null; // rAF IDを保存して制御

// リソースモニター用
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let lastResourceUpdateTime = 0;

function updateResourceMonitor() {
    const now = performance.now();
    if (now - lastResourceUpdateTime < 1000) return; // 1秒に1回更新
    lastResourceUpdateTime = now;
    
    // FPS計算
    const elapsed = now - fpsLastTime;
    const fps = Math.round(fpsFrameCount / (elapsed / 1000));
    fpsFrameCount = 0;
    fpsLastTime = now;
    
    const fpsEl = $('fpsValue');
    if (fpsEl) fpsEl.textContent = fps + ' fps';
    
    // メモリ使用量（performance.memoryが利用可能な場合）
    const memoryEl = $('memoryValue');
    if (memoryEl) {
        if (performance.memory) {
            const usedMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
            memoryEl.textContent = usedMB + ' MB';
        } else {
            memoryEl.textContent = '未対応';
        }
    }
    
    // レンダリング状態表示（GPU/CPU）
    const gpuEl = $('gpuValue');
    if (gpuEl) {
        const mode = state.settings.renderMode || 'auto';
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

        const targetFps = state.settings.lowPowerMode ? 30 : 60;
        const minInterval = 1000 / targetFps;
        const dtSecRaw = lastDrawTs ? (ts - lastDrawTs) / 1000 : 0;
        if (lastDrawTs && ts - lastDrawTs < minInterval) {
            animationFrameId = requestAnimationFrame(draw);
            return;
        }
        const dtSec = dtSecRaw || (minInterval / 1000);
        lastDrawTs = ts;
    
    // リソースモニター更新
    fpsFrameCount++;
    updateResourceMonitor();

    // 動画と音声の同期チェック（改良版：シーク検出、速度リセット改善）
    if (bgVideo.src && state.isPlaying && state.settings.showVideo && !bgVideo.paused && bgVideo.readyState >= 2) {
        // シーク検出：音声位置が大きく変化した場合
        const audioTimeDelta = Math.abs(audio.currentTime - state.lastAudioTime);
        const wasSeek = audioTimeDelta > 0.5 && state.lastAudioTime > 0;
        state.lastAudioTime = audio.currentTime;
        
        if (wasSeek) {
            // シーク時は即座に動画位置を合わせてクールダウン
            const targetTime = audio.currentTime + 0.05;
            bgVideo.currentTime = targetTime;
            bgVideo.playbackRate = 1.0;
            videoSyncCooldown = 2.0; // シーク後は長めのクールダウン
            lastVideoSyncCheckTs = ts;
        } else if (videoSyncCooldown > 0) {
            // クールダウン中は同期チェックをスキップ
            videoSyncCooldown -= dtSec;
        } else if (!lastVideoSyncCheckTs || ts - lastVideoSyncCheckTs >= 500) {
            lastVideoSyncCheckTs = ts;
            const videoOffset = 0.05; // MVを少しだけ先に進める（50ms）
            const targetTime = audio.currentTime + videoOffset;
            const timeDiff = bgVideo.currentTime - targetTime;
            const absTimeDiff = Math.abs(timeDiff);
            
            // 同期閾値: 0秒=即時通過、0.1=倍速調整、2.0=シーク
            if (absTimeDiff > 2.0) {
                // 大きなズレ：直接シーク
                bgVideo.currentTime = targetTime;
                bgVideo.playbackRate = 1.0;
                videoSyncCooldown = 1.5;
            } else if (absTimeDiff > 0.1) {
                // 中程度のズレ：再生速度で緊和に調整
                if (timeDiff > 0) {
                    bgVideo.playbackRate = Math.max(0.9, 1 - absTimeDiff * 0.1);
                } else {
                    bgVideo.playbackRate = Math.min(1.1, 1 + absTimeDiff * 0.1);
                }
                videoSyncCooldown = 0.5;
            } else {
                // 0.1秒以下のズレは無視
                if (bgVideo.playbackRate !== 1.0) {
                    bgVideo.playbackRate = 1.0;
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
    // Bars モードは 85%、Monitor モードは 80%（Monitor 枠用）、その他は 90%
    const maxH = state.mode === 0 ? (drawH * 0.85) : (state.mode === 6 ? (drawH * 0.80) : (drawH * 0.9));

    // 軽量化モード時はシャドウを無効化
    const originalGlow = state.settings.glowStrength;
    if (state.settings.lowPowerMode) state.settings.glowStrength = 0;

    ctx.globalAlpha = state.settings.opacity;

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

    // Monitor モード時はビジュアライザーの下に描画（オーバーレイ）
    if (state.mode === 6) {
        drawMonitor(fd, maxH, drawH, drawStartY);
    }

    if (state.settings.mirror) {
        ctx.restore();
    }

    ctx.globalAlpha = 1.0;



    if (state.settings.lowPowerMode) state.settings.glowStrength = originalGlow;
    
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

// Modes (updated bars/circle to use display & sand)
function drawBarsFromDisplay(display, colors, maxH, drawH, drawStartY) {
    const n = display.length; const bw = W / n;
    // global glow based on max level
    let peak = 0; for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(display[i])); }
    if (state.settings.glowStrength > 0) {
        ctx.shadowBlur = state.settings.glowStrength * Math.max(0.2, peak);
        ctx.shadowColor = state.settings.rainbow ? '#ffffff' : state.settings.fixedColor;
    }
    for (let i = 0; i < n; i++) {
        const v = Math.max(0, display[i]); const h = v * maxH; const color = colors[i];
        ctx.fillStyle = color;
        ctx.fillRect(i * bw + 1, drawStartY + drawH - h, bw - 2, h);
        // sand marker: use same color as bar
        if (state.settings.sandMode) {
            const sh = state.sandHeights ? state.sandHeights[i] * maxH : 0;
            if (sh > 0) {
                ctx.fillStyle = color; // use bar color, not white
                ctx.globalAlpha = 0.6;
                const y = drawStartY + drawH - sh;
                ctx.fillRect(i * bw + 1, y - 2, bw - 2, 4);
                ctx.globalAlpha = 1.0;
            }
        }
    }
    ctx.shadowBlur = 0;
}
function drawBars(fd, maxH, drawH, drawStartY) {
    const n = fd.length; const bw = W / n;
    const glowEnabled = state.settings.glowStrength >= 5; // 5未満はGlowを無効化
    for (let i = 0; i < n; i++) {
        const v = fd[i] / 255; const h = v * maxH; const color = getColor(i, v, n);
        if (glowEnabled && v > 0.3) { ctx.shadowBlur = state.settings.glowStrength * v * 0.7; ctx.shadowColor = color; }
        ctx.fillStyle = color; ctx.fillRect(i * bw + 1, drawStartY + drawH - h, bw - 2, h); ctx.shadowBlur = 0;
    }
}
function drawWaveform(maxH, drawH, drawStartY) {
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
    const cx = W / 2, cy = drawStartY + drawH / 2; const r = Math.min(W, drawH) * 0.25; const n = display.length; const circumference = 2 * Math.PI * r; const barW = (circumference / n) * 0.8;
    const angleOffset = ((state.settings.circleAngleOffset || 0) % 360) * Math.PI / 180;
    const glowEnabled = state.settings.glowStrength >= 5;
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
                ctx.globalAlpha = 1.0;
                ctx.restore();
            }
        }
    }
    ctx.shadowBlur = 0;
}
function drawCircle(fd, maxH, drawH, drawStartY) {
    const cx = W / 2, cy = drawStartY + drawH / 2; const r = Math.min(W, drawH) * 0.25; const n = fd.length; const circumference = 2 * Math.PI * r; const barW = (circumference / n) * 0.8;
    const glowEnabled = state.settings.glowStrength >= 5;
    for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2; const v = fd[i] / 255; const len = v * maxH * 0.6;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); const color = getColor(i, v, n); ctx.fillStyle = color;
        if (glowEnabled && v > 0.3) { ctx.shadowBlur = state.settings.glowStrength * 0.7; ctx.shadowColor = color; }
        ctx.fillRect(r, -barW/2, len, barW); ctx.restore();
    }
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
    const cx = W/2, cy = drawStartY + drawH/2; const bass = fd[0] / 255; ctx.save(); ctx.translate(cx, cy); ctx.rotate(Date.now() * 0.0005);
    const arms = 5; const particlesPerArm = 20;
    const glowEnabled = state.settings.glowStrength >= 5;
    for(let i=0; i<arms; i++) {
        for(let j=0; j<particlesPerArm; j++) {
            const progress = j / particlesPerArm; const idx = Math.floor(progress * fd.length); const v = fd[idx] / 255;
            const angle = (i / arms) * Math.PI * 2 + progress * Math.PI * 2; const r = progress * Math.min(W, drawH) * 0.4 + (bass * 50);
            const x = Math.cos(angle) * r; const y = Math.sin(angle) * r; const size = (v * 10 + 2) * (1 - progress * 0.5);
            ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fillStyle = getColor(idx, v, fd.length);
            if(glowEnabled && v > 0.3) { ctx.shadowBlur = size * 1.5; ctx.shadowColor = ctx.fillStyle; }
            ctx.fill(); ctx.shadowBlur = 0;
        }
    }
    ctx.restore();
}
function drawMonitor(fd, maxH, drawH, drawStartY) {
    const compact = (W < 700 || drawH < 420);
    const isPortraitPhone = (H > W && W <= 520);
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

    // fd は barCount へ間引き済み（表示用）。表示用ピークも併記。
    let maxDisp = 0;
    for (let i = 0; i < fd.length; i++) { if (fd[i] > maxDisp) maxDisp = fd[i]; }

    const renderLabel = state.gpuRenderer?.enabled ? 'GPU' : 'CPU';
    const sysLine = `SYS: FFT ${analyser ? analyser.fftSize : 'N/A'} | BAR ${state.settings.barCount} | ${renderLabel} | SM ${state.settings.smoothing.toFixed(2)} | S ${state.settings.sensitivity.toFixed(1)}`;

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
    const bandsH = showBands ? (lineH + bandHeightTotal + lineH) : 0;  // バンド + SYS テキスト行

    const isLandscapePhone = (W > H && Math.min(W, H) <= 520);
    // 常に sideLayout（数値左 + バンド右）を使用
    const useSideLayout = true;
    
    // sideLayout の高さ（数値とバンドの同じ高さ、SYS テキスト用スペース含む）
    const sideBoxH = padding * 2 + Math.max(textH, bandsH);
    
    // 幅：全画面幅を使用（Monitor 框をなるべく最小化）
    const boxW = W - 24;
    
    let boxH = sideBoxH;
    let finalBoxH = boxH;

    ctx.fillStyle = 'rgba(0,0,0,0.78)';
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
    // useSideLayout 時は SYS テキストを下で表示（バンド下）なので、ここはスキップ
    if (!useSideLayout) {
        if (!compact) { ctx.fillText(sysLine, boxX + padding, y); y += lineH; }
        else { ctx.fillStyle = '#bbb'; ctx.fillText(sysLine, boxX + padding, y); y += lineH; ctx.fillStyle = '#fff'; }
    }

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
            // SYS テキストをバンドの下に配置（重なり防止）
            if (!compact) { 
                ctx.fillStyle = '#999'; 
                ctx.font = `10px monospace`;
                ctx.fillText(sysLine, boxX + padding, yB); 
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
    const cx = W/2, cy = drawStartY + drawH/2; const maxR = Math.min(W, drawH) * 0.4; const layers = 10;
    const glowEnabled = state.settings.glowStrength >= 5;
    for(let i=0; i<layers; i++) {
        const idx = Math.floor(i / layers * fd.length); const v = fd[idx] / 255; const r = (i + 1) / layers * maxR * (1 + v * 0.5);
        ctx.beginPath(); for(let j=0; j<6; j++) { const angle = j * Math.PI / 3 + (i%2 ? 0 : Math.PI/6) + Date.now() * 0.0002 * (i+1); const x = cx + Math.cos(angle) * r; const y = cy + Math.sin(angle) * r; j===0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.closePath();
        ctx.strokeStyle = getColor(idx, v, fd.length); ctx.lineWidth = 2 + v * 5; if(glowEnabled && v > 0.3) { ctx.shadowBlur = 8; ctx.shadowColor = ctx.strokeStyle; } ctx.stroke(); ctx.shadowBlur = 0;
    }
}
function drawMirrorBars(fd, maxH, drawH, drawStartY) {
    const n = fd.length; const bw = W / n; const cy = drawStartY + drawH / 2;
    const glowEnabled = state.settings.glowStrength >= 5;
    for (let i = 0; i < n; i++) {
        const v = fd[i] / 255; const h = v * maxH * 0.5; const color = getColor(i, v, n);
        if (glowEnabled && v > 0.3) { ctx.shadowBlur = state.settings.glowStrength * 0.7; ctx.shadowColor = color; }
        ctx.fillStyle = color; ctx.fillRect(i * bw + 1, cy - h, bw - 2, h); ctx.fillRect(i * bw + 1, cy, bw - 2, h); ctx.shadowBlur = 0;
    }
}

document.addEventListener('DOMContentLoaded', init);
