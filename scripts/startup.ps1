# Shared, side-effect-free command construction for setup and tests.
function Get-TokenMeterStartupCommand([string]$Project, [string]$PowerShellPath) {
  $launcher=Join-Path ([IO.Path]::GetFullPath($Project)) 'scripts\start.ps1'
  if ($launcher.Contains('"') -or $PowerShellPath.Contains('"')) { throw 'Invalid quote in startup path.' }
  $command='"'+$PowerShellPath+'" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$launcher+'"'
  if ($command.Length -gt 260) { throw 'Startup command exceeds Windows Run limit. Move Token Meter to a shorter path and rerun deployment.' }
  return $command
}
