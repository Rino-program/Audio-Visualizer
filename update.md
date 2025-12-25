# Audio Visualizer — 実装仕様書（改良機能一式）
対象: Android (Capacitor), Web, PC（同一コードベース / www の共有）  
目的: 以下の機能を安全かつ高性能に実装して、最終的に Android 用 APK をビルドする。

採用する改良一覧（優先順・まとめ）
1. draw ループ内の「無駄な再計算」を削減（色、shadow、グラデのフレームキャッシュ）
2. グラデーション・シャドウ・一時オブジェクトの再利用（GC 削減）
3. シークレット対策（`.gitignore` 追加・シークレットスキャン導入）
4. 音の「変化度（+ / ±）」モードと「砂モード」（砂のワープ防止、円形の角度補正含む）
5. バー高さに基づく画面シェイク効果
6. 画面周囲にキラキラ（sparkle / particle）効果
7. blob URL 改善（lazy create + prefetch next + LRU キャッシュ + 直接選択時は即生成）
8. すべて実装後に Android 用 APK を作成（署名を含む）

このドキュメントは「何を」「どこに」「どのように」変更するかを具体的に示します。コード例（差分）・テスト手順・プラットフォーム差分・注意点を含みます。実装はバグが入らないよう注意点・テストチェックリストを必ず守ってください。

---

## 前提（共通）
- 既存のビジュアライザー実装（`android-app/www/script.js`）をベースに変更する。
- Web / PC / Android は同じ `www/` の JS を利用するため、可能な限り共通実装にする。ネイティブ固有の処理（ファイルURIの変換など）は分岐して扱う。
- パフォーマンス低下を避けるため、余計なオブジェクト生成・同期I/O・頻繁な seek を抑制する設計を優先する。
- すべての変更は段階的に入れて、各段階で自動/手動テストを行う。

---

## 1) draw ループ内の「無駄な再計算」を削減（色・shadow・グラデ作成のキャッシュ）
目的
- 毎フレーム同じ計算（時間依存値、色文字列、複雑なHSL→文字列変換、shadow 計算）を繰り返さない。

実装方針
- draw() の冒頭でフレーム単位で使う値（now, timeHue, globalShadowBlur など）を一度だけ計算する。
- per-bar の color はフレームごとに配列 colors[n] を構築して使い回す（getColor をループ内で文字列を毎回構築しない）。
- shadowBlur は「フレーム単位の最大/平均値」に基づいて一括設定し、バーごとの細かな blur 値は重くなるので極力避ける（もしくは軽量にスケールする）。
- グラデーション（createLinearGradient）は、画面サイズ・設定が変わった時のみ再生成。フレームごと作成しない。

コードの位置（例）
- `android-app/www/script.js`:
  - `draw(ts)` の冒頭に `const now = Date.now(); const timeHue = ...;` と `const colors = new Array(n)` を作る
  - `getColor(i, v, n)` を「色の数列を作る」ユーティリティにし、文字列生成は一箇所でまとめる

注意
- 色文字列キャッシュは設定（rainbow/固定色）や timeHue が変わったら更新する。

テスト
- 変更前 / 後で DevTools の CPU プロファイルを比較。フレームあたりのコール数と JS 時間が減っていることを確認。

---

## 2) グラデーション・シャドウ・一時オブジェクトの再利用（GC 削減）
目的
- フレーム毎の配列やオブジェクト生成を減らし、GC のスパイクを抑制。

実装方針
- バッファ類は再利用：
  - `state.freqData`, `state.timeData` は既に存在するが、`displayValues`, `prevLevels`, `sandHeights` なども `Float32Array` で初期化し再利用する。
  - 一時配列はグローバルで用意し、毎フレーム new しない。
- パーティクルや sparkles はオブジェクトプールで再利用（push/pop で管理）。
- 文字列生成（色）もフレームで一括生成して参照する（新しい文字列を大量に作らない）。
- `createLinearGradient`、`ctx.createPattern` 等は設定変更時または canvas サイズ変化時のみ作成。

効果
- GC 発生回数と時間が減り、長時間再生時のフレームドロップが減る。

テスト
- Chrome Memory タブで Allocation timeline を取り、短時間あたりの新規オブジェクト数が減っていることを確認。

---

