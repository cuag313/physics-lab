Add-Type -AssemblyName System.Drawing
$b=[System.Drawing.Bitmap]::FromFile((Resolve-Path "audit\fidelity\nb-motor\_ref.png"))
"BASE/BRUSH scan y=196..240 x=80..170 (1px)"
for($y=196;$y -le 240;$y+=2){
  $line=""
  for($x=80;$x -le 170;$x+=1){
    $c=$b.GetPixel($x,$y)
    if($c.R -gt 170 -and $c.G -gt 170 -and $c.B -gt 170){ $ch="#"}
    elseif($c.R -gt 130 -and $c.G -gt 130 -and $c.B -gt 130){ $ch="+"}
    elseif($c.R -gt 85 -and $c.G -gt 85 -and $c.B -gt 85){ $ch="-"}
    elseif($c.R -gt 118 -and $c.G -lt 80){ $ch="R"}
    elseif($c.B -gt 100 -and $c.R -lt 85){ $ch="B"}
    elseif($c.R -gt 45){ $ch="."}
    else{ $ch="@"}
    $line+=$ch
  }
  ("y={0,3} {1}" -f $y,$line)
}
