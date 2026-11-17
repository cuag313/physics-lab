$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = 'E:\cuag313\physics-lab\public\assets\iconsnewname'
$dst = 'D:\PythonProject\physics-lab\public\assets\equipment\fig'

function Crop([string]$from, [string]$to, [int]$x, [int]$y, [int]$w, [int]$h) {
  $b = [System.Drawing.Bitmap]::FromFile($from)
  $r = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
  $c = $b.Clone($r, $b.PixelFormat)
  $c.Save((Join-Path $dst $to), [System.Drawing.Imaging.ImageFormat]::Png)
  $c.Dispose(); $b.Dispose()
  "$to <= $x,$y ${w}x${h}"
}

# 机体（去掉图标右侧自带的插头电线，只留家电本体）
Crop (Join-Path $src '电饭煲.png') 'ricecooker_body.png' 0 54 254 146
Crop (Join-Path $src '电暖器.png') 'heater_body.png' 2 26 252 201

# 面板开关两张状态面：左=合（亮翘板），右=断（暗翘板）
Crop (Join-Path $src '按钮_16.png') 'switch_on_face.png'   4 101 100 106
Crop (Join-Path $src '按钮_16.png') 'switch_off_face.png' 108 101 100 106
