from pathlib import Path

p = Path(r"D:\PythonProject\physics-lab\src\lab\scenes\SeriesParallelScene.jsx")
t = p.read_text(encoding="utf-8")

old_nav = """  // ─── 步骤导航 ───
  function drawStepNav(ctx, W, H, s) {
    const navY = H - 36
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const steps = [
      { n: 1, label: '① 单灯泡测电阻' },
      { n: 2, label: '② 串联：电阻变大' },
      { n: 3, label: '③ 并联：电阻变小' },
    ]
    const totalW = 380, startX = (W * 0.55 - totalW) / 2
    steps.forEach((st, i) => {
      const bx = startX + i * 130
      const active = s.step === st.n
      ctx.fillStyle = active ? '#FF9800' : '#e0e0e0'
      ctx.beginPath(); ctx.roundRect(bx, navY, 120, 28, 6); ctx.fill()
      ctx.fillStyle = active ? '#fff' : '#666'
      ctx.font = active ? 'bold 11px sans-serif' : '11px sans-serif'
      ctx.fillText(st.label, bx + 60, navY + 14)
      // 点击热区
      canvasRef.current._clickAreas.push({ x: bx, y: navY, w: 120, h: 28, onClick: () => {
        S.current.step = st.n; S.current.switchClosed = false; setStep(st.n); forceUpdate(n => n + 1)
      }})
    })
    ctx.textBaseline = 'alphabetic'
  }
"""

new_nav = """  // ─── 步骤导航：手机竖排小钮在右侧，电脑底部横排 ───
  function drawStepNav(ctx, W, H, s, layIn) {
    const lay = layIn || fitLayout(W, H)
    const steps = [
      { n: 1, label: '① 单灯泡', short: '①' },
      { n: 2, label: '② 串联', short: '②' },
      { n: 3, label: '③ 并联', short: '③' },
    ]
    if (lay.compact) {
      // 右侧竖排，不占演示区宽度
      const bw = 36, bh = 30, x = W - 42
      let y = H * 0.18
      steps.forEach((st) => {
        const active = s.step === st.n
        ctx.fillStyle = active ? '#FF9800' : '#ffffffcc'
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.fill()
        ctx.strokeStyle = active ? '#E65100' : '#d0d7de'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.stroke()
        ctx.fillStyle = active ? '#fff' : '#555'
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(st.short, x + bw / 2, y + bh / 2)
        canvasRef.current._clickAreas.push({ x, y, w: bw, h: bh, onClick: () => {
          S.current.step = st.n; S.current.switchClosed = false; setStep(st.n); forceUpdate(n => n + 1)
        }})
        y += bh + 8
      })
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      return
    }
    const navY = H - 36
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const totalW = 380, startX = (W * 0.55 - totalW) / 2
    steps.forEach((st, i) => {
      const bx = startX + i * 130
      const active = s.step === st.n
      ctx.fillStyle = active ? '#FF9800' : '#e0e0e0'
      ctx.beginPath(); ctx.roundRect(bx, navY, 120, 28, 6); ctx.fill()
      ctx.fillStyle = active ? '#fff' : '#666'
      ctx.font = active ? 'bold 11px sans-serif' : '11px sans-serif'
      ctx.fillText(st.label, bx + 60, navY + 14)
      canvasRef.current._clickAreas.push({ x: bx, y: navY, w: 120, h: 28, onClick: () => {
        S.current.step = st.n; S.current.switchClosed = false; setStep(st.n); forceUpdate(n => n + 1)
      }})
    })
    ctx.textBaseline = 'alphabetic'
  }
"""

assert old_nav in t
t = t.replace(old_nav, new_nav, 1)

# builder: wider workspace + bottom palette on compact
old_b = """  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 170
    const cvX = 10, cvY = 60, cvW = W - palW - 30, cvH = H - 120
"""
new_b = """  function renderBuilder(ctx, W, H) {
    const s = S.current
    const lay = fitLayout(W, H)
    const palW = 170
    // 手机：操作区加宽，器材改底部横条
    const cvX = lay.compact ? 8 : 10
    const cvY = lay.compact ? 8 : 60
    const palH = lay.compact ? 88 : 0
    const cvW = lay.compact ? W - 16 : W - palW - 30
    const cvH = lay.compact ? H - palH - 16 : H - 120
"""
assert old_b in t
t = t.replace(old_b, new_b, 1)

