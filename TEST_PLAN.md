# Test Plan - Android App Performance & Feature Updates

**PR:** Performance Optimizations, Blob URL Management, and New Visualization Features  
**Target Branch:** main  
**Test Environment:** Android Device/Emulator with Chrome Remote Debugging

---

## 1. Pre-Testing Setup

### Build the APK
```bash
cd android-app
npm install
npx cap sync
cd android
./gradlew assembleDebug
```

### Install on Device
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Enable Remote Debugging
1. Enable USB debugging on Android device
2. Connect via USB
3. Open Chrome: `chrome://inspect`
4. Select app WebView
5. Open DevTools (Console, Network, Performance tabs)

---

## 2. Functional Tests

### 2.1 Basic Playback
- [ ] Import 5-10 local MP3/M4A files
- [ ] Files appear in playlist
- [ ] Click to play track
- [ ] Audio plays smoothly
- [ ] Visualization renders correctly
- [ ] Skip to next/previous track
- [ ] Seek within track
- [ ] Volume control works
- [ ] Pause/resume works

**Expected:** All basic playback features work correctly.

### 2.2 Video File Support
- [ ] Import MP4/WEBM video file
- [ ] Play video file
- [ ] Verify video/audio sync (within 0.5s)
- [ ] Switch video mode: window ↔ background
- [ ] Verify video position persists (window mode)
- [ ] Adjust background blur (background mode)

**Expected:** Video plays in sync, modes switch correctly.

### 2.3 All Visualization Modes
Test each mode for 10-15 seconds:
- [ ] Mode 0: Bars
- [ ] Mode 1: Wave (waveform)
- [ ] Mode 2: Digital (block grid)
- [ ] Mode 3: Circle (radial bars)
- [ ] Mode 4: Spectrum (smooth curve)
- [ ] Mode 5: Galaxy (rotating spiral)
- [ ] Mode 6: Monitor (technical overlay)
- [ ] Mode 7: Hexagon (nested hexagons)
- [ ] Mode 8: Mirror (mirrored bars)

**Expected:** All modes render without errors or crashes.

---

## 3. New Feature Tests

### 3.1 Change Mode Visualization
**Setup:** Play track with dynamic audio (music with variety)

- [ ] **Off mode** (default):
  - Bars represent current audio levels
  - Natural visualization of music
  
- [ ] **Plus mode** (increases only):
  - Settings → Display → Change Mode → Plus
  - Bars show only when audio increases
  - Volume drops → bars shrink to zero
  - Volume spikes → bars react immediately
  
- [ ] **Plus/Minus mode** (all changes):
  - Settings → Display → Change Mode → Plus/Minus
  - Bars show magnitude of change
  - Constant volume → near-zero bars
  - Dynamic passages → active visualization

**Expected:** Each mode shows distinct behavior. Plus/minus modes may be subtle with high smoothing—reduce smoothing (0.1-0.3) to see clearer effect.

### 3.2 Sand Mode
**Setup:** Enable Sand Mode in Settings → Display

- [ ] **Basic Sand** (Bars mode):
  - Enable "Sand Mode"
  - Observe thin lines at bar tips
  - Lines "float" down when bars drop
  - Lines snap up when bars jump
  
- [ ] **Sand Fall Rate**:
  - Set to 50: sand falls slowly
  - Set to 500: sand falls quickly
  - Verify different fall speeds
  
- [ ] **Sand Line Thickness**:
  - Set to 1: thin lines
  - Set to 5: thick lines
  - Verify visual thickness change
  
- [ ] **Circle Mode Sand**:
  - Switch to Circle mode (mode 3)
  - Enable sand mode
  - Observe small circles at bar tips
  - Circles follow physics rules
  
- [ ] **Mirror Bars Sand**:
  - Switch to Mirror mode (mode 8)
  - Enable sand mode
  - Observe mirrored sand lines (top & bottom)

**Expected:** Sand renders correctly, follows physics, looks visually appealing.

**Known Limitation:** Sand mode only works with Bars, Circle, and Mirror modes.

### 3.3 Circle Angle Offset
**Setup:** Switch to Circle mode (mode 3)

- [ ] Set offset to 0°: standard circle (starts at top)
- [ ] Set offset to 90°: circle rotated 90° clockwise
- [ ] Set offset to 180°: circle rotated 180°
- [ ] Set offset to 270°: circle rotated 270°
- [ ] Animate: slowly drag slider 0→360°

**Expected:** Circle visualization rotates smoothly around center point.

---

## 4. Performance Tests

### 4.1 Memory Profiling (Small Playlist)
**Setup:** Import 10 files

