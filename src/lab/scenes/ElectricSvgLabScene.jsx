/**
 * ElectricSvgLabScene — 电学虚拟实验室（SVG 仪器 · 可看内部结构）
 *
 * 物理逻辑移植自 D:\仿真物理（dp）\物理电学虚拟实验室.html
 * （节点法电导矩阵 + 列主元高斯消元，见 engine/electricLab.js），
 * 仪器用 SVG 矢量图表示，并保留「内部结构」剖视透视：
 *   .casing 外壳 → 剖视时变透明，.inner 内部构造 + .plabel 标注显现。
 *
 * 交互（与源实验一致）：
 *   元件库拖入桌面 / 拖动元件（导线跟随）/ 点接线柱连线（虚线预览）
 *   单击开关通断 / 拖变阻器橙色滑片调阻 / 双击电表显示读数（表针同步偏转）
 *   单击导线选中删除 / Delete 删元件 · 导线 / 示例电路 / 清空桌面
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { solveCircuit, circuitStatus, CFG, TERM_IDS } from '../engine/electricLab.js'
import { TYPES, RHEO_TRACK, FIG, rheostatMode } from './electricSvgInstruments.js'

const CW = 1800, CH = 1100

/* =======================  样式（移植自源实验，限定在 .esvg-root 内）  ======================= */
const CSS = `
.esvg-root{position:absolute;inset:0;display:flex;flex-direction:column;
  font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  background:#eef2f7;color:#1f2937;overflow:hidden;user-select:none;-webkit-user-select:none}
.esvg-root *{box-sizing:border-box;margin:0;padding:0}
.esvg-topbar{height:52px;flex:0 0 52px;display:flex;align-items:center;justify-content:space-between;
  padding:0 16px;background:linear-gradient(180deg,#1e293b,#0f172a);color:#e2e8f0;
  box-shadow:0 2px 10px rgba(15,23,42,.28);z-index:30}
.esvg-brand{display:flex;align-items:center;gap:9px}
.esvg-brand .logo{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:17px;
  background:linear-gradient(145deg,#38bdf8,#2563eb);box-shadow:0 0 12px rgba(56,189,248,.55)}
.esvg-brand h1{font-size:15px;font-weight:600;letter-spacing:.5px}
.esvg-tools{display:flex;gap:8px;flex-wrap:wrap}
.esvg-root .btn{border:1px solid rgba(148,163,184,.35);background:rgba(148,163,184,.12);color:#e2e8f0;
  padding:6px 12px;font-size:12.5px;border-radius:8px;cursor:pointer;transition:.18s;font-family:inherit}
.esvg-root .btn:hover{background:rgba(148,163,184,.28);border-color:rgba(148,163,184,.6)}
.esvg-root .btn.on{background:linear-gradient(180deg,#38bdf8,#0ea5e9);border-color:#38bdf8;color:#04263a;font-weight:600}
.esvg-body{flex:1;display:flex;min-height:0}
.esvg-palette{width:160px;flex:0 0 160px;background:#fff;border-right:1px solid #dbe3ec;
  padding:11px 9px;overflow-y:auto}
.esvg-ptitle{font-size:12px;color:#64748b;letter-spacing:1px;margin-bottom:9px;text-align:center}
.esvg-pgroup{font-size:10.5px;color:#94a3b8;letter-spacing:.5px;margin:10px 2px 6px;
  padding-top:8px;border-top:1px dashed #e2e8f0}
.esvg-pgroup:first-child{border-top:none;padding-top:0}
.esvg-pitem{display:flex;align-items:center;gap:7px;padding:7px 8px;margin-bottom:7px;
  background:#f8fafc;border:1px solid #dbe3ec;border-radius:10px;cursor:grab;transition:.15s;
  font-size:12px;color:#334155}
.esvg-pitem:hover{background:#eff6ff;border-color:#93c5fd;box-shadow:0 2px 8px rgba(37,99,235,.12)}
.esvg-pitem svg{width:42px;height:26px;flex:0 0 42px}
.esvg-ptip{margin-top:12px;font-size:10.5px;color:#94a3b8;text-align:center;line-height:1.6;
  border-top:1px dashed #e2e8f0;padding-top:9px}
.esvg-stage{flex:1;position:relative;overflow:auto;padding:12px;background:#eef2f7}
.esvg-canvas{position:relative;width:1800px;height:1100px;border-radius:14px;
  background:linear-gradient(#fbfcfe,#fbfcfe),
    repeating-linear-gradient(0deg,transparent 0 39px,#e7edf5 39px 40px),
    repeating-linear-gradient(90deg,transparent 0 39px,#e7edf5 39px 40px);
  box-shadow:inset 0 0 0 1px #dbe3ec,0 10px 30px rgba(15,23,42,.07)}
/* 3D 实验台容器（替换 2D 画布区域；同一位置二选一显示） */
.esvg-lab3d{position:absolute;inset:12px;border-radius:14px;overflow:hidden;
  background:#e8eef6;box-shadow:inset 0 0 0 1px #dbe3ec,0 10px 30px rgba(15,23,42,.07)}
.esvg-lab3d canvas{display:block;width:100%;height:100%}
.esvg-wirelayer{position:absolute;inset:0;pointer-events:none;z-index:1}
.esvg-partlayer{position:absolute;inset:0;z-index:2;pointer-events:none}
.esvg-comp{position:absolute;cursor:grab;touch-action:none;pointer-events:auto}
.esvg-comp:active{cursor:grabbing}
.esvg-comp svg{display:block;overflow:visible}
.esvg-comp.selected .boxhl{opacity:1}
.esvg-comp .boxhl{position:absolute;inset:-6px;border:2px dashed #2563eb;border-radius:12px;
  opacity:0;pointer-events:none;transition:opacity .15s}
.esvg-comp:hover .boxhl{opacity:.45}
.esvg-term{position:absolute;width:20px;height:20px;border-radius:50%;
  background:transparent;border:2px solid transparent;
  cursor:crosshair;z-index:5;transition:transform .12s,box-shadow .12s,border-color .12s}
.esvg-term:hover{transform:scale(1.35);box-shadow:0 0 0 5px rgba(37,99,235,.22);border-color:#2563eb}
.esvg-term span{display:none}
.esvg-term.active{border-color:#f59e0b;
  box-shadow:0 0 0 7px rgba(245,158,11,.25);transform:scale(1.3)}
.esvg-wire{fill:none;stroke:#334155;stroke-width:5;stroke-dasharray:0.1 6.5;stroke-linecap:round;
  pointer-events:none;transition:stroke .6s,filter .6s}
.esvg-wirelayer.short .esvg-wire{filter:drop-shadow(0 0 2px #dc2626)}
.esvg-wire.flash{animation:es-wire-flash 1s ease-in-out infinite}
@keyframes es-wire-flash{0%,100%{opacity:1}50%{opacity:.4}}
.esvg-wire-shadow{fill:none;stroke:transparent;stroke-width:18;stroke-linecap:round;
  cursor:pointer;pointer-events:stroke}
.esvg-wire.sel{stroke:#e11d48}
.esvg-wire-preview{fill:none;stroke:#f59e0b;stroke-width:5;stroke-dasharray:0.1 6.5;stroke-linecap:round;opacity:0.9}
.esvg-delbtn{position:absolute;width:26px;height:26px;border-radius:50%;z-index:12;
  background:#e11d48;color:#fff;border:2px solid #fff;font-size:14px;font-weight:700;
  display:grid;place-items:center;cursor:pointer;box-shadow:0 3px 10px rgba(225,29,72,.45);
  line-height:1;font-family:inherit}
.esvg-delbtn:hover{background:#be123c;transform:scale(1.1)}
.esvg-readout{position:absolute;left:50%;top:-36px;transform:translateX(-50%);
  background:#0f172a;color:#4ade80;font-family:ui-monospace,Consolas,monospace;font-size:13px;
  padding:4px 9px;border-radius:7px;white-space:nowrap;border:1px solid #334155;
  transition:opacity .15s;pointer-events:none;z-index:9;font-weight:600}
.esvg-readout::after{content:"";position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);
  border:6px solid transparent;border-top-color:#0f172a;border-bottom:0}
.esvg-ghost{position:fixed;z-index:999;pointer-events:none;padding:8px 14px;border-radius:10px;
  background:rgba(37,99,235,.92);color:#fff;font-size:13px;box-shadow:0 8px 22px rgba(37,99,235,.4);
  transform:translate(-50%,-50%)}
.esvg-statusbar{flex:0 0 32px;display:flex;align-items:center;gap:14px;padding:0 14px;
  background:#0f172a;color:#94a3b8;font-size:12px;overflow:hidden;white-space:nowrap}
.esvg-statusbar .ok{color:#4ade80;font-weight:600}
.esvg-statusbar .warn{color:#fbbf24;font-weight:600}
.esvg-statusbar .bad{color:#fb7185;font-weight:600}
.esvg-statusbar .sep{color:#334155}
.esvg-canvas .casing{transition:opacity .25s}
.esvg-canvas .plabel{opacity:0;transition:opacity .25s;font-size:9.5px;fill:#1d4ed8;
  font-weight:600;text-anchor:middle;pointer-events:none}
.esvg-canvas.dissect .casing{opacity:.13}
.esvg-canvas.dissect .plabel{opacity:1}
.esvg-canvas.dissect .comp{filter:drop-shadow(0 0 6px rgba(37,99,235,.25))}
.esvg-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:200;display:grid;
  place-items:center;padding:20px;backdrop-filter:blur(3px)}
.esvg-card{background:#fff;border-radius:16px;max-width:620px;width:100%;max-height:80vh;overflow:auto;
  padding:22px 24px;box-shadow:0 24px 60px rgba(15,23,42,.35)}
.esvg-card h2{font-size:16px;margin-bottom:12px;color:#0f172a}
.esvg-card ul{margin:0 0 12px 18px;line-height:1.8;font-size:13px;color:#334155}
.esvg-card b{color:#1d4ed8}
.esvg-card .close{float:right;border:none;background:#eef2f7;width:28px;height:28px;border-radius:50%;
  cursor:pointer;font-size:14px;color:#475569;font-family:inherit}
`

