/**
 * Audio Visualizer
 * - Removed YouTube
 * - Improved Input Source Switching (File / Mic)
 * - Microphone Device Selection
 */

// ============== STATE ==============
const state = {
    playlist: [],
    currentIndex: -1,
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
        sensitivity: 1.0,
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
        sleepTimer: 0,
        autoPlayNext: true,
        stopOnVideoEnd: false,
        storeLocalFiles: false
        ,
        // New visualization settings
        changeMode: 'off', // 'off' | 'plus' | 'plusminus'
        sandMode: false,
        sandFallRate: 0.6, // per second
        circleAngleOffset: 0
    }
};

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
    playlistPanel: $('playlistPanel'),
    playlistToggle: $('playlistToggle'),
    closePlaylistBtn: $('closePlaylistBtn'),
    playlistItems: $('playlistItems'),
    playlistSearchInput: $('playlistSearchInput'),
    clearPlaylistBtn: $('clearPlaylistBtn'),
    fileInput: $('fileInput'),
    folderImportBtn: $('folderImportBtn'),
    gDriveBtn: $('gDriveBtn'),
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
    playbackControls: $('playbackControls'),
    videoContainer: $('videoContainer'),
    closeVideoBtn: $('closeVideoBtn'),
    toggleVideoModeBtn: $('toggleVideoModeBtn'),
    lowPowerModeCheckbox: $('lowPowerModeCheckbox'),
    showVideoCheckbox: $('showVideoCheckbox'),
    videoModeSelect: $('videoModeSelect'),
    sleepTimerSelect: $('sleepTimerSelect'),
    sleepTimerStatus: $('sleepTimerStatus'),
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
    showOverlay(deltaSeconds < 0 ? '⏪ -10秒' : '⏩ +10秒');
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

