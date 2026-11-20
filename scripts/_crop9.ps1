Add-Type -AssemblyName System.Drawing
$src=[System.Drawing.Bitmap]::FromFile((Resolve-Path "audit\fidelity\nb-motor\_ref.png"))
function CropZoom($x0,$y0,$w,$h,$z,$out){
  $dst=New-Object System.Drawing.Bitmap ($w*$z),($h*$z)
  $g=[System.Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.DrawImage($src,(New-Object System.Drawing.Rectangle 0,0,($w*$z),($h*$z)),(New-Object System.Drawing.Rectangle $x0,$y0,$w,$h),[System.Drawing.GraphicsUnit]::Pixel)
  $dst.Save((Join-Path (Resolve-Path ".").Path $out))
  $g.Dispose(); $dst.Dispose()
}
CropZoom 92 190 70 48 9 "_base9x.png"
CropZoom 96 160 56 56 9 "_ring9x.png"
"ok"
