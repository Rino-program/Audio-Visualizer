# 🎵 Audio Visualizer - PC版（Windows デスクトップアプリ）

[![Platform](https://img.shields.io/badge/Platform-Windows-blue)]()
[![Electron](https://img.shields.io/badge/Electron-28-47848F)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

> **Note:** このプロジェクトは人間とAI（GitHub Copilot/Claude）の共同開発によって作成されました。

---

## 📋 概要

Web版のAudio VisualizerをElectronでラップしたWindows向けデスクトップアプリケーションです。
**インストール不要のポータブル形式**で配布でき、USBメモリなどに入れて持ち運ぶことも可能です。

---

## ✨ 機能

- 🎵 **多形式対応** - MP3・WAV・AAC・OGG・FLAC等の音声ファイル再生
- 🎤 **マイク入力** - リアルタイムでマイク音声を可視化
- 🎨 **9種類のビジュアライザー** - Bars, Wave, Digital, Circle, Spectrum, Galaxy, Monitor, Hexagon, Mirror
- 🎚️ **10バンドイコライザー** - 細かな音質調整
- 📂 **プレイリスト管理** - 複数曲の管理・再生
- 📹 **動画書き出し** - ビジュアライザーを動画ファイルとして保存
- ☁️ **Google Drive統合** - クラウドから音楽を直接インポート
- ⚙️ **詳細設定** - スムージング、感度、品質、色彩のカスタマイズ
- 💤 **スリープタイマー** - 指定時間後に自動停止
- 💾 **設定の永続化** - アプリを閉じても設定を保存
- 🌐 **完全オフライン動作** - インターネット接続不要（Google Drive機能を除く）

---

## 🚀 セットアップ

### 開発者向け - 開発環境での実行

**前提条件**: Node.js v18以上

```bash
# 依存関係のインストール
npm install

# 開発モードで起動
npm run dev
```

Electronウィンドウが起動し、アプリが実行されます。

### 開発者向け - ビルド（配布用パッケージの作成）

```bash
npm run build
```

**生成される成果物**: `release/Audio-Visualizer-Portable.zip`

このZipファイルにはポータブル版のアプリケーションが含まれており、そのままユーザーに配布できます。

---

## 💾 エンドユーザー向け - インストール・使用方法

### ダウンロード

1. [GitHub Releases](../../releases) から最新版の `Audio-Visualizer-Portable.zip` をダウンロード
2. 任意のフォルダに解凍（例：デスクトップ、ドキュメント、USBメモリ等）
3. 解凍したフォルダ内の `audio-visualizer-desktop.exe` をダブルクリック

### 使い方

1. **音楽ファイルを追加**
   - 画面下部の「📂」ボタンをクリックして音楽ファイルを選択
   - または、ファイルを直接ドラッグ&ドロップ

2. **マイク入力に切り替え**
   - 画面上部の「🎤 Mic」ボタンをクリック
   - マイクの許可を求められたら「許可」をクリック

3. **ビジュアライザーモードの変更**
   - スペースキーを押すか、画面をクリックしてモードを切り替え

4. **設定のカスタマイズ**
   - 画面上部の「⚙️」ボタンから詳細設定を開く

---

## 📁 プロジェクト構成

```
pc-app/
├── 📂 public/              # フロントエンド（レンダラープロセス）
│   ├── index.html          # UI構造
│   ├── script.js           # メインロジック（Web Audio API、Canvas描画）
│   └── style.css           # スタイルシート
│
├── 📄 main.js              # Electronメインプロセス（ウィンドウ管理）
├── 📄 preload.js           # セキュアなpreloadスクリプト（IPC通信）
├── 📄 package.json         # プロジェクト設定・依存関係
├── 📄 README.md            # このファイル
│
├── 📂 scripts/             # ビルドスクリプト
│   └── build-portable-win.js
│
└── 📂 release/             # ビルド成果物（gitignore）
    └── Audio-Visualizer-Portable.zip
```

---

## 🛠️ 技術スタック

| 技術 | 用途 |
|-----|------|
| **Electron 28** | Chromiumベースのデスクトップアプリ環境 |
| **electron-packager** | Windows向けポータブルパッケージ生成 |
| **Web Audio API** | 音声処理・周波数分析・イコライザー |
| **Canvas 2D** | リアルタイムビジュアライザー描画 |
| **MediaRecorder API** | 動画書き出し機能 |
| **LocalStorage** | 設定・プレイリストの永続化 |

---

## 🔧 トラブルシューティング

### ❌ "This app can't run on your PC" エラー

**原因**: Windows Defenderやセキュリティソフトが署名なしEXEをブロックしています。

**対処法**:
1. ダウンロードしたZipファイルを右クリック → プロパティ
2. 「ブロックを解除」にチェックを入れてOK
3. 解凍し直してから実行

または、SmartScreen警告が出た場合は「詳細情報」→「実行」をクリック。

### 🔇 音声が出ない

**確認事項**:
- Windowsの音量設定を確認
- 別のアプリで音楽ファイルが正常に再生できるか確認
- 他のアプリがオーディオデバイスを占有していないか確認
- アプリ内の音量スライダーを確認

### 🎤 マイクが認識されない

**確認事項**:
- Windowsの「設定」→「プライバシー」→「マイク」でアプリの許可を確認
- 設定タブでマイクデバイスを選択
- 他のアプリがマイクを使用していないか確認

### 💾 設定が保存されない

**原因**: LocalStorageが正しく動作していない可能性があります。

**対処法**:
- アプリを完全に終了してから再起動
- `%APPDATA%\audio-visualizer-desktop\` フォルダを削除して初期化

### 🐛 アプリがクラッシュする

**対処法**:
1. アプリを完全に終了
2. `npm install` で依存関係を再インストール
3. `npm run dev` で開発モードで起動してコンソールのエラーを確認

---

## 🔒 セキュリティとプライバシー

- **完全ローカル処理**: 音楽ファイルとマイク入力はすべてローカルで処理され、外部に送信されることはありません
- **Google Drive統合**: 使用する場合は自身のAPIキーとClient IDを設定してください（オプション）
- **オープンソース**: コードはすべて公開されており、透明性が保証されています

**⚠️ 重要**: APIキーやkeystoreファイルを絶対にリポジトリにコミットしないでください。

---

## 🤝 開発について

**このプロジェクトは人間とAI（GitHub Copilot/Claude）の共同作業によって開発されました。**

### 貢献方法

バグ報告、機能リクエスト、プルリクエストを歓迎します！

### 開発メモ

- `main.js`でElectronウィンドウを作成し、`public/index.html`をロード
- メディア権限（マイク・カメラ）は自動許可
- `preload.js`でセキュアなIPC通信を実装
- ビルドには`electron-packager`を使用

---

## 📜 ライセンス

MIT License

---

## 📞 サポート

問題が発生した場合は、[Issues](../../issues)で報告してください。

---

<div align="center">

**🎵 音楽を美しく可視化しよう！ 🎨**

Made with ❤️ by Human & AI collaboration

</div>
