/**
 * ElectricMotorScene — 演示「电动机原理」（2026-11-23 重建）
 *
 * 做法照「演示手摇发电机」（HandGeneratorScene）：器材**全部**用 NB 原厂贴图，不手绘。
 *   · 电动机 = NB electrical/ElectriMotorElectri 图集（nobook.db id 252 那台机器）：
 *     机身 mt_body.png（红 N 左 / 蓝 S 右弧形极靴 + 灰色小底座 + 两立柱 + 黑/红接线柱）、
 *     线圈 28 帧 mt_coil_sheet.png、换向器 28 帧 mt_ring_sheet.png；极性反像 mt_body_rev.png。
 *   · 电池组、闸刀开关直接用器材库的 battery / switch（同一套 NB 实拍图）。
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

/* ─────────────────────────  设计坐标（viewBox 900×470）  ───────────────────────── */
const D = { W: 900, H: 470 }
const TABLE_Y = 380

const MOTOR = { x: 300, y: 104, s: 0.62 }   // 机身 457×443 → 283×275，底座正好坐在台面上
const BAT = { x: 74, y: 334 }               // 电池组 150×46（底面坐在台面 y=380 上）
const SW = { x: 682, y: 270 }               // 闸刀开关 176×110（同样坐在台面上）

const N = {
  batN: { x: BAT.x + 16, y: BAT.y + 22 },
  batP: { x: BAT.x + 135, y: BAT.y + 22 },
  sw1: { x: SW.x + 26, y: SW.y + 82 },
  sw2: { x: SW.x + 151, y: SW.y + 82 },
  motA: { x: MOTOR.x + MOTOR_NB.terms.a.x * MOTOR.s, y: MOTOR.y + MOTOR_NB.terms.a.y * MOTOR.s },
  motB: { x: MOTOR.x + MOTOR_NB.terms.b.x * MOTOR.s, y: MOTOR.y + MOTOR_NB.terms.b.y * MOTOR.s },
}

/* 三条导线：电池 + → 开关 1；开关 2 → 电动机红柱；电动机黑柱 → 电池 −
   （三段走线各自贴台面不同高度，互相不压） */
const WIRES = [
  { a: N.batP, b: N.sw1, color: '#D3382F', base: 386 },
  { a: N.sw2, b: N.motB, color: '#2F5FBF', base: 398 },
  { a: N.motA, b: N.batN, color: '#2B2B2B', base: 410 },
]

/* 物理常量 */
const K = 0.45, R_W = 2.0, J = 0.05, T0 = 0.03, BV = 0.0022

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

