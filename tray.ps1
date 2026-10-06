# Token Meter tray: native shell with a single WebView2 panel.
param([string]$NodePath, [switch]$Show, [switch]$Verify, [switch]$VerifyMotion)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'native\GlassEffects.cs') -ReferencedAssemblies System.Drawing
Add-Type -Name U32 -Namespace U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern System.IntPtr GetAncestor(System.IntPtr h, uint gaFlags);
[DllImport("user32.dll")] public static extern bool IsChild(System.IntPtr parent, System.IntPtr child);
[DllImport("user32.dll")] public static extern int SetWindowRgn(System.IntPtr h, System.IntPtr rgn, bool redraw);
[DllImport("user32.dll")] public static extern bool SetWindowDisplayAffinity(System.IntPtr h, uint affinity);
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
[DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
[DllImport("gdi32.dll")] public static extern System.IntPtr CreateRoundRectRgn(int l, int t, int r, int b, int rw, int rh);
[StructLayout(LayoutKind.Sequential)]
public struct POINT { public int X; public int Y; }
'@
[U.U32]::SetProcessDPIAware() | Out-Null
$_g = [Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
$script:dpi = $_g.DpiX / 96
$_g.Dispose()

$dir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$verifyNative = $Verify
$port = 3080
if ($env:TOKEN_METER_PORT) { $port = [int]$env:TOKEN_METER_PORT }
else {
  $configPath = Join-Path $dir 'config.json'
  if ($env:TOKEN_METER_CONFIG) { $configPath = $env:TOKEN_METER_CONFIG; if (-not [IO.Path]::IsPathRooted($configPath)) { $configPath = Join-Path $dir $configPath } }
  if (Test-Path -LiteralPath $configPath) {
    $startupConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -ne $startupConfig.port) { $port = [int]$startupConfig.port }
  }
}
if ($port -lt 1 -or $port -gt 65535) { throw 'Invalid Token Meter port.' }
$showSignal = New-Object Threading.EventWaitHandle($false, [Threading.EventResetMode]::AutoReset, "Local\TokenMeter-Show-$port")
$mutex = New-Object Threading.Mutex($false, "Local\TokenMeter-$port")
if (-not $mutex.WaitOne(0, $false)) { [void]$showSignal.Set(); exit }
$script:baseW = 380
$script:baseH = 680
$script:scale = 1.0
$script:glass = 0.8
$cfgPath = Join-Path $dir 'ui-settings.json'
if (Test-Path -LiteralPath $cfgPath) {
  try {
    $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($cfg.scale) { $script:scale = [Math]::Min(1.4, [Math]::Max(0.8, [double]$cfg.scale)) }
    if ($cfg.glass) { $script:glass = [Math]::Min(0.9, [Math]::Max(0.15, [double]$cfg.glass)) }
  } catch {}
}

$sdk = Join-Path $dir 'lib\webview2\pkg'
$native = Join-Path $sdk 'runtimes\win-x64\native'
Add-Type -Path (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll')
Add-Type -Path (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.WinForms.dll')
[Microsoft.Web.WebView2.Core.CoreWebView2Environment]::SetLoaderDllFolderPath($native)
try { [Microsoft.Web.WebView2.Core.CoreWebView2Environment]::GetAvailableBrowserVersionString($null) | Out-Null }
catch { throw 'WebView2 Runtime is missing. Install Microsoft Evergreen WebView2 Runtime, then rerun scripts\setup.ps1.' }
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class AcrylicForm : Form {
  [DllImport("dwmapi.dll")]
  static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
  [DllImport("dwmapi.dll")]
  static extern int DwmExtendFrameIntoClientArea(IntPtr hwnd, ref MARGINS m);
  [StructLayout(LayoutKind.Sequential)]
  struct MARGINS { public int l, r, t, b; }
  protected override void OnHandleCreated(EventArgs e) {
    base.OnHandleCreated(e);
    int dark = 1;
    DwmSetWindowAttribute(Handle, 20, ref dark, 4);
    int pref = 1;
    DwmSetWindowAttribute(Handle, 33, ref pref, 4);
  }
  protected override void OnPaintBackground(PaintEventArgs e) { }
}
'@

function Test-Server {
  try { (New-Object Net.Sockets.TcpClient('127.0.0.1', $port)).Close(); $true } catch { $false }
}
$script:node = $null
if (-not (Test-Server)) {
  $nodeExecutable = if ($NodePath) { $NodePath } else { (Get-Command node.exe -ErrorAction Stop).Source }
  $script:node = Start-Process -FilePath $nodeExecutable -ArgumentList 'server.mjs' -WorkingDirectory $dir -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 40 -and -not (Test-Server); $i++) { Start-Sleep -Milliseconds 300 }
  if (-not (Test-Server)) { throw 'Token Meter server did not start. Check Node.js and config.json.' }
}

$form = New-Object AcrylicForm
$form.Text = 'Token Meter'
$form.AutoScaleMode = 'None'
$form.FormBorderStyle = 'None'; $form.ShowInTaskbar = $false
$form.TopMost = $true; $form.StartPosition = 'Manual'
$form.Size = New-Object Drawing.Size([int]($script:baseW * $script:dpi * $script:scale), [int]($script:baseH * $script:dpi * $script:scale))
$form.BackColor = [Drawing.Color]::Black
$form.Opacity = 0
$form.KeyPreview = $true
$form.add_KeyDown({ param($s,$e) if ($e.KeyCode -eq 'Escape') { Hide-Panel } })

$script:outsideArmed = $false
$script:mouseWasDown = $false
$script:panelReady = $false
$script:openRequested = $false
$script:reducedMotion = $false
$script:visibilityProgress = 0.0
$script:motionSamples = New-Object 'Collections.Generic.List[object]'
function Hide-Panel {
  if (-not $script:openRequested) { return }
  $script:openRequested = $false
  $script:outsideArmed = $false
  if (-not $script:panelReady) { $form.Hide(); return }
  Start-PanelMotion 0
}
function Test-OurWindow([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return $false }
  $root = [U.U32]::GetAncestor($h, 2)
  return ($h -eq $form.Handle) -or ($root -eq $form.Handle) -or [U.U32]::IsChild($form.Handle, $h)
}
$focusTimer = New-Object Windows.Forms.Timer
$focusTimer.Interval = 50
$focusTimer.add_Tick({
  if (-not $script:openRequested -or -not $script:panelReady -or -not $form.Visible -or -not $form.IsHandleCreated) { $script:outsideArmed = $false; $script:mouseWasDown = $false; return }
  $down = ([U.U32]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
  if (-not $script:outsideArmed) {
    if (-not $down) { $script:outsideArmed = $true }
    $script:mouseWasDown = $down
    return
  }
  if ($down -and -not $script:mouseWasDown) {
    $pt = New-Object U.U32+POINT
    [void][U.U32]::GetCursorPos([ref]$pt)
    $hit = [U.U32]::WindowFromPoint($pt)
    if (-not (Test-OurWindow $hit)) { Hide-Panel }
  }
  $script:mouseWasDown = $down
})
$focusTimer.Start()

$wv = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$wv.Dock = 'Fill'
$wv.DefaultBackgroundColor = [Drawing.Color]::FromArgb(0, 0, 0, 0)
$wv.CreationProperties = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties
$wv.CreationProperties.UserDataFolder = Join-Path $env:LOCALAPPDATA 'token-meter\webview'
$wv.add_CoreWebView2InitializationCompleted({
  param($s, $e)
  if (-not $e.IsSuccess) {
    [void][Windows.Forms.MessageBox]::Show("WebView2 initialization failed: $($e.InitializationException.Message)", 'Token Meter', 'OK', 'Error')
    [Windows.Forms.Application]::Exit()
    return
  }
  $s.CoreWebView2.Settings.AreDefaultContextMenusEnabled = $false
  $s.CoreWebView2.Settings.AreDevToolsEnabled = $false
  $s.CoreWebView2.Settings.IsWebMessageEnabled = $true
  $s.CoreWebView2.Settings.IsZoomControlEnabled = $false
  $s.CoreWebView2.Settings.IsStatusBarEnabled = $false
  $s.CoreWebView2.add_WebMessageReceived({
    param($sender, $ev)
    try {
      $msg = $ev.WebMessageAsJson | ConvertFrom-Json
      if ($null -ne $msg.scale) { Set-WindowScale ([double]$msg.scale) }
      if ($msg.hide -or $msg.quit) { Hide-Panel }
      if ($null -ne $msg.reducedMotion) { $script:reducedMotion = [bool]$msg.reducedMotion }
      if ($msg.ready) {
        $script:panelReady = $true
        $script:bgSig = ''
        try { Update-Backdrop $true } catch {}
        if ($script:openRequested) { Start-PanelMotion 1 }
        if ($VerifyMotion) { $script:verifyMotionTimer.Start() }
      }
      if ($msg.diagnostics -and $verifyNative) {
        $result = @{ layout=$msg.diagnostics; formVisible=$form.Visible; width=$form.ClientSize.Width; height=$form.ClientSize.Height; dpi=$script:dpi; motion=$script:motionSamples.ToArray(); opacity=$form.Opacity }
        [IO.File]::WriteAllText((Join-Path $dir 'native-verification.json'), ($result | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
      }
    } catch {}
  })
  Update-Backdrop $false
  Set-Round
})
$form.Controls.Add($wv)
$wv.add_NavigationCompleted({
  param($s,$e)
  if ($e.IsSuccess -and $verifyNative) {
    [void]$s.CoreWebView2.ExecuteScriptAsync(@'
setTimeout(function(){chrome.webview.postMessage({diagnostics:{ready:document.getElementById('total').textContent,scrolls:Array.from(document.querySelectorAll('*')).filter(function(e){return getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight+1}).map(function(e){return e.id}),footer:document.querySelector('.footer').getBoundingClientRect().bottom,viewport:innerHeight,devicePixelRatio:devicePixelRatio,glassBlur:getComputedStyle(document.getElementById('glassImage')).filter,glassImage:getComputedStyle(document.getElementById('glassImage')).backgroundImage!=='none',errors:document.getElementById('status').textContent}})},5500)
'@)
  }
})
$wv.Source = New-Object Uri ("http://127.0.0.1:{0}/panel?embed=1&scale={1}" -f $port, $script:scale)

$script:bgClient = New-Object Net.WebClient
$script:bgSig = ''
$script:jpegCodec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$script:jpegParam = New-Object Drawing.Imaging.EncoderParameters 1
$script:jpegParam.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality, [int64]55)
function Set-CaptureExclude([bool]$on) {
  $aff = [uint32]0
  if ($on) { $aff = [uint32]0x11 }
  if ($form.IsHandleCreated) { [void][U.U32]::SetWindowDisplayAffinity($form.Handle, $aff) }
  if ($wv -and $wv.IsHandleCreated) { [void][U.U32]::SetWindowDisplayAffinity($wv.Handle, $aff) }
}
function Push-BackdropImage {
  if (-not $wv.CoreWebView2) { return }
  $t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $js = "if(window.__paintBg)window.__paintBg('/backdrop.jpg?t=$t');"
  [void]$wv.CoreWebView2.ExecuteScriptAsync($js)
}
function Update-Backdrop([bool]$recapture) {
  $pushed = $false
  if ($recapture -and $form.Width -gt 20 -and $form.Height -gt 20) {
    Set-CaptureExclude $true
    $captureTop = if ($script:motionT -and $script:motionT.Enabled) { $script:restTop } else { $form.Top }
    $bounds = New-Object Drawing.Rectangle($form.Left, $captureTop, $form.Width, $form.Height)
    $bmp = [GlassEffects]::Capture($bounds, $script:dpi)
    try {
    $small = New-Object Drawing.Bitmap 48, 32
    $gs = [Drawing.Graphics]::FromImage($small)
    $gs.InterpolationMode = 'Low'
    $gs.DrawImage($bmp, 0, 0, 48, 32)
    $gs.Dispose()
    $rect = New-Object Drawing.Rectangle 0, 0, 48, 32
    $data = $small.LockBits($rect, [Drawing.Imaging.ImageLockMode]::ReadOnly, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $raw = New-Object byte[] ($data.Stride * 32)
    [Runtime.InteropServices.Marshal]::Copy($data.Scan0, $raw, 0, $raw.Length)
    $small.UnlockBits($data)
    $small.Dispose()
    $md5 = [Security.Cryptography.MD5]::Create()
    $sig = [Convert]::ToBase64String($md5.ComputeHash($raw))
    $md5.Dispose()
    if ($sig -ne $script:bgSig) {
      $script:bgSig = $sig
      $ms = New-Object IO.MemoryStream
      $bmp.Save($ms, $script:jpegCodec, $script:jpegParam)
      $bytes = $ms.ToArray()
      $ms.Dispose()
      try {
        [void]$script:bgClient.UploadData("http://127.0.0.1:$port/backdrop.jpg", 'POST', $bytes)
        $pushed = $true
      } catch {}
    }
    } finally { $bmp.Dispose() }
  }
  if ($pushed) { Push-BackdropImage }
}

function Set-Round {
  if (-not $form.IsHandleCreated) { return }
  $r = [Math]::Max(16, [int](28 * $script:dpi * $script:scale))
  $hrgn = [U.U32]::CreateRoundRectRgn(0, 0, ($form.Width + 1), ($form.Height + 1), ($r * 2), ($r * 2))
  [U.U32]::SetWindowRgn($form.Handle, $hrgn, $true) | Out-Null
}
$script:resizeT = New-Object Windows.Forms.Timer
$script:resizeT.Interval = 16
$script:resizeClock = New-Object Diagnostics.Stopwatch
$script:resizeT.add_Tick({
  $p = [Math]::Min(1.0, $script:resizeClock.Elapsed.TotalMilliseconds / 360.0)
  $e = 1 - [Math]::Pow(1 - $p, 4)
  $w = [int]($script:fromW + ($script:toW - $script:fromW) * $e)
  $h = [int]($script:fromH + ($script:toH - $script:fromH) * $e)
  $form.SetBounds(($script:anchorRight - $w), ($script:anchorBottom - $h), $w, $h)
  Set-Round
  if ($p -ge 1 -or -not $form.Visible) { $script:resizeT.Stop(); $script:resizeClock.Stop(); $script:restTop = $form.Top }
})
function Set-WindowScale([double]$scale) {
  if ($script:motionT -and $script:motionT.Enabled) {
    $script:motionT.Stop()
    $script:visibilityProgress = if ($script:openRequested) { 1.0 } else { 0.0 }
    $form.Opacity = $script:visibilityProgress
    if (-not $script:openRequested) { $form.Hide() }
  }
  $script:scale = [Math]::Max(0.8, [Math]::Min(1.4, $scale))
  $wa = [Windows.Forms.Screen]::FromPoint([Windows.Forms.Cursor]::Position).WorkingArea
  $script:toW = [Math]::Min(($wa.Width - 24), [int]($script:baseW * $script:dpi * $script:scale))
  $script:toH = [Math]::Min(($wa.Height - 24), [int]($script:baseH * $script:dpi * $script:scale))
  $script:anchorRight = $wa.Right - 12
  $script:anchorBottom = $wa.Bottom - 12
  if ($form.Visible) {
    $script:fromW = $form.Width; $script:fromH = $form.Height
    $script:resizeClock.Restart(); $script:resizeT.Start()
  } else {
    $form.SetBounds(($script:anchorRight - $script:toW), ($script:anchorBottom - $script:toH), $script:toW, $script:toH)
    Set-Round
  }
  $script:bgSig = ''
}
$script:motionT = New-Object Windows.Forms.Timer
$script:motionT.Interval = 16
$script:motionClock = New-Object Diagnostics.Stopwatch
function Set-PanelProgress([double]$progress) {
  $script:visibilityProgress = [Math]::Max(0.0, [Math]::Min(1.0, $progress))
  $form.Top = $script:restTop + [int]([Math]::Round((1 - $script:visibilityProgress) * $script:slideDistance))
  $form.Opacity = $script:visibilityProgress
  if ($verifyNative -and $script:motionSamples.Count -lt 120) {
    $script:motionSamples.Add(@{ progress=$script:visibilityProgress; opacity=$form.Opacity; top=$form.Top; target=$script:motionTo; ms=$script:motionClock.Elapsed.TotalMilliseconds })
  }
}
function Start-PanelMotion([double]$target) {
  $script:motionFrom = $script:visibilityProgress
  $script:motionTo = $target
  $script:motionDuration = [Math]::Max(1.0, (320 * [Math]::Abs($target - $script:motionFrom)))
  $script:motionClock.Restart()
  if ($wv.CoreWebView2) { [void]$wv.CoreWebView2.ExecuteScriptAsync(('document.getElementById("panel").style.pointerEvents="{0}"' -f $(if ($target -eq 1) { 'auto' } else { 'none' }))) }
  $script:motionT.Start()
}
$script:motionT.add_Tick({
  $p = if ($script:reducedMotion) { 1.0 } else { [Math]::Min(1.0, $script:motionClock.Elapsed.TotalMilliseconds / $script:motionDuration) }
  $e = [GlassEffects]::Ease($p)
  Set-PanelProgress ($script:motionFrom + ($script:motionTo - $script:motionFrom) * $e)
  if ($p -ge 1) {
    $script:motionT.Stop(); $script:motionClock.Stop()
    if ($script:motionTo -eq 0) { $form.Hide(); Set-CaptureExclude $false }
    else { Set-ForegroundForce $form.Handle }
  }
})
function Set-ForegroundForce([IntPtr]$hwnd) {
  $pidFg = [uint32]0
  $cur = [U.U32]::GetCurrentThreadId()
  $fg = [U.U32]::GetForegroundWindow()
  $fgThread = [U.U32]::GetWindowThreadProcessId($fg, [ref]$pidFg)
  $attached = $false
  if ($fgThread -ne 0 -and $fgThread -ne $cur) {
    $attached = [U.U32]::AttachThreadInput($fgThread, $cur, $true)
  }
  [void][U.U32]::SetForegroundWindow($hwnd)
  $form.Activate()
  if ($attached) { [void][U.U32]::AttachThreadInput($fgThread, $cur, $false) }
}
function Show-Panel {
  if ($script:openRequested) { Hide-Panel; return }
  $script:openRequested = $true
  if (-not $form.Visible) {
    Set-WindowScale $script:scale
    $script:restTop = $form.Top
    $wa = [Windows.Forms.Screen]::FromPoint([Windows.Forms.Cursor]::Position).WorkingArea
    $script:slideDistance = [Math]::Min(36 * $script:dpi, $wa.Bottom - $form.Top - 24)
    Set-PanelProgress 0
  }
  $script:bgSig = ''
  $script:outsideArmed = $false
  $script:mouseWasDown = $true
  $form.Show()
  Set-Round
  Set-CaptureExclude $true
  Set-ForegroundForce $form.Handle
  if ($wv.CoreWebView2) { [void]$wv.CoreWebView2.ExecuteScriptAsync('window.__panelShown && window.__panelShown()') }
  try { Update-Backdrop $true } catch {}
  if ($script:panelReady) { Start-PanelMotion 1 }
}

$iconPath = Join-Path $dir 'assets\token-meter.ico'
$trayIconSize = [int][Math]::Round(16 * $script:dpi)
$icon = New-Object Drawing.Icon($iconPath, $trayIconSize, $trayIconSize)
$form.Icon = $icon

$menu = New-Object Windows.Forms.ContextMenuStrip
$menu.Items.Add('显示面板') | Out-Null
$menu.Items.Add('-') | Out-Null
$menu.Items.Add('退出') | Out-Null
$menu.add_ItemClicked({
  param($s, $e)
  switch ($e.ClickedItem.Text) {
    '显示面板' { Show-Panel }
    '退出' {
      $notify.Visible = $false
      if ($script:node -and -not $script:node.HasExited) { Stop-Process -Id $script:node.Id -Force }
      [Windows.Forms.Application]::Exit()
    }
  }
})

$notify = New-Object Windows.Forms.NotifyIcon
$notify.Icon = $icon
$notify.Text = 'token-meter'
$notify.ContextMenuStrip = $menu
$notify.Visible = $true
$notify.add_MouseDown({
  param($s, $e)
  if ($e.Button -ne 'Left') { return }
  Show-Panel
})

Set-Round
$live = New-Object Windows.Forms.Timer
$live.Interval = 600
$live.add_Tick({
  if ($script:liveBusy -or -not $form.Visible -or -not $script:openRequested -or $script:motionT.Enabled -or $script:resizeT.Enabled) { return }
  $script:liveBusy = $true
  try { Update-Backdrop $true } catch {}
  $script:liveBusy = $false
})
$live.Start()

$openTimer = New-Object Windows.Forms.Timer
$openTimer.Interval = 100
$openTimer.add_Tick({ if ($showSignal.WaitOne(0)) { if (-not $form.Visible) { Show-Panel } } })
$openTimer.Start()
$script:verifyMotionPhase = 0
$script:verifyMotionTimer = New-Object Windows.Forms.Timer
$script:verifyMotionTimer.Interval = 1400
$script:verifyMotionTimer.add_Tick({
  switch ($script:verifyMotionPhase) {
    0 { Hide-Panel }
    1 { Show-Panel }
    2 { Hide-Panel; $script:verifyMotionTimer.Interval = 80 }
    3 { Show-Panel; $script:verifyMotionTimer.Stop() }
  }
  $script:verifyMotionPhase++
})

if ($Show) { Show-Panel }
[Windows.Forms.Application]::Run()
$notify.Dispose()
$icon.Dispose()
$mutex.ReleaseMutex()
$mutex.Dispose()
$showSignal.Dispose()
