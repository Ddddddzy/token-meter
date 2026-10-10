param([switch]$Show)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $env:LOCALAPPDATA 'token-meter'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory 'startup.log'
function Write-StartupLog([string]$message) {
  ('{0:o} pid={1} show={2} {3}' -f [DateTimeOffset]::Now,$PID,[bool]$Show,$message) | Add-Content -LiteralPath $logPath -Encoding UTF8
}
try {
  Write-StartupLog ('starting project='+$project)
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    $nodeCandidate = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path -LiteralPath $nodeCandidate) { $script:tokenMeterNode = $nodeCandidate }
    else { throw 'Node.js 22.13+ is required. Install Node.js LTS, then sign out/in to refresh PATH.' }
  } else { $script:tokenMeterNode = $nodeCommand.Source }
  $nodeVersion = & $script:tokenMeterNode -p 'process.versions.node'
  if ($LASTEXITCODE -ne 0 -or [version]$nodeVersion -lt [version]'22.13.0') { throw 'Node.js 22.13+ is required.' }
  & $script:tokenMeterNode --no-warnings -e "import('node:sqlite').catch(()=>process.exit(1))"
  if ($LASTEXITCODE -ne 0) { throw 'This Node.js build cannot load node:sqlite. Install current Node.js LTS.' }
  $port = & $script:tokenMeterNode (Join-Path $project 'config.mjs') --port
  if ($LASTEXITCODE -ne 0) { throw 'Invalid configuration. Check config.json or TOKEN_METER_CONFIG.' }
  $env:TOKEN_METER_PORT = [string]$port
  $sdk = Join-Path $project 'lib\webview2\pkg'
  if (-not (Test-Path -LiteralPath (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'))) {
    throw 'WebView2 SDK is missing. Run: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1'
  }
  Write-StartupLog ('dependencies checked; Node='+$nodeVersion+' port='+$port)
  & (Join-Path $project 'tray.ps1') -NodePath $script:tokenMeterNode -Show:$Show
  Write-StartupLog 'tray exited or existing instance reused'
} catch {
  Write-StartupLog ('FAILED: '+$_.Exception.Message)
  $_ | Out-String | Add-Content -LiteralPath $logPath -Encoding UTF8
  Add-Type -AssemblyName System.Windows.Forms
  [void][Windows.Forms.MessageBox]::Show("$($_.Exception.Message)`n`nLog: $logPath", 'Token Meter - startup failed', 'OK', 'Error')
  exit 1
}
