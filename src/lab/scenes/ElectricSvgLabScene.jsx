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
import { TYPES, RHEO_TRACK, figURL, rheostatMode } from './electricSvgInstruments.js'
import { wireCurve, curveD, curveMid, wireLayers, wrapLayers } from '../render/wireSvg.js'
import { createLabRenderer } from '../lab3d/three-render.js'
import { renderIcon, SOLID_TYPES } from '../lab3d/solidEquipment.js'

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
/* 操作说明挪到左上、紧贴标题（用户要求：不要挤在右上角一排按钮尾巴上） */
.esvg-help{margin-left:14px;padding:6px 11px;font-size:12.5px;border-radius:8px;cursor:pointer;
  border:1px solid rgba(148,163,184,.45);background:rgba(148,163,184,.14);color:#e2e8f0;
  font-family:inherit;transition:.18s;white-space:nowrap}
.esvg-help:hover{background:rgba(56,189,248,.22);border-color:#38bdf8;color:#e0f2fe}
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
/* 3D 模式下的元件库：收窄成竖排小牌，图标做等轴透视 + 投影。
   一来 2D SVG 图标不再是平板贴纸的观感，二来给 3D 画布腾出横向空间。 */
.esvg-palette.is3d{width:98px;flex:0 0 98px;padding:9px 6px;
  background:linear-gradient(#f6f9fd,#e9f0f9)}
.esvg-palette.is3d .esvg-pitem{flex-direction:column;gap:3px;padding:6px 4px;margin-bottom:6px;
  border-radius:9px;background:linear-gradient(#ffffff,#eff4fa);
  box-shadow:0 3px 6px rgba(15,23,42,.10),inset 0 1px 0 #fff}
.esvg-palette.is3d .esvg-pitem > span:first-child{display:flex;align-items:flex-end;
  justify-content:center;height:34px;
  transform:perspective(180px) rotateX(26deg);transform-origin:50% 100%;
  filter:drop-shadow(0 4px 3px rgba(15,23,42,.22))}
.esvg-palette.is3d .esvg-pitem svg{width:52px;height:32px}
/* 3D 模式：元件库图标直接用实体渲染出的透明底贴图 */
.esvg-palette.is3d .esvg-pitem > span:first-child img{width:58px;height:44px;object-fit:contain;
  transform:none;filter:drop-shadow(0 3px 3px rgba(15,23,42,.18))}
.esvg-palette.is3d .esvg-pitem > span:first-child:has(img){transform:none}
.esvg-palette.is3d .esvg-pitem > span:last-child{font-size:10.5px;line-height:1.2;text-align:center}
.esvg-palette.is3d .esvg-ptip{font-size:10px;line-height:1.5}
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
/* 3D 读数浮层：双击电表后贴在画面右上，直接给数字（对标"双击查看读数"） */
.esvg-3d-readout{position:absolute;top:24px;right:24px;z-index:20;min-width:168px;
  display:flex;flex-direction:column;gap:5px;padding:9px 11px;border-radius:10px;
  background:rgba(15,23,42,.84);border:1px solid rgba(148,163,184,.35);
  box-shadow:0 8px 20px rgba(2,6,23,.4);backdrop-filter:blur(4px);
  font-size:13px;color:#e2e8f0;pointer-events:none}
.esvg-3d-readout .row{display:flex;justify-content:space-between;gap:12px}
.esvg-3d-readout .name{color:#94a3b8}
.esvg-3d-readout .val{font-weight:600;font-variant-numeric:tabular-nums}
.esvg-3d-readout .hint{margin-top:2px;font-size:11px;color:#64748b;text-align:right}
/* 选中器材后的操作条：读数 / 拆开看内部（比双击更可发现） */
.esvg-3d-actions{position:absolute;right:24px;bottom:24px;z-index:21;display:flex;gap:8px}
.esvg-3d-actions button{padding:7px 12px;border-radius:8px;border:1px solid rgba(148,163,184,.45);
  background:rgba(15,23,42,.86);color:#e2e8f0;font-size:12.5px;cursor:pointer;
  box-shadow:0 6px 16px rgba(2,6,23,.35)}
.esvg-3d-actions button:hover{background:rgba(30,41,59,.95);border-color:#64748b}
/* 导线层压在器材底板之上：这些器材都是平放的板/台，真导线是摆在板面上、绕到柱脚的，
   若把线画在器材后面，线就会被板子"切断"，看着像从底座里穿过去。
   （仪表这类立起来的件会压住经过的线，但本场景里它们都摆在导线之外，不影响） */
.esvg-wirelayer{position:absolute;inset:0;pointer-events:none;z-index:3}
/* 端头层：裸铜丝绕柱这件事要压在导线之上，否则导线把铜丝盖一半，就看不出"绕在柱子上"。 */
.esvg-wiretop{position:absolute;inset:0;pointer-events:none;z-index:6}
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
.esvg-wire-preview{fill:none;stroke:#f59e0b;stroke-width:3.6;stroke-linecap:round;opacity:0.9}
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
/* 内部结构层里的虚线/色块只是剖视标注（统一用 #2563eb/#1d4ed8 描边或填充）。
   底图都有透明区（器材下方的柔和投影、板下缘之外），不剖视时这些标注会从那片透明区透出来，
   看着像器材边上多出一条淡色圆角条/蓝虚线。这里按颜色把它们关掉，真正的内部零件（暗色实体）不受影响。 */
.esvg-canvas:not(.dissect) .inner [stroke="#2563eb"],
.esvg-canvas:not(.dissect) .inner [stroke="#1d4ed8"],
.esvg-canvas:not(.dissect) .inner [fill="#2563eb"],
.esvg-canvas:not(.dissect) .ann{display:none}
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
  battery: `<img src="${figURL('battery_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  accumulator: `<img src="${figURL('accumulator_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  bulb: `<img src="${figURL('bulb_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  switch: (() => {
    // 开关已改为矢量绘制（不再用被掏空的 switch_c.png 照片），器件栏缩略图也直接用矢量件
    const s = TYPES.switch.render({ id: 'pal-switch', closed: false, showRead: false })
    return s.replace('width="176" height="110"', 'width="42" height="26"')
  })(),
  ammeter: `<img src="${figURL('ammeter_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  ammeterA: `<img src="${figURL('ammeterA_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  voltmeter: `<img src="${figURL('voltmeter_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  rheostat: `<img src="${figURL('rheostat_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
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
  motor: `<img src="${figURL('motor_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  diode: `
<svg viewBox="0 0 42 26" style="width:42px;height:26px">
  <path d="M4 20 H13 M29 20 H38" stroke="#d98a3d" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M15 20 V12 A6 7 0 0 1 27 12 V20 Z" fill="#e8763a" stroke="#c25a12"/>
  <rect x="13" y="18" width="16" height="4" rx="1.5" fill="#9aa3ad"/>
</svg>`,
  fuse: `<img src="${figURL('fuse_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
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
  resBox: `<img src="${figURL('resbox_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
  multimeter: `<img src="${figURL('multimeter_c.png')}" alt="" style="width:42px;height:42px;object-fit:contain"/>`,
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
  { title: '基础器材', keys: ['battery', 'accumulator', 'bulb', 'switch', 'ammeter', 'ammeterA', 'voltmeter', 'rheostat'] },
  { title: '初中必做实验', keys: ['resistor5', 'resistor10', 'resistor15', 'switch2', 'motor', 'diode', 'jouleTube'] },
  { title: '家庭电路', keys: ['mains', 'energyMeter', 'fuse', 'testPencil', 'electroscope'] },
  { title: '高中拓展', keys: ['resBox', 'multimeter', 'relay'] },
]

/* =======================  连续软电线（贝塞尔电缆）  =======================
 * 曾经的 Verlet 粒子链靠重力松弛定形：会坠成圆底袋，还得画成点状才看得出松紧——不像真导线。
 * 现在一根三次贝塞尔：从接线柱先横向出线（像导线从柱脚拔出那样先离开器材），再横过去落到另一柱；
 * 控制点只有水平伸展 + 纵向小幅抖动（由 wire id 稳定决定），所以不下垂、每根又都不一样。
 * 外观沿用 render/wire.js：落影 → 外皮 → 本色 → 上偏高光 → 两端护套。
 */
const TERM_DROP = 7        // 锚点下移：接在柱帽正下方的柱身处
const WIRE_W = 4.6

/** 接线锚点：接线柱帽正下方（导线真正夹持处） */
function termAnchor(c, tid) {
  const t = (TYPES[c.type] && TYPES[c.type].terminals.find((x) => x.id === tid)) || null
  return t ? { x: c.x + t.x, y: c.y + t.y + TERM_DROP } : null
}

/** 出线方向：接线柱在器材左半 → 向左拔出，右半 → 向右 */
function wireOut(c, tid) {
  const t = (TYPES[c.type] && TYPES[c.type].terminals.find((x) => x.id === tid)) || null
  if (!t) return 1
  return t.x < (TYPES[c.type].w || 0) / 2 ? -1 : 1
}

/** 一根导线的曲线（p1/p2 为柱脚锚点） */
function wireGeom(c1, tid1, c2, tid2, seed) {
  const p1 = termAnchor(c1, tid1)
  const p2 = termAnchor(c2, tid2)
  if (!p1 || !p2) return null
  const cur = wireCurve(p1, p2, wireOut(c1, tid1), wireOut(c2, tid2), seed)
  return { p1, p2, cur, mid: curveMid(cur) }
}

/** 导线可选色 */
const WIRE_COLORS = [
  { key: 'red', label: '红', hex: '#e53935' },
  { key: 'green', label: '绿', hex: '#2e9e44' },
  { key: 'black', label: '黑', hex: '#1c1f24' },
]

const keyOf = (cid, tid) => cid + ':' + tid

/** 3D 读数浮层里的表名 */
const METER_NAME = {
  ammeter: '电流表',
  ammeterA: '安培表',
  voltmeter: '电压表',
  energyMeter: '电能表',
  multimeter: '多用电表',
}

export default function ElectricSvgLabScene() {
  const [comps, setComps] = useState([])
  const [wires, setWires] = useState([])
  const [selected, setSelected] = useState(null)   // {kind:'comp'|'wire', id}
  const [pending, setPending] = useState(null)     // {cid, tid}
  const [dissect, setDissect] = useState(false)
  const [readAll, setReadAll] = useState(false)   // 顶部"🔢 读数"：所有电表读数常显（不依赖双击）
  const [helpOpen, setHelpOpen] = useState(false)
  const [ghost, setGhost] = useState(null)         // {type, x, y}
  const [toast, setToast] = useState('就绪')
  const [wireColor, setWireColor] = useState(WIRE_COLORS[0].hex)
  const [view3d, setView3d] = useState(false)  // false=平面画布，true=3D 实验台（交互验收通过前默认 2D）
  const [icon3d, setIcon3d] = useState({})     // 3D 模式下的元件库图标（实体渲染出的 dataURL）
  const uidRef = useRef(1)
  const dragRef = useRef(null)
  const lastUpRef = useRef(null)
  const compsRef = useRef([])
  const wiresRef = useRef([])
  const solvedRef = useRef(null)        // 最新求解结果（rAF 读电流/功率）
  const meterKwhRef = useRef({})        // 电能表 id → 累计电量（kW·h）
  const meterAccRef = useRef(0)         // 计数器刷新节流（秒）
  const [meterTick, setMeterTick] = useState(0) // 每秒触发一次重渲染，刷新计数器读数
  void meterTick
  const jouleHeatRef = useRef({})       // U 形管 id → { q1, q2 } 累计焦耳热（J）
  const jouleAccRef = useRef(0)         // 液柱刷新节流（秒）
  const [jouleTick, setJouleTick] = useState(0) // 0.25s 触发一次重渲染，刷新液柱高度
  void jouleTick
  const previewPathRef = useRef(null)
  const previewTipRef = useRef(null)    // 拉线时的鼠标点
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const lab3dRef = useRef(null)          // 3D 实验台容器（view3d 时挂载）
  const labApiRef = useRef(null)         // createLabRenderer 实例
  const handlersRef = useRef({})         // 3D 回调转发目标（始终持有最新闭包）
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
    for (const x of solved._va || []) {
      out.push({
        tone: 'warn',
        text: x.mode === 'internal'
          ? `内接法：R测偏大 ${x.errorPct.toFixed(2)}%（含电流表内阻）`
          : `外接法：R测偏小 ${Math.abs(x.errorPct).toFixed(3)}%（电压表分流）`,
      })
    }
    if (d.short) out.push({ tone: 'bad', text: '短路！请立即断开电源' })
    return out
  }, [comps, wires, solved])

  /* 导线颜色：永远是用户选的那一种。真实电线不会因为电流大小改颜色，
     电流的大小由电流表读数 / 灯泡亮度 / 状态栏表达，别往线上去涂。 */
  const wireStroke = (w) => w.color || '#475569'

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

  // 3D 回调转发：渲染器只在挂载时捕获一次回调，经此转发保证永远拿到最新闭包
  handlersRef.current = { addWire }

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
    const w = (ca, ta, cb, tb) => ({ id: uidRef.current++, a: keyOf(ca, ta), b: keyOf(cb, tb), color: WIRE_COLORS[0].hex })
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
    previewTipRef.current = null
    if (previewPathRef.current) previewPathRef.current.setAttribute('d', '')
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
    if (p1) previewTipRef.current = { from: { cid: c.id, tid }, tip: { x: p1.x + wireOut(c, tid) * 20, y: p1.y - 60 } }
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
      const st = previewTipRef.current
      if (st) {
        st.tip = pt
        const c = compsRef.current.find((x) => x.id === st.from.cid)
        const p1 = c ? termAnchor(c, st.from.tid) : null
        if (p1 && previewPathRef.current) {
          previewPathRef.current.setAttribute('d', curveD(wireCurve(p1, pt, wireOut(c, st.from.tid), p1.x < pt.x ? -1 : 1, 7)))
        }
      }
    }
  }

  /* ── 轻点语义（2D 画布与 3D 实验台共用同一份实现） ──
     开关=通断；单刀双掷=换掷；电表/保险丝/多用电表=双击切换；其余=选中/取消 */
  const tapComp = useCallback((c, isDouble) => {
    if (!c) return
    if (c.type === 'switch') {
      setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, closed: !x.closed } : x)))
      setSelected({ kind: 'comp', id: c.id })
    } else if (c.type === 'switch2') {
      // 单刀双掷：轻点刀闸切换掷点
      setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, pos: (x.pos ?? 0) === 1 ? 0 : 1 } : x)))
      setSelected({ kind: 'comp', id: c.id })
    } else if (c.type === 'multimeter' && isDouble) {
      const next = { V: 'A', A: 'Ω', 'Ω': 'V' }
      setComps((cs) => cs.map((x) => {
        if (x.id !== c.id) return x
        const cur = x.mode === 'A' || x.mode === 'Ω' ? x.mode : 'V'
        return { ...x, mode: next[cur] }
      }))
      setToast('多用电表档位已切换')
    } else if (c.type === 'fuse' && isDouble) {
      setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, blown: false } : x)))
      setToast('保险丝已换新')
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

    if (d && d.kind === 'new') {
      const sr = stageRef.current.getBoundingClientRect()
      if (e.clientX >= sr.left && e.clientX <= sr.right && e.clientY >= sr.top && e.clientY <= sr.bottom) {
        const t = TYPES[d.type]
        // 3D 台面：射线换算到 2D 画布坐标（clientToCanvasXY）；平面画布：直接取画布坐标
        const p = labApiRef.current
          ? labApiRef.current.clientToCanvasXY(e.clientX, e.clientY)
          : (canvasRef.current ? canvasPoint(e) : null)
        if (p) addComp(d.type, p.x - t.w / 2, p.y - t.h / 2)
      }
      setGhost(null)
      return
    }
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

  /* ── 3D 元件库图标：进 3D 时把 6 类核心器材离屏渲染成透明底贴图 ── */
  useEffect(() => {
    if (!view3d || Object.keys(icon3d).length) return undefined
    let alive = true
    const map = {}
    for (const type of SOLID_TYPES) {
      const t = TYPES[type]
      if (!t) continue
      try {
        map[type] = renderIcon(type, { w: t.w, h: t.h, terminals: t.terminals, fs: t.fs })
      } catch (e) {
        console.warn('[lab3d] 图标渲染失败：', type, e)
      }
    }
    if (alive) setIcon3d(map)
    return () => { alive = false }
  }, [view3d, icon3d])

  /* ── 3D 实验台：挂载 / 卸载（createLabRenderer 只在切入 3D 时创建一次） ── */
  useEffect(() => {
    if (!view3d) return undefined
    const container = lab3dRef.current
    if (!container) return undefined
    let api
    try {
      api = createLabRenderer(container, {
        TYPES,
        CW,
        CH,
        bulbRated: CFG.BULB_RATED,
        wireColor: WIRE_COLORS[0].hex,
        // 器材拖动：回写 2D 坐标（与平面画布共享同一份 comps 状态，req 8）
        onCompMove: (id, x, y) => setComps((cs) => cs.map((c) => {
          if (c.id !== id) return c
          const t = TYPES[c.type]
          return {
            ...c,
            x: Math.max(-10, Math.min(CW - t.w + 10, Math.round(x))),
            y: Math.max(-10, Math.min(CH - t.h + 10, Math.round(y))),
          }
        })),
        // Shift 拖动：绕竖直 Y 自转（存 c.rot，2D 渲染忽略该字段）
        onCompRotate: (id, rot) => setComps((cs) => cs.map((c) => (c.id === id ? { ...c, rot } : c))),
        // 选中联动：3D OutlinePass ↔ 2D selected
        onSelect: (sel) => setSelected(sel),
        // 接线完成：'cid:tid' 键与场景 wires 键格式完全一致（req 6 保留接线语义）
        onWireConnect: (a, b) => {
          const [ca, ta] = a.split(':')
          const [cb, tb] = b.split(':')
          handlersRef.current.addWire({ cid: +ca, tid: ta }, { cid: +cb, tid: tb })
        },
        onWireDelete: (id) => setWires((ws) => ws.filter((w) => w.id !== id)),
        // 选中器材后按 Delete/Backspace：删掉这件器材和挂在上面的导线
        onDeleteComp: (id) => {
          setComps((cs) => cs.filter((c) => c.id !== id))
          setWires((ws) => ws.filter((w) => !w.a.startsWith(id + ':') && !w.b.startsWith(id + ':')))
          setSelected(null)
          setToast('已删除选中的器材')
        },
        // 轻点开关 → 通断（复用 2D 同一份 tapComp）
        onSwitch: (id) => {
          const c = compsRef.current.find((x) => x.id === id)
          if (c) tapComp(c, false)
        },
        // 拖滑片 → 连续更新 f（只改状态，几何重建交给 stateKey 分层）
        onSlider: (id, f) => setComps((cs) => cs.map((c) => (c.id === id ? { ...c, f } : c))),
        // 双击表盘 → 切换读数（复用 2D 同一份 tapComp）
        onMeterRead: (id) => {
          const c = compsRef.current.find((x) => x.id === id)
          if (c) tapComp(c, true)
        },
        // 双击非表器材 → 已单独拆开该件（3D 内部已切好剖视，这里只给一条反馈）
        onDissectComp: () => setToast('已拆开这件器材，再双击可还原'),
        // 滑变电阻丝轨道（与 2D RHEO_TRACK 同一常量）
        rheoTrack: RHEO_TRACK,
        // 滑变当前接法 → 3D 贴图的「有效电阻丝高亮」（与 2D 的 dynOf 同一定义）
        rheoModeOf: (id) => {
          const wired = new Set()
          for (const w of wiresRef.current) {
            if (w.a.startsWith(id + ':')) wired.add(w.a.split(':')[1])
            if (w.b.startsWith(id + ':')) wired.add(w.b.split(':')[1])
          }
          return rheostatMode(wired)
        },
      })
    } catch (err) {
      // WebGL 不可用等初始化失败：回退平面画布，不阻断实验
      console.warn('[lab3d] 初始化失败，回退平面画布：', err)
      setToast('3D 实验台初始化失败（WebGL 不可用），已回退平面画布')
      setView3d(false)
      return undefined
    }
    labApiRef.current = api
    return () => {
      api.dispose()
      labApiRef.current = null
    }
  }, [view3d])

  /* ── comps/wires/solved → 3D 同步（求解输出驱动指针角度与灯泡亮度，req 8） ── */
  useEffect(() => {
    if (!labApiRef.current) return
    labApiRef.current.sync({ comps, wires, solved })
  }, [comps, wires, solved, view3d])

  /* ── 剖视联动：dissect → X-ray（外壳半透明 + 显示 inner，再次点击恢复，req 7） ── */
  useEffect(() => {
    labApiRef.current?.setXray(dissect)
  }, [dissect, view3d])

  /* ── 导线颜色联动：色块改动要同步给 3D（否则 3D 里新建的线永远是初始红色） ── */
  useEffect(() => {
    labApiRef.current?.setWireColor?.(wireColor)
  }, [wireColor, view3d])

  /* ── 选中联动：selected → OutlinePass 高亮轮廓（req 10） ── */
  useEffect(() => {
    labApiRef.current?.setSelection(selected)
  }, [selected, view3d])

  /* ── 逐帧计量（电能表 / 焦耳管）：导线几何已是静态贝塞尔，不再逐帧松弛 ── */
  useEffect(() => {
    let raf
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const cs = compsRef.current

      // ── 电能表计量：按负载总功率积分；转盘由 SVG 自转，计数器每秒刷一次 ──
      const sv = solvedRef.current
      if (sv) {
        const meters = cs.filter((x) => x.type === 'energyMeter')
        if (meters.length) {
          let pTot = 0
          for (const k in sv) {
            if (k === 'diagnostics') continue
            if (k[0] === '_') continue // _wireI / _va 等非元件字段
            pTot += sv[k]?._P || 0
          }
          const km = meterKwhRef.current
          let moved = false
          for (const m of meters) {
            if (km[m.id] === undefined) km[m.id] = Number(m.kwh0) || 0
            const I = Math.abs(sv[m.id]?._I || 0)
            if (I > 1e-4) {
              km[m.id] += (pTot * dt) / 3.6e6 // W·s → kW·h
              moved = true
            }
          }
          meterAccRef.current += dt
          if (moved && meterAccRef.current >= 1) {
            meterAccRef.current = 0
            setMeterTick((t) => t + 1)
          }
        }

        // ── 焦耳定律 U 形管：按 Q = I²Rt 逐侧积分，液柱高度由热量换算 ──
        const tubes = cs.filter((x) => x.type === 'jouleTube')
        if (tubes.length) {
          const qj = jouleHeatRef.current
          let heating = false
          for (const t of tubes) {
            if (!qj[t.id]) qj[t.id] = { q1: 0, q2: 0 }
            const rec = qj[t.id]
            const I = Math.abs(sv[t.id]?._I || 0)
            if (I > 1e-4) {
              rec.q1 += I * I * CFG.JOULE_R1 * dt
              rec.q2 += I * I * CFG.JOULE_R2 * dt
              heating = true
            }
          }
          jouleAccRef.current += dt
          // 0.25s 刷一次，肉眼看是连续上升，又不必每帧重排 SVG
          if (heating && jouleAccRef.current >= 0.25) {
            jouleAccRef.current = 0
            setJouleTick((n) => n + 1)
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
    if (c.type === 'bulb') {
      const p = o._P || 0
      // bright 按额定功率归一（钳到 1）；over 单独给，用于「刺眼白 + 闪烁」过载警示
      return { bright: p > 0 ? Math.min(1, p / CFG.BULB_RATED) : 0, over: p > CFG.BULB_RATED * 1.02 }
    }
    if (c.type === 'ammeter' || c.type === 'ammeterA') return { frac: Math.abs(o._I || 0) / (o._fs || CFG.AMM_FS) }
    if (c.type === 'voltmeter') return { frac: Math.abs(o._V || 0) / (o._fs || CFG.VOLT_FS) }
    if (c.type === 'rheostat') {
      // 有效电阻丝高亮：按实际接入的两个接线柱判定 mode
      const wired = new Set()
      for (const w of wires) {
        if (w.a.startsWith(c.id + ':')) wired.add(w.a.split(':')[1])
        if (w.b.startsWith(c.id + ':')) wired.add(w.b.split(':')[1])
      }
      // live：开关合上、线圈里真流过电流时才着色（未接线 / 断路时 _I≈0）
      return { mode: rheostatMode(wired), live: Math.abs(o._I || 0) > 1e-3 }
    }
    if (c.type === 'motor') return { I: o._I || 0 }
    if (c.type === 'diode') return { on: !!o._on, rev: !o._on && (o._Vd || 0) < -0.3 }
    if (c.type === 'fuse') return { blown: !!o._blown, I: o._I || 0 }
    if (c.type === 'testPencil') return { glow: !!o._glow }
    if (c.type === 'electroscope') return { angle: Math.max(0, Math.min(1, (o._V || 0) / 8)) }
    if (c.type === 'relay') return { pulled: !!o._pulled }
    if (c.type === 'energyMeter') {
      const kwh = meterKwhRef.current[c.id] ?? (Number(c.kwh0) || 0)
      return { kwh, I: o._I || 0 }
    }
    if (c.type === 'jouleTube') {
      const rec = jouleHeatRef.current[c.id] || { q1: 0, q2: 0 }
      // 液柱高度是热量的线性标度：Q 到 JOULE_Q_FULL 时液柱升到满刻度
      const h1 = Math.min(1, rec.q1 / CFG.JOULE_Q_FULL)
      const h2 = Math.min(1, rec.q2 / CFG.JOULE_Q_FULL)
      return { h1, h2, q1: rec.q1, q2: rec.q2, I: o._I || 0 }
    }
    if (c.type === 'multimeter') {
      const mode = c.mode === 'A' || c.mode === 'Ω' ? c.mode : 'V'
      return { value: mode === 'A' ? o._I : mode === 'Ω' ? o._R : o._V }
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
    if (c.type === 'resistor5' || c.type === 'resistor10' || c.type === 'resistor15') {
      // 只有接了电压表 + 电流表（伏安法成立）才有测量值；否则不显示
      const va = (solved._va || []).find((x) => x.id === c.id)
      if (!va) return null
      return {
        text: `R测 ${va.measured.toFixed(3)}Ω · 真 ${va.trueR}Ω`,
        color: va.mode === 'internal' ? '#fbbf24' : '#4ade80',
      }
    }
    if (c.type === 'resBox') {
      return { text: `R = ${(o._R ?? 0).toFixed(1)} Ω`, color: '#4ade80' }
    }
    if (c.type === 'battery' || c.type === 'accumulator' || c.type === 'mains') {
      // 端电压 = E − I·r；短路时端电压塌到 0，全部电动势都降在内阻上
      const emf = o._emf ?? (c.type === 'mains' ? CFG.MAINS_V : c.type === 'accumulator' ? CFG.ACC_V : CFG.VS.V)
      const u = o._V ?? emf
      const drop = Math.max(0, emf - u)
      const danger = u < emf * 0.15 && Math.abs(o._I || 0) > 0.3
      return {
        text: `${danger ? '⚠ 短路 · ' : ''}U端 ${u.toFixed(2)}V · 内阻降 ${drop.toFixed(2)}V`,
        color: danger ? '#fb7185' : drop > 0.05 ? '#fbbf24' : '#93c5fd',
      }
    }
    return null
  }

  const compById = (id) => comps.find((c) => c.id === id)

  /* 端头：裸铜丝绕在柱脚的接线柱上（外皮到柱子前就结束，铜丝扣在柱脚上）。
     单独一层画在器材之上，否则整圈会被器材照片盖掉，看着像线悬在器材旁边。 */
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
    <div className="esvg-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div dangerouslySetInnerHTML={{ __html: SVG_DEFS }} />

      <header className="esvg-topbar">
        <div className="esvg-brand">
          <div className="logo">⚡</div>
          <h1>初中物理 · 电学虚拟实验室</h1>
          <button type="button" className="esvg-help" onClick={() => setHelpOpen(true)}>❓ 操作说明</button>
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
                  labApiRef.current?.setWireColor(c.hex)
                  setWires((ws) => {
                    if (selected && selected.kind === 'wire') {
                      return ws.map((w) => (w.id === selected.id ? { ...w, color: c.hex } : w))
                    }
                    // 没选中导线时，直接改桌面上所有导线（3D 里点线不好选中，
                    // 不给这条"整盘换色"的路，用户会以为颜色按钮坏了）
                    if (!ws.length) return ws
                    setToast(`导线已统一为${c.label}色`)
                    return ws.map((w) => ({ ...w, color: c.hex }))
                  })
                }}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c.hex, cursor: 'pointer',
                  border: wireColor === c.hex ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
                  padding: 0,
                }}
              />
            ))}
          </div>
          {/* 视图切换（req 9）：平面画布 / 3D 实验台 随时互切 */}
          <button type="button" className={`btn${view3d ? '' : ' on'}`} onClick={() => setView3d(false)} title="切回 2D 平面画布（调试）">📐 平面画布</button>
          <button type="button" className={`btn${view3d ? ' on' : ''}`} onClick={() => setView3d(true)} title="可旋转 3D 实验台">🧊 3D 实验台</button>
          <button type="button" className={`btn${readAll ? ' on' : ''}`} onClick={() => setReadAll((v) => !v)} title="把每只电表的读数直接以数字显示">
            {readAll ? '🔢 读数（开）' : '🔢 读数'}
          </button>
          <button type="button" className={`btn${dissect ? ' on' : ''}`} onClick={() => setDissect((d) => !d)}>
            {dissect ? '🔍 内部结构（开）' : '🔍 内部结构'}
          </button>
          <button type="button" className="btn" onClick={loadDemo}>🧪 示例电路</button>
          <button type="button" className="btn" onClick={clearAll}>🗑 清空桌面</button>
        </div>
      </header>

      <div className="esvg-body">
        <aside className={`esvg-palette${view3d ? ' is3d' : ''}`}>
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
                  <span
                    dangerouslySetInnerHTML={{
                      __html:
                        view3d && icon3d[type]
                          ? `<img src="${icon3d[type]}" alt="">`
                          : PALETTE_ICONS[type] || '',
                    }}
                  />
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
          {view3d ? (
            /* 3D 实验台容器：替换 2D 画布区域（同一位置二选一显示） */
            <>
              <div className="esvg-lab3d" ref={lab3dRef} />
              {(() => {
                // 3D 读数字幕：只显示"双击开过读数"的表，直接给数字，不依赖看指针
                const list = comps
                  .filter((c) => T(c) && T(c).meter && (c.showRead || readAll))
                  .map((c) => {
                    const ro = readoutOf(c)
                    return ro ? { id: c.id, name: METER_NAME[c.type] || '电表', ...ro } : null
                  })
                  .filter(Boolean)
                if (!list.length) return null
                return (
                  <div className="esvg-3d-readout">
                    {list.map((r) => (
                      <div className="row" key={r.id}>
                        <span className="name">{r.name}</span>
                        <span className="val" style={{ color: r.color }}>{r.text}</span>
                      </div>
                    ))}
                    <div className="hint">双击电表可单独开/关</div>
                  </div>
                )
              })()}
              {(() => {
                // 选中某件器材 → 浮出操作条（读数 / 拆开看内部），比双击更可发现
                const c = selected && selected.kind === 'comp' ? comps.find((x) => x.id === selected.id) : null
                if (!c) return null
                const isMeter = !!(T(c) && T(c).meter)
                return (
                  <div className="esvg-3d-actions">
                    {isMeter && (
                      <button
                        type="button"
                        onClick={() => setComps((cs) => cs.map((x) => (x.id === c.id ? { ...x, showRead: !x.showRead } : x)))}
                      >{c.showRead ? '隐藏读数' : '显示读数'}</button>
                    )}
                    <button
                      type="button"
                      onClick={() => labApiRef.current?.toggleXrayComp?.(c.id)}
                    >拆开 / 合上</button>
                  </div>
                )
              })()}
            </>
          ) : (
          <div className={`esvg-canvas${dissect ? ' dissect' : ''}`} ref={canvasRef}>
            {/* 导线层（连续电缆：落影/外皮/本色/上偏高光 + 两端护套） */}
            <svg className="esvg-wirelayer" width={CW} height={CH}>
              {wires.map((w) => {
                const c1 = compById(+w.a.split(':')[0])
                const c2 = compById(+w.b.split(':')[0])
                if (!c1 || !c2) return null
                const g = wireGeom(c1, w.a.split(':')[1], c2, w.b.split(':')[1], w.id * 977 + 13)
                if (!g) return null
                const sel = selected && selected.kind === 'wire' && selected.id === w.id
                const color = wireStroke(w)
                const L = wireLayers(g.cur, color, WIRE_W)
                const B = wrapLayers(color, WIRE_W)
                return (
                  <g key={w.id}>
                    <path d={L.dShadow} fill="none" stroke="rgba(15,23,42,0.20)" strokeWidth={L.w + 1.5} strokeLinecap="round" />
                    {sel && (
                      <path d={L.d} fill="none" stroke="rgba(225,29,72,0.45)" strokeWidth={L.w + 4} strokeLinecap="round" />
                    )}
                    <path d={L.d} fill="none" stroke={L.casing} strokeWidth={L.w + 1.9} strokeLinecap="round" />
                    <path d={L.d} fill="none" stroke={L.core} strokeWidth={L.w} strokeLinecap="round" />
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
                        <circle
                          cx={g.mid.x} cy={g.mid.y} r="14" fill="transparent"
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

            {/* 端头层：导线本体已经整体压在器材之上（见 .esvg-wirelayer），这一层只剩一件事——
                让"裸铜丝绕在柱脚上"始终画在所有导线的最上面，不被相邻那根线的外皮盖掉。 */}
            <svg className="esvg-wiretop" width={CW} height={CH}>
              {wires.map((w) => {
                const c1 = compById(+w.a.split(':')[0])
                const c2 = compById(+w.b.split(':')[0])
                if (!c1 || !c2) return null
                const g = wireGeom(c1, w.a.split(':')[1], c2, w.b.split(':')[1], w.id * 977 + 13)
                if (!g) return null
                const color = wireStroke(w)
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
          )}
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
              <li><b>连线（3D）</b>：点一根接线柱拉出导线，再点另一根即连上（也可以按住拖到柱上松手）；落在空白处不会取消，点同一根柱 / 右键 / Esc 放弃。导线可单击选中后换色，Delete 删线重连。</li>
              <li><b>找线</b>：3D 里导线按「射线到线段的最近距离」放宽了拾取容差，细线也点得中。</li>
              <li><b>看内部</b>：点顶部「内部结构」，剖视显示各元件内部构造（碳棒、锌筒、灯丝、线圈、电阻丝…）。</li>
              <li><b>单件剖开（3D）</b>：双击某件器材只剖开这一件；或选中后点右下「拆开 / 合上」。</li>
              <li><b>数字读数（3D）</b>：点顶部「🔢 读数」，所有电表的实时数值直接列在画面右上。</li>
            </ul>
            <ul>
              <li>电池组 3V（内阻 0.1Ω） · 蓄电池 12V · 小灯泡 5Ω（额定 3V / 1.8W） · 家庭电源 220V</li>
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
