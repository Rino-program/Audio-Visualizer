# Audio Visualizer Pro - Android版

## 概要
Web版のAudio Visualizer ProをCapacitorでAndroidアプリ化したものです。APKとしてインストール・配布できます。

## 機能
- 音声ファイル再生とリアルタイムビジュアライザー（9モード）
- マイク入力でのリアルタイム表示
- イコライザー（EQ）
- プレイリスト管理
- 設定の保存
- ビジュアライザーの録画・書き出し（動画）

## セットアップ手順

### 1. 前提条件
以下がインストールされていることを確認してください：
- Node.js (v18以上)
- Java JDK 11以上
- Android SDK (API Level 21以上)
- Android Studio（推奨）

### 2. 依存関係のインストール
```bash
npm install
```

### 3. Androidプラットフォームの追加（初回のみ）
```bash
npx cap add android
```

### 4. Web資産の同期
```bash
npx cap sync
```

### 5. APKのビルド

#### 方法A: Android Studioを使用（推奨）
```bash
npx cap open android
```

Android Studioで以下を実行：
- **Debug APK**: `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
- **Release APK**: `Build` → `Build Bundle(s) / APK(s)` → `Build Bundle(s)`

生成場所：
- Debug: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release: `android/app/build/outputs/bundle/release/app-release.aab`

#### 方法B: コマンドラインを使用（Java JDK必須）
```bash
cd android

# Debug APK
.\gradlew.bat assembleDebug

# Release APK（署名前）
.\gradlew.bat assembleRelease
```

生成場所: `app/build/outputs/apk/`

## APKの署名（配布用）

### キーストアの作成
```bash
keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

### APKへの署名
```bash
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore my-release-key.keystore android/app/build/outputs/apk/release/app-release-unsigned.apk my-key-alias
```

### 最適化（zipalign）
```bash
zipalign -v 4 android/app/build/outputs/apk/release/app-release-unsigned.apk audio-visualizer.apk
```

## 動作要件
- Android 5.0 (API Level 21) 以上
- ストレージ権限（ファイル読み込み用）
- マイク権限（マイク入力モード用）

## 注意事項
- Google Drive連携機能はAndroid版では制限があります（ブラウザ版のOAuth動作に依存）
- マイク入力はAndroidのシステムマイクへのアクセス権限が必要
- 動画書き出し機能はAndroidデバイスの性能に依存します

## トラブルシューティング

### Gradleビルドエラー
- Android SDKとJDKのバージョンを確認
- `android/` フォルダで `gradlew clean` 実行

### 権限エラー
- `android/app/src/main/AndroidManifest.xml` で必要な権限が宣言されているか確認

### 画面が真っ白
- `npx cap sync` を再実行してWeb資産を同期
- Chrome DevTools（chrome://inspect）でAndroidアプリのコンソールを確認

## 開発・デバッグ
Android実機またはエミュレータでアプリを起動し、ChromeのDevToolsで接続：
1. Chromeで `chrome://inspect` を開く
2. 接続されたデバイスのアプリを選択
3. コンソールでエラーやログを確認

## 配布
- 生成された `.apk` ファイルをGitHubのReleasesページにアップロード
- ユーザーはAPKをダウンロードしてAndroid端末にインストール

## ライセンス
MIT
