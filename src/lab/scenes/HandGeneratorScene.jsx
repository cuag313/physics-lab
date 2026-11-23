/**
 * HandGeneratorScene — 演示手摇发电机
 *
 * 对标 NB 物理实验「演示手摇发电机」：
 *   器材：手摇发电机（飞轮 + 皮带 + N/S 磁极 + 转子线圈 + 两接线柱）
 *         灵敏电流计、小灯泡、两只反接的发光二极管、导线
 *   三步：① 发电机—灯泡—电流计串联；② 只接灯泡，改转速看亮度；
 *         ③ 双反接 LED 并联，看交变电流下交替发光。
 *
 * 手摇发电机的分层与几何直接取自 NB 资源（electrical/HandGenerator）：
 *   机身 497×419（木底座 + 环形护圈 + 支架 + 磁极块 + 接线柱）
 *   飞轮 210×210，转轴在机身坐标 (145,138.5)
 *   线圈  83×52，转轴在机身坐标 (365.35,300)，转速是飞轮的 2 倍（皮带增速）
 *   接线柱（交流款）：黑柱 (272,372)、红柱 (452,367)
 *
 * 两个 Tab：
 *   ① 📖 实验演示 —— NB 的三步成品接法（灯泡+电流计 / 只接灯泡 / 双反接 LED）
 *   ② 🔧 自己动手 —— 台面不预先接线，用户自己点接线柱连线（点导线可拆），
 *      导线的连接关系合并成电网络后按节点法求解（发电机 = 电动势+内阻，
 *      电流计 5 Ω，灯泡 48 Ω，LED 对 = 两条反接二极管支路），短路会被标出来。
 *
 * 电气模型（NB HandGenerator 的逻辑）：
 *   θ 线圈角 = 2 × θ 飞轮；交流：e = Em·sin θ；直流：e = Em·sgn
 *   Em 与转速成正比：转速 6 r/s ↔ 峰值 6 V（滑到 3 r/s 就是 3 V）
 *   灯泡 6 V/0.75 W（R=48 Ω），电流计内阻 5 Ω，发电机内阻 0.1 Ω。
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { figURL, bulbTempColor, TYPES } from './electricSvgInstruments.js'

/* 器材栏缩略图：直接拿器材库的 SVG（静态帧，不画飞轮/线圈的转动） */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  const svg = t.render({ id: `pal-${type}`, f: 0.4 }, { I: 0, bright: 0.5, frac: 0 })
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

/* ─────────────────────────  设计坐标  ───────────────────────── */
const D = { W: 900, H: 470 }
const TABLE_Y = 380

const GEN = { x: 18, y: 118, s: 0.62, w: 497, h: 419, hubX: 145, hubY: 138.5, coilX: 365.35, coilY: 300 }
const GAL = { x: 360, y: 248, w: 176, h: 132 }
const BUL = { x: 560, y: 297, w: 176, h: 83 }
const LED = { x: 742, y: 300, w: 142, h: 76 }

/* 接线柱（设计坐标：柱顶，导线从这里进出） */
const N = {
  genBlack: { x: GEN.x + 272 * GEN.s, y: GEN.y + 366 * GEN.s },
  genRed: { x: GEN.x + 452 * GEN.s, y: GEN.y + 361 * GEN.s },
  galNeg: { x: GAL.x + 38, y: GAL.y + 112 },
  galPos: { x: GAL.x + 138, y: GAL.y + 112 },
  bulA: { x: BUL.x + 26, y: BUL.y + 52 },
  bulB: { x: BUL.x + 146, y: BUL.y + 52 },
  ledL: { x: LED.x + 26, y: LED.y + 60 },
  ledR: { x: LED.x + 122, y: LED.y + 60 },
}

const R_BULB = 48          // 6 V / 0.75 W
const R_GEN = 0.1
const R_GAL = 5
const GAL_FULL = 0.15      // 电流计满偏 150 mA
const V_FORWARD = 1.8      // LED 正向导通电压

/* 三种接法（演示页的成品接法） */
const STEPS = [
  {
    k: 1, label: '① 灯泡+电流计',
    wires: [[N.genBlack, N.galNeg, 'black'], [N.genRed, N.bulB, 'red'], [N.bulA, N.galPos, 'blue']],
    R: R_GEN + R_BULB + R_GAL,
    desc: '发电机、小灯泡、电流计串联：摇起来后灯泡发光，电流计指针左右摆动 —— 线圈每转过半圈，电流方向就改变一次。',
  },
  {
    k: 2, label: '② 只接灯泡',
    wires: [[N.genBlack, N.bulA, 'blue'], [N.genRed, N.bulB, 'red']],
    R: R_GEN + R_BULB,
    desc: '只把发电机和小灯泡连成回路：摇得越快，灯越亮 —— 转速越大，线圈切割磁感线越快，感应电动势越大。',
  },
  {
    k: 3, label: '③ 双反接 LED',
    wires: [[N.genBlack, N.ledL, 'blue'], [N.genRed, N.ledR, 'red']],
    R: 0,
    desc: '两只发光二极管反向并联：交流每半圈换向一次，于是两只管交替闪烁 —— 二极管只允许电流单向通过。转速调到 5~6 r/s 时交替最明显。',
  },
]

