import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * ClosedCircuitOhmScene — 闭合电路欧姆定律
 *
 * 核心公式：I = ε/(R+r)，U = ε - I·r
 *
 * 功能：
 * - 完整电路图（电池+导线+开关+电阻R+电流表A+电压表V）
 * - 开关通断交互
 * - U-I图像（外特性曲线）
 * - 电压分配饼图
 * - 数据记录
 */

export default function ClosedCircuitOhmScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    emf: 12,           // ε 电动势
    internalR: 1,      // r 内阻
    loadR: 5,          // R 外电阻
    closed: true,      // 开关状态
    time: 0,
    records: [],       // [{I, U, R}]
    guideDismissed: false,
    animating: false,  // 电流流动动画
  })

  const [emf, setEmf] = useState(12)
  const [internalR, setInternalR] = useState(1)
  const [loadR, setLoadR] = useState(5)
  const [closed, setClosed] = useState(true)
  const [, forceUpdate] = useState(0)

  const I = closed ? emf / (loadR + internalR) : 0
  const U路 = closed ? emf - I * internalR : emf
  const U内 = closed ? I * internalR : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R
    const loop = () => {
      S.current.time += 1 / 60
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createRenderer(canvas) {
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
    R.resize()
    return R
  }

  function render(R) {
    const ctx = R.ctx; const W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)

    const s = S.current
    const Ival = s.closed ? s.emf / (s.loadR + s.internalR) : 0
    const U路val = s.closed ? s.emf - Ival * s.internalR : s.emf
    const U内val = s.closed ? Ival * s.internalR : 0

    // 左侧：电路图
    drawCircuit(ctx, W * 0.02, 10, W * 0.48, H - 80, s, Ival)

    // 右侧：U-I图像
    drawGraph(ctx, W * 0.52, 10, W * 0.46, H * 0.55, s, Ival, U路val)

    // 右下：电压分配 + 数据
    drawVoltagePanel(ctx, W * 0.52, H * 0.57, W * 0.46, H * 0.38, s, Ival, U路val, U内val)

    // 引导气泡
    if (!s.guideDismissed) drawGuideBubble(ctx, W, H)
  }

  // ========== 电路图 ==========
  function drawCircuit(ctx, x, y, w, h, s, Ival) {
    // 背景
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('🔌 电路图', x + 12, y + 10)

    // 电路布局（矩形回路）
    const cx = x + w / 2, cy = y + h / 2 + 10
    const rw = w * 0.38, rh = h * 0.32 // 回路半宽/半高

    // 关键节点
    const top = { x: cx, y: cy - rh }           // 上方（开关）
    const bot = { x: cx, y: cy + rh }           // 下方（电阻）
    const left = { x: cx - rw, y: cy }          // 左侧（电池负极）
    const right = { x: cx + rw, y: cy }         // 右侧（电阻）

    // 导线（主回路）
    ctx.strokeStyle = s.closed && Ival > 0.01 ? '#1565C0' : '#999'
    ctx.lineWidth = s.closed && Ival > 0.01 ? 3 : 2
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'

    // 左上角（电池负极→开关）
    ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(top.x, top.y); ctx.stroke()
    // 上边（开关→右侧）
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(right.x, right.y); ctx.stroke()
    // 右边（右侧→电阻→下方）
    ctx.beginPath(); ctx.moveTo(right.x, right.y); ctx.lineTo(bot.x, bot.y); ctx.stroke()
    // 下边（下方→电池正极）
    ctx.beginPath(); ctx.moveTo(bot.x, bot.y); ctx.lineTo(left.x, left.y); ctx.stroke()

    // 电流流动动画（小点沿导线移动）
    if (s.closed && Ival > 0.01) {
      const speed = Math.min(Ival * 30, 200) // 电流越大越快
      const t = (s.time * speed) % 400
      const path = [
        { x: left.x, y: left.y },
        { x: top.x, y: top.y },
        { x: right.x, y: right.y },
        { x: bot.x, y: bot.y },
        { x: left.x, y: left.y },
      ]
      // 计算总路径长度
      let totalLen = 0
      const segs = []
      for (let i = 0; i < path.length - 1; i++) {
        const dx = path[i + 1].x - path[i].x, dy = path[i + 1].y - path[i].y
        const len = Math.sqrt(dx * dx + dy * dy)
        segs.push({ sx: path[i].x, sy: path[i].y, ex: path[i + 1].x, ey: path[i + 1].y, len })
        totalLen += len
      }
      // 画流动粒子
      ctx.fillStyle = '#FFEB3B'
      for (let p = 0; p < 4; p++) {
        let pos = ((t + p * 100) % 400) / 400 * totalLen
        for (const seg of segs) {
          if (pos <= seg.len) {
            const ratio = pos / seg.len
            const px = seg.sx + (seg.ex - seg.sx) * ratio
            const py = seg.sy + (seg.ey - seg.sy) * ratio
            ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
            break
          }
          pos -= seg.len
        }
      }
    }

    // ─── 电池 ───
    drawBattery(ctx, left.x, left.y, bot.x, bot.y, s.emf)

    // ─── 开关 ───
    drawSwitch(ctx, top.x, top.y, s.closed, () => {
      S.current.closed = !S.current.closed
      setClosed(S.current.closed)
      S.current.guideDismissed = true
    })

    // ─── 电阻 R ───
    drawResistor(ctx, right.x, right.y, bot.x, bot.y, s.loadR)

    // ─── 电流表 A（在左侧导线上） ───
    const ammeterX = left.x, ammeterY = cy - rh * 0.5
    drawMeter(ctx, ammeterX, ammeterY, 'A', `${Ival.toFixed(2)}A`, '#E53935')

    // ─── 电压表 V（跨电阻两端） ───
    const voltmeterX = cx + rw * 0.6, voltmeterY = cy
    const U路val = s.closed ? s.emf - Ival * s.internalR : s.emf
    drawMeter(ctx, voltmeterX, voltmeterY, 'V', `${U路val.toFixed(1)}V`, '#1565C0')

    // 电压表连接线（虚线）
    ctx.strokeStyle = 'rgba(21,101,192,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(voltmeterX - 12, voltmeterY); ctx.lineTo(right.x, right.y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(voltmeterX - 12, voltmeterY + 20); ctx.lineTo(bot.x, bot.y); ctx.stroke()
    ctx.setLineDash([])

    // 公式
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(`I = ε/(R+r) = ${s.emf}/(${s.loadR}+${s.internalR}) = ${Ival.toFixed(3)} A`, x + 12, y + h - 50)
    ctx.fillText(`U = ε - Ir = ${s.emf} - ${Ival.toFixed(2)}×${s.internalR} = ${U路val.toFixed(2)} V`, x + 12, y + h - 32)
    ctx.textBaseline = 'alphabetic'
  }

  // 电池
  function drawBattery(ctx, x1, y1, x2, y2, emf) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    const ux = dx / len, uy = dy / len
    const nx = -uy, ny = ux

    // 长短线表示正负极
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2
    // 长线（正极）
    ctx.beginPath(); ctx.moveTo(mx + nx * 12, my + ny * 12); ctx.lineTo(mx - nx * 12, my - ny * 12); ctx.stroke()
    // 短线（负极）
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(mx + nx * 6 + ux * 8, my + ny * 6 + uy * 8); ctx.lineTo(mx - nx * 6 + ux * 8, my - ny * 6 + uy * 8); ctx.stroke()

    // +/- 标签
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('+', mx + nx * 20, my + ny * 20)
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', mx - nx * 20, my - ny * 20)

    // ε 值
    ctx.fillStyle = '#E53935'; ctx.font = '11px sans-serif'
    ctx.fillText(`ε=${emf}V`, mx + nx * 32, my + ny * 32)
  }

  // 开关
  function drawSwitch(ctx, x, y, closed, onClick) {
    ctx.save(); ctx.translate(x, y)

    // 基座
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(-15, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(15, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

    // 触片
    ctx.strokeStyle = closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(-15, 0)
    if (closed) ctx.lineTo(15, 0); else ctx.lineTo(10, -18)
    ctx.stroke()

    // 标签
    ctx.fillStyle = closed ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(closed ? 'ON' : 'OFF', 0, 10)

    ctx.restore()

    // 点击区域
    ctx._switchRect = { x: x - 25, y: y - 25, w: 50, h: 50, onClick }
  }

  // 电阻（锯齿形）
  function drawResistor(ctx, x1, y1, x2, y2, R) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    const ux = dx / len, uy = dy / len
    const nx = -uy, ny = ux

    // 锯齿
    ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2; ctx.lineJoin = 'round'
    ctx.beginPath()
    const coils = 8, amp = 8
    const startX = mx + ux * (-len * 0.35), startY = my + uy * (-len * 0.35)
    ctx.moveTo(startX, startY)
    for (let i = 0; i <= coils; i++) {
      const t = i / coils
      const px = mx + ux * (-len * 0.35 + len * 0.7 * t)
      const py = my + uy * (-len * 0.35 + len * 0.7 * t)
      const dir = i % 2 === 0 ? 1 : -1
      ctx.lineTo(px + nx * amp * dir, py + ny * amp * dir)
    }
    ctx.stroke()

    // R 值标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`R=${R}Ω`, mx + nx * 20, my + ny * 20)
  }

  // 仪表（电流表/电压表）
  function drawMeter(ctx, x, y, type, value, color) {
    ctx.save(); ctx.translate(x, y)
    // 圆形表盘
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // 类型
    ctx.fillStyle = color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type, 0, -2)
    // 读数
    ctx.fillStyle = '#333'; ctx.font = '9px monospace'
    ctx.fillText(value, 0, 12)
    ctx.restore()
  }

  // ========== U-I 图像 ==========
  function drawGraph(ctx, x, y, w, h, s, Ival, U路val) {
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📈 U-I 图像（外特性曲线）', x + 12, y + 10)

    const margin = { top: 35, right: 20, bottom: 35, left: 50 }
    const gx = x + margin.left, gy = y + margin.top
    const gw = w - margin.left - margin.right, gh = h - margin.top - margin.bottom

    const iMax = s.emf / s.internalR * 1.1
    const uMax = s.emf * 1.1
    const toX = i => gx + (i / iMax) * gw
    const toY = u => gy + gh - (u / uMax) * gh

    // 坐标轴
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke()

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.font = '10px sans-serif'
    for (let i = 0; i <= 5; i++) {
      const v = iMax * i / 5
      ctx.textAlign = 'center'; ctx.fillStyle = '#888'
      ctx.fillText(v.toFixed(1), toX(v), gy + gh + 14)
      ctx.beginPath(); ctx.moveTo(toX(v), gy); ctx.lineTo(toX(v), gy + gh); ctx.stroke()
    }
    for (let i = 0; i <= 5; i++) {
      const v = uMax * i / 5
      ctx.textAlign = 'right'; ctx.fillStyle = '#888'
      ctx.fillText(v.toFixed(1), gx - 6, toY(v) + 4)
      ctx.beginPath(); ctx.moveTo(gx, toY(v)); ctx.lineTo(gx + gw, toY(v)); ctx.stroke()
    }

    // U = ε - Ir 直线
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(toX(0), toY(s.emf)); ctx.lineTo(toX(s.emf / s.internalR), toY(0)); ctx.stroke()

    // 标注 ε
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`ε = ${s.emf}V`, toX(0) + 6, toY(s.emf) - 6)

    // 短路电流
    ctx.fillStyle = '#FF9800'; ctx.font = '10px sans-serif'
    ctx.fillText(`I短 = ${(s.emf / s.internalR).toFixed(1)}A`, toX(s.emf / s.internalR) - 50, toY(0) + 16)

    // 斜率
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText(`斜率 = -r = -${s.internalR}Ω`, gx + gw - 8, gy + 14)

    // 当前工作点
    if (s.closed && Ival > 0.01) {
      ctx.fillStyle = '#1565C0'
      ctx.beginPath(); ctx.arc(toX(Ival), toY(U路val), 7, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()

      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`(${Ival.toFixed(2)}A, ${U路val.toFixed(2)}V)`, toX(Ival) + 10, toY(U路val) - 4)
    }

    // 记录的数据点
    if (s.records.length > 0) {
      ctx.fillStyle = '#4CAF50'
      for (const rec of s.records) {
        ctx.beginPath(); ctx.arc(toX(rec.I), toY(rec.U), 4, 0, Math.PI * 2); ctx.fill()
      }
    }

    // 轴标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('I (A)', gx + gw / 2, gy + gh + 28)
    ctx.save(); ctx.translate(gx - 38, gy + gh / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('U (V)', 0, 0); ctx.restore()
  }

  // ========== 电压分配面板 ==========
  function drawVoltagePanel(ctx, x, y, w, h, s, Ival, U路val, U内val) {
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.stroke()

    const colW = w * 0.45

    // 左列：电压分配饼图
    const pieX = x + colW / 2, pieY = y + 55, pieR = 35
    const total = s.emf
    const innerAngle = (U内val / total) * Math.PI * 2

    ctx.fillStyle = '#FF9800'
    ctx.beginPath(); ctx.moveTo(pieX, pieY)
    ctx.arc(pieX, pieY, pieR, -Math.PI / 2, -Math.PI / 2 + innerAngle); ctx.fill()

    ctx.fillStyle = '#4CAF50'
    ctx.beginPath(); ctx.moveTo(pieX, pieY)
    ctx.arc(pieX, pieY, pieR, -Math.PI / 2 + innerAngle, -Math.PI / 2 + Math.PI * 2); ctx.fill()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电压分配', pieX, y + 12)

    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#FF9800'; ctx.fillText(`内阻 ${U内val.toFixed(1)}V`, pieX - 35, pieY + pieR + 12)
    ctx.fillStyle = '#4CAF50'; ctx.fillText(`路端 ${U路val.toFixed(1)}V`, pieX + 35, pieY + pieR + 12)

    // 验证公式
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`ε = U路 + U内`, x + 12, pieY + pieR + 35)
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`${s.emf} = ${U路val.toFixed(2)} + ${U内val.toFixed(2)}`, x + 12, pieY + pieR + 52)

    // 右列：参数 + 数据记录按钮
    const rx = x + colW + 10
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('📊 参数', rx, y + 12)

    ctx.font = '11px sans-serif'; ctx.fillStyle = '#555'; let ry = y + 32
    ctx.fillText(`ε = ${s.emf} V`, rx, ry); ry += 18
    ctx.fillText(`r = ${s.internalR} Ω`, rx, ry); ry += 18
    ctx.fillText(`R = ${s.loadR} Ω`, rx, ry); ry += 18
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`I = ${Ival.toFixed(3)} A`, rx, ry); ry += 18
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`U路 = ${U路val.toFixed(2)} V`, rx, ry); ry += 18
    ctx.fillStyle = '#FF9800'
    ctx.fillText(`U内 = ${U内val.toFixed(2)} V`, rx, ry); ry += 25

    // 记录按钮区域
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'
    ctx.fillText(`已记录 ${s.records.length} 组数据`, rx, ry); ry += 4

    ctx.textBaseline = 'alphabetic'
  }

  // ========== 引导气泡 ==========
  function drawGuideBubble(ctx, W, H) {
    const text = '👆 调节滑块改变 ε、r、R，点击开关通断电路'
    ctx.font = '13px sans-serif'
    const tw = ctx.measureText(text).width + 24, th = 32
    const bx = W * 0.3, by = H * 0.45
    const ry = by + Math.sin(Date.now() / 600) * 4
    ctx.fillStyle = 'rgba(79,195,247,0.12)'; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.fill()
    ctx.strokeStyle = 'rgba(79,195,247,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.stroke()
    ctx.fillStyle = '#0288D1'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, bx, ry); ctx.textBaseline = 'alphabetic'
  }

  // 点击检测
  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const r = canvas._R; if (!r) return
    // 坐标转换
    const x = sx, y = sy
    // 检查开关点击
    if (canvas._switchRect) {
      const sr = canvas._switchRect
      if (x >= sr.x && x <= sr.x + sr.w && y >= sr.y && y <= sr.y + sr.h) {
        sr.onClick()
      }
    }
  }, [])

  const handleRecord = useCallback(() => {
    const s = S.current
    const Ival = s.closed ? s.emf / (s.loadR + s.internalR) : 0
    const U路val = s.closed ? s.emf - Ival * s.internalR : s.emf
    s.records.push({ I: Ival, U: U路val, R: s.loadR })
    if (s.records.length > 20) s.records.shift()
    s.guideDismissed = true
    forceUpdate(n => n + 1)
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.emf = 12; s.internalR = 1; s.loadR = 5; s.closed = true; s.records = []
    setEmf(12); setInternalR(1); setLoadR(5); setClosed(true)
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>闭合电路欧姆定律</span>
        <div style={styles.actions}>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <button style={styles.recordBtn} onClick={handleRecord}>◉ 记录数据</button>
          <div style={styles.sep} />
          <label style={styles.lbl}>电动势 ε：<input type="range" min="3" max="24" step="1" value={emf}
            onChange={(e) => { const v = +e.target.value; S.current.emf = v; setEmf(v); S.current.guideDismissed = true }} style={styles.slider} />
            <span style={styles.val}>{emf}V</span></label>
          <label style={styles.lbl}>内阻 r：<input type="range" min="0.1" max="5" step="0.1" value={internalR}
            onChange={(e) => { const v = +e.target.value; S.current.internalR = v; setInternalR(v) }} style={styles.slider} />
            <span style={styles.val}>{internalR.toFixed(1)}Ω</span></label>
          <label style={styles.lbl}>外阻 R：<input type="range" min="0.5" max="50" step="0.5" value={loadR}
            onChange={(e) => { const v = +e.target.value; S.current.loadR = v; setLoadR(v) }} style={styles.slider} />
            <span style={styles.val}>{loadR.toFixed(1)}Ω</span></label>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', cursor: 'pointer' }} onClick={handleClick} />
      </div>
      <div style={styles.desc}>
        <b>闭合电路欧姆定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          点击开关通断 · 调节ε、r、R · 观察U-I图像和电压分配 · I = ε/(R+r) · U = ε - Ir
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lbl: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' },
  slider: { width: 80, accentColor: '#4A90D9' },
  val: { color: '#4A90D9', fontWeight: 600, minWidth: 45, fontSize: 12 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  recordBtn: { background: '#F44336', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ddd' },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