1. Open Chrome DevTools → Memory tab
2. Take heap snapshot (baseline)
3. Play through all 10 tracks
4. Take second heap snapshot
5. Compare snapshots

**Expected:**
- No significant memory growth (< 5MB)
- No dangling blob URLs in heap
- Audio buffers properly released

### 4.2 Memory Profiling (Large Playlist)
**Setup:** Import 200 audio files

1. Verify files imported quickly (no long freeze)
2. Check "Network" tab in DevTools
3. Confirm blob URLs NOT created upfront (no 200 blob: entries)
4. Play first track
5. Verify blob URL created only for current track
6. Skip to track 50
7. Verify blob URL created on-demand
8. Take memory snapshot
9. Play for 5 minutes, switching tracks randomly
10. Take second snapshot

**Expected:**
- Import completes in < 5 seconds (no blob URL creation)
- Only 2-3 blob URLs exist at any time (current + next prefetch)
- Memory growth < 20MB over 5 minutes
- No memory leaks

### 4.3 CPU & GC Profiling
**Setup:** Import 20 files, play one track

1. Open Chrome DevTools → Performance tab
2. Click Record (red circle)
3. Let track play for 60 seconds
4. Stop recording
5. Analyze flamegraph:
   - Look for frequent GC (Garbage Collection) events
   - Check draw() function time per frame
   - Verify frame rate (should be ~16.6ms per frame for 60fps)

**Metrics to Check:**
- GC frequency: < 1 per second (ideally < 1 per 5 seconds)
- Frame time: 16-17ms (60fps) or 33ms (30fps low power mode)
- Scripting time per frame: < 5ms
- Rendering time per frame: < 10ms

**Compare with main branch** (if possible):
- GC frequency reduced by ~40%
- Frame drops reduced
- Memory allocations per frame reduced

### 4.4 Low Power Mode
- [ ] Enable Settings → Display → Low Power Mode
- [ ] Verify frame rate drops to ~30fps
- [ ] Verify glow/shadows disabled
- [ ] Verify CPU usage reduced (~50% of normal)

**Expected:** Smooth 30fps, reduced CPU/battery usage.

---

## 5. Blob URL Management Tests

### 5.1 Lazy Loading
**Setup:** Clear app data, relaunch

1. Import 50 files
2. Open Network tab in DevTools
3. Filter by "blob:"
4. Confirm no blob URLs listed
5. Play track 1
6. Verify exactly 1 blob URL created
7. Wait 2-3 seconds
8. Verify 2nd blob URL created (prefetch of next track)
9. Skip to track 10
10. Verify blob URLs created on-demand

**Expected:** Blob URLs created only when needed, not upfront.

### 5.2 LRU Cache Eviction
**Setup:** Import 10 files

1. Open Console in DevTools
2. Enable verbose logging (if available)
3. Play track 1 → track 2 → track 3 rapidly
4. Check console for "revoke" messages
5. Verify old blob URLs released

**Expected:** Cache maintains max 2 URLs (current + next), evicts oldest.

### 5.3 Google Drive Files
**Setup:** Configure Drive API credentials (if available)

1. Import file from Google Drive
2. Verify file added to playlist
3. Verify blob created but URL not created immediately
4. Play Drive file
5. Verify URL created on-demand
6. Audio plays correctly

**Expected:** Drive files work same as local files with lazy URL creation.

### 5.4 Path-Based Files (Capacitor Native)
**Setup:** Import files via native file picker (if app supports)

1. Import files with native Android file paths
2. Play path-based file
3. Verify playback works
4. Check console for Capacitor.convertFileSrc() calls

**Expected:** Path-based files use Capacitor conversion, no blob URLs created.

---

## 6. Settings Persistence Tests

### 6.1 New Settings Save/Restore
1. Open Settings → Display
2. Set Change Mode to "Plus"
3. Enable Sand Mode
4. Set Sand Fall Rate to 300
5. Set Sand Line Thickness to 3
6. Set Circle Angle Offset to 45
7. Close app (force stop or swipe away)
8. Reopen app
9. Open Settings → Display

**Expected:** All settings restored to saved values.

---

## 7. Error Handling Tests

### 7.1 Invalid/Corrupt Files
- [ ] Import corrupt audio file
- [ ] Attempt to play
- [ ] Verify error overlay shown
- [ ] Verify app doesn't crash
- [ ] Verify skips to next track

### 7.2 Missing File (IDB)
**Setup:** Import file with "Store Local Files" enabled

1. Import file → stored in IndexedDB
2. Manually delete from IDB using DevTools → Application → IndexedDB
3. Attempt to play deleted file
4. Verify error message shown
5. Verify app doesn't crash

### 7.3 Network Errors (Drive)
**Setup:** Configure Drive, import file