## 3) シークレット対策（`.gitignore` 追加・スキャン）
目的
- API キーや keystore などの誤コミットを防ぎ、公開リポジトリでの秘密漏洩リスクを無くす。

実装方針（即行）
1. `.gitignore` に下記を追加（少なくとも android-app ディレクトリで管理）:
   ```
   # Android signing and google services
   android/app/keystore.properties
   *.jks
   android/google-services.json
   android-app/android/app/google-services.json
   # local envs
   .env.local
   .env
   ```
2. CI（GitHub Actions）に gitleaks を組み込む (例: `.github/workflows/gitleaks.yml`)。PR 時に検出して失敗させる。
   - ローカル実行用: `gitleaks detect --source . --report-path ./gitleaks-report.json`
3. もし過去にシークレットがコミットされていたら:
   - 速やかに該当サービスでキーのローテーション（revoke & regenerate）。
   - git 履歴からの除去（`git filter-repo` または `BFG Repo-Cleaner`）を実施（チーム合意が必要）。
4. 開発フロー:
   - 環境変数や CI シークレット（GitHub Secrets）で秘密を管理する。

テスト
- PR を作り gitleaks がトリガされないことを確認。
- ローカルで detect-secrets などを走らせるワークフローを検証。

---

## 4) 音の「変化度（+ / ±）」モードと「砂モード」実装
仕様
- `changeMode` 設定（UI）:
  - `off`: 既存（振幅をそのまま表示）
  - `plus`: 増分のみ表示（display = max(0, cur - prev)）
  - `plusminus`: 増加は上、減少は下（signed）で表示（display = cur - prev）
- `sandMode` 設定（UI）:
  - 棒グラフ系（bars modes）にのみ適用
  - `sandHeights[i]` は normalized (0..1)
  - 砂の追従ルール（改良版、ワープ防止）:
    - 毎フレーム cur = current level (0..1)
    - if cur >= sand[i]: sand[i] = cur (接触したら追従)
    - else sand[i] = max(0, sand[i] - sandFallRate * dt)（ゆっくり落ちる）
- 円形棒グラフ（circle）対応:
  - 円の各バーの角度に沿って砂を描画（点または小さな円弧）
  - `circleAngleOffset` 設定で角度補正

実装方針（関数分離で安全に）
- `getFilteredData()`（既存）で `state.freqData` を取得。
- 追加: `computeDisplayValues(rawFreq, dt)` を作成して:
  - `cur[]` を算出（normalized）
  - `display[]` を `changeMode` に従って作成
  - `updateSand(cur, dt)` を行う（sandHeights の更新）
  - `prevLevels = cur` を更新
  - `return display`
- 描画関数は `display` を受け取る (例 `drawBarsFromDisplay(display, ...)`、`drawCircleFromDisplay(display, ...)`)。
- 既存の draw 関数は一時的にラップして、`display` 経由で描画するよう移行する（段階的に適用可能）。
- UI: 設定 modal に `changeMode` セレクト、`sandMode` チェックボックス、`sandFallRate` スライダを追加。設定は `saveSettingsToStorage()` で持続。

パフォーマンス注意
- display 配列と sandHeights は `Float32Array` 等で再利用し GC を防ぐ。
- sand の描画は簡素な横線や小さな円で負荷を抑える。高 barCount では線の太さを下げる。

テスト（必須）
- `changeMode` を切り替えながら視覚確認（plus: アタックで上に出る、plusminus: 中央基準で上下に出る）
- `sandMode` を on/off で砂の挙動を比較（上昇ワープがないこと）
- 円形モードで `circleAngleOffset` を変えて見た目を確認
- 自動/手動テストシナリオ（長時間再生・ジャンプ・seek）で安定性を確認

---

## 5) 画面シェイク（shake）実装
目的
- 音量（または変化量）に応じて画面全体を軽く揺らし、体感の「ノリ」を強調する。

デザイン条件
- デフォルト OFF。ユーザーが有効にする（設定UI）。
- `prefers-reduced-motion` を尊重し、既定で効果オフまたは非常に弱めにする。
- lowPowerMode 時は自動で弱める / OFF。