export default function HandGeneratorScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const imgRef = useRef({})
  const builderRef = useRef(null)

  const [ui, setUi] = useState({
    tab: 1, step: 1, running: false, speed: 3, dir: 1, type: 'ac', wire: 'red', wireColor: '#F44336',
    spin: false, // 自己动手页：一键摇起来（Start/Stop），飞轮按 spinSpeed 自动转并保持
    spinSpeed: 6, // 自动转速 r/s：慢摇才看得清电流计指针左右摆，快摇灯泡才亮
  })

  const S = useRef({
    tab: 1,
    step: 1,
    running: false,
    speed: 3,
    dir: 1,
    type: 'ac',
    wheel: 0,
    needle: 0,
    flow: 0,
    dragging: false,
    dragSpeed: 0,
    lastAng: 0,
    lastT: 0,
    iNow: 0,
    eNow: 0,
    wireColor: '#F44336',
    vis: null,
  })

  const applyUi = useCallback((patch) => {
    setUi((cur) => {
      const next = { ...cur, ...patch }
      const s = S.current
      s.tab = next.tab
      s.step = next.step; s.running = next.running; s.speed = next.speed
      s.dir = next.dir; s.type = next.type; s.wire = next.wire; s.wireColor = next.wireColor
      return next
    })
  }, [])

  /* ─────────────  图片资源  ───────────── */
  useEffect(() => {
    const list = {
      bodyAc: figURL('hg_body_ac.png'),
      bodyDc: figURL('hg_body_dc.png'),
      crank: figURL('hg_crank.png'),
      coil: figURL('hg_coil.png'),
      bulb: figURL('bulb_c.png'),
    }
    Object.entries(list).forEach(([k, url]) => {
      const im = new Image()
      im.src = url
      imgRef.current[k] = im
    })
  }, [])

  /* ─────────────  主循环  ───────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = { ctx: canvas.getContext('2d'), W: 0, H: 0 }
    const resize = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight
      canvas.width = width * devicePixelRatio
      canvas.height = height * devicePixelRatio
      R.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      R.W = width; R.H = height
    }
    resize()

    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      /* tab2 用 DOM 搭建器，画布被收起（clientWidth=0）→ 不步进也不绘制，切回来再按新尺寸重建 */
      if (canvas.clientWidth !== R.W) resize()
      if (R.W > 0 && S.current.tab === 1) {
        step(S.current, dt)
        render(R)
      }
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', resize)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ─────────────  物理  ───────────── */
  function step(s, dt) {
    /* 飞轮转角：摇起来时按转速积分；手拖时由指针直接改 */
    if (s.running && !s.dragging) {
      s.wheel += 2 * Math.PI * s.speed * s.dir * dt
    }
    /* 松手后手摇速度衰减到 0 */
    if (!s.dragging && s.dragSpeed > 0) {
      s.dragSpeed = Math.max(0, s.dragSpeed - dt * 40)
    }

    const speedNow = s.dragging ? s.dragSpeed : (s.running ? s.speed : s.dragSpeed)
    const Em = speedNow                        // 6 r/s ↔ 6 V
    const coil = s.wheel * 2                   // 皮带增速：线圈转速是飞轮的 2 倍
    let e
    if (s.type === 'dc') {
      /* 直流发电机：换向器把线圈里的交变电流整流成同向电流 */
      e = speedNow > 0.02 ? Em * s.dir : 0
    } else {
      /* 交流发电机：线圈平面与磁场垂直（θ=0）时 e 最大 */
      e = Em * Math.sin(coil)
    }
    s.eNow = e

    /* ── 演示页：按成品接法直接算（自己动手页由 BuilderSVG 另算，不经过这里）── */
    {
      const st = STEPS[s.step - 1]
      let i
      if (s.step === 3) {
        /* ③ 反接二极管：串联 220 Ω 限流，正向压降 1.8 V 以上才有电流 */
        const over = Math.max(0, Math.abs(e) - V_FORWARD)
        i = Math.sign(e) * over / 220
      } else {
        i = st.R ? e / st.R : 0
      }
      s.iNow = i

      const rms = s.type === 'dc' ? speedNow : speedNow / Math.SQRT2
      const iRms = st.R ? rms / st.R : 0
      const level = Math.min(1, Math.abs(i) / 0.02)
      s.vis = {
        gal: s.step <= 1,
        bulb: s.step <= 2,
        led: s.step === 3,
        galI: i,
        bulbW: iRms * iRms * R_BULB,
        ledA: i > 0 ? level : 0,
        ledB: i < 0 ? level : 0,
        short: false,
        closed: Math.abs(i) > 1e-6,
        wired: { gen: true, gal: s.step <= 1, bulb: s.step <= 2, led: s.step === 3 },
      }
      /* 电流计指针（有阻尼，交流时以 0 为中心左右摆）
         阻尼时间常数取 40 ms：再大（原来的 85 ms）就跟不上 6 Hz 的交流，指针只会贴着 0 抖 */
      const need = Math.max(-1, Math.min(1, i / GAL_FULL))
      s.needle += (need - s.needle) * Math.min(1, dt / 0.040)
      s.flow += dt * (0.10 + Math.min(1, Math.abs(i) / 0.12) * 0.55) * (i < 0 ? -1 : 1)
    }
  }

  /* ─────────────  绘制  ───────────── */
  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    if (!W || !H) return
    const s = S.current
    ctx.clearRect(0, 0, W, H)

    /* 背景：暖白实验室光 */
    const bg = ctx.createLinearGradient(0, 0, W * 0.6, H)
    bg.addColorStop(0, '#FFFCF5'); bg.addColorStop(0.55, '#FDF4E6'); bg.addColorStop(1, '#FBEDD9')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    const sc = Math.min(W / D.W, H / D.H)
    const ox = (W - D.W * sc) / 2
    const oy = (H - D.H * sc) / 2

    ctx.save()
    ctx.translate(ox, oy); ctx.scale(sc, sc)

    drawTable(ctx)
    drawGenerator(ctx, s)
    drawGalvanometer(ctx, s)
    drawBulb(ctx, s)
    drawLedPair(ctx, s)
    drawWires(ctx, s)
    drawHud(ctx, s)
    drawHandHint(ctx, s)

    ctx.restore()
  }

  /* ── 台面 ── */
  function drawTable(ctx) {
    const y = TABLE_Y
    ctx.save()
    const wood = ctx.createLinearGradient(0, y, 0, y + 90)
    wood.addColorStop(0, '#F3DDBE'); wood.addColorStop(0.12, '#E8C79C'); wood.addColorStop(1, '#C89A66')
    ctx.fillStyle = wood
    ctx.beginPath(); ctx.roundRect(-10, y, D.W + 20, D.H - y + 6, 8); ctx.fill()
    ctx.strokeStyle = 'rgba(122,82,44,0.55)'; ctx.lineWidth = 1.2
    ctx.stroke()
    /* 木纹 */
    ctx.strokeStyle = 'rgba(150,104,58,0.22)'; ctx.lineWidth = 1
    for (let i = 1; i < 6; i++) {
      const yy = y + 14 + i * 12
      ctx.beginPath(); ctx.moveTo(6, yy)
      ctx.bezierCurveTo(D.W * 0.3, yy - 2, D.W * 0.7, yy + 3, D.W - 6, yy)
      ctx.stroke()
    }
    /* 台面与背景交界的阴影 */
    ctx.fillStyle = 'rgba(120,80,40,0.14)'
    ctx.beginPath(); ctx.roundRect(-10, y - 8, D.W + 20, 12, 6); ctx.fill()
    ctx.restore()
  }

  /* ── 手摇发电机 ── */
  function drawGenerator(ctx, s) {
    const im = imgRef.current
    const body = s.type === 'dc' ? im.bodyDc : im.bodyAc
    const x = GEN.x, y = GEN.y, w = GEN.w * GEN.s, h = GEN.h * GEN.s

    /* 落影 */
    ctx.save()
    ctx.fillStyle = 'rgba(90,60,30,0.20)'
    ctx.beginPath(); ctx.ellipse(x + w * 0.52, y + h + 4, w * 0.46, 11, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    if (body && body.complete) ctx.drawImage(body, x, y, w, h)

    /* 飞轮（6 孔皮带轮）—— 绕机身 (145,138.5) 转 */
    if (im.crank && im.crank.complete) {
      const cx = x + GEN.hubX * GEN.s, cy = y + GEN.hubY * GEN.s
      const r = 105 * GEN.s
      ctx.save()
      ctx.translate(cx, cy); ctx.rotate(s.wheel)
      ctx.drawImage(im.crank, -r, -r, r * 2, r * 2)
      ctx.restore()
    }

    /* 转子线圈 —— 绕机身 (365.35,300) 转，转速 2 倍 */
    if (im.coil && im.coil.complete) {
      const cx = x + GEN.coilX * GEN.s, cy = y + GEN.coilY * GEN.s
      ctx.save()
      ctx.translate(cx, cy); ctx.rotate(s.wheel * 2)
      ctx.drawImage(im.coil, -41.5 * GEN.s, -26 * GEN.s, 83 * GEN.s, 52 * GEN.s)
      ctx.restore()
    }

    /* 铭牌 */
    ctx.save()
    ctx.fillStyle = 'rgba(30,41,59,0.82)'
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const tagW = 96, tagH = 22, tx = x + 108, ty = y + h + 26
    ctx.beginPath(); ctx.roundRect(tx - tagW / 2, ty - tagH / 2, tagW, tagH, 8); ctx.fill()
    ctx.fillStyle = '#FFE9C7'
    ctx.fillText('手摇发电机', tx, ty + 1)
    ctx.restore()
  }

  /* ── 灵敏电流计 ── */
  function drawGalvanometer(ctx, s) {
    const { x, y, w, h } = GAL
    const vis = s.vis || {}
    const live = !!vis.gal                      // 电流计在回路里才读
    const frac = live ? s.needle : 0

    ctx.save()
    ctx.fillStyle = 'rgba(90,60,30,0.18)'
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 3, w * 0.45, 9, 0, 0, Math.PI * 2); ctx.fill()

    /* 表体 */
    const g = ctx.createLinearGradient(x, y, x, y + h)
    g.addColorStop(0, '#FBF7EC'); g.addColorStop(1, '#E7DFC9')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.roundRect(x, y, w, h - 12, 12); ctx.fill()
    ctx.strokeStyle = '#B9AE93'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(x, y, w, h - 12, 12); ctx.stroke()

    const PX = x + 88, PY = y + 96, RAD = 56
    /* 刻度弧 */
    ctx.strokeStyle = '#8C8471'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(PX, PY, RAD, -Math.PI / 2 - 0.8, -Math.PI / 2 + 0.8); ctx.stroke()
    /* 刻度线 */
    for (let k = -5; k <= 5; k++) {
      const ang = -Math.PI / 2 + (k / 5) * 0.8
      const x1 = PX + Math.cos(ang) * (RAD - (k === 0 ? 9 : 6))
      const y1 = PY + Math.sin(ang) * (RAD - (k === 0 ? 9 : 6))
      const x2 = PX + Math.cos(ang) * RAD, y2 = PY + Math.sin(ang) * RAD
      ctx.strokeStyle = k === 0 ? '#1f2937' : '#A99C80'
      ctx.lineWidth = k === 0 ? 1.8 : 1
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }
    /* 量程数字 */
    ctx.fillStyle = '#4B5563'; ctx.font = '10px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('−150', PX - RAD - 2, PY - 12)
    ctx.fillText('0', PX, PY - RAD - 13)
    ctx.fillText('+150', PX + RAD + 2, PY - 12)
    ctx.fillStyle = '#6B6357'; ctx.font = 'bold 11px "Microsoft YaHei", sans-serif'
    ctx.fillText('灵敏电流计 mA', PX, y + 15)

    /* 指针 */
    const ang = -Math.PI / 2 + frac * 0.8
    ctx.strokeStyle = frac > 0.97 || frac < -0.97 ? '#C0261B' : '#D33A2C'
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(PX, PY)
    ctx.lineTo(PX + Math.cos(ang) * 52, PY + Math.sin(ang) * 52); ctx.stroke()
    ctx.fillStyle = '#2b2b2b'
    ctx.beginPath(); ctx.arc(PX, PY, 4, 0, Math.PI * 2); ctx.fill()

    /* 读数 */
    ctx.fillStyle = live ? '#1f2937' : '#9AA3AD'
    ctx.font = 'bold 12px "HarmonyOS Sans", "Microsoft YaHei", sans-serif'
    ctx.fillText(live ? `${(frac * 150).toFixed(0)} mA` : '未接入', PX, PY + 13)

    /* 接线柱（黑 − / 红 +） */
    post(ctx, GAL.x + 38, GAL.y + 112, '#2b2b2b', '#6b6b6b')
    post(ctx, GAL.x + 138, GAL.y + 112, '#C0392B', '#E34B3B')
    ctx.restore()
  }

  /* ── 小灯泡 ── */
  function drawBulb(ctx, s) {
    const { x, y, w, h } = BUL
    const vis = s.vis || {}
    const live = !!vis.bulb
    const power = live ? (vis.bulbW || 0) : 0
    const bright = Math.min(1, power / 0.75)
    const { halo } = bulbTempColor(bright)

    ctx.save()
    /* 光晕 */
    if (bright > 0.02) {
      const cx = x + w * 0.5, cy = y + h * 0.36
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 86)
      glow.addColorStop(0, `rgba(${halo[0]},${halo[1]},${halo[2]},${0.55 * bright + 0.12})`)
      glow.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(cx, cy, 86, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = 'rgba(90,60,30,0.18)'
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 3, w * 0.42, 8, 0, 0, Math.PI * 2); ctx.fill()

    const im = imgRef.current.bulb
    if (im && im.complete) ctx.drawImage(im, x, y, w, h)

    if (bright > 0.35) {
      ctx.fillStyle = `rgba(255,252,230,${Math.min(0.85, bright)})`
      ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.36, 9 * bright + 4, 0, Math.PI * 2); ctx.fill()
    }

    /* 实测功率 */
    ctx.fillStyle = 'rgba(30,41,59,0.8)'; ctx.font = 'bold 11px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`小灯泡 ${(power * 1000).toFixed(0)} mW`, x + w / 2, y + h + 20)
    ctx.restore()
  }

  /* ── 两只反接 LED ── */
  function drawLedPair(ctx, s) {
    const { x, y, w } = LED
    const vis = s.vis || {}
    const live = !!vis.led
    const firstOn = live && (vis.ledA || 0) > 0.05
    const secondOn = live && (vis.ledB || 0) > 0.05
    const la = firstOn ? vis.ledA : 0
    const lb = secondOn ? vis.ledB : 0

    ctx.save()
    /* 小底板（深灰 PCB，带高光边） */
    ctx.fillStyle = 'rgba(90,60,30,0.18)'
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 72, w * 0.44, 6, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#243647'
    ctx.beginPath(); ctx.roundRect(x, y + 30, w, 40, 8); ctx.fill()
    ctx.strokeStyle = '#16222E'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.roundRect(x, y + 30, w, 40, 8); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.beginPath(); ctx.roundRect(x + 5, y + 33, w - 10, 5, 3); ctx.fill()

    const cy = y + 14
    led(ctx, x + 52, cy, la, '#E5483B')
    led(ctx, x + 96, cy, lb, '#31B85A')

    /* 反接标记（写在底板上，避开来线） */
    ctx.fillStyle = '#9FB3C8'; ctx.font = 'bold 10px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('⇄', x + w / 2, y + 52)
    /* 器材名（写在台面上） */
    ctx.fillStyle = 'rgba(30,41,59,0.78)'; ctx.font = 'bold 11px "Microsoft YaHei", sans-serif'
    ctx.fillText('反接的发光二极管', x + w / 2, y + 88)

    post(ctx, x + 26, y + 60, '#2b2b2b', '#6b6b6b')
    post(ctx, x + 122, y + 60, '#C0392B', '#E34B3B')
    ctx.restore()
  }

  function led(ctx, cx, cy, level, color) {
    ctx.save()
    if (level > 0) {
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30)
      g.addColorStop(0, hexA(color, 0.70 * level))
      g.addColorStop(1, hexA(color, 0))
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill()
    }
    /* 引脚 */
    ctx.strokeStyle = '#8E9AA7'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx - 4, cy + 9); ctx.lineTo(cx - 4, cy + 24); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx + 4, cy + 9); ctx.lineTo(cx + 4, cy + 24); ctx.stroke()
    /* 管体 */
    const body = ctx.createRadialGradient(cx - 4, cy - 5, 1, cx, cy, 12)
    body.addColorStop(0, mix(color, '#ffffff', 0.74))
    body.addColorStop(1, mix(color, '#ffffff', level > 0 ? 0.05 : 0.42))
    ctx.fillStyle = body
    ctx.beginPath(); ctx.arc(cx, cy, 10.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = hexA(color, 0.5); ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(cx, cy, 10.5, 0, Math.PI * 2); ctx.stroke()
    /* 底部管座 */
    ctx.fillStyle = 'rgba(60,72,86,0.85)'
    ctx.beginPath(); ctx.roundRect(cx - 7, cy + 7, 14, 4, 2); ctx.fill()
    /* 芯片 */
    ctx.fillStyle = level > 0 ? '#FFF6D6' : mix(color, '#000000', 0.2)
    ctx.beginPath(); ctx.arc(cx, cy, 4.6, 0, Math.PI * 2); ctx.fill()
    /* 高光 */
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath(); ctx.arc(cx - 3.5, cy - 4, 2.6, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  /* ── 读数板 ── */
  function drawHud(ctx, s) {
    const spd = s.dragging ? s.dragSpeed : s.running ? s.speed : 0
    const coil = ((s.wheel * 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
    const rows = [
      ['转速', `${spd.toFixed(1)} r/s`],
      ['峰值电动势 Em', `${spd.toFixed(1)} V`],
      ['瞬时 e', `${s.eNow.toFixed(2)} V`],
      ['瞬时电流', `${(s.iNow * 1000).toFixed(0)} mA`],
      ['灯泡功率', `${((s.vis?.bulbW || 0) * 1000).toFixed(0)} mW`],
      ['线圈转角', `${(coil * 180 / Math.PI).toFixed(0)}°`],
    ]
    const w = 214, h = 24 + rows.length * 19
    const x = D.W - w - 14, y = 14
    ctx.save()
    ctx.fillStyle = 'rgba(17,24,39,0.82)'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill()
    ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.lineWidth = 1
    ctx.stroke()
    ctx.font = 'bold 11px "Microsoft YaHei", sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#93C5FD'
    ctx.textAlign = 'left'
    ctx.fillText('实时数据', x + 12, y + 14)
    rows.forEach(([k, v], idx) => {
      const yy = y + 30 + idx * 19
      ctx.fillStyle = '#E2E8F0'; ctx.font = '11px "Microsoft YaHei", sans-serif'
      ctx.fillText(k, x + 12, yy)
      ctx.fillStyle = '#FDE68A'; ctx.font = 'bold 11px "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(v, x + w - 12, yy)
      ctx.textAlign = 'left'
    })
    ctx.restore()
  }

  /* ── 手摇提示 ── */
  function drawHandHint(ctx, s) {
    if (s.running || s.dragging) return
    const cx = GEN.x + GEN.hubX * GEN.s, cy = GEN.y + GEN.hubY * GEN.s
    const r = 108 * GEN.s
    ctx.save()
    ctx.setLineDash([6, 6])
    ctx.strokeStyle = 'rgba(37,99,235,0.55)'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(37,99,235,0.9)'; ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('按住飞轮拖动 或 点「▶ 摇起来」', cx, cy + r + 20)
    ctx.restore()
  }

  /* ── 导线 + 电流小点（演示页的三步成品接法） ── */
  function drawWires(ctx, s) {
    const wires = STEPS[s.step - 1].wires
    const i = s.iNow
    const on = Math.abs(i) > 0.0008
    const BASELINE = TABLE_Y + 4

    for (const [a, b, key] of wires) {
      /* 导线从柱脚垂到台面，再沿台面走到另一端柱脚下方 —— 这样不会横穿其他器材的面板 */
      const c1 = { x: a.x + (b.x - a.x) * 0.16, y: BASELINE }
      const c2 = { x: a.x + (b.x - a.x) * 0.84, y: BASELINE }
      const color = key === 'red' ? '#D3382F' : key === 'black' ? '#2B2B2B' : '#2F5FBF'

      ctx.strokeStyle = color; ctx.lineWidth = 3.2; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(a.x, a.y)
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(a.x, a.y - 1)
      ctx.bezierCurveTo(c1.x, c1.y - 1, c2.x, c2.y - 1, b.x, b.y - 1); ctx.stroke()

      /* 电流流动小点（方向随瞬时电流翻转） */
      if (on) {
        const dots = 9
        for (let d = 0; d < dots; d++) {
          let t = (d / dots + (s.flow % 1) + 1) % 1
          if (i < 0) t = 1 - t
          const p = bzPoint(a, c1, c2, b, t)
          const alpha = 0.9 * Math.min(1, Math.abs(i) / 0.02 + 0.3)
          ctx.fillStyle = `rgba(255,214,102,${alpha})`
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill()
        }
      }
    }

  }

  /* ─────────────  指针交互（手摇 + 接线） ───────────── */
  const toDesign = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const W = canvas.clientWidth, H = canvas.clientHeight
    const sc = Math.min(W / D.W, H / D.H)
    const ox = (W - D.W * sc) / 2, oy = (H - D.H * sc) / 2
    return { x: (e.clientX - rect.left - ox) / sc, y: (e.clientY - rect.top - oy) / sc, sc }
  }, [])

  const onDown = useCallback((e) => {
    const p = toDesign(e)
    if (!p) return
    const s = S.current

    const cx = GEN.x + GEN.hubX * GEN.s, cy = GEN.y + GEN.hubY * GEN.s
    if (Math.hypot(p.x - cx, p.y - cy) < 110 * GEN.s) {
      s.dragging = true
      s.lastAng = Math.atan2(p.y - cy, p.x - cx)
      s.lastT = performance.now()
      s.dragSpeed = 0
    }
  }, [toDesign])

  const onMove = useCallback((e) => {
    const s = S.current
    const p = toDesign(e)
    if (!p) return
    if (!s.dragging) return
    const cx = GEN.x + GEN.hubX * GEN.s, cy = GEN.y + GEN.hubY * GEN.s
    const ang = Math.atan2(p.y - cy, p.x - cx)
    let d = ang - s.lastAng
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    s.wheel += d
    s.lastAng = ang
    const now = performance.now()
    const dt = Math.max(0.008, (now - s.lastT) / 1000)
    s.lastT = now
    /* 角速度 → 转速（r/s），限幅到 6 */
    const rev = Math.min(6, Math.abs(d) / (2 * Math.PI) / dt)
    s.dragSpeed = s.dragSpeed * 0.6 + rev * 0.4
    if (Math.abs(d) > 0.001) s.dir = d > 0 ? 1 : -1
  }, [toDesign])

  const onUp = useCallback(() => {
    S.current.dragging = false
  }, [])

  /* ─────────────  UI ───────────── */
  const handleReset = useCallback(() => {
    if (ui.tab === 2) {
      applyUi({ spin: false })
      builderRef.current?.reset()
      return
    }
    const s = S.current
    s.wheel = 0; s.needle = 0; s.flow = 0; s.dragSpeed = 0; s.dragging = false
    applyUi({ step: 1, running: false, speed: 3, dir: 1, type: 'ac', wire: 'red' })
  }, [applyUi, ui.tab])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => {
    builderRef.current?.addAt(type, clientX, clientY)
  }, [])

  const st = STEPS[ui.step - 1]

  return (
    <SceneShell
      title="演示手摇发电机"
      tab={ui.tab}
      onTabChange={(t) => applyUi({ tab: t, spin: false })}
      tab1Label="📖 实验演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      resetLabel="重置"
      toolbarExtra={(
        <>
          {ui.tab === 1 && STEPS.map((s0) => (
            <button
              key={s0.k}
              type="button"
              onClick={() => applyUi(s0.k === 3 && ui.speed < 4 ? { step: s0.k, speed: 6 } : { step: s0.k })}
              style={chipStyle(ui.step === s0.k)}
            >
              {s0.label}
            </button>
          ))}
          {ui.tab === 1 && (
            <>
              {/* 摇动与转速（演示页） */}
              <span style={{ width: 1, height: 20, background: '#D0D7DE', margin: '0 2px' }} />
              <button
                type="button"
                onClick={() => applyUi({ running: !ui.running })}
                style={chipStyle(ui.running, '#16A34A')}
              >
                {ui.running ? '⏸ 停止' : '▶ 摇起来'}
              </button>
              <label style={labelStyle}>
                转速
                <input
                  type="range" min={0} max={6} step={0.5} value={ui.speed}
                  onChange={(e) => applyUi({ speed: Number(e.target.value) })}
                  style={{ width: 110, accentColor: '#2563EB' }}
                />
                <b style={{ minWidth: 44, display: 'inline-block' }}>{ui.speed.toFixed(1)} r/s</b>
              </label>
              <button type="button" onClick={() => applyUi({ dir: -ui.dir })} style={chipStyle(false)}>
                {ui.dir > 0 ? '↻ 顺时针' : '↺ 逆时针'}
              </button>
              <button
                type="button"
                onClick={() => applyUi({ type: ui.type === 'ac' ? 'dc' : 'ac' })}
                style={chipStyle(false, '#7C3AED')}
              >
                {ui.type === 'ac' ? '交流发电机' : '直流发电机'}
              </button>
            </>
          )}
          {ui.tab === 2 && (
            <>
              <button
                type="button"
                onClick={() => applyUi({ spin: !ui.spin })}
                style={chipStyle(ui.spin, '#16A34A')}
                title="电路接好后按这里，飞轮按左边设定的转速自动转（再按停止）"
              >
                {ui.spin ? '⏸ 停止' : '▶ 摇起来'}
              </button>
              <label style={labelStyle}>
                转速
                <input
                  type="range" min={0.5} max={6} step={0.5} value={ui.spinSpeed}
                  onChange={(e) => applyUi({ spinSpeed: Number(e.target.value) })}
                  style={{ width: 110, accentColor: '#2563EB' }}
                />
                <b style={{ minWidth: 44, display: 'inline-block' }}>{ui.spinSpeed.toFixed(1)} r/s</b>
              </label>
              <span style={{ fontSize: 12.5, color: '#6B7280' }}>
                {ui.spin
                  ? `飞轮 ${ui.spinSpeed.toFixed(1)} r/s —— 2~3 r/s 慢摇时指针以 0 为中心左右摆得最清楚，6 r/s 快摇时表针惯性跟不上、只在 0 附近抖`
                  : '从右边器材栏拖器材到桌面 → 点接线柱连线 → 按「摇起来」或按住飞轮拖'}
              </span>
            </>
          )}
        </>
      )}
      desc={ui.tab === 1 ? (
        <>
          <b>{st.label}</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>{st.desc}</span>
        </>
      ) : (
        <>
          <b>自己动手</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            器材都在右边栏里：拖手摇发电机、灯泡、灵敏电流计、发光二极管到桌面，点接线柱连线，按住飞轮拖动摇起来；接错也看得见后果（不亮 / 灯闪 / 短路）。
          </span>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%' }}>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: ui.tab === 1 ? 'block' : 'none' }}>
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              touchAction: 'none', cursor: 'grab',
            }}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            onTouchStart={onDown}
            onTouchMove={onMove}
            onTouchEnd={onUp}
          />
        </div>
        {ui.tab === 2 && <BuilderSVG ref={builderRef} wireColor={ui.wireColor} autoSpin={ui.spin} spinSpeed={ui.spinSpeed} emptyHint="从右侧器材栏拖入「手摇发电机」和用电器，开始搭电路" />}
        {ui.tab === 1 ? (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            purpose="观察手摇发电机摇动时电路中的电流，认识发电机的基本构造和能量转化（机械能 → 电能）。"
            steps={[
              '① 发电机 + 小灯泡 + 灵敏电流计串联：摇动飞轮，看灯泡与指针',
              '指针左右来回摆 → 线圈每半圈电流反向一次，是交流电',
              '② 只接小灯泡：调转速（或摇快一点），比较亮度 —— 转速越大越亮',
              '峰值电动势 Em 与转速成正比：6 r/s 对应 6 V',
              '③ 两只发光二极管反接后并联到发电机两端：摇动，看它们交替闪',
              '改成「直流发电机」：换向器把线圈里的交流整流，电流不再反向',
              '飞轮可以直接用鼠标/手指按住拖动 —— 拖得越快，感应电动势越大',
            ]}
            hint="线圈在磁场中转动切割磁感线 → 产生感应电动势；线圈平面与磁场垂直时 e 最大，与磁场平行时 e=0。皮带把飞轮的转速放大 2 倍传给转子线圈。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            purpose="不按现成接法，自己把器材拖进桌面搭电路：发电机怎么摇、灯泡为什么亮、指针为什么来回摆，都由你的接法决定。"
            steps={[
              '① 从右侧器材栏拖「手摇发电机」和「灵敏电流计」到桌面（点一下也能加进来）',
              '② 点一个接线柱 → 再点另一个接线柱，把发电机和电流计接成一个圈（黑柱 = 负极，红柱 = 正极）',
              '③ 按左上角「▶ 摇起来」：指针以 0 为中心左右对称地摆（线圈每半圈电流反向一次）。2~3 r/s 慢摇能看清指针从左到右来回；6 r/s 快摇时线圈每秒换向十几次，表针来不及跟，就只在 0 附近抖 —— 真实表针也是这样',
              '再按「⏸ 停止」收手；也可以按住飞轮自己绕圈拖，松手后按 30 r/s² 慢慢停',
              '④ 再把「小灯泡（6 V）」串进回路：灯泡亮起来（6 r/s 最亮），但串上电流计那 50 Ω 后电流变小，指针摆幅明显变窄',
              '⑤ 想换器材：点器材右上角 ✕ 删掉；点导线会浮出红色 ✕，点它就拆；「重置」清空整张桌面',
            ]}
            hint="6 V 小灯泡灯丝 48 Ω、额定 0.75 W：6 r/s 时峰值 6 V，单独接灯泡正好到额定亮度；再串上 50 Ω 的灵敏电流计，灯泡只剩一成左右的功率（肉眼几乎不亮），但那台表的指针能看出电流方向在变。发光二极管只有正向导通，反接不亮。"
            hintTitle="操作说明"
          />
        )}
        {ui.tab === 2 && (
          <BuilderPalette
            side="right"
            items={[
              { type: 'handGenerator', name: '手摇发电机', icon: thumb('handGenerator') },
              { type: 'bulb6', name: '小灯泡（6 V）', icon: thumb('bulb6') },
              { type: 'galvanometer', name: '灵敏电流计', icon: thumb('galvanometer') },
              { type: 'diode', name: '发光二极管', icon: thumb('diode') },
              { type: 'switch', name: '开关', icon: thumb('switch') },
              { type: 'ammeterA', name: '电流表', icon: thumb('ammeterA') },
              { type: 'voltmeter', name: '电压表', icon: thumb('voltmeter') },
            ]}
            wireColor={ui.wireColor}
            onPickColor={(c) => applyUi({ wireColor: c })}
            onAdd={handleAddFromPalette}
            onDropAt={handleDropFromPalette}
            hint="点选或拖到桌面加入"
          />
        )}
      </div>
    </SceneShell>
  )
}

/* ─────────────────────────  工具 ───────────────────────── */
const chipStyle = (on, color = '#2563EB') => ({
  background: on ? color : '#fff',
  color: on ? '#fff' : '#374151',
  border: `1px solid ${on ? color : '#D0D7DE'}`,
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
})

const labelStyle = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151',
}

function bzPoint(a, c1, c2, b, t) {
  const u = 1 - t
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t
  return {
    x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t)
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t)
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t)
  return `rgb(${r},${g},${bl})`
}

/** 接线柱：小圆柱 + 顶帽 */
function post(ctx, x, y, dark, light) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath(); ctx.ellipse(x, y + 4, 11, 4, 0, 0, Math.PI * 2); ctx.fill()
  const g = ctx.createLinearGradient(x - 9, y - 9, x + 9, y + 3)
  g.addColorStop(0, light); g.addColorStop(0.45, dark); g.addColorStop(1, dark)
  ctx.fillStyle = g
  ctx.beginPath(); ctx.roundRect(x - 8, y - 10, 16, 14, 5); ctx.fill()
  ctx.fillStyle = light
  ctx.beginPath(); ctx.ellipse(x, y - 10, 8, 3.2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.ellipse(x, y - 10, 8, 3.2, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}
