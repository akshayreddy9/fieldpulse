# Uploads msr-pulse-release.zip (made by make-release.bat) to S3 and installs it on the server right away.
# Usage (PowerShell, from the project folder):  .\deploy\aws\update-live-site.ps1
# If it says the session expired, run:  & "$env:LOCALAPPDATA\Programs\Amazon\AWSCLIV2\aws.exe" login --profile msr-pulse --region ap-southeast-2
$aws = "$env:LOCALAPPDATA\Programs\Amazon\AWSCLIV2\aws.exe"
$root = Split-Path (Split-Path $PSScriptRoot)
& $aws s3 cp "$root\msr-pulse-release.zip" s3://msr-pulse-bucket-mzalppajffls/release/msr-pulse-release.zip --region ap-southeast-2 --profile msr-pulse --only-show-errors
if ($LASTEXITCODE -ne 0) { Write-Host 'Upload failed (sign in again with aws login, see above).'; exit 1 }
& "$PSScriptRoot\remote.ps1" -Command '/usr/local/bin/msr-deploy --force >> /var/log/msr-deploy.log 2>&1; tail -n 2 /var/log/msr-deploy.log'
