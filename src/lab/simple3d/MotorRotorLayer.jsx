import { useEffect, useRef, useState } from 'react'
import { TYPES } from '../scenes/electricSvgInstruments.js'

/**
 * 小电动机转子层（线圈 + 两条引线 + 换向器 + 碳刷），自己跑 rAF 真转。
 *
 * 为什么必须单独一层：器材卡片是每 ~250ms 用 dangerouslySetInnerHTML 重建的字符串，
 * 字符串里的 CSS / SMIL 动画每次都被重建回起始帧 —— 看上去就是"根本不转"。
 * 所以卡片让开（render 时传 dyn.hideRotor: true，只画定子/底座/接线柱），
 * 这里把转子按每帧转角重画一遍，与整场景重渲染解耦。
 *
 * 转角逻辑完全照 NB（audit/nb_motor/ElecMotors_module.js）：
 *     luna.rotation += t;  lunb.rotation = luna.rotation
 * 线圈绕自己圆心 (101.4, 82)、换向器绕自己圆心 (101.4, 153.5)，同一个 deg ——
 * 换向器外径恒定，所以转起来外沿始终压在两侧碳刷上；半周后红蓝两片在电刷下互换 = 换向。
 *
 * props:
 *   cid  —— 与卡片同源的 defs 前缀（TYPES.motor.render 里用的是 `esmm${c.id}`，必须一致，
 *          否则转子借用的红/蓝渐变 id 找不到）
 *   I    —— 电机电流（有符号，A）；|I| ≤ 0.02 视为未通电，停在上一角度不动
 *   dir  —— 转向（接线柱接反 → -1）
 */
export default function MotorRotorLayer({ cid, I = 0, dir = 1, style }) {
  const phase = useRef(0)
  const [, setTick] = useState(0)
  const live = Math.abs(I) > 0.02
  useEffect(() => {
    if (!live) return undefined
    let raf = 0
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      /* 转速 ∝ 电功率，与卡片上的转速标度一致：w = 1.9 + 2.2·min(1.4, |I|) rad/s */
      const w = 1.9 + 2.2 * Math.min(1.4, Math.abs(I))
      phase.current += dt * w * ((I < 0 ? -1 : 1) * (dir < 0 ? -1 : 1))
      setTick((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [live, I, dir])

  const t = TYPES.motor
  if (!t || !t.rotorBody) return null
  const deg = (phase.current * 180) / Math.PI
  return (
    <div className="esb-motorrotor" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', ...style }}>
      <svg viewBox={`0 0 ${t.w} ${t.h}`} width="100%" height="100%">
        <g dangerouslySetInnerHTML={{ __html: t.rotorBody(cid, deg) }} />
        {/* 碳刷压在换向器前面（不随转子转） */}
        <g dangerouslySetInnerHTML={{ __html: t.brushBody() }} />
      </svg>
    </div>
  )
}