function bzPoint(a, c1, c2, b, t) {
  const u = 1 - t
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t
  return {
    x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
  }
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
       这里把粘滞阻尼放大 8 倍（ζ≈0.4），摆两三下就停在平衡位置，才看得出"没有换向器转不起来" */
    const damp = s.comm ? BV : BV * 14
    if (Math.abs(s.om) > 1e-4) net -= T0 * Math.sign(s.om) + damp * s.om
    else if (Math.abs(s.tau) <= T0) { net = 0; s.om = 0 }
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

    /* 电流小点：沿三条导线流动，方向随电流翻转 */
    let dots = ''
    if (s.closed && Math.abs(s.I) > 0.008) {
      for (const w of WIRES) {
        const c1 = { x: w.a.x + (w.b.x - w.a.x) * 0.16, y: w.base }
        const c2 = { x: w.a.x + (w.b.x - w.a.x) * 0.84, y: w.base }
        const alpha = 0.35 + 0.55 * Math.min(1, Math.abs(s.I) / 2)
        for (let d = 0; d < 9; d++) {
          let t = (d / 9 + (s.flow % 1) + 1) % 1
          if (s.I < 0) t = 1 - t
          const p = bzPoint(w.a, c1, c2, w.b, t)
          dots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="rgba(255,214,102,${alpha.toFixed(2)})"/>`
        }
      }
    }

    /* 实时读数板 */
    const rows = [
      ['电源电压', `${s.volt.toFixed(1)} V`],
      ['电流 I', `${s.I >= 0 ? '' : '−'}${Math.abs(s.I).toFixed(2)} A`],
      ['转速 n', `${(s.om / (Math.PI * 2)).toFixed(2)} r/s`],
      ['线圈转角', `${(((s.th * 180 / Math.PI) % 360) + 360) % 360 | 0}°`],
      ['反电动势 e', `${Math.abs(s.e).toFixed(2)} V`],
      ['状态', statusText(s)],
    ]
    const hw = 226, hh = 26 + rows.length * 19, hx = D.W - hw - 14, hy = 14
    let hud = `<rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" rx="12" fill="rgba(17,24,39,0.84)" stroke="rgba(148,163,184,0.35)" stroke-width="1"/>`
      + `<text x="${hx + 12}" y="${hy + 17}" font-size="11" font-weight="700" fill="#93C5FD" font-family="Microsoft YaHei, sans-serif">实时数据</text>`
    rows.forEach(([k, v], i) => {
      const yy = hy + 36 + i * 19
      hud += `<text x="${hx + 12}" y="${yy}" font-size="11" fill="#E2E8F0" font-family="Microsoft YaHei, sans-serif">${k}</text>`
      hud += `<text x="${hx + hw - 12}" y="${yy}" text-anchor="end" font-size="11" font-weight="700" fill="#FDE68A" font-family="Microsoft YaHei, sans-serif">${v}</text>`
    })

    g.innerHTML = rotor + dots + hud
  }

  function statusText(s) {
    if (!s.closed) {
      return Math.abs(s.om) > 0.3 ? '断电，惯性滑行' : '未通电'
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

  /* 演示页器材（电池组 / 开关 / 电动机本体）—— 都是器材库原厂图，直接嵌进大 SVG */
  const batterySVG = TYPES.battery.render({ id: 'demo-bat' })
  const switchSVG = TYPES.switch.render({ id: 'demo-sw', closed: ui.closed })
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
              <button
                type="button"
                onClick={() => applyUi({ closed: !ui.closed })}
                style={chipStyle(ui.closed, '#16A34A')}
                title="合上闸刀开关，电动机通电"
              >
                {ui.closed ? '⏸ 停止' : '▶ 启动'}
              </button>
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
              <linearGradient id="em-wood" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F3DDBE" />
                <stop offset="12%" stopColor="#E8C79C" />
                <stop offset="100%" stopColor="#C89A66" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width={D.W} height={D.H} fill="url(#em-bg)" />

            {/* 台面 */}
            <rect x="-10" y={TABLE_Y - 8} width={D.W + 20} height="12" rx="6" fill="rgba(120,80,40,0.14)" />
            <rect x="-10" y={TABLE_Y} width={D.W + 20} height={D.H - TABLE_Y + 6} rx="8" fill="url(#em-wood)" stroke="rgba(122,82,44,0.55)" strokeWidth="1.2" />
            {[0, 1, 2, 3, 4].map((i) => (
              <path key={`g${i}`} d={`M6 ${TABLE_Y + 20 + i * 12} C ${D.W * 0.3} ${TABLE_Y + 18 + i * 12}, ${D.W * 0.7} ${TABLE_Y + 23 + i * 12}, ${D.W - 6} ${TABLE_Y + 20 + i * 12}`}
                stroke="rgba(150,104,58,0.22)" strokeWidth="1" fill="none" />
            ))}

            {/* 导线（静态） */}
            {WIRES.map((w, i) => {
              const c1 = { x: w.a.x + (w.b.x - w.a.x) * 0.16, y: w.base }
              const c2 = { x: w.a.x + (w.b.x - w.a.x) * 0.84, y: w.base }
              return (
                <g key={`w${i}`}>
                  <path d={`M${w.a.x} ${w.a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${w.b.x} ${w.b.y}`}
                    stroke={w.color} strokeWidth="4" strokeLinecap="round" fill="none" />
                  <path d={`M${w.a.x} ${w.a.y - 1} C ${c1.x} ${c1.y - 1}, ${c2.x} ${c2.y - 1}, ${w.b.x} ${w.b.y - 1}`}
                    stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                </g>
              )
            })}

            {/* 电动机本体（机身贴图），线圈 + 换向器由动态层按转角换帧 */}
            <g transform={`translate(${MOTOR.x},${MOTOR.y})`} dangerouslySetInnerHTML={{ __html: motorBodySVG }} />

            {/* 电池组 */}
            <g transform={`translate(${BAT.x},${BAT.y})`} dangerouslySetInnerHTML={{ __html: batterySVG }} />
            {/* 闸刀开关（合/断由「启动/停止」控制） */}
            <g transform={`translate(${SW.x},${SW.y})`} dangerouslySetInnerHTML={{ __html: switchSVG }} />

            {/* 动态层：线圈 / 换向器 / 电流小点 / 读数板 */}
            <g ref={dynRef} />
          </svg>
        </div>

        {ui.tab === 2 && (
          <BuilderSVG
            ref={builderRef}
            wireColor={ui.wireColor}
            emptyHint="从右侧器材栏拖入「电动机」「电池组」「开关」，再点接线柱连线"
          />
        )}

        {ui.tab === 1 ? (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            purpose="通电线圈在磁场里受力转动；换向器每半圈改变一次线圈里的电流方向，让线圈能连续转下去。"
            steps={[
              '① 点「▶ 启动」合上闸刀开关：线圈通电，在 N→S 的磁场里受安培力转起来',
              '线圈转到与磁感线平行时力矩为零，靠惯性冲过去；换向器此刻把电流反向，力矩方向不变',
              '② 点「换向器：已拆」再启动：电流方向不再改变，线圈摆几下就停在平衡位置 —— 这就是换向器的作用',
              '③ 点「接线柱：反接」（或「磁极：N 右 S 左」）再启动：转向反过来',
              '两样同时改变（反接 + 对调磁极）：转向又回到原来的方向',
              '电压从 3 V 调到 9 V：电流变大，转速变快（看右侧实时数据里的 n 和 I）',
              '「⏸ 停止」断开电路：线圈靠惯性滑行，摩擦让它慢慢停下来',
            ]}
            hint="通电线圈在磁场中受力转动，是电动机的原理：电能 → 机械能。换向器（两个半环 + 两片电刷）在线圈每转过半圈时交换与电刷的接触，使线圈里的电流反向，于是转矩方向始终一致。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            purpose="自己把器材拖进桌面搭一台电动机的电路：转不转、往哪转、转多快，全看你自己的接法。"
            steps={[
              '① 从右侧器材栏拖「电动机」「电池组」「开关」到桌面（点一下也能加进来）',
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
              { type: 'switch', name: '开关', icon: thumb('switch') },
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
