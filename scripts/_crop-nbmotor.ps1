Add-Type -AssemblyName System.Drawing
$src = 'D:\PythonProject\physics-lab\audit\fidelity\nb-motor\_ref.png'
$img = [System.Drawing.Image]::FromFile($src)
"size {0}x{1}" -f $img.Width, $img.Height
$outDir = 'D:\PythonProject\physics-lab\audit\fidelity\nb-motor'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
function Crop($x, $y, $w, $h, $name, $scale) {
  $bmp = New-Object System.Drawing.Bitmap ([int]($w * $scale)), ([int]($h * $scale))
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, ([int]($w * $scale)), ([int]($h * $scale))), (New-Object System.Drawing.Rectangle $x, $y, $w, $h), 'Pixel')
  $bmp.Save("$outDir\$name.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Crop 40 20 160 160 'coil' 4.0
Crop 80 150 100 90 'ring' 5.0
Crop 20 10 60 120 'nblock' 5.0
Crop 150 10 80 120 'sblock' 5.0
Crop 60 200 130 46 'base' 5.0
$img.Dispose()
Get-ChildItem $outDir | Select-Object Name, Length

