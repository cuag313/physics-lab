Add-Type -AssemblyName System.Drawing
$src=[System.Drawing.Bitmap]::FromFile((Resolve-Path "audit\fidelity\nb-motor\_ref.png"))
$dst=New-Object System.Drawing.Bitmap 750,280
$g=[System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.DrawImage($src,(New-Object System.Drawing.Rectangle 0,0,750,280),(New-Object System.Drawing.Rectangle 78,205,75,28),[System.Drawing.GraphicsUnit]::Pixel)
$dst.Save((Join-Path (Resolve-Path ".").Path "_base8x.png")); "ok"