実装方針
- `state.shake = { x, y }` を持ち、`updateShake(display, dt)` で更新。
- エネルギー計算は `energy = max( avg(|display[i]|) , max(|display[i]|) )` など。必要なら切替設定追加。
- `target` を random direction * energy * `shakeMaxPx` で作り、`lerp`（指数平滑）で state.shake に反映する。
- 描画: draw の先頭で `ctx.save(); ctx.translate(state.shake.x, state.shake.y);` 描画 → `ctx.restore()`。（UIレイヤーを揺らしたいなら UI を内包する canvas に適用）

UI
- toggle `shakeMode`、`shakeMaxPx`（0..30）、`shakeSmoothing`（0..0.99）を追加。

注意点
- 強すぎると酔う、見辛い。必ずデフォルト弱めか OFF。
- モバイルは特にバッテリーに注意。lowPowerMode でキャンセル。

テスト
- `shakeMode` ON/OFF 切替
- `prefers-reduced-motion` と lowPowerMode の組み合わせ確認
- 切替時に描画のジャンクが発生しないこと（save/restore を整合的に使う）

---

## 6) キラキラ（sparkle / particle）効果実装
目的
- 画面周囲（または円周）に小さなパーティクルを spawn させ、音量エネルギーに応じて増減させる。

設計
- オブジェクトプール（`freeParticles[]`, `particles[]`）で管理。最大 `sparkleMax` を設定。
- Spawn は `spawnRate * energy * dt` に比例（累積して整数分 spawn）。
- パーティクル属性: `{ x,y,vx,vy,life,maxLife,size,color }`
- 描画: `ctx.globalCompositeOperation = 'lighter'` を利用して輝きを表現。
- パフォーマンス: `sparkleMax` を 120 程度に制限。lowPowerMode で spawnRate を下げる。

UI
- toggle `sparkleMode`, `sparkleSpawnRate`, `sparkleMax`, `sparkleSize`, `sparkleColor`（色選択）を追加。

注意点
- arc を大量に描くと重い→負荷高い場合は小さな `fillRect` か pre-rendered offscreen canvas を drawImage で描画する方式に切替え。
- prefers-reduced-motion の考慮。

テスト
- sparkles を ON/OFF して負荷を計測（DevTools）。長時間再生でフレーム安定性をチェック。

---

## 7) blob URL 改善（lazy create + prefetch next + LRU キャッシュ + 即時生成 on direct selection）
目的
- 多数曲を読み込む状況でメモリとデコーダ資源の枯渇を防ぎ、長時間の連続再生でのカクつきや動画停止を回避する。

設計・動作
- Playlist の track 構造:
  ```js
  {
    name: "...",
    source: "local"|"drive"|"path",
    fileBlob: Blob | undefined,    // ファイル実体がある場合
    localRef: "idb:xxxx" | "app:/path" | null,
    url: string|undefined,         // audio.src に与える値 (blob:... または toCapacitorFileUrl)
    ephemeral: boolean // url が createObjectURL により一時的に生成されたか
  }
  ```
- `BlobUrlCache`（LRU 実装）:
  - `maxSize = 2`（current + next） を推奨。キャッシュにある entry は revoke しない。
  - `ensureUrlForTrack(track)` は IDB 読み込みを含めて `track.url` を用意し、キャッシュへ登録する（同期的な場合は速やかに返る）。
  - `release(track)` はキャッシュから除外するときに `URL.revokeObjectURL()` を呼ぶ。
- `playTrack(index)` の流れ:
  1. `await ensureUrlForTrack(track)` （IDB 読み込み含む）
  2. `audio.src = track.url; audio.load(); audio.play()`
  3. 非同期で `ensureUrlForTrack(nextTrack)` を始める（prefetch）
  4. `blobCache` が `maxSize` を越えたら最古を revoke し free にする
- `handleFiles()` / `fetchDriveFile()`:
  - インポート時に絶対に `createObjectURL` を行わないで `fileBlob` または `localRef` を保存する（メモリを過剰に使わないため）。
  - ただし小数ファイルやメモリ状況を踏まえ optional prefetchAll などは注意して提供する（デフォルトは OFF）。
- `releaseObjectUrlForTrack(prevTrack)` を再生切替時に呼んで不要URLは即解放。

