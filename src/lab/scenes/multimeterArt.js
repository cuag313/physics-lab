/**
 * multimeterArt — 指针式多用电表（MF-47 型）画布美术件
 *
 * 口径：表盘三条刻度（Ω / 直流 0–250·0–50 / 交流 10 V）、红色指针、
 * 选择开关与档位环、欧姆调零、机械调零螺丝、COM·+·10A·2500V 四孔。
 * 另含：定值电阻板、二极管、小灯泡电路（带测流断口）、表笔软线与短接片。
 * 所有交互热区几何随绘制一并返回，场景侧只做命中判定，不重复算坐标。
 */
import { rr, line, hexA, T, drawBoard, drawPost } from './labArtKit'

const DEG = Math.PI / 180

/** 档位：angle 为旋钮上的角度（0 = 正上，顺时针为正） */
export const MM_RANGES = [
  // 直流电压：左上 500 → 左下 0.25，顺时针递减（与 MF-47 实机一致）
  { id: 'dcv500', group: 'dcv', label: '500', angle: -38, kind: 'dcv', full: 500 },
  { id: 'dcv250', group: 'dcv', label: '250', angle: -54, kind: 'dcv', full: 250 },
  { id: 'dcv50', group: 'dcv', label: '50', angle: -70, kind: 'dcv', full: 50 },
  { id: 'dcv10', group: 'dcv', label: '10', angle: -86, kind: 'dcv', full: 10 },
  { id: 'dcv2p5', group: 'dcv', label: '2.5', angle: -102, kind: 'dcv', full: 2.5 },
  { id: 'dcv1', group: 'dcv', label: '1', angle: -118, kind: 'dcv', full: 1 },
  { id: 'dcv0p25', group: 'dcv', label: '0.25', angle: -134, kind: 'dcv', full: 0.25 },
  // 交流电压：顶部，500 靠左上 → 10 靠右上，顺时针递减
  { id: 'acv500', group: 'acv', label: '500', angle: -16, kind: 'acv', full: 500 },
  { id: 'acv250', group: 'acv', label: '250', angle: 0, kind: 'acv', full: 250 },
  { id: 'acv50', group: 'acv', label: '50', angle: 16, kind: 'acv', full: 50 },
  { id: 'acv10', group: 'acv', label: '10', angle: 32, kind: 'acv', full: 10, rowMax: 10 },
  // 欧姆：右上 10k → 右下 1，顺时针递减
  { id: 'ohm10k', group: 'ohm', label: '10k', angle: 48, kind: 'ohm', mult: 10000 },
  { id: 'ohm1k', group: 'ohm', label: '1k', angle: 64, kind: 'ohm', mult: 1000 },
  { id: 'ohm100', group: 'ohm', label: '100', angle: 80, kind: 'ohm', mult: 100 },
  { id: 'ohm10', group: 'ohm', label: '10', angle: 96, kind: 'ohm', mult: 10 },
  { id: 'ohm1', group: 'ohm', label: '1', angle: 112, kind: 'ohm', mult: 1 },
  // 关机在欧姆与 mA 之间（实机 4~5 点方向）
  { id: 'off', group: 'off', label: 'OFF', angle: 128, kind: 'off' },
  // 直流电流：右下方，500 → 0.5 顺时针递减
  { id: 'dca500', group: 'dca', label: '500', angle: 144, kind: 'dca', full: 0.5 },
  { id: 'dca50', group: 'dca', label: '50', angle: 160, kind: 'dca', full: 0.05 },
  { id: 'dca5', group: 'dca', label: '5', angle: 176, kind: 'dca', full: 0.005 },
  { id: 'dca0p5', group: 'dca', label: '0.5', angle: 192, kind: 'dca', full: 0.0005 },
  { id: 'a10', group: 'dca', label: '10A', angle: 208, kind: 'dca', full: 10 },
]

export const RANGE_BY_ID = Object.fromEntries(MM_RANGES.map((r) => [r.id, r]))

const GROUP_C = {
  ohm: '#1E6B3B',
  dcv: '#A8281F',
  acv: '#A8281F',
  dca: '#A8281F',
  off: '#DCE3E8',
}

/** 欧姆刻度（数值, 是否印字）：左侧 ∞ → 右侧 0 */
const OHM_MARKS = [
  [1e9, '∞', 1], [1000, null, 0], [700, null, 0], [500, '500', 1], [400, null, 0],
  [300, null, 0], [250, null, 0], [200, '200', 1], [160, null, 0], [130, null, 0],
  [100, '100', 1], [80, null, 0], [70, null, 0], [60, null, 0], [50, '50', 1],
  [45, null, 0], [40, null, 0], [35, null, 0], [30, null, 0], [25, null, 0],
  [20, '20', 1], [18, null, 0], [16, null, 0], [15, '15', 1], [13, null, 0],
  [12, null, 0], [11, null, 0], [10, '10', 1], [9, null, 0], [8, null, 0],
  [7, null, 0], [6, null, 0], [5, '5', 1], [4.5, null, 0], [4, null, 0],
  [3.5, null, 0], [3, null, 0], [2.5, null, 0], [2, null, 0], [1.6, null, 0],
  [1.3, null, 0], [1, '1', 1], [0.7, null, 0], [0.5, null, 0], [0.3, null, 0], [0, '0', 1],
]

const ohmT = (v) => (v >= 1e8 ? 0 : 15 / (15 + v))

function polar(cx, cy, r, deg) {
  const a = deg * DEG
  return { x: cx + Math.sin(a) * r, y: cy - Math.cos(a) * r }
}

function arcPos(cx, cy, r, rad) {
  return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r }
}

/* ==================================================================
 *  多用电表
 * ================================================================== */

/**
 * @param b {x,y,w,h} 机身框
 * @param st {rangeId, frac, mech, zeroAdj, callouts, k}
 * @returns 热区几何
 */
