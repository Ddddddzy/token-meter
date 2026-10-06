$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path (Split-Path -Parent $PSScriptRoot) 'native\GlassEffects.cs') -ReferencedAssemblies System.Drawing
$checker = New-Object Drawing.Bitmap 128, 128
$blurred = $null
$solid = $null
$solidBlur = $null
try {
  for ($y=0; $y -lt 128; $y++) {
    for ($x=0; $x -lt 128; $x++) {
      $color = if (($x+$y)%2) { [Drawing.Color]::White } else { [Drawing.Color]::Black }
      $checker.SetPixel($x,$y,$color)
    }
  }
  $blurred = [GlassEffects]::Blur($checker,6)
  $min = 255; $max = 0
  for ($y=20; $y -lt 108; $y++) { for ($x=20; $x -lt 108; $x++) {
    $value = $blurred.GetPixel($x,$y).R
    $min = [Math]::Min($min,$value); $max = [Math]::Max($max,$value)
    if ($blurred.GetPixel($x,$y).A -ne 255) { throw 'Blur introduced transparency.' }
  } }
  if ($max-$min -gt 5) { throw "Blur failed to remove high-frequency detail: $min - $max" }
  $solid = New-Object Drawing.Bitmap 64, 64
  $g = [Drawing.Graphics]::FromImage($solid)
  $g.Clear([Drawing.Color]::FromArgb(255,67,89,113)); $g.Dispose()
  $solidBlur = [GlassEffects]::Blur($solid,6)
  if ($solidBlur.GetPixel(0,0).ToArgb() -ne $solid.GetPixel(0,0).ToArgb()) { throw 'Blur changes a uniform image or its edges.' }
  $bounds = New-Object Drawing.Rectangle 10,20,64,64
  $frame = [GlassEffects]::Encode($solidBlur, $bounds)
  $same = [GlassEffects]::Encode($solidBlur, $bounds)
  if (-not $frame.DataUrl.StartsWith('data:image/jpeg;base64,') -or -not $frame.Bounds.Equals($bounds)) { throw 'Memory frame encoding failed.' }
  if ($frame.Fingerprint -ne $same.Fingerprint) { throw 'Identical glass frames must not trigger repaint.' }
  $solidBlur.SetPixel(20,20,[Drawing.Color]::White)
  if ([GlassEffects]::Encode($solidBlur, $bounds).Fingerprint -eq $frame.Fingerprint) { throw 'Changed background was not detected.' }
  if ([GlassEffects]::Ease(0) -ne 0 -or [GlassEffects]::Ease(1) -ne 1) { throw 'Animation endpoints are incorrect.' }
  if ([GlassEffects]::Ease(0.2) -gt 0.15) { throw 'Opening animation starts too abruptly.' }
  $previous = 0
  for ($i=1; $i -le 100; $i++) { $current=[GlassEffects]::Ease($i/100.0); if ($current -lt $previous -or $current -gt 1) { throw 'Animation easing is not monotonic.' }; $previous=$current }
  Write-Output "PASS: Gaussian approximation suppresses fine detail ($min-$max), preserves solid color/alpha; in-memory JPEG frames deduplicate identical backgrounds; motion easing is continuous."
} finally { if ($blurred) { $blurred.Dispose() }; if ($solidBlur) { $solidBlur.Dispose() }; if ($solid) { $solid.Dispose() }; $checker.Dispose() }
