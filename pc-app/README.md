# Audio Visualizer Pro - PC版（Electron）

## 概要

Web版のAudio Visualizer ProをElectronでラップしたWindows向けデスクトップアプリです。インストール不要のポータブル形式で配布できます。

## 機能

- 🎵 MP3・WAV・AAC・OGG等の音声ファイル再生
- 🎤 マイク入力でのリアルタイムビジュアライザー
- 🎨 9種類のビジュアライザーモード（Bars, Wave, Digital, Circle, Spectrum, Galaxy, Monitor, Hexagon, Mirror）
- 🔧 10段階のイコライザー（EQ）
- 📂 プレイリスト管理
- 💾 ビジュアライザーを動画として記録・書き出し
- ☁️ Google Driveから曲をインポート
- ⚙️ 細かな設定（スムージング、感度、品質、色彩）
- 💤 スリープタイマー
- 🌐 Web版と同一機能

## セットアップ

### 開発環境での実行

```bash
npm install
npm run dev
```

Electronウィンドウが起動します。

### ビルド（配布用）

```bash
npm run build
```

生成ファイル: `release/Audio-Visualizer-Portable.zip`

## 配布・インストール

### ユーザーの視点

1. GitHub Releasesから `Audio-Visualizer-Portable.zip` をダウンロード
2. 任意のフォルダに解凍
3. `Audio-Visualizer-Portable/audio-visualizer-desktop.exe` を実行

## プロジェクト構成

```
pc-app/
├── public/
│   ├── index.html         # UI構造
│   ├── script.js          # 動作ロジック（元のWebアプリと同一）
│   └── style.css          # スタイル
├── main.js                # Electron main プロセス
├── preload.js             # セキュアなpreload
├── package.json           # 設定・依存関係
├── README.md              # このファイル
└── release/
    └── Audio-Visualizer-Portable.zip
```

## 技術スタック

- **Electron 28**: Chromium ベースのデスクトップアプリ環境
- **electron-builder**: Windows向けバイナリ生成
- **Web Audio API**: 音声処理・周波数分析
- **Canvas 2D**: リアルタイムビジュアライザー描画

## トラブルシューティング

### "This app can't run on your PC"
- Windows Defender や他のセキュリティソフトが署名なしEXEをブロック
- 一時的に無効化するか、ウイルススキャン後に「実行」を選択

### 音声が出ない
- Windows オーディオ設定を確認
- 別のアプリで同時再生していないか確認

### 設定が保存されない
- Electron内でLocalStorageが有効になっているか確認

## 開発メモ

- `main.js` で `public/index.html` をロード
- メディア権限は自動許可（ブラウザプロンプト不要）
- `npm run build` で `release/Audio-Visualizer-Portable.zip` を生成
- electron-builder 25.1.8 を使用

## ライセンス

MIT

## 注意点
- マイクはOSの許可が必要です。Electron側はメディア権限要求を許可しています。
- Google Drive連携はElectron環境ではOAuthの挙動に制限が出る場合があります。APIキー/Client IDを設定してからお試しください。
