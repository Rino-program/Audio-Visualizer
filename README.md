# Audio Visualizer

Android 向けのローカル再生オーディオビジュアライザーです。F-Droid 配布を前提に、外部サービスに依存しない構成へ整理しています。

## 特徴

- ローカルの音声・動画ファイル再生
- マイク入力の可視化
- 9種類のビジュアライザーモード
- イコライザーと再生設定の保存
- 動画書き出し機能

## 構成

- [android-app/](android-app/) - Android アプリ本体
- [fdroid/metadata/](fdroid/metadata/) - F-Droid 用ビルド定義
- [branding/](branding/) - アイコン素材
- [LICENSE](LICENSE) - MIT ライセンス

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

ローカルで作成した release APK は [android-app/android/app/build/outputs/apk/release/app-release.apk](android-app/android/app/build/outputs/apk/release/app-release.apk) に出力されます。

## ライセンスとお願いについて
本アプリはMITライセンスのもとで公開されているオープンソースソフトウェアです。どなたでも自由に利用、改変、再配布していただけます。

## 製作者からのお願い（任意）
もしこのアプリを何かの作品に使ったり、気に入っていただけたりしたら、そのことをX（旧Twitter）でハッシュタグ #AudioVisualizerFDroid をつけてポストしていただくか、製作者の @Rinoprogram までお知らせいただけると、開発の大きな励みになり、とても嬉しいです！
（※これは義務ではありませんので、もちろん報告なしで自由に使っていただいても構いません！）

## F-Droid 向けメモ

このリポジトリは Android 配布物に範囲を絞っています。不要になった Web / PC 向けの説明や開発用設定は削除済みです。
