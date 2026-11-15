import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { fitLayout } from '../ui/canvasLayout'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'
import { CFG } from '../engine/electricLab.js'
import { symBattery, symSwitch, symBulb, symRheostat, symMeter, symHalf, SYM_INK } from '../render/symbols.js'

/**
 * PracticeRheostatScene — 练习使用滑动变阻器
 *
 * 版式照「简单电路」模板：
 *   Tab1 📖 电路演示 —— 暖色底 + 标准电路符号回路（滑变限流）+ 右上暖色知识卡片
 *   Tab2 🔧 自己动手 —— 与简单电路同一套 1:1 SVG 器材（同一器材栏 9 件 + 三色导线）+
 *                        一键透视内部结构 + 实验记录表（都在 BuilderSVG 里）
 */

/** 器件栏缩略图：与桌面器材同源（改图/改柱位后自动同步） */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  const svg = t.render(
    { id: `pal-${type}`, closed: true, showRead: false, f: 0.4 },
    { bright: 0.55, frac: 0.35, I: 0, f: 0.4, rays: false }
  )
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

const RHEO_MAX = 20        // 20Ω 2A 滑动变阻器
const BULB_R = CFG.BULB_R  // 5Ω 小灯泡（与简单电路同一颗）

export default function PracticeRheostatScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    time: 0,
    ratio: 1,               // 滑片位置：1 = 阻值最大（右端）
    wireColor: '#F44336',
    dragging: false,
    cardScroll: 0,
    cardDrag: null,
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
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

  function solve() {
    const s = S.current
    const Rr = Math.round(s.ratio * RHEO_MAX * 10) / 10
    const I = s.switchClosed ? CFG.VS.V / (BULB_R + Rr) : 0
    const Urheo = I * Rr
    const Ul = I * BULB_R
    const P = I * I * BULB_R
    return { Rr, I, Urheo, Ul, P, bright: Math.min(1, P / CFG.BULB_RATED) }
  }

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    // 暖色底：与简单电路同一套（浅奶油 → 浅蜜桃）
    const bg = ctx.createLinearGradient(0, 0, W * 0.35, H)
    bg.addColorStop(0, '#FFFCF5'); bg.addColorStop(0.55, '#FDF4E6'); bg.addColorStop(1, '#FBEDD9')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    if (S.current.tab === 1) renderDemo(ctx, W, H)
  }

  // ================================================================
  //  Tab 1：电路演示（符号回路：滑变限流 + 电流表 + 电压表）
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const sol = solve()
    const lay = fitLayout(W, H)

    /* ── 知识卡片：与简单电路同一套几何（顶到场景上沿、右侧让出按钮栏）── */
    const RAIL = 46
    let panel
    if (!lay.compact) {
      const pw = Math.max(360, Math.min(W * (H < 820 ? 0.52 : 0.40), 780))
      panel = { x: W - 16 - RAIL - pw, y: 10, w: pw, h: H - 20 }
      lay.circuit.R = Math.min(lay.circuit.R, panel.x - 20)
    } else {
      const pw = Math.max(196, Math.min(W * 0.3, 330))
      panel = { x: W - 14 - RAIL - pw, y: 12, w: pw, h: 108 }
      lay.circuit.R = Math.min(lay.circuit.R, panel.x - 14)
    }

    const left = lay.circuit.L, right = lay.circuit.R
    const top = lay.circuit.T, bottom = lay.circuit.B - (lay.compact ? 0 : 36)
    const areaW = right - left, areaH = bottom - top

    const scaleOf = (w) => Math.max(0.55, Math.min(1.1, w / 420))
    let loopW = Math.min(areaW * 0.74, 530)
    // 上方要留：电压表（并在滑变上）+ 表标注 + 滑变标注；下方留：电源/开关标注
    const chipUp = 124 * scaleOf(loopW), chipDn = 88 * scaleOf(loopW)
    const room = areaH - (chipUp + chipDn + 8)
    if (room > 60) loopW = Math.min(loopW, room / 0.55)
    const scale = scaleOf(loopW)
    const loopH = loopW * 0.55
    const x0 = left + (areaW - loopW) / 2
    const y0 = top + Math.max(chipUp + 4, (areaH - (loopH + chipUp + chipDn)) / 2) + chipUp
    const x1 = x0 + loopW, y1 = y0 + loopH
    const midX = x0 + loopW / 2, midY = y0 + loopH / 2

    // 元件位置：滑变在上边中点，灯泡在左边中点，电流表在右边中点，电源/开关在下边
    const rheoX = midX
    const bulbY = midY
    const amX = x1
    const battX = x0 + loopW * 0.28
    const swX = x0 + loopW * 0.72

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2 * scale + 0.6

    const hRheo = symHalf('rheostat', scale)
    const hBulb = symHalf('bulb', scale)
    const hBat = symHalf('battery', scale, 2)
    const hSw = symHalf('switch', scale)
    const hMeter = symHalf('meter', scale)

    // ─── 导线（符号处留缺口）───
    drawLine(ctx, x0, y0, rheoX - hRheo, y0, wc, lw)
    drawLine(ctx, rheoX + hRheo, y0, x1, y0, wc, lw)
    drawLine(ctx, x0, y0, x0, bulbY - hBulb, wc, lw)
    drawLine(ctx, x0, bulbY + hBulb, x0, y1, wc, lw)
    drawLine(ctx, x1, y0, x1, midY - hMeter, wc, lw)
    drawLine(ctx, x1, midY + hMeter, x1, y1, wc, lw)
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)

    // 电压表：并在滑动变阻器两端（画在回路外上方；引线从滑变两端各让开一段）
    const volY = y0 - 66 * scale, volR = 13 * scale, vTap = hRheo + 16 * scale
    ctx.save()
    ctx.strokeStyle = on ? '#7CB342' : '#9aa7b1'
    ctx.lineWidth = 1.6 * scale + 0.4
    ctx.beginPath()
    ctx.moveTo(rheoX - vTap, y0); ctx.lineTo(rheoX - vTap, volY); ctx.lineTo(rheoX - volR - 2, volY)
    ctx.moveTo(rheoX + vTap, y0); ctx.lineTo(rheoX + vTap, volY); ctx.lineTo(rheoX + volR + 2, volY)
    ctx.stroke()
    ctx.restore()

    // ─── 符号 ───
    if (on && sol.bright > 0.02) {
      const gr = (26 + 16 * scale) * (0.6 + 0.5 * sol.bright)
      const glow = ctx.createRadialGradient(x0, bulbY, 2, x0, bulbY, gr)
      glow.addColorStop(0, `rgba(255,196,90,${(0.30 * sol.bright).toFixed(3)})`)
      glow.addColorStop(1, 'rgba(255,196,90,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(x0, bulbY, gr, 0, Math.PI * 2); ctx.fill()
    }
    symBulb(ctx, x0, bulbY, { scale, ink: on ? '#B26A00' : ink })
    const geo = symRheostat(ctx, rheoX, y0, { scale, ratio: s.ratio, ink })
    symMeter(ctx, x1, midY, { kind: 'A', scale, ink })
    symMeter(ctx, rheoX, volY, { kind: 'V', scale, ink: on ? '#558B2F' : ink })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    // 电子流动（符号之后画：要能走滑变内部「左端 → 线圈 → 箭头 → 横线 → 右端」）
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 }, { x: swX + hSw, y: y1 }, { x: x1, y: y1 },
        { x: x1, y: midY + hMeter }, { x: x1, y: midY - hMeter },   // 让开电流表
        { x: x1, y: y0 },
        { x: rheoX + geo.half, y: y0 },
        { x: rheoX + geo.W / 2, y: y0 }, { x: rheoX + geo.W / 2, y: geo.topY },  // 进右端柱
        { x: geo.ax, y: geo.topY },                                            // 沿横线到滑片
        { x: geo.ax, y: y0 },                                                  // 顺箭头杆下到线圈
        { x: rheoX - geo.W / 2, y: y0 },                                        // 沿线圈到左端
        { x: rheoX - geo.half, y: y0 },
        { x: x0, y: y0 },
        { x: x0, y: bulbY - hBulb }, { x: x0, y: bulbY + hBulb },               // 让开灯泡
        { x: x0, y: y1 }, { x: battX - hBat, y: y1 },
      ]
      drawCurrentFlow(ctx, path, s.time, 0.5)
    }

    // 开关整块可点
    canvasRef.current._clickAreas.push({
      x: swX - hSw - 12, y: y1 - 22, w: (hSw + 12) * 2, h: 44,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) },
    })
    // 滑片可点 / 可拖（点哪滑到哪）
    const sliderArea = { x: rheoX - hRheo, y: y0 - 26 * scale, w: hRheo * 2, h: 46 * scale }
    canvasRef.current._clickAreas.push({
      ...sliderArea,
      onClick: (mx) => {
        const r = Math.max(0, Math.min(1, (mx - (rheoX - hRheo)) / (hRheo * 2)))
        S.current.ratio = Math.round(r * 20) / 20
        forceUpdate(n => n + 1)
      },
      onDrag: (mx) => {
        const r = Math.max(0, Math.min(1, (mx - (rheoX - hRheo)) / (hRheo * 2)))
        S.current.ratio = Math.round(r * 20) / 20
        forceUpdate(n => n + 1)
      },
    })
    canvasRef.current._sliderArea = sliderArea
    // 调试/验收钩子：把开关与滑变的画布坐标暴露出来，截图脚本可精确点击
    canvasRef.current._dbg = { swX, swY: y1, rheoX, rheoY: y0, hRheo, hSw, scale }

    // ─── 标注（每个标签都错开符号与引线，避免压字）───
    const labelFont = Math.max(9, Math.round(11 * scale))
    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, y1 + 26 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 26 * scale)
    ctx.fillText(`滑动变阻器  R₁ = ${sol.Rr.toFixed(1)} Ω（0～20 Ω）`, rheoX, y0 + 20 * scale)
    ctx.fillText('小灯泡 L', x0, bulbY - 26 * scale)
    ctx.fillText('电流表 A', x1, midY - 26 * scale)
    ctx.fillText('电压表 V（测滑变两端电压）', rheoX, volY - 22 * scale)
    ctx.fillText(`A 表：${sol.I.toFixed(2)} A`, x1, midY + hMeter + 10 * scale)
    // V 表读数放表圈右侧，避开滑变两端向上的引线
    ctx.textAlign = 'left'
    ctx.fillText(`V 表：${sol.Urheo.toFixed(2)} V`, rheoX + volR + 26, volY - 5 * scale)

    // 滑片方向说明：一行、放在滑变下方，不再压在电压表的引线上
    ctx.fillStyle = '#B08954'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('← 滑片左移：接入电阻变小　　·　　滑片右移：接入电阻变大 →', rheoX, y0 + 38 * scale)

    // 电流方向 I（红色短箭头，在左下角电线上，向左）
    if (on) {
      const arrowY = y1 - 13 * scale
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2.2 * scale; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(battX - hBat - 6, arrowY); ctx.lineTo(x0 + 34 * scale, arrowY); ctx.stroke(); ctx.lineCap = 'butt'
      ctx.fillStyle = '#E53935'
      ctx.beginPath(); ctx.moveTo(x0 + 34 * scale, arrowY)
      ctx.lineTo(x0 + 44 * scale, arrowY - 5 * scale); ctx.lineTo(x0 + 44 * scale, arrowY + 5 * scale); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#E53935'; ctx.font = `bold ${labelFont + 1}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('电流 I', (battX - hBat - 6 + x0 + 34 * scale) / 2, arrowY - 5 * scale)
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#B8860B'; ctx.font = `${labelFont}px sans-serif`
      ctx.fillText('e⁻→', (battX + hBat + swX) / 2, y1 - 8 * scale)
      ctx.fillText('←e⁻', rheoX, y0 + 2 * scale)
    }

    // ─── 右上知识卡片（与简单电路同款；紧凑模式只留读数小卡）───
    if (lay.compact) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      let ky = panel.y + 12
      const px = panel.x + 14
      ctx.font = `bold ${lay.font.data}px monospace`; ctx.fillStyle = '#333'
      ctx.fillText(`R₁ = ${sol.Rr.toFixed(1)} Ω`, px, ky); ky += 18
      ctx.fillText(`I = ${sol.I.toFixed(2)} A`, px, ky); ky += 18
      ctx.fillText(`U_R = ${sol.Urheo.toFixed(2)} V`, px, ky); ky += 18
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路', px, ky)
      ctx.textBaseline = 'alphabetic'
      canvasRef.current._cardBox = null
      return
    }

    const cardOut = drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 滑动变阻器知识',
      scroll: s.cardScroll,
      tip: (c, tx, ty) => {
        if (on) {
          c.fillStyle = '#C2410C'
          c.fillText(`● 闭合：R₁ = ${sol.Rr.toFixed(1)} Ω　I = ${sol.I.toFixed(2)} A　U_R = ${sol.Urheo.toFixed(2)} V　U_L = ${sol.Ul.toFixed(2)} V`, tx, ty + 10)
        } else {
          c.fillStyle = '#B08954'
          c.fillText('○ 断开：滑片先移到阻值最大处（最右），再闭合开关（点画面里的开关）', tx, ty + 10)
        }
      },
    })
    canvasRef.current._cardBox = cardOut
      ? { x: panel.x, y: panel.y + 2, w: panel.w, h: cardOut.cardH, maxScroll: cardOut.maxScroll, scroll: cardOut.scroll }
      : null
    ctx.textBaseline = 'alphabetic'
  }

  /* ── 知识卡片内容（7 节，暖色标题；高亮用 color+bold）── */
  const SECTIONS = [
    {
      t: '实验目的', c: '#E0761F',
      items: [
        [['认识滑动变阻器的'], ['四个接线柱', '#C2410C', 1], ['与「'], ['一上一下', '#C2410C', 1], ['」接法。']],
        [['学会用滑动变阻器'], ['改变电路中的电流', '#DC2626', 1], ['（限流），并观察灯泡亮暗变化。']],
        [['养成习惯：闭合开关前把滑片移到'], ['阻值最大处', '#DC2626', 1], ['。']],
      ],
    },
    {
      t: '实验器材', c: '#C98A12',
      items: [
        [['干电池组、开关、'], ['滑动变阻器（20Ω 2A）', '#EA8C1B', 1], ['、小灯泡、'], ['电流表', '#C2410C', 1], ['、'], ['电压表', '#C2410C', 1], ['、导线。']],
      ],
    },
    {
      t: '实验步骤', c: '#CA8A04',
      items: [
        [['① '], ['断开开关', '#DC2626', 1], ['，把滑变「一上一下」串入电路（如接 A、D 两柱）。']],
        [['② 闭合前把滑片移到'], ['阻值最大端', '#DC2626', 1], ['（接 A 柱时滑到最右）。']],
        [['③ '], ['闭合开关', '#15803D', 1], ['，读电流表示数，看灯泡亮度。']],
        [['④ 缓慢移动滑片，记几组 R、I（电压表读滑变两端 U_R）。']],
        [['⑤ '], ['断开开关', '#DC2626', 1], ['，拆线整理器材。']],
      ],
    },
    {
      t: '四接线柱与「一上一下」', c: '#C2410C',
      items: [
        [['上排 C、D，下排 A、B；只有接'], ['一上一下', '#DC2626', 1], ['（如 A、D）滑片才起作用。']],
        [['接 C、D 或 A、B（同排两柱）→ 变阻器被'], ['短路或不起作用', '#DC2626', 1], ['。']],
        [['接 A 柱时滑片越往'], ['右', '#C2410C', 1], ['接入电阻越大；接 B 柱则相反。']],
      ],
    },
    {
      t: '现象与结论', c: '#B45309',
      items: [
        [['R₁ 变大 → '], ['I 变小', '#15803D', 1], [' → 灯泡变暗；R₁ 变小 → I 变大 → 灯泡变亮。']],
        [['滑变两端 U_R 随 R₁ 增大而'], ['增大', '#C2410C', 1], ['，灯泡两端电压随之减小。']],
        [['结论：串联电路中，'], ['改变接入电阻就改变了电流', '#DC2626', 1], ['。']],
      ],
    },
    {
      t: '电表接法', c: '#A15C1C',
      items: [
        [['电流表'], ['串联', '#15803D', 1], ['在回路里，电压表'], ['并联', '#15803D', 1], ['在滑变（或灯泡）两端。']],
        [['电表「'], ['+', '#DC2626', 1], ['」柱接'], ['高电位端', '#DC2626', 1], ['；接反指针反偏、读数带负号。']],
      ],
    },
    {
      t: '注意事项', c: '#DC2626',
      items: [
        [['闭合开关前滑片必须'], ['在阻值最大处', '#DC2626', 1], ['，防止电流过大烧灯。']],
        [['电流不得超过额定 '], ['2 A', '#DC2626', 1], ['；接线时开关必须断开。']],
        [['移动滑片要缓慢，别让灯丝过亮'], ['烧断', '#DC2626', 1], ['。']],
      ],
    },
  ]

  // ================================================================
  //  交互
  // ================================================================
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const { x, y } = getPos(e)
    if (S.current.tab !== 1) return
    const box = canvasRef.current._cardBox
    if (box && box.maxScroll > 0 && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      S.current.cardDrag = { y0: y, s0: S.current.cardScroll }
      return
    }
    for (const a of canvasRef.current._clickAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        S.current.dragging = !!a.onDrag
        a.onClick?.(x)
        return
      }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (S.current.tab !== 1) return
    if (S.current.cardDrag) {
      const { y } = getPos(e)
      const box = canvasRef.current._cardBox
      const b = S.current.cardDrag
      S.current.cardScroll = Math.max(0, Math.min(box?.maxScroll || 0, b.s0 - (y - b.y0)))
      forceUpdate(n => n + 1)
      return
    }
    if (!S.current.dragging) return
    const { x } = getPos(e)
    const a = canvasRef.current._clickAreas.find((k) => k.onDrag)
    a?.onDrag?.(x)
  }, [])

  const handleMouseUp = useCallback(() => {
    S.current.dragging = false
    S.current.cardDrag = null
  }, [])

  const handleWheel = useCallback((e) => {
    const box = canvasRef.current?._cardBox
    if (!box || !box.maxScroll) return
    const { x, y } = getPos(e)
    if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return
    S.current.cardScroll = Math.max(0, Math.min(box.maxScroll, S.current.cardScroll + e.deltaY))
    forceUpdate(n => n + 1)
  }, [])

  const handleReset = useCallback(() => {
    S.current.switchClosed = false
    S.current.ratio = 1
    S.current.cardScroll = 0
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => { builderRef.current?.addAt(type, clientX, clientY) }, [])
  const handlePickColor = useCallback((color) => { S.current.wireColor = color; forceUpdate(v => v + 1) }, [])

  return (
    <SceneShell
      title="练习使用滑动变阻器"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>练习使用滑动变阻器</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            电路演示：滑变限流 · 拖滑片改电阻 · 看 I、U 与灯泡亮度
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
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
        {tab === 2 && (
          <BuilderSVG ref={builderRef} wireColor={S.current.wireColor} />
        )}
        {tab === 1 ? (
          <InfoDock
            purpose="认识滑动变阻器四接线柱与「一上一下」接法，学会用它改变电路电流。"
            steps={[
              '看回路：滑变「一上一下」串在电路中',
              '点开关闭合，先把滑片放在阻值最大处',
              '拖动滑片，看电流表、电压表与灯泡亮度',
            ]}
            hint="滑片右移阻值变大 → 电流变小 → 灯泡变暗。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。滑变要「一上一下」接才起作用；轻点开关通断，双击电表看读数，双击器材或按 Delete 删除。"
            hintTitle="操作说明"
          />
        )}
        {tab === 2 && (
          <BuilderPalette side="right"
            items={[
              // 与「简单电路」完全同一套器材（图标直接用器材图纸）
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

// ─── 画辅助 ───
function drawLine(ctx, x1, y1, x2, y2, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

/** 电子流动（黄点，从负极出发） */
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
