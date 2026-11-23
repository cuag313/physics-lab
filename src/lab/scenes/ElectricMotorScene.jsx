/**
 * ElectricMotorScene — 演示「电动机原理」（2026-11-23 重建）
 *
 * 做法照「演示手摇发电机」（HandGeneratorScene）：器材**全部**用 NB 原厂贴图，不手绘。
 *   · 电动机 = NB electrical/ElectriMotorElectri 图集（nobook.db id 252 那台机器）：
 *     机身 mt_body.png（红 N 左 / 蓝 S 右弧形极靴 + 灰色小底座 + 两立柱 + 黑/红接线柱）、
 *     线圈 28 帧 mt_coil_sheet.png、换向器 28 帧 mt_ring_sheet.png；极性反像 mt_body_rev.png。
 *   · 电池、闸刀开关在演示区画成电路图符号（灰蓝细线，照用户给的参考图）；开关点一下就合闸/断闸。
 *
 * 两个 Tab：
 *   ① 📖 实验演示 —— NB 252 的三个现象：
 *        通电就转（有换向器）／拆掉换向器，线圈只转半圈就停在平衡位置／反接接线柱、对调磁极都反转
 *   ② 🔧 自己动手 —— 从右侧器材栏拖器材、点接线柱连线，电动机按电流真转（28 帧逐帧换）
 *
 * 电气/机械模型（按 NB 那台 6 V 小电动机的标定量化）：
 *   反电动势 e = K·ω（K = 0.45 V/(rad/s)），绕组 R = 2 Ω，转动惯量 J = 0.05，静摩擦 0.03 N·m、粘滞 0.0022
 *   6 V 空载稳定转速 ≈ 2 r/s（≈13 rad/s）—— 28 帧/圈，看着是"真转"而不是糊成一片。
 *   拆掉换向器后电流不再换向：τ = K·I·cosθ，线圈摆到平衡位置（θ=90°）就停住 —— 这正是换向器存在的理由。
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import {
  TYPES, motorNBSVG, motorFrameImg, MOTOR_NB,
} from './electricSvgInstruments.js'

/* ─────────────────────────  设计坐标（viewBox 760×540）  ─────────────────────────
   演示区按「电路图」画：回路矩形（左竖边 / 底边 / 右竖边），底边上 **电源、开关用电路图符号**，
   电动机用实物贴图挂在回路顶边正中（只有它保留实物照片）。 */
const D = { W: 760, H: 540 }

const MOTOR = { x: 261, y: 40, s: 0.52 }   // 机身 457×443 → 237.6×230.3，底座下沿 y=270，接线柱落在回路顶边 y=251

const LOOP = { L: 76, R: 684, T: 251, B: 430 }   // 回路矩形
const INK = '#6E7B8B'                            // 电路图线条色（照参考图那种灰蓝细线）

/* 电源符号（两节电池：长线 = 正极、短粗线 = 负极），节点在两端 */
const BATSYM = { x0: 214, x1: 262, cx: 238 }      // 左节点 = +，右节点 = −
/* 开关符号（刀闸：左端铰链 + 一条刀片 + 右端触点） */
const SWSYM = { x0: 470, x1: 566, cx: 518 }

const N = {
  motA: { x: MOTOR.x + 155 * MOTOR.s, y: LOOP.T },      // 电动机黑柱
  motB: { x: MOTOR.x + 296 * MOTOR.s, y: LOOP.T },      // 电动机红柱
  batP: { x: BATSYM.x0, y: LOOP.B },                     // 电源 +（左）
  batN: { x: BATSYM.x1, y: LOOP.B },                     // 电源 −（右）
  sw1: { x: SWSYM.x0, y: LOOP.B },                       // 开关铰链端
  sw2: { x: SWSYM.x1, y: LOOP.B },                       // 开关触点端
}

/* 三段导线（单色细线，电路图风格）：电动机黑柱 → 左竖边 → 底边 → 电源 +；
   电源 − → 开关铰链；开关触点 → 右竖边 → 顶边 → 电动机红柱 */
const WIRES = [
  { pts: [N.motA, { x: LOOP.L, y: LOOP.T }, { x: LOOP.L, y: LOOP.B }, N.batP] },
  { pts: [N.batN, N.sw1] },
  { pts: [N.sw2, { x: LOOP.R, y: LOOP.B }, { x: LOOP.R, y: LOOP.T }, N.motB] },
]

