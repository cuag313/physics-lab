/**
 * engine/electricLab.js — 电学虚拟实验室电路求解（纯计算，零 UI 依赖）
 *
 * 移植自 D:\仿真物理（dp）\物理电学虚拟实验室.html 的物理逻辑：
 *   节点法（电导矩阵 MNA）+ 高斯消元（列主元）。
 *
 * 约定：
 *   comps: [{ id, type, closed?, f?, rmax?, pos?, dials?, mode?, blown? }]
 *     type ∈ battery | bulb | switch | ammeter | voltmeter | rheostat
 *          | resistor5 | resistor10 | resistor15 | switch2 | motor | diode
 *          | fuse | testPencil | electroscope | resBox | multimeter | relay | mains
 *     closed —— 开关通断；f ∈ [0,1]、rmax —— 滑动变阻器接入比例与最大阻值
 *     pos —— 单刀双掷：0=com 接 a，1=com 接 b；dials —— 电阻箱拨盘 [×1k,×100,×10,×1]
 *     mode —— 多用电表档位 'V' | 'A' | 'Ω'；blown —— 保险丝已熔断（持久状态，场景写回）
 *   wires: [{ id, a:'cid:tid', b:'cid:tid' }]
 *   返回值 keyed by comp id: { _I, _V, _P, _rev, _over }
 *     _I 电流(A)  _V 电压(V)  _P 功率(W)  _rev 接反  _over 超量程
 *   扩展读数：_on(二极管导通) _blown(保险丝熔断) _glow(氖管发光) _R(电阻)
 *     _coilI(继电器线圈电流) _pulled(继电器吸合) _fs(量程)
 */

/** 电路参数（与源实验一致） */
export const CFG = {
  VS: { V: 3.0, r: 0.1 },       // 电池组：电动势 3V，内阻 0.1Ω
  ACC_V: 12,                     // 蓄电池电动势 12V
  BULB_R: 5.0,                  // 灯泡电阻
  BULB_RATED: 1.8,              // 灯泡额定功率（亮度 100%）
  AMM_R: 0.01,                  // 电流表内阻
  VOLT_R: 1e7,                  // 电压表内阻
  AMM_FS: 0.6,                  // 电流量程（0.6A 柱）
  AMM_FS_2: 0.5,                // 中心零位电流表（−500~500 那台，两柱）：满偏 0.5A，指针左右各半
  VOLT_FS: 3.0,                 // 电压量程
  RHEO_MAX: 10,                 // 滑动变阻器最大阻值
  // ── 补充器材（初中必做 / 家庭电路 / 高中拓展）──
  DIODE_VF: 2.0,                // 发光二极管正向导通压降（V）
  DIODE_RF: 4,                  // 正向动态电阻（Ω）
  DIODE_RR: 1e9,                // 反向截止电阻（Ω）
  MOTOR_R: 4.0,                 // 小电动机线圈电阻（Ω）
  FUSE_R: 0.02,                 // 保险丝冷态电阻（Ω）
  FUSE_OPEN_R: 1e8,             // 熔断后断口电阻（Ω）
  FUSE_RATING: 0.5,             // 保险丝额定熔断电流（A）
  PEN_R: 1.2e6,                 // 测电笔内阻：氖管 + 高值电阻（Ω）
  PEN_GLOW_V: 30,               // 氖管起辉电压（V，真值 ~60V，取 30V 便于演示）
  ELEC_R: 1e12,                 // 验电器泄漏电阻（Ω，近似绝缘）
  MM_V_R: 1e7,                  // 多用电表电压档内阻（Ω）
  MM_A_R: 0.01,                 // 多用电表电流档内阻（Ω）
  MM_OHM_V: 1.5,                // 欧姆档内置电源（V）
  MM_OHM_RI: 150,               // 欧姆档中值内阻（Ω）
  RELAY_COIL_R: 30,             // 继电器线圈电阻（Ω）
  RELAY_PULL_I: 0.05,           // 衔铁吸合电流（A）
  RELAY_CONTACT_R: 0.001,       // 触点闭合电阻（Ω）
  MAINS_V: 220,                 // 市电电压有效值（V，按直流等效建模）
  MAINS_R: 0.1,                 // 市电电源内阻（Ω）
  // 单相电能表：1↔3 是电流线圈（计量相线），2↔4 是零线直通
  METER_COIL_R: 0.02,           // 电流线圈电阻（Ω）
  METER_LINE_R: 0.001,          // 零线直通段电阻（Ω）
  // 焦耳定律 U 形管：两支管内各一段电阻丝串联，电流相同 → Q ∝ R
  JOULE_R1: 2,                  // 左管电阻丝（Ω）
  JOULE_R2: 4,                  // 右管电阻丝（Ω）
  JOULE_Q_FULL: 40,             // 液柱从初始升到满刻度所需热量（J），仅作显示标度
}

/** 电阻箱拨盘 → 阻值（dials: [×1k, ×100, ×10, ×1]，各位 0~9） */
export function resBoxOhms(dials) {
  const d = Array.isArray(dials) ? dials : [0, 0, 0, 0]
  const dig = (i) => Math.max(0, Math.min(9, Math.round(Number(d[i]) || 0)))
  return dig(0) * 1000 + dig(1) * 100 + dig(2) * 10 + dig(3)
}