export function drawMultimeter(ctx, b, st = {}) {
  const { x, y, w, h } = b
  const range = RANGE_BY_ID[st.rangeId] || RANGE_BY_ID.off
  const mech = st.mech || 0
  const zeroAdj = st.zeroAdj == null ? 0.62 : st.zeroAdj
  const frac = Number.isFinite(st.frac) ? st.frac : 0

  // ── 机身：黑胶木壳（顶部提手 + 侧光）──
  ctx.save()
  ctx.shadowColor = 'rgba(24,34,30,0.30)'
  ctx.shadowBlur = 22
  ctx.shadowOffsetY = 10
  const body = ctx.createLinearGradient(x, y, x + w * 0.55, y + h)
  body.addColorStop(0, '#4A4F55')
  body.addColorStop(0.28, '#2E3237')
  body.addColorStop(0.72, '#22262A')
  body.addColorStop(1, '#35393E')
  ctx.fillStyle = body
  rr(ctx, x, y, w, h, w * 0.052)
  ctx.fill()
  ctx.restore()

  // 顶部提手（折起贴壳）
  ctx.save()
  rr(ctx, x + w * 0.34, y + h * 0.006, w * 0.32, h * 0.012, h * 0.006)
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.fill()
  ctx.restore()

  // 侧边高光/暗边
  ctx.save()
  rr(ctx, x, y, w, h, w * 0.052)
  ctx.clip()
  const side = ctx.createLinearGradient(x, y, x + w, y)
  side.addColorStop(0, 'rgba(255,255,255,0.16)')
  side.addColorStop(0.10, 'rgba(255,255,255,0)')
  side.addColorStop(0.9, 'rgba(0,0,0,0.06)')
  side.addColorStop(1, 'rgba(0,0,0,0.34)')
  ctx.fillStyle = side
  ctx.fillRect(x, y, w, h)
  ctx.restore()
  ctx.strokeStyle = '#0E1114'
  ctx.lineWidth = Math.max(1.4, w * 0.006)
  rr(ctx, x, y, w, h, w * 0.052)
  ctx.stroke()

  // ── 表盘 ──
  const f = { x: x + w * 0.046, y: y + h * 0.024, w: w * 0.908, h: h * 0.424 }
  ctx.fillStyle = '#111417'
  rr(ctx, f.x, f.y, f.w, f.h, w * 0.022)
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1
  rr(ctx, f.x, f.y, f.w, f.h, w * 0.022)
  ctx.stroke()

  const face = {
    x: f.x + f.w * 0.019,
    y: f.y + f.h * 0.030,
    w: f.w * 0.962,
    h: f.h * 0.940,
  }
  ctx.fillStyle = '#FBF8EC'
  rr(ctx, face.x, face.y, face.w, face.h, w * 0.010)
  ctx.fill()

  const cx = face.x + face.w * 0.50
  const cy = face.y + face.h * 1.010
  const Rs = face.w * 0.468
  const A0 = 204
  const A1 = 336
  const ang = (t) => (A0 + (A1 - A0) * t) * DEG

  // 反光镜带（在 Ω 刻度与直流刻度之间）
  ctx.save()
  const mirror = ctx.createLinearGradient(cx - Rs, cy - Rs, cx + Rs * 0.4, cy - Rs * 0.2)
  mirror.addColorStop(0, '#DCE4E6')
  mirror.addColorStop(0.35, '#F3F7F8')
  mirror.addColorStop(0.7, '#CBD6D9')
  mirror.addColorStop(1, '#E8EEF0')
  ctx.beginPath()
  ctx.arc(cx, cy, Rs * 0.858, ang(0.02), ang(0.98))
  ctx.arc(cx, cy, Rs * 0.812, ang(0.98), ang(0.02), true)
  ctx.closePath()
  ctx.fillStyle = mirror
  ctx.fill()
  ctx.strokeStyle = 'rgba(150,162,168,0.55)'
  ctx.lineWidth = Math.max(0.6, w * 0.002)
  ctx.stroke()
  ctx.restore()

  // 欧姆刻度（最外圈）
  drawOhmScale(ctx, cx, cy, Rs, ang, w)

  // 直流电压/电流刻度（第二圈）
  drawDcScale(ctx, cx, cy, Rs, ang, w)

  // 交流 10 V 刻度（第三圈）
  drawAcScale(ctx, cx, cy, Rs, ang, w)

  // 表头文字
  T(ctx, 'MF-47', cx, face.y + face.h * 0.11, {
    size: Math.round(w * 0.028), color: '#6B7075', align: 'center', bold: true,
  })
  T(ctx, 'A–V–Ω', cx - Rs * 0.52, face.y + face.h * 0.905, {
    size: Math.round(w * 0.030), color: '#8A9096', align: 'center', bold: true,
  })

  // 指针（裁进白盘）
  ctx.save()
  rr(ctx, face.x, face.y, face.w, face.h, w * 0.010)
  ctx.clip()
  const tNeedle = Math.max(-0.03, Math.min(1.05, frac + mech))
  const aN = ang(tNeedle)
  const nx = cx + Math.cos(aN) * Rs * 0.995
  const ny = cy + Math.sin(aN) * Rs * 0.995
  const tx = cx - Math.cos(aN) * Rs * 0.12
  const ty = cy - Math.sin(aN) * Rs * 0.12
  // 指针阴影
  ctx.strokeStyle = 'rgba(90,60,50,0.22)'
  ctx.lineWidth = Math.max(2.2, w * 0.010)
  ctx.beginPath()
  ctx.moveTo(tx + 2, ty + 2)
  ctx.lineTo(nx + 2, ny + 2)
  ctx.stroke()
  // 尾锤 + 针体
  ctx.strokeStyle = '#B3261E'
  ctx.lineWidth = Math.max(1.6, w * 0.0052)
  ctx.beginPath()
  ctx.moveTo(tx, ty)
  ctx.lineTo(nx, ny)
  ctx.stroke()
  ctx.fillStyle = '#8E1F19'
  ctx.beginPath()
  ctx.arc(tx, ty, Math.max(2, w * 0.008), 0, Math.PI * 2)
  ctx.fill()
  // 玻璃反光
  const glass = ctx.createLinearGradient(face.x, face.y, face.x + face.w, face.y + face.h)
  glass.addColorStop(0, 'rgba(255,255,255,0.30)')
  glass.addColorStop(0.28, 'rgba(255,255,255,0)')
  glass.addColorStop(0.62, 'rgba(255,255,255,0.10)')
  glass.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glass
  ctx.fillRect(face.x, face.y, face.w, face.h)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(face.x + face.w * 0.10, face.y)
  ctx.lineTo(face.x + face.w * 0.34, face.y)
  ctx.lineTo(face.x + face.w * 0.02, face.y + face.h)
  ctx.lineTo(face.x - face.w * 0.20, face.y + face.h)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.fill()
  ctx.restore()
  ctx.restore()

  // 机械调零螺丝（白盘下沿）
  const mechScrew = { x: cx, y: face.y + face.h * 0.955, r: w * 0.020 }
  ctx.save()
  ctx.fillStyle = '#2A2F33'
  ctx.beginPath()
  ctx.arc(mechScrew.x, mechScrew.y, mechScrew.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#8C9499'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(mechScrew.x, mechScrew.y, mechScrew.r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.translate(mechScrew.x, mechScrew.y)
  ctx.rotate((mech || 0) * 12)
  ctx.fillStyle = '#C9CED3'
  rr(ctx, -mechScrew.r * 0.72, -mechScrew.r * 0.10, mechScrew.r * 1.44, mechScrew.r * 0.20, 1)
  ctx.fill()
  ctx.restore()

  // ── 铭牌 ──
  const np = { x: x + w * 0.062, y: f.y + f.h + h * 0.010, w: w * 0.876, h: h * 0.050 }
  ctx.fillStyle = '#0F1215'
  rr(ctx, np.x, np.y, np.w, np.h, w * 0.008)
  ctx.fill()
  ctx.strokeStyle = '#3A4046'
  ctx.lineWidth = 1
  rr(ctx, np.x, np.y, np.w, np.h, w * 0.008)
  ctx.stroke()
  T(ctx, 'MF-47', np.x + w * 0.030, np.y + np.h / 2, {
    size: Math.round(w * 0.036), color: '#D7DDE2', bold: true,
  })
  T(ctx, 'POINTER MULTIMETER', np.x + np.w - w * 0.030, np.y + np.h / 2, {
    size: Math.round(w * 0.018), color: '#98A2AA', align: 'right',
  })

  // ── 下方面板 ──
  const pn = { x: x + w * 0.040, y: np.y + np.h + h * 0.012, w: w * 0.920, h: h * 0.420 }
  ctx.fillStyle = '#2B3035'
  rr(ctx, pn.x, pn.y, pn.w, pn.h, w * 0.014)
  ctx.fill()
  ctx.strokeStyle = '#15181B'
  ctx.lineWidth = 1
  rr(ctx, pn.x, pn.y, pn.w, pn.h, w * 0.014)
  ctx.stroke()

  const kx = x + w * 0.365
  const ky = y + h * 0.700
  const kr = w * 0.152
  const ringR = kr * 1.44

  // 档位环：按组画淡色弧
  const groups = {}
  for (const r of MM_RANGES) {
    if (!groups[r.group]) groups[r.group] = []
    groups[r.group].push(r.angle)
  }
  for (const [g, list] of Object.entries(groups)) {
    const lo = Math.min(...list) - 6
    const hi = Math.max(...list) + 6
    ctx.strokeStyle = hexA(GROUP_C[g], 0.22)
    ctx.lineWidth = Math.max(2, w * 0.014)
    ctx.beginPath()
    ctx.arc(kx, ky, ringR + w * 0.026, (lo - 90) * DEG, (hi - 90) * DEG)
    ctx.stroke()
  }

  // 档位数字：一律横排、内外两圈交错，避免相邻档咬字、也避免倒写
  const labels = []
  const labelR = ringR
  const seen = {}
  for (const r of MM_RANGES) {
    // 档位刻线
    const t1 = polar(kx, ky, kr * 1.16, r.angle)
    const t2 = polar(kx, ky, kr * 1.30, r.angle)
    line(ctx, t1.x, t1.y, t2.x, t2.y, GROUP_C[r.group], Math.max(1.2, w * 0.006))
    void (seen[r.group] = (seen[r.group] ?? -1) + 1)
    const p = polar(kx, ky, labelR, r.angle)
    const txt = r.id === 'acv10' ? `${r.label}～` : r.label
    T(ctx, txt, p.x, p.y, {
      size: Math.max(8, Math.round((txt.length >= 3 ? w * 0.0185 : w * 0.0215))),
      color: GROUP_C[r.group],
      align: 'center',
      bold: range.id === r.id,
    })
    labels.push({ id: r.id, angle: r.angle, x: p.x, y: p.y })
  }
  // 组标签：压在相邻两个档位数字夹缝里、紧贴弧外侧（顶部的 ACV 没地方放，改用 10～ 的波浪号标段）
  const caps = [
    { t: 'DCV', a: -78, c: GROUP_C.dcv },
    { t: 'Ω', a: 72, c: GROUP_C.ohm },
    { t: 'DCmA', a: 152, c: GROUP_C.dca },
  ]
  for (const cp of caps) {
    const p = polar(kx, ky, ringR + w * 0.040, cp.a)
    T(ctx, cp.t, p.x, p.y, {
      size: Math.max(7, Math.round(w * 0.0155)), color: hexA(cp.c, 0.95), align: 'center', bold: true,
    })
  }
  // 选择开关（角度可由场景侧缓动传入，指针才会“转”过去而不是瞬移）
  const knobAng = Number.isFinite(st.knob) ? st.knob : range.angle
  drawSelector(ctx, kx, ky, kr, knobAng, w)

  // 欧姆调零
  const zk = { x: x + w * 0.815, y: y + h * 0.612, r: w * 0.058 }
  drawZeroKnob(ctx, zk, zeroAdj, w)
  T(ctx, 'Ω ADJ', zk.x, zk.y + zk.r + h * 0.022, {
    size: Math.round(w * 0.019), color: '#C9A26B', align: 'center', bold: true,
  })

  // 插孔
  const jackY = y + h * 0.902
  const jacks = {
    com: { x: x + w * 0.145, y: jackY, r: w * 0.026 },
    pos: { x: x + w * 0.360, y: jackY, r: w * 0.026 },
    tenA: { x: x + w * 0.585, y: jackY, r: w * 0.026 },
    hv: { x: x + w * 0.805, y: jackY, r: w * 0.026 },
  }
  drawJack(ctx, jacks.com, '#1A1A1A')
  drawJack(ctx, jacks.pos, '#C62828')
  drawJack(ctx, jacks.tenA, '#C62828')
  drawJack(ctx, jacks.hv, '#C62828')
  T(ctx, 'COM', jacks.com.x, jackY + w * 0.050, { size: Math.round(w * 0.019), color: '#D7DDE2', align: 'center' })
  T(ctx, '+', jacks.pos.x, jackY + w * 0.050, { size: Math.round(w * 0.019), color: '#FFB4AE', align: 'center' })
  T(ctx, '10A', jacks.tenA.x, jackY + w * 0.050, { size: Math.round(w * 0.019), color: '#FFB4AE', align: 'center' })
  T(ctx, '2500V', jacks.hv.x, jackY + w * 0.050, { size: Math.round(w * 0.017), color: '#FFB4AE', align: 'center' })

  // 部件标注（Tab1 用）
  if (st.callouts) {
    const marks = [
      { n: 1, x: face.x + face.w * 0.90, y: face.y + face.h * 0.10 },
      { n: 2, x: cx + Rs * 0.60, y: cy - Rs * 0.58 },
      { n: 3, x: kx + kr * 0.72, y: ky + kr * 0.72 },
      { n: 4, x: zk.x, y: zk.y - zk.r - h * 0.012 },
      { n: 5, x: jacks.pos.x, y: jackY + w * 0.075 },
      { n: 6, x: mechScrew.x + w * 0.04, y: mechScrew.y },
    ]
    for (const m of marks) {
      ctx.fillStyle = 'rgba(37,49,58,0.92)'
      ctx.beginPath()
      ctx.arc(m.x, m.y, w * 0.021, 0, Math.PI * 2)
      ctx.fill()
      T(ctx, String(m.n), m.x, m.y + 1, {
        size: Math.round(w * 0.023), color: '#FFF6E2', align: 'center', bold: true,
      })
    }
  }

  return {
    box: b, face, hub: { x: cx, y: cy, r: Rs }, knob: { x: kx, y: ky, r: kr },
    ringR, ranges: labels, knobAng, zeroKnob: zk, mech: mechScrew, jacks,
  }
}

/** 刻度数字：带浅色描边，压在密集刻线上也能看清 */
function scaleNum(ctx, txt, x, y, opt) {
  ctx.save()
  ctx.shadowColor = 'rgba(251,248,236,0.95)'
  ctx.shadowBlur = 3.2
  T(ctx, txt, x, y, opt)
  ctx.restore()
}

/** Ω 刻度（∞ 在左、0 在右，非线性） */
function drawOhmScale(ctx, cx, cy, Rs, ang, w) {
  const rOut = Rs * 1.0
  const rNum = Rs * 0.918
  for (const [v, txt, major] of OHM_MARKS) {
    const t = ohmT(v)
    const a = ang(t)
    const r1 = rOut
    const r2 = rOut - (major ? Rs * 0.052 : Rs * 0.030)
    const p1 = arcPos(cx, cy, r1, a)
    const p2 = arcPos(cx, cy, r2, a)
    line(ctx, p1.x, p1.y, p2.x, p2.y, major ? '#3B4147' : '#6C7378', Math.max(0.9, w * (major ? 0.0038 : 0.0028)))
    if (txt) {
      const p = arcPos(cx, cy, rNum, a)
      scaleNum(ctx, txt, p.x, p.y, {
        size: Math.round(w * 0.0215), color: '#1E6B3B', align: 'center', bold: true,
      })
    }
  }
  // 刻度弧线
  ctx.strokeStyle = '#3B4147'
  ctx.lineWidth = Math.max(0.9, w * 0.0036)
  ctx.beginPath()
  ctx.arc(cx, cy, rOut, ang(0), ang(1))
  ctx.stroke()
}

/** 直流电压 / 电流刻度：0–250 外圈、0–50 内圈 */
function drawDcScale(ctx, cx, cy, Rs, ang, w) {
  const rOut = Rs * 0.790
  const n = 50
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    const a = ang(t)
    const major = i % 5 === 0
    const mid = i % 1 === 0 && i % 25 === 0
    const len = major ? 0.056 : mid ? 0.046 : 0.030
    const p1 = arcPos(cx, cy, rOut, a)
    const p2 = arcPos(cx, cy, rOut - Rs * len, a)
    line(ctx, p1.x, p1.y, p2.x, p2.y,
      major ? '#3B4147' : '#767D82', Math.max(0.7, w * (major ? 0.0032 : 0.0022)))
  }
  ctx.strokeStyle = '#3B4147'
  ctx.lineWidth = Math.max(0.8, w * 0.0032)
  ctx.beginPath()
  ctx.arc(cx, cy, rOut, ang(0), ang(1))
  ctx.stroke()
  // 外圈数字 0–250
  for (const v of [0, 50, 100, 150, 200, 250]) {
    const p = arcPos(cx, cy, Rs * 0.720, ang(v / 250))
    scaleNum(ctx, String(v), p.x, p.y, {
      size: Math.round(w * 0.0205), color: '#A8281F', align: 'center', bold: true,
    })
  }
  // 内圈数字 0–50
  for (const v of [0, 10, 20, 30, 40, 50]) {
    const p = arcPos(cx, cy, Rs * 0.652, ang(v / 50))
    scaleNum(ctx, String(v), p.x, p.y, {
      size: Math.round(w * 0.0175), color: '#8A3229', align: 'center',
    })
  }
}

