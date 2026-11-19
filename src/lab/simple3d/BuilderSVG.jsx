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
import { TYPES, AC_LEAD, RHEO_TRACK, rheostatMode, figURL, breakerLeverSVG } from '../scenes/electricSvgInstruments.js'
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
  { key: 'blue', hex: '#2f6fdc' },
  { key: 'pe', hex: '#8bc34a' },
  { key: 'green', hex: '#2e9e44' },
  { key: 'black', hex: '#1c1f24' },
]

const keyOf = (cid, tid) => cid + ':' + tid

/* ── 家用电器的"插头吸附"（照 NB：把电器拖到插孔上就自动插上）──
 * 电器卡里两根插脚在 (65,160)/(85,160)，中点 (75,160)；
 * 插座卡里的两个孔（L / N 孔）中点按"面板照片"重新量过：两孔 (47,72)、三孔 (52,86)（照片里 L/N 两斜孔的中点）。 */
const PLUG_TYPES = ['washer', 'kettle', 'riceCooker', 'heater']
/* 插头有几只脚：洗衣机（沾水）与电饭煲按实物是**三脚**（要接地），
 * 电热水壶、电暖器是**两脚**（外壳绝缘，不带接地脚）。
 * 于是两孔插座只吃得下两脚插头，三脚插头只认三孔插座 —— 现实里就是这么插的。 */
/* 家电的插头脚数：用户口径「家用电器全改为三芯插头」—— 四台都是三脚，
   插座只留三孔（两孔插座已从器材面板撤掉），所以不再有插不进的情况。 */
const PLUG_PINS = { washer: 3, riceCooker: 3, kettle: 3, heater: 3 }
/* 插座孔位中心（吸附点）。三孔插座按 socket3_face.png 重新量：
   E 竖孔在 (52,89.6)、L/N 两斜孔在 (38.5,113.9)/(65.5,113.9) —— 三孔整体外接框 x34..70、y84..120，
   中心 (52,103)；插头背面 42×40 盖上去正好把三个孔全包住（用户口径：插上不能露出孔）。 */
const SOCKET_HOLE = { socket2: { x: 47, y: 72 }, socket3: { x: 52, y: 103 } }
/* 插头是一只**独立可拖**的部件（电器放好后只拖插头，电源线可任意方向拉长）。
 * 形状照用户给的插头特写：**蛇头**——圆角三角形的头（顶宽、两侧收、下巴圆钝）+ 底下罗纹颈 + 灰线缆；
 * 正面三道白标（一竖两斜，照实物）。框 44×66（比头宽 10 px，为的是"插上"时能把三孔整个盖住）：
 *   没插 —— 锚点 = 头心 (22,22)；
 *   插上 —— 画**插头背面**（一块比三孔略大的圆角背板 + 颈），锚点压到 (22,33)，
 *            背板 42×40 正好罩住 E(90) 与 L/N(112) 三个孔 —— 用户口径：插上要看不见孔。 */
const PLUG_SIZE = { w: 44, h: 66 }
const PLUG_ANCHOR = { off: { x: 22, y: 22 }, on: { x: 22, y: 33 } }
/* 蛇头轮廓（34×40，画在 5,2 的偏移里）：圆角三角形的头，下巴收圆；脖子在 36..48，线从 48 出去 */
const PLUG_HEAD = 'M17 .9 C9.4 .9 3.5 4.1 2.3 10.6 C1.5 15 7.2 28.6 15.1 37.3'
  + ' C16.1 38.7 17.9 38.7 18.9 37.3 C26.8 28.6 32.5 15 31.7 10.6 C30.5 4.1 24.6 .9 17 .9 Z'
const PLUG_BOOT = 'M13.1 34.4 L11.7 44.2 Q11.3 47.3 13.6 47.7 H20.4 Q22.7 47.3 22.3 44.2 L20.9 34.4 Z'
/* 插上时看到的"插头背面"轮廓（44×66 画布，锚点 22,33 对着插座孔心）：
   上宽下窄、下巴收圆 —— 和正面那条蛇头是同一只插头，只是转过去了；不用矩形，矩形看着像"圆角方块"。
   宽度 ±21 足够把三孔（x 34..70 = 孔心 ±18）整个盖住。 */
const PLUG_BACK = 'M1.6 6.6 C1.6 3.4 4.2 1.8 8.2 1.8 L39.8 1.8 C43.8 1.8 46.4 3.4 46.4 6.6'
  + ' L45.2 42 C44.4 52.6 40 61 32.6 65.2 C29.6 66.8 26.8 67.4 24 67.4'
  + ' C21.2 67.4 18.4 66.8 15.4 65.2 C8 61 3.6 52.6 2.8 42 Z'
/* 插上后要盖住三个孔，所以背面比"手持那只"稍大一圈 */
const PLUG_BACK_SIZE = { w: 48, h: 74 }
const PLUG_BACK_ANCHOR = { x: 24, y: 34 }

/* 空开闸刀的翻转动画只在"状态真的变了"那一帧挂上，避免新加一只空开时也演一遍 */
const FLIP_SEEN = new Set()
/* 闸刀的"厚度"：同一块件沿 Z 叠 9 层（最前那层是亮面，其余是暗的侧壁色）。
   叠层在平放时完全重合（看不出变化），一旦绕横轴转起来，各层在 y 方向被拉开 => 侧壁露出来，
   所以转到 70° 横杆也不会变成一条细线（件是"实心"的，不是一张纸）。 */
const LEVER_FACE = breakerLeverSVG(false)
const LEVER_SIDE = breakerLeverSVG(true)
const LEVER_SLABS = [-4.8, -3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6, 4.8]
function flipCls(c) {
  if (!FLIP_SEEN.has(c.id)) { FLIP_SEEN.add(c.id); return '' }
  return c.closed ? ' to-closed' : ' to-trip'
}
/* 电源线的出口：从机身右下角横着出来。值是"整机图右边界到卡片右边的距离"
 * （四张图的左右留白不同，按 188/224、152/212、176/146、170/201 的原图比例换算出来的） */
const CORD_OUT = { washer: 37, kettle: 42, riceCooker: 22, heater: 36 }
const PLUG_SNAP_R = 84

/* 空气开关分闸/合闸的"咔哒"一声：现场用 WebAudio 合成，不挂音频文件。
   分闸（跳闸）是脆响 + 往下的金属尾音，合闸稍沉一点 —— NB 的断路器是真会响的。
   浏览器只允许在用户手势里出声，而这个声音正是点击触发的，所以第一次点就有。 */
let clackCtx = null
function breakerClack(on) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!clackCtx) clackCtx = new AC()
    const ac = clackCtx
    if (ac.state === 'suspended') ac.resume()
    const t0 = ac.currentTime + 0.004
    /* ① 触头撞在一起的那一下：14 ms 噪声，带通滤波，合闸亮一点、分闸闷一点 */
    const n = Math.max(24, Math.floor(ac.sampleRate * 0.014))
    const buf = ac.createBuffer(1, n, ac.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2)
    const src = ac.createBufferSource()
    src.buffer = buf
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = on ? 1500 : 900
    bp.Q.value = 1.1
    const g1 = ac.createGain()
    g1.gain.value = on ? 0.5 : 0.34
    src.connect(bp).connect(g1).connect(ac.destination)
    src.start(t0)
    /* ② 手柄到位的"咯"：一段短促下坠的低音 */
    const osc = ac.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(on ? 260 : 190, t0 + 0.008)
    osc.frequency.exponentialRampToValueAtTime(on ? 96 : 74, t0 + 0.06)
    const g2 = ac.createGain()
    g2.gain.setValueAtTime(0.0001, t0 + 0.008)
    g2.gain.exponentialRampToValueAtTime(on ? 0.16 : 0.1, t0 + 0.014)
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075)
    osc.connect(g2).connect(ac.destination)
    osc.start(t0 + 0.008)
    osc.stop(t0 + 0.09)
  } catch {
    /* 静音 / 无音频设备（截图脚本、无头浏览器）直接跳过，不抛错 */
  }
}

/** 插头默认挂在电器的右侧（大小比例照实物：插头壳比机器窄得多，整只落在机器右边外侧） */
function plugHome(c) {
  const t = TYPES[c.type]
  return { x: Math.round(c.x + t.w + 26), y: Math.round(c.y + t.h * 0.56) }
}

/** 松手时：插头离哪个插座孔最近就插哪个，插不上就原样挂着。
 *  三脚插头只认三孔插座 —— 两孔插座没有 E（接地）孔，现实里根本插不进去；
 *  拖到两孔上就停在原地，并由上层弹一句提示（不硬塞，免得插头壳盖着两个孔演戏）。 */
function snapPlug(cs, c) {
  if (!PLUG_TYPES.includes(c.type)) return c
  const pos = c.plugPos || plugHome(c)
  let best = null
  let bestD = PLUG_SNAP_R
  for (const s of cs) {
    const h = SOCKET_HOLE[s.type]
    if (!h || s.id === c.id) continue
    const px = s.x + h.x
    const py = s.y + h.y
    const dist = Math.hypot(pos.x - px, pos.y - py)
    if (dist < bestD) { bestD = dist; best = { s, px, py } }
  }
  if (!best) return { ...c, plugPos: pos, plug: null, plugReject: null }
  /* 三脚插头插不进两孔插座：那个插座没有 E（接地）孔 —— 插头退回电器右侧挂着，
     不留它压在别人插好的孔上（两只插头叠在一起会看成一只）。 */
  if (best.s.type !== 'socket3' && (PLUG_PINS[c.type] || 3) === 3) {
    return { ...c, plugPos: plugHome(c), plug: null, plugReject: best.s.type }
  }
  return { ...c, plugPos: { x: best.px, y: best.py }, plug: best.s.id, plugReject: null }
}

/** 叠放次序：不额外排序 —— 器材按添加顺序绘制，后加的压在上面；插头是独立部件，画在最上层。 */

/** 接线锚点：接线柱帽正下方（导线真正夹持处）；交流电源的三根引线则落在线上 t 处 */
function termAnchor(c, tid, t = 1) {
  if (AC_LEAD[tid] && c.type === 'acSource') return leadAt(c, tid, t)
  const t0 = (TYPES[c.type] && TYPES[c.type].terminals.find((x) => x.id === tid)) || null
  return t0 ? { x: c.x + t0.x, y: c.y + t0.y + TERM_DROP } : null
}

