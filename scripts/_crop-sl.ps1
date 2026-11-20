Add-Type -AssemblyName System.Drawing
$src=[System.Drawing.Bitmap]::FromFile((Resolve-Path "audit\fidelity\n25-idle-zoom.png"))
$dst=New-Object System.Drawing.Bitmap 480,360
$g=[System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.DrawImage($src,(New-Object System.Drawing.Rectangle 0,0,480,360),(New-Object System.Drawing.Rectangle 140,10,80,60),[System.Drawing.GraphicsUnit]::Pixel)
$dst.Save((Join-Path (Resolve-Path ".").Path "_slot6x.png")); "ok"
