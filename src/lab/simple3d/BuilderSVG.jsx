/**
 * BuilderSVG — 简单电路「自己动手」2D/SVG 搭建器
 *
 * 移植自 ⚡电学虚拟实验室（ElectricSvgLabScene）的 2D 成功经验：
 *   - 电路求解复用 engine/electricLab.js（节点法 MNA + 高斯消元）
 *   - 器材外形复用 scenes/electricSvgInstruments.js 的 1:1 SVG 定义（TYPES）
 *   - 连续软电线（贝塞尔电缆 + 端头护套）、点接线柱连线、开关通断、滑变调阻、电表读数
 *
 * 与完整实验室的区别：面向入门「简单电路」，只保留基础器材；
 * 不挂 3D 渲染器，纯 DOM + SVG，无 three 依赖。
 *
 * 对外命令式 API（对齐原 Builder3D 的 ref 接口）：
 *   add(type)  按器材类型加入桌面（网格摆放）
 *   reset()    清空桌面与导线
 */

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react'
import { solveCircuit, CFG } from '../engine/electricLab.js'
import { TYPES, RHEO_TRACK, rheostatMode } from '../scenes/electricSvgInstruments.js'
import {
  wireCurve, curveD, curveMid, wireLayers, wrapLayers,
} from '../render/wireSvg.js'

/* 画布逻辑尺寸（与完整实验室一致的 1800×1100 比例，内部等比缩放适配容器） */
const CW = 1800
const CH = 1100

/* 接线柱锚点：柱帽正下方的柱脚（导线真正夹住的地方） */
const TERM_DROP = 7
const WIRE_W = 4.2

const WIRE_COLORS = [
  { key: 'red', hex: '#e53935' },
  { key: 'green', hex: '#2e9e44' },
  { key: 'black', hex: '#1c1f24' },
]

const keyOf = (cid, tid) => cid + ':' + tid

/** 接线锚点：接线柱帽正下方（导线真正夹持处） */
function termAnchor(c, tid) {
  const t = (TYPES[c.type] && TYPES[c.type].terminals.find((x) => x.id === tid)) || null
  return t ? { x: c.x + t.x, y: c.y + t.y + TERM_DROP } : null
}

/** 出线方向：接线柱在器材左半 → 向左拔出，右半 → 向右 */
function outOf(c, tid) {
  const t = (TYPES[c.type] && TYPES[c.type].terminals.find((x) => x.id === tid)) || null
  if (!t) return 1
  return t.x < (TYPES[c.type].w || 0) / 2 ? -1 : 1
}

/** 一根导线的曲线（p1/p2 为柱脚锚点） */
function wireGeom(c1, tid1, c2, tid2, seed) {
  const p1 = termAnchor(c1, tid1)
  const p2 = termAnchor(c2, tid2)
  if (!p1 || !p2) return null
  const cur = wireCurve(p1, p2, outOf(c1, tid1), outOf(c2, tid2), seed)
  return { p1, p2, cur, mid: curveMid(cur) }
}

/* 简单电路入门器材（类型与引擎 TYPES / TERM_IDS 一一对应） */
const PALETTE = [
  { type: 'battery', name: '电池组' },
  { type: 'accumulator', name: '蓄电池' },
  { type: 'bulb', name: '灯泡' },
  { type: 'switch', name: '开关' },
  { type: 'resistor5', name: '定值电阻 5Ω' },
  { type: 'rheostat', name: '滑动变阻器' },
  { type: 'ammeter', name: '电流表' },
  { type: 'ammeterA', name: '安培表' },
  { type: 'voltmeter', name: '电压表' },
]

const METER_NAME = { ammeter: '电流表', ammeterA: '安培表', voltmeter: '电压表' }

/* ══════════════════════════════════════════════════════════════════════
 *  电子流动层 —— 合上开关、导线里真有电流时才出现
 *
 *  真实现象：合上开关，导线里立刻建立电场，自由电子在电场力作用下**整体**朝
 *  高电位（+极）方向漂移（漂移速度很慢，但"在场的作用下发生相对移动"是可观察的）。
 *  引擎给的 _wireI[wid] 是「a→b 为正」的电流；电流方向与电子漂移方向相反，
 *  所以电子沿导线的行进方向 = -sign(_wireI)。
 *  · 黄点（里面一道小横 = 电子 e⁻）沿导线弧长均匀撒开，随相位推进；
 *  · 红箭头标电流 I 的方向（与黄点反向），压白描边，红导线上也认得出来。
 * ══════════════════════════════════════════════════════════════════════ */
const ELEC_V = 130      // 逻辑 px/s，肉眼能看清又不晃眼
const ELEC_GAP = 64     // 相邻电子的弧长间距

/** 三次贝塞尔取点 */
function bezPoint(cur, t) {
  const u = 1 - t
  const A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t
  return {
    x: A * cur.p0.x + B * cur.c1.x + C * cur.c2.x + D * cur.p1.x,
    y: A * cur.p0.y + B * cur.c1.y + C * cur.c2.y + D * cur.p1.y,
  }
}

