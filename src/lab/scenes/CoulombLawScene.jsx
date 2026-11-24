import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * CoulombLawScene — 库仑定律探究（悬线偏角法）
 *
 * 器材与物理逻辑对齐「探究电荷间的相互作用力」3D 交互课件：
 *   A = 固定在底座上的较大带电球体（电荷分布在球表面）
 *   B = 细线悬挂的轻质小球（点电荷，悬点可在横杆上平移 → 改距离 r）
 *   B 球三力平衡：重力 mg（竖直向下）、悬线拉力 T（沿细线）、静电力 F（水平）
 *   → tanθ = F / mg，即 F = mg tanθ —— 偏角 θ 是"把看不见的静电力放大"的读数
 *   A 球在 B 处产生的场强 E = kQ/r²，点电荷受力 F = q·E = kQq/r²
 *   真实量级下库仑力很小（10⁻⁴~10⁻⁵ N），所以 θ 只有零点几度到几度：
 *   图示默认按 ANGLE_GAIN 放大偏角（面板数值仍是真实偏角），可切到真实比例
 *
 * 四步探究：
 *   ① 认识装置：点击 B 球切换正负电，同种相斥、异种相吸
 *   ② 探究距离：锁 Q、q，移动悬挂点改 r → r 越小 θ 越大
 *   ③ 探究电荷量：锁 r，改电荷量 → θ 随 Q·q 同步变化
 *   ④ 实验结论：F = mg tanθ 与 F = q·E 两式对上，θ 不能当成正比量
 */
const K_COUL = 9e9
const BALL_M = 5e-4            // 0.5 g 轻质导电小球（点电荷 B）
const MG = BALL_M * 9.8        // ≈4.9×10⁻³ N
const QA_MIN = 40, QA_MAX = 100, QA_STEP = 10   // A 球体带电 Q（nC，表面分布）
const QB_MIN = 2, QB_MAX = 8, QB_STEP = 1       // 点电荷 q（nC）
const R_MIN = 10, R_MAX = 36
const MAX_REC = 4
const THETA_DRAW = 55          // 画偏角的极限（图示放大后超过就打折）
const ANGLE_GAIN = 8           // 默认图示偏角放大倍数（真实偏角仅 0.1°~8°）

const fmtTheta = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(2))

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
  { key: 1, label: '① 认识装置', sub: 'A 是固定在底座上的带电球体（电荷分布在球表面），B 是细线悬挂的轻质小球（点电荷）—— 点击 B 可切换正负电：同种相斥、异种相吸' },
  { key: 2, label: '② 探究距离', sub: '保持 Q、q 不变，沿横杆拖动悬挂点改变距离 r —— 库仑力本身很小，偏角只零点几度，距离越近 θ 越大（图上偏角已放大显示）' },
  { key: 3, label: '③ 探究电荷量', sub: '保持距离 r 不变，改变电荷量 —— B 受力 F = q·E，静电力箭头与偏角 θ 随 Q·q 同步变化' },
  { key: 4, label: '④ 实验结论', sub: '由偏角反推静电力 F = mg tanθ，再验证 F = q·E ∝ Q/r²，理清"偏角只用来比较力的大小"' },
]

// 自己动手（Tab2）要装配的器材
const DIY_PARTS = [
  { type: 'rig', no: '①', name: '底座支架', hint: '立杆 + 横杆，立在台面右侧' },
  { type: 'A', no: '②', name: '带电球 A', hint: '大球，电荷分布在球表面' },
  { type: 'B', no: '③', name: '点电荷 B', hint: '小球 + 绝缘细线，挂横杆上' },
  { type: 'ruler', no: '④', name: '刻度尺', hint: '量两球球心距 r' },
]
const DIY_MAX_PTS = 6

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function coulombInfo(s) {
  const rM = s.rCm / 100
  const E = (K_COUL * s.Q1 * 1e-9) / (rM * rM)       // A 球在 B 处的场强
  const F = E * s.Q2 * 1e-9                          // F = q·E
  const tan = F / MG
  const theta = (Math.atan(tan) * 180) / Math.PI     // 真实偏角（很小）
  const gain = s.gain === false ? 1 : (s.gain || ANGLE_GAIN)
  const thetaDraw = (Math.atan(tan * gain) * 180) / Math.PI  // 图示偏角（放大显示）
  return { rM, E, F, tan, theta, thetaDraw, gain, sameSign: s.sB > 0, mg: MG }
}

function makeLayout(W, H) {
  const stage = { x0: 24, x1: Math.max(W * 0.56, W - 300), y0: 76, y1: H - 106 }
  const sc = clamp(Math.min((stage.x1 - stage.x0) / 1000, (stage.y1 - stage.y0) / 640), 1, 1.7)
  const beamY = stage.y0 + 40 * sc
  const tableY = stage.y1 - 6 * sc

  // 装置整体（A 球 → 立柱）水平居中：横向铺满舞台的 ~84%，横杆只做到悬挂点可及的最右端
  const innerW = stage.x1 - stage.x0
  const leftRoom = 170 * sc                // A 球左侧（F′ 箭头 + 标注）
  const rightRoom = 58 * sc                // 立柱右侧
  const pxPerCm = clamp((innerW * 0.84 - leftRoom - rightRoom) / R_MAX, 6, 26 * sc)
  const rigW = R_MAX * pxPerCm + leftRoom + rightRoom
  const xA = stage.x0 + Math.max(0, (innerW - rigW) / 2) + leftRoom
  const postX = xA + R_MAX * pxPerCm + 40 * sc

  // 细线长度按同一 cm→px 比例（约 22 cm），并保证立柱底座与竖杆有高度
  const L = clamp(pxPerCm * 22, 120 * sc, tableY - beamY - 170 * sc)
  const ballY0 = beamY + L
  const AY = ballY0        // A 球心与 B 球心同高，r 才是水平球心距
  return { stage, beamY, tableY, L, xA, ballY0, AY, pxPerCm, postX, sc }
}