/* =======================  SVG 渐变（移植自源实验）  ======================= */
const SVG_DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="es-g-zinc" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#e6ebf1"/><stop offset=".35" stop-color="#c3ccd6"/>
  <stop offset=".6" stop-color="#9da9b6"/><stop offset="1" stop-color="#7d8a99"/></linearGradient>
<linearGradient id="es-g-steel" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f1f5f9"/><stop offset=".4" stop-color="#cbd5e1"/>
  <stop offset=".7" stop-color="#94a3b8"/><stop offset="1" stop-color="#64748b"/></linearGradient>
<linearGradient id="es-g-gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f6d98a"/><stop offset=".45" stop-color="#d9a93a"/>
  <stop offset="1" stop-color="#a2761c"/></linearGradient>
<linearGradient id="es-g-ceramic" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f7f3e8"/><stop offset=".5" stop-color="#e8e1cf"/>
  <stop offset="1" stop-color="#cfc6ad"/></linearGradient>
<radialGradient id="es-g-glass" cx=".35" cy=".3" r=".85">
  <stop offset="0" stop-color="#ffffff" stop-opacity=".95"/>
  <stop offset=".55" stop-color="#dceaf8" stop-opacity=".55"/>
  <stop offset="1" stop-color="#b6cfe6" stop-opacity=".42"/></radialGradient>
<radialGradient id="es-g-glow" cx=".5" cy=".5" r=".5">
  <stop offset="0" stop-color="#fffde0" stop-opacity=".95"/>
  <stop offset=".45" stop-color="#fde68a" stop-opacity=".72"/>
  <stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></radialGradient>
