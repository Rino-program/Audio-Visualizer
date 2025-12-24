# Build & Release Instructions - Audio Visualizer Android App

This document provides step-by-step instructions for building, signing, and releasing the Android APK.

---

## Prerequisites

### Software Requirements
- **Node.js**: v16+ (recommended: v18 or v20)
- **npm**: v8+ (comes with Node.js)
- **Java Development Kit (JDK)**: v17 (for Android build)
- **Android SDK**: Android 13 (API 33) or higher
- **Gradle**: 8.0+ (wrapper included, no manual install needed)

### Verify Installations
```bash
node --version      # Should show v16+
npm --version       # Should show v8+
java --version      # Should show 17.x
```

### Android SDK Setup
1. Install [Android Studio](https://developer.android.com/studio)
2. Open Android Studio → SDK Manager
3. Install Android SDK 33+
4. Set `ANDROID_HOME` environment variable:
   ```bash
   # Linux/macOS
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
   
   # Windows (PowerShell)
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   $env:PATH += ";$env:ANDROID_HOME\tools;$env:ANDROID_HOME\platform-tools"
   ```

---

## Initial Setup

### 1. Clone Repository
```bash
git clone https://github.com/Rino-program/Audio-Visualizer.git
cd Audio-Visualizer/android-app
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Sync Capacitor
```bash
npx cap sync
```

This command:
- Copies web assets (`www/`) to Android project
- Updates native dependencies
- Configures Capacitor plugins

---

## Debug Build (Development)

Debug builds are unsigned and used for testing on devices/emulators.

### Build Debug APK
```bash
cd android
./gradlew assembleDebug
```

On Windows:
```bash
cd android
gradlew.bat assembleDebug
```

### Output Location
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Install on Device
```bash
# Via USB (enable USB debugging on device)
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or drag-and-drop APK to emulator
```

### Test on Emulator
```bash
# List available emulators
emulator -list-avds

# Start emulator (replace 'Pixel_5_API_33' with your AVD name)
emulator -avd Pixel_5_API_33

# Install APK
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Release Build (Production)

Release builds are signed and optimized for distribution.

### 1. Generate Signing Key (First Time Only)

If you don't have a keystore yet:

```bash
keytool -genkey -v -keystore my-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-key-alias
```

Follow prompts:
- Enter keystore password (remember this!)
- Enter key password (can be same as keystore password)
- Enter details (name, organization, etc.)

**IMPORTANT:**
- Store `my-release-key.jks` in a secure location
- **Never commit this file to git**
- Backup the file and passwords securely
- You cannot republish your app without this key

### 2. Create keystore.properties

Create `android/keystore.properties` with your signing info:

```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=my-key-alias
storeFile=/path/to/my-release-key.jks
```

**On Windows**, use forward slashes or double backslashes:
```properties
storeFile=C:/Users/YourName/my-release-key.jks
# or
storeFile=C:\\Users\\YourName\\my-release-key.jks
```

**IMPORTANT:**
- `keystore.properties` is listed in `.gitignore`
- Never commit this file
- Keep passwords secure

### 3. Verify android/app/build.gradle

Ensure signing config is present in `android/app/build.gradle`:

```gradle
android {
    // ... other config ...
    
    signingConfigs {
        release {
            def keystorePropertiesFile = rootProject.file("keystore.properties")
            def keystoreProperties = new Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
                
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 4. Build Release APK
```bash
cd android
./gradlew assembleRelease
```

On Windows:
```bash
cd android
gradlew.bat assembleRelease
```

### 5. Output Location
```
android/app/build/outputs/apk/release/app-release.apk
```

### 6. Verify Signature
```bash
jarsigner -verify -verbose -certs android/app/build/outputs/apk/release/app-release.apk
```

Should show:
```
jar verified.
```

### 7. Check APK Info
```bash
aapt dump badging android/app/build/outputs/apk/release/app-release.apk | grep package
```

Shows package name, version code, version name.

---

## Build Variants

### Bundle (AAB) for Google Play Store

Google Play prefers Android App Bundles (`.aab`) over APKs:

```bash
cd android
./gradlew bundleRelease
```

Output:
```
android/app/build/outputs/bundle/release/app-release.aab
```

Upload this `.aab` file to Google Play Console.

### Build All Variants
```bash
./gradlew assembleDebug assembleRelease bundleRelease
```

---

## Troubleshooting

### Error: "ANDROID_HOME not set"
Solution:
```bash
export ANDROID_HOME=$HOME/Android/Sdk  # Linux/macOS
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"  # Windows PowerShell
```

### Error: "SDK location not found"
Create `android/local.properties`:
```properties
sdk.dir=/path/to/Android/Sdk
```

### Error: "Keystore file not found"
- Verify path in `keystore.properties`
- Use absolute path
- Use forward slashes on Windows

### Error: "jarsigner: command not found"
Add JDK bin to PATH:
```bash
export PATH=$PATH:$JAVA_HOME/bin
```

### Error: "Unsupported class file major version 65"
- Using wrong Java version
- Ensure Java 17 is active:
  ```bash
  java --version
  update-alternatives --config java  # Linux
  ```

### Error: "Execution failed for task :app:mergeReleaseResources"
- Clean build:
  ```bash
  ./gradlew clean
  ./gradlew assembleRelease
  ```

### Gradle Build Too Slow
- Enable Gradle daemon (should be on by default)
- Increase heap size in `gradle.properties`:
  ```properties
  org.gradle.jvmargs=-Xmx4096m
  ```

---

## Version Management

### Update Version

Edit `android-app/capacitor.config.json`:
```json
{
  "appId": "com.example.audiovisualizer",
  "appName": "Audio Visualizer",
  "version": "1.0.1",  // Update this
  "android": {
    "versionCode": 2   // Increment for each release
  }
}
```

Then re-sync:
```bash
npx cap sync
```

### Version Code vs Version Name
- **Version Code** (integer): Used by Play Store for ordering (must increment)
- **Version Name** (string): Displayed to users (e.g., "1.0.1")

---

## Optimization

### Enable Minification (Release)

Edit `android/app/build.gradle`:
```gradle
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true  // Enable ProGuard
        shrinkResources true  // Remove unused resources
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

**Note:** Test thoroughly after enabling minification—it can break reflection-based code.

### Reduce APK Size
- Use WebP images instead of PNG/JPG
- Remove unused code/assets
- Enable minification and resource shrinking
- Use vector drawables instead of rasterized icons

---

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/android-build.yml`:

```yaml
name: Android Build

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    
    - name: Install dependencies
      working-directory: android-app
      run: npm install
    
    - name: Sync Capacitor
      working-directory: android-app
      run: npx cap sync
    
    - name: Build Debug APK
      working-directory: android-app/android
      run: ./gradlew assembleDebug
    
    - name: Upload APK
      uses: actions/upload-artifact@v4
      with:
        name: app-debug
        path: android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

For release builds, store keystore and passwords as GitHub Secrets.

---

## Distribution

### Internal Testing
1. Build APK
2. Share APK directly with testers
3. Testers install via "Unknown Sources"

### Google Play Store
1. Build `.aab` (bundle)
2. Sign in to [Google Play Console](https://play.google.com/console)
3. Create app or select existing
4. Upload `.aab` to Internal Testing track
5. Test with internal testers
6. Promote to Beta → Production when ready

### Side-Loading
1. Host APK on web server
2. Share download link
3. Users enable "Install from Unknown Sources"
4. Users download and install

---

## Security Best Practices

### Secrets Management
- **Never commit**:
  - `keystore.properties`
  - `*.jks` / `*.keystore` files
  - `google-services.json` (Firebase)
  - `.env` files with API keys
- Use `.gitignore` (already configured in this repo)
- Store secrets in password manager
- For CI/CD, use encrypted secrets (GitHub Secrets, GitLab CI Variables)

### Keystore Backup
- Backup `my-release-key.jks` to secure cloud storage
- Store passwords in password manager (e.g., 1Password, Bitwarden)
- Without keystore, you **cannot** update app on Play Store

### Code Obfuscation
- Enable ProGuard/R8 for release builds
- Adds layer of protection against reverse engineering

---

## Useful Commands

### Clean Build
```bash
cd android
./gradlew clean
```

### List Tasks
```bash
./gradlew tasks
```

### Check Dependencies
```bash
./gradlew app:dependencies
```

### Lint Code
```bash
./gradlew lint
```

### Generate Release Notes
Use git log to create release notes:
```bash
git log --oneline v1.0.0..HEAD > RELEASE_NOTES.md
```

---

## Support

### Official Documentation
- [Capacitor Docs](https://capacitorjs.com/docs)
- [Android Developer Guide](https://developer.android.com/guide)
- [Gradle User Guide](https://docs.gradle.org/current/userguide/userguide.html)

### Common Issues
- Check [Capacitor GitHub Issues](https://github.com/ionic-team/capacitor/issues)
- Search [Stack Overflow: capacitor-android](https://stackoverflow.com/questions/tagged/capacitor-android)

### Contact
- Repository Issues: [GitHub Issues](https://github.com/Rino-program/Audio-Visualizer/issues)
- Project Maintainer: See repository README

---

## Quick Reference Card

```bash
# Initial setup
npm install
npx cap sync

# Debug build
cd android && ./gradlew assembleDebug

# Release build
cd android && ./gradlew assembleRelease

# Install on device
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Clean build
cd android && ./gradlew clean

# Update version
# Edit capacitor.config.json, then:
npx cap sync
```

---

**Last Updated:** 2025-12-24  
**Version:** 1.0.0