/** 各类器材接线柱 id（求解拓扑与场景渲染共用） */
export const TERM_IDS = {
  battery: ['n', 'p'],
  accumulator: ['n', 'p'],
  bulb: ['a', 'b'],
  switch: ['a', 'b'],
  ammeter: ['neg', 'pos'],            // 中心零位 mA 表（−500~500 那台）：只有黑(−)/红(+)两柱，正反都能偏
  ammeterA: ['neg', 'mid', 'full'],  // 安培表（黑壳双刻度那台）：端子与电流表相同
  voltmeter: ['neg', 'mid', 'full'], // neg(黑) / mid(3V) / full(15V)
  rheostat: ['tl', 'tr', 'bl', 'br'],
  resistor5: ['a', 'b'],             // 定值电阻（色环电阻，长脚/短脚两柱）
  resistor10: ['a', 'b'],
  resistor15: ['a', 'b'],
  switch2: ['com', 'a', 'b'],        // 单刀双掷：com 刀闸，a/b 两个掷点
  motor: ['a', 'b'],                 // 小电动机：两接线柱
  diode: ['a', 'k'],                 // a=阳极（长脚） k=阴极（短脚）
  fuse: ['a', 'b'],                  // 保险丝：两端接线柱
  testPencil: ['tip', 'tail'],       // 测电笔：笔尖金属 / 笔尾金属体
  electroscope: ['cap', 'gnd'],      // 验电器：金属球 / 接地柱
  resBox: ['a', 'b'],                // 电阻箱：两接线柱
  multimeter: ['com', 'in'],         // 多用电表：com(黑) / in(红，V·Ω·A 共用)
  relay: ['ct1', 'ct2', 'ck1', 'ck2'], // 触点 ×2 + 线圈 ×2
  energyMeter: ['i1', 'i2', 'o1', 'o2'], // 单相电能表：1/2 进线，3/4 出线（1-3 电流线圈，2-4 零线直通）
  mains: ['n', 'l'],                 // 家庭电源：零线 N / 火线 L
  jouleTube: ['a', 'b'],             // 焦耳定律 U 形管：左管 R1、右管 R2 串联，a/b 两接线柱
}

const keyOf = (cid, tid) => cid + ':' + tid

/** 电表量程柱：full 优先（宽量程防误报过载），其次 mid；两柱表（只有 pos）返回 pos */
function meterRangeTap(c, wires) {
  const ids = TERM_IDS[c.type] || []
  for (const t of ['full', 'mid', 'pos']) {
    if (!ids.includes(t)) continue
    for (const w of wires) {
      if (w.a === keyOf(c.id, t) || w.b === keyOf(c.id, t)) return t
    }
  }
  return ids.includes('pos') ? 'pos' : 'mid'
}

function stampR(A, i, j, R) {
  const g = 1 / Math.max(R, 1e-6)
  A[i][i] += g
  A[j][j] += g
  A[i][j] -= g
  A[j][i] -= g
}

/** 列主元高斯消元 */
function gauss(A0, b0) {
  const n = b0.length
  const A = A0.map((r) => r.slice())
  const b = b0.slice()
  for (let i = 0; i < n; i++) {
    let p = i
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
    if (p !== i) {
      const t = A[i]; A[i] = A[p]; A[p] = t
      const tb = b[i]; b[i] = b[p]; b[p] = tb
    }
    const piv = A[i][i]
    if (Math.abs(piv) < 1e-18) continue
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / piv
      if (f === 0) continue
      for (let cc = i; cc < n; cc++) A[r][cc] -= f * A[i][cc]
      b[r] -= f * b[i]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let cc = i + 1; cc < n; cc++) s -= A[i][cc] * x[cc]
    const d = A[i][i]
    x[i] = Math.abs(d) > 1e-18 ? s / d : 0
  }
  return x
}

/**
 * 求解电路。返回 { [compId]: { _I,_V,_P,_rev,_over }, _wireI, diagnostics }
 * opts.noDiag —— 探针重解时跳过错误接法检测（避免递归）
 */
/**
 * 接线 → 等电位节点划分。
 * 滑变的 tl / tr 是同一根滑杆（等电位），先合并，再并入导线网络。
 * 求解器与伏安法判定共用这一份，避免两套并查集算出不同节点号。
 */
function buildNets(comps, wires) {
  const keys = []
  const idx = new Map()
  for (const c of comps) {
    for (const t of TERM_IDS[c.type] || []) {
      idx.set(keyOf(c.id, t), keys.length)
      keys.push(keyOf(c.id, t))
    }
  }
  const par = keys.map((_, i) => i)
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x] } return x }
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b }

  for (const c of comps) {
    if (c.type === 'rheostat') uni(idx.get(keyOf(c.id, 'tl')), idx.get(keyOf(c.id, 'tr')))
  }
  for (const w of wires) {
    const ia = idx.get(w.a)
    const ib = idx.get(w.b)
    if (ia === undefined || ib === undefined) continue
    uni(ia, ib)
  }

  const nmap = new Map()
  const net = (i) => { const r = find(i); if (!nmap.has(r)) nmap.set(r, nmap.size); return nmap.get(r) }
  const netOf = (c, tid) => {
    const i = idx.get(keyOf(c.id, tid))
    return i === undefined ? 0 : net(i)
  }
  const N = new Set(keys.map((_, i) => net(i))).size
  return { netOf, N }
}