<linearGradient id="es-g-wood" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#5a6b7b"/><stop offset="1" stop-color="#33414f"/></linearGradient>
</defs></svg>`

/* =======================  元件库小图标（真实器材图 / 高还原 SVG）  ======================= */
const miniResistor = (b1, b2) => `
<svg viewBox="0 0 42 26" style="width:42px;height:26px">
  <path d="M2 13 H8 M34 13 H40" stroke="#b87333" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="7" y="7" width="28" height="12" rx="5" fill="#e8dcc0" stroke="#b7a888"/>
  <rect x="12" y="7" width="3.4" height="12" fill="${b1}"/><rect x="16.5" y="7" width="3.4" height="12" fill="${b2}"/>
  <rect x="24" y="7" width="3.4" height="12" fill="#c9a227"/><rect x="28.5" y="7" width="3.4" height="12" fill="#c9a227"/>
</svg>`
const PALETTE_ICONS = {
  battery: `<img src="${FIG}/battery_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  bulb: `<img src="${FIG}/bulb_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  switch: `<img src="${FIG}/switch_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  ammeter: `<img src="${FIG}/ammeter_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  voltmeter: `<img src="${FIG}/voltmeter_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  rheostat: `<img src="${FIG}/rheostat_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  resistor5: miniResistor('#0f7a3d', '#1b1b1b'),
  resistor10: miniResistor('#7a4a12', '#1b1b1b'),
  resistor15: miniResistor('#7a4a12', '#0f7a3d'),
  switch2: `
<svg viewBox="0 0 42 26" style="width:42px;height:26px">
  <rect x="6" y="18" width="30" height="6" rx="2.5" fill="#2b2e33"/>
  <rect x="9" y="8" width="4" height="11" rx="1.5" fill="#3a3f46"/><rect x="29" y="8" width="4" height="11" rx="1.5" fill="#3a3f46"/>
  <rect x="20" y="15" width="22" height="4" rx="2" fill="#cbd5e1" stroke="#8d96a1" transform="rotate(-38 21 17)"/>
  <circle cx="21" cy="18" r="2.6" fill="#8d96a1"/>
</svg>`,
  motor: `<img src="${FIG}/motor_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  diode: `
<svg viewBox="0 0 42 26" style="width:42px;height:26px">
  <path d="M4 20 H13 M29 20 H38" stroke="#d98a3d" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M15 20 V12 A6 7 0 0 1 27 12 V20 Z" fill="#e8763a" stroke="#c25a12"/>
  <rect x="13" y="18" width="16" height="4" rx="1.5" fill="#9aa3ad"/>
</svg>`,
  fuse: `<img src="${FIG}/fuse_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  testPencil: `
<svg viewBox="0 0 42 26" style="width:42px;height:26px">
  <path d="M2 13 L8 9 V17 Z" fill="#cbd5e1" stroke="#8d96a1"/>
  <rect x="7" y="7.5" width="26" height="11" rx="5.5" fill="rgba(214,232,246,0.7)" stroke="#a9bccc"/>
  <rect x="11" y="10.5" width="9" height="5" rx="2.5" fill="#ff8c42"/>
  <rect x="32" y="7.5" width="8" height="11" rx="3" fill="#cbd5e1" stroke="#8d96a1"/>
</svg>`,
  electroscope: `
<svg viewBox="0 0 42 26" style="width:42px;height:26px">
  <circle cx="21" cy="5" r="3.4" fill="#c9a227"/>
  <rect x="20" y="8" width="2" height="8" fill="#c9a227"/>
  <path d="M20 16 L16 22 M22 16 L26 22" stroke="#c9a227" stroke-width="1.8" stroke-linecap="round"/>
  <rect x="11" y="12" width="20" height="12" rx="3" fill="rgba(214,232,246,0.55)" stroke="#a9bccc"/>
</svg>`,
  mains: `
<svg viewBox="0 0 42 26" style="width:42px;height:26px">
  <rect x="8" y="3" width="26" height="17" rx="3" fill="#f2ede3" stroke="#c9c0ab"/>
  <path d="M13 12 q3 -5 6 0 q3 5 6 0 q3 -5 6 0" fill="none" stroke="#c25a12" stroke-width="1.6"/>
  <rect x="12" y="20" width="6" height="4" rx="2" fill="#1c1f24"/><rect x="24" y="20" width="6" height="4" rx="2" fill="#c0392b"/>
</svg>`,
  resBox: `<img src="${FIG}/resbox_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  multimeter: `<img src="${FIG}/multimeter_c.png" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  relay: `
<svg viewBox="0 0 42 26" style="width:42px;height:26px">
  <rect x="22" y="10" width="8" height="10" rx="1.5" fill="#5b6570"/>
  <ellipse cx="26" cy="12" rx="6" ry="2" fill="none" stroke="#c87533" stroke-width="1.4"/>
  <ellipse cx="26" cy="15" rx="6" ry="2" fill="none" stroke="#c87533" stroke-width="1.4"/>
  <ellipse cx="26" cy="18" rx="6" ry="2" fill="none" stroke="#c87533" stroke-width="1.4"/>
  <rect x="6" y="7" width="24" height="3.2" rx="1.6" fill="#cbd5e1" stroke="#8d96a1" transform="rotate(-6 18 8.6)"/>
  <rect x="6" y="17" width="28" height="5" rx="2.5" fill="#2b2e33"/>
