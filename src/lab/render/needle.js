/**
 * needle.js — 指针动力学（渲染层·电表表盘）
 *
 * 真实磁电式电表的指针不是"跳变"到读数，而是一根带惯性的弹性摆：
 *   指针偏转角 x 受游丝回复力矩（∝ 目标角 - 当前角）与空气/电磁阻尼作用，
 *   表现为二阶系统  x'' = k*(target - x) - c*x'。
 * 取阻尼比 ζ≈0.55（欠阻尼），就会出现真实表头那一下"过冲再摆正"的动作。
 *
 * 这里是纯数值模块，不碰 canvas：场景每帧调用 stepNeedle 拿当前偏转比例。
 */

/** 每个表盘的独立状态：{ x: 当前偏转比例, v: 角速度 } */
const states = new Map()

/** 刚度（越大越"硬"，响应越快） */
const K = 165
/** 阻尼比：0.55 轻微过冲，最像真表 */
const ZETA = 0.55
const C = 2 * Math.sqrt(K) * ZETA
/** 机械止挡：指针最多越界这么多（0.05 = 满量程的 5%） */
const PEG_LOW = -0.06
const PEG_HIGH = 1.05

function getState(key) {
  let s = states.get(key)
  if (!s) {
    s = { x: 0, v: 0 }
    states.set(key, s)
  }
  return s
}

/**
 * 推进一个表盘指针的物理状态
 * @param {string|number} key 表盘唯一标识（元件 id + 量程）
 * @param {number} target 目标偏转比例（0 = 零位，1 = 满量程）
 * @param {number} dt 帧间隔（秒）
 * @param {object} o {snap: 立刻到位（切换量程/重置时用）}
 * @returns {number} 当前偏转比例
 */
export function stepNeedle(key, target, dt, o = {}) {
  const s = getState(key)
  if (o.snap) {
    s.x = target
    s.v = 0
    return s.x
  }
  // 帧率抖动保护：单帧最多按 1/30s 积分
  const step = Math.min(Math.max(dt || 0.016, 0), 1 / 30)
  // 细分步长，保证 ζ 较高时也不发散
  const sub = Math.max(1, Math.ceil(step / 0.004))
  const h = step / sub
  for (let i = 0; i < sub; i++) {
    const a = K * (target - s.x) - C * s.v
    s.v += a * h
    s.x += s.v * h
    // 打表（撞止挡）：速度归零，形成"啪"地贴住的观感
    if (s.x > PEG_HIGH) {
      s.x = PEG_HIGH
      if (s.v > 0) s.v = 0
    } else if (s.x < PEG_LOW) {
      s.x = PEG_LOW
      if (s.v < 0) s.v = 0
    }
  }
  return s.x
}

/** 取当前值，不推进时间（用于暂停/重绘） */
export function peekNeedle(key) {
  return getState(key).x
}

/** 重置所有指针（重置电路时调用） */
export function resetNeedles() {
  states.clear()
}

/** 删除某个元件的指针状态（元件被删除时调用） */
export function dropNeedle(key) {
  states.delete(key)
}

/**
 * 电流表/电压表的量程表（教学表常见规格）
 *   A：0~0.6A（分度 0.02A）/ 0~3A（分度 0.1A）
 *   V：0~3V（分度 0.1V）/ 0~15V（分度 0.5V）
 * 分度值用于画刻度与读数位数，保证"读数严格匹配量程"。
 */
export const METER_SCALES = {
  ammeter: [
    { range: 0.6, divisions: 30, minor: 0.02, digits: 2 },
    { range: 3, divisions: 30, minor: 0.1, digits: 1 },
  ],
  voltmeter: [
    { range: 3, divisions: 30, minor: 0.1, digits: 1 },
    { range: 15, divisions: 30, minor: 0.5, digits: 1 },
  ],
}

/** 按种类与量程值查表规格 */
export function scaleSpec(kind, range) {
  const list = METER_SCALES[kind] || METER_SCALES.voltmeter
  return list.find((s) => s.range === range) || list[0]
}

/** 自动选量程：读数不超过 80% 满量程的最小档 */
export function autoRange(kind, value) {
  const list = METER_SCALES[kind] || METER_SCALES.voltmeter
  const v = Math.abs(value || 0)
  const ordered = [...list].sort((a, b) => a.range - b.range)
  for (const s of ordered) if (v <= s.range * 0.8) return s.range
  return ordered[ordered.length - 1].range
}
