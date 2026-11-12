# Audio Visualizer

Android 向けのローカル再生オーディオビジュアライザーです。F-Droid 配布を前提に、外部サービスに依存しない構成へ整理しています。
対応バージョン: v1.1.4（バージョンコード 17）

## 特徴

- ローカルの音声・動画ファイル再生
- マイク入力の可視化
- 9種類のビジュアライザーモード
- イコライザーと再生設定の保存
- 動画書き出し機能（現在未対応）

## 構成

- [android-app/](android-app/) - Android アプリ本体
- [fdroid/metadata/](fdroid/metadata/) - F-Droid 用ビルド定義
- [branding/](branding/) - アイコン素材
- [LICENSE](LICENSE) - MIT ライセンス

## セットアップ

必要な環境:

- Node.js 22 以上（Capacitor CLI 8.5.3）
- JDK 21（Androidビルド）

```bash
cd android-app
npm ci
npx cap sync
```

### 第三者ライセンスの継続確認

依存関係にライセンス情報がないものや、Android 側で許可していないライセンスが
追加されていないかを確認するには、`android-app` で次を実行します。

```bash
npm run licenses:check
```

`licenses:npm` は本番依存（`dependencies`）とその推移依存のライセンス一覧を表示し、
`licenses:npm:json` は機械処理用の JSON を表示します。
`licenses:android` は Android の release 依存関係を Licensee で検証し、
`android-app/android/app/build/reports/licensee/androidRelease/` にレポートを生成します。
許可リストにないライセンス、または判定できないライセンスがある場合は、
Android 側の検証が失敗します。

自動レポートは確認の起点であり、最終的な利用者向け表示は
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) と
[android-app/www/licenses/THIRD_PARTY_LICENSES.txt](android-app/www/licenses/THIRD_PARTY_LICENSES.txt)
を人手で確認・更新してください。

## ビルド

```bash
cd android-app/android
.\gradlew.bat assembleRelease
```

macOS / Linux では `./gradlew assembleRelease` を使います。

または、`android-app` ディレクトリで `npm run build-release`（Windows）、
`npm run build-release:unix`（macOS / Linux）を実行できます。

keystore.properties がない場合、release APK は未署名の `app-release-unsigned.apk` として出力されます。配布用 APK はリリース鍵で署名してください。

配布用 APK を作成する場合は、`android-app/android/keystore.properties` に既存のリリース鍵の情報を設定してください。

`keystore.properties` は `android-app/android/app/build.gradle` から読み込まれ、`storeFile` は `android-app/android/app` を基準に解決されます。設定例:

```properties
storeFile=release.keystore
storePassword=your-store-password
keyAlias=your-key-alias
keyPassword=your-key-password
```

秘密情報をリポジトリへコミットしないでください。

デバッグ APK は次のコマンドで作成できます。

```bash
cd android-app/android
.\gradlew.bat assembleDebug
```

macOS / Linux では `./gradlew assembleDebug` を使います。

## ライセンスとお願いについて

本アプリはMITライセンスのもとで公開されているオープンソースソフトウェアです。どなたでも自由に利用、改変、再配布していただけます。

アプリ本体のライセンスは [LICENSE](LICENSE) を参照してください。
APKにもアプリ本体のMITライセンスを
[android-app/www/licenses/LICENSE.txt](android-app/www/licenses/LICENSE.txt)
として同梱しています。
アプリに含まれる Capacitor、Capawesome File Picker、AndroidX、Cordova、
Kotlin、フォントなどの第三者コンポーネントについては、
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) を参照してください。
Android アプリ内の「開発者より」タブにも、同じライセンス本文を表示します。

アプリのアイコン、スプラッシュ画像、ランチャー画像などは、開発者が
GitHub Copilot に SVG として生成を依頼した artwork から作成したものです。
確認できた範囲では外部素材の出所や特定第三者の著作権者はありません。

## 製作者からのお願い（任意）

もしこのアプリを何かの作品に使ったり、気に入っていただけたりしたら、そのことをX（旧Twitter）でハッシュタグ #AudioVisualizerFDroid をつけてポストしていただくか、製作者の @Rinoprogram までお知らせいただけると、開発の大きな励みになり、とても嬉しいです！
（※これは義務ではありませんので、もちろん報告なしで自由に使っていただいても構いません！）

## F-Droid 向けメモ

このリポジトリは Android 配布物に範囲を絞っています。不要になった Web / PC 向けの説明や開発用設定は削除済みです。