seek / mv 同期対策との関連
- Blob URL を減らしてデコーダリソースを確保できれば、`bgVideo.currentTime` の hard seek 時のブロッキングが発生しにくくなる。
- ただし seek 自体が重い場合は（大きな jump）、`playbackRate` 補正で滑らかにするアルゴリズムを併用することを推奨。

UI 挙動（ユーザー操作）
- 「次へ／前へボタン」「プレイリスト直接選択」操作時は target track の URL を即座に ensure (await) してから再生。必要ならロードオーバーレイを出す。
- 自動で流すケースでは current + next のみ先に確保 -> スワップで常に 2 個を保持。

安全対策
- `URL.revokeObjectURL` を呼ぶ前に `audio.src` / `bgVideo.src` がその URL でないか確認する（誤って再生中のものを破棄しない）。
- エラー処理を丁寧に行う（IDB 読み出し失敗時は skip or retry）。

テスト
- 200 曲インポート→連続再生テスト（before/after 比較）
- Chrome Remote Debugging で memory snapshot（JS heap, detached DOM nodes）を撮る
- 再生中の console エラー（MediaDecodeError）を観察

---

## 8) Android 用 APK 作成手順（実装後）
前提: 上記を `android-app/www` に実装、`npx cap sync` で Android プロジェクトに反映されていること。

1. keystore の準備（ローカルで安全に保管）
   ```bash
   keytool -genkey -v -keystore my-release-key.jks -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```
   - 生成したファイルは絶対にリポジトリに入れない（`.gitignore` に記載）。

2. `android/app/keystore.properties` を作る（git 管理対象外）
   ```
   storeFile=/path/to/my-release-key.jks
   storePassword=********
   keyAlias=my-key-alias
   keyPassword=********
   ```
3. ビルド（Windows の場合の例）
   ```bash
   cd android-app/android
   ./gradlew assembleRelease
   ```
   または app bundle:
   ```bash
   ./gradlew bundleRelease
   ```
4. 生成物を確認:
   - `android/app/build/outputs/aab/release/app-release.aab`
   - `android/app/build/outputs/apk/release/app-release.apk`（あるいは unsigned）

5. Google Play にアップロードする場合:
   - App Signing を有効にするか、ローカル keystore を使うか運用方針を決定
   - Play Console 上で Data Safety / Permissions の登録（RECORD_AUDIO など）を行う
   - プライバシーポリシーの URL を用意して Play Store listing に追加

注意: ビルド前に `keystore.properties` が参照される設定（`app/build.gradle`）に合わせてパスを正しく置く。

---

## 実装・QA (バグが入らないようにするための具体的手順)
1. 小さく段階的に実装する（必ず一段階ずつ実機テスト）
   - フェーズ A: blob URL 改善 + playTrack の ensure/prefetch（最優先）
   - フェーズ B: draw の precompute + GC 削減（軽量化）
   - フェーズ C: changeMode + sandMode（描画ロジック）
   - フェーズ D: shake + sparkles + settings UI
   - フェーズ E: 全体の結合テスト・デバイステスト → APK ビルド
2. 各変更での自動テスト/手順:
   - lint / eslint を実行
   - ユニットテスト（computeDisplayValues の純粋関数は単体テスト可能）
   - 手動 E2E: Chrome Remote Debugging で 3 デバイス（Desktop, Android 実機, PC）テスト
3. エラーハンドリング:
   - `ensureUrlForTrack()` は例外を投げる可能性があるため `try/catch` で安全に fallback（次の曲へジャンプ、またはユーザーにエラー表示）
   - `URL.revokeObjectURL()` の前後で参照チェック
   - Non-blocking な prefetch（await しない）を使って UI 側でローディング UI を表示する
4. メトリクス収集（デバッグ用）:
   - コンソールログに `playlist.length`, `ephemeralUrlCount`, `JS heap size` を随時出力するオプション（デバッグビルド）を入れる
5. 回帰テストケース（必須）
   - 単曲再生 / 連続再生（200曲）で 30 分以上回す
   - next/prev/button/playlist direct select 操作で即時再生されること
   - sand up/down, changeMode 切替で描画崩れがないこと
   - lowPowerMode ON/OFF、prefers-reduced-motion を変更して効果が変わること
   - Android 特有のメモリ不足でプロセスが kill されないこと

---

