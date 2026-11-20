Add-Type -AssemblyName System.Drawing
$b=[System.Drawing.Bitmap]::FromFile((Resolve-Path "audit\fidelity\nb-motor\_ref.png"))
"base.png size: " + ([System.Drawing.Image]::FromFile((Resolve-Path "audit\fidelity\nb-motor\base.png"))).Width
$xs=@(); $ys=@()
for($y=200;$y -le 235;$y++){ for($x=0;$x -lt 242;$x++){
  $c=$b.GetPixel($x,$y)
  if($c.R -gt 165 -and $c.G -gt 165 -and $c.B -gt 165){ $xs+=$x; $ys+=$y }
}}
"brightgray bbox x=$($xs|Measure-Object -Minimum -Maximum|%{"$($_.Minimum)..$($_.Maximum)"}) y=$($ys|Measure-Object -Minimum -Maximum|%{"$($_.Minimum)..$($_.Maximum)"}) n=$($xs.Count)"
# per-row first/last bright gray
for($y=208;$y -le 232;$y+=2){
  $f=-1;$l=-1
  for($x=0;$x -lt 242;$x++){ $c=$b.GetPixel($x,$y); if($c.R -gt 165 -and $c.G -gt 165 -and $c.B -gt 165){ if($f -lt 0){$f=$x}; $l=$x } }
  "y=$y  $f..$l"
}
# plate top: find first row with strong red at x=40
for($y=0;$y -lt 40;$y++){ $c=$b.GetPixel(40,$y); if($c.R -gt 150 -and $c.G -lt 90){ "red plate top y=$y color=$($c.R),$($c.G),$($c.B)"; break } }
# plate bottom at x=40
for($y=200;$y -ge 150;$y--){ $c=$b.GetPixel(40,$y); if($c.R -gt 150 -and $c.G -lt 90){ "red plate bottom y=$y"; break } }
# cavity leftmost dark at y=88
