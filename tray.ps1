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
$port = 3080
$script:baseW = 560
$script:baseH = 820
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
  $s.CoreWebView2.add_WebMessageReceived({
    param($sender, $ev)
    try {
      $msg = $ev.WebMessageAsJson | ConvertFrom-Json
      if ($null -ne $msg.scale) { Set-WindowScale ([double]$msg.scale) }
    } catch {}
  })
  Update-Backdrop $false
  Set-Round
})
$form.Controls.Add($wv)
$wv.Source = New-Object Uri ("http://127.0.0.1:{0}/?embed=1&scale={1}&glass={2}" -f $port, $script:scale, $script:glass)

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
function Set-WindowScale([double]$scale) {
  $scale = [Math]::Max(0.8, [Math]::Min(1.4, $scale))
  if ([Math]::Abs($scale - $script:scale) -lt 0.01) { return }
  $script:scale = $scale
  $script:bgSig = ''
  $w = [int]($script:baseW * $script:dpi * $script:scale)
  $h = [int]($script:baseH * $script:dpi * $script:scale)
  $was = $form.Visible
  if ($was) { $form.Hide() }
  $form.Size = New-Object Drawing.Size($w, $h)
  $wa = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $form.Location = New-Object Drawing.Point([Math]::Max($wa.Left, $wa.Right - $w - 12), [Math]::Max($wa.Top, $wa.Bottom - $h - 12))
  Set-Round
  if ($wv.CoreWebView2) {
    $inv = [Globalization.CultureInfo]::InvariantCulture
    [void]$wv.CoreWebView2.ExecuteScriptAsync(("document.documentElement.style.zoom='{0}'" -f $script:scale.ToString($inv)))
  }
  if ($was) {
    Update-Backdrop $true
    $script:shownAt = (Get-Date).Ticks
    $form.Show()
    [U.U32]::SetForegroundWindow($form.Handle) | Out-Null
    Update-Backdrop $false
  }
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
  $wa = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $form.Location = New-Object Drawing.Point(($wa.Right - $form.Width - 12), ($wa.Bottom - $form.Height - 12))
  $script:bgSig = ''
  $script:outsideArmed = $false
  $script:mouseWasDown = $true
  $form.Show()
  Set-Round
  Set-CaptureExclude $true
  Set-ForegroundForce $form.Handle
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
$live.Interval = 80
$live.add_Tick({
  if ($script:liveBusy -or -not $form.Visible) { return }
  $script:liveBusy = $true
  try { Update-Backdrop $true } catch {}
  $script:liveBusy = $false
})
$live.Start()

if ($args -contains '-show') { Show-Panel }
[Windows.Forms.Application]::Run()
