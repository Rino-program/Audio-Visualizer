/**
 * Audio Visualizer Pro V7
 * - Removed YouTube
 * - Improved Input Source Switching (File / Mic)
 * - Microphone Device Selection
 */

// ============== STATE ==============
// MV同期クールダウン（無限ループ防止）
let videoSyncCooldown = 0;

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
		targetFps: 60,
		showVideo: true,
		videoMode: 'window', // 'window' or 'background'
		videoFitMode: 'cover',
		repeatMode: 'none',  // 'none', 'one', 'all'
		shuffle: false,
		gDriveClientId: '',
		gDriveApiKey: '',
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
		// Volume persistence
		volume: 1.0
	}
};

// ============== UTILITY ==============
function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

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
	// Local references
	if (typeof track.localRef === 'string') {
		if (track.localRef.startsWith('app-data://')) {
			track.url = track.localRef;
			track.ephemeral = false;
			return track.url;
		} else if (track.localRef.startsWith('path:')) {
			const p = track.localRef.slice('path:'.length);
			track.url = fileUrlFromPath(p);
			track.ephemeral = false;
			return track.url;
		} else if (track.localRef.startsWith('idb:')) {
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
		}
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

// PC build: force-disable storing imported files inside the app. Hiding the tab alone isn't sufficient
// because an old saved setting could still enable saving. This flag ensures the feature is inert.
const PC_DISABLE_LOCAL_STORE = true;

// Helper: shorthand for document.getElementById
const $ = id => document.getElementById(id);

const els = {
	uiLayer: $('uiLayer'),
	playBtn: $('playBtn'),
	prevBtn: $('prevBtn'),
	nextBtn: $('nextBtn'),
	seekBackBtn: $('seekBackBtn'),
	seekForwardBtn: $('seekForwardBtn'),
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

// Canvas, audio and video elements
const cv = $('cv');
const ctx = cv ? cv.getContext('2d') : null;
const audio = new Audio();
const bgVideo = $('bgVideo');

// Ensure audio cross origin for fetch/visualizer
try { audio.crossOrigin = 'anonymous'; } catch (e) {}

function loadLibraryFromStorage() {
	try {
		const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
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
		type: entry.type || 'app-data',
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
					type: t.localRef.startsWith('app-data://') ? 'app-data' : (t.localRef.startsWith('idb:') ? 'idb' : 'path'), 
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

async function deleteLibraryEntry(ref) {
	if (!ref) return;
	try {
		if (ref.startsWith('idb:')) {
			await idbDeleteLocalFile(ref.slice('idb:'.length));
		} else if (ref.startsWith('app-data://') && window.electronAPI) {
			const fileName = decodeURIComponent(ref.replace('app-data://', ''));
			await window.electronAPI.deleteFile(fileName);
		}
	} catch {
		// ignore deletion errors
	}
	removeTracksByLocalRefs([ref]);
	removeLibraryEntries([ref]);
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

	let totalSize = 0;
	const itemsHtml = refs.map(ref => {
		const entry = library[ref];
		totalSize += (entry.sizeBytes || 0);
		const typeLabel = entry.type === 'app-data' ? '💾 アプリ保存' : (entry.type === 'idb' ? '📦 DB保存' : '🔗 パス参照');
		return `
			<div class="storage-item">
				<div class="info">
					<div class="name">${entry.name}</div>
					<div class="meta">${typeLabel} • ${formatBytes(entry.sizeBytes)}</div>
				</div>
				<button class="delete-btn" onclick="deleteLibraryEntry('${ref}')" title="削除">✖</button>
			</div>
		`;
	}).join('');

	els.storageList.innerHTML = itemsHtml;
	if (els.storageSummary) {
		els.storageSummary.textContent = `合計: ${refs.length}ファイル (${formatBytes(totalSize)})`;
	}
}

let playlistRenderQueued = false;
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

let W, H;
let topBarH = 0;
let bottomBarH = 0;

// ============== INITIALIZATION ==============
async function init() {
	loadSettings();
	if (PC_DISABLE_LOCAL_STORE) state.settings.storeLocalFiles = false;
	library = loadLibraryFromStorage();
	await loadPlaylistFromStorage();
	rebuildLibraryFromPlaylist();
	renderStorageList();

	resize();
	window.addEventListener('resize', debounce(resize, 150));

	// バックグラウンド/フォアグラウンド切り替え処理
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) {
			lastDrawTs = 0;
			// 動画を音声と再同期
			if (bgVideo.src && state.isPlaying && state.settings.showVideo) {
				bgVideo.currentTime = audio.currentTime + (typeof getVideoSyncOffset === 'function' ? getVideoSyncOffset() : 0);
				bgVideo.playbackRate = audio.playbackRate || 1.0;
				if (bgVideo.paused) bgVideo.play().catch(() => {});
			}
		}
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
			bgVideo.currentTime = audio.currentTime + getVideoStartOffset();
			bgVideo.play().catch(() => {});
		}
		const track = state.playlist[state.currentIndex];
		if (track) {
			els.statusText.textContent = `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${track.name}`;
			updateTopBadge(track, state.currentIndex);
		}
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
	audio.addEventListener('seeking', () => { if (bgVideo.src) bgVideo.currentTime = audio.currentTime + getVideoStartOffset(); });
	audio.addEventListener('seeked', () => { if (bgVideo.src) bgVideo.currentTime = audio.currentTime + getVideoStartOffset(); });

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
	if (els.seekBackBtn) els.seekBackBtn.onclick = () => seekBySeconds(-10);
	if (els.seekForwardBtn) els.seekForwardBtn.onclick = () => seekBySeconds(10);
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
			updateTopBadge(null, -1);
			updateNowPlayingCustom('未再生', '--', '🎵', '0/0');
			saveSettingsToStorage();
			showOverlay('✅ プレイリストをクリアしました');
		}
	};
	els.fileInput.onchange = handleLocalFiles;
	// Ensure visible "追加" control reliably opens the file picker
	try {
		const fileBtn = document.querySelector('.playlist-panel .file-btn') || document.getElementById('nativeFileBtn');
		if (fileBtn) {
			// If the element is a <label> that contains the file input, the browser
			// already triggers the file picker automatically. Adding a synthetic
			// click can cause the input change to fire twice (label native + script).
			// Avoid attaching an extra click handler for label elements.
			const tag = (fileBtn.tagName || '').toLowerCase();
			if (tag !== 'label') {
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
	
	// GPU サポートチェックと初期化
	checkGPUSupport();
	if (state.gpuAvailable && state.settings.renderMode !== 'cpu') {
		initGPURenderer();
	}
    
	setupSettingsInputs();
	setupPlaylistEventDelegation();
	initDraggableVideo();
	initDraggablePlaylist();
	applySettingsToUI();
	updateShuffleRepeatUI();
	updateTopBadge(null, -1);
	updateNowPlayingCustom('未再生', '--', '🎵', `0/${state.playlist.length}`);
    
	// Drag & Drop
	document.body.addEventListener('dragover', e => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
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
			case 'KeyL': {
				// FPSサイクル: 30 → 60 → 120 → 無制限 → 30
				const fpsSteps = [30, 60, 120, 0];
				const curFps = state.settings.targetFps || 60;
				const ci = fpsSteps.indexOf(curFps);
				const nextFps = fpsSteps[(ci + 1) % fpsSteps.length];
				state.settings.targetFps = nextFps;
				state.settings.lowPowerMode = (nextFps <= 30);
				applySettingsToUI();
				showOverlay(`🎬 FPS: ${nextFps === 0 ? '無制限' : nextFps}`);
				break;
			}
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
			case 'BracketLeft': {
				const rates = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
				const ci = rates.indexOf(audio.playbackRate);
				const ni = Math.max(0, ci - 1);
				audio.playbackRate = rates[ni];
				state.settings.playbackRate = rates[ni];
				if (bgVideo.src) bgVideo.playbackRate = rates[ni];
				syncVideoRateAfterChange();
				const sel = $('speedSelect'); if (sel) sel.value = rates[ni];
				showOverlay(`⏪ 再生速度: ${rates[ni]}x`);
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
				showOverlay(`⏩ 再生速度: ${rates[ni]}x`);
				break;
			}
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
	// autoHideUIが無効な場合は自動表示を行わない
	if (!state.settings.autoHideUI) {
		return;
	}
	
	// タップ操作やマウス移動でUIを表示
	if (!state.uiVisible) {
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

function initDraggableVideo() {
	const container = els.videoContainer;
	const handle = container.querySelector('.video-handle');
	let isDragging = false;
	let startX, startY, initialX, initialY;
	let isFirstDrag = true;

	// 保存された位置を復元
	const savedPos = localStorage.getItem('videoWindowPos');
	if (savedPos) {
		const { left, top } = JSON.parse(savedPos);
		container.style.left = left;
		container.style.top = top;
		container.style.transform = 'none';
		isFirstDrag = false;
	}

	function constrainPosition(x, y, w, h) {
		// 画面外に出ないように制限
		const minVisible = 50; // 最低50px表示させる
		x = Math.max(-w + minVisible, Math.min(window.innerWidth - minVisible, x));
		y = Math.max(0, Math.min(window.innerHeight - minVisible, y));
		return { x, y };
	}

	handle.onmousedown = e => {
		if (state.settings.videoMode === 'background') return;
		isDragging = true;
		container.classList.add('dragging');
		startX = e.clientX;
		startY = e.clientY;
		
		if (isFirstDrag) {
			// 初回ドラッグ時はハンドルの右上を基準にする
			const rect = container.getBoundingClientRect();
			initialX = rect.right - container.offsetWidth;
			initialY = rect.top;
			isFirstDrag = false;
		} else {
			initialX = container.offsetLeft;
			initialY = container.offsetTop;
		}
		
		container.style.transform = 'none';
		document.onmousemove = onMouseMove;
		document.onmouseup = onMouseUp;
	};

	function onMouseMove(e) {
		if (!isDragging) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		const newX = initialX + dx;
		const newY = initialY + dy;
		
		const constrained = constrainPosition(newX, newY, container.offsetWidth, container.offsetHeight);
		container.style.left = `${constrained.x}px`;
		container.style.top = `${constrained.y}px`;
	}

	function onMouseUp() {
		if (!isDragging) return;
		isDragging = false;
		container.classList.remove('dragging');
		document.onmousemove = null;
		document.onmouseup = null;
        
		// 位置を保存
		localStorage.setItem('videoWindowPos', JSON.stringify({
			left: container.style.left,
			top: container.style.top
		}));
	}
}

// プレイリストパネルのドラッグ機能
function initDraggablePlaylist() {
	const panel = document.querySelector('.playlist-panel');
	if (!panel) return;
	
	let isDragging = false;
	let startX, startY, initialX, initialY;
	let hasSavedPosition = false;
	
	// 保存された位置を復元
	const savedPos = localStorage.getItem('playlistPanelPos');
	if (savedPos) {
		try {
			const { left, top } = JSON.parse(savedPos);
			panel.style.left = left;
			panel.style.top = top;
			panel.style.right = 'auto';
			panel.style.transform = 'none';
			hasSavedPosition = true;
		} catch (e) {}
	}
	
	// ドラッグハンドル（ヘッダー部分）
	const header = panel.querySelector('.playlist-header');
	if (!header) return;
	
	header.style.cursor = 'move';
	
	function constrainPosition(x, y, w, h) {
		const minVisible = 100;
		x = Math.max(-w + minVisible, Math.min(window.innerWidth - minVisible, x));
		y = Math.max(0, Math.min(window.innerHeight - minVisible, y));
		return { x, y };
	}
	
	function startDrag(e) {
		// 閉じるボタンはドラッグ対象外
		if (e.target.id === 'closePlaylistBtn' || e.target.closest('#closePlaylistBtn')) return;
		
		isDragging = true;
		panel.classList.add('dragging');
		
		const clientX = e.touches ? e.touches[0].clientX : e.clientX;
		const clientY = e.touches ? e.touches[0].clientY : e.clientY;
		startX = clientX;
		startY = clientY;
		
		if (!hasSavedPosition) {
			const rect = panel.getBoundingClientRect();
			initialX = rect.left;
			initialY = rect.top;
			hasSavedPosition = true;
		} else {
			initialX = panel.offsetLeft;
			initialY = panel.offsetTop;
		}
		
		panel.style.right = 'auto';
		panel.style.transform = 'none';
		
		e.preventDefault();
	}
	
	function onDrag(e) {
		if (!isDragging) return;
		
		const clientX = e.touches ? e.touches[0].clientX : e.clientX;
		const clientY = e.touches ? e.touches[0].clientY : e.clientY;
		
		const dx = clientX - startX;
		const dy = clientY - startY;
		const newX = initialX + dx;
		const newY = initialY + dy;
		
		const constrained = constrainPosition(newX, newY, panel.offsetWidth, panel.offsetHeight);
		panel.style.left = `${constrained.x}px`;
		panel.style.top = `${constrained.y}px`;
	}
	
	function endDrag() {
		if (!isDragging) return;
		isDragging = false;
		panel.classList.remove('dragging');
		
		// 位置を保存
		localStorage.setItem('playlistPanelPos', JSON.stringify({
			left: panel.style.left,
			top: panel.style.top
		}));
	}
	
	// マウスイベント
	header.addEventListener('mousedown', startDrag);
	document.addEventListener('mousemove', onDrag);
	document.addEventListener('mouseup', endDrag);
	
	// タッチイベント
	header.addEventListener('touchstart', startDrag, { passive: false });
	document.addEventListener('touchmove', onDrag, { passive: false });
	document.addEventListener('touchend', endDrag);
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

function updateVideoVisibility() {
	const track = state.playlist[state.currentIndex];
	const isVideo = track && track.isVideo;
	const container = els.videoContainer;
    
	container.classList.toggle('hidden', !state.settings.showVideo || !isVideo);
	container.classList.toggle('background-mode', state.settings.videoMode === 'background');
	
	// フィットモードクラスの適用
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

	// 背景ぼかしの最適化（will-changeでGPUアクセラレーション）
	if (state.settings.bgBlur > 0 && state.settings.videoMode === 'background') {
		bgVideo.style.willChange = 'filter';
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
			bgVideo.playbackRate = audio.playbackRate || 1.0; // 現在の再生速度に合わせる
            
			// ロード完了後に時間を合わせる（MVを少しだけ先に）
			const onLoaded = () => {
				bgVideo.currentTime = audio.currentTime + getVideoSyncOffset();
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

function applyCanvasResolution() {
	if (!cv) return;
	const dpr = Math.min(2, window.devicePixelRatio || 1); // ビジュアライザーは高解像度
	const targetW = Math.max(1, Math.floor(window.innerWidth * dpr));
	const targetH = Math.max(1, Math.floor(window.innerHeight * dpr));
	cv.width = targetW;
	cv.height = targetH;
	cv.style.width = `${window.innerWidth}px`;
	cv.style.height = `${window.innerHeight}px`;
	W = targetW;
	H = targetH;
}

function resize() {
	applyCanvasResolution();
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
	// プレイリスト情報（ローカルは参照キー(localRef)を保存）
	const playlistData = state.playlist.map(track => ({
		name: track.name,
		source: track.source,
		isVideo: track.isVideo,
		localRef: track.localRef || null,
		...(track.source === 'drive' && { fileId: track.fileId })
	}));
	localStorage.setItem('audioVisualizerPlaylistV7', JSON.stringify(playlistData));
	// 後方互換
	localStorage.setItem('audioVisualizerPlaylist', JSON.stringify(playlistData));
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
	// Windows path: C:\a\b.mp3 -> file:///C:/a/b.mp3
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
	for (const t of tracks) {
		if (!t || t.source !== 'local' || typeof t.localRef !== 'string') continue;
		
		if (t.localRef.startsWith('idb:')) {
			try {
				await idbDeleteLocalFile(t.localRef.slice('idb:'.length));
			} catch {
				// ignore
			}
		} else if (t.localRef.startsWith('app-data://') && window.electronAPI) {
			try {
				const fileName = decodeURIComponent(t.localRef.replace('app-data://', ''));
				await window.electronAPI.deleteFile(fileName);
			} catch (err) {
				console.error('Failed to delete file from app storage:', err);
			}
		}
	}
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
			// Backward compat: ElectronのFile.pathが保存されていた場合
			const legacyPath = typeof item.path === 'string' ? item.path : null;

			if (localRef && localRef.startsWith('path:')) {
				const p = localRef.slice('path:'.length);
				// URL生成を遅延（再生時に生成）
				restored.push({ name, url: undefined, source: 'local', isVideo, localRef });
				continue;
			}
			if (legacyPath) {
				// URL生成を遅延（再生時に生成）
				restored.push({ name, url: undefined, source: 'local', isVideo, localRef: `path:${legacyPath}` });
				continue;
			}
			if (localRef && localRef.startsWith('idb:')) {
				// IDB参照のみ保存、URL生成は再生時
				restored.push({ name, url: undefined, source: 'local', isVideo, localRef });
				continue;
			}
			if (localRef && localRef.startsWith('app-data://')) {
				// app-data:// はそのまま使用可能なのでurlに設定
				restored.push({ name, url: localRef, source: 'local', isVideo, localRef });
				continue;
			}
			continue;
		}

		// 既存仕様: Driveはメタだけ復元（再ダウンロードはユーザー操作で）
		if (source === 'drive') {
			restored.push({ name, url: '', source: 'drive', isVideo, fileId: item.fileId });
		}
	}

	state.playlist = restored;
	if (state.currentIndex >= state.playlist.length) state.currentIndex = -1;
	renderPlaylist();
	if (state.playlist.length > 0) {
		els.statusText.textContent = '📂 プレイリストを復元しました';
	}
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
		applySensitivityToAnalyser();
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
	$('barCountSelect').onchange = e => { 
		state.settings.barCount = +e.target.value; 
		updateNumBars();
	};
	$('showLabelsCheckbox').onchange = e => { state.settings.showLabels = e.target.checked; };
	const fpsSelect = $('fpsSelect');
	if (fpsSelect) {
		fpsSelect.onchange = e => {
			const fps = +e.target.value;
			state.settings.targetFps = fps;
			state.settings.lowPowerMode = (fps <= 30);
			showOverlay(`🎬 FPS: ${fps === 0 ? '無制限' : fps}`);
		};
	}
	$('showVideoCheckbox').onchange = e => { state.settings.showVideo = e.target.checked; updateVideoVisibility(); };
	$('videoModeSelect').onchange = e => { state.settings.videoMode = e.target.value; updateVideoVisibility(); };
	$('videoFitModeSelect').onchange = e => { state.settings.videoFitMode = e.target.value; updateVideoVisibility(); };
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
	$('lowFreqSlider').oninput = e => {
		state.settings.lowFreq = +e.target.value;
		$('lowFreqValue').textContent = state.settings.lowFreq + 'Hz';
		if (freqRangeSelect) freqRangeSelect.value = 'custom';
	};
	$('highFreqSlider').oninput = e => {
		state.settings.highFreq = +e.target.value;
		$('highFreqValue').textContent = (state.settings.highFreq >= 1000 ? (state.settings.highFreq/1000) + 'kHz' : state.settings.highFreq + 'Hz');
		if (freqRangeSelect) freqRangeSelect.value = 'custom';
	};
	EQ_FREQS.forEach((freq, i) => {
		const id = freq >= 1000 ? `eq${freq/1000}k` : `eq${freq}`;
		const el = $(id);
		if (el) el.oninput = e => { state.settings.eq[i] = +e.target.value; updateEQ(i, +e.target.value); };
	});
	$('resetEqBtn').onclick = resetEQ;

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
			showOverlay(`🎵 EQ: ${btn.textContent}`);
		});
	});
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
			showOverlay('音楽の重心を中央にリセット');
		};
	}
	$('fixedColorPicker').oninput = e => { state.settings.fixedColor = e.target.value; };
	$('clientIdInput').onchange = e => { state.settings.gDriveClientId = e.target.value.trim(); };
	$('apiKeyInput').onchange = e => { state.settings.gDriveApiKey = e.target.value.trim(); };
	$('persistSettingsCheckbox').onchange = e => { state.settings.persistSettings = e.target.checked; };
	const storeLocalFilesCheckbox = $('storeLocalFilesCheckbox');
	if (storeLocalFilesCheckbox) {
		storeLocalFilesCheckbox.onchange = e => {
			state.settings.storeLocalFiles = e.target.checked;
			showOverlay(state.settings.storeLocalFiles ? '💾 ローカル保存: ON' : '🔗 ローカル保存: OFF (パス参照のみ)');
		};
	}

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
			applyCanvasResolution();
			if (state.analyser) {
				state.analyser.smoothingTimeConstant = state.settings.smoothing;
				state.analyser.fftSize = state.settings.fftSize;
				applySensitivityToAnalyser();
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
	$('clientIdInput').value = state.settings.gDriveClientId;
	$('apiKeyInput').value = state.settings.gDriveApiKey;
	$('persistSettingsCheckbox').checked = state.settings.persistSettings;
	const storeLocalFilesCheckbox = $('storeLocalFilesCheckbox');
	if (storeLocalFilesCheckbox) storeLocalFilesCheckbox.checked = !!state.settings.storeLocalFiles;
    
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
        // 段内の改行は< br>に変換
        return `<p style="margin: 0 0 8px 0;">${b.replace(/\n/g, '<br>')}</p>`;
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
		await startMic();
		els.statusText.textContent = '🎤 マイク入力中';
		updateTopBadge(null, -1);
		updateNowPlayingCustom('マイク入力', 'ライブ入力', '🎤', 'LIVE');
	} else {
		stopMic();
		connectFileSource();
		els.statusText.textContent = state.playlist[state.currentIndex] ? `🎵 ${state.playlist[state.currentIndex].name}` : '待機中...';
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
	els.statusText.textContent = `🎵 [${index + 1}/${state.playlist.length}] ${track.name}`;
	updateTopBadge(track, index);
	updateNowPlayingUI(track, index);
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
	state.settings.volume = +v;
}
function onMetadataLoaded() { els.seekBar.max = audio.duration || 0; updateTimeDisplay(); }
function updateProgress() { 
	if (!isNaN(audio.currentTime)) { 
		els.seekBar.value = audio.currentTime; 
		updateTimeDisplay(); 
	} 
}
function updateTimeDisplay() {
	els.timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
	updateSeekVisuals();
}
function updatePlayBtn() { els.playBtn.textContent = state.isPlaying ? '⏸' : '▶'; }
function handleAudioError(e) { 
	console.error('Audio error:', e); 
	els.statusText.textContent = '再生エラー'; 
	showOverlay('⚠️ オーディオエラーが発生しました');
	// エラー時は次の曲へ
	setTimeout(nextTrack, 3000);
}
function formatTime(s) { if (!s || isNaN(s)) return '0:00'; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}`; }

function updateSeekVisuals() {
	if (!els.seekFill || !els.seekBuffer) return;
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
	const bufferedPct = duration > 0 ? Math.min(100, Math.max(0, (bufferedEnd / duration) * 100)) : 0;
	els.seekBuffer.style.width = `${bufferedPct}%`;
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
	if (!els.nowPlayingArtSm) return;
	const info = getTrackDisplayInfo(track);
	const base = info.title + info.artist;
	const hue = hashString(base) % 360;
	els.nowPlayingArtSm.style.background = `linear-gradient(135deg, hsla(${hue}, 85%, 55%, 0.7), hsla(${(hue + 40) % 360}, 85%, 45%, 0.7))`;
	els.nowPlayingArtSm.textContent = info.icon;
	updateNextUpText(index);
}

function updateNextUpText(currentIndex) {
	if (!els.nextUpText) return;
	if (!state.playlist.length || currentIndex < 0) {
		els.nextUpText.textContent = '次: --';
		return;
	}
	const nextIndex = (currentIndex + 1) % state.playlist.length;
	const nextTrack = state.playlist[nextIndex];
	if (!nextTrack) {
		els.nextUpText.textContent = '次: --';
		return;
	}
	els.nextUpText.textContent = `次: ${nextTrack.name}`;
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
		showOverlay('対応するファイルを選択してください');
		return;
	}

	showOverlay(`📥 ${accepted.length}個のファイルを取り込み中...`);

	for (const item of accepted) {
		const file = item.file;
		const filePath = typeof file.path === 'string' ? file.path : '';
		let localRef = null;
		let fileBlob = null;

		if (!PC_DISABLE_LOCAL_STORE && state.settings.storeLocalFiles && window.electronAPI) {
			try {
				const arrayBuffer = await file.arrayBuffer();
				const savedUrl = await window.electronAPI.saveFile({ name: file.name, arrayBuffer });
				localRef = savedUrl; // app-data://...
				upsertLibraryEntry({ ref: localRef, type: 'app-data', name: file.name, sizeBytes: file.size, isVideo: item.isVideo });
			} catch (err) {
				console.error('Failed to save file to app storage:', err);
				fileBlob = file;
			}
		} else if (filePath) {
			localRef = `path:${filePath}`;
			upsertLibraryEntry({ ref: localRef, type: 'path', name: file.name, sizeBytes: file.size, isVideo: item.isVideo });
		} else {
			fileBlob = file;
		}

		state.playlist.push({ 
			name: file.name, 
			url: undefined, // URL生成を遅延（再生時に生成）
			fileBlob: fileBlob,
			source: 'local', 
			isVideo: item.isVideo,
			localRef: localRef,
			ephemeral: false,
			addedOrder: state.addedOrderCounter++
		});
	}
	renderPlaylist();
	if (state.currentIndex === -1) playTrack(state.playlist.length - accepted.length);
    
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
	updatePlaylistCount();
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
				// 基本的なGPUが存在するかチェック
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
	// ローカルファイルとDriveファイルのBlob URLを解放（メモリリーク防止）
	if (track.source === 'local' || track.source === 'drive') {
		if (isBlobUrl(track.url)) URL.revokeObjectURL(track.url);
	}
	// fileBlobがあれば参照を削除してGC対象に
	if (track.fileBlob) {
		track.fileBlob = null;
	}
	if (track.source === 'local') {
		if (typeof track.localRef === 'string') {
			if (track.localRef.startsWith('idb:')) {
				try {
					await idbDeleteLocalFile(track.localRef.slice('idb:'.length));
				} catch {
					// ignore
				}
			} else if (track.localRef.startsWith('app-data://') && window.electronAPI) {
				try {
					const fileName = decodeURIComponent(track.localRef.replace('app-data://', ''));
					await window.electronAPI.deleteFile(fileName);
				} catch (err) {
					console.error('Failed to delete file from app storage:', err);
				}
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
		const isFs = !!(doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
		if (!isFs) {
			if (requestFullScreen) {
				const p = requestFullScreen.call(docEl);
				if (p && typeof p.catch === 'function') {
					p.catch(err => {
						console.warn('Fullscreen request rejected:', err);
						showOverlay('⚠️ フルスクリーン切替に失敗しました');
					});
				}
			} else if (typeof window.ActiveXObject !== "undefined") { // for Internet Explorer
				const wscript = new ActiveXObject("WScript.Shell");
				if (wscript !== null) {
					wscript.SendKeys("{F11}");
				}
			}
		} else {
			if (cancelFullScreen) {
				const p = cancelFullScreen.call(doc);
				if (p && typeof p.catch === 'function') {
					p.catch(err => {
						console.warn('Fullscreen exit rejected:', err);
						showOverlay('⚠️ フルスクリーン解除に失敗しました');
					});
				}
			}
		}
	} catch (e) {
		console.warn("Fullscreen toggle failed:", e);
		showOverlay("⚠️ フルスクリーン切替に失敗しました");
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
            showOverlay('💤 スリープタイマーで停止しました');
        }
        updateSleepTimerStatus();
    }, 1000);
    showOverlay(`⏰ ${minutes}分後に停止します`);
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
let cachedReduceMotion = false; // matchMediaキャッシュ
let colorsCache = []; // 色配列キャッシュ
let animationFrameId = null; // rAF IDを保存して制御
let visualizerBaseAlpha = 1;

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
    
    // メモリ使用量
    const memoryEl = $('memoryValue');
    if (memoryEl) {
        if (performance.memory) {
            const usedMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
            memoryEl.textContent = usedMB + ' MB';
        } else {
            memoryEl.textContent = '未対応';
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

	const targetFps = state.settings.targetFps || 60;
	const minInterval = targetFps > 0 ? (1000 / targetFps) : 0;
	const dtSecRaw = lastDrawTs ? (ts - lastDrawTs) / 1000 : 0;
	if (minInterval > 0 && lastDrawTs && ts - lastDrawTs < minInterval) {
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
		const baseRate = audio.playbackRate || 1.0;
		// シーク検出：音声位置が大きく変化した場合
		const audioTimeDelta = Math.abs(audio.currentTime - state.lastAudioTime);
		const wasSeek = audioTimeDelta > 0.5 && state.lastAudioTime > 0;
		state.lastAudioTime = audio.currentTime;
		
		if (wasSeek) {
			// シーク時は即座に動画位置を合わせてクールダウン
			const targetTime = audio.currentTime + getVideoSyncOffset();
			bgVideo.currentTime = targetTime;
			bgVideo.playbackRate = baseRate;
			videoSyncCooldown = 2.0; // シーク後は長めのクールダウン
			lastVideoSyncCheckTs = ts;
		} else if (videoSyncCooldown > 0) {
			// クールダウン中は同期チェックをスキップ
			videoSyncCooldown -= dtSec;
		} else if (!lastVideoSyncCheckTs || ts - lastVideoSyncCheckTs >= 500) { // 500msに延長
			lastVideoSyncCheckTs = ts;
			const videoOffset = getVideoSyncOffset(); // MVを少しだけ先に進める
			const targetTime = audio.currentTime + videoOffset;
			const timeDiff = bgVideo.currentTime - targetTime;
			const absTimeDiff = Math.abs(timeDiff);
			
			// 同期閾値は固定値: 0秒=即時通過、0.1秒=倍速調整開始、2.0秒=直接シーク
			if (absTimeDiff > 2.0) {
				// 大きなズレ：直接シーク
				bgVideo.currentTime = targetTime;
				bgVideo.playbackRate = baseRate;
				videoSyncCooldown = 1.5;
			} else if (absTimeDiff > 0.1) {
				// 中程度のズレ：再生速度で緊和に調整
				if (timeDiff > 0) {
					// 動画が先行：少し遅くする
					bgVideo.playbackRate = baseRate * Math.max(0.9, 1 - absTimeDiff * 0.1);
				} else {
					// 動画が遅れ：少し速くする
					bgVideo.playbackRate = baseRate * Math.min(1.1, 1 + absTimeDiff * 0.1);
				}
				videoSyncCooldown = 0.8;
			} else {
				// 0.1秒以下のズレは無視（即時通過）、通常速度に戻す
				if (bgVideo.playbackRate !== baseRate) {
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

	// 軽量化モード時はシャドウを無効化
	const originalGlow = state.settings.glowStrength;
	if (state.settings.lowPowerMode) state.settings.glowStrength = 0;

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
function drawBars(fd, maxH, drawH, drawStartY) {
	const glowEnabled = state.settings.glowStrength >= 5;
	const n = fd.length; const bw = W / n;
	for (let i = 0; i < n; i++) {
		const v = fd[i] / 255; const h = v * maxH; const color = getColor(i, v, n);
		if (glowEnabled && v > 0.3) { ctx.shadowBlur = state.settings.glowStrength * v * 0.7; ctx.shadowColor = color; }
		ctx.fillStyle = color; ctx.fillRect(i * bw + 1, drawStartY + drawH - h, bw - 2, h); ctx.shadowBlur = 0;
	}
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
function drawCircle(fd, maxH, drawH, drawStartY) {
	const glowEnabled = state.settings.glowStrength >= 5;
	const cx = W / 2, cy = drawStartY + drawH / 2; const r = Math.min(W, drawH) * 0.25; const n = fd.length; const circumference = 2 * Math.PI * r; const barW = (circumference / n) * 0.8;
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
	init().catch(err => {
		console.error('Init failed:', err);
	});
});