function rigGeom(G, s, info) {
  const sc = G.sc || 1
  const th = (Math.min(info.thetaDraw ?? info.theta, THETA_DRAW) * Math.PI) / 180
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
    Q1: 70,          // nC，A 球体带电量 Q
    Q2: 5,           // nC，点电荷 q
    rCm: 20,         // cm，两球球心距
    sB: 1,           // B 球电性：+1 正 / -1 负（A 固定正电）
    gain: ANGLE_GAIN, // 图示偏角放大倍数（false/1 = 真实比例）
    records: [],
    compare: false,
    dragSlider: null,
    toast: null,
    hover: null,
    // Tab2 自己动手：组装 → 测量取点 → 作图验证
    diy: {
      stage: 'assemble',                       // assemble | measure
      placed: { rig: false, A: false, B: false, ruler: false },
      hold: null,                              // 手上拿着的器材
      dragType: null,
      mx: 0, my: 0,
      points: [],                              // { rCm, theta, F }
      graph: false,
    },
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
      else renderDiy(ctx, W, H)
      canvasRef.current._dbg = {
        step: S.current.step,
        tab: S.current.tab,
        rCm: S.current.rCm,
        theta: coulombInfo(S.current).theta,
        records: S.current.records.length,
        compare: S.current.compare,
        diyStage: S.current.diy.stage,
        diyPlaced: Object.values(S.current.diy.placed).filter(Boolean).length,
        diyPoints: S.current.diy.points.length,
        graph: S.current.diy.graph,
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
  function drawRig(ctx, G, s, info, gm, opt = {}) {
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

    // A 球底座与立杆（大球体 → 宽底座、短立杆）
    const rA = 30 * sc
    ctx.fillStyle = '#8A97A0'
    ctx.beginPath(); ctx.roundRect(xA - 34 * sc, tableY - 12 * sc, 68 * sc, 12 * sc, 3); ctx.fill()
    ctx.fillStyle = '#AEBAC1'
    ctx.beginPath(); ctx.roundRect(xA - 30 * sc, tableY - 17 * sc, 60 * sc, 6 * sc, 2); ctx.fill()
    const rodTop = AY + rA * 0.68
    ctx.fillStyle = '#9FADB5'
    ctx.beginPath(); ctx.roundRect(xA - 4.5 * sc, rodTop, 9 * sc, tableY - 17 * sc - rodTop, 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillRect(xA - 3.8 * sc, rodTop, 2.4 * sc, tableY - 17 * sc - rodTop)

    // A 球：较大的带电球体，电荷分布在球表面（球面上一圈小 “+”）
    const ag = ctx.createRadialGradient(xA - 9 * sc, AY - 11 * sc, 2, xA, AY, rA)
    ag.addColorStop(0, '#FFFFFF'); ag.addColorStop(0.42, '#CBD6DC'); ag.addColorStop(1, '#77858D')
    ctx.beginPath(); ctx.arc(xA, AY, rA, 0, Math.PI * 2)
    ctx.fillStyle = ag; ctx.fill()
    ctx.strokeStyle = 'rgba(222,69,63,0.5)'; ctx.lineWidth = 1.4 * sc; ctx.stroke()
    setFont(ctx, 8.5 * sc, 'bold'); ctx.fillStyle = C.pos
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.globalAlpha = 0.8
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26
      const rr = rA * (0.74 + (i % 2) * 0.14)
      ctx.fillText('+', xA + Math.cos(a) * rr, AY + Math.sin(a) * rr)
    }
    ctx.globalAlpha = 1
    setFont(ctx, 15 * sc, 'bold'); ctx.fillStyle = C.pos
    ctx.fillText('+', xA, AY)
    // A 标注
    setFont(ctx, 11 * sc, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('A', xA - rA - 13 * sc, AY - rA * 0.62)
    haloText(ctx, '+Q', xA, AY - rA - 13 * sc, C.pos, 10 * sc)

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

    // B 球：细线悬挂的轻质小球（点电荷，画得小）
    const rB = 6 * sc
    ctx.strokeStyle = '#8E8377'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(gm.slideX, gm.dropY); ctx.lineTo(gm.ballX, gm.ballY - rB); ctx.stroke()

    const bg2 = ctx.createRadialGradient(gm.ballX - 2 * sc, gm.ballY - 2.5 * sc, 1, gm.ballX, gm.ballY, rB)
    bg2.addColorStop(0, '#FFFFFF'); bg2.addColorStop(0.45, '#CBD5DA'); bg2.addColorStop(1, '#7C8A92')
    ctx.beginPath(); ctx.arc(gm.ballX, gm.ballY, rB, 0, Math.PI * 2)
    ctx.fillStyle = bg2; ctx.fill()
    ctx.strokeStyle = info.sameSign ? C.pos : C.neg; ctx.lineWidth = 1.6 * sc; ctx.stroke()
    setFont(ctx, 8 * sc, 'bold'); ctx.fillStyle = info.sameSign ? C.pos : C.neg
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(info.sameSign ? '+' : '−', gm.ballX, gm.ballY)

    setFont(ctx, 11 * sc, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    // B 字母放在细线的另一侧、球体右/左下，避开细线与 F 箭头
    ctx.fillText('B', gm.ballX + gm.dir * (rB + 16 * sc), gm.ballY + 13 * sc)
    haloText(ctx, `${info.sameSign ? '+' : '−'}q`, gm.ballX, gm.ballY - rB - 14 * sc, info.sameSign ? C.pos : C.neg, 10 * sc)

    // 点击 B 球切换电性（小球点电荷 → 热区放大到 14*sc）；自己动手时不允许切换（控制变量）
    const hitR = Math.max(rB, 14 * sc)
    if (!opt.noToggle) pushArea({
      n: 'bBall',
      x: gm.ballX - hitR, y: gm.ballY - hitR, w: hitR * 2, h: hitR * 2,
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
          const th = (Math.min(inf.thetaDraw, THETA_DRAW) * Math.PI) / 180
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
    const rB = 6 * sc, rA = 30 * sc
    const mgPx = 44 * sc
    const thetaRad = gm.th
    const tanDraw = Math.tan(thetaRad)
    const Fpx = clamp(mgPx * tanDraw * 3.6, 14 * sc, 150 * sc)

    // 细线方向单位向量（从球指向悬挂点）
    const dx = slideX - ballX, dy = gm.dropY - ballY
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len

    // 重力 mg（竖直向下，往左让开球体与电荷标签）
    arrow(ctx, ballX - 32 * sc, ballY + rB - 4 * sc, ballX - 32 * sc, ballY + rB - 4 * sc + mgPx, C.mg, 1.8, 'mg', '#233', 9)
    // 悬线拉力 T（沿细线方向，不给文字标签，避免压住 −q 与偏角弧）
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
    const side = (info.thetaDraw ?? info.theta) > 22 ? 1 : -1
    const label = `θ = ${fmtTheta(info.theta)}°`
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
    badge(1, G.xA + 44 * sc, G.AY - 32 * sc)
    badge(2, gm.ballX + 30 * sc, gm.ballY + 34 * sc)
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
    const thetaTxt = fmtTheta(info.theta)
    setFont(ctx, 24, 'bold'); ctx.fillStyle = '#8A5A12'
    ctx.fillText(`${thetaTxt}°`, x + 66, ky - 6)
    if ((info.thetaDraw ?? info.theta) > THETA_DRAW) {
      setFont(ctx, 9); ctx.fillStyle = '#C0392B'
      ctx.fillText('超出图示量程', x + 122, ky + 2)
    }
    const gainTxt = info.gain > 1 ? `图示偏角放大 ${info.gain}×` : '图示按真实比例'
    setFont(ctx, 8.5); ctx.fillStyle = C.faint
    ctx.fillText(gainTxt, x + 14, ky + 18)

    ky += 40
    ctx.beginPath(); ctx.moveTo(x + 12, ky); ctx.lineTo(x + w - 12, ky); ctx.stroke()
    ky += 10
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('实时数据', x + 14, ky)
    ky += 18

    const rows = [
      ['球心距 r', `${s.rCm.toFixed(1)} cm`],
      ['A 球带电量 Q（球体）', `+${s.Q1} nC`],
      ['B 点电荷电量 q', `${info.sameSign ? '+' : '−'}${s.Q2} nC`],
      ['E = kQ/r²', `${sciText(info.E)} V/m`],
      ['F = q·E', `${sciText(info.F)} N`],
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
    ;['#', 'r/cm', 'θ/°', 'F/10⁻⁵N', 'Q·q'].forEach((t, i) => ctx.fillText(t, cols[i], ky + 6))
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
        ctx.fillText(fmtTheta(rc.theta), cols[2], ky + 5)
        ctx.fillText((rc.F * 1e5).toFixed(2), cols[3], ky + 5)
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
          '① A：底座固定的较大带电球体，电荷分布在球表面',
          '② B：细线悬挂的轻质小球（点电荷），点击可切换正负电',
          '③ 悬挂点：沿横杆拖动 → 改变两球球心距 r',
          '④ 米尺（虚线）：量两球球心距 r，单位 cm',
          '关键：库仑力很小，θ 只有零点几度 → 图示放大后仍是"力的读数"',
        ],
      },
      2: {
        title: '操作提示 · 探究距离',
        warm: false,
        lines: [
          '• 电荷量已锁定（控制变量）',
          '• 拖动横杆上的悬挂点，或拉底部「调节距离」',
          '• r 越小 → E = kQ/r² 越大 → θ 越大',
          '• 每组点「保存状态」，最多存 4 组',
        ],
      },
      3: {
        title: '操作提示 · 探究电荷量',
        warm: false,
        lines: [
          '• 距离 r 已锁定（控制变量）',
          '• 拖动 Q / q 滑块改变电荷量',
          '• θ 与静电力箭头 F = q·E 随 Q·q 同步变化',
          '• 点击 B 球可切换正负电，看同斥异吸',
        ],
      },
      4: {
        title: '结论',
        warm: true,
        lines: [
          '① B 球平衡：F = mg tanθ（θ 是力的放大镜）',
          '② 点电荷受力 F = q·E，E = kQ/r²',
          '③ 合起来即库仑定律 F = kQq/r²',
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

    const qLabel = (v) => `Q +${v} nC`
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.pos
    ctx.fillText(qLabel(s.Q1), cx, by + 14)
    drawSlider(ctx, {
      x: cx, y: by + 30, w: s2,
      ratio: (s.Q1 - QA_MIN) / (QA_MAX - QA_MIN),
      disabled: lockQ, accent: C.pos,
      name: 'q1Slider',
      onChange: (r) => { S.current.Q1 = clamp(QA_MIN + Math.round((r * (QA_MAX - QA_MIN)) / QA_STEP) * QA_STEP, QA_MIN, QA_MAX) },
    })
    cx += s2 + 18

    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = info.sameSign ? C.pos : C.neg
    ctx.fillText(`q ${info.sameSign ? '+' : '−'}${s.Q2} nC`, cx, by + 14)
    drawSlider(ctx, {
      x: cx, y: by + 30, w: s3,
      ratio: (s.Q2 - QB_MIN) / (QB_MAX - QB_MIN),
      disabled: lockQ, accent: info.sameSign ? C.pos : C.neg,
      name: 'q2Slider',
      onChange: (r) => { S.current.Q2 = clamp(QB_MIN + Math.round((r * (QB_MAX - QB_MIN)) / QB_STEP) * QB_STEP, QB_MIN, QB_MAX) },
    })

    // 第二行按钮
    const btnY = by + 52, btnH = 24
    let bxx = bx + 16

    drawBtn(ctx, bxx, btnY, 108, btnH, `B 球：${info.sameSign ? '+q 正电' : '−q 负电'}`, 'plain', () => {
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
        theta: inf.theta, thetaDraw: inf.thetaDraw, F: inf.F, tan: inf.tan,
      })
    }, 'saveBtn')
    bxx += 100

    drawBtn(ctx, bxx, btnY, 96, btnH, '⇄ 叠加对比', 'plain', () => {
      S.current.compare = true
    }, 'compareBtn')
    bxx += 104

    drawBtn(ctx, bxx, btnY, 92, btnH, info.gain > 1 ? `🔍 图示 ${info.gain}×` : '🔍 真实比例', 'ghost', () => {
      const st = S.current
      st.gain = st.gain > 1 ? 1 : ANGLE_GAIN
      say(st.gain > 1 ? `图示偏角放大 ${st.gain}×（数值仍为真实偏角）` : '图示改为真实比例：库仑力很小，细线几乎竖直')
    }, 'gainBtn')
    bxx += 100

    drawBtn(ctx, bxx, btnY, 74, btnH, '↺ 重置', 'ghost', () => {
      const st = S.current
      st.Q1 = 70; st.Q2 = 5; st.rCm = 20; st.sB = 1; st.records = []
      say('已恢复初始状态')
    }, 'resetBtn')
    bxx += 82

    // 右侧提示（按剩余宽度自适应，窄屏放不下就不画）
    const hintW = bx + bw - 16 - bxx
    if (hintW > 110) {
      setFont(ctx, 9); ctx.fillStyle = C.faint
      ctx.textAlign = 'left'
      fitFont(ctx, '拖动横杆上的悬挂点也可以直接改 r', hintW, 9)
      ctx.fillText('拖动横杆上的悬挂点也可以直接改 r', bxx, by + 66)
    }
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
        ctx.fillText(`Q·q = ${rc.Q1 * rc.Q2} nC²`, px + 12, my + 13)
        setFont(ctx, 9, 'bold'); ctx.fillStyle = '#8A5A12'
        ctx.fillText(`θ = ${fmtTheta(rc.theta)}°`, px + 12, my + 26)
        setFont(ctx, 9, 'bold'); ctx.fillStyle = C.tealDark
        ctx.textAlign = 'right'
        ctx.fillText(`F = ${sciText(rc.F)} N`, px + pw - 12, my + 26)
        ctx.textAlign = 'left'
      }
    }

    setFont(ctx, 9.5); ctx.fillStyle = C.sub
    ctx.textAlign = 'center'
    fitFont(ctx, '同一比例尺下（偏角同倍数放大）：θ 越大 → F = mg tanθ 越大；同一组合内只改一个变量，控制变量清清楚楚', cw - 40, 9.5)
    ctx.fillText('同一比例尺下（偏角同倍数放大）：θ 越大 → F = mg tanθ 越大；同一组合内只改一个变量，控制变量清清楚楚', x + cw / 2, y + ch - 22)
    ctx.textAlign = 'left'
  }

  // 迷你状态图：同一比例尺
  function drawMiniState(ctx, box, rc) {
    const dir = rc.sB > 0 ? 1 : -1
    const th = (Math.min(rc.thetaDraw ?? rc.theta, THETA_DRAW) * Math.PI) / 180
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
    ctx.beginPath(); ctx.arc(ax, ay, 9, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = C.pos; ctx.lineWidth = 1.3; ctx.stroke()
    // B 球（点电荷，小）
    ctx.fillStyle = '#ADBAC2'
    ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = dir > 0 ? C.pos : C.neg; ctx.lineWidth = 1.3; ctx.stroke()
    // 力箭头（等大反向）
    ctx.strokeStyle = C.teal; ctx.lineWidth = 1.8
    const fl = clamp(7 + Math.tan(th) * 18, 8, 34) * dir
    ctx.beginPath(); ctx.moveTo(bx + dir * 5, by); ctx.lineTo(bx + dir * 5 + fl, by); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ax - dir * 10, ay); ctx.lineTo(ax - dir * 10 - fl, ay); ctx.stroke()
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
  //  Tab 2：自己动手 —— ① 组装装置 ② 测量取点 ③ 作图验证
  // ================================================================
  function renderDiy(ctx, W, H) {
    if (S.current.diy.stage === 'assemble') renderDiyAssemble(ctx, W, H)
    else renderDiyMeasure(ctx, W, H)
  }

  function diyGeom(W, H) {
    const palW = 174, palX = W - palW - 12
    const org = { x: 14, y: 56 }
    const aw = palX - 12 - org.x, ah = H - 18 - org.y
    const sc = clamp(Math.min(aw / 980, ah / 640), 1, 1.55)
    const area = { x0: 0, x1: aw / sc, y0: 0, y1: ah / sc }
    const tableY = area.y1 - 52
    const beamY = 56
    const postX = area.x1 - 62
    const xA = 126
    const AY = tableY - 132
    const slideX = xA + clamp((postX - xA) * 0.46, 130, 420)
    const rulerY = Math.min(AY + 62, tableY - 30)
    return { palW, palX, org, sc, area, tableY, beamY, postX, xA, AY, slideX, rulerY }
  }
  // 组装区坐标 → 画布坐标（右键判位用）
  const diyToLocal = (A, x, y) => ({ x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc })

  // ────────── ① 组装 ──────────
  function renderDiyAssemble(ctx, W, H) {
    const s = S.current, dy = s.diy
    const A = diyGeom(W, H)

    setFont(ctx, 13, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('自己动手 · ① 组装装置', A.org.x + 4, 14)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    ctx.fillText('点一下（或拖一下）右侧器材，它会吸附到虚线装配位；右键可取下重放。四件齐了才能开始测量。', A.org.x + 4, 33)

    ctx.save()
    ctx.translate(A.org.x, A.org.y)
    ctx.scale(A.sc, A.sc)

    const G = { stage: { x0: A.area.x0, x1: A.area.x1, y0: A.area.y0 }, tableY: A.tableY }
    drawStageBack(ctx, G)
    // 淡网格：让空舞台不至于太空
    ctx.strokeStyle = 'rgba(140,165,175,0.16)'; ctx.lineWidth = 1
    for (let gx = 30; gx < A.area.x1; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 8); ctx.lineTo(gx, A.tableY); ctx.stroke()
    }
    for (let gy = 28; gy < A.tableY; gy += 40) {
      ctx.beginPath(); ctx.moveTo(8, gy); ctx.lineTo(A.area.x1 - 8, gy); ctx.stroke()
    }
    drawBench(ctx, G)

    drawDiyGhosts(ctx, A, dy)
    if (dy.placed.rig) drawDiyStand(ctx, A)
    if (dy.placed.A) drawDiySphereA(ctx, A)
    if (dy.placed.B) drawDiyBallB(ctx, A)
    if (dy.placed.ruler) drawDiyRuler(ctx, A)
    ctx.restore()

    drawDiyPalette(ctx, A, W, H)
    if (dy.hold) { ctx.save(); ctx.globalAlpha = 0.8; drawDiyIcon(ctx, dy.mx, dy.my, dy.hold, false, true); ctx.restore() }
    drawToast(ctx, W, H, s)
  }

  function drawDiyGhosts(ctx, A, dy) {
    const part = (type, paint, fillPaint) => {
      if (dy.placed[type]) return
      const active = dy.hold === type
      ctx.save()
      if (fillPaint) {
        fillPaint()
        ctx.fillStyle = active ? 'rgba(18,166,155,0.10)' : 'rgba(148,168,176,0.07)'
        ctx.fill()
      }
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = active ? 'rgba(18,166,155,0.92)' : 'rgba(126,150,160,0.55)'
      ctx.lineWidth = active ? 2 : 1.1
      paint()
      ctx.restore()
    }
    part('rig', () => {
      ctx.strokeRect(A.postX - 6, A.beamY - 10, 12, A.tableY - A.beamY + 12)
      ctx.strokeRect(A.postX - 26, A.tableY - 12, 52, 12)
      ctx.strokeRect(A.xA - 30, A.beamY - 5, A.postX - A.xA + 34, 10)
    }, () => { ctx.beginPath(); ctx.rect(A.postX - 6, A.beamY - 10, 12, A.tableY - A.beamY + 12) })
    part('A', () => {
      ctx.beginPath(); ctx.arc(A.xA, A.AY, 32, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeRect(A.xA - 30, A.tableY - 12, 60, 12)
      ctx.strokeRect(A.xA - 5, A.AY + 30, 10, A.tableY - 12 - (A.AY + 30))
    }, () => { ctx.beginPath(); ctx.arc(A.xA, A.AY, 32, 0, Math.PI * 2) })
    part('B', () => {
      ctx.beginPath(); ctx.moveTo(A.slideX, A.beamY + 4); ctx.lineTo(A.slideX, A.AY - 12); ctx.stroke()
      ctx.beginPath(); ctx.arc(A.slideX, A.AY, 11, 0, Math.PI * 2); ctx.stroke()
    }, () => { ctx.beginPath(); ctx.arc(A.slideX, A.AY, 11, 0, Math.PI * 2) })
    part('ruler', () => {
      ctx.strokeRect(A.xA + 36, A.rulerY - 9, A.slideX - A.xA + 26, 20)
    }, () => { ctx.beginPath(); ctx.rect(A.xA + 36, A.rulerY - 9, A.slideX - A.xA + 26, 20) })

    const badge = (txt, x, y, name, side) => {
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill()
      ctx.strokeStyle = 'rgba(126,150,160,0.65)'; ctx.lineWidth = 1; ctx.stroke()
      setFont(ctx, 9, 'bold'); ctx.fillStyle = C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(txt, x, y + 0.5)
      if (name) {
        setFont(ctx, 8.5); ctx.fillStyle = 'rgba(93,112,121,0.75)'
        ctx.textAlign = side === 'left' ? 'right' : 'left'
        ctx.fillText(name, side === 'left' ? x - 13 : x + 13, y + 0.5)
      }
    }
    if (!dy.placed.rig) badge('①', A.postX - 22, A.beamY + 30, '底座支架', 'left')
    if (!dy.placed.A) badge('②', A.xA - 44, A.AY - 42, '带电球 A', 'right')
    if (!dy.placed.B) badge('③', A.slideX + 22, A.AY - 26, '点电荷 B + 细线', 'right')
    if (!dy.placed.ruler) badge('④', A.xA + 26, A.rulerY - 24, '刻度尺', 'right')
  }

  function drawDiyStand(ctx, A) {
    const pw = 7
    const pg = ctx.createLinearGradient(A.postX - pw, 0, A.postX + pw, 0)
    pg.addColorStop(0, '#D5DEE3'); pg.addColorStop(0.45, '#B3C0C7'); pg.addColorStop(1, '#8E9CA4')
    ctx.fillStyle = pg
    ctx.fillRect(A.postX - pw, A.beamY - 8, pw * 2, A.tableY - A.beamY + 12)
    ctx.fillStyle = '#97A5AD'
    ctx.beginPath(); ctx.roundRect(A.postX - 26, A.tableY - 12, 52, 12, 3); ctx.fill()
    ctx.fillStyle = '#B9C5CB'
    ctx.beginPath(); ctx.roundRect(A.postX - 22, A.tableY - 16, 44, 6, 2); ctx.fill()

    const x0 = A.xA - 34, bh = 10
    const bg = ctx.createLinearGradient(0, A.beamY - bh / 2, 0, A.beamY + bh / 2)
    bg.addColorStop(0, '#F0F4F6'); bg.addColorStop(1, '#C7D2D8')
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.roundRect(x0, A.beamY - bh / 2, A.postX - x0 + 6, bh, 3); ctx.fill()
    ctx.strokeStyle = '#B8C5CC'; ctx.lineWidth = 0.8; ctx.stroke()
    ctx.strokeStyle = 'rgba(120,140,150,0.55)'; ctx.lineWidth = 1
    for (let x = x0 + 6; x < A.postX - 4; x += 9) {
      ctx.beginPath(); ctx.moveTo(x, A.beamY + 1); ctx.lineTo(x, A.beamY + 3.5); ctx.stroke()
    }
  }

  function drawDiySphereA(ctx, A) {
    const rA = 32
    ctx.fillStyle = '#8A97A0'
    ctx.beginPath(); ctx.roundRect(A.xA - 34, A.tableY - 12, 68, 12, 3); ctx.fill()
    ctx.fillStyle = '#AEBAC1'
    ctx.beginPath(); ctx.roundRect(A.xA - 30, A.tableY - 17, 60, 6, 2); ctx.fill()
    const rodTop = A.AY + rA * 0.68
    ctx.fillStyle = '#9FADB5'
    ctx.beginPath(); ctx.roundRect(A.xA - 4.5, rodTop, 9, A.tableY - 17 - rodTop, 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillRect(A.xA - 3.8, rodTop, 2.4, A.tableY - 17 - rodTop)

    const ag = ctx.createRadialGradient(A.xA - 9, A.AY - 11, 2, A.xA, A.AY, rA)
    ag.addColorStop(0, '#FFFFFF'); ag.addColorStop(0.42, '#CBD6DC'); ag.addColorStop(1, '#77858D')
    ctx.beginPath(); ctx.arc(A.xA, A.AY, rA, 0, Math.PI * 2)
    ctx.fillStyle = ag; ctx.fill()
    ctx.strokeStyle = 'rgba(222,69,63,0.5)'; ctx.lineWidth = 1.4; ctx.stroke()

    ctx.globalAlpha = 0.8
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.pos
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26
      const rr = rA * (0.74 + (i % 2) * 0.14)
      ctx.fillText('+', A.xA + Math.cos(a) * rr, A.AY + Math.sin(a) * rr)
    }
    ctx.globalAlpha = 1
    setFont(ctx, 16, 'bold'); ctx.fillStyle = C.pos
    ctx.fillText('+', A.xA, A.AY)
    setFont(ctx, 11, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('A', A.xA - rA - 13, A.AY - rA * 0.7)
    haloText(ctx, '+Q', A.xA, A.AY - rA - 13, C.pos, 10)
  }

  function drawDiyBallB(ctx, A) {
    const clipY = A.beamY - 13
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = C.teal; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.roundRect(A.slideX - 9, clipY, 18, 22, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(18,166,155,0.18)'
    ctx.beginPath(); ctx.roundRect(A.slideX - 6, clipY + 3, 12, 7, 2); ctx.fill()

    ctx.strokeStyle = '#8E8377'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(A.slideX, A.beamY + 9); ctx.lineTo(A.slideX, A.AY - 7); ctx.stroke()

    const rB = 7
    const bg2 = ctx.createRadialGradient(A.slideX - 2, A.AY - 2.5, 1, A.slideX, A.AY, rB)
    bg2.addColorStop(0, '#FFFFFF'); bg2.addColorStop(0.45, '#CBD5DA'); bg2.addColorStop(1, '#7C8A92')
    ctx.beginPath(); ctx.arc(A.slideX, A.AY, rB, 0, Math.PI * 2)
    ctx.fillStyle = bg2; ctx.fill()
    ctx.strokeStyle = C.pos; ctx.lineWidth = 1.6; ctx.stroke()
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.pos
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('+', A.slideX, A.AY)
    setFont(ctx, 11, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('B', A.slideX + 22, A.AY + 13)
    haloText(ctx, '+q', A.slideX, A.AY - rB - 14, C.pos, 10)
  }

  function drawDiyRuler(ctx, A) {
    const x0 = A.xA + 36, x1 = A.slideX + 30, y = A.rulerY, h = 15
    const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2)
    g.addColorStop(0, '#FBF3E2'); g.addColorStop(1, '#E7D8BB')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.roundRect(x0, y - h / 2, x1 - x0, h, 2); ctx.fill()
    ctx.strokeStyle = '#D6C4A2'; ctx.lineWidth = 1; ctx.stroke()
    ctx.strokeStyle = 'rgba(120,100,70,0.7)'; ctx.lineWidth = 1
    const n = Math.floor((x1 - x0) / 10)
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * 10, long = i % 5 === 0
      ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x, y - h / 2 + (long ? 8 : 4)); ctx.stroke()
    }
    setFont(ctx, 8); ctx.fillStyle = 'rgba(90,72,48,0.85)'
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('cm', x1 + 6, y)
  }

  function drawDiyIcon(ctx, x, y, type, ready, big) {
    const k = big ? 1.5 : 1
    ctx.save(); ctx.translate(x, y)
    if (type === 'rig') {
      ctx.strokeStyle = '#8E9CA4'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, -10 * k); ctx.lineTo(0, 8 * k); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-9 * k, 8 * k); ctx.lineTo(9 * k, 8 * k); ctx.stroke()
      ctx.strokeStyle = '#C7D2D8'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(-12 * k, -10 * k); ctx.lineTo(7 * k, -10 * k); ctx.stroke()
    } else if (type === 'A') {
      const r = 7 * k
      ctx.fillStyle = '#CBD6DC'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(222,69,63,0.6)'; ctx.lineWidth = 1.2; ctx.stroke()
      setFont(ctx, 7 * k, 'bold'); ctx.fillStyle = C.pos
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        ctx.fillText('+', Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82)
      }
      ctx.fillText('+', 0, 0)
    } else if (type === 'B') {
      ctx.strokeStyle = '#8E8377'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, -11 * k); ctx.lineTo(0, -3 * k); ctx.stroke()
      ctx.fillStyle = '#CBD5DA'; ctx.beginPath(); ctx.arc(0, 2 * k, 4 * k, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = C.pos; ctx.lineWidth = 1.3; ctx.stroke()
      setFont(ctx, 6.5 * k, 'bold'); ctx.fillStyle = C.pos
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('+', 0, 2 * k)
    } else if (type === 'ruler') {
      const g = ctx.createLinearGradient(0, -4 * k, 0, 4 * k)
      g.addColorStop(0, '#FBF3E2'); g.addColorStop(1, '#E7D8BB')
      ctx.fillStyle = g; ctx.fillRect(-11 * k, -4 * k, 22 * k, 8 * k)
      ctx.strokeStyle = '#D6C4A2'; ctx.lineWidth = 1; ctx.strokeRect(-11 * k, -4 * k, 22 * k, 8 * k)
      ctx.strokeStyle = 'rgba(120,100,70,0.7)'
      for (let i = 0; i <= 4; i++) {
        const xx = -9 * k + i * 4.4 * k
        ctx.beginPath(); ctx.moveTo(xx, -4 * k); ctx.lineTo(xx, i % 2 === 0 ? 1 * k : -1 * k); ctx.stroke()
      }
    }
    if (ready) {
      ctx.beginPath(); ctx.arc(9 * k, 9 * k, 4, 0, Math.PI * 2)
      ctx.fillStyle = C.teal; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.moveTo(7 * k, 9 * k); ctx.lineTo(8.6 * k, 10.8 * k); ctx.lineTo(11.4 * k, 6.8 * k); ctx.stroke()
    }
    ctx.restore()
  }

  function drawDiyPalette(ctx, A, W, H) {
    const dy = S.current.diy
    const x = A.palX, w = A.palW, y = 12, h = H - 24
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill()
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()

    const n = DIY_PARTS.filter((p) => dy.placed[p.type]).length
    setFont(ctx, 11.5, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('器材区', x + 12, y + 12)
    ctx.textAlign = 'right'; ctx.fillStyle = n === 4 ? C.teal : C.sub
    ctx.fillText(`${n}/${DIY_PARTS.length}`, x + w - 12, y + 12)

    const cardH = 54
    DIY_PARTS.forEach((p, i) => {
      const cy = y + 34 + i * (cardH + 8)
      const ready = dy.placed[p.type]
      const hot = dy.hold === p.type
      ctx.beginPath(); ctx.roundRect(x + 8, cy, w - 16, cardH, 8)
      ctx.fillStyle = ready ? '#F2FBF9' : '#FFFFFF'; ctx.fill()
      ctx.strokeStyle = ready ? 'rgba(18,166,155,0.5)' : hot ? C.teal : '#E1E8EB'
      ctx.lineWidth = hot ? 2 : 1; ctx.stroke()

      drawDiyIcon(ctx, x + 26, cy + 27, p.type, ready)
      setFont(ctx, 8.5); ctx.fillStyle = ready ? C.tealDark : C.faint
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(`${p.no} ${ready ? '已装配' : '点一下装配'}`, x + 44, cy + 9)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
      ctx.fillText(p.name, x + 44, cy + 22)
      setFont(ctx, 8.5); ctx.fillStyle = C.sub
      fitFont(ctx, p.hint, w - 52, 8.5)
      ctx.fillText(p.hint, x + 44, cy + 38)

      pushArea({ n: `diyPart:${p.type}`, x: x + 8, y: cy, w: w - 16, h: cardH, holdType: p.type, cursor: 'pointer' })
    })

    const by = H - 88
    if (n === 4) {
      drawBtn(ctx, x + 10, by, w - 20, 30, '▶ 开始测量', 'primary', () => startDiyMeasure(), 'diyStart')
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('装置就位 —— 下一步自己取点', x + w / 2, by + 38)
    } else {
      const rest = DIY_PARTS.filter((p) => !dy.placed[p.type]).map((p) => p.no).join(' ')
      ctx.beginPath(); ctx.roundRect(x + 8, by, w - 16, 44, 8)
      ctx.fillStyle = '#F7FAFB'; ctx.fill()
      ctx.strokeStyle = '#E3EBEF'; ctx.lineWidth = 1; ctx.stroke()
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`还差 ${4 - n} 件：${rest}`, x + w / 2, by + 15)
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      ctx.fillText('四件齐了才能开始测量', x + w / 2, by + 31)
    }
  }

  function diyInstall(type) {
    const dy = S.current.diy
    if (dy.placed[type]) { say('这件器材已经装好了'); return }
    dy.placed[type] = true
    const part = DIY_PARTS.find((p) => p.type === type)
    const left = DIY_PARTS.filter((p) => !dy.placed[p.type])
    say(left.length ? `${part ? part.name : '器材'} 已吸附到位 · 还差 ${left.length} 件` : '四件器材齐了 → 点「▶ 开始测量」')
  }

  function startDiyMeasure() {
    const s = S.current
    if (DIY_PARTS.some((p) => !s.diy.placed[p.type])) { say('先把四件器材装齐'); return }
    s.diy.stage = 'measure'
    s.diy.points = []
    s.diy.graph = false
    s.Q1 = 70; s.Q2 = 5; s.sB = 1; s.rCm = 20
    say('开始测量：Q、q 固定，只改距离 r，逐组点「记录这一组」')
  }

  function diyRebuild() {
    const s = S.current
    s.diy = { stage: 'assemble', placed: { rig: false, A: false, B: false, ruler: false }, hold: null, dragType: null, mx: 0, my: 0, points: [], graph: false }
    say('已回到组装阶段，可以重新搭一遍')
  }

  // ────────── ② 测量取点 ──────────
  function renderDiyMeasure(ctx, W, H) {
    const s = S.current
    const info = coulombInfo(s)
    const G = makeLayout(W, H)
    const gm = rigGeom(G, s, info)

    setFont(ctx, 13, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('自己动手 · ② 测量取点', 26, 14)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    const line = `拖动横杆上的悬挂点（或用面板滑块）改变 r，点「记录这一组」；至少 3 组才能作图 —— 拖得越近 θ 越大，但别忘 θ 只用来比较力的大小`
    fitFont(ctx, line, W - 320, 10)
    ctx.fillText(line, 26, 33)

    drawStageBack(ctx, G)
    drawBench(ctx, G)
    drawRig(ctx, G, s, info, gm, { noToggle: true })
    drawRuler(ctx, G, s, info, gm)
    drawForces(ctx, G, s, info, gm)
    drawDiyPanel(ctx, W, H, G, s, info)
    if (s.diy.graph) drawDiyGraph(ctx, W, H, s)
    drawToast(ctx, W, H, s)
  }

  function drawDiyPanel(ctx, W, H, G, s, info) {
    const x = W - 282, w = 262, y = 76, h = Math.max(340, H - 76 - 112)
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill()
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()

    let ky = y + 14
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    setFont(ctx, 12, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('测量与记录', x + 14, ky)
    setFont(ctx, 9); ctx.fillStyle = C.sub
    ctx.fillText('Q、q 固定为 +70 nC / +5 nC —— 只改距离 r（控制变量）', x + 14, ky + 18)

    // 读数
    ky += 40
    setFont(ctx, 9.5); ctx.fillStyle = C.sub
    ctx.fillText('投影放大 8× 读数', x + 14, ky)
    const thTxt = fmtTheta(info.theta)
    setFont(ctx, 26, 'bold'); ctx.fillStyle = '#8A5A12'
    ctx.fillText(`${thTxt}°`, x + 14, ky + 14)
    setFont(ctx, 9); ctx.fillStyle = C.ink
    ctx.textAlign = 'right'
    ctx.fillText(`F = ${sciText(info.F)} N`, x + w - 14, ky + 24)
    ctx.textAlign = 'left'
    setFont(ctx, 8.5); ctx.fillStyle = C.faint
    ctx.fillText('面板数值是真的；画出来的偏角按 8× 放大', x + 14, ky + 44)

    // r 滑块
    ky += 66
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('球心距 r', x + 14, ky)
    ctx.textAlign = 'right'; ctx.fillStyle = C.tealDark
    ctx.fillText(`${s.rCm.toFixed(1)} cm`, x + w - 14, ky)
    ctx.textAlign = 'left'
    const ratio = (s.rCm - R_MIN) / (R_MAX - R_MIN)
    drawSlider(ctx, {
      x: x + 40, y: ky + 18, w: w - 68, ratio, accent: C.teal, name: 'diyR',
      onChange: (rt) => { S.current.rCm = clamp(Math.round((R_MIN + rt * (R_MAX - R_MIN)) * 2) / 2, R_MIN, R_MAX) },
    })

    // 记录按钮
    ky += 40
    const full = s.diy.points.length >= DIY_MAX_PTS
    if (full) drawBtn(ctx, x + 14, ky, w - 28, 28, `记录已满 ${DIY_MAX_PTS} 组`, 'ghost', () => say('已记满 6 组 —— 先作图或重装再来'), 'diyRec')
    else drawBtn(ctx, x + 14, ky, w - 28, 28, '📌 记录这一组', 'primary', () => {
      const st = S.current
      const inf = coulombInfo(st)
      st.diy.points.push({ rCm: st.rCm, theta: inf.theta, F: inf.F })
      say(`已记录第 ${st.diy.points.length} 组：r = ${st.rCm.toFixed(1)} cm，θ = ${fmtTheta(inf.theta)}°`)
    }, 'diyRec')

    // 记录表
    ky += 38
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 12, ky); ctx.lineTo(x + w - 12, ky); ctx.stroke()
    ky += 9
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText(`我的测量记录 · ${s.diy.points.length}/${DIY_MAX_PTS}`, x + 14, ky)
    ky += 16

    const cols = [x + 28, x + 76, x + 138, x + 214]
    ctx.fillStyle = C.tealSoft
    ctx.beginPath(); ctx.roundRect(x + 12, ky - 2, w - 24, 15, 3); ctx.fill()
    setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'center'
    ;['#', 'r/cm', 'θ/°', 'F/10⁻⁵N'].forEach((t, i) => ctx.fillText(t, cols[i], ky + 6))
    ky += 17
    ctx.textAlign = 'left'

    if (s.diy.points.length === 0) {
      setFont(ctx, 9); ctx.fillStyle = C.faint
      ctx.fillText('先改 r，再点「记录这一组」', x + 14, ky)
      ky += 15
    } else {
      for (let i = 0; i < s.diy.points.length; i++) {
        const p = s.diy.points[i]
        if (i % 2 === 1) { ctx.fillStyle = '#F7FAFB'; ctx.beginPath(); ctx.roundRect(x + 12, ky - 2, w - 24, 14, 3); ctx.fill() }
        setFont(ctx, 9); ctx.fillStyle = C.ink
        ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), cols[0], ky + 5)
        ctx.fillText(p.rCm.toFixed(1), cols[1], ky + 5)
        ctx.fillText(fmtTheta(p.theta), cols[2], ky + 5)
        ctx.fillText((p.F * 1e5).toFixed(2), cols[3], ky + 5)
        ky += 14
        ctx.textAlign = 'left'
      }
    }

    // 作图
    ky += 8
    if (s.diy.points.length >= 3) {
      drawBtn(ctx, x + 14, ky, w - 28, 28, '📈 作图验证 F ∝ 1/r²', 'primary', () => { S.current.diy.graph = true }, 'diyGraph')
    } else {
      drawBtn(ctx, x + 14, ky, w - 28, 28, `📈 作图验证（还需 ${3 - s.diy.points.length} 组）`, 'ghost', () => say('至少 3 组数据才能看出规律'), 'diyGraph')
    }

    // 底部：重装
    drawBtn(ctx, x + 14, y + h - 40, w - 28, 26, '↺ 重装装置', 'plain', () => diyRebuild(), 'diyRebuild')
  }

  // ────────── ③ 作图验证 ──────────
  function drawDiyGraph(ctx, W, H, s) {
    ctx.fillStyle = 'rgba(16,30,38,0.45)'
    ctx.fillRect(0, 0, W, H)

    const cw = Math.min(740, W - 60), ch = Math.min(440, H - 60)
    const x = (W - cw) / 2, y = (H - ch) / 2
    ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 12)
    ctx.fillStyle = '#FBFDFD'; ctx.fill()
    ctx.strokeStyle = '#D6E2E7'; ctx.lineWidth = 1; ctx.stroke()

    setFont(ctx, 14, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('作图验证 · F 与 1/r²', x + 22, y + 16)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    ctx.fillText('Q·q 固定（+70 nC × +5 nC）：若 F ∝ 1/r²，这些点应落在一条过原点的直线上', x + 22, y + 38)

    const cbx = x + cw - 44, cby = y + 16
    ctx.beginPath(); ctx.roundRect(cbx, cby, 28, 24, 6)
    ctx.fillStyle = '#F1F5F7'; ctx.fill()
    ctx.strokeStyle = '#DCE5E9'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 12, 'bold'); ctx.fillStyle = C.sub
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('✕', cbx + 14, cby + 12)
    pushArea({ x: cbx, y: cby, w: 28, h: 24, modal: true, onClick: () => { S.current.diy.graph = false } })

    const pts = s.diy.points
    const px0 = x + 82, px1 = x + cw - 40, py0 = y + 78, py1 = y + ch - 106
    const xs = pts.map((p) => 1 / (p.rCm * p.rCm))
    const ys = pts.map((p) => p.F)
    const xMax = Math.max(...xs) * 1.15
    const yMax = Math.max(...ys, 1e-9) * 1.2
    const sx = (v) => px0 + (v / xMax) * (px1 - px0)
    const sy = (v) => py1 - (v / yMax) * (py1 - py0)

    // 坐标框 + 网格
    ctx.strokeStyle = '#E3EBEF'; ctx.lineWidth = 1
    ctx.strokeRect(px0, py0, px1 - px0, py1 - py0)
    ctx.strokeStyle = '#EDF2F5'
    for (let i = 1; i <= 4; i++) {
      const gx = px0 + (i / 4) * (px1 - px0)
      const gy = py1 - (i / 4) * (py1 - py0)
      ctx.beginPath(); ctx.moveTo(gx, py0); ctx.lineTo(gx, py1); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(px0, gy); ctx.lineTo(px1, gy); ctx.stroke()
    }

    // 轴标签
    setFont(ctx, 9); ctx.fillStyle = C.sub
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (let i = 0; i <= 4; i++) {
      const v = (i / 4) * xMax
      ctx.fillText((v * 1e3).toFixed(1), px0 + (i / 4) * (px1 - px0), py1 + 6)
    }
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('1/r²（×10⁻³ cm⁻²）', (px0 + px1) / 2, py1 + 24)
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const v = (i / 4) * yMax
      ctx.fillText((v * 1e4).toFixed(2), px0 - 8, py1 - (i / 4) * (py1 - py0))
    }
    ctx.save()
    ctx.translate(px0 - 52, (py0 + py1) / 2)
    ctx.rotate(-Math.PI / 2)
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('F（×10⁻⁴ N）', 0, 0)
    ctx.restore()

    // 过原点最小二乘
    let sxy = 0, sxx = 0
    for (let i = 0; i < xs.length; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i] }
    const k = sxx ? sxy / sxx : 0
    let ssres = 0, sstot = 0
    const ym = ys.reduce((a, b) => a + b, 0) / ys.length
    for (let i = 0; i < xs.length; i++) {
      ssres += (ys[i] - k * xs[i]) ** 2
      sstot += (ys[i] - ym) ** 2
    }
    const r2 = sstot > 0 ? 1 - ssres / sstot : 1
    const kTheory = K_COUL * (70 * 1e-9) * (5 * 1e-9) * 1e4     // k·Q·q，换成 N·cm²

    // 拟合线
    ctx.save()
    ctx.strokeStyle = 'rgba(18,166,155,0.85)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(sx(0), sy(0)); ctx.lineTo(sx(xMax), sy(k * xMax)); ctx.stroke()
    ctx.restore()

    // 数据点
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < pts.length; i++) {
      const cx = sx(xs[i]), cy = sy(ys[i])
      ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, Math.PI * 2)
      ctx.fillStyle = '#DE453F'; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke()
      setFont(ctx, 8); ctx.fillStyle = C.sub
      ctx.fillText(`r=${pts[i].rCm.toFixed(1)}`, cx, cy - 11)
    }

    // 结论
    const cy0 = py1 + 40
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(`拟合 F = ${sciText(k)} · (1/r²)，R² = ${r2.toFixed(3)}`, px0 - 20, cy0)
    setFont(ctx, 9.5); ctx.fillStyle = C.sub
    ctx.fillText(`与 kQq = ${sciText(kTheory)} N·cm² 相差 ${((Math.abs(k - kTheory) / kTheory) * 100).toFixed(1)}% —— 实测斜率就是 k·Q·q`, px0 - 20, cy0 + 15)
    setFont(ctx, 9.5); ctx.fillStyle = '#8A5A12'
    const concl = '各点几乎落在同一条过原点的直线上 → F ∝ 1/r²，即库仑定律 F = kQq/r²（Q·q 不变时）'
    fitFont(ctx, concl, cw - 60, 9.5)
    ctx.fillText(concl, px0 - 20, cy0 + 31)
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
    // Tab2 自己动手
    const dy = s.diy
    if (dy.stage === 'measure' && dy.graph) {
      for (const a of areas) { if (a.modal && hit(a)) { a.onClick(); return } }
      return
    }
    for (const a of areas) {
      if (a.modal) continue
      if (!hit(a)) continue
      if (a.holdType) { dy.hold = a.holdType; dy.dragType = a.holdType; dy.mx = x; dy.my = y; return }
      if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
      if (a.drag === 'beam') { s.dragBeam = true; a.setX(x); return }
      if (a.onClick) { a.onClick(x, y); return }
    }
    if (dy.hold) { dy.mx = x; dy.my = y }
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
    if (s.dragSlider) { s.dragSlider.setX(x); return }
    if (s.dragBeam) {
      for (const a of canvasRef.current._clickAreas || []) { if (a.drag === 'beam') { a.setX(x); return } }
      return
    }
    if (s.diy.hold) { s.diy.mx = x; s.diy.my = y }
  }

  function handleMouseUp() {
    const s = S.current
    s.dragSlider = null; s.dragBeam = false
    if (s.tab === 2 && s.diy.dragType) {
      const type = s.diy.dragType
      s.diy.dragType = null; s.diy.hold = null
      if (s.diy.stage === 'assemble') diyInstall(type)
    }
  }
  function handleDoubleClick() {}

  function handleContextMenu(e) {
    e.preventDefault()
    const s = S.current
    if (s.tab !== 2 || s.diy.stage !== 'assemble') return
    const { x, y } = getPos(e)
    const R = canvasRef.current._R
    if (!R) return
    const A = diyGeom(R.W, R.H)
    const L = diyToLocal(A, x, y)
    const anchors = {
      rig: { x: A.postX, y: A.beamY + 30 },
      A: { x: A.xA, y: A.AY },
      B: { x: A.slideX, y: A.AY },
      ruler: { x: (A.xA + 36 + A.slideX + 30) / 2, y: A.rulerY },
    }
    let best = null, bd = 1e9
    for (const t of Object.keys(anchors)) {
      if (!s.diy.placed[t]) continue
      const d = Math.hypot(L.x - anchors[t].x, L.y - anchors[t].y)
      if (d < bd) { bd = d; best = t }
    }
    if (best && bd < 96) {
      s.diy.placed[best] = false
      const part = DIY_PARTS.find((p) => p.type === best)
      say(`已取下「${part ? part.name : best}」，可以重新放`)
    }
  }

  return (
    <SceneShell
      title="库仑定律探究"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; S.current.compare = false; S.current.diy.graph = false; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'default' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
