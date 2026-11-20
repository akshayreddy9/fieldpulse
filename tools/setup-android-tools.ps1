# Installs everything needed to build the MSR Pulse Android app, WITHOUT Android Studio.
# Installs into %USERPROFILE%\AndroidBuild (no admin rights, nothing system-wide; delete the folder to remove).
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File tools\setup-android-tools.ps1
$ErrorActionPreference = 'Stop'
$D = Join-Path $env:USERPROFILE 'AndroidBuild'
New-Item -ItemType Directory -Force "$D\dl" | Out-Null

function Get-File($url, $out) {
  if (Test-Path $out) { return }
  Write-Host "Downloading $url"
  & curl.exe -sSL -o $out $url
  if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
}

# 1. Java 21 (Eclipse Temurin)
if (-not (Test-Path "$D\jdk\bin\java.exe")) {
  Get-File 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse' "$D\dl\jdk21.zip"
  Expand-Archive "$D\dl\jdk21.zip" -DestinationPath "$D\jdk-tmp" -Force
  Move-Item (Get-ChildItem "$D\jdk-tmp" -Directory | Select-Object -First 1).FullName "$D\jdk"
  Remove-Item "$D\jdk-tmp" -Recurse -Force
}

# 2. Android command-line tools + SDK 35
if (-not (Test-Path "$D\sdk\cmdline-tools\latest\bin\sdkmanager.bat")) {
  Get-File 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' "$D\dl\cmdtools.zip"
  Expand-Archive "$D\dl\cmdtools.zip" -DestinationPath "$D\sdk\cmdline-tools-tmp" -Force
  New-Item -ItemType Directory -Force "$D\sdk\cmdline-tools" | Out-Null
  Move-Item "$D\sdk\cmdline-tools-tmp\cmdline-tools" "$D\sdk\cmdline-tools\latest"
  Remove-Item "$D\sdk\cmdline-tools-tmp" -Recurse -Force
}
$env:JAVA_HOME = "$D\jdk"
$sm = "$D\sdk\cmdline-tools\latest\bin\sdkmanager.bat"
Write-Host 'Accepting Android SDK licences and installing SDK 35...'
$yes = ('y' + [Environment]::NewLine) * 20
$yes | & $sm "--sdk_root=$D\sdk" --licenses | Out-Null
& $sm "--sdk_root=$D\sdk" 'platform-tools' 'platforms;android-35' 'build-tools;34.0.0' | Out-Null

# 3. Gradle (pre-downloaded with curl, because Java downloads from GitHub can time out on some networks)
$url = 'https://services.gradle.org/distributions/gradle-8.11.1-all.zip'
$md5 = [System.Security.Cryptography.MD5]::Create().ComputeHash([Text.Encoding]::ASCII.GetBytes($url))
$n = [System.Numerics.BigInteger]::Parse('0' + (($md5 | ForEach-Object { $_.ToString('x2') }) -join ''), 'AllowHexSpecifier')
$chars = '0123456789abcdefghijklmnopqrstuvwxyz'; $h = ''
while ($n -gt 0) { $h = $chars[[int]($n % 36)] + $h; $n = [System.Numerics.BigInteger]::Divide($n, 36) }
$gd = Join-Path $env:USERPROFILE ".gradle\wrapper\dists\gradle-8.11.1-all\$h"
New-Item -ItemType Directory -Force $gd | Out-Null
Get-File $url "$gd\gradle-8.11.1-all.zip"

Write-Host ''
Write-Host "Done. Java and the Android SDK are in $D"
Write-Host 'Now double-click build-android-apk.bat to build MSR-Pulse.apk'
