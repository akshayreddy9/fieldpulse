@echo off
title MSR Pulse - online test site
cd /d "%~dp0"
rem Puts MSR Pulse online for testing with friends, free, using Cloudflare Tunnel (no account needed).
rem The site is protected by a test-site password. Close this window to take it offline.

where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)

rem Safety: never expose a server that was started without the password
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  echo.
  echo  Another MSR Pulse server is already running on this PC.
  echo  Close its window ^(or restart the PC^), then run this again.
  echo.
  pause & exit /b 1
)

if not exist node_modules call npm install

set "TOOLS=%USERPROFILE%\MSRTools"
if not exist "%TOOLS%\cloudflared.exe" (
  echo Downloading Cloudflare Tunnel ^(free, official, one time only^)...
  if not exist "%TOOLS%" mkdir "%TOOLS%"
  curl.exe -sSL -o "%TOOLS%\cloudflared.exe" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  if errorlevel 1 (echo Download failed. Check the internet connection. & pause & exit /b 1)
)

rem A random test-site password, created once and kept in test-site-password.txt
if not exist test-site-password.txt node -e "require('fs').writeFileSync('test-site-password.txt','msr-'+require('crypto').randomBytes(4).toString('hex'))"
set /p STAGING_PASSWORD=<test-site-password.txt

echo Building the app...
call npm run build >nul

start "MSR Pulse server (test site)" cmd /k "set STAGING_PASSWORD=%STAGING_PASSWORD%&& node server\index.js"
timeout /t 5 >nul

cls
echo.
echo  ============================================================
echo    MSR Pulse test site
echo  ============================================================
echo.
echo    Test-site password:  %STAGING_PASSWORD%
echo.
echo    In a few seconds a line appears below with your public link:
echo        https://something.trycloudflare.com
echo.
echo    Share the link + password with your friends.
echo    Sign-in code inside the app: 482913 (demo mode)
echo.
echo    Keep BOTH windows open. Close them to take the site offline.
echo    The link changes every time you start this again.
echo  ============================================================
echo.
"%TOOLS%\cloudflared.exe" tunnel --no-autoupdate --url http://localhost:8787