/** 交流 10 V 刻度 */
function drawAcScale(ctx, cx, cy, Rs, ang, w) {
  const rOut = Rs * 0.585
  for (let i = 0; i <= 50; i += 1) {
    const a = ang(i / 50)
    const major = i % 10 === 0
    const p1 = arcPos(cx, cy, rOut, a)
    const p2 = arcPos(cx, cy, rOut - Rs * (major ? 0.040 : 0.024), a)
    line(ctx, p1.x, p1.y, p2.x, p2.y,
      major ? '#3B4147' : '#7C8388', Math.max(0.7, w * (major ? 0.0028 : 0.0020)))
  }
  for (const v of [0, 2, 4, 6, 8, 10]) {
    const p = arcPos(cx, cy, Rs * 0.528, ang(v / 10))
    scaleNum(ctx, String(v), p.x, p.y, {
      size: Math.round(w * 0.0175), color: '#A8281F', align: 'center',
    })
  }
  // dB / hFE 圈：只留两道淡弧，交代“还有别的刻度”
  ctx.strokeStyle = 'rgba(120,128,134,0.55)'
  ctx.lineWidth = Math.max(0.7, w * 0.0022)
  ctx.beginPath()
  ctx.arc(cx, cy, Rs * 0.476, ang(0.02), ang(0.98))
  ctx.stroke()
  T(ctx, 'dB', arcPos(cx, cy, Rs * 0.476, ang(0.03)).x, arcPos(cx, cy, Rs * 0.476, ang(0.03)).y - Rs * 0.05, {
    size: Math.round(w * 0.015), color: '#8A9196', align: 'center',
  })
  T(ctx, 'hFE', arcPos(cx, cy, Rs * 0.476, ang(0.97)).x, arcPos(cx, cy, Rs * 0.476, ang(0.97)).y - Rs * 0.05, {
    size: Math.round(w * 0.015), color: '#8A9196', align: 'center',
  })
}