/** 出线方向：接线柱在器材左半 → 向左拔出，右半 → 向右 */
function outOf(c, tid) {
  const t = (TYPES[c.type] && TYPES[c.type].terminals.find((x) => x.id === tid)) || null
  if (!t) return 1
  return t.x < (TYPES[c.type].w || 0) / 2 ? -1 : 1
}

/* ── 交流电源的三根引线（可以拖长，导线也能接在线上任意一点）──
 * 几何在 electricSvgInstruments 的 AC_LEAD 里（渲染与命中同一套数）：
 *   引线从圆右侧圆周引出，线头默认落在 x152；线头位置存在 c.lead[tid] = [x, y]（器材本地坐标）。
 * 拖线头就是把线拉长、拉歪；接在线上任意一点的导线按 t ∈ [0,1] 定位，
 * 线拉长后弧长变了、比例不变，导线还咬在原来的位置上。 */
/** 引线两端（画布坐标） */
function leadPts(c, tid) {
  const b = AC_LEAD[tid]
  if (!b || c.type !== 'acSource') return null
  const end = (c.lead && c.lead[tid]) || [b.ex, b.ey]
  return {
    p0: { x: c.x + b.x0, y: c.y + b.y0 },
    p1: { x: c.x + end[0], y: c.y + end[1] },
    end,
  }
}
/** 引线上 t 处的点（t=0 圆周、t=1 线头） */
function leadAt(c, tid, t) {
  const L = leadPts(c, tid)
  if (!L) return null
  const k = Math.max(0, Math.min(1, t))
  return { x: L.p0.x + (L.p1.x - L.p0.x) * k, y: L.p0.y + (L.p1.y - L.p0.y) * k }
}
/** 画布上某一点离哪根引线最近（用来"接在线上任意一点"）：返回 {cid, tid, t, d} */
function leadHit(comps, p, tol = 15) {
  let best = null
  for (const c of comps) {
    if (c.type !== 'acSource') continue
    for (const tid of ['l', 'n', 'e']) {
      const L = leadPts(c, tid)
      if (!L) continue
      const dx = L.p1.x - L.p0.x
      const dy = L.p1.y - L.p0.y
      const len2 = dx * dx + dy * dy
      if (len2 < 4) continue
      const t = Math.max(0, Math.min(1, ((p.x - L.p0.x) * dx + (p.y - L.p0.y) * dy) / len2))
      const q = { x: L.p0.x + dx * t, y: L.p0.y + dy * t }
      const d = Math.hypot(p.x - q.x, p.y - q.y)
      if (d < tol && (!best || d < best.d)) best = { cid: c.id, tid, t, d }
    }
  }
  return best
}