export function solveCircuit(comps, wires, opts) {
  const out = {}
  for (const c of comps) out[c.id] = { _I: 0, _V: 0, _P: 0, _rev: false, _over: false }
  if (!comps.length) return out

  // ── 并查集求节点 ──
  const { netOf, N } = buildNets(comps, wires)
  if (N === 0) return out

  // ── 非线性/状态元件迭代：二极管（分段线性）· 电磁继电器（吸合判定）· 保险丝（过流熔断）──
  const dState = new Map() // diode id → 'open' | 'fwd'
  const rState = new Map() // relay id → true 衔铁吸合
  const fState = new Map() // fuse id → true 已熔断
  for (const c of comps) {
    if (c.type === 'diode') dState.set(c.id, 'open')
    if (c.type === 'relay') rState.set(c.id, false)
    if (c.type === 'fuse') fState.set(c.id, !!c.blown)
  }

  /** 元件支路电流（带符号：由 tA 端流入元件为正） */
  const elemI = (e, vv) => {
    if (e.kind === 'R') return (vv[e.a] - vv[e.b]) / e.R
    if (e.kind === 'D') return (vv[e.a] - vv[e.b] - e.V) / e.R // 二极管正向伴随源
    return (e.V - (vv[e.b] - vv[e.a])) / e.r
  }

  let v = null
  let els = []
  for (let iter = 0; iter < 5; iter++) {
    const A = Array.from({ length: N }, () => new Array(N).fill(0))
    const b = new Array(N).fill(0)
    for (let i = 0; i < N; i++) A[i][i] += 1e-10 // 微小对地泄漏，保证矩阵可解

    els = []
    for (const c of comps) {
    if (c.type === 'battery' || c.type === 'accumulator') {
      const a = netOf(c, 'n')
      const bb = netOf(c, 'p')
      const emf = c.type === 'accumulator' ? CFG.ACC_V : CFG.VS.V
      const g = 1 / CFG.VS.r
      A[a][a] += g; A[bb][bb] += g; A[a][bb] -= g; A[bb][a] -= g
      b[a] -= emf / CFG.VS.r
      b[bb] += emf / CFG.VS.r
      els.push({ kind: 'V', a, b: bb, V: emf, r: CFG.VS.r, comp: c, tA: 'n', tB: 'p' })
    } else if (c.type === 'bulb') {
      const a = netOf(c, 'a')
      const bb = netOf(c, 'b')
      stampR(A, a, bb, CFG.BULB_R)
      els.push({ kind: 'R', a, b: bb, R: CFG.BULB_R, comp: c, tA: 'a', tB: 'b' })
    } else if (c.type === 'switch') {
      const a = netOf(c, 'a')
      const bb = netOf(c, 'b')
      const R = c.closed ? 0.001 : 1e8
      stampR(A, a, bb, R)
      els.push({ kind: 'R', a, b: bb, R, comp: c, tA: 'a', tB: 'b' })
    } else if ((c.type === 'ammeter' || c.type === 'ammeterA')) {
      const tap = meterRangeTap(c, wires)
      const a = netOf(c, tap) // 接入的量程柱（+ 端）
      const bb = netOf(c, 'neg')
      const R = c._probeR ?? CFG.AMM_R // 探针求解开路电压/短路电流时覆盖内阻
      stampR(A, a, bb, R)
      els.push({ kind: 'R', a, b: bb, R, comp: c, tA: tap, tB: 'neg', fs: tap === 'full' ? 3 : tap === 'pos' ? CFG.AMM_FS_2 : CFG.AMM_FS })
    } else if (c.type === 'voltmeter') {
      const tap = meterRangeTap(c, wires)
      const a = netOf(c, tap) // 接入的量程柱（+ 端）
      const bb = netOf(c, 'neg')
      const R = c._probeR ?? CFG.VOLT_R
      stampR(A, a, bb, R)
      els.push({ kind: 'R', a, b: bb, R, comp: c, tA: tap, tB: 'neg', fs: tap === 'full' ? 15 : CFG.VOLT_FS })
    } else if (c.type === 'rheostat') {
      const bl = netOf(c, 'bl')
      const w = netOf(c, 'tl')
      const br = netOf(c, 'br')
      const rmax = c.rmax ?? CFG.RHEO_MAX
      const R1 = Math.max(c.f * rmax, 1e-4)
      const R2 = Math.max((1 - c.f) * rmax, 1e-4)
      stampR(A, bl, w, R1)
      stampR(A, w, br, R2)
      els.push({ kind: 'R', a: bl, b: w, R: R1, comp: c, tA: 'bl', tB: 'rod' })
      els.push({ kind: 'R', a: w, b: br, R: R2, comp: c, tA: 'rod', tB: 'br' })
    } else if (c.type === 'resistor5' || c.type === 'resistor10' || c.type === 'resistor15') {
      const R = c.r ?? (c.type === 'resistor5' ? 5 : c.type === 'resistor15' ? 15 : 10)
      const a = netOf(c, 'a')
      const bb = netOf(c, 'b')
      stampR(A, a, bb, R)
      els.push({ kind: 'R', a, b: bb, R, comp: c, tA: 'a', tB: 'b' })
    } else if (c.type === 'switch2') {
      // 单刀双掷：com 经闸刀接通 a（pos=0）或 b（pos=1），另一掷断开
      const com = netOf(c, 'com')
      const na = netOf(c, 'a')
      const nb = netOf(c, 'b')
      const pos = (c.pos ?? 0) === 1 ? 1 : 0
      const Ra = pos === 0 ? 0.001 : 1e8
      const Rb = pos === 1 ? 0.001 : 1e8
      stampR(A, com, na, Ra)
      stampR(A, com, nb, Rb)
      els.push({ kind: 'R', a: com, b: na, R: Ra, comp: c, tA: 'com', tB: 'a' })
      els.push({ kind: 'R', a: com, b: nb, R: Rb, comp: c, tA: 'com', tB: 'b' })
    } else if (c.type === 'motor') {
      const a = netOf(c, 'a')
      const bb = netOf(c, 'b')
      stampR(A, a, bb, CFG.MOTOR_R)
      els.push({ kind: 'R', a, b: bb, R: CFG.MOTOR_R, comp: c, tA: 'a', tB: 'b' })
    } else if (c.type === 'diode') {
      const a = netOf(c, 'a')
      const kk = netOf(c, 'k')
      if (dState.get(c.id) === 'fwd') {
        // 正向伴随模型：I = (V_ak − VF)/RF → 电导 1/RF + 电流源 ±VF/RF
        const g = 1 / CFG.DIODE_RF
        A[a][a] += g; A[kk][kk] += g; A[a][kk] -= g; A[kk][a] -= g
        b[a] += CFG.DIODE_VF * g
        b[kk] -= CFG.DIODE_VF * g
        els.push({ kind: 'D', a, b: kk, R: CFG.DIODE_RF, V: CFG.DIODE_VF, comp: c, tA: 'a', tB: 'k' })
      } else {
        stampR(A, a, kk, CFG.DIODE_RR)
        els.push({ kind: 'R', a, b: kk, R: CFG.DIODE_RR, comp: c, tA: 'a', tB: 'k' })
      }
    } else if (c.type === 'fuse') {
      const a = netOf(c, 'a')
      const bb = netOf(c, 'b')
      const R = fState.get(c.id) ? CFG.FUSE_OPEN_R : CFG.FUSE_R
      stampR(A, a, bb, R)
      els.push({ kind: 'R', a, b: bb, R, comp: c, tA: 'a', tB: 'b' })
    } else if (c.type === 'testPencil') {
      // 测电笔：氖管 + 高值电阻串在笔尖—笔尾之间
      const tip = netOf(c, 'tip')
      const tail = netOf(c, 'tail')
      stampR(A, tip, tail, CFG.PEN_R)
      els.push({ kind: 'R', a: tip, b: tail, R: CFG.PEN_R, comp: c, tA: 'tip', tB: 'tail' })
    } else if (c.type === 'electroscope') {
      // 验电器：金属球—箔片—外壳近似绝缘（1e12Ω），箔片张角取决于带电电位
      const cap = netOf(c, 'cap')
      const gg = netOf(c, 'gnd')
      stampR(A, cap, gg, CFG.ELEC_R)
      els.push({ kind: 'R', a: cap, b: gg, R: CFG.ELEC_R, comp: c, tA: 'cap', tB: 'gnd' })
    } else if (c.type === 'resBox') {
      const R = Math.max(resBoxOhms(c.dials), 1e-3)
      const a = netOf(c, 'a')
      const bb = netOf(c, 'b')
      stampR(A, a, bb, R)
      els.push({ kind: 'R', a, b: bb, R, comp: c, tA: 'a', tB: 'b' })
    } else if (c.type === 'multimeter') {
      const com = netOf(c, 'com')
      const inp = netOf(c, 'in')
      const mode = c.mode === 'A' || c.mode === 'Ω' ? c.mode : 'V'
      if (mode === 'A') {
        const R = c._probeR ?? CFG.MM_A_R
        stampR(A, com, inp, R)
        els.push({ kind: 'R', a: inp, b: com, R, comp: c, tA: 'in', tB: 'com', fs: 0.6 })
      } else if (mode === 'Ω') {
        // 欧姆档：内置 1.5V 电源 + 中值内阻（极性同电池：com=负、in=正）
        const g = 1 / CFG.MM_OHM_RI
        A[com][com] += g; A[inp][inp] += g; A[com][inp] -= g; A[inp][com] -= g
        b[com] -= CFG.MM_OHM_V * g
        b[inp] += CFG.MM_OHM_V * g
        els.push({ kind: 'V', a: com, b: inp, V: CFG.MM_OHM_V, r: CFG.MM_OHM_RI, comp: c, tA: 'com', tB: 'in' })
      } else {
        const R = c._probeR ?? CFG.MM_V_R
        stampR(A, com, inp, R)
        els.push({ kind: 'R', a: inp, b: com, R, comp: c, tA: 'in', tB: 'com', fs: 15 })
      }
    } else if (c.type === 'relay') {
      // 电磁继电器：线圈（ck1/ck2）吸合 → 触点（ct1/ct2）闭合
      const k1 = netOf(c, 'ck1')
      const k2 = netOf(c, 'ck2')
      const s1 = netOf(c, 'ct1')
      const s2 = netOf(c, 'ct2')
      stampR(A, k1, k2, CFG.RELAY_COIL_R)
      els.push({ kind: 'R', a: k1, b: k2, R: CFG.RELAY_COIL_R, comp: c, tA: 'ck1', tB: 'ck2', role: 'coil' })
      const closed = rState.get(c.id) || false
      const Rc = closed ? CFG.RELAY_CONTACT_R : 1e8
      stampR(A, s1, s2, Rc)
      els.push({ kind: 'R', a: s1, b: s2, R: Rc, comp: c, tA: 'ct1', tB: 'ct2', role: 'contact' })
    } else if (c.type === 'mains') {
      // 家庭电源 220V（有效值，按直流等效）：l=火线、n=零线
      const a = netOf(c, 'n')
      const bb = netOf(c, 'l')
      const g = 1 / CFG.MAINS_R
      A[a][a] += g; A[bb][bb] += g; A[a][bb] -= g; A[bb][a] -= g
      b[a] -= CFG.MAINS_V * g
      b[bb] += CFG.MAINS_V * g
      els.push({ kind: 'V', a, b: bb, V: CFG.MAINS_V, r: CFG.MAINS_R, comp: c, tA: 'n', tB: 'l' })
    } else if (c.type === 'energyMeter') {
      // 单相电能表：1↔3 串电流线圈（相线），2↔4 零线直通
      const p1 = netOf(c, 'i1')
      const p3 = netOf(c, 'o1')
      const n2 = netOf(c, 'i2')
      const n4 = netOf(c, 'o2')
      stampR(A, p1, p3, CFG.METER_COIL_R)
      els.push({ kind: 'R', a: p1, b: p3, R: CFG.METER_COIL_R, comp: c, tA: 'i1', tB: 'o1', role: 'coil' })
      stampR(A, n2, n4, CFG.METER_LINE_R)
      els.push({ kind: 'R', a: n2, b: n4, R: CFG.METER_LINE_R, comp: c, tA: 'i2', tB: 'o2', role: 'line' })
    } else if (c.type === 'jouleTube') {
      // 焦耳定律 U 形管：左管 R1、右管 R2 串在同一支路，电流相同 → Q ∝ R
      const a = netOf(c, 'a')
      const bb = netOf(c, 'b')
      const R = CFG.JOULE_R1 + CFG.JOULE_R2
      stampR(A, a, bb, R)
      els.push({ kind: 'R', a, b: bb, R, comp: c, tA: 'a', tB: 'b' })
    }
    }

    // 接地：节点 0 电位置 0
    for (let j = 0; j < N; j++) A[0][j] = 0
    A[0][0] = 1
    b[0] = 0

    v = gauss(A, b)
    for (const e of els) e.I = elemI(e, v)

    // ── 状态收敛：二极管导通方向 / 继电器吸合 / 保险丝熔断 ──
    let changed = false
    for (const c of comps) {
      if (c.type === 'diode') {
        const e = els.find((x) => x.comp === c)
        const vk = e ? v[e.a] - v[e.b] : 0
        const want = vk > CFG.DIODE_VF ? 'fwd' : 'open'
        if (want !== dState.get(c.id)) { dState.set(c.id, want); changed = true }
      } else if (c.type === 'relay') {
        const coil = els.find((x) => x.comp === c && x.role === 'coil')
        const want = coil ? Math.abs(coil.I) >= CFG.RELAY_PULL_I : false
        if (want !== rState.get(c.id)) { rState.set(c.id, want); changed = true }
      } else if (c.type === 'fuse') {
        const e = els.find((x) => x.comp === c)
        if (!fState.get(c.id) && e && Math.abs(e.I) > CFG.FUSE_RATING * 1.05) {
          fState.set(c.id, true)
          changed = true
        }
      }
    }
    if (!changed) break
  }

  // ── 各元件电流 / 读数 ──
  for (const e of els) {
    const I = e.I // 迭代收敛后已算好（带符号：由 tA 端流入元件为正）
    const c = e.comp
    const o = out[c.id]
    if (c.type === 'bulb') {
      o._I = Math.abs(I)
      o._P = I * I * CFG.BULB_R
    } else if ((c.type === 'ammeter' || c.type === 'ammeterA')) {
      o._I = I // 电流由接入的量程柱（+ 端）流入为正
      o._Vd = v[e.a] - v[e.b] // 电流表两端电压差
      o._rev = I < -1e-6
      o._fs = e.fs ?? CFG.AMM_FS
      o._over = Math.abs(I) > o._fs * 1.001
    } else if (c.type === 'voltmeter') {
      o._V = v[e.a] - v[e.b] // + 端相对 − 端电压
      o._Iv = I // 流过电压表的电流
      o._rev = o._V < -1e-6
      o._fs = e.fs ?? CFG.VOLT_FS
      o._over = Math.abs(o._V) > o._fs * 1.001
    } else if (c.type === 'battery' || c.type === 'accumulator' || c.type === 'mains') {
      o._I = I
      // 端电压 = 电动势 − 内阻分压；短路时 I 很大，端电压趋近 0（这是「短路为什么危险」的教学点）
      const emf = c.type === 'mains' ? CFG.MAINS_V : c.type === 'accumulator' ? CFG.ACC_V : CFG.VS.V
      const rIn = c.type === 'mains' ? CFG.MAINS_R : CFG.VS.r
      o._V = Math.abs(v[e.b] - v[e.a])
      o._Ir = Math.abs(I) * rIn
      o._emf = emf
    } else if (c.type === 'rheostat') {
      // 滑变被拆成 R1(bl→杆) / R2(杆→br) 两个串联电阻，逐段写回；
      // 取两者较大值：滑块停在某端时另一段的电流≈0，若直接覆盖会把「线圈有电流」抹成 0
      o._I = Math.max(o._I || 0, Math.abs(I))
    } else if (c.type === 'resistor5' || c.type === 'resistor10' || c.type === 'resistor15') {
      o._I = Math.abs(I)
      o._R = e.R
      o._P = I * I * e.R
    } else if (c.type === 'switch2') {
      o._I = Math.max(o._I, Math.abs(I)) // 刀闸 + 两个掷点共 2 支路，取大者
      o._pos = (c.pos ?? 0) === 1 ? 1 : 0
    } else if (c.type === 'motor') {
      o._I = Math.abs(I)
      o._P = I * I * CFG.MOTOR_R
    } else if (c.type === 'diode') {
      o._I = Math.abs(I)
      o._Vd = v[e.a] - v[e.b]
      o._on = dState.get(c.id) === 'fwd' && Math.abs(I) > 1e-6
    } else if (c.type === 'fuse') {
      o._I = Math.abs(I)
      o._blown = !!fState.get(c.id)
      o._over = !o._blown && Math.abs(I) > CFG.FUSE_RATING * 1.05
    } else if (c.type === 'testPencil') {
      o._V = v[e.a] - v[e.b]
      o._glow = Math.abs(o._V) >= CFG.PEN_GLOW_V
    } else if (c.type === 'electroscope') {
      o._V = Math.abs(v[e.a] - v[e.b])
    } else if (c.type === 'resBox') {
      o._I = Math.abs(I)
      o._R = e.R
    } else if (c.type === 'multimeter') {
      const mode = c.mode === 'A' || c.mode === 'Ω' ? c.mode : 'V'
      if (mode === 'A') {
        o._I = I
        o._fs = e.fs ?? 0.6
        o._over = Math.abs(I) > o._fs * 1.001
      } else if (mode === 'Ω') {
        const vterm = v[e.b] - v[e.a] // in 相对 com
        o._R = Math.abs(I) > 1e-9 ? Math.abs(vterm / I) : Infinity
      } else {
        o._V = v[e.a] - v[e.b] // in 相对 com
        o._fs = e.fs ?? 15
        o._over = Math.abs(o._V) > o._fs * 1.001
      }
    } else if (c.type === 'relay') {
      if (e.role === 'coil') {
        o._coilI = Math.abs(I)
        o._pulled = !!rState.get(c.id)
      } else {
        o._I = Math.abs(I)
      }
    } else if (c.type === 'energyMeter') {
      // 只取电流线圈那一路；零线直通段的电流不是计量量
      if (e.role === 'coil') {
        o._I = Math.abs(I)
        o._Vd = Math.abs(v[e.a] - v[e.b])
      }
    } else if (c.type === 'jouleTube') {
      o._I = Math.abs(I)
      o._R1 = CFG.JOULE_R1
      o._R2 = CFG.JOULE_R2
      // 瞬时功率，热量由场景按时间积分（Q = I²Rt），引擎本身无时间状态
      o._P1 = I * I * CFG.JOULE_R1
      o._P2 = I * I * CFG.JOULE_R2
    }
  }

  // ── 每根导线的带符号电流（导线电流动画用）──
  // 端口 KCL 叶传播：元件电流已知，逐线求解；变阻器金属杆 tl/tr 归并为同一「rod」桶
  out._wireI = computeWireCurrents(comps, wires, els)

  // ── 错误接法检测（solve 后）──
  if (!opts || !opts.noDiag) {
    out.diagnostics = detectMisuse(comps, wires, out)
  }
  // ── 伏安法测电阻的系统误差（内接 / 外接）──
  const va = voltammetry(comps, wires, out)
  if (va.length) out._va = va
  return out
}

