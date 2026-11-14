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

const BuilderSVG = forwardRef(function BuilderSVG({ wireColor }, ref) {
  const [comps, setComps] = useState([])
  const [wires, setWires] = useState([])
  const [selected, setSelected] = useState(null)
  const [pending, setPending] = useState(null)
  const [, forceUpdate] = useState(0)

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
    if (c.type === 'ammeterA') return { frac: Math.abs(o._I || 0) / (o._fs || CFG.AMM_FS) }
    if (c.type === 'voltmeter') return { frac: Math.abs(o._V || 0) / (o._fs || CFG.VOLT_FS) }
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
    if (c.type === 'ammeter' || c.type === 'ammeterA') {
      const num = Math.abs(o._I || 0) < 0.0005 ? '0.000' : Math.abs(o._I || 0).toFixed(3)
      return { text: `I = ${num} A`, color: o._over ? '#fb7185' : o._rev ? '#fbbf24' : '#4ade80' }
    }
    if (c.type === 'voltmeter') {
      const num = Math.abs(o._V || 0) < 0.0005 ? '0.000' : Math.abs(o._V || 0).toFixed(3)
      return { text: `U = ${num} V`, color: o._over ? '#fb7185' : o._rev ? '#fbbf24' : '#4ade80' }
    }
    return null
  }

  /* ── 电路状态摘要（通路 / 断路 / 短路 / 误接）── */
  const status = useMemo(() => {
    const bat = comps.find((c) => c.type === 'battery')
    const bulbs = comps.filter((c) => c.type === 'bulb')
    const d = solved.diagnostics || {}
    if (!bat) return { tone: 'warn', text: '从右侧拖入电源和灯泡，开始搭电路' }
    if (d.short) return { tone: 'bad', text: '⚠ 电源短路！请立即断开电源' }
    if (d.ammeterParallel) return { tone: 'bad', text: '⚠ 电流表并联在元件两端，会烧坏电表！电流表应串联' }
    if (d.voltmeterSeries) return { tone: 'warn', text: '电压表串在电路中了：电压表应并联在被测元件两端' }
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
    <div className="esb-root">
      <style>{`
        .esb-root{position:relative;flex:1;min-height:0;overflow:auto;background:#eef2f7;
          font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif}
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
        /* 器件图纸里叠了一"内部结构"层（.inner/.plabel），简单电路没有剖视功能，
           这一层会从照片下缘、缝隙里露出来（灯泡底板下那块灰色小条就是它），直接隐藏 */
        .esb-root .inner,.esb-root .plabel{display:none}
        .esb-comp.selected .esb-boxhl{opacity:1}
        .esb-boxhl{position:absolute;inset:-6px;border:2px dashed #2563eb;border-radius:12px;
          opacity:0;pointer-events:none;transition:opacity .15s}
        .esb-comp:hover .esb-boxhl{opacity:.45}
        .esb-term{position:absolute;width:20px;height:20px;border-radius:50%;
          background:transparent;border:2px solid transparent;cursor:crosshair;z-index:5;
          transition:transform .12s,box-shadow .12s,border-color .12s}
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
      `}</style>

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
                {t.terminals.map((tm) => (
                  <div
                    key={tm.id}
                    className={`esb-term${pending && pending.cid === c.id && pending.tid === tm.id ? ' active' : ''}`}
                    title={tm.name}
                    style={{ left: tm.x - 9, top: tm.y - 9 }}
                    onPointerDown={(e) => onTermDown(e, c, tm.id)}
                  />
                ))}
                {t.meter && ro && (
                  <div className="esb-readout" style={{ opacity: c.showRead ? 1 : 0, color: ro.color }}>{ro.text}</div>
                )}
              </div>
            )
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

        {/* 状态浮层 */}
        <div
          className="esb-status"
          style={{
            background: status.tone === 'ok' ? 'rgba(46,125,50,.92)' : status.tone === 'bad' ? 'rgba(198,40,40,.9)' : 'rgba(15,23,42,.84)',
            color: '#fff',
          }}
        >
          {status.text}
        </div>
      </div>
    </div>
  )
})

export default BuilderSVG