/** 一根导线的曲线（p1/p2 为柱脚锚点；t1/t2 用于"接在交流电源引线的任意一点"） */
function wireGeom(c1, tid1, c2, tid2, seed, t1 = 1, t2 = 1) {
  const p1 = termAnchor(c1, tid1, t1)
  const p2 = termAnchor(c2, tid2, t2)
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

/* ── 运动层几何（器材内部坐标，与图标 1:1 对位）──
 * 电能表 190×190：转盘窗口就是图标上那条黑圆角矩形（256 坐标 x44..204 / y103..119
 *   → 190 坐标 x33..151、中线 y82），铝盘边沿的刻线从这个窗口里走过去。
 * 洗衣机卡 150×172：机体图放在 x24 y18 w102 h90（188×224 按 meet 收成 75.5×90、
 *   左起 x37.2），washer_body 坐标里观察孔圆心 (80,128)、半径≈38.5 → 卡内 (69.4,69.4)、r≈16.1。
 *   旋转层必须把观察孔整个盖住（r 取 16.1，比孔大 0.6，多出来的那圈压在金属门圈上 —— 门圈是圆的，
 *   跟着转也看不出来），否则孔边会露出一圈不动的原图。 */
/* 洗衣机滚筒：washer_body.png 167×224，在卡里的图框是 x22 y26 w106 h92（meet）
   → 缩放 92/224=0.4107、左右居中后左起 x40.7。
   源图里滚筒（衣物）外接框 x46..121 / y90..166 → 圆心 (83.5,128)、半径≈38
   → 卡内 cx=(40.7+83.5×0.4107)=75.0、cy=(26+128×0.4107)=78.6、r≈15.6（取 16.2 盖住门圈内沿）。 */
const METER_SLOT = { x: 52, y: 75.5, w: 79, h: 11.5 }
const WASHER_DRUM = { cx: 75.0, cy: 78.6, r: 16.2 }
/* 小电动机卡 200×169：图标 256×216 里的黑皮带轮。
   **旋转轴必须压在"6 个镂空孔"的孔心群中心**（孔对称分布，质心即轮心）：实测 5 个孔的孔心
   (45.5,53.5)(45.5,87.5)(103,53.5)(103,87.5)(74.5,37.0)（源坐标，第 6 个被轮毂挡掉），
   对称四孔的中间点 (74.25,70.5) + 顶孔落在 x=74.5 ⇒ 轮心 (74.4,70.5)、孔圈半径 33.5、轮缘半径 67；
   再用"从轮心向外打射线、只看 55<r<80 的最外暗边界"做稳健圆拟合复核：圆心 (74.11,69.36)、r 67.55（被轮座挡住的
   下缘自动落进离群点被剔除）。两法互为独立、差 1.1px 以内 ⇒ 取均值 (74.25,69.9)。
   按 200/256 与 169/216 换算 → 卡内圆心 **(58.0,54.6)**、孔圈 26.2、轮缘 52.8。
   （原来写 (57.8,51.4) 是按"左侧+顶侧轮缘"做最小二乘拟合出来的，被轮缘下半/右侧缺失带偏了 3.2px，
   于是整块圆盘绕着轮心上方 3.2px 的点公转 → 看起来"转心偏左上"。）
   旋转层裁到 r=44：孔的最外沿 r≈34，留足余量；外圈轮缘与皮带保持静止（轮缘本身是圆，不转也看不出来），
   这样压在轮缘上的皮带就不会被带着甩。 */
const MOTOR_PULLEY = { cx: 58.0, cy: 54.6, r: 44 }
/* 转子（N/S 之间那只铜鼓）：轴是**左右方向**，转起来只能看到表面亮暗带上下扫过（轮廓不变）。
   下面这组数是从图标里量的：铜鼓面 x 166..208 / y 142..166（源）→ 卡内 129.7..162.5 / 111.1..129.9，
   正前方那根灰色支架（会挡住转过去的面）x 186.9..196.9 → 卡内 146.0..153.8。 */
const MOTOR_ROTOR = { cx: 146.0, cy: 120.5, rx: 16.4, ry: 9.4, postX0: 146.0, postX1: 153.8 }
/* 三台家电的"工作痕迹"位置（按器材图在卡里的实际落点量出来，卡都是 150×168、图框 x22 y18 w106 h92）：
 * 电热水壶 kettle_body 152×212 → meet 收成 65.96×92、左起 42.0；壶嘴尖在源图 (16,88) → 卡内 (49.0,56.2)；
 * 电饭煲 ricecooker_body 176×146 → 收成 106×87.9、上起 20.0；盖顶排气孔 (88,10) → 卡内 (75,26)，
 *   面板指示灯放在显示屏右侧 (128,50) → 卡内 (99,50)；
 * 电暖器 heater_body 144×201 → 收成 65.9×92、左起 42.05、上起 26；
 *   反射罩三片发热网在源图 x 20..126（w106）、竖向三段 y 37..83 / 87..139 / 144..169
 *   （按"暗于 lum118 且每行>25 px"聚类量的，不是估的）→ 卡内 x 51.2..99.7、
 *   y 42.9..64.0 / 65.8..89.6 / 91.9..103.4。 */
const KETTLE_SPOUT = { x: 45.0, y: 33.0 }
const RICE_VENT = { x: 75, y: 26 }
const RICE_LED = { x: 99, y: 50 }
const HEATER_BANDS = [
  { x0: 51.2, y0: 42.9, w: 48.5, h: 21.1 },
  { x0: 51.2, y0: 65.8, w: 48.5, h: 23.8 },
  { x0: 51.2, y0: 91.9, w: 48.5, h: 11.5 },
]

/**
 * 蒸汽：几缕错相位的汽柱往上飘，越飘越大越淡。
 * 只画白色在暖白底上根本看不出来，所以用灰蓝（#7f8ea3）打底 + 白色小芯提亮，
 * 远看是一团带体积的汽，近看是一层层往上散的小球。
 */
function steamWisps(st, o, { n = 4, rise = 14, r0 = 2.4, r1 = 5.2, drift = 2, speed = 0.6 } = {}, gid) {
  return Array.from({ length: n }, (_, i) => {
    const t = ((st.led * speed + i / n) % 1)
    const y = o.y - 1 - t * rise
    const x = o.x + Math.sin((t + i * 0.3) * 5.2) * drift * t
    const r = r0 + t * (r1 - r0)
    const op = Math.min(1, t * 3.2) * (1 - t)
    return (
      <g key={'w' + i} opacity={(op * 0.95).toFixed(3)}>
        {/* 软边雾团（径向渐变，边缘化开，才不会像一颗颗小圆点） */}
        <circle cx={x} cy={y} r={r} fill={`url(#${gid})`} />
        <circle cx={x - 0.4} cy={y - 0.5} r={r * 0.34} fill="#ffffff" opacity=".55" />
      </g>
    )
  })
}

/**
 * 运动层：转动的铝盘 / 在洗的滚筒 / 工作中的家电 / 小电动机。
 *
 * 为什么不把动画写进器材的 SVG 字符串：器材层是每 250 ms 用 dangerouslySetInnerHTML
 * 重画的字符串（电能表每 tick 还要换计数器数字），字符串里挂 CSS 动画会被反复重建成
 * 起始帧 —— 看起来就是"抖一下 / 冻住"。所以"会动的东西"单独放在这一层，自己跑 rAF，
 * 只重渲染自己，与整场景重渲染解耦（和 ElectronFlow 同一套做法）。
 */
function MotionLayer({ items }) {
  const [, setTick] = useState(0)
  const phRef = useRef(new Map())
  const itemsRef = useRef(items)
  itemsRef.current = items
  const live = items.length > 0
  useEffect(() => {
    if (!live) return undefined
    let raf = 0
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.12, Math.max(0, (now - last) / 1000))
      last = now
      for (const it of itemsRef.current) {
        const st = phRef.current.get(it.id) || { u: 0, a: 0, led: 0 }
        if (it.kind === 'meter') st.u = (st.u + dt * it.v) % 1
        else st.a += dt * it.v
        st.led += dt
        phRef.current.set(it.id, st)
      }
      setTick((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [live])

  return (
    <svg className="esb-motionlayer" width={CW} height={CH}>
      {items.map((it) => {
        const st = phRef.current.get(it.id) || { u: 0, a: 0, led: 0 }
        /* 电能表：铝盘窗口里扫过一道镜面高光 = 铝盘在转（窗口是图标那条黑圆角矩形，
           位置按 256 坐标量出：x70..176 / y103..119 → 190 坐标 x52..131、y76..88），
           速度 ∝ 表电流（= 全屋总功率），所以"功率大的用电器，表转得更快"是看得见的。 */
        if (it.kind === 'meter') {
          const S = METER_SLOT
          /* 高光：铝盘是抛光的铝片，隔着窄窗口看到的其实就是"盘沿上一处镜面反光在扫"。
             所以这里不摆彩色刻线，也不铺通高的白带（那会像窗口里插了块挡板），只在
             图标本来就画好的那条银色盘沿上放一团柔光斑 + 一小段亮芯，让它随铝盘横着
             走过去；第二团淡一些、落后半个周期，像同一圈盘沿上另一处反光。 */
          const gid = `esbm-gl-${it.id}`
          const cid = `esbm-slot-${it.id}`
          /* 图标里那条亮银盘沿线，量出来在窗口上沿下 7px（256 坐标 y≈110 → 190 坐标 y≈82.5） */
          const ly = S.y + 7.0
          const gx1 = S.x - 18 + (st.u % 1) * (S.w + 36)
          const gx2 = S.x - 6 + ((st.u + 0.5) % 1) * (S.w + 12)
          return (
            <g key={it.id} transform={`translate(${it.x},${it.y})`}>
              <defs>
                <radialGradient id={gid} cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.82" />
                  <stop offset="45%" stopColor="#ffffff" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                <clipPath id={cid}>
                  <rect x={S.x} y={S.y} width={S.w} height={S.h} rx="4" />
                </clipPath>
              </defs>
              <g clipPath={`url(#${cid})`}>
                {/* 盘沿上的柔光斑（横向拉长、压在银线上，才像打在圆弧上的反光） */}
                <ellipse cx={gx1} cy={ly} rx="10" ry="4.4" fill={`url(#${gid})`} />
                <ellipse cx={gx2} cy={ly} rx="7" ry="3.2" fill={`url(#${gid})`} opacity="0.4" />
                {/* 最亮的那一小段芯：贴在线上的白色高光点 */}
                <ellipse cx={gx1} cy={ly} rx="5.6" ry="1.4" fill="#ffffff" opacity="0.74" />
                <ellipse cx={gx2} cy={ly} rx="3.2" ry="1" fill="#ffffff" opacity="0.26" />
              </g>
            </g>
          )
        }
        /* 洗衣机：整个滚筒（衣物 + 玻璃）绕筒心转 —— 就是把实拍图标里那一圈再画一遍、
           转起来后裁在圆窗里，看起来就是"衣服在筒里翻"；再加两片水光、跑动的泡沫和
           底座指示灯。断电就不画，动都不动。 */
        if (it.kind === 'washer') {
          const D = WASHER_DRUM
          const a = st.a
          const deg = (a * 180) / Math.PI
          const halo = [0, Math.PI].map((o, i) => {
            const r = D.r - 2.2
            const a0 = a + o
            const x0 = D.cx + Math.cos(a0) * r
            const y0 = D.cy + Math.sin(a0) * r
            const x1 = D.cx + Math.cos(a0 + 0.55) * r
            const y1 = D.cy + Math.sin(a0 + 0.55) * r
            return <path key={'hl' + i}
              d={`M ${D.cx} ${D.cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`}
              fill="rgba(236,245,255,.42)" />
          })
          const bubbles = Array.from({ length: 5 }, (_, i) => {
            const th = a * 1.6 + (i * Math.PI * 2) / 5
            const rr = 5.0 + (i % 3) * 3.0
            const x = D.cx + Math.cos(th) * rr
            const yy = D.cy + Math.sin(th) * rr * 0.58
            return <circle key={'bb' + i} cx={x} cy={yy} r={0.8 + (i % 2) * 0.5}
              fill="rgba(248,250,252,.66)" />
          })
          const led = 0.28 + 0.42 * (0.5 + 0.5 * Math.sin(st.led * 6.4))
          return (
            <g key={it.id} transform={`translate(${it.x},${it.y})`}>
              <defs>
                <clipPath id={`esbm-drum-${it.id}`}>
                  <circle cx={D.cx} cy={D.cy} r={D.r - 0.3} />
                </clipPath>
              </defs>
              <g clipPath={`url(#esbm-drum-${it.id})`}>
                <image href={figURL('washer_body.png')} x="22" y="26" width="106" height="92"
                  preserveAspectRatio="xMidYMid meet"
                  transform={`rotate(${deg.toFixed(1)} ${D.cx} ${D.cy})`} />
                {halo}
                {bubbles}
              </g>
              <circle cx="100" cy="112.5" r="2.4" fill="#f87171" opacity={led} />
              {/* 底座正中一个小转盘图标（三点转子）：远处也能一眼看出"在工作" */}
              {[0, 1, 2].map((i) => {
                const th = a * 1.4 + (i * Math.PI * 2) / 3
                const x = 75 + Math.cos(th) * 2.8
                const yy = 112.5 + Math.sin(th) * 1.8
                return <circle key={'sp' + i} cx={x} cy={yy} r={1.15}
                  fill="#b91c1c" opacity={0.9 - i * 0.22} />
              })}
            </g>
          )
        }
        /* 小电动机：实拍图标里那只黑色皮带轮（6 个圆孔 + 中心螺帽）真转起来。
           只把轮盘裁成圆、绕轮心旋转；皮带、磁极、底座都不动（所以裁到 r=44，避开皮带）。
           转速 ∝ 电流；接线柱 1、2 接反 → dir=-1 → 反转。 */
        if (it.kind === 'motor') {
          const M = MOTOR_PULLEY
          /* 转向口径（2026-11-19 用户确认）：从纸面外往里看（视线基本沿电机轴），转子在**纸面内逆时针**转。
             SVG 里 rotate(+deg) 是顺时针，所以统一取负号：dir=+1（接线柱 a→b 的那个电流方向）→ 逆时针；
             把两根接线柱换过来（dir=-1）→ 顺时针。皮带是开口传动、两轴同向，所以大皮带轮用同一个符号。 */
          const spin = -st.a * it.dir
          const deg = (spin * 180) / Math.PI
          const cid = `esbm-pul-${it.id}`
          /* 转子（N/S 之间那只铜鼓）：视线几乎沿轴，转起来是"盘面绕圆心转"，不是"柱面上下滚"。
             所以画 3 道软边的"线圈边"（亮铜 ×1 / 暗铜 ×2）绕圆心逆时针扫；椭圆透视不额外压，
             直接用盘面上各向等速的角位置（rx/ry 分别取分量），转到正前方的支架、金环、黑电刷后面会被挡住。
             皮带传动：转子上小轮带大轮，所以转子比大轮快（×2.4）。 */
          const R = MOTOR_ROTOR
          const rPhase = spin * 2.4
          const rid = `esbm-rot-${it.id}`
          const rgid = `esbm-rotg-${it.id}`
          const lgid = `esbm-rotl-${it.id}`
          const marks = []
          for (let k = 0; k < 3; k++) {
            const a = rPhase + (k * 2 * Math.PI) / 3
            const p0 = [R.cx + R.rx * Math.cos(a) * 0.34, R.cy + R.ry * Math.sin(a) * 0.34]
            const p1 = [R.cx + R.rx * Math.cos(a) * 0.99, R.cy + R.ry * Math.sin(a) * 0.99]
            marks.push(
              <line key={'rm' + k}
                x1={p0[0].toFixed(2)} y1={p0[1].toFixed(2)}
                x2={p1[0].toFixed(2)} y2={p1[1].toFixed(2)}
                stroke={`url(#${k === 0 ? lgid : rgid})`}
                strokeWidth={k === 0 ? 3.0 : 2.6}
                strokeLinecap="round"
                opacity={k === 0 ? 0.6 : 0.42} />,
            )
          }
          return (
            <g key={it.id} transform={`translate(${it.x},${it.y})`} opacity={it.dim ? 0.22 : 1}>
              <defs>
                <clipPath id={cid}>
                  <circle cx={M.cx} cy={M.cy} r={M.r} />
                </clipPath>
                <mask id={rid} maskUnits="userSpaceOnUse" x="120" y="100" width="60" height="45">
                  <ellipse cx={R.cx} cy={R.cy} rx={R.rx - 0.6} ry={R.ry - 0.4} fill="#fff" />
                  <rect x={R.postX0} y="100" width={R.postX1 - R.postX0} height="45" fill="#000" />
                  {/* 正前方金色环（压在鼓面的前下方）与顶上那块黑电刷，都得挡住转过去的线圈边 */}
                  <circle cx="147.4" cy="126.2" r="7.4" fill="#000" />
                  <rect x="140.2" y="100" width="12.6" height="13.6" fill="#000" />
                </mask>
                <linearGradient id={rgid} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#5a3208" stopOpacity="0" />
                  <stop offset="50%" stopColor="#46260a" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#5a3208" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={lgid} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ffe2b8" stopOpacity="0" />
                  <stop offset="50%" stopColor="#fff0d4" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#ffe2b8" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g clipPath={`url(#${cid})`}>
                {/* 图标里的 6 个孔都是"真镂空"(alpha=0)，卡片的孔亮是因为露出白底；
                    这里先垫一层白圆，转过去的孔才始终是白的，否则只会透出底下静止的旧孔。
                    ★ 但孔背后不是到处都白：轮子后面立着黑色支撑柱（柱子在图标里 x60..88 源、卡内 x46.9..68.8，
                    一直顶到轮轴）。所以白圆上再压一条黑柱，孔转到柱子前面时看到黑柱、转到别处看到白底 ——
                    跟实拍一致（原来那只孔在照片里被烤成实心黑，转过去也一直是黑的，见 scripts/_bake_motor_hole.py）。 */}
                <circle cx={M.cx} cy={M.cy} r={M.r - 1} fill="#ffffff" />
                <path d="M50.2 58.2 L65.8 58.2 L68.8 106 L46.9 106 Z" fill="#191a1f" />
                <image href={figURL('motor_c.png')} x="0" y="0" width="200" height="169"
                  preserveAspectRatio="none"
                  transform={`rotate(${deg.toFixed(1)} ${M.cx} ${M.cy})`} />
              </g>
              <g mask={`url(#${rid})`}>{marks}</g>
            </g>
          )
        }
        /* 电热水壶：壶嘴冒汽 —— 三缕汽柱错相位往上飘，越飘越大越淡（汽是白的，用灰蓝衬一层才在暖底上看得见）。
           不做"水在壶里翻滚"：实拍壶身是不透明的，只能看见壶嘴出来的这一股汽。 */
        if (it.kind === 'kettle') {
          const o = KETTLE_SPOUT
          const led = 0.5 + 0.5 * Math.sin(st.led * 3.1)
          const sgid = `esbm-steamk-${it.id}`
          return (
            <g key={it.id} transform={`translate(${it.x},${it.y})`}>
              <defs>
                <radialGradient id={sgid} cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0%" stopColor="#77879c" stopOpacity="0.72" />
                  <stop offset="48%" stopColor="#8b99aa" stopOpacity="0.36" />
                  <stop offset="100%" stopColor="#9aa7b8" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* 壶底电源灯：压在黑色底座上（不能飘到机身外面去） */}
              <circle cx="95" cy="101" r="4.2" fill="#ef4444" opacity={0.18 + led * 0.18} />
              <circle cx="95" cy="101" r="1.6" fill="#fca5a5" opacity={0.8 + led * 0.2} />
              {steamWisps(st, o, { rise: 16, n: 5, r0: 2.6, r1: 5.4, drift: 1.8, speed: 0.6 }, sgid)}
            </g>
          )
        }
        /* 电饭煲：盖上排气孔冒一点汽 + 面板加热指示灯呼吸。
           汽只升 14 px（再高就压到卡片标题条上了），指示灯画在显示屏右侧那一格。 */
        if (it.kind === 'riceCooker') {
          const o = RICE_VENT
          const led = 0.5 + 0.5 * Math.sin(st.led * 3.2)
          const sgid = `esbm-steamr-${it.id}`
          return (
            <g key={it.id} transform={`translate(${it.x},${it.y})`}>
              <defs>
                <radialGradient id={sgid} cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0%" stopColor="#77879c" stopOpacity="0.5" />
                  <stop offset="48%" stopColor="#8b99aa" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#9aa7b8" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* 汽只升 8 px（再高就压到卡片标题条上了） */}
              {steamWisps(st, o, { rise: 8, n: 3, r0: 2.4, r1: 4.4, drift: 1.4, speed: 0.5 }, sgid)}
              {/* 加热指示灯：橙色，呼吸范围给足，缩到 600× 时也能看出"在保温/在煮" */}
              <circle cx={RICE_LED.x} cy={RICE_LED.y} r="5.4" fill="#f59e0b" opacity={0.14 + led * 0.2} />
              <circle cx={RICE_LED.x} cy={RICE_LED.y} r="2.0" fill="#fdba74" opacity={0.55 + led * 0.45} />
            </g>
          )
        }
        /* 电暖器：三片发热网透出橙红光 —— 亮度带一点双频闪烁（像电阻丝在抖），
           中间最亮、上下两端淡出，才像"从网眼里透出来的热"，不是贴了一块橙色板。 */
        if (it.kind === 'heater') {
          const gid = `esbm-heatg-${it.id}`
          const flick = 0.5 + 0.22 * Math.sin(st.led * 6.6) + 0.12 * Math.sin(st.led * 17.3)
          return (
            <g key={it.id} transform={`translate(${it.x},${it.y})`}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb923c" stopOpacity="0" />
                  <stop offset="46%" stopColor="#f97316" stopOpacity=".9" />
                  <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
                </linearGradient>
              </defs>
              {HEATER_BANDS.map((b, i) => (
                <g key={'hb' + i}>
                  <rect x={b.x0} y={b.y0} width={b.w} height={b.h} rx="2.6"
                    fill={`url(#${gid})`} opacity={Math.max(0.16, flick - i * 0.05).toFixed(3)} />
                  <ellipse cx={b.x0 + b.w / 2} cy={b.y0 + b.h / 2} rx={b.w / 2 - 4} ry={b.h / 2 - 1.6}
                    fill="#ff7a2f" opacity={(0.12 + 0.16 * flick).toFixed(3)} />
                </g>
              ))}
            </g>
          )
        }
        return null
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
  const [plugHint, setPlugHint] = useState(null)
  const plugHintTimer = useRef(0)
  const [dissect, setDissect] = useState(false)   // 一键透视：外壳半透明、露出 .inner 内部结构
  /* 电能表走字倍速：真实时间里 100 W 点一小时才 1 度电，肉眼看不到转盘与计数器在动；
   * 1× 用来说明"真表就是走得很慢"，60× / 600× 才能把 W = Pt 演出来。 */
  const [meterSpeed, setMeterSpeed] = useState(1)
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
  /* 焦耳定律演示器的热量累积（每件器材各一份 qA/qB，单位 J）：引擎只给瞬时功率，
   * 热量必须按时间积分 —— 这正是本实验要演示的 Q = P·t。 */
  const heatRef = useRef(new Map())
  /* 电能表的电功累积（kWh）：引擎只给瞬时电流，W = ∫U·I·dt 只能由前端积分。
   * 计数器读数、铝盘转速、记录表都取自这里（机械表本来就只"看见"电流）。 */
  const kwhRef = useRef(new Map())
  const meterSpeedRef = useRef(1)
  meterSpeedRef.current = meterSpeed
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
    const cy = Math.max(0, Math.min(CH - t.h, Math.round(y)))
    const c = {
      id: uidRef.current++, type,
      x: Math.max(0, Math.min(CW - t.w, Math.round(x))),
      y: cy,
      /* 空气开关 / 面板开关默认合闸（刚拿下来时是"亮的、正常合着"的样子），其余开关默认断开 */
      closed: type === 'breaker' || type === 'wallSwitch', showRead: false, f: 0.4, rmax: CFG.RHEO_MAX,
      /* 家电自带一只插头，默认挂在机器右侧（拖它到插座上就插进去） */
      plugPos: PLUG_TYPES.includes(type)
        ? plugHome({ x: Math.max(0, Math.min(CW - t.w, Math.round(x))), y: cy, type })
        : undefined,
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
      /* aT / bT：导线端接在交流电源引线上的位置（0 = 圆周，1 = 线头）；别的柱子都是 1，不用存 */
      const extra = {}
      if (ta.t != null && ta.t < 0.999) extra.aT = ta.t
      if (tb.t != null && tb.t < 0.999) extra.bT = tb.t
      return ws.concat({ id: uidRef.current++, a, b, color: color || wireColor, ...extra })
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
      const tw = t ? t.w : 150
      const th = t ? t.h : 150
      /* 统一 300×300 的网格来找空位：原来按"这一件自己的宽高"算列数，
       * 交流电源（150）与三孔插座（104）算出的列宽不同，落点就会叠在已有器材上。
       * 现在逐格试放，取第一个与已有器材不重叠的格子。 */
      const gw = Math.max(1, Math.floor(visW / 300))
      const gh = Math.max(1, Math.floor(visH / 300))
      const cw2 = visW / gw
      const ch2 = visH / gh
      const hit = (x, y) => cs.some((c) => {
        const ct = TYPES[c.type] || { w: 150, h: 150 }
        return !(x + tw + 22 < c.x || c.x + ct.w + 22 < x || y + th + 22 < c.y || c.y + ct.h + 22 < y)
      })
      let px = null
      let py = null
      for (let i = 0; i < gw * gh; i++) {
        const cx = (i % gw) * cw2 + (cw2 - tw) / 2
        const cy = Math.floor(i / gw) * ch2 + (ch2 - th) / 2
        if (!hit(cx, cy)) { px = cx; py = cy; break }
      }
      if (px === null) {
        const slot = n % Math.max(1, cols * rows)
        const cw = visW / cols
        const chh = visH / rows
        px = (slot % cols) * cw + (cw - tw) / 2
        py = Math.floor(slot / cols) * chh + (chh - th) / 2
      }
      addComp(type, px, py)
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
      heatRef.current.clear()
      kwhRef.current.clear()
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

  /* 待接线时松手就落在交流电源的引线上（任意一点）= 接在那儿。
     用挂在 window 上的独立 up 监听，而不是 onTermDown 里那只 up —— 那只 up 是"按下那一刻"的闭包，
     里面的 pending 还是 null，等到松手时根本看不到刚起的那根线。 */
  useEffect(() => {
    if (!pending) return undefined
    const up = (e) => {
      const hit = leadHit(compsRef.current, canvasPoint(e))
      if (!hit) return
      if (hit.cid === pending.cid && hit.tid === pending.tid) return
      addWire(pending, { cid: hit.cid, tid: hit.tid, t: hit.t })
      setPending(null)
      stopPreview()
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [pending, addWire])

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
    /* 交流电源的线头：按下去拖 = 把引线拉长（真拖动了就取消这次"待接线"）；
       只是点一下（没拖动）= 照旧从线头起一根线。 */
    if (AC_LEAD[tid] && c.type === 'acSource') {
      dragRef.current = { kind: 'lead', compId: c.id, tid, sx: e.clientX, sy: e.clientY, moved: false }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /* ── 元件本体按下：拖动 / 滑片 / 开关 ── */
  const onCompDown = (e, c) => {
    if (e.target.closest('.esb-term')) return
    /* 抓起的器件提到最上层：插上电器后电器压住插座面板，看起来才是"机器在前、插脚插进去" */
    setComps((cs) => {
      if (cs.length < 2 || cs[cs.length - 1].id === c.id) return cs
      return [...cs.filter((x) => x.id !== c.id), c]
    })
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

  /* ── 插头按下：只拖这一只插头（电源线跟着拉长，任意方向） ── */
  const onPlugDown = (e, c) => {
    e.stopPropagation()
    e.preventDefault()
    const p = canvasPoint(e)
    const pos = c.plugPos || plugHome(c)
    dragRef.current = {
      kind: 'plugmove', compId: c.id,
      grab: { dx: p.x - pos.x, dy: p.y - pos.y },
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
        const nx = Math.max(-10, Math.min(CW - t.w + 10, p.x - d.grab.dx))
        const ny = Math.max(-10, Math.min(CH - t.h + 10, p.y - d.grab.dy))
        /* 没插上的插头跟着机器一起走（插头是独立部件，位置存的是画布坐标） */
        const pp = (!c.plug && c.plugPos) ? { x: c.plugPos.x + (nx - c.x), y: c.plugPos.y + (ny - c.y) } : c.plugPos
        return { ...c, x: nx, y: ny, plugPos: pp }
      }))
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true
      return
    }
    if (d && d.kind === 'plugmove') {
      const p = canvasPoint(e)
      setComps((cs) => cs.map((c) => {
        if (c.id !== d.compId) return c
        return {
          ...c,
          plug: null,
          plugPos: { x: Math.round(p.x - d.grab.dx), y: Math.round(p.y - d.grab.dy) },
        }
      }))
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
    /* 拖交流电源的线头：把引线拉长、拉歪（端点存进 comp.lead，导线接在线上任意一点时按比例跟着走） */
    if (d && d.kind === 'lead') {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true
      if (!d.moved) return
      const p = canvasPoint(e)
      setComps((cs) => cs.map((c) => {
        if (c.id !== d.compId) return c
        const ex = Math.max(2, Math.min(198, Math.round(p.x - c.x)))
        const ey = Math.max(4, Math.min(164, Math.round(p.y - c.y)))
        return { ...c, lead: { ...(c.lead || {}), [d.tid]: [ex, ey] } }
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

  const tapComp = useCallback((c, isDouble, ev) => {
    if (!c) return
    if (c.type === 'switch' || c.type === 'wallSwitch' || c.type === 'breaker') {
      /* 断路器拉闸（跳闸）要有声 —— 这一下"咔哒"是学生判断"真的断了"的听觉线索 */
      if (c.type === 'breaker') breakerClack(!c.closed)
      setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, closed: !x.closed } : x)))
    } else if (c.type === 'electromagnet' && ev && ev.shiftKey) {
      // Shift + 单击电磁铁：匝数 +1（5 → 20 循环），线圈会一圈一圈重新画（优先于双击，避免连点被当成双击）
      setComps((cs) => cs.map((x) => {
        if (x.id !== c.id) return x
        const t0 = Math.max(3, Math.round(Number(x.turns) || 10))
        return { ...x, turns: t0 >= 20 ? 5 : t0 + 1 }
      }))
    } else if (c.type === 'electromagnet' && isDouble) {
      // 双击电磁铁：插 / 抽软铁芯（磁性强弱对比实验的关键一步）
      setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, core: x.core === false } : x)))
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
        tapComp(c, isDouble, e)
        return
      }
      /* 拖完松手：电器就是电器，不再靠"整机盖到插座上"接线（用户要求：放好后只拖插头） */
      return
    }
    if (d && d.kind === 'plugmove') {
      /* 松手：插头离哪个插座孔最近就插进去，否则就挂在电器的右后方。
         三脚插头碰到两孔插座 → 停在原地，弹一句提示（E 脚没有孔位）。 */
      const cur = compsRef.current.find((x) => x.id === d.compId)
      if (!cur) return
      const next = snapPlug(compsRef.current, cur)
      if (next.plugReject) {
        setPlugHint('⚠ 三脚插头插不进两孔插座：E（接地）脚没有孔位，请换三孔插座')
        clearTimeout(plugHintTimer.current)
        plugHintTimer.current = setTimeout(() => setPlugHint(null), 2800)
      } else {
        setPlugHint(null)
      }
      setComps((cs) => cs.map((x) => (x.id === d.compId ? next : x)))
      return
    }
    if (d && d.kind === 'slider') forceUpdate((n) => n + 1)
    /* 交流电源线头：拖过就把这次"待接线"取消（刚那次按下只是拉线，不是要接线） */
    if (d && d.kind === 'lead') {
      if (d.moved) { setPending(null); stopPreview() }
      return
    }
    /* 待接线时松手：若落点就在交流电源的某根引线上（任意一点），就接在那儿，
       不用非要把线端对到线头那个小圆点上。 */
    if (pending) {
      const hit = leadHit(compsRef.current, canvasPoint(e))
      if (hit && !(hit.cid === pending.cid && hit.tid === pending.tid)) {
        addWire(pending, { cid: hit.cid, tid: hit.tid, t: hit.t })
        setPending(null); stopPreview()
      }
    }
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

  /* ── 焦耳定律演示器：按 Q = P·t 累积热量（250ms 一步，温度真变了才重画）── */
  useEffect(() => {
    const id = setInterval(() => {
      const cs = compsRef.current || []
      const sets = cs.filter((c) => c.type === 'jouleSet')
      const ms = cs.filter((c) => c.type === 'energyMeter')
      if (!sets.length && !ms.length) return
      const sv = solvedRef.current || {}
      const CV = 0.15                       // J/℃：与 Tab1 同一标度
      const QMAX = (95 - 20) * CV           // 11.25 J：上限，再高就"沸腾"了
      const dt = 0.25
      let dirty = false
      for (const c of sets) {
        const o = sv[c.id] || {}
        const h = heatRef.current.get(c.id) || { qA: 0, qB: 0 }
        const a0 = h.qA, b0 = h.qB
        // 发热 P·dt + 比例散热（时间常数约 40 s：断开后温度计慢慢回落到室温）
        h.qA = Math.min(QMAX, Math.max(0, h.qA + (o._P_A || 0) * dt - h.qA * 0.025 * dt))
        h.qB = Math.min(QMAX, Math.max(0, h.qB + (o._P_B || 0) * dt - h.qB * 0.025 * dt))
        heatRef.current.set(c.id, h)
        if (Math.abs(h.qA - a0) > 0.008 || Math.abs(h.qB - b0) > 0.008) dirty = true
      }
      /* 电能表：W = U_电源 · I · dt（表本身量不出功率，只能"看见"相线电流，
         电压取所在电路的电源口径 —— 市电 220 V / 蓄电池 / 电池组）。 */
      for (const c of ms) {
        const o = sv[c.id] || {}
        const I = Math.abs(o._I || 0)
        const srcV = cs.some((x) => x.type === 'mains') ? CFG.MAINS_V
          : cs.some((x) => x.type === 'accumulator') ? CFG.ACC_V
            : cs.some((x) => x.type === 'battery') ? CFG.VS.V : 0
        const sp = meterSpeedRef.current || 1
        const h = kwhRef.current.get(c.id) || { kwh: 0 }
        const k0 = h.kwh
        h.kwh = k0 + (srcV * I / 1000) * (dt * sp / 3600)   // kW · h（sp = 走字倍速）
        kwhRef.current.set(c.id, h)
        if (Math.abs(h.kwh - k0) > 1e-9) dirty = true
      }
      if (dirty) forceUpdate((n) => n + 1)
    }, 250)
    return () => clearInterval(id)
  }, [])

  /* ── 求解结果 → 器材动态状态 ── */
  const dynOf = (c) => {
    const o = solved[c.id] || {}
    if (c.type === 'jouleSet') {
      const h = heatRef.current.get(c.id) || { qA: 0, qB: 0 }
      const CV = 0.15 // J/℃（与 Tab1 演示同一标度：两瓶等质量煤油，ΔT ∝ Q）
      return { tempA: 20 + h.qA / CV, tempB: 20 + h.qB / CV }
    }
    if (c.type === 'electromagnet') {
      return { I: o._I || 0, pins: o._pins || 0, strength: o._strength || 0, nside: o._Nside || 0 }
    }
    if (c.type === 'ostersBoard') {
      return { I: o._I || 0, sign: o._sign || 0, bmag: o._bmag || 0 }
    }
    if (PLUG_TYPES.includes(c.type)) return { I: Math.abs(o._I || 0), P: o._P || 0, R: o._R || 0 }
    if (c.type === 'energyMeter') {
      const h = kwhRef.current.get(c.id) || { kwh: 0 }
      return { kwh: h.kwh || 0, I: Math.abs(o._I || 0) }
    }
    // 小电动机：I 决定转速，dir 决定转向（接线柱 1、2 接反 → 反转）
    if (c.type === 'motor') {
      const raw = o._Iraw || 0
      return { I: Math.abs(o._I || 0), dir: raw < -1e-6 ? -1 : 1 }
    }
    // 灵敏电流计：中央零点，带符号（正偏 / 反偏），满偏 0.15 A
    if (c.type === 'galvanometer') return { frac: (o._I || 0) / (o._fs || CFG.GALV_FS) }
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
    if (c.type === 'galvanometer') {
      const I = o._I || 0
      return {
        text: I > 1e-6 ? `I = ${(I * 1000).toFixed(0)} mA → 右偏`
          : I < -1e-6 ? `I = ${(I * 1000).toFixed(0)} mA ← 左偏`
            : '指针居中 · 无电流',
        color: Math.abs(I) > (o._fs || CFG.GALV_FS) ? '#fb7185' : I !== 0 ? '#4ade80' : '#94a3b8',
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
    if (c.type === 'energyMeter') {
      const h = kwhRef.current.get(c.id) || { kwh: 0 }
      const I = Math.abs(o._I || 0)
      const coils = [...wiresRef.current].filter((w) => w.a.startsWith(c.id + ':') || w.b.startsWith(c.id + ':'))
      const wired1 = coils.some((w) => w.a === c.id + ':i1' || w.b === c.id + ':i1')
      const wired3 = coils.some((w) => w.a === c.id + ':o1' || w.b === c.id + ':o1')
      if (!wired1 || !wired3) {
        return { text: '进线 1 / 出线 3 未接全（表的电流线圈在 1-3 之间）', color: '#fbbf24' }
      }
      return {
        text: I > 1e-3
          ? `W = ${h.kwh.toFixed(4)} kW·h · I = ${I.toFixed(3)} A`
          : '无电流 · 铝盘停转',
        color: I > 1e-3 ? '#4ade80' : '#94a3b8',
      }
    }
    return null
  }

  /* ── 电路状态摘要（通路 / 断路 / 短路 / 误接）── */
  const status = useMemo(() => {
    // 电源四种都要认：电池组 / 蓄电池 / 市电三孔插座 / 交流电源符号 —— 家庭电路那一套只接交流电源，不能因为"没电池"就报未开始
    const src = comps.find((c) => c.type === 'battery' || c.type === 'accumulator'
      || c.type === 'mains' || c.type === 'acSource')
    const bulbs = comps.filter((c) => c.type === 'bulb')
    const d = solved.diagnostics || {}
    if (!src) return { tone: 'warn', text: '从右侧拖入电源和用电器，开始搭电路' }
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
    const batI = Math.abs(solved[src.id]?._I || 0)
    if (batI > 1e-4) {
      const lit = bulbs.filter((b) => (solved[b.id]?._P || 0) > 0.001)
      if (lit.length) return { tone: 'ok', text: `✅ 通路 · ${lit.length} 只灯泡发光` }
      const loads = comps.filter((c) => PLUG_TYPES.includes(c.type)
        && Math.abs(solved[c.id]?._I || 0) > 0.005)
      if (loads.length) {
        // 功率取引擎算出来的实际值（不是额定）：两台串在一条线上时会掉到 500 W 左右，学生一眼看出接错了
        const total = Math.round(loads.reduce((s, c) => s + (solved[c.id]?._P || 0), 0))
        const names = loads.map((c) => ({ washer: '洗衣机', kettle: '电热水壶', riceCooker: '电饭煲', heater: '电暖器' }[c.type] || '电器')).join(' + ')
        // 每台的端电压 = I·R；都接近 220 V 才是"并联在 220 V 两端"
        const Us = loads.map((c) => Math.abs(solved[c.id]?._I || 0) * (solved[c.id]?._R || 0))
        const par = Us.every((u) => u > 200)
        if (!par) {
          return {
            tone: 'warn',
            text: `⚠ ${names} 串在同一条支路上了：家用电器应并联在 220 V 两端（现在每台只分到 ${Math.round(Us[0])} V，总功率 ${total} W）`,
          }
        }
        const head = loads.length > 1 ? `${names} 并联在 220 V 两端，合计 ${total} W` : `${names} 并联在 220 V 两端 · ${total} W`
        const plugging = loads.filter((c) => c.plug).length
        return { tone: 'ok', text: `✅ 交流 220 V 接通 · ${head}${plugging ? `（${plugging} 台插在插座上）` : ''} · 电能表串在干路走字` }
      }
      return { tone: 'ok', text: '✅ 电路接通' }
    }
    const opened = comps.find((c) => (c.type === 'switch' || c.type === 'wallSwitch' || c.type === 'breaker') && !c.closed)
    if (opened) return { tone: 'warn', text: '⚠ 开关断开 · 电路不通' }
    return { tone: 'warn', text: '电路未接通（回路不完整或断路）' }
  }, [comps, solved])

  const compById = (id) => comps.find((c) => c.id === id)

  /* 家电（也就是"有插头"的那几件）：插头层按这个列表画 */
  const plugs = comps.filter((c) => PLUG_TYPES.includes(c.type))

  /* 有电流的导线 → 电子流动层的数据。
     电子行进方向 = -sign(_wireI)（_wireI 以 a→b 为正 = 电流方向，电子反向） */
  const flowItems = (() => {    const wI = solved._wireI || {}
    const out = []
    for (const w of wires) {
      const I = wI[w.id]
      if (!I || Math.abs(I) < 5e-4) continue
      const c1 = compById(+w.a.split(':')[0])
      const c2 = compById(+w.b.split(':')[0])
      if (!c1 || !c2) continue
      const g = wireGeom(c1, w.a.split(':')[1], c2, w.b.split(':')[1], w.id * 977 + 13, w.aT ?? 1, w.bT ?? 1)
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

  /* 运动层数据：通电后才"看得出来在动"的两类器材。
     转速一律 ∝ 功率（洗衣机 500 W 明显比电热水壶 1500 W 慢、两台都开又更快），
     走字倍速只给一点观感加成并封顶，免得 600× 时糊成一片、反而看不出在转。 */
  const motionItems = (() => {
    const out = []
    const spBoost = meterSpeed >= 600 ? 1.8 : meterSpeed >= 60 ? 1.35 : 1
    for (const c of comps) {
      const o = solved[c.id] || {}
      const I = Math.abs(o._I || 0)
      const P = Math.abs(o._P || 0)
      if (c.type === 'energyMeter' && I > 0.004) {
        // 单位：窗口行程 / 秒。表电流 9 A（1980 W）→ 约 0.95 趟每秒；1.5 kW 单壶 ≈0.8；500 W 单机 ≈0.24
        out.push({ id: c.id, kind: 'meter', x: c.x, y: c.y, v: (0.05 + 0.85 * Math.min(1.4, I / 9.0)) * spBoost })
      } else if (c.type === 'washer' && P > 0.5) {
        // 单位：rad / 秒；500 W 约 0.5 转每秒（真实滚筒洗程本来就这么慢）
        out.push({ id: c.id, kind: 'washer', x: c.x, y: c.y, v: 2.0 + 2.4 * P / 2000 })
      } else if ((c.type === 'kettle' || c.type === 'riceCooker' || c.type === 'heater') && P > 0.5) {
        /* 这三台只按"绝对时间"演进（汽往上飘、指示灯呼吸、电阻丝闪），不用转速，
           所以 v 给 0 —— st.led 每帧照加，动画照样跑；断电（P=0）就整条不画。 */
        out.push({ id: c.id, kind: c.type, x: c.x, y: c.y, v: 0 })
      } else if (c.type === 'motor' && I > 0.02) {
        // 单位：rad / 秒；0.6 A 约半转每秒，1 A 再快一点（NB 里就是这个观感）
        out.push({
          id: c.id, kind: 'motor', x: c.x, y: c.y,
          v: 1.9 + 2.2 * Math.min(1.4, I),
          dir: (o._Iraw || 0) < -1e-6 ? -1 : 1,
          dim: dissect,   // 透视时自己也要淡下去，否则轮盘像一块实心盖住内部标注
        })
      }
    }
    return out
  })()

  /* ── 短路位置：判定为短路时，把红叉打在**那根"跨接"的导线**上 ──
   * 短路回路里各根线的电流几乎一样大（都接近短路电流），只取"电流最大的那根"会随机落到干路线上；
   * 真正要标的是那根**又短又跨接**的线，所以先在"电流接近最大"的线里筛，再取长度最短的。
   * 一根线都找不到（比如短路来自一只近乎 0 Ω 的负载）就退回电源本体中心。 */
  const shortAt = (() => {
    if (!(solved.diagnostics || {}).short) return null
    const wI = solved._wireI || {}
    let maxI = 0
    const cand = []
    for (const w of wires) {
      const I = Math.abs(wI[w.id] || 0)
      if (I > maxI) maxI = I
      const c1 = compById(+w.a.split(':')[0])
      const c2 = compById(+w.b.split(':')[0])
      if (!c1 || !c2) continue
      const g = wireGeom(c1, w.a.split(':')[1], c2, w.b.split(':')[1],
        w.id * 977 + 13, w.aT ?? 1, w.bT ?? 1)
      if (!g || !g.mid) continue
      cand.push({ I, g, len: Math.hypot(g.p2.x - g.p1.x, g.p2.y - g.p1.y) })
    }
    let best = null
    if (maxI > 0 && cand.length) {
      const strong = cand.filter((x) => x.I >= maxI * 0.9)
      strong.sort((a, b) => a.len - b.len)
      best = strong[0] || null
    }
    if (best) return { x: best.g.mid.x, y: best.g.mid.y }
    const src = comps.find((c) => c.type === 'battery' || c.type === 'accumulator'
      || c.type === 'mains' || c.type === 'acSource')
    if (!src) return null
    const t = T(src)
    return { x: src.x + (t ? t.w / 2 : 30), y: src.y + (t ? t.h / 2 : 30) }
  })()

  /* ── 实验记录：合闸 / 断闸（电流有无翻转、或开关被拨动）时追加一行 ── */
  const liveRef = useRef(null)
  const swList = comps.filter((c) => c.type === 'switch' || c.type === 'wallSwitch' || c.type === 'breaker')
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
    const em = comps.find((c) => c.type === 'electromagnet')
    const i = am ? solved[am.id]?._I : (em ? solved[em.id]?._I : null)
    const u = vm ? solved[vm.id]?._V : null
    const d = solved.diagnostics || {}
    const lit = comps.filter((c) => c.type === 'bulb' && (solved[c.id]?._P || 0) > 0.001).length
    const num = (v) => (Math.abs(v) < 5e-4 ? '0.000' : (v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(3))
    const emNote = em && on
      ? `${em.turns || 10} 匝 吸 ${solved[em.id]?._pins ?? 0} 针${em.core === false ? '（无铁芯）' : ''}`
      : ''
    const note = d.short ? '电源短路'
      : d.ammeterParallel ? '电流表并联（误接）'
        : d.voltmeterSeries ? '电压表串联（误接）'
          : on ? (emNote || (lit ? `灯泡亮 ${lit} 只` : '电路接通'))
            : (em && !emNote ? '电磁铁失磁' : comps.some((c) => c.type === 'bulb') ? '灯泡灭' : '电路断开')
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
        /* 导线画在器材**下面**（z2 < 器材 z3）：真导线是铺在板面上、从器材背后绕到柱脚的，
           一根线横穿过去只会从机器边上露出来，不会压住机器面板（NB 就是这么藏的）。
           柱脚那圈裸铜丝另画在 wiretop(z6)，仍压在最上层。 */
        .esb-wirelayer{position:absolute;inset:0;pointer-events:none;z-index:2}
        /* 器材自带的"说明标签"层（电能表四柱接法）：导线是摆在器材上面的，标签必须更高一层，
           否则从柱脚引出的导线会把标签整段盖住 */
        .esb-taglayer{position:absolute;inset:0;pointer-events:none;z-index:7}
        .esb-root.dissect .esb-taglayer{display:none}
        /* 端头层：导线本体整根压在器材之上（真导线是摆在板面上、绕到柱脚的）；
           这一层只负责让"裸铜丝绕在柱脚上"永远画在所有导线最上面。 */
        .esb-wiretop{position:absolute;inset:0;pointer-events:none;z-index:6}
        /* 短路红叉：永远压在最上面（连插头都不遮它），只看得见、不挡点击 */
        .esb-shortalert{position:absolute;inset:0;pointer-events:none;z-index:14}
        .esb-shortx .pulse{animation:esbShortPulse 1.15s ease-out infinite;
          transform-box:fill-box;transform-origin:50% 50%}
        @keyframes esbShortPulse{
          0%{opacity:.95;transform:scale(.55)}
          70%{opacity:.18;transform:scale(1.5)}
          100%{opacity:0;transform:scale(1.75)}
        }
        .esb-partlayer{position:absolute;inset:0;z-index:3;pointer-events:none}
        /* 空开闸刀层：压在器材之上、导线之下；翻转走 transition，所以是"转"过去的 */
        .esb-leverlayer{position:absolute;inset:0;z-index:4;pointer-events:none}
        /* 转轴的 y 与翻转角度都可调（--esb-flip-y / --esb-flip-deg）：
           默认＝用户划的那条红线 y=100px（两竖脚与滑槽底口之间），角度 74°（再大横杆就钻到槽底下去了） */
        .esb-bklever{position:absolute;transform-origin:50% var(--esb-flip-y, 100px);backface-visibility:visible;transform-style:preserve-3d}
        .esb-bklever svg{display:block;overflow:visible}
        .esb-lvslab{position:absolute;left:0;top:0;width:124px;height:152px}
        /* 绕"两竖与面板接触处"那条横线（y=97.6）上下倒：
           前半程脚不动、杆往下落；转到 ~90° 与面板垂直、正好看不见时，才把它挪到另一侧（36.2px），
           后半程继续转到 180° 翻出来 —— 所以不会看见"整块件翻到滑槽外面" */
        /* 绕"页缝"上下翻：转轴固定不动（绝不平移），一整块件转 180° 翻过去 —— 象翻书页那样。
           见 flipAngle 的注释：那条缝的位置不是随便取的，它是唯一能让两个终态都留在滑槽里的线。 */
        @keyframes esbFlipToTrip{
          0%{transform:perspective(520px) rotateX(0deg)}
          100%{transform:perspective(520px) rotateX(var(--esb-flip-deg, -74deg))}
        }
        @keyframes esbFlipToClose{
          0%{transform:perspective(520px) rotateX(var(--esb-flip-deg, -74deg))}
          100%{transform:perspective(520px) rotateX(0deg)}
        }
        .esb-bklever.to-trip{animation:esbFlipToTrip .46s cubic-bezier(.4,.08,.32,1) both}
        .esb-bklever.to-closed{animation:esbFlipToClose .46s cubic-bezier(.4,.08,.32,1) both}
        .esb-root.dissect .esb-leverlayer{opacity:.4}
        /* 插头层：电源线画在器材**背后**（起点藏在机身里，露出来的一截贴着机器边缘＝线是从机器里出来的），
           插头本体在最上层、可拖 */
        .esb-cordlayer{position:absolute;inset:0;pointer-events:none;z-index:1}
        .esb-plug{position:absolute;touch-action:none;cursor:grab;pointer-events:auto;z-index:9;
          filter:drop-shadow(0 1.4px 2px rgba(15,23,42,.30))}
        .esb-plug:active{cursor:grabbing}
        /* 插上的插头：投影压得更实（贴住插座面板），一眼看出"已经插进去了"，不是浮在面上 */
        .esb-plug.on{filter:drop-shadow(0 2.4px 3.2px rgba(15,23,42,.42))}
        .esb-plug:hover svg rect{filter:brightness(1.12)}
        .esb-comp{position:absolute;cursor:grab;touch-action:none;pointer-events:auto}
        .esb-comp:active{cursor:grabbing}
        .esb-comp svg{display:block;overflow:visible}
        /* 器材照片不能参与浏览器"原生图片拖拽"：一旦浏览器在按下时接管成 HTML5 drag，
           pointermove 就断了，器件只跟手走十几像素就卡住（表现为"家电拖不动"） */
        .esb-comp svg image,.esb-comp img{-webkit-user-drag:none;user-select:none;pointer-events:none}
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
        /* 电能表走字倍速：真表走得太慢（100 W 要 1 小时才 1 度），只有加快时间才看得出转盘与计数器在动 */
        .esb-speed{position:absolute;right:18px;top:58px;z-index:22;display:inline-flex;align-items:center;gap:6px;
          padding:7px 13px;border-radius:10px;border:1px solid #dbe3ec;background:rgba(255,255,255,.96);
          color:#1e293b;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;
          box-shadow:0 6px 18px rgba(2,6,23,.14);transition:background .15s,border-color .15s,color .15s}
        .esb-speed:hover{background:#f8fafc;border-color:#c7d2e0}
        .esb-speed.on{background:#ecfdf5;border-color:#10b981;color:#047857}
        .esb-comp.selected .esb-boxhl{opacity:1}
        .esb-boxhl{position:absolute;inset:-6px;border:2px dashed #2563eb;border-radius:12px;
          opacity:0;pointer-events:none;transition:opacity .15s}
        .esb-comp:hover .esb-boxhl{opacity:.45}
        /* 单件删除：鼠标停在器材上时，卡片左上角长出红色 ✕（不用再"全部重置"）；
           平时 opacity:0 + pointer-events:none，免得挡住拖动和接线柱 */
        .esb-del{position:absolute;left:-6px;top:-24px;width:22px;height:22px;border-radius:50%;
          background:#e11d48;color:#fff;border:2px solid #fff;display:grid;place-items:center;
          font-size:12px;font-weight:700;line-height:1;cursor:pointer;z-index:13;
          opacity:0;pointer-events:none;transition:opacity .15s,transform .15s;
          box-shadow:0 3px 9px rgba(2,6,23,.22);transform:scale(.8)}
        .esb-comp:hover .esb-del{opacity:1;pointer-events:auto;transform:scale(1)}
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
        .esb-flowlayer{position:absolute;inset:0;pointer-events:none;z-index:2}
        /* 运动层：压在导线(3)与器材(2)之上、接线柱命中层(5)之下 —— 柱子必须还能点 */
        .esb-motionlayer{position:absolute;inset:0;pointer-events:none;z-index:4}
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
            const g = wireGeom(c1, w.a.split(':')[1], c2, w.b.split(':')[1], w.id * 977 + 13, w.aT ?? 1, w.bT ?? 1)
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

        {/* 运动层：铝盘在转 / 滚筒在洗（自带 rAF，不进器材的字符串重渲染） */}
        <MotionLayer items={motionItems} />

        {/* 元件层：电器排在插座之后渲染（机器压在插座上＝"插进去了"）。
            插座顶部那三个接线端被插上的机器盖住是正常的：真机上插座在机器背后，
            导线顺着机器底边沉下去，读起来就是"插头插在插座里"；没插电器时三端露在外面，方便接线 */}
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
                data-comp-id={c.id} data-comp-type={c.type}
                style={{ left: c.x, top: c.y, width: t.w, height: t.h }}
                onPointerDown={(e) => onCompDown(e, c)}
                onDragStart={(e) => e.preventDefault()}
              >
                <div className="esb-boxhl" />
                {/* 单件删除按钮：悬停出现，点它就删这只（连着它身上的导线一起删） */}
                <div
                  className="esb-del"
                  title="删除这个器材"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); removeComp(c.id) }}
                >✕</div>
                <div dangerouslySetInnerHTML={{ __html: t.render(c, dyn) }} />
                {t.meter && ro && (
                  <div className="esb-readout" style={{ opacity: c.showRead ? 1 : 0, color: ro.color }}>{ro.text}</div>
                )}
              </div>
            )
          })}
        </div>

        {/* 空开闸刀单独一层：绕用户划的那条红线（y=100，两竖脚与滑槽底口之间）上下转动。
            转轴全程固定、没有任何平移；件本身叠了 9 层 Z，转起来会露出侧壁（有厚度，不会变纸片） */}
        <div className="esb-leverlayer">
          {comps.filter((c) => c.type === 'breaker').map((c) => (
            <div
              key={'lv' + c.id}
              className={`esb-bklever${flipCls(c)}`}
              style={{
                left: c.x, top: c.y, width: 124, height: 152,
                transform: c.closed
                  ? 'none'
                  : 'perspective(520px) rotateX(var(--esb-flip-deg, -74deg))',
              }}
            >
              {LEVER_SLABS.map((z, i) => (
                <div
                  key={z}
                  className="esb-lvslab"
                  style={{ transform: `translateZ(${z}px)` }}
                  dangerouslySetInnerHTML={{ __html: i === LEVER_SLABS.length - 1 ? LEVER_FACE : LEVER_SIDE }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* 插头层：每台家电自带一只插头，电源线从机身右侧出来，任意方向都能拉长 */}
        <svg className="esb-cordlayer" width={CW} height={CH}>
          {plugs.map((c) => {
            const t = T(c)
            const pos = c.plugPos || plugHome(c)
            /* 线的起点藏在机身背后（机身右下角内侧）：线层比器材层低，露出来的一截正好
               贴着机器边缘，"从机器里长出来"才像真机；终点咬在插头壳的尖上（壳的尖就是线的出口）。
               线型照 NB：先横向出机器，再用一个圆角拐过去，直线走到插头——细的浅灰扁线，不是软管 */
            /* 线从**机身的右下角**横着出来（不是从卡片边缘）：四张整机图左右留白不一样，
               各自的右边界换算成到卡片右边的距离，再加 6 让它藏进机身里 → 线看着是从机器里长出来的 */
            const ax = c.x + t.w - (CORD_OUT[c.type] || 36) - 20
            /* 机身图已从 y18 下移到 y26（卡片上不再有标题带），电源出口跟着 +8 */
            const ay = c.y + 112
            const bx = pos.x
            /* 线的出口 = 插头底下罗纹颈的末端：没插（锚点 22,22 → 框顶 pos.y-22）在 pos.y+30；
               插上（锚点 22,33）时背面底边在 pos.y+22、颈伸到 pos.y+30 */
            const by = pos.y + (c.plug ? 27 : 30)
            const tx = bx
            const ty = by
            /* 一条平滑的软线（用户口径：右侧那条伸出去的短横线要去掉）：
               出机身那一下只留一个横向的缓弯（控制点），不再有直段；进插头那一下竖着收进去。 */
            const dx = tx - ax
            const dy = ty - ay
            const sx = Math.sign(dx) || 1
            const sy = Math.sign(dy) || 1
            const k1 = Math.min(Math.abs(dx) * 0.55, c.plug ? 46 : 34)
            const k2 = Math.min(Math.abs(dy) * 0.55, 40)
            const d = `M${ax} ${ay} C${ax + sx * k1} ${ay} ${tx} ${ty - sy * k2} ${tx} ${ty}`
            return (
              <g key={c.id}>
                {/* 线是**黑的**（照 NB 实拍：家电电源线与插头都是黑色橡套线，不是浅灰）：
                    底下一条更深的落影，本体 #23262b，靠上沿一条 #6b7280 细高光做出圆柱反光 */}
                <path d={d} fill="none" stroke="rgba(12,16,22,0.42)" strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" transform="translate(0 1.6)" />
                <path d={d} fill="none" stroke="#23262b" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke="#6b7280" strokeWidth={1.0} strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
              </g>
            )
          })}
        </svg>
        {plugs.map((c) => {
          const pos = c.plugPos || plugHome(c)
          const an = c.plug ? PLUG_BACK_ANCHOR : PLUG_ANCHOR.off
          const ps = c.plug ? PLUG_BACK_SIZE : PLUG_SIZE
          return (
            <div
              key={'plug' + c.id}
              className={`esb-plug${c.plug ? ' on' : ''}`}
              data-plug-of={c.id} data-plug-type={c.type}
              style={{ left: pos.x - an.x, top: pos.y - an.y, width: ps.w, height: ps.h }}
              onPointerDown={(e) => onPlugDown(e, c)}
              title={c.plug ? '插在插座上（拖动可拔出）' : '拖动这只插头，插到插座的孔里'}
            >
              <svg width={ps.w} height={ps.h} viewBox={c.plug ? '0 0 48 74' : '0 0 44 66'}>
                <defs>
                  <radialGradient id="esb-plug-recess" cx="50%" cy="46%" r="58%">
                    <stop offset="55%" stopColor="rgba(15,23,42,.34)"/>
                    <stop offset="100%" stopColor="rgba(15,23,42,0)"/>
                  </radialGradient>
                  <linearGradient id="esb-plug-back" x1="0" y1="0" x2="0.35" y2="1">
                    <stop offset="0%" stopColor="#4b525c"/>
                    <stop offset="45%" stopColor="#3a4048"/>
                    <stop offset="100%" stopColor="#282d34"/>
                  </linearGradient>
                </defs>
                {/* 插上时：先在插座面板上铺一圈"沉进孔里的暗影"，再把插头背面压上去 */}
                {c.plug && (
                  <ellipse cx="24" cy="34" rx="26" ry="24" fill="url(#esb-plug-recess)" />
                )}
                {c.plug ? (
                  /* 插上 —— 看见的是**同一只插头的背面**：上宽下收、下巴收成楔形（梯形），
                     不是圆角正方形；宽到把三孔整个盖住。背面特征：顶部高光弧、中段横向模缝、
                     两侧捏边、下巴那道收口、底下伸出的圆罗纹套（电源线从套里下来） */
                  <g>
                    <path d={PLUG_BACK} fill="url(#esb-plug-back)" stroke="#1f242a" strokeWidth=".75"
                      strokeLinejoin="round"/>
                    <path d={PLUG_BACK} fill="none" stroke="rgba(255,255,255,.13)" strokeWidth=".9"
                      transform="translate(.5 .5) scale(.965)" strokeLinejoin="round"/>
                    {/* 顶部高光：沿上缘的一道弧 */}
                    <path d="M5.6 7.2 C 8.6 3.2 14 1.6 24 1.6 C 34 1.6 39.4 3.2 42.4 7.2"
                      fill="none" stroke="rgba(255,255,255,.30)" strokeWidth="1.25" strokeLinejoin="round"/>
                    {/* 中段那道横向模具接缝（真插头背面都有） */}
                    <path d="M3 32.4 C 10 34.2 38 34.2 45 32.4" fill="none" stroke="rgba(0,0,0,.30)" strokeWidth="1.05"/>
                    <path d="M3 31.2 C 10 33 38 33 45 31.2" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth=".95"/>
                    {/* 两侧捏边 */}
                    <ellipse cx="5.2" cy="23" rx="1.2" ry="5" fill="rgba(0,0,0,.26)"/>
                    <ellipse cx="42.8" cy="23" rx="1.2" ry="5" fill="rgba(0,0,0,.26)"/>
                    {/* 下巴塌下去的那道收口（楔形的"腰"） */}
                    <path d="M7 55.4 C 6.4 60.2 11.6 63.6 24 63.6 C 36.4 63.6 41.6 60.2 41 55.4"
                      fill="none" stroke="rgba(0,0,0,.24)" strokeWidth="1.05"/>
                    {/* 底下伸出的圆罗纹套 */}
                    <rect x="17.2" y="61.4" width="13.6" height="11.6" rx="4.6" fill="#333941" stroke="#1d2126" strokeWidth=".7"/>
                    <rect x="18.6" y="62.6" width="2.6" height="8.4" rx="1.3" fill="rgba(255,255,255,.16)"/>
                    <line x1="17.6" y1="66" x2="30.4" y2="66" stroke="#1d2126" strokeWidth=".9"/>
                    <line x1="17.6" y1="69" x2="30.4" y2="69" stroke="#1d2126" strokeWidth=".9"/>
                  </g>
                ) : (
                  /* 没插 —— 蛇头正面：圆角三角形头 + 三道白标 + 罗纹颈 */
                  <g transform="translate(5 2)">
                    <path d={PLUG_HEAD} fill="#3b4048" stroke="#20242a" strokeWidth=".9"/>
                    <path d={PLUG_HEAD} fill="none" stroke="#ffffff" strokeWidth="1" opacity=".1"
                      transform="translate(1.1 1.1) scale(.93)" strokeLinejoin="round"/>
                    <g stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" opacity=".9" fill="none">
                      <line x1="17" y1="7" x2="17" y2="17.2"/>
                      <line x1="11.4" y1="18.4" x2="14.3" y2="25.6"/>
                      <line x1="22.6" y1="18.4" x2="19.7" y2="25.6"/>
                    </g>
                    <path d={PLUG_BOOT} fill="#31353c" stroke="#1d2126" strokeWidth=".8"/>
                    <line x1="12.4" y1="38.6" x2="21.6" y2="38.6" stroke="#1d2126" strokeWidth="1.1"/>
                    <line x1="11.9" y1="42" x2="22.1" y2="42" stroke="#1d2126" strokeWidth="1.1"/>
                  </g>
                )}
              </svg>
            </div>
          )
        })}

        {/* 接线柱命中层：必须压在所有导线之上——否则柱子一接线，导线那根 18px 的
            命中带就把柱子盖住，"再点它接第二根线"根本点不动（多表并联就接不上） */}
        <div className="esb-termhit">
          {comps.map((c) => {
            const t = T(c)
            if (!t) return null
            /* 家用电器不设接线柱热点（插脚就是接头，拖到插座孔上自动连）；
               这些器材只保留 TERM_IDS 供引擎做插脚 union，画面上不出现可点的柱帽 */
            if (t.noTermUI) return null
            return t.terminals.map((tm) => {
              /* 交流电源的三根引线会动：柱子热点跟着线头走，不然点不到 */
              const tp = (AC_LEAD[tm.id] && c.type === 'acSource')
                ? leadAt(c, tm.id, 1)
                : { x: c.x + tm.x, y: c.y + tm.y }
              return (
                <div
                  key={c.id + ':' + tm.id}
                  className={`esb-term${pending && pending.cid === c.id && pending.tid === tm.id ? ' active' : ''}`}
                  title={tm.name}
                  style={{ left: tp.x - 9, top: tp.y - 9 }}
                  onPointerDown={(e) => onTermDown(e, c, tm.id)}
                />
              )
            })
          })}
        </div>

        {/* 器材说明标签层：压在导线之上（电能表四柱接法） */}
        <div className="esb-taglayer">
          {comps.map((c) => {
            const t = T(c)
            if (!t || !t.tagsSVG) return null
            return (
              <svg key={c.id} width={t.w} height={t.h}
                style={{ position: 'absolute', left: c.x, top: c.y }}
                dangerouslySetInnerHTML={{ __html: t.tagsSVG(c, dynOf(c)) }} />
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
            const g = wireGeom(c1, w.a.split(':')[1], c2, w.b.split(':')[1], w.id * 977 + 13, w.aT ?? 1, w.bT ?? 1)
            if (!g) return null
            const color = w.color || '#475569'
            const B = wrapLayers(color, WIRE_W)
            /* 空气开关这类"线从背后进壳"的器材：端头不画绕铜丝，线到壳沿就断，读作钻进壳里 */
            const noWrapA = !!(T(c1) && T(c1).hideWrap)
            const noWrapB = !!(T(c2) && T(c2).hideWrap)
            return (
              <g key={w.id}>
                {!noWrapA && wrapAt(g.p1, B, 'b1')}
                {!noWrapB && wrapAt(g.p2, B, 'b2')}
              </g>
            )
          })}
        </svg>
        {/* 短路警示：在短接处打一只红叉（带脉冲圈 + "短路"字样），压在所有器材之上 */}
        {shortAt && (
          <svg className="esb-shortalert" width={CW} height={CH}>
            <g className="esb-shortx" transform={`translate(${shortAt.x.toFixed(1)},${shortAt.y.toFixed(1)})`}>
              <circle r="19" fill="rgba(239,68,68,.18)"/>
              <circle r="19" fill="none" stroke="#ef4444" strokeWidth="2" opacity=".85"/>
              <circle className="pulse" r="19" fill="none" stroke="#fca5a5" strokeWidth="2.4"/>
              <line x1="-9.4" y1="-9.4" x2="9.4" y2="9.4" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity=".55"/>
              <line x1="9.4" y1="-9.4" x2="-9.4" y2="9.4" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity=".55"/>
              <line x1="-9.4" y1="-9.4" x2="9.4" y2="9.4" stroke="#ef4444" strokeWidth="4" strokeLinecap="round"/>
              <line x1="9.4" y1="-9.4" x2="-9.4" y2="9.4" stroke="#ef4444" strokeWidth="4" strokeLinecap="round"/>
              <text x="0" y="31" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#dc2626"
                fontFamily="system-ui,-apple-system,'Segoe UI',sans-serif"
                style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 2.4 }}>短路</text>
            </g>
          </svg>
        )}
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

      {/* 电能表走字倍速：只有场景里存在电能表时才出现（别的专题用不到） */}
      {comps.some((c) => c.type === 'energyMeter') && (
        <button
          className={`esb-speed${meterSpeed > 1 ? ' on' : ''}`}
          title="电能表走字倍速：1× 是真实时间（100 W 亮 1 小时才 0.1 度，肉眼看不到走字）；点一下 60× / 600×"
          onClick={() => setMeterSpeed((v) => (v === 1 ? 60 : v === 60 ? 600 : 1))}
        >
          ⏩ 走字 {meterSpeed}×
        </button>
      )}

      {/* 状态浮层（贴在可视区左下，跟画布滚动无关） */}
        <div
          className="esb-status"
          style={{
            background: plugHint ? 'rgba(180,83,9,.92)'
              : status.tone === 'ok' ? 'rgba(46,125,50,.92)' : status.tone === 'bad' ? 'rgba(198,40,40,.9)' : 'rgba(15,23,42,.84)',
            color: '#fff',
          }}
        >
          {plugHint || status.text}
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

