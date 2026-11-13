# Audio Visualizer

[日本語](README.md) | [English](README.en.md) | [简体中文](README.zh-CN.md) | [한국어](README.ko-KR.md)

Android 환경을 위한 로컬 미디어 재생 오디오 비주얼라이저입니다. F-Droid 배포를 전제로 외부 서비스에 의존하지 않는 구조로 최적화되었습니다.  
지원 버전: v1.1.4 (버전 코드 17)

## 주요 기능

- 기기 내 로컬 오디오 및 비디오 파일 재생
- 실시간 마이크 입력 시각화
- 9가지 비주얼라이저 모드
- 이퀄라이저 및 재생 설정 저장
- 비디오 내보내기 기능 (현재 미지원)

## 프로젝트 구조

- [android-app/](android-app/) - Android 앱 본체 소스 코드
- [fdroid/metadata/](fdroid/metadata/) - F-Droid 빌드 메타데이터 정의
- [branding/](branding/) - 아이콘 및 브랜드 리소스
- [LICENSE](LICENSE) - MIT 라이선스

## 개발 환경 및 설정

필요 환경:

- Node.js 22 이상 (Capacitor CLI 8.5.3)
- JDK 21 (Android 빌드용)

```bash
cd android-app
npm ci
npx cap sync
```

### 타사 라이선스의 지속적 검증

종속성에 라이선스 정보가 누락되었거나 Android 측에서 허용하지 않은 라이선스가 추가되지 않았는지 확인하려면 `android-app` 디렉터리에서 다음 명령을 실행합니다:

```bash
npm run licenses:check
```

- `licenses:npm`: 프로덕션 종속성(`dependencies`) 및 전이 종속성의 라이선스 목록을 출력합니다.
- `licenses:npm:json`: 기계 판독용 JSON 데이터를 출력합니다.
- `licenses:android`: Licensee를 통해 Android release 종속성을 검증하고 `android-app/android/app/build/reports/licensee/androidRelease/` 경로에 리포트를 생성합니다.  
  허용 목록에 없는 라이선스나 판정할 수 없는 라이선스가 있을 경우 Android 측 검증이 실패합니다.

자동 생성 리포트는 확인의 출발점이며, 사용자에게 제공되는 최종 라이선스 정보는 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) 및 [android-app/www/licenses/THIRD_PARTY_LICENSES.txt](android-app/www/licenses/THIRD_PARTY_LICENSES.txt) 파일을 수동으로 확인하고 업데이트해야 합니다.

## 빌드

```bash
cd android-app/android
.\gradlew.bat assembleRelease
```

macOS / Linux 환경에서는 `./gradlew assembleRelease` 명령을 사용합니다.

또는 `android-app` 디렉터리에서 `npm run build-release` (Windows) 또는 `npm run build-release:unix` (macOS / Linux) 명령을 실행할 수 있습니다.

`keystore.properties` 파일이 없을 경우 release APK는 서명되지 않은 `app-release-unsigned.apk`로 출력됩니다. 배포용 APK는 릴리스 서명 키로 서명해야 합니다.

서명된 배포용 APK를 생성하려면 `android-app/android/keystore.properties` 파일에 기존 릴리스 키 정보를 설정해 주십시오.

`keystore.properties`는 `android-app/android/app/build.gradle`에서 로드되며, `storeFile` 경로는 `android-app/android/app`을 기준으로 확인됩니다. 설정 예시:

```properties
storeFile=release.keystore
storePassword=your-store-password
keyAlias=your-key-alias
keyPassword=your-key-password
```

비밀 정보(비밀번호 및 키)를 저장소에 커밋하지 않도록 주의해 주십시오.

디버그 APK는 다음 명령어로 빌드할 수 있습니다:

```bash
cd android-app/android
.\gradlew.bat assembleDebug
```

macOS / Linux 환경에서는 `./gradlew assembleDebug` 명령을 사용합니다.

## 라이선스 및 안내

본 앱은 MIT 라이선스에 따라 배포되는 오픈 소스 소프트웨어입니다. 누구나 자유롭게 이용, 수정 및 재배포하실 수 있습니다.

앱 본체의 라이선스는 [LICENSE](LICENSE) 파일을 참조해 주십시오.  
APK 내부에도 앱 본체의 MIT 라이선스 전문을 [android-app/www/licenses/LICENSE.txt](android-app/www/licenses/LICENSE.txt) 경로에 동봉하고 있습니다.  
앱에 포함된 Capacitor, Capawesome File Picker, AndroidX, Cordova, Kotlin, 폰트 등의 타사 컴포넌트에 대해서는 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)를 참조해 주십시오.  
Android 앱 내부의 '개발자 정보' 탭에서도 동일한 라이선스 전문을 확인하실 수 있습니다.

앱 아이콘, 스플래시 화면, 런처 이미지 등의 그래픽 리소스는 개발자가 GitHub Copilot에 SVG 생성을 의뢰하여 제작한 결과물입니다. 확인된 범위 내에서 외부 리소스 출처나 특정 제3자의 저작권자는 존재하지 않습니다.

## 개발자로부터의 부탁 (선택 사항)

만약 본 앱을 창작물에 활용하시거나 마음에 드셨다면, X(구 Twitter)에 **#AudioVisualizerFDroid** 해시태그와 함께 포스트를 남겨주시거나 개발자 **@Rinoprogram**에게 알려주시면 향후 개발에 큰 힘과 응원이 됩니다!  
*(※ 이는 의무 사항이 아니므로, 별도의 공유 없이 자유롭게 사용하셔도 좋습니다!)*

## F-Droid 관련 안내

본 저장소는 Android 배포용 결과물에 초점을 맞추고 있습니다. 더 이상 필요하지 않은 Web 및 PC용 설명과 개발 설정은 정리 및 제거되었습니다.
