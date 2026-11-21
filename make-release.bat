@echo off
title MSR Pulse - make release
cd /d "%~dp0"
rem Creates msr-pulse-release.zip: upload it to the S3 "release" folder and the AWS server installs it within 5 minutes.

where node >nul 2>nul || (echo Node.js is not installed. & pause & exit /b 1)
echo Running the automated tests first...
call npm test >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Tests FAILED - release not created. Run "npm test" to see what broke.
  pause & exit /b 1
)
if exist msr-pulse-release.zip del msr-pulse-release.zip
rem Windows' own tar (bsdtar) creates a real ZIP; other "tar" programs on PATH may not
set "FILES=package.json package-lock.json Dockerfile .dockerignore index.html vite.config.js server src public deploy"
rem Include the Android app so phones can download it from the login page
if exist MSR-Pulse.apk set "FILES=%FILES% MSR-Pulse.apk"
if exist MSR-Pulse.apk.json set "FILES=%FILES% MSR-Pulse.apk.json"
"%SystemRoot%\System32\tar.exe" -a -c -f msr-pulse-release.zip %FILES%
if errorlevel 1 (echo Could not create the zip. & pause & exit /b 1)
echo.
echo  Done: msr-pulse-release.zip  (all tests passed)
echo  Upload it in the AWS console: S3 ^> your msr-pulse bucket ^> folder "release" ^> Upload
echo  (keep the file name msr-pulse-release.zip). The server installs it within 5 minutes.
echo.
pause
