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
foreach ($name in @('QQ','QQNT','WeChat','Weixin','WXWork','SnippingTool','ScreenClippingHost')) {
  if (-not [ScreenshotGuard]::IsCaptureOverlayProcess($name,$true)) { throw "Missing capture overlay: $name" }
}
if ([ScreenshotGuard]::IsCaptureOverlayProcess('Weixin',$false)) { throw 'An ordinary chat window is not a capture overlay.' }
if ([ScreenshotGuard]::IsCaptureOverlayProcess('notepad',$true)) { throw 'An ordinary fullscreen app is not a capture overlay.' }
if ([ScreenshotGuard]::ShouldFinishAutomatic($true,$true,60000,60000)) { throw 'A long-running capture must stay protected.' }
if ([ScreenshotGuard]::ShouldFinishAutomatic($true,$false,2000,100)) { throw 'Allow capture completion grace.' }
if (-not [ScreenshotGuard]::ShouldFinishAutomatic($true,$false,2000,300)) { throw 'Finished capture must restore normal behavior.' }
if (-not [ScreenshotGuard]::ShouldFinishAutomatic($false,$false,10000,0)) { throw 'Cancelled/unrecognized hotkey must not stay suspended forever.' }
if ([ScreenshotGuard]::AllowOutsideDismiss($true,$true,3000)) { throw 'Outside selection during capture must not dismiss.' }
if (-not [ScreenshotGuard]::AllowOutsideDismiss($false,$false,1000)) { throw 'Outside click after capture must dismiss without clicking inside first.' }
if (-not [ScreenshotGuard]::AllowOutsideDismiss($false,$true,300)) { throw 'A known completed capture must allow immediate dismissal.' }
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
  $guard.Suspend()
  $guard.SuspendAutomatic()
  if ($guard.Automatic -or $guard.CanDismissOutside) { throw 'Manual compatibility mode must remain explicit.' }
  $guard.Resume()
  $guard.SuspendAutomatic()
  $guard.PollAutomatic()
  if (-not $guard.Automatic -or $guard.CanDismissOutside) { throw 'Allow capture UI activation before outside dismissal.' }
  Start-Sleep -Milliseconds 700
  $guard.PollAutomatic()
  if (-not $guard.CanDismissOutside) { throw 'After capture, outside click must restore and dismiss without an inside click.' }
  $guard.Resume()
  if ($guard.Automatic) { throw 'Automatic session state did not reset.' }
  $form.Hide()
  $guard.Suspend(); $guard.Resume()
  if ($guard.Affinity -ne 0) { throw 'Hidden window must remain unexcluded.' }
} finally {
  if ($guard) { $guard.Dispose() }
  $form.Dispose()
}
Write-Output 'PASS: Windows/PrintScreen/Alt+A hotkeys, hook installation, capture affinity, suspend/resume epochs.'
