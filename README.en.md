# Audio Visualizer

[日本語](README.md) | [English](README.en.md) | [简体中文](README.zh-CN.md)

An audio visualizer for local media playback on Android. Tailored for F-Droid distribution with no external service dependencies.
Supported version: v1.1.4 (version code 17)

## Features

- Local audio and video file playback
- Real-time microphone input visualization
- 9 visualizer modes
- Equalizer and playback settings persistence
- Video export feature (currently not supported)

## Project Structure

- [android-app/](android-app/) - Android application source
- [fdroid/metadata/](fdroid/metadata/) - F-Droid build metadata
- [branding/](branding/) - Icon and branding assets
- [LICENSE](LICENSE) - MIT License

## Setup

Required environment:

- Node.js 22 or higher (Capacitor CLI 8.5.3)
- JDK 21 (for Android builds)

```bash
cd android-app
npm ci
npx cap sync
```

### Continuous Verification of Third-Party Licenses

To check for dependencies missing license metadata or verify that no disallowed licenses were introduced on the Android side, run the following in `android-app`:

```bash
npm run licenses:check
```

- `licenses:npm` lists licenses for production dependencies (`dependencies`) and their transitive dependencies.
- `licenses:npm:json` outputs machine-readable JSON.
- `licenses:android` verifies Android release dependencies with Licensee and generates a report in `android-app/android/app/build/reports/licensee/androidRelease/`.
  If there are licenses not on the allowlist or licenses that cannot be identified, the Android verification will fail.

Automated reports serve as a starting point. For final user-facing notices, please manually verify and update [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) and [android-app/www/licenses/THIRD_PARTY_LICENSES.txt](android-app/www/licenses/THIRD_PARTY_LICENSES.txt).

## Building

```bash
cd android-app/android
.\gradlew.bat assembleRelease
```

On macOS / Linux, use `./gradlew assembleRelease`.

Alternatively, in the `android-app` directory, you can run `npm run build-release` (Windows) or `npm run build-release:unix` (macOS / Linux).

If `keystore.properties` is not present, the release APK will be output as an unsigned `app-release-unsigned.apk`. Please sign release APKs with your release key.

To generate a signed distribution APK, configure your existing release key in `android-app/android/keystore.properties`.

`keystore.properties` is read by `android-app/android/app/build.gradle`, and `storeFile` is resolved relative to `android-app/android/app`. Example:

```properties
storeFile=release.keystore
storePassword=your-store-password
keyAlias=your-key-alias
keyPassword=your-key-password
```

Do not commit secret credentials to the repository.

Debug APKs can be built with:

```bash
cd android-app/android
.\gradlew.bat assembleDebug
```

On macOS / Linux, use `./gradlew assembleDebug`.

## License and Notice

This application is open-source software released under the MIT License. Anyone is free to use, modify, and redistribute it.

For the application code license, see [LICENSE](LICENSE).
The MIT License text is also bundled into the APK at [android-app/www/licenses/LICENSE.txt](android-app/www/licenses/LICENSE.txt).
For third-party components included in the application (such as Capacitor, Capawesome File Picker, AndroidX, Cordova, Kotlin, and fonts), please refer to [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
The same license texts are also viewable in the app under the "Developer" tab.

The app's icons, splash screens, and launcher graphics were created from artwork generated via GitHub Copilot as SVG. To the best of our knowledge, there is no external source material or third-party copyright holder.

## Request from the Creator (Optional)

If you use this app in your projects or enjoy using it, sharing it on X (formerly Twitter) with the hashtag **#AudioVisualizerFDroid** or letting the author know at **@Rinoprogram** would be greatly appreciated and serve as wonderful encouragement for ongoing development!
*(This is entirely optional—feel free to use the app freely without any notification!)*

## Notes for F-Droid

This repository is scoped specifically to Android distribution deliverables. Obsolete Web and desktop instructions and development configurations have been removed.
