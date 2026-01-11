# 🎵 Audio Visualizer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Windows%20%7C%20Android-blue)]()

**高機能なオーディオビジュアライザー** - 音楽ファイルやマイク入力を美しく可視化するクロスプラットフォームアプリケーション

> **Note:** このプロジェクトは人間とAI（GitHub Copilot/Claude）の共同開発によって作成されました。

---

## ✨ 特徴

- 🎨 **9種類のビジュアライザーモード** - Bars, Wave, Digital, Circle, Spectrum, Galaxy, Monitor, Hexagon, Mirror
- 🎚️ **10バンドイコライザー** - 細かな音質調整が可能
- 🎤 **マイク入力対応** - リアルタイムでマイク音声を可視化
- 📹 **動画書き出し機能** - ビジュアライザーを動画として保存
- ☁️ **Google Drive統合** - クラウドから音楽を直接読み込み
- 📱 **クロスプラットフォーム** - Web、Windows、Androidで動作
- 🌐 **完全オフライン動作** - インターネット接続不要（Google Drive機能を除く）

---

## 🚀 プラットフォーム

このプロジェクトは3つのプラットフォームで同じ機能を提供します：

| プラットフォーム | 説明 | ディレクトリ |
|---|---|---|
| 🌐 **Web版** | ブラウザで即座に利用（セットアップ不要） | `audio/` |
| 💻 **PC版** | Windows用デスクトップアプリ（Electron） | `pc-app/` |
| 📱 **Android版** | APK形式のモバイルアプリ（Capacitor） | `android-app/` |

---

## � プロジェクト構成

```
Audio-Visualizer/
├── 🌐 audio/              # Web版（ブラウザ）
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── GOOGLE_API_GUIDE.md
│
├── 💻 pc-app/             # Windows デスクトップアプリ（Electron）
│   ├── public/            # アプリのフロントエンド
│   ├── main.js            # Electronメインプロセス
│   ├── preload.js         # セキュリティブリッジ
│   ├── package.json
│   └── README.md
│
├── 📱 android-app/        # Android APK（Capacitor）
│   ├── www/               # Web資産
│   ├── android/           # Gradleプロジェクト
│   ├── capacitor.config.json
│   └── README.md
│
├── README.md              # このファイル
├── SECURITY_REPORT.md     # セキュリティ分析
└── update.md              # 更新履歴
```

---

## 🌐 Web版（ブラウザ）

**最も簡単に始められる方法**

### クイックスタート

`audio/index.html` をブラウザで直接開くだけで動作します。

### ローカルサーバーで実行（推奨）

```bash
cd audio
npx serve .
# ブラウザで http://localhost:3000 を開く
```

---

## 💻 PC版（Windows デスクトップアプリ）

Electronベースのデスクトップアプリケーションです。

### 開発・実行

```bash
cd pc-app
npm install
npm run dev
```

### ビルド・配布

```bash
npm run build
```

生成ファイル: `release/Audio-Visualizer-Portable.zip`

### エンドユーザーの使用方法

1. [Releases](../../releases)から `Audio-Visualizer-Portable.zip` をダウンロード
2. 任意のフォルダに解凍
3. `audio-visualizer-desktop.exe` を実行

詳細は [pc-app/README.md](pc-app/README.md) を参照してください。

---

## 📱 Android版

Capacitorを使用したネイティブAndroidアプリです。

### 前提条件

- Node.js v18以上
- Java JDK 11以上
- Android SDK (API 21以上)
- Android Studio（推奨）

### セットアップ

```bash
cd android-app
npm install
npx cap sync
```

### ビルド

**方法1: Android Studio（推奨）**

```bash
npx cap open android
```

Android Studioで `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`

**方法2: コマンドライン**

```bash
cd android-app/android

# Debug APK
.\gradlew.bat assembleDebug

# Release APK (署名が必要)
.\gradlew.bat assembleRelease
```

生成場所: `app/build/outputs/apk/*/`

### 署名方法

Release APKは署名が必要です：

```bash
# キーストア作成（初回のみ）
keytool -genkey -v -keystore my-release-key.keystore \
  -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000

# 署名
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore my-release-key.keystore \
  app-release-unsigned.apk my-key-alias

# 最適化
zipalign -v 4 app-release-unsigned.apk audio-visualizer.apk
```