/** 伏安法可测的定值电阻与标称值 */
export const VOLTAMMETRY_R = { resistor5: 5, resistor10: 10, resistor15: 15 }

/**
 * 伏安法测电阻的系统误差：判「内接 / 外接」，给出测量值与真实值的偏差。
 *
 *   内接 —— 电压表跨在 R + 电流表 上：表读数含电流表内阻分压，R测 = R + R_A，偏大
 *   外接 —— 电压表只并在 R 上，电流表读的是 R ∥ R_V 的总电流，R测 = R∥R_V，偏小
 *
 * 判据是节点关系而不是数值：看电压表两柱落在哪两个等电位节点上。
 * 接法不成立（电压表并在电源两端、电流表不在 R 边上等）时返回空，不乱报。
 */
export function voltammetry(comps, wires, out) {
  const { netOf } = buildNets(comps, wires)
  const am = comps.find((c) => (c.type === 'ammeter' || c.type === 'ammeterA'))
  const vm = comps.find((c) => c.type === 'voltmeter')
  if (!am || !vm) return []

  const aSet = new Set([netOf(am, meterRangeTap(am, wires)), netOf(am, 'neg')])
  const vSet = new Set([netOf(vm, meterRangeTap(vm, wires)), netOf(vm, 'neg')])
  if (aSet.size === 1 || vSet.size === 1) return [] // 两柱短接在一处，读数无意义

  const list = []
  for (const c of comps) {
    const R = VOLTAMMETRY_R[c.type]
    if (!R) continue
    const rSet = new Set([netOf(c, 'a'), netOf(c, 'b')])
    if (rSet.size === 1) continue

    let mode = null
    if (vSet.size === rSet.size && [...vSet].every((k) => rSet.has(k))) {
      mode = 'external'
      // 外接还要求电流表紧挨着这只电阻（否则它测的是别的支路的总电流）
      if (![...aSet].some((k) => rSet.has(k))) mode = null
    } else {
      const shared = [...vSet].filter((k) => rSet.has(k))
      const outer = [...vSet].filter((k) => !rSet.has(k))
      if (shared.length === 1 && outer.length === 1) {
        const otherR = [...rSet].find((k) => k !== shared[0])
        if (aSet.has(outer[0]) && aSet.has(otherR)) mode = 'internal'
      }
    }
    if (!mode) continue

    const U = Math.abs(out?.[vm.id]?._V || 0)
    const I = Math.abs(out?.[am.id]?._I || 0)
    if (!(U > 1e-6) || !(I > 1e-6)) continue
    const measured = U / I
    list.push({
      id: c.id,
      type: c.type,
      trueR: R,
      measured,
      mode,
      errorPct: ((measured - R) / R) * 100,
    })
  }
  return list
}

