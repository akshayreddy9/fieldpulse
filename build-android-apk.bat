@echo off
title Build MSR Pulse Android app
cd /d "%~dp0"
rem Uses Java 21 + Android SDK installed in %USERPROFILE%\AndroidBuild (no Android Studio needed).
rem Falls back to Android Studio's copies if that folder is missing.

if not defined JAVA_HOME if exist "%USERPROFILE%\AndroidBuild\jdk\bin\java.exe" set "JAVA_HOME=%USERPROFILE%\AndroidBuild\jdk"
if not defined JAVA_HOME if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
if not defined JAVA_HOME (
  echo Java was not found. See docs\MOBILE-APPS.md, "Build tools without Android Studio".
  pause & exit /b 1
)
if not defined ANDROID_HOME if exist "%USERPROFILE%\AndroidBuild\sdk" set "ANDROID_HOME=%USERPROFILE%\AndroidBuild\sdk"
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%" (
  echo Android SDK not found. See docs\MOBILE-APPS.md, "Build tools without Android Studio".
  pause & exit /b 1
)
> android\local.properties echo sdk.dir=%ANDROID_HOME:\=\\%
if not exist node_modules call npm install

echo Building the app...
call npx vite build || (pause & exit /b 1)
call npx cap sync android || (pause & exit /b 1)
call node tools/android-icons.mjs
call node tools/fix-onedrive-assets.mjs
cd android
call gradlew.bat assembleDebug || (cd .. & pause & exit /b 1)
cd ..
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "MSR-Pulse.apk" >nul
echo.
echo  Done: MSR-Pulse.apk
echo  Copy it to an Android phone (WhatsApp, USB or Google Drive), open it and allow "Install unknown apps".
echo  On first launch tap "Connect to an MSR Pulse server" and enter the server address.
echo  For Google Play, use Android Studio: Build ^> Generate Signed App Bundle.
echo.
pause
