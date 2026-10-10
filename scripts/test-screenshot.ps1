param()
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -Path (Join-Path (Split-Path -Parent $PSScriptRoot) 'native\ScreenshotGuard.cs')
foreach ($case in @(
  @(0x53,$true,$true,$false,$true),
  @(0x2C,$false,$false,$false,$true),
  @(0x41,$false,$false,$true,$true),
  @(0x53,$false,$true,$false,$false),
  @(0x41,$false,$false,$false,$false),
  @(0x43,$false,$false,$false,$false)
)) {
  if ([ScreenshotGuard]::IsCaptureHotkey($case[0],$case[1],$case[2],$case[3]) -ne $case[4]) { throw 'Hotkey match failed.' }
}
# Test only an opaque synthetic window, never capture or save the desktop.
$form=New-Object Windows.Forms.Form
$form.ShowInTaskbar=$false
$form.Text='Token Meter screenshot guard test'
$form.Size=New-Object Drawing.Size(180,80)
$guard=$null
try {
  $guard=New-Object ScreenshotGuard($form.Handle)
  if (-not $guard.HookInstalled) { throw 'Keyboard hook not installed.' }
  $form.Show()
  [Windows.Forms.Application]::DoEvents()
  $guard.SetExcluded($true)
  if ($guard.Affinity -ne 0x11 -or $guard.LastAffinityError) { throw 'Normal glass exclusion failed.' }
  $epoch=$guard.Epoch
  $guard.Suspend()
  if (-not $guard.Suspended -or $guard.Affinity -ne 0 -or $guard.Epoch -ne $epoch+1) { throw 'Screenshot must be capturable and invalidate pending frames.' }
  $guard.SetExcluded($true)
  if ($guard.Affinity -ne 0) { throw 'Background refresh must not re-exclude a suspended window.' }
  $guard.Suspend()
  if ($guard.Epoch -ne $epoch+1) { throw 'Repeated hotkeys must not reset screenshot state.' }
  $guard.Resume()
  if ($guard.Suspended -or $guard.Affinity -ne 0x11 -or $guard.Epoch -ne $epoch+2) { throw 'Click-back restore failed.' }
  $form.Hide()
  $guard.Suspend(); $guard.Resume()
  if ($guard.Affinity -ne 0) { throw 'Hidden window must remain unexcluded.' }
} finally {
  if ($guard) { $guard.Dispose() }
  $form.Dispose()
}
Write-Output 'PASS: Windows/PrintScreen/Alt+A hotkeys, hook installation, capture affinity, suspend/resume epochs.'