1. Disable WiFi/mobile data
2. Attempt to import Drive file
3. Verify error message shown
4. Re-enable network
5. Retry import

**Expected:** Graceful error handling, no crashes.

---

## 8. Regression Tests

### 8.1 Existing Features Still Work
- [ ] Playlist search/filter
- [ ] Repeat modes (none/one/all)
- [ ] Shuffle mode
- [ ] EQ (equalizer)
- [ ] Sleep timer
- [ ] Export video (if applicable)
- [ ] Microphone input mode
- [ ] UI hide/show (H key)
- [ ] Keyboard shortcuts

### 8.2 Existing Modes Unchanged
Verify these modes still render correctly (no regressions):
- [ ] Wave mode
- [ ] Digital mode
- [ ] Spectrum mode
- [ ] Galaxy mode
- [ ] Monitor mode
- [ ] Hexagon mode

---

## 9. Security Tests

### 9.1 Gitignore Verification
```bash
# Verify secrets not committed
git status
git log --all --full-history -- "*keystore*"
git log --all --full-history -- "*google-services.json"
```

**Expected:** No secrets in git history or working tree.

### 9.2 Gitleaks Workflow
1. Create test PR with dummy secret in code
2. Verify Gitleaks workflow runs
3. Verify workflow fails if secret detected
4. Remove secret, push again
5. Verify workflow passes

**Expected:** Gitleaks catches secrets in PRs.

---

## 10. Stress Tests

### 10.1 Rapid Track Switching
- [ ] Import 50+ files
- [ ] Rapidly skip through tracks (1 track per second)
- [ ] Continue for 2 minutes
- [ ] Verify no crashes
- [ ] Verify no memory leaks
- [ ] Check DevTools for errors

### 10.2 Long-Running Session
- [ ] Import 100 files
- [ ] Enable repeat all
- [ ] Let play for 30+ minutes
- [ ] Periodically check memory usage
- [ ] Verify stable memory (no growth)

### 10.3 Mode Switching Stress
- [ ] Play track
- [ ] Rapidly cycle through all 9 modes
- [ ] Repeat for 2 minutes
- [ ] Verify smooth rendering
- [ ] Check for frame drops

---

## 11. Accessibility Tests

### 11.1 Screen Reader Support
- [ ] Enable TalkBack (Android)
- [ ] Navigate UI with touch gestures
- [ ] Verify controls announced correctly
- [ ] Verify playlist items readable

### 11.2 Large Text Support
- [ ] Enable large text in Android settings
- [ ] Relaunch app
- [ ] Verify UI scales appropriately
- [ ] Verify no text truncation

---

## 12. Build Tests

### 12.1 Debug Build
```bash
cd android-app
npx cap sync
cd android
./gradlew assembleDebug
```

**Expected:**
- Build completes successfully
- No errors or warnings
- APK created at: `android/app/build/outputs/apk/debug/app-debug.apk`

### 12.2 Release Build
```bash
cd android
./gradlew assembleRelease
```

**Expected:**
- Build completes successfully
- APK created at: `android/app/build/outputs/apk/release/app-release.apk`
- APK size reasonable (< 50MB)

### 12.3 Lint/Code Quality
```bash
cd android
./gradlew lint
```

**Expected:** No critical linting errors.

---

## 13. Cross-Browser Tests (if applicable)

If the app runs in a mobile browser (not just WebView):

### Chrome Mobile
- [ ] Open app in Chrome
- [ ] Verify basic playback
- [ ] Verify visualization modes
- [ ] Test new features

### Firefox Mobile
- [ ] Open app in Firefox
- [ ] Verify basic playback
- [ ] Check for compatibility issues

---

## 14. Test Sign-Off

### Tester Information
- Name: ___________________________
- Date: ___________________________
- Device: _________________________
- Android Version: ________________
- App Version: ____________________

### Test Results Summary
- Total Tests: _____
- Passed: _____
- Failed: _____
- Blocked: _____
- Not Applicable: _____

### Critical Issues Found
1. ______________________________________
2. ______________________________________
3. ______________________________________

### Minor Issues Found
1. ______________________________________
2. ______________________________________
3. ______________________________________

### Performance Metrics
- Startup Time: _______ seconds
- Memory Usage (baseline): _______ MB
- Memory Usage (after 30min): _______ MB
- GC Frequency: _______ per minute
- Average Frame Rate: _______ fps
- Frame Drops: _______ (count in 5min)

### Recommendation
- [ ] Approve for merge
- [ ] Approve with minor fixes
- [ ] Reject - major issues found

### Notes
_____________________________________________
_____________________________________________
_____________________________________________