const pathOf = (pts) => `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`

/* 折线上按弧长比取点（电流小点沿回路流动用） */
function polyPoint(pts, t) {
  const segs = []
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
    segs.push({ a: pts[i], b: pts[i + 1], l })
    total += l
  }
  let d = ((t % 1) + 1) % 1 * total
  for (const s of segs) {
    if (d <= s.l) {
      const k = s.l === 0 ? 0 : d / s.l
      return { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k }
    }
    d -= s.l
  }
  return pts[pts.length - 1]
}

/* 物理常量：K 反电动势常数 / R_W 回路电阻 / J 转动惯量 / T0 静摩擦 / BV 粘滞阻尼 / BRK 断闸后的刹车（电刷摩擦+涡流） */
const K = 0.45, R_W = 2.0, J = 0.05, T0 = 0.03, BV = 0.0022, BRK = 0.34

/* ─────────────────────────  工具  ───────────────────────── */
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

/* ─────────────────────────  电路图符号（电池 / 开关）  ─────────────────────────
   照用户给的参考图：灰蓝细线、长线=正极、短粗线=负极、刀闸开关一个铰链点 + 一条刀片 + 一个触点。 */
const SYM_FONT = { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 15, fontWeight: 600, fill: '#5B6675' }

function BatterySymbol() {
  const y = LOOP.B, x0 = BATSYM.x0, x1 = BATSYM.x1
  const plates = [
    { x: x0 + 9, h: 34, w: 2.6 },    // 长线 = 正极
    { x: x0 + 16, h: 16, w: 4.2 },   // 短粗线 = 负极
    { x: x0 + 29, h: 34, w: 2.6 },   // 第二节课，串起来
    { x: x0 + 36, h: 16, w: 4.2 },
  ]
  return (
    <g>
      <line x1={x0} y1={y} x2={x0 + 9} y2={y} stroke={INK} strokeWidth="2.2" />
      <line x1={x0 + 36} y1={y} x2={x1} y2={y} stroke={INK} strokeWidth="2.2" />
      {plates.map((p, i) => (
        <line key={i} x1={p.x} y1={y - p.h / 2} x2={p.x} y2={y + p.h / 2}
          stroke={INK} strokeWidth={p.w} strokeLinecap="butt" />
      ))}
      <text x={x0 + 9} y={y - 26} textAnchor="middle" {...SYM_FONT}>+</text>
      <text x={x0 + 36} y={y - 26} textAnchor="middle" {...SYM_FONT}>−</text>
      <text x={BATSYM.cx} y={y + 30} textAnchor="middle" {...SYM_FONT}>电源</text>
    </g>
  )
}

function SwitchSymbol({ closed, onToggle }) {
  const y = LOOP.B, x0 = SWSYM.x0, x1 = SWSYM.x1
  const L = x1 - x0
  const ang = closed ? 0 : -26
  const rad = (ang * Math.PI) / 180
  const tipX = x0 + L * Math.cos(rad)
  const tipY = y + L * Math.sin(rad)
  return (
    <g style={{ cursor: 'pointer' }} onClick={onToggle}
      onPointerDown={(e) => e.stopPropagation()}>
      {/* 透明热区：刀片立着的时候也点得到 */}
      <rect x={x0 - 26} y={y - 78} width={L + 52} height={110} fill="rgba(0,0,0,0)" />
      <circle cx={x0} cy={y} r="3.6" fill={INK} />
      <circle cx={x1} cy={y} r="3.6" fill={INK} />
      <line x1={x0} y1={y} x2={tipX} y2={tipY} stroke={INK} strokeWidth="2.8" strokeLinecap="round" />
      <text x={SWSYM.cx} y={y + 30} textAnchor="middle" {...SYM_FONT}>
        {closed ? '开关（闭合）' : '开关（断开）'}
      </text>
    </g>
  )
}

/* 知识卡里的强调字 */
const Kk = ({ c = '#B45309', children }) => <span style={{ color: c, fontWeight: 700 }}>{children}</span>