/** 弧长表（t 均匀取样 → 累积弧长），用于"沿导线等间距"落点 */
function arcTable(cur, n = 96) {
  const pts = []
  let s = 0
  for (let i = 0; i <= n; i++) {
    const p = bezPoint(cur, i / n)
    if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)
    pts.push({ x: p.x, y: p.y, s, t: i / n })
  }
  return { pts, len: s || 1 }
}

/** 弧长 s → 点 + 切线角（s 会自动取模） */
function atArc(tab, s) {
  const pts = tab.pts
  const len = tab.len
  const ss = ((s % len) + len) % len
  let lo = 0, hi = pts.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].s <= ss) lo = mid
    else hi = mid
  }
  const a = pts[lo], b = pts[hi]
  const k = b.s > a.s ? (ss - a.s) / (b.s - a.s) : 0
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    ang: Math.atan2(b.y - a.y, b.x - a.x),
  }
}

/** 电子 + 电流箭头（自带 rAF，只重渲染自己这一层） */
function ElectronFlow({ items }) {
  const [phase, setPhase] = useState(0)
  const live = items.length > 0
  useEffect(() => {
    if (!live) return undefined
    let raf = 0
    const t0 = performance.now()
    const loop = (t) => { setPhase((t - t0) / 1000); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [live])

  return (
    <svg className="esb-flowlayer" width={CW} height={CH}>
      {items.map((it) => {
        const tab = arcTable(it.cur)
        const n = Math.max(1, Math.round(tab.len / ELEC_GAP))
        const step = tab.len / n
        const dots = []
        for (let k = 0; k < n; k++) {
          const p = atArc(tab, phase * ELEC_V * it.dir + k * step)
          dots.push(
            <g key={'d' + k} transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}>
              <circle r="4.5" fill="rgba(255,213,74,0.34)" />
              <circle r="3.0" fill="#ffd54a" stroke="#8a6a00" strokeWidth="0.9" />
              <rect x="-1.6" y="-0.65" width="3.2" height="1.3" rx="0.65" fill="#5f4700" />
            </g>
          )
        }
        // 电流方向箭头：**全场景只标一个**（挑电流最大的那根导线 = 主回路），
        // 与电子反向；抬到导线上方 15px，别压在电缆上，白描边保证任何线色都认得出来
        let arrow = null
        if (it.arrowOn && tab.len > 50) {
          const p = atArc(tab, 0.55 * tab.len)
          const rot = (p.ang * 180) / Math.PI + (-it.dir > 0 ? 0 : 180)
          arrow = (
            <g transform={`translate(${p.x.toFixed(1)},${(p.y - 15).toFixed(1)}) rotate(${rot.toFixed(1)})`}>
              <path d="M-6.4 -3.6 L6.4 0 L-6.4 3.6 Z" fill="#e11d48" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
              <text x="0" y="-9" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#e11d48"
                stroke="#fff" strokeWidth="2.2" paintOrder="stroke" fontFamily="ui-monospace,Consolas,monospace">I</text>
            </g>
          )
        }
        return <g key={it.id}>{dots}{arrow}</g>
      })}
    </svg>
  )
}

const BuilderSVG = forwardRef(function BuilderSVG({ wireColor }, ref) {
  const [comps, setComps] = useState([])
  const [wires, setWires] = useState([])
  const [selected, setSelected] = useState(null)
  const [pending, setPending] = useState(null)
  const [, forceUpdate] = useState(0)
  const [records, setRecords] = useState([])
  const [dissect, setDissect] = useState(false)   // 一键透视：外壳半透明、露出 .inner 内部结构
  const seqRef = useRef(0)

  const uidRef = useRef(1)
  const dragRef = useRef(null)
  const lastUpRef = useRef(null)
  const compsRef = useRef([])
  const wiresRef = useRef([])
  const solvedRef = useRef(null)
  const previewTipRef = useRef(null)
  const previewPathRef = useRef(null)
  const canvasRef = useRef(null)
  compsRef.current = comps
  wiresRef.current = wires

  /* ── 求解（comps/wires 变化即重算）── */
  const solved = useMemo(() => solveCircuit(comps, wires), [comps, wires])
  solvedRef.current = solved

  const nextId = () => uidRef.current++
  const T = (c) => TYPES[c.type]

  /* ── 元件增删 ── */
  const addComp = useCallback((type, x, y) => {
    const t = TYPES[type]
    if (!t) return null
    const c = {
      id: uidRef.current++, type,
      x: Math.max(0, Math.min(CW - t.w, Math.round(x))),
      y: Math.max(0, Math.min(CH - t.h, Math.round(y))),
      closed: false, showRead: false, f: 0.4, rmax: CFG.RHEO_MAX,
    }
    setComps((cs) => cs.concat(c))
    return c
  }, [])

  const addWire = useCallback((ta, tb, color) => {
    if (ta.cid === tb.cid && ta.tid === tb.tid) return
    const a = keyOf(ta.cid, ta.tid)
    const b = keyOf(tb.cid, tb.tid)
    setWires((ws) => {
      if (ws.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return ws
      return ws.concat({ id: uidRef.current++, a, b, color: color || wireColor })
    })
  }, [wireColor])

  const removeComp = useCallback((id) => {
    setComps((cs) => cs.filter((c) => c.id !== id))
    setWires((ws) => ws.filter((w) => !w.a.startsWith(id + ':') && !w.b.startsWith(id + ':')))
    setSelected((s) => (s && s.kind === 'comp' && s.id === id ? null : s))
  }, [])

  const removeWire = useCallback((id) => {
    setWires((ws) => ws.filter((w) => w.id !== id))
    setSelected((s) => (s && s.kind === 'wire' && s.id === id ? null : s))
  }, [])

  /* ── 对外命令式 API（对齐原 Builder3D：add / reset）── */
  useImperativeHandle(ref, () => ({
    add(type) {
      /* 网格摆放，多件不叠压。摆位按「画布与视口的交集」算，保证新器材一定落在看得见的地方
       * （原来 2 列 × 260 递推，第 4 行 y=900 已经掉到折叠线以下，滑变/电流表/电压表
       *  正好是最后三件，点进来就像"没加上"）。 */
      const t = TYPES[type]
      const cs = compsRef.current
      const cv = canvasRef.current
      const n = cs.length
      let visW = CW, visH = CH, sx = 1, sy = 1
      if (cv) {
        const r = cv.getBoundingClientRect()
        sx = r.width > 0 ? CW / r.width : 1
        sy = r.height > 0 ? CH / r.height : 1
        visW = Math.min(r.width, Math.max(240, window.innerWidth - r.left)) * sx
        visH = Math.min(r.height, Math.max(200, window.innerHeight - r.top)) * sy
      }
      const cols = Math.max(1, Math.min(3, Math.floor(visW / Math.max(1, t ? t.w + 60 : 300))))
      const rows = Math.max(1, Math.floor(visH / Math.max(1, t ? t.h + 70 : 300)))
      const cw = visW / cols
      const chh = visH / rows
      const slot = n % Math.max(1, cols * rows)
      const x = (slot % cols) * cw + (cw - (t ? t.w : 0)) / 2
      const y = Math.floor(slot / cols) * chh + (chh - (t ? t.h : 0)) / 2
      addComp(type, x, y)
    },
    /* 从器材栏拖到桌面：按落点居中摆放；落点在桌面外就退回网格位 */
    addAt(type, clientX, clientY) {
      const t = TYPES[type]
      const cv = canvasRef.current
      if (!t || !cv) return null
      const r = cv.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        const x = (clientX - r.left) * (CW / r.width) - t.w / 2
        const y = (clientY - r.top) * (CH / r.height) - t.h / 2
        return addComp(type, x, y)
      }
      const cs = compsRef.current
      return addComp(type, cs.length % 2 === 0 ? 120 : 900, 120 + Math.floor(cs.length / 2) * 260)
    },
    reset() {
      setComps([]); setWires([]); setSelected(null); setPending(null)
      previewTipRef.current = null
    },
  }), [addComp])

  /* ── 坐标换算：容器像素 → 画布逻辑坐标（等比缩放）── */
  const canvasPoint = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    const sx = CW / r.width
    const sy = CH / r.height
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }

  const stopPreview = () => {
    previewTipRef.current = null
    if (previewPathRef.current) previewPathRef.current.setAttribute('d', '')
  }

  /* ── 接线柱按下：点柱连线（pending → 再点另一柱连通）── */
  const onTermDown = (e, c, tid) => {
    e.preventDefault(); e.stopPropagation()
    if (pending && !(pending.cid === c.id && pending.tid === tid)) {
      addWire(pending, { cid: c.id, tid })
      setPending(null); stopPreview()
      return
    }
    if (pending && pending.cid === c.id && pending.tid === tid) {
      setPending(null); stopPreview()
      return
    }
    setPending({ cid: c.id, tid })
    const p1 = termAnchor(c, tid)
    if (p1) previewTipRef.current = { from: { cid: c.id, tid }, tip: { x: p1.x + outOf(c, tid) * 20, y: p1.y - 60 } }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /* ── 元件本体按下：拖动 / 滑片 / 开关 ── */
  const onCompDown = (e, c) => {
    if (e.target.closest('.esb-term')) return
    const slider = e.target.closest('.slider-handle')
    if (c.type === 'rheostat' && slider) {
      dragRef.current = { kind: 'slider', compId: c.id, startF: c.f ?? 0.4 }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }
    dragRef.current = {
      kind: 'move', compId: c.id,
      grab: (() => { const p = canvasPoint(e); return { dx: p.x - c.x, dy: p.y - c.y } })(),
      sx: e.clientX, sy: e.clientY, moved: false,
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onMove = (e) => {
    const d = dragRef.current
    if (d && d.kind === 'move') {
      const p = canvasPoint(e)
      setComps((cs) => cs.map((c) => {
        if (c.id !== d.compId) return c
        const t = T(c)
        return {
          ...c,
          x: Math.max(-10, Math.min(CW - t.w + 10, p.x - d.grab.dx)),
          y: Math.max(-10, Math.min(CH - t.h + 10, p.y - d.grab.dy)),
        }
      }))
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true
      return
    }
    if (d && d.kind === 'slider') {
      const p = canvasPoint(e)
      setComps((cs) => cs.map((c) => {
        if (c.id !== d.compId) return c
        const f = (p.x - c.x - RHEO_TRACK.x0) / (RHEO_TRACK.x1 - RHEO_TRACK.x0)
        return { ...c, f: Math.max(0, Math.min(1, f)) }
      }))
      return
    }
    if (pending && !d) {
      const pt = canvasPoint(e)
      const st = previewTipRef.current
      if (st) {
        st.tip = pt
        const c = compsRef.current.find((x) => x.id === st.from.cid)
        const p1 = c ? termAnchor(c, st.from.tid) : null
        if (p1 && previewPathRef.current) {
          const cur = wireCurve(p1, pt, outOf(c, st.from.tid), p1.x < pt.x ? -1 : 1, 7)
          previewPathRef.current.setAttribute('d', curveD(cur))
        }
      }
    }
  }

  const tapComp = useCallback((c, isDouble) => {
    if (!c) return
    if (c.type === 'switch') {
      setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, closed: !x.closed } : x)))
    } else if (T(c) && T(c).meter && isDouble) {
      setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, showRead: !x.showRead } : x)))
    } else {
      setSelected((s) => (s && s.kind === 'comp' && s.id === c.id ? null : { kind: 'comp', id: c.id }))
    }
  }, [])

  const onUp = (e) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const d = dragRef.current
    dragRef.current = null
    if (d && d.kind === 'move') {
      if (!d.moved) {
        const c = compsRef.current.find((x) => x.id === d.compId)
        const now = performance.now()
        const last = lastUpRef.current
        const isDouble = !!(last && now - last.t < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 28)
        lastUpRef.current = { t: now, x: e.clientX, y: e.clientY }
        tapComp(c, isDouble)
      }
      return
    }
    if (d && d.kind === 'slider') forceUpdate((n) => n + 1)
  }

  /* ── 键盘删除 ── */
  useEffect(() => {
    const kd = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!selected) return
      e.preventDefault()
      if (selected.kind === 'comp') removeComp(selected.id)
      else removeWire(selected.id)
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [selected, removeComp, removeWire])

  /* ── 求解结果 → 器材动态状态 ── */
  const dynOf = (c) => {
    const o = solved[c.id] || {}
    if (c.type === 'bulb') {
      const p = o._P || 0
      return { bright: p > 0 ? Math.min(1, p / CFG.BULB_RATED) : 0, over: p > CFG.BULB_RATED * 1.02 }
    }
    if (c.type === 'ammeter') return { frac: (o._I || 0) / (o._fs || CFG.AMM_FS_2) } // 中心零位：带符号
    // 安培表 / 电压表：零位在左，接反时指针必须往 0 的左边甩（负 frac），
    // 不能像以前那样取绝对值照样"正常"右偏
    if (c.type === 'ammeterA') return { frac: (o._I || 0) / (o._fs || CFG.AMM_FS) }
    if (c.type === 'voltmeter') return { frac: (o._V || 0) / (o._fs || CFG.VOLT_FS) }
    if (c.type === 'rheostat') {
      const wired = new Set()
      for (const w of wires) {
        if (w.a.startsWith(c.id + ':')) wired.add(w.a.split(':')[1])
        if (w.b.startsWith(c.id + ':')) wired.add(w.b.split(':')[1])
      }
      // live：开关合上、线圈里真流过电流时才着色（未接线 / 断路时 _I≈0）
      return { mode: rheostatMode(wired), live: Math.abs(o._I || 0) > 1e-3 }
    }
    return {}
  }

  const readoutOf = (c) => {
    const o = solved[c.id] || {}
    const d = solved.diagnostics || {}
    // 带符号（接反就是负值）+ 一句短标注，别让"接反了读数还跟正常一样"
    const fmt = (v) => (Math.abs(v) < 0.0005 ? '0.000' : (v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(3))
    if (c.type === 'ammeter' || c.type === 'ammeterA') {
      const bad = !!o._rev
      const par = !!d.ammeterParallel
      const tag = par ? ' 并联' : bad ? ' 接反' : ''
      return {
        text: `I = ${fmt(o._I || 0)} A${tag}`,
        color: bad || par || o._over ? '#fb7185' : '#4ade80',
      }
    }
    if (c.type === 'voltmeter') {
      const bad = !!o._rev
      const ser = !!d.voltmeterSeries
      const tag = ser ? ' 串联' : bad ? ' 接反' : ''
      return {
        text: `U = ${fmt(o._V || 0)} V${tag}`,
        color: bad || ser || o._over ? '#fb7185' : '#4ade80',
      }
    }
    return null
  }

  /* ── 电路状态摘要（通路 / 断路 / 短路 / 误接）── */
  const status = useMemo(() => {
    const bat = comps.find((c) => c.type === 'battery')
    const bulbs = comps.filter((c) => c.type === 'bulb')
    const d = solved.diagnostics || {}
    if (!bat) return { tone: 'warn', text: '从右侧拖入电源和灯泡，开始搭电路' }
    // 先报"接法错误"这个根因，再报它造成的后果（短路）
    if (d.ammeterParallel) return { tone: 'bad', text: '⚠ 电流表并联在元件两端，会烧坏电表！电流表应串联在电路中' }
    if (d.short) return { tone: 'bad', text: '⚠ 电源短路！请立即断开电源' }
    if (d.voltmeterSeries) return { tone: 'warn', text: '电压表串在电路中了：电压表应并联在被测元件两端' }
    // 电表接反：电流必须从「+」（量程柱）流进、「−」柱流出
    const revs = comps.filter((c) => (c.type === 'ammeter' || c.type === 'ammeterA' || c.type === 'voltmeter')
      && solved[c.id]?._rev)
    if (revs.length) {
      const nm = revs.map((c) => (c.type === 'voltmeter' ? '电压表' : '电流表')).join('、')
      return { tone: 'bad', text: `⚠ ${nm}接反了：指针反偏（读数前的负号）。应让电流从「+」量程柱流入、「−」柱流出` }
    }
    const batI = Math.abs(solved[bat.id]?._I || 0)
    if (batI > 1e-4) {
      const lit = bulbs.filter((b) => (solved[b.id]?._P || 0) > 0.001)
      return { tone: 'ok', text: lit.length ? `✅ 通路 · ${lit.length} 只灯泡发光` : '✅ 电路接通' }
    }
    const opened = comps.find((c) => c.type === 'switch' && !c.closed)
    if (opened) return { tone: 'warn', text: '开关断开 · 电路不通' }
    return { tone: 'warn', text: '电路未接通（回路不完整或断路）' }
  }, [comps, solved])

  const compById = (id) => comps.find((c) => c.id === id)

  /* 有电流的导线 → 电子流动层的数据。
     电子行进方向 = -sign(_wireI)（_wireI 以 a→b 为正 = 电流方向，电子反向） */
  const flowItems = (() => {
    const wI = solved._wireI || {}
    const out = []
    for (const w of wires) {
      const I = wI[w.id]
      if (!I || Math.abs(I) < 5e-4) continue
      const c1 = compById(+w.a.split(':')[0])
      const c2 = compById(+w.b.split(':')[0])
      if (!c1 || !c2) continue
      const g = wireGeom(c1, w.a.split(':')[1], c2, w.b.split(':')[1], w.id * 977 + 13)
      if (!g) continue
      out.push({ id: w.id, cur: g.cur, dir: I > 0 ? -1 : 1, mag: Math.abs(I) })
    }
    // 只在这根（电流最大的）导线上标电流方向箭头
    let bestId = -1
    let bestMag = 0
    for (const it of out) if (it.mag > bestMag) { bestMag = it.mag; bestId = it.id }
    for (const it of out) it.arrowOn = it.id === bestId
    return out
  })()

  /* ── 实验记录：合闸 / 断闸（电流有无翻转、或开关被拨动）时追加一行 ── */
  const liveRef = useRef(null)
  const swList = comps.filter((c) => c.type === 'switch')
  const swSig = swList.length + ':' + swList.map((c) => (c.closed ? 1 : 0)).join('')
  useEffect(() => {
    const on = flowItems.length > 0
    const prev = liveRef.current
    liveRef.current = { on, swSig }
    if (!prev) return
    if (prev.on === on && prev.swSig === swSig) return
    // 只是"把开关拖进场景 / 删掉"（开关个数变了），不算一次实验
    if (prev.on === on && prev.swSig.split(':')[0] !== swSig.split(':')[0]) return
    const am = comps.find((c) => c.type === 'ammeter' || c.type === 'ammeterA')
    const vm = comps.find((c) => c.type === 'voltmeter')
    const i = am ? solved[am.id]?._I : null
    const u = vm ? solved[vm.id]?._V : null
    const d = solved.diagnostics || {}
    const lit = comps.filter((c) => c.type === 'bulb' && (solved[c.id]?._P || 0) > 0.001).length
    const num = (v) => (Math.abs(v) < 5e-4 ? '0.000' : (v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(3))
    const note = d.short ? '电源短路'
      : d.ammeterParallel ? '电流表并联（误接）'
        : d.voltmeterSeries ? '电压表串联（误接）'
          : on ? (lit ? `灯泡亮 ${lit} 只` : '电路接通')
            : (comps.some((c) => c.type === 'bulb') ? '灯泡灭' : '电路断开')
    seqRef.current += 1
    const row = {
      n: seqRef.current,
      t: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      st: on ? '通路' : '断路',
      i: i == null ? '—' : num(i),
      u: u == null ? '—' : num(u),
      note,
    }
    setRecords((rs) => [...rs.slice(-49), row])
  }, [flowItems.length, swSig])

  /* 端头：裸铜丝绕在柱脚的接线柱上（外皮到柱子前就结束，铜丝扣在柱脚上） */
  const wrapAt = (p, W, k) => (
    <g key={k} transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}>
      {/* 柱脚上的落影：只铺在绕线下面一点点，别整块涂黑 */}
      <ellipse cy={(W.ry * 0.9).toFixed(2)} rx={(W.rx + 0.7).toFixed(2)} ry={(W.ry * 0.55).toFixed(2)}
        fill="rgba(15,23,42,0.24)" />
      {/* 裸铜丝盘在柱脚上（螺旋，能看出往上绕的方向） */}
      <path d={W.d} fill="none" stroke={W.metalDark} strokeWidth={(W.sw + 0.8).toFixed(2)}
        strokeLinecap="round" opacity="0.9" />
      <path d={W.d} fill="none" stroke={W.metal} strokeWidth={W.sw.toFixed(2)} strokeLinecap="round" />
      <path d={W.dHi} fill="none" stroke={W.metalHi} strokeWidth={Math.max(0.5, W.sw * 0.42).toFixed(2)}
        strokeLinecap="round" opacity="0.8" />
      {/* 柱脚外侧拧出来的线头 */}
      <path d={W.tail} fill="none" stroke={W.metal} strokeWidth={(W.sw * 0.9).toFixed(2)} strokeLinecap="round" />
    </g>
  )

  return (
    <div className={`esb-root${dissect ? ' dissect' : ''}`}>
      <style>{`
        .esb-root{position:relative;flex:1;min-height:0;background:#eef2f7;
          font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif}
        /* 画布 1800×1100 比场景视口大，要能滚动；状态条 / 图例 / 实验记录三块浮层
           挂在滚动区外面，永远贴在"看得见的"左下与右下 */
        .esb-scroll{position:absolute;inset:0;overflow:auto}
        .esb-canvas{position:relative;width:${CW}px;height:${CH}px;border-radius:14px;
          background:linear-gradient(#fbfcfe,#fbfcfe),
            repeating-linear-gradient(0deg,transparent 0 39px,#e7edf5 39px 40px),
            repeating-linear-gradient(90deg,transparent 0 39px,#e7edf5 39px 40px);
          box-shadow:inset 0 0 0 1px #dbe3ec,0 10px 30px rgba(15,23,42,.07);margin:12px}
        .esb-wirelayer{position:absolute;inset:0;pointer-events:none;z-index:3}
        /* 端头层：导线本体整根压在器材之上（真导线是摆在板面上、绕到柱脚的）；
           这一层只负责让"裸铜丝绕在柱脚上"永远画在所有导线最上面。 */
        .esb-wiretop{position:absolute;inset:0;pointer-events:none;z-index:6}
        .esb-partlayer{position:absolute;inset:0;z-index:2;pointer-events:none}
        .esb-comp{position:absolute;cursor:grab;touch-action:none;pointer-events:auto}
        .esb-comp:active{cursor:grabbing}
        .esb-comp svg{display:block;overflow:visible}
        /* 器件图纸里叠了一"内部结构"层（.inner/.plabel）。默认隐藏（否则会从照片的透明区、
           缝隙里露出来）；点右上「🔍 内部结构」后：外壳照片半透明 → 露出内部（X-ray 透视） */
        .esb-root:not(.dissect) .inner,.esb-root:not(.dissect) .plabel{display:none}
        /* 剖视标注：小字 + 蓝字白边（原来没设字号，浏览器默认 16px，字比表盘还大、全溢出壳外） */
        .esb-root .plabel{font-size:9.5px;fill:#1d4ed8;font-weight:600;text-anchor:middle;
          pointer-events:none;paint-order:stroke;stroke:rgba(255,255,255,.9);stroke-width:2.5px}
        .esb-root .casing{transition:opacity .22s ease}
        .esb-root.dissect .casing{opacity:.30}
        /* 电表：黑壳 + 白盘合成的一层，透视时淡到几乎透明，才看得见后面的磁钢/线圈 */
        .esb-root .esb-dial{transition:opacity .22s ease}
        .esb-root.dissect .esb-dial{opacity:.18}
        .esb-dissect{position:absolute;right:18px;top:16px;z-index:22;display:inline-flex;align-items:center;gap:6px;
          padding:7px 13px;border-radius:10px;border:1px solid #dbe3ec;background:rgba(255,255,255,.96);
          color:#1e293b;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;
          box-shadow:0 6px 18px rgba(2,6,23,.14);transition:background .15s,border-color .15s,color .15s}
        .esb-dissect:hover{background:#f8fafc;border-color:#c7d2e0}
        .esb-dissect.on{background:#fff7ed;border-color:#f59e0b;color:#b45309}
        .esb-comp.selected .esb-boxhl{opacity:1}
        .esb-boxhl{position:absolute;inset:-6px;border:2px dashed #2563eb;border-radius:12px;
          opacity:0;pointer-events:none;transition:opacity .15s}
        .esb-comp:hover .esb-boxhl{opacity:.45}
        .esb-term{position:absolute;width:20px;height:20px;border-radius:50%;
          background:transparent;border:2px solid transparent;cursor:crosshair;z-index:5;
          pointer-events:auto;transition:transform .12s,box-shadow .12s,border-color .12s}
        .esb-termhit{position:absolute;inset:0;z-index:5;pointer-events:none}
        .esb-term:hover{transform:scale(1.35);box-shadow:0 0 0 5px rgba(37,99,235,.22);border-color:#2563eb}
        .esb-term.active{border-color:#f59e0b;box-shadow:0 0 0 7px rgba(245,158,11,.25);transform:scale(1.3)}
        .esb-wire-preview{fill:none;stroke:#f59e0b;stroke-width:3.4;stroke-linecap:round;opacity:.9}
        .esb-delbtn{position:absolute;width:26px;height:26px;border-radius:50%;z-index:12;
          background:#e11d48;color:#fff;border:2px solid #fff;font-size:14px;font-weight:700;
          display:grid;place-items:center;cursor:pointer;line-height:1;font-family:inherit}
        .esb-readout{position:absolute;left:50%;top:-36px;transform:translateX(-50%);
          background:#0f172a;color:#4ade80;font-family:ui-monospace,Consolas,monospace;font-size:13px;
          padding:4px 9px;border-radius:7px;white-space:nowrap;border:1px solid #334155;
          transition:opacity .15s;pointer-events:none;z-index:9;font-weight:600}
        .esb-status{position:absolute;left:12px;bottom:12px;z-index:20;padding:7px 14px;border-radius:10px;
          font-size:13px;font-weight:600;pointer-events:none;box-shadow:0 4px 14px rgba(2,6,23,.25)}
        .esb-flowlayer{position:absolute;inset:0;pointer-events:none;z-index:4}
        .esb-flow-legend{position:absolute;left:12px;bottom:52px;z-index:20;display:flex;align-items:center;gap:9px;
          padding:6px 12px;border-radius:10px;background:rgba(255,255,255,.94);border:1px solid #dbe3ec;
          font-size:12px;color:#334155;pointer-events:none;box-shadow:0 4px 14px rgba(2,6,23,.18);white-space:nowrap}
        .esb-log{position:absolute;right:14px;bottom:14px;z-index:20;width:430px;max-height:198px;
          display:flex;flex-direction:column;background:rgba(255,255,255,.96);border:1px solid #dbe3ec;
          border-radius:12px;box-shadow:0 6px 18px rgba(2,6,23,.16);overflow:hidden;
          font-size:12px;color:#334155;pointer-events:auto}
        .esb-log-h{display:flex;align-items:center;justify-content:space-between;padding:5px 10px;
          background:#f1f5f9;border-bottom:1px solid #e2e8f0;flex:none}
        .esb-log-t{font-weight:700;color:#1e293b}
        .esb-log-clear{border:none;background:transparent;color:#2563eb;cursor:pointer;
          font-size:11.5px;font-family:inherit;padding:1px 4px;border-radius:5px}
        .esb-log-clear:hover{background:#e2e8f0}
        .esb-log-body{overflow:auto;max-height:160px}
        .esb-log-empty{padding:13px;color:#94a3b8}
        .esb-log-tbl{width:100%;border-collapse:collapse}
        .esb-log-tbl th,.esb-log-tbl td{padding:3px 7px;border-bottom:1px solid #eef2f7;text-align:center;white-space:nowrap}
        .esb-log-tbl th{position:sticky;top:0;background:#f8fafc;font-weight:600;color:#475569}
        .esb-log-tbl td.note{text-align:left;color:#64748b}
        .esb-lg-item{display:inline-flex;align-items:center}
        .esb-lg-dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:5px;
          background:#ffd54a;border:1px solid #8a6a00;position:relative}
        .esb-lg-dot::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:1.6px;
          background:#5f4700;transform:translate(-50%,-50%)}
        .esb-lg-arrow{display:inline-block;width:0;height:0;margin:0 2px;
          border-left:13px solid #e11d48;border-top:5px solid transparent;border-bottom:5px solid transparent;
          filter:drop-shadow(0 0 0 #fff)}
      `}</style>

      <div className="esb-scroll">
      <div className="esb-canvas" ref={canvasRef}>
        {/* 导线层 */}
        <svg className="esb-wirelayer" width={CW} height={CH}>
          {wires.map((w) => {
            const c1 = compById(+w.a.split(':')[0])
            const c2 = compById(+w.b.split(':')[0])
            if (!c1 || !c2) return null
            const g = wireGeom(c1, w.a.split(':')[1], c2, w.b.split(':')[1], w.id * 977 + 13)
            if (!g) return null
            const sel = selected && selected.kind === 'wire' && selected.id === w.id
            const color = w.color || '#475569'
            const L = wireLayers(g.cur, color, WIRE_W)
            const B = wrapLayers(color, WIRE_W)
            return (
              <g key={w.id}>
                {/* 连续电缆：落影 → 外皮 → 本色 → 上偏高光 */}
                <path d={L.dShadow} fill="none" stroke="rgba(15,23,42,0.20)" strokeWidth={L.w + 1.5} strokeLinecap="round" />
                {sel && (
                  <path d={L.d} fill="none" stroke="rgba(225,29,72,0.45)" strokeWidth={L.w + 4} strokeLinecap="round" />
                )}
                <path d={L.d} fill="none" stroke={L.casing} strokeWidth={L.w + 1.9} strokeLinecap="round" />
                <path d={L.d} fill="none" stroke={L.core} strokeWidth={L.w} strokeLinecap="round"
                  />
                <path d={L.dSheen} fill="none" stroke={L.sheen} strokeWidth={Math.max(1, L.w * 0.32)}
                  strokeLinecap="round" opacity="0.6" />
                {wrapAt(g.p1, B, 'b1')}
                {wrapAt(g.p2, B, 'b2')}
                {/* 命中区压在最上层 */}
                <path d={L.d} fill="none" stroke="transparent" strokeWidth={18} strokeLinecap="round"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={() => setSelected({ kind: 'wire', id: w.id })} />
                {sel && (
                  <g>
                    <circle cx={g.mid.x} cy={g.mid.y} r="9" fill="#e11d48" opacity="0.95" />
                    <text x={g.mid.x} y={g.mid.y + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">✕</text>
                    <circle cx={g.mid.x} cy={g.mid.y} r="14" fill="transparent"
                      style={{ pointerEvents: 'fill', cursor: 'pointer' }}
                      onClick={() => removeWire(w.id)} />
                  </g>
                )}
              </g>
            )
          })}
          {pending && <path ref={previewPathRef} className="esb-wire-preview" />}
        </svg>

        {/* 电子流动层：压在导线之上、护套之下 */}
        <ElectronFlow items={flowItems} />

        {/* 元件层 */}
        <div className="esb-partlayer">
          {comps.map((c) => {
            const t = T(c)
            if (!t) return null
            const dyn = dynOf(c)
            const ro = readoutOf(c)
            const isSel = selected && selected.kind === 'comp' && selected.id === c.id
            return (
              <div
                key={c.id}
                className={`esb-comp${isSel ? ' selected' : ''}`}
                style={{ left: c.x, top: c.y, width: t.w, height: t.h }}
                onPointerDown={(e) => onCompDown(e, c)}
              >
                <div className="esb-boxhl" />
                <div dangerouslySetInnerHTML={{ __html: t.render(c, dyn) }} />
                {t.meter && ro && (
                  <div className="esb-readout" style={{ opacity: c.showRead ? 1 : 0, color: ro.color }}>{ro.text}</div>
                )}
              </div>
            )
          })}
        </div>

        {/* 接线柱命中层：必须压在所有导线之上——否则柱子一接线，导线那根 18px 的
            命中带就把柱子盖住，"再点它接第二根线"根本点不动（多表并联就接不上） */}
        <div className="esb-termhit">
          {comps.map((c) => {
            const t = T(c)
            if (!t) return null
            return t.terminals.map((tm) => (
              <div
                key={c.id + ':' + tm.id}
                className={`esb-term${pending && pending.cid === c.id && pending.tid === tm.id ? ' active' : ''}`}
                title={tm.name}
                style={{ left: c.x + tm.x - 9, top: c.y + tm.y - 9 }}
                onPointerDown={(e) => onTermDown(e, c, tm.id)}
              />
            ))
          })}
        </div>

        {/* 端头护套层：压在器材之上（导线本体在器材后面，护套必须在前面，
            否则"接到接线柱上"这件事看不出来） */}
        <svg className="esb-wiretop" width={CW} height={CH}>
          {wires.map((w) => {
            const c1 = compById(+w.a.split(':')[0])
            const c2 = compById(+w.b.split(':')[0])
            if (!c1 || !c2) return null
            const g = wireGeom(c1, w.a.split(':')[1], c2, w.b.split(':')[1], w.id * 977 + 13)
            if (!g) return null
            const color = w.color || '#475569'
            const B = wrapLayers(color, WIRE_W)
            return (
              <g key={w.id}>
                {wrapAt(g.p1, B, 'b1')}
                {wrapAt(g.p2, B, 'b2')}
              </g>
            )
          })}
        </svg>
      </div>
      </div>

      {/* 一键内部透视：外壳变半透明，电表/灯泡/电池/滑变的内部构造（.inner）显出来 */}
      <button
        className={`esb-dissect${dissect ? ' on' : ''}`}
        title="外壳半透明，露出内部结构（碳棒、灯丝、线圈、表头机构…）"
        onClick={() => setDissect((v) => !v)}
      >
        {dissect ? '🔍 内部结构（开）' : '🔍 内部结构（透视）'}
      </button>

      {/* 状态浮层（贴在可视区左下，跟画布滚动无关） */}
        <div
          className="esb-status"
          style={{
            background: status.tone === 'ok' ? 'rgba(46,125,50,.92)' : status.tone === 'bad' ? 'rgba(198,40,40,.9)' : 'rgba(15,23,42,.84)',
            color: '#fff',
          }}
        >
          {status.text}
        </div>

        {/* 图例：只在有电流时出现，免得平时白占地方 */}
        {flowItems.length > 0 && (
          <div className="esb-flow-legend">
            <span className="esb-lg-item">
              <span className="esb-lg-dot" />
              电子 e<sup>−</sup>：− 极 → + 极
            </span>
            <span className="esb-lg-arrow" />
            <span className="esb-lg-item">
              电流 I：+ 极 → − 极（与电子反向）
            </span>
          </div>
        )}

        {/* 实验记录（右下角，表格）：合闸/断开自动记一行 */}
        <div className="esb-log">
          <div className="esb-log-h">
            <span className="esb-log-t">📋 实验记录</span>
            <button className="esb-log-clear" onClick={() => { setRecords([]); seqRef.current = 0 }}>清空</button>
          </div>
          <div className="esb-log-body">
            {records.length === 0 ? (
              <div className="esb-log-empty">合闸 / 断开开关时自动记一行（带当时的电表读数）</div>
            ) : (
              <table className="esb-log-tbl">
                <thead>
                  <tr><th>#</th><th>时刻</th><th>状态</th><th>I / A</th><th>U / V</th><th>现象</th></tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.n}>
                      <td>{r.n}</td><td>{r.t}</td><td>{r.st}</td><td>{r.i}</td><td>{r.u}</td><td className="note">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
  )
})

export default BuilderSVG
