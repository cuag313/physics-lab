import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import {
  rr, T, chip, softCard, clamp, line, drawBoard, drawButton,
} from './labArtKit'
import { drawSupply, drawBalance, drawRig, drawChart } from './ampereArt'

/**
 * AmpereForceScene — ⚡ 探究安培力影响因素
 *
 * 版式照「测量电源电动势和内阻 / 多用电表」：双页 Tab1 认识、Tab2 动手。
 * 器材与做法 1:1 对标抖音实验视频（上海中将 数字化实验室）：
 *   · 安培力实验支架（上方角度盘）+ U 形磁铁压在 0.01 g 无线电子天平上
 *   · 可调直流电源 + 电流传感器/电流表；l1/l2/l3 三根单匝导线
 *   · 原理：导线受竖直向上安培力 F，反作用力 F′ 竖直向下压磁铁，
 *     天平读数 m 就代表 F 的大小（m = F/g）
 *   · 三个探究（控制变量）：F–I、F–L、F–sinα；角度 α 是「导线与磁场」的夹角
 *
 * 物理口径：B = 1.0 T（U 形磁铁缝隙），g = 9.8 m/s²，l1/l2/l3 = 1/2/3 cm，
 *           I = 0.20…1.20 A，α = 0…90°，m(g) = B I L sinα / g × 1000。
 *           例：I=1.0 A、L=3 cm、α=90° → F=3.0×10⁻² N → m=3.06 g（与视频 2.93 g 同量级）。
 */

const B = 1.0
const GRAV = 9.8
const LEN = [
  { id: 'l1', cm: 1 },
  { id: 'l2', cm: 2 },
  { id: 'l3', cm: 3 },
]
const I_MIN = 0.2
const I_MAX = 1.2
const BASE = 12.34 // 磁铁 + 支架自重（g）：不置零时天平显示的就是它

const MODES = {
  I: { t: 'F–I', label: '研究电流 I', xLabel: 'I / A', xMax: 1.2, dec: 1, unit: 'A', x: (p) => p.I },
  L: { t: 'F–l', label: '研究长度 l', xLabel: 'l / cm', xMax: 3, dec: 0, unit: 'cm', x: (p) => p.Lcm },
  A: { t: 'F–sinα', label: '研究角度 α', xLabel: 'sin α', xMax: 1, dec: 1, unit: '', x: (p) => Math.sin((p.theta * Math.PI) / 180) },
}

const TASK_DEFS = [
  { id: 'tare', t: '通电前给天平置零', d: '先开天平、点「置零」去皮：把磁铁和支架的自重扣掉，读数才是安培力' },
  { id: 'first', t: '合闸，记录第 1 组', d: '合上电源开关，点「记录这一组」：天平读数是 m(g)，换算 F = mg' },
  { id: 'cur', t: '研究 F–I：改 4 次电流', d: '模式切到「F–I」，转电源旋钮拉开电流，记 4 组以上，点会自动连成直线' },
  { id: 'len', t: '换 l1 / l2 / l3 三根导线', d: '模式切到「F–l」，分别换 1 cm、2 cm、3 cm 的单匝导线各记一组' },
  { id: 'ang', t: '研究 F–sinα：改 4 个角度', d: '模式切到「F–sinα」，拖角度盘改 0°/30°/60°/90°，记 4 组，横轴用 sinα' },
  { id: 'off', t: '断开电源收尾', d: '三个探究都做完，断开开关：天平回零、导线不再受力' },
]

function jitter(seed, amp) {
  const v = ((seed * 9301 + 49297) % 233280) / 233280
  return (v - 0.5) * 2 * amp
}

function fitLine(pts) {
  if (!pts || pts.length < 2) return null
  const n = pts.length
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (const p of pts) {
    sx += p.x
    sy += p.y
    sxx += p.x * p.x
    sxy += p.x * p.y
  }
  const den = n * sxx - sx * sx
  if (Math.abs(den) < 1e-9) return null
  const b = (n * sxy - sx * sy) / den
  const a = (sy - b * sx) / n
  return { a, b }
}

