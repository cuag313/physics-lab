import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { fitLayout, drawPanel } from '../ui/canvasLayout'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'
// ── 渲染层：Tab1 标准电路符号 ──
import { symBattery, symSwitch, symBulb, symHalf, SYM_INK } from '../render/symbols.js'

/**
 * 器件栏缩略图：直接用器材图纸的 render() 输出，尺寸交给 .bp-ic（40×24）缩放。
 * 好处是器件栏与桌面上的器材永远同源 —— 改图、改柱位、改柱帽颜色都不用再手动同步图标。
 */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  const svg = t.render(
    { id: `pal-${type}`, closed: true, showRead: false, f: 0.4 },
    { bright: 0.55, frac: 0.35, I: 0, f: 0.4 }
  )
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

/**
 * SimpleCircuitScene — 简单电路
 * Tab1: 电路演示 — 矩形回路 + 标准电路符号 + 开关通断
 * Tab2: 自己动手 — 2D/SVG 实物器材（simple3d/BuilderSVG）+ 接线柱连线
 */

export default function SimpleCircuitScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    time: 0,
    wireColor: '#F44336',
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = { canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = { width: canvas.clientWidth, height: canvas.clientHeight }
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvasRef.current._R = R
    const loop = () => { S.current.time += 1 / 60; render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    if (S.current.tab === 1) renderDemo(ctx, W, H)
  }

  // ================================================================
  //  Tab 1：电路演示（矩形回路，标准符号）
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const lay = fitLayout(W, H)

    // ── 电路图坐标系：在 lay.circuit 内居中、适度缩小（教科书电路图观感）──
    const left = lay.circuit.L, right = lay.circuit.R
    const top = lay.circuit.T, bottom = lay.circuit.B - (lay.compact ? 0 : 36)
    const areaW = right - left, areaH = bottom - top
    const loopW = Math.min(areaW * 0.72, 460)
    const scale = Math.max(0.55, Math.min(1.1, loopW / 420))
    const loopH = loopW * 0.52
    const chipUp = 42 * scale, chipDn = 88 * scale
    const x0 = left + (areaW - loopW) / 2
    const y0 = top + Math.max(chipUp + 4, (areaH - (loopH + chipUp + chipDn)) / 2) + chipUp
    const x1 = x0 + loopW, y1 = y0 + loopH
    const midX = x0 + loopW / 2

    // 元件位置：灯泡在上边中点，电源/开关在下边
    const bulbX = midX
    const battX = x0 + loopW * 0.28
    const swX = x0 + loopW * 0.72

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2 * scale + 0.6

    // 符号在导线上占用的半宽（导线据此断开留缺口）
    const hBulb = symHalf('bulb', scale)
    const hBat = symHalf('battery', scale, 2)
    const hSw = symHalf('switch', scale)

    // ─── 导线：横平竖直，符号处留缺口 ───
    // 上边（灯泡）
    drawLine(ctx, x0, y0, bulbX - hBulb, y0, wc, lw)
    drawLine(ctx, bulbX + hBulb, y0, x1, y0, wc, lw)
    // 左右两边
    drawLine(ctx, x0, y0, x0, y1, wc, lw)
    drawLine(ctx, x1, y0, x1, y1, wc, lw)
    // 下边左段：左下角 → 电源正极
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    // 下边中段：电源负极 → 开关左端
    drawLine(ctx, battX + hBat, y1, swX - hSw, y1, wc, lw)
    // 下边右段：开关右端 → 右下角
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)

    // 电流流动（电子方向：从负极出发，经外电路到正极）
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 }, // 电源负极
        { x: swX, y: y1 },
        { x: x1, y: y1 },
        { x: x1, y: y0 },
        { x: bulbX, y: y0 },
        { x: x0, y: y0 },
        { x: x0, y: y1 },
        { x: battX - hBat, y: y1 }, // 回到电源正极
      ]
      drawCurrentFlow(ctx, path, s.time, 0.5)
    }

    // ─── 电路符号（先画辉光再压符号）───
    if (on) {
      const gr = 26 + 16 * scale
      const glow = ctx.createRadialGradient(bulbX, y0, 2, bulbX, y0, gr)
      glow.addColorStop(0, 'rgba(255,235,59,0.32)')
      glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(bulbX, y0, gr, 0, Math.PI * 2); ctx.fill()
    }
    symBulb(ctx, bulbX, y0, { scale, ink: on ? '#B26A00' : ink })
    // 电源：+ 在左（flip），保持「电子自 − 出发」的既有流向语义
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })
    // 开关整块可点（通断）
    canvasRef.current._clickAreas.push({
      x: swX - hSw - 12, y: y1 - 22, w: (hSw + 12) * 2, h: 44,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) }
    })

    // ─── 标注 ───
    const labelFont = Math.max(9, Math.round(11 * scale))
    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, y1 + 26 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 26 * scale)
    ctx.fillText('灯泡', bulbX, y0 - 34 * scale)

    // 电流方向 I（红色短箭头，在电源长竖线左边电线上，向左）
    if (on) {
      const arrowY = y1 - 13 * scale
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2.2 * scale; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(battX - hBat - 6, arrowY); ctx.lineTo(x0 + 34 * scale, arrowY); ctx.stroke(); ctx.lineCap = 'butt'
      ctx.fillStyle = '#E53935'
      ctx.beginPath(); ctx.moveTo(x0 + 34 * scale, arrowY)
      ctx.lineTo(x0 + 44 * scale, arrowY - 5 * scale); ctx.lineTo(x0 + 44 * scale, arrowY + 5 * scale); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#E53935'; ctx.font = `bold ${labelFont + 1}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('电流 I', (battX - hBat - 6 + x0 + 34 * scale) / 2, arrowY - 5 * scale)
      ctx.textBaseline = 'alphabetic'

      if (!lay.compact) {
        // 电子方向标记（黄色，与电子流动颜色一致）
        ctx.fillStyle = '#B8860B'; ctx.font = `${labelFont}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText('e⁻→', (battX + hBat + swX) / 2, y1 - 8 * scale)
        ctx.fillText('e⁻→', (swX + x1) / 2, y1 - 8 * scale)
        ctx.fillText('e⁻↑', x1 + 9 * scale, (y0 + y1) / 2)
        ctx.fillText('←e⁻', bulbX, y0 + 9 * scale)
        ctx.fillText('e⁻↓', x0 - 13 * scale, (y0 + y1) / 2)

        ctx.fillStyle = '#B8860B'; ctx.font = `${labelFont + 1}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText('电子方向：−极 → +极（黄色标记）', midX, y1 + 50 * scale)
        ctx.fillStyle = '#E53935'
        ctx.fillText('电流 I：+极 → −极（红色箭头，与电子方向相反）', midX, y1 + 68 * scale)
      }
    }

    // ─── 说明/读数面板（fitLayout）───
    const ro = lay.readout
    const inner = drawPanel(ctx, ro, lay.compact ? null : '📖 简单电路知识')
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let ky = inner.y
    const px = inner.x

    if (lay.compact) {
      // 手机：紧凑读数
      const Ub = on ? (s.U ?? 6) : 0
      ctx.font = `bold ${lay.font.data}px monospace`
      ctx.fillStyle = '#333'
      ctx.fillText(`U = ${Ub.toFixed(2)} V`, px, ky); ky += 18
      ctx.fillText(`I = ${on ? '通' : '0'} ${on ? '' : 'A'}`, px, ky); ky += 18
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路 U=0', px, ky); ky += 16
      ctx.fillStyle = '#888'
      ctx.font = `${lay.font.body}px sans-serif`
      ctx.fillText('开关常开，点开关通断', px, ky)
      ctx.textBaseline = 'alphabetic'
      return
    }

    ctx.font = '12px sans-serif'
    const knowledge = [
      { t: '电路组成', bold: true },
      { t: '电源、导线、用电器、开关' },
      { t: '' },
      { t: '电路状态', bold: true },
      { t: '通路：开关闭合，电路有电流' },
      { t: '断路：开关断开，无电流 U=0' },
      { t: '短路：导线直接连电源两极（危险！）' },
      { t: '' },
      { t: '电流方向', bold: true },
      { t: '电子从−极出发，经外电路回到+极' },
      { t: '电流方向与电子方向相反' },
      { t: '' },
      { t: '电路符号', bold: true },
      { t: '电源：长线(+)短线(−)' },
      { t: '灯泡：小圆圈内画×' },
      { t: '开关：断开/闭合两状态' },
      { t: '' },
      { t: '灯泡亮度', bold: true },
      { t: '闭合=亮，断开=灭（连续渐变）' },
    ]
    for (const item of knowledge) {
      if (!item.t) { ky += 6; continue }
      ctx.fillStyle = item.bold ? '#333' : '#555'
      ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
      ctx.fillText(item.t, px, ky); ky += 20
    }
    if (on) {
      ky += 8
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px monospace'
      ctx.fillText(`灯泡端电压 U = ${(s.U ?? 6).toFixed(2)} V`, px, ky)
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawLine(ctx, x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  function drawCurrentFlow(ctx, points, time, speed) {
    let totalLen = 0; const segs = []
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y
      const len = Math.sqrt(dx * dx + dy * dy)
      segs.push({ ...points[i], ex: points[i + 1].x, ey: points[i + 1].y, len }); totalLen += len
    }
    ctx.fillStyle = '#FFEB3B'
    const n = Math.max(5, Math.floor(totalLen / 45))
    for (let d = 0; d < n; d++) {
      let pos = ((time * speed * 100 + d * (totalLen / n)) % totalLen)
      for (const seg of segs) {
        if (pos <= seg.len) {
          const r = pos / seg.len
          ctx.beginPath(); ctx.arc(seg.x + (seg.ex - seg.x) * r, seg.y + (seg.ey - seg.y) * r, 3, 0, Math.PI * 2); ctx.fill()
          break
        }
        pos -= seg.len
      }
    }
  }

  // ================================================================
  //  交互（Tab1 点击开关；Tab2 交互在 Builder3D 内部）
  // ================================================================
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const { x, y } = getPos(e)
    if (S.current.tab !== 1) return
    for (const a of canvasRef.current._clickAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return }
    }
  }, [])

  const handleReset = useCallback(() => {
    S.current.switchClosed = false
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => {
    builderRef.current?.add(type)
  }, [])

  const handleDropFromPalette = useCallback((type, clientX, clientY) => {
    builderRef.current?.addAt(type, clientX, clientY)
  }, [])

  const handlePickColor = useCallback((color) => {
    S.current.wireColor = color
    forceUpdate(v => v + 1)
  }, [])

  return (
    <SceneShell
      title="简单电路"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>简单电路</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            电路演示：矩形回路 · 点击开关 · 标准符号 · 电子方向
          </span>
        </>
      ) : null}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%' }}>
        <canvas
          ref={canvasRef}
          className="canvas-fill"
          style={{ width: '100%', flex: 1, minHeight: 0, display: tab === 1 ? 'block' : 'none', touchAction: 'none' }}
          onMouseDown={handleMouseDown}
        />
        {tab === 2 && (
          <BuilderSVG ref={builderRef} wireColor={S.current.wireColor} />
        )}
        {tab === 1 ? (
          <InfoDock
            purpose="认识简单电路的组成与通路/断路状态。"
            steps={[
              '观察矩形回路：电源、开关、灯泡、导线',
              '点击开关，看灯泡亮/灭',
              '对照右侧知识：通路 / 断路 / 短路',
            ]}
            hint="开关常开。闭合后灯泡亮，端电压=电源电压；断开 U=0。"
          />
        ) : (
          <InfoDock
            align="left"
            /* 气泡落在画板内的左上角（画板在 scene-main 里 margin 12，所以 26 ≈ 板内 14px），
               不再骑在灰色边条上、也不越出板面 */
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。轻点开关通断，双击电表看读数，双击器材或按 Delete 删除。"
            hintTitle="操作说明"
          />
        )}
        {tab === 2 && (
          <BuilderPalette side="right"
            items={[
              // 图标直接用器材图纸 TYPES.render() 画出来，跟桌面/完整实验室同源，
              // 换图或改柱位后器件栏自动同步（不再是 🔋💡 这种与器材无关的表情符号）
              { type: 'battery', name: '电池组', icon: thumb('battery') },
              { type: 'accumulator', name: '蓄电池', icon: thumb('accumulator') },
              { type: 'bulb', name: '灯泡', icon: thumb('bulb') },
              { type: 'switch', name: '开关', icon: thumb('switch') },
              { type: 'resistor5', name: '电阻', icon: thumb('resistor5') },
              { type: 'rheostat', name: '滑变', icon: thumb('rheostat') },
              { type: 'ammeter', name: '电流表', icon: thumb('ammeter') },
              { type: 'ammeterA', name: '安培表', icon: thumb('ammeterA') },
              { type: 'voltmeter', name: '电压表', icon: thumb('voltmeter') },
            ]}
            wireColor={S.current.wireColor}
            onPickColor={handlePickColor}
            onAdd={handleAddFromPalette}
            onDropAt={handleDropFromPalette}
            hint="点选或拖到桌面加入"
          />
        )}
      </div>
    </SceneShell>
  )
}
