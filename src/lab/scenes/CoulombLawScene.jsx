import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * CoulombLawScene — 库仑定律探究（悬线偏角法）
 *
 * 器材与物理逻辑对齐「探究电荷间的相互作用力」3D 交互课件：
 *   A = 固定在底座上的带电球
 *   B = 细线悬挂的轻质导电小球（悬点可在横杆上平移 → 改距离 r）
 *   B 球三力平衡：重力 mg（竖直向下）、悬线拉力 T（沿细线）、静电力 F（水平）
 *   → tanθ = F / mg，即 F = mg tanθ —— 偏角 θ 是"把看不见的静电力放大"的读数
 *
 * 四步探究：
 *   ① 认识装置：点击 B 球切换正负电，同种相斥、异种相吸
 *   ② 探究距离：锁 Q₁Q₂，移动悬挂点改 r → r 越小 θ 越大
 *   ③ 探究电荷量：锁 r，改电荷量 → θ 随 Q₁Q₂ 同步变化
 *   ④ 实验结论：F = mg tanθ 与 F = kQ₁Q₂/r² 两式对上，θ 不能当成正比量
 */
const K_COUL = 9e9
const BALL_M = 1.5e-4          // 0.15 g 轻质导电小球
const MG = BALL_M * 9.8        // ≈1.47×10⁻³ N
const Q_MIN = 20, Q_MAX = 60, Q_STEP = 5
const R_MIN = 10, R_MAX = 36
const MAX_REC = 4
const THETA_DRAW = 60          // 画偏角的极限（超过只影响观感）

const FONT = '"PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif'

const C = {
  bg: '#EDF2F5',
  wall: '#F7FAFB',
  card: '#FFFFFF',
  line: '#DFE7EB',
  ink: '#22313A',
  sub: '#5D7079',
  faint: '#93A5AD',
  teal: '#12A69B',
  tealDark: '#0B7F77',
  tealSoft: '#E2F4F2',
  pos: '#DE453F',
  neg: '#2C6FAF',
  mg: '#5C6F7A',
  tension: '#9A7B66',
  gold: '#E2A33C',
  goldSoft: '#FBF1DE',
}

const STEPS = [
  { key: 1, label: '① 认识装置', sub: 'A 是固定带电球，B 是细线悬挂的轻质导电小球 —— 点击 B 球可切换正负电：同种相斥、异种相吸' },
  { key: 2, label: '② 探究距离', sub: '保持两球电荷量不变，沿横杆拖动悬挂点改变距离 r —— 距离越近，B 球偏角 θ 越大' },
  { key: 3, label: '③ 探究电荷量', sub: '保持距离 r 不变，改变小球的电荷量 —— 静电力箭头与偏角 θ 随 Q₁Q₂ 同步变化' },
  { key: 4, label: '④ 实验结论', sub: '由偏角反推静电力 F = mg tanθ，再验证 F ∝ Q₁Q₂、F ∝ 1/r²，理清"偏角只用来比较力的大小"' },
]

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function coulombInfo(s) {
  const rM = s.rCm / 100
  const F = (K_COUL * (s.Q1 * 1e-9) * (s.Q2 * 1e-9)) / (rM * rM)
  const tan = F / MG
  const theta = (Math.atan(tan) * 180) / Math.PI
  return { rM, F, tan, theta, sameSign: s.sB > 0, mg: MG }
}

function makeLayout(W, H) {
  const stage = { x0: 24, x1: Math.max(W * 0.56, W - 300), y0: 76, y1: H - 106 }
  const sc = clamp(Math.min((stage.x1 - stage.x0) / 1000, (stage.y1 - stage.y0) / 640), 1, 1.7)
  const beamY = stage.y0 + 40 * sc
  const tableY = stage.y1 - 6 * sc

  // 装置整体（A 球 → 立柱）水平居中：横向铺满舞台的 ~84%，横杆只做到悬挂点可及的最右端
  const innerW = stage.x1 - stage.x0
  const leftRoom = 130 * sc                // A 球左侧（F′ 箭头 + 标注）
  const rightRoom = 58 * sc                // 立柱右侧
  const pxPerCm = clamp((innerW * 0.84 - leftRoom - rightRoom) / R_MAX, 6, 26 * sc)
  const rigW = R_MAX * pxPerCm + leftRoom + rightRoom
  const xA = stage.x0 + Math.max(0, (innerW - rigW) / 2) + leftRoom
  const postX = xA + R_MAX * pxPerCm + 40 * sc

  // 细线长度按同一 cm→px 比例（约 22 cm），并保证立柱底座与竖杆有高度
  const L = clamp(pxPerCm * 22, 120 * sc, tableY - beamY - 170 * sc)
  const ballY0 = beamY + L
  const AY = ballY0 + 12 * sc
  return { stage, beamY, tableY, L, xA, ballY0, AY, pxPerCm, postX, sc }
}

function rigGeom(G, s, info) {
  const sc = G.sc || 1
  const th = (Math.min(info.theta, THETA_DRAW) * Math.PI) / 180
  const dir = info.sameSign ? 1 : -1
  const ballX = G.xA + s.rCm * G.pxPerCm
  const ballY = G.beamY + G.L * Math.cos(th)
  const slideX = ballX - dir * G.L * Math.sin(th)
  const dropY = G.beamY + 14 * sc
  return { th, dir, ballX, ballY, slideX, dropY, sc }
}

