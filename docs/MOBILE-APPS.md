# Android and iPhone apps

MSR Pulse runs on **Android and iPhone** in three ways.

| Way | Android | iPhone | Offline start (no signal when opened) | Needs |
|---|---|---|---|---|
| 1. Browser | Chrome | Safari | No | Nothing |
| 2. Home-screen app (PWA) | Chrome → ⋮ → **Install app** | Safari → Share → **Add to Home Screen** | Yes, when the server is on **HTTPS** | Server on HTTPS (AWS setup) |
| 3. Store app (Capacitor) | `MSR-Pulse.apk` / Google Play | App Store | Yes, always (app files are inside the app) | Android Studio / Mac + Xcode |

In every case, interviews saved with no signal stay on the phone, survive closing the app, and sync by themselves when the signal returns. This was tested on Android: submit offline, close the app, reopen offline, then sync.

## Android app (APK)

The Android project is ready in `android/`. It has the MSR Pulse icon and splash screen, and permissions for microphone (consent recording), GPS and camera. Android cloud backup is off, so respondent data stays on the phone.

1. Install the build tools once (see *Build tools without Android Studio* below).
2. Double-click **`build-android-apk.bat`**. It creates `MSR-Pulse.apk` in this folder.
3. Send the APK to surveyors' phones (WhatsApp, USB, Drive). Open it, allow "Install unknown apps", and install.
4. On first launch, tap **Connect to an MSR Pulse server** and enter the server address (e.g. `http://192.168.1.3:8787` on office Wi-Fi, or `https://pulse.<msr-domain>` in production). The phone remembers it.

**Phones can download it directly:** while the server runs, Android phones that open the server address see a **Download the Android app** button on the login screen (the file is served at `/download/MSR-Pulse.apk`).

### Build tools without Android Studio

Run once in PowerShell, from the project folder:
```powershell
powershell -ExecutionPolicy Bypass -File tools\setup-android-tools.ps1
```
It installs Java 21 (Eclipse Temurin), the Android SDK 35 command-line tools, and Gradle 8.11.1 into `%USERPROFILE%\AndroidBuild` and `%USERPROFILE%\.gradle`. That is about 2 GB, needs no admin rights, and changes nothing system-wide. Running it accepts Google's Android SDK licence. To remove everything, delete those two folders.

**For Google Play:** in Android Studio use *Build → Generate Signed App Bundle* with an upload key that MSR keeps safe. Upload it in the Play Console of MSR's Google Play developer account. Before publishing, set `"allowMixedContent": false` in `capacitor.config.json` once the server is on HTTPS.

## iPhone app

Needs a Mac with Xcode, plus an Apple Developer account in MSR's name.
```bash
npm install
npm install -D @capacitor/cli@7 && npm install @capacitor/ios@7
npx cap add ios
npm run app:build
npm run app:ios        # Xcode → Product → Archive → upload to App Store Connect
```
Add `NSMicrophoneUsageDescription`, `NSLocationWhenInUseUsageDescription` and `NSCameraUsageDescription` to `ios/App/App/Info.plist`.

## After changing the app

Run `build-android-apk.bat` again (Android), or `npm run app:build` and then archive in Xcode (iPhone). The server already accepts requests from the app (`CORS_ORIGINS`).
