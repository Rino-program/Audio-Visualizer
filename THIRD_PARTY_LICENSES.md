# Third-party licenses

This file lists third-party components included in Audio Visualizer Pro v1.1.3.
The complete license texts are distributed with the Android web assets at
[`android-app/www/licenses/THIRD_PARTY_LICENSES.txt`](android-app/www/licenses/THIRD_PARTY_LICENSES.txt)
and are shown in the app's Developer tab.

The root [`LICENSE`](LICENSE) file applies only to the original Audio Visualizer
Pro code and does not replace these third-party licenses.

## Runtime JavaScript components

| Component | Version | License | Copyright / attribution |
| --- | --- | --- | --- |
| `@capacitor/android` | 8.5.3 | MIT | Drifty Co. |
| `@capacitor/core` | 8.5.3 | MIT | Drifty Co. |
| `@capawesome/capacitor-file-picker` | 8.1.1 | MIT | Robin Genz |
| `tslib` | 2.8.1 | 0BSD | Microsoft Corporation |

`@capacitor/cli` and its dependencies are development-only dependencies and
are not included in the Android runtime APK.

## Runtime Android components

The release runtime dependency graph includes Capacitor Android, Apache Cordova
Framework 14.0.1, AndroidX libraries, Kotlin standard library 1.8.22, and
Kotlin Coroutines 1.8.1. It also includes Guava ListenableFuture 1.0,
JetBrains Annotations 23.0.0, and JSpecify 1.0.0. The inspected artifacts are
distributed under the Apache License 2.0. The complete Apache License text is
included in the bundled license document.

The inspected POM attributions include The Android Open Source Project,
Kotlin Team, JetBrains Team, Kevin Bourrillion/JSpecify, and the Apache
Cordova project. `listenablefuture` is a Guava artifact; its local POM does
not declare a license, so the upstream Guava Apache-2.0 license is retained
without inventing a separate copyright holder.

No separate upstream NOTICE file was found in the inspected package
distributions. Component-specific notices remain the responsibility of the
corresponding upstream artifact when its distribution supplies one.

## Fonts

| Font | Version from embedded metadata | License | Copyright / attribution |
| --- | --- | --- | --- |
| Inter Variable | 4.001; git-66647c0bb | SIL Open Font License 1.1 | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) |
| Roboto Mono Variable | 3.001 | SIL Open Font License 1.1 | Copyright 2015 The Roboto Mono Project Authors (https://github.com/googlefonts/robotomono) |

The font files were inspected directly. No modification was made to either
font. Reserved Font Names are not specified in the copied upstream license
headers.

## Images and other media

The repository contains application icons, splash images, launcher image
variants, and the `audio-visualizer-icon-btn240.png` asset. The developer has
confirmed that these assets were generated from SVG artwork requested from
GitHub Copilot. No external source or third-party copyright holder has been
identified, so no third-party attribution is asserted for them.

This provenance statement does not apply a license to the original application
code and does not identify GitHub Copilot as a copyright holder.