/* ─────────  右侧暖色知识卡（照原版 drawKnowledgeCard 的版式：橘色标题药丸 + 小节色块 + 要点 + 底部实时读数）  ───────── */
function Section({ c, title, items }) {
  return (
    <div style={{ marginTop: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 3.4, height: 13, background: c, borderRadius: 2 }} />
        <span
          style={{
            background: `${c}1f`, color: c, fontWeight: 700, fontSize: 12.5,
            padding: '2px 10px', borderRadius: 11,
          }}
        >
          {title}
        </span>
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginTop: 3 }}>
          <span style={{ flex: '0 0 auto', width: 5, height: 5, borderRadius: 3, background: c, marginTop: 7 }} />
          <span style={{ fontSize: 12.2, lineHeight: 1.62, color: '#5A4636' }}>{it}</span>
        </div>
      ))}
    </div>
  )
}

function MotorKnowledgeCard({ recRef }) {
  return (
    <div
      style={{
        flex: '0 0 auto', width: 'min(332px, 36%)', margin: '10px 10px 10px 4px',
        display: 'flex', flexDirection: 'column', minHeight: 0,
        background: 'linear-gradient(#FFFBF4, #FFF3E3)',
        border: '1.2px solid #F2DCC0', borderRadius: 14,
        boxShadow: '0 6px 18px rgba(203,132,62,0.22)', overflow: 'hidden',
      }}
    >
      <div
        style={{
          margin: '12px 14px 6px', padding: '6px 18px', width: 'fit-content',
          background: 'linear-gradient(90deg,#F59E0B,#EA580C)', color: '#fff',
          fontWeight: 700, fontSize: 14, borderRadius: 18,
        }}
      >
        📖 电动机知识
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 10px' }}>
        <Section
          c="#C2410C"
          title="① 实验目的"
          items={[
            <>观察 <Kk c="#C2410C">通电线圈在磁场中受力转动</Kk>（安培力），看懂电动机的原理。</>,
            <>弄清 <Kk c="#15803D">换向器</Kk> 为什么必须有 —— 没有它，线圈只能摆到平衡位置就停住。</>,
            <>弄明白 <Kk c="#B45309">转向</Kk> 和 <Kk c="#0EA5E9">转速</Kk> 各由什么决定。</>,
          ]}
        />
        <Section
          c="#15803D"
          title="② 实验器材"
          items={[
            <>电池组、闸刀开关、导线；<Kk c="#C2410C">蹄形磁铁（N 红 / S 蓝）</Kk>、矩形线圈、<Kk c="#15803D">换向器 + 电刷</Kk> —— 后三样都装在这台小电动机里。</>,
            <>演示区里电池和开关画成电路图符号：<Kk c="#1D4ED8">长线是「+」，短粗线是「−」</Kk>，刀闸合上电路才通。</>,
            <>换向器由两个 <Kk c="#B45309">半圆铜片</Kk> 拼成、随线圈一起转；两片 <Kk>电刷</Kk> 固定不动，贴着铜片滑动取电。</>,
            <><Kk>红柱接正、黑柱接负</Kk>：电路图里电源长线是「+」、短粗线是「−」，电流从 + 经开关到红柱，再从黑柱回到电源 −。</>,
          ]}
        />
        <Section
          c="#B45309"
          title="③ 通电线圈为什么会转"
          items={[
            <>线圈两侧在磁场中都受安培力，方向 <Kk c="#DC2626">相反</Kk>、又不在同一直线上 → 形成 <Kk c="#B45309">转矩</Kk>，线圈就转起来。</>,
            <>方向用 <Kk c="#7C3AED">左手定则</Kk>：四指指电流方向，让磁感线穿入手心，拇指就是受力方向。</>,
            <><Kk c="#B45309">τ = K·I·cos θ</Kk>：线圈面与磁感线 <Kk c="#15803D">平行</Kk> 时转矩 <Kk c="#15803D">最大</Kk>；<Kk c="#DC2626">垂直</Kk> 时转矩为零。</>,
          ]}
        />
        <Section
          c="#7C3AED"
          title="④ 为什么必须有换向器（本实验的核心）"
          items={[
            <>线圈转到 <Kk c="#7C3AED">平衡位置</Kk>（面与磁感线垂直）时，两侧安培力在同一直线上、方向相反 → 转矩为零，<Kk c="#DC2626">再转不过去</Kk>。</>,
            <>拆掉换向器：线圈在平衡位置附近 <Kk c="#DC2626">来回摆几下就停住</Kk>（下面读数里 θ 就停在 90° 附近）。</>,
            <>换向器每半圈把线圈里的 <Kk c="#15803D">电流方向翻转一次</Kk>，转矩方向就永远是同一侧 → 连续转动。</>,
            <>换向那一瞬（铜片两道缝同时对着两只电刷）电流断开、转矩为零，全靠 <Kk c="#7C3AED">惯性冲过去</Kk>。</>,
            <>点工具栏「<Kk>换向器：已拆</Kk>」再启动，就是本实验最直观的一次对比。</>,
          ]}
        />
        <Section
          c="#0EA5E9"
          title="⑤ 转速与转向"
          items={[
            <>电压↑ → 电流↑ → 转矩↑ → <Kk c="#0EA5E9">转速↑</Kk>。真实电动机还有 <Kk c="#7C3AED">反电动势 e = K·ω</Kk>：转得越快电流越小，最后自动平衡到某个转速。</>,
            <>只改 <Kk c="#0EA5E9">电流方向</Kk> 或 <Kk c="#B91C1C">磁场方向</Kk> 中的 <Kk c="#DC2626">任意一个</Kk>，转向就反过来；两个同时改 → 转向不变。</>,
            <>电压滑块 3~9 V 改动会先断开电路，重新合闸再启动（和真实换电池一个道理）。</>,
          ]}
        />
        <Section
          c="#64748B"
          title="⑥ 实时读数"
          items={[
            <span key="rec" ref={recRef} style={{ fontVariantNumeric: 'tabular-nums' }}>合上闸刀后这里显示 I、n、e、θ 与转动状态</span>,
          ]}
        />
        <Section
          c="#1D4ED8"
          title="⑦ 电动机 vs 发电机（一句话分清）"
          items={[
            <><Kk c="#15803D">电动机</Kk>：电能 → 机械能，通电导线受安培力（F = BIL，左手定则）——先有电流，才有转动。</>,
            <><Kk c="#1D4ED8">发电机</Kk>：机械能 → 电能，导体切割磁感线产生感应电动势（E = BLv，右手定则）——先有运动，才有电。</>,
            <>同一台机器反着用就是另一台 —— 这就是 <Kk c="#B45309">可逆性</Kk>。</>,
          ]}
        />
      </div>
    </div>
  )
}

