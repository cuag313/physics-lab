Add-Type -AssemblyName System.Drawing
$tag = $args[0]
if (-not $tag) { $tag = 'n19' }
$ref = [System.Drawing.Image]::FromFile('D:\PythonProject\physics-lab\audit\fidelity\nb-motor\_ref.png')
$mine = [System.Drawing.Image]::FromFile("D:\PythonProject\physics-lab\audit\fidelity\$tag-idle-zoom.png")
# 按机身宽度对齐：NB 机身 212px、我的卡 200 宽里机身 178（截图是 2x）
$bodyMine = 178 * 2          # 356
$sRef = $bodyMine / 212.0    # ≈1.679
$wr = [int](242 * $sRef); $hr = [int](246 * $sRef)
$bmp = New-Object System.Drawing.Bitmap ($wr + $bodyMine + 40), ([math]::Max($hr, 424) + 20)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 246, 248, 250))
$g.InterpolationMode = 'HighQualityBicubic'
$g.DrawImage($ref, (New-Object System.Drawing.Rectangle 10, 10, $wr, $hr), (New-Object System.Drawing.Rectangle 0, 0, 242, 246), 'Pixel')
$g.DrawImage($mine, (New-Object System.Drawing.Rectangle ($wr + 30), 10, 400, 424), (New-Object System.Drawing.Rectangle 0, 0, 400, 424), 'Pixel')
$f = [System.Drawing.Font]::new('Microsoft YaHei', 11)
$g.DrawString('NB 原图', $f, [System.Drawing.Brushes]::DimGray, 12, 2)
$g.DrawString("我的卡 $tag", $f, [System.Drawing.Brushes]::DimGray, ($wr + 32), 2)
$g.Dispose()
$bmp.Save('D:\PythonProject\physics-lab\audit\fidelity\nb-motor\_cmp.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose(); $ref.Dispose(); $mine.Dispose()
"cmp ok ($tag)"