export default function AmpereForceScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const [, forceUpdate] = useState(0)
  const [tab, setTab] = useState(1)

  const S = useRef({
    tab: 1,
    mode: 'I',
    I: 0.8,
    lenIdx: 2,
    theta: 90,
    closed: false,
    tare: false,
    records: [],
    seed: 5,
    learnClosed: true,
    hintText: '',
    drag: null,
    cardScroll: 0,
    cardDrag: null,
    tasks: {},
    seen: {},
  })

  const layout = useCallback((W, H) => {
    const compact = W < 1000 || H < 540
    const RAIL = 44
    const panelW = compact ? 0 : Math.max(306, Math.min(W * 0.285, 420))
    const panel = compact ? null : { x: W - 10 - RAIL - panelW, y: 10, w: panelW, h: H - 20 }
    const stage = { x: 8, y: 8, w: compact ? W - 16 : panel.x - 18, h: H - 16 }
    const ss = Math.max(0.58, Math.min(1.32, Math.min(stage.w / 1000, stage.h / 760)))
    const dw = 1000 * ss
    const dh = 760 * ss
    const ox = stage.x + (stage.w - dw) / 2
    const oy = stage.y + (stage.h - dh) / 2
    return {
      compact, panel, stage, s: ss, ox, oy,
      X: (v) => ox + v * ss,
      Y: (v) => oy + v * ss,
      R: (x, y, w, h) => ({ x: ox + x * ss, y: oy + y * ss, w: w * ss, h: h * ss }),
      V: (v) => v * ss,
    }
  }, [])

  /* ================================================================
   *  物理读数
   * ================================================================ */
  function measure(s) {
    const Lcm = LEN[s.lenIdx].cm
    const L = Lcm / 100
    const th = (s.theta * Math.PI) / 180
    const closed = s.closed
    const F = closed ? B * s.I * L * Math.sin(th) : 0
    const m = (F / GRAV) * 1000
    const reading = s.tare ? m : BASE + m
    return { Lcm, L, theta: s.theta, I: s.I, F, m, reading, closed, tared: s.tare }
  }

  function modePoints(s, mode) {
    const M = MODES[mode]
    const list = s.records.filter((p) => p.mode === mode)
    return list.map((p) => ({ x: M.x(p), y: p.m, p }))
  }

  function modeFit(s, mode) {
    return fitLine(modePoints(s, mode))
  }

  function setMode(s, mode) {
    s.mode = mode
    if (mode === 'I') { s.lenIdx = 2; s.theta = 90 }
    if (mode === 'L') { s.I = 0.8; s.theta = 90 }
    if (mode === 'A') { s.I = 0.8; s.lenIdx = 2 }
    s.hintText = `已切到「${MODES[mode].label}」：其余两个量固定，只改这一个`
  }

  function recordPoint(s) {
    if (!s.tare) return '先点天平上的「置零」去皮，再合闸记录'
    if (!s.closed) return '先合上电源开关，导线通电才有安培力'
    const list = s.records.filter((p) => p.mode === s.mode)
    if (list.length >= 4) return `「${MODES[s.mode].label}」已经记满 4 组，换下一个探究`
    if (s.records.length >= 12) return '数据够多了，先清空或收尾'
    const m = measure(s)
    const dup = list.some((p) => (
      Math.abs(p.I - s.I) < 0.04
      && p.Lcm === m.Lcm
      && Math.abs(Math.sin((p.theta * Math.PI) / 180) - Math.sin((m.theta * Math.PI) / 180)) < 0.03
    ))
    if (dup) return '这一组和刚才的点几乎重合，把变量改一改再记'
    s.seed += 1
    s.records.push({
      mode: s.mode,
      I: s.I,
      Lcm: m.Lcm,
      theta: s.theta,
      m: Math.round((m.m + jitter(s.seed, 0.003)) * 100) / 100,
    })
    return null
  }

  /* ================================================================
   *  绘制入口
   * ================================================================ */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = { canvas, ctx: canvas.getContext('2d'), W: 0, H: 0 }
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio
      canvas.height = canvas.clientHeight * devicePixelRatio
      R.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      R.W = canvas.clientWidth
      R.H = canvas.clientHeight
    }
    resize()
    canvas._R = R
    window.addEventListener('resize', resize)
    const loop = () => {
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function render(R) {
    const ctx = R.ctx
    const { W, H } = R
    if (!W || !H) return
    ctx.clearRect(0, 0, W, H)
    const bg = ctx.createLinearGradient(0, 0, W * 0.3, H)
    bg.addColorStop(0, '#F7FAF6')
    bg.addColorStop(0.55, '#EEF3ED')
    bg.addColorStop(1, '#E6EDE5')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    const glow = ctx.createRadialGradient(W * 0.28, H * 0.3, 20, W * 0.28, H * 0.3, Math.max(W, H) * 0.75)
    glow.addColorStop(0, 'rgba(255,255,255,0.62)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    R._hits = []
    R._cardBox = null
    const lay = layout(W, H)
    if (S.current.tab === 1) renderLearn(ctx, R, lay)
    else renderPractice(ctx, R, lay)
    R.canvas._hits = R._hits
    R.canvas._cardBox = R._cardBox
    R.canvas._st = S.current
  }

  /* ================================================================
   *  Tab 1：认识这套装置（器材 → 原理 → 为什么单匝 → 三个探究 → 操作）
   * ================================================================ */
  function renderLearn(ctx, R, lay) {
    const s = S.current
    const k = lay.s

    ctx.save()
    ctx.translate(lay.ox, lay.oy)
    ctx.scale(k, k)

    /* ---------- ① 器材与装置 ---------- */
    const c1 = { x: 16, y: 16, w: 600, h: 330 }
    softCard(ctx, c1.x, c1.y, c1.w, c1.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '① 这套器材（视频同款）', c1.x + 18, c1.y + 26, { size: 12.5, bold: true, color: '#25313A' })
    chip(ctx, c1.x + c1.w - 118, c1.y + 12, 106, 22, '0.01 g 天平', '#1E6B3B', 1)

    const badge = (n, bx, by) => {
      ctx.fillStyle = '#1E6B3B'
      ctx.beginPath()
      ctx.arc(bx, by, 8, 0, Math.PI * 2)
      ctx.fill()
      T(ctx, String(n), bx, by, { size: 8.4, color: '#fff', align: 'center', bold: true })
    }

    // ① 可调直流电源（简化实物）
    const sp = { x: c1.x + 18, y: c1.y + 44, w: 128, h: 110 }
    ctx.fillStyle = '#E9EEF2'
    rr(ctx, sp.x, sp.y, sp.w, sp.h, 8)
    ctx.fill()
    ctx.strokeStyle = '#B7C5CE'
    ctx.lineWidth = 1
    rr(ctx, sp.x, sp.y, sp.w, sp.h, 8)
    ctx.stroke()
    ctx.fillStyle = '#FBFDFE'
    rr(ctx, sp.x + 10, sp.y + 10, sp.w - 20, sp.h - 20, 6)
    ctx.fill()
    ctx.fillStyle = '#0C2A22'
    rr(ctx, sp.x + 18, sp.y + 16, sp.w - 36, 30, 4)
    ctx.fill()
    T(ctx, '0.45 A', sp.x + sp.w - 24, sp.y + 31, { size: 12, color: '#7BF3A6', align: 'right', mono: true, bold: true })
    ctx.fillStyle = '#DCE4E9'
    ctx.beginPath()
    ctx.arc(sp.x + 38, sp.y + 78, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#8C9BA6'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(sp.x + 38, sp.y + 78)
    ctx.lineTo(sp.x + 38, sp.y + 64)
    ctx.stroke()
    ctx.fillStyle = '#2E9E5B'
    rr(ctx, sp.x + 78, sp.y + 62, 32, 26, 4)
    ctx.fill()
    T(ctx, 'ON', sp.x + 94, sp.y + 75, { size: 7.6, color: '#fff', align: 'center', bold: true })
    badge(1, sp.x - 8, sp.y - 6)
    T(ctx, '① 可调直流电源', c1.x + 18, c1.y + 172, { size: 8.8, color: '#4B5A66' })

    // ⑤ 三根单匝导线
    for (let i = 0; i < 3; i++) {
      const bx = c1.x + 22 + i * 42
      const wy = c1.y + 190 + i * 0
      ctx.strokeStyle = '#C0763C'
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.moveTo(bx, wy)
      ctx.lineTo(bx, wy + 24)
      ctx.lineTo(bx + 26, wy + 24)
      ctx.lineTo(bx + 26, wy)
      ctx.closePath()
      ctx.stroke()
      T(ctx, `${LEN[i].id} = ${LEN[i].cm}cm`, bx + 13, wy + 38, { size: 7.8, color: '#8A5A2B', align: 'center' })
    }
    badge(5, c1.x + 12, c1.y + 198)
    T(ctx, '⑤ 单匝导线（三根换长度）', c1.x + 18, c1.y + 244, { size: 8.8, color: '#4B5A66' })

    // ②③ 支架 + 角度盘 + U 形磁铁
    const cx0 = c1.x + 268
    const top0 = c1.y + 44
    ctx.fillStyle = 'rgba(208,226,234,0.62)'
    rr(ctx, cx0 - 74, top0, 148, 10, 4)
    ctx.fill()
    ctx.strokeStyle = '#A9C2CF'
    ctx.lineWidth = 1
    rr(ctx, cx0 - 74, top0, 148, 10, 4)
    ctx.stroke()
    for (const dx of [-70, 70]) {
      ctx.fillStyle = 'rgba(208,226,234,0.5)'
      rr(ctx, cx0 + dx - 3, top0 + 8, 6, 186, 3)
      ctx.fill()
      ctx.strokeStyle = '#A9C2CF'
      rr(ctx, cx0 + dx - 3, top0 + 8, 6, 186, 3)
      ctx.stroke()
    }
    // 角度盘
    const dcy = top0 + 42
    ctx.fillStyle = 'rgba(245,250,252,0.95)'
    ctx.beginPath()
    ctx.arc(cx0, dcy, 24, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#B9CDD8'
    ctx.stroke()
    for (let a = 0; a <= 90; a += 30) {
      const rad = (a * Math.PI) / 180
      T(ctx, String(a), cx0 + Math.cos(rad) * 15, dcy - Math.sin(rad) * 15, { size: 6.4, color: '#7F97A3', align: 'center' })
    }
    line(ctx, cx0, dcy, cx0, dcy - 20, '#C2410C', 1.6)
    // 磁铁（两极一前一后）
    const poleTop0 = c1.y + 160
    ctx.fillStyle = '#2E5C97'
    rr(ctx, cx0 - 46, poleTop0 - 6, 12, 64, 2)
    ctx.fill()
    ctx.fillStyle = '#B02B1F'
    rr(ctx, cx0 + 34, poleTop0 + 6, 12, 64, 2)
    ctx.fill()
    ctx.fillStyle = '#9AA6AE'
    rr(ctx, cx0 - 46, poleTop0 + 66, 92, 8, 2)
    ctx.fill()
    // 磁感线垂直纸面向里 ⊗
    for (const [mx, my] of [[cx0 - 8, poleTop0 + 26], [cx0 + 8, poleTop0 + 26], [cx0 - 8, poleTop0 + 52], [cx0 + 8, poleTop0 + 52]]) {
      ctx.strokeStyle = 'rgba(45,110,185,0.8)'
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.arc(mx, my, 3.4, 0, Math.PI * 2)
      ctx.stroke()
      line(ctx, mx - 2.2, my - 2.2, mx + 2.2, my + 2.2, 'rgba(45,110,185,0.8)', 0.9)
      line(ctx, mx + 2.2, my - 2.2, mx - 2.2, my + 2.2, 'rgba(45,110,185,0.8)', 0.9)
    }
    // 单匝导线
    ctx.strokeStyle = '#C0763C'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(cx0 - 18, c1.y + 132)
    ctx.lineTo(cx0 - 18, c1.y + 196)
    ctx.lineTo(cx0 + 18, c1.y + 196)
    ctx.lineTo(cx0 + 18, c1.y + 132)
    ctx.stroke()
    // 安培力
    line(ctx, cx0, c1.y + 190, cx0, c1.y + 148, '#C62828', 2)
    ctx.fillStyle = '#C62828'
    ctx.beginPath()
    ctx.moveTo(cx0, c1.y + 142)
    ctx.lineTo(cx0 - 4, c1.y + 152)
    ctx.lineTo(cx0 + 4, c1.y + 152)
    ctx.closePath()
    ctx.fill()
    T(ctx, 'F', cx0 + 8, c1.y + 152, { size: 8.4, color: '#B3261E', bold: true })
    badge(2, cx0 - 82, top0 + 4)
    badge(3, cx0 + 52, poleTop0 + 6)
    T(ctx, '② 支架 + 角度盘　③ U 形磁铁', c1.x + 190, c1.y + 318, { size: 8.6, color: '#4B5A66' })

    // ④ 电子天平（磁铁压在秤盘上）
    const panY0 = c1.y + 236
    ctx.fillStyle = '#C9D4DB'
    ctx.beginPath()
    ctx.ellipse(cx0, panY0, 62, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#F4F7F9'
    rr(ctx, cx0 - 110, panY0 + 10, 220, 64, 8)
    ctx.fill()
    ctx.strokeStyle = '#B7C5CE'
    rr(ctx, cx0 - 110, panY0 + 10, 220, 64, 8)
    ctx.stroke()
    ctx.fillStyle = '#0C2A22'
    rr(ctx, cx0 - 52, panY0 + 24, 104, 36, 4)
    ctx.fill()
    T(ctx, '1.38 g', cx0 + 44, panY0 + 42, { size: 12, color: '#7BF3A6', align: 'right', mono: true, bold: true })
    badge(4, cx0 - 122, panY0 + 16)
    T(ctx, '④ 0.01 g 电子天平', c1.x + 392, c1.y + 318, { size: 8.6, color: '#4B5A66' })

    /* ---------- ② 原理 ---------- */
    const c2 = { x: 16, y: 356, w: 600, h: 196 }
    softCard(ctx, c2.x, c2.y, c2.w, c2.h, '#FFFDF8', '#E8DCC8')
    T(ctx, '② 原理：牛顿第三定律把 F「搬到」天平上', c2.x + 18, c2.y + 24, { size: 12, bold: true, color: '#8A5A2B' })

    const demoM = s.learnClosed ? (B * 0.45 * 0.03 / GRAV) * 1000 : 0
    // 左：B 垂直纸面向里（⊗），I 向右 → 左手定则给出 F 竖直向上
    const gx = c2.x + 22
    const gy = c2.y + 104
    const crossB = (mx, my) => {
      ctx.strokeStyle = 'rgba(45,110,185,0.85)'
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.arc(mx, my, 5, 0, Math.PI * 2)
      ctx.stroke()
      line(ctx, mx - 3.3, my - 3.3, mx + 3.3, my + 3.3, 'rgba(45,110,185,0.85)', 1.1)
      line(ctx, mx + 3.3, my - 3.3, mx - 3.3, my + 3.3, 'rgba(45,110,185,0.85)', 1.1)
    }
    for (const [mx, my] of [[gx + 22, gy - 34], [gx + 84, gy - 34], [gx + 22, gy + 30], [gx + 84, gy + 30]]) {
      crossB(mx, my)
    }
    // 单匝导线（水平放置）
    line(ctx, gx + 8, gy, gx + 96, gy, '#C0763C', 4)
    if (s.learnClosed) {
      // I 方向：向右
      ctx.fillStyle = '#E07B39'
      ctx.beginPath()
      ctx.moveTo(gx + 80, gy)
      ctx.lineTo(gx + 68, gy - 5)
      ctx.lineTo(gx + 68, gy + 5)
      ctx.closePath()
      ctx.fill()
      // F 方向：竖直向上
      line(ctx, gx + 52, gy - 4, gx + 52, gy - 48, '#C62828', 2.4)
      ctx.fillStyle = '#C62828'
      ctx.beginPath()
      ctx.moveTo(gx + 52, gy - 56)
      ctx.lineTo(gx + 47, gy - 44)
      ctx.lineTo(gx + 57, gy - 44)
      ctx.closePath()
      ctx.fill()
      T(ctx, 'F = BIL sinα', gx + 62, gy - 52, { size: 9.4, color: '#B3261E', bold: true })
    }
    T(ctx, 'B ⊗', gx + 2, gy - 37, { size: 9, color: '#2D6EB9', bold: true })
    T(ctx, 'I', gx + 74, gy + 16, { size: 9, color: '#C06A2E', bold: true })
    T(ctx, 'B 垂直纸面向里、I 向右 → 左手定则：F 向上', gx + 6, c2.y + 150, {
      size: 8.4, color: '#2D6EB9',
    })

    // 右：磁铁压天平
    const mx = c2.x + 250
    ctx.fillStyle = '#2E5C97'
    rr(ctx, mx, gy - 66, 22, 46, 3)
    ctx.fill()
    ctx.fillStyle = '#B02B1F'
    rr(ctx, mx + 52, gy - 66, 22, 46, 3)
    ctx.fill()
    ctx.fillStyle = '#9AA6AE'
    rr(ctx, mx, gy - 20, 74, 12, 3)
    ctx.fill()
    if (s.learnClosed) {
      line(ctx, mx + 37, gy - 76, mx + 37, gy - 24, '#C62828', 2.2)
      ctx.fillStyle = '#C62828'
      ctx.beginPath()
      ctx.moveTo(mx + 37, gy - 18)
      ctx.lineTo(mx + 32, gy - 30)
      ctx.lineTo(mx + 42, gy - 30)
      ctx.closePath()
      ctx.fill()
      T(ctx, 'F′ 向下压磁铁', mx + 80, gy - 44, { size: 8.4, color: '#B3261E', bold: true })
    }
    ctx.fillStyle = '#E3EAEF'
    ctx.beginPath()
    ctx.ellipse(mx + 37, gy + 4, 54, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    T(ctx, `天平读数 m = ${s.learnClosed ? demoM.toFixed(2) : '0.00'} g`, mx + 37, gy + 26, {
      size: 9, color: '#1E6B3B', align: 'center', bold: true, mono: true,
    })

    T(ctx, 'm 的单位虽是 g，代表的却是安培力：F = mg', c2.x + 18, c2.y + 168, { size: 9.2, color: '#5B7182' })
    T(ctx, 'F = BIL sinα　（α 是导线与磁场的夹角）', c2.x + c2.w - 18, c2.y + 168, {
      size: 9.4, color: '#B3261E', align: 'right', bold: true, mono: true,
    })

    const btn = { x: c2.x + c2.w - 116, y: c2.y + 12, w: 100, h: 22 }
    drawButton(ctx, btn.x, btn.y, btn.w, btn.h, s.learnClosed ? '断电' : '通电演示', '#1E6B3B', true, 1)
    R._hits.push({
      x: lay.X(btn.x), y: lay.Y(btn.y), w: lay.V(btn.w), h: lay.V(btn.h),
      cursor: 'pointer',
      onClick: () => { s.learnClosed = !s.learnClosed; forceUpdate((n) => n + 1) },
    })

    /* ---------- ③ 为什么单匝 + 0.01 g ---------- */
    const c3 = { x: 16, y: 562, w: 600, h: 182 }
    softCard(ctx, c3.x, c3.y, c3.w, c3.h, '#F6FAFF', '#D6E4F2')
    T(ctx, '③ 为什么偏要用单匝导线 + 0.01 g 天平', c3.x + 18, c3.y + 24, { size: 12, bold: true, color: '#0E4B86' })
    T(ctx, '其它公司的做法：多匝线圈', c3.x + 18, c3.y + 52, { size: 10, bold: true, color: '#B3261E' })
    T(ctx, '匝数多 → 安培力大、好测；但线圈是一整块，学生看不见「长度在变」，', c3.x + 18, c3.y + 70, { size: 9.2, color: '#4B5A66' })
    T(ctx, '只能记住 F ∝ n，做不出 F ∝ L 的直观。', c3.x + 18, c3.y + 86, { size: 9.2, color: '#4B5A66' })
    T(ctx, '这个实验的做法：单匝 + 高精度天平', c3.x + 18, c3.y + 112, { size: 10, bold: true, color: '#1E6B3B' })
    T(ctx, '单匝安培力只有零点几克，必须用 0.01 g、可无线上报的电子天平；', c3.x + 18, c3.y + 130, { size: 9.2, color: '#4B5A66' })
    T(ctx, '换来的是：换 l1/l2/l3 时长度变化肉眼可见，F ∝ L 一眼看出来。', c3.x + 18, c3.y + 146, { size: 9.2, color: '#4B5A66' })
    chip(ctx, c3.x + c3.w - 196, c3.y + 118, 180, 24, '取舍：看得见 > 测得大', '#0E4B86', 1)

    /* ---------- 右侧四张卡 ---------- */
    const r1 = { x: 636, y: 16, w: 348, h: 190 }
    softCard(ctx, r1.x, r1.y, r1.w, r1.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '④ 三个探究（控制变量）', r1.x + 14, r1.y + 22, { size: 11.5, bold: true, color: '#25313A' })
    T(ctx, 'Ⅰ  F 与电流 I', r1.x + 14, r1.y + 50, { size: 10, bold: true, color: '#B3261E' })
    T(ctx, '固定 l、α=90°，只改 I → 画 m–I 图', r1.x + 14, r1.y + 66, { size: 9, color: '#5B6B5F' })
    T(ctx, 'Ⅱ  F 与导线长度 l', r1.x + 14, r1.y + 92, { size: 10, bold: true, color: '#1E6B3B' })
    T(ctx, '固定 I、α=90°，换 l1/l2/l3 → 画 m–l 图', r1.x + 14, r1.y + 108, { size: 9, color: '#5B6B5F' })
    T(ctx, 'Ⅲ  F 与夹角 α', r1.x + 14, r1.y + 134, { size: 10, bold: true, color: '#0E4B86' })
    T(ctx, '固定 I、l，改 α = 0/10/20/30/40°', r1.x + 14, r1.y + 150, { size: 9, color: '#5B6B5F' })
    T(ctx, '→ 横轴必须换成 sinα，才是过原点的直线', r1.x + 14, r1.y + 168, { size: 9, color: '#B3261E', bold: true })

    const r2 = { x: 636, y: 216, w: 348, h: 190 }
    softCard(ctx, r2.x, r2.y, r2.w, r2.h, '#FFFDF8', '#E8DCC8')
    T(ctx, '⑤ 三条结论', r2.x + 14, r2.y + 22, { size: 11.5, bold: true, color: '#8A5A2B' })
    T(ctx, 'm ∝ I　→　F ∝ I', r2.x + 14, r2.y + 52, { size: 12.5, bold: true, color: '#B3261E', mono: true })
    T(ctx, '电流翻倍，天平读数翻倍（过原点直线）', r2.x + 14, r2.y + 70, { size: 9, color: '#5B6B5F' })
    T(ctx, 'm ∝ l　→　F ∝ l', r2.x + 14, r2.y + 98, { size: 12.5, bold: true, color: '#1E6B3B', mono: true })
    T(ctx, '3 cm 导线的力是 1 cm 的 3 倍', r2.x + 14, r2.y + 116, { size: 9, color: '#5B6B5F' })
    T(ctx, 'm ∝ sinα　→　F ∝ sinα', r2.x + 14, r2.y + 144, { size: 12.5, bold: true, color: '#0E4B86', mono: true })
    T(ctx, 'α=0 时导线与 B 平行，F=0；α=90° 时最大', r2.x + 14, r2.y + 162, { size: 9, color: '#5B6B5F' })

    const r3 = { x: 636, y: 416, w: 348, h: 160 }
    softCard(ctx, r3.x, r3.y, r3.w, r3.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '⑥ 操作顺序（照视频）', r3.x + 14, r3.y + 22, { size: 11.5, bold: true, color: '#25313A' })
    const ops = [
      '磁铁放在天平秤盘上，导线插进支架',
      '电源—导线—电流表串接，开天平与电源',
      '通电之前一定先给天平「置零」去皮',
      '调电流逐点采集；换 l、改 α 之前先断电',
    ]
    ops.forEach((t, i) => {
      T(ctx, `${i + 1}. ${t}`, r3.x + 14, r3.y + 48 + i * 20, { size: 9, color: '#4B5A66' })
    })

    const r4 = { x: 636, y: 586, w: 348, h: 158 }
    softCard(ctx, r4.x, r4.y, r4.w, r4.h, '#F6FAFF', '#D6E4F2')
    T(ctx, '⑦ 视频里的示例数据', r4.x + 14, r4.y + 22, { size: 11.5, bold: true, color: '#0E4B86' })
    T(ctx, 'I 组：0.45 A→1.29 g，1.01 A→2.93 g', r4.x + 14, r4.y + 48, { size: 9, color: '#4B5A66', mono: true })
    T(ctx, 'l 组：1/2/3 cm → 0.48/0.94/1.31 g', r4.x + 14, r4.y + 68, { size: 9, color: '#4B5A66', mono: true })
    T(ctx, 'α 组：0/10/20/30/40°，sinα 0→0.643', r4.x + 14, r4.y + 88, { size: 9, color: '#4B5A66', mono: true })
    T(ctx, '软件拟合 y = a + bx，斜率 b ≈ 0.998', r4.x + 14, r4.y + 110, { size: 9, color: '#4B5A66', mono: true })
    T(ctx, '相关系数 ≈ 0.999 → 三条都成正比', r4.x + 14, r4.y + 132, { size: 9, color: '#1E6B3B', bold: true })

    ctx.restore()
    const done = evaluateTasks(s)
    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildLearnSections(), {
        title: '📖 认识这套装置',
        scroll: s.cardScroll,
      })
      R._cardBox = out ? { x: lay.panel.x, y: lay.panel.y + 2, w: lay.panel.w, h: out.cardH, maxScroll: out.maxScroll, scroll: out.scroll } : null
    }
    void done
  }

  /* ================================================================
   *  Tab 2：自己动手
   * ================================================================ */
  function renderPractice(ctx, R, lay) {
    const s = S.current
    const k = lay.s
    const m = measure(s)

    ctx.save()
    ctx.translate(lay.ox, lay.oy)
    ctx.scale(k, k)

    drawBoard(ctx, { x: 8, y: 8, w: 984, h: 744 })

    /* ---------- 电源 ---------- */
    const sup = drawSupply(ctx, { x: 24, y: 24, w: 190, h: 190 }, k, { I: s.I, closed: s.closed })
    R._hits.push({
      ...lay.R(sup.switchHit.x, sup.switchHit.y, sup.switchHit.w, sup.switchHit.h),
      cursor: 'pointer',
      onClick: () => {
        s.closed = !s.closed
        s.hintText = s.closed ? '电源接通：注意天平读数开始代表安培力' : '已断电：导线不再受安培力'
        forceUpdate((n) => n + 1)
      },
    })
    R._hits.push({
      ...lay.R(sup.knob.cx - 26, sup.knob.cy - 26, 52, 52),
      cursor: 'ns-resize',
      onDrag: (x, y, dy) => {
        if (s.mode !== 'I') { s.hintText = '切到「F–I」模式才能改电流（控制变量）'; return }
        s.I = clamp(Math.round((s.I - (dy / k) * 0.012) * 50) / 50, I_MIN, I_MAX)
      },
      onClick: () => {
        if (s.mode !== 'I') s.hintText = '切到「F–I」模式才能改电流（控制变量）'
      },
    })

    /* ---------- 单匝导线架 ---------- */
    const rack = { x: 24, y: 240, w: 190, h: 204 }
    softCard(ctx, rack.x, rack.y, rack.w, rack.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '单匝导线（换长度）', rack.x + 12, rack.y + 20, { size: 10.5, bold: true, color: '#25313A' })
    for (let i = 0; i < 3; i++) {
      const active = s.lenIdx === i
      const enabled = s.mode === 'L'
      const bx = rack.x + 14
      const by = rack.y + 36 + i * 54
      ctx.fillStyle = active ? '#FFF6E8' : '#F4F7F9'
      rr(ctx, bx, by, rack.w - 28, 46, 7)
      ctx.fill()
      ctx.strokeStyle = active ? '#E0A25C' : '#DFE7EC'
      ctx.lineWidth = active ? 1.6 : 1
      rr(ctx, bx, by, rack.w - 28, 46, 7)
      ctx.stroke()
      // 线圈示意（宽度随长度变）
      const wPx = 14 + LEN[i].cm * 8
      const cx0 = bx + 34
      ctx.strokeStyle = enabled ? (active ? '#C0763C' : '#A98A6E') : '#C2CBD2'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx0, by + 10)
      ctx.lineTo(cx0, by + 34)
      ctx.lineTo(cx0 + wPx, by + 34)
      ctx.lineTo(cx0 + wPx, by + 10)
      ctx.stroke()
      T(ctx, `${LEN[i].id} = ${LEN[i].cm} cm`, bx + 92, by + 16, {
        size: 9.4, color: enabled ? '#4B5A66' : '#A6B2BA', bold: active,
      })
      T(ctx, active ? '正在使用' : (enabled ? '点击换上' : '先切到 F–l'), bx + 92, by + 32, {
        size: 8, color: active ? '#B9772E' : '#A6B2BA',
      })
      R._hits.push({
        ...lay.R(bx, by, rack.w - 28, 46),
        cursor: enabled ? 'pointer' : 'default',
        onClick: () => {
          if (s.mode !== 'L') {
            s.hintText = '换长度要在「F–l」模式下做（I、α 固定）'
          } else if (s.closed) {
            s.hintText = '先断开电源再换导线：带电换线，导线会被磁铁吸偏'
          } else {
            s.lenIdx = i
            s.hintText = `已换上 ${LEN[i].id}（${LEN[i].cm} cm）`
          }
          forceUpdate((n) => n + 1)
        },
      })
    }

    /* ---------- 天平 + 支架 ---------- */
    const bal = { x: 190, y: 585, w: 300, h: 150 }
    const b = drawBalance(ctx, bal, k, { reading: m.reading, tare: s.tare })
    R._hits.push({
      ...lay.R(b.tare.x, b.tare.y, b.tare.w, b.tare.h),
      cursor: 'pointer',
      onClick: () => {
        if (s.closed) {
          s.hintText = '先断开电源再置零：通电时线圈正被安培力托着，这时置零会把 F 一起清掉'
        } else if (s.tare) {
          s.hintText = '天平已经置零过了，直接合闸读数就行'
        } else {
          s.tare = true
          s.hintText = '天平已置零：读数从现在起就是导线对磁铁的压力（安培力）'
        }
        forceUpdate((n) => n + 1)
      },
    })

    // 电源到顶板接线柱的引线：先画，让角度盘压在线上（线从盘后绕过）
    const lw = Math.max(2, 2.6 * k)
    const TERM_A = { x: 340 - 58, y: 205 }
    const TERM_B = { x: 340 + 58, y: 205 }
    const wire = (x1, y1, runY, x2, y2, col) => {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1, runY - 9)
      ctx.quadraticCurveTo(x1, runY, x1 + 9, runY)
      ctx.lineTo(x2 - 9, runY)
      ctx.quadraticCurveTo(x2, runY, x2, runY - 9)
      ctx.lineTo(x2, y2)
      ctx.strokeStyle = col
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.stroke()
    }
    wire(sup.termPos.x, sup.termPos.y, 230, TERM_A.x, TERM_A.y, '#C0392B')
    wire(sup.termNeg.x, sup.termNeg.y, 252, TERM_B.x, TERM_B.y, '#16232B')

    // 支架 + 磁铁 + 导线
    const rig = drawRig(ctx, {
      cx: 340, topY: 196, panY: 566,
      theta: s.theta, lenCm: LEN[s.lenIdx].cm, closed: s.closed,
    })

    // 角度盘热区（拖动）
    R._hits.push({
      ...lay.R(rig.dial.cx - rig.dial.r - 6, rig.dial.cy - rig.dial.r - 6, (rig.dial.r + 6) * 2, (rig.dial.r + 6) * 2),
      cursor: s.mode === 'A' ? 'grab' : 'default',
      onDrag: (x, y) => {
        if (s.mode !== 'A') { s.hintText = '切到「F–sinα」模式才能改角度（控制变量）'; return }
        if (s.closed) { s.hintText = '先断开电源再转线圈：通电时转盘带着导线一起受力'; return }
        const sx = (x - lay.ox) / k
        const sy = (y - lay.oy) / k
        let ang = (Math.atan2(rig.dial.cy - sy, sx - rig.dial.cx) * 180) / Math.PI
        ang = clamp(ang, 0, 90)
        s.theta = Math.round(ang / 5) * 5
      },
      onClick: () => { if (s.mode !== 'A') s.hintText = '切到「F–sinα」模式才能改角度（控制变量）' },
    })

    /* ---------- 读数卡 ---------- */
    const rd = { x: 620, y: 16, w: 360, h: 116 }
    softCard(ctx, rd.x, rd.y, rd.w, rd.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '⚡ 当前读数', rd.x + 14, rd.y + 20, { size: 11, bold: true, color: '#25313A' })
    chip(ctx, rd.x + 104, rd.y + 8, 84, 24, s.closed ? '已通电' : '断电', s.closed ? '#15803D' : '#8A9AA4', 1)
    chip(ctx, rd.x + 196, rd.y + 8, 100, 24, s.tare ? '天平已置零' : '天平未置零', s.tare ? '#15803D' : '#B3261E', 1)
    T(ctx, `m = ${m.reading.toFixed(2)} g`, rd.x + 14, rd.y + 54, {
      size: 14, color: '#1E6B3B', bold: true, mono: true,
    })
    T(ctx, s.tare ? `F = mg = ${(m.m / 1000 * GRAV).toFixed(4)} N` : 'F = mg（先置零）', rd.x + 180, rd.y + 54, {
      size: s.tare ? 11 : 9.6, color: s.tare ? '#C2410C' : '#8A959C', bold: true, mono: true,
    })
    T(ctx, `I = ${s.I.toFixed(2)} A　l = ${LEN[s.lenIdx].cm} cm　α = ${Math.round(s.theta)}°`, rd.x + 14, rd.y + 80, {
      size: 9.2, color: '#4B5A66', mono: true,
    })
    T(ctx, s.tare ? '读数即安培力对应的质量；画面宽度是投影 l·sinα' : '未置零：显示的是磁铁+支架自重 12.34 g', rd.x + 14, rd.y + rd.h - 12, {
      size: 8.4, color: s.tare ? '#6B7A83' : '#B3261E',
    })

    /* ---------- 图表卡 ---------- */
    const ch = { x: 620, y: 146, w: 360, h: 300 }
    softCard(ctx, ch.x, ch.y, ch.w, ch.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '📈 m–x 图像（m 代表 F）', ch.x + 14, ch.y + 20, { size: 11, bold: true, color: '#25313A' })
    T(ctx, '三个探究各画各的', ch.x + ch.w - 14, ch.y + 20, { size: 8.2, color: '#8A959C', align: 'right' })
    const tabW = (ch.w - 42) / 3
    for (const key of Object.keys(MODES)) {
      const on = s.mode === key
      const bx = ch.x + 14 + Object.keys(MODES).indexOf(key) * (tabW + 7)
      ctx.fillStyle = on ? '#1E6B3B' : '#EEF3F6'
      rr(ctx, bx, ch.y + 34, tabW, 24, 5)
      ctx.fill()
      T(ctx, MODES[key].t, bx + tabW / 2, ch.y + 46, {
        size: 9.4, color: on ? '#fff' : '#5B7182', align: 'center', bold: on,
      })
      R._hits.push({
        ...lay.R(bx, ch.y + 34, tabW, 24),
        cursor: 'pointer',
        onClick: () => {
          if (s.closed) { s.hintText = '先断开电源再换探究：切模式会把导线、角度复位'; forceUpdate((n) => n + 1); return }
          setMode(s, key)
          forceUpdate((n) => n + 1)
        },
      })
    }
    const pts = modePoints(s, s.mode)
    const fit = modeFit(s, s.mode)
    const M = MODES[s.mode]
    drawChart(ctx, { x: ch.x + 4, y: ch.y + 66, w: ch.w - 8, h: 208 }, k, {
      points: pts, fit, xMax: M.xMax, yMax: 4, xLabel: M.xLabel, xUnit: M.unit, xDec: M.dec,
    })
    T(ctx, `「${M.label}」已记 ${pts.length}/4 组`, ch.x + 14, ch.y + ch.h - 10, {
      size: 8.4, color: '#6B7A83',
    })
    if (fit) {
      const concl = s.mode === 'I' ? 'F ∝ I' : s.mode === 'L' ? 'F ∝ l' : 'F ∝ sinα'
      T(ctx, `直线拟合 → ${concl}`, ch.x + ch.w - 14, ch.y + ch.h - 10, {
        size: 8.6, color: '#1E6B3B', align: 'right', bold: true,
      })
    }

    /* ---------- 记录表 ---------- */
    const tb = { x: 620, y: 458, w: 360, h: 150 }
    softCard(ctx, tb.x, tb.y, tb.w, tb.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '📋 记录表', tb.x + 14, tb.y + 18, { size: 10.6, bold: true, color: '#25313A' })
    T(ctx, s.records.length > 5 ? `${s.records.length} 组 · 列最近 5` : `${s.records.length} 组`, tb.x + tb.w - 14, tb.y + 18, { size: 8.4, color: '#6B7A83', align: 'right' })
    const cols = [tb.x + 16, tb.x + 92, tb.x + 152, tb.x + 214]
    const heads = ['I / A', 'l / cm', 'α / °', 'm / g']
    heads.forEach((h, i) => {
      T(ctx, h, cols[i], tb.y + 40, { size: 8.2, color: '#8A959C', bold: true })
    })
    T(ctx, '探究', tb.x + tb.w - 16, tb.y + 40, { size: 8.2, color: '#8A959C', align: 'right', bold: true })
    const rows = s.records.slice(-5)
    if (!rows.length) {
      T(ctx, '通电、置零、点「记录这一组」', tb.x + 16, tb.y + 68, { size: 9, color: '#B9C4CB' })
    }
    rows.forEach((p, i) => {
      const yy = tb.y + 60 + i * 18
      line(ctx, tb.x + 12, yy - 9, tb.x + tb.w - 12, yy - 9, 'rgba(120,150,170,0.16)', 1)
      T(ctx, p.I.toFixed(2), cols[0], yy, { size: 8.6, color: '#4B5A66', mono: true })
      T(ctx, String(p.Lcm), cols[1], yy, { size: 8.6, color: '#4B5A66', mono: true })
      T(ctx, String(p.theta), cols[2], yy, { size: 8.6, color: '#4B5A66', mono: true })
      T(ctx, p.m.toFixed(2), cols[3], yy, { size: 8.6, color: '#1E6B3B', mono: true, bold: true })
      T(ctx, MODES[p.mode].t, tb.x + tb.w - 16, yy, { size: 8, color: '#8A959C', align: 'right' })
    })

    /* ---------- 结果卡 + 按钮 ---------- */
    const rc = { x: 620, y: 618, w: 360, h: 132 }
    softCard(ctx, rc.x, rc.y, rc.w, rc.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '🔍 三条关系', rc.x + 14, rc.y + 20, { size: 10.6, bold: true, color: '#25313A' })
    const fI = modeFit(s, 'I')
    const fL = modeFit(s, 'L')
    const fA = modeFit(s, 'A')
    const lineTxt = (lab, f, ok) => `${lab}  ${f ? (ok ? '✅ 过原点直线' : '⚠ 点太散') : '—'}`
    T(ctx, lineTxt('F ∝ I ', fI, fI && fI.b > 0), rc.x + 14, rc.y + 42, { size: 9, color: fI ? '#1E6B3B' : '#8A959C' })
    T(ctx, lineTxt('F ∝ l ', fL, fL && fL.b > 0), rc.x + 14, rc.y + 58, { size: 9, color: fL ? '#1E6B3B' : '#8A959C' })
    T(ctx, lineTxt('F ∝ sinα', fA, fA && fA.b > 0), rc.x + 14, rc.y + 74, { size: 9, color: fA ? '#1E6B3B' : '#8A959C' })
    T(ctx, s.hintText || '流程：置零 → 合闸 → 三次探究各记 ≥3 组 → 看三条正比', rc.x + 14, rc.y + 90, {
      size: 8.2, color: s.hintText ? '#B3261E' : '#8A959C',
    })

    const bw = (rc.w - 40) / 2
    const by = rc.y + rc.h - 34
    drawButton(ctx, rc.x + 14, by, bw, 26, '📌 记录这一组', '#15803D', s.closed && s.tare, 1)
    drawButton(ctx, rc.x + 26 + bw, by, bw, 26, '🧹 清空数据', '#94A3B8', s.records.length > 0, 1)
    R._hits.push({
      ...lay.R(rc.x + 14, by, bw, 26),
      cursor: 'pointer',
      onClick: () => {
        const err = recordPoint(s)
        s.hintText = err || `已记第 ${s.records.length} 组：m = ${s.records[s.records.length - 1].m.toFixed(2)} g`
        forceUpdate((n) => n + 1)
      },
    })
    R._hits.push({
      ...lay.R(rc.x + 26 + bw, by, bw, 26),
      cursor: 'pointer',
      onClick: () => {
        s.records = []
        s.seed = 5
        s.hintText = ''
        forceUpdate((n) => n + 1)
      },
    })

    // 任务判定
    const done = evaluateTasks(s, { fI, fL, fA })
    let newly = 0
    for (const def of TASK_DEFS) {
      if (!s.tasks[def.id] && done[def.id]) {
        s.tasks[def.id] = true
        newly += 1
      }
    }
    if (newly) setTimeout(() => forceUpdate((n) => n + 1), 0)

    ctx.restore()
    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildTaskSections(s, m, done), {
        title: '🔧 动手任务',
        scroll: s.cardScroll,
        tip: (c2, tx, ty) => {
          c2.fillStyle = '#B08954'
          c2.font = '11.5px "Microsoft YaHei", sans-serif'
          c2.textAlign = 'left'
          c2.textBaseline = 'middle'
          c2.fillText(`m=${m.reading.toFixed(2)} g　I=${s.I.toFixed(2)} A　l=${LEN[s.lenIdx].cm} cm　α=${Math.round(s.theta)}°`, tx, ty + 10)
        },
      })
      R._cardBox = out ? { x: lay.panel.x, y: lay.panel.y + 2, w: lay.panel.w, h: out.cardH, maxScroll: out.maxScroll, scroll: out.scroll } : null
    }
  }

  function evaluateTasks(s, fits = {}) {
    const fI = fits.fI || modeFit(s, 'I')
    const fL = fits.fL || modeFit(s, 'L')
    const fA = fits.fA || modeFit(s, 'A')
    const lens = new Set(s.records.filter((p) => p.mode === 'L').map((p) => p.Lcm))
    const angles = new Set(s.records.filter((p) => p.mode === 'A').map((p) => p.theta))
    const cI = s.records.filter((p) => p.mode === 'I').length
    const cL = s.records.filter((p) => p.mode === 'L').length
    const cA = s.records.filter((p) => p.mode === 'A').length
    return {
      tare: s.tare,
      first: s.records.length >= 1,
      cur: cI >= 4 && !!fI && fI.b > 0,
      len: cL >= 3 && lens.size >= 3,
      ang: cA >= 4 && angles.size >= 4,
      off: !s.closed && cI >= 4 && cL >= 3 && cA >= 4,
    }
  }

  /* ================================================================
   *  知识卡
   * ================================================================ */
  function buildLearnSections() {
    return [
      {
        t: '实验目的', c: '#B3261E',
        items: [
          [['① 安培力与 ', ], ['电流 I', '#0E4B86', 1], [' 的关系；']],
          [['② 与 ', ], ['导线长度 l', '#1E6B3B', 1], [' 的关系；']],
          [['③ 与 ', ], ['导线和磁场夹角 α', '#8A5A2B', 1], [' 的关系。']],
        ],
      },
      {
        t: '为什么天平能测安培力', c: '#8A5A2B',
        items: [
          [['U 形磁铁两极一前一后，磁场方向', ], ['垂直纸面向里 ⊗', '#2D6EB9', 1], ['；电流自左向右时，左手定则给出 F 竖直向上。']],
          [['通电导线在磁场里受竖直向上的 ', ], ['F = BIL sinα', '#B3261E', 1], ['。']],
          [['由牛顿第三定律，导线给磁铁一个等大反向、竖直向下的反作用力 F′。']],
          [['磁铁压在电子天平上，所以 ', ], ['天平读数 m 就代表 F', '#1E6B3B', 1], ['：F = mg。']],
          [['读数单位是 g，但物理意义是力——这是本实验最容易读错的地方。']],
        ],
      },
      {
        t: '单匝 vs 多匝：一个取舍', c: '#0E4B86',
        items: [
          [['多匝线圈：安培力大、好测，但线圈是整体，', ], ['看不见长度变化', '#B3261E', 1], ['。']],
          [['单匝导线：力只有零点几克，', ], ['必须配 0.01 g 电子天平', '#1E6B3B', 1], ['；']],
          [['但换 l1/l2/l3 时长度变化肉眼可见，F ∝ l 直接看出来。']],
        ],
      },
      {
        t: '三个探究怎么控制变量', c: '#1E6B3B',
        items: [
          [['F–I：固定 l、α=90°，只改电流；横轴 I。']],
          [['F–l：固定 I、α=90°，换 1/2/3 cm 导线；横轴 l。']],
          [['F–α：固定 I、l，改 0/10/20/30/40°；横轴必须用 ', ], ['sinα', '#B3261E', 1], ['。']],
          [['软件里自定义公式算 sinα 时，α 的单位是度、正弦函数要弧度——视频特意提醒的坑。']],
        ],
      },
      {
        t: '操作要点', c: '#7A4A22',
        items: [
          [['磁铁放天平秤盘上，导线插入支架；电源—导线—电流表串联。']],
          [['开天平、开电源，', ], ['通电之前先给天平置零（去皮）', '#B3261E', 1], ['。']],
          [['先置零再通电，读数才是纯安培力；忘了置零，读数里混着磁铁自重。']],
          [['通电状态下点「置零」会被拦下——那会把已经出现的 F 一起清零。']],
          [['换导线、改角度都要断电操作，避免导线被磁铁吸偏。']],
        ],
      },
    ]
  }

  function buildTaskSections(s, m, done) {
    return [
      {
        t: `任务 ${TASK_DEFS.filter((d) => done[d.id]).length}/${TASK_DEFS.length}`, c: '#1E6B3B',
        items: TASK_DEFS.map((d) => [
          [done[d.id] ? '✅ ' : '○ ', done[d.id] ? '#15803D' : '#8A959C'],
          [d.t, done[d.id] ? '#15803D' : '#25313A', 1],
        ]),
      },
      {
        t: '当前状态', c: '#0E4B86',
        items: [
          [['模式：', ], [MODES[s.mode].label, '#0E4B86', 1]],
          [['天平：', ], [s.tare ? '已置零' : '未置零（显示 12.34 g 自重）', s.tare ? '#15803D' : '#B3261E', 1]],
          [['电路：', ], [s.closed ? '已通电' : '断开', s.closed ? '#15803D' : '#8A6D3B', 1]],
          [['读数：', ], [`m = ${m.reading.toFixed(2)} g`, '#1E6B3B', 1]],
          [['记录：', ], [`${s.records.length} 组（每个探究最多 4 组）`, '#4B5A66', 1]],
        ],
      },
      {
        t: '记录后怎么读图', c: '#8A5A2B',
        items: [
          [['数据点连成一条过原点的直线（不要连折线）→ 说明成正比。']],
          [['F–α 用角度做横轴会画成曲线；换 ', ], ['sinα', '#B3261E', 1], [' 才变直线。']],
          [['m 的数值虽小（零点几克），仍要读到 0.01 g，误差才压得住。']],
        ],
      },
    ]
  }

  /* ================================================================
   *  鼠标交互
   * ================================================================ */
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const { x, y } = getPos(e)
    const cv = canvasRef.current
    const s = S.current
    const box = cv._cardBox
    if (box && box.maxScroll > 0 && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      s.cardDrag = { y0: y, s0: s.cardScroll }
      return
    }
    for (const a of cv._hits) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        if (a.onDrag) {
          s.drag = { area: a, x0: x, y0: y, moved: false }
          if (a.pickFirstOnDown !== false) a.onDrag(x, y, 0, 0)
          return
        }
        a.onClick?.(x, y)
        return
      }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const { x, y } = getPos(e)
    const s = S.current
    const cv = canvasRef.current
    if (s.cardDrag) {
      const box = cv._cardBox
      s.cardScroll = Math.max(0, Math.min(box?.maxScroll || 0, s.cardDrag.s0 - (y - s.cardDrag.y0)))
      return
    }
    if (s.drag) {
      if (Math.abs(x - s.drag.x0) > 1.5 || Math.abs(y - s.drag.y0) > 1.5) s.drag.moved = true
      s.drag.lastX = x
      s.drag.lastY = y
      s.drag.area.onDrag(x, y, y - s.drag.y0, x - s.drag.x0)
      s.drag.y0 = y
      return
    }
    let hit = null
    for (const a of cv._hits) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { hit = a; break }
    }
    cv.style.cursor = hit ? (hit.cursor || 'pointer') : 'default'
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    if (s.drag && !s.drag.moved && s.drag.area.onClick) {
      s.drag.area.onClick(s.drag.lastX ?? s.drag.x0, s.drag.lastY ?? s.drag.y0)
    } else if (s.drag && s.drag.moved && s.drag.area.onEnd) {
      s.drag.area.onEnd()
    }
    s.drag = null
    s.cardDrag = null
  }, [])

  const handleWheel = useCallback((e) => {
    const box = canvasRef.current?._cardBox
    if (!box || !box.maxScroll) return
    const { x, y } = getPos(e)
    if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return
    S.current.cardScroll = Math.max(0, Math.min(box.maxScroll, S.current.cardScroll + e.deltaY))
  }, [])

  /* ================================================================
   *  React 渲染
   * ================================================================ */
  const s = S.current
  const doneCount = TASK_DEFS.filter((d) => s.tasks[d.id]).length
  const m = measure(s)

  const toolbar = (
    <>
      {tab === 2 && (
        <>
          <button
            type="button"
            onClick={() => {
              s.closed = !s.closed
              s.hintText = s.closed ? '电源接通' : '已断电'
              forceUpdate((n) => n + 1)
            }}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #c9d6e2', background: s.closed ? '#15803D' : '#fff', color: s.closed ? '#fff' : '#33526e', cursor: 'pointer' }}
          >
            {s.closed ? '⏻ 断开电源' : '⏻ 合上电源'}
          </button>
          <button
            type="button"
            onClick={() => { s.tare = true; s.hintText = '天平已置零'; forceUpdate((n) => n + 1) }}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #c9d6e2', background: '#fff', color: '#33526e', cursor: 'pointer' }}
          >
            ⚖ 置零
          </button>
          <button
            type="button"
            onClick={() => {
              const err = recordPoint(s)
              s.hintText = err || `已记第 ${s.records.length} 组`
              forceUpdate((n) => n + 1)
            }}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #c9d6e2', background: '#fff', color: '#33526e', cursor: 'pointer' }}
          >
            📌 记录
          </button>
          <button
            type="button"
            onClick={() => { s.records = []; s.seed = 5; forceUpdate((n) => n + 1) }}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #c9d6e2', background: '#fff', color: '#33526e', cursor: 'pointer' }}
          >
            🧹 清空
          </button>
          <span style={{ fontSize: 12, color: doneCount === TASK_DEFS.length ? '#15803D' : '#8a6d3b', fontWeight: 600 }}>
            任务 {doneCount}/{TASK_DEFS.length}
          </span>
        </>
      )}
      {tab === 1 && (
        <>
          <span style={{ fontSize: 12, color: '#555' }}>视频里的做法：单匝导线 + 0.01 g 电子天平，用天平读数代替安培力</span>
          <span style={{ fontSize: 12, color: '#8a6d3b' }}>B = 1.0 T · g = 9.8</span>
        </>
      )}
    </>
  )

  return (
    <SceneShell
      title="⚡ 探究安培力影响因素"
      tab={tab}
      onTabChange={(t) => {
        S.current.tab = t
        S.current.drag = null
        S.current.cardDrag = null
        setTab(t)
      }}
      tab1Label="📖 实验方法"
      tab2Label="🔧 自己动手"
      onReset={() => {
        S.current = {
          ...S.current, tab,
          mode: 'I', I: 0.8, lenIdx: 2, theta: 90, closed: false, tare: false,
          records: [], seed: 5, learnClosed: true, tasks: {}, seen: {}, cardScroll: 0, hintText: '',
        }
        forceUpdate((n) => n + 1)
      }}
      toolbarExtra={toolbar}
      desc={(
        <>
          <b>探究安培力影响因素</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            天平置零 → 合闸 → 改电流记 4 组 → 换 l1/l2/l3 → 改角度看 sinα → 三条正比关系
          </span>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          className="canvas-fill"
          style={{ width: '100%', flex: 1, minHeight: 0, display: 'block', touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
        <InfoDock
          purpose={tab === 1
            ? '先认全这套器材（支架角度盘、U 形磁铁、单匝导线、0.01 g 天平），再弄清为什么天平读数能代表安培力、为什么偏要用单匝。'
            : '照着视频做三个探究：先置零，再用天平读数 m 代替安培力，分别改电流、换导线长度、改角度，各记 3–4 组看是否成正比。'}
          steps={tab === 2 ? [
            '开天平，点「置零」去皮（不置零读数里混着 12.34 g 自重）',
            '合上电源开关；确认天平读数变成零点几克（= 安培力）',
            '模式「F–I」：转电源旋钮把电流拉开，记 4 组',
            '模式「F–l」：换 l1/l2/l3 各记一组，看 m 随 l 成倍变化',
            '模式「F–sinα」：拖角度盘 0/30/60/90°，记 4 组',
            '断开电源收尾：天平回零，任务全部打勾',
          ] : [
            '① 器材：支架（带角度盘）、U 形磁铁、单匝导线 l1/l2/l3、可调电源、0.01 g 电子天平、电流传感器',
            '② 原理：导线受向上 F，磁铁受向下 F′，天平读数 m 代表 F（F = mg）',
            '③ 单匝 + 高精度天平：力小但长度变化看得见；多匝力大却看不出长度',
            '④ 三个探究都是控制变量；F–α 的横轴必须换成 sinα 才是直线',
          ]}
          hint={tab === 1
            ? '两个坑：① 忘了先置零，读数里带着磁铁自重；② α 用度、sin 要弧度，直接 sin(30) 会得到错误值。'
            : '操作要点：磁铁放秤盘、导线插支架、电源—导线—电流表串联；通电前必须置零；换线、改角度先断电。'}
        />
      </div>
    </SceneShell>
  )
}
