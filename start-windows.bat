@echo off
title MSR Pulse server
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules (
  echo Installing MSR Pulse for the first time. This takes a minute...
  call npm install
)
echo Building the app...
call npm run build >nul
start "" cmd /c "timeout /t 4 >nul & start http://localhost:8787"
call npm run server
pause