/** 选择开关：黑旋钮 + 白指示条 + 滚花边 */
function drawSelector(ctx, kx, ky, kr, angleDeg, w) {
  ctx.save()
  // 底座凹槽
  ctx.fillStyle = '#1B1F23'
  ctx.beginPath()
  ctx.arc(kx, ky, kr * 1.10, 0, Math.PI * 2)
  ctx.fill()
  // 滚花
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * Math.PI * 2
    const r1 = kr * 0.995
    const r2 = kr * 0.88
    line(ctx, kx + Math.cos(a) * r1, ky + Math.sin(a) * r1, kx + Math.cos(a) * r2, ky + Math.sin(a) * r2,
      i % 2 ? '#0C0E10' : '#2C3136', Math.max(1, w * 0.004))
  }
  const g = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.35, kr * 0.15, kx, ky, kr * 0.9)
  g.addColorStop(0, '#4A4F55')
  g.addColorStop(0.55, '#2C3136')
  g.addColorStop(1, '#15181B')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(kx, ky, kr * 0.87, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#0B0D0F'
  ctx.lineWidth = Math.max(1, w * 0.004)
  ctx.beginPath()
  ctx.arc(kx, ky, kr * 0.87, 0, Math.PI * 2)
  ctx.stroke()
  // 中心盖
  ctx.fillStyle = '#20242A'
  ctx.beginPath()
  ctx.arc(kx, ky, kr * 0.30, 0, Math.PI * 2)
  ctx.fill()
  // 白指示条
  const a = angleDeg * DEG
  const ex = kx + Math.sin(a) * kr * 0.82
  const ey = ky - Math.cos(a) * kr * 0.82
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = Math.max(4, w * 0.026)
  ctx.beginPath()
  ctx.moveTo(kx + 1, ky + 1)
  ctx.lineTo(ex + 1, ey + 1)
  ctx.stroke()
  ctx.strokeStyle = '#F2F4F6'
  ctx.lineWidth = Math.max(3, w * 0.021)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(kx, ky)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.fillStyle = '#F2F4F6'
  ctx.beginPath()
  ctx.arc(ex, ey, Math.max(2.4, w * 0.012), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 欧姆调零旋钮：凹槽里的小滚花旋钮 + 白点 */
function drawZeroKnob(ctx, z, adj, w) {
  ctx.save()
  ctx.fillStyle = '#14181B'
  ctx.beginPath()
  ctx.arc(z.x, z.y, z.r * 1.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#40464C'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(z.x, z.y, z.r * 1.28, 0, Math.PI * 2)
  ctx.stroke()
  const g = ctx.createRadialGradient(z.x - z.r * 0.35, z.y - z.r * 0.4, z.r * 0.2, z.x, z.y, z.r)
  g.addColorStop(0, '#42484E')
  g.addColorStop(1, '#171B1F')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2
    line(ctx, z.x + Math.cos(a) * z.r * 0.94, z.y + Math.sin(a) * z.r * 0.94,
      z.x + Math.cos(a) * z.r * 0.74, z.y + Math.sin(a) * z.r * 0.74, 'rgba(10,12,14,0.65)', Math.max(1, w * 0.003))
  }
  const ang = -110 + 220 * Math.max(0, Math.min(1, adj))
  const a = ang * DEG
  ctx.fillStyle = '#E8ECEF'
  ctx.beginPath()
  ctx.arc(z.x + Math.sin(a) * z.r * 0.52, z.y - Math.cos(a) * z.r * 0.52, Math.max(1.8, w * 0.008), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 表笔插孔 */
function drawJack(ctx, j, ringColor) {
  ctx.save()
  ctx.fillStyle = '#B7BEC4'
  ctx.beginPath()
  ctx.arc(j.x, j.y, j.r * 1.18, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0A0C0E'
  ctx.beginPath()
  ctx.arc(j.x, j.y, j.r * 0.78, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = ringColor
  ctx.lineWidth = j.r * 0.46
  ctx.beginPath()
  ctx.arc(j.x, j.y, j.r * 1.02, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.arc(j.x - j.r * 0.30, j.y - j.r * 0.32, j.r * 0.30, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/* ==================================================================
 *  表笔
 * ================================================================== */

export function drawProbeLead(ctx, from, tip, color, k, o = {}) {
  const dark = color === '#C62828' ? '#8E1B15' : '#111315'
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const sag = Math.max(36 * k, Math.min(120 * k, Math.abs(dy) * 0.55 + Math.abs(dx) * 0.18))
  const c1 = { x: from.x + dx * 0.16, y: from.y + sag }
  const c2 = { x: tip.x - dx * 0.20, y: tip.y + sag * 0.45 }

  if (o.part !== 'body') {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, tip.x, tip.y)
  ctx.strokeStyle = 'rgba(24,36,30,0.28)'
  ctx.lineWidth = Math.max(4.4, 5.6 * k)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, tip.x, tip.y)
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(3.2, 4.2 * k)
  ctx.stroke()
  ctx.strokeStyle = color === '#C62828' ? 'rgba(255,180,170,0.55)' : 'rgba(160,170,180,0.35)'
  ctx.lineWidth = Math.max(1, 1.3 * k)
  ctx.stroke()
  ctx.restore()
  }

  // 表笔柄 + 金属尖（沿最后一段方向）
  if (o.part === 'wire') return
  const ang = Math.atan2(tip.y - c2.y, tip.x - c2.x)
  const hx = tip.x - Math.cos(ang) * 15 * k
  const hy = tip.y - Math.sin(ang) * 15 * k
  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(ang)
  const bodyL = 30 * k
  const bodyW = 9.5 * k
  const g = ctx.createLinearGradient(0, -bodyW / 2, 0, bodyW / 2)
  g.addColorStop(0, color === '#C62828' ? '#E4544C' : '#3A3F45')
  g.addColorStop(0.5, color)
  g.addColorStop(1, dark)
  ctx.fillStyle = g
  rr(ctx, -bodyL, -bodyW / 2, bodyL, bodyW, bodyW / 2)
  ctx.fill()
  // 防滑纹
  for (let i = 1; i < 4; i += 1) {
    line(ctx, -bodyL + (bodyL / 4) * i, -bodyW / 2 + 1, -bodyL + (bodyL / 4) * i, bodyW / 2 - 1,
      'rgba(0,0,0,0.30)', 1)
  }
  // 金属尖
  ctx.fillStyle = '#C9CFD4'
  ctx.beginPath()
  ctx.moveTo(0, -1.9 * k)
  ctx.lineTo(15 * k, -0.9 * k)
  ctx.lineTo(15 * k, 0.9 * k)
  ctx.lineTo(0, 1.9 * k)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.moveTo(0, -1.6 * k)
  ctx.lineTo(14 * k, -0.9 * k)
  ctx.lineTo(14 * k, -0.2 * k)
  ctx.lineTo(0, -0.5 * k)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  if (o.snap) {
    ctx.save()
    ctx.strokeStyle = o.snapColor || '#2E7D32'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(tip.x, tip.y, 8 * k, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

/* ==================================================================
 *  被测器材
 * ================================================================== */

/** 定值电阻板：R₁ 12 Ω / R₂ 12 kΩ，各带两个接线柱 */
export function drawResistorBoard(ctx, p, k) {
  drawBoard(ctx, p)
  T(ctx, '定值电阻（先估再选档）', p.x + 14 * k, p.y + 16 * k, {
    size: Math.round(11 * k), bold: true, color: '#25313A',
  })

  const r1y = p.y + p.h * 0.44
  const r2y = p.y + p.h * 0.80
  const x0 = p.x + p.w * 0.10
  const x1 = p.x + p.w * 0.30
  const posts = {}

  const row = (yy, val, bands, label, ids) => {
    drawPost(ctx, x0, yy, Math.max(4, 5.4 * k), '#1A1A1A')
    drawPost(ctx, x1, yy, Math.max(4, 5.4 * k), '#C62828')
    drawResistor(ctx, x0 + 10 * k, yy, x1 - x0 - 20 * k, 13 * k, bands, k)
    T(ctx, label, x1 + 14 * k, yy - 3 * k, {
      size: Math.round(10.5 * k), bold: true, color: '#25313A',
    })
    T(ctx, val, x1 + 14 * k, yy + 13 * k, {
      size: Math.round(9.5 * k), color: '#6B7A83',
    })
    posts[ids[0]] = { x: x0, y: yy, r: Math.max(6, 7.5 * k) }
    posts[ids[1]] = { x: x1, y: yy, r: Math.max(6, 7.5 * k) }
  }

  row(r1y, '标称 12 Ω · 色环 棕红黑金', ['#6B4423', '#C62828', '#1D1D1D', '#D4AF37'], 'R₁ · 12 Ω', ['r1a', 'r1b'])
  row(r2y, '标称 12 kΩ · 色环 棕红橙金', ['#6B4423', '#C62828', '#E8791E', '#D4AF37'], 'R₂ · 12 kΩ', ['r2a', 'r2b'])

  // 右侧提示
  const hx = p.x + p.w * 0.58
  T(ctx, '选档口诀', hx, p.y + p.h * 0.34, { size: Math.round(10.5 * k), bold: true, color: '#1565C0' })
  T(ctx, '指针落在刻度中段 → 读数最准', hx, p.y + p.h * 0.34 + 18 * k, {
    size: Math.round(9 * k), color: '#4B5A66',
  })
  T(ctx, '12 Ω 用 ×1 档；12 kΩ 用 ×1k 档', hx, p.y + p.h * 0.34 + 34 * k, {
    size: Math.round(9 * k), color: '#4B5A66',
  })
  T(ctx, '换档后必须重新短接调零', hx, p.y + p.h * 0.34 + 50 * k, {
    size: Math.round(9 * k), color: '#C2410C', bold: true,
  })

  return { posts, board: p }
}

function drawResistor(ctx, x, y, len, hgt, bands, k) {
  const bodyH = hgt
  ctx.save()
  // 引线
  line(ctx, x - 8 * k, y, x, y, '#B9BFC4', 2 * k)
  line(ctx, x + len, y, x + len + 8 * k, y, '#B9BFC4', 2 * k)
  // 瓷体
  const g = ctx.createLinearGradient(0, y - bodyH / 2, 0, y + bodyH / 2)
  g.addColorStop(0, '#F1E7CE')
  g.addColorStop(0.45, '#E3D3AF')
  g.addColorStop(1, '#C9B58C')
  ctx.fillStyle = g
  rr(ctx, x, y - bodyH / 2, len, bodyH, bodyH * 0.42)
  ctx.fill()
  ctx.strokeStyle = '#A9946C'
  ctx.lineWidth = 0.8
  ctx.stroke()
  // 色环
  const bw = Math.max(3 * k, bodyH * 0.26)
  bands.forEach((c, i) => {
    ctx.fillStyle = c
    rr(ctx, x + len * (0.16 + i * 0.16), y - bodyH / 2 + 0.6, bw, bodyH - 1.2, 1.5)
    ctx.fill()
  })
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  rr(ctx, x + 2 * k, y - bodyH * 0.34, len - 4 * k, bodyH * 0.22, bodyH * 0.1)
  ctx.fill()
  ctx.restore()
}

/** 二极管：黑色塑封 + 银色阴极环，阳极在左 */
export function drawDiodeBoard(ctx, p, k) {
  drawBoard(ctx, p)
  T(ctx, '二极管（黑表笔接 ＋ 端才导通）', p.x + 14 * k, p.y + 16 * k, {
    size: Math.round(11 * k), bold: true, color: '#25313A',
  })

  const cy = p.y + p.h * 0.62
  const xa = p.x + p.w * 0.14
  const xk = p.x + p.w * 0.36
  drawPost(ctx, xa, cy, Math.max(4, 5.4 * k), '#1A1A1A')
  drawPost(ctx, xk, cy, Math.max(4, 5.4 * k), '#B58A4E')

  const bx = xa + 12 * k
  const bw = xk - xa - 24 * k
  const bh = Math.max(11, 13 * k)
  line(ctx, xa + 6 * k, cy, bx, cy, '#B9BFC4', 2 * k)
  line(ctx, bx + bw, cy, xk - 6 * k, cy, '#B9BFC4', 2 * k)
  const g = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2)
  g.addColorStop(0, '#4B5158')
  g.addColorStop(0.45, '#22262B')
  g.addColorStop(1, '#0E1114')
  ctx.fillStyle = g
  rr(ctx, bx, cy - bh / 2, bw, bh, bh * 0.28)
  ctx.fill()
  // 阴极银环
  ctx.fillStyle = '#D6DCE1'
  rr(ctx, bx + bw * 0.74, cy - bh / 2, Math.max(2.5, 3 * k), bh, 1)
  ctx.fill()
  // 极性丝印
  T(ctx, '＋', xa, cy - 18 * k, { size: Math.round(10 * k), color: '#C62828', align: 'center', bold: true })
  T(ctx, '－', xk, cy - 18 * k, { size: Math.round(10 * k), color: '#4B5A66', align: 'center', bold: true })
  // 符号
  const symX = p.x + p.w * 0.56
  ctx.strokeStyle = '#6B7A83'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(symX, cy)
  ctx.lineTo(symX + 8 * k, cy - 6 * k)
  ctx.lineTo(symX + 8 * k, cy + 6 * k)
  ctx.closePath()
  ctx.stroke()
  line(ctx, symX + 8 * k, cy - 6 * k, symX + 8 * k, cy + 6 * k, '#6B7A83', 1.2)
  line(ctx, symX - 8 * k, cy, symX, cy, '#6B7A83', 1.2)
  line(ctx, symX + 8 * k, cy, symX + 16 * k, cy, '#6B7A83', 1.2)
  T(ctx, '阳极 → 阴极', symX + 4 * k, cy + 18 * k, { size: Math.round(9 * k), color: '#6B7A83', align: 'center' })
  T(ctx, '正向电阻小 / 反向 ∞', p.x + p.w * 0.56, p.y + p.h * 0.22, {
    size: Math.round(9 * k), color: '#4B5A66',
  })

  return { posts: { da: { x: xa, y: cy, r: Math.max(6, 7.5 * k) }, dk: { x: xk, y: cy, r: Math.max(6, 7.5 * k) } } }
}

/** 软导线（二次贝塞尔，bow 控制弯曲方向与幅度） */
function cable(ctx, a, b2, color, k, bow = 0) {
  const dx = b2.x - a.x
  const dy = b2.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const cx = (a.x + b2.x) / 2 - dy * bow
  const cy = (a.y + b2.y) / 2 + dx * bow
  ctx.save()
  ctx.lineCap = 'round'
  // 阴影
  ctx.strokeStyle = 'rgba(20,30,36,0.16)'
  ctx.lineWidth = Math.max(2.4, 3.6 * k)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y + 1.4 * k)
  ctx.quadraticCurveTo(cx, cy + 1.4 * k, b2.x, b2.y + 1.4 * k)
  ctx.stroke()
  // 线身
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(2, 2.8 * k)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.quadraticCurveTo(cx, cy, b2.x, b2.y)
  ctx.stroke()
  // 高光
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = Math.max(0.6, 0.9 * k)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y - 1 * k)
  ctx.quadraticCurveTo(cx, cy - 1 * k, b2.x, b2.y - 1 * k)
  ctx.stroke()
  void len
  ctx.restore()
}

/** 小灯泡电路板：电池 + 灯泡 + 闸刀 + 测流断口（铜排可点开） */
export function drawBulbBoard(ctx, p, k, st = {}) {
  drawBoard(ctx, p)
  const jumper = st.jumperClosed !== false
  const closed = !!st.closed
  const lit = st.lit || 0

  T(ctx, '小灯泡电路（带测流断口）', p.x + 14 * k, p.y + 16 * k, {
    size: Math.round(11 * k), bold: true, color: '#25313A',
  })
  const on = lit > 0.05
  T(ctx, on ? '开关已合，灯亮' : closed ? '开关已合，电路断开' : '开关断开', p.x + p.w - 14 * k, p.y + 16 * k, {
    size: Math.round(9.5 * k), color: on ? '#15803D' : '#8A9AA4', align: 'right',
  })

  // —— 器材位置 ——
  const batt = { cx: p.x + p.w * 0.16, cy: p.y + p.h * 0.78, w: p.w * 0.20, h: p.h * 0.24 }
  const bulb = { cx: p.x + p.w * 0.52, cy: p.y + p.h * 0.28, r: p.w * 0.050 }
  const sw = { cx: p.x + p.w * 0.45, cy: p.y + p.h * 0.80, w: p.w * 0.17 }
  const brk = { x: p.x + p.w * 0.84, y1: p.y + p.h * 0.38, y2: p.y + p.h * 0.56 }

  // 电池组
  drawBatteryPack(ctx, batt, k, closed)
  // 灯泡
  drawBulb(ctx, bulb, k, lit)
  // 闸刀
  drawSwitchArtLocal(ctx, sw, k, closed)
  // 断口
  drawBreak(ctx, brk, k, jumper)

  // —— 导线 ——
  const bw = batt.w
  const bPos = { x: batt.cx + bw * 0.34, y: batt.cy - batt.h }
  const bNeg = { x: batt.cx - bw * 0.34, y: batt.cy - batt.h }
  const bulbL = { x: bulb.cx - bulb.r * 0.62, y: bulb.cy + bulb.r * 1.15 }
  const bulbR = { x: bulb.cx + bulb.r * 0.62, y: bulb.cy + bulb.r * 1.15 }
  const swL = { x: sw.cx - sw.w * 0.30, y: sw.cy - 2 * k }
  const swR = { x: sw.cx + sw.w * 0.30, y: sw.cy - 2 * k }

  cable(ctx, bPos, bulbL, '#8E1B15', k, 0.30)
  cable(ctx, bulbR, { x: brk.x, y: brk.y1 }, '#8E1B15', k, 0.06)
  cable(ctx, { x: brk.x, y: brk.y2 }, swL, '#1A1A1A', k, -0.08)
  cable(ctx, swR, bNeg, '#1A1A1A', k, 0.16)

  // 接线柱（表笔目标）
  drawPost(ctx, bulbL.x, bulbL.y, Math.max(4, 5 * k), '#1A1A1A')
  drawPost(ctx, bulbR.x, bulbR.y, Math.max(4, 5 * k), '#C62828')
  drawPost(ctx, brk.x, brk.y1, Math.max(4, 5 * k), '#C62828')
  drawPost(ctx, brk.x, brk.y2, Math.max(4, 5 * k), '#1A1A1A')

  T(ctx, '灯泡两端（测电压并联）', bulb.cx, bulb.cy - bulb.r * 2.1, {
    size: Math.round(9 * k), color: '#4B5A66', align: 'center',
  })
  T(ctx, jumper ? '测流断口：点铜排打开' : '断口已打开：表笔串进去测电流', brk.x, brk.y2 + 22 * k, {
    size: Math.round(8.8 * k), color: jumper ? '#4B5A66' : '#C2410C', align: 'center',
  })
  T(ctx, '闸刀：点一下合 / 断', sw.cx, sw.cy + 22 * k, {
    size: Math.round(8.8 * k), color: '#6B7A83', align: 'center',
  })

  return {
    posts: {
      bulbL: { x: bulbL.x, y: bulbL.y, r: Math.max(6, 7.5 * k) },
      bulbR: { x: bulbR.x, y: bulbR.y, r: Math.max(6, 7.5 * k) },
      brk1: { x: brk.x, y: brk.y1, r: Math.max(6, 7.5 * k) },
      brk2: { x: brk.x, y: brk.y2, r: Math.max(6, 7.5 * k) },
    },
    switchHit: { x: sw.cx - sw.w * 0.55, y: sw.cy - 34 * k, w: sw.w * 1.1, h: 46 * k },
    jumperHit: { x: brk.x - 15 * k, y: brk.y1 - 4 * k, w: 30 * k, h: brk.y2 - brk.y1 + 8 * k },
    bulb,
  }
}

function drawBatteryPack(ctx, b, k, on) {
  const w = b.w
  const h = b.h
  const x = b.cx - w / 2
  const y = b.cy - h
  ctx.save()
  ctx.fillStyle = 'rgba(20,34,30,0.18)'
  rr(ctx, x + 3, y + 5, w, h, 8)
  ctx.fill()
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#3A4652')
  g.addColorStop(1, '#16202A')
  ctx.fillStyle = g
  rr(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.lineWidth = 1
  ctx.stroke()
  // 两节电池
  const cw = w * 0.34
  for (const dx of [-cw * 0.6, cw * 0.6]) {
    const gx = b.cx + dx - cw / 2
    ctx.fillStyle = '#DDE4E8'
    rr(ctx, gx, y + h * 0.10, cw, h * 0.52, 4)
    ctx.fill()
    ctx.fillStyle = '#1565C0'
    rr(ctx, gx + cw * 0.16, y + h * 0.12, cw * 0.44, h * 0.48, 2)
    ctx.fill()
    ctx.fillStyle = '#C58A3C'
    rr(ctx, gx + cw * 0.74, y + h * 0.22, cw * 0.18, h * 0.28, 2)
    ctx.fill()
  }
  // 接线柱
  const py = y - 2 * k
  const px1 = b.cx - w * 0.34
  const px2 = b.cx + w * 0.34
  drawPost(ctx, px1, py, Math.max(4, 4.8 * k), '#1A1A1A')
  drawPost(ctx, px2, py, Math.max(4, 4.8 * k), '#C62828')
  T(ctx, '−', px1, py - 12 * k, { size: Math.round(9 * k), color: '#E6ECF0', align: 'center' })
  T(ctx, '+', px2, py - 12 * k, { size: Math.round(9 * k), color: '#FFD6D2', align: 'center' })
  T(ctx, '2 节干电池 3 V', b.cx, y + h * 0.80, {
    size: Math.round(9 * k), color: on ? '#FFFFFF' : 'rgba(255,255,255,0.8)', align: 'center', bold: true,
  })
  ctx.restore()
}

function drawBulb(ctx, b, k, lit) {
  ctx.save()
  if (lit > 0.02) {
    const gr = b.r * (2.6 + lit)
    const glow = ctx.createRadialGradient(b.cx, b.cy, b.r * 0.2, b.cx, b.cy, gr)
    glow.addColorStop(0, `rgba(255,214,120,${0.55 * lit})`)
    glow.addColorStop(0.5, `rgba(255,190,80,${0.22 * lit})`)
    glow.addColorStop(1, 'rgba(255,190,80,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(b.cx, b.cy, gr, 0, Math.PI * 2)
    ctx.fill()
  }
  // 玻璃泡
  const g = ctx.createRadialGradient(b.cx - b.r * 0.4, b.cy - b.r * 0.5, b.r * 0.2, b.cx, b.cy, b.r)
  g.addColorStop(0, lit > 0.15 ? 'rgba(255,246,214,0.95)' : 'rgba(255,255,255,0.80)')
  g.addColorStop(1, 'rgba(206,222,228,0.55)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,140,150,0.55)'
  ctx.lineWidth = 1
  ctx.stroke()
  // 灯丝
  ctx.strokeStyle = lit > 0.1 ? '#FFF1B0' : '#8A7A55'
  ctx.lineWidth = Math.max(1.2, 1.5 * k)
  ctx.beginPath()
  ctx.moveTo(b.cx - b.r * 0.30, b.cy + b.r * 0.55)
  for (let i = 0; i <= 6; i += 1) {
    const xx = b.cx - b.r * 0.30 + (b.r * 0.60) * (i / 6)
    const yy = b.cy + b.r * (i % 2 ? 0.10 : 0.32)
    ctx.lineTo(xx, yy)
  }
  ctx.lineTo(b.cx + b.r * 0.30, b.cy + b.r * 0.55)
  ctx.stroke()
  // 灯座
  ctx.fillStyle = '#9AA3AA'
  rr(ctx, b.cx - b.r * 0.34, b.cy + b.r * 0.55, b.r * 0.68, b.r * 0.55, 3)
  ctx.fill()
  ctx.fillStyle = '#6E777E'
  rr(ctx, b.cx - b.r * 0.40, b.cy + b.r * 1.02, b.r * 0.80, b.r * 0.26, 3)
  ctx.fill()
  ctx.restore()
}

function drawSwitchArtLocal(ctx, sw, k, closed) {
  const w = sw.w
  // 底座
  ctx.fillStyle = 'rgba(40,54,44,0.20)'
  rr(ctx, sw.cx - w / 2 + 2, sw.cy - 12 * k + 3, w, 14 * k, 4)
  ctx.fill()
  const g = ctx.createLinearGradient(0, sw.cy - 12 * k, 0, sw.cy + 2 * k)
  g.addColorStop(0, '#6D4C41')
  g.addColorStop(1, '#462C24')
  ctx.fillStyle = g
  rr(ctx, sw.cx - w / 2, sw.cy - 12 * k, w, 14 * k, 4)
  ctx.fill()
  const px1 = sw.cx - w * 0.30
  const px2 = sw.cx + w * 0.30
  drawPost(ctx, px1, sw.cy, Math.max(3.4, 4 * k), '#B58A4E')
  drawPost(ctx, px2, sw.cy, Math.max(3.4, 4 * k), '#B58A4E')
  const tipY = closed ? sw.cy - 3 * k : sw.cy - 30 * k
  ctx.strokeStyle = closed ? '#E2B34B' : '#C9962F'
  ctx.lineWidth = Math.max(2.6, 3.4 * k)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(px1, sw.cy - 2 * k)
  ctx.lineTo(closed ? px2 : px2 - 3 * k, tipY)
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.fillStyle = '#D32F2F'
  ctx.beginPath()
  ctx.arc(closed ? px2 : px2 - 3 * k, tipY, Math.max(3, 3.8 * k), 0, Math.PI * 2)
  ctx.fill()
}

function drawBreak(ctx, brk, k, jumper) {
  const r = Math.max(4, 5 * k)
  drawPost(ctx, brk.x, brk.y1, r, '#C62828')
  drawPost(ctx, brk.x, brk.y2, r, '#1A1A1A')
  if (jumper) {
    const g = ctx.createLinearGradient(brk.x - 7 * k, 0, brk.x + 7 * k, 0)
    g.addColorStop(0, '#8C5A28')
    g.addColorStop(0.35, '#D08A44')
    g.addColorStop(0.62, '#F4C079')
    g.addColorStop(1, '#8C5A28')
    ctx.fillStyle = g
    rr(ctx, brk.x - 7 * k, brk.y1 - 2 * k, 14 * k, brk.y2 - brk.y1 + 4 * k, 5 * k)
    ctx.fill()
    ctx.strokeStyle = 'rgba(70,42,14,0.55)'
    ctx.lineWidth = 1
    ctx.stroke()
    // 上端小提手，暗示“可掰开”
    ctx.fillStyle = '#B8742F'
    rr(ctx, brk.x - 9 * k, brk.y1 - 8 * k, 18 * k, 6 * k, 3 * k)
    ctx.fill()
    T(ctx, '铜排', brk.x + 15 * k, (brk.y1 + brk.y2) / 2, {
      size: Math.round(8.5 * k), color: '#8C5A28', bold: true,
    })
  } else {
    // 打开：两柱之间空出缺口，画一点电火花似的虚线
    ctx.save()
    ctx.strokeStyle = 'rgba(198,40,40,0.55)'
    ctx.lineWidth = Math.max(1, 1.2 * k)
    ctx.setLineDash([4 * k, 4 * k])
    ctx.beginPath()
    ctx.moveTo(brk.x, brk.y1 + 6 * k)
    ctx.lineTo(brk.x, brk.y2 - 6 * k)
    ctx.stroke()
    ctx.restore()
    T(ctx, '断口', brk.x + 15 * k, (brk.y1 + brk.y2) / 2, {
      size: Math.round(8.5 * k), color: '#B3261E', bold: true,
    })
  }
}

/** 表笔架 + 短接片 */
export function drawProbeDock(ctx, p, k) {
  drawBoard(ctx, p)
  T(ctx, '表笔架 · 短接片', p.x + 12 * k, p.y + 14 * k, {
    size: Math.round(9.5 * k), color: '#6B7A83', bold: true,
  })
  // 两个笔夹
  const c1 = { x: p.x + p.w * 0.18, y: p.y + p.h * 0.60 }
  const c2 = { x: p.x + p.w * 0.38, y: p.y + p.h * 0.60 }
  for (const c of [c1, c2]) {
    ctx.fillStyle = '#C9CFD4'
    rr(ctx, c.x - 7 * k, c.y - 4 * k, 14 * k, 8 * k, 4)
    ctx.fill()
    ctx.fillStyle = '#8E979E'
    rr(ctx, c.x - 3 * k, c.y - 10 * k, 6 * k, 14 * k, 2)
    ctx.fill()
  }
  // 短接片
  const pad = { x: p.x + p.w * 0.70, y: p.y + p.h * 0.58, r: Math.max(10, p.w * 0.055) }
  const g = ctx.createLinearGradient(pad.x - pad.r, pad.y, pad.x + pad.r, pad.y)
  g.addColorStop(0, '#AEB6BD')
  g.addColorStop(0.4, '#EEF2F5')
  g.addColorStop(1, '#98A2AA')
  ctx.fillStyle = g
  rr(ctx, pad.x - pad.r, pad.y - pad.r * 0.42, pad.r * 2, pad.r * 0.84, 6)
  ctx.fill()
  ctx.strokeStyle = '#7C868E'
  ctx.lineWidth = 1
  ctx.stroke()
  T(ctx, 'Ω 调零：两笔都放这儿', p.x + p.w - 12 * k, p.y + p.h - 10 * k, {
    size: Math.round(8.5 * k), color: '#6B7A83', align: 'right',
  })
  return {
    rest: [c1, c2],
    pad: { x: pad.x, y: pad.y, r: pad.r * 0.9 },
  }
}
