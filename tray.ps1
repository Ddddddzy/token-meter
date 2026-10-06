# token-meter 托盘：小窗就是网页端，不再手绘第二套界面
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
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
$verifyNative = $args -contains '-verify'
$port = 3080
if ($env:TOKEN_METER_PORT) { $port = [int]$env:TOKEN_METER_PORT }
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
    if ($cfg.scale) { $script:scale = [double]$cfg.scale }
    if ($cfg.glass) { $script:glass = [double]$cfg.glass }
  } catch {}
}

$sdk = Join-Path $dir 'lib\webview2\pkg'
$native = Join-Path $sdk 'runtimes\win-x64\native'
Add-Type -Path (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll')
Add-Type -Path (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.WinForms.dll')
[Microsoft.Web.WebView2.Core.CoreWebView2Environment]::SetLoaderDllFolderPath($native)
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
  $script:node = Start-Process node -ArgumentList 'server.mjs' -WorkingDirectory $dir -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 40 -and -not (Test-Server); $i++) { Start-Sleep -Milliseconds 300 }
}

$acc = [Drawing.Color]::FromArgb(91, 140, 255)
$Bold = [Drawing.FontStyle]::Bold
function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x+$w-$d, $y, $d, $d, 270, 90)
  $p.AddArc($x+$w-$d, $y+$h-$d, $d, $d, 0, 90); $p.AddArc($x, $y+$h-$d, $d, $d, 90, 90)
  $p.CloseFigure(); $p
}

$form = New-Object AcrylicForm
$form.Text = 'Token Meter'
$form.AutoScaleMode = 'None'
$form.FormBorderStyle = 'None'; $form.ShowInTaskbar = $false
$form.TopMost = $true; $form.StartPosition = 'Manual'
$form.Size = New-Object Drawing.Size([int]($script:baseW * $script:dpi * $script:scale), [int]($script:baseH * $script:dpi * $script:scale))
$form.BackColor = [Drawing.Color]::Black
$form.KeyPreview = $true
$form.add_KeyDown({ param($s,$e) if ($e.KeyCode -eq 'Escape') { Hide-Panel } })

$script:outsideArmed = $false
$script:mouseWasDown = $false
function Hide-Panel {
  if (-not $form.Visible) { return }
  Set-CaptureExclude $false
  $script:outsideArmed = $false
  $form.Hide()
}
function Test-OurWindow([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return $false }
  $root = [U.U32]::GetAncestor($h, 2)
  return ($h -eq $form.Handle) -or ($root -eq $form.Handle) -or [U.U32]::IsChild($form.Handle, $h)
}
$focusTimer = New-Object Windows.Forms.Timer
$focusTimer.Interval = 50
$focusTimer.add_Tick({
  if (-not $form.Visible -or -not $form.IsHandleCreated) { $script:outsideArmed = $false; $script:mouseWasDown = $false; return }
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
  if (-not $e.IsSuccess) { return }
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
      if ($msg.quit) { Hide-Panel }
      if ($msg.diagnostics -and $verifyNative) {
        $result = @{ layout=$msg.diagnostics; formVisible=$form.Visible; width=$form.ClientSize.Width; height=$form.ClientSize.Height; dpi=$script:dpi }
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
setTimeout(function(){chrome.webview.postMessage({diagnostics:{ready:document.getElementById('total').textContent,scrolls:Array.from(document.querySelectorAll('*')).filter(function(e){return getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight+1}).map(function(e){return e.id}),footer:document.querySelector('.footer').getBoundingClientRect().bottom,viewport:innerHeight,devicePixelRatio:devicePixelRatio,errors:document.getElementById('status').textContent}})},4000)
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
  $js = "var img=new Image();img.onload=function(){if(window.__paintBg)window.__paintBg(img.src);else document.documentElement.style.backgroundImage='url('+JSON.stringify(img.src)+')';};img.src='/backdrop.jpg?t=$t';"
  [void]$wv.CoreWebView2.ExecuteScriptAsync($js)
}
function Update-Backdrop([bool]$recapture) {
  $pushed = $false
  if ($recapture -and $form.Width -gt 20 -and $form.Height -gt 20) {
    Set-CaptureExclude $true
    $bmp = New-Object Drawing.Bitmap $form.Width, $form.Height
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($form.Left, $form.Top, 0, 0, $bmp.Size)
    $g.Dispose()
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
    $bmp.Dispose()
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
  $p = [Math]::Min(1, $script:resizeClock.Elapsed.TotalMilliseconds / 360.0)
  $e = 1 - [Math]::Pow(1 - $p, 4)
  $w = [int]($script:fromW + ($script:toW - $script:fromW) * $e)
  $h = [int]($script:fromH + ($script:toH - $script:fromH) * $e)
  $form.SetBounds(($script:anchorRight - $w), ($script:anchorBottom - $h), $w, $h)
  Set-Round
  if ($p -ge 1 -or -not $form.Visible) { $script:resizeT.Stop(); $script:resizeClock.Stop() }
})
function Set-WindowScale([double]$scale) {
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
  if ($form.Visible) { Hide-Panel; return }
  Set-WindowScale $script:scale
  $script:bgSig = ''
  $script:outsideArmed = $false
  $script:mouseWasDown = $true
  $form.Show()
  Set-Round
  Set-CaptureExclude $true
  Set-ForegroundForce $form.Handle
  if ($wv.CoreWebView2) { [void]$wv.CoreWebView2.ExecuteScriptAsync('window.__panelShown && window.__panelShown()') }
  try { Update-Backdrop $true } catch {}
}

$bmp = New-Object Drawing.Bitmap 32, 32
$g = [Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.FillPath((New-Object Drawing.SolidBrush($acc)), (RoundRect 0 0 32 32 8))
$g.DrawString('T', (New-Object Drawing.Font('Segoe UI', 18, $Bold)), [Drawing.Brushes]::White, 7, 1)
$icon = [Drawing.Icon]::FromHandle($bmp.GetHicon())

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
  if ($script:liveBusy -or -not $form.Visible -or $script:resizeT.Enabled) { return }
  $script:liveBusy = $true
  try { Update-Backdrop $true } catch {}
  $script:liveBusy = $false
})
$live.Start()

$openTimer = New-Object Windows.Forms.Timer
$openTimer.Interval = 100
$openTimer.add_Tick({ if ($showSignal.WaitOne(0)) { if (-not $form.Visible) { Show-Panel } } })
$openTimer.Start()

if ($args -contains '-show') { Show-Panel }
[Windows.Forms.Application]::Run()
$mutex.ReleaseMutex()
$mutex.Dispose()
$showSignal.Dispose()
