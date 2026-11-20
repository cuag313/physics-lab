Add-Type -AssemblyName System.Drawing
$b=[System.Drawing.Bitmap]::FromFile((Resolve-Path "audit\fidelity\nb-motor\_ref.png"))
$W=$b.Width; $H=$b.Height
for($y=0;$y -lt $H;$y+=4){
  $rr=@{}; 
  $runs=@()
  $cur=""; $start=0
  for($x=0;$x -lt $W;$x++){
    $c=$b.GetPixel($x,$y)
    $t="."
    if($c.R -gt 140 -and $c.G -lt 80 -and $c.B -lt 80){ $t="R" }
    elseif($c.B -gt 140 -and $c.R -lt 90){ $t="B" }
    elseif($c.R -gt 150 -and $c.G -gt 130 -and $c.B -lt 100){ $t="G" }
    elseif($c.R -gt 120 -and $c.G -gt 120 -and $c.B -gt 120 -and [math]::Abs($c.R-$c.B) -lt 25){ $t="W" }
    elseif($c.R -lt 70 -and $c.G -lt 80 -and $c.B -lt 95){ $t="k" }
    if($t -ne $cur){ if($cur -ne "" -and $x-$start -ge 4 -and $cur -ne "."){ $runs+="$cur$start-$($x-1)" }; $cur=$t; $start=$x }
  }
  if($x-$start -ge 4 -and $cur -ne "."){ $runs+="$cur$start-$($x-1)" }
  ("y={0,3} {1}" -f $y, ($runs -join " "))
}