## ファイル差分の大まかな指示（実装者向け）
変更箇所（主なファイル）
- `android-app/www/script.js`（主要な全機能）
  - 新規：`BlobUrlCache` クラス、`ensureUrlForTrack`, `releaseObjectUrlForTrack`
  - 変更: `handleFiles`, `fetchDriveFile`, `loadPlaylistFromStorage`：createObjectURL をやめて `fileBlob` を保存
  - 変更: `playTrack`：`ensureUrlForTrack(current)` を await → audio.src = url → play。非同期で prefetch next。
  - 追加: `computeDisplayValues(rawFreq, dt)`, `drawBarsFromDisplay`, `drawCircleFromDisplay`
  - 変更: `draw()`：フレームプリコンピュート（timeHue/colors), computeDisplayValues 呼び出し, updateShake, spawnSparkles, drawing with ctx.save()/translate
  - 追加: sparkle object pool, shake update
- `android-app/www/index.html` / settings modal
  - UI の追加（changeModeSelect, sandModeCheckbox, sandFallRate input, shakeMode, shakeMaxPx, sparkleMode, sparkleSpawnRate, circleAngleOffset）
- `.gitignore`（repo ルート または android-app 配下）
  - Add keys described earlier
- `.github/workflows/gitleaks.yml`（optional）
  - PR CI に gitleaks を入れるサンプルワークフロー

注意: 実際の差分は大きくなり得ます。まずは「BlobUrlCache + playTrack の ensure+prefetch + handleFiles の lazy storage」を適用し、実機で効果検証→次に描画関連の改造を進めるのが安全です。

---

## 推奨ワークフロー（実施プラン／時間見積）
1. Stage 1 (1 day)
   - `.gitignore` と gitleaks ワークフロー追加
   - BlobUrlCache + ensure/release + playTrack prefetch 実装 + unit test for url cache
   - Quick manual test on Web + PC
2. Stage 2 (1 day)
   - Play long-run test on Android with 200曲、measure improvements
   - Tweak LRU size/prefetch depth
3. Stage 3 (1–2 days)
   - draw precompute + GC 削減実装
   - computeDisplayValues + sandMode basics
4. Stage 4 (1–2 days)
   - changeMode plus/plusminus + sand improvements + circle angle
   - settings UI wiring
5. Stage 5 (0.5–1 day)
   - shake + sparkles + prefers-reduced-motion/lowPowerMode adjustments
6. Stage 6 (0.5 day)
   - Integration tests, bugfixes, prepare release
7. Stage 7 (0.5 day)
   - Build signed APK / AAB and smoke test on devices

（合計目安: 5–8 営業日、実機テストとデバッグにより前後）

---

## 最後に — バグゼロ実装のためのチェックリスト（必ず守る）
- すべての非同期 I/O (IDB読み込み・fetch) は try/catch で囲む。
- `URL.revokeObjectURL()` は参照チェック後にのみ行う。
- `playTrack` の処理は race condition を避ける（ユーザーが連打すると古い ensure が終わる前に別トラックが再生されるケース）。
  - 対策: `playRequestId` を使って ensure の完了時にまだ同じトラックを再生する必要があるか検査する。
- グローバル変数の命名衝突を避け、`state.` に全て格納して管理する。
- draw 関数で `ctx.save()/restore()` は必ず対にする。
- 新しく追加する配列は初期化/リサイズロジックを入れて `barCount` の変更に対応する。
- UI 設定の読み込み・保存（localStorage）を忘れない。
- `prefers-reduced-motion` を必ず確認する（使わない場合でも設定でOFFにできる）。
- 実装後、内蔵の例外と console エラーを 0 にする（dev build）。



# 第二改善について
確認ではなく、コードのバグチェックでいいです。
全て(3種)での修正点
- 砂モード時の砂の位置が、変化モード通常以外では合っていない。
- 砂の色を対応する棒グラフと同じ色にできるようにしてほしい。
- 円形バーの角度を-179~180まで対応させてほしい。
- キラキラ効果が予想どうりではない(落ち着ぎ過ぎている,設定を変えてもあまり変わらない)。


# 第三改善について
- キラキラ効果とシェイクは廃止してください。
- 設定UIのそれぞれのタブ同士の空白を少し少なくして。
- 少しmvが遅いので0.15から0.2にして。