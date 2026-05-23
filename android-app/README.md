# Audio Visualizer - Android

このフォルダは Android アプリ本体です。ローカル再生と可視化に集中した構成で、外部サービスへの依存はありません。

## 機能

- 音声ファイル再生とリアルタイム可視化
- マイク入力でのリアルタイム表示
- イコライザー
- プレイリスト管理
- 設定の保存
- ビジュアライザーの録画・書き出し

## セットアップ

```bash
cd android-app
npm ci
npx cap sync
```

## ビルド

```bash
cd android-app/android
.\gradlew.bat assembleRelease
```

macOS / Linux では `./gradlew assembleRelease` を使います。

## 注意

- Release ビルドの配布時は署名設定を確認してください
- F-Droid 向けには生成物を含めず、ソースから再ビルドします
