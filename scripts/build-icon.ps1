param([string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'assets'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
function RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$radius) {
  $path = New-Object Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc(($x+$w-$d), $y, $d, $d, 270, 90)
  $path.AddArc(($x+$w-$d), ($y+$h-$d), $d, $d, 0, 90)
  $path.AddArc($x, ($y+$h-$d), $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}
function Paint-Icon([int]$size) {
  $bitmap = New-Object Drawing.Bitmap $size, $size
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([Drawing.Color]::Transparent)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.ScaleTransform(($size/64.0), ($size/64.0))
  $background = New-Object Drawing.Drawing2D.LinearGradientBrush ([Drawing.Point]::new(2,2)), ([Drawing.Point]::new(62,62)), ([Drawing.ColorTranslator]::FromHtml('#202e4a')), ([Drawing.ColorTranslator]::FromHtml('#10192c'))
  $outline = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(33,255,255,255)), 1
  $bars = New-Object Drawing.Drawing2D.LinearGradientBrush ([Drawing.Point]::new(0,14)), ([Drawing.Point]::new(0,50)), ([Drawing.ColorTranslator]::FromHtml('#79f0de')), ([Drawing.ColorTranslator]::FromHtml('#549cff'))
  $paths = @((RoundedPath 2 2 60 60 17), (RoundedPath 3 3 58 58 16), (RoundedPath 14 34 8 16 4), (RoundedPath 28 25 8 25 4), (RoundedPath 42 14 8 36 4))
  try {
    $graphics.FillPath($background, $paths[0])
    $graphics.DrawPath($outline, $paths[1])
    foreach ($path in $paths[2..4]) { $graphics.FillPath($bars, $path) }
  } finally {
    foreach ($path in $paths) { $path.Dispose() }
    $background.Dispose(); $outline.Dispose(); $bars.Dispose(); $graphics.Dispose()
  }
  return $bitmap
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$sizes = @(16,20,24,32,40,48,64,128,256)
$images = @()
foreach ($size in $sizes) {
  # Supersample each native icon size for clean small curves.
  $large = Paint-Icon ($size*4)
  $small = New-Object Drawing.Bitmap $size, $size
  $g = [Drawing.Graphics]::FromImage($small)
  $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($large, 0, 0, $size, $size)
  $stream = New-Object IO.MemoryStream
  try {
    $small.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $images += ,($stream.ToArray())
    if ($size -eq 256) { $small.Save((Join-Path $OutputDirectory 'token-meter.png'), [Drawing.Imaging.ImageFormat]::Png) }
  } finally { $g.Dispose(); $large.Dispose(); $small.Dispose(); $stream.Dispose() }
}
$file = [IO.File]::Create((Join-Path $OutputDirectory 'token-meter.ico'))
$writer = New-Object IO.BinaryWriter $file
try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i=0; $i -lt $sizes.Count; $i++) {
    $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
  }
  foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
} finally { $writer.Dispose(); $file.Dispose() }
Write-Output "Generated $($sizes.Count) icon resolutions in $OutputDirectory"