# remove in-canvas guide bubble when compact (use InfoDock)
old_guide = """    // 操作说明浮动气泡
    const bx = cvX + cvW - 220, by2 = cvY + 10, bw = 210, bh = s._guideExpanded ? 140 : 28
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(bx, by2, bw, bh, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#1976D2'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📖 操作说明', bx + 8, by2 + 7)
    ctx.fillStyle = '#1976D2'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText(s._guideExpanded ? '收起 ▲' : '展开 ▼', bx + bw - 8, by2 + 8)
    canvasRef.current._clickAreas.push({ x: bx, y: by2, w: bw, h: 28, onClick: () => { s._guideExpanded = !s._guideExpanded; forceUpdate(n => n + 1) } })
    if (s._guideExpanded) {
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
      const lines = ['🔌 拖拽器材到画布', '🔵 点击端子开始连线', '🔵 点击另一端子完成连线', '🔄 双击开关切换通断', '🎨 侧栏选导线颜色', '❌ 右键删除器材', '⚡ 连好电路自动求解']
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + 12, by2 + 30 + i * 16)
    }

    const palX = W - palW - 10
"""
new_guide = """    // 操作说明：手机走 InfoDock；桌面保留画布内气泡
    if (!lay.compact) {
    const bx = cvX + cvW - 220, by2 = cvY + 10, bw = 210, bh = s._guideExpanded ? 140 : 28
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(bx, by2, bw, bh, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#1976D2'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📖 操作说明', bx + 8, by2 + 7)
    ctx.fillStyle = '#1976D2'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText(s._guideExpanded ? '收起 ▲' : '展开 ▼', bx + bw - 8, by2 + 8)
    canvasRef.current._clickAreas.push({ x: bx, y: by2, w: bw, h: 28, onClick: () => { s._guideExpanded = !s._guideExpanded; forceUpdate(n => n + 1) } })
    if (s._guideExpanded) {
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
      const lines = ['🔌 拖拽器材到画布', '🔵 点击端子开始连线', '🔵 点击另一端子完成连线', '🔄 双击开关切换通断', '🎨 侧栏选导线颜色', '❌ 右键删除器材', '⚡ 连好电路自动求解']
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + 12, by2 + 30 + i * 16)
    }
    }

    if (lay.compact) {
      // 底部器材条
      const palX = 8, palY = H - palH + 4
      ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.roundRect(palX, palY, W - 16, palH - 8, 8); ctx.fill()
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX, palY, W - 16, palH - 8, 8); ctx.stroke()
      const items = [
        { type: 'battery', name: '电源' },
        { type: 'bulb', name: '灯泡' },
        { type: 'switch', name: '开关' },
        { type: 'resistor', name: '电阻' },
        { type: 'rheostat', name: '变阻' },
        { type: 'ammeter', name: 'A表' },
        { type: 'voltmeter', name: 'V表' },
      ]
      const iw = (W - 28) / items.length
      items.forEach((item, i) => {
        const ix = palX + 8 + i * iw
        const iy = palY + 6
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(ix, iy, iw - 4, 52, 6); ctx.fill()
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(ix, iy, iw - 4, 52, 6); ctx.stroke()
        drawRealisticIcon(ctx, ix + (iw - 4) / 2, iy + 18, item.type)
        ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(item.name, ix + (iw - 4) / 2, iy + 42)
        canvasRef.current._palAreas.push({ x: ix, y: iy, w: iw - 4, h: 52, type: item.type })
      })
      // 导线颜色小点
      const cy = palY + 62
      const colors = ['#F44336', '#FFC107', '#4CAF50']
      colors.forEach((c, i) => {
        const cx = palX + 20 + i * 28
        ctx.fillStyle = c
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill()
        if (s.wireColor === c) {
          ctx.strokeStyle = '#333'; ctx.lineWidth = 2
          ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke()
        }
        canvasRef.current._palAreas.push({ x: cx - 12, y: cy - 12, w: 24, h: 24, action: 'color', color: c })
      })
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      return
    }

    const palX = W - palW - 10
"""
assert old_guide in t
t = t.replace(old_guide, new_guide, 1)

p.write_text(t, encoding="utf-8", newline="\n")
print("patched builder + step nav")
