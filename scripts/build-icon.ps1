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
  $background = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#ffffff'))
  $mark = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#111111'))
  $outline = New-Object Drawing.Pen ([Drawing.ColorTranslator]::FromHtml('#dedede')), 1
  $path = RoundedPath 2 2 60 60 17
  $bars = @((RoundedPath 14 34 8 16 4), (RoundedPath 28 25 8 25 4), (RoundedPath 42 14 8 36 4))
  try {
    $graphics.FillPath($background, $path)
    $graphics.DrawPath($outline, $path)
    foreach ($bar in $bars) { $graphics.FillPath($mark, $bar) }
  } finally {
    foreach ($bar in $bars) { $bar.Dispose() }
    $path.Dispose(); $background.Dispose(); $mark.Dispose(); $outline.Dispose(); $graphics.Dispose()
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
