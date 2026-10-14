import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * ElectricFieldLineScene — 电场线与电场强度
 *
 * 电场线切线方向 = 电场强度方向，疏密反映场强大小
 * E = F/q（定义式），匀强电场 E = U/d
 *
 * Step1: 点电荷电场 — 正电荷向外发散，负电荷向内汇聚
 * Step2: 电偶极子 — 等量异号电荷电场线从正到负
 * Step3: 平行板电容器 — 匀强电场，E = U/d
 */
export default function ElectricFieldLineScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    chargeType: 'positive', // positive | negative | dipole | parallel
    voltage: 200,           // 平行板电压 V
    plateDist: 150,         // 板间距 px
    records: [],
    // Tab2
    components: [],
    wires: [],
    dragId: null,
    dragOffX: 0, dragOffY: 0,
    connecting: null,
    nextId: 1,
    wireColor: '#F44336',
    _guideOpen: false,
  })

  const [tab, setTab] = useState(1)
  const [, setStep] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvasRef.current._R = R

    const loop = () => { render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    try {
      const ctx = R.ctx, W = R.W, H = R.H
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
      canvasRef.current._clickAreas = []
      canvasRef.current._palAreas = []
      if (S.current.tab === 1) renderDemo(ctx, W, H)
      else renderBuilder(ctx, W, H)
    } catch (e) { console.error('render error:', e) }
  }

  // ================================================================
  //  Tab 1：实验演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current

    // 顶部步骤标签
    const labels = ['① 点电荷电场', '② 电偶极子', '③ 平行板匀强电场']
    const bw = 120, bh = 28, gap = 8
    const totalW = bw * 3 + gap * 2
    const bx0 = (W - totalW) / 2
    for (let i = 0; i < 3; i++) {
      const x = bx0 + i * (bw + gap), y = 10
      ctx.fillStyle = s.step === i + 1 ? '#FF9800' : '#fff'
      ctx.strokeStyle = s.step === i + 1 ? '#E65100' : '#999'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.fill(); ctx.stroke()
      ctx.fillStyle = s.step === i + 1 ? '#fff' : '#555'
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(labels[i], x + bw / 2, y + bh / 2)
      canvasRef.current._clickAreas.push({
        x: x - 3, y: y - 3, w: bw + 6, h: bh + 6,
        onClick: () => {
          S.current.step = i + 1
          S.current.chargeType = i === 0 ? 'positive' : i === 1 ? 'dipole' : 'parallel'
          S.current.records = []
          setStep(i + 1); forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '电场线从正电荷出发终止于无穷远，从无穷远出发终止于负电荷',
      2: '等量异号电荷：电场线从正电荷出发，终止于负电荷',
      3: '平行板间匀强电场：电场线均匀平行，E = U/d',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解电场线的物理意义，掌握 E=F/q 和 E=U/d', W / 2, 70)

    // ─── 电场可视化（主区域）───
    const cx = W * 0.32, cy = H * 0.48
    const maxR = Math.min(W * 0.28, H * 0.32)

    if (s.chargeType === 'positive' || s.chargeType === 'negative') {
      const q = s.chargeType === 'positive' ? 1 : -1
      drawSingleCharge(ctx, cx, cy, maxR, q)
    } else if (s.chargeType === 'dipole') {
      drawDipole(ctx, cx, cy, maxR)
    } else {
      drawParallelPlate(ctx, cx, cy, s)
    }

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s)
  }

  // ─── 单点电荷 ───
  function drawSingleCharge(ctx, cx, cy, maxR, q) {
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 500)

    // 电场线（16 条）
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      const r1 = 28, r2 = maxR
      const x1 = cx + Math.cos(angle) * r1, y1 = cy + Math.sin(angle) * r1
      const x2 = cx + Math.cos(angle) * r2, y2 = cy + Math.sin(angle) * r2

      // 电场线（渐变透明度）
      const grad = ctx.createLinearGradient(
        q > 0 ? x1 : x2, q > 0 ? y1 : y2,
        q > 0 ? x2 : x1, q > 0 ? y2 : y1
      )
      grad.addColorStop(0, `rgba(229,57,53,${0.8 * pulse})`)
      grad.addColorStop(1, 'rgba(229,57,53,0.15)')
      ctx.strokeStyle = grad; ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()

      // 箭头
      const arrowR = q > 0 ? r2 * 0.75 : r1 + (r2 - r1) * 0.25
      const ax = cx + Math.cos(angle) * arrowR
      const ay = cy + Math.sin(angle) * arrowR
      const dir = q > 0 ? 1 : -1
      drawArrowHead(ctx, ax, ay, Math.cos(angle) * dir, Math.sin(angle) * dir, '#E53935')
    }

    // 电荷
    ctx.fillStyle = q > 0 ? '#E53935' : '#1565C0'
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(q > 0 ? '+' : '−', cx, cy)

    // 标注
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(q > 0 ? '正电荷：电场线向外发散' : '负电荷：电场线向内汇聚', cx, cy + maxR + 16)
    ctx.fillStyle = '#E53935'; ctx.font = '11px sans-serif'
    ctx.fillText('箭头方向 = E 方向 = 正电荷受力方向', cx, cy + maxR + 34)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 电偶极子 ───
  function drawDipole(ctx, cx, cy, maxR) {
    const d = maxR * 0.4
    const cx1 = cx - d, cx2 = cx + d

    // 电场线（从正到负，贝塞尔曲线）
    for (let i = 0; i < 12; i++) {
      const startAngle = (i / 12) * Math.PI * 2
      const startX = cx1 + Math.cos(startAngle) * 26
      const startY = cy + Math.sin(startAngle) * 26
      const endX = cx2 - Math.cos(startAngle) * 26
      const endY = cy - Math.sin(startAngle) * 26
      const dist = Math.hypot(endX - startX, endY - startY)
      if (dist > 40) {
        const cpx = (startX + endX) / 2
        const cpy = (startY + endY) / 2 + Math.sin(startAngle) * maxR * 0.4
        ctx.strokeStyle = 'rgba(229,57,53,0.6)'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.quadraticCurveTo(cpx, cpy, endX, endY); ctx.stroke()
        // 中点箭头
        const mx = (startX + 2 * cpx + endX) / 4, my = (startY + 2 * cpy + endY) / 4
        const tx = (endX - startX) * 0.08, ty = (endY - startY) * 0.08 + cpy * 0.05
        drawArrowHead(ctx, mx, my, tx, ty, '#E53935')
      }
    }

    // 外部发散线
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const r1 = 26, r2 = maxR * 0.7
      const x1 = cx1 + Math.cos(angle) * r1, y1 = cy + Math.sin(angle) * r1
      const x2 = cx1 + Math.cos(angle) * r2, y2 = cy + Math.sin(angle) * r2
      const distToNeg = Math.hypot(x2 - cx2, y2 - cy)
      if (distToNeg > 50) {
        ctx.strokeStyle = 'rgba(229,57,53,0.4)'; ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
        drawArrowHead(ctx, x2, y2, Math.cos(angle), Math.sin(angle), 'rgba(229,57,53,0.5)')
      }
    }

    // 电荷
    ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(cx1, cy, 20, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('+', cx1, cy)
    ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(cx2, cy, 20, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText('−', cx2, cy)

    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('等量异号电荷（电偶极子）', cx, cy + maxR * 0.7 + 20)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 平行板电容器 ───
  function drawParallelPlate(ctx, cx, cy, s) {
    const plateW = 22, plateH = 220
    const gap = s.plateDist

    // 正极板
    ctx.fillStyle = '#FFCDD2'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
    ctx.fillRect(cx - gap / 2 - plateW, cy - plateH / 2, plateW, plateH)
    ctx.strokeRect(cx - gap / 2 - plateW, cy - plateH / 2, plateW, plateH)
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('+', cx - gap / 2 - plateW / 2, cy - plateH / 2 - 12)

    // 负极板
    ctx.fillStyle = '#BBDEFB'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
    ctx.fillRect(cx + gap / 2, cy - plateH / 2, plateW, plateH)
    ctx.strokeRect(cx + gap / 2, cy - plateH / 2, plateW, plateH)
    ctx.fillStyle = '#1565C0'; ctx.fillText('−', cx + gap / 2 + plateW / 2, cy - plateH / 2 - 12)

    // 匀强电场线
    const nLines = 9
    for (let i = 0; i < nLines; i++) {
      const y = cy - plateH / 2 + 30 + i * (plateH - 60) / (nLines - 1)
      const x1 = cx - gap / 2 + 12, x2 = cx + gap / 2 - 12
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke()
      drawArrowHead(ctx, x2 - 8, y, 1, 0, '#E53935')
    }

    // 等势线（虚线竖线）
    ctx.strokeStyle = 'rgba(76,175,80,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5])
    for (let i = 1; i <= 4; i++) {
      const x = cx - gap / 2 + i * gap / 5
      ctx.beginPath(); ctx.moveTo(x, cy - plateH / 2 + 20); ctx.lineTo(x, cy + plateH / 2 - 20); ctx.stroke()
    }
    ctx.setLineDash([])

    // 标注
    const lx = cx + gap / 2 + plateW + 15
    ctx.fillStyle = '#4CAF50'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('虚线：等势面', lx, cy - plateH / 2 + 20)
    ctx.fillStyle = '#333'
    ctx.fillText('实线：电场线（均匀平行）', lx, cy - plateH / 2 + 40)
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`E = U/d = ${s.voltage}V / ${(gap / 100).toFixed(2)}m`, lx, cy - plateH / 2 + 60)
    ctx.fillText(`   = ${(s.voltage / (gap / 100)).toFixed(0)} V/m`, lx, cy - plateH / 2 + 78)
    ctx.textBaseline = 'alphabetic'
  }

  function drawArrowHead(ctx, x, y, dx, dy, color) {
    const len = Math.hypot(dx, dy); if (len < 0.01) return
    const nx = dx / len, ny = dy / len
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x + nx * 7, y + ny * 7)
    ctx.lineTo(x - nx * 3 + ny * 4, y - ny * 3 - nx * 4)
    ctx.lineTo(x - nx * 3 - ny * 4, y - ny * 3 + nx * 4)
    ctx.closePath(); ctx.fill()
  }

  // ─── 右侧面板 ───
  function drawRightPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 电场线与电场强度', x + 12, y + 12)

    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('E = F/q  (定义式)', x + 12, y + 32)
    ctx.fillText('E = U/d  (匀强电场)', x + 12, y + 48)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText('电场线切线方向 = E 方向', x + 12, y + 66)
    ctx.fillText('电场线疏密 ∝ 场强大小', x + 12, y + 80)

    let ky = y + 100
    const guideSteps = s.step === 1
      ? ['① 观察正/负电荷电场线', '② 正电荷：电场线向外发散', '③ 负电荷：电场线向内汇聚', '④ 箭头方向 = 正电荷受力方向']
      : s.step === 2
        ? ['① 电场线从正电荷出发', '② 终止于负电荷', '③ 中间疏→密→疏', '④ 两电荷间电场线最密']
        : ['① 观察匀强电场电场线', '② 电场线均匀平行', '③ E = U/d', '④ 等势面⊥电场线']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 电场线是假想的线，实际不存在', '• 电场线不相交（E 方向唯一）', '• 疏密反映场强大小']
      : s.step === 2
        ? ['• 电场线从正到负（方向不可逆）', '• 两电荷间电场叠加增强', '• 中垂线上 E 方向平行于连线']
        : ['• 匀强电场：E 处处相等', '• 平行板边缘电场线弯曲（边缘效应）', '• E=U/d 只适用于匀强电场']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 55, c3 = x + 100
      ctx.fillText('#', c1, ky + 2); ctx.fillText('类型', c2, ky + 2); ctx.fillText('特征', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.type, c2, ky + 1); ctx.fillText(r.feat, c3, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    const btnY = y + h - 38
    const btnW = 62, btnH = 24, gap = 6
    const bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({
      x: bx, y: btnY, w: btnW, h: btnH,
      onClick: () => {
        const s2 = S.current
        const typeMap = { positive: '正电荷', negative: '负电荷', dipole: '偶极子', parallel: '平行板' }
        const featMap = { positive: '向外发散', negative: '向内汇聚', dipole: '正→负', parallel: '匀强平行' }
        s2.records.push({ type: typeMap[s2.chargeType], feat: featMap[s2.chargeType] })
        forceUpdate(n => n + 1)
      }
    })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({
      x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH,
      onClick: () => { S.current.chargeType = 'positive'; S.current.step = 1; S.current.records = []; setStep(1); forceUpdate(n => n + 1) }
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150, palX = W - palW - 10

    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()

    for (const comp of s.components) drawComp(ctx, comp)

    const bx = 22, by = H - 130, bw = palX - 50
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, s._guideOpen ? 118 : 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('📋 操作说明', bx + 10, by + 18)
    ctx.textAlign = 'right'; ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx + bw - 10, by + 18)
    canvasRef.current._clickAreas.push({ x: bx - 5, y: by - 3, w: bw + 10, h: 42, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入电荷到画布', '② 观察电场线分布', '③ 右键删除电荷', '④ 多电荷叠加形成复杂电场'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'

    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)
    const items = [
      { type: 'posCharge', name: '正电荷 +Q' },
      { type: 'negCharge', name: '负电荷 -Q' },
      { type: 'plate', name: '平行板（干扰）' },
      { type: 'wire', name: '导线（干扰）' },
    ]
    const itemH = 30
    for (let i = 0; i < items.length; i++) {
      const iy = y + 32 + i * (itemH + 3)
      if (iy + itemH > y + h - 40) break
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ccc'
      ctx.beginPath(); ctx.roundRect(x + 6, iy, w - 12, itemH, 5); ctx.fill(); ctx.stroke()
      drawPaletteIcon(ctx, x + 18, iy + itemH / 2, items[i].type)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(items[i].name, x + 34, iy + itemH / 2)
      canvasRef.current._palAreas.push({ x: x + 6, y: iy, w: w - 12, h: itemH, type: items[i].type })
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaletteIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'posCharge') { ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0) }
    else if (type === 'negCharge') { ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−', 0, 0) }
    else if (type === 'plate') { ctx.fillStyle = '#BBDEFB'; ctx.strokeStyle = '#1565C0'; ctx.fillRect(-6, -8, 12, 16); ctx.strokeRect(-6, -8, 12, 16) }
    else if (type === 'wire') { ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'posCharge') {
      ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0)
    } else if (comp.type === 'negCharge') {
      ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−', 0, 0)
    } else if (comp.type === 'plate') {
      ctx.fillStyle = '#BBDEFB'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.fillRect(-16, -20, 32, 40); ctx.strokeRect(-16, -20, 32, 40)
    } else if (comp.type === 'wire') {
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke(); ctx.lineCap = 'butt'
    }
    ctx.restore()
  }

  // 交互
  function getPos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) { for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } } return }
    for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } }
    for (const a of canvasRef.current._palAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.type) { s.components.push({ id: s.nextId++, type: a.type, x, y, closed: true, props: {} }); s.dragId = s.nextId - 1; forceUpdate(n => n + 1); return } } }
    for (const c of s.components) { if (Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25) { s.dragId = c.id; s.dragOffX = x - c.x; s.dragOffY = y - c.y; forceUpdate(n => n + 1); return } }
  }
  function handleMouseMove(e) { const s = S.current; const { x, y } = getPos(e); if (s.dragId == null) return; const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) } }
  function handleMouseUp() { S.current.dragId = null }
  function handleDoubleClick() {}
  function handleContextMenu(e) { e.preventDefault(); const s = S.current; const { x, y } = getPos(e); const idx = s.components.findIndex(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25); if (idx >= 0) { s.components.splice(idx, 1); forceUpdate(n => n + 1) } }

  return (
    <SceneShell
      title="电场线与电场强度"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
