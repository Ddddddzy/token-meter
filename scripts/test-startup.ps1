param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup.ps1')
$exe='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
foreach ($project in @('D:\token-meter', 'D:\Apps with spaces\token-meter')) {
  $command=Get-TokenMeterStartupCommand $project $exe
  $expected='"'+$exe+'" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$project+'\scripts\start.ps1"'
  if ($command -cne $expected) { throw "Unexpected command: $command" }
  if ($command.Contains('-Show') -or $command.Contains('wscript')) { throw 'Startup must be background and independent of VBS.' }
}
$rejected=$false
try { Get-TokenMeterStartupCommand ('D:\'+('x'*240)) $exe | Out-Null } catch { $rejected=$true }
if (-not $rejected) { throw 'Run commands above 260 characters must be rejected.' }
$project=Split-Path -Parent $PSScriptRoot
$scripts=@(Join-Path $project 'tray.ps1') + @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' | ForEach-Object FullName)
foreach ($path in $scripts) {
  $errors=$null; $tokens=$null
  [Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors) | Out-Null
  if ($errors.Count) { throw ($errors | Out-String) }
}
Write-Output 'PASS: quoted background startup command, length limit, PowerShell syntax.'
