# Runs a shell command on the MSR Pulse server through AWS Systems Manager (no SSH) and prints the output.
param([Parameter(Mandatory = $true)][string]$Command)
$aws = "$env:LOCALAPPDATA\Programs\Amazon\AWSCLIV2\aws.exe"
$env:PYTHONIOENCODING = 'utf-8'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# keep output plain ASCII so any console can show it
$Command = "{ $Command ; } 2>&1 | tr -cd '\11\12\15\40-\176'"
$common = @('--region', 'ap-southeast-2', '--profile', 'msr-pulse')
$params = @{ commands = @($Command) } | ConvertTo-Json -Compress
$tmp = New-TemporaryFile
Set-Content -Path $tmp -Value $params -Encoding ascii
$id = & $aws ssm send-command --instance-ids i-00f5b84673c49f226 --document-name AWS-RunShellScript --parameters "file://$tmp" --query Command.CommandId --output text @common
Remove-Item $tmp
for ($k = 0; $k -lt 40; $k++) {
  Start-Sleep -Seconds 3
  $st = & $aws ssm get-command-invocation --command-id $id --instance-id i-00f5b84673c49f226 --query Status --output text @common 2>$null
  if ($st -and $st -notin @('Pending', 'InProgress', 'Delayed')) { break }
}
"[status: $st]"
& $aws ssm get-command-invocation --command-id $id --instance-id i-00f5b84673c49f226 --query StandardOutputContent --output text @common
$err = & $aws ssm get-command-invocation --command-id $id --instance-id i-00f5b84673c49f226 --query StandardErrorContent --output text @common
if ($err -and $err.Trim()) { "--- errors:"; $err }