/** 端口流分析：返回 { [wireId]: 带符号电流 }，正=沿 wire a→b 方向 */
function computeWireCurrents(comps, wires, els) {
  const compById = new Map(comps.map((c) => [c.id, c]))
  // 端口桶 key：变阻器 tl/tr → 'rod'
  const bucketOf = (cid, tid) => {
    const c = compById.get(cid)
    if (c && c.type === 'rheostat' && (tid === 'tl' || tid === 'tr')) return cid + ':rod'
    return cid + ':' + tid
  }
  // 端口 KCL 右端：流入元件的电流
  const load = new Map() // bucket → flow into element
  const addLoad = (k, v) => load.set(k, (load.get(k) || 0) + v)
  for (const e of els) {
    const I = e.I || 0
    const cid = e.comp.id
    if (e.kind === 'V') { addLoad(bucketOf(cid, e.tA), I); addLoad(bucketOf(cid, e.tB), -I) }
    else { addLoad(bucketOf(cid, e.tA), I); addLoad(bucketOf(cid, e.tB), -I) }
  }
  // 导线挂到桶上
  const at = new Map() // bucket → [{ wid, sign }]  sign:+1 导线 a 端在此桶
  const attach = (k, wid, sign) => {
    if (!at.has(k)) at.set(k, [])
    at.get(k).push({ wid, sign })
  }
  wires.forEach((w) => {
    const [c1, t1] = w.a.split(':')
    const [c2, t2] = w.b.split(':')
    attach(bucketOf(+c1, t1), w.id, +1)
    attach(bucketOf(+c2, t2), w.id, -1)
  })
  // 叶传播：某桶只剩一根未知导线 → 由 KCL 定出
  const X = new Map() // wid → 电流（a→b 为正）
  const remaining = new Map()
  for (const [k, list] of at) remaining.set(k, list.filter((e) => !X.has(e.wid)).length)
  let changed = true
  while (changed) {
    changed = false
    for (const [k, list] of at) {
      const unsolved = list.filter((e) => !X.has(e.wid))
      if (unsolved.length !== 1) continue
      const e = unsolved[0]
      let sum = 0
      for (const o of list) if (X.has(o.wid)) sum += o.sign * X.get(o.wid)
      // KCL：load + Σ sign·X = 0
      X.set(e.wid, e.sign * (-(load.get(k) || 0) - sum))
      changed = true
    }
  }
  // 残留（导线成环）→ 0
  for (const w of wires) if (!X.has(w.id)) X.set(w.id, 0)
  return Object.fromEntries(X)
}

