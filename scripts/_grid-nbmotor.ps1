Add-Type -AssemblyName System.Drawing
$src = 'D:\PythonProject\physics-lab\audit\fidelity\nb-motor\_ref.png'
$img = [System.Drawing.Image]::FromFile($src)
# 区域（原图坐标）
$x0 = 80; $y0 = 30; $w = 100; $h = 130
$sc = 6
$bmp = New-Object System.Drawing.Bitmap ($w * $sc), ($h * $sc)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'NearestNeighbor'
$g.PixelOffsetMode = 'Half'
$g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, ($w * $sc), ($h * $sc)), (New-Object System.Drawing.Rectangle $x0, $y0, $w, $h), 'Pixel')
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 0, 255, 0)), 1
$font = New-Object System.Drawing.Font 'Consolas', 11
$br = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(210, 0, 255, 0))
for ($i = 0; $i -le $w; $i += 10) {
  $px = $i * $sc
  $g.DrawLine($pen, $px, 0, $px, $h * $sc)
  $g.DrawString(($x0 + $i), $font, $br, ($px + 2), 2)
}
for ($j = 0; $j -le $h; $j += 10) {
  $py = $j * $sc
  $g.DrawLine($pen, 0, $py, $w * $sc, $py)
  $g.DrawString(($y0 + $j), $font, $br, 2, ($py + 1))
}
$bmp.Save('D:\PythonProject\physics-lab\audit\fidelity\nb-motor\_coil-grid.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
'grid ok'