// ─── 文本工具 ───
function setFont(ctx, size, weight = '') {
  ctx.font = `${weight ? weight + ' ' : ''}${size}px ${FONT}`
}
function fitFont(ctx, text, maxW, size, weight = '') {
  let fs = size
  setFont(ctx, fs, weight)
  while (ctx.measureText(text).width > maxW && fs > 7.5) {
    fs -= 0.5
    setFont(ctx, fs, weight)
  }
  return fs
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
function supNum(n) { return String(n).split('').map((c) => SUP[c] || c).join('') }
function sciText(v, digits = 2) {
  if (!isFinite(v) || v === 0) return '0'
  const e = Math.floor(Math.log10(Math.abs(v)))
  const m = v / Math.pow(10, e)
  return `${m.toFixed(digits)}×10${supNum(e)}`
}

export default function CoulombLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    Q1: 40,          // nC
    Q2: 40,          // nC
    rCm: 20,         // cm，两球球心距
    sB: 1,           // B 球电性：+1 正 / -1 负（A 固定正电）
    records: [],
    compare: false,
    dragSlider: null,
    toast: null,
    hover: null,
    // Tab2 自己动手
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

    const loop = () => { render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    try {
      const ctx = R.ctx, W = R.W, H = R.H
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)
      canvasRef.current._clickAreas = []
      canvasRef.current._palAreas = []
      if (S.current.tab === 1) renderDemo(ctx, W, H)
      else renderBuilder(ctx, W, H)
      canvasRef.current._dbg = {
        step: S.current.step,
        tab: S.current.tab,
        rCm: S.current.rCm,
        theta: coulombInfo(S.current).theta,
        records: S.current.records.length,
        compare: S.current.compare,
        areas: (canvasRef.current._clickAreas || []).map((a) => ({ n: a.n || '', x: a.x, y: a.y, w: a.w, h: a.h })),
      }
    } catch (e) { console.error('render error:', e) }
  }

  function pushArea(a) { canvasRef.current._clickAreas.push(a) }

  function say(text) { S.current.toast = { text, until: Date.now() + 2200 } }

  // ================================================================
  //  Tab 1：悬线偏角法演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const info = coulombInfo(s)
    const G = makeLayout(W, H)
    const gm = rigGeom(G, s, info)

    drawHeader(ctx, W, s)
    drawStageBack(ctx, G)
    drawBench(ctx, G)
    drawRig(ctx, G, s, info, gm)
    drawRuler(ctx, G, s, info, gm)
    drawForces(ctx, G, s, info, gm)
    if (s.step === 1) drawCallouts(ctx, G, s, gm)
    drawStageFoot(ctx, G, s, info)
    drawRightPanel(ctx, W, H, G, s, info)
    drawToolbar(ctx, W, H, G, s, info)
    if (s.compare) drawCompare(ctx, W, H, s)
    drawToast(ctx, W, H, s)
  }

  // ─── 顶部步骤条 ───
  function drawHeader(ctx, W, s) {
    const bw = 126, bh = 30, gap = 10
    const total = STEPS.length * bw + (STEPS.length - 1) * gap
    const x0 = (W - total) / 2
    STEPS.forEach((st, i) => {
      const x = x0 + i * (bw + gap), y = 10
      const active = s.step === st.key
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 9)
      ctx.fillStyle = active ? C.teal : C.card
      ctx.fill()
      ctx.strokeStyle = active ? C.tealDark : C.line
      ctx.lineWidth = 1
      ctx.stroke()
      if (active) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.beginPath(); ctx.roundRect(x + 1, y + 1, bw - 2, bh / 2, 8); ctx.fill()
      }
      setFont(ctx, 12, 'bold')
      ctx.fillStyle = active ? '#fff' : C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(st.label, x + bw / 2, y + bh / 2 + 1)
      const key = st.key
      pushArea({ n: `step${key}`, x, y, w: bw, h: bh, onClick: () => { S.current.step = key; S.current.compare = false } })
    })

    const sub = STEPS[s.step - 1].sub
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = C.sub
    fitFont(ctx, sub, W - 80, 12)
    ctx.fillText(sub, W / 2, 58)
  }

  // ─── 舞台背景 ───
  function drawStageBack(ctx, G) {
    const { stage, tableY } = G
    const grad = ctx.createLinearGradient(0, stage.y0, 0, tableY)
    grad.addColorStop(0, C.wall)
    grad.addColorStop(1, '#FBFDFD')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.roundRect(stage.x0, stage.y0, stage.x1 - stage.x0, tableY - stage.y0 + 10, 12)
    ctx.fill()
    ctx.strokeStyle = '#E7EEF2'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(stage.x0 + 0.5, stage.y0 + 0.5, stage.x1 - stage.x0 - 1, tableY - stage.y0 + 9, 12)
    ctx.stroke()
  }

  // ─── 实验台 ───
  function drawBench(ctx, G) {
    const { stage, tableY } = G
    const x0 = stage.x0 + 14, x1 = stage.x1 - 14, d = 15
    ctx.beginPath()
    ctx.moveTo(x0, tableY); ctx.lineTo(x1, tableY)
    ctx.lineTo(x1 - 22, tableY + d); ctx.lineTo(x0 + 22, tableY + d)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, tableY, 0, tableY + d)
    g.addColorStop(0, '#F6F2EA'); g.addColorStop(1, '#EFE8DC')
    ctx.fillStyle = g; ctx.fill()
    ctx.strokeStyle = '#DFD6C6'; ctx.lineWidth = 1; ctx.stroke()

    // 前沿厚度
    ctx.beginPath()
    ctx.moveTo(x0 + 22, tableY + d); ctx.lineTo(x1 - 22, tableY + d)
    ctx.lineTo(x1 - 24, tableY + d + 9); ctx.lineTo(x0 + 24, tableY + d + 9)
    ctx.closePath()
    ctx.fillStyle = '#E3DACA'; ctx.fill()
  }

  // ─── 装置：立柱 + 横杆 + 悬挂点 + 两球 ───
  function drawRig(ctx, G, s, info, gm) {
    const { beamY, tableY, xA, AY, postX } = G
    const sc = G.sc || 1

    // 立柱（略俯视：左亮右暗）
    const pw = 7 * sc
    const pg = ctx.createLinearGradient(postX - pw, 0, postX + pw, 0)
    pg.addColorStop(0, '#D5DEE3'); pg.addColorStop(0.45, '#B3C0C7'); pg.addColorStop(1, '#8E9CA4')
    ctx.fillStyle = pg
    ctx.fillRect(postX - pw, beamY - 8 * sc, pw * 2, tableY - beamY + 12 * sc)
    // 立柱底座
    ctx.fillStyle = '#97A5AD'
    ctx.beginPath(); ctx.roundRect(postX - 26 * sc, tableY - 12 * sc, 52 * sc, 12 * sc, 3); ctx.fill()
    ctx.fillStyle = '#B9C5CB'
    ctx.beginPath(); ctx.roundRect(postX - 22 * sc, tableY - 16 * sc, 44 * sc, 6 * sc, 2); ctx.fill()

    // 横杆
    const x0 = xA - 34 * sc
    const bh = 10 * sc
    const bg = ctx.createLinearGradient(0, beamY - bh / 2, 0, beamY + bh / 2)
    bg.addColorStop(0, '#F0F4F6'); bg.addColorStop(1, '#C7D2D8')
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.roundRect(x0, beamY - bh / 2, postX - x0 + 6 * sc, bh, 3); ctx.fill()
    ctx.strokeStyle = '#B8C5CC'; ctx.lineWidth = 0.8; ctx.stroke()
    // 横杆刻度
    ctx.strokeStyle = 'rgba(120,140,150,0.55)'
    ctx.lineWidth = 1
    for (let x = x0 + 6; x < postX - 4; x += 9 * sc) {
      ctx.beginPath(); ctx.moveTo(x, beamY + 1); ctx.lineTo(x, beamY + 3.5 * sc); ctx.stroke()
    }

    // A 球底座与立杆
    ctx.fillStyle = '#8A97A0'
    ctx.beginPath(); ctx.roundRect(xA - 27 * sc, tableY - 11 * sc, 54 * sc, 11 * sc, 3); ctx.fill()
    ctx.fillStyle = '#AEBAC1'
    ctx.beginPath(); ctx.roundRect(xA - 24 * sc, tableY - 16 * sc, 48 * sc, 6 * sc, 2); ctx.fill()
    const rA = 16 * sc
    const rodTop = AY + 10 * sc
    ctx.fillStyle = '#9FADB5'
    ctx.beginPath(); ctx.roundRect(xA - 3.5 * sc, rodTop, 7 * sc, tableY - 16 * sc - rodTop, 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillRect(xA - 3 * sc, rodTop, 2 * sc, tableY - 16 * sc - rodTop)

    // A 球
    const ag = ctx.createRadialGradient(xA - 5 * sc, AY - 6 * sc, 1.5, xA, AY, rA)
    ag.addColorStop(0, '#FFFFFF'); ag.addColorStop(0.45, '#C6D0D6'); ag.addColorStop(1, '#79878F')
    ctx.beginPath(); ctx.arc(xA, AY, rA, 0, Math.PI * 2)
    ctx.fillStyle = ag; ctx.fill()
    ctx.strokeStyle = C.pos; ctx.lineWidth = 1.6 * sc; ctx.stroke()
    setFont(ctx, 12 * sc, 'bold'); ctx.fillStyle = C.pos
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('+', xA, AY)
    // A 标注
    setFont(ctx, 11 * sc, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('A', xA - 22 * sc, AY - 26 * sc)
    haloText(ctx, '+Q₁', xA, AY - rA - 12 * sc, C.pos, 10 * sc)

    // 悬挂点（滑块）
    const clipY = beamY - 13 * sc
    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = C.teal; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.roundRect(gm.slideX - 9 * sc, clipY, 18 * sc, 22 * sc, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(18,166,155,0.18)'
    ctx.beginPath(); ctx.roundRect(gm.slideX - 6 * sc, clipY + 3 * sc, 12 * sc, 7 * sc, 2); ctx.fill()
    ctx.fillStyle = C.tealDark
    ctx.beginPath()
    ctx.moveTo(gm.slideX, clipY + 22 * sc)
    ctx.lineTo(gm.slideX - 4 * sc, clipY + 27 * sc)
    ctx.lineTo(gm.slideX + 4 * sc, clipY + 27 * sc)
    ctx.closePath(); ctx.fill()

    // 细线
    ctx.strokeStyle = '#8E8377'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(gm.slideX, gm.dropY); ctx.lineTo(gm.ballX, gm.ballY - 6); ctx.stroke()

    // B 球
    const rB = 13 * sc
    const bg2 = ctx.createRadialGradient(gm.ballX - 4 * sc, gm.ballY - 5 * sc, 1.5, gm.ballX, gm.ballY, rB)
    bg2.addColorStop(0, '#FFFFFF'); bg2.addColorStop(0.45, '#CBD5DA'); bg2.addColorStop(1, '#7C8A92')
    ctx.beginPath(); ctx.arc(gm.ballX, gm.ballY, rB, 0, Math.PI * 2)
    ctx.fillStyle = bg2; ctx.fill()
    ctx.strokeStyle = info.sameSign ? C.pos : C.neg; ctx.lineWidth = 1.6 * sc; ctx.stroke()
    setFont(ctx, 11 * sc, 'bold'); ctx.fillStyle = info.sameSign ? C.pos : C.neg
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(info.sameSign ? '+' : '−', gm.ballX, gm.ballY)

    setFont(ctx, 11 * sc, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    // B 字母放在细线的另一侧上方，避免压住细线与 F 箭头
    ctx.fillText('B', gm.ballX + gm.dir * (rB + 12 * sc), gm.ballY - rB - 10 * sc)
    haloText(ctx, `${info.sameSign ? '+' : '−'}Q₂`, gm.ballX, gm.ballY - rB - 12 * sc, info.sameSign ? C.pos : C.neg, 10 * sc)

    // 点击 B 球切换电性
    pushArea({
      n: 'bBall',
      x: gm.ballX - rB - 4, y: gm.ballY - rB - 4, w: rB * 2 + 8, h: rB * 2 + 8,
      onClick: () => {
        S.current.sB = -S.current.sB
        say(`B 球已切换为${S.current.sB > 0 ? '正电' : '负电'} → ${S.current.sB > 0 ? '同种电荷相斥' : '异种电荷相吸'}`)
      },
    })

    // 拖动悬挂点改距离
    pushArea({
      n: 'beam',
      x: gm.slideX - 12 * sc, y: clipY - 4, w: 24 * sc, h: 26 * sc, cursor: 'grab', drag: 'beam',
      setX: (mx) => {
        const st = S.current
        let r = (mx - G.xA) / G.pxPerCm
        for (let i = 0; i < 6; i++) {
          const inf = coulombInfo({ ...st, rCm: r })
          const th = (Math.min(inf.theta, THETA_DRAW) * Math.PI) / 180
          const d = inf.sameSign ? 1 : -1
          r = (mx - G.xA - d * G.L * Math.sin(th)) / G.pxPerCm
        }
        st.rCm = clamp(Math.round(r * 2) / 2, R_MIN, R_MAX)
      },
    })

    // 竖直参考虚线（悬挂点正下方）
    ctx.save()
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(150,165,172,0.75)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(gm.slideX, gm.dropY); ctx.lineTo(gm.slideX, gm.ballY + 14 * sc); ctx.stroke()
    ctx.restore()
  }

  // ─── 距离标注 ───
  function drawRuler(ctx, G, s, info, gm) {
    const { xA, AY, tableY } = G
    const sc = G.sc || 1
    const ry = Math.min(Math.max(gm.ballY, AY) + 62 * sc, tableY - 16 * sc)
    const x1 = xA, x2 = gm.ballX

    // 白描边打底，避免与箭头/立杆压叠
    ctx.save()
    ctx.lineCap = 'butt'
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(x1, ry); ctx.lineTo(x2, ry); ctx.stroke()
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = '#9FB0B8'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(x1, ry); ctx.lineTo(x2, ry); ctx.stroke()
    ctx.setLineDash([])
    // 两端竖线
    ctx.strokeStyle = '#7E919A'; ctx.lineWidth = 1.4
    for (const x of [x1, x2]) {
      ctx.beginPath(); ctx.moveTo(x, ry - 5); ctx.lineTo(x, ry + 5); ctx.stroke()
    }
    ctx.restore()

    // r 标签
    const label = `r = ${s.rCm.toFixed(1)} cm`
    setFont(ctx, 11, 'bold')
    const tw = ctx.measureText(label).width + 18
    const lx = (x1 + x2) / 2 - tw / 2
    ctx.beginPath(); ctx.roundRect(lx, ry - 9, tw, 18, 9)
    ctx.fillStyle = C.card; ctx.fill()
    ctx.strokeStyle = '#CBD8DE'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = C.tealDark
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, (x1 + x2) / 2, ry + 1)
  }

  // ─── 受力箭头 ───
  function drawForces(ctx, G, s, info, gm) {
    const { dir, ballX, ballY, slideX } = gm
    const sc = G.sc || 1
    const rB = 13 * sc, rA = 16 * sc
    const Fpx = clamp((14 + info.tan * 40) * sc, 16 * sc, 118 * sc)
    const mgPx = 44 * sc
    const thetaRad = gm.th

    // 细线方向单位向量（从球指向悬挂点）
    const dx = slideX - ballX, dy = gm.dropY - ballY
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len

    // 重力 mg（竖直向下，往左让开球体与电荷标签）
    arrow(ctx, ballX - 32 * sc, ballY + rB - 4 * sc, ballX - 32 * sc, ballY + rB - 4 * sc + mgPx, C.mg, 1.8, 'mg', '#233', 9)
    // 悬线拉力 T（沿细线方向，不给文字标签，避免压住 −Q₂ 与偏角弧）
    const tPx = clamp(mgPx / Math.max(0.55, Math.cos(thetaRad)), mgPx, 120 * sc)
    arrow(ctx, ballX + ux * (rB + 2), ballY + uy * (rB + 2),
      ballX + ux * (rB + 2) + ux * tPx, ballY + uy * (rB + 2) + uy * tPx, C.tension, 1.8, '')

    // 静电力 F（水平；标签放在箭尖外侧，避免与 B 字母叠在一起）
    const fx0 = ballX + dir * (rB + 2 * sc)
    const fx1 = fx0 + dir * Fpx
    arrow(ctx, fx0, ballY, fx1, ballY, C.teal, 3, '')
    setFont(ctx, 11, 'bold'); ctx.fillStyle = '#0B4F4A'
    ctx.textAlign = dir > 0 ? 'left' : 'right'; ctx.textBaseline = 'middle'
    ctx.fillText('F', fx1 + dir * 5, ballY)

    // A 球的反作用力 F′（等大反向）
    const ax0 = G.xA - dir * (rA + 2 * sc)
    const ax1 = ax0 - dir * Fpx
    arrow(ctx, ax0, G.AY, ax1, G.AY, C.teal, 3, '')
    setFont(ctx, 11, 'bold'); ctx.fillStyle = '#0B4F4A'
    ctx.textAlign = dir > 0 ? 'right' : 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('F′', ax1 - dir * 5, G.AY)

    // 偏角 θ（悬挂点处：竖直向下 ↔ 细线）
    const px0 = slideX, py0 = gm.dropY
    const arcR = Math.min(54 * sc, len * 0.5)
    const a0 = Math.PI / 2                                  // 竖直向下
    const a1 = Math.atan2(ballY - py0, ballX - px0)         // 悬挂点 → 球 的方向
    ctx.save()
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(px0, py0, arcR, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke()
    // 两条夹边的短引线
    ctx.strokeStyle = 'rgba(226,163,60,0.7)'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(px0, py0 + 8); ctx.lineTo(px0, py0 + arcR - 4); ctx.stroke()
    ctx.restore()

    // 标签贴着弧的外侧：小角时在左、偏角大时换到右，避免压住细线
    const side = info.theta > 22 ? 1 : -1
    const label = `θ = ${info.theta.toFixed(1)}°`
    setFont(ctx, 11, 'bold')
    const tw = ctx.measureText(label).width + 14
    const lx = px0 + side * (arcR + 10 + tw / 2)
    const ly = py0 + arcR * 0.72
    ctx.beginPath(); ctx.roundRect(lx - tw / 2, ly - 9, tw, 18, 9)
    ctx.fillStyle = '#FFF7E6'; ctx.fill()
    ctx.strokeStyle = '#E8C98A'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = '#8A5A12'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, lx, ly + 1)
  }

  function arrow(ctx, x0, y0, x1, y1, color, width, label, labelColor = '#233', labelSize = 10) {
    const dx = x1 - x0, dy = y1 - y0
    const L = Math.hypot(dx, dy)
    if (L < 6) return
    const ux = dx / L, uy = dy / L
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * 6, y1 - uy * 6); ctx.stroke()
    ctx.lineCap = 'butt'
    // 箭头
    const hw = Math.max(4, width * 1.9), hl = Math.max(9, width * 3.4)
    const px = -uy, py = ux
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 - ux * hl + px * hw, y1 - uy * hl + py * hw)
    ctx.lineTo(x1 - ux * hl - px * hw, y1 - uy * hl - py * hw)
    ctx.closePath(); ctx.fill()

    if (label) {
      setFont(ctx, labelSize, 'bold')
      const tw = ctx.measureText(label).width
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
      const nx = -uy, ny = ux
      const off = width + 8
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.beginPath(); ctx.roundRect(mx + nx * off - tw / 2 - 3, my + ny * off - 8, tw + 6, 15, 4); ctx.fill()
      ctx.fillStyle = labelColor
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(label, mx + nx * off, my + ny * off)
    }
  }

  // ─── 第一步的器材指认（部件编号；说明文字放右侧「认识装置」卡） ───
  function drawCallouts(ctx, G, s, gm) {
    const sc = G.sc || 1
    const rulerY = Math.min(Math.max(gm.ballY, G.AY) + 62 * sc, G.tableY - 16 * sc)
    const badge = (n, x, y) => {
      ctx.beginPath(); ctx.arc(x, y, 9 * sc, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill()
      ctx.strokeStyle = C.teal; ctx.lineWidth = 1.4; ctx.stroke()
      setFont(ctx, 10 * sc, 'bold'); ctx.fillStyle = C.tealDark
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(n), x, y + 0.5)
    }
    badge(1, G.xA + 26 * sc, G.AY - 20 * sc)
    badge(2, gm.ballX + 27 * sc, gm.ballY + 32 * sc)
    badge(3, gm.slideX + 21 * sc, G.beamY - 16 * sc)
    badge(4, gm.ballX + 21 * sc, rulerY - 1)
  }

  // ─── 舞台右上角状态标 ───
  function drawStageFoot(ctx, G, s, info) {
    const { stage } = G
    const hint = info.sameSign ? '同种电荷相斥 · B 球远离 A 偏转' : '异种电荷相吸 · B 球靠近 A 偏转'
    const dotTxt = '● 已稳定'
    const restTxt = `  |  ${hint}`
    setFont(ctx, 9.5, 'bold')
    const dotW = ctx.measureText(dotTxt).width
    setFont(ctx, 9.5)
    const tw = dotW + ctx.measureText(restTxt).width + 20
    const x = stage.x1 - 14 - tw, y = stage.y0 + 10
    ctx.beginPath(); ctx.roundRect(x, y, tw, 21, 10)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill()
    ctx.strokeStyle = '#DCEAE8'; ctx.lineWidth = 1; ctx.stroke()
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.teal
    ctx.fillText(dotTxt, x + 10, y + 11)
    setFont(ctx, 9.5); ctx.fillStyle = C.sub
    ctx.fillText(restTxt, x + 10 + dotW, y + 11)
  }

  // ─── 右侧面板 ───
  function drawRightPanel(ctx, W, H, G, s, info) {
    const x = W - 282, w = 262
    const y = 76, h = Math.max(300, H - 76 - 112)

    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill()
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()

    let ky = y + 14
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    setFont(ctx, 12, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('受力可视化', x + 14, ky)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    ctx.fillText('等大 · 反向（沿两球连线）', x + 14, ky + 18)

    // 迷你等大反向示意
    const mx = x + w - 74, my = ky + 20
    miniArrow(ctx, mx, my, 26, C.teal)
    miniArrow(ctx, mx + 60, my, -26, C.teal)

    ky += 42
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 12, ky); ctx.lineTo(x + w - 12, ky); ctx.stroke()

    // 实时偏角
    ky += 10
    setFont(ctx, 10); ctx.fillStyle = C.sub
    ctx.fillText('实时偏角', x + 14, ky)
    const thetaTxt = info.theta.toFixed(1)
    setFont(ctx, 24, 'bold'); ctx.fillStyle = '#8A5A12'
    ctx.fillText(`${thetaTxt}°`, x + 66, ky - 6)
    if (info.theta > THETA_DRAW) {
      setFont(ctx, 9); ctx.fillStyle = '#C0392B'
      ctx.fillText('超出图示量程', x + 122, ky + 2)
    }

    ky += 40
    ctx.beginPath(); ctx.moveTo(x + 12, ky); ctx.lineTo(x + w - 12, ky); ctx.stroke()
    ky += 10
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('实时数据', x + 14, ky)
    ky += 18

    const rows = [
      ['球心距 r', `${s.rCm.toFixed(1)} cm`],
      ['Q₁（A，固定正电）', `+${s.Q1} nC`],
      ['Q₂（B，可切换）', `${info.sameSign ? '+' : '−'}${s.Q2} nC`],
      ['F = kQ₁Q₂/r²', `${sciText(info.F)} N`],
      ['F = mg tanθ', `${sciText(MG * info.tan)} N`],
      ['T = mg/cosθ', `${sciText(MG / Math.max(0.55, Math.cos((info.theta * Math.PI) / 180)))} N`],
    ]
    for (const [k, v] of rows) {
      setFont(ctx, 9.5); ctx.fillStyle = C.sub
      ctx.fillText(k, x + 14, ky)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'right'; ctx.fillText(v, x + w - 14, ky)
      ctx.textAlign = 'left'
      ky += 15
    }
    setFont(ctx, 9); ctx.fillStyle = C.teal
    ctx.fillText('✓ 两式结果一致（重力平衡条件）', x + 14, ky)
    ky += 16

    // 实验记录
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 12, ky); ctx.lineTo(x + w - 12, ky); ctx.stroke()
    ky += 9
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText(`实验记录 · ${s.records.length}/${MAX_REC}`, x + 14, ky)
    ky += 16

    // 表头
    const cols = [x + 20, x + 46, x + 106, x + 148, x + 206]
    ctx.fillStyle = C.tealSoft
    ctx.beginPath(); ctx.roundRect(x + 12, ky - 2, w - 24, 15, 3); ctx.fill()
    setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'center'
    ;['#', 'r/cm', 'θ/°', 'F/10⁻⁴N', 'Q₁Q₂'].forEach((t, i) => ctx.fillText(t, cols[i], ky + 6))
    ky += 17

    if (s.records.length === 0) {
      setFont(ctx, 9); ctx.fillStyle = C.faint
      ctx.textAlign = 'left'
      ctx.fillText('点底部「保存状态」记录当前一组数据', x + 14, ky)
      ky += 16
    } else {
      for (let i = 0; i < s.records.length; i++) {
        const rc = s.records[i]
        if (i % 2 === 1) { ctx.fillStyle = '#F7FAFB'; ctx.beginPath(); ctx.roundRect(x + 12, ky - 2, w - 24, 14, 3); ctx.fill() }
        setFont(ctx, 9); ctx.fillStyle = C.ink
        ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), cols[0], ky + 5)
        ctx.fillText(rc.rCm.toFixed(1), cols[1], ky + 5)
        ctx.fillText(rc.theta.toFixed(1), cols[2], ky + 5)
        ctx.fillText((rc.F * 1e4).toFixed(2), cols[3], ky + 5)
        ctx.fillText(String(rc.Q1 * rc.Q2), cols[4], ky + 5)
        ky += 14
      }
    }
    ctx.textAlign = 'left'

    // 底部随步骤切换的说明卡
    const blocks = {
      1: {
        title: '认识装置',
        warm: false,
        lines: [
          '① 固定带电球 A：底座固定，带正电，电量 Q₁ 可调',
          '② 悬线轻质导电球 B：点击球体即可切换正负电',
          '③ 悬挂点：沿横杆拖动 → 改变两球距离 r',
          '④ 米尺（虚线）：量两球球心距 r，单位 cm',
          '关键：B 球偏角 θ 才是静电力的"读数"',
        ],
      },
      2: {
        title: '操作提示 · 探究距离',
        warm: false,
        lines: [
          '• 电荷量已锁定（控制变量）',
          '• 拖动横杆上的悬挂点，或拉底部「调节距离」',
          '• r 越小 → θ 越大 → 静电力越大',
          '• 每组点「保存状态」，最多存 4 组',
        ],
      },
      3: {
        title: '操作提示 · 探究电荷量',
        warm: false,
        lines: [
          '• 距离 r 已锁定（控制变量）',
          '• 拖动 Q₁ / Q₂ 滑块改变电荷量',
          '• θ 与静电力箭头 F 随 Q₁Q₂ 同步变化',
          '• 点击 B 球可切换正负电，看同斥异吸',
        ],
      },
      4: {
        title: '结论',
        warm: true,
        lines: [
          '① B 球平衡：F = mg tanθ（θ 是力的放大镜）',
          '② 锁 r → F ∝ Q₁Q₂；锁 Q → F ∝ 1/r²',
          '③ 合起来即库仑定律 F = kQ₁Q₂/r²',
          '⚠ θ 只能比较力的大小，不能说 F ∝ θ',
        ],
      },
    }
    const blk = blocks[s.step] || blocks[1]
    const cardY = Math.max(ky + 10, y + h - 150)
    const cardH = y + h - 10 - cardY
    if (cardH > 46) {
      ctx.beginPath(); ctx.roundRect(x + 10, cardY, w - 20, cardH, 8)
      ctx.fillStyle = blk.warm ? '#FFFBF2' : '#F4FAF9'; ctx.fill()
      ctx.strokeStyle = blk.warm ? '#F0DFBB' : '#D9E9E7'; ctx.lineWidth = 1; ctx.stroke()
      let ly = cardY + 11
      setFont(ctx, 10, 'bold')
      ctx.fillStyle = blk.warm ? '#8A5A12' : C.tealDark
      ctx.fillText(blk.title, x + 20, ly)
      ly += 15
      setFont(ctx, 9); ctx.fillStyle = blk.warm ? '#5A4526' : '#3C5A5E'
      for (const ln of blk.lines) {
        if (ly > cardY + cardH - 6) break
        fitFont(ctx, ln, w - 40, 9)
        ctx.fillText(ln, x + 20, ly)
        ly += 13.5
      }
    }
  }

  function haloText(ctx, text, x, y, color, size = 10) {
    setFont(ctx, size, 'bold')
    const w = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.roundRect(x - w / 2 - 3, y - 7, w + 6, 14, 4); ctx.fill()
    ctx.fillStyle = color
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  }

  function miniArrow(ctx, x, y, len, color) {
    const dir = len > 0 ? 1 : -1
    ctx.strokeStyle = color; ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x + len, y); ctx.lineTo(x + len - dir * 7, y - 4); ctx.lineTo(x + len - dir * 7, y + 4)
    ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.arc(x + dir * 3, y, 2.4, 0, Math.PI * 2); ctx.fill()
  }

  // ─── 底部工具栏 ───
  function drawToolbar(ctx, W, H, G, s, info) {
    const { stage } = G
    const bx = stage.x0, bw = stage.x1 - stage.x0
    const by = H - 98
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 86, 12)
    ctx.fillStyle = C.card; ctx.fill()
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()

    const lockR = s.step === 3   // 第三步锁距离
    const lockQ = s.step === 2   // 第二步锁电荷量

    const k = clamp(bw / 980, 0.72, 1)
    const s1 = 156 * k, s2 = 108 * k, s3 = 108 * k
    let cx = bx + 16

    // 调节距离
    ctx.textBaseline = 'middle'
    setFont(ctx, 10, 'bold')
    ctx.fillStyle = lockR ? C.faint : C.tealDark
    ctx.textAlign = 'left'
    ctx.fillText('↔ 调节距离', cx, by + 22)
    if (lockR) { setFont(ctx, 8); ctx.fillStyle = C.faint; ctx.fillText('已锁定', cx + 2, by + 34) }
    drawSlider(ctx, {
      x: cx + 70, y: by + 26, w: s1,
      ratio: (s.rCm - R_MIN) / (R_MAX - R_MIN),
      disabled: lockR,
      name: 'rSlider',
      onChange: (r) => { S.current.rCm = clamp(Math.round((R_MIN + r * (R_MAX - R_MIN)) * 2) / 2, R_MIN, R_MAX) },
    })
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText(`${s.rCm.toFixed(1)} cm`, cx + 70 + s1 + 12, by + 22)
    cx += 70 + s1 + 74

    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx, by + 10); ctx.lineTo(cx, by + 44); ctx.stroke()
    cx += 14

    // 电荷量
    setFont(ctx, 10, 'bold')
    ctx.fillStyle = lockQ ? C.faint : C.tealDark
    ctx.fillText('⚡ 调节电荷量', cx, by + 22)
    if (lockQ) { setFont(ctx, 8); ctx.fillStyle = C.faint; ctx.fillText('已锁定', cx + 2, by + 34) }
    cx += 96

    const qLabel = (v) => `Q₁ +${v}`
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.pos
    ctx.fillText(qLabel(s.Q1), cx, by + 14)
    drawSlider(ctx, {
      x: cx, y: by + 30, w: s2,
      ratio: (s.Q1 - Q_MIN) / (Q_MAX - Q_MIN),
      disabled: lockQ, accent: C.pos,
      name: 'q1Slider',
      onChange: (r) => { S.current.Q1 = clamp(Q_MIN + Math.round((r * (Q_MAX - Q_MIN)) / Q_STEP) * Q_STEP, Q_MIN, Q_MAX) },
    })
    cx += s2 + 18

    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = info.sameSign ? C.pos : C.neg
    ctx.fillText(`Q₂ ${info.sameSign ? '+' : '−'}${s.Q2}`, cx, by + 14)
    drawSlider(ctx, {
      x: cx, y: by + 30, w: s3,
      ratio: (s.Q2 - Q_MIN) / (Q_MAX - Q_MIN),
      disabled: lockQ, accent: info.sameSign ? C.pos : C.neg,
      name: 'q2Slider',
      onChange: (r) => { S.current.Q2 = clamp(Q_MIN + Math.round((r * (Q_MAX - Q_MIN)) / Q_STEP) * Q_STEP, Q_MIN, Q_MAX) },
    })

    // 第二行按钮
    const btnY = by + 52, btnH = 24
    let bxx = bx + 16

    drawBtn(ctx, bxx, btnY, 108, btnH, `B 球：${info.sameSign ? '+Q₂ 正电' : '−Q₂ 负电'}`, 'plain', () => {
      S.current.sB = -S.current.sB
      say(`B 球已切换为${S.current.sB > 0 ? '正电' : '负电'} → ${S.current.sB > 0 ? '同种电荷相斥' : '异种电荷相吸'}`)
    }, 'toggleB')
    bxx += 116

    drawBtn(ctx, bxx, btnY, 92, btnH, '💾 保存状态', 'primary', () => {
      const st = S.current
      const inf = coulombInfo(st)
      if (st.records.length >= MAX_REC) {
        st.records.shift()
        say(`最多保留 ${MAX_REC} 组，已替换最早一组`)
      } else {
        say('已保存当前状态')
      }
      st.records.push({
        rCm: st.rCm, Q1: st.Q1, Q2: st.Q2, sB: st.sB,
        theta: inf.theta, F: inf.F, tan: inf.tan,
      })
    }, 'saveBtn')
    bxx += 100

    drawBtn(ctx, bxx, btnY, 96, btnH, '⇄ 叠加对比', 'plain', () => {
      S.current.compare = true
    }, 'compareBtn')
    bxx += 104

    drawBtn(ctx, bxx, btnY, 74, btnH, '↺ 重置', 'ghost', () => {
      const st = S.current
      st.Q1 = 40; st.Q2 = 40; st.rCm = 20; st.sB = 1; st.records = []
      say('已恢复初始状态')
    }, 'resetBtn')

    // 右侧提示
    setFont(ctx, 9); ctx.fillStyle = C.faint
    ctx.textAlign = 'right'
    fitFont(ctx, '拖动横杆上的悬挂点也可以直接改 r', bw - 300, 9)
    ctx.fillText('拖动横杆上的悬挂点也可以直接改 r', bx + bw - 16, by + 66)
  }

  function drawSlider(ctx, { x, y, w, ratio, onChange, disabled, accent, name }) {
    const ac = accent || C.teal
    ctx.beginPath(); ctx.roundRect(x, y - 3, w, 6, 3)
    ctx.fillStyle = disabled ? '#E4EAED' : '#DCE4E8'
    ctx.fill()
    if (!disabled) {
      ctx.beginPath(); ctx.roundRect(x, y - 3, Math.max(3, clamp(ratio, 0, 1) * w), 6, 3)
      ctx.fillStyle = ac; ctx.fill()
    }
    const kx = x + clamp(ratio, 0, 1) * w
    ctx.beginPath(); ctx.arc(kx, y, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = disabled ? '#C4CDD2' : '#FFFFFF'
    ctx.fill()
    ctx.strokeStyle = disabled ? '#B8C2C8' : ac; ctx.lineWidth = 1.6; ctx.stroke()
    if (!disabled) {
      pushArea({
        n: name || 'slider',
        x: x - 10, y: y - 14, w: w + 20, h: 28, drag: 'slider',
        setX: (mx) => onChange(clamp((mx - x) / w, 0, 1)),
      })
    }
  }

  function drawBtn(ctx, x, y, w, h, label, tone, onClick, name) {
    const tones = {
      primary: { bg: C.teal, bd: C.tealDark, fg: '#fff' },
      plain: { bg: '#F3F8F9', bd: '#D2E1E6', fg: '#205863' },
      ghost: { bg: '#F6F7F8', bd: '#DDE3E6', fg: '#7A8A92' },
    }[tone] || { bg: '#fff', bd: '#ddd', fg: '#333' }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 7)
    ctx.fillStyle = tones.bg; ctx.fill()
    ctx.strokeStyle = tones.bd; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 10, 'bold'); ctx.fillStyle = tones.fg
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    fitFont(ctx, label, w - 12, 10, 'bold')
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5)
    pushArea({ n: name || 'btn', x, y, w, h, onClick, modal: false })
  }

  // ─── 叠加对比弹窗 ───
  function drawCompare(ctx, W, H, s) {
    ctx.fillStyle = 'rgba(16,30,38,0.45)'
    ctx.fillRect(0, 0, W, H)

    const cw = Math.min(860, W - 80), ch = Math.min(440, H - 70)
    const x = (W - cw) / 2, y = (H - ch) / 2
    ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 12)
    ctx.fillStyle = '#FBFDFD'; ctx.fill()
    ctx.strokeStyle = '#D6E2E7'; ctx.lineWidth = 1; ctx.stroke()

    setFont(ctx, 14, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('实验对比 · 同一比例尺并列', x + 22, y + 18)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    ctx.fillText('控制变量：一次只改一个量 —— 状态并排，θ 的变化一眼看出', x + 22, y + 40)

    // 关闭按钮
    const cbx = x + cw - 44, cby = y + 16
    ctx.beginPath(); ctx.roundRect(cbx, cby, 28, 24, 6)
    ctx.fillStyle = '#F1F5F7'; ctx.fill()
    ctx.strokeStyle = '#DCE5E9'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 12, 'bold'); ctx.fillStyle = C.sub
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('✕', cbx + 14, cby + 12)
    pushArea({ x: cbx, y: cby, w: 28, h: 24, modal: true, onClick: () => { S.current.compare = false } })

    const listY = y + 66
    const listH = ch - 66 - 62

    if (s.records.length === 0) {
      setFont(ctx, 12); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('还没有保存的状态 —— 先关闭弹窗，在底部点「💾 保存状态」', x + cw / 2, listY + listH / 2)
    } else {
      const n = s.records.length
      const gap = 12
      const pw = (cw - 44 - gap * (n - 1)) / n
      for (let i = 0; i < n; i++) {
        const px = x + 22 + i * (pw + gap)
        const rc = s.records[i]
        ctx.beginPath(); ctx.roundRect(px, listY, pw, listH, 10)
        ctx.fillStyle = '#FFFFFF'; ctx.fill()
        ctx.strokeStyle = '#E3EBEF'; ctx.lineWidth = 1; ctx.stroke()

        setFont(ctx, 10, 'bold'); ctx.fillStyle = C.tealDark
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.fillText(`状态 ${i + 1}`, px + 12, listY + 10)

        drawMiniState(ctx, { x: px, y: listY + 24, w: pw, h: listH - 24 }, rc)

        // 数值
        const my = listY + listH - 46
        setFont(ctx, 9); ctx.fillStyle = C.sub; ctx.textAlign = 'left'
        ctx.fillText(`r = ${rc.rCm.toFixed(1)} cm`, px + 12, my)
        ctx.fillText(`Q₁Q₂ = ${rc.Q1 * rc.Q2} nC²`, px + 12, my + 13)
        setFont(ctx, 9, 'bold'); ctx.fillStyle = '#8A5A12'
        ctx.fillText(`θ = ${rc.theta.toFixed(1)}°`, px + 12, my + 26)
        setFont(ctx, 9, 'bold'); ctx.fillStyle = C.tealDark
        ctx.textAlign = 'right'
        ctx.fillText(`F = ${sciText(rc.F)} N`, px + pw - 12, my + 26)
        ctx.textAlign = 'left'
      }
    }

    setFont(ctx, 9.5); ctx.fillStyle = C.sub
    ctx.textAlign = 'center'
    fitFont(ctx, '同一比例尺下：θ 越大 → F = mg tanθ 越大；同一组合内只改一个变量，控制变量的过程清清楚楚', cw - 40, 9.5)
    ctx.fillText('同一比例尺下：θ 越大 → F = mg tanθ 越大；同一组合内只改一个变量，控制变量的过程清清楚楚', x + cw / 2, y + ch - 22)
    ctx.textAlign = 'left'
  }

  // 迷你状态图：同一比例尺
  function drawMiniState(ctx, box, rc) {
    const dir = rc.sB > 0 ? 1 : -1
    const th = (Math.min(rc.theta, THETA_DRAW) * Math.PI) / 180
    const pxPerCm = (box.w - 56) / R_MAX          // 同一比例尺
    const usable = Math.max(90, box.h - 56)
    const L = Math.max(60, usable * 0.80)
    const ax = box.x + 26
    const ay = box.y + 14 + L
    const bx = ax + rc.rCm * pxPerCm
    const by = ay + 3
    const sx = bx - dir * L * Math.sin(th)
    const sy = by - L * Math.cos(th)

    // 台面
    ctx.strokeStyle = '#E7DED0'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(box.x + 10, by + 20); ctx.lineTo(box.x + box.w - 10, by + 20); ctx.stroke()
    // A 立杆
    ctx.strokeStyle = '#C7D2D8'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.moveTo(ax, ay + 6); ctx.lineTo(ax, by + 20); ctx.stroke()
    // 横杆
    ctx.strokeStyle = '#D3DDE2'; ctx.lineWidth = 2.4
    ctx.beginPath(); ctx.moveTo(sx - 18, sy); ctx.lineTo(sx + 58, sy); ctx.stroke()
    // 竖直线 + 细线
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#C6D2D8'; ctx.lineWidth = 0.9
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + L * 0.9); ctx.stroke(); ctx.restore()
    ctx.strokeStyle = '#A79A8C'; ctx.lineWidth = 1.3
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(bx, by - 7); ctx.stroke()
    // 悬挂点
    ctx.fillStyle = C.teal
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill()
    // A 球
    ctx.fillStyle = '#ADBAC2'
    ctx.beginPath(); ctx.arc(ax, ay, 8, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = C.pos; ctx.lineWidth = 1.3; ctx.stroke()
    // B 球
    ctx.fillStyle = '#ADBAC2'
    ctx.beginPath(); ctx.arc(bx, by, 6.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = dir > 0 ? C.pos : C.neg; ctx.lineWidth = 1.3; ctx.stroke()
    // 力箭头（等大反向）
    ctx.strokeStyle = C.teal; ctx.lineWidth = 1.8
    const fl = clamp(7 + rc.tan * 16, 8, 34) * dir
    ctx.beginPath(); ctx.moveTo(bx + dir * 6, by); ctx.lineTo(bx + dir * 6 + fl, by); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ax - dir * 7, ay); ctx.lineTo(ax - dir * 7 - fl, ay); ctx.stroke()
    // 距离标注
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#B5C4CB'; ctx.lineWidth = 0.9
    ctx.beginPath(); ctx.moveTo(ax, by + 14); ctx.lineTo(bx, by + 14); ctx.stroke(); ctx.restore()
    setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('r', (ax + bx) / 2 - 2, by + 21)
  }

  // ─── 提示条 ───
  function drawToast(ctx, W, H, s) {
    const t = s.toast
    if (!t || Date.now() > t.until) return
    const left = Math.max(0, (t.until - Date.now()) / 2200)
    setFont(ctx, 11, 'bold')
    const tw = ctx.measureText(t.text).width + 34
    const x = (W - tw) / 2, y = H - 46
    ctx.globalAlpha = Math.min(1, left * 2.2)
    ctx.beginPath(); ctx.roundRect(x, y, tw, 28, 14)
    ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.fill()
    ctx.strokeStyle = '#CFE3E1'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = C.tealDark
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(t.text, W / 2, y + 15)
    ctx.globalAlpha = 1
  }

  // ================================================================
  //  Tab 2：自己动手（保留原有器材台）
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150, palX = W - palW - 10

    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()

    for (const wire of s.wires) {
      const c1 = s.components.find(c => c.id === wire.from.compId)
      const c2 = s.components.find(c => c.id === wire.to.compId)
      if (!c1 || !c2) continue
      const p1 = getTermPos(c1, wire.from.portIndex), p2 = getTermPos(c2, wire.to.portIndex)
      ctx.strokeStyle = wire.color || s.wireColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.lineCap = 'butt'
    }
    if (s.connecting) {
      const c1 = s.components.find(c => c.id === s.connecting.compId)
      if (c1) { const p1 = getTermPos(c1, s.connecting.portIndex); ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke(); ctx.setLineDash([]) }
    }
    for (const comp of s.components) drawComp(ctx, comp)

    const bx = 22, by = H - 130, bw = palX - 50
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, s._guideOpen ? 118 : 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('📋 操作说明', bx + 10, by + 18)
    ctx.textAlign = 'right'; ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx + bw - 10, by + 18)
    pushArea({ x: bx - 5, y: by - 3, w: bw + 10, h: 42, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = `10px ${FONT}`; ['① 拖入电荷到画布', '② 调节电量和距离', '③ 观察力的大小和方向', '④ 右键删除电荷', '⑤ 同号相斥异号相吸'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'

    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)
    const items = [
      { type: 'posCharge', name: '正电荷 +Q' },
      { type: 'negCharge', name: '负电荷 -Q' },
      { type: 'electrometer', name: '静电计（干扰）' },
      { type: 'conductor', name: '导体球（干扰）' },
      { type: 'insulator', name: '绝缘棒（干扰）' },
      { type: 'ground', name: '接地线（干扰）' },
    ]
    const itemH = 30
    for (let i = 0; i < items.length; i++) {
      const iy = y + 32 + i * (itemH + 3)
      if (iy + itemH > y + h - 75) break
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ccc'
      ctx.beginPath(); ctx.roundRect(x + 6, iy, w - 12, itemH, 5); ctx.fill(); ctx.stroke()
      drawPaletteIcon(ctx, x + 18, iy + itemH / 2, items[i].type)
      ctx.fillStyle = '#333'; ctx.font = `10px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(items[i].name, x + 34, iy + itemH / 2)
      canvasRef.current._palAreas.push({ x: x + 6, y: iy, w: w - 12, h: itemH, type: items[i].type })
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaletteIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'posCharge') {
      ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0)
    } else if (type === 'negCharge') {
      ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−', 0, 0)
    } else if (type === 'electrometer') {
      ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.fillRect(-8, -6, 16, 12); ctx.strokeRect(-8, -6, 16, 12)
    } else if (type === 'conductor') {
      ctx.fillStyle = '#BDBDBD'; ctx.strokeStyle = '#757575'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    } else if (type === 'insulator') {
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke()
    } else if (type === 'ground') {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 4); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(6, 4); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-4, 7); ctx.lineTo(4, 7); ctx.stroke()
    }
    ctx.restore()
  }

  function getTermPos(comp) { return { x: comp.x, y: comp.y } }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'posCharge') {
      const r = 15 + (comp.props?.Q || 5) * 2
      ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = `bold 16px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0)
      ctx.fillStyle = '#333'; ctx.font = `10px ${FONT}`; ctx.textBaseline = 'top'
      ctx.fillText(`+${comp.props?.Q || 5}μC`, 0, r + 8)
    } else if (comp.type === 'negCharge') {
      const r = 15 + (comp.props?.Q || 3) * 2
      ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = `bold 16px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−', 0, 0)
      ctx.fillStyle = '#333'; ctx.font = `10px ${FONT}`; ctx.textBaseline = 'top'
      ctx.fillText(`-${comp.props?.Q || 3}μC`, 0, r + 8)
    } else if (comp.type === 'electrometer') {
      ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-14, -10, 28, 20, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('静电计', 0, 0)
    } else if (comp.type === 'conductor') {
      ctx.fillStyle = '#BDBDBD'; ctx.strokeStyle = '#757575'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#333'; ctx.font = `9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('导体', 0, 0)
    } else if (comp.type === 'insulator') {
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke(); ctx.lineCap = 'butt'
    } else if (comp.type === 'ground') {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 6); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(8, 6); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(6, 10); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(4, 14); ctx.stroke()
    }
    ctx.restore()
  }

  // 交互
  function getPos(e) { return eventToCanvas(canvasRef.current, e) }

  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    const areas = canvasRef.current._clickAreas || []
    const hit = (a) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h

    if (s.tab === 1) {
      if (s.compare) {
        for (const a of areas) { if (a.modal && hit(a)) { a.onClick(); return } }
        return
      }
      for (const a of areas) {
        if (a.modal) continue
        if (!hit(a)) continue
        if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
        if (a.drag === 'beam') { s.dragBeam = true; a.setX(x); return }
        if (a.onClick) { a.onClick(x, y); return }
      }
      return
    }
    // Tab2
    for (const a of areas) { if (hit(a)) { if (a.onClick) a.onClick(); return } }
    for (const a of canvasRef.current._palAreas || []) {
      if (hit(a)) {
        if (a.type) {
          s.components.push({ id: s.nextId++, type: a.type, x, y, closed: true, props: { Q: a.type === 'posCharge' ? 5 : 3 } })
          s.dragId = s.nextId - 1
          forceUpdate(n => n + 1)
          return
        }
      }
    }
    for (const c of s.components) {
      if (Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25) { s.dragId = c.id; s.dragOffX = x - c.x; s.dragOffY = y - c.y; forceUpdate(n => n + 1); return }
    }
  }

  function handleMouseMove(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) {
      if (s.dragSlider) { s.dragSlider.setX(x); return }
      if (s.dragBeam) {
        for (const a of canvasRef.current._clickAreas || []) { if (a.drag === 'beam') { a.setX(x); return } }
      }
      return
    }
    if (s.dragId == null) return
    const c = s.components.find(c => c.id === s.dragId)
    if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) }
  }

  function handleMouseUp() { S.current.dragSlider = null; S.current.dragBeam = false; S.current.dragId = null }
  function handleDoubleClick() {}

  function handleContextMenu(e) {
    e.preventDefault()
    const s = S.current
    if (s.tab !== 2) return
    const { x, y } = getPos(e)
    const idx = s.components.findIndex(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25)
    if (idx >= 0) { s.components.splice(idx, 1); forceUpdate(n => n + 1) }
  }

  return (
    <SceneShell
      title="库仑定律探究"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; S.current.compare = false; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'default' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
