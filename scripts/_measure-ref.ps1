Add-Type -AssemblyName System.Drawing
$p="audit\fidelity\nb-motor\_ref.png"
$b=[System.Drawing.Bitmap]::FromFile((Resolve-Path $p))
$W=$b.Width; $H=$b.Height
"size=$W x $H"
$red=@(); $blue=@(); $base=@(); $gold=@()
for($y=0;$y -lt $H;$y++){ for($x=0;$x -lt $W;$x++){
  $c=$b.GetPixel($x,$y)
  if($c.R -gt 140 -and $c.G -lt 80 -and $c.B -lt 80){ $red+="$x,$y" }
  elseif($c.B -gt 140 -and $c.R -lt 90 -and $c.G -lt 140){ $blue+="$x,$y" }
  elseif($c.R -gt 150 -and $c.G -gt 130 -and $c.B -lt 90){ $gold+="$x,$y" }
}}
foreach($set in @(@("red",$red),@("blue",$blue),@("gold",$gold))){
  $n=$set[0]; $arr=$set[1]
  if($arr.Count -eq 0){ "$n none"; continue }
  $xs=$arr|%{[int]($_ -split ',')[0]}; $ys=$arr|%{[int]($_ -split ',')[1]}
  "$n cnt=$($arr.Count) x=$($xs|Measure-Object -Minimum -Maximum|%{"$($_.Minimum)..$($_.Maximum)"}) y=$($ys|Measure-Object -Minimum -Maximum|%{"$($_.Minimum)..$($_.Maximum)"})"
}