/** 错误接法检测：电流表并联 / 电压表串干路 / 电源短路 */
function detectMisuse(comps, wires, out) {
  const diag = { short: false, ammeterParallel: false, voltmeterSeries: false }
  for (const c of comps) {
    if ((c.type === 'battery' || c.type === 'accumulator') && Math.abs(out[c.id]?._I || 0) > 1.2) diag.short = true
    if (c.type === 'mains' && Math.abs(out[c.id]?._I || 0) > 15) diag.short = true
    if ((c.type === 'ammeter' || c.type === 'ammeterA')) {
      // 未串在支路（与另一元件同节点对 = 被并联在元件两端）且两端电位差 > 0.5V
      const par = sharesPair(comps, wires, c)
      if (par) {
        const probe = probeSolve(comps, wires, c.id, 1e7) // 探针：取电流表开路端电压
        const voc = Math.abs(probe[c.id]?._Vd || out[c.id]?._Vd || 0)
        if (voc > 0.5) diag.ammeterParallel = true
      }
    }
    if (c.type === 'voltmeter') {
      const par = sharesPair(comps, wires, c)
      if (!par) {
        const probe = probeSolve(comps, wires, c.id, 1e-4) // 探针：短接该表时所在支路电流
        const isc = Math.abs(probe[c.id]?._Iv || 0)
        if (isc > 0.01) diag.voltmeterSeries = true
      }
    }
  }
  return diag
}