**⚠️ 重要**: `keystore` ファイルは絶対にリポジトリにコミットしないでください。

詳細は [android-app/README.md](android-app/README.md) を参照してください。

---

## 🚀 配布・公開方法

### GitHub Releases での公開

1. **リポジトリの作成**
   - GitHubで新規リポジトリを作成
   - コードをpush

2. **リリースの作成**
   - GitHub の `Releases` → `Create a new release`
   - タグとリリースノートを作成

3. **成果物のアップロード**
   - **PC版**: `pc-app/release/Audio-Visualizer-Portable.zip`
   - **Android版**: 署名済み `.apk` ファイル

### ユーザーのインストール方法

**🖥️ Windows PC**
1. [Releases](../../releases)から `.zip` をダウンロード
2. 任意のフォルダに解凍
3. `audio-visualizer-desktop.exe` を実行

**📱 Android端末**
1. [Releases](../../releases)から `.apk` をダウンロード
2. ファイルマネージャーで `.apk` をタップ
3. インストールを実行

※ 初回インストール時は「提供元不明のアプリ」の許可が必要な場合があります

---

## � 機能比較

| 機能 | Web | PC | Android |
|------|:---:|:--:|:-------:|
| 🎵 音楽ファイル再生 | ✅ | ✅ | ✅ |
| 🎤 マイク入力 | ✅ | ✅ | ✅ |
| 🎨 9種類のビジュアライザー | ✅ | ✅ | ✅ |
| 🎚️ 10バンドEQ | ✅ | ✅ | ✅ |
| 📹 動画書き出し | ✅ | ✅ | ⚠️ 制限 |
| ☁️ Google Drive連携 | ✅ | ✅ | ⚠️ 制限 |
| 📂 プレイリスト管理 | ✅ | ✅ | ✅ |
| 💾 ローカルストレージ | ✅ | ✅ | ✅ |
| 🌐 オフライン動作 | ❌ | ✅ | ✅ |
| 📦 インストール不要 | ✅ | ❌ | ❌ |

---

## 🛠️ 技術スタック

- **フロントエンド**: HTML5 Canvas, Web Audio API, JavaScript (ES6+)
- **PC版**: Electron 28
- **Android版**: Capacitor 5
- **ビルドツール**: electron-packager, Gradle

---

## 🔧 トラブルシューティング

### 💻 PC版が起動しない
- `npm install` を再実行してください
- Node.js v18以上がインストールされているか確認してください
- Windowsの場合、管理者権限で実行してみてください

### 📱 Android版のビルドエラー
- Android Studioを使用してビルドすることを推奨します
- Java JDK 11がインストールされているか確認してください
- `cd android-app/android && .\gradlew.bat clean` でキャッシュをクリアしてください

### 🌐 Web版で音が出ない
- ブラウザの開発者ツール（F12）でエラーを確認してください
- マイクの場合、ブラウザのマイク許可を確認してください
- HTTPSまたはlocalhostで実行しているか確認してください

### 🎤 マイクが認識されない
- ブラウザ/アプリにマイクの権限を付与してください
- 設定タブでマイクデバイスを選択してください
- 他のアプリケーションがマイクを使用していないか確認してください

---

## 🔒 セキュリティについて

このプロジェクトのセキュリティ分析については [SECURITY_REPORT.md](SECURITY_REPORT.md) を参照してください。

**重要な注意事項**:
- Google Drive APIを使用する場合は、自身のAPIキーとClient IDを取得してください
- APIキーやkeystoreファイルは**絶対にリポジトリにコミットしないでください**
- `.gitignore` に機密情報が含まれていることを確認してください

---

## 📜 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。

---

## 🤝 開発について

**このプロジェクトは人間とAI（GitHub Copilot/Claude）の共同作業によって開発されました。**

### 貢献方法

バグ報告、機能リクエスト、プルリクエストを歓迎します！

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチをプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

---

## 📞 サポート

問題が発生した場合は、[Issues](../../issues) で報告してください。

---

## 📝 更新履歴

詳細な更新履歴については [update.md](update.md) を参照してください。

---

<div align="center">

**🎵 Enjoy your music with beautiful visualizations! 🎨**

Made with ❤️ by Human & AI collaboration

</div>

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
