Add-Type -AssemblyName System.Drawing
$b=[System.Drawing.Bitmap]::FromFile((Resolve-Path "audit\fidelity\nb-motor\_ref.png"))
"post/red-blob scan y=186..236 x=60..200"
for($y=186;$y -le 236;$y+=2){
  $line=""
  for($x=60;$x -le 200;$x+=1){
    $c=$b.GetPixel($x,$y)
    if($c.R -gt 110 -and $c.G -lt 75 -and $c.B -lt 85){ $ch="R"}
    elseif($c.R -lt 62 -and $c.G -lt 62 -and $c.B -lt 70){ $ch="K"}
    elseif($c.B -gt 120 -and $c.R -lt 90){ $ch="B"}
    elseif($c.R -gt 140 -and [math]::Abs($c.R-$c.B) -lt 30 -and [math]::Abs($c.R-$c.G) -lt 30){ $ch="g"}
    elseif($c.R -gt 55){ $ch="."}
    else{ $ch="@"}
    $line+=$ch
  }
  ("y={0,3} {1}" -f $y,$line)
}