</svg>`,
}

/* 元件库分组（按教学批次展示） */
const PALETTE_GROUPS = [
  { title: '基础器材', keys: ['battery', 'bulb', 'switch', 'ammeter', 'voltmeter', 'rheostat'] },
  { title: '初中必做实验', keys: ['resistor5', 'resistor10', 'resistor15', 'switch2', 'motor', 'diode'] },
  { title: '家庭电路', keys: ['fuse', 'testPencil', 'electroscope', 'mains'] },
  { title: '高中拓展', keys: ['resBox', 'multimeter', 'relay'] },
]

/* =======================  Verlet 粒子链软导线（非贝塞尔）  =======================
 * 粒子链 + 距离约束 + 重力下垂（移植自 初中电学实验沙盒.html 的 VerletChain 思路）：
 * 两端钉死在接线柱上，中间粒子自由下垂，逐帧松弛，形态由物理决定而非贝塞尔控制点。
 */
const WIRE_N = 18          // 每根导线的粒子数
const WIRE_ITER = 12       // 每帧约束松弛次数
const WIRE_GRAV = 0.6      // 重力（px/步²）
const WIRE_DAMP = 0.985    // 阻尼
const TERM_DROP = 7        // 锚点下移：接在柱帽正下方的柱身处

/** 接线锚点：接线柱帽正下方（导线真正夹持处） */
function termAnchor(c, tid) {
  const t = (TYPES[c.type] && TYPES[c.type].terminals.find((x) => x.id === tid)) || null
  return t ? { x: c.x + t.x, y: c.y + t.y + TERM_DROP } : null
}

function makeChain(ax, ay, bx, by) {
  const dist = Math.hypot(bx - ax, by - ay)
  // 留 30% 余量，容许下垂
  const seg = (dist * 1.3) / (WIRE_N - 1)
  const pts = []
  const prev = []
  for (let i = 0; i < WIRE_N; i++) {
    const t = i / (WIRE_N - 1)
    const x = ax + (bx - ax) * t
    const y = ay + (by - ay) * t + Math.sin(Math.PI * t) * Math.min(70, dist * 0.14)
    pts.push({ x, y })
    prev.push({ x, y })
  }
  return { pts, prev, seg }
}

function stepChain(ch, ax, ay, bx, by) {
  const n = ch.pts.length - 1
  // 两端钉在接线柱锚点
  ch.pts[0].x = ax; ch.pts[0].y = ay
  ch.prev[0].x = ax; ch.prev[0].y = ay
  ch.pts[n].x = bx; ch.pts[n].y = by
  ch.prev[n].x = bx; ch.prev[n].y = by
  // Verlet 积分（自由粒子）
  for (let i = 1; i < n; i++) {
    const p = ch.pts[i]
    const q = ch.prev[i]
    const vx = (p.x - q.x) * WIRE_DAMP
    const vy = (p.y - q.y) * WIRE_DAMP
    q.x = p.x
    q.y = p.y
    p.x += vx
    p.y += vy + WIRE_GRAV
  }
  // 距离约束松弛（两端固定）
  for (let k = 0; k < WIRE_ITER; k++) {
    for (let i = 0; i < n; i++) {
      const a = ch.pts[i]
      const b = ch.pts[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1e-6
      const diff = (len - ch.seg) / len
      const ox = dx * diff
      const oy = dy * diff
      const wa = i === 0 ? 0 : 1
      const wb = i + 1 === n ? 0 : 1
      const wsum = wa + wb
      if (!wsum) continue
      if (wa) { a.x += ox * (wa / wsum); a.y += oy * (wa / wsum) }
      if (wb) { b.x -= ox * (wb / wsum); b.y -= oy * (wb / wsum) }
    }
  }
}

function chainPath(ch) {
  let d = `M${ch.pts[0].x.toFixed(1)} ${ch.pts[0].y.toFixed(1)}`
  for (let i = 1; i < ch.pts.length; i++) d += ` L${ch.pts[i].x.toFixed(1)} ${ch.pts[i].y.toFixed(1)}`
  return d
}

/** 导线可选色 */
const WIRE_COLORS = [
  { key: 'red', label: '红', hex: '#e53935' },
  { key: 'green', label: '绿', hex: '#2e9e44' },
  { key: 'black', label: '黑', hex: '#1c1f24' },
]

const keyOf = (cid, tid) => cid + ':' + tid

export default function ElectricSvgLabScene() {
  const [comps, setComps] = useState([])
  const [wires, setWires] = useState([])
  const [selected, setSelected] = useState(null)   // {kind:'comp'|'wire', id}
  const [pending, setPending] = useState(null)     // {cid, tid}
  const [dissect, setDissect] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [ghost, setGhost] = useState(null)         // {type, x, y}
  const [toast, setToast] = useState('就绪')
  const [wireColor, setWireColor] = useState(WIRE_COLORS[0].hex)
  const uidRef = useRef(1)
  const dragRef = useRef(null)
  const lastUpRef = useRef(null)
  const compsRef = useRef([])
  const wiresRef = useRef([])
  const chainsRef = useRef(new Map())   // wireId → verlet chain
  const pathRefs = useRef(new Map())    // wireId → SVGPathElement
  const solvedRef = useRef(null)        // 最新求解结果（rAF 读取导线电流）
  const wireFxRef = useRef(new Map())   // wireId → dashoffset 累计值（电流动画）
  const previewChainRef = useRef(null)
  const previewPathRef = useRef(null)
  const previewTipRef = useRef(null)    // 拉线时的鼠标点
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  compsRef.current = comps
  wiresRef.current = wires

  /* ── 求解（comps/wires 变化即重算） ── */
  const solved = useMemo(() => solveCircuit(comps, wires), [comps, wires])
  const statusParts = useMemo(() => circuitStatus(comps, wires, solved), [comps, wires, solved])
  solvedRef.current = solved

  /* ── 保险丝过流熔断 → 持久写回元件状态（双击换新才恢复） ── */
  useEffect(() => {
    const blownIds = []
    for (const c of comps) {
      if (c.type === 'fuse' && !c.blown && solved[c.id] && solved[c.id]._blown) blownIds.push(c.id)
    }
    if (!blownIds.length) return
    const set = new Set(blownIds)
    setComps((cs) => cs.map((x) => (set.has(x.id) ? { ...x, blown: true } : x)))
  }, [solved, comps])

  /* ── 错误接法实时检测（solve 后）── */
  const warnings = useMemo(() => {
    const out = []
    for (const c of comps) {
      if (c.type !== 'rheostat') continue
      const wired = new Set()
      for (const w of wires) {
        if (w.a.startsWith(c.id + ':')) wired.add(w.a.split(':')[1])
        if (w.b.startsWith(c.id + ':')) wired.add(w.b.split(':')[1])
      }
      const mode = rheostatMode(wired)
      if (mode === 'short') out.push({ tone: 'bad', text: '滑动变阻器接了同上：短路' })
      if (mode === 'full-wire') out.push({ tone: 'warn', text: '同下：阻值最大且不可调' })
    }
    const d = solved.diagnostics || {}
    if (d.ammeterParallel) out.push({ tone: 'bad', text: '电流表必须串联' })
    if (d.voltmeterSeries) out.push({ tone: 'bad', text: '电压表必须并联' })
    if (d.short) out.push({ tone: 'bad', text: '短路！请立即断开电源' })
    return out
  }, [comps, wires, solved])
  const shorted = !!(solved.diagnostics && solved.diagnostics.short)

  /* 导线颜色：|I| ≥ 0.1A 按电流档位（热效应可视化），静止时保留所选导线色 */
  const wireStroke = (w) => {
    const I = Math.abs((solved._wireI && solved._wireI[w.id]) || 0)
    if (I < 0.1) return w.color || '#475569'
    if (I < 0.3) return '#f59e0b'
    return '#ef4444'
  }

  const nextId = () => uidRef.current++
  const T = (c) => TYPES[c.type]
  const termPos = (c, tid) => {
    const t = T(c).terminals.find((x) => x.id === tid)
    return t ? { x: c.x + t.x, y: c.y + t.y } : null
  }

  /* ── 元件增删 ── */
  const addComp = useCallback((type, x, y) => {
    const t = TYPES[type]
    const c = {
      id: uidRef.current++, type,
      x: Math.max(0, Math.min(CW - t.w, Math.round(x))),
      y: Math.max(0, Math.min(CH - t.h, Math.round(y))),
      closed: false, showRead: false, f: 0.4, rmax: CFG.RHEO_MAX,
    }
    if (type === 'switch2') c.pos = 0
    if (type === 'resBox') c.dials = [0, 0, 0, 0]
    if (type === 'multimeter') c.mode = 'V'
    setComps((cs) => cs.concat(c))
    return c
  }, [])

  const addWire = useCallback((ta, tb, color) => {
    if (ta.cid === tb.cid && ta.tid === tb.tid) return
    const a = keyOf(ta.cid, ta.tid), b = keyOf(tb.cid, tb.tid)
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

  const clearAll = useCallback(() => {
    setComps([]); setWires([]); setSelected(null); setPending(null); stopPreview()
    setToast('桌面已清空 —— 从左侧拖入元件重新开始')
  }, [])

  /* ── 示例电路（与源实验一致） ── */
  const loadDemo = useCallback(() => {
    const ids = {}
    const mk = (type, x, y, extra = {}) => {
      const t = TYPES[type]
      const c = {
        id: uidRef.current++, type, x, y,
        closed: false, showRead: false, f: 0.4, rmax: CFG.RHEO_MAX, ...extra,
      }
      ids[type] = c.id
      return c
    }
    const list = [
      mk('battery', 170, 540),
      mk('rheostat', 400, 492, { f: 0.15 }),
      mk('bulb', 600, 130),
      mk('ammeter', 330, 134),
      mk('switch', 150, 360, { closed: false }),
    ]
    const w = (ca, ta, cb, tb) => ({ id: uidRef.current++, a: keyOf(ca, ta), b: keyOf(cb, tb), color: WIRE_COLORS[2].hex })
    setComps(list)
    setWires([
      w(ids.battery, 'p', ids.rheostat, 'bl'),
      w(ids.rheostat, 'tr', ids.bulb, 'b'),
      w(ids.bulb, 'a', ids.ammeter, 'mid'),
      w(ids.ammeter, 'neg', ids.switch, 'b'),
      w(ids.switch, 'a', ids.battery, 'n'),
    ])
    setSelected(null); setPending(null); stopPreview()
    setToast('示例电路已就绪 —— 单击开关闭合电路，拖动变阻器滑片调亮度 🎛')
  }, [])

  // 首次进入自动载入示例电路
  useEffect(() => { loadDemo() }, [loadDemo])

  /* ── 交互：拖拽 / 连线 ── */
  const canvasPoint = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // 元件库拖出
  const onPaletteDown = (e, type) => {
    e.preventDefault()
    setGhost({ type, x: e.clientX, y: e.clientY })
    dragRef.current = { kind: 'new', type }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 接线柱：点击连线（pending → 点另一柱连通，再点同柱取消）
  const stopPreview = () => {
    previewChainRef.current = null
    previewTipRef.current = null
  }
  const onTermDown = (e, c, tid) => {
    e.preventDefault()
    e.stopPropagation()
    if (pending && !(pending.cid === c.id && pending.tid === tid)) {
      addWire(pending, { cid: c.id, tid }, wireColor)
      setPending(null); stopPreview()
      return
    }
    if (pending && pending.cid === c.id && pending.tid === tid) {
      setPending(null); stopPreview()
      return
    }
    setPending({ cid: c.id, tid })
    const p1 = termAnchor(c, tid)
    if (p1) {
      previewChainRef.current = makeChain(p1.x, p1.y, p1.x, p1.y - 20)
      previewTipRef.current = { from: { cid: c.id, tid }, tip: { x: p1.x, y: p1.y - 20 } }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 元件本体按下（拖动 / 滑片 / 开关）
  // 注意：这里不 preventDefault，否则 Chromium 会吞掉后续 dblclick（双击读电表）
  const onCompDown = (e, c) => {
    if (e.target.closest('.esvg-term')) return
    // 电阻箱拨盘：点击进位（0~9 循环），不触发拖动
    const dial = e.target.closest('[data-role="dial"]')
    if (c.type === 'resBox' && dial) {
      const i = +dial.dataset.i
      setComps((cs) => cs.map((x) => {
        if (x.id !== c.id) return x
        const dials = (Array.isArray(x.dials) ? x.dials : [0, 0, 0, 0]).slice()
        dials[i] = ((dials[i] | 0) + 1) % 10
        return { ...x, dials }
      }))
      e.stopPropagation()
      return
    }
    const slider = e.target.closest('.slider-handle')
    if (c.type === 'rheostat' && slider) {
      dragRef.current = { kind: 'slider', compId: c.id, startF: c.f ?? 0.4 }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }
    dragRef.current = {
      kind: 'move', compId: c.id,
      offx: e.clientX - canvasRef.current.getBoundingClientRect().left - c.x,
      offy: e.clientY - canvasRef.current.getBoundingClientRect().top - c.y,
      sx: e.clientX, sy: e.clientY, moved: false,
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onMove = (e) => {
    const d = dragRef.current
    if (d && d.kind === 'new') {
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g))
      return
    }
    if (d && d.kind === 'move') {
      const p = canvasPoint(e)
      setComps((cs) => cs.map((c) => {
        if (c.id !== d.compId) return c
        const t = T(c)
        return {
          ...c,
          x: Math.max(-10, Math.min(CW - t.w + 10, p.x - d.offx)),
          y: Math.max(-10, Math.min(CH - t.h + 10, p.y - d.offy)),
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
      if (previewTipRef.current) previewTipRef.current.tip = pt
    }
  }

  const onUp = (e) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const d = dragRef.current
    dragRef.current = null

    if (d && d.kind === 'new') {
      const sr = stageRef.current.getBoundingClientRect()
      if (e.clientX >= sr.left && e.clientX <= sr.right && e.clientY >= sr.top && e.clientY <= sr.bottom) {
        const t = TYPES[d.type]
        const p = canvasPoint(e)
        addComp(d.type, p.x - t.w / 2, p.y - t.h / 2)
      }
      setGhost(null)
      return
    }
    if (d && d.kind === 'move') {
      if (!d.moved) {
        const c = compsRef.current.find((x) => x.id === d.compId)
        // 轻点语义：开关=通断；电表=双击显读数；其余=选中/取消
        const now = performance.now()
        const last = lastUpRef.current
        const isDouble = !!(last && now - last.t < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 28)
        lastUpRef.current = { t: now, x: e.clientX, y: e.clientY }
        if (c && c.type === 'switch') {
          setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, closed: !x.closed } : x)))
          setSelected({ kind: 'comp', id: c.id })
        } else if (c && c.type === 'switch2') {
          // 单刀双掷：轻点刀闸切换掷点
          setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, pos: (x.pos ?? 0) === 1 ? 0 : 1 } : x)))
          setSelected({ kind: 'comp', id: c.id })
        } else if (c && c.type === 'multimeter' && isDouble) {
          const next = { V: 'A', A: 'Ω', 'Ω': 'V' }
          setComps((cs) => cs.map((x) => {
            if (x.id !== c.id) return x
            const cur = x.mode === 'A' || x.mode === 'Ω' ? x.mode : 'V'
            return { ...x, mode: next[cur] }
          }))
          setToast('多用电表档位已切换')
        } else if (c && c.type === 'fuse' && isDouble) {
          setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, blown: false } : x)))
          setToast('保险丝已换新')
        } else if (c && T(c).meter && isDouble) {
          setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, showRead: !x.showRead } : x)))
        } else {
          setSelected((s) => (s && s.kind === 'comp' && s.id === d.compId ? null : { kind: 'comp', id: d.compId }))
        }
      }
      return
    }
    // 拉线未点接线柱则丢弃预览（保留 pending，等待下次点击接线柱）
  }

  /* ── 键盘删除 ── */
  useEffect(() => {
    const kd = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!selected) return
      e.preventDefault()
      if (selected.kind === 'comp') { removeComp(selected.id); setSelected(null) }
      else { setWires((ws) => ws.filter((w) => w.id !== selected.id)); setSelected(null) }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [selected, removeComp])

  /* ── Verlet 粒子链逐帧松弛：导线随元件移动实时下垂；dashoffset 电流动画 ── */
  useEffect(() => {
    let raf
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const cs = compsRef.current
      const wireI = (solvedRef.current && solvedRef.current._wireI) || {}
      const fx = wireFxRef.current
      for (const w of wiresRef.current) {
        const ch = chainsRef.current.get(w.id)
        if (!ch) continue
        const c1 = cs.find((x) => x.id === +w.a.split(':')[0])
        const c2 = cs.find((x) => x.id === +w.b.split(':')[0])
        if (!c1 || !c2) continue
        const p1 = termAnchor(c1, w.a.split(':')[1])
        const p2 = termAnchor(c2, w.b.split(':')[1])
        if (!p1 || !p2) continue
        stepChain(ch, p1.x, p1.y, p2.x, p2.y)
        const rec = pathRefs.current.get(w.id)
        if (rec) {
          const d = chainPath(ch)
          if (rec.main) {
            rec.main.setAttribute('d', d)
            // 导线电流动画：speed = current * 200（px/s），I=0 静止，反向倒流
            const off = (fx.get(w.id) || 0) + (wireI[w.id] || 0) * 200 * dt
            fx.set(w.id, off)
            rec.main.setAttribute('stroke-dashoffset', off.toFixed(1))
          }
          if (rec.hit) rec.hit.setAttribute('d', d)
        }
      }
      // 拉线预览（钉住起点、尾随鼠标）
      const pc = previewChainRef.current
      if (pc && previewTipRef.current) {
        const from = previewTipRef.current.from
        const c = cs.find((x) => x.id === from.cid)
        const tip = previewTipRef.current.tip
        if (c && tip) {
          const p1 = termAnchor(c, from.tid)
          if (p1) {
            stepChain(pc, p1.x, p1.y, tip.x, tip.y)
            if (previewPathRef.current) previewPathRef.current.setAttribute('d', chainPath(pc))
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* ── 渲染 ── */
  const dynOf = (c) => {
    const o = solved[c.id] || {}
    if (c.type === 'bulb') return { bright: o._P > 0 ? Math.min(1, o._P / CFG.BULB_RATED) : 0 }
    if (c.type === 'ammeter') return { frac: Math.abs(o._I || 0) / (o._fs || CFG.AMM_FS) }
    if (c.type === 'voltmeter') return { frac: Math.abs(o._V || 0) / (o._fs || CFG.VOLT_FS) }
    if (c.type === 'rheostat') {
      // 有效电阻丝高亮：按实际接入的两个接线柱判定 mode
      const wired = new Set()
      for (const w of wires) {
        if (w.a.startsWith(c.id + ':')) wired.add(w.a.split(':')[1])
        if (w.b.startsWith(c.id + ':')) wired.add(w.b.split(':')[1])
      }
      return { mode: rheostatMode(wired) }
    }
    if (c.type === 'motor') return { I: o._I || 0 }
    if (c.type === 'diode') return { on: !!o._on, rev: !o._on && (o._Vd || 0) < -0.3 }
    if (c.type === 'fuse') return { blown: !!o._blown, I: o._I || 0 }
    if (c.type === 'testPencil') return { glow: !!o._glow }
    if (c.type === 'electroscope') return { angle: Math.max(0, Math.min(1, (o._V || 0) / 8)) }
    if (c.type === 'relay') return { pulled: !!o._pulled }
    if (c.type === 'multimeter') {
      const mode = c.mode === 'A' || c.mode === 'Ω' ? c.mode : 'V'
      return { value: mode === 'A' ? o._I : mode === 'Ω' ? o._R : o._V }
    }
    return {}
  }
  const readoutOf = (c) => {
    const o = solved[c.id] || {}
    if (c.type === 'ammeter') {
      const num = Math.abs(o._I || 0) < 0.0005 ? '0.000' : Math.abs(o._I || 0).toFixed(3)
      return { text: `I = ${num} A`, color: o._over ? '#fb7185' : o._rev ? '#fbbf24' : '#4ade80' }
    }
    if (c.type === 'voltmeter') {
      const num = Math.abs(o._V || 0) < 0.0005 ? '0.000' : Math.abs(o._V || 0).toFixed(3)
      return { text: `U = ${num} V`, color: o._over ? '#fb7185' : o._rev ? '#fbbf24' : '#4ade80' }
    }
    if (c.type === 'resBox') {
      return { text: `R = ${(o._R ?? 0).toFixed(1)} Ω`, color: '#4ade80' }
    }
    return null
  }

  const compById = (id) => comps.find((c) => c.id === id)

  /* ── 导线粒子链的 DOM 引用管理 ── */
  const attachPath = useCallback((id, kind, el) => {
    if (!pathRefs.current.has(id)) pathRefs.current.set(id, {})
    const rec = pathRefs.current.get(id)
    if (el) {
      rec[kind] = el
      if (!chainsRef.current.has(id)) {
        const w = wiresRef.current.find((x) => x.id === id)
        if (w) {
          const c1 = compsRef.current.find((x) => x.id === +w.a.split(':')[0])
          const c2 = compsRef.current.find((x) => x.id === +w.b.split(':')[0])
          if (c1 && c2) {
            const p1 = termAnchor(c1, w.a.split(':')[1])
            const p2 = termAnchor(c2, w.b.split(':')[1])
            if (p1 && p2) chainsRef.current.set(id, makeChain(p1.x, p1.y, p2.x, p2.y))
          }
        }
      }
    } else {
      delete rec[kind]
      if (!rec.main && !rec.hit) {
        pathRefs.current.delete(id)
        chainsRef.current.delete(id)
      }
    }
  }, [])

  return (
    <div className="esvg-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div dangerouslySetInnerHTML={{ __html: SVG_DEFS }} />

      <header className="esvg-topbar">
        <div className="esvg-brand">
          <div className="logo">⚡</div>
          <h1>初中物理 · 电学虚拟实验室</h1>
        </div>
        <div className="esvg-tools">
          {/* 导线颜色：红 / 绿 / 黑（选中导线时同步改色） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>导线</span>
            {WIRE_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                title={`${c.label}色导线`}
                onClick={() => {
                  setWireColor(c.hex)
                  if (selected && selected.kind === 'wire') {
                    setWires((ws) => ws.map((w) => (w.id === selected.id ? { ...w, color: c.hex } : w)))
                  }
                }}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c.hex, cursor: 'pointer',
                  border: wireColor === c.hex ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
                  padding: 0,
                }}
              />
            ))}
          </div>
          <button type="button" className={`btn${dissect ? ' on' : ''}`} onClick={() => setDissect((d) => !d)}>
            {dissect ? '🔍 内部结构（开）' : '🔍 内部结构'}
          </button>
          <button type="button" className="btn" onClick={loadDemo}>🧪 示例电路</button>
          <button type="button" className="btn" onClick={clearAll}>🗑 清空桌面</button>
          <button type="button" className="btn" onClick={() => setHelpOpen(true)}>❓ 操作说明</button>
        </div>
      </header>

      <div className="esvg-body">
        <aside className="esvg-palette">
          <div className="esvg-ptitle">元 件 库</div>
          {PALETTE_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="esvg-pgroup">{g.title}</div>
              {g.keys.filter((type) => TYPES[type]).map((type) => (
                <div
                  key={type}
                  className="esvg-pitem"
                  onPointerDown={(e) => onPaletteDown(e, type)}
                  title={`按住拖到桌面：${TYPES[type].label}`}
                >
                  <span dangerouslySetInnerHTML={{ __html: PALETTE_ICONS[type] || '' }} />
                  <span>{TYPES[type].label}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="esvg-ptip">
            按住元件拖到桌面<br />
            点击接线柱 → 再点另一个<br />
            即可自动连线<br />
            双击电表显示读数<br />
            双击开关/表切换档位<br />
            点击电阻箱拨盘换挡
          </div>
        </aside>

        <main className="esvg-stage" ref={stageRef}>
          <div className={`esvg-canvas${dissect ? ' dissect' : ''}`} ref={canvasRef}>
            {/* 导线层（Verlet 粒子链 + 电流动画） */}
            <svg className={`esvg-wirelayer${shorted ? ' short' : ''}`} width={CW} height={CH}>
              {wires.map((w) => {
                const c1 = compById(+w.a.split(':')[0])
                const c2 = compById(+w.b.split(':')[0])
                if (!c1 || !c2) return null
                const p1 = termAnchor(c1, w.a.split(':')[1])
                const p2 = termAnchor(c2, w.b.split(':')[1])
                if (!p1 || !p2) return null
                const sel = selected && selected.kind === 'wire' && selected.id === w.id
                const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
                const d0 = `M${p1.x} ${p1.y} L${p2.x} ${p2.y}`
                return (
                  <g key={w.id}>
                    {/* 命中区（粗描边，便于点选；选中时作为光晕） */}
                    <path
                      ref={(el) => attachPath(w.id, 'hit', el)}
                      d={d0}
                      fill="none" stroke={sel ? 'rgba(225,29,72,0.35)' : 'transparent'} strokeWidth={sel ? 16 : 18} strokeLinecap="round"
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onClick={() => setSelected({ kind: 'wire', id: w.id })}
                    />
                    {/* 可见导线（Verlet 粒子链，电流动画/热色） */}
                    <path
                      ref={(el) => attachPath(w.id, 'main', el)}
                      d={d0}
                      className={`esvg-wire${Math.abs((solved._wireI && solved._wireI[w.id]) || 0) > 1 ? ' flash' : ''}`}
                      style={{ stroke: shorted ? '#dc2626' : wireStroke(w) }}
                    />
                    {sel && (
                      <g>
                        <circle cx={m.x} cy={m.y} r="9" fill="#e11d48" opacity="0.95" />
                        <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">✕</text>
                        <circle
                          cx={m.x} cy={m.y} r="14" fill="transparent"
                          style={{ pointerEvents: 'fill', cursor: 'pointer' }}
                          onClick={() => { setWires((ws) => ws.filter((x) => x.id !== w.id)); setSelected(null) }}
                        />
                      </g>
                    )}
                  </g>
                )
              })}
              {pending && (
                <path ref={previewPathRef} className="esvg-wire-preview" />
              )}
            </svg>

            {/* 元件层 */}
            <div className="esvg-partlayer">
              {comps.map((c) => {
                const t = T(c)
                const dyn = dynOf(c)
                const ro = readoutOf(c)
                const isSel = selected && selected.kind === 'comp' && selected.id === c.id
                return (
                  <div
                    key={c.id}
                    data-type={c.type}
                    data-id={c.id}
                    className={`esvg-comp${isSel ? ' selected' : ''}`}
                    style={{ left: c.x, top: c.y, width: t.w, height: t.h }}
                    onPointerDown={(e) => onCompDown(e, c)}
                  >
                    <div className="boxhl" />
                    <div dangerouslySetInnerHTML={{ __html: t.render(c, dyn) }} />
                    {t.terminals.map((tm) => (
                      <div
                        key={tm.id}
                        className={`esvg-term${pending && pending.cid === c.id && pending.tid === tm.id ? ' active' : ''}`}
                        title={tm.name}
                        style={{ left: tm.x - 9, top: tm.y - 9 }}
                        onPointerDown={(e) => onTermDown(e, c, tm.id)}
                      >
                        <span>{tm.label || ''}</span>
                      </div>
                    ))}
                    {t.meter && ro && (
                      <div
                        className="esvg-readout"
                        style={{ opacity: c.showRead ? 1 : 0, color: ro.color }}
                      >{ro.text}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </div>

      <footer className="esvg-statusbar">
        {statusParts.map((p, i) => (
          <span key={i}>
            {i > 0 && <span className="sep"> │ </span>}
            <span className={p.tone || ''}>{p.text}</span>
            {p.tone2 && (() => {
              const [tone, txt] = p.tone2.split(':')
              return <> <span className={tone}>{txt}</span></>
            })()}
          </span>
        ))}
        {warnings.map((p, i) => (
          <span key={`w${i}`}>
            <span className="sep"> │ </span>
            <span className={p.tone}>{p.text}</span>
          </span>
        ))}
        {toast && !statusParts.length && !warnings.length && <span>{toast}</span>}
      </footer>

      {ghost && (
        <div className="esvg-ghost" style={{ left: ghost.x, top: ghost.y }}>{TYPES[ghost.type].label}</div>
      )}

      {helpOpen && (
        <div className="esvg-modal" onClick={(e) => { if (e.target === e.currentTarget) setHelpOpen(false) }}>
          <div className="esvg-card">
            <button type="button" className="close" onClick={() => setHelpOpen(false)}>✕</button>
            <h2>操作说明</h2>
            <ul>
              <li><b>添加元件</b>：从左侧「元件库」按住元件，拖到桌面上松手。</li>
              <li><b>移动元件</b>：按住元件本体拖动（导线会自动跟随）。</li>
              <li><b>连线</b>：点击一个接线柱（变黄），再点击另一个接线柱，自动生成导线。</li>
              <li><b>删线</b>：单击导线选中，点红色「✕」；或选中后按 Delete 键。</li>
              <li><b>删元件</b>：单击元件选中（虚线框），按 Delete 键。</li>
              <li><b>闭合开关</b>：单击开关即可闭合／断开，灯泡随电路通断而亮灭。</li>
              <li><b>调亮度</b>：拖动滑动变阻器上的橙色滑片，改变接入电阻，观察灯泡亮度变化。</li>
              <li><b>读电表</b>：双击电流表／电压表／电阻箱，显示或隐藏读数（红表针会同步偏转）。</li>
              <li><b>单刀双掷</b>：轻点开关，刀闸在掷点 A / B 之间切换。</li>
              <li><b>多用电表</b>：双击切换电压 / 电流 / 欧姆档，表盘 LCD 显示读数。</li>
              <li><b>保险丝</b>：电流超过额定值时熔丝中间熔断、电路断路；双击保险丝换新。</li>
              <li><b>电阻箱</b>：点击拨盘（×1k / ×100 / ×10 / ×1）进位，读数实时变化。</li>
              <li><b>看内部</b>：点顶部「内部结构」，剖视显示各元件内部构造（碳棒、锌筒、灯丝、线圈、电阻丝…）。</li>
            </ul>
            <ul>
              <li>电池组 3V（内阻 0.1Ω） · 小灯泡 5Ω（额定 3V / 1.8W） · 家庭电源 220V</li>
              <li>定值电阻 5Ω / 10Ω / 15Ω（色环标识） · 小电动机线圈 4Ω · 二极管导通压降 2V</li>
              <li>电流表内阻 0.01Ω（量程 0.6A） · 电压表内阻 10MΩ（量程 3V）</li>
              <li>滑动变阻器最大阻值 10Ω，接线采用「一上一下」原则。</li>
              <li>保险丝额定熔断电流 0.5A · 测电笔氖管起辉电压 30V · 继电器吸合电流 50mA。</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