/* 器材栏缩略图：静态第 1 帧 */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  return <span dangerouslySetInnerHTML={{ __html: t.render({ id: `pal-${type}` }, {}) }} />
}

/* ─────────────────────────  场景  ───────────────────────── */
export default function ElectricMotorScene() {
  const dynRef = useRef(null)
  const recRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const [ui, setUi] = useState({
    tab: 1, closed: false, volt: 6, comm: true, rev: false, swapMag: false, wireColor: '#F44336',
  })

  const S = useRef({
    th: 0, om: 0, I: 0, tau: 0, e: 0, flow: 0,
    closed: false, volt: 6, comm: true, rev: false, swapMag: false, tab: 1,
  })

  const applyUi = useCallback((patch) => {
    setUi((cur) => {
      const next = { ...cur, ...patch }
      const s = S.current
      s.closed = next.closed; s.volt = next.volt; s.comm = next.comm
      s.rev = next.rev; s.swapMag = next.swapMag; s.tab = next.tab
      return next
    })
  }, [])

  /* ─────────  主循环：自己算物理 + 自己写动态层（不经过 React 每帧重建）  ───────── */
  useEffect(() => {
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      const s = S.current
      if (s.tab === 1) {
        step(s, dt)
        paint(s)
      }
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function step(s, dt) {
    const pol = (s.rev ? -1 : 1) * (s.swapMag ? -1 : 1)
    const V = s.volt * pol
    if (!s.closed) {
      s.I = 0; s.e = 0; s.tau = 0
    } else if (s.comm) {
      /* 有换向器：线圈每半圈电流反向一次，力矩方向恒定 → 能连续转 */
      s.e = K * s.om
      s.I = (V - s.e) / R_W
      s.tau = K * s.I
    } else {
      /* 拆掉换向器：电流不换向，力矩 τ = K·I·cosθ → 摆到平衡位置就停 */
      s.e = K * s.om * Math.sin(s.th)
      s.I = (V - s.e) / R_W
      s.tau = K * s.I * Math.cos(s.th)
    }

    let net = s.tau
    /* 拆掉换向器后线圈是"绕着平衡位置来回摆"，真实器材里涡流/空气阻尼比空载转动大得多；
       这里把粘滞阻尼放大 14 倍（ζ≈0.4），摆两三下就停在平衡位置，才看得出"没有换向器转不起来" */
    const damp = s.comm ? BV : BV * 14
    if (Math.abs(s.om) > 1e-4) {
      net -= T0 * Math.sign(s.om) + damp * s.om
      /* 断闸：电刷摩擦 + 铁芯涡流，磨掉动能 —— 只靠惯性再转一两圈就停 */
      if (!s.closed) net -= BRK * Math.sign(s.om)
    } else if (Math.abs(s.tau) <= T0) { net = 0; s.om = 0 }
    s.om += (net / J) * dt
    if (Math.abs(s.om) > 60) s.om = Math.sign(s.om) * 60
    s.th += s.om * dt

    const mag = Math.min(1, Math.abs(s.I) / 2.5)
    s.flow += dt * (0.10 + mag * 0.6) * (s.I < 0 ? -1 : 1)
  }

  function paint(s) {
    const g = dynRef.current
    if (!g) return
    const m = MOTOR_NB
    const frame = (s.th / (Math.PI * 2)) * m.coil.n
    const clip = `<defs><clipPath id="dmc"><rect x="${m.coil.x}" y="${m.coil.y}" width="${m.coil.w}" height="${m.coil.h}"/></clipPath>`
      + `<clipPath id="dmr"><rect x="${m.ring.x}" y="${m.ring.y}" width="${m.ring.w}" height="${m.ring.h}"/></clipPath></defs>`

    /* 线圈 + 换向器：按转角挑帧（拆掉换向器时换向器环不画，只剩线圈两条引线） */
    const rotor = `<g transform="translate(${MOTOR.x},${MOTOR.y}) scale(${MOTOR.s})">${clip}`
      + motorFrameImg('mt_coil_sheet.png', m.coil, frame, 'dmc', m.coil.n)
      + (s.comm ? motorFrameImg('mt_ring_sheet.png', m.ring, frame, 'dmr', m.ring.n) : '')
      + '</g>'

    /* 电流小点：沿回路三条导线流动，方向随电流翻转 */
    let dots = ''
    if (s.closed && Math.abs(s.I) > 0.008) {
      const alpha = 0.35 + 0.55 * Math.min(1, Math.abs(s.I) / 2)
      for (const w of WIRES) {
        for (let d = 0; d < 10; d++) {
          let t = (d / 10 + (s.flow % 1) + 1) % 1
          if (s.I < 0) t = 1 - t
          const p = polyPoint(w.pts, t)
          dots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6" fill="rgba(255,214,102,${alpha.toFixed(2)})"/>`
        }
      }
    }

    g.innerHTML = rotor + dots

    /* 右侧知识卡底部的实时读数（每帧只改这一行，不触发 React 重渲染） */
    if (recRef.current) {
      const deg = (((s.th * 180 / Math.PI) % 360) + 360) % 360
      const g1 = 'color:#0369A1;font-weight:700'
      const sep = '<span style="color:#D6BC97">·</span>'
      recRef.current.innerHTML = `
        <span style="${g1}">I = ${s.I >= 0 ? '' : '−'}${Math.abs(s.I).toFixed(2)} A</span>${sep}
        <span style="${g1}">n = ${(s.om / (Math.PI * 2)).toFixed(2)} r/s</span>${sep}
        <span style="${g1}">e = ${Math.abs(s.e).toFixed(2)} V</span>${sep}
        <span style="${g1}">θ = ${deg | 0}°</span>${sep}
        <span style="color:${s.closed ? (Math.abs(s.om) > 0.9 ? '#15803D' : '#B45309') : '#94A3B8'};font-weight:700">${statusText(s)}</span>`
    }
  }

  function statusText(s) {
    if (!s.closed) {
      return Math.abs(s.om) > 0.3 ? '断电，靠惯性再转一两圈' : '已断电，停住'
    }
    if (!s.comm) {
      if (Math.abs(s.om) < 0.25) return '停在平衡位置（θ=90°）'
      return '无换向器：单向力矩，转过平衡位置就反向'
    }
    if (Math.abs(s.om) < 0.3 && Math.abs(s.tau) <= T0 + 1e-6) return '停在平衡位置'
    return Math.abs(s.om) > 0.9 ? '匀速转动' : '启动中'
  }

  /* ─────────  UI  ───────── */
  const handleReset = useCallback(() => {
    if (ui.tab === 2) { builderRef.current?.reset(); return }
    const s = S.current
    s.th = 0; s.om = 0; s.I = 0; s.e = 0; s.flow = 0
    applyUi({ closed: false, volt: 6, comm: true, rev: false, swapMag: false })
  }, [applyUi, ui.tab])

  const handleAddFromPalette = useCallback((type) => builderRef.current?.add(type), [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => {
    builderRef.current?.addAt(type, clientX, clientY)
  }, [])

  /* 演示页器材：电池 / 开关用电路图符号（见 BatterySymbol / SwitchSymbol），只有电动机用 NB 实物贴图 */
  const motorBodySVG = motorNBSVG({
    body: ui.swapMag ? 'mt_body_rev.png' : 'mt_body.png',
    coilFrame: null, ringFrame: null, cid: 'demo', scale: MOTOR.s,
  })

  return (
    <SceneShell
      title="电动机原理"
      tab={ui.tab}
      onTabChange={(t) => applyUi({ tab: t, closed: false })}
      tab1Label="📖 实验演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      resetLabel="重置"
      toolbarExtra={(
        <>
          {ui.tab === 1 && (
            <>
              <span style={{ fontSize: 12.5, color: '#6B7280', whiteSpace: 'nowrap' }}>
                点画面里的「开关」合闸 / 断闸
              </span>
              <span style={{ width: 1, height: 20, background: '#D0D7DE', margin: '0 2px' }} />
              <button
                type="button"
                onClick={() => applyUi({ comm: !ui.comm, closed: false })}
                style={chipStyle(!ui.comm, '#B45309')}
                title="拆掉换向器：线圈里的电流不再换向，转到平衡位置就停"
              >
                {ui.comm ? '换向器：已装' : '换向器：已拆'}
              </button>
              <button
                type="button"
                onClick={() => applyUi({ rev: !ui.rev, closed: false })}
                style={chipStyle(ui.rev, '#7C3AED')}
              >
                {ui.rev ? '接线柱：反接' : '接线柱：正接'}
              </button>
              <button
                type="button"
                onClick={() => applyUi({ swapMag: !ui.swapMag, closed: false })}
                style={chipStyle(ui.swapMag, '#0E7490')}
              >
                {ui.swapMag ? '磁极：N 右 S 左' : '磁极：N 左 S 右'}
              </button>
              <label style={labelStyle}>
                电压
                <input
                  type="range" min={3} max={9} step={0.5} value={ui.volt}
                  onChange={(e) => applyUi({ volt: Number(e.target.value), closed: false })}
                  style={{ width: 100, accentColor: '#2563EB' }}
                />
                <b style={{ minWidth: 40, display: 'inline-block' }}>{ui.volt.toFixed(1)} V</b>
              </label>
            </>
          )}
          {ui.tab === 2 && (
            <span style={{ fontSize: 12.5, color: '#6B7280' }}>
              从右边器材栏拖器材到桌面 → 点接线柱连线 → 合上开关，电动机就按电流转起来
            </span>
          )}
        </>
      )}
      desc={ui.tab === 1 ? (
        <>
          <b>{ui.comm ? '通电线圈在磁场里受力转动' : '拆掉换向器：线圈转到平衡位置就停'}</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            {ui.comm
              ? '线圈每转过半圈，换向器就把线圈里的电流方向换一次，力矩方向始终不变 —— 所以能一圈圈连续转。'
              : '没有换向器，电流方向不变：线圈转过平衡位置后力矩反向，摆几下就停在平衡位置（θ=90°）。'}
          </span>
        </>
      ) : (
        <>
          <b>自己动手</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            拖电动机、电池组、开关、电流表到桌面，点接线柱连线；接反了电动机就反转，断路、短路也都会直接看出来。
          </span>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%' }}>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: ui.tab === 1 ? 'block' : 'none' }}>
          <svg
            viewBox={`0 0 ${D.W} ${D.H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            <defs>
              <linearGradient id="em-bg" x1="0" y1="0" x2="0.6" y2="1">
                <stop offset="0%" stopColor="#FFFCF5" />
                <stop offset="55%" stopColor="#FDF4E6" />
                <stop offset="100%" stopColor="#FBEDD9" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width={D.W} height={D.H} fill="url(#em-bg)" />

            {/* 回路导线：电路图细线，左竖边 / 底边 / 右竖边连成一圈 */}
            {WIRES.map((w, i) => (
              <path key={`w${i}`} d={pathOf(w.pts)} stroke={INK} strokeWidth="2.2"
                strokeLinejoin="round" strokeLinecap="butt" fill="none" />
            ))}

            {/* 电动机本体（实物贴图），线圈 + 换向器由动态层按转角换帧 */}
            <g transform={`translate(${MOTOR.x},${MOTOR.y})`} dangerouslySetInnerHTML={{ __html: motorBodySVG }} />

            {/* 电源、开关：电路图符号（开关可点，点一下合闸/断闸） */}
            <BatterySymbol />
            <SwitchSymbol closed={ui.closed} onToggle={() => applyUi({ closed: !ui.closed })} />

            {/* 动态层：线圈 / 换向器 / 电流小点 */}
            <g ref={dynRef} />

            {/* 器材名 */}
            <text x={MOTOR.x + 118.8} y={300} textAnchor="middle" {...SYM_FONT}>电动机</text>
          </svg>
        </div>

        {ui.tab === 1 && <MotorKnowledgeCard recRef={recRef} />}

        {ui.tab === 2 && (
          <BuilderSVG
            ref={builderRef}
            wireColor={ui.wireColor}
            emptyHint="从右侧器材栏拖入「电动机」「电池组」「闸刀开关」，再点接线柱连线"
          />
        )}

        {ui.tab === 1 ? (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            purpose="通电线圈在磁场里受力转动；换向器每半圈改变一次线圈里的电流方向，让线圈能连续转下去。"
            steps={[
              '① 点电路图底边那个「开关（断开）」：刀闸合上，线圈通电，在 N→S 的磁场里受安培力转起来',
              '线圈转到与磁感线平行时力矩为零，靠惯性冲过去；换向器此刻把电流反向，力矩方向不变',
              '② 点「换向器：已拆」，再点开关合闸：电流方向不再改变，线圈摆几下就停在平衡位置 —— 这就是换向器的作用',
              '③ 点「接线柱：反接」（或「磁极：N 右 S 左」），再合闸：转向反过来',
              '两样同时改变（反接 + 对调磁极）：转向又回到原来的方向',
              '电压从 3 V 调到 9 V：电流变大，转速变快（看右侧知识卡里的 n 和 I）',
              '再点一次开关断闸：电流没了，线圈靠惯性再转一两圈就停（电刷摩擦 + 铁芯涡流把动能磨掉）',
            ]}
            hint="通电线圈在磁场中受力转动，是电动机的原理：电能 → 机械能。换向器（两个半环 + 两片电刷）在线圈每转过半圈时交换与电刷的接触，使线圈里的电流反向，于是转矩方向始终一致。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            purpose="自己把器材拖进桌面搭一台电动机的电路：转不转、往哪转、转多快，全看你自己的接法。"
            steps={[
              '① 从右侧器材栏拖「电动机」「电池组」「闸刀开关」到桌面（点一下也能加进来）',
              '② 点一个接线柱 → 再点另一个接线柱，把电池、开关、电动机接成一个圈',
              '③ 点开关的闸刀合上电路：电动机的红/黑柱接对了正转，接反了反转',
              '电流越大转得越快（可串一个滑动变阻器调电流）；断路时转子不动',
              '④ 想换器材：点器材右上角 ✕ 删掉；点导线会浮出红色 ✕，点它就拆；「重置」清空整张桌面',
            ]}
            hint="电动机接线柱有极性：红柱接电池正极、黑柱接负极时按一个方向转；两柱对调就反转。线圈在磁场中受力转动的方向由电流方向和磁场方向共同决定（左手定则）。"
            hintTitle="操作说明"
          />
        )}

        {ui.tab === 2 && (
          <BuilderPalette
            side="right"
            items={[
              { type: 'motorNB', name: '电动机', icon: thumb('motorNB') },
              { type: 'battery', name: '电池组', icon: thumb('battery') },
              { type: 'switch', name: '闸刀开关', icon: thumb('switch') },
              { type: 'ammeterA', name: '电流表', icon: thumb('ammeterA') },
              { type: 'voltmeter', name: '电压表', icon: thumb('voltmeter') },
              { type: 'rheostat', name: '滑动变阻器', icon: thumb('rheostat') },
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
