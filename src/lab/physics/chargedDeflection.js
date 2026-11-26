/**
 * chargedDeflection — 带电粒子在电场中的偏转（示波管）与速度选择器
 *
 * 全部用 SI 单位算，界面再把结果换成 mm / ns / kV 显示。
 * 电子在平行板间做「类平抛」：水平匀速 v₀，竖直匀加速 a=qE/m=qU/(md)。
 * 出板后无场：沿出射速度方向做匀速直线（不能再画成抛物线）。
 */

export const E_CHARGE = 1.602176634e-19
export const M_ELECTRON = 9.1093837015e-31

/** 加速电压 Ua 决定进入偏转板的速度：½mv₀² = eUa */
export function speedFromAccel(Ua) {
  return Math.sqrt((2 * E_CHARGE * Math.max(0, Ua)) / M_ELECTRON)
}

/**
 * 平行板偏转（U > 0 记为上板为正 → 场强向下 → 电子受力向上，y 取向上为正）
 * @param {object} p Ua[V] U[V] L[m] d[m] D[m]（D = 板右端到荧光屏的距离）
 */
export function deflectionSolve({ Ua, U, L, d, D }) {
  const v0 = speedFromAccel(Ua)
  const E = U / Math.max(d, 1e-6)                    // V/m，正 = 指向下板
  const a = (E_CHARGE * E) / M_ELECTRON              // m/s²，电子受力与 E 反向 → 取正为上偏
  const t1 = v0 > 0 ? L / v0 : 0                     // 板内时间
  const y1 = 0.5 * a * t1 * t1                       // 出板处竖直位移（向上为正）
  const vy = a * t1                                  // 出板时竖直速度
  const half = d / 2
  const hit = Math.abs(y1) >= half ? (y1 > 0 ? 'up' : 'down') : 'none'
  // 撞板就停在板上，不再往后算
  const t2 = hit === 'none' && v0 > 0 ? D / v0 : 0
  const y2 = hit === 'none' ? y1 + vy * t2 : y1
  const theta = Math.atan2(Math.abs(vy), v0)
  const vExit = Math.hypot(v0, vy)
  return {
    v0, E, a, t1, y1, vy, theta, vExit,
    t2, y2, hit,
    y2mm: y2 * 1000, y1mm: y1 * 1000, Lmm: L * 1000, dmm: d * 1000, Dmm: D * 1000,
  }
}

/**
 * 沿电场方向的直线加速 / 减速（匀强电场，初速度 v₀ 沿板长方向射入）
 * 电子受力 F = eE（方向与 E 反向），加速度 a = eE/m；
 * 位移 x = v₀t + ½at²，速度 v = v₀ + at；用动能定理 qU = ½mv² − ½mv₀² 校验末速度。
 * @param {object} p v0[m/s] E[V/m] L[m]（板长/沿场方向的运动距离）
 * @returns {{v1, a, t, x, v1Kin, decel:boolean, stop:boolean}}
 */
export function accelSolve({ v0, E, a: aIn, L }) {
  const a = aIn !== undefined ? aIn : (E_CHARGE * E) / M_ELECTRON   // 电子基准；显式 a 时按粒子荷质比
  const tFull = v0 > 0 ? L / v0 : 0
  let t = tFull
  let x = L
  // 减速（a 与 v0 反向）：板内能否在板长内减到 0，由 v₀² + 2aL ≤ 0 判定（动能定理口径）
  const stop = a < 0 && v0 > 0 && v0 * v0 + 2 * a * L <= 0
  if (stop) {
    t = -v0 / a
    x = v0 * t + 0.5 * a * t * t
  }
  // 末速度由动能定理 v₁² = v₀² + 2aL 给出；减速未停住记负号表示方向，停住记 0
  let v1
  if (stop) {
    v1 = 0
  } else {
    v1 = Math.sqrt(Math.max(0, v0 * v0 + 2 * a * L))
    if (a < 0) v1 = -v1
  }
  // 动能定理校验值：板内停住时按实际位移 x 给理论末速度
  const v1Kin = Math.sqrt(Math.max(0, v0 * v0 + 2 * a * x))
  return { v1, a, t, x, v1Kin, decel: a < 0, stop }
}

/** 板内抛物线取样：u∈[0,1] 对应 x=u·L */
export function inPlatePoint(sol, u) {
  const t = sol.t1 * u
  return { x: sol.v0 * t, y: 0.5 * sol.a * t * t }
}

/**
 * 速度选择器：E⊥B，只有 v = E/B 的粒子能直线穿过
 * 电子受力 F = −e(E + v×B)；取 E 向下（正）、B 垂直纸面向里，则
 *   dvx/dt = ω·vy，dvy/dt = ω·(E/B − vx)，ω = eB/m
 * @returns {{pts:{x:number,y:number}[], yAtScreen:number, hit:string, straight:boolean, vMatch:number}}
 */
export function selectorPath({ U, d, L, D, B, v0, samples = 600, q = -1, m = 1 }) {
  const E = U / Math.max(d, 1e-6)
  const vMatch = B > 0 ? E / B : Infinity
  // 相对电子荷质比（电子 q=-1, m=1）：ω=qB/m 为回旋角频率，取正保旋向；纯电场加速度 a=qE/m 符号随电荷
  const qm = Math.abs((q / m) / (-1 / 1))
  const omega = ((E_CHARGE * B) / M_ELECTRON) * qm
  const pureA = ((E_CHARGE * E) / M_ELECTRON) * ((q / m) / (-1 / 1))
  let x = 0, y = 0, vx = v0, vy = 0
  const dt = v0 > 0 ? (L / v0) / samples : 0
  const pts = [{ x, y }]
  let hit = 'none'
  for (let i = 0; i < samples; i++) {
    if (B > 0) {
      // 半步 RK2，够准也够快
      const ax1 = omega * vy
      const ay1 = omega * (vMatch - vx)
      const vxM = vx + ax1 * dt * 0.5, vyM = vy + ay1 * dt * 0.5
      const ax2 = omega * vyM
      const ay2 = omega * (vMatch - vxM)
      vx += ax2 * dt
      vy += ay2 * dt
    } else {
      // B=0：只剩匀强电场，竖直匀加速（vx 不变）
      vy += pureA * dt
    }
    x += vx * dt
    y += vy * dt
    pts.push({ x, y })
    if (Math.abs(y) >= d / 2) { hit = y > 0 ? 'up' : 'down'; break }
  }
  if (hit === 'none') {
    const t2 = v0 > 0 ? (D - (x - L)) / v0 : 0
    y += vy * t2
  }
  const straight = Math.abs(vy) < 1e-3 * Math.max(v0, 1) && Math.abs(y) < d * 0.02
  return { pts, yAtScreen: y, hit, straight, vMatch, E, omega }
}

/** 出板后直线：从出板点沿出射速度方向延伸到屏（世界 mm 坐标） */
export function outPlatePoint(sol, s) {
  return {
    x: sol.Lmm + s,               // s 是板右端往后的毫米
    y: sol.y1mm + (sol.vy * (s / 1000)) / Math.max(sol.v0, 1e-9) * 1000,
  }
}
