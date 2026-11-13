# Audio Visualizer

[日本語](README.md) | [English](README.en.md) | [简体中文](README.zh-CN.md)

专为 Android 本地媒体播放设计的音频可视化器。针对 F-Droid 分发优化，不依赖任何外部服务。
支持版本: v1.1.4（版本代码 17）

## 特性

- 本地音频与视频文件播放
- 麦克风输入实时可视化
- 9 种可视化模式
- 均衡器与播放设置持久化
- 视频导出功能（当前暂未支持）

## 项目结构

- [android-app/](android-app/) - Android 应用本体源码
- [fdroid/metadata/](fdroid/metadata/) - F-Droid 构建定义
- [branding/](branding/) - 图标及品牌素材
- [LICENSE](LICENSE) - MIT 许可证

## 安装与配置

所需环境:

- Node.js 22 及以上版本（Capacitor CLI 8.5.3）
- JDK 21（用于 Android 构建）

```bash
cd android-app
npm ci
npx cap sync
```

### 第三方许可证的持续验证

若要检查依赖项中是否存在缺失许可证信息的内容，或确认 Android 端未引入未经许可的许可证，请在 `android-app` 目录下运行：

```bash
npm run licenses:check
```

- `licenses:npm` 显示生产环境依赖（`dependencies`）及其传递依赖的许可证列表。
- `licenses:npm:json` 输出便于机器处理的 JSON。
- `licenses:android` 使用 Licensee 验证 Android release 依赖项，并在 `android-app/android/app/build/reports/licensee/androidRelease/` 生成报告。
  如果存在不在允许列表中的许可证或无法识别的许可证，Android 端的验证将失败。

自动报告仅作为检查的起点，面向最终用户的许可证信息请人工确认并更新 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) 与 [android-app/www/licenses/THIRD_PARTY_LICENSES.txt](android-app/www/licenses/THIRD_PARTY_LICENSES.txt)。

## 构建

```bash
cd android-app/android
.\gradlew.bat assembleRelease
```

在 macOS / Linux 上，请使用 `./gradlew assembleRelease`。

或者，也可以在 `android-app` 目录下执行 `npm run build-release`（Windows）或 `npm run build-release:unix`（macOS / Linux）。

如果没有 `keystore.properties` 文件，Release APK 将输出为未签名的 `app-release-unsigned.apk`。分发用 APK 请使用发布密钥进行签名。

若要生成已签名的分发 APK，请在 `android-app/android/keystore.properties` 中配置现有的发布密钥信息。

`keystore.properties` 会由 `android-app/android/app/build.gradle` 读取，其中 `storeFile` 的基准路径为 `android-app/android/app`。配置示例：

```properties
storeFile=release.keystore
storePassword=your-store-password
keyAlias=your-key-alias
keyPassword=your-key-password
```

请切勿将机密信息提交到代码仓库中。

可以使用以下命令构建 Debug APK：

```bash
cd android-app/android
.\gradlew.bat assembleDebug
```

在 macOS / Linux 上，请使用 `./gradlew assembleDebug`。

## 许可证与说明

本应用是在 MIT 许可证下发布的开源软件。任何人都可以自由使用、修改和重新分发。

应用本体的代码许可证请参阅 [LICENSE](LICENSE)。
APK 中也附带了应用本体的 MIT 许可证正文：[android-app/www/licenses/LICENSE.txt](android-app/www/licenses/LICENSE.txt)。
应用中包含的 Capacitor、Capawesome File Picker、AndroidX、Cordova、Kotlin 及字体等第三方组件，请参阅 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。
在 Android 应用内的“开发者信息”标签页中也会展示相同的许可证正文。

应用的图标、启动图（Splash）及启动图标等图像素材均基于开发者委托 GitHub Copilot 生成的 SVG 素材制作。在已知范围内不存在外部素材来源或特定第三方的版权所有者。

## 开发者寄语（可选）

如果您在某项创作中使用了此应用，或者喜欢这款应用，欢迎在 X（原 Twitter）上带上话题标签 **#AudioVisualizerFDroid** 发布推文，或向作者 **@Rinoprogram** 反馈，这会是对后续开发的巨大鼓舞，非常感谢！
*（注：这并非强制要求，您完全可以在不告知的情况下自由使用！）*

## F-Droid 相关说明

本仓库已将范围严格限定于 Android 分发包。之前不再需要的 Web / PC 端说明及开发配置均已清理完毕。