/** 是否有另一元件与该元件接在同一对节点上（被并联在元件两端） */
function sharesPair(comps, wires, target) {
  const keyOf2 = (cid, tid) => cid + ':' + tid
  // 同 pair 判定：两个端子都被导线合并到与另一元件相同的一对网络
  const touched = (cid) => {
    const s = new Set()
    for (const w of wires) {
      if (w.a.startsWith(cid + ':')) s.add(w.a)
      if (w.b.startsWith(cid + ':')) s.add(w.b)
    }
    return s
  }
  const t = touched(target.id)
  if (t.size < 2) return false
  for (const c of comps) {
    if (c.id === target.id) continue
    const o = touched(c.id)
    if (o.size < 2) continue
    // 粗判：目标两端子均与对方元件端子有公共导线网（经导线可达同网）
    // 这里用「两元件端子被导线直接/间接并到同一对桶」的简化判定：任两端子同网即视为同节点对
    const nets = new Set()
    // 用 union-find 于导线层面判定两元件是否共享两个节点对
    const parent = new Map()
    const find = (x) => { if (!parent.has(x)) parent.set(x, x); if (parent.get(x) !== x) parent.set(x, find(parent.get(x))); return parent.get(x) }
    const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
    for (const w of wires) uni(w.a, w.b)
    if (c.type === 'rheostat') { uni(keyOf2(c.id, 'tl'), keyOf2(c.id, 'tr')) }
    if (target.type === 'rheostat') { uni(keyOf2(target.id, 'tl'), keyOf2(target.id, 'tr')) }
    let shared = 0
    for (const x of t) for (const y of o) if (find(x) === find(y)) shared++
    if (shared >= 2) return true
    nets.clear()
  }
  return false
}

