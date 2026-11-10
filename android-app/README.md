# Audio Visualizer - Android

このフォルダは Android アプリ本体です。ローカル再生と可視化に集中した構成で、外部サービスへの依存はありません。

## 機能

- 音声ファイル再生とリアルタイム可視化
- マイク入力でのリアルタイム表示
- イコライザー
- プレイリスト管理
- 設定の保存
- ビジュアライザーの録画・書き出し（現在未対応）

## セットアップ

```bash
cd android-app
npm ci
npx cap sync
```

## ビルド

```bash
cd android
.\gradlew.bat assembleRelease
```

macOS / Linux では `./gradlew assembleRelease` を使います。

または、`android-app` ディレクトリで `npm run build-release`（Windows）、
`npm run build-release:unix`（macOS / Linux）を実行できます。

## 注意

- Release ビルドの配布時は署名設定を確認してください
- 配布用 APK は、既存のリリース鍵を `android/keystore.properties` に設定してからビルドしてください。未設定の場合は debug 鍵で署名され、既存の配布 APK を更新できません
- F-Droid 向けには生成物を含めず、ソースから再ビルドします

## 権限・プライバシー（F-Droid向け）

このアプリはローカル再生・ローカル可視化に特化しており、外部サービス連携やトラッキングは行いません。

- ネットワーク: `INTERNET` 権限は使用しません（アプリ内の機能はオフラインで完結します）
- マイク: `RECORD_AUDIO`（Micモードでマイク入力を可視化するため）
- 端末内メディアの読み取り: `READ_MEDIA_AUDIO` / `READ_MEDIA_VIDEO`
  - Android 12以下向けに `READ_EXTERNAL_STORAGE (maxSdkVersion=32)` も宣言しています
- バックグラウンド再生: `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- 通知の再生コントロール: 再生中に通知から操作できるように、上記のバックグラウンド再生関連権限を利用します

## ライセンスとお願いについて

本アプリはMITライセンスのもとで公開されているオープンソースソフトウェアです。どなたでも自由に利用、改変、再配布していただけます。

## 製作者からのお願い（任意）

もしこのアプリを何かの作品に使ったり、気に入っていただけたりしたら、そのことをX（旧Twitter）でハッシュタグ #AudioVisualizerFDroid をつけてポストしていただくか、製作者の @Rinoprogram までお知らせいただけると、開発の大きな励みになり、とても嬉しいです！
（※これは義務ではありませんので、もちろん報告なしで自由に使っていただいても構いません！）
