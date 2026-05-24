# F-Droid 提出メモ

このリポジトリは、F-Droid 向けに公開するための準備がほぼ整っています。ここでは、実際に提出するまでの手順を最小限でまとめます。

## いま確認できている状態

- release ビルドは成功済み
- リリース版数は `android-app/android/app/build.gradle` と `android-app/android/app/src/main/res/xml/config.xml` でそろっている
- F-Droid 用 metadata は `fdroid/metadata/io.github.rinoprogram.audiovisualizer.yml` にある
- アイコン元は `branding/audio-visualizer-icon.png` にある

## 手順

1. `fdroid/metadata/io.github.rinoprogram.audiovisualizer.yml` の `commit` が、公開したい release commit を指しているか確認する
2. 必要なら `versionCode` と `versionName` を `android-app/android/app/build.gradle` と `android-app/android/app/src/main/res/xml/config.xml` で一致させる
3. `android-app/android` で release ビルドを確認する

```powershell
Set-Location "c:\VSCode_program\Audio Visualizer\android-app\android"
.\gradlew.bat assembleRelease
```

4. F-Droid Data 側へ、このリポジトリの metadata を反映する PR を出す
5. F-Droid 側でビルド結果を確認し、差分が出たらその部分だけ修正する
6. アイコンやスクリーンショットが必要なら、F-Droid 側の fastlane 形式に合わせて追加する

## fastlane について

fastlane は、アプリ本体の必須要件ではありません。
F-Droid では主に、掲載画像や説明文などのメタデータを置くために使います。

このリポジトリ側で必要なのは、まずアプリ本体のビルドが通ることと、metadata YAML が正しいことです。

## つまずきやすい点

- `commit` が古いままになっている
- `versionCode` と `versionName` が、ビルド実体と YAML でズレている
- 署名付き APK を前提にしないようにする
- ネットワーク依存のコードが残っている場合は、F-Droid ビルドで止まる

## ひとこと

このリポジトリは、今の時点で「ローカル release ビルド成功」までは到達しています。次は F-Droid Data 側に提出して、そこで出た指摘を潰す段階です。