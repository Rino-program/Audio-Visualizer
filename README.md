# Audio Visualizer - 全体セットアップガイド

このプロジェクトは3つのプラットフォームで同じ機能を提供します：
- **Web版**: ブラウザで即座に利用（セットアップ不要）
- **PC版**: Windows用デスクトップアプリ（Electron）
- **Android版**: APK形式のモバイルアプリ（Capacitor）

---

## 📋 プロジェクト構成

```
Audio Visualizer/
├── audio/                  # Web版（ブラウザ）
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── GOOGLE_API_GUIDE.md
│
├── pc-app/                 # Windows デスクトップアプリ（Electron）
│   ├── public/
│   │   ├── index.html
│   │   ├── script.js
│   │   └── style.css
│   ├── main.js
│   ├── preload.js
│   ├── package.json
│   ├── README.md
│   └── release/
│       └── Audio-Visualizer-Portable.zip
│
├── android-app/            # Android APK（Capacitor）
│   ├── www/                (Web資産)
│   ├── android/            (Gradleプロジェクト)
│   ├── capacitor.config.json
│   ├── package.json
│   └── README.md
│
└── README.md              # このファイル
```

---

## 🌐 Web版（ブラウザ）

セットアップ不要。ローカルでテスト：

```bash
cd audio
npx serve .
# ブラウザで http://localhost:3000 を開く
```

または `audio/index.html` をブラウザに直接ドラッグ&ドロップ。

---

## 💻 PC版（Electron）のセットアップ

### 開発・実行

```bash
cd pc-app
npm install
npm run dev
```

Electronウィンドウが起動し、デスクトップアプリとして動作します。

### ビルド・配布

```bash
npm run build
```

生成ファイル: `release/Audio-Visualizer-Portable.zip`

このZipファイルをGitHubのReleasesにアップロード。ユーザーはダウンロード・解凍して実行できます。

#### 実行方法（配布後）
1. `Audio-Visualizer-Portable.zip` をダウンロード
2. 解凍
3. `Audio-Visualizer-Portable/` フォルダ内の `audio-visualizer-desktop.exe` を実行

---

## 📱 Android版（Capacitor）のセットアップ

### 前提条件

以下が必須です：
- Node.js v18以上
- Java JDK 11以上
- Android SDK (API 21以上)
- Android Studio（推奨）

### セットアップ手順

```bash
cd android-app
npm install
npx cap sync
```

### APKのビルド

#### 推奨: Android Studioで実行

```bash
npx cap open android
```

Android Studioで：
- `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)` でAPK生成

#### コマンドラインでビルド（Java必須）

```bash
cd android-app/android

# Debug APK
.\gradlew.bat assembleDebug

# Release APK
.\gradlew.bat assembleRelease
```

生成場所: `app/build/outputs/apk/*/`

### Release APK の署名

```bash
# キーストア作成（初回のみ）
keytool -genkey -v -keystore my-release-key.keystore \
  -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000

# 署名
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
  -keystore my-release-key.keystore \
  android/app/build/outputs/apk/release/app-release-unsigned.apk my-key-alias

# 最適化
zipalign -v 4 android/app/build/outputs/apk/release/app-release-unsigned.apk \
  audio-visualizer.apk
```

---

## 🚀 配布方法

### GitHub Releases での公開

1. リポジトリをGitHubに作成
2. コードをpush
3. Releasesで新規リリース作成
4. 成果物をアップロード：
   - **PC版**: `pc-app/release/Audio-Visualizer-Portable.zip`
   - **Android版**: `audio-visualizer.apk` (署名済み)

### ダウンロード・インストール

**Windows PC**
1. GitHub Releasesから `.zip` をダウンロード
2. 解凍
3. `.exe` を実行

**Android端末**
1. GitHub Releasesから `.apk` をダウンロード
2. ファイルマネージャーで `.apk` をタップ
3. インストール確認

※ 設定 → セキュリティ → 「提供元不明のアプリ」許可が必要な場合あり

---

## 📝 各版の機能比較

| 機能 | Web | PC | Android |
|------|-----|----|----|
| ファイル再生 | ✅ | ✅ | ✅ |
| マイク入力 | ✅ | ✅ | ✅ |
| ビジュアライザー（9モード） | ✅ | ✅ | ✅ |
| EQ・設定 | ✅ | ✅ | ✅ |
| 動画表示 | ✅ | ✅ | ⚠️ 制限 |
| Google Drive連携 | ✅ | ✅ | ⚠️ 制限 |
| オフライン動作 | ❌ | ✅ | ✅ |
| インストール不要 | ✅ | ❌ | ❌ |

---

## 🔧 トラブルシューティング

### PC版が起動しない
- `npm install` を再実行
- Node.js v18以上を使用しているか確認

### Android版のビルドエラー
- Android Studioを使用してビルド（推奨）
- Java JDK 11がインストールされているか確認
- `gradlew clean` でキャッシュをクリア

### 画面が真っ白
- ブラウザのコンソールでエラー確認
- Android版: `npx cap sync` を再実行

---

## 📚 追加情報

- [PC版 README](pc-app/README.md)
- [Android版 README](android-app/README.md)
- [Google API ガイド](audio/GOOGLE_API_GUIDE.md)（Google Drive連携用）

---

## 🔐 秘密情報（重要）

以下はリポジトリにコミットしないでください（`.gitignore` で除外しています）：
- `android-app/android/keystore.properties`
- `android-app/android/app/google-services.json`
- `*.jks`, `*.keystore`, `.env*`

---

## 📄 ライセンス

MIT