function toCapacitorFileUrl(uri) {
    try {
        if (typeof window.Capacitor !== 'undefined' && typeof window.Capacitor.convertFileSrc === 'function') {
            return window.Capacitor.convertFileSrc(uri);
        }
    } catch {
        // ignore
    }
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
    // Drive blob
    if (track.source === 'drive' && track.fileBlob instanceof Blob) {
        const url = URL.createObjectURL(track.fileBlob);
        track.url = url;
        track.ephemeral = true;
        blobCache.put(track, url);
        return url;
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

let W, H;
let topBarH = 0;
let bottomBarH = 0;
function clearPlayTimeout() { if (state.playTimeout) { clearTimeout(state.playTimeout); state.playTimeout = null; } }

// ============== INITIALIZATION ==============
async function init() {
    loadSettings();
    library = loadLibraryFromStorage();
    await loadPlaylistFromStorage();
    rebuildLibraryFromPlaylist();
    renderStorageList();

    // Playlist click handlers (reduce per-render work)
    setupPlaylistEventDelegation();

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => {
        requestAnimationFrame(() => {
            calculateUIHeights();
        });
    });
    // Calculate UI heights after initial render
    requestAnimationFrame(() => {
        calculateUIHeights();
    });
    
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
            bgVideo.currentTime = audio.currentTime;
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
        clearPlayTimeout();
        state.isPlaying = false; 
        updatePlayBtn(); 
        bgVideo.pause(); 
    });
    audio.addEventListener('ended', () => {
        if (state.isExporting) finishExport();
        else if (state.settings.autoPlayNext) nextTrack();
        else {
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
    // UI表示ボタン：タッチ環境で click/touchstart が二重に走りやすいので
    // 「押して離した(pointerup)」タイミングでのみトグルする
    let uiToggleArmed = false;
    els.toggleUIBtn.addEventListener('pointerdown', e => {
        uiToggleArmed = true;
        e.preventDefault();
    }, { passive: false });
    els.toggleUIBtn.addEventListener('pointerup', e => {
        if (!uiToggleArmed) return;
        uiToggleArmed = false;
        e.preventDefault();
        toggleUI();
    }, { passive: false });
    els.toggleUIBtn.addEventListener('pointercancel', () => {
        uiToggleArmed = false;
    });
    els.toggleUIBtn.addEventListener('click', e => {
        // pointerイベント後に合成clickが来る端末があるため無効化
        e.preventDefault();
    });
    // Initialize toggle button label
    els.toggleUIBtn.textContent = state.uiVisible ? '🔳' : '🔲';
    els.openSettingsBtn.onclick = openSettings;
    els.closeSettingsBtn.onclick = closeSettings;
    els.saveSettingsBtn.onclick = saveSettings;
    els.resetAllSettingsBtn.onclick = async () => {
        if (confirm('すべての設定、プレイリスト、保存ファイルを削除して初期状態に戻しますか？')) {
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
                alert('初期化に失敗しました: ' + err.message);
            }
        }
    };
    els.exportBtn.onclick = startExport;
    els.playlistToggle.onclick = togglePlaylist;
    // folderImportBtnは統合のため削除
    els.closePlaylistBtn.onclick = togglePlaylist;
    els.playlistSearchInput.oninput = scheduleRenderPlaylist;
    els.clearPlaylistBtn.onclick = async () => {
        if (confirm('プレイリストをすべてクリアしますか？')) {
            await deleteAllLocalTrackStorage(state.playlist);
            state.playlist.forEach(t => { if (t.source === 'local' && isBlobUrl(t.url)) URL.revokeObjectURL(t.url); });
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
    // プレイリストパネルはAndroid版では固定位置（ドラッグ無効）
    applySettingsToUI();
    updateShuffleRepeatUI();
    
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
                state.mode = (state.mode + 1) % 9; 
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
    // タップ操作やマウス移動でUIを表示
    // ただしUI表示ボタン操作時は、ボタン側のハンドラに任せる（ここでトグルすると二重反転する）
    const isPersistentControl = e && e.target && typeof e.target.closest === 'function' && e.target.closest('#persistentControls');
    if (!state.uiVisible && !isPersistentControl) {
        toggleUI();
    }
    
    if (state.uiTimeout) clearTimeout(state.uiTimeout);
    
    // 設定画面やプレイリストが開いている間、またはマウスがUI上にある間は消さない
    const isOverUI = e && (e.target.closest('.top-bar') || e.target.closest('.controls-bar') || e.target.closest('.settings-modal') || e.target.closest('.playlist-container'));

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
	
    // モード切替時に残りやすいスタイルを整理
    if (state.settings.videoMode !== 'window') {
        container.style.bottom = '';
    }
    
    // ウィンドウモードで位置が未設定なら中央下に配置
    if (state.settings.videoMode === 'window' && !localStorage.getItem('videoWindowPos')) {
        container.style.top = 'auto';
        container.style.bottom = '120px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
    }

    // 負荷軽減: 背景ぼかしが0の場合はフィルターを完全に削除
    // ウィンドウモード時は背景ぼかしを適用しない（混乱を避けるため）
    if (state.settings.videoMode === 'background' && state.settings.bgBlur > 0) {
        bgVideo.style.filter = `blur(${state.settings.bgBlur}px)`;
        bgVideo.style.webkitFilter = `blur(${state.settings.bgBlur}px)`;
    } else {
        bgVideo.style.filter = 'none';
        bgVideo.style.webkitFilter = 'none';
    }
    
    if (isVideo && state.settings.showVideo) {
        if (bgVideo.src !== track.url) {
            bgVideo.src = track.url;
            bgVideo.load(); // 明示的にロード
            
            // ロード完了後に時間を合わせる（MVを0.15秒先に）
            const onLoaded = () => {
                bgVideo.currentTime = audio.currentTime + 0.15;
                if (state.isPlaying) bgVideo.play().catch(() => {});
                bgVideo.removeEventListener('loadedmetadata', onLoaded);
            };
            bgVideo.addEventListener('loadedmetadata', onLoaded);
        }
    } else {
        bgVideo.pause();
        bgVideo.src = '';
        bgVideo.load();
    }
}

function resize() {
    W = cv.width = window.innerWidth;
    H = cv.height = window.innerHeight;
    // Recalculate UI heights on resize
    requestAnimationFrame(() => {
        calculateUIHeights();
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
        // Skip tracks without valid storage reference when storeLocalFiles is off
        if (track.source === 'local' && !state.settings.storeLocalFiles && !track.localRef?.startsWith('uri:') && !track.localRef?.startsWith('app:') && !track.localRef?.startsWith('path:')) {
            return null;
        }
        return {
            name: track.name,
            source: track.source,
            isVideo: track.isVideo,
            localRef: track.localRef || null,
            ...(track.source === 'drive' && { fileId: track.fileId })
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
        alert('FilePickerプラグインが見つかりません。android-appで依存追加後に `npx cap sync` してください。');
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
            showOverlay('対応するファイルを選択してください');
            return;
        }

        showOverlay(`📥 ${accepted.length}個のファイルを取り込み中...`);

        for (const item of accepted) {
            state.playlist.push({
                name: item.name,
                url: toCapacitorFileUrl(item.uri),
                source: 'local',
                isVideo: item.isVideo,
                localRef: `uri:${item.uri}`
            });
        }

        renderPlaylist();
        if (state.currentIndex === -1) playTrack(state.playlist.length - accepted.length);
        saveSettingsToStorage();
        setTimeout(() => showOverlay(`✅ ${accepted.length}個のファイルを追加しました`), 500);
    } catch (error) {
        console.error('FilePicker failed:', error);
        showOverlay('❌ ファイル選択に失敗しました');
    }
}

async function openNativeFolderImport() {
    if (!isNativeCapacitor()) {
        showOverlay('この機能はAndroidアプリ版で利用できます');
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
        showOverlay('📂 フォルダを選択してください');
        const result = await folderImport.pickAudioFolder({});
        const files = Array.isArray(result?.files) ? result.files : [];
        if (files.length === 0) {
            showOverlay('フォルダ内に対応ファイルが見つかりませんでした');
            return;
        }

        showOverlay(`📥 ${files.length}個のファイルを追加中...`);

        for (const f of files) {
            const name = typeof f?.name === 'string' ? f.name : '';
            const path = typeof f?.path === 'string' ? f.path : '';
            if (!name || !path) continue;
            const isVideo = !!f?.isVideo;
            state.playlist.push({
                name,
                url: toCapacitorFileUrl(path),
                source: 'local',
                isVideo,
                localRef: `app:${path}`,
                size: f?.size || 0
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
        setTimeout(() => showOverlay(`✅ ${files.length}個のファイルを追加しました`), 500);
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

function fileUrlFromPath(filePath) {
    if (!filePath || typeof filePath !== 'string') return '';
    let normalized = filePath.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) normalized = '/' + normalized;
    return encodeURI('file://' + normalized);
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

        if (source === 'drive') {
            // Skip drive tracks if url is not available (no fileBlob) - avoid dangling references
            if (!item.fileId) continue;
            restored.push({ name, url: undefined, source: 'drive', isVideo, fileId: item.fileId });
        }
    }

    state.playlist = restored;
    if (state.currentIndex >= state.playlist.length) state.currentIndex = -1;
    renderPlaylist();
    if (state.playlist.length > 0) {
        els.statusText.textContent = '📂 プレイリストを復元しました';
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
        els.statusText.textContent = '待機中...';
    } else if (state.currentIndex >= 0) {
        state.currentIndex = Math.max(-1, state.currentIndex - removedBeforeCurrent);
    }

    renderPlaylist();
    updateVideoVisibility();
    saveSettingsToStorage();
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
    $('qualitySelect').onchange = e => { applyQualityPreset(+e.target.value); };
    $('barCountSelect').onchange = e => { state.settings.barCount = +e.target.value; };
    $('showLabelsCheckbox').onchange = e => { state.settings.showLabels = e.target.checked; };
    $('lowPowerModeCheckbox').onchange = e => { state.settings.lowPowerMode = e.target.checked; };
    $('showVideoCheckbox').onchange = e => { state.settings.showVideo = e.target.checked; updateVideoVisibility(); };
    $('videoModeSelect').onchange = e => { state.settings.videoMode = e.target.value; updateVideoVisibility(); };
    $('videoFitModeSelect').onchange = e => { state.settings.videoFitMode = e.target.value; updateVideoVisibility(); };
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
    // New display settings
    $('changeModeSelect').onchange = e => { state.settings.changeMode = e.target.value; };
    $('sandModeCheckbox').onchange = e => { state.settings.sandMode = e.target.checked; };
    $('sandFallRateSlider').oninput = e => { state.settings.sandFallRate = +e.target.value; $('sandFallRateValue').textContent = state.settings.sandFallRate.toFixed(1); };
    $('circleAngleOffsetSlider').oninput = e => { state.settings.circleAngleOffset = +e.target.value; $('circleAngleOffsetValue').textContent = `${state.settings.circleAngleOffset}°`; };
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
    $('clientIdInput').onchange = e => { state.settings.gDriveClientId = e.target.value.trim(); };
    $('apiKeyInput').onchange = e => { state.settings.gDriveApiKey = e.target.value.trim(); };
    $('persistSettingsCheckbox').onchange = e => { state.settings.persistSettings = e.target.checked; };
    const storeLocalFilesCheckbox = $('storeLocalFilesCheckbox');
    if (storeLocalFilesCheckbox) {
        storeLocalFilesCheckbox.onchange = async e => {
            const nextValue = !!e.target.checked;
            const prevValue = !!state.settings.storeLocalFiles;
            state.settings.storeLocalFiles = nextValue;

            if (prevValue && !nextValue && hasIdbLocalTracksInPlaylist()) {
                const ok = confirm('「URIのみ」に切り替えるため、アプリ内に保存済みのローカルファイルをプレイリストから削除しますか？\n\n削除すると、再起動後にそれらの曲は復元できなくなります。');
                if (ok) {
                    await purgeIdbLocalTracksFromPlaylist();
                } else {
                    // 取り消し: 設定を元に戻す
                    state.settings.storeLocalFiles = true;
                    e.target.checked = true;
                    showOverlay('💾 ローカル保存: ON');
                    return;
                }
            }

            showOverlay(state.settings.storeLocalFiles ? '💾 ローカル保存: ON' : '🔗 ローカル保存: OFF (URIのみ)');
            renderStorageList();
        };
    }

    $('sleepTimerSelect').onchange = e => {
        state.settings.sleepTimer = +e.target.value;
        updateSleepTimer();
    };
    $('autoPlayNextCheckbox').onchange = e => { state.settings.autoPlayNext = e.target.checked; };
    $('stopOnVideoEndCheckbox').onchange = e => { state.settings.stopOnVideoEnd = e.target.checked; };

    // persistSettingsCheckboxは既に上で処理済みなので重複を避ける
    setupPresets();
}

function updateSleepTimer() {
    if (state.sleepTimerId) {
        clearTimeout(state.sleepTimerId);
        state.sleepTimerId = null;
    }
    
    const status = $('sleepTimerStatus');
    if (state.settings.sleepTimer > 0) {
        const ms = state.settings.sleepTimer * 60 * 1000;
        const endTime = Date.now() + ms;
        status.style.display = 'block';
        
        const updateStatus = () => {
            const remaining = Math.max(0, endTime - Date.now());
            const min = Math.floor(remaining / 60000);
            const sec = Math.floor((remaining % 60000) / 1000);
            status.textContent = `あと ${min}:${sec.toString().padStart(2, '0')} で停止します`;
            if (remaining > 0) {
                state.sleepTimerId = setTimeout(updateStatus, 1000);
            } else {
                audio.pause();
                state.isPlaying = false;
                updatePlayBtn();
                showOverlay('💤 スリープタイマーにより停止しました');
                status.style.display = 'none';
                state.settings.sleepTimer = 0;
                $('sleepTimerSelect').value = 0;
            }
        };
        updateStatus();
    } else {
        status.style.display = 'none';
    }
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
    if (!QUALITY_PRESETS[state.settings.fftSize]) state.settings.fftSize = 2048;
    applyQualityPreset(state.settings.fftSize);
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
    $('changeModeSelect').value = state.settings.changeMode || 'off';
    $('sandModeCheckbox').checked = !!state.settings.sandMode;
    $('sandFallRateSlider').value = state.settings.sandFallRate;
    $('sandFallRateValue').textContent = (state.settings.sandFallRate || 0.6).toFixed(1);
    $('circleAngleOffsetSlider').value = state.settings.circleAngleOffset || 0;
    $('circleAngleOffsetValue').textContent = `${state.settings.circleAngleOffset || 0}°`;
    $('clientIdInput').value = state.settings.gDriveClientId;
    $('apiKeyInput').value = state.settings.gDriveApiKey;
    $('persistSettingsCheckbox').checked = state.settings.persistSettings;
    const storeLocalFilesCheckbox = $('storeLocalFilesCheckbox');
    if (storeLocalFilesCheckbox) storeLocalFilesCheckbox.checked = !!state.settings.storeLocalFiles;
    
    $('sleepTimerSelect').value = state.settings.sleepTimer;
    $('autoPlayNextCheckbox').checked = state.settings.autoPlayNext;
    $('stopOnVideoEndCheckbox').checked = state.settings.stopOnVideoEnd;

    state.settings.eq.forEach((val, i) => {
        const freq = EQ_FREQS[i];
        const id = freq >= 1000 ? `eq${freq/1000}k` : `eq${freq}`;
        const el = $(id);
        if (el) el.value = val;
    });
}

function openSettings() { els.settingsModal.classList.add('open'); state.settingsOpen = true; }
function closeSettings() { els.settingsModal.classList.remove('open'); state.settingsOpen = false; }
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
    } else if (tabId === 'storage') {
        renderStorageList();
    }
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
        clearPlayTimeout();
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
        
        const constraints = {
            audio: state.micDeviceId ? { deviceId: { exact: state.micDeviceId } } : true
        };
        
        console.log('Requesting mic with constraints:', constraints);
        state.micStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Mic stream obtained:', state.micStream.id);
        
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
        
        showOverlay('🎤 マイク入力開始');
    } catch (e) {
        console.error('Mic error:', e);
        let msg = 'マイクアクセスに失敗しました';
        if (e.name === 'NotAllowedError') msg = 'マイク権限が拒否されました';
        else if (e.name === 'NotFoundError') msg = 'マイクが見つかりません';
        
        showOverlay(`⚠️ ${msg}`);
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
    clearPlayTimeout();
    state.currentIndex = index;
    const track = state.playlist[index];
    els.statusText.textContent = `🎵 ${track.name}`;
    document.title = `${track.name} - Audio Visualizer`;
    renderPlaylist();
    
    // 再生中の曲をオーバーレイで表示
    showOverlay(`Now Playing: ${track.name}`, 3000);
    
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
                    showOverlay('⚠️ 再生に失敗しました');
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
        showOverlay('対応するファイルを選択してください');
        return;
    }

    showOverlay(`📥 ${accepted.length}個のファイルを取り込み中...`);

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
        showOverlay(`✅ ${accepted.length}個のファイルを追加しました`);
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
    
    // ドラッグ&ドロップ処理
    setupPlaylistDragDrop();
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
        els.statusText.textContent = '待機中...';
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
        showOverlay('削除対象がありません');
        return;
    }
    const ok = confirm('アプリ内に保持しているファイルをすべて削除しますか？\nプレイリストからも削除されます。');
    if (!ok) return;
    for (const ref of refs) {
        await deleteLibraryEntry(ref);
    }
    showOverlay('🗑️ すべて削除しました');
    renderStorageList();
}

function renderStorageList() {
    if (!els.storageList) return;
    const refs = Object.keys(library);
    if (refs.length === 0) {
        els.storageList.innerHTML = '<div class="hint">保存済みのファイルはありません</div>';
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
    showOverlay('プレイリストの順序を変更しました');
}

async function removeFromPlaylist(index) {
    if (index < 0 || index >= state.playlist.length) return;
    const track = state.playlist[index];
    if (track.source === 'local') {
        if (isBlobUrl(track.url)) URL.revokeObjectURL(track.url);
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
async function fetchDriveFile(fileId, fileName) { 
    try { 
        showOverlay(`☁️ Google Driveから取得中...`);
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': 'Bearer ' + accessToken } }); 
        if (!r.ok) {
            showOverlay('❌ 取得に失敗しました');
            return; 
        }
        const blob = await r.blob(); 
        const ext = fileName.toLowerCase().split('.').pop();
        const videoExt = new Set(['mp4', 'webm', 'mkv', 'mov']);
        const isVideo = videoExt.has(ext);
        state.playlist.push({ name: fileName, url: undefined, fileBlob: blob, source: 'drive', isVideo: isVideo, ephemeral: false }); 
        renderPlaylist(); 
        if (state.currentIndex === -1) playTrack(state.playlist.length - 1); 
        showOverlay(`✅ ${fileName} を追加しました`);
    } catch (e) {
        showOverlay('❌ エラーが発生しました');
    } 
}

// ============== UI CONTROLS ==============
function toggleUI() { 
    state.uiVisible = !state.uiVisible; 
    els.uiLayer.classList.toggle('hidden', !state.uiVisible); 
    els.toggleUIBtn.textContent = state.uiVisible ? '🔳' : '🔲'; 

    // When hiding UI, also close any open panels/modals to avoid mixed visibility states.
    if (!state.uiVisible) {
        if (state.settingsOpen) closeSettings();
        if (state.playlistVisible) {
            els.playlistPanel.classList.add('collapsed');
            state.playlistVisible = false;
            els.playlistToggle.textContent = '📂';
        }
    } else {
        resetUITimeout();
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
function draw(ts = 0) {
    requestAnimationFrame(draw);

    // バックグラウンド中は描画を行わない（復帰時に同期チェックで追従）
    if (document.hidden) return;

    const targetFps = state.settings.lowPowerMode ? 30 : 60;
    const minInterval = 1000 / targetFps;
    const dtSecRaw = lastDrawTs ? (ts - lastDrawTs) / 1000 : 0;
    if (lastDrawTs && ts - lastDrawTs < minInterval) return;
    const dtSec = dtSecRaw || (minInterval / 1000);
    lastDrawTs = ts;

    // 動画と音声の同期チェック（改良版：スムーズな同期を実現）
    if (bgVideo.src && state.isPlaying && state.settings.showVideo && !bgVideo.paused) {
        // クールダウン中は同期チェックをスキップ
        if (videoSyncCooldown > 0) {
            videoSyncCooldown -= dtSec;
        } else if (!lastVideoSyncCheckTs || ts - lastVideoSyncCheckTs >= 300) {
            lastVideoSyncCheckTs = ts;
            const videoOffset = 0.05; // MVを少しだけ先に進める（50ms）
            const targetTime = audio.currentTime + videoOffset;
            const timeDiff = bgVideo.currentTime - targetTime;
            const absTimeDiff = Math.abs(timeDiff);
            
            // 動画が準備できているか確認
            if (bgVideo.readyState >= 2) {
                if (absTimeDiff > 2.0) {
                    // 大きなズレ：直接シーク
                    bgVideo.currentTime = targetTime;
                    videoSyncCooldown = 1.5;
                } else if (absTimeDiff > 0.5) {
                    // 中程度のズレ：再生速度で調整
                    if (timeDiff > 0) {
                        // 動画が先行：少し遅くする
                        bgVideo.playbackRate = Math.max(0.9, 1 - absTimeDiff * 0.2);
                    } else {
                        // 動画が遅れ：少し速くする
                        bgVideo.playbackRate = Math.min(1.1, 1 + absTimeDiff * 0.2);
                    }
                    videoSyncCooldown = 0.5;
                } else if (timeDiff > 0) {
                    // ずれが0秒を超えた後は通常速度に戻す（ずれが正の値を超すまで待つ）
                    if (bgVideo.playbackRate !== 1.0) {
                        bgVideo.playbackRate = 1.0;
                    }
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
    
    if (!state.analyser) return;
    const fd = getFilteredData();
    const display = computeDisplayValues(fd, dtSec);
    // Precompute colors for the frame
    const nBars = fd.length;
    const colors = new Array(nBars);
    for (let i = 0; i < nBars; i++) {
        colors[i] = getColor(i, Math.max(0, Math.min(1, fd[i] / 255)), nBars);
    }
    // Motion preferences
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Shake removed
    
    // Use full screen height for visualization
    const drawH = H;
    const drawStartY = 0;
    const maxH = drawH * 0.9;

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
        case 0: drawBarsFromDisplay(display, colors, maxH, drawH, drawStartY); break;
        case 1: drawWaveform(maxH, drawH, drawStartY); break;
        case 2: drawDigitalBlocks(fd, maxH, drawH, drawStartY); break;
        case 3: drawCircleFromDisplay(display, colors, maxH, drawH, drawStartY); break;
        case 4: drawSpectrum(fd, maxH, drawH, drawStartY); break;
        case 5: drawGalaxy(fd, drawH, drawStartY); break;
        case 6: drawMonitor(fd, drawH, drawStartY); break;
        case 7: drawHexagon(fd, drawH, drawStartY); break;
        case 8: drawMirrorBars(fd, maxH, drawH, drawStartY); break;
    }
    ctx.restore();

    if (state.settings.mirror) {
        ctx.restore();
    }

    ctx.globalAlpha = 1.0;



    if (state.settings.lowPowerMode) state.settings.glowStrength = originalGlow;
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
function drawWaveform(maxH, drawH, drawStartY) {
    let startIdx = 0; for (let i = 0; i < state.bufLen - 1; i++) { if (state.timeData[i] < 128 && state.timeData[i+1] >= 128) { startIdx = i; break; } }
    ctx.beginPath(); const slice = W / (state.bufLen - startIdx); const centerY = drawStartY + drawH / 2;
    for (let i = startIdx; i < state.bufLen; i++) { const v = state.timeData[i] / 128 - 1; const y = centerY + v * maxH * 0.5; i === startIdx ? ctx.moveTo(0, y) : ctx.lineTo((i - startIdx) * slice, y); }
    ctx.strokeStyle = state.settings.rainbow ? `hsl(${(Date.now() * 0.1) % 360}, 80%, 60%)` : state.settings.fixedColor; ctx.lineWidth = 3;
    if (state.settings.glowStrength > 0) { ctx.shadowBlur = state.settings.glowStrength; ctx.shadowColor = ctx.strokeStyle; }
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
    for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2 + angleOffset; const v = Math.max(0, display[i]); const len = v * maxH * 0.6;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); const color = colors[i]; ctx.fillStyle = color;
        if (state.settings.glowStrength > 0 && v > 0.2) { ctx.shadowBlur = state.settings.glowStrength; ctx.shadowColor = color; }
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
    for(let i=0; i<arms; i++) {
        for(let j=0; j<particlesPerArm; j++) {
            const progress = j / particlesPerArm; const idx = Math.floor(progress * fd.length); const v = fd[idx] / 255;
            const angle = (i / arms) * Math.PI * 2 + progress * Math.PI * 2; const r = progress * Math.min(W, drawH) * 0.4 + (bass * 50);
            const x = Math.cos(angle) * r; const y = Math.sin(angle) * r; const size = (v * 10 + 2) * (1 - progress * 0.5);
            ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fillStyle = getColor(idx, v, fd.length);
            if(state.settings.glowStrength > 0) { ctx.shadowBlur = size * 2; ctx.shadowColor = ctx.fillStyle; }
            ctx.fill(); ctx.shadowBlur = 0;
        }
    }
    ctx.restore();
}
function drawMonitor(fd, drawH, drawStartY) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1; for(let i=0; i<W; i+=50) { ctx.beginPath(); ctx.moveTo(i,drawStartY); ctx.lineTo(i,drawStartY+drawH); ctx.stroke(); } for(let i=0; i<drawH; i+=50) { ctx.beginPath(); ctx.moveTo(0,drawStartY+i); ctx.lineTo(W,drawStartY+i); ctx.stroke(); }
    let sum = 0, max = 0, maxIdx = 0; for(let i=0; i<fd.length; i++) { sum += fd[i]; if(fd[i] > max) { max = fd[i]; maxIdx = i; } }
    const avg = sum / fd.length; const peakFreq = Math.round(maxIdx * (state.settings.highFreq - state.settings.lowFreq) / fd.length + state.settings.lowFreq);
    const boxW = Math.min(320, W - 40); const boxX = W - boxW - 20; const boxY = drawStartY + 20;
    const hue = Math.floor((Date.now() * 0.05) % 360);
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.strokeStyle = state.settings.rainbow ? `hsl(${hue}, 80%, 60%)` : state.settings.fixedColor; ctx.lineWidth = 2; ctx.fillRect(boxX, boxY, boxW, 280); ctx.strokeRect(boxX, boxY, boxW, 280);
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.fillText(`PEAK LEVEL: ${max} / 255`, boxX + 20, boxY + 30); ctx.fillText(`AVG LEVEL : ${avg.toFixed(1)}`, boxX + 20, boxY + 50); ctx.fillText(`PEAK FREQ : ${peakFreq} Hz`, boxX + 20, boxY + 70); ctx.fillText(`FFT SIZE  : ${state.analyser.fftSize}`, boxX + 20, boxY + 90);
    const bands = [{name: 'SUB (20-60)', val: (fd[0]+fd[1])/2}, {name: 'LOW (60-250)', val: (fd[2]+fd[3]+fd[4])/3}, {name: 'MID (250-2k)', val: (fd[10]+fd[11]+fd[12])/3}, {name: 'HGH (2k-4k)', val: (fd[20]+fd[21]+fd[22])/3}, {name: 'AIR (4k+)', val: (fd[30]+fd[31])/2}];
    bands.forEach((b, i) => { const y = boxY + 120 + i * 30; ctx.fillText(b.name, boxX + 20, y + 14); ctx.fillStyle = '#333'; ctx.fillRect(boxX + 120, y, boxW - 140, 16); const w = (b.val / 255) * (boxW - 140); ctx.fillStyle = getColor(i * 10, 1, 40); ctx.fillRect(boxX + 120, y, w, 16); });
    const barW = W / fd.length; for(let i=0; i<fd.length; i++) { const h = (fd[i]/255) * (drawH/2); ctx.fillStyle = getColor(i, fd[i]/255, fd.length); ctx.fillRect(i*barW, drawStartY+drawH-h, barW-1, h); }
}
function drawHexagon(fd, drawH, drawStartY) {
    const cx = W/2, cy = drawStartY + drawH/2; const maxR = Math.min(W, drawH) * 0.4; const layers = 10;
    for(let i=0; i<layers; i++) {
        const idx = Math.floor(i / layers * fd.length); const v = fd[idx] / 255; const r = (i + 1) / layers * maxR * (1 + v * 0.5);
        ctx.beginPath(); for(let j=0; j<6; j++) { const angle = j * Math.PI / 3 + (i%2 ? 0 : Math.PI/6) + Date.now() * 0.0002 * (i+1); const x = cx + Math.cos(angle) * r; const y = cy + Math.sin(angle) * r; j===0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.closePath();
        ctx.strokeStyle = getColor(idx, v, fd.length); ctx.lineWidth = 2 + v * 5; if(state.settings.glowStrength > 0) { ctx.shadowBlur = 10; ctx.shadowColor = ctx.strokeStyle; } ctx.stroke(); ctx.shadowBlur = 0;
    }
}
function drawMirrorBars(fd, maxH, drawH, drawStartY) {
    const n = fd.length; const bw = W / n; const cy = drawStartY + drawH / 2;
    for (let i = 0; i < n; i++) {
        const v = fd[i] / 255; const h = v * maxH * 0.5; const color = getColor(i, v, n);
        if (state.settings.glowStrength > 0 && v > 0.1) { ctx.shadowBlur = state.settings.glowStrength; ctx.shadowColor = color; }
        ctx.fillStyle = color; ctx.fillRect(i * bw + 1, cy - h, bw - 2, h); ctx.fillRect(i * bw + 1, cy, bw - 2, h); ctx.shadowBlur = 0;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
        console.error('Init failed:', err);
    });
});