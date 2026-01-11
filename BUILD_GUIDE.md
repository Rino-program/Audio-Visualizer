# 🏗️ ビルドガイド

このガイドでは、Audio Visualizerのビルド方法を説明します。

---

## 📦 PC版のビルド

### 前提条件

- Node.js v18以上がインストールされていること
- Windows環境（ポータブル版のビルドはWindows専用）

### ビルド手順

1. **ターミナルを開く**
   - VS Codeの場合: `` Ctrl + ` `` または `Terminal` → `New Terminal`
   - または、コマンドプロンプト/PowerShellを開く

2. **pc-appディレクトリに移動**
   ```powershell
   cd "c:\VSCode_program\Audio Visualizer\pc-app"
   ```

3. **依存関係のインストール（初回のみ）**
   ```powershell
   npm install
   ```

4. **ビルドの実行**
   ```powershell
   npm run build
   ```

### ビルド成果物

ビルドが成功すると、以下のファイルが生成されます：

```
pc-app/
└── release/
    ├── Audio-Visualizer-Portable.zip  ← 配布用（推奨）
    └── Audio-Visualizer-Portable/     ← 解凍済みフォルダ
        ├── audio-visualizer-desktop.exe
        ├── resources/
        ├── locales/
        └── ... その他のElectronファイル
```

### 配布方法

`Audio-Visualizer-Portable.zip` をGitHub Releasesにアップロードしてください。

---

## 📱 Android版のビルド

### 前提条件

- Node.js v18以上
- Java JDK 11以上
- Android SDK (API 21以上)
- Android Studio（推奨）

### ビルド手順

#### 方法1: Android Studio（推奨）

1. **プロジェクトの同期**
   ```powershell
   cd "c:\VSCode_program\Audio Visualizer\android-app"
   npm install
   npx cap sync
   ```

2. **Android Studioを開く**
   ```powershell
   npx cap open android
   ```

3. **APKのビルド**
   - Android Studioで `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`

4. **APKの場所**
   ```
   android-app/android/app/build/outputs/apk/debug/app-debug.apk
   ```

#### 方法2: コマンドライン

1. **Debug APKのビルド**
   ```powershell
   cd "c:\VSCode_program\Audio Visualizer\android-app"
   npm install
   npx cap sync
   cd android
   .\gradlew.bat assembleDebug
   ```

2. **Release APKのビルド（署名が必要）**
   ```powershell
   .\gradlew.bat assembleRelease
   ```

### 署名方法（Release版）

Release APKは署名が必要です：

1. **キーストアの作成（初回のみ）**
   ```powershell
   keytool -genkey -v -keystore my-release-key.keystore `
     -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **署名**
   ```powershell
   jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 `
     -keystore my-release-key.keystore `
     app/build/outputs/apk/release/app-release-unsigned.apk my-key-alias
   ```

3. **最適化**
   ```powershell
   zipalign -v 4 app/build/outputs/apk/release/app-release-unsigned.apk `
     audio-visualizer.apk
   ```

**⚠️ 重要**: `keystore`ファイルは絶対にGitにコミットしないでください！

---

## 🌐 Web版

Web版はビルド不要です。`audio/` フォルダの内容をそのままWebサーバーにデプロイしてください。

### ローカルテスト

```powershell
cd "c:\VSCode_program\Audio Visualizer\audio"
npx serve .
```

ブラウザで `http://localhost:3000` を開きます。

---

## 🔧 トラブルシューティング

### PC版: ビルドエラー

**エラー**: `npm: command not found`
- **解決策**: Node.jsをインストールしてください

**エラー**: `electron-packager: command not found`
- **解決策**: `npm install` を実行してください

### Android版: Gradleエラー

**エラー**: `JAVA_HOME is not set`
- **解決策**: Java JDK 11をインストールし、環境変数を設定してください

**エラー**: `SDK location not found`
- **解決策**: `android-app/android/local.properties` に以下を追加：
  ```properties
  sdk.dir=C:\\Users\\<YourUsername>\\AppData\\Local\\Android\\Sdk
  ```

---

## 📋 ビルド前チェックリスト

- [ ] Node.js v18以上がインストールされている
- [ ] `npm install` を実行済み
- [ ] （Android版）Java JDK 11以上がインストールされている
- [ ] （Android版）Android SDKがインストールされている
- [ ] 依存関係の脆弱性チェック（`npm audit`）を実行済み
- [ ] `.gitignore` が正しく設定されている
- [ ] 秘密情報（APIキー、keystore）がコミットされていない

---

## 🚀 CI/CD自動化（オプション）

GitHub Actionsを使用して自動ビルドを設定できます。

`.github/workflows/build.yml` の例：

```yaml
name: Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Build PC App
        run: |
          cd pc-app
          npm install
          npm run build
      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: Audio-Visualizer-Portable
          path: pc-app/release/Audio-Visualizer-Portable.zip
```

---

<div align="center">

**🎵 Happy Building! 🎨**

Made with ❤️ by Human & AI collaboration

</div>
