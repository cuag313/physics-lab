Add-Type -AssemblyName System.Drawing
$b=[System.Drawing.Bitmap]::FromFile((Resolve-Path "audit\fidelity\nb-motor\_ref.png"))
{0} -f "x   color-grid  y=168..214 step2, x=95..160"
for($y=166;$y -le 214;$y+=2){
  $line=""
  for($x=95;$x -le 160;$x+=2){
    $c=$b.GetPixel($x,$y)
    $l=[int](($c.R+$c.G+$c.B)/3)
    if($c.R -gt 120 -and $c.G -lt 90 -and $c.B -lt 90){ $ch="R" }
    elseif($c.B -gt 110 -and $c.R -lt 90){ $ch="B" }
    elseif($c.R -gt 200 -and $c.G -gt 195 -and $c.B -gt 195){ $ch="#" }
    elseif($c.R -gt 150 -and $c.G -gt 150 -and $c.B -gt 150){ $ch="+" }
    elseif($c.R -gt 95 -and $c.G -gt 95 -and $c.B -gt 95){ $ch="-" }
    elseif($c.R -gt 55){ $ch="." }
    else { $ch="@" }
    $line+=$ch
  }
  ("y={0,3} {1}" -f $y,$line)
}
