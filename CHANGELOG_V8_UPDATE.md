# Audio Visualizer Pro V8 - 大幅改良アップデート

## 概要
3つのプラットフォーム（Web / Android / PC）に対して、動画同期修正・FPS改善・ビジュアライザー精度向上・Androidバックグラウンド再生・EQプリセット・パフォーマンス最適化を一斉に適用しました。

---

## 🐛 バグ修正

### 動画の再生速度同期修正（全プラットフォーム）
- **問題**: 再生速度を変更しても動画（MV）が追従しない。`bgVideo.playbackRate` が常に `1.0` にリセットされていた
- **修正**: 
  - `draw()` ループ内の動画同期ロジックで `baseRate = audio.playbackRate || 1.0` を基準値として使用
  - シーク時、大ズレ時、小ズレ時のリカバリすべてで `baseRate` を乗算
  - 速度セレクター変更時に `bgVideo.playbackRate` を即座に同期
  - キーボードショートカット（`[` / `]`）でも `bgVideo.playbackRate` を同期
  - `updateVideoVisibility()` での動画初期化時に `audio.playbackRate` を反映

### UI展開時の動画遅延軽減（全プラットフォーム）
- **問題**: パネル展開/折りたたみ時にCSSトランジションやレイアウト再計算で動画がカクつく
- **修正**:
  - Canvas要素に `will-change: transform` と `contain: strict` を追加してGPU合成を促進
  - `visibilitychange` イベントハンドラを追加し、タブ復帰時に動画を即座に再同期

---

## ✨ 新機能

### FPS設定の強化（全プラットフォーム）
- **変更前**: `lowPowerMode` のON/OFF（30fps / 60fps）のみ
- **変更後**: ドロップダウンで 30 / 60 / 120 / 無制限 を選択可能
- `state.settings.targetFps` プロパティを追加
- FPS 0 = 無制限（`requestAnimationFrame` のネイティブレートで描画）
- Android版: `L` キーでFPSサイクル切替（30 → 60 → 120 → 無制限 → 30）
- 後方互換: `lowPowerMode` プロパティは維持（FPS ≤ 30で自動ON）

### EQプリセット（全プラットフォーム）
- **8種類のプリセット**: フラット / Rock / Pop / Jazz / Classical / Bass+ / Vocal / EDM
- イコライザーセクションにプリセットボタンを追加
- プリセット適用時にオーバーレイ表示
- 既存のEQリセットボタンも維持

### Androidバックグラウンド再生の強化
- **WebView設定**: `setMediaPlaybackRequiresUserGesture(false)` を追加
- **onPauseオーバーライド**: バックグラウンド移行時にWebViewのJSタイマーを維持（`resumeTimers()`）
- **visibilitychangeハンドラ**: 
  - バックグラウンド移行時: 動画を一時停止（デコード負荷軽減）、音声は継続
  - フォアグラウンド復帰時: 動画を再同期して再開、MediaSession状態を更新
- 既存のMedia Session API（再生/一時停止/前後トラック/シーク）と連携

### バックグラウンド/フォアグラウンド処理（Web / PC）
- `visibilitychange` イベントハンドラを追加
- タブ/ウィンドウ復帰時にFPSタイマーをリセットし、動画を音声と再同期

---

## 📊 ビジュアライザー精度向上（全プラットフォーム）

### getFilteredData() の改良
- **変更前**: 線形周波数マッピング + 単一ビンサンプリング（FFTビンの大部分が無視されていた）
- **変更後**:
  - **対数周波数スケーリング**: `Math.pow(t, 0.6)` で低音域により多くのバーを割り当て、人間の聴覚特性に合致
  - **ビン平均化**: 各バーに割り当てられた周波数範囲の全ビンを使用（データ損失なし）
  - **平均+ピークブレンド**: `avg * 0.7 + maxVal * 0.3` で安定しつつもダイナミックな表示
- 効果: 低音域のレスポンスが改善、高音域の過剰な割り当てが解消、全体的に滑らかで正確なビジュアライゼーション

---

## ⚡ パフォーマンス最適化

### Canvas GPU合成（全プラットフォーム）
- `#cv` に `will-change: transform` を追加 → GPU合成レイヤーとして独立描画
- `contain: strict` を追加 → ブラウザのレイアウト計算範囲を制限

### Android省電力モードの改善
- FPS ≤ 30時に自動でglow効果を無効化（`shadowBlur` を停止）
- `targetFps` ベースの判定に更新

---

## 📁 変更ファイル一覧

### HTML
| ファイル | 変更内容 |
|---------|---------|
| `audio/index.html` | FPSセレクター追加、EQプリセットボタン追加 |
| `android-app/www/index.html` | 同上 |
| `pc-app/public/index.html` | 同上 |

### CSS
| ファイル | 変更内容 |
|---------|---------|
| `audio/style.css` | Canvas GPU合成・contain追加 |
| `android-app/www/style.css` | 同上 |
| `pc-app/public/style.css` | 同上 |

### JavaScript
| ファイル | 変更内容 |
|---------|---------|
| `audio/script.js` | 動画速度同期、FPS設定、getFilteredData改良、EQプリセット、visibilitychange |
| `android-app/www/script.js` | 動画速度同期、FPS設定、getFilteredData改良、EQプリセット、visibilitychange、バックグラウンド処理 |
| `pc-app/public/script.js` | 動画速度同期、FPS設定、getFilteredData改良、EQプリセット、visibilitychange |

### Java (Android)
| ファイル | 変更内容 |
|---------|---------|
| `MainActivity.java` | onPauseオーバーライド（バックグラウンド音声維持）、WebView設定 |

---

## ⌨️ キーボードショートカット変更

| キー | 変更前 | 変更後 |
|------|--------|--------|
| `L` (Android) | 低電力モード ON/OFF | FPSサイクル切替 (30→60→120→MAX) |
| `[` / `]` | 再生速度変更 | 再生速度変更 + 動画速度同期 |