/** 探针重解：把某元件内阻换成 probeR，取其读数（开路电压 / 短路支路电流） */
function probeSolve(comps, wires, compId, probeR) {
  const mod = comps.map((c) => (c.id === compId ? { ...c, _probeR: probeR } : c))
  return solveCircuit(mod, wires, { noDiag: true })
}

/** 状态栏摘要（纯文本片段，与源实验的状态条语义一致） */
export function circuitStatus(comps, wires, out) {
  const bat = comps.filter((c) => c.type === 'battery' || c.type === 'accumulator' || c.type === 'mains')
  const switches = comps.filter((c) => c.type === 'switch')
  const bulbs = comps.filter((c) => c.type === 'bulb')
  const amms = comps.filter((c) => (c.type === 'ammeter' || c.type === 'ammeterA'))
  const vms = comps.filter((c) => c.type === 'voltmeter')
  const rh = comps.filter((c) => c.type === 'rheostat')
  const fuses = comps.filter((c) => c.type === 'fuse')
  const relays = comps.filter((c) => c.type === 'relay')
  const parts = []

  let shorted = false
  for (const c of bat) {
    const lim = c.type === 'mains' ? 15 : 1.2
    if (Math.abs(out[c.id]?._I || 0) > lim) shorted = true
  }
  if (shorted) parts.push({ tone: 'bad', text: '⚠ 电源短路！电流过大，请检查导线连接' })

  const maxI = bat.length ? Math.max(...bat.map((c) => Math.abs(out[c.id]?._I || 0))) : 0
  if (maxI > 1e-4) {
    parts.push({ tone: 'ok', text: '电路接通' })
    parts.push({ text: `干路电流 ${maxI.toFixed(3)} A` })
  } else {
    const opened = switches.find((s) => !s.closed)
    if (bat.length && switches.length && opened) parts.push({ tone: 'warn', text: '开关断开 · 电路不通' })
    else if (bat.length) parts.push({ tone: 'warn', text: '电路未接通（回路不完整或断路）' })
    else parts.push({ tone: 'warn', text: '电路中还没有电源' })
  }

  if (bulbs.length) {
    const b = out[bulbs[0].id]
    const pct = Math.round(Math.min(1, (b?._P || 0) / CFG.BULB_RATED) * 100)
    parts.push({ text: `灯泡亮度 ${(b?._P || 0) > 0.001 ? pct + '%' : '不发光'}` })
  }
  if (rh.length) {
    const r = rh[0]
    parts.push({ text: `变阻器接入 ${((r.f ?? 0) * (r.rmax ?? CFG.RHEO_MAX)).toFixed(1)} Ω` })
  }
  if (amms.length) {
    const a = out[amms[0].id]
    parts.push({
      text: `电流表 ${Math.abs(a?._I || 0).toFixed(3)} A`,
      tone2: a?._rev ? 'bad:接线柱接反' : a?._over ? 'bad:超量程' : '',
    })
  }
  if (vms.length) {
    const m = out[vms[0].id]
    parts.push({
      text: `电压表 ${Math.abs(m?._V || 0).toFixed(3)} V`,
      tone2: m?._rev ? 'bad:接线柱接反' : m?._over ? 'bad:超量程' : '',
    })
  }
  for (const f of fuses) {
    const fo = out[f.id] || {}
    if (fo._blown) parts.push({ tone: 'bad', text: '⚠ 保险丝熔断，电路断路（双击换新）' })
    else if ((fo._I || 0) > 0.01) parts.push({ text: `保险丝电流 ${fo._I.toFixed(2)} A` })
  }
  if (relays.length) {
    const anyPulled = relays.some((r) => out[r.id]?._pulled)
    parts.push({
      tone: anyPulled ? 'ok' : 'warn',
      text: anyPulled ? '继电器吸合 · 触点闭合' : '继电器释放 · 触点断开',
    })
  }
  return parts
}
